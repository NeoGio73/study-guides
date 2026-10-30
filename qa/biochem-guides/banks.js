// Practice banks: structural checks on every item, every generator driven N times (default 2,500).
// Also dumps every distinct generated question with its key to bank-dump-<guide>.txt for reading.
// Usage: node banks.js [N]
'use strict';
const fs = require('fs');
const path = require('path');
const { openGuide, chromium } = require('./harness');

async function checkBanks(page, N){
  return await page.evaluate((N) => {
    const T = window.__T, BANK = T.BANK;
    const BAD = /\bNaN\b|\bundefined\b|\bInfinity\b|\[object Object\]|="[^"]*NaN/;
    const strip = s => String(s).replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ');
    const parseNum = s => { const raw = String(s).replace(/<[^>]+>/g, '').trim().replace(/,/g, '').replace(/[−–]/g, '-').replace(/\s*[x×]\s*10\^?\s*/i, 'e'); return raw === '' ? NaN : Number(raw); };
    const report = {sections: {}, problems: [], dump: {}};
    const prob = (sec, idx, msg, Q) => { if(report.problems.filter(p => p.msg === msg && p.sec === sec && p.idx === idx).length < 3) report.problems.push({sec, idx, msg, q: Q && strip(Q.q).slice(0, 200), c: Q && (Q.c !== undefined ? strip(JSON.stringify(Q.c)).slice(0, 160) : Q.a)}); };
    for(const sec of Object.keys(BANK)){
      const items = BANK[sec];
      const st = {items: items.length, generators: 0, draws: 0, distinct: 0};
      const dumpSet = new Map();
      items.forEach((item, idx) => {
        const isGen = typeof item === 'function';
        if(isGen) st.generators++;
        const reps = isGen ? N : 1;
        for(let r = 0; r < reps; r++){
          let Q;
          try{ Q = isGen ? item() : Object.assign({}, item); }catch(e){ prob(sec, idx, 'generator threw: ' + e.message); continue; }
          st.draws++;
          const all = [Q.q, Q.why, Q.hint, (Q.setup || []).join(' '), Q.fig || '', Q.show || ''].concat(Q.k === 'mc' ? [Q.c].concat(Q.w || []) : []).concat(Q.k === 'order' ? Q.items.map(x => x.t) : []).join(' | ');
          if(BAD.test(all)) prob(sec, idx, 'bad token in text: ' + (all.match(BAD) || [''])[0] + ' … ' + strip(all).slice(Math.max(0, strip(all).search(/NaN|undefined|Infinity|object Object/) - 80), strip(all).search(/NaN|undefined|Infinity|object Object/) + 40), Q);
          if(!Q.q) prob(sec, idx, 'empty question', Q);
          if(['mc', 'num', 'order', 'fa'].indexOf(Q.k) < 0) prob(sec, idx, 'unknown kind ' + Q.k, Q);
          let key = '';
          if(Q.k === 'mc'){
            const w = Q.w || [];
            if(!Q.c) prob(sec, idx, 'mc without correct answer', Q);
            if(w.length < 1) prob(sec, idx, 'mc with no distractors', Q);
            if(w.indexOf(Q.c) >= 0) prob(sec, idx, 'correct answer also listed as a distractor', Q);
            if(new Set(w).size !== w.length) prob(sec, idx, 'duplicate distractors: ' + JSON.stringify(w), Q);
            if(w.some(x => !x || !String(x).trim())) prob(sec, idx, 'empty distractor', Q);
            if(w.some(x => strip(x).trim().toLowerCase() === strip(Q.c).trim().toLowerCase())) prob(sec, idx, 'distractor equal to answer after stripping markup', Q);
            key = strip(Q.c) + '  ||  wrong: ' + w.map(strip).sort().join(' / ');
          } else if(Q.k === 'num'){
            if(!isFinite(Q.a)) prob(sec, idx, 'numeric answer not finite: ' + Q.a, Q);
            const tol = Q.tol != null ? Q.tol : Math.abs(Q.a) * (Q.rel != null ? Q.rel : 0);
            const shown = Q.show != null ? Q.show : T.fmt(Q.a, Q.dp);
            const v = parseNum(shown);
            if(!isFinite(v)) prob(sec, idx, 'displayed answer does not parse: ' + shown, Q);
            else if(Math.abs(v - Q.a) > tol + 1e-9) prob(sec, idx, 'displayed answer ' + shown + ' is rejected by the checker (a=' + Q.a + ', tol=' + tol + ')', Q);
            (Q.traps || []).forEach(tr => {
              if(!isFinite(tr[0])) prob(sec, idx, 'trap value not finite', Q);
              else if(Math.abs(tr[0] - Q.a) <= tol + 1e-9) prob(sec, idx, 'trap value ' + tr[0] + ' coincides with the accepted answer ' + Q.a + ' (harmless, trap unreachable)', Q);
            });
            key = shown + (Q.unit ? ' ' + strip(Q.unit) : '') + '  (a=' + (+Q.a.toPrecision(6)) + ', tol=' + (+tol.toPrecision(3)) + ')';
          } else if(Q.k === 'order'){
            const rs = Q.items.map(x => x.r);
            for(let i = 1; i < rs.length; i++) if(rs[i - 1] > rs[i]) prob(sec, idx, 'order items not listed in keyed order', Q);
            if(new Set(rs).size !== rs.length) prob(sec, idx, 'tied ranks in order question (two orders accepted): ' + JSON.stringify(Q.items.map(x => strip(x.t) + '=' + x.r)), Q);
            key = Q.items.map(x => strip(x.t)).join('  >  ');
          } else if(Q.k === 'fa'){
            if(typeof T.checkShort !== 'function') prob(sec, idx, 'fa question but checkShort missing', Q);
            else {
              const s1 = T.faShort(Q.c, Q.d, false), r1 = T.checkShort(s1, Q.c, Q.d);
              if(!r1.ok) prob(sec, idx, 'own shorthand rejected: ' + s1, Q);
              const alt = Q.c + ':' + Q.d.length + (Q.d.length ? ' (' + Q.d.join(',') + ')' : '');
              if(!T.checkShort(alt, Q.c, Q.d).ok) prob(sec, idx, 'alternate spelling rejected: ' + alt, Q);
              key = s1;
            }
          }
          const dk = strip(Q.q) + '\n    KEY: ' + key;
          if(!dumpSet.has(dk)) dumpSet.set(dk, idx);
        }
      });
      st.distinct = dumpSet.size;
      report.sections[sec] = st;
      report.dump[sec] = Array.from(dumpSet.entries()).map(([k, i]) => '[' + i + '] ' + k);
    }
    return report;
  }, N);
}

(async () => {
  const N = +(process.argv[2] || 2500);
  const browser = await chromium.launch();
  const results = {};
  for(const kind of ['carbs', 'lipids']){
    const g = await openGuide(kind, {browser});
    const miss = await g.page.evaluate(() => window.__T.__missing);
    const r = await checkBanks(g.page, N);
    r.missingExports = miss;
    results[kind] = {sections: r.sections, problems: r.problems, missingExports: miss, errors: g.errors};
    fs.writeFileSync(path.join(__dirname, 'bank-dump-' + kind + '.txt'), Object.keys(r.dump).map(s => '=== ' + s + ' (' + r.dump[s].length + ' distinct)\n' + r.dump[s].join('\n')).join('\n\n'));
    console.log(kind, JSON.stringify(r.sections));
    console.log('  problems:', r.problems.length);
    r.problems.forEach(p => console.log('   ', p.sec, '#' + p.idx, p.msg.slice(0, 220), '| Q:', (p.q || '').slice(0, 100)));
    await g.context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'bank-results.json'), JSON.stringify(results, null, 1));
})();
