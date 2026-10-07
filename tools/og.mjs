// Vykreslí OG obrázek (1200×630) z tools/og/og.html do assets/img/og.jpg.
// node poradna-kl/tools/og.mjs   (potřebuje playwright-core a nainstalovaný Google Chrome)
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const here = path.dirname(new URL(import.meta.url).pathname);
let pw;
try { pw = require('playwright-core'); } catch { pw = require(path.resolve(here, '../../bannerovna/node_modules/playwright-core')); }
const browser = await pw.chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(here, 'og/og.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.resolve(here, '../assets/img/og.jpg'), type: 'jpeg', quality: 88 });
await browser.close();
console.log('assets/img/og.jpg');
