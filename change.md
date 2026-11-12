# Změny - 12. 11. 2026
- **Cíl:** Přejmenování doplňku na anglický název vscode_task_board (jen názvy a ID, rozhraní zůstává česky)
- **Soubory:**
  - package.json: `name` taskboard (ID `ferbar.taskboard`), kontejner `taskBoard`, view `taskBoard.tabulka`, příkazy a nastavení `planyUkoly.*` → `taskBoard.*`, podmínky `when`
  - src/extension.js: `SEKCE_NASTAVENI`, registrace view a příkazů na `taskBoard.*`
  - README.md: názvy nastavení, junction `ferbar.taskboard-0.1.0` → `vscode_task_board`
  - složka `vscode_plany_ukoly` → `vscode_task_board`, junction a záznam v `%USERPROFILE%\.vscode\extensions\extensions.json` (skript při zavřeném VS Code)

# Změny - 11. 11. 2026
- **Cíl:** Akce nad úkolem v tabulce – změna stavu, úprava „Dál“, kopírování pro Clauda, smazání (doplněk nově do souboru zapisuje)
- **Soubory:**
  - src/upravy.js: nový modul – `zmenStav()` (buňka Stav + začátek řádku `**Stav:**`, poznámka za stavem zůstává), `upravDal()` (buňka Dál + Datum = dnes), `smazUkol()` (řádek tabulky + celá sekce, přečíslování dalších `## N.`), `textUkolu()` (text sekce pro schránku)
  - src/parser.js: u úkolu navíc `radekTabulky`, `cisloSekce`, `sekceOd`/`sekceDo` (rozsah sekce do dalšího nadpisu # nebo ##), `radekStavu`; export `ZNAME_STAVY`, `bunky`
  - src/tabulka.js: klik na značku stavu → změna stavu, tlačítko ⋯ (viditelné při najetí) → nabídka akcí, `data-vscode-context` pro pravý klik
  - src/extension.js: akce `akceZmenitStav/UpravitDal/Kopirovat/Smazat`, nabídka ⋯, kontrola, že úkol v souboru odpovídá tabulce; zápis přes WorkspaceEdit (Ctrl+Z) + uložení; smazání s potvrzovacím dialogem; datum se při změně stavu nemění
  - package.json: příkazy `planyUkoly.zmenitStav/upravitDal/kopirovat/smazat`, menu `webview/context`, skryté z palety
  - README.md: popis akcí

# Změny - 11. 11. 2026
- **Cíl:** Klik na řádek jen otevře náhled přehledu, bez posunu na sekci (obejití přes textový editor blikalo)
- **Soubory:**
  - src/extension.js: `otevritNahled(uri)` jen volá `markdown.showPreview`; odstraněny `nahledNaRadku()`, `najdiZalozky()` a předávání kotvy/řádku
  - README.md: popis kliknutí

# Změny - 11. 11. 2026
- **Cíl:** Oprava – náhled se neposunul na sekce s diakritikou v nadpisu (úkoly 1–3)
- **Soubory:**
  - src/extension.js: příčina je ve VS Code – náhled kotvu z URI zakóduje `encodeURIComponent` a id nadpisu s diakritikou nenajde. Kotva bez diakritiky se dál předává v URI; jinak `nahledNaRadku()`: soubor se na okamžik otevře v textovém editoru na řádku sekce, spustí se náhled (převezme horní řádek editoru) a textová záložka se zavře, pokud ji otevřel doplněk.

# Změny - 11. 11. 2026
- **Cíl:** Tabulka přímo v postranním panelu místo stromu a záložky v editoru
- **Soubory:**
  - src/tabulka.js: přepsáno na WebviewViewProvider – úzký panel Plán / Stav / Datum (aplikace a „Dál“ pod plánem), od 520 px všech 5 sloupců; klik / Enter → náhled sekce; odznak přes `webviewView.badge` (zobrazí se po prvním otevření panelu)
  - src/extension.js: `registerWebviewViewProvider('planyUkoly.tabulka')`, odstraněn TreeView a příkaz tabulky v editoru
  - src/strom.js: smazáno (strom už se nepoužívá)
  - package.json: view typu `webview` `planyUkoly.tabulka`, zbývají příkazy Obnovit a Otevřít přehled
  - README.md: popis

# Změny - 11. 11. 2026
- **Cíl:** Tabulka plánů v záložce editoru (strom v postranním panelu zůstává)
- **Soubory:**
  - src/tabulka.js: nový webview panel s tabulkou Plán / Aplikace / Stav / Datum / Dál, barevné značky stavů z motivu, klik nebo Enter na řádku → náhled sekce
  - src/extension.js: příkaz `planyUkoly.tabulka`, tabulka se překresluje spolu se stromem; `otevritNahled(…, vedle)` – z tabulky se náhled otevírá vedle (`markdown.showPreviewToSide`)
  - package.json: příkaz „Zobrazit jako tabulku“ s ikonou `$(table)` v záhlaví view
  - README.md: popis tabulky

# Změny - 11. 11. 2026
- **Cíl:** Nová ikona se neprojevila (cache VS Code)
- **Soubory:**
  - resources/ikona.svg → resources/checklist.svg: přejmenováno kvůli cache ikon
  - package.json: cesta k ikoně `resources/checklist.svg`

# Změny - 11. 11. 2026
- **Cíl:** Zjednodušení podle zpětné vazby – jen seznam plánů v pořadí tabulky, otevírání v náhledu Markdownu, nová ikona
- **Soubory:**
  - resources/ikona.svg: nová ikona checklist (dva odškrtnuté řádky a prázdný čtvereček)
  - src/strom.js: kořen = sloupec Plán, pod ním sloupce Aplikace / Stav / Datum / Dál; zrušeno seskupení, filtr hotových a odrážky ze sekcí
  - src/parser.js: zjednodušení (bez odrážek), výpočet kotvy nadpisu sekce stejně jako náhled Markdownu VS Code (včetně přípon u duplicit)
  - src/extension.js: klik a tlačítko otevírají `markdown.showPreview` s `#kotvou` → náhled skočí na sekci úkolu; zrušeny příkazy Seskupit a Skrýt/Zobrazit hotové
  - package.json: odstraněny příkazy a nastavení `seskupeni` a `skrytHotove`, ikona tlačítka `open-preview`
  - README.md: aktualizace popisu

# Změny - 11. 11. 2026
- **Cíl:** Převod doplňku z TypeScriptu do čistého JavaScriptu – bez Node.js a bez buildu, instalace odkazem do složky rozšíření
- **Soubory:**
  - src/parser.js, src/strom.js, src/extension.js: přepis z `.ts` (stejná logika, CommonJS, bez typů)
  - src/*.ts, tsconfig.json, .vscode/tasks.json: smazáno
  - package.json: `main` → `./src/extension.js`, odstraněny `scripts` a `devDependencies`
  - .vscode/launch.json: F5 bez kompilace
  - .vscodeignore, .gitignore: bez `out/` a `node_modules/`
  - README.md: instalace přes junction a „Install Extension from Location…“
  - instalace: junction `%USERPROFILE%\.vscode\extensions\ferbar.planyukoly-0.1.0` → tato složka

# Změny - 11. 11. 2026
- **Cíl:** První verze doplňku „Plány a úkoly“ (strom z `tasks/prehled-planu.md` s ikonami stavů a odznakem v activity baru)
- **Soubory:**
  - package.json: manifest (kontejner v activity baru, view, příkazy, tlačítka v záhlaví, nastavení `planyUkoly.*`)
  - src/parser: tolerantní parser tabulky „Stav v kostce“ a sekcí `## N. …` (štítky odrážek, pokračovací řádky, bloky kódu)
  - src/strom: TreeDataProvider – seskupení pořadí/stav/aplikace, filtr hotových, ikony stavů a štítků, klik na řádek
  - src/extension: createTreeView, odznak, FileSystemWatcher, příkazy Obnovit / Seskupit / Skrýt a zobrazit hotové / Otevřít soubor
  - resources/ikona.svg: ikona žárovka + seznam
  - .vscode/launch.json: ladění přes F5
  - .vscodeignore, .gitignore, README.md
