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
  // v1.0 D 断亲：压力恢复 −3/年——恢复量少 3 点，不是压力 +3 的另一种
  // 写法（效果上就是每年结算时压力比正常多 3 点，但语义是恢复变差）。
  if (state.flags.estranged) a.stress += 3;
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
  // v1.0 D 断亲：家庭线永久归零——结算时锁死，任何加家庭线的行动
  // （陪家人、事件）在断亲后都不再生效（game.js 里也拦）。
  if (state.flags.estranged) a.family = 0;
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

function gambleChanceFrom(inp) {
  // 承诺 E · 押注成功率（设计文档公式，对外只显示三档把握）：
  //   15 + 专业×0.25 + 人脉×0.15 + min(20, 现金万×0.5) + 合伙人修正
  //   + 行业周期（下行 −15）+ 伴侣共担（+8）− 压力档（紧绷 −5，崩 −12），
  //   clamp 5%–85%。inp.tier 是 pressureTier id（'calm'/'tense'/'break'）。
  // 注：文档 L330 的样例（专业 70、人脉 60、现金 40 万、合伙人 +15、
  // 周期平、伴侣 +8、紧绷 −5）按本公式算得 79.5（→80），不是文档写
  // 的 66.5——样例数与公式自洽不了，以公式为准，样例数待 Allen 定。
  let c = 15 + inp.skill * 0.25 + inp.network * 0.15 + Math.min(20, inp.money * 0.5);
  c += inp.partnerMod || 0;
  if (inp.industryDown) c -= 15;
  if (inp.partnerShares) c += 8;
  if (inp.tier === 'tense') c -= 5;
  if (inp.tier === 'break') c -= 12;
  return Math.max(5, Math.min(85, Math.round(c)));
}

function gambleChance(state) {
  // 承诺 E · 押注成功率 (for T14; implemented now so the formula is testable)
  const a = state.attrs;
  return gambleChanceFrom({
    skill: a.skill, network: a.network, money: a.money,
    partnerMod: state.flags.partnerMod || 0,
    industryDown: !!state.flags.industryDown,
    partnerShares: !!state.flags.partnerShares,
    tier: pressureTier(a.stress).id,
  });
}

// ---- v1.0: H5 父母病情等级（T13 签署基础值 1–3，T16 兑现；
// T13 带父母体检 1 AP 则 −1 级，下限 1 级）。----
function h5Level(state) {
  const base = state.sealed.H5 ? state.sealed.H5.value : 1;
  return Math.max(1, base - (state.flags.h5Checkup ? 1 : 0));
}

// ---- v1.0: F 抗压判定（钱 ≥30 万 / 有伴侣支持 / 健康 ≥60，三选二）。
// “有伴侣支持”是解释性实现：有伴侣且 H4 ≥30（H4 <30 是“只想解决自己
// 的问题”，不算支持）。三选二成立 → 压力 +25；否则压力 +45、健康 −15。
// ----
function fResilience(state) {
  const a = state.attrs;
  const met = [];
  if (a.money >= 30) met.push('money');
  if (state.flags.relationship === 'partner' && state.sealed.H4 && state.sealed.H4.value >= 30) met.push('partner');
  if (a.health >= 60) met.push('health');
  return { pass: met.length >= 2, met };
}

// ---- v1.0: 执念达成度（35 岁结算）。
// 文档只给了总分结构（2 条 × 0–3 分 = 0–6 分，减去代价：健康 ≤20 −2 /
// Debt = 5 −1 / 断亲且执念含家庭 −2）与四档结局，没给每条执念 0–3 分
// 的评分细则。下面是按终局状态的解释性实现，文档未给细则：每条执念
// 按终局属性/状态打分，档位均为 0/1/2/3。
//   money 经济独立：现金 ≥30 万 3 / ≥10 万 2 / ≥0 1 / 负数 0。
//   seen 被人看见：影响力 ≥60 3 / ≥40 2 / ≥20 1 / 否则 0。
//   home 回家：家庭线 ≥+2 3 / +1 2 / 0 1 / 负数 0。
//   free 自由支配时间：Debt 0 且压力 <40 3 / Debt ≤1 且压力 <70 2 /
//     Debt ≤2 1 / 否则 0。
//   love 一段稳的关系：有伴侣且 H4 >60 3 / 有伴侣且 H4 30–60 2 /
//     有伴侣且 H4 <30 1 / 无伴侣 0（伴侣已离开也算无伴侣）。
//   health 身体不出问题：健康 ≥80 3 / ≥60 2 / ≥40 1 / 否则 0。
// 结局：≥5 如愿（fulfilled）/ 3–4 换了一种如愿（another-way）/
//   1–2 活下来了（survived）/ ≤0 重开（restart）。
// ----
function obsessionScore(state) {
  const a = state.attrs;
  const scoreOne = (id) => {
    switch (id) {
      case 'money': return a.money >= 30 ? 3 : a.money >= 10 ? 2 : a.money >= 0 ? 1 : 0;
      case 'seen': return a.influence >= 60 ? 3 : a.influence >= 40 ? 2 : a.influence >= 20 ? 1 : 0;
      case 'home': return a.family >= 2 ? 3 : a.family === 1 ? 2 : a.family === 0 ? 1 : 0;
      case 'free': return (a.debt === 0 && a.stress < 40) ? 3 : (a.debt <= 1 && a.stress < 70) ? 2 : (a.debt <= 2) ? 1 : 0;
      case 'love': {
        if (state.flags.relationship !== 'partner') return 0;
        const h4 = state.sealed.H4 ? state.sealed.H4.value : 0;
        return h4 > 60 ? 3 : h4 >= 30 ? 2 : 1;
      }
      case 'health': return a.health >= 80 ? 3 : a.health >= 60 ? 2 : a.health >= 40 ? 1 : 0;
      default: return 0;
    }
  };
  const per = {};
  let raw = 0;
  for (const id of (state.obsessions || [])) { per[id] = scoreOne(id); raw += per[id]; }
  const deductions = { health: 0, debt: 0, estranged: 0 };
  if (a.health <= 20) deductions.health = 2;
  if (a.debt === 5) deductions.debt = 1;
  if (state.flags.estranged && (state.obsessions || []).includes('home')) deductions.estranged = 2;
  const total = raw - deductions.health - deductions.debt - deductions.estranged;
  const ending = total >= 5 ? 'fulfilled' : total >= 3 ? 'another-way' : total >= 1 ? 'survived' : 'restart';
  return { per, raw, deductions, total, ending };
}

// ---- v1.0: 兑现卡第 ④ 格 · 反事实归因（承诺 E，失败时才算）。
// 算法（设计文档）：对每个因子用当年该因子的“可达上限”替换当前值重算
// 成功率，能翻盘的按需补差值升序、只显示最近 2 条；没有单因子能翻盘
// → 显示“这一年没有单点能救你，是三个因子各差一点”。
// “可达上限”按行动表估（签署在 T14、兑现 T16，中间只剩 T15 一个
// 快进年、3 AP）：专业 +3 AP × 5 × k；人脉 +3 AP × 6；现金 +3 AP ×
// 3 万（兼职/接私活）；压力档回到稳（T15 全用来喘气）。合伙人修正
// （H6）与伴侣共担（H4）都是签署时封存的骰，行动改不了，上限就是当
// 前值，不参与翻盘。snapshot 是 T14 签署时的快照（含 chance/roll）。
// 返回 [{ factor, label, need, cap, delta, text }]（最多 2 条，按
// delta 升序），没有能翻盘的返回 []（调用方显示兜底句）。
// ----
function counterfactualFlips(state) {
  const c = state.commitments && state.commitments.E;
  if (!c || !c.snapshot || c.snapshot.line === 'work') return [];
  const snap = c.snapshot;
  if (typeof snap.chance !== 'number' || typeof snap.roll !== 'number') return [];
  if (snap.roll <= snap.chance) return []; // 本来就成功了，没有翻盘点
  const needChance = snap.roll - snap.chance; // 至少要补这么多成功率点
  const base = {
    skill: snap.skill, network: snap.network, money: snap.money,
    partnerMod: snap.partnerMod || 0, industryDown: !!snap.industryDown,
    partnerShares: !!snap.partnerShares, tier: snap.tier || 'calm',
  };
  const k = snap.k || 1;
  const cands = [];
  // 专业：每点 +0.25 成功率。
  const skillCap = snap.skill + 3 * 5 * k;
  if (gambleChanceFrom({ ...base, skill: skillCap }) >= snap.roll) {
    const delta = Math.ceil(needChance / 0.25);
    cands.push({ factor: 'skill', label: '专业', need: snap.skill + delta, cap: skillCap, delta, unit: '点',
      text: `真正能救你的是专业 ≥${snap.skill + delta}。你当年 ${snap.skill}，上限 ${skillCap}——差 ${delta} 点，需要 T15 的 AP 全投系统学习。` });
  }
  // 人脉：每点 +0.15 成功率。
  const networkCap = snap.network + 3 * 6;
  if (gambleChanceFrom({ ...base, network: networkCap }) >= snap.roll) {
    const delta = Math.ceil(needChance / 0.15);
    cands.push({ factor: 'network', label: '人脉', need: snap.network + delta, cap: networkCap, delta, unit: '点',
      text: `真正能救你的是人脉 ≥${snap.network + delta}。你当年 ${snap.network}，上限 ${networkCap}——差 ${delta} 点，需要 T15 的 AP 全投社交局。` });
  }
  // 现金：每万 +0.5 成功率，但 min(20, 现金×0.5) 有 20 点上限。
  const moneyCap = snap.money + 3 * 3;
  if (gambleChanceFrom({ ...base, money: moneyCap }) >= snap.roll) {
    const delta = Math.ceil(needChance / 0.5);
    cands.push({ factor: 'money', label: '现金', need: snap.money + delta, cap: moneyCap, delta, unit: '万',
      text: `真正能救你的是现金 ≥${snap.money + delta} 万。你当年 ${snap.money} 万，上限 ${moneyCap} 万——差 ${delta} 万，需要 T15 的 AP 全投兼职/接私活。` });
  }
  // 压力档：回到稳，扣的分全回来。
  if (snap.tier === 'tense' || snap.tier === 'break') {
    const penalty = snap.tier === 'tense' ? 5 : 12;
    if (gambleChanceFrom({ ...base, tier: 'calm' }) >= snap.roll) {
      cands.push({ factor: 'pressure', label: '压力', need: '稳', cap: '稳', delta: penalty, unit: '点',
        text: `真正能救你的是压力回到稳档。你当年是${snap.tier === 'tense' ? '紧绷' : '崩'}，多扣了 ${penalty} 点成功率——T15 全用来喘气（健身/躺平/陪家人）才够。` });
    }
  }
  cands.sort((x, y) => x.delta - y.delta);
  return cands.slice(0, 2);
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
  if (opts.eraAdapted) {
    // v1.1 (b) 年代适配：玩家在确认屏上主动选了“换成当时能用的技术”
    // （era.js adaptVentureTech 检出 + game.js 询问，见 idea-confirm）。
    // 只记一个标记和一句话说明，不改玩家写的项目名和愿望本身。
    v.eraAdapted = true;
    v.eraTechNote = String(opts.eraTechNote || '').slice(0, 140);
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
  module.exports = { SAVE_KEY, META_KEY, blankAttrs, newRun, saveGame, loadGame, clearSave, exportCode, importCode, loadMeta, saveMeta, pressureTier, settleYear, sealDie, offerTier, layoffChance, gambleChance, gambleChanceFrom, tierLabel, h5Level, fResilience, obsessionScore, counterfactualFlips, classifyVenture, nonVentureReason, startVenture, ventureChance, ventureThemes, resolveVentureYear, rewardText, majorAdmissionLine, bestReachableMajor, resolveAdmission };
}
