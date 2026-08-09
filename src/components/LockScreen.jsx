import { useState } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import logoUrl from '../../logo/DataPharm.png';

export default function LockScreen({ db, setDb, notify }) {
  const [scanning, setScanning] = useState(false);
  const lockReason = getLockReason(db);

  if (!lockReason) return null;

  function getLockReason(d) {
    if (!d || !d.syncConfig || d.syncConfig.role !== 'worker') return null;
    const config = d.syncConfig;
    if (config.status === 'revoked') return 'revoked';
    const now = new Date();
    if (config.dailyVerification) {
      const todayStr = now.toISOString().slice(0, 10);
      if (config.lastVerifiedDate !== todayStr) return 'verify_needed';
    }
    if (config.expiryTime) {
      const [h, m] = config.expiryTime.split(':').map(Number);
      const cutoff = new Date();
      cutoff.setHours(h, m, 0, 0);
      if (now > cutoff) return 'expired';
    }
    return null;
  }

  const startScanning = () => {
    setScanning(true);
    // Let the DOM render the reader div, then initialize
    setTimeout(() => {
      const scanner = new Html5QrcodeScanner("daily-qr-reader", { 
        fps: 10, 
        qrbox: 250,
        rememberLastUsedCamera: true
      }, false);

      scanner.render((decodedText) => {
        scanner.clear();
        setScanning(false);
        handleScannedQR(decodedText);
      }, (error) => {
        // ignore errors
      });
    }, 100);
  };

  const handleScannedQR = (text) => {
    try {
      const parts = text.split(':');
      if (parts[0] !== 'datapharm-daily-verify') {
        notify('Invalid daily verification QR', 'err');
        return;
      }
      const [_, shopId, dateStr, token] = parts;
      const config = db.syncConfig;

      if (shopId !== config.shopId) {
        notify('This QR belongs to another shop', 'err');
        return;
      }
      if (token !== config.syncToken) {
        notify('Invalid authorization token', 'err');
        return;
      }
      const todayStr = new Date().toISOString().slice(0, 10);
      if (dateStr !== todayStr) {
        notify('This QR has expired (was generated for another day)', 'err');
        return;
      }

      // Valid QR code! Unlock device for the day
      setDb({
        ...db,
        syncConfig: {
          ...db.syncConfig,
          lastVerifiedDate: todayStr
        }
      });
      notify('Device verified and unlocked!');
    } catch (e) {
      notify('Failed to scan QR code', 'err');
    }
  };

  return (
    <div className="lockscreen-overlay">
      <div className="lockscreen-card">
        <img className="lockscreen-logo" src={logoUrl} alt="DataPharm Logo" />
        <h1>Device Locked</h1>
        
        {lockReason === 'revoked' && (
          <p className="lockscreen-message">
            Access to this shop database has been revoked by the owner. Please contact the owner if you think this is a mistake.
          </p>
        )}

        {lockReason === 'expired' && (
          <p className="lockscreen-message">
            Your daily access period has expired (after {db.syncConfig.expiryTime}). Access will be restored tomorrow, or you can ask the owner to update your access schedule.
          </p>
        )}

        {lockReason === 'verify_needed' && (
          <>
            <p className="lockscreen-message">
              Daily verification required. Scan the owner's morning verification QR code to unlock this device.
            </p>
            {scanning ? (
              <div className="daily-qr-container">
                <div id="daily-qr-reader"></div>
                <button className="btn ghost" onClick={() => setScanning(false)} style={{ marginTop: 12 }}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="btn primary" onClick={startScanning}>
                Scan Daily QR
              </button>
            )}
          </>
        )}

        <div className="lockscreen-footer">
          Device ID: <code>{db.syncConfig.deviceId.slice(0, 8)}</code>
        </div>
      </div>
    </div>
  );
}
