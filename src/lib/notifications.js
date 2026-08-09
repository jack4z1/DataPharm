import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { stockParts, expiryInfo } from './pricing.js';

/* Per-notification-kind on/off switches, stored in db.settings.notifications */
export const NOTIF_DEFAULTS = {
  lowStock: true,
  expiringSoon: true,
  saleSuccess: true,
  saleCancelled: true,
  qrSet: true,
};

export const notifEnabled = (settings, key) => !!(settings.notifications && settings.notifications[key]);

/**
 * Fire a system notification for a kind (respects the user's toggle).
 * On web this is a no-op — system notifications only exist on the native app.
 */
let seq = 0;
export async function pushNotif(settings, key, title, body) {
  if (!notifEnabled(settings, key)) return false;
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      const req = await LocalNotifications.requestPermissions();
      if (req.display !== 'granted') return false;
    }
    seq += 1;
    const id = Math.floor((Date.now() + seq * 7) % 2147483647);
    await LocalNotifications.schedule({
      notifications: [
        { id, title, body, smallIcon: 'ic_stat_datapharm', iconColor: '#0D47AA' },
      ],
    });
    return true;
  } catch (e) {
    console.warn('Notification failed', e);
    return false;
  }
}

/** Current notification permission — 'granted' | 'prompt' | 'denied'. */
export async function checkNotificationPermission() {
  if (!Capacitor.isNativePlatform()) return 'granted';
  try {
    const s = await LocalNotifications.checkPermissions();
    if (s.display === 'granted') return 'granted';
    return s.display === 'denied' ? 'denied' : 'prompt';
  } catch (e) {
    return 'prompt';
  }
}

/** Ask for POST_NOTIFICATIONS (Android 13+) — returns 'granted' | 'denied'. */
export async function ensureNotificationPermission() {
  if (!Capacitor.isNativePlatform()) return 'granted';
  try {
    const s = await LocalNotifications.checkPermissions();
    if (s.display === 'granted') return 'granted';
    const r = await LocalNotifications.requestPermissions();
    return r.display === 'granted' ? 'granted' : 'denied';
  } catch (e) {
    return 'denied';
  }
}

export const dayKey = () => new Date().toISOString().slice(0, 10);

/**
 * Launch-time check: products that are low on stock or expiring soon, not yet
 * notified today (per db.notifLog). Returns [{ key, productId, title, body }].
 */
export function pendingLaunchAlerts(db, log = {}) {
  const alerts = [];
  const today = dayKey();
  const lowLog = (log && log.low) || {};
  const expLog = (log && log.expiring) || {};
  for (const p of db.products) {
    if (notifEnabled(db.settings, 'lowStock') && p.strips < 2 && lowLog[p.id] !== today) {
      const oos = p.strips <= 0;
      alerts.push({
        key: 'lowStock',
        productId: p.id,
        title: oos ? 'Out of stock' : 'Low stock',
        body: oos ? `"${p.name}" is out of stock — restock now` : `"${p.name}" has less than 2 strips left`,
      });
    }
    if (notifEnabled(db.settings, 'expiringSoon') && p.expiry) {
      const ex = expiryInfo(p.expiry);
      // Only genuinely expiring products (expired / within 90 days) — never
      // products without an expiry date (tone 'muted').
      if ((ex.tone === 'warn' || ex.tone === 'danger') && expLog[p.id] !== today) {
        alerts.push({ key: 'expiringSoon', productId: p.id, title: 'Expiring soon', body: `"${p.name}" — ${ex.label}` });
      }
    }
  }
  return alerts;
}

/** Mark the fired alerts as "notified today" so they don't repeat all day. */
export function markNotified(log = {}, alerts = [], today = dayKey()) {
  const next = {
    low: { ...((log && log.low) || {}) },
    expiring: { ...((log && log.expiring) || {}) },
  };
  for (const a of alerts) {
    if (a.key === 'lowStock') next.low[a.productId] = today;
    else if (a.key === 'expiringSoon') next.expiring[a.productId] = today;
  }
  return next;
}
