import { useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { registerBack } from '../lib/back.js';

export default function BarcodeModal({ open, onClose, onScan, notify }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    return registerBack(() => closeRef.current());
  }, [open]);

  useEffect(() => {
    if (!open) return;

    let scanner;
    const initScanner = () => {
      scanner = new Html5QrcodeScanner("barcode-reader", { 
        fps: 10, 
        qrbox: { width: 250, height: 150 }, // rectangle box for barcode
        rememberLastUsedCamera: true
      }, false);

      scanner.render((decodedText) => {
        scanner.clear();
        onScan(decodedText);
      }, (error) => {
        // ignore scan failures (they occur when no barcode is in view)
      });
    };

    // Let the DOM render first
    const timer = setTimeout(initScanner, 100);

    return () => {
      clearTimeout(timer);
      if (scanner) {
        try {
          scanner.clear();
        } catch (e) {
          // ignore cleanup errors if scanner was already cleared
        }
      }
    };
  }, [open, onScan]);

  if (!open) return null;

  return (
    <div className="backdrop barcode-backdrop" onClick={onClose}>
      <div className="barcode-modal" onClick={(e) => e.stopPropagation()}>
        <h3>Scan Barcode</h3>
        <p className="muted">Point your camera at the medicine's barcode</p>
        <div className="barcode-reader-container">
          <div id="barcode-reader"></div>
        </div>
        <button className="btn ghost big" onClick={onClose} style={{ marginTop: 12 }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
