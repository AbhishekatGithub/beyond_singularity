import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const html = fs.readFileSync('app/src/main/assets/index.html', 'utf8');
const out = process.argv[2] || 'browser-layout-screenshots';
fs.mkdirSync(out, { recursive: true });

const profiles = [
  { name: 'compact_720p', width: 711, height: 320, dpr: 2.25 },
  { name: 'galaxy_s24', width: 832, height: 384, dpr: 2.8125 },
  { name: 'large_phone', width: 914, height: 411, dpr: 2.625 },
  { name: 'tablet_10in', width: 1280, height: 800, dpr: 2.0 },
];

const browser = await chromium.launch({ headless: true });

async function loadEra(context, era) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.documentElement.classList.add('android-app'));
  if (era >= 14) {
    await page.evaluate(e => {
      const fn = window['enterEra' + e];
      if (typeof fn === 'function') fn();
    }, era);
  }
  await page.waitForTimeout(450);
  return { page, errors };
}

for (const p of profiles) {
  const context = await browser.newContext({
    viewport: { width: p.width, height: p.height },
    deviceScaleFactor: p.dpr,
    isMobile: true,
    hasTouch: true,
    locale: 'en-US',
    colorScheme: 'dark'
  });

  for (let era = 13; era <= 19; era++) {
    const { page, errors } = await loadEra(context, era);
    await page.screenshot({
      path: path.join(out, `${p.name}_era${era}_closed.png`),
      fullPage: false
    });
    fs.writeFileSync(
      path.join(out, `${p.name}_era${era}_console.txt`),
      errors.join('\n')
    );

    if (era >= 14) {
      const tab = page.locator(`#era${era}App .bts-sheet-tab`);
      if (await tab.count()) {
        await tab.click({ force: true });
        await page.waitForTimeout(220);
        await page.screenshot({
          path: path.join(out, `${p.name}_era${era}_open.png`),
          fullPage: false
        });
      }
    }
    await page.close();
  }
  await context.close();
}

await browser.close();
console.log('Browser/WebView-style layout screenshots complete.');
