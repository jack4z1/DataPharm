import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { IconImage, IconTrash, IconAlert, IconBell, IconPlus, IconMinus, IconGear, IconPrinter, IconBluetooth } from '../components/Icons.jsx';
import { ensureNotificationPermission, NOTIF_DEFAULTS } from '../lib/notifications.js';
import { uid } from '../lib/store.js';
import { printTestReceipt } from '../lib/print.js';

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

  const shopDetails = db.settings.shopDetails || { name: '', phone: '', address: '', email: '' };
  const DUMMY_IDS = ['bt-pos58', 'wifi-star', 'wifi-epson', 'POS-58 Thermal Printer', 'Star TSP100 Network Printer', 'Epson TM-T20III'];
  const isRealPrinter = (p) => p && p.id && !DUMMY_IDS.includes(p.id) && !DUMMY_IDS.includes(p.name);

  const rawConfig = db.settings.printerConfig || {};
  const cleanConnected = isRealPrinter(rawConfig.connectedPrinter) ? rawConfig.connectedPrinter : null;
  const cleanPaired = (rawConfig.pairedPrinters || []).filter(isRealPrinter);
  const printerConfig = { connectedPrinter: cleanConnected, pairedPrinters: cleanPaired };

  const [shopName, setShopName] = useState(shopDetails.name || '');
  const [shopPhone, setShopPhone] = useState(shopDetails.phone || '');
  const [shopAddress, setShopAddress] = useState(shopDetails.address || '');
  const [shopEmail, setShopEmail] = useState(shopDetails.email || '');

  const [scanningPrinter, setScanningPrinter] = useState(false);
  const [discoveredPrinters, setDiscoveredPrinters] = useState(printerConfig.pairedPrinters);

  const saveShopDetails = (updates) => {
    const next = { ...shopDetails, ...updates };
    setSettings({ shopDetails: next });
  };

  const handleScanPrinters = async () => {
    setScanningPrinter(true);
    notify('Scanning for printers...');

    try {
      if (typeof navigator !== 'undefined' && navigator.bluetooth) {
        const device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: ['00001101-0000-1000-8000-00805f9b34fb']
        });
        if (device) {
          const printer = { id: device.id, name: device.name || 'Wireless Receipt Printer', type: 'Bluetooth' };
          const updatedPrinters = [printer, ...discoveredPrinters.filter(p => p.id !== printer.id)];
          setDiscoveredPrinters(updatedPrinters);
          setSettings({
            printerConfig: {
              connectedPrinter: printer,
              pairedPrinters: updatedPrinters
            }
          });
          notify(`Connected to ${printer.name}`);
        }
      } else {
        notify('No printer found. Make sure your printer is turned on and connected via Bluetooth or Wi-Fi', 'warn');
      }
    } catch (e) {
      console.warn('Printer scan:', e);
      const msg = String((e && e.message) || e || '').toLowerCase();
      if (msg.includes('cancel') || msg.includes('user cancelled')) {
        notify('Printer scan cancelled', 'warn');
      } else {
        notify('No printer found. Check your Bluetooth or Wi-Fi connection', 'warn');
      }
    } finally {
      setTimeout(() => setScanningPrinter(false), 800);
    }
  };

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

      {/* ============ Shop Details ============ */}
      <section>
        <div className="sec-head">
          <h2>Shop Details</h2>
          <span className="muted">Header on all bills &amp; exports</span>
        </div>
        <div className="shop-details-form">
          <div className="field-group">
            <label>Shop Name</label>
            <input
              type="text"
              placeholder="e.g. Apollo Pharmacy"
              value={shopName}
              onChange={(e) => {
                setShopName(e.target.value);
                saveShopDetails({ name: e.target.value });
              }}
            />
          </div>
          <div className="field-group" style={{ marginTop: 10 }}>
            <label>Contact Phone</label>
            <input
              type="tel"
              placeholder="e.g. +91 98765 43210"
              value={shopPhone}
              onChange={(e) => {
                setShopPhone(e.target.value);
                saveShopDetails({ phone: e.target.value });
              }}
            />
          </div>
          <div className="field-group" style={{ marginTop: 10 }}>
            <label>Location / Address</label>
            <input
              type="text"
              placeholder="e.g. 123 Main Street, City"
              value={shopAddress}
              onChange={(e) => {
                setShopAddress(e.target.value);
                saveShopDetails({ address: e.target.value });
              }}
            />
          </div>
          <div className="field-group" style={{ marginTop: 10 }}>
            <label>Email ID</label>
            <input
              type="email"
              placeholder="e.g. contact@apollopharmacy.com"
              value={shopEmail}
              onChange={(e) => {
                setShopEmail(e.target.value);
                saveShopDetails({ email: e.target.value });
              }}
            />
          </div>
        </div>
      </section>

      {/* ============ Connect to Printer ============ */}
      <section>
        <div className="sec-head-col">
          <div className="sec-head">
            <h2>Connect to Printer</h2>
            <span className="muted">Wireless, Bluetooth &amp; Network Printers</span>
          </div>
          <span className="notif-sub" style={{ marginTop: 4 }}>
            <IconPrinter size={15} /> Works with any Bluetooth, Wireless or Network Printer
          </span>
        </div>

        <div className="printer-box" style={{ marginTop: 12 }}>
          <div className="printer-status-bar">
            <span>
              <b>Connected Printer</b>
              <br />
              <span className="meta">
                {printerConfig.connectedPrinter
                  ? `${printerConfig.connectedPrinter.name} (${printerConfig.connectedPrinter.type || 'Connected'})`
                  : 'No printer connected'}
              </span>
            </span>
            <button className="btn secondary sm" onClick={handleScanPrinters} disabled={scanningPrinter}>
              <IconBluetooth size={15} /> {scanningPrinter ? 'Scanning...' : 'Scan Nearby'}
            </button>
          </div>

          {discoveredPrinters.length > 0 ? (
            <div className="printer-list" style={{ marginTop: 12 }}>
              <span className="sub-title" style={{ fontSize: 12, fontWeight: 'bold', color: 'var(--muted)' }}>
                Available &amp; Paired Printers
              </span>
              {discoveredPrinters.map((p) => {
                const isSelected = printerConfig.connectedPrinter && printerConfig.connectedPrinter.id === p.id;
                return (
                  <div
                    key={p.id}
                    className={`printer-item ${isSelected ? 'active' : ''}`}
                    onClick={() => {
                      setSettings({
                        printerConfig: {
                          ...printerConfig,
                          connectedPrinter: p
                        }
                      });
                      notify(`Selected ${p.name}`);
                    }}
                  >
                    <IconPrinter size={18} />
                    <div className="printer-info">
                      <b>{p.name}</b>
                      <span className="meta">{p.type || 'Printer'}</span>
                    </div>
                    {isSelected && <span className="badge-on">Connected</span>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="printer-empty" style={{ textAlign: 'center', padding: '16px 8px', color: 'var(--muted)', fontSize: 12, marginTop: 10 }}>
              <IconPrinter size={28} style={{ opacity: 0.5, marginBottom: 4 }} />
              <p style={{ margin: 0, fontWeight: 600 }}>No printer connected</p>
              <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.8 }}>Make sure your printer is turned on and connected via Bluetooth or Wi-Fi.</p>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <button
              className="btn secondary big"
              style={{ width: '100%' }}
              onClick={() => {
                printTestReceipt(db.settings);
                if (printerConfig.connectedPrinter) {
                  notify('Printing test receipt... 🖨️');
                } else {
                  notify('Not connected to a printer 🖨️', 'warn');
                }
              }}
            >
              <IconPrinter size={18} /> Print Test Receipt
            </button>
          </div>
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
