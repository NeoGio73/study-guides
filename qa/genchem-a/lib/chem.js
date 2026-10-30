// Independent chemistry reference data typed for this audit (not copied from the guides).
'use strict';

// IUPAC abridged standard atomic weights (CIAAW, 2021 table; conventional values for interval elements).
const AW = {
  H: 1.008, He: 4.0026, C: 12.011, N: 14.007, O: 15.999, F: 18.998, Ne: 20.180, Na: 22.990, Mg: 24.305,
  Al: 26.982, Si: 28.085, P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.95, K: 39.098, Ca: 40.078, Ti: 47.867,
  Cr: 51.996, Fe: 55.845, Ni: 58.693, Cu: 63.546, Zn: 65.38, Br: 79.904, Ag: 107.87, Sn: 118.71,
  I: 126.90, Ba: 137.33, Au: 196.97, Hg: 200.59, Pb: 207.2
};
const ELNAME = {
  H: 'hydrogen', He: 'helium', C: 'carbon', N: 'nitrogen', O: 'oxygen', F: 'fluorine', Ne: 'neon', Na: 'sodium',
  Mg: 'magnesium', Al: 'aluminum', Si: 'silicon', P: 'phosphorus', S: 'sulfur', Cl: 'chlorine', Ar: 'argon',
  K: 'potassium', Ca: 'calcium', Ti: 'titanium', Cr: 'chromium', Fe: 'iron', Ni: 'nickel', Cu: 'copper',
  Zn: 'zinc', Br: 'bromine', Ag: 'silver', Sn: 'tin', I: 'iodine', Ba: 'barium', Au: 'gold', Hg: 'mercury', Pb: 'lead'
};
const NAME2SYM = Object.fromEntries(Object.entries(ELNAME).map(([s, n]) => [n, s]));

const NA = 6.02214076e23;          // exact (SI 2019)
const R = 0.082057366;             // L atm / (mol K), CODATA 2018
const ATM = { atm: 1, mmHg: 760, kPa: 101.325 };
const K0 = 273.15;

// Recursive-descent formula parser: handles nested parentheses.
function atoms(f) {
  let i = 0;
  function num() { let s = ''; while (i < f.length && /\d/.test(f[i])) s += f[i++]; return s ? parseInt(s, 10) : 1; }
  function group() {
    const out = {};
    while (i < f.length && f[i] !== ')') {
      if (f[i] === '(') {
        i++; const g = group(); if (f[i] !== ')') throw new Error('bad formula ' + f); i++;
        const k = num(); for (const e in g) out[e] = (out[e] || 0) + g[e] * k;
      } else if (/[A-Z]/.test(f[i])) {
        let e = f[i++]; if (i < f.length && /[a-z]/.test(f[i])) e += f[i++];
        const k = num(); out[e] = (out[e] || 0) + k;
      } else throw new Error('bad char in ' + f + ': ' + f[i]);
    }
    return out;
  }
  const r = group(); if (i !== f.length) throw new Error('trailing in ' + f); return r;
}
function mmWith(f, table) {
  const a = atoms(f); let s = 0;
  for (const e in a) { if (!(e in table)) throw new Error('no mass for ' + e); s += Number(table[e]) * a[e]; }
  return s;
}
function mm(f) {
  const a = atoms(f); let s = 0;
  for (const e in a) { if (!(e in AW)) throw new Error('no AW for ' + e); s += AW[e] * a[e]; }
  return s;
}

// Balanced equations typed independently. Key = sorted formula list; value = {formula: coefficient}.
const EQS = [
  'N2 + 3 H2 -> 2 NH3', '2 H2 + O2 -> 2 H2O', 'C3H8 + 5 O2 -> 3 CO2 + 4 H2O', '4 Fe + 3 O2 -> 2 Fe2O3',
  '2 Al + 3 Cl2 -> 2 AlCl3', '4 NH3 + 5 O2 -> 4 NO + 6 H2O', '2 KClO3 -> 2 KCl + 3 O2', '2 C2H6 + 7 O2 -> 4 CO2 + 6 H2O',
  'Fe2O3 + 3 CO -> 2 Fe + 3 CO2', 'P4 + 5 O2 -> P4O10', 'C6H12O6 + 6 O2 -> 6 CO2 + 6 H2O', '3 Mg + N2 -> Mg3N2',
  'SiO2 + 3 C -> SiC + 2 CO', 'TiCl4 + 2 Mg -> Ti + 2 MgCl2', '2 Al + Fe2O3 -> Al2O3 + 2 Fe', '2 Na + Cl2 -> 2 NaCl',
  'C2H5OH + 3 O2 -> 2 CO2 + 3 H2O', '2 C8H18 + 25 O2 -> 16 CO2 + 18 H2O', '2 CH3OH + 3 O2 -> 2 CO2 + 4 H2O',
  'C6H12O6 -> 2 C2H5OH + 2 CO2', '2 C6H6 + 15 O2 -> 12 CO2 + 6 H2O', '2 Al + 3 Br2 -> 2 AlBr3', '2 HgO -> 2 Hg + O2',
  '2 Na + 2 H2O -> 2 NaOH + H2', '2 C3H7OH + 9 O2 -> 6 CO2 + 8 H2O', 'P4 + 6 Cl2 -> 4 PCl3', 'CS2 + 3 O2 -> CO2 + 2 SO2',
  'C7H6O3 + C4H6O3 -> C9H8O4 + CH3COOH', 'CH3COOH + C2H5OH -> CH3COOC2H5 + H2O', 'PCl3 + 3 H2O -> H3PO3 + 3 HCl',
  'SiCl4 + 2 H2O -> SiO2 + 4 HCl',
  // solutions
  'Pb(NO3)2 + 2 KI -> PbI2 + 2 KNO3', 'AgNO3 + NaCl -> AgCl + NaNO3', '2 AgNO3 + CaCl2 -> 2 AgCl + Ca(NO3)2',
  'BaCl2 + Na2SO4 -> BaSO4 + 2 NaCl', '3 CaCl2 + 2 Na3PO4 -> Ca3(PO4)2 + 6 NaCl', '2 AgNO3 + K2CrO4 -> Ag2CrO4 + 2 KNO3',
  'Na2CO3 + CaCl2 -> CaCO3 + 2 NaCl', 'FeCl3 + 3 NaOH -> Fe(OH)3 + 3 NaCl', 'CuSO4 + 2 NaOH -> Cu(OH)2 + Na2SO4',
  'Pb(NO3)2 + Na2SO4 -> PbSO4 + 2 NaNO3', 'Zn + 2 HCl -> ZnCl2 + H2', 'Mg + 2 HCl -> MgCl2 + H2',
  'CaCO3 + 2 HCl -> CaCl2 + H2O + CO2', '2 Al + 6 HCl -> 2 AlCl3 + 3 H2', 'Mg(OH)2 + 2 HCl -> MgCl2 + 2 H2O',
  'NaHCO3 + HCl -> NaCl + H2O + CO2', 'HCl + NaOH -> NaCl + H2O', 'HNO3 + KOH -> KNO3 + H2O', 'HNO3 + NaOH -> NaNO3 + H2O',
  'H2SO4 + 2 NaOH -> Na2SO4 + 2 H2O', 'H2SO4 + 2 KOH -> K2SO4 + 2 H2O', '2 HCl + Ba(OH)2 -> BaCl2 + 2 H2O',
  '2 HNO3 + Ba(OH)2 -> Ba(NO3)2 + 2 H2O', 'CH3COOH + NaOH -> NaCH3COO + H2O', 'H2C2O4 + 2 NaOH -> Na2C2O4 + 2 H2O',
  'H3C6H5O7 + 3 NaOH -> Na3C6H5O7 + 3 H2O', 'KHC8H4O4 + NaOH -> KNaC8H4O4 + H2O',
  // gases
  '2 NaN3 -> 2 Na + 3 N2', 'CH4 + 2 O2 -> CO2 + 2 H2O', '2 Mg + O2 -> 2 MgO', '2 NaHCO3 -> Na2CO3 + H2O + CO2',
  '2 SO2 + O2 -> 2 SO3', 'Na2CO3 + 2 HCl -> 2 NaCl + H2O + CO2', 'Mg + H2SO4 -> MgSO4 + H2', 'Fe + H2SO4 -> FeSO4 + H2',
  '2 H2O2 -> 2 H2O + O2', 'Na2S + 2 HCl -> 2 NaCl + H2S', 'NH4Cl + NaOH -> NaCl + H2O + NH3', 'CO2 + 2 NaOH -> Na2CO3 + H2O',
  'Cl2 + 2 NaOH -> NaCl + NaClO + H2O', 'SO2 + 2 NaOH -> Na2SO3 + H2O', 'NH3 + HCl -> NH4Cl'
];
function parseEq(s) {
  const [l, r] = s.split('->');
  const side = t => t.split('+').map(x => x.trim()).map(x => { const m = x.match(/^(\d+)\s+(.+)$/); return m ? [+m[1], m[2]] : [1, x]; });
  return { r: side(l), p: side(r) };
}
const EQMAP = new Map();
for (const s of EQS) {
  const e = parseEq(s);
  const key = e.r.map(x => x[1]).sort().join('|') + '>' + e.p.map(x => x[1]).sort().join('|');
  const coef = {}; e.r.concat(e.p).forEach(([c, f]) => { coef[f] = c; });
  EQMAP.set(key, coef);
}
// rxn = {r:[[c,f,...]], p:[[c,f,...]]} as stored in a guide. Returns my coefficients or null.
function myCoefs(rxn) {
  const key = rxn.r.map(x => x[1]).sort().join('|') + '>' + rxn.p.map(x => x[1]).sort().join('|');
  return EQMAP.get(key) || null;
}
function balanceReport(rxn) {
  const tot = side => { const o = {}; side.forEach(([c, f]) => { const a = atoms(f); for (const e in a) o[e] = (o[e] || 0) + c * a[e]; }); return o; };
  const L = tot(rxn.r), Rr = tot(rxn.p), bad = [];
  new Set(Object.keys(L).concat(Object.keys(Rr))).forEach(e => { if ((L[e] || 0) !== (Rr[e] || 0)) bad.push(e + ':' + (L[e] || 0) + '≠' + (Rr[e] || 0)); });
  return bad;
}

// Names typed independently (formula -> list of acceptable names, lower case).
const NAMES = {
  Cu: ['copper'], Fe: ['iron'], Al: ['aluminum', 'aluminium'], Ag: ['silver'], Au: ['gold'], Zn: ['zinc'], Mg: ['magnesium'],
  C: ['carbon'], S: ['sulfur'], Ca: ['calcium'], Na: ['sodium'], Pb: ['lead'], Ni: ['nickel'], Si: ['silicon'], Sn: ['tin'],
  Hg: ['mercury'], Ti: ['titanium'],
  H2O: ['water'], CO2: ['carbon dioxide'], NH3: ['ammonia'], CH4: ['methane'], C3H8: ['propane'], C4H10: ['butane'],
  C8H18: ['octane'], C2H6O: ['ethanol'], C2H5OH: ['ethanol'], C6H12O6: ['glucose'], C12H22O11: ['sucrose'],
  O2: ['oxygen gas', 'oxygen'], N2: ['nitrogen gas', 'nitrogen'], Cl2: ['chlorine gas', 'chlorine'], H2: ['hydrogen'],
  SO2: ['sulfur dioxide'], H2O2: ['hydrogen peroxide'], CCl4: ['carbon tetrachloride'], SF6: ['sulfur hexafluoride'],
  P4O10: ['tetraphosphorus decoxide', 'tetraphosphorus decaoxide'], CH3COOH: ['acetic acid'], C9H8O4: ['aspirin', 'acetylsalicylic acid'],
  C8H10N4O2: ['caffeine'], NaCl: ['sodium chloride'], NaF: ['sodium fluoride'], CaCO3: ['calcium carbonate'],
  MgCl2: ['magnesium chloride'], CaCl2: ['calcium chloride'], Al2O3: ['aluminum oxide'], Fe2O3: ['iron(iii) oxide'],
  Na2CO3: ['sodium carbonate'], NaHCO3: ['sodium hydrogen carbonate', 'sodium bicarbonate'], KNO3: ['potassium nitrate'],
  Na2SO4: ['sodium sulfate'], K3PO4: ['potassium phosphate'], CuSO4: ['copper(ii) sulfate'], AgNO3: ['silver nitrate'],
  BaCl2: ['barium chloride'], K2Cr2O7: ['potassium dichromate'], NH4NO3: ['ammonium nitrate'], 'Mg(OH)2': ['magnesium hydroxide'],
  'Ca(OH)2': ['calcium hydroxide'], 'Al(OH)3': ['aluminum hydroxide'], 'Ca(NO3)2': ['calcium nitrate'], 'Fe(NO3)3': ['iron(iii) nitrate'],
  'Ca3(PO4)2': ['calcium phosphate'], 'Al2(SO4)3': ['aluminum sulfate'], '(NH4)2SO4': ['ammonium sulfate'], '(NH4)3PO4': ['ammonium phosphate'],
  CH3OH: ['methanol'], C6H6: ['benzene'], Br2: ['bromine'], TiCl4: ['titanium(iv) chloride', 'titanium tetrachloride'],
  C3H7OH: ['isopropyl alcohol', '2-propanol', 'propan-2-ol'], PCl3: ['phosphorus trichloride'], CS2: ['carbon disulfide'],
  SiCl4: ['silicon tetrachloride'], C4H6O3: ['acetic anhydride'], C7H6O3: ['salicylic acid'], CH3COOC2H5: ['ethyl acetate'],
  AlBr3: ['aluminum bromide'], H3PO3: ['phosphorous acid'], SiO2: ['silicon dioxide'], NaOH: ['sodium hydroxide'],
  KCl: ['potassium chloride'], KBr: ['potassium bromide'], KOH: ['potassium hydroxide'], NH4Cl: ['ammonium chloride'],
  KI: ['potassium iodide'], He: ['helium'], Ne: ['neon'], Ar: ['argon']
};

// Densities (g/mL, 20-25 C), CRC Handbook values, used to check what the guides state.
const DENS = { C2H5OH: 0.789, C8H18: 0.703, CH3OH: 0.791, C6H6: 0.877, Br2: 3.12, Hg: 13.53, TiCl4: 1.73, H2O: 0.998,
  C3H7OH: 0.786, PCl3: 1.57, CS2: 1.26, SiCl4: 1.48, CH3COOH: 1.05, C4H6O3: 1.08 };

// Ions per formula unit (my own count).
const IONCOUNT = {
  MgCl2: { chloride: 2 }, CaCl2: { chloride: 2 }, BaCl2: { chloride: 2 }, Na2SO4: { sodium: 2 }, Na2CO3: { sodium: 2 },
  K3PO4: { potassium: 3 }, K2Cr2O7: { potassium: 2 }, 'Ca(NO3)2': { nitrate: 2 }, 'Fe(NO3)3': { nitrate: 3 },
  'Al2(SO4)3': { sulfate: 3 }, '(NH4)2SO4': { ammonium: 2 }, '(NH4)3PO4': { ammonium: 3 }
};

// Approximate saturated molarity near 20-25 C (from CRC solubility in g/100 g water and solution density).
// Only solutes whose solubility can be exceeded by the generators are listed.
const SAT_M = { NaHCO3: 1.1, CuSO4: 1.4, Na2SO4: 1.9, Na2CO3: 2.0, KNO3: 2.9, KCl: 4.0, NaCl: 5.4, Na3PO4: 0.9, 'Ba(OH)2': 0.23 };

// Clausius-Clapeyron vapor-pressure estimate: reference T0 (K), P0 (atm), dHvap (J/mol), critical T (K).
// Normal boiling points from CRC; CO2 uses its triple point (216.6 K, 5.11 atm).
const VAP = { SO3: [318.0, 1, 40700, 491], SO2: [263.1, 1, 24900, 430.6], Cl2: [239.1, 1, 20400, 417],
  NH3: [239.8, 1, 23350, 405.5], C3H8: [231.1, 1, 19000, 369.8], CO2: [216.6, 5.11, 16700, 304.2], H2S: [212.8, 1, 18700, 373.3] };
function pvap(f, TK) {
  const v = VAP[f]; if (!v || TK >= v[3]) return Infinity;
  return v[1] * Math.exp(v[2] / 8.314 * (1 / v[0] - 1 / TK));
}

module.exports = { AW, ELNAME, NAME2SYM, NA, R, ATM, K0, atoms, mm, mmWith, myCoefs, balanceReport, NAMES, DENS, IONCOUNT, SAT_M, pvap, EQS };
