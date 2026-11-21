'use strict';
// v0.5.1 tests: ad boost -> 志愿诊断 (Allen 2026-11-17: "可以改，改得好").
// Diagnosis is information only: the sealed score never changes; the panel
// shows where the score stands, which majors are reachable at this score
// (one tap to switch = the re-evaluation opportunity), and the 调剂/专科
// paths. Old saves' ad bonus is ignored everywhere.
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
function setGaokao(base, bonus) {
  ctx(`G.state.flags.gaokao = { region: 'shandong', base: ${base}, bonus: ${bonus || 0}, line1: 442, specialLine: 525 }; screenT1();`);
}
function freshState() {
  ctx(`G = { state: newRun(12345, { difficulty: 'normal' }), rng: makeRng(12345), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 };
    G.state.origin = { familyKey: 'model', attrs: { money: 5, health: 85, stress: 10 } };
    G.state.flags.familySafety = '家里能接住你一次，但只有一次。';`);
}

(() => {
  freshState();
  check('ad constants are gone', ctx(`typeof AD_BOOST_POINTS`) === 'undefined' && ctx(`typeof AD_BOOST_MAX`) === 'undefined' && ctx(`typeof AD_VIEW_MS`) === 'undefined');
  check('no completeAdBoost anymore', ctx(`typeof completeAdBoost`) === 'undefined');

  // ---------- panel opens, score untouched ----------
  setGaokao(500);
  check('diagnosis button present, no ad button', screenHtml().includes('data-act="t1-diagnose"') && !screenHtml().includes('data-act="t1-ad"'));
  sandbox.document.querySelector('#t1-major').value = '会计';
  click('t1-diagnose');
  check('panel opens with info-only promise', screenHtml().includes('志愿诊断') && screenHtml().includes('只给信息，不改分数') && screenHtml().includes('封存分数 500'));
  check('panel shows gap for 会计 at 500', screenHtml().includes('参考线 532') && screenHtml().includes('差 32 分'));
  check('panel lists reachable majors', screenHtml().includes('data-act="t1-diag-major"') && screenHtml().includes('土木'));
  check('opening diagnosis changes nothing', ctx('G.state.flags.gaokao').base === 500);

  // ---------- one-tap re-evaluation ----------
  click('t1-diag-major', '土木');
  check('chip switches the major', els.get('#t1-major').value === '土木' && ctx('G.t1MajorDraft') === '土木');
  check('panel stays open after switch', screenHtml().includes('志愿诊断') && screenHtml().includes('土木'));
  check('score still 500 after switch', ctx('G.state.flags.gaokao').base === 500 && screenHtml().includes('高考总分：500'));
  check('switched major now shows 达线', screenHtml().includes('参考线 492') && screenHtml().includes('达线'));

  // ---------- close and reopen: still nothing changed ----------
  click('t1-diag-close');
  check('panel closes', !screenHtml().includes('收起诊断') && !screenHtml().includes('你的封存分数') && screenHtml().includes('data-act="t1-diagnose"'));
  click('t1-diagnose');
  click('t1-diag-close');
  check('repeated open/close never touches score', ctx('G.state.flags.gaokao').base === 500);

  // ---------- below 一段线: 专科 path, no undergrad chips ----------
  setGaokao(400);
  sandbox.document.querySelector('#t1-major').value = '会计';
  click('t1-diagnose');
  check('below 一段线 shows 专科 path', screenHtml().includes('专科批次') && screenHtml().includes('k = 0.8'));
  check('below 一段线 lists no reachable undergrad major', !screenHtml().includes('data-act="t1-diag-major"'));

  // ---------- above the line: 达线 ----------
  setGaokao(540);
  sandbox.document.querySelector('#t1-major').value = '会计';
  click('t1-diagnose');
  check('above line shows 达线', screenHtml().includes('参考线 532') && screenHtml().includes('达线'));

  // ---------- diagnosis does not affect the signed outcome ----------
  setGaokao(500);
  sandbox.document.querySelector('#t1-major').value = '会计';
  click('t1-diagnose');
  click('t1-diag-close');
  click('t1-pick', 'insist');
  click('t1-confirm');
  check('pick after diagnosis still uses sealed score (P1-e: 调剂 k stays 1.3)', ctx('G.state.major').tier === '本科（调剂）' && ctx('G.state.major').name === '土木' && ctx('G.state.flags.majorK') === 1.3 && ctx('G.state.flags.adjusted') === true);

  // ---------- old-save bonus ignored inside diagnosis too ----------
  freshState();
  setGaokao(500, 30);
  sandbox.document.querySelector('#t1-major').value = '会计';
  click('t1-diagnose');
  check('diagnosis uses base, not bonus', screenHtml().includes('封存分数 500') && !screenHtml().includes('封存分数 530'));

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})();
