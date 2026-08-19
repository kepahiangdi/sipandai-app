// js/auth.js

// Toggle password visibility
document.getElementById('togglePassword')?.addEventListener('click', function () {
  const input = document.getElementById('password');
  const type = input.type === 'password' ? 'text' : 'password';
  input.type = type;
  this.textContent = type === 'password' ? '👁️' : '🙈';
});

// Handle Login Submit
document.getElementById('formLogin')?.addEventListener('submit', async function (e) {
  e.preventDefault();
  
  const usernameInput = document.getElementById('username').value.trim().toLowerCase().replace(/\s+/g, '_');
const email = `${usernameInput}@sipandai.local`; // Format internal Supabase
  const password = document.getElementById('password').value;
  const btnSubmit = document.getElementById('btnSubmit');
  const btnText = btnSubmit.querySelector('.btn-text');
  const btnLoading = btnSubmit.querySelector('.btn-loading');
  const loginError = document.getElementById('loginError');
  
  // Reset error
  loginError.classList.add('d-none');
  loginError.textContent = '';
  
  // Validate
  if (!email || !password) {
    showError('Email dan password wajib diisi');
    return;
  }
  
  // Loading state
  btnSubmit.disabled = true;
  btnText.classList.add('d-none');
  btnLoading.classList.remove('d-none');
  
  try {
    // Login via Supabase Auth
    const { data, error } = await window.sbClient.auth.signInWithPassword({
      email: email,
      password: password
    });
    
    if (error) throw error;
    
    // Ambil data profile user untuk cek role
    const { data: profile, error: profileError } = await window.sbClient
      .from('profiles')
      .select('role, kecamatan_id, nama_lengkap')
      .eq('id', data.user.id)
      .single();
    
    if (profileError) throw profileError;
    
    // Simpan session info ke localStorage
    localStorage.setItem('sipandai_user', JSON.stringify({
      id: data.user.id,
      email: data.user.email,
      nama: profile.nama_lengkap,
      role: profile.role,
      kecamatan_id: profile.kecamatan_id
    }));
    
    // Redirect berdasarkan role
    if (profile.role === 'admin_kesbangpol') {
      window.location.href = 'dashboard.html';
    } else if (profile.role === 'operator_kec') {
      window.location.href = 'laporan.html';
    } else {
      window.location.href = 'dashboard.html';
    }
    
  } catch (err) {
    console.error('Login error:', err);
    showError(err.message || 'Terjadi kesalahan saat login');
  } finally {
    // Reset button
    btnSubmit.disabled = false;
    btnText.classList.remove('d-none');
    btnLoading.classList.add('d-none');
  }
});

// Helper: Show error message
function showError(message) {
  const loginError = document.getElementById('loginError');
  loginError.textContent = message;
  loginError.classList.remove('d-none');
}

// Cek session saat halaman login dibuka (jika sudah login, redirect)
async function checkSessionOnLogin() {
  const { data: { session } } = await window.sbClient.auth.getSession();
  if (session) {
    // Sudah login, redirect ke dashboard
    window.location.href = 'dashboard.html';
  }
}

// Jalankan cek session saat halaman load
document.addEventListener('DOMContentLoaded', checkSessionOnLogin);

// Handle forgot password (opsional - kirim reset link via Supabase)
document.getElementById('forgotPassword')?.addEventListener('click', async function (e) {
  e.preventDefault();
  const email = prompt('Masukkan email Anda untuk reset password:');
  if (email) {
    const { error } = await window.sbClient.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/login.html'
    });
    if (error) {
      alert('Gagal mengirim link reset: ' + error.message);
    } else {
      alert('Link reset password telah dikirim ke email Anda.');
    }
  }
});

// Handle logout (bisa dipanggil dari halaman lain)
async function handleLogout() {
  await window.sbClient.auth.signOut();
  localStorage.removeItem('sipandai_user');
  window.location.href = 'login.html';
}
