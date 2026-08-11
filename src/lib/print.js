/**
 * DataPharm Thermal & Standard Receipt Printing Module
 * Formats shop headers, receipts, and printer test tickets for window.print() and bluetooth thermal printers.
 */

import { money } from './pricing.js';

export function formatShopHeader(settings) {
  const shop = (settings && settings.shopDetails) || {};
  const name = shop.name || 'DataPharm Pharmacy';
  const address = shop.address || '';
  const phone = shop.phone || '';
  const email = shop.email || '';

  const lines = [name];
  if (address) lines.push(address);
  const contactParts = [];
  if (phone) contactParts.push(`Ph: ${phone}`);
  if (email) contactParts.push(`Email: ${email}`);
  if (contactParts.length) lines.push(contactParts.join(' | '));

  return lines;
}

export function printSaleReceipt({ items, total, subtotal, discount, discountPct, buyer, ts }, settings) {
  const cur = (settings && settings.currency) || '₹';
  const shopLines = formatShopHeader(settings);

  const receiptDate = new Date(ts || Date.now()).toLocaleString();
  const receiptId = 'REC-' + (ts || Date.now()).toString().slice(-6);

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Receipt ${receiptId}</title>
        <style>
          @page { size: auto; margin: 5mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 12px;
            color: #000;
            background: #fff;
            margin: 0;
            padding: 10px;
            max-width: 320px;
            margin-left: auto;
            margin-right: auto;
          }
          .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
          .shop-title { font-size: 16px; font-weight: bold; margin-bottom: 2px; text-transform: uppercase; }
          .shop-sub { font-size: 11px; color: #333; line-height: 1.3; }
          .info-table { width: 100%; margin-bottom: 8px; font-size: 11px; }
          .info-table td { padding: 1px 0; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 11px; }
          .items-table th { text-align: left; border-bottom: 1px solid #000; padding: 4px 0; font-size: 10px; text-transform: uppercase; }
          .items-table td { padding: 4px 0; border-bottom: 1px dashed #eee; vertical-align: top; }
          .items-table td.num { text-align: right; }
          .totals { border-top: 1px dashed #000; padding-top: 6px; margin-top: 4px; font-size: 12px; }
          .total-row { display: flex; justify-content: space-between; margin-bottom: 3px; }
          .total-row.grand { font-size: 14px; font-weight: bold; border-top: 1px solid #000; padding-top: 4px; margin-top: 4px; }
          .buyer-box { background: #f9f9f9; border: 1px solid #ddd; padding: 6px; border-radius: 4px; margin-bottom: 8px; font-size: 11px; }
          .footer { text-align: center; margin-top: 12px; font-size: 10px; border-top: 1px dashed #000; padding-top: 8px; font-style: italic; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="shop-title">${escapeHtml(shopLines[0])}</div>
          ${shopLines.slice(1).map((l) => `<div class="shop-sub">${escapeHtml(l)}</div>`).join('')}
        </div>

        <table class="info-table">
          <tr><td><strong>Receipt #:</strong> ${receiptId}</td><td style="text-align:right">${receiptDate}</td></tr>
        </table>

        ${
          buyer && (buyer.name || buyer.phone || buyer.address)
            ? `<div class="buyer-box">
                <strong>Customer:</strong> ${escapeHtml(buyer.name || 'Walk-in')}<br/>
                ${buyer.phone ? `Ph: ${escapeHtml(buyer.phone)} ` : ''}
                ${buyer.address ? `| Addr: ${escapeHtml(buyer.address)}` : ''}
              </div>`
            : ''
        }

        <table class="items-table">
          <thead>
            <tr>
              <th>Item</th>
              <th class="num">Qty</th>
              <th class="num">Price</th>
              <th class="num">Amt</th>
            </tr>
          </thead>
          <tbody>
            ${(items || [])
              .map(
                (i) => `
              <tr>
                <td>${escapeHtml(i.name)}</td>
                <td class="num">${i.qty} ${i.unit === 'strip' ? 'st' : 'tb'}</td>
                <td class="num">${money(i.unitPrice, cur)}</td>
                <td class="num">${money(i.line, cur)}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>

        <div class="totals">
          ${subtotal ? `<div class="total-row"><span>Subtotal:</span><span>${money(subtotal, cur)}</span></div>` : ''}
          ${discount ? `<div class="total-row"><span>Discount (${discountPct || 0}%):</span><span>−${money(discount, cur)}</span></div>` : ''}
          <div class="total-row grand">
            <span>TOTAL AMOUNT:</span>
            <span>${money(total, cur)}</span>
          </div>
        </div>

        <div class="footer">
          Thank you for visiting! Get well soon.<br/>
          Powered by DataPharm POS
        </div>
      </body>
    </html>
  `;

  executePrint(html);
}

export function printTestReceipt(settings) {
  const shopLines = formatShopHeader(settings);
  const now = new Date().toLocaleString();

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Printer Connection Test</title>
        <style>
          @page { size: auto; margin: 5mm; }
          body { font-family: sans-serif; font-size: 12px; width: 280px; margin: 0 auto; text-align: center; padding: 10px; }
          .title { font-weight: bold; font-size: 16px; margin-bottom: 4px; }
          .badge { background: #000; color: #fff; padding: 4px 8px; border-radius: 4px; font-weight: bold; margin: 10px 0; display: inline-block; }
          .dashed { border-bottom: 1px dashed #000; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="title">${escapeHtml(shopLines[0])}</div>
        ${shopLines.slice(1).map((l) => `<div>${escapeHtml(l)}</div>`).join('')}
        <div class="dashed"></div>
        <div class="badge">PRINTER CONNECTION TEST ✅</div>
        <p>Bluetooth &amp; Wi-Fi Thermal Printer connection is working correctly.</p>
        <div style="font-size: 10px; color: #555;">Time: ${now}</div>
        <div class="dashed"></div>
        <div>--- End of Test ---</div>
      </body>
    </html>
  `;

  executePrint(html);
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function executePrint(html) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      console.error('Print failed:', e);
    } finally {
      setTimeout(() => iframe.remove(), 1000);
    }
  }, 300);
}
