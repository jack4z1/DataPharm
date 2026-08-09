import puppeteer from 'puppeteer-core';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';

const chrome = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  (process.env.LOCALAPPDATA || '') + '/Google/Chrome/Application/chrome.exe',
].find(existsSync);
if (!chrome) { console.error('Chrome not found'); process.exit(1); }

const RES = 'android/app/src/main/res';
const PRIMARY = '#0D47AA';

// Load the DataPharm logo and recolor it white.
const logo = readFileSync('logo/DataPharm.svg', 'utf8');
const paths = [...logo.matchAll(/<path\b[^>]*>/g)].map((m) => m[0]).join('\n');
const white = paths.replace(/fill="#0D47AA"/gi, 'fill="#FFFFFF"');

// Logo natural size: 535 x 649, center (267.5, 324.5)
const build = (size, { bg = '', scale, cx = size / 2, cy = size / 2 }) => {
  const tx = cx - 267.5 * scale;
  const ty = cy - 324.5 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}<g transform="translate(${tx} ${ty}) scale(${scale})">${white}</g></svg>`;
};

// The logo fills its full 535x649 viewBox, so each variant picks a scale that
// keeps every pixel visible:
//  - Adaptive foreground: the logo must fit inside the 66dp safe circle of the
//    108dp canvas (guaranteed visible on every launcher mask, incl. circle).
//    535x649 -> size/1450 keeps the bounding box fully inside that circle.
//  - Legacy square/round icons: no mask, but leave ~21% margin so OEM launchers
//    that shrink icons never clip the logo.
const legacySvg = (size) => build(size, { bg: `<rect width="${size}" height="${size}" fill="${PRIMARY}"/>`, scale: size / 820 });
const roundSvg = (size) => build(size, { bg: `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${PRIMARY}"/>`, scale: size / 820 });
const fgSvg = (size) => build(size, { bg: '', scale: size / 1450 });
const splashSvg = (size) => build(size, { bg: `<rect width="${size}" height="${size}" fill="${PRIMARY}"/>`, scale: size / 2300 });

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();

async function renderToPng(svg, out) {
  const size = /width="(\d+)"/.exec(svg)[1];
  await page.setViewport({ width: +size, height: +size, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;background:transparent"><img src="data:image/svg+xml;utf8,${encodeURIComponent(svg)}" width="${size}" height="${size}"/></body>`);
  await new Promise((r) => setTimeout(r, 150));
  // omitBackground: the transparent foreground must stay transparent, not white
  writeFileSync(out, await page.screenshot({ type: 'png', omitBackground: true }));
  console.log(`wrote ${out} (${size}px)`);
}

const densities = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
];

for (const [name, size] of densities) {
  mkdirSync(`${RES}/mipmap-${name}`, { recursive: true });
  await renderToPng(legacySvg(size), `${RES}/mipmap-${name}/ic_launcher.png`);
  await renderToPng(roundSvg(size), `${RES}/mipmap-${name}/ic_launcher_round.png`);
}

// Adaptive foreground: the icon canvas is 108dp, so it must be rendered at the
// full 108dp-per-density resolution (up to 432px) or launchers scale it up and
// it looks blurry.
const fgDensities = [
  ['mdpi', 108],
  ['hdpi', 162],
  ['xhdpi', 216],
  ['xxhdpi', 324],
  ['xxxhdpi', 432],
];
for (const [name, size] of fgDensities) {
  await renderToPng(fgSvg(size), `${RES}/mipmap-${name}/ic_launcher_foreground.png`);
}

// Web icons
mkdirSync('public', { recursive: true });
const appleSvg = build(180, { bg: `<rect width="180" height="180" fill="${PRIMARY}"/>`, scale: 180 / 700 });
await renderToPng(appleSvg, 'public/apple-touch-icon.png');
const faviconSvg = build(192, { bg: `<rect width="192" height="192" fill="${PRIMARY}"/>`, scale: 192 / 700 });
await renderToPng(faviconSvg, 'public/favicon.png');

// Splash screen images (all orientation/density folders)
const splashDirs = [
  'drawable',
  'drawable-land-hdpi', 'drawable-land-mdpi', 'drawable-land-xhdpi', 'drawable-land-xxhdpi', 'drawable-land-xxxhdpi',
  'drawable-port-hdpi', 'drawable-port-mdpi', 'drawable-port-xhdpi', 'drawable-port-xxhdpi', 'drawable-port-xxxhdpi',
];
for (const dir of splashDirs) {
  mkdirSync(`${RES}/${dir}`, { recursive: true });
  await renderToPng(splashSvg(1280), `${RES}/${dir}/splash.png`);
}

await browser.close();
console.log('Icons generated ✅');
