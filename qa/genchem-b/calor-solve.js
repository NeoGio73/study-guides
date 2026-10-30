// Independent solver for the calorimetry guide's problems (parses the question text).
'use strict';
const I = require('./indep');
const NUM = '(−?-?\\d[\\d,]*(?:\\.\\d+)?)';
const n = s => Number(String(s).replace(/,/g, '').replace(/−/g, '-'));
const sub = s => String(s).replace(/[₀-₉]/g, d => '₀₁₂₃₄₅₆₇₈₉'.indexOf(d));
function need(m, w){ if(!m) throw new Error('parse ' + w); return m; }
const SALTNAME = {'ammonium nitrate': 'NH4NO3', 'potassium nitrate': 'KNO3', 'ammonium chloride': 'NH4Cl', 'calcium chloride': 'CaCl2', 'sodium hydroxide': 'NaOH', 'potassium chloride': 'KCl', 'lithium chloride': 'LiCl', 'potassium hydroxide': 'KOH'};
// phase limits (°C) for the substances heated or cooled in Section 1
const LIQ = {water: [0, 100], ethanol: [-114.1, 78.4]};
const MELT = {aluminum: 660, iron: 1538, copper: 1085, silver: 962, gold: 1064, glass: 500, granite: 1200, titanium: 1668, lead: 327};

// parse "2 Al(s) + Fe2O3(s) → Al2O3(s) + 2 Fe(s)ΔH = −851.5 kJ"
function parseEq(t){
  const [eq, dh] = t.split('ΔH');
  const side = s => s.split('+').map(x => x.trim()).filter(Boolean).map(x => { const m = x.match(/^([\d½/.]*)\s*([A-Za-z0-9()]+?)\((s|l|g|aq)\)$/); if(!m) throw new Error('eq term ' + x);
    const c = m[1] === '' ? 1 : m[1] === '½' ? 0.5 : /\//.test(m[1]) ? +m[1].split('/')[0] / +m[1].split('/')[1] : +m[1]; return [c, m[2], m[3]]; });
  const [l, r] = eq.split('→');
  return {r: side(l), p: side(r), dH: dh ? n(dh.match(/[−\-+]?[\d.,]+/)[0].replace('+', '')) : null};
}
function balanced(E){ const t = {}; E.r.forEach(([c, f]) => { const x = I.formula(f); for(const e in x) t[e] = (t[e] || 0) - c * x[e]; }); E.p.forEach(([c, f]) => { const x = I.formula(f); for(const e in x) t[e] = (t[e] || 0) + c * x[e]; }); return Object.values(t).every(v => Math.abs(v) < 1e-9); }
function dHfromHf(E){ let s = 0; for(const [c, f, st] of E.p){ const k = f + '(' + st + ')'; if(I.HF[k] == null) return null; s += c * I.HF[k]; } for(const [c, f, st] of E.r){ const k = f + '(' + st + ')'; if(I.HF[k] == null) return null; s -= c * I.HF[k]; } return s; }

// independent answers: returns array of expected values, one per part, plus notes
function solve(kind, type, q, eqText){
  q = q.replace(/−/g, '-'); const notes = [];
  if(kind === 'heat'){
    if(type === 'q' || type === 'qk'){ const m = need(q.match(new RegExp('A ' + NUM + ' g sample of ([a-z]+) \\(specific heat ' + NUM + ' J/\\(g·°C\\)\\) (is heated|cools) from ' + NUM + ' °C to ' + NUM + ' °C\\. What is q for the [a-z]+, in (kilojoules|joules)')), 'heat q');
      const name = m[2], c = n(m[3]), Ti = n(m[5]), Tf = n(m[6]); phase(name, [Ti, Tf], notes); dataC(name, c, notes); if((Tf > Ti) !== (m[4] === 'is heated')) notes.push('verb vs direction');
      const qv = n(m[1]) * c * (Tf - Ti); return {exp: [m[7] === 'kilojoules' ? qv / 1000 : qv], notes}; }
    if(type === 'm'){ const m = need(q.match(new RegExp('A sample of ([a-z]+) \\(specific heat ' + NUM + ' J/\\(g·°C\\)\\) (absorbs|releases) ' + NUM + ' (J|kJ) of heat, and its temperature changes from ' + NUM + ' °C to ' + NUM + ' °C')), 'heat m');
      const qv = n(m[4]) * (m[5] === 'kJ' ? 1000 : 1) * (m[3] === 'absorbs' ? 1 : -1), dT = n(m[7]) - n(m[6]); phase(m[1], [n(m[6]), n(m[7])], notes); dataC(m[1], n(m[2]), notes); if((dT > 0) !== (m[3] === 'absorbs')) notes.push('absorbs/releases vs ΔT sign');
      return {exp: [qv / (n(m[2]) * dT)], notes}; }
    if(type === 'c'){ const m = need(q.match(new RegExp('A ' + NUM + ' g sample of an unknown metal (absorbs|releases) ' + NUM + ' (J|kJ) of heat, and its temperature changes from ' + NUM + ' °C to ' + NUM + ' °C')), 'heat c');
      const qv = n(m[3]) * (m[4] === 'kJ' ? 1000 : 1) * (m[2] === 'absorbs' ? 1 : -1), dT = n(m[6]) - n(m[5]); return {exp: [qv / (n(m[1]) * dT)], notes}; }
    if(type === 'dT'){ const m = need(q.match(new RegExp('A ' + NUM + ' g sample of ([a-z]+) \\(specific heat ' + NUM + ' J/\\(g·°C\\)\\) (absorbs|releases) ' + NUM + ' (J|kJ) of heat\\. What is the temperature change')), 'heat dT');
      const qv = n(m[5]) * (m[6] === 'kJ' ? 1000 : 1) * (m[4] === 'absorbs' ? 1 : -1); dataC(m[2], n(m[3]), notes); return {exp: [qv / (n(m[1]) * n(m[3]))], notes}; }
    if(type === 'Tf'){ const m = need(q.match(new RegExp('A ' + NUM + ' g sample of ([a-z]+) \\(specific heat ' + NUM + ' J/\\(g·°C\\)\\) at ' + NUM + ' °C (absorbs|releases) ' + NUM + ' (J|kJ) of heat\\. What is its final temperature')), 'heat Tf');
      const qv = n(m[6]) * (m[7] === 'kJ' ? 1000 : 1) * (m[5] === 'absorbs' ? 1 : -1), Tf = n(m[4]) + qv / (n(m[1]) * n(m[3])); phase(m[2], [n(m[4]), Tf], notes); dataC(m[2], n(m[3]), notes); return {exp: [Tf], notes}; }
  }
  if(kind === 'exchange'){
    if(type === 'c'){ const m = need(q.match(new RegExp('A ' + NUM + ' g piece of an unknown metal at ' + NUM + ' °C is dropped into ' + NUM + ' g of water at ' + NUM + ' °C.*?final temperature of the water and the metal is ' + NUM + ' °C')), 'exch c');
      const mm = n(m[1]), Tm = n(m[2]), mw = n(m[3]), Tw = n(m[4]), Tf = n(m[5]); if(!(Tf > Tw && Tf < Tm)) notes.push('final T outside the range of the initial temperatures');
      const qw = mw * I.CSP.water * (Tf - Tw); return {exp: [qw, qw / (mm * (Tm - Tf))], notes}; }
    const m = need(q.match(new RegExp('A ' + NUM + ' g piece of ([a-z]+) \\(specific heat ' + NUM + ' J/\\(g·°C\\)\\) at ' + NUM + ' °C is dropped into ' + NUM + ' g of water at ' + NUM + ' °C')), 'exch Tf');
    const Cm = n(m[1]) * n(m[3]), Cw = n(m[5]) * I.CSP.water, Tm = n(m[4]), Tw = n(m[6]), Tf = (Cm * Tm + Cw * Tw) / (Cm + Cw); dataC(m[2], n(m[3]), notes);
    if(!(Tf > Tw && Tf < Tm)) notes.push('final T outside range'); return {exp: [Tf], notes};
  }
  if(kind === 'coffee'){
    if(type === 'neut'){ const m = need(q.match(new RegExp(NUM + ' mL of ' + NUM + ' M ([A-Za-z0-9]+) is mixed with ' + NUM + ' mL of ' + NUM + ' M ([A-Za-z0-9]+) in a coffee-cup calorimeter\\. Both solutions start at ' + NUM + ' °C, and the temperature rises to ' + NUM + ' °C')), 'neut');
      const Va = n(m[1]), Vb = n(m[4]), Ma = n(m[2]), Mb = n(m[5]), dT = n(m[8]) - n(m[7]); const qs = (Va + Vb) * 1.00 * I.CSP.water * dT, nr = Math.min(Va / 1000 * Ma, Vb / 1000 * Mb), dH = -qs / nr / 1000;
      if(Math.abs(dH - I.DH_NEUT) / 55.8 > 0.01) notes.push('neutralization ΔH ' + dH.toFixed(1) + ' far from −55.8'); return {exp: [qs, nr, dH], notes}; }
    if(type === 'diss'){ const m = need(q.match(new RegExp(NUM + ' g of ([a-z ]+) \\(([A-Za-z0-9]+)\\) is dissolved in ' + NUM + ' g of water in a coffee-cup calorimeter\\. The temperature changes from ' + NUM + ' °C to ' + NUM + ' °C')), 'diss');
      const ms = n(m[1]), f = m[3], mw = n(m[4]), Tf = n(m[6]), dT = Tf - n(m[5]); const qs = (ms + mw) * I.CSP.water * dT, nn = ms / I.MM(f), dH = -qs / nn / 1000;
      if(Math.abs(dH - I.HSOLN[f]) > Math.max(0.5, 0.02 * Math.abs(I.HSOLN[f]))) notes.push('ΔHsoln ' + f + ' ' + dH.toFixed(1) + ' vs CRC ' + I.HSOLN[f]);
      solubility(f, ms, mw, Tf, notes); return {exp: [qs, nn, dH], notes}; }
    const m = need(q.match(new RegExp(NUM + ' g of ([a-z ]+) \\(([A-Za-z0-9]+)\\) is dissolved in ' + NUM + ' g of water at ' + NUM + ' °C in a coffee-cup calorimeter\\. The enthalpy of solution is ([+−\\-]?[\\d.]+) kJ/mol')), 'predict');
    const ms = n(m[1]), f = m[3], mw = n(m[4]), Ti = n(m[5]), H = n(m[6].replace('+', '')), Tf = Ti - ms / I.MM(f) * H * 1000 / ((ms + mw) * I.CSP.water);
    if(Math.abs(H - I.HSOLN[f]) > 0.2) notes.push('given ΔHsoln ' + H + ' vs CRC ' + I.HSOLN[f]); solubility(f, ms, mw, Tf, notes); return {exp: [Tf], notes};
  }
  if(kind === 'thermo'){
    const E = parseEq(eqText); if(!balanced(E)) notes.push('equation not balanced: ' + eqText); const ref = dHfromHf(E);
    if(ref != null && Math.abs(ref - E.dH) > Math.max(1.0, 0.005 * Math.abs(E.dH))) notes.push('ΔH ' + E.dH + ' vs ΔHf-based ' + ref.toFixed(1) + ' for ' + eqText.split('ΔH')[0]);
    const coef = f => { const x = E.r.concat(E.p).find(s => s[1] === f); if(!x) throw new Error('species ' + f); return x[0]; };
    if(type === 'kJ2g'){ const m = need(q.match(new RegExp('How many grams of ([A-Za-z0-9]+) (must react|form) when ' + NUM + ' kJ of heat is (released|absorbed)')), 'kJ2g');
      if((m[4] === 'released') !== (E.dH < 0)) notes.push('released/absorbed vs sign of ΔH'); return {exp: [n(m[3]) / Math.abs(E.dH) * coef(m[1]) * I.MM(m[1])], notes}; }
    const m = need(q.match(new RegExp('when ' + NUM + ' (g|mol) of ([A-Za-z0-9]+) (reacts|forms)')), 'g2kJ');
    const isR = E.r.some(s => s[1] === m[3]); if(isR !== (m[4] === 'reacts')) notes.push('reacts/forms vs side');
    const mol = m[2] === 'g' ? n(m[1]) / I.MM(m[3]) : n(m[1]); return {exp: [mol / coef(m[3]) * E.dH], notes};
  }
}
function phase(name, Ts, notes){ const L2 = LIQ[name]; if(L2){ Ts.forEach(T => { if(T < L2[0] || T > L2[1]) notes.push(name + ' at ' + T.toFixed(1) + ' °C is outside its liquid range (' + L2[0] + ' to ' + L2[1] + ' °C at 1 atm)'); }); } else if(MELT[name]) Ts.forEach(T => { if(T > MELT[name]) notes.push(name + ' above its melting point'); }); }
function dataC(name, c, notes){ if(I.CSP[name] != null && Math.abs(I.CSP[name] - c) > 0.005) notes.push('specific heat of ' + name + ' ' + c + ' vs ' + I.CSP[name]); }
function solubility(f, ms, mw, Tf, notes){ const s = I.solubAt(f, Tf), have = 100 * ms / mw; if(have > s) notes.push(f + ': ' + have.toFixed(1) + ' g/100 g water exceeds its solubility (' + s.toFixed(1) + ' g/100 g) at the final ' + Tf.toFixed(1) + ' °C'); }


// what a student would type into each guided blank, computed here from the question text
function blankValues(kind, type, q, eqText){
  q = sub(q).replace(/−/g, '-'); const v = {}, f4 = x => String(Number(x.toPrecision(4)));
  if(kind === 'heat'){
    const qm = q.match(new RegExp('(absorbs|releases) ' + NUM + ' (J|kJ) of heat')); if(qm) v.q = String(Number((n(qm[2]) * (qm[3] === 'kJ' ? 1000 : 1) * (qm[1] === 'absorbs' ? 1 : -1)).toPrecision(6)));   // q as given (the worked solution prints it this way)
    const mm = q.match(new RegExp('A ' + NUM + ' g sample')); if(mm) v.m = mm[1];
    const cm = q.match(new RegExp('specific heat ' + NUM)); if(cm) v.c = cm[1];
    const tm = q.match(new RegExp('from ' + NUM + ' °C to ' + NUM + ' °C')); if(tm) v.dT = (n(tm[2]) - n(tm[1])).toFixed(1);
    return v;
  }
  if(kind === 'exchange'){
    if(type === 'c'){ const m = q.match(new RegExp('A ' + NUM + ' g piece of an unknown metal at ' + NUM + ' °C is dropped into ' + NUM + ' g of water at ' + NUM + ' °C.*?is ' + NUM + ' °C'));
      const dTw = n(m[5]) - n(m[4]), qw = n(m[3]) * 4.184 * dTw; return {dTw: dTw.toFixed(2), qw: f4(qw), qm: f4(-qw), dTm: (n(m[5]) - n(m[2])).toFixed(2)}; }
    const m = q.match(new RegExp('A ' + NUM + ' g piece of [a-z]+ \\(specific heat ' + NUM + ' J/\\(g·°C\\)\\) at ' + NUM + ' °C is dropped into ' + NUM + ' g of water'));
    return {Cm: f4(n(m[1]) * n(m[2])), Cw: f4(n(m[4]) * 4.184)};
  }
  if(kind === 'coffee'){
    if(type === 'neut'){ const m = q.match(new RegExp(NUM + ' mL of ' + NUM + ' M [A-Za-z0-9]+ is mixed with ' + NUM + ' mL.*?start at ' + NUM + ' °C, and the temperature rises to ' + NUM + ' °C'));
      return {ms: (n(m[1]) + n(m[3])).toFixed(1), dT: (n(m[5]) - n(m[4])).toFixed(2)}; }
    if(type === 'diss'){ const m = q.match(new RegExp(NUM + ' g of [a-z ]+ \\([A-Za-z0-9]+\\) is dissolved in ' + NUM + ' g of water in a coffee-cup calorimeter\\. The temperature changes from ' + NUM + ' °C to ' + NUM + ' °C'));
      return {ms: f4(n(m[1]) + n(m[2])), dT: (n(m[4]) - n(m[3])).toFixed(2)}; }
    const m = q.match(new RegExp(NUM + ' g of [a-z ]+ \\(([A-Za-z0-9]+)\\) is dissolved in ' + NUM + ' g of water at ' + NUM + ' °C.*?enthalpy of solution is ([+\\-]?[\\d.]+) kJ/mol'));
    const ms = n(m[1]), mol = ms / I.MM(m[2]), qr = mol * n(m[5]) * 1000, mass = ms + n(m[3]);
    return {n: f4(mol), qr: f4(qr), qs: f4(-qr), dT: String(Number((-qr / (mass * 4.184)).toPrecision(3)))};
  }
  if(kind === 'thermo'){
    const E = parseEq(sub(eqText)); const fm = q.match(/(?:grams of|of) ([A-Za-z0-9]+) (?:must react|form|reacts|forms)/); const f = fm[1];
    const x = E.r.concat(E.p).find(s => s[1] === f); const out = {a: String(x[0]), H: type === 'kJ2g' ? String(Math.abs(E.dH)) : String(E.dH), MA: I.MM(f).toFixed(2)};
    if(type === 'mol2kJ') delete out.MA; return out;
  }
  return v;
}
module.exports = {solve, blankValues, parseEq, balanced, dHfromHf, sub, n};
