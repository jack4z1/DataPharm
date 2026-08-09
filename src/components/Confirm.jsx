import { useEffect, useRef } from 'react';
import { registerBack } from '../lib/back.js';

export default function Confirm({ open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', tone = 'primary', onConfirm, onCancel }) {
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    if (!open) return;
    return registerBack(() => cancelRef.current());
  }, [open]);

  if (!open) return null;
  return (
    <div className="backdrop confirm-backdrop" onClick={onCancel}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {message && <p>{message}</p>}
        <div className="confirm-actions">
          <button className="btn ghost" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`btn ${tone === 'danger' ? 'danger-solid' : 'primary'}`} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
