// Prints a compact summary of results/*.json. Usage: node summarize.js [name ...] [--shadow]
'use strict';
const fs = require('fs');
const args = process.argv.slice(2);
const showShadow = args.includes('--shadow');
const names = args.filter(a => !a.startsWith('--'));
const files = (names.length ? names.map(n => n + '.json') : fs.readdirSync(__dirname + '/results').filter(f => f.endsWith('.json') && f !== 'summary.json'));
for (const fn of files) {
  const r = JSON.parse(fs.readFileSync(__dirname + '/results/' + fn, 'utf8'));
  if (!r.faults) continue;
  const totalChecks = Object.values(r.checks || {}).reduce((a, b) => a + b, 0);
  console.log('\n=== ' + r.guide + '  problems:', JSON.stringify(r.problems), ' checks:', totalChecks);
  for (const f of r.faults) {
    const m = f.code.match(/^slip-message-shadowed: (.*) => /);
    if (m && !showShadow) continue;
    let rate = '';
    if (m) { const k = f.section + ' | slip message reachable: ' + m[1]; rate = ' of ' + (r.checks[k] || '?'); }
    console.log('-', f.section, '|', f.code.slice(0, 140), ' n=' + f.n + rate);
    console.log('     ', JSON.stringify(f.examples[0]).slice(0, 520));
  }
}
