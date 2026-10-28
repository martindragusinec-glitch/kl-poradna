// Postprocess po importu SVG z tools/figma/export-svg.mjs (spouští se přes use_figma, kód se vloží celý).
// Nastav PAGE_ID a JEN (klíče stránek ke zpracování, prázdné = všechny rámy na stránce).
const PAGE_ID = '__PAGE__';
const JEN = __JEN__;
const NAZVY = { 'uvod': 'Úvod', 's-cim-pomahame': 'S čím pomáháme', 'sluzby': 'Naše služby', 'jak-to-funguje': 'Jak to funguje', 'caste-dotazy': 'Časté dotazy', 'o-nas': 'O nás', 'kontakt': 'Kontakt', 'v-priprave': 'Web v přípravě', 'email-poptavka': 'E-mail · poptávka pro poradnu', 'email-potvrzeni': 'E-mail · potvrzení pro klienta' };
const PORADI = Object.keys(NAZVY);
const RE = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
const rez = (w, i) => { const b = RE[Math.min(900, Math.max(100, Math.round(w / 100) * 100))] || 'Regular'; return i ? (b === 'Regular' ? 'Italic' : b + ' Italic') : b; };

const page = await figma.getNodeByIdAsync(PAGE_ID);
await figma.setCurrentPageAsync(page);
for (const st of ['Regular', 'Medium', 'SemiBold', 'Bold', 'ExtraBold', 'Black', 'Italic', 'Medium Italic', 'Bold Italic', 'Black Italic']) await figma.loadFontAsync({ family: 'Figtree', style: st });

const col = await figma.variables.getVariableCollectionByIdAsync('VariableCollectionId:4:4');
const vars = await Promise.all(col.variableIds.map((id) => figma.variables.getVariableByIdAsync(id)));
const toHex = (c) => '#' + [c.r, c.g, c.b].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const VAR = {};
for (const v of vars) { const val = v.valuesByMode[col.defaultModeId]; if (val && typeof val === 'object' && 'r' in val && !VAR[toHex(val)]) VAR[toHex(val)] = v; }
const hex = (h) => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
// Navázání na proměnnou ztrácí průhlednost barvy, proto se vrací zpět
const bind = (paints) => paints.map((p) => { if (p.type !== 'SOLID') return p; const v = VAR[toHex(p.color)]; if (!v) return p; const b = figma.variables.setBoundVariableForPaint(p, 'color', v); return { ...b, opacity: p.opacity === undefined ? 1 : p.opacity }; });
const alfa = (paints, a) => paints.map((p) => ({ ...p, opacity: a }));

for (const n of page.children.filter((n) => n.name === 'test')) n.remove();
const klic = (n) => n.name.replace(/\.svg$/, '').replace(/-(desktop|mobil)$/, '');
const frames = page.children.filter((n) => n.type === 'FRAME' && (!JEN.length || JEN.includes(klic(n)) || JEN.some((k) => n.name.startsWith(NAZVY[k] || '§'))));
const stats = { frames: [], rects: 0, texts: 0, bound: 0 };

for (const fr of frames) {
  const base = fr.name.replace(/\.svg$/, '');
  if (/-(desktop|mobil)$/.test(base)) {
    const k = klic(fr);
    fr.name = (NAZVY[k] || k) + (k.startsWith('email') ? '' : base.endsWith('mobil') ? ' · mobil 390' : ' · desktop 1440');
  }
  fr.clipsContent = true;

  // 1) plochy → obdélníky se zaoblením, okraji a stínem
  for (const v of fr.findAll((n) => n.name.startsWith('▭'))) {
    const parts = v.name.split('|');
    const meta = Object.fromEntries(parts.slice(1).map((p) => [p[0], p.slice(2).split(',')]));
    const r = figma.createRectangle();
    const par = v.parent;
    par.insertChild(par.children.indexOf(v), r);
    r.name = parts[0].slice(2) || 'plocha';
    r.resize(Math.max(v.width, 0.01), Math.max(v.height, 0.01));
    r.x = v.x; r.y = v.y;
    if (meta.r) [r.topLeftRadius, r.topRightRadius, r.bottomRightRadius, r.bottomLeftRadius] = meta.r.map(Number);
    r.fills = meta.a ? alfa(bind(v.fills), Number(meta.a[0])) : bind(v.fills);
    if (meta.a) r.fills = alfa(r.fills, Number(meta.a[0]));
    r.opacity = meta.o ? Number(meta.o[0]) : 1;
    if (meta.b) {
      const [t, rr, b, l, h, a] = meta.b;
      r.strokes = bind([{ type: 'SOLID', color: hex(h), opacity: Number(a) }]);
      r.strokeAlign = 'INSIDE';
      if (t === rr && t === b && t === l) r.strokeWeight = Number(t);
      else { r.strokeTopWeight = Number(t); r.strokeRightWeight = Number(rr); r.strokeBottomWeight = Number(b); r.strokeLeftWeight = Number(l); }
    }
    if (meta.s) {
      const [x, y, blur, spread, h, a] = meta.s;
      r.effects = [{ type: 'DROP_SHADOW', color: { ...hex(h), a: Number(a) }, offset: { x: Number(x), y: Number(y) }, radius: Number(blur), spread: Number(spread), visible: true, blendMode: 'NORMAL' }];
    }
    v.remove();
    stats.rects++;
  }

  // 2) řádky odstavce → jedna textová vrstva se správným řezem
  for (const g of fr.findAll((n) => n.type === 'GROUP' && n.name.startsWith('¶'))) {
    const [, x, top, w, L, align, ls, op] = g.name.split('|');
    const lines = g.children.filter((n) => n.type === 'TEXT').sort((a, b) => (Math.abs(a.y - b.y) > 2 ? a.y - b.y : a.x - b.x));
    if (!lines.length) { g.remove(); continue; }
    let chars = '';
    const runs = [], segs = [];
    let lx0 = null;
    for (const ln of lines) {
      const [, j, lx, runStr] = ln.name.split('|');
      if (lx0 === null) lx0 = Number(lx);
      const off = chars.length;
      const toks = (runStr || '').split(';').map((t) => t.match(/^(\d+)(i?)(u?):(\d+)-(\d+)$/)).filter(Boolean);
      const sedi = toks.length && Number(toks[toks.length - 1][5]) === ln.characters.length;
      const imp = ln.getStyledTextSegments(['fills', 'fontSize', 'fontName']);
      if (sedi) toks.forEach((m) => runs.push({ s: off + Number(m[4]), e: off + Number(m[5]), w: Number(m[1]), i: !!m[2], u: !!m[3] }));
      else {
        const ws = toks.map((m) => Number(m[1]));
        const lo = ws.length ? Math.min(...ws) : 400, hi = ws.length ? Math.max(...ws) : 700;
        imp.forEach((s) => runs.push({ s: off + s.start, e: off + s.end, w: /Bold|Black/.test(s.fontName.style) ? hi : lo, i: /Italic/.test(s.fontName.style), u: false }));
      }
      imp.forEach((s) => segs.push({ s: off + s.start, e: off + s.end, fills: s.fills, size: s.fontSize }));
      chars += ln.characters + (j === 's' ? ' ' : j === 'n' ? '\n' : '');
    }
    chars = chars.replace(/[ \n]+$/, '');
    const t = figma.createText();
    const par = g.parent;
    par.insertChild(par.children.indexOf(g), t);
    t.fontName = { family: 'Figtree', style: rez(runs[0] ? runs[0].w : 400, runs[0] && runs[0].i) };
    t.characters = chars;
    t.fontSize = segs[0].size;
    t.lineHeight = { unit: 'PIXELS', value: Number(L) };
    t.letterSpacing = { unit: 'PIXELS', value: Number(ls) || 0 };
    const len = chars.length;
    for (const s of segs) { const e = Math.min(s.e, len); if (s.s < e) { t.setRangeFontSize(s.s, e, s.size); t.setRangeFills(s.s, e, bind(s.fills)); } }
    for (const r of runs) { const e = Math.min(r.e, len); if (r.s < e) { t.setRangeFontName(r.s, e, { family: 'Figtree', style: rez(r.w, r.i) }); if (r.u) t.setRangeTextDecoration(r.s, e, 'UNDERLINE'); } }
    t.textAlignHorizontal = align === 'C' ? 'CENTER' : align === 'R' ? 'RIGHT' : 'LEFT';
    t.name = chars.replace(/\s+/g, ' ').slice(0, 48);
    if (lines.length === 1 && !chars.includes('\n')) {
      t.textAutoResize = 'WIDTH_AND_HEIGHT';
      t.x = align === 'C' ? Number(x) + Number(w) / 2 - t.width / 2 : align === 'R' ? Number(x) + Number(w) - t.width : lx0;
    } else {
      t.textAutoResize = 'HEIGHT';
      t.resize(Math.max(Number(w), 10), t.height);
      t.x = Number(x);
    }
    t.y = Number(top);
    t.opacity = Number(op) || 1;
    g.remove();
    stats.texts++;
  }

  // průhlednost ikon a fotek uložená v názvu
  for (const n of fr.findAll((n) => /^(Ikona|Logo|Dekorace|Fotka)\|o=/.test(n.name))) { const [nm, o] = n.name.split('|o='); n.name = nm; n.opacity = Number(o); }

  // 3) barvy ikon, loga a pozadí na proměnné; skupiny sekcí a ořezů pojmenovat čitelně
  for (const n of fr.findAll((n) => n.type !== 'TEXT' && 'fills' in n)) {
    if (Array.isArray(n.fills) && n.fills.some((p) => p.type === 'SOLID' && VAR[toHex(p.color)])) { n.fills = bind(n.fills); stats.bound++; }
    if ('strokes' in n && Array.isArray(n.strokes) && n.strokes.some((p) => p.type === 'SOLID' && VAR[toHex(p.color)])) n.strokes = bind(n.strokes);
  }
  fr.fills = bind(fr.fills);
  stats.frames.push(fr.id + ' ' + fr.name);
}

// 4) rámy vedle sebe podle pořadí stránek
const all = page.children.filter((n) => n.type === 'FRAME');
const idx = (n) => { const k = PORADI.findIndex((p) => n.name.startsWith(NAZVY[p])); return (k < 0 ? 99 : k) * 2 + (/mobil/.test(n.name) ? 1 : 0); };
all.sort((a, b) => idx(a) - idx(b));
let xx = 0;
for (const n of all) { n.x = xx; n.y = 0; xx += n.width + 160; }
return stats;
