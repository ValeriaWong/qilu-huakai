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
  if (state.flags.restBonus) { a.stress -= 5; state.flags.restBonus = false; }
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
  if (state.flags.parentArranged) tier += 1;
  if (state.flags.industryDown) tier -= 1;
  return Math.max(1, Math.min(4, Math.round(tier)));
}

function layoffChance(state) {
  // H2: 20% + 15% × score, clamp 20–80%. score = hits of 4 risk factors.
  const a = state.attrs;
  let score = 0;
  if (state.flags.highPay) score += 1;
  if (!state.flags.hasProtector) score += 1;
  if (state.flags.lowKpi) score += 1;
  if (state.flags.deptShrinking) score += 1;
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

if (typeof module !== 'undefined') {
  module.exports = { SAVE_KEY, META_KEY, blankAttrs, newRun, saveGame, loadGame, clearSave, exportCode, importCode, loadMeta, saveMeta, pressureTier, settleYear, sealDie, offerTier, layoffChance, gambleChance, tierLabel };
}
