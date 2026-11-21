'use strict';
// v0.5 tests: region picker + the three Northeast provinces. Region lines
// are the real 2026 numbers (verified 2026-11-16): Liaoning 物理 344/508,
// Jilin 物理 321/473, Heilongjiang 物理 340/464; batch counts 112/50/45.
// All three use 物理类 lines (历史类 lines are in each region's note).
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
function click(act, id) {
  clickHandler({ target: { closest: () => ({ dataset: { act, id: id === undefined ? '' : String(id) } }) } });
}
function toT1Region() {
  ctx(`G = { state: newRun(12345, { difficulty: 'normal' }), rng: makeRng(12345), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 };
    G.state.origin = { familyKey: 'model', attrs: { money: 5, health: 85, stress: 10 } };
    G.state.flags.familySafety = '家里能接住你一次，但只有一次。';
    screenT1();`);
}

// ---------- region data (real 2026 numbers) ----------
{
  const R = ctx('GAOKAO_REGIONS');
  check('4 regions available', Object.keys(R).length === 4);
  const LN = R.liaoning, JL = R.jilin, HLJ = R.heilongjiang, SD = R.shandong;
  check('Liaoning 2026: 物理 344/508/150, 112 choices', LN.line1 === 344 && LN.specialLine === 508 && LN.line2 === 150 && LN.batchChoices === 112 && LN.model === '3+1+2' && LN.track === '物理类');
  check('Jilin 2026: 物理 321/473/160, 50 choices', JL.line1 === 321 && JL.specialLine === 473 && JL.line2 === 160 && JL.batchChoices === 50 && JL.model === '3+1+2' && JL.track === '物理类');
  check('Heilongjiang 2026: 物理 340/464/150, 45 choices', HLJ.line1 === 340 && HLJ.specialLine === 464 && HLJ.line2 === 150 && HLJ.batchChoices === 45 && HLJ.model === '3+1+2' && HLJ.track === '物理类');
  check('Shandong unchanged', SD.line1 === 442 && SD.specialLine === 525 && SD.batchChoices === 96 && SD.batchName === '常规批');
  check('Northeast uses 院校专业组 where the province does', JL.batchUnit === '院校专业组平行志愿' && HLJ.batchUnit === '院校专业组平行志愿' && LN.batchUnit === '“专业+学校”平行志愿');
}

// ---------- picker flow ----------
toT1Region();
check('fresh T1 shows the region picker', screenHtml().includes('你在哪里参加高考？'));
check('picker lists all 4 regions', ['山东', '辽宁', '吉林', '黑龙江'].every((n) => screenHtml().includes(n)));
check('no score before picking', ctx('G.state.flags.gaokao') === undefined && !screenHtml().includes('高考总分'));

click('t1-region-pick', 'liaoning');
{
  const g = ctx('G.state.flags.gaokao');
  check('Liaoning pick sets region + lines', g.region === 'liaoning' && g.line1 === 344 && g.specialLine === 508);
  check('Liaoning score is region-relative (324-564)', g.base >= 324 && g.base <= 564, 'base=' + g.base);
  check('T1 screen shows 辽宁 + 112 个', screenHtml().includes('辽宁 2026') && screenHtml().includes('一段线 344') && screenHtml().includes('112 个'));
  check('picker no longer shown on re-render', (() => { ctx('screenT1();'); return !screenHtml().includes('你在哪里参加高考？'); })());
  check('region cannot be re-picked', (() => { ctx(`pickT1Region('jilin');`); return ctx('G.state.flags.gaokao').region === 'liaoning'; })());
}

toT1Region();
click('t1-region-pick', 'jilin');
{
  const g = ctx('G.state.flags.gaokao');
  check('Jilin pick: base 301-541', g.base >= 301 && g.base <= 541, 'base=' + g.base);
  check('Jilin screen shows 院校专业组', screenHtml().includes('吉林 2026') && screenHtml().includes('50 个院校专业组平行志愿'));
}

toT1Region();
click('t1-region-pick', 'heilongjiang');
{
  const g = ctx('G.state.flags.gaokao');
  check('Heilongjiang pick: base 320-560', g.base >= 320 && g.base <= 560, 'base=' + g.base);
  check('Heilongjiang screen shows 45 个院校专业组', screenHtml().includes('黑龙江 2026') && screenHtml().includes('45 个院校专业组平行志愿'));
}

toT1Region();
click('t1-region-pick', 'shandong');
check('Shandong pick: base 422-662', (() => { const g = ctx('G.state.flags.gaokao'); return g.base >= 422 && g.base <= 662; })());

// ---------- admission under Liaoning lines ----------
toT1Region();
click('t1-region-pick', 'liaoning');
ctx(`G.state.flags.gaokao.base = 400; G.state.flags.gaokao.bonus = 0; screenT1();`);
sandbox.document.querySelector('#t1-major').value = '会计';
click('t1-pick', 'insist');
click('t1-confirm');
check('Liaoning: 400 vs 会计线 434 -> 调剂 (P1-e: k stays 1.3)', ctx('G.state.major').tier === '本科（调剂）' && ctx('G.state.flags.majorK') === 1.3 && ctx('G.state.flags.adjusted') === true);
toT1Region();
click('t1-region-pick', 'liaoning');
ctx(`G.state.flags.gaokao.base = 450; G.state.flags.gaokao.bonus = 0; screenT1();`);
sandbox.document.querySelector('#t1-major').value = '会计';
click('t1-pick', 'insist');
click('t1-confirm');
check('Liaoning: 450 vs 会计线 434 -> admitted, k 1.3', ctx('G.state.major').name === '会计' && ctx('G.state.major').tier === '本科' && ctx('G.state.flags.majorK') === 1.3);

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
