import puppeteer from 'puppeteer-core';
import { mkdirSync, existsSync } from 'fs';

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find(existsSync);

if (!chrome) {
  console.error('Chrome not found');
  process.exit(1);
}

mkdirSync('preview', { recursive: true });
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
let failed = 0;
const check = (name, ok, extra = '') => {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
};

const text = async (sel) => page.$eval(sel, (el) => el.textContent.trim()).catch(() => '');
const has = async (sel) => !!(await page.$(sel));
const count = async (sel) => page.$$eval(sel, (e) => e.length).catch(() => 0);
const click = async (fn, ...args) => page.evaluate(fn, ...args);
const headTitle = () => text('.page-head h1');

const goto = async (label) => {
  await click((l) => {
    const b = [...document.querySelectorAll('.tabs button')].find((x) => x.textContent.trim() === l);
    if (b) b.click();
  }, label);
  await sleep(500);
};

async function setDate(sel, value) {
  await page.$eval(sel, (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

async function typeInto(idx, value) {
  await page.evaluate((i) => {
    document.querySelectorAll('.form input')[i].focus();
  }, idx);
  await page.keyboard.type(value, { delay: 12 });
}

console.log('=== 1. Dashboard (demo data) + clickable stats ===');
await page.goto('http://localhost:5173/?demo=1', { waitUntil: 'networkidle0', timeout: 30000 });
await sleep(2300); // let the splash screen finish
check('stat cards show 6 products', (await text('.stats .stat b')) === '6');
check('3 stat cards', (await count('.stats .stat')) === 3);
await click(() => document.querySelectorAll('.stats .stat')[0].click());
await sleep(400);
check('Products screen opens with back', (await text('.view-head h1')) === 'Products');
check('6 product rows in view', (await count('.view-head ~ .stock-list .stock-row')) === 6);
await click(() => document.querySelector('.view-head .back-btn').click());
await sleep(400);
check('back to home', (await headTitle()) === 'DataPharm');
await page.screenshot({ path: 'preview/1-dashboard.png' });

console.log('=== 1b. Out-of-stock products are not selectable + show alert ===');
await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('datapharm:v1'));
  const p = d.products.find((x) => x.name.includes('Paracetamol'));
  p.strips = 0;
  localStorage.setItem('datapharm:v1', JSON.stringify(d));
});
await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
await sleep(2300);
const oos = await page.evaluate(() => {
  const row = [...document.querySelectorAll('.prod-row')].find((x) => x.textContent.includes('Paracetamol'));
  if (!row) return null;
  return { disabled: row.disabled, aria: row.getAttribute('aria-disabled'), text: row.textContent };
});
check('out-of-stock row is disabled', !!(oos && oos.disabled === true && oos.aria === 'true'), JSON.stringify(oos));
check('alert shown on out-of-stock card', !!(oos && oos.text.includes('Out of stock') && oos.text.includes('not available for sale')), oos && oos.text.slice(0, 80));
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.prod-row')].find((x) => x.textContent.includes('Paracetamol'));
  row && row.click();
});
await sleep(400);
check('clicking out-of-stock does not open the selling dock', !(await has('.sell-dock')));
await page.screenshot({ path: 'preview/1b-out-of-stock.png' });
// restore pristine demo data for the remaining tests
await page.evaluate(() => { localStorage.removeItem('datapharm:v1'); });
await page.reload({ waitUntil: 'networkidle0', timeout: 30000 });
await sleep(2300);
check('demo data restored', (await text('.stats .stat b')) === '6');

console.log('=== 2. Select product → selling dock, tabs hidden ===');
await click(() => {
  const b = [...document.querySelectorAll('.prod-row')].find((x) => x.textContent.includes('Paracetamol 500mg'));
  b && b.click();
});
await sleep(400);
check('Selling now dock appears', await has('.sell-dock'));
check('bottom tabs hidden', !(await has('.tabs')));
check('dock shows Detail button (not Sell)', (await text('.sell-btn')).includes('Detail'));
await page.screenshot({ path: 'preview/2-dock.png' });

console.log('=== 3. Expand dock to fullscreen ===');
await click(() => {
  const b = document.querySelector('.sell-head-actions button:last-child');
  b && b.click();
});
await sleep(500);
check('dock in full mode', await has('.sell-dock.full'));
check('item stepper shown', await has('.sell-dock.full .cart-item .stepper'));
check('full mode shows Sell button', (await text('.sell-dock.full .sell-bill .btn')).includes('Sell ·'));
check('cart item shows shelf', (await text('.sell-dock.full .cart-item')).includes('Shelf B2'));

// tablet unit + qty + discount
await page.click('.sell-dock.full .cart-item .seg button:nth-child(2)');
await sleep(250);
const perUnit = await text('.sell-dock.full .cart-item .cart-sub .muted');
check('unit switched to tablet → ₹5 per tablet', perUnit.includes('₹5 per tablet'), `got ${perUnit}`);
for (let i = 0; i < 4; i++) {
  await click(() => {
    const b = document.querySelector('.sell-dock.full .cart-item .stepper button:last-child');
    b && b.click();
  });
  await sleep(80);
}
check('qty incremented to 5', (await text('.sell-dock.full .cart-item .stepper b')) === '5');
await page.type('.sell-dock.full .disc-input input', '10');
await sleep(300);
check('discount shows −₹2.5', (await text('.disc-amt')).includes('−₹2.5'));
const total = await text('.total-amt');
check('5 tablets × ₹5 − 10% = ₹22.50', total === '₹22.50', `got ${total}`);
await page.screenshot({ path: 'preview/3-fullscreen.png' });

console.log('=== 4. Sell → QR popup with Paid / Cancel ===');
await click(() => {
  const b = document.querySelector('.sell-dock.full .sell-bill .btn');
  b && b.click();
});
await sleep(500);
check('QR popup opens', await has('.qr-modal'));
check('popup title Scan to pay', (await text('.qr-modal h3')) === 'Scan to pay');
const qrBtns = await page.$$eval('.qr-actions .btn', (els) => els.map((e) => e.textContent.trim()));
check('Paid + Cancel buttons', qrBtns.some((t) => t.includes('Paid')) && qrBtns.some((t) => t.includes('Cancel')), JSON.stringify(qrBtns));
await page.screenshot({ path: 'preview/4-qr-popup.png' });

console.log('=== 5. Cancel keeps cart, Paid records sale ===');
await click(() => {
  const b = [...document.querySelectorAll('.qr-actions .btn')].find((x) => x.textContent.includes('Cancel'));
  b && b.click();
});
await sleep(400);
check('popup closed on Cancel', !(await has('.qr-modal')));
check('cart kept after Cancel', await has('.sell-dock'));
await click(() => {
  const b = document.querySelector('.sell-dock.full .sell-bill .btn');
  b && b.click();
});
await sleep(400);
await click(() => {
  const b = [...document.querySelectorAll('.qr-actions .btn')].find((x) => x.textContent.includes('Paid'));
  b && b.click();
});
await sleep(400);
check('Paid switches to Confirm', (await text('.qr-modal')).includes('Confirm'));
await click(() => {
  const b = [...document.querySelectorAll('.qr-actions .btn')].find((x) => x.textContent.includes('Confirm'));
  b && b.click();
});
await sleep(700);
check('toast confirms sale', (await text('.toast')).includes('Sale recorded'));
check('dock gone after sale', !(await has('.sell-dock')));
check('tabs back after sale', await has('.tabs'));

console.log('=== 6. Stock reduced correctly ===');
await goto('Stock');
check('on Stock screen', (await headTitle()) === 'Stock');
await click(() => {
  const b = [...document.querySelectorAll('.stock-row')].find((x) => x.textContent.includes('Paracetamol 500mg'));
  b && b.click();
});
await sleep(400);
const detailStock = await text('.info-cell:nth-of-type(3) b');
check('Paracetamol: 19 strips · 5 tabs', detailStock.includes('19 strips') && detailStock.includes('5 tabs'), `got ${detailStock}`);
await page.screenshot({ path: 'preview/5-stock-detail.png' });
await click(() => document.querySelector('.sheet-head .icon-btn').click());
await sleep(300);

console.log('=== 7. History: export + grouped cards ===');
await goto('History');
check('on History screen', (await headTitle()) === 'History');
check('4 export chips', (await count('.export-chip')) === 4);
check('history cards render', (await count('.hist-card')) >= 3);
check('day group header Today', (await text('.hist-day')).includes('Today'));
await click(() => {
  const b = document.querySelector('.hist-card');
  b && b.click();
});
await sleep(300);
check('newest sale total ₹22.50', (await text('.hist-line.strong b')) === '₹22.50');
await page.screenshot({ path: 'preview/6-history.png' });

console.log('=== 8. Add product form with category picker ===');
await goto('Stock');
await click(() => {
  const b = document.querySelector('.fab');
  b && b.click();
});
await sleep(500);
check('category chips shown', (await count('.cat-chips .cat-chip')) >= 8);
check('new category input present', await has('.form input[placeholder*="new category"]'));
await typeInto(0, 'Ibuprofen 400mg'); // name
await typeInto(1, 'Ayurvedic'); // custom new category
await setDate('.form input[type=date]', '2027-12-01');
await typeInto(3, '45'); // price
await typeInto(4, '14'); // strips
await typeInto(5, '6'); // tablets per strip
await typeInto(6, 'Shelf E4'); // location
await typeInto(7, 'Abbott'); // buy from
await click(() => {
  const b = [...document.querySelectorAll('.sheet-footer button')].find((x) => x.textContent.includes('Add to stock'));
  b && b.click();
});
await sleep(600);
check('7 products after adding', (await count('.stock-row')) === 7);
check('sheet closed after save', !(await text('.sheet-head h3')));
check('custom category chip on new row', (await text('.stock-list')).includes('Ayurvedic'));
await page.screenshot({ path: 'preview/7-stock.png' });

console.log('=== 9. Settings: payment QR + export on History ===');
await goto('Settings');
check('on Settings screen', (await headTitle()) === 'Settings');
check('Payment QR section present', (await text('.sec-head h2')) === 'Payment QR');
check('upload QR button present', await has('.qr-upload-btn'));
await page.screenshot({ path: 'preview/8-settings.png' });
// Export lives on History now — force the download path (share sheet has no UI in headless Chrome)
await goto('History');
await page.evaluate(() => {
  Object.defineProperty(navigator, 'share', { value: undefined });
  Object.defineProperty(navigator, 'canShare', { value: undefined });
});
await click(() => {
  const b = document.querySelector('.export-chip');
  b && b.click();
});
await sleep(1500);
const toastTxt = await text('.toast');
check('PDF export falls back to saving the file (share unavailable)', toastTxt.includes('saved datapharm-') && toastTxt.includes('.pdf') && toastTxt.includes('Downloads'), `got ${toastTxt}`);

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (errors.length) {
  console.log('Console errors:');
  errors.slice(0, 8).forEach((e) => console.log('  - ' + e.slice(0, 200)));
} else {
  console.log('No console errors ✅');
}

await browser.close();
process.exit(failed ? 1 : 0);
