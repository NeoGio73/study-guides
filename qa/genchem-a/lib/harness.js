// Shared helpers for the generator audits.
'use strict';

// Visible text of an HTML fragment (tags removed, as a student sees it).
function text(html) {
  return String(html).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
// "1.06 × 10<sup>−22</sup> g" -> "1.06e-22 g" (how a student would type scientific notation).
function eNote(html) {
  return text(String(html).replace(/\s*×\s*10<sup>([−-]?\d+)<\/sup>/g, (m, e) => 'e' + e.replace('−', '-')));
}
const BAD = /\bNaN\b|undefined|Infinity|\bnull\b|\[object Object\]/;
// Scan each text node separately (adjacent elements are not glued together, so "Na" + "No" is not "NaN").
function badTokens(html) {
  const hits = [];
  // "NaN" directly followed by a subscript is the formula of sodium azide (NaN<sub>3</sub>), not Not-a-Number.
  const h = String(html).replace(/NaN(<sub>\d+<\/sub>|\d)/g, 'Na-N$1');
  h.split(/<[^>]*>/).forEach(seg => { if (BAD.test(seg)) hits.push(seg.trim().slice(0, 120)); });
  // attribute values (aria-label etc.)
  (h.match(/="[^"]*"/g) || []).forEach(a => { if (BAD.test(a)) hits.push('attr ' + a.slice(0, 120)); });
  return hits;
}

// Significant-figure rounding written the way the guides display it, as plain text.
function sigText(x, n) {
  const s = Number(x).toPrecision(n);
  if (s.indexOf('e') < 0) return s;
  const [m, e] = s.split('e'); return m + 'e' + Number(e);
}
// How a student would type a value for this part: to the part's significant figures, or to 2 decimals for
// parts graded by decimal places (molar mass, buret volume), or 4 sf otherwise.
function typeFor(part, v) {
  if (part.sf) return sigText(v, part.sf);
  if (part.tolAbs !== undefined && part.tolRel === 0) return Number(v).toFixed(2);
  return sigText(v, 4);
}
function relDiff(a, b) { return Math.abs(a - b) / Math.max(Math.abs(b), 1e-300); }

class Recorder {
  constructor(guide) { this.guide = guide; this.counts = {}; this.faults = {}; this.checks = {}; }
  check(section, name, n) { const k = section + ' | ' + name; this.checks[k] = (this.checks[k] || 0) + (n === undefined ? 1 : n); }
  count(section, n) { this.counts[section] = (this.counts[section] || 0) + (n || 1); }
  fault(section, code, detail, example) {
    const k = section + ' | ' + code;
    if (!this.faults[k]) this.faults[k] = { section, code, n: 0, detail, examples: [] };
    const f = this.faults[k]; f.n++;
    if (f.examples.length < 4) f.examples.push(example);
  }
  toJSON() { return { guide: this.guide, problems: this.counts, checks: this.checks, faults: Object.values(this.faults) }; }
}

// Short, number-free signature of a feedback message (so the same slip in different problems groups together).
function slipKey(msg) { return text(msg).replace(/[\d.]+/g, '#').replace(/\s+/g, ' ').slice(0, 60); }
// Collect every string in a problem object (one level of parts/errors) for bad-token scanning.
function strings(P) {
  const out = [];
  const push = (where, s) => { if (typeof s === 'string') out.push([where, s]); };
  ['ctx', 'eqHTML', 'question', 'guided', 'solution', 'note'].forEach(k => push(k, P[k]));
  (P.hints || []).forEach((h, i) => push('hint' + i, h));
  (P.parts || []).forEach((p, i) => {
    ['label', 'unit', 'show', 'generic'].forEach(k => push('part' + i + '.' + k, p[k]));
    (p.errors || []).forEach((e, j) => push('part' + i + '.err' + j, e.msg));
    if (typeof p.wrongMsg === 'function') {
      (p.options || []).forEach(o => { if (o !== p.answer) push('part' + i + '.wrongMsg', p.wrongMsg(o)); });
    }
  });
  return out;
}

// Generic checks that apply to every generated problem.
function genericChecks(rec, sec, G, P, ex) {
  for (const [where, s] of strings(P)) {
    rec.check(sec, 'bad-token scan');
    const hits = badTokens(s);
    if (hits.length) rec.fault(sec, 'bad-token', 'Rendered text contains NaN/undefined/Infinity/null/[object Object]', { where, hits, ex });
  }
  // Quantities displayed as zero (e.g. "0.00 g", "0 mL") anywhere in the problem, hints or solution.
  for (const [where, s] of strings(P)) {
    const t = text(s).replace(/×\s*10\S*/g, '');
    const m = t.match(/(^|[^\d.\-−])0(?:\.0+)?(?![\d.])\s*(?:g|mol|mL|L|M|atm|K|%|kPa|mmHg)\b/);
    rec.check(sec, 'zero-quantity scan');
    if (m) rec.fault(sec, 'zero-quantity-displayed', 'A quantity is displayed as zero', { where, near: t.slice(Math.max(0, m.index - 60), m.index + 40), ex });
  }
  // The worked solution must show each part's displayed answer.
  if (P.solution) {
    const solT = eNote(P.solution);
    (P.parts || []).forEach((part, i) => {
      if (part.type === 'choice') return;
      rec.check(sec, 'solution shows the displayed answer');
      const shown = eNote(part.show).split(' ')[0];
      if (solT.indexOf(shown) < 0) rec.fault(sec, 'solution-missing-answer', 'Worked solution does not contain the displayed answer', { part: i, shown, ex });
    });
  }
  (P.parts || []).forEach((part, i) => {
    if (part.type === 'choice') {
      rec.check(sec, 'choice answer accepted');
      const r = G.gradePart(part, part.answer);
      if (r.status !== 'correct') rec.fault(sec, 'choice-answer-rejected', 'The correct choice is not graded correct', { part: i, ex });
      if (part.options.indexOf(part.answer) < 0) rec.fault(sec, 'choice-answer-missing', 'Correct answer not among the options', { part: i, ex });
      return;
    }
    rec.check(sec, 'answer finite');
    if (!isFinite(part.answer) || !(part.answer > 0)) rec.fault(sec, 'answer-not-positive-finite', 'Answer is not a finite positive number', { part: i, answer: part.answer, ex });
    (part.errors || []).forEach(e => { if (!isFinite(e.value)) rec.fault(sec, 'error-value-nonfinite', 'A slip value is not finite', { part: i, ex }); });
    // The displayed answer, typed exactly as shown, must be accepted.
    const vis = text(part.show), en = eNote(part.show);
    for (const typed of [vis, en]) {
      rec.check(sec, 'displayed answer accepted');
      const r = G.gradePart(part, typed);
      if (r.status !== 'correct') rec.fault(sec, 'displayed-answer-not-accepted', 'Typing the page’s own displayed answer is not graded correct',
        { part: i, label: text(part.label), typed, status: r.status, msg: r.msg && text(r.msg), answer: part.answer, ex });
    }
    // Each listed slip must produce its own message (not another slip's, not "correct").
    (part.errors || []).forEach((e, j) => {
      if (!isFinite(e.value) || !(e.value > 0)) return;
      const key = slipKey(e.msg);
      rec.check(sec, 'slip message reachable: ' + key);
      const typed = typeFor(part, e.value);
      const r = G.gradePart(part, typed);
      if (r.status === 'correct' || r.status === 'sig') rec.fault(sec, 'slip-graded-correct', 'A listed slip value is graded correct', { part: i, typed, msg: text(e.msg), ex });
      else if (r.msg !== e.msg) rec.fault(sec, 'slip-message-shadowed: ' + key + ' => ' + slipKey(r.msg || ''), 'A listed slip shows a different message (an earlier slip or the generic message wins)',
        { part: i, typed, intended: text(e.msg).slice(0, 160), shown: text(r.msg || '').slice(0, 160), ex });
    });
  });
}

// Displayed answer vs my value: flag when the shown number is more than half a unit in its last place away from my
// value AND the page's internal answer is >0.1% from mine (i.e. not an ordinary rounding-boundary flip).
function lastDigitCheck(rec, sec, part, mine, ex, what) {
  if (part.type === 'choice') return;
  rec.check(sec, 'displayed digits vs independent value');
  const s = eNote(part.show).split(' ')[0], v = Number(s);
  const m = s.match(/^(\d*)\.?(\d*)(?:e(-?\d+))?$/); if (!m) return;
  const exp = m[3] ? Number(m[3]) : 0, dec = m[2].length;
  let ulp = Math.pow(10, exp - dec);
  if (!m[2] && !m[3]) { const intDigits = m[1].replace(/^0+/, ''); const sf = part.sf || intDigits.length; ulp = Math.pow(10, Math.max(0, intDigits.length - sf)); }
  if (Math.abs(v - mine) > 0.55 * ulp && relDiff(part.answer, mine) > 0.001)
    rec.fault(sec, 'displayed-last-digit-off' + (what ? ': ' + what : ''), 'Displayed answer is off in its last digit compared with the value from the listed atomic masses (page rounds molar masses to 2 decimals before using them)',
      { mine: sigText(mine, 5), shown: text(part.show), ex });
}
// Is a blank accepted when the student types `typed`? (Same rule as checkBlanks in the page.)
function blankOK(G, b, typed) {
  const inp = G.parseInput(String(typed)); const v = inp ? inp.value : NaN;
  return isFinite(v) && Math.abs(v - b.want) <= b.tol * Math.abs(b.want) + 1e-12;
}
function checkBlank(rec, sec, G, P, key, typedList, ex) {
  const b = P.blanks && P.blanks[key];
  if (!b) { rec.fault(sec, 'blank-missing', 'Expected guided blank not present', { key, ex }); return; }
  for (const typed of typedList) {
    rec.check(sec, 'guided blank accepted');
    if (!blankOK(G, b, typed)) rec.fault(sec, 'blank-rejects-correct-value', 'A guided-setup blank rejects a correct value', { key, typed, want: b.want, tol: b.tol, ex });
  }
}
// Spot-check a named slip computed independently: type it, expect a message containing `expect`.
function checkSlip(rec, sec, G, part, value, expect, name, ex) {
  if (!isFinite(value) || !(value > 0)) return;
  if (relDiff(value, part.answer) < 0.02) return;      // this slip happens to give the right answer here
  rec.check(sec, 'named slip: ' + name);
  const typed = typeFor(part, value);
  const r = G.gradePart(part, typed);
  const msg = text(r.msg || '');
  const ok = (r.status === 'wrong' || r.status === 'close') && (expect instanceof RegExp ? expect.test(msg) : msg.indexOf(expect) >= 0);
  if (!ok) rec.fault(sec, 'named-slip-wrong-message: ' + name, 'Independently computed slip does not get its specific message',
    { typed, status: r.status, shown: msg.slice(0, 200), expected: String(expect), ex });
}

module.exports = { lastDigitCheck, text, eNote, BAD, badTokens, typeFor, sigText, relDiff, Recorder, genericChecks, blankOK, checkBlank, checkSlip };
