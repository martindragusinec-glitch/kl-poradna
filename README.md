# Rada na dosah – web

Statický web (9 stránek + děkovací stránka + 404) pro Poradnu KL, z.ú. Čisté HTML/CSS/JS, bez frameworku, bez cookies a bez sledování.

## Spuštění a sestavení

```bash
npm run build      # python3 tools/build.py -> dist/ (čisté adresy /kontakt/)
npm run preview    # python3 tools/build.py preview -> preview/ (ploché soubory, formulář v ukázkovém režimu)
npm run serve      # lokální náhled dist/ na http://localhost:8797 (POST /api/kontakt jen potvrdí)
npm run images     # jen na macOS: přegeneruje zmenšené fotky do assets/img/web/ (commitují se)
node tools/og.mjs  # vykreslí OG obrázek assets/img/og.jpg z tools/og/og.html
node tools/qa.mjs  # axe-core (WCAG 2.2 AA + kontrast AAA) + screenshoty do docs/qa
```

- `src/layout.html`: hlavička, menu a patička (společné pro všechny stránky).
- `src/pages/*.html`: obsah stránek. První řádek obsahuje metadata (title, description).
- `assets/css/site.css`: celý vizuální systém. Tokeny jsou nahoře.
- `assets/js/site.js`: menu, formulář, FAQ, kopírování, odškrtávací seznam.
- `api/kontakt.js`: Vercel funkce, která formulář pošle e-mailem.
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
- **Barvy:** modrá #2340C8, žlutá #FFCB2E, inkoust #13162B, papír #F4F3EE. Doplňkové odstíny: nebeská, máslová, broskvová.
- **Písmo:**
  - Nadpisy: Bricolage Grotesque.
  - Text: Atkinson Hyperlegible Next, písmo navržené pro slabozraké. Nula je v něm záměrně přeškrtnutá.
  - Obě písma jsou na webu uložená lokálně, nic se nenačítá z Google.
- **Fotky:** černobílé s násobením na žluté ploše (duotón), vložené do tvaru bubliny.

## Přepínač barevných kombinací

Vpravo dole je tlačítko „Barvy“ se sedmi paletami: Rozhovor (původní), Půlnoc, Hlubina, Oliva, Kakao, Víno a Krém. Krém je světlá varianta, kde hero a záhlaví nejsou sytý blok (tokeny `--panel*`).

- Změní barvy celého webu včetně fotek, loga a dekorací.
- Volba se pamatuje i na dalších stránkách.
- Odkaz na konkrétní paletu: `?paleta=pulnoc` (tlačítko „Zkopírovat odkaz na tuto paletu“).
- Na ostré doméně `radanadosah.cz` je přepínač skrytý. Zobrazí se s `?barvy`.
- Všechny palety drží kontrast AAA (ověřeno axe na 7 stránkách, desktop i mobil).
- **Jak paletu zvolit natrvalo:** hodnoty vybrané palety z bloku `html[data-palette="…"]` v `assets/css/site.css` se přepíšou do `:root` a přepínač (`initPalette` v `site.js`) se smaže.
- Náhled všech palet: `docs/palety-nahled.png`. Ve Figmě jsou stejné palety jako režimy proměnných „Rada na dosah“ (kromě Krému, který potřebuje vlastní proměnné pro hero).

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

- [ ] **Příjem formuláře:** na Vercelu nastavit `RESEND_API_KEY`, `KONTAKT_FROM` a případně `KONTAKT_TO` (viz Nasazení na Vercel). Poslat zkušební žádost.
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
