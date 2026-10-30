// Generator audit: general-chemistry/mole-and-molar-mass-study-guide.html
'use strict';
const { loadGuide } = require('./lib/load');
const C = require('./lib/chem');
const H = require('./lib/harness');

const FILE = 'general-chemistry/mole-and-molar-mass-study-guide.html';
const N = +(process.argv[2] || 3000);
const SEED = +(process.argv[3] || 20261030);

function run() {
  const { G, ctl } = loadGuide(FILE, SEED);
  const rec = new H.Recorder(FILE);
  const kinds = ['molar', 'particles', 'mass', 'twostep', 'inside', 'mixed'];
  for (const kind of kinds) {
    let prev = null;
    for (let i = 0; i < N; i++) {
      ctl.calls = 0;
      let P;
      try { P = G.makeProblem(kind, prev); }
      catch (e) { rec.fault(kind, 'generator-exception', 'makeProblem threw', { err: String(e && e.message), i }); prev = null; continue; }
      prev = P;
      const sec = kind + (P.type ? ':' + P.type : '');
      rec.count(kind); rec.count(sec);
      const ex = { question: H.text(P.question), show: P.parts.map(p => H.text(p.show)) };
      try {
        H.genericChecks(rec, sec, G, P, ex);
        independent(rec, sec, G, P, ex);
      } catch (e) { rec.fault(sec, 'audit-exception', 'Audit code failed on this problem', { err: String(e && e.stack).slice(0, 400), ex }); }
    }
  }
  return rec;
}

function num(re, t, ex) { const m = t.match(re); if (!m) throw new Error('could not parse given value with ' + re + ' from: ' + t); return Number(m[1]); }

function independent(rec, sec, G, P, ex) {
  const f = P.f, t = H.text(P.question), te = H.eNote(P.question);
  // Wording checks added for the fix round (items 35)
  rec.check(sec, 'no "1 molecules"/"1 formula units"');
  for (const s of [P.guided, P.solution].concat(P.hints)) { const m = H.text(s).match(/\b1 (molecules|formula units|atoms)\b/); if (m) { rec.fault(sec, 'plural-after-1', 'Text says "1 ' + m[1] + '"', { ex }); break; } }
  if (P.type === 'ion') { rec.check(sec, 'ion route says ions'); if (!/× ions in the formula/.test(H.text(P.guided)) || /× atoms in the formula/.test(H.text(P.guided))) rec.fault(sec, 'ion-route-wording', 'Ion route does not say "× ions in the formula"', { ex }); }
  if (P.type === 'molar' && f === 'CH3COOH') { rec.check(sec, 'CH3COOH hint'); if (/One element appears/.test(H.text(P.hints[0]))) rec.fault(sec, 'ch3cooh-hint', 'Hint says one element repeats', { ex }); }
  const part = P.parts[0];
  // Formula and name shown in the question match my tables.
  rec.check(sec, 'name matches formula');
  const nm = (C.NAMES[f] || []);
  if (!nm.some(n => t.toLowerCase().indexOf(n + ' (' + f.toLowerCase() + ')') >= 0))
    rec.fault(sec, 'name-formula-mismatch', 'Name in question not recognised for this formula', { f, ex });
  const A = C.atoms(f), M = C.mm(f), elems = Object.keys(A);
  const totAtoms = elems.reduce((s, e) => s + A[e], 0);
  let mine, slips = [];
  const type = P.type;
  const elemFromText = () => {
    const m = t.match(/How many (?:moles of |grams of )?([a-z]+) atoms|How many grams of ([a-z]+) are|contains [\d.]+ g of ([a-z]+)\?/);
    const name = m && (m[1] || m[2] || m[3]); const e = C.NAME2SYM[name];
    if (!e) throw new Error('no element in ' + t); return e;
  };
  if (type === 'molar') {
    mine = M;
    const naive = elems.reduce((s, e) => s + C.AW[e], 0);
    slips.push([naive, 'counted only once', 'each element counted once']);
    if (f.indexOf('(') >= 0) slips.push([C.mm(f.replace(/\(([^()]+)\)\d*/g, '$1')), 'outside the parentheses', 'parentheses subscript ignored']);
    const e2 = elems.find(e => A[e] > 1);
    if (e2) slips.push([M - C.AW[e2], 'an atom is missing', 'one atom missing']);
    // the answer is to two decimals
    rec.check(sec, 'my 2-decimal value accepted');
    const r = G.gradePart(part, mine.toFixed(2));
    if (r.status !== 'correct') rec.fault(sec, 'my-answer-rejected', 'My independently computed molar mass (2 decimals) is not accepted', { mine: mine.toFixed(2), page: part.answer, ex });
    // guided blanks
    G.composition(f).forEach(([e], i) => {
      H.checkBlank(rec, sec, G, P, 'c' + i, [String(A[e])], ex);
      H.checkBlank(rec, sec, G, P, 's' + i, [(A[e] * C.AW[e]).toFixed(3), (A[e] * C.AW[e]).toFixed(2)], ex);
    });
  } else {
    let x, e = null, cnt = null;
    const parse = re => num(re, te, ex);
    // value(env) recomputes the answer with a set of constants: env = {M: molar mass of f, aw: element mass, NA}
    let value;
    switch (type) {
      case 'n2N': x = parse(/in ([\d.]+) mol of/); value = v => x * v.NA; slips.push([x / C.NA, 'It looks like you divided', 'divided by NA']); break;
      case 'N2n': x = parse(/contains ([\d.]+e\d+) /); value = v => x / v.NA; slips.push([x * C.NA, 'It looks like you multiplied', 'multiplied by NA']); break;
      case 'n2g': x = parse(/of ([\d.]+) mol of/); value = v => x * v.M; slips.push([x / M, 'It looks like you divided', 'divided by M']); break;
      case 'g2n': x = parse(/are in ([\d.]+) g of/); value = v => x / v.M; slips.push([x * M, 'It looks like you multiplied', 'multiplied by M']);
        { const naive = elems.reduce((s, q) => s + C.AW[q], 0); if (Math.abs(naive - M) > 0.01) slips.push([x / naive, 'counted only once', 'naive molar mass']); } break;
      case 'g2N': x = parse(/are in ([\d.]+) g of/); value = v => x / v.M * v.NA;
        slips.push([x / M, 'That is the number of moles', 'stopped at moles']); slips.push([x * C.NA, 'needs moles', 'skipped molar mass']); break;
      case 'N2g': x = parse(/of ([\d.]+e\d+) /); value = v => x / v.NA * v.M; slips.push([x / C.NA, 'That is the number of moles', 'stopped at moles']); break;
      case 'one': value = v => v.M / v.NA; break;
      case 'n2ne': x = parse(/in ([\d.]+) mol of/); e = elemFromText(); value = v => x * A[e]; break;
      case 'n2Ne': x = parse(/in ([\d.]+) mol of/); e = elemFromText(); value = v => x * A[e] * v.NA;
        if (A[e] > 1) slips.push([x * C.NA, 'would be right if each', 'forgot subscript']); break;
      case 'N2Ne': x = parse(/are in ([\d.]+e\d+) /); e = elemFromText(); value = v => x * A[e];
        slips.push([x * A[e] / C.NA, 'not needed here', 'used Avogadro']); break;
      case 'g2Ne': x = parse(/are in ([\d.]+) g of/); e = elemFromText(); value = v => x / v.M * A[e] * v.NA;
        if (A[e] > 1) slips.push([x / M * C.NA, 'would be right if each', 'forgot subscript']); break;
      case 'g2ge': x = parse(/are in ([\d.]+) g of/); e = elemFromText(); value = v => x / v.M * A[e] * v.aw(e);
        if (A[e] > 1) slips.push([x / M * C.AW[e], 'would be right if each', 'forgot subscript']);
        H.checkBlank(rec, sec, G, P, 'ME', [C.AW[e].toFixed(2), String(C.AW[e])], ex); break;
      case 'ge2g': x = parse(/contains ([\d.]+) g of/); e = elemFromText(); value = v => x / v.aw(e) / A[e] * v.M;
        if (A[e] > 1) slips.push([x / C.AW[e] * A[e] * M, 'so divide by', 'multiplied by subscript']);
        H.checkBlank(rec, sec, G, P, 'ME', [C.AW[e].toFixed(2), String(C.AW[e])], ex); break;
      case 'total': x = parse(/in ([\d.]+) mol of/); value = v => x * totAtoms * v.NA; slips.push([x * C.NA, 'That is the number of', 'forgot atoms per unit']); break;
      case 'ion': {
        x = parse(/are in ([\d.]+) g of/);
        const ionName = (t.match(/How many ([a-z]+) ions/) || [])[1];
        cnt = C.IONCOUNT[f] && C.IONCOUNT[f][ionName];
        if (!cnt) { rec.fault(sec, 'ion-unknown', 'Ion not in my table', { f, ionName, ex }); return; }
        value = v => x / v.M * cnt * v.NA;
        slips.push([x / M * C.NA, 'would be right if each', 'forgot ion count']);
        H.checkBlank(rec, sec, G, P, 'sp', [String(cnt)], ex); break;
      }
      default: rec.fault(sec, 'unknown-type', 'Audit does not know this type', { type, ex }); return;
    }
    mine = value({ M, aw: q => C.AW[q], NA: C.NA });
    // The same calculation with the data the page itself lists (atomic masses as printed, NA = 6.022e23, no rounding).
    const listed = value({ M: C.mmWith(f, G.AM), aw: q => Number(G.AM[q]), NA: 6.022e23 });
    // Blanks that every chain has.
    if (P.blanks.MM) H.checkBlank(rec, sec, G, P, 'MM', [M.toFixed(2)], ex);
    if (P.blanks.NA) H.checkBlank(rec, sec, G, P, 'NA', ['6.022e23', '6.022 × 1023', '6.02e23', '6.022 x 10^23'], ex);
    if (P.blanks.sw) H.checkBlank(rec, sec, G, P, 'sw', ['1'], ex);
    if (P.blanks.sp && type !== 'ion') {
      const k = type === 'total' ? totAtoms : A[elemFromText()];
      H.checkBlank(rec, sec, G, P, 'sp', [String(k)], ex);
    }
    // My 3-sf answer must be accepted, and must agree with the page's value.
    rec.check(sec, 'independent recompute');
    const d = H.relDiff(part.answer, mine);
    if (d > 0.003) rec.fault(sec, 'answer-differs-from-independent', 'Page answer differs from my recomputation by more than 0.3%', { mine, page: part.answer, rel: d, ex });
    for (const typed of [H.sigText(mine, 3)]) {
      const r = G.gradePart(part, typed);
      if (r.status !== 'correct') rec.fault(sec, 'my-answer-rejected', 'My independently computed 3-sf answer is not accepted', { typed, status: r.status, msg: H.text(r.msg || ''), page: part.answer, ex });
    }
    rec.check(sec, 'displayed digits agree with the page’s own listed data');
    const shownV = Number(H.eNote(part.show).split(' ')[0]), ulp = Math.pow(10, Math.floor(Math.log10(listed)) - 2);
    // Ignore ordinary rounding-boundary flips; flag only when the page's own value is >0.1% from the listed-data value.
    if (Math.abs(shownV - listed) > 0.55 * ulp && H.relDiff(part.answer, listed) > 0.001)
      rec.fault(sec, 'displayed-last-digit-off', 'Displayed 3-sf answer differs from the value computed with the atomic masses and N_A the page lists (page rounds molar/atomic masses to 2 decimals first)',
        { listedData: H.sigText(listed, 4), shown: H.text(part.show), element: e, ex });
    if (part.sf !== 3) rec.fault(sec, 'sf-not-3', 'Answer not graded to 3 sf although data have 3', { sf: part.sf, ex });
  }
  if (type === 'molar') {
    rec.check(sec, 'independent recompute');
    if (Math.abs(part.answer - mine) > 0.011) rec.fault(sec, 'answer-differs-from-independent', 'Molar mass differs from mine', { mine, page: part.answer, ex });
  }
  // Spot-check named slips, skipping a slip whose value coincides with another named slip here.
  slips.forEach(([v, expect, name], i) => {
    if (slips.some(([w], j) => j !== i && H.relDiff(v, w) < 0.012)) return;
    H.checkSlip(rec, sec, G, part, v, expect, name, ex);
  });
}

if (require.main === module) {
  const rec = run();
  const out = rec.toJSON();
  require('fs').writeFileSync(__dirname + '/results/mole.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ problems: out.problems }, null, 0));
  for (const f of out.faults) console.log('FAULT', f.section, '|', f.code, 'n=' + f.n, '\n   ', JSON.stringify(f.examples[0]).slice(0, 600));
}
module.exports = { run };
