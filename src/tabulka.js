// Tabulka plánů přímo v postranním panelu (webview view).
// Úzký panel: Plán / Stav / Datum, aplikace a „Dál“ menším písmem pod plánem.
// Široký panel (≥ 520 px): všech 5 sloupců vedle sebe.
// Klik na řádek = otevřít náhled, klik na značku stavu = změnit stav,
// tlačítko ⋯ nebo pravý klik = nabídka akcí (změnit stav, upravit Dál, kopírovat, smazat).
'use strict';
const vscode = require('vscode');

/** Značka a barva (CSS proměnná motivu VS Code) podle stavu. */
const ZNACKY_STAVU = {
    'zadání': ['○', '--vscode-charts-blue'],
    'nápad': ['💡', '--vscode-charts-yellow'],
    'nápad, ladí se': ['💡', '--vscode-charts-yellow'],
    'rozpracováno': ['▶', '--vscode-charts-orange'],
    'odloženo': ['⏸', '--vscode-disabledForeground'],
    'hotovo': ['✔', '--vscode-charts-green'],
    'neznámý': ['?', '--vscode-descriptionForeground'],
};

function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Krátké datum pro úzký panel: „4. 11. 2026 (upraveno 6. 11.)“ → „4. 11.“ */
function kratkeDatum(d) {
    const m = /(\d{1,2})\.\s*(\d{1,2})\./.exec(d || '');
    return m ? `${m[1]}. ${m[2]}.` : d || '';
}

function nonce() {
    let s = '';
    const znaky = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        s += znaky.charAt(Math.floor(Math.random() * znaky.length));
    }
    return s;
}

class TabulkaPlanu {
    /** @param {(typ: string, poradi: number) => void} priAkci  typ: otevrit | stav | menu */
    constructor(priAkci) {
        this.priAkci = priAkci;
        this.view = undefined;
        this.ukoly = [];
        this.zprava = undefined;
        this.badge = undefined;
    }

    /** Volá VS Code, když se panel poprvé zobrazí (nebo po znovuotevření). */
    resolveWebviewView(view) {
        this.view = view;
        view.webview.options = { enableScripts: true };
        view.webview.onDidReceiveMessage((m) => {
            if (m && ['otevrit', 'stav', 'menu'].includes(m.typ)) {
                this.priAkci(m.typ, Number(m.poradi));
            }
        });
        view.onDidDispose(() => {
            this.view = undefined;
        });
        view.badge = this.badge;
        this._vykresli();
    }

    /** Nová data ze souboru – překreslí tabulku, pokud je panel otevřený. */
    aktualizuj(ukoly, zprava) {
        this.ukoly = ukoly;
        this.zprava = zprava;
        if (this.view) {
            this._vykresli();
        }
    }

    /** Číslo na ikoně v activity baru (u webview panelu jen po jeho otevření). */
    nastavOdznak(badge) {
        this.badge = badge;
        if (this.view) {
            this.view.badge = badge;
        }
    }

    _vykresli() {
        const n = nonce();
        const radky = this.ukoly
            .map((u) => {
                const [znacka, barva] = ZNACKY_STAVU[u.stavKlic] || ZNACKY_STAVU['neznámý'];
                const pod = [u.aplikace, u.dal].filter(Boolean).map(esc).join(' · ');
                const tip = [u.plan, u.aplikace, u.stav, u.datum, u.dal].filter(Boolean).join('\n');
                // Kontext pro pravý klik (menu webview/context v package.json)
                const kontext = esc(JSON.stringify({ webviewSection: 'ukol', poradi: u.poradi, preventDefaultContextMenuItems: true }));
                return `<tr data-poradi="${u.poradi}" data-vscode-context="${kontext}" tabindex="0" title="${esc(tip)}">
  <td class="plan">${esc(u.plan)}${pod ? `<div class="pod uzky">${pod}</div>` : ''}</td>
  <td class="siroky">${esc(u.aplikace)}</td>
  <td class="stav"><span class="znacka" title="Změnit stav" style="color: var(${barva})">${znacka}</span><span class="siroky">${esc(u.stav)}</span></td>
  <td class="datum"><span class="uzky">${esc(kratkeDatum(u.datum))}</span><span class="siroky">${esc(u.datum)}</span></td>
  <td class="siroky">${esc(u.dal)}</td>
  <td class="akce"><button class="tlacitko" title="Akce">⋯</button></td>
</tr>`;
            })
            .join('\n');

        this.view.webview.html = `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${n}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); padding: 0 6px 8px; }
  .zprava { color: var(--vscode-descriptionForeground); padding: 8px 4px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid var(--vscode-editorWidget-border, rgba(128,128,128,.25)); vertical-align: top; }
  th { color: var(--vscode-descriptionForeground); font-weight: 600; font-size: .9em; position: sticky; top: 0; background: var(--vscode-sideBar-background); }
  tbody tr { cursor: pointer; }
  tbody tr:hover { background: var(--vscode-list-hoverBackground); }
  tbody tr:focus { outline: 1px solid var(--vscode-focusBorder); outline-offset: -1px; }
  .plan { font-weight: 600; }
  .pod { font-weight: normal; font-size: .9em; color: var(--vscode-descriptionForeground); margin-top: 2px; }
  .stav, .datum { white-space: nowrap; }
  .znacka { display: inline-block; width: 1.4em; text-align: center; cursor: pointer; border-radius: 3px; }
  .znacka:hover { background: var(--vscode-toolbar-hoverBackground); }
  td.akce, th.akce { width: 1.6em; padding-left: 0; padding-right: 0; text-align: center; }
  .tlacitko { visibility: hidden; background: none; border: none; color: var(--vscode-foreground); cursor: pointer; padding: 0 4px; border-radius: 3px; font-size: 1.1em; line-height: 1.2; }
  tr:hover .tlacitko, tr:focus-within .tlacitko { visibility: visible; }
  .tlacitko:hover { background: var(--vscode-toolbar-hoverBackground); }
  /* Úzký panel: jen Plán / Stav / Datum */
  .siroky { display: none; }
  @media (min-width: 520px) {
    .siroky { display: revert; }
    span.siroky { display: inline; }
    .uzky { display: none; }
  }
</style>
</head>
<body>
${this.zprava ? `<p class="zprava">${esc(this.zprava)}</p>` : ''}
${this.ukoly.length ? `<table>
<thead><tr><th>Plán</th><th class="siroky">Aplikace</th><th>Stav</th><th>Datum</th><th class="siroky">Dál</th><th class="akce"></th></tr></thead>
<tbody>
${radky}
</tbody>
</table>` : ''}
<script nonce="${n}">
  const vscode = acquireVsCodeApi();
  const posli = (typ, tr) => vscode.postMessage({ typ, poradi: tr.dataset.poradi });
  document.querySelectorAll('tbody tr').forEach((tr) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.znacka')) { posli('stav', tr); }
      else if (e.target.closest('.tlacitko')) { posli('menu', tr); }
      else { posli('otevrit', tr); }
    });
    tr.addEventListener('keydown', (e) => {
      if (e.target !== tr) { return; }
      if (e.key === 'Enter') { posli('otevrit', tr); }
    });
  });
</script>
</body>
</html>`;
    }
}

module.exports = { TabulkaPlanu };
