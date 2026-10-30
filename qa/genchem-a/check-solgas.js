// Generator audit: general-chemistry/solutions-and-gases-study-guide.html
'use strict';
const { loadGuide } = require('./lib/load');
const C = require('./lib/chem');
const H = require('./lib/harness');
const X = require('./lib/solsec');

const FILE = 'general-chemistry/solutions-and-gases-study-guide.html';
const N = +(process.argv[2] || 3000);
const SEED = +(process.argv[3] || 20261102);

function run() {
  const { G, ctl } = loadGuide(FILE, SEED);
  const rec = new H.Recorder(FILE);
  for (const kind of ['molarity', 'dilution', 'solstoich', 'mix', 'gaslaw', 'gasstoich', 'solgas', 'capstone']) {
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
        else if (kind === 'gaslaw') gaslaw(rec, sec, G, P, ex);
        else if (kind === 'capstone') capstone(rec, sec, G, P, ex);
        else X.chainProblem(rec, sec, G, P, ex);
      } catch (e) { rec.fault(sec, 'audit-exception', 'Audit code failed on this problem', { err: String(e && e.stack).slice(0, 500), ex }); }
    }
  }
  return rec;
}
const eqText = r => r.r.map(e => (e[0] > 1 ? e[0] + ' ' : '') + e[1]).join(' + ') + ' -> ' + r.p.map(e => (e[0] > 1 ? e[0] + ' ' : '') + e[1]).join(' + ');

function parseCond(t) {
  if (/at STP \(0 °C and 1\.00 atm\)/.test(t)) return { T: '0.0', P: '1.00', Pu: 'atm', stp: true };
  const m = t.match(/at ([\d.]+) °C and ([\d.]+) (atm|mmHg|kPa)/);
  return m ? { T: m[1], P: m[2], Pu: m[3] } : null;
}
function gaslaw(rec, sec, G, P, ex) {
  const t = H.text(P.question), f = P.gas, part = P.parts[0], M = C.mm(f);
  const num = re => { const m = t.match(re); if (!m) throw new Error('parse ' + re + ' in ' + t); return m.slice(1); };
  const g = parseCond(t) || {};
  let mine, sl = [], box;
  const conv = () => X.gasIn(g);
  switch (P.type) {
    case 'V': case 'Vg': {
      const [x] = num(P.type === 'V' ? /does ([\d.]+) mol of/ : /does ([\d.]+) g of/);
      const n = P.type === 'V' ? Number(x) : Number(x) / M, c = conv();
      mine = n * C.R * c.TK / c.Patm;
      if (P.type === 'Vg') { sl.push([mine * M, 'grams were used', 'grams as moles']); H.checkBlank(rec, sec, G, P, 'n', [H.sigText(n, 4), H.sigText(n, 3)], ex); }
      else H.checkBlank(rec, sec, G, P, 'n', [x], ex);
      if (Number(g.T) > 0) sl.push([mine * Number(g.T) / c.TK, 'left in °C', '°C']);
      if (g.Pu !== 'atm') sl.push([mine / C.ATM[g.Pu], 'pressure was left in', 'pressure unit']);
      if (!g.stp) sl.push([n * 22.414, 'only applies at STP', '22.4 L/mol']);
      gasPhys(rec, sec, f, c.TK, c.Patm, ex); break;
    }
    case 'P': {
      const [V, Vu, n, T] = num(/A ([\d.]+) (L|mL) container holds ([\d.]+) mol of .* at ([\d.]+) °C/); g.V = V; g.Vu = Vu; g.T = T; const c = conv();
      mine = Number(n) * C.R * c.TK / c.VL;
      if (Number(T) > 0) sl.push([mine * Number(T) / c.TK, 'left in °C', '°C']);
      if (Vu === 'mL') sl.push([mine / 1000, 'left in milliliters', 'mL']);
      H.checkBlank(rec, sec, G, P, 'n', [n], ex);
      gasPhys(rec, sec, f, c.TK, mine, ex); break;
    }
    case 'n': case 'g': case 'MM': {
      let m0 = null, V, Vu;
      if (P.type === 'MM') [m0, V, Vu] = num(/A ([\d.]+) g sample of an unknown gas occupies ([\d.]+) (L|mL) at/);
      else [V, Vu] = num(/in a ([\d.]+) (L|mL) container at/);
      g.V = V; g.Vu = Vu; const c = conv(), n = c.Patm * c.VL / (C.R * c.TK);
      mine = P.type === 'n' ? n : P.type === 'g' ? n * M : Number(m0) / n;
      const up = P.type === 'MM' ? -1 : 1;     // MM goes the other way
      if (Number(g.T) > 0) sl.push([mine * Math.pow(c.TK / Number(g.T), up), 'left in °C', '°C']);
      if (g.Pu !== 'atm') sl.push([mine * Math.pow(C.ATM[g.Pu], up), 'pressure was left in', 'pressure unit']);
      if (Vu === 'mL') sl.push([mine * Math.pow(1000, up), 'left in milliliters', 'mL']);
      if (P.type === 'g') sl.push([n, 'That is the moles', 'stopped at moles']);
      if (P.type === 'MM') { sl.push([n / Number(m0), 'upside down', 'inverted']); rec.check(sec, 'unknown gas molar mass matches the gas'); if (H.relDiff(mine, M) > 0.01) rec.fault(sec, 'unknown-gas-mm', 'Computed molar mass does not match any listed gas', { mine, M, ex }); }
      gasPhys(rec, sec, f, c.TK, c.Patm, ex); break;
    }
    case 'T': {
      const [V, Vu, n, Pv, Pu] = num(/A ([\d.]+) (L|mL) container holds ([\d.]+) mol of .* at a pressure of ([\d.]+) (atm|mmHg|kPa)/);
      g.V = V; g.Vu = Vu; g.P = Pv; g.Pu = Pu; const c = conv();
      mine = c.Patm * c.VL / (Number(n) * C.R);
      if (Pu !== 'atm') sl.push([mine * C.ATM[Pu], 'pressure was left in', 'pressure unit']);
      if (Vu === 'mL') sl.push([mine * 1000, 'left in milliliters', 'mL']);
      if (mine - 273.15 > 5) sl.push([mine - 273.15, 'in °C', 'reported °C']);
      H.checkBlank(rec, sec, G, P, 'n', [n], ex);
      rec.check(sec, 'physical sanity'); if (mine < 100 || mine > 2000) rec.fault(sec, 'odd-temperature', 'Computed temperature outside 100–2000 K', { mine, ex });
      gasPhys(rec, sec, f, mine, c.Patm, ex); break;
    }
    default: rec.fault(sec, 'unknown-type', '', { type: P.type, ex }); return;
  }
  const c = X.gasIn(g);
  if (P.blanks.P) H.checkBlank(rec, sec, G, P, 'P', [H.sigText(c.Patm, 4), H.sigText(c.Patm, 3)], ex);
  if (P.blanks.V) H.checkBlank(rec, sec, G, P, 'V', [String(c.VL)], ex);
  if (P.blanks.T) H.checkBlank(rec, sec, G, P, 'T', [c.TK.toFixed(2), String(Math.round(Number(g.T)) + 273)], ex);
  rec.check(sec, 'name matches formula');
  if (P.type !== 'MM' && !(C.NAMES[f] || []).some(nm => t.toLowerCase().indexOf(nm + ' (' + f.toLowerCase() + ')') >= 0)) rec.fault(sec, 'name-formula-mismatch', '', { f, ex });
  X.compare(rec, sec, G, part, mine, ex);
  X.slipsCheck(rec, sec, G, part, sl, ex);
}
function gasPhys(rec, sec, f, TK, Patm, ex) { X.gasPhys(rec, sec, f, TK, Patm, ex, 'gas law'); }

function capstone(rec, sec, G, P, ex) {
  const t = H.text(P.question), coef = X.reaction(rec, sec, P.rxn, ex); if (!coef) return;
  const [So, Ac] = P.R, Gf = P.G.f;
  X.expectIn(rec, sec, t, 'adds ' + So.amt + ' g of ' + So.f + ' to ' + Ac.v + ' mL of ' + Ac.Mo + ' M ' + Ac.f, 'reactants', ex);
  X.solubility(rec, sec, Ac.f, Number(Ac.Mo), ex, 'acid');
  const g = parseCond(t);
  const R = [{ f: So.f, n: Number(So.amt) / C.mm(So.f) }, { f: Ac.f, n: Number(Ac.v) / 1000 * Number(Ac.Mo) }];
  R.forEach(r => { r.c = coef[r.f]; r.yn = r.n * coef[Gf] / r.c; });
  const iL = R[0].yn <= R[1].yn ? 0 : 1, L = R[iL], E = R[1 - iL];
  rec.check(sec, 'limiting reactant');
  if (P.parts[0].answer !== L.f) rec.fault(sec, 'wrong-limiting-reactant', '', { mine: L.f, page: P.parts[0].answer, ex });
  const c = X.gasIn(g), RTP = C.R * c.TK / c.Patm, Vt = L.yn * RTP;
  X.gasPhys(rec, sec, Gf, c.TK, c.Patm, ex, 'collected gas');
  X.compare(rec, sec, G, P.parts[1], Vt, ex, 'theoretical volume');
  const am = t.match(/its volume is ([\d.]+) L/); const act = Number(am[1]); const pct = act / Vt * 100;
  rec.check(sec, 'physical sanity'); if (!(pct > 0 && pct < 100)) rec.fault(sec, 'bad-percent', '', { pct, ex });
  X.compare(rec, sec, G, P.parts[2], pct, ex, 'percent yield');
  R.forEach((r, i) => { H.checkBlank(rec, sec, G, P, 'n' + i, [H.sigText(r.n, 4), H.sigText(r.n, 3)], ex); H.checkBlank(rec, sec, G, P, 'y' + i, [H.sigText(r.yn, 4), H.sigText(r.yn, 3)], ex); });
  H.checkBlank(rec, sec, G, P, 'TB', [c.TK.toFixed(2), String(Math.round(Number(g.T)) + 273)], ex);
  H.checkBlank(rec, sec, G, P, 'PB', [H.sigText(c.Patm, 4), H.sigText(c.Patm, 3)], ex);
  const sl = [[E.yn * RTP, 'other reactant could make', 'used excess reactant'], [L.yn, 'That is the moles', 'stopped at moles'], [act, 'actual volume', 'gave actual']];
  if (Number(g.T) > 0) sl.push([Vt * Number(g.T) / c.TK, 'left in °C', '°C']);
  if (g.Pu !== 'atm') sl.push([Vt / C.ATM[g.Pu], 'pressure was left in', 'pressure unit']);
  sl.push([L.yn * 22.414, 'only applies at STP', '22.4 L/mol']);
  X.slipsCheck(rec, sec, G, P.parts[1], sl, ex);
  rec.check(sec, 'collected volume gets the actual-yield message');
  { const r = G.gradePart(P.parts[1], P.actual); if (!/actual volume collected/.test(H.text(r.msg || ''))) rec.fault(sec, 'actual-volume-slip-message', 'Typing the collected volume does not get the actual-yield message', { shown: H.text(r.msg || ''), ex }); }
  X.slipsCheck(rec, sec, G, P.parts[2], [[Vt / act * 100, 'upside down', 'inverted'], [act / Vt, 'Multiply by 100', 'fraction'], [act / (E.yn * RTP) * 100, 'excess reactant', 'vs excess']], ex);
}

if (require.main === module) {
  const rec = run();
  const out = rec.toJSON();
  require('fs').writeFileSync(__dirname + '/results/solgas.json', JSON.stringify(out, null, 1));
  console.log('done');
}
module.exports = { run };
