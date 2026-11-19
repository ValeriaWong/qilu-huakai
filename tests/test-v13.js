'use strict';
// v1.0 settlement / redemption tests (S-xx):
// gambleChanceFrom formula + doc-sample check, tierLabel boundaries,
// h5Level, fResilience, obsessionScore (per-obsession boundaries,
// deductions, ending bands), counterfactualFlips (ordering, pressure
// flip, no-flip fallback, H6/H4 never flippable), redemptionCardHtml
// (C/E/F five grids + source labels), settlement screen + runsFinished
// once + the settlement analytics event (fields only: obsessionScore,
// ending — SPEC whitelist, no schema change).
// Harness: same vm sandbox + DOM stub as test-v12, plus a sendBeacon
// recorder so the settlement event can be inspected on the wire.
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
  navigator: {
    sendBeacon(url, body) { sandbox.sent.push({ url, body: JSON.parse(String(body)) }); return true; },
  },
  sent: [],
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
// Minimal state for the pure engine functions (no UI): attrs +
// obsessions + flags + sealed, exactly the shape obsessionScore /
// fResilience / counterfactualFlips read.
function bareState(o) {
  const opts = Object.assign({
    attrs: { money: 40, health: 70, skill: 70, express: 50, network: 60, influence: 20, stress: 20, debt: 0, family: 0 },
    obsessions: ['money', 'health'],
    flags: {},
    sealed: {},
    commitments: {},
    ventures: [],
  }, o || {});
  return opts;
}
const score = (o) => ctx('obsessionScore(' + JSON.stringify(bareState(o)) + ')');

// ---------- S-01: gambleChanceFrom — the doc formula is normative ----------
// Doc sample (L330): skill 70, network 60, cash 40, partner +15, flat
// cycle, partner shares +8, tense −5. By the formula: 15+17.5+9+20+15
// +8−5 = 79.5 → 80 — NOT the 66.5 the doc prints. Formula wins;
// the sample number is wrong (see engine.js comment, report pending).
{
  const sample = ctx(`gambleChanceFrom({ skill: 70, network: 60, money: 40, partnerMod: 15, industryDown: false, partnerShares: true, tier: 'tense' })`);
  check('S-01 doc sample recomputes to 80 by the formula (doc v1.2 says 79.5, UI shows 80%)', sample === 80, 'got ' + sample);
  check('S-02 calm tier, no mods: 15+17.5+9+20 = 61.5 -> 62', ctx(`gambleChanceFrom({ skill: 70, network: 60, money: 40, partnerMod: 0, industryDown: false, partnerShares: false, tier: 'calm' })`) === 62);
  check('S-03 money term caps at 20 (cash 100 -> min(20, 50) = 20)', ctx(`gambleChanceFrom({ skill: 0, network: 0, money: 100, partnerMod: 0, industryDown: false, partnerShares: false, tier: 'calm' })`) === 35, '15+0+0+20 = 35');
  check('S-04 money term below cap: cash 10 -> +5', ctx(`gambleChanceFrom({ skill: 0, network: 0, money: 10, partnerMod: 0, industryDown: false, partnerShares: false, tier: 'calm' })`) === 20);
  check('S-05 industry down −15', ctx(`gambleChanceFrom({ skill: 70, network: 60, money: 40, partnerMod: 0, industryDown: true, partnerShares: false, tier: 'calm' })`) === 47, '62−15 = 47');
  check('S-06 break tier −12 (not −5)', ctx(`gambleChanceFrom({ skill: 70, network: 60, money: 40, partnerMod: 0, industryDown: false, partnerShares: false, tier: 'break' })`) === 50, '62−12 = 50');
  check('S-07 H6 < 35 partnerMod −25', ctx(`gambleChanceFrom({ skill: 70, network: 60, money: 40, partnerMod: -25, industryDown: false, partnerShares: false, tier: 'calm' })`) === 37);
  check('S-08 H6 35–60 partnerMod −10 (formula wins over the H6 table −20)', ctx(`gambleChanceFrom({ skill: 70, network: 60, money: 40, partnerMod: -10, industryDown: false, partnerShares: false, tier: 'calm' })`) === 52);
  check('S-09 clamp low: 15−25−15−12 = −37 -> 5', ctx(`gambleChanceFrom({ skill: 0, network: 0, money: 0, partnerMod: -25, industryDown: true, partnerShares: false, tier: 'break' })`) === 5);
  check('S-10 clamp high: 15+25+15+20+15+8 = 98 -> 85', ctx(`gambleChanceFrom({ skill: 100, network: 100, money: 100, partnerMod: 15, industryDown: false, partnerShares: true, tier: 'calm' })`) === 85);
  check('S-11 gambleChance(state) reads flags: partnerMod + industryDown + partnerShares + tier', ctx(`gambleChance({ attrs: { skill: 70, network: 60, money: 40, stress: 50 }, flags: { partnerMod: 15, industryDown: false, partnerShares: true } })`) === 80, 'stress 50 = tense, same as S-01');
}

// ---------- S-12: tierLabel boundaries (external display: three tiers only) ----------
{
  check('S-12 tier 0 -> 没什么底', ctx(`tierLabel(0)`) === '没什么底');
  check('S-13 tier 34 -> 没什么底', ctx(`tierLabel(34)`) === '没什么底');
  check('S-14 tier 35 -> 五五开', ctx(`tierLabel(35)`) === '五五开');
  check('S-15 tier 60 -> 五五开', ctx(`tierLabel(60)`) === '五五开');
  check('S-16 tier 61 -> 有戏', ctx(`tierLabel(61)`) === '有戏');
  check('S-17 tier 85 -> 有戏', ctx(`tierLabel(85)`) === '有戏');
}

// ---------- S-20: h5Level ----------
{
  check('S-20 no seal yet -> level 1 (safe default)', ctx(`h5Level({ sealed: {}, flags: {} })`) === 1);
  check('S-21 sealed 3, no checkup -> 3', ctx(`h5Level({ sealed: { H5: { value: 3 } }, flags: {} })`) === 3);
  check('S-22 sealed 3 + checkup -> 2', ctx(`h5Level({ sealed: { H5: { value: 3 } }, flags: { h5Checkup: true } })`) === 2);
  check('S-23 sealed 1 + checkup floors at 1', ctx(`h5Level({ sealed: { H5: { value: 1 } }, flags: { h5Checkup: true } })`) === 1);
}

// ---------- S-30: fResilience (three-pick-two) ----------
{
  const res = (o) => ctx('fResilience(' + JSON.stringify(o) + ')');
  const full = { attrs: { money: 30, health: 60 }, flags: { relationship: 'partner' }, sealed: { H4: { value: 61 } } };
  check('S-30 3/3 passes', res(full).pass === true && res(full).met.length === 3, JSON.stringify(res(full)));
  check('S-31 money + health, no partner -> passes (2/3)', res({ attrs: { money: 30, health: 60 }, flags: {}, sealed: {} }).pass === true);
  check('S-32 money + partner (H4 61), health 59 -> passes', res({ attrs: { money: 30, health: 59 }, flags: { relationship: 'partner' }, sealed: { H4: { value: 61 } } }).pass === true);
  check('S-33 partner + health, money 29 -> passes', res({ attrs: { money: 29, health: 60 }, flags: { relationship: 'partner' }, sealed: { H4: { value: 61 } } }).pass === true);
  check('S-34 money only (29? no: 30, health 59, no partner) -> fails 1/3', res({ attrs: { money: 30, health: 59 }, flags: {}, sealed: {} }).pass === false);
  check('S-35 0/3 fails', res({ attrs: { money: 0, health: 30 }, flags: {}, sealed: {} }).pass === false);
  check('S-36 H4 = 30 exactly counts as partner support', res({ attrs: { money: 0, health: 60 }, flags: { relationship: 'partner' }, sealed: { H4: { value: 30 } } }).pass === true);
  check('S-37 H4 = 29 does NOT count as partner support (只想解决自己的问题）', res({ attrs: { money: 0, health: 60 }, flags: { relationship: 'partner' }, sealed: { H4: { value: 29 } } }).pass === false);
  check('S-38 partner flag without a sealed H4 does not count', res({ attrs: { money: 0, health: 60 }, flags: { relationship: 'partner' }, sealed: {} }).pass === false);
  check('S-39 boundaries are >=: money 29 fails the money leg', res({ attrs: { money: 29, health: 60 }, flags: {}, sealed: {} }).met.join() === 'health');
}

// ---------- S-40: obsessionScore — multi-factor indicators (v1.2 P1-6) ----------
// Each obsession is 0–3 from FOUR binary indicators (min(3, met)).
// NOTE: score() shallow-merges, so a passed `attrs` REPLACES the whole
// attrs object — unspecified attrs read as 0. Each check below names the
// indicators it exercises, so a boundary is never an accident of defaults.
{
  // money: [cash>=30, debt<=2, incomeStable, net money-debt*5>=20]
  check('S-40 money 30 -> 3 (cash + debt-tolerance + net)', score({ obsessions: ['money'], attrs: { money: 30 } }).per.money === 3);
  check('S-41 money 29 -> 2 (cash drops out, debt + net stay)', score({ obsessions: ['money'], attrs: { money: 29 } }).per.money === 2);
  check('S-42 money 10 -> 1 (only debt-tolerance)', score({ obsessions: ['money'], attrs: { money: 10 } }).per.money === 1);
  check('S-43 money 9 -> 1 (only debt-tolerance)', score({ obsessions: ['money'], attrs: { money: 9 } }).per.money === 1);
  check('S-44 money 0 -> 1 (only debt-tolerance)', score({ obsessions: ['money'], attrs: { money: 0 } }).per.money === 1);
  check('S-45 money -1 -> 1 (negative cash still has debt-tolerance)', score({ obsessions: ['money'], attrs: { money: -1 } }).per.money === 1);
  check('S-42b money 20 -> 2 (debt + net)', score({ obsessions: ['money'], attrs: { money: 20 } }).per.money === 2);
  check('S-42c money 19 -> 1 (net drops out at 19)', score({ obsessions: ['money'], attrs: { money: 19 } }).per.money === 1);
  check('S-42d money 40 + debt 3 -> 2 (debt-tolerance drops out)', score({ obsessions: ['money'], attrs: { money: 40, debt: 3 } }).per.money === 2);
  check('S-42e money 0 + employed -> 2 (income stability counts)', score({ obsessions: ['money'], attrs: { money: 0 }, flags: { employment: 'employed' } }).per.money === 2);
  check('S-42f money 0 + influence 50 -> 2 (influence counts as income stability)', score({ obsessions: ['money'], attrs: { money: 0, influence: 50 } }).per.money === 2);
  // seen: [influence>=40, milestone/influence>=60, network>=40/partner/protector, influence>=20]
  check('S-46 seen 60 -> 3 (influence + milestone + >=20)', score({ obsessions: ['seen'], attrs: { influence: 60 } }).per.seen === 3);
  check('S-47 seen 59 -> 2 (milestone drops out)', score({ obsessions: ['seen'], attrs: { influence: 59 } }).per.seen === 2);
  check('S-48 seen 40 -> 2 (influence + >=20)', score({ obsessions: ['seen'], attrs: { influence: 40 } }).per.seen === 2);
  check('S-49 seen 20 -> 1 (only >=20)', score({ obsessions: ['seen'], attrs: { influence: 20 } }).per.seen === 1);
  check('S-50 seen 19 -> 0', score({ obsessions: ['seen'], attrs: { influence: 19 } }).per.seen === 0);
  check('S-48b seen 20 + network 40 -> 2 (support network counts)', score({ obsessions: ['seen'], attrs: { influence: 20, network: 40 } }).per.seen === 2);
  check('S-48c seen 20 + venture stage 1 -> 2 (recognized achievement counts)', score({ obsessions: ['seen'], attrs: { influence: 20 }, ventures: [{ status: 'active', stage: 1 }] }).per.seen === 2);
  // home: [stable housing, belonging, money>=10, debt<3 & money>=0]
  check('S-51 home family 2, no housing/money -> 2 (belonging + not-destitute)', score({ obsessions: ['home'], attrs: { family: 2 } }).per.home === 2);
  check('S-52 home family 1, no housing/money -> 2', score({ obsessions: ['home'], attrs: { family: 1 } }).per.home === 2);
  check('S-53 home family 0 -> 1 (only not-destitute)', score({ obsessions: ['home'], attrs: { family: 0 } }).per.home === 1);
  check('S-54 home family -1 -> 1 (only not-destitute)', score({ obsessions: ['home'], attrs: { family: -1 } }).per.home === 1);
  check('S-51b home rent + family 2 + money 40 -> 3 (all four)', score({ obsessions: ['home'], attrs: { family: 2, money: 40 }, flags: { housing: 'rent' } }).per.home === 3);
  check('S-51c home rent + network 50, no family -> 3 (belonging can be self-built)', score({ obsessions: ['home'], attrs: { network: 50, money: 40 }, flags: { housing: 'rent' } }).per.home === 3);
  check('S-51d home debt 3 breaks not-destitute (rent + family, money 5) -> 2', score({ obsessions: ['home'], attrs: { family: 2, money: 5, debt: 3 }, flags: { housing: 'rent' } }).per.home === 2);
  check('S-51e home same but debt 0 -> 3 (not-destitute holds)', score({ obsessions: ['home'], attrs: { family: 2, money: 5, debt: 0 }, flags: { housing: 'rent' } }).per.home === 3);
  // free: [stress<40, debt<=1, health>=60, hasVenture/network>=50/money>=30]
  check('S-55 free debt 0 + stress 39 -> 2 (stress + debt)', score({ obsessions: ['free'], attrs: { debt: 0, stress: 39 } }).per.free === 2);
  check('S-56 free debt 0 + stress 40 -> 1 (stress <40 is strict)', score({ obsessions: ['free'], attrs: { debt: 0, stress: 40 } }).per.free === 1);
  check('S-57 free debt 1 + stress 69 -> 1 (only debt)', score({ obsessions: ['free'], attrs: { debt: 1, stress: 69 } }).per.free === 1);
  check('S-58 free debt 2 + stress 90 -> 0', score({ obsessions: ['free'], attrs: { debt: 2, stress: 90 } }).per.free === 0);
  check('S-59 free debt 3 + stress 0 -> 1 (only stress)', score({ obsessions: ['free'], attrs: { debt: 3, stress: 0 } }).per.free === 1);
  check('S-55b free stress 20 + health 70 + money 40 -> 3 (stress + health + money)', score({ obsessions: ['free'], attrs: { debt: 0, stress: 20, health: 70, money: 40 } }).per.free === 3);
  check('S-55c free stress 20 + health 59 + money 40 -> 3 (stress + debt + money)', score({ obsessions: ['free'], attrs: { debt: 0, stress: 20, health: 59, money: 40 } }).per.free === 3);
  // love: [partner & H4>=30, partner & H4>60, network>=40, network>=50/partner]
  check('S-60 love partner H4 61 -> 3 (all four)', score({ obsessions: ['love'], flags: { relationship: 'partner' }, sealed: { H4: { value: 61 } } }).per.love === 3);
  check('S-61 love partner H4 60 -> 3 (quality + network + partner)', score({ obsessions: ['love'], flags: { relationship: 'partner' }, sealed: { H4: { value: 60 } } }).per.love === 3);
  check('S-62 love partner H4 30 -> 3 (quality + network + partner)', score({ obsessions: ['love'], flags: { relationship: 'partner' }, sealed: { H4: { value: 30 } } }).per.love === 3);
  check('S-63 love partner H4 29 -> 2 (network + partner only)', score({ obsessions: ['love'], flags: { relationship: 'partner' }, sealed: { H4: { value: 29 } } }).per.love === 2);
  check('S-64 love no partner, network 60 -> 2 (single is not a failure)', score({ obsessions: ['love'], flags: {}, sealed: {} }).per.love === 2);
  check('S-64b love no partner, network 0 -> 0', score({ obsessions: ['love'], attrs: { network: 0 }, flags: {}, sealed: {} }).per.love === 0);
  // health: [>=60, >=80, >=60 & stress<70, >=40]
  check('S-65 health 80 -> 3', score({ obsessions: ['health'], attrs: { health: 80 } }).per.health === 3);
  check('S-66 health 79 -> 3 (>=60 + sustained care + >=40)', score({ obsessions: ['health'], attrs: { health: 79 } }).per.health === 3);
  check('S-67 health 60 -> 3 (>=60 + sustained care + >=40)', score({ obsessions: ['health'], attrs: { health: 60 } }).per.health === 3);
  check('S-68 health 40 -> 1', score({ obsessions: ['health'], attrs: { health: 40 } }).per.health === 1);
  check('S-69 health 39 -> 0', score({ obsessions: ['health'], attrs: { health: 39 } }).per.health === 0);
  check('S-67b health 70 + stress 70 -> 2 (sustained care needs stress <70)', score({ obsessions: ['health'], attrs: { health: 70, stress: 70 } }).per.health === 2);
  check('S-67c health 70 + stress 69 -> 3', score({ obsessions: ['health'], attrs: { health: 70, stress: 69 } }).per.health === 3);
}

// ---------- S-70: obsessionScore — deductions + ending bands ----------
{
  const sc = (o) => score(o);
  check('S-70 total 6 -> fulfilled 如愿 (money 3 + health 3)', sc({ obsessions: ['money', 'health'], attrs: { money: 40, health: 70 } }).ending === 'fulfilled' && sc({ obsessions: ['money', 'health'], attrs: { money: 40, health: 70 } }).total === 6);
  check('S-71 total 5 -> fulfilled (money 2 + health 3)', sc({ obsessions: ['money', 'health'], attrs: { money: 20, health: 70 } }).ending === 'fulfilled' && sc({ obsessions: ['money', 'health'], attrs: { money: 20, health: 70 } }).total === 5);
  check('S-72 total 3 -> another-way (money 2 + health 1)', sc({ obsessions: ['money', 'health'], attrs: { money: 20, health: 50 } }).ending === 'another-way' && sc({ obsessions: ['money', 'health'], attrs: { money: 20, health: 50 } }).total === 3);
  check('S-73 total 2 -> survived', sc({ obsessions: ['money', 'health'], attrs: { money: 5, health: 50 } }).ending === 'survived' && sc({ obsessions: ['money', 'health'], attrs: { money: 5, health: 50 } }).total === 2);
  check('S-74 total 1 -> survived', sc({ obsessions: ['money', 'health'], attrs: { money: 5, health: 30 } }).ending === 'survived' && sc({ obsessions: ['money', 'health'], attrs: { money: 5, health: 30 } }).total === 1);
  check('S-75 money -1 + health 30 -> total 1 survived (negative cash still holds debt-tolerance)', sc({ obsessions: ['money', 'health'], attrs: { money: -1, health: 30 } }).ending === 'survived' && sc({ obsessions: ['money', 'health'], attrs: { money: -1, health: 30 } }).total === 1);
  check('S-75b true 0 needs debt 5 too (money -1 + health 30 + debt 5 -> raw 0, total -1, restart)', (() => { const r = sc({ obsessions: ['money', 'health'], attrs: { money: -1, health: 30, debt: 5 } }); return r.raw === 0 && r.total === -1 && r.ending === 'restart'; })(), JSON.stringify(sc({ obsessions: ['money', 'health'], attrs: { money: -1, health: 30, debt: 5 } })));
  check('S-76 health <= 20 deducts 2 (raw 0 -> total -2 -> restart)', (() => { const r = sc({ obsessions: ['health'], attrs: { health: 20 } }); return r.deductions.health === 2 && r.total === -2 && r.ending === 'restart'; })(), JSON.stringify(sc({ obsessions: ['health'], attrs: { health: 20 } })));
  check('S-77 health 21 does NOT deduct', sc({ obsessions: ['health'], attrs: { health: 21 } }).deductions.health === 0);
  check('S-78 Debt = 5 deducts 1 (money 1 -> total 0 -> restart)', (() => { const r = sc({ obsessions: ['money'], attrs: { money: 40, debt: 5 } }); return r.per.money === 1 && r.deductions.debt === 1 && r.total === 0 && r.ending === 'restart'; })(), JSON.stringify(sc({ obsessions: ['money'], attrs: { money: 40, debt: 5 } })));
  check('S-79 Debt = 4 does NOT deduct', sc({ obsessions: ['money'], attrs: { money: 40, debt: 4 } }).deductions.debt === 0);
  check('S-80 estranged + home obsession does NOT deduct (home 3, total 3 -> another-way: 断亲≠无家）', (() => { const r = sc({ obsessions: ['home'], attrs: { family: 2, money: 40, network: 60, debt: 0 }, flags: { estranged: true, housing: 'rent' } }); return r.per.home === 3 && r.deductions.estranged === 0 && r.total === 3 && r.ending === 'another-way'; })(), JSON.stringify(sc({ obsessions: ['home'], attrs: { family: 2, money: 40, network: 60, debt: 0 }, flags: { estranged: true, housing: 'rent' } })));
  check('S-81 estranged without the home obsession does NOT deduct', sc({ obsessions: ['money'], attrs: { money: 40 }, flags: { estranged: true } }).deductions.estranged === 0 && sc({ obsessions: ['money'], attrs: { money: 40 }, flags: { estranged: true } }).total === 3);
  check('S-82 unknown obsession id scores 0, does not crash', sc({ obsessions: ['nope'], attrs: {} }).per.nope === 0 && sc({ obsessions: ['nope'], attrs: {} }).total === 0);
  check('S-83 deductions stack: health 20 + Debt 5 (raw 1 -> total -2 -> restart)', (() => { const r = sc({ obsessions: ['money', 'health'], attrs: { money: 40, health: 20, debt: 5 } }); return r.raw === 1 && r.total === -2 && r.ending === 'restart'; })(), JSON.stringify(sc({ obsessions: ['money', 'health'], attrs: { money: 40, health: 20, debt: 5 } })));
}

// ---------- S-90: counterfactualFlips ----------
// Snapshot A (consistent with the formula): skill 50, network 50,
// money 20, calm -> chance 15+12.5+7.5+10 = 45. Roll 48, need 3.
// skill cap 65 -> +3.75 -> 48.75 flips (delta 12); network cap 68 ->
// +2.7 -> 47.7 no flip; money cap 29 -> +4.5 -> 49.5 flips (delta 6).
// Sorted by delta ascending: money (6) first, skill (12) second.
{
  const snapA = { skill: 50, network: 50, money: 20, partnerMod: 0, industryDown: false, partnerShares: false, tier: 'calm', k: 1, chance: 45, roll: 48, line: 'startup', staked: 20, h6: 70 };
  const stA = { attrs: {}, obsessions: [], flags: {}, sealed: {}, commitments: { E: { snapshot: snapA } } };
  const flipsA = ctx('counterfactualFlips(' + JSON.stringify(stA) + ')');
  check('S-90 two flippable factors, sorted by needed delta ascending (money 6, skill 12)', flipsA.length === 2 && flipsA[0].factor === 'money' && flipsA[1].factor === 'skill', JSON.stringify(flipsA.map((f) => [f.factor, f.delta])));
  check('S-91 money flip needs cash 26 (cap 29)', flipsA[0].need === 26 && flipsA[0].cap === 29, JSON.stringify(flipsA[0]));
  check('S-92 skill flip needs skill 62 (cap 65)', flipsA[1].need === 62 && flipsA[1].cap === 65, JSON.stringify(flipsA[1]));
  check('S-93 network cannot flip here (cap +2.7 < need 3)', !flipsA.some((f) => f.factor === 'network'));
  // Snapshot B: tense, chance 40, roll 44, need 4. Pressure back to
  // calm +5 flips (delta 5); money cap 29 -> 44.5 flips (delta 8);
  // skill +3.75 and network +2.7 do not. Order: pressure, money.
  const snapB = { skill: 50, network: 50, money: 20, partnerMod: 0, industryDown: false, partnerShares: false, tier: 'tense', k: 1, chance: 40, roll: 44, line: 'startup', staked: 20, h6: 70 };
  const stB = { attrs: {}, obsessions: [], flags: {}, sealed: {}, commitments: { E: { snapshot: snapB } } };
  const flipsB = ctx('counterfactualFlips(' + JSON.stringify(stB) + ')');
  check('S-94 pressure flip beats money flip (delta 5 < 8)', flipsB.length === 2 && flipsB[0].factor === 'pressure' && flipsB[1].factor === 'money', JSON.stringify(flipsB.map((f) => [f.factor, f.delta])));
  check('S-94b every flip text is framed as pre-signing (签字前……) and says T15 cannot change the sealed die', flipsA.every((f) => f.text.startsWith('签字前') && f.text.includes('签字已经封存了，T15 再') && f.text.includes('改不了这颗骰')) && flipsB.every((f) => f.text.startsWith('签字前')));
  // Snapshot C: nothing can flip (need 40; best single gain is +12
  // from pressure calm). -> [] so the card shows the fallback line.
  const snapC = { skill: 10, network: 10, money: 10, partnerMod: 0, industryDown: false, partnerShares: false, tier: 'break', k: 1, chance: 12, roll: 52, line: 'startup', staked: 10, h6: 70 };
  const stC = { attrs: {}, obsessions: [], flags: {}, sealed: {}, commitments: { E: { snapshot: snapC } } };
  check('S-95 no single factor can flip -> empty list (card shows the fallback line)', ctx('counterfactualFlips(' + JSON.stringify(stC) + ')').length === 0);
  // Sealed dice never flip: a huge negative partnerMod cannot be fixed
  // by any candidate, and no candidate ever names H6/H4.
  const snapD = { skill: 50, network: 50, money: 20, partnerMod: -25, industryDown: false, partnerShares: false, tier: 'calm', k: 1, chance: 20, roll: 48, line: 'startup', staked: 20, h6: 11 };
  const stD = { attrs: {}, obsessions: [], flags: {}, sealed: {}, commitments: { E: { snapshot: snapD } } };
  const flipsD = ctx('counterfactualFlips(' + JSON.stringify(stD) + ')');
  check('S-96 H6/H4 are sealed and never appear as flippable factors', flipsD.every((f) => ['skill', 'network', 'money', 'pressure'].includes(f.factor)), JSON.stringify(flipsD.map((f) => f.factor)));
  check('S-97 work line (no gamble) -> no flips', ctx('counterfactualFlips(' + JSON.stringify({ attrs: {}, obsessions: [], flags: {}, sealed: {}, commitments: { E: { snapshot: { line: 'work', chance: 0, roll: 0 } } } }) + ')').length === 0);
  check('S-98 success roll -> no flips', ctx('counterfactualFlips(' + JSON.stringify({ attrs: {}, obsessions: [], flags: {}, sealed: {}, commitments: { E: { snapshot: Object.assign({}, snapA, { roll: 45 }) } } }) + ')').length === 0);
  check('S-99 no E commitment at all -> no flips', ctx('counterfactualFlips(' + JSON.stringify({ attrs: {}, obsessions: [], flags: {}, sealed: {}, commitments: {} }) + ')').length === 0);
}

// ---------- S-100: redemptionCardHtml — five grids, source labels ----------
// A live G.state is needed (omens, decisions, T9_SLICE). Reuse the
// post-slice shape from test-v12.
function liveState(o) {
  const opts = Object.assign({ attrs: { money: 40, health: 70, skill: 70, express: 50, network: 60, influence: 20, stress: 20, debt: 0, family: 0 }, obsessions: ['money', 'health'] }, o || {});
  ctx(`G = { state: newRun(12345, { difficulty: 'normal', obsessions: ${JSON.stringify(opts.obsessions)} }), rng: makeRng(12345), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 };
    G.state.turn = 9;
    G.state.flags.h2 = { chance: 35, roll: 20, laidOff: true };
    G.state.flags.t9Branch = 'laid-off';
    G.state.decisions['call-laochen'] = { text: '打电话给老陈', seal: 'x' };
    G.state.decisions['hr-talk'] = { text: '争取内部转岗', seal: 'x' };
    G.state.decisions['borrow-home'] = { text: '不借，自己扛', seal: 'x' };
    Object.assign(G.state.attrs, ${JSON.stringify(opts.attrs)});`);
}
{
  liveState();
  ctx(`G.state.omenLog = [{ turn: 9, text: '先：老陈说名单定了' }, { turn: 9, text: '后：HR 约你周五谈话' }];`);
  const cardC = ctx('redemptionCardHtml(G.state, "C")');
  check('S-100 C card has all five grids', ['① 你当时押的', '② 当时封的骰', '③ 现在揭晓', '④ 反事实归因', '⑤ 征兆回放'].every((g) => cardC.includes(g)));
  check('S-101 C card source label: 这颗骰在你 26 岁那年掷出', cardC.includes('这颗骰在你 26 岁那年掷出'));
  check('S-102 C card shows the layoff outcome + N = 8 万', cardC.includes('被裁了') && cardC.includes('N = 8 万到账'));
  check('S-103 C card has no flippable point (past is sealed)', cardC.includes('没有最小翻盘点'));
  check('S-104 omen replay is reverse chronological (后 before 先）', cardC.indexOf('后：HR') < cardC.indexOf('先：老陈'));
  // E fail card, snapshot A from S-90 (chance 45, roll 48).
  ctx(`G.state.commitments.E = { text: '押注：创业', signedAt: 'T14', dueTurn: 16, snapshot: { skill: 50, network: 50, money: 20, partnerMod: 0, industryDown: false, partnerShares: false, tier: 'calm', k: 1, chance: 45, roll: 48, line: 'startup', staked: 20, h6: 70 } };
    G.state.flags.eResult = { success: false, note: '没成' };
    G.state.omenLog = [{ turn: 14, text: '合伙人说先垫房租' }, { turn: 15, text: '账上只剩两周钱' }];`);
  const cardE = ctx('redemptionCardHtml(G.state, "E")');
  check('S-105 E fail card: 没成 + exact chance and roll', cardE.includes('没成') && cardE.includes('精确成功率 45%，掷出 48'));
  check('S-106 E fail card source label: 31 岁那年', cardE.includes('这颗骰在你 31 岁那年掷出'));
  check('S-107 E fail card shows only the three-tier label at signing (no exact % in grid ②)', cardE.includes('签署时只给你看的三档把握是「五五开」'));
  check('S-108 E fail card lists the flip points (money first)', cardE.includes('真正能救你的是现金') && cardE.includes('真正能救你的是专业'));
  check('S-108b E fail card separates 签字前 from what T15 can still mitigate (签字后你还能减轻什么损失）', cardE.includes('签字前：') && cardE.includes('签字后你还能减轻什么损失'));
  check('S-109 E fail card omen replay covers T14–T16', cardE.includes('账上只剩两周钱'));
  // E fail card, snapshot C (no flip) -> fallback line.
  ctx(`G.state.commitments.E.snapshot = { skill: 10, network: 10, money: 10, partnerMod: 0, industryDown: false, partnerShares: false, tier: 'break', k: 1, chance: 12, roll: 52, line: 'startup', staked: 10, h6: 70 };`);
  const cardE2 = ctx('redemptionCardHtml(G.state, "E")');
  check('S-110 E no-flip card shows the fallback line', cardE2.includes('这一年没有单点能救你，是三个因子各差一点'));
  // E success card.
  ctx(`G.state.commitments.E.snapshot = { skill: 50, network: 50, money: 20, partnerMod: 0, industryDown: false, partnerShares: false, tier: 'calm', k: 1, chance: 45, roll: 20, line: 'startup', staked: 20, h6: 70 };
    G.state.flags.eResult = { success: true, note: '成了' };`);
  const cardE3 = ctx('redemptionCardHtml(G.state, "E")');
  check('S-111 E success card: 成了 + no flip needed', cardE3.includes('成了') && cardE3.includes('成功了。没有需要翻盘的点。'));
  // E work line (no gamble).
  ctx(`G.state.commitments.E = { text: '押注：继续打工', signedAt: 'T14', dueTurn: 16, snapshot: { line: 'work' } };
    G.state.flags.eResult = { success: true, note: '两年平稳打工。' };`);
  const cardE4 = ctx('redemptionCardHtml(G.state, "E")');
  check('S-112 E work-line card: 没有封存的骰子：你没押', cardE4.includes('没有封存的骰子：你没押'));
  // F card.
  ctx(`G.state.commitments.F = { text: '父母的病：放弃事业，全力照顾父母', signedAt: 'T16', dueTurn: 18 };
    G.state.flags.h5Result = { level: 2, checkup: true };
    G.state.flags.fResult = { pass: true, met: ['money', 'health'] };`);
  const cardF = ctx('redemptionCardHtml(G.state, "F")');
  check('S-113 F card: H5 level 2 + 体检 −1 级', cardF.includes('父母病情 2 级') && cardF.includes('体检 −1 级'));
  check('S-114 F card: 抗压判定 三选二成立 + the two legs met', cardF.includes('三选二成立') && cardF.includes('钱 ≥30 万') && cardF.includes('健康 ≥60'));
  check('S-115 F card source label: 30 岁那年 (H5 sealed at T13)', cardF.includes('30 岁那年掷出'));
  check('S-116 F card has no flip point (no formula)', cardF.includes('没有成功率公式，所以没有最小翻盘点'));
  check('S-117 unknown card id -> empty string', ctx('redemptionCardHtml(G.state, "Z")') === '');
}

// ---------- S-120: settlement screen + analytics event ----------
{
  liveState({ attrs: { money: 35, health: 85, skill: 70, express: 50, network: 60, influence: 20, stress: 20, debt: 0, family: 0 }, obsessions: ['money', 'health'] });
  ctx('G.state.turn = 18; G.meta.runsFinished = 0; Analytics.init(); ANALYTICS_ENDPOINT = "https://example.invalid"; sent.length = 0;');
  ctx('screenSettlement()');
  check('S-120 settlement renders 如愿（6 分）', screenHtml().includes('如愿（6 分）'));
  check('S-121 settlement shows both obsession rows with / 3 分', screenHtml().includes('/ 3 分'));
  check('S-122 settlement screen names the interpretive scoring (doc gave no per-obsession rules)', screenHtml().includes('解释性实现'));
  check('S-123 runsFinished increments once at settlement', ctx('G.meta.runsFinished') === 1, 'runsFinished=' + ctx('G.meta.runsFinished'));
  check('S-124 settlement analytics event fires exactly once', sandbox.sent.length === 1, 'sent=' + sandbox.sent.length);
  const ev = sandbox.sent[0] ? sandbox.sent[0].body : {};
  check('S-125 settlement event name is settlement', ev.event === 'settlement', JSON.stringify(ev));
  check('S-126 settlement event fields: obsessionScore = 6, ending = fulfilled', ev.data && ev.data.obsessionScore === 6 && ev.data.ending === 'fulfilled', JSON.stringify(ev.data));
  check('S-127 settlement event sends ONLY the whitelisted fields (no free text)', ev.data && Object.keys(ev.data).sort().join() === 'ending,obsessionScore', JSON.stringify(Object.keys(ev.data || {})));
  check('S-128 settlement event carries no turn field (turn is not part of the settlement schema)', ev.turn === undefined, 'turn=' + ev.turn);
  ctx('screenSettlement()');
  check('S-129 re-rendering settlement does not double-count the run', ctx('G.meta.runsFinished') === 1);
  check('S-130 re-rendering settlement does not re-fire the event', sandbox.sent.length === 1, 'sent=' + sandbox.sent.length);
  check('S-131 settlement offers 再来一次 (S4 unlock lives there)', screenHtml().includes('再来一次'));
  // Slice-mode run: no obsessions were ever picked (S0 skipped) ->
  // nothing to score -> 0 -> 重开. Known limitation, asserted as-is.
  liveState({ attrs: { money: 10, health: 50, skill: 70, express: 50, network: 60, influence: 20, stress: 20, debt: 0, family: 0 }, obsessions: [] });
  ctx('G.state.turn = 18; G.meta.runsFinished = 0; sent.length = 0;');
  ctx('screenSettlement()');
  check('S-132 no obsessions (slice-mode run) -> 0 分 -> 重开', screenHtml().includes('重开（0 分）') && screenHtml().includes('开局没选执念'));
  check('S-133 slice-mode settlement still fires the event (score 0, restart)', sandbox.sent.length === 1 && sandbox.sent[0].body.data.obsessionScore === 0 && sandbox.sent[0].body.data.ending === 'restart', JSON.stringify(sandbox.sent[0] && sandbox.sent[0].body.data));
}

console.log(failures === 0 ? 'ALL PASS' : failures + ' FAILURES');
process.exit(failures === 0 ? 0 : 1);
