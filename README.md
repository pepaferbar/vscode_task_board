# Úkolník

Doplněk pro VS Code. Databázi úkolů v **Notionu** zobrazí jako tabulku přímo v postranním panelu. Na ikoně v activity baru je číslo otevřených úkolů. Do Notionu zapisuje jen akce, které spustíte z tabulky (viz níže). Úkoly jde stejně dobře upravovat přímo v Notionu, třeba z mobilu.

## Nastavení Notionu (jednou)

1. **Integrace:** na [notion.so/profile/integrations](https://www.notion.so/profile/integrations) vytvořte *Internal integration* a zkopírujte její *Internal integration secret*.
2. **Databáze:** v Notionu založte databázi (tabulku) s těmito vlastnostmi. Názvy musí sedět přesně, chybějící vlastnost se jen přeskočí:

   | Vlastnost | Typ | Poznámka |
   |---|---|---|
   | *(titulek)* | Title | název úkolu, jméno sloupce může být libovolné |
   | `Aplikace` | Text (doporučeno), Select nebo Multi-select | |
   | `Stav` | Select (nebo Status) | volby: `nápad`, `nápad (ladí se)`, `zadání`, `rozpracováno`, `odloženo`, `hotovo` |
   | `Datum` | Date (nebo Text) | |
   | `Dál` | Text | další krok |
   | `Pořadí` | Number | řazení v tabulce; bez ní se řadí podle data vytvoření |

   Stav „nápad, ladí se“ má v Notionu volbu **„nápad (ladí se)“**, protože Notion nepovolí čárku v názvu volby. Doplněk ji převádí sám. Chybějící volby select si Notion při zápisu založí sám.
3. **Sdílení:** v databázi ⋯ → *Connections* → přidat svou integraci.
4. **Ve VS Code:**
   - paleta příkazů → **Úkolník: Nastavit token Notionu…** → vložit secret. Uloží se do úložiště tajných údajů VS Code, ne do `settings.json`.
   - nastavení `taskBoard.databaze` → vložit odkaz na databázi (stačí URL z prohlížeče, ID se z ní vytáhne samo).
5. **Převod ze starého MD (jednou):** paleta → **Úkolník: Importovat úkoly z prehled-planu.md do Notionu…** → vybrat soubor. Každý řádek tabulky „Stav v kostce“ se stane stránkou a text sekce `## N. …` jejím obsahem (nadpisy, odrážky, kód, **tučné** a `kód`). Řádek `**Stav:**` se vynechá, pokud nese jen samotný stav. Když za ním je poznámka, zůstane jako odstavec. Duplicity se nekontrolují, import proto spusťte jen jednou.

## Zobrazení

- Tabulka = stránky databáze seřazené podle `Pořadí`.
- Úzký panel: sloupce Plán, Stav (značka), Datum (krátké); aplikace a „Dál“ menším písmem pod názvem plánu.
- Panel roztažený na 520 px a víc: všech 5 sloupců vedle sebe (Plán, Aplikace, Stav, Datum, Dál).
- Najetí myší na řádek ukáže všechny údaje.
- **Klik** na řádek (nebo Enter) zobrazí úkol v záložce VS Code (náhled Markdownu: údaje, obsah stránky načtený z Notionu a odkaz „Otevřít v Notionu“). Notion samotný do záložky vložit nejde – nepovoluje zobrazení v rámu.
- Záhlaví panelu: ＋ nový úkol, ↻ obnovit, otevřít databázi v Notionu, přepínač hotových (oko).
- **Hotové úkoly jsou ve výchozím stavu skryté.** Ikona oka v záhlaví je zobrazí/skryje, volba se pamatuje i po restartu. Pod tabulkou je počet skrytých.
- Data se načtou při zobrazení panelu, po každé akci, tlačítkem ↻ a samy každých 5 minut (`taskBoard.intervalMinut`).
- Při chybě (síť, token) zůstanou vidět poslední načtená data a nad tabulkou se ukáže hláška.
- Číslo na ikoně se objeví, až se panel v dané relaci VS Code poprvé zobrazí (omezení webview panelů).

## Nový úkol

Tlačítko **＋** v záhlaví panelu (nebo „➕ Nový úkol…“ v kontextovém menu či paletě příkazů) se postupně zeptá na:

1. **název** (povinný),
2. **aplikaci** (nepovinná),
3. **stav** (výběr ze seznamu),
4. **Dál** – další krok (nepovinné),
5. **popis** (nepovinný; víc odrážek oddělte `;;`).

V databázi přibude stránka s dnešním datem, `Pořadí` = nejvyšší + 1 a popisem jako odrážkami. Esc v kterémkoli kroku přidání zruší.

## Akce nad úkolem

Klik na **značku stavu**, tlačítko **⋯** nebo **pravý klik** na řádek = kontextové menu (položky se znaky/emoji, aktuální stav zašedlý):

- **stavy** (nápad … hotovo) – změní vlastnost `Stav`. Datum se nemění.
- **Kopírovat pro Clauda** – název, údaje a celý obsah stránky jako Markdown do schránky (vložit ručně do otevřené konverzace; doplněk Claude Code neumí vložit text do už otevřené konverzace). Úkol se rovnou přepne do stavu „rozpracováno“.
- **Smazat úkol…** – po potvrzení přesune stránku do koše Notionu (odtud jde obnovit).

## Ikony stavů

| Stav | Ikona |
|---|---|
| zadání | modrý kroužek |
| nápad, nápad, ladí se | žlutá žárovka |
| rozpracováno | oranžové „play“ |
| odloženo | šedá pauza |
| hotovo | zelená fajfka |
| jiný | otazník |

## Nastavení

| Klíč | Výchozí | Popis |
|---|---|---|
| `taskBoard.databaze` | prázdné | ID databáze nebo odkaz na ni |
| `taskBoard.intervalMinut` | `5` | automatické načítání z Notionu (0 = vypnuto) |
| `taskBoard.badgeStavy` | `["nápad","nápad, ladí se","zadání","rozpracováno"]` | stavy, které se počítají do čísla na ikoně |

Token integrace se nastavuje příkazem **Nastavit token Notionu…** (prázdná hodnota token smaže).

## Instalace (bez Node.js, bez buildu)

Doplněk je v čistém JavaScriptu (`src/*.js`), VS Code ho spouští přímo. Instaluje se odkazem (junction) ze složky rozšíření na tuto složku:

```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\.vscode\extensions\ferbar.taskboard-0.1.0" -Target "C:\_temp\_VScode\vscode_task_board"
```

Potom restartovat VS Code. Po úpravě kódu stačí **Developer: Reload Window**.

Kdyby VS Code doplněk z odkazu nenačetl: paleta příkazů → **Developer: Install Extension from Location…** → vybrat tuto složku.

Ladění: otevřít složku `vscode_task_board` ve VS Code a stisknout F5. Spustí se nové okno s workspace `_VScode`.
