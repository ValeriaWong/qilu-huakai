'use strict';
// v0.9 P1 tests (T9-xx / FU-xx / H0-xx / ADJ-xx / CS-xx) — five items only:
// (a) T9 crisis background, (c) future scenario generator, (d) H0 tamper
// conditions, (e) school-tier simulation + 调剂 as its own mechanism,
// (f) civil-service / NPC contact / foreign firms.
// v1.1: (a)/(f) values revised per the WorkBuddy mechanism recheck
// 2026-11-18 (alipay-emerge-rpg-workbuddy-p1-recheck-20261118.md); (d)
// H0 is now two-level (draft vs submit-confirm); (b) lives in test-v14.
// (b) 创业年代技术表 was PAUSED by Allen 2026-11-17 21:15 pending
// verification — the WorkBuddy recheck 2026-11-18 supplied it, and the
// (b) table + adapter + UI tests are in test-v14.js (v1.1).
// (a) + (f) were reworked 2026-11-17 21:27 per the ChatGPT recheck
// (alipay-emerge-rpg-chatgpt-p1-recheck-20261117.md): structure first —
// the H2 formula is additive (clamp 5-85, Y/I in pp, table-driven) and
// the (f) numbers come from the recheck's tables, not the design doc.
// Contested numbers live in named constant tables in era.js; the tests
// pin the structure + the tables' current values so a table edit is a
// one-line change, not a code change.
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const REPO = path.join(__dirname, '..');

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('PASS  ' + name);
  else { failures += 1; console.log('FAIL  ' + name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); }
}

// --- stub DOM (same shape as test-v09) ---
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
// Deterministic rng stub (from test-v09): chance(p) follows `rollPass`, int returns min.
function fakeRng(rollPass) {
  return {
    next: () => 0.5, int: (a) => a, chance: () => rollPass,
    float: (a) => a, pick: (arr) => arr[0],
    weighted: (e) => e[0][0], shuffle: (a) => a.slice(),
    getState: () => 0, setState: () => {},
  };
}
// Era state (from test-v09).
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
function gaokaoCtx(examYear, base) {
  // 2020+ 山东 is new33 (track 不分）; earlier years are split 文/理.
  const track = examYear >= 2020 ? '不分' : '文';
  return `G.state.flags.gaokao = { region: 'shandong', base: ${base}, era: { birthYear: ${examYear - 18}, examYear: ${examYear}, track: '${track}', mode: '${examYear >= 2020 ? 'new33' : 'split'}' }, row: lookupLine('shandong', ${examYear}, '${track}') };`;
}
// T1 era setup: 山东， 文， sealed score `base`, major `major`, stance insist.
function t1EraSetup(examYear, base, major) {
  eraState({ birthYear: examYear - 18, examYear, turn: 1 });
  ctx(gaokaoCtx(examYear, base));
  ctx('screenT1()');
  ctx(`document.querySelector('#t1-major').value = '${major || '计算机'}';`);
  click('t1-pick', 'insist');
  // v1.1 (d): pick is only a draft now — submit to execute it.
  click('t1-confirm');
}
// T1 era setup with a controlled H0 (for the tamper UI tests).
function toT1Era(examYear, h0value, familyKey, base) {
  eraState({ birthYear: examYear - 18, examYear, familyKey: familyKey || 'model', turn: 1 });
  ctx(`G.state.sealed.H0 = { value: ${h0value}, omens: [{ text: '你妈说隔壁家孩子学了会计。' }] };`);
  ctx(gaokaoCtx(examYear, base === undefined ? 600 : base));
  ctx('screenT1()');
}
// Pure-function era admission (same shape as test-v08's helper).
function eraAdm(year, track, base, major) {
  const row = ctx(`lookupLine('shandong', ${year}, '${track}')`);
  const st = { flags: { gaokao: { region: 'shandong', era: { birthYear: year - 18, examYear: year, track, mode: year >= 2020 ? 'new33' : 'split' }, base, row: { tier1: row.tier1, tier2: row.tier2, tier3: row.tier3, vocational: row.vocational, regime: row.regime, status: row.status } } } };
  return ctx(`resolveEraAdmission(${JSON.stringify(st)}, '${major}')`);
}

// ---------- (a) T9 crisis background ----------
{
  const C = ctx('({ t9CrisisForExamYear, t9YearAdjustment, t9IndustryAdjustment, t9H2Chance, t9Branch, layoffChance, T9_H2_BASE, T9_H2_PER_RISK, T9_H2_MIN, T9_H2_MAX, T9_YEAR_ADJUSTMENT })');
  check('T9-01 anchor 1988 -> 1996 下岗潮 (real)', (() => { const c = C.t9CrisisForExamYear(1988); return c.crisisYear === 1996 && c.label === '下岗潮' && c.fictional === false; })());
  check('T9-01 anchor 2008 -> 2016 供给侧 (real)', (() => { const c = C.t9CrisisForExamYear(2008); return c.crisisYear === 2016 && c.label === '供给侧改革' && c.fictional === false; })());
  check('T9-01 anchor 2013 -> 2021 双减 (real)', (() => { const c = C.t9CrisisForExamYear(2013); return c.crisisYear === 2021 && c.label === '双减' && c.fictional === false; })());
  check('T9-01 anchor 2019 -> 2027 架空', (() => { const c = C.t9CrisisForExamYear(2019); return c.crisisYear === 2027 && c.fictional === true; })());
  check('T9-01 anchor 2026 -> 2034 架空', (() => { const c = C.t9CrisisForExamYear(2026); return c.crisisYear === 2034 && c.fictional === true; })());
  check('T9-02 off-anchor 2015 -> 2023 行业调整 (real)', (() => { const c = C.t9CrisisForExamYear(2015); return c.crisisYear === 2023 && c.label === '行业调整' && c.fictional === false; })());
  check('T9-02 off-anchor 2020 -> 2028 架空', (() => { const c = C.t9CrisisForExamYear(2020); return c.crisisYear === 2028 && c.fictional === true; })());
  // P(H2) = clamp(5%, 85%, 20% + 15% x score + Y + I), recheck 2026-11-17 P0.
  // The old multiplicative factors (+15%/+20%/+5%) were rejected.
  check('T9-03 formula constants: base 20, +15/risk, clamp 5-85', C.T9_H2_BASE === 20 && C.T9_H2_PER_RISK === 15 && C.T9_H2_MIN === 5 && C.T9_H2_MAX === 85);
  check('T9-03 Y table (pp): 2021 0 / 2022 +3 / 2023 0 / others 0 (final adjudication 2026-11-20, ChatGPT mixed table)', C.t9YearAdjustment(2021) === 0 && C.t9YearAdjustment(2022) === 3 && C.t9YearAdjustment(2023) === 0 && C.t9YearAdjustment(2020) === 0 && C.t9YearAdjustment(2034) === 0 && C.T9_YEAR_ADJUSTMENT[2022] === 3);
  check('T9-03 I table (pp): 2021 互联网3/教培12; 2022 互联网5/线下服务8/教培8; 2023 互联网3/教培2 (final adjudication 2026-11-20)', C.t9IndustryAdjustment(2021, '互联网') === 3 && C.t9IndustryAdjustment(2021, '教培', 'k12_subject_tutoring') === 12 && C.t9IndustryAdjustment(2022, '互联网') === 5 && C.t9IndustryAdjustment(2022, '线下服务') === 8 && C.t9IndustryAdjustment(2022, '教培', 'k12_subject_tutoring') === 8 && C.t9IndustryAdjustment(2023, '互联网') === 3 && C.t9IndustryAdjustment(2023, '教培', 'k12_subject_tutoring') === 2);
  check('T9-03 I table: other industry / year / no industry -> 0; 互联网平台 alias', C.t9IndustryAdjustment(2023, '地产') === 0 && C.t9IndustryAdjustment(2020, '互联网') === 0 && C.t9IndustryAdjustment(2022, null) === 0 && C.t9IndustryAdjustment(2022, '互联网平台') === 5);
  check('T9-03 t9H2Chance is additive: (0,2022,互联网） 20+0+3+5=28', C.t9H2Chance(0, 2022, '互联网') === 28);
  check('T9-03 t9H2Chance: (0,2022,null)=23; (0,2021,教培学科）=32; (0,2023,地产）=20; (0,2034,null)=20', C.t9H2Chance(0, 2022, null) === 23 && C.t9H2Chance(0, 2021, '教培', 'k12_subject_tutoring') === 32 && C.t9H2Chance(0, 2023, '地产') === 20 && C.t9H2Chance(0, 2034, null) === 20);
  check('T9-03 t9H2Chance clamps: (4,2022,互联网） 88 -> 85; (4,2021,null)=80', C.t9H2Chance(4, 2022, '互联网') === 85 && C.t9H2Chance(4, 2021, null) === 80);
  // layoffChance: score from the 4 risk factors, Y/I from the tables.
  const chanceFor = (examYear, industry, allRisks, subsector) => {
    eraState({ birthYear: examYear - 18, examYear });
    if (allRisks) ctx('G.state.flags.highPay = true; G.state.flags.hasProtector = false; G.state.flags.lowKpi = true; G.state.flags.deptShrinking = true;');
    else ctx('G.state.flags.highPay = false; G.state.flags.hasProtector = true; G.state.flags.lowKpi = false; G.state.flags.deptShrinking = false;');
    if (industry) ctx(`G.state.flags.jobIndustry = '${industry}';`);
    // v1.4: 教培必须带细分才命中——layoffChance 经 jobProfile.subsector
    // 传细分；不带细分的教培返回 0（见 test-v17 V17-23）。
    if (subsector) ctx(`G.state.flags.jobProfile = { employerType: 'startup', sector: 'education', sectorName: '${industry}', subsector: '${subsector}', policyExposure: true, salaryAnnual: 10, startTurn: 5 };`);
    return ctx('layoffChance(G.state)');
  };
  check('T9-04 layoffChance 2014 cohort (crisis 2022) score 0 + 互联网 -> 28', chanceFor(2014, '互联网') === 28);
  check('T9-04 layoffChance 2014 cohort score 0, no industry -> 23', chanceFor(2014, null) === 23);
  check('T9-04 layoffChance 2013 cohort (crisis 2021) score 0 + 教培学科 -> 32', chanceFor(2013, '教培', false, 'k12_subject_tutoring') === 32);
  check('T9-04 layoffChance 2015 cohort (crisis 2023) score 0 + 地产 -> 20', chanceFor(2015, '地产') === 20);
  check('T9-04 layoffChance legacy (no era) score 0 -> 20, score 4 -> 80', (() => {
    ctx(`G = { state: newRun(12345, { difficulty: 'normal' }), rng: makeRng(12345), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 };
      G.state.origin = { familyKey: 'model' };
      G.state.flags.highPay = false; G.state.flags.hasProtector = true; G.state.flags.lowKpi = false; G.state.flags.deptShrinking = false;`);
    const c0 = ctx('layoffChance(G.state)');
    ctx('G.state.flags.highPay = true; G.state.flags.hasProtector = false; G.state.flags.lowKpi = true; G.state.flags.deptShrinking = true;');
    return c0 === 20 && ctx('layoffChance(G.state)') === 80;
  })());
  check('T9-04 layoffChance clamps at 85 (score 4 + 2022 + 互联网 = 88 -> 85)', chanceFor(2014, '互联网', true) === 85);
  check('T9-08 eraContextFor unifies the years (2015 cohort, T9)', (() => {
    eraState({ birthYear: 1997, examYear: 2015 });
    const ec = ctx('eraContextFor(G.state, 9)');
    return ec.examYear === 2015 && ec.calendarYear === 2023 && ec.age === 26 && ec.gradYear === 2019 && ec.crisisYear === 2023;
  })());
  // t9Branch: the H2 die decides laid-off vs kept; the branch shapes the aftermath.
  const branchFor = (setup) => {
    eraState({ birthYear: 1995, examYear: 2013 });
    ctx(`G.state.flags.h2 = { chance: 35, roll: 90, laidOff: ${setup.laidOff ? 'true' : 'false'} };`);
    if (setup.industryDown) ctx('G.state.flags.industryDown = true;');
    if (setup.hr) ctx(`G.state.decisions['hr-talk'] = { text: '争取内部转岗', seal: 'x' };`);
    if (setup.startup) ctx(`G.state.flags.employment = 'startup';`);
    if (setup.venture) ctx(`G.state.ventures = [{ id: 'v1', name: 'x', archetype: 'ai-tool', status: 'active', stage: 1, createdTurn: 2 }];`);
    if (setup.grad) ctx('G.state.flags.gradSchool = true;');
    return ctx('t9Branch(G.state)');
  };
  check('T9-05 branch laid-off when H2 says so', branchFor({ laidOff: true }) === 'laid-off');
  check('T9-05 branch transfer when kept + 谈转岗', branchFor({ laidOff: false, hr: true }) === 'transfer');
  check('T9-05 branch restructure when kept + industryDown', branchFor({ laidOff: false, industryDown: true }) === 'restructure');
  check('T9-05 branch pivot when kept + nothing else', branchFor({ laidOff: false }) === 'pivot');
  check('T9-05 branch startup when employment is startup', branchFor({ laidOff: false, startup: true }) === 'startup');
  check('T9-05 branch startup when a venture is live', branchFor({ laidOff: false, venture: true }) === 'startup');
  check('T9-05 branch grad when gradSchool flag set', branchFor({ laidOff: false, grad: true }) === 'grad');
  // enterSlice seals the crisis; H2 is sealed once, not re-rolled.
  eraState({ birthYear: 1995, examYear: 2013 });
  ctx('enterSlice()');
  check('T9-06 enterSlice seals t9Crisis 2013 -> 2021 双减', (() => { const c = ctx('G.state.flags.t9Crisis'); return c && c.crisisYear === 2021 && c.label === '双减' && c.fictional === false; })(), JSON.stringify(ctx('G.state.flags.t9Crisis')));
  check('T9-06 slice screen shows the crisis background', screenHtml().includes('2021 年双减'));
  const h2first = JSON.stringify(ctx('G.state.flags.h2'));
  ctx('enterSlice()');
  check('T9-06 re-entering the slice does not re-roll H2', JSON.stringify(ctx('G.state.flags.h2')) === h2first);
  // v1.2 (P0-1): exiting the slice after the second decision resumes at
  // the second decision — sliceStep is preserved, not reset to 0.
  click('slice-pick', '0');
  click('slice-next');
  check('T9-06b after one decision + next, sliceStep is 1 (second decision)', ctx('G.state.sliceStep') === 1);
  ctx('enterSlice()');
  check('T9-06c re-entering the slice resumes at the second decision (sliceStep still 1, H2 unchanged)', ctx('G.state.sliceStep') === 1 && JSON.stringify(ctx('G.state.flags.h2')) === h2first && screenHtml().includes('第 2 个决定'));
  // H3 does not double-penalise: a shock-tier era event this turn skips the H3 roll.
  eraState({ birthYear: 1997, examYear: 2015, turn: 6 });
  ctx(`G.state.major = { name: '计算机', source: 'self', tier: '一本' };`);
  ctx('G.rng = ({ next: () => 0.5, int: (a) => a, chance: () => true, float: (a) => a, pick: (arr) => arr[0], weighted: (e) => e[0][0], shuffle: (a) => a.slice(), getState: () => 0, setState: () => {} })');
  ctx('startYear(6)');
  check('T9-07 shock year (2020 疫情） skips H3: industryDown stays false', ctx('G.state.flags.industryDown') !== true, 'industryDown=' + ctx('G.state.flags.industryDown'));
  check('T9-07 the 2020 shock event did apply (eraLog)', ctx('eraLogForTurn(G.state, 6)').some((e) => e.event === '新冠疫情与武汉封城' && e.tier === 'shock'));
  eraState({ birthYear: 1995, examYear: 2013, turn: 2 });
  ctx('G.rng = ({ next: () => 0.5, int: (a) => a, chance: () => true, float: (a) => a, pick: (arr) => arr[0], weighted: (e) => e[0][0], shuffle: (a) => a.slice(), getState: () => 0, setState: () => {} })');
  ctx('startYear(2)');
  check('T9-07 no-shock year (2014) still fires H3 with chance true', ctx('G.state.flags.industryDown') === true && ctx('G.state.flags.industryDownYears') === 2, 'industryDown=' + ctx('G.state.flags.industryDown'));
}

// ---------- (c) future scenario generator ----------
{
  const F = ctx('({ futureTrendsForYear, futureScenarioForYear, generateFictionalScenario, quietYearScenario })');
  const labels2027 = F.futureTrendsForYear(2027).map((l) => l.label);
  check('FU-01 2027 has exactly the 3 settled trends', labels2027.length === 3 && labels2027.includes('AI 替代白领初级岗') && labels2027.includes('房地产长期下行') && labels2027.includes('考公考编热'), labels2027.join('|'));
  check('FU-01 trend lines are all fictional: true', F.futureTrendsForYear(2027).every((l) => l.fictional === true));
  check('FU-02 2028/2029/2030 each have 3 lines; 2026/2031 have none', F.futureTrendsForYear(2028).length === 3 && F.futureTrendsForYear(2029).length === 3 && F.futureTrendsForYear(2030).length === 3 && F.futureTrendsForYear(2026).length === 0 && F.futureTrendsForYear(2031).length === 0);
  const allTrendText = [2027, 2028, 2029, 2030].map((y) => F.futureTrendsForYear(y).map((l) => l.text).join('')).join('');
  check('FU-03 trend lines: no company names / policy names / amounts', !/阿里|腾讯|华为|字节|美团|拼多多|京东|百度|小米|网易|双减|万/.test(allTrendText), allTrendText.slice(0, 120));
  check('FU-03 each trend line is one sentence', [2027, 2028, 2029, 2030].every((y) => F.futureTrendsForYear(y).every((l) => (l.text.match(/。/g) || []).length === 1 && l.text.endsWith('。'))));
  // 2031+ triggers (priority: industry > venture > commitment-due > low support).
  eraState({ birthYear: 2008, examYear: 2026, turn: 6 });
  ctx('G.state.flags.industryDown = true;');
  check('FU-04 2031 industryDown -> industry-shakeout scenario', (() => { const s = F.futureScenarioForYear(ctx('G.state'), 2031); return s.type === 'scenario' && s.id === 'industry-shakeout' && s.fictional === true; })());
  eraState({ birthYear: 2008, examYear: 2026, turn: 6 });
  ctx(`G.state.ventures = [{ id: 'v1', name: 'x', archetype: 'ai-tool', status: 'active', stage: 1, createdTurn: 2 }];`);
  check('FU-04 2031 live venture -> venture-headwind scenario', (() => { const s = F.futureScenarioForYear(ctx('G.state'), 2031); return s.type === 'scenario' && s.id === 'venture-headwind' && s.fictional === true; })());
  eraState({ birthYear: 2008, examYear: 2026, turn: 6 });
  ctx(`G.state.commitments.C = { text: 'x', signedAt: 'T4', dueTurn: 6, snapshot: {} };`);
  check('FU-04 2031 commitment due this turn -> commitment-due scenario', (() => { const s = F.futureScenarioForYear(ctx('G.state'), 2031); return s.type === 'scenario' && s.id === 'commitment-due' && s.fictional === true; })());
  eraState({ birthYear: 2008, examYear: 2026, familyKey: 'orphan', turn: 6, econ: { tier: 'E1', cash: 3, min: 2, max: 8, label: 'E1 · 2–8万' } });
  check('FU-04 2031 thin family support (0.9 < 2) -> family-strain scenario', (() => { const s = F.futureScenarioForYear(ctx('G.state'), 2031); return s.type === 'scenario' && s.id === 'family-strain' && s.fictional === true; })());
  eraState({ birthYear: 2008, examYear: 2026, turn: 6 });
  check('FU-04 2031 no trigger -> quiet year (env + family lines)', (() => { const s = F.futureScenarioForYear(ctx('G.state'), 2031); return s.type === 'quiet' && s.fictional === true && typeof s.env === 'string' && s.env.length > 0 && typeof s.family === 'string' && s.family.length > 0; })());
  // Wired into applyEraForTurn (idempotent, lands in eraLog).
  eraState({ birthYear: 2008, examYear: 2026, turn: 2 });
  const applied = ctx('applyEraForTurn(G.state, G.rng, 2)');
  check('FU-05 2027 applies 3 trend entries, all fictional', applied.length === 3 && applied.every((e) => e.fictional === true) && applied.every((e) => e.text.includes('（未来推演·虚构）')), JSON.stringify(applied.map((e) => e.event)));
  check('FU-05 eraLog for turn 2 holds the 3 trend lines', ctx('eraLogForTurn(G.state, 2)').length === 3);
  check('FU-05 second apply is idempotent (nothing twice)', ctx('applyEraForTurn(G.state, G.rng, 2)').length === 0);
  eraState({ birthYear: 2008, examYear: 2026, turn: 6 });
  const quiet = ctx('applyEraForTurn(G.state, G.rng, 6)');
  check('FU-06 2031 quiet year applies 2 entries (env + family)', quiet.length === 2 && quiet.some((e) => e.event === 'quiet-env') && quiet.some((e) => e.event === 'quiet-family') && quiet.every((e) => e.fictional === true), JSON.stringify(quiet.map((e) => e.event)));
  eraState({ birthYear: 2008, examYear: 2026, turn: 6 });
  ctx('G.state.flags.industryDown = true;');
  const shock2031 = ctx('applyEraForTurn(G.state, G.rng, 6)');
  check('FU-07 2031 with industryDown applies 1 scenario entry', shock2031.length === 1 && shock2031[0].event === 'industry-shakeout' && shock2031[0].fictional === true);
}

// ---------- (d) H0 tamper conditions ----------
{
  const H = ctx('({ h0SystemForYear, h0TamperFactors, isH0Tampered })');
  check('H0-01 system: 2010/2012 onsite, 2013/2020 online', H.h0SystemForYear(2010) === 'onsite' && H.h0SystemForYear(2012) === 'onsite' && H.h0SystemForYear(2013) === 'online' && H.h0SystemForYear(2020) === 'online');
  const tamperedFor = (familyKey, h0value, examYear, confirmed) => {
    eraState({ birthYear: examYear - 18, examYear, familyKey });
    ctx(`G.state.sealed.H0 = { value: ${h0value}, omens: [] };`);
    if (confirmed) ctx('G.state.flags.t1Confirmed = true;');
    return H.isH0Tampered(ctx('G.state'));
  };
  check('H0-02 model + H0 70 + 2015 -> tampered', tamperedFor('model', 70, 2015) === true);
  check('H0-02 npd + H0 70 -> tampered', tamperedFor('npd', 70, 2015) === true);
  check('H0-02 absentFather + H0 70 -> tampered', tamperedFor('absentFather', 70, 2015) === true);
  check('H0-02 orphan + H0 70 -> NOT tampered (no account)', tamperedFor('orphan', 70, 2015) === false);
  check('H0-02 absentBoth + H0 70 -> NOT tampered (no account)', tamperedFor('absentBoth', 70, 2015) === false);
  check('H0-02 model + H0 50 -> NOT tampered (weak H0)', tamperedFor('model', 50, 2015) === false);
  check('H0-02 model + H0 70 + player confirmed -> NOT tampered', tamperedFor('model', 70, 2015, true) === false);
  check('H0-02 model + H0 70 + 2010 onsite -> still tampered (mechanism differs, not the verdict)', tamperedFor('model', 70, 2010) === true);
  check('H0-02 factors expose system + remedy window', (() => {
    eraState({ birthYear: 1997, examYear: 2015, familyKey: 'model' });
    ctx('G.state.sealed.H0 = { value: 70, omens: [] };');
    const f = H.h0TamperFactors(ctx('G.state'));
    return f.h0 === 70 && f.parentsHaveAccount === true && f.system === 'online' && f.playerConfirmed === false && f.choiceMade === false && f.remedyAvailable === true;
  })());
  // UI: the mechanism text matches the year; the remedy is the pick itself.
  toT1Era(2015, 70, 'model');
  check('H0-03 2015 tampered screen names 师范 + online mechanism', screenHtml().includes('第一志愿已经被改成了省内师范') && screenHtml().includes('账号密码在父母手里'));
  toT1Era(2010, 70, 'model');
  check('H0-04 2010 tampered screen names 师范 + onsite mechanism (no 2026 UI logic)', screenHtml().includes('第一志愿已经被改成了省内师范') && screenHtml().includes('学校机房') && !screenHtml().includes('账号密码在父母手里'));
  toT1Era(2015, 70, 'orphan');
  check('H0-05 orphan H0 70 screen lets the player fill it themselves', screenHtml().includes('让你自己填') && !screenHtml().includes('第一志愿已经被改成了'));
  toT1Era(2015, 70, 'model');
  ctx(`document.querySelector('#t1-major').value = '计算机';`);
  click('t1-pick', 'insist');
  check('H0-06 v1.1 draft only: choice made but NOT confirmed, tamper still open', ctx('G.state.flags.t1ChoiceMade') === true && ctx('G.state.flags.t1Confirmed') !== true && H.isH0Tampered(ctx('G.state')) === true && screenHtml().includes('还没提交确认') && screenHtml().includes('坚持自己'));
  click('t1-confirm');
  check('H0-06 v1.1 submit confirms the填报: t1Confirmed set, tamper ends', ctx('G.state.flags.t1Confirmed') === true && H.isH0Tampered(ctx('G.state')) === false);
  // Draft-then-redraft returns to "no choice made" (no stale draft).
  toT1Era(2015, 70, 'model');
  ctx(`document.querySelector('#t1-major').value = '计算机';`);
  click('t1-pick', 'insist');
  click('t1-redraft');
  check('H0-06 v1.1 redraft clears the draft, tamper still open, nothing confirmed', ctx('G.state.flags.t1ChoiceMade') === false && ctx('G.state.flags.t1Confirmed') !== true && H.isH0Tampered(ctx('G.state')) === true && !screenHtml().includes('提交确认'));
}

// ---------- (e) school-tier simulation + 调剂 as its own mechanism ----------
{
  const E = ctx('({ demandPremiumForMajor, bestReachableMajorInTier, simulateSchoolTier, offCampusFallback, resolveAdmission })');
  check('ADJ-01 demand premiums: 临床100 计算机80 金融60 法学50 会计40 新闻30 师范20 土木10 英语10 艺术0', E.demandPremiumForMajor('临床医学') === 100 && E.demandPremiumForMajor('计算机') === 80 && E.demandPremiumForMajor('金融') === 60 && E.demandPremiumForMajor('法学') === 50 && E.demandPremiumForMajor('会计') === 40 && E.demandPremiumForMajor('新闻传播') === 30 && E.demandPremiumForMajor('师范') === 20 && E.demandPremiumForMajor('土木') === 10 && E.demandPremiumForMajor('英语') === 10 && E.demandPremiumForMajor('艺术设计') === 0);
  check('ADJ-01 unknown major uses default premium 30', E.demandPremiumForMajor('天文学') === 30);
  check('ADJ-02 best reachable in tier: 610 vs 一本606 -> 艺术设计 (only premium 0 fits)', E.bestReachableMajorInTier(610, 606) === '艺术设计');
  check('ADJ-02 best reachable in tier: 590 vs 二本578 -> 土木', E.bestReachableMajorInTier(590, 578) === '土木');
  const row2021 = ctx(`lookupLine('shandong', 2021, '不分')`);
  check('ADJ-03 merged tier sim: 544 -> 高资源本科 k1.30; 543 -> 本科 k1.10; 443 -> null', (() => {
    const hi = E.simulateSchoolTier(row2021, 544); const lo = E.simulateSchoolTier(row2021, 543);
    return hi && hi.name === '高资源本科' && hi.k === 1.30 && lo && lo.name === '本科' && lo.k === 1.10 && E.simulateSchoolTier(row2021, 443) === null;
  })());
  const row2015 = ctx(`lookupLine('shandong', 2015, '文')`);
  check('ADJ-03 split row: no tier simulation (real tiers exist)', E.simulateSchoolTier(row2015, 700) === null && E.simulateSchoolTier({}, 700) === null);
  // resolveEraAdmission (山东 verified rows: 2010 文 一本606/二本578; 2015 文 568/510; 2021 不分 本科444/专科150).
  const r610 = eraAdm(2010, '文', 610, '计算机');
  check('ADJ-04 2010 文 610 计算机 -> 一本 k1.30, 调剂 to 艺术设计 (k unchanged)', r610.tier === '一本' && r610.k === 1.30 && r610.major === '艺术设计' && r610.adjusted === true, JSON.stringify(r610));
  const r590 = eraAdm(2010, '文', 590, '计算机');
  check('ADJ-04 2010 文 590 计算机 -> 二本 k1.10, 调剂 to 土木', r590.tier === '二本' && r590.k === 1.10 && r590.major === '土木' && r590.adjusted === true, JSON.stringify(r590));
  const r700 = eraAdm(2010, '文', 700, '计算机');
  check('ADJ-04 2010 文 700 计算机 -> 一本, keeps major (686 <= 700)', r700.tier === '一本' && r700.k === 1.30 && r700.major === '计算机' && r700.adjusted === false, JSON.stringify(r700));
  const r600 = eraAdm(2015, '文', 600, '计算机');
  check('ADJ-04 2015 文 600 计算机 -> 一本 k1.30, 调剂 to 新闻传播', r600.tier === '一本' && r600.k === 1.30 && r600.major === '新闻传播' && r600.adjusted === true, JSON.stringify(r600));
  const r550 = eraAdm(2021, '不分', 550, '计算机');
  check('ADJ-04 2021 不分 550 计算机 -> 高资源本科 k1.30, keeps major', r550.tier === '高资源本科' && r550.k === 1.30 && r550.major === '计算机' && r550.adjusted === false, JSON.stringify(r550));
  const r460 = eraAdm(2021, '不分', 460, '计算机');
  check('ADJ-04 2021 不分 460 计算机 -> 本科 k1.10, 调剂 to 土木', r460.tier === '本科' && r460.k === 1.10 && r460.major === '土木' && r460.adjusted === true, JSON.stringify(r460));
  const r543 = eraAdm(2021, '不分', 543, '临床医学');
  check('ADJ-04 2021 不分 543 临床医学 -> 本科 (543 < 544 高资源线）, 调剂 to 计算机 (544 > 543)', r543.tier === '本科' && r543.k === 1.10 && r543.major === '计算机' && r543.adjusted === true, JSON.stringify(r543));
  const r544 = eraAdm(2021, '不分', 544, '临床医学');
  check('ADJ-04 2021 不分 544 临床医学 -> 高资源本科， keeps major (544 <= 544)', r544.major === '临床医学' && r544.adjusted === false, JSON.stringify(r544));
  const rObey = eraAdm(2010, '文', 610, '省内师范');
  check('ADJ-04 parents’ pick 省内师范 is never 调剂', rObey.major === '省内师范' && rObey.adjusted === false && rObey.tier === '一本', JSON.stringify(rObey));
  const r100 = eraAdm(2020, '不分', 100, '计算机');
  check('ADJ-04 2020 不分 100 -> 落榜 k1.0', r100.tier === '落榜' && r100.k === 1.0 && r100.adjusted === false, JSON.stringify(r100));
  // Legacy resolveAdmission: 调剂 keeps the stance k.
  const leg = (base) => ctx(`resolveAdmission({ flags: { gaokao: { base: ${base}, line1: 442 } } }, '计算机', 1.3)`);
  const lr500 = leg(500);
  check('ADJ-05 legacy 500 计算机 -> 调剂 to 土木， k stays 1.3 (not 1.0)', lr500.major === '土木' && lr500.tier === '本科（调剂）' && lr500.k === 1.3 && lr500.adjusted === true, JSON.stringify(lr500));
  const lr600 = leg(600);
  check('ADJ-05 legacy 600 计算机 -> 本科 k1.3, keeps major', lr600.major === '计算机' && lr600.tier === '本科' && lr600.k === 1.3 && lr600.adjusted === false);
  const lr400 = leg(400);
  check('ADJ-05 legacy 400 -> 专科 k0.8', lr400.tier === '专科' && lr400.k === 0.8 && lr400.adjusted === false);
  // UI: era 调剂 costs stress +8, unlocks 转专业， k untouched.
  t1EraSetup(2010, 610, '计算机');
  check('ADJ-06 era UI 调剂： major 艺术设计， 一本 k1.30, stress +8 (20 -> 28), flags set', ctx('G.state.major').name === '艺术设计' && ctx('G.state.major').tier === '一本' && ctx('G.state.flags.majorK') === 1.30 && ctx('G.state.attrs.stress') === 28 && ctx('G.state.flags.adjusted') === true && ctx('G.state.flags.adjustedFrom') === '计算机', JSON.stringify(ctx('G.state.major')) + ' stress=' + ctx('G.state.attrs.stress'));
  check('ADJ-06 signed card mentions 转专业', screenHtml().includes('转专业'));
  check('ADJ-06 高资源本科 gets degreeBonus +0.5', (() => { t1EraSetup(2021, 550, '计算机'); return ctx('G.state.flags.degreeBonus') === 0.5 && ctx('G.state.major').tier === '高资源本科'; })());
  // UI: legacy 调剂.
  ctx(`G = { state: newRun(12345, { difficulty: 'normal' }), rng: makeRng(12345), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 };
    G.state.origin = { familyKey: 'model', attrs: { money: 5, health: 85, stress: 10 } };
    G.state.flags.gaokao = { region: 'shandong', base: 500, line1: 442, specialLine: 568 };
    G.state.flags.familySafety = '家里能接住你一次，但只有一次。';`);
  ctx('screenT1()');
  ctx(`document.querySelector('#t1-major').value = '计算机';`);
  click('t1-pick', 'insist');
  click('t1-confirm'); // v1.1 (d): pick is a draft; submit to execute.
  check('ADJ-07 legacy UI 调剂： major 土木， k 1.3, stress +8 (20 -> 28)', ctx('G.state.major').name === '土木' && ctx('G.state.flags.majorK') === 1.3 && ctx('G.state.attrs.stress') === 28 && ctx('G.state.flags.adjusted') === true, JSON.stringify(ctx('G.state.major')) + ' stress=' + ctx('G.state.attrs.stress'));
  // 转专业 action: 1 AP, 50%, once per year, T2–T4 only.
  const transferSetup = (turn, roll) => {
    eraState({ birthYear: 1995, examYear: 2013, turn });
    ctx(`G.state.major = { name: '土木', source: 'self', tier: '一本' }; G.state.flags.adjusted = true; G.state.flags.adjustedFrom = '计算机'; G.state.ap = 3; G.state.attrs.stress = 20;`);
    ctx(`G.rng = ({ next: () => 0.5, int: (a,b) => ${roll}, chance: () => true, float: (a) => a, pick: (arr) => arr[0], weighted: (e) => e[0][0], shuffle: (a) => a.slice(), getState: () => 0, setState: () => {} })`);
  };
  transferSetup(2, 30);
  check('ADJ-08 转专业 success (roll 30): major restored, adjusted cleared, 1 AP spent, stress unchanged', ctx('attemptTransferMajor(G.state, G.rng)') === true && ctx('G.state.major').name === '计算机' && ctx('G.state.flags.adjusted') === false && ctx('G.state.ap') === 2 && ctx('G.state.attrs.stress') === 20);
  check('ADJ-08 转专业 once per year: second attempt same turn refused', ctx('attemptTransferMajor(G.state, G.rng)') === false);
  transferSetup(2, 80);
  check('ADJ-08 转专业 fail (roll 80): major unchanged, stress +10, adjusted stays', ctx('attemptTransferMajor(G.state, G.rng)') === true && ctx('G.state.major').name === '土木' && ctx('G.state.attrs.stress') === 30 && ctx('G.state.flags.adjusted') === true && ctx('G.state.ap') === 2);
  transferSetup(5, 30);
  check('ADJ-08 转专业 not eligible at T5 (T2–T4 only)', ctx('attemptTransferMajor(G.state, G.rng)') === false && ctx('G.state.ap') === 3);
  eraState({ birthYear: 1995, examYear: 2013, turn: 2 });
  ctx(`G.state.major = { name: '土木', source: 'self', tier: '一本' }; G.state.flags.adjusted = true; G.state.flags.adjustedFrom = '计算机';`);
  ctx('G.rng = makeRng(1);');
  ctx('startYear(2)');
  check('ADJ-08 year screen shows the 转专业 action when adjusted', screenHtml().includes('转专业') && screenHtml().includes('转回计算机'));
  // 落榜调剂校外： one rung down, k −0.15.
  const row2020 = ctx(`lookupLine('shandong', 2020, '不分')`);
  check('ADJ-09 off-campus 2020 row (lowest 专科） -> 校外专科 k0.65', (() => { const o = E.offCampusFallback(row2020); return o.tier === '校外专科' && o.k === 0.65; })());
  check('ADJ-09 off-campus {tier2 only} -> 校外本科 k0.95', (() => { const o = E.offCampusFallback({ tier2: 444 }); return o.tier === '校外本科' && o.k === 0.95; })());
  check('ADJ-09 off-campus empty row -> 校外专科 k0.65', (() => { const o = E.offCampusFallback({}); return o.tier === '校外专科' && o.k === 0.65; })());
  check('ADJ-09 off-campus 2015 文 row (lowest 二本） -> 校外二本 k0.95', (() => { const o = E.offCampusFallback(row2015); return o.tier === '校外二本' && o.k === 0.95; })());
  // UI: 落榜 screen has the fourth button; clicking it lands in 校外专科.
  toT1Era(2021, 50, 'model', 100);
  ctx(`document.querySelector('#t1-major').value = '计算机';`);
  click('t1-pick', 'insist');
  click('t1-confirm'); // v1.1 (d): pick is a draft; submit to execute.
  check('ADJ-10 落榜 signed card offers 调剂校外 as a fourth way', screenHtml().includes('调剂校外') && screenHtml().includes('复读一年') && screenHtml().includes('等专科补录') && screenHtml().includes('先工作一年'));
  click('t1-fallback', 'offcampus');
  check('ADJ-10 调剂校外： tier 校外专科， k 0.65, major kept, flags set, enters T2', ctx('G.state.major').tier === '校外专科' && ctx('G.state.flags.majorK') === 0.65 && ctx('G.state.major').name === '计算机' && ctx('G.state.flags.offCampus') === true && ctx('G.state.flags.fallbackChoice') === 'offcampus' && screenHtml().includes('19 岁'), JSON.stringify(ctx('G.state.major')));
  check('ADJ-10 commitment A records the off-campus tier', ctx('G.state.commitments.A').text.includes('调剂校外') && ctx('G.state.commitments.A').snapshot.tier === '校外专科');
}

// ---------- (f) civil-service / NPC contact / foreign firms (recheck 2026-11-17) ----------
// Structure first: every number lives in a named table in era.js; the
// design doc's numbers (144万/259万 linear, 被嘲退路/最优解， 外企线
// 2015强/2018出海） are NOT used — the recheck corrected or rejected them.
{
  const F = ctx('({ civilServiceStats, civilServiceAppeal, civilServiceWeight, civilServiceNarrative, npcContactForYear, npcInstantChannel, foreignFirmVisibility })');
  // 考公 series: anchors only, interpolation flagged, no silent clamp.
  const s2010 = F.civilServiceStats(2010);
  check('CS-01 考公 2010 anchor: 审查 144.3万 / 招录 15526 / 比 93:1 / 实参 92.7万 / 实比 60:1, not interpolated', s2010 && s2010.applicants === 144.3 && s2010.planned === 15526 && s2010.ratio === 93 && s2010.actual === 92.7 && s2010.actualRatio === 60 && s2010.interpolated === false, JSON.stringify(s2010));
  const s2023 = F.civilServiceStats(2023);
  check('CS-01 考公 2023 anchor: 审查 259.77万 / 招录 37100 / 比 70:1 / 实参 152.5万 / 实比 41:1', s2023 && s2023.applicants === 259.77 && s2023.planned === 37100 && s2023.ratio === 70 && s2023.actual === 152.5 && s2023.actualRatio === 41 && s2023.interpolated === false, JSON.stringify(s2023));
  const s2019 = F.civilServiceStats(2019);
  check('CS-01 考公 2019 is interpolation (flagged): applicants 224.2 / planned 30462 / ratio 77.1', s2019 && s2019.interpolated === true && s2019.applicants === 224.2 && s2019.planned === 30462 && s2019.ratio === 77.1, JSON.stringify(s2019));
  check('CS-01 考公 outside anchors returns null (no silent clamp): 2005 / 2030', F.civilServiceStats(2005) === null && F.civilServiceStats(2030) === null);
  // Appeal bands (monotonic by design, v1.1 WorkBuddy recheck) by decision year.
  check('CS-02 考公吸引力： 2012 55 / 2015 58 / 2018 62 / 2020 68 / 2022 75 / 2025 78', F.civilServiceAppeal(2012) === 55 && F.civilServiceAppeal(2015) === 58 && F.civilServiceAppeal(2018) === 62 && F.civilServiceAppeal(2020) === 68 && F.civilServiceAppeal(2022) === 75 && F.civilServiceAppeal(2025) === 78);
  check('CS-02 吸引力单调递增： 2025 (78) > 2022 (75)', F.civilServiceAppeal(2025) > F.civilServiceAppeal(2022));
  check('CS-02 吸引力表外返回 null: 2009 / 2030', F.civilServiceAppeal(2009) === null && F.civilServiceAppeal(2030) === null);
  check('CS-02 权重是吸引力的 0-1 形式： 2012 0.55 / 2022 0.75 / 表外 null', F.civilServiceWeight(2012) === 0.55 && F.civilServiceWeight(2022) === 0.75 && F.civilServiceWeight(2030) === null);
  // Narrative replaces the rejected one-way story.
  check('CS-03 叙事 2015: 2010 年代中期已有较强竞争、市场化路线亦强', F.civilServiceNarrative(2015) === '2010 年代中期考公已有较强竞争，但市场化路线亦强。');
  check('CS-03 叙事 2022: 2020 年代初毕业生规模扩大、行业收缩、稳定选择', F.civilServiceNarrative(2022) === '2020 年代初因毕业生规模扩大、部分行业收缩，考公成为更多人眼中重要的稳定选择。');
  check('CS-03 叙事表外返回 null: 2030', F.civilServiceNarrative(2030) === null);
  // NPC contacts: coexistence, primacy order, never a single-channel swap.
  check('CS-04 2003: QQ/短信/电话/邮件/论坛', JSON.stringify(F.npcContactForYear(2003)) === JSON.stringify(['QQ', '短信', '电话', '邮件', '论坛']));
  check('CS-04 2008: QQ 仍首位，加 QQ空间/人人/博客/开心网，无微博', (() => { const c = F.npcContactForYear(2008); return c[0] === 'QQ' && c.includes('人人') && c.includes('博客') && c.includes('QQ空间') && c.includes('开心网') && !c.includes('微博'); })());
  check('CS-04 2010: 微博从 2010 年起可用，开心网仍在', (() => { const c = F.npcContactForYear(2010); return c[0] === 'QQ' && c.includes('微博') && c.includes('开心网'); })());
  check('CS-04 2011: 微信只是“早期微信”，QQ 仍是默认，含人人/微博', (() => { const c = F.npcContactForYear(2011); return c[0] === 'QQ' && c.includes('早期微信') && !c.includes('微信') && c.includes('人人') && c.includes('微博'); })());
  check('CS-04 2013: 微信首位 + QQ/短信/电话/微博/邮件/陌陌', (() => { const c = F.npcContactForYear(2013); return c[0] === '微信' && ['QQ', '短信', '电话', '微博', '邮件', '陌陌'].every((x) => c.includes(x)); })());
  check('CS-04 2015: 加 陌陌/钉钉/脉脉', (() => { const c = F.npcContactForYear(2015); return ['陌陌', '钉钉', '脉脉'].every((x) => c.includes(x)); })());
  check('CS-04 2018: 加 企业微信/抖音/小红书', (() => { const c = F.npcContactForYear(2018); return c.includes('企业微信') && c.includes('抖音') && c.includes('小红书'); })());
  check('CS-04 2022: 加 飞书/小红书；短信从未被删除', (() => { const c = F.npcContactForYear(2022); return c.includes('飞书') && c.includes('小红书') && c.includes('短信'); })());
  check('CS-04 短信在所有年份段都存在 (2003/2011/2015/2022)', [2003, 2011, 2015, 2022].every((y) => F.npcContactForYear(y).includes('短信')));
  check('CS-04b 探口风渠道： 2010/2012 用 QQ消息，2013/2023 用微信', F.npcInstantChannel(2010) === 'QQ消息' && F.npcInstantChannel(2012) === 'QQ消息' && F.npcInstantChannel(2013) === '微信' && F.npcInstantChannel(2023) === '微信');
  // Foreign firms: visibility weight by entry year; 2027+ fictional.
  check('CS-05 外企可见度： 2012 80 / 2015 82 / 2019 75 / 2021 70 / 2023 75 / 2025 75 (final adjudication 2026-11-20: 2014-17 is 82)', F.foreignFirmVisibility(2012).weight === 80 && F.foreignFirmVisibility(2015).weight === 82 && F.foreignFirmVisibility(2019).weight === 75 && F.foreignFirmVisibility(2021).weight === 70 && F.foreignFirmVisibility(2023).weight === 75 && F.foreignFirmVisibility(2025).weight === 75);
  check('CS-05 外企可见度 2027+ 为架空 (weight null, fictional true)', (() => { const f = F.foreignFirmVisibility(2028); return f.weight === null && f.fictional === true; })());
  check('CS-05 外企可见度 2010-2013 段内不虚构', F.foreignFirmVisibility(2012).fictional === false);
  // T5 line keys off the graduation year.
  eraState({ birthYear: 1997, examYear: 2015, turn: 5 });
  ctx('screenT5()');
  check('CS-06 T5 时代行 (2015 届→2019): 审查 224.2万（插值）+ 吸引力 62 + 2010 年代叙事 + 外企 75 + 微信/QQ/短信', screenHtml().includes('2019 年国考通过资格审查约 224.2 万人') && screenHtml().includes('插值估计') && screenHtml().includes('考公吸引力 62/100') && screenHtml().includes('2010 年代中期考公已有较强竞争') && screenHtml().includes('外企机会可见度 75/100') && screenHtml().includes('微信、QQ、短信'));
  eraState({ birthYear: 2001, examYear: 2019, turn: 5 });
  ctx('screenT5()');
  check('CS-06 T5 时代行 (2019 届→2023): 审查 259.77万 / 招录 37100 / 比 70:1 + 吸引力 75 + 2020 年代叙事 + 外企 75', screenHtml().includes('2023 年国考通过资格审查约 259.77 万人') && screenHtml().includes('计划招录 37100 人') && screenHtml().includes('审查比约 70:1') && screenHtml().includes('考公吸引力 75/100') && screenHtml().includes('2020 年代初因毕业生规模扩大') && screenHtml().includes('外企机会可见度 75/100'));
  // Slice contact substitution: the first decision IS call-laochen.
  eraState({ birthYear: 1984, examYear: 2002 });
  ctx('enterSlice()');
  check('CS-07 T9 2010 (crisis year) slice uses QQ消息， not 微信', screenHtml().includes('先发QQ消息探探口风') && !screenHtml().includes('微信'), screenHtml().slice(0, 200));
  check('CS-07 slice option seal uses QQ消息', ctx('G.sliceOptions')[1].seal.includes('QQ消息'));
  eraState({ birthYear: 1997, examYear: 2015 });
  ctx('enterSlice()');
  check('CS-07 T9 2023 slice keeps 微信', screenHtml().includes('先发微信探探口风'));
}

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
