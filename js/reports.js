/**
 * js/reports.js
 * Logic Pelaporan SIPANDAI - Integrasi Penuh Supabase
 * ✅ Cascading Dropdown ✅ Upload Storage ✅ Filter ✅ Export ✅ Real-time ✅ Offline-Sync
 */

// State global
let reportsData = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 10;
let currentFilters = {};

// ==========================================
// 1. INIT & FETCH DATA
// ==========================================
// Auto-load detail jika ada parameter report_id di URL
document.addEventListener('DOMContentLoaded', async () => {
   // ✅ PANGGIL initReportPage() DULU
  await initReportPage();
  
  // Cek URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const reportId = urlParams.get('report_id');
  
  if (reportId) {
    // Tunggu inisialisasi selesai, lalu buka detail
    setTimeout(async () => {
      await window.openReportModal?.(parseInt(reportId));
      // Scroll ke tabel agar modal terlihat
      document.querySelector('.list-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 500);
  }
});

async function initReportPage() {
  // Load dropdown dulu sebelum render tabel
  await loadKecamatanDropdown();
  setupDropdownListeners();
  
  renderTable(reportsData);
  setupForm();
  setupSearchFilter();
  setupFilePreview();
  setupModal();
  setupExport();
  preloadUserData();
  
  // Fetch data laporan setelah UI siap
  await fetchReports();
  
  // Setup real-time subscription (opsional)
  setupRealtimeSubscription();
}

// ==========================================
// 📍 DROPDOWN CASCADING: KECAMATAN → DESA
// ==========================================
async function loadKecamatanDropdown() {
  const select = document.getElementById('laporanKecamatan');
  if (!select) return;

  try {
    const { data, error } = await window.sbClient
      .from('kecamatan')
      .select('id, nama')
      .order('nama');
    
    if (error) throw error;

    select.innerHTML = '<option value="">Pilih Kecamatan *</option>';
    data.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k.id;
      opt.textContent = k.nama;
      select.appendChild(opt);
    });
    
    console.log(`✅ ${data.length} kecamatan dimuat`);
  } catch (err) {
    console.error('❌ Gagal load kecamatan:', err);
    // Fallback hardcoded jika gagal
    select.innerHTML = `
      <option value="">Pilih Kecamatan *</option>
      <option value="8">Kepahiang</option>
      <option value="9">Tebat Karai</option>
      <option value="10">Merigi</option>
      <option value="11">Kabawetan</option>
      <option value="12">Muara Kemumu</option>
      <option value="13">Bermani Ilir</option>
      <option value="14">Seberang Musi</option>
      <option value="15">Ujan Mas</option>
    `;
  }
}

async function loadDesaDropdown(kecamatanId) {
  const selectDesa = document.getElementById('laporanDesa');
  if (!selectDesa) return;

  // Reset & loading state
  selectDesa.innerHTML = '<option value="">⏳ Memuat desa...</option>';
  selectDesa.disabled = true;

  if (!kecamatanId) {
    selectDesa.innerHTML = '<option value="">Pilih Kecamatan Dulu</option>';
    return;
  }

  try {
    const { data, error } = await window.sbClient
      .from('desa')
      .select('id, nama')
      .eq('kecamatan_id', parseInt(kecamatanId))
      .order('nama');
    
    if (error) throw error;

    selectDesa.innerHTML = '<option value="">Pilih Desa *</option>';
    
    if (data && data.length > 0) {
      data.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.nama;
        selectDesa.appendChild(opt);
      });
      selectDesa.disabled = false; // ✅ Aktifkan setelah data muncul
      console.log(`✅ ${data.length} desa dimuat untuk kecamatan ${kecamatanId}`);
    } else {
      selectDesa.innerHTML = '<option value="">Tidak ada data desa</option>';
      console.warn('⚠️ Tidak ada desa untuk kecamatan ini');
    }
  } catch (err) {
    console.error('❌ Gagal load desa:', err);
    selectDesa.innerHTML = '<option value="">❌ Gagal memuat desa</option>';
    if (window.app?.showToast) {
      window.app.showToast('Gagal memuat data desa', 'error');
    }
  }
}

function setupDropdownListeners() {
  const kecSelect = document.getElementById('laporanKecamatan');
  kecSelect?.addEventListener('change', (e) => {
    loadDesaDropdown(e.target.value);
  });
}

// ==========================================
// 📥 FETCH LAPORAN DARI SUPABASE
// ==========================================
async function fetchReports(filters = {}) {
  try {
    currentFilters = { ...filters };
    const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
    
    let query = window.sbClient
      .from('conflict_reports')
      .select(`
        id, judul, deskripsi, kategori, tingkat_risiko,
        lokasi_lat, lokasi_lng, alamat_lokasi, status, created_at, updated_at,
        kecamatan (id, nama),
        desa (id, nama),
        profiles (id, nama_lengkap, role)
      `, { count: 'exact' })
      .order('created_at', { ascending: false });

    // Filter server-side
    if (filters.kecamatan_id) query = query.eq('kecamatan_id', filters.kecamatan_id);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.kategori) query = query.eq('kategori', filters.kategori);
    if (filters.tingkat_risiko) query = query.eq('tingkat_risiko', filters.tingkat_risiko);
    if (filters.date_from) query = query.gte('created_at', filters.date_from);
    if (filters.date_to) query = query.lte('created_at', filters.date_to);
    
    // RLS: operator hanya lihat kecamatannya
    if (user.role === 'operator_kec' && user.kecamatan_id) {
      query = query.eq('kecamatan_id', user.kecamatan_id);
    }

    // Pagination
    const from = (currentPage - 1) * ITEMS_PER_PAGE;
    const to = from + ITEMS_PER_PAGE - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    // Format data untuk render
    reportsData = (data || []).map(d => ({
      id: d.id,
      tgl: d.created_at,
      judul: d.judul,
      kec: d.kecamatan?.nama || '-',
      desa: d.desa?.nama || extractDesaFromAlamat(d.alamat_lokasi),
      kat: d.kategori || 'Lainnya',
      risiko: d.tingkat_risiko || 'Sedang',
      status: d.status,
      pelapor: d.profiles?.nama_lengkap || 'Anonim',
      _raw: d
    }));

    renderTable(reportsData);
    renderPagination(count);
    return reportsData;

  } catch (err) {
    console.error('❌ Gagal fetch laporan:', err);
    window.app.showToast('Gagal memuat data: ' + err.message, 'error');
    document.getElementById('tableLaporan').innerHTML = 
      '<tr><td colspan="8" class="text-center text-danger">⚠️ Gagal memuat data. Periksa koneksi atau hubungi admin.</td></tr>';
    return [];
  }
}

function extractDesaFromAlamat(alamat) {
  if (!alamat) return '-';
  const parts = alamat.split(',').map(s => s.trim());
  return parts[0] || '-';
}

function preloadUserData() {
  const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
  if (user.kecamatan_id) {
    const select = document.getElementById('laporanKecamatan');
    if (select) {
      select.value = user.kecamatan_id;
      loadDesaDropdown(user.kecamatan_id); // Auto-load desa jika user punya kecamatan
    }
  }
}

// ==========================================
// 📊 RENDER TABLE & PAGINATION
// ==========================================
function renderTable(data) {
  const tbody = document.getElementById('tableLaporan');
  if (!tbody) return;
  tbody.innerHTML = '';
  
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Tidak ada data laporan.</td></tr>';
    return;
  }

  data.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${(currentPage - 1) * ITEMS_PER_PAGE + idx + 1}</td>
      <td>${window.app.formatDate(item.tgl)}</td>
      <td>
        <strong>${item.kec}</strong><br>
        <small class="text-muted">${item.desa}</small>
      </td>
      <td>${item.kat}</td>
      <td><span class="risiko-badge ${window.app.getRisikoClass(item.risiko)}">${window.app.formatRisiko(item.risiko)}</span></td>
      <td><span class="status-badge ${window.app.getStatusClass(item.status)}">${window.app.formatStatus(item.status)}</span></td>
      <td>${item.pelapor}</td>
      <td class="action-buttons">
        <button class="btn-action" title="Detail" onclick="openReportModal(${item.id})">👁️</button>
        ${canEditReport(item) ? `<button class="btn-action" title="Update Status" onclick="showStatusModal(${item.id}, '${item.status}')">🔄</button>` : ''}
        ${canDeleteReport(item) ? `<button class="btn-action text-danger" title="Hapus" onclick="confirmDelete(${item.id})">🗑️</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function canEditReport(item) {
  const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
  if (user.role === 'admin_kesbangpol') return true;
  if (user.role === 'operator_kec' && item._raw?.kecamatan_id === user.kecamatan_id) return true;
  return false;
}

function canDeleteReport(item) {
  const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
  return user.role === 'admin_kesbangpol';
}

function renderPagination(totalCount) {
  const container = document.querySelector('.pagination');
  if (!container) return;
  
  const totalPages = Math.ceil((totalCount || 0) / ITEMS_PER_PAGE);
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  container.innerHTML = `
    <button class="page-btn" ${currentPage === 1 ? 'disabled' : ''} onclick="changePage(${currentPage - 1})">← Sebelumnya</button>
    <span class="page-info">Halaman ${currentPage} dari ${totalPages} (${totalCount} data)</span>
    <button class="page-btn" ${currentPage === totalPages ? 'disabled' : ''} onclick="changePage(${currentPage + 1})">Selanjutnya →</button>
  `;
}

window.changePage = async (page) => {
  if (page < 1) return;
  currentPage = page;
  await fetchReports(currentFilters);
  document.querySelector('.table-section')?.scrollIntoView({ behavior: 'smooth' });
};

// ==========================================
// 📤 FORM SUBMIT + UPLOAD STORAGE
// ==========================================
function setupForm() {
  const form = document.getElementById('formLaporan');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitLaporan');
    window.app.setLoading(btn, true);

    try {
      // Validasi WAJIB: Judul, Kecamatan, Desa
      const judul = document.getElementById('laporanJudul').value.trim();
      const kecamatan_id = document.getElementById('laporanKecamatan').value;
      const desa_id = document.getElementById('laporanDesa').value;
      
      if (!judul) {
        window.app.showToast('Judul laporan wajib diisi', 'error');
        document.getElementById('laporanJudul').focus();
        return;
      }
      if (!kecamatan_id) {
        window.app.showToast('Kecamatan wajib dipilih', 'error');
        document.getElementById('laporanKecamatan').focus();
        return;
      }
      if (!desa_id) {
        window.app.showToast('Desa wajib dipilih', 'error');
        document.getElementById('laporanDesa').focus();
        return;
      }

      // Upload file (jika ada)
      let foto_url = null;
      const fileInput = document.getElementById('laporanBukti');
      if (fileInput?.files?.[0]) {
        foto_url = await uploadBukti(fileInput.files[0]);
      }

      // Siapkan payload dengan default value untuk optional fields
      const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
      const payload = {
        judul,
        deskripsi: document.getElementById('laporanDeskripsi').value.trim() || null,
        kategori: document.getElementById('laporanKategori').value || 'Lainnya', // Default: Lainnya
        tingkat_risiko: document.getElementById('laporanRisiko').value || 'Sedang', // Default: Sedang
        lokasi_lat: parseFloat(document.getElementById('laporanLat').value) || null,
        lokasi_lng: parseFloat(document.getElementById('laporanLng').value) || null,
        alamat_lokasi: document.getElementById('laporanLokasi').value.trim() || null,
        kecamatan_id: parseInt(kecamatan_id),
        desa_id: parseInt(desa_id), // ✅ Wajib dikirim
        foto_url,
        pelapor_id: user.id,
        status: 'baru'
      };

      // Insert ke Supabase
      if (navigator.onLine) {
        const { data, error } = await window.sbClient
          .from('conflict_reports')
          .insert([payload])
          .select()
          .single();
        
        if (error) throw error;
        
        window.app.showToast('✅ Laporan berhasil dikirim ke database pusat', 'success');
        
        // Reset & refresh
        form.reset();
        document.getElementById('filePreview').innerHTML = '';
        // Reset dropdown desa
        const desaSelect = document.getElementById('laporanDesa');
        desaSelect.innerHTML = '<option value="">Pilih Kecamatan Dulu</option>';
        desaSelect.disabled = true;
        currentPage = 1;
        await fetchReports();
        
      } else {
        // Offline queue
        window.syncOfflineQueue?.queueOfflineReport({ ...payload, queuedAt: new Date().toISOString() });
        window.app.showToast('⚠️ Offline. Laporan disimpan & akan dikirim otomatis saat online.', 'warning');
        form.reset();
        document.getElementById('filePreview').innerHTML = '';
      }

    } catch (err) {
      console.error('❌ Gagal submit laporan:', err);
      window.app.showToast('Gagal: ' + err.message, 'error');
    } finally {
      window.app.setLoading(btn, false);
    }
  });

  // Reset form
  document.getElementById('btnReset')?.addEventListener('click', () => {
    document.getElementById('formLaporan').reset();
    document.getElementById('filePreview').innerHTML = '';
    const desaSelect = document.getElementById('laporanDesa');
    desaSelect.innerHTML = '<option value="">Pilih Kecamatan Dulu</option>';
    desaSelect.disabled = true;
  });
}

async function uploadBukti(file) {
  const fileName = `bukti/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${file.name.replace(/[^a-z0-9.]/gi, '_')}`;
  
  const { error: uploadError } = await window.sbClient.storage
    .from('bukti-laporan')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false
    });
  
  if (uploadError) throw uploadError;
  
  const { data: { publicUrl } } = window.sbClient.storage
    .from('bukti-laporan')
    .getPublicUrl(fileName);
  
  return publicUrl;
}

// ==========================================
// 🔍 SEARCH & FILTER
// ==========================================
function setupSearchFilter() {
  const search = document.getElementById('searchLaporan');
  const kecFilter = document.getElementById('filterKecamatanList');
  const statusFilter = document.getElementById('filterStatusList');
  const risikoFilter = document.getElementById('filterRisikoList');
  const form = document.getElementById('filterForm');

  const applyFilters = async () => {
    const filters = {
      kecamatan_id: kecFilter?.value || null,
      status: statusFilter?.value || null,
      tingkat_risiko: risikoFilter?.value || null
    };
    
    const searchTerm = search?.value.toLowerCase() || '';
    currentPage = 1;
    await fetchReports(filters);
    
    // Client-side search tambahan
    if (searchTerm && reportsData.length > 0) {
      const filtered = reportsData.filter(d => 
        d.judul?.toLowerCase().includes(searchTerm) ||
        d.kec?.toLowerCase().includes(searchTerm) ||
        d.desa?.toLowerCase().includes(searchTerm) ||
        d.kat?.toLowerCase().includes(searchTerm)
      );
      renderTable(filtered);
    }
  };

  let searchTimeout;
  search?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(applyFilters, 300);
  });
  
  [kecFilter, statusFilter, risikoFilter].forEach(el => {
    el?.addEventListener('change', applyFilters);
  });
  
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    applyFilters();
  });
}

// ==========================================
// 📎 FILE PREVIEW
// ==========================================
function setupFilePreview() {
  const input = document.getElementById('laporanBukti');
  const preview = document.getElementById('filePreview');
  if (!input || !preview) return;
  
  input.addEventListener('change', (e) => {
    preview.innerHTML = '';
    const files = Array.from(e.target.files || []);
    
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = document.createElement('img');
          img.src = ev.target.result;
          img.className = 'file-thumb';
          img.alt = file.name;
          preview.appendChild(img);
        };
        reader.readAsDataURL(file);
      } else {
        const badge = document.createElement('span');
        badge.className = 'file-badge';
        badge.textContent = `📄 ${file.name}`;
        preview.appendChild(badge);
      }
    });
  });
}

// ==========================================
// 📖 MODAL & STATUS UPDATE
// ==========================================
function setupModal() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('d-none');
    });
  });
  
  document.getElementById('closeModal')?.addEventListener('click', () => {
    document.getElementById('modalDetail').classList.add('d-none');
  });
  
  document.getElementById('formUpdateStatus')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const reportId = document.getElementById('updateReportId')?.value;
    const newStatus = document.getElementById('updateStatusSelect')?.value;
    
    if (!reportId || !newStatus) return;
    
    try {
      const { error } = await window.sbClient
        .from('conflict_reports')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', reportId);
      
      if (error) throw error;
      
      window.app.showToast(`✅ Status diperbarui menjadi "${newStatus}"`, 'success');
      document.getElementById('modalDetail').classList.add('d-none');
      await fetchReports(currentFilters);
      
    } catch (err) {
      window.app.showToast('Gagal update status: ' + err.message, 'error');
    }
  });
}
// ==========================================
// 🖨️ PRINT TO PDF FUNCTIONALITY
// ==========================================
function setupPrintButton() {
  const printBtn = document.getElementById('printBtn');
  if (!printBtn) return;
  
  printBtn.addEventListener('click', () => {
    const modalBody = document.getElementById('modalBody');
    const modalTitle = document.getElementById('modalTitle')?.textContent || 'Detail Laporan';
    
    if (!modalBody) {
      console.error('Modal body not found');
      return;
    }
    
    // Ambil data dari modal
    const content = modalBody.innerHTML;
    
    // Buat window print baru
    const printWindow = window.open('', '_blank');
    
    // Template HTML untuk print
    const printHTML = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${modalTitle}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 40px;
            background: #fff;
            color: #1e293b;
            line-height: 1.6;
          }
          
          .print-header {
            text-align: center;
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 3px solid #1e40af;
          }
          
          .print-header h1 {
            font-size: 24px;
            color: #1e40af;
            margin-bottom: 8px;
          }
          
          .print-header p {
            color: #64748b;
            font-size: 14px;
          }
          
          .print-content {
            max-width: 800px;
            margin: 0 auto;
          }
          
          .detail-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
          }
          
          .detail-item {
            background: #f8fafc;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #1e40af;
          }
          
          .detail-label {
            font-size: 12px;
            color: #64748b;
            text-transform: uppercase;
            font-weight: 600;
            margin-bottom: 5px;
          }
          
          .detail-value {
            font-size: 14px;
            color: #1e293b;
            font-weight: 600;
          }
          
          .section {
            margin-bottom: 25px;
          }
          
          .section-title {
            font-size: 16px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 10px;
            padding-bottom: 5px;
            border-bottom: 2px solid #e2e8f0;
          }
          
          .section-content {
            background: #f8fafc;
            padding: 15px;
            border-radius: 8px;
            line-height: 1.8;
          }
          
          .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 999px;
            font-size: 12px;
            font-weight: 600;
          }
          
          .badge-blue { background: #dbeafe; color: #1e40af; }
          .badge-yellow { background: #fef3c7; color: #b45309; }
          .badge-green { background: #dcfce7; color: #166534; }
          .badge-red { background: #fee2e2; color: #b91c1c; }
          
          .print-footer {
            margin-top: 50px;
            padding-top: 20px;
            border-top: 2px solid #e2e8f0;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
          }
          
          @media print {
            body {
              padding: 20px;
            }
            
            .print-header {
              margin-bottom: 30px;
            }
            
            .detail-grid {
              grid-template-columns: 1fr 1fr;
            }
            
            @page {
              margin: 2cm;
              size: A4;
            }
          }
          
          @media (max-width: 640px) {
            .detail-grid {
              grid-template-columns: 1fr;
            }
            
            body {
              padding: 20px;
            }
          }
        </style>
      </head>
      <body>
        <div class="print-header">
          <h1>SIPANDAI - Kabupaten Kepahiang</h1>
          <p>Sistem Informasi Pemantauan dan Deteksi Dini Konflik Sosial</p>
        </div>
        
        <div class="print-content">
          <h2 style="margin-bottom: 30px; text-align: center;">${modalTitle}</h2>
          
          ${content}
        </div>
        
        <div class="print-footer">
          <p>Dokumen ini dicetak secara otomatis dari sistem SIPANDAI</p>
          <p>Dicetak pada: ${new Date().toLocaleString('id-ID', { 
            day: '2-digit', 
            month: 'long', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</p>
          <p>Badan Kesatuan Bangsa dan Politik Kabupaten Kepahiang</p>
        </div>
        
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
      </html>
    `;
    
    printWindow.document.write(printHTML);
    printWindow.document.close();
  });
}

// Panggil fungsi ini saat DOM loaded
document.addEventListener('DOMContentLoaded', () => {
  setupPrintButton();
});

// Global: Buka modal detail
window.openReportModal = async (id) => {
  try {
    console.log('🔍 Loading report detail for ID:', id);
    
    // ✅ QUERY SEDERHANA: Hindari join yang bermasalah
    const { data, error } = await window.sbClient
      .from('conflict_reports')
      .select(`
        id, judul, deskripsi, kategori, tingkat_risiko, status,
        lokasi_lat, lokasi_lng, alamat_lokasi, foto_url,
        created_at, updated_at, kecamatan_id,
        kecamatan (nama)
        -- profiles (nama_lengkap) ← KOMEN DULU jika bermasalah
      `)
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('❌ Query error:', error);
      
      // Jika error karena join, coba query tanpa join
      if (error.message?.includes('relationship') || error.code === 'PGRST301') {
        console.warn('⚠️ Join failed, trying without joins...');
        
        const { data: simpleData, error: simpleError } = await window.sbClient
          .from('conflict_reports')
          .select('*')
          .eq('id', id)
          .single();
        
        if (simpleError) throw simpleError;
        
        // Format data tanpa join
        return showReportModal({
          ...simpleData,
          kecamatan: { nama: '-' },
          profiles: { nama_lengkap: 'Unknown' }
        });
      }
      
      throw error;
    }
    
    console.log('✅ Report loaded:', data);
    
    // Tampilkan modal dengan data
    showReportModal(data);
    
  } catch (err) {
    console.error('Gagal buka detail:', err);
    window.app.showToast('Gagal memuat detail: ' + err.message, 'error');
  }
};

// Helper function untuk menampilkan modal
function showReportModal(data) {
  const modal = document.getElementById('modalDetail');
  const modalBody = document.getElementById('modalBody');
  
  if (!modal || !modalBody) {
    console.error('❌ Modal elements not found!');
    window.app.showToast('Modal tidak ditemukan', 'error');
    return;
  }
  
  // Set judul modal
  const modalTitle = document.getElementById('modalTitle');
  if (modalTitle) {
    modalTitle.textContent = `Laporan #${data.id}: ${data.judul}`;
  }
  
  // Format tanggal
  const tglDibuat = data.created_at ? window.app.formatDate(data.created_at) : '-';
  const tglUpdate = data.updated_at ? window.app.formatDate(data.updated_at) : '-';
  
  // Isi modal body
  modalBody.innerHTML = `
    <div class="modal-meta" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem">
      <div>
        <span class="meta-label" style="color:#64748b;font-size:0.85rem">Kategori</span><br>
        <strong>${data.kategori || 'Lainnya'}</strong>
      </div>
      <div>
        <span class="meta-label" style="color:#64748b;font-size:0.85rem">Tingkat Risiko</span><br>
        <span class="risiko-badge ${window.app.getRisikoClass?.(data.tingkat_risiko) || ''}" style="display:inline-block;padding:0.25rem 0.6rem;border-radius:999px;font-size:0.75rem;font-weight:600;background:${getRisikoColor(data.tingkat_risiko)};color:#fff">
          ${window.app.formatRisiko?.(data.tingkat_risiko) || data.tingkat_risiko || 'Sedang'}
        </span>
      </div>
      <div>
        <span class="meta-label" style="color:#64748b;font-size:0.85rem">Lokasi</span><br>
        <strong>${data.kecamatan?.nama || '-'}${data.desa?.nama ? ', ' + data.desa.nama : ''}${data.alamat_lokasi ? ' - ' + data.alamat_lokasi : ''}</strong>
      </div>
      <div>
        <span class="meta-label" style="color:#64748b;font-size:0.85rem">Koordinat</span><br>
        <strong>${data.lokasi_lat ? `${data.lokasi_lat.toFixed(4)}, ${data.lokasi_lng.toFixed(4)}` : '-'}</strong>
      </div>
      <div>
        <span class="meta-label" style="color:#64748b;font-size:0.85rem">Status</span><br>
        <span class="status-badge ${window.app.getStatusClass?.(data.status) || ''}" style="display:inline-block;padding:0.25rem 0.6rem;border-radius:999px;font-size:0.75rem;font-weight:600;background:${getStatusColor(data.status)};color:#fff">
          ${window.app.formatStatus?.(data.status) || data.status || 'baru'}
        </span>
      </div>
      <div>
        <span class="meta-label" style="color:#64748b;font-size:0.85rem">Pelapor</span><br>
        <strong>${data.profiles?.nama_lengkap || 'Unknown'}</strong>
      </div>
      <div>
        <span class="meta-label" style="color:#64748b;font-size:0.85rem">Dibuat</span><br>
        <strong>${tglDibuat}</strong>
      </div>
      <div>
        <span class="meta-label" style="color:#64748b;font-size:0.85rem">Terakhir Update</span><br>
        <strong>${tglUpdate}</strong>
      </div>
    </div>
    
    <div style="margin-bottom:1.5rem">
      <strong style="display:block;margin-bottom:0.5rem">📝 Deskripsi:</strong>
      <p class="meta-desc" style="margin:0;padding:0.75rem;background:#f8fafc;border-radius:8px;line-height:1.5;color:#1e293b">
        ${data.deskripsi || '-'}
      </p>
    </div>
    
    ${data.foto_url ? `
      <div>
        <strong style="display:block;margin-bottom:0.5rem">🖼️ Bukti:</strong>
        <a href="${data.foto_url}" target="_blank" class="btn-outline btn-sm" style="display:inline-block;padding:0.4rem 0.8rem;border:1px solid var(--border);border-radius:6px;text-decoration:none;color:var(--primary);font-size:0.85rem">
          📎 Lihat Bukti (Foto/Video)
        </a>
      </div>
    ` : ''}
  `;
  
  // Setup tombol update status (jika ada)
  const updateSection = document.getElementById('modalUpdateSection');
  if (updateSection) {
    // Cek apakah user boleh edit
    const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
    const canEdit = user.role === 'admin_kesbangpol' || 
                    (user.role === 'operator_kec' && data.kecamatan_id === user.kecamatan_id);
    
    if (canEdit) {
      updateSection.classList.remove('d-none');
      const updateReportId = document.getElementById('updateReportId');
      const updateStatusSelect = document.getElementById('updateStatusSelect');
      
      if (updateReportId) updateReportId.value = data.id;
      if (updateStatusSelect) updateStatusSelect.value = data.status;
    } else {
      updateSection.classList.add('d-none');
    }
  }
  
  // Tampilkan modal
  modal.classList.remove('d-none');
  console.log('✅ Modal displayed');
}

// Helper: Warna risiko
function getRisikoColor(risiko) {
  const colors = {
    'Kritis': '#991b1b',
    'Tinggi': '#dc2626',
    'Sedang': '#eab308',
    'Rendah': '#22c55e'
  };
  return colors[risiko] || '#eab308';
}

// Helper: Warna status
function getStatusColor(status) {
  const colors = {
    'baru': '#dbeafe',
    'diproses': '#fef3c7',
    'selesai': '#dcfce7',
    'ditutup': '#f1f5f9'
  };
  return colors[status] || '#f1f5f9';
}

window.showStatusModal = (id, currentStatus) => {
  document.getElementById('updateReportId').value = id;
  document.getElementById('updateStatusSelect').value = currentStatus;
  document.getElementById('modalUpdateSection')?.classList.remove('d-none');
  document.getElementById('modalDetail')?.classList.remove('d-none');
};

window.confirmDelete = async (id) => {
  if (!confirm('⚠️ Yakin ingin menghapus laporan #'+id+'?')) return;
  
  try {
    const { error } = await window.sbClient
      .from('conflict_reports')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    window.app.showToast('🗑️ Laporan berhasil dihapus', 'success');
    await fetchReports(currentFilters);
    
  } catch (err) {
    window.app.showToast('Gagal hapus: ' + err.message, 'error');
  }
};

// ==========================================
// 📥 EXPORT CSV
// ==========================================
function setupExport() {
  document.getElementById('btnExport')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnExport');
    window.app.setLoading(btn, true);
    
    try {
      let query = window.sbClient
        .from('conflict_reports')
        .select(`
          id, judul, kategori, tingkat_risiko, status, created_at,
          kecamatan(nama), desa(nama), profiles(nama_lengkap)
        `)
        .order('created_at', { ascending: false });
      
      if (currentFilters.kecamatan_id) query = query.eq('kecamatan_id', currentFilters.kecamatan_id);
      if (currentFilters.status) query = query.eq('status', currentFilters.status);
      
      const { data, error } = await query;
      if (error) throw error;
      
      const csv = convertToCSV(data);
      downloadCSV(csv, `laporan_sipandai_${new Date().toISOString().slice(0,10)}.csv`);
      
      window.app.showToast('✅ Data berhasil diexport', 'success');
      
    } catch (err) {
      window.app.showToast('Gagal export: ' + err.message, 'error');
    } finally {
      window.app.setLoading(btn, false);
    }
  });
}

function convertToCSV(data) {
  if (!data?.length) return '';
  const headers = ['ID', 'Tanggal', 'Judul', 'Kecamatan', 'Desa', 'Kategori', 'Risiko', 'Status', 'Pelapor', 'Deskripsi'];
  const rows = data.map(d => [
    d.id,
    new Date(d.created_at).toLocaleString('id-ID'),
    `"${(d.judul || '').replace(/"/g, '""')}"`,
    d.kecamatan?.nama || '-',
    d.desa?.nama || '-',
    d.kategori || 'Lainnya',
    d.tingkat_risiko || 'Sedang',
    d.status,
    d.profiles?.nama_lengkap || '-',
    `"${(d.deskripsi || '').replace(/"/g, '""')}"`
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

function downloadCSV(content, filename) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ==========================================
// 🔄 REAL-TIME SUBSCRIPTION (Opsional)
// ==========================================
function setupRealtimeSubscription() {
  if (!window.sbClient?.channel) return;
  
  window.sbClient
    .channel('public:conflict_reports')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'conflict_reports'
    }, (payload) => {
      console.log('🔄 Realtime update:', payload.eventType, payload.new?.id);
      if (document.visibilityState === 'visible') {
        fetchReports(currentFilters);
        window.app.showToast('📊 Data diperbarui secara real-time', 'info');
      }
    })
    .subscribe();
}

// ==========================================
// 👥 VALIDASI LAPORAN PUBLIK (Admin Only)
// ==========================================

async function fetchPendingValidation() {
  try {
    const { data, error } = await window.sbClient
      .from('conflict_reports')
      .select(`
        id, judul, kategori, alamat_lokasi, desa, 
        contact_info, created_at, kecamatan (nama)
      `)
      .eq('is_public', true)
      .eq('status', 'pending_validation')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    renderPendingValidation(data || []);
    document.getElementById('pendingCount').textContent = data?.length || 0;
    
    return data;
  } catch (err) {
    console.error('Gagal fetch pending validation:', err);
    return [];
  }
}

function renderPendingValidation(data) {
  const tbody = document.getElementById('pendingValidationTable');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Tidak ada laporan menunggu validasi.</td></tr>';
    return;
  }
  
  data.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>REF-${item.id}</strong></td>
      <td>${window.app.formatDate(item.created_at)}</td>
      <td>${item.kecamatan?.nama || '-'}, ${item.desa || '-'}</td>
      <td>${item.judul}</td>
      <td>${item.kategori || 'Lainnya'}</td>
      <td>${item.contact_info ? '📞 Ada' : '-'}</td>
      <td style="display:flex;gap:0.25rem">
        <button class="btn-action" style="background:#dcfce7;color:#166534" onclick="validatePublicReport(${item.id}, 'approve')">✅ Setuju</button>
        <button class="btn-action" style="background:#fee2e2;color:#b91c1c" onclick="validatePublicReport(${item.id}, 'reject')">❌ Tolak</button>
        <button class="btn-action" onclick="viewPublicReportDetail(${item.id})">👁️ Detail</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Global function: Validasi laporan publik
window.validatePublicReport = async (id, action) => {
  if (!confirm(action === 'approve' 
    ? '✅ Setujui laporan ini dan ubah status menjadi "baru"?' 
    : '❌ Tolak laporan ini?')) return;
  
  try {
    const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
    
    const updatePayload = {
      status: action === 'approve' ? 'baru' : 'ditolak',
      validated_at: new Date().toISOString(),
      validated_by: user.id,
      validation_notes: action === 'reject' ? prompt('Alasan penolakan (opsional):') : null,
      updated_at: new Date().toISOString()
    };
    
    const { error } = await window.sbClient
      .from('conflict_reports')
      .update(updatePayload)
      .eq('id', id);
    
    if (error) throw error;
    
    window.app.showToast(
      action === 'approve' ? '✅ Laporan disetujui & masuk sistem' : '❌ Laporan ditolak',
      action === 'approve' ? 'success' : 'warning'
    );
    
    // Refresh tables
    await fetchPendingValidation();
    await fetchReports(); // Refresh main table
    
  } catch (err) {
    console.error('Gagal validasi:', err);
    window.app.showToast('Gagal: ' + err.message, 'error');
  }
};

// Global function: Lihat detail laporan publik
window.viewPublicReportDetail = async (id) => {
  const { data, error } = await window.sbClient
    .from('conflict_reports')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) {
    window.app.showToast('Gagal memuat detail', 'error');
    return;
  }
  
  // Tampilkan modal sederhana (bisa pakai modal existing atau alert)
  alert(`📄 Detail Laporan #${id}\n\nJudul: ${data.judul}\nLokasi: ${data.alamat_lokasi}\nDeskripsi: ${data.deskripsi}\nKontak: ${data.contact_info || '-'}`);
};

// Tab switching logic
document.querySelectorAll('.tab-btn')?.forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('d-none'));
    
    e.currentTarget.classList.add('active');
    const tabId = e.currentTarget.dataset.tab;
    document.getElementById(`tab-${tabId}`).classList.remove('d-none');
    
    // Load data if needed
    if (tabId === 'validasi-publik') {
      fetchPendingValidation();
    }
  });
});
