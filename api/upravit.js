// Vercel Serverless Function: správa webu (admin na /admin/, skript assets/js/admin.js).
// Zveřejnění = jeden commit do GitHubu → Vercel web sám znovu sestaví a nasadí (obvykle do minuty).
//
// Proměnné prostředí (Vercel → Settings → Environment Variables):
//   UPRAVY_HESLO          heslo do správy webu (dostane ho klient)
//   UPRAVY_GITHUB_TOKEN   GitHub fine-grained token jen pro repozitář webu: Contents Read and write, Commit statuses Read
//   UPRAVY_REPO           volitelně „vlastník/repo“ (výchozí podle Vercelu, jinak martindragusinec-glitch/kl-poradna)
//   UPRAVY_VETEV          volitelně větev (výchozí main)
// Lokálně (tools/serve.cjs) běží s UPRAVY_LOKALNE=1: zapisuje přímo do src/, přestaví dist/ a historii drží v paměti.
//
// GET  ?akce=stav[&sha=…]  přihlášení + stav nasazení commitu
// GET  ?akce=historie      posledních 20 změn webu
// POST ?akce=prihlasit     { heslo }
// POST ?akce=odhlasit
// POST ?akce=ulozit        { zmeny: [{ k, pred, po }], operace: [{ typ: "pridat", id, za, slug } | { typ: "smazat", polozka }] }
//                          k = "uvod:3" (text), "uvod:@title" / "uvod:@description" (Google), "novy-<id>-<n>" (text nové položky)
// POST ?akce=vratit        { sha }  vrátí jednu dřívější změnu zpět

import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { V_PRIPRAVE } from '../stav-webu.js';

// Hodnoty vložené do Vercelu často nesou mezeru, konec řádku nebo uvozovky navíc; diakritika může přijít rozložená (NFD)
const cisti = (s) => String(s ?? '').normalize('NFC').trim().replace(/^(["'])(.*)\1$/s, '$2');
const HESLO = cisti(process.env.UPRAVY_HESLO);
const TOKEN = cisti(process.env.UPRAVY_GITHUB_TOKEN);
const LOKALNE = process.env.UPRAVY_LOKALNE === '1';
const REPO = process.env.UPRAVY_REPO
  || (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}` : 'martindragusinec-glitch/kl-poradna');
const VETEV = process.env.UPRAVY_VETEV || 'main';
const COOKIE = 'rnd_upravy';
const PLATNOST_S = 60 * 60 * 24 * 30;
const STRANKY = ['uvod', 's-cim-pomahame', 'sluzby', 'jak-to-funguje', 'caste-dotazy', 'o-nas', 'kontakt',
  'ochrana-osobnich-udaju', 'pristupnost', 'dekujeme', '404'];
const NAZVY = { layout: 'Patička', uvod: 'Úvod', 's-cim-pomahame': 'S čím pomáháme', sluzby: 'Naše služby',
  'jak-to-funguje': 'Jak to funguje', 'caste-dotazy': 'Časté dotazy', 'o-nas': 'O nás', kontakt: 'Kontakt',
  'ochrana-osobnich-udaju': 'Ochrana osobních údajů', pristupnost: 'Přístupnost', dekujeme: 'Děkujeme', 404: 'Stránka nenalezena' };
const KLIC = /^(layout|[a-z0-9-]+):(\d+|@title|@description)$|^novy-[a-z0-9]{1,12}-\d{1,3}$/;
const DATA = 'Upravy-Data: ';

/* ---------- Přihlášení (podepsaná cookie, změna hesla zneplatní všechna přihlášení) ---------- */
const tajemstvi = () => crypto.createHash('sha256').update('upravy|' + HESLO + '|' + TOKEN).digest();
const podpis = (exp) => crypto.createHmac('sha256', tajemstvi()).update(String(exp)).digest('base64url');
// Vrací expiraci přihlášení (sekundy), nebo false
function prihlasen(req) {
  const m = String(req.headers.cookie || '').match(new RegExp(COOKIE + '=(\\d+)\\.([\\w-]+)'));
  if (!m || Number(m[1]) < Date.now() / 1000) return false;
  const a = Buffer.from(m[2]), b = Buffer.from(podpis(m[1]));
  return a.length === b.length && crypto.timingSafeEqual(a, b) && Number(m[1]);
}
// Druhá cookie (rnd_nahled, celý web): middleware.js podle ní pustí přihlášené na web, i když je „v přípravě“
const nahled = (exp, maxAge) => `rnd_nahled=${exp ? `${exp}.${crypto.createHmac('sha256', tajemstvi()).update('nahled|' + exp).digest('base64url')}` : ''}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
function cookie(res, exp, maxAge) {
  res.setHeader('Set-Cookie', [
    `${COOKIE}=${exp ? `${exp}.${podpis(exp)}` : ''}; Path=/api/upravit; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`,
    nahled(exp, maxAge),
  ]);
}
function hesloSedi(zadane) {
  const a = crypto.createHash('sha256').update(cisti(zadane)).digest();
  const b = crypto.createHash('sha256').update(HESLO).digest();
  return HESLO.length > 0 && crypto.timingSafeEqual(a, b);
}

/* ---------- HTML: text pro porovnání a čištění nového obsahu ---------- */
const ENT = { nbsp: '\u00a0', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', hellip: '…', bdquo: '„', ldquo: '“', rdquo: '”', shy: '' };
const decode = (s) => s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENT[e.toLowerCase()] ?? m));
const holyText = (html) => decode(html.replace(/<[^>]*>/g, '')).replace(/[\s\u00a0]+/g, ' ').trim();
const escText = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\u00a0/g, '&nbsp;');
const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const zkratit = (s, n = 60) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

// Odkazy z webu (/kontakt/#formular) vrací zpět na zástupné značky zdrojů ({{link:kontakt}}#formular)
function odkaz(href) {
  const h = decode(href).trim();
  if (!h || h.includes('{{') || h.includes('}}')) return null;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(h)) return h;
  if (/^#[\w-]+$/.test(h)) return h;
  const m = h.match(/^\/(?:([a-z0-9-]+)\/)?(#[\w-]+)?$/);
  if (m && (!m[1] || STRANKY.includes(m[1]))) return `{{link:${m[1] || 'uvod'}}}${m[2] || ''}`;
  return null;
}
const naWeb = (html) => html.replace(/\{\{link:([\w-]+)\}\}/g, (m, s) => (s === 'uvod' ? '/' : `/${s}/`));

// Česká typografie: k, s, v, z, o, u, a, i nenechávat na konci řádku
const nedelitelne = (t, zacatek) => t.replace(/(?<![^\s(„"])([ksvzouaiKSVZOUAI]) (?=\S)/g, (m, c, off) => (off === 0 && !zacatek ? m : c + '\u00a0'));

const POVOLENE = { strong: 'strong', b: 'strong', em: 'em', i: 'em', br: 'br', a: 'a', span: 'span' };
export function vycistit(html) {
  const out = [], zasobnik = [];
  html = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const re = /<!--[\s\S]*?-->|<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g;
  let pos = 0, m, predMezera = true;
  const text = (t) => {
    if (!t) return;
    t = decode(t).replace(/\{\{|\}\}/g, (x) => x[0]).replace(/[ \r\n\t]{2,}|[\r\n\t]/g, ' ');
    out.push(escText(nedelitelne(t, predMezera)));
    predMezera = /[\s\u00a0]$/.test(t);
  };
  while ((m = re.exec(html))) {
    text(html.slice(pos, m.index));
    pos = re.lastIndex;
    if (!m[2]) continue;
    const tag = POVOLENE[m[2].toLowerCase()];
    if (!tag) continue;
    if (m[1]) {
      const i = zasobnik.lastIndexOf(tag);
      if (i < 0) continue;
      while (zasobnik.length > i) { const t = zasobnik.pop(); if (t) out.push(`</${t}>`); }
      continue;
    }
    if (tag === 'br') { out.push('<br>'); predMezera = true; continue; }
    if (tag === 'a') {
      const href = (m[3].match(/href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i) || [])[2] ?? '';
      const cil = odkaz(href);
      zasobnik.push(cil ? 'a' : '');
      if (cil) out.push(`<a href="${escAttr(cil)}">`);
      continue;
    }
    if (tag === 'span') {
      const todo = /class\s*=\s*["'][^"']*\btodo\b/i.test(m[3]);
      zasobnik.push('span');
      out.push(todo ? '<span class="todo">' : '<span>');
      continue;
    }
    zasobnik.push(tag);
    out.push(`<${tag}>`);
  }
  text(html.slice(pos));
  while (zasobnik.length) { const t = zasobnik.pop(); if (t) out.push(`</${t}>`); }
  let s = out.join('');
  // Doplněné „[doplnit]“ už není úkol: zrušit šrafování
  s = s.replace(/<span class="todo">([^<]*)<\/span>/g, (x, t) => (/^\s*\[.*\]\s*$/.test(decode(t)) ? x : t));
  // Prázdné značky a koncové zalomení řádku, které přidává prohlížeč
  for (let i = 0; i < 3; i++) s = s.replace(/<(strong|em|span|a)(?: [^>]*)?>(\s|&nbsp;)*<\/\1>/g, '$2');
  return s.replace(/^(\s|<br>)+|(\s|<br>)+$/g, '');
}
const cistyText = (s, max) => zkratit(holyText(String(s)), max);

/* ---------- Zdroje: označené prvky, položky a údaje stránky ---------- */
function najdi(src, attr, hodnota) {
  const at = src.indexOf(` ${attr}="${hodnota}"`);
  if (at < 0) return null;
  const start = src.lastIndexOf('<', at);
  const tag = src.slice(start + 1, start + 20).match(/^[a-zA-Z0-9]+/)[0].toLowerCase();
  const innerStart = src.indexOf('>', at) + 1;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = innerStart;
  let depth = 1, m;
  while ((m = re.exec(src))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return { start, innerStart, innerEnd: m.index, end: re.lastIndex };
  }
  return null;
}
// Celý řádek s položkou (odsazení i konec řádku), aby po smazání nezůstal prázdný řádek
function radky(src, b) {
  const zacatek = src.lastIndexOf('\n', b.start - 1) + 1;
  const ciste = /^\s*$/.test(src.slice(zacatek, b.start));
  const konec = src[b.end] === '\n' ? b.end + 1 : b.end;
  return { from: ciste ? zacatek : b.start, to: ciste ? konec : b.end, odsazeni: ciste ? src.slice(zacatek, b.start) : '' };
}
const maxCislo = (src, re) => Math.max(0, ...[...src.matchAll(re)].map((m) => Number(m[1])));
const meta = (src) => JSON.parse(src.match(/^<!--meta (.*?) -->/s)[1]);
const nastavMeta = (src, data) => src.replace(/^<!--meta (.*?) -->/s, () => `<!--meta ${JSON.stringify(data)} -->`);
const soubor = (slug) => (slug === 'layout' ? 'src/layout.html' : `src/pages/${slug}.html`);
const popisPrvku = (src, b) => {
  const tag = src.slice(b.start + 1, b.start + 12).match(/^[a-z0-9]+/i)[0].toLowerCase();
  return { h1: 'Hlavní nadpis', h2: 'Nadpis', h3: 'Podnadpis', h4: 'Podnadpis', p: 'Odstavec', li: 'Položka', address: 'Adresa',
    label: 'Popisek', legend: 'Popisek', a: 'Odkaz', strong: 'Text', span: 'Text' }[tag] || 'Text';
};

/* ---------- Úložiště: GitHub (Vercel) nebo lokální soubory ---------- */
async function gh(cesta, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}${cesta}`, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'rada-na-dosah-sprava-webu', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(`GitHub ${r.status} ${cesta}`); e.status = r.status; e.data = data; throw e; }
  return data;
}
const github = {
  async hlava() { return (await gh(`/git/ref/heads/${VETEV}`)).object.sha; },
  async cti(sha, cesta) {
    const d = await gh(`/contents/${cesta}?ref=${sha}`);
    return Buffer.from(d.content, 'base64').toString('utf8');
  },
  async zapis(sha, soubory, zprava) {
    const strom = (await gh(`/git/commits/${sha}`)).tree.sha;
    const tree = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: strom,
      tree: Object.entries(soubory).map(([path, content]) => ({ path, mode: '100644', type: 'blob', content })) }) });
    const commit = await gh('/git/commits', { method: 'POST', body: JSON.stringify({ message: zprava, tree: tree.sha, parents: [sha] }) });
    await gh(`/git/refs/heads/${VETEV}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
    return commit.sha;
  },
  async nasazeni(sha) {
    const d = await gh(`/commits/${sha}/status`);
    return d.total_count ? d.state : 'pending';
  },
  async historie() {
    const list = await gh(`/commits?sha=${VETEV}&path=src&per_page=20`);
    return list.map((c) => ({ sha: c.sha, datum: c.commit.author.date, zprava: c.commit.message }));
  },
  async zprava(sha) { return (await gh(`/git/commits/${sha}`)).message; },
};
const lokalne = {
  log: [],
  async init() {
    if (this.root) return;
    const path = await import('node:path');
    const url = await import('node:url');
    this.fs = await import('node:fs');
    this.path = path;
    this.root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
  },
  async hlava() { await this.init(); return 'lokalne'; },
  async cti(sha, cesta) { return this.fs.readFileSync(this.path.join(this.root, cesta), 'utf8'); },
  async zapis(sha, soubory, zprava) {
    for (const [cesta, obsah] of Object.entries(soubory)) this.fs.writeFileSync(this.path.join(this.root, cesta), obsah);
    const { execFileSync } = await import('node:child_process');
    execFileSync('python3', ['tools/build.py'], { cwd: this.root });
    const novy = 'lokalne-' + Date.now();
    this.log.unshift({ sha: novy, datum: new Date().toISOString(), zprava });
    return novy;
  },
  async nasazeni() { return 'success'; },
  async historie() { return this.log.slice(0, 20); },
  async zprava(sha) { return (this.log.find((c) => c.sha === sha) || {}).zprava || ''; },
};

/* ---------- Provedení změn (jeden commit) ---------- */
// vstup.zmeny: { k, pred, po } od editoru, nebo { k, ocekavano, po, surove: true } při vracení
// vstup.operace: pridat / smazat (editor), vlozit (vracení smazané položky)
async function provest(vstup, uloziste, nadpis) {
  const sha = await uloziste.hlava();
  const soubory = {};
  const cti = async (slug) => (soubory[soubor(slug)] ??= await uloziste.cti(sha, soubor(slug)));
  const zapis = (slug, src) => { soubory[soubor(slug)] = src; };
  const konflikty = [], log = { zmeny: [], operace: [] }, html = {}, nove = {}, souhrn = [];
  const docasne = {}; // novy-<id>-<n> → { slug, k, polozka }

  for (const o of vstup.operace || []) {
    if (o.typ === 'pridat') {
      const za = o.za.startsWith('novy-') ? nove[o.za] : o.za;
      const slug = String(za || '').split(':')[0];
      if (!za || !STRANKY.includes(slug)) { konflikty.push(o.za); continue; }
      let src = await cti(slug);
      const b = najdi(src, 'data-polozka', za);
      if (!b) { konflikty.push(o.za); continue; }
      const r = radky(src, b);
      let k = maxCislo(src, new RegExp(`data-k="${slug}:(\\d+)"`, 'g'));
      const p = maxCislo(src, new RegExp(`data-polozka="${slug}:p(\\d+)"`, 'g')) + 1;
      const polozka = `${slug}:p${p}`;
      let n = 0;
      const kopie = src.slice(b.start, b.end)
        .replace(/ data-k="[^"]+"/g, () => { const nk = `${slug}:${++k}`; docasne[`novy-${o.id}-${n++}`] = { slug, k: nk, polozka }; return ` data-k="${nk}"`; })
        .replace(/ data-polozka="[^"]+"/, ` data-polozka="${polozka}"`)
        .replace(/^(<[a-z]+[^>]*?) id="[^"]*"/, `$1 id="otazka-${p}"`);
      const vlozit = r.odsazeni ? `${r.odsazeni}${kopie}\n` : kopie;
      src = src.slice(0, r.to) + vlozit + src.slice(r.to);
      zapis(slug, src);
      nove[`novy-${o.id}`] = polozka;
      log.operace.push({ typ: 'pridat', polozka });
      souhrn.push(`${NAZVY[slug]}: nová otázka`);
      docasne[`novy-${o.id}-0`].souhrn = souhrn.length - 1;
    } else if (o.typ === 'smazat' || o.typ === 'vlozit') {
      const slug = String(o.polozka || o.za || o.pred || '').split(':')[0];
      if (!STRANKY.includes(slug)) { konflikty.push(o.polozka || 'vlozit'); continue; }
      let src = await cti(slug);
      if (o.typ === 'smazat') {
        const b = najdi(src, 'data-polozka', o.polozka);
        if (!b) { konflikty.push(o.polozka); continue; }
        const r = radky(src, b);
        const vsechny = [...src.matchAll(/ data-polozka="([^"]+)"/g)].map((m) => ({ k: m[1], at: m.index }));
        const za = vsechny.filter((x) => x.at < b.start).pop();
        const pred = vsechny.find((x) => x.at > b.end);
        log.operace.push({ typ: 'smazat', polozka: o.polozka, blok: src.slice(b.start, b.end), za: za && za.k, pred: pred && pred.k });
        const otazka = (src.slice(b.start, b.end).match(/data-k="[^"]+">([\s\S]*?)<\//) || [])[1] || '';
        souhrn.push(`${NAZVY[slug]}: smazaná otázka „${zkratit(holyText(otazka), 50)}“`);
        zapis(slug, src.slice(0, r.from) + src.slice(r.to));
      } else {
        const kotva = (o.za && najdi(src, 'data-polozka', o.za)) || (o.pred && najdi(src, 'data-polozka', o.pred));
        if (!kotva) { konflikty.push(o.za || o.pred); continue; }
        const r = radky(src, kotva);
        const kus = r.odsazeni ? `${r.odsazeni}${o.blok}\n` : o.blok;
        const at = o.za && najdi(src, 'data-polozka', o.za) ? r.to : r.from;
        zapis(slug, src.slice(0, at) + kus + src.slice(at));
        log.operace.push({ typ: 'pridat', polozka: (o.blok.match(/data-polozka="([^"]+)"/) || [])[1] });
        souhrn.push(`${NAZVY[slug]}: vrácená položka`);
      }
    }
  }

  for (const z of vstup.zmeny || []) {
    const tmp = docasne[z.k];
    if (z.k.startsWith('novy-') && !tmp) { konflikty.push(z.k); continue; }
    const k = tmp ? tmp.k : z.k;
    const [slug, cast] = k.split(':');
    let src = await cti(slug);
    if (cast[0] === '@') {
      if (slug === 'layout') { konflikty.push(z.k); continue; }
      const pole = cast.slice(1);
      const data = meta(src);
      const ted = String(data[pole] ?? '');
      if (ted !== String(z.surove ? z.ocekavano : z.pred).trim()) { konflikty.push(z.k); continue; }
      const nove_ = cistyText(z.po, pole === 'title' ? 120 : 320);
      if (!nove_) { konflikty.push(z.k); continue; }
      data[pole] = nove_;
      zapis(slug, nastavMeta(src, data));
      log.zmeny.push({ k, staro: ted, novo: nove_ });
      souhrn.push(`${NAZVY[slug]} · ${pole === 'title' ? 'název pro Google' : 'popis pro Google'}: „${zkratit(nove_, 50)}“`);
      continue;
    }
    const b = najdi(src, 'data-k', k);
    if (!b) { konflikty.push(z.k); continue; }
    const ted = src.slice(b.innerStart, b.innerEnd);
    const sedi = tmp || (z.surove ? holyText(ted) === holyText(z.ocekavano) : holyText(ted) === holyText(escText(String(z.pred))));
    if (!sedi) { konflikty.push(z.k); continue; }
    const novy = z.surove ? String(z.po) : vycistit(String(z.po));
    if (!holyText(novy)) { konflikty.push(z.k); continue; }
    zapis(slug, src.slice(0, b.innerStart) + novy + src.slice(b.innerEnd));
    log.zmeny.push(tmp ? { k, staro: ted, novo: novy, polozka: tmp.polozka } : { k, staro: ted, novo: novy });
    html[z.k] = naWeb(novy);
    if (tmp) nove[z.k] = k;
    if (tmp && tmp.souhrn != null) souhrn[tmp.souhrn] = `${NAZVY[slug]}: nová otázka „${zkratit(holyText(novy), 50)}“`;
    if (!tmp) souhrn.push(`${NAZVY[slug]} · ${popisPrvku(src, b)}: „${zkratit(holyText(novy), 50)}“`);
  }

  if (konflikty.length) return { status: 409, body: { ok: false, error: 'konflikt', klice: konflikty } };
  if (!Object.keys(soubory).length) return { status: 400, body: { ok: false, error: 'prazdne' } };

  const stranky = [...new Set(Object.keys(soubory).map((c) => NAZVY[c.match(/([\w-]+)\.html$/)[1]]))];
  const prvni = nadpis || `Úprava webu: ${stranky.join(', ')}`;
  const data = zlib.deflateRawSync(Buffer.from(JSON.stringify(log))).toString('base64url');
  const zprava = `${prvni}\n\n${souhrn.slice(0, 12).map((s) => '- ' + s).join('\n')}${souhrn.length > 12 ? `\n- … a ${souhrn.length - 12} dalších` : ''}\n\n${DATA}${data}`;
  const novySha = await uloziste.zapis(sha, soubory, zprava);
  return { status: 200, body: { ok: true, sha: novySha, html, nove } };
}

async function sOpakovanim(fn) {
  for (let pokus = 0; ; pokus++) {
    try { return await fn(); } catch (e) {
      // Mezitím přibyl jiný commit (ref se neposunul): zkusit znovu nad novou verzí
      if (e.status === 422 && pokus < 2) continue;
      throw e;
    }
  }
}

function rozbal(zprava) {
  const i = zprava.lastIndexOf(DATA);
  if (i < 0) return null;
  try { return JSON.parse(zlib.inflateRawSync(Buffer.from(zprava.slice(i + DATA.length).trim(), 'base64url')).toString('utf8')); } catch { return null; }
}

async function vratit(sha, uloziste) {
  const zprava = await uloziste.zprava(sha);
  const data = zprava && rozbal(zprava);
  if (!data) return { status: 400, body: { ok: false, error: 'nelze' } };
  const smazane = new Set(data.operace.filter((o) => o.typ === 'pridat').map((o) => o.polozka));
  const vstup = {
    operace: data.operace.slice().reverse().map((o) => (o.typ === 'pridat'
      ? { typ: 'smazat', polozka: o.polozka }
      : { typ: 'vlozit', blok: o.blok, za: o.za, pred: o.pred, polozka: o.polozka })),
    zmeny: data.zmeny.filter((z) => !smazane.has(z.polozka)).map((z) => ({ k: z.k, ocekavano: z.novo, po: z.staro, surove: true })),
  };
  return provest(vstup, uloziste, `Vrácení změny: ${zprava.split('\n')[0]}`);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  const akce = String(q.akce || '');
  const uloziste = LOKALNE ? lokalne : github;
  if (!HESLO || (!LOKALNE && !TOKEN)) return res.status(503).json({ ok: false, error: 'nenastaveno' });
  if (req.method === 'POST' && req.headers['x-upravy'] !== '1') return res.status(403).json({ ok: false, error: 'hlavicka' });

  try {
    if (req.method === 'GET') {
      if (!prihlasen(req)) return res.status(401).json({ ok: false, prihlasen: false });
      if (akce === 'stav') {
        const sha = String(q.sha || '');
        const nasazeni = /^[\w-]{6,64}$/.test(sha) ? await uloziste.nasazeni(sha).catch(() => 'nezname') : null;
        const exp = prihlasen(req);
        res.setHeader('Set-Cookie', nahled(exp, exp - Math.floor(Date.now() / 1000)));
        return res.status(200).json({ ok: true, prihlasen: true, nasazeni, vPriprave: V_PRIPRAVE });
      }
      if (akce === 'historie') {
        const list = await uloziste.historie();
        return res.status(200).json({ ok: true, historie: list.map((c) => {
          const radek = c.zprava.split('\n');
          const body = radek.slice(2).filter((r) => r.startsWith('- ')).map((r) => r.slice(2));
          return { sha: c.sha, datum: c.datum, nadpis: radek[0], body, vratit: c.zprava.includes(DATA) };
        }) });
      }
      return res.status(404).json({ ok: false, error: 'akce' });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ ok: false, error: 'metoda' }); }
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    if (akce === 'prihlasit') {
      if (!hesloSedi(body.heslo || '')) {
        await new Promise((r) => setTimeout(r, 1200));
        return res.status(401).json({ ok: false, error: 'heslo' });
      }
      const exp = Math.floor(Date.now() / 1000) + PLATNOST_S;
      cookie(res, exp, PLATNOST_S);
      return res.status(200).json({ ok: true });
    }
    if (akce === 'odhlasit') { cookie(res, 0, 0); return res.status(200).json({ ok: true }); }
    if (!prihlasen(req)) return res.status(401).json({ ok: false, error: 'prihlaseni' });

    if (akce === 'ulozit') {
      const zmeny = Array.isArray(body.zmeny) ? body.zmeny : [];
      const operace = Array.isArray(body.operace) ? body.operace : [];
      const platne = zmeny.length + operace.length > 0 && zmeny.length <= 300 && operace.length <= 30
        && zmeny.every((z) => z && typeof z.k === 'string' && KLIC.test(z.k) && (z.k.startsWith('novy-') || z.k.startsWith('layout:') || STRANKY.includes(z.k.split(':')[0]))
          && typeof z.po === 'string' && z.po.length <= 8000 && typeof z.pred === 'string')
        && operace.every((o) => o && ((o.typ === 'pridat' && /^[a-z0-9]{1,12}$/.test(o.id) && typeof o.za === 'string')
          || (o.typ === 'smazat' && /^[a-z0-9-]+:p\d+$/.test(o.polozka))));
      if (!platne) return res.status(400).json({ ok: false, error: 'data' });
      const r = await sOpakovanim(() => provest({ zmeny, operace }, uloziste));
      return res.status(r.status).json(r.body);
    }
    if (akce === 'vratit') {
      if (!/^[\w-]{6,64}$/.test(String(body.sha || ''))) return res.status(400).json({ ok: false, error: 'data' });
      const r = await sOpakovanim(() => vratit(body.sha, uloziste));
      return res.status(r.status).json(r.body);
    }
    return res.status(404).json({ ok: false, error: 'akce' });
  } catch (e) {
    console.error('upravit', e.message, e.data || '');
    return res.status(502).json({ ok: false, error: 'uloziste' });
  }
}
