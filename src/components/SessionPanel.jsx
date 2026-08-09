import { IconPlus, IconX } from './Icons.jsx';

export default function SessionPanel({ sessions, activeSessionId, onSwitch, onAdd, onClose }) {
  const fmt = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  
  return (
    <>
      {/* Backdrop */}
      <div className="session-backdrop" onClick={onClose} />
      
      {/* Panel */}
      <div className="session-panel">
        <div className="session-panel-head">
          <span>Customers</span>
          <button onClick={onClose} aria-label="Close"><IconX size={20} /></button>
        </div>

        <button
          className={`session-add-btn ${sessions.length >= 10 ? 'disabled' : ''}`}
          onClick={onAdd}
          disabled={sessions.length >= 10}
        >
          <IconPlus size={18} />
          {sessions.length >= 10 ? 'Max 10 customers reached' : 'New Customer'}
        </button>

        <div className="session-list">
          {sessions.map((s, i) => {
            const isActive = s.id === activeSessionId;
            const displayName = s.customerName || s.buyer?.name || `Customer ${i + 1}`;
            const itemCount = s.cart.reduce((sum, c) => sum + c.qty, 0);
            return (
              <button
                key={s.id}
                className={`session-row ${isActive ? 'active' : ''}`}
                onClick={() => onSwitch(s.id)}
              >
                <span className="session-dot" />
                <span className="session-info">
                  <b>{displayName}</b>
                  <span>{itemCount} item{itemCount !== 1 ? 's' : ''} · {fmt(s.createdAt)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
