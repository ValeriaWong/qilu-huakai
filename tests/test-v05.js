'use strict';
// v0.4 tests (updated v0.5.1: ad boost removed): Gaokao score
// (Shandong 2026 policy), sealed score, admission outcomes
// (admit / 调剂 / 专科). Region lines are the real 2026 Shandong
// numbers (verified 2026-11-16: 特招线 525, 一段线 442, 二段线 150);
// per-major lines are game reference lines, not real admission data.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function click(act, id) {
  clickHandler({ target: { closest: () => ({ dataset: { act, id: id === undefined ? '' : String(id) } }) } });
}
function toT1(money) {
  ctx(`G = { state: newRun(12345, { difficulty: 'normal' }), rng: makeRng(12345), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 };
    G.state.origin = { familyKey: 'model', attrs: { money: ${money === undefined ? 5 : money}, health: 85, stress: 10 } };
    G.state.flags.familySafety = '家里能接住你一次，但只有一次。';
    screenT1();`);
  click('t1-region-pick', 'shandong');
}
function setGaokao(base, bonus) {
  ctx(`G.state.flags.gaokao = { region: 'shandong', base: ${base}, bonus: ${bonus || 0}, adsWatched: 0, line1: 442, specialLine: 525 }; screenT1();`);
}

(async () => {
  // ---------- region data (real 2026 Shandong numbers) ----------
  const SD = ctx('GAOKAO_REGIONS.shandong');
  check('Shandong 2026: 3+3, 750', SD.model === '3+3' && SD.total === 750 && SD.year === 2026);
  check('Shandong 2026 lines: 525/442/150', SD.specialLine === 525 && SD.line1 === 442 && SD.line2 === 150);
  check('Shandong regular batch: 96 choices', SD.batchChoices === 96);

  // ---------- admission lines ----------
  const E = ctx('({ majorAdmissionLine, bestReachableMajor, resolveAdmission })');
  check('major line: 会计 532', E.majorAdmissionLine('会计', 442) === 532);
  check('major line: 临床医学 602', E.majorAdmissionLine('临床医学', 442) === 602);
  check('major line: 艺术设计 sits at 331 (75% of 一段线, §9.16)', E.majorAdmissionLine('艺术设计', 442) === 331);
  check('major line: unlisted major uses default +60', E.majorAdmissionLine('天体物理', 442) === 502);
  check('best reachable at 500 is 土木', E.bestReachableMajor(500, 442) === '土木');
  check('best reachable at 442 is 艺术设计', E.bestReachableMajor(442, 442) === '艺术设计');
  check('best reachable at 700 is 临床医学', E.bestReachableMajor(700, 442) === '临床医学');
  {
    const s = ctx('newRun(1, {})');
    s.flags.gaokao = { base: 600, bonus: 0, line1: 442 };
    const r = E.resolveAdmission(s, '计算机', 1.3);
    check('admit: score above line keeps major + stance k', r.major === '计算机' && r.tier === '本科' && r.k === 1.3);
    s.flags.gaokao.base = 500;
    const r2 = E.resolveAdmission(s, '计算机', 1.3);
    check('below line -> 调剂 to reachable major, k stays 1.3 (P1-e: 调剂不降 k)', r2.major === '土木' && r2.tier === '本科（调剂）' && r2.k === 1.3 && r2.adjusted === true && /调剂/.test(r2.note));
    s.flags.gaokao.base = 400;
    const r3 = E.resolveAdmission(s, '计算机', 1.3);
    check('below 一段线 -> 专科, k 0.8', r3.major === '计算机' && r3.tier === '专科' && r3.k === 0.8);
  }

  // ---------- T1 screen: score roll + policy ----------
  toT1();
  {
    const g = ctx('G.state.flags.gaokao');
    check('score rolled region-relative (Shandong 422-662)', g.base >= 422 && g.base <= 662, 'base=' + g.base);
    check('T1 shows Shandong 2026 policy', screenHtml().includes('山东 2026') && screenHtml().includes('一段线 442') && screenHtml().includes('特殊类型批已取消') && screenHtml().includes('96 个'));
    check('score survives re-render', (() => { const b = g.base; ctx('screenT1();'); return ctx('G.state.flags.gaokao').base === b; })());
  }

  // ---------- major line feedback ----------
  setGaokao(500);
  sandbox.document.querySelector('#t1-major').value = '会计';
  ctx('updateT1MajorLine();');
  check('line feedback shows gap', els.get('#t1-major-line').textContent.includes('参考线 532') && els.get('#t1-major-line').textContent.includes('差 32 分'), els.get('#t1-major-line').textContent);

  // ---------- v0.5.1: ad boost removed, score sealed ----------
  // An old save carrying a bonus must display the base only, with a
  // one-line migration note; resolveAdmission must ignore the bonus.
  setGaokao(500, 30);
  check('old-save bonus ignored in display', screenHtml().includes('高考总分：500') && !screenHtml().includes('高考总分：530') && screenHtml().includes('广告加分') && screenHtml().includes('已按新规则失效'));
  check('no ad button anymore', !screenHtml().includes('data-act="t1-ad"') && !screenHtml().includes('看广告提分'));
  check('diagnosis button present', screenHtml().includes('data-act="t1-diagnose"'));
  {
    const s = ctx('newRun(1, {})');
    s.flags.gaokao = { base: 500, bonus: 30, line1: 442 };
    const r = E.resolveAdmission(s, '计算机', 1.3);
    check('old-save bonus ignored in admission', r.major === '土木' && r.tier === '本科（调剂）', JSON.stringify(r));
  }
  // New saves carry no bonus field at all.
  toT1();
  check('new save has no bonus field', ctx(`'bonus' in G.state.flags.gaokao`) === false);

  // ---------- pickT1 outcomes ----------
  setGaokao(500);
  sandbox.document.querySelector('#t1-major').value = '会计';
  click('t1-pick', 'insist');
  click('t1-confirm');
  check('insist below line -> 调剂 card (P1-e: k stays 1.3)', ctx('G.state.major').tier === '本科（调剂）' && ctx('G.state.major').name === '土木' && ctx('G.state.flags.majorK') === 1.3 && ctx('G.state.flags.adjusted') === true && screenHtml().includes('调剂'));
  // v1.4 (P0-1): A 卡已签署不可重签——每个 pickT1 流程从全新 state 开始。
  toT1();
  setGaokao(540);
  sandbox.document.querySelector('#t1-major').value = '会计';
  click('t1-pick', 'insist');
  click('t1-confirm');
  check('insist above line -> chosen major, k 1.3', ctx('G.state.major').name === '会计' && ctx('G.state.major').tier === '本科' && ctx('G.state.flags.majorK') === 1.3);
  toT1();
  setGaokao(400);
  sandbox.document.querySelector('#t1-major').value = '会计';
  click('t1-pick', 'insist');
  click('t1-confirm');
  check('insist below 一段线 -> 专科, k 0.8', ctx('G.state.major').name === '会计' && ctx('G.state.major').tier === '专科' && ctx('G.state.flags.majorK') === 0.8 && screenHtml().includes('专科批次'));
  {
    ctx(`G.state.major = { name: '会计', source: 'self', tier: '本科（调剂）' }; G.state.flags.majorK = 1.0; screenT5();`);
    check('T5 intro shows tier', screenHtml().includes('会计') && screenHtml().includes('本科（调剂）'));
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
