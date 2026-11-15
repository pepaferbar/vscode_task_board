// Úpravy souboru prehled-planu.md nad polem řádků (bez API VS Code).
// Vstup je úkol z parseru (radekTabulky, cisloSekce, sekceOd, sekceDo, radekStavu).
'use strict';
const { ZNAME_STAVY, bunky } = require('./parser');

const POCET_SLOUPCU = 5; // Plán | Aplikace | Stav | Datum | Dál
const SLOUPEC = { plan: 0, aplikace: 1, stav: 2, datum: 3, dal: 4 };

/** Hodnota do buňky tabulky: bez svislítek a zalomení. */
function cistaHodnota(s) {
    return String(s || '').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
}

/** Přepíše jednu buňku řádku tabulky (chybějící sloupce doplní prázdné). */
function nastavBunku(radky, index, sloupec, hodnota) {
    const c = bunky(radky[index]);
    while (c.length < POCET_SLOUPCU) {
        c.push('');
    }
    c[sloupec] = cistaHodnota(hodnota);
    radky[index] = '| ' + c.join(' | ') + ' |';
}

/**
 * Změní stav: buňku Stav v tabulce a začátek řádku „**Stav:** …“ v sekci.
 * Poznámka za stavem zůstane („odloženo, čeká na…“ → „hotovo, čeká na…“).
 */
function zmenStav(radky, ukol, novy) {
    nastavBunku(radky, ukol.radekTabulky, SLOUPEC.stav, novy);
    if (ukol.radekStavu === undefined) {
        return;
    }
    const m = /^(\s*\*\*Stav:?\*\*:?\s*)(.*)$/.exec(radky[ukol.radekStavu]);
    if (!m) {
        return;
    }
    const zbytek = m[2];
    const nizky = zbytek.normalize('NFC').toLowerCase();
    const puvodni = [...ZNAME_STAVY].sort((a, b) => b.length - a.length).find((k) => nizky.startsWith(k));
    let za = puvodni ? zbytek.slice(puvodni.length) : '';
    if (!za.trim()) {
        za = '.';
    }
    radky[ukol.radekStavu] = m[1] + novy + za;
}

/**
 * Smaže úkol: řádek tabulky i celou sekci „## N. …“ a přečísluje následující sekce.
 * Vrací nové pole řádků.
 */
function smazUkol(radky, ukol) {
    const ven = new Set([ukol.radekTabulky]);
    if (ukol.sekceOd !== undefined && ukol.sekceDo !== undefined) {
        for (let i = ukol.sekceOd; i < ukol.sekceDo; i++) {
            ven.add(i);
        }
    }
    // Přečíslování sekcí s vyšším číslem (N = pořadí řádku v tabulce)
    let vKodu = false;
    const vysledek = [];
    for (let i = 0; i < radky.length; i++) {
        let r = radky[i];
        if (/^\s*(```|~~~)/.test(r)) {
            vKodu = !vKodu;
        }
        if (ven.has(i)) {
            continue;
        }
        if (!vKodu && ukol.cisloSekce !== undefined) {
            r = r.replace(/^(##\s+)(\d+)(\s*[.)])/, (cele, a, cislo, b) => {
                const n = parseInt(cislo, 10);
                return n > ukol.cisloSekce ? `${a}${n - 1}${b}` : cele;
            });
        }
        vysledek.push(r);
    }
    // Na konci souboru nenechat víc prázdných řádků za sebou
    while (vysledek.length > 1 && !vysledek[vysledek.length - 1].trim() && !vysledek[vysledek.length - 2].trim()) {
        vysledek.pop();
    }
    return vysledek;
}

/**
 * Přidá nový úkol: řádek na konec tabulky „Stav v kostce“ a sekci „## N. Název“ na konec souboru
 * (N = pořadí nového řádku v tabulce). Vrací nové pole řádků, bez tabulky undefined.
 * @param {{plan: string, aplikace?: string, stav: string, datum: string, dal?: string, popis?: string[]}} novy
 */
function pridejUkol(radky, novy) {
    // Najít tabulku pod nadpisem „## … Stav v kostce …“ (mimo bloky kódu)
    let vKodu = false;
    let zacatek = -1;
    for (let i = 0; i < radky.length; i++) {
        if (/^\s*(```|~~~)/.test(radky[i])) {
            vKodu = !vKodu;
            continue;
        }
        if (!vKodu && /^##\s+.*stav v kostce/i.test(radky[i])) {
            zacatek = i;
            break;
        }
    }
    if (zacatek < 0) {
        return undefined;
    }
    let posledni = -1; // poslední řádek tabulky
    let pocetRadku = 0; // datové řádky (bez hlavičky a oddělovače)
    let hlavicka = false;
    for (let i = zacatek + 1; i < radky.length; i++) {
        const t = radky[i].trim();
        if (/^#{1,6}\s/.test(t)) {
            break;
        }
        if (!t.startsWith('|')) {
            if (posledni >= 0) {
                break; // tabulka skončila
            }
            continue;
        }
        posledni = i;
        if (/^\|?[\s:|-]+\|?$/.test(t) && t.includes('-')) {
            continue; // oddělovač |---|
        }
        if (!hlavicka) {
            hlavicka = true;
            continue;
        }
        pocetRadku++;
    }
    if (posledni < 0) {
        return undefined;
    }

    const radekTabulky = '| ' + [novy.plan, novy.aplikace, novy.stav, novy.datum, novy.dal].map(cistaHodnota).join(' | ') + ' |';
    const vysledek = [...radky.slice(0, posledni + 1), radekTabulky, ...radky.slice(posledni + 1)];

    // Sekce na konec souboru (bez hromadění prázdných řádků)
    while (vysledek.length > 0 && !vysledek[vysledek.length - 1].trim()) {
        vysledek.pop();
    }
    vysledek.push(
        '',
        `## ${pocetRadku + 1}. ${cistaHodnota(novy.plan)}`,
        `**Stav:** ${novy.stav}.`,
        ...(novy.popis || []).map((p) => `- ${p}`),
        '',
    );
    return vysledek;
}

/** Dnešní datum ve formátu souboru: „15. 11. 2026“. */
function dnesniDatum() {
    const d = new Date();
    return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
}

/** Text sekce úkolu pro schránku (jinak aspoň údaje z tabulky). */
function textUkolu(radky, ukol) {
    if (ukol.sekceOd !== undefined && ukol.sekceDo !== undefined) {
        return radky.slice(ukol.sekceOd, ukol.sekceDo).join('\n').trim();
    }
    return [
        `## ${ukol.plan}`,
        ukol.aplikace && `- Aplikace: ${ukol.aplikace}`,
        ukol.stav && `- Stav: ${ukol.stav}`,
        ukol.datum && `- Datum: ${ukol.datum}`,
        ukol.dal && `- Dál: ${ukol.dal}`,
    ]
        .filter(Boolean)
        .join('\n');
}

module.exports = { zmenStav, smazUkol, textUkolu, pridejUkol, dnesniDatum };
