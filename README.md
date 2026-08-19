# SIPANDAI — Kabupaten Kepahiang

**Sistem Informasi Pemantauan dan Deteksi Dini Konflik Sosial**
Badan Kesatuan Bangsa dan Politik Kabupaten Kepahiang, Provinsi Bengkulu.

Aplikasi web statis (HTML + CSS + JavaScript murni) dengan Supabase sebagai
database, autentikasi, dan penyimpanan berkas.

---

## Fitur

- **Dashboard** — statistik, tren 7 hari, komposisi kategori, mini peta, peringatan dini
- **Pelaporan** — formulir laporan konflik dengan dropdown kecamatan → desa, unggah bukti, ekspor CSV, cetak PDF
- **Peta Konflik** — sebaran laporan di peta Kepahiang dengan penanda warna sesuai tingkat risiko
- **Lapor dari Peta** — petugas kecamatan menandai titik kejadian langsung di peta atau lewat GPS, melampirkan foto, lalu mengirim laporan dari lapangan. Tanpa sinyal, laporan tersimpan di perangkat dan terkirim otomatis saat koneksi pulih
- **Koordinasi** — agenda rapat/monitoring, notulensi, tindak lanjut, arsip
- **Kanal Laporan Publik** — warga dapat melapor tanpa akun; laporan masuk antrean validasi admin
- **Kelola Pengguna** — admin membuat akun operator kecamatan / viewer
- **Notifikasi real-time** — lonceng notifikasi terisi otomatis saat ada laporan berisiko tinggi

## Struktur berkas

```
├── index.html              Halaman depan
├── login.html              Masuk sistem
├── dashboard.html          Ringkasan & statistik
├── laporan.html            Pelaporan + validasi laporan publik
├── laporan-public.html     Formulir laporan warga (tanpa login)
├── peta.html               Peta sebaran konflik
├── koordinasi.html         Forum koordinasi & tindak lanjut
├── profil.html             Profil pengguna
├── users.html              Kelola pengguna (admin)
├── css/                    Gaya tampilan
├── js/
│   ├── config.js           ⚙️ URL & anon key Supabase — WAJIB DIISI
│   ├── app.js              Penjaga sesi, helper UI, format tanggal/status
│   ├── auth.js             Login / logout / reset password
│   ├── dashboard.js        Statistik & grafik
│   ├── reports.js          Pelaporan
│   ├── maps.js             Peta Leaflet
│   ├── koordinasi.js       Koordinasi
│   ├── users.js            Kelola pengguna
│   ├── profil.js           Profil & foto
│   ├── notifications.js    Notifikasi
│   └── sync.js             Antrean offline
├── supabase/               📦 Skrip SQL penyiapan database (jalankan berurutan)
└── PANDUAN-MIGRASI-SUPABASE.md   Langkah lengkap penyiapan
```

## Cara menjalankan

1. Siapkan database mengikuti **[PANDUAN-MIGRASI-SUPABASE.md](PANDUAN-MIGRASI-SUPABASE.md)**.
2. Isi `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di `js/config.js`.
3. Buka lewat server lokal (VS Code **Live Server**) atau GitHub Pages.
   Jangan dibuka langsung sebagai `file://` — Supabase memerlukan origin `http`/`https`.

## Peran pengguna

| Role | Kemampuan |
|---|---|
| `admin_kesbangpol` | Akses penuh seluruh kabupaten, validasi laporan publik, kelola pengguna |
| `operator_kec` | Membuat & mengubah data pada kecamatannya sendiri |
| `viewer` | Hanya membaca |

Pembatasan ini ditegakkan di sisi database melalui Row Level Security.

## Teknologi

Supabase (PostgreSQL, Auth, Storage, Realtime) · Leaflet + OpenStreetMap · Chart.js · JavaScript ES6 tanpa framework

## Lisensi

Lihat berkas [LICENSE](LICENSE).
