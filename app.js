/**
 * js/app.js
 * Core Global Utilities & App Initialization for SIPANDAI
 * Menangani: Session Guard, UI Helpers, Formatter, Toast, Offline Handling, Role Check
 */

// ==========================================
// 1. INISIALISASI & PROTECTED PAGE GUARD
// ==========================================
const publicPages = ['index.html', 'login.html', '404.html', ''];

async function initApp() {
  const currentPage = window.location.pathname.split('/').pop();
  
  if (!publicPages.includes(currentPage)) {
    await guardProtectedPage();
  }
  
  initUI();
  initNetworkListener();
  console.log('✅ SIPANDAI App Core Loaded.');
}

async function guardProtectedPage() {
  try {
    // Cek sesi Supabase (jika sudah terkoneksi)
    if (window.sbClient) {
      const { data: { session } } = await window.sbClient.auth.getSession();
      if (!session) throw new Error('No active session');
      
      // Sync ke localStorage untuk akses cepat
      localStorage.setItem('sipandai_session', JSON.stringify(session));
      updateUserUI(session);
      return;
    }
    
    // Fallback dev/mock: cek localStorage manual
    const stored = localStorage.getItem('sipandai_session');
    if (!stored) throw new Error('Session expired');
    updateUserUI(JSON.parse(stored));
    
  } catch (err) {
    console.warn('🔒 Auth guard triggered:', err.message);
    localStorage.removeItem('sipandai_session');
    localStorage.removeItem('sipandai_user');
    window.location.href = 'login.html';
  }
}

// ==========================================
// 2. UI UPDATER & ROLE HANDLER
// ==========================================
// GANTI fungsi updateUserUI di js/app.js dengan ini:
async function updateUserUI(session) {
  const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
  
  // 1. Update nama di topbar
  const nameEl = document.getElementById('userName');
  if (nameEl) nameEl.textContent = user.nama || session.user?.email || 'Pengguna';
  
  // 2. ✅ UPDATE AVATAR OTOMATIS
  const avatarEl = document.getElementById('globalAvatar');
  if (avatarEl && window.sbClient) {
    // Coba ambil dari cache localStorage dulu (lebih cepat)
    const cachedFoto = localStorage.getItem('sipandai_foto_url');
    
    if (cachedFoto) {
      avatarEl.src = cachedFoto;
    } else {
      // Fetch dari Supabase jika belum ada cache
      try {
        const { data: profile } = await window.sbClient
          .from('profiles')
          .select('foto_url')
          .eq('id', user.id)
          .single();
        
        if (profile?.foto_url) {
          avatarEl.src = profile.foto_url;
          localStorage.setItem('sipandai_foto_url', profile.foto_url); // Simpan cache
        }
      } catch (err) {
        console.warn('⚠️ Gagal load foto profil:', err);
      }
    }
  }
  
  // 3. Role-based UI adjustment (tetap sama)
  const role = user.role || 'viewer';
  document.querySelectorAll('[data-role]').forEach(el => {
    const allowed = el.getAttribute('data-role').split(',').map(r => r.trim());
    if (!allowed.includes(role)) el.classList.add('d-none');
  });
}

function checkRole(requiredRoles) {
  const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
  return roles.includes(user.role);
}

// ==========================================
// 3. UI HELPERS (Sidebar, Modal, Toast, Loader)
// ==========================================
function initUI() {
  // Sidebar Toggle (Mobile)
  const toggleBtn = document.getElementById('toggleSidebar');
  const sidebar = document.querySelector('.sidebar');
  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (window.innerWidth <= 768 && !sidebar.contains(e.target) && e.target !== toggleBtn) {
        sidebar.classList.remove('open');
      }
    });
  }

  // Modal Overlay Click-to-Close
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('d-none');
    });
  });

  // Inject Toast CSS jika belum ada
  if (!document.getElementById('toast-css')) {
    const style = document.createElement('style');
    style.id = 'toast-css';
    style.textContent = `
      #toast-container { position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; }
      .toast { padding: 12px 16px; border-radius: 8px; color: #0f172a; font-size: 0.9rem; box-shadow: 0 4px 12px rgba(0,0,0,0.15); animation: slideIn 0.3s ease; min-width: 250px; }
      .toast-success { background: #dcfce7; border-left: 4px solid #166534; }
      .toast-error { background: #fee2e2; border-left: 4px solid #b91c1c; }
      .toast-warning { background: #fef3c7; border-left: 4px solid #b45309; }
      .toast-info { background: #dbeafe; border-left: 4px solid #1e40af; }
      @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    `;
    document.head.appendChild(style);
  }
}

function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function setLoading(btn, isLoading = true) {
  if (!btn) return;
  if (isLoading) {
    btn.dataset.original = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Memproses...';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.original || 'Submit';
  }
}

// ==========================================
// 4. DATA FORMATTERS (PROPER Standard)
// ==========================================
function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch { return '-'; }
}

function formatStatus(status) {
  const map = { baru: 'Baru', diproses: 'Diproses', selesai: 'Selesai', closed: 'Ditutup' };
  return map[status?.toLowerCase()] || status;
}

function formatRisiko(risk) {
  const map = { rendah: '🟢 Rendah', sedang: '🟡 Sedang', tinggi: '🔴 Tinggi', kritis: '🚨 Kritis' };
  return map[risk?.toLowerCase()] || risk;
}

function getRisikoClass(risk) {
  const map = { rendah: 'rendah', sedang: 'sedang', tinggi: 'tinggi', kritis: 'kritis' };
  return `risiko-${map[risk?.toLowerCase()] || 'sedang'}`;
}

function getStatusClass(status) {
  const map = { baru: 'baru', diproses: 'diproses', selesai: 'selesai', closed: 'selesai' };
  return `status-${map[status?.toLowerCase()] || 'baru'}`;
}

// ==========================================
// 5. OFFLINE / NETWORK HANDLER (PROPER: Alternatif Jaringan)
// ==========================================
function initNetworkListener() {
  window.addEventListener('offline', () => {
    showToast('⚠️ Koneksi internet terputus. Mode offline diaktifkan.', 'warning');
    document.body.classList.add('offline-mode');
  });
  
  window.addEventListener('online', () => {
    showToast('✅ Koneksi pulih. Menyiapkan sinkronisasi data...', 'success');
    document.body.classList.remove('offline-mode');
    // Trigger sync queue jika ada
    if (typeof window.syncOfflineQueue === 'function') window.syncOfflineQueue();
  });
}

// ==========================================
// 6. GLOBAL EVENT DELEGATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  
  // Logout Handler
  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    if (confirm('Yakin ingin keluar dari sistem?')) {
      if (window.sbClient) await window.sbClient.auth.signOut();
      localStorage.clear();
      window.location.href = 'login.html';
    }
  });

  // Print Helper
  document.querySelectorAll('[data-action="print"]').forEach(btn => {
    btn.addEventListener('click', () => window.print());
  });
});

// ==========================================
// 7. EXPORT TO GLOBAL SCOPE
// ==========================================
window.app = {
  showToast,
  setLoading,
  formatDate,
  formatStatus,
  formatRisiko,
  getRisikoClass,
  getStatusClass,
  checkRole,
  guardProtectedPage
};
