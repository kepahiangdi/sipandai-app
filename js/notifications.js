/**
 * js/notifications.js
 * Sistem Notifikasi Real-time SIPANDAI
 */

let notificationCount = 0;
let notifications = [];

// ==========================================
// 🔔 FETCH NOTIFIKASI DARI DATABASE
// ==========================================
async function fetchNotifications() {
  try {
    const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
    
    if (!user.id) {
      console.warn('⚠️ User tidak login');
      return [];
    }
    
    console.log('🔍 Fetching notifications for user:', user.id);
    
    // Fetch notifikasi yang belum dibaca
    const { data, error } = await window.sbClient
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      console.error('❌ Error fetching notifications:', error);
      return [];
    }
    
    notifications = data || [];
    notificationCount = notifications.length;
    
    console.log(`✅ Fetched ${notificationCount} notifications`);
    
    // Update badge
    updateNotificationBadge();
    
    // Render dropdown
    renderNotifications();
    
    return notifications;
    
  } catch (err) {
    console.error('❌ Failed to fetch notifications:', err);
    return [];
  }
}

// ==========================================
// 🔢 UPDATE BADGE NUMBER
// ==========================================
function updateNotificationBadge() {
  const badge = document.getElementById('notificationBadge');
  
  if (!badge) {
    console.warn('⚠️ Badge element not found');
    return;
  }
  
  if (notificationCount > 0) {
    badge.textContent = notificationCount > 9 ? '9+' : notificationCount;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

// ==========================================
// 📋 RENDER NOTIFICATION DROPDOWN
// ==========================================
function renderNotifications() {
  const dropdown = document.getElementById('notificationDropdown');
  
  if (!dropdown) {
    console.warn('⚠️ Dropdown element not found');
    return;
  }
  
  if (notifications.length === 0) {
    dropdown.innerHTML = `
      <div class="notification-empty" style="padding:2rem;text-align:center;color:var(--gray)">
        <div style="font-size:2rem;margin-bottom:0.5rem">🎉</div>
        <p>Tidak ada notifikasi baru</p>
      </div>
    `;
    return;
  }
  
  dropdown.innerHTML = `
    <div class="notification-header" style="padding:1rem;border-bottom:1px solid var(--border);font-weight:600">
      🔔 Notifikasi (${notificationCount})
    </div>
    ${notifications.map(notif => `
      <div class="notification-item ${notif.type}" 
           onclick="handleNotificationClick('${notif.id}', '${notif.link || ''}')"
           style="padding:1rem;border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.2s;display:flex;gap:0.75rem"
           onmouseover="this.style.background='#f8fafc'"
           onmouseout="this.style.background='white'">
        <div class="notification-icon" style="font-size:1.5rem;flex-shrink:0">
          ${getNotificationIcon(notif.type)}
        </div>
        <div class="notification-content" style="flex:1;min-width:0">
          <div class="notification-title" style="font-weight:600;color:var(--dark);margin-bottom:0.25rem;font-size:0.9rem">
            ${notif.title}
          </div>
          <div class="notification-message" style="color:var(--gray);font-size:0.85rem;line-height:1.4;margin-bottom:0.25rem">
            ${notif.message}
          </div>
          <div class="notification-time" style="font-size:0.75rem;color:#94a3b8">
            ${formatNotificationTime(notif.created_at)}
          </div>
        </div>
      </div>
    `).join('')}
    <div class="notification-footer" style="padding:0.75rem;text-align:center;border-top:1px solid var(--border)">
      <button onclick="markAllAsRead()" style="background:none;border:none;color:var(--primary);cursor:pointer;font-size:0.85rem">
        Tandai semua sudah dibaca
      </button>
    </div>
  `;
}

// ==========================================
// 🎯 HANDLE NOTIFICATION CLICK
// ==========================================
async function handleNotificationClick(id, link) {
  console.log('🔔 Notification clicked:', id);
  
  try {
    // Mark as read
    const { error } = await window.sbClient
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id);
    
    if (error) throw error;
    
    // Redirect jika ada link
    if (link) {
      window.location.href = link;
    } else {
      // Refresh notifications
      await fetchNotifications();
      
      // Close dropdown
      const dropdown = document.getElementById('notificationDropdown');
      if (dropdown) {
        dropdown.classList.remove('show');
        dropdown.style.display = 'none';
      }
    }
    
  } catch (err) {
    console.error('❌ Error handling notification click:', err);
  }
}

// ==========================================
// ✅ MARK ALL AS READ
// ==========================================
async function markAllAsRead() {
  try {
    const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
    
    const { error } = await window.sbClient
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false);
    
    if (error) throw error;
    
    console.log('✅ All notifications marked as read');
    
    // Refresh
    await fetchNotifications();
    
  } catch (err) {
    console.error('❌ Error marking all as read:', err);
  }
}

// ==========================================
// 🎨 HELPER FUNCTIONS
// ==========================================
function getNotificationIcon(type) {
  const icons = {
    'critical': '🚨',
    'warning': '⚠️',
    'info': '📝',
    'reminder': '⏰',
    'success': '✅'
  };
  return icons[type] || '🔔';
}

function formatNotificationTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return `${minutes} menit yang lalu`;
  if (hours < 24) return `${hours} jam yang lalu`;
  if (days < 7) return `${days} hari yang lalu`;
  
  return date.toLocaleDateString('id-ID', { 
    day: '2-digit', 
    month: 'short', 
    year: 'numeric' 
  });
}

// ==========================================
// 🔔 SETUP NOTIFICATION BELL
// ==========================================
function setupNotificationBell() {
  const bellIcon = document.getElementById('notificationBell');
  const dropdown = document.getElementById('notificationDropdown');
  
  if (!bellIcon) {
    console.warn('⚠️ Notification bell not found');
    return;
  }
  
  bellIcon.addEventListener('click', async (e) => {
    e.stopPropagation();
    
    console.log('🔔 Bell clicked');
    
    // Toggle dropdown
    if (dropdown) {
      const isShowing = dropdown.style.display === 'block';
      
      if (isShowing) {
        dropdown.style.display = 'none';
        dropdown.classList.remove('show');
      } else {
        // Fetch latest before showing
        await fetchNotifications();
        dropdown.style.display = 'block';
        dropdown.classList.add('show');
      }
    }
  });
  
  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (dropdown && 
        !bellIcon.contains(e.target) && 
        !dropdown.contains(e.target)) {
      dropdown.style.display = 'none';
      dropdown.classList.remove('show');
    }
  });
}

// ==========================================
// 🔄 REAL-TIME SUBSCRIPTION
// ==========================================
function setupNotificationSubscription() {
  const user = JSON.parse(localStorage.getItem('sipandai_user') || '{}');
  
  if (!user.id) {
    console.warn('⚠️ Cannot setup subscription: user not logged in');
    return;
  }
  
  console.log('🔄 Setting up notification subscription for user:', user.id);
  
  window.sbClient
    .channel('notifications:' + user.id)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${user.id}`
    }, (payload) => {
      console.log('🔔 New notification received:', payload.new);
      
      // Play sound (optional)
      playNotificationSound();
      
      // Show toast
      if (window.app?.showToast) {
        window.app.showToast(payload.new.title, 'info');
      }
      
      // Refresh badge & dropdown
      fetchNotifications();
    })
    .subscribe((status) => {
      console.log('📡 Notification subscription status:', status);
    });
}

// ==========================================
// 🔊 NOTIFICATION SOUND
// ==========================================
function playNotificationSound() {
  // Create simple beep sound
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
    
  } catch (err) {
    console.warn('⚠️ Could not play notification sound:', err);
  }
}

// ==========================================
// 🚀 INITIALIZE
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('🔔 Initializing notification system...');
  
  setupNotificationBell();
  setupNotificationSubscription();
  
  // Fetch initial notifications
  setTimeout(() => {
    fetchNotifications();
  }, 1000);
  
  // Refresh every 30 seconds
  setInterval(fetchNotifications, 30000);
});
