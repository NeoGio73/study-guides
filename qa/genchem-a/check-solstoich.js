// Generator audit: general-chemistry/solution-stoichiometry-study-guide.html
'use strict';
const { loadGuide } = require('./lib/load');
const C = require('./lib/chem');
const H = require('./lib/harness');
const X = require('./lib/solsec');

const FILE = 'general-chemistry/solution-stoichiometry-study-guide.html';
const N = +(process.argv[2] || 3000);
const SEED = +(process.argv[3] || 20261101);

function run() {
  const { G, ctl } = loadGuide(FILE, SEED);
  const rec = new H.Recorder(FILE);
  for (const kind of ['molarity', 'dilution', 'solstoich', 'mix', 'titration']) {
    let prev = null;
    for (let i = 0; i < N; i++) {
      ctl.calls = 0;
      let P;
      try { P = G.makeProblem(kind, prev); }
      catch (e) { rec.fault(kind, 'generator-exception', 'makeProblem threw', { err: String(e && e.message), i }); prev = null; continue; }
      prev = P;
      const sec = kind + (P.type ? ':' + P.type : P.S ? ':' + P.S.from.type + '>' + P.S.to.type : '');
      rec.count(kind); rec.count(sec);
      const ex = { question: H.text(P.question), eq: P.rxn ? eqText(P.rxn) : null, show: P.parts.map(p => H.text(p.show)) };
      try {
        H.genericChecks(rec, sec, G, P, ex);
        if (kind === 'molarity') X.molarity(rec, sec, G, P, ex);
        else if (kind === 'dilution') X.dilution(rec, sec, G, P, ex);
        else if (kind === 'mix') X.mix(rec, sec, G, P, ex);
        else { X.chainProblem(rec, sec, G, P, ex); if (kind === 'titration') titration(rec, sec, G, P, ex); }
      } catch (e) { rec.fault(sec, 'audit-exception', 'Audit code failed on this problem', { err: String(e && e.stack).slice(0, 500), ex }); }
    }
  }
  lab(rec, G, ctl);
  return rec;
}
const eqText = r => r.r.map(e => (e[0] > 1 ? e[0] + ' ' : '') + e[1]).join(' + ') + ' -> ' + r.p.map(e => (e[0] > 1 ? e[0] + ' ' : '') + e[1]).join(' + ');

function titration(rec, sec, G, P, ex) {
  const part = P.parts[0], S = P.S;
  rec.check(sec, 'titration graded to 4 sf');
  if (part.sf !== 4) rec.fault(sec, 'titration-sf', 'Titration answer not graded to 4 sf although buret data have 4', { sf: part.sf, ex });
  // Ba(OH)2 is only slightly soluble
  const baseM = [S.from.f === 'Ba(OH)2' ? S.from.M : null];
  if (S.A.f === 'Ba(OH)2' && S.from.type === 'sol') X.solubility(rec, sec, 'Ba(OH)2', Number(S.from.M), ex, 'Ba(OH)2 given');
  if (S.B.f === 'Ba(OH)2' && S.to.type === 'mL') X.solubility(rec, sec, 'Ba(OH)2', Number(S.to.M), ex, 'Ba(OH)2 titrant');
  if (S.B.f === 'Ba(OH)2' && S.to.type === 'M') X.solubility(rec, sec, 'Ba(OH)2', part.answer, ex, 'Ba(OH)2 computed');
  if (P.type === 'khp') { rec.check(sec, 'KHP molar mass'); if (Math.abs(C.mm('KHC8H4O4') - 204.22) > 0.01) rec.fault(sec, 'khp-mm', '', { ex }); }
}

// The virtual titration: drive makeLab/labLook/labParts like the buttons do (volumes in hundredths of a mL).
function lab(rec, G, ctl) {
  const sec = 'lab';
  let prev = null;
  for (let i = 0; i < N; i++) {
    ctl.calls = 0;
    let L;
    try { L = G.makeLab(prev); } catch (e) { rec.fault(sec, 'generator-exception', 'makeLab threw', { err: String(e.message) }); continue; }
    prev = L; rec.count(sec);
    const coef = C.myCoefs(L.rxn), ratio = coef[L.base.f] / coef[L.acid.f];
    const ex = { acid: L.acid.f, Va: L.Va, Mt: L.Mt, Veq: +L.Veq.toFixed(3), init: L.init };
    rec.check(sec, 'ratio'); if (Math.abs(ratio - L.ratio) > 1e-9) rec.fault(sec, 'lab-ratio', 'Mole ratio differs from mine', { ratio, page: L.ratio, ex });
    const Mtrue = L.Veq / 1000 * Number(L.Mt) / ratio / (Number(L.Va) / 1000);
    rec.check(sec, 'true molarity'); if (H.relDiff(L.Mtrue, Mtrue) > 1e-9) rec.fault(sec, 'lab-true-M', '', { Mtrue, page: L.Mtrue, ex });
    const dEnd = Math.ceil(L.Veq * 100 / 5 - 1e-9) * 5;           // first drop at or past the equivalence point
    rec.check(sec, 'endpoint reachable with one-drop steps');
    if (G.labLook(L, dEnd).key !== 'end') rec.fault(sec, 'endpoint-not-shown', 'First drop past equivalence does not show the endpoint color', { dEnd, key: G.labLook(L, dEnd).key, ex });
    if (G.labLook(L, dEnd - 5).key === 'end') rec.fault(sec, 'endpoint-early', 'Endpoint color shows before the equivalence point', { ex });
    rec.check(sec, 'buret capacity');
    if ((L.init + dEnd) / 100 > 50) rec.fault(sec, 'buret-overflow', 'Endpoint needs more than a 50 mL buret holds', { ex });
    for (const d of [dEnd, dEnd + 5, dEnd + 25, dEnd + 100, dEnd + 500]) {
      if (L.init + d > 5000) continue;
      const parts = G.labParts(L, d);
      const P = { parts, question: '', solution: G.labSolution(L, d) };
      const exd = Object.assign({ d, look: G.labLook(L, d).key }, ex);
      H.genericChecks(rec, sec, G, P, exd);
      const vDel = d / 100, M = vDel / 1000 * Number(L.Mt) / ratio / (Number(L.Va) / 1000);
      X.compare(rec, sec, G, parts[0], vDel, exd, 'volume delivered');
      X.compare(rec, sec, G, parts[1], M, exd, 'acid molarity');
      // buret readings typed exactly as displayed
      const vFinal = (L.init + d) / 100;
      X.slipsCheck(rec, sec, G, parts[0], [[vFinal, 'final buret reading', 'used final reading']], exd);
      const sl = [[M * vFinal / vDel, 'final buret reading', 'final reading as volume'], [M * 1000, 'Convert the milliliters', 'mL not converted']];
      if (ratio !== 1) sl.push([M * ratio, '1:1 mole ratio was assumed', '1:1 ratio'], [M * ratio * ratio, 'upside down', 'ratio upside down']);
      X.slipsCheck(rec, sec, G, parts[1], sl, exd);
      rec.check(sec, 'molarity sf'); if (parts[1].sf !== 4) rec.fault(sec, 'lab-sf', 'Lab molarity not graded to 4 sf', { sf: parts[1].sf, exd });
    }
  }
}

if (require.main === module) {
  const rec = run();
  const out = rec.toJSON();
  require('fs').writeFileSync(__dirname + '/results/solstoich.json', JSON.stringify(out, null, 1));
  console.log('done');
}
module.exports = { run };
