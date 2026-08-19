/**
 * js/config.js
 * Konfigurasi Utama Aplikasi SIPANDAI
 * Inisialisasi Supabase Client & Konstanta Global
 */

// =====================================================================
// 🔑 ISI DUA BARIS DI BAWAH INI DENGAN DATA PROJECT SUPABASE BARU ANDA
//    Supabase Dashboard -> Project Settings -> API
//      • Project URL           -> SUPABASE_URL
//      • Project API keys: anon / public -> SUPABASE_ANON_KEY
//
// ⚠️ HANYA anon/public key. JANGAN PERNAH menaruh service_role key di sini,
//    karena file ini ikut terunggah ke GitHub dan bisa dibaca siapa saja.
//    Anon key memang aman untuk publik SELAMA Row Level Security aktif
//    (sudah diatur oleh supabase/02_rls.sql).
// =====================================================================
// ⚠️ URL ditulis TANPA "/rest/v1/" di belakangnya.
//    Halaman Data API di dashboard menampilkan alamat lengkap
//    (…supabase.co/rest/v1/), tapi supabase-js hanya butuh pangkalnya.
const SUPABASE_URL = 'https://ykzmbjfsrlytctsphxtw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlrem1iamZzcmx5dGN0c3BoeHR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMzI0NDgsImV4cCI6MjEwMjcwODQ0OH0.8ERb_4FeSCcD5cqwYDjfG1QekjIlv2Ku3H0XoxJiymE';

// 📦 Konstanta Aplikasi
const APP_CONFIG = {
  name: 'SIPANDAI',
  region: 'Kepahiang',
  storageBucket: 'bukti-laporan',      // Nama bucket di Supabase Storage
  photoBucket: 'profile-photos',       // Bucket foto profil
  mapDefault: { lat: -3.658, lng: 102.568, zoom: 11 }, // Pusat Kab. Kepahiang
  sessionTimeout: 3600000,             // 1 jam (ms)
  authEmailDomain: 'sipandai.local',   // username -> username@sipandai.local
  roles: {
    ADMIN: 'admin_kesbangpol',
    OPERATOR: 'operator_kec',
    VIEWER: 'viewer'
  }
};

// =====================================================================
// Inisialisasi Supabase Client
// =====================================================================
(function initSupabase() {
  const belumDiisi =
    !SUPABASE_URL ||
    SUPABASE_URL.includes('GANTI-DENGAN') ||
    !SUPABASE_ANON_KEY ||
    SUPABASE_ANON_KEY.includes('GANTI-DENGAN');

  if (belumDiisi) {
    console.error(
      '❌ js/config.js belum dikonfigurasi.\n' +
      '   Isi SUPABASE_URL dan SUPABASE_ANON_KEY dengan data project Supabase baru Anda.'
    );
    tampilkanBannerKonfigurasi();
    return;
  }

  // Library CDN mendaftarkan dirinya sebagai window.supabase
  const lib = window.supabase;
  if (!lib || typeof lib.createClient !== 'function') {
    console.error('❌ Library supabase-js belum termuat. Pastikan tag <script> CDN ada SEBELUM js/config.js.');
    return;
  }

  const sbClient = lib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'sipandai-auth'
    }
  });

  // 🌐 Export ke global window agar bisa dipakai di file JS lain
  window.sbClient = sbClient;
  window.APP_CONFIG = APP_CONFIG;
  window.SUPABASE_URL = SUPABASE_URL;
  window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

  // 🛠️ Cek koneksi ringan saat startup (head:true = tidak menarik data)
  (async () => {
    try {
      const { error } = await sbClient
        .from('kecamatan')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      console.log(`✅ ${APP_CONFIG.name} siap. Terhubung ke Supabase.`);
    } catch (err) {
      console.warn('⚠️ Gagal verifikasi koneksi Supabase:', err.message);
      console.warn('   Cek: URL/anon key benar? Skrip SQL 01–04 sudah dijalankan?');
    }
  })();
})();

// Banner di layar supaya kesalahan konfigurasi tidak "diam-diam"
function tampilkanBannerKonfigurasi() {
  document.addEventListener('DOMContentLoaded', () => {
    const bar = document.createElement('div');
    bar.style.cssText =
      'position:fixed;top:0;left:0;right:0;z-index:99999;background:#b91c1c;color:#fff;' +
      'padding:10px 16px;font:600 14px/1.4 Inter,sans-serif;text-align:center';
    bar.textContent =
      '⚠️ Aplikasi belum terhubung ke database. Isi SUPABASE_URL & SUPABASE_ANON_KEY di js/config.js.';
    document.body.prepend(bar);
  });
}

// 📝 Contoh penggunaan di file lain:
// const { data } = await window.sbClient.from('conflict_reports').select('*');
// const user = JSON.parse(localStorage.getItem('sipandai_user'));
