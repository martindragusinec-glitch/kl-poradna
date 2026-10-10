// Vercel Serverless Function: příjem formuláře „Požádat o schůzku“ a odeslání e-mailem přes Resend.
// Pošle poptávku poradně (šablona api/_emaily.js) a klientovi, který vyplnil e-mail, potvrzení o přijetí.
// Proměnné prostředí (Vercel → Settings → Environment Variables):
//   RESEND_API_KEY  klíč z https://resend.com (doména odesílatele musí být ověřená)
//   KONTAKT_FROM    volitelně odesílatel, výchozí "Rada na dosah <web@radanadosah.cz>"
//   KONTAKT_TO      příjemce, výchozí info@radanadosah.cz
//   SITE_URL        adresa webu pro odkazy a logo v e-mailech, výchozí https://www.radanadosah.cz
// Bez nastavení vrací 503 a formulář uživateli nabídne napsat e-mailem. Data se nikam neukládají.

import { poptavka, potvrzeni } from './_emaily.js';

const TEMATA = ['Nájem a bydlení', 'Dluhy a exekuce', 'Sociální dávky', 'Jiné'];
// Hodnoty vložené do Vercelu často nesou mezeru, konec řádku nebo uvozovky navíc
const env = (k) => String(process.env[k] ?? '').trim().replace(/^(["'])(.*)\1$/s, '$2').trim();
const MAX_POPIS = 1000;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method' });
  }
  const wantsJson = String(req.headers.accept || '').includes('application/json');
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const val = (k) => String(body[k] ?? '').trim();
  const reply = (status, payload, redirect) => {
    if (wantsJson) return res.status(status).json(payload);
    return res.redirect(303, redirect);
  };

  // Ochrana proti spamu: vyplněné skryté pole nebo odeslání do 3 s = robot. Tváříme se, že je vše v pořádku.
  const seconds = Number(val('cas_vyplneni_s'));
  if (val('poznamka_k_adrese') || (Number.isFinite(seconds) && val('cas_vyplneni_s') !== '' && seconds < 3)) {
    return reply(200, { ok: true }, '/dekujeme/');
  }

  const data = {
    jmeno: val('jmeno'), telefon: val('telefon'), email: val('email'), obec: val('obec'),
    tema: val('tema'), popis: String(body.popis ?? '').trim(), kdy: val('kdy'), souhlas: val('souhlas'),
  };
  const errors = [];
  if (!data.jmeno) errors.push('jmeno');
  if (!data.telefon && !data.email) errors.push('kontakt');
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(data.email)) errors.push('email');
  if (data.telefon && data.telefon.replace(/\D/g, '').length < 9) errors.push('telefon');
  if (!TEMATA.includes(data.tema)) errors.push('tema');
  if (!data.popis || data.popis.length > MAX_POPIS) errors.push('popis');
  if (data.souhlas !== 'ano') errors.push('souhlas');
  if (errors.length) return reply(400, { ok: false, error: 'invalid', fields: errors }, '/kontakt/?chyba=1#formular');

  const key = env('RESEND_API_KEY');
  const from = env('KONTAKT_FROM') || 'Rada na dosah <web@radanadosah.cz>';
  const to = env('KONTAKT_TO') || 'info@radanadosah.cz';
  if (!key) {
    // jen názvy chybějících proměnných, nikdy hodnoty
    const chybi = ['RESEND_API_KEY'];
    console.error('kontakt: chybí', chybi.join(', '));
    return reply(503, { ok: false, error: 'not-configured', chybi }, '/kontakt/?chyba=odeslani#formular');
  }

  const zaklad = (env('SITE_URL') || 'https://www.radanadosah.cz').replace(/\/$/, '');
  const prijato = new Date();
  const posli = (zprava) => fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, ...zprava }),
  }).then(async (r) => {
    if (!r.ok) console.error('resend', r.status, await r.text().catch(() => ''));
    return r.ok;
  }, (e) => { console.error('resend', e.message); return false; });

  // 1) Poptávka poradně: bez ní žádost nepřijímáme (klient dostane nabídku napsat e-mailem)
  const p = poptavka(data, { zaklad, prijato });
  if (!(await posli({ to: [to], reply_to: data.email || undefined, subject: p.subject, html: p.html, text: p.text }))) {
    return reply(502, { ok: false, error: 'send' }, '/kontakt/?chyba=odeslani#formular');
  }
  // 2) Potvrzení klientovi: když selže, žádost i tak platí
  let potvrzeno = false;
  if (data.email) {
    const c = potvrzeni(data, { zaklad, prijato });
    potvrzeno = await posli({ to: [data.email], reply_to: to, subject: c.subject, html: c.html, text: c.text });
  }
  return reply(200, { ok: true, potvrzeni: potvrzeno }, '/dekujeme/');
}
