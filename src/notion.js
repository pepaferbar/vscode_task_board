// Tenký klient REST API Notionu pro databázi úkolů – bez npm, jen globální fetch (Node 18+ v extension hostu).
// Nezávisí na API VS Code. Verze API 2025-09-03: databáze má „data source“, dotazy a nové stránky jdou přes něj.
'use strict';
const { normalizujStav, odstranMarkdown } = require('./parser');

const API = 'https://api.notion.com/v1';
const VERZE_API = '2025-09-03';
const MEZERA_MS = 350; // Notion povoluje v průměru 3 požadavky za sekundu
const MAX_TEXT = 2000; // limit znaků jednoho rich_text prvku
const MAX_BLOKU = 100; // limit bloků v jednom požadavku

/** Názvy vlastností v databázi (titulek se hledá podle typu, ne podle názvu). */
const VLASTNOSTI = { aplikace: 'Aplikace', stav: 'Stav', datum: 'Datum', dal: 'Dál', poradi: 'Pořadí' };

/** Notion nepovolí čárku v názvu volby select/status – stavy s čárkou mají v Notionu jiný zápis. */
const STAV_DO_NOTIONU = { 'nápad, ladí se': 'nápad (ladí se)' };

/** Z URL nebo textu vytáhne ID databáze (32 hex znaků, případně s pomlčkami). */
function idZOdkazu(s) {
    const t = String(s || '').trim();
    const m = /([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})(?![0-9a-f])/i.exec(t.split('?')[0]);
    return m ? m[1].replace(/-/g, '') : '';
}

/** Datum ISO (2026-11-15) → zápis jako v tabulce „15. 11. 2026“. */
function datumCesky(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${parseInt(m[3], 10)}. ${parseInt(m[2], 10)}. ${m[1]}` : '';
}

/** První datum „d. m. rrrr“ v textu → ISO, jinak ''. */
function datumIso(text) {
    const m = /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(text || '');
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

function dnesIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ---------- Rich text ----------

/** Prostý text → pole rich_text (rozdělené po 2000 znacích). */
function rt(text) {
    const s = String(text || '');
    const ven = [];
    for (let i = 0; i < s.length; i += MAX_TEXT) {
        ven.push({ type: 'text', text: { content: s.slice(i, i + MAX_TEXT) } });
    }
    return ven;
}

/** Markdown řádek → rich_text s tučným (**…**) a kódem (`…`); ostatní značky zůstanou jako text. */
function rtZMarkdownu(radek) {
    const ven = [];
    const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
    let posledni = 0;
    let m;
    while ((m = re.exec(radek))) {
        if (m.index > posledni) {
            ven.push(...rt(radek.slice(posledni, m.index)));
        }
        const kus = rt(m[1] !== undefined ? m[1] : m[2]);
        kus.forEach((k) => (k.annotations = m[1] !== undefined ? { bold: true } : { code: true }));
        ven.push(...kus);
        posledni = re.lastIndex;
    }
    if (posledni < radek.length) {
        ven.push(...rt(radek.slice(posledni)));
    }
    return ven;
}

/** Pole rich_text → Markdown (tučné, kurzíva, kód, odkazy). */
function rtDoMarkdownu(pole) {
    return (pole || [])
        .map((r) => {
            let t = r.plain_text || '';
            if (!t.trim()) {
                return t;
            }
            const a = r.annotations || {};
            if (a.code) {
                t = `\`${t}\``;
            }
            if (a.bold) {
                t = `**${t}**`;
            }
            if (a.italic) {
                t = `*${t}*`;
            }
            if (r.href) {
                t = `[${t}](${r.href})`;
            }
            return t;
        })
        .join('');
}

const prostyText = (pole) => (pole || []).map((r) => r.plain_text || '').join('');

// ---------- Bloky ----------

const blok = (typ, radek) => ({ object: 'block', type: typ, [typ]: { rich_text: rtZMarkdownu(radek) } });

/** Řádky Markdownu (text sekce) → bloky Notionu: nadpisy, odrážky, číslované body, kód, odstavce. */
function blokyZMarkdownu(radky) {
    const ven = [];
    let kod;
    for (const r of radky) {
        if (/^\s*(```|~~~)/.test(r)) {
            if (kod) {
                ven.push({ object: 'block', type: 'code', code: { rich_text: rt(kod.radky.join('\n')), language: kod.jazyk } });
                kod = undefined;
            } else {
                kod = { radky: [], jazyk: r.replace(/^\s*(```|~~~)/, '').trim() || 'plain text' };
            }
            continue;
        }
        if (kod) {
            kod.radky.push(r);
            continue;
        }
        const t = r.trim();
        let m;
        if (!t || /^-{3,}$/.test(t)) {
            continue;
        }
        if ((m = /^(#{1,6})\s+(.*)$/.exec(t))) {
            ven.push(blok(`heading_${Math.min(3, Math.max(1, m[1].length - 1))}`, m[2]));
        } else if ((m = /^[-*+]\s+(.*)$/.exec(t))) {
            ven.push(blok('bulleted_list_item', m[1]));
        } else if ((m = /^\d+[.)]\s+(.*)$/.exec(t))) {
            ven.push(blok('numbered_list_item', m[1]));
        } else {
            ven.push(blok('paragraph', t));
        }
    }
    if (kod) {
        ven.push({ object: 'block', type: 'code', code: { rich_text: rt(kod.radky.join('\n')), language: kod.jazyk } });
    }
    return ven;
}

/** Jeden blok Notionu → řádek Markdownu (odsazení podle hloubky). */
function blokDoMarkdownu(b, hloubka) {
    const odsazeni = '  '.repeat(hloubka);
    const obsah = b[b.type] || {};
    const text = rtDoMarkdownu(obsah.rich_text);
    switch (b.type) {
        case 'heading_1':
            return `### ${text}`;
        case 'heading_2':
            return `### ${text}`;
        case 'heading_3':
            return `#### ${text}`;
        case 'bulleted_list_item':
            return `${odsazeni}- ${text}`;
        case 'numbered_list_item':
            return `${odsazeni}1. ${text}`;
        case 'to_do':
            return `${odsazeni}- [${obsah.checked ? 'x' : ' '}] ${text}`;
        case 'quote':
            return `> ${text}`;
        case 'callout':
            return `> ${text}`;
        case 'code':
            return '```' + (obsah.language && obsah.language !== 'plain text' ? obsah.language : '') + '\n' + prostyText(obsah.rich_text) + '\n```';
        case 'divider':
            return '---';
        case 'paragraph':
            return text ? `${odsazeni}${text}` : '';
        default:
            return text ? `${odsazeni}${text}` : '';
    }
}

// ---------- Vlastnosti ----------

/** Hodnota vlastnosti stránky jako prostý text (podle typu). */
function cteniVlastnosti(v) {
    if (!v) {
        return '';
    }
    switch (v.type) {
        case 'title':
        case 'rich_text':
            return prostyText(v[v.type]);
        case 'select':
        case 'status':
            return v[v.type] ? v[v.type].name : '';
        case 'multi_select':
            return (v.multi_select || []).map((o) => o.name).join(', ');
        case 'date':
            return v.date ? v.date.start : '';
        case 'number':
            return v.number === null || v.number === undefined ? '' : String(v.number);
        default:
            return '';
    }
}

/** Hodnota pro zápis podle typu vlastnosti ve schématu databáze; undefined = typ neumíme. */
function zapisVlastnosti(typ, hodnota) {
    const s = hodnota === undefined || hodnota === null ? '' : String(hodnota).trim();
    switch (typ) {
        case 'title':
            return { title: rt(s) };
        case 'rich_text':
            return { rich_text: rt(s) };
        case 'select':
            // Čárka v názvu volby není povolená
            return { select: s ? { name: s.replace(/\s*,\s*/g, ' / ') } : null };
        case 'status':
            return s ? { status: { name: s.replace(/\s*,\s*/g, ' / ') } } : undefined;
        case 'multi_select':
            return { multi_select: s.split(',').map((x) => x.trim()).filter(Boolean).map((name) => ({ name })) };
        case 'date':
            return { date: s ? { start: s } : null };
        case 'number':
            return { number: s === '' || isNaN(Number(s)) ? null : Number(s) };
        default:
            return undefined;
    }
}

/** Název stavu z Notionu → klíč doplňku („nápad (ladí se)“ → „nápad, ladí se“). */
function stavZNotionu(nazev) {
    for (const [nas, jejich] of Object.entries(STAV_DO_NOTIONU)) {
        if (nazev.trim().toLowerCase() === jejich) {
            return nas;
        }
    }
    return nazev;
}

// ---------- Klient ----------

class ChybaNotionu extends Error {
    constructor(zprava, status, kod) {
        super(zprava);
        this.status = status;
        this.kod = kod;
    }
}

class NotionKlient {
    /** @param {string} token  Internal integration token  @param {string} databaze  ID databáze */
    constructor(token, databaze) {
        this.token = token;
        this.databaze = databaze;
        this.posledniPozadavek = 0;
        this.zdroj = undefined; // { id, schema, url, titulek }
    }

    async volej(metoda, cesta, telo, pokus = 0) {
        // Rozestupy mezi požadavky (limit 3 req/s)
        const cekat = this.posledniPozadavek + MEZERA_MS - Date.now();
        if (cekat > 0) {
            await new Promise((r) => setTimeout(r, cekat));
        }
        this.posledniPozadavek = Date.now();
        let odpoved;
        try {
            odpoved = await fetch(API + cesta, {
                method: metoda,
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    'Notion-Version': VERZE_API,
                    'Content-Type': 'application/json',
                },
                body: telo ? JSON.stringify(telo) : undefined,
            });
        } catch (e) {
            throw new ChybaNotionu(`Notion není dostupný (${e && e.message ? e.message : e}).`, 0, 'sit');
        }
        if (odpoved.status === 429 && pokus < 3) {
            const za = Number(odpoved.headers.get('retry-after')) || 1;
            await new Promise((r) => setTimeout(r, za * 1000));
            return this.volej(metoda, cesta, telo, pokus + 1);
        }
        const data = await odpoved.json().catch(() => ({}));
        if (!odpoved.ok) {
            throw new ChybaNotionu(srozumitelnaChyba(odpoved.status, data), odpoved.status, data.code);
        }
        return data;
    }

    /** Data source databáze a jeho schéma (načte se jednou, pak z mezipaměti). */
    async zdrojDat() {
        if (this.zdroj) {
            return this.zdroj;
        }
        let db;
        try {
            db = await this.volej('GET', `/databases/${this.databaze}`);
        } catch (e) {
            // Zadané ID je stránka – použije se první databáze uvnitř ní
            if (!(e instanceof ChybaNotionu) || e.status !== 400 || !/is a page/i.test(e.message)) {
                throw e;
            }
            const deti = await this.volej('GET', `/blocks/${this.databaze}/children?page_size=100`);
            const vnorena = (deti.results || []).find((b) => b.type === 'child_database');
            if (!vnorena) {
                throw new ChybaNotionu('Zadané ID je stránka bez databáze – v nastavení taskBoard.databaze uveďte odkaz na databázi úkolů.', 400, 'neni_databaze');
            }
            db = await this.volej('GET', `/databases/${vnorena.id}`);
        }
        const prvni = (db.data_sources || [])[0];
        if (!prvni) {
            throw new ChybaNotionu('Databáze v Notionu nemá žádný zdroj dat.', 0, 'bez_zdroje');
        }
        const ds = await this.volej('GET', `/data_sources/${prvni.id}`);
        const schema = {}; // název vlastnosti → typ
        let titulek;
        for (const [nazev, v] of Object.entries(ds.properties || {})) {
            schema[nazev] = v.type;
            if (v.type === 'title') {
                titulek = nazev;
            }
        }
        this.zdroj = { id: prvni.id, schema, titulek, url: db.url };
        return this.zdroj;
    }

    /** Všechny úkoly (stránky databáze) v pořadí podle vlastnosti Pořadí, záložně podle vytvoření. */
    async nactiUkoly() {
        const zdroj = await this.zdrojDat();
        const razeni = [];
        if (zdroj.schema[VLASTNOSTI.poradi] === 'number') {
            razeni.push({ property: VLASTNOSTI.poradi, direction: 'ascending' });
        }
        razeni.push({ timestamp: 'created_time', direction: 'ascending' });

        const stranky = [];
        let kurzor;
        do {
            const data = await this.volej('POST', `/data_sources/${zdroj.id}/query`, {
                sorts: razeni,
                page_size: 100,
                ...(kurzor ? { start_cursor: kurzor } : {}),
            });
            stranky.push(...(data.results || []));
            kurzor = data.has_more ? data.next_cursor : undefined;
        } while (kurzor);

        return stranky.map((p, i) => {
            const v = p.properties || {};
            const stav = stavZNotionu(cteniVlastnosti(v[VLASTNOSTI.stav]));
            const datum = cteniVlastnosti(v[VLASTNOSTI.datum]);
            const poradi = Number(cteniVlastnosti(v[VLASTNOSTI.poradi]));
            return {
                id: p.id,
                url: p.url,
                poradi: i + 1,
                cislo: Number.isFinite(poradi) && poradi > 0 ? poradi : undefined,
                plan: cteniVlastnosti(zdroj.titulek ? v[zdroj.titulek] : undefined) || '(bez názvu)',
                aplikace: cteniVlastnosti(v[VLASTNOSTI.aplikace]),
                stav,
                stavKlic: normalizujStav(stav),
                // Typ date se ukáže česky, textový sloupec Datum zůstane jak je
                datum: datumCesky(datum) || datum,
                dal: cteniVlastnosti(v[VLASTNOSTI.dal]),
            };
        });
    }

    /** Vlastnosti pro zápis – jen ty, které ve schématu existují a jejichž typ umíme. */
    async vlastnosti(hodnoty) {
        const zdroj = await this.zdrojDat();
        const ven = {};
        for (const [klic, hodnota] of Object.entries(hodnoty)) {
            const nazev = klic === 'plan' ? zdroj.titulek : VLASTNOSTI[klic];
            if (!nazev || !zdroj.schema[nazev] || hodnota === undefined) {
                continue;
            }
            let h = hodnota;
            if (klic === 'stav') {
                h = STAV_DO_NOTIONU[hodnota] || hodnota;
            }
            if (klic === 'datum') {
                if (zdroj.schema[nazev] !== 'date') {
                    h = datumCesky(hodnota) || hodnota;
                } else if (!/^\d{4}-\d{2}-\d{2}/.test(hodnota)) {
                    continue; // nerozpoznané datum do vlastnosti typu date nepatří
                }
            }
            const z = zapisVlastnosti(zdroj.schema[nazev], h);
            if (z) {
                ven[nazev] = z;
            }
        }
        return ven;
    }

    /**
     * Nový úkol. ukol = { plan, aplikace, stav, datum (ISO), dal, cislo }, radky = text popisu (Markdown).
     * Vrací vytvořenou stránku.
     */
    async vytvorUkol(ukol, radky = []) {
        const zdroj = await this.zdrojDat();
        const bloky = blokyZMarkdownu(radky);
        const stranka = await this.volej('POST', '/pages', {
            parent: { type: 'data_source_id', data_source_id: zdroj.id },
            properties: await this.vlastnosti(ukol),
            children: bloky.slice(0, MAX_BLOKU),
        });
        // Delší popis se dopíše po stovkách bloků
        for (let i = MAX_BLOKU; i < bloky.length; i += MAX_BLOKU) {
            await this.volej('PATCH', `/blocks/${stranka.id}/children`, { children: bloky.slice(i, i + MAX_BLOKU) });
        }
        return stranka;
    }

    async zmenStav(id, stav) {
        await this.volej('PATCH', `/pages/${id}`, { properties: await this.vlastnosti({ stav }) });
    }

    /** Přesune stránku do koše Notionu (jde obnovit). */
    async smazUkol(id) {
        await this.volej('PATCH', `/pages/${id}`, { in_trash: true });
    }

    /** Obsah stránky jako Markdown (vnořené bloky do hloubky 3). */
    async obsahStranky(id, hloubka = 0) {
        const radky = [];
        let kurzor;
        do {
            const data = await this.volej('GET', `/blocks/${id}/children?page_size=100${kurzor ? `&start_cursor=${kurzor}` : ''}`);
            for (const b of data.results || []) {
                radky.push(blokDoMarkdownu(b, hloubka));
                if (b.has_children && hloubka < 2 && b.type !== 'child_page' && b.type !== 'child_database') {
                    radky.push(await this.obsahStranky(b.id, hloubka + 1));
                }
            }
            kurzor = data.has_more ? data.next_cursor : undefined;
        } while (kurzor);
        return radky.filter((r, i) => r || (i > 0 && radky[i - 1])).join('\n');
    }
}

function srozumitelnaChyba(status, data) {
    const detail = data && data.message ? ` (${data.message})` : '';
    if (status === 401) {
        return 'Neplatný token integrace Notionu – nastavte ho znovu příkazem „Nastavit token Notionu“.';
    }
    if (status === 404 || (data && data.code === 'object_not_found')) {
        return 'Databáze v Notionu nenalezena – zkontrolujte ID databáze a že je databáze sdílená s integrací (⋯ → Connections).';
    }
    if (status === 403) {
        return `Integrace nemá oprávnění${detail}.`;
    }
    return `Chyba Notionu ${status}${detail}.`;
}

module.exports = { NotionKlient, ChybaNotionu, idZOdkazu, datumIso, dnesIso, odstranMarkdown };
