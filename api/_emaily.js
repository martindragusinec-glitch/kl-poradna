// E-maily z formuláře „Požádat o schůzku“: poptávka pro poradnu a potvrzení pro klienta.
// Soubor začíná podtržítkem, takže z něj Vercel nedělá samostatnou funkci (importuje ho api/kontakt.js).
// HTML je tabulkové s inline styly (Gmail, Outlook, Apple Mail, Seznam). Náhled: node tools/email/nahled.mjs

const F = "'Satoshi',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const C = { paper: '#F7F3F0', ink: '#2A1219', ink2: '#573F47', malina: '#8E1B3E', merunka: '#FFC29E', ruzova: '#F6DCE3', krem: '#FFE8DA', krize: '#FFC2AD', bila: '#FFFFFF', linka: '#EADFDB' };
const BUBLINA = '26px 26px 26px 6px';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const odstavce = (s) => esc(s).replace(/\r?\n/g, '<br>');

// Datum v pražském čase: „ve středu 15. 10.“ (předložka podle dne), čas „14:32“
const PRAHA = 'Europe/Prague';
const V_DEN = { 'pondělí': 'v pondělí', 'úterý': 'v úterý', 'středa': 've středu', 'čtvrtek': 've čtvrtek', 'pátek': 'v pátek', 'sobota': 'v sobotu', 'neděle': 'v neděli' };
const den = (d) => {
  const f = new Intl.DateTimeFormat('cs-CZ', { timeZone: PRAHA, weekday: 'long', day: 'numeric', month: 'numeric' }).formatToParts(d);
  const v = (t) => (f.find((x) => x.type === t) || {}).value;
  return `${V_DEN[v('weekday')] || v('weekday')} ${v('day')}. ${v('month')}.`;
};
const cas = (d) => new Intl.DateTimeFormat('cs-CZ', { timeZone: PRAHA, hour: 'numeric', minute: '2-digit' }).format(d);
const nbsp = (s) => esc(s).replace(/ /g, '&nbsp;');
// Slib „ozveme se do 5 pracovních dnů“ jako konkrétní den (víkendy přeskočí, svátky ne)
export function lhuta(od, dnu = 5) {
  const d = new Date(od);
  let zbyva = dnu;
  while (zbyva > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const t = new Intl.DateTimeFormat('en-US', { timeZone: PRAHA, weekday: 'short' }).format(d);
    if (t !== 'Sat' && t !== 'Sun') zbyva--;
  }
  return d;
}

function obal({ titulek, preheader, obsah, paticka, zaklad }) {
  return `<!doctype html>
<html lang="cs" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(titulek)}</title>
<style>
@font-face { font-family: 'Satoshi'; src: url('${zaklad}/assets/fonts/satoshi-500.woff2') format('woff2'); font-weight: 500; }
@font-face { font-family: 'Satoshi'; src: url('${zaklad}/assets/fonts/satoshi-700.woff2') format('woff2'); font-weight: 700; }
@font-face { font-family: 'Satoshi'; src: url('${zaklad}/assets/fonts/satoshi-900.woff2') format('woff2'); font-weight: 900; }
body { margin: 0; padding: 0; background: ${C.paper}; -webkit-text-size-adjust: 100%; }
a { color: ${C.malina}; }
@media (max-width: 620px) {
  .px { padding-left: 22px !important; padding-right: 22px !important; }
  .h1 { font-size: 28px !important; line-height: 34px !important; }
  .btn td { display: block !important; width: 100% !important; padding: 0 0 10px !important; }
  .btn a { display: block !important; text-align: center !important; }
  .btn { width: 100% !important; }
  .row td { display: block !important; width: 100% !important; }
  .row .lbl { padding-bottom: 0 !important; }
  .row .val { border-top: 0 !important; padding-top: 2px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background:${C.paper};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.paper};">${esc(preheader)}${'&#847;&zwnj;&nbsp;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.paper}" style="background:${C.paper};">
<tr><td align="center" style="padding:28px 12px 40px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
<tr><td style="padding:0 6px 18px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="padding-right:12px;"><img src="${zaklad}/assets/img/email-znak.png" width="44" height="35" alt="" style="display:block;border:0;"></td>
    <td style="font-family:${F};color:${C.ink};">
      <div style="font-size:19px;line-height:22px;font-weight:900;letter-spacing:-0.3px;">Rada <span style="color:${C.malina};">na dosah</span></div>
      <div style="font-size:12px;line-height:16px;font-weight:700;color:${C.ink2};">bezplatná poradna na&nbsp;Kladně</div>
    </td>
  </tr></table>
</td></tr>
${obsah}
<tr><td class="px" style="padding:22px 30px 0;font-family:${F};font-size:12px;line-height:19px;color:${C.ink2};">${paticka}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const tlacitko = (href, text, varianta) => {
  const hlavni = varianta !== 'obrys';
  return `<td style="padding:0 10px 10px 0;"><a href="${esc(href)}" style="display:inline-block;padding:14px 22px;border-radius:999px;font-family:${F};font-size:15px;line-height:20px;font-weight:700;text-decoration:none;${
    hlavni ? `background:${varianta === 'merunka' ? C.merunka : C.malina};color:${varianta === 'merunka' ? C.ink : C.bila};` : `border:2px solid rgba(255,255,255,.75);color:${C.bila};padding:12px 20px;`
  }">${text}</a></td>`;
};

const radek = (popisek, hodnota) => (hodnota ? `<tr class="row">
  <td class="lbl" width="150" valign="top" style="padding:13px 12px 13px 0;border-top:1px solid ${C.linka};font-family:${F};font-size:13px;line-height:20px;font-weight:700;color:${C.ink2};">${popisek}</td>
  <td class="val" valign="top" style="padding:13px 0;border-top:1px solid ${C.linka};font-family:${F};font-size:16px;line-height:22px;color:${C.ink};">${hodnota}</td>
</tr>` : '');

/* ---------- Poptávka pro poradnu (info@radanadosah.cz) ---------- */
export function poptavka(d, { zaklad, prijato = new Date() }) {
  const tel = d.telefon ? d.telefon.replace(/[^\d+]/g, '') : '';
  const predmet = `Re: Vaše žádost o schůzku – Rada na dosah`;
  const do_ = lhuta(prijato);
  const obsah = `
<tr><td bgcolor="${C.malina}" class="px" style="background:${C.malina};border-radius:${BUBLINA};padding:30px 30px 22px;">
  <div style="font-family:${F};font-size:12px;line-height:16px;font-weight:900;letter-spacing:1.2px;text-transform:uppercase;color:${C.merunka};">Nová žádost o&nbsp;schůzku</div>
  <div class="h1" style="margin-top:8px;font-family:${F};font-size:34px;line-height:40px;font-weight:900;letter-spacing:-0.8px;color:${C.bila};">${esc(d.jmeno)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;"><tr>
    <td style="background:${C.merunka};border-radius:999px;padding:6px 14px;font-family:${F};font-size:14px;line-height:18px;font-weight:700;color:${C.ink};">${esc(d.tema)}</td>
    ${d.obec ? `<td style="padding-left:12px;font-family:${F};font-size:14px;line-height:18px;color:#FDEFF3;">${esc(d.obec)}</td>` : ''}
  </tr></table>
  <table role="presentation" class="btn" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px;"><tr>
    ${tel ? tlacitko(`tel:${tel}`, `Zavolat ${esc(d.telefon)}`, 'merunka') : ''}
    ${d.email ? tlacitko(`mailto:${d.email}?subject=${encodeURIComponent(predmet)}`, 'Odpovědět e-mailem', tel ? 'obrys' : 'merunka') : ''}
  </tr></table>
</td></tr>
<tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>
<tr><td bgcolor="${C.bila}" class="px" style="background:${C.bila};border-radius:${BUBLINA};padding:12px 30px 26px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${radek('Telefon', d.telefon ? `<a href="tel:${esc(tel)}" style="color:${C.malina};font-weight:700;text-decoration:none;">${esc(d.telefon)}</a>` : '<span style="color:' + C.ink2 + ';">neuvedl/a</span>')}
    ${radek('E-mail', d.email ? `<a href="mailto:${esc(d.email)}" style="color:${C.malina};font-weight:700;text-decoration:none;">${esc(d.email)}</a>` : '<span style="color:' + C.ink2 + ';">neuvedl/a</span>')}
    ${radek('Obec', esc(d.obec))}
    ${radek('Kdy se ozvat', esc(d.kdy))}
  </table>
  <div style="margin-top:18px;font-family:${F};font-size:13px;line-height:20px;font-weight:700;color:${C.ink2};">Co potřebuje vyřešit</div>
  <div style="margin-top:8px;background:${C.paper};border-radius:${BUBLINA};padding:16px 18px;font-family:${F};font-size:16px;line-height:25px;color:${C.ink};">${odstavce(d.popis)}</div>
</td></tr>
<tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>
<tr><td bgcolor="${C.krem}" class="px" style="background:${C.krem};border-radius:${BUBLINA};padding:16px 30px;font-family:${F};font-size:15px;line-height:22px;color:${C.ink};">
  <strong>Slíbili jsme ozvat se do 5&nbsp;pracovních dnů,</strong> tedy nejpozději ${nbsp(den(do_))}
</td></tr>`;
  const paticka = `Přijato ${nbsp(den(prijato))}, ${esc(cas(prijato))}, přes formulář na&nbsp;<a href="${zaklad}/kontakt/" style="color:${C.ink2};">${esc(zaklad.replace(/^https?:\/\//, ''))}</a>. Klient potvrdil, že se seznámil se zásadami ochrany osobních údajů.${
    d.email ? ' Odpovědí na tento e-mail píšete přímo klientovi.' : ''}`;
  const text = [
    `Nová žádost o schůzku: ${d.tema}`,
    '',
    `Jméno: ${d.jmeno}`,
    `Telefon: ${d.telefon || '–'}`,
    `E-mail: ${d.email || '–'}`,
    `Obec: ${d.obec || '–'}`,
    `Kdy se ozvat: ${d.kdy || '–'}`,
    '',
    'Co potřebuje vyřešit:',
    d.popis,
    '',
    `Slíbili jsme ozvat se do 5 pracovních dnů, tedy nejpozději ${den(do_)}`,
    `Přijato ${den(prijato)}, ${cas(prijato)}, přes formulář na webu. Souhlas se zásadami ochrany osobních údajů: ano.`,
  ].join('\n');
  return {
    subject: `Nová žádost o schůzku: ${d.tema} – ${d.jmeno}`,
    html: obal({ titulek: 'Nová žádost o schůzku', preheader: `${d.tema} · ${d.telefon || d.email}`, obsah, paticka, zaklad }),
    text,
  };
}

/* ---------- Potvrzení pro klienta ----------
   Schválně bez textu, který klient napsal (jméno, popis): formulář pak nejde zneužít k rozesílání
   cizího obsahu na libovolné adresy. Téma je jen z pevného seznamu. */
export function potvrzeni(d, { zaklad, prijato = new Date() }) {
  const do_ = lhuta(prijato);
  const krok = (znak, nadpis, popis, hotovo) => `<tr>
    <td width="44" valign="top" style="padding:0 14px 16px 0;">
      <div style="width:36px;height:36px;line-height:36px;border-radius:12px 12px 12px 4px;text-align:center;font-family:${F};font-size:16px;font-weight:900;${hotovo ? `background:${C.malina};color:${C.bila};` : `background:${C.ruzova};color:${C.malina};`}">${znak}</div>
    </td>
    <td valign="top" style="padding:0 0 16px;font-family:${F};font-size:15px;line-height:22px;color:${C.ink2};"><strong style="display:block;color:${C.ink};font-size:16px;">${nadpis}</strong>${popis}</td>
  </tr>`;
  const obsah = `
<tr><td bgcolor="${C.bila}" class="px" style="background:${C.bila};border-radius:${BUBLINA};padding:32px 30px 26px;">
  <div class="h1" style="font-family:${F};font-size:32px;line-height:38px;font-weight:900;letter-spacing:-0.8px;color:${C.ink};">Děkujeme, vaše zpráva k&nbsp;nám dorazila.</div>
  <p style="margin:14px 0 0;font-family:${F};font-size:17px;line-height:27px;color:${C.ink2};">Dobrý den, ozveme se vám do 5&nbsp;pracovních dnů a&nbsp;domluvíme termín schůzky. Pomoc je zdarma.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr>
    <td style="font-family:${F};font-size:13px;line-height:18px;font-weight:700;color:${C.ink2};padding-right:10px;">Téma</td>
    <td style="background:${C.krem};border-radius:999px;padding:6px 14px;font-family:${F};font-size:14px;line-height:18px;font-weight:700;color:${C.ink};">${esc(d.tema)}</td>
  </tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:26px;">
    ${krok('&#10003;', 'Vaše zpráva', `Dorazila k&nbsp;nám ${nbsp(den(prijato))}, ${esc(cas(prijato))}.`, true)}
    ${krok('2', 'Ozveme se vám', `Nejpozději ${nbsp(den(do_))} Zavoláme nebo napíšeme podle toho, co jste nám nechali.`)}
    ${krok('3', 'Probereme to osobně', 'Na&nbsp;schůzce u&nbsp;nás v&nbsp;kanceláři projdeme vaši situaci a&nbsp;navrhneme další postup.')}
  </table>
  <table role="presentation" class="btn" cellpadding="0" cellspacing="0" border="0" style="margin-top:4px;"><tr>
    ${tlacitko(`${zaklad}/jak-to-funguje/#s-sebou`, 'Co si vzít s&nbsp;sebou na schůzku &rarr;')}
  </tr></table>
  <p style="margin:8px 0 0;font-family:${F};font-size:15px;line-height:23px;color:${C.ink2};">Chcete něco doplnit nebo poslat dokumenty? Stačí odpovědět na tento e-mail.</p>
</td></tr>
<tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>
<tr><td bgcolor="${C.ruzova}" class="px" style="background:${C.ruzova};border-radius:${BUBLINA};padding:22px 30px;font-family:${F};color:${C.ink};">
  <div style="font-size:12px;line-height:16px;font-weight:900;letter-spacing:1.2px;text-transform:uppercase;color:${C.malina};">Kde nás najdete</div>
  <div style="margin-top:8px;font-size:20px;line-height:26px;font-weight:900;letter-spacing:-0.3px;">T. G. Masaryka 108, 272&nbsp;01 Kladno</div>
  <div style="margin-top:6px;font-size:15px;line-height:23px;color:${C.ink2};">Pěší zóna v&nbsp;centru · bezbariérová kancelář · jen po předchozí domluvě</div>
  <div style="margin-top:10px;font-size:15px;line-height:22px;font-weight:700;"><a href="https://mapy.cz/?q=T.%20G.%20Masaryka%20108%2C%20Kladno" style="color:${C.malina};">Mapy.cz</a> &nbsp;·&nbsp; <a href="https://www.google.com/maps/search/?api=1&amp;query=T.+G.+Masaryka+108,+272+01+Kladno" style="color:${C.malina};">Google Mapy</a></div>
</td></tr>
<tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>
<tr><td bgcolor="${C.krize}" class="px" style="background:${C.krize};border-radius:${BUBLINA};padding:16px 30px;font-family:${F};font-size:15px;line-height:22px;color:${C.ink};">
  <strong>Nejsme krizová služba.</strong> V&nbsp;akutním ohrožení volejte <a href="tel:158" style="color:${C.ink};font-weight:900;">158</a> nebo <a href="tel:112" style="color:${C.ink};font-weight:900;">112</a>.
</td></tr>`;
  const host = zaklad.replace(/^https?:\/\//, '');
  const paticka = `<strong style="color:${C.ink};">Rada na dosah, z.ú.</strong> · bezplatné právní poradenství na&nbsp;Kladně · <a href="${zaklad}/" style="color:${C.ink2};">${esc(host)}</a><br>
Tento e-mail přišel, protože někdo vyplnil formulář na&nbsp;${esc(host)} s&nbsp;touto adresou. Pokud jste to nebyli vy, e-mail prosím ignorujte.`;
  const text = [
    'Děkujeme, vaše zpráva k nám dorazila.',
    '',
    'Dobrý den, ozveme se vám do 5 pracovních dnů a domluvíme termín schůzky. Pomoc je zdarma.',
    `Téma: ${d.tema}`,
    '',
    `1. Vaše zpráva: dorazila k nám ${den(prijato)}, ${cas(prijato)}.`,
    `2. Ozveme se vám: nejpozději ${den(do_)}`,
    '3. Probereme to osobně u nás v kanceláři.',
    '',
    `Co si vzít s sebou: ${zaklad}/jak-to-funguje/#s-sebou`,
    'Chcete něco doplnit? Stačí odpovědět na tento e-mail.',
    '',
    'Kde nás najdete: T. G. Masaryka 108, 272 01 Kladno (pěší zóna v centru, jen po předchozí domluvě).',
    'Nejsme krizová služba. V akutním ohrožení volejte 158 nebo 112.',
    '',
    `Rada na dosah, z.ú. · ${host}`,
    `Tento e-mail přišel, protože někdo vyplnil formulář na ${host} s touto adresou. Pokud jste to nebyli vy, e-mail prosím ignorujte.`,
  ].join('\n');
  return {
    subject: 'Vaše zpráva k nám dorazila – Rada na dosah',
    html: obal({ titulek: 'Vaše zpráva k nám dorazila', preheader: `Ozveme se vám nejpozději ${den(do_)}`, obsah, paticka, zaklad }),
    text,
  };
}

