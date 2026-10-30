// Loads the inline <script> of a study-guide HTML file into a Node vm context
// (document is undefined there, so only the chemistry/problem logic runs) and
// returns its module.exports plus a seeded Math.random with a call budget.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REPO = path.resolve(__dirname, '..', '..', '..');

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function extractScript(file) {
  const html = fs.readFileSync(path.join(REPO, file), 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no inline script in ' + file);
  return m[1];
}

// budget: max Math.random calls between resets; exceeding it throws (detects a stuck generator loop).
// opts.extreme: a quarter of draws are boundary values (0, the largest double below 1, 0.5) to hit table edges.
function loadGuide(file, seed, opts) {
  const code = extractScript(file);
  const base = mulberry32(seed >>> 0);
  const EDGE = [0, 0.9999999999999999, 0.5, 1e-12, 0.999999];
  const rng = opts && opts.extreme ? () => { const r = base(); return r < 0.25 ? EDGE[Math.floor(base() * EDGE.length)] : base(); } : base;
  const ctl = { calls: 0, budget: 2e6 };
  const sandbox = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  sandbox.__rand = () => {
    if (++ctl.calls > ctl.budget) throw new Error('RNG_BUDGET_EXCEEDED (generator loop did not terminate)');
    return rng();
  };
  vm.runInContext('Math.random = __rand;', sandbox);
  vm.runInContext(code, sandbox, { filename: file });
  const G = sandbox.module.exports;
  return { G, ctl, sandbox };
}

module.exports = { loadGuide, extractScript, mulberry32, REPO };
