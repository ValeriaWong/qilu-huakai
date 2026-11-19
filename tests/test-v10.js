'use strict';
// v0.7.1 tests: non-venture guard for the ev-idea free input
// (NONVENTURE-01..). "和父母要钱买上海的房子" hit zero venture keywords
// and fell through to the generic startup archetype; the guard in
// engine.js nonVentureReason now catches such inputs before the archetype
// picker, the confirm screen shows "这不是一条创业线", and the AI review
// can return archetype "none" (reasonable=false) or override with a real
// line (reasonable=true). No network: fetch is stubbed, as in test-v03.
// (P1 work will use test-v11.js; v10 is taken by this bugfix.)
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const REPO = path.join(__dirname, '..');

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('PASS  ' + name);
  else { failures += 1; console.log('FAIL  ' + name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); }
}

// --- stub DOM (same shape as test-v03) ---
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
const VA = ctx('VENTURE_ARCHETYPES');
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
function startIdea(text) {
  sandbox.document.querySelector('#idea-text').value = text;
  click('idea-start');
}

(async () => {
  // ---------- engine.js: nonVentureReason unit tests ----------
  const NV = ctx('nonVentureReason');
  const CV = ctx('classifyVenture');
  const kind = (t) => { const r = NV(t, VA); return r ? r.kind : ''; };
  check('NONVENTURE-01 house: ask-family', kind('和父母要钱买上海的房子') === 'ask-family');
  check('NONVENTURE-02 borrow for down payment: ask-family', kind('找父母借钱付首付') === 'ask-family');
  check('NONVENTURE-03 plain buy house: purchase', kind('我想买房') === 'purchase');
  check('NONVENTURE-04 buy a car: purchase', kind('买辆车') === 'purchase');
  check('NONVENTURE-05 save for betrothal gift: saving', kind('攒钱付彩礼') === 'saving');
  check('NONVENTURE-06 find a job: career', kind('找份工作赚钱') === 'career');
  check('NONVENTURE-07 civil service exam: career', kind('考公务员') === 'career');
  check('NONVENTURE-08 venture keyword wins: borrow to open milk tea', kind('借钱开奶茶店') === '');
  check('NONVENTURE-09 venture keyword wins: AI resume tool', kind('做个 AI 求职助手') === '');
  check('NONVENTURE-10 buy-to-rent is not flagged', kind('买房出租') === '');
  check('NONVENTURE-11 travel content idea is not flagged', kind('做旅游攻略号') === '');
  check('NONVENTURE-12 study-abroad agency is not flagged', kind('开留学中介') === '');
  check('NONVENTURE-13 classifyVenture unchanged: house still generic', CV('和父母要钱买上海的房子', VA).id === 'generic');
  check('NONVENTURE-14 classifyVenture unchanged: milk tea still local', CV('借钱开奶茶店', VA).id === 'local');

  // ---------- ai-review.js: "none" verdict ----------
  const AI = ctx('({ buildVentureReviewPrompt, parseVentureVerdict })');
  const guess = VA.find((a) => a.id === 'ai-tool');
  check('NONVENTURE-15 prompt offers none + not-a-venture rule',
    AI.buildVentureReviewPrompt('和父母要钱买上海的房子', '', '创业项目').includes('none'));
  check('NONVENTURE-16 parse none + unreasonable -> ok, no archetype', (() => {
    const r = AI.parseVentureVerdict('{"reasonable": false, "archetype": "none", "cost": 0, "reason": "买房是消费，不是创业"}', VA, guess);
    return r.ok && r.verdict.reasonable === false && !r.verdict.archetypeId;
  })());
  check('NONVENTURE-17 parse none + reasonable -> falls back to guess', (() => {
    const r = AI.parseVentureVerdict('{"reasonable": true, "archetype": "none", "cost": 1, "reason": "x"}', VA, guess);
    return r.ok && r.verdict.archetypeId === 'ai-tool';
  })());
  check('NONVENTURE-18 parse normal verdict unchanged', (() => {
    const r = AI.parseVentureVerdict('{"reasonable": true, "archetype": "content", "cost": 1, "reason": "ok"}', VA, guess);
    return r.ok && r.verdict.archetypeId === 'content' && r.verdict.cost === 1;
  })());

  // ---------- UI: non-venture panel ----------
  freshState(5);
  startIdea('和父母要钱买上海的房子');
  check('NONVENTURE-19 panel says not a venture', screenHtml().includes('这不是一条创业线'));
  check('NONVENTURE-20 panel gives the family-decision reason', screenHtml().includes('家庭决策'));
  check('NONVENTURE-21 no direct start on non-venture panel', !screenHtml().includes('data-act="idea-confirm"'));
  check('NONVENTURE-22 no free validation on non-venture panel', !screenHtml().includes('data-act="idea-validate"'));
  check('NONVENTURE-23 AI appeal + note + back offered', screenHtml().includes('data-act="idea-ai-review"')
    && screenHtml().includes('data-act="idea-note"') && screenHtml().includes('data-act="idea-back"'));
  check('NONVENTURE-24 pendingIdea flagged ask-family', ctx('G.pendingIdea.nonVenture') === 'ask-family');
  click('idea-confirm');
  check('NONVENTURE-25 stale confirm cannot start a non-venture line',
    ctx('(G.state.ventures || []).length') === 0 && screenHtml().includes('这不是一条创业线'));

  // ---------- UI: AI override re-opens the normal panel ----------
  freshState(5);
  startIdea('和父母要钱买上海的房子');
  sandbox.fetch = async () => ({ ok: true, text: async () => '{"reasonable": true, "archetype": "service", "cost": 1, "reason": "改成租房中介服务就能跑"}' });
  click('idea-ai-review');
  await sleep(50);
  check('NONVENTURE-26 AI override shows normal panel', screenHtml().includes('确认一下这条线') && screenHtml().includes('AI 审核通过'));
  check('NONVENTURE-27 direct start returns after override', screenHtml().includes('data-act="idea-confirm"'));
  click('idea-confirm');
  await sleep(10);
  check('NONVENTURE-28 override line starts at AI cost (5->4)', screenHtml().includes('启动 1 万已付') && ctx('G.state.attrs.money') === 4);

  // ---------- UI: AI agrees it is not a venture ----------
  freshState(5);
  startIdea('和父母要钱买上海的房子');
  sandbox.fetch = async () => ({ ok: true, text: async () => '{"reasonable": false, "archetype": "none", "cost": 0, "reason": "买房是消费，不是创业"}' });
  click('idea-ai-review');
  await sleep(50);
  check('NONVENTURE-29 AI agreement shown on non-venture panel', screenHtml().includes('AI 也这么看') && screenHtml().includes('买房是消费'));
  check('NONVENTURE-30 still no direct start after AI agreement', !screenHtml().includes('data-act="idea-confirm"'));

  // ---------- UI regressions: real ventures unaffected ----------
  freshState(5);
  startIdea('借钱开奶茶店');
  check('NONVENTURE-31 borrow-to-open-milk-tea is a normal venture',
    screenHtml().includes('确认一下这条线') && screenHtml().includes('本地实体经营') && screenHtml().includes('data-act="idea-confirm"'));
  freshState(5);
  startIdea('我想在月球上开奶茶店。');
  check('NONVENTURE-32 moon milk tea still reaches the normal panel (v0.3 case)',
    screenHtml().includes('确认一下这条线') && !screenHtml().includes('这不是一条创业线'));

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
