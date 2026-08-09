import puppeteer from 'puppeteer-core';
import { existsSync, readFileSync } from 'fs';

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!chrome) { console.error('Chrome not found'); process.exit(1); }

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();

const densities = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

const dataUrl = (p) => 'data:image/png;base64,' + readFileSync(p).toString('base64');

let failed = 0;
for (const [name, size] of densities) {
  const url = dataUrl(`android/app/src/main/res/mipmap-${name}/ic_launcher_foreground.png`);
  const r = await page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    let minX = width, minY = height, maxX = -1, maxY = -1, total = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 8) {
          total++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return { width, height, minX, minY, maxX, maxY, total };
  }, url);

  const N = r.width;
  const cx = N / 2, cy = N / 2;
  const safeR = (N * 33) / 108; // 66dp diameter safe circle on the 108dp canvas
  const maxDx = Math.max(cx - r.minX, r.maxX - cx);
  const maxDy = Math.max(cy - r.minY, r.maxY - cy);
  const cornerDist = Math.sqrt(maxDx * maxDx + maxDy * maxDy);
  const ok = cornerDist <= safeR;
  const margin = safeR - cornerDist;
  const pct = (w, h) => ((100 * w) / N).toFixed(1) + 'x' + ((100 * h) / N).toFixed(1);
  console.log(
    `${ok ? '✅' : '❌'} fg ${name} (${N}px): logo bbox ${pct(r.maxX - r.minX, r.maxY - r.minY)} of canvas, ` +
    `corner dist ${cornerDist.toFixed(1)}px vs safe radius ${safeR.toFixed(1)}px (margin ${margin.toFixed(1)}px)`
  );
  if (!ok) failed++;
}

// Render the final adaptive icon look (circle mask) as a preview
const fg = dataUrl('android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png');
const preview = await page.evaluate(async (fg) => {
  const N = 192;
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0D47AA';
  ctx.fillRect(0, 0, N, N);
  ctx.save();
  ctx.beginPath();
  ctx.arc(N / 2, N / 2, N / 2, 0, Math.PI * 2);
  ctx.clip();
  const img = new Image();
  img.src = fg;
  await img.decode();
  ctx.drawImage(img, 0, 0, N, N);
  ctx.restore();
  return c.toDataURL('image/png');
}, fg);
const fs = await import('fs');
fs.mkdirSync('preview', { recursive: true });
fs.writeFileSync('preview/icon-adaptive-circle.png', Buffer.from(preview.split(',')[1], 'base64'));
console.log('wrote preview/icon-adaptive-circle.png');

await browser.close();
console.log(failed ? `\n${failed} icon(s) outside safe zone ❌` : '\nAll foreground icons inside safe zone ✅');
process.exit(failed ? 1 : 0);
