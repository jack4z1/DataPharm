import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync } from 'fs';

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!chrome) { console.error('Chrome not found'); process.exit(1); }

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0, failed = 0;
const check = (name, ok, extra = '') => {
  if (ok) { passed++; console.log(`  ✅ ${name}`); }
  else { failed++; console.log(`  ❌ ${name} ${extra}`); }
};
const has = async (s) => !!(await page.$(s));
const text = async (s) => page.$eval(s, (el) => el.textContent.trim()).catch(() => '');
const screenshot = async (name) => { mkdirSync('preview', { recursive: true }); await page.screenshot({ path: `preview/${name}.png` }); };

await page.goto('http://localhost:5173/?demo=1', { waitUntil: 'networkidle0', timeout: 30000 });
await sleep(2000);

// 1. Search bar: focus state, hint, faded placeholder
const phColor = await page.$eval('.search input', (el) => getComputedStyle(el).color);
const phPl = await page.$eval('.search input', (el) => getComputedStyle(el, '::placeholder').color);
check('search placeholder faded color', /rgba?\(\d+/.test(phPl) && phPl !== phColor, `ph=${phPl} txt=${phColor}`);
await page.evaluate(() => { const i = document.querySelector('.search input'); i.focus(); i.dispatchEvent(new Event('focus', { bubbles: true })); });
await sleep(250);
check('search input gains focus', await page.evaluate(() => document.activeElement === document.querySelector('.search input')));
check('search shows "Type to search" hint', (await text('.search-hint')).includes('Type to search'));
await screenshot('u1-search-focus');
await page.evaluate(() => {
  const i = document.querySelector('.search input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(i, 'para');
  i.dispatchEvent(new Event('input', { bubbles: true }));
  i.blur();
  i.dispatchEvent(new Event('blur', { bubbles: true }));
});
await sleep(300);
check('search count pill shown with query', await has('.search-count'));
check('search filters products', (await text('.sec-head h2')).includes('Results'));
await screenshot('u2-search-query');
await page.evaluate(() => { document.querySelector('.search-clear').click(); });
await sleep(250);
check('clear button empties search', (await text('.search input')).length === 0);

// 2. Add to stock popup: footer button pinned, no overlap
await page.evaluate(() => { [...document.querySelectorAll('.tabs .tab')].find((x) => x.textContent.includes('Stock')).click(); });
await sleep(400);
await page.evaluate(() => { document.querySelector('.fab').click(); });
await sleep(500);
check('product form sheet has footer', await has('.sheet-footer .btn.big'));
check('form button says Add to stock', (await text('.sheet-footer .btn.big')).includes('Add to stock'));
const btnBox = await page.evaluate(() => { const b = document.querySelector('.sheet-footer .btn.big').getBoundingClientRect(); return { top: b.top, bottom: b.bottom, vh: window.innerHeight }; });
check('footer button fully on screen', btnBox.bottom <= btnBox.vh + 1, JSON.stringify(btnBox));
// overlap check: scroll the body fully, then last field must end above the footer
await page.evaluate(() => {
  const body = document.querySelector('.sheet-body');
  body.scrollTop = body.scrollHeight;
});
await sleep(200);
const overlap = await page.evaluate(() => {
  const fields = [...document.querySelectorAll('.form label')];
  const last = fields[fields.length - 1].getBoundingClientRect();
  const foot = document.querySelector('.sheet-footer').getBoundingClientRect();
  return { lastBottom: last.bottom, footTop: foot.top, overlaps: last.bottom > foot.top };
});
check('footer does not overlap last field (scrolled)', !overlap.overlaps, JSON.stringify(overlap));
await screenshot('u3-add-stock');
await page.evaluate(() => { document.querySelector('.sheet-head .icon-btn').click(); });
await sleep(300);

// 3. Sell dock: bill pinned at bottom + buyer fields
await page.evaluate(() => { [...document.querySelectorAll('.tabs .tab')].find((x) => x.textContent.includes('Home')).click(); });
await sleep(400);
await page.evaluate(() => { [...document.querySelectorAll('.prod-row')].find((x) => x.textContent.includes('Paracetamol')).click(); });
await sleep(400);
await page.evaluate(() => { document.querySelector('.sell-btn').click(); });
await sleep(500);
check('full dock has pinned sell-bill', await has('.sell-dock.full .sell-bill'));
const billBox = await page.evaluate(() => {
  const b = document.querySelector('.sell-bill').getBoundingClientRect();
  const dock = document.querySelector('.sell-dock').getBoundingClientRect();
  return { billBottom: b.bottom, dockBottom: dock.bottom, billTop: b.top, bodyBottom: document.querySelector('.sell-body').getBoundingClientRect().bottom };
});
check('sell-bill pinned at dock bottom', billBox.billBottom >= billBox.dockBottom - 4 && billBox.billBottom <= billBox.dockBottom + 4, JSON.stringify(billBox));
check('sell button inside bill', (await text('.sell-bill .btn.big')).includes('Sell'));
// buyer toggle
check('buyer toggle present', await has('.buyer-toggle'));
await page.evaluate(() => { document.querySelector('.buyer-toggle').click(); });
await sleep(300);
check('buyer fields open', (await page.$$eval('.buyer-fields input', (e) => e.length)) === 3);
await screenshot('u4-sell-buyer');
// fill buyer with real keyboard input, then sell (QR flow -> confirm)
await page.click('.buyer-fields input:nth-child(1)');
await page.keyboard.type('Ravi Kumar');
await page.click('.buyer-fields input:nth-child(2)');
await page.keyboard.type('9876543210');
await page.click('.buyer-fields input:nth-child(3)');
await page.keyboard.type('12, MG Road, Delhi');
await sleep(200);
await page.evaluate(() => { document.querySelector('.sell-bill .btn.big').click(); });
await sleep(400);
check('QR modal opens', await has('.qr-modal'));
await page.evaluate(() => { [...document.querySelectorAll('.qr-actions .btn')].find((x) => x.textContent.includes('Paid')).click(); });
await sleep(300);
check('confirm step', (await text('.qr-actions .btn:last-child')).includes('Confirm'));
await page.evaluate(() => { [...document.querySelectorAll('.qr-actions .btn')].find((x) => x.textContent.includes('Confirm')).click(); });
await sleep(400);

// 4. History shows buyer
const dbCheck = await page.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('datapharm:v1'));
  const s = d.sales[0];
  return { hasSale: !!s, buyer: s && s.buyer, total: s && s.total };
});
check('sale recorded with buyer in DB', !!(dbCheck.hasSale && dbCheck.buyer && dbCheck.buyer.name === 'Ravi Kumar'), JSON.stringify(dbCheck));
await page.evaluate(() => { [...document.querySelectorAll('.tabs .tab')].find((x) => x.textContent.includes('History')).click(); });
await sleep(400);
await page.evaluate(() => { document.querySelector('.hist-card.sale').click(); });
await sleep(300);
const buyerLine = await text('.hist-buyer');
check('history shows buyer details', buyerLine.includes('Ravi Kumar') && buyerLine.includes('9876543210'), buyerLine);
await screenshot('u5-history-buyer');

console.log(`\n=== UI RESULT: ${passed} passed, ${failed} failed ===`);
if (errors.length) { console.log('Console errors:'); errors.slice(0, 8).forEach((e) => console.log('  - ' + e.slice(0, 200))); }
else console.log('No console errors ✅');
await browser.close();
process.exit(failed ? 1 : 0);
