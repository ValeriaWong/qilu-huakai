'use strict';
// v1.3 tests (V16-xx): one regression check per item of the 2026-11-20
// ChatGPT re-review (P0-1..P0-4, P1-1..P1-5), plus save compatibility
// (v1.1 legacy saves, cross-slot import) and refresh/restore integration:
//   P0-1 year/slice phase persistence (yearPhase active/settled,
//     slicePhase deciding/completed; no double settlement, no sliceStep=3
//     out-of-bounds, 10 refreshes identical);
//   P0-2 estranged care (careSubjectFor reads familyBoundary=estranged
//     before family type; no forced parent medical costs after 断亲）;
//   P0-3 T14 startup loss (staked capital segregated from post-stake
//     income; T14 押 100 万 + T15 另赚 3 万 -> T16 failure leaves the 3 万）;
//   P0-4 cross-slot import (import saves to the user-picked target slot,
//     never trusts the save's own slot field; reset must not clear
//     global meta);
//   P1-1 NPC values drive replies (same input/history, changed
//     competence/hierarchy -> explainably different reply);
//   P1-2 kindnessSource checks trust for ALL NPC sources incl.
//     stance/network fallbacks (trust 0 -> community/stranger);
//   P1-3 教培 subsector gate 2021-2023;
//   P1-4 adjudicated numbers table (final adjudication 2026-11-20);
//   P1-5 0-18 growth fragments (no 大学， no gendered assumptions).
// Harness: same vm sandbox + DOM stub as test-v12/test-v15, plus a
// confirm() stub (the reset button asks for confirmation).
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
  console,
  setTimeout: () => 0, clearTimeout: () => {},
  document: {
    querySelector(sel) { return els.get(sel) || makeEl(sel); },
    querySelectorAll() { return []; },
    addEventListener(type, fn) { if (type === 'click') clickHandler = fn; },
  },
  window: { scrollTo() {} },
  // engine.js exportCode/importCode use btoa/atob (browser APIs);
  // the Node vm sandbox needs Buffer-backed equivalents.
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  alert(msg) { sandbox.__alerts.push(String(msg)); },
  __alerts: [],
  confirm(msg) { sandbox.__confirms.push(String(msg)); return true; },
  __confirms: [],
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
function minRng() {
  return {
    next: () => 0.5, int: (a) => a, chance: () => false,
    float: (a) => a, pick: (arr) => arr[0],
    weighted: (e) => e[0][0], shuffle: (a) => a.slice(),
    getState: () => 0, setState: () => {},
  };
}
function maxRng() {
  return {
    next: () => 0.5, int: (a, b) => b, chance: () => true,
    float: (a, b) => b, pick: (arr) => arr[0],
    weighted: (e) => e[0][0], shuffle: (a) => a.slice(),
    getState: () => 0, setState: () => {},
  };
}
function freshState(o) {
  const opts = Object.assign({ difficulty: 'normal', obsessions: ['money', 'health'] }, o || {});
  ctx(`G = { state: newRun(12345, { difficulty: '${opts.difficulty}', obsessions: ${JSON.stringify(opts.obsessions)} }), rng: makeRng(12345), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 };`);
}
// Era state (from test-v11/v14/v15).
function eraState(o) {
  const opts = Object.assign({
    birthYear: 1995, examYear: 2013, familyKey: 'model', homeRegion: 'jilin',
    econ: { tier: 'E2', cash: 20, min: 8, max: 30, label: 'E2 · 8–30万' },
    bg: { locale: 'city', urban: true, soe: true, stocks: true, trading: true, selfHouse: false, medical: false },
    attrs: null, turn: 0,
  }, o || {});
  ctx(`G = { state: newRun(12345, { difficulty: 'normal' }), rng: makeRng(12345), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 };
    G.state.turn = ${opts.turn};
    G.state.origin = { familyKey: '${opts.familyKey}', familyName: '模范父母', card: { family: 'f', parents: 'p', money: 'm', city: 'c', verdict: 'v' }, fragments: ['片段一', '片段二', '片段三'], counter: false, attrs: { money: 5, health: 85, stress: 10, skill: 20, express: 20, network: 20, influence: 20, family: 0, debt: 0 }, homeRegion: '${opts.homeRegion}', econ: ${JSON.stringify(opts.econ)}, bg: ${JSON.stringify(opts.bg)} };
    G.state.flags.era = { birthYear: ${opts.birthYear}, examYear: ${opts.examYear} };
    G.state.flags.familyEcon = G.state.origin.econ;
    G.state.flags.familyBg = G.state.origin.bg;
    G.state.flags.familySafety = '家里能接住你一次，但只有一次。';`);
  if (opts.attrs) ctx(`Object.assign(G.state.attrs, ${JSON.stringify(opts.attrs)});`);
}
// Post-slice state (from test-v12/v15).
function t9State(o) {
  const opts = Object.assign({
    attrs: { money: 40, health: 70, skill: 70, express: 50, network: 60, influence: 20, stress: 20, debt: 0, family: 0 },
    obsessions: ['money', 'health'],
    laidOff: true, hrTransfer: true,
  }, o || {});
  ctx(`G = { state: newRun(12345, { difficulty: 'normal', obsessions: ${JSON.stringify(opts.obsessions)} }), rng: makeRng(12345), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 };
    G.state.turn = 9;
    G.state.origin = { familyKey: 'model', familyName: '模范父母', card: { family: 'f', parents: 'p', money: 'm', city: 'c', verdict: 'v' }, fragments: ['片段一'], counter: false, attrs: { money: 5, health: 85, stress: 10, skill: 20, express: 20, network: 20, influence: 20, family: 0, debt: 0 }, homeRegion: 'shandong', econ: { tier: 'E2', cash: 20, min: 8, max: 30, label: 'E2 · 8–30万' }, bg: { locale: 'city', urban: true, soe: true, stocks: false, trading: false, selfHouse: false, medical: false } };
    G.state.flags.familyEcon = G.state.origin.econ;
    G.state.flags.familyBg = G.state.origin.bg;
    G.state.flags.employment = 'employed';
    G.state.flags.housing = 'rent';
    G.state.flags.jobIndustry = '互联网';
    G.state.flags.jobProfile = { employerType: 'bigtech', sector: 'internet', sectorName: '互联网', subsector: null, policyExposure: false, salaryAnnual: 18, startTurn: 5 };
    G.state.flags.t9Crisis = { id: 'double-reduction', label: '双减', crisisYear: 2021, examYear: 2013, fictional: false };
    G.state.flags.h2 = { chance: 35, roll: 20, laidOff: ${opts.laidOff} };
    G.state.flags.t9Branch = 'laid-off';
    G.state.decisions['call-laochen'] = { text: '打电话给老陈', seal: '你拨通了老陈的电话。' };
    G.state.decisions['hr-talk'] = { text: '${opts.hrTransfer ? '争取内部转岗' : '先了解解除依据和补偿方案'}', seal: 'x' };
    G.state.decisions['borrow-home'] = { text: '不借，自己扛', seal: '你没开口。' };
    G.state.commitments.A = { text: '志愿：计算机', signedAt: 'T1', dueTurn: 4, snapshot: {} };
    G.state.commitments.B = { text: '第一份工作：大厂', signedAt: 'T5', dueTurn: 6, snapshot: {} };
    Object.assign(G.state.attrs, ${JSON.stringify(opts.attrs)});`);
  ctx('G.rng = (' + minRng.toString() + ')()');
  ctx('delete G.state.flags.era;');
}
// Full state snapshot: everything a refresh must keep identical.
function stateSnapshot() {
  return JSON.stringify({
    turn: ctx('G.state.turn'), ap: ctx('G.state.ap'),
    attrs: ctx('G.state.attrs'), sealed: ctx('G.state.sealed'),
    flags: ctx('G.state.flags'), rngState: ctx('G.state.rngState'),
    acts: ctx('G.state.yearActions'), logLen: ctx('G.state.yearlyLog.length'),
    omenLen: ctx('G.state.omenLog.length'),
  });
}
// Simulate a browser refresh: save, reload from the slot, re-enter the year.
function refreshAndReenter(turn) {
  ctx('saveGame(G.state)');
  ctx('G.state = loadGame(G.state.slot || 1); G.rng = makeRng(G.state.seed); G.rng.setState(G.state.rngState || G.state.seed);');
  ctx(`startYear(${turn})`);
}
// E commitment snapshot for resolveE tests.
function eState(o) {
  const opts = Object.assign({
    line: 'startup', money: 103, staked: 100, chance: 45, roll: 48, h6: 70,
    skill: 50, network: 50, health: 80, stress: 20,
  }, o || {});
  t9State({ attrs: { money: opts.money, health: opts.health, skill: opts.skill, express: 50, network: opts.network, influence: 20, stress: opts.stress, debt: 0, family: 0 } });
  ctx(`G.state.turn = 16;
    G.state.commitments.E = { text: '押注：创业', signedAt: 'T14', dueTurn: 16, snapshot: { line: '${opts.line}', skill: ${opts.skill}, network: ${opts.network}, money: ${opts.money}, partnerMod: 0, industryDown: false, partnerShares: false, tier: 'calm', k: 1, chance: ${opts.chance}, roll: ${opts.roll}, h6: ${opts.h6}, staked: ${opts.staked} } };`);
}

// ---------- P0-1: 年度与 T9 恢复 ----------
{
  // endYear twice: second call re-renders the stored card, never re-settles.
  eraState({ birthYear: 1995, examYear: 2013, turn: 8, attrs: { money: 10, stress: 20, health: 80 } });
  ctx('startYear(8)');
  ctx('endYear()');
  const afterFirst = stateSnapshot();
  const logLen = ctx('G.state.yearlyLog.length');
  ctx('endYear()');
  check('V16-01 P0-1 endYear twice: attrs/flags/log identical on the second call', stateSnapshot() === afterFirst && ctx('G.state.yearlyLog.length') === logLen, 'log=' + ctx('G.state.yearlyLog.length'));
  check('V16-02 P0-1 settlement snapshot stored (yearSettledTurn + settlement.turn)', ctx('G.state.flags.yearSettledTurn') === 8 && ctx('G.state.flags.settlement.turn') === 8 && ctx('G.state.flags.settlement.after.money') === ctx('G.state.attrs.money'));
  check('V16-03 P0-1 second endYear still shows the settlement card', screenHtml().includes('年度结算卡') && !screenHtml().includes('结束这一年'));
}
{
  // 10 refreshes after settlement: identical state and identical card.
  eraState({ birthYear: 1995, examYear: 2013, turn: 8, attrs: { money: 10, stress: 20, health: 80 } });
  ctx('startYear(8)');
  ctx('endYear()');
  const firstState = stateSnapshot();
  const firstHtml = screenHtml();
  let ok = true;
  for (let i = 0; i < 10; i++) {
    refreshAndReenter(8);
    if (stateSnapshot() !== firstState || screenHtml() !== firstHtml) { ok = false; break; }
  }
  check('V16-04 P0-1 10 refreshes after settlement: identical state + identical card', ok);
}
{
  // resumeYear on a settled year renders the card, not the generic screen.
  eraState({ birthYear: 1995, examYear: 2013, turn: 8, attrs: { money: 10, stress: 20, health: 80 } });
  ctx('startYear(8)');
  ctx('endYear()');
  ctx('resumeYear(8)');
  check('V16-05 P0-1 resumeYear on a settled year shows the settlement card', screenHtml().includes('年度结算卡') && !screenHtml().includes('结束这一年'));
  // From the settlement card, the T8 -> T9 handoff still works.
  click('to-slice');
  check('V16-06 P0-1 settlement card -> to-slice enters the T9 slice', screenHtml().includes('裁员之夜'));
}
{
  // Legacy v1.2 save (no settlement fields): resumeYear falls back to
  // the generic year screen, it does not invent a settlement card.
  eraState({ birthYear: 1995, examYear: 2013, turn: 8, attrs: { money: 10, stress: 20, health: 80 } });
  ctx('enterYear(8)');
  ctx('delete G.state.flags.yearSettledTurn; delete G.state.flags.settlement;');
  ctx('resumeYear(8)');
  check('V16-07 P0-1 legacy save without settlement: generic year screen, no invented card', screenHtml().includes('结束这一年') && !screenHtml().includes('年度结算卡'));
}
{
  // sliceStep=3 on refresh (legacy v1.2 save shape, no slicePhase):
  // the outro renders, the settlement is applied exactly once, no crash.
  t9State({ attrs: { money: 40, health: 70, skill: 70, express: 50, network: 60, influence: 20, stress: 20, debt: 0, family: 0 } });
  ctx('G.state.sliceStep = 3;');
  ctx('enterSlice(false)');
  check('V16-08 P0-1 refresh on the slice outro (sliceStep=3, no slicePhase): outro renders', screenHtml().includes('切片结束'));
  check('V16-09 P0-1 legacy outro refresh applies the severance exactly once (40 + 6 = 46)', ctx('G.state.attrs.money') === 46, 'money=' + ctx('G.state.attrs.money'));
  check('V16-10 P0-1 legacy outro refresh marks slicePhase completed + sliceResolved', ctx('G.state.flags.slicePhase') === 'completed' && ctx('G.state.flags.sliceResolved') === true);
}
{
  // sliceEnd twice: compensation/stress applied once.
  t9State({ attrs: { money: 40, health: 70, skill: 70, express: 50, network: 60, influence: 20, stress: 20, debt: 0, family: 0 } });
  ctx('sliceEnd()');
  const money1 = ctx('G.state.attrs.money');
  const stress1 = ctx('G.state.attrs.stress');
  ctx('sliceEnd()');
  check('V16-11 P0-1 sliceEnd twice: money/stress unchanged on the second call', ctx('G.state.attrs.money') === money1 && ctx('G.state.attrs.stress') === stress1, 'money=' + ctx('G.state.attrs.money') + ' stress=' + ctx('G.state.attrs.stress'));
  check('V16-12 P0-1 sliceEnd twice: still the outro, not a re-settlement', screenHtml().includes('切片结束'));
}
{
  // renderSliceDecision with sliceStep=3: outro, not a decs[3] crash.
  t9State();
  ctx('G.state.sliceStep = 3;');
  ctx('renderSliceDecision()');
  check('V16-13 P0-1 renderSliceDecision with sliceStep=3 renders the outro', screenHtml().includes('切片结束'));
}
{
  // Completed slice re-entry via enterSlice: outro again, money unchanged.
  t9State({ attrs: { money: 40, health: 70, skill: 70, express: 50, network: 60, influence: 20, stress: 20, debt: 0, family: 0 } });
  ctx('sliceEnd()');
  const money1 = ctx('G.state.attrs.money');
  ctx('enterSlice(false)');
  check('V16-14 P0-1 completed slice re-entry renders the outro, money unchanged', screenHtml().includes('切片结束') && ctx('G.state.attrs.money') === money1);
}

// ---------- P0-2: 断亲后照护 ----------
{
  const careFor = (familyKey, extra) => ctx(`careSubjectFor({ origin: { familyKey: '${familyKey}' }, flags: ${JSON.stringify(extra.flags || {})}, attrs: ${JSON.stringify(extra.attrs || { health: 80 })} }).kind`);
  check('V16-15 P0-2 estranged model family: no parent care subject', careFor('model', { flags: { familyBoundary: 'estranged' } }) === 'none');
  check('V16-16 P0-2 estranged absentBoth: no grandparent care subject either', careFor('absentBoth', { flags: { familyBoundary: 'estranged' } }) === 'none');
  check('V16-17 P0-2 estranged + partner: partner is the care subject', careFor('model', { flags: { familyBoundary: 'estranged', relationship: 'partner' } }) === 'partner');
  check('V16-18 P0-2 estranged + health 40: self is the care subject', careFor('model', { flags: { familyBoundary: 'estranged' }, attrs: { health: 40 } }) === 'self');
  check('V16-19 P0-2 legacy flags.estranged flag is also read', careFor('npd', { flags: { estranged: true } }) === 'none');
  check('V16-20 P0-2 not estranged: model family still gets parents', careFor('model', { flags: {} }) === 'parents');
  check('V16-21 P0-2 not estranged: absentBoth still gets grandparents', careFor('absentBoth', { flags: {} }) === 'grandparents');
}
{
  // T13 seals no H5 for an estranged player; T16 shows no medical fee.
  eraState({ birthYear: 1995, examYear: 2013, familyKey: 'model', turn: 13 });
  ctx(`G.state.flags.familyBoundary = 'estranged';`);
  ctx('enterYear(13)');
  check('V16-22 P0-2 estranged T13: no H5 sealed, careSubject is none', ctx('G.state.sealed.H5') === undefined && ctx('G.state.flags.careSubject') === 'none');
  ctx('screenT16()');
  check('V16-23 P0-2 estranged T16: explicitly no one to care for, no medical fee', screenHtml().includes('没有人需要你照顾') && screenHtml().includes('没有医疗费') && !screenHtml().includes('父母的病'));
}

// ---------- P0-3: T14 创业减损 ----------
{
  // The reviewer's exact acceptance case: 押 100 万，T15 另赚 3 万，
  // T16 失败 -> 3 万 remains.
  eState({ line: 'startup', money: 103, staked: 100, chance: 45, roll: 48, h6: 70 });
  ctx('resolveE(G.state)');
  check('V16-24 P0-3 startup fail: staked 100 gone, post-stake 3 remains', ctx('G.state.attrs.money') === 3, 'money=' + ctx('G.state.attrs.money'));
  check('V16-25 P0-3 startup fail still enters 崩档 and costs health', ctx('G.state.attrs.stress') >= 75 && ctx('G.state.attrs.health') === 60);
}
{
  // Abroad/takeover use the same rule (was already money - staked).
  eState({ line: 'abroad', money: 103, staked: 50, chance: 45, roll: 48, h6: 70 });
  ctx('resolveE(G.state)');
  check('V16-26 P0-3 abroad fail: 103 - 50 = 53', ctx('G.state.attrs.money') === 53, 'money=' + ctx('G.state.attrs.money'));
}
{
  // H6 < 35 now bites on the startup remainder too (was dead code: 0 * 0.7).
  eState({ line: 'startup', money: 103, staked: 100, chance: 45, roll: 48, h6: 30 });
  ctx('resolveE(G.state)');
  check('V16-27 P0-3 startup fail + H6<35: remainder 3 x 0.7 = 2.1', ctx('G.state.attrs.money') === 2.1, 'money=' + ctx('G.state.attrs.money'));
}
{
  // Success path unchanged: stake returns + equal profit.
  eState({ line: 'startup', money: 103, staked: 100, chance: 45, roll: 40, h6: 70 });
  ctx('resolveE(G.state)');
  check('V16-28 P0-3 startup success: 103 + 100 = 203, influence +20', ctx('G.state.attrs.money') === 203 && ctx('G.state.attrs.influence') === 40, 'money=' + ctx('G.state.attrs.money'));
}
{
  // Card text: stake-only wording, no 现金归零 anywhere.
  eState({ line: 'startup', money: 103, staked: 100, chance: 45, roll: 48, h6: 70 });
  ctx(`G.state.flags.eResult = { line: 'startup', success: false, chance: 45, roll: 48, h6: 70, staked: 100, divorced: false };`);
  const html = ctx(`redemptionCardHtml(G.state, 'E')`);
  check('V16-29 P0-3 E fail card says the staked 100 is gone and the post-stake money stays', html.includes('押的 100 万没了') && html.includes('押注之后另赚的钱还在'), html.slice(0, 200));
  check('V16-30 P0-3 no 现金归零 wording left in the E card or the startup line', !html.includes('现金归零') && !ctx(`E_LINES.find(l => l.id === 'startup').desc`).includes('现金归零'));
}

// ---------- P0-4: 跨周目存档导入 ----------
// Helper: build an export code from the current state, put it in the
// import box, and click 导入.
function importCurrentCode() {
  const code = ctx('exportCode(G.state)');
  ctx(`document.querySelector('#import-code').value = ${JSON.stringify(code)};`);
  click('import-do');
}
{
  // Slot 1 holds 40 万. Pick slot 2, import slot 1's code: slot 2 gets
  // the 40 万, slot 1 is untouched, pickedSlot stays 2.
  freshState();
  ctx('G.state.attrs.money = 40; saveGame(G.state);');
  ctx('G.pickedSlot = 2;');
  ctx('importSave();');
  importCurrentCode();
  check('V16-31 P0-4 cross-slot import: target slot 2 receives the save', ctx('loadGame(2)') && ctx('loadGame(2).attrs.money') === 40, 'slot2=' + JSON.stringify(ctx('loadGame(2) && loadGame(2).attrs.money')));
  check('V16-32 P0-4 cross-slot import: source slot 1 untouched', ctx('loadGame(1)') && ctx('loadGame(1).attrs.money') === 40);
  check('V16-33 P0-4 imported save records the TARGET slot, not its own field', ctx('loadGame(2).slot') === 2);
  check('V16-34 P0-4 import keeps the picked slot (no silent reset to 1)', ctx('G.pickedSlot') === 2);
}
{
  // Import screen states the target slot.
  freshState();
  ctx('G.pickedSlot = 3; importSave();');
  check('V16-35 P0-4 import screen names the target slot', screenHtml().includes('3 号位'));
}
{
  // Title screen preserves the picked slot (v1.2 reset it to 1).
  freshState();
  ctx('G.pickedSlot = 3; screenTitle();');
  check('V16-36 P0-4 screenTitle preserves pickedSlot 3', ctx('G.pickedSlot') === 3);
  ctx('G.pickedSlot = 99; screenTitle();');
  check('V16-37 P0-4 screenTitle falls back to 1 only for an illegal slot', ctx('G.pickedSlot') === 1);
}
{
  // Reset clears only the current slot's save; shared meta survives.
  freshState();
  ctx(`G.state.attrs.money = 40; saveGame(G.state);
    G.state.slot = 2; G.state.attrs.money = 99; saveGame(G.state);
    G.meta.lessons = { E: { text: '教训' } };
    G.meta.npcMemory = { wang: { met: true, trust: 80, history: [] } };
    saveMeta(G.meta);
    G.pickedSlot = 2;`);
  sandbox.__confirms.length = 0;
  click('reset');
  check('V16-38 P0-4 reset clears only the current slot (2 empty)', ctx('loadGame(2)') === null);
  check('V16-39 P0-4 reset leaves the other slot alone (1 still 40 万）', ctx('loadGame(1)') && ctx('loadGame(1).attrs.money') === 40);
  check('V16-40 P0-4 reset does not clear global meta (lessons + npcMemory)', ctx(`loadMeta().lessons && loadMeta().lessons.E && loadMeta().lessons.E.text`) === '教训' && ctx(`loadMeta().npcMemory && loadMeta().npcMemory.wang && loadMeta().npcMemory.wang.trust`) === 80);
  check('V16-41 P0-4 reset dialog says the other slots and shared data survive', sandbox.__confirms.some((m) => m.includes('其他周目位') && m.includes('不受影响')));
}

// ---------- P1-1: NPC 行为驱动 ----------
function setNpcValues(id, values) {
  ctx(`Object.assign(NPCS.find(n => n.id === '${id}').values, ${JSON.stringify(values)});`);
}
{
  // Same input, same history, wang competence 85 -> 10: different reply,
  // driven by competence.
  setNpcValues('wang', { competence: 85 });
  const hi = ctx(`npcReply('wang', '请教我怎么办', { trust: 50, history: [] }, 'family')`);
  setNpcValues('wang', { competence: 10 });
  const lo = ctx(`npcReply('wang', '请教我怎么办', { trust: 50, history: [] }, 'family')`);
  check('V16-42 P1-1 wang advice: competence 85 vs 10 gives different replies', hi.text !== lo.text, 'hi=' + hi.text.slice(0, 20) + ' lo=' + lo.text.slice(0, 20));
  check('V16-43 P1-1 wang advice reports drivenBy competence + the driving value', hi.drivenBy === 'competence' && hi.drivingValue === 85 && lo.drivingValue === 10);
  setNpcValues('wang', { competence: 85 });
}
{
  // Request is driven by reciprocity, not competence.
  setNpcValues('li', { reciprocity: 70, competence: 90 });
  const hi = ctx(`npcReply('li', '能帮我看一下材料吗', { trust: 50, history: [] }, 'family')`);
  setNpcValues('li', { reciprocity: 40, competence: 90 });
  const lo = ctx(`npcReply('li', '能帮我看一下材料吗', { trust: 50, history: [] }, 'family')`);
  check('V16-44 P1-1 li request: reciprocity 70 vs 40 gives different replies (competence held at 90)', hi.text !== lo.text && hi.drivenBy === 'reciprocity');
  setNpcValues('li', { reciprocity: 70 });
}
{
  // Money is driven by hierarchy.
  setNpcValues('wang', { hierarchy: 80 });
  const hi = ctx(`npcReply('wang', '工资的事想跟你聊聊', { trust: 50, history: [] }, 'family')`);
  setNpcValues('wang', { hierarchy: 60 });
  const lo = ctx(`npcReply('wang', '工资的事想跟你聊聊', { trust: 50, history: [] }, 'family')`);
  check('V16-45 P1-1 wang money: hierarchy 80 vs 60 gives different replies', hi.text !== lo.text && hi.drivenBy === 'hierarchy');
  setNpcValues('wang', { hierarchy: 60 });
}
{
  // Trust deltas read values too: result +5 when competence >= 75, +3 below.
  setNpcValues('wang', { competence: 85 });
  const hi = ctx(`npcReply('wang', '我完成了这个项目', { trust: 50, history: [] }, 'family')`);
  setNpcValues('wang', { competence: 10 });
  const lo = ctx(`npcReply('wang', '我完成了这个项目', { trust: 50, history: [] }, 'family')`);
  check('V16-46 P1-1 result trustDelta: competence 85 -> +5, competence 10 -> +3', hi.trustDelta === 5 && lo.trustDelta === 3, 'hi=' + hi.trustDelta + ' lo=' + lo.trustDelta);
  setNpcValues('wang', { competence: 85 });
}
{
  // Vent trustDelta: reciprocity >= 75 adds +1.
  setNpcValues('listener', { reciprocity: 90 });
  const hi = ctx(`npcReply('listener', '我最近压力大', { trust: 50, history: [] }, 'family')`);
  setNpcValues('listener', { reciprocity: 40 });
  const lo = ctx(`npcReply('listener', '我最近压力大', { trust: 50, history: [] }, 'family')`);
  check('V16-47 P1-1 vent trustDelta: reciprocity 90 -> +2, reciprocity 40 -> +1', hi.trustDelta === 2 && lo.trustDelta === 1, 'hi=' + hi.trustDelta + ' lo=' + lo.trustDelta);
  setNpcValues('listener', { reciprocity: 90 });
}
{
  // backgroundTags still never decide a reply.
  setNpcValues('wang', { competence: 85 });
  const before = ctx(`npcReply('wang', '请教我怎么办', { trust: 50, history: [] }, 'family')`);
  ctx(`NPCS.find(n => n.id === 'wang').backgroundTags = ['火星', '外星人'];`);
  const after = ctx(`npcReply('wang', '请教我怎么办', { trust: 50, history: [] }, 'family')`);
  check('V16-48 P1-1 backgroundTags still do not change the reply', before.text === after.text);
  ctx(`NPCS.find(n => n.id === 'wang').backgroundTags = ['山东', '资源型管理者', '体制内出身'];`);
}

// ---------- P1-2: 善意来源 ----------
// kindnessSource(state, meta): stance + network + npcMemory.
function ks(stance, network, mem) {
  return ctx(`kindnessSource({ attrs: { network: ${network} }, flags: ${stance ? `{ stance: '${stance}' }` : '{}'}, sealed: {} }, { npcMemory: ${JSON.stringify(mem || {})} })`);
}
{
  check('V16-49 P1-2 stance li + trust 0: NOT li, falls to community/stranger', (() => { const r = ks('li', 20, { li: { trust: 0 } }); return r.kind === 'stranger' && r.npcId === 'community'; })(), JSON.stringify(ks('li', 20, { li: { trust: 0 } })));
  check('V16-50 P1-2 stance li + no history: li (unmet NPC defaults to neutral 50)', (() => { const r = ks('li', 20, {}); return r.kind === 'npc' && r.npcId === 'li'; })());
  check('V16-51 P1-2 stance wang + trust 10: NOT wang', (() => { const r = ks('wang', 20, { wang: { trust: 10 } }); return r.kind === 'stranger'; })(), JSON.stringify(ks('wang', 20, { wang: { trust: 10 } })));
  check('V16-52 P1-2 network>=40 + laochen trust 0: NOT laochen', (() => { const r = ks(null, 60, { laochen: { trust: 0 } }); return r.kind === 'stranger'; })(), JSON.stringify(ks(null, 60, { laochen: { trust: 0 } })));
  check('V16-53 P1-2 network>=40 + laochen no history: laochen (neutral 50)', (() => { const r = ks(null, 60, {}); return r.kind === 'npc' && r.npcId === 'laochen'; })());
  check('V16-54 P1-2 best-trust path still wins: wang 80 beats hostile li 0', (() => { const r = ks('li', 20, { wang: { trust: 80 }, li: { trust: 0 } }); return r.kind === 'npc' && r.npcId === 'wang'; })());
  check('V16-55 P1-2 npcTrustOf: unmet NPC is neutral 50, hostile is 0', ctx(`npcTrustOf({}, 'li')`) === 50 && ctx(`npcTrustOf({ npcMemory: { li: { trust: 0 } } }, 'li')`) === 0);
}

// ---------- P1-3: 教培行业门控 ----------
{
  const t9i = (year, industry, sub) => ctx(`t9IndustryAdjustment(${year}, '${industry}'${sub === undefined ? '' : `, '${sub}'`})`);
  check('V16-56 P1-3 2021 教培：学科 +12，素质/职业 0', t9i(2021, '教培', 'k12_subject_tutoring') === 12 && t9i(2021, '教培', 'quality') === 0 && t9i(2021, '教培', 'vocational') === 0);
  check('V16-57 P1-3 2022 教培：学科 +8，素质/职业 0', t9i(2022, '教培', 'k12_subject_tutoring') === 8 && t9i(2022, '教培', 'quality') === 0 && t9i(2022, '教培', 'vocational') === 0);
  check('V16-58 P1-3 subsector 未定义时取表值（旧存档向后兼容）', t9i(2021, '教培') === 12 && t9i(2022, '教培') === 8 && t9i(2023, '教培') === 2);
  check('V16-59 P1-3 2023 教培仍只认学科（+2 / 0 / 0）', t9i(2023, '教培', 'k12_subject_tutoring') === 2 && t9i(2023, '教培', 'quality') === 0 && t9i(2023, '教培', 'vocational') === 0);
  // Cross-scenario: 2021 年非学科教育公司 — layoffChance 学科比素质正好高 12。
  const layoff = (sub) => ctx(`layoffChance({ attrs: {}, flags: { era: { examYear: 2013 }, hasProtector: true, jobProfile: { employerType: 'startup', sector: 'education', sectorName: '教培', subsector: '${sub}', policyExposure: true, salaryAnnual: 10, startTurn: 5 } }, sealed: {}, commitments: {} })`);
  check('V16-60 P1-3 layoffChance: 2021 学科比素质正好高 12', layoff('k12_subject_tutoring') - layoff('quality') === 12, 'k12=' + layoff('k12_subject_tutoring') + ' quality=' + layoff('quality'));
}

// ---------- P1-4: 历史权重（最终裁定表） ----------
{
  const C = ctx('({ t9YearAdjustment, t9IndustryAdjustment, t9H2Chance, civilServiceAppeal, civilServiceWeight, foreignFirmVisibility, gambleChanceFrom, T9_YEAR_ADJUSTMENT, T9_INDUSTRY_ADJUSTMENT })');
  check('V16-61 P1-4 Y table adjudicated: 2021 0 / 2022 +3 / 2023 0', C.t9YearAdjustment(2021) === 0 && C.t9YearAdjustment(2022) === 3 && C.t9YearAdjustment(2023) === 0 && C.T9_YEAR_ADJUSTMENT[2022] === 3);
  check('V16-62 P1-4 I table adjudicated: 2021 {3, 12} / 2022 {5, 8, 8} / 2023 {3, 2}', C.t9IndustryAdjustment(2021, '互联网') === 3 && C.t9IndustryAdjustment(2021, '教培') === 12 && C.t9IndustryAdjustment(2022, '互联网') === 5 && C.t9IndustryAdjustment(2022, '线下服务') === 8 && C.t9IndustryAdjustment(2022, '教培') === 8 && C.t9IndustryAdjustment(2023, '互联网') === 3 && C.t9IndustryAdjustment(2023, '教培') === 2);
  check('V16-63 P1-4 考公 2024-26 stays 78 (adjudication confirms WorkBuddy)', C.civilServiceAppeal(2024) === 78 && C.civilServiceAppeal(2025) === 78 && C.civilServiceAppeal(2026) === 78 && C.civilServiceWeight(2025) === 0.78);
  check('V16-64 P1-4 外企 2014-17 is 82 (adjudication), 2018-20 stays 75', C.foreignFirmVisibility(2015).weight === 82 && C.foreignFirmVisibility(2016).weight === 82 && C.foreignFirmVisibility(2019).weight === 75 && C.foreignFirmVisibility(2020).weight === 75);
  check('V16-65 P1-4 E sample is 79.5 (UI shows 80); H6 tiers fixed', ctx(`gambleChanceFrom({ skill: 70, network: 60, money: 40, partnerMod: 15, industryDown: false, partnerShares: true, tier: 'tense' })`) === 80);
  // The tables are GAME_BALANCE, not statistics: the source no longer
  // presents the old per-year numbers with statistical anchors.
  const eraSrc = fs.readFileSync(path.join(REPO, 'js', 'era.js'), 'utf8');
  check('V16-66 P1-4 era.js marks the tables GAME_BALANCE + 最终裁定， no old statistical anchors', eraSrc.includes('GAME_BALANCE') && eraSrc.includes('最终裁定') && !eraSrc.includes('71%') && !eraSrc.includes('50.4') && !eraSrc.includes('1.9 万'));
}

// ---------- P1-5: 0–18 成长片段 ----------
{
  const items = ctx(`Object.entries(FAMILIES).flatMap(([k, f]) => [...(f.fragments || []), f.counter || ''])`);
  const bad = ['大学毕业', '毕业后', '找工作', '上班', '工资', '房贷', '结婚', '例假', '变声', '月经', '初潮', '遗精', '谈恋爱', '实习', '老板', '同事', '加班', '买房', '生孩子', '上大学', '扎头发', '微信', '手机', '短视频', '抖音', '直播'];
  const hits = items.filter((t) => bad.some((w) => t.includes(w)));
  check('V16-67 P1-5 all 18 fragments + 6 counters free of adult events / gendered assumptions / tech anachronisms', hits.length === 0 && items.length === 24, 'hits=' + JSON.stringify(hits) + ' n=' + items.length);
  check('V16-68 P1-5 no 大学 anywhere in the 0-18 fragments/counters', !items.some((t) => t.includes('大学')));
  const modelFrags = ctx(`FAMILIES.model.fragments`);
  const absentMotherFrags = ctx(`FAMILIES.absentMother.fragments`);
  check('V16-69 P1-5 model fragment is now a pre-gaokao night (高三那年冬天， no university)', modelFrags.some((t) => t.includes('高三那年冬天')) && !modelFrags.some((t) => t.includes('上大学')));
  check('V16-70 P1-5 absentMother fragment is gender-neutral (爸爸不会做饭， no 扎头发）', absentMotherFrags.some((t) => t.includes('爸爸不会做饭')) && !absentMotherFrags.some((t) => t.includes('扎头发')));
}

// ---------- 存档兼容 ----------
{
  // A v1.1-shaped save (no v1.3 fields) round-trips through export/import
  // and resumes as a generic year (no invented settlement card).
  eraState({ birthYear: 1995, examYear: 2013, turn: 8, attrs: { money: 10, stress: 20, health: 80 } });
  ctx('enterYear(8)');
  ctx(`delete G.state.flags.yearSettledTurn; delete G.state.flags.settlement;
    delete G.state.flags.slicePhase; delete G.state.flags.sliceResolved;`);
  const code = ctx('exportCode(G.state)');
  ctx(`G.state = importCode(${JSON.stringify(code)}).state; G.rng = makeRng(G.state.seed); G.rng.setState(G.state.rngState || G.state.seed);`);
  check('V16-71 兼容 v1.1 save round-trips and keeps its legacy shape (no v1.3 fields)', ctx('G.state.flags.yearSettledTurn') === undefined && ctx('G.state.flags.settlement') === undefined);
  ctx('resumeYear(8)');
  check('V16-72 兼容 v1.1 save resumes as a generic year screen', screenHtml().includes('结束这一年') && !screenHtml().includes('年度结算卡'));
}
{
  // A v1.1 slice save (sliceStep 3, no slicePhase) round-trips and the
  // outro settles exactly once.
  t9State({ attrs: { money: 40, health: 70, skill: 70, express: 50, network: 60, influence: 20, stress: 20, debt: 0, family: 0 } });
  ctx(`G.state.sliceStep = 3;
    delete G.state.flags.slicePhase; delete G.state.flags.sliceResolved;`);
  const code = ctx('exportCode(G.state)');
  ctx(`G.state = importCode(${JSON.stringify(code)}).state; G.rng = makeRng(G.state.seed); G.rng.setState(G.state.rngState || G.state.seed);`);
  ctx('enterSlice(false)');
  check('V16-73 兼容 v1.1 slice save round-trips to the outro, severance once (46)', screenHtml().includes('切片结束') && ctx('G.state.attrs.money') === 46, 'money=' + ctx('G.state.attrs.money'));
}
{
  // Refresh/restore integration: full slice flow with a refresh between
  // decisions — decisions survive, settlement applies exactly once.
  t9State({ attrs: { money: 40, health: 70, skill: 70, express: 50, network: 60, influence: 20, stress: 20, debt: 0, family: 0 } });
  ctx('enterSlice(false)');
  click('slice-pick', 0);
  click('slice-next');
  // Refresh after the first decision: the real T9 refresh path is
  // save -> load -> enterSlice(false) (the continue handler walks it,
  // not startYear(9)) — back to decision 2, same state.
  ctx('saveGame(G.state)');
  ctx('G.state = loadGame(G.state.slot || 1); G.rng = makeRng(G.state.seed); G.rng.setState(G.state.rngState || G.state.seed);');
  ctx('enterSlice(false)');
  check('V16-74 集成 refresh between slice decisions: back at decision 2', screenHtml().includes('第 2 个决定'));
  click('slice-pick', 0);
  click('slice-next');
  click('slice-pick', 0);
  const beforeEnd = ctx('G.state.attrs.money');
  click('slice-next');
  check('V16-75 集成 full slice flow with refresh: outro + severance exactly +6 once', screenHtml().includes('切片结束') && ctx('G.state.attrs.money') === beforeEnd + 6 && ctx('G.state.flags.slicePhase') === 'completed', 'money=' + ctx('G.state.attrs.money') + ' before=' + beforeEnd);
}

// ---------- 65% 征兆固定种子 600 条（与 tests/omen-seed-stats.js 同方法） ----------
{
  let accurate = 0, total = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const log = ctx(`(() => {
      const st = newRun(${seed}, {});
      st.flags.careSubject = 'parents';
      const rng = makeRng(${seed});
      sealDie(st, rng, 'H4', 70, 3);
      sealDie(st, rng, 'H5', 2, 3);
      return st.omenLog;
    })()`);
    for (const o of log) { total += 1; if (o.accurate) accurate += 1; }
  }
  const frac = accurate / total;
  check('V16-76 P0-5 600 fixed-seed omens: accuracy in [0.60, 0.70]', total === 600 && frac >= 0.60 && frac <= 0.70, `accurate=${accurate}/${total} = ${frac.toFixed(3)}`);
}

console.log(failures === 0 ? 'ALL PASS (v16)' : failures + ' FAILURE(S) (v16)');
process.exit(failures === 0 ? 0 : 1);
