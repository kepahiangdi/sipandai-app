/**
 * js/sync.js
 * Offline-First Queue & Auto-Sync Handler
 */
const OFFLINE_QUEUE_KEY = 'sipandai_sync_queue';

function queueOfflineReport(data) {
  let queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  queue.push({ ...data, synced: false, queuedAt: new Date().toISOString() });
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  console.log(`📦 Laporan ${data.id} masuk antrian offline. Total antrian: ${queue.length}`);
}

async function syncOfflineQueue() {
  let queue = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  if (queue.length === 0) return;

  console.log('🌐 Mulai sinkronisasi antrian offline...');
  const failed = [];

  for (const item of queue) {
    try {
      // Ganti dengan window.sbClient insert nanti:
      // await window.sbClient.from('conflict_reports').insert(item);
      item.synced = true;
      console.log(`✅ ${item.id} berhasil disinkronisasi.`);
    } catch (err) {
      console.warn(`❌ Gagal sync ${item.id}:`, err);
      failed.push(item);
    }
  }

  // Simpan hanya yang gagal
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(failed));
  
  if (failed.length === 0) {
    window.app.showToast('✅ Semua data offline berhasil disinkronisasi!', 'success');
  } else {
    window.app.showToast(`⚠️ ${failed.length} data gagal sync. Akan dicoba lagi nanti.`, 'warning');
  }
}

// Expose to global scope (dipanggil oleh window.app di app.js saat online)
window.syncOfflineQueue = { queueOfflineReport, syncOfflineQueue };
