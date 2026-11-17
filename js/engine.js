'use strict';
/**
 * Game engine for 《歧路花开》 v5 — state, seeded RNG, sealed dice, save/load.
 *
 * Fairness rule (from the design doc): a die is rolled ONCE, at the moment a
 * commitment is signed, and written into the save. The reveal stage only
 * reads the stored value — it never re-rolls. The RNG stream position is
 * persisted too, so a reload cannot change any future roll either.
 *
 * 征兆 (omens): when a die is sealed, 1–3 omen lines are generated. Each omen
 * is accurate with 65% probability (rolled once, stored). The player sees
 * only the text; the truth is revealed at兑现 time.
 */
const SAVE_KEY = 'qilu-huakai-save-v1';
const META_KEY = 'qilu-huakai-meta-v1';
const VERSION = 1;

function blankAttrs() {
  return { money: 0, health: 70, skill: 20, express: 20, network: 20, influence: 20, stress: 20, debt: 0, family: 0 };
}

function newRun(seed, opts) {
  return {
    version: VERSION,
    seed,
    rngState: seed >>> 0,
    runNumber: opts.runNumber || 1,
    slot: opts.slot || 1,
    mode: opts.mode || 'full', // 'full' = S0->T9, 'slice' = straight to the 26-year-old slice
    difficulty: opts.difficulty || 'normal',
    obsessions: opts.obsessions || [],
    age: 18,
    turn: 0, // T0 = opening; T1..T9 = years
    ap: 3,
    attrs: blankAttrs(),
    origin: null,       // { familyKey, card, fragments, counterShown }
    rewrite: null,      // { text, tags, origin } when S4-A was used
    sealed: {},         // name -> { value, rolledAt, omens: [{text, true}] }
    commitments: {},    // id -> { text, signedAt, snapshot, dueTurn }
    omenLog: [],        // { turn, text } — every omen ever shown, for兑现回放
    lessons: [],        // 教训卡 (cross-run, information only)
    flags: {},          // arbitrary booleans: e.g. acceptedFate, usedRewrite
    yearlyLog: [],      // settlement cards
    decisions: {},      // T9 slice decisions
    ventures: [],       // 赚钱点子的专属线（可经营项目）
    ideaNotes: [],      // 记下来、还没开始的点子
    finished: false,
    createdAt: new Date().toISOString(),
  };
}

// ---- persistence ----
function saveGame(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.version === VERSION ? s : null;
  } catch (e) {
    return null;
  }
}

function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

function checksum(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Save code: seed + sealed dice travel with the save, so export/import is exact.
function exportCode(state) {
  const payload = JSON.stringify(state);
  return 'QILU1-' + checksum(payload) + '-' + btoa(unescape(encodeURIComponent(payload)));
}

function importCode(code) {
  try {
    const m = String(code).trim().match(/^QILU1-([0-9a-z]+)-(.+)$/);
    if (!m) return { ok: false, error: '存档码格式不对。' };
    const payload = decodeURIComponent(escape(atob(m[2])));
    if (checksum(payload) !== m[1]) return { ok: false, error: '校验失败：存档码可能被改过或复制不完整。' };
    const s = JSON.parse(payload);
    if (!s || s.version !== VERSION) return { ok: false, error: '存档版本不对。' };
    return { ok: true, state: s };
  } catch (e) {
    return { ok: false, error: '存档码读不出来：' + e.message };
  }
}

// ---- meta (slots + lessons, shared across runs) ----
function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fall through */ }
  return { slots: [{ id: 1, unlocked: true }, { id: 2, unlocked: false }, { id: 3, unlocked: false }], lessons: [], runsFinished: 0 };
}

function saveMeta(meta) {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) { /* ignore */ }
}

// ---- pressure tiers + debt ----
function pressureTier(stress) {
  if (stress < 40) return { id: 'calm', name: '稳', color: 'green' };
  if (stress < 70) return { id: 'tense', name: '紧绷', color: 'yellow' };
  if (stress <= 100) return { id: 'break', name: '崩', color: 'red' };
  return { id: 'overflow', name: '溢出', color: 'red' };
}

// Yearly settlement: baseline work costs +4 stress, actions already applied,
// then natural recovery (difficulty), debt accrual / repayment.
function settleYear(state, diff) {
  const a = state.attrs;
  const before = { ...a };
  a.stress += 4; // 主线工作基线消耗
  a.stress += diff.recovery; // 年度自然恢复（负数 = 恢复）
  if (a.stress > 100) { // 溢出：每溢出 1 点 → 健康 −1，压力回落到 100
    a.health -= (a.stress - 100);
    a.stress = 100;
  }
  const tier = pressureTier(a.stress);
  if (tier.id === 'tense' || tier.id === 'break') {
    a.debt = Math.min(5, a.debt + 1);
  }
  if (tier.id === 'tense') a.health -= 3;
  if (tier.id === 'break') {
    a.health -= 8;
    state.flags.nextYearApPenalty = 1; // 次年 AP −1（强制休整）
  }
  if (a.debt >= 3) a.health -= 2 * a.debt; // Debt 从第 3 年起计息
  if (tier.id === 'calm') {
    state.flags.calmStreak = (state.flags.calmStreak || 0) + 1;
    if (state.flags.calmStreak >= 2 && a.debt > 0) { a.debt -= 1; state.flags.calmStreak = 0; }
  } else {
    state.flags.calmStreak = 0;
  }
  if (a.debt >= 5 && !state.flags.somatized) {
    state.flags.somatized = true;
    a.health -= 20;
    state.yearlyLog.push({ turn: state.turn, type: 'somatize', text: 'Debt 到顶了：躯体化事件。强制 −2 AP、健康 −20。那次住院之后，你开始重新算账。' });
  }
  a.health = Math.max(0, Math.min(100, a.health));
  a.stress = Math.max(0, a.stress);
  return { before, after: { ...a }, tier: tier.id };
}

// ---- sealed dice ----
function sealDie(state, rng, name, value, omens) {
  // omens: [{text, accurate}] — accuracy rolled here, once.
  const sealed = {
    value,
    rolledAt: `T${state.turn}`,
    omens: omens.map((o) => ({ text: o.text, accurate: rng.chance(0.65) })),
  };
  state.sealed[name] = sealed;
  for (const o of sealed.omens) state.omenLog.push({ turn: state.turn, text: o.text, die: name });
  return sealed;
}

// ---- commitment formulas (design doc; shown to the player only as 3 tiers) ----
function offerTier(state) {
  const a = state.attrs;
  let tier = Math.floor(((a.skill * 0.5 + a.express * 0.3 + a.network * 0.2) / 100) * 4) + 1;
  tier += state.flags.degreeBonus || 0; // 一本 +0.5 / 专科 −0.5 (stored as 0.5 steps)
  tier += state.flags.gradOfferMod || 0; // v0.7: 2022 届毕业潮 offer 档 −1 (大事记)
  if (state.flags.parentArranged) tier += 1;
  if (state.flags.industryDown) tier -= 1;
  return Math.max(1, Math.min(4, Math.round(tier)));
}

function layoffChance(state) {
  // H2: score = hits of 4 risk factors (highPay / no protector / low KPI
  // / shrinking dept). The chance itself is computed by t9H2Chance
  // (era.js) — see below.
  const a = state.attrs;
  let score = 0;
  if (state.flags.highPay) score += 1;
  if (!state.flags.hasProtector) score += 1;
  if (state.flags.lowKpi) score += 1;
  if (state.flags.deptShrinking) score += 1;
  // P1 (a, recheck 2026-11-17 P0): the chance is the additive formula
  //   P(H2) = clamp(5%, 85%, 20% + 15% x score + Y + I)
  // Y by crisis year, I by crisis year + industry — both read from the
  // era.js tables (t9H2Chance). Y/I apply ONLY to this H2 determination,
  // never to the other T9 crisis branches. Legacy / direct-slice runs
  // have no era -> Y = I = 0, and the formula reduces to the old numbers
  // for every reachable score (0-4). t9H2Chance lives in era.js (loaded
  // before this file); the typeof guard keeps this callable without it.
  if (typeof t9H2Chance === 'function') {
    const era = state.flags && state.flags.era;
    const crisisYear = era && era.examYear ? era.examYear + 8 : undefined;
    return t9H2Chance(score, crisisYear, state.flags.jobIndustry);
  }
  return Math.max(20, Math.min(80, 20 + 15 * score));
}

function gambleChance(state) {
  // 承诺 E · 押注成功率 (for T14; implemented now so the formula is testable)
  const a = state.attrs;
  let c = 15 + a.skill * 0.25 + a.network * 0.15 + Math.min(20, a.money * 0.5);
  c += state.flags.partnerMod || 0;
  if (state.flags.industryDown) c -= 15;
  if (state.flags.partnerShares) c += 8;
  const tier = pressureTier(a.stress);
  if (tier.id === 'tense') c -= 5;
  if (tier.id === 'break') c -= 12;
  return Math.max(5, Math.min(85, Math.round(c)));
}

function tierLabel(pct) {
  if (pct < 35) return '没什么底';
  if (pct <= 60) return '五五开';
  return '有戏';
}

// ---- ventures: free-input money idea -> a dedicated, operable line ----
// Classification is keyword-based (the design doc's intent-classification
// fallback): the player's own words pick the archetype; unmatched input
// falls through to the generic archetype, never to a dead end.
// v0.7.1: that fall-through was the bug behind "和父母要钱买上海的房子"
// becoming a 创业项目： the input hits zero venture keywords, so it landed
// on generic with milestones ("做出最小版本 / 找到第一批用户 / 收支打平")
// and yearly income that make no sense for it. A venture needs a product,
// a paying customer and a price; asking family for money to buy a house
// has none of the three. nonVentureReason() (below) catches those inputs
// BEFORE classifyVenture runs; the caller shows a "not a venture" panel
// instead of the archetype picker. A venture keyword always wins over a
// non-venture pattern, so "借钱开奶茶店" still classifies as a venture.
function ventureKeywordScore(text, archetypes) {
  const t = String(text || '').toLowerCase();
  let total = 0;
  for (const a of (archetypes || [])) {
    for (const k of (a.keys || [])) if (k && t.includes(k.toLowerCase())) total += 1;
  }
  return total;
}

function classifyVenture(text, archetypes) {
  const t = String(text || '').toLowerCase();
  let best = null, bestScore = 0;
  for (const a of archetypes) {
    let score = 0;
    for (const k of (a.keys || [])) if (k && t.includes(k.toLowerCase())) score += 1;
    if (score > bestScore) { bestScore = score; best = a; }
  }
  return best || archetypes.find((a) => a.id === 'generic') || archetypes[0];
}

// v0.7.1: non-venture guard. Returns { kind, reason } when the input is
// not a business idea at all, null otherwise. Checked BEFORE
// classifyVenture, and only when no venture keyword hits — so a real
// venture that happens to mention money ("借钱开奶茶店", "攒钱开店") is
// never blocked by this. Kinds: ask-family (向家里要钱买东西）,
// saving （攒钱买房买车）, purchase （买房买车自用）, career （找工作/考公/考研）.
const BUSINESS_VERBS = /开|做|卖|创业|搞|当|办|出租|收租|投资|经营|代理|中介|跑/;
const NON_VENTURE_PATTERNS = [
  { kind: 'ask-family',
    test: (t) => /(要钱|借钱|伸手|啃老|管.{0,4}要|找家里|问家里)/.test(t)
      && /(买房|房子|买车|车子|首付|彩礼|装修|学费|留学|旅游|结婚|买)/.test(t),
    reason: '向家里要钱买东西，是家庭决策，不是能经营的项目：没有卖的东西，也没有付钱的客户。' },
  { kind: 'saving',
    test: (t) => /(攒钱|存钱)/.test(t) && /(买房|房子|买车|车子|首付|彩礼)/.test(t),
    reason: '攒钱买房买车是存钱、花钱，不是赚钱：没有产品、没有客户，启动费和每年收入都无从谈起。' },
  { kind: 'purchase',
    test: (t) => /(买房|买房子|买车|买辆车|付首付|交首付)/.test(t) && !BUSINESS_VERBS.test(t),
    reason: '买房买车是花钱，不是赚钱：没有卖的东西、没有付钱的客户，启动费和每年收入都无从谈起。' },
  { kind: 'career',
    test: (t) => /(找工作|找份工作|考公|考公务员|考编|考研)/.test(t),
    reason: '找工作、考公、考研是职业和人生选择，不是创业线：收入来自一份工作或一张录取通知，不是一条能一年一年推进的项目。' },
];
function nonVentureReason(text, archetypes) {
  const t = String(text || '').toLowerCase();
  if (ventureKeywordScore(t, archetypes || []) > 0) return null;
  for (const p of NON_VENTURE_PATTERNS) if (p.test(t)) return { kind: p.kind, reason: p.reason };
  return null;
}

// v0.2: max 2 live lines at once (active + validating). `opts.validateOnly`
// starts a FREE validation stage — no cost deducted — so a broke player is
// not locked out of the venture line entirely.
// v0.3: `opts.costOverride` lets the AI review set the startup cost (the
// verdict is the final result); `opts.aiReviewed`/`opts.aiNote` record it
// on the venture. The agreed cost is stored on the venture so the
// validating branch charges the same number later.
function startVenture(state, text, archetype, opts) {
  opts = opts || {};
  const a = state.attrs;
  state.ventures = state.ventures || [];
  const live = state.ventures.filter((v) => v.status === 'active' || v.status === 'validating').length;
  if (live >= 2) {
    return { ok: false, error: '同一时间最多经营 2 条线。先把手头的一条跑起来，或者关掉一条，再开新的。' };
  }
  const cost = (typeof opts.costOverride === 'number' && isFinite(opts.costOverride)) ? opts.costOverride : archetype.cost;
  const short = String(text).trim().slice(0, 12);
  const v = {
    id: 'v' + Date.now().toString(36),
    name: archetype.name + '：' + short,
    archetype: archetype.id,
    text: String(text).trim().slice(0, 200),
    stage: 0,
    status: opts.validateOnly ? 'validating' : 'active',
    createdTurn: state.turn,
    cost,
  };
  if (opts.aiReviewed) {
    v.aiReviewed = true;
    v.aiNote = String(opts.aiNote || '').slice(0, 120);
  }
  if (opts.validateOnly) {
    state.ventures.push(v);
    return { ok: true, venture: v, validating: true };
  }
  if (a.money < cost) {
    return { ok: false, error: `启动要 ${cost} 万，你现在只有 ${a.money} 万。先攒钱（兼职 / 副业），或者先做免费验证。` };
  }
  a.money -= cost;
  state.ventures.push(v);
  return { ok: true, venture: v };
}

// v0.2: success chance uses the archetype's RELEVANT attribute, not always
// 专业+人脉. Formula (audit suggestion, simplified): clamp(35, 85,
// 45 + 0.3 × relevant attribute + 0.1 × network).
function ventureChance(state, archetype) {
  const a = state.attrs;
  const s = a[archetype.attr] || 0;
  return Math.max(35, Math.min(85, Math.round(45 + s * 0.3 + (a.network || 0) * 0.1)));
}

// v0.2: second classification layer — theme tags (AI / 求职 / 教育 …),
// so the revenue model (archetype) and the theme stay separate.
function ventureThemes(text, themeKeywords) {
  const t = String(text || '').toLowerCase();
  const tags = [];
  for (const th of (themeKeywords || [])) {
    if ((th.keys || []).some((k) => k && t.includes(k.toLowerCase())) && !tags.includes(th.tag)) tags.push(th.tag);
  }
  return tags.slice(0, 3);
}

// v0.4: Gaokao admission lines. Offsets live in MAJOR_LINE_OFFSETS
// (data.js); an unlisted major uses the default offset. Lines are game
// reference lines, not real admission data.
function majorAdmissionLine(name, line1) {
  const off = (MAJOR_LINE_OFFSETS && Object.prototype.hasOwnProperty.call(MAJOR_LINE_OFFSETS, name))
    ? MAJOR_LINE_OFFSETS[name] : MAJOR_LINE_DEFAULT_OFFSET;
  return line1 + off;
}

function bestReachableMajor(score, line1) {
  let best = null, bestOff = -1;
  for (const [name, off] of Object.entries(MAJOR_LINE_OFFSETS || {})) {
    if (line1 + off <= score && off > bestOff) { best = name; bestOff = off; }
  }
  return best || '艺术设计';
}

// v0.4: resolve the T1 admission outcome from the sealed Gaokao score.
// Returns { major, tier, k, note, adjusted }. tier: '本科' | '本科（调剂）' | '专科'.
// Below 一段线 -> 专科, k = 0.8 (the design's 0.8 slot). Below the chosen
// major's line but above 一段线 -> 调剂 to the best reachable major.
// P1 (e): 调剂 does NOT drop k — the stance k stands; it costs stress
// +8 and unlocks the 转专业 action (applied by the caller, game.js
// pickT1, from the returned `adjusted` flag).
function resolveAdmission(state, intendedMajor, stanceK) {
  const g = state.flags.gaokao || {};
  // v0.5.1: the sealed score is the base only. Old saves may carry a
  // bonus from the removed ad boost; it is ignored, never added.
  const eff = g.base || 0;
  const line1 = g.line1 || 442;
  const line = majorAdmissionLine(intendedMajor, line1);
  if (eff < line1) {
    return { major: intendedMajor, tier: '专科', k: 0.8, adjusted: false, note: `总分 ${eff}，未过一段线 ${line1}：本科批次无缘，走专科批次。专业系数 k = 0.8。` };
  }
  if (eff < line) {
    const fb = bestReachableMajor(eff, line1);
    return { major: fb, tier: '本科（调剂）', k: stanceK, adjusted: true, note: `总分 ${eff}，第一志愿参考线 ${line}，差 ${line - eff} 分：调剂到 ${fb}。专业系数 k 不变（${stanceK}），压力 +8——不是你想要的专业，读起来会别扭。以后可以转专业。` };
  }
  return { major: intendedMajor, tier: '本科', k: stanceK, adjusted: false, note: '' };
}

const REWARD_NAMES = { money: '钱', skill: '专业', express: '表达', network: '人脉', influence: '影响力', health: '健康' };
function rewardText(reward) {
  return Object.entries(reward || {})
    .map(([k, v]) => `${REWARD_NAMES[k] || k} ${v > 0 ? '+' : ''}${v}${k === 'money' ? ' 万' : ''}`)
    .join('，');
}

// Resolve one venture for a year. `advanced` = the player spent 1 AP on it
// this year; a running venture pays its passive income regardless.
// v0.2: a running line pays its archetype's own income (open source pays
// influence, not cash). A milestone die sealed at advance time is READ here
// and cleared — never re-rolled (old saves without a sealed die roll fresh).
// A validating line graduates to active on a passed validation (if the
// player can afford the startup cost). A line left alone 2 years closes.
function resolveVentureYear(state, rng, venture, archetype, advanced) {
  const lines = [];
  const a = state.attrs;
  if (venture.status === 'running') {
    for (const [k, v] of Object.entries(archetype.running || {})) a[k] = (a[k] || 0) + v;
    lines.push(`「${venture.name}」已经跑起来了，本年 ${rewardText(archetype.running)}。`);
    return lines;
  }
  const readSealed = () => {
    if (venture.sealed) {
      const s = venture.sealed;
      venture.sealed = null;
      return { chance: s.chance, roll: s.roll };
    }
    return { chance: ventureChance(state, archetype), roll: rng.int(1, 100) };
  };
  if (venture.status === 'validating') {
    if (!advanced) {
      lines.push(`「${venture.name}」还在验证：${archetype.validation}`);
      return lines;
    }
    const { chance, roll } = readSealed();
    const cost = (typeof venture.cost === 'number') ? venture.cost : archetype.cost;
    if (roll <= chance) {
      if (a.money >= cost) {
        a.money -= cost;
        venture.status = 'active';
        a.skill += 2; a.influence += 1;
        lines.push(`「${venture.name}」验证通过（掷出 ${roll} ≤ ${chance}），启动资金 ${cost} 万已投入，正式开干。专业 +2，影响力 +1。`);
      } else {
        lines.push(`「${venture.name}」验证通过了（掷出 ${roll} ≤ ${chance}），但启动资金还没攒够（要 ${cost} 万，你有 ${a.money} 万）。先攒钱，再推进。`);
      }
    } else {
      lines.push(`「${venture.name}」验证没过（掷出 ${roll} > ${chance}）：这一步卡住了，下一年可以再试。`);
    }
    return lines;
  }
  if (!advanced) {
    venture.idleYears = (venture.idleYears || 0) + 1;
    if (venture.idleYears >= 2) {
      venture.status = 'closed';
      a.skill += 1;
      lines.push(`「${venture.name}」两年没推进，关掉了，经验留下了（专业 +1）。`);
    } else {
      lines.push(`「${venture.name}」今年没推进，停在原地（里程碑 ${venture.stage}/${archetype.milestones.length}）。再放一年没人管，它就关了。`);
    }
    return lines;
  }
  venture.idleYears = 0;
  const ms = archetype.milestones[venture.stage];
  if (!ms) return lines;
  const { chance, roll } = readSealed();
  if (roll <= chance) {
    for (const [k, v] of Object.entries(ms.reward || {})) a[k] = (a[k] || 0) + v;
    venture.stage += 1;
    lines.push(`「${venture.name}」里程碑达成：${ms.name}（掷出 ${roll} ≤ ${chance}）。${rewardText(ms.reward)}。`);
    if (venture.stage >= archetype.milestones.length) {
      venture.status = 'running';
      for (const [k, v] of Object.entries(archetype.complete || {})) a[k] = (a[k] || 0) + v;
      lines.push(`「${venture.name}」跑起来了：${rewardText(archetype.complete)}。以后每年 ${rewardText(archetype.running)}。`);
    }
  } else {
    if (a.money >= 1) a.money -= 1; else a.stress += 5;
    lines.push(`「${venture.name}」里程碑受挫：${ms.name}（掷出 ${roll} > ${chance}）。亏了 1 万，进度停在原地。`);
  }
  return lines;
}

if (typeof module !== 'undefined') {
  module.exports = { SAVE_KEY, META_KEY, blankAttrs, newRun, saveGame, loadGame, clearSave, exportCode, importCode, loadMeta, saveMeta, pressureTier, settleYear, sealDie, offerTier, layoffChance, gambleChance, tierLabel, classifyVenture, nonVentureReason, startVenture, ventureChance, ventureThemes, resolveVentureYear, rewardText, majorAdmissionLine, bestReachableMajor, resolveAdmission };
}
