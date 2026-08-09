import puppeteer from 'puppeteer-core';
import { existsSync } from 'fs';

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!chrome) { console.error('Chrome not found'); process.exit(1); }

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
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
import { mkdirSync } from 'fs';

await page.goto('http://localhost:5173/?demo=1', { waitUntil: 'networkidle0', timeout: 30000 });
await sleep(500);
check('splash screen visible on load', await has('.splash'));
await screenshot('s1-splash');
await sleep(1800);
check('splash fades out', !(await has('.splash')));
check('header uses new logo image', await has('.page-head .logo img'));

// category rail
check('category rail shown', await has('.cat-rail'));
const rail = await text('.cat-rail');
check('rail has All + category pills', rail.includes('All') && rail.includes('Tablet'), `got: ${rail.slice(0, 60)}`);

// click category pill filters list
await page.evaluate(() => { [...document.querySelectorAll('.cat-pill')].find((x) => x.textContent.includes('Capsule')).click(); });
await sleep(300);
check('category filter narrows list', (await page.$$eval('.prod-row', (e) => e.length)) === 2, `rows: ${await page.$$eval('.prod-row', (e) => e.length)}`);
check('section title shows category', (await text('.sec-head h2')) === 'Capsule');
await page.evaluate(() => { [...document.querySelectorAll('.cat-pill')].find((x) => x.textContent.trim() === 'All').click(); });
await sleep(300);

// expired product confirm
await page.evaluate(() => { [...document.querySelectorAll('.prod-row')].find((x) => x.textContent.includes('ORS Sachet')).click(); });
await sleep(400);
check('expired confirm dialog appears', await has('.confirm-modal'));
check('dialog says Expired product', (await text('.confirm-modal h3')).includes('Expired'));
await screenshot('s2-expired-confirm');
await page.evaluate(() => { [...document.querySelectorAll('.confirm-actions .btn')].find((x) => x.textContent.includes('Yes, sell it')).click(); });
await sleep(400);
check('dock appears with Detail button', (await text('.sell-btn')).includes('Detail'));

// edge swipe gesture closes something: expand dock, then simulate a left-edge swipe
await page.evaluate(() => { document.querySelector('.sell-btn').click(); });
await sleep(400);
check('dock expanded', await has('.sell-dock.full'));
await page.evaluate(() => {
  const mk = (type, x, y) => {
    const el = document.elementFromPoint(x, y) || document.body;
    return new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })],
      changedTouches: [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })],
    });
  };
  document.elementFromPoint(8, 300).dispatchEvent(mk('touchstart', 8, 300));
  document.elementFromPoint(40, 302).dispatchEvent(mk('touchmove', 40, 302));
  document.elementFromPoint(90, 304).dispatchEvent(mk('touchmove', 90, 304));
  document.elementFromPoint(90, 304).dispatchEvent(mk('touchend', 90, 304));
});
await sleep(400);
check('edge swipe collapses dock back', !(await has('.sell-dock.full')));

// settings text size (clear the cart first so the tab bar is visible)
await page.evaluate(() => { const b = document.querySelector('.sell-head-actions .icon-btn'); b && b.click(); });
await sleep(300);
check('cart cleared, tabs back', await has('.tabs'));
await page.evaluate(() => { [...document.querySelectorAll('.tabs .tab')].find((x) => x.textContent.includes('Settings')).click(); });
await sleep(400);
check('settings has Text size row', (await text('.page')).includes('Text size'));
check('font size A buttons present', (await page.$$eval('.fs-seg button', (e) => e.length)) === 3);
await page.evaluate(() => { document.querySelectorAll('.fs-seg button')[2].click(); });
await sleep(300);
check('app gets fs-lg class', await has('.app.fs-lg'));
await screenshot('s3-settings');

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===`);
if (errors.length) { console.log('Console errors:'); errors.slice(0, 8).forEach((e) => console.log('  - ' + e.slice(0, 200))); }
else console.log('No console errors ✅');
await browser.close();
process.exit(failed ? 1 : 0);
