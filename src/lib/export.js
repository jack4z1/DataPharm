import { Capacitor, registerPlugin } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { stockParts, round2, money } from './pricing.js';

let pdfCache = null;
let docxCache = null;

export async function loadPdfEngine() {
  if (pdfCache) return pdfCache;
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const autoTable = autoTableModule.default || autoTableModule;
  pdfCache = { jsPDF, autoTable };
  return pdfCache;
}

export async function loadDocxEngine() {
  if (docxCache) return docxCache;
  const docx = await import('docx');
  docxCache = docx;
  return docxCache;
}

export function preloadExportLibraries() {
  loadPdfEngine().catch(() => {});
  loadDocxEngine().catch(() => {});
}

/**
 * Native bridge (registered in MainActivity) that opens Android's "Save to…"
 * document picker so the user chooses where the exported file goes.
 */
const FileSaver = registerPlugin('FileSaver', {
  web: () => ({ saveFile: async () => ({ status: 'unsupported' }) }),
});

export function getShopHeaderLines(settings) {
  const shop = (settings && settings.shopDetails) || {};
  const name = shop.name || 'DataPharm Pharmacy';
  const address = shop.address || '';
  const phone = shop.phone || '';
  const email = shop.email || '';

  const lines = [name];
  if (address) lines.push(`Address: ${address}`);
  const contact = [];
  if (phone) contact.push(`Ph: ${phone}`);
  if (email) contact.push(`Email: ${email}`);
  if (contact.length) lines.push(contact.join(' | '));
  return lines;
}

/* ---------------- PDF ---------------- */

export async function buildPdf(db) {
  const { jsPDF, autoTable } = await loadPdfEngine();
  const cur = db.settings.currency === '₹' ? 'Rs. ' : db.settings.currency;
  const doc = new jsPDF();
  const shopLines = getShopHeaderLines(db.settings);

  doc.setFontSize(16);
  doc.setTextColor(13, 71, 170);
  doc.text(shopLines[0], 14, 16);
  
  let headerY = 22;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  for (let i = 1; i < shopLines.length; i++) {
    doc.text(shopLines[i], 14, headerY);
    headerY += 5;
  }
  
  doc.setFontSize(14);
  doc.setTextColor(13, 71, 170);
  doc.text('DataPharm Inventory & Sales Report', 14, headerY + 4);
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, headerY + 10);

  const startY = headerY + 18;
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text('Products in stock', 14, startY - 3);
  autoTable(doc, {
    startY,
    head: [['Name', 'Location', 'Buy from', 'Expiry', 'Price/strip', 'Tabs/strip', 'Stock']],
    body: db.products.map((p) => {
      const s = stockParts(p);
      return [
        p.name,
        p.location || '—',
        p.buyFrom || '—',
        p.expiry,
        cur + p.price,
        p.tabletsPerStrip,
        `${s.strips} strip${s.strips === 1 ? '' : 's'} + ${s.tabs} tab${s.tabs === 1 ? '' : 's'}`,
      ];
    }),
    headStyles: { fillColor: [13, 71, 170], fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 3 },
    theme: 'grid',
  });

  let y = doc.lastAutoTable.finalY + 10;
  if (db.sales.length) {
    doc.setFontSize(13);
    doc.text('Sales history', 14, y);
    autoTable(doc, {
      startY: y + 3,
      head: [['Date', 'Items', 'Buyer', 'Total']],
      body: db.sales.map((s) => [
        new Date(s.ts).toLocaleString(),
        s.items.map((i) => `${i.name} ×${i.qty} ${i.unit === 'strip' ? 'strip' : 'tab'}`).join(', '),
        buyerLabel(s),
        cur + s.total,
      ]),
      headStyles: { fillColor: [13, 71, 170], fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 3 },
      theme: 'grid',
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  const revenue = round2(db.sales.reduce((a, s) => a + s.total, 0));
  doc.setFontSize(11);
  doc.setTextColor(13, 71, 170);
  doc.text(
    `Summary — Products: ${db.products.length} · Sales: ${db.sales.length} · Total revenue: ${money(revenue, cur)}`,
    14,
    y
  );
  return doc.output('blob');
}

export async function buildSingleSalePdf(sale, settings) {
  const { jsPDF, autoTable } = await loadPdfEngine();
  const cur = (settings && settings.currency === '₹') ? 'Rs. ' : ((settings && settings.currency) || '₹');
  const doc = new jsPDF();
  const shopLines = getShopHeaderLines(settings);

  doc.setFontSize(16);
  doc.setTextColor(13, 71, 170);
  doc.text(shopLines[0], 14, 16);

  let headerY = 22;
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);
  for (let i = 1; i < shopLines.length; i++) {
    doc.text(shopLines[i], 14, headerY);
    headerY += 5;
  }

  doc.setFontSize(14);
  doc.setTextColor(13, 71, 170);
  doc.text('Sale Receipt', 14, headerY + 4);
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`Date: ${new Date(sale.ts || Date.now()).toLocaleString()}`, 14, headerY + 10);

  if (sale.buyer && (sale.buyer.name || sale.buyer.phone || sale.buyer.address)) {
    doc.setTextColor(30, 30, 30);
    const bParts = [sale.buyer.name, sale.buyer.phone, sale.buyer.address].filter(Boolean).join(' · ');
    doc.text(`Customer: ${bParts}`, 14, headerY + 16);
    headerY += 6;
  }

  const startY = headerY + 14;
  autoTable(doc, {
    startY,
    head: [['Item Name', 'Qty / Unit', 'Unit Price', 'Total']],
    body: (sale.items || []).map((i) => [
      i.name,
      `${i.qty} ${i.unit === 'strip' ? 'strip' : 'tab'}`,
      cur + i.unitPrice,
      cur + i.line,
    ]),
    headStyles: { fillColor: [13, 71, 170], fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 3 },
    theme: 'grid',
  });

  let y = doc.lastAutoTable.finalY + 8;
  if (sale.subtotal) {
    doc.setFontSize(10);
    doc.text(`Subtotal: ${cur}${sale.subtotal}`, 14, y);
    y += 5;
  }
  if (sale.discount) {
    doc.setFontSize(10);
    doc.text(`Discount (${sale.discountPct || 0}%): -${cur}${sale.discount}`, 14, y);
    y += 5;
  }

  doc.setFontSize(12);
  doc.setTextColor(13, 71, 170);
  doc.text(`Grand Total: ${money(sale.total, cur)}`, 14, y + 2);
  return doc.output('blob');
}

/* ---------------- Buyer info ---------------- */

/** Pretty-printed buyer line for a sale, or '—' when there is none. */
function buyerLabel(sale) {
  const b = sale && sale.buyer;
  if (!b) return '—';
  const parts = [b.name, b.phone, b.address].filter((x) => x && String(x).trim());
  return parts.length ? parts.join(', ') : '—';
}

/* ---------------- DOCX ---------------- */

export async function buildDocx(db) {
  const docx = await loadDocxEngine();
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    HeadingLevel,
    AlignmentType,
    WidthType,
    BorderStyle,
  } = docx;

  const side = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  const BORDERS = { top: side, bottom: side, left: side, right: side };

  function cell(text, { head = false, align = AlignmentType.LEFT } = {}) {
    return new TableCell({
      borders: BORDERS,
      shading: head ? { fill: 'E3EDFB' } : undefined,
      children: [
        new Paragraph({
          alignment: align,
          children: [new TextRun({ text: String(text ?? ''), bold: head, size: 18 })],
        }),
      ],
    });
  }

  function row(values, opts) {
    return new TableRow({ children: values.map((v) => cell(v, opts)) });
  }

  const cur = db.settings.currency;
  const shopLines = getShopHeaderLines(db.settings);
  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: shopLines[0], color: '0D47AA' })],
    }),
    ...shopLines.slice(1).map((l) => new Paragraph({ children: [new TextRun({ text: l, color: '555555' })] })),
    new Paragraph({
      spacing: { before: 120, after: 240 },
      children: [new TextRun({ text: 'DataPharm Report · Generated: ' + new Date().toLocaleString() })],
    }),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Products in stock')] }),
  ];

  if (db.products.length) {
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          row(['Name', 'Location', 'Buy from', 'Expiry', 'Price/strip', 'Tabs/strip', 'Stock'], { head: true }),
          ...db.products.map((p) => {
            const s = stockParts(p);
            return row([
              p.name,
              p.location || '—',
              p.buyFrom || '—',
              p.expiry,
              cur + p.price,
              p.tabletsPerStrip,
              `${s.strips} strips + ${s.tabs} tabs`,
            ]);
          }),
        ],
      })
    );
  } else {
    children.push(new Paragraph('No products yet.'));
  }

  children.push(new Paragraph({ spacing: { before: 300 }, heading: HeadingLevel.HEADING_2, children: [new TextRun('Sales history')] }));
  if (db.sales.length) {
    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          row(['Date', 'Items', 'Buyer', 'Total'], { head: true }),
          ...db.sales.map((s) =>
            row([
              new Date(s.ts).toLocaleString(),
              s.items.map((i) => `${i.name} ×${i.qty} ${i.unit === 'strip' ? 'strip' : 'tab'}`).join(', '),
              buyerLabel(s),
              cur + s.total,
            ])
          ),
        ],
      })
    );
  } else {
    children.push(new Paragraph('No sales yet.'));
  }

  const revenue = round2(db.sales.reduce((a, s) => a + s.total, 0));
  children.push(
    new Paragraph({
      spacing: { before: 300 },
      children: [
        new TextRun({
          text: `Summary — Products: ${db.products.length} · Sales: ${db.sales.length} · Total revenue: ${money(revenue, cur)}`,
          bold: true,
        }),
      ],
    })
  );

  const doc = new Document({ sections: [{ children }] });
  return await Packer.toBlob(doc);
}

export async function buildSingleSaleDocx(sale, settings) {
  const docx = await loadDocxEngine();
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    HeadingLevel,
    AlignmentType,
    WidthType,
    BorderStyle,
  } = docx;

  const side = { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' };
  const BORDERS = { top: side, bottom: side, left: side, right: side };

  function cell(text, { head = false, align = AlignmentType.LEFT } = {}) {
    return new TableCell({
      borders: BORDERS,
      shading: head ? { fill: 'E3EDFB' } : undefined,
      children: [
        new Paragraph({
          alignment: align,
          children: [new TextRun({ text: String(text ?? ''), bold: head, size: 18 })],
        }),
      ],
    });
  }

  function row(values, opts) {
    return new TableRow({ children: values.map((v) => cell(v, opts)) });
  }

  const cur = (settings && settings.currency) || '₹';
  const shopLines = getShopHeaderLines(settings);
  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: shopLines[0], color: '0D47AA' })],
    }),
    ...shopLines.slice(1).map((l) => new Paragraph({ children: [new TextRun({ text: l, color: '555555' })] })),
    new Paragraph({
      spacing: { before: 120, after: 200 },
      children: [new TextRun({ text: 'Sale Receipt · Date: ' + new Date(sale.ts || Date.now()).toLocaleString() })],
    }),
  ];

  if (sale.buyer && (sale.buyer.name || sale.buyer.phone || sale.buyer.address)) {
    const bStr = [sale.buyer.name, sale.buyer.phone, sale.buyer.address].filter(Boolean).join(' · ');
    children.push(new Paragraph({ spacing: { after: 150 }, children: [new TextRun({ text: `Customer: ${bStr}`, bold: true })] }));
  }

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        row(['Item', 'Qty / Unit', 'Unit Price', 'Total'], { head: true }),
        ...(sale.items || []).map((i) => row([i.name, `${i.qty} ${i.unit}`, cur + i.unitPrice, cur + i.line])),
      ],
    })
  );

  children.push(
    new Paragraph({
      spacing: { before: 200 },
      children: [
        new TextRun({
          text: `Grand Total: ${money(sale.total, cur)}`,
          bold: true,
          size: 24,
          color: '0D47AA',
        }),
      ],
    })
  );

  const doc = new Document({ sections: [{ children }] });
  return await Packer.toBlob(doc);
}

/* ---------------- CSV ---------------- */

export function buildCsv(db) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const shopLines = getShopHeaderLines(db.settings);
  const lines = [];
  shopLines.forEach((l) => lines.push(esc(l)));
  lines.push(`Generated,${esc(new Date().toLocaleString())}`);
  lines.push('');
  lines.push('PRODUCTS');
  lines.push(['Name', 'Location', 'Buy From', 'Expiry', 'Price per Strip', 'Tablets per Strip', 'Stock Strips', 'Stock Tablets'].map(esc).join(','));
  db.products.forEach((p) => {
    const s = stockParts(p);
    lines.push([p.name, p.location, p.buyFrom, p.expiry, p.price, p.tabletsPerStrip, s.strips, s.tabs].map(esc).join(','));
  });
  lines.push('');
  lines.push('SALES');
  lines.push(['Date', 'Items', 'Buyer', 'Subtotal', 'Discount %', 'Discount Amt', 'Total'].map(esc).join(','));
  db.sales.forEach((s) => {
    lines.push(
      [
        new Date(s.ts).toLocaleString(),
        s.items.map((i) => `${i.name} x${i.qty} ${i.unit}`).join(' | '),
        buyerLabel(s),
        s.subtotal,
        s.discountPct,
        s.discount,
        s.total,
      ].map(esc).join(',')
    );
  });
  return new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

export function buildSingleSaleCsv(sale, settings) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const shopLines = getShopHeaderLines(settings);
  const lines = [];
  shopLines.forEach((l) => lines.push(esc(l)));
  lines.push(`Receipt Date,${esc(new Date(sale.ts || Date.now()).toLocaleString())}`);
  if (sale.buyer) lines.push(`Buyer,${esc(buyerLabel(sale))}`);
  lines.push('');
  lines.push(['Item Name', 'Qty', 'Unit', 'Unit Price', 'Line Total'].map(esc).join(','));
  (sale.items || []).forEach((i) => {
    lines.push([i.name, i.qty, i.unit, i.unitPrice, i.line].map(esc).join(','));
  });
  lines.push('');
  lines.push(`Subtotal,${sale.subtotal || sale.total}`);
  lines.push(`Discount,${sale.discount || 0}`);
  lines.push(`Grand Total,${sale.total}`);
  return new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

/* ---------------- JSON ---------------- */

export function buildJson(db) {
  const data = {
    shopDetails: db.settings.shopDetails || {},
    ...db
  };
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

export function buildSingleSaleJson(sale, settings) {
  const data = {
    shopDetails: (settings && settings.shopDetails) || {},
    sale
  };
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

/* ---------------- Share / download ---------------- */

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

/**
 * Deliver an exported file to the user.
 *
 * @param mode 'save' | 'share'
 *
 * - Native + save: opens Android's system "Save to…" picker (Storage Access
 *   Framework) so the user chooses exactly where the report goes — Downloads,
 *   Drive, any folder. No storage permission is needed on any Android version.
 * - Native + share: writes the file to the app cache and opens the Android
 *   share sheet (WhatsApp, email, Drive, …).
 * - Web + share: opens the OS share sheet (Android Chrome, iOS Safari,
 *   Chromium on desktop); if file sharing is unavailable it saves to Downloads.
 * - Web + save: downloads the file directly to Downloads.
 *
 * Returns 'saved' | 'shared' | 'cancelled' | 'downloaded'.
 */
export async function deliver(blob, filename, mode = 'save') {
  if (Capacitor.isNativePlatform()) {
    const data = await blobToBase64(blob);
    if (mode === 'save') {
      try {
        const res = await FileSaver.saveFile({
          base64: data,
          filename,
          mimeType: blob.type || 'application/octet-stream',
        });
        return res.status === 'saved' ? 'saved' : 'cancelled';
      } catch (e) {
        // FileSaver missing (web preview / older APK) — fall back to share sheet.
        console.warn('Save-as picker unavailable, falling back to share', e);
      }
    }
    // Write to the cache root (not a sub-folder) so the Share plugin's
    // FileProvider can always resolve the file.
    const saved = await Filesystem.writeFile({
      path: filename,
      data,
      recursive: true,
      directory: Directory.Cache,
    });
    try {
      await Share.share({
        title: filename,
        dialogTitle: 'Share DataPharm export',
        files: [saved.uri],
      });
      return 'shared';
    } catch (e) {
      const msg = String((e && e.message) || e || '').toLowerCase();
      if (msg.includes('cancel')) return 'cancelled';
      // Share sheet failed — fall back to the system "Save to…" picker so the
      // exported file is never lost.
      console.warn('Share sheet failed, opening save picker instead', e);
      const res = await FileSaver.saveFile({
        base64: data,
        filename,
        mimeType: blob.type || 'application/octet-stream',
      });
      return res.status === 'saved' ? 'saved' : 'cancelled';
    }
  }

  // Web: open the OS share sheet whenever the browser can share files.
  if (mode === 'share' && typeof navigator !== 'undefined' && navigator.share) {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    const canShareFiles = typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
    if (canShareFiles) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled'; // user closed the sheet
        console.warn('Share failed, saving file instead', e);
        // fall through to the download fallback rather than failing silently
      }
    }
  }

  // Web 'save' (or share unavailable): download the file so nothing is lost.
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
