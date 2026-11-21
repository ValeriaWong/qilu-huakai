'use strict';
// Compact v0.2 regression after the v0.3 AI-review change (/tmp/test-v02.js
// was lost to /tmp cleanup). Covers the v0.2 paths v0.3 could have touched:
// startYear event gates, settleYear (restBonus stays dead), slice borrow gap,
// and the old-save fallback (venture without .cost pays archetype.cost).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const REPO = path.join(__dirname, '..');

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('PASS  ' + name);
  else { failures += 1; console.log('FAIL  ' + name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); }
}
const els = new Map();
function makeEl(sel) {
  const el = {
    _html: '', _value: '', disabled: false, textContent: '',
    listeners: {},
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
    get value() { return this._value; },
    set value(v) { this._value = String(v); },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
  };
  els.set(sel, el);
  return el;
}
let clickHandler = null;
const sandbox = {
  console, setTimeout, clearTimeout,
  document: {
    querySelector(sel) { return els.get(sel) || makeEl(sel); },
    addEventListener(type, fn) { if (type === 'click') clickHandler = fn; },
  },
  window: { scrollTo() {} },
  alert(msg) { sandbox.__alerts.push(String(msg)); },
  __alerts: [],
  localStorage: (() => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
    };
  })(),
};
vm.createContext(sandbox);
for (const f of ['rng.js', 'data.js', 'interpersonal.js', 'stocks.js', 'gaokao-lines.js', 'era-events.js', 'era.js', 'engine.js', 'ai-review.js', 'analytics.js', 'game.js']) {
  vm.runInContext(fs.readFileSync(path.join(REPO, 'js', f), 'utf8'), sandbox, { filename: f });
}
const ctx = (code) => vm.runInContext(code, sandbox);
const screenHtml = () => (els.get('#screen') ? els.get('#screen')._html : '');
function firstH2(html) {
  const m = html.match(/<h2>(.*?)<\/h2>/);
  return m ? m[1].replace(/<[^>]+>/g, '') : '';
}
function freshState() {
  ctx(`G = { state: newRun(12345, { difficulty: 'normal' }), rng: makeRng(12345), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 };
    G.state.origin = { familyKey: 'model' };`);
}
function poolTitles(turn, seeds) {
  const set = new Set();
  for (const seed of seeds) {
    // v1.2 (P0-1): 同一年重进不再重抽事件——每种子必须用一个新 state
    // 采样，否则 20 个种子全是第一次抽到的那个事件。
    freshState();
    ctx(`G.rng = makeRng(${seed}); G.state.rngState = ${seed}; startYear(${turn});`);
    set.add(firstH2(screenHtml()));
  }
  return set;
}
const E = ctx('({ settleYear, resolveVentureYear, makeRng })');
const DIFF = ctx('DIFFICULTIES.normal');

{
  freshState();
  const t2 = poolTitles(2, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  check('T2 pool has no wedding/race/rent/boundary', ![...t2].some((t) => /婚礼|竞赛|涨租|工作群/.test(t)), [...t2].join('|'));
  check('T2 pool only aid/health/idea', [...t2].every((t) => /奖助学金|体检报告|赚钱的点子/.test(t)), [...t2].join('|'));
  freshState();
  const t7 = poolTitles(7, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  check('T7 pool can include wedding', [...t7].some((t) => /婚礼/.test(t)), [...t7].join('|'));
  check('T7 pool has no aid/intern', ![...t7].some((t) => /奖助学金|实习/.test(t)), [...t7].join('|'));
}
{
  const s = ctx('newRun(11, {})');
  s.attrs.stress = 20; s.attrs.health = 80; s.attrs.debt = 0;
  s.flags.restBonus = true; // stale flag from a v0.1 save
  E.settleYear(s, DIFF);
  check('settleYear ignores stale restBonus', s.attrs.stress === 22, 'stress=' + s.attrs.stress);
}
{
  const s = ctx('newRun(12, {})');
  s.attrs.money = 0.5;
  const opts = ctx('sliceBorrowOptions')(s);
  check('borrow gap 2.5 for money 0.5', opts.some((o) => /借 2\.5 万/.test(o.text) && o.fx.money === 2.5), JSON.stringify(opts.map((o) => o.text)));
  s.attrs.money = 5;
  const opts2 = ctx('sliceBorrowOptions')(s);
  check('borrow with savings -> 靠储蓄', opts2.some((o) => /靠储蓄/.test(o.text)));
}
{
  // Old save: venture without .cost must pay the archetype cost (2), not NaN/0.
  const s = ctx('newRun(13, {})');
  s.attrs.money = 5;
  const arch = ctx('VENTURE_ARCHETYPES').find((a) => a.id === 'ai-tool');
  const v = { id: 'vold', name: 'AI 工具创业：旧线', archetype: 'ai-tool', text: '旧', stage: 0, status: 'validating', createdTurn: 2 };
  v.sealed = { roll: 1, chance: 99, stage: 0, success: true };
  E.resolveVentureYear(s, E.makeRng(1), v, arch, true);
  check('old-save venture pays archetype cost', v.status === 'active' && s.attrs.money === 3, 'status=' + v.status + ' money=' + s.attrs.money);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
