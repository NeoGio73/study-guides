// Gases guide: drive every practice generator N times, recompute each answer independently from the
// question text, and check that the page accepts its own displayed answer and a correctly rounded answer.
'use strict';
const L = require('./lib');
const I = require('./indep');
const N = +(process.env.N || 2000);

// BANK index -> generator name (from reading the BANK arrays)
const MAP = {
  pres: {0: 'conv', 1: 'conv', 2: 'conv', 3: 'mano', 4: 'mano', 6: 'mcHighest', 13: 'closed'},
  boyle: {0: 'bV', 1: 'bP', 2: 'bV', 3: 'bP', 4: 'bMixed', 5: 'bTank', 6: 'mcFactor', 10: 'mcSets'},
  charles: {0: 'cV', 1: 'cT', 2: 'cV', 3: 'cT', 4: 'c2k', 5: 'k2c', 6: 'ln2', 7: 'cFactor'},
  gay: {0: 'glP', 1: 'glT', 2: 'tire', 3: 'avV', 4: 'avAdd', 5: 'stpV', 6: 'stpN', 7: 'glP', 8: 'mcSame', 9: 'mcHeavier'},
  comb: {0: 'combV', 1: 'combP', 2: 'combT', 3: 'toSTP', 4: 'combV', 5: 'combFactor', 6: 'mcWhich'},
  ideal: {0: 'iP', 1: 'iV', 2: 'iN', 3: 'iT', 4: 'massV', 5: 'massIn', 6: 'iV', 7: 'iN', 12: 'mcEffect'},
  dens: {0: 'dQ', 1: 'mFromD', 2: 'mFromMass', 3: 'stpD', 4: 'ident', 5: 'dQ', 6: 'mFromMass', 7: 'mcDense', 8: 'mcRise'},
  dalton: {0: 'total', 1: 'missing', 2: 'fromX', 3: 'xFromP', 4: 'mixP', 5: 'wetP', 6: 'wetN', 7: 'fromX', 13: 'massX'},
  stoich: {0: 'g2L', 1: 'L2g', 2: 'stp', 3: 'vols', 4: 'burn', 5: 'g2L', 6: 'L2g', 7: 'vols', 13: 'overWater'},
  kmt: {0: 'speed', 1: 'ratio', 2: 'unknownM', 3: 'time', 4: 'speed', 5: 'ratio', 7: 'mcFastest'},
  real: {0: 'vdw', 1: 'vdw', 5: 'mcStrong', 6: 'mcIdeal'},
  mix: {0: 'whichEq', 1: 'whichEq', 2: 'whichEq'}
};
const NUM = '(-?\\d[\\d,]*(?:\\.\\d+)?)';
const n = s => Number(String(s).replace(/,/g, ''));
const K = c => c + I.T0;
const RX = {'calcium carbonate': ['CaCO3', 1, 'CO2', 1], 'potassium chlorate': ['KClO3', 2, 'O2', 3], zinc: ['Zn', 1, 'H2', 1], aluminum: ['Al', 2, 'H2', 3],
  'sodium azide': ['NaN3', 2, 'N2', 3], 'hydrogen peroxide': ['H2O2', 2, 'O2', 1], 'calcium carbide': ['CaC2', 1, 'C2H2', 1]};
const gasF = name => { const f = I.NAME2F[name.toLowerCase()]; if(!f) throw new Error('unknown gas name ' + name); return f; };
function need(m, what){ if(!m) throw new Error('could not parse ' + what); return m; }
// is an equation written in the question balanced?  "2 KClO3(s) → 2 KCl(s) + 3 O2(g)"
function balanced(eq){
  const side = s => { const t = {}; s.split(' + ').forEach(x => { const m = x.trim().match(/^(\d+(?:\.\d+)?)?\s*([A-Za-z0-9()]+?)(\((?:s|l|g|aq)\))?$/); if(!m) throw new Error('eq parse ' + x); const c = m[1] ? +m[1] : 1, f = I.formula(m[2]); for(const e in f) t[e] = (t[e] || 0) + c * f[e]; }); return t; };
  const [l, r] = eq.split('→'); const A = side(l), B = side(r); const ks = new Set(Object.keys(A).concat(Object.keys(B)));
  for(const k of ks) if(Math.abs((A[k] || 0) - (B[k] || 0)) > 1e-9) return false; return true;
}
function coefIn(eq, f){ const parts = eq.replace(/\((?:s|l|g|aq)\)/g, '').split(/ \+ | → /); for(const p of parts){ const m = p.trim().match(/^(\d+)?\s*(\S+)$/); if(m && m[2] === f) return m[1] ? +m[1] : 1; } throw new Error('coef of ' + f + ' not found in ' + eq); }

// each solver gets the plain question text and returns {exp, notes}
const S = {
  conv(t){ const m = need(t.match(new RegExp('(?:pressure of|is at|flask is) ' + NUM + ' (\\w+)\\. What is this pressure in (\\w+)\\?')), 'conv'); return {exp: n(m[1]) / I.ATM[m[2]] * I.ATM[m[3]]}; },
  mano(t){ const m = need(t.match(new RegExp('on the (open side|side joined to the gas) stands ' + NUM + ' mm higher.*?Atmospheric pressure is ' + NUM + ' torr\\. What is the pressure of the gas in (atm|torr)')), 'mano');
    const pg = m[1] === 'open side' ? n(m[3]) + n(m[2]) : n(m[3]) - n(m[2]); return {exp: m[4] === 'atm' ? pg / 760 : pg, notes: pg <= 0 ? ['non-positive gas pressure'] : []}; },
  closed(t){ const m = need(t.match(new RegExp('closed side stands ' + NUM + ' mm higher than on the gas side')), 'closed'); return {exp: n(m[1]) / 760}; },
  bV(t){ const m = need(t.match(new RegExp('occupies ' + NUM + ' (m?L) at ' + NUM + ' (\\w+)\\. What volume does it occupy at ' + NUM + ' (\\w+), if')), 'bV'); if(m[4] !== m[6]) throw new Error('units'); return {exp: n(m[3]) * n(m[1]) / n(m[5])}; },
  bP(t){ const m = need(t.match(new RegExp('A gas at ' + NUM + ' (\\w+) is (compressed|allowed to expand) from ' + NUM + ' (m?L) to ' + NUM + ' (m?L) at constant')), 'bP');
    const v1 = n(m[4]), v2 = n(m[6]), notes = []; if((v2 < v1) !== (m[3] === 'compressed')) notes.push('verb does not match direction'); return {exp: n(m[1]) * v1 / v2, notes}; },
  bMixed(t){ const m = need(t.match(new RegExp('occupies ' + NUM + ' L at ' + NUM + ' atm\\. What volume does it occupy at ' + NUM + ' torr')), 'bMixed'); return {exp: n(m[1]) * n(m[2]) / (n(m[3]) / 760)}; },
  bTank(t){ const m = need(t.match(new RegExp('volume of ' + NUM + ' L holds air at ' + NUM + ' atm')), 'bTank'); return {exp: n(m[1]) * n(m[2]) / 1.00}; },
  cV(t){ const m = need(t.match(new RegExp('has a volume of ' + NUM + ' (m?L) at ' + NUM + ' °C\\. What is the volume at ' + NUM + ' °C')), 'cV'); return {exp: n(m[1]) * K(n(m[4])) / K(n(m[3]))}; },
  cT(t){ const m = need(t.match(new RegExp('occupies ' + NUM + ' (m?L) at ' + NUM + ' °C\\. At constant pressure, to what temperature in °C must it be (heated|cooled) for its volume to become ' + NUM + ' (m?L)')), 'cT');
    const v1 = n(m[1]), v2 = n(m[5]), e = K(n(m[3])) * v2 / v1 - I.T0, notes = []; if((v2 > v1) !== (m[4] === 'heated')) notes.push('heated/cooled does not match'); if(e <= -I.T0) notes.push('below absolute zero'); return {exp: e, notes, degC: true}; },
  c2k(t){ const m = need(t.match(new RegExp('Convert ' + NUM + ' °C to kelvins')), 'c2k'); return {exp: K(n(m[1]))}; },
  k2c(t){ const m = need(t.match(new RegExp('Convert ' + NUM + ' K to degrees Celsius')), 'k2c'); return {exp: n(m[1]) - I.T0, degC: true}; },
  ln2(t){ const m = need(t.match(new RegExp('volume of ' + NUM + ' L at ' + NUM + ' °C is dipped into liquid nitrogen at ' + NUM + ' °C')), 'ln2'); return {exp: n(m[1]) * K(n(m[3])) / K(n(m[2]))}; },
  cFactor(t){ const m = need(t.match(new RegExp('A gas is at ' + NUM + ' °C\\. At constant pressure, to what temperature in °C must it be brought for its volume to (double|triple|fall to half)')), 'cFactor');
    const f = {double: 2, triple: 3, 'fall to half': 0.5}[m[2]]; return {exp: f * K(n(m[1])) - I.T0, degC: true}; },
  glP(t){ const m = need(t.match(new RegExp(' at ' + NUM + ' (atm|torr|kPa) and ' + NUM + ' °C\\. What is the pressure at ' + NUM + ' °C\\?')), 'glP'); return {exp: n(m[1]) * K(n(m[4])) / K(n(m[3]))}; },
  glT(t){ const m = need(t.match(new RegExp('pressure of ' + NUM + ' (\\w+) at ' + NUM + ' °C\\. At what temperature in °C will its pressure be ' + NUM + ' (\\w+)\\?')), 'glT'); return {exp: K(n(m[3])) * n(m[4]) / n(m[1]) - I.T0, degC: true}; },
  tire(t){ const m = need(t.match(new RegExp('absolute pressure of ' + NUM + ' psi on a morning when the temperature is ' + NUM + ' °C\\. After a long drive the air in the tire is at ' + NUM + ' °C')), 'tire'); return {exp: n(m[1]) * K(n(m[3])) / K(n(m[2]))}; },
  avV(t){ const m = need(t.match(new RegExp('holding ' + NUM + ' mol of gas has a volume of ' + NUM + ' L\\. Gas is (added|let out) until it holds ' + NUM + ' mol')), 'avV');
    const notes = []; if((n(m[4]) > n(m[1])) !== (m[3] === 'added')) notes.push('added/let out mismatch'); return {exp: n(m[2]) * n(m[4]) / n(m[1]), notes}; },
  avAdd(t){ const m = need(t.match(new RegExp('holds ' + NUM + ' mol of gas in ' + NUM + ' L\\. How many moles of gas must be added to bring the volume to ' + NUM + ' L')), 'avAdd'); return {exp: n(m[1]) * n(m[3]) / n(m[2]) - n(m[1])}; },
  stpV(t){ const m = need(t.match(new RegExp('What volume does ' + NUM + ' mol of')), 'stpV'); return {exp: n(m[1]) * I.VM}; },
  stpN(t){ const m = need(t.match(new RegExp('are in ' + NUM + ' L of the gas at STP')), 'stpN'); return {exp: n(m[1]) / I.VM}; },
  combV(t){ const m = need(t.match(new RegExp('occupies ' + NUM + ' (m?L) at ' + NUM + ' (\\w+) and ' + NUM + ' °C\\. What volume does it occupy at ' + NUM + ' (\\w+) and ' + NUM + ' °C')), 'combV'); return {exp: n(m[1]) * n(m[3]) / n(m[6]) * K(n(m[8])) / K(n(m[5]))}; },
  combP(t){ const m = need(t.match(new RegExp('A gas at ' + NUM + ' (\\w+) occupies ' + NUM + ' (m?L) at ' + NUM + ' °C\\. It is (compressed|expanded) to ' + NUM + ' (m?L) and its temperature is changed to ' + NUM + ' °C')), 'combP');
    const notes = []; if((n(m[7]) < n(m[3])) !== (m[6] === 'compressed')) notes.push('compressed/expanded mismatch'); return {exp: n(m[1]) * n(m[3]) / n(m[7]) * K(n(m[9])) / K(n(m[5])), notes}; },
  combT(t){ const m = need(t.match(new RegExp('occupies ' + NUM + ' L at ' + NUM + ' atm and ' + NUM + ' °C\\. What is its temperature in °C when it occupies ' + NUM + ' L at ' + NUM + ' atm')), 'combT');
    const e = K(n(m[3])) * n(m[5]) / n(m[2]) * n(m[4]) / n(m[1]) - I.T0; return {exp: e, degC: true, notes: e < -I.T0 ? ['below 0 K'] : []}; },
  toSTP(t){ const m = need(t.match(new RegExp('volume of ' + NUM + ' mL at ' + NUM + ' torr and ' + NUM + ' °C\\. What would its volume be at STP')), 'toSTP'); return {exp: n(m[1]) * n(m[2]) / 760 * I.T0 / K(n(m[3]))}; },
  combFactor(t){ const m = need(t.match(/The pressure on a gas is (doubled|halved|tripled|kept the same) and its kelvin temperature is (doubled|halved|increased by 50%|kept the same)/), 'combFactor');
    const fp = {doubled: 2, halved: 0.5, tripled: 3, 'kept the same': 1}[m[1]], ft = {doubled: 2, halved: 0.5, 'increased by 50%': 1.5, 'kept the same': 1}[m[2]]; return {exp: ft / fp}; },
  iP(t){ const m = need(t.match(new RegExp('pressure in atm of ' + NUM + ' mol of .*? in an? ' + NUM + ' L container at ' + NUM + ' °C')), 'iP'); return {exp: n(m[1]) * I.R * K(n(m[3])) / n(m[2])}; },
  iV(t){ const m = need(t.match(new RegExp('What volume does ' + NUM + ' mol of an ideal gas occupy at ' + NUM + ' (\\w+) and ' + NUM + ' °C')), 'iV'); return {exp: n(m[1]) * I.R * K(n(m[4])) / (n(m[2]) / I.ATM[m[3]])}; },
  iN(t){ const m = need(t.match(new RegExp('How many moles of gas are in an? ' + NUM + ' L container at ' + NUM + ' (\\w+) and ' + NUM + ' °C')), 'iN'); return {exp: n(m[2]) / I.ATM[m[3]] * n(m[1]) / (I.R * K(n(m[4])))}; },
  iT(t){ const m = need(t.match(new RegExp('An? ' + NUM + ' L container holds ' + NUM + ' mol of gas at ' + NUM + ' atm\\. What is the temperature of the gas in (°C|kelvins)')), 'iT');
    const Tk = n(m[3]) * n(m[1]) / (n(m[2]) * I.R); return {exp: m[4] === '°C' ? Tk - I.T0 : Tk, degC: m[4] === '°C', notes: Tk < 1 ? ['T below 1 K'] : []}; },
  massV(t){ const m = need(t.match(new RegExp('What volume does ' + NUM + ' g of [a-z ]+, ([A-Za-z0-9]+), occupy at ' + NUM + ' °C and ' + NUM + ' (\\w+)\\?')), 'massV'); return {exp: n(m[1]) / I.MM(m[2]) * I.R * K(n(m[3])) / (n(m[4]) / I.ATM[m[5]])}; },
  massIn(t){ const m = need(t.match(new RegExp('A ' + NUM + ' L cylinder holds [a-z ]+ at ' + NUM + ' atm and ' + NUM + ' °C\\. How many grams of [a-z ]+ \\(([A-Za-z0-9]+)\\)')), 'massIn'); return {exp: n(m[2]) * n(m[1]) / (I.R * K(n(m[3]))) * I.MM(m[4])}; },
  dQ(t){ const m = need(t.match(new RegExp('density, in g/L, of [a-z ]+, ([A-Za-z0-9]+), at ' + NUM + ' (\\w+) and ' + NUM + ' °C')), 'dQ');
    const f = m[1], Tc = n(m[4]), notes = []; if(I.BP[f] != null && Tc < I.BP[f]) notes.push('below normal boiling point of ' + f);
    return {exp: (n(m[2]) / I.ATM[m[3]]) * I.MM(f) / (I.R * K(Tc)), notes}; },
  mFromD(t){ const m = need(t.match(new RegExp('density of ' + NUM + ' g/L at ' + NUM + ' atm and ' + NUM + ' °C')), 'mFromD'); return {exp: n(m[1]) * I.R * K(n(m[3])) / n(m[2])}; },
  mFromMass(t){ const m = need(t.match(new RegExp('A ' + NUM + ' mL flask is filled with the vapor of an unknown volatile liquid at ' + NUM + ' °C and ' + NUM + ' torr\\. The vapor has a mass of ' + NUM + ' g')), 'mFromMass');
    return {exp: n(m[4]) * I.R * K(n(m[2])) / ((n(m[3]) / 760) * n(m[1]) / 1000)}; },
  stpD(t){ const m = need(t.match(/density of [a-z ]+, ([A-Za-z0-9]+), at STP/), 'stpD'); return {exp: I.MM(m[1]) / I.VM}; },
  total(t){ const ps = [...t.matchAll(new RegExp('partial pressure of ' + NUM + ' (torr|atm)', 'g'))]; if(ps.length !== 3) throw new Error('total parse'); return {exp: ps.reduce((s, x) => s + n(x[1]), 0)}; },
  missing(t){ const m = need(t.match(new RegExp('total pressure of ' + NUM + ' torr\\. The partial pressure of [a-z ]+ is ' + NUM + ' torr and that of [a-z ]+ is ' + NUM + ' torr')), 'missing');
    const e = n(m[1]) - n(m[2]) - n(m[3]); return {exp: e, notes: e <= 0 ? ['non-positive partial pressure'] : []}; },
  fromX(t){ const m = need(t.match(new RegExp('contains ' + NUM + ' mol of [a-z ]+ and ' + NUM + ' mol of [a-z ]+ at a total pressure of ' + NUM + ' atm')), 'fromX'); return {exp: n(m[1]) / (n(m[1]) + n(m[2])) * n(m[3])}; },
  xFromP(t){ const m = need(t.match(new RegExp('partial pressure of [a-z ]+ is ' + NUM + ' torr and that of [a-z ]+ is ' + NUM + ' torr\\. What is the mole fraction')), 'xFromP'); return {exp: n(m[1]) / (n(m[1]) + n(m[2]))}; },
  mixP(t){ const m = need(t.match(new RegExp('A ' + NUM + ' L container holds ' + NUM + ' mol of [a-z ]+ and ' + NUM + ' mol of [a-z ]+ at ' + NUM + ' °C')), 'mixP'); return {exp: (n(m[2]) + n(m[3])) * I.R * K(n(m[4])) / n(m[1])}; },
  wetP(t){ const m = need(t.match(new RegExp('collected over water at ' + NUM + ' °C\\. The total pressure in the collection bottle is ' + NUM + ' torr.*?Vapor pressure of water at ' + NUM + ' °C: ' + NUM + ' torr')), 'wetP');
    const tc = n(m[1]), vp = n(m[4]), notes = []; if(Math.abs(vp - I.VPW[tc]) > 0.15) notes.push('vapor pressure ' + vp + ' vs ' + I.VPW[tc] + ' at ' + tc + ' °C');
    return {exp: n(m[2]) - I.VPW[tc], notes}; },
  wetN(t){ const m = need(t.match(new RegExp('collects ' + NUM + ' mL of [a-z ]+ over water at ' + NUM + ' °C and a total pressure of ' + NUM + ' torr.*?Vapor pressure of water at ' + NUM + ' °C: ' + NUM + ' torr')), 'wetN');
    const tc = n(m[2]), vp = n(m[5]), notes = []; if(Math.abs(vp - I.VPW[tc]) > 0.15) notes.push('vapor pressure ' + vp + ' vs ' + I.VPW[tc]);
    return {exp: (n(m[3]) - I.VPW[tc]) / 760 * n(m[1]) / 1000 / (I.R * K(tc)), notes}; },
  massX(t){ const m = need(t.match(new RegExp('contains ' + NUM + ' g of ([a-z ]+?) and ' + NUM + ' g of ([a-z ]+?) at a total pressure of ' + NUM + ' atm')), 'massX');
    const n1 = n(m[1]) / I.MM(gasF(m[2])), n2 = n(m[3]) / I.MM(gasF(m[4])); return {exp: n1 / (n1 + n2) * n(m[5])}; },
  g2L(t){ const m = need(t.match(new RegExp('What volume of [a-z ]+, measured at ' + NUM + ' °C and ' + NUM + ' (\\w+), is produced when ' + NUM + ' g of ([a-z ]+) reacts completely\\?(.*)$')), 'g2L');
    const r = RX[m[5]], eq = m[6].trim(), notes = []; if(!balanced(eq)) notes.push('unbalanced: ' + eq); if(coefIn(eq, r[0]) !== r[1] || coefIn(eq, r[2]) !== r[3]) notes.push('coefficient mismatch');
    return {exp: n(m[4]) / I.MM(r[0]) * r[3] / r[1] * I.R * K(n(m[1])) / (n(m[2]) / I.ATM[m[3]]), notes}; },
  L2g(t){ const m = need(t.match(new RegExp('How many grams of ([a-z ]+) must react to produce ' + NUM + ' L of [a-z ]+, measured at ' + NUM + ' °C and ' + NUM + ' atm\\?(.*)$')), 'L2g');
    const r = RX[m[1]], eq = m[5].trim(), notes = []; if(!balanced(eq)) notes.push('unbalanced: ' + eq);
    return {exp: n(m[4]) * n(m[2]) / (I.R * K(n(m[3]))) * r[1] / r[3] * I.MM(r[0]), notes}; },
  stp(t){ const m = need(t.match(new RegExp('at STP is produced from ' + NUM + ' g of ([a-z ]+)\\?(.*)$')), 'stp'); const r = RX[m[2]], notes = []; if(!balanced(m[3].trim())) notes.push('unbalanced');
    return {exp: n(m[1]) / I.MM(r[0]) * r[3] / r[1] * I.VM, notes}; },
  vols(t){ const m = need(t.match(new RegExp('In the reaction (.*?), what volume of ([A-Za-z0-9]+) (is formed along with|reacts with|is formed when|is needed to form) ' + NUM + ' L of ([A-Za-z0-9]+)')), 'vols');
    const eq = m[1], notes = []; if(!balanced(eq)) notes.push('unbalanced: ' + eq);
    const [lhs] = eq.replace(/\((?:g)\)/g, '').split(' → '), inL = f => lhs.split(' + ').some(x => x.trim().replace(/^\d+\s*/, '') === f);
    const A = m[5], B = m[2], pa = !inL(A), pb = !inL(B), want = pa && pb ? 'is formed along with' : !pa && !pb ? 'reacts with' : pb ? 'is formed when' : 'is needed to form';
    if(want !== m[3]) notes.push('wording "' + m[3] + '" should be "' + want + '"');
    return {exp: n(m[4]) * coefIn(eq, B) / coefIn(eq, A), notes}; },
  burn(t){ const m = need(t.match(new RegExp('needed to burn ' + NUM + ' g of (methane|propane) completely')), 'burn'); const f = m[2] === 'methane' ? ['CH4', 2] : ['C3H8', 5];
    return {exp: n(m[1]) / I.MM(f[0]) * f[1] * I.VM}; },
  overWater(t){ const m = need(t.match(new RegExp('volume of ' + NUM + ' mL at ' + NUM + ' °C and a total pressure of ' + NUM + ' torr\\. How many grams of ([a-z ]+) reacted\\? \\(Vapor pressure of water at ' + NUM + ' °C: ' + NUM + ' torr\\)(.*)$')), 'overWater');
    const tc = n(m[2]), r = RX[m[4]], notes = []; if(Math.abs(n(m[6]) - I.VPW[tc]) > 0.15) notes.push('VP mismatch'); if(!balanced(m[7].trim())) notes.push('unbalanced');
    const ng = (n(m[3]) - I.VPW[tc]) / 760 * n(m[1]) / 1000 / (I.R * K(tc)); return {exp: ng * r[1] / r[3] * I.MM(r[0]), notes}; },
  speed(t){ const m = need(t.match(new RegExp('speed, in m/s, of [a-z ]+ (?:atoms|molecules) \\(([A-Za-z0-9]+)\\) at ' + NUM + ' °C')), 'speed'); return {exp: Math.sqrt(3 * I.RJ * K(n(m[2])) / (I.MM(m[1]) / 1000))}; },
  ratio(t){ const m = need(t.match(/does [a-z ]+, ([A-Za-z0-9]+), effuse as [a-z ]+, ([A-Za-z0-9]+), at/), 'ratio'); return {exp: Math.sqrt(I.MM(m[2]) / I.MM(m[1]))}; },
  unknownM(t){ const m = need(t.match(new RegExp('effuses ' + NUM + ' times as fast as [a-z ]+, ([A-Za-z0-9]+), under')), 'unknownM'); return {exp: I.MM(m[2]) / (n(m[1]) ** 2)}; },
  time(t){ const m = need(t.match(new RegExp('A sample of ([a-z ]+?) takes ' + NUM + ' s to effuse through a pinhole\\. How long does the same amount of ([a-z ]+?) take')), 'time');
    return {exp: n(m[2]) * Math.sqrt(I.MM(gasF(m[3])) / I.MM(gasF(m[1])))}; },
  vdw(t){ const m = need(t.match(new RegExp('pressure of 1\\.00 mol of [a-z ]+, ([A-Za-z0-9]+), in an? ' + NUM + ' L container at ' + NUM + ' °C\\. For [A-Za-z0-9]+, a = ' + NUM + ' L²·atm/mol² and b = ' + NUM + ' L/mol')), 'vdw');
    const f = m[1], V = n(m[2]), T = K(n(m[3])), a = n(m[4]), b = n(m[5]), notes = [];
    if(I.VDW[f] && (Math.abs(a - I.VDW[f][0]) / I.VDW[f][0] > 0.02 || Math.abs(b - I.VDW[f][1]) / I.VDW[f][1] > 0.02)) notes.push('a,b ' + a + ',' + b + ' vs table ' + I.VDW[f]);
    if(T <= I.TC[f]) notes.push('below critical temperature');
    const P = I.R * T / (V - b) - a / (V * V), Pi = I.R * T / V; if(Math.abs(P - Pi) < 0.03 * P) notes.push('vdW within 3% of ideal');
    return {exp: P, notes}; }
};

async function gen(page, sec, idx, count){
  return page.evaluate(([sec, idx, N]) => {
    const G = window.__G, item = G.BANK[sec][idx], div = document.createElement('div');
    const txt = h => { div.innerHTML = String(h); return div.textContent; };
    const caret = h => txt(String(h).replace(/<sup>(.*?)<\/sup>/g, '^$1'));
    const out = [];
    for(let k = 0; k < N; k++){
      let Q; window.__lastRaw = null;
      let first = false, exhausted = false;
      try { Q = typeof item === 'function' ? item() : Object.assign({}, item); first = !!Q.slipInside; for(let g = 0; Q.slipInside && g < 40; g++) Q = item(); exhausted = !!Q.slipInside; } catch(e){ out.push({err: String(e && e.stack || e)}); continue; }
      const r = {k: Q.k, q: txt(Q.q), firstInside: first, exhausted};
      if(Q.k === 'num'){
        const tol = Q.tol != null ? Q.tol : Math.abs(Q.a) * (Q.rel != null ? Q.rel : 0);
        const ok = v => isFinite(v) && Math.abs(v - Q.a) <= tol + 1e-9;
        const trapOf = v => { if(ok(v)) return 'ACCEPTED'; const t = (Q.traps || []).find(tr => Math.abs(v - tr[0]) <= Math.max(Q.unit === '°C' ? 0.6 : 1e-9, Math.abs(tr[0]) * 0.011)); return t ? txt(t[1]) : null; };
        r.a = Q.a; r.tol = tol; r.unit = txt(Q.unit || ''); r.show = txt(Q.show); r.showC = caret(Q.show); r.sci = !!Q.sci;
        r.accShow = ok(G.parseNum(r.show)); r.accCaret = ok(G.parseNum(r.showC));
        r.whyHasShow = txt(Q.why || '').indexOf(r.show) >= 0;
        r.traps = (Q.traps || []).map(t => ({v: t[0], msg: txt(t[1]), typed: txt(G.numH(t[0], 3)), got: trapOf(G.parseNum(txt(G.numH(t[0], 3)))), gotInt: trapOf(Math.round(t[0]))}));
        r.raw = (window.__lastRaw || []).map(t => ({v: t[0], msg: txt(t[1]), inTol: ok(t[0]), band: isFinite(t[0]) && !ok(t[0]) && Math.abs(t[0] - Q.a) <= 1.3 * tol}));
        r.trueCheck = null; // filled from Node
      } else if(Q.k === 'mc'){ r.c = txt(Q.c); r.w = (Q.w || []).map(txt); r.dupe = new Set([r.c].concat(r.w)).size !== 1 + r.w.length; }
      else if(Q.k === 'order'){ r.items = Q.items.map(i => txt(i.t)); }
      out.push(r);
    }
    return out;
  }, [sec, idx, count]);
}
// Ask the page whether given values would be accepted for a problem (uses the page's own parseNum).
const grade = (r, typed) => { const v = Number(String(typed).replace(/,/g, '').replace(/−/g, '-')); return isFinite(v) && Math.abs(v - r.a) <= r.tol + 1e-9; };
const round3 = x => Number(Number(x).toPrecision(3));

function mcCheck(name, r){
  const notes = [];
  if(r.dupe) notes.push('duplicate options');
  if(name === 'mcHighest'){ const val = s => { const m = s.match(/^([\d.]+) (\w+)$/); return +m[1] / I.ATM[m[2]]; }; const all = [r.c].concat(r.w).map(val); if(Math.max(...all) !== val(r.c)) notes.push('c not highest'); const s = all.slice().sort((a, b) => b - a); if((s[0] - s[1]) / s[0] < 0.01) notes.push('top two within 1%'); }
  if(name === 'mcHeavier'){ const f = s => gasF(s.replace('The flask of ', '')); if(!/same/.test(r.c) && I.MM(f(r.c)) < I.MM(f(r.w[0]))) notes.push('c is lighter'); }
  if(name === 'mcDense'){ const f = s => s.split(', ')[1]; const most = /most/.test(r.q); const all = [r.c].concat(r.w).map(f).map(I.MM); const cm = I.MM(f(r.c)); if(most ? cm !== Math.max(...all) : cm !== Math.min(...all)) notes.push('wrong density pick'); }
  if(name === 'mcRise'){ const f = r.q.match(/filled with [a-z ]+, ([A-Za-z0-9]+),/)[1]; const up = I.MM(f) < 28.96; if((r.c === 'Rise') !== up) notes.push('rise/sink wrong for ' + f); }
  if(name === 'mcFastest'){ const f = s => s.split(', ')[1]; const all = [r.c].concat(r.w).map(f).map(I.MM); if(I.MM(f(r.c)) !== Math.min(...all)) notes.push('fastest is not lightest'); }
  if(name === 'mcStrong' || name === 'mcIdeal'){ const f = s => s.split(', ')[1].split(' ')[0]; const a = [r.c].concat(r.w).map(f).map(g => I.VDW[g][0]); const ca = I.VDW[f(r.c)][0];
    if(name === 'mcStrong' ? ca !== Math.max(...a) : ca !== Math.min(...a)) notes.push('pick disagrees with textbook a values'); }
  if(name === 'ident'){ const m = r.q.match(new RegExp('density of ' + NUM + ' g/L at ' + NUM + ' atm and ' + NUM + ' °C')); const M = n(m[1]) * I.R * K(n(m[3])) / n(m[2]);
    const f = s => s.split(', ')[1]; const opts = [r.c].concat(r.w).map(s => [s, Math.abs(I.MM(f(s)) - M)]).sort((a, b) => a[1] - b[1]); if(opts[0][0] !== r.c) notes.push('closest by M is ' + opts[0][0]); }
  if(name === 'mcSets'){ const pv = s => s.split('; ').map(x => { const m = x.match(/([\d.]+) atm, ([\d.]+) L/); return +m[1] * +m[2]; }); const c = pv(r.c); if(Math.max(...c) - Math.min(...c) > 1e-6) notes.push('correct set PV not constant'); r.w.forEach(w => { const p = pv(w); if(Math.max(...p) - Math.min(...p) < 1e-6) notes.push('a wrong set also obeys Boyle'); }); }
  if(name === 'whichEq'){ const all = [r.c].concat(r.w); if(all.indexOf('Combined gas law, P₁V₁/T₁ = P₂V₂/T₂') >= 0 && /Boyle|Charles|Gay-Lussac/.test(r.c)) notes.push('combined offered as wrong for a simple-law problem');
    if(/STP/.test(r.q) && /Combined/.test(r.c) && all.some(s => /Ideal gas law/.test(s))) notes.push('ideal offered as wrong for STP conversion'); }
  return notes;
}

(async () => {
  const browser = await L.launch();
  const {ctx, page, errors} = await L.openPage(browser, L.GASES, {seed: 20261030, patch: L.patchGases});
  const results = {N, perType: {}, faults: [], pageErrors: errors};
  const secs = await page.evaluate(() => Object.keys(window.__G.BANK).map(s => [s, window.__G.BANK[s].length]));
  // mixed practice reuses generators from the other sections: find which one each entry is
  const mixSrc = await page.evaluate(() => { const B = window.__G.BANK, out = {}; B.mix.forEach((f, i) => { for(const s in B){ if(s === 'mix') continue; const j = B[s].indexOf(f); if(j >= 0){ out[i] = [s, j]; break; } } }); return out; });
  for(const i in mixSrc){ const [s, j] = mixSrc[i]; if(MAP[s] && MAP[s][j]) MAP.mix[i] = MAP[s][j]; }
  for(const [sec, len] of secs){
    for(let idx = 0; idx < len; idx++){
      const name = (MAP[sec] || {})[idx] || (sec + '#' + idx);
      const isFn = await page.evaluate(([s, i]) => typeof window.__G.BANK[s][i] === 'function', [sec, idx]);
      const count = isFn ? N : 1;
      const recs = await gen(page, sec, idx, count);
      const key = sec + '[' + idx + '] ' + name;
      const T = results.perType[key] = {count: recs.length, errors: 0, showRejected: 0, caretRejected: 0, trueRejected: 0, true3Rejected: 0, maxDevOverTol: 0, notes: {}, slipsAccepted: {}, slipNotFired: {}, slipIntNotFired: {}, samples: {}};
      const note = (k, sample) => { T.notes[k] = (T.notes[k] || 0) + 1; if(!T.samples[k]) T.samples[k] = sample; };
      for(const r of recs){
        if(r.err){ T.errors++; note('exception', r.err.slice(0, 300)); continue; }
        if(r.k === 'num'){
          if(!isFinite(r.a)) note('non-finite answer', r.q);
          if(!r.accShow){ T.showRejected++; note('displayed answer rejected', r.q + ' || show=' + r.show + ' a=' + r.a + ' tol=' + r.tol); }
          if(!r.accCaret){ T.caretRejected++; note('displayed answer (typed with ^) rejected', r.q + ' || show=' + r.showC); }
          if(/−0(?![.\d])/.test(r.show)) note('displays −0', r.q + ' || ' + r.show);
          r.raw.forEach(t => { if(!t.inTol) return;
            // a slip that gives exactly the right number (a 1:1 ratio, equal moles) is harmless; one that gives a different number inside the tolerance is a wrong method marked right
            const same = Math.abs(t.v - r.a) <= 1e-7 * Math.abs(r.a), kk = (same ? 'same value: ' : 'DIFFERENT value accepted: ') + t.msg.replace(/[A-Z][a-z]?\d*(?: ?[A-Z][a-z]?\d*)*/g, m => m).replace(/\d+(\.\d+)? °C/g, 'X °C');
            T.slipsAccepted[kk] = (T.slipsAccepted[kk] || 0) + 1;
            if(!same){ const d = Math.abs(t.v - r.a) / Math.abs(r.a); T.maxAcceptedSlipDiff = Math.max(T.maxAcceptedSlipDiff || 0, d); }
            if(!T.samples['slip accepted: ' + kk]) T.samples['slip accepted: ' + kk] = r.q + ' || answer ' + r.a + ', slip value ' + t.v + ', tol ' + r.tol; });
          r.traps.forEach(t => { if(t.got !== t.msg){ T.slipNotFired[t.msg] = (T.slipNotFired[t.msg] || 0) + 1; if(!T.samples['not fired: ' + t.msg]) T.samples['not fired: ' + t.msg] = r.q + ' || typed ' + t.typed + ' got: ' + t.got; }
            if(/°C/.test(r.unit) && t.gotInt !== t.msg){ const kk = t.msg.replace(/−?\d+ °C/g, 'X °C'); T.slipIntNotFired[kk] = (T.slipIntNotFired[kk] || 0) + 1; if(!T.samples['int not fired: ' + kk]) T.samples['int not fired: ' + kk] = r.q + ' || slip value ' + t.v + ' typed as ' + Math.round(t.v) + ' -> ' + t.gotInt; } });
          T.numCount = (T.numCount || 0) + 1; if(r.firstInside) T.redrawn = (T.redrawn || 0) + 1; if(r.exhausted) note('redraw guard exhausted', r.q);
          r.raw.forEach(t => { if(t.band){ const kk = t.msg.slice(0, 70); T.msgDropped = T.msgDropped || {}; T.msgDropped[kk] = (T.msgDropped[kk] || 0) + 1; } });
          const sv = S[name];
          if(sv){
            let res; try { res = sv(r.q.replace(/−/g, '-')); } catch(e){ note('solver could not parse', r.q + ' || ' + e.message); continue; }
            (res.notes || []).forEach(x => note(x, r.q));
            const dev = Math.abs(r.a - res.exp), ratio = r.tol > 0 ? dev / r.tol : (dev > 1e-9 ? Infinity : 0);
            if(ratio > T.maxDevOverTol){ T.maxDevOverTol = ratio; T.worst = {q: r.q, page: r.a, mine: res.exp, tol: r.tol}; }
            if(!grade(r, res.exp)){ T.trueRejected++; note('exact correct answer rejected', r.q + ' || page ' + r.a + ' mine ' + res.exp + ' tol ' + r.tol); }
            const typed = res.degC ? Math.round(res.exp) : round3(res.exp);
            if(!grade(r, typed)){ T.true3Rejected++; note('correctly rounded answer rejected', r.q + ' || typed ' + typed + ' page a ' + r.a + ' tol ' + r.tol); }
            if(res.degC && res.exp < -I.T0) note('answer below absolute zero', r.q);
            if(!res.degC && !/no unit/.test(r.unit) && res.exp <= 0) note('non-positive answer', r.q);
          } else if(!/#/.test(name)) note('no solver', name);
        } else if(r.k === 'mc'){ if(MAP[sec] && MAP[sec][idx]) mcCheck(name, r).forEach(x => note(x, r.q + ' || c=' + r.c + ' w=' + r.w.join(' / '))); else if(r.dupe) note('duplicate options', r.q); }
        if(/\bNaN(?![₀-₉0-9A-Za-z])|\bundefined\b|\bInfinity\b|\[object Object\]/.test(JSON.stringify(r))) note('bad text in problem', JSON.stringify(r).slice(0, 300));
      }
      console.log(key.padEnd(28), 'n=' + T.count, 'redrawn=' + (T.redrawn || 0), T.msgDropped ? 'MSG-DROPPED ' + JSON.stringify(T.msgDropped) : '', 'err=' + T.errors, 'showRej=' + T.showRejected, 'trueRej=' + T.trueRejected, 'true3Rej=' + T.true3Rejected, 'maxDev/tol=' + T.maxDevOverTol.toFixed(3),
        Object.keys(T.notes).length ? JSON.stringify(T.notes) : '',
        Object.keys(T.slipsAccepted).filter(k => /^DIFF/.test(k)).length ? 'SLIP-ACCEPTED ' + JSON.stringify(Object.fromEntries(Object.entries(T.slipsAccepted).filter(e => /^DIFF/.test(e[0])))) + ' maxdiff=' + (100 * (T.maxAcceptedSlipDiff || 0)).toFixed(2) + '%' : '',
        Object.keys(T.slipIntNotFired).length ? 'INT-NOT-FIRED ' + JSON.stringify(T.slipIntNotFired) : '',
        Object.keys(T.slipNotFired).length ? 'NOT-FIRED ' + JSON.stringify(T.slipNotFired) : '');
    }
  }
  await ctx.close(); await browser.close();
  L.writeJSON('gases-generators.json', results);
  console.log('page errors:', errors.length);
})();
