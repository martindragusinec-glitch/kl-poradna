// Vercel Serverless Function: příjem formuláře „Požádat o schůzku“ a odeslání e-mailem přes Resend.
// Proměnné prostředí (Vercel → Settings → Environment Variables):
//   RESEND_API_KEY  klíč z https://resend.com (doména odesílatele musí být ověřená)
//   KONTAKT_FROM    odesílatel, např. "Web Poradna KL <web@poradnakl.cz>"
//   KONTAKT_TO      příjemce, výchozí info@poradnakl.cz
// Bez nastavení vrací 503 a formulář uživateli nabídne napsat e-mailem. Data se nikam neukládají.

const TEMATA = ['Nájem a bydlení', 'Dluhy a exekuce', 'Sociální dávky', 'Jiné'];
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

  const key = process.env.RESEND_API_KEY;
  const from = process.env.KONTAKT_FROM;
  const to = process.env.KONTAKT_TO || 'info@poradnakl.cz';
  if (!key || !from) return reply(503, { ok: false, error: 'not-configured' }, '/kontakt/?chyba=odeslani#formular');

  const text = [
    'Nová žádost o schůzku z webu Poradna KL',
    '',
    `Jméno a příjmení: ${data.jmeno}`,
    `Telefon: ${data.telefon || '–'}`,
    `E-mail: ${data.email || '–'}`,
    `Obec: ${data.obec || '–'}`,
    `Téma: ${data.tema}`,
    `Kdy se ozvat: ${data.kdy || '–'}`,
    '',
    'Stručný popis:',
    data.popis,
    '',
    'Souhlas se zásadami ochrany osobních údajů: ano',
  ].join('\n');

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from, to: [to],
        reply_to: data.email || undefined,
        subject: `Žádost o schůzku: ${data.tema} – ${data.jmeno}`,
        text,
      }),
    });
    if (!r.ok) return reply(502, { ok: false, error: 'send' }, '/kontakt/?chyba=odeslani#formular');
  } catch {
    return reply(502, { ok: false, error: 'send' }, '/kontakt/?chyba=odeslani#formular');
  }
  return reply(200, { ok: true }, '/dekujeme/');
}
