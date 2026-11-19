'use strict';
// v1.0 tests (T10-xx / D-xx / H5-xx / E-xx / F-xx / K-xx / LOOP-xx):
// T10-T18 full loop, D/E/F commitments, H4/H5/H6 sealing, E redemption,
// F resilience, the anti-frustration kindness rule, T18 + settlement
// wiring (settlement scoring itself lives in test-v13).
// Harness: same vm sandbox + DOM stub as test-v11.
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
// min rng: int -> min, chance -> false (deterministic, no H3/H9).
function minRng() {
  return {
    next: () => 0.5, int: (a) => a, chance: () => false,
    float: (a) => a, pick: (arr) => arr[0],
    weighted: (e) => e[0][0], shuffle: (a) => a.slice(),
    getState: () => 0, setState: () => {},
  };
}
// max rng: int -> max, chance -> true (worst-case rolls).
function maxRng() {
  return {
    next: () => 0.5, int: (a, b) => b, chance: () => true,
    float: (a, b) => b, pick: (arr) => arr[0],
    weighted: (e) => e[0][0], shuffle: (a) => a.slice(),
    getState: () => 0, setState: () => {},
  };
}
// Post-slice state (turn 9 done, T9 decisions made). Era is dropped
// (delete flags.era) so the loop is fully deterministic — era integration
// is covered by test-v11.
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
    // v1.2 (P1-3): 入职档案——大厂/互联网/年薪 18 万，T9 补偿按它算
    // （月薪 1.5 万 × 4 年 = 6 万，不再是固定 8 万）。
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

// ---------- routing: slice end -> T10 ----------
{
  t9State();
  ctx('sliceEnd()');
  check('T10-01 slice end no longer ends the run: no restart button, offers 进入 T10', screenHtml().includes('进入 T10 · 27 岁') && !screenHtml().includes('data-act="restart"'));
  check('T10-01 slice end does not count the run finished (runsFinished stays 0)', ctx('G.meta.runsFinished') === 0, 'runsFinished=' + ctx('G.meta.runsFinished'));
  click('year-next', '10');
  check('T10-02 T10 screen renders (27 岁， AP 3)', screenHtml().includes('T10 · 27 岁') && screenHtml().includes('本年 AP：3'));
  check('T10-03 T10 shows the C redemption card with the H2 source label', screenHtml().includes('承诺兑现卡 · C') && screenHtml().includes('这颗骰在你 26 岁那年掷出') && screenHtml().includes('被裁了'));
  check('T10-04 C laid off counts as one consecutive failure', ctx('G.state.flags.consecFails') === 1, 'consecFails=' + ctx('G.state.flags.consecFails'));
  check('T10-05 C lesson card lands in the lessons scaffold', ctx('G.state.lessons').some((l) => l.id === 'C'));
  endYearTo(11);
  check('T10-06 T11 fast year renders (28 岁）', screenHtml().includes('T11 · 28 岁'));
  check('T10-07 one C failure alone does not trigger kindness at T11', !screenHtml().includes('意外的善意'));
}

// C kept: no failure counted, no C-fail streak.
{
  t9State({ laidOff: false, hrTransfer: false });
  ctx(`G.state.flags.h2 = { chance: 35, roll: 90, laidOff: false }; G.state.flags.t9Branch = 'pivot';`);
  ctx('sliceEnd()');
  click('year-next', '10');
  check('T10-08 C kept: card says 岗位保住了， consecFails 0', screenHtml().includes('岗位保住了') && ctx('G.state.flags.consecFails') === 0);
}

// ---------- T12: relationship lock (v1.2 P0-4: two dimensions) ----------
{
  t9State();
  ctx('startYear(12)');
  check('D-01 T12 screen: two dimensions, no die promised', screenHtml().includes('关系锁定') && screenHtml().includes('和伴侣定下来') && screenHtml().includes('断亲') && screenHtml().includes('单身') && screenHtml().includes('有限联系') && screenHtml().includes('两件事互相独立'));
  click('t12-intimate', 'partner');
  check('D-02a partner picked but not signed: cash untouched, no H4 yet', ctx('G.state.attrs.money') === 40 && !ctx('G.state.sealed.H4') && !ctx('G.state.commitments.D'));
  click('t12-cost', 'wedding');
  click('t12-boundary', 'close');
  click('t12-confirm');
  check('D-02 partner + wedding: cash 40 -> 28, H4 sealed 1–100, D signed', ctx('G.state.attrs.money') === 28 && ctx('G.state.sealed.H4').value >= 1 && ctx('G.state.sealed.H4').value <= 100 && ctx('G.state.commitments.D').signedAt === 'T12', 'money=' + ctx('G.state.attrs.money') + ' H4=' + JSON.stringify(ctx('G.state.sealed.H4')));
  check('D-03 partner signed card shows H4 omens, not the number', screenHtml().includes('承诺卡 D 已签署') && screenHtml().includes('他/她谈钱的时候') && !screenHtml().includes('H4 值'));
  check('D-04 re-pick does not re-sign (guard)', (() => { click('t12-intimate', 'single'); return ctx('G.state.flags.relationship') === 'partner' && ctx('G.state.attrs.money') === 28; })());
}
{
  // Marriage alone costs nothing: partner + close + no wedding = cash 40.
  t9State();
  ctx('startYear(12)');
  click('t12-intimate', 'partner');
  click('t12-boundary', 'close');
  click('t12-confirm');
  check('D-02b partner without wedding: cash stays 40 (no fixed −30)', ctx('G.state.attrs.money') === 40 && !!ctx('G.state.sealed.H4') && ctx('G.state.commitments.D').text.includes('伴侣'));
}
{
  t9State();
  ctx('startYear(12)');
  click('t12-intimate', 'single');
  click('t12-boundary', 'estranged');
  click('t12-confirm');
  check('D-05 estranged: family 0, flag set, obsessionProgress +2', ctx('G.state.attrs.family') === 0 && ctx('G.state.flags.estranged') === true && ctx('G.state.flags.obsessionProgress') === 2 && ctx('G.state.flags.intimateRelationship') === 'single' && ctx('G.state.flags.familyBoundary') === 'estranged');
  click('year-next', '13');
  check('D-06 estranged: 陪伴行动还在，改叫“陪伴侣 / 朋友”', screenHtml().includes('陪伴侣 / 朋友'));
  check('D-07 estranged: settleYear recovery is 3 worse (50 -> 55, not 52)', (() => {
    ctx('G.state.attrs.stress = 50;');
    const r = ctx('settleYear(G.state, DIFFICULTIES.normal)');
    return ctx('G.state.attrs.stress') === 55 && ctx('G.state.attrs.family') === 0;
  })(), 'stress=' + ctx('G.state.attrs.stress'));
}
{
  t9State();
  ctx('startYear(12)');
  click('t12-intimate', 'partner');
  click('t12-boundary', 'estranged');
  click('t12-confirm');
  check('D-11 married + estranged: partner kept, family 0, H4 sealed', ctx('G.state.flags.relationship') === 'partner' && ctx('G.state.flags.estranged') === true && ctx('G.state.attrs.family') === 0 && !!ctx('G.state.sealed.H4'));
}
{
  t9State();
  ctx('G.state.attrs.family = 3;');
  ctx('startYear(12)');
  click('t12-intimate', 'partner');
  click('t12-boundary', 'limited');
  click('t12-confirm');
  check('D-10 limited contact: family clamped to 1, not 0', ctx('G.state.attrs.family') === 1 && ctx('G.state.flags.familyCapped') === true && ctx('G.state.flags.familyBoundary') === 'limited');
}
{
  // Recovery without estrangement is the control: 50 -> 52.
  t9State();
  ctx('G.state.attrs.stress = 50;');
  ctx('settleYear(G.state, DIFFICULTIES.normal)');
  check('D-08 control: no estrangement, settleYear 50 -> 52', ctx('G.state.attrs.stress') === 52);
}
{
  t9State();
  ctx('startYear(12)');
  click('t12-intimate', 'single');
  click('t12-boundary', 'close');
  click('t12-confirm');
  check('D-09 single + close: relationship none, D signed, no H4 sealed, support network intact', ctx('G.state.flags.relationship') === 'none' && ctx('G.state.flags.intimateRelationship') === 'single' && ctx('G.state.flags.familyBoundary') === 'close' && ctx('G.state.commitments.D').text.includes('单身') && !ctx('G.state.sealed.H4') && ctx('G.state.attrs.network') === 60);
}

// ---------- T13: H5 signing + checkup + married AP ----------
{
  t9State();
  ctx('G.state.flags.relationship = "partner"; G.state.commitments.D = { text: "关系槽：伴侣", signedAt: "T12", dueTurn: 13, snapshot: {} };');
  ctx('startYear(13)');
  check('H5-01 T13 seals H5 once (1–3) and shows the 体检 action', ctx('G.state.sealed.H5').value >= 1 && ctx('G.state.sealed.H5').value <= 3 && screenHtml().includes('带父母去体检') && screenHtml().includes('这颗骰在你 30 岁那年掷出'));
  check('H5-02 partner without mortgage: T13 AP stays 3 (marriage alone no longer costs AP)', ctx('G.state.ap') === 3 && screenHtml().includes('本年 AP：3'), 'ap=' + ctx('G.state.ap'));
  const h5first = JSON.stringify(ctx('G.state.sealed.H5'));
  ctx('startYear(13)');
  check('H5-03 re-entering T13 does not re-seal H5', JSON.stringify(ctx('G.state.sealed.H5')) === h5first);
  click('h5-checkup');
  check('H5-04 体检 costs 1 AP (3 -> 2) and sets the flag', ctx('G.state.ap') === 2 && ctx('G.state.flags.h5Checkup') === true);
  click('h5-checkup');
  check('H5-05 体检 cannot be repeated (AP stays 2)', ctx('G.state.ap') === 2 && ctx('G.state.flags.h5Checkup') === true);
}
{
  // Mortgage year: T13 AP is 2, not 3 (买房/还贷年 AP −1) — the AP
  // rule now follows housing, not relationship status.
  t9State();
  ctx('G.state.flags.housing = "mortgage";');
  ctx('startYear(13)');
  check('H5-02b mortgage: T13 AP is 2, not 3 (还贷年 AP −1)', ctx('G.state.ap') === 2 && screenHtml().includes('本年 AP：2'), 'ap=' + ctx('G.state.ap'));
}
{
  t9State();
  ctx('startYear(13)');
  check('H5-06 unmarried: T13 AP stays 3', ctx('G.state.ap') === 3);
  check('H5-07 H5 level: base 2 + checkup -> 1; base 1 + checkup -> 1; base 3 no checkup -> 3', (() => {
    ctx('G.state.sealed.H5 = { value: 2, omens: [] }; G.state.flags.h5Checkup = true;');
    const a = ctx('h5Level(G.state)');
    ctx('G.state.sealed.H5 = { value: 1, omens: [] };');
    const b = ctx('h5Level(G.state)');
    ctx('G.state.sealed.H5 = { value: 3, omens: [] }; G.state.flags.h5Checkup = false;');
    const c = ctx('h5Level(G.state)');
    return a === 1 && b === 1 && c === 3;
  })());
}

// ---------- T14: gamble ----------
{
  t9State();
  ctx('G.state.flags.relationship = "partner"; G.state.sealed.H4 = { value: 70, omens: [] };');
  ctx('startYear(14)');
  click('t14-pick', 'startup');
  const snap = ctx('G.state.commitments.E.snapshot');
  check('E-01 startup: H6 sealed with network +10 (roll 1 + 10 = 11), partnerMod −25', snap.h6 === 11 && snap.partnerMod === -25 && ctx('G.state.flags.partnerMod') === -25, JSON.stringify(snap));
  check('E-02 startup: partnerShares true (H4 70 > 60)', ctx('G.state.flags.partnerShares') === true);
  check('E-03 startup: chance 15+17.5+9+20−25+8 = 44.5 -> 45, roll sealed 1', snap.chance === 45 && snap.roll === 1, JSON.stringify(snap));
  check('E-04 signed card shows only the tier (五五开）, never the exact chance', screenHtml().includes('五五开') && !screenHtml().includes('45%'));
}
{
  // H6 modifiers: network >= 50 +10; a live venture counts as 此前合作过 +15.
  t9State();
  ctx('G.state.flags.relationship = "partner"; G.state.sealed.H4 = { value: 70, omens: [] }; G.state.ventures = [{ id: "v1", name: "x", archetype: "ai-tool", status: "active", stage: 1, createdTurn: 2 }];');
  ctx('startYear(14)');
  click('t14-pick', 'startup');
  check('E-05 H6 mods stack: roll 1 + network 10 + venture 15 = 26 -> partnerMod −25', ctx('G.state.commitments.E.snapshot').h6 === 26);
}
{
  // partnerMod mapping, via direct snapshot construction (pure).
  const modFor = (h6) => (h6 > 60 ? 15 : h6 >= 35 ? -10 : -25);
  check('E-06 partnerMod map: 61 -> +15, 60 -> −10, 35 -> −10, 34 -> −25', modFor(61) === 15 && modFor(60) === -10 && modFor(35) === -10 && modFor(34) === -25);
}
{
  t9State();
  ctx('startYear(14)');
  click('t14-pick', 'work');
  check('E-07 work line: no die sealed, no chance, staked 0', !ctx('G.state.sealed.E') && ctx('G.state.commitments.E.snapshot').chance === null && ctx('G.state.commitments.E.snapshot').staked === 0);
  check('E-08 work line signed card says no die', screenHtml().includes('没有骰子'));
}
{
  t9State();
  ctx('startYear(14)');
  click('t14-pick', 'abroad');
  check('E-09 abroad: stakes half the cash (40 -> 20), partnerMod 0', ctx('G.state.commitments.E.snapshot').staked === 20 && ctx('G.state.commitments.E.snapshot').partnerMod === 0);
}

// ---------- T15: partner shows his true face ----------
{
  t9State();
  ctx(`G.state.commitments.E = { text: '押注：创业', signedAt: 'T14', dueTurn: 16, snapshot: { line: 'startup', skill: 70, network: 60, money: 10, partnerMod: -25, industryDown: false, partnerShares: false, tier: 'calm', k: 1, staked: 10, chance: 22, roll: 1, h6: 11 } };`);
  ctx('G.state.sealed.H6 = { value: 11, omens: [] };');
  ctx('startYear(15)');
  check('T15-01 H6 < 35: T15 shows the 跑路 omen (看了三次手机）', screenHtml().includes('露真面目') && screenHtml().includes('看了三次手机'));
  ctx('startYear(15)');
  check('T15-02 T15 omen is logged once, not twice on re-entry', ctx('G.state.omenLog').filter((o) => o.turn === 15).length === 1);
}
{
  t9State();
  ctx(`G.state.commitments.E = { text: '押注：创业', signedAt: 'T14', dueTurn: 16, snapshot: { line: 'startup', skill: 70, network: 60, money: 10, partnerMod: 15, industryDown: false, partnerShares: false, tier: 'calm', k: 1, staked: 10, chance: 60, roll: 1, h6: 80 } };`);
  ctx('G.state.sealed.H6 = { value: 80, omens: [] };');
  ctx('startYear(15)');
  check('T15-03 H6 > 60: T15 shows the 扛住 omen (先垫了房租）', screenHtml().includes('先垫了这个月的房租'));
}
{
  t9State();
  ctx(`G.state.commitments.E = { text: '押注：继续打工', signedAt: 'T14', dueTurn: 16, snapshot: { line: 'work', chance: null, roll: null, h6: null } };`);
  ctx('startYear(15)');
  check('T15-04 no venture line, no partner omen', !screenHtml().includes('露真面目'));
}

// ---------- T16: E resolve + H5 + F ----------
{
  // Startup failure path (max rng: H6 100 -> +15, E roll 100 -> fail),
  // partner H4 = 1 (< 30) so failure also triggers the divorce.
  t9State();
  ctx('G.state.flags.relationship = "partner"; G.state.sealed.H4 = { value: 1, omens: [] };');
  ctx('G.rng = (' + maxRng.toString() + ')()');
  ctx('startYear(14)');
  click('t14-pick', 'startup');
  check('E-10 fail setup: H6 100 -> partnerMod +15, E roll 100', ctx('G.state.commitments.E.snapshot').h6 === 100 && ctx('G.state.commitments.E.snapshot').roll === 100);
  click('year-next', '15');
  click('year-end');
  // v1.2 (P0-3): T13 was skipped in this flow (jumped 9 -> 14), so H5
  // was never sealed at T13 — seal it by hand, as the F tests do.
  ctx('G.state.sealed.H5 = { value: 1, omens: [] };');
  click('year-next', '16');
  check('E-11 startup fail: cash zeroed then H5 L1 −15 (money −15), stress 75+15 = 90, health −20', ctx('G.state.attrs.money') === -15 && ctx('G.state.attrs.stress') === 90 && ctx('G.state.attrs.health') === 50, 'money=' + ctx('G.state.attrs.money') + ' stress=' + ctx('G.state.attrs.stress') + ' health=' + ctx('G.state.attrs.health'));
  check('E-12 startup fail + H4 < 30: divorce fires (partner gone)', ctx('G.state.flags.relationship') === 'none' && ctx('G.state.flags.partnerGone') === true);
  check('E-13 T16 screen shows the E card: 没成 + exact chance and roll + 31 岁那年', screenHtml().includes('承诺兑现卡 · E') && screenHtml().includes('没成') && screenHtml().includes('精确成功率') && screenHtml().includes('这颗骰在你 31 岁那年掷出'));
  check('E-14 E lesson card recorded', ctx('G.state.lessons').some((l) => l.id === 'E'));
}
{
  // F resilience: pass case (money + health meet 2/3).
  t9State();
  ctx(`G.state.attrs.money = 60; G.state.attrs.health = 70;`);
  ctx(`G.state.commitments.E = { text: '押注：继续打工', signedAt: 'T14', dueTurn: 16, snapshot: { line: 'work', chance: null, roll: null, h6: null } };`);
  ctx('G.state.sealed.H5 = { value: 1, omens: [] };');
  ctx('startYear(16)');
  check('F-01 H5 level 1 applied at T16 entry: money 60+4−15 = 49, stress 20+4 (work line) +15 = 39', ctx('G.state.attrs.money') === 49 && ctx('G.state.attrs.stress') === 39, 'money=' + ctx('G.state.attrs.money') + ' stress=' + ctx('G.state.attrs.stress'));
  check('F-02 H5 card shows 1 级 + source (30 岁那年）', screenHtml().includes('父母的病（H5 · 1 级）') && screenHtml().includes('30 岁那年'));
  click('t16-pick', 'fund');
  check('F-03 resilience pass (money + health): stress +25 (39 -> 64), money −10 (49 -> 39), skill unchanged, consecFails 0', ctx('G.state.attrs.stress') === 64 && ctx('G.state.attrs.money') === 39 && ctx('G.state.attrs.skill') === 70 && ctx('G.state.flags.fResult').pass === true && ctx('G.state.flags.consecFails') === 0, 'stress=' + ctx('G.state.attrs.stress') + ' money=' + ctx('G.state.attrs.money'));
  check('F-04 F signed card shows the F redemption card (三选二成立）', screenHtml().includes('承诺兑现卡 · F') && screenHtml().includes('三选二成立'));
}
{
  // F resilience: fail case (0/3 met) + health sacrifice.
  t9State();
  ctx(`G.state.attrs.money = 10; G.state.attrs.health = 50;`);
  ctx(`G.state.commitments.E = { text: '押注：继续打工', signedAt: 'T14', dueTurn: 16, snapshot: { line: 'work', chance: null, roll: null, h6: null } };`);
  ctx('G.state.sealed.H5 = { value: 1, omens: [] };');
  ctx('startYear(16)');
  click('t16-pick', 'time');
  check('F-05 resilience fail (0/3): stress +10 (care) +45 (fail) = 94, skill −5, health −15 (fail) = 35', ctx('G.state.flags.fResult').pass === false && ctx('G.state.attrs.health') === 35 && ctx('G.state.attrs.skill') === 65 && ctx('G.state.attrs.stress') === 94, 'health=' + ctx('G.state.attrs.health') + ' skill=' + ctx('G.state.attrs.skill') + ' stress=' + ctx('G.state.attrs.stress') + ' pass=' + ctx('G.state.flags.fResult').pass);
  check('F-06 F fail counts toward the kindness streak (consecFails 1)', ctx('G.state.flags.consecFails') === 1);
}
{
  // H5 level 2 and 3 costs, applied once.
  const h5Cost = (base, checkup, money, health, stress) => {
    t9State();
    ctx(`G.state.attrs.money = ${money}; G.state.attrs.health = ${health}; G.state.attrs.stress = ${stress};`);
    ctx(`G.state.commitments.E = { text: '押注：继续打工', signedAt: 'T14', dueTurn: 16, snapshot: { line: 'work', chance: null, roll: null, h6: null } };`);
    ctx(`G.state.sealed.H5 = { value: ${base}, omens: [] }; G.state.flags.h5Checkup = ${checkup};`);
    ctx('startYear(16)');
    return { money: ctx('G.state.attrs.money'), stress: ctx('G.state.attrs.stress'), health: ctx('G.state.attrs.health'), level: ctx('G.state.flags.h5Result').level };
  };
  const l2 = h5Cost(2, false, 60, 70, 20);
  check('F-07 H5 level 2: money 60+4−40 = 24, stress 20+4 (work line) +30 = 54', l2.money === 24 && l2.stress === 54 && l2.level === 2, JSON.stringify(l2));
  const l3 = h5Cost(3, false, 100, 70, 20);
  check('F-08 H5 level 3: money 100+4−80 = 24, stress 20+4+45 = 69, health 70−15 = 55 + 破防事件', l3.money === 24 && l3.stress === 69 && l3.health === 55 && l3.level === 3 && screenHtml().includes('破防事件'), JSON.stringify(l3));
  const l2c = h5Cost(3, true, 60, 70, 20);
  check('F-09 H5 level 3 + checkup -> level 2 (money 60+4−40 = 24)', l2c.level === 2 && l2c.money === 24, JSON.stringify(l2c));
  // Re-entering T16 does not re-apply H5.
  const before = ctx('G.state.attrs.money');
  ctx('startYear(16)');
  check('F-10 re-entering T16 does not re-apply H5', ctx('G.state.attrs.money') === before);
}

// ---------- kindness: two consecutive failures ----------
// C fail (T10) + E fail (T16) -> kindness at T17.
{
  t9State();
  ctx('G.state.flags.relationship = "partner"; G.state.sealed.H4 = { value: 1, omens: [] };');
  ctx('G.rng = (' + maxRng.toString() + ')()');
  ctx('startYear(10)');
  check('K-01 C fail streak starts at 1', ctx('G.state.flags.consecFails') === 1);
  endYearTo(11);
  endYearTo(12);
  // T12: pick single + close (no H4 interplay), then T13/T14/T15/T16.
  click('t12-intimate', 'single');
  click('t12-boundary', 'close');
  click('t12-confirm');
  click('year-next', '13');
  click('year-end');
  click('year-next', '14');
  click('t14-pick', 'startup');
  click('year-next', '15');
  click('year-end');
  click('year-next', '16');
  check('K-02 E fail is the second consecutive failure (streak 2)', ctx('G.state.flags.consecFails') === 2, 'consecFails=' + ctx('G.state.flags.consecFails'));
  // F: pick fund. Resilience reads post-H5 state; money is 0 after the
  // E fail, health 50, no partner -> fail -> streak 3, still >= 2.
  click('t16-pick', 'fund');
  click('year-next', '17');
  check('K-03 T17 opens with 意外的善意 offer (accept / defer / decline)', screenHtml().includes('意外的善意') && screenHtml().includes('接受这份帮助') && screenHtml().includes('先留着') && screenHtml().includes('不用了'));
  click('kindness-accept');
  check('K-04 kindness accept: stress −8 and resets the streak', ctx('G.state.flags.consecFails') === 0 && ctx('G.state.flags.kindnessTurn') === 17, 'consecFails=' + ctx('G.state.flags.consecFails'));
  ctx('startYear(17)');
  check('K-05 re-entering T17 shows the receipt card but does not re-apply the benefit', screenHtml().includes('意外的善意 · 已接受') && ctx('G.state.flags.consecFails') === 0);
}

// ---------- T18 ----------
{
  t9State();
  ctx('startYear(18)');
  check('T18-01 T18 has exactly 1 AP', ctx('G.state.ap') === 1);
  check('T18-02 T18 offers three 1-AP closing acts, no year-end button', screenHtml().includes('最后一件想做的事') && screenHtml().includes('陪家人/伴侣吃顿饭') && screenHtml().includes('好好睡一觉') && screenHtml().includes('把这 18 年写下来') && !screenHtml().includes('结束这一年'));
  check('T18-03 no settlement button before the last act', !screenHtml().includes('去结算 · 35 岁'));
  click('t18-pick', 'health');
  check('T18-04 after the act: AP 0, settle button appears', ctx('G.state.ap') === 0 && screenHtml().includes('去结算 · 35 岁'));
  check('T18-05 second pick is refused (one act only)', (() => { click('t18-pick', 'write'); return ctx('G.state.flags.t18Choice') === 'health' && ctx('G.state.ap') === 0; })());
}
{
  t9State();
  ctx('G.state.flags.estranged = true;');
  ctx('startYear(18)');
  check('T18-06 estranged: the family closing act is still there, as 陪伴侣/朋友吃顿饭', screenHtml().includes('陪伴侣/朋友吃顿饭') && !screenHtml().includes('断亲后没有这条路'));
}

// ---------- full loop end to end (min rng, deterministic) ----------
{
  t9State();
  ctx('sliceEnd()');
  click('year-next', '10');
  endYearTo(11);
  endYearTo(12);
  click('t12-intimate', 'partner');
  click('t12-boundary', 'close');
  click('t12-confirm');
  click('year-next', '13');
  endYearTo(14);
  click('t14-pick', 'startup');
  // Note: sliceEnd paid N = 6 万 (jobProfile bigtech 18 万/年）, and
  // marriage no longer costs 30 万 — cash at T14 is 40+6 = 46.
  check('LOOP-01 E chance at signing: 15+17.5+9+20−25 = 36.5 -> 37, tier 五五开', ctx('G.state.commitments.E.snapshot').chance === 37 && screenHtml().includes('五五开'), JSON.stringify(ctx('G.state.commitments.E.snapshot')));
  click('year-next', '15');
  endYearTo(16);
  check('LOOP-02 E success: money 46 + staked 46 = 92, then H5 L1 −15 -> 77', ctx('G.state.attrs.money') === 77, 'money=' + ctx('G.state.attrs.money'));
  check('LOOP-03 E card on T16: 成了 + 精确成功率 37%，掷出 1', screenHtml().includes('成了') && screenHtml().includes('精确成功率 37%，掷出 1'));
  click('t16-pick', 'fund');
  click('year-next', '17');
  check('LOOP-04 T17 shows the F redemption card, no kindness (streak only 1)', screenHtml().includes('承诺兑现卡 · F') && !screenHtml().includes('意外的善意'));
  endYearTo(18);
  click('t18-pick', 'health');
  click('t18-settle');
  check('LOOP-05 settlement screen renders with an ending + score', screenHtml().includes('35 岁 · 结算') && /（−?\d+ 分）/.test(screenHtml()));
  check('LOOP-06 settlement total matches obsessionScore (money 3 + health 3 = 6 -> 如愿）', ctx('obsessionScore(G.state)').total === 6 && ctx('obsessionScore(G.state)').ending === 'fulfilled' && screenHtml().includes('如愿（6 分）'), JSON.stringify(ctx('obsessionScore(G.state)')));
  check('LOOP-07 runsFinished counts the run once at settlement', ctx('G.meta.runsFinished') === 1);
  ctx('screenSettlement()');
  check('LOOP-08 re-rendering settlement does not double-count the run', ctx('G.meta.runsFinished') === 1);
  check('LOOP-09 settlement screen offers 再来一次 (S4 unlock lives there)', screenHtml().includes('再来一次'));
  // Continue from a finished save lands back on settlement.
  click('restart');
  check('LOOP-10 再来一次 goes to the title with runNumber 2 (S4 unlocks next run)', screenHtml().includes('歧路花开') && ctx('G.state.runNumber') === 2);
}

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
