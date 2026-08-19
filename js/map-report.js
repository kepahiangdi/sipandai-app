/**
 * js/map-report.js
 * "Lapor di Sini" — membuat laporan konflik langsung dari halaman Peta.
 *
 * Alur:
 *   1. Petugas menekan tombol "+ Lapor di Sini"
 *   2. Menentukan titik kejadian: mengetuk peta, atau menekan "Pakai GPS"
 *   3. Mengisi judul, kategori, risiko, desa, deskripsi, dan foto
 *   4. Kirim — bila tidak ada internet, laporan + foto disimpan di perangkat
 *      (IndexedDB) dan terkirim otomatis begitu koneksi pulih
 *
 * Catatan wilayah: operator kecamatan dikunci pada kecamatannya sendiri,
 * mengikuti aturan Row Level Security di database. Admin bebas memilih.
 */

(() => {
  'use strict';

  // Hanya jalan di halaman yang punya panel ini
  if (!document.getElementById('formMapReport')) return;

  // =====================================================================
  // STATE
  // =====================================================================
  let peta          = null;   // instance Leaflet dari maps.js
  let titikMarker   = null;   // marker titik kejadian
  let lingkaranGps  = null;   // lingkaran akurasi GPS
  let koordinat     = null;   // { lat, lng, akurasi }
  let fotoTerpilih  = null;   // File / Blob hasil kompresi
  let modePilih     = false;
  let sedangKirim   = false;
  let sedangFlush   = false;   // pengunci: cegah antrean terkirim dua kali sekaligus

  const el = (id) => document.getElementById(id);
  const pengguna = () => JSON.parse(localStorage.getItem('sipandai_user') || '{}');
  const toast = (pesan, tipe = 'info') => window.app?.showToast?.(pesan, tipe);

  // Batas wilayah Kepahiang — disamakan dengan MAP_CONFIG di maps.js
  const BATAS = { selatan: -3.798060, barat: 102.443051, utara: -3.497891, timur: 102.808862 };
  const didalamKepahiang = (lat, lng) =>
    lat >= BATAS.selatan && lat <= BATAS.utara &&
    lng >= BATAS.barat  && lng <= BATAS.timur;

  // =====================================================================
  // INDEXEDDB — antrean laporan offline (menyimpan foto sebagai Blob,
  // yang tidak mungkin dilakukan dengan localStorage)
  // =====================================================================
  const DB_NAMA = 'sipandai-offline';
  const DB_STORE = 'laporan-peta';

  function bukaDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAMA, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror  = () => reject(req.error);
    });
  }

  async function antreanTambah(rekaman) {
    const db = await bukaDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).add(rekaman);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }

  async function antreanAmbilSemua() {
    const db = await bukaDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => reject(req.error);
    });
  }

  async function antreanHapus(id) {
    const db = await bukaDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }

  async function perbaruiPenandaAntrean() {
    try {
      const antrean = await antreanAmbilSemua();
      const chip = el('btnPendingQueue');
      if (!chip) return antrean.length;
      el('pendingQueueCount').textContent = antrean.length;
      chip.classList.toggle('d-none', antrean.length === 0);
      return antrean.length;
    } catch {
      return 0;
    }
  }

  // =====================================================================
  // FOTO — kompresi sebelum kirim
  // Foto kamera HP bisa 4–8 MB. Di jaringan kecamatan itu berat dan
  // mudah gagal, jadi diperkecil dulu ke sisi terpanjang 1600 px.
  // =====================================================================
  function kompresFoto(file, maksSisi = 1600, mutu = 0.8) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width: w, height: h } = img;

        if (Math.max(w, h) > maksSisi) {
          const rasio = maksSisi / Math.max(w, h);
          w = Math.round(w * rasio);
          h = Math.round(h * rasio);
        }

        const kanvas = document.createElement('canvas');
        kanvas.width = w;
        kanvas.height = h;
        kanvas.getContext('2d').drawImage(img, 0, 0, w, h);

        kanvas.toBlob(
          (blob) => resolve(blob && blob.size < file.size ? blob : file),
          'image/jpeg',
          mutu
        );
      };

      // Bila gambar gagal dibaca (format aneh), pakai berkas aslinya
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }

  const ukuranTerbaca = (b) =>
    b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`;

  async function pakaiFoto(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('Berkas harus berupa gambar', 'error');
      return;
    }

    const asli = file.size;
    fotoTerpilih = await kompresFoto(file);

    const preview = el('mrPreview');
    const url = URL.createObjectURL(fotoTerpilih);
    const catatan = fotoTerpilih.size < asli
      ? `${ukuranTerbaca(asli)} → ${ukuranTerbaca(fotoTerpilih.size)}`
      : ukuranTerbaca(fotoTerpilih.size);

    preview.innerHTML = `
      <img src="${url}" alt="Pratinjau foto bukti">
      <div class="photo-meta">
        <span>📎 ${catatan}</span>
        <button type="button" id="btnHapusFoto">Hapus foto</button>
      </div>`;

    el('btnHapusFoto').addEventListener('click', () => {
      URL.revokeObjectURL(url);
      fotoTerpilih = null;
      preview.innerHTML = '';
      el('mrKamera').value = '';
      el('mrGaleri').value = '';
    });
  }

  // =====================================================================
  // TITIK KEJADIAN
  // =====================================================================
  function tampilkanTitik(lat, lng, akurasi = null) {
    if (!peta) return;

    koordinat = { lat, lng, akurasi };

    if (titikMarker) peta.removeLayer(titikMarker);
    if (lingkaranGps) { peta.removeLayer(lingkaranGps); lingkaranGps = null; }

    titikMarker = L.marker([lat, lng], { draggable: true })
      .addTo(peta)
      .bindPopup('Titik kejadian — seret untuk menggeser')
      .openPopup();

    titikMarker.on('dragend', (e) => {
      const p = e.target.getLatLng();
      if (!didalamKepahiang(p.lat, p.lng)) {
        toast('⚠️ Titik berada di luar Kabupaten Kepahiang', 'warning');
        titikMarker.setLatLng([koordinat.lat, koordinat.lng]);
        return;
      }
      koordinat = { lat: p.lat, lng: p.lng, akurasi: null };
      tulisKoordinat();
      el('gpsAccuracy').textContent = 'Titik digeser manual.';
    });

    if (akurasi) {
      lingkaranGps = L.circle([lat, lng], {
        radius: akurasi, color: '#1e40af', fillColor: '#3b82f6',
        fillOpacity: 0.12, weight: 1
      }).addTo(peta);
    }

    peta.setView([lat, lng], Math.max(peta.getZoom(), 14));
    tulisKoordinat();
  }

  function tulisKoordinat() {
    el('coordText').textContent = koordinat
      ? `${koordinat.lat.toFixed(5)}, ${koordinat.lng.toFixed(5)}`
      : '-';
  }

  function masukModePilih() {
    modePilih = true;
    document.body.classList.add('map-picking');
    el('pickBanner').classList.remove('d-none');
    tutupPanel(false);
  }

  function keluarModePilih() {
    modePilih = false;
    document.body.classList.remove('map-picking');
    el('pickBanner').classList.add('d-none');
  }

  function ambilLokasiGps() {
    if (!navigator.geolocation) {
      toast('Perangkat ini tidak mendukung GPS', 'warning');
      return;
    }

    el('pickBannerText').textContent = '📡 Mencari sinyal GPS…';

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        el('pickBannerText').textContent = '👆 Ketuk titik lokasi kejadian di peta';

        if (!didalamKepahiang(latitude, longitude)) {
          toast('⚠️ Lokasi Anda di luar Kepahiang. Tentukan titik dengan mengetuk peta.', 'warning');
          return;
        }

        tampilkanTitik(latitude, longitude, accuracy);
        keluarModePilih();
        bukaPanel();

        el('gpsAccuracy').textContent =
          `📡 Dari GPS, perkiraan ketelitian ±${Math.round(accuracy)} m.` +
          (accuracy > 50 ? ' Ketelitian rendah — geser penanda bila perlu.' : '');
      },
      (err) => {
        el('pickBannerText').textContent = '👆 Ketuk titik lokasi kejadian di peta';
        const pesan = {
          1: 'Izin lokasi ditolak. Aktifkan izin lokasi di pengaturan browser.',
          2: 'Sinyal GPS tidak tersedia. Coba ke tempat terbuka, atau ketuk peta.',
          3: 'Pencarian GPS terlalu lama. Coba lagi atau ketuk peta.'
        }[err.code] || 'Gagal mendapatkan lokasi.';
        toast('📡 ' + pesan, 'warning');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  // =====================================================================
  // PANEL
  // =====================================================================
  function bukaPanel() {
    el('reportPanel').classList.add('open');
    el('reportBackdrop').classList.remove('d-none');
    document.body.classList.add('panel-lapor-terbuka');
  }

  function tutupPanel(sekalianBersihkan = true) {
    el('reportPanel').classList.remove('open');
    el('reportBackdrop').classList.add('d-none');
    document.body.classList.remove('panel-lapor-terbuka');
    if (sekalianBersihkan) bersihkanFormulir();
  }

  function bersihkanFormulir() {
    el('formMapReport').reset();
    el('mrPreview').innerHTML = '';
    el('gpsAccuracy').textContent = '';
    fotoTerpilih = null;
    koordinat = null;
    tulisKoordinat();

    if (titikMarker)  { peta?.removeLayer(titikMarker);  titikMarker = null; }
    if (lingkaranGps) { peta?.removeLayer(lingkaranGps); lingkaranGps = null; }

    kunciKecamatanOperator();
  }

  // =====================================================================
  // DROPDOWN WILAYAH
  // =====================================================================
  async function muatKecamatan() {
    const sel = el('mrKecamatan');
    try {
      const { data, error } = await window.sbClient
        .from('kecamatan').select('id, nama').order('nama');
      if (error) throw error;

      sel.innerHTML = '<option value="">Pilih Kecamatan</option>';
      data.forEach(k => {
        const o = document.createElement('option');
        o.value = k.id;
        o.textContent = k.nama;
        sel.appendChild(o);
      });
      kunciKecamatanOperator();
    } catch (err) {
      console.error('Gagal memuat kecamatan:', err);
      sel.innerHTML = '<option value="">❌ Gagal memuat</option>';
    }
  }

  function kunciKecamatanOperator() {
    const u = pengguna();
    const sel = el('mrKecamatan');
    if (u.role === 'operator_kec' && u.kecamatan_id) {
      sel.value = String(u.kecamatan_id);
      sel.disabled = true;
      sel.title = 'Operator hanya dapat melapor untuk kecamatannya sendiri';
      muatDesa(u.kecamatan_id);
    } else {
      sel.disabled = false;
    }
  }

  async function muatDesa(kecamatanId) {
    const sel = el('mrDesa');
    sel.disabled = true;

    if (!kecamatanId) {
      sel.innerHTML = '<option value="">Pilih Kecamatan Dulu</option>';
      return;
    }

    sel.innerHTML = '<option value="">⏳ Memuat desa…</option>';
    try {
      const { data, error } = await window.sbClient
        .from('desa').select('id, nama, jenis')
        .eq('kecamatan_id', parseInt(kecamatanId))
        .order('nama');
      if (error) throw error;

      sel.innerHTML = '<option value="">Pilih Desa / Kelurahan</option>';
      data.forEach(d => {
        const o = document.createElement('option');
        o.value = d.id;
        o.textContent = d.jenis === 'kelurahan' ? `Kel. ${d.nama}` : d.nama;
        o.dataset.nama = d.nama;
        sel.appendChild(o);
      });
      sel.disabled = false;
    } catch (err) {
      console.error('Gagal memuat desa:', err);
      sel.innerHTML = '<option value="">❌ Gagal memuat desa</option>';
    }
  }

  // =====================================================================
  // KIRIM
  // =====================================================================
  async function unggahFoto(blob) {
    const nama = `bukti/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;

    const { error } = await window.sbClient.storage
      .from(window.APP_CONFIG?.storageBucket || 'bukti-laporan')
      .upload(nama, blob, { cacheControl: '3600', upsert: false, contentType: blob.type || 'image/jpeg' });

    if (error) throw error;

    const { data } = window.sbClient.storage
      .from(window.APP_CONFIG?.storageBucket || 'bukti-laporan')
      .getPublicUrl(nama);

    return data.publicUrl;
  }

  async function kirimKeServer(payload, foto) {
    const isi = { ...payload };
    if (foto) isi.foto_url = await unggahFoto(foto);

    const { data, error } = await window.sbClient
      .from('conflict_reports')
      .insert([isi])
      .select('id')
      .single();

    if (error) throw error;
    return data.id;
  }

  async function kirimAntrean() {
    // Peristiwa 'online' bisa terpicu lebih dari sekali (browser + tombol
    // antrean). Tanpa pengunci ini, dua proses membaca antrean yang sama
    // sebelum salah satunya sempat menghapus — laporan jadi ganda.
    if (sedangFlush) return;
    sedangFlush = true;

    try {
      await prosesAntrean();
    } finally {
      sedangFlush = false;
    }
  }

  async function prosesAntrean() {
    const antrean = await antreanAmbilSemua();
    if (antrean.length === 0) return;

    let berhasil = 0;
    let gagal = 0;

    for (const item of antrean) {
      try {
        // Hapus dari antrean LEBIH DULU. Bila pengiriman gagal, dimasukkan
        // kembali. Urutan ini mencegah laporan ganda, yang jauh lebih
        // merepotkan daripada satu kali percobaan ulang.
        await antreanHapus(item.id);
        await kirimKeServer(item.payload, item.foto || null);
        berhasil++;
      } catch (err) {
        console.warn('Gagal mengirim laporan tertunda:', err.message || err);
        const { id, ...tanpaId } = item;
        try { await antreanTambah(tanpaId); } catch { /* biarkan */ }
        gagal++;
      }
    }

    await perbaruiPenandaAntrean();

    if (berhasil) {
      toast(`✅ ${berhasil} laporan tertunda berhasil terkirim`, 'success');
      window.reloadMapMarkers?.();
    }
    if (gagal) {
      toast(`⚠️ ${gagal} laporan masih tertunda, akan dicoba lagi`, 'warning');
    }
  }

  async function tanganiKirim(e) {
    e.preventDefault();
    if (sedangKirim) return;

    if (!koordinat) {
      toast('Tentukan dulu titik kejadian di peta', 'error');
      return;
    }

    const u = pengguna();
    const kecamatanId = el('mrKecamatan').value;
    const opsiDesa = el('mrDesa').selectedOptions?.[0];

    if (!kecamatanId)      { toast('Kecamatan wajib dipilih', 'error'); return; }
    if (!el('mrDesa').value) { toast('Desa wajib dipilih', 'error'); return; }

    const payload = {
      judul:          el('mrJudul').value.trim(),
      deskripsi:      el('mrDeskripsi').value.trim() || null,
      kategori:       el('mrKategori').value || 'Lainnya',
      tingkat_risiko: el('mrRisiko').value || 'Sedang',
      kecamatan_id:   parseInt(kecamatanId),
      desa_id:        parseInt(el('mrDesa').value),
      desa_nama:      opsiDesa?.dataset?.nama || null,
      alamat_lokasi:  el('mrAlamat').value.trim() || null,
      lokasi_lat:     koordinat.lat,
      lokasi_lng:     koordinat.lng,
      pelapor_id:     u.id,
      status:         'baru'
    };

    const tombol = el('btnSubmitMapReport');
    sedangKirim = true;
    tombol.disabled = true;
    tombol.textContent = '⏳ Mengirim…';

    try {
      if (navigator.onLine) {
        const idBaru = await kirimKeServer(payload, fotoTerpilih);
        toast(`✅ Laporan #${idBaru} terkirim`, 'success');
        window.reloadMapMarkers?.();
      } else {
        await antreanTambah({
          payload,
          foto: fotoTerpilih || null,
          disimpanPada: new Date().toISOString()
        });
        await perbaruiPenandaAntrean();
        toast('📦 Tidak ada sinyal. Laporan tersimpan & terkirim otomatis nanti.', 'warning');
      }

      tutupPanel();

    } catch (err) {
      console.error('Gagal mengirim laporan:', err);

      // Kegagalan jaringan di tengah jalan juga masuk antrean,
      // supaya hasil ketikan petugas tidak hilang begitu saja.
      const kemungkinanJaringan =
        err.message?.includes('Failed to fetch') ||
        err.message?.includes('NetworkError') ||
        err.message?.includes('network');

      if (kemungkinanJaringan) {
        try {
          await antreanTambah({
            payload,
            foto: fotoTerpilih || null,
            disimpanPada: new Date().toISOString()
          });
          await perbaruiPenandaAntrean();
          toast('📦 Jaringan terputus. Laporan disimpan & dikirim otomatis nanti.', 'warning');
          tutupPanel();
        } catch {
          toast('Gagal menyimpan laporan: ' + (err.message || err), 'error');
        }
      } else {
        toast('Gagal: ' + (err.message || err), 'error');
      }

    } finally {
      sedangKirim = false;
      tombol.disabled = false;
      tombol.textContent = '📤 Kirim Laporan';
    }
  }

  // =====================================================================
  // PEMASANGAN
  // =====================================================================
  function pasangPetaSiap(instance) {
    peta = instance;
    peta.on('click', (e) => {
      if (!modePilih) return;
      const { lat, lng } = e.latlng;
      if (!didalamKepahiang(lat, lng)) {
        toast('⚠️ Titik di luar Kabupaten Kepahiang', 'warning');
        return;
      }
      tampilkanTitik(lat, lng);
      keluarModePilih();
      bukaPanel();
      el('gpsAccuracy').textContent = 'Titik ditentukan manual dari peta.';
    });
  }

  document.addEventListener('sipandai:map-ready', (e) => pasangPetaSiap(e.detail.map));

  document.addEventListener('DOMContentLoaded', async () => {
    // Peta mungkin sudah siap sebelum listener di atas terpasang
    if (!peta && window.sipandaiMap) pasangPetaSiap(window.sipandaiMap);

    const u = pengguna();
    if (u.role === 'viewer') {
      el('btnStartReport')?.classList.add('d-none');   // viewer hanya membaca
      return;
    }

    await muatKecamatan();
    await perbaruiPenandaAntrean();

    // Kirim sisa antrean bila memang sedang online
    if (navigator.onLine) kirimAntrean();

    el('btnStartReport') ?.addEventListener('click', masukModePilih);
    el('btnCancelPick')  ?.addEventListener('click', keluarModePilih);
    el('btnUseGps')      ?.addEventListener('click', ambilLokasiGps);
    el('btnRepickPoint') ?.addEventListener('click', masukModePilih);
    el('closeReportPanel')?.addEventListener('click', () => tutupPanel());
    el('reportBackdrop') ?.addEventListener('click', () => tutupPanel());
    el('btnPendingQueue')?.addEventListener('click', () => {
      navigator.onLine
        ? kirimAntrean()
        : toast('Masih tanpa sinyal. Laporan aman tersimpan.', 'info');
    });

    el('mrKecamatan')?.addEventListener('change', (ev) => muatDesa(ev.target.value));

    el('btnTakePhoto')?.addEventListener('click', () => el('mrKamera').click());
    el('btnPickPhoto')?.addEventListener('click', () => el('mrGaleri').click());
    el('mrKamera')?.addEventListener('change', (ev) => pakaiFoto(ev.target.files?.[0]));
    el('mrGaleri')?.addEventListener('change', (ev) => pakaiFoto(ev.target.files?.[0]));

    el('formMapReport')?.addEventListener('submit', tanganiKirim);

    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape') return;
      if (modePilih) keluarModePilih();
      else if (el('reportPanel').classList.contains('open')) tutupPanel();
    });

    window.addEventListener('online', () => setTimeout(kirimAntrean, 1200));
  });
})();
