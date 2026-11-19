'use strict';
// v1.4 tests (V17-xx): one regression check per item of the 2026-11-20
// ChatGPT SECOND re-review (2026-11-20 03:00, 不通过）:
//   P0-1 signed commitments cannot be re-signed (T1/T5/T12/T14/T16 —
//     screen + sign guards; T5 acceptance scenario verbatim: signed B,
//     cash 20万， re-enter 10 times -> still 20万， B unchanged);
//   P0-2 T13 seals the care subject (flags.sealedCareSubject); T16 only
//     reads the sealed record (charge, subject and UI stay consistent
//     even if the partner leaves at T14);
//   断亲目标拆分 (second re-review §4): parents vs caregiver vs all;
//     parents-only estrangement keeps the grandmother care line;
//   P1-3 教培 strict gate: null/unknown subsector -> 0 in 2021-2023,
//     K12 only hits (+12/+8/+2); old saves migrate (migrateSave) and
//     the T9 slice prompts to fill in the missing subsector;
//   面试总结页： Q3 no longer loops back to Q1 — a “三问完成” summary
//     page (total /9, per-item advice, retry entry) for both the English
//     and the voice interview.
// Harness: same vm sandbox + DOM stub as test-v12/test-v15/test-v16,
// plus a confirm() stub (the reset button asks for confirmation).
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


// ---------- P0-1: 已签署承诺卡不可重复签署 ----------
// Acceptance scenario verbatim from the second re-review: T5 signed B,
// cash 20万 — refresh, continue and re-enter 10 times, still 20万,
// B unchanged.
{
  eraState({ turn: 5 });
  ctx(`G.state.major = { name: '计算机', tier: '一本' };
    G.state.flags.majorK = 1;
    G.state.flags.enteredTurns = { 5: true };
    G.state.attrs.money = 20;
    G.state.commitments.B = { text: '第一份工作：大厂（互联网）', signedAt: 'T5', dueTurn: 6, snapshot: {} };`);
  const bText = () => ctx('G.state.commitments.B.text');
  const money = () => ctx('G.state.attrs.money');
  ctx('screenT5()');
  check('V17-01 P0-1 T5 已签 B：只显示已签卡，不再给毕业去向选择', screenHtml().includes('承诺卡 B 已签署') && !screenHtml().includes('t5-pick'), screenHtml().slice(0, 200));
  let ok10 = true;
  for (let i = 0; i < 10; i++) {
    ctx(i % 2 === 0 ? 'screenT5()' : 'resumeYear(5)');
    if (money() !== 20 || bText() !== '第一份工作：大厂（互联网）' || screenHtml().includes('t5-pick')) { ok10 = false; break; }
  }
  check('V17-02 P0-1 T5 重新进入 10 次：现金仍 20 万，B 卡不变', ok10, 'money=' + money());
  // Stale-button / direct-call re-sign attempts are also blocked.
  click('t5-pick', 'bigtech');
  ctx('signT5(T5_JOBS[0])');
  check('V17-03 P0-1 T5 重签尝试（点选 + 直接调 signT5）：不重发入职奖励', money() === 20 && bText() === '第一份工作：大厂（互联网）', 'money=' + money());
  // Refresh / restore at T5 keeps the signed card and the cash.
  refreshAndReenter(5);
  check('V17-04 P0-1 T5 刷新恢复后：仍是已签卡，现金 20 万', screenHtml().includes('承诺卡 B 已签署') && money() === 20, 'money=' + money() + ' html=' + screenHtml().slice(0, 120));
}
{
  // T1: signed A -> resume shows the signed card only; pickT1 cannot
  // re-sign. 落榜 + 未选去向 -> the signed screen still offers the
  // fallback buttons (they are not a re-sign, they complete T1).
  eraState({ turn: 1 });
  ctx(`G.state.major = { name: '计算机', tier: '一本' };
    G.state.flags.majorK = 1;
    G.state.flags.gaokao = { row: { tier: '一本' } };
    G.state.attrs.money = 20;
    G.state.commitments.A = { text: '志愿：计算机（自己选）', signedAt: 'T1', dueTurn: 4, snapshot: { major: '计算机', tier: '一本', k: 1 } };`);
  const money = () => ctx('G.state.attrs.money');
  ctx('screenT1()');
  check('V17-05 P0-1 T1 已签 A：只显示已签卡，不重进填报屏', screenHtml().includes('承诺卡 A 已签署') && !screenHtml().includes('t1-major'), screenHtml().slice(0, 200));
  ctx(`pickT1('obey')`);
  check('V17-06 P0-1 T1 直接调 pickT1：不重算，现金与 A 卡不变', money() === 20 && ctx('G.state.commitments.A.text') === '志愿：计算机（自己选）', 'money=' + money());
  ctx(`G.state.major = { name: '计算机', tier: '落榜' }; G.state.flags.fallbackChoice = undefined; screenT1();`);
  check('V17-07 P0-1 T1 已签 A 且落榜：已签屏仍给出落榜去向选择', screenHtml().includes('承诺卡 A 已签署') && screenHtml().includes('t1-fallback'), screenHtml().slice(0, 300));
  click('t1-fallback', 'repeat');
  check('V17-08 P0-1 T1 落榜去向（复读）照常走，现金不变、A 仍在', money() === 20 && ctx('G.state.flags.fallbackChoice') === 'repeat' && !!ctx('G.state.commitments.A'), 'money=' + money());
}
{
  // T12 / T14: sign functions are idempotent once the card exists
  // (guards already in place since v1.2/v1.3 — regression check).
  eraState({ turn: 12 });
  ctx(`G.state.attrs.money = 40; G.state.attrs.family = 2;
    G.t12Intimate = 'partner'; G.t12Boundary = 'close'; G.t12Cost = 'wedding';`);
  ctx('signT12()');
  const afterFirst = ctx('G.state.attrs.money');
  ctx('signT12()');
  check('V17-09 P0-1 T12 重调 signT12：婚礼只扣一次（40 -> 28，不再扣）', afterFirst === 28 && ctx('G.state.attrs.money') === 28, 'money=' + ctx('G.state.attrs.money'));
  ctx('screenT12()');
  check('V17-10 P0-1 T12 已签 D：只显示已签卡', screenHtml().includes('承诺卡 D 已签署') && !screenHtml().includes('t12-confirm'));
  t9State({ attrs: { money: 50, health: 80, skill: 70, express: 50, network: 60, influence: 20, stress: 20, debt: 0, family: 0 } });
  ctx(`G.state.turn = 14;
    G.state.commitments.E = { text: '押注：继续打工', signedAt: 'T14', dueTurn: 16, snapshot: { line: 'work' } };`);
  ctx(`pickT14('startup')`);
  check('V17-11 P0-1 T14 已签 E：重调 pickT14 不改现金、不改 E 卡', ctx('G.state.attrs.money') === 50 && ctx('G.state.commitments.E.text') === '押注：继续打工', 'money=' + ctx('G.state.attrs.money'));
}

// ---------- P0-2: T13 封存照护对象，T16 只读封存 ----------
{
  // T13 seals the care subject together with H5.
  eraState({ familyKey: 'orphan', turn: 12 });
  ctx(`G.state.flags.relationship = 'partner';`);
  ctx('enterYear(13)');
  check('V17-12 P0-2 T13 同时封存照护对象（伴侣）与 H5', ctx('G.state.flags.sealedCareSubject') === 'partner' && !!ctx('G.state.sealed.H5'), 'sealed=' + ctx('G.state.flags.sealedCareSubject'));
}
{
  // Reviewer scenario verbatim: T13 sealed partner (H5 level 2), T14 E
  // fails and the partner leaves, T16 must still charge 40万 for the
  // partner and show the partner — charge, subject and UI consistent.
  eraState({ familyKey: 'orphan', turn: 16 });
  ctx(`G.state.flags.relationship = 'partner';
    G.state.flags.careSubject = 'partner';
    G.state.flags.sealedCareSubject = 'partner';
    G.state.sealed.H5 = { value: 2 };
    G.state.attrs.money = 50;
    G.state.attrs.health = 80;
    G.state.attrs.stress = 20;
    // T14 E 失败，伴侣离开。
    G.state.flags.relationship = 'none';`);
  check('V17-13 P0-2 伴侣离开后，封存对象仍是伴侣', ctx(`sealedCareSubject(G.state).kind`) === 'partner');
  ctx('screenT16()');
  check('V17-14 P0-2 T16 伴侣离开：照护费照扣（50万 -> 10万，2 级 -40万）', ctx('G.state.attrs.money') === 10, 'money=' + ctx('G.state.attrs.money'));
  check('V17-15 P0-2 T16 UI 仍写伴侣的病，不出现“没有医疗费”', screenHtml().includes('伴侣') && !screenHtml().includes('没有医疗费'), screenHtml().slice(0, 300));
  check('V17-16 P0-2 T16 h5Result 记 2 级', ctx('G.state.flags.h5Result.level') === 2);
  ctx('screenT16()');
  check('V17-17 P0-2 T16 再进一次：不重复扣费（仍 10 万）', ctx('G.state.attrs.money') === 10, 'money=' + ctx('G.state.attrs.money'));
}
{
  // v1.3 save migration: sealed H5 + careSubject, no sealedCareSubject
  // -> backfilled from careSubject.
  ctx(`G.__v13 = { version: 1, seed: 1, slot: 1, turn: 14, attrs: {}, sealed: { H5: { value: 2 } }, flags: { careSubject: 'partner' }, commitments: {}, decisions: {}, yearlyLog: [], omenLog: [], yearActions: [] };`);
  check('V17-18 P0-2 迁移层：v1.3 存档回填 sealedCareSubject', ctx('migrateSave(G.__v13).flags.sealedCareSubject') === 'partner');
  ctx(`localStorage.setItem(saveKeyForSlot(1), JSON.stringify(G.__v13));`);
  check('V17-19 P0-2 loadGame 走迁移层：读出的存档带 sealedCareSubject', ctx('loadGame(1).flags.sealedCareSubject') === 'partner');
}

// ---------- 断亲目标拆分 ----------
{
  // absentBoth: estrangement must pick a scope before signing;
  // parents-only keeps the grandmother care line reachable.
  eraState({ familyKey: 'absentBoth', turn: 12 });
  ctx(`G.state.attrs.money = 40; G.state.attrs.family = 2;`);
  ctx('screenT12()');
  click('t12-intimate', 'single');
  click('t12-boundary', 'estranged');
  check('V17-20 断亲拆分：双缺席选断亲后须选目标，未选时不给签字确认', screenHtml().includes('断亲的目标') && !screenHtml().includes('t12-confirm'), screenHtml().slice(0, 400));
  click('t12-scope', 'parents');
  check('V17-21 断亲拆分：选“只与父母断联”后可签字', screenHtml().includes('t12-confirm'));
  click('t12-confirm');
  check('V17-22 断亲拆分：只断父母——scope 落档 parents，家庭线仍归零', ctx('G.state.flags.estrangedScope') === 'parents' && ctx('G.state.flags.estranged') === true && ctx('G.state.attrs.family') === 0, 'scope=' + ctx('G.state.flags.estrangedScope'));
  check('V17-23 断亲拆分：只断父母时，奶奶照护对象保留', ctx(`careSubjectFor(G.state).kind`) === 'grandparents', 'kind=' + ctx(`careSubjectFor(G.state).kind`));
  check('V17-24 断亲拆分：已签 D 卡写明“只与父母断联”', screenHtml().includes('只与父母断联'));
  check('V17-25 断亲拆分：只断父母时，奶奶的照护事件仍可到达', ctx(`sealedCareSubject(G.state).kind`) === 'grandparents');
}
{
  // 'all' still cuts the whole line (v1.3 behavior preserved).
  eraState({ familyKey: 'absentBoth', turn: 12 });
  ctx(`G.state.attrs.family = 2;`);
  click('t12-intimate', 'single');
  click('t12-boundary', 'estranged');
  click('t12-scope', 'all');
  click('t12-confirm');
  check('V17-26 断亲拆分：选“整个原生家庭”——奶奶照护消失', ctx(`careSubjectFor(G.state).kind`) !== 'grandparents' && ctx('G.state.flags.estrangedScope') === 'all', 'kind=' + ctx(`careSubjectFor(G.state).kind`));
}
{
  // Non-absentBoth origins: parents ARE the caregivers, so estrangement
  // is whole-family by definition — no scope question, auto 'all'.
  eraState({ familyKey: 'model', turn: 12 });
  ctx('screenT12()');
  click('t12-intimate', 'single');
  click('t12-boundary', 'estranged');
  check('V17-27 断亲拆分：模范父母出身断亲即全断，无需另选目标、可直接签字', screenHtml().includes('t12-confirm') && screenHtml().includes('父母就是实际抚养你的人'));
  click('t12-confirm');
  check('V17-28 断亲拆分：模范父母出身断亲 scope 自动为 all', ctx('G.state.flags.estrangedScope') === 'all');
  check('V17-29 断亲拆分：旧存档无 scope 字段时按 all 处理（向后兼容）', ctx(`estrangementScope({ flags: { estranged: true } })`) === 'all' && ctx(`careSubjectFor({ origin: { familyKey: 'absentBoth' }, flags: { estranged: true }, attrs: { health: 85 } }).kind`) === 'none');
}

// ---------- P1-3: 教培未知细分严格门控 + 补填 ----------
{
  const t9i = (y, ind, sub) => ctx(`t9IndustryAdjustment(${y}, '${ind}'${sub === undefined ? '' : `, '${sub}'`})`);
  check('V17-30 P1-3 K12 正确命中：2021 +12 / 2022 +8 / 2023 +2', t9i(2021, '教培', 'k12_subject_tutoring') === 12 && t9i(2022, '教培', 'k12_subject_tutoring') === 8 && t9i(2023, '教培', 'k12_subject_tutoring') === 2);
  check('V17-31 P1-3 未知细分（null / undefined / unknown）三年全 0', t9i(2021, '教培', null) === 0 && t9i(2022, '教培') === 0 && t9i(2023, '教培', 'unknown') === 0 && t9i(2021, '教培', 'something-else') === 0);
  check('V17-32 P1-3 素质、职业三年全 0', t9i(2021, '教培', 'quality') === 0 && t9i(2022, '教培', 'quality') === 0 && t9i(2023, '教培', 'quality') === 0 && t9i(2021, '教培', 'vocational') === 0 && t9i(2022, '教培', 'vocational') === 0 && t9i(2023, '教培', 'vocational') === 0);
  check('V17-33 P1-3 未知细分不拉高裁员率：layoffChance 经 null subsector 得 0 修正', (() => {
    const layoff = (sub) => ctx(`layoffChance({ attrs: {}, flags: { era: { examYear: 2013 }, hasProtector: true, jobProfile: { employerType: 'startup', sector: 'education', sectorName: '教培', subsector: ${sub === null ? 'null' : `'${sub}'`}, policyExposure: true, salaryAnnual: 10, startTurn: 5 } }, sealed: {}, commitments: {} })`);
    return layoff(null) === 20 && layoff('k12_subject_tutoring') === 32 && layoff('quality') === 20;
  })(), 'null/k12/quality=' + [null, 'k12_subject_tutoring', 'quality'].map((s) => ctx(`layoffChance({ attrs: {}, flags: { era: { examYear: 2013 }, hasProtector: true, jobProfile: { employerType: 'startup', sector: 'education', sectorName: '教培', subsector: ${s === null ? 'null' : `'${s}'`}, policyExposure: true, salaryAnnual: 10, startTurn: 5 } }, sealed: {}, commitments: {} })`)).join('/'));
}
{
  // Old-save migration marks the missing subsector instead of guessing it.
  ctx(`G.__v13b = { version: 1, flags: { jobProfile: { employerType: 'startup', sector: 'education', sectorName: '教培', subsector: null, policyExposure: false, salaryAnnual: 10, startTurn: 5 } } };`);
  check('V17-34 P1-3 迁移层：教培 null 细分标 subsectorMissing，不猜细分', ctx('migrateSave(G.__v13b).flags.subsectorMissing') === true && ctx('G.__v13b.flags.jobProfile.subsector') === null);
  ctx(`G.__v13c = { version: 1, flags: { jobIndustry: '教培' } };`);
  check('V17-35 P1-3 迁移层：只有 jobIndustry 的旧存档建空壳 jobProfile 并标缺失', ctx('migrateSave(G.__v13c).flags.jobProfile.sector') === 'education' && ctx('G.__v13c.flags.subsectorMissing') === true);
}
{
  // T9 slice entry: missing subsector prompts to fill it in BEFORE H2
  // seals; picking K12 seals H2 with the K12 adjustment; skipping
  // proceeds with adjustment 0 and does not ask again.
  t9State({ laidOff: true });
  ctx(`G.state.flags.jobProfile = { employerType: 'startup', sector: 'education', sectorName: '教培', subsector: null, policyExposure: false, salaryAnnual: 10, startTurn: 5 };
    G.state.flags.jobIndustry = '教培';
    delete G.state.flags.h2;
    G.state.flags.subsectorMissing = true;`);
  ctx('enterSlice(false)');
  check('V17-36 P1-3 切片入口：教培缺细分时先出补填屏、H2 暂不封存', screenHtml().includes('补填行业细分') && screenHtml().includes('slice-subsector-pick') && !ctx('G.state.flags.h2'), screenHtml().slice(0, 200));
  click('slice-subsector-pick', 'k12_subject_tutoring');
  check('V17-37 P1-3 补选学科后：细分写回，H2 封存', ctx('G.state.flags.jobProfile.subsector') === 'k12_subject_tutoring' && !!ctx('G.state.flags.h2') && !screenHtml().includes('补填行业细分'));
  t9State({ laidOff: true });
  ctx(`G.state.flags.jobProfile = { employerType: 'startup', sector: 'education', sectorName: '教培', subsector: null, policyExposure: false, salaryAnnual: 10, startTurn: 5 };
    G.state.flags.jobIndustry = '教培';
    delete G.state.flags.h2;
    G.state.flags.subsectorMissing = true;`);
  ctx('enterSlice(false)');
  click('slice-subsector-skip');
  check('V17-38 P1-3 跳过补填：按未知细分继续，H2 封存、不再追问', !!ctx('G.state.flags.h2') && ctx('G.state.flags.jobProfile.subsector') === null && ctx('G.state.flags.subsectorMissing') === false && !screenHtml().includes('补填行业细分'));
  // Non-education slice never prompts.
  t9State({ laidOff: true });
  ctx(`delete G.state.flags.h2;`);
  ctx('enterSlice(false)');
  check('V17-39 P1-3 互联网切片不弹补填屏', !screenHtml().includes('补填行业细分') && !!ctx('G.state.flags.h2'));
}

// ---------- 面试总结页 ----------
{
  // English interview: Q1 -> Q2 -> Q3 -> summary (no loop back to Q1).
  ctx(`G = { state: null, rng: makeRng(999), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 }; screenDrillLobby();`);
  click('drill-start', 'en-interview');
  sandbox.document.querySelector('#drill-input').value = 'I led a team of five and improved onboarding completion by 30 percent in three months.';
  click('drill-en-send');
  check('V17-40 总结页：Q1 发送后进 Q2，不出总结页', screenHtml().includes('第 2 / 3 问') && !screenHtml().includes('三问完成'));
  sandbox.document.querySelector('#drill-input').value = 'I solved a conflict by listening to both sides and finding a compromise that worked for everyone.';
  click('drill-en-send');
  check('V17-41 总结页：Q2 发送后进 Q3', screenHtml().includes('第 3 / 3 问') && !screenHtml().includes('三问完成'));
  sandbox.document.querySelector('#drill-input').value = 'I want to join because your team builds products for real users and I can contribute my experience in growth.';
  click('drill-en-send');
  check('V17-42 总结页：Q3 发送后出“三问完成”总结页，不再循环回 Q1', screenHtml().includes('三问完成') && !screenHtml().includes('第 1 / 3 问'), screenHtml().slice(0, 300));
  check('V17-43 总结页：总分 /9、分项建议、再次练习入口齐全', /总分 <b>\d+ \/ 9<\/b>/.test(screenHtml()) && screenHtml().includes('Q1') && screenHtml().includes('Q3') && screenHtml().includes('再练一次'));
  click('drill-en-retry');
  check('V17-44 总结页：再练一次回到 Q1', screenHtml().includes('第 1 / 3 问') && !screenHtml().includes('三问完成'));
  // Fresh entry from the lobby after a completed run resets to Q1.
  ctx(`G.drillEnDone = true; G.drillEnQ = 2; screenDrill('en-interview');`);
  check('V17-45 总结页：三问完成后从演练入口重进，状态清零回 Q1', screenHtml().includes('第 1 / 3 问') && !screenHtml().includes('三问完成'));
}
{
  // Voice interview: same summary flow (text fallback in this env).
  ctx(`G = { state: null, rng: makeRng(999), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 }; screenDrillLobby();`);
  click('drill-start', 'voice');
  sandbox.document.querySelector('#drill-input').value = 'I improved the process and saved the team two hours every week.';
  click('drill-voice-send');
  check('V17-46 总结页（语音）：Q1 发送后进 Q2', screenHtml().includes('第 2 / 3 问'));
  sandbox.document.querySelector('#drill-input').value = 'I handled a difficult customer by staying calm and offering a clear plan.';
  click('drill-voice-send');
  check('V17-47 总结页（语音）：Q2 发送后进 Q3', screenHtml().includes('第 3 / 3 问'));
  sandbox.document.querySelector('#drill-input').value = 'I learned a new tool in one weekend and taught it to three teammates.';
  click('drill-voice-send');
  check('V17-48 总结页（语音）：Q3 发送后出总结页，总分 /9、再练一次', screenHtml().includes('语音面试 · 三问完成') && /总分 <b>\d+ \/ 9<\/b>/.test(screenHtml()) && screenHtml().includes('再练一次'));
  click('drill-voice-retry');
  check('V17-49 总结页（语音）：再练一次回到 Q1', screenHtml().includes('第 1 / 3 问') && !screenHtml().includes('三问完成'));
}

console.log(failures === 0 ? 'ALL PASS (v17)' : failures + ' FAILURE(S) (v17)');
process.exit(failures === 0 ? 0 : 1);
