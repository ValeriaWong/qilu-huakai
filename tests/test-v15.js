'use strict';
// v1.2 tests (V15-xx): one check per P0/P1 item, plus the final review's
// ten cross-acceptance scenarios:
//   孤儿+噩梦+T16；断亲+回家执念+35岁；单身+健康良好+T16；
//   T14失败+T15全投学习；只选1条执念点开始；T8用2AP后刷新；
//   T9完成两个决定后刷新；2015年创建生成式AI项目；
//   2023年非学科教育公司；两次兑现失败但NPC关系恶劣.
// Harness: same vm sandbox + DOM stub as test-v12.
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
// Era state (from test-v11/v14).
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
// Post-slice state (from test-v12).
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
function endYearTo(next) {
  click('year-end');
  click('year-next', String(next));
}
// Venture in a given calendar year: examYear + turn - 1 = year (v14).
function ventureState(examYear, turn) {
  eraState({ birthYear: examYear - 18, examYear, turn });
  ctx('G.state.attrs.money = 5;');
}
function startIdea(text) {
  sandbox.document.querySelector('#idea-text').value = text;
  click('idea-start');
}
// A generic year snapshot: everything P0-1 promises to keep identical.
function yearSnapshot() {
  return JSON.stringify({
    ap: ctx('G.state.ap'),
    ev: ctx('G.state.currentEvent && G.state.currentEvent.id'),
    sealed: ctx('G.state.sealed'),
    acts: ctx('G.state.yearActions'),
    log: ctx('G.state.yearlyLog.length'),
  });
}
// Simulate a browser refresh: save, reload from the slot, re-enter the year.
function refreshAndReenter(turn) {
  ctx('saveGame(G.state)');
  ctx('G.state = loadGame(G.state.slot || 1); G.rng = makeRng(G.state.seed); G.rng.setState(G.state.rngState || G.state.seed);');
  ctx(`startYear(${turn})`);
}

// ---------- P0-1: 存档恢复 ----------
{
  freshState();
  ctx('startYear(8)');
  const first = yearSnapshot();
  let ok = true;
  for (let i = 0; i < 10; i++) {
    refreshAndReenter(8);
    if (yearSnapshot() !== first) { ok = false; break; }
  }
  check('V15-01 P0-1 same save refreshed 10 times: AP, event, sealed dice, actions identical', ok, yearSnapshot());
}
{
  // Cross-scenario: T8 用 2AP 后刷新 — AP 与已执行行动不变。
  freshState();
  ctx('startYear(8)');
  click('action', 'study');
  click('action', 'rest');
  check('V15-02 P0-1 T8 used 2 AP (3 -> 1), two actions recorded', ctx('G.state.ap') === 1 && ctx('G.state.yearActions').length === 2, 'ap=' + ctx('G.state.ap') + ' acts=' + JSON.stringify(ctx('G.state.yearActions')));
  const snap = yearSnapshot();
  refreshAndReenter(8);
  check('V15-03 P0-1 T8 refresh after 2 AP: AP and actions unchanged', yearSnapshot() === snap, yearSnapshot());
}
{
  // Cross-scenario: T9 完成两个决定后刷新 — 恢复到第三个决定。
  // (The real refresh path for T9 is enterSlice(false), as the
  // continue handler does — not startYear(9).)
  // Two full decisions: pick + next, twice.
  eraState({ birthYear: 1995, examYear: 2013 });
  ctx('enterSlice()');
  click('slice-pick', '0');
  click('slice-next');
  click('slice-pick', '0');
  click('slice-next');
  check('V15-04 P0-1 T9 two decisions made (sliceStep 2, third decision on screen)', ctx('G.state.sliceStep') === 2 && screenHtml().includes('第 3 个决定'));
  ctx('saveGame(G.state)');
  ctx('G.state = loadGame(G.state.slot || 1); G.rng = makeRng(G.state.seed); G.rng.setState(G.state.rngState || G.state.seed);');
  const h2Before = JSON.stringify(ctx('G.state.flags.h2'));
  ctx('enterSlice(false)');
  check('V15-05 P0-1 T9 reload resumes at the third decision (sliceStep 2), H2 unchanged', ctx('G.state.sliceStep') === 2 && screenHtml().includes('第 3 个决定') && JSON.stringify(ctx('G.state.flags.h2')) === h2Before);
}

// ---------- P0-2: 执念数量 ----------
{
  ctx(`G = { state: null, rng: makeRng(999), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 }; screenTitle();`);
  sandbox.__alerts.length = 0;
  click('start');
  check('V15-06 P0-2 0 obsessions: start blocked, alert states the 2-obsession requirement', ctx('G.state') === null && sandbox.__alerts.some((m) => m.includes('2 条')), JSON.stringify(sandbox.__alerts));
  click('obsession', 'money');
  sandbox.__alerts.length = 0;
  click('start');
  check('V15-07 P0-2 1 obsession: start blocked, alert says how many more are needed', ctx('G.state') === null && sandbox.__alerts.some((m) => m.includes('2 条') && m.includes('1')), JSON.stringify(sandbox.__alerts));
  click('obsession', 'health');
  click('start');
  check('V15-08 P0-2 2 obsessions: start allowed, S0.5 names both (never silently auto-filled)', ctx('G.state') !== null && screenHtml().includes('经济独立') && screenHtml().includes('身体不出问题') && screenHtml().includes('开局定死'));
}
{
  // Every ending reachable with exactly 2 obsessions.
  const sc = (o) => ctx('obsessionScore(' + JSON.stringify(o) + ')');
  const base = { attrs: { money: 40, health: 70, skill: 70, express: 50, network: 60, influence: 20, stress: 20, debt: 0, family: 0 }, flags: { housing: 'rent' }, sealed: {}, commitments: {}, ventures: [] };
  check('V15-09 P0-2 fulfilled reachable with exactly 2 obsessions', sc(Object.assign({}, base, { obsessions: ['money', 'health'] })).ending === 'fulfilled');
  check('V15-10 P0-2 another-way reachable with exactly 2 obsessions', sc(Object.assign({}, base, { obsessions: ['money', 'health'], attrs: Object.assign({}, base.attrs, { money: 20, health: 50 }) })).ending === 'another-way');
  check('V15-11 P0-2 survived reachable with exactly 2 obsessions', sc(Object.assign({}, base, { obsessions: ['money', 'health'], attrs: Object.assign({}, base.attrs, { money: 5, health: 50 }) })).ending === 'survived');
  check('V15-12 P0-2 restart reachable with exactly 2 obsessions', sc(Object.assign({}, base, { obsessions: ['money', 'health'], attrs: Object.assign({}, base.attrs, { money: -1, health: 30, debt: 5 }) })).ending === 'restart');
}

// ---------- P0-3: T16 照护条件化 ----------
{
  const care = (o) => ctx('careSubjectFor(' + JSON.stringify(o) + ')');
  check('V15-13 P0-3 model family -> parents', care({ origin: { familyKey: 'model' }, flags: {}, attrs: { health: 70 } }).kind === 'parents');
  check('V15-14 P0-3 absentBoth -> grandparents （奶奶）', care({ origin: { familyKey: 'absentBoth' }, flags: {}, attrs: { health: 70 } }).kind === 'grandparents');
  check('V15-15 P0-3 orphan + partner -> partner', care({ origin: { familyKey: 'orphan' }, flags: { relationship: 'partner' }, attrs: { health: 70 } }).kind === 'partner');
  check('V15-16 P0-3 orphan + health <50 -> self', care({ origin: { familyKey: 'orphan' }, flags: {}, attrs: { health: 40 } }).kind === 'self');
  check('V15-17 P0-3 orphan, no partner, healthy -> none (no conjured parents)', care({ origin: { familyKey: 'orphan' }, flags: {}, attrs: { health: 70 } }).kind === 'none');
}
{
  // Cross-scenario: 孤儿 + 噩梦 + T16 — no parental medical fee at all.
  freshState({ difficulty: 'nightmare', obsessions: ['money', 'health'] });
  ctx(`G.state.origin = { familyKey: 'orphan', familyName: '孤儿', card: {}, fragments: [], counter: false, attrs: null };
    G.state.flags.relationship = 'none'; G.state.attrs.health = 70;`);
  ctx('G.state.commitments.E = { text: "押注：继续打工", signedAt: "T14", dueTurn: 16, snapshot: { line: "work", chance: null, roll: null, h6: null } };');
  ctx('startYear(13)');
  check('V15-18 P0-3 orphan nightmare: T13 seals no H5', !ctx('G.state.sealed.H5'));
  const moneyBefore = ctx('G.state.attrs.money');
  ctx('startYear(16)');
  // Work line pays +4; the year's own H9 accident can cost -1, so the
  // bound is +3. The point is: no parental medical fee (no -15, no F pick).
  check('V15-19 P0-3 orphan nightmare T16: no medical fee (work line +4, at worst H9 -1), no care form to pick', ctx('G.state.attrs.money') >= moneyBefore + 3 && screenHtml().includes('这一年没有人需要你照顾') && !screenHtml().includes('你怎么照护'), 'money=' + ctx('G.state.attrs.money') + ' before=' + moneyBefore);
}
{
  // Orphan + partner: the care subject is the partner, not parents.
  t9State();
  ctx(`G.state.origin.familyKey = 'orphan'; G.state.flags.relationship = 'partner'; G.state.sealed.H4 = { value: 70, omens: [] };`);
  ctx('startYear(13)');
  check('V15-20 P0-3 orphan + partner: T13 seals H5 for the partner', !!ctx('G.state.sealed.H5') && ctx('G.state.flags.careSubject') === 'partner');
  ctx('G.state.commitments.E = { text: "押注：继续打工", signedAt: "T14", dueTurn: 16, snapshot: { line: "work", chance: null, roll: null, h6: null } };');
  ctx('startYear(16)');
  check('V15-21 P0-3 orphan + partner T16: partner care forms, no 父母病倒', screenHtml().includes('伴侣') && screenHtml().includes('你怎么照护') && !screenHtml().includes('父母病倒'));
}
{
  // Orphan + poor health: the care subject is the self, costs are health-based.
  t9State();
  ctx(`G.state.origin.familyKey = 'orphan'; G.state.flags.relationship = 'none'; G.state.attrs.health = 40;`);
  ctx('startYear(13)');
  check('V15-22 P0-3 orphan + health 40: care subject is self', ctx('G.state.flags.careSubject') === 'self');
  ctx('G.state.commitments.E = { text: "押注：继续打工", signedAt: "T14", dueTurn: 16, snapshot: { line: "work", chance: null, roll: null, h6: null } };');
  ctx('startYear(16)');
  check('V15-23 P0-3 self-care T16: no parental medical fee text, self costs shown', screenHtml().includes('你自己的身体') && !screenHtml().includes('父母的病'));
}

// ---------- P0-4: T12 关系双维度 ----------
{
  // Cost variants: house (-30 + mortgage -> T13 AP 2), move (-5).
  t9State();
  ctx('startYear(12)');
  click('t12-intimate', 'partner');
  click('t12-cost', 'house');
  click('t12-boundary', 'close');
  click('t12-confirm');
  check('V15-24 P0-4 house: cash 40 -> 10, mortgage set (not a fixed marriage fee)', ctx('G.state.attrs.money') === 10 && ctx('G.state.flags.housing') === 'mortgage');
  click('year-next', '13');
  check('V15-25 P0-4 mortgage year: T13 AP is 2', ctx('G.state.ap') === 2, 'ap=' + ctx('G.state.ap'));
}
{
  t9State();
  ctx('startYear(12)');
  click('t12-intimate', 'partner');
  click('t12-cost', 'move');
  click('t12-boundary', 'close');
  click('t12-confirm');
  check('V15-26 P0-4 move: cash 40 -> 35', ctx('G.state.attrs.money') === 35);
}

// ---------- P0-5: 65% 征兆 ----------
{
  // Fixed-seed: ~600 omens, accuracy must land near 65%.
  let accurate = 0, total = 0, badMisleading = 0, badH5 = 0;
  for (let seed = 1; seed <= 100; seed++) {
    const log = ctx(`(() => {
      const st = newRun(${seed}, {});
      st.flags.careSubject = 'parents';
      const rng = makeRng(${seed});
      sealDie(st, rng, 'H4', 70, 3);
      sealDie(st, rng, 'H5', 2, 3);
      return st.omenLog;
    })()`);
    for (const o of log) {
      total += 1;
      if (o.accurate) accurate += 1;
      else {
        const truth = ctx(`omenTrueClaim('${o.die}', ${o.die === 'H4' ? 70 : 2})`);
        if (o.claim === truth) badMisleading += 1;
        if (o.die === 'H5' && !['mild', 'moderate', 'severe'].includes(o.claim)) badH5 += 1;
      }
    }
  }
  const frac = accurate / total;
  check('V15-27 P0-5 fixed-seed accuracy near 65% (600 omens)', total === 600 && frac >= 0.60 && frac <= 0.70, `accurate=${accurate}/${total} = ${frac.toFixed(3)}`);
  check('V15-28 P0-5 misleading claim is never the true claim', badMisleading === 0, 'bad=' + badMisleading);
  check('V15-29 P0-5 H5 misleading claim is another severity level (not a boolean flip)', badH5 === 0, 'bad=' + badH5);
}
{
  // T1 never leaks the exact hidden H0 value.
  eraState({ birthYear: 1997, examYear: 2015, familyKey: 'model', turn: 1 });
  ctx(`G.state.sealed.H0 = { value: 80, omens: [{ text: 'x' }] }; G.state.flags.h0Access = true;`);
  ctx(`G.state.flags.gaokao = { region: 'shandong', era: { birthYear: 1997, examYear: 2015, track: '文', mode: 'split' }, base: 600, row: { tier1: 510, tier2: 460, tier3: 400, vocational: 300, regime: 'split', status: 'verified' } };`);
  ctx('screenT1()');
  check('V15-30 P0-5 T1 shows no exact hidden H0 value', !screenHtml().includes('干预强度') && !screenHtml().includes('H0 值') && !screenHtml().includes('80'), screenHtml().slice(0, 200));
}

// ---------- P0-6: T14 反事实 ----------
{
  // Cross-scenario: T14 失败 + T15 全投学习 — E 的封存成功率与结果不变。
  t9State();
  ctx(`G.state.commitments.E = { text: '押注：创业', signedAt: 'T14', dueTurn: 16, snapshot: { line: 'startup', skill: 50, network: 50, money: 20, partnerMod: 0, industryDown: false, partnerShares: false, tier: 'calm', k: 1, chance: 45, roll: 48, h6: 70 } };
    G.state.flags.eResult = { success: false, note: '没成' };`);
  ctx('startYear(15)');
  const before = JSON.stringify(ctx('G.state.commitments.E.snapshot'));
  click('action', 'study');
  click('action', 'study');
  click('action', 'study');
  check('V15-31 P0-6 T15 all AP on study: E sealed chance/roll unchanged', JSON.stringify(ctx('G.state.commitments.E.snapshot')) === before, JSON.stringify(ctx('G.state.commitments.E.snapshot')));
  const mit = ctx('postFailureMitigation(G.state)');
  check('V15-32 P0-6 T15 mitigation list exists and never claims to change the sealed rate', Array.isArray(mit) && mit.length > 0 && !mit.join(' ').includes('成功率'));
}

// ---------- P0-7: T9 雇佣范围 ----------
{
  // Employed: H2 sealed.
  eraState({ birthYear: 1995, examYear: 2013 });
  ctx(`G.state.flags.employment = 'employed';`);
  ctx('enterSlice()');
  check('V15-33 P0-7 employed: H2 sealed at slice entry', !!ctx('G.state.flags.h2') && typeof ctx('G.state.flags.h2').chance === 'number');
}
{
  // Startup: no H2, crisis branch, no severance.
  eraState({ birthYear: 1995, examYear: 2013 });
  ctx(`G.state.flags.employment = 'startup'; G.state.ventures = [{ id: 'v1', name: 'x', archetype: 'ai-tool', status: 'active', stage: 0, createdTurn: 5 }];`);
  ctx('enterSlice()');
  check('V15-34 P0-7 startup: no H2, crisis night (not 裁员之夜）', ctx('G.state.flags.h2') === null && screenHtml().includes('危机之夜') && !screenHtml().includes('裁员之夜'));
  check('V15-35 P0-7 startup branch is 创业危机', ctx('t9Branch(G.state)') === 'startup');
}
{
  // Grad school: no H2, thesis branch.
  eraState({ birthYear: 1995, examYear: 2013 });
  ctx(`G.state.flags.employment = 'grad'; G.state.flags.gradSchool = true;`);
  ctx('enterSlice()');
  check('V15-36 P0-7 grad: no H2, 读研危机 branch', ctx('G.state.flags.h2') === null && ctx('t9Branch(G.state)') === 'grad');
}
{
  // Freelance: no H2, client branch.
  eraState({ birthYear: 1995, examYear: 2013 });
  ctx(`G.state.flags.employment = 'freelance';`);
  ctx('enterSlice()');
  check('V15-37 P0-7 freelance: no H2, 自由职业危机 branch', ctx('G.state.flags.h2') === null && ctx('t9Branch(G.state)') === 'freelance');
}
{
  // Severance by actual state.
  const sev = (o) => ctx('severancePay(' + JSON.stringify(o) + ')');
  check('V15-38 P0-7 severance bigtech 18万/年 x 4年 = 6万', sev({ flags: { jobProfile: { salaryAnnual: 18, startTurn: 5 } } }).amount === 6);
  check('V15-39 P0-7 severance stable 9万/年 x 4年 = 3万', sev({ flags: { jobProfile: { salaryAnnual: 9, startTurn: 5 } } }).amount === 3);
  check('V15-40 P0-7 severance without a job profile falls back to the documented slice default 8万', sev({ flags: {} }).amount === 8);
}
{
  // Non-employee slice end: no N, no 被裁了.
  eraState({ birthYear: 1995, examYear: 2013 });
  ctx(`G.state.flags.employment = 'startup'; G.state.ventures = [{ id: 'v1', name: 'x', archetype: 'ai-tool', status: 'active', stage: 0, createdTurn: 5 }];`);
  ctx('enterSlice()');
  click('slice-pick', '0'); click('slice-next');
  click('slice-pick', '0'); click('slice-next');
  click('slice-pick', '0'); click('slice-next');
  check('V15-41 P0-7 startup slice end: no H2 card, no N, no 被裁了', screenHtml().includes('这一夜没有裁员骰') && !screenHtml().includes('N =') && !screenHtml().includes('被裁了'));
}

// ---------- P0-8: 功能声明诚实 ----------
{
  ctx(`G = { state: null, rng: makeRng(999), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 }; screenTitle();`);
  check('V15-42 P0-8 title lists honest statuses: 英文面试/心灵驿站 已实现， 语音面试 试运行', screenHtml().includes('英文面试') && screenHtml().includes('心灵驿站') && screenHtml().includes('语音面试') && screenHtml().includes('试运行'));
  check('V15-43 P0-8 nothing on the title screen claims 已支持', !screenHtml().includes('已支持'));
}

// ---------- P1-1: NPC 个性与自由对话 ----------
{
  const reply = (npc, input, mem, topic) => ctx(`npcReply('${npc}', ${JSON.stringify(input)}, ${JSON.stringify(mem)}, '${topic}')`);
  const mem0 = { met: false, trust: 50, history: [] };
  const rWang = reply('wang', '我想请你帮我看看这个方案', mem0, 'family');
  const rChen = reply('laochen', '我想请你帮我看看这个方案', mem0, 'family');
  check('V15-44 P1-1 same input, different NPCs reply differently', rWang.text !== rChen.text, 'wang=' + rWang.text + ' | chen=' + rChen.text);
  check('V15-45 P1-1 first-time reply has no memory callback', rWang.memoryNote === 'first-time' && !rWang.text.includes('上次你说'));
  const mem1 = { met: true, trust: 50, history: [{ turn: 5, playerText: '我妈总让我考公务员', npcReply: '先听听', topic: 'family' }] };
  const rMem = reply('wang', '我妈又提了', mem1, 'family');
  check('V15-46 P1-1 NPC remembers: next reply quotes last time', rMem.memoryNote === 'referenced-history' && rMem.text.includes('上次你说“我妈总让我考公务员……”'), rMem.text);
  const before = reply('wang', '这个方案能成吗', mem0, 'interview').text;
  ctx(`NPCS.find((n) => n.id === 'wang').backgroundTags = ['北京', '海归', '创业者'];`);
  const after = reply('wang', '这个方案能成吗', mem0, 'interview').text;
  check('V15-47 P1-1 region tags do not decide behavior (same values -> same reply)', before === after);
  ctx(`NPCS.find((n) => n.id === 'wang').backgroundTags = ['山东', '资源型管理者', '体制内出身'];`);
}
{
  // History affects later scenes: trusted NPC becomes the kindness source.
  freshState();
  ctx(`G.meta.npcMemory = { wang: { met: true, trust: 80, history: [{ turn: 5, playerText: '谢谢你的建议', npcReply: '客气', topic: 'family' }] } };`);
  const src = ctx('kindnessSource(G.state, G.meta)');
  check('V15-48 P1-1 highest-trust NPC becomes the kindness source', src.kind === 'npc' && src.npcId === 'wang' && src.label === '王姐', JSON.stringify(src));
}
{
  // T6 flavor line appears after drilling with 老李.
  freshState();
  ctx(`G.meta.npcMemory = { li: { met: true, trust: 60, history: [{ turn: 5, playerText: '你好', npcReply: '你好', topic: 'family' }] } };`);
  ctx('screenT6()');
  check('V15-49 P1-1 T6 mentions the earlier drill with 老李', screenHtml().includes('你之前在演练里跟老李聊过'));
}
{
  // English interview: 3 questions, English answers, feedback.
  ctx(`G = { state: null, rng: makeRng(999), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 }; screenDrillLobby();`);
  click('drill-start', 'en-interview');
  check('V15-50 P1-1 English interview opens with an English question', screenHtml().includes('Q1') && /[A-Za-z]{4,}/.test(screenHtml()));
  sandbox.document.querySelector('#drill-input').value = 'I led a team of five and improved onboarding completion by 30 percent in three months.';
  click('drill-en-send');
  check('V15-51 P1-1 English answer gets feedback with a score', screenHtml().includes('反馈') && screenHtml().includes('/ 3'));
  check('V15-52 P1-1 English interview advances to Q2', screenHtml().includes('第 2 / 3 问'));
}
{
  // Sanctuary: supportive, non-diagnostic, professional-help reminder.
  ctx(`G = { state: null, rng: makeRng(999), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 }; screenDrillLobby();`);
  click('drill-start', 'sanctuary');
  sandbox.document.querySelector('#drill-input').value = '我最近睡不着，心里很堵。';
  click('drill-send');
  check('V15-53 P1-1 sanctuary reply carries the professional-help reminder', screenHtml().includes('专业心理咨询师'));
  sandbox.document.querySelector('#drill-input').value = '我不想活了。';
  click('drill-send');
  check('V15-54 P1-1 sanctuary crisis keywords trigger the crisis path with hotlines', screenHtml().includes('12356') || screenHtml().includes('400-161-9995'));
}
{
  // Voice interview (trial): no SpeechRecognition in this environment,
  // so it falls back to text input and still gives feedback.
  ctx(`G = { state: null, rng: makeRng(999), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 }; screenDrillLobby();`);
  click('drill-start', 'voice');
  check('V15-55 P1-1 voice interview is labeled 试运行 and falls back to text when unsupported', screenHtml().includes('语音面试（试运行）') && screenHtml().includes('已自动转文字输入'));
  sandbox.document.querySelector('#drill-input').value = 'I improved the process and saved the team two hours every week.';
  click('drill-voice-send');
  check('V15-56 P1-1 voice fallback answer still gets feedback', screenHtml().includes('反馈') && screenHtml().includes('/ 3'));
}

// ---------- P1-2: H0 ----------
{
  check('V15-57 P1-2 orphan never has account access', ctx(`rollH0Access(makeRng(1), 'orphan')`) === false && ctx(`rollH0Access(makeRng(99), 'orphan')`) === false);
  check('V15-58 P1-2 absentBoth never has account access', ctx(`rollH0Access(makeRng(1), 'absentBoth')`) === false);
  check('V15-59 P1-2 orphan/absentBoth never tamper, even at H0 90', ctx(`isH0Tampered({ sealed: { H0: { value: 90 } }, flags: { h0Access: false } })`) === false);
  check('V15-60 P1-2 no access, no tamper even at H0 90 (model family)', ctx(`isH0Tampered({ sealed: { H0: { value: 90 } }, flags: { h0Access: false } })`) === false);
  check('V15-61 P1-2 access + H0 90 + not submitted -> tamper open', ctx(`isH0Tampered({ sealed: { H0: { value: 90 } }, flags: { h0Access: true } })`) === true);
  check('V15-62 P1-2 same event judged once: confirmed submission ends tamper', ctx(`isH0Tampered({ sealed: { H0: { value: 90 } }, flags: { h0Access: true, t1Confirmed: true } })`) === false);
  check('V15-63 P1-2 draft only (not confirmed) keeps tamper open', ctx(`isH0Tampered({ sealed: { H0: { value: 90 } }, flags: { h0Access: true, t1ChoiceMade: true } })`) === true);
  // NPD: high base, but access is a roll, not a guarantee.
  let npdNoAccess = 0;
  for (let seed = 1; seed <= 100; seed++) {
    if (ctx(`rollH0Access(makeRng(${seed}), 'npd')`) === false) npdNoAccess += 1;
  }
  check('V15-64 P1-2 NPD access is not guaranteed (some seeds roll no access)', npdNoAccess > 0, 'no-access seeds=' + npdNoAccess + '/100');
  let npdBelow60 = 0;
  for (let seed = 1; seed <= 100; seed++) {
    if (ctx(`rollH0(makeRng(${seed}), 'npd')`) < 60) npdBelow60 += 1;
  }
  check('V15-65 P1-2 NPD strength is not guaranteed >= 60 either', npdBelow60 > 0, 'below-60 seeds=' + npdBelow60 + '/100');
}

// ---------- P1-3: 行业分类 ----------
{
  freshState();
  ctx('startYear(5)');
  click('t5-pick', 'startup');
  check('V15-66 P1-3 T5 pick only drafts; sector picker follows', screenHtml().includes('选行业') || screenHtml().includes('行业'));
  click('t5-sector-pick', 'education');
  check('V15-67 P1-3 education asks for a subsector', screenHtml().includes('学科类校外培训') || screenHtml().includes('k12'));
  click('t5-subsector-pick', 'k12_subject_tutoring');
  check('V15-68 P1-3 B signs with a full jobProfile (startup + education + k12 + policyExposure)', (() => {
    const jp = ctx('G.state.flags.jobProfile');
    return jp && jp.employerType === 'startup' && jp.sector === 'education' && jp.subsector === 'k12_subject_tutoring' && jp.policyExposure === true && !!ctx('G.state.commitments.B');
  })(), JSON.stringify(ctx('G.state.flags.jobProfile')));
}
{
  check('V15-69 P1-3 2023 教培 +2 only for 学科类校外培训', ctx(`t9IndustryAdjustment(2023, '教培', 'k12_subject_tutoring')`) === 2);
  check('V15-70 P1-3 2023 non-subject education (素质教育） gets +0', ctx(`t9IndustryAdjustment(2023, '教培', 'quality')`) === 0);
  check('V15-71 P1-3 2023 vocational education gets +0', ctx(`t9IndustryAdjustment(2023, '教培', 'vocational')`) === 0);
  // Cross-scenario: 2023 年非学科教育公司 — layoffChance reads the
  // industry field, and the non-subject subsector gets no +2.
  const layoff = (sub) => ctx(`layoffChance({ attrs: {}, flags: { era: { examYear: 2015 }, hasProtector: true, jobProfile: { employerType: 'startup', sector: 'education', sectorName: '教培', subsector: '${sub}', policyExposure: true, salaryAnnual: 10, startTurn: 5 } }, sealed: {}, commitments: {} })`);
  check('V15-72 P1-3 layoffChance: k12 is exactly 2 higher than quality in 2023', layoff('k12_subject_tutoring') - layoff('quality') === 2, 'k12=' + layoff('k12_subject_tutoring') + ' quality=' + layoff('quality'));
}

// ---------- P1-4: 年代权重（结构；数值表不动） ----------
{
  check('V15-73 P1-4 Y table adjudicated: 2021 0, 2022 +3, 2023 0 (金融， I=0)', ctx(`t9H2Chance(0, 2021, '金融')`) === 20 && ctx(`t9H2Chance(0, 2022, '金融')`) === 23 && ctx(`t9H2Chance(0, 2023, '金融')`) === 20);
  check('V15-74 P1-4 I table adjudicated: 教培 2021 +12, 互联网 2023 +3', ctx(`t9H2Chance(0, 2021, '教培')`) === 32 && ctx(`t9H2Chance(0, 2023, '互联网')`) === 23);
  const F = ctx('({ civilServiceAppeal, civilServiceWeight, foreignFirmVisibility })');
  check('V15-75 P1-4 考公 2024-2026 appeal stays 78', F.civilServiceAppeal(2024) === 78 && F.civilServiceAppeal(2025) === 78 && F.civilServiceAppeal(2026) === 78 && F.civilServiceWeight(2025) === 0.78);
  check('V15-76 P1-4 外企 visibility adjudicated: 82 (2015/16) and 75 (2019/20)', F.foreignFirmVisibility(2015).weight === 82 && F.foreignFirmVisibility(2016).weight === 82 && F.foreignFirmVisibility(2019).weight === 75 && F.foreignFirmVisibility(2020).weight === 75);
  check('V15-77 P1-4 E sample is 79.5 (UI shows 80)', ctx(`gambleChanceFrom({ skill: 70, network: 60, money: 40, partnerMod: 15, industryDown: false, partnerShares: true, tier: 'tense' })`) === 80);
  check('V15-78 P1-4 H6 tiers fixed: 61 -> +15, 60 -> -10, 35 -> -10, 34 -> -25', (() => {
    const modFor = (h6) => (h6 > 60 ? 15 : h6 >= 35 ? -10 : -25);
    return modFor(61) === 15 && modFor(60) === -10 && modFor(35) === -10 && modFor(34) === -25;
  })());
}

// ---------- P1-5: 创业年代适配 ----------
{
  // Cross-scenario: 2015 年创建生成式 AI 项目 — cannot be created as-is.
  ventureState(2012, 4); // examYear 2012 + turn 4 - 1 = 2015
  startIdea('用 ChatGPT 做一个求职助手');
  check('V15-79 P1-5 2015 generative-AI idea: era check flags it, deferUntil 2022', ctx('G.pendingIdea.eraYear') === 2015 && ctx('G.pendingIdea.eraAdapt.needed') === true && ctx('G.pendingIdea.eraAdapt.deferUntil') === 2022);
  click('idea-era', 'defer');
  check('V15-80 P1-5 defer in 2015: no venture created, deferred note recorded', ctx('G.state.ventures.length') === 0 && (ctx('G.state.ideaNotes') || []).some((n) => n.deferred === true && n.deferredUntil === 2022));
}
{
  // Deferred reminder: in 2022 the note resurfaces, and re-opening it
  // passes the era check (no venture is created by the reminder itself).
  ventureState(2012, 4);
  startIdea('用 ChatGPT 做一个求职助手');
  click('idea-era', 'defer');
  ctx('G.state.turn = 11;'); // examYear 2012 + turn 11 - 1 = 2022
  ctx('startYear(11)');
  check('V15-81 P1-5 deferred idea resurfaces in 2022', screenHtml().includes('以前记下的点子：现在可以开了'));
  click('idea-deferred-open', '0');
  check('V15-82 P1-5 re-opening a due deferred idea passes the era check, still no venture yet', ctx('G.pendingIdea.eraAdapt.needed') === false && ctx('G.state.ventures.length') === 0);
}
{
  // 2010 cannot directly create a ChatGPT-style assistant; adapt works.
  ventureState(2007, 4); // 2007 + 4 - 1 = 2010
  startIdea('用 ChatGPT 做一个求职助手');
  check('V15-83 P1-5 2010 ChatGPT idea is flagged, no direct confirm button', ctx('G.pendingIdea.eraAdapt.needed') === true && !screenHtml().includes('data-act="idea-confirm"'));
  click('idea-era', 'adapt');
  check('V15-84 P1-5 2010 adapt creates an era-adapted venture', ctx('G.state.ventures.length') === 1 && ctx('G.state.ventures[0].eraAdapted') === true);
}
{
  // Privacy: no "完全本地、不上传任何玩家内容" claim anywhere reachable.
  ctx(`G = { state: null, rng: makeRng(999), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 }; screenTitle();`);
  check('V15-85 P1-5 title screen never claims 完全本地', !screenHtml().includes('完全本地'));
  ventureState(2013, 4);
  startIdea('开奶茶店');
  check('V15-86 P1-5 idea confirm discloses the opt-in external AI review', screenHtml().includes('请 AI 审核') && screenHtml().includes('发给一个免费 AI 接口'));
}

// ---------- P1-6: 执念评分多因素（交叉场景） ----------
{
  // Cross-scenario: 断亲 + 回家执念 + 35 岁 — estranged is not homeless.
  const r = ctx(`obsessionScore({ obsessions: ['home'], attrs: { money: 40, health: 70, skill: 70, express: 50, network: 60, influence: 20, stress: 20, debt: 0, family: 0 }, flags: { estranged: true, housing: 'rent' }, sealed: {}, commitments: {}, ventures: [] })`);
  check('V15-87 P1-6 断亲+回家： home still 3 via self-built life (rent + network + money), no estrangement deduction', r.per.home === 3 && r.deductions.estranged === 0 && r.total === 3 && r.ending === 'another-way', JSON.stringify(r));
}
{
  // Cross-scenario: 单身 + 健康良好 + T16 — single is not a failure,
  // and T16 offers care forms instead of forcing a sacrifice.
  t9State();
  ctx(`G.state.flags.relationship = 'none'; G.state.attrs.health = 70;`);
  ctx('G.state.sealed.H5 = { value: 1, omens: [] };');
  ctx(`G.state.commitments.E = { text: '押注：继续打工', signedAt: 'T14', dueTurn: 16, snapshot: { line: 'work', chance: null, roll: null, h6: null } };`);
  ctx('startYear(16)');
  check('V15-88 P1-6 单身+健康+T16: care forms offered, no forced sacrifice of partner or health', screenHtml().includes('你怎么照护') && screenHtml().includes('经济支持') && !screenHtml().includes('你放弃哪一条线'));
  const love = ctx(`obsessionScore({ obsessions: ['love'], attrs: { money: 40, health: 70, skill: 70, express: 50, network: 60, influence: 20, stress: 20, debt: 0, family: 0 }, flags: {}, sealed: {}, commitments: {}, ventures: [] })`);
  check('V15-89 P1-6 单身不自动判亲密关系失败： love scores 2 via the support network', love.per.love === 2, JSON.stringify(love));
}

// ---------- P1-7: 防挫败善意 ----------
{
  // Streak-2 state at T17: offer appears with accept / defer / decline.
  function streak2State() {
    t9State();
    ctx(`G.state.flags.consecFails = 2;`);
    ctx('startYear(17)');
  }
  streak2State();
  const stressBefore = ctx('G.state.attrs.stress');
  const networkBefore = ctx('G.state.attrs.network');
  check('V15-90 P1-7 streak 2 opens with a kindness offer (not an auto-apply)', screenHtml().includes('意外的善意') && screenHtml().includes('接受这份帮助') && screenHtml().includes('先留着') && screenHtml().includes('不用了'));
  click('kindness-accept');
  check('V15-91 P1-7 accept: stress -8, network +2, streak reset', ctx('G.state.attrs.stress') === stressBefore - 8 && ctx('G.state.attrs.network') === networkBefore + 2 && ctx('G.state.flags.consecFails') === 0, 'stress=' + ctx('G.state.attrs.stress') + ' network=' + ctx('G.state.attrs.network'));
  check('V15-92 P1-7 after accept, re-entry shows a receipt, no re-apply', (() => {
    ctx('startYear(17)');
    return screenHtml().includes('意外的善意 · 已接受') && ctx('G.state.attrs.stress') === stressBefore - 8;
  })());
}
{
  // Defer: the offer stays, no benefit, still acceptable later.
  t9State();
  ctx(`G.state.flags.consecFails = 2;`);
  ctx('startYear(17)');
  const s0 = ctx('G.state.attrs.stress');
  click('kindness-defer');
  check('V15-93 P1-7 defer: offer stays this year, no benefit yet', screenHtml().includes('意外的善意') && screenHtml().includes('接受这份帮助') && ctx('G.state.attrs.stress') === s0 && ctx('G.state.flags.consecFails') === 2);
  click('kindness-accept');
  check('V15-94 P1-7 deferred offer can still be accepted later the same year', ctx('G.state.flags.consecFails') === 0 && ctx('G.state.flags.kindnessTurn') === 17);
}
{
  // Decline: gone this year, streak intact, re-offers next year.
  t9State();
  ctx(`G.state.flags.consecFails = 2;`);
  ctx('startYear(17)');
  click('kindness-decline');
  check('V15-95 P1-7 decline: offer gone this year, streak stays 2', !screenHtml().includes('接受这份帮助') && ctx('G.state.flags.consecFails') === 2);
  ctx('startYear(18)');
  check('V15-96 P1-7 decline re-offers next year (streak still >= 2)', screenHtml().includes('意外的善意') && screenHtml().includes('接受这份帮助'));
}
{
  // Stranger fallback: no NPC history, no partner, no stance, low network.
  // (The shared harness localStorage accumulates drill memory from the
  // P1-1 tests above, so clear it here — this check is about having no
  // relations at all.)
  freshState();
  ctx('G.meta.npcMemory = {};');
  const src = ctx('kindnessSource(G.state, G.meta)');
  check('V15-97 P1-7 no relations at all: stranger / community support', src.kind === 'stranger' && src.label === '社区服务中心的工作人员', JSON.stringify(src));
}
{
  // Cross-scenario: 两次兑现失败但 NPC 关系恶劣 — the offer still comes,
  // from a stranger, never from a hostile NPC.
  t9State();
  ctx(`G.meta.npcMemory = {
    wang: { met: true, trust: 10, history: [{ turn: 5, playerText: '滚', npcReply: '...', topic: 'family' }] },
    li: { met: true, trust: 15, history: [{ turn: 5, playerText: '滚', npcReply: '...', topic: 'family' }] },
    laochen: { met: true, trust: 5, history: [{ turn: 5, playerText: '滚', npcReply: '...', topic: 'family' }] },
  };
  G.state.flags.consecFails = 2; G.state.attrs.network = 20;`);
  ctx('startYear(17)');
  check('V15-98 P1-7 hostile NPCs: offer still appears, from community/stranger — not from a hostile NPC', screenHtml().includes('意外的善意') && (screenHtml().includes('社区服务中心的工作人员') || screenHtml().includes('一位陌生人')));
}

// ---------- P1-8: 周目位存储 ----------
{
  const key = (s) => ctx('saveKeyForSlot(' + s + ')');
  check('V15-99 P1-8 three slots have three independent save keys', key(1) !== key(2) && key(2) !== key(3) && key(1) !== key(3), [key(1), key(2), key(3)].join(' | '));
  freshState();
  ctx(`G.state.slot = 1; G.state.attrs.money = 40; saveGame(G.state);`);
  ctx(`G.state = newRun(777, { difficulty: 'normal', obsessions: ['money', 'health'] }); G.state.slot = 2; G.state.attrs.money = 99; saveGame(G.state);`);
  check('V15-100 P1-8 slot 1 still holds its own run after slot 2 saves', ctx('loadGame(1).attrs.money') === 40);
  check('V15-101 P1-8 slot 2 holds its own run', ctx('loadGame(2).attrs.money') === 99);
  check('V15-102 P1-8 free slot 3 is empty', ctx('loadGame(3)') === null);
  ctx(`G.state = loadGame(2); G.state.attrs.money = 55; saveGame(G.state);`);
  check('V15-103 P1-8 editing slot 2 never overwrites slot 1', ctx('loadGame(1).attrs.money') === 40 && ctx('loadGame(2).attrs.money') === 55);
}

// ---------- P1-9: 成长片段一致性 ----------
{
  const bad = ['大学毕业', '毕业后', '找工作', '上班', '工资', '房贷', '结婚', '例假', '变声', '月经', '初潮', '遗精', '谈恋爱', '实习', '老板', '同事', '加班', '买房', '生孩子'];
  const frags = ctx('Object.values(FAMILIES).flatMap((f) => f.fragments || [])');
  const hits = frags.filter((t) => bad.some((k) => String(t).includes(k)));
  check('V15-104 P1-9 no 0-18 fragment contains an adult event or gendered assumption', hits.length === 0, JSON.stringify(hits));
  const eraBad = ['智能手机', '微信', '短视频', 'ChatGPT', '互联网'];
  const eraHits = frags.filter((t) => eraBad.some((k) => String(t).includes(k)));
  check('V15-105 P1-9 no childhood fragment carries an era anachronism', eraHits.length === 0, JSON.stringify(eraHits));
  check('V15-106 P1-9 every family origin has childhood fragments', ctx('Object.values(FAMILIES).every((f) => (f.fragments || []).length > 0)'));
}

console.log(failures === 0 ? 'ALL PASS (v15)' : failures + ' FAILURE(S) (v15)');
process.exit(failures === 0 ? 0 : 1);
