# Plány a úkoly

Doplněk pro VS Code. Soubor `tasks/prehled-planu.md` zobrazí jako tabulku přímo v postranním panelu. Na ikoně v activity baru je číslo otevřených úkolů. Do souboru zapisuje jen akce, které spustíte z tabulky (viz níže) – commit a push pak děláte sami.

## Zobrazení

- Tabulka = řádky tabulky „Stav v kostce“ v pořadí souboru (pořadí přidání).
- Úzký panel: sloupce Plán, Stav (značka), Datum (krátké); aplikace a „Dál“ menším písmem pod názvem plánu.
- Panel roztažený na 520 px a víc: všech 5 sloupců vedle sebe (Plán, Aplikace, Stav, Datum, Dál).
- Najetí myší na řádek ukáže všechny údaje.
- **Klik** na řádek (nebo Enter) otevře přehled v **náhledu Markdownu** (bez posunu na sekci – náhled VS Code neumí kotvy s diakritikou).
- Záhlaví panelu: ↻ obnovit, otevřít přehled v náhledu.
- Tabulka i číslo se obnoví samy po uložení souboru nebo po `git pull`.
- Číslo na ikoně se objeví, až se panel v dané relaci VS Code poprvé zobrazí (omezení webview panelů).

## Akce nad úkolem

Klik na **značku stavu**, tlačítko **⋯** nebo **pravý klik** na řádek = kontextové menu (položky se znaky/emoji, aktuální stav zašedlý):

- **stavy** (nápad … hotovo) – přímo v menu, oddělené čarou, aktuální stav chybí; přepíše buňku Stav v tabulce a začátek řádku `**Stav:**` v sekci (poznámka za čárkou zůstane). Datum se nemění.
- **Upravit „Dál“…** – přepíše sloupec Dál a Datum nastaví na dnešek.
- **Vložit do Clauda** – celá sekce úkolu se zkopíruje do schránky a otevře se nová konverzace Claude Code s textem v poli zprávy (neodešle se). Bez doplňku Claude Code zůstane jen schránka.
- **Smazat všechny hotové…** (tlačítko $(clear-all) v záhlaví panelu) – po potvrzení se seznamem smaže všechny úkoly ve stavu *hotovo* (řádky i sekce, přečíslování); bez hotových úkolů je tlačítko zašedlé.
- **Smazat úkol…** – po potvrzení smaže řádek tabulky i sekci `## N. …` a přečísluje další sekce.

Tlačítko **⋯** (ukáže se při najetí na řádek) otevře totéž kontextové menu jako pravý klik (aktuální stav je zašedlý).

Úpravy jdou přes editor a soubor se hned uloží – vrátit je jde přes Ctrl+Z v otevřeném souboru.

## Ikony stavů

| Stav | Ikona |
|---|---|
| zadání | modrý kroužek |
| nápad, nápad, ladí se | žlutá žárovka |
| rozpracováno | oranžové „play“ |
| odloženo | šedá pauza |
| hotovo | zelená fajfka |
| jiný | otazník |

Hotové úkoly se poznají jen podle sloupce Stav = „hotovo“ a do čísla na ikoně se nepočítají. Když řádek ze souboru smažete, zmizí i ze seznamu.

## Nastavení

| Klíč | Výchozí | Popis |
|---|---|---|
| `taskBoard.soubor` | `tasks/prehled-planu.md` | cesta k souboru (relativní ke kořeni workspace nebo absolutní) |
| `taskBoard.badgeStavy` | `["nápad","nápad, ladí se","zadání","rozpracováno"]` | stavy, které se počítají do čísla na ikoně |

## Instalace (bez Node.js, bez buildu)

Doplněk je v čistém JavaScriptu (`src/*.js`), VS Code ho spouští přímo. Instaluje se odkazem (junction) ze složky rozšíření na tuto složku:

```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\.vscode\extensions\ferbar.taskboard-0.1.0" -Target "C:\_temp\_VScode\vscode_task_board"
```

Potom restartovat VS Code. Po úpravě kódu stačí **Developer: Reload Window**.

Kdyby VS Code doplněk z odkazu nenačetl: paleta příkazů → **Developer: Install Extension from Location…** → vybrat tuto složku.

Ladění: otevřít složku `vscode_task_board` ve VS Code a stisknout F5. Spustí se nové okno s workspace `_VScode`.
