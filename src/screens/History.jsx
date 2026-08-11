import { useMemo, useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { buildPdf, buildDocx, buildCsv, buildJson, buildSingleSalePdf, buildSingleSaleDocx, buildSingleSaleCsv, buildSingleSaleJson, deliver, preloadExportLibraries } from '../lib/export.js';
import { IconDoc, IconTable, IconCode, IconShare, IconDownload, IconChevronDown, IconBoxAdd, IconClock, IconReceipt, IconPrinter } from '../components/Icons.jsx';
import { money } from '../lib/pricing.js';
import { printSaleReceipt } from '../lib/print.js';
import { isRealPrinter } from '../lib/store.js';
import Sheet from '../components/Sheet.jsx';

const EXPORTS = [
  { id: 'pdf', label: 'PDF', icon: IconDoc, color: 'red' },
  { id: 'docx', label: 'Word', icon: IconDoc, color: 'blue' },
  { id: 'csv', label: 'CSV', icon: IconTable, color: 'green' },
  { id: 'json', label: 'JSON', icon: IconCode, color: 'purple' },
];

export default function History({ db, notify }) {
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const [pending, setPending] = useState(null); // built export awaiting Save/Share choice
  const [pendingSale, setPendingSale] = useState(null); // single sale format picker
  const cur = db.settings.currency;
  const isNative = Capacitor.isNativePlatform();

  useEffect(() => {
    // Pre-warm export tools in background after History screen renders
    preloadExportLibraries();
  }, []);

  const runSingleSaleExport = async (sale, kind) => {
    setBusy(kind);
    try {
      const stamp = new Date(sale.ts || Date.now()).toISOString().slice(0, 10);
      let blob, file;
      if (kind === 'pdf') {
        blob = buildSingleSalePdf(sale, db.settings);
        file = `receipt-${stamp}.pdf`;
      } else if (kind === 'docx') {
        blob = await buildSingleSaleDocx(sale, db.settings);
        file = `receipt-${stamp}.docx`;
      } else if (kind === 'csv') {
        blob = buildSingleSaleCsv(sale, db.settings);
        file = `receipt-${stamp}.csv`;
      } else {
        blob = buildSingleSaleJson(sale, db.settings);
        file = `receipt-${stamp}.json`;
      }
      setPending({ kind, file, blob });
    } catch (err) {
      console.error(err);
      notify('Could not format receipt export', 'err');
    } finally {
      setBusy(null);
      setPendingSale(null);
    }
  };

  const entries = useMemo(
    () =>
      [
        ...db.sales.map((s) => ({ type: 'sale', ts: s.ts, sale: s })),
        ...db.stockIns.map((i) => ({ type: 'in', ts: i.ts, in: i })),
      ].sort((a, b) => b.ts - a.ts),
    [db]
  );

  const shown = entries.filter((e) => (filter === 'all' ? true : e.type === filter));

  const groups = useMemo(() => {
    const map = new Map();
    shown.forEach((e) => {
      const key = new Date(e.ts).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    });
    return [...map.entries()];
  }, [shown]);

  const dayLabel = (key) => {
    const today = new Date();
    const yest = new Date();
    yest.setDate(today.getDate() - 1);
    if (key === today.toDateString()) return 'Today';
    if (key === yest.toDateString()) return 'Yesterday';
    return new Date(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const fmtTime = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

  /* Build the report, then let the user pick Save to… or Share. */
  const runExport = async (kind) => {
    setBusy(kind);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      let blob, file;
      if (kind === 'pdf') {
        blob = buildPdf(db);
        file = `datapharm-${stamp}.pdf`;
      } else if (kind === 'docx') {
        blob = await buildDocx(db);
        file = `datapharm-${stamp}.docx`;
      } else if (kind === 'csv') {
        blob = buildCsv(db);
        file = `datapharm-${stamp}.csv`;
      } else {
        blob = buildJson(db);
        file = `datapharm-${stamp}.json`;
      }
      setPending({ kind, file, blob });
    } catch (e) {
      console.error(e);
      notify('Export failed — try again', 'err');
    }
    setBusy(null);
  };

  const deliverChoice = async (mode) => {
    if (!pending) return;
    const { kind, file, blob } = pending;
    setPending(null);
    setBusy(kind);
    try {
      const res = await deliver(blob, file, mode);
      if (res === 'saved') notify('Report saved — pick the file anywhere you chose 📄');
      else if (res === 'shared') notify('File ready — pick where to share it 📤');
      else if (res === 'downloaded') notify(`Saved ${file} to Downloads`);
      // 'cancelled' → user closed the share sheet; nothing to do.
    } catch (e) {
      console.error(e);
      notify('Export failed — try again', 'err');
    }
    setBusy(null);
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>History</h1>
          <p className="sub">{entries.length} record{entries.length === 1 ? '' : 's'}</p>
        </div>
        <div className="logo">
          <IconClock size={22} style={{ color: 'var(--primary)' }} />
        </div>
      </header>

      <section className="export-sec">
        <div className="sec-head">
          <h2>Export data</h2>
          <span className="muted">Products · sales · stock-in</span>
        </div>
        <div className="export-row">
          {EXPORTS.map((e) => {
            const Icon = e.icon;
            return (
              <button
                key={e.id}
                className={`export-chip ${e.color} ${busy === e.id ? 'busy' : ''}`}
                onClick={() => runExport(e.id)}
                disabled={!!busy}
              >
                {busy === e.id ? <IconShare size={17} /> : <Icon size={17} />}
                <span>{e.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <Sheet open={!!pending} onClose={() => setPending(null)} title="Export report">
        {pending && (
          <div className="export-picker">
            <p className="picker-file">📄 {pending.file}</p>
            <button className="btn primary big picker-btn" onClick={() => deliverChoice('save')} disabled={!!busy}>
              <IconDownload size={18} /> Save to…
              <span className="picker-sub">{isNative ? 'Phone, Drive, any folder' : 'Saves to Downloads'}</span>
            </button>
            <button className="btn big picker-btn picker-share" onClick={() => deliverChoice('share')} disabled={!!busy}>
              <IconShare size={18} /> Share
              <span className="picker-sub">WhatsApp, email &amp; more</span>
            </button>
          </div>
        )}
      </Sheet>

      <div className="filters">
        {[
          { id: 'all', label: 'All' },
          { id: 'sale', label: 'Sales' },
          { id: 'in', label: 'Stock-in' },
        ].map((f) => (
          <button key={f.id} className={`filter ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">
            <IconClock size={44} />
          </div>
          <p>
            No records here yet.
            <br />
            Sales and stock-in entries will appear in this list.
          </p>
        </div>
      ) : (
        <div className="hist-groups">
          {groups.map(([key, list]) => (
            <div key={key} className="hist-group">
              <div className="hist-day">
                {dayLabel(key)}
                <span className="muted">· {list.length}</span>
              </div>
              <div className="hist-list">
                {list.map((e) => {
                  const isSale = e.type === 'sale';
                  const id = isSale ? e.sale.id : e.in.id;
                  const exp = open === id;
                  return (
                    <div
                      key={id}
                      className={`hist-card ${isSale ? 'sale' : 'in'} ${exp ? 'exp' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpen(exp ? null : id)}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') setOpen(exp ? null : id);
                      }}
                    >
                      <span className="hist-ico">{isSale ? <IconReceipt size={19} /> : <IconBoxAdd size={19} />}</span>
                      <span className="hist-main">
                        <b>{isSale ? `Sale · ${e.sale.items.length} item${e.sale.items.length > 1 ? 's' : ''}` : `Stock-in · ${e.in.name}`}</b>
                        <span className="meta">
                          {isSale
                            ? e.sale.items.map((i) => `${i.name} ×${i.qty} ${i.unit === 'strip' ? 'strip' : 'tab'}`).join(', ')
                            : `+${e.in.strips} strip${e.in.strips === 1 ? '' : 's'}`}
                        </span>
                        <span className="hist-time">
                          <IconClock size={11} /> {fmtTime(e.ts)}
                        </span>
                      </span>
                      <span className="hist-right">
                        <span className={`amt-pill ${isSale ? 'sale' : 'in'}`}>
                          {isSale ? money(e.sale.total, cur) : `+${e.in.strips}`}
                        </span>
                        <IconChevronDown size={16} className={`chev ${exp ? 'open' : ''}`} />
                      </span>
                      {exp && isSale && (
                        <span className="hist-detail">
                          {e.sale.items.map((i, idx) => (
                            <span key={idx} className="hist-line">
                              <span>
                                {i.name} · {i.qty} {i.unit === 'strip' ? 'strip' : 'tab'} × {money(i.unitPrice, cur)}
                              </span>
                              <b>{money(i.line, cur)}</b>
                            </span>
                          ))}
                          {(e.sale.discountPct || 0) > 0 && (
                            <span className="hist-line">
                              <span>Discount ({e.sale.discountPct}%)</span>
                              <b className="err-text">−{money(e.sale.discount, cur)}</b>
                            </span>
                          )}
                          {e.sale.buyer &&
                            (e.sale.buyer.name || e.sale.buyer.phone || e.sale.buyer.address) && (
                              <span className="hist-line hist-buyer">
                                <span>Buyer</span>
                                <b>
                                  {[e.sale.buyer.name, e.sale.buyer.phone, e.sale.buyer.address]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </b>
                              </span>
                            )}
                          <span className="hist-line strong">
                            <span>Total</span>
                            <b>{money(e.sale.total, cur)}</b>
                          </span>

                          <div className="sale-action-bar" style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--border)' }} onClick={(ev) => ev.stopPropagation()}>
                            <button
                              className="btn secondary sm"
                              style={{ flex: 1 }}
                              onClick={() => {
                                printSaleReceipt(e.sale, db.settings);
                                const conn = db.settings.printerConfig?.connectedPrinter;
                                const connected = isRealPrinter(conn) ? conn : null;
                                if (connected) {
                                  notify(`Printing... 🖨️`);
                                } else {
                                  notify('Not connected to a printer 🖨️', 'warn');
                                }
                              }}
                            >
                              <IconPrinter size={15} /> Print
                            </button>
                            <button
                              className="btn secondary sm"
                              style={{ flex: 1 }}
                              onClick={() => setPendingSale({ sale: e.sale, mode: 'share' })}
                            >
                              <IconShare size={15} /> Share
                            </button>
                            <button
                              className="btn secondary sm"
                              style={{ flex: 1 }}
                              onClick={() => setPendingSale({ sale: e.sale, mode: 'save' })}
                            >
                              <IconDownload size={15} /> Save
                            </button>
                          </div>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Sheet open={!!pendingSale} onClose={() => setPendingSale(null)} title={pendingSale?.mode === 'share' ? 'Share sale receipt' : 'Save sale receipt'}>
        {pendingSale && (
          <div className="export-picker" style={{ padding: '8px 0' }}>
            <p className="picker-file" style={{ marginBottom: 12 }}>Choose format to {pendingSale.mode}:</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button className="btn secondary big" onClick={() => runSingleSaleExport(pendingSale.sale, 'pdf')} disabled={!!busy}>
                <IconDoc size={18} /> PDF
              </button>
              <button className="btn secondary big" onClick={() => runSingleSaleExport(pendingSale.sale, 'docx')} disabled={!!busy}>
                <IconDoc size={18} /> Word
              </button>
              <button className="btn secondary big" onClick={() => runSingleSaleExport(pendingSale.sale, 'csv')} disabled={!!busy}>
                <IconTable size={18} /> CSV
              </button>
              <button className="btn secondary big" onClick={() => runSingleSaleExport(pendingSale.sale, 'json')} disabled={!!busy}>
                <IconCode size={18} /> JSON
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
