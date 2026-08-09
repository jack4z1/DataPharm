import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { IconImage, IconTrash, IconAlert, IconBell, IconPlus, IconMinus, IconGear } from '../components/Icons.jsx';
import { ensureNotificationPermission, NOTIF_DEFAULTS } from '../lib/notifications.js';
import { uid } from '../lib/store.js';

const NOTIF_TYPES = [
  { key: 'lowStock', label: 'Low stock', desc: 'When a product drops below 2 strips' },
  { key: 'expiringSoon', label: 'Expiring soon', desc: 'Products expiring within 90 days' },
  { key: 'saleSuccess', label: 'Sale successful', desc: 'When a sale is recorded' },
  { key: 'saleCancelled', label: 'Sale cancelled', desc: 'When a pending sale is cancelled' },
  { key: 'qrSet', label: 'QR code set', desc: 'When a payment QR is added' },
];

function readAndShrink(file, max = 512) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function QRCanvas({ text, size = 180 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (canvasRef.current && text) {
      QRCode.toCanvas(canvasRef.current, text, {
        width: size,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      }, (err) => {
        if (err) console.error(err);
      });
    }
  }, [text, size]);

  return <canvas ref={canvasRef} style={{ borderRadius: 12, maxWidth: '100%' }} />;
}

export default function Settings({ db, setSettings, clearAll, notify, notifyEvent, openPermissionDialog, setDb }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [shopNameInput, setShopNameInput] = useState('');
  const [workerNameInput, setWorkerNameInput] = useState('Counter Tablet');
  const [showInviteQr, setShowInviteQr] = useState(false);
  const [showDailyQr, setShowDailyQr] = useState(false);
  const [scanningPair, setScanningPair] = useState(false);
  
  const fileRef = useRef(null);
  const cur = db.settings.currency;
  const fontSize = db.settings.fontSize || 'md';
  const theme = db.settings.theme || 'dark';
  const qrImage = db.settings.qrImage || '';
  const notifs = { ...NOTIF_DEFAULTS, ...(db.settings.notifications || {}) };

  const syncConfig = db.syncConfig || { shopId: '', role: '', deviceId: uid(), status: 'active', workers: [] };

  const openQrPicker = () => fileRef.current.click();

  const flipNotif = async (key) => {
    const next = !notifs[key];
    if (next) {
      const res = await ensureNotificationPermission();
      if (res === 'denied') {
        openPermissionDialog(
          'Notifications are blocked',
          'Allow notifications in Android Settings to receive low-stock, expiry, sale and QR alerts. If you blocked it earlier, use Open Settings to enable them.',
          async () => {
            const again = await ensureNotificationPermission();
            if (again === 'granted') setSettings({ notifications: { ...notifs, [key]: true } });
          }
        );
        return;
      }
    }
    setSettings({ notifications: { ...notifs, [key]: next } });
  };

  const pickFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await readAndShrink(file);
      setSettings({ qrImage: dataUrl });
      notify('Payment QR saved');
      notifyEvent('qrSet', 'QR code set', 'Your payment QR is ready to show on the Sell screen');
    } catch (err) {
      console.error(err);
      notify('Could not read that image', 'err');
    }
  };

  const handleCurrencyChange = async (newCur) => {
    const oldCur = db.settings.currency || '₹';
    if (newCur === oldCur) return;

    if (!db.settings.onlineMode) {
      setSettings({ currency: newCur });
      notify(`Currency symbol updated to ${newCur} (Enable Online mode to convert item prices based on live market rates)`, 'warn');
      return;
    }

    const CURRENCY_CODES = {
      '₹': 'INR',
      '$': 'USD',
      '€': 'EUR',
      '¥': 'CNY'
    };

    const oldCode = CURRENCY_CODES[oldCur] || 'INR';
    const newCode = CURRENCY_CODES[newCur] || 'USD';

    let rates = { USD: 1, INR: 95.24, EUR: 0.865, CNY: 6.75 };
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (res.ok) {
        const data = await res.json();
        if (data && data.rates) {
          rates = data.rates;
        }
      }
    } catch (err) {
      console.warn('Using fallback exchange rates:', err);
    }

    const oldRateInUSD = rates[oldCode] || 1;
    const newRateInUSD = rates[newCode] || 1;
    const conversionRatio = newRateInUSD / oldRateInUSD;

    const updatedProducts = (db.products || []).map((p) => {
      const convertedPrice = Math.round(p.price * conversionRatio * 100) / 100;
      return {
        ...p,
        price: convertedPrice,
        updatedAt: Date.now()
      };
    });

    setDb({
      ...db,
      products: updatedProducts,
      settings: {
        ...db.settings,
        currency: newCur
      }
    });

    notify(
      `Converted prices from ${oldCur} to ${newCur} (Rate: 1 ${oldCode} = ${conversionRatio.toFixed(4)} ${newCode})`
    );
  };

  // Sync Network handlers
  const createShop = () => {
    if (!shopNameInput.trim()) {
      notify('Please enter a shop name', 'err');
      return;
    }
    const shopId = uid();
    const syncToken = uid();
    setDb({
      ...db,
      syncConfig: {
        ...syncConfig,
        shopId,
        role: 'owner',
        deviceName: 'Owner Main Device',
        syncToken,
        status: 'active',
        workers: []
      },
      settings: {
        ...db.settings,
        onlineMode: true // automatically enable online mode when starting shop
      }
    });
    notify(`Shop "${shopNameInput.trim()}" initialized`);
  };

  const startJoinScanner = () => {
    setScanningPair(true);
    setTimeout(() => {
      const scanner = new Html5QrcodeScanner("pair-qr-reader", { 
        fps: 10, 
        qrbox: 250,
        rememberLastUsedCamera: true
      }, false);

      scanner.render((decodedText) => {
        scanner.clear();
        setScanningPair(false);
        processJoinQR(decodedText);
      }, (error) => {
        // ignore scan failures
      });
    }, 100);
  };

  const processJoinQR = (text) => {
    try {
      const parts = text.split(':');
      if (parts[0] !== 'datapharm-invite') {
        notify('Invalid pairing QR code', 'err');
        return;
      }
      const [_, shopId, syncToken] = parts;
      
      setDb({
        ...db,
        syncConfig: {
          ...syncConfig,
          shopId,
          role: 'worker',
          deviceName: workerNameInput.trim() || 'Worker Device',
          syncToken,
          status: 'active',
          lastVerifiedDate: ''
        },
        settings: {
          ...db.settings,
          onlineMode: true
        }
      });
      notify('Joined shop network successfully!');
    } catch (e) {
      notify('Failed to scan pairing QR', 'err');
    }
  };

  const disconnectShop = () => {
    setDb({
      ...db,
      syncConfig: {
        shopId: '',
        role: '',
        deviceId: uid(),
        deviceName: '',
        syncToken: '',
        expiryTime: '',
        dailyVerification: false,
        status: 'active',
        workers: []
      }
    });
    notify('Disconnected from shop network');
  };

  const toggleWorkerVerification = (deviceId) => {
    const updated = syncConfig.workers.map(w => 
      w.deviceId === deviceId ? { ...w, dailyVerification: !w.dailyVerification } : w
    );
    setDb({
      ...db,
      syncConfig: { ...syncConfig, workers: updated }
    });
  };

  const updateWorkerExpiry = (deviceId, expiryTime) => {
    const updated = syncConfig.workers.map(w => 
      w.deviceId === deviceId ? { ...w, expiryTime } : w
    );
    setDb({
      ...db,
      syncConfig: { ...syncConfig, workers: updated }
    });
  };

  const toggleWorkerRevocation = (deviceId) => {
    const updated = syncConfig.workers.map(w => {
      if (w.deviceId === deviceId) {
        const nextStatus = w.status === 'revoked' ? 'offline' : 'revoked';
        return { ...w, status: nextStatus };
      }
      return w;
    });
    setDb({
      ...db,
      syncConfig: { ...syncConfig, workers: updated }
    });
  };

  // Generate codes
  const inviteCodeText = `datapharm-invite:${syncConfig.shopId}:${syncConfig.syncToken}`;
  const todayStr = new Date().toISOString().slice(0, 10);
  const dailyCodeText = `datapharm-daily-verify:${syncConfig.shopId}:${todayStr}:${syncConfig.syncToken}`;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">App runs 100% offline on this device</p>
        </div>
        <div className="logo">
          <IconGear size={22} style={{ color: 'var(--primary)' }} />
        </div>
      </header>

      {/* ============ Store Sync Mesh Network ============ */}
      <section>
        <div className="sec-head">
          <h2>Store Mesh Sync</h2>
          <span className="muted">Pair devices over WebRTC (direct P2P)</span>
        </div>

        {!syncConfig.shopId ? (
          <div className="sync-setup-card">
            <div className="sync-setup-choice">
              <h3>Option 1: Setup Shop (Owner)</h3>
              <input 
                type="text" 
                value={shopNameInput} 
                onChange={(e) => setShopNameInput(e.target.value)} 
                placeholder="Enter shop name (e.g. Apollo Pharmacy)" 
              />
              <button className="btn primary" onClick={createShop}>
                Initialize Shop
              </button>
            </div>
            
            <div className="divider-line"><span>OR</span></div>
            
            <div className="sync-setup-choice" style={{ marginTop: 12 }}>
              <h3>Option 2: Join Existing Shop (Worker)</h3>
              <input 
                type="text" 
                value={workerNameInput} 
                onChange={(e) => setWorkerNameInput(e.target.value)} 
                placeholder="Device label (e.g. Cashier 1)" 
              />
              {scanningPair ? (
                <div style={{ width: '100%', maxWidth: '280px', margin: '12px 0' }}>
                  <div id="pair-qr-reader"></div>
                  <button className="btn ghost small" onClick={() => setScanningPair(false)} style={{ marginTop: 8 }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button className="btn ghost" onClick={startJoinScanner}>
                  Scan Owner's Invite QR
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="sync-active-card">
            <div className="sync-status-header">
              <div>
                <span className="sync-role-badge">{syncConfig.role === 'owner' ? 'Owner / Main' : 'Worker / Terminal'}</span>
                <h3>Online Mesh Active</h3>
              </div>
              <button className="btn small danger-soft" onClick={disconnectShop}>
                Disconnect
              </button>
            </div>

            {syncConfig.role === 'owner' && (
              <div className="owner-controls" style={{ marginTop: 16 }}>
                <div className="owner-buttons-row">
                  <button className="btn small" onClick={() => setShowInviteQr(!showInviteQr)}>
                    {showInviteQr ? 'Hide Invite QR' : 'Show Invite QR'}
                  </button>
                  <button className="btn small" onClick={() => setShowDailyQr(!showDailyQr)}>
                    {showDailyQr ? 'Hide Daily QR' : 'Morning verification QR'}
                  </button>
                </div>

                {showInviteQr && (
                  <div className="qr-container-box">
                    <h4>Shop Invitation QR</h4>
                    <p className="muted small">Scan this QR on worker devices to link them to Apollos mesh</p>
                    <QRCanvas text={inviteCodeText} />
                    <code>Token: {syncConfig.syncToken.slice(0, 8)}</code>
                  </div>
                )}

                {showDailyQr && (
                  <div className="qr-container-box">
                    <h4>Morning Verification QR</h4>
                    <p className="muted small">Workers scan this to unlock their terminal today ({todayStr})</p>
                    <QRCanvas text={dailyCodeText} />
                  </div>
                )}

                <div className="workers-list-section" style={{ marginTop: 20 }}>
                  <h4>Paired Terminals</h4>
                  {syncConfig.workers.length === 0 ? (
                    <p className="muted small" style={{ marginTop: 8 }}>No workers paired yet. Show the Invite QR to connect terminals.</p>
                  ) : (
                    <div className="workers-list" style={{ marginTop: 10 }}>
                      {syncConfig.workers.map(w => (
                        <div key={w.deviceId} className="worker-row-card">
                          <div className="worker-info-meta">
                            <b>{w.deviceName}</b>
                            <span className={`status-dot ${w.status}`}>{w.status}</span>
                          </div>
                          
                          <div className="worker-settings-row">
                            <label className="worker-input-lbl">
                              Daily Lock cutoff
                              <input 
                                type="time" 
                                value={w.expiryTime || ''} 
                                onChange={(e) => updateWorkerExpiry(w.deviceId, e.target.value)} 
                              />
                            </label>
                            
                            <label className="worker-switch-lbl">
                              <span>Daily QR scan</span>
                              <button 
                                className={`switch small-switch ${w.dailyVerification ? 'on' : ''}`}
                                onClick={() => toggleWorkerVerification(w.deviceId)}
                              />
                            </label>
                          </div>

                          <button 
                            className={`btn small ${w.status === 'revoked' ? 'primary' : 'danger-soft'}`}
                            onClick={() => toggleWorkerRevocation(w.deviceId)}
                            style={{ marginTop: 8 }}
                          >
                            {w.status === 'revoked' ? 'Restore access' : 'Revoke access'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {syncConfig.role === 'worker' && (
              <div className="worker-status-details" style={{ marginTop: 16 }}>
                <p>Status: <b>{syncConfig.status === 'revoked' ? 'Access Revoked' : 'Paired'}</b></p>
                <p>Daily Cutoff Lock: <b>{syncConfig.expiryTime || 'None'}</b></p>
                <p>Daily QR Scan Required: <b>{syncConfig.dailyVerification ? 'Yes' : 'No'}</b></p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ============ Payment QR ============ */}
      <section>
        <div className="sec-head">
          <h2>Payment QR</h2>
          <span className="muted">Shown when you tap Sell</span>
        </div>
        <div className="qr-upload-card">
          {qrImage ? (
            <>
              <img className="qr-preview-img" src={qrImage} alt="Payment QR" />
              <p className="muted">Customers scan this QR on the Sell popup to pay.</p>
              <div className="qr-card-actions">
                <button className="btn small" onClick={openQrPicker}>
                  <IconImage size={15} /> Change
                </button>
                <button
                  className="btn small danger-soft"
                  onClick={() => {
                    setSettings({ qrImage: '' });
                    notify('Payment QR removed', 'err');
                  }}
                >
                  <IconTrash size={15} /> Remove
                </button>
              </div>
            </>
          ) : (
            <button className="qr-upload-btn" onClick={openQrPicker}>
              <IconImage size={26} />
              <span>Upload your payment QR image</span>
              <span className="muted">Customers scan this after you tap Sell</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />
        </div>
      </section>

      {/* ============ Preferences ============ */}
      <section>
        <div className="sec-head">
          <h2>Preferences</h2>
        </div>
        <div className="setting-row">
          <span>
            <b>App Theme</b>
            <span className="meta">Choose dark or Anthropic warm light</span>
          </span>
          <div className="seg">
            <button className={theme === 'dark' ? 'on' : ''} onClick={() => setSettings({ theme: 'dark' })}>
              Dark
            </button>
            <button className={theme === 'light' ? 'on' : ''} onClick={() => setSettings({ theme: 'light' })}>
              Light
            </button>
          </div>
        </div>
        <div className="setting-row" style={{ marginTop: 10 }}>
          <span>
            <b>Text size</b>
            <span className="meta">Applies to all screens</span>
          </span>
          <div className="seg fs-seg">
            <button className={fontSize === 'sm' ? 'on' : ''} onClick={() => setSettings({ fontSize: 'sm' })}>
              <span className="fs-a fs-sm-a">A</span>
            </button>
            <button className={fontSize === 'md' ? 'on' : ''} onClick={() => setSettings({ fontSize: 'md' })}>
              <span className="fs-a fs-md-a">A</span>
            </button>
          </div>
        </div>
        <div className="setting-row" style={{ marginTop: 10 }}>
          <span>
            <b>Currency</b>
            <span className="meta">Used for all prices</span>
          </span>
          <select value={cur} onChange={(e) => handleCurrencyChange(e.target.value)}>
            <option value="₹">₹ INR</option>
            <option value="$">$ USD</option>
            <option value="€">€ EUR</option>
            <option value="¥">¥ CNY</option>
          </select>
        </div>
      </section>

      {/* ============ Notifications ============ */}
      <section>
        <div className="sec-head-col">
          <div className="sec-head">
            <h2>Notifications</h2>
            <span className="muted">Alerts on this device</span>
          </div>
          <span className="notif-sub" style={{ marginTop: 4 }}>
            <IconBell size={15} /> Shown in your phone's notification shade
          </span>
        </div>
        <div className="notif-list">
          {NOTIF_TYPES.map((n) => (
            <div key={n.key} className="setting-row">
              <span>
                <b>{n.label}</b>
                <span className="meta">{n.desc}</span>
              </span>
              <button
                className={`switch ${notifs[n.key] ? 'on' : ''}`}
                role="switch"
                aria-checked={!!notifs[n.key]}
                aria-label={n.label}
                onClick={() => flipNotif(n.key)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ============ About ============ */}
      <section>
        <div className="sec-head">
          <h2>About</h2>
        </div>
        <div className="setting-row">
          <span>
            <b>DataPharm</b>
            <span className="meta">Version 1.0.0 · Medicine inventory & billing</span>
          </span>
          <span className="muted">
            {db.products.length} products · {db.sales.length} sales
          </span>
        </div>
      </section>

      <section>
        <button className={`btn danger ${confirmClear ? 'confirm' : ''}`} onClick={() => (confirmClear ? clearAll() : setConfirmClear(true))}>
          <IconAlert size={18} />
          {confirmClear ? 'Tap again to erase everything' : 'Clear all data'}
        </button>
      </section>
    </div>
  );
}
