// Browser-side harness for the two non-majors guides. Injected by run-generators.js.
// It calls the page's generators (exported by an injected line, window.__G) and checks every problem
// against values computed HERE from independently typed data. It also drives the real practice UI
// (mountPractice) and types the page's own displayed answers at every help level.
(function () {
  'use strict';
  /* ---------------- independent data (typed for this audit, not copied from the page) ---------------- */
  const PT = 'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm'.split(' ');
  const PN = 'hydrogen helium lithium beryllium boron carbon nitrogen oxygen fluorine neon sodium magnesium aluminum silicon phosphorus sulfur chlorine argon potassium calcium scandium titanium vanadium chromium manganese iron cobalt nickel copper zinc gallium germanium arsenic selenium bromine krypton rubidium strontium yttrium zirconium niobium molybdenum technetium ruthenium rhodium palladium silver cadmium indium tin antimony tellurium iodine xenon cesium barium lanthanum cerium praseodymium neodymium promethium samarium europium gadolinium terbium dysprosium holmium erbium thulium ytterbium lutetium hafnium tantalum tungsten rhenium osmium iridium platinum gold mercury thallium lead bismuth polonium astatine radon francium radium actinium thorium protactinium uranium neptunium plutonium americium curium'.split(' ');
  const Z_OF = {}; PT.forEach((s, i) => Z_OF[s] = i + 1);
  const NAME_OF_Z = z => PN[z - 1];
  const Z_OF_NAME = {}; PN.forEach((n, i) => Z_OF_NAME[n] = i + 1); Z_OF_NAME['tritium (hydrogen'] = 1;
  // Pauling electronegativities as rounded in the course textbook tables (older Pauling set)
  const EN_COURSE = { H: 2.1, Li: 1.0, Na: 0.9, K: 0.8, Mg: 1.2, Ca: 1.0, Al: 1.5, C: 2.5, N: 3.0, O: 3.5, F: 4.0, P: 2.1, S: 2.5, Cl: 3.0, Br: 2.8, I: 2.5 };
  // revised Pauling (Allred 1961) for a doubt check only
  const EN_REV = { H: 2.20, Li: 0.98, Na: 0.93, K: 0.82, Mg: 1.31, Ca: 1.00, Al: 1.61, C: 2.55, N: 3.04, O: 3.44, F: 3.98, P: 2.19, S: 2.58, Cl: 3.16, Br: 2.96, I: 2.66 };
  const METALS_MINE = new Set(['Li', 'Na', 'K', 'Mg', 'Ca', 'Al']);
  const ACID_MINE = { HCl: { h: 1, an: 'Cl', q: 1 }, HNO3: { h: 1, an: 'NO3', q: 1 }, H2SO4: { h: 2, an: 'SO4', q: 2 }, CH3COOH: { h: 1, an: 'CH3COO', q: 1 } };
  const BASE_MINE = { NaOH: { oh: 1, cat: 'Na' }, KOH: { oh: 1, cat: 'K' }, 'Ca(OH)2': { oh: 2, cat: 'Ca' }, 'Mg(OH)2': { oh: 2, cat: 'Mg' } };
  const PARTICLE = { alpha: [4, 2], beta: [0, -1], positron: [0, 1], ec: [0, -1], gamma: [0, 0] };
  // bonds per molecule, for the bond-energy problems
  const BONDS_PER = { H2: { 'H–H': 1 }, Cl2: { 'Cl–Cl': 1 }, F2: { 'F–F': 1 }, HCl: { 'H–Cl': 1 }, HF: { 'H–F': 1 }, O2: { 'O=O': 1 }, H2O: { 'O–H': 2 }, CH4: { 'C–H': 4 }, CO2: { 'C=O': 2 }, N2: { 'N≡N': 1 }, NH3: { 'N–H': 3 } };
  const M_C = 12.011, M_O = 15.999;

  /* ---------------- helpers ---------------- */
  const strip = h => String(h).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const BAD = /\bNaN\b|\bundefined\b|\bInfinity\b|\bnull\b|\[object Object\]/;
  // numbers as a reader would read them, from an HTML snippet; also returns the raw token for typing
  function numTokens(h) {
    let s = String(h);
    const toks = [];
    s = s.replace(/([\d.,]+)\s*×\s*10<sup>([−\-]?)(\d+)<\/sup>/g, (m, a, sg, e) => { const id = toks.length; toks.push({ v: parseFloat(a.replace(/,/g, '')) * Math.pow(10, (sg ? -1 : 1) * +e), raw: a + 'x10^' + (sg ? '-' : '') + e, sci: true }); return ' @@' + id + '@@ '; });
    s = strip(s);
    const out = [];
    const re = /@@(\d+)@@|([−\-]?\$?\d[\d,]*(?:\.\d+)?)/g; let m;
    while ((m = re.exec(s))) {
      if (m[1] !== undefined) { out.push(toks[+m[1]]); continue; }
      const raw = m[2]; const v = parseFloat(raw.replace(/[$,]/g, '').replace('−', '-'));
      if (isFinite(v)) out.push({ v, raw });
    }
    return out;
  }
  const boldNums = h => (String(h).match(/<b>.*?<\/b>/g) || []).map(b => numTokens(b)).flat();
  const nearPg = (G, v, p) => G.near(v, p.ans, p.tol, p.abs);
  const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  function parseFormula(f) { // element counts, supports parentheses
    const stack = [{}]; const re = /([A-Z][a-z]?)(\d*)|\((|\))(\d*)/g; let i = 0;
    const tokens = f.match(/[A-Z][a-z]?\d*|\(|\)\d*/g) || [];
    for (const t of tokens) {
      if (t === '(') { stack.push({}); continue; }
      if (t[0] === ')') { const n = +(t.slice(1) || 1); const top = stack.pop(); for (const k in top) stack[stack.length - 1][k] = (stack[stack.length - 1][k] || 0) + top[k] * n; continue; }
      const mm = t.match(/([A-Z][a-z]?)(\d*)/); stack[stack.length - 1][mm[1]] = (stack[stack.length - 1][mm[1]] || 0) + +(mm[2] || 1);
    }
    return stack[0];
  }
  function sideCounts(side) { const tot = {}; side.split(' + ').forEach(term => { term = term.trim(); const m = term.match(/^(\d+)\s+(.*)$/); const c = m ? +m[1] : 1; const f = m ? m[2] : term; const pc = parseFormula(f); for (const k in pc) tot[k] = (tot[k] || 0) + pc[k] * c; }); return tot; }
  const NUC_RE = /<span class="nuc"><span class="pre"><span>([^<]*)<\/span><span>([^<]*)<\/span><\/span><span class="sym">([^<]*)<\/span><\/span>/g;
  function nuclides(h) { const out = []; let m; NUC_RE.lastIndex = 0; while ((m = NUC_RE.exec(h))) out.push({ A: parseInt(m[1], 10), Araw: m[1], Z: +m[2].replace('−', '-'), sym: m[3], idx: m.index }); return out; }

  /* ---------------- the report ---------------- */
  const R = { counts: {}, faults: {}, notes: {} };
  function fault(kind, ex) { const f = R.faults[kind] || (R.faults[kind] = { n: 0, examples: [] }); f.n++; if (f.examples.length < 6) f.examples.push(ex); }
  function note(kind, ex) { const f = R.notes[kind] || (R.notes[kind] = { n: 0, examples: [] }); f.n++; if (f.examples.length < 4) f.examples.push(ex); }
  function count(k, by) { R.counts[k] = (R.counts[k] || 0) + (by || 1); }

  /* ---------------- per-problem independent checks ----------------
     Each classify() returns {type, mine:{parts:[value or {mcText}], blanks:{k:string}}} */
  const C = {};
  C.bond = (P) => {
    const m = P.q.match(/\(([A-Z][a-z]?)–([A-Z][a-z]?)\)/); const [A, B] = [m[1], m[2]];
    const a = EN_COURSE[A], b = EN_COURSE[B], d = Math.abs(a - b);
    const ionic = METALS_MINE.has(A) || METALS_MINE.has(B);
    const kind = ionic ? 'Ionic' : d <= 0.4 + 1e-9 ? 'Nonpolar covalent' : 'Polar covalent';
    const neg = a > b ? A : b > a ? B : null;
    // names in the question must match
    const nm = P.q.match(/between (\w+) and (\w+)/);
    if (!nm || nm[1] !== NAME_OF_Z(Z_OF[A]) || nm[2] !== NAME_OF_Z(Z_OF[B])) fault('bond: element name wrong in question', P.q);
    // doubt check with revised Pauling values
    if (!ionic) { const dr = Math.abs(EN_REV[A] - EN_REV[B]); const kr = dr <= 0.4 ? 'Nonpolar covalent' : 'Polar covalent'; if (kr !== kind) note('bond: class changes with revised Pauling values', A + '–' + B + ': course ΔEN ' + d.toFixed(1) + ' → ' + kind + '; revised ΔEN ' + dr.toFixed(2) + ' → ' + kr); }
    return { type: 'bond', mine: { parts: [d, { pick: o => neg ? o.startsWith(neg + ' (') : /Neither/.test(o) }, { pick: o => o === kind }], blanks: { hi: Math.max(a, b).toFixed(1), lo: Math.min(a, b).toFixed(1) } } };
  };
  C.conc = (P) => {
    const q = strip(P.q), ctx = strip(P.ctx || ''); let m;
    if ((m = q.match(/^How many grams of (.+) are in ([\d.]+) g of/))) { const pc = +ctx.match(/is ([\d.]+)%/)[1]; return { type: 'pctmass', mine: { parts: [+m[2] * pc / 100], blanks: { d: String(pc / 100) } } }; }
    if ((m = q.match(/at ([\d.]+) ppm\. \(a\).*in ([\d.]+) L\?/))) return { type: 'ppm2mg', mine: { parts: [+m[1], +m[1] * +m[2]], blanks: { u: '1' } } };
    if ((m = q.match(/contains ([\d.]+) mg\/L of/))) return { type: 'mg2ppb', mine: { parts: [+m[1] * 1000], blanks: { k: '1000' } } };
    if ((m = q.match(/is about ([\d.]+)% .* What is that in ppm/))) return { type: 'pct2ppm', mine: { parts: [+m[1] * 1e4], blanks: { k: '10000' } } };
    if ((m = q.match(/tests at ([\d.]+) mg\/L/))) { const L = +ctx.match(/is ([\d.]+) mg\/L/)[1]; return { type: 'limit', mine: { parts: [+m[1] / L], blanks: { l: String(L) } } }; }
    if ((m = q.match(/^([\d.]+) mol of .* make ([\d.]+) L of solution/))) return { type: 'molarity', mine: { parts: [+m[1] / +m[2]], blanks: { v: m[2] } } };
    if ((m = q.match(/in ([\d.]+) mL of a ([\d.]+) M solution/))) return { type: 'moles', mine: { parts: [+m[2] * +m[1] / 1000], blanks: { v: String(+m[1] / 1000) } } };
    return { type: 'UNCLASSIFIED' };
  };
  C.neut = (P) => {
    const eqTxt = strip(P.q).match(/Complete the neutralization: (\S+) \+ (\S+) →/); const a = eqTxt[1], b = eqTxt[2];
    const A = ACID_MINE[a], B = BASE_MINE[b];
    const l = A.h * B.oh / gcd(A.h, B.oh); const nCat = l / B.oh, nAn = l / A.h;
    const wrapM = (f, n) => n === 1 ? f : (/\d/.test(f) || f.length > 2 ? '(' + f + ')' + n : f + n);
    const salt = (nCat === 1 ? B.cat : B.cat + nCat) + wrapM(A.an, nAn);
    // equation in 'done' must balance atom by atom
    const eq = strip(P.done).replace(/\s+/g, ' ').trim(); const [L, Rr] = eq.split(' → ');
    const cl = sideCounts(L), cr = sideCounts(Rr);
    const keys = new Set([...Object.keys(cl), ...Object.keys(cr)]);
    for (const k of keys) if ((cl[k] || 0) !== (cr[k] || 0)) { fault('neut: balanced equation does not balance', eq); break; }
    // a distractor that is the same compound written unreduced would be a second right answer
    const opts = P.parts[0].options.map(o => strip(o.v));
    opts.forEach(o => { if (o === salt) return; const pc = parseFormula(o), ps = parseFormula(salt); const ks = new Set([...Object.keys(pc), ...Object.keys(ps)]); let ratio = null, same = true; for (const k of ks) { const r = (pc[k] || 0) / (ps[k] || 1e-9); if (!ps[k] || !pc[k]) { same = false; break; } if (ratio === null) ratio = r; else if (Math.abs(r - ratio) > 1e-9) { same = false; break; } } if (same) fault('neut: distractor is the correct salt unreduced', a + ' + ' + b + ': ' + o + ' vs ' + salt); });
    return { type: 'neut', mine: { parts: [{ pick: o => o === salt }, l], blanks: { h: String(A.h), oh: String(B.oh) } }, extra: { a, b, salt } };
  };
  C.ph = (P) => {
    const q = strip(P.q); let m;
    if ((m = q.match(/\[H\+\] = 1 × 10(−?)(\d+) mol\/L\. What is its pH\?/))) { if (m[2] === '0' && m[1]) fault('ph: exponent written as −0', q); return { type: 'toPH', mine: { parts: [+m[2]], blanks: { e: String(-m[2]) } } }; }
    if ((m = q.match(/has pH (\d+)\. What is its hydrogen-ion/))) return { type: 'toH', mine: { parts: [Math.pow(10, -m[1])], blanks: { e: String(-m[1]) } } };
    if ((m = q.match(/has pH (\d+)\. What is its hydroxide/))) return { type: 'toOH', mine: { parts: [Math.pow(10, -(14 - m[1]))], blanks: { p: String(14 - m[1]) } } };
    if ((m = q.match(/Solution A has pH (\d+) \((.*?)\) and solution B has pH (\d+) \((.*?)\)/))) return { type: 'times', mine: { parts: [Math.pow(10, m[3] - m[1])], blanks: { d: String(m[3] - m[1]) } }, extra: { labels: [[+m[1], m[2]], [+m[3], m[4]]] } };
    if ((m = q.match(/^A solution has pH ([\d.]+)\.$/))) { const p = +m[1]; const c = p < 7 ? 'Acidic' : p > 7 ? 'Basic (alkaline)' : 'Neutral'; const w = p < 7 ? 'more hydrogen ion' : p > 7 ? 'less hydrogen ion' : 'the same hydrogen ion'; const l = p < 7 ? 'turns red' : 'stays blue'; return { type: 'class', mine: { parts: [{ pick: o => o === c }, { pick: o => o === w }, { pick: o => o === l }], blanks: { s: Math.abs(p - 7).toFixed(1) } } }; }
    if ((m = q.match(/\[H\+\] = ([\d.]+) × 10−(\d+) mol\/L\. What is its pH, to two decimal/))) return { type: 'calc', mine: { parts: [-Math.log10(+m[1] * Math.pow(10, -m[2]))], blanks: { lg: Math.log10(+m[1]).toFixed(2) } } };
    if ((m = q.match(/has pH ([\d.]+)\. What is \[H\+\] in mol\/L/))) { const p = +m[1]; const n = Math.ceil(p); return { type: 'calcH', mine: { parts: [Math.pow(10, -p)], blanks: { m: Math.pow(10, n - p).toFixed(2) } } }; }
    return { type: 'UNCLASSIFIED' };
  };
  C.nuc = (P) => {
    const q = P.q; const ctx = strip(P.ctx || '');
    const nucs = nuclides(q);
    nucs.forEach(n => { if (n.Z >= 1 && !(n.sym === 'p' && n.A === 1) && !(n.sym === 'e')) { if (PT[n.Z - 1] !== n.sym) fault('nuc: symbol does not match atomic number', n.Araw + '/' + n.Z + ' ' + n.sym); } });
    const checkEq = (html, label) => { // parse "X → Y + Z" with nuclides; electron on left for EC
      const parts = html.split('→'); if (parts.length !== 2) { fault('nuc: no arrow in balanced equation', label); return; }
      const L = nuclides(parts[0]), Rr = nuclides(parts[1]);
      const sA = a => a.reduce((t, x) => t + x.A, 0), sZ = a => a.reduce((t, x) => t + x.Z, 0);
      if (sA(L) !== sA(Rr) || sZ(L) !== sZ(Rr)) fault('nuc: equation does not balance', label + ': ' + strip(html).slice(0, 80) + ' A ' + sA(L) + '/' + sA(Rr) + ' Z ' + sZ(L) + '/' + sZ(Rr));
      [...L, ...Rr].forEach(n => { if (n.Z >= 1 && n.sym !== 'p' && n.sym !== 'e' && PT[n.Z - 1] !== n.sym) fault('nuc: symbol does not match atomic number', n.Araw + '/' + n.Z + ' ' + n.sym); if (n.sym === 'e' && n.A !== 0) fault('nuc: electron with mass number', label); });
    };
    let m;
    if (/bombardment/.test(q)) {
      const eqh = q.slice(q.indexOf('<div class="eq">')); const [lh, rh] = eqh.split('→');
      const L = nuclides(lh), K = nuclides(rh);
      const zOf = n => n.sym === 'n' ? 0 : n.sym === 'p' ? 1 : Z_OF[n.sym];
      L.concat(K).forEach(n => { if (zOf(n) !== n.Z) fault('nuc: bombard symbol/Z mismatch', n.sym + ' ' + n.Z); });
      const A = L.reduce((t, x) => t + x.A, 0) - K.reduce((t, x) => t + x.A, 0), Z = L.reduce((t, x) => t + zOf(x), 0) - K.reduce((t, x) => t + zOf(x), 0);
      const nameShown = (P.parts[1].show.match(/\((\w+)\)/) || [])[1]; if (nameShown !== NAME_OF_Z(Z)) fault('nuc: element name wrong', 'Z=' + Z + ' shown ' + nameShown);
      const sol = P.solution; const bi = sol.indexOf('Balanced:'); checkEq(sol.slice(bi, sol.indexOf('</li>', bi)), 'bombard');
      return { type: 'bombard', mine: { parts: [A, Z], blanks: { LA: String(L.reduce((t, x) => t + x.A, 0)), LZ: String(L.reduce((t, x) => t + zOf(x), 0)) } } };
    }
    const decayOf = s => /alpha decay/.test(s) ? 'alpha' : /beta decay/.test(s) ? 'beta' : /positron/.test(s) ? 'positron' : /electron capture/.test(s) ? 'ec' : /gamma/.test(s) ? 'gamma' : null;
    const nameA = s => { const mm = s.match(/^(.*?)-(\d+m?)$/); return mm ? { Z: Z_OF_NAME[mm[1].toLowerCase()], A: parseInt(mm[2], 10), raw: s } : null; };
    // every displayed name-mass must use the right name for its Z: check from the done text
    const doneTxt = strip(P.done);
    (doneTxt.match(/[a-z]+-\d+m?/gi) || []).forEach(t => { const x = nameA(t); if (!x || !x.Z) fault('nuc: name not recognised', t); });
    checkEq(P.done.replace(/^<p>/, '').split('. ')[0].replace(/^.*?: /, ''), 'done');
    if (/What particle is involved/.test(q)) {
      const mm = ctx.match(/^(.*?) decays to (.*?)\.$/); const p = nameA(mm[1]), d = nameA(mm[2]);
      const dA = d.A - p.A, dZ = d.Z - p.Z; const kind = dA === -4 && dZ === -2 ? 'Alpha particle' : dA === 0 && dZ === 1 ? 'Beta particle' : dA === 0 && dZ === -1 ? 'Positron' : dA === 0 && dZ === 0 ? 'Gamma ray' : '??';
      return { type: 'particle', mine: { parts: [{ pick: o => o.startsWith(kind) }], blanks: { dA: String(dA), dZ: String(dZ) } } };
    }
    if (/Identify the parent/.test(q)) {
      const t = decayOf(ctx); const d = nameA(ctx.match(/the product is (.*?)\.$/)[1]); const [pa, pz] = PARTICLE[t];
      const A = t === 'ec' ? d.A - pa : d.A + pa, Z = t === 'ec' ? d.Z - pz : d.Z + pz;
      const nameShown = (P.parts[1].show.match(/\((\w+)\)/) || [])[1]; if (nameShown !== NAME_OF_Z(Z)) fault('nuc: element name wrong', 'Z=' + Z + ' shown ' + nameShown);
      return { type: 'parent', mine: { parts: [A, Z], blanks: { pA: String(pa), pZ: String(pz) } } };
    }
    const t = decayOf(ctx); const p = nameA(ctx.match(/^(.*?) undergoes/)[1]); const [pa, pz] = PARTICLE[t];
    const A = t === 'ec' ? p.A + pa : p.A - pa, Z = t === 'ec' ? p.Z + pz : p.Z - pz;
    const nameShown = (P.parts[1].show.match(/\((\w+)\)/) || [])[1]; if (nameShown !== NAME_OF_Z(Z)) fault('nuc: element name wrong', 'Z=' + Z + ' shown ' + nameShown);
    return { type: 'product', mine: { parts: [A, Z], blanks: { pA: String(pa), pZ: String(pz) } } };
  };
  const frac = n => '1/' + Math.pow(2, n);
  C.half = (P) => {
    const q = strip(P.q), ctx = strip(P.ctx || ''); let m;
    const hl = ctx.match(/half-life of ([\d.]+) (\w+)/);
    if ((m = q.match(/starts at ([\d.]+) mg\. How much remains after ([\d.,]+) (\w+)\?/))) { const t = +hl[1], T = +m[2].replace(/,/g, ''); const n = Math.round(T / t); return { type: 'remain', mine: { parts: [+m[1] * Math.pow(0.5, T / t)], blanks: { n: String(n), f: frac(n) } }, extra: { iso: ctx.split(' has')[0], t, u: hl[2] } }; }
    if ((m = q.match(/decay to 1\/(\d+) of its original/))) { const n = Math.log2(+m[1]); return { type: 'howlong', mine: { parts: [+hl[1] * n], blanks: { n: String(n) } }, extra: { iso: ctx.split(' has')[0], t: +hl[1], u: hl[2] } }; }
    if ((m = q.match(/decays from ([\d.]+) g to ([\d.,]+) g\. How many half-lives/))) { const S = +m[1], E = +m[2].replace(/,/g, ''); return { type: 'count', mine: { parts: [Math.log2(S / E)], blanks: { f: '1/' + Math.round(S / E) } } }; }
    if ((m = q.match(/has (one-half|one-fourth|one-eighth|one-sixteenth|one thirty-second) as much carbon-14/))) { const n = ['one-half', 'one-fourth', 'one-eighth', 'one-sixteenth', 'one thirty-second'].indexOf(m[1]) + 1; return { type: 'date', mine: { parts: [5730 * n], blanks: { n: String(n) } } }; }
    if ((m = q.match(/drops from ([\d.]+) mg to ([\d.,]+) mg in (\d+) days/))) { const n = Math.log2(+m[1] / +m[2].replace(/,/g, '')); return { type: 'findhalf', mine: { parts: [+m[3] / n], blanks: { n: String(Math.round(n)) } } }; }
    if ((m = q.match(/remains after (\d+) half-li/))) { const n = +m[1]; return { type: 'percent', mine: { parts: [100 * Math.pow(0.5, n)], blanks: { f: frac(n) } } }; }
    return { type: 'UNCLASSIFIED' };
  };
  C.energy = (P) => {
    const q = strip(P.q); let m;
    if ((m = q.match(/rated at ([\d,]+) W runs for ([\d.]+) hours?\.( How much energy does it use, and what does it cost at \$([\d.]+) per kWh\?)?/))) {
      const W = +m[1].replace(/,/g, ''), h = +m[2]; const kwh = W * h / 1000; const parts = [kwh]; if (m[3]) parts.push(kwh * +m[4]);
      return { type: m[3] ? 'cost' : 'kwh', mine: { parts, blanks: { kw: String(W / 1000) } }, extra: { W, h } };
    }
    if ((m = q.match(/How many joules does a ([\d,]+) W .* use in (\d+) minutes?\?/))) { const W = +m[1].replace(/,/g, ''), s = +m[2] * 60; return { type: 'joules', mine: { parts: [W * s], blanks: { s: String(s) } } }; }
    if ((m = q.match(/uses ([\d,]+) J of energy in (\d+) seconds/))) { const J = +m[1].replace(/,/g, ''), s = +m[2]; return { type: 'power', mine: { parts: [J / s], blanks: { s: String(s) } } }; }
    if ((m = q.match(/provides (\d+) Calories/))) return { type: 'calories', mine: { parts: [+m[1] * 4.184], blanks: { cal: String(+m[1] * 1000) } } };
    if ((m = q.match(/How many hours can a ([\d,]+) W .* run on (\d+) kWh/))) { const W = +m[1].replace(/,/g, ''), E = +m[2]; return { type: 'time', mine: { parts: [E * 1000 / W], blanks: { wh: String(E * 1000) } } }; }
    if (/Estimate the heat of reaction/.test(q)) {
      const eq = strip(P.q.match(/<div class="eq">(.*?)<\/div>/)[1]); const [L, Rr] = eq.split(' → ');
      // bond energies as given in the problem's own table
      const tbl = {}; (P.q.match(/<tr><td>([^<]+)<\/td><td class="num">(\d+)<\/td><\/tr>/g) || []).forEach(r => { const mm = r.match(/<td>([^<]+)<\/td><td class="num">(\d+)/); tbl[mm[1]] = +mm[2]; });
      const cnt = side => { const c = {}; side.split(' + ').forEach(t => { const mm = t.trim().match(/^(\d+)\s+(.*)$/); const k = mm ? +mm[1] : 1; const f = mm ? mm[2] : t.trim(); const b = BONDS_PER[f]; if (!b) { c.__unknown = f; return; } for (const x in b) c[x] = (c[x] || 0) + b[x] * k; }); return c; };
      const bi = cnt(L), bo = cnt(Rr); if (bi.__unknown || bo.__unknown) fault('energy: unknown molecule', eq);
      const sum = c => Object.keys(c).reduce((t, k) => t + c[k] * (tbl[k] || NaN), 0);
      return { type: 'bond', mine: { parts: [sum(bi) - sum(bo)], blanks: { in: String(sum(bi)), out: String(sum(bo)) } } };
    }
    return { type: 'UNCLASSIFIED' };
  };
  C.fuel = (P) => {
    const q = strip(P.q), ctx = strip(P.ctx || ''); let m;
    if ((m = q.match(/reserves: ([\d.,]+) .*?\. Consumption: ([\d.,]+) /))) { const R0 = +m[1].replace(/,/g, ''), Cn = +m[2].replace(/,/g, ''); return { type: 'years', mine: { parts: [R0 / Cn], blanks: { c: String(Cn) } } }; }
    if ((m = q.match(/generated ([\d,]+) million kWh/))) { const pc = +ctx.match(/In \d+, ([\d.]+)%/)[1]; return { type: 'share', mine: { parts: [+m[1].replace(/,/g, '') * pc / 100], blanks: { d: String(pc / 100) } } }; }
    if ((m = q.match(/Burning ([\d,]+) kg of carbon/))) return { type: 'co2', mine: { parts: [+m[1].replace(/,/g, '') * (M_C + 2 * M_O) / M_C], blanks: { r: '3.67' } } };
    if ((m = q.match(/tons of carbon are in (\d+) tons?/))) { const pc = +ctx.match(/about (\d+)% carbon/)[1]; return { type: 'carbon', mine: { parts: [+m[1] * pc / 100], blanks: { d: String(pc / 100) } } }; }
    if ((m = q.match(/To make (\d+) mL .* for (\d+)-octane/))) return { type: 'octane', mine: { parts: [+m[1] * +m[2] / 100], blanks: { d: String(+m[2] / 100) } } };
    return { type: 'UNCLASSIFIED' };
  };

  /* ---------------- checks on one generated problem (no DOM) ---------------- */
  function checkProblem(G, gname, P, cls) {
    const key = gname + ':' + cls.type; count(key);
    const allText = [P.ctx, P.q, P.guided, ...(P.hints || []), P.solution, P.done || '', ...P.parts.map(p => p.label + ' ' + p.show + ' ' + (p.options ? p.options.map(o => o.v).join(' ') : ''))].join(' ');
    if (BAD.test(strip(allText))) fault(key + ': bad token in text', strip(allText).match(new RegExp('.{0,50}' + BAD.source + '.{0,30}'))[0]);
    P.parts.forEach((p, i) => {
      const mine = cls.mine.parts[i];
      if (p.type === 'num') {
        if (!isFinite(p.ans)) { fault(key + ': answer not finite', p.ans); return; }
        // my value vs page's answer, within the page's tolerance
        if (!nearPg(G, mine, p)) fault(key + ': page answer disagrees with independent value', { q: strip(P.q).slice(0, 140), part: i, page: p.ans, mine });
        // displayed answer (p.show) graded by the page's own rule
        const toks = numTokens(p.show); if (!toks.length) { fault(key + ': no number in displayed answer', p.show); return; }
        if (!nearPg(G, toks[0].v, p)) fault(key + ': displayed answer graded wrong', { q: strip(P.q).slice(0, 140), show: strip(p.show), shownValue: toks[0].v, ans: p.ans, tol: p.tol, abs: p.abs });
        // wrong answers that must NOT be accepted (factor-of-ten, unit and factor-of-two slips)
        if (p.ans !== 0 && G.near(0, p.ans, p.tol, p.abs)) fault(key + ': wrong answer accepted (0)', { q: strip(P.q).slice(0, 140), part: i, ans: p.ans, tol: p.tol, abs: p.abs });
        if (p.ans !== 0) [10, 0.1, 1000, 0.001, 2, 0.5].forEach(fct => { const v = p.ans * fct; if (G.near(v, p.ans, p.tol, p.abs)) fault(key + ': wrong answer accepted (x' + fct + ')', { q: strip(P.q).slice(0, 140), part: i, ans: p.ans, accepted: v, tol: p.tol, abs: p.abs }); });
        // the worked solution's bold values: at least one should be accepted
        const bs = boldNums(P.solution).map(t => t.v);
        if (bs.length && !bs.some(v => nearPg(G, v, p))) {
          const close = bs.filter(v => rel(v, p.ans) < 0.5);
          if (close.length) fault(key + ': worked-solution answer graded wrong', { q: strip(P.q).slice(0, 140), part: i, solutionBold: close, ans: p.ans, tol: p.tol, abs: p.abs, wouldGet: G.near(close[0], p.ans, 0.1) ? 'Close, but not within rounding' : 'Not quite' });
        }
      } else {
        const okIdx = p.options.map((o, j) => o.ok ? j : -1).filter(j => j >= 0);
        const mineIdx = p.options.map((o, j) => mine.pick(strip(o.v)) ? j : -1).filter(j => j >= 0);
        if (okIdx.length !== 1) fault(key + ': MC has ' + okIdx.length + ' correct options', { q: strip(P.q).slice(0, 100), opts: p.options.map(o => strip(o.v) + (o.ok ? '*' : '')) });
        if (mineIdx.length !== 1 || okIdx[0] !== mineIdx[0]) fault(key + ': MC key disagrees with independent answer', { q: strip(P.q).slice(0, 120), opts: p.options.map(o => strip(o.v) + (o.ok ? '*' : '')), mine: mineIdx });
        const txts = p.options.map(o => strip(o.v)); if (new Set(txts).size !== txts.length) fault(key + ': duplicate MC options', txts);
      }
    });
    // blanks: my value accepted by the page's blank rule
    if (P.blanks) for (const k in P.blanks) {
      const b = P.blanks[k]; const mine = cls.mine.blanks && cls.mine.blanks[k];
      if (mine === undefined) { fault(key + ': blank with no independent value', k); continue; }
      const v = G.parseNum(mine);
      if (v === null || !G.near(v, b.want, b.tol, b.abs)) fault(key + ': guided blank rejects the correct value', { q: strip(P.q).slice(0, 120), blank: k, typed: mine, want: b.want, tol: b.tol, abs: b.abs });
    }
  }

  /* ---------------- UI pass: type the displayed answers into the real practice module ---------------- */
  function typedFor(p, cls, i) { const t = numTokens(p.show)[0]; return t ? t.raw : ''; }
  function uiOnce(G, cfg, P, cls, mode) {
    const S = cfg.S(); S.P = P; S.mode = mode; S.misses = 0; S.hint = 0; S.done = false; S.partDone = []; S.sol = false;
    G.mountPractice(cfg.box, S, cfg.gen);
    const box = document.getElementById(cfg.box), prob = box.querySelector('[data-problem]');
    if (mode === 'hint') { for (let k = 0; k < 3; k++) { const hb = prob.querySelector('[data-act="hint"]'); if (hb) hb.click(); } if (prob.querySelectorAll('.hintbox').length !== (P.hints || []).length) fault(cfg.name + ':' + cls.type + ': hints did not all show', P.hints.length); }
    if (mode === 'guided' && P.blanks) for (const k in P.blanks) { const inp = prob.querySelector('[data-help] input[data-k="' + k + '"]'); if (!inp) { fault(cfg.name + ':' + cls.type + ': blank input missing', k); continue; } inp.value = cls.mine.blanks[k]; }
    P.parts.forEach((p, i) => {
      if (p.type === 'num') { const inp = prob.querySelector('.pin[data-pi="' + i + '"]'); inp.value = typedFor(p, cls, i); }
      else { const li = prob.querySelector('[data-pi="' + i + '"]'); const btns = li.querySelectorAll('button[data-oi]'); const j = p.options.findIndex(o => cls.mine.parts[i].pick(strip(o.v))); if (j >= 0) btns[j].click(); }
    });
    prob.querySelector('[data-form]').requestSubmit();
    const fbEl = prob.querySelector('[data-fb]');
    const ok = S.done === true && /\bok\b/.test(fbEl.className);
    const key = cfg.name + ':' + cls.type + ':' + mode; count('ui ' + key);
    if (!ok) fault('UI ' + key + ': displayed answer not accepted', { q: strip(P.q).slice(0, 140), typed: P.parts.map((p, i) => p.type === 'num' ? typedFor(p, cls, i) : '(mc)'), feedback: strip(fbEl.innerHTML).slice(0, 160) });
    if (mode === 'guided' && P.blanks) { const bad = [...prob.querySelectorAll('[data-help] input')].filter(x => !x.classList.contains('ok')).map(x => x.dataset.k + '=' + x.value); if (bad.length) fault('UI ' + key + ': guided blank marked wrong', { q: strip(P.q).slice(0, 140), blanks: bad }); }
    // after a solve, the worked solution is shown; scan it
    if (BAD.test(prob.innerText)) fault('UI ' + key + ': bad token rendered', prob.innerText.match(new RegExp('.{0,50}' + BAD.source + '.{0,30}'))[0]);
    return ok;
  }

  /* ---------------- unicode / paste variants of sci notation (reported separately) ---------------- */
  function variants(G) {
    const cases = [['1x10^-7', 1e-7], ['1×10^-7', 1e-7], ['1 × 10^−7', 1e-7], ['1×10−7', 1e-7], ['1 x 10-7', 1e-7], ['1e-7', 1e-7], ['10^-7', 1e-7], ['1.3x10^-5', 1.3e-5], ['−183', -183], ['$0.45', 0.45], ['7,600', 7600], ['1/8', 0.125], ['0.0000001', 1e-7], ['1*10^-7', 1e-7], ['1·10^-7', 1e-7], ['1E-7', 1e-7], ['1 × 10^0', 1], ['3.125%', 3.125], ['2.5 mg', null], ['abc', null], ['1×10^', null], ['1.2.3', null], ['', null]];
    return cases.map(([s, want]) => { const v = G.parseNum(s); return { typed: s, parsed: v, ok: want === null ? v === null : (v !== null && Math.abs(v - want) <= Math.abs(want) * 1e-9) }; });
  }

  window.__HARNESS = {
    run(which, opts) {
      const G = window.__G; const N = opts.genPerType, NUI = opts.uiPerType;
      const cfgs = which === 'ph' ? [
        { name: 'bond', example: () => G.genBond('example'), gen: () => G.genBond(), cls: C.bond, box: 'bprac', tab: 'polar', S: () => G.state.polar.prac },
        { name: 'conc', example: () => G.genConc('pctmass'), gen: () => G.genConc(), cls: C.conc, box: 'cprac', tab: 'sol', S: () => G.state.sol.prac },
        { name: 'neut', example: () => G.genNeut('example'), gen: () => G.genNeut(), cls: C.neut, box: 'nprac', tab: 'acid', S: () => G.state.acid.prac },
        { name: 'ph', example: () => G.genPH('times'), gen: () => G.genPH(), cls: C.ph, box: 'phprac', tab: 'ph', S: () => G.state.ph.prac },
      ] : [
        { name: 'nuc', example: () => G.genNuc('product'), gen: () => G.genNuc(), cls: C.nuc, box: 'nucprac', tab: 'eqn', S: () => G.state.eqn.prac },
        { name: 'half', example: () => G.genHalf('remain'), gen: () => G.genHalf(), cls: C.half, box: 'hprac', tab: 'half', S: () => G.state.half.prac },
        { name: 'energy', example: () => G.genEnergy('kwh'), gen: () => G.genEnergy(), cls: C.energy, box: 'eprac', tab: 'energy', S: () => G.state.energy.prac },
        { name: 'fuel', example: () => G.genFuel('co2'), gen: () => G.genFuel(), cls: C.fuel, box: 'fprac', tab: 'fossil', S: () => G.state.fossil.prac },
      ];
      const only = opts.only ? cfgs.filter(c => c.name === opts.only) : cfgs; cfgs.length = 0; cfgs.push(...only);
      const perType = {};
      const extras = { phTimesLabels: {}, halfIso: {}, worked: [] };
      if (opts.phase !== 'ui') for (const cfg of cfgs) {
        // the fixed worked example shown above each practice module
        try { const P = cfg.example(); const cls = cfg.cls(P); count('worked example ' + cfg.name); checkProblem(G, cfg.name + '(worked example)', P, cls); } catch (e) { fault(cfg.name + ': worked example check threw', String(e)); }
        const typeCount = {}; let calls = 0; const t0 = performance.now();
        // 1) generator pass
        while (calls < 400000) {
          let P; try { P = cfg.gen(); } catch (e) { fault(cfg.name + ': generator threw', String(e)); calls++; continue; }
          calls++;
          let cls; try { cls = cfg.cls(P); } catch (e) { fault(cfg.name + ': audit could not parse problem', { err: String(e), q: strip(P.q).slice(0, 160), ctx: strip(P.ctx || '').slice(0, 120) }); continue; }
          if (cls.type === 'UNCLASSIFIED') { fault(cfg.name + ': unclassified problem', strip(P.q).slice(0, 120)); continue; }
          typeCount[cls.type] = (typeCount[cls.type] || 0) + 1;
          try { checkProblem(G, cfg.name, P, cls); } catch (e) { fault(cfg.name + ': check threw', { err: String(e), q: strip(P.q).slice(0, 120) }); }
          if (cls.extra && cls.extra.labels) cls.extra.labels.forEach(([p, l]) => extras.phTimesLabels[p] = l);
          if (cls.extra && cls.extra.iso) extras.halfIso[cls.extra.iso] = cls.extra.t + ' ' + cls.extra.u;
          const types = Object.keys(typeCount); if (types.length >= (opts.expectTypes[cfg.name] || 1) && types.every(t => typeCount[t] >= N)) break;
        }
        // worked examples (fixed problems) are checked too
        perType[cfg.name] = { calls, typeCount, ms: Math.round(performance.now() - t0) };
      }
      // 2) UI pass at each help level
      if (opts.phase !== 'gen') for (const cfg of cfgs) {
        G.state.tab = cfg.tab; G.render();
        const ui = {};
        for (const mode of (opts.modes || ['guided', 'hint', 'solo'])) {
          const tc = {}; let calls = 0; const t0 = performance.now();
          while (calls < 200000) {
            const P = cfg.gen(); calls++; let cls; try { cls = cfg.cls(P); } catch (e) { continue; } if (cls.type === 'UNCLASSIFIED') continue;
            tc[cls.type] = (tc[cls.type] || 0) + 1;
            if (tc[cls.type] > NUI) continue;
            try { uiOnce(G, cfg, P, cls, mode); } catch (e) { fault('UI ' + cfg.name + ':' + cls.type + ':' + mode + ': threw', String(e).slice(0, 200)); }
            if (opts.overflowCheck && tc[cls.type] <= 40) { const W = document.documentElement.clientWidth, SW = document.documentElement.scrollWidth; if (SW > W + 1) { const offs = [...document.querySelectorAll('#view *')].filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right > W + 1; }).map(el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.split(' ')[0] : '')).filter((x, i, a) => a.indexOf(x) === i).slice(0, 4); fault('UI ' + cfg.name + ':' + cls.type + ': horizontal overflow at ' + W + 'px', { scrollWidth: SW, offenders: offs.join(', '), q: strip(P.q).slice(0, 100) }); } }
            const types = Object.keys(tc); if (types.length >= (opts.expectTypes[cfg.name] || 1) && types.every(t => tc[t] >= NUI)) break;
          }
          ui[mode] = { typeCount: Object.fromEntries(Object.entries(tc).map(([k, v]) => [k, Math.min(v, NUI)])), ms: Math.round(performance.now() - t0) };
        }
        (perType[cfg.name] || (perType[cfg.name] = {})).ui = ui;
      }
      return { perType, counts: R.counts, faults: R.faults, notes: R.notes, extras, parseVariants: variants(G) };
    }
  };
})();
