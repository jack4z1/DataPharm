import { useState } from 'react';
import { IconPlus, IconPencil, IconTrash, IconMinus, IconBoxAdd, IconBox, IconAlert } from '../components/Icons.jsx';
import Sheet from '../components/Sheet.jsx';
import ProductForm from '../components/ProductForm.jsx';
import { stockParts, expiryInfo, money, round2 } from '../lib/pricing.js';
import { uid } from '../lib/store.js';

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

export default function Stock({ db, addProduct, updateProduct, removeProduct, addStockIn, notify, notifyEvent, categories, addCategory }) {
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState(null);
  const [detail, setDetail] = useState(null);
  const [restock, setRestock] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const cur = db.settings.currency;

  const sorted = [...db.products].sort((a, b) => a.name.localeCompare(b.name));

  const submit = (data, initial) => {
    if (initial) {
      updateProduct(initial.id, data);
      notify('Product updated');
    } else {
      addProduct({ ...data, id: uid(), createdAt: Date.now() });
      notify('Added to stock');
      const ex = expiryInfo(data.expiry);
      if (ex.tone === 'warn' || ex.tone === 'danger') {
        const expired = ex.tone === 'danger';
        notifyEvent(
          'expiringSoon',
          expired ? 'Expiry passed' : 'Expiring soon',
          `"${data.name}" — ${ex.label}. ${expired ? 'Sell or remove it soon' : 'Restock or sell it soon'}`
        );
      }
    }
    setShowForm(false);
    setEdit(null);
    setDetail(null);
  };

  const doDelete = () => {
    removeProduct(detail.id);
    notify('Product deleted', 'err');
    setDetail(null);
    setConfirmDel(false);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Stock</h1>
          <p className="sub">{db.products.length} product{db.products.length === 1 ? '' : 's'} in inventory</p>
        </div>
        <div className="logo">
          <IconBox size={22} style={{ color: 'var(--primary)' }} />
        </div>
      </header>

      {sorted.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">
            <IconBox size={44} />
          </div>
          <p>Your inventory is empty.<br />Add your first product to start selling.</p>
          <button className="btn primary" onClick={() => setShowForm(true)}>
            Add product
          </button>
        </div>
      ) : (
        <div className="stock-list">
          {sorted.map((p) => {
            const st = stockParts(p);
            const ex = expiryInfo(p.expiry);
            const oos = p.strips <= 0;
            const low = !oos && p.strips < 2;
            return (
              <button key={p.id} className={`stock-row ${low ? 'low' : ''} ${oos ? 'out' : ''}`} onClick={() => setDetail(p)}>
                <span className="stock-main">
                  <b>{p.name}</b>
                  <span className="meta">
                    {p.buyFrom ? p.buyFrom : <span className="dim">Unknown supplier</span>}
                    {p.location ? ` · ${p.location}` : ''}
                  </span>
                  <span className="chips">
                    {oos && (
                      <span className="badge danger oos-badge">
                        <IconAlert size={11} /> Out of stock
                      </span>
                    )}
                    {low && (
                      <span className="badge warn low-badge">
                        <IconAlert size={11} /> Low stock
                      </span>
                    )}
                    <span className={`badge ${ex.tone}`}>{ex.label}</span>
                    <span className="chip">{p.tabletsPerStrip} tabs/strip</span>
                    {p.category && <span className="chip">{p.category}</span>}
                  </span>
                  {oos && (
                    <span className="oos-alert">
                      <IconAlert size={12} /> Out of stock — restock now
                    </span>
                  )}
                  {low && (
                    <span className="low-alert">
                      <IconAlert size={12} /> Below 2 strips — restock soon
                    </span>
                  )}
                </span>
                <span className="stock-right">
                  <b>{money(p.price, cur)}</b>
                  <span className="stock-chip">
                    {st.strips} strip{st.strips === 1 ? '' : 's'} · {st.tabs} tab{st.tabs === 1 ? '' : 's'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      <button className="fab" onClick={() => setShowForm(true)} aria-label="Add product">
        <IconPlus size={26} />
      </button>

      {showForm && (
        <ProductForm
          open={showForm}
          onClose={() => setShowForm(false)}
          initial={edit}
          onSubmit={submit}
          notify={notify}
          categories={categories}
          onAddCategory={addCategory}
        />
      )}

      {/* Detail sheet */}
      <Sheet
        open={!!detail}
        onClose={() => { setDetail(null); setConfirmDel(false); }}
        title={detail?.name || ''}
        footer={
          detail && (
            <div className="detail-actions">
              <button className="btn primary" onClick={() => setRestock(detail)}>
                <IconBoxAdd size={18} /> Restock
              </button>
              <button
                className="btn ghost"
                onClick={() => {
                  // Close the detail popup and open the edit form instead.
                  setConfirmDel(false);
                  setEdit(detail);
                  setDetail(null);
                  setShowForm(true);
                }}
              >
                <IconPencil size={18} /> Edit
              </button>
              <button className={`btn danger-outline ${confirmDel ? 'confirm' : ''}`} onClick={() => (confirmDel ? doDelete() : setConfirmDel(true))}>
                <IconTrash size={18} /> {confirmDel ? 'Tap again to delete' : 'Delete'}
              </button>
            </div>
          )
        }
      >
        {detail && (() => {
          const detailUnits = CATEGORY_UNITS[detail.category] || DEFAULT_UNITS;
          return (
            <div className="detail">
              {detail.barcode && (
                <div style={{ fontFamily: 'monospace', fontSize: '13px', opacity: 0.8, marginBottom: '8px' }}>
                  EAN: {detail.barcode}
                </div>
              )}
              <div className="chips">
                {detail.strips <= 0 && (
                  <span className="badge danger oos-badge">
                    <IconAlert size={11} /> Out of stock
                  </span>
                )}
                {detail.strips > 0 && detail.strips < 2 && (
                  <span className="badge warn low-badge">
                    <IconAlert size={11} /> Low stock
                  </span>
                )}
                <span className={`badge ${expiryInfo(detail.expiry).tone}`}>{expiryInfo(detail.expiry).label}</span>
                <span className="chip">{detail.tabletsPerStrip} {detailUnits.unit2}</span>
              </div>
              <div className="info-grid">
                <div className="info-cell">
                  <span>{detailUnits.price}</span>
                  <b>{money(detail.price, cur)}</b>
                </div>
                <div className="info-cell">
                  <span>Per {detailUnits.unit2.split(' ')[0].toLowerCase().replace(/s$/, '') || 'unit'}</span>
                  <b>{money(detail.price / detail.tabletsPerStrip, cur)}</b>
                </div>
                <div className="info-cell">
                  <span>{detailUnits.stock}</span>
                  <b>
                    {stockParts(detail).strips} · {stockParts(detail).tabs}
                  </b>
                </div>
              <div className="info-cell">
                <span>Expiry</span>
                <b>{detail.expiry || <span className="dim">—</span>}</b>
              </div>
              <div className="info-cell">
                <span>Location</span>
                <b>{detail.location || <span className="dim">—</span>}</b>
              </div>
              <div className="info-cell">
                <span>Buy from</span>
                <b>{detail.buyFrom || <span className="dim">—</span>}</b>
              </div>
              <div className="info-cell">
                <span>Category</span>
                <b>{detail.category || <span className="dim">—</span>}</b>
              </div>
            </div>
          </div>
        );
      })()}
      </Sheet>

      {/* Restock sheet — keyed by product so expiry/count reset per product */}
      <RestockSheet
        key={restock ? restock.id : 'closed'}
        open={!!restock}
        product={restock}
        onClose={() => setRestock(null)}
        onConfirm={(n, expiry) => {
          addStockIn(restock, n, expiry);
          notify(`Added ${n} strip${n === 1 ? '' : 's'} of ${restock.name}`);
          setRestock(null);
          setDetail(null);
        }}
        cur={cur}
      />
    </div>
  );
}

function RestockSheet({ open, product, onClose, onConfirm, cur }) {
  const [n, setN] = useState(10);
  const [expiry, setExpiry] = useState('');
  if (!open) return null;
  const st = stockParts(product);
  const outOfStock = product.strips <= 0;
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Restock"
      footer={
        <button className="btn primary big" disabled={!expiry} onClick={() => onConfirm(n, expiry)}>
          Add to stock
        </button>
      }
    >
      <div className="restock">
        <p className="muted">
          Currently: <b>
            {st.strips} strips · {st.tabs} tabs
          </b>{' '}
          of <b>{product.name}</b>
        </p>
        <div className="stepper big-stepper">
          <button onClick={() => setN(Math.max(1, n - 1))} aria-label="Decrease">
            <IconMinus size={18} />
          </button>
          <b>{n}</b>
          <button onClick={() => setN(n + 1)} aria-label="Increase">
            <IconPlus size={18} />
          </button>
        </div>
        <label className="restock-expiry">
          <span>
            New expiry date *
            {outOfStock && <span className="restock-note">This batch ran out — set the expiry for the new stock</span>}
          </span>
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </label>
        <p className="muted center">
          Adding {n} strip{n === 1 ? '' : 's'} · {money(n * product.price, cur)} cost
        </p>
      </div>
    </Sheet>
  );
}
