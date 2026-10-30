// Static content check: data tables the guides present as fact (atomic masses, formulas and names, ion counts,
// densities, balanced equations, roadmap worked examples), compared with lib/chem.js.
'use strict';
const { loadGuide } = require('./lib/load');
const C = require('./lib/chem');
const H = require('./lib/harness');
const fs = require('fs');

const out = [];
const note = (guide, what, detail) => out.push({ guide, what, detail });
const files = {
  mole: 'general-chemistry/mole-and-molar-mass-study-guide.html', stoich: 'general-chemistry/stoichiometry-study-guide.html',
  solstoich: 'general-chemistry/solution-stoichiometry-study-guide.html', solgas: 'general-chemistry/solutions-and-gases-study-guide.html'
};
const counts = {};
for (const [k, file] of Object.entries(files)) {
  const { G } = loadGuide(file, 1);
  counts[k] = { atomicMasses: 0, reactions: 0, names: 0, densities: 0 };
  // atomic masses
  for (const e in G.AM) {
    counts[k].atomicMasses++;
    const page = Number(G.AM[e]), mine = C.AW[e];
    if (mine === undefined) { note(k, 'atomic mass not in my table', e); continue; }
    if (Math.abs(page - mine) > 0.0015) note(k, 'atomic mass differs from IUPAC abridged value', { e, page: G.AM[e], iupac: mine });
  }
  // every reaction bank
  for (const bank of ['RX', 'DRX', 'CRX', 'SRX', 'TRX', 'GRX', 'QRX']) {
    for (const rxn of (G[bank] || [])) {
      counts[k].reactions++;
      const bad = C.balanceReport(rxn);
      if (bad.length) note(k, 'unbalanced equation', { bank, rxn: JSON.stringify(rxn.r) + '->' + JSON.stringify(rxn.p), bad });
      const mine = C.myCoefs(rxn);
      if (!mine) note(k, 'reaction not in my table', { bank, ctx: rxn.ctx });
      else rxn.r.concat(rxn.p).forEach(([c, f]) => { if (mine[f] !== c) note(k, 'coefficient differs', { bank, f, page: c, mine: mine[f] }); });
    }
  }
  // names
  const nameTables = [];
  if (G.SUBS) nameTables.push(...G.SUBS.map(s => [s.f, s.name]));
  if (G.NAMES) nameTables.push(...Object.entries(G.NAMES));
  if (G.SOLUTES) nameTables.push(...Object.entries(G.SOLUTES));
  if (G.GASES) nameTables.push(...Object.entries(G.GASES));
  for (const [f, name] of nameTables) {
    counts[k].names++;
    try { C.atoms(f); } catch (e) { note(k, 'formula does not parse', f); }
    const ok = (C.NAMES[f] || []).some(n => n === name.toLowerCase());
    if (!ok) note(k, 'name not in my list for this formula', { f, name, mine: C.NAMES[f] || null });
  }
  // ion counts (mole guide)
  if (G.IONS) for (const I of G.IONS) {
    const mine = C.IONCOUNT[I.f] && C.IONCOUNT[I.f][I.name];
    if (mine !== I.n) note(k, 'ion count differs', { f: I.f, ion: I.name, page: I.n, mine });
  }
  // densities (stoich guide)
  if (G.DENS) for (const f in G.DENS) {
    counts[k].densities++;
    const d = Number(G.DENS[f]);
    if (!(f in C.DENS)) note(k, 'density not in my table', f);
    else if (H.relDiff(d, C.DENS[f]) > 0.01) note(k, 'density differs >1% from CRC', { f, page: G.DENS[f], crc: C.DENS[f] });
  }
  // molar masses the page computes for every formula it uses: compare to unrounded IUPAC value
  const forms = new Set(nameTables.map(x => x[0]));
  for (const bank of ['RX', 'DRX', 'CRX', 'SRX', 'TRX', 'GRX', 'QRX']) for (const r of (G[bank] || [])) r.r.concat(r.p).forEach(e => forms.add(e[1]));
  for (const f of forms) {
    const page = G.molarMass(f), mine = C.mm(f), rel = Math.abs(page - mine) / mine;
    if (rel > 0.001) note(k, 'two-decimal molar mass is >0.1% from the unrounded value', { f, page: page.toFixed(2), unrounded: mine.toFixed(4), relPct: +(rel * 100).toFixed(3) });
  }
}
// Worked examples in the roadmaps (checked by hand-typed arithmetic here).
const ex = [
  ['mole', '36.0 g H2O ÷ 18.02 g/mol = 2.00 mol', 36.0 / C.mm('H2O'), 2.00],
  ['mole', '2.00 mol × 6.022e23 = 1.20e24 molecules', 2.00 * C.NA, 1.20e24],
  ['mole', '4.00 mol H × 1.008 = 4.03 g H', 4.00 * 1.008, 4.03],
  ['mole', '4.00 mol H × 6.022e23 = 2.41e24 atoms', 4.00 * C.NA, 2.41e24],
  ['mole', '58.44 g NaCl is one mole', C.mm('NaCl'), 58.44],
  ['stoich', '25.0 mL ethanol × 0.789 = 19.7 g', 25.0 * 0.789, 19.7],
  ['stoich', '6.00 mol H2 × 2/3 = 4.00 mol NH3', 6.00 * 2 / 3, 4.00],
  ['stoich', '4.00 mol NH3 × 17.03 = 68.1 g', 4.00 * C.mm('NH3'), 68.1],
  ['stoich', '50.0 g octane ÷ 0.703 = 71.1 mL', 50.0 / 0.703, 71.1],
  ['solstoich', '2.50 g Zn ÷ 65.38 = 0.0382 mol', 2.50 / 65.38, 0.0382],
  ['solstoich', '0.0250 L × 0.150 M = 0.00375 mol', 0.0250 * 0.150, 0.00375],
  ['solstoich', '0.00300 mol NaOH × 1/2 = 0.00150 mol H2SO4', 0.003 / 2, 0.0015],
  ['solstoich', '0.00150 mol ÷ 0.02500 L = 0.0600 M', 0.0015 / 0.025, 0.0600],
  ['solstoich', '0.00188 mol PbI2 × 461.00 = 0.867 g', 0.00188 * C.mm('PbI2'), 0.867],
  ['solgas', '(0.980 atm × 0.250 L)/(0.08206 × 298.15) = 0.0100 mol', 0.980 * 0.250 / (C.R * 298.15), 0.0100],
  ['solgas', '0.00375 mol HCl × 1/2 = 0.00188 mol H2', 0.00375 / 2, 0.00188],
  ['solgas', '(0.00188 × 0.08206 × 298.15)/1.00 = 0.0460 L', 0.00188 * C.R * 298.15, 0.0460]
];
for (const [g, what, v, shown] of ex) if (Math.abs(v - shown) / shown > 0.006) note(g, 'roadmap example arithmetic', { what, mine: v, shown });
fs.writeFileSync(__dirname + '/results/content.json', JSON.stringify({ counts, examplesChecked: ex.length, notes: out }, null, 1));
console.log(JSON.stringify(counts));
for (const n of out) console.log(n.guide, '|', n.what, '|', JSON.stringify(n.detail));
