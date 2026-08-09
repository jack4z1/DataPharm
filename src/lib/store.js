import { NOTIF_DEFAULTS } from './notifications.js';

const KEY = 'datapharm:v1';

export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);

const DEFAULT_CATEGORIES = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Ointment', 'Drops', 'Powder', 'Other'];

const DEFAULT_SETTINGS = { currency: '₹', qrImage: '', fontSize: 'md', theme: 'dark', onlineMode: false, notifications: { ...NOTIF_DEFAULTS } };

export function fresh() {
  return {
    products: [],
    sales: [],
    stockIns: [],
    categories: [...DEFAULT_CATEGORIES],
    settings: { ...DEFAULT_SETTINGS },
    notifLog: { low: {}, expiring: {} },
    tombstones: [],
    syncConfig: {
      shopId: '',
      role: '', // 'owner' or 'worker'
      deviceId: uid(),
      deviceName: '',
      syncToken: '',
      expiryTime: '',
      dailyVerification: false,
      status: 'active', // 'active' or 'revoked'
      workers: [] // for owner, list of worker device sessions
    }
  };
}

function demoData() {
  const today = new Date();
  const d = (offsetDays) => {
    const t = new Date(today);
    t.setDate(t.getDate() + offsetDays);
    return t.toISOString().slice(0, 10);
  };
  const mk = (name, expiry, price, strips, tabletsPerStrip, location, buyFrom, category, barcode = '') => ({
    id: uid(),
    name, expiry, price, strips, tabletsPerStrip, location, buyFrom, category, barcode,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  const products = [
    mk('Paracetamol 500mg', d(600), 50, 20, 10, 'Shelf B2', 'MedPlus Distributors', 'Tablet'),
    mk('Amoxicillin 250mg', d(45), 120, 8, 6, 'Shelf A1', 'Sun Pharma', 'Capsule'),
    mk('Vitamin C 1000mg', d(400), 90, 15, 15, 'Shelf C3', 'Himalaya Wellness', 'Tablet'),
    mk('Cetirizine 10mg', d(20), 35, 30, 10, 'Shelf B1', 'Cipla', 'Tablet'),
    mk('ORS Sachet (Banana)', d(-5), 15, 50, 1, 'Shelf D1', 'Electral', 'Powder'),
    mk('Omeprazole 20mg', d(250), 80, 12, 7, 'Shelf A2', "Dr. Reddy's", 'Capsule'),
  ];
  const sales = [
    {
      id: uid(), ts: Date.now() - 86400000 * 2,
      items: [
        { productId: products[0].id, name: 'Paracetamol 500mg', qty: 2, unit: 'strip', unitPrice: 50, line: 100 },
        { productId: products[2].id, name: 'Vitamin C 1000mg', qty: 3, unit: 'tablet', unitPrice: 6, line: 18 },
      ],
      subtotal: 118, discount: 8, discountPct: 6.8, total: 110,
    },
    {
      id: uid(), ts: Date.now() - 86400000 * 5,
      items: [{ productId: products[1].id, name: 'Amoxicillin 250mg', qty: 1, unit: 'strip', unitPrice: 120, line: 120 }],
      subtotal: 120, discount: 0, discountPct: 0, total: 120,
    },
  ];
  return { products, sales, stockIns: [], categories: [...DEFAULT_CATEGORIES], settings: { ...DEFAULT_SETTINGS }, tombstones: [], syncConfig: { shopId: '', role: '', deviceId: uid(), deviceName: '', syncToken: '', expiryTime: '', dailyVerification: false, status: 'active', workers: [] } };
}

export function loadDB() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      if (typeof location !== 'undefined' && location.search.includes('demo')) return demoData();
      return fresh();
    }
    const d = JSON.parse(raw);
    const fr = fresh();
    return {
      ...fr,
      ...d,
      products: (d.products || []).map(p => ({ ...p, updatedAt: p.updatedAt || p.createdAt || Date.now() })),
      sales: d.sales || [],
      stockIns: d.stockIns || [],
      categories: Array.isArray(d.categories) ? d.categories : [...DEFAULT_CATEGORIES],
      settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}), notifications: { ...NOTIF_DEFAULTS, ...((d.settings && d.settings.notifications) || {}) } },
      notifLog: { low: {}, expiring: {}, ...((d && d.notifLog) || {}) },
      tombstones: d.tombstones || [],
      syncConfig: { ...fr.syncConfig, ...(d.syncConfig || {}) }
    };
  } catch (e) {
    return fresh();
  }
}

export function persist(db) {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    /* storage full / unavailable */
  }
}

export function clearDB() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {}
}
