/**
 * js/dashboard.js
 * Logic Dashboard: Stats, Charts, Recent Table, Filters, Early Warning & Mini Map
 * ✅ Chart.js v3 Compatible ✅ Safe Destroy ✅ Error Handling Robust ✅ Mini Map All Risks
 */

// State global
let dashboardData = [];
let currentFilters = {};
const DEBUG = false; // Set true untuk debug, false untuk production

// Store chart instances properly
let chartInstances = {
  tren: null,
  kategori: null
};

// Store mini map instance
let miniMapInstance = null;
let miniMapMarkersGroup = null;

// ==========================================
// 1. INIT & FETCH DATA
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  if (DEBUG) console.log('🚀 Initializing dashboard...');
  
  // Pastikan Chart.js loaded
  if (typeof Chart === 'undefined') {
    console.error('❌ Chart.js not loaded!');
    window.app?.showToast?.('Gagal memuat library grafik', 'error');
    return;
  }
  
  await initDashboard();
  setupFilters();
  await loadKecamatanFilter();
  setupDashboardModal();
});

async function initDashboard() {
  try {
    showLoadingState();
    
    if (DEBUG) console.log('📡 Fetching dashboard data from Supabase...');
    await fetchDashboardData();
    
    if (DEBUG) console.log('✅ Data fetched, rendering components...');
    renderStats(dashboardData);
    await initCharts(dashboardData);
    renderRecentTable(dashboardData);
    updateEarlyWarning(dashboardData);
    
    // ✅ Init mini map SETELAH data siap
    initMiniMap();
    
  } catch (err) {
    console.error('❌ Dashboard init error:', err);
    window.app?.showToast?.('Gagal memuat dashboard: ' + err.message, 'error');
  }
}

async function fetchDashboardData(filters = {}) {
  try {
    currentFilters = { ...filters };
    const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
    
    // ✅ QUERY: Ambil data yang diperlukan untuk dashboard
    let query = window.sbClient
      .from('conflict_reports')
      .select(`
        id, judul, kategori, tingkat_risiko, status, created_at,
        alamat_lokasi, kecamatan_id, lokasi_lat, lokasi_lng,
        kecamatan (id, nama),
        profiles (nama_lengkap)
      `, { count: 'exact' })
      .order('created_at', { ascending: false });
    
    // Apply filters
    if (filters.kecamatan_id) query = query.eq('kecamatan_id', parseInt(filters.kecamatan_id));
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.kategori) query = query.eq('kategori', filters.kategori);
    if (filters.tingkat_risiko) query = query.eq('tingkat_risiko', filters.tingkat_risiko);
    if (filters.date_from) query = query.gte('created_at', filters.date_from);
    if (filters.date_to) query = query.lte('created_at', filters.date_to);
    
    // RLS filter for operator kecamatan
    if (user.role === 'operator_kec' && user.kecamatan_id) {
      query = query.eq('kecamatan_id', user.kecamatan_id);
    }
    
    // Limit 5 untuk recent table
    query = query.limit(5);
    
    const { data, error, count } = await query;
    
    if (error) {
      console.error('❌ Supabase query error:', error);
      throw new Error(`Database error: ${error.message}`);
    }
    
    // ✅ Format data: fallback ke alamat_lokasi jika desa join tidak ada
    dashboardData = (data || []).map(d => ({
      id: d.id,
      tgl: d.created_at,
      judul: d.judul,
      kec: d.kecamatan?.nama || '-',
      desa: d.alamat_lokasi ? d.alamat_lokasi.split(',')[0].trim() : '-',
      kat: d.kategori || 'Lainnya',
      risiko: d.tingkat_risiko || 'Sedang',
      status: d.status,
      pelapor: d.profiles?.nama_lengkap || 'Anonim',
      _raw: d
    }));
    
    if (DEBUG) console.log(`✅ Fetched ${dashboardData.length} records`);
    return dashboardData;
    
  } catch (err) {
    console.error('❌ fetchDashboardData error:', err);
    
    // Fallback: simple query tanpa join jika gagal
    try {
      const { data: fallbackData } = await window.sbClient
        .from('conflict_reports')
        .select('id, judul, kategori, tingkat_risiko, status, created_at, alamat_lokasi')
        .limit(5)
        .order('created_at', { ascending: false });
      
      if (fallbackData) {
        dashboardData = fallbackData.map(d => ({
          id: d.id,
          tgl: d.created_at,
          judul: d.judul,
          kec: '-',
          desa: d.alamat_lokasi ? d.alamat_lokasi.split(',')[0].trim() : '-',
          kat: d.kategori || 'Lainnya',
          risiko: d.tingkat_risiko || 'Sedang',
          status: d.status,
          pelapor: '-',
          _raw: d
        }));
        return dashboardData;
      }
    } catch (e) {
      console.warn('⚠️ Fallback also failed');
    }
    
    throw err;
  }
}

function showLoadingState() {
  ['statTotal', 'statProses', 'statSelesai', 'statMerah'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '...';
  });
  
  const tbody = document.getElementById('tableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center">⏳ Memuat data...</td></tr>';
}

// ==========================================
// 📊 RENDER STATS
// ==========================================
function renderStats(data) {
  const total = data?.length || 0;
  const diproses = data?.filter(d => d.status === 'diproses')?.length || 0;
  const selesai = data?.filter(d => d.status === 'selesai')?.length || 0;
  const kritis = data?.filter(d => d.risiko === 'Kritis' || d.risiko === 'Tinggi')?.length || 0;
  
  animateValue('statTotal', 0, total, 500);
  animateValue('statProses', 0, diproses, 500);
  animateValue('statSelesai', 0, selesai, 500);
  animateValue('statMerah', 0, kritis, 500);
}

function animateValue(id, start, end, duration) {
  const obj = document.getElementById(id);
  if (!obj) return;
  
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.textContent = Math.floor(progress * (end - start) + start);
    if (progress < 1) window.requestAnimationFrame(step);
  };
  window.requestAnimationFrame(step);
}

// ==========================================
// 📈 CHARTS - Chart.js v3 Compatible
// ==========================================
function safeDestroyChart(chartKey) {
  try {
    const chart = chartInstances[chartKey];
    if (chart && typeof chart.destroy === 'function') {
      chart.destroy();
      chartInstances[chartKey] = null;
      if (DEBUG) console.log(`🗑️ Chart ${chartKey} destroyed`);
    }
  } catch (err) {
    console.warn(`⚠️ Failed to destroy chart ${chartKey}:`, err);
  }
}

async function initCharts(data) {
  await initTrenChart();
  await initKategoriChart(data);
}

async function initTrenChart() {
  const ctx = document.getElementById('chartTren');
  if (!ctx) return;
  
  try {
    safeDestroyChart('tren');
    
    // Fetch trend data (30 days)
    const { data: trenData, error } = await window.sbClient
      .from('conflict_reports')
      .select('created_at')
      .gte('created_at', new Date(Date.now() - 30*24*60*60*1000).toISOString())
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    
    // Prepare labels & values (last 7 days)
    const dateMap = {};
    for (let i = 6; i >= 0; i--) {
      const date = new Date(Date.now() - i*24*60*60*1000);
      const key = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
      dateMap[key] = 0;
    }
    
    trenData?.forEach(d => {
      const date = new Date(d.created_at);
      const key = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
      if (dateMap[key] !== undefined) dateMap[key]++;
    });
    
    chartInstances.tren = new Chart(ctx, {
      type: 'line',
      data: {
        labels: Object.keys(dateMap),
        datasets: [{
          label: 'Laporan Masuk',
          data: Object.values(dateMap),
          borderColor: '#1e40af',
          backgroundColor: 'rgba(30, 64, 175, 0.1)',
          tension: 0.3,
          fill: true,
          pointRadius: 3,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    });
    
    if (DEBUG) console.log('✅ Tren chart initialized');
    
  } catch (err) {
    console.error('❌ Gagal load chart tren:', err);
    safeDestroyChart('tren');
  }
}

async function initKategoriChart(data) {
  const ctx = document.getElementById('chartKategori');
  if (!ctx) return;
  
  try {
    safeDestroyChart('kategori');
    
    const kategoriCount = { 'SARA': 0, 'Ekonomi': 0, 'Politik': 0, 'Bencana': 0, 'Lainnya': 0 };
    
    data?.forEach(d => {
      const kat = d.kat || 'Lainnya';
      if (kategoriCount[kat] !== undefined) {
        kategoriCount[kat]++;
      } else {
        kategoriCount['Lainnya']++;
      }
    });
    
    chartInstances.kategori = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: Object.keys(kategoriCount),
        datasets: [{
          data: Object.values(kategoriCount),
          backgroundColor: ['#dc2626', '#059669', '#1e40af', '#f59e0b', '#64748b'],
          borderWidth: 2,
          borderColor: '#fff',
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { 
          legend: { position: 'bottom', labels: { usePointStyle: true, padding: 12 } },
          tooltip: { enabled: true }
        },
        cutout: '65%'
      }
    });
    
    if (DEBUG) console.log('✅ Kategori chart initialized');
    
  } catch (err) {
    console.error('❌ Gagal load chart kategori:', err);
    safeDestroyChart('kategori');
  }
}

// ==========================================
// 📋 RECENT TABLE
// ==========================================
function renderRecentTable(data) {
  const tbody = document.getElementById('tableBody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Belum ada laporan.</td></tr>';
    return;
  }
  
  data.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>#${item.id}</strong></td>
      <td>${window.app?.formatDate?.(item.tgl) || item.tgl}</td>
      <td>
        <strong>${item.kec}</strong><br>
        <small class="text-muted">${item.desa}</small>
      </td>
      <td>${item.kat}</td>
      <td><span class="risiko-badge ${window.app?.getRisikoClass?.(item.risiko) || ''}">${window.app?.formatRisiko?.(item.risiko) || item.risiko}</span></td>
      <td><span class="status-badge ${window.app?.getStatusClass?.(item.status) || ''}">${window.app?.formatStatus?.(item.status) || item.status}</span></td>
      <td><button class="btn-action" onclick="viewReportDetail(${item.id})">👁️ Detail</button></td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// 👁️ MODAL DETAIL LAPORAN (Dashboard)
// ==========================================
window.viewReportDetail = async (id) => {
  try {
    const { data, error } = await window.sbClient
      .from('conflict_reports')
      .select(`*, kecamatan (nama)`)
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    const modal = document.getElementById('modalLaporanDetail');
    const modalTitle = document.getElementById('modalLaporanTitle');
    const modalBody = document.getElementById('modalLaporanBody');
    
    if (!modal || !modalTitle || !modalBody) {
      console.warn('⚠️ Modal elements not found, falling back to redirect');
      window.location.href = `laporan.html?report_id=${id}`;
      return;
    }
    
    modalTitle.textContent = `Laporan #${data.id}: ${data.judul}`;
    
    modalBody.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem">
        <div><span class="meta-label" style="color:#64748b;font-size:0.85rem">Tanggal</span><br><strong>${window.app?.formatDate?.(data.created_at) || data.created_at}</strong></div>
        <div><span class="meta-label" style="color:#64748b;font-size:0.85rem">Status</span><br><strong>${window.app?.formatStatus?.(data.status) || data.status}</strong></div>
        <div><span class="meta-label" style="color:#64748b;font-size:0.85rem">Kategori</span><br><strong>${data.kategori || 'Lainnya'}</strong></div>
        <div><span class="meta-label" style="color:#64748b;font-size:0.85rem">Risiko</span><br><strong style="color:${getRisikoColor(data.tingkat_risiko)}">${window.app?.formatRisiko?.(data.tingkat_risiko) || data.tingkat_risiko}</strong></div>
        <div><span class="meta-label" style="color:#64748b;font-size:0.85rem">Lokasi</span><br><strong>${data.kecamatan?.nama || '-'}, ${data.alamat_lokasi || '-'}</strong></div>
        <div><span class="meta-label" style="color:#64748b;font-size:0.85rem">Pelapor</span><br><strong>${data.profiles?.nama_lengkap || 'Anonim'}</strong></div>
        ${data.lokasi_lat ? `<div><span class="meta-label" style="color:#64748b;font-size:0.85rem">Koordinat</span><br><strong>${parseFloat(data.lokasi_lat).toFixed(4)}, ${parseFloat(data.lokasi_lng).toFixed(4)}</strong></div>` : ''}
      </div>
      
      <div style="margin-bottom:1rem">
        <strong>📝 Deskripsi:</strong>
        <p style="margin:0.5rem 0;padding:0.75rem;background:#f8fafc;border-radius:8px;line-height:1.5;color:#1e293b">
          ${data.deskripsi || '-'}
        </p>
      </div>
      
      ${data.foto_url ? `
        <div>
          <strong>🖼️ Bukti:</strong>
          <div style="margin-top:0.5rem">
            <a href="${data.foto_url}" target="_blank" class="btn-outline btn-sm">🔗 Lihat Bukti</a>
          </div>
        </div>
      ` : ''}
    `;
    
    const btnLihatLengkap = document.getElementById('btnLihatLengkap');
    if (btnLihatLengkap) {
      btnLihatLengkap.onclick = () => {
        modal.classList.add('d-none');
        window.location.href = `laporan.html?report_id=${id}`;
      };
    }
    
    modal.classList.remove('d-none');
    
  } catch (err) {
    console.error('Gagal load detail:', err);
    window.app?.showToast?.('Gagal memuat detail laporan', 'error');
    window.location.href = `laporan.html?report_id=${id}`;
  }
};

// Helper: Warna risiko untuk modal
function getRisikoColor(risiko) {
  const colors = { 'Kritis': '#991b1b', 'Tinggi': '#dc2626', 'Sedang': '#eab308', 'Rendah': '#22c55e' };
  return colors[risiko] || '#eab308';
}

// ==========================================
// 🚨 EARLY WARNING
// ==========================================
function updateEarlyWarning(data) {
  const banner = document.getElementById('earlyWarning');
  const warnKec = document.getElementById('warnKec');
  
  if (!banner || !warnKec) return;
  
  const urgent = data?.find(d => 
    (d.risiko === 'Kritis' || d.risiko === 'Tinggi') && d.status === 'baru'
  );
  
  if (urgent) {
    banner.classList.remove('d-none');
    warnKec.textContent = urgent.kec;
  } else {
    banner.classList.add('d-none');
  }
}

// ==========================================
// 🔍 FILTER: LOAD KECAMATAN
// ==========================================
async function loadKecamatanFilter() {
  const select = document.getElementById('filterKecamatan');
  if (!select) {
    console.error('❌ Element #filterKecamatan not found!');
    return;
  }
  
  try {
    const { data, error } = await window.sbClient
      .from('kecamatan')
      .select('id, nama')
      .order('nama');
    
    if (error) throw error;
    
    select.innerHTML = '<option value="">Semua Kecamatan</option>';
    
    if (data && data.length > 0) {
      data.forEach(k => {
        const opt = document.createElement('option');
        opt.value = k.id;
        opt.textContent = k.nama;
        select.appendChild(opt);
      });
    } else {
      // Fallback hardcoded
      select.innerHTML = `
        <option value="">Semua Kecamatan</option>
        <option value="8">Kepahiang</option><option value="9">Tebat Karai</option>
        <option value="10">Merigi</option><option value="11">Kabawetan</option>
        <option value="12">Muara Kemumu</option><option value="13">Bermani Ilir</option>
        <option value="14">Seberang Musi</option><option value="15">Ujan Mas</option>
      `;
    }
    
  } catch (err) {
    console.error('❌ loadKecamatanFilter error:', err);
    select.innerHTML = `
      <option value="">Semua Kecamatan</option>
      <option value="8">Kepahiang</option><option value="9">Tebat Karai</option>
      <option value="10">Merigi</option><option value="11">Kabawetan</option>
      <option value="12">Muara Kemumu</option><option value="13">Bermani Ilir</option>
      <option value="14">Seberang Musi</option><option value="15">Ujan Mas</option>
    `;
  }
}

function setupFilters() {
  const form = document.getElementById('filterForm');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const filters = {
      kecamatan_id: document.getElementById('filterKecamatan')?.value || null,
      status: document.getElementById('filterStatus')?.value || null,
      kategori: document.getElementById('filterKategori')?.value || null,
      date_from: document.getElementById('filterDate')?.value || null,
      date_to: null
    };
    
    showLoadingState();
    
    try {
      await fetchDashboardData(filters);
      renderStats(dashboardData);
      await initCharts(dashboardData);
      renderRecentTable(dashboardData);
      updateEarlyWarning(dashboardData);
      
      // ✅ Update mini map markers setelah filter diterapkan
      updateMiniMapMarkers();
      
      window.app?.showToast?.('🔍 Filter diterapkan', 'info');
    } catch (err) {
      console.error('Filter apply error:', err);
      window.app?.showToast?.('Gagal terapkan filter', 'error');
    }
  });
}

// ==========================================
// 🗺️ MINI MAP - TAMPILKAN SEMUA RISIKO
// ==========================================
function initMiniMap() {
  const mapContainer = document.getElementById('miniMap');
  if (!mapContainer || typeof L === 'undefined') {
    console.warn('⚠️ Mini map container or Leaflet not available');
    return;
  }
  
  // ✅ Destroy instance lama jika ada
  if (miniMapInstance) {
    try {
      miniMapInstance.remove();
      miniMapInstance = null;
      if (miniMapMarkersGroup) miniMapMarkersGroup = null;
      console.log('🗑️ Old miniMap instance destroyed');
    } catch (e) {
      console.warn('⚠️ Could not destroy old miniMap:', e);
    }
  }
  
  try {
    // ✅ Inisialisasi peta mini
    miniMapInstance = L.map('miniMap', {
      center: [-3.648, 102.626], // Center Kepahiang
      zoom: 10,
      zoomControl: false,
      scrollWheelZoom: false,
      dragging: false,
      attributionControl: false
    });
    
    // Base layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 15
    }).addTo(miniMapInstance);
    
    // ✅ Tambahkan marker untuk SEMUA risiko
    updateMiniMapMarkers();
    
    console.log('✅ Mini map initialized');
    
  } catch (err) {
    console.error('❌ Failed to init miniMap:', err);
  }
}

// ✅ Fungsi update marker - TAMPILKAN SEMUA RISIKO
function updateMiniMapMarkers() {
  if (!miniMapInstance) return;
  
  // Clear group lama
  if (miniMapMarkersGroup) {
    miniMapInstance.removeLayer(miniMapMarkersGroup);
  }
  miniMapMarkersGroup = L.featureGroup();
  
  // ✅ Filter: TAMPILKAN SEMUA RISIKO yang punya koordinat valid
  const allMarkers = dashboardData.filter(d => 
    d._raw?.lokasi_lat && 
    d._raw?.lokasi_lng &&
    !isNaN(parseFloat(d._raw.lokasi_lat)) &&
    !isNaN(parseFloat(d._raw.lokasi_lng))
  );
  
  // Warna marker berdasarkan risiko
  const riskColors = {
    'Kritis': '#991b1b',
    'Tinggi': '#dc2626',
    'Sedang': '#eab308',
    'Rendah': '#22c55e'
  };
  
  allMarkers.forEach(d => {
    const lat = parseFloat(d._raw.lokasi_lat);
    const lng = parseFloat(d._raw.lokasi_lng);
    const risk = d.risiko || 'Sedang';
    
    if (isNaN(lat) || isNaN(lng)) return;
    
    const marker = L.circleMarker([lat, lng], {
      radius: 6,
      fillColor: riskColors[risk] || '#eab308',
      color: '#fff',
      weight: 2,
      fillOpacity: 0.9
    }).bindPopup(`
      <strong>${d.judul}</strong><br>
      ${d.kec}<br>
      <span style="color:${riskColors[risk]}">${risk}</span>
    `);
    
    // Optional: klik marker buka detail
    marker.on('click', () => {
      if (typeof viewReportDetail === 'function') {
        viewReportDetail(d.id);
      }
    });
    
    miniMapMarkersGroup.addLayer(marker);
  });
  
  // Tambahkan group ke map
  miniMapInstance.addLayer(miniMapMarkersGroup);
  
  // ✅ Auto-fit bounds jika ada marker
  if (miniMapMarkersGroup.getLayers().length > 0) {
    miniMapInstance.fitBounds(miniMapMarkersGroup.getBounds().pad(0.3));
  }
  
  console.log(`✅ Mini map: ${miniMapMarkersGroup.getLayers().length} markers displayed (all risks)`);
}

// ==========================================
// 🎯 SETUP MODAL CLOSE BUTTONS
// ==========================================
function setupDashboardModal() {
  const modal = document.getElementById('modalLaporanDetail');
  const btnCloseX = document.getElementById('closeLaporanModal');
  const btnCloseFooter = document.getElementById('closeLaporanModalBtn');
  
  const closeModal = () => modal?.classList.add('d-none');
  
  btnCloseX?.addEventListener('click', closeModal);
  btnCloseFooter?.addEventListener('click', closeModal);
  
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('d-none') === false) {
      closeModal();
    }
  });
}

// ==========================================
// 🔄 REAL-TIME SUBSCRIPTION (Opsional)
// ==========================================
function setupRealtimeSubscription() {
  if (!window.sbClient?.channel) {
    console.warn('⚠️ Realtime not available');
    return;
  }
  
  const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
  
  window.sbClient
    .channel('public:conflict_reports')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'conflict_reports'
    }, async (payload) => {
      if (DEBUG) console.log('🔄 Realtime dashboard update:', payload.eventType);
      
      showLoadingState();
      await fetchDashboardData(currentFilters);
      renderStats(dashboardData);
      await initCharts(dashboardData);
      renderRecentTable(dashboardData);
      updateEarlyWarning(dashboardData);
      updateMiniMapMarkers(); // ✅ Update mini map juga
      
      const messages = {
        'INSERT': '🆕 Laporan baru masuk',
        'UPDATE': '🔄 Data diperbarui',
        'DELETE': '🗑️ Data dihapus'
      };
      window.app?.showToast?.(messages[payload.eventType] || '📊 Data diperbarui', 'info');
    })
    .subscribe((status) => {
      if (DEBUG) console.log('📡 Realtime subscription status:', status);
    });
}

// Uncomment baris berikut jika ingin fitur real-time aktif:
// setupRealtimeSubscription();
