/**
 * js/sync.js
 * Offline-First Queue & Auto-Sync Handler
 *
 * Perbaikan:
 *  - benar-benar mengirim antrian ke Supabase (sebelumnya masih di-comment)
 *  - window.syncOfflineQueue kini SEBUAH FUNGSI, sesuai pemanggilan di app.js
 *    (`typeof window.syncOfflineQueue === 'function'`), sekaligus tetap
 *    menyediakan .queueOfflineReport() seperti yang dipakai reports.js
 */
const OFFLINE_QUEUE_KEY = 'sipandai_sync_queue';

function getQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveQueue(queue) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function queueOfflineReport(data) {
  const queue = getQueue();
  queue.push({
    ...data,
    _localId: `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    queuedAt: new Date().toISOString()
  });
  saveQueue(queue);
  console.log(`📦 Laporan masuk antrian offline. Total antrian: ${queue.length}`);
  return queue.length;
}

function getQueueCount() {
  return getQueue().length;
}

async function syncOfflineQueue() {
  const queue = getQueue();
  if (queue.length === 0) return { synced: 0, failed: 0 };

  if (!window.sbClient) {
    console.warn('⚠️ Supabase client belum siap, sinkronisasi ditunda.');
    return { synced: 0, failed: queue.length };
  }

  console.log(`🌐 Mulai sinkronisasi ${queue.length} data offline...`);
  const failed = [];
  let synced = 0;

  for (const item of queue) {
    // Buang field bantu lokal sebelum dikirim ke database
    const { _localId, queuedAt, synced: _s, ...payload } = item;

    try {
      const { error } = await window.sbClient
        .from('conflict_reports')
        .insert([payload]);

      if (error) throw error;
      synced++;
      console.log(`✅ ${_localId} berhasil disinkronisasi.`);
    } catch (err) {
      console.warn(`❌ Gagal sync ${_localId}:`, err.message || err);
      failed.push(item);
    }
  }

  saveQueue(failed);

  if (window.app?.showToast) {
    if (failed.length === 0) {
      window.app.showToast(`✅ ${synced} data offline berhasil disinkronisasi!`, 'success');
    } else {
      window.app.showToast(
        `⚠️ ${synced} terkirim, ${failed.length} gagal. Akan dicoba lagi nanti.`,
        'warning'
      );
    }
  }

  return { synced, failed: failed.length };
}

// ✅ Export: fungsi utama + helper menempel pada fungsi tersebut
window.syncOfflineQueue = syncOfflineQueue;
window.syncOfflineQueue.queueOfflineReport = queueOfflineReport;
window.syncOfflineQueue.getQueueCount = getQueueCount;
window.queueOfflineReport = queueOfflineReport;
