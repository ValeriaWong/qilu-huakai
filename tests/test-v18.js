'use strict';
// v1.4.2 tests (V18-xx): Allen 2026-11-21 16:03 试玩反馈 4 项 +
// 补充 A（体制内入职考试，取代原第 1 项简单跳过）、B（考证系统）、
// C（体制内年度考核，16:08）、D（官场诱惑与纪律风险，16:10）。
//   issue 1 -> A：pickT5('stable') 进考试流程（国考/省考 → 省份 →
//     职位 → 报名 → 笔试 → 面试），通过才入职 sector='public'；
//     大厂仍两步签（回归）。
//   issue 2：转专业加专业 ≥30 门槛（与笔试共用 attrs.skill）；
//     门槛下不可申请，门槛上仍掷 50%。
//   issue 3：sliceBranch 新增 'public'（stable 或 sector public），
//     不掷 H2、不领补偿，走危机之夜；t9Branch 同步 'public'。
//   issue 4：劳动合同法授课卡与补偿只在 employed 线；public 分支
//     渲染文本不含“劳动合同法”与“裁员”。
//   B：有效小时 = 投入小时 × 天赋乘数（k）；10000 有效小时必过；
//     难度档区分；考过加成。
//   C：年度考核四档；不称职很难（全年零产出 + 剩 ≥2 AP + 未选事件）；
//     两次连续不称职触发组织部谈话；谈话 ≠ 裁员/离职。
//   D：影响力 ≥30 触发诱惑；拒绝无事；接兼职有 20%/年举报链
//     （警告 → 留置/双规，2018 年为界）；下海离开体制内。
// Harness: same vm sandbox + DOM stub as test-v17 (plus confirm stub).
// 页脚约定（git 历史核实）：页脚只写大版本.小版本（v1.4.1 的页脚是
// v1.4），所以 v1.4.2 的页脚仍是 v1.4，不改——V18-44 锁定这一约定。
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

// ---------- A: 体制内入职考试（补充 A，取代原第 1 项简单跳过） ----------
{
  toT5Exam();
  check('V18-01 pickT5 stable 进考试流程：国考/省考屏，不进选行业屏', screenHtml().includes('国考') && screenHtml().includes('省考') && !screenHtml().includes('t5-sector-pick') && !screenHtml().includes('选行业'), screenHtml().slice(0, 200));
  click('exam-type', 'national');
  check('V18-02 国考直进职位屏（无省份步）', screenHtml().includes('选职位') && !screenHtml().includes('选省份'));
  toT5Exam();
  click('exam-type', 'provincial');
  check('V18-03 省考先进省份屏', screenHtml().includes('选省份') && screenHtml().includes('山东'));
  click('exam-province', 'shandong');
  check('V18-03b 选省后进职位屏', screenHtml().includes('选职位'));
  check('V18-04 省份修正改笔试门槛：山东基层 30、吉林基层 20、国考基层 25（国考 +5 已取消，§9.8）',
    ctx(`civilExamThresholds({ type: 'provincial', provinceId: 'shandong', positionId: 'grassroots' }).written`) === 30
    && ctx(`civilExamThresholds({ type: 'provincial', provinceId: 'jilin', positionId: 'grassroots' }).written`) === 20
    && ctx(`civilExamThresholds({ type: 'national', provinceId: null, positionId: 'grassroots' }).written`) === 25
    && ctx(`civilExamThresholds({ type: 'national', provinceId: null, positionId: 'grassroots' }).interview`) === 20);
  // 笔试落榜：专业 20，国考基层笔试 25（minRng 钉死：笔试 20+0 未过线）。
  toT5Exam();
  click('exam-type', 'national');
  click('exam-position', 'grassroots');
  click('exam-confirm');
  check('V18-05a 报名屏写明门槛与自身数值', screenHtml().includes('笔试门槛 25') && screenHtml().includes('你的专业 20'));
  ctx('G.rng = (' + minRng.toString() + ')()');
  click('exam-written');
  check('V18-05b 笔试落榜：落榜屏 + 改报入口', screenHtml().includes('笔试没过线') && screenHtml().includes('改报其他职位'));
  click('exam-fail-repick');
  check('V18-05c 改报回职位屏', screenHtml().includes('选职位'));
  // 面试落榜：省考吉林普通岗，专业 30 够笔试 25，表达 20 不够面试 22。
  // minRng 钉死：笔试 30+0=30（超线 5 分自动进 1:3），面试 20+0=20 未过。
  toT5Exam();
  ctx('G.state.attrs.skill = 30;');
  click('exam-type', 'provincial');
  click('exam-province', 'jilin');
  click('exam-position', 'normal');
  click('exam-confirm');
  ctx('G.rng = (' + minRng.toString() + ')()');
  click('exam-written');
  check('V18-06a 笔试通过进面试屏', screenHtml().includes('面试') && screenHtml().includes('笔试过了'));
  click('exam-interview');
  check('V18-06b 面试落榜：落榜屏 + 换类型入口', screenHtml().includes('面试没过') && screenHtml().includes('换个考试类型'));
  click('exam-fail-retype');
  check('V18-06c 换类型回考试选择屏', screenHtml().includes('先选考试'));
  // 全程通过：省考吉林基层，专业 20 / 表达 20 刚好够（20/20）。
  // maxRng 钉死：笔试 20+10=30（超线 10 分自动进 1:3），面试 20+10=30
  // 过线，体检/考察/公示 90% 档 maxRng 必过 → 考上屏。
  toT5Exam();
  click('exam-type', 'provincial');
  click('exam-province', 'jilin');
  click('exam-position', 'grassroots');
  click('exam-confirm');
  ctx('G.rng = (' + maxRng.toString() + ')()');
  click('exam-written');
  click('exam-interview');
  check('V18-07a2 面试过后进体检/考察/公示屏', screenHtml().includes('体检') && screenHtml().includes('考察') && screenHtml().includes('公示'));
  click('exam-checkup');
  check('V18-07a 笔试面试都过：考上屏', screenHtml().includes('考上了'));
  click('exam-hire');
  check('V18-07b 入职定 sector=public：B 卡签了，jobProfile 体制内', !!ctx('G.state.commitments.B') && ctx('G.state.flags.jobProfile').sector === 'public' && ctx('G.state.flags.jobProfile').employerType === 'stable' && ctx('G.state.flags.employment') === 'employed' && ctx('G.state.commitments.B').text.includes('体制内'));
  // 放弃考公回 T5。
  toT5Exam();
  click('exam-quit');
  check('V18-08 放弃考公回 T5 去向屏，B 卡未签', screenHtml().includes('t5-pick') && !ctx('G.state.commitments.B'));
  // 回归：大厂仍两步签。
  eraState({ birthYear: 1995, examYear: 2013, turn: 5 });
  ctx('screenT5()');
  click('t5-pick', 'bigtech');
  check('V18-09a 大厂仍进选行业屏', screenHtml().includes('选行业'));
  click('t5-sector-pick', 'internet');
  check('V18-09b 大厂两步签：B 卡签了，sector=internet', !!ctx('G.state.commitments.B') && ctx('G.state.flags.jobProfile').sector === 'internet' && ctx('G.state.flags.employment') === 'employed');
  // 笔试与转专业共用同一学业数值（attrs.skill）。
  eraState({ birthYear: 1995, examYear: 2013, turn: 2 });
  ctx(`G.state.major = { name: '土木', source: 'self', tier: '一本' }; G.state.flags.adjusted = true; G.state.flags.adjustedFrom = '计算机'; G.state.ap = 3; G.state.attrs.skill = 25;`);
  check('V18-10 笔试与转专业共用 attrs.skill：skill 25 时转专业不够门槛、国考普通岗笔试门槛 30 也够不着',
    ctx('transferMajorEligible(G.state)') === false
    && ctx(`civilExamThresholds({ type: 'national', provinceId: null, positionId: 'normal' }).written`) === 30
    && ctx('G.state.attrs.skill') < 30);
  ctx('G.state.attrs.skill = 30;');
  check('V18-10b skill 30 时转专业够门槛', ctx('transferMajorEligible(G.state)') === true);
}

// ---------- B: 考证系统（补充 B） ----------
{
  check('V18-11 有效小时 = 投入 × 天赋：500×1=500、500×1.3=650、500×0.8=400',
    ctx('certEffectiveHours(500, 1)') === 500 && ctx('certEffectiveHours(500, 1.3)') === 650 && ctx('certEffectiveHours(500, 0.8)') === 400);
  eraState({ turn: 2 });
  ctx('G.state.flags.majorK = 1.3;');
  check('V18-11b 天赋乘数 = 专业系数 k（1.3）；无 k 时默认 1', ctx('certTalentK(G.state)') === 1.3 && ctx('certTalentK({ flags: {} })') === 1);
  // 2000 小时必过：注会差 500 时 1 AP（k=1）补满 2000（§9.1 校准后）。
  eraState({ turn: 2 });
  ctx(`G.state.flags.majorK = 1; G.state.ap = 3; G.state.flags.certHours = { cpa: 1500 }; G.state.attrs.skill = 20; G.state.attrs.money = 40;`);
  check('V18-12 2000 有效小时必过注会：考过 + 专业 +10、钱 +5 万', ctx(`certStudy(G.state, 'cpa')`) === true && ctx('certPassed(G.state, "cpa")') === true && ctx('G.state.attrs.skill') === 30 && ctx('G.state.attrs.money') === 45 && ctx('G.state.ap') === 2);
  check('V18-12b 已考过不能再考', ctx(`certStudy(G.state, 'cpa')`) === false && ctx('G.state.ap') === 2);
  // 天赋乘数起作用：k=1.3 时 1 AP 过四级；k=0.8 时 1 AP 不够、2 AP 才够。
  eraState({ turn: 2 });
  ctx(`G.state.flags.majorK = 1.3; G.state.ap = 3; G.state.attrs.express = 20;`);
  check('V18-13a k=1.3：1 AP 四级 650 有效小时 ≥250，通过，表达 +5', ctx(`certStudy(G.state, 'cet4')`) === true && ctx('certPassed(G.state, "cet4")') === true && ctx('G.state.attrs.express') === 25);
  eraState({ turn: 2 });
  ctx(`G.state.flags.majorK = 0.8; G.state.ap = 3; G.state.attrs.express = 20; G.state.flags.certs = ['cet4'];`);
  check('V18-13b k=0.8：1 AP 六级 400 小时不够（500），2 AP 800 小时才通过', ctx(`certStudy(G.state, 'cet6')`) === true && ctx('certPassed(G.state, "cet6")') === false && ctx(`certStudy(G.state, 'cet6')`) === true && ctx('certPassed(G.state, "cet6")') === true && ctx('G.state.attrs.express') === 25);
  // 难度档区分：1 AP（k=1）够四级（250）与六级（500），不够注会（2000）。
  eraState({ turn: 2 });
  ctx(`G.state.flags.majorK = 1; G.state.ap = 3;`);
  ctx(`certStudy(G.state, 'cet4'); certStudy(G.state, 'cet6'); certStudy(G.state, 'cpa');`);
  check('V18-14 难度档区分：1 AP 过四级（250）与六级（500）、不过注会（2000）',
    ctx('certPassed(G.state, "cet4")') === true && ctx('certPassed(G.state, "cet6")') === true && ctx('certHours(G.state, "cet6")') === 500 && ctx('certPassed(G.state, "cpa")') === false && ctx('certHours(G.state, "cpa")') === 500);
  // 考过加成：教资 +5 专业（T3 起可报，在校三年级以上）。
  eraState({ turn: 3 });
  ctx(`G.state.flags.majorK = 1; G.state.ap = 3; G.state.flags.certHours = { teacher: 250 }; G.state.attrs.skill = 20;`);
  check('V18-15 教资 750 小时考过：专业 +5', ctx(`certStudy(G.state, 'teacher')`) === true && ctx('certPassed(G.state, "teacher")') === true && ctx('G.state.attrs.skill') === 25);
  // 回归：考证除 AP 外不碰其他属性；年屏/在职年屏都有入口。
  eraState({ turn: 3 });
  ctx(`G.state.flags.majorK = 1; G.state.ap = 3; G.state.attrs.money = 40; G.state.attrs.stress = 20;`);
  ctx(`certStudy(G.state, 'teacher');`);
  check('V18-16a 回归：1 AP 考教资未过（500<750），只扣 AP，钱与压力不动', ctx('G.state.ap') === 2 && ctx('G.state.attrs.money') === 40 && ctx('G.state.attrs.stress') === 20);
  eraState({ turn: 2 });
  ctx('startYear(2)');
  check('V18-16b 年屏有考证卡：七证 + 天赋行', screenHtml().includes('考证') && screenHtml().includes('大学英语四级') && screenHtml().includes('注册会计师') && screenHtml().includes('天赋乘数'));
  eraState({ turn: 7 });
  ctx('startYear(7)');
  check('V18-16c 在职年屏（T7）也能考证', screenHtml().includes('考证'));
}

// ---------- issue 2：转专业学业门槛 ----------
{
  const transferSetup = (turn, skill, roll) => {
    eraState({ birthYear: 1995, examYear: 2013, turn });
    ctx(`G.state.major = { name: '土木', source: 'self', tier: '一本' }; G.state.flags.adjusted = true; G.state.flags.adjustedFrom = '计算机'; G.state.ap = 3; G.state.attrs.stress = 20; G.state.attrs.skill = ${skill};`);
    ctx(`G.rng = ({ next: () => 0.5, int: (a,b) => ${roll}, chance: () => true, float: (a) => a, pick: (arr) => arr[0], weighted: (e) => e[0][0], shuffle: (a) => a.slice(), getState: () => 0, setState: () => {} })`);
  };
  transferSetup(2, 20, 30);
  check('V18-18 无学业投入不可申请：专业 20 时门槛拦住，AP 与压力不动', ctx('transferMajorEligible(G.state)') === false && ctx('attemptTransferMajor(G.state, G.rng)') === false && ctx('G.state.ap') === 3 && ctx('G.state.attrs.stress') === 20);
  transferSetup(2, 30, 30);
  check('V18-19a 有投入可申请：专业 30 时门槛通过，掷骰 30 成功', ctx('transferMajorEligible(G.state)') === true && ctx('attemptTransferMajor(G.state, G.rng)') === true && ctx('G.state.major').name === '计算机' && ctx('G.state.flags.adjusted') === false && ctx('G.state.ap') === 2 && ctx('G.state.attrs.stress') === 20);
  transferSetup(2, 30, 80);
  check('V18-19b 门槛通过后仍掷 50%：掷骰 80 失败，压力 +10', ctx('attemptTransferMajor(G.state, G.rng)') === true && ctx('G.state.major').name === '土木' && ctx('G.state.attrs.stress') === 30 && ctx('G.state.flags.adjusted') === true);
  // UI：卡片不消失，写明门槛；够门槛时按钮可用。
  eraState({ birthYear: 1995, examYear: 2013, turn: 2 });
  ctx(`G.state.major = { name: '土木', source: 'self', tier: '一本' }; G.state.flags.adjusted = true; G.state.flags.adjustedFrom = '计算机'; G.state.attrs.skill = 20;`);
  ctx('startYear(2)');
  check('V18-20a 未够门槛：卡片仍在，写明“须专业 ≥ 30”，按钮禁用', screenHtml().includes('转专业') && screenHtml().includes('转回计算机') && screenHtml().includes('须专业 ≥ 30') && screenHtml().includes('data-act="transfer-major" disabled'));
  eraState({ birthYear: 1995, examYear: 2013, turn: 2 });
  ctx(`G.state.major = { name: '土木', source: 'self', tier: '一本' }; G.state.flags.adjusted = true; G.state.flags.adjustedFrom = '计算机'; G.state.attrs.skill = 30;`);
  ctx('startYear(2)');
  check('V18-20b 够门槛：卡片在，不再写门槛提示，按钮可用', screenHtml().includes('转专业') && screenHtml().includes('转回计算机') && !screenHtml().includes('须专业 ≥ 30') && screenHtml().includes('data-act="transfer-major"') && !screenHtml().includes('data-act="transfer-major" disabled'));
}

// ---------- issue 3：体制内 26 岁不裁员（public 分支） ----------
{
  check('V18-21 sliceBranch：stable→public，大厂互联网→employed，大厂体制内行业→public，自由职业→freelance',
    (() => {
      pubState();
      const a = ctx('sliceBranch(G.state)');
      ctx(`G.state.flags.jobProfile = { employerType: 'bigtech', sector: 'internet', sectorName: '互联网', subsector: null, policyExposure: false, salaryAnnual: 18, startTurn: 5 };`);
      const b = ctx('sliceBranch(G.state)');
      ctx(`G.state.flags.jobProfile = { employerType: 'bigtech', sector: 'public', sectorName: '体制内', subsector: null, policyExposure: false, salaryAnnual: 18, startTurn: 5 };`);
      const c = ctx('sliceBranch(G.state)');
      ctx(`G.state.flags.employment = 'freelance';`);
      const d = ctx('sliceBranch(G.state)');
      return a === 'public' && b === 'employed' && c === 'public' && d === 'freelance';
    })());
  // 进切片不封 H2。
  pubT8State();
  ctx('enterSlice(false)');
  check('V18-22 体制内进 T9 切片：不封 H2，危机之夜，第一件事是找老前辈',
    ctx('G.state.flags.h2') === null && ctx('G.state.turn') === 9 && screenHtml().includes('危机之夜') && !screenHtml().includes('裁员之夜') && screenHtml().includes('老前辈') && !screenHtml().includes('劳动合同法') && !screenHtml().includes('裁员'));
  check('V18-23 public 三件事：call-senior / review-response / transfer-home（借调外地，不再沿用大厂 borrow-home 的空窗期文案）',
    ctx(`sliceDecisions(G.state).map((d) => d.id).join(',')`) === 'call-senior,review-response,transfer-home'
    && ctx(`sliceDecisions(G.state)[1].body.indexOf('劳动合同法')`) === -1
    && ctx(`sliceDecisions(G.state)[2].body.indexOf('空窗期')`) === -1
    && ctx(`sliceDecisions(G.state)[2].title`).includes('借调'));
  // 结局屏。
  pubState();
  ctx('sliceEnd()');
  check('V18-24 体制内切片结局：无“裁员”与“劳动合同法”，走体制内稳岗线',
    !screenHtml().includes('裁员') && !screenHtml().includes('劳动合同法') && screenHtml().includes('体制内稳岗') && screenHtml().includes('考核与轮岗'));
  check('V18-25 t9Branch 体制内→public，标签体制内稳岗', ctx('t9Branch(G.state)') === 'public' && ctx('T9_BRANCH_LABEL.public') === '体制内稳岗');
  check('V18-26 体制内行业修正恒为 0（2021/2022/2023）',
    ctx(`t9IndustryAdjustment(2021, '体制内', null)`) === 0 && ctx(`t9IndustryAdjustment(2022, '体制内', null)`) === 0 && ctx(`t9IndustryAdjustment(2023, '体制内', null)`) === 0);
  // 回归：大厂 employed 不变。
  eraState({ birthYear: 1995, examYear: 2013, turn: 8 });
  ctx(`G.state.flags.employment = 'employed';
    G.state.flags.jobIndustry = '互联网';
    G.state.flags.jobProfile = { employerType: 'bigtech', sector: 'internet', sectorName: '互联网', subsector: null, policyExposure: false, salaryAnnual: 18, startTurn: 5 };
    G.state.commitments.B = { text: '第一份工作：大厂', signedAt: 'T5', dueTurn: 6, snapshot: {} };`);
  ctx('enterSlice(false)');
  check('V18-27a 回归：大厂进切片封 H2，裁员之夜，第一件事找老陈',
    ctx('G.state.flags.h2') !== null && typeof ctx('G.state.flags.h2').chance === 'number' && screenHtml().includes('裁员之夜') && screenHtml().includes('老陈'));
  check('V18-27b 回归：大厂三件事仍是 call-laochen / hr-talk / borrow-home，hr-talk 仍讲劳动合同法',
    ctx(`sliceDecisions(G.state).map((d) => d.id).join(',')`) === 'call-laochen,hr-talk,borrow-home'
    && ctx('T9_SLICE.decisions[1].body').includes('劳动合同法'));
  // C 卡。
  pubState();
  ctx('G.state.turn = 10; revealC(G.state);');
  check('V18-28a 体制内教训卡 C 不写裁员', ctx(`(G.state.lessons || []).some((l) => l.id === 'C' && l.text.indexOf('裁员') === -1 && l.text.indexOf('考核') >= 0)`) === true);
  check('V18-28b 体制内 C 卡四格无“裁员”与“劳动合同法”，走体制内稳岗线',
    ctx(`(() => { const html = redemptionCardHtml(G.state, 'C'); return html.indexOf('裁员') === -1 && html.indexOf('劳动合同法') === -1 && html.indexOf('体制内稳岗') >= 0; })()`) === true);
  // 结算卡 T9 按钮。
  pubT8State();
  ctx(`G.state.flags.yearSettledTurn = 8; G.state.flags.settlement = { turn: 8, before: { stress: 20, health: 80, money: 40, debt: 0 }, after: { stress: 20, health: 80, money: 40, debt: 0 }, tier: 'calm', brief: 'x', actionsText: '无', omenText: '无', ventureLines: [], evalLine: null, reportLine: null }; renderSettlementCard(G.state);`);
  check('V18-29a 体制内结算卡：进 T9 按钮写危机之夜，不写裁员之夜', screenHtml().includes('进入 T9 · 26 岁危机之夜') && !screenHtml().includes('裁员之夜'));
  eraState({ birthYear: 1995, examYear: 2013, turn: 8 });
  ctx(`G.state.flags.employment = 'employed';
    G.state.flags.jobProfile = { employerType: 'bigtech', sector: 'internet', sectorName: '互联网', subsector: null, policyExposure: false, salaryAnnual: 18, startTurn: 5 };
    G.state.flags.yearSettledTurn = 8; G.state.flags.settlement = { turn: 8, before: { stress: 20, health: 80, money: 40, debt: 0 }, after: { stress: 20, health: 80, money: 40, debt: 0 }, tier: 'calm', brief: 'x', actionsText: '无', omenText: '无', ventureLines: [], evalLine: null, reportLine: null }; renderSettlementCard(G.state);`);
  check('V18-29b 回归：大厂结算卡按钮仍写裁员之夜', screenHtml().includes('进入 T9 · 26 岁裁员之夜'));
}

// ---------- issue 4：劳动合同法只在 employed 裁员线 ----------
{
  check('V18-30 劳动合同法授课卡只在 employed 线：默认第二件事讲劳动合同法，public 第二件不讲且 id 不是 hr-talk',
    ctx('T9_SLICE.decisions[1].body').includes('劳动合同法')
    && ctx('T9_SLICE.decisions[1].id') === 'hr-talk'
    && (() => { pubState(); const ds = ctx(`sliceDecisions(G.state)`); return ds[1].id !== 'hr-talk' && ds[1].body.indexOf('劳动合同法') === -1; })());
  // 补偿不可达：public 切片结算不加钱；大厂被裁加补偿（回归）。
  pubState();
  ctx('G.state.attrs.money = 40; sliceSettleOnce(G.state);');
  check('V18-31a 体制内切片结算不领补偿：钱不动', ctx('G.state.attrs.money') === 40 && ctx('G.state.flags.sliceResolved') === true);
  t9State({ laidOff: true });
  ctx('G.state.attrs.money = 40; sliceSettleOnce(G.state);');
  check('V18-31b 回归：大厂被裁结算领补偿（N=4 年 × 月薪 1.5 万 = 6 万）', ctx('G.state.attrs.money') === 46);
}

// ---------- C：体制内年度考核（16:08） ----------
{
  const evalSetup = (turn, actions, ap, eventChoice) => {
    eraState({ birthYear: 1995, examYear: 2013, turn });
    ctx(`G.state.flags.employment = 'employed';
      G.state.flags.jobProfile = { employerType: 'stable', sector: 'public', sectorName: '体制内', subsector: null, policyExposure: false, salaryAnnual: 9, startTurn: 5 };
      G.state.yearActions = ${JSON.stringify(actions)};
      G.state.ap = ${ap};
      G.state.flags.eventChoice = '${eventChoice}';`);
  };
  evalSetup(7, ['系统学习', '加班 / 接私活'], 1, 'x');
  check('V18-32a 正常玩：2 项产出 → 优秀', ctx('evaluatePublicYear(G.state)').rating === '优秀');
  evalSetup(7, ['系统学习'], 2, 'x');
  check('V18-32b 正常玩：1 项产出 → 称职', ctx('evaluatePublicYear(G.state)').rating === '称职');
  evalSetup(7, [], 3, '');
  check('V18-33a 极低投入：零产出 + 剩 3 AP + 未选事件 → 不称职', ctx('evaluatePublicYear(G.state)').rating === '不称职');
  evalSetup(7, [], 3, 'x');
  check('V18-33b 选了事件就不算不称职 → 基本称职', ctx('evaluatePublicYear(G.state)').rating === '基本称职');
  evalSetup(7, [], 1, '');
  check('V18-33c AP 花完了也不算不称职 → 基本称职', ctx('evaluatePublicYear(G.state)').rating === '基本称职');
  evalSetup(7, ['健身 / 就医', '陪家人 / 伴侣', '社交局'], 0, 'x');
  check('V18-33d 只做非产出事、花完 AP → 基本称职', ctx('evaluatePublicYear(G.state)').rating === '基本称职');
  // 两次连续不称职触发谈话。
  evalSetup(7, [], 3, '');
  ctx('G.state.attrs.stress = 20; G.state.attrs.money = 40;');
  const r1 = ctx('evaluatePublicYear(G.state)');
  check('V18-34a 第一次不称职：只记连计数，不谈话', r1.rating === '不称职' && r1.talk === false && ctx('G.state.flags.evalStreak') === 1);
  ctx('G.state.turn = 8; G.state.yearActions = []; G.state.ap = 3; G.state.flags.eventChoice = "";');
  const r2 = ctx('evaluatePublicYear(G.state)');
  check('V18-34b 第二次连续不称职：谈话触发，压力 +5，连计数清零', r2.rating === '不称职' && r2.talk === true && ctx('G.state.flags.evalTalk').length === 1 && ctx('G.state.flags.evalTalk')[0].turn === 8 && ctx('G.state.attrs.stress') === 25 && ctx('G.state.flags.evalStreak') === 0);
  check('V18-35 谈话不是裁员/离职：仍在体制内，无 H2，无补偿，钱不动',
    ctx('G.state.flags.employment') === 'employed' && ctx('isPublicJob(G.state)') === true && ctx('sliceBranch(G.state)') === 'public' && !ctx('G.state.flags.h2') && ctx('G.state.attrs.money') === 40);
  // 结算卡显示考核。
  evalSetup(7, ['系统学习', '系统学习'], 1, 'x');
  ctx('endYear()');
  check('V18-36 结算卡显示年度考核：优秀', screenHtml().includes('年度考核') && screenHtml().includes('年度考核：优秀') && ctx('G.state.flags.settlement.evalLine').includes('优秀'));
}

// ---------- D：官场诱惑与纪律风险（16:10） ----------
{
  const temptSetup = (turn, influence, money, stress) => {
    eraState({ birthYear: 1995, examYear: 2013, turn });
    ctx(`G.state.flags.employment = 'employed';
      G.state.flags.jobProfile = { employerType: 'stable', sector: 'public', sectorName: '体制内', subsector: null, policyExposure: false, salaryAnnual: 9, startTurn: 5 };
      G.state.attrs.influence = ${influence}; G.state.attrs.money = ${money}; G.state.attrs.stress = ${stress};`);
  };
  temptSetup(7, 29, 40, 20);
  check('V18-37a 影响力 29 不触发诱惑', ctx('temptationHtml(G.state)') === '');
  temptSetup(7, 30, 40, 20);
  check('V18-37b 影响力 30 触发诱惑：兼职讲课与下海都在', ctx('temptationHtml(G.state)').includes('兼职讲课') && ctx('temptationHtml(G.state)').includes('下海'));
  ctx('startYear(7)');
  check('V18-38a 年屏出现诱惑卡', screenHtml().includes('有人找上门了'));
  temptSetup(7, 30, 40, 20);
  ctx(`G.state.flags.employment = 'employed'; G.state.flags.jobProfile = { employerType: 'bigtech', sector: 'internet', sectorName: '互联网', subsector: null, policyExposure: false, salaryAnnual: 18, startTurn: 5 };`);
  check('V18-38b 回归：大厂影响力 30 也不触发（不是体制内）', ctx('temptationHtml(G.state)') === '');
  // 拒绝无事发生。
  temptSetup(7, 30, 40, 20);
  ctx('declineTemptation(G.state)');
  check('V18-39 拒绝：什么都不发生，卡片当年不再出现', ctx('G.state.flags.temptationYear') === 7 && ctx('G.state.attrs.money') === 40 && ctx('G.state.attrs.influence') === 30 && ctx('G.state.attrs.stress') === 20 && !ctx('G.state.flags.moonlight') && ctx('temptationHtml(G.state)') === '');
  // 接兼职 → 举报链：警告 → 留置。
  temptSetup(7, 30, 40, 20);
  ctx('acceptMoonlight(G.state)');
  check('V18-40a 接兼职：钱 +3 万，兼职开始', ctx('G.state.attrs.money') === 43 && !!ctx('G.state.flags.moonlight'));
  const w1 = ctx(`resolveMoonlightReport(G.state, { int: () => 10 })`);
  check('V18-40b 举报骰 10（≤20）：首次举报 = 诫勉谈话，影响力 −10、压力 +10、兼职停', w1.reported === true && w1.level === 'warning' && ctx('G.state.attrs.influence') === 20 && ctx('G.state.attrs.stress') === 30 && !ctx('G.state.flags.moonlight') && ctx('G.state.flags.discipline').warnings === 1);
  const w0 = ctx(`resolveMoonlightReport(G.state, { int: () => 50 })`);
  check('V18-40c 无兼职时不掷骰', w0 === null);
  ctx('acceptMoonlight(G.state)');
  const w2 = ctx(`resolveMoonlightReport(G.state, { int: () => 10 })`);
  check('V18-40d 再次举报 = 留置审查（2013 届，2018 年后）：影响力清零、退缴 10 万、压力 +20', w2.reported === true && w2.level === 'investigation' && w2.term === '留置' && ctx('G.state.attrs.influence') === 0 && ctx('G.state.attrs.money') === 36 && ctx('G.state.attrs.stress') === 50 && ctx('G.state.flags.discipline').investigation === true && ctx('temptationHtml(G.state)') === '');
  // 举报骰不中：兼职继续，无事发生。
  temptSetup(7, 30, 40, 20);
  ctx('acceptMoonlight(G.state)');
  const w3 = ctx(`resolveMoonlightReport(G.state, { int: () => 50 })`);
  check('V18-40e 举报骰 50（>20）：没被举报，兼职继续', w3.reported === false && !!ctx('G.state.flags.moonlight') && ctx('G.state.attrs.money') === 43 && ctx('G.state.attrs.influence') === 30);
  // 下海。
  temptSetup(7, 30, 40, 20);
  ctx('acceptXiahai(G.state)');
  check('V18-41 下海：离开体制内，钱 +5 万、影响力 −10、压力 +5，考核与诱惑全停',
    ctx('G.state.flags.employment') === 'freelance' && ctx('G.state.attrs.money') === 45 && ctx('G.state.attrs.influence') === 20 && ctx('G.state.attrs.stress') === 25 && ctx('isPublicJob(G.state)') === false && ctx('sliceBranch(G.state)') === 'freelance' && ctx('temptationHtml(G.state)') === '');
  // 2018 年前是双规。
  eraState({ birthYear: 1974, examYear: 1992, turn: 7 });
  ctx(`G.state.flags.employment = 'employed';
    G.state.flags.jobProfile = { employerType: 'stable', sector: 'public', sectorName: '体制内', subsector: null, policyExposure: false, salaryAnnual: 9, startTurn: 5 };
    G.state.flags.moonlight = { sinceTurn: 7 };
    G.state.flags.discipline = { warnings: 1 };
    G.state.attrs.influence = 30; G.state.attrs.money = 40; G.state.attrs.stress = 20;`);
  const w4 = ctx(`resolveMoonlightReport(G.state, { int: () => 10 })`);
  check('V18-42 2018 年前（1992 届）：再次举报叫双规', w4.reported === true && w4.level === 'investigation' && w4.term === '双规');
  // 体制内事件门控。
  check('V18-43a 体制内事件三件都在 YEAR_EVENTS，要求 public、T6 起',
    ctx(`YEAR_EVENTS.filter((e) => e.requires && e.requires.public).map((e) => e.id).join(',')`) === 'ev-gift,ev-favor,ev-secondment'
    && ctx(`YEAR_EVENTS.filter((e) => e.requires && e.requires.public).every((e) => e.minTurn === 6 && e.options.length >= 2 && e.options.every((o) => o.fx && Object.keys(o.fx).length > 0))`) === true);
  temptSetup(7, 30, 40, 20);
  const pubOk = ctx('meetsRequires({ public: true }, G.state)');
  ctx(`G.state.flags.jobProfile = { employerType: 'bigtech', sector: 'internet', sectorName: '互联网', subsector: null, policyExposure: false, salaryAnnual: 18, startTurn: 5 };`);
  const bigNo = ctx('meetsRequires({ public: true }, G.state)');
  check('V18-43b meetsRequires public 门：体制内通过，大厂拦住', pubOk === true && bigNo === false);
  check('V18-43c 收礼有代价：收下钱 +2、影响力 −3、压力 +5；退回影响力 +3', ctx(`(() => { const ev = YEAR_EVENTS.find((e) => e.id === 'ev-gift'); return ev.options[0].fx.money === 2 && ev.options[0].fx.influence === -3 && ev.options[0].fx.stress === 5 && ev.options[1].fx.influence === 3; })()`) === true);
}

// ---------- 页脚约定 + 回归冒烟 ----------
{
  ctx(`G = { state: null, rng: makeRng(999), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 }; screenTitle();`);
  check('V18-44 页脚仍写 v1.4 设计稿（大版本.小版本约定，v1.4.2 不 bump 页脚）', screenHtml().includes('v1.4 设计稿见仓库 README') && !screenHtml().includes('v1.4.2 设计稿'));
  eraState({ birthYear: 1995, examYear: 2013, turn: 2 });
  ctx('startYear(2)');
  check('V18-45a 回归：年屏正常渲染（事件 + 行动 + 考证卡）', screenHtml().includes('今年的行动') && screenHtml().includes('考证') && screenHtml().includes('系统学习'));
  click('action', 'study');
  check('V18-45b 回归：系统学习仍 +5 专业（k 未设时）', ctx('G.state.attrs.skill') === 25 && ctx(`G.state.yearActions.indexOf('系统学习') >= 0`) === true);
  ctx('endYear()');
  check('V18-45c 回归：年度结算卡正常渲染', screenHtml().includes('年度结算卡'));
}

console.log(failures === 0 ? 'ALL PASS (v18)' : failures + ' FAILURE(S) (v18)');
process.exit(failures === 0 ? 0 : 1);
