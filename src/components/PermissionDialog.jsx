import { useEffect, useRef } from 'react';
import { registerBack } from '../lib/back.js';

export default function PermissionDialog({ open, title, message, showOpenSettings = true, onRetry, onOpenSettings, onClose }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    return registerBack(() => closeRef.current());
  }, [open]);

  if (!open) return null;
  return (
    <div className="backdrop confirm-backdrop" onClick={onClose}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {message && <p>{message}</p>}
        <div className="perm-actions">
          <button className="btn primary" onClick={onRetry}>
            Try again
          </button>
          <div className="perm-actions-row">
            {showOpenSettings && (
              <button className="btn ghost" onClick={onOpenSettings}>
                Open Settings
              </button>
            )}
            <button className="btn ghost" onClick={onClose}>
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
