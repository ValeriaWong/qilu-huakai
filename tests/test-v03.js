'use strict';
// v0.3 tests: AI review for the venture line (ai-review.js + game.js confirm
// flow + engine.js costOverride). No network: fetch is stubbed. The live
// endpoint was verified separately via python on 2026-11-16 (GET 200,
// CORS *, clean JSON verdict; one transient disconnect, retry succeeded).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const REPO = path.join(__dirname, '..');

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('PASS  ' + name);
  else { failures += 1; console.log('FAIL  ' + name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); }
}

// --- stub DOM ---
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
const VA = ctx('VENTURE_ARCHETYPES');
const TK = ctx('THEME_KEYWORDS');
const screenHtml = () => (els.get('#screen') ? els.get('#screen')._html : '');
function click(act, id) {
  clickHandler({ target: { closest: () => ({ dataset: { act, id: id === undefined ? '' : String(id) } }) } });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freshState(money) {
  ctx(`G = { state: newRun(12345, { difficulty: 'normal' }), rng: makeRng(12345), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 };
    G.state.attrs.money = ${money === undefined ? 5 : money};
    G.state.origin = { familyKey: 'model' };`);
}
// Draw years until ev-idea shows up (T2 pool: aid/health/idea).
function drawIdeaYear() {
  for (let seed = 1; seed <= 200; seed += 1) {
    ctx(`G.rng = makeRng(${seed}); G.state.rngState = ${seed}; startYear(2);`);
    if (screenHtml().includes('你有个赚钱的点子')) return true;
  }
  return false;
}

(async () => {
  // ---------- ai-review.js unit tests ----------
  const AI = ctx('({ buildVentureReviewPrompt, parseVentureVerdict, reviewVentureWithAI })');
  const guess = VA.find((a) => a.id === 'ai-tool');
  const prompt = AI.buildVentureReviewPrompt('我想做一个 AI 求职助手', '身边真有人付费', 'AI 工具创业');
  check('prompt carries idea + explanation + guess', prompt.includes('AI 求职助手') && prompt.includes('身边真有人付费') && prompt.includes('AI 工具创业'));
  check('parse clean JSON', (() => { const r = AI.parseVentureVerdict('{"reasonable": true, "archetype": "content", "cost": 1, "reason": "ok"}', VA, guess); return r.ok && r.verdict.archetypeId === 'content' && r.verdict.cost === 1; })());
  check('parse fenced JSON', (() => { const r = AI.parseVentureVerdict('```json\n{"reasonable": false, "archetype": "local", "cost": 5, "reason": "no"}\n```', VA, guess); return r.ok && r.verdict.reasonable === false && r.verdict.cost === 5; })());
  check('parse unknown archetype falls back to guess', (() => { const r = AI.parseVentureVerdict('{"reasonable": true, "archetype": "nope", "cost": 2, "reason": "x"}', VA, guess); return r.ok && r.verdict.archetypeId === 'ai-tool'; })());
  check('parse cost clamped to 15', (() => { const r = AI.parseVentureVerdict('{"reasonable": true, "archetype": "local", "cost": 99, "reason": "x"}', VA, guess); return r.ok && r.verdict.cost === 15; })());
  check('parse missing cost uses archetype cost', (() => { const r = AI.parseVentureVerdict('{"reasonable": true, "archetype": "ecommerce", "reason": "x"}', VA, guess); return r.ok && r.verdict.cost === 3; })());
  check('parse garbage fails', AI.parseVentureVerdict('hello world', VA, guess).ok === false);
  check('review retries once after a drop then succeeds', await (async () => {
    let calls = 0;
    const stub = async () => {
      calls += 1;
      if (calls === 1) throw new Error('socket hang up');
      return { ok: true, text: async () => '{"reasonable": true, "archetype": "knowledge", "cost": 1, "reason": "ok"}' };
    };
    const r = await AI.reviewVentureWithAI('卖课', '', VA, guess, stub, 5000);
    return r.ok && r.verdict.archetypeId === 'knowledge' && calls === 2;
  })());
  check('review fails cleanly when fetch throws twice', await (async () => {
    const r = await AI.reviewVentureWithAI('卖课', '', VA, guess, async () => { throw new Error('down'); }, 5000);
    return r.ok === false && /没连上/.test(r.error);
  })());
  check('review fails cleanly on HTTP 500', await (async () => {
    const r = await AI.reviewVentureWithAI('卖课', '', VA, guess, async () => ({ ok: false, status: 500 }), 5000);
    return r.ok === false && /500/.test(r.error);
  })());

  // ---------- engine.js: costOverride + validating branch ----------
  const E = ctx('({ startVenture, resolveVentureYear, makeRng })');
  {
    const s = ctx('newRun(7, {})');
    s.attrs.money = 5;
    const arch = VA.find((a) => a.id === 'ai-tool');
    const r = E.startVenture(s, 'AI 求职助手', arch, { costOverride: 3, aiReviewed: true, aiNote: 'AI：成本 3 万合理' });
    check('startVenture honors AI cost override', r.ok && s.attrs.money === 2 && r.venture.cost === 3 && r.venture.aiReviewed === true && r.venture.aiNote === 'AI：成本 3 万合理');
    const poor = ctx('newRun(8, {})');
    poor.attrs.money = 2;
    const r2 = E.startVenture(poor, 'AI 求职助手', arch, { costOverride: 3, aiReviewed: true, aiNote: 'x' });
    check('startVenture blocks when money < AI cost', r2.ok === false && /3 万/.test(r2.error));
  }
  {
    const s = ctx('newRun(9, {})');
    s.attrs.money = 2;
    const arch = VA.find((a) => a.id === 'ai-tool');
    const r = E.startVenture(s, 'AI 求职助手', arch, { validateOnly: true, costOverride: 3, aiReviewed: true, aiNote: '先验证' });
    const v = r.venture;
    v.sealed = { roll: 1, chance: 99, stage: 0, success: true };
    const lines = E.resolveVentureYear(s, E.makeRng(1), v, arch, true);
    check('validating branch charges AI cost, not archetype cost', v.status === 'validating' && s.attrs.money === 2 && lines.join('').includes('要 3 万'));
    s.attrs.money = 5;
    v.sealed = { roll: 1, chance: 99, stage: 0, success: true };
    E.resolveVentureYear(s, E.makeRng(1), v, arch, true);
    check('validating graduates at AI cost', v.status === 'active' && s.attrs.money === 2);
  }

  // ---------- UI: reasonable verdict -> AI cost applied ----------
  freshState(5);
  check('ev-idea draws in T2', drawIdeaYear());
  sandbox.document.querySelector('#idea-text').value = '我想做一个 AI 求职助手，帮人改简历、模拟面试。';
  click('idea-start');
  check('confirm screen shows', screenHtml().includes('确认一下这条线'));
  check('confirm has AI review button', screenHtml().includes('data-act="idea-ai-review"'));
  check('confirm has explanation field', screenHtml().includes('id="idea-why"'));
  sandbox.document.querySelector('#idea-why').value = '身边真有人为改简历付费。';
  sandbox.fetch = async () => ({ ok: true, text: async () => '{"reasonable": true, "archetype": "ai-tool", "cost": 3, "reason": "需求真实，成本合理"}' });
  click('idea-ai-review');
  await sleep(50);
  check('verdict shown as passed', screenHtml().includes('AI 审核通过') && screenHtml().includes('需求真实，成本合理'));
  check('verdict shows AI cost', screenHtml().includes('3 万'));
  click('idea-confirm');
  await sleep(10);
  check('generated line charges AI cost', screenHtml().includes('启动 3 万已付'));
  check('generated line shows AI note', screenHtml().includes('AI 审核：需求真实，成本合理'));
  check('money deducted by AI cost (5->2)', ctx('G.state.attrs.money') === 2);

  // ---------- UI: unreasonable verdict -> direct start closed, validate works ----------
  freshState(5);
  check('ev-idea draws again', drawIdeaYear());
  sandbox.document.querySelector('#idea-text').value = '我想在月球上开奶茶店。';
  click('idea-start');
  sandbox.fetch = async () => ({ ok: true, text: async () => '{"reasonable": false, "archetype": "local", "cost": 5, "reason": "月球没有客流，租金也没法算。"}' });
  click('idea-ai-review');
  await sleep(50);
  check('unreasonable verdict shown', screenHtml().includes('不太成立') && screenHtml().includes('月球没有客流'));
  check('direct start closed after rejection', !screenHtml().includes('data-act="idea-confirm"'));
  click('idea-validate');
  await sleep(10);
  check('validation still offered, shows AI reason', screenHtml().includes('验证开始了') && screenHtml().includes('月球没有客流'));
  check('validation charges nothing', ctx('G.state.attrs.money') === 5);

  // ---------- UI: AI unreachable -> keyword fallback, game still works ----------
  freshState(5);
  check('ev-idea draws third time', drawIdeaYear());
  sandbox.document.querySelector('#idea-text').value = '我想做一个 AI 求职助手。';
  click('idea-start');
  sandbox.fetch = async () => { throw new Error('down'); };
  click('idea-ai-review');
  await sleep(50);
  check('offline fallback note shown', screenHtml().includes('AI 没连上'));
  check('confirm still available offline', screenHtml().includes('data-act="idea-confirm"'));
  click('idea-confirm');
  await sleep(10);
  check('keyword cost applies offline (5->3)', screenHtml().includes('启动 2 万已付') && ctx('G.state.attrs.money') === 3);
  check('no AI note offline', !screenHtml().includes('AI 审核：'));

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
