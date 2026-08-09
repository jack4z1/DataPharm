import { useEffect, useRef } from 'react';
import { registerBack } from '../lib/back.js';
import { IconX } from './Icons.jsx';

export default function Sheet({ open, onClose, title, children, footer }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    return registerBack(() => closeRef.current());
  }, [open]);

  if (!open) return null;
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {title && (
          <div className="sheet-head">
            <h3>{title}</h3>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <IconX size={18} />
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </div>
  );
}
