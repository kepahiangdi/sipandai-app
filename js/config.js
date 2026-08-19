/**
 * js/config.js
 * Konfigurasi Utama Aplikasi SIPANDAI
 * Inisialisasi Supabase Client & Konstanta Global
 */

// 🔑 GANTI DENGAN DATA DARI DASHBOARD SUPABASE ANDA
// Settings → API → Project URL & Project API keys (anon/public)
const SUPABASE_URL = 'https://fnyfxaiurjdpinatclcg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZueWZ4YWl1cmpkcGluYXRjbGNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2OTM2NzAsImV4cCI6MjA5NTI2OTY3MH0.hULKoNqqaTm39rs5Qoa-8WTmMPpzl81JvePRcEpl3TQ'; // 🔒 Hanya gunakan ANON KEY, JANGAN SERVICE ROLE KEY!

// Inisialisasi Supabase Client
// Pastikan script CDN Supabase sudah dimuat di HTML sebelum file ini
const { createClient } = supabase;
const sbClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 📦 Konstanta Aplikasi
const APP_CONFIG = {
  name: 'SIPANDAI',
  region: 'Kepahiang',
  storageBucket: 'bukti-laporan',      // Nama bucket di Supabase Storage
  mapDefault: { lat: -3.658, lng: 102.568, zoom: 11 }, // Pusat Kab. Kepahiang
  sessionTimeout: 3600000,             // 1 jam (ms)
  roles: {
    ADMIN: 'admin_kesbangpol',
    OPERATOR: 'operator_kec',
    VIEWER: 'viewer'
  }
};

// 🌐 Export ke global window agar bisa dipakai di file JS lain
window.sbClient = sbClient;
window.APP_CONFIG = APP_CONFIG;
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

// 🛠️ Helper: Cek koneksi Supabase saat startup
(async () => {
  try {
    const { data, error } = await sbClient.from('profiles').select('count').single();
    if (error && error.code !== 'PGRST116') throw error;
    console.log(`✅ ${APP_CONFIG.name} siap. Terhubung ke Supabase.`);
  } catch (err) {
    console.warn('⚠️ Gagal verifikasi koneksi Supabase:', err.message);
  }
})();

// 📝 Contoh penggunaan di file lain:
// const { data } = await window.sbClient.from('conflict_reports').select('*');
// const user = JSON.parse(localStorage.getItem('sipandai_user'));
