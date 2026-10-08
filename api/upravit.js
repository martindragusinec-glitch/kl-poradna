// Vercel Serverless Function: úpravy textů přímo na webu (editor assets/js/upravy.js).
// Uložená změna = commit do GitHubu → Vercel web sám znovu sestaví a nasadí (obvykle do minuty).
//
// Proměnné prostředí (Vercel → Settings → Environment Variables):
//   UPRAVY_HESLO          heslo pro úpravy (dostane ho klient)
//   UPRAVY_GITHUB_TOKEN   GitHub fine-grained token jen pro repozitář webu, oprávnění Contents: Read and write
//   UPRAVY_REPO           volitelně „vlastník/repo“ (výchozí podle Vercelu, jinak martindragusinec-glitch/kl-poradna)
//   UPRAVY_VETEV          volitelně větev (výchozí main)
// Lokálně (tools/serve.cjs) běží s UPRAVY_LOKALNE=1: zapisuje přímo do src/ a přestaví dist/.
//
// GET  ?akce=stav[&sha=…]  přihlášení + stav nasazení commitu
// POST ?akce=prihlasit     { heslo }
// POST ?akce=odhlasit
// POST ?akce=ulozit        { zmeny: [{ k: "uvod:3", pred: "původní text", po: "<nové> HTML" }] }

import crypto from 'node:crypto';

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
const NAZVY = { layout: 'patička', uvod: 'Úvod', 's-cim-pomahame': 'S čím pomáháme', sluzby: 'Naše služby',
  'jak-to-funguje': 'Jak to funguje', 'caste-dotazy': 'Časté dotazy', 'o-nas': 'O nás', kontakt: 'Kontakt',
  'ochrana-osobnich-udaju': 'Ochrana osobních údajů', pristupnost: 'Přístupnost', dekujeme: 'Děkujeme', 404: '404' };

/* ---------- Přihlášení (podepsaná cookie, heslo mění i podpis) ---------- */
const tajemstvi = () => crypto.createHash('sha256').update('upravy|' + HESLO + '|' + TOKEN).digest();
const podpis = (exp) => crypto.createHmac('sha256', tajemstvi()).update(String(exp)).digest('base64url');
function prihlasen(req) {
  const m = String(req.headers.cookie || '').match(new RegExp(COOKIE + '=(\\d+)\\.([\\w-]+)'));
  if (!m || Number(m[1]) < Date.now() / 1000) return false;
  const a = Buffer.from(m[2]), b = Buffer.from(podpis(m[1]));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function cookie(res, hodnota, maxAge) {
  res.setHeader('Set-Cookie', `${COOKIE}=${hodnota}; Path=/api/upravit; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`);
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

// Česká typografie: k, s, v, z, o, u, a, i na konci řádku nenechávat
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

/* ---------- Hledání označeného prvku ve zdroji ---------- */
function najdi(src, k) {
  const at = src.indexOf(` data-k="${k}"`);
  if (at < 0) return null;
  const lt = src.lastIndexOf('<', at);
  const tag = src.slice(lt + 1).match(/^[a-zA-Z0-9]+/)[0].toLowerCase();
  const start = src.indexOf('>', at) + 1;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi');
  re.lastIndex = start;
  let depth = 1, m;
  while ((m = re.exec(src))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return { start, end: m.index };
  }
  return null;
}
const soubor = (k) => (k.split(':')[0] === 'layout' ? 'src/layout.html' : `src/pages/${k.split(':')[0]}.html`);

/* ---------- Úložiště: GitHub (Vercel) nebo lokální soubory ---------- */
async function gh(cesta, opts = {}) {
  const r = await fetch(`https://api.github.com/repos/${REPO}${cesta}`, {
    ...opts,
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'rada-na-dosah-upravy', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
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
};
const lokalne = {
  root: null,
  async init() {
    const path = await import('node:path');
    const url = await import('node:url');
    this.root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
    this.fs = await import('node:fs');
    this.path = path;
  },
  async hlava() { await this.init(); return 'lokalne'; },
  async cti(sha, cesta) { return this.fs.readFileSync(this.path.join(this.root, cesta), 'utf8'); },
  async zapis(sha, soubory) {
    for (const [cesta, obsah] of Object.entries(soubory)) this.fs.writeFileSync(this.path.join(this.root, cesta), obsah);
    const { execFileSync } = await import('node:child_process');
    execFileSync('python3', ['tools/build.py'], { cwd: this.root });
    return 'lokalne-' + Date.now();
  },
  async nasazeni() { return 'success'; },
};

/* ---------- Uložení změn ---------- */
async function ulozit(zmeny, uloziste, pokus = 0) {
  const sha = await uloziste.hlava();
  const soubory = {}, konflikty = [], html = {};
  for (const z of zmeny) {
    const cesta = soubor(z.k);
    if (!(cesta in soubory)) soubory[cesta] = await uloziste.cti(sha, cesta);
    const src = soubory[cesta];
    const kde = najdi(src, z.k);
    if (!kde || holyText(src.slice(kde.start, kde.end)) !== holyText(escText(String(z.pred)))) { konflikty.push(z.k); continue; }
    const nove = vycistit(String(z.po));
    soubory[cesta] = src.slice(0, kde.start) + nove + src.slice(kde.end);
    html[z.k] = naWeb(nove);
  }
  if (konflikty.length) return { status: 409, body: { ok: false, error: 'konflikt', klice: konflikty } };
  const stranky = [...new Set(zmeny.map((z) => NAZVY[z.k.split(':')[0]] || z.k.split(':')[0]))];
  const zprava = `Úprava textů na webu: ${stranky.join(', ')} (${zmeny.length} ${zmeny.length === 1 ? 'změna' : zmeny.length < 5 ? 'změny' : 'změn'})`;
  try {
    const novy = await uloziste.zapis(sha, soubory, zprava);
    return { status: 200, body: { ok: true, sha: novy, html } };
  } catch (e) {
    // Mezitím přibyl jiný commit (ref se neposunul): zkusit znovu nad novou verzí
    if (e.status === 422 && pokus < 2) return ulozit(zmeny, uloziste, pokus + 1);
    throw e;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const akce = String(req.query?.akce || new URL(req.url, 'http://x').searchParams.get('akce') || '');
  const uloziste = LOKALNE ? lokalne : github;
  if (!HESLO || (!LOKALNE && !TOKEN)) return res.status(503).json({ ok: false, error: 'nenastaveno' });
  if (req.method === 'POST' && req.headers['x-upravy'] !== '1') return res.status(403).json({ ok: false, error: 'hlavicka' });

  try {
    if (akce === 'stav' && req.method === 'GET') {
      if (!prihlasen(req)) return res.status(401).json({ ok: false, prihlasen: false });
      const sha = String(req.query?.sha || new URL(req.url, 'http://x').searchParams.get('sha') || '');
      const nasazeni = /^[\w-]{6,64}$/.test(sha) ? await uloziste.nasazeni(sha).catch(() => 'nezname') : null;
      return res.status(200).json({ ok: true, prihlasen: true, nasazeni });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ ok: false, error: 'metoda' }); }
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    if (akce === 'prihlasit') {
      if (!hesloSedi(body.heslo || '')) {
        await new Promise((r) => setTimeout(r, 1200));
        return res.status(401).json({ ok: false, error: 'heslo' });
      }
      const exp = Math.floor(Date.now() / 1000) + PLATNOST_S;
      cookie(res, `${exp}.${podpis(exp)}`, PLATNOST_S);
      return res.status(200).json({ ok: true });
    }
    if (akce === 'odhlasit') { cookie(res, '', 0); return res.status(200).json({ ok: true }); }

    if (akce === 'ulozit') {
      if (!prihlasen(req)) return res.status(401).json({ ok: false, error: 'prihlaseni' });
      const zmeny = Array.isArray(body.zmeny) ? body.zmeny : [];
      const platne = zmeny.length > 0 && zmeny.length <= 300 && zmeny.every((z) => z && /^(layout|[a-z0-9-]+):\d+$/.test(z.k)
        && (z.k.startsWith('layout:') || STRANKY.includes(z.k.split(':')[0])) && typeof z.po === 'string' && z.po.length <= 8000 && typeof z.pred === 'string');
      if (!platne) return res.status(400).json({ ok: false, error: 'data' });
      const r = await ulozit(zmeny, uloziste);
      return res.status(r.status).json(r.body);
    }
    return res.status(404).json({ ok: false, error: 'akce' });
  } catch (e) {
    console.error('upravit', e.message, e.data || '');
    return res.status(502).json({ ok: false, error: 'uloziste' });
  }
}
