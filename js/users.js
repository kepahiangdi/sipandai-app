/**
 * js/users.js
 * User Management - Hanya bisa diakses oleh admin_kesbangpol
 * Menggunakan signUp + profile update (aman selama email confirmation OFF)
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 🛡️ Guard: Hanya admin yang boleh akses
  const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
  if (user.role !== 'admin_kesbangpol') {
    window.app.showToast(' Akses ditolak. Hanya admin yang bisa mengelola user.', 'error');
    setTimeout(() => window.location.href = 'dashboard.html', 1500);
    return;
  }

  await loadUsers();
  setupAddUserForm();
});

// 📥 Load daftar user dari tabel profiles
async function loadUsers() {
  try {
    const { data, error } = await window.sbClient
      .from('profiles')
      .select('id, nama_lengkap, role, kecamatan_id, created_at, kecamatan(nama)')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!data?.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Tidak ada data user.</td></tr>';
      return;
    }

    data.forEach(u => {
      const tr = document.createElement('tr');
      const username = u.id ? u.id.split('-')[0] + '...' : '-'; // Tampilkan sebagian ID sebagai username proxy
      tr.innerHTML = `
        <td><strong>${u.nama_lengkap || '-'}</strong></td>
        <td><code>${username}</code></td>
        <td><span class="status-badge ${u.role === 'admin_kesbangpol' ? 'status-diproses' : 'status-baru'}">${u.role}</span></td>
        <td>${u.kecamatan?.nama || (u.role === 'admin_kesbangpol' ? 'Semua' : '-')}</td>
        <td>${window.app.formatDate(u.created_at)}</td>
        <td>
          ${u.role !== 'admin_kesbangpol' ? `
            <button class="btn-action" onclick="resetUserPassword('${u.id}')">🔁 Reset PW</button>
            <button class="btn-action text-danger" onclick="confirmDeleteUser('${u.id}')">🗑️</button>
          ` : '<span class="text-muted">Admin</span>'}
        </td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error('Gagal load user:', err);
    window.app.showToast('Gagal memuat daftar user', 'error');
  }
}

// ➕ Handle form tambah user
function setupAddUserForm() {
  const form = document.getElementById('formAddUser');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nama = document.getElementById('newNama').value.trim();
    const username = document.getElementById('newUsername').value.trim().toLowerCase().replace(/\s+/g, '_');
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newRole').value;
    const kecamatan_id = document.getElementById('newKecamatan').value || null;

    if (!nama || !username || !password || !role) {
      window.app.showToast('Semua field wajib diisi', 'error');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    window.app.setLoading(btn, true);

    try {
      // 1. Buat user di Auth (format internal @sipandai.local)
      const { data, error: signUpError } = await window.sbClient.auth.signUp({
        email: `${username}@sipandai.local`,
        password: password,
        options: {
          data: { nama_lengkap: nama } // metadata opsional
        }
      });

      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('Gagal membuat user');

      // 2. Update profile dengan role & kecamatan_id (trigger handle_new_user sudah buat baris kosong)
      const { error: updateError } = await window.sbClient
        .from('profiles')
        .update({
          nama_lengkap: nama,
          role: role,
          kecamatan_id: kecamatan_id ? parseInt(kecamatan_id) : null
        })
        .eq('id', data.user.id);

      if (updateError) throw updateError;

      window.app.showToast(`✅ User "${nama}" berhasil dibuat. Username: ${username}`, 'success');
      form.reset();
      await loadUsers(); // Refresh tabel

    } catch (err) {
      console.error('Gagal buat user:', err);
      let msg = err.message || 'Gagal membuat user';
      if (msg.includes('already registered')) msg = 'Username sudah digunakan. Coba yang lain.';
      window.app.showToast('❌ ' + msg, 'error');
    } finally {
      window.app.setLoading(btn, false);
    }
  });
}

// 🔁 Reset password (kirim link reset via Supabase)
window.resetUserPassword = async (userId) => {
  const email = prompt('Masukkan email internal user (contoh: operator_kepahiang@sipandai.local):');
  if (!email) return;

  try {
    const { error } = await window.sbClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/login.html'
    });
    if (error) throw error;
    window.app.showToast('✅ Link reset password dikirim. User bisa ganti password via login.', 'success');
  } catch (err) {
    window.app.showToast('Gagal: ' + err.message, 'error');
  }
};

// ️ Hapus user (cascade ke auth.users jika trigger setup benar)
window.confirmDeleteUser = async (userId) => {
  if (!confirm('⚠️ Yakin ingin menghapus user ini? Data laporan yang dibuat tetap tersimpan.')) return;

  try {
    const { error } = await window.sbClient
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (error) throw error;

    window.app.showToast('🗑️ User berhasil dihapus', 'success');
    await loadUsers();
  } catch (err) {
    window.app.showToast('Gagal hapus: ' + err.message, 'error');
  }
};

// 🔄 Refresh button
document.getElementById('btnRefresh')?.addEventListener('click', loadUsers);
