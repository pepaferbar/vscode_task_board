# Úkolník (vscode_task_board) – architektura

*Aktualizováno: 15. 11. 2026 skillem `/architektura`. Zdroj pravdy je kód – při rozporu platí kód.*

## Účel
Doplněk VS Code „Úkolník“ (ID `ferbar.taskboard`, verze 0.1.0) pro jednoho uživatele: databázi úkolů v Notionu zobrazí jako tabulku (webview) v postranním panelu s odznakem počtu otevřených úkolů. Umí nový úkol, změnu stavu, smazání do koše, „Kopírovat pro Clauda“ a zobrazení úkolu v záložce. Uživatelský popis včetně založení databáze je v `README.md`.

## Vstupní body
- `package.json` – manifest: aktivace `onStartupFinished`, engine `^1.82.0` (globální `fetch`), kontejner `taskBoard` v activity baru, webview view `taskBoard.tabulka`, příkazy, menu, nastavení.
- `src/extension.js` – `activate()`: registrace providerů (webview + virtuální dokumenty), příkazů, intervalu, první `obnov()`.

## Struktura
| Cesta | Obsah |
|---|---|
| `src/extension.js` | Klient z tokenu (`context.secrets`, klíč `taskBoard.notionToken`) a ID databáze (`idZOdkazu(taskBoard.databaze)`); `klientProAkci()` při chybějícím nastavení nabídne token/nastavení. `obnov()` slučuje souběžná volání (`probiha`/`znovu`), `nactiAVykresli()` při chybě nechá poslední data a ukáže hlášku. `vykresli()` filtruje hotové podle `globalState` `taskBoard.zobrazitHotove`. Akce nad úkolem podle ID stránky (`najdiUkol` v `posledniUkoly`). `otevritUkol()` = Markdown do virtuálního dokumentu `taskboard-ukol:/<název>.md?<id>` → `markdown.showPreview`. Import z MD (`akceImportovatMd`, `textSekce`). Interval `taskBoard.intervalMinut`. |
| `src/notion.js` | `NotionKlient` nad REST API (`https://api.notion.com/v1`, `Notion-Version: 2025-09-03`): `volej()` (rozestup 350 ms, 3× opakování při 429 podle `Retry-After`, `ChybaNotionu` se srozumitelnou hláškou 401/403/404), `zdrojDat()` (databáze → první data source + schéma vlastností; ID stránky → první `child_database` v ní; v mezipaměti), `nactiUkoly()` (query po 100 podle created_time, pak stabilně podle priority `poradiPriority()` High/Medium/Low → bez; datum = created_time česky), `vlastnosti()` (zápis jen existujících vlastností podle typu ze schématu), `vytvorUkol()` (bloky po 100; bez popisu `template: default`, při 400 bez šablony; vrací stránku s `url`), `zmenStav()`, `smazUkol()` (`in_trash`), `obsahStranky()` (bloky → Markdown, vnoření do hloubky 3). Převody: Markdown ↔ rich_text (tučné, kód, kurzíva, odkazy), řádky MD → bloky (nadpisy, odrážky, číslování, kód, odstavce), datum ISO ↔ „d. m. rrrr“. |
| `src/tabulka.js` | `TabulkaPlanu` (`WebviewViewProvider`): HTML s CSP a nonce, `esc()`, skupiny podle aplikace (`seskupPodleAplikace`, abecedně, „Bez aplikace“ na konci, řádky `tr.skupina`), ≥ 520 px Plán / Priorita / Stav / Vytvořeno, jinak úzké rozložení s prioritou pod názvem; řádky `data-id` + `data-vscode-context` (`webviewSection: 'ukol'`, `id`, `stavId`); události `priOtevreni(id)` (klik/Enter) a `priZobrazeni()` (`onDidChangeVisibility`); `aktualizuj(ukoly, zprava, poznamka)` – poznámka pod tabulkou („Skryté hotové: N“); značka stavu a ⋯ vyvolají nativní `contextmenu`. |
| `src/parser.js` | Textový parser starého `tasks/prehled-planu.md` (tabulka „Stav v kostce“ + sekce `## N.`) – dnes jen pro import. Sdílené: `normalizujStav`, `odstranMarkdown`, `ID_STAVU` (ASCII id stavů pro `when`/`enablement`). |
| `resources/checklist.svg` | Ikona v activity baru |
| `.vscode/launch.json` | F5 = Extension Development Host s workspace `${workspaceFolder}/..` |

## Příkazy a nastavení
- Záhlaví panelu: `taskBoard.pridat` (jen název, stav „nápad“, pak `openExternal` na novou stránku – zbytek se vyplní v Notionu), `taskBoard.obnovit`, `taskBoard.otevritSoubor` (otevře databázi v Notionu přes `openExternal`; ID příkazu zůstalo z doby MD), přepínač `taskBoard.zobrazitHotove` ↔ `taskBoard.skrytHotove` (prohazuje je kontext `taskBoard.zobrazitHotove`).
- Kontextové menu řádku: `taskBoard.stav.{napad,napadLadi,zadani,rozpracovano,odlozeno,hotovo}` (`enablement: stavId != …`), `taskBoard.kopirovat`, `taskBoard.smazat`; v paletě skryté (`when: false`).
- Jen paleta: `taskBoard.nastavitToken` (prázdná hodnota token smaže), `taskBoard.importovatMd`.
- Nastavení: `taskBoard.databaze` (ID nebo odkaz na databázi či stránku), `taskBoard.intervalMinut` (výchozí 5, 0 = vypnuto), `taskBoard.badgeStavy` (stavy počítané do odznaku).
- Známé stavy: `nápad`, `nápad, ladí se`, `zadání`, `rozpracováno`, `odloženo`, `hotovo`; jiné = `neznámý`.

## Databáze (Notion)
- Stránka „DEV-TASK“ → databáze „Úkoly“ (data source `41976a99-2746-8170-93c2-000b0f869d21`), v nastavení stačí odkaz na DEV-TASK.
- Vlastnosti (konstanta `VLASTNOSTI`): titulek (hledá se podle typu `title`, jmenuje se „Název“), `Aplikace` (text, podle ní skupiny), `Stav` (select), `Priority` (select High/Medium/Low, řazení); `Datum` jen pro import z MD. Datum v tabulce = `created_time` stránky. Dál a Pořadí z databáze i doplňku odebrány (18. 11. 2026). Chybějící vlastnost se přeskočí; čtení i zápis umí title, rich_text, select, status, multi_select, date, number.
- Identita úkolu = ID stránky.
- Obsah stránky = popis úkolu (odrážky, odstavce); údaje patří do vlastností, ne do textu.

## Závislosti mimo složku
- Notion API (`api.notion.com`) a Internal integration s přístupem k databázi (sdílení přes Connections, dědí se ze stránky).
- Vestavěné rozšíření Markdown (`markdown.showPreview`), při chybě záloha `showTextDocument`.
- `tasks/prehled-planu.md` v kořeni workspace jen jako zdroj jednorázového importu (už proběhl ručně přes konektor).
- Žádné npm balíčky, jen modul `vscode`.

## Nasazení / build
- Bez buildu a bez Node.js – VS Code spouští `src/*.js` přímo.
- Instalace junctionem `%USERPROFILE%\.vscode\extensions\ferbar.taskboard-0.1.0` → tato složka; po úpravě stačí **Developer: Reload Window**. Verzi neměnit bez přejmenování junctionu.
- `.vscodeignore` vyřazuje `.vscode/**`, `change.md`, `*.vsix`.

## Záměrná omezení a pasti
- Token jen v SecretStorage, nikdy v nastavení ani v souborech.
- Notion nepovolí čárku v názvu volby select/status: „nápad, ladí se“ ↔ „nápad (ladí se)“ (`STAV_DO_NOTIONU`, `stavZNotionu`); jinde se čárky v select nahradí „ / “, multi_select se podle čárek rozdělí.
- Klik na úkol neotevírá Notion: stránku nejde vložit do webview/Simple Browseru (Notion zakazuje rámy) a `openExternal` vyvolá dotaz VS Code na externí web. Záložka je jen ke čtení a obsah je k okamžiku kliknutí.
- Hotové úkoly se filtrují až při vykreslení; „Smazat všechny hotové“ bylo záměrně odebráno.
- Změny v Notionu se nepromítnou okamžitě (žádné webhooky) – až při zobrazení panelu, akci, ↻ nebo intervalu.
- Mazání = koš Notionu. Import z MD nekontroluje duplicity – znovu nespouštět.
- Jednoslovný název „Úkolník“ je záměr: VS Code v titulku panelu kapitalizuje každé slovo („Plány A Úkoly“). Interní ID `taskBoard.*` / `ferbar.taskboard` neměnit (nastavení, token, globalState).
- Kontextové menu nevykresluje codicony, proto titulky s emoji/znaky. Položky se nesmí skrývat, jen zakázat (`enablement`); výjimkou je dvojice tlačítek přepínače hotových.
- Odznak na webview view se ukáže až po prvním zobrazení panelu v relaci (omezení API).
- „Kopírovat pro Clauda“ jen plní schránku a přepne stav na „rozpracováno“ – vložit text do otevřené konverzace Claude Code nejde.
- Žádný git commit/push – ten dělá uživatel.
