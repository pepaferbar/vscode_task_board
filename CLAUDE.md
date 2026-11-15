# vscode_task_board („Úkolník“) – architektura

*Aktualizováno: 15. 11. 2026 ručně (přechod z `prehled-planu.md` na Notion). Zdroj pravdy je kód – při rozporu platí kód.*

## Účel
Doplněk VS Code (ID `ferbar.taskboard`, verze 0.1.0): databázi úkolů v Notionu zobrazí jako tabulku (webview) v postranním panelu, s odznakem počtu otevřených úkolů na ikoně v activity baru. Do Notionu zapisuje jen akce spuštěné uživatelem (nový úkol, změna stavu, smazání do koše, „Kopírovat pro Clauda“). Jednorázově umí naimportovat původní `tasks/prehled-planu.md`. Uživatelský popis včetně založení databáze je v `README.md`.

## Vstupní body
- `package.json` – manifest: aktivace `onStartupFinished`, kontejner `taskBoard` v activity baru, webview view `taskBoard.tabulka`, příkazy, menu, nastavení. Engine `^1.82.0` (kvůli globálnímu `fetch` v extension hostu).
- `src/extension.js` – `activate()`: registrace providera a příkazů, klient Notionu z tokenu + ID databáze, `obnov()`, interval.

## Struktura
| Cesta | Obsah |
|---|---|
| `src/extension.js` | `ziskejKlienta()` (token z `context.secrets` klíč `taskBoard.notionToken`, ID databáze z nastavení přes `idZOdkazu`), `obnov()` (souběžná volání se sloučí; při chybě zůstanou poslední data + hláška), akce nad úkolem podle `pageId`, nastavení tokenu, import z MD (`textSekce` vynechá řádek `**Stav:**` s pouhým stavem), interval `taskBoard.intervalMinut` |
| `src/notion.js` | `NotionKlient` – REST API Notionu verze `2025-09-03` přes `fetch`: `zdrojDat()` (databáze → první data source + schéma vlastností, v mezipaměti), `nactiUkoly()` (query se stránkováním, řazení Pořadí + created_time), `vytvorUkol()` (po 100 blocích), `zmenStav()`, `smazUkol()` (`in_trash`), `obsahStranky()` (bloky → Markdown, hloubka 3). Rozestup 350 ms mezi požadavky, opakování při 429, srozumitelné hlášky 401/403/404. Převody: Markdown ↔ rich_text (tučné, kód), řádky MD → bloky, datum ISO ↔ „d. m. rrrr“. |
| `src/parser.js` | Textový parser původního `prehled-planu.md` (tabulka „Stav v kostce“, sekce `## N.`), dnes jen pro import; dál se používá `normalizujStav`, `odstranMarkdown`, `ID_STAVU` (ASCII id pro `when`/`enablement`) |
| `src/tabulka.js` | `TabulkaPlanu` – `WebviewViewProvider`: HTML s CSP a nonce, escapování `esc()`, ≥ 520 px všech 5 sloupců, jinak úzké rozložení; řádky nesou `data-id` a `data-vscode-context` (`webviewSection: 'ukol'`, `id`, `stavId`); události `priOtevreni(id)` a `priZobrazeni()` (obnovení při zobrazení panelu) |
| `resources/checklist.svg` | Ikona v activity baru |
| `.vscode/launch.json` | F5 = Extension Development Host s workspace `${workspaceFolder}/..` |

## Příkazy a nastavení
- Příkazy: `taskBoard.pridat` (5 kroků InputBox/QuickPick), `taskBoard.obnovit`, `taskBoard.otevritSoubor` (otevře databázi v Notionu – ID zůstalo kvůli kompatibilitě), `taskBoard.nastavitToken`, `taskBoard.importovatMd`, `taskBoard.kopirovat`, `taskBoard.smazat`, `taskBoard.zobrazitHotove` / `taskBoard.skrytHotove` (jedno tlačítko oka v záhlaví, prohazuje je kontext `taskBoard.zobrazitHotove`; stav v `globalState`, výchozí skryté), `taskBoard.stav.{napad,napadLadi,zadani,rozpracovano,odlozeno,hotovo}` (`enablement: stavId != …`). Příkazy nad úkolem jsou v paletě skryté (`when: false`).
- Nastavení: `taskBoard.databaze` (ID nebo URL databáze), `taskBoard.intervalMinut` (výchozí 5, 0 = vypnuto), `taskBoard.badgeStavy`.
- Známé stavy: `nápad`, `nápad, ladí se`, `zadání`, `rozpracováno`, `odloženo`, `hotovo`; jiné = `neznámý`.

## Databáze v Notionu
- Vlastnosti podle názvu: `Aplikace`, `Stav`, `Datum`, `Dál`, `Pořadí` (konstanta `VLASTNOSTI` v `notion.js`); titulek se hledá podle typu `title`. Chybějící vlastnost nebo neznámý typ se při zápisu přeskočí.
- Typ vlastnosti se bere ze schématu data source – čtení i zápis umí title, rich_text, select, status, multi_select, date, number.
- Skutečná databáze: stránka „DEV-TASK“ → inline databáze „Úkoly“ (data source `41976a99-2746-8170-93c2-000b0f869d21`). V `taskBoard.databaze` může být ID databáze i ID stránky – u stránky se použije první `child_database` v ní.
- Identita úkolu = ID stránky; `Pořadí` je jen pro řazení (nový úkol = max + 1), nepřečíslovává se.

## Závislosti mimo složku
- Notion API (`api.notion.com`), Internal integration s přístupem k databázi.
- Žádné npm balíčky; jen modul `vscode`.
- `tasks/prehled-planu.md` už jen jako zdroj jednorázového importu.

## Nasazení / build
- Bez buildu a bez Node.js – VS Code spouští `src/*.js` přímo.
- Instalace junctionem `%USERPROFILE%\.vscode\extensions\ferbar.taskboard-0.1.0` → tato složka; po úpravě stačí **Developer: Reload Window**. Ladění: F5.
- `.vscodeignore` vyřazuje z balíčku `.vscode/**`, `change.md`, `*.vsix`.

## Záměrná omezení a pasti
- Notion nepovolí čárku v názvu volby select/status: stav „nápad, ladí se“ je v Notionu „nápad (ladí se)“ (`STAV_DO_NOTIONU`), jinde se čárky v select nahradí „ / “, multi_select se podle čárek rozdělí.
- Token se nikdy neukládá do nastavení ani do souborů – jen SecretStorage.
- Změny v Notionu se do VS Code nepromítnou okamžitě (žádné webhooky) – až při zobrazení panelu, akci, ↻ nebo intervalu.
- Klik na úkol = virtuální dokument schématu `taskboard-ukol` (`TextDocumentContentProvider`, obsah stránky → Markdown) otevřený v `markdown.showPreview`. Notion do webview/Simple Browseru vložit nejde (zakazuje rámy), `openExternal` zase vyvolá dotaz VS Code na externí web.
- Hotové úkoly se filtrují jen při vykreslení (`vykresli()`), do odznaku se nepočítají tak jako tak.
- Mazání = koš Notionu, ne trvalé smazání. Import nekontroluje duplicity.
- Kontextové menu nevykresluje codicony, proto titulky příkazů s emoji/znaky. Položky se nesmí skrývat, jen zakázat (`enablement`).
- Odznak na webview view se ukáže až po prvním zobrazení panelu v relaci (omezení API).
- „Kopírovat pro Clauda“ jen plní schránku a přepne stav na „rozpracováno“ – vložit text do otevřené konverzace Claude Code nejde.
- Žádný git commit/push – ten dělá uživatel.
