/**
 * Exports every carousel slide to a 1080x1350 PNG using Playwright.
 *
 * Usage:  node export-pngs.mjs
 *
 * Requires playwright + a chromium install:
 *   npm i -D playwright && npx playwright install chromium
 *
 * The carousel HTML must expose ?export&slide=N mode (it does).
 * Slides are laid out at 504x630 CSS px; we shoot them with
 * deviceScaleFactor = 1080/504 to land exactly on 1080x1350.
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.join(here, 'whatsapp-agent-base-carousel.html');
const outDir = path.join(here, 'png');

const SLIDE_W = 504;
const SLIDE_H = 630;
const SCALE = 1080 / SLIDE_W;
const TOTAL = 7;
const PREFIX = 'whatsapp-agent-base-slide-';

fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();

try {
  for (let i = 0; i < TOTAL; i++) {
    const page = await browser.newPage({
      viewport: { width: SLIDE_W, height: SLIDE_H },
      deviceScaleFactor: SCALE,
    });
    const url =
      'file:///' + htmlPath.replace(/\\/g, '/') + `?export&slide=${i}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    // Manrope comes from Google Fonts; make sure it's loaded.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const out = path.join(
      outDir,
      `${PREFIX}${String(i + 1).padStart(2, '0')}.png`
    );
    await page.screenshot({
      path: out,
      clip: { x: 0, y: 0, width: SLIDE_W, height: SLIDE_H },
    });
    console.log(`✓ ${path.basename(out)}`);
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`\nDone — ${TOTAL} PNGs in ${outDir}`);
