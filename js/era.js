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

// ---- admission tiers (v6 Q3: k = study-environment coefficient) ----
// split years: 一本 1.30 / 二本 1.10 / 三本 0.95 (only when the tier3 line
// exists) / 专科 0.80 (only when a vocational line exists).
// merged / new33 years: a single 本科 tier at 1.10 + 专科 0.80 if present.
// (School-tier differentiation inside merged 本科 is P1 work, not a
// resurrected 一本线 — see design doc v6.)
const ERA_TIER_K = { '一本': 1.30, '二本': 1.10, '三本': 0.95, '本科': 1.10, '专科': 0.80 };
function admissionTiers(row) {
  if (!row) return [];
  const tiers = [];
  if (row.regime === 'split') {
    if (typeof row.tier1 === 'number') tiers.push({ name: '一本', line: row.tier1, k: 1.30 });
    if (typeof row.tier2 === 'number') tiers.push({ name: '二本', line: row.tier2, k: 1.10 });
    if (typeof row.tier3 === 'number') tiers.push({ name: '三本', line: row.tier3, k: 0.95 });
  } else {
    // merged / new33 (regime may be null for to_verify rows — same shape)
    if (typeof row.tier2 === 'number') tiers.push({ name: '本科', line: row.tier2, k: 1.10 });
  }
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

if (typeof module !== 'undefined') {
  module.exports = {
    ERA_BIRTH_MIN, ERA_BIRTH_MAX, ERA_BIRTH_HIGHLIGHT_MIN, ERA_BIRTH_HIGHLIGHT_MAX,
    ERA_HISTORY_PACK_MAX, examYearForBirth, birthYearForExam, calendarYearForTurn,
    ageForTurn, settlementYear, t9Year, isHistoryPack, getExamMode, EXAM_MODE_LABEL,
    ERA_TRACKS, tracksForMode, lookupLine, undergradLine, isLinePlayable,
    playableBirthYears, ERA_TIER_K, admissionTiers, resolveEraAdmission,
  };
}
