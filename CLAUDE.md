# vscode_task_board („Plány a úkoly“) – architektura

*Aktualizováno: 13. 11. 2026 skillem `/architektura`. Zdroj pravdy je kód – při rozporu platí kód.*

## Účel
Doplněk VS Code (ID `ferbar.taskboard`, verze 0.1.0): soubor `tasks/prehled-planu.md` z workspace `_VScode` zobrazí jako tabulku (webview) v postranním panelu, s odznakem počtu otevřených úkolů na ikoně v activity baru. Do souboru zapisuje jen akce spuštěné uživatelem (změna stavu, smazání, „Kopírovat pro Clauda“). Uživatelský popis je v `README.md`.

## Vstupní body
- `package.json` – manifest: aktivace `workspaceContains:tasks/prehled-planu.md`, kontejner `taskBoard` v activity baru, webview view `taskBoard.tabulka`, příkazy, menu, nastavení.
- `src/extension.js` – `activate()`: registrace providera, příkazů, watcherů, `obnov()`.

## Struktura
| Cesta | Obsah |
|---|---|
| `src/extension.js` | Hledání souboru (`najdiSoubor` – absolutní cesta, nebo první složka workspace), `obnov()` (čte přes `workspace.fs`, parsuje, překreslí, odznak, kontext `taskBoard.maHotove`), akce nad úkolem, `FileSystemWatcher` s debounce 200 ms, reakce na změnu nastavení/složek |
| `src/parser.js` | Čistě textový parser (bez API VS Code): tabulka pod nadpisem `## … Stav v kostce …` (sloupce Plán / Aplikace / Stav / Datum / Dál), sekce `## N. Název`, řádek `**Stav:**`, kotvy nadpisů; `normalizujStav`, `ID_STAVU` (ASCII id pro `when`/`enablement`) |
| `src/upravy.js` | Úpravy nad polem řádků: `zmenStav` (buňka + začátek řádku `**Stav:**`, poznámka za stavem zůstane), `smazUkol` (řádek tabulky + sekce, přečíslování vyšších `## N.`), `textUkolu` (text sekce pro schránku) |
| `src/tabulka.js` | `TabulkaPlanu` – `WebviewViewProvider`: HTML s CSP a nonce, escapování `esc()`, ≥ 520 px všech 5 sloupců, jinak úzké rozložení; řádky nesou `data-vscode-context` (`webviewSection: 'ukol'`, `poradi`, `stavId`) pro nativní kontextové menu |
| `resources/checklist.svg` | Ikona v activity baru |
| `.vscode/launch.json` | F5 = Extension Development Host s workspace `${workspaceFolder}/..` |

## Příkazy a nastavení
- Příkazy: `taskBoard.obnovit`, `taskBoard.otevritSoubor` (náhled Markdownu), `taskBoard.kopirovat`, `taskBoard.smazat`, `taskBoard.smazatHotove` (`enablement: taskBoard.maHotove`), `taskBoard.stav.{napad,napadLadi,zadani,rozpracovano,odlozeno,hotovo}` (`enablement: stavId != …`). Příkazy nad úkolem jsou v paletě skryté (`when: false`).
- Nastavení: `taskBoard.soubor` (výchozí `tasks/prehled-planu.md`), `taskBoard.badgeStavy` (stavy počítané do odznaku).
- Známé stavy: `nápad`, `nápad, ladí se`, `zadání`, `rozpracováno`, `odloženo`, `hotovo`; jiné = `neznámý`.

## Tok zápisu
`nactiUkol(poradi)` načte aktuální text dokumentu (i neuložené změny), znovu ho rozparsuje a ověří, že název sedí s tím, co je v tabulce → úprava pole řádků → `zapis()` nahradí celý obsah přes `WorkspaceEdit` (zachová EOL, jde vrátit Ctrl+Z), uloží a obnoví. „Smazat hotové“ maže po jednom a po každém kroku parsuje znovu.

## Závislosti mimo složku
- Čte a zapisuje `C:\_temp\_VScode\tasks\prehled-planu.md` (formát souboru je závislost – změna struktury tabulky/sekcí rozbije parser).
- Žádné npm balíčky; jen modul `vscode` (engine `^1.80.0`) a `path`.

## Nasazení / build
- Bez buildu a bez Node.js – VS Code spouští `src/*.js` přímo.
- Instalace junctionem `%USERPROFILE%\.vscode\extensions\ferbar.taskboard-0.1.0` → tato složka; po úpravě stačí **Developer: Reload Window**. Ladění: F5.
- `.vscodeignore` vyřazuje z balíčku `.vscode/**`, `change.md`, `*.vsix`.

## Záměrná omezení a pasti
- Číslo sekce `## N.` = pořadí řádku v tabulce; párování sekce s řádkem jde nejdřív podle N, záložně podle shody názvu. Při ručních úpravách souboru to musí sedět.
- Parser musí být tolerantní – chybějící sloupec, sekce nebo neznámý stav nesmí nic shodit.
- Klik na řádek otevírá náhled bez posunu na sekci (náhled VS Code neumí kotvy s diakritikou) – kotvy se počítají, ale nepoužívají.
- Kontextové menu nevykresluje codicony, proto titulky příkazů s emoji/znaky. Položky se nesmí skrývat, jen zakázat (`enablement`).
- Odznak na webview view se ukáže až po prvním zobrazení panelu v relaci (omezení API).
- „Kopírovat pro Clauda“ jen plní schránku a přepne stav na „rozpracováno“ – vložit text do otevřené konverzace Claude Code nejde.
- Žádný git commit/push – ten dělá uživatel.
