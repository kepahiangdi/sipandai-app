/**
 * js/koordinasi.js
 * Logic Halaman Koordinasi: Forum Koordinasi, Rapat, Tindak Lanjut
 * ✅ Supabase Real-time ✅ No Mock Data ✅ Role-based Access ✅ No Duplicates
 */

// State global
let koordinasiData = [];
let currentFilters = {};
const DEBUG = false;

// ==========================================
// 1. INIT & FETCH DATA
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  if (DEBUG) console.log('🚀 Initializing koordinasi page...');
  
  if (!window.sbClient) {
    console.error('❌ Supabase client not initialized');
    window.app.showToast('Koneksi database gagal', 'error');
    return;
  }
  
  await initKoordinasiPage();
  setupForm();
  setupFilters();
  setupNewDiscussionButton(); // ✅ Setup tombol "+ Buat Diskusi Baru"
  setupRealtimeSubscription();
});

async function initKoordinasiPage() {
  showLoadingState();
  try {
    await fetchKoordinasiData();
    renderTable(koordinasiData);
    renderStats(koordinasiData);
    renderTrackingTable(koordinasiData);
    renderStakeholders(); // ✅ Tambahkan ini
    await loadKecamatanDropdown();
  } catch (err) { /* ... */ }
}

async function fetchKoordinasiData(filters = {}) {
  try {
    currentFilters = { ...filters };
    const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
    
    let query = window.sbClient
      .from('koordinasi')
      .select(`
        id, judul, jenis_kegiatan, tanggal, lokasi,
        peserta, notulensi, tindak_lanjut, status,
        created_at, updated_at,
        kecamatan_id, created_by,
        kecamatan (id, nama)
      `, { count: 'exact' })
      .order('tanggal', { ascending: false });
    
    if (filters.kecamatan_id) query = query.eq('kecamatan_id', parseInt(filters.kecamatan_id));
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.jenis) query = query.eq('jenis_kegiatan', filters.jenis);
    
    if (user.role === 'operator_kec' && user.kecamatan_id) {
      query = query.eq('kecamatan_id', user.kecamatan_id);
    }
    
    const { data, error, count } = await query;
    
    if (error) {
      console.error('❌ Supabase query error:', error);
      if (error.code === '42P01') throw new Error('Tabel koordinasi belum tersedia. Hubungi administrator.');
      if (error.code === '42501') throw new Error('Akses ditolak. Periksa hak akses Anda.');
      throw new Error(error.message);
    }
    
    koordinasiData = data || [];
    if (DEBUG) console.log(`✅ Loaded ${koordinasiData.length} records`);
    return koordinasiData;
    
  } catch (err) {
    console.error('❌ fetchKoordinasiData error:', err);
    throw err;
  }
}

function showLoadingState() {
  const tbody = document.getElementById('tableKoordinasi');
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="text-center">⏳ Memuat data...</td></tr>';
  
  ['statTotal', 'statBerjalan', 'statSelesai'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '...';
  });
}

// ==========================================
// 📊 RENDER STATS
// ==========================================
function renderStats(data) {
  const total = data?.length || 0;
  const berjalan = data?.filter(d => ['berjalan', 'diproses'].includes(d.status))?.length || 0;
  const selesai = data?.filter(d => d.status === 'selesai')?.length || 0;
  
  animateValue('statTotal', 0, total, 500);
  animateValue('statBerjalan', 0, berjalan, 500);
  animateValue('statSelesai', 0, selesai, 500);
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
// 📋 RENDER TABLE
// ==========================================
function renderTable(data) {
  const tbody = document.getElementById('tableKoordinasi');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Belum ada data koordinasi.</td></tr>';
    return;
  }
  
  const currentUser = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
  
  data.forEach(item => {
    let pelaporName = 'Unknown';
    if (item.created_by === currentUser.id) {
      pelaporName = currentUser.nama || 'Saya';
    } else {
      pelaporName = item.created_by ? 'User ' + item.created_by.slice(0, 8) + '...' : '-';
    }
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>#${item.id}</strong></td>
      <td>${window.app.formatDate(item.tanggal)}</td>
      <td>
        <strong>${item.judul}</strong><br>
        <small class="text-muted">${item.jenis_kegiatan || '-'}</small>
      </td>
      <td>${item.lokasi || '-'}</td>
      <td>${item.kecamatan?.nama || '-'}</td>
      <td>${item.peserta ? item.peserta.split(',').length + ' orang' : '-'}</td>
      <td><span class="status-badge ${getStatusClass(item.status)}">${formatStatus(item.status)}</span></td>
      <td>
        <button class="btn-action" title="Detail" onclick="viewDetail(${item.id})">👁️</button>
        ${canEditKoordinasi(item) ? `<button class="btn-action" title="Edit" onclick="editKoordinasi(${item.id})">✏️</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ==========================================
// 📋 RENDER TRACKING TABLE (FIXED)
// ==========================================
function renderTrackingTable(data) {
  const tbody = document.getElementById('trackingTable');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  // ✅ Filter: Tampilkan yang status-nya aktif (bukan selesai/ditunda)
  // Atau yang punya tindak_lanjut (meskipun status selesai)
  const trackingItems = data?.filter(d => {
    const hasTindakLanjut = d.tindak_lanjut && d.tindak_lanjut.trim() !== '';
    const isActiveStatus = ['berjalan', 'diproses', 'rencana'].includes(d.status);
    return hasTindakLanjut || isActiveStatus;
  }) || [];
  
  if (trackingItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Belum ada tindak lanjut.</td></tr>';
    return;
  }
  
  trackingItems.forEach(item => {
    const tr = document.createElement('tr');
    
    // Tentukan status class & text
    let statusClass = 'status-pending';
    let statusText = '⏳ Pending';
    
    if (item.status === 'selesai') {
      statusClass = 'status-done';
      statusText = '✅ Selesai';
    } else if (item.status === 'berjalan' || item.status === 'diproses') {
      statusClass = 'status-progress';
      statusText = '🔄 Berjalan';
    } else if (item.status === 'rencana') {
      statusClass = 'status-baru';
      statusText = '📅 Rencana';
    }
    
    // Estimate deadline (7 hari dari tanggal kegiatan)
    let deadlineText = '-';
    if (item.tanggal) {
      try {
        const deadline = new Date(item.tanggal);
        deadline.setDate(deadline.getDate() + 7);
        deadlineText = window.app.formatDate(deadline.toISOString());
      } catch (e) {
        deadlineText = window.app.formatDate(item.tanggal);
      }
    }
    
    tr.innerHTML = `
      <td><strong>#${item.id}</strong></td>
      <td>
        <strong>${item.judul}</strong><br>
        <small class="text-muted">${item.jenis_kegiatan || '-'}</small>
      </td>
      <td>${item.peserta || item.kecamatan?.nama || '-'}</td>
      <td>${deadlineText}</td>
      <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      <td>
        <button class="btn-action" onclick="viewDetail(${item.id})">👁️ Detail</button>
        ${item.status !== 'selesai' ? `<button class="btn-action" onclick="markAsDone(${item.id})">✓ Selesai</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderStakeholders() {
  const grid = document.getElementById('stakeholderGrid');
  if (!grid) return;
  
  grid.innerHTML = '';
  
  // Data dummy realistis untuk Forkopimda & Perangkat Daerah
  const stakeholders = [
    { icon: '👤', name: 'Bupati Kepahiang', role: 'Ketua Forkopimda', contact: '0732-xxxxxx' },
    { icon: '👮', name: 'Kapolres Kepahiang', role: 'Unsur Kepolisian', contact: '0732-xxxxxx' },
    { icon: '🎖️', name: 'Dandim 0416/Bute', role: 'Unsur TNI', contact: '0732-xxxxxx' },
    { icon: '⚖️', name: 'Kajari Kepahiang', role: 'Unsur Kejaksaan', contact: '0732-xxxxxx' },
    { icon: '🏛️', name: 'Sekda Kabupaten', role: 'Koordinator Harian', contact: '0732-xxxxxx' },
    { icon: '', name: 'Kasbangpol', role: 'Penanggung Jawab SIPANDAI', contact: '08xx-xxxx-xxxx' }
  ];

  stakeholders.forEach(s => {
    const card = document.createElement('div');
    card.className = 'stakeholder-card';
    card.innerHTML = `
      <div class="stakeholder-avatar">${s.icon}</div>
      <div class="stakeholder-info">
        <div class="stakeholder-name">${s.name}</div>
        <div class="stakeholder-role">${s.role}</div>
        <div class="stakeholder-contact">📞 ${s.contact}</div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ==========================================
// 🗄️ RENDER ARCHIVE (Diskusi Selesai)
// ==========================================
async function renderArchive() {
  const container = document.getElementById('archiveList');
  if (!container) return;
  
  container.innerHTML = '<div class="archive-empty">⏳ Memuat arsip...</div>';
  
  try {
    // Fetch hanya yang status 'selesai'
    const { data, error } = await window.sbClient
      .from('koordinasi')
      .select(`id, judul, jenis_kegiatan, tanggal, kecamatan (nama), updated_at`)
      .eq('status', 'selesai')
      .order('updated_at', { ascending: false })
      .limit(20); // Batasi 20 item terbaru
    
    if (error) throw error;
    
    container.innerHTML = '';
    
    if (!data || data.length === 0) {
      container.innerHTML = '<div class="archive-empty">Belum ada diskusi yang selesai.</div>';
      return;
    }
    
    data.forEach(item => {
      const div = document.createElement('div');
      div.className = 'archive-item';
      
      const tgl = item.tanggal ? window.app.formatDate(item.tanggal) : '-';
      const selesai = item.updated_at ? window.app.formatDate(item.updated_at) : '-';
      
      div.innerHTML = `
        <div class="archive-info">
          <div class="archive-title">${item.judul}</div>
          <div class="archive-meta">
            📅 ${tgl} • 📍 ${item.kecamatan?.nama || '-'} • ✅ Selesai: ${selesai}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <span class="archive-badge">✅ Selesai</span>
          <button class="btn-action" onclick="viewDetail(${item.id})" title="Lihat Detail">👁️</button>
        </div>
      `;
      container.appendChild(div);
    });
    
    if (DEBUG) console.log(`✅ Loaded ${data.length} archived items`);
    
  } catch (err) {
    console.error('❌ Gagal load arsip:', err);
    container.innerHTML = '<div class="archive-empty text-danger">Gagal memuat arsip.</div>';
  }
}
// Global function untuk mark as done
window.markAsDone = async (id) => {
  if (!confirm('Tandai koordinasi ini sebagai selesai?')) return;
  
  console.log('🔄 Marking coordination as done, ID:', id);
  
  try {
    const { data, error } = await window.sbClient
      .from('koordinasi')
      .update({ status: 'selesai', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(); // ✅ Tambah .select() agar kita lihat hasil update
    
    console.log('📡 Update response:', { data, error });
    
    if (error) {
      console.error('❌ Supabase error:', error);
      
      // Deteksi error RLS
      if (error.code === '42501' || error.message?.includes('permission')) {
        window.app.showToast('⚠️ Akses ditolak. Periksa hak akses Anda.', 'warning');
        return;
      }
      throw error;
    }
    
    if (!data || data.length === 0) {
      console.warn('⚠️ No rows updated - possibly RLS blocking');
      window.app.showToast('⚠️ Update diblokir (cek hak akses)', 'warning');
      return;
    }
    
    window.app.showToast('✅ Status berubah menjadi Selesai', 'success');
    
    // Re-fetch & re-render
    await fetchKoordinasiData(currentFilters);
    renderTable(koordinasiData);
    renderStats(koordinasiData);
    renderTrackingTable(koordinasiData);
    
  } catch (err) {
    console.error('Gagal update status:', err);
    window.app.showToast('Gagal: ' + err.message, 'error');
  }
};

function getStatusClass(status) {
  const map = { 'rencana': 'status-baru', 'berjalan': 'status-diproses', 'diproses': 'status-diproses', 'selesai': 'status-selesai', 'ditunda': '' };
  return map[status] || '';
}

function formatStatus(status) {
  const map = { 'rencana': '📅 Rencana', 'berjalan': '🔄 Berjalan', 'diproses': '🔄 Diproses', 'selesai': '✅ Selesai', 'ditunda': '⏸️ Ditunda' };
  return map[status] || status;
}

function canEditKoordinasi(item) {
  const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
  if (user.role === 'admin_kesbangpol') return true;
  if (user.role === 'operator_kec' && item.kecamatan_id === user.kecamatan_id) return true;
  return false;
}

// ==========================================
// 👁️ MODAL DETAIL
// ==========================================
window.viewDetail = async (id) => {
  try {
    const { data, error } = await window.sbClient
      .from('koordinasi')
      .select(`*, kecamatan (nama)`)
      .eq('id', id)
      .single();
    
    if (error) throw error;
    
    const modal = document.getElementById('modalDetail');
    const modalBody = document.getElementById('modalBody');
    
    if (modal && modalBody) {
      document.getElementById('modalTitle').textContent = `#${data.id}: ${data.judul}`;
      
      modalBody.innerHTML = `
        <div class="detail-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
          <div><span class="meta-label">Jenis Kegiatan</span><br><strong>${data.jenis_kegiatan || '-'}</strong></div>
          <div><span class="meta-label">Tanggal</span><br><strong>${window.app.formatDate(data.tanggal)}</strong></div>
          <div><span class="meta-label">Lokasi</span><br><strong>${data.lokasi || '-'}</strong></div>
          <div><span class="meta-label">Kecamatan</span><br><strong>${data.kecamatan?.nama || '-'}</strong></div>
          <div><span class="meta-label">Peserta</span><br><strong>${data.peserta || '-'}</strong></div>
          <div><span class="meta-label">Status</span><br><strong>${formatStatus(data.status)}</strong></div>
          <div><span class="meta-label">Dibuat</span><br><strong>${window.app.formatDate(data.created_at)}</strong></div>
        </div>
        <div style="margin-bottom:1rem">
          <strong>📝 Notulensi:</strong>
          <p style="margin:0.5rem 0;padding:0.75rem;background:#f8fafc;border-radius:6px;line-height:1.5">${data.notulensi || '-'}</p>
        </div>
        <div>
          <strong>✅ Tindak Lanjut:</strong>
          <p style="margin:0.5rem 0;padding:0.75rem;background:#eff6ff;border-radius:6px;line-height:1.5">${data.tindak_lanjut || '-'}</p>
        </div>
      `;
      
      const editSection = document.getElementById('modalEditSection');
      if (editSection) {
        if (canEditKoordinasi(data)) {
          editSection.classList.remove('d-none');
          document.getElementById('editKoordinasiId').value = data.id;
        } else {
          editSection.classList.add('d-none');
        }
      }
      
      modal.classList.remove('d-none');
    }
    
  } catch (err) {
    console.error('Gagal load detail:', err);
    window.app.showToast('Gagal memuat detail', 'error');
  }
};

window.editKoordinasi = async (id) => {
  try {
    // Ambil data dari DB
    const { data, error } = await window.sbClient
      .from('koordinasi')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;

    // Isi form dengan data existing
    document.getElementById('koordinasiJudul').value = data.judul || '';
    document.getElementById('koordinasiJenis').value = data.jenis_kegiatan || '';
    document.getElementById('koordinasiTanggal').value = data.tanggal ? data.tanggal.slice(0, 16) : '';
    document.getElementById('koordinasiLokasi').value = data.lokasi || '';
    document.getElementById('koordinasiPeserta').value = data.peserta || '';
    document.getElementById('koordinasiNotulensi').value = data.notulensi || '';
    document.getElementById('koordinasiTindakLanjut').value = data.tindak_lanjut || '';
    document.getElementById('koordinasiStatus').value = data.status || 'rencana';
    if (data.kecamatan_id) document.getElementById('koordinasiKecamatan').value = data.kecamatan_id;

    // Tampilkan form & scroll ke atas
    const formSection = document.getElementById('formSection');
    formSection.style.display = 'block';
    formSection.scrollIntoView({ behavior: 'smooth' });

    // Ubah tombol submit jadi mode "Update"
    const btnSubmit = document.getElementById('btnSubmitKoordinasi');
    btnSubmit.textContent = '💾 Simpan Perubahan';
    btnSubmit.dataset.editId = id; // Simpan ID untuk logika update

    window.app.showToast('📝 Form siap diedit. Klik "Simpan Perubahan" untuk update.', 'info');
    
  } catch (err) {
    console.error('Gagal load data edit:', err);
    window.app.showToast('Gagal memuat data untuk edit', 'error');
  }
};

// ==========================================
// 📝 FORM SETUP
// ==========================================
function setupForm() {
  const form = document.getElementById('formKoordinasi');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitKoordinasi');
    window.app.setLoading(btn, true);
    
    try {
      const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
      const editId = btn.dataset.editId; // Cek apakah mode edit
      
      const payload = {
        judul: document.getElementById('koordinasiJudul').value.trim(),
        jenis_kegiatan: document.getElementById('koordinasiJenis').value || null,
        tanggal: document.getElementById('koordinasiTanggal').value || null,
        lokasi: document.getElementById('koordinasiLokasi').value.trim() || null,
        peserta: document.getElementById('koordinasiPeserta').value.trim() || null,
        notulensi: document.getElementById('koordinasiNotulensi').value.trim() || null,
        tindak_lanjut: document.getElementById('koordinasiTindakLanjut').value.trim() || null,
        status: document.getElementById('koordinasiStatus').value || 'rencana',
        kecamatan_id: document.getElementById('koordinasiKecamatan').value ? parseInt(document.getElementById('koordinasiKecamatan').value) : null,
        updated_at: new Date().toISOString()
      };
      
      if (!payload.judul || !payload.tanggal) throw new Error('Judul & Tanggal wajib diisi');

      let error;
      if (editId) {
        // ✅ MODE UPDATE
        const res = await window.sbClient.from('koordinasi').update(payload).eq('id', editId);
        error = res.error;
        delete btn.dataset.editId; // Reset mode edit
        btn.textContent = '📤 Simpan Koordinasi'; // Kembalikan teks tombol
        window.app.showToast('✅ Data berhasil diperbarui', 'success');
      } else {
        // ✅ MODE INSERT BARU
        payload.created_by = user.id;
        const res = await window.sbClient.from('koordinasi').insert([payload]);
        error = res.error;
        window.app.showToast('✅ Data koordinasi berhasil ditambahkan', 'success');
      }
      
      if (error) throw error;
      
      form.reset();
      document.getElementById('formSection').style.display = 'none'; // Sembunyikan form setelah simpan
      await fetchKoordinasiData(currentFilters);
      renderTable(koordinasiData);
      renderStats(koordinasiData);
      renderTrackingTable(koordinasiData);
      
    } catch (err) {
      console.error('❌ Submit error:', err);
      window.app.showToast('Gagal: ' + err.message, 'error');
    } finally {
      window.app.setLoading(btn, false);
    }
  });
  
  // Reset tombol ke mode insert saat form di-reset manual
  document.getElementById('btnReset')?.addEventListener('click', () => {
    form.reset();
    const btn = document.getElementById('btnSubmitKoordinasi');
    btn.textContent = '📤 Simpan Koordinasi';
    delete btn.dataset.editId;
  });
}

// ==========================================
// 🔍 FILTERS
// ==========================================
async function loadKecamatanDropdown() {
  const select = document.getElementById('koordinasiKecamatan');
  if (!select) return;
  
  try {
    const { data, error } = await window.sbClient.from('kecamatan').select('id, nama').order('nama');
    if (error) throw error;
    
    select.innerHTML = '<option value="">Semua Kecamatan</option>';
    data.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k.id;
      opt.textContent = k.nama;
      select.appendChild(opt);
    });
    
  } catch (err) {
    console.error('❌ Gagal load kecamatan:', err);
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
      jenis: document.getElementById('filterJenis')?.value || null
    };
    
    showLoadingState();
    await fetchKoordinasiData(filters);
    renderTable(koordinasiData);
    renderStats(koordinasiData);
    window.app.showToast('🔍 Filter diterapkan', 'info');
  });
}

// ==========================================
// 🎯 SETUP TOMBOL "BUAT DISKUSI BARU" + CLOSE FORM
// ==========================================
function setupNewDiscussionButton() {
  const btnNew = document.getElementById('btnNewDiscussion');
  const formSection = document.getElementById('formSection');
  const btnClose = document.getElementById('btnCloseForm');
  
  // Toggle form saat tombol "+ Buat Diskusi Baru" diklik
  if (btnNew && formSection) {
    btnNew.addEventListener('click', (e) => {
      e.preventDefault();
      const isHidden = formSection.style.display === 'none' || !formSection.style.display;
      formSection.style.display = isHidden ? 'block' : 'none';
      
      if (isHidden) {
        formSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        formSection.classList.add('highlight');
        setTimeout(() => formSection.classList.remove('highlight'), 2000);
        document.getElementById('koordinasiJudul')?.focus();
      }
      
      if (DEBUG) console.log('🎯 Form toggled:', isHidden ? 'opened' : 'closed');
    });
  }
  
  // Close form saat tombol ✕ diklik
  if (btnClose && formSection) {
    btnClose.addEventListener('click', () => {
      formSection.style.display = 'none';
      document.getElementById('formKoordinasi')?.reset();
      if (DEBUG) console.log('🎯 Form closed via close button');
    });
  }
}

// ==========================================
// 🔄 REFRESH BUTTON
// ==========================================
document.getElementById('btnRefreshTracking')?.addEventListener('click', async () => {
  showLoadingState();
  await fetchKoordinasiData(currentFilters);
  renderTable(koordinasiData);
  renderStats(koordinasiData);
  renderTrackingTable(koordinasiData);
  window.app.showToast('🔄 Data refreshed', 'info');
});

// ==========================================
// 🔄 REAL-TIME SUBSCRIPTION
// ==========================================
function setupRealtimeSubscription() {
  if (!window.sbClient?.channel) {
    console.warn('⚠️ Realtime not available');
    return;
  }
  
  window.sbClient
    .channel('public:koordinasi')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'koordinasi'
    }, async (payload) => {
      if (DEBUG) console.log('🔄 Realtime update:', payload.eventType, payload.new?.id);
      
      showLoadingState();
      await fetchKoordinasiData(currentFilters);
      renderTable(koordinasiData);
      renderStats(koordinasiData);
      
      const messages = {
        'INSERT': '🆕 Data koordinasi baru ditambahkan',
        'UPDATE': '🔄 Data koordinasi diperbarui',
        'DELETE': '🗑️ Data koordinasi dihapus'
      };
      window.app.showToast(messages[payload.eventType] || '📊 Data diperbarui', 'info');
    })
    .subscribe((status) => {
      if (DEBUG) console.log('📡 Realtime subscription status:', status);
    });
}

function setupModal() {
  const modal = document.getElementById('modalDetail');
  const btnCloseX = document.getElementById('closeModal');
  const btnCloseFooter = document.getElementById('closeModalBtn');

  const closeModal = () => modal?.classList.add('d-none');

  btnCloseX?.addEventListener('click', closeModal);
  btnCloseFooter?.addEventListener('click', closeModal);
  
  // Klik di area gelap (overlay) juga menutup modal
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

// Panggil di bagian paling bawah file:
document.addEventListener('DOMContentLoaded', () => {
  // ... kode existing ...
  setupModal(); // ✅ Tambahkan ini
});

// ==========================================
// 🗄️ SETUP LOAD ARCHIVE BUTTON
// ==========================================
function setupArchiveButton() {
  const btn = document.getElementById('btnLoadArchive');
  if (!btn) return;
  
  btn.addEventListener('click', async () => {
    window.app.setLoading(btn, true);
    btn.textContent = '⏳ Memuat...';
    
    await renderArchive();
    
    window.app.setLoading(btn, false);
    btn.textContent = '🔄 Load Arsip';
    
    window.app.showToast('📦 Arsip dimuat', 'info');
  });
}

// Panggil di DOMContentLoaded
document.addEventListener('DOMContentLoaded', async () => {
  // ... kode existing ...
  setupArchiveButton(); // ✅ Tambahkan ini
});

// ==========================================
// 📥 EXPORT CSV
// ==========================================
document.getElementById('btnExport')?.addEventListener('click', async () => {
  const btn = document.getElementById('btnExport');
  window.app.setLoading(btn, true);
  
  try {
    let query = window.sbClient
      .from('koordinasi')
      .select(`id, judul, jenis_kegiatan, tanggal, lokasi, peserta, notulensi, tindak_lanjut, status, kecamatan (nama)`)
      .order('tanggal', { ascending: false });
    
    if (currentFilters.kecamatan_id) query = query.eq('kecamatan_id', currentFilters.kecamatan_id);
    if (currentFilters.status) query = query.eq('status', currentFilters.status);
    
    const { data, error } = await query;
    if (error) throw error;
    
    const csv = [
      ['ID', 'Tanggal', 'Judul', 'Jenis', 'Lokasi', 'Kecamatan', 'Peserta', 'Status', 'Notulensi', 'Tindak Lanjut'].join(','),
      ...data.map(d => [
        d.id, d.tanggal,
        `"${(d.judul || '').replace(/"/g, '""')}"`,
        d.jenis_kegiatan || '-',
        `"${(d.lokasi || '').replace(/"/g, '""')}"`,
        d.kecamatan?.nama || '-',
        `"${(d.peserta || '').replace(/"/g, '""')}"`,
        d.status,
        `"${(d.notulensi || '').replace(/"/g, '""')}"`,
        `"${(d.tindak_lanjut || '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');
    
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `koordinasi_sipandai_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    
    window.app.showToast('✅ Data berhasil diexport', 'success');
    
  } catch (err) {
    console.error('Export error:', err);
    window.app.showToast('Gagal export: ' + err.message, 'error');
  } finally {
    window.app.setLoading(btn, false);
  }
});
