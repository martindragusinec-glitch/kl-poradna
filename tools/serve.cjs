// Lokální náhled: node poradna-kl/tools/serve.cjs 8797 [dist|preview]
// Servíruje dist/ s čistými adresami jako na hostingu; POST /api/kontakt jen potvrdí přijetí (test).
// /admin/ + /api/upravit/ běží lokálně: úpravy se zapisují rovnou do src/ a dist/ se přestaví. Heslo: UPRAVY_HESLO, jinak „upravy“.
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..', process.argv[3] || 'dist'), port = +(process.argv[2] || 8797);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };
process.env.UPRAVY_LOKALNE = '1';
process.env.UPRAVY_HESLO = process.env.UPRAVY_HESLO || 'upravy';
function upravit(req, res) {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', async () => {
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
    req.query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    const { default: handler } = await import(path.resolve(__dirname, '../api/upravit.js'));
    handler(req, res);
  });
}
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (req.method === 'POST' && p.replace(/\/$/, '') === '/api/kontakt') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{"ok":true}'); }
  if (p.replace(/\/$/, '') === '/api/upravit') return upravit(req, res);
  if (p === '/upravit' || p === '/upravit/') { res.writeHead(307, { Location: '/admin/' }); return res.end(); }
  let f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (p.endsWith('/')) f = path.join(f, 'index.html');
  else if (!path.extname(f) && fs.existsSync(path.join(f, 'index.html'))) { res.writeHead(301, { Location: p + '/' }); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': types['.html'] }); return res.end(fs.readFileSync(path.join(root, '404.html'))); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, () => console.log('Poradna KL: http://localhost:' + port));
