'use strict';
// v0.3.1 tests: T1 major is free input (+ quick-pick chips), not a bare
// stance. Before this fix the game never named a major at all: the only
// occurrence of 会计 anywhere was an H0 omen line in the childhood
// fragments ("你妈说隔壁家孩子学了会计"), not an option.
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
for (const f of ['rng.js', 'data.js', 'gaokao-lines.js', 'era-events.js', 'era.js', 'engine.js', 'ai-review.js', 'analytics.js', 'game.js']) {
  vm.runInContext(fs.readFileSync(path.join(REPO, 'js', f), 'utf8'), sandbox, { filename: f });
}
const ctx = (code) => vm.runInContext(code, sandbox);
const screenHtml = () => (els.get('#screen') ? els.get('#screen')._html : '');
function click(act, id) {
  clickHandler({ target: { closest: () => ({ dataset: { act, id: id === undefined ? '' : String(id) } }) } });
}
function toT1(money, h0value) {
  ctx(`G = { state: newRun(12345, { difficulty: 'normal' }), rng: makeRng(12345), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 };
    G.state.origin = { familyKey: 'model', attrs: { money: ${money === undefined ? 5 : money}, health: 85, stress: 10 } };
    G.state.flags.familySafety = '家里能接住你一次，但只有一次。';
    ${h0value ? `G.state.sealed.H0 = { value: ${h0value}, omens: [{ text: '你妈说隔壁家孩子学了会计。' }] };` : ''}
    screenT1();`);
  click('t1-region-pick', 'shandong');
}

toT1();
check('T1 has free-input major field', screenHtml().includes('id="t1-major"'));
check('T1 has 10 quick-pick chips incl. 会计', ['计算机', '临床医学', '法学', '金融', '会计', '新闻传播', '土木', '英语', '艺术设计', '师范'].every((m) => screenHtml().includes(`data-id="${m}"`)));
click('t1-major-chip', '临床医学');
check('chip fills the input', sandbox.document.querySelector('#t1-major').value === '临床医学');

// insist with empty input -> refused, nothing signed
toT1();
sandbox.document.querySelector('#t1-major').value = '';
click('t1-pick', 'insist');
check('insist with empty major is refused', sandbox.__alerts.length > 0 && ctx('G.state.commitments.A') === undefined);

// insist with a typed major -> that major, k 1.3, family -1
toT1();
{
  const fam0 = ctx('G.state.attrs.family');
  sandbox.document.querySelector('#t1-major').value = '会计';
  click('t1-pick', 'insist');
  click('t1-confirm');
  check('insist keeps the typed major', ctx('G.state.major') && ctx('G.state.major').name === '会计' && ctx('G.state.major').source === 'self');
  check('insist sets k 1.3', ctx('G.state.flags.majorK') === 1.3);
  check('insist costs family -1', ctx('G.state.attrs.family') === fam0 - 1);
  check('signed card names the major', screenHtml().includes('你的专业') && screenHtml().includes('会计'));
  check('commitment A records the major', ctx('G.state.commitments.A').snapshot.major === '会计');
}

// obey -> parents' major regardless of input
toT1(5, 70);
check('tampered screen names 省内师范', screenHtml().includes('第一志愿已经被改成了省内师范'));
{
  const fam0 = ctx('G.state.attrs.family');
  sandbox.document.querySelector('#t1-major').value = '计算机';
  click('t1-pick', 'obey');
  click('t1-confirm');
  check('obey gives 省内师范', ctx('G.state.major').name === '省内师范' && ctx('G.state.major').source === 'parents');
  check('obey sets k 1.0', ctx('G.state.flags.majorK') === 1.0);
  check('obey gains family +1', ctx('G.state.attrs.family') === fam0 + 1);
}

// negotiate -> typed major, k 1.0, family unchanged
toT1();
{
  const fam0 = ctx('G.state.attrs.family');
  sandbox.document.querySelector('#t1-major').value = '法学';
  click('t1-pick', 'negotiate');
  click('t1-confirm');
  check('negotiate keeps typed major at k 1.0', ctx('G.state.major').name === '法学' && ctx('G.state.flags.majorK') === 1.0);
  check('negotiate leaves family unchanged', ctx('G.state.attrs.family') === fam0);
}

// insist + poor family -> self-funded
toT1(2);
sandbox.document.querySelector('#t1-major').value = '土木';
click('t1-pick', 'insist');
click('t1-confirm');
check('insist with poor family sets selfFunded', ctx('G.state.flags.selfFunded') === true);
check('signed card notes self-funded', screenHtml().includes('自挣学费'));

// T5 review names the major
{
  ctx(`G.state.major = { name: '会计', source: 'self' }; G.state.flags.majorK = 1.3; screenT5();`);
  check('T5 intro names the major', screenHtml().includes('你的专业是') && screenHtml().includes('会计'));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
