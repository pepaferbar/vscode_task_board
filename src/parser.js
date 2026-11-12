// Parser souboru prehled-planu.md – čistě textový, nezávisí na API VS Code.
// Musí být tolerantní: chybějící sloupec, sekce nebo neznámý stav nesmí nic shodit.
'use strict';

const ZNAME_STAVY = ['rozpracováno', 'zadání', 'nápad, ladí se', 'nápad', 'odloženo', 'hotovo'];

/** ASCII id stavů pro podmínky `when` v menu (bez diakritiky a čárek). */
const ID_STAVU = {
    'nápad': 'napad',
    'nápad, ladí se': 'napadLadi',
    'zadání': 'zadani',
    'rozpracováno': 'rozpracovano',
    'odloženo': 'odlozeno',
    'hotovo': 'hotovo',
};

/*
 * Výsledek: pole úkolů v pořadí řádků tabulky „Stav v kostce“ (= pořadí přidání)
 * Ukol { poradi, plan, aplikace, stav, stavKlic, datum, dal, radek, kotva? }
 * radek = číslo řádku od 0 (nadpis sekce, jinak řádek tabulky)
 * kotva = id nadpisu sekce v náhledu Markdownu
 * Pro zápis: radekTabulky, cisloSekce, sekceOd–sekceDo (rozsah řádků sekce, konec bez), radekStavu (řádek **Stav:**)
 */

/** Odstraní z textu jednoduchý markdown (`kód`, **tučné**, *kurzíva*, odkazy). */
function odstranMarkdown(s) {
    return String(s || '')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=$|[\s.,;:!?)])/g, '$1$2')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Převede libovolný zápis stavu na známý klíč, jinak „neznámý“. */
function normalizujStav(s) {
    const t = odstranMarkdown(s).normalize('NFC').toLowerCase().replace(/[.\s]+$/, '').trim();
    if (!t) {
        return 'neznámý';
    }
    // Nejdelší klíče první, aby „nápad, ladí se“ nepropadlo jako „nápad“
    const kandidati = [...ZNAME_STAVY].sort((a, b) => b.length - a.length);
    return kandidati.find((k) => t === k || t.startsWith(k)) || 'neznámý';
}

/**
 * Kotva nadpisu stejně jako ve vestavěném náhledu Markdownu VS Code:
 * malá písmena, pryč interpunkce a symboly, každá mezera → „-“.
 */
function kotvaNadpisu(text) {
    return text
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, '')
        .replace(/\s/g, '-');
}

/** Rozdělí řádek tabulky na buňky. */
function bunky(radek) {
    let t = radek.trim();
    if (t.startsWith('|')) {
        t = t.slice(1);
    }
    if (t.endsWith('|')) {
        t = t.slice(0, -1);
    }
    return t.split('|').map((b) => b.trim());
}

/** Normalizace názvu pro záložní párování sekce a řádku tabulky. */
function klicNazvu(s) {
    return odstranMarkdown(s).normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function nazvySeShoduji(a, b) {
    const ka = klicNazvu(a);
    const kb = klicNazvu(b);
    if (!ka || !kb) {
        return false;
    }
    if (ka.startsWith(kb) || kb.startsWith(ka)) {
        return true;
    }
    const sa = ka.split(' ').slice(0, 2).join(' ');
    return sa.length > 3 && sa === kb.split(' ').slice(0, 2).join(' ');
}

/** Rozparsuje celý soubor a vrátí pole úkolů. */
function parsujPrehled(text) {
    const radky = String(text || '').split(/\r?\n/);
    const ukoly = [];
    const sekce = []; // { cislo, nazev, radek, kotva, stav }
    const pouziteKotvy = new Map(); // duplicitní nadpisy dostanou příponu -1, -2…

    let vKostce = false;
    let hlavicka = false;
    let vKodu = false;
    let aktualni;
    let otevrena; // sekce, jejíž rozsah ještě neskončil (končí dalším nadpisem # nebo ##)

    for (let i = 0; i < radky.length; i++) {
        const r = radky[i];

        if (/^\s*(```|~~~)/.test(r)) {
            vKodu = !vKodu;
            continue;
        }
        if (vKodu) {
            continue;
        }

        // Libovolný nadpis – kvůli kotvám je nutné projít všechny úrovně
        const nadpis = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(r);
        if (nadpis) {
            const surovy = odstranMarkdown(nadpis[2]);
            let kotva = kotvaNadpisu(surovy);
            const pocet = pouziteKotvy.get(kotva);
            if (pocet === undefined) {
                pouziteKotvy.set(kotva, 0);
            } else {
                pouziteKotvy.set(kotva, pocet + 1);
                kotva = `${kotva}-${pocet + 1}`;
            }

            if (nadpis[1].length <= 2 && otevrena) {
                otevrena.konec = i;
                otevrena = undefined;
            }
            aktualni = undefined;
            vKostce = false;
            if (nadpis[1] === '##') {
                if (/stav v kostce/i.test(surovy)) {
                    vKostce = true;
                    hlavicka = false;
                } else {
                    const c = /^(\d+)\s*[.)]\s*(.+)$/.exec(surovy);
                    if (c) {
                        aktualni = {
                            cislo: parseInt(c[1], 10),
                            nazev: c[2].replace(/\s*\([^()]*\)\s*$/, '').trim() || c[2],
                            radek: i,
                            kotva,
                            stav: undefined,
                            radekStavu: undefined,
                            konec: undefined,
                        };
                        sekce.push(aktualni);
                        otevrena = aktualni;
                    }
                }
            }
            continue;
        }

        if (vKostce) {
            const t = r.trim();
            if (!t.startsWith('|')) {
                continue;
            }
            if (/^\|?[\s:|-]+\|?$/.test(t) && t.includes('-')) {
                continue; // oddělovač |---|
            }
            if (!hlavicka) {
                hlavicka = true; // první řádek tabulky = hlavička
                continue;
            }
            const [plan = '', aplikace = '', stav = '', datum = '', dal = ''] = bunky(t);
            if (!plan && !aplikace && !stav) {
                continue;
            }
            ukoly.push({
                poradi: ukoly.length + 1,
                plan: odstranMarkdown(plan) || '(bez názvu)',
                aplikace: odstranMarkdown(aplikace),
                stav: odstranMarkdown(stav),
                stavKlic: normalizujStav(stav),
                datum: odstranMarkdown(datum),
                dal: odstranMarkdown(dal),
                radek: i,
                radekTabulky: i,
                kotva: undefined,
                sekce: undefined,
            });
            continue;
        }

        // Řádek „**Stav:** …“ v sekci – záloha, když v tabulce stav chybí
        if (aktualni && !aktualni.stav) {
            const m = /^\s*\*\*Stav:?\*\*:?\s*(.*)$/.exec(r);
            if (m) {
                aktualni.stav = m[1].trim();
                aktualni.radekStavu = i;
            }
        }
    }
    if (otevrena) {
        otevrena.konec = radky.length;
    }

    // Bez tabulky aspoň úkoly ze sekcí
    if (ukoly.length === 0) {
        return sekce.map((s, idx) => ({
            poradi: idx + 1,
            plan: s.nazev,
            aplikace: '',
            stav: odstranMarkdown(s.stav),
            stavKlic: normalizujStav(s.stav),
            datum: '',
            dal: '',
            radek: s.radek,
            kotva: s.kotva,
        }));
    }

    // Přiřazení sekcí: nejdřív podle čísla N, záložně podle shody názvu
    const neprirazene = [];
    for (const s of sekce) {
        const u = ukoly[s.cislo - 1];
        if (u && !u.sekce) {
            u.sekce = s;
        } else {
            neprirazene.push(s);
        }
    }
    for (const s of neprirazene) {
        const u = ukoly.find((x) => !x.sekce && nazvySeShoduji(x.plan, s.nazev));
        if (u) {
            u.sekce = s;
        }
    }
    for (const u of ukoly) {
        if (u.sekce) {
            u.radek = u.sekce.radek;
            u.kotva = u.sekce.kotva;
            u.cisloSekce = u.sekce.cislo;
            u.sekceOd = u.sekce.radek;
            u.sekceDo = u.sekce.konec;
            u.radekStavu = u.sekce.radekStavu;
            if (!u.stav && u.sekce.stav) {
                u.stav = odstranMarkdown(u.sekce.stav);
                u.stavKlic = normalizujStav(u.sekce.stav);
            }
        }
        delete u.sekce;
    }
    return ukoly;
}

module.exports = { ZNAME_STAVY, ID_STAVU, odstranMarkdown, normalizujStav, parsujPrehled, kotvaNadpisu, bunky };
