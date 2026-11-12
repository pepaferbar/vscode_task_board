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

/** Dnešní datum ve formátu souboru: „11. 11. 2026“. */
function dnesniDatum() {
    const d = new Date();
    return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
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

/** Přepíše sloupec Dál a Datum nastaví na dnešek. */
function upravDal(radky, ukol, text) {
    nastavBunku(radky, ukol.radekTabulky, SLOUPEC.dal, text);
    nastavBunku(radky, ukol.radekTabulky, SLOUPEC.datum, dnesniDatum());
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

module.exports = { zmenStav, upravDal, smazUkol, textUkolu };
