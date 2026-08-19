/**
 * js/maps.js
 * Peta SIPANDAI - Fokus Kabupaten Kepahiang
 * ✅ Robust Query ✅ Toleran Null ✅ Debug Logging ✅ Bounds Ketat
 */

// 🎨 Warna Risiko
const RISK_COLORS = {
  'Kritis': '#991b1b',
  'Tinggi': '#dc2626', 
  'Sedang': '#eab308',
  'Rendah': '#22c55e'
};

// 🌍 Konfigurasi Peta (BOUNDS KETAT Kepahiang)
const MAP_CONFIG = {
  center: [-3.648, 102.626],
  zoom: 11,
  minZoom: 10,
  maxZoom: 15,
  bounds: [
    [-3.798060, 102.443051], // SW
    [-3.497891, 102.808862]  // NE
  ],
  tileLayer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; OpenStreetMap • SIPANDAI Kepahiang'
};

let map, markersLayer;
const DEBUG = true; // ✅ Set true untuk lihat log detail

// ==========================================
// 🚀 INIT MAP
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('map')) {
    initMap();
  }
  
  setupUIListeners();
});

function initMap() {
  map = L.map('map', {
    center: MAP_CONFIG.center,
    zoom: MAP_CONFIG.zoom,
    minZoom: MAP_CONFIG.minZoom,
    maxZoom: MAP_CONFIG.maxZoom,
    maxBounds: MAP_CONFIG.bounds,
    maxBoundsViscosity: 1.0,
    zoomControl: false,
    zoomSnap: 0.5,
    zoomDelta: 0.5
  });

  L.control.zoom({ position: 'bottomright' }).addTo(map);

  L.tileLayer(MAP_CONFIG.tileLayer, {
    attribution: MAP_CONFIG.attribution,
    maxZoom: MAP_CONFIG.maxZoom
  }).addTo(map);

  markersLayer = L.featureGroup().addTo(map);
  
  // Load data dengan error handling
  loadMarkersFromSupabase();
}

// ==========================================
// 📡 FETCH MARKERS DARI SUPABASE (ROBUST)
// ==========================================
async function loadMarkersFromSupabase() {
  if (!window.sbClient) {
    console.error('❌ Supabase client not ready');
    return;
  }
  
  console.log('📡 Fetching markers from Supabase...');
  
  try {
    // ✅ QUERY SEDERHANA: Hindari kombinasi .eq() dan .or() yang kompleks
    const { data, error } = await window.sbClient
      .from('conflict_reports')
      .select(`
        id, judul, kategori, tingkat_risiko, status,
        lokasi_lat, lokasi_lng, alamat_lokasi, created_at
      `)
      // ✅ Gunakan .in() untuk multiple status
      .in('status', ['baru', 'diproses'])
      // ✅ Pastikan koordinat ada
      .not('lokasi_lat', 'is', null)
      .not('lokasi_lng', 'is', null)
      .order('created_at', { ascending: false });
    
    console.log('📡 Query result:', { data, error });
    
    if (error) {
      console.error('❌ Supabase error:', error);
      throw error;
    }
    
    console.log(`✅ Fetched ${data?.length || 0} reports`);
    
    // Clear marker lama
    markersLayer.clearLayers();
    
    if (!data || data.length === 0) {
      console.warn('⚠️ No markers to display');
      console.log('💡 Kemungkinan penyebab:');
      console.log('  1. Status data bukan "baru" atau "diproses"');
      console.log('  2. lokasi_lat atau lokasi_lng NULL');
      console.log('  3. Data ada tapi filter .in() tidak match');
      return;
    }
    
    // Render markers
    let renderedCount = 0;
    data.forEach(report => {
      const lat = parseFloat(report.lokasi_lat);
      const lng = parseFloat(report.lokasi_lng);
      
      if (isNaN(lat) || isNaN(lng)) {
        console.warn(`⚠️ Invalid coordinates for report #${report.id}:`, { lat, lng });
        return;
      }
      
      const markerData = {
        id: report.id,
        title: report.judul || 'Tanpa Judul',
        lat: lat,
        lng: lng,
        risk: report.tingkat_risiko || 'Sedang',
        category: report.kategori || 'Lainnya',
        desc: report.alamat_lokasi || '-',
        status: report.status
      };
      
      const marker = L.circleMarker([lat, lng], {
        radius: 10,
        fillColor: RISK_COLORS[markerData.risk] || '#eab308',
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.95
      }).addTo(markersLayer);
      
      marker.options.risk = markerData.risk;
      marker.options.category = markerData.category;
      marker.options.id = markerData.id;
      
      marker.bindPopup(`
        <div style="min-width:220px">
          <strong style="display:block;margin-bottom:6px">${markerData.title}</strong>
          <div style="font-size:0.85em;color:#475569">📍 ${report.alamat_lokasi || '-'}</div>
          <div style="font-size:0.85em;color:#475569;margin:4px 0">
            🏷️ ${markerData.category} • 
            <span style="color:${RISK_COLORS[markerData.risk]}">${markerData.risk}</span>
          </div>
          <p style="margin:0;font-size:0.85em">${markerData.desc}</p>
        </div>
      `);
      
      marker.on('click', () => openMapModal(markerData));
      renderedCount++;
    });
    
    console.log(`✅ Rendered ${renderedCount} markers`);
    
    if (renderedCount > 0) {
      map.fitBounds(markersLayer.getBounds().pad(0.2));
    }
    
  } catch (err) {
    console.error('❌ Failed to load markers:', err);
  }
}

// ==========================================
// 🔍 FILTER LOGIC (TOLERAN NULL)
// ==========================================
function applyFilters() {
  const selectedRisks = Array.from(document.querySelectorAll('.filter-risk:checked')).map(cb => cb.value);
  const selectedCats = Array.from(document.querySelectorAll('.filter-cat:checked')).map(cb => cb.value);
  
  if (DEBUG) console.log('🔍 Applying filters:', { risks: selectedRisks, cats: selectedCats });

  let visibleCount = 0;
  
  markersLayer.eachLayer(marker => {
    // Ambil value dengan fallback
    const risk = marker.options?.risk || 'Sedang';
    const cat = marker.options?.category || 'Lainnya';
    
    // Jika filter kosong, tampilkan semua
    const showRisk = selectedRisks.length === 0 || selectedRisks.includes(risk);
    const showCat = selectedCats.length === 0 || selectedCats.includes(cat);
    
    if (showRisk && showCat) {
      if (!markersLayer.hasLayer(marker)) {
        markersLayer.addLayer(marker);
      }
      visibleCount++;
    } else {
      markersLayer.removeLayer(marker);
    }
  });
  
  if (window.app?.showToast) {
    window.app.showToast(`🔍 Menampilkan ${visibleCount} laporan`, 'info');
  }
  
  if (DEBUG) console.log(`✅ Filter result: ${visibleCount} visible markers`);
}

// ==========================================
// 📖 MODAL DETAIL
// ==========================================
function openMapModal(data) {
  const modal = document.getElementById('mapDetailModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  
  if (!modal || !modalTitle || !modalBody) {
    console.warn('⚠️ Modal elements not found');
    return;
  }
  
  modalTitle.textContent = data.title;
  modalBody.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:15px;font-size:0.9em">
      <div><span style="color:#64748b">ID Laporan</span><br><strong>#${data.id}</strong></div>
      <div><span style="color:#64748b">Koordinat</span><br><strong>${data.lat?.toFixed(4) || '-'}, ${data.lng?.toFixed(4) || '-'}</strong></div>
      <div><span style="color:#64748b">Kategori</span><br><strong>${data.category}</strong></div>
      <div><span style="color:#64748b">Risiko</span><br><strong style="color:${RISK_COLORS[data.risk]}">${data.risk}</strong></div>
      <div><span style="color:#64748b">Status</span><br><strong>${data.status}</strong></div>
    </div>
    <p style="margin:0;line-height:1.5;color:#1e293b">${data.desc}</p>
  `;
  
  modal.classList.remove('d-none');
}

// ==========================================
// 🎛️ UI EVENT LISTENERS
// ==========================================
function setupUIListeners() {
  // Toggle Sidebar
  document.getElementById('toggleSidebar')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelector('.sidebar')?.classList.toggle('open');
  });

  // Filter Panel
  const btnToggleFilters = document.getElementById('btnToggleFilters');
  const filterPanel = document.getElementById('filterPanel');
  const btnCloseFilter = document.getElementById('closeFilterPanel');
  const btnApplyFilters = document.getElementById('applyFilters');

  btnToggleFilters?.addEventListener('click', (e) => {
    e.stopPropagation();
    filterPanel?.classList.toggle('open');
  });

  btnCloseFilter?.addEventListener('click', () => {
    filterPanel?.classList.remove('open');
  });

  btnApplyFilters?.addEventListener('click', () => {
    applyFilters();
    filterPanel?.classList.remove('open');
  });

  // Close panel when clicking outside
  document.addEventListener('click', (e) => {
    if (filterPanel?.classList.contains('open') && 
        !filterPanel.contains(e.target) && 
        e.target !== btnToggleFilters) {
      filterPanel.classList.remove('open');
    }
  });

  // Reset View
  document.getElementById('btnResetView')?.addEventListener('click', () => {
    map?.setView(MAP_CONFIG.center, MAP_CONFIG.zoom);
  });

  // Modal Close
  document.getElementById('closeMapModal')?.addEventListener('click', () => {
    document.getElementById('mapDetailModal')?.classList.add('d-none');
  });

  // Geolocation (opsional)
  document.getElementById('btnLocateMe')?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      window.app?.showToast?.('Geolocation tidak didukung', 'warning');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude, longitude } = pos.coords;
        const inBounds = 
          latitude >= MAP_CONFIG.bounds[0][0] && latitude <= MAP_CONFIG.bounds[1][0] &&
          longitude >= MAP_CONFIG.bounds[0][1] && longitude <= MAP_CONFIG.bounds[1][1];
        
        if (inBounds) {
          map.setView([latitude, longitude], 13);
          L.circleMarker([latitude, longitude], {
            radius: 10,
            color: '#1e40af',
            fillColor: '#3b82f6',
            fillOpacity: 0.6,
            weight: 2
          }).addTo(map).bindPopup("📍 Lokasi Anda").openPopup();
          window.app?.showToast?.('✅ Lokasi ditemukan', 'success');
        } else {
          window.app?.showToast?.('⚠️ Lokasi di luar Kepahiang', 'warning');
        }
      },
      () => alert("Gagal mendapatkan lokasi")
    );
  });

  // Logout
  document.getElementById('btnLogout')?.addEventListener('click', () => {
    window.location.href = 'login.html';
  });
}
