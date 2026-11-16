'use strict';
/* v0.6 时代引擎 (v6 设计稿 §时代转向): pure functions, no DOM.
 * Three time layers: history (real lines + chronicle), the player's
 * fictional life, and the future (fictional scenario generator, v0.7+).
 * One rule governs everything: birthYear + 18 = examYear,
 * calendarYear = examYear + turn - 1, age = 17 + turn.
 *
 * Data: GAOKAO_LINES (generated from gaokao_lines.csv, three states:
 * 已核实 / 待核实 / 未提供). Only 已核实 rows with an undergrad line
 * are playable; 待核实 rows are shown but never rolled on; 未提供 rows
 * are empty. Missing tier3 means the 三本 tier DOES NOT EXIST for that
 * year — never substitute the 二本 line (gap 1, Allen 2026-11-17).
 */

// ---- year bounds (Allen 2026-11-17 00:29) ----
const ERA_BIRTH_MIN = 1970;
const ERA_BIRTH_MAX = 2008;
const ERA_BIRTH_HIGHLIGHT_MIN = 1990; // default highlight: 1990-2008
const ERA_BIRTH_HIGHLIGHT_MAX = 2008;
const ERA_HISTORY_PACK_MAX = 1989; // 1970-1989 = optional history expansion

function examYearForBirth(birthYear) { return birthYear + 18; }
function birthYearForExam(examYear) { return examYear - 18; }
function calendarYearForTurn(examYear, turn) { return examYear + turn - 1; }
function ageForTurn(turn) { return 17 + turn; }
function settlementYear(examYear) { return examYear + 17; } // T18 = 35 岁
function t9Year(examYear) { return examYear + 8; } // T9 = 26 岁
function isHistoryPack(birthYear) { return birthYear <= ERA_HISTORY_PACK_MAX; }

// ---- exam system by province + year (v6.1 switching points) ----
// 'split' = 文理分科; '3+3' = 山东 2020+; '3+1+2' = 辽宁 2021+, 吉林/黑龙江 2024+.
function getExamMode(province, year) {
  if (province === 'shandong') return year >= 2020 ? '3+3' : 'split';
  if (province === 'liaoning') return year >= 2021 ? '3+1+2' : 'split';
  if (province === 'jilin' || province === 'heilongjiang') return year >= 2024 ? '3+1+2' : 'split';
  return 'split';
}
const EXAM_MODE_LABEL = { split: '文理分科', '3+3': '3+3', '3+1+2': '3+1+2' };
// Track enum: the table uses 文/理/不分/物理; 历史 completes 3+1+2.
const ERA_TRACKS = ['文', '理', '不分', '物理', '历史'];
function tracksForMode(mode) {
  if (mode === 'split') return ['文', '理'];
  if (mode === '3+3') return ['不分'];
  return ['物理', '历史']; // 3+1+2
}

// ---- line lookup ----
function lookupLine(province, year, track) {
  if (typeof GAOKAO_LINES === 'undefined') return null;
  return GAOKAO_LINES[province + '|' + year + '|' + track] || null;
}
// The anchor line the score roll is centred on: tier2 in every regime
// (二本线 / merged 本科线 / 一段线). Null when the row has no undergrad line.
function undergradLine(row) {
  if (!row) return null;
  return (typeof row.tier2 === 'number') ? row.tier2 : null;
}
// Playable only when verified AND an undergrad line exists.
function isLinePlayable(row) {
  return !!row && row.status === '已核实' && undergradLine(row) !== null;
}
// Birth years with at least one playable (province, track) line.
function playableBirthYears() {
  const years = [];
  for (let b = ERA_BIRTH_MIN; b <= ERA_BIRTH_MAX; b++) {
    const exam = examYearForBirth(b);
    let ok = false;
    for (const p of ['shandong', 'liaoning', 'jilin', 'heilongjiang']) {
      const mode = getExamMode(p, exam);
      for (const t of tracksForMode(mode)) {
        if (isLinePlayable(lookupLine(p, exam, t))) { ok = true; break; }
      }
      if (ok) break;
    }
    if (ok) years.push(b);
  }
  return years;
}
// Compact label for the S0.5 screen, e.g. "1992–2004 年、2008 年".
function playableBirthYearsLabel() {
  const ys = playableBirthYears();
  if (!ys.length) return '暂无可玩年份';
  const groups = [];
  let start = ys[0], prev = ys[0];
  for (let i = 1; i <= ys.length; i++) {
    if (i < ys.length && ys[i] === prev + 1) { prev = ys[i]; continue; }
    groups.push(start === prev ? String(start) : start + '–' + prev);
    if (i < ys.length) { start = ys[i]; prev = ys[i]; }
  }
  return groups.map((g) => g + ' 年').join('、');
}

// ---- admission tiers (v6 Q3: k = study-environment coefficient) ----
// Driven by which lines actually exist, not by the regime label:
// tier1 present -> 一本 1.30; tier2 present -> 二本 1.10 when a tier1
// exists, else 本科 1.10 (merged / new33 / 3+1+2 single line); tier3
// present -> 三本 0.95; vocational present -> 专科 0.80.
// (吉林 2019 is split with tier1+tier2 and no tier3: 一本 + 二本,
// no 三本 — the 2019 merger was 二本+三本, not 一本+二本.)
const ERA_TIER_K = { '一本': 1.30, '二本': 1.10, '三本': 0.95, '本科': 1.10, '专科': 0.80 };
function admissionTiers(row) {
  if (!row) return [];
  const tiers = [];
  if (typeof row.tier1 === 'number') tiers.push({ name: '一本', line: row.tier1, k: 1.30 });
  if (typeof row.tier2 === 'number') tiers.push({ name: (typeof row.tier1 === 'number') ? '二本' : '本科', line: row.tier2, k: 1.10 });
  if (typeof row.tier3 === 'number') tiers.push({ name: '三本', line: row.tier3, k: 0.95 });
  if (typeof row.vocational === 'number') tiers.push({ name: '专科', line: row.vocational, k: 0.80 });
  return tiers;
}

// v0.6 era admission. Returns { major, tier, k, note }.
// k comes from the tier, never from the stance (v6: stance moves the
// family line, the tier sets the study environment). No per-major
// reference line exists anymore (the fixed-offset formula is deleted);
// 调剂 as its own mechanism needs the school-tier + major-demand model
// (P1) and is not faked here.
// Below every line -> 落榜: k = 1.00 temporary, three-way fallback
// (复读 / 专科补录 / 先工作) is chosen on the signed card.
function resolveEraAdmission(state, intendedMajor) {
  const g = (state.flags && state.flags.gaokao) || {};
  const row = g.row || {};
  const eff = g.base || 0;
  const tiers = admissionTiers(row);
  for (const t of tiers) {
    if (eff >= t.line) {
      return { major: intendedMajor, tier: t.name, k: t.k, note: '' };
    }
  }
  return {
    major: intendedMajor, tier: '落榜', k: 1.0,
    note: `总分 ${eff}，没够上任何一条线：先选一条路——复读一年、等专科补录、或先工作一年。专业系数 k = 1.0（暂定）。`,
  };
}

// ---- v0.7 家庭经济 + 大事记 (design v6 §家庭经济 / §大事记) ----
// Two layers, kept apart: family TYPE (upbringing, from data.js FAMILIES)
// and the E-tier (family liquid cash at 18). The tier is rolled at S1
// (rollOrigin), independent of the type. Support willingness/accessibility
// are game parameters by family type, documented here, not hidden.
// 孤儿不自动负债 (v6): the orphan's -3 is a student-loan pocket fact,
// not a family-cash fact — the E-tier rolls normally for the guardian.
const FAMILY_ECON_TIERS = [
  { tier: 'E0', min: 0, max: 2, weight: 20, label: 'E0 · 0–2万' },
  { tier: 'E1', min: 2, max: 8, weight: 35, label: 'E1 · 2–8万' },
  { tier: 'E2', min: 8, max: 30, weight: 30, label: 'E2 · 8–30万' },
  { tier: 'E3', min: 30, max: 100, weight: 12, label: 'E3 · 30–100万' },
  { tier: 'E4', min: 100, max: 300, weight: 3, label: 'E4 · 100–300万' },
];
const FAMILY_ECON_WEIGHTS = { E0: 20, E1: 35, E2: 30, E3: 12, E4: 3 };
const FAMILY_WILLING = { model: 0.9, absentFather: 0.7, absentMother: 0.7, absentBoth: 0.6, orphan: 0.5, npd: 0.3 };
const FAMILY_ACCESS = { orphan: 0.6 }; // everyone else 1.0
const STOCKS_PROB_BY_TIER = { E0: 0.05, E1: 0.15, E2: 0.3, E3: 0.5, E4: 0.7 };

function rollFamilyEcon(rng) {
  const tier = rng.weighted(FAMILY_ECON_TIERS.map((t) => [t.tier, t.weight]));
  const def = FAMILY_ECON_TIERS.find((t) => t.tier === tier);
  // 1-decimal cash, uniform in the tier range.
  const cash = rng.int(def.min * 10, def.max * 10) / 10;
  return { tier, cash, min: def.min, max: def.max, label: def.label };
}
// Background facts the chronicle conditions need, rolled at S1.
// locale comes from the family card (data.js FAMILIES.locale).
function rollFamilyBg(rng, locale, tier) {
  const urban = locale === 'city' || locale === 'county';
  return {
    locale,
    urban,
    soe: urban ? rng.chance(0.4) : false, // 父母在国企/体制内系统
    stocks: rng.chance(STOCKS_PROB_BY_TIER[tier] || 0.1), // 家庭持有股票/基金
    trading: urban ? rng.chance(0.2) : false, // 家庭从事外贸/制造
    selfHouse: !urban ? rng.chance(0.3) : false, // 家有自建房/老房
    medical: rng.chance(0.1), // 家中有人为医护
  };
}
// Unified support capacity (design v6): the cash the family could
// actually put behind the player. Displayed on the origin + T1 cards;
// T9 borrow cap and the 三本 forced-打工 rule read it.
function supportFactor(familyKey) {
  const willing = (FAMILY_WILLING[familyKey] !== undefined) ? FAMILY_WILLING[familyKey] : 0.6;
  const access = (FAMILY_ACCESS[familyKey] !== undefined) ? FAMILY_ACCESS[familyKey] : 1;
  return willing * access;
}
function supportCash(econ, familyKey) {
  if (!econ) return 0;
  return Math.round(econ.cash * supportFactor(familyKey) * 10) / 10;
}
function familySafetyText(econ, familyKey) {
  const cap = supportCash(econ, familyKey);
  if (cap >= 8) return '家里能接住你一次，但只有一次。';
  if (cap >= 2) return '家里能帮一点，但不多。';
  return '家里接不住你——这条路得你自己走。';
}

// ---- chronicle routing (era-events.js, generated from era_events.csv) ----
// 1989 is never a game event (design v6, hard rule) — the guard lives
// here, not in the data, so a stray 1989 row can never leak in.
const ERA_TIER_ORDER = { shock: 0, family: 1, signal: 2, ambient: 3 };
function eraEventKey(ev) { return ev.year + '|' + ev.event + '|' + ev.ageMin + '-' + ev.ageMax; }
function rollKey(ev) { return ev.year + ':' + ev.event; }

function evalCond(cond, ctx, rng, rolls, ev) {
  if (!cond || typeof cond !== 'object') return true;
  if (Array.isArray(cond.any)) {
    return cond.any.some((sub) => evalCond(sub, ctx, rng, rolls, ev));
  }
  for (const k of Object.keys(cond)) {
    const v = cond[k];
    switch (k) {
      case 'any': break; // handled above
      case 'family': if (!v.includes(ctx.familyKey)) return false; break;
      case 'urban': if (ctx.bg.urban !== v) return false; break;
      case 'rural': if ((ctx.bg.locale === 'town') !== v) return false; break;
      case 'region': if (!v.includes(ctx.homeRegion)) return false; break;
      case 'soe': case 'stocks': case 'trading': case 'selfHouse': case 'medical':
        if (ctx.bg[k] !== v) return false; break;
      case 'roll': {
        const key = rollKey(ev);
        if (rolls[key] === undefined) rolls[key] = rng.chance(v);
        if (!rolls[key]) return false;
        break;
      }
      case 'examYear': if (ctx.examYear !== v) return false; break;
      case 'examYearMin': if (ctx.examYear < v) return false; break;
      case 'job': if (!!ctx.employed !== v) return false; break;
      case 'industry': if (!v.includes(ctx.jobIndustry)) return false; break;
      case 'seeking': if ((ctx.turn === 5) !== v) return false; break;
      case 'moneyMin': if ((ctx.econ && ctx.econ.cash || 0) < v) return false; break;
      default: break; // unknown keys are ignored, never block
    }
  }
  return true;
}
// The context the router reads. Built from the run state (see game.js
// eraCtx(state)): familyKey, homeRegion, bg, econ, examYear, turn,
// employed (T5+), jobIndustry (T5+).
function eventApplies(ev, ctx, rng, rolls) {
  if (!ev) return false;
  if (ev.year === 1989) return false;
  if (ev.status !== '已核实') return false; // 待核实 rows are never fact
  return evalCond(ev.cond || {}, ctx, rng, rolls, ev);
}
// All events for one (year, age): year + age window + condition.
// Sorted shock -> family -> signal -> ambient for display.
function eventsForYear(year, age, ctx, rng, rolls) {
  if (typeof ERA_EVENTS === 'undefined') return [];
  if (year === 1989) return [];
  const out = [];
  for (const ev of ERA_EVENTS) {
    if (ev.year !== year) continue;
    if (age < ev.ageMin || age > ev.ageMax) continue;
    if (!eventApplies(ev, ctx, rng, rolls)) continue;
    out.push(ev);
  }
  out.sort((a, b) => (ERA_TIER_ORDER[a.tier] - ERA_TIER_ORDER[b.tier]));
  return out;
}

// ---- chronicle application ----
// fx money ALWAYS hits family cash (the chronicle moves the family; the
// player feels it through borrow capacity / the self-funded rule).
// stress/health/family/influence hit the player's own attrs.
// shock-tier events with a money fx are the "重大波动": at most 1 per
// 3 years per family (design v6 FE rule). A throttled event is not
// logged — it did not happen to this family.
function applyEraEvent(state, rng, ev, turn, year) {
  const flags = state.flags || (state.flags = {});
  flags.eraApplied = flags.eraApplied || {};
  const key = eraEventKey(ev);
  if (flags.eraApplied[key]) return null;
  if (ev.tier === 'shock' && ev.fx && typeof ev.fx.money !== 'undefined') {
    const last = (flags.lastShockYear === undefined) ? -100 : flags.lastShockYear;
    if (year - last < 3) return null;
    flags.lastShockYear = year;
  }
  flags.eraApplied[key] = true;
  const fx = ev.fx || {};
  const bits = [];
  if (typeof fx.money !== 'undefined') {
    const econ = flags.familyEcon;
    const amt = rng.int(Math.round(fx.money[0] * 10), Math.round(fx.money[1] * 10)) / 10;
    if (econ) {
      econ.cash = Math.max(0, Math.round((econ.cash + amt) * 10) / 10);
      bits.push('家庭现金 ' + (amt >= 0 ? '+' : '−') + Math.abs(amt) + ' 万');
    }
  }
  const attrFx = [['stress', '压力'], ['health', '健康'], ['family', '家庭线'], ['influence', '影响力']];
  for (const [k, label] of attrFx) {
    if (typeof fx[k] === 'number' && fx[k] !== 0) {
      state.attrs[k] = Math.max(0, Math.min(100, (state.attrs[k] || 0) + fx[k]));
      bits.push(label + ' ' + (fx[k] > 0 ? '+' : '−') + Math.abs(fx[k]));
    }
  }
  if (typeof fx.offerMod === 'number') {
    flags.gradOfferMod = fx.offerMod;
    bits.push('求职 offer 档 ' + (fx.offerMod > 0 ? '+' : '−') + Math.abs(fx.offerMod));
  }
  const entry = {
    turn, year, event: ev.event, tier: ev.tier,
    text: year + ' 年 ' + ev.event + (bits.length ? '：' + bits.join('，') : '（' + (ev.note || '时代背景') + '）'),
  };
  state.eraLog = state.eraLog || [];
  state.eraLog.push(entry);
  return entry;
}
// The 0-18 trajectory, resolved once at S3 (retrospective): years
// birthYear..examYear-1, age = year - birthYear.
function applyEraHistory(state, rng) {
  const flags = state.flags || (state.flags = {});
  if (flags.eraHistoryDone) return [];
  flags.eraHistoryDone = true;
  const era = flags.era;
  if (!era) return [];
  const ctx = eraCtx(state);
  const rolls = flags.eraRolls || (flags.eraRolls = {});
  const applied = [];
  for (let y = era.birthYear; y < era.examYear; y++) {
    const age = y - era.birthYear;
    for (const ev of eventsForYear(y, age, ctx, rng, rolls)) {
      const e = applyEraEvent(state, rng, ev, 0, y);
      if (e) applied.push(e);
    }
  }
  return applied;
}
// One game year (turn 1-18): calendarYear = examYear + turn - 1.
function applyEraForTurn(state, rng, turn) {
  const flags = state.flags || (state.flags = {});
  const era = flags.era;
  if (!era) return [];
  const year = calendarYearForTurn(era.examYear, turn);
  const age = ageForTurn(turn);
  const ctx = eraCtx(state);
  const rolls = flags.eraRolls || (flags.eraRolls = {});
  const applied = [];
  for (const ev of eventsForYear(year, age, ctx, rng, rolls)) {
    const e = applyEraEvent(state, rng, ev, turn, year);
    if (e) applied.push(e);
  }
  return applied;
}
function eraCtx(state) {
  const flags = state.flags || {};
  const era = flags.era || {};
  const econ = flags.familyEcon || null;
  const bg = flags.familyBg || { locale: 'city', urban: true, soe: false, stocks: false, trading: false, selfHouse: false, medical: false };
  return {
    familyKey: state.origin ? state.origin.familyKey : null,
    homeRegion: state.origin ? state.origin.homeRegion : null,
    bg, econ,
    examYear: era.examYear || 0,
    turn: state.turn || 0,
    employed: !!flags.employment,
    jobIndustry: flags.jobIndustry || null,
  };
}
// Era entries for one turn, for the year screen / settlement card.
function eraLogForTurn(state, turn) {
  return (state.eraLog || []).filter((e) => e.turn === turn);
}

if (typeof module !== 'undefined') {
  module.exports = {
    ERA_BIRTH_MIN, ERA_BIRTH_MAX, ERA_BIRTH_HIGHLIGHT_MIN, ERA_BIRTH_HIGHLIGHT_MAX,
    ERA_HISTORY_PACK_MAX, examYearForBirth, birthYearForExam, calendarYearForTurn,
    ageForTurn, settlementYear, t9Year, isHistoryPack, getExamMode, EXAM_MODE_LABEL,
    ERA_TRACKS, tracksForMode, lookupLine, undergradLine, isLinePlayable,
    playableBirthYears, playableBirthYearsLabel, ERA_TIER_K, admissionTiers, resolveEraAdmission,
    FAMILY_ECON_TIERS, FAMILY_ECON_WEIGHTS, FAMILY_WILLING, FAMILY_ACCESS,
    rollFamilyEcon, rollFamilyBg, supportCash, supportFactor, familySafetyText,
    eraEventKey, eventApplies, eventsForYear, applyEraEvent, applyEraHistory,
    applyEraForTurn, eraCtx, eraLogForTurn,
  };
}
