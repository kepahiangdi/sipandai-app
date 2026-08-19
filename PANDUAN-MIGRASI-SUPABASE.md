# Panduan Migrasi SIPANDAI ke Supabase Baru

Dokumen ini untuk kondisi Anda sekarang: kode aplikasi sudah ada dan sudah diunggah ke
GitHub baru, tetapi database Supabase lama tidak bisa diakses lagi karena email
pemiliknya lupa. Yang perlu dilakukan adalah **membangun ulang database dari nol** di
project Supabase baru, lalu mengarahkan aplikasi ke sana.

Estimasi waktu: 20–30 menit.

---

## Ringkasan yang sudah disiapkan

| Berkas | Isi |
|---|---|
| `supabase/01_schema.sql` | Tabel, relasi, index, fungsi bantu, trigger, RPC laporan publik, realtime |
| `supabase/02_rls.sql` | Row Level Security — aturan siapa boleh lihat/ubah data apa |
| `supabase/03_storage.sql` | Bucket `bukti-laporan` & `profile-photos` beserta policy-nya |
| `supabase/04_seed_wilayah.sql` | 8 kecamatan, 12 kelurahan, 105 desa Kabupaten Kepahiang |
| `supabase/05_admin.sql` | Mengangkat akun pertama menjadi `admin_kesbangpol` |
| `supabase/06_operator.sql` | Menetapkan peran & kecamatan operator (bila akun dibuat lewat Dashboard) |
| `supabase/07_role_kepala.sql` | Menambah peran `kepala_badan` (Kepala Badan Kesbangpol) |

Struktur database yang dibuat:

```
kecamatan (8 baris, id 8..15)
   └── desa (117 baris: 105 desa + 12 kelurahan)
profiles          ← 1 baris per akun login, berisi role & kecamatan
conflict_reports  ← laporan konflik (internal + kanal publik)
koordinasi        ← rapat / monitoring / tindak lanjut
notifications     ← notifikasi lonceng, terisi otomatis oleh trigger
```

---

## Langkah 1 — Buat project Supabase baru

1. Masuk ke <https://supabase.com/dashboard> dengan email yang **masih Anda kuasai**.
2. **New project** → isi:
   - Name: `sipandai-kepahiang`
   - Database Password: simpan baik-baik (dibutuhkan jika suatu saat backup/restore)
   - Region: **Southeast Asia (Singapore)** — paling dekat dengan Bengkulu
3. Tunggu sampai status project hijau (± 2 menit).

> ⚠️ Catat email dan password akun Supabase ini di tempat aman (mis. password manager
> atau surat resmi yang disimpan Kabid). Masalah yang Anda alami sekarang muncul persis
> karena hal ini terlewat.
>
> Saran tambahan: pakai email dinas bersama (mis. `bkdkepahiang.bengkulu@gmail.com`)
> lalu tambahkan minimal satu orang lain sebagai member organisasi Supabase, supaya
> project tidak "mati" ketika satu orang pindah tugas.

## Langkah 2 — Jalankan skrip SQL secara berurutan

Buka **SQL Editor → New query**, lalu tempel isi tiap berkas dan tekan **Run**.
Urutannya tidak boleh dibalik:

1. `supabase/01_schema.sql`
2. `supabase/02_rls.sql`
3. `supabase/03_storage.sql`
4. `supabase/04_seed_wilayah.sql`

Pesan `NOTICE: ... does not exist, skipping` itu **normal** — skrip memang dirancang
aman dijalankan berulang.

Cek hasilnya:

```sql
select k.nama,
       count(*) filter (where d.jenis = 'desa')      as desa,
       count(*) filter (where d.jenis = 'kelurahan') as kelurahan
from kecamatan k
left join desa d on d.kecamatan_id = k.id
group by k.nama order by k.nama;
```

Harus keluar 8 baris dengan total 105 desa dan 12 kelurahan.

## Langkah 3 — Matikan konfirmasi email

Karena aplikasi memakai username internal (`admin` → `admin@sipandai.local`) yang tidak
punya kotak surat sungguhan, konfirmasi email harus dimatikan:

**Authentication → Sign In / Providers → Email**

- **Confirm email**: OFF
- **Allow new users to sign up**: ON *(dibutuhkan halaman Kelola User)*
- Minimum password length: 8

> Catatan keamanan: dengan sign-up terbuka, siapa pun yang tahu URL project secara teknis
> bisa mendaftar. Namun akun hasil pendaftaran mandiri **selalu** mendapat role `viewer`
> tanpa kecamatan — trigger `handle_new_user()` menolak permintaan role `admin_kesbangpol`
> dari sisi klien. Bila nanti ingin lebih ketat, lihat bagian "Pengembangan lanjutan".

## Langkah 4 — Buat akun admin pertama

1. **Authentication → Users → Add user → Create new user**
   - Email: `admin@sipandai.local`
   - Password: (rahasia, minimal 8 karakter)
   - ✅ centang **Auto Confirm User**
2. Kembali ke **SQL Editor**, jalankan `supabase/05_admin.sql`.
3. Pastikan hasil query terakhir menampilkan `role = admin_kesbangpol`.

Nanti di halaman login, cukup ketik username **`admin`** (tanpa `@sipandai.local`) —
aplikasi yang menambahkan domainnya.

## Langkah 5 — Ambil URL & anon key, tempel ke aplikasi

**Project Settings → API**, salin dua nilai:

- **Project URL** → contoh `https://abcdefghijkl.supabase.co`
- **Project API keys → anon / public** → string panjang diawali `eyJ...`

Buka `js/config.js`, ganti dua baris teratas:

```js
const SUPABASE_URL = 'https://abcdefghijkl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

Kalau lupa mengisi, aplikasi sekarang menampilkan banner merah di layar — tidak lagi
gagal diam-diam.

> **anon key aman dipublikasikan** di repo GitHub. Ia hanya "kartu tamu"; yang benar-benar
> menjaga data adalah Row Level Security di `02_rls.sql`. Yang **tidak boleh** ikut ke
> GitHub adalah `service_role key`.

## Langkah 6 — Uji satu per satu

Jalankan aplikasi (buka `index.html` lewat Live Server / GitHub Pages — jangan `file://`,
karena Supabase butuh origin http/https).

| Halaman | Yang dicek |
|---|---|
| `login.html` | Login sebagai `admin` berhasil, diarahkan ke dashboard |
| `dashboard.html` | Kartu statistik terisi, grafik muncul, mini map tampil |
| `laporan.html` | Dropdown kecamatan terisi 8 item; pilih kecamatan → dropdown desa ikut terisi |
| `laporan.html` | Kirim satu laporan uji + lampiran foto → muncul di tabel |
| `peta.html` | Marker laporan uji tadi muncul di peta |
| `peta.html` | Tekan "+ Lapor di Sini" → ketuk peta → isi formulir → terkirim |
| `peta.html` | Matikan data seluler, kirim satu laporan → muncul penanda "menunggu kirim"; nyalakan lagi → terkirim sendiri |
| `koordinasi.html` | Buat satu kegiatan, ubah statusnya jadi Selesai |
| `users.html` | Buat operator kecamatan → **admin tetap login sebagai admin** |
| `profil.html` | Upload foto profil, ganti password |
| `laporan-public.html` | Kirim laporan tanpa login → muncul nomor referensi |
| `laporan.html` (tab Validasi) | Laporan publik tadi muncul dan bisa disetujui/ditolak |

Kalau ada yang gagal, buka **Console** browser (F12). Pesan error dari Supabase kini
ditampilkan apa adanya, jadi mudah dilacak.

---

## Perbaikan kode yang ikut dilakukan

Selain menyiapkan database, beberapa masalah pada kode ikut dibereskan:

| # | Masalah | Akibatnya dulu | Perbaikan |
|---|---|---|---|
| 1 | `js/users.js` dimuat di semua halaman, padahal isinya penjaga khusus admin | Operator & viewer langsung ditendang ke dashboard saat membuka Pelaporan/Peta/Koordinasi/Profil | Penjaga hanya aktif bila elemen `users.html` ada; tag `<script>`-nya dihapus dari 5 halaman lain |
| 2 | `auth.signUp()` di halaman Kelola User | Admin ikut "berganti identitas" jadi user yang baru dibuat | Sesi admin disimpan sebelum dan dipulihkan sesudah `signUp()` |
| 3 | Role & kecamatan di-set lewat `UPDATE` dari browser | Pengguna bisa menaikkan role sendiri jadi admin | Role dikirim sebagai metadata dan dipasang trigger `handle_new_user()`; ada trigger `guard_role_change()` yang menolak eskalasi |
| 4 | Komentar SQL `--` di dalam string `.select()` PostgREST | Modal detail laporan gagal dimuat | Komentar dihapus, join `desa` & `profiles` dipakai penuh |
| 5 | Form publik menyimpan `desa` sebagai teks, halaman lain memakai `desa_id` | Bentrok nama kolom vs nama tabel relasi | Form publik kini memakai dropdown desa dari database; kolom teks jadi `desa_nama` (arsip) |
| 6 | Laporan publik memakai `insert().select()` sebagai anon | Perlu memberi hak baca ke publik — seluruh isi laporan bisa dibaca siapa saja | Diganti fungsi database `submit_public_report()`; anon hanya boleh mengirim, tidak boleh membaca |
| 7 | `dashboard.js` memakai `.limit(5)` lalu menghitung statistik dari 5 baris itu | "Total Laporan" mentok di angka 5 | Statistik/grafik/peta dihitung dari seluruh data, tabel "Terkini" mengambil 5 teratas |
| 8 | `js/sync.js` tidak pernah dimuat & isinya masih `// commented` | Mode offline sama sekali tidak jalan | `sync.js` dimuat di `laporan.html`, antrean benar-benar dikirim ke Supabase, ekspor global diperbaiki |
| 9 | `config.js` mengecek koneksi dengan `select('count')` | Selalu memunculkan peringatan palsu di console | Diganti `head:true` count ke tabel `kecamatan` |
| 10 | `maps.js` punya tombol logout sendiri | Keluar tanpa `signOut()` — sesi Supabase masih hidup | Handler duplikat dihapus, logout terpusat di `app.js` |
| 11 | Cache `sipandai_foto_url` tidak dibersihkan | Foto profil pengguna sebelumnya nyangkut | Dibersihkan saat login & logout, diperbarui saat upload |
| 12 | `assets/icons/avatar.png` tidak ada di repo | Ikon pengguna rusak di semua halaman | File avatar default ditambahkan |
| 13 | Operator bisa memilih kecamatan lain di form laporan | Ditolak RLS dengan pesan membingungkan | Dropdown dikunci ke kecamatan operator |

---

## Peran pengguna

| Role | Laporan | Koordinasi | Kelola user |
|---|---|---|---|
| `kepala_badan` | lihat/ubah/hapus semua, validasi laporan publik | penuh | ya |
| `admin_kesbangpol` | lihat/ubah/hapus semua, validasi laporan publik | penuh | ya |
| `operator_kec` | hanya kecamatannya sendiri (lihat, buat, ubah) | buat & ubah miliknya/kecamatannya | tidak |
| `viewer` | lihat semua, tidak bisa mengubah | lihat | tidak |

Aturan ini dipaksakan di **database** (RLS), bukan hanya di tampilan — jadi tetap berlaku
walaupun ada yang mencoba memanggil API langsung.

---

## Pengembangan lanjutan (opsional, tidak mendesak)

1. **Pembuatan user lewat Edge Function.** Cara paling rapi adalah mematikan sign-up
   publik dan memindahkan pembuatan akun ke Edge Function yang memakai `service_role key`
   di sisi server. Dengan begitu tidak ada jalur pendaftaran mandiri sama sekali.
2. **Backup terjadwal.** Supabase paket gratis menyimpan backup harian terbatas.
   Untuk data resmi, jadwalkan ekspor CSV bulanan (tombol Export sudah tersedia di
   halaman Laporan & Koordinasi) dan simpan di Google Drive dinas.
3. **Verifikasi data wilayah.** Daftar desa di `04_seed_wilayah.sql` disusun dari
   sumber terbuka dan jumlahnya cocok dengan angka resmi (105 desa + 12 kelurahan),
   tetapi sebaiknya dicocokkan sekali dengan SK Kemendagri/BPS Kepahiang terbaru
   sebelum dipakai untuk laporan resmi.
4. **Hapus akun yang tidak terpakai.** Menghapus dari halaman Kelola User hanya
   menghapus profilnya; akun login-nya masih perlu dihapus di
   Authentication → Users.

---

## Kalau ada yang macet

| Gejala | Kemungkinan penyebab |
|---|---|
| Banner merah "belum terhubung ke database" | `js/config.js` belum diisi |
| Login gagal "Invalid login credentials" | Password salah, atau user belum di-*Auto Confirm* |
| Login berhasil tapi langsung balik ke login | Baris `profiles` belum ada → jalankan `05_admin.sql` |
| Dropdown kecamatan kosong / isi 8 item hardcode | `04_seed_wilayah.sql` belum dijalankan |
| "row-level security policy" saat menyimpan | Role/kecamatan akun tidak cocok dengan data yang ditulis |
| Upload bukti gagal | `03_storage.sql` belum dijalankan, atau file melebihi 10 MB |
| Notifikasi tidak muncul | Wajar bila laporan dibuat oleh diri sendiri — trigger sengaja tidak menotifikasi pembuatnya |
