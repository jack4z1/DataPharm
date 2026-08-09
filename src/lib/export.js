import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import {
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
} from 'docx';
import { stockParts, round2, money } from './pricing.js';

/**
 * Native bridge (registered in MainActivity) that opens Android's "Save to…"
 * document picker so the user chooses where the exported file goes.
 */
const FileSaver = registerPlugin('FileSaver', {
  web: () => ({ saveFile: async () => ({ status: 'unsupported' }) }),
});

/* ---------------- PDF ---------------- */

export function buildPdf(db) {
  const cur = db.settings.currency === '₹' ? 'Rs. ' : db.settings.currency;
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.setTextColor(13, 71, 170);
  doc.text('DataPharm Report', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 25);

  doc.setFontSize(13);
  doc.setTextColor(20, 20, 20);
  doc.text('Products in stock', 14, 34);
  autoTable(doc, {
    startY: 37,
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

/* ---------------- Buyer info ---------------- */

/** Pretty-printed buyer line for a sale, or '—' when there is none. */
function buyerLabel(sale) {
  const b = sale && sale.buyer;
  if (!b) return '—';
  const parts = [b.name, b.phone, b.address].filter((x) => x && String(x).trim());
  return parts.length ? parts.join(', ') : '—';
}

/* ---------------- DOCX ---------------- */

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

export async function buildDocx(db) {
  const cur = db.settings.currency;
  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: 'DataPharm Report', color: '0D47AA' })],
    }),
    new Paragraph({
      spacing: { after: 240 },
      children: [new TextRun({ text: 'Generated: ' + new Date().toLocaleString() })],
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

/* ---------------- CSV ---------------- */

export function buildCsv(db) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [];
  lines.push('DataPharm Export');
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

/* ---------------- JSON ---------------- */

export function buildJson(db) {
  return new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
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
