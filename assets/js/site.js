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

  function init() {
    initNav();
    initCopy();
    initFaq();
    initChecklist();
    initForm();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
