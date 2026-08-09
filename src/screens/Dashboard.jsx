import { useEffect, useMemo, useRef, useState } from 'react';
import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
import { IconSearch, IconCheck, IconX, IconArrowLeft, IconBox, IconAlert, IconCamera } from '../components/Icons.jsx';
import { stockParts, expiryInfo, isExpired, money } from '../lib/pricing.js';
import { registerBack } from '../lib/back.js';
import { uid } from '../lib/store.js';
import logoUrl from '../../logo/DataPharm.png';
import Sheet from '../components/Sheet.jsx';
import Confirm from '../components/Confirm.jsx';
import ProductForm from '../components/ProductForm.jsx';
import SessionPanel from '../components/SessionPanel.jsx';

const VIEWS = {
  products: { title: 'Products', sub: 'All products in inventory', logo: '📦' },
  expiring: { title: 'Expiring soon', sub: 'Expiring within 90 days', logo: '⏳' },
  low: { title: 'Low stock', sub: 'Below 2 strips in stock', logo: '⚠️' },
};

export default function Dashboard({
  db,
  notify,
  notifyEvent,
  cart,
  setCart,
  setSettings,
  addProduct,
  categories,
  addCategory,
  sessions = [],
  activeSessionId,
  setActiveSessionId,
  sessionPanelOpen,
  setSessionPanelOpen,
  addSession,
  closeSession,
  searchQuery,
  setSearchQuery,
}) {
  const [internalQ, setInternalQ] = useState('');
  const q = searchQuery !== undefined ? searchQuery : internalQ;
  const setQ = setSearchQuery || setInternalQ;
  const [searchFocus, setSearchFocus] = useState(false);
  const searchRef = useRef(null);
  const [cat, setCat] = useState(''); // category quick filter
  const [view, setView] = useState(null); // null | 'products' | 'expiring' | 'low'
  const [detail, setDetail] = useState(null);
  const [expiredAsk, setExpiredAsk] = useState(null); // product awaiting expired-sale confirmation
  const [notFoundBarcode, setNotFoundBarcode] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProductBarcode, setNewProductBarcode] = useState('');
  const cur = db.settings.currency;
  const now = new Date();
  const products = db.products;

  const scanBarcode = async () => {
    try {
      const { camera } = await BarcodeScanner.checkPermissions();
      if (camera !== 'granted') {
        const { camera: granted } = await BarcodeScanner.requestPermissions();
        if (granted !== 'granted') {
          notify('Camera permission denied', 'err');
          return;
        }
      }

      try {
        await BarcodeScanner.installGoogleBarcodeScannerModule();
      } catch (e) {
        console.warn('Google Barcode Scanner Module notice:', e);
      }

      const { barcodes } = await BarcodeScanner.scan({
        formats: [
          BarcodeFormat.Ean13,
          BarcodeFormat.Ean8,
          BarcodeFormat.QrCode,
          BarcodeFormat.Code128,
          BarcodeFormat.Code39,
          BarcodeFormat.UpcA,
          BarcodeFormat.UpcE,
          BarcodeFormat.DataMatrix,
        ],
      });

      if (barcodes && barcodes.length > 0) {
        const scannedValue = barcodes[0].rawValue;
        const found = products.find((p) => p.barcode === scannedValue);
        if (found) {
          notify(`Found: "${found.name}"`);
          setDetail(found);
        } else {
          notify('Barcode not found in database — add it?', 'warn');
          setNotFoundBarcode(scannedValue);
        }
      }
    } catch (err) {
      notify('Scan failed — try again', 'err');
      console.error('Barcode scan error:', err);
    }
  };

  const outOfStock = (p) => p.strips <= 0;
  const low = (p) => p.strips > 0 && p.strips < 2;

  // Left-edge swipe back: close the category/view layers.
  useEffect(() => {
    if (view) return registerBack(() => setView(null));
  }, [view]);

  const filtered = useMemo(() => {
    let list = products;
    if (cat) list = list.filter((p) => p.category === cat);
    const t = q.trim().toLowerCase();
    if (t) list = list.filter((p) => p.name.toLowerCase().includes(t));
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [products, q, cat]);

  const expSoon = useMemo(
    () =>
      products
        .filter((p) => expiryInfo(p.expiry).tone !== 'ok')
        .sort((a, b) => (a.expiry || '').localeCompare(b.expiry || '')),
    [products]
  );

  const lowStock = useMemo(
    () => products.filter((p) => p.strips < 2).sort((a, b) => a.strips - b.strips),
    [products]
  );

  const viewList = useMemo(() => {
    if (view === 'products') return [...products].sort((a, b) => a.name.localeCompare(b.name));
    if (view === 'expiring') return expSoon;
    if (view === 'low') return lowStock;
    return [];
  }, [view, products, expSoon, lowStock]);

  const statCount = (v) => (v === 'products' ? products.length : v === 'expiring' ? expSoon.length : lowStock.length);

  const toggle = (p) => {
    if (cart.some((i) => i.id === p.id)) {
      setCart((c) => c.filter((i) => i.id !== p.id));
      return;
    }
    if (outOfStock(p)) {
      notify(`Out of stock — "${p.name}" can't be added to the sale`, 'err');
      return;
    }
    if (isExpired(p.expiry)) {
      setExpiredAsk(p); // ask before adding an expired product to the sale
      return;
    }
    setCart((c) => [...c, { id: p.id, qty: 1, unit: 'strip' }]);
  };
  const inCart = (id) => cart.some((i) => i.id === id);
  const catCount = (c) => products.filter((p) => p.category === c).length;

  const renderRow = (p) => {
    const st = stockParts(p);
    const ex = expiryInfo(p.expiry);
    return (
      <button key={p.id} className="stock-row" onClick={() => setDetail(p)}>
        <span className="stock-main">
          <b>{p.name}</b>
          <span className="meta">
            {p.location ? p.location : <span className="dim">No location</span>}
            {p.category ? ` · ${p.category}` : ''}
          </span>
          <span className="chips">
            {outOfStock(p) && (
              <span className="badge danger oos-badge">
                <IconAlert size={11} /> Out of stock
              </span>
            )}
            {!outOfStock(p) && low(p) && (
              <span className="badge warn low-badge">
                <IconAlert size={11} /> Low stock
              </span>
            )}
            <span className={`badge ${ex.tone}`}>{ex.label}</span>
            {p.category && <span className="chip">{p.category}</span>}
          </span>
          {outOfStock(p) && (
            <span className="oos-alert">
              <IconAlert size={12} /> Not available for sale
            </span>
          )}
          {!outOfStock(p) && low(p) && (
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
  };

  return (
    <div className="page">
      {!view ? (
        <>
          <header className="page-head">
            <div>
              <h1>DataPharm</h1>
              <p className="sub">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <button
                className={`mode-toggle ${db.settings.onlineMode ? 'mode-online' : 'mode-offline'}`}
                onClick={() => setSettings({ onlineMode: !db.settings.onlineMode })}
                title={db.settings.onlineMode ? 'Switch to Offline mode' : 'Switch to Online mode'}
              >
                <span className="mode-pip" />
                <span className="mode-label">{db.settings.onlineMode ? 'Online' : 'Offline'}</span>
              </button>
              <button
                className="logo session-trigger"
                onClick={() => setSessionPanelOpen && setSessionPanelOpen(true)}
                aria-label="Customer sessions"
              >
                <img src={logoUrl} alt="DataPharm" />
                {sessions.length > 1 && (
                  <span className="session-badge">{sessions.length}</span>
                )}
              </button>
            </div>
          </header>

          <div className="search" onClick={() => searchRef.current?.focus()}>
            <IconSearch size={18} className="search-ico" />
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setSearchFocus(true)}
              onBlur={() => setSearchFocus(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setQ('');
                  searchRef.current?.blur();
                }
              }}
              placeholder="Search products…"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Search products"
            />
            {db.settings.onlineMode && (
              <button
                type="button"
                className="icon-btn search-scan"
                onClick={(e) => {
                  e.stopPropagation();
                  scanBarcode();
                }}
                aria-label="Scan barcode"
                style={{ marginRight: q ? 8 : 0 }}
              >
                <IconCamera size={18} />
              </button>
            )}
            {q ? (
              <>
                <span className="search-count">{filtered.length}</span>
                <button
                  className="icon-btn search-clear"
                  onClick={(e) => {
                    e.stopPropagation();
                    setQ('');
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                >
                  <IconX size={16} />
                </button>
              </>
            ) : (
              searchFocus && <span className="search-hint">Type to search</span>
            )}
          </div>

          <div className="stats">
            <button className="stat" onClick={() => setView('products')}>
              <b>{statCount('products')}</b>
              <span>Products</span>
            </button>
            <button className="stat warn-t" onClick={() => setView('expiring')}>
              <b>{statCount('expiring')}</b>
              <span>Expiring soon</span>
            </button>
            <button className="stat danger-t" onClick={() => setView('low')}>
              <b>{statCount('low')}</b>
              <span>Low stock</span>
            </button>
          </div>

          {products.length > 0 && (
            <div className="cat-rail">
              <button className={`cat-pill ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>
                All
              </button>
              {db.categories.map((c) => {
                const n = catCount(c);
                if (!n) return null;
                return (
                  <button key={c} className={`cat-pill ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>
                    {c} <span className="cat-count">{n}</span>
                  </button>
                );
              })}
            </div>
          )}

          <section>
            <div className="sec-head">
              <h2>{q ? 'Results' : cat ? cat : 'Products'}</h2>
              <span className="muted">{filtered.length}</span>
            </div>
            {filtered.length === 0 ? (
              <div className="empty">
                <div className="empty-ico">🔍</div>
                <p>{products.length === 0 ? 'No products yet — tap Stock and add your first one.' : 'Nothing matches your search.'}</p>
              </div>
            ) : (
              <div className="prod-list">
                {filtered.map((p) => {
                  const st = stockParts(p);
                  const ex = expiryInfo(p.expiry);
                  const sel = inCart(p.id);
                  const oos = outOfStock(p);
                  return (
                    <button
                      key={p.id}
                      className={`prod-row ${sel ? 'sel' : ''} ${oos ? 'out' : ''}`}
                      onClick={() => toggle(p)}
                      disabled={oos}
                      aria-disabled={oos}
                      title={oos ? 'Out of stock — not available for sale' : undefined}
                    >
                      <span className={`check ${sel ? 'on' : ''} ${oos ? 'oos' : ''}`}>
                        {sel ? <IconCheck size={14} /> : oos ? <IconX size={14} /> : null}
                      </span>
                      <span className="prod-main">
                        <b>{p.name}</b>
                        <span className="meta">
                          {p.location ? p.location : <span className="dim">No location</span>} · {money(p.price, cur)}/strip
                        </span>
                        {oos && (
                          <span className="oos-alert">
                            <IconAlert size={12} /> Out of stock — not available for sale
                          </span>
                        )}
                        {!oos && low(p) && (
                          <span className="low-alert">
                            <IconAlert size={12} /> Low stock — below 2 strips
                          </span>
                        )}
                      </span>
                      <span className="prod-right">
                        <span className={`badge ${ex.tone}`}>{ex.label}</span>
                        <span className="stock-chip">
                          {st.strips} strip{st.strips === 1 ? '' : 's'} · {st.tabs} tab{st.tabs === 1 ? '' : 's'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <header className="page-head view-head">
            <button className="back-btn" onClick={() => setView(null)} aria-label="Back">
              <IconArrowLeft size={20} />
            </button>
            <div>
              <h1>{VIEWS[view].title}</h1>
              <p className="sub">
                {VIEWS[view].sub} · {viewList.length} product{viewList.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="logo">{VIEWS[view].logo}</div>
          </header>

          {viewList.length === 0 ? (
            <div className="empty">
              <div className="empty-ico">
                <IconBox size={44} />
              </div>
              <p>
                {view === 'expiring' ? 'Nothing is expiring soon. All good!' : view === 'low' ? 'No products are low on stock right now.' : 'No products yet — tap Stock and add your first one.'}
              </p>
            </div>
          ) : (
            <div className="stock-list">{viewList.map(renderRow)}</div>
          )}
        </>
      )}

      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.name || ''}>
        {detail && (
          <div className="detail">
            <div className="chips">
              {outOfStock(detail) && (
                <span className="badge danger oos-badge">
                  <IconAlert size={11} /> Out of stock
                </span>
              )}
              {!outOfStock(detail) && low(detail) && (
                <span className="badge warn low-badge">
                  <IconAlert size={11} /> Low stock
                </span>
              )}
              <span className={`badge ${expiryInfo(detail.expiry).tone}`}>{expiryInfo(detail.expiry).label}</span>
              {detail.category && <span className="chip">{detail.category}</span>}
              <span className="chip">{detail.tabletsPerStrip} tabs/strip</span>
            </div>
            <div className="info-grid">
              <div className="info-cell">
                <span>Price / strip</span>
                <b>{money(detail.price, cur)}</b>
              </div>
              <div className="info-cell">
                <span>Per tablet</span>
                <b>{money(detail.price / detail.tabletsPerStrip, cur)}</b>
              </div>
              <div className="info-cell">
                <span>In stock</span>
                <b>
                  {stockParts(detail).strips} strips · {stockParts(detail).tabs} tabs
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
            </div>
          </div>
        )}
      </Sheet>

      <Confirm
        open={!!expiredAsk}
        title="Expired product"
        message={
          expiredAsk
            ? `"${expiredAsk.name}" expired on ${expiredAsk.expiry}. Add it to this sale anyway?`
            : ''
        }
        confirmLabel="Yes, sell it"
        cancelLabel="Cancel"
        tone="danger"
        onCancel={() => setExpiredAsk(null)}
        onConfirm={() => {
          if (!expiredAsk) return;
          setCart((c) => [...c, { id: expiredAsk.id, qty: 1, unit: 'strip' }]);
          setExpiredAsk(null);
        }}
      />

      <Sheet
        open={!!notFoundBarcode}
        onClose={() => setNotFoundBarcode(null)}
        title="Barcode not found"
      >
        {notFoundBarcode && (
          <div style={{ padding: '8px 0' }}>
            <p style={{ margin: '0 0 16px 0', fontSize: '15px', lineHeight: '1.5' }}>
              Barcode <code style={{ fontFamily: 'monospace', background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', color: 'var(--primary)' }}>{notFoundBarcode}</code> is not in your database — add it?
            </p>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                className="btn primary big"
                style={{ flex: 1 }}
                onClick={() => {
                  const code = notFoundBarcode;
                  setNotFoundBarcode(null);
                  setNewProductBarcode(code);
                  setShowAddForm(true);
                }}
              >
                Add new product
              </button>
              <button type="button" className="btn ghost big" onClick={() => setNotFoundBarcode(null)}>
                Dismiss
              </button>
            </div>
          </div>
        )}
      </Sheet>

      {showAddForm && (
        <ProductForm
          open={showAddForm}
          onClose={() => {
            setShowAddForm(false);
            setNewProductBarcode('');
          }}
          initial={{ barcode: newProductBarcode }}
          categories={categories || db.categories}
          onAddCategory={addCategory}
          notify={notify}
          onSubmit={(data) => {
            if (addProduct) {
              addProduct({ ...data, id: uid(), createdAt: Date.now() });
              notify('Added new product to stock');
            }
            setShowAddForm(false);
            setNewProductBarcode('');
          }}
        />
      )}

      {sessionPanelOpen && (
        <SessionPanel
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSwitch={(id) => {
            if (setActiveSessionId) setActiveSessionId(id);
            if (setSessionPanelOpen) setSessionPanelOpen(false);
            setTimeout(() => searchRef.current?.focus(), 100);
          }}
          onAdd={() => {
            if (addSession) addSession();
            setTimeout(() => searchRef.current?.focus(), 100);
          }}
          onClose={() => setSessionPanelOpen && setSessionPanelOpen(false)}
        />
      )}
    </div>
  );
}
