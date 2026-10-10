// Vercel Routing Middleware: dokud web není spuštěný (stav-webu.js), veřejnost vidí stránku /v-priprave/.
// Kdo je přihlášený ve správě webu, má cookie rnd_nahled (nastavuje ji api/upravit.js) a vidí celý web,
// takže náhled ve správě i odkaz „Otevřít web“ fungují dál. Správa, API a soubory (assets) jdou vždy rovnou.
import { V_PRIPRAVE } from './stav-webu.js';

export const config = {
  matcher: ['/((?!admin|api|assets|v-priprave|verze\\.json|robots\\.txt|sitemap\\.xml).*)'],
};

const cisti = (s) => String(s ?? '').normalize('NFC').trim().replace(/^(["'])(.*)\1$/s, '$2');
const enc = new TextEncoder();
const base64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Stejný podpis jako v api/upravit.js: HMAC-SHA256 s klíčem sha256("upravy|heslo|token") nad "nahled|<expirace>"
async function nahledPovolen(request) {
  const m = /(?:^|;\s*)rnd_nahled=(\d+)\.([\w-]+)/.exec(request.headers.get('cookie') || '');
  const heslo = cisti(process.env.UPRAVY_HESLO);
  if (!m || !heslo || Number(m[1]) < Date.now() / 1000) return false;
  const tajemstvi = await crypto.subtle.digest('SHA-256', enc.encode('upravy|' + heslo + '|' + cisti(process.env.UPRAVY_GITHUB_TOKEN)));
  const klic = await crypto.subtle.importKey('raw', tajemstvi, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return base64url(await crypto.subtle.sign('HMAC', klic, enc.encode('nahled|' + m[1]))) === m[2];
}

export default async function middleware(request) {
  if (!V_PRIPRAVE || await nahledPovolen(request)) {
    return new Response(null, { headers: { 'x-middleware-next': '1' } });
  }
  return new Response(null, { headers: { 'x-middleware-rewrite': new URL('/v-priprave/', request.url).toString() } });
}
