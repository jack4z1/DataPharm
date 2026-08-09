import { useEffect, useMemo, useRef, useState } from 'react';
import { registerBack } from '../lib/back.js';
import { IconChevronDown, IconChevronUp, IconMinus, IconPlus, IconTrash, IconX, IconQr, IconCheck, IconUser } from './Icons.jsx';
import { lineTotal, unitPrice, round2, money } from '../lib/pricing.js';

const CATEGORY_UNITS = {
  'Tablet':    { stock: 'In stock (strips)',   unit2: 'Tablets / strip',   price: 'Price / strip',  field1: 'strips', field2: 'tabletsPerStrip' },
  'Capsule':   { stock: 'In stock (strips)',   unit2: 'Capsules / strip',  price: 'Price / strip',  field1: 'strips', field2: 'tabletsPerStrip' },
  'Syrup':     { stock: 'In stock (bottles)',  unit2: 'ML / bottle',       price: 'Price / bottle', field1: 'strips', field2: 'tabletsPerStrip' },
  'Injection': { stock: 'In stock (vials)',    unit2: 'ML / vial',         price: 'Price / vial',   field1: 'strips', field2: 'tabletsPerStrip' },
  'Ointment':  { stock: 'In stock (tubes)',    unit2: 'Grams / tube',      price: 'Price / tube',   field1: 'strips', field2: 'tabletsPerStrip' },
  'Drops':     { stock: 'In stock (bottles)',  unit2: 'ML / bottle',       price: 'Price / bottle', field1: 'strips', field2: 'tabletsPerStrip' },
  'Powder':    { stock: 'In stock (packs)',    unit2: 'Grams / pack',      price: 'Price / pack',   field1: 'strips', field2: 'tabletsPerStrip' },
  'Other':     { stock: 'In stock (units)',    unit2: 'Unit size',         price: 'Price / unit',   field1: 'strips', field2: 'tabletsPerStrip' },
};

const DEFAULT_UNITS = { stock: 'In stock', unit2: 'Units / pack', price: 'Price', field1: 'strips', field2: 'tabletsPerStrip' };

export default function SellingPanel({
  cart,
  setCart,
  products,
  onSell,
  notify,
  settings,
  discount: propDiscount,
  setDiscount: propSetDiscount,
  buyer: propBuyer,
  setBuyer: propSetBuyer,
  onOpenSettings = () => {},
  onSaleCancelled = () => {},
}) {
  const [mode, setMode] = useState('peek'); // 'peek' | 'full'
  const [payQr, setPayQr] = useState(false);
  const [confirmPaid, setConfirmPaid] = useState(false); // first tap "Paid" → second tap "Confirm"
  const [localDiscount, setLocalDiscount] = useState('');
  const [localBuyer, setLocalBuyer] = useState({ name: '', phone: '', address: '' });
  const [buyerOpen, setBuyerOpen] = useState(false);

  const discount = propDiscount !== undefined ? propDiscount : localDiscount;
  const setDiscount = propSetDiscount || setLocalDiscount;

  const buyer = propBuyer || localBuyer;
  const setBuyer = propSetBuyer || setLocalBuyer;
  const [drag, setDrag] = useState(null); // { startY, startMode }
  const [offset, setOffset] = useState(0); // live translateY while dragging
  const justDragged = useRef(false); // suppress synthetic click after a real drag

  // Left-edge swipe back: close QR popup first, then collapse the full dock.
  const closeQr = () => {
    setPayQr(false);
    setConfirmPaid(false);
  };
  const closeQrRef = useRef(closeQr);
  closeQrRef.current = closeQr;
  useEffect(() => {
    if (payQr) return registerBack(() => closeQrRef.current());
  }, [payQr]);
  useEffect(() => {
    if (mode === 'full') return registerBack(() => setMode('peek'));
  }, [mode]);

  const selected = useMemo(
    () =>
      cart
        .map((c) => {
          const p = products.find((x) => x.id === c.id);
          return p ? { ...p, qty: c.qty, unit: c.unit } : null;
        })
        .filter(Boolean),
    [cart, products]
  );

  const cur = settings.currency;
  const subtotal = round2(selected.reduce((s, x) => s + lineTotal(x, x.qty, x.unit), 0));
  const discPct = Math.min(Math.max(parseFloat(discount) || 0, 0), 100);
  const discAmt = round2((subtotal * discPct) / 100);
  const total = round2(subtotal - discAmt);

  const overstock = selected.filter((x) => {
    const need = x.unit === 'strip' ? x.qty : x.qty / x.tabletsPerStrip;
    return need > x.strips + 1e-9;
  });

  const setQty = (id, qty) => setCart((c) => c.map((i) => (i.id === id ? { ...i, qty: Math.max(1, qty) } : i)));
  const setUnit = (id, unit) => setCart((c) => c.map((i) => (i.id === id ? { ...i, unit, qty: 1 } : i)));
  const remove = (id) => setCart((c) => c.filter((i) => i.id !== id));
  const clearCart = () => {
    setCart([]);
    setPayQr(false);
    setConfirmPaid(false);
    setDiscount('');
    setBuyer({ name: '', phone: '', address: '' });
    setBuyerOpen(false);
  };

  /* ---- drag to expand / collapse ---- */
  const startDrag = (e) => {
    if (e.target.closest('button, input, select, a, .sell-body, .sell-bill')) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ startY: e.clientY, startMode: mode });
    setOffset(0);
  };
  const moveDrag = (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const cap = window.innerHeight * 0.62;
    setOffset(drag.startMode === 'peek' ? Math.max(-cap, Math.min(0, dy)) : Math.min(cap, Math.max(0, dy)));
  };
  const endDrag = (e) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dy) < 8) {
      // plain tap -> toggle
      setMode((m) => (m === 'peek' ? 'full' : 'peek'));
    } else {
      // real drag -> ignore the synthetic click that follows
      justDragged.current = true;
      setTimeout(() => {
        justDragged.current = false;
      }, 120);
      if (drag.startMode === 'peek' && dy < -60) setMode('full');
      else if (drag.startMode === 'full' && dy > 60) setMode('peek');
    }
    setDrag(null);
    setOffset(0);
  };

  /* ---- sell + payment ---- */
  const pressSell = () => {
    if (overstock.length) return notify('Some quantities are more than available stock', 'err');
    setConfirmPaid(false);
    setPayQr(true);
  };
  const pressPaid = () => {
    if (!confirmPaid) {
      setConfirmPaid(true);
      return;
    }
    closeQr();
    setDiscount('');
    setBuyer({ name: '', phone: '', address: '' });
    setBuyerOpen(false);
    onSell(cart, discPct, buyer);
  };

  if (selected.length === 0) return null;

  const dockStyle = drag ? { transform: `translateX(-50%) translateY(${offset}px)` } : undefined;

  return (
    <>
      <div
        className={`sell-dock ${mode} ${drag ? 'dragging' : ''}`}
        style={dockStyle}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={(e) => {
          if (justDragged.current) {
            e.preventDefault();
            e.stopPropagation();
            justDragged.current = false;
          }
        }}
      >
        <div className="sell-head">
          <div className="sell-handle" />
          <div className="sell-head-row">
            <div className="sell-title">
              <b>Selling now</b>
              <span className="muted">
                {selected.length} item{selected.length > 1 ? 's' : ''} · {money(subtotal, cur)}
              </span>
            </div>
            <div className="sell-head-actions">
              <button className="icon-btn" onClick={clearCart} aria-label="Clear cart">
                <IconTrash size={17} />
              </button>
              <button
                className="icon-btn"
                onClick={() => setMode((m) => (m === 'peek' ? 'full' : 'peek'))}
                aria-label={mode === 'peek' ? 'Expand' : 'Collapse'}
              >
                {mode === 'peek' ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
              </button>
            </div>
          </div>
        </div>

        {mode === 'peek' ? (
          <div className="sell-peek">
            <div className="peek-chips">
              {selected.slice(0, 3).map((x) => (
                <span key={x.id} className="peek-chip">
                  {x.name} ×{x.qty}
                  {x.location ? <i className="peek-loc"> · {x.location}</i> : null}
                </span>
              ))}
              {selected.length > 3 && <span className="peek-chip">+{selected.length - 3} more</span>}
            </div>
            <div className="peek-actions">
              <button className="btn primary sell-btn" onClick={() => setMode('full')}>
                Detail
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="sell-body">
              <div className="cart-list">
                {selected.map((x) => {
                  const u = CATEGORY_UNITS[x.category] || DEFAULT_UNITS;
                  const u1Raw = u.price.includes('/') ? u.price.split('/')[1].trim() : 'strip';
                  const u1Cap = u1Raw.charAt(0).toUpperCase() + u1Raw.slice(1);
                  const u2Raw = u.unit2.includes('/') ? u.unit2.split('/')[0].trim() : 'tablet';
                  const u2Cap = u2Raw.endsWith('s') ? u2Raw.slice(0, -1) : u2Raw;
                  return (
                    <div className="cart-item" key={x.id}>
                      <div className="cart-top">
                        <b>{x.name}</b>
                        <button className="icon-btn" onClick={() => remove(x.id)} aria-label="Remove">
                          <IconX size={16} />
                        </button>
                      </div>
                      <div className="cart-loc">
                        {x.location ? (
                          <span className="loc-chip">📍 {x.location}</span>
                        ) : (
                          <span className="muted dim">No shelf set</span>
                        )}
                      </div>
                      <div className="cart-ctl">
                        <div className="seg">
                          <button className={x.unit === 'strip' ? 'on' : ''} onClick={() => setUnit(x.id, 'strip')}>
                            {u1Cap}
                          </button>
                          <button className={x.unit === 'tablet' ? 'on' : ''} onClick={() => setUnit(x.id, 'tablet')}>
                            {u2Cap}
                          </button>
                        </div>
                        <div className="stepper">
                          <button onClick={() => setQty(x.id, x.qty - 1)} aria-label="Decrease">
                            <IconMinus size={15} />
                          </button>
                          <b>{x.qty}</b>
                          <button onClick={() => setQty(x.id, x.qty + 1)} aria-label="Increase">
                            <IconPlus size={15} />
                          </button>
                        </div>
                        <span className="cart-total">{money(lineTotal(x, x.qty, x.unit), cur)}</span>
                      </div>
                      <div className="cart-sub">
                        <span className="muted">
                          {money(unitPrice(x, x.unit), cur)} per {x.unit === 'strip' ? u1Raw.toLowerCase() : `${u2Cap.toLowerCase()} · ${x.tabletsPerStrip}/${u1Raw.toLowerCase()}`}
                        </span>
                        {(() => {
                          const need = x.unit === 'strip' ? x.qty : x.qty / x.tabletsPerStrip;
                          if (need > x.strips + 1e-9) return <span className="err-text">Only {x.strips} {u1Raw.toLowerCase()}s left</span>;
                          return null;
                        })()}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="buyer-sec">
                <button
                  type="button"
                  className="buyer-toggle"
                  aria-expanded={buyerOpen}
                  onClick={() => setBuyerOpen((o) => !o)}
                >
                  <IconUser size={16} />
                  <span>{buyerOpen ? 'Hide buyer details' : 'Add buyer details (optional)'}</span>
                  <IconChevronDown size={15} className={`chev ${buyerOpen ? 'open' : ''}`} />
                </button>
                {buyerOpen && (
                  <div className="buyer-fields">
                    <input
                      placeholder="Buyer name"
                      value={buyer.name}
                      onChange={(e) => setBuyer({ ...buyer, name: e.target.value })}
                    />
                    <input
                      type="tel"
                      inputMode="tel"
                      placeholder="Phone number"
                      value={buyer.phone}
                      onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })}
                    />
                    <input
                      placeholder="Address"
                      value={buyer.address}
                      onChange={(e) => setBuyer({ ...buyer, address: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="sell-bill">
              <div className="bill">
                <div className="bill-row">
                  <span>Subtotal</span>
                  <b>{money(subtotal, cur)}</b>
                </div>
                <div className="bill-row">
                  <span>Discount</span>
                  <span className="disc-input">
                    <input
                      inputMode="decimal"
                      placeholder="0"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value.replace(/[^0-9.]/g, ''))}
                    />
                    %<b className="disc-amt">−{money(discAmt, cur)}</b>
                  </span>
                </div>
                <div className="bill-row total">
                  <span>Total</span>
                  <b className="total-amt">{money(total, cur)}</b>
                </div>
              </div>
              <button className="btn primary big" onClick={pressSell}>
                Sell · {money(total, cur)}
              </button>
            </div>
          </>
        )}
      </div>

      {payQr && (
        <div className="backdrop qr-backdrop" onClick={closeQr}>
          <div className="qr-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Scan to pay</h3>
            <div className="qr-total">{money(total, cur)}</div>
            {settings.qrImage ? (
              <img className="qr-img" src={settings.qrImage} alt="Payment QR" />
            ) : (
              <div className="qr-empty">
                <IconQr size={44} />
                <p>No payment QR set yet.</p>
                <button
                  className="btn small"
                  onClick={() => {
                    closeQr();
                    onOpenSettings();
                  }}
                >
                  Add it in Settings
                </button>
              </div>
            )}
            <p className="muted center">
              {confirmPaid
                ? 'Tap Confirm to record this sale.'
                : 'Ask the customer to scan & pay, then confirm.'}
            </p>
            <div className="qr-actions">
              <button
                className="btn ghost"
                onClick={() => {
                  closeQr();
                  onSaleCancelled();
                }}
              >
                Cancel
              </button>
              <button className={`btn ${confirmPaid ? 'primary' : 'ghost qr-paid'}`} onClick={pressPaid}>
                <IconCheck size={16} /> {confirmPaid ? 'Confirm' : 'Paid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
