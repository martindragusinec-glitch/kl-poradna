// Náhled e-mailů z formuláře: node tools/email/nahled.mjs [http://localhost:8797]
// Vyrobí tools/email/nahled-*.html a screenshoty docs/email-*.png (počítač 680 px a mobil 390 px).
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { poptavka, potvrzeni } from '../../api/_emaily.js';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../..');
const zaklad = process.argv[2] || 'http://localhost:8797';
const data = {
  jmeno: 'Jana Nováková', telefon: '777 123 456', email: 'jana.novakova@example.cz', obec: 'Kladno – Kročehlavy',
  tema: 'Dluhy a exekuce', kdy: 'dopoledne, nejlépe do 11 hodin',
  popis: 'Dobrý den, přišel mi dopis od exekutora a nevím, co s tím. Mám tři menší dluhy u různých firem.\nLhůta na odpověď je do konce měsíce.',
};
const prijato = new Date('2026-10-08T12:32:00Z');
const out = { poptavka: poptavka(data, { zaklad, prijato }), potvrzeni: potvrzeni(data, { zaklad, prijato }) };

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright-core'); } catch { pw = require(path.resolve(root, '../bannerovna/node_modules/playwright-core')); }
const browser = await pw.chromium.launch({ channel: 'chrome' });
for (const [name, mail] of Object.entries(out)) {
  const file = path.join(here, `nahled-${name}.html`);
  fs.writeFileSync(file, mail.html);
  for (const [w, suffix] of [[680, ''], [390, '-mobil']]) {
    const page = await browser.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
    await page.goto('file://' + file, { waitUntil: 'networkidle' });
    await page.screenshot({ path: path.join(root, `docs/email-${name}${suffix}.png`), fullPage: true });
    await page.close();
  }
  console.log(`${name}: ${mail.subject}`);
}
await browser.close();
