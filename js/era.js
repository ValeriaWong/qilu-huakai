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
// 数值来源标记（WorkBuddy 机制复审 2026-11-18 要求；v1.1）：
//   [已验证] CIVIL_SERVICE_SERIES 锚点（2010 审查 144.3 万 / 招录 15,526；
//     2023 259.77 万 / 37,100；2024–26 过审 303.3 / 341.6 / 371.8 万，
//     竞争比 41:1 → 74:1）与 T9 危机锚点（下岗潮 / 供给侧 / 双减）。
//   [待 playtest] H0_TAMPER_THRESHOLD 60（假设：60 ≈“家长深度介入型
//     家庭”，需 playtest 验证触发率 5–15%）；T9_H2_PER_RISK 15pp；
//     I 值（行业修正）——三者都是游戏平衡参数，不是失业率换算。
//   [设计动机] 考公吸引力单调递增（2024–26 档 78：热度继续上行而非
//     回落）；外企可见度峰值后移（光环顶点在 2005–2012，2014 起互联网
//     大厂总包反超，2015–16 制造撤离潮）。
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

// ---- P1 (a): T9 crisis background (design v6 §时间线) ----
// crisisYear = examYear + 8. The five anchors are the named crises; any
// other exam year gets a generic crisis — '行业调整' while the crisis
// year is still real history (<= 2026), a fictional one after that.
// The crisis sets the BACKGROUND (shown on the slice) and, via the
// correction factors below, the H2 probability — it never re-rolls H2
// and never picks a different story branch by itself.
const T9_CRISIS_ANCHORS = [
  { exam: 1988, id: 'layoff-wave', label: '下岗潮', fictional: false },
  { exam: 2008, id: 'supply-side', label: '供给侧改革', fictional: false },
  { exam: 2013, id: 'double-reduction', label: '双减', fictional: false },
  { exam: 2019, id: 'fictional-2027', label: '架空情景', fictional: true },
  { exam: 2026, id: 'fictional-2034', label: '架空情景', fictional: true },
];
function t9CrisisForExamYear(examYear) {
  const crisisYear = examYear + 8;
  const anchor = T9_CRISIS_ANCHORS.find((a) => a.exam === examYear);
  if (anchor) return { id: anchor.id, label: anchor.label, crisisYear, examYear, fictional: anchor.fictional };
  if (crisisYear <= 2026) return { id: 'industry-adjustment', label: '行业调整', crisisYear, examYear, fictional: false };
  return { id: 'fictional-generic', label: '架空情景', crisisYear, examYear, fictional: true };
}
// ---- P1 (a): H2 layoff chance (ChatGPT recheck 2026-11-17, P0) ----
// The multiplicative correction factors (+15%/+20%/+5%) were REJECTED:
// no statistical basis, and relative-vs-percentage-point was undefined.
// New method — STRUCTURE FIRST. The formula is fixed; every number lives
// in a named constant table below so Allen can change the method without
// touching the functions:
//   P(H2) = clamp(5%, 85%, 20% + 15% x score + Y + I)
// score = 0-4 risk-factor hits (see engine.js layoffChance).
// Y = macro correction for the crisis year, in percentage points.
// I = industry correction for the crisis year + the player's industry,
// in percentage points. Y and I are GAME-BALANCE parameters, not
// unemployment-rate conversions. They apply ONLY to the H2 layoff
// determination, never to the other T9 crisis branches (startup /
// freelance / student / unemployed each have their own branch).
const T9_H2_BASE = 20;
const T9_H2_PER_RISK = 15;
const T9_H2_MIN = 5;
const T9_H2_MAX = 85;
// Macro correction Y by crisis year (pp). 2026-11-20 终审复审最终裁定
// （ChatGPT 混合裁定，见设计文档 v1.3 一节）：2021 0 / 2022 +3 / 2023 0，
// 取 ChatGPT 终审候选表，取代 WorkBuddy v1.1 的 +2/+5/+1。Y 是游戏平衡
// 参数 [待 playtest]，不是失业率换算，也不是任何统计口径的推算；
// 复审未采纳把逐年数值写成统计结论的写法，本注释不再逐项给现实数据
// 锚点。表只定义 2021–2023；表外年份显式默认 0（见下）。
const T9_YEAR_ADJUSTMENT = { 2021: 0, 2022: 3, 2023: 0 };
// Industry correction I by crisis year + industry (pp). 2026-11-20 终审
// 复审最终裁定（ChatGPT 混合裁定，见设计文档 v1.3 一节）：2021 互联网
// +3 / 教培 +12（学科类 only，门控见下）；2022 互联网 +5 / 线下服务
// +8 / 教培 +8（学科类 only）；2023 互联网 +3 / 教培 +2（学科类 only）。
// 其中 I 2023 互联网取 ChatGPT 裁定 +3，取代 WorkBuddy v1.1 的 +5；
// 其余值与 WorkBuddy v1.1 一致（复审确认）。I 是游戏平衡参数
// [待 playtest]，不是失业率换算；以下不再逐项给现实数据锚点。
// 表外年份显式默认 0（v1.1 显式规则）：T9 年份 = 高考年 + 8，覆盖
// 2018–2026，但表只定义 2021–2023；不在表里的年份，年修正与行业修正
// 都取 0（见下面 t9YearAdjustment / t9IndustryAdjustment 的 || 0 /
// return 0——那是这条规则的执行，不是隐式 fallback）。
// NOTE (reachability, v1.2 P1-3): T5 now offers a sector picker, so
// 教培 / 线下服务 rows are reachable: pickT5 signs the job, then the
// sector picker signs jobProfile { employerType, sector, subsector,
// policyExposure, salaryAnnual, startTurn }. T9 reads jobProfile.sector
// / subsector (engine.js layoffChance), not the company type.
const T9_INDUSTRY_ADJUSTMENT = {
  2021: { '互联网': 3, '教培': 12 },
  2022: { '互联网': 5, '线下服务': 8, '教培': 8 },
  2023: { '互联网': 3, '教培': 2 },
};
function t9YearAdjustment(crisisYear) { return T9_YEAR_ADJUSTMENT[crisisYear] || 0; }
function t9IndustryAdjustment(crisisYear, industry, subsector) {
  if (!industry) return 0;
  const row = T9_INDUSTRY_ADJUSTMENT[crisisYear];
  if (!row) return 0;
  if (industry === '教培') {
    // v1.3 (P1-3 of the 2026-11-20 re-review): 教培修正只属于学科类
    // 校外培训——2021/2022/2023 三年统一门控（v1.2 只门控了 2023）。
    // 素质 / 职业培训三个年度均返回 0；subsector 未定义时（旧存档、
    // 直接调用）取表值，保持向后兼容。
    if (subsector && subsector !== 'k12_subject_tutoring') return 0;
    return row['教培'] || 0;
  }
  if (Object.prototype.hasOwnProperty.call(row, industry)) return row[industry];
  if (industry === '互联网平台') return row['互联网'] || 0;
  return 0;
}
// The H2 chance for one player: score (0-4), crisis year, industry,
// subsector (optional; only 2023 教培 reads it).
// Pure; the tables above are the only inputs besides the arguments.
function t9H2Chance(score, crisisYear, industry, subsector) {
  const raw = T9_H2_BASE + T9_H2_PER_RISK * score + t9YearAdjustment(crisisYear) + t9IndustryAdjustment(crisisYear, industry, subsector);
  return Math.max(T9_H2_MIN, Math.min(T9_H2_MAX, raw));
}
// Which crisis branch the player is on at T9. The H2 die (sealed when
// the slice is entered) decides laid-off vs kept; the branch only shapes
// the aftermath. Grad-school, startup and freelance paths get their own
// branch (v1.2 P0-7: T5 offers 读研 / 创业 / 自由职业）.
function t9Branch(state) {
  const flags = state.flags || {};
  if (flags.gradSchool) return 'grad';
  if (flags.employment === 'freelance') return 'freelance'; // v1.2 (P0-7): 自由职业走大客户断约线，不掷 H2
  const hasVenture = (state.ventures || []).some((v) => v.status === 'active' || v.status === 'validating' || v.status === 'running');
  if (flags.employment === 'startup' || hasVenture) return 'startup';
  const h2 = flags.h2;
  if (h2 && h2.laidOff) return 'laid-off';
  const hr = state.decisions && state.decisions['hr-talk'];
  if (hr && hr.text.includes('转岗')) return 'transfer';
  if (flags.industryDown) return 'restructure';
  return 'pivot';
}
const T9_BRANCH_LABEL = {
  'laid-off': '被裁', transfer: '岗位协商', restructure: '组织调整',
  pivot: '转型', startup: '创业危机', grad: '读研危机', freelance: '自由职业危机',
};

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

// v0.6 era admission. Returns { major, tier, k, note, adjusted }.
// k comes from the tier, never from the stance (v6: stance moves the
// family line, the tier sets the study environment). No per-major
// reference line exists anymore (the fixed-offset formula is deleted).
// P1 (e): tier and major are split. The tier is set by the score alone;
// the major is matched inside the tier by demand (see
// ERA_MAJOR_DEMAND): if the score is short of the major's premium, the
// player is 调剂 to the best reachable major in the SAME tier — k does
// not drop, stress +8 and the 转专业 action unlock (applied by the
// caller, game.js pickT1). The parents' pick (省内师范) is never 调剂.
// Below every line -> 落榜: k = 1.00 temporary, three-way fallback
// (复读 / 专科补录 / 先工作) is chosen on the signed card, plus the
// P1 落榜调剂校外 option (offCampusFallback: one rung down, k −0.15).
function resolveEraAdmission(state, intendedMajor) {
  const g = (state.flags && state.flags.gaokao) || {};
  const row = g.row || {};
  const eff = g.base || 0;
  const tiers = admissionTiers(row);
  // Merged / single-line 本科： no 一本线 exists, so the school tier
  // inside 本科 is simulated from the score (P1-e).
  const sim = simulateSchoolTier(row, eff);
  if (sim) {
    const m = resolveMajorInTier(eff, row.tier2, intendedMajor);
    return { major: m.major, tier: sim.name, k: sim.k, note: m.note, adjusted: m.adjusted };
  }
  for (const t of tiers) {
    if (eff >= t.line) {
      const m = resolveMajorInTier(eff, t.line, intendedMajor);
      return { major: m.major, tier: t.name, k: t.k, note: m.note, adjusted: m.adjusted };
    }
  }
  return {
    major: intendedMajor, tier: '落榜', k: 1.0, adjusted: false,
    note: `总分 ${eff}，没够上任何一条线：先选一条路——复读一年、等专科补录、或先工作一年。专业系数 k = 1.0（暂定）。`,
  };
}

// ---- P1 (e): major-demand premiums + school-tier simulation ----
// Demand premiums (GAME ESTIMATE, not real admission data): how far above
// the tier line a score must be to land the intended major inside the
// tier. The premium only decides major vs 调剂， never admission itself.
// (WorkBuddy's 年代系数表 is the reference — e.g. 土木 was hot in 2012
// and cold by 2020 — but this table is static for now; era variation of
// demand is a refinement, not faked per year here.)
const ERA_MAJOR_DEMAND = {
  '临床医学': 100, '计算机': 80, '金融': 60, '法学': 50, '会计': 40,
  '新闻传播': 30, '师范': 20, '土木': 10, '英语': 10, '艺术设计': 0,
};
const ERA_MAJOR_DEMAND_DEFAULT = 30;
function demandPremiumForMajor(major) {
  return Object.prototype.hasOwnProperty.call(ERA_MAJOR_DEMAND, major)
    ? ERA_MAJOR_DEMAND[major] : ERA_MAJOR_DEMAND_DEFAULT;
}
// Highest-demand major the score can still land inside this tier.
function bestReachableMajorInTier(score, tierLine) {
  let best = '艺术设计', bestPremium = 0;
  for (const [name, premium] of Object.entries(ERA_MAJOR_DEMAND)) {
    if (tierLine + premium <= score && premium > bestPremium) { best = name; bestPremium = premium; }
  }
  return best;
}
// Match the intended major inside one tier. Returns { major, adjusted, note }.
function resolveMajorInTier(score, tierLine, intendedMajor) {
  if (intendedMajor === '省内师范') return { major: intendedMajor, adjusted: false, note: '' };
  const premium = demandPremiumForMajor(intendedMajor);
  if (score >= tierLine + premium) return { major: intendedMajor, adjusted: false, note: '' };
  const fb = bestReachableMajorInTier(score, tierLine);
  return {
    major: fb, adjusted: true,
    note: `总分 ${score}，${intendedMajor}要 ${tierLine + premium} 分才够，差 ${tierLine + premium - score} 分：调剂到${fb}。专业系数 k 不变，压力 +8——不是你想要的专业，读起来会别扭。以后可以转专业。`,
  };
}
// Merged / single-line 本科 (regime merged / new33 / 3+1+2 single line):
// there is no 一本线, so the school tier inside 本科 is simulated from
// the score — >= 本科线 +100 -> 高资源本科 (k 1.30), otherwise 普通本科
// (k 1.10). Split years keep their real 一本/二本 tiers (returns null).
// The +100 is a game rule, not a real admission fact.
function simulateSchoolTier(row, score) {
  if (!row || typeof row.tier2 !== 'number') return null;
  if (typeof row.tier1 === 'number') return null;
  if (score < row.tier2) return null;
  return score >= row.tier2 + 100
    ? { name: '高资源本科', k: 1.30 }
    : { name: '本科', k: 1.10 };
}
// 落榜调剂校外： one rung below the lowest tier in the row, k −0.15.
function offCampusFallback(row) {
  const tiers = admissionTiers(row);
  if (!tiers.length) return { tier: '校外专科', k: 0.65 };
  const lowest = tiers[tiers.length - 1];
  return { tier: '校外' + lowest.name, k: Math.round((lowest.k - 0.15) * 100) / 100 };
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
  // P1 (c): past 2026 there is no verified history — the year is
  // generated, not looked up (see futureScenarioForYear).
  if (year > 2026) return applyFutureForTurn(state, year, turn);
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

// ---- P1 (c): future scenario generator (2027+) ----
// 2027–2030: only the 3 settled trends, one sentence per trend per year.
// No company names, no policy names, no amounts — the trends are
// structural, not news.
const FUTURE_TRENDS = [
  { id: 'ai-jobs', label: 'AI 替代白领初级岗', lines: {
    2027: '越来越多基础文案、表格和客服类的初级岗位开始由 AI 先过一遍，人只负责最后把关。',
    2028: '初级岗的招聘要求里开始出现“会用 AI 工具”这一条，不会用的简历先被筛掉一轮。',
    2029: '有些公司的初级岗不再招新人，空出来的活分给 AI 和老员工，毕业生得从更边缘的活干起。',
    2030: '白领初级岗的门槛变了：拼的不再是会不会做，而是会不会指挥 AI 做。',
  } },
  { id: 'housing-down', label: '房地产长期下行', lines: {
    2027: '房价还在往下走，买房的人越来越少，观望的人越来越多。',
    2028: '二手房挂牌越来越多，成交周期越来越长，降价成了常态。',
    2029: '房企的债务和烂尾还在消化，买房的决策周期拉得更长。',
    2030: '房子回归居住属性的说法越来越多，但没人说得清底部在哪里。',
  } },
  { id: 'civil-hot', label: '考公考编热', lines: {
    2027: '考公考编的人数又创新高，考场外的培训班和资料摊比往年更热闹。',
    2028: '体制内岗位的竞争比继续拉大，有人考了几年还在考。',
    2029: '考公热从应届蔓延到在职，“上岸”成了朋友圈里最常见的词。',
    2030: '考公考编热还没退，但越来越多的人开始算这笔账：值得为它耗几年。',
  } },
];
function futureTrendsForYear(year) {
  if (year < 2027 || year > 2030) return [];
  return FUTURE_TRENDS.map((t) => ({ trend: t.id, label: t.label, text: t.lines[year], fictional: true }));
}
// "无大事年" fallback: one environment line + one family-internal event.
const QUIET_ENV_LINES = [
  '这一年没有大事发生，日子按部就班地过。',
  '这一年风平浪静，新闻里的大事都离你很远。',
  '这一年没什么可记的，时间就这么过去了。',
];
const QUIET_FAMILY_LINES = {
  model: '妈妈开始在电话里念叨：什么时候回家吃顿饭。',
  absentFather: '爸爸难得打来一个电话，问你最近身体怎么样。',
  absentMother: '妈妈寄来一箱家乡的特产，里面夹了一张手写的纸条。',
  absentBoth: '奶奶打电话来，说她最近身体还好，让你不用惦记。',
  orphan: '福利院的李阿姨给你发了一条消息，问你最近好不好。',
  npd: '家里又因为一件小事吵了一架，你在电话这头听完了全程。',
};
function quietYearScenario(state, year) {
  const familyKey = state.origin ? state.origin.familyKey : 'model';
  return {
    type: 'quiet', fictional: true,
    env: QUIET_ENV_LINES[year % QUIET_ENV_LINES.length],
    family: QUIET_FAMILY_LINES[familyKey] || QUIET_FAMILY_LINES.model,
  };
}
// 2031+: a fictional scenario fires ONLY when something in the player's
// own state triggers it (industry down, a live venture, a commitment due
// this turn, or family support too thin to catch them). No trigger ->
// the quiet-year template. Nothing here invents a real policy: the
// frames are generic industry/family language, marked fictional: true.
function generateFictionalScenario(state, year) {
  const flags = state.flags || {};
  if (flags.industryDown) return { type: 'scenario', id: 'industry-shakeout', label: '行业重组', fictional: true, text: '你所在的行业又一轮调整：岗位和业务线都在重新洗牌，变化先从公司内部开始，还没变成新闻里的说法。' };
  const hasVenture = (state.ventures || []).some((v) => v.status === 'active' || v.status === 'validating' || v.status === 'running');
  if (hasVenture) return { type: 'scenario', id: 'venture-headwind', label: '创业逆风', fictional: true, text: '你那条自己开的线撞上了市场变化：获客变难了，账要重新算。' };
  const due = Object.values(state.commitments || {}).some((c) => c.dueTurn === state.turn);
  if (due) return { type: 'scenario', id: 'commitment-due', label: '承诺兑现年', fictional: true, text: '这一年轮到你几年前签下的承诺兑现：当时写下的那句话，现在要拿出来对照。' };
  const econ = flags.familyEcon;
  if (econ && supportCash(econ, state.origin ? state.origin.familyKey : null) < 2) return { type: 'scenario', id: 'family-strain', label: '家里吃紧', fictional: true, text: '家里的经济状况吃紧，这一年的大事不是外面的世界，是家里的账本。' };
  return quietYearScenario(state, year);
}
function futureScenarioForYear(state, year) {
  if (year >= 2027 && year <= 2030) return { type: 'trends', lines: futureTrendsForYear(year), fictional: true };
  if (year >= 2031) return generateFictionalScenario(state, year);
  return null;
}
// Future years land in the same eraLog the year screen reads (idempotent
// per year, like the history path). Fictional entries carry fictional:
// true and a （未来推演·虚构） marker in the text.
function applyFutureForTurn(state, year, turn) {
  const flags = state.flags || (state.flags = {});
  flags.eraApplied = flags.eraApplied || {};
  const key = 'future|' + year;
  if (flags.eraApplied[key]) return [];
  flags.eraApplied[key] = true;
  const sc = futureScenarioForYear(state, year);
  if (!sc) return [];
  const entries = [];
  const push = (event, label, text) => {
    const e = { turn, year, event, tier: 'signal', text: year + ' 年 ' + label + '：' + text + '（未来推演·虚构）', fictional: true };
    state.eraLog = state.eraLog || [];
    state.eraLog.push(e);
    entries.push(e);
  };
  if (sc.type === 'trends') {
    for (const line of sc.lines) push(line.trend, line.label, line.text);
  } else if (sc.type === 'scenario') {
    push(sc.id, sc.label, sc.text);
  } else {
    push('quiet-env', '无大事年', sc.env);
    push('quiet-family', '家里', sc.family);
  }
  return entries;
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

// ---- P1 (d): H0 tamper conditions (design v6 §H0 与志愿篡改) ----
// H0 stays the birth-family intervention tendency (an initial parameter
// only). Tampering needs ALL of: a strong H0 (>= H0_TAMPER_THRESHOLD), a
// parent who actually holds the account, a system that allows it, and no
// SUBMITTED confirmation by the player yet. Two levels (WorkBuddy 复审
// 2026-11-18, v1.1): choosing a major/stance on the T1 screen is only a
// draft (flags.t1ChoiceMade) — it does NOT confirm; only the explicit
// 提交确认 button sets flags.t1Confirmed. A draft-only player is still
// exposed; a fully submitted player is protected. The remedy window is
// the T1 pick itself: submitting confirms the player's own填报 and ends
// the tamper (game.js sets flags.t1Confirmed on t1-confirm).
// Tamperer is PARENTS ONLY (Allen 2026-11-20 定：篡改者只写家长，不加
// 篡改者字段）。同学 / 老师篡改志愿有真实例子，但那是另一条统计（刑事
// 案件里同学 / 老师占主导，家长约 0——家长改志愿是家内事，不进刑事
// 统计；戴柳 / 张来玉等家长改志愿案子另有记录），不进本机制。
// Account access by family structure — v1.2 (P1-2): this table is now
// only the LEGACY fallback for saves made before v1.2 (they never stored
// h0Access). New runs store flags.h0Access, rolled at S1 by
// rollH0Access (game.js) from a family PRIOR, not a table lookup: a
// present parent usually holds the account, a grandparent guardian
// (absentBoth) or no parent at all (orphan) never does — but even an
// NPD parent with access does not always tamper (strength is a separate
// roll, rollH0, spread -40/+20 so no family guarantees h0 >= 60).
const H0_ACCOUNT_ACCESS = { model: true, absentFather: true, absentMother: true, absentBoth: false, orphan: false, npd: true };
// System by year: before 2013填报 was largely onsite (school computer
// room / paper forms) — a parent could only change it by showing up in
// person. From 2013 the online account is enough: whoever holds the
// password can change it. (Game simplification; the exact provincial
// switch year varies. 2026 UI logic is never applied to 2010 as-is.)
// [PLACEHOLDER] H0_TAMPER_THRESHOLD 60 ≈ “家长深度介入型家庭”——假设值，
// 需 playtest 验证触发率 5–15%（见本文件顶部“数值来源标记”）。
const H0_TAMPER_THRESHOLD = 60;
function h0SystemForYear(examYear) {
  return examYear < 2013 ? 'onsite' : 'online';
}
function h0TamperFactors(state) {
  const h0 = (state.sealed && state.sealed.H0) || null;
  const familyKey = state.origin ? state.origin.familyKey : null;
  const examYear = (state.flags && state.flags.era && state.flags.era.examYear) || 2026;
  const storedAccess = state.flags && typeof state.flags.h0Access === 'boolean' ? state.flags.h0Access : null;
  return {
    h0: h0 ? h0.value : 0,
    // v1.2 (P1-2): parentHasAccess is the stored roll when present;
    // legacy saves fall back to the family table. Tampering still needs
    // h0 >= 60 AND access AND no submitted confirmation.
    parentsHaveAccount: storedAccess !== null ? storedAccess : H0_ACCOUNT_ACCESS[familyKey] === true,
    system: h0SystemForYear(examYear),
    // playerConfirmed = SUBMITTED confirmation (t1-confirm), not the
    // draft choice. choiceMade = a stance was picked on the T1 screen
    // but not yet submitted. Draft-only still counts as tampered.
    playerConfirmed: !!(state.flags && state.flags.t1Confirmed),
    choiceMade: !!(state.flags && state.flags.t1ChoiceMade),
    remedyAvailable: true,
  };
}
function isH0Tampered(state) {
  const f = h0TamperFactors(state);
  return f.h0 >= H0_TAMPER_THRESHOLD && f.parentsHaveAccount && !f.playerConfirmed;
}

// Unified era context (recheck general opinion): every era lookup reads
// the SAME calendar year + cohort state, so a 2015-cohort player in 2023
// uses 2023's environment, not 2015's. Fields: examYear (cohort),
// calendarYear (the year being played), turn, age, industry (the
// player's job industry, if any), gradYear (examYear + 4 — the year the
// player actually makes the 考公 / job-market decision), crisisYear
// (examYear + 8 — the T9 year).
function eraContextFor(state, turn) {
  const era = (state.flags && state.flags.era) || null;
  const examYear = era ? era.examYear : 2026;
  return {
    examYear,
    calendarYear: calendarYearForTurn(examYear, turn),
    turn,
    age: ageForTurn(turn),
    // v1.2 (P1-3): industry is the Chinese display name (sectorName),
    // not the sector id — era event text and the I table read it.
    industry: ((state.flags && state.flags.jobProfile && (state.flags.jobProfile.sectorName || state.flags.jobProfile.sector)) || (state.flags && state.flags.jobIndustry)) || null,
    gradYear: examYear + 4,
    crisisYear: examYear + 8,
  };
}

// ---- P1 (f): civil-service / NPC contact / foreign firms ----
// (ChatGPT recheck 2026-11-17. STRUCTURE FIRST: every number below lives
// in a named constant table so Allen can change the method without
// touching the functions. The design doc's numbers are NOT used here —
// the recheck corrected or rejected them. All lookups take the DECISION
// / calendar year — the graduation year for 考公 and foreign firms —
// never the exam year alone.)
// --- 考公： verified series. Fields per anchor year: applicants = 通过
// 资格审查 (万人）, planned = 计划招录 (人）, ratio = 审查人数/招录比
// (:1), actual = 实际参考 (万人）, actualRatio = 实际竞争比 (:1).
// Anchors only (2010, 2023). Between them the values are LINEAR
// INTERPOLATION, flagged interpolated: true — not measured data. Outside
// the anchor range the function returns null (no extrapolation, no
// silent clamping to an anchor year).
// Note the recheck's warning: 报名涨不等于单岗竞争同比例涨 — 招录也在
// 扩 (15,526 -> 37,100), so the ratio, not the raw applicant count, is
// the competition signal.
const CIVIL_SERVICE_SERIES = {
  2010: { applicants: 144.3, planned: 15526, ratio: 93, actual: 92.7, actualRatio: 60 },
  2023: { applicants: 259.77, planned: 37100, ratio: 70, actual: 152.5, actualRatio: 41 },
};
function civilServiceStats(year) {
  const years = Object.keys(CIVIL_SERVICE_SERIES).map(Number).sort((a, b) => a - b);
  const lo = years[0], hi = years[years.length - 1];
  if (year < lo || year > hi) return null;
  const a = CIVIL_SERVICE_SERIES[lo], b = CIVIL_SERVICE_SERIES[hi];
  if (year === lo) return { year: lo, ...a, interpolated: false };
  if (year === hi) return { year: hi, ...b, interpolated: false };
  const t = (year - lo) / (hi - lo);
  const mix = (x, y) => Math.round((x + (y - x) * t) * 10) / 10;
  return {
    year,
    applicants: mix(a.applicants, b.applicants),
    planned: Math.round(a.planned + (b.planned - a.planned) * t),
    ratio: mix(a.ratio, b.ratio),
    actual: mix(a.actual, b.actual),
    actualRatio: mix(a.actualRatio, b.actualRatio),
    interpolated: true,
  };
}
// 考公吸引力权重 (0-100, NOT a measured probability) by decision year.
// Monotonic by design (v1.1, WorkBuddy 复审 2026-11-18): 2024–2026 档
// 78——热度继续上行而非回落（原 72 已废）。2026-11-20 终审复审最终裁定
// 确认：2024–26 取 WorkBuddy 78（不取 ChatGPT 候选 76）。78 是
// GAME_BALANCE 权重；人数/竞争比是已验证的公开系列数据，仅作单调
// 趋势的背景，不推导 78。国考过审人数 2024 303.3 万、
// 2025 341.6 万、2026 371.8 万，竞争比 41:1 → 74:1，录取率 1.1%，
// 是 2010 年代后期唯一比 2009 年高考（5.98%）更难的考试；2022 届
// 本科生“最优解”、2023 届 60% 以上想考、2024 届“近半数毕业就考公”，
// 中间年份没有回落拐点。Outside the table the function returns null
// (2027+ is fictional — no band).
const CIVIL_SERVICE_APPEAL_BANDS = [
  { from: 2010, to: 2013, appeal: 55 },
  { from: 2014, to: 2016, appeal: 58 },
  { from: 2017, to: 2019, appeal: 62 },
  { from: 2020, to: 2021, appeal: 68 },
  { from: 2022, to: 2023, appeal: 75 },
  { from: 2024, to: 2026, appeal: 78 },
];
function civilServiceAppeal(decisionYear) {
  const band = CIVIL_SERVICE_APPEAL_BANDS.find((b) => decisionYear >= b.from && decisionYear <= b.to);
  return band ? band.appeal : null;
}
// The 0-1 weight form of the appeal (for any mechanical use). Null
// outside the table, same as civilServiceAppeal.
function civilServiceWeight(decisionYear) {
  const appeal = civilServiceAppeal(decisionYear);
  return appeal === null ? null : appeal / 100;
}
// The narrative replaces the REJECTED "2010 被嘲退路 / 2020 最优解"
// one-way story (2010 was already ~93:1 with stability and family
// approval; a 2020 届 student graduates in 2024, not 2020). Two bands,
// the recheck's wording. Null outside the table.
const CIVIL_SERVICE_NARRATIVES = [
  { from: 2010, to: 2019, text: '2010 年代中期考公已有较强竞争，但市场化路线亦强。' },
  { from: 2020, to: 2026, text: '2020 年代初因毕业生规模扩大、部分行业收缩，考公成为更多人眼中重要的稳定选择。' },
];
function civilServiceNarrative(decisionYear) {
  const band = CIVIL_SERVICE_NARRATIVES.find((b) => decisionYear >= b.from && decisionYear <= b.to);
  return band ? band.text : null;
}
// --- NPC 联系方式： multi-channel coexistence, primacy shifts. ---
// Each band lists the channels in primacy order (first = primary).
// 微信 was NOT the default in 2011 (launched Jan 2011, >200M registered
// users only Sep 2012); QQ still dominated 2010-2011 (~79.4% usage Jun
// 2011). 人人网 stayed active 2011-2013; 微博 from 2010 (launched Aug
// 2009, mainstream by 2010 — the 2006–2010 band is split into 2006–2009
// without it and a 2010-only band with it, so 2010 is the exact start).
// 开心网 2008–2012 (peak ~2010) sits in 2006–2009 and 2010. 陌陌 from
// 2013 (launched Aug 2011, mainstream 2013). 小红书 from 2017 (launched
// 2013, mainstream as a social channel 2017+). 短信 is never deleted
// after 2013 (still used for notices and verification). 抖音 is a
// content channel (launched Sep 2016, popular after 2017) — no 抖音 DM /
// live-commerce in 2015. Bands are cut on integer calendar years:
// npcContactForYear is called with examYear-onward calendar years
// (2008+) and gradYear, so a 2010-only band behaves correctly.
const NPC_CONTACT_PERIODS = [
  { from: 2000, to: 2005, channels: ['QQ', '短信', '电话', '邮件', '论坛'] },
  { from: 2006, to: 2009, channels: ['QQ', 'QQ空间', '人人', '开心网', '博客', '短信', '电话', '邮件'] },
  { from: 2010, to: 2010, channels: ['QQ', 'QQ空间', '人人', '开心网', '博客', '微博', '短信', '电话', '邮件'] },
  { from: 2011, to: 2012, channels: ['QQ', '短信', '电话', '微博', '早期微信', '人人'] },
  { from: 2013, to: 2014, channels: ['微信', 'QQ', '短信', '电话', '微博', '邮件', '陌陌'] },
  { from: 2015, to: 2016, channels: ['微信', 'QQ', '短信', '电话', '微博', '邮件', '陌陌', '钉钉', '脉脉'] },
  { from: 2017, to: 2019, channels: ['微信', 'QQ', '短信', '电话', '微博', '邮件', '陌陌', '钉钉', '脉脉', '企业微信', '抖音', '小红书'] },
  { from: 2020, to: 2026, channels: ['微信', 'QQ', '短信', '电话', '微博', '邮件', '陌陌', '钉钉', '脉脉', '企业微信', '抖音', '飞书', '小红书'] },
];
function npcContactForYear(year) {
  const band = NPC_CONTACT_PERIODS.find((b) => year >= b.from && year <= b.to);
  if (band) return band.channels.slice();
  if (year < NPC_CONTACT_PERIODS[0].from) return NPC_CONTACT_PERIODS[0].channels.slice();
  return NPC_CONTACT_PERIODS[NPC_CONTACT_PERIODS.length - 1].channels.slice();
}
// The instant-messaging channel a "probe" message would use that year —
// for the slice's "先发微信探探口风" option. Before 2013 微信 is not the
// default (see above), so the probe goes by QQ.
function npcInstantChannel(year) {
  return year < 2013 ? 'QQ消息' : '微信';
}
// --- 外企线： opportunity visibility weight by labour-market entry year
// (graduation year = examYear + 4), NOT the exam year. The recheck
// REJECTED "2015 强 / 2018 后改出海线": 2015 is not the end of the
// P&G / Big4 / consulting window, and 出海 is a parallel route for
// Chinese firms — not a replacement for foreign firms' China jobs
// (local posts, regional HQ, R&D / manufacturing / finance / supply
// chain / compliance). 2018+ is "分化为主，伴随局部收缩和转型".
// v1.1 (WorkBuddy 复审 2026-11-18): the peak is moved earlier —
// 2014–2017 78 (not 90) and 2018–2020 75 (not 80). The foreign-firm
// halo peaked 2005–2012; from 2014 internet giants' total packages
// overtook foreign firms', and the 2015–16 manufacturing exodus
// (Suzhou / Dongguan / Shanghai factory closures) removed the
// factory-side channel. 2015–16 was the inflection, not the peak.
// v1.3 (P1-4, 终审复审 2026-11-20 最终裁定）：2014–2017 取 ChatGPT
// 裁定 82（取代 WorkBuddy v1.1 的 78；复审理由：不能把部分外资制造
// 企业调整概括为外企机会全面衰退），2018–2020 75 不变（复审确认）。
// 以下 weight 均为 GAME_BALANCE 机会可见度参数，不是招聘率。
// Differentiation by city / major / language / industry / player
// initiative is later work, not faked here.
// Returns { weight, fictional } — 2027+ is fictional (no band).
const FOREIGN_FIRM_VISIBILITY_BANDS = [
  { from: 2010, to: 2013, weight: 80 },
  { from: 2014, to: 2017, weight: 82 },
  { from: 2018, to: 2020, weight: 75 },
  { from: 2021, to: 2022, weight: 70 },
  { from: 2023, to: 2024, weight: 75 },
  { from: 2025, to: 2026, weight: 75 },
];
function foreignFirmVisibility(entryYear) {
  const band = FOREIGN_FIRM_VISIBILITY_BANDS.find((b) => entryYear >= b.from && entryYear <= b.to);
  if (band) return { weight: band.weight, fictional: false };
  if (entryYear < FOREIGN_FIRM_VISIBILITY_BANDS[0].from) return { weight: FOREIGN_FIRM_VISIBILITY_BANDS[0].weight, fictional: false };
  return { weight: null, fictional: true };
}

// --- P1 (b): 创业年代技术表 (WorkBuddy 复审 2026-11-18, v1.1) ---
// The venture "era adapter": when a player starts a venture in a given
// calendar year, tech that did not exist yet is NOT silently overwritten
// and the player's wish is NOT negated — the confirm screen shows what
// was available then and the player chooses one of three responses
// (adapt to era tech now / defer the note until the tech exists /
// validate a simpler era-appropriate variant); refusing the rewrite
// keeps the original idea as a DEFERRED note, never silently creates a
// product that did not exist in that era (three principles: 不否定玩家
// 愿望 / 不自动覆盖 / 由玩家确认；see game.js idea-start →
// renderIdeaConfirm → idea-confirm). The table is the data;
// adaptVentureTech is the detector; the UI lives in game.js.
// Segments (year = calendar year of the venture start):
//   1988–93 PC 单机时代（拨号上网之前，软件卖光盘）
//   1994–99 互联网早期（1994 年中国接入国际互联网）
//   2000–05 宽带 / 搜索 / 电商萌芽（百度 2000、淘宝 2003、QQ 1999 上线后起势）
//   2006–09 Web 2.0 / 社交 / 移动前夜（人人 / 开心 2008、iPhone 2007）
//   2010–12 规则 / 关键词 / 传统 ML (rules, keyword matching, classic ML)
//   2013–15 传统 NLP / 推荐 + 移动互联网 / 公众号 / O2O；词向量
//            (word2vec, released 2013) belongs to this segment
//   2016–18 深度学习 NLP + 短视频 / 直播电商 / 小程序；区块链
//            2017–18 一波可选 (optional, not the segment's core)
//   2019–21 BERT (pretrained transformers)
//   2022–23 ChatGPT 式生成式 AI (late 2022 onward; year granularity —
//            a 2022 venture is treated as able to use late-2022 tech,
//            since the game tracks years, not months)
//   2024–26 RAG / Agent (retrieval-augmented + agentic systems)
//   2027+  架空 (fictional — no adaptation needed; any tech goes)
// v1.2 (P1-5): 1988–2009 不再以一个技术等级概括，内部按产品上线年代
// 拆成四段；1988 年以前 clamp 到第一段（游戏最早 1988 年出生）。
const VENTURE_TECH_SEGMENTS = [
  { from: 1988, to: 1993, label: 'PC 单机时代', tech: ['单机软件', '个人电脑', '办公软件'], note: '拨号上网之前，软件卖光盘。' },
  { from: 1994, to: 1999, label: '互联网早期', tech: ['门户网站', '电子邮件', '拨号上网'], note: '1994 年中国接入国际互联网。' },
  { from: 2000, to: 2005, label: '宽带 / 搜索 / 电商萌芽', tech: ['搜索引擎', '电子商务', '即时通讯', '网络游戏'], note: '百度 2000、淘宝 2003、QQ 1999 上线后起势。' },
  { from: 2006, to: 2009, label: 'Web 2.0 / 社交 / 移动前夜', tech: ['社交网络', '博客', '视频网站', '智能手机'], note: '人人 / 开心 2008、iPhone 2007，移动互联网前夜。' },
  { from: 2010, to: 2012, label: '规则 / 关键词 / 传统 ML', tech: ['规则引擎', '关键词匹配', '传统机器学习', '决策树', '逻辑回归'], note: '没有深度学习，也没有移动互联网红利。' },
  { from: 2013, to: 2015, label: '传统 NLP / 推荐 + 移动互联网', tech: ['传统 NLP', '推荐系统', '词向量', '微信公众号', 'O2O', '移动互联网'], note: '词向量（word2vec）2013 年发布，放在这一段。' },
  { from: 2016, to: 2018, label: '深度学习 NLP + 短视频 / 直播电商', tech: ['深度学习', '短视频', '直播电商', '小程序', '深度学习 NLP'], note: '区块链 2017–18 一波可选，不作主线。' },
  { from: 2019, to: 2021, label: 'BERT 时代', tech: ['BERT', '预训练模型', 'Transformer'], note: '预训练 + 微调成为主流。' },
  { from: 2022, to: 2023, label: 'ChatGPT 式生成式 AI', tech: ['生成式 AI', '大模型', 'ChatGPT', '对话机器人'], note: '2022 末 ChatGPT 发布；按年粒度，2022 年的创业视为可用 2022 末的技术（一年只记年份，不分月）。' },
  { from: 2024, to: 2026, label: 'RAG / Agent', tech: ['RAG', 'Agent', '智能体', '检索增强'], note: '检索增强 + 智能体成为创业主线。' },
  { from: 2027, to: 9999, label: '架空', tech: [], note: '2027+ 为架空年份，任何技术都可用，不做年代适配。' },
];
// The segment for a calendar year. Pre-1988 clamps to the first segment;
// 2027+ returns the fictional segment (tech: [] = no adaptation).
function ventureTechForYear(year) {
  for (const s of VENTURE_TECH_SEGMENTS) {
    if (year >= s.from && year <= s.to) return s;
  }
  return year < 1988 ? VENTURE_TECH_SEGMENTS[0] : VENTURE_TECH_SEGMENTS[VENTURE_TECH_SEGMENTS.length - 1];
}
// Earliest year each tech keyword becomes available (the year a venture
// in that year can first rely on it). Keywords not in this list (plain
// ideas like 奶茶店） never trigger. Matching is substring-based on the
// player's free text, case-insensitive for the Latin tokens (RAG / BERT /
// ChatGPT / word2vec). Year granularity: a keyword dated to year Y is
// available to ventures in year Y and later.
const VENTURE_TECH_EARLIEST = [
  { re: /ChatGPT|生成式|大模型|生成式\s*AI|GPT/i, year: 2022, name: '生成式 AI' },
  { re: /RAG|Agent|智能体|检索增强/i, year: 2024, name: 'RAG / Agent' },
  { re: /BERT|预训练|Transformer/i, year: 2019, name: 'BERT' },
  { re: /深度学习|deep\s*learning/i, year: 2016, name: '深度学习' },
  { re: /短视频|直播|抖音|小程序/i, year: 2016, name: '短视频 / 直播' },
  { re: /区块链|blockchain/i, year: 2017, name: '区块链' },
  { re: /公众号|O2O|移动互联网|推荐系统|推荐算法/i, year: 2013, name: '移动互联网 / 推荐' },
  { re: /词向量|word2vec/i, year: 2013, name: '词向量' },
  // v1.2 (P1-5): 1988–2009 的产品上线年代——2008 年想开网店、做搜索、
  // 做社交，都要按这一年有没有这个东西算。
  { re: /电商|淘宝|网购|网上购物/i, year: 2003, name: '电子商务' },
  { re: /搜索引擎|搜索|百度|谷歌/i, year: 2000, name: '搜索引擎' },
  { re: /社交|人人|开心网|校内/i, year: 2005, name: '社交网络' },
  { re: /智能手机|\bapp\b|移动应用|手机应用/i, year: 2008, name: '智能手机 / 移动应用' },
  { re: /互联网|网站|门户|上网/i, year: 1994, name: '互联网 / 网站' },
];
// Detect era-unavailable tech in a venture idea for a calendar year.
// Returns { needed, requested, segment, available, deferUntil }:
// needed = false when nothing in the text is era-unavailable (plain
// ideas, or tech that already existed that year, or the fictional 2027+
// segment). requested = the unavailable tech names found; segment = the
// year's segment; available = that segment's tech list (the replacement
// options); deferUntil = the earliest year ALL requested tech exists
// (the year a deferred idea becomes creatable — the UI must NOT name
// it to the player: "延后建议" never spoils future tech, it only says
// the tech does not exist yet and the note is kept).
function adaptVentureTech(text, year) {
  const segment = ventureTechForYear(year);
  if (segment.label === '架空') return { needed: false, requested: [], segment, available: [], deferUntil: null };
  const requested = [];
  let deferUntil = null;
  for (const k of VENTURE_TECH_EARLIEST) {
    if (k.year > year && k.re.test(text)) {
      requested.push(k.name);
      deferUntil = deferUntil === null ? k.year : Math.max(deferUntil, k.year);
    }
  }
  if (requested.length === 0) return { needed: false, requested: [], segment, available: [], deferUntil: null };
  return { needed: true, requested, segment, available: segment.tech.slice(), deferUntil };
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
    T9_CRISIS_ANCHORS, t9CrisisForExamYear,
    T9_H2_BASE, T9_H2_PER_RISK, T9_H2_MIN, T9_H2_MAX,
    T9_YEAR_ADJUSTMENT, T9_INDUSTRY_ADJUSTMENT,
    t9YearAdjustment, t9IndustryAdjustment, t9H2Chance,
    t9Branch, T9_BRANCH_LABEL,
    FUTURE_TRENDS, futureTrendsForYear, quietYearScenario, generateFictionalScenario,
    futureScenarioForYear, applyFutureForTurn,
    H0_ACCOUNT_ACCESS, H0_TAMPER_THRESHOLD, h0SystemForYear, h0TamperFactors, isH0Tampered,
    ERA_MAJOR_DEMAND, ERA_MAJOR_DEMAND_DEFAULT, demandPremiumForMajor,
    bestReachableMajorInTier, resolveMajorInTier, simulateSchoolTier, offCampusFallback,
    eraContextFor,
    CIVIL_SERVICE_SERIES, civilServiceStats,
    CIVIL_SERVICE_APPEAL_BANDS, civilServiceAppeal, civilServiceWeight,
    CIVIL_SERVICE_NARRATIVES, civilServiceNarrative,
    NPC_CONTACT_PERIODS, npcContactForYear, npcInstantChannel,
    FOREIGN_FIRM_VISIBILITY_BANDS, foreignFirmVisibility,
    VENTURE_TECH_SEGMENTS, VENTURE_TECH_EARLIEST, ventureTechForYear, adaptVentureTech,
  };
}
