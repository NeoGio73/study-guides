// Section audits shared by the two solution guides (molarity, dilution, reactions in solution, mixing,
// titration, gases). All answers are recomputed with lib/chem.js data.
'use strict';
const C = require('./chem');
const H = require('./harness');

const mmOf = f => C.mm(f);
function expectIn(rec, sec, t, s, what, ex) {
  rec.check(sec, 'given value shown in question');
  if (t.indexOf(String(s)) < 0) rec.fault(sec, 'given-not-in-question', 'A value used in the answer is not shown in the question', { what, s, ex });
}
function compare(rec, sec, G, part, mine, ex, what) {
  rec.check(sec, 'independent recompute' + (what ? ' (' + what + ')' : ''));
  const d = H.relDiff(part.answer, mine);
  const lim = part.sf >= 4 ? 0.0015 : 0.003;
  if (d > lim) rec.fault(sec, 'answer-differs-from-independent' + (what ? ': ' + what : ''), 'Page answer differs from my recomputation', { mine, page: part.answer, rel: +d.toFixed(5), ex });
  H.lastDigitCheck(rec, sec, part, mine, ex, what);
  const typed = H.typeFor(part, mine);
  const r = G.gradePart(part, typed);
  if (r.status !== 'correct') rec.fault(sec, 'my-answer-rejected' + (what ? ': ' + what : ''), 'My independently computed answer is not accepted', { typed, status: r.status, msg: H.text(r.msg || ''), page: part.answer, ex });
}
function slipsCheck(rec, sec, G, part, slips, ex) {
  slips.forEach(([v, expect, name], i) => {
    if (slips.some(([w], j) => j !== i && H.relDiff(v, w) < 0.012)) return;
    H.checkSlip(rec, sec, G, part, v, expect, name, ex);
  });
}
function solubility(rec, sec, f, M, ex, role) {
  rec.check(sec, 'concentration below solubility');
  if (C.SAT_M[f] && M > C.SAT_M[f]) rec.fault(sec, 'exceeds-solubility: ' + f, 'Solution is more concentrated than a saturated solution near room temperature (≈' + C.SAT_M[f] + ' M)',
    { f, M: +Number(M).toPrecision(3), role, ex });
}
const toLtxt = v => { const s = String(v); const sf = s.replace('.', '').replace(/^0+/, '').length; return (Number(v) / 1000).toPrecision(Math.max(sf, 1)); };

function reaction(rec, sec, rxn, ex) {
  rec.check(sec, 'equation balanced and matches my coefficients');
  const bad = C.balanceReport(rxn);
  if (bad.length) rec.fault(sec, 'equation-unbalanced', 'Equation is not balanced', { bad, ex });
  const mine = C.myCoefs(rxn);
  if (!mine) { rec.fault(sec, 'equation-unknown', 'Reaction not in my table', { ex }); return null; }
  rxn.r.concat(rxn.p).forEach(([c, f]) => { if (mine[f] !== c) rec.fault(sec, 'coefficient-differs', 'Coefficient differs from my balanced equation', { f, page: c, mine: mine[f], ex }); });
  return mine;
}

/* ---------- 1. Molarity ---------- */
function molarity(rec, sec, G, P, ex) {
  const t = H.text(P.question), f = P.solute, M = mmOf(f), part = P.parts[0];
  const num = re => { const m = t.match(re); if (!m) throw new Error('parse ' + re + ' in ' + t); return m.slice(1).map(Number); };
  let mine, slips = [], conc, V, n;
  switch (P.type) {
    case 'Mmol': [n, V] = num(/contains ([\d.]+) mol of \S+ in ([\d.]+) mL of solution/); mine = n / (V / 1000); conc = mine;
      slips = [[n / V, 'not per milliliter', 'mL not converted'], [V / 1000 / n, 'upside down', 'inverted'], [n * V / 1000, 'multiplied', 'multiplied']]; break;
    case 'Mg': { let m; [m, V] = num(/dissolving ([\d.]+) g of .* in enough water to make ([\d.]+) mL/); n = m / M; mine = n / (V / 1000); conc = mine;
      slips = [[m / (V / 1000), 'grams were used', 'grams as moles'], [n / V, 'not per milliliter', 'mL not converted'], [n, 'That is the moles', 'stopped at moles']];
      H.checkBlank(rec, sec, G, P, 'MM', [M.toFixed(2)], ex); H.checkBlank(rec, sec, G, P, 'n', [H.sigText(n, 4), H.sigText(n, 3)], ex); break; }
    case 'mol': { let c; [V, c] = num(/are in ([\d.]+) mL of ([\d.]+) M/); mine = c * V / 1000; conc = c;
      slips = [[c * V, 'Convert', 'mL not converted'], [c / (V / 1000), 'divided', 'divided']]; break; }
    case 'g': { let c; [V, c] = num(/to prepare ([\d.]+) mL of ([\d.]+) M/); n = c * V / 1000; mine = n * M; conc = c;
      slips = [[n, 'That is the moles', 'stopped at moles'], [c * V * M, 'Convert', 'mL not converted'], [c * M, 'one full liter', 'mass per liter']];
      H.checkBlank(rec, sec, G, P, 'MM', [M.toFixed(2)], ex); H.checkBlank(rec, sec, G, P, 'n', [H.sigText(n, 4), H.sigText(n, 3)], ex); break; }
    case 'mL': { let c, m; [c, m] = num(/of ([\d.]+) M \S+ solution contains ([\d.]+) g of/); n = m / M; mine = n / c * 1000; conc = c;
      slips = [[n / c, 'volume in liters', 'left in liters'], [m / c * 1000, 'grams were used', 'grams as moles'], [n, 'That is the moles', 'stopped at moles']];
      H.checkBlank(rec, sec, G, P, 'MM', [M.toFixed(2)], ex); H.checkBlank(rec, sec, G, P, 'n', [H.sigText(n, 4), H.sigText(n, 3)], ex); break; }
    default: rec.fault(sec, 'unknown-type', '', { type: P.type, ex }); return;
  }
  if (V !== undefined && P.blanks.L) H.checkBlank(rec, sec, G, P, 'L', [String(V / 1000), toLtxt(V)], ex);
  rec.check(sec, 'name matches formula');
  if (!(C.NAMES[f] || []).some(nm => t.toLowerCase().indexOf(nm) >= 0) && /\(/.test(t)) rec.fault(sec, 'name-formula-mismatch', 'Solute name not recognised', { f, ex });
  solubility(rec, sec, f, conc, ex, 'solution');
  compare(rec, sec, G, part, mine, ex);
  slipsCheck(rec, sec, G, part, slips, ex);
}

/* ---------- 2. Dilution ---------- */
// Concentrated reagents as sold (≈ M): if a stock is above this it cannot be made.
const CONC_MAX = { HCl: 12.1, HNO3: 15.8, H2SO4: 18.0, NH3: 14.8, NaOH: 19.1 };
function dilution(rec, sec, G, P, ex) {
  const t = H.text(P.question), f = P.solute, part = P.parts[0];
  const num = re => { const m = t.match(re); if (!m) throw new Error('parse ' + re + ' in ' + t); return m.slice(1).map(Number); };
  const s = { }; let mine, slips = [];
  if (P.type === 'V1') { [s.M1, s.V2, s.M2] = num(/of ([\d.]+) M \S+ stock solution is needed to prepare ([\d.]+) mL of ([\d.]+) M/); mine = s.M2 * s.V2 / s.M1;
    slips = [[s.M1 * s.V2 / s.M2, 'more than the final volume', 'inverted']]; }
  else if (P.type === 'M2') { [s.V1, s.M1, s.V2] = num(/^([\d.]+) mL of ([\d.]+) M \S+ is diluted with water to a total volume of ([\d.]+) mL/); mine = s.M1 * s.V1 / s.V2;
    slips = [[s.M1 * s.V2 / s.V1, 'less concentrated', 'inverted']]; }
  else if (P.type === 'V2') { [s.V1, s.M1, s.M2] = num(/must ([\d.]+) mL of ([\d.]+) M \S+ be diluted to make a ([\d.]+) M solution/); mine = s.M1 * s.V1 / s.M2;
    slips = [[s.M2 * s.V1 / s.M1, 'has to be larger', 'inverted']]; }
  else { [s.V1, s.M1, s.M2] = num(/added to ([\d.]+) mL of ([\d.]+) M \S+ to make a ([\d.]+) M solution/); const V2 = s.M1 * s.V1 / s.M2; mine = V2 - s.V1;
    slips = [[V2, 'total volume', 'gave total volume'], [s.M2 * s.V1 / s.M1, 'has to be larger', 'inverted']]; }
  // blanks show the given values
  const str = re => (t.match(re) || [])[1];
  for (const k of ['M1', 'V1', 'M2', 'V2']) if (P.blanks[k]) H.checkBlank(rec, sec, G, P, k, [String(s[k])], ex);
  rec.check(sec, 'physical sanity');
  if (!(s.M1 > (s.M2 || 0)) && P.type !== 'M2') rec.fault(sec, 'dilution-not-dilute', 'Final molarity not below stock', { s, ex });
  if (CONC_MAX[f] && s.M1 > CONC_MAX[f]) rec.fault(sec, 'stock-above-concentrated-reagent', 'Stock is more concentrated than the commercial concentrated reagent', { f, M1: s.M1, ex });
  solubility(rec, sec, f, s.M1, ex, 'stock solution');
  rec.check(sec, 'dilution blank message with three wrong blanks');
  { const keys = Object.keys(P.blanks), got = {}; keys.forEach(k => { got[k] = { v: -1, good: false }; });
    const msg = H.text(P.blankMsg(got));
    if (keys.length === 3 && !/^Check M1, V1 and M2\.|^Check M1, V1 and V2\.|^Check M1, M2 and V2\.|^Check V1, M2 and V2\./.test(msg)) rec.fault(sec, 'dilution-message-joins', 'Three-blank message not joined with commas', { msg, ex }); }
  compare(rec, sec, G, part, mine, ex);
  slipsCheck(rec, sec, G, part, slips, ex);
}

/* ---------- Reactions: one substance to another (solution, solid, gas) ---------- */
function gasIn(g) { // g: {T, P, Pu, V, Vu} as strings
  return { TK: g.T !== undefined ? Number(g.T) + C.K0 : null, Patm: g.P !== undefined ? Number(g.P) / C.ATM[g.Pu] : null,
    VL: g.V !== undefined ? Number(g.V) / (g.Vu === 'mL' ? 1000 : 1) : null };
}
function chainMine(S, coef) {
  const a = coef[S.A.f], b = coef[S.B.f], f = S.from, t = S.to;
  const gi = f.type === 'gas' ? gasIn(f) : null, go = (t.type === 'gasV' || t.type === 'gasP') ? gasIn(t) : null;
  const LA = f.type === 'sol' ? Number(f.v) / 1000 : null;
  const nA = f.type === 'sol' ? LA * Number(f.M) : f.type === 'g' ? Number(f.x) / mmOf(S.A.f) : gi.Patm * gi.VL / (C.R * gi.TK);
  const nB = nA * b / a;
  const LB = t.type === 'M' ? Number(t.v) / 1000 : t.type === 'mL' ? nB / Number(t.M) : null;
  const ans = t.type === 'g' ? nB * mmOf(S.B.f) : t.type === 'mL' ? LB * 1000 : t.type === 'M' ? nB / LB
    : t.type === 'gasV' ? nB * C.R * go.TK / go.Patm : nB * C.R * go.TK / go.VL;
  return { a, b, LA, nA, nB, LB, ans, gi, go };
}
const condTxt = g => g.stp ? 'STP (0 °C and 1.00 atm)' : g.T + ' °C and ' + g.P + ' ' + g.Pu;
function gasPhys(rec, sec, f, TK, Patm, ex, where) {
  rec.check(sec, 'gas would not condense');
  const pv = C.pvap(f, TK);
  if (Patm > pv) rec.fault(sec, 'gas-would-condense: ' + f, 'Stated pressure is above the vapor pressure at that temperature, so this "gas" would be (partly) liquid or solid',
    { f, T_C: +(TK - C.K0).toFixed(1), P_atm: +Patm.toPrecision(3), vaporPressure_atm: +pv.toPrecision(3), where, ex });
  if (Patm > 20) { rec.check(sec, 'pressure where ideal gas law is reasonable'); rec.fault(sec, 'high-pressure-ideal-gas', 'Ideal gas law used above 20 atm', { f, P_atm: +Patm.toPrecision(3), ex }); }
}
function chainProblem(rec, sec, G, P, ex) {
  const S = P.S, t = H.text(P.question), coef = reaction(rec, sec, P.rxn, ex); if (!coef) return;
  const f = S.from, to = S.to, part = P.parts[0];
  // the numbers used are the ones shown
  if (f.type === 'sol') { expectIn(rec, sec, t, f.v + ' mL', 'given volume', ex); expectIn(rec, sec, t, f.M + ' M ' + S.A.f, 'given molarity', ex); solubility(rec, sec, S.A.f, Number(f.M), ex, 'given solution'); }
  if (f.type === 'g') expectIn(rec, sec, t, f.x + ' g', 'given mass', ex);
  if (f.type === 'gas') { expectIn(rec, sec, t, f.V + ' ' + f.Vu + ' of ' + S.A.f + ' gas', 'gas sample', ex); expectIn(rec, sec, t, 'at ' + condTxt(f), 'gas conditions', ex); }
  if (to.type === 'mL') { expectIn(rec, sec, t, to.M + ' M ' + S.B.f, 'molarity of wanted solution', ex); solubility(rec, sec, S.B.f, Number(to.M), ex, 'wanted solution'); }
  if (to.type === 'M') expectIn(rec, sec, t, to.v + ' mL', 'volume of wanted solution', ex);
  if (to.type === 'g') expectIn(rec, sec, t, 'grams of ' + S.B.f, 'asked grams', ex);
  if (to.type === 'gasV') expectIn(rec, sec, t, S.same ? 'same temperature and pressure' : 'measured at ' + condTxt(to), 'gas conditions', ex);
  if (to.type === 'gasP') expectIn(rec, sec, t, to.V + ' L container at ' + to.T + ' °C', 'container', ex);
  const c = chainMine(S, coef);
  compare(rec, sec, G, part, c.ans, ex);
  if (to.type === 'M') solubility(rec, sec, S.B.f, c.ans, ex, 'computed molarity');
  if (f.type === 'gas') gasPhys(rec, sec, S.A.f, c.gi.TK, c.gi.Patm, ex, 'given gas');
  if (to.type === 'gasV') gasPhys(rec, sec, S.B.f, c.go.TK, c.go.Patm, ex, 'wanted gas');
  if (to.type === 'gasP') gasPhys(rec, sec, S.B.f, c.go.TK, c.ans, ex, 'pressure reached');
  rec.check(sec, 'container pressure at most 5 atm; SO2 at most 1.5 atm; SO3 never a measured gas');
  if (to.type === 'gasP' && c.ans > 5) rec.fault(sec, 'container-pressure-over-5-atm', 'Container pressure above 5 atm', { P: c.ans, ex });
  if ((S.A.f === 'SO2' && f.type === 'gas' && c.gi.Patm > 1.5) || (S.B.f === 'SO2' && to.type === 'gasV' && c.go.Patm > 1.5)) rec.fault(sec, 'so2-over-1.5-atm', 'SO2 measured above 1.5 atm', { ex });
  if ((S.A.f === 'SO3' && f.type === 'gas') || (S.B.f === 'SO3' && (to.type === 'gasV' || to.type === 'gasP'))) rec.fault(sec, 'so3-as-gas', 'SO3 measured as a gas', { ex });
  // blanks
  H.checkBlank(rec, sec, G, P, 'a', [String(coef[S.A.f])], ex); H.checkBlank(rec, sec, G, P, 'b', [String(coef[S.B.f])], ex);
  if (f.type === 'sol') H.checkBlank(rec, sec, G, P, 'mA', [f.M], ex);
  if (f.type === 'g') H.checkBlank(rec, sec, G, P, 'MA', [mmOf(S.A.f).toFixed(2)], ex);
  if (to.type === 'g') H.checkBlank(rec, sec, G, P, 'MB', [mmOf(S.B.f).toFixed(2)], ex);
  if (to.type === 'mL') H.checkBlank(rec, sec, G, P, 'mB', [to.M], ex);
  if (to.type === 'M') H.checkBlank(rec, sec, G, P, 'LB', [String(Number(to.v) / 1000), toLtxt(to.v)], ex);
  const gasBlanks = (pre, g, gv) => {
    if (g.P !== undefined) H.checkBlank(rec, sec, G, P, 'P' + pre, [H.sigText(gv.Patm, 4), H.sigText(gv.Patm, 3)], ex);
    if (g.V !== undefined) H.checkBlank(rec, sec, G, P, 'V' + pre, [String(gv.VL)], ex);
    H.checkBlank(rec, sec, G, P, 'T' + pre, [(gv.TK).toFixed(2), String(Math.round(Number(g.T)) + 273)], ex);
  };
  if (f.type === 'gas') { gasBlanks('A', f, c.gi); H.checkBlank(rec, sec, G, P, 'nA', [H.sigText(c.nA, 4), H.sigText(c.nA, 3)], ex); }
  if (to.type === 'gasV' || to.type === 'gasP') { gasBlanks('B', to, c.go); H.checkBlank(rec, sec, G, P, 'nB', [H.sigText(c.nB, 4), H.sigText(c.nB, 3)], ex); }
  // named slips computed from my own numbers
  const a = c.a, b = c.b, ans = c.ans, sl = [];
  if (a !== b) { sl.push([ans * a / b, '1:1 mole ratio was assumed', '1:1 ratio']); sl.push([ans * a * a / (b * b), 'upside down', 'ratio upside down']); }
  if (to.type === 'g') sl.push([c.nB, 'That is the moles', 'stopped at moles']);
  if (f.type === 'sol') sl.push([ans * 1000, 'milliliters were used where liters', 'mL as L']);
  if (f.type === 'g') sl.push([ans * mmOf(S.A.f), 'used as moles', 'grams as moles']);
  if (to.type === 'mL') { sl.push([ans / 1000, 'volume in liters', 'left in liters']); sl.push([c.nB * Number(to.M) * 1000, 'you multiplied', 'multiplied by molarity']); }
  if (to.type === 'M') sl.push([ans / 1000, 'Convert', 'mL not converted']);
  if (f.type === 'gas') {
    if (Number(f.T) > 0) sl.push([ans * c.gi.TK / Number(f.T), 'left in °C', '°C for given gas']);
    if (f.Pu !== 'atm') sl.push([ans * C.ATM[f.Pu], 'pressure was left in', 'pressure unit for given gas']);
    if (f.Vu === 'mL') sl.push([ans * 1000, 'left in milliliters', 'mL for given gas']);
    if (!f.stp) sl.push([ans * (c.gi.VL / 22.414) / c.nA, 'only applies at STP', '22.4 L/mol for given gas']);
  }
  if (to.type === 'gasV' || to.type === 'gasP') {
    if (Number(to.T) > 0) sl.push([ans * Number(to.T) / c.go.TK, 'left in °C', '°C for wanted gas']);
    sl.push([c.nB, 'That is the moles', 'stopped at moles of gas']);
  }
  if (to.type === 'gasV') { if (to.Pu !== 'atm') sl.push([ans / C.ATM[to.Pu], 'pressure was left in', 'pressure unit for wanted gas']); if (!to.stp && !S.same) sl.push([c.nB * 22.414, 'only applies at STP', '22.4 L/mol for wanted gas']); }
  slipsCheck(rec, sec, G, part, sl, ex);
}

/* ---------- 4. Mixing two solutions ---------- */
function mix(rec, sec, G, P, ex) {
  const t = H.text(P.question), coef = reaction(rec, sec, P.rxn, ex); if (!coef) return;
  const Pd = P.Pd.f, MP = mmOf(Pd);
  const R = P.R.map(r => { expectIn(rec, sec, t, r.v + ' mL of ' + r.Mo + ' M ' + r.f, 'solution', ex); solubility(rec, sec, r.f, Number(r.Mo), ex, 'reactant solution');
    const n = Number(r.v) / 1000 * Number(r.Mo); return { f: r.f, n, y: n * coef[Pd] / coef[r.f] * MP, c: coef[r.f] }; });
  const iL = R[0].y <= R[1].y ? 0 : 1, L = R[iL], E = R[1 - iL];
  rec.check(sec, 'limiting reactant');
  if (P.parts[0].answer !== L.f) rec.fault(sec, 'wrong-limiting-reactant', 'Page names a different limiting reactant', { mine: L.f, page: P.parts[0].answer, ex });
  compare(rec, sec, G, P.parts[1], L.y, ex, 'theoretical yield');
  expectIn(rec, sec, t, P.actual + ' g of', 'actual yield', ex);
  const act = Number(P.actual), pct = act / L.y * 100;
  rec.check(sec, 'physical sanity'); if (!(pct > 0 && pct < 100)) rec.fault(sec, 'bad-percent', 'Percent yield outside 0-100', { pct, ex });
  compare(rec, sec, G, P.parts[2], pct, ex, 'percent yield');
  R.forEach((r, i) => { H.checkBlank(rec, sec, G, P, 'n' + i, [H.sigText(r.n, 4), H.sigText(r.n, 3)], ex); H.checkBlank(rec, sec, G, P, 'y' + i, [H.sigText(r.y, 4), H.sigText(r.y, 3)], ex); });
  slipsCheck(rec, sec, G, P.parts[1], [[E.y, 'other reactant could make', 'used excess reactant'], [L.y * 1000, 'milliliters were used', 'mL as L'],
    [L.n * coef[Pd] / L.c, 'That is the moles', 'stopped at moles'], [L.y + E.y, 'Do not add', 'added both'], [act, 'actual yield', 'gave actual']], ex);
  slipsCheck(rec, sec, G, P.parts[2], [[L.y / act * 100, 'upside down', 'inverted percent'], [act / L.y, 'Multiply by 100', 'fraction'], [act / E.y * 100, 'excess reactant', 'vs excess reactant']], ex);
  rec.check(sec, 'wrong-choice message'); const wm = P.parts[0].wrongMsg(E.f); if (!wm) rec.fault(sec, 'wrong-choice-message', 'No message for wrong choice', { ex });
}

module.exports = { molarity, dilution, chainProblem, mix, reaction, compare, slipsCheck, expectIn, solubility, gasIn, gasPhys, condTxt, chainMine, toLtxt };
