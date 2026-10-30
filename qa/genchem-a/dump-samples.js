// Dumps the visible text of one problem per section/type (question, guided setup, hints, solution) for reading.
'use strict';
const { loadGuide } = require('./lib/load');
const H = require('./lib/harness');
const fs = require('fs');
const G4 = [
  ['general-chemistry/mole-and-molar-mass-study-guide.html', ['molar', 'particles', 'mass', 'twostep', 'inside']],
  ['general-chemistry/stoichiometry-study-guide.html', ['molmol', 'massmass', 'density', 'limiting', 'yield', 'capstone']],
  ['general-chemistry/solution-stoichiometry-study-guide.html', ['molarity', 'dilution', 'solstoich', 'mix', 'titration']],
  ['general-chemistry/solutions-and-gases-study-guide.html', ['gaslaw', 'gasstoich', 'solgas', 'capstone']]
];
let out = '';
const sp = h => H.text(String(h).replace(/<\/(p|li|div|ol)>|<br>/g, ' ¶ '));
for (const [file, kinds] of G4) {
  const { G } = loadGuide(file, 4242);
  out += '\n######## ' + file + '\n';
  for (const kind of kinds) {
    const seen = new Set(); let prev = null;
    for (let i = 0; i < 400; i++) {
      const P = G.makeProblem(kind, kind === 'molmol' || kind === 'massmass' || kind === 'density' || kind === 'limiting' || kind === 'yield' || (kind === 'capstone' && /stoichiometry-study/.test(file)) ? prev && prev.rxn : prev); prev = P;
      const key = kind + ':' + (P.type || (P.S ? P.S.from && P.S.from.type ? P.S.from.type + '>' + P.S.to.type : P.S.unit + '>' + P.S.endUnit : ''));
      if (seen.has(key)) continue; seen.add(key);
      out += '\n=== ' + key + '\nQ: ' + sp(P.question) + '\nANS: ' + P.parts.map(p => H.text(p.show)).join(' ; ') +
        '\nGUIDED: ' + sp(P.guided) + '\nHINTS: ' + P.hints.map(sp).join(' || ') + '\nSOLUTION: ' + sp(P.solution) + '\n';
    }
  }
}
fs.writeFileSync(__dirname + '/results/samples.txt', out);
console.log(out.length);
