# Rada na dosah – web

Statický web (9 stránek + děkovací stránka + 404) pro Poradnu KL, z.ú. Čisté HTML/CSS/JS, bez frameworku, bez cookies a bez sledování.

## Spuštění a sestavení

```bash
npm run build      # python3 tools/build.py -> dist/ (čisté adresy /kontakt/)
npm run preview    # python3 tools/build.py preview -> preview/ (ploché soubory, formulář v ukázkovém režimu)
npm run serve      # lokální náhled dist/ na http://localhost:8797 (POST /api/kontakt jen potvrdí, /admin/ = správa webu)
npm run images     # jen na macOS: přegeneruje zmenšené fotky do assets/img/web/ (commitují se)
node tools/og.mjs  # vykreslí OG obrázek assets/img/og.jpg z tools/og/og.html
node tools/qa.mjs  # axe-core (WCAG 2.2 AA + kontrast AAA) + screenshoty do docs/qa
```

- `src/layout.html`: hlavička, menu a patička (společné pro všechny stránky).
- `src/pages/*.html`: obsah stránek. První řádek obsahuje metadata (title, description).
- `assets/css/site.css`: celý vizuální systém. Tokeny jsou nahoře.
- `assets/js/site.js`: menu, formulář, FAQ, kopírování, odškrtávací seznam.
- `api/kontakt.js`: Vercel funkce, která formulář pošle e-mailem.
- `api/upravit.js` + `src/admin.html` + `assets/js/admin.js`: správa webu pro klienta (viz níže).
- `assets/img/src/`: zdrojové fotky a jejich licence (`CREDITS.md`).
- `assets/img/web/`: zmenšené fotky pro web.
- `assets/brand/`: znak loga.

## Nasazení na Vercel

1. **Import projektu:** na vercel.com → Add New → Project vyber repozitář `kl-poradna`. Framework „Other“. Vše ostatní je ve `vercel.json`:
   - build `python3 tools/build.py` (jen standardní knihovna Pythonu),
   - výstup `dist/`, čisté adresy se lomítkem na konci,
   - bezpečnostní hlavičky a dlouhá cache pro písma, CSS a JS (CSS a JS mají v adrese otisk obsahu).
2. **Proměnné prostředí** (Settings → Environment Variables):
   - `RESEND_API_KEY`: klíč z resend.com. Doménu odesílatele je tam potřeba ověřit.
   - `KONTAKT_FROM`: odesílatel, např. `Web Rada na dosah <web@radanadosah.cz>`.
   - `KONTAKT_TO`: příjemce (výchozí `info@radanadosah.cz`).
   - `SITE_URL`: finální adresa webu pro canonical, OG a sitemapu (výchozí `https://radanadosah.cz`).
3. **Doména:** připojit `radanadosah.cz` v Settings → Domains.

Dokud nejsou proměnné nastavené, formulář po odeslání slušně oznámí chybu a nabídne e-mail. Nic se neztratí potichu.

**Pozor na GDPR:** Resend zpracovává data v USA. Pokud mají údaje zůstat v EU, stačí v `api/kontakt.js` vyměnit odeslání za EU službu (SMTP / transakční e-mail) a uvést zpracovatele v zásadách ochrany osobních údajů.

## Vizuální systém „Rozhovor“

- **Logo:** dvě chatové bubliny, modrá (vy) a žlutá (poradna). Místo, kde se překrývají, symbolizuje porozumění. Znak je v `tools/build.py` (BUBBLES) a v `assets/brand/`.
- **Barvy „Malina“ (vybral klient 8. 10. 2026):** malinová #8E1B3E (tmavší #6B132D), meruňkový akcent #FFC29E, inkoust #2A1219, papír #F7F3F0. Doplňkové odstíny: růžová #F6DCE3, krémová #FFE8DA, písková #EDE6DC. V CSS se tokeny dál jmenují `--blue` (hlavní) a `--yellow` (akcent).
- **Písmo:**
  - Nadpisy: Bricolage Grotesque.
  - Text: Atkinson Hyperlegible Next, písmo navržené pro slabozraké. Nula je v něm záměrně přeškrtnutá.
  - Obě písma jsou na webu uložená lokálně, nic se nenačítá z Google.
- **Fotky:** černobílé s násobením na žluté ploše (duotón), vložené do tvaru bubliny.

## Barvy

Klient vybral paletu Malina, je natrvalo v `:root` v `assets/css/site.css`. Přepínač palet (17 palet + vlastní barvy) je z webu odstraněný. Najdeš ho v gitu v commitu `7a088dd`, kdyby bylo potřeba vybírat znovu.

## Formulář a e-maily (Resend)

Formulář „Požádat o schůzku“ posílá `api/kontakt.js` přes [Resend](https://resend.com) dva e-maily (šablony `api/_emaily.js`):

- **Poptávka** na `info@radanadosah.cz`: jméno, téma, tlačítka Zavolat / Odpovědět e-mailem, údaje, popis a datum, do kdy se máme ozvat (5 pracovních dnů). Odpověď jde rovnou klientovi (reply-to).
- **Potvrzení klientovi** (jen když vyplnil e-mail): poděkování, co bude dál, téma, odkaz „Co si vzít s sebou“, adresa a krizová čísla. Schválně v něm není nic, co klient napsal (jméno ani popis), aby formulář nešel zneužít k rozesílání cizího textu.
- **Náhled:** `node tools/email/nahled.mjs` → `docs/email-*.png` (počítač i mobil).

**Zapnutí (jednou):**

1. Resend → Domains → Add domain `radanadosah.cz`, region **EU (Ireland)**.
2. WEDOS → Domény → radanadosah.cz → DNS záznamy: přidat záznamy, které Resend ukáže. Obvykle jsou to TXT `resend._domainkey` (DKIM), MX `send` → `feedback-smtp.eu-west-1.amazonses.com` (priorita 10) a TXT `send` → `v=spf1 include:amazonses.com ~all`. Stávající záznamy pro Proton Mail (MX, SPF, DKIM, DMARC) zůstávají beze změny. Pak v Resendu kliknout na Verify.
3. Resend → API Keys → Create (Sending access, doména radanadosah.cz).
4. Vercel → Settings → Environment Variables (Production): `RESEND_API_KEY`; volitelně `KONTAKT_FROM` (výchozí `Rada na dosah <web@radanadosah.cz>`) a `KONTAKT_TO` (výchozí info@radanadosah.cz). Redeploy.

Doména má DMARC `p=quarantine`, takže bez ověřené domény v Resendu by e-maily končily ve spamu.

## Správa webu pro klienta (/admin/)

Klient upravuje web bez gitu a bez AI na **https://kl-poradna.vercel.app/admin/** (později `radanadosah.cz/admin/`, stará adresa `/upravit/` přesměruje):

- **Přihlášení heslem**, vydrží 30 dní.
- **Vlevo seznam stránek, uprostřed živý náhled webu** (přepínač Počítač / Mobil). Na text v náhledu se klikne a přepíše se. Nad textem je lišta: Tučně, Kurzíva, Odkaz, Původní.
- **Časté dotazy:** po najetí na otázku tlačítka „Přidat otázku pod“ a „Smazat“.
- **Název a popis pro Google** pro každou stránku, s náhledem výsledku ve vyhledávání.
- **Koncept:** změny se drží v prohlížeči (localStorage), návštěvníci je nevidí. Ve „Zveřejnit změny“ je přehled co → na co, jednotlivé změny jde zahodit, pak jedno tlačítko zveřejní vše.
- **Zveřejnění:** `api/upravit.js` udělá jeden commit do GitHubu, Vercel web nasadí, správa počká na dokončení a náhled obnoví.
- **Historie:** posledních 20 změn. Změnu ze správy webu jde vrátit jedním kliknutím; vrácení je zase běžný commit.

Server text vyčistí (jen tučné, kurzíva, zalomení a odkazy), doplní nezlomitelné mezery za předložky a zkontroluje, že text mezitím nezměnil někdo jiný. Doplněný text v `[doplnit]` ztratí šrafování. Do commitu se ukládá i strojový záznam změny (`Upravy-Data:`), podle kterého jde změnu vrátit.

**Zapnutí na Vercelu (jednou):**

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token. Repository access: *Only select repositories* → `kl-poradna`. Permissions: **Contents: Read and write**, **Commit statuses: Read-only**. Platnost třeba 1 rok (pak vyměnit).
2. Vercel → projekt `kl-poradna` → Settings → Environment Variables (Production): `UPRAVY_HESLO` (heslo pro klienta) a `UPRAVY_GITHUB_TOKEN` (token z kroku 1).
3. Redeploy, aby se proměnné načetly.

Volitelně `UPRAVY_REPO` (výchozí podle Vercelu) a `UPRAVY_VETEV` (výchozí `main`). Změna hesla zneplatní všechna přihlášení.

**Pro vývojáře:**
- Upravitelné texty mají ve zdrojích `data-k="stránka:číslo"`, opakovatelné položky (`<details>`) `data-polozka="stránka:pN"`. Po přidání nového obsahu spusť `python3 tools/upravy_oznacit.py` (`--check` jen vypíše počet neoznačených).
- **Klient commituje do `main`: před vlastní prací vždy `git pull`.**
- Lokálně `npm run serve` → http://localhost:8797/admin/, heslo `upravy` (nebo `UPRAVY_HESLO`). Lokálně se zapisuje rovnou do `src/`, `dist/` se přestaví a historie je jen v paměti serveru.
- Správa webu vyžaduje `X-Frame-Options: SAMEORIGIN` (náhled je iframe), viz `vercel.json`.

## Přístupnost (cíl WCAG 2.2 AA, kontrast AAA)

- Odkaz „Přeskočit na obsah“, správná struktura stránky (landmarky) a pořadí nadpisů, `aria-current` v menu.
- Viditelný fokus: žlutý a tmavý prstenec, čitelný na každém pozadí.
- Cíle kliknutí mají nejméně 48 px. Text je od 18 px, přizpůsobí se šířce 320 px a zvětšení na 400 %.
- Respektuje omezení pohybu (`prefers-reduced-motion`) a vysoký kontrast Windows (forced colors).
- Formulář podle vzorů GOV.UK:
  - souhrn chyb s odkazy na pole a chyba přímo u každého pole,
  - předpona „Chyba:“ v titulku stránky,
  - počítadlo znaků ohlašované čtečce až po pauze v psaní,
  - pravidlo „telefon nebo e-mail“ řešené jako jedna skupina polí,
  - rozepsaný text se zachová v sessionStorage, dokud je záložka otevřená,
  - ochrana proti spamu přes skryté pole (honeypot), žádná CAPTCHA.
- `?tema=najem|dluhy|davky|jine` v odkazu předvyplní téma formuláře.

## Před spuštěním (DOPLNIT)

- [ ] **Úpravy textů:** na Vercelu nastavit `UPRAVY_HESLO` a `UPRAVY_GITHUB_TOKEN` (viz Správa webu), heslo a odkaz /admin/ předat klientovi.
- [ ] **Příjem formuláře:** (viz Formulář a e-maily) na Vercelu nastavit `RESEND_API_KEY`, `KONTAKT_FROM` a případně `KONTAKT_TO` (viz Nasazení na Vercel). Poslat zkušební žádost.
- [ ] Doménu (`SITE` v build.py) ověřit u registrátora. radanadosah.cz zatím nemá DNS záznam.
- [ ] Doplnit IČO, zápis v rejstříku ústavů, datovou schránku a číslo účtu.
- [ ] Doplnit partnery, loga a odkaz na výroční zprávy (O nás).
- [ ] Doplnit zásady ochrany osobních údajů: doby uchování, zpracovatele, cookies (web žádné nepoužívá), datum. Doplnit i to, že rozepsaný formulář se ukládá jen v prohlížeči do zavření záložky.
- [ ] Prohlášení o přístupnosti: stav souladu a datum.
- [ ] Ověřit údaje o superdávce, bezbariérovost vstupu a nejbližší zastávku MHD (podle OSM je to Kladno, Nám. starosty Pavla, asi 2 minuty pěšky).
- [ ] Fotka skutečného vchodu do kanceláře (pomůže lidem trefit). Místo ní zatím slouží ulice z Wikimedia Commons, jejíž licence vyžaduje uvést autora.
- [ ] Ostatní body ze zadání (čestné prohlášení, plná moc, seznam akreditovaných dluhových poraden, pojištění).

## Doporučení z rešerše (zatím neimplementováno)

- Blok „Kam se obrátit jinde“: Člověk v tísni Kladno (linka +420 770 600 800), CICOPS pro cizince, akreditované dluhové poradny. Kontakty nejdřív ověřit.
- Krátké shrnutí v ukrajinštině.
- Samostatné pole „Běží vám lhůta?“ ve formuláři. Zatím je to jen nápověda u popisu.
