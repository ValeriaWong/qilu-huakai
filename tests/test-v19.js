'use strict';
// v1.4.3 tests (V19-xx): §9 校准（考证难度/法考两阶段/执业医师/国考
// 排名制/面试权重/高考线）+ 岗位专业限制 + 隐藏剧情（外网）+ 出国 +
// 职场人际事件 + 股票线 + web3 + v1.4.2 线上实测小瑕疵。
//   校准：CET4 250 / CET6 500 / 教资 750 / 软考 1000 / 法考 1500
//     （客观 1000 + 主观 500）/ 执业医师 1500（技能 500 + 综合 1000）/
//     CPA 2000（§2 复核已核实，暂缓解除）；软考两科同次/45/75/有效
//     期年限仍未核实，不进游戏。法考客观题两年有效，执业医师技能两
//     年有效；六级须先过四级；教资 T3 起；执业医师须临床医学 + T7。
//   国考：确定性阈值 → 笔试 + 1:3 排名 + 面试 + 体检/考察/公示；
//     面试权重 国考 5:5 / 山东 4:6 / 吉林 6:4 / 辽宁 5:5 / 黑龙江 5:5；
//     法检岗须法学类专业。临床 T5 改方向屏，T6 毕业选工作；出国
//     T5 选，家人付费 20 万或贷款 Debt +2，T6 在国外，T7 回国选工作。
//   隐藏剧情：外贸家庭或 E3/E4 开局即有；普通家庭靠意外线索（3 条）
//     或文字尝试（按条件/可行性判）；外网解锁后成信息渠道。
//   人际：hash 掷骰（不耗 G.rng），概率看家庭/谈吐/社交/专业/忙碌/
//     行业；web3 坏事件 ×1.5（Allen 个人判断）。股票：T+1，次年结算，
//     涨跌幅封顶 ±10%。小瑕疵：转专业成功卡可见；T9 体制内第三件事
//     不用空窗期文案；标题屏重开两步确认（见 test-v16 V16-37b/38）。
// Harness: same vm sandbox + DOM stub as test-v18 (plus confirm stub).
// 页脚约定：页脚只写大版本.小版本，v1.4.3 的页脚仍是 v1.4，不改。
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


// ---------- A: 考证校准（§9.1–9.6） ----------
{
  const cert = (id) => ctx(`CERTS.find((c) => c.id === '${id}')`);
  const stage = (cid, sid) => ctx(`CERTS.find((c) => c.id === '${cid}').stages.find((x) => x.id === '${sid}')`);
  check('V19-01 难度档：四级 250 / 六级 500 / 教资 750 / 软考 1000 / 注会 2000',
    cert('cet4').difficulty === 250 && cert('cet6').difficulty === 500 && cert('teacher').difficulty === 750
    && cert('soft').difficulty === 1000 && cert('cpa').difficulty === 2000);
  check('V19-01b 两阶段难度：法考客观 1000 + 主观 500 / 执业医师技能 500 + 综合 1000',
    stage('law', 'law-obj').difficulty === 1000 && stage('law', 'law-subj').difficulty === 500
    && stage('doctor', 'doctor-skill').difficulty === 500 && stage('doctor', 'doctor-exam').difficulty === 1000);
  check('V19-01c 注会描述写六科与规则，不含未核实数字',
    cert('cpa').desc.includes('六科') && cert('cpa').desc.includes('会计/审计/财管/战略/经济法/税法')
    && cert('cpa').desc.includes('5 年内有效') && cert('cpa').desc.includes('无专业限制'));
  check('V19-01d 软考描述只写已核实项：每年两次/无学历资历条件/全国有效',
    cert('soft').desc.includes('每年两次') && cert('soft').desc.includes('无学历资历条件')
    && cert('soft').desc.includes('全国有效') && !cert('soft').desc.includes('45'));
  check('V19-01e 教资描述写面试形式与有效期，不写普通话等级数字',
    cert('teacher').desc.includes('结构化+试讲+答辩') && cert('teacher').desc.includes('2 年有效')
    && cert('teacher').desc.includes('3 年') && !cert('teacher').desc.includes('二乙') && !cert('teacher').desc.includes('二甲'));
  // 法考两阶段：客观 2 AP 过，主观须先过客观，通关后专业 +10。
  eraState({ birthYear: 1995, examYear: 2013, turn: 2 });
  ctx(`G.state.major = { name: '法学', source: 'self', tier: '一本' }; G.state.flags.majorK = 1; G.state.ap = 3; G.state.attrs.skill = 20;`);
  check('V19-02a 法考主观题门槛：客观未过时报不了', JSON.stringify(ctx(`certGate(G.state, 'law-subj')`)).includes('客观题'));
  check('V19-02b 法考客观 1 AP 不够（500<1000），2 AP 过', ctx(`certStudy(G.state, 'law-obj')`) === true && ctx(`certPassed(G.state, 'law-obj')`) === false && ctx(`certStudy(G.state, 'law-obj')`) === true && ctx(`certPassed(G.state, 'law-obj')`) === true);
  check('V19-02c 法考主观 1 AP 过（500），通关专业 +10', ctx(`certStudy(G.state, 'law-subj')`) === true && ctx(`certPassed(G.state, 'law')`) === true && ctx('G.state.attrs.skill') === 30);
  // 法考客观题两年有效：T2 过，T3 仍有效，T4 过期。
  eraState({ birthYear: 1995, examYear: 2013, turn: 2 });
  ctx(`G.state.major = { name: '法学', source: 'self', tier: '一本' }; G.state.flags.majorK = 1; G.state.ap = 3; G.state.flags.certs = ['law-obj']; G.state.flags.certStageTurn = { 'law-obj': 2 };`);
  ctx('G.state.turn = 3; expireCertStages(G.state);');
  check('V19-03a 法考客观题次年仍有效（T2 过 → T3 不过期）', ctx(`certPassed(G.state, 'law-obj')`) === true);
  ctx('G.state.turn = 4; expireCertStages(G.state);');
  check('V19-03b 法考客观题第三年过期（T2 过 → T4 失效，需重考客观）', ctx(`certPassed(G.state, 'law-obj')`) === false);
  // 执业医师两阶段：技能 1 AP 过，综合 2 AP 过，通关专业 +10；技能 T9 过期。
  eraState({ birthYear: 1995, examYear: 2013, turn: 7 });
  ctx(`G.state.major = { name: '临床医学', source: 'self', tier: '一本' }; G.state.flags.majorK = 1; G.state.ap = 3; G.state.attrs.skill = 20;`);
  check('V19-04a 执业医师技能 1 AP 过（500）', ctx(`certStudy(G.state, 'doctor-skill')`) === true && ctx(`certPassed(G.state, 'doctor-skill')`) === true);
  check('V19-04b 执业医师综合 2 AP 过（1000），通关专业 +10', ctx(`certStudy(G.state, 'doctor-exam')`) === true && ctx(`certPassed(G.state, 'doctor-exam')`) === false && ctx(`certStudy(G.state, 'doctor-exam')`) === true && ctx(`certPassed(G.state, 'doctor')`) === true && ctx('G.state.attrs.skill') === 30);
  ctx('G.state.turn = 9; expireCertStages(G.state);');
  check('V19-04c 执业医师技能两年有效：T7 过 → T9 过期', ctx(`certPassed(G.state, 'doctor-skill')`) === false);
  // 报考门槛。
  eraState({ birthYear: 1995, examYear: 2013, turn: 2 });
  ctx(`G.state.major = { name: '法学', source: 'self', tier: '一本' };`);
  check('V19-05a 法考须法学：法学可报，计算机报不了', ctx(`certGate(G.state, 'law-obj')`).ok === true
    && (() => { ctx(`G.state.major = { name: '计算机', source: 'self', tier: '一本' };`); return ctx(`certGate(G.state, 'law-obj')`).ok === false; })());
  check('V19-05b 教资 T3 起：T2 报不了，T3 可报', ctx(`certGate(G.state, 'teacher')`).ok === false
    && (() => { ctx('G.state.turn = 3;'); return ctx(`certGate(G.state, 'teacher')`).ok === true; })());
  check('V19-05c 六级须先过四级', ctx(`certGate(G.state, 'cet6')`).ok === false
    && (() => { ctx(`G.state.flags.certs = ['cet4'];`); return ctx(`certGate(G.state, 'cet6')`).ok === true; })());
  eraState({ birthYear: 1995, examYear: 2013, turn: 6 });
  ctx(`G.state.major = { name: '临床医学', source: 'self', tier: '一本' };`);
  check('V19-05d 执业医师须临床医学 + T7：T6 报不了，T7 可报', ctx(`certGate(G.state, 'doctor-skill')`).ok === false
    && (() => { ctx('G.state.turn = 7;'); return ctx(`certGate(G.state, 'doctor-skill')`).ok === true; })());
  ctx(`G.state.major = { name: '计算机', source: 'self', tier: '一本' };`);
  check('V19-05e 执业医师非临床报不了', ctx(`certGate(G.state, 'doctor-skill')`).ok === false);
}

// ---------- B: 国考排名制与面试权重（§9.7–9.12） ----------
{
  check('V19-06 面试权重：国考 5:5 / 山东 4:6 / 吉林 6:4 / 辽宁 5:5 / 黑龙江 5:5',
    ctx(`civilExamWeights({ type: 'national' })`).join(':') === '5:5'
    && ctx(`civilExamWeights({ type: 'provincial', provinceId: 'shandong' })`).join(':') === '4:6'
    && ctx(`civilExamWeights({ type: 'provincial', provinceId: 'jilin' })`).join(':') === '6:4'
    && ctx(`civilExamWeights({ type: 'provincial', provinceId: 'liaoning' })`).join(':') === '5:5'
    && ctx(`civilExamWeights({ type: 'provincial', provinceId: 'heilongjiang' })`).join(':') === '5:5');
  check('V19-06b 综合分按权重算：山东 (30,20)=24，国考 (30,20)=25',
    ctx(`civilExamComposite({ type: 'provincial', provinceId: 'shandong' }, 30, 20)`) === 24
    && ctx(`civilExamComposite({ type: 'national' }, 30, 20)`) === 25);
  // 排名落榜：吉林普通岗门槛 25，专业 25 → 笔试 25+0 刚过线，超线 0 分，
  // minRng 排名掷骰失败 → “过了线，没进面试范围”。
  toT5Exam();
  ctx('G.state.attrs.skill = 25; G.state.attrs.express = 20;');
  click('exam-type', 'provincial');
  click('exam-province', 'jilin');
  click('exam-position', 'normal');
  click('exam-confirm');
  ctx('G.rng = (' + minRng.toString() + ')()');
  click('exam-written');
  check('V19-07 排名落榜：过线未进 1:3，落榜屏写明调剂/递补',
    screenHtml().includes('过了线，没进面试范围') && screenHtml().includes('1:3') && screenHtml().includes('调剂'));
  // 体检/考察/公示落榜：笔试面试都过（maxRng），体检 minRng 掷骰失败。
  toT5Exam();
  click('exam-type', 'provincial');
  click('exam-province', 'jilin');
  click('exam-position', 'grassroots');
  click('exam-confirm');
  ctx('G.rng = (' + maxRng.toString() + ')()');
  click('exam-written');
  click('exam-interview');
  ctx('G.rng = (' + minRng.toString() + ')()');
  click('exam-checkup');
  check('V19-08 体检/考察/公示落榜：三关屏 + 90% 口径',
    screenHtml().includes('体检 / 考察 / 公示没过') && screenHtml().includes('90%'));
  // 法检岗须法学类专业。
  toT5Exam();
  ctx(`G.state.major = { name: '计算机', source: 'self', tier: '一本' };`);
  click('exam-type', 'national');
  check('V19-09a 法检岗：计算机专业报不了，屏上写明须法学类专业',
    screenHtml().includes('须法学类专业') && screenHtml().includes('报不了') && screenHtml().includes('data-act="exam-position" data-id="legal" disabled'));
  toT5Exam();
  ctx(`G.state.major = { name: '法学', source: 'self', tier: '一本' };`);
  click('exam-type', 'national');
  check('V19-09b 法检岗：法学专业可报，按钮可用',
    screenHtml().includes('须法学类专业') && !screenHtml().includes('data-act="exam-position" data-id="legal" disabled'));
  // 报名确认屏：全流程清单 + 过线≠进面 + 进面≠录用，不写旧口径。
  // （点“报名”后进笔试屏，所以清单类断言要在点之前查。）
  toT5Exam();
  click('exam-type', 'provincial');
  click('exam-province', 'shandong');
  click('exam-position', 'grassroots');
  check('V19-10b 报名屏有全流程清单：资格审查 → 试用期 1 年',
    screenHtml().includes('资格审查') && screenHtml().includes('试用期 1 年') && screenHtml().includes('过线≠进面') && screenHtml().includes('进面≠录用'));
  check('V19-10c 报名屏不再写旧口径：无“低于门槛一定落榜”“笔试看专业”',
    !screenHtml().includes('低于门槛一定落榜') && !screenHtml().includes('笔试看专业、面试看表达'));
  // 面试权重显示在面试过屏：山东 4:6，综合成绩按权重算。
  ctx('G.rng = (' + maxRng.toString() + ')()');
  click('exam-confirm');
  click('exam-written');
  click('exam-interview');
  check('V19-10a 面试过屏写面试权重与综合成绩：山东 4:6',
    screenHtml().includes('权重 4:6') && screenHtml().includes('综合成绩'));
}

// ---------- C: 临床医学 T5 节点后移（§9.18） ----------
{
  eraState({ birthYear: 1995, examYear: 2013, turn: 5 });
  ctx(`G.state.major = { name: '临床医学', source: 'self', tier: '一本' };`);
  ctx('enterYear(5)');
  check('V19-11a 临床 T5 不进职业列表，进方向屏：规培/专硕/学硕',
    screenHtml().includes('规培') && screenHtml().includes('专硕') && screenHtml().includes('学硕'));
  click('clinical-path', 'residency');
  check('V19-11b 选规培：clinicalPath 记下，T5 不签 B 卡',
    ctx('G.state.flags.clinicalPath').path === 'residency' && !ctx('G.state.commitments.B'));
  ctx('enterYear(6)');
  check('V19-11c 临床 T6 毕业选工作（不走 T6 站队）',
    screenHtml().includes('毕业选工作') && screenHtml().includes('执业医师要到 T7'));
  eraState({ birthYear: 1995, examYear: 2013, turn: 5 });
  ctx(`G.state.major = { name: '计算机', source: 'self', tier: '一本' };`);
  ctx('enterYear(5)');
  check('V19-11d 回归：非临床 T5 仍进正常去向屏', screenHtml().includes('t5-pick'));
}

// ---------- D: 出国（§9.22） ----------
{
  // 家人付费 20 万：钱 −20，专业 +10、表达 +10、人脉 +5，T5 不签 B。
  eraState({ birthYear: 1995, examYear: 2013, turn: 5 });
  ctx('G.state.attrs.money = 25; G.state.attrs.skill = 20; G.state.attrs.express = 20; G.state.attrs.network = 20;');
  ctx('screenT5()');
  click('t5-pick', 'abroad');
  check('V19-12a 出国先进筹钱屏：家人付费 / 贷款', screenHtml().includes('家人付费') && screenHtml().includes('贷款'));
  click('abroad-fund', 'family');
  check('V19-12b 家人付费：钱 25→5，专业/表达 +10，人脉 +5，abroad 记账',
    ctx('G.state.attrs.money') === 5 && ctx('G.state.attrs.skill') === 30 && ctx('G.state.attrs.express') === 30
    && ctx('G.state.attrs.network') === 25 && ctx('G.state.flags.abroad').funding === 'family'
    && ctx('G.state.flags.abroad').cost === 20 && ctx('G.state.flags.abroad').returnTurn === 7 && !ctx('G.state.commitments.B'));
  // 贷款：钱不动，Debt +2。
  eraState({ birthYear: 1995, examYear: 2013, turn: 5 });
  ctx('G.state.attrs.money = 5; G.state.attrs.debt = 0;');
  ctx('screenT5()');
  click('t5-pick', 'abroad');
  click('abroad-fund', 'loan');
  check('V19-13a 贷款出国：钱不动，Debt 0→2，abroad 记账',
    ctx('G.state.attrs.money') === 5 && ctx('G.state.attrs.debt') === 2 && ctx('G.state.flags.abroad').funding === 'loan');
  // 家人付费钱不够：按钮禁用，点确认也不设 abroad。
  eraState({ birthYear: 1995, examYear: 2013, turn: 5 });
  ctx('G.state.attrs.money = 5;');
  ctx('screenT5()');
  click('t5-pick', 'abroad');
  check('V19-13b 家人付费钱不够：按钮禁用并写“现金不够”',
    screenHtml().includes('现金不够') && screenHtml().includes('data-act="abroad-fund" data-id="family" disabled'));
  ctx(`confirmAbroadFunding('family');`);
  check('V19-13c 家人付费钱不够：直接调确认也不设 abroad', !ctx('G.state.flags.abroad'));
  // T6 在国外读书，T7 回国选工作（不含出国选项），签 B。
  eraState({ birthYear: 1995, examYear: 2013, turn: 6 });
  ctx(`G.state.flags.abroad = { funding: 'loan', cost: 20, returnTurn: 7 };`);
  ctx('enterYear(6)');
  check('V19-14a 出国 T6：在国外读书，不走 T6 站队', screenHtml().includes('在国外读书'));
  eraState({ birthYear: 1995, examYear: 2013, turn: 7 });
  ctx(`G.state.flags.abroad = { funding: 'loan', cost: 20, returnTurn: 7 };`);
  ctx('enterYear(7)');
  check('V19-14b 出国 T7：回国选工作，选项里不再有出国',
    screenHtml().includes('回国选工作') && !screenHtml().includes('data-id="abroad"'));
  click('t5-pick', 'bigtech');
  click('t5-sector-pick', 'internet');
  check('V19-14c 回国选大厂：B 卡签在 T7，sector=internet',
    !!ctx('G.state.commitments.B') && ctx('G.state.commitments.B').signedAt === 'T7' && ctx('G.state.flags.jobProfile').sector === 'internet');
}

// ---------- E: 隐藏剧情（外网）（§9.21） ----------
{
  const ordinary = (turn) => {
    eraState({ birthYear: 1995, examYear: 2013, turn, bg: { locale: 'city', urban: true, soe: false, stocks: false, trading: false, selfHouse: false, medical: false }, econ: { tier: 'E1', cash: 5, min: 2, max: 8, label: 'E1 · 2–8万' } });
  };
  ordinary(7);
  check('V19-15a 开局即有：外贸家庭有，E3/E4 有，普通家庭没有',
    ctx('hiddenPlotStartUnlocked(G.state)') === false
    && (() => { ctx(`G.state.origin.bg.trading = true;`); return ctx('hiddenPlotStartUnlocked(G.state)') === true; })()
    && (() => { ctx(`G.state.origin.bg.trading = false; G.state.origin.econ.tier = 'E3';`); return ctx('hiddenPlotStartUnlocked(G.state)') === true; })());
  ordinary(7);
  check('V19-15b 文字尝试：出国留学要钱——5 万走不通，15 万走通',
    ctx(`attemptHiddenUnlock(G.state, '我想出国留学')`).ok === false
    && (() => { ctx('G.state.attrs.money = 15;'); return ctx(`attemptHiddenUnlock(G.state, '我想出国留学')`).ok === true; })()
    && ctx('internetUnlocked(G.state)') === true);
  ordinary(7);
  check('V19-15c 文字尝试：开源须先真的做一次——oss 0 不行，oss 1 行',
    ctx(`attemptHiddenUnlock(G.state, '去参加开源社区活动')`).ok === false
    && (() => { ctx('G.state.flags.ossCount = 1;'); return ctx(`attemptHiddenUnlock(G.state, '去参加开源社区活动')`).ok === true; })());
  ordinary(7);
  check('V19-15d 文字尝试：家里没外贸、专业不够、人脉不够都拒',
    ctx(`attemptHiddenUnlock(G.state, '家里做外贸')`).ok === false
    && ctx(`attemptHiddenUnlock(G.state, '我想翻墙看看')`).ok === false
    && ctx(`attemptHiddenUnlock(G.state, '认识一个外国朋友')`).ok === false
    && ctx(`attemptHiddenUnlock(G.state, '我想穿越')`).ok === false);
  ordinary(7);
  ctx('G.state.attrs.skill = 30; G.state.attrs.network = 35;');
  check('V19-15e 文字尝试：条件够了就走通——翻墙（专业 30）、认人（人脉 35）',
    ctx(`attemptHiddenUnlock(G.state, '我想翻墙看看')`).ok === true);
  ordinary(7);
  check('V19-15f 线索：2 条未解锁，3 条解锁',
    ctx('grantHiddenClue(G.state, "线索一")') === true && ctx('grantHiddenClue(G.state, "线索二")') === true
    && ctx('hiddenClues(G.state)') === 2 && ctx('internetUnlocked(G.state)') === false
    && ctx('grantHiddenClue(G.state, "线索三")') === true && ctx('hiddenClues(G.state)') === 3 && ctx('internetUnlocked(G.state)') === true);
  ordinary(8);
  ctx('G.state.seed = 7;');
  check('V19-15g 意外线索：hash 0.098 < 0.15 时给一条（seed 7, T8）',
    ctx('maybeHiddenClue(G.state)') === undefined && ctx('hiddenClues(G.state)') === 1);
  ordinary(7);
  check('V19-15h 意外线索：hash 0.231 ≥ 0.15 时不给（seed 12345, T7）', ctx('maybeHiddenClue(G.state)') === undefined && ctx('hiddenClues(G.state)') === 0);
  // 开源行动攒人脉：第一次给一条外网线索。
  ordinary(2);
  ctx('enterYear(2);');
  ctx(`applyAction('opensrc');`);
  check('V19-16a 开源行动：ossCount 1，且给一条外网线索',
    ctx('G.state.flags.ossCount') === 1 && ctx('hiddenClues(G.state)') === 1);
  ctx(`applyAction('opensrc');`);
  check('V19-16b 开源行动：第二次只加 ossCount，不再重复给线索',
    ctx('G.state.flags.ossCount') === 2 && ctx('hiddenClues(G.state)') === 1);
  // 信息渠道：同事/上司、开源社区、外网、体制内内部消息。
  eraState({ birthYear: 1995, examYear: 2013, turn: 7 });
  ctx(`G.state.flags.employment = 'employed'; G.state.flags.jobProfile = { employerType: 'stable', sector: 'public', sectorName: '体制内' }; G.state.flags.ossCount = 1; G.state.origin.bg.trading = true;`);
  check('V19-16c 信息渠道：体制内 + 开源 + 外网三条都在',
    ctx('infoChannelsHtml(G.state)').includes('体制内内部消息') && ctx('infoChannelsHtml(G.state)').includes('开源社区') && ctx('infoChannelsHtml(G.state)').includes('外网'));
  ordinary(7);
  check('V19-16d 信息渠道：普通家庭无业无开源无外网时只字不提外网',
    ctx('infoChannelsHtml(G.state)') === '' || !ctx('infoChannelsHtml(G.state)').includes('外网'));
}

// ---------- F: 职场人际事件（§9.23） ----------
{
  const employed = (turn, patch) => {
    eraState({ birthYear: 1995, examYear: 2013, turn });
    ctx(`G.state.flags.employment = 'employed'; G.state.flags.jobProfile = { employerType: 'bigtech', sector: 'internet', sectorName: '互联网' }; G.state.attrs.express = 20; G.state.attrs.network = 20; G.state.attrs.skill = 20; G.state.attrs.stress = 20;`);
    if (patch) ctx(patch);
  };
  check('V19-17a 概率模型：基础 0.25；谈吐/社交/E3 各 ×0.8；有脾气的专业者 ×0.5',
    employed(7) === undefined && ctx('interpersonalChance(G.state)') === 0.25
    && (() => { ctx('G.state.attrs.express = 30;'); return ctx('interpersonalChance(G.state)') === 0.2; })()
    && (() => { ctx('G.state.attrs.express = 20; G.state.attrs.network = 30;'); return ctx('interpersonalChance(G.state)') === 0.2; })()
    && (() => { ctx('G.state.attrs.network = 20; G.state.origin.econ.tier = "E3";'); return ctx('interpersonalChance(G.state)') === 0.2; })()
    && (() => { ctx('G.state.origin.econ.tier = "E2"; G.state.attrs.skill = 45; G.state.attrs.stress = 20;'); return ctx('interpersonalChance(G.state)') === 0.125; })());
  employed(7);
  check('V19-17b 概率模型：很专业但很忙（专业 45 + 压力 70）×1.5，易被当血包',
    (() => { ctx('G.state.attrs.skill = 45; G.state.attrs.stress = 70;'); return ctx('interpersonalChance(G.state)') === 0.375; })());
  employed(7);
  check('V19-17c 概率模型：web3 ×1.5，创业公司 ×1.2，体制内 ×0.8',
    (() => { ctx(`G.state.flags.jobProfile = { employerType: 'bigtech', sector: 'web3', sectorName: 'Web3 / 数字资产' };`); return ctx('interpersonalChance(G.state)') === 0.375; })()
    && (() => { ctx(`G.state.flags.jobProfile = { employerType: 'startup', sector: 'internet', sectorName: '互联网' };`); return ctx('interpersonalChance(G.state)') === 0.3; })()
    && (() => { ctx(`G.state.flags.jobProfile = { employerType: 'stable', sector: 'public', sectorName: '体制内' };`); return ctx('interpersonalChance(G.state)') === 0.2; })());
  // 触发：seed 12345，T8 hash 0.188 < 0.25 触发；T7 hash 0.82 不触发。
  employed(8);
  const before = ctx('G.state.attrs.stress');
  ctx('maybeInterpersonalEvent(G.state)');
  check('V19-18a 人际事件触发：T8 触发，事件入卡，效果进状态，日志有记',
    !!ctx('G.state.flags.interpersonalLast') && ctx('G.state.flags.interpersonalLast').turn === 8
    && ctx('G.state.yearlyLog').some((l) => l.type === 'interpersonal')
    && ctx('G.state.attrs.stress') !== before);
  check('V19-18b 人际事件卡片：年屏渲染出标题与“不是所有坏事都能躲开”',
    ctx('interpersonalEventHtml(G.state)').includes(ctx('G.state.flags.interpersonalLast').title) && ctx('interpersonalEventHtml(G.state)').includes('不是所有坏事都能躲开'));
  employed(7);
  ctx('maybeInterpersonalEvent(G.state)');
  check('V19-18c 人际事件不触发：T7 hash 0.82 ≥ 0.25，无卡无日志', !ctx('G.state.flags.interpersonalLast') && !ctx('G.state.yearlyLog').some((l) => l.type === 'interpersonal'));
  employed(8);
  ctx('G.state.flags.employment = null;');
  ctx('maybeInterpersonalEvent(G.state)');
  check('V19-18d 人际事件不触发：未就业不发生', !ctx('G.state.flags.interpersonalLast'));
  // hash 确定性：同一 seed+turn 抽同一件；不耗 G.rng。
  employed(8);
  const ev1 = ctx('interpersonalEventFor(G.state)');
  const ev2 = ctx('interpersonalEventFor(G.state)');
  check('V19-19a 人际抽取确定：同一 seed+turn 两次同一件', ev1.id === ev2.id);
  check('V19-19b 人际抽取合规：抽出的事件过公司/行业过滤', ctx(`interpersonalEligible(G.state, ${JSON.stringify(ev1)})`) === true);
  const rngBefore = ctx('G.rng.getState()');
  ctx('maybeInterpersonalEvent(G.state)');
  check('V19-19c 人际掷骰不耗 G.rng：前后 rng 状态一致', ctx('G.rng.getState()') === rngBefore);
  // web3 只走 web3 事件。
  employed(8, `G.state.flags.jobProfile = { employerType: 'bigtech', sector: 'web3', sectorName: 'Web3 / 数字资产' };`);
  const web3ev = ctx('interpersonalEventFor(G.state)');
  check('V19-19d web3 只走 web3 事件：抽出的事件带 web3 触发', web3ev.trigger && web3ev.trigger.sector === 'web3');
  employed(8);
  const normEv = ctx('interpersonalEventFor(G.state)');
  check('V19-19e 非 web3 不抽 web3 事件', !(normEv.trigger && normEv.trigger.sector === 'web3'));
}

// ---------- G: 股票线（§9.24） ----------
{
  eraState({ birthYear: 1995, examYear: 2013, turn: 7 });
  ctx('G.state.attrs.money = 10;');
  check('V19-20a 买股票：钱 10→5，持仓 5 万 / T7 / 2019 年',
    ctx('buyStock(G.state)') === true && ctx('G.state.attrs.money') === 5
    && ctx('G.state.flags.stocks.holding').amount === 5 && ctx('G.state.flags.stocks.holding').buyTurn === 7
    && ctx('G.state.flags.stocks.holding').buyYear === 2019);
  check('V19-20b 买股票：已有持仓不能再买', ctx('buyStock(G.state)') === false && ctx('G.state.attrs.money') === 5);
  eraState({ birthYear: 1995, examYear: 2013, turn: 7 });
  ctx('G.state.attrs.money = 3;');
  check('V19-20c 买股票：钱不够 5 万买不了', ctx('buyStock(G.state)') === false);
  // T+1 结算：T7 买入，T8 按 2020 年 +13.87% 封顶 +10% 结算，钱 5+5+0.5=10.5。
  eraState({ birthYear: 1995, examYear: 2013, turn: 7 });
  ctx('G.state.attrs.money = 10;');
  ctx('buyStock(G.state);');
  ctx('G.state.turn = 8; resolveStockHolding(G.state);');
  check('V19-21a 股票结算：2020 年 +13.87% 封顶 +10%，钱 10.5，持仓清掉',
    ctx('G.state.attrs.money') === 10.5 && !ctx('G.state.flags.stocks.holding')
    && ctx('G.state.flags.stocks.last').text.includes('2020') && ctx('G.state.flags.stocks.last').text.includes('10%'));
  // 熊年：T5 买入，T6 按 2018 年 −24.59% 封底 −10% 结算，钱 9.5。
  eraState({ birthYear: 1995, examYear: 2013, turn: 5 });
  ctx('G.state.attrs.money = 10;');
  ctx('buyStock(G.state);');
  ctx('G.state.turn = 6; resolveStockHolding(G.state);');
  check('V19-21b 股票结算：2018 年 −24.59% 封底 −10%，钱 9.5',
    ctx('G.state.attrs.money') === 9.5 && ctx('G.state.flags.stocks.last').text.includes('2018'));
  // 同年不结算：买入当年 resolve 无事发生。
  eraState({ birthYear: 1995, examYear: 2013, turn: 7 });
  ctx('G.state.attrs.money = 10;');
  ctx('buyStock(G.state);');
  ctx('resolveStockHolding(G.state);');
  check('V19-21c 股票 T+1：买入当年不结算，持仓还在，钱还是 5',
    !!ctx('G.state.flags.stocks.holding') && ctx('G.state.attrs.money') === 5);
  // 无数据年份按 0% 结算。
  eraState({ birthYear: 1995, examYear: 2013, turn: 18 });
  ctx(`G.state.attrs.money = 5; G.state.flags.stocks = { holding: { amount: 5, buyTurn: 17, buyYear: 2029 } };`);
  ctx('resolveStockHolding(G.state);');
  check('V19-21d 股票结算：无历史数据年份按 0% 结算，钱 10，本金回来',
    ctx('G.state.attrs.money') === 10 && ctx('G.state.flags.stocks.last').text.includes('无历史数据'));
  // 面板：2019 年有科创板大事件；2029 年无数据不显示面板。
  eraState({ birthYear: 1995, examYear: 2013, turn: 7 });
  check('V19-22a 股票面板：2019 年显示上证 + 科创板大事件 + 买入按钮',
    ctx('stockPanelHtml(G.state)').includes('上证指数 2019 年') && ctx('stockPanelHtml(G.state)').includes('科创板') && ctx('stockPanelHtml(G.state)').includes('买入'));
  eraState({ birthYear: 1995, examYear: 2013, turn: 17 });
  check('V19-22b 股票面板：2029 年无历史数据，面板不显示', ctx('stockPanelHtml(G.state)') === '');
}

// ---------- H: web3 行业 ----------
{
  eraState({ birthYear: 1995, examYear: 2013, turn: 5 });
  ctx('screenT5()');
  click('t5-pick', 'bigtech');
  check('V19-23a web3 可选：大厂选行业屏里有 Web3 / 数字资产', screenHtml().includes('Web3'));
  click('t5-sector-pick', 'web3');
  check('V19-23b web3 入职：sector=web3，B 卡签了',
    ctx('G.state.flags.jobProfile').sector === 'web3' && !!ctx('G.state.commitments.B'));
  check('V19-23c web3 行业修正恒为 0（未知行业默认 0）',
    ctx(`t9IndustryAdjustment(2021, 'Web3 / 数字资产', null)`) === 0 && ctx(`t9IndustryAdjustment(2022, 'Web3 / 数字资产', null)`) === 0);
}

// ---------- I: 小瑕疵 + 山东特殊类型批 ----------
{
  // 转专业成功卡：成功后年屏仍看得到“转专业成功”。
  eraState({ birthYear: 1995, examYear: 2013, turn: 2 });
  ctx(`G.state.major = { name: '土木', source: 'self', tier: '一本' }; G.state.flags.adjusted = true; G.state.flags.adjustedFrom = '计算机'; G.state.ap = 3; G.state.attrs.skill = 30;`);
  ctx(`G.rng = ({ next: () => 0.5, int: (a,b) => 30, chance: () => true, float: (a) => a, pick: (arr) => arr[0], weighted: (e) => e[0][0], shuffle: (a) => a.slice(), getState: () => 0, setState: () => {} })`);
  ctx('attemptTransferMajor(G.state, G.rng)');
  ctx('startYear(2)');
  check('V19-24a 转专业成功卡：成功后年屏看得到“转专业成功”', screenHtml().includes('转专业成功'));
  // 山东特殊类型批：picker 与分数卡都写“已取消”，不再当在招线。
  check('V19-25a 山东特殊类型批：specialLineText 写“已取消（2026 年起）”，辽宁照常写线值',
    ctx(`specialLineText(GAOKAO_REGIONS.shandong)`) === '特殊类型批已取消（2026 年起）'
    && ctx(`specialLineText(GAOKAO_REGIONS.liaoning)`) === '特殊类型线 508');
  eraState({ birthYear: 1995, examYear: 2013, turn: 1 });
  ctx(`G.state.flags.gaokao = { region: 'shandong', base: 500, line1: 442, specialLine: 525 };`);
  ctx('screenT1();');
  check('V19-25b 山东分数卡：写“特殊类型批已取消”，不再出现“特殊类型线 525”',
    screenHtml().includes('特殊类型批已取消') && !screenHtml().includes('特殊类型线 525'));
  // showT5Signed 的“进入 T6”按钮：year-next 到 T6，不再回 T2。
  eraState({ birthYear: 1995, examYear: 2013, turn: 5 });
  ctx('screenT5()');
  click('t5-pick', 'bigtech');
  click('t5-sector-pick', 'internet');
  check('V19-26a 签约后“进入 T6”按钮是 year-next 到 6（不是 year-start 回 T2）',
    screenHtml().includes('data-act="year-next" data-id="6"') && !screenHtml().includes('data-act="year-start"'));
  click('year-next', '6');
  check('V19-26b 点“进入 T6”真的到了 T6（站队屏），不是 T2',
    ctx('G.state.turn') === 6 && screenHtml().includes('T6'));
}

console.log(failures === 0 ? 'ALL PASS (v19)' : failures + ' FAILURE(S) (v19)');
process.exit(failures === 0 ? 0 : 1);
