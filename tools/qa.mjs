// QA: celostránkové screenshoty + axe-core (WCAG 2.2 AA + kontrast AAA) pro všechny stránky.
// node poradna-kl/tools/qa.mjs [http://localhost:8797] [výstupní složka]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const here = path.dirname(new URL(import.meta.url).pathname);
const repo = path.resolve(here, '../..');
const { chromium } = require(path.join(repo, 'bannerovna/node_modules/playwright-core'));
const axeSrc = fs.readFileSync(path.join(repo, 'schlieger-web/site/node_modules/axe-core/axe.min.js'), 'utf8');
const base = process.argv[2] || 'http://localhost:8797';
const outDir = process.argv[3] || path.join(here, '../docs/qa');
fs.mkdirSync(outDir, { recursive: true });
const pages = ['/', '/s-cim-pomahame/', '/sluzby/', '/jak-to-funguje/', '/caste-dotazy/', '/o-nas/', '/kontakt/', '/ochrana-osobnich-udaju/', '/pristupnost/', '/dekujeme/', '/404.html'];
const views = [{ name: 'd', width: 1440, height: 900 }, { name: 'm', width: 390, height: 844 }];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const schemes = (process.env.SCHEMES || 'light').split(',');
const browser = await chromium.launch({ channel: 'chrome' });
let total = 0;
for (const scheme of schemes) for (const v of views) {
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: scheme, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  for (const p of pages) {
    if (only && !only.includes(p)) continue;
    await page.goto(base + p, { waitUntil: 'networkidle' });
    await page.evaluate(async () => { document.querySelectorAll('img[loading=lazy]').forEach(i => i.loading = 'eager'); await Promise.all([...document.images].map(i => i.decode().catch(() => {}))); await document.fonts.ready; });
    const slug = (p === '/' ? 'uvod' : p.replace(/\//g, '').replace('.html', ''));
    if (!process.env.NOSHOT) await page.screenshot({ path: path.join(outDir, `${slug}-${v.name}-${scheme}.png`), fullPage: true });
    await page.addScriptTag({ content: axeSrc });
    const res = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'wcag2aaa', 'best-practice'] } }));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    for (const vi of res.violations) {
      total++;
      console.log(`${slug} ${v.name} ${scheme}: [${vi.impact}] ${vi.id} x${vi.nodes.length} :: ${vi.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`);
    }
    if (overflow) { total++; console.log(`${slug} ${v.name}: HORIZONTAL OVERFLOW`); }
  }
  await ctx.close();
}
await browser.close();
console.log(total ? `\n${total} nálezů` : 'axe: 0 nálezů');
