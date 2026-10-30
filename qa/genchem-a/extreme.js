// Boundary pass: the same generators driven by a random source that often returns 0, 0.5 or the largest
// value below 1, to catch out-of-table picks, empty strings, zero values and loops that never finish.
'use strict';
const { loadGuide } = require('./lib/load');
const H = require('./lib/harness');
const N = +(process.argv[2] || 3000);
const GUIDES = [
  ['general-chemistry/mole-and-molar-mass-study-guide.html', ['molar', 'particles', 'mass', 'twostep', 'inside', 'mixed'], 'P'],
  ['general-chemistry/stoichiometry-study-guide.html', ['molmol', 'massmass', 'density', 'limiting', 'yield', 'capstone'], 'rxn'],
  ['general-chemistry/solution-stoichiometry-study-guide.html', ['molarity', 'dilution', 'solstoich', 'mix', 'titration'], 'P'],
  ['general-chemistry/solutions-and-gases-study-guide.html', ['molarity', 'dilution', 'solstoich', 'mix', 'gaslaw', 'gasstoich', 'solgas', 'capstone'], 'P']
];
const out = [];
for (const [file, kinds, prevMode] of GUIDES) {
  const { G, ctl } = loadGuide(file, 99, { extreme: true });
  const rec = new H.Recorder(file + ' (boundary RNG)');
  for (const kind of kinds) {
    let prev = null;
    for (let i = 0; i < N; i++) {
      ctl.calls = 0;
      let P;
      try { P = G.makeProblem(kind, prevMode === 'rxn' ? prev && prev.rxn : prev); }
      catch (e) { rec.fault(kind, 'generator-exception', String(e.message).slice(0, 200), { i }); prev = null; continue; }
      prev = P; rec.count(kind); rec.check(kind, 'calls', ctl.calls);
      try { H.genericChecks(rec, kind, G, P, { question: H.text(P.question), show: P.parts.map(p => H.text(p.show)) }); }
      catch (e) { rec.fault(kind, 'audit-exception', String(e.stack).slice(0, 300), {}); }
    }
  }
  if (G.makeLab) {
    let prev = null;
    for (let i = 0; i < N; i++) {
      ctl.calls = 0;
      try { const L = G.makeLab(prev); prev = L; rec.count('lab');
        const d = Math.ceil(L.Veq * 100 / 5 - 1e-9) * 5; const parts = G.labParts(L, d);
        H.genericChecks(rec, 'lab', G, { parts, question: '', solution: G.labSolution(L, d) }, { Veq: L.Veq, init: L.init });
      } catch (e) { rec.fault('lab', 'generator-exception', String(e.message), {}); }
    }
  }
  const j = rec.toJSON();
  // drop slip-shadow notes here; this pass is about crashes and bad values
  j.faults = j.faults.filter(f => !/^slip-message-shadowed/.test(f.code));
  out.push(j);
  console.log(file, JSON.stringify(j.problems), 'faults:', j.faults.map(f => f.section + ' ' + f.code + ' n=' + f.n).join('; ') || 'none');
}
require('fs').writeFileSync(__dirname + '/results/extreme.json', JSON.stringify(out, null, 1));
