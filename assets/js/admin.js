/* Rada na dosah – správa webu (/admin/).
   Vlevo stránky, uprostřed živý náhled webu (iframe, stejná doména). Texty označené data-k jde v náhledu rovnou přepsat.
   Změny se drží jako koncept v tomto prohlížeči (localStorage); „Zveřejnit změny“ je pošle do api/upravit.js,
   které je uloží jedním commitem do GitHubu, a Vercel web znovu nasadí. Historie umí každou změnu vrátit. */
(function () {
  'use strict';

  var API = '/api/upravit/';
  var WEB = 'radanadosah.cz';
  var STRANKY = JSON.parse(document.getElementById('stranky').textContent);
  var KEY = { koncept: 'rnd-admin-koncept', zverejneni: 'rnd-admin-zverejneni', pruvodce: 'rnd-admin-pruvodce', zarizeni: 'rnd-admin-zarizeni' };
  var MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  var svg = function (d) { return '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + d + '</svg>'; };
  var ICONS = {
    pc: svg('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>'),
    mobil: svg('<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>'),
    historie: svg('<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/><path d="M12 7.5V12l3 2"/>'),
    menu: svg('<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>'),
    zavrit: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    google: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>'),
    napoveda: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.6M12 16.8v.2"/>'),
    stranka: svg('<path d="M6.5 3h7.5l4 4v14h-11.5z"/><path d="M14 3v4h4M9.5 12h5M9.5 15.5h5"/>'),
    paticka: svg('<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 15h17"/>'),
    zamek: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    ven: svg('<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
    odkaz: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
    zpet: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    kos: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    oko: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
    odhlasit: svg('<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>'),
    hotovo: svg('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/>'),
    tuzka: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>')
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var text = function (html) { var t = document.createElement('template'); t.innerHTML = html || ''; return t.content.textContent.replace(/\s+/g, ' ').trim(); };
  var ico = function (n) { return '<i data-ico="' + n + '">' + ICONS[n] + '</i>'; };
  var fillIcons = function (root) { $$('i[data-ico]', root).forEach(function (i) { if (!i.firstChild) i.innerHTML = ICONS[i.getAttribute('data-ico')] || ''; }); };
  var nazev = function (slug) { if (slug === 'layout') return 'Patička (na všech stránkách)'; var p = STRANKY.filter(function (x) { return x.slug === slug; })[0]; return p ? p.nazev : slug; };
  var datum = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  function api(akce, data) {
    return fetch(API + '?akce=' + akce, {
      method: data ? 'POST' : 'GET',
      credentials: 'same-origin',
      headers: data ? { 'Content-Type': 'application/json', 'X-Upravy': '1' } : {},
      body: data ? JSON.stringify(data) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; });
    }, function () { return { status: 0 }; });
  }

  function toast(msg, tone, link) {
    var t = document.createElement('div');
    t.className = 'a-toast';
    if (tone) t.setAttribute('data-tone', tone);
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (link ? ' <a href="' + esc(link) + '" target="_blank" rel="noopener">Zobrazit na webu</a>' : '');
    $('#a-toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, tone === 'error' ? 9000 : 5000);
  }

  /* ---------- Koncept (rozpracované změny) ----------
     zmeny[k] = { po: HTML, pred: zveřejněný text, stranka, popis }   k = "uvod:3" | "uvod:@title" | "novy-<id>-<n>"
     operace  = [{ typ: "pridat", id, za, slug } | { typ: "smazat", polozka, slug, text }] */
  var koncept = store.get(KEY.koncept) || {};
  koncept.zmeny = koncept.zmeny || {};
  koncept.operace = koncept.operace || [];
  function ulozKoncept() { store.set(KEY.koncept, koncept); pocty(); }
  var jeTextova = function (k) { return k.indexOf('novy-') !== 0; };

  function pocty() {
    var per = {};
    var add = function (s) { per[s] = (per[s] || 0) + 1; };
    Object.keys(koncept.zmeny).forEach(function (k) {
      if (!jeTextova(k)) return;
      add(k.indexOf('layout:') === 0 ? 'layout' : (k.indexOf('@') > 0 ? k.split(':')[0] : koncept.zmeny[k].stranka));
    });
    koncept.operace.forEach(function (o) { add(o.slug); });
    var celkem = Object.keys(per).reduce(function (s, k) { return s + per[k]; }, 0);
    $$('[data-pocet]').forEach(function (b) { b.textContent = celkem; b.toggleAttribute('data-nula', !celkem); });
    $$('.a-page').forEach(function (b) {
      var badge = b.querySelector('.a-badge');
      var n = per[b.getAttribute('data-slug')] || 0;
      badge.textContent = n;
      badge.hidden = !n;
    });
    return celkem;
  }

  /* ---------- Přihlášení ---------- */
  var poPrihlaseni = null;
  function brana(id) { ['a-boot', 'a-login', 'a-off', 'a-app'].forEach(function (x) { $('#' + x).hidden = x !== id; }); }
  function prihlaseni(pak) {
    poPrihlaseni = pak || null;
    brana('a-login');
    $('#a-heslo').focus();
  }
  (function () {
    var form = $('#a-login form'), input = $('#a-heslo'), err = $('#a-login-error'), show = $('.a-pass__show');
    show.addEventListener('click', function () {
      var on = input.type === 'password';
      input.type = on ? 'text' : 'password';
      show.setAttribute('aria-pressed', String(on));
      show.textContent = on ? 'Skrýt' : 'Zobrazit';
      input.focus();
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!input.value) { err.textContent = 'Zadejte heslo.'; input.focus(); return; }
      var btn = form.querySelector('[type="submit"]');
      btn.disabled = true;
      err.textContent = '';
      api('prihlasit', { heslo: input.value }).then(function (r) {
        btn.disabled = false;
        if (r.ok) {
          input.value = '';
          var pak = poPrihlaseni;
          poPrihlaseni = null;
          if (pak) pak(); else start();
          return;
        }
        err.textContent = r.status === 401
          ? 'Heslo nesedí. Zkontrolujte velká a malá písmena a českou klávesnici (čísla, y/z). Pomůže tlačítko „Zobrazit“.'
          : 'Přihlášení se nepovedlo. Zkuste to prosím za chvíli znovu.';
        input.select();
      });
    });
  })();

  /* ---------- Aplikace ---------- */
  var frame = $('#a-frame');
  var doc = null, aktualni = null, puvodni = new WeakMap(), cil = null, scrollPo = null, zamceno = false;
  var lista = null, listaEl = null, rozsah = null, pol = null, polCil = null;
  var spusteno = false;

  function start() {
    brana('a-app');
    if (spusteno) return;
    spusteno = true;
    fillIcons(document);

    var ul = $('#a-pages'), pick = $('#a-pick');
    STRANKY.concat([{ slug: 'layout', nazev: 'Patička' }]).forEach(function (p) {
      var li = document.createElement('li');
      li.innerHTML = '<button type="button" class="a-page" data-slug="' + p.slug + '">' + ico(p.slug === 'layout' ? 'paticka' : 'stranka') +
        '<span class="a-page__name">' + esc(p.slug === 'layout' ? 'Patička (všude)' : p.nazev) + '</span><span class="a-badge" hidden>0</span></button>';
      ul.appendChild(li);
      var o = document.createElement('option');
      o.value = p.slug;
      o.textContent = p.slug === 'layout' ? 'Patička (na všech stránkách)' : p.nazev;
      pick.appendChild(o);
    });
    ul.addEventListener('click', function (e) { var b = e.target.closest('[data-slug]'); if (b) jdi(b.getAttribute('data-slug')); });
    pick.addEventListener('change', function () { jdi(pick.value); });

    $$('.a-seg button').forEach(function (b) { b.addEventListener('click', function () { zarizeni(b.getAttribute('data-device')); }); });
    zarizeni(store.get(KEY.zarizeni) || 'pc');

    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-panel]');
      if (b) { e.preventDefault(); panel(b.getAttribute('data-panel')); }
    });
    var dlg = $('#a-drawer');
    dlg.addEventListener('click', function (e) { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
    var guide = $('#a-guide');
    guide.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) guide.close(); });
    document.addEventListener('keydown', zkratky);

    frame.addEventListener('load', pripravit);
    var h = location.hash.slice(1);
    jdi(STRANKY.some(function (p) { return p.slug === h; }) ? h : 'uvod');

    if (!store.get(KEY.pruvodce)) { guide.showModal(); store.set(KEY.pruvodce, 1); }
    pocty();
    if (cekajici()) sledovat();
  }

  function zkratky(e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); panel('zmeny'); }
  }

  function zarizeni(d) {
    $('#a-browser').setAttribute('data-device', d);
    $$('.a-seg button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-device') === d)); });
    store.set(KEY.zarizeni, d);
  }

  function jdi(slug, k) {
    if (slug === 'layout') { cil = 'paticka'; slug = aktualni || 'uvod'; }
    else if (k) cil = k;
    var p = STRANKY.filter(function (x) { return x.slug === slug; })[0];
    if (!p) return;
    if (doc && aktualni === slug) { var c = cil; cil = null; if (c) zamerit(c); return; }
    frame.src = p.url;
  }

  /* ---------- Náhled: příprava stránky v iframe ---------- */
  var NAHLED_CSS =
    '[data-k][contenteditable="true"]{cursor:text;border-radius:6px;outline:2px solid transparent;outline-offset:3px;transition:outline-color .15s,background-color .15s}' +
    '[data-k][contenteditable="true"]:hover{outline-color:color-mix(in srgb,currentColor 38%,transparent);background-color:color-mix(in srgb,currentColor 5%,transparent)}' +
    '[data-k][contenteditable="true"]:focus{outline:2px solid currentColor;background-color:color-mix(in srgb,currentColor 7%,transparent)}' +
    '[data-k][data-rnd-zmena]{outline:2px dashed currentColor}' +
    '[data-k][data-rnd-konflikt]{outline:3px solid #B42318}' +
    '[data-rnd-novy]{outline:3px solid #8E1B3E;outline-offset:4px;border-radius:14px}' +
    '[data-rnd-smazano]{opacity:.38;filter:grayscale(1)}[data-rnd-smazano] *{pointer-events:none}' +
    '.rnd-tb,.rnd-pol{position:absolute;z-index:2147483000;display:flex;align-items:center;gap:2px;font:600 14px/1 Satoshi,system-ui,sans-serif;color:#fff}' +
    '.rnd-tb{padding:5px;border-radius:14px 14px 14px 4px;background:#2A1219;box-shadow:0 14px 30px -12px rgba(42,18,25,.65)}' +
    '.rnd-tb[hidden],.rnd-pol[hidden],.rnd-tb [hidden]{display:none!important}' +
    '.rnd-tb button,.rnd-pol button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 10px;border-radius:9px;cursor:pointer;color:#fff;font:600 14px/1 Satoshi,system-ui,sans-serif;white-space:nowrap}' +
    '.rnd-tb button:hover{background:rgba(255,255,255,.14)}.rnd-tb button:focus-visible,.rnd-pol button:focus-visible{outline:2px solid #FFC29E;outline-offset:1px}' +
    '.rnd-tb svg,.rnd-pol svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
    '.rnd-tb b{font-weight:900;font-size:15px}.rnd-tb em{font-style:italic;font-weight:700;font-size:15px;font-family:Georgia,serif}' +
    '.rnd-tb__sep{width:1px;height:20px;margin:0 4px;background:rgba(255,255,255,.22)}' +
    '.rnd-tb__link{display:flex;align-items:center;gap:4px;margin-left:4px}' +
    '.rnd-tb__link input{all:unset;box-sizing:border-box;width:230px;height:34px;padding:0 10px;border-radius:9px;background:#fff;color:#2A1219;font:500 14px/1 Satoshi,system-ui,sans-serif}' +
    '.rnd-pol{gap:6px}.rnd-pol button{height:32px;padding:0 12px;border-radius:999px;background:#2A1219;font-size:13px;box-shadow:0 8px 20px -8px rgba(42,18,25,.6)}' +
    '.rnd-pol button[data-p="smazat"]{background:#fff;color:#B42318;box-shadow:0 0 0 1px rgba(180,35,24,.45),0 8px 20px -8px rgba(42,18,25,.4)}' +
    '@media (max-width:520px){.rnd-tb__link input{width:150px}.rnd-tb button span{display:none}}';

  var upr = function (n) {
    if (n && n.nodeType === 3) n = n.parentElement;
    return n && n.closest ? n.closest('[data-k][contenteditable="true"]') : null;
  };
  var najdi = function (k) { return doc && doc.querySelector('[data-k="' + k + '"]'); };

  function pripravit() {
    try { doc = frame.contentDocument; } catch (e) { doc = null; }
    if (!doc || !doc.body) return;
    var path = frame.contentWindow.location.pathname;
    var p = STRANKY.filter(function (x) { return x.url === path; })[0];
    aktualni = p ? p.slug : null;
    $('#a-url').textContent = WEB + path;
    $('#a-open').href = path;
    $$('.a-page').forEach(function (b) {
      if (b.getAttribute('data-slug') === aktualni) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    if (aktualni) $('#a-pick').value = aktualni;
    history.replaceState(null, '', location.pathname + (aktualni && aktualni !== 'uvod' ? '#' + aktualni : ''));
    if (!p) return;

    var st = doc.createElement('style');
    st.textContent = NAHLED_CSS;
    doc.head.appendChild(st);
    $$('details', doc).forEach(function (d) { d.open = true; });
    koncept.operace.forEach(function (o) { if (o.slug === aktualni) provedOp(o); });
    $$('[data-k]', doc).forEach(pripravPrvek);
    Object.keys(koncept.zmeny).forEach(function (k) {
      if (k.indexOf('@') > 0) return;
      var el = najdi(k);
      if (el) { el.innerHTML = koncept.zmeny[k].po; oznac(el); }
    });
    udalosti();
    nastroje();
    if (zamceno) zamknout(true);
    if (scrollPo != null) { frame.contentWindow.scrollTo(0, scrollPo); scrollPo = null; }
    if (cil) { var c = cil; cil = null; setTimeout(function () { zamerit(c); }, 80); }
  }

  function pripravPrvek(el) {
    if (el.closest('[hidden]')) return;
    if (!puvodni.has(el)) puvodni.set(el, { html: el.innerHTML, text: el.textContent });
    el.setAttribute('contenteditable', el.closest('[data-rnd-smazano]') ? 'false' : 'true');
    el.setAttribute('spellcheck', 'true');
    var a = el.closest('a');
    if (a) a.setAttribute('draggable', 'false');
  }

  function zamerit(k) {
    if (k === 'paticka') { var f = doc.querySelector('.site-footer'); if (f) f.scrollIntoView({ block: 'start' }); return; }
    if (k.indexOf('@') > 0) { panel('google'); return; }
    var el = najdi(k);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.focus();
    var r = doc.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    var s = frame.contentWindow.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  function popis(el) {
    if (el.closest('summary')) return 'Otázka';
    if (el.closest('.faq__answer')) return 'Odpověď';
    if (el.closest('.btn') || el.matches('.btn')) return 'Tlačítko';
    var m = { H1: 'Hlavní nadpis', H2: 'Nadpis', H3: 'Podnadpis', H4: 'Podnadpis', P: 'Odstavec', LI: 'Položka seznamu',
      ADDRESS: 'Adresa', LABEL: 'Popisek formuláře', LEGEND: 'Popisek formuláře', A: 'Odkaz' }[el.tagName] || 'Text';
    return el.closest('.site-footer') ? 'Patička · ' + m : m;
  }

  function zmena(el) {
    var k = el.getAttribute('data-k');
    var p = puvodni.get(el) || { html: null, text: '' };
    if (!jeTextova(k)) koncept.zmeny[k] = { po: el.innerHTML, pred: '', stranka: aktualni, popis: popis(el) };
    else if (el.innerHTML === p.html) delete koncept.zmeny[k];
    else koncept.zmeny[k] = { po: el.innerHTML, pred: p.text, stranka: k.indexOf('layout:') === 0 ? 'layout' : aktualni, popis: popis(el) };
    oznac(el);
    ulozKoncept();
  }

  function oznac(el) {
    var k = el.getAttribute('data-k');
    el.toggleAttribute('data-rnd-zmena', !!koncept.zmeny[k] && jeTextova(k));
    el.removeAttribute('data-rnd-konflikt');
  }

  function udalosti() {
    doc.addEventListener('input', function (e) { var el = upr(e.target); if (el) zmena(el); });
    doc.addEventListener('keydown', function (e) {
      zkratky(e);
      var el = upr(e.target);
      if (!el) return;
      if (e.key === 'Escape') { el.blur(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); prikaz('link'); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (e.shiftKey && /^(P|LI|ADDRESS|DD|TD)$/.test(el.tagName) && !doc.execCommand('insertLineBreak')) doc.execCommand('insertHTML', false, '<br>');
    });
    doc.addEventListener('paste', function (e) {
      if (!upr(e.target)) return;
      e.preventDefault();
      doc.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s*\n\s*/g, ' '));
    });
    doc.addEventListener('drop', function (e) { if (upr(e.target)) e.preventDefault(); });
    doc.addEventListener('click', klik, true);
    doc.addEventListener('submit', function (e) { e.preventDefault(); toast('Formulář v náhledu neodesílám.'); }, true);
    doc.addEventListener('focusin', function (e) {
      var el = upr(e.target);
      if (!el) return;
      ukazListu(el);
      // Předvyplněný text nové otázky se při psaní rovnou přepíše
      if (!jeTextova(el.getAttribute('data-k')) && /^(Nová otázka|Napište odpověď\.)$/.test(el.textContent.trim())) {
        setTimeout(function () { var r = doc.createRange(); r.selectNodeContents(el); var s = frame.contentWindow.getSelection(); s.removeAllRanges(); s.addRange(r); }, 0);
      }
      var it = el.closest('[data-polozka], [data-rnd-novy]');
      if (it) ukazPolozku(it);
    });
    doc.addEventListener('focusout', function () {
      setTimeout(function () { if (doc && !upr(doc.activeElement) && !(lista && lista.contains(doc.activeElement))) skryjListu(); }, 150);
    });
    doc.addEventListener('mouseover', function (e) {
      if (e.target.closest('.rnd-pol')) return;
      var it = e.target.closest('[data-polozka], [data-rnd-novy]');
      if (it) ukazPolozku(it); else if (pol) pol.hidden = true;
    });
    frame.contentWindow.addEventListener('scroll', polohaListy, { passive: true });
    frame.contentWindow.addEventListener('resize', polohaListy);
  }

  function klik(e) {
    if (e.target.closest('.rnd-tb, .rnd-pol')) return;
    if (upr(e.target)) {
      if (e.target.closest('a, label, summary, button')) e.preventDefault();
      return;
    }
    var a = e.target.closest('a[href]');
    if (a) {
      var href = a.getAttribute('href');
      if (/^(mailto:|tel:)/i.test(href)) { e.preventDefault(); toast('Odkazy na e-mail a telefon v náhledu nefungují.'); return; }
      if (a.origin !== location.origin) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); }
      return; // vlastní stránka: náhled na ni přejde, koncept zůstává
    }
    if (e.target.closest('summary')) e.preventDefault(); // otázky nechat rozbalené
  }

  /* ---------- Lišta nad upravovaným textem ---------- */
  function nastroje() {
    lista = doc.createElement('div');
    lista.className = 'rnd-tb';
    lista.hidden = true;
    lista.setAttribute('role', 'toolbar');
    lista.setAttribute('aria-label', 'Úprava textu');
    lista.innerHTML =
      '<button type="button" data-c="bold" title="Tučně (' + (MAC ? '⌘B' : 'Ctrl+B') + ')" aria-label="Tučně"><b>B</b></button>' +
      '<button type="button" data-c="italic" title="Kurzíva (' + (MAC ? '⌘I' : 'Ctrl+I') + ')" aria-label="Kurzíva"><em>I</em></button>' +
      '<button type="button" data-c="link" title="Odkaz (' + (MAC ? '⌘K' : 'Ctrl+K') + ')">' + ICONS.odkaz + '<span>Odkaz</span></button>' +
      '<span class="rnd-tb__sep"></span>' +
      '<button type="button" data-c="reset" title="Vrátit text do zveřejněné podoby">' + ICONS.zpet + '<span>Původní</span></button>' +
      '<div class="rnd-tb__link" hidden><input type="text" inputmode="url" placeholder="https://… nebo e-mail" aria-label="Adresa odkazu">' +
      '<button type="button" data-c="link-ok">Použít</button><button type="button" data-c="unlink" title="Zrušit odkaz">Zrušit odkaz</button></div>';
    doc.body.appendChild(lista);
    lista.addEventListener('mousedown', function (e) { if (!e.target.closest('input')) e.preventDefault(); });
    lista.addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (b) prikaz(b.getAttribute('data-c')); });
    lista.querySelector('input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); prikaz('link-ok'); }
      if (e.key === 'Escape') { e.preventDefault(); odkazRadek(false); obnovRozsah(); }
    });

    pol = doc.createElement('div');
    pol.className = 'rnd-pol';
    pol.hidden = true;
    doc.body.appendChild(pol);
    pol.addEventListener('mousedown', function (e) { e.preventDefault(); });
    pol.addEventListener('click', function (e) {
      var b = e.target.closest('[data-p]');
      if (!b || !polCil) return;
      ({ pridat: pridatPolozku, smazat: smazatPolozku, obnovit: obnovitPolozku })[b.getAttribute('data-p')](polCil);
    });
  }

  function ukazListu(el) {
    if (zamceno || !lista) return;
    listaEl = el;
    odkazRadek(false);
    lista.querySelector('[data-c="reset"]').hidden = !jeTextova(el.getAttribute('data-k'));
    lista.hidden = false;
    polohaListy();
  }
  function skryjListu() { if (lista) lista.hidden = true; listaEl = null; }
  function polohaListy() {
    var w = frame.contentWindow;
    if (lista && !lista.hidden && listaEl) {
      var r = listaEl.getBoundingClientRect(), h = lista.offsetHeight, wd = lista.offsetWidth;
      var top = r.top - h - 12 < 8 ? r.bottom + 12 : r.top - h - 12;
      var left = Math.min(Math.max(r.left, 8), doc.documentElement.clientWidth - wd - 8);
      lista.style.top = (top + w.scrollY) + 'px';
      lista.style.left = (Math.max(left, 8) + w.scrollX) + 'px';
    }
    if (pol && !pol.hidden && polCil) {
      var q = polCil.getBoundingClientRect();
      pol.style.top = (q.top + w.scrollY - 16) + 'px';
      pol.style.left = (Math.max(q.right - pol.offsetWidth - 12, 8) + w.scrollX) + 'px';
    }
  }
  function odkazRadek(on) {
    lista.querySelector('.rnd-tb__link').hidden = !on;
    polohaListy();
  }
  function obnovRozsah() {
    if (!rozsah || !listaEl) return;
    listaEl.focus();
    var s = frame.contentWindow.getSelection();
    s.removeAllRanges();
    s.addRange(rozsah);
  }
  function adresa(v) {
    v = v.trim();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'mailto:' + v;
    if (/^\+?[\d\s]{9,}$/.test(v)) return 'tel:' + v.replace(/\s/g, '');
    if (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(v)) return v;
    if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(v)) return 'https://' + v;
    return null;
  }
  function prikaz(c) {
    var el = listaEl;
    if (!el) return;
    var s = frame.contentWindow.getSelection();
    if (c === 'bold' || c === 'italic') { doc.execCommand(c); return; }
    if (c === 'reset') {
      var p = puvodni.get(el);
      if (p && p.html != null) { el.innerHTML = p.html; zmena(el); }
      return;
    }
    if (c === 'link') {
      var uvnitr = s.rangeCount && s.anchorNode && (s.anchorNode.nodeType === 3 ? s.anchorNode.parentElement : s.anchorNode).closest('a');
      if (!s.rangeCount || (s.isCollapsed && !uvnitr)) { toast('Nejdřív v textu označte slova, ze kterých má být odkaz.'); return; }
      if (s.isCollapsed && uvnitr) { var r0 = doc.createRange(); r0.selectNodeContents(uvnitr); s.removeAllRanges(); s.addRange(r0); }
      rozsah = s.getRangeAt(0).cloneRange();
      var inp = lista.querySelector('.rnd-tb__link input');
      inp.value = uvnitr ? uvnitr.getAttribute('href') : '';
      lista.querySelector('[data-c="unlink"]').hidden = !uvnitr;
      odkazRadek(true);
      inp.focus();
      return;
    }
    if (c === 'link-ok') {
      var url = adresa(lista.querySelector('.rnd-tb__link input').value);
      if (!url) { toast('Tohle nevypadá jako adresa. Zkuste třeba https://www.kladno.cz nebo e-mail.', 'error'); return; }
      obnovRozsah();
      doc.execCommand('createLink', false, url);
      odkazRadek(false);
      zmena(el);
      return;
    }
    if (c === 'unlink') { obnovRozsah(); doc.execCommand('unlink'); odkazRadek(false); zmena(el); }
  }

  /* ---------- Opakované položky (časté dotazy): přidat a smazat ---------- */
  function ukazPolozku(it) {
    if (zamceno || !pol) return;
    polCil = it;
    pol.innerHTML = it.hasAttribute('data-rnd-smazano')
      ? '<button type="button" data-p="obnovit">' + ICONS.zpet + 'Nemazat</button>'
      : '<button type="button" data-p="pridat">' + ICONS.plus + 'Přidat otázku pod</button><button type="button" data-p="smazat">' + ICONS.kos + 'Smazat</button>';
    pol.hidden = false;
    polohaListy();
  }

  function provedOp(o) {
    if (o.typ === 'pridat') {
      var vzor = doc.querySelector('[data-polozka="' + o.za + '"], [data-rnd-novy="' + o.za + '"]');
      if (!vzor) return null;
      var klon = vzor.cloneNode(true);
      ['id', 'data-polozka', 'data-rnd-smazano'].forEach(function (a) { klon.removeAttribute(a); });
      klon.setAttribute('data-rnd-novy', 'novy-' + o.id);
      if ('open' in klon) klon.open = true;
      $$('[data-k]', klon).forEach(function (el, i) {
        var k = 'novy-' + o.id + '-' + i;
        el.setAttribute('data-k', k);
        el.removeAttribute('data-rnd-zmena');
        el.innerHTML = koncept.zmeny[k] ? koncept.zmeny[k].po : (i === 0 ? 'Nová otázka' : 'Napište odpověď.');
        puvodni.set(el, { html: null, text: '' });
      });
      vzor.after(klon);
      return klon;
    }
    var it = doc.querySelector('[data-polozka="' + o.polozka + '"]');
    if (it) {
      it.setAttribute('data-rnd-smazano', '');
      $$('[data-k]', it).forEach(function (el) { el.setAttribute('contenteditable', 'false'); });
    }
    return it;
  }

  function pridatPolozku(it) {
    var o = { typ: 'pridat', id: Math.random().toString(36).slice(2, 8), za: it.getAttribute('data-polozka') || it.getAttribute('data-rnd-novy'), slug: aktualni };
    koncept.operace.push(o);
    var klon = provedOp(o);
    $$('[data-k]', klon).forEach(function (el) { pripravPrvek(el); zmena(el); });
    ulozKoncept();
    var q = klon.querySelector('[data-k]');
    q.scrollIntoView({ block: 'center' });
    q.focus();
    var r = doc.createRange();
    r.selectNodeContents(q);
    var s = frame.contentWindow.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    toast('Nová otázka je v konceptu. Přepište otázku i odpověď a pak ji zveřejněte.');
  }

  function odebratNovou(tmp) {
    var o = koncept.operace.filter(function (x) { return x.typ === 'pridat' && 'novy-' + x.id === tmp; })[0];
    if (!o) return;
    koncept.operace.forEach(function (x) { if (x.za === tmp) x.za = o.za; });
    koncept.operace = koncept.operace.filter(function (x) { return x !== o; });
    Object.keys(koncept.zmeny).forEach(function (k) { if (k.indexOf(tmp + '-') === 0) delete koncept.zmeny[k]; });
    var el = doc && doc.querySelector('[data-rnd-novy="' + tmp + '"]');
    if (el) el.remove();
    ulozKoncept();
  }

  function smazatPolozku(it) {
    var tmp = it.getAttribute('data-rnd-novy');
    pol.hidden = true;
    skryjListu();
    if (tmp) { odebratNovou(tmp); return; }
    var q = (it.querySelector('[data-k]') || it).textContent.trim();
    if (!confirm('Smazat otázku „' + q + '“?\n\nZ webu zmizí až po zveřejnění. Do té doby to jde vrátit.')) return;
    $$('[data-k]', it).forEach(function (el) {
      var k = el.getAttribute('data-k');
      if (koncept.zmeny[k]) { delete koncept.zmeny[k]; el.innerHTML = puvodni.get(el).html; oznac(el); }
    });
    var o = { typ: 'smazat', polozka: it.getAttribute('data-polozka'), slug: aktualni, text: q };
    koncept.operace.push(o);
    provedOp(o);
    ulozKoncept();
  }

  function obnovitPolozku(it) {
    var k = it.getAttribute('data-polozka');
    koncept.operace = koncept.operace.filter(function (x) { return !(x.typ === 'smazat' && x.polozka === k); });
    it.removeAttribute('data-rnd-smazano');
    $$('[data-k]', it).forEach(function (el) { el.setAttribute('contenteditable', 'true'); });
    if (pol) pol.hidden = true;
    ulozKoncept();
  }

  /* ---------- Panely vpravo ---------- */
  function drawer(nadpis, body, foot) {
    var d = $('#a-drawer');
    $('#a-drawer-title').textContent = nadpis;
    $('#a-drawer-body').innerHTML = body;
    $('#a-drawer-foot').innerHTML = foot || '';
    fillIcons(d);
    if (!d.open) d.showModal();
    return d;
  }

  function panel(name) {
    ({ zmeny: panelZmeny, historie: panelHistorie, google: panelGoogle, napoveda: panelNapoveda, menu: panelMenu })[name]();
  }

  function seznamZmen() {
    var skupiny = {}, poradi = [];
    var add = function (slug, item) { if (!skupiny[slug]) { skupiny[slug] = []; poradi.push(slug); } skupiny[slug].push(item); };
    Object.keys(koncept.zmeny).forEach(function (k) {
      if (!jeTextova(k)) return;
      var z = koncept.zmeny[k];
      if (k.indexOf('@') > 0) {
        var slug = k.split(':')[0];
        add(slug, { k: k, popis: k.indexOf('@title') > 0 ? 'Název pro Google' : 'Popis pro Google', pred: z.pred, po: z.po, stranka: slug });
      } else add(z.stranka, { k: k, popis: z.popis, pred: z.pred, po: text(z.po), stranka: z.stranka === 'layout' ? aktualni || 'uvod' : z.stranka });
    });
    koncept.operace.forEach(function (o, i) {
      if (o.typ === 'pridat') {
        var q = koncept.zmeny['novy-' + o.id + '-0'], a = koncept.zmeny['novy-' + o.id + '-1'];
        add(o.slug, { op: i, popis: 'Nová otázka', po: (q ? text(q.po) : '') + (a ? ' – ' + text(a.po) : ''), k: 'novy-' + o.id + '-0', stranka: o.slug });
      } else add(o.slug, { op: i, popis: 'Smazaná otázka', pred: o.text, stranka: o.slug, k: o.polozka });
    });
    return { skupiny: skupiny, poradi: poradi };
  }

  var konflikty = [];
  function panelZmeny() {
    var s = seznamZmen(), n = pocty();
    if (!n) {
      drawer('Změny ke zveřejnění', '<div class="a-empty">' + ico('tuzka') + '<strong>Zatím tu nic není</strong><p>Klikněte v náhledu na libovolný text a přepište ho. Změna se tu objeví jako koncept.</p></div>');
      return;
    }
    var html = '<p class="a-lead">Zkontrolujte, co se na webu změní. Návštěvníci to uvidí až po zveřejnění.</p>';
    s.poradi.forEach(function (slug) {
      html += '<section class="a-group"><h3 class="a-group__title">' + esc(nazev(slug)) + '</h3>';
      s.skupiny[slug].forEach(function (z) {
        var konf = konflikty.indexOf(z.k) > -1;
        html += '<article class="a-change"' + (konf ? ' data-konflikt' : '') + '><div class="a-change__head"><span>' + esc(z.popis) + '</span></div>' +
          (z.pred ? '<del>' + esc(z.pred) + '</del>' : '') + (z.po ? '<ins>' + esc(z.po) + '</ins>' : '') +
          (konf ? '<p class="a-change__msg">Tenhle text se mezitím na webu změnil. Zkopírujte si svou verzi, klikněte na Zahodit a upravte ho znovu.</p>' : '') +
          '<div class="a-change__actions">' +
          (z.op == null || koncept.operace[z.op].typ === 'pridat' ? '<button type="button" class="a-link" data-ukazat="' + esc(z.stranka) + '" data-k="' + esc(z.k) + '">' + ico('oko') + 'Ukázat</button>' : '') +
          '<button type="button" class="a-link" data-zahodit="' + esc(z.k) + '"' + (z.op != null ? ' data-op="' + z.op + '"' : '') + '>' + ico('zpet') + 'Zahodit</button></div></article>';
      });
      html += '</section>';
    });
    var d = drawer('Změny ke zveřejnění', html,
      '<button type="button" class="a-btn a-btn--primary a-btn--block" data-zverejnit>Zveřejnit ' + n + ' ' + (n === 1 ? 'změnu' : n < 5 ? 'změny' : 'změn') + '</button>' +
      '<p class="a-note">Na webu to bude zhruba do minuty. Každou změnu jde později vrátit v Historii.</p>');
    $('#a-drawer-body').onclick = function (e) {
      var u = e.target.closest('[data-ukazat]'), z = e.target.closest('[data-zahodit]');
      if (u) { d.close(); jdi(u.getAttribute('data-ukazat'), u.getAttribute('data-k')); }
      if (z) { zahodit(z.getAttribute('data-zahodit'), z.getAttribute('data-op')); panelZmeny(); }
    };
    $('#a-drawer-foot').onclick = function (e) { if (e.target.closest('[data-zverejnit]')) zverejnit(e.target.closest('[data-zverejnit]')); };
  }

  function zahodit(k, op) {
    if (op != null) {
      var o = koncept.operace[Number(op)];
      if (!o) return;
      if (o.typ === 'pridat') odebratNovou('novy-' + o.id);
      else {
        var it = doc && doc.querySelector('[data-polozka="' + o.polozka + '"]');
        if (it) obnovitPolozku(it);
        else { koncept.operace = koncept.operace.filter(function (x) { return x !== o; }); ulozKoncept(); }
      }
      return;
    }
    delete koncept.zmeny[k];
    var el = najdi(k);
    if (el && puvodni.get(el)) { el.innerHTML = puvodni.get(el).html; oznac(el); }
    konflikty = konflikty.filter(function (x) { return x !== k; });
    ulozKoncept();
  }

  function zverejnit(btn) {
    var prazdne = Object.keys(koncept.zmeny).filter(function (k) { return !text(koncept.zmeny[k].po); });
    if (prazdne.length) { toast('Některý text je prázdný. Napište ho, nebo změnu zahoďte.', 'error'); return; }
    var nevyplnene = Object.keys(koncept.zmeny).filter(function (k) { return !jeTextova(k) && /^(Nová otázka|Napište odpověď\.)$/.test(text(koncept.zmeny[k].po)); });
    if (nevyplnene.length && !confirm('Nová otázka má pořád text „Nová otázka“ nebo „Napište odpověď.“ Opravdu zveřejnit?')) return;
    btn.disabled = true;
    btn.textContent = 'Ukládám…';
    var zmeny = Object.keys(koncept.zmeny).map(function (k) { return { k: k, pred: koncept.zmeny[k].pred || '', po: koncept.zmeny[k].po }; });
    var operace = koncept.operace.map(function (o) { return o.typ === 'pridat' ? { typ: 'pridat', id: o.id, za: o.za } : { typ: 'smazat', polozka: o.polozka }; });
    api('ulozit', { zmeny: zmeny, operace: operace }).then(function (r) {
      if (r.ok) {
        koncept = { zmeny: {}, operace: [] };
        konflikty = [];
        ulozKoncept();
        $('#a-drawer').close();
        store.set(KEY.zverejneni, { sha: r.sha, at: Date.now() });
        sledovat();
        return;
      }
      if (r.status === 401) { $('#a-drawer').close(); prihlaseni(function () { brana('a-app'); panelZmeny(); }); return; }
      if (r.status === 409) {
        konflikty = r.klice || [];
        konflikty.forEach(function (k) { var el = najdi(k); if (el) el.setAttribute('data-rnd-konflikt', ''); });
        panelZmeny();
        toast('Některé texty se mezitím změnily. Jsou označené červeně.', 'error');
        return;
      }
      btn.disabled = false;
      btn.textContent = 'Zkusit znovu';
      toast(r.status === 503 ? 'Správa webu není na serveru zapnutá. Dejte vědět správci webu.' : 'Zveřejnění se nepovedlo. Zkuste to prosím za chvíli znovu.', 'error');
    });
  }

  function cekajici() {
    var p = store.get(KEY.zverejneni);
    if (p && Date.now() - p.at < 15 * 60 * 1000) return p;
    store.del(KEY.zverejneni);
    return null;
  }
  function zamknout(on) {
    zamceno = on;
    $('#a-busy').hidden = !on;
    if (!doc) return;
    $$('[data-k]', doc).forEach(function (el) { if (!el.closest('[data-rnd-smazano]') && !el.closest('[hidden]')) el.setAttribute('contenteditable', on ? 'false' : 'true'); });
    if (on) { skryjListu(); if (pol) pol.hidden = true; }
  }
  function obnovitNahled() {
    try { scrollPo = frame.contentWindow.scrollY; frame.contentWindow.location.reload(); } catch (e) { jdi(aktualni || 'uvod'); }
  }
  function sledovat() {
    var p = cekajici();
    if (!p) { zamknout(false); return; }
    zamknout(true);
    var pomale = Date.now() - p.at > 2 * 60 * 1000;
    $('#a-busy-title').textContent = 'Zveřejňuji změny…';
    $('#a-busy-text').textContent = pomale
      ? 'Trvá to déle než obvykle. Ještě chvíli prosím počkejte.'
      : 'Web se právě znovu sestavuje. Obvykle to trvá do minuty, pak se náhled sám obnoví.';
    api('stav&sha=' + encodeURIComponent(p.sha)).then(function (r) {
      if (r.status === 401) { prihlaseni(function () { brana('a-app'); sledovat(); }); return; }
      var hotovo = function () {
        store.del(KEY.zverejneni);
        zamknout(false);
        obnovitNahled();
        toast('Hotovo! Změny jsou na webu.', 'ok', $('#a-open').getAttribute('href'));
      };
      if (r.nasazeni === 'success') return hotovo();
      if (r.nasazeni === 'nezname') { setTimeout(hotovo, Math.max(0, 50000 - (Date.now() - p.at))); return; }
      if (r.nasazeni === 'failure' || r.nasazeni === 'error') {
        store.del(KEY.zverejneni);
        zamknout(false);
        obnovitNahled();
        toast('Zveřejnění se nepovedlo, web zůstává v předchozí podobě. Dejte prosím vědět správci webu.', 'error');
        return;
      }
      setTimeout(sledovat, 4000);
    });
  }

  function panelHistorie() {
    drawer('Historie změn', '<p class="a-lead">Načítám…</p>');
    api('historie').then(function (r) {
      if (r.status === 401) { $('#a-drawer').close(); prihlaseni(function () { brana('a-app'); panelHistorie(); }); return; }
      if (!r.ok) { $('#a-drawer-body').innerHTML = '<p class="a-error">Historii se nepodařilo načíst. Zkuste to za chvíli.</p>'; return; }
      if (!r.historie.length) { $('#a-drawer-body').innerHTML = '<div class="a-empty">' + ico('historie') + '<strong>Zatím žádné změny</strong></div>'; fillIcons($('#a-drawer')); return; }
      var html = '<p class="a-lead">Posledních 20 změn webu. Kteroukoli změnu ze správy webu jde jedním kliknutím vrátit.</p>';
      r.historie.forEach(function (h) {
        var nadpis = h.nadpis.replace(/^Úprava webu: /, 'Upraveno: ');
        html += '<article class="a-hist"><time datetime="' + esc(h.datum) + '">' + esc(datum.format(new Date(h.datum))) + '</time>' +
          '<p class="a-hist__title">' + esc(h.vratit ? nadpis : 'Úprava od správce webu') + '</p>' +
          (h.body.length ? '<ul>' + h.body.slice(0, 4).map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + (h.body.length > 4 ? '<li>… a další</li>' : '') + '</ul>' : '') +
          (h.vratit ? '<button type="button" class="a-btn a-btn--ghost a-btn--small" data-vratit="' + esc(h.sha) + '" data-kdy="' + esc(datum.format(new Date(h.datum))) + '">' + ico('zpet') + 'Vrátit tuto změnu</button>' : '') +
          '</article>';
      });
      $('#a-drawer-body').innerHTML = html;
      fillIcons($('#a-drawer'));
      $('#a-drawer-body').onclick = function (e) {
        var b = e.target.closest('[data-vratit]');
        if (!b) return;
        if (!confirm('Vrátit změnu z ' + b.getAttribute('data-kdy') + '?\n\nTexty se vrátí do podoby, jakou měly před ní. Na webu to bude zhruba do minuty.')) return;
        b.disabled = true;
        api('vratit', { sha: b.getAttribute('data-vratit') }).then(function (v) {
          if (v.ok) { $('#a-drawer').close(); store.set(KEY.zverejneni, { sha: v.sha, at: Date.now() }); sledovat(); return; }
          b.disabled = false;
          toast(v.status === 409 ? 'Tuhle změnu už nejde vrátit automaticky: stejné texty se od té doby znovu změnily.' : 'Vrácení se nepovedlo. Zkuste to za chvíli.', 'error');
        });
      };
    });
  }

  function panelGoogle() {
    if (!doc || !aktualni) return;
    var kT = aktualni + ':@title', kD = aktualni + ':@description';
    var meta = doc.querySelector('meta[name="description"]');
    var t0 = doc.title, d0 = meta ? meta.getAttribute('content') : '';
    var t = koncept.zmeny[kT] ? koncept.zmeny[kT].po : t0, dsc = koncept.zmeny[kD] ? koncept.zmeny[kD].po : d0;
    var url = WEB + (frame.contentWindow.location.pathname === '/' ? '' : frame.contentWindow.location.pathname.replace(/\/$/, '').replace(/\//g, ' › '));
    drawer('Název a popis pro Google',
      '<p class="a-lead">Takhle se stránka „' + esc(nazev(aktualni)) + '“ ukazuje ve vyhledávání Google a na záložce prohlížeče.</p>' +
      '<label class="a-label" for="a-g-t">Název stránky<span class="a-hint">Krátce a výstižně, ideálně do 60 znaků.</span></label>' +
      '<input class="a-input" id="a-g-t" type="text" value="' + esc(t) + '"><span class="a-count" id="a-g-tc"></span>' +
      '<label class="a-label" for="a-g-d">Popis<span class="a-hint">Jedna až dvě věty, ideálně do 160 znaků.</span></label>' +
      '<textarea class="a-input" id="a-g-d" rows="4">' + esc(dsc) + '</textarea><span class="a-count" id="a-g-dc"></span>' +
      '<div class="a-serp" aria-hidden="true"><p class="a-serp__label">Náhled ve vyhledávání</p><p class="a-serp__url">' + esc(url) + '</p><p class="a-serp__title" id="a-g-pt"></p><p class="a-serp__desc" id="a-g-pd"></p></div>',
      '<button type="button" class="a-btn a-btn--ghost a-btn--block" data-close>Hotovo</button><p class="a-note">Změna se uloží do konceptu a zveřejní se s ostatními změnami.</p>');
    var it = $('#a-g-t'), id = $('#a-g-d');
    var obnov = function () {
      [[it, kT, t0, 60, '#a-g-tc', '#a-g-pt'], [id, kD, d0, 160, '#a-g-dc', '#a-g-pd']].forEach(function (x) {
        var v = x[0].value.replace(/\s+/g, ' ').trim();
        if (v && v !== x[2]) koncept.zmeny[x[1]] = { po: v, pred: x[2], stranka: aktualni, popis: '' };
        else delete koncept.zmeny[x[1]];
        var c = $(x[4]);
        c.textContent = v.length + ' / ' + x[3] + ' znaků';
        c.toggleAttribute('data-over', v.length > x[3]);
        $(x[5]).textContent = v || '(prázdné)';
      });
      ulozKoncept();
    };
    it.addEventListener('input', obnov);
    id.addEventListener('input', obnov);
    obnov();
  }

  function panelNapoveda() {
    drawer('Jak upravovat',
      '<div class="a-help">' +
      '<section><h3>Přepsat text</h3><p>Najeďte myší na text v náhledu, klikněte do něj a pište. Upravit jde nadpisy, odstavce, tlačítka, otázky i patičku.</p></section>' +
      '<section><h3>Tučné písmo a odkazy</h3><p>Nad textem, který upravujete, je lišta. Označte slova a klikněte na <kbd>B</kbd> (tučně) nebo <kbd>Odkaz</kbd>. Nový řádek: <kbd>Shift</kbd> + <kbd>Enter</kbd>.</p></section>' +
      '<section><h3>Časté dotazy</h3><p>Najeďte na otázku. Objeví se tlačítka „Přidat otázku pod“ a „Smazat“.</p></section>' +
      '<section><h3>Koncept a zveřejnění</h3><p>Změny se ukládají jako koncept v tomto prohlížeči. Návštěvníci je uvidí až po kliknutí na „Zveřejnit změny“. Koncept je jen na tomto počítači, proto ho zveřejněte dřív, než přejdete na jiný.</p></section>' +
      '<section><h3>Vrácení změny</h3><p>V Historii je každá zveřejněná změna. Tlačítkem „Vrátit tuto změnu“ ji vrátíte zpátky.</p></section>' +
      '<section><h3>Co tady upravit nejde</h3><ul><li>fotky, barvy a rozložení stránky,</li><li>hlavní menu a nové stránky,</li><li>formulář (jen jeho popisky).</li></ul><p>S tím pomůže správce webu.</p></section>' +
      '</div>');
  }

  function panelMenu() {
    drawer('Možnosti',
      '<div class="a-menu">' +
      '<button type="button" class="a-side__btn" data-panel="historie">' + ico('historie') + 'Historie a vrácení změn</button>' +
      '<button type="button" class="a-side__btn" data-panel="google">' + ico('google') + 'Název a popis pro Google</button>' +
      '<button type="button" class="a-side__btn" data-panel="napoveda">' + ico('napoveda') + 'Jak upravovat</button>' +
      '<a class="a-side__btn" href="/" target="_blank" rel="noopener">' + ico('ven') + 'Otevřít web v nové záložce</a>' +
      '<button type="button" class="a-side__btn" data-odhlasit>' + ico('odhlasit') + 'Odhlásit se</button>' +
      '</div>');
    $('#a-drawer-body').onclick = function (e) {
      if (!e.target.closest('[data-odhlasit]')) return;
      api('odhlasit', {}).then(function () { $('#a-drawer').close(); prihlaseni(function () { brana('a-app'); }); });
    };
  }

  /* ---------- Start ---------- */
  api('stav').then(function (r) {
    if (r.ok) return start();
    if (r.status === 503) return brana('a-off');
    prihlaseni();
    if (r.status !== 401) $('#a-login-error').textContent = 'Nepodařilo se spojit se serverem. Zkuste stránku obnovit.';
  });
})();
