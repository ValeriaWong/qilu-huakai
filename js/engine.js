'use strict';
/**
 * Game engine for 《歧路花开》 v5 — state, seeded RNG, sealed dice, save/load.
 *
 * Fairness rule (from the design doc): a die is rolled ONCE, at the moment a
 * commitment is signed, and written into the save. The reveal stage only
 * reads the stored value — it never re-rolls. The RNG stream position is
 * persisted too, so a reload cannot change any future roll either.
 *
 * 征兆 (omens, v1.2 P0-5): when a die is sealed, 1–3 omen lines are
 * generated FROM the sealed value. Each die has a small set of verifiable
 * claims about its value (see omenTrueClaim / OMEN_TEXTS below): an omen
 * is accurate with 65% probability (rolled once, stored) — an accurate
 * omen states the TRUE claim (signalFor), a misleading one states a
 * DIFFERENT claim (misleadingSignalFor). For multi-category dice the
 * misleading claim is one of the OTHER categories, never a boolean
 * negation of the true claim. The stored `accurate` flag is therefore a
 * property of the text-vs-value correspondence, not a coin-flip label
 * on a fixed text (the v1.1 bug: the text never corresponded to the
 * value at all). The player sees only the text; the truth is revealed
 * at 兑现 time, per omen.
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
// v1.2 (P1-8): three mutually isolated save slots. Each slot has its own
// key; switching slots never overwrites another run. Slot 1 keeps the
// legacy key as a fallback so v1.1 saves still load.
function saveKeyForSlot(slot) {
  const n = Number(slot) || 1;
  return n === 1 ? SAVE_KEY : 'qilu-huakai-save-v1-slot-' + n;
}

function saveGame(state) {
  try {
    localStorage.setItem(saveKeyForSlot(state.slot || 1), JSON.stringify(state));
    return true;
  } catch (e) {
    return false;
  }
}

function loadGame(slot) {
  try {
    // Slot 1 IS the legacy key, so a v1.1 save loads as slot 1 with no
    // extra fallback — and no other slot can ever read it (isolation).
    const raw = localStorage.getItem(saveKeyForSlot(slot || 1));
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.version !== VERSION) return null;
    return migrateSave(s);
  } catch (e) {
    return null;
  }
}

// ---- v1.4: 旧存档迁移层 ----
// 只补分类、不发明数值：缺失的字段按“未定”标记，由 UI 或后续流程
// 补填，绝不靠放宽判定条件来兼容。
//   (a) 已封存 H5 的 v1.3 存档没有 sealedCareSubject → 从 T13 已写
//       的 flags.careSubject 回填（同一值），T16 读封存记录才有依据。
//   (b) 教培行业细分缺失的 jobProfile（v1.1 存档只有 jobIndustry，
//       或 v1.2 存档的 subsector 为 null）→ 不猜细分，标
//       flags.subsectorMissing，由 T9 切片入口的补填屏请玩家补选；
//       补选前 t9IndustryAdjustment 按未知细分返回 0。
//       没有 jobProfile 但 jobIndustry 是“教培”的旧存档，先建一个
//       空壳 jobProfile（不编年薪：salaryAnnual 为 null 时补偿走
//       默认值 8 万，见 severancePay），再标缺失。
function migrateSave(s) {
  if (!s || !s.flags) return s;
  if (s.sealed && s.sealed.H5 && !s.flags.sealedCareSubject && s.flags.careSubject) {
    s.flags.sealedCareSubject = s.flags.careSubject;
  }
  const jp = s.flags.jobProfile;
  if (jp && (jp.sector === 'education' || jp.sectorName === '教培') && !jp.subsector) {
    s.flags.subsectorMissing = true;
  } else if (!jp && s.flags.jobIndustry === '教培') {
    s.flags.jobProfile = { employerType: 'unknown', sector: 'education', sectorName: '教培', subsector: null, policyExposure: false, salaryAnnual: null, startTurn: 5 };
    s.flags.subsectorMissing = true;
  }
  return s;
}

function clearSave(slot) {
  localStorage.removeItem(saveKeyForSlot(slot || 1));
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
    return { ok: true, state: migrateSave(s) };
  } catch (e) {
    return { ok: false, error: '存档码读不出来：' + e.message };
  }
}

// ---- meta (slots + lessons, shared across runs) ----
// v1.2 (P1-8): all three slots are free and mutually isolated. A v1.1
// meta that still has slots 2-3 locked is migrated to unlocked on load
// (the lock was a paywall placeholder; there is no payment backend on
// this static page, and a paid entitlement cannot be verified reliably
// here — see the design doc v1.2 section).
function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) {
      const m = JSON.parse(raw);
      if (m && Array.isArray(m.slots)) {
        m.slots = [1, 2, 3].map((id) => ({ id, unlocked: true }));
        return m;
      }
      return m;
    }
  } catch (e) { /* fall through */ }
  return { slots: [{ id: 1, unlocked: true }, { id: 2, unlocked: true }, { id: 3, unlocked: true }], lessons: [], runsFinished: 0, npcMemory: {} };
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
  // v1.2 (P0-4): 有限联系——家庭线最高到 +1，结算时钳制。
  if (state.flags.familyCapped && a.family > 1) a.family = 1;
  return { before, after: { ...a }, tier: tier.id };
}

// ---- sealed dice + omens (v1.2, P0-5) ----
// Claim vocabulary per die: the verifiable propositions an omen can
// state about the sealed value. Binary dice (H0, E) have only two
// claims, so the misleading claim is the other one by necessity; the
// "no boolean flip" rule binds multi-category dice (H4/H5/H6), where
// the misleading claim is drawn from the OTHER categories.
function omenTrueClaim(name, value) {
  if (name === 'H0') return value >= 60 ? 'strong' : 'mild';
  if (name === 'H4') return value > 60 ? 'devoted' : value >= 30 ? 'lukewarm' : 'selfish';
  if (name === 'H5') return value === 1 ? 'mild' : value === 2 ? 'moderate' : 'severe';
  if (name === 'H6') return value > 60 ? 'reliable' : value >= 35 ? 'shaky' : 'flight';
  if (name === 'E') {
    const v = value || {};
    if (typeof v.roll === 'number' && typeof v.chance === 'number') return v.roll <= v.chance ? 'success' : 'fail';
    return 'fail';
  }
  return 'unknown';
}
function omenClaimsFor(name) {
  return { H0: ['strong', 'mild'], H4: ['devoted', 'lukewarm', 'selfish'], H5: ['mild', 'moderate', 'severe'], H6: ['reliable', 'shaky', 'flight'], E: ['success', 'fail'] }[name] || [];
}
function omenMisleadingClaim(name, value, rng) {
  const truth = omenTrueClaim(name, value);
  const others = omenClaimsFor(name).filter((c) => c !== truth);
  if (!others.length) return truth;
  return rng.pick(others);
}
// Omen texts, per die per claim. H5 texts are per care subject
// (parents / grandparents / partner / self — see careSubjectFor).
// E texts are per gamble line (startup / abroad / takeover).
const OMEN_TEXTS = {
  H0: {
    strong: ['你妈说隔壁家孩子学了会计。', '你爸把招生简章翻到了第 38 页。', '饭桌上，你妈第三次提起“师范稳定”。'],
    mild: ['你妈说志愿你自己定，考上哪儿都行。', '你爸说，路是你自己走的。', '家里没人提志愿的事，饭桌上只聊了天气。'],
  },
  H4: {
    devoted: ['他/她谈钱的时候，先算的是你们俩的账。', '你加班到半夜，他/她问的是“什么时候回来”。', '见父母时，他/她坐在你这边。'],
    lukewarm: ['他/她谈钱的时候，先算的是自己的账。', '你加班到半夜，他/她只回了一个“哦”。', '见父母时，他/她坐得离你有点远。'],
    selfish: ['他/她谈钱的时候，只算自己那一份。', '你生病那天，他/她说“你先歇着，我有个局”。', '他/她说：“你的事你自己解决，别拉上我。”'],
  },
  H5: {
    parents: {
      mild: ['体检报告上只有一个小箭头，医生说注意休息就行。', '他说最近爬楼有点喘，歇一会儿就好。'],
      moderate: ['电话里的咳嗽声比上个月重了。', '亲戚欲言又止，说“你爸妈最近总往医院跑”。'],
      severe: ['他们开始交代存折放在哪个抽屉。', '医生说的话，他们没敢原样转述给你。'],
    },
    grandparents: {
      mild: ['奶奶说最近腿脚有点慢，歇歇就好。', '她还是每天四点起床，只是起得比以前慢了。'],
      moderate: ['奶奶开始记不住刚说过的话了。', '亲戚说，奶奶最近总往卫生院跑。'],
      severe: ['奶奶把存折和钥匙都交到了你手里。', '医生说的话，家里人没敢原样转述给你。'],
    },
    partner: {
      mild: ['他/她说最近总觉得累，睡一觉就好。', '体检报告上只有一个小箭头。'],
      moderate: ['他/她开始瞒着你吃药。', '他/她说“别担心”，但脸色不太对。'],
      severe: ['他/她把家里的账都交代了一遍。', '医生让你做好长期照顾的准备。'],
    },
    self: {
      mild: ['你爬三层楼要歇一次了。', '体检报告上只有一个小箭头。'],
      moderate: ['你开始瞒着家里人吃药。', '医生说这个毛病得长期管，不能拖。'],
      severe: ['医生让你立刻住院，再拖就不好说了。', '你第一次发现，自己的身体也会掉链子。'],
    },
  },
  H6: {
    reliable: ['他说“先干起来，钱的事以后再说”。', '他把老婆拉进了群，说“家里人都支持”。', '签约那天，他提前到了，合同一条一条对。'],
    shaky: ['他谈分成时的眼神飘了一下。', '他说家里有点事，这个月的钱晚几天再打。', '第一笔钱打过去之后，他三天没回消息。'],
    flight: ['签约那天，他迟到了半小时。', '他谈分成时看了三次手机，说“信号不好，晚点回你”。', '他开始不接电话，只回“在忙”。'],
  },
  E: {
    startup: {
      success: ['签约那天，他提前到了，合同一条一条对。', '第一笔钱打过去，当晚就收到了回执。'],
      fail: ['签约那天，他迟到了半小时。', '第一笔钱打过去之后，他三天没回消息。'],
    },
    abroad: {
      success: ['签证材料递上去的第二天就过了初审。', '中介主动打来电话，说流程比预想的快。'],
      fail: ['签证材料递上去的那天，你手心全是汗。', '中介的电话开始打不通了。'],
    },
    takeover: {
      success: ['交接那天，前老板把账本一页一页讲给你听。', '老客户听说你接手，主动打来电话。'],
      fail: ['交接那天，前老板走得很快。', '账本上有两页被撕掉了。'],
    },
  },
};
function omenTextsFor(name, claim, state, value) {
  const table = OMEN_TEXTS[name];
  if (!table) return [];
  if (name === 'H5') {
    const subj = (state && state.flags && state.flags.careSubject) || 'parents';
    const per = table[subj] || table.parents;
    return per[claim] || [];
  }
  if (name === 'E') {
    const line = (value && value.line) || 'startup';
    const per = table[line] || table.startup;
    return per[claim] || [];
  }
  return table[claim] || [];
}

function sealDie(state, rng, name, value, omens) {
  // v1.2 (P0-5): `omens` is now a COUNT — each omen is generated from
  // the sealed value (65% accurate / 35% misleading, rolled once each
  // and stored). Legacy array form [{text, claim?}] is still accepted:
  // a claim is judged against the true claim; a claim-less text keeps
  // the old random label (deprecated — do not use for new dice).
  let list;
  if (typeof omens === 'number') {
    list = [];
    for (let i = 0; i < omens; i++) {
      const accurate = rng.chance(0.65);
      const claim = accurate ? omenTrueClaim(name, value) : omenMisleadingClaim(name, value, rng);
      const texts = omenTextsFor(name, claim, state, value);
      const text = texts.length ? rng.pick(texts) : claim;
      list.push({ text, claim, accurate });
    }
  } else {
    list = (omens || []).map((o) => {
      if (o.claim) return { text: o.text, claim: o.claim, accurate: o.claim === omenTrueClaim(name, value) };
      return { text: o.text, accurate: rng.chance(0.65) };
    });
  }
  const sealed = {
    value,
    rolledAt: `T${state.turn}`,
    omens: list,
  };
  state.sealed[name] = sealed;
  for (const o of list) state.omenLog.push({ turn: state.turn, text: o.text, die: name, claim: o.claim, accurate: o.accurate });
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
    // v1.2 (P1-3): T9 reads the industry FIELD (jobProfile.sector /
    // subsector), not the company type. Legacy saves keep jobIndustry.
    // NOTE: t9H2Chance's table is keyed by Chinese display names, so
    // pass sectorName (not the sector id) — passing the id silently
    // zeroed the industry adjustment (caught by test-v15 V15-29).
    const jp = state.flags && state.flags.jobProfile;
    const industry = (jp && (jp.sectorName || jp.sector)) || state.flags.jobIndustry;
    const subsector = jp && jp.subsector;
    return t9H2Chance(score, crisisYear, industry, subsector);
  }
  return Math.max(20, Math.min(80, 20 + 15 * score));
}

function gambleChanceFrom(inp) {
  // 承诺 E · 押注成功率（设计文档公式，对外只显示三档把握）：
  //   15 + 专业×0.25 + 人脉×0.15 + min(20, 现金万×0.5) + 合伙人修正
  //   + 行业周期（下行 −15）+ 伴侣共担（+8）− 压力档（紧绷 −5，崩 −12），
  //   clamp 5%–85%。inp.tier 是 pressureTier id（'calm'/'tense'/'break'）。
  // 注：文档 L330 的样例（专业 70、人脉 60、现金 40 万、合伙人 +15、
  // 周期平、伴侣 +8、紧绷 −5）按本公式算得 79.5（→80，界面显示 80%）；
  // v1.0 文档误印 66.5，v1.2 已在设计文档中更正为 79.5。
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

// ---- v1.2 (P0-3): T16 照护对象条件化 ----
// 谁需要你照顾，由出身与当下状态决定，不再默认"父母病倒"：
//   父母健在（model / absentFather / absentMother / npd）-> 父母
//   双缺席（祖辈监护人）-> 祖辈（奶奶）
//   孤儿 + 有伴侣 -> 伴侣
//   孤儿 + 无伴侣 + 健康 < 50 -> 你自己的身体（自身健康版）
//   孤儿 + 无伴侣 + 健康尚可 -> 无（这一年没有人需要你照顾，
//     不扣父母医疗费，不强制放弃任何东西）
// 其他监护人（养父母等）走 orphan 的伴侣/自身/无三档：养父母不在
// ---- v1.3 (P0-2 of the 2026-11-20 re-review) + v1.4 (scope split) ----
// 照护对象按断亲范围与出身定。断亲拆成两个目标（v1.4，第二次复审
// 第四节）：parents（父母关系）与 caregiver（实际养育者——双缺席
// 家庭是奶奶，其他出身里养育者就是父母本人）；“与整个原生家庭
// 断联”是独立选项（all）。flags.estrangedScope 不存在时按 'all'
// 处理（v1.3 旧存档：断亲即切断整个原生家庭线，保持向后兼容）。
// flags.estranged 是 v1.2 的旧标志，familyBoundary === 'estranged'
// 是 v1.2 的双维度新字段，两者都认。
// （v1.2 的出身映射不变：父母健在 -> 父母；双缺席 -> 祖辈（奶奶）；
// 孤儿 + 有伴侣 -> 伴侣；孤儿 + 无伴侣 + 健康 < 50 -> 自身；
// 孤儿 + 无伴侣 + 健康尚可 -> 无。）
const CARE_SUBJECTS = {
  parents: { kind: 'parents', label: '父母', subject: '父母', careNoun: '父母的病' },
  grandparents: { kind: 'grandparents', label: '奶奶', subject: '奶奶', careNoun: '奶奶的病' },
  partner: { kind: 'partner', label: '伴侣', subject: '伴侣', careNoun: '伴侣的病' },
  self: { kind: 'self', label: '你自己的身体', subject: '你自己的身体', careNoun: '你自己的身体' },
  none: { kind: 'none', label: '', subject: '', careNoun: '' },
};
function estrangementScope(state) {
  if (!state.flags || !(state.flags.estranged || state.flags.familyBoundary === 'estranged')) return null;
  return state.flags.estrangedScope || 'all';
}
function careSubjectFor(state) {
  const scope = estrangementScope(state);
  if (scope) {
    const key = state.origin ? state.origin.familyKey : null;
    const hasParents = key === 'model' || key === 'absentFather' || key === 'absentMother' || key === 'npd';
    const hasGrandparents = key === 'absentBoth';
    // 养育者是谁：双缺席是奶奶，其他出身里养育者就是父母本人。
    // 'parents' 只断父母线；'caregiver' 只断养育者线；'all' 全断。
    const caregiverIsParents = !hasGrandparents;
    const blockParents = scope === 'all' || scope === 'parents' || (scope === 'caregiver' && caregiverIsParents);
    const blockGrandparents = scope === 'all' || (scope === 'caregiver' && hasGrandparents);
    if (hasParents && !blockParents) return CARE_SUBJECTS.parents;
    if (hasGrandparents && !blockGrandparents) return CARE_SUBJECTS.grandparents;
    return careSubjectNoParents(state);
  }
  const key = state.origin ? state.origin.familyKey : null;
  if (key === 'model' || key === 'absentFather' || key === 'absentMother' || key === 'npd') {
    return CARE_SUBJECTS.parents;
  }
  if (key === 'absentBoth') {
    return CARE_SUBJECTS.grandparents;
  }
  if (key === 'orphan') return careSubjectNoParents(state);
  return CARE_SUBJECTS.parents;
}
// ---- v1.4 (P0-2 of the 2026-11-20 second re-review): 封存的照护对象 ----
// H5 在 T13 封存时，照护对象一起封存（flags.sealedCareSubject，存
// kind 字符串）。T16 只读封存记录——之后伴侣离开、关系变化，可以
// 影响照护方式与关系后果，但不能让已发生的医疗事件凭空消失（扣费、
// 对象、UI 三者一致）。读取顺序：sealedCareSubject（v1.4 新存档）
// → careSubject（v1.3 存档，T13 已写）→ 现场重算（未封存时，如
// 切片直入 T13 前的体检卡）。
function sealedCareSubject(state) {
  const fl = (state && state.flags) || {};
  const kind = fl.sealedCareSubject || fl.careSubject || null;
  if (kind && CARE_SUBJECTS[kind]) return CARE_SUBJECTS[kind];
  return careSubjectFor(state);
}
function careSubjectNoParents(state) {
  if (state.flags && state.flags.relationship === 'partner') {
    return { kind: 'partner', label: '伴侣', subject: '伴侣', careNoun: '伴侣的病' };
  }
  if ((state.attrs && typeof state.attrs.health === 'number' ? state.attrs.health : 70) < 50) {
    return { kind: 'self', label: '你自己的身体', subject: '你自己的身体', careNoun: '你自己的身体' };
  }
  return { kind: 'none', label: '', subject: '', careNoun: '' };
}

// ---- v1.4.2: 体制内分支判定 ----
// 在职（employment 'employed'）且档案是体制内（employerType 'stable'）
// 或行业是体制内（sector 'public'）。下海（employment 变 freelance）
// 后不再是体制内；旧存档的 jobProfile 迁移壳只出现在教培
// （employerType 'unknown'，sector 'education'），永远判不上体制内；
// 体制内玩家的 jobProfile 由 signT5 写入，employerType 一定是
// 'stable'，所以旧存档也能判定。
function isPublicJob(s) {
  const fl = (s && s.flags) || {};
  if (fl.employment !== 'employed') return false;
  const jp = fl.jobProfile;
  if (!jp) return false;
  return jp.employerType === 'stable' || jp.sector === 'public';
}

// ---- v1.2 (P0-7): 裁员补偿按实际状态 ----
// N = 本单位工作年限 × 月薪（劳动合同法经济补偿口径）。工作年限与
// 年薪读 T5 的 jobProfile（T5 入职 → T9 共 4 年）；没有可信档案时
// （直接切片、旧存档）回退到切片默认值 8 万（4 年 × 月薪 2 万，
// 见设计文档 v1.0 节），并在 basis 里写明是默认值。
function severancePay(state) {
  const jp = state.flags && state.flags.jobProfile;
  if (jp && typeof jp.salaryAnnual === 'number' && typeof jp.startTurn === 'number') {
    const years = Math.max(0, 9 - jp.startTurn);
    const monthly = jp.salaryAnnual / 12;
    const amount = Math.round(years * monthly * 10) / 10;
    return { amount, basis: `${years} 年 × 月薪 ${Math.round(monthly * 10) / 10} 万` };
  }
  return { amount: 8, basis: '默认值 4 年 × 月薪 2 万（无入职档案）' };
}

// ---- v1.0: F 抗压判定（钱 ≥30 万 / 有伴侣支持 / 健康 ≥60，三选二）。
// “有伴侣支持”是解释性实现：有伴侣且 H4 ≥30（H4 <30 是“只想解决自己
// 的问题”，不算支持）。三选二成立 → 压力 +25；否则压力 +45、健康 −15。
// v1.2 (P0-3): 照护对象就是伴侣本人时，伴侣是病人，不算支持——
// 这一条腿不计入。
// ----
function fResilience(state) {
  const a = state.attrs;
  const met = [];
  if (a.money >= 30) met.push('money');
  const careKind = sealedCareSubject(state).kind;
  if (careKind !== 'partner' && state.flags.relationship === 'partner' && state.sealed.H4 && state.sealed.H4.value >= 30) met.push('partner');
  if (a.health >= 60) met.push('health');
  return { pass: met.length >= 2, met };
}

// ---- v1.2 (P1-6): 执念达成度（35 岁结算），多因素版 ----
// 保持每条执念 0–3 分、总分 0–6 分、四档结局不变；每条执念改为
// 4 个二元指标，分数 = min(3, 达标数）。指标只读终局状态，来源
// 见各条注释；“每级 Debt 约 5 万”是解释性换算（Debt 是 0–5 级，
// 游戏内从未按万计价），只用于净资产这一项。
//   money 经济独立：现金 ≥30 万 / Debt ≤2（债务可承受）/
//     有持续收入（在职/创业/有在跑的项目/影响力 ≥50 可变现）/
//     净资产 ≥20 万（现金 − Debt×5）。
//   seen 被人看见：影响力 ≥40 / 有被认可的成果（项目里程碑 ≥1 或
//     影响力 ≥60）/ 真实支持网络（人脉 ≥40 或有伴侣或有靠山）/
//     影响力 ≥20（至少有人看见）。
//   home 回家：有稳定住所（租房/还贷/自有，学生宿舍不算）/
//     有归属感（家庭线 ≥1，或人脉 ≥50，或有伴侣——原生家庭或
//     自己建立的生活都算）/ 经济上能维持住所（现金 ≥10 万）/
//     不在流离状态（Debt <3 且现金 ≥0）。
//     断亲不再自动扣分：断亲只让家庭线归零，归属感仍可由人脉
//     或伴侣满足——断亲 ≠ 无家。
//   free 自由支配时间：压力 <40（有自主时间）/ Debt ≤1（经济
//     压力小）/ 健康 ≥60（身体状态允许）/ 有选择空间（有项目、
//     人脉 ≥50 或现金 ≥30——不被单一雇主锁死）。
//   love 一段稳的关系：有伴侣且 H4 ≥30（关系存在且基本尊重）/
//     H4 >60（高质量）/ 关系之外仍有支持网络（人脉 ≥40）/
//     亲密关系能力（人脉 ≥50，或有伴侣——单身不自动判失败，
//     亲密关系能力不等于“有伴侣”）。
//   health 身体不出问题：健康 ≥60 / 健康 ≥80 / 健康 ≥60 且
//     压力 <70（持续照护能力）/ 健康 ≥40（身体未出大问题）。
// 代价扣除保留健康 ≤20 −2 / Debt = 5 −1；断亲扣分已删除（v1.0
// 的 estranged −2 是错的：断亲是边界选择，不是“回家”失败）。
// 结局：≥5 如愿（fulfilled）/ 3–4 换了一种如愿（another-way）/
//   1–2 活下来了（survived）/ ≤0 重开（restart）。
// ----
function obsessionScore(state) {
  const a = state.attrs || {};
  const fl = state.flags || {};
  const hasVenture = (state.ventures || []).some((v) => v.status === 'active' || v.status === 'validating' || v.status === 'running');
  const hasMilestone = (state.ventures || []).some((v) => v.stage >= 1 || v.status === 'running');
  const incomeStable = fl.employment === 'employed' || fl.employment === 'startup' || hasVenture || (a.influence || 0) >= 50;
  const h4 = state.sealed && state.sealed.H4 ? state.sealed.H4.value : 0;
  const isPartner = fl.relationship === 'partner';
  const indicators = {
    money: [
      (a.money || 0) >= 30,
      (a.debt || 0) <= 2,
      !!incomeStable,
      (a.money || 0) - (a.debt || 0) * 5 >= 20,
    ],
    seen: [
      (a.influence || 0) >= 40,
      hasMilestone || (a.influence || 0) >= 60,
      (a.network || 0) >= 40 || isPartner || !!fl.hasProtector,
      (a.influence || 0) >= 20,
    ],
    home: [
      fl.housing === 'rent' || fl.housing === 'mortgage' || fl.housing === 'own',
      (a.family || 0) >= 1 || (a.network || 0) >= 50 || isPartner,
      (a.money || 0) >= 10,
      (a.debt || 0) < 3 && (a.money || 0) >= 0,
    ],
    free: [
      (a.stress || 0) < 40,
      (a.debt || 0) <= 1,
      (a.health || 0) >= 60,
      hasVenture || (a.network || 0) >= 50 || (a.money || 0) >= 30,
    ],
    love: [
      isPartner && h4 >= 30,
      isPartner && h4 > 60,
      (a.network || 0) >= 40,
      (a.network || 0) >= 50 || isPartner,
    ],
    health: [
      (a.health || 0) >= 60,
      (a.health || 0) >= 80,
      (a.health || 0) >= 60 && (a.stress || 0) < 70,
      (a.health || 0) >= 40,
    ],
  };
  const scoreOne = (id) => {
    const list = indicators[id];
    if (!list) return 0;
    return Math.min(3, list.filter(Boolean).length);
  };
  const per = {};
  let raw = 0;
  for (const id of (state.obsessions || [])) { per[id] = scoreOne(id); raw += per[id]; }
  const deductions = { health: 0, debt: 0, estranged: 0 };
  if (a.health <= 20) deductions.health = 2;
  if (a.debt === 5) deductions.debt = 1;
  // v1.2: 断亲不再扣"回家"分（deductions.estranged 恒为 0，字段保留
  // 供旧存档/旧测试读取，不再产生扣分）。
  const total = raw - deductions.health - deductions.debt - deductions.estranged;
  const ending = total >= 5 ? 'fulfilled' : total >= 3 ? 'another-way' : total >= 1 ? 'survived' : 'restart';
  return { per, raw, deductions, total, ending };
}

// ---- v1.2 (P0-6): 兑现卡第 ④ 格 · 反事实归因（承诺 E，失败时才算）。
// 算法（设计文档）：对每个因子用当年该因子的“可达上限”替换当前值重算
// 成功率，能翻盘的按需补差值升序、只显示最近 2 条；没有单因子能翻盘
// → 显示“这一年没有单点能救你，是三个因子各差一点”。
// “可达上限”是签署前一年（T13）的行动空间：签署前把那一年的 3 个
// 行动点全投某一项，最多能到的值——专业 +3 AP × 5 × k；人脉 +3 AP × 6；
// 现金 +3 AP × 3 万（兼职/接私活）；压力档回到稳（签署前一年全用来
// 喘气）。v1.0 把这笔账算在 T15 头上是错的：T15 在签署之后，T15 的
// 行动改不了已封存的成功率——反事实只允许用签署前可改变的条件。
// 合伙人修正（H6）与伴侣共担（H4）都是签署时封存的骰，行动改不了，
// 上限就是当前值，不参与翻盘。snapshot 是 T14 签署时的快照（含
// chance/roll）。返回 [{ factor, label, need, cap, delta, text }]
// （最多 2 条，按 delta 升序），没有能翻盘的返回 []（调用方显示兜底句）。
// 文案一律用“签字前……”开头，并写明签字后改不了这颗骰。
// ----
// 签字后能减轻什么损失（T15 及之后）：与反事实分开列。T15 的行动只
// 改变失败后的损失/恢复速度/替代机会——多攒现金、降压恢复、接受一次
// 善意帮助、推进手头的项目——绝不改变已封存的 E 成功率或结果。
// 返回 [string]，由兑现卡第 ④ 格在“签字前……”之后另起一段列出。
// ----
function postFailureMitigation(state) {
  const a = state.attrs || {};
  const out = [];
  if ((a.money || 0) < 10) out.push('T15 接私活/兼职多攒一点现金：兑现时手里多一分，下一年的日子就少紧一分。');
  if ((a.stress || 0) >= 70) out.push('T15 好好休息、陪家人/朋友：压力降下来，恢复得快一点，崩档不会拖到下一年。');
  if ((state.flags && (state.flags.consecFails || 0) >= 1)) out.push('连续失败后会有人推你一把：接受一次善意帮助（接受/暂留/拒绝都由你），压力 −8，人脉 +2。');
  if ((state.ventures || []).some((v) => v.status === 'active' || v.status === 'validating' || v.status === 'running')) out.push('推进手头的项目：多一条收入线，失败的这一格就不是全部。');
  if (!out.length) out.push('T15 没有必须做的事：先稳住现金和压力，再想下一步。');
  return out;
}
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
      text: `签字前，真正能救你的是专业 ≥${snap.skill + delta}。你当年 ${snap.skill}，签字前一年把行动点全投系统学习最多到 ${skillCap}——差 ${delta} 点。签字已经封存了，T15 再学也改不了这颗骰。` });
  }
  // 人脉：每点 +0.15 成功率。
  const networkCap = snap.network + 3 * 6;
  if (gambleChanceFrom({ ...base, network: networkCap }) >= snap.roll) {
    const delta = Math.ceil(needChance / 0.15);
    cands.push({ factor: 'network', label: '人脉', need: snap.network + delta, cap: networkCap, delta, unit: '点',
      text: `签字前，真正能救你的是人脉 ≥${snap.network + delta}。你当年 ${snap.network}，签字前一年把行动点全投社交局最多到 ${networkCap}——差 ${delta} 点。签字已经封存了，T15 再攒也改不了这颗骰。` });
  }
  // 现金：每万 +0.5 成功率，但 min(20, 现金×0.5) 有 20 点上限。
  const moneyCap = snap.money + 3 * 3;
  if (gambleChanceFrom({ ...base, money: moneyCap }) >= snap.roll) {
    const delta = Math.ceil(needChance / 0.5);
    cands.push({ factor: 'money', label: '现金', need: snap.money + delta, cap: moneyCap, delta, unit: '万',
      text: `签字前，真正能救你的是现金 ≥${snap.money + delta} 万。你当年 ${snap.money} 万，签字前一年把行动点全投兼职/接私活最多到 ${moneyCap} 万——差 ${delta} 万。签字已经封存了，T15 再攒也改不了这颗骰。` });
  }
  // 压力档：回到稳，扣的分全回来。
  if (snap.tier === 'tense' || snap.tier === 'break') {
    const penalty = snap.tier === 'tense' ? 5 : 12;
    if (gambleChanceFrom({ ...base, tier: 'calm' }) >= snap.roll) {
      cands.push({ factor: 'pressure', label: '压力', need: '稳', cap: '稳', delta: penalty, unit: '点',
        text: `签字前，真正能救你的是压力回到稳档。你当年是${snap.tier === 'tense' ? '紧绷' : '崩'}，多扣了 ${penalty} 点成功率——签字前一年把行动点全用来喘气（健身/躺平/陪家人）才够。签字已经封存了，T15 再喘气也改不了这颗骰。` });
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
  // v1.2 (P1-5): 项目配置字段——创建时的完整画像，供复审与后续
  // 场景引用：项目年份、原始想法、商业模式、所需能力。
  v.projectYear = typeof opts.projectYear === 'number' ? opts.projectYear : (state.flags && state.flags.era ? state.flags.era.examYear + (state.turn - 1) : 2010);
  v.originalIdea = String(text).trim().slice(0, 200);
  v.businessModel = archetype.name || '';
  v.requiredCapabilities = (archetype.requiredCapabilities || []).slice();
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

// ---- v1.2 (P1-1): NPC 对话演练 ----
// NPC 结构（见 data.js NPCS）：id / name / role / backgroundTags /
// values（competence 慕能 / hierarchy 重秩序层级 / reciprocity 重
// 人情互惠 / autonomy 重自主）/ traits。回复逻辑只读 values 与意图，
// backgroundTags（地域、出身）只用于界面展示与成长叙事，绝不直接
// 决定行为——王姐是“慕强、重结果”，不是“关系偏好+饭局敬酒”。
// npcReply(npcId, input, memory, topic): 纯函数。先按关键词判意图，
// 再按该意图下 NPC 的 values 选回复模板；memory.history 有同主题
// 记录时引用最近一次（“上次你说……”）；返回 { text,
// trustDelta, memoryNote }。信任由调用方写回 meta.npcMemory。
// trust ≥60：回复更热情、主动给帮助；≤20：更戒备、更短。
const NPC_REPLIES = {
  wang: {
    advice: ['别问我该怎么办，先告诉我你做到哪一步了。结果摆出来，我才帮你想下一步。', '这个问题问得太虚。把你手头的选择列出来，标上各自的结果，我再给你排个序。'],
    vent: ['我知道你难受。但难受解决不了问题——先说你想拿到什么结果。', '情绪我听到了。接下来，把这件事拆成三步，第一步今天就能做。'],
    request: ['帮你可以，但你得先说清楚你要什么、什么时候要、做成了算谁的。', '我不帮没头没尾的忙。把事情说清楚，我再决定。'],
    refuse: ['拒绝就拒绝得干脆点，别绕。说“我做不了，原因是什么”，比拖着强。', '不会拒绝的人最后都累死在别人的事上。直接说，不用道歉。'],
    result: ['这个结果不错。下一步怎么放大？', '做到了就别停，趁热把下一个目标定下来。'],
    money: ['钱的事要算账，不要谈感情。先把数算清楚，再谈人情。', '谈钱先谈价，再谈交情。顺序反了，你就亏了。'],
    default: ['说重点。', '继续，我听着——但只听有用的部分。'],
  },
  li: {
    advice: ['你这问题，根子在基本功。先把手头这件事做到 90 分，再来问下一步。', '别绕弯子，直接说你卡在哪一步，我给你指个方向。'],
    vent: ['我听明白了。你先缓一口气，然后告诉我：明天你准备先干哪一件？', '难受是正常的。但活儿还得干——先挑一件最小的，干完再说。'],
    request: ['可以帮。把材料准备好发我，我抽空看。', '帮你没问题，但丑话说前头：我只帮你把关，不替你干活。'],
    refuse: ['拒绝要讲理：说清楚你为什么做不了，再给一个替代方案。', '直接说“我接不了”，然后告诉对方谁能接。这叫负责。'],
    result: ['做得不错。下一步把这事写下来，变成你自己的方法。', '有结果就好。记住这次是怎么成的，下次照着来。'],
    money: ['钱要挣得明白。先算清楚这一单你挣多少、学到多少，再谈下一单。', '别为小钱折腾大时间。算清楚时薪，再决定接不接。'],
    default: ['嗯，继续说。', '我听着呢。'],
  },
  laochen: {
    advice: ['这事我懂。你先别急，咱慢慢想，总有办法的。', '听我的，先把眼前这一步走稳，剩下的咱一起想。'],
    vent: ['没事，有我在呢。先把这口气顺了，咱再想办法。', '你受委屈了，我听着呢。慢慢说，不着急。'],
    request: ['这事包在我身上。你放心，我肯定帮你办妥。', '你开口了，我还能说不？交给我。'],
    refuse: ['拒绝也得讲究：先谢人家，再说难处，别把话说死。', '不想做就直说，但别伤了和气——留条后路。'],
    result: ['好样的！就知道你能行。今晚我请你吃顿好的。', '成了就好！这事值得庆祝。'],
    money: ['钱的事好商量。你先说个数，咱再慢慢算。', '别为钱伤了和气。先把人情处好，钱慢慢挣。'],
    default: ['说吧，我听着。', '嗯，我在呢。'],
  },
  interviewer: {
    advice: ['Good question. In interviews, lead with the result, then explain how you got there.', 'Structure your answer: situation, action, result. Keep it under two minutes.'],
    vent: ['I understand this is stressful. Take a breath, and tell me one concrete example.', 'It is normal to feel nervous. Focus on what you did, not how you felt.'],
    request: ['Of course. Please be specific about what you need, and I will do my best to help.', 'Happy to help — could you share more details first?'],
    refuse: ['A polite no is a skill: "I am unable to take this on, but here is who can help." Try that.', 'Saying no clearly shows professionalism, not rudeness.'],
    result: ['That is a strong result. How would you scale it?', 'Well done. What did you learn from it?'],
    money: ['When salary comes up, name a range based on market data, not feelings.', 'Negotiate with numbers: your market value, not your needs.'],
    default: ['Please go on.', 'I am listening.'],
  },
  listener: {
    advice: ['我听到了。你觉得，哪一步对你来说最难？', '不用急着做决定。先说说，你心里最在意的是什么？'],
    vent: ['嗯，我在这里，慢慢说。你愿意说多少，就说多少。', '听起来这段时间真的很不容易。你已经撑了很久了。'],
    request: ['当然可以。你想让我怎么陪你？听着，还是帮你一起想办法？', '没问题。你想先聊聊，还是直接想办法？'],
    refuse: ['拒绝别人不是自私，是照顾好自己。你可以慢慢说“不”。', '你有权利说不。不用解释太多，一句“我做不到”就够了。'],
    result: ['真好，替你高兴。你是怎么做到的？', '这一步很不容易。你为自己争取到了。'],
    money: ['钱的事让人焦虑，很正常。我们可以先把数字列出来，一件一件看。', '别一个人扛着算账。说出来，我们一起理一理。'],
    default: ['嗯，我在听。', '你继续说，我在这里。'],
  },
  community: {
    advice: ['这事社区里有人遇到过，我可以帮你问问有什么现成的办法。', '先别急，我帮你查一下有哪些政策和资源能用。'],
    vent: ['辛苦了。社区这边有个活动，你可以来坐坐，不用一个人闷着。', '我听着呢。你愿意的话，我们可以一起想想接下来怎么办。'],
    request: ['没问题，这就是我的工作。你把情况跟我说说，我帮你对接。', '可以的。你先登记一下，我帮你联系相关部门。'],
    refuse: ['拒绝可以很礼貌：说“我能力有限”，再帮对方指条别的路。', '你不用什么都答应。先顾好自己，再帮别人。'],
    result: ['太好了！这事办成了，社区里又多一个好例子。', '不错！需要的话，我可以帮你把这个经验分享给更多人。'],
    money: ['钱的事，我可以帮你问问有没有补助或公益岗位。', '先别慌，咱们看看有哪些公开的渠道能帮你。'],
    default: ['我在呢，慢慢说。', '好，我记下了，还有吗？'],
  },
};
const NPC_WARM_TAIL = {
  wang: '做得好就继续找我。', li: '有问题随时来问。', laochen: '有事随时找我，咱哥俩不客气。',
  interviewer: 'Feel free to reach out anytime.', listener: '我一直都在。', community: '随时来社区找我。',
};
const NPC_GUARDED_TAIL = {
  wang: '先说到这儿吧。', li: '就这样吧。', laochen: '……我先听着。',
  interviewer: 'Let us leave it there for now.', listener: '……慢慢来，不着急。', community: '我先记下来。',
};
function npcIntentOf(input) {
  const t = (input || '').toLowerCase();
  const has = (...ks) => ks.some((k) => t.includes(k));
  if (has('拒绝', '不想做', '说不', '推掉', 'say no', 'refuse', 'decline')) return 'refuse';
  if (has('钱', '工资', '薪水', '涨薪', '加薪', '价钱', 'salary', 'pay', 'money', 'raise')) return 'money';
  if (has('完成', '搞定', '拿下', '通过', '成功', '做到了', 'done', 'achieved', 'passed', 'succeeded')) return 'result';
  if (has('帮我', '帮忙', '能帮', '求你', '请帮', 'help', 'can you', 'could you')) return 'request';
  if (has('难受', '委屈', '累', '烦', '难过', '伤心', '撑不下去', '压力大', 'stressed', 'sad', 'tired', 'exhausted')) return 'vent';
  if (has('请教', '建议', '怎么办', '怎么', '如何', 'should', 'how', 'what should')) return 'advice';
  return 'default';
}
// ---- v1.3 (P1-1): 每个意图由哪一个 values 维度驱动 ----
// advice/result -> competence（慕能型看重能力与结果）；
// vent/request -> reciprocity（重人情型更愿意接住倾诉与求助）；
// refuse -> autonomy（自主型更接受“不”）；money -> hierarchy
// （重等级型更在意谁说了算）；default -> competence。
const NPC_INTENT_VALUE = { advice: 'competence', result: 'competence', vent: 'reciprocity', request: 'reciprocity', refuse: 'autonomy', money: 'hierarchy', default: 'competence' };
function npcReply(npcId, input, memory, topic) {
  const table = NPC_REPLIES[npcId] || NPC_REPLIES.listener;
  const intent = npcIntentOf(input);
  // ---- v1.3 (P1-1 of the 2026-11-20 re-review): values 真正参与回复 ----
  // 每个意图由一个主导 value 驱动：求建议/谈结果 -> competence，倾诉/
  // 求助 -> reciprocity，拒绝 -> autonomy，谈钱 -> hierarchy，其他 ->
  // competence。主导 value ≥70 选第一条模板（更直接/更强硬），<70 选
  // 第二条（更温和/更留有余地）——同一 NPC、同一输入、同一历史，改
  // 主导 value 必换回复。backgroundTags 只作展示，npcReply 从不读它。
  const npc = (typeof NPCS !== 'undefined' ? NPCS : []).find((n) => n.id === npcId) || null;
  const values = (npc && npc.values) || { competence: 50, hierarchy: 50, reciprocity: 50, autonomy: 50 };
  const driving = NPC_INTENT_VALUE[intent] || 'competence';
  const variants = table[intent] || table.default;
  const idx = values[driving] >= 70 ? 0 : (variants.length > 1 ? 1 : 0);
  let text = variants[idx];
  const mem = memory || { trust: 50, history: [] };
  const trust = typeof mem.trust === 'number' ? mem.trust : 50;
  // 记忆：同主题聊过，引用最近一次玩家原话。
  const last = (mem.history || []).filter((h) => !topic || h.topic === topic).slice(-1)[0];
  if (last && last.playerText) {
    const snippet = last.playerText.slice(0, 14);
    text = (npcId === 'interviewer' ? `Last time you mentioned "${snippet}" — ` : `上次你说“${snippet}……”——`) + text;
  }
  if (trust >= 60) text += (NPC_WARM_TAIL[npcId] || '');
  else if (trust <= 20) text += (NPC_GUARDED_TAIL[npcId] || '');
  // 信任变化也读 values：支持性 +5（重人情型多 +1）；敌对 −5；
  // 讲出成果 +3，慕能型 NPC（competence ≥75）多 +2；倾诉 +1，
  // 重人情型（reciprocity ≥75）多 +1；其余 0。
  const t = (input || '').toLowerCase();
  let trustDelta = 0;
  if (['废物', '滚', '别烦', '你懂什么', '闭嘴', 'stupid', 'useless', 'shut up'].some((k) => t.includes(k))) trustDelta = -5;
  else if (['谢谢', '辛苦', '请教', '麻烦你', 'thanks', 'thank you'].some((k) => t.includes(k))) trustDelta = 5 + (values.reciprocity >= 75 ? 1 : 0);
  else if (intent === 'result') trustDelta = 3 + (values.competence >= 75 ? 2 : 0);
  else if (intent === 'vent') trustDelta = 1 + (values.reciprocity >= 75 ? 1 : 0);
  return { text, trustDelta, memoryNote: last ? 'referenced-history' : 'first-time', drivenBy: driving, drivingValue: values[driving] };
}
// 演练主题（不改正式世界线，不涉付费改命）。
const DRILL_TOPICS = [
  { id: 'family', label: '家庭沟通', npc: 'laochen' },
  { id: 'interview', label: '面试', npc: 'interviewer' },
  { id: 'refuse', label: '拒绝不合理要求', npc: 'wang' },
  { id: 'en-interview', label: '英文面试', npc: 'interviewer' },
  { id: 'sanctuary', label: '心灵驿站', npc: 'listener' },
  { id: 'voice', label: '语音面试', npc: 'interviewer' },
];
// 英文面试反馈：长度 / 具体成果 / 结构，三条，每条中英文对照。
function interviewEnFeedback(answer) {
  const text = (answer || '').trim();
  const words = text ? text.split(/\s+/).length : 0;
  const lines = [];
  let score = 0;
  if (words >= 20) { score += 1; lines.push('Answer length is good (20+ words). 回答够完整。'); }
  else if (words >= 8) { lines.push('A bit short — try 20+ words with one example. 回答偏短，试着加一个例子，20 词以上。'); }
  else { lines.push('Too short — one full sentence at least. 太短了，至少一整句话。'); }
  if (/\b(achieved|improved|increased|decreased|led|built|launched|delivered|reduced|grew)\b/i.test(text) || /%|\d+/.test(text)) { score += 1; lines.push('You named a concrete result. 有具体成果，好。'); }
  else { lines.push('Add a concrete result (a number or an outcome). 加一个具体成果（数字或结果）。'); }
  if (/\b(first|then|finally|because|so|as a result)\b/i.test(text)) { score += 1; lines.push('Structure is clear (first / then / finally). 结构清楚。'); }
  else { lines.push('Structure tip: first → then → result. 结构提示：先讲背景，再讲行动，最后讲结果。'); }
  return { score, lines };
}
// 心灵驿站：只陪伴疏导，不诊断、不开处方。出现自伤/自杀相关表述时
// 返回危机回复（含求助热线），不走普通对话模板。
const SANCTUARY_CRISIS_WORDS = ['不想活', '自杀', '活不下去', '伤害自己', 'suicide', 'kill myself', 'end my life'];
function sanctuaryReply(input) {
  const t = (input || '');
  if (SANCTUARY_CRISIS_WORDS.some((k) => t.toLowerCase().includes(k.toLowerCase()))) {
    return { crisis: true, text: '听到你这么说，我很在意你。你不是一个人在扛：请立刻联系可以信任的人，或拨打心理援助热线 12356（24 小时）/ 希望24热线 400-161-9995。如果正在危险中，请拨打 110 / 120。' };
  }
  return { crisis: false, text: null };
}
// ---- v1.2 (P1-7), v1.3 (P1-2 of the 2026-11-20 re-review): 善意帮助的来源 ----
// 关系好：找信任最高的 NPC（trust ≥50）；其次伴侣（H4 ≥30）；再按
// 立场找老李/王姐；人脉 ≥40 找老陈；以上都没有：陌生人善意 / 公共
// 资源 / 社区支持。保证“总能获得一个支持机会”，不保证指定 NPC 变好。
// v1.3：站队/人脉后备路径也要过信任关——信任 <50 的 NPC 不会无条件
// 帮忙，改走社区/陌生人。没打过交道的 NPC 信任记中立 50（立场本身
// 就是一次关系，v1.2 的行为保留）；有明确敌意（trust <50）时不选他。
function npcTrustOf(meta, npcId) {
  const mem = (meta && meta.npcMemory) || {};
  const m = mem[npcId];
  return (m && typeof m.trust === 'number') ? m.trust : 50;
}
function kindnessSource(state, meta) {
  const mem = (meta && meta.npcMemory) || {};
  let best = null;
  for (const id of Object.keys(mem)) {
    const m = mem[id];
    if (m && typeof m.trust === 'number' && m.trust >= 50 && (!best || m.trust > mem[best].trust)) best = id;
  }
  if (best) {
    const npc = (typeof NPCS !== 'undefined' ? NPCS : []).find((n) => n.id === best);
    return { kind: 'npc', npcId: best, label: npc ? npc.name : best };
  }
  if (state.flags && state.flags.relationship === 'partner' && state.sealed && state.sealed.H4 && state.sealed.H4.value >= 30) {
    return { kind: 'partner', npcId: null, label: '伴侣' };
  }
  if (state.flags && state.flags.stance === 'li' && npcTrustOf(meta, 'li') >= 50) return { kind: 'npc', npcId: 'li', label: '老李' };
  if (state.flags && state.flags.stance === 'wang' && npcTrustOf(meta, 'wang') >= 50) return { kind: 'npc', npcId: 'wang', label: '王姐' };
  if ((state.attrs && state.attrs.network || 0) >= 40 && npcTrustOf(meta, 'laochen') >= 50) return { kind: 'npc', npcId: 'laochen', label: '老陈' };
  return { kind: 'stranger', npcId: 'community', label: '社区服务中心的工作人员' };
}

if (typeof module !== 'undefined') {
  module.exports = { SAVE_KEY, META_KEY, blankAttrs, newRun, saveGame, loadGame, clearSave, saveKeyForSlot, exportCode, importCode, loadMeta, saveMeta, pressureTier, settleYear, sealDie, omenTrueClaim, omenMisleadingClaim, omenClaimsFor, offerTier, layoffChance, gambleChance, gambleChanceFrom, tierLabel, h5Level, fResilience, careSubjectFor, sealedCareSubject, estrangementScope, migrateSave, severancePay, obsessionScore, counterfactualFlips, postFailureMitigation, classifyVenture, nonVentureReason, startVenture, ventureChance, ventureThemes, resolveVentureYear, rewardText, majorAdmissionLine, bestReachableMajor, resolveAdmission, npcReply, npcIntentOf, interviewEnFeedback, sanctuaryReply, kindnessSource, npcTrustOf, DRILL_TOPICS };
}
