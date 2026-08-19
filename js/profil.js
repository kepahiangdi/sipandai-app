/**
 * js/profil.js
 * Profile Management & Photo Upload
 */

document.addEventListener('DOMContentLoaded', async () => {
  await loadProfileData();
  setupPhotoUpload();
  setupPasswordChange();
});

// Load data profile dari Supabase
async function loadProfileData() {
  try {
    const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
    
    // Ambil data lengkap dari profiles
    const { data: profile, error } = await window.sbClient
      .from('profiles')
      .select('*, kecamatan(nama)')
      .eq('id', user.id)
      .single();
    
    if (error) throw error;
    
    // Update UI
    document.getElementById('profileNama').textContent = profile.nama_lengkap || '-';
    document.getElementById('profileEmail').textContent = user.email || '-';
    document.getElementById('profileRole').textContent = profile.role || '-';
    document.getElementById('profileWilayah').textContent = 
      profile.kecamatan?.nama || (profile.role === 'admin_kesbangpol' ? 'Semua Wilayah' : '-');
    document.getElementById('profileJoin').textContent = 
      window.app.formatDate(profile.created_at);
    
    // Load foto profil jika ada
    if (profile.foto_url) {
      document.getElementById('profileAvatar').src = profile.foto_url;
    }
    
  } catch (err) {
    console.error('Gagal load profile:', err);
    window.app.showToast('Gagal memuat data profil', 'error');
  }
}

// Setup upload foto
function setupPhotoUpload() {
  const input = document.getElementById('uploadFoto');
  if (!input) return;
  
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // Validasi
    if (!file.type.startsWith('image/')) {
      window.app.showToast('Hanya file gambar yang diperbolehkan', 'error');
      return;
    }
    
    if (file.size > 2 * 1024 * 1024) { // 2MB
      window.app.showToast('Ukuran file maksimal 2MB', 'error');
      return;
    }
    
    const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
    const progressDiv = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    
    try {
      // Tampilkan progress
      progressDiv.classList.remove('d-none');
      progressFill.style.width = '30%';
      progressText.textContent = 'Mengupload...';
      
      // Generate filename unik
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}_${Date.now()}.${fileExt}`;
      const filePath = `profiles/${fileName}`;
      
      // Upload ke Supabase Storage
      const { error: uploadError } = await window.sbClient.storage
        .from('profile-photos') // Pastikan bucket ini sudah dibuat
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });
      
      if (uploadError) throw uploadError;
      
      progressFill.style.width = '70%';
      progressText.textContent = 'Menyimpan...';
      
      // Dapatkan public URL
      const { data: { publicUrl } } = window.sbClient.storage
        .from('profile-photos')
        .getPublicUrl(filePath);
      
      // Update database
      const { error: updateError } = await window.sbClient
        .from('profiles')
        .update({ foto_url: publicUrl })
        .eq('id', user.id);
      
      if (updateError) throw updateError;
      
      progressFill.style.width = '100%';
      progressText.textContent = 'Selesai!';
      
      // Update avatar di UI
      document.getElementById('profileAvatar').src = publicUrl;
      
      window.app.showToast('✅ Foto profil berhasil diupdate', 'success');
      
      // Hide progress setelah 1 detik
      setTimeout(() => {
        progressDiv.classList.add('d-none');
        progressFill.style.width = '0%';
      }, 1000);
      
    } catch (err) {
      console.error('Upload error:', err);
      window.app.showToast('Gagal upload foto: ' + err.message, 'error');
      progressDiv.classList.add('d-none');
    }
  });
}

// Setup ganti password
function setupPasswordChange() {
  const form = document.getElementById('formPassword');
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const oldPass = document.getElementById('oldPass').value;
    const newPass = document.getElementById('newPass').value;
    const confirmPass = document.getElementById('confirmPass').value;
    
    if (newPass !== confirmPass) {
      window.app.showToast('Password baru tidak cocok', 'error');
      return;
    }
    
    if (newPass.length < 8) {
      window.app.showToast('Password minimal 8 karakter', 'error');
      return;
    }
    
    try {
      // Update password via Supabase Auth
      const { error } = await window.sbClient.auth.updateUser({
        password: newPass
      });
      
      if (error) throw error;
      
      window.app.showToast('✅ Password berhasil diubah', 'success');
      form.reset();
      
    } catch (err) {
      window.app.showToast('Gagal ubah password: ' + err.message, 'error');
    }
  });
}
