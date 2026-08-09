import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { loadDB, persist, clearDB, uid } from './lib/store.js';
import { lineTotal, unitPrice, round2, money } from './lib/pricing.js';
import { triggerBack } from './lib/back.js';
import { openAppSettings, requireMediaPermission, requireFilesPermission } from './lib/permissions.js';
import { pushNotif, ensureNotificationPermission, pendingLaunchAlerts, markNotified } from './lib/notifications.js';
import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning';
import logoUrl from '../logo/DataPharm.png';
import Dashboard from './screens/Dashboard.jsx';
import Stock from './screens/Stock.jsx';
import History from './screens/History.jsx';
import Settings from './screens/Settings.jsx';
import SellingPanel from './components/SellingPanel.jsx';
import PermissionDialog from './components/PermissionDialog.jsx';
import LockScreen from './components/LockScreen.jsx';
import SyncEngine from './lib/sync.js';
import { IconHome, IconBox, IconClock, IconGear, IconCheck, IconArrowLeft } from './components/Icons.jsx';

const TABS = [
  { id: 'dash', label: 'Home', icon: IconHome },
  { id: 'stock', label: 'Stock', icon: IconBox },
  { id: 'history', label: 'History', icon: IconClock },
  { id: 'settings', label: 'Settings', icon: IconGear },
];

export default function App() {
  const [db, setDb] = useState(loadDB);
  const [tab, setTab] = useState('dash');
  
  // Multi-customer session state
  const [sessions, setSessions] = useState([
    {
      id: 'session-1',
      createdAt: Date.now(),
      customerName: null,
      cart: [],
      searchQuery: '',
      discountPct: 0,
      buyer: { name: '', phone: '', address: '' },
    },
  ]);
  const [activeSessionId, setActiveSessionId] = useState('session-1');
  const [sessionPanelOpen, setSessionPanelOpen] = useState(false);

  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0] || {
    id: 'session-1',
    createdAt: Date.now(),
    customerName: null,
    cart: [],
    searchQuery: '',
    discountPct: 0,
    buyer: { name: '', phone: '', address: '' },
  };

  const cart = activeSession.cart || [];
  const setCart = (updater) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? { ...s, cart: typeof updater === 'function' ? updater(s.cart) : updater }
          : s
      )
    );
  };

  const searchQuery = activeSession.searchQuery || '';
  const setSearchQuery = (q) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === activeSessionId ? { ...s, searchQuery: q } : s))
    );
  };

  const discount = activeSession.discountPct !== undefined && activeSession.discountPct !== null ? String(activeSession.discountPct || '') : '';
  const setDiscount = (val) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        const strVal = typeof val === 'function' ? val(s.discountPct || '') : val;
        const numVal = parseFloat(strVal) || 0;
        return { ...s, discountPct: strVal === '' ? '' : numVal };
      })
    );
  };

  const buyer = activeSession.buyer || { name: '', phone: '', address: '' };
  const setBuyer = (updater) => {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== activeSessionId) return s;
        const newBuyer = typeof updater === 'function' ? updater(s.buyer) : updater;
        const customerName = newBuyer.name && newBuyer.name.trim() ? newBuyer.name.trim() : s.customerName;
        return { ...s, buyer: newBuyer, customerName };
      })
    );
  };

  const addSession = () => {
    if (sessions.length >= 10) return;
    const newId = `session-${Date.now()}`;
    const newSession = {
      id: newId,
      createdAt: Date.now(),
      customerName: null,
      cart: [],
      searchQuery: '',
      discountPct: 0,
      buyer: { name: '', phone: '', address: '' },
    };
    setSessions((prev) => [...prev, newSession]);
    setActiveSessionId(newId);
    setSessionPanelOpen(false);
  };

  const closeSession = (sessionId) => {
    setSessions((prev) => {
      const remaining = prev.filter((s) => s.id !== sessionId);
      if (sessionId === activeSessionId) {
        const next = remaining[0];
        if (next) setActiveSessionId(next.id);
      }
      if (remaining.length === 0) {
        const freshId = `session-${Date.now()}`;
        setActiveSessionId(freshId);
        return [
          {
            id: freshId,
            createdAt: Date.now(),
            customerName: null,
            cart: [],
            searchQuery: '',
            discountPct: 0,
            buyer: { name: '', phone: '', address: '' },
          },
        ];
      }
      return remaining;
    });
  };

  const [toasts, setToasts] = useState([]);
  const [splash, setSplash] = useState(true);
  const [splashOut, setSplashOut] = useState(false);
  const [edgeP, setEdgeP] = useState(0); // 0..1 left-edge swipe progress (iOS-style back hint)
  const [permAsk, setPermAsk] = useState(null); // { title, message, onRetry } permission-denied dialog
  const touch = useRef(null);
  const introNotifAsked = useRef(false); // true when the launch intro already requested notifications this session
  const syncEngineRef = useRef(null);

  useEffect(() => {
    syncEngineRef.current = new SyncEngine(
      (msg, tone) => notify(msg, tone),
      (newDb) => setDb(newDb)
    );
    return () => {
      if (syncEngineRef.current) {
        syncEngineRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    persist(db);
    if (syncEngineRef.current) {
      syncEngineRef.current.onLocalUpdate(db);
    }
  }, [db]);

  // Flash splash screen: logo fades in, then the whole layer fades out.
  useEffect(() => {
    const t1 = setTimeout(() => setSplashOut(true), 1250);
    const t2 = setTimeout(() => setSplash(false), 1750);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const notify = (msg, tone = 'ok') => {
    const id = uid();
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  };

  /* Fire a system notification for a kind, respecting the user's toggle. */
  const notifyEvent = (key, title, body) => pushNotif(db.settings, key, title, body);

  /* Permission-denied flow: explain, retry, or open Android App Settings. */
  const openPermissionDialog = (title, message, onRetry) => setPermAsk({ title, message, onRetry });

  /*
   * On launch (after the splash):
   * 1. Make sure notifications may actually be posted — ask for the runtime
   *    permission when it's first needed, and if it's blocked, explain and
   *    offer retry / Open Settings instead of failing silently.
   * 2. Alert once per day for low-stock / expiring products.
   */
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!Capacitor.isNativePlatform()) return;

      // One-time permission intro (first launch only): notifications → photos
      // & videos → file access. Each native dialog waits for the previous one.
      if (!localStorage.getItem('datapharm-perms-intro')) {
        localStorage.setItem('datapharm-perms-intro', '1');
        await ensureNotificationPermission();
        introNotifAsked.current = true;
        await requireMediaPermission();
        await requireFilesPermission();
      }

      const alerts = pendingLaunchAlerts(db, db.notifLog);
      if (!alerts.length) return;
      const fireAlerts = async () => {
        const results = await Promise.all(alerts.map((a) => pushNotif(db.settings, a.key, a.title, a.body)));
        // Only mark alerts as "notified today" when they were actually delivered,
        // so a denied permission doesn't swallow the reminder for the whole day.
        const delivered = alerts.filter((_, i) => results[i]);
        if (delivered.length) setDb((d) => ({ ...d, notifLog: markNotified(d.notifLog, delivered) }));
      };
      // If the intro already asked for notifications this session, don't pop the
      // native dialog a second time — reuse that outcome.
      const perm = introNotifAsked.current ? 'denied' : await ensureNotificationPermission();
      if (perm === 'granted') {
        fireAlerts();
        return;
      }
      // Permission is blocked — explain, let the user retry or open Settings.
      const retryNotif = async () => {
        const again = await ensureNotificationPermission();
        if (again === 'granted') {
          notify('Notifications enabled');
          fireAlerts();
        } else {
          openPermissionDialog(
            'Notifications are blocked',
            'Still blocked. Use Open Settings to allow notifications for DataPharm.',
            retryNotif
          );
        }
      };
      openPermissionDialog(
        'Notifications are blocked',
        `DataPharm wants to alert you: ${alerts.map((a) => a.title).join(', ')}. Allow notifications in Android Settings to receive these alerts.`,
        retryNotif
      );
    }, 2800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- left-edge swipe = back gesture (iOS style, works anywhere) ---- */
  const onTouchStart = (e) => {
    const t = e.touches && e.touches[0];
    if (!t) return;
    touch.current = { x: t.clientX, y: t.clientY };
    setEdgeP(0);
  };
  const onTouchMove = (e) => {
    if (!touch.current) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    const fromLeftEdge = touch.current.x <= 30;
    if (fromLeftEdge && dx > 6 && dx > Math.abs(dy) * 1.3) {
      // Live interactive hint that follows the finger, then commit past the threshold.
      setEdgeP(Math.min(1, dx / 64));
      if (dx > 64) {
        touch.current = null;
        setEdgeP(0);
        triggerBack();
      }
    }
  };
  const endTouch = () => {
    touch.current = null;
    setEdgeP(0);
  };

  /* ---- Android system back gesture / predictive back ---- */
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let cancelled = false;
    let handle;
    (async () => {
      const h = await CapApp.addListener('backButton', ({ canGoBack }) => {
        // Close the topmost open layer (sheet / modal / dock / sub-view) first.
        const handled = triggerBack();
        if (!handled) {
          if (canGoBack) window.history.back();
          else CapApp.exitApp();
        }
      });
      if (cancelled) h.remove();
      else handle = h;
    })();
    return () => {
      cancelled = true;
      if (handle) handle.remove();
    };
  }, []);

  /* ---- product actions ---- */
  const addProduct = (p) => setDb((d) => ({ ...d, products: [...d.products, p] }));
  const updateProduct = (id, patch) =>
    setDb((d) => ({ ...d, products: d.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const removeProduct = (id) => {
    setDb((d) => ({ ...d, products: d.products.filter((p) => p.id !== id) }));
    setCart((c) => c.filter((i) => i.id !== id));
  };
  const addStockIn = (product, strips, expiry) => {
    updateProduct(product.id, { strips: round2(product.strips + strips), ...(expiry ? { expiry } : {}) });
    setDb((d) => ({
      ...d,
      stockIns: [{ id: uid(), ts: Date.now(), productId: product.id, name: product.name, strips }, ...d.stockIns],
    }));
  };
  const setSettings = (patch) => setDb((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  const addCategory = (name) =>
    setDb((d) => (d.categories.includes(name) ? d : { ...d, categories: [...d.categories, name] }));
  const clearAll = () => {
    clearDB();
    setDb(loadDB());
    setCart([]);
    notify('All data cleared', 'err');
  };

  /* ---- sale action ---- */
  const sell = (items, discountPct, buyer = {}) => {
    const prods = db.products;
    for (const it of items) {
      const p = prods.find((x) => x.id === it.id);
      if (!p) return notify('Product missing', 'err');
      const needed = it.unit === 'strip' ? it.qty : it.qty / p.tabletsPerStrip;
      if (needed > p.strips + 1e-9) return notify(`Not enough stock of ${p.name}`, 'err');
    }
    const subtotal = round2(items.reduce((s, it) => s + lineTotal(prods.find((x) => x.id === it.id), it.qty, it.unit), 0));
    const discount = round2((subtotal * discountPct) / 100);
    const total = round2(subtotal - discount);
    const hasBuyer = !!(buyer && (buyer.name || buyer.phone || buyer.address));
    const sale = {
      id: uid(),
      ts: Date.now(),
      items: items.map((it) => {
        const p = prods.find((x) => x.id === it.id);
        return {
          productId: p.id,
          name: p.name,
          qty: it.qty,
          unit: it.unit,
          unitPrice: unitPrice(p, it.unit),
          line: lineTotal(p, it.qty, it.unit),
        };
      }),
      subtotal,
      discount,
      discountPct,
      total,
      buyer: hasBuyer
        ? {
            name: (buyer.name || '').trim(),
            phone: (buyer.phone || '').trim(),
            address: (buyer.address || '').trim(),
          }
        : undefined,
    };
    setDb((d) => ({
      ...d,
      sales: [sale, ...d.sales],
      products: d.products.map((p) => {
        const it = items.find((i) => i.id === p.id);
        if (!it) return p;
        const dec = it.unit === 'strip' ? it.qty : it.qty / p.tabletsPerStrip;
        const nstrips = round2(Math.max(0, p.strips - dec));
        // A product that runs out of stock has no valid expiry anymore — the
        // next stock-in must set a fresh expiry date.
        return { ...p, strips: nstrips, ...(nstrips <= 0 ? { expiry: '' } : {}) };
      }),
    }));
    closeSession(activeSessionId);
    notify(`Sale recorded · ${money(total, db.settings.currency)}`);
    notifyEvent('saleSuccess', 'Sale successful', `Recorded a sale for ${money(total, db.settings.currency)} — ${items.length} item${items.length > 1 ? 's' : ''}`);
    items.forEach((it) => {
      const p = prods.find((x) => x.id === it.id);
      if (!p) return;
      const dec = it.unit === 'strip' ? it.qty : it.qty / p.tabletsPerStrip;
      const after = round2(p.strips - dec);
      if (p.strips >= 2 && after < 2) {
        notifyEvent('lowStock', 'Low stock', `"${p.name}" has less than 2 strips left — restock soon`);
      }
    });
  };

  const screenProps = { db, notify, notifyEvent, openPermissionDialog };
  const hasCart = cart.length > 0;
  const fontSize = db.settings.fontSize || 'md';

  const isLocked = db.syncConfig && db.syncConfig.role === 'worker' && (
    db.syncConfig.status === 'revoked' ||
    (db.syncConfig.dailyVerification && db.syncConfig.lastVerifiedDate !== new Date().toISOString().slice(0, 10)) ||
    (() => {
      if (!db.syncConfig.expiryTime) return false;
      const [h, m] = db.syncConfig.expiryTime.split(':').map(Number);
      const cutoff = new Date();
      cutoff.setHours(h, m, 0, 0);
      return new Date() > cutoff;
    })()
  );

  const theme = db.settings.theme || 'dark';

  useEffect(() => {
    document.body.style.backgroundColor = theme === 'light' ? '#F9F6F0' : '#0D1117';

    if (!Capacitor.isNativePlatform()) return;
    try {
      BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => {});
      StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
      if (theme === 'light') {
        StatusBar.setBackgroundColor({ color: '#EAE3D9' }).catch(() => {});
        StatusBar.setStyle({ style: Style.Light }).catch(() => {});
      } else {
        StatusBar.setBackgroundColor({ color: '#161C24' }).catch(() => {});
        StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      }
    } catch (e) {}
  }, [theme]);

  return (
    <div
      className={`app theme-${theme} fs-${fontSize} ${hasCart ? 'cart-open' : ''}`}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={endTouch}
      onTouchCancel={endTouch}
    >
      {isLocked ? (
        <LockScreen db={db} setDb={setDb} notify={notify} />
      ) : (
        <>
          {tab === 'dash' && (
            <Dashboard
              {...screenProps}
              cart={cart}
              setCart={setCart}
              setSettings={setSettings}
              addProduct={addProduct}
              categories={db.categories}
              addCategory={addCategory}
              sessions={sessions}
              activeSessionId={activeSessionId}
              setActiveSessionId={setActiveSessionId}
              sessionPanelOpen={sessionPanelOpen}
              setSessionPanelOpen={setSessionPanelOpen}
              addSession={addSession}
              closeSession={closeSession}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
            />
          )}
          {tab === 'stock' && (
            <Stock
              {...screenProps}
              addProduct={addProduct}
              updateProduct={updateProduct}
              removeProduct={removeProduct}
              addStockIn={addStockIn}
              categories={db.categories}
              addCategory={addCategory}
            />
          )}
          {tab === 'history' && <History {...screenProps} />}
          {tab === 'settings' && <Settings {...screenProps} setSettings={setSettings} clearAll={clearAll} setDb={setDb} />}

          {hasCart && (
            <SellingPanel
              cart={cart}
              setCart={setCart}
              products={db.products}
              onSell={sell}
              notify={notify}
              settings={db.settings}
              discount={discount}
              setDiscount={setDiscount}
              buyer={buyer}
              setBuyer={setBuyer}
              onOpenSettings={() => setTab('settings')}
              onSaleCancelled={() => notifyEvent('saleCancelled', 'Sale cancelled', 'The pending sale was cancelled')}
            />
          )}

          {!hasCart && (
            <nav className="tabs">
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
                    <Icon size={21} />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </nav>
          )}
        </>
      )}

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <IconCheck size={15} />
            {t.msg}
          </div>
        ))}
      </div>

      <PermissionDialog
        open={!!permAsk}
        title={permAsk ? permAsk.title : ''}
        message={permAsk ? permAsk.message : ''}
        showOpenSettings={Capacitor.isNativePlatform()}
        onRetry={() => {
          const fn = permAsk && permAsk.onRetry;
          setPermAsk(null);
          if (fn) fn();
        }}
        onOpenSettings={() => openAppSettings()}
        onClose={() => setPermAsk(null)}
      />

      {edgeP > 0 && (
        <div
          className="edge-indicator"
          style={{
            opacity: Math.min(1, edgeP * 1.3),
            transform: `translateY(-50%) translateX(${edgeP * 14}px)`,
          }}
        >
          <IconArrowLeft size={18} />
        </div>
      )}

      {splash && (
        <div className={`splash ${splashOut ? 'out' : ''}`}>
          <img src={logoUrl} alt="DataPharm" />
        </div>
      )}
    </div>
  );
}
