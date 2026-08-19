/**
 * js/users.js
 * Manajemen Pengguna — HANYA untuk halaman users.html
 * Dapat diakses oleh admin_kesbangpol dan kepala_badan.
 *
 * Perbaikan penting:
 *  1. Guard admin hanya berjalan bila elemen users.html benar-benar ada.
 *     Sebelumnya file ini ikut dimuat di dashboard/laporan/peta/koordinasi/profil
 *     sehingga operator & viewer selalu ditendang keluar.
 *  2. Sesi admin dipulihkan setelah auth.signUp(). Tanpa ini, admin otomatis
 *     "berganti identitas" menjadi user yang baru saja dibuat.
 *  3. Role & kecamatan dikirim lewat metadata signUp dan dipasang oleh trigger
 *     handle_new_user di database (tidak lagi lewat UPDATE dari sisi klien).
 *  4. Dropdown kecamatan diisi dari tabel kecamatan, bukan hardcode.
 */

document.addEventListener('DOMContentLoaded', async () => {
  // 🚦 Hanya jalan di halaman users.html
  if (!document.getElementById('userTableBody')) return;

  const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
  if (!window.app.isPimpinan(user.role)) {
    window.app?.showToast?.('🚫 Akses ditolak. Hanya pimpinan yang bisa mengelola user.', 'error');
    setTimeout(() => (window.location.href = 'dashboard.html'), 1500);
    return;
  }

  await loadKecamatanOptions();
  await loadUsers();
  setupAddUserForm();
});

// 📍 Isi dropdown kecamatan dari database
async function loadKecamatanOptions() {
  const select = document.getElementById('newKecamatan');
  if (!select || !window.sbClient) return;

  try {
    const { data, error } = await window.sbClient
      .from('kecamatan')
      .select('id, nama')
      .order('nama');
    if (error) throw error;

    select.innerHTML = '<option value="">-- Semua / Viewer --</option>';
    data.forEach(k => {
      const opt = document.createElement('option');
      opt.value = k.id;
      opt.textContent = k.nama;
      select.appendChild(opt);
    });
  } catch (err) {
    console.warn('⚠️ Gagal memuat kecamatan, memakai daftar bawaan:', err.message);
  }
}

// 📥 Load daftar user dari tabel profiles
async function loadUsers() {
  try {
    const { data, error } = await window.sbClient
      .from('profiles')
      .select('id, nama_lengkap, role, kecamatan_id, is_active, created_at, kecamatan(nama)')
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
      const idPendek = u.id ? u.id.split('-')[0] + '…' : '-';
      tr.innerHTML = `
        <td><strong>${escapeHtml(u.nama_lengkap) || '-'}</strong></td>
        <td><code title="${u.id}">${idPendek}</code></td>
        <td><span class="status-badge ${window.app.isPimpinan(u.role) ? 'status-diproses' : 'status-baru'}">${window.app.labelRole(u.role)}</span></td>
        <td>${u.kecamatan?.nama || (window.app.isPimpinan(u.role) ? 'Semua' : '-')}</td>
        <td>${window.app.formatDate(u.created_at)}</td>
        <td>
          ${!window.app.isPimpinan(u.role) ? `
            <button class="btn-action" onclick="resetUserPassword('${u.id}')">🔁 Reset PW</button>
            <button class="btn-action text-danger" onclick="confirmDeleteUser('${u.id}')">🗑️</button>
          ` : `<span class="text-muted">${window.app.labelRole(u.role)}</span>`}
        </td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error('Gagal load user:', err);
    window.app.showToast('Gagal memuat daftar user: ' + err.message, 'error');
  }
}

function escapeHtml(s) {
  return (s ?? '').toString().replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
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
    if (window.app.isPimpinan(role) && !confirm(
          `Beri wewenang PENUH se-kabupaten kepada "${nama}" sebagai ${window.app.labelRole(role)}?\n\n` +
          'Akun ini nanti dapat melihat seluruh laporan, memvalidasi laporan warga, ' +
          'serta membuat & menghapus akun pengguna lain.')) {
      return;
    }
    if (role === 'operator_kec' && !kecamatan_id) {
      window.app.showToast('Operator kecamatan wajib dipilihkan kecamatannya', 'error');
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    window.app.setLoading(btn, true);

    // 🔐 Simpan sesi pimpinan dulu — signUp akan menimpa sesi aktif
    const { data: { session: adminSession } } = await window.sbClient.auth.getSession();
    let userBaruId = null;      // diisi bila pendaftaran berhasil
    let peranDiminta = null;    // diisi bila peran perlu dinaikkan setelah sesi pulih

    try {
      const domain = window.APP_CONFIG?.authEmailDomain || 'sipandai.local';

      // Peran pimpinan (kepala_badan / admin_kesbangpol) SENGAJA tidak dikirim
      // lewat metadata pendaftaran — trigger handle_new_user() memang menolaknya,
      // supaya tidak ada jalan bagi orang luar mengangkat dirinya jadi pimpinan.
      // Untuk peran itu, akun dibuat dulu sebagai viewer, lalu dinaikkan
      // melalui UPDATE yang dijalankan memakai sesi pimpinan yang sedang login.
      const perluDinaikkan = window.app.isPimpinan(role);

      const { data, error: signUpError } = await window.sbClient.auth.signUp({
        email: `${username}@${domain}`,
        password: password,
        options: {
          data: {
            nama_lengkap: nama,
            role: perluDinaikkan ? 'viewer' : role,
            kecamatan_id: kecamatan_id ? String(kecamatan_id) : ''
          }
        }
      });

      if (signUpError) throw signUpError;
      if (!data.user) throw new Error('Gagal membuat user');

      userBaruId = data.user.id;
      peranDiminta = perluDinaikkan ? role : null;

      window.app.showToast(`✅ User "${nama}" dibuat. Username untuk login: ${username}`, 'success');
      form.reset();

    } catch (err) {
      console.error('Gagal buat user:', err);
      let msg = err.message || 'Gagal membuat user';
      if (/already registered|already been registered/i.test(msg)) {
        msg = 'Username sudah digunakan. Coba yang lain.';
      }
      window.app.showToast('❌ ' + msg, 'error');

    } finally {
      // 🔐 Kembalikan sesi pimpinan apa pun hasilnya
      if (adminSession) {
        try {
          await window.sbClient.auth.setSession({
            access_token: adminSession.access_token,
            refresh_token: adminSession.refresh_token
          });
        } catch (e) {
          console.warn('⚠️ Gagal memulihkan sesi pimpinan:', e.message);
        }
      }

      // Naikkan peran SETELAH sesi pimpinan pulih, sehingga aturan database
      // melihatnya sebagai tindakan pimpinan — bukan tindakan user baru itu sendiri.
      if (userBaruId && peranDiminta) {
        try {
          const { error } = await window.sbClient
            .from('profiles')
            .update({ role: peranDiminta, kecamatan_id: null })
            .eq('id', userBaruId);
          if (error) throw error;
          window.app.showToast(`✅ Peran ditetapkan: ${window.app.labelRole(peranDiminta)}`, 'success');
        } catch (e) {
          console.error('Gagal menetapkan peran:', e);
          window.app.showToast(
            '⚠️ Akun dibuat, tetapi perannya masih Viewer. Ubah manual lewat SQL Editor. (' + e.message + ')',
            'warning'
          );
        }
      }

      window.app.setLoading(btn, false);
      await loadUsers();
    }
  });
}

// 🔁 Reset password (kirim link reset via Supabase)
window.resetUserPassword = async (userId) => {
  const domain = window.APP_CONFIG?.authEmailDomain || 'sipandai.local';
  const username = prompt(`Masukkan username user tersebut (tanpa @${domain}):`);
  if (!username) return;

  const email = `${username.trim().toLowerCase().replace(/\s+/g, '_')}@${domain}`;

  try {
    const { error } = await window.sbClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/login.html'
    });
    if (error) throw error;
    window.app.showToast(
      `✅ Permintaan reset dikirim untuk ${email}. ` +
      'Catatan: domain internal .local tidak menerima email — untuk kasus ini ganti password lewat Supabase Dashboard → Authentication → Users.',
      'info'
    );
  } catch (err) {
    window.app.showToast('Gagal: ' + err.message, 'error');
  }
};

// 🗑️ Hapus user
// Catatan: ini menghapus baris di public.profiles. Akun di auth.users TIDAK ikut
// terhapus dari sisi klien (butuh service_role). Hapus juga lewat
// Supabase Dashboard → Authentication → Users bila ingin benar-benar bersih.
window.confirmDeleteUser = async (userId) => {
  if (!confirm('⚠️ Hapus profil user ini?\n\nData laporan yang pernah dibuat tetap tersimpan.\nAkun login-nya masih perlu dihapus manual di Supabase Dashboard → Authentication → Users.')) return;

  try {
    const { error } = await window.sbClient
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (error) throw error;

    window.app.showToast('🗑️ Profil user berhasil dihapus', 'success');
    await loadUsers();
  } catch (err) {
    window.app.showToast('Gagal hapus: ' + err.message, 'error');
  }
};

// 🔄 Refresh button
document.getElementById('btnRefresh')?.addEventListener('click', loadUsers);
