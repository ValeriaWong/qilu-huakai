'use strict';
// v0.8 tests: anonymous playthrough analytics (ANALYTICS-01..).
// Client-side only (node vm harness, same DOM/localStorage stubs as
// test-v10, plus a navigator.sendBeacon recorder). The server was
// smoke-tested separately with curl (health 200, valid events 204,
// unknown event 202, oversize body 202, /v1/stats aggregates correct).
// Rules under test: endpoint empty -> zero sends; unknown events never
// send; opt-out stops everything; no free text ever leaves the client;
// hooks fire with the right enums at session/turn/commitment/venture/
// year-end/slice points; session_start fires once even when screenT1
// re-renders (diagnosis panel).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const REPO = path.join(__dirname, '..');

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('PASS  ' + name);
  else { failures += 1; console.log('FAIL  ' + name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); }
}

// --- stub DOM (same shape as test-v10) + sendBeacon recorder ---
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
const sent = [];
const sandbox = {
  console, setTimeout, clearTimeout,
  document: {
    querySelector(sel) { return els.get(sel) || makeEl(sel); },
    addEventListener(type, fn) { if (type === 'click') clickHandler = fn; },
  },
  window: {
    scrollTo() {},
    crypto: (() => { let n = 0; return { getRandomValues(b) { for (let i = 0; i < b.length; i++) b[i] = (n++ * 37 + 11) % 256; return b; } }; })(),
  },
  navigator: {
    sendBeacon(url, body) { sent.push({ url, body: JSON.parse(String(body)) }); return true; },
  },
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
function click(act, id) {
  clickHandler({ target: { closest: () => ({ dataset: { act, id: id === undefined ? '' : String(id) } }) } });
}
function freshState(money) {
  ctx(`G = { state: newRun(12345, { difficulty: 'normal' }), rng: makeRng(12345), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 };
    G.state.attrs.money = ${money === undefined ? 5 : money};
    G.state.origin = { familyKey: 'model' };`);
}
const events = (name) => sent.filter((s) => s.body.event === name);
const lastEvent = (name) => events(name)[events(name).length - 1];

(async () => {
  ctx('Analytics.init()');

  // ---------- endpoint empty: zero sends ----------
  check('ANALYTICS-01 endpoint empty -> track returns false', ctx(`Analytics.track('turn_start', { turn: 1 })`) === false);
  check('ANALYTICS-02 endpoint empty -> nothing sent', sent.length === 0);

  ctx('ANALYTICS_ENDPOINT = "https://example.invalid"');

  // ---------- unit: allowlist, shape, opt-out, client id ----------
  check('ANALYTICS-03 unknown event never sends', ctx(`Analytics.track('pwned', { x: 1 })`) === false && sent.length === 0);
  check('ANALYTICS-04 valid event sends to /v1/event', ctx(`Analytics.track('turn_start', { turn: 2 })`) === true
    && sent.length === 1 && sent[0].url === 'https://example.invalid/v1/event');
  check('ANALYTICS-05 payload has v/client/session, no free text',
    sent[0].body.v === 1 && typeof sent[0].body.client_id === 'string'
    && sent[0].body.client_id.length >= 8 && typeof sent[0].body.session_id === 'string'
    && JSON.stringify(sent[0].body).indexOf('奶茶') === -1);
  check('ANALYTICS-06 client id stable across re-init', (() => {
    const first = sent[0].body.client_id;
    ctx('Analytics.init()');
    ctx(`Analytics.track('turn_start', { turn: 3 })`);
    return sent[1].body.client_id === first && sent[1].body.session_id !== sent[0].body.session_id;
  })());
  check('ANALYTICS-07 opt-out stops sends', (() => {
    ctx('Analytics.setOptOut(true)');
    const r = ctx(`Analytics.track('turn_start', { turn: 4 })`);
    return r === false && sent.length === 2;
  })());
  check('ANALYTICS-08 opt-in resumes sends', (() => {
    ctx('Analytics.setOptOut(false)');
    return ctx(`Analytics.track('turn_start', { turn: 4 })`) === true && sent.length === 3;
  })());
  check('ANALYTICS-09 footer toggle flips opt-out + note', (() => {
    click('analytics-toggle');
    const off = ctx('Analytics.optedOut()');
    const note = els.get('#analytics-note').textContent;
    click('analytics-toggle');
    const on = !ctx('Analytics.optedOut()');
    return off === true && note.indexOf('已停止') !== -1 && on === true;
  })());

  // ---------- integration: session + turn hooks ----------
  freshState(5);
  sent.length = 0;
  ctx(`G.state.flags.era = { birthYear: 1998, examYear: 2016 };
    G.state.flags.gaokao = { region: 'shandong' };
    G.state.obsessions = ['freedom'];`);
  ctx('screenT1()');
  check('ANALYTICS-10 session_start fires on screenT1 with config',
    events('session_start').length === 1
    && lastEvent('session_start').body.data.difficulty === 'normal'
    && lastEvent('session_start').body.data.birthYear === 1998
    && lastEvent('session_start').body.data.examYear === 2016
    && lastEvent('session_start').body.data.region === 'shandong'
    && lastEvent('session_start').body.data.obsessions === 1);
  check('ANALYTICS-11 turn_start T1 fires', events('turn_start').length === 1 && lastEvent('turn_start').body.data.turn === 1);
  ctx('screenT1()'); // diagnosis panel re-render
  check('ANALYTICS-12 session_start fires once despite re-render', events('session_start').length === 1);
  ctx('startYear(2)');
  check('ANALYTICS-13 turn_start T2 fires', lastEvent('turn_start').body.data.turn === 2);

  // ---------- integration: commitments ----------
  ctx(`pickT1('obey')`);
  check('ANALYTICS-14 commitment A fires with enum choice',
    events('commitment').length === 1
    && lastEvent('commitment').body.data.card === 'A'
    && lastEvent('commitment').body.data.choice === 'obey');
  ctx(`pickT5('bigtech')`);
  // v1.2 (P1-3): T5 是两段签署——pickT5 只起草，选行业后才签署 B。
  // v1.4.2: 体制内改走入职考试（pickT5('stable') 进考试流程，不再
  // 直接起草），两段签署的回归改用大厂覆盖；stable 考试流程见
  // test-v18.js。
  ctx(`pickT5Sector('internet')`);
  check('ANALYTICS-15 commitment B fires with job id',
    events('commitment').length === 2
    && lastEvent('commitment').body.data.card === 'B'
    && lastEvent('commitment').body.data.choice === 'bigtech');

  // ---------- integration: venture start + year-end ----------
  freshState(50);
  sent.length = 0;
  sandbox.document.querySelector('#idea-text').value = '开奶茶店赚钱';
  click('idea-start');
  click('idea-confirm');
  check('ANALYTICS-16 venture_start fires with archetype id only, no idea text',
    events('venture_start').length === 1
    && lastEvent('venture_start').body.data.archetype === 'local'
    && JSON.stringify(lastEvent('venture_start').body).indexOf('奶茶') === -1);
  ctx(`G.state.flags.advancedVenture = G.state.ventures[0].id; G.state.yearActions = ['学习']; G.state.turn = 2; endYear();`);
  check('ANALYTICS-17 year_end fires with tier enum',
    events('year_end').length === 1
    && ['calm', 'tense', 'break'].includes(lastEvent('year_end').body.data.tier));
  check('ANALYTICS-18 venture_year fires with enum outcome',
    events('venture_year').length === 1
    && ['milestone', 'milestone_failed', 'launched', 'idle', 'closed', 'validating', 'validated', 'running'].includes(lastEvent('venture_year').body.data.outcome)
    && lastEvent('venture_year').body.data.archetype === 'local');

  // ---------- integration: T9 slice ----------
  freshState(5);
  sent.length = 0;
  ctx('enterSlice(true)');
  check('ANALYTICS-19 turn_start T9 fires on enterSlice',
    events('turn_start').length === 1 && lastEvent('turn_start').body.data.turn === 9);
  ctx('sliceEnd()');
  check('ANALYTICS-20 slice fires with enum outcome',
    events('slice').length === 1
    && ['laid_off', 'kept', 'kept_transfer', 'unknown'].includes(lastEvent('slice').body.data.outcome));

  console.log(failures === 0 ? 'ALL ANALYTICS TESTS PASS' : failures + ' FAILURES');
  process.exit(failures === 0 ? 0 : 1);
})();
