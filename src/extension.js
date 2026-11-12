// Doplněk „Plány a úkoly“ – zobrazí tasks/prehled-planu.md jako tabulku v postranním panelu.
// Soubor čte; zapisuje do něj jen akce spuštěné uživatelem z tabulky (stav, Dál, smazání).
// Čistý JavaScript, bez buildu.
'use strict';
const path = require('path');
const vscode = require('vscode');
const { ID_STAVU, bunky, normalizujStav, parsujPrehled } = require('./parser');
const { TabulkaPlanu } = require('./tabulka');
const { smazUkol, textUkolu, upravDal, zmenStav } = require('./upravy');

const SEKCE_NASTAVENI = 'taskBoard';
const VYCHOZI_SOUBOR = 'tasks/prehled-planu.md';

/** Stavy v kontextovém menu (pořadí životního cyklu); znak před názvem je v package.json. */
const NABIDKA_STAVU = ['nápad', 'nápad, ladí se', 'zadání', 'rozpracováno', 'odloženo', 'hotovo'];

/** @param {vscode.ExtensionContext} context */
function activate(context) {
    let watchery = [];
    let casovac;
    let aktualniSoubor;
    let posledniUkoly = [];

    // Tabulka v panelu: klik na řádek = náhled
    // (značka stavu, ⋯ i pravý klik otevírají nativní kontextové menu přímo ve webview)
    const tabulka = new TabulkaPlanu(() => otevritPrehled());
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('taskBoard.tabulka', tabulka));

    async function otevritPrehled() {
        const uri = aktualniSoubor || (await najdiSoubor());
        if (uri) {
            await otevritNahled(uri);
        } else {
            vscode.window.showWarningMessage('Soubor s přehledem plánů nebyl nalezen.');
        }
    }

    // ---------- Akce nad úkolem (zápis do souboru) ----------

    /**
     * Načte aktuální text souboru (včetně neuložených změn v editoru) a najde úkol podle pořadí.
     * Ověří, že jde o stejný úkol, jaký je vidět v tabulce (soubor se mezitím mohl změnit).
     */
    async function nactiUkol(poradi) {
        const uri = aktualniSoubor || (await najdiSoubor());
        if (!uri) {
            vscode.window.showWarningMessage('Soubor s přehledem plánů nebyl nalezen.');
            return undefined;
        }
        const dokument = await vscode.workspace.openTextDocument(uri);
        const text = dokument.getText();
        const ukol = parsujPrehled(text).find((u) => u.poradi === poradi);
        const zobrazeny = posledniUkoly.find((u) => u.poradi === poradi);
        if (!ukol || ukol.radekTabulky === undefined || (zobrazeny && zobrazeny.plan !== ukol.plan)) {
            vscode.window.showWarningMessage('Úkol v souboru nesouhlasí s tabulkou – obnovte ji a zkuste to znovu.');
            obnov();
            return undefined;
        }
        return { dokument, radky: text.split(/\r?\n/), ukol };
    }

    /** Nahradí celý obsah dokumentu (jde vrátit přes Ctrl+Z) a uloží ho. */
    async function zapis(dokument, radky) {
        const eol = dokument.eol === vscode.EndOfLine.CRLF ? '\r\n' : '\n';
        const edit = new vscode.WorkspaceEdit();
        const cely = new vscode.Range(dokument.positionAt(0), dokument.positionAt(dokument.getText().length));
        edit.replace(dokument.uri, cely, radky.join(eol));
        if (!(await vscode.workspace.applyEdit(edit))) {
            vscode.window.showErrorMessage('Úpravu souboru se nepodařilo provést.');
            return false;
        }
        await dokument.save();
        await obnov();
        return true;
    }

    /** Nastaví úkolu zvolený stav (z kontextového menu). */
    async function nastavStav(poradi, stav) {
        const data = await nactiUkol(poradi);
        if (!data || stav === data.ukol.stavKlic) {
            return;
        }
        zmenStav(data.radky, data.ukol, stav);
        await zapis(data.dokument, data.radky);
    }

    async function akceUpravitDal(poradi) {
        const data = await nactiUkol(poradi);
        if (!data) {
            return;
        }
        // Původní text buňky i s markdownem (`kód` apod.)
        const puvodni = bunky(data.radky[data.ukol.radekTabulky])[4] || '';
        const text = await vscode.window.showInputBox({
            title: `Dál – ${data.ukol.plan}`,
            prompt: 'Další krok (Datum se nastaví na dnešek)',
            value: puvodni,
        });
        if (text === undefined || text.trim() === puvodni.trim()) {
            return;
        }
        upravDal(data.radky, data.ukol, text);
        await zapis(data.dokument, data.radky);
    }

    /**
     * Celá sekce úkolu pro Clauda: zkopíruje ji do schránky (záloha) a otevře novou konverzaci
     * Claude Code s textem předvyplněným v poli zprávy (neodesílá se).
     * Používá interní příkaz doplňku Claude Code – když chybí nebo selže, zůstane jen schránka.
     */
    async function akceProClauda(poradi) {
        const data = await nactiUkol(poradi);
        if (!data) {
            return;
        }
        const text = textUkolu(data.radky, data.ukol);
        await vscode.env.clipboard.writeText(text);
        const prikazy = await vscode.commands.getCommands(true);
        if (prikazy.includes('claude-vscode.editor.open')) {
            try {
                // Parametry: id relace (žádné = nová konverzace), počáteční text zprávy
                await vscode.commands.executeCommand('claude-vscode.editor.open', undefined, text);
                return;
            } catch {
                // Pokračuje se hláškou o schránce
            }
        }
        vscode.window.setStatusBarMessage(`$(check) Zkopírováno: ${data.ukol.plan}`, 3000);
    }

    async function akceSmazat(poradi) {
        const data = await nactiUkol(poradi);
        if (!data) {
            return;
        }
        const co = data.ukol.cisloSekce !== undefined
            ? `řádek v tabulce i sekci „## ${data.ukol.cisloSekce}. …“ (další sekce se přečíslují)`
            : 'řádek v tabulce';
        const odpoved = await vscode.window.showWarningMessage(
            `Smazat úkol „${data.ukol.plan}“?`,
            { modal: true, detail: `Smaže se ${co}. Vrátit jde přes Ctrl+Z v souboru.` },
            'Smazat',
        );
        if (odpoved !== 'Smazat') {
            return;
        }
        await zapis(data.dokument, smazUkol(data.radky, data.ukol));
    }

    /**
     * Smaže všechny úkoly ve stavu „hotovo“ (řádky tabulky i sekce, přečíslování).
     * Maže se po jednom a po každém smazání se soubor znovu rozparsuje (posouvají se čísla řádků).
     */
    async function akceSmazatHotove() {
        const uri = aktualniSoubor || (await najdiSoubor());
        if (!uri) {
            vscode.window.showWarningMessage('Soubor s přehledem plánů nebyl nalezen.');
            return;
        }
        const dokument = await vscode.workspace.openTextDocument(uri);
        let radky = dokument.getText().split(/\r?\n/);
        const jeHotovy = (u) => u.stavKlic === 'hotovo' && u.radekTabulky !== undefined;
        const hotove = parsujPrehled(radky.join('\n')).filter(jeHotovy);
        if (hotove.length === 0) {
            vscode.window.showInformationMessage('Žádné hotové úkoly ke smazání.');
            return;
        }
        const seznam = hotove.map((u) => `• ${u.plan}`).join('\n');
        const odpoved = await vscode.window.showWarningMessage(
            `Smazat všechny hotové úkoly (${hotove.length})?`,
            { modal: true, detail: `${seznam}\n\nSmažou se řádky v tabulce i sekce, další sekce se přečíslují. Vrátit jde přes Ctrl+Z v souboru.` },
            'Smazat',
        );
        if (odpoved !== 'Smazat') {
            return;
        }
        let ukol;
        while ((ukol = parsujPrehled(radky.join('\n')).find(jeHotovy))) {
            radky = smazUkol(radky, ukol);
        }
        await zapis(dokument, radky);
    }

    /** Příkaz z kontextového menu dostane objekt data-vscode-context, z palety číslo. */
    const prikazNadUkolem = (akce) => (arg) => {
        const poradi = typeof arg === 'number' ? arg : Number(arg && arg.poradi);
        return poradi ? akce(poradi) : undefined;
    };
    context.subscriptions.push(
        vscode.commands.registerCommand('taskBoard.upravitDal', prikazNadUkolem(akceUpravitDal)),
        vscode.commands.registerCommand('taskBoard.kopirovat', prikazNadUkolem(akceProClauda)),
        vscode.commands.registerCommand('taskBoard.smazat', prikazNadUkolem(akceSmazat)),
        vscode.commands.registerCommand('taskBoard.smazatHotove', () => akceSmazatHotove()),
        // Stavy přímo v kontextovém menu – jeden příkaz na každý stav (taskBoard.stav.napad apod.)
        ...NABIDKA_STAVU.map((stav) =>
            vscode.commands.registerCommand(`taskBoard.stav.${ID_STAVU[stav]}`, prikazNadUkolem((p) => nastavStav(p, stav))),
        ),
    );

    // ---------- Čtení souboru ----------

    const nastaveni = () => vscode.workspace.getConfiguration(SEKCE_NASTAVENI);
    const cestaSouboru = () => (nastaveni().get('soubor') || VYCHOZI_SOUBOR).trim();

    /** Najde soubor s přehledem (absolutní cesta, nebo první složka workspace, kde existuje). */
    async function najdiSoubor() {
        const cesta = cestaSouboru();
        if (path.isAbsolute(cesta)) {
            const uri = vscode.Uri.file(cesta);
            return (await existuje(uri)) ? uri : undefined;
        }
        const casti = cesta.split(/[\\/]+/).filter(Boolean);
        for (const slozka of vscode.workspace.workspaceFolders || []) {
            const uri = vscode.Uri.joinPath(slozka.uri, ...casti);
            if (await existuje(uri)) {
                return uri;
            }
        }
        return undefined;
    }

    /** Načte soubor, rozparsuje ho a překreslí tabulku i odznak. */
    async function obnov() {
        let ukoly = [];
        let zprava;
        aktualniSoubor = await najdiSoubor();
        if (!aktualniSoubor) {
            zprava = `Soubor „${cestaSouboru()}“ nebyl ve workspace nalezen.`;
        } else {
            try {
                const data = await vscode.workspace.fs.readFile(aktualniSoubor);
                ukoly = parsujPrehled(Buffer.from(data).toString('utf8'));
                if (ukoly.length === 0) {
                    zprava = 'V souboru nejsou žádné úkoly.';
                }
            } catch (e) {
                zprava = `Soubor nelze načíst: ${e && e.message ? e.message : String(e)}`;
            }
        }
        posledniUkoly = ukoly;
        // Tlačítko „Smazat hotové“ je vidět vždy, bez hotových úkolů jen zakázané
        vscode.commands.executeCommand('setContext', 'taskBoard.maHotove', ukoly.some((u) => u.stavKlic === 'hotovo'));
        tabulka.aktualizuj(ukoly, zprava);
        aktualizujOdznak(ukoly);
    }

    /** Odznak na ikoně v activity baru = počet úkolů ve stavech z nastavení. */
    function aktualizujOdznak(ukoly) {
        const stavy = new Set((nastaveni().get('badgeStavy') || []).map((s) => normalizujStav(s)));
        stavy.delete('neznámý');
        const pocet = ukoly.filter((u) => stavy.has(u.stavKlic)).length;
        tabulka.nastavOdznak(pocet > 0 ? { value: pocet, tooltip: textOdznaku(pocet) } : undefined);
    }

    /** Obnovení s malým zpožděním (při uložení chodí víc událostí za sebou). */
    function naplanujObnoveni() {
        if (casovac) {
            clearTimeout(casovac);
        }
        casovac = setTimeout(() => {
            casovac = undefined;
            obnov();
        }, 200);
    }

    /** Sleduje soubor na disku (uložení, git pull, smazání). */
    function nastavWatchery() {
        watchery.forEach((w) => w.dispose());
        watchery = [];
        const cesta = cestaSouboru();
        const vzory = [];
        if (path.isAbsolute(cesta)) {
            vzory.push(new vscode.RelativePattern(vscode.Uri.file(path.dirname(cesta)), path.basename(cesta)));
        } else {
            const relativni = cesta.replace(/\\/g, '/').replace(/^\.?\//, '');
            for (const slozka of vscode.workspace.workspaceFolders || []) {
                vzory.push(new vscode.RelativePattern(slozka, relativni));
            }
        }
        for (const vzor of vzory) {
            const w = vscode.workspace.createFileSystemWatcher(vzor);
            w.onDidChange(naplanujObnoveni);
            w.onDidCreate(naplanujObnoveni);
            w.onDidDelete(naplanujObnoveni);
            watchery.push(w);
        }
    }

    context.subscriptions.push(
        { dispose: () => watchery.forEach((w) => w.dispose()) },
        { dispose: () => casovac && clearTimeout(casovac) },

        vscode.commands.registerCommand('taskBoard.obnovit', () => obnov()),

        vscode.commands.registerCommand('taskBoard.otevritSoubor', async () => {
            const uri = aktualniSoubor || (await najdiSoubor());
            if (uri) {
                await otevritNahled(uri);
            } else {
                vscode.window.showWarningMessage('Soubor s přehledem plánů nebyl nalezen.');
            }
        }),

        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(`${SEKCE_NASTAVENI}.soubor`)) {
                nastavWatchery();
            }
            if (e.affectsConfiguration(SEKCE_NASTAVENI)) {
                obnov();
            }
        }),

        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            nastavWatchery();
            obnov();
        }),
    );

    nastavWatchery();
    obnov();
}

function deactivate() {
    // Vše se uvolní přes context.subscriptions
}

async function existuje(uri) {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    } catch {
        return false;
    }
}

/**
 * Otevře přehled ve vestavěném náhledu Markdownu (ne v editoru), bez posunu na sekci.
 * (Posun na kotvu nefunguje u nadpisů s diakritikou – chyba náhledu VS Code – a obejití blikalo.)
 */
async function otevritNahled(uri) {
    try {
        await vscode.commands.executeCommand('markdown.showPreview', uri);
    } catch {
        // Záloha, kdyby vestavěné rozšíření Markdown nebylo k dispozici
        await vscode.window.showTextDocument(uri, { preview: true });
    }
}

/** Česká množná čísla pro tooltip odznaku. */
function textOdznaku(n) {
    if (n === 1) {
        return '1 otevřený úkol';
    }
    if (n >= 2 && n <= 4) {
        return `${n} otevřené úkoly`;
    }
    return `${n} otevřených úkolů`;
}

module.exports = { activate, deactivate };
