// Doplněk „Úkolník“ – zobrazí databázi úkolů v Notionu jako tabulku v postranním panelu.
// Čte přes REST API Notionu; zapisuje jen akce spuštěné uživatelem (nový úkol, stav, smazání).
// Čistý JavaScript, bez buildu a bez npm.
'use strict';
const vscode = require('vscode');
const { ID_STAVU, normalizujStav, parsujPrehled } = require('./parser');
const { TabulkaPlanu } = require('./tabulka');
const { NotionKlient, idZOdkazu, datumIso, dnesIso, odstranMarkdown } = require('./notion');

const SEKCE_NASTAVENI = 'taskBoard';
const KLIC_TOKENU = 'taskBoard.notionToken';
const KLIC_HOTOVE = 'taskBoard.zobrazitHotove'; // globalState: zobrazovat hotové úkoly (výchozí ne)
const SCHEMA_ZALOZKY = 'taskboard-ukol'; // virtuální dokumenty pro náhled úkolu v záložce

/** Stavy v kontextovém menu (pořadí životního cyklu); znak před názvem je v package.json. */
const NABIDKA_STAVU = ['nápad', 'nápad, ladí se', 'zadání', 'rozpracováno', 'odloženo', 'hotovo'];

/** @param {vscode.ExtensionContext} context */
function activate(context) {
    let posledniUkoly = [];
    let posledniZprava;
    let klient;
    let interval;
    let probiha; // běžící obnovení (další volání na něj počká)
    let znovu = false;

    // Tabulka v panelu: klik na řádek = zobrazit úkol v záložce, zobrazení panelu = obnovit
    const tabulka = new TabulkaPlanu({
        priOtevreni: (id) => otevritUkol(id),
        priZobrazeni: () => obnov(),
    });
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('taskBoard.tabulka', tabulka));

    const nastaveni = () => vscode.workspace.getConfiguration(SEKCE_NASTAVENI);

    /** Klient Notionu z tokenu (SecretStorage) a ID databáze (nastavení); bez nich undefined. */
    async function ziskejKlienta() {
        const token = await context.secrets.get(KLIC_TOKENU);
        const databaze = idZOdkazu(nastaveni().get('databaze'));
        if (!token || !databaze) {
            klient = undefined;
            return undefined;
        }
        if (!klient || klient.token !== token || klient.databaze !== databaze) {
            klient = new NotionKlient(token, databaze);
        }
        return klient;
    }

    /** Klient pro akci; když chybí nastavení, nabídne ho. */
    async function klientProAkci() {
        const k = await ziskejKlienta();
        if (!k) {
            const volba = await vscode.window.showWarningMessage(
                'Doplněk nemá nastavený token Notionu nebo ID databáze.',
                'Nastavit token',
                'Nastavit databázi',
            );
            if (volba === 'Nastavit token') {
                await akceNastavitToken();
            } else if (volba === 'Nastavit databázi') {
                await vscode.commands.executeCommand('workbench.action.openSettings', `${SEKCE_NASTAVENI}.databaze`);
            }
        }
        return k;
    }

    /** Chyba akce do notifikace a obnovení tabulky (stav v Notionu se mohl změnit). */
    function chyba(e) {
        vscode.window.showErrorMessage(e && e.message ? e.message : String(e));
        obnov();
    }

    const najdiUkol = (id) => posledniUkoly.find((u) => u.id === id);

    // ---------- Zobrazení úkolu v záložce (náhled Markdownu virtuálního dokumentu) ----------

    // Notion nejde vložit do rámu (zakazuje to), proto se obsah stránky převede na Markdown
    // a ukáže ve vestavěném náhledu – bez dotazu „otevřít externí web?“
    const obsahyZalozek = new Map(); // uri → text
    const zmenaZalozky = new vscode.EventEmitter();
    context.subscriptions.push(
        zmenaZalozky,
        vscode.workspace.registerTextDocumentContentProvider(SCHEMA_ZALOZKY, {
            onDidChange: zmenaZalozky.event,
            provideTextDocumentContent: (uri) => obsahyZalozek.get(uri.toString()) || 'Načítám…',
        }),
    );

    async function otevritUkol(id) {
        const ukol = najdiUkol(id);
        const k = await klientProAkci();
        if (!ukol || !k) {
            return;
        }
        // Název záložky = název úkolu (bez znaků, které nepatří do cesty)
        const nazev = ukol.plan.replace(/[\\/?#%*:|"<>]+/g, '-').trim() || 'úkol';
        const uri = vscode.Uri.from({ scheme: SCHEMA_ZALOZKY, path: `/${nazev}.md`, query: id.replace(/-/g, '') });
        try {
            const obsah = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Window, title: `Načítám ${ukol.plan}…` },
                () => k.obsahStranky(id),
            );
            const udaje = [
                ukol.aplikace && `**Aplikace:** ${ukol.aplikace}`,
                `**Stav:** ${ukol.stav || 'neuveden'}`,
                ukol.datum && `**Datum:** ${ukol.datum}`,
                ukol.dal && `**Dál:** ${ukol.dal}`,
            ].filter(Boolean);
            const text = [
                `# ${ukol.plan}`,
                '',
                udaje.join('  \n'),
                '',
                '---',
                '',
                obsah || '*Stránka nemá žádný obsah.*',
                '',
                '---',
                '',
                ukol.url ? `[Otevřít v Notionu](${ukol.url})` : '',
            ].join('\n');
            obsahyZalozek.set(uri.toString(), text);
            zmenaZalozky.fire(uri);
            try {
                await vscode.commands.executeCommand('markdown.showPreview', uri);
            } catch {
                // Záloha, kdyby vestavěné rozšíření Markdown nebylo k dispozici
                await vscode.window.showTextDocument(uri, { preview: true });
            }
        } catch (e) {
            chyba(e);
        }
    }

    // ---------- Přepínač zobrazení hotových ----------

    const zobrazitHotove = () => context.globalState.get(KLIC_HOTOVE, false);

    async function nastavHotove(zobrazit) {
        await context.globalState.update(KLIC_HOTOVE, zobrazit);
        vscode.commands.executeCommand('setContext', 'taskBoard.zobrazitHotove', zobrazit);
        vykresli();
    }

    // ---------- Akce nad úkolem (zápis do Notionu) ----------

    /** Nastaví úkolu zvolený stav (z kontextového menu). */
    async function nastavStav(id, stav) {
        const ukol = najdiUkol(id);
        const k = await klientProAkci();
        if (!ukol || !k || stav === ukol.stavKlic) {
            return;
        }
        try {
            await k.zmenStav(id, stav);
            await obnov();
        } catch (e) {
            chyba(e);
        }
    }

    /**
     * Celý úkol pro Clauda do schránky (vloží se ručně do otevřené konverzace).
     * Doplněk Claude Code neumí vložit text do už otevřené konverzace – jen otevřít novou.
     * Úkol se zároveň přepne do stavu „rozpracováno“ (pokud v něm už není).
     */
    async function akceProClauda(id) {
        const ukol = najdiUkol(id);
        const k = await klientProAkci();
        if (!ukol || !k) {
            return;
        }
        try {
            const obsah = await k.obsahStranky(id);
            const text = [
                `## ${ukol.plan}`,
                ukol.aplikace && `- Aplikace: ${ukol.aplikace}`,
                `- Stav: ${ukol.stav || 'neuveden'}`,
                ukol.datum && `- Datum: ${ukol.datum}`,
                ukol.dal && `- Dál: ${ukol.dal}`,
                obsah && `\n${obsah}`,
            ]
                .filter(Boolean)
                .join('\n');
            await vscode.env.clipboard.writeText(text);
            vscode.window.setStatusBarMessage(`$(check) Zkopírováno pro Clauda: ${ukol.plan}`, 3000);
            if (ukol.stavKlic !== 'rozpracováno') {
                await k.zmenStav(id, 'rozpracováno');
                await obnov();
            }
        } catch (e) {
            chyba(e);
        }
    }

    async function akceSmazat(id) {
        const ukol = najdiUkol(id);
        const k = await klientProAkci();
        if (!ukol || !k) {
            return;
        }
        const odpoved = await vscode.window.showWarningMessage(
            `Smazat úkol „${ukol.plan}“?`,
            { modal: true, detail: 'Stránka se přesune do koše v Notionu, odkud jde obnovit.' },
            'Smazat',
        );
        if (odpoved !== 'Smazat') {
            return;
        }
        try {
            await k.smazUkol(id);
            await obnov();
        } catch (e) {
            chyba(e);
        }
    }

    /**
     * Nový úkol: postupně se zeptá na název, aplikaci, stav, „Dál“ a popis.
     * Založí stránku v databázi (Pořadí = nejvyšší + 1, Datum = dnes). Esc kdykoli = zrušit.
     */
    async function akcePridat() {
        const k = await klientProAkci();
        if (!k) {
            return;
        }
        const titul = (krok) => `Nový úkol (${krok}/5)`;
        const plan = await vscode.window.showInputBox({
            title: titul(1),
            prompt: 'Název úkolu',
            ignoreFocusOut: true,
            validateInput: (v) => (v.trim() ? undefined : 'Název je povinný.'),
        });
        if (plan === undefined) {
            return;
        }
        const aplikace = await vscode.window.showInputBox({
            title: titul(2),
            prompt: 'Aplikace (nepovinné, Enter = přeskočit)',
            placeHolder: 'např. finance, rss, nový mcp',
            ignoreFocusOut: true,
        });
        if (aplikace === undefined) {
            return;
        }
        const stav = await vscode.window.showQuickPick(NABIDKA_STAVU, {
            title: titul(3),
            placeHolder: 'Stav úkolu',
            ignoreFocusOut: true,
        });
        if (stav === undefined) {
            return;
        }
        const dal = await vscode.window.showInputBox({
            title: titul(4),
            prompt: 'Dál – další krok (nepovinné, Enter = přeskočit)',
            ignoreFocusOut: true,
        });
        if (dal === undefined) {
            return;
        }
        const popis = await vscode.window.showInputBox({
            title: titul(5),
            prompt: 'Popis do stránky (nepovinné; víc odrážek oddělte „;;“)',
            ignoreFocusOut: true,
        });
        if (popis === undefined) {
            return;
        }
        const cislo = Math.max(0, ...posledniUkoly.map((u) => u.cislo || 0)) + 1;
        try {
            await k.vytvorUkol(
                { plan: plan.trim(), aplikace: aplikace.trim(), stav, datum: dnesIso(), dal: dal.trim(), poradi: cislo },
                popis.split(';;').map((p) => p.trim()).filter(Boolean).map((p) => `- ${p}`),
            );
            vscode.window.setStatusBarMessage(`$(check) Přidán úkol: ${plan.trim()}`, 3000);
            await obnov();
        } catch (e) {
            chyba(e);
        }
    }

    // ---------- Nastavení a import ----------

    async function akceNastavitToken() {
        const token = await vscode.window.showInputBox({
            title: 'Token integrace Notionu',
            prompt: 'Internal integration secret (notion.so/profile/integrations). Prázdné = smazat uložený token.',
            password: true,
            ignoreFocusOut: true,
        });
        if (token === undefined) {
            return;
        }
        if (token.trim()) {
            await context.secrets.store(KLIC_TOKENU, token.trim());
            vscode.window.setStatusBarMessage('$(check) Token Notionu uložen', 3000);
        } else {
            await context.secrets.delete(KLIC_TOKENU);
            vscode.window.setStatusBarMessage('$(check) Token Notionu smazán', 3000);
        }
        // obnov() zavolá onDidChange u secrets
    }

    /**
     * Jednorázový import z původního prehled-planu.md: každý řádek tabulky „Stav v kostce“
     * = nová stránka, text sekce „## N. …“ = obsah stránky.
     */
    async function akceImportovatMd() {
        const k = await klientProAkci();
        if (!k) {
            return;
        }
        const slozka = (vscode.workspace.workspaceFolders || [])[0];
        const vyber = await vscode.window.showOpenDialog({
            title: 'Soubor s přehledem plánů k importu do Notionu',
            defaultUri: slozka ? vscode.Uri.joinPath(slozka.uri, 'tasks', 'prehled-planu.md') : undefined,
            filters: { Markdown: ['md'] },
            canSelectMany: false,
        });
        if (!vyber || !vyber[0]) {
            return;
        }
        const text = Buffer.from(await vscode.workspace.fs.readFile(vyber[0])).toString('utf8');
        const radky = text.split(/\r?\n/);
        const ukoly = parsujPrehled(text);
        if (ukoly.length === 0) {
            vscode.window.showWarningMessage('V souboru nejsou žádné úkoly.');
            return;
        }
        const varovani = posledniUkoly.length
            ? `\n\nPozor: v databázi už je ${posledniUkoly.length} úkolů – import je přidá za ně (duplicity se nekontrolují).`
            : '';
        const odpoved = await vscode.window.showWarningMessage(
            `Importovat ${ukoly.length} úkolů do Notionu?`,
            { modal: true, detail: ukoly.map((u) => `• ${u.plan}`).join('\n') + varovani },
            'Importovat',
        );
        if (odpoved !== 'Importovat') {
            return;
        }
        const zacatek = Math.max(0, ...posledniUkoly.map((u) => u.cislo || 0));
        let hotovo = 0;
        try {
            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Import do Notionu', cancellable: true },
                async (prubeh, zruseni) => {
                    for (const u of ukoly) {
                        if (zruseni.isCancellationRequested) {
                            break;
                        }
                        prubeh.report({ message: `${hotovo + 1}/${ukoly.length}: ${u.plan}`, increment: 100 / ukoly.length });
                        await k.vytvorUkol(
                            {
                                plan: u.plan,
                                aplikace: u.aplikace,
                                stav: u.stavKlic === 'neznámý' ? u.stav : u.stavKlic,
                                datum: datumIso(u.datum) || u.datum,
                                dal: u.dal,
                                poradi: zacatek + hotovo + 1,
                            },
                            textSekce(radky, u),
                        );
                        hotovo++;
                    }
                },
            );
            vscode.window.showInformationMessage(`Importováno ${hotovo} z ${ukoly.length} úkolů.`);
        } catch (e) {
            vscode.window.showErrorMessage(`Import se zastavil po ${hotovo} úkolech: ${e && e.message ? e.message : e}`);
        }
        await obnov();
    }

    /** Příkaz z kontextového menu dostane objekt data-vscode-context, z kódu přímo ID stránky. */
    const prikazNadUkolem = (akce) => (arg) => {
        const id = typeof arg === 'string' ? arg : arg && arg.id;
        return id ? akce(id) : undefined;
    };
    context.subscriptions.push(
        vscode.commands.registerCommand('taskBoard.kopirovat', prikazNadUkolem(akceProClauda)),
        vscode.commands.registerCommand('taskBoard.smazat', prikazNadUkolem(akceSmazat)),
        vscode.commands.registerCommand('taskBoard.zobrazitHotove', () => nastavHotove(true)),
        vscode.commands.registerCommand('taskBoard.skrytHotove', () => nastavHotove(false)),
        vscode.commands.registerCommand('taskBoard.pridat', () => akcePridat()),
        vscode.commands.registerCommand('taskBoard.nastavitToken', () => akceNastavitToken()),
        vscode.commands.registerCommand('taskBoard.importovatMd', () => akceImportovatMd()),
        // Stavy přímo v kontextovém menu – jeden příkaz na každý stav (taskBoard.stav.napad apod.)
        ...NABIDKA_STAVU.map((stav) =>
            vscode.commands.registerCommand(`taskBoard.stav.${ID_STAVU[stav]}`, prikazNadUkolem((id) => nastavStav(id, stav))),
        ),
    );

    // ---------- Čtení z Notionu ----------

    /** Načte úkoly z Notionu a překreslí tabulku i odznak. Souběžná volání se sloučí. */
    async function obnov() {
        if (probiha) {
            znovu = true;
            return probiha;
        }
        probiha = (async () => {
            do {
                znovu = false;
                await nactiAVykresli();
            } while (znovu);
        })();
        try {
            await probiha;
        } finally {
            probiha = undefined;
        }
    }

    async function nactiAVykresli() {
        let ukoly = [];
        let zprava;
        const k = await ziskejKlienta();
        if (!k) {
            zprava = 'Nastavte token integrace (příkaz „Úkolník: Nastavit token Notionu“) a ID databáze (nastavení taskBoard.databaze).';
        } else {
            try {
                ukoly = await k.nactiUkoly();
                if (ukoly.length === 0) {
                    zprava = 'V databázi nejsou žádné úkoly.';
                }
            } catch (e) {
                // Při chybě nechat poslední známá data, jen připsat hlášku
                ukoly = posledniUkoly;
                zprava = e && e.message ? e.message : String(e);
            }
        }
        posledniUkoly = ukoly;
        posledniZprava = zprava;
        vykresli();
        aktualizujOdznak(ukoly);
    }

    /** Překreslí tabulku z posledních dat; hotové úkoly jen při zapnutém přepínači. */
    function vykresli() {
        const zobrazit = zobrazitHotove();
        const viditelne = zobrazit ? posledniUkoly : posledniUkoly.filter((u) => u.stavKlic !== 'hotovo');
        const skryto = posledniUkoly.length - viditelne.length;
        tabulka.aktualizuj(viditelne, posledniZprava, skryto > 0 ? `Skryté hotové: ${skryto}` : undefined);
    }

    /** Odznak na ikoně v activity baru = počet úkolů ve stavech z nastavení. */
    function aktualizujOdznak(ukoly) {
        const stavy = new Set((nastaveni().get('badgeStavy') || []).map((s) => normalizujStav(s)));
        stavy.delete('neznámý');
        const pocet = ukoly.filter((u) => stavy.has(u.stavKlic)).length;
        tabulka.nastavOdznak(pocet > 0 ? { value: pocet, tooltip: textOdznaku(pocet) } : undefined);
    }

    /** Pravidelné obnovení (změny z Notionu, např. z mobilu); 0 = vypnuto. */
    function nastavInterval() {
        if (interval) {
            clearInterval(interval);
            interval = undefined;
        }
        const minut = Number(nastaveni().get('intervalMinut'));
        if (minut > 0) {
            interval = setInterval(() => obnov(), minut * 60 * 1000);
        }
    }

    context.subscriptions.push(
        { dispose: () => interval && clearInterval(interval) },

        vscode.commands.registerCommand('taskBoard.obnovit', () => obnov()),

        vscode.commands.registerCommand('taskBoard.otevritSoubor', async () => {
            const k = await klientProAkci();
            if (!k) {
                return;
            }
            try {
                const zdroj = await k.zdrojDat();
                await vscode.env.openExternal(vscode.Uri.parse(zdroj.url));
            } catch (e) {
                chyba(e);
            }
        }),

        context.secrets.onDidChange((e) => {
            if (e.key === KLIC_TOKENU) {
                obnov();
            }
        }),

        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration(`${SEKCE_NASTAVENI}.intervalMinut`)) {
                nastavInterval();
            }
            if (e.affectsConfiguration(SEKCE_NASTAVENI)) {
                obnov();
            }
        }),
    );

    // Výchozí stav přepínače hotových (kontext pro ikonu v záhlaví)
    vscode.commands.executeCommand('setContext', 'taskBoard.zobrazitHotove', zobrazitHotove());
    nastavInterval();
    obnov();
}

function deactivate() {
    // Vše se uvolní přes context.subscriptions
}

/**
 * Text sekce úkolu z původního MD pro import (bez nadpisu).
 * Řádek „**Stav:** …“ se vynechá, pokud nese jen stav – ten je ve vlastnosti Stav.
 */
function textSekce(radky, ukol) {
    if (ukol.sekceOd === undefined || ukol.sekceDo === undefined) {
        return [];
    }
    return radky.slice(ukol.sekceOd + 1, ukol.sekceDo).filter((r, i) => {
        if (ukol.sekceOd + 1 + i !== ukol.radekStavu) {
            return true;
        }
        const zbytek = odstranMarkdown(r).replace(/^Stav:?\s*/i, '').replace(/[.\s]+$/, '');
        return zbytek.toLowerCase() !== String(ukol.stavKlic).toLowerCase();
    });
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
