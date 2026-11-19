'use strict';
// v0.7 chronicle + family-economy tests (ERA-16..ERA-25): the generated
// era-events module, E-tier rolls, conditional exposure routing (incl.
// the 1989 guard and the 2020 two-layer split), the 0-18 history with
// the 3-year shock throttle, yearly application, T1 self-funded /
// degreeBonus rules, the T9 borrow cap, 专升本， and legacy regression.
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
// Deterministic rng stub: chance(p) follows `rollPass`, int returns min.
function fakeRng(rollPass) {
  return {
    next: () => 0.5, int: (a) => a, chance: () => rollPass,
    float: (a) => a, pick: (arr) => arr[0],
    weighted: (e) => e[0][0], shuffle: (a) => a.slice(),
    getState: () => 0, setState: () => {},
  };
}
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

// ---------- ERA-16: generated chronicle module ----------
{
  const E = ctx('ERA_EVENTS');
  check('ERA-16 module has 69 rows, 67 verified / 2 to-verify', E.length === 69 && ctx('ERA_EVENTS_META').rows === 69 && ctx('ERA_EVENTS_META').verified === 67 && ctx('ERA_EVENTS_META').toVerify === 2);
  check('ERA-16 no 1989 row exists in the data', !E.some((e) => e.year === 1989));
  check('ERA-16 every row has cond + fx objects', E.every((e) => e.cond && typeof e.cond === 'object' && e.fx && typeof e.fx === 'object'));
  check('ERA-16 1997 下岗 shock carries its machine cond + fx', (() => { const r = E.find((e) => e.year === 1997 && e.event === '国企下岗潮' && e.ageMin === 0); return r && r.cond.roll === 0.35 && r.cond.soe === true && r.fx.money[0] === -8 && r.fx.money[1] === -3; })());
  check('ERA-16 2022 毕业生 carries offerMod -1', (() => { const r = E.find((e) => e.year === 2022 && e.event.indexOf('毕业生') >= 0); return r && r.fx.offerMod === -1 && r.cond.seeking === true; })());
}

// ---------- ERA-17: E-tier rolls ----------
{
  const rng = ctx('makeRng(7)');
  const tiers = {};
  let cashOk = true;
  for (let i = 0; i < 1000; i++) {
    const e = ctx('rollFamilyEcon')(rng);
    tiers[e.tier] = (tiers[e.tier] || 0) + 1;
    if (e.cash < e.min || e.cash > e.max) cashOk = false;
  }
  check('ERA-17 1000 rolls: all 5 tiers present, cash inside its range', Object.keys(tiers).length === 5 && cashOk, JSON.stringify(tiers));
  check('ERA-17 weights shape: E1 most common, E4 rare (<10%)', tiers.E1 > tiers.E0 && tiers.E1 > tiers.E2 && tiers.E4 < 100, JSON.stringify(tiers));
  const a = ctx('rollFamilyEcon')(ctx('makeRng(42)'));
  const b = ctx('rollFamilyEcon')(ctx('makeRng(42)'));
  check('ERA-17 same seed -> same tier + cash (deterministic)', a.tier === b.tier && a.cash === b.cash);
}

// ---------- ERA-18: family background + support capacity ----------
{
  const bg = ctx('rollFamilyBg')(ctx('makeRng(9)'), 'town', 'E1');
  check('ERA-18 town locale: not urban, no SOE, selfHouse possible', bg.urban === false && bg.soe === false && typeof bg.selfHouse === 'boolean');
  check('ERA-18 supportCash: E2 cash 20 model = 18 (0.9 willing)', ctx('supportCash')({ tier: 'E2', cash: 20 }, 'model') === 18);
  check('ERA-18 supportCash: E2 cash 20 orphan = 6 (0.5 x 0.6)', ctx('supportCash')({ tier: 'E2', cash: 20 }, 'orphan') === 6);
  check('ERA-18 familySafety three tiers', ctx('familySafetyText')({ cash: 20 }, 'model') === '家里能接住你一次，但只有一次。' && ctx('familySafetyText')({ cash: 5 }, 'model') === '家里能帮一点，但不多。' && ctx('familySafetyText')({ cash: 1 }, 'orphan') === '家里接不住你——这条路得你自己走。');
}

// ---------- ERA-19: conditional-exposure routing ----------
function routeCtx(o) {
  const base = { familyKey: 'model', homeRegion: 'jilin', bg: { locale: 'city', urban: true, soe: true, stocks: true, trading: true, selfHouse: false, medical: false }, econ: { tier: 'E2', cash: 20 }, examYear: 2013, turn: 1, employed: false, jobIndustry: null };
  return Object.assign(base, o || {});
}
{
  const evs = ctx('eventsForYear');
  const rngT = fakeRng(true);
  check('ERA-19 1997 下岗 applies with urban+soe (roll passes)', evs(1997, 5, routeCtx(), rngT, {}).some((e) => e.event === '国企下岗潮'));
  check('ERA-19 1997 下岗 blocked without SOE', !evs(1997, 5, routeCtx({ bg: { locale: 'city', urban: true, soe: false, stocks: true, trading: true, selfHouse: false, medical: false } }), rngT, {}).some((e) => e.event === '国企下岗潮'));
  check('ERA-19 1997 下岗 blocked when the roll fails', !evs(1997, 5, routeCtx(), fakeRng(false), {}).some((e) => e.event === '国企下岗潮'));
  check('ERA-19 1998 洪水 applies in 吉林， not in 山东', evs(1998, 5, routeCtx(), rngT, {}).some((e) => e.event === '长江特大洪水') && !evs(1998, 5, routeCtx({ homeRegion: 'shandong' }), rngT, {}).some((e) => e.event === '长江特大洪水'));
  check('ERA-19 2015 股灾 needs holdings', evs(2015, 15, routeCtx(), rngT, {}).some((e) => e.event === 'A股股灾') && !evs(2015, 15, routeCtx({ bg: { locale: 'city', urban: true, soe: true, stocks: false, trading: true, selfHouse: false, medical: false } }), rngT, {}).some((e) => e.event === 'A股股灾'));
  const e10 = evs(2020, 10, routeCtx(), rngT, {});
  const e25 = evs(2020, 25, routeCtx(), rngT, {});
  const e18 = evs(2020, 18, routeCtx(), rngT, {});
  check('ERA-19 2020 疫情 routes by age: 10 -> 0-18 row only', e10.length === 1 && e10[0].ageMax === 18);
  check('ERA-19 2020 疫情 routes by age: 25 -> 18-35 row only', e25.length === 1 && e25[0].ageMin === 18);
  check('ERA-19 2020 疫情: age 18 is the documented overlap (both rows)', e18.length === 2, JSON.stringify(e18.map((e) => e.ageMin + '-' + e.ageMax)));
  check('ERA-19 1989 returns nothing (hard guard)', evs(1989, 10, routeCtx(), rngT, {}).length === 0);
  check('ERA-19 待核实 rows never apply (2025 / 2026)', evs(2025, 25, routeCtx(), rngT, {}).length === 0 && evs(2026, 25, routeCtx(), rngT, {}).length === 0);
  check('ERA-19 2021 双减 never fires for our T5 jobs (no 教培）', evs(2021, 22, routeCtx({ turn: 5, employed: true, jobIndustry: '互联网' }), rngT, {}).filter((e) => e.event === '教培双减').length === 0);
}

// ---------- ERA-20: the 0-18 history + 3-year shock throttle ----------
{
  eraState();
  ctx('G.rng = ({ next: () => 0.5, int: (a) => a, chance: () => true, float: (a) => a, pick: (arr) => arr[0], weighted: (e) => e[0][0], shuffle: (a) => a.slice(), getState: () => 0, setState: () => {} })');
  const applied = ctx('applyEraHistory(G.state, G.rng)');
  const cash = ctx('G.state.flags.familyEcon.cash');
  const names = ctx('G.state.eraLog').map((e) => e.event);
  check('ERA-20 history: 1997 下岗 + 1998 洪水 hit family cash (20 -> 10)', cash === 10, 'cash=' + cash + ' log=' + JSON.stringify(names));
  check('ERA-20 history: 2008 金融危机 throttled (2007 牛市 within 3y)', !names.includes('全球金融危机') || names.filter((n) => n === '全球金融危机').length === 0, JSON.stringify(names));
  check('ERA-20 history: 1998 房改 NOT throttled (shock without money fx)', names.includes('住房制度改革房改'));
  check('ERA-20 history: 下岗 entry text carries the amount', ctx('G.state.eraLog').some((e) => e.text.indexOf('1997 年 国企下岗潮') === 0 && e.text.indexOf('−8') >= 0), JSON.stringify(ctx('G.state.eraLog').slice(0, 2)));
  check('ERA-20 history is idempotent (second call applies nothing)', ctx('applyEraHistory(G.state, G.rng)').length === 0);
  check('ERA-20 S3 screen shows the era section', (() => { ctx('screenFragments()'); return screenHtml().indexOf('时代大事记') >= 0; })());
}

// ---------- ERA-21: yearly application, 2022 offerMod, T9 borrow cap ----------
{
  eraState({ examYear: 2013, turn: 1, attrs: { money: 5, health: 85, stress: 10 } });
  ctx('G.rng = ({ next: () => 0.5, int: (a) => a, chance: () => true, float: (a) => a, pick: (arr) => arr[0], weighted: (e) => e[0][0], shuffle: (a) => a.slice(), getState: () => 0, setState: () => {} })');
  const applied = ctx('applyEraForTurn(G.state, G.rng, 1)');
  check('ERA-21 T1 year 2013: 雾霾 hits health (85 -> 80) + 余额宝 logged', ctx('G.state.attrs.health') === 80 && applied.length === 2, JSON.stringify(applied.map((e) => e.event)));
  check('ERA-21 eraLogForTurn reads back the year', ctx('eraLogForTurn(G.state, 1)').length === 2);
  // 2022 graduation cohort: exam 2018, turn 5.
  eraState({ birthYear: 2000, examYear: 2018, turn: 5, attrs: { skill: 60, express: 50, network: 50, money: 5, health: 80, stress: 10 } });
  ctx('G.rng = ({ next: () => 0.5, int: (a) => a, chance: () => true, float: (a) => a, pick: (arr) => arr[0], weighted: (e) => e[0][0], shuffle: (a) => a.slice(), getState: () => 0, setState: () => {} })');
  ctx('applyEraForTurn(G.state, G.rng, 5)');
  check('ERA-21 2022 毕业生 sets gradOfferMod -1', ctx('G.state.flags.gradOfferMod') === -1);
  check('ERA-21 offerTier drops 3 -> 2 with the 2022 mod', ctx('offerTier(G.state)') === 2);
  ctx('delete G.state.flags.gradOfferMod');
  check('ERA-21 offerTier is 3 without the mod', ctx('offerTier(G.state)') === 3);
  // T9 borrow cap.
  eraState({ attrs: { money: 0 } });
  const optsCapped = ctx('sliceBorrowOptions(G.state)');
  check('ERA-21 T9 borrow capped: E2 cash 20 model -> 2.7 万 (min(4,3) x 0.9)', optsCapped[0].text === '跟家里借 2.7 万', JSON.stringify(optsCapped.map((o) => o.text)));
  ctx('delete G.state.flags.familyEcon');
  const optsFree = ctx('sliceBorrowOptions(G.state)');
  check('ERA-21 T9 borrow uncapped without familyEcon (legacy)', optsFree[0].text === '跟家里借 3 万');
  eraState({ familyKey: 'orphan', econ: { tier: 'E0', cash: 0, min: 0, max: 2, label: 'E0 · 0–2万' }, attrs: { money: 0 } });
  const optsZero = ctx('sliceBorrowOptions(G.state)');
  check('ERA-21 T9 borrow cap 0 -> only the refuse option', optsZero.length === 1 && optsZero[0].text === '不借，自己扛', JSON.stringify(optsZero.map((o) => o.text)));
}

// ---------- ERA-22: T1 era rules (self-funded + degreeBonus) ----------
function t1Setup(base, cash, tier3row) {
  eraState({ birthYear: 2000, examYear: 2018, turn: 1, econ: { tier: 'E1', cash, min: 2, max: 8, label: 'E1 · 2–8万' } });
  ctx(`G.state.flags.gaokao = { region: 'jilin', base: ${base}, era: { birthYear: 2000, examYear: 2018, track: '理', mode: 'split' }, row: { tier1: 533, tier2: 405, tier3: 283, vocational: 150, regime: 'split', status: '已核实' } };`);
  ctx('screenT1()');
  ctx(`document.querySelector('#t1-major').value = '计算机';`);
  click('t1-pick', 'insist');
  click('t1-confirm');
}
{
  t1Setup(300, 5);
  check('ERA-22 三本 + cash 5 -> selfFunded + degreeBonus -0.5', ctx('G.state.flags.selfFunded') === true && ctx('G.state.flags.degreeBonus') === -0.5 && ctx('G.state.major.tier') === '三本', JSON.stringify(ctx('G.state.major')));
  check('ERA-22 signed card names the 三本 rule', screenHtml().indexOf('三本且家庭现金') >= 0);
  t1Setup(300, 10);
  check('ERA-22 三本 + cash 10 -> no selfFunded (family can pay)', ctx('G.state.flags.selfFunded') !== true && ctx('G.state.flags.degreeBonus') === -0.5);
  t1Setup(600, 5);
  check('ERA-22 一本 + cash 5 -> no selfFunded, degreeBonus +0.5', ctx('G.state.flags.selfFunded') !== true && ctx('G.state.flags.degreeBonus') === 0.5 && ctx('G.state.major.tier') === '一本');
  check('ERA-22 T1 region picker marks the home province （老家）', (() => { eraState({ birthYear: 2000, examYear: 2018 }); ctx('G.state.flags.gaokao = null;'); ctx('screenT1Region()'); return screenHtml().indexOf('（老家）') >= 0 && screenHtml().indexOf('吉林 · 2018 年高考（老家）') >= 0; })());
}

// ---------- ERA-23: 专升本 ----------
{
  eraState({ turn: 5 });
  ctx(`G.state.major = { name: '会计', source: 'self', tier: '专科' }; G.state.flags.degreeBonus = -0.5;`);
  ctx('G.rng = ({ next: () => 0.5, int: (a,b) => 30, chance: () => true, float: (a) => a, pick: (arr) => arr[0], weighted: (e) => e[0][0], shuffle: (a) => a.slice(), getState: () => 0, setState: () => {} })');
  check('ERA-23 专升本 success (roll 30): tier lifts, degreeBonus clears', ctx('attemptShengben(G.state, G.rng, 0)') === true && ctx('G.state.major.tier') === '本科（专升本）' && ctx('G.state.flags.degreeBonus') === 0 && ctx('G.state.flags.shengbenDone') === true);
  eraState({ turn: 5 });
  ctx(`G.state.major = { name: '会计', source: 'self', tier: '专科' }; G.state.flags.degreeBonus = -0.5;`);
  ctx('G.rng = ({ next: () => 0.5, int: (a,b) => 80, chance: () => true, float: (a) => a, pick: (arr) => arr[0], weighted: (e) => e[0][0], shuffle: (a) => a.slice(), getState: () => 0, setState: () => {} })');
  check('ERA-23 专升本 fail (roll 80): no lift, one attempt per year', ctx('attemptShengben(G.state, G.rng, 0)') === true && ctx('G.state.flags.shengbenDone') !== true && ctx('attemptShengben(G.state, G.rng, 0)') === false);
  eraState({ turn: 6, attrs: { money: 5 } });
  ctx(`G.state.major = { name: '会计', source: 'self', tier: '专科' }; G.state.flags.degreeBonus = -0.5; G.state.ap = 3;`);
  ctx('G.rng = ({ next: () => 0.5, int: (a,b) => 30, chance: () => true, float: (a) => a, pick: (arr) => arr[0], weighted: (e) => e[0][0], shuffle: (a) => a.slice(), getState: () => 0, setState: () => {} })');
  check('ERA-23 T6 attempt costs 1 AP', ctx('attemptShengben(G.state, G.rng, 1)') === true && ctx('G.state.ap') === 2 && ctx('G.state.flags.shengbenDone') === true);
  check('ERA-23 专升本 button hidden once done', (() => { ctx(`G.state.yearActions = []; G.state.currentEvent = { title: 't', body: 'b', options: [] };`); ctx('startYearRefresh()'); return screenHtml().indexOf('专升本') < 0; })());
}

// ---------- ERA-24/25: legacy regression + v0.6-era save without familyEcon ----------
{
  ctx(`G = { state: newRun(12345, { difficulty: 'normal' }), rng: makeRng(12345), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 };
    G.state.origin = { familyKey: 'model', attrs: { money: 5, health: 85, stress: 10 } };
    G.state.flags.familySafety = '家里能接住你一次，但只有一次。';`);
  check('ERA-24 legacy: no era -> no chronicle, no history', ctx('applyEraForTurn(G.state, G.rng, 2)').length === 0 && ctx('applyEraHistory(G.state, G.rng)').length === 0);
  check('ERA-24 legacy: S3 shows no era section', (() => { ctx(`G.state.origin.fragments = ['a','b','c']; G.state.origin.counter = false;`); ctx('screenFragments()'); return screenHtml().indexOf('时代大事记') < 0; })());
  check('ERA-24 legacy: T9 borrow uncapped', ctx('sliceBorrowOptions(G.state)')[0].text === '跟家里借 3 万');
  check('ERA-24 legacy: rollOrigin still returns homeRegion + econ + bg', (() => { const o = ctx('rollOrigin(G.rng, "normal")'); return o.homeRegion && o.econ && o.econ.tier && o.bg && typeof o.bg.soe === 'boolean'; })());
  // v0.6-era save: flags.era set, no familyEcon (rolled only from v0.7).
  ctx(`G.state.flags.era = { birthYear: 2000, examYear: 2018 };`);
  check('ERA-25 v0.6 save without familyEcon: yearly apply does not throw', (() => { try { ctx('applyEraForTurn(G.state, G.rng, 1)'); return true; } catch (e) { return false; } })());
  check('ERA-25 v0.6 save: era card renders (no events, no crash)', (() => { ctx('G.state.turn = 1;'); return ctx('eraYearCardHtml(G.state, 1)').indexOf('这一年') >= 0; })());
}

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
