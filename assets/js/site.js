/* Rada na dosah – drobná vylepšení. Web funguje i bez JavaScriptu. */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var store = {
    get: function (s, k) { try { return window[s].getItem(k); } catch (e) { return null; } },
    set: function (s, k, v) { try { window[s].setItem(k, v); } catch (e) {} },
    del: function (s, k) { try { window[s].removeItem(k); } catch (e) {} }
  };

  /* ---------- Hlavní menu na mobilu (disclosure, bez pasti na fokus) ---------- */
  function initNav() {
    var btn = $('.nav-toggle');
    var nav = $('#hlavni-menu');
    if (!btn || !nav) return;
    var mq = window.matchMedia('(max-width: 1359px)');
    var label = btn.querySelector('span');

    function setOpen(open, returnFocus) {
      btn.setAttribute('aria-expanded', String(open));
      nav.hidden = !open;
      if (label) label.textContent = open ? 'Zavřít' : 'Menu';
      if (!open && returnFocus) btn.focus();
    }
    function sync() {
      if (mq.matches) { setOpen(false); } else { nav.hidden = false; btn.setAttribute('aria-expanded', 'false'); }
    }
    btn.addEventListener('click', function () { setOpen(btn.getAttribute('aria-expanded') !== 'true'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && mq.matches && btn.getAttribute('aria-expanded') === 'true') setOpen(false, true);
    });
    document.addEventListener('click', function (e) {
      if (!mq.matches || btn.getAttribute('aria-expanded') !== 'true') return;
      if (!nav.contains(e.target) && !btn.contains(e.target)) setOpen(false);
    });
    nav.addEventListener('click', function (e) {
      if (mq.matches && e.target.closest('a')) setOpen(false);
    });
    if (mq.addEventListener) mq.addEventListener('change', sync); else mq.addListener(sync);
    sync();
  }

  /* ---------- Kopírování (e-mail, číslo účtu) ---------- */
  function initCopy() {
    if (!navigator.clipboard) return;
    var live = $('[data-copy-status]');
    if (!live) {
      live = document.createElement('p');
      live.className = 'vh'; live.setAttribute('role', 'status'); live.setAttribute('aria-live', 'polite');
      document.body.appendChild(live);
    }
    $$('[data-copy]').forEach(function (btn) {
      var target = $(btn.getAttribute('data-copy'));
      if (!target || target.querySelector('.todo')) return;
      btn.hidden = false;
      var original = btn.lastChild.textContent;
      btn.addEventListener('click', function () {
        navigator.clipboard.writeText(target.textContent.trim()).then(function () {
          btn.lastChild.textContent = 'Zkopírováno';
          live.textContent = 'Zkopírováno do schránky.';
          setTimeout(function () { btn.lastChild.textContent = original; live.textContent = ''; }, 2500);
        });
      });
    });
  }

  /* ---------- Časté dotazy ---------- */
  function initFaq() {
    var list = $('#faq-list');
    if (!list) return;
    var items = $$('details', list);
    var btn = $('[data-faq-toggle]');
    function openFromHash() {
      var id = decodeURIComponent(location.hash.slice(1));
      var d = id && document.getElementById(id);
      if (d && d.tagName === 'DETAILS') { d.open = true; }
    }
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    if (!btn) return;
    btn.hidden = false;
    function update() {
      var allOpen = items.every(function (d) { return d.open; });
      btn.textContent = allOpen ? 'Sbalit všechny odpovědi' : 'Rozbalit všechny odpovědi';
      btn.setAttribute('aria-expanded', String(allOpen));
    }
    btn.addEventListener('click', function () {
      var allOpen = items.every(function (d) { return d.open; });
      items.forEach(function (d) { d.open = !allOpen; });
      update();
    });
    items.forEach(function (d) { d.addEventListener('toggle', update); });
    update();
  }

  /* ---------- Co si vzít s sebou: odškrtávání + tisk ---------- */
  function initChecklist() {
    var boxes = $$('.bring__item input');
    if (!boxes.length) return;
    var key = 'pkl-s-sebou';
    var saved = (store.get('localStorage', key) || '').split(',');
    boxes.forEach(function (b) {
      if (saved.indexOf(b.value) > -1) b.checked = true;
      b.addEventListener('change', function () {
        store.set('localStorage', key, boxes.filter(function (x) { return x.checked; }).map(function (x) { return x.value; }).join(','));
      });
    });
    var printBtn = $('[data-print-checklist]');
    if (printBtn && window.print) {
      printBtn.hidden = false;
      printBtn.addEventListener('click', function () {
        document.documentElement.classList.add('print-only-checklist');
        window.print();
      });
      window.addEventListener('afterprint', function () { document.documentElement.classList.remove('print-only-checklist'); });
    }
  }

  /* ---------- Formulář ---------- */
  function plural(n, one, few, many) {
    var r = new Intl.PluralRules('cs').select(n);
    return r === 'one' ? one : (r === 'few' ? few : many);
  }
  function fmt(n) { return n.toLocaleString('cs-CZ'); }

  function initForm() {
    var form = $('[data-contact-form]');
    if (!form) return;
    var card = form.closest('.form-card');
    var summary = $('#chyby');
    var summaryList = summary ? $('ul', summary) : null;
    var status = $('[data-form-status]', form);
    var popis = $('#popis', form);
    var counter = $('#popis-count', form);
    var counterLive = $('#popis-count-live', form);
    var max = counter ? parseInt(counter.getAttribute('data-max'), 10) : 1000;
    var draftKey = 'pkl-formular';
    var startedAt = Date.now();
    var submitted = false;
    var sending = false;
    var baseTitle = document.title;

    /* Návrat ze serveru bez JavaScriptu (?chyba=…) */
    var chyba = new URLSearchParams(location.search).get('chyba');
    if (chyba) {
      status.className = 'form-status form-status--error';
      status.textContent = chyba === 'odeslani'
        ? 'Zprávu se nepodařilo odeslat. Zkuste to prosím znovu, nebo napište na info@radanadosah.cz.'
        : 'Formulář obsahuje chyby. Zkontrolujte prosím vyplněná pole.';
    }

    /* Předvybrané téma z odkazu (?tema=najem) */
    var map = { najem: 'tema-najem', dluhy: 'tema-dluhy', davky: 'tema-davky', jine: 'tema-jine' };
    var tema = new URLSearchParams(location.search).get('tema');
    if (tema && map[tema]) { var r = document.getElementById(map[tema]); if (r) r.checked = true; }

    /* Rozepsaná zpráva přežije obnovení stránky (jen v této záložce) */
    var fields = ['jmeno', 'telefon', 'email', 'obec', 'popis', 'kdy'];
    try {
      var draft = JSON.parse(store.get('sessionStorage', draftKey) || 'null');
      if (draft) {
        fields.forEach(function (n) { if (draft[n] && form.elements[n] && !form.elements[n].value) form.elements[n].value = draft[n]; });
        if (draft.tema && !tema) { var radio = form.querySelector('input[name="tema"][value="' + draft.tema + '"]'); if (radio) radio.checked = true; }
      }
    } catch (e) {}
    function saveDraft() {
      var d = {};
      fields.forEach(function (n) { d[n] = form.elements[n].value; });
      var t = form.querySelector('input[name="tema"]:checked');
      d.tema = t ? t.value : '';
      store.set('sessionStorage', draftKey, JSON.stringify(d));
    }
    form.addEventListener('input', saveDraft);
    form.addEventListener('change', saveDraft);

    /* Počítadlo znaků podle GOV.UK: viditelné hned, čtečce se ohlásí po pauze */
    var liveTimer;
    if (popis && counter) {
      var staticHint = document.createElement('p');
      staticHint.className = 'vh'; staticHint.id = 'popis-limit';
      staticHint.textContent = 'Můžete napsat nejvýše ' + fmt(max) + ' znaků.';
      counter.parentNode.insertBefore(staticHint, counter);
      counter.setAttribute('aria-hidden', 'true');
      popis.setAttribute('aria-describedby', 'popis-hint popis-error popis-limit');
      var updateCounter = function (announce) {
        var len = popis.value.length;
        var left = max - len;
        var text = left >= 0
          ? plural(left, 'Zbývá ', 'Zbývají ', 'Zbývá ') + fmt(left) + plural(left, ' znak', ' znaky', ' znaků')
          : 'Máte o ' + fmt(-left) + plural(-left, ' znak', ' znaky', ' znaků') + ' navíc';
        counter.textContent = text;
        counter.classList.toggle('counter--over', left < 0);
        if (announce) {
          clearTimeout(liveTimer);
          liveTimer = setTimeout(function () { counterLive.textContent = text; }, 1000);
        }
      };
      popis.addEventListener('input', function () { updateCounter(true); });
      updateCounter(false);
    }

    function digits(v) { return v.replace(/[^\d]/g, '').replace(/^(00420|420)(?=\d{9}$)/, ''); }
    function rules() {
      var e = {};
      var el = form.elements;
      var tel = el.telefon.value.trim();
      var mail = el.email.value.trim();
      if (!el.jmeno.value.trim()) e.jmeno = 'Napište své jméno a příjmení.';
      if (!tel && !mail) e.kontakt = 'Vyplňte telefon nebo e-mail, abychom se vám mohli ozvat.';
      if (tel && !/^[+\d][\d\s()/-]*$/.test(tel)) e.telefon = 'Telefon může obsahovat jen číslice, mezery a znaménko +. Například 777 123 456.';
      else if (tel && digits(tel).length < 9) e.telefon = 'Telefonní číslo je krátké. Napište ho celé, například 777 123 456.';
      if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) e.email = 'Napište e-mail ve správném tvaru, například jana.novakova@email.cz.';
      if (!form.querySelector('input[name="tema"]:checked')) e.tema = 'Vyberte, s čím potřebujete pomoci.';
      var p = el.popis.value.trim();
      if (!p) e.popis = 'Napište stručně, co řešíte.';
      else if (el.popis.value.length > max) {
        var over = el.popis.value.length - max;
        e.popis = 'Popis je o ' + fmt(over) + plural(over, ' znak', ' znaky', ' znaků') + ' delší. Zkraťte ho na nejvýše ' + fmt(max) + ' znaků.';
      }
      if (!el.souhlas.checked) e.souhlas = 'Potvrďte, že jste se seznámil/a se Zásadami ochrany osobních údajů.';
      return e;
    }
    var targets = { jmeno: 'jmeno', kontakt: 'telefon', telefon: 'telefon', email: 'email-pole', tema: 'tema-najem', popis: 'popis', souhlas: 'souhlas' };
    var order = ['jmeno', 'kontakt', 'telefon', 'email', 'tema', 'popis', 'souhlas'];

    function showErrors(errors) {
      order.forEach(function (name) {
        var wrap = form.querySelector('[data-field="' + name + '"]');
        var msg = document.getElementById(name + '-error');
        if (!wrap || !msg) return;
        var has = !!errors[name];
        wrap.classList.toggle('field--error', has);
        msg.hidden = !has;
        msg.innerHTML = has ? '<svg class="i" viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-8-80V80a8,8,0,0,1,16,0v56a8,8,0,0,1-16,0Zm20,36a12,12,0,1,1-12-12A12,12,0,0,1,140,172Z"/></svg><span><span class="vh">Chyba: </span>' + errors[name] + '</span>' : '';
        if (name === 'kontakt' || name === 'telefon' || name === 'email') return;
        var inputs = name === 'tema' ? $$('input[name="tema"]', form) : [document.getElementById(targets[name])];
        inputs.forEach(function (i) {
          if (has) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid');
        });
      });
      // telefon a e-mail: vlastní chyba, nebo společná chyba „kontakt“
      [form.elements.telefon, form.elements.email].forEach(function (i) {
        var own = i === form.elements.telefon ? errors.telefon : errors.email;
        if (own || errors.kontakt) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid');
      });
    }

    function renderSummary(errors) {
      if (!summary) return;
      var keys = order.filter(function (k) { return errors[k]; });
      summaryList.innerHTML = '';
      keys.forEach(function (k) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#' + targets[k];
        a.textContent = errors[k];
        a.addEventListener('click', function (ev) {
          ev.preventDefault();
          var input = document.getElementById(targets[k]);
          var field = input && input.closest('fieldset') || (input && input.closest('.field'));
          if (field) field.scrollIntoView({ block: 'start' });
          if (input) input.focus({ preventScroll: true });
        });
        li.appendChild(a);
        summaryList.appendChild(li);
      });
      summary.hidden = keys.length === 0;
      document.title = keys.length ? 'Chyba: ' + baseTitle : baseTitle;
    }

    /* Po odeslání jen průběžně mizí opravené chyby; nové se ukážou až při dalším odeslání,
       aby čtečka neopakovala hlášení při každém přechodu mezi poli. */
    var shown = {};
    function revalidate() {
      if (!submitted) return;
      var now = rules();
      var still = {};
      Object.keys(shown).forEach(function (k) { if (now[k]) still[k] = now[k]; });
      if (Object.keys(still).length === Object.keys(shown).length) return;
      shown = still;
      showErrors(still);
      renderSummary(still);
    }
    form.addEventListener('change', revalidate);
    form.addEventListener('focusout', revalidate);

    function showSuccess(demo) {
      store.del('sessionStorage', draftKey);
      document.title = 'Děkujeme – Rada na dosah';
      var html =
        '<div class="success" role="region" aria-labelledby="hotovo-title">' +
          '<div class="success__icon"><svg class="i" viewBox="0 0 256 256" aria-hidden="true" focusable="false"><path d="M229.66,77.66l-128,128a8,8,0,0,1-11.32,0l-56-56a8,8,0,0,1,11.32-11.32L96,188.69,218.34,66.34a8,8,0,0,1,11.32,11.32Z"/></svg></div>' +
          '<h2 id="hotovo-title" tabindex="-1">Děkujeme, vaše zpráva k nám dorazila.</h2>' +
          '<p>Ozveme se vám do 5 pracovních dnů.</p>' +
          '<div class="btn-row"><a class="btn btn--primary" href="' + (card.getAttribute('data-next') || '#') + '">Co si vzít s sebou na schůzku</a></div>' +
          (demo ? '<p class="demo-note">Ukázka: formulář zatím nikam neodesílá. Před spuštěním webu je potřeba nastavit příjem zpráv.</p>' : '') +
        '</div>';
      card.innerHTML = html;
      var h = $('#hotovo-title', card);
      card.scrollIntoView({ block: 'start' });
      if (h) h.focus({ preventScroll: true });
    }

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (sending) return;
      submitted = true;
      var errors = rules();
      shown = errors;
      showErrors(errors);
      renderSummary(errors);
      if (Object.keys(errors).length) {
        summary.scrollIntoView({ block: 'start' });
        summary.focus({ preventScroll: true });
        return;
      }
      var endpoint = form.getAttribute('data-endpoint');
      var btn = form.querySelector('button[type="submit"]');
      sending = true;
      btn.setAttribute('aria-disabled', 'true');
      status.className = 'form-status';
      status.textContent = 'Odesílám…';
      // urlencoded tělo umí Vercel (i obyčejný POST bez JS) rovnou rozparsovat
      var data = new URLSearchParams(new FormData(form));
      data.append('cas_vyplneni_s', String(Math.round((Date.now() - startedAt) / 1000)));

      var done = function (demo) { sending = false; showSuccess(demo); };
      var fail = function () {
        sending = false;
        btn.removeAttribute('aria-disabled');
        status.className = 'form-status form-status--error';
        status.textContent = 'Zprávu se nepodařilo odeslat. Zkuste to prosím znovu, nebo napište na info@radanadosah.cz.';
      };
      if (!endpoint) { setTimeout(function () { done(true); }, 700); return; }
      fetch(endpoint, { method: 'POST', body: data, headers: { 'Accept': 'application/json' } })
        .then(function (res) { if (res.ok) done(false); else fail(); })
        .catch(fail);
    });
  }

  /* ---------- Přepínač barevných kombinací ----------
     Nástroj pro výběr palety s klientem. Na ostré doméně (radanadosah.cz) je skrytý,
     zobrazí se s ?barvy. Odkaz na paletu: ?paleta=pulnoc, vlastní: ?paleta=vlastni&h=2340C8&a=FFCB2E&svetle=1 */
  var PALETTES = [
    { id: 'rozhovor', g: 'tmave', name: 'Rozhovor', note: 'původní', c: ['#2340C8', '#FFCB2E', '#DCE4FF'] },
    { id: 'pulnoc', g: 'tmave', name: 'Půlnoc', note: 'noční modrá, meruňka', c: ['#1E2A4A', '#F4A261', '#DEE4EF'] },
    { id: 'hlubina', g: 'tmave', name: 'Hlubina', note: 'tyrkys, mořská pěna', c: ['#12404A', '#9FDCC8', '#D8EBE7'] },
    { id: 'oliva', g: 'tmave', name: 'Oliva', note: 'olivová, citron', c: ['#3D4A2C', '#E9D66B', '#E2E6D3'] },
    { id: 'kakao', g: 'tmave', name: 'Kakao', note: 'kakao, pudrová', c: ['#4B3329', '#F2B8B0', '#ECE1DA'] },
    { id: 'vino', g: 'tmave', name: 'Víno', note: 'vínová, máslová', c: ['#6A1F33', '#F3D27F', '#F1DDE2'] },
    { id: 'kobalt', g: 'tmave', name: 'Kobalt', note: 'kobalt, růžová', c: ['#2335A8', '#FF9DBB', '#DDE2FA'] },
    { id: 'smaragd', g: 'tmave', name: 'Smaragd', note: 'smaragd, limetka', c: ['#0E5C45', '#C8EE6E', '#D4ECE2'] },
    { id: 'malina', g: 'tmave', name: 'Malina', note: 'malina, broskev', c: ['#8E1B3E', '#FFC29E', '#F6DCE3'] },
    { id: 'uhel', g: 'tmave', name: 'Uhel', note: 'grafit, oranžová', c: ['#23262F', '#FF8A4C', '#E4E6EC'] },
    { id: 'indigo', g: 'tmave', name: 'Indigo', note: 'indigo, citron', c: ['#2E2A6E', '#F2E85C', '#E2E0F3'] },
    { id: 'krem', g: 'svetle', name: 'Krém', note: 'terakota', c: ['#EFE7DA', '#8A3722', '#EBC56A'] },
    { id: 'salvej', g: 'svetle', name: 'Šalvěj', note: 'lesní zelená', c: ['#DCE6DA', '#2E5241', '#F2B880'] },
    { id: 'levandule', g: 'svetle', name: 'Levandule', note: 'fialová, máslo', c: ['#E3DFF3', '#3A2F7A', '#F5D46A'] },
    { id: 'pisek', g: 'svetle', name: 'Písek', note: 'námořní, korál', c: ['#EDE3D1', '#1F2E4D', '#F28C6B'] },
    { id: 'broskev', g: 'svetle', name: 'Broskev', note: 'švestka, hořčice', c: ['#F7DCCD', '#4D2457', '#F2C14E'] },
    { id: 'nebe', g: 'svetle', name: 'Nebe', note: 'modrá, mandarinka', c: ['#DAE8F6', '#1D4E89', '#FFB06E'] }
  ];

  /* Barevná matematika pro vlastní paletu: dopočítá odstíny a hlídá kontrast (AAA) */
  var C = {
    rgb: function (h) { h = h.replace('#', ''); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); },
    hex: function (c) { return '#' + c.map(function (v) { return ('0' + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2); }).join('').toUpperCase(); },
    mix: function (a, b, t) { var x = C.rgb(a), y = C.rgb(b); return C.hex(x.map(function (v, i) { return v + (y[i] - v) * t; })); },
    lum: function (h) { return C.rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (s, v, i) { return s + v * [0.2126, 0.7152, 0.0722][i]; }, 0); },
    con: function (a, b) { var x = C.lum(a), y = C.lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  };
  function customPalette(h, a, light) {
    h = h.toUpperCase(); a = a.toUpperCase();
    var notes = [];
    var p = h, k;
    var paper = C.mix(h, '#F6F4EF', 0.95);
    for (k = 0; k < 40 && (C.con('#FFFFFF', p) < 7 || C.con(p, paper) < 7); k++) p = C.mix(p, '#000000', 0.05);
    if (p !== h) notes.push('hlavní barvu jsem ztmavil kvůli čitelnosti');
    var ink = C.mix(p, '#000000', 0.8);
    var acc = a;
    for (k = 0; k < 40 && (C.con(ink, acc) < 7 || (!light && C.con(acc, p) < 4.5)); k++) acc = C.mix(acc, '#FFFFFF', 0.07);
    if (acc !== a) notes.push('akcent jsem zesvětlil kvůli čitelnosti');
    var sky = C.mix(p, '#FFFFFF', 0.86), onp2 = C.mix(p, '#FFFFFF', 0.93);
    if (C.con(onp2, p) < 7) onp2 = '#FFFFFF';
    var ink2 = C.mix(ink, '#FFFFFF', 0.3);
    for (k = 0; k < 30 && (C.con(ink2, sky) < 7 || C.con(ink2, paper) < 7); k++) ink2 = C.mix(ink2, '#000000', 0.08);
    var v = {
      '--blue': p, '--blue-deep': C.mix(p, '#000000', 0.28), '--on-blue-2': onp2, '--yellow': acc,
      '--sky': sky, '--butter': C.mix(acc, '#FFFFFF', 0.72), '--peach': C.mix(C.mix(p, acc, 0.5), '#FFFFFF', 0.85),
      '--paper': paper, '--ink': ink, '--ink-2': ink2, '--logo-b1-dark': sky
    };
    if (light) {
      var panel = C.mix(p, '#FFFFFF', 0.82);
      for (k = 0; k < 20 && (C.con(ink2, panel) < 7 || C.con(p, panel) < 4.5); k++) panel = C.mix(panel, '#FFFFFF', 0.25);
      v['--panel'] = panel;
    }
    return { vars: v, notes: notes };
  }
  var CUSTOM_KEYS = ['--blue', '--blue-deep', '--on-blue-2', '--yellow', '--sky', '--butter', '--peach', '--paper', '--ink', '--ink-2', '--logo-b1-dark', '--panel'];

  function initPalette() {
    var params = new URLSearchParams(location.search);
    // Dřívější verze skrývala přepínač natrvalo – takové skrytí rušíme, nově platí jen do zavření záložky.
    if (store.get('localStorage', 'pkl-barvy') === '0') store.del('localStorage', 'pkl-barvy');
    var prod = /(^|\.)radanadosah\.cz$/.test(location.hostname);
    if (params.has('barvy')) { store.set('localStorage', 'pkl-barvy', '1'); store.del('sessionStorage', 'pkl-barvy-skryt'); }

    var root = document.documentElement;
    function clearCustom() { CUSTOM_KEYS.forEach(function (k) { root.style.removeProperty(k); }); root.removeAttribute('data-palette-hero'); }
    function applyCustom(h, a, light, save) {
      var r = customPalette('#' + h.replace('#', ''), '#' + a.replace('#', ''), light);
      clearCustom();
      Object.keys(r.vars).forEach(function (k) { root.style.setProperty(k, r.vars[k]); });
      root.setAttribute('data-palette', 'vlastni');
      if (light) root.setAttribute('data-palette-hero', 'svetle');
      if (save) {
        store.set('localStorage', 'pkl-paleta', 'vlastni');
        store.set('localStorage', 'pkl-vlastni', JSON.stringify({ h: h.replace('#', ''), a: a.replace('#', ''), light: !!light, vars: r.vars }));
      }
      return r;
    }
    // vlastní paleta z odkazu
    if (params.get('paleta') === 'vlastni' && /^[0-9a-f]{6}$/i.test(params.get('h') || '') && /^[0-9a-f]{6}$/i.test(params.get('a') || '')) {
      applyCustom(params.get('h'), params.get('a'), params.get('svetle') === '1', true);
    }

    if (prod && store.get('localStorage', 'pkl-barvy') !== '1') return;
    if (store.get('sessionStorage', 'pkl-barvy-skryt') === '1') return;

    var current = function () { return root.getAttribute('data-palette') || 'rozhovor'; };
    var saved = {}; try { saved = JSON.parse(store.get('localStorage', 'pkl-vlastni') || '{}'); } catch (e) {}
    var dots = function (c) { return '<span class="palette__dots" aria-hidden="true">' + c.map(function (x) { return '<span style="background:' + x + '"></span>'; }).join('') + '</span>'; };
    var opt = function (p) { return '<li><button type="button" class="palette__opt" data-id="' + p.id + '" aria-pressed="false">' + dots(p.c) + '<span class="palette__txt">' + p.name + '<small>' + p.note + '</small></span><span class="palette__check" aria-hidden="true"></span></button></li>'; };
    var group = function (g) { return PALETTES.filter(function (p) { return p.g === g; }).map(opt).join(''); };
    var wrap = document.createElement('div');
    wrap.className = 'palette no-print';
    wrap.innerHTML =
      '<div class="palette__panel" id="palette-panel" role="group" aria-labelledby="palette-title" hidden>' +
        '<h2 id="palette-title">Barevná kombinace</h2>' +
        '<p>Platí pro celý web a zůstane nastavená i na dalších stránkách.</p>' +
        '<p class="palette__group" id="pg-tmave">Výrazné hero</p><ul class="palette__list" aria-labelledby="pg-tmave">' + group('tmave') + '</ul>' +
        '<p class="palette__group" id="pg-svetle">Světlé hero</p><ul class="palette__list" aria-labelledby="pg-svetle">' + group('svetle') + '</ul>' +
        '<p class="palette__group" id="pg-vlastni">Vlastní barvy</p>' +
        '<div class="palette__custom" aria-labelledby="pg-vlastni">' +
          '<div class="palette__colors">' +
            '<label for="pal-h">Hlavní barva<input type="color" id="pal-h" value="#' + (saved.h || '2340C8') + '"></label>' +
            '<label for="pal-a">Akcent<input type="color" id="pal-a" value="#' + (saved.a || 'FFCB2E') + '"></label>' +
          '</div>' +
          '<label class="palette__light" for="pal-l"><input type="checkbox" id="pal-l"' + (saved.light ? ' checked' : '') + '>Světlé hero</label>' +
          '<button type="button" class="btn btn--primary" data-act="custom">Použít vlastní barvy</button>' +
          '<p class="palette__note">Odstíny se dopočítají samy. Když je barva moc světlá nebo tmavá, upravím ji, aby text zůstal čitelný.</p>' +
        '</div>' +
        '<div class="palette__actions"><button type="button" data-act="random">Náhodná paleta</button><button type="button" data-act="share">Zkopírovat odkaz na tuto paletu</button><button type="button" data-act="hide">Skrýt do zavření záložky</button></div>' +
        '<p class="palette__status" role="status" aria-live="polite"></p>' +
      '</div>' +
      '<button type="button" class="palette__toggle" aria-expanded="false" aria-controls="palette-panel"></button>';
    document.body.appendChild(wrap);
    var panel = wrap.querySelector('.palette__panel');
    var toggle = wrap.querySelector('.palette__toggle');
    var status = wrap.querySelector('.palette__status');
    var inH = wrap.querySelector('#pal-h'), inA = wrap.querySelector('#pal-a'), inL = wrap.querySelector('#pal-l');

    function render() {
      var id = current();
      var p = PALETTES.filter(function (x) { return x.id === id; })[0];
      var c = p ? p.c : [getComputedStyle(root).getPropertyValue('--blue').trim(), getComputedStyle(root).getPropertyValue('--yellow').trim(), getComputedStyle(root).getPropertyValue('--sky').trim()];
      toggle.innerHTML = dots(c) + '<span>Barvy: ' + (p ? p.name : 'Vlastní') + '</span>';
      $$('.palette__opt', panel).forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-id') === id)); });
    }
    function choose(id) {
      clearCustom();
      if (id === 'rozhovor') root.removeAttribute('data-palette'); else root.setAttribute('data-palette', id);
      store.set('localStorage', 'pkl-paleta', id);
      status.textContent = 'Nastavena paleta ' + PALETTES.filter(function (x) { return x.id === id; })[0].name + '.';
      render();
    }
    function setOpen(open, focusBack) {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) { var sel = panel.querySelector('[aria-pressed="true"]'); (sel || panel.querySelector('.palette__opt')).focus(); }
      else if (focusBack) toggle.focus();
    }
    toggle.addEventListener('click', function () { setOpen(panel.hidden); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) setOpen(false, true); });
    document.addEventListener('click', function (e) { if (!panel.hidden && !wrap.contains(e.target)) setOpen(false); });
    panel.addEventListener('click', function (e) {
      var o = e.target.closest('.palette__opt');
      if (o) { choose(o.getAttribute('data-id')); return; }
      var act = e.target.closest('[data-act]');
      if (!act) return;
      var what = act.getAttribute('data-act');
      if (what === 'hide') { store.set('sessionStorage', 'pkl-barvy-skryt', '1'); wrap.remove(); return; }
      if (what === 'random') {
        var others = PALETTES.filter(function (x) { return x.id !== current(); });
        choose(others[Math.floor(Math.random() * others.length)].id);
        return;
      }
      if (what === 'custom') {
        var r = applyCustom(inH.value, inA.value, inL.checked, true);
        status.textContent = 'Vlastní barvy použity' + (r.notes.length ? ' (' + r.notes.join(', ') + ').' : '.');
        render();
        return;
      }
      var url = location.origin + location.pathname + '?paleta=' + current();
      if (current() === 'vlastni') url += '&h=' + inH.value.replace('#', '') + '&a=' + inA.value.replace('#', '') + (inL.checked ? '&svetle=1' : '');
      var done = function () { status.textContent = 'Odkaz zkopírován: ' + url; };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { status.textContent = url; });
      else status.textContent = url;
    });
    render();
  }

  function init() {
    initPalette();
    initNav();
    initCopy();
    initFaq();
    initChecklist();
    initForm();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
