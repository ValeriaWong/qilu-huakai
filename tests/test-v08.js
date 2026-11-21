'use strict';
// v0.6 era-engine tests (ERA-01..ERA-14): year derivation, exam-mode
// switching points, line lookup against the verified CSV data, admission
// tiers (incl. the missing-tier3 = no 三本 tier rule), the S0.5 year
// picker + era region/track flow, and old-save migration (legacy 2026
// flow keeps working when flags.era is absent).
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
  // Fake timers: screenDice's 1.5s roll and the tag debounce never fire
  // during synchronous tests.
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
for (const f of ['rng.js', 'data.js', 'interpersonal.js', 'stocks.js', 'gaokao-lines.js', 'era-events.js', 'era.js', 'engine.js', 'ai-review.js', 'analytics.js', 'game.js']) {
  vm.runInContext(fs.readFileSync(path.join(REPO, 'js', f), 'utf8'), sandbox, { filename: f });
}
const ctx = (code) => vm.runInContext(code, sandbox);
const screenHtml = () => (els.get('#screen') ? els.get('#screen')._html : '');
function click(act, id) {
  clickHandler({ target: { closest: () => ({ dataset: { act, id: id === undefined ? '' : String(id) } }) } });
}
function freshState(era) {
  ctx(`G = { state: newRun(12345, { difficulty: 'normal' }), rng: makeRng(12345), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 };
    G.state.origin = { familyKey: 'model', attrs: { money: 5, health: 85, stress: 10 } };
    G.state.flags.familySafety = '家里能接住你一次，但只有一次。';` + (era ? ` G.state.flags.era = ${JSON.stringify(era)};` : ''));
}

// ---------- ERA-01: exam-mode switching points ----------
{
  const gm = ctx('getExamMode');
  check('ERA-01 山东 2019 split / 2020 3+3', gm('shandong', 2019) === 'split' && gm('shandong', 2020) === '3+3' && gm('shandong', 2026) === '3+3');
  check('ERA-01 辽宁 2020 split / 2021 3+1+2', gm('liaoning', 2020) === 'split' && gm('liaoning', 2021) === '3+1+2');
  check('ERA-01 吉林/黑龙江 2023 split / 2024 3+1+2', gm('jilin', 2023) === 'split' && gm('jilin', 2024) === '3+1+2' && gm('heilongjiang', 2023) === 'split' && gm('heilongjiang', 2024) === '3+1+2');
  check('ERA-01 mode labels', ctx('EXAM_MODE_LABEL') && ctx(`EXAM_MODE_LABEL['split']`) === '文理分科' && ctx(`EXAM_MODE_LABEL['3+3']`) === '3+3');
}

// ---------- ERA-02: year derivation ----------
{
  check('ERA-02 birth+18=exam', ctx('examYearForBirth(1997)') === 2015 && ctx('examYearForBirth(1970)') === 1988 && ctx('examYearForBirth(2008)') === 2026);
  check('ERA-02 calendarYear = exam+turn-1', ctx('calendarYearForTurn(2015, 1)') === 2015 && ctx('calendarYearForTurn(2015, 9)') === 2023);
  check('ERA-02 T9 year = exam+8, settlement = exam+17', ctx('t9Year(2015)') === 2023 && ctx('settlementYear(2015)') === 2032);
  check('ERA-02 age = 17+turn', ctx('ageForTurn(1)') === 18 && ctx('ageForTurn(9)') === 26);
  check('ERA-02 1970-1989 is the history pack', ctx('isHistoryPack(1989)') === true && ctx('isHistoryPack(1990)') === false);
}

// ---------- ERA-03: verified line lookup ----------
{
  const L = ctx('GAOKAO_LINES');
  check('ERA-03 山东 2012 文 二本 516 (450 is the other line, not used)', L['shandong|2012|文'].tier2 === 516 && L['shandong|2012|文'].tier1 === 573);
  check('ERA-03 辽宁 2019 理 本科 369 (359 discarded)', L['liaoning|2019|理'].tier2 === 369);
  check('ERA-03 黑龙江 2011 文 一本 540 / 二本 462', L['heilongjiang|2011|文'].tier1 === 540 && L['heilongjiang|2011|文'].tier2 === 462);
  check('ERA-03 吉林 2018 理 533/405/283', L['jilin|2018|理'].tier1 === 533 && L['jilin|2018|理'].tier2 === 405 && L['jilin|2018|理'].tier3 === 283);
  check('ERA-03 generated counts match the CSV (305 / 108 / 21 / 176)', ctx('GAOKAO_LINES_META').rows === 305 && ctx('GAOKAO_LINES_META').verified === 108 && ctx('GAOKAO_LINES_META').toVerify === 21 && ctx('GAOKAO_LINES_META').unprovided === 176);
}

// ---------- ERA-04/05: states and playable years ----------
{
  check('ERA-04 2026 rows are now verified and playable (no to_verify left)', ctx(`isLinePlayable(lookupLine('liaoning', 2026, '物理'))`) === true && ctx(`lookupLine('liaoning', 2026, '物理').status`) === '已核实' && ctx(`lookupLine('liaoning', 2026, '物理').tier2`) === 344);
  check('ERA-04 unprovided rows are NOT playable', ctx(`isLinePlayable(lookupLine('shandong', 2009, '文'))`) === false && ctx(`lookupLine('shandong', 2023, '不分').status`) === '待核实');
  check('ERA-04 verified rows ARE playable', ctx(`isLinePlayable(lookupLine('shandong', 2015, '文'))`) === true);
  const py = ctx('playableBirthYears()');
  const expected = [...Array(13)].map((_, i) => 1992 + i).concat([2008]);
  check('ERA-05 playable birth years are 1992-2004 + 2008', JSON.stringify(py) === JSON.stringify(expected), JSON.stringify(py));
  check('ERA-05 label groups the ranges', ctx('playableBirthYearsLabel()') === '1992–2004 年、2008 年', ctx('playableBirthYearsLabel()'));
}

// ---------- ERA-06/07: admission tiers ----------
{
  const t10 = ctx(`admissionTiers(lookupLine('shandong', 2010, '文'))`);
  check('ERA-06 split tiers: 一本 606 k1.30 / 二本 578 k1.10', t10.length === 2 && t10[0].name === '一本' && t10[0].line === 606 && t10[0].k === 1.30 && t10[1].name === '二本' && t10[1].k === 1.10);
  check('ERA-06 missing tier3 = NO 三本 tier (never substitute 二本）', !t10.some((t) => t.name === '三本') && ctx(`lookupLine('shandong', 2010, '文').tier3`) === null);
  check('ERA-06 黑龙江 all years have no tier3', ctx(`admissionTiers(lookupLine('heilongjiang', 2015, '理'))`).length === 2);
  const tJL19 = ctx(`admissionTiers(lookupLine('jilin', 2019, '文'))`);
  check('ERA-06 吉林 2019: 一本 544 + 二本 372, no 三本 (merger was 二本+三本）', tJL19.length === 2 && tJL19[0].name === '一本' && tJL19[0].line === 544 && tJL19[1].name === '二本' && tJL19[1].line === 372, JSON.stringify(tJL19));
  const t17 = ctx(`admissionTiers(lookupLine('shandong', 2017, '文'))`);
  check('ERA-07 merged year: single 本科 tier 483 k1.10', t17.length === 1 && t17[0].name === '本科' && t17[0].line === 483 && t17[0].k === 1.10);
  const t20 = ctx(`admissionTiers(lookupLine('shandong', 2020, '不分'))`);
  check('ERA-07 new33 year: 本科 449 k1.10 + 专科 150 k0.80', t20.length === 2 && t20[0].name === '本科' && t20[0].line === 449 && t20[1].name === '专科' && t20[1].line === 150 && t20[1].k === 0.80);
}

// ---------- ERA-08/09: era admission ----------
function eraState(province, year, track, base) {
  const row = ctx(`lookupLine('${province}', ${year}, '${track}')`);
  return { flags: { gaokao: { region: province, era: { birthYear: year - 18, examYear: year, track, mode: ctx(`getExamMode('${province}', ${year})`) }, base, row: { tier1: row.tier1, tier2: row.tier2, tier3: row.tier3, vocational: row.vocational, regime: row.regime, status: row.status } } } };
}
{
  // (resolveEraAdmission is reached via vm context below; keep it in-context)
  const res = (st, major) => ctx(`resolveEraAdmission(${JSON.stringify(st)}, '${major}')`);
  const s610 = eraState('shandong', 2010, '文', 610);
  const r610 = res(s610, '计算机');
  check('ERA-08 score 610 -> 一本 k1.30, 调剂 to 艺术设计 (P1-e demand: 606+80 > 610)', r610.tier === '一本' && r610.k === 1.30 && r610.major === '艺术设计' && r610.adjusted === true, JSON.stringify(r610));
  const r590 = res(eraState('shandong', 2010, '文', 590), '计算机');
  check('ERA-08 score 590 -> 二本 k1.10', r590.tier === '二本' && r590.k === 1.10);
  const r500 = res(eraState('shandong', 2010, '文', 500), '计算机');
  check('ERA-08 score 500 with no tier3/vocational -> 落榜 k1.0 (no substitute tier)', r500.tier === '落榜' && r500.k === 1.0, JSON.stringify(r500));
  const r460 = res(eraState('shandong', 2020, '不分', 460), '计算机');
  check('ERA-09 new33 score 460 -> 本科 k1.10', r460.tier === '本科' && r460.k === 1.10);
  const r200 = res(eraState('shandong', 2020, '不分', 200), '计算机');
  check('ERA-09 new33 score 200 -> 专科 k0.80', r200.tier === '专科' && r200.k === 0.80);
  const r100 = res(eraState('shandong', 2020, '不分', 100), '计算机');
  check('ERA-09 new33 score 100 -> 落榜', r100.tier === '落榜' && r100.k === 1.0);
}

// ---------- ERA-10: S0.5 picker + era region/track flow ----------
{
  freshState();
  ctx(`G.meta = loadMeta(); screenEraYear();`);
  check('ERA-10 S0.5 screen shows birth-year question', screenHtml().includes('你是哪一年出生的'));
  check('ERA-10 1992-2002 are clickable (era-year-pick)', [1992, 1997, 2002].every((y) => screenHtml().includes(`data-act="era-year-pick" data-id="${y}"`)));
  check('ERA-10 unplayable years render locked, not clickable', !screenHtml().includes(`data-act="era-year-pick" data-id="1985"`) && screenHtml().includes('1985 年出生'));
  check('ERA-10 locked year cannot be picked', (() => { click('era-year-pick', '1985'); return ctx('G.state.flags.era') === undefined; })());
  click('era-year-pick', '1997');
  check('ERA-10 picking 1997 locks era {birthYear 1997, examYear 2015}', JSON.stringify(ctx('G.state.flags.era')) === JSON.stringify({ birthYear: 1997, examYear: 2015 }));
  // startNew routes through S0.5 too (v1.2 P0-2: full run needs exactly
  // 2 obsessions picked first, or start is blocked).
  ctx(`G = { state: null, rng: makeRng(999), meta: loadMeta(), pickedObsessions: new Set(['money', 'health']), pickedDifficulty: 'normal', pickedSlot: 1 }; startNew('full');`);
  check('ERA-10 startNew (full) lands on S0.5, not the dice', screenHtml().includes('你是哪一年出生的'));
}
// era T1 flow, from a 1997-born state
freshState({ birthYear: 1997, examYear: 2015 });
ctx('screenT1();');
check('ERA-10 era T1 shows the region picker with the exam year', screenHtml().includes('2015 年高考'));
click('t1-era-region-pick', 'shandong');
check('ERA-10 region pick goes to the track screen (文/理）', screenHtml().includes('选科类') && screenHtml().includes('文类') && screenHtml().includes('理类'));
click('t1-track-pick', 'shandong|文');
{
  const g = ctx('G.state.flags.gaokao');
  check('ERA-10 track pick seals era record + verified row (山东 2015 文 568/510)', g.region === 'shandong' && g.era.track === '文' && g.era.mode === 'split' && g.row.tier1 === 568 && g.row.tier2 === 510, JSON.stringify(g));
  check('ERA-10 score is anchored on the 本科线 (490-730)', g.base >= 490 && g.base <= 730, 'base=' + g.base);
  check('ERA-10 T1 screen shows the era lines, not 2026 lines', screenHtml().includes('2015 年高考') && screenHtml().includes('一本线 568') && screenHtml().includes('二本线 510') && !screenHtml().includes('一段线 442'));
}
// era diagnosis + pickT1 (force a 一本 score, then a 落榜 score)
ctx(`G.state.flags.gaokao.base = 600; screenT1();`);
click('t1-diagnose');
check('ERA-10 era diagnosis lists tiers and the landed tier', screenHtml().includes('志愿诊断') && screenHtml().includes('一本线 568') && screenHtml().includes('落在「一本」档'));
ctx(`G.t1Diagnosing = false; screenT1();`);
els.get('#t1-major')._value = '计算机';
click('t1-pick', 'insist');
click('t1-confirm');
check('ERA-10 era pickT1: 一本 k1.30 on the signed card', screenHtml().includes('一本') && screenHtml().includes('k = 1.3'));
ctx(`G.state.flags.gaokao.base = 400; G.state.flags.majorK = undefined; G.state.commitments = {}; screenT1();`);
els.get('#t1-major')._value = '计算机';
click('t1-pick', 'insist');
click('t1-confirm');
check('ERA-10 era pickT1 at 400: 落榜 card with the three-way fallback', screenHtml().includes('落榜') && screenHtml().includes('复读一年') && screenHtml().includes('等专科补录') && screenHtml().includes('先工作一年'));
click('t1-fallback', 'repeat');
check('ERA-10 fallback choice recorded, flow enters T2', ctx('G.state.flags.fallbackChoice') === 'repeat' && ctx('G.state.turn') === 2);

// ---------- ERA-11: old-save migration (no era -> legacy 2026 flow) ----------
{
  freshState();
  ctx(`G.state.flags.gaokao = { region: 'liaoning', base: 400, line1: 344, specialLine: 508 }; screenT1();`);
  check('ERA-11 legacy save shows 2026 lines (一段线 344)', screenHtml().includes('一段线 344') && !screenHtml().includes('年高考 · '));
  const adm = ctx(`resolveAdmission(G.state, '艺术设计', 1.3)`);
  check('ERA-11 legacy resolver still works (400 vs 艺术设计线 344 -> 本科 k1.3)', adm.tier === '本科' && adm.k === 1.3, JSON.stringify(adm));
  freshState();
  ctx('screenT1();');
  check('ERA-11 no-era run shows the legacy region picker', screenHtml().includes('你在哪里参加高考？') && !screenHtml().includes('年高考'));
}

// ---------- ERA-15 (v0.6.1): 2021/2022 fill + 2026 conflict resolved ----------
{
  const L = ctx('GAOKAO_LINES');
  check('ERA-15 山东 2021/2022: 一段 444 / 437', L['shandong|2021|不分'].tier2 === 444 && L['shandong|2022|不分'].tier2 === 437 && L['shandong|2021|不分'].status === '已核实');
  check('ERA-15 辽宁 2021/2022 物理 336 / 362，历史 456 / 404', L['liaoning|2021|物理'].tier2 === 336 && L['liaoning|2022|物理'].tier2 === 362 && L['liaoning|2021|历史'].tier2 === 456 && L['liaoning|2022|历史'].tier2 === 404);
  check('ERA-15 吉林 2021 文 519/335，2022 理 488/327', L['jilin|2021|文'].tier1 === 519 && L['jilin|2021|文'].tier2 === 335 && L['jilin|2022|理'].tier1 === 488 && L['jilin|2022|理'].tier2 === 327);
  check('ERA-15 黑龙江 2021 理 415/280，2022 文 463/365，专科 160', L['heilongjiang|2021|理'].tier1 === 415 && L['heilongjiang|2021|理'].tier2 === 280 && L['heilongjiang|2022|文'].tier1 === 463 && L['heilongjiang|2022|文'].vocational === 160);
  check('ERA-15 2026 resolved to the v0.5 numbers (ChatGPT second version wrong)', L['liaoning|2026|物理'].tier2 === 344 && L['jilin|2026|物理'].tier2 === 321 && L['heilongjiang|2026|物理'].tier2 === 340 && L['shandong|2026|不分'].tier2 === 442);
  check('ERA-15 2026 历史类 rows exist (辽宁 442 / 吉林 343 / 黑龙江 385)', L['liaoning|2026|历史'].tier2 === 442 && L['jilin|2026|历史'].tier2 === 343 && L['heilongjiang|2026|历史'].tier2 === 385);
  check('ERA-15 黑龙江 2026 专科是 150（公告原文，非 160）', L['heilongjiang|2026|物理'].vocational === 150 && L['heilongjiang|2026|历史'].vocational === 150);
  check('ERA-15 no to_verify rows remain for 2026 (2023-2025 fills are 待核实)', Object.values(L).filter((r) => r.year === 2026).every((r) => r.status !== '待核实') && Object.values(L).filter((r) => r.status === '待核实').length === 21);
  check('ERA-15 吉林 2019 regime stays split (一本/二本分开，合并的是二本+三本）', L['jilin|2019|文'].regime === 'split' && L['jilin|2019|文'].note.includes('二三本合并后口径'));
  check('ERA-15 2008 birth year is now playable, 2005-2007 still locked', ctx('playableBirthYears()').includes(2008) && !ctx('playableBirthYears()').includes(2006));
}

// ---------- ERA-12/13/14: data flags ----------
{
  const evCsv = fs.readFileSync(path.join(__dirname, 'era_events.csv'), 'utf8');
  const evRows = evCsv.trim().split('\n').slice(1);
  check('ERA-12 era_events has no 1989 row', !evRows.some((r) => r.startsWith('1989,')));
  check('ERA-12 era_events starts at 1977', Math.min(...evRows.map((r) => Number(r.split(',')[0]))) === 1977);
  check('ERA-13 track sets by mode', JSON.stringify(ctx(`tracksForMode('split')`)) === JSON.stringify(['文', '理']) && JSON.stringify(ctx(`tracksForMode('3+3')`)) === JSON.stringify(['不分']) && JSON.stringify(ctx(`tracksForMode('3+1+2')`)) === JSON.stringify(['物理', '历史']));
  const jl19 = ctx(`lookupLine('jilin', 2019, '文')`);
  check('ERA-14 吉林 2019 stays split with the merger note (not silently changed)', jl19.regime === 'split' && jl19.note.includes('二三本合并'), JSON.stringify(jl19));
}

console.log(failures === 0 ? 'ALL PASS (v08)' : failures + ' FAILURES (v08)');
process.exit(failures === 0 ? 0 : 1);
