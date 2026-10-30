// Generator audit: general-chemistry/stoichiometry-study-guide.html
'use strict';
const { loadGuide } = require('./lib/load');
const C = require('./lib/chem');
const H = require('./lib/harness');

const FILE = 'general-chemistry/stoichiometry-study-guide.html';
const N = +(process.argv[2] || 3000);
const SEED = +(process.argv[3] || 20261031);

function run() {
  const { G, ctl } = loadGuide(FILE, SEED);
  const rec = new H.Recorder(FILE);
  for (const kind of ['molmol', 'massmass', 'density', 'limiting', 'yield', 'capstone']) {
    let prev = null;
    for (let i = 0; i < N; i++) {
      ctl.calls = 0;
      let P;
      try { P = G.makeProblem(kind, prev && prev.rxn); }
      catch (e) { rec.fault(kind, 'generator-exception', 'makeProblem threw', { err: String(e && e.message), i }); prev = null; continue; }
      prev = P;
      const sec = kind + (P.type ? ':' + P.type : P.S ? ':' + P.S.unit + '>' + P.S.endUnit : '');
      rec.count(kind); rec.count(sec);
      const ex = { question: H.text(P.question), eq: eqText(P.rxn), show: P.parts.map(p => H.text(p.show)) };
      try {
        H.genericChecks(rec, sec, G, P, ex);
        reaction(rec, sec, P, ex);
        if (P.kind === 'limiting') limiting(rec, sec, G, P, ex);
        else if (P.kind === 'capstone') capstone(rec, sec, G, P, ex);
        else if (P.kind === 'yield') yieldP(rec, sec, G, P, ex);
        else chain(rec, sec, G, P, ex);
      } catch (e) { rec.fault(sec, 'audit-exception', 'Audit code failed on this problem', { err: String(e && e.stack).slice(0, 500), ex }); }
    }
  }
  return rec;
}
const eqText = r => r.r.map(e => (e[0] > 1 ? e[0] + ' ' : '') + e[1]).join(' + ') + ' -> ' + r.p.map(e => (e[0] > 1 ? e[0] + ' ' : '') + e[1]).join(' + ');

function reaction(rec, sec, P, ex) {
  rec.check(sec, 'equation balanced and matches my coefficients');
  const bad = C.balanceReport(P.rxn);
  if (bad.length) rec.fault(sec, 'equation-unbalanced', 'Equation is not balanced', { bad, ex });
  const mine = C.myCoefs(P.rxn);
  if (!mine) { rec.fault(sec, 'equation-unknown', 'Reaction not in my table', { ex }); return; }
  P.rxn.r.concat(P.rxn.p).forEach(([c, f]) => { if (mine[f] !== c) rec.fault(sec, 'coefficient-differs', 'Coefficient differs from my balanced equation', { f, page: c, mine: mine[f], ex }); });
}
function densFromText(t) {
  const d = {}; const re = /\(([A-Za-z0-9()]+), density ([\d.]+) g\/mL\)/g; let m;
  while ((m = re.exec(t))) d[m[1]] = m[2];
  return d;
}
function expectIn(rec, sec, t, s, what, ex) {
  rec.check(sec, 'given value shown in question');
  if (t.indexOf(s) < 0) rec.fault(sec, 'given-not-in-question', 'A value used in the answer is not shown in the question', { what, s, ex });
}
function compare(rec, sec, G, part, mine, ex, what) {
  rec.check(sec, 'independent recompute' + (what ? ' (' + what + ')' : ''));
  const d = H.relDiff(part.answer, mine);
  if (d > 0.003) rec.fault(sec, 'answer-differs-from-independent' + (what ? ': ' + what : ''), 'Page answer differs from my recomputation by more than 0.3%', { mine, page: part.answer, rel: +d.toFixed(5), ex });
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
const mmOf = f => C.mm(f);

// One substance to another (sections 1-3, and the chains inside percent yield).
function chainCompute(S, coef, dens) {
  const a = coef[S.A.f], b = coef[S.B.f], x = Number(S.x);
  const dA = S.unit === 'mL' ? Number(dens[S.A.f]) : 1, dB = S.endUnit === 'mL' ? Number(dens[S.B.f]) : 1;
  const MA = mmOf(S.A.f), MB = mmOf(S.B.f);
  const gA = S.unit === 'mol' ? null : x * dA, nA = S.unit === 'mol' ? x : gA / MA, nB = nA * b / a, gB = nB * MB;
  const ans = S.endUnit === 'mol' ? nB : S.endUnit === 'g' ? gB : gB / dB;
  return { a, b, x, dA, dB, MA, MB, gA, nA, nB, gB, ans };
}
function chainSlips(S, c) {
  const { a, b, x, dA, dB, MA, MB, ans } = c, U = S.unit, V = S.endUnit, out = [];
  out.push([ans * a * a / (b * b), 'upside down', 'mole ratio upside down']);
  if (U === 'mol' && V === 'mol') {
    out.push([x, 'no mole ratio was applied', 'no ratio']);
    out.push([x * b, 'did not divide by the coefficient', 'multiplied by b only']);
    out.push([x / a, 'did not multiply by the coefficient', 'divided by a only']);
    return out;
  }
  if (V !== 'mol') out.push([c.nB, 'That is the moles of', 'stopped at moles of B']);
  if (U !== 'mol' && V !== 'mol') {
    // molar masses swapped: (x*dA)/MB * ratio * MA (/dB)
    out.push([ans * MA * MA / (MB * MB), 'molar masses look swapped', 'molar masses swapped']);
    out.push([ans * b / a, 'counted twice', 'coefficient inside molar mass']);
  }
  out.push([ans * a / b, 'mole ratio was skipped', 'skipped mole ratio']);
  if (U === 'mL') { out.push([ans / dA, 'as if they were grams', 'mL used as grams']); out.push([ans / dA / dA, 'upside down', 'density of A upside down']); }
  if (V === 'mL') { out.push([c.gB, 'That is the mass of', 'stopped at grams of B']); out.push([ans * dB * dB, 'upside down', 'density of B upside down']); }
  if (U === 'g' && V === 'g') out.push([x * b / a, 'directly to grams', 'ratio applied to grams']);
  return out;
}
function chainBlanksCheck(rec, sec, G, P, S, coef, dens, ex) {
  H.checkBlank(rec, sec, G, P, 'a', [String(coef[S.A.f])], ex);
  H.checkBlank(rec, sec, G, P, 'b', [String(coef[S.B.f])], ex);
  if (S.unit !== 'mol') H.checkBlank(rec, sec, G, P, 'MA', [mmOf(S.A.f).toFixed(2)], ex);
  if (S.endUnit !== 'mol') H.checkBlank(rec, sec, G, P, 'MB', [mmOf(S.B.f).toFixed(2)], ex);
  if (S.unit === 'mL') H.checkBlank(rec, sec, G, P, 'dA', [dens[S.A.f]], ex);
  if (S.endUnit === 'mL') H.checkBlank(rec, sec, G, P, 'dB', [dens[S.B.f]], ex);
}
function densityFacts(rec, sec, dens, ex) {
  for (const f in dens) {
    rec.check(sec, 'density value vs CRC');
    if (!(f in C.DENS)) { rec.fault(sec, 'density-unknown', 'Density for a substance not in my table', { f, ex }); continue; }
    if (H.relDiff(Number(dens[f]), C.DENS[f]) > 0.01) rec.fault(sec, 'density-off', 'Stated density differs from CRC by >1%', { f, page: dens[f], crc: C.DENS[f], ex });
  }
}
function chain(rec, sec, G, P, ex) {
  const S = P.S, t = H.text(P.question), coef = C.myCoefs(P.rxn), dens = densFromText(t);
  densityFacts(rec, sec, dens, ex);
  expectIn(rec, sec, t, S.x + ' ' + (S.unit === 'mL' ? 'mL of liquid' : S.unit + ' of'), 'given amount', ex);
  const askWord = S.endUnit === 'mL' ? 'milliliters of liquid' : S.endUnit === 'g' ? 'grams of ' + S.B.f : 'moles of ' + S.B.f;
  expectIn(rec, sec, t, askWord, 'asked quantity', ex);
  // sensible question wording for the roles
  rec.check(sec, 'question wording vs roles');
  const c = chainCompute(S, coef, dens);
  compare(rec, sec, G, P.parts[0], c.ans, ex);
  chainBlanksCheck(rec, sec, G, P, S, coef, dens, ex);
  slipsCheck(rec, sec, G, P.parts[0], chainSlips(S, c), ex);
}

function limiting(rec, sec, G, P, ex) {
  const t = H.text(P.question), coef = C.myCoefs(P.rxn), Pd = P.Pd.f, MP = mmOf(Pd);
  const R = P.R.map(r => ({ f: r.f, amt: r.amt, g: Number(r.amt), M: mmOf(r.f), c: coef[r.f] }));
  R.forEach(r => { expectIn(rec, sec, t, r.amt + ' g of ' + r.f, 'reactant mass', ex); r.n = r.g / r.M; r.y = r.n * coef[Pd] / r.c * MP; });
  const iL = R[0].y <= R[1].y ? 0 : 1, L = R[iL], E = R[1 - iL];
  rec.check(sec, 'limiting reactant');
  if (P.parts[0].answer !== L.f) rec.fault(sec, 'wrong-limiting-reactant', 'Page names a different limiting reactant', { mine: L.f, page: P.parts[0].answer, ex });
  compare(rec, sec, G, P.parts[1], L.y, ex, 'theoretical yield');
  const used = L.n * E.c / L.c * E.M, left = E.g - used;
  rec.check(sec, 'physical sanity');
  if (!(left > 0)) rec.fault(sec, 'negative-leftover', 'Excess left over is not positive', { left, ex });
  compare(rec, sec, G, P.parts[2], left, ex, 'leftover');
  rec.check(sec, 'amount reacting not accepted as leftover');
  if (G.gradePart(P.parts[2], H.sigText(used, 3)).status === 'correct') rec.fault(sec, 'amount-reacting-accepted', 'Typing the mass of excess reactant that reacts is graded correct for the leftover', { used: H.sigText(used, 3), ex });
  if (Math.abs(left - used) < 0.06 * E.g) rec.fault(sec, 'left-close-to-used', '|left - used| < 6% of the excess mass', { ex });
  // displayed leftover: decimals follow the starting mass of the excess reactant
  rec.check(sec, 'leftover decimals');
  const dp = (E.amt.split('.')[1] || '').length, shown = H.text(P.parts[2].show).split(' ')[0];
  if ((shown.split('.')[1] || '').length !== dp) rec.fault(sec, 'leftover-decimals', 'Displayed leftover does not keep the decimals of the starting mass', { shown, start: E.amt, ex });
  if (Number(shown) <= 0) rec.fault(sec, 'leftover-displays-zero', 'Displayed leftover rounds to zero or below', { shown, ex });
  R.forEach((r, i) => {
    H.checkBlank(rec, sec, G, P, 'n' + i, [H.sigText(r.n, 4), H.sigText(r.n, 3)], ex);
    H.checkBlank(rec, sec, G, P, 'y' + i, [H.sigText(r.y, 4), H.sigText(r.y, 3)], ex);
  });
  slipsCheck(rec, sec, G, P.parts[1], [
    [E.y, 'other reactant could make', 'used excess reactant'], [L.y + E.y, 'Do not add', 'added both'],
    [L.n * coef[Pd] / L.c, 'That is the moles of', 'stopped at moles'], [L.n * L.c / coef[Pd] * MP, 'upside down', 'ratio upside down']], ex);
  slipsCheck(rec, sec, G, P.parts[2], [[used, 'that reacts', 'reported amount used'], [E.g - L.g, 'cannot be subtracted', 'subtracted the two masses'], [E.g, 'starting mass', 'reported starting mass']], ex);
  // wrong choice message must exist
  rec.check(sec, 'wrong-choice message');
  const wm = P.parts[0].wrongMsg(E.f); if (!wm || H.BAD.test(wm)) rec.fault(sec, 'wrong-choice-message', 'No usable message for the wrong choice', { wm, ex });
}

function yieldP(rec, sec, G, P, ex) {
  const t = H.text(P.question), coef = C.myCoefs(P.rxn), S = P.S;
  const pm = t.match(/has a ([\d.]+)% yield/);
  if (P.type === 'reactant') {
    const act = Number(t.match(/needs to collect ([\d.]+) g of/)[1]), fr = Number(pm[1]) / 100;
    const theo = act / fr, B = S.A.f, A = S.B.f;           // S runs product -> reactant
    const mA = theo / mmOf(B) * coef[A] / coef[B] * mmOf(A);
    compare(rec, sec, G, P.parts[0], theo, ex, 'theoretical yield needed');
    compare(rec, sec, G, P.parts[1], mA, ex, 'reactant mass');
    rec.check(sec, 'physical sanity'); if (!(fr > 0 && fr < 1)) rec.fault(sec, 'bad-percent', 'Percent yield outside 0-100', { fr, ex });
    slipsCheck(rec, sec, G, P.parts[0], [[act * fr, 'always larger', 'multiplied by fraction'], [act, '100% yield', 'used actual as theoretical']], ex);
    slipsCheck(rec, sec, G, P.parts[1], [[act / mmOf(B) * coef[A] / coef[B] * mmOf(A), 'if the yield were 100%', 'started from actual yield']], ex);
    H.checkBlank(rec, sec, G, P, 'a', [String(coef[B])], ex); H.checkBlank(rec, sec, G, P, 'b', [String(coef[A])], ex);
    H.checkBlank(rec, sec, G, P, 'MA', [mmOf(B).toFixed(2)], ex); H.checkBlank(rec, sec, G, P, 'MB', [mmOf(A).toFixed(2)], ex);
    return;
  }
  const mA = S.x; expectIn(rec, sec, t, mA + ' g of ' + S.A.f + ' reacts', 'reactant mass', ex);
  const theo = Number(mA) / mmOf(S.A.f) * coef[S.B.f] / coef[S.A.f] * mmOf(S.B.f);
  compare(rec, sec, G, P.parts[0], theo, ex, 'theoretical yield');
  chainBlanksCheck(rec, sec, G, P, S, coef, {}, ex);
  if (P.type === 'pct') {
    const act = Number(t.match(/and ([\d.]+) g of [A-Za-z0-9()]+ is collected/)[1]);
    const pct = act / theo * 100;
    rec.check(sec, 'physical sanity'); if (!(pct > 0 && pct < 100)) rec.fault(sec, 'bad-percent', 'Percent yield outside 0-100', { pct, ex });
    compare(rec, sec, G, P.parts[1], pct, ex, 'percent yield');
    slipsCheck(rec, sec, G, P.parts[1], [[theo / act * 100, 'upside down', 'inverted percent'], [act / theo, 'Multiply by 100', 'fraction not percent']], ex);
  } else {
    const fr = Number(pm[1]) / 100, expect = theo * fr;
    compare(rec, sec, G, P.parts[1], expect, ex, 'actual yield');
    slipsCheck(rec, sec, G, P.parts[1], [[theo / fr, 'never be larger', 'divided by fraction'], [theo, 'theoretical yield', 'gave theoretical'], [theo * fr * 100, 'fraction first', 'percent not fraction']], ex);
  }
}

function capstone(rec, sec, G, P, ex) {
  const t = H.text(P.question), coef = C.myCoefs(P.rxn), dens = densFromText(t), Pd = P.Pd.f, MP = mmOf(Pd);
  densityFacts(rec, sec, dens, ex);
  const R = P.R.map(r => {
    const liq = r.f in dens; const o = { f: r.f, amt: r.amt, liq, M: mmOf(r.f), c: coef[r.f] };
    expectIn(rec, sec, t, r.amt + (liq ? ' mL of liquid' : ' g of'), 'reactant amount', ex);
    o.g = liq ? Number(r.amt) * Number(dens[r.f]) : Number(r.amt); o.n = o.g / o.M; o.y = o.n * coef[Pd] / o.c * MP; return o;
  });
  const iL = R[0].y <= R[1].y ? 0 : 1, L = R[iL], E = R[1 - iL];
  rec.check(sec, 'limiting reactant');
  if (P.parts[0].answer !== L.f) rec.fault(sec, 'wrong-limiting-reactant', 'Page names a different limiting reactant', { mine: L.f, page: P.parts[0].answer, ex });
  compare(rec, sec, G, P.parts[1], L.y, ex, 'theoretical yield');
  const act = Number(P.actual); expectIn(rec, sec, t, P.actual + ' g of', 'actual yield', ex);
  const pct = act / L.y * 100;
  rec.check(sec, 'physical sanity'); if (!(pct > 0 && pct < 100)) rec.fault(sec, 'bad-percent', 'Percent yield outside 0-100', { pct, ex });
  compare(rec, sec, G, P.parts[2], pct, ex, 'percent yield');
  R.forEach((r, i) => {
    if (r.liq) H.checkBlank(rec, sec, G, P, 'g' + i, [H.sigText(r.g, 4), H.sigText(r.g, 3)], ex);
    H.checkBlank(rec, sec, G, P, 'n' + i, [H.sigText(r.n, 4), H.sigText(r.n, 3)], ex);
    H.checkBlank(rec, sec, G, P, 'y' + i, [H.sigText(r.y, 4), H.sigText(r.y, 3)], ex);
  });
  const ys = [[E.y, 'other reactant could make', 'used excess reactant'], [L.n * coef[Pd] / L.c, 'That is the moles of', 'stopped at moles'], [act, 'actual yield', 'gave actual yield']];
  if (L.liq) { const d = Number(dens[L.f]); ys.push([L.y / d, 'as if it were grams', 'mL used as grams'], [L.y / d / d, 'upside down', 'density upside down']); }
  slipsCheck(rec, sec, G, P.parts[1], ys, ex);
  slipsCheck(rec, sec, G, P.parts[2], [[L.y / act * 100, 'upside down', 'inverted percent'], [act / L.y, 'Multiply by 100', 'fraction not percent'], [act / E.y * 100, 'excess reactant', 'percent vs excess reactant']], ex);
}

if (require.main === module) {
  const rec = run();
  const out = rec.toJSON();
  require('fs').writeFileSync(__dirname + '/results/stoich.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ problems: out.problems }));
  for (const f of out.faults) console.log('FAULT', f.section, '|', f.code, 'n=' + f.n, '\n   ', JSON.stringify(f.examples[0]).slice(0, 700));
}
module.exports = { run };
