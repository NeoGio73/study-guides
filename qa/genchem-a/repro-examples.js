// Concrete reproductions of the grading findings, using the guides' own functions (seeded, so repeatable).
'use strict';
const { loadGuide } = require('./lib/load');
const H = require('./lib/harness');
const out = {};
{ // P blank rejects a pressure correctly rounded to 3 sf
  const { G } = loadGuide('general-chemistry/solutions-and-gases-study-guide.html', 11);
  for (const kind of ['gaslaw', 'capstone']) {
    let n = 0, rej = 0, ex = null;
    for (let i = 0; i < 5000; i++) {
      const P = G.makeProblem(kind, null); const b = P.blanks.P || P.blanks.PB; if (!b) continue; n++;
      const typed = b.want.toPrecision(3);
      if (!H.blankOK(G, b, typed)) { rej++; ex = ex || { question: H.text(P.question), typed, want: b.want, tol: b.tol }; }
    }
    out['P-blank ' + kind] = { problemsWithPBlank: n, rejected3sf: rej, pct: +(100 * rej / n).toFixed(1), ex };
  }
}
{ // leftover: the mass that reacts is accepted as the mass left over
  const { G } = loadGuide('general-chemistry/stoichiometry-study-guide.html', 7);
  let n = 0, acc = 0, ex = null;
  for (let i = 0; i < 20000; i++) {
    const P = G.makeProblem('limiting', null); n++;
    const r = G.gradePart(P.parts[2], P.used.toPrecision(3));
    if (r.status === 'correct') { acc++; ex = ex || { question: H.text(P.question), typedAmountReacting: P.used.toPrecision(3), shown: H.text(P.parts[2].show) }; }
  }
  out['leftover accepts amount reacting'] = { n, accepted: acc, pct: +(100 * acc / n).toFixed(2), ex };
}
{ // gas capstone: typing the collected volume as the theoretical yield gets the 22.4 L/mol message
  const { G } = loadGuide('general-chemistry/solutions-and-gases-study-guide.html', 12);
  let n = 0, wrongMsg = 0, ex = null;
  for (let i = 0; i < 5000; i++) {
    const P = G.makeProblem('capstone', null); n++;
    const r = G.gradePart(P.parts[1], P.actual);
    if (r.msg && /22\.4/.test(r.msg)) { wrongMsg++; ex = ex || { question: H.text(P.question), typed: P.actual, shown: H.text(r.msg) }; }
  }
  out['gas capstone actual-volume slip gets 22.4 message'] = { n, count: wrongMsg, pct: +(100 * wrongMsg / n).toFixed(1), ex };
}
console.log(JSON.stringify(out, null, 1));
require('fs').writeFileSync(__dirname + '/results/repro-examples.json', JSON.stringify(out, null, 1));
