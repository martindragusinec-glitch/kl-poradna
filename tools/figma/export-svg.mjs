// Export vykreslených stránek do SVG pro import do Figmy (upload_assets → upravitelné vrstvy).
// node tools/figma/export-svg.mjs [http://localhost:8797] → tools/figma/out/<nazev>.svg
//
// Texty se vypisují po řádcích (Figma z <text> udělá textové vrstvy). Do názvů vrstev se ukládají údaje,
// podle kterých postprocess ve Figmě (tools/figma/postprocess.js) složí odstavce zpět do jedné textové
// vrstvy se správným řezem písma, z ploch udělá obdélníky se zaoblením/okraji/stínem a napojí barvy na proměnné.
//   ¶|x|top|w|L|align|ls        skupina odstavce (souřadnice stránky, šířka, výška řádku, zarovnání, prostrkání)
//   ↳|j|lx|runs                 řádek: j = spojka s dalším (s=mezera, n=nový řádek, 0=nic), lx = x řádku,
//                               runs = "500:0-12;700u:12-20" (řez písma, i = kurzíva, u = podtržení, rozsah znaků)
//   ▭ název|r=..|b=..|s=..      plocha: zaoblení rohů, okraje (t,r,b,l,#barva,alfa), stín (x,y,blur,spread,#barva,alfa)
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../..');
const base = process.argv[2] || 'http://localhost:8797';
const outDir = path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });

const STRANKY = [
  ['uvod', '/'], ['s-cim-pomahame', '/s-cim-pomahame/'], ['sluzby', '/sluzby/'], ['jak-to-funguje', '/jak-to-funguje/'],
  ['caste-dotazy', '/caste-dotazy/'], ['o-nas', '/o-nas/'], ['kontakt', '/kontakt/'], ['v-priprave', '/v-priprave/'],
];
const ULOHY = [
  ...STRANKY.map(([n, u]) => ({ name: `${n}-desktop`, url: base + u, w: 1440 })),
  ...STRANKY.map(([n, u]) => ({ name: `${n}-mobil`, url: base + u, w: 390 })),
  { name: 'email-poptavka', url: base + '/_email/nahled-poptavka.html', w: 680 },
  { name: 'email-potvrzeni', url: base + '/_email/nahled-potvrzeni.html', w: 680 },
];

// Běží ve stránce: vrátí SVG řetězec
async function exportuj() {
  document.documentElement.style.scrollBehavior = 'auto';
  window.scrollTo(0, 0);
  const W = document.documentElement.clientWidth;
  const H = Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const r1 = (n) => Math.round(n * 10) / 10;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const out = [], defs = [];
  let clipN = 0;

  const color = (c) => {
    const m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    if (!m) return null;
    const a = m[4] === undefined ? 1 : Number(m[4]);
    const hex = '#' + [m[1], m[2], m[3]].map((x) => Math.round(Number(x)).toString(16).padStart(2, '0')).join('').toUpperCase();
    return { hex, a };
  };
  const px = (v) => parseFloat(v) || 0;
  const radii = (cs, w, h) => ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map((k) => {
    const v = cs[k].split(' ')[0];
    const n = v.endsWith('%') ? (parseFloat(v) / 100) * Math.min(w, h) : px(v);
    return Math.min(n, w / 2, h / 2);
  });
  const rrPath = (x, y, w, h, [tl, tr, br, bl]) =>
    `M${r1(x + tl)} ${r1(y)}H${r1(x + w - tr)}${tr ? `A${r1(tr)} ${r1(tr)} 0 0 1 ${r1(x + w)} ${r1(y + tr)}` : ''}V${r1(y + h - br)}${br ? `A${r1(br)} ${r1(br)} 0 0 1 ${r1(x + w - br)} ${r1(y + h)}` : ''}H${r1(x + bl)}${bl ? `A${r1(bl)} ${r1(bl)} 0 0 1 ${r1(x)} ${r1(y + h - bl)}` : ''}V${r1(y + tl)}${tl ? `A${r1(tl)} ${r1(tl)} 0 0 1 ${r1(x + tl)} ${r1(y)}` : ''}Z`;
  const shadow = (cs) => {
    if (!cs.boxShadow || cs.boxShadow === 'none') return '';
    const first = cs.boxShadow.split(/,(?![^(]*\))/)[0];
    if (/inset/.test(first)) return '';
    const c = color(first);
    const nums = first.replace(/rgba?\([^)]*\)/, '').trim().split(/\s+/).map(px);
    return c ? `|s=${nums.slice(0, 4).map(r1).join(',')},${c.hex},${r1(c.a * 100) / 100}` : '';
  };
  const nazev = (el) => {
    const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0];
    return cls || el.tagName.toLowerCase();
  };
  const mix = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * t + parseInt(b.slice(i, i + 2), 16) * (1 - t)).toString(16).padStart(2, '0')).join('').toUpperCase();
  const bgOf = (el) => {
    for (let e = el.parentElement; e; e = e.parentElement) {
      const c = color(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0.5) return c.hex;
    }
    return '#FFFFFF';
  };

  // Plocha prvku (pozadí, okraje, stín)
  function box(el, cs, r, op) {
    const bg = color(cs.backgroundColor);
    const bw = ['Top', 'Right', 'Bottom', 'Left'].map((s) => (cs['border' + s + 'Style'] !== 'none' ? px(cs['border' + s + 'Width']) : 0));
    const bc = color(cs.borderTopColor) || color(cs.borderBottomColor);
    const hasB = bw.some((x) => x > 0) && bc && bc.a > 0;
    const sh = shadow(cs);
    if (!(bg && bg.a > 0) && !hasB && !sh) return;
    const rr = radii(cs, r.width, r.height);
    const meta = `▭ ${nazev(el)}|r=${rr.map(r1).join(',')}` + (hasB ? `|b=${bw.map(r1).join(',')},${bc.hex},${r1(bc.a * 100) / 100}` : '') + sh
      + (bg && bg.a > 0 && bg.a < 1 ? `|a=${r1(bg.a * 100) / 100}` : '') + (op < 1 ? `|o=${r1(op * 100) / 100}` : '');
    const fill = bg && bg.a > 0 ? `fill="${bg.hex}"${bg.a < 1 ? ` fill-opacity="${r1(bg.a * 100) / 100}"` : ''}` : 'fill="none"';
    out.push(`<path id="${esc(meta)}" d="${rrPath(r.left, r.top + scrollY, r.width, r.height, rr)}" ${fill}${op < 1 ? ` opacity="${r1(op * 100) / 100}"` : ''}/>`);
  }

  // Inline SVG (ikony, logo): vypočtené barvy natvrdo
  function ikona(el, r, op) {
    const clone = el.cloneNode(true);
    const src = [el, ...el.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')];
    src.forEach((s, i) => {
      const d = dst[i], cs = getComputedStyle(s);
      d.removeAttribute('class'); d.removeAttribute('style');
      if (s === el) return;
      const f = color(cs.fill), st = color(cs.stroke);
      // Figma při importu průhlednost výplně zahodí: poloprůhlednou barvu smíchat s pozadím
      d.setAttribute('fill', f && f.a > 0 && cs.fill !== 'none' ? (f.a < 1 ? mix(f.hex, bgOf(el), f.a) : f.hex) : 'none');
      if (st && cs.stroke !== 'none' && st.a > 0) { d.setAttribute('stroke', st.hex); d.setAttribute('stroke-width', cs.strokeWidth); }
    });
    clone.setAttribute('x', r1(r.left)); clone.setAttribute('y', r1(r.top + scrollY));
    clone.setAttribute('width', r1(r.width)); clone.setAttribute('height', r1(r.height));
    clone.setAttribute('id', (el.closest('.brand') ? 'Logo' : el.classList.contains('deco') ? 'Dekorace' : 'Ikona') + (op < 1 ? `|o=${r1(op * 100) / 100}` : ''));
    if (op < 1) clone.setAttribute('opacity', r1(op * 100) / 100);
    ['aria-hidden', 'focusable'].forEach((a) => clone.removeAttribute(a));
    out.push(clone.outerHTML.replace(/ xmlns="[^"]*"/, ''));
  }

  // Fotka: ořez podle object-fit/object-position, černobílá + násobení barvou pozadí jako na webu
  function fotka(el, cs, r, op) {
    if (!el.complete || !el.naturalWidth) return;
    const scale = 1.5, cw = Math.round(r.width * scale), ch = Math.round(r.height * scale);
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
    const ctx = cv.getContext('2d');
    const nw = el.naturalWidth, nh = el.naturalHeight;
    const k = Math.max(cw / nw, ch / nh);
    const [px1, py1] = (cs.objectPosition || '50% 50%').split(' ').map((v) => parseFloat(v) / 100);
    const dw = nw * k, dh = nh * k;
    const dx = (cw - dw) * (isNaN(px1) ? 0.5 : px1), dy = (ch - dh) * (isNaN(py1) ? 0.5 : py1);
    ctx.fillStyle = cs.mixBlendMode === 'multiply' ? bgOf(el) : '#FFFFFF';
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = cs.mixBlendMode === 'multiply' ? 'multiply' : 'source-over';
    ctx.filter = cs.filter && cs.filter !== 'none' ? cs.filter : 'none';
    ctx.drawImage(el, dx, dy, dw, dh);
    const data = cv.toDataURL('image/jpeg', 0.86);
    const rr = radii(cs, r.width, r.height);
    const id = 'f' + clipN++;
    defs.push(`<clipPath id="${id}"><path d="${rrPath(r.left, r.top + scrollY, r.width, r.height, rr)}"/></clipPath>`);
    out.push(`<g id="Fotka${op < 1 ? `|o=${r1(op * 100) / 100}` : ''}" clip-path="url(#${id})"><image x="${r1(r.left)}" y="${r1(r.top + scrollY)}" width="${r1(r.width)}" height="${r1(r.height)}" preserveAspectRatio="none" href="${data}"/></g>`);
  }

  // Text: řádky z obdélníků jednotlivých znaků
  const styleCache = new Map();
  const st = (e) => {
    if (styleCache.has(e)) return styleCache.get(e);
    const cs = getComputedStyle(e);
    const c = color(cs.color) || { hex: '#000000', a: 1 };
    const s = { size: px(cs.fontSize), w: Number(cs.fontWeight) || 400, i: cs.fontStyle === 'italic', u: /underline/.test(cs.textDecorationLine), col: c.hex, a: c.a,
      tt: cs.textTransform, ls: cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing) };
    styleCache.set(e, s);
    return s;
  };
  function vlastniText(el) {
    const runs = [];
    (function rec(e) {
      for (const n of e.childNodes) {
        if (n.nodeType === 3) runs.push(n);
        else if (n.nodeType === 1) {
          if (n.namespaceURI === SVGNS || n.tagName === 'IMG') continue;
          const c = getComputedStyle(n);
          if (c.display === 'none') continue;
          if (n.tagName === 'BR') { runs.push('BR'); continue; }
          if (c.display === 'inline') rec(n);
        }
      }
    })(el);
    return runs.some((n) => n !== 'BR' && /\S/.test(n.data)) ? runs : null;
  }
  function text(el, cs, runs, op) {
    const range = document.createRange();
    const lines = [];
    let cur = null, hard = false;
    const nova = () => { cur = { chars: [], top: 0 }; lines.push(cur); };
    for (const n of runs) {
      if (n === 'BR') { if (cur) cur.br = true; hard = true; continue; }
      const s = st(n.parentElement);
      for (let i = 0; i < n.data.length; i++) {
        range.setStart(n, i); range.setEnd(n, i + 1);
        const rects = range.getClientRects();
        if (!rects.length) continue;
        const rc = rects[0];
        if (rc.width === 0 && /\s/.test(n.data[i])) continue;
        if (!cur || hard || rc.top > cur.top + s.size * 0.6) { if (cur && hard) cur.br = true; nova(); cur.top = rc.top; cur.h = rc.height; cur.left = rc.left; hard = false; }
        let ch = n.data[i];
        if (s.tt === 'uppercase') ch = ch.toUpperCase();
        if (/[\t\n\r ]/.test(ch)) ch = ' ';
        cur.chars.push({ ch, s, x: rc.left });
      }
    }
    if (!lines.length) return;
    const L = cs.lineHeight === 'normal' ? st(el).size * 1.25 : px(cs.lineHeight);
    const pad = ['Left', 'Right'].map((k) => px(cs['padding' + k]) + px(cs['border' + k + 'Width']));
    const r = el.getBoundingClientRect();
    const cx = r.left + pad[0], cw = r.width - pad[0] - pad[1];
    const first = lines[0];
    const top = first.top - (L - first.h) / 2 + scrollY;
    const align = /center/.test(cs.textAlign) ? 'C' : /right|end/.test(cs.textAlign) ? 'R' : 'L';
    const parts = [];
    lines.forEach((ln, li) => {
      // ořezat mezery na krajích řádku
      while (ln.chars.length && ln.chars[0].ch === ' ') ln.chars.shift();
      while (ln.chars.length && ln.chars[ln.chars.length - 1].ch === ' ') ln.chars.pop();
      if (!ln.chars.length) return;
      const str = ln.chars.map((c) => c.ch).join('');
      const next = lines[li + 1];
      const j = !next ? '0' : ln.br ? 'n' : /[-–/]$/.test(str) ? '0' : 's';
      const tokens = [];
      let a = 0;
      for (let k = 1; k <= ln.chars.length; k++) {
        const p = ln.chars[a].s, q = ln.chars[k] && ln.chars[k].s;
        if (!q || q.w !== p.w || q.i !== p.i || q.u !== p.u || q.col !== p.col || q.size !== p.size) {
          tokens.push({ from: a, to: k, s: p });
          a = k;
        }
      }
      const base = (ln.top + scrollY) + (L - ln.h) / 2 - (L - ln.h) / 2; // horní hrana znaků
      const baseline = base + ln.h * 0.78;
      const runsStr = tokens.map((t) => `${t.s.w}${t.s.i ? 'i' : ''}${t.s.u ? 'u' : ''}:${t.from}-${t.to}`).join(';');
      const tsp = tokens.map((t) => {
        const s = t.s;
        return `<tspan font-size="${s.size}" font-weight="${s.w}"${s.i ? ' font-style="italic"' : ''} fill="${s.col}"${s.a < 1 ? ` fill-opacity="${r1(s.a * 100) / 100}"` : ''}${s.u ? ' text-decoration="underline"' : ''}>${esc(str.slice(t.from, t.to))}</tspan>`;
      }).join('');
      const s0 = ln.chars[0].s;
      parts.push(`<text id="${esc(`↳|${j}|${r1(ln.chars[0].x)}|${runsStr}`)}" x="${r1(ln.chars[0].x)}" y="${r1(baseline)}" font-family="Figtree" font-size="${s0.size}" letter-spacing="${r1(s0.ls)}" xml:space="preserve">${tsp}</text>`);
    });
    if (!parts.length) return;
    const nahled = lines.map((l) => l.chars.map((c) => c.ch).join('')).join(' ').slice(0, 40).trim();
    out.push(`<g id="${esc(`¶|${r1(cx)}|${r1(top)}|${r1(cw)}|${r1(L)}|${align}|${r1(st(el).ls)}|${r1(op * 100) / 100}|${nahled}`)}">${parts.join('')}</g>`);
  }

  const SEKCE = 'body > header, body > footer, main > *, .soon, body > table';
  function walk(el, op) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    const o = op * Number(cs.opacity);
    if (o < 0.02) return;
    const r = el.getBoundingClientRect();
    if (cs.clip && /rect\(0px,? 0px,? 0px,? 0px\)/.test(cs.clip)) return;
    if (r.width <= 1 && r.height <= 1 && cs.overflow !== 'visible') return;
    if (el.namespaceURI === SVGNS) { if (r.width > 0) ikona(el, r, o); return; }
    if (el.tagName === 'IMG') { fotka(el, cs, r, o); return; }
    const sekce = el.matches(SEKCE);
    if (sekce) {
      const h = el.querySelector('h1, h2, .brand__name');
      out.push(`<g id="${esc('Sekce · ' + (el.tagName === 'HEADER' ? 'Hlavička' : el.tagName === 'FOOTER' ? 'Patička' : (h ? h.textContent.trim().replace(/\s+/g, ' ').slice(0, 40) : nazev(el))))}">`);
    }
    if (cs.display !== 'inline' && el !== document.body && r.width >= 1 && r.height >= 1) box(el, cs, r, o);
    else if (color(cs.backgroundColor) && color(cs.backgroundColor).a > 0) {
      for (const rc of el.getClientRects()) box(el, cs, rc, o);
    }
    const clip = cs.display !== 'inline' && el.children.length && (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') && el !== document.body && el !== document.documentElement;
    if (clip) {
      const id = 'c' + clipN++;
      defs.push(`<clipPath id="${id}"><path d="${rrPath(r.left, r.top + scrollY, r.width, r.height, radii(cs, r.width, r.height))}"/></clipPath>`);
      out.push(`<g id="Ořez · ${esc(nazev(el))}" clip-path="url(#${id})">`);
    }
    if (cs.display !== 'inline') { const runs = vlastniText(el); if (runs) text(el, cs, runs, o); }
    for (const ch of el.children) walk(ch, o);
    if (clip) out.push('</g>');
    if (sekce) out.push('</g>');
  }

  const bodyBg = color(getComputedStyle(document.body).backgroundColor) || { hex: '#FFFFFF' };
  walk(document.body, 1);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs.join('')}</defs><rect id="Pozadí stránky" width="${W}" height="${H}" fill="${bodyBg.hex}"/>${out.join('')}</svg>`;
}

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright-core'); } catch { pw = require(path.resolve(root, '../bannerovna/node_modules/playwright-core')); }
const browser = await pw.chromium.launch({ channel: 'chrome' });
const jen = process.argv[3] ? new RegExp(process.argv[3]) : null;
for (const u of ULOHY) {
  if (jen && !jen.test(u.name)) continue;
  const page = await browser.newPage({ viewport: { width: u.w, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(u.url, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}' });
  await page.evaluate(async () => { document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; }); await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
  const svg = await page.evaluate(exportuj);
  fs.writeFileSync(path.join(outDir, u.name + '.svg'), svg);
  console.log(u.name, Math.round(svg.length / 1024) + ' kB');
  await page.close();
}
await browser.close();
