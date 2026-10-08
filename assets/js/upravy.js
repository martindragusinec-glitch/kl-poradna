/* Rada na dosah – úpravy textů přímo na webu.
   Načte se jen v režimu úprav (adresa /upravit/ nebo dříve zapnutý režim). Texty označené data-k jde přepsat,
   „Zveřejnit změny“ je pošle do api/upravit.js, které je uloží do GitHubu; Vercel pak web nasadí znovu. */
(function () {
  'use strict';

  var API = '/api/upravit/';
  var REZIM = 'rnd-upravy';                 // localStorage: režim úprav je zapnutý
  var ZVEREJNENI = 'rnd-upravy-zverejneni'; // localStorage: probíhající nasazení { sha, at }
  var MAC = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  var bar, statusEl, countEl, publishBtn, discardBtn, dialog;
  var els = [], puvodni = new Map(), puvodniText = new Map();
  var zverejnilJsem = false, zapnuto = false;

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

  function say(text, tone) {
    statusEl.textContent = text;
    statusEl.setAttribute('data-tone', tone || '');
  }

  /* ---------- Lišta ---------- */
  function buildBar() {
    bar = document.createElement('div');
    bar.className = 'upravy';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Úpravy webu');
    bar.innerHTML =
      '<div class="upravy__info"><p class="upravy__title">Režim úprav</p>' +
        '<p class="upravy__hint">Klikněte na text a přepište ho. Tučně: ' + (MAC ? '⌘B' : 'Ctrl+B') + '. Nový řádek: Shift+Enter.</p></div>' +
      '<p class="upravy__status" role="status" aria-live="polite"></p>' +
      '<div class="upravy__actions">' +
        '<button type="button" class="upravy__btn upravy__btn--main" data-a="publish" disabled><span>Zveřejnit<span class="upravy__long"> změny</span></span><span class="upravy__count">0</span></button>' +
        '<button type="button" class="upravy__btn" data-a="discard" disabled>Zahodit</button>' +
        '<button type="button" class="upravy__btn upravy__btn--link" data-a="end"><span>Ukončit<span class="upravy__long"> úpravy</span></span></button>' +
        '<button type="button" class="upravy__btn upravy__btn--link" data-a="logout" hidden>Odhlásit</button>' +
      '</div>';
    document.body.appendChild(bar);
    statusEl = bar.querySelector('.upravy__status');
    countEl = bar.querySelector('.upravy__count');
    publishBtn = bar.querySelector('[data-a="publish"]');
    discardBtn = bar.querySelector('[data-a="discard"]');
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-a]');
      if (!b) return;
      ({ publish: publish, discard: discard, end: end, logout: logout })[b.getAttribute('data-a')]();
    });
    // Lišta nesmí zakrýt patičku
    var pad = function () { document.documentElement.style.setProperty('--upravy-h', bar.offsetHeight + 'px'); };
    pad();
    if (window.ResizeObserver) new ResizeObserver(pad).observe(bar);
  }

  /* ---------- Přihlášení ---------- */
  function login() {
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'upravy-login';
      dialog.setAttribute('aria-labelledby', 'upravy-login-title');
      dialog.innerHTML =
        '<form method="dialog" novalidate>' +
          '<h2 id="upravy-login-title">Úpravy webu</h2>' +
          '<p>Zadejte heslo, které jste dostali od správce webu.</p>' +
          '<label for="upravy-heslo">Heslo</label>' +
          '<input id="upravy-heslo" type="password" autocomplete="current-password" autocapitalize="off" spellcheck="false" required aria-describedby="upravy-chyba">' +
          '<label class="upravy-login__show"><input type="checkbox" data-a="show"> Zobrazit heslo</label>' +
          '<p class="upravy-login__error" id="upravy-chyba" role="alert"></p>' +
          '<div class="upravy-login__actions"><button type="submit" class="upravy__btn upravy__btn--main">Přihlásit</button>' +
          '<button type="button" class="upravy__btn upravy__btn--link" data-a="cancel">Zrušit</button></div>' +
        '</form>';
      document.body.appendChild(dialog);
      var form = dialog.querySelector('form');
      var input = dialog.querySelector('#upravy-heslo');
      dialog.querySelector('[data-a="show"]').addEventListener('change', function (e) { input.type = e.target.checked ? 'text' : 'password'; });
      var err = dialog.querySelector('.upravy-login__error');
      var btn = form.querySelector('[type="submit"]');
      // Bez přihlášení není co upravovat; při vypršeném přihlášení ale neuložené změny nezahazovat
      var cancel = function () { if (!zapnuto) end(true); };
      dialog.querySelector('[data-a="cancel"]').addEventListener('click', function () { dialog.close(); cancel(); });
      dialog.addEventListener('cancel', cancel);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!input.value) { err.textContent = 'Zadejte heslo.'; input.focus(); return; }
        btn.disabled = true;
        err.textContent = '';
        api('prihlasit', { heslo: input.value }).then(function (r) {
          btn.disabled = false;
          if (r.ok) {
            input.value = '';
            dialog.close();
            if (zapnuto) say('Přihlášeno. Klikněte znovu na „Zveřejnit změny“.'); else enable();
            return;
          }
          err.textContent = r.status === 401 ? 'Heslo nesedí. Zkontrolujte velká a malá písmena a české klávesnici (čísla, y/z), případně zaškrtněte „Zobrazit heslo“.' : 'Přihlášení se nepovedlo. Zkuste to za chvíli znovu.';
          input.select();
        });
      });
    }
    dialog.showModal();
    dialog.querySelector('#upravy-heslo').focus();
  }

  /* ---------- Úpravy ---------- */
  function enable() {
    if (zapnuto) return;
    zapnuto = true;
    document.documentElement.classList.add('upravy-on');
    bar.querySelector('[data-a="logout"]').hidden = false;
    $$('details').forEach(function (d) { d.open = true; });
    els = $$('[data-k]').filter(function (el) { return !el.closest('[hidden]'); });
    els.forEach(function (el) {
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'true');
      puvodni.set(el, el.innerHTML);
      puvodniText.set(el, el.textContent);
      var a = el.closest('a');
      if (a) a.setAttribute('draggable', 'false');
    });
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', onKey);
    document.addEventListener('paste', onPaste);
    document.addEventListener('drop', onDrop);
    document.addEventListener('focusin', onFocus);
    say('Upravit můžete ' + els.length + ' textů na této stránce.');
    var p = pending();
    if (p) { lock(true); poll(); }
  }

  function lock(on) {
    els.forEach(function (el) { el.setAttribute('contenteditable', on ? 'false' : 'true'); });
  }

  var editable = function (node) { var el = node && node.closest ? node.closest('[data-k][contenteditable]') : null; return el; };
  var changed = function () { return els.filter(function (el) { return el.hasAttribute('data-zmeneno'); }); };

  function refresh() {
    var n = changed().length;
    countEl.textContent = n;
    publishBtn.disabled = n === 0;
    discardBtn.disabled = n === 0;
  }

  function onInput(e) {
    var el = editable(e.target);
    if (!el) return;
    el.toggleAttribute('data-zmeneno', el.innerHTML !== puvodni.get(el));
    el.removeAttribute('data-konflikt');
    refresh();
  }

  function onKey(e) {
    var el = editable(e.target);
    if (!el) return;
    if (e.key === 'Escape') { el.blur(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (e.shiftKey && /^(P|LI|ADDRESS|DD|TD)$/.test(el.tagName) && !document.execCommand('insertLineBreak')) document.execCommand('insertHTML', false, '<br>');
  }

  function onPaste(e) {
    if (!editable(e.target)) return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s*\n\s*/g, ' ');
    document.execCommand('insertText', false, text);
  }

  function onDrop(e) { if (editable(e.target)) e.preventDefault(); }

  function onFocus(e) {
    var el = editable(e.target);
    if (el && /^layout:/.test(el.getAttribute('data-k'))) say('Tento text je v patičce na všech stránkách. Změna se projeví všude.');
  }

  // Odkazy, tlačítka a rozbalovací otázky s upravitelným textem v režimu úprav nikam nevedou;
  // ostatní odkazy fungují (přechod na jinou stránku), jen se zeptáme na neuložené změny.
  document.addEventListener('click', function (e) {
    if (!zapnuto) return;
    if (editable(e.target)) {
      var host = e.target.closest('a, label, summary');
      if (host) e.preventDefault();
      return;
    }
    var a = e.target.closest('a[href]');
    if (a && changed().length && !e.defaultPrevented && a.origin === location.origin && a.pathname !== location.pathname) {
      if (!confirm('Na této stránce máte nezveřejněné změny. Když odejdete, ztratí se. Opravdu odejít?')) e.preventDefault();
    }
  }, true);
  window.addEventListener('beforeunload', function (e) {
    if (zapnuto && changed().length) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ---------- Zveřejnění ---------- */
  function publish() {
    var list = changed();
    if (!list.length) return;
    var empty = list.filter(function (el) { return !el.textContent.trim(); })[0];
    if (empty) { say('Text nemůže zůstat prázdný. Napište ho, nebo klikněte na „Zahodit“.', 'error'); empty.focus(); return; }
    publishBtn.disabled = true;
    discardBtn.disabled = true;
    say('Ukládám změny…');
    var zmeny = list.map(function (el) {
      return { k: el.getAttribute('data-k'), pred: puvodniText.get(el), po: el.innerHTML };
    });
    api('ulozit', { zmeny: zmeny }).then(function (r) {
      if (r.ok) {
        list.forEach(function (el) {
          var k = el.getAttribute('data-k');
          if (r.html && r.html[k] != null && document.activeElement !== el) el.innerHTML = r.html[k];
          puvodni.set(el, el.innerHTML);
          puvodniText.set(el, el.textContent);
          el.removeAttribute('data-zmeneno');
        });
        refresh();
        zverejnilJsem = true;
        store.set(ZVEREJNENI, JSON.stringify({ sha: r.sha, at: Date.now() }));
        poll();
        return;
      }
      refresh();
      if (r.status === 401) { say('Přihlášení vypršelo. Přihlaste se znovu a změny zveřejněte.', 'error'); login(); return; }
      if (r.status === 409) {
        (r.klice || []).forEach(function (k) {
          var el = document.querySelector('[data-k="' + k + '"]');
          if (el) el.setAttribute('data-konflikt', '');
        });
        say('Některý text (červeně orámovaný) se mezitím změnil jinde. Zkopírujte si své úpravy, obnovte stránku a upravte ho znovu.', 'error');
        return;
      }
      if (r.status === 503) { say('Úpravy zatím nejsou zapnuté (chybí nastavení na Vercelu). Dejte vědět správci webu.', 'error'); return; }
      say('Uložení se nepovedlo. Zkuste to prosím za chvíli znovu.', 'error');
    });
  }

  function pending() {
    try {
      var p = JSON.parse(store.get(ZVEREJNENI) || 'null');
      if (p && Date.now() - p.at < 15 * 60 * 1000) return p;
    } catch (e) {}
    store.del(ZVEREJNENI);
    return null;
  }

  function poll() {
    var p = pending();
    if (!p) return;
    var slow = Date.now() - p.at > 3 * 60 * 1000;
    say(zverejnilJsem
      ? (slow ? 'Zveřejnění trvá déle než obvykle, ještě chvíli počkejte…' : 'Uloženo. Zveřejňuji na webu, obvykle do minuty… Můžete upravovat dál.')
      : 'Dokončuji zveřejnění předchozích změn. Stránka se pak sama obnoví…');
    api('stav&sha=' + encodeURIComponent(p.sha)).then(function (r) {
      if (r.nasazeni === 'success') {
        store.del(ZVEREJNENI);
        if (!zverejnilJsem && !changed().length) { location.reload(); return; }
        lock(false);
        say('Hotovo. Změny jsou na webu.', 'ok');
        return;
      }
      if (r.nasazeni === 'nezname') {
        store.del(ZVEREJNENI);
        lock(false);
        say('Uloženo. Na webu se změny objeví zhruba do minuty.', 'ok');
        return;
      }
      if (r.nasazeni === 'failure' || r.nasazeni === 'error') {
        store.del(ZVEREJNENI);
        lock(false);
        say('Zveřejnění se nepovedlo, web zůstává v předchozí podobě. Dejte prosím vědět správci webu.', 'error');
        return;
      }
      setTimeout(poll, 5000);
    });
  }

  function discard() {
    changed().forEach(function (el) {
      el.innerHTML = puvodni.get(el);
      el.removeAttribute('data-zmeneno');
      el.removeAttribute('data-konflikt');
    });
    refresh();
    say('Změny jsou zahozené.');
  }

  function end(quiet) {
    if (!quiet && changed().length && !confirm('Máte nezveřejněné změny. Opravdu ukončit úpravy bez zveřejnění?')) return;
    store.del(REZIM);
    zapnuto = false;
    location.href = location.pathname + location.hash;
  }

  function logout() {
    if (changed().length && !confirm('Máte nezveřejněné změny. Opravdu se odhlásit bez zveřejnění?')) return;
    api('odhlasit', {}).then(function () { end(true); });
  }

  /* ---------- Start ---------- */
  buildBar();
  say('Načítám…');
  api('stav').then(function (r) {
    if (r.ok) return enable();
    if (r.status === 401) { say('Přihlaste se heslem.'); return login(); }
    if (r.status === 503) return say('Úpravy zatím nejsou zapnuté (chybí nastavení na Vercelu). Dejte vědět správci webu.', 'error');
    say('Nepodařilo se spojit se serverem. Zkuste stránku obnovit.', 'error');
  });
})();
