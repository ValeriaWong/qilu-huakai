'use strict';
// v1.4.3 retirement tests (V19-Rxx): 寿命范围到退休年龄（Allen 2026-11-21
// 17:11 定方案 B，100 岁方案不做）。渐进式延迟退休：男 60→63，女干部
// 55→58，女工人 50→55，15 年过渡（2025–2039）；男与原 55 女每 4 个月
// +1 个月，原 50 女每 2 个月 +1 个月；可玩出生年 1992–2004 + 2008 都
// 在过渡期后退休，全部到顶（男 63 / 女干部 58 / 女工人 55）。36 岁到
// 退休是压缩的尾声：T18 结算 → “继续：走到退休年龄” → 选退休类别
// （算出退休年龄/年份）→ 选最多 2 项退休活动 → 终局结算。
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
for (const f of ['rng.js', 'data.js', 'interpersonal.js', 'stocks.js', 'gaokao-lines.js', 'era-events.js', 'era.js', 'engine.js', 'ai-review.js', 'analytics.js', 'game.js']) {
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


// ---------- helpers (v1.4.2) ----------
// Public-branch T9 state: t9State() defaults to bigtech/internet; override
// to stable/public with no H2 and the public decisions.
function pubState(o) {
  t9State(o || {});
  ctx(`G.state.flags.employment = 'employed';
    G.state.flags.jobIndustry = '体制内';
    G.state.flags.jobProfile = { employerType: 'stable', sector: 'public', sectorName: '体制内', subsector: null, policyExposure: false, salaryAnnual: 9, startTurn: 5 };
    G.state.flags.h2 = null;
    G.state.flags.t9Branch = 'public';
    delete G.state.decisions['hr-talk'];
    delete G.state.decisions['call-laochen'];
    G.state.decisions['call-senior'] = { text: '打电话给老前辈', seal: '你拨通了老前辈的电话。' };
    G.state.decisions['review-response'] = { text: '主动申请借调', seal: '你决定主动申请借调。' };
    G.state.commitments.B = { text: '第一份工作：体制内', signedAt: 'T5', dueTurn: 6, snapshot: {} };`);
}
// Pre-slice public state at T8 (for enterSlice tests).
function pubT8State() {
  eraState({ birthYear: 1995, examYear: 2013, turn: 8 });
  ctx(`G.state.flags.employment = 'employed';
    G.state.flags.jobIndustry = '体制内';
    G.state.flags.jobProfile = { employerType: 'stable', sector: 'public', sectorName: '体制内', subsector: null, policyExposure: false, salaryAnnual: 9, startTurn: 5 };
    G.state.commitments.B = { text: '第一份工作：体制内', signedAt: 'T5', dueTurn: 6, snapshot: {} };`);
}
// Drive the exam flow to the type screen via clicks.
function toT5Exam() {
  eraState({ birthYear: 1995, examYear: 2013, turn: 5 });
  ctx('screenT5()');
  click('t5-pick', 'stable');
}


// ---------- 退休年龄函数：渐进式延迟退休 ----------
{
  check('V19-R01 男：1995→63 岁 0 个月；1965→60 岁 1 个月；1970→61 岁 4 个月；2004→63 岁',
    JSON.stringify(ctx(`retirementAgeFor(1995, 'male')`)) === JSON.stringify({ years: 63, months: 0 })
    && JSON.stringify(ctx(`retirementAgeFor(1965, 'male')`)) === JSON.stringify({ years: 60, months: 1 })
    && JSON.stringify(ctx(`retirementAgeFor(1970, 'male')`)) === JSON.stringify({ years: 61, months: 4 })
    && JSON.stringify(ctx(`retirementAgeFor(2004, 'male')`)) === JSON.stringify({ years: 63, months: 0 }));
  check('V19-R02 女干部：1995→58 岁；1960→55 岁 0 个月（改革前已到龄，不延迟）',
    JSON.stringify(ctx(`retirementAgeFor(1995, 'female-cadre')`)) === JSON.stringify({ years: 58, months: 0 })
    && JSON.stringify(ctx(`retirementAgeFor(1960, 'female-cadre')`)) === JSON.stringify({ years: 55, months: 0 }));
  check('V19-R03 女工人：1975→50 岁 1 个月；1980→52 岁 7 个月；1995→55 岁',
    JSON.stringify(ctx(`retirementAgeFor(1975, 'female-worker')`)) === JSON.stringify({ years: 50, months: 1 })
    && JSON.stringify(ctx(`retirementAgeFor(1980, 'female-worker')`)) === JSON.stringify({ years: 52, months: 7 })
    && JSON.stringify(ctx(`retirementAgeFor(1995, 'female-worker')`)) === JSON.stringify({ years: 55, months: 0 }));
  check('V19-R04 退休年份：1995 男→2058；1970 男→2031；1980 女工人→2032',
    ctx(`retirementYearFor(1995, 'male')`) === 2058 && ctx(`retirementYearFor(1970, 'male')`) === 2031
    && ctx(`retirementYearFor(1980, 'female-worker')`) === 2032);
  check('V19-R05 退休类别表：3 类，基数/步长/上限/到顶值与改革口径一致',
    ctx('RETIREMENT_CATEGORIES').length === 3
    && ctx(`RETIREMENT_CATEGORIES.find((c) => c.id === 'male')`).baseYears === 60
    && ctx(`RETIREMENT_CATEGORIES.find((c) => c.id === 'male')`).step === 4
    && ctx(`RETIREMENT_CATEGORIES.find((c) => c.id === 'male')`).maxDelayMonths === 36
    && ctx(`RETIREMENT_CATEGORIES.find((c) => c.id === 'male')`).finalYears === 63
    && ctx(`RETIREMENT_CATEGORIES.find((c) => c.id === 'female-cadre')`).finalYears === 58
    && ctx(`RETIREMENT_CATEGORIES.find((c) => c.id === 'female-worker')`).baseYears === 50
    && ctx(`RETIREMENT_CATEGORIES.find((c) => c.id === 'female-worker')`).step === 2
    && ctx(`RETIREMENT_CATEGORIES.find((c) => c.id === 'female-worker')`).maxDelayMonths === 60
    && ctx(`RETIREMENT_CATEGORIES.find((c) => c.id === 'female-worker')`).finalYears === 55);
  check('V19-R06 退休活动表：7 项（返聘/带孙辈/旅行/创业/志愿者/学习/什么都不做）',
    ctx('RETIREMENT_ACTIVITIES').length === 7
    && ctx(`RETIREMENT_ACTIVITIES.map((a) => a.id).join(',')`) === 'rehired,grandkids,travel,venture,volunteer,learn,idle');
}

// ---------- 退休流程：类别 → 活动（最多 2 项） → 终局结算 ----------
{
  const settled = (birthYear) => {
    eraState({ birthYear, examYear: birthYear + 18, turn: 18 });
    ctx(`G.state.flags.era = { birthYear: ${birthYear}, examYear: ${birthYear + 18} }; G.state.finished = true;`);
  };
  settled(1995);
  ctx('screenRetireIntro()');
  check('V19-R07 退休类别屏：男职工 63 岁（2058 年），女干部 58，女工人 55',
    screenHtml().includes('男职工') && screenHtml().includes('63 岁') && screenHtml().includes('2058')
    && screenHtml().includes('58 岁') && screenHtml().includes('55 岁'));
  click('retire-cat', 'male');
  check('V19-R08 选类别：retirement 记下 63 岁/2058 年，进活动屏（有返聘）',
    ctx('G.state.flags.retirement').category === 'male' && ctx('G.state.flags.retirement').retireAgeYears === 63
    && ctx('G.state.flags.retirement').retireAgeMonths === 0 && ctx('G.state.flags.retirement').retireYear === 2058
    && ctx('G.state.flags.retirement').done === false && screenHtml().includes('退休之后做什么') && screenHtml().includes('返聘'));
  click('retire-act', 'travel');
  click('retire-act', 'volunteer');
  check('V19-R09 活动最多选 2 项：第三项点不动，仍是 2 项',
    JSON.stringify(ctx('G.state.flags.retirement.activities')) === JSON.stringify(['travel', 'volunteer'])
    && (() => { click('retire-act', 'venture'); return JSON.stringify(ctx('G.state.flags.retirement.activities')) === JSON.stringify(['travel', 'volunteer']); })());
  click('retire-act', 'travel');
  check('V19-R10 活动可取消再选：取消旅行后可选创业',
    JSON.stringify(ctx('G.state.flags.retirement.activities')) === JSON.stringify(['volunteer'])
    && (() => { click('retire-act', 'venture'); return JSON.stringify(ctx('G.state.flags.retirement.activities')) === JSON.stringify(['volunteer', 'venture']); })());
  click('retire-done');
  check('V19-R11 终局结算：done=true，屏上有“终局结算 · 63 岁退休”与所选活动',
    ctx('G.state.flags.retirement').done === true && screenHtml().includes('终局结算') && screenHtml().includes('63 岁退休')
    && screenHtml().includes('志愿者') && screenHtml().includes('创业') && screenHtml().includes('2058'));
  check('V19-R12 终局结算：写明执念分按 35 岁算、退休不改分，并有最后的状态与再来一次',
    screenHtml().includes('执念分按 35 岁结算时算') && screenHtml().includes('最后的状态') && screenHtml().includes('再来一次'));
  // 0 项时完成按钮禁用，直接调 finish 也不结算。
  settled(1995);
  ctx('screenRetireIntro()');
  click('retire-cat', 'female-cadre');
  check('V19-R13 0 项时完成按钮禁用', screenHtml().includes('data-act="retire-done" disabled'));
  ctx('finishRetirement()');
  check('V19-R13b 0 项时直接调 finish 也不结算，done 仍 false', ctx('G.state.flags.retirement').done === false);
  // 无出生年份：先补出生年份。
  eraState({ birthYear: 1995, examYear: 2013, turn: 18 });
  ctx('delete G.state.flags.era; G.state.finished = true;');
  ctx('screenRetireIntro()');
  check('V19-R14 无出生年份：先出补出生年份的输入屏', screenHtml().includes('retire-birth') && screenHtml().includes('出生'));
}

// ---------- 结算屏入口与继续路由 ----------
{
  const settled = (birthYear) => {
    eraState({ birthYear, examYear: birthYear + 18, turn: 18 });
    ctx(`G.state.flags.era = { birthYear: ${birthYear}, examYear: ${birthYear + 18} }; G.state.finished = true;`);
  };
  settled(1995);
  ctx('screenSettlement()');
  check('V19-R15 T18 结算屏：旧结局还在（再来一次），新增“继续：走到退休年龄”',
    screenHtml().includes('再来一次') && screenHtml().includes('继续：走到退休年龄'));
  click('retire-continue');
  check('V19-R16 点“继续”进退休类别屏', screenHtml().includes('男职工') && screenHtml().includes('63 岁'));
  // 继续路由：已完成退休 → 终局结算；进行中 → 活动屏；未开始 → T18 结算。
  settled(1995);
  ctx(`G.state.flags.retirement = { category: 'male', retireAgeYears: 63, retireAgeMonths: 0, retireYear: 2058, activities: ['travel'], done: true };`);
  ctx('saveGame(G.state);');
  ctx('screenTitle();');
  click('continue');
  check('V19-R17a 继续：退休已完成 → 直接回终局结算', screenHtml().includes('终局结算') && screenHtml().includes('63 岁退休'));
  settled(1995);
  ctx(`G.state.flags.retirement = { category: 'male', retireAgeYears: 63, retireAgeMonths: 0, retireYear: 2058, activities: ['travel'], done: false };`);
  ctx('saveGame(G.state);');
  ctx('screenTitle();');
  click('continue');
  check('V19-R17b 继续：退休进行中 → 回活动屏', screenHtml().includes('退休之后做什么'));
  settled(1995);
  ctx('saveGame(G.state);');
  ctx('screenTitle();');
  click('continue');
  check('V19-R17c 继续：未开始退休 → 回 T18 结算屏', screenHtml().includes('再来一次') && screenHtml().includes('继续：走到退休年龄'));
}

console.log(failures === 0 ? 'ALL PASS (v19-retirement)' : failures + ' FAILURE(S) (v19-retirement)');
process.exit(failures === 0 ? 0 : 1);
