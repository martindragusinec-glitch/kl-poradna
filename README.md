# Poradna KL – web

Statický web (9 stránek + děkovací stránka + 404) pro Poradnu KL, z.ú. Čisté HTML/CSS/JS, bez frameworku, bez cookies a bez sledování.

## Spuštění a sestavení

```bash
python3 poradna-kl/tools/build.py          # produkce -> poradna-kl/dist/ (čisté adresy /kontakt/)
python3 poradna-kl/tools/build.py preview  # náhled -> poradna-kl/preview/ (ploché soubory, pro Artifact)
node poradna-kl/tools/serve.js 8797        # lokální náhled dist/ na http://localhost:8797
node poradna-kl/tools/qa.mjs               # axe-core (WCAG 2.2 AA + kontrast AAA) + screenshoty do docs/qa
```

- `src/layout.html`: hlavička, menu a patička (společné pro všechny stránky).
- `src/pages/*.html`: obsah stránek. První řádek obsahuje metadata (title, description).
- `assets/css/site.css`: celý vizuální systém. Tokeny jsou nahoře.
- `assets/js/site.js`: menu, formulář, FAQ, kopírování, odškrtávací seznam.
- `assets/img/src/`: zdrojové fotky a jejich licence v `CREDITS.md`. Build je zmenší.
- `assets/brand/poradna-kl-znak.svg`: znak loga.

## Vizuální systém „Rozhovor“

- **Logo:** dvě chatové bubliny, modrá (vy) a žlutá (poradna). Místo, kde se překrývají, symbolizuje porozumění. Znak je v `tools/build.py` (BUBBLES) a v `assets/brand/`.
- **Barvy:** modrá #2340C8, žlutá #FFCB2E, inkoust #13162B, papír #F4F3EE. Doplňkové odstíny: nebeská, máslová, broskvová.
- **Písmo:**
  - Nadpisy: Bricolage Grotesque.
  - Text: Atkinson Hyperlegible Next, písmo navržené pro slabozraké. Nula je v něm záměrně přeškrtnutá.
  - Obě písma jsou na webu uložená lokálně, nic se nenačítá z Google.
- **Fotky:** černobílé s násobením na žluté ploše (duotón), vložené do tvaru bubliny.

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

- [ ] **Příjem formuláře:** v `tools/build.py` nastavit `FORM_ENDPOINT`. Bez něj formulář běží v ukázkovém režimu a zprávy nikam neodesílá. Server má na `/api/kontakt` přijmout POST, zkontrolovat honeypot `poznamka_k_adrese` a pole `cas_vyplneni_s` a odeslat e-mail.
- [ ] Doménu (`SITE` v build.py) ověřit u registrátora. poradnakl.cz zatím nemá DNS záznam.
- [ ] Doplnit IČO, zápis v rejstříku ústavů, datovou schránku a číslo účtu.
- [ ] Doplnit partnery, loga a odkaz na výroční zprávy (O nás).
- [ ] Doplnit zásady ochrany osobních údajů: doby uchování, zpracovatele, cookies (web žádné nepoužívá), datum. Doplnit i to, že rozepsaný formulář se ukládá jen v prohlížeči do zavření záložky.
- [ ] Prohlášení o přístupnosti: stav souladu a datum.
- [ ] Ověřit údaje o superdávce, bezbariérovost vstupu a nejbližší zastávku MHD (podle OSM je to Kladno, Nám. starosty Pavla, asi 2 minuty pěšky).
- [ ] Fotka skutečného vchodu do kanceláře (pomůže lidem trefit). Místo ní zatím slouží ulice z Wikimedia Commons, jejíž licence vyžaduje uvést autora.
- [ ] OG obrázek `assets/img/og.jpg` (1200×630).
- [ ] Ostatní body ze zadání (čestné prohlášení, plná moc, seznam akreditovaných dluhových poraden, pojištění).

## Doporučení z rešerše (zatím neimplementováno)

- Blok „Kam se obrátit jinde“: Člověk v tísni Kladno (linka +420 770 600 800), CICOPS pro cizince, akreditované dluhové poradny. Kontakty nejdřív ověřit.
- Krátké shrnutí v ukrajinštině.
- Samostatné pole „Běží vám lhůta?“ ve formuláři. Zatím je to jen nápověda u popisu.
