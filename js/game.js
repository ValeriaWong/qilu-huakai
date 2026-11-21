'use strict';
/* 《歧路花开》 v5 — screen flow.
 * S0 开场 → S1 掷骰 → S2 出身卡 → S3 成长片段 → [S4/S5 仅重开局] →
 * S6 转场 → T1 高考报名 → T2–T8 年度循环 (T5 毕业去向, T6 站队) →
 * T9 26 岁裁员之夜 (3 分钟切片) → 切片结算.
 * First playthrough has NO rewrite entry (v5: S4 unlocks only at settlement
 * via 「再来一次」). Difficulty is free and locked at run start (v5).
 */
const $ = (sel) => document.querySelector(sel);
const screenEl = () => $('#screen');
const statusEl = () => $('#status');

let G = null; // { state, rng, meta, flow }

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function attrBar(label, value, max, suffix) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return `<div class="bar-row"><span class="bar-label">${label}</span><div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div><span class="bar-val">${value}${suffix || ''}</span></div>`;
}

function renderStatus() {
  if (!G || !G.state) { statusEl().innerHTML = ''; return; }
  const s = G.state, a = s.attrs;
  const tier = pressureTier(a.stress);
  const turnLabel = s.turn === 0 ? '开局' : (s.turn === 9 ? 'T9 · 26 岁' : `T${s.turn} · ${17 + s.turn} 岁`);
  statusEl().innerHTML = `
    <span>${turnLabel}</span><span>AP ${s.ap}</span>
    <span>钱 ${a.money} 万</span><span>健康 ${a.health}</span>
    <span class="stress-${tier.color}">压力 ${a.stress}（${tier.name}）</span>
    <span>家庭线 ${a.family >= 0 ? '+' : ''}${a.family}</span>
    <span>Debt ${a.debt}</span>
    <span class="muted">${DIFFICULTIES[s.difficulty].name} · ${s.runNumber} 周目 · ${s.slot} 号位</span>
    <span class="muted" id="save-state">已自动保存</span>`;
}

function setScreen(html) {
  screenEl().innerHTML = html;
  renderStatus();
  window.scrollTo(0, 0);
}

function autosave(note) {
  if (saveGame(G.state)) {
    const el = $('#save-state');
    if (el) el.textContent = '已自动保存' + (note ? ' · ' + note : '');
  }
}

// ---------- S0: title ----------
function screenTitle() {
  const meta = G.meta;
  const save = loadGame(G.pickedSlot);
  const slots = meta.slots.map((sl) => {
    const s = loadGame(sl.id);
    const label = s ? `有存档 · T${s.turn}${s.finished ? ' · 已结算' : ' · ' + (17 + s.turn) + ' 岁'}` : '空';
    return `<button class="slot open" data-act="slot" data-id="${sl.id}">${sl.id} 号位 · ${label}</button>`;
  }).join('');
  setScreen(`
    <h1>歧路花开</h1>
    <p class="tagline">人生不止一条路，把不敢做的选择，先在这里演练一遍。</p>
    <p class="intro">《歧路花开》不是人生模拟器，是人生决策演练场。演练从 18 岁开始。每年 3 个行动点，承诺与兑现错开 1–3 年，骰子在签署那一刻封存，兑现时只读档、不重掷。</p>
    <h2>选 2 条执念</h2>
    <p class="muted">开局定死恰好两条，35 岁按这两条结算。只选 1 条或 0 条进不去，系统不会替你补选。</p>
    <div class="chips">${OBSESSIONS.map((o) => `<button class="chip" data-act="obsession" data-id="${o.id}">${o.name}<small>${o.desc}</small></button>`).join('')}</div>
    <h2>难度（免费，开局锁死）</h2>
    <div class="chips">${Object.entries(DIFFICULTIES).map(([k, d]) => `<button class="chip" data-act="difficulty" data-id="${k}">${d.name}<small>${d.note}</small></button>`).join('')}</div>
    <h2>周目位</h2>
    <p class="muted">三个周目位，互相独立，切换不覆盖。每个周目位单独存档。</p>
    <div class="chips">${slots}</div>
    <div class="actions">
      <button class="primary" data-act="start">开始新的人生</button>
      <button data-act="slice">3 分钟切片：直接进 26 岁</button>
      ${save ? `<button data-act="continue">继续（${save.turn === 0 ? '开局' : 'T' + save.turn + ' · ' + (17 + save.turn) + ' 岁'}）</button>` : ''}
      <button data-act="drill-lobby">免费演练（不改世界线）</button>
    </div>
    <h2>功能说明</h2>
    <p class="muted">英文面试：已实现——文本英文面试（英文提问 + 英文作答 + 反馈）。<br>心灵驿站：已实现——文本陪伴疏导（只陪伴，不诊断，不开处方）。<br>语音面试：试运行——浏览器语音识别，不可用时自动转文字输入。<br>免费演练：已实现——家庭沟通 / 面试 / 拒绝不合理要求，自由输入对话，不改正式世界线。</p>
    <p class="foot">本地存档，不开数据源，不用登录。点「请 AI 审核」才会把点子发给外部 AI；匿名统计可关。存档码可导出 / 导入。v1.4 设计稿见仓库 README。</p>
    <div class="actions small">
      <button data-act="export">导出存档码</button>
      <button data-act="import">导入存档码</button>
      <button data-act="reset">重开（清除当前周目位存档）</button>
    </div>`);
  G.pickedObsessions = new Set();
  G.pickedDifficulty = 'normal';
  // v1.3 (P0-4 of the 2026-11-20 re-review): 标题屏不再把周目位
  // 重置回 1 号位——导入与重置都按用户当前选定的槽位走，渲染标题
  // 不能悄悄换槽。非法值才回退到 1。
  if (![1, 2, 3].includes(G.pickedSlot)) G.pickedSlot = 1;
}

function refreshChips() {
  document.querySelectorAll('[data-act="obsession"]').forEach((b) => {
    b.classList.toggle('picked', G.pickedObsessions.has(b.dataset.id));
  });
  document.querySelectorAll('[data-act="difficulty"]').forEach((b) => {
    b.classList.toggle('picked', G.pickedDifficulty === b.dataset.id);
  });
  document.querySelectorAll('[data-act="slot"]').forEach((b) => {
    b.classList.toggle('picked', G.pickedSlot === Number(b.dataset.id));
  });
}

// ---------- origin generation ----------
function rollOrigin(rng, difficulty) {
  const pool = Object.entries(FAMILIES)
    .filter(([, f]) => !(f.hardOnly && difficulty !== 'hard' && difficulty !== 'nightmare'))
    .map(([k, f]) => [k, f.weight]);
  const key = rng.weighted(pool);
  const fam = FAMILIES[key];
  const counter = rng.chance(0.3); // 三成反例池
  const a = blankAttrs();
  a.money = fam.money;
  a.health = fam.health;
  a.stress = fam.stress;
  a.skill = 20 + rng.int(-5, 5);
  a.express = 20 + rng.int(-5, 5);
  a.network = key === 'orphan' ? 10 : 20 + rng.int(-5, 5);
  a.influence = 20 + rng.int(-5, 5);
  const fragments = rng.shuffle(fam.fragments.slice()).slice(0, 3);
  if (counter) fragments.push(fam.counter);
  // v0.7: home province (the T1 region picker defaults to it), family
  // economy E-tier (independent of the family type) and the background
  // facts the chronicle conditions need (soe/stocks/trading/selfHouse/
  // medical). 孤儿不自动负债: the -3 pocket loan stays on the card, the
  // E-tier rolls normally for the guardian.
  const homeRegion = rng.pick(['shandong', 'liaoning', 'jilin', 'heilongjiang']);
  const econ = rollFamilyEcon(rng);
  const bg = rollFamilyBg(rng, fam.locale || 'city', econ.tier);
  return { familyKey: key, familyName: fam.name, card: fam.card, fragments, counter, attrs: a, homeRegion, econ, bg };
}

function rollH0(rng, familyKey) {
  // v1.2 (P1-2): 干预强度与修改权限分开生成。强度 = 家庭基础值 +
  // rng.int(-40, 20)：拉宽后没有任何家庭能保证 h0 >= 60——NPD 基础值
  // 80，仍有约三分之一的概率落在 60 以下；model 基础值 20，最高 40，
  // 永远到不了篡改线。
  const base = { model: 20, absentFather: 45, absentMother: 45, absentBoth: 40, orphan: 0, npd: 80 }[familyKey] ?? 40;
  return Math.max(0, Math.min(100, base + rng.int(-40, 20)));
}

// v1.2 (P1-2): parentHasAccess（家长有无修改志愿的途径）与强度分开
// 掷：先验概率按家庭结构给，但每一次都是掷出来的，不是查表查出来的。
// 双缺席（祖辈监护）与孤儿永远没有家长账号行为；其他家庭按概率掷。
function rollH0Access(rng, familyKey) {
  const prior = { model: 0.9, absentFather: 0.8, absentMother: 0.8, absentBoth: 0, orphan: 0, npd: 0.95 }[familyKey];
  if (prior === undefined) return rng.chance(0.8);
  if (prior === 0) return false;
  return rng.chance(prior);
}

function startNew(mode) {
  // v1.2 (P0-2): 开局必须恰好选 2 条执念，0/1 条时开始按钮阻止进入
  // 并明示要求，系统绝不暗中补选。切片模式是演示捷径，本来就没有
  // 执念，不受这条限制。
  if (mode === 'full' && G.pickedObsessions.size !== 2) {
    alert(`开局要选恰好 2 条执念，你现在选了 ${G.pickedObsessions.size} 条。请再选 ${2 - G.pickedObsessions.size} 条。`);
    return;
  }
  const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
  const runNumber = mode === 'slice' ? 1 : (G.meta.runsFinished + 1);
  const state = newRun(seed, {
    runNumber,
    slot: G.pickedSlot,
    mode,
    difficulty: G.pickedDifficulty,
    obsessions: [...G.pickedObsessions],
  });
  G.state = state;
  G.rng = makeRng(seed);
  G.rng.setState(seed);
  state.attrs = blankAttrs();
  if (mode === 'slice') { enterSlice(true); return; }
  screenEraYear(); // v0.6: S0.5 picks the birth year before the S1 dice
}

// ---------- S0.5: pick a birth year (v0.6, v6 era engine) ----------
// Between S0 and S1. The birth year locks the exam year and the whole
// timeline (birth+18=exam, exam+8=T9, exam+17=settlement). Only years with
// at least one verified line are playable right now (exam 2010-2020 ->
// birth 1992-2002); the rest show locked with the reason, never a fallback
// to a neighbouring year's line.
function screenEraYear() {
  const playable = new Set(playableBirthYears());
  const years = [];
  for (let b = ERA_BIRTH_MAX; b >= ERA_BIRTH_MIN; b--) years.push(b);
  const btn = (b) => {
    const exam = examYearForBirth(b);
    const tag = isHistoryPack(b) ? '历史扩展' : (b >= ERA_BIRTH_HIGHLIGHT_MIN ? '推荐' : '');
    const head = `<b>${b} 年出生 → ${exam} 年高考</b>`;
    if (!playable.has(b)) {
      return `<button class="opt" disabled>${head}<span>${tag ? tag + ' · ' : ''}该年分数线未核实，暂不能玩（线表补齐后开放）。</span></button>`;
    }
    return `<button class="opt" data-act="era-year-pick" data-id="${b}">${head}<span>${tag ? tag + ' · ' : ''}时间线按这一年走：T9 是 ${t9Year(exam)} 年，35 岁结算是 ${settlementYear(exam)} 年。</span></button>`;
  };
  setScreen(`
    <h1>S0.5 · 你是哪一年出生的？</h1>
    <p class="intro">这一局演的是真实年份里的一代人：高考分数线、大事记、家庭经济都按你选的年份走，出生年份一选就锁死，时间线不能乱。</p>
    <p class="muted">你选的执念：${[...G.pickedObsessions].map((id) => (OBSESSIONS.find((o) => o.id === id) || {}).name || id).join('、')}（开局定死，35 岁按这两条结算）。</p>
    <p class="muted">可玩出生年 1990–2008（高考 2008–2026），1970–1989 为历史扩展包。分数线按核实进度开放，现在能玩的是 ${playableBirthYearsLabel()}出生；其他年份等线表补齐后开放。</p>
    <h2>1990–2008 年出生</h2>
    <div class="options">${years.filter((b) => b >= 1990).map(btn).join('')}</div>
    <h2>1970–1989 年出生 · 历史扩展</h2>
    <p class="muted">这一段的人生 T18 落在 2005 年以前，全是真实历史，没有移动互联网玩法。</p>
    <div class="options">${years.filter((b) => b < 1990).map(btn).join('')}</div>`);
}

function pickEraYear(birthYear) {
  const b = Number(birthYear);
  const s = G.state;
  if (!Number.isInteger(b) || b < ERA_BIRTH_MIN || b > ERA_BIRTH_MAX) return;
  if (!playableBirthYears().includes(b)) return;
  s.flags.era = { birthYear: b, examYear: examYearForBirth(b) };
  s.rngState = G.rng.getState();
  autosave('选定出生年份 ' + b);
  screenDice();
}

function screenDice() {
  setScreen(`
    <h1>S1 · 掷骰</h1>
    <p class="intro">0–18 岁，别人替你签的第一份承诺。你只有一次机会看它掷出来——没有重掷按钮。第一次必须是命。</p>
    <div class="dice" id="dice">🎲</div>
    <p class="muted" id="dice-note">正在掷骰……</p>`);
  const s = G.state, rng = G.rng;
  setTimeout(() => {
    s.origin = rollOrigin(rng, s.difficulty);
    Object.assign(s.attrs, s.origin.attrs);
    // H0: 出生时封存，T1 兑现。v1.2 (P1-2): 强度与权限分开掷、分别存；
    // 征兆由封存值生成（engine.js sealDie，65% 准确），不再写死两句
    // 与值无关的固定文本。
    const h0 = rollH0(rng, s.origin.familyKey);
    s.flags.h0Access = rollH0Access(rng, s.origin.familyKey);
    sealDie(s, rng, 'H0', h0, 2);
    // 家庭抗压：v5 改成 T1 就可见的「家庭兜底」。v0.7: era runs derive
    // it from familySupportCapacity (cash × 意愿 × 可接触性), not from
    // pocket money; legacy runs keep the old pocket-money rule.
    s.flags.familyEcon = s.origin.econ;
    s.flags.familyBg = s.origin.bg;
    s.flags.familySafety = s.flags.era
      ? familySafetyText(s.origin.econ, s.origin.familyKey)
      : (s.origin.attrs.money >= 2 ? '家里能接住你一次，但只有一次。' : '家里接不住你——这条路得你自己走。');
    s.rngState = rng.getState();
    autosave();
    screenOrigin();
  }, 1500);
}

function screenOrigin() {
  const s = G.state, o = s.origin;
  const econ = s.flags.familyEcon || o.econ;
  const regionName = (GAOKAO_REGIONS[o.homeRegion] || {}).name || '';
  setScreen(`
    <h1>S2 · 出身卡</h1>
    <p class="tagline">你没得选的那部分</p>
    <div class="card">
      <p><b>家庭：</b>${esc(o.card.family)}</p>
      <p><b>父母：</b>${esc(o.card.parents)}</p>
      <p><b>${esc(o.card.money)}</b></p>
      <p><b>${esc(o.card.city)}</b></p>
      ${regionName ? `<p><b>老家：</b>${esc(regionName)}（高考默认在这个省考，可改）</p>` : ''}
      ${econ ? `<p><b>家庭经济：</b>${esc(econ.label)}，18 岁时家里可动用现金 ${econ.cash} 万。能真正拿出来兜你的：约 ${supportCash(econ, o.familyKey)} 万。</p>` : ''}
      <p><b>判词：</b>${esc(o.card.verdict)}</p>
    </div>
    <p class="intro">即将面对的第一个岔路口：高考志愿三天截止，父亲已备好省内师范名单。</p>
    <div class="actions"><button class="primary" data-act="to-fragments">看看那 18 年</button></div>`);
}

function screenFragments() {
  const s = G.state, o = s.origin;
  // v0.7: the 0-18 chronicle resolves here (retrospective, once): the
  // era events of birthYear..examYear-1 that apply to this player, with
  // their effects on family cash / stress / health already applied.
  const era = s.flags.era;
  const history = era ? applyEraHistory(s, G.rng) : [];
  const eraLog0 = era ? (s.eraLog || []).filter((e) => e.turn === 0) : [];
  setScreen(`
    <h1>S3 · 那 18 年</h1>
    <p class="intro">成长记录是展开层，点开看，默认收起，可以跳过。这一段没有输入框。</p>
    ${o.fragments.map((f, i) => `<details class="fragment"><summary>片段 ${i + 1}${i === o.fragments.length - 1 && o.counter ? ' · 反例' : ''}</summary><p>${esc(f)}</p></details>`).join('')}
    ${era ? `<details class="fragment"><summary>时代大事记（0–18 岁）${eraLog0.length ? ' · ' + eraLog0.length + ' 件进过你家门' : ' · 这一段没有大事进过你家门'}</summary>${eraLog0.length ? eraLog0.map((e) => `<p>${esc(e.text)}</p>`).join('') : '<p>你长大的那 18 年里，时代的大事没有直接砸到你家头上——背景还是那个背景，只是没进你家门。</p>'}<p class="muted">历史事件只按条件进家门（户口、家庭背景、持股……），没中的不会硬塞给你。2025/2026 年的事还没核实，不写进这里。</p></details>` : ''}
    <div class="actions"><button class="primary" data-act="to-transition">继续</button></div>`);
  // Persist the resolved 0-18 trajectory (eraLog + rng state) even when
  // nothing applied — the roll memo and the done-flag must survive reload.
  if (era) { s.rngState = G.rng.getState(); autosave(); }
}

// ---------- S4/S5: rewrite (replay runs only) ----------
function screenRewrite() {
  const s = G.state;
  setScreen(`
    <h1>S4 · 你只有一次机会</h1>
    <p class="intro">这是全流程唯一的真决策，上一周目结算时解锁的。改写不可逆，对照页会一直留着第一次的出身。</p>
    <p class="warn">你写的是经历，不是结果。系统照着你的经历长出你的 18 岁，但不会因为你写得好就对你更好。</p>
    <div class="card">
      <h2>A · 照我的来</h2>
      <p>用 20–200 字写一段和自己差不多的 18 岁前经历。文本只决定骰子的面，不碰数值分布。</p>
      <textarea id="rewrite-text" rows="4" maxlength="400" placeholder="比如：我在县城长大，爸爸常年在外打工，妈妈什么都管。高考前我爸说过一句很难听的话。"></textarea>
      <p class="muted" id="tag-line">写完后这里会出现 3 个标签（2 秒内）。</p>
      <div class="actions"><button class="primary" data-act="rewrite-apply">用这段经历重掷</button></div>
    </div>
    <div class="card">
      <h2>C · 就这样（交给命运）</h2>
      <p>什么都不改。35 岁结算卡上会出现一行：“18 岁那年，你什么都没改。”</p>
      <div class="actions"><button data-act="rewrite-keep">就这样</button></div>
    </div>`);
  let timer = null;
  $('#rewrite-text').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => showTags(e.target.value), 800);
  });
}

function extractTags(text) {
  const found = [];
  for (const { keys, tag } of TAG_KEYWORDS) {
    if (keys.some((k) => text.includes(k)) && !found.includes(tag)) found.push(tag);
  }
  return found.slice(0, 3);
}

function showTags(text) {
  const tags = extractTags(text);
  const el = $('#tag-line');
  if (!el) return;
  el.innerHTML = tags.length
    ? '标签回显：' + tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ') + '（可返回修改，改后同步更新）'
    : '没识别出标签——再多说两句，我才能长出来。（低于 20 字只提示，不拦。）';
  G.rewriteTags = tags;
}

function applyRewrite() {
  const s = G.state;
  const text = ($('#rewrite-text').value || '').trim();
  if (text.length < 5) { alert('再多说两句，我才能长出来。'); return; }
  const tags = extractTags(text);
  G.rewriteTags = tags;
  const oldOrigin = s.origin;
  // Tags constrain the pool: 缺席类 → absent families; 经济紧张 → low-money families.
  let pool = Object.entries(FAMILIES);
  if (tags.includes('父母缺席')) pool = pool.filter(([k]) => k.startsWith('absent') || k === 'orphan');
  if (tags.includes('经济紧张')) pool = pool.filter(([, f]) => f.money <= 2);
  if (tags.includes('无父母线')) pool = pool.filter(([k]) => k === 'orphan');
  if (!pool.length) pool = Object.entries(FAMILIES);
  const key = G.rng.weighted(pool.map(([k, f]) => [k, f.weight]));
  const fam = FAMILIES[key];
  const fragments = G.rng.shuffle(fam.fragments.slice()).slice(0, 3);
  if (G.rng.chance(0.3)) fragments.push(fam.counter);
  // Player's own words echo twice: once in the growth record, once in T1–T5.
  fragments.push('你写下的那句话：“' + text.slice(0, 80) + '”——它出现在这里，也会在未来某一年再出现一次。');
  const newOrigin = { familyKey: key, familyName: fam.name, card: fam.card, fragments, counter: false, attrs: null };
  const a = blankAttrs();
  a.money = fam.money; a.health = fam.health; a.stress = fam.stress;
  a.skill = 20 + G.rng.int(-5, 5); a.express = 20 + G.rng.int(-5, 5);
  a.network = key === 'orphan' ? 10 : 20 + G.rng.int(-5, 5); a.influence = 20 + G.rng.int(-5, 5);
  if (tags.includes('祖辈带大')) a.family = 1;
  if (tags.includes('家里常吵架')) a.family = -1;
  newOrigin.attrs = a;
  // v0.7: the new family brings its own home province, economy and
  // background. The 0-18 chronicle is NOT re-run (already resolved for
  // the first origin at S3; the rewrite changes the story, not the
  // history — flags.eraHistoryDone stays true).
  newOrigin.homeRegion = G.rng.pick(['shandong', 'liaoning', 'jilin', 'heilongjiang']);
  newOrigin.econ = rollFamilyEcon(G.rng);
  newOrigin.bg = rollFamilyBg(G.rng, fam.locale || 'city', newOrigin.econ.tier);
  s.flags.familyEcon = newOrigin.econ;
  s.flags.familyBg = newOrigin.bg;
  s.flags.familySafety = s.flags.era
    ? familySafetyText(newOrigin.econ, key)
    : (a.money >= 2 ? '家里能接住你一次，但只有一次。' : '家里接不住你——这条路得你自己走。');
  s.rewrite = { text, tags, origin: newOrigin };
  s.origin = newOrigin;
  Object.assign(s.attrs, a);
  // H0 re-rolled on the new face (still random — the numbers stay random).
  // v1.2 (P1-2): 强度与权限分开重掷；征兆由封存值生成。
  const h0 = rollH0(G.rng, key);
  s.flags.h0Access = rollH0Access(G.rng, key);
  sealDie(s, G.rng, 'H0', h0, 2);
  s.flags.usedRewrite = true;
  s.rngState = G.rng.getState();
  autosave('改写已封存');
  screenCompare(oldOrigin);
}

function screenCompare(oldOrigin) {
  const s = G.state, o = s.origin;
  const row = (label, a, b) => `<tr><td>${label}</td><td>${esc(a)}</td><td>${esc(b)}</td></tr>`;
  setScreen(`
    <h1>S5 · 对照</h1>
    <p class="intro">原来的你 / 现在的你。确认后不可逆，第一次的出身会一直留在这里。</p>
    <table class="compare">
      <tr><th></th><th>原来的你</th><th>现在的你</th></tr>
      ${row('家庭', oldOrigin.familyName, o.familyName)}
      ${row('判词', oldOrigin.card.verdict, o.card.verdict)}
      ${row('经济', oldOrigin.card.money, o.card.money)}
    </table>
    <p class="muted">改写标签：${(s.rewrite.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join(' ') || '无'}</p>
    <div class="actions"><button class="primary" data-act="to-transition">确认，继续</button></div>`);
}

// ---------- S6: transition ----------
function screenTransition() {
  const s = G.state;
  const steps = [
    { title: '账单', body: '出身卡：18 岁前那三件你没法选的事。' },
    { title: '入账', body: '这三件事已经写进你的压力 / 健康 / 钱 / 家庭线，改不了。“过去是你的起点，不是未来的答案。”' },
    { title: '签字', body: '从今天起，承诺由你签。直接进 T1，当场签承诺卡 A（志愿）。' },
  ];
  let i = 0;
  const show = () => {
    setScreen(`
      <h1>S6 · 转场 ${i + 1}/3</h1>
      <div class="card big"><h2>${steps[i].title}</h2><p>${steps[i].body}</p></div>
      <div class="actions"><button class="primary" data-act="transition-next">${i === 2 ? '进 T1，签承诺卡 A' : '下一页'}</button></div>`);
  };
  window.__transitionNext = () => {
    i += 1;
    if (i < 3) show(); else screenT1();
  };
  show();
}

// ---------- T1: 高考报名 ----------
// v0.5: region picker, shown once when the run has no Gaokao record.
// The score is rolled here, region-relative (line1 −20 to line1 +220),
// so the distribution stays meaningful in every region.
// v0.6: era runs (flags.era set in S0.5) pick region + track against the
// verified line table instead; legacy runs (no era, incl. old saves) keep
// the 2026 picker below.
function screenT1Region() {
  const s = G.state;
  const era = s.flags.era;
  if (!era) {
    const regions = Object.values(GAOKAO_REGIONS);
    setScreen(`
    <h1>T1 · 18 岁 · 高考志愿填报</h1>
    <p class="intro">先定一件事：你在哪里参加高考？分数和分数线都按这个省的现行政策走。</p>
    <div class="options">${regions.map((r) => `<button class="opt" data-act="t1-region-pick" data-id="${r.id}"><b>${r.name} ${r.year}</b><span>${r.model}${r.track ? ' · ' + r.track + '线' : ''} · 总分 ${r.total} · 一段线/本科线 ${r.line1} · 特殊类型线 ${r.specialLine} · ${r.batchName}最多 ${r.batchChoices} 个${r.batchUnit}</span></button>`).join('')}</div>
    <p class="muted">先做山东、辽宁、吉林、黑龙江四个省，其他省以后加。选定后不能改，分数当场掷出并封存。</p>`);
    return;
  }
  const examYear = era.examYear;
  const rows = Object.values(GAOKAO_REGIONS).map((r) => {
    const mode = getExamMode(r.id, examYear);
    const playable = tracksForMode(mode).some((t) => isLinePlayable(lookupLine(r.id, examYear, t)));
    return { r, mode, playable };
  });
  setScreen(`
    <h1>T1 · 18 岁 · 高考志愿填报</h1>
    <p class="intro">你 ${era.birthYear} 年出生，${examYear} 年高考。先定一件事：在哪里参加高考？分数和分数线都按这一年的真实线表走。</p>
    <div class="options">${rows.map(({ r, mode, playable }) => playable
      ? `<button class="opt" data-act="t1-era-region-pick" data-id="${r.id}"><b>${r.name} · ${examYear} 年高考${s.origin && s.origin.homeRegion === r.id ? '（老家）' : ''}</b><span>${EXAM_MODE_LABEL[mode]} · 分数线已核实，科类下一步选。</span></button>`
      : `<button class="opt" disabled><b>${r.name} · ${examYear} 年高考</b><span>${EXAM_MODE_LABEL[mode]} · 该年分数线未提供。</span></button>`).join('')}</div>
    <p class="muted">先做山东、辽宁、吉林、黑龙江四个省，其他省以后加。选定后不能改，分数当场掷出并封存。</p>`);
}

// v0.6: track picker for era runs. One row per track with its line status;
// only 已核实 rows are clickable. 待核实 rows show as such, never rolled on.
function screenT1Track(regionId) {
  const s = G.state, era = s.flags.era;
  const region = GAOKAO_REGIONS[regionId] || GAOKAO_REGIONS[GAOKAO_DEFAULT_REGION];
  const mode = getExamMode(region.id, era.examYear);
  const tracks = tracksForMode(mode);
  setScreen(`
    <h1>T1 · 18 岁 · 高考志愿填报</h1>
    <p class="intro">${region.name} ${era.examYear} 年高考，${EXAM_MODE_LABEL[mode]}。选科类——分数线按科类分开，选定后不能改。</p>
    <div class="options">${tracks.map((t) => {
      const row = lookupLine(region.id, era.examYear, t);
      if (!row || row.status === '未提供') return `<button class="opt" disabled><b>${t}类</b><span>分数线未提供。</span></button>`;
      if (row.status === '待核实') return `<button class="opt" disabled><b>${t}类</b><span>分数线有冲突，待核实，不能玩。</span></button>`;
      return `<button class="opt" data-act="t1-track-pick" data-id="${region.id}|${t}"><b>${t}类</b><span>本科线 ${undergradLine(row)} · 已核实。</span></button>`;
    }).join('')}</div>
    <p class="muted">分数当场按本科线掷出并封存（本科线 −20 到 +220）。</p>`);
}

function pickT1Track(regionId, track) {
  const s = G.state, era = s.flags.era;
  const row = lookupLine(regionId, era.examYear, track);
  if (!isLinePlayable(row)) { screenT1Track(regionId); return; }
  const anchor = undergradLine(row);
  s.flags.gaokao = {
    region: regionId,
    era: { birthYear: era.birthYear, examYear: era.examYear, track, mode: getExamMode(regionId, era.examYear) },
    base: anchor + G.rng.int(-20, 220),
    row: { tier1: row.tier1, tier2: row.tier2, tier3: row.tier3, vocational: row.vocational, regime: row.regime, status: row.status },
  };
  s.rngState = G.rng.getState();
  autosave('选定高考地区与科类，高考出分');
  screenT1();
}

function pickT1Region(regionId) {
  const s = G.state;
  if (s.flags.gaokao) { screenT1(); return; }
  const region = GAOKAO_REGIONS[regionId] || GAOKAO_REGIONS[GAOKAO_DEFAULT_REGION];
  // v0.5.1: no bonus/adsWatched anymore — the score is sealed here, final.
  s.flags.gaokao = { region: region.id, base: region.line1 + G.rng.int(-20, 220), line1: region.line1, specialLine: region.specialLine };
  s.rngState = G.rng.getState();
  autosave('选定高考地区，高考出分');
  screenT1();
}

function screenT1() {
  const s = G.state;
  s.turn = 1;
  // v1.4 (P0-1): A 卡已签署时只看已签卡，不重进填报屏——否则刷新/
  // 继续回 T1 还能再签一次 A，钱、家庭线、k 全重算一遍。
  if (s.commitments.A) { showT1Signed(s); return; }
  // v1.2 (P0-1): T1 的 AP 只在首次进入时赋值；诊断面板开关、刷新、
  // 重进都不重置它。
  if (!s.flags.t1Entered) { s.flags.t1Entered = true; s.ap = 3; }
  // v0.8: anonymous analytics. Config is complete here (era + region +
  // difficulty + obsessions). Once per run: the diagnosis panel re-renders
  // this screen, and a reload must not count a second session.
  if (!s.flags.analyticsSessionSent) {
    s.flags.analyticsSessionSent = true;
    Analytics.track('session_start', {
      difficulty: s.difficulty,
      birthYear: s.flags.era ? s.flags.era.birthYear : undefined,
      examYear: s.flags.era ? s.flags.era.examYear : undefined,
      region: s.flags.gaokao ? s.flags.gaokao.region : undefined,
      obsessions: (s.obsessions || []).length,
    });
  }
  Analytics.track('turn_start', { turn: 1 });
  // v0.5: no Gaokao record yet -> pick a region first; the score is
  // rolled when the region is picked (region-relative, see pickT1Region).
  if (!s.flags.gaokao) { screenT1Region(); return; }
  const h0 = s.sealed.H0;
  // P1 (d): H0 alone never decides tampering — see isH0Tampered (era.js).
  const tampered = isH0Tampered(s);
  const tamperFactors = h0TamperFactors(s);
  const g = s.flags.gaokao;
  // v0.7: this year's era events resolve when the T1 screen first
  // renders (idempotent — re-renders from the diagnosis toggle apply
  // nothing twice).
  if (s.flags.era) {
    const applied = applyEraForTurn(s, G.rng, 1);
    if (applied.length) { s.rngState = G.rng.getState(); autosave(); }
  }
  const region = GAOKAO_REGIONS[g.region] || GAOKAO_REGIONS[GAOKAO_DEFAULT_REGION];
  // v0.5.1: effective score is the sealed base only. An old save's bonus
  // (from the removed ad boost) is ignored; the player is told once.
  const eff = g.base || 0;
  // v0.6: era runs show the real historical tier lines; legacy runs keep
  // the 2026 policy lines.
  const era = g.era || null;
  const eraTiers = era ? admissionTiers(g.row || {}) : [];
  const eraHit = era ? (eraTiers.find((t) => eff >= t.line) || null) : null;
  const scoreLine = era
    ? (eraHit ? `你的分数落在「${eraHit.name}」档。` : '你的分数没够上任何一条线。')
    : (eff >= g.specialLine ? '已过特殊类型线。' : eff >= g.line1 ? '已过一段线，未过特殊类型线。' : '未过一段线。');
  const eraTierText = era
    ? (eraTiers.map((t) => `${t.name}线 ${t.line}（k = ${t.k}）`).join(' · ') || '本年无本科线。')
    : '';
  setScreen(`
    <h1>T1 · 18 岁 · 高考志愿填报</h1>
    <p class="intro">选专业时，有的父母会阻止你报想报的专业，有的不会——从这里开始，你自己做决定。</p>
    <div class="card">
      <p><b>高考总分：${eff}</b>（封存分，选地区时掷出，不可更改）· ${era ? `${region.name} ${era.examYear} 年高考 · ${EXAM_MODE_LABEL[era.mode]} · ${era.track}类` : `${region.name} ${region.year} · ${region.model}${region.track ? ' · ' + region.track + '线' : ''} · 总分 ${region.total}`}</p>
      ${era
        ? `<p>${eraTierText} ${scoreLine}</p><p class="muted">档位线是真实历史控制线（${era.examYear} 年，已核实）。专业系数 k 由档位定。</p>`
        : `<p>一段线 ${region.line1} · 特殊类型线 ${region.specialLine} · 二段线 ${region.line2} · ${region.batchName}每次最多 ${region.batchChoices} 个${region.batchUnit}。${scoreLine}</p>
      <p class="muted">${esc(region.note)}</p>`}
      ${(g.bonus || 0) > 0 ? `<p class="warn">旧存档的广告加分（+${g.bonus}）已按新规则失效，分数恢复为封存原始分 ${g.base}。</p>` : ''}
      ${G.t1Diagnosing
        ? `<div class="card">${t1DiagnosisHtml()}<p><button class="opt" data-act="t1-diag-close">收起诊断</button></p></div>`
        : `<button class="opt" data-act="t1-diagnose">志愿诊断：看看这个分数够得着哪些专业（只给信息，不改分数）</button>`}
    </div>
    <div class="card">
      <p><b>家庭兜底：</b>${esc(s.flags.familySafety || '')}</p>
      <p><b>征兆：</b>${h0 ? h0.omens.map((o) => esc(o.text)).join(' ') : ''}</p>
      ${tampered ? `<p class="warn">这颗骰在你出生那年掷出：${tamperFactors.system === 'online' ? '网上填报，账号密码在父母手里，' : '那年是现场填报，你爸去学校机房，'}第一志愿已经被改成了省内师范。截止前你还能自己改回来——坚持自己或谈判，就是改回来；听父母的，就是认了。</p>` : `<p>${h0 && h0.value >= 60 && !tamperFactors.parentsHaveAccount && s.origin.familyKey !== 'orphan' && s.origin.familyKey !== 'absentBoth' ? `${s.origin.familyKey === 'absentMother' ? '你爸' : '你妈'}天天念叨隔壁家孩子学了会计，话说得很重——但填报账号在你自己手里，改不了。` : '这一次，他们让你自己填。'}</p>`}
    </div>
    ${eraYearCardHtml(s, 1)}
    <h2>你想报的专业</h2>
    <div class="card">
      <p><input id="t1-major" type="text" placeholder="输入你想报的专业，比如：计算机、临床医学、会计……" maxlength="20" value="${esc(G.t1MajorDraft || '')}"></p>
      <p id="t1-major-line"></p>
      <p class="muted">点一个填进去，也可以自己写：</p>
      <div class="options">${T1_MAJORS.map((m) => `<button class="opt" data-act="t1-major-chip" data-id="${esc(m)}">${esc(m)}</button>`).join('')}</div>
    </div>
    <h2>你的第一志愿</h2>
    <div class="options">
      <button class="opt" data-act="t1-pick" data-id="obey"><b>听父母的</b><span>${tampered ? '第一志愿已经是省内师范。' : '按父母的意思，报省内师范。'}家庭线 +1，自主执念进度 −1。${era ? 'k 由录取档位定。' : '专业系数 k = 1.0。'}</span></button>
      <button class="opt" data-act="t1-pick" data-id="insist"><b>坚持自己</b><span>就报你上面写的专业。${era ? '录取看档位，不看专业。' : '分够参考线才能进，差分会调剂。'}家庭线 −1。${era ? 'k 由档位定；三本且家庭现金 < 8 万时需自挣学费（T2–T5 每年 −1 AP）。' : '专业系数 k = 1.3；家庭经济 ≤2 档时需自挣学费（T2–T5 每年 −1 AP）。'}</span></button>
      <button class="opt" data-act="t1-pick" data-id="negotiate"><b>谈判，折中</b><span>还是报你写的专业，${era ? 'k 由档位定，' : '但 k = 1.0，'}留一个以后再谈的口子。</span></button>
    </div>
    ${G.t1DraftChoice ? `<div class="card">
      <p><b>你选了「${esc(T1_DRAFT_LABEL[G.t1DraftChoice] || G.t1DraftChoice)}」</b>${G.t1DraftMajor ? `，专业「${esc(G.t1DraftMajor)}」` : ''}——这只是草稿，还没提交。</p>
      <p>${tampered ? '还没提交确认，志愿仍可能被改：点提交确认，才算你自己定下来。' : '点提交确认，才算你自己定下来；想改就点重新选。'}</p>
      <p><button class="opt" data-act="t1-confirm">提交确认</button> <button class="opt" data-act="t1-redraft">重新选</button></p>
    </div>` : ''}
    <p class="muted">承诺卡 A（志愿，T2–T4 兑现，T5 回顾）：专业锁定 8 年，${era ? '专业系数 k 由录取档位定。档位线是真实历史控制线。' : '决定专业成长系数 k。参考线是游戏内的简化线，不是真实投档线。'}</p>`);
  const inp = $('#t1-major');
  if (inp) inp.addEventListener('input', () => { G.t1MajorDraft = inp.value; updateT1MajorLine(); });
  updateT1MajorLine();
}

// v1.4 (P0-1): A 卡已签署的只读屏——恢复/刷新回到 T1 时只看这张卡，
// 不重进填报。落榜且还没选去向时，仍给出去向选择（复读 / 专科补录 /
// 工作 / 调剂校外），选完才进 T2；去向已选则直接进 T2。
function showT1Signed(s) {
  const a = s.commitments.A;
  const failed = s.major && s.major.tier === '落榜';
  setScreen(`
    <h1>承诺卡 A 已签署</h1>
    <div class="card"><p>${a ? esc(a.text) : ''}</p>
    <p>你的专业：<b>${esc(s.major ? s.major.name : '')}</b>（${esc(s.major ? s.major.tier : '')}）。专业系数 k = ${s.flags.majorK}，T2–T4 兑现，T5 回顾。骰子已封存，兑现时只读档、不重掷。</p>
    <p class="muted">征兆已记下，兑现那天会拿出来对照：你当时收到过什么信号、忽略了什么。</p></div>
    ${failed && !s.flags.fallbackChoice
      ? `<div class="actions"><button class="primary" data-act="t1-fallback" data-id="repeat">复读一年</button><button data-act="t1-fallback" data-id="vocational">等专科补录</button><button data-act="t1-fallback" data-id="work">先工作一年</button><button data-act="t1-fallback" data-id="offcampus">调剂校外（降一档，k −0.15）</button></div>`
      : `<div class="actions"><button class="primary" data-act="year-start">进入 T2 · 19 岁</button></div>`}`);
}

// Live feedback for the typed/picked major: its reference line vs the score.
function updateT1MajorLine() {
  const s = G && G.state;
  const el = $('#t1-major-line');
  if (!s || !el) return;
  const g = s.flags.gaokao;
  if (!g) { el.textContent = ''; return; }
  const name = ($('#t1-major') ? $('#t1-major').value : '').trim();
  if (!name) { el.textContent = '先写专业，再看参考线。'; return; }
  const eff = g.base || 0;
  // v0.6: era runs have no per-major reference line (the fixed-offset
  // formula is deleted) — the score maps to a tier, not to a major.
  if (g.era) {
    const hit = admissionTiers(g.row || {}).find((t) => eff >= t.line);
    el.textContent = `没有按专业划的参考线了（v6 已删固定加分）：你的分数 ${eff}，落在「${hit ? hit.name : '落榜'}」档。专业只决定你学什么，不决定你上哪档。`;
    return;
  }
  const line = majorAdmissionLine(name, g.line1);
  el.textContent = `${name}参考线 ${line}：你的分数 ${eff}，` + (eff >= line ? '达线。' : `差 ${line - eff} 分——点“志愿诊断”，看看够得着哪些专业。`);
}

// v0.5.1: 志愿诊断 (replaces the removed ad boost). Information only:
// the sealed score never changes. Shows where the score stands, which
// majors are reachable at this score (one tap to switch — the
// re-evaluation opportunity), and the 调剂 / 专科 paths.
function t1DiagnosisHtml() {
  const s = G && G.state;
  if (!s || !s.flags.gaokao) return '';
  const g = s.flags.gaokao;
  const eff = g.base || 0;
  // v0.6: era diagnosis is tier-based — which tier the score lands in,
  // and the 落榜 three-way. No per-major reference lines anymore.
  if (g.era) {
    const era = g.era;
    const tiers = admissionTiers(g.row || {});
    const hit = tiers.find((t) => eff >= t.line);
    const lines = [`<p><b>志愿诊断</b>（只给信息，不改分数）</p>`,
      `<p>你的封存分数 ${eff}，${(GAOKAO_REGIONS[g.region] || {}).name || g.region} ${era.examYear} 年高考 · ${EXAM_MODE_LABEL[era.mode]} · ${era.track}类。诊断不改分数，也不限次数。</p>`,
      `<p>档位线（真实历史控制线，已核实）：${tiers.map((t) => `${t.name}线 ${t.line}（k = ${t.k}）`).join(' · ') || '无'}。</p>`,
      `<p>你的分数落在「${hit ? hit.name : '落榜'}」档。${hit ? `专业系数 k = ${hit.k}。` : ''}</p>`];
    if (!hit) {
      lines.push('<p>落榜不是终点，选一条路：复读一年（明年再考）、等专科补录、或先工作一年。三条路都不改分数，签承诺卡 A 时再选。</p>');
    }
    lines.push('<p class="muted">档位线是真实历史控制线，不是游戏编的。重新评估的是志愿，不是分数。</p>');
    return lines.join('');
  }
  const line1 = g.line1 || 442;
  const inp = (typeof document !== 'undefined') ? document.querySelector('#t1-major') : null;
  const name = ((inp && inp.value) || G.t1MajorDraft || '').trim();
  const lines = [`<p><b>志愿诊断</b>（只给信息，不改分数）</p>`,
    `<p>你的封存分数 ${eff}，一段线 ${line1}，特殊类型线 ${g.specialLine}。诊断不改分数，也不限次数。</p>`];
  if (name) {
    const line = majorAdmissionLine(name, line1);
    lines.push(`<p>「${esc(name)}」参考线 ${line}：` + (eff >= line ? '达线。' : `差 ${line - eff} 分。`) + '</p>');
  } else {
    lines.push('<p>先写一个专业，再看它够不够线。</p>');
  }
  if (eff < line1) {
    lines.push(`<p>未过一段线：本科批次无缘，走专科批次（专业系数 k = 0.8）。专科里也可以再选：换一个你更想读的专科方向，分数不变。</p>`);
  } else {
    const reachable = T1_MAJORS
      .map((m) => ({ name: m, line: majorAdmissionLine(m, line1) }))
      .filter((x) => x.line <= eff)
      .sort((a, b) => b.line - a.line);
    if (reachable.length) {
      lines.push('<p>按这个分数够得着（点一个换专业，分数不变）：</p><div class="options">' +
        reachable.slice(0, 5).map((x) => `<button class="opt" data-act="t1-diag-major" data-id="${esc(x.name)}">${esc(x.name)}（参考线 ${x.line}）</button>`).join('') + '</div>');
    }
    if (name && eff < majorAdmissionLine(name, line1)) {
      lines.push(`<p>差分也不白给：签“坚持自己”会调剂到够得着的最高专业（${esc(bestReachableMajor(eff, line1))}，k = 1.0）；想换就点上面。</p>`);
    }
  }
  lines.push('<p class="muted">参考线是游戏内的简化线，不是真实投档线。重新评估的是志愿，不是分数。</p>');
  return lines.join('');
}

const T1_DRAFT_LABEL = { obey: '听父母的', insist: '坚持自己', negotiate: '谈判折中' };

// v1.1 (d): two-level T1 confirm. Clicking a stance button only DRAFTS
// the choice (G.t1DraftChoice + flags.t1ChoiceMade) — it does not confirm.
// The player submits explicitly with t1-confirm, which calls pickT1.
// Draft-only still counts as tampered (see isH0Tampered in era.js);
// only a submitted pick is protected. The major input is synced into
// G.t1MajorDraft first so the re-render keeps what the player typed.
function draftT1(choice) {
  const s = G.state;
  const wanted = ($('#t1-major') ? $('#t1-major').value : '').trim().slice(0, 20);
  if (choice !== 'obey' && !wanted) { alert('先写你想报的专业，再选这个。'); return; }
  if (wanted) G.t1MajorDraft = wanted;
  G.t1DraftChoice = choice;
  G.t1DraftMajor = choice === 'obey' ? '省内师范' : wanted;
  s.flags.t1ChoiceMade = true;
  screenT1();
}

function pickT1(choice) {
  const s = G.state, a = s.attrs;
  // v1.4 (P0-1): A 卡已签署，再点提交确认也不重算（旧按钮/重复点击）。
  if (s.commitments.A) { showT1Signed(s); return; }
  // P1 (d) v1.1: only the explicit 提交确认 (t1-confirm) confirms the
  // player's own填报 — the remedy window for an H0 tamper closes here,
  // not on the draft pick. Draft-only players are still exposed.
  s.flags.t1Confirmed = true;
  const wanted = ($('#t1-major') ? $('#t1-major').value : '').trim().slice(0, 20);
  const stanceK = { obey: 1.0, insist: 1.3, negotiate: 1.0 }[choice];
  const stance = { obey: '听父母的', insist: '坚持自己', negotiate: '谈判折中' }[choice];
  let intended, source;
  if (choice === 'obey') {
    intended = '省内师范';
    source = 'parents';
  } else {
    if (!wanted) { alert('先写你想报的专业，再选这个。'); return; }
    intended = wanted;
    source = 'self';
  }
  // Submitted: the draft is spent.
  G.t1DraftChoice = null;
  G.t1DraftMajor = null;
  // v0.6: era runs resolve by tier (resolveEraAdmission); legacy runs
  // keep the 2026 per-major resolver.
  const adm = (s.flags.gaokao && s.flags.gaokao.era) ? resolveEraAdmission(s, intended) : resolveAdmission(s, intended, stanceK);
  // P1 (e): 调剂 costs stress +8 and unlocks the 转专业 action; k is
  // already untouched by the resolver (both legacy and era).
  if (adm.adjusted) {
    a.stress += 8;
    s.flags.adjusted = true;
    s.flags.adjustedFrom = intended;
  }
  if (choice === 'obey') { a.family += 1; s.flags.obsessionProgress = (s.flags.obsessionProgress || 0) - 1; }
  if (choice === 'insist') {
    a.family -= 1;
    // v0.7: era runs — 三本 + 家庭现金 < 8 万 → 强制打工 (T2–T5 −1 AP);
    // legacy runs keep the v5 pocket-money rule.
    if (s.flags.gaokao && s.flags.gaokao.era) {
      if (adm.tier === '三本' && s.flags.familyEcon && s.flags.familyEcon.cash < 8) s.flags.selfFunded = true;
    } else if (s.origin.attrs.money <= 2) { s.flags.selfFunded = true; }
  }
  s.major = { name: adm.major, source, tier: adm.tier };
  s.flags.majorK = adm.k;
  // v0.7: degree bonus from the era tier (一本 +0.5 / 三本 −0.5 / 专科 −0.5).
  if (s.flags.gaokao && s.flags.gaokao.era) {
    s.flags.degreeBonus = { '一本': 0.5, '高资源本科': 0.5, '三本': -0.5, '专科': -0.5 }[adm.tier] || 0;
  }
  s.commitments.A = {
    text: '志愿：' + adm.major + '（' + stance + '，' + adm.tier + '）',
    signedAt: 'T1', dueTurn: 4,
    snapshot: { skill: a.skill, express: a.express, network: a.network, family: a.family, k: adm.k, major: adm.major, tier: adm.tier },
  };
  autosave('承诺 A 已签署并封存');
  Analytics.track('commitment', { card: 'A', choice });
  setScreen(`
    <h1>承诺卡 A 已签署</h1>
    <div class="card"><p>你的专业：<b>${esc(adm.major)}</b>（${stance} · ${adm.tier}）。专业系数 k = ${adm.k}，T2–T4 兑现，T5 回顾。骰子已封存，兑现时只读档、不重掷。</p>
    ${adm.note ? `<p>${esc(adm.note)}</p>` : ''}
    ${adm.adjusted ? `<p>调剂：压力 +8。你可以以后转专业（T2–T4，1 AP，50% 成功）。</p>` : ''}
    ${s.flags.selfFunded ? `<p>${(s.flags.gaokao && s.flags.gaokao.era) ? '三本且家庭现金 < 8 万：自挣学费，T2–T5 每年 −1 AP。' : '家庭经济 ≤2 档：自挣学费，T2–T5 每年 −1 AP。'}</p>` : ''}
    <p class="muted">征兆已记下，兑现那天会拿出来对照：你当时收到过什么信号、忽略了什么。</p></div>
    ${adm.tier === '落榜'
      ? `<div class="actions"><button class="primary" data-act="t1-fallback" data-id="repeat">复读一年</button><button data-act="t1-fallback" data-id="vocational">等专科补录</button><button data-act="t1-fallback" data-id="work">先工作一年</button><button data-act="t1-fallback" data-id="offcampus">调剂校外（降一档，k −0.15）</button></div>`
      : `<div class="actions"><button class="primary" data-act="year-start">进入 T2 · 19 岁</button></div>`}`);
}

// ---------- v0.7: era card + 专升本 ----------
// The year's era events, from state.eraLog (applied once, read many times).
function eraYearCardHtml(s, turn) {
  if (!s.flags.era) return '';
  const entries = eraLogForTurn(s, turn);
  if (!entries.length) return `<div class="card"><p class="muted">这一年 · 时代：没有大事进你家门。</p></div>`;
  return `<div class="card"><h2>这一年 · 时代</h2>${entries.map((e) => `<p>${esc(e.text)}</p>`).join('')}<p class="muted">历史事件只按条件进家门，没中的不会硬塞。钱的变化走的是家庭现金，压力/健康是你自己的。</p></div>`;
}
// 专升本 (design v6): 专科 players, from T5 on. 55% per attempt, once a
// year. Success lifts the 专科 offer penalty (degreeBonus -> 0) and the
// tier becomes 本科（专升本）. The T5 attempt is free (no AP phase at
// graduation); T6–T8 attempts cost 1 AP.
function shengbenEligible(s) {
  return !!(s.flags.era && s.major && s.major.tier === '专科' && !s.flags.shengbenDone);
}
function shengbenHtml(s, where) {
  if (!shengbenEligible(s)) return '';
  const tried = s.flags.shengbenYear === s.turn;
  const last = s.flags.shengbenLast;
  const result = last && last.turn === s.turn ? `<p>${esc(last.text)}</p>` : '';
  const btn = where === 't5'
    ? `<button class="opt" data-act="shengben-t5" ${tried ? 'disabled' : ''}><b>专升本</b><span>55% 成功。今年一次机会，成功后文凭按本科算，offer 档回正。${tried ? '（今年已试过）' : ''}</span></button>`
    : `<button class="opt" data-act="shengben-year" ${s.ap < 1 || tried ? 'disabled' : ''}><b>专升本</b><span>1 AP，55% 成功。今年一次机会，成功后文凭按本科算，offer 档回正。${tried ? '（今年已试过）' : ''}</span></button>`;
  return `<div class="card"><h2>专升本</h2>${result}${btn}</div>`;
}
function attemptShengben(s, rng, costAp) {
  if (!shengbenEligible(s)) return false;
  if (s.flags.shengbenYear === s.turn) return false; // once per year
  if (costAp > 0) {
    if (s.ap < costAp) return false;
    s.ap -= costAp;
  }
  s.flags.shengbenYear = s.turn;
  const ok = rng.int(1, 100) <= 55;
  if (ok) {
    s.flags.shengbenDone = true;
    s.major.tier = '本科（专升本）';
    s.flags.degreeBonus = 0;
    s.flags.shengbenLast = { turn: s.turn, ok: true, text: '专升本考上了：文凭按本科算，T5 的 offer 档回正。' };
  } else {
    s.flags.shengbenLast = { turn: s.turn, ok: false, text: '专升本没考上：今年没机会了，明年可以再试一次。' };
  }
  s.rngState = rng.getState();
  autosave(ok ? '专升本成功' : '专升本未过');
  return true;
}

// ---------- P1 (e): 转专业 ----------
// 调剂过的玩家，大学期间（T2–T4）可转回想读的专业。1 AP，50% 成功，
// 一年一次；失败压力 +10，明年可再试。成功后读回原想读的专业，
// 调剂标记清除（满意度回正）；失败只加压力，不动专业。
// v1.4.2 (Allen 2026-11-21 16:03 反馈 2)：转专业加学业优秀门槛——
// 专业 ≥ 30 才可申请。专业是游戏里唯一的学业数值（blankAttrs 基础
// 20；T2–T4 的学业投入主要是系统学习 +5×k，见 applyAction；
// 加班 / 接私活 +2、事件与项目奖励也能加少量）。30 的算法：k≥1.0
// 时 2 次系统学习到 30（20+5+5），专科 k=0.8 时 3 次，校外专科
// k=0.65 时 4 次——门槛量的是专业水平，不是单纯的学习次数，所以
// 加班与事件攒的专业也算；但不学习只靠加班/事件到 30 要 5+ AP 与
// 大量压力，实践中仍须持续的学业投入。50% 掷骰保留（门槛通过后
// 才掷），不改成功率数值——门槛本身终结了“纯 50%”的抱怨。
const TRANSFER_MAJOR_MIN_SKILL = 30;
function transferMajorEligible(s) {
  return !!(s.flags.adjusted && s.turn >= 2 && s.turn <= 4 && (s.attrs.skill || 0) >= TRANSFER_MAJOR_MIN_SKILL);
}
function transferMajorHtml(s) {
  if (!s.flags.adjusted || s.turn < 2 || s.turn > 4) return '';
  const tried = s.flags.transferYear === s.turn;
  const last = s.flags.transferLast;
  const result = last && last.turn === s.turn ? `<p>${esc(last.text)}</p>` : '';
  const skill = s.attrs.skill || 0;
  const gated = skill < TRANSFER_MAJOR_MIN_SKILL;
  return `<div class="card"><h2>转专业</h2>${result}<button class="opt" data-act="transfer-major" ${s.ap < 1 || tried || gated ? 'disabled' : ''}><b>转回${esc(s.flags.adjustedFrom || '想读的专业')}</b><span>1 AP，50% 成功。今年一次机会，成功后读回你想读的专业；失败压力 +10。${tried ? '（今年已试过）' : ''}${gated ? `（须专业 ≥ ${TRANSFER_MAJOR_MIN_SKILL} 才可申请，你现在 ${skill}：多做系统学习攒专业。）` : ''}</span></button></div>`;
}
function attemptTransferMajor(s, rng) {
  if (!transferMajorEligible(s)) return false;
  if (s.flags.transferYear === s.turn) return false; // once per year
  if (s.ap < 1) return false;
  s.ap -= 1;
  s.flags.transferYear = s.turn;
  const ok = rng.int(1, 100) <= 50;
  if (ok) {
    const back = s.flags.adjustedFrom;
    if (back && s.major) s.major.name = back;
    s.flags.adjusted = false;
    s.flags.adjustedFrom = undefined;
    s.flags.transferLast = { turn: s.turn, ok: true, text: '转专业成功：读回了' + (back || '想读的专业') + '，这口气顺了。' };
  } else {
    s.attrs.stress += 10;
    s.flags.transferLast = { turn: s.turn, ok: false, text: '转专业没批下来：名额满了，压力 +10。明年可以再试一次。' };
  }
  s.rngState = rng.getState();
  autosave(ok ? '转专业成功' : '转专业未过');
  return true;
}

// ---------- v1.4.2：考证系统（补充 B）/ 体制内入职考试（补充 A）/
// 体制内年度考核（补充 C，16:08）/ 官场诱惑与纪律风险（16:10） ----------

// ---- 考证 ----
// 天赋乘数 = 专业系数 k（开局封存，见 applyAction 的 study 行）。
function certTalentK(s) { return (s.flags && s.flags.majorK) || 1; }
function certHours(s, id) { return ((s.flags && s.flags.certHours) || {})[id] || 0; }
function certPassed(s, id) { return ((s.flags && s.flags.certs) || []).indexOf(id) >= 0; }
// 有效小时 = 投入小时 × 天赋乘数（Allen 模型，见 data.js CERTS 注释）。
function certEffectiveHours(rawHours, k) { return Math.round(rawHours * (k || 1)); }
function certStudy(s, id) {
  if (!s || s.ap < 1) return false;
  const c = CERTS.find((x) => x.id === id);
  if (!c || certPassed(s, id)) return false;
  s.ap -= 1;
  s.flags.certHours = s.flags.certHours || {};
  s.flags.certHours[id] = certHours(s, id) + certEffectiveHours(CERT_HOURS_PER_AP, certTalentK(s));
  s.yearActions = s.yearActions || [];
  s.yearActions.push('考证学习：' + c.name);
  if (s.flags.certHours[id] >= c.difficulty) {
    s.flags.certs = s.flags.certs || [];
    s.flags.certs.push(id);
    for (const [k, v] of Object.entries(c.bonus)) s.attrs[k] = (s.attrs[k] || 0) + v;
    s.flags.certLast = { turn: s.turn, id, text: '考过了' + c.name + '：' + c.bonusText + '。' };
  }
  autosave('考证学习');
  return true;
}
function certHtml(s) {
  if (s.turn < 2 || s.turn === 9) return '';
  const last = s.flags.certLast && s.flags.certLast.turn === s.turn ? `<p>${esc(s.flags.certLast.text)}</p>` : '';
  const rows = CERTS.map((c) => {
    const h = certHours(s, c.id);
    const done = certPassed(s, c.id);
    return `<button class="opt" data-act="cert-study" data-id="${c.id}" ${s.ap < 1 || done ? 'disabled' : ''}><b>${esc(c.name)}</b><span>${done ? '已考过：' + c.bonusText : '已投入 ' + h + ' / ' + c.difficulty + ' 有效小时（1 AP = ' + CERT_HOURS_PER_AP + ' 小时 × 天赋 ' + certTalentK(s) + '）。考过：' + c.bonusText}</span></button>`;
  }).join('');
  return `<div class="card"><h2>考证</h2>${last}<p class="muted">天赋乘数 ${certTalentK(s)}（= 专业系数 k，开局封存）。有效小时 = 投入小时 × 天赋；最难的证要 10000 有效小时。</p><div class="options">${rows}</div></div>`;
}

// ---- 体制内入职考试（补充 A） ----
// pickT5('stable') 不再直接进选行业屏，改走考试流程：选国考 / 省考
// → 选省份（省考）→ 选职位 → 报名 → 笔试 → 面试 → 通过入职
// （signT5，sector='public'）。不花 AP（T5 本身没有 AP 经济）；
// 成本是准备本身——笔试看专业、面试看表达，低于阈值一定落榜。
// 落榜可改报其他职位、换考试类型，或放弃考公回 T5 选别的工作。
function civilExamThresholds(d) {
  const pos = CIVIL_EXAM.positions.find((x) => x.id === d.positionId) || CIVIL_EXAM.positions[2];
  const type = CIVIL_EXAM.types.find((x) => x.id === d.type) || CIVIL_EXAM.types[1];
  const prov = d.type === 'provincial' ? (CIVIL_EXAM.provinces.find((x) => x.id === d.provinceId) || CIVIL_EXAM.provinces[1]) : null;
  return {
    written: pos.writtenMin + type.writtenMod + (prov ? prov.writtenMod : 0),
    interview: pos.interviewMin,
  };
}
function civilExamTypeName(d) {
  const t = CIVIL_EXAM.types.find((x) => x.id === d.type);
  return t ? t.name : '';
}
function civilExamProvinceName(d) {
  const p = CIVIL_EXAM.provinces.find((x) => x.id === d.provinceId);
  return p ? p.name : '';
}
function civilExamPositionName(d) {
  const pos = CIVIL_EXAM.positions.find((x) => x.id === d.positionId);
  return pos ? pos.name : '';
}
function screenCivilExamType() {
  const s = G.state;
  setScreen(`
    <h1>T5 · 22 岁 · 考公：先选考试</h1>
    <p class="intro">进体制内要先考试：笔试看专业，面试看表达。落榜可以改报、可以换考试，也可以放弃回头选别的工作。</p>
    <div class="options">${CIVIL_EXAM.types.map((t) => `<button class="opt" data-act="exam-type" data-id="${t.id}"><b>${t.name}</b><span>${t.desc}</span></button>`).join('')}</div>
    <p class="muted">你现在的专业 ${s.attrs.skill}、表达 ${s.attrs.express}。职位页会写明每个岗位的门槛。</p>
    <div class="actions"><button data-act="exam-quit">不考了，回 T5 选别的工作</button></div>`);
}
function pickCivilExamType(id) {
  const t = CIVIL_EXAM.types.find((x) => x.id === id);
  if (!t) return;
  G.examDraft = { type: t.id, provinceId: null, positionId: null };
  if (t.id === 'provincial') screenCivilExamProvince();
  else screenCivilExamPosition();
}
function screenCivilExamProvince() {
  setScreen(`
    <h1>T5 · 22 岁 · 考公：选省份</h1>
    <p class="intro">省考分省招录，各省竞争程度不同，笔试门槛也不一样：山东最卷（+5），吉林 / 黑龙江低一档（−5）。</p>
    <div class="options">${CIVIL_EXAM.provinces.map((p) => `<button class="opt" data-act="exam-province" data-id="${p.id}"><b>${p.name}</b><span>笔试门槛 ${p.writtenMod > 0 ? '+' + p.writtenMod : p.writtenMod}。</span></button>`).join('')}</div>
    <div class="actions"><button data-act="exam-back-type">返回重选考试</button></div>`);
}
function pickCivilExamProvince(id) {
  const p = CIVIL_EXAM.provinces.find((x) => x.id === id);
  if (!p || !G.examDraft) return;
  G.examDraft.provinceId = p.id;
  screenCivilExamPosition();
}
function screenCivilExamPosition() {
  const s = G.state;
  const d = G.examDraft || { type: 'provincial', provinceId: null, positionId: null };
  const rows = CIVIL_EXAM.positions.map((pos) => {
    const th = civilExamThresholds({ type: d.type, provinceId: d.provinceId, positionId: pos.id });
    const okW = (s.attrs.skill || 0) >= th.written;
    const okI = (s.attrs.express || 0) >= th.interview;
    return `<button class="opt" data-act="exam-position" data-id="${pos.id}"><b>${pos.name}</b><span>${pos.desc}笔试门槛 ${th.written}（你 ${s.attrs.skill}${okW ? '，够' : '，不够'}）· 面试门槛 ${th.interview}（你 ${s.attrs.express}${okI ? '，够' : '，不够'}）。</span></button>`;
  }).join('');
  setScreen(`
    <h1>T5 · 22 岁 · 考公：选职位</h1>
    <p class="intro">你报的是${civilExamTypeName(d)}${d.type === 'provincial' ? ' · ' + civilExamProvinceName(d) : ''}。门槛是准备线，不是运气：低于门槛一定落榜，高于门槛一定通过。</p>
    <div class="options">${rows}</div>
    <div class="actions"><button data-act="exam-back">${d.type === 'provincial' ? '返回重选省份' : '返回重选考试'}</button></div>`);
}
function pickCivilExamPosition(id) {
  const pos = CIVIL_EXAM.positions.find((x) => x.id === id);
  if (!pos || !G.examDraft) return;
  G.examDraft.positionId = pos.id;
  screenCivilExamConfirm();
}
function screenCivilExamConfirm() {
  const s = G.state;
  const d = G.examDraft;
  const th = civilExamThresholds(d);
  setScreen(`
    <h1>T5 · 22 岁 · 考公：报名</h1>
    <div class="card"><p>你报的是${civilExamTypeName(d)}${d.type === 'provincial' ? ' · ' + civilExamProvinceName(d) : ''} · ${civilExamPositionName(d)}。</p>
    <p>笔试门槛 ${th.written}，你的专业 ${s.attrs.skill}；面试门槛 ${th.interview}，你的表达 ${s.attrs.express}。${(s.attrs.skill || 0) >= th.written && (s.attrs.express || 0) >= th.interview ? '两项都够，正常发挥就能进。' : '有一项不够，硬考会落榜——可以先回去改报要求低的职位。'}</p></div>
    <div class="actions"><button class="primary" data-act="exam-confirm">报名，参加笔试</button><button data-act="exam-back-position">返回重选职位</button></div>`);
}
function screenCivilExamWritten() {
  const s = G.state;
  const d = G.examDraft;
  const th = civilExamThresholds(d);
  setScreen(`
    <h1>T5 · 22 岁 · 考公：笔试</h1>
    <div class="card"><p>${civilExamTypeName(d)}${d.type === 'provincial' ? ' · ' + civilExamProvinceName(d) : ''} · ${civilExamPositionName(d)}。笔试门槛 ${th.written}，你的专业 ${s.attrs.skill}。</p></div>
    <div class="actions"><button class="primary" data-act="exam-written">交卷，等笔试成绩</button></div>`);
}
function resolveCivilExamWritten() {
  const s = G.state;
  const d = G.examDraft;
  const th = civilExamThresholds(d);
  if ((s.attrs.skill || 0) >= th.written) screenCivilExamInterview();
  else screenCivilExamFail('written', th);
}
function screenCivilExamInterview() {
  const s = G.state;
  const d = G.examDraft;
  const th = civilExamThresholds(d);
  setScreen(`
    <h1>T5 · 22 岁 · 考公：面试</h1>
    <div class="card"><p>笔试过了。${civilExamPositionName(d)}的面试门槛 ${th.interview}，你的表达 ${s.attrs.express}。</p></div>
    <div class="actions"><button class="primary" data-act="exam-interview">参加面试</button></div>`);
}
function resolveCivilExamInterview() {
  const s = G.state;
  const d = G.examDraft;
  const th = civilExamThresholds(d);
  if ((s.attrs.express || 0) >= th.interview) screenCivilExamPassed();
  else screenCivilExamFail('interview', th);
}
function screenCivilExamPassed() {
  const d = G.examDraft;
  setScreen(`
    <h1>T5 · 22 岁 · 考公：考上了</h1>
    <div class="card"><p>笔试、面试都过了。${civilExamTypeName(d)}${d.type === 'provincial' ? ' · ' + civilExamProvinceName(d) : ''} · ${civilExamPositionName(d)}，正式入职。</p></div>
    <div class="actions"><button class="primary" data-act="exam-hire">正式入职</button></div>`);
}
function civilExamHire() {
  const j = T5_JOBS.find((x) => x.id === 'stable');
  const sec = SECTORS.find((x) => x.id === 'public');
  G.examDraft = null;
  signT5(j, sec, null);
}
function screenCivilExamFail(stage, th) {
  const s = G.state;
  const d = G.examDraft;
  const isWritten = stage === 'written';
  const have = isWritten ? (s.attrs.skill || 0) : (s.attrs.express || 0);
  const need = isWritten ? th.written : th.interview;
  setScreen(`
    <h1>T5 · 22 岁 · 考公：${isWritten ? '笔试没过线' : '面试没过'}</h1>
    <div class="card"><p>${isWritten ? '笔试' : '面试'}门槛 ${need}，你只有 ${have}。${isWritten ? '笔试看专业' : '面试看表达'}——准备不够，硬考就是落榜。</p></div>
    <div class="actions"><button class="primary" data-act="exam-fail-repick">改报其他职位</button><button data-act="exam-fail-retype">换个考试类型</button><button data-act="exam-quit">放弃考公，回 T5 选别的工作</button></div>`);
}

// ---- 体制内年度考核（补充 C，Allen 2026-11-21 16:08） ----
// 每年一次，档位优秀 / 称职 / 基本称职 / 不称职。判定只看本年的
// 投入：产出行动（系统学习 / 加班 / 接私活 / 开源 / 社区 / 内容 /
// 兼职 / 副业 / 考证学习 / 推进项目）计数；不称职的门槛定得很高——
// 全年零产出行动、且剩 ≥2 AP、且连本年事件都没选，才算不称职
// （等于这一年什么都没干）。正常玩（哪怕只做一件产出事，或把 AP
// 花完）拿不到不称职。只有两次连续不称职，才触发组织部谈话；
// 谈话只加压力 +5、清零连计数，不是处分、不是离职——谈话本身是
// 罕见的最坏结果，不是常规事件。
const PUBLIC_EVAL_PRODUCTIVE = ['系统学习', '加班 / 接私活', '开源 / 社区 / 内容', '兼职 / 副业'];
function publicEvalEffort(s) {
  return (s.yearActions || []).filter((a) => PUBLIC_EVAL_PRODUCTIVE.indexOf(a) >= 0 || (typeof a === 'string' && (a.indexOf('考证学习：') === 0 || a.indexOf('推进项目：') === 0))).length;
}
function evaluatePublicYear(s) {
  const effort = publicEvalEffort(s);
  let rating;
  if (effort >= 2) rating = '优秀';
  else if (effort === 1) rating = '称职';
  else if (s.ap >= 2 && !s.flags.eventChoice) rating = '不称职';
  else rating = '基本称职';
  s.flags.evalHistory = s.flags.evalHistory || [];
  s.flags.evalHistory.push({ turn: s.turn, rating });
  let talk = false;
  if (rating === '不称职') {
    s.flags.evalStreak = (s.flags.evalStreak || 0) + 1;
    if (s.flags.evalStreak >= 2) {
      talk = true;
      s.flags.evalTalk = s.flags.evalTalk || [];
      s.flags.evalTalk.push({ turn: s.turn });
      s.attrs.stress = (s.attrs.stress || 0) + 5;
      s.flags.evalStreak = 0;
    }
  } else {
    s.flags.evalStreak = 0;
  }
  return { rating, effort, talk };
}

// ---- 官场诱惑与纪律风险（Allen 2026-11-21 16:10） ----
// 触发阈值：影响力 ≥ 30（体制内影响力名义上限 40 的 75%；代码里
// 40 目前只是 T5 描述文案、没有强制上限——阈值按名义上限取高位）。
// 兼职讲课：接了当场钱 +3 万，此后每年结算时掷一次举报骰
// （20%）；举报后果分两档——首次诫勉谈话（影响力 −10、压力 +10、
// 兼职停），再次举报留置 / 双规审查（影响力清零、退缴 10 万、
// 压力 +20、兼职停、不再出现诱惑）。年代适配：2018 年监察法之后
// 叫留置，之前叫双规，按游戏内年份定（eraContextFor 的
// calendarYear；旧存档 / 直接切片默认 2026，即留置）。
// 下海：离开体制内（employment 变 freelance），钱 +5 万、影响力
// −10、压力 +5；此后不再是体制内的人（考核、诱惑、体制内事件全停）。
const PUBLIC_TEMPT_INFLUENCE = 30;
const MOONLIGHT_REPORT_CHANCE = 20;
function temptationHtml(s) {
  if (s.turn < 6 || !isPublicJob(s)) return '';
  if ((s.attrs.influence || 0) < PUBLIC_TEMPT_INFLUENCE) return '';
  if (s.flags.moonlight || (s.flags.discipline && s.flags.discipline.investigation)) return '';
  if (s.flags.temptationYear === s.turn) return ''; // 今年已拒绝过，不再出现
  return `<div class="card"><h2>有人找上门了</h2><p>你在单位里有了点名气。有人请你去外头兼职讲课，也有人劝你干脆下海单干。体制内有纪律，兼职讲课一旦被人举报，轻则谈话，重则审查。</p><div class="options"><button class="opt" data-act="tempt-moonlight"><b>接了，在外兼职讲课</b><span>钱 +3 万。之后每年结算时有 20% 的可能被人举报。</span></button><button class="opt" data-act="tempt-xiahai"><b>下海单干</b><span>离开体制内：钱 +5 万，影响力 −10，压力 +5。此后不再是体制内的人。</span></button><button class="opt" data-act="tempt-decline"><b>都拒绝</b><span>什么都不发生。</span></button></div></div>`;
}
function acceptMoonlight(s) {
  s.flags.moonlight = { sinceTurn: s.turn };
  s.attrs.money = (s.attrs.money || 0) + 3;
  autosave('接了兼职讲课');
}
function acceptXiahai(s) {
  s.flags.employment = 'freelance';
  if (s.flags.jobProfile) s.flags.jobProfile.employerType = 'freelance';
  s.flags.moonlight = null;
  s.attrs.money = (s.attrs.money || 0) + 5;
  s.attrs.influence = Math.max(0, (s.attrs.influence || 0) - 10);
  s.attrs.stress = (s.attrs.stress || 0) + 5;
  autosave('下海单干');
}
function declineTemptation(s) {
  s.flags.temptationYear = s.turn;
  autosave();
}
function resolveMoonlightReport(s, rng) {
  if (!s.flags.moonlight) return null;
  const roll = rng.int(1, 100);
  if (roll > MOONLIGHT_REPORT_CHANCE) return { reported: false, roll };
  const disc = s.flags.discipline || { warnings: 0 };
  s.flags.discipline = disc;
  if (disc.warnings >= 1) {
    const year = eraContextFor(s, s.turn).calendarYear;
    const term = year >= 2018 ? '留置' : '双规';
    disc.investigation = true;
    s.flags.moonlight = null;
    s.attrs.influence = 0;
    s.attrs.money = Math.max(0, (s.attrs.money || 0) - 10);
    s.attrs.stress = (s.attrs.stress || 0) + 20;
    return { reported: true, roll, level: 'investigation', term, year };
  }
  disc.warnings += 1;
  s.flags.moonlight = null;
  s.attrs.influence = Math.max(0, (s.attrs.influence || 0) - 10);
  s.attrs.stress = (s.attrs.stress || 0) + 10;
  return { reported: true, roll, level: 'warning' };
}
// 体制内年份结算（endYear 调用，T6 起）：先掷兼职举报骰，再评年度
// 考核。返回结算卡要显示的两行（无事时 reportLine 为 null）。
function resolvePublicYear(s, rng) {
  const report = resolveMoonlightReport(s, rng);
  const ev = evaluatePublicYear(s);
  const evalLine = '年度考核：' + ev.rating + '（本年产出行动 ' + ev.effort + ' 项）。' + (ev.talk ? '连续两次不称职，组织部找你谈了话：压力 +5。这只是谈话，你的位置还在。' : '');
  let reportLine = null;
  if (report && report.reported) {
    reportLine = report.level === 'investigation'
      ? '兼职讲课被人举报了：' + report.term + '审查。影响力清零，退缴 10 万，压力 +20，兼职已停。'
      : '兼职讲课被人举报了：诫勉谈话。影响力 −10，压力 +10，兼职已停。';
  }
  return { report, eval: ev, evalLine, reportLine };
}

// ---------- yearly loop T2–T8 ----------
function eventCardHtml(ev, s) {
  const done = !!s.flags.eventChoice;
  if (done) {
    return `<div class="card"><h2>${esc(ev.title)}</h2><p>${esc(ev.body)}</p><p class="muted">（事件已选，见结算卡。）</p></div>`;
  }
  if (ev.input) {
    return `<div class="card"><h2>${esc(ev.title)}</h2><p>${esc(ev.body)}</p>
      <textarea id="idea-text" rows="3" placeholder="${esc(ev.placeholder || '写下你的点子……')}"></textarea>
      <p class="muted" id="idea-hint">写完点「开始这条线」，系统会按你的想法生成专属线（启动成本、里程碑、风险）。钱不够可以先记下来。</p>
      <div class="actions"><button class="primary" data-act="idea-start">开始这条线</button><button data-act="idea-note">先记下来</button></div>
    </div>`;
  }
  return `<div class="card"><h2>${esc(ev.title)}</h2><p>${esc(ev.body)}</p>
    <div class="options">${ev.options.map((o, i) => `<button class="opt" data-act="event-pick" data-id="${i}">${esc(o.text)}</button>`).join('')}</div>
  </div>`;
}

// v0.2: event gates — an event must pass age AND state checks.
// student = still in university years (T2–T4); employment / housing read
// state.flags; hasVenture = any live line; family = has a family to care
// for (orphan origin has none — no parent-illness events conjured).
function meetsRequires(req, s) {
  if (!req) return true;
  // v1.0 D 断亲：家庭线永久归零，需要“家人”的事件不再出现。
  if (req.family && s.flags.estranged) return false;
  if (req.student && s.turn > 4) return false;
  if (req.employment && s.flags.employment !== req.employment) return false;
  if (req.housing && s.flags.housing !== req.housing) return false;
  if (req.hasVenture && !(s.ventures || []).some((v) => v.status === 'active' || v.status === 'validating' || v.status === 'running')) return false;
  if (req.public && !isPublicJob(s)) return false; // v1.4.2：体制内事件
  if (req.family && !(s.origin && s.origin.familyKey !== 'orphan')) return false;
  return true;
}

function venturePanelHtml(s) {
  const vs = (s.ventures || []).filter((v) => v.status !== 'done' && v.status !== 'closed');
  if (!vs.length) return '';
  return `<div class="card"><h2>我的项目</h2>` + vs.map((v) => {
    const arch = VENTURE_ARCHETYPES.find((a) => a.id === v.archetype);
    if (!arch) return '';
    let line;
    if (v.status === 'running') line = `已跑通，每年 ${esc(rewardText(arch.running))}`;
    else if (v.status === 'validating') line = `验证中：${esc(arch.validation)}`;
    else {
      const next = arch.milestones[v.stage];
      line = next ? `下一里程碑：${esc(next.name)}（${v.stage}/${arch.milestones.length}）` : '已完成全部里程碑';
      if (v.sealed) line += ' · 已推进，结果已封存，待结算读取';
    }
    return `<p><b>${esc(v.name)}</b> · ${line}<br><span class="muted">风险：${esc(arch.risk)}</span></p>`;
  }).join('') + `</div>`;
}

function ventureActionHtml(s) {
  const v = (s.ventures || []).find((x) => x.status === 'active' || x.status === 'validating');
  if (!v) return '';
  const used = s.flags.advancedVenture === v.id;
  return `<button class="opt" data-act="venture-advance" ${s.ap < 1 || used ? 'disabled' : ''}><b>推进项目：${esc(v.name)}</b><span>1 AP。推进那一刻就封存结果，结算时只读档。${used ? '（今年已推进）' : ''}</span></button>`;
}

// v1.2 (P0-1): 进入与恢复分离。startYear 是分发器：首次进入该年走
// enterYear（掷骰、重置 AP、抽事件——只执行一次）；重进（刷新、继续、
// 切回）走 resumeYear（只读已保存状态渲染，不掷骰、不重置 AP、不清除
// 行动、不重抽事件）。enteredTurns 记在 flags 里，随存档走；旧存档
// 没有它时，按“该年在当前年之前，或是当前年且已有事件”判定为已进入。
function startYear(turn) {
  const s = G.state;
  if (s.flags.enteredTurns && s.flags.enteredTurns[turn]) return resumeYear(turn);
  if (!s.flags.enteredTurns && (turn < s.turn || (turn === s.turn && s.currentEvent))) return resumeYear(turn);
  return enterYear(turn);
}

// 只读已保存状态渲染：不掷骰、不重置 AP、不清除已执行行动、不重抽事件。
function resumeYear(turn) {
  const s = G.state;
  s.turn = turn;
  // v1.3 (P0-1): 已结算的年份恢复时直接看结算卡，不回通用年屏
  // （否则“结束这一年”按钮又能点一次，重结算）。
  if (s.flags.yearSettledTurn === turn && s.flags.settlement) return renderSettlementCard(s);
  G.kindnessHtml = kindnessResumeHtml(s);
  if (turn === 5) return screenT5();
  if (turn === 6) return screenT6();
  if (turn === 12) return screenT12();
  if (turn === 14) return screenT14();
  if (turn === 16) return screenT16();
  if (turn === 18) return screenT18();
  return startYearRefresh();
}

function enterYear(turn) {
  const s = G.state;
  s.flags.enteredTurns = s.flags.enteredTurns || {};
  s.flags.enteredTurns[turn] = true;
  s.turn = turn;
  Analytics.track('turn_start', { turn });
  s.ap = 3 - (s.flags.nextYearApPenalty || 0);
  if (s.flags.nextYearApPenalty) s.flags.nextYearApPenalty = 0;
  if (s.flags.selfFunded && turn >= 2 && turn <= 5) s.ap -= 1; // 自挣学费（A 卡兑现窗口 T2–T4，v0.7 设计为 T2–T5 四年；T5 无行动环节，实际扣 T2–T4）
  s.ap = Math.max(1, s.ap);
  // v1.0: T18 只有 1 AP——最后一件想做的事（崩档次年 AP −1 在这里不
  // 再叠加，T18 就是 1 点）。
  if (turn === 18) s.ap = 1;
  // v1.2 (P0-4): T13 AP −1 的是还房贷，不是结婚本身——结婚不直接扣
  // 钱也不直接扣 AP，支出由 T12 的具体财务选择（婚礼/购房/迁居）定；
  // 选了购房（housing = mortgage）才在 T13 扣 1 AP。
  if (turn === 13 && s.flags.housing === 'mortgage') s.ap = Math.max(1, s.ap - 1);
  // Housing state: dorm until the internship year, then renting. Events
  // with a housing gate (ev-rent) read this, not the player's age.
  if (!s.flags.housing) s.flags.housing = 'dorm';
  if (turn === 4) s.flags.housing = 'rent';
  s.yearActions = [];
  s.flags.eventChoice = ''; // reset: last year's choice must not leak into this year's brief
  // Independent scheduler: H3 industry cycle, H7 political wind, H9 accident.
  const rng = G.rng;
  // v0.7: this year's era events (era runs only; idempotent — the
  // guard lives in applyEraEvent, so re-renders apply nothing twice).
  // P1 (a): they resolve FIRST — if a shock-tier macro event already
  // set this year's environment, H3 does not add a second independent
  // penalty (history sets the macro, H3 only fills the remaining
  // industry uncertainty).
  const eraApplied = applyEraForTurn(s, rng, turn);
  const macroShock = eraApplied.some((e) => e.tier === 'shock');
  if (!macroShock && rng.chance(0.15) && !s.flags.industryDown) {
    s.flags.industryDown = true;
    s.flags.industryDownYears = rng.int(2, 3);
    s.yearlyLog.push({ turn, type: 'h3', text: '行业进入下行：公司冻结招聘，老板开始算人头。' });
  } else if (s.flags.industryDown) {
    s.flags.industryDownYears -= 1;
    if (s.flags.industryDownYears <= 0) s.flags.industryDown = false;
  }
  if (rng.chance(0.25)) s.yearlyLog.push({ turn, type: 'h7', text: '组织架构调整邮件：你的直线汇报对象换了。' });
  if (rng.chance(0.10)) {
    const good = rng.chance(0.5);
    s.yearlyLog.push({ turn, type: 'h9', text: good ? '意外之喜：一位贵人在行业群里转发了你的文章。影响力 +4。' : '意外：通勤路上被追尾，修车花掉 1 万，压力 +5。' });
    if (good) s.attrs.influence += 4; else { s.attrs.money -= 1; s.attrs.stress += 5; }
  }
  s.rngState = rng.getState();
  // v1.2 (P0-3): T13 签署 H5（照护对象病情基础值 1–3，T16 兑现；体检可
  // −1 级）。照护对象由出身与状态定（careSubjectFor）：没有有效照护
  // 对象时不封存 H5——没有父母病倒，也没有医疗费。
  if (turn === 13 && !s.sealed.H5) {
    const care = careSubjectFor(s);
    s.flags.careSubject = care.kind;
    // v1.4 (P0-2): 照护对象随 H5 一起封存（sealedCareSubject）——
    // T16 只读封存记录，不再按当前关系重算。
    s.flags.sealedCareSubject = care.kind;
    if (care.kind !== 'none') {
      sealDie(s, rng, 'H5', rng.int(1, 3), 3);
      s.rngState = rng.getState();
    }
  }
  if (turn === 10) revealC(s);          // 承诺 C 在 T10 揭晓
  if (turn === 15) t15PartnerOmen(s);   // T15 合伙人露真面目（仅创业线）
  if (turn === 17) revealF(s);          // 承诺 F 在 T17 回顾兑现
  // 防挫败硬规则：连续 2 次承诺兑现失败 → 本年开头强制触发一次
  // “意外的善意”（H9 正向事件，100% 发生，不可跳过）。
  G.kindnessHtml = kindnessCheck(s);
  if (turn === 5) return screenT5();
  if (turn === 6) return screenT6();
  if (turn === 12) return screenT12();
  if (turn === 14) return screenT14();
  if (turn === 16) return screenT16();
  if (turn === 18) return screenT18();
  // Events are gated by age AND state (v0.2): no weddings at 19, no
  // department contests or rent hikes while still a student, no care
  // events for orphans. Fall back to ungated events if nothing matches.
  const pool = YEAR_EVENTS.filter((e) => (!e.minTurn || turn >= e.minTurn) && (!e.maxTurn || turn <= e.maxTurn) && meetsRequires(e.requires, s));
  const fallback = YEAR_EVENTS.filter((e) => !e.requires && (!e.minTurn || turn >= e.minTurn) && (!e.maxTurn || turn <= e.maxTurn));
  let ev = rng.pick(pool.length ? pool : fallback);
  // ev-mentor ships two copies (student / work); pick by life stage.
  if (ev.variants) ev = { ...ev, ...(turn <= 4 ? ev.variants.student : ev.variants.work) };
  s.currentEvent = ev;
  setScreen(`
    <h1>T${turn} · ${17 + turn} 岁</h1>
    <p class="muted">本年 AP：${s.ap}。每年只能选 3 件，这是全游戏的取舍。</p>
    ${s.flags.industryDown ? '<p class="warn">行业下行期：薪资判定 −20%，晋升成功率 −15%。</p>' : ''}
    ${eraYearCardHtml(s, turn)}
    ${yearExtraCardsHtml(s)}
    ${eventCardHtml(ev, s)}
    ${certHtml(s)}
    ${temptationHtml(s)}
    ${venturePanelHtml(s)}
    ${shengbenHtml(s, 'year')}
    ${transferMajorHtml(s)}
    <h2>今年的行动（${s.ap} AP）</h2>
    <div class="options">${ventureActionHtml(s)}${yearActionButtons(s)}</div>
    <div class="actions"><button class="primary" data-act="year-end">结束这一年 → 结算</button><button data-act="drill-lobby-year">演练一下（不花 AP）</button></div>`);
}

function applyAction(id) {
  const s = G.state;
  const ac = ACTIONS.find((x) => x.id === id);
  if (!ac || s.ap < ac.ap) return;
  // v1.2 (P0-4): 断亲后“陪家人”不消失，改成“陪伴侣 / 朋友”：
  // 家庭线不涨，改成人脉 +2、压力 −8——支持网络照样能建。
  if (s.flags.estranged && id === 'family') {
    s.ap -= ac.ap;
    s.attrs.network = (s.attrs.network || 0) + 2;
    s.attrs.stress = Math.max(0, s.attrs.stress - 8);
    s.yearActions.push('陪伴侣 / 朋友');
    autosave();
    startYearRefresh();
    return;
  }
  s.ap -= ac.ap;
  const a = s.attrs;
  // Copy fx: never mutate the shared ACTIONS table (study's k-multiplier
  // and overtime's tense bonus are per-use).
  const fx = { ...ac.fx };
  if (ac.id === 'study' && s.flags.majorK) fx.skill = Math.round(5 * s.flags.majorK);
  if (ac.id === 'overtime') {
    fx.money = s.turn <= 4 ? 1 : 3; // 学生兼职 1 万，在职接单 3 万
    if (pressureTier(a.stress).id === 'tense') a.stress += 4; // 硬撑：多耗压力，不加钱
  }
  for (const [k, v] of Object.entries(fx)) a[k] = (a[k] || 0) + v;
  a.stress += ac.stress;
  s.yearActions.push(ac.name);
  autosave();
  startYearRefresh();
}

function startYearRefresh() {
  // Re-render the current year screen with updated AP (keep the event).
  const s = G.state;
  const turn = s.turn;
  // v1.3 (P0-1): 已结算的年份刷新后只看结算卡，不回通用年屏重结算。
  if (s.flags.yearSettledTurn === turn && s.flags.settlement) return renderSettlementCard(s);
  const ev = s.currentEvent;
  setScreen(`
    <h1>T${turn} · ${17 + turn} 岁</h1>
    <p class="muted">本年 AP：${s.ap}。已选：${s.yearActions.join('、') || '无'}</p>
    ${eraYearCardHtml(s, turn)}
    ${yearExtraCardsHtml(s)}
    ${eventCardHtml(ev, s)}
    ${certHtml(s)}
    ${temptationHtml(s)}
    ${venturePanelHtml(s)}
    ${shengbenHtml(s, 'year')}
    ${transferMajorHtml(s)}
    <h2>今年的行动（${s.ap} AP）</h2>
    <div class="options">${ventureActionHtml(s)}${yearActionButtons(s)}</div>
    <div class="actions"><button class="primary" data-act="year-end">结束这一年 → 结算</button><button data-act="drill-lobby-year">演练一下（不花 AP）</button></div>`);
}

function pickEvent(i) {
  const s = G.state;
  const o = s.currentEvent.options[i];
  for (const [k, v] of Object.entries(o.fx)) s.attrs[k] = (s.attrs[k] || 0) + v;
  s.flags.eventChoice = s.currentEvent.title + ' → ' + o.text;
  if (o.omen) s.omenLog.push({ turn: s.turn, text: o.omen });
  autosave();
  startYearRefresh();
}

function endYear() {
  const s = G.state;
  // ---- v1.3 (P0-1 of the 2026-11-20 re-review): 结算幂等 ----
  // 已结算的年份再点“结束这一年”，只重渲染已存的结算卡，不重跑
  // venture 结算与 settleYear（刷新后 startYearRefresh 也拦一次，
  // 见 resumeYear / startYearRefresh 的 yearPhase 检查）。
  if (s.flags.yearSettledTurn === s.turn && s.flags.settlement) return renderSettlementCard(s);
  // Ventures resolve before the yearly settlement: running lines pay
  // passively; the line the player pushed this year rolls its milestone.
  const ventureLines = [];
  // v0.8: snapshot venture states before the yearly resolve, so the
  // analytics outcome is derived from before/after, not from text.
  const ventureBefore = new Map((s.ventures || []).map((v) => [v.id, { status: v.status, stage: v.stage }]));
  const advancedId = s.flags.advancedVenture;
  for (const v of (s.ventures || [])) {
    const arch = VENTURE_ARCHETYPES.find((a) => a.id === v.archetype);
    if (!arch) continue;
    ventureLines.push(...resolveVentureYear(s, G.rng, v, arch, s.flags.advancedVenture === v.id));
  }
  s.flags.advancedVenture = null;
  s.rngState = G.rng.getState();
  const res = settleYear(s, DIFFICULTIES[s.difficulty]);
  // v1.4.2：体制内年度考核 + 兼职举报结算（public 分支，T6 起）。
  // 在 settleYear 之后跑：考核读本年行动与剩余 AP（settleYear 不动
  // 这两项），谈话 / 举报的压力与钱直接进结算快照的 after。
  const publicYear = (s.turn >= 6 && isPublicJob(s)) ? resolvePublicYear(s, G.rng) : null;
  Analytics.track('year_end', { turn: s.turn, tier: res.tier });
  for (const v of (s.ventures || [])) {
    const before = ventureBefore.get(v.id);
    if (!before || before.status === 'closed') continue;
    let outcome;
    if (before.status === 'running') outcome = 'running';
    else if (before.status === 'validating') outcome = v.status === 'active' ? 'validated' : 'validating';
    else if (before.status === 'active') {
      if (v.status === 'running') outcome = 'launched';
      else if (v.stage > before.stage) outcome = 'milestone';
      else if (v.status === 'closed') outcome = 'closed';
      else outcome = advancedId === v.id ? 'milestone_failed' : 'idle';
    } else continue;
    Analytics.track('venture_year', { archetype: v.archetype, outcome });
  }
  const a = s.attrs;
  const brief = `${17 + s.turn} 岁这一年，你${s.yearActions.join('、') || '没做什么特别的事'}。${s.flags.eventChoice || ''}`;
  s.yearlyLog.push({ turn: s.turn, type: 'settle', text: brief });
  // ---- v1.3 (P0-1): 结算状态持久化 ----
  // 结算卡内容写进 flags.settlement（turn / before / after / tier /
  // brief / actionsText / omenText / ventureLines），并以
  // flags.yearSettledTurn 记下已结算的年份。刷新后 resumeYear /
  // startYearRefresh / endYear 再进已结算的年份，只重渲染这张卡，
  // 绝不重跑 settleYear 与 venture 结算。旧存档没有这两个字段，
  // 按未结算处理（刷新回到通用年屏，见 renderSettlementCard 的回退）。
  s.flags.yearSettledTurn = s.turn;
  s.flags.settlement = {
    turn: s.turn,
    before: res.before,
    after: { stress: a.stress, health: a.health, money: a.money, debt: a.debt },
    tier: res.tier,
    brief,
    actionsText: s.yearActions.join('、') || '无',
    omenText: s.omenLog.filter((o) => o.turn === s.turn).map((o) => o.text).join(' ') || '今年没有征兆。',
    ventureLines,
    evalLine: publicYear ? publicYear.evalLine : null,
    reportLine: publicYear && publicYear.reportLine ? publicYear.reportLine : null,
  };
  autosave('年度结算完成');
  renderSettlementCard(s);
}

// 已结算年份的结算卡：纯渲染，只读 flags.settlement，绝不重算。
// 旧存档没有 settlement 快照时回退到通用年屏（不凭空编一张卡）。
function renderSettlementCard(s) {
  const c = s.flags.settlement;
  if (!c) return startYearRefresh();
  const next = c.turn + 1;
  setScreen(`
    <h1>年度结算卡 · T${c.turn}</h1>
    <div class="settle">
      <div><b>今年做了什么</b><p>${esc(c.actionsText || '无')}</p></div>
      <div><b>属性变化</b><p>压力 ${c.before.stress} → ${c.after.stress}（${c.tier === 'calm' ? '稳' : c.tier === 'tense' ? '紧绷' : '崩'}），健康 ${c.before.health} → ${c.after.health}，钱 ${c.before.money} → ${c.after.money} 万，Debt ${c.before.debt} → ${c.after.debt}</p></div>
      <div><b>人生简报</b><p>${esc(c.brief)}</p></div>
      <div><b>被记下的征兆</b><p>${esc(c.omenText || '今年没有征兆。')}</p></div>
      ${c.ventureLines.length ? `<div><b>我的项目</b><p>${esc(c.ventureLines.join(' '))}</p></div>` : ''}
      ${c.evalLine ? `<div><b>年度考核</b><p>${esc(c.evalLine)}</p></div>` : ''}
      ${c.reportLine ? `<div><b>纪律风险</b><p>${esc(c.reportLine)}</p></div>` : ''}
    </div>
    ${next === 9 ? `<div class="actions"><button class="primary" data-act="to-slice">进入 T9 · 26 岁${isPublicJob(s) ? '危机' : '裁员'}之夜</button></div>`
      : `<div class="actions"><button class="primary" data-act="year-next" data-id="${next}">进入 T${next} · ${17 + next} 岁</button></div>`}`);
}

// ---------- v1.0: T10–T18 ----------
function yearActionButtons(s) {
  // v1.2 (P0-4): 断亲后“陪家人”不消失，改成“陪伴侣 / 朋友”
  // （人脉 +2，压力 −8），支持网络照样能建。
  return ACTIONS.map((ac) => {
    if (s.flags.estranged && ac.id === 'family') {
      return `<button class="opt" data-act="action" data-id="family" ${s.ap < ac.ap ? 'disabled' : ''}><b>陪伴侣 / 朋友</b><span>断亲之后，陪伴的对象换了：人脉 +2，压力 −8。</span></button>`;
    }
    return `<button class="opt" data-act="action" data-id="${ac.id}" ${s.ap < ac.ap ? 'disabled' : ''}><b>${ac.name}</b><span>${ac.desc}</span></button>`;
  }).join('');
}

// ---------- v1.2 (P1-5): 延期点子的提醒 ----------
// 当年已到 deferredUntil 的延期点子，在年屏上出现一张卡：点“现在开
// 这条线”会重新走 idea-confirm（时代检查现在会通过）。提醒措辞不
// 剧透未来年份或技术——只说“现在可以开了”。
function deferredIdeaHtml(s) {
  const year = eraContextFor(s, s.turn).calendarYear;
  const due = (s.ideaNotes || []).filter((n) => n.deferred && typeof n.deferredUntil === 'number' && n.deferredUntil <= year);
  if (!due.length) return '';
  const n = due[0];
  return `<div class="card"><h2>以前记下的点子：现在可以开了</h2><p>“${esc((n.originalIdea || n.text || '').slice(0, 60))}”——当时技术还不存在，你先记下来了。现在可以开了。</p><div class="options"><button class="opt" data-act="idea-deferred-open" data-id="${(s.ideaNotes || []).indexOf(n)}"><b>现在开这条线</b><span>重新确认一次，再创建项目。</span></button></div></div>`;
}

function yearExtraCardsHtml(s) {
  return cRevealCardHtml(s) + h5SignHtml(s) + h5CheckupHtml(s) + t15OmenHtml(s) + fRevealCardHtml(s) + dStatusHtml(s) + deferredIdeaHtml(s) + (G.kindnessHtml || '');
}

function omenReplayHtml(s, turns) {
  const list = (s.omenLog || []).filter((o) => turns.includes(o.turn));
  if (!list.length) return '那几年没有留下征兆。';
  // v1.2 (P0-5): 兑现时每条征兆可判真假——准确的标“说对了”，误导
  // 的标“说错了”。旧存档的征兆没有 accurate 标记，不判。
  return esc(list.map((o) => o.text + (typeof o.accurate === 'boolean' ? (o.accurate ? '（这条说对了）' : '（这条说错了）') : '')).reverse().join(' '));
}

// 教训卡：每次兑现卡的第 ④⑤ 格生成一张，存进图鉴（state.lessons +
// meta.lessons，只继承信息，不继承数值）。兑现卡能挂进图鉴脚手架就
// 挂——这里就是那个脚手架（loadMeta 的 lessons）。
function addLesson(s, id, text) {
  s.lessons = s.lessons || [];
  if (!s.lessons.some((l) => l.id === id)) s.lessons.push({ id, text });
  if (G.meta) {
    G.meta.lessons = G.meta.lessons || [];
    if (!G.meta.lessons.some((l) => l.id === id)) {
      G.meta.lessons.push({ id, text });
      saveMeta(G.meta);
    }
  }
}

// ---------- v1.0: 承诺 C 在 T10 揭晓 ----------
function revealC(s) {
  if (s.flags.cRevealed) return;
  s.flags.cRevealed = true;
  const h2 = s.flags.h2;
  if (h2 && h2.laidOff) s.flags.consecFails = (s.flags.consecFails || 0) + 1;
  else s.flags.consecFails = 0;
  addLesson(s, 'C', isPublicJob(s) ? '考核与轮岗：这一夜的三个决定只定应对，不定结果。' : 'H2 裁员名单：进切片那一刻就封存了，三个决定只定应对、不定结果。');
  autosave('承诺 C 已兑现');
}

function cRevealCardHtml(s) {
  if (s.turn !== 10 || !s.flags.cRevealed) return '';
  return redemptionCardHtml(s, 'C');
}

// ---------- v1.2 (P0-3): H5 体检（T13，1 AP），照护对象是谁就带谁 ----------
function h5SignHtml(s) {
  if (s.turn !== 13 || !s.sealed.H5) return '';
  // v1.4 (P0-2): 体检卡也读封存对象。
  const care = sealedCareSubject(s);
  const who = care.kind === 'self' ? '自己' : care.label;
  return `<div class="card"><h2>${esc(care.label)}的身体 · 已封存</h2><p>征兆：${esc(s.sealed.H5.omens.map((o) => o.text).join(' '))}</p><p class="muted">这颗骰在你 30 岁那年掷出，T16 兑现。带${esc(who)}体检（1 AP）可让等级 −1。</p></div>`;
}

function h5CheckupHtml(s) {
  if (s.turn !== 13 || !s.sealed.H5 || s.flags.h5Checkup) return '';
  const care = sealedCareSubject(s);
  const verb = care.kind === 'self' ? '自己去体检' : `带${care.label}去体检`;
  return `<div class="card"><h2>${verb}</h2><button class="opt" data-act="h5-checkup" ${s.ap < 1 ? 'disabled' : ''}><b>${verb}</b><span>1 AP。T13 才能做：${esc(care.label)}病情等级 −1（T16 兑现时算）。${s.ap < 1 ? '（AP 不够）' : ''}</span></button></div>`;
}

// ---------- v1.0: T15 合伙人露真面目（仅创业线）----------
function t15PartnerOmen(s) {
  if (s.flags.t15OmenDone) return;
  s.flags.t15OmenDone = true;
  const c = s.commitments.E;
  if (!c || !c.snapshot || c.snapshot.line !== 'startup') return;
  const h6 = (s.sealed.H6 && s.sealed.H6.value);
  if (typeof h6 !== 'number') return;
  const text = h6 < 35
    ? '他谈分成时看了三次手机，说“信号不好，晚点回你”。'
    : h6 <= 60
      ? '他说家里有点事，这个月的钱晚几天再打。'
      : '他先垫了这个月的房租，说“账以后再算”。';
  s.flags.t15OmenText = text;
  s.omenLog.push({ turn: 15, text });
  autosave('合伙人露真面目');
}

function t15OmenHtml(s) {
  if (s.turn !== 15 || !s.flags.t15OmenText) return '';
  return `<div class="card"><h2>合伙人开始露真面目</h2><p>${esc(s.flags.t15OmenText)}</p><p class="muted">征兆已记下，T16 兑现那天会拿出来对照。</p></div>`;
}

// ---------- v1.0: 承诺 F 在 T17 回顾兑现 ----------
function revealF(s) {
  if (s.flags.fRevealed) return;
  s.flags.fRevealed = true;
  addLesson(s, 'F', 'F 照护：没有正确选项的一格。选哪个，都是真的放弃。');
  autosave('承诺 F 已兑现');
}

function fRevealCardHtml(s) {
  if (s.turn !== 17 || !s.flags.fRevealed || !s.commitments.F) return '';
  return redemptionCardHtml(s, 'F');
}

// ---------- v1.2 (P0-4): D 在 T13 的持续兑现（一行状态）----------
function dStatusHtml(s) {
  if (s.turn !== 13 || !s.commitments.D) return '';
  if (s.flags.relationship === 'partner') return `<div class="card"><p><b>伴侣线：</b>你们一起扛到了 30 岁。T14 押注时他/她是否共担，看 T12 签署时封存的 H4（大于 60 才共担）。</p></div>`;
  if (s.flags.estranged) return `<div class="card"><p><b>断亲后：</b>家庭线一直是 0，压力每年少恢复 3 点。但“陪伴”还在：陪伴侣 / 朋友（人脉 +2，压力 −8），支持网络照样能建。</p></div>`;
  return `<div class="card"><p><b>单身：</b>没有伴侣。T14 押注、T16 照护，都只能靠你自己和朋友。</p></div>`;
}

// ---------- v1.2 (P1-7): 防挫败善意 · offer 模型 ----------
// 保证“总能获得一个支持机会”，不是“指定 NPC 必然变好”。连续 2 次
// 承诺兑现失败 → 本年开头出现一次善意帮助的 OFFER（不是自动生效）：
// 玩家可接受 / 暂留 / 拒绝。接受 → 压力 −8，人脉 +2，失败计数清零；
// 暂留 → 卡留着，今年之内随时可接受；拒绝 → 今年不再出现，明年
// 失败计数还在，会再出现。来源由 kindnessSource 定（信任最高的 NPC
// → 伴侣 → 按立场 → 老陈 → 陌生人 / 社区支持），NPC 行为符合历史。
function kindnessSourceLabel(s) {
  return kindnessSource(s, G.meta).label;
}

function kindnessOfferHtml(s) {
  const src = kindnessSource(s, G.meta);
  const who = src.label;
  const what = src.kind === 'stranger'
    ? `${who}看你最近总是一个人，顺手帮了你一把：帮你对接了社区的免费法律咨询和临时岗位信息。`
    : `${who}主动帮了你一次，没提条件。`;
  return `<div class="card"><h2>意外的善意</h2><p>${esc(what)}</p><p>连续两次兑现失败之后，总得有人推你一把——这是规则，不是运气。接受的话：压力 −8，人脉 +2。</p>
  <div class="options">
    <button class="opt" data-act="kindness-accept"><b>接受这份帮助</b><span>压力 −8，人脉 +2。</span></button>
    <button class="opt" data-act="kindness-defer"><b>先留着</b><span>今年之内随时可以回来接受。</span></button>
    <button class="opt" data-act="kindness-decline"><b>不用了</b><span>今年不再出现；明年如果还连着失败，会再来一次。</span></button>
  </div></div>`;
}

function kindnessReceiptHtml(s) {
  const src = kindnessSource(s, G.meta);
  return `<div class="card"><h2>意外的善意 · 已接受</h2><p>${esc(src.label)}帮了你一次。压力 −8，人脉 +2。</p></div>`;
}

// 重进同一年的善意卡：有未决 offer → offer 卡；已接受 → 回执卡；
// 已拒绝 → 不显示（今年不再出现）。
function kindnessResumeHtml(s) {
  if (s.flags.kindnessOffer && s.flags.kindnessOffer.turn === s.turn) return kindnessOfferHtml(s);
  if (s.flags.kindnessTurn === s.turn) return kindnessReceiptHtml(s);
  return '';
}

function kindnessCheck(s) {
  // 本年已接受过（重进/刷新）：只显示回执卡，不再重复给收益。
  if (s.flags.kindnessTurn === s.turn) return kindnessReceiptHtml(s);
  // 本年已有未决 offer（重进/刷新）：只显示 offer 卡，不重复生成。
  if (s.flags.kindnessOffer && s.flags.kindnessOffer.turn === s.turn) return kindnessOfferHtml(s);
  // 本年已拒绝：今年不再出现。
  if (s.flags.kindnessDeclinedTurn === s.turn) return '';
  if ((s.flags.consecFails || 0) < 2) return '';
  const src = kindnessSource(s, G.meta);
  s.flags.kindnessOffer = { turn: s.turn, source: src.kind === 'npc' ? src.npcId : src.kind, label: src.label };
  autosave('意外的善意：有人想帮你');
  return kindnessOfferHtml(s);
}

function kindnessAccept(s) {
  if (!s.flags.kindnessOffer || s.flags.kindnessOffer.turn !== s.turn) return '';
  s.flags.kindnessOffer = null;
  s.flags.kindnessTurn = s.turn;
  s.flags.consecFails = 0;
  s.attrs.stress = Math.max(0, s.attrs.stress - 8);
  s.attrs.network = (s.attrs.network || 0) + 2;
  s.yearlyLog.push({ turn: s.turn, type: 'kindness', text: '意外的善意：接受了帮助。压力 −8，人脉 +2。' });
  autosave('接受了善意帮助');
  return kindnessReceiptHtml(s);
}

function kindnessDefer(s) {
  // 暂留：offer 留在今年之内，卡还在，随时可接受；不给收益。
  if (!s.flags.kindnessOffer || s.flags.kindnessOffer.turn !== s.turn) return '';
  return kindnessOfferHtml(s);
}

function kindnessDecline(s) {
  if (!s.flags.kindnessOffer || s.flags.kindnessOffer.turn !== s.turn) return '';
  s.flags.kindnessOffer = null;
  s.flags.kindnessDeclinedTurn = s.turn;
  autosave('婉拒了善意帮助');
  return '';
}

// ---------- v1.2 (P1-1): 免费对话演练 ----------
// 不改正式世界线，不涉付费改命。NPC 关系记忆存在 meta.npcMemory（跨
// 周目）：{ npcId: { met, trust, history: [{ turn, playerText, npcReply,
// topic }] } }。地域标签（backgroundTags）只影响成长叙事，npcReply
// 从不读它——行为只由 values（competence/hierarchy/reciprocity/
// autonomy）+ 关系记忆决定。
function npcMemoryFor(npcId) {
  G.meta.npcMemory = G.meta.npcMemory || {};
  const m = G.meta.npcMemory[npcId] || (G.meta.npcMemory[npcId] = { met: false, trust: 50, history: [] });
  return m;
}

function recordDrill(npcId, topic, playerText, replyText, trustDelta) {
  const m = npcMemoryFor(npcId);
  m.met = true;
  m.trust = Math.max(0, Math.min(100, (m.trust || 50) + (trustDelta || 0)));
  m.history.push({ turn: G.state ? G.state.turn : 0, playerText: String(playerText).slice(0, 200), npcReply: String(replyText).slice(0, 200), topic });
  if (m.history.length > 20) m.history = m.history.slice(-20);
  saveMeta(G.meta);
}

function screenDrillLobby() {
  const cards = DRILL_TOPICS.map((t) => {
    const npc = NPCS.find((n) => n.id === t.npc) || {};
    const mem = (G.meta.npcMemory || {})[t.npc];
    const trust = mem ? mem.trust : 50;
    return `<button class="opt" data-act="drill-start" data-id="${t.id}"><b>${t.label}</b><span>和${esc(npc.name || t.npc)}聊 · ${esc(npc.traits || '')}${mem && mem.met ? ` · 信任 ${trust}` : ''}</span></button>`;
  }).join('');
  setScreen(`
    <h1>免费演练（不改世界线）</h1>
    <p class="intro">想练的场景，先在这里演练一遍：自由输入，NPC 会记住你说过的话，下次再聊会接上。练完不影响正式世界线，不花 AP，不涉付费改命。</p>
    <div class="options">${cards}</div>
    <p class="muted">英文面试：文本英文面试（英文提问 + 英文作答 + 反馈）。心灵驿站：只陪伴疏导，不诊断不开处方；持续困扰请找专业帮助。语音面试：试运行——浏览器语音识别，不可用时自动转文字输入。</p>
    <div class="actions"><button data-act="drill-back">返回</button></div>`);
}

function screenDrill(topicId) {
  const t = DRILL_TOPICS.find((x) => x.id === topicId) || DRILL_TOPICS[0];
  const npc = NPCS.find((n) => n.id === t.npc) || NPCS[0];
  const mem = npcMemoryFor(t.npc);
  G.drill = { topic: t.id, npcId: t.npc };
  // v1.4：三问已完成时从演练入口重新进，状态清零、从 Q1 重练（不
  // 直接停在总结页上，也不在总结页里再循环回 Q1）。
  if (t.id === 'en-interview') {
    if (G.drillEnDone) { G.drillEnQ = 0; G.drillEnResults = []; G.drillEnFeedback = null; G.drillEnDone = false; }
    return screenEnInterview();
  }
  if (t.id === 'voice') {
    if (G.drillVoiceDone) { G.drillVoiceQ = 0; G.drillVoiceResults = []; G.drillVoiceFeedback = null; G.drillVoiceDone = false; }
    return screenVoiceInterview();
  }
  const history = (mem.history || []).filter((h) => h.topic === t.id).slice(-3);
  const histHtml = history.map((h) => `<p>你：${esc(h.playerText)}</p><p>${esc(npc.name)}：${esc(h.npcReply)}</p>`).join('');
  setScreen(`
    <h1>演练 · ${t.label}</h1>
    <div class="card"><p><b>${esc(npc.name)}</b>（${esc(npc.role)}）· ${esc(npc.traits || '')}</p>
    <p class="muted">信任 ${mem.trust}（0–100）。信任高了，他/她会更热情、主动帮你；信任低了，会更戒备。</p></div>
    ${t.id === 'sanctuary' ? '<p class="muted">心灵驿站只陪伴疏导，不诊断、不开处方。如果这种感受持续超过两周，或影响到吃饭睡觉，建议找专业心理咨询师聊聊。</p>' : ''}
    ${histHtml ? `<div class="card"><h2>上次聊到</h2>${histHtml}</div>` : ''}
    <div class="card"><p><input id="drill-input" type="text" placeholder="输入你想说的话……" maxlength="200"></p>
    <p><button class="opt" data-act="drill-send">发送</button></p></div>
    <div class="actions"><button data-act="drill-back">返回</button></div>`);
}

// ---------- v1.2 (P0-8/P1-1): 英文外企面试（文本，可玩）----------
function screenEnInterview() {
  const npc = NPCS.find((n) => n.id === 'interviewer');
  const q = G.drillEnQ || 0;
  const fb = G.drillEnFeedback || null;
  setScreen(`
    <h1>演练 · 英文面试</h1>
    <div class="card"><p><b>${esc(npc.name)}</b>（${esc(npc.role)}）· 文本英文面试：英文提问 + 英文作答 + 反馈。</p>
    <p class="muted">第 ${q + 1} / 3 问。回答用英文写，写完点发送，面试官会给你反馈。</p></div>
    <div class="card big"><h2>Q${q + 1}</h2><p>${esc(EN_INTERVIEW_QUESTIONS[q])}</p></div>
    ${fb ? `<div class="card"><h2>反馈（上一问 · 得分 ${fb.score} / 3）</h2><p>${fb.lines.map((l) => esc(l)).join('<br>')}</p></div>` : ''}
    <div class="card"><p><input id="drill-input" type="text" placeholder="Answer in English……" maxlength="400"></p>
    <p><button class="opt" data-act="drill-en-send">发送回答</button></p></div>
    <div class="actions"><button data-act="drill-back">返回</button></div>`);
}

// ---------- v1.2 (P0-8/P1-1): 语音面试（试运行）----------
// 先试浏览器 Web Speech API（带麦克风权限处理）；不可用或被拒 →
// 转文字输入，不硬上坏实现。判断标准：玩家能实际完成一次语音问答
// 并得到反馈，否则算未实现——当前标注“试运行”，不是“已支持”。
function screenVoiceInterview() {
  const npc = NPCS.find((n) => n.id === 'interviewer');
  const avail = typeof window !== 'undefined' && !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const q = G.drillVoiceQ || 0;
  const fb = G.drillVoiceFeedback || null;
  setScreen(`
    <h1>演练 · 语音面试（试运行）</h1>
    <div class="card"><p><b>${esc(npc.name)}</b>（${esc(npc.role)}）· 浏览器语音识别。能用就语音答，不能用就转文字——试运行，不保证每台设备都能用。</p>
    <p class="muted">第 ${q + 1} / 3 问。点“开始语音回答”后对着麦克风说英文，识别结果会填进回答框，你确认后再发送。</p></div>
    <div class="card big"><h2>Q${q + 1}</h2><p>${esc(EN_INTERVIEW_QUESTIONS[q])}</p></div>
    ${fb ? `<div class="card"><h2>反馈（上一问 · 得分 ${fb.score} / 3）</h2><p>${fb.lines.map((l) => esc(l)).join('<br>')}</p></div>` : ''}
    <div class="card"><p><input id="drill-input" type="text" placeholder="语音识别结果会填在这里，也可以直接打字……" maxlength="400"></p>
    <p><button class="opt" data-act="drill-voice-start" ${avail ? '' : 'disabled'}>开始语音回答</button> <button class="opt" data-act="drill-voice-send">发送回答</button></p>
    <p id="drill-voice-status" class="muted">${avail ? '' : '这台设备 / 浏览器不支持语音识别，已自动转文字输入：直接在上面打字回答，一样有反馈。'}</p></div>
    <div class="actions"><button data-act="drill-back">返回</button></div>`);
}

// ---------- v1.4: 面试三问完成 · 总结页 ----------
// Q3 发送后不再循环回 Q1：总分（/9）+ 每问的分项建议 + 再次练习
// 入口。英文面试与语音面试共用同一套结构，只换标题与重试动作。
function drillSummaryVerdict(total) {
  if (total >= 8) return '三问都很扎实：答案完整、有具体成果、结构清楚。';
  if (total >= 5) return '整体过关：再练一练“具体成果 + 结构”这两点，分数还能往上走。';
  return '先练两点：每问都加一个具体成果（数字或结果），再按 first → then → result 的结构讲。';
}
function screenEnSummary() {
  const npc = NPCS.find((n) => n.id === 'interviewer');
  const results = G.drillEnResults || [];
  const total = results.reduce((t, r) => t + r.score, 0);
  setScreen(`
    <h1>演练 · 英文面试 · 三问完成</h1>
    <div class="card"><p><b>${esc(npc.name)}</b>（${esc(npc.role)}）</p><p>总分 <b>${total} / 9</b>。${esc(drillSummaryVerdict(total))}</p></div>
    ${results.map((r) => `<div class="card"><h2>Q${r.q + 1} · ${r.score} / 3</h2><p>${esc(EN_INTERVIEW_QUESTIONS[r.q])}</p><p>${r.lines.map((l) => esc(l)).join('<br>')}</p></div>`).join('')}
    <div class="actions"><button class="primary" data-act="drill-en-retry">再练一次</button><button data-act="drill-back-lobby">返回演练</button></div>`);
}
function screenVoiceSummary() {
  const npc = NPCS.find((n) => n.id === 'interviewer');
  const results = G.drillVoiceResults || [];
  const total = results.reduce((t, r) => t + r.score, 0);
  setScreen(`
    <h1>演练 · 语音面试 · 三问完成</h1>
    <div class="card"><p><b>${esc(npc.name)}</b>（${esc(npc.role)}）</p><p>总分 <b>${total} / 9</b>。${esc(drillSummaryVerdict(total))}</p></div>
    ${results.map((r) => `<div class="card"><h2>Q${r.q + 1} · ${r.score} / 3</h2><p>${esc(EN_INTERVIEW_QUESTIONS[r.q])}</p><p>${r.lines.map((l) => esc(l)).join('<br>')}</p></div>`).join('')}
    <div class="actions"><button class="primary" data-act="drill-voice-retry">再练一次</button><button data-act="drill-back-lobby">返回演练</button></div>`);
}

// ---------- v1.0: 承诺兑现卡（五格）----------
// ① 你当时押的 ② 当时封的骰 ③ 现在揭晓 ④ 反事实归因 ⑤ 征兆回放。
// 来源标签统一：“这颗骰在你 X 岁那年掷出”，仅 H0 显示“出生那年”
// （H2 26 岁、H4 29 岁、H5 30 岁、E/H6 31 岁）。
function redemptionCardHtml(s, id) {
  const grid = (a, b, c, d, e) => `<div class="card"><h2>承诺兑现卡 · ${id}</h2><div class="settle">
    <div><b>① 你当时押的</b><p>${a}</p></div>
    <div><b>② 当时封的骰</b><p>${b}</p></div>
    <div><b>③ 现在揭晓</b><p>${c}</p></div>
    <div><b>④ 反事实归因</b><p>${d}</p></div>
    <div><b>⑤ 征兆回放</b><p>${e}</p></div>
  </div></div>`;
  const noFormula = '这张卡没有可以重算的成功率公式，所以没有最小翻盘点。';
  if (id === 'C') {
    const h2 = s.flags.h2 || {};
    const decs = sliceDecisions(s).map((dd) => {
      const got = s.decisions[dd.id];
      return got ? got.text : '未决定';
    }).join('；');
    const branch = s.flags.t9Branch ? (T9_BRANCH_LABEL[s.flags.t9Branch] || s.flags.t9Branch) : '未知';
    const isEmployed = sliceBranch(s) === 'employed';
    // v1.4.2：体制内分支的 C 卡不写裁员 / 解雇 / 补偿 / 劳动合同法——
    // 三格（有无那颗骰、判定、名单）都换成考核与轮岗的说法；其他
    // 非雇员分支（创业 / 读研 / 自由职业）沿用 v1.2 旧文案，不在本轮改。
    const isPublic = sliceBranch(s) === 'public';
    const sev = h2.laidOff ? severancePay(s) : null;
    return grid(
      esc((isEmployed ? '裁员应对：' : '危机应对：') + decs),
      (typeof h2.chance === 'number'
        ? `裁员概率 ${h2.chance}%，掷出 ${h2.roll}。这颗骰在你 26 岁那年掷出。`
        : isPublic ? `这一夜没有那颗骰子：体制内走考核与轮岗，H2 不适用，走的是「${esc(branch)}」这条线。`
        : `这一夜没有裁员骰：你没有雇主，H2 不适用，走的是「${esc(branch)}」这条线。`),
      (typeof h2.laidOff === 'boolean'
        ? (h2.laidOff ? `被裁了。N = ${sev.amount} 万到账（${sev.basis}），走的是「${esc(branch)}」这条线。` : `岗位保住了，走的是「${esc(branch)}」这条线。`)
        : isPublic ? '这一夜没有判定：考核与轮岗才是主题。'
        : '裁员判定未知。'),
      isEmployed ? '裁员名单没有最小翻盘点：进名单的四个原因，都是过去三年写好的。' : isPublic ? '这一夜没有名单：三个决定只定应对，不定结果。' : '这一夜没有裁员名单：三个决定只定应对，不定结果。',
      omenReplayHtml(s, [9]));
  }
  if (id === 'E') {
    const c = s.commitments.E;
    if (!c) return '';
    const snap = c.snapshot || {};
    const res = s.flags.eResult || {};
    const tierName = { calm: '稳', tense: '紧绷', break: '崩' }[snap.tier] || '稳';
    const first = esc(c.text) + `<br>当年：专业 ${snap.skill}、人脉 ${snap.network}、现金 ${snap.money} 万、压力${tierName}。`;
    if (snap.line === 'work') {
      return grid(first, '没有封存的骰子：你没押。',
        esc(res.note || '两年平稳打工。'), '没押注，就没有翻盘点。', omenReplayHtml(s, [14, 15, 16]));
    }
    const second = `签署时只给你看的三档把握是「${tierLabel(snap.chance)}」。这颗骰在你 31 岁那年掷出。`;
    let third = `精确成功率 ${snap.chance}%，掷出 ${snap.roll}：${res.success ? '成了。' : '没成。'}`;
    if (res.success) third += ` 押的 ${snap.staked} 万翻倍回来（本金 + 等额收益），影响力 +20。`;
    else {
      third += ` 押的 ${snap.staked} 万没了（押注之后另赚的钱还在），压力进崩档，健康 −20。`;
      if (typeof snap.h6 === 'number' && snap.h6 < 35) third += ' 合伙人卷款跑路（H6 < 35），剩下的钱再 −30%。';
      if (res.divorced) third += ' 伴侣也走了（H4 < 30，押注失败触发离婚/分手）。';
    }
    let fourth;
    if (res.success) fourth = '成功了。没有需要翻盘的点。';
    else {
      // v1.2 (P0-6): 兑现卡第 ④ 格分两段——“签字前……”只用签署前
      // 可改变的条件（反事实）；“签字后你还能减轻什么损失”只列
      // T15 及之后能做的事（减损失 / 恢复速度 / 替代机会），绝不说
      // 它们能改已封存的成功率。
      const flips = counterfactualFlips(s);
      const before = flips.length ? flips.map((f) => esc(f.text)).join('<br>') : '这一年没有单点能救你，是三个因子各差一点。';
      const after = postFailureMitigation(s).map((t) => esc(t)).join('<br>');
      fourth = `<b>签字前：</b><br>${before}<br><b>签字后你还能减轻什么损失：</b><br>${after}`;
    }
    return grid(first, second, third, fourth, omenReplayHtml(s, [14, 15, 16]));
  }
  if (id === 'F') {
    const c = s.commitments.F;
    if (!c) return '';
    const h5 = s.flags.h5Result || {};
    const fr = s.flags.fResult || {};
    // v1.2 (P0-3): 照护对象是谁，卡上就写谁——父母 / 奶奶 / 伴侣 /
    // 你自己的身体，不再默认“父母病情”。v1.4：读封存对象。
    const care = sealedCareSubject(s);
    const subjectLabel = care.label;
    const metNames = { money: '钱 ≥30 万', partner: '有伴侣支持', health: '健康 ≥60' };
    const metText = (fr.met || []).map((m) => metNames[m]).join('、') || '三项都没够上';
    return grid(
      esc(c.text) + (h5.level ? `<br>${esc(subjectLabel)}病情 ${h5.level} 级${h5.checkup ? '（体检 −1 级）' : ''}。` : ''),
      '这一格没有封存的骰子——没有正确选项，只有取舍。' + (h5.level ? `${esc(subjectLabel)}病情那颗骰在你 30 岁那年掷出（T13 签署）。` : ''),
      `抗压判定：${esc(metText)}，三选二${fr.pass ? '成立' : '不成立'}，压力 +${fr.pass ? 25 : 45}${fr.pass ? '' : '、健康 −15'}。`,
      '这一格没有成功率公式，所以没有最小翻盘点：三个选项都疼，选哪个都是真的放弃。',
      omenReplayHtml(s, [13, 14, 15, 16]));
  }
  return '';
}

// ---------- v1.2 (P0-4): T12 关系锁定 · 两个独立维度 ----------
// intimateRelationship（伴侣关系）与 familyBoundary（原生家庭边界）
// 各自定，互相独立：可以结婚且断亲，也可以单身且跟家里亲近。
// 结婚本身不扣钱——花钱由下面的具体财务选择定（婚礼 / 购房 / 迁居 /
// 不花）；断亲不删除陪伴行动（改成陪伴侣 / 朋友），不默认永久失去
// 建立支持网络的能力。草稿存在 G.t12Intimate / G.t12Boundary /
// G.t12Cost / G.t12Scope，点“签字确认”才落进承诺 D。
// ---- v1.4 (断亲目标拆分，第二次复审第四节）：断亲不再默认切断
// 整个原生家庭线，拆成三个目标：parents（只断父母关系）、caregiver
// （只断实际养育者）、all（与整个原生家庭断联）。父母与养育者是
// 两条线的出身只有双缺席（奶奶抚养）；其他出身里父母就是养育者，
// 断亲即全断（目标自动为 all）。家庭线归零 / 自主 +2 / 压力恢复
// −3/年是断亲本身的代价，三个目标都一样；目标只决定照护对象与
// 相关事件的去留（careSubjectFor / estrangementScope，见 engine.js）。
// 旧存档没有 estrangedScope 时按 'all' 处理（v1.3 行为不变）。
const T12_SCOPE_LABELS = { parents: '只与父母断联', caregiver: '只与奶奶断联', all: '与整个原生家庭断联' };
function screenT12() {
  const s = G.state;
  if (s.commitments.D) { showT12Signed(s); return; }
  const intimate = G.t12Intimate || null;
  const boundary = G.t12Boundary || null;
  const cost = G.t12Cost || 'none';
  const scope = G.t12Scope || null;
  const isAbsentBoth = s.origin && s.origin.familyKey === 'absentBoth';
  const intLabel = intimate === 'partner' ? '和伴侣定下来（结婚）' : intimate === 'single' ? '单身' : '未选';
  const bndLabel = boundary === 'close' ? '保持亲近' : boundary === 'limited' ? '有限联系' : boundary === 'estranged' ? '断亲' : '未选';
  const scopeLabel = scope ? T12_SCOPE_LABELS[scope] : '未选';
  const costLabel = cost === 'wedding' ? '办婚礼（−12 万）' : cost === 'house' ? '买房（−30 万，开始还贷）' : cost === 'move' ? '迁居（−5 万）' : '不花这笔钱';
  // 断亲要选目标才可签：双缺席出身必须明确选一个目标；其他出身
  // 断亲即全断，目标自动为 all，不必再选。
  const scopeReady = boundary !== 'estranged' || scope || !isAbsentBoth;
  const canSign = intimate && boundary && scopeReady;
  setScreen(`
    <h1>T12 · 29 岁 · 关系锁定</h1>
    <p class="intro">这一格拆成两件事，各自定：伴侣关系（有没有人跟你过日子）与原生家庭边界（跟家里保持什么距离）。两件事互相独立——可以结婚且断亲，也可以单身且跟家里亲近。</p>
    ${G.kindnessHtml || ''}
    <h2>一、伴侣关系</h2>
    <div class="options">
      <button class="opt" data-act="t12-intimate" data-id="partner"><b>和伴侣定下来（结婚）</b><span>伴侣的真实想法在签署时封存（H4），T14 押注时见分晓。结婚本身不扣钱，花钱的事在下面另选。</span></button>
      <button class="opt" data-act="t12-intimate" data-id="single"><b>单身</b><span>没有伴侣。单身不等于没有亲密关系能力——人脉与支持网络照样算数。</span></button>
    </div>
    ${intimate === 'partner' ? `<h2>花钱的事（只在结婚时选）</h2>
    <div class="options">
      <button class="opt" data-act="t12-cost" data-id="none"><b>先不花这笔钱</b><span>不办婚礼、不买房、不迁居，现金不动。</span></button>
      <button class="opt" data-act="t12-cost" data-id="wedding"><b>办婚礼</b><span>现金 −12 万。</span></button>
      <button class="opt" data-act="t12-cost" data-id="house"><b>买房</b><span>现金 −30 万，开始还贷：T13 AP −1。</span></button>
      <button class="opt" data-act="t12-cost" data-id="move"><b>迁居</b><span>现金 −5 万，换个城市重新开始。</span></button>
    </div>` : ''}
    <h2>二、与原生家庭的边界</h2>
    <div class="options">
      <button class="opt" data-act="t12-boundary" data-id="close"><b>保持亲近</b><span>家庭线照常，陪家人的行动照常。</span></button>
      <button class="opt" data-act="t12-boundary" data-id="limited"><b>有限联系</b><span>家庭线最高到 +1，过年过节才联系。不是断，是留了距离。</span></button>
      <button class="opt" data-act="t12-boundary" data-id="estranged"><b>断亲</b><span>家庭线永久归零；自主执念进度 +2；压力恢复 −3/年。但“陪伴”这条路不会消失——可以陪伴侣、陪朋友，照样建立支持网络。</span></button>
    </div>
    ${boundary === 'estranged' ? (isAbsentBoth ? `<h2>断亲的目标（只在断亲时选）</h2>
    <p class="intro">断亲不再默认切断整个原生家庭线。你的出身是双亲缺席、奶奶抚养你长大——父母与奶奶是两条线，分开选。只断父母时，奶奶的照护（T13/T16）与相关事件保留。</p>
    <div class="options">
      <button class="opt" data-act="t12-scope" data-id="parents"><b>只与父母断联</b><span>只断父母这条线：奶奶仍是你的监护人，她的照护与相关事件保留。家庭线仍归零、压力恢复 −3/年——这是断亲本身的代价。</span></button>
      <button class="opt" data-act="t12-scope" data-id="caregiver"><b>只与奶奶断联</b><span>只断与奶奶这条线：父母本就缺席，不再有他们的事件。</span></button>
      <button class="opt" data-act="t12-scope" data-id="all"><b>与整个原生家庭断联</b><span>父母与奶奶都断：签署前请确认，这是最彻底的一种断法。奶奶的照护与相关事件一并消失。</span></button>
    </div>` : `<p class="muted">你的出身里，父母就是实际抚养你的人——断亲即与整个原生家庭断联（父母线与养育者线是同一条线）。</p>`) : ''}
    <div class="card"><p>你现在选的是：伴侣关系「${intLabel}」· 原生家庭边界「${bndLabel}」${boundary === 'estranged' ? '· 断亲目标「' + scopeLabel + '」' : ''}${intimate === 'partner' ? '· 花钱「' + costLabel + '」' : ''}。</p>
    ${canSign ? '<p><button class="opt" data-act="t12-confirm">签字确认（承诺 D）</button></p>' : '<p class="muted">' + (boundary === 'estranged' && !scopeReady ? '断亲的目标还没选：上面三条里选一条，才能签字确认。' : '两件事都选好，才能签字确认。') + '</p>'}</div>
    <p class="muted">承诺 D（关系槽，T13–T18 持续兑现）：无骰，但 H4 决定 T14 押注时伴侣是否共担。</p>`);
}

function showT12Signed(s) {
  const d = s.commitments.D;
  const h4 = s.sealed.H4;
  const intimate = s.flags.intimateRelationship || (s.flags.relationship === 'partner' ? 'partner' : 'single');
  const boundary = s.flags.familyBoundary || (s.flags.estranged ? 'estranged' : 'close');
  // v1.4：断亲目标写进已签卡；旧存档无此字段时按 'all'（v1.3 行为）。
  const scope = s.flags.estrangedScope || 'all';
  setScreen(`
    <h1>承诺卡 D 已签署</h1>
    <div class="card"><p>${esc(d ? d.text : '')}</p>
    <p>伴侣关系：${intimate === 'partner' ? '有伴侣（结婚）' : '单身'} · 原生家庭边界：${boundary === 'close' ? '保持亲近' : boundary === 'limited' ? '有限联系' : '断亲（' + T12_SCOPE_LABELS[scope] + '）'}。</p>
    ${h4 ? `<p>征兆：${esc(h4.omens.map((o) => o.text).join(' '))}</p><p class="muted">伴侣的真实想法已在签署时封存（H4，29 岁那年掷出）。他/她是否愿共担风险，T14 押注时见分晓——对外只看征兆，不看数字。</p>` : ''}
    ${s.flags.estranged ? '<p>家庭线已归零，压力恢复从此每年少 3 点。但“陪伴”这条路还在：可以陪伴侣、陪朋友，支持网络照样能建。</p>' : ''}
    ${s.flags.estranged && scope === 'parents' ? '<p>只断了父母这条线：奶奶仍是你的监护人，她的照护（T13/T16）与相关事件保留。</p>' : ''}
    ${boundary === 'limited' ? '<p>有限联系：家庭线最高到 +1，过年过节才联系。</p>' : ''}
    <p class="muted">D 在 T13–T18 持续兑现：买房的 AP 代价落在 T13；伴侣共担落在 T14；有没有人陪你扛，落在 T16。</p></div>
    <div class="actions"><button class="primary" data-act="year-next" data-id="13">进入 T13 · 30 岁</button></div>`);
}

function signT12() {
  const s = G.state, a = s.attrs;
  if (s.commitments.D) { showT12Signed(s); return; }
  const intimate = G.t12Intimate, boundary = G.t12Boundary;
  if (!intimate || !boundary) return;
  const cost = intimate === 'partner' ? (G.t12Cost || 'none') : 'none';
  s.flags.intimateRelationship = intimate;
  s.flags.familyBoundary = boundary;
  s.flags.relationship = intimate === 'partner' ? 'partner' : 'none'; // 兼容字段：fResilience / kindness / resolveE 读它
  if (intimate === 'partner') {
    // H4：伴侣真实想法，签署时 roll 1–100 封存。>60 愿共担风险，
    // 30–60 只想稳定，<30 只想解决自己的问题。征兆由封存值生成。
    sealDie(s, G.rng, 'H4', G.rng.int(1, 100), 3);
    if (cost === 'wedding') a.money -= 12;
    else if (cost === 'house') { a.money -= 30; s.flags.housing = 'mortgage'; }
    else if (cost === 'move') a.money -= 5;
  }
  if (boundary === 'estranged') {
    a.family = 0;
    s.flags.estranged = true;
    // v1.4：断亲目标落进存档（parents / caregiver / all）；双缺席
    // 出身必选一个目标，其他出身断亲即全断，目标自动为 all。
    s.flags.estrangedScope = G.t12Scope || 'all';
    s.flags.obsessionProgress = (s.flags.obsessionProgress || 0) + 2;
  } else if (boundary === 'limited') {
    s.flags.familyCapped = true;
    if (a.family > 1) a.family = 1;
  }
  const costText = cost === 'wedding' ? '，办婚礼 −12 万' : cost === 'house' ? '，买房 −30 万（开始还贷）' : cost === 'move' ? '，迁居 −5 万' : '';
  const bndText = boundary === 'close' ? '与家里保持亲近' : boundary === 'limited' ? '与家里有限联系' : '断亲（' + T12_SCOPE_LABELS[s.flags.estrangedScope || 'all'] + '）';
  s.commitments.D = { text: '关系槽：' + (intimate === 'partner' ? '伴侣（结婚' + costText + '）' : '单身') + ' · ' + bndText, signedAt: 'T12', dueTurn: 13, snapshot: { ...a } };
  G.t12Intimate = null; G.t12Boundary = null; G.t12Cost = null; G.t12Scope = null;
  s.rngState = G.rng.getState();
  autosave('承诺 D 已签署');
  Analytics.track('commitment', { card: 'D', choice: intimate + '/' + boundary + '/' + cost + (s.flags.estrangedScope ? '/' + s.flags.estrangedScope : '') });
  showT12Signed(s);
}

// ---------- v1.0: T14 押注 ----------
const E_LINES = [
  { id: 'startup', name: '创业', desc: '押上全部现金 + 2 年时间 + 绑定合伙人。合伙人可靠性在签署时封存（H6）。失败：押的现金没了（押注之后另赚的不动）、压力进崩档、健康 −20。' },
  { id: 'abroad', name: '裸辞出国', desc: '押上一半现金，出去闯两年。没有合伙人，成败只看你自己攒下的底子。' },
  { id: 'takeover', name: '接盘', desc: '接手一个现成的盘子，押上一半现金。盘子是现成的，坑也是现成的。' },
  { id: 'work', name: '继续打工', desc: '不押注。两年平稳打工，攒下 4 万，压力 +4。没有骰子，也没有翻盘。' },
];

function screenT14() {
  const s = G.state;
  if (s.commitments.E) { showT14Signed(s); return; }
  const a = s.attrs;
  setScreen(`
    <h1>T14 · 31 岁 · 押注</h1>
    <p class="intro">唯一的主动高风险押注。押上现金 + 2 年时间。成功率公式只对外显示三档把握（没什么底 / 五五开 / 有戏），精确数字 T16 兑现时才揭。</p>
    <div class="card"><p>你现在的底子：专业 ${a.skill}、人脉 ${a.network}、现金 ${a.money} 万、压力${pressureTier(a.stress).name}${s.flags.industryDown ? '、行业下行' : ''}${s.flags.relationship === 'partner' ? '、有伴侣' : ''}。</p></div>
    ${G.kindnessHtml || ''}
    <div class="options">${E_LINES.map((l) => `<button class="opt" data-act="t14-pick" data-id="${l.id}"><b>${l.name}</b><span>${l.desc}</span></button>`).join('')}</div>
    <p class="muted">承诺 E（押注，T16 兑现）：基础 15 + 专业×0.25 + 人脉×0.15 + min(20, 现金万×0.5) + 合伙人修正 + 行业周期 + 伴侣共担 − 压力档。合伙人修正只在创业线有（H6：&gt;60 +15，35–60 −10，&lt;35 −25）。</p>`);
}

function showT14Signed(s) {
  const e = s.commitments.E;
  const snap = (e && e.snapshot) || {};
  const h6 = (s.sealed.H6 && s.sealed.H6.value);
  const h6Text = typeof h6 === 'number'
    ? (h6 > 60 ? '合伙人看着还算靠谱。' : h6 >= 35 ? '合伙人可能中途掉链子。' : '合伙人不太对劲。')
    : '';
  setScreen(`
    <h1>承诺卡 E 已签署</h1>
    <div class="card"><p>${esc(e ? e.text : '')}</p>
    ${snap.line === 'work'
      ? '<p>没有骰子。两年平稳打工，T16 兑现时现金 +4 万，压力 +4。</p>'
      : `<p>把握：<b>${tierLabel(snap.chance)}</b>（对外只显示三档，精确成功率 T16 才揭）。这颗骰在你 31 岁那年掷出。</p>
      <p>征兆：${esc((s.sealed.E ? s.sealed.E.omens : []).map((o) => o.text).join(' '))}</p>
      ${h6Text ? `<p>${h6Text}</p>` : ''}`}
    <p class="muted">T15 是押注的煎熬期，合伙人开始露真面目；T16 兑现。</p></div>
    <div class="actions"><button class="primary" data-act="year-next" data-id="15">进入 T15 · 32 岁</button></div>`);
}

function pickT14(lineId) {
  const s = G.state, a = s.attrs;
  if (s.commitments.E) { showT14Signed(s); return; }
  const line = E_LINES.find((l) => l.id === lineId) || E_LINES[3];
  // 伴侣共担：H4 > 60 才算（T12 签署时封存）。
  const h4 = s.sealed.H4 ? s.sealed.H4.value : 0;
  s.flags.partnerShares = s.flags.relationship === 'partner' && h4 > 60;
  let partnerMod = 0, h6 = null, staked = 0;
  if (line.id === 'startup') {
    // H6：合伙人可靠性，仅创业线 roll 1–100。人脉 ≥50 +10；此前合作
    // 过 +15——“此前合作过”是解释性实现：本局开过专属线（ventures）
    // 即算合作经验。H6 三档固定：>60 +15，35–60 −10，<35 −25
    // （v1.2 已定，终审与 WorkBuddy 一致）。
    let roll = G.rng.int(1, 100);
    if (a.network >= 50) roll += 10;
    if ((s.ventures || []).length) roll += 15;
    h6 = Math.max(0, Math.min(100, roll));
    partnerMod = h6 > 60 ? 15 : h6 >= 35 ? -10 : -25;
    s.flags.partnerMod = partnerMod;
    s.flags.h6 = h6;
    sealDie(s, G.rng, 'H6', h6, 3);
    staked = a.money;
  } else if (line.id === 'abroad' || line.id === 'takeover') {
    s.flags.partnerMod = 0;
    staked = Math.round(a.money / 2 * 10) / 10;
  } else {
    s.flags.partnerMod = 0;
    staked = 0;
  }
  const tier = pressureTier(a.stress).id;
  const inp = { skill: a.skill, network: a.network, money: a.money, partnerMod: s.flags.partnerMod || 0, industryDown: !!s.flags.industryDown, partnerShares: !!s.flags.partnerShares, tier };
  const chance = line.id === 'work' ? null : gambleChanceFrom(inp);
  // 封存：成功率与掷出值都在签署时定死，T16 只读档、不重掷。
  // E 的征兆由封存结果生成（成 / 败两个声明，65% 准确）。
  let roll = null;
  if (chance !== null) {
    roll = G.rng.int(1, 100);
    sealDie(s, G.rng, 'E', { roll, chance, line: line.id }, 2);
  }
  s.commitments.E = {
    text: '押注：' + line.name + (line.id === 'startup' ? '（押全部现金 ' + staked + ' 万）' : line.id === 'work' ? '（不押）' : '（押一半现金 ' + staked + ' 万）'),
    signedAt: 'T14', dueTurn: 16,
    snapshot: { ...inp, k: s.flags.majorK || 1, staked, line: line.id, chance, roll, h6 },
  };
  s.rngState = G.rng.getState();
  autosave('承诺 E 已签署');
  Analytics.track('commitment', { card: 'E', choice: line.id });
  showT14Signed(s);
}

// ---------- v1.0: T16 兑现 E + H5 + 签署 F ----------
function resolveE(s) {
  if (s.flags.eResolved) return;
  s.flags.eResolved = true;
  const c = s.commitments.E;
  const a = s.attrs;
  if (!c) { s.flags.eResult = { line: 'none', success: null, note: 'T14 没签押注。' }; return; }
  const snap = c.snapshot || {};
  if (snap.line === 'work') {
    // 继续打工：不押注。两年平稳打工，攒下 4 万（2 万/年，解释性实现），压力 +4。
    a.money += 4; a.stress += 4;
    s.flags.eResult = { line: 'work', success: null, note: '两年平稳打工，攒下 4 万，压力 +4。没有骰子，也没有翻盘。' };
    return;
  }
  const success = snap.roll <= snap.chance;
  const staked = snap.staked || 0;
  const res = { line: snap.line, success, chance: snap.chance, roll: snap.roll, h6: snap.h6, staked, divorced: false };
  if (success) {
    // 成功：钱/影响力跳档——押的钱翻倍回来（本金 + 等额收益），影响力 +20。
    a.money = Math.round((a.money + staked) * 10) / 10;
    a.influence += 20;
  } else {
    // ---- v1.3 (P0-3 of the 2026-11-20 re-review): 失败只清算押注的
    // 风险敞口 ----
    // 押注资本与押注后独立收入分账：失败没收的是签署时押上的钱
    // （staked），不是 T16 的全部现金。T14 押 100 万、T15 另赚 3 万、
    // T16 失败 → 3 万还在（100 万没了）。出国/接盘本来就是这个算法，
    // 三条线现在统一：money = max(0, money − staked)。
    // H6 < 35 卷款跑路：剩下的钱再 −30%（v1.2 时创业失败直接归零，
    // 这一项只在剩钱时才咬得到数；现在创业失败也有剩钱，三条线都
    // 咬得到数）。
    a.money = Math.max(0, Math.round((a.money - staked) * 10) / 10);
    if (typeof snap.h6 === 'number' && snap.h6 < 35) a.money = Math.round(a.money * 0.7 * 10) / 10;
    a.stress = Math.max(a.stress, 75); // 压力进崩档
    a.health -= 20;
    // H4 < 30：押注失败额外触发离婚/分手事件。
    if (s.flags.relationship === 'partner' && s.sealed.H4 && s.sealed.H4.value < 30) {
      s.flags.relationship = 'none';
      s.flags.partnerGone = true;
      res.divorced = true;
    }
  }
  a.health = Math.max(0, Math.min(100, a.health));
  a.stress = Math.min(100, Math.max(0, a.stress));
  a.money = Math.round(a.money * 10) / 10;
  s.flags.eResult = res;
  if (success) s.flags.consecFails = 0;
  else s.flags.consecFails = (s.flags.consecFails || 0) + 1;
  addLesson(s, 'E', 'E 押注：成功率是算出来的，不是许愿许出来的；兑现卡第 ④ 格写着最小翻盘点。');
  autosave('承诺 E 已兑现');
}

function h5CostText(lvl, kind) {
  // v1.2 (P0-3): 自身健康版不扣“父母医疗费”——代价是自己的身体。
  if (kind === 'self') {
    if (lvl === 1) return '1 级：健康 −10，压力 +15。';
    if (lvl === 2) return '2 级：健康 −20，压力 +30。';
    return '3 级：健康 −30，压力 +45。';
  }
  if (lvl === 1) return '1 级：现金 −15 万，压力 +15。';
  if (lvl === 2) return '2 级：现金 −40 万，压力 +30。';
  return '3 级：现金 −80 万，压力 +45，健康 −15。';
}

function applyH5(s) {
  if (s.flags.h5Applied) return;
  s.flags.h5Applied = true;
  // v1.2 (P0-3): 没有封存的 H5（没有有效照护对象）→ 没有医疗费，
  // 什么都不扣。
  if (!s.sealed.H5) { s.flags.h5Result = null; return; }
  const lvl = h5Level(s);
  const a = s.attrs;
  // v1.4 (P0-2): 扣费读封存的照护对象，不按当前关系重算——T13 封存
  // 伴侣、T16 伴侣离开，照护费照扣，UI 也照写伴侣的病。
  const kind = sealedCareSubject(s).kind;
  if (kind === 'self') {
    if (lvl === 1) { a.health -= 10; a.stress += 15; }
    else if (lvl === 2) { a.health -= 20; a.stress += 30; }
    else { a.health -= 30; a.stress += 45; }
  } else {
    if (lvl === 1) { a.money -= 15; a.stress += 15; }
    else if (lvl === 2) { a.money -= 40; a.stress += 30; }
    else { a.money -= 80; a.stress += 45; a.health -= 15; }
  }
  a.money = Math.round(a.money * 10) / 10;
  a.health = Math.max(0, Math.min(100, a.health));
  a.stress = Math.min(100, a.stress);
  s.flags.h5Result = { level: lvl, checkup: !!s.flags.h5Checkup, base: s.sealed.H5 ? s.sealed.H5.value : 1 };
  autosave('照护对象病情已兑现（H5 ' + lvl + ' 级）');
}

function screenT16() {
  const s = G.state;
  resolveE(s);
  applyH5(s);
  if (s.commitments.F) { showT16Signed(s); return; }
  // v1.4 (P0-2): T16 只读 T13 封存的照护对象（sealedCareSubject），
  // 不再调用 careSubjectFor(s) 按当前关系重算。
  const care = sealedCareSubject(s);
  // v1.2 (P0-3): 没有有效照护对象——这一年没有人需要你照顾，不扣
  // 医疗费，不强制放弃任何东西。只看 E 的兑现卡，然后继续。
  if (care.kind === 'none' || !s.sealed.H5) {
    setScreen(`
    <h1>T16 · 33 岁 · 兑现</h1>
    <p class="intro">这一年没有人需要你照顾。没有父母病倒，没有医疗费，也不用放弃任何东西——E 的兑现卡在下面。</p>
    ${redemptionCardHtml(s, 'E')}
    ${G.kindnessHtml || ''}
    <div class="actions"><button class="primary" data-act="year-next" data-id="17">进入 T17 · 34 岁</button></div>`);
    return;
  }
  const lvl = s.flags.h5Result.level;
  const formLabels = {
    fund: care.kind === 'self' ? '自费治疗' : '经济支持',
    time: care.kind === 'self' ? '请假休养' : '亲自照护',
    share: care.kind === 'self' ? '请人帮忙' : '协商分工',
    public: '公共服务 / 社区',
  };
  // 协商分工需要有人能跟你分摊：伴侣，或人脉 ≥40，或家庭线 ≥1。
  const canShare = s.flags.relationship === 'partner' || (s.attrs.network || 0) >= 40 || (s.attrs.family || 0) >= 1;
  const checkupNote = s.flags.h5Result.checkup
    ? '；' + (care.kind === 'self' ? '你自己去体检过，等级 −1。' : '你带他们做过体检，等级 −1。')
    : '；T13 你没' + (care.kind === 'self' ? '自己去体检。' : '带他们体检。');
  const breakText = care.kind === 'self' ? '是你第一次发现，自己的身体也会掉链子。'
    : care.kind === 'partner' ? '是你第一次发现，身边的人也会倒下。'
    : '是你第一次发现，他们真的会老。';
  setScreen(`
    <h1>T16 · 33 岁 · ${esc(care.careNoun)}倒了</h1>
    <p class="intro">没有正确选项的一格。照护总要有人做——出钱、出力、分工，还是找公共服务，没有一种不疼。放弃伴侣或健康不再是必选项。</p>
    ${redemptionCardHtml(s, 'E')}
    <div class="card"><h2>${esc(care.label)}的病（H5 · ${lvl} 级${s.flags.h5Result.checkup ? '，体检 −1 级' : ''}）</h2>
      <p>${h5CostText(lvl, care.kind)}</p>
      <p class="muted">这颗骰在你 30 岁那年掷出（T13 签署）${checkupNote}</p>
      ${lvl === 3 ? `<p class="warn">破防事件：那天晚上你没睡着。不是钱的事，${breakText}（破防事件的具体内容文档未给，当前为占位文案，见设计文档 v1.0 节待定清单。）</p>` : ''}
    </div>
    ${G.kindnessHtml || ''}
    <h2>你怎么照护？</h2>
    <div class="options">
      <button class="opt" data-act="t16-pick" data-id="fund"><b>${formLabels.fund}</b><span>现金 −10 万。${care.kind === 'self' ? '自己掏钱治。' : '钱能解决的事，先用钱解决。'}</span></button>
      <button class="opt" data-act="t16-pick" data-id="time"><b>${formLabels.time}</b><span>专业 −5，压力 +10。时间是你出的。</span></button>
      <button class="opt" data-act="t16-pick" data-id="share" ${canShare ? '' : 'disabled'}><b>${formLabels.share}</b><span>压力 +5，现金 −5。跟伴侣 / 家人 / 朋友分摊。${canShare ? '' : '（现在没人能跟你分摊。）'}</span></button>
      <button class="opt" data-act="t16-pick" data-id="public"><b>${formLabels.public}</b><span>现金 −3 万，压力 +5。社区、医保、公共服务先顶上。</span></button>
    </div>
    <p class="muted">抗压判定（钱 ≥30 万 / 有伴侣支持 / 健康 ≥60，三选二）：成立 → 压力 +25；否则压力 +45、健康 −15。判定读照护方式选定前的状态（H5 的账已结过）。</p>`);
}

function showT16Signed(s) {
  setScreen(`
    <h1>承诺卡 F 已签署</h1>
    ${redemptionCardHtml(s, 'E')}
    ${redemptionCardHtml(s, 'F')}
    <div class="actions"><button class="primary" data-act="year-next" data-id="17">进入 T17 · 34 岁</button></div>`);
}

function pickT16(id) {
  const s = G.state, a = s.attrs;
  if (s.commitments.F) { showT16Signed(s); return; }
  // v1.4 (P0-2): 照护方式的文案也读封存对象，与 T16 屏一致。
  const care = sealedCareSubject(s);
  // 抗压判定读照护方式选定前的状态（H5 的账已在进 T16 时结过，
  // 照护方式的代价不应反过来改写判定本身）。
  const res = fResilience(s);
  // 照护方式的代价（P0-3）：出钱 / 出时间 / 分摊 / 公共服务——
  // 没有一种是“放弃伴侣”或“放弃健康”。
  if (id === 'fund') { a.money -= 10; }
  else if (id === 'time') { a.skill -= 5; a.stress += 10; }
  else if (id === 'share') { a.stress += 5; a.money -= 5; }
  else { a.money -= 3; a.stress += 5; }
  if (res.pass) a.stress += 25;
  else { a.stress += 45; a.health -= 15; }
  a.money = Math.round(a.money * 10) / 10;
  a.health = Math.max(0, Math.min(100, a.health));
  a.stress = Math.min(100, Math.max(0, a.stress));
  const formName = { fund: care.kind === 'self' ? '自费治疗' : '经济支持', time: care.kind === 'self' ? '请假休养' : '亲自照护', share: care.kind === 'self' ? '请人帮忙' : '协商分工', public: '公共服务 / 社区' }[id] || id;
  s.commitments.F = { text: `${care.careNoun}：${formName}（H5 ${s.flags.h5Result ? s.flags.h5Result.level : '?'} 级）`, signedAt: 'T16', dueTurn: 17, snapshot: { ...a } };
  s.flags.fResult = res;
  if (res.pass) s.flags.consecFails = 0;
  else s.flags.consecFails = (s.flags.consecFails || 0) + 1;
  s.rngState = G.rng.getState();
  autosave('承诺 F 已签署');
  Analytics.track('commitment', { card: 'F', choice: id });
  showT16Signed(s);
}

// ---------- v1.0: T18 最后一件想做的事 + 35 岁结算 ----------
// T18 不做年度结算：1 AP 的行动之后直接结算，结算卡就是这一年的账单。
function screenT18() {
  const s = G.state;
  const done = !!s.flags.t18Done;
  setScreen(`
    <h1>T18 · 35 岁 · 最后一件想做的事</h1>
    <p class="intro">AP 只有 1。做完这一件，就去结算。</p>
    ${G.kindnessHtml || ''}
    ${done
      ? `<div class="card"><p>你做的最后一件事：<b>${esc({ family: s.flags.estranged ? '陪伴侣/朋友吃顿饭' : '陪家人/伴侣吃顿饭', health: '好好睡一觉，去体检', write: '把这 18 年写下来' }[s.flags.t18Choice] || '')}</b></p></div>
      <div class="actions"><button class="primary" data-act="t18-settle">去结算 · 35 岁</button></div>`
      : `<div class="options">
      <button class="opt" data-act="t18-pick" data-id="family"><b>${s.flags.estranged ? '陪伴侣/朋友吃顿饭' : '陪家人/伴侣吃顿饭'}</b><span>1 AP。${s.flags.estranged ? '人脉 +2，压力 −8。断亲之后，陪伴的对象换了。' : '家庭线 +1，压力 −8。'}</span></button>
      <button class="opt" data-act="t18-pick" data-id="health"><b>好好睡一觉，去体检</b><span>1 AP。健康 +5，压力 −8。</span></button>
      <button class="opt" data-act="t18-pick" data-id="write"><b>把这 18 年写下来</b><span>1 AP。影响力 +6，压力 −3。写给以后的人看。</span></button>
    </div>`}`);
}

function pickT18(id) {
  const s = G.state, a = s.attrs;
  if (s.flags.t18Done || s.ap < 1) return;
  s.ap -= 1;
  // v1.2 (P0-4): 断亲后陪的是伴侣 / 朋友（人脉 +2），不是家庭线。
  if (id === 'family' && s.flags.estranged) { a.network = (a.network || 0) + 2; a.stress -= 8; }
  else if (id === 'family') { a.family += 1; a.stress -= 8; }
  else if (id === 'health') { a.health += 5; a.stress -= 8; }
  else { a.influence += 6; a.stress -= 3; }
  a.health = Math.max(0, Math.min(100, a.health));
  a.stress = Math.max(0, a.stress);
  s.flags.t18Done = true;
  s.flags.t18Choice = id;
  s.yearActions = s.yearActions || [];
  s.yearActions.push({ family: s.flags.estranged ? '陪伴侣/朋友吃顿饭' : '陪家人/伴侣吃顿饭', health: '好好睡一觉，去体检', write: '把这 18 年写下来' }[id]);
  autosave('T18 最后一件想做的事');
  screenT18();
}

const ENDING_NAMES = { fulfilled: '如愿', 'another-way': '换了一种如愿', survived: '活下来了', restart: '重开' };
const ENDING_TEXT = {
  fulfilled: '你走成了原来想走的那条路。',
  'another-way': '你没走成原来那条路，但你走成了另一条——这也算赢。',
  survived: '没如愿，但你活下来了。活下来本身，就是一条路。',
  restart: '这一局没有走到你想要的地方。可以再来一次，换一条路走走。',
};

function screenSettlement() {
  const s = G.state;
  const sc = obsessionScore(s);
  if (!s.flags.settled) {
    s.flags.settled = true;
    s.finished = true;
    G.meta.runsFinished = (G.meta.runsFinished || 0) + 1;
    saveMeta(G.meta);
    // 结算统计事件（SPEC：只发执念达成度 + 结局类型，枚举与数字，
    // 不发自由文本）。ANALYTICS_ENDPOINT 为空时是空操作。
    Analytics.track('settlement', { obsessionScore: sc.total, ending: sc.ending });
    autosave('35 岁结算完成');
  }
  const rows = (s.obsessions || []).map((id) => {
    const o = OBSESSIONS.find((x) => x.id === id) || { name: id };
    return `<p><b>${esc(o.name)}</b>：${sc.per[id] ?? 0} / 3 分</p>`;
  }).join('') || '<p>开局没选执念。这一局没有打分对象。</p>';
  const ded = [];
  if (sc.deductions.health) ded.push(`健康 ≤20，−${sc.deductions.health}`);
  if (sc.deductions.debt) ded.push(`Debt 到顶，−${sc.deductions.debt}`);
  if (sc.deductions.estranged) ded.push(`断亲且执念含家庭，−${sc.deductions.estranged}`);
  setScreen(`
    <h1>35 岁 · 结算</h1>
    <div class="card"><h2>${ENDING_NAMES[sc.ending]}（${sc.total} 分）</h2><p>${ENDING_TEXT[sc.ending]}</p></div>
    <div class="card"><h2>执念达成度</h2>${rows}
      <p>小计 ${sc.raw} 分${ded.length ? ' − 代价：' + ded.join('、') : '，无代价扣除'} → <b>${sc.total} 分</b></p>
      <p class="muted">评分细则是按终局状态的解释性实现（文档未给细则）：money 看现金档、seen 看影响力、home 看家庭线、free 看 Debt/压力、love 看伴侣状态、health 看健康。见 engine.js obsessionScore 注释。</p></div>
    <div class="card"><h2>最后的状态</h2>
      <p>钱 ${s.attrs.money} 万 · 健康 ${s.attrs.health} · 压力 ${s.attrs.stress}（${pressureTier(s.attrs.stress).name}）· 家庭线 ${s.attrs.family} · Debt ${s.attrs.debt} · 影响力 ${s.attrs.influence}</p>
      <p class="muted">执念：${s.obsessions.map((id) => (OBSESSIONS.find((o) => o.id === id) || {}).name).join('、') || '未选'} · 难度：${DIFFICULTIES[s.difficulty].name}${(s.difficulty === 'hard' || s.difficulty === 'nightmare') ? '（你选了更难的那条）' : ''}</p>
      ${s.flags.acceptedFate ? '<p>18 岁那年，你选择保留命运给你的起点。此后，你走出了属于自己的路。</p>' : ''}
      <p class="muted">图鉴里攒了 ${(s.lessons || []).length} 张教训卡（只继承信息，不继承数值）。</p></div>
    <div class="actions">
      <button class="primary" data-act="restart">再来一次（解锁 S4 改写）</button>
      <button data-act="export">导出存档码</button>
      <button data-act="title">回到标题</button>
    </div>`);
}

// ---------- T5 / T6 key years ----------
// P1 (f): the graduation-year era line — how hot the civil-service exam
// is this year, what the foreign-firm line looks like for this cohort,
// and which channels the NPCs use. Display only for now (the 考公 /
// 出海线 options themselves are later work); the numbers come from the
// era functions, not from the 2026 UI.
function t5EraLineHtml(s) {
  // P1 (f, recheck 2026-11-17): everything keys off the graduation year
  // (the year the player actually makes the decision), read through the
  // unified era context — never the exam year alone.
  const ec = eraContextFor(s, 5);
  const gradYear = ec.gradYear;
  const stats = civilServiceStats(gradYear);
  const appeal = civilServiceAppeal(gradYear);
  const narrative = civilServiceNarrative(gradYear);
  const ff = foreignFirmVisibility(gradYear);
  const contacts = npcContactForYear(gradYear);
  const statsText = stats
    ? `${gradYear} 年国考通过资格审查约 ${stats.applicants} 万人，计划招录 ${stats.planned} 人（审查比约 ${stats.ratio}:1${stats.interpolated ? '，插值估计' : ''}）`
    : `${gradYear} 年国考数据未覆盖`;
  const appealText = appeal === null ? '考公吸引力未定（架空年份）' : `考公吸引力 ${appeal}/100`;
  const ffText = ff.fictional ? '外企机会可见度未定（架空年份）' : `外企机会可见度 ${ff.weight}/100（分化为主，伴随局部收缩和转型）`;
  return `<div class="card"><p><b>时代：</b>${statsText}；${appealText}。${narrative || ''}${ffText}；联系人主要走${contacts.slice(0, 3).join('、')}等。</p></div>`;
}
function screenT5() {
  const s = G.state;
  // v1.4 (P0-1): B 卡已签署时只看已签卡，不重进毕业去向选择——否则
  // 刷新/继续回 T5 还能再签一次 B，入职现金奖励重发一遍。
  if (s.commitments.B) { showT5Signed(s); return; }
  setScreen(`
    <h1>T5 · 22 岁 · 毕业去向</h1>
    <p class="intro">承诺卡 A（志愿）已在 T4 兑现——回头看，18 岁的选择把你带到了这里。你的专业是 <b>${esc(s.major ? s.major.name : '（旧存档，未记录）')}</b>${s.major && s.major.tier ? `（${esc(s.major.tier)}）` : ''}，专业系数 k = ${s.flags.majorK}，起点已定。同时签下承诺卡 B：第一份工作，锁定城市 × 行业，后续 80% 的机会只从这条线长出来。</p>
    <div class="card"><p><b>offer 档位（内部公式）：</b>档位 = floor((专业×0.5 + 表达×0.3 + 人脉×0.2) / 100 × 4) + 1。你当前是 <b>${offerTier(s)} 档</b>（1 小公司 / 2 普通 / 3 好公司 / 4 大厂）。</p></div>
    ${t5EraLineHtml(s)}
    ${eraYearCardHtml(s, 5)}
    ${shengbenHtml(s, 't5')}
    <div class="options">${T5_JOBS.map((j) => `<button class="opt" data-act="t5-pick" data-id="${j.id}"><b>${j.name}</b><span>${j.desc} 钱 +${j.money} 万/年。</span></button>`).join('')}</div>`);
}

// v1.4 (P0-1): B 卡已签署的只读屏——恢复/刷新回到 T5 时只看这张卡
// 和下一回合入口，不再允许重新选毕业去向、不重发入职奖励。
function showT5Signed(s) {
  const b = s.commitments.B;
  setScreen(`
    <h1>承诺卡 B 已签署</h1>
    <div class="card"><p>${b ? esc(b.text) : ''}</p>
    <p>入职奖励已在签署时发放，不会重复发放。</p></div>
    <div class="actions"><button class="primary" data-act="year-start">进入 T6 · 23 岁</button></div>`);
}

function pickT5(id) {
  const s = G.state;
  // v1.4 (P0-1): B 卡已签署，再点旧的去向按钮也不重进选择流程
  // （screenT5 已守卫；这里防陈旧屏/重复派发的直接调用）。
  if (s.commitments.B) { showT5Signed(s); return; }
  const j = T5_JOBS.find((x) => x.id === id);
  // v1.4.2 (补充 A)：体制内不再一键签，改走入职考试（国考 / 省考 →
  // 省份 → 职位 → 报名 → 笔试 → 面试），通过才 signT5。
  if (j && j.id === 'stable') {
    G.examDraft = { type: null, provinceId: null, positionId: null };
    screenCivilExamType();
    return;
  }
  // v1.2 (P1-3): T5 分两步签——先选工作（公司性质），再选行业。
  // 钱 / 压力与承诺卡 B 都在行业选完才落定。
  G.t5Draft = { job: j };
  screenT5Sector();
}

// 第二步：选行业。公司性质与行业分开（P1-3）：大厂可以做教培，
// 创业公司也可以做线下服务；T9 读的是行业字段，不是公司类型。
function screenT5Sector() {
  const j = G.t5Draft.job;
  const defaultSector = { bigtech: 'internet', stable: 'public', hometown: 'offline' }[j.id] || null;
  setScreen(`
    <h1>T5 · 22 岁 · 选行业</h1>
    <p class="intro">你去了${j.name}。再选一行：你做的具体是哪一行？行业决定 T9 裁员修正、年代事件里的行业条件，不决定你是谁。</p>
    <div class="options">${SECTORS.map((sec) => `<button class="opt" data-act="t5-sector-pick" data-id="${sec.id}"><b>${sec.name}</b><span>${sec.subsectors.length ? '需再选细分：' + sec.subsectors.map((x) => x.name).join(' / ') : '没有细分。'}</span></button>`).join('')}</div>
    <p class="muted">${defaultSector ? '按这份工作，最常见的是「' + (SECTORS.find((x) => x.id === defaultSector) || {}).name + '」，但你可以选别的。' : '创业公司 / 自由职业 / 读研没有默认行业，自己选。'}</p>`);
}

function pickT5Sector(sectorId) {
  const sec = SECTORS.find((x) => x.id === sectorId) || SECTORS[SECTORS.length - 1];
  if (sec.subsectors.length) {
    G.t5Draft.sector = sec;
    setScreen(`
      <h1>T5 · 22 岁 · 选细分</h1>
      <p class="intro">教培分三类：只有学科类校外培训受双减政策直接影响，素质教育与职业培训不走同一条修正。</p>
      <div class="options">${sec.subsectors.map((sub) => `<button class="opt" data-act="t5-subsector-pick" data-id="${sub.id}"><b>${sub.name}</b><span>${sub.policyExposure ? '政策暴露：高（双减直接影响）。' : '政策暴露：低。'}</span></button>`).join('')}</div>`);
    return;
  }
  signT5(G.t5Draft.job, sec, null);
}

function pickT5Subsector(subId) {
  const sec = G.t5Draft.sector;
  const sub = (sec.subsectors || []).find((x) => x.id === subId) || null;
  signT5(G.t5Draft.job, sec, sub);
}

function signT5(j, sec, sub) {
  const s = G.state;
  // v1.4 (P0-1): B 卡已签署，再走签署流程也不重发入职奖励。
  if (s.commitments.B) { showT5Signed(s); return; }
  s.attrs.money += j.money;
  s.attrs.stress += j.stress;
  if (j.id === 'bigtech') s.flags.highPay = true;
  // v1.2 (P0-7): 雇佣状态按工作定——创业 / 读研 / 自由职业没有雇主，
  // T9 不掷 H2，走各自的危机分支。
  s.flags.employment = j.id === 'startup' ? 'startup' : j.id === 'grad' ? 'grad' : j.id === 'freelance' ? 'freelance' : 'employed';
  if (j.id === 'grad') s.flags.gradSchool = true;
  s.flags.jobIndustry = SECTOR_DISPLAY[sec.id] || sec.name; // 旧字段：中文行业名，供旧存档 / 旧条件读取
  s.flags.jobProfile = {
    employerType: j.id, sector: sec.id, sectorName: SECTOR_DISPLAY[sec.id] || sec.name,
    subsector: sub ? sub.id : null, policyExposure: sub ? !!sub.policyExposure : false,
    salaryAnnual: j.money, startTurn: 5,
  };
  s.flags.housing = 'rent';
  s.commitments.B = { text: '第一份工作：' + j.name + ' · ' + sec.name + (sub ? ' · ' + sub.name : ''), signedAt: 'T5', dueTurn: 6, snapshot: { ...s.attrs } };
  G.t5Draft = null;
  autosave('承诺 B 已签署');
  Analytics.track('commitment', { card: 'B', choice: j.id });
  setScreen(`
    <h1>承诺卡 B 已签署</h1>
    <div class="card"><p>你去了${j.name}（${sec.name}${sub ? ' · ' + sub.name : ''}）。这条线的 NPC 池已经换了——接下来几年遇到的人，大多从这里来。</p></div>
    <div class="actions"><button class="primary" data-act="year-next" data-id="6">进入 T6 · 23 岁</button></div>`);
}

function screenT6() {
  const s = G.state;
  // v1.2 (P1-1): 演练历史影响后续场景——之前在演练里跟老李/王姐
  // 聊过，这里会提一句。
  const mem = (G.meta && G.meta.npcMemory) || {};
  const drilledLi = mem.li && (mem.li.history || []).length > 0;
  const drilledWang = mem.wang && (mem.wang.history || []).length > 0;
  const drillLine = drilledLi && drilledWang ? '你之前在演练里跟老李和王姐都聊过——现在轮到真选了。'
    : drilledLi ? '你之前在演练里跟老李聊过，他那句“先把手头这件事做到 90 分”你还记得。'
    : drilledWang ? '你之前在演练里跟王姐聊过，她那句“先告诉我你做到哪一步了”你还记得。' : '';
  setScreen(`
    <h1>T6 · 23 岁 · 入职第一年</h1>
    <p class="intro">半承诺：站队。抱某位领导，还是保持中立？半承诺可撤销，但有代价——反悔后该 NPC 意愿 −40，且新靠山对你的信任上限 60（“他背叛过老李”）。</p>
    ${drillLine ? `<p class="muted">${esc(drillLine)}</p>` : ''}
    <div class="options">
      <button class="opt" data-act="t6-pick" data-id="li"><b>站队老李</b><span>业务骨干，能力偏好型；跟他能学到东西，但他不护短。</span></button>
      <button class="opt" data-act="t6-pick" data-id="wang"><b>站队王姐</b><span>手握资源，慕强、重结果；跟她要拿出结果，才有话语权。</span></button>
      <button class="opt" data-act="t6-pick" data-id="none"><b>保持中立</b><span>谁也不得罪，谁也不帮你。升得慢，但睡得着。</span></button>
    </div>`);
}

function pickT6(id) {
  const s = G.state;
  s.flags.stance = id;
  if (id !== 'none') s.flags.hasProtector = true;
  autosave('站队已定');
  setScreen(`
    <h1>站队已定</h1>
    <div class="card"><p>${id === 'none' ? '你谁也没站。办公室的风往哪边吹，都跟你无关——暂时。' : '你站了队。这条线的好处和代价，未来三年会慢慢找上门。'}</p></div>
    <div class="actions"><button class="primary" data-act="year-next" data-id="7">进入 T7 · 24 岁</button></div>`);
}

// ---------- T9 slice ----------
// 切片走哪条危机线，由雇佣关系定（P0-7），不是由 t9Branch 的事后
// 标签定：有雇主的走裁员线（H2），创业 / 读研 / 自由职业走各自的
// 危机分支（第一、第二件事换文案，第三件事共用）。
// v1.4.2：体制内（employerType 'stable' 或 sector 'public'，见
// engine.js isPublicJob）走 'public' 分支——不掷 H2、不裁员、不领
// 补偿，走“危机之夜”线（机构改革传闻 / 考核 / 轮岗 / 借调）。
// 注意：大厂但选了体制内行业（sector 'public'）也走 public 分支——
// 这是按 brief 的刻意简化（行业字段说了算），不是 bug。
function sliceBranch(s) {
  const emp = s.flags && s.flags.employment;
  if (emp === 'startup' || emp === 'grad' || emp === 'freelance') return emp;
  if (isPublicJob(s)) return 'public';
  return 'employed';
}
function sliceDecisions(s) {
  const b = sliceBranch(s);
  if (b === 'startup' || b === 'grad' || b === 'freelance' || b === 'public') {
    return [T9_SLICE.branchFirst[b], T9_SLICE.branchSecond[b], T9_SLICE.decisions[2]];
  }
  return T9_SLICE.decisions;
}

// ---- v1.4 (P1-3): 教培细分补填 ----
// jobProfile 是教培但 subsector 为 null（旧存档迁移标 subsectorMissing
// 后仍未补）时，H2 封存前请玩家补选。跳过 = 按未知细分继续，本次
// 教培修正按 0 计（t9IndustryAdjustment 严格门控），不再追问。
function jobProfileNeedsSubsector(s) {
  const jp = s.flags && s.flags.jobProfile;
  if (jp && (jp.sector === 'education' || jp.sectorName === '教培')) return !jp.subsector;
  if (!jp && s.flags && s.flags.jobIndustry === '教培') return true;
  return false;
}
function renderSliceSubsectorPrompt(s) {
  const sec = SECTORS.find((x) => x.id === 'education');
  setScreen(`
    <h1>T9 · 26 岁 · 补填行业细分</h1>
    <p class="intro">你的档案里写着“教培”，但没写是哪一类教培。双减政策修正只认学科类校外培训——补填一下，今晚的裁员判定才算得准。</p>
    <div class="options">${sec.subsectors.map((sub) => `<button class="opt" data-act="slice-subsector-pick" data-id="${sub.id}"><b>${sub.name}</b><span>${sub.policyExposure ? '政策暴露：高（双减直接影响）。' : '政策暴露：低。'}</span></button>`).join('')}</div>
    <p class="muted">也可以先不填：点“跳过，按未知细分继续”，本次教培修正按 0 计。</p>
    <div class="actions"><button data-act="slice-subsector-skip">跳过，按未知细分继续</button></div>`);
}

function enterSlice(direct) {
  const s = G.state;
  // v1.2 (P0-1): 重进切片不重初始化——sliceStep、sliceStart、H2 都从
  // 存档恢复；只有首次进入才掷 H2、置 sliceStep = 0。旧存档没有
  // sliceEntered 标记时，有 sliceStep 即视为重进。
  const reentering = !direct && s.turn === 9 && typeof s.sliceStep === 'number';
  if (direct) {
    // Direct-to-slice: generate a plausible 26-year-old state.
    const rng = G.rng;
    s.origin = rollOrigin(rng, s.difficulty);
    Object.assign(s.attrs, s.origin.attrs);
    s.attrs.skill = 55 + rng.int(0, 20);
    s.attrs.express = 50 + rng.int(0, 20);
    s.attrs.network = 45 + rng.int(0, 20);
    s.attrs.money = 12 + rng.int(0, 18);
    s.attrs.stress = 35 + rng.int(0, 15);
    s.flags.majorK = 1.0;
    s.major = { name: '省内师范', source: 'parents' };
    s.flags.familySafety = s.origin.attrs.money >= 2 ? '家里能接住你一次，但只有一次。' : '家里接不住你——这条路得你自己走。';
    s.commitments.A = { text: '志愿：省内师范（听父母的）', signedAt: 'T1', dueTurn: 4, snapshot: {} };
    s.commitments.B = { text: '第一份工作：普通公司', signedAt: 'T5', dueTurn: 6, snapshot: {} };
    s.flags.employment = 'employed';
    s.flags.jobIndustry = '互联网';
    s.flags.jobProfile = { employerType: 'bigtech', sector: 'internet', sectorName: '互联网', subsector: null, policyExposure: false, salaryAnnual: 18, startTurn: 5 };
    s.flags.housing = 'rent';
    s.rngState = rng.getState();
  }
  // P1 (a): the T9 crisis background for this cohort, read through the
  // unified era context. Era runs use the exam year; legacy /
  // direct-slice runs default to 2026 (crisis 2034).
  const ec = eraContextFor(s, 9);
  s.flags.t9Crisis = t9CrisisForExamYear(ec.examYear);
  // H2: whether the player is laid off is sealed when the slice is entered
  // — the three decisions only shape the RESPONSE, never the outcome.
  // (Hidden: sealDie would leak omens, so store it raw on flags.)
  // A resumed slice keeps its original die.
  // v1.4 (P1-3): 教培细分补填——旧存档的 jobProfile 没有 subsector
  // 时，H2 封存前先请玩家补选；不补选不封 H2（不靠猜细分算修正）。
  if (!s.flags.h2 && sliceBranch(s) === 'employed' && jobProfileNeedsSubsector(s) && s.flags.subsectorMissing !== false) {
    renderSliceSubsectorPrompt(s);
    return;
  }
  if (!s.flags.h2 && sliceBranch(s) === 'employed') {
    if (s.flags.industryDown) s.flags.deptShrinking = true;
    const h2chance = layoffChance(s);
    const h2roll = G.rng.int(1, 100);
    s.flags.h2 = { chance: h2chance, roll: h2roll, laidOff: h2roll <= h2chance };
    s.rngState = G.rng.getState();
  } else if (!s.flags.h2) {
    s.flags.h2 = null;
  }
  s.turn = 9;
  if (!reentering) {
    s.ap = 3;
    s.sliceStart = Date.now();
    s.sliceStep = 0;
    s.flags.sliceEntered = true;
    Analytics.track('turn_start', { turn: 9 });
  }
  // ---- v1.3 (P0-1): 切片阶段持久化 ----
  // sliceEnd 完成后 flags.slicePhase = 'completed'；刷新/继续再进切片
  // 时直接重渲染结局屏，不重跑 renderSliceDecision（sliceStep 已是 3，
  // decs[3] 是 undefined，会崩）。旧存档没有 slicePhase 时，按
  // sliceStep >= 3 回退判定（renderSliceDecision 也有同款守卫）。
  // renderSliceOutro 前先 sliceSettleOnce：v1.2 的存档在结局屏刷新时
  // 还没保存过结算结果（v1.2 的 sliceEnd 只渲染不保存），这一步把
  // 补偿/压力补算一次；v1.3 的存档已有 sliceResolved，调用无操作。
  if (s.flags.slicePhase === 'completed' || (reentering && s.sliceStep >= 3)) {
    sliceSettleOnce(s);
    autosave('进入 T9 切片');
    renderSliceOutro(s);
    return;
  }
  autosave('进入 T9 切片');
  renderSliceDecision();
}

// Borrow decision options, computed from the player's actual cash (v0.2):
// 缺口 = max(0, 3 − 存款). Broke players borrow the gap; players with
// savings get by on them instead.
function sliceBorrowOptions(s) {
  const money = s.attrs.money || 0;
  const gap = Math.max(0, Math.round((3 - money) * 10) / 10);
  // v0.7: era runs — the family can put at most
  // min(流动现金 × 20%, 缺口） × 支持兑现系数 behind you tonight
  // (design v6 familySupportCapacity). Legacy / direct-slice runs keep
  // the uncapped gap formula.
  const econ = s.flags && s.flags.familyEcon;
  const factor = econ ? supportFactor(s.origin ? s.origin.familyKey : null) : 1;
  const famCap = (amt) => econ ? Math.round(Math.min(econ.cash * 0.2, amt) * factor * 10) / 10 : amt;
  if (gap <= 0) {
    const pre = famCap(1);
    const opts = [
      { text: '靠储蓄，不借', fx: { stress: -2 }, seal: '你算了一下存款，够撑三个月。这笔账不用跟家里开这个口。', omen: '你把存款 App 的数字截了个图，存进了备忘录。' },
    ];
    if (pre > 0) opts.push({ text: `借 ${pre} 万以防万一`, fx: { money: pre, stress: -2 }, seal: `你跟家里借了 ${pre} 万垫底。妈妈说：“不够再说。”`, omen: '转账到账的短信提示音，在深夜格外响。' });
    opts.push({ text: '压缩开支，硬扛', fx: { money: 0.5, stress: 2 }, seal: '你把下个月的预算砍了一半。外卖换成了自己做饭。', omen: '你打开记账 App，删掉了三个订阅。' });
    return opts;
  }
  const cap = famCap(gap);
  if (cap <= 0) {
    return [
      { text: '不借，自己扛', fx: { stress: 6 }, seal: '你没开口。家里这回也拿不出钱——这三个月会很难，但你想试试不靠家里能走多远。', omen: '你打开存款 App，看了一眼余额，又关上了。' },
    ];
  }
  const half = Math.round((cap / 2) * 10) / 10;
  return [
    { text: `跟家里借 ${cap} 万`, fx: { money: cap, family: -1, stress: -5 }, seal: `妈妈没问为什么，只说了一句：“卡号发来。”家里这回最多能拿出 ${cap} 万。家庭线 −1——不是关系坏了，是你开始记账了。`, omen: '转账到账的短信提示音，在深夜格外响。' },
    { text: '不借，自己扛', fx: { stress: 6 }, seal: '你没开口。这三个月会很难，但你想试试不靠家里能走多远。', omen: '你打开存款 App，看了一眼余额，又关上了。' },
    { text: `借一半，${half} 万`, fx: { money: half, stress: -2 }, seal: `你借了 ${half} 万。一半靠家里，一半靠自己——这是你能接受的中间态。`, omen: '妈妈多转了 5000，备注写着“别省着”。' },
  ];
}

function renderSliceDecision() {
  const s = G.state;
  const decs = sliceDecisions(s);
  // v1.3 (P0-1): sliceStep 越界守卫——三步已走完（旧存档/刷新在结局屏）
  // 时不再取 decs[3]，直接渲染结局屏（先补算一次结算，幂等）。
  if (typeof s.sliceStep !== 'number' || s.sliceStep < 0) s.sliceStep = 0;
  if (s.sliceStep >= decs.length) { sliceSettleOnce(s); return renderSliceOutro(s); }
  const d = decs[s.sliceStep];
  let options = d.dynamic === 'borrow' ? sliceBorrowOptions(s) : d.options;
  // P1 (f, recheck 2026-11-17): before 2013 微信 is not the default
  // contact channel — the probe goes by QQ. 2013+ keeps 微信.
  if (s.flags.t9Crisis) {
    const channel = npcInstantChannel(s.flags.t9Crisis.crisisYear);
    if (channel !== '微信') {
      options = options.map((o) => ({
        ...o,
        text: o.text.replace(/微信/g, channel),
        seal: o.seal.replace(/微信/g, channel),
        omen: (o.omen && o.omen.includes('微信')) ? channel + '发出去之后，半天没有回音。' : o.omen,
      }));
    }
  }
  G.sliceOptions = options;
  const elapsed = Math.floor((Date.now() - (s.sliceStart || Date.now())) / 1000);
  const branch = sliceBranch(s);
  const intro = branch === 'employed' ? T9_SLICE.intro : (T9_SLICE.branchIntros[branch] || T9_SLICE.intro);
  setScreen(`
    <h1>T9 · 26 岁 · ${branch === 'employed' ? '裁员之夜' : '危机之夜'}</h1>
    <p class="intro">${esc(intro)}</p>
    ${s.flags.t9Crisis ? `<p class="muted">背景：${s.flags.t9Crisis.crisisYear} 年${esc(s.flags.t9Crisis.label)}${s.flags.t9Crisis.fictional ? '（架空推演）' : ''}——这就是你撞上的那场危机。</p>` : ''}
    <p class="muted">切片用时 ${elapsed} 秒 · 第 ${s.sliceStep + 1} 个决定 / 共 3 个 · 第一个决定在 90 秒内出现（本切片直接开局即是）。</p>
    <div class="card big"><h2>${esc(d.title)}</h2><p>${esc(d.body)}</p>
      <div class="options">${options.map((o, i) => `<button class="opt" data-act="slice-pick" data-id="${i}"><b>${esc(o.text)}</b></button>`).join('')}</div>
    </div>
    <p class="muted">每个决定都会封存并自动保存。承诺 C（${branch === 'employed' ? '裁员应对' : '危机应对'}）兑现从 T10 开始。</p>`);
}

function pickSlice(i) {
  const s = G.state;
  const d = sliceDecisions(s)[s.sliceStep];
  const o = (G.sliceOptions || d.options)[i];
  for (const [k, v] of Object.entries(o.fx)) s.attrs[k] = (s.attrs[k] || 0) + v;
  s.decisions[d.id] = { text: o.text, seal: o.seal };
  if (o.omen) s.omenLog.push({ turn: 9, text: o.omen });
  autosave('决定已封存');
  setScreen(`
    <h1>已封存</h1>
    <div class="card big"><p>${esc(o.seal)}</p><p class="muted">征兆：${esc(o.omen || '')}</p></div>
    <div class="actions"><button class="primary" data-act="slice-next">${s.sliceStep < 2 ? '下一个决定' : '看这一夜的结局'}</button></div>`);
}

function sliceEnd() {
  const s = G.state;
  // v1.0: T9 不是终点，run 不在这里结束——runsFinished 只在 35 岁结算
  // 时 +1（见 screenSettlement）。“再来一次”也只在结算后出现。
  // ---- v1.3 (P0-1): 切片结算与结局渲染分离 ----
  // 补偿/压力只算一次（sliceSettleOnce，flags.sliceResolved 守卫）；
  // 结局渲染是纯函数 renderSliceOutro，刷新后 enterSlice /
  // renderSliceDecision 可直接调它重渲染，不重结算。
  if (s.flags.sliceResolved) return renderSliceOutro(s);
  // v0.8: slice outcome as an enum (laid off / kept / kept via transfer).
  const h2s = s.flags.h2;
  const hrTalk = s.decisions['hr-talk'];
  const triedTransfer = !!(hrTalk && hrTalk.text.includes('转岗'));
  Analytics.track('slice', { outcome: !h2s ? t9Branch(s) : h2s.laidOff ? 'laid_off' : triedTransfer ? 'kept_transfer' : 'kept' });
  sliceSettleOnce(s);
  renderSliceOutro(s);
}

// 切片结算（只跑一次）：补偿/压力/t9Branch。sliceEnd 与 enterSlice
// 的刷新路径都走它；已结算（sliceResolved）时无操作。
// H2 resolution: the layoff die was sealed on entering the slice — read
// it here and apply the compensation. N = 本单位工作年限 × 月薪
// （劳动合同法经济补偿口径，见 engine.js severancePay）；the +1
// 代通知金 depends on the dismissal ground, so it is NOT automatic.
function sliceSettleOnce(s) {
  if (s.flags.sliceResolved) return;
  const h2 = s.flags.h2;
  if (h2) {
    const hr = s.decisions['hr-talk'];
    const triedTransfer = hr && hr.text.includes('转岗');
    const sev = severancePay(s);
    if (h2.laidOff) s.attrs.money += sev.amount;
    else if (triedTransfer) s.attrs.stress = Math.max(0, s.attrs.stress - 5);
    else s.attrs.stress += 5;
  }
  s.flags.t9Branch = t9Branch(s);
  s.flags.slicePhase = 'completed';
  s.flags.sliceResolved = true;
  autosave('切片结束');
}
// 结局屏（纯渲染）：结算结果、背景、决定回放、征兆回放、当前状态。
// 刷新后 enterSlice / renderSliceDecision 可直接调它重渲染，不重结算。
function renderSliceOutro(s) {
  const h2Card = sliceOutcomeCard(s);
  const decs = sliceDecisions(s).map((d) => {
    const got = s.decisions[d.id];
    return `<p><b>${esc(d.title)}</b><br>${got ? esc(got.text) + '——' + esc(got.seal) : '未决定'}</p>`;
  }).join('');
  // P1 (a): the crisis background + the branch this night puts the
  // player on. The branch only shapes the aftermath; the H2 die was
  // sealed when the slice was entered.
  const crisis = s.flags.t9Crisis;
  const branch = s.flags.t9Branch || t9Branch(s);
  const crisisCard = crisis ? `<div class="card"><h2>这一夜的背景</h2><p>${crisis.crisisYear} 年${esc(crisis.label)}${crisis.fictional ? '（架空推演）' : ''}。这一夜之后，你走的是「${esc(T9_BRANCH_LABEL[branch] || branch)}」这条线。</p></div>` : '';
  const omens = s.omenLog.filter((o) => o.turn === 9).map((o) => o.text).join(' ');
  const outro = sliceBranch(s) === 'employed' ? T9_SLICE.outro : '三件事都决定了。承诺 C（危机应对）已经封存，兑现从 T10 开始。至于这一夜的危机——三个决定只定应对，不定结果。';
  setScreen(`
    <h1>切片结束 · 26 岁这一夜</h1>
    <p class="intro">${esc(outro)}</p>
    ${h2Card}
    ${crisisCard}
    <div class="card">${decs}</div>
    <div class="card"><h2>征兆回放</h2><p>${esc(omens || '今夜没有征兆。')}</p></div>
    <div class="card"><h2>你的状态</h2>
      <p>钱 ${s.attrs.money} 万 · 健康 ${s.attrs.health} · 压力 ${s.attrs.stress}（${pressureTier(s.attrs.stress).name}）· 家庭线 ${s.attrs.family} · Debt ${s.attrs.debt}</p>
      <p class="muted">执念：${s.obsessions.map((id) => (OBSESSIONS.find((o) => o.id === id) || {}).name).join('、') || '未选'}</p>
    </div>
    <p class="muted">承诺 C（${sliceBranch(s) === 'employed' ? '裁员应对' : '危机应对'}）兑现从 T10 开始。35 岁结算后才出现「再来一次」（解锁 S4 改写入口与并行周目位）——结算前没有改写入口。</p>
    <div class="actions">
      <button class="primary" data-act="year-next" data-id="10">进入 T10 · 27 岁</button>
      <button data-act="export">导出存档码</button>
      <button data-act="title">回到标题</button>
    </div>`);
}

// 结局卡（纯计算，不改属性）：H2 判定卡 + 非雇员分支卡。
function sliceOutcomeCard(s) {
  const h2 = s.flags.h2;
  if (h2) {
    const hr = s.decisions['hr-talk'];
    const triedTransfer = hr && hr.text.includes('转岗');
    const sev = severancePay(s);
    if (h2.laidOff) {
      return `<div class="card"><h2>裁员判定：你被裁了</h2><p>进切片时封存的骰子：掷出 ${h2.roll} ≤ ${h2.chance}（H2 裁员概率）。${sev.basis}，N = ${sev.amount} 万到账。${triedTransfer ? '你争取过转岗，但没有真实岗位空出来。' : ''}代通知金是否另算，取决于解除情形——谈话里你问清楚了没有？</p></div>`;
    }
    if (triedTransfer) {
      return `<div class="card"><h2>裁员判定：岗位保住了</h2><p>进切片时封存的骰子：掷出 ${h2.roll} > ${h2.chance}（H2 裁员概率）。你不在这一批名单里。转岗谈成了——转到了新项目组，压力 −5。</p></div>`;
    }
    return `<div class="card"><h2>裁员判定：岗位保住了</h2><p>进切片时封存的骰子：掷出 ${h2.roll} > ${h2.chance}（H2 裁员概率）。你不在这一批名单里，但项目被砍了，压力 +5。</p></div>`;
  }
  // v1.2 (P0-7): 非雇员没有 H2——这一夜没有裁员骰，不领补偿，
  // 走的是危机分支；三个决定只定应对，不定结果。
  const branch = t9Branch(s);
  const crisisLine = branch === 'startup' ? '账上的钱只剩三个月，三个决定只定应对，不定结果。'
    : branch === 'grad' ? '论文和毕业压在眼前，三个决定只定应对，不定结果。'
    : branch === 'freelance' ? '大客户断约，三个决定只定应对，不定结果。'
    : branch === 'public' ? '考核与轮岗才是这一夜的主题，三个决定只定应对，不定结果。'
    : '三个决定只定应对，不定结果。';
  // v1.4.2：体制内分支的结局卡不写裁员 / 解雇 / 补偿 / 劳动合同法。
  if (branch === 'public') {
    return `<div class="card"><h2>这一夜没有那颗骰子</h2><p>体制内走考核与轮岗，H2 不适用。走的是「${esc(T9_BRANCH_LABEL[branch] || branch)}」这条线：${crisisLine}</p></div>`;
  }
  return `<div class="card"><h2>这一夜没有裁员骰</h2><p>你没有雇主，H2 不适用。走的是「${esc(T9_BRANCH_LABEL[branch] || branch)}」这条线：${crisisLine}</p></div>`;
}

// ---------- global actions ----------
function exportSave() {
  const code = exportCode(G.state);
  setScreen(`<h1>存档码</h1><p class="intro">种子与封存骰都在码里，导入后一模一样。自己备份，别发给别人。</p>
    <textarea rows="6" readonly onclick="this.select()">${esc(code)}</textarea>
    <div class="actions"><button class="primary" data-act="back">返回</button></div>`);
}

function importSave() {
  setScreen(`<h1>导入存档码</h1><p class="muted">将导入到 ${G.pickedSlot} 号位（在标题页点周目位可切换目标槽位）。导入不会覆盖其他号位。</p><textarea id="import-code" rows="6" placeholder="粘贴 QILU1- 开头的存档码"></textarea>
    <div class="actions"><button class="primary" data-act="import-do">导入</button><button data-act="back">返回</button></div>`);
}

function doImport() {
  const code = $('#import-code').value;
  const r = importCode(code);
  if (!r.ok) { alert(r.error); return; }
  // ---- v1.3 (P0-4 of the 2026-11-20 re-review): 导入写进用户当前
  // 选定的目标槽位，不信任存档自身的 slot 字段——2 号位导入 1 号位
  // 的存档，不得覆盖 1 号位。存档码里的 slot 只作导出时的记录。
  const targetSlot = G.pickedSlot || 1;
  r.state.slot = targetSlot;
  G.state = r.state;
  G.rng = makeRng(r.state.seed);
  G.rng.setState(r.state.rngState || r.state.seed);
  G.pickedSlot = targetSlot;
  autosave('已导入到 ' + targetSlot + ' 号位');
  alert('导入成功，已保存到 ' + targetSlot + ' 号位。');
  screenTitle();
}

// v0.3: idea confirm screen. G.pendingIdea = { text, archId, themes,
//   explanation, aiReviewing, aiVerdict: null | {reasonable, archetypeId,
//   cost, reason}, aiError: '', nonVenture: '' | kind, nonVentureReason: '' }.
// AI review is opt-in: only when the player taps 请 AI 审核 is the idea
// (plus their explanation) sent to a free keyless AI endpoint; the verdict
// is the FINAL result — it sets the archetype and startup cost. If the
// verdict says the idea does not hold up, direct start is closed and the
// player either revises or validates for free. If the AI cannot be reached,
// the keyword result stands and the screen says so.
// v0.7.1: non-venture inputs (engine.js nonVentureReason — e.g. asking
// family for money to buy a house) never reach this archetype panel: they
// get the "这不是一条创业线" panel instead (renderNonVentureConfirm),
// with no direct start and no validation — only AI appeal, note, or back.
// A reasonable AI verdict re-opens the normal panel below.
function renderIdeaConfirm() {
  const p = G.pendingIdea;
  if (!p) return;
  if (p.nonVenture && !(p.aiVerdict && p.aiVerdict.reasonable)) { renderNonVentureConfirm(p); return; }
  const arch = VENTURE_ARCHETYPES.find((x) => x.id === p.archId) || VENTURE_ARCHETYPES[0];
  const archOptions = VENTURE_ARCHETYPES.map((a) => `<option value="${a.id}" ${a.id === arch.id ? 'selected' : ''}>${esc(a.name)}（启动 ${a.cost} 万）</option>`).join('');
  const v = p.aiVerdict;
  let verdictHtml = '';
  if (p.aiReviewing) {
    verdictHtml = '<p class="muted">AI 审核中，请稍等…</p>';
  } else if (v && v.reasonable) {
    const va = VENTURE_ARCHETYPES.find((x) => x.id === v.archetypeId) || arch;
    verdictHtml = `<p class="ai-verdict ok">AI 审核通过：归类为 <b>${esc(va.name)}</b>，启动成本 <b>${v.cost} 万</b>（AI 定）。理由：${esc(v.reason)}</p>`;
  } else if (v && !v.reasonable) {
    verdictHtml = `<p class="ai-verdict no">AI 觉得这条线不太成立：${esc(v.reason)}直接开线已关闭，你可以改想法，或者先做免费验证。</p>`;
  } else if (p.aiError) {
    verdictHtml = `<p class="muted">AI 没连上（${esc(p.aiError)}），先按关键词分类开线。</p>`;
  }
  const canDirect = !(v && !v.reasonable);
  // v1.2 (P1-5): 年代不匹配时，没有默认选项——玩家必须在三个回应里
  // 选一个，选完才确认：adapt（换成当时能用的技术，现在就开）、
  // defer（先记下来，等技术出现再开——不创建项目，不剧透未来年份
  // 或技术）、variant（先免费验证一个当时能做的简化版）。“就按我
  // 写的来”不再是默认——那样会悄悄创建年代不存在的成熟产品。
  let eraHtml = '';
  if (p.eraAdapt && p.eraAdapt.needed) {
    eraHtml = `<p class="warn">年代提醒：你写的「${esc(p.eraAdapt.requested.join('、'))}」在 ${p.eraYear} 年还不存在。当时能用的是：${esc(p.eraAdapt.available.join('、'))}。你的原意不变，只换技术——换还是不换、怎么换，你定。</p>
      <p>年代适配（三选一）：</p>
      <div class="options">
        <button class="opt" data-act="idea-era" data-id="adapt" ${canDirect ? '' : 'disabled'}><b>换成当时能用的技术，现在就开</b><span>原意不变，只换技术。启动费照算。</span></button>
        <button class="opt" data-act="idea-era" data-id="variant"><b>先免费验证一个当时能做的简化版</b><span>不花钱，先验证能做的那部分。</span></button>
        <button class="opt" data-act="idea-era" data-id="defer"><b>先记下来，等技术出现再开</b><span>不创建项目，不花钱；技术出现那年系统会提醒你。</span></button>
      </div>`;
  }
  setScreen(`
    <h1>确认一下这条线</h1>
    <div class="card big">
      <p>你的原话：“${esc(p.text)}”</p>
      <p>系统识别为：<b>${esc(arch.name)}</b>${p.themes.length ? ' · 主题：' + p.themes.map((t) => esc(t)).join('、') : ''}</p>
      ${eraHtml}
      <p>如果分错了，换一个：<select id="idea-arch">${archOptions}</select></p>
      <p id="idea-arch-detail"></p>
      ${verdictHtml}
      <p>想跟 AI 说明合理性？写一句补充（可选）：<br><textarea id="idea-why" rows="2" placeholder="比如：身边真有人为改简历付费，我自己改过 20 份。">${esc(p.explanation || '')}</textarea></p>
      <p class="muted">点“请 AI 审核”会把点子和补充说明发给一个免费 AI 接口（不用登录、不用付费），由它定最终的分法和启动费；不点就按关键词分类开线。</p>
    </div>
    <div class="actions">
      <button data-act="idea-ai-review">请 AI 审核</button>
      ${canDirect && !(p.eraAdapt && p.eraAdapt.needed) ? '<button class="primary" data-act="idea-confirm">确认开始</button>' : ''}
      ${!(p.eraAdapt && p.eraAdapt.needed) ? '<button data-act="idea-validate">先做免费验证</button>' : ''}
      <button data-act="idea-note">先记下来</button>
      <button data-act="idea-back">返回改想法</button>
    </div>`);
  const updateDetail = () => {
    const sel = $('#idea-arch');
    const a = VENTURE_ARCHETYPES.find((x) => x.id === (sel ? sel.value : arch.id)) || arch;
    const el = $('#idea-arch-detail');
    if (!el) return;
    const aiCost = (v && v.reasonable && a.id === v.archetypeId) ? v.cost : null;
    el.innerHTML = `启动 ${aiCost !== null ? aiCost + ' 万（AI 定）' : a.cost + ' 万'} · 风险：${esc(a.risk)}<br>先验证（免费）：${esc(a.validation)}<br>里程碑：${a.milestones.map((m, i) => `${i + 1}. ${esc(m.name)}`).join('；')}<br>跑通后每年：${esc(rewardText(a.running))}`;
  };
  const selEl = $('#idea-arch');
  if (selEl) selEl.addEventListener('change', updateDetail);
  updateDetail();
}

// v0.7.1: the "not a venture" panel. Reached when engine.js
// nonVentureReason flags the input and no reasonable AI verdict has
// overridden it. No archetype dropdown, no direct start, no free
// validation — those make no sense for a non-business idea. The player can
// appeal to the AI (its reasonable=true verdict re-opens the normal panel),
// note the idea down, or go back and rewrite it.
function renderNonVentureConfirm(p) {
  const v = p.aiVerdict;
  let verdictHtml = '';
  if (p.aiReviewing) {
    verdictHtml = '<p class="muted">AI 审核中，请稍等…</p>';
  } else if (v && !v.reasonable) {
    verdictHtml = `<p class="ai-verdict no">AI 也这么看：${esc(v.reason)}</p>`;
  } else if (p.aiError) {
    verdictHtml = `<p class="muted">AI 没连上（${esc(p.aiError)}），先按本地判断。</p>`;
  }
  setScreen(`
    <h1>这不是一条创业线</h1>
    <div class="card big">
      <p>你的原话：“${esc(p.text)}”</p>
      <p>系统判断：<b>这不是创业点子</b> —— ${esc(p.nonVentureReason || '')}</p>
      <p>创业线要说清三件事：卖什么、卖给谁、怎么收费。直接开线的话，里程碑和每年收入都对不上号。</p>
      ${verdictHtml}
      <p>不服这个判断？写一句补充（可选）：<br><textarea id="idea-why" rows="2" placeholder="比如：我打算把房子租出去收租。">${esc(p.explanation || '')}</textarea></p>
      <p class="muted">点“请 AI 审核”会把点子和补充说明发给一个免费 AI 接口（不用登录、不用付费），由它定这到底是不是一条能开的线；AI 说能开，就按它的分法开线。</p>
    </div>
    <div class="actions">
      <button data-act="idea-ai-review">请 AI 审核</button>
      <button data-act="idea-note">先记下来</button>
      <button data-act="idea-back">返回改想法</button>
    </div>`);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const id = el.dataset.id;
  switch (act) {
    case 'obsession': {
      if (G.pickedObsessions.has(id)) G.pickedObsessions.delete(id);
      else if (G.pickedObsessions.size < 2) G.pickedObsessions.add(id);
      else { alert('执念最多选 2 条。'); return; }
      refreshChips();
      break;
    }
    case 'difficulty': G.pickedDifficulty = id; refreshChips(); break;
    case 'slot': {
      // v1.2 (P1-8): 切换周目位重渲染标题（刷新各槽存档状态与继续按钮），
      // 但要保住已选的执念与难度——screenTitle 会把它们清零。
      const obs = [...G.pickedObsessions], diff = G.pickedDifficulty, slot = Number(id);
      G.pickedSlot = slot;
      screenTitle();
      G.pickedObsessions = new Set(obs);
      G.pickedDifficulty = diff;
      G.pickedSlot = slot;
      refreshChips();
      break;
    }
    case 'start': startNew('full'); break;
    case 'slice': startNew('slice'); break;
    case 'continue': {
      const s = loadGame(G.pickedSlot);
      if (!s) break;
      G.state = s;
      G.rng = makeRng(s.seed);
      G.rng.setState(s.rngState || s.seed);
      if (s.turn === 0) screenDice();
      else if (s.turn === 1) screenT1();
      else if (s.turn === 9) enterSlice(false);
      else if (s.finished) screenSettlement();
      else if (s.turn === 18) screenT18();
      else startYear(s.turn);
      break;
    }
    case 'to-fragments': screenFragments(); break;
    case 'to-transition':
      if (G.state.runNumber > 1 && !G.state.flags.usedRewrite && G.state.turn === 0) screenRewrite();
      else screenTransition();
      break;
    case 'transition-next': window.__transitionNext && window.__transitionNext(); break;
    case 'rewrite-apply': applyRewrite(); break;
    case 'rewrite-keep':
      G.state.flags.acceptedFate = true;
      autosave('就这样，已记录');
      screenTransition();
      break;
    case 'era-year-pick': pickEraYear(id); break;
    case 't1-region-pick': pickT1Region(id); break;
    case 't1-era-region-pick': screenT1Track(id); break;
    case 't1-track-pick': {
      const [regionId, track] = String(id).split('|');
      pickT1Track(regionId, track);
      break;
    }
    case 't1-fallback': {
      // P1 (e): 落榜调剂校外 — one rung below the lowest tier in the
      // row, k −0.15. The major stays the intended one; the tier drops.
      if (id === 'offcampus') {
        const s = G.state;
        const oc = offCampusFallback((s.flags.gaokao && s.flags.gaokao.row) || {});
        s.major = { name: s.major ? s.major.name : '（待定）', source: 'self', tier: oc.tier };
        s.flags.majorK = oc.k;
        s.flags.offCampus = true;
        s.flags.fallbackChoice = 'offcampus';
        if (s.commitments.A) {
          s.commitments.A.text = '志愿：' + s.major.name + '（调剂校外 · ' + oc.tier + '，k = ' + oc.k + '）';
          s.commitments.A.snapshot.tier = oc.tier;
          s.commitments.A.snapshot.k = oc.k;
        }
        autosave('落榜去向：调剂校外');
        startYear(2);
        break;
      }
      G.state.flags.fallbackChoice = id;
      autosave('落榜去向：' + id);
      startYear(2);
      break;
    }
    case 't1-major-chip': {
      const inp = $('#t1-major');
      if (inp) inp.value = id;
      G.t1MajorDraft = id;
      updateT1MajorLine();
      break;
    }
    case 't1-diagnose': G.t1Diagnosing = true; screenT1(); break;
    case 't1-diag-close': G.t1Diagnosing = false; screenT1(); break;
    case 't1-diag-major': {
      // Re-evaluation: switch the major, keep the panel open, score untouched.
      const inp = $('#t1-major');
      if (inp) inp.value = id;
      G.t1MajorDraft = id;
      screenT1();
      break;
    }
    case 't1-pick': draftT1(id); break;
    case 't1-confirm': if (G.t1DraftChoice) pickT1(G.t1DraftChoice); break;
    case 't1-redraft': G.t1DraftChoice = null; G.t1DraftMajor = null; G.state.flags.t1ChoiceMade = false; screenT1(); break;
    case 'year-start': startYear(2); break;
    case 'year-next': startYear(Number(id)); break;
    case 'event-pick': pickEvent(Number(id)); break;
    case 'idea-deferred-open': {
      // v1.2 (P1-5): 延期点子到期——重新走 idea-confirm（时代检查现在
      // 会通过），确认后才创建项目；这张卡本身不创建任何东西。
      const idx = Number(id);
      const note = (G.state.ideaNotes || [])[idx];
      if (!note) break;
      const text = note.originalIdea || note.text || '';
      const arch = classifyVenture(text, VENTURE_ARCHETYPES);
      const nv = nonVentureReason(text, VENTURE_ARCHETYPES);
      const themes = ventureThemes(text, THEME_KEYWORDS);
      const eraYear = eraContextFor(G.state, G.state.turn).calendarYear;
      const eraAdapt = adaptVentureTech(text, eraYear);
      G.pendingIdea = { text, archId: arch.id, themes, explanation: '', aiReviewing: false, aiVerdict: null, aiError: '', nonVenture: nv ? nv.kind : '', nonVentureReason: nv ? nv.reason : '', eraAdapt, eraYear, eraAdaptChoice: null, deferredNoteIdx: idx };
      renderIdeaConfirm();
      break;
    }
    case 'idea-start': {
      const text = ($('#idea-text').value || '').trim();
      if (text.length < 2) { alert('先写一句你的点子。'); break; }
      const arch = classifyVenture(text, VENTURE_ARCHETYPES);
      // v0.7.1: non-venture inputs are flagged first — they get the
      // "这不是一条创业线" panel, never the archetype picker.
      const nv = nonVentureReason(text, VENTURE_ARCHETYPES);
      const themes = ventureThemes(text, THEME_KEYWORDS);
      // v1.1 (b): the era adapter runs here — the venture's calendar year
      // comes from eraContextFor (examYear + turn − 1), and adaptVentureTech
      // detects tech that did not exist yet. Nothing is overwritten here;
      // the confirm screen shows the mismatch and the player chooses.
      const eraYear = eraContextFor(G.state, G.state.turn).calendarYear;
      const eraAdapt = adaptVentureTech(text, eraYear);
      G.pendingIdea = { text, archId: arch.id, themes, explanation: '', aiReviewing: false, aiVerdict: null, aiError: '', nonVenture: nv ? nv.kind : '', nonVentureReason: nv ? nv.reason : '', eraAdapt, eraYear, eraAdaptChoice: null };
      renderIdeaConfirm();
      break;
    }
    case 'idea-ai-review': {
      const p = G.pendingIdea;
      if (!p || p.aiReviewing) break;
      const why = $('#idea-why');
      if (why) p.explanation = why.value.trim().slice(0, 200);
      p.aiReviewing = true;
      renderIdeaConfirm();
      const guess = VENTURE_ARCHETYPES.find((x) => x.id === p.archId) || VENTURE_ARCHETYPES[0];
      reviewVentureWithAI(p.text, p.explanation, VENTURE_ARCHETYPES, guess).then((res) => {
        if (!G.pendingIdea || G.pendingIdea.text !== p.text) return;
        G.pendingIdea.aiReviewing = false;
        if (res.ok) {
          G.pendingIdea.aiVerdict = res.verdict;
          G.pendingIdea.aiError = '';
          if (res.verdict.reasonable && res.verdict.archetypeId) G.pendingIdea.archId = res.verdict.archetypeId;
        } else {
          G.pendingIdea.aiVerdict = null;
          G.pendingIdea.aiError = res.error;
        }
        renderIdeaConfirm();
      });
      break;
    }
    case 'idea-era': {
      // v1.2 (P1-5): 年代不匹配的三回应。adapt / variant 创建或验证的
      // 是“当时能做的技术”；defer 不创建项目——只记一条延期笔记，
      // 技术出现那年再提醒，措辞不剧透未来年份或技术。
      const p = G.pendingIdea;
      if (!p || !p.eraAdapt || !p.eraAdapt.needed) break;
      if (p.nonVenture && !(p.aiVerdict && p.aiVerdict.reasonable)) { alert('系统判断这不是一条创业线：先改想法，或者请 AI 审核。'); break; }
      if (id === 'adapt' && p.aiVerdict && !p.aiVerdict.reasonable) { alert('AI 觉得这条线不太成立：先改想法，或者先做免费验证。'); break; }
      const selE = $('#idea-arch');
      const selValE = selE && selE.value;
      const archE = VENTURE_ARCHETYPES.find((x) => x.id === (selValE || p.archId)) || VENTURE_ARCHETYPES[0];
      const textE = p.text || '';
      const vE = p.aiVerdict;
      const eraNote = `${p.eraAdapt.requested.join('、')} 在 ${p.eraYear} 年还不存在，已换成当时能用的技术：${p.eraAdapt.available.join('、')}`;
      if (id === 'defer') {
        G.state.ideaNotes = G.state.ideaNotes || [];
        G.state.ideaNotes.push({ turn: G.state.turn, text: textE.slice(0, 200), deferred: true, deferredUntil: p.eraAdapt.deferUntil || null, originalIdea: textE.slice(0, 200) });
        G.state.flags.eventChoice = '赚钱点子 → 先记下来了，等技术出现再开';
        autosave('点子已记下（延期）');
        setScreen(`
          <h1>先记下来了</h1>
          <div class="card big"><p>“${esc(textE.slice(0, 60))}”——这项技术现在还不存在，先记下来，等它出现的时候，你的点子还在，系统会提醒你。</p>
          <p class="muted">没有悄悄开线：项目没创建，不花钱，不占里程碑。等技术出现的那一年再开。</p></div>
          <div class="actions"><button class="primary" data-act="year-refresh">回到今年</button></div>`);
        G.pendingIdea = null;
        break;
      }
      const optsE = { eraAdapted: true, eraTechNote: eraNote };
      if (vE && vE.reasonable && archE.id === vE.archetypeId) { optsE.aiReviewed = true; optsE.aiNote = vE.reason; if (id === 'adapt') { optsE.costOverride = vE.cost; } }
      if (id === 'variant') optsE.validateOnly = true;
      const rE = startVenture(G.state, textE, archE, optsE);
      if (!rE.ok) { alert(rE.error); break; }
      const vvE = rE.venture;
      Analytics.track('venture_start', { archetype: archE.id });
      if (id === 'adapt') {
        G.state.flags.eventChoice = '赚钱点子 → 年代适配后开始了「' + vvE.name + '」';
        G.state.omenLog.push({ turn: G.state.turn, text: '你写下第一行计划的那天晚上，停电了。' });
        autosave('专属线已生成（年代适配）');
        setScreen(`
          <h1>专属线已生成</h1>
          <div class="card big"><h2>${esc(vvE.name)}</h2>
            <p>${esc(archE.name)} · 启动 ${vvE.cost} 万已付 · 风险：${esc(archE.risk)}</p>
            ${vvE.aiReviewed ? `<p>AI 审核：${esc(vvE.aiNote)}</p>` : ''}
            <p>年代适配：${esc(vvE.eraTechNote)}</p>
            <p>里程碑：${archE.milestones.map((m, i) => `${i + 1}. ${esc(m.name)}（${esc(rewardText(m.reward))}）`).join('；')}</p>
            <p>跑通后每年：${esc(rewardText(archE.running))}。</p>
            <p class="muted">你的原话写进了这条线：“${esc(vvE.text.slice(0, 60))}”。每年花 1 AP 推进，推进那一刻就封存结果，结算时只读档。</p>
          </div>
          <div class="actions"><button class="primary" data-act="year-refresh">回到今年</button></div>`);
      } else {
        G.state.flags.eventChoice = '赚钱点子 → 年代适配后开始验证「' + vvE.name + '」';
        autosave('验证已开始（年代适配）');
        setScreen(`
          <h1>验证开始了</h1>
          <div class="card big"><h2>${esc(vvE.name)}</h2>
            <p>验证中，不花钱：${esc(archE.validation)}</p>
            ${vvE.aiReviewed ? `<p>AI 审核：${esc(vvE.aiNote)}</p>` : ''}
            <p>年代适配：${esc(vvE.eraTechNote)}</p>
            <p class="muted">每年花 1 AP 推进验证，通过后再付启动费 ${vvE.cost} 万正式开干。你的原话：“${esc(vvE.text.slice(0, 60))}”。</p>
          </div>
          <div class="actions"><button class="primary" data-act="year-refresh">回到今年</button></div>`);
      }
      G.pendingIdea = null;
      break;
    }
    case 'idea-confirm': {
      // v0.7.1: defense in depth — the non-venture panel renders no
      // confirm button, but a stale click must never start such a line.
      const p0 = G.pendingIdea;
      if (p0 && p0.nonVenture && !(p0.aiVerdict && p0.aiVerdict.reasonable)) { alert('系统判断这不是一条创业线：先改想法，或者请 AI 审核。'); break; }
      const sel = $('#idea-arch');
      // v0.7.1: an empty select value must fall back to the pending idea's
      // archetype, not to archetypes[0] — the old `sel ? sel.value : ...`
      // form silently switched the line to ai-tool whenever the select
      // held no value (caught by test-v10 NONVENTURE-28).
      const selVal = sel && sel.value;
      const arch = VENTURE_ARCHETYPES.find((x) => x.id === (selVal || (G.pendingIdea && G.pendingIdea.archId))) || VENTURE_ARCHETYPES[0];
      const text = (G.pendingIdea && G.pendingIdea.text) || '';
      const v = G.pendingIdea && G.pendingIdea.aiVerdict;
      const opts = {};
      if (v && v.reasonable && arch.id === v.archetypeId) {
        opts.costOverride = v.cost;
        opts.aiReviewed = true;
        opts.aiNote = v.reason;
      }
      // v1.1 (b): only when the player picked "adapt" on the era panel —
      // keep is the default, and the note records what was swapped.
      const eraSel = $('#idea-era-adapt');
      if (G.pendingIdea && G.pendingIdea.eraAdapt && G.pendingIdea.eraAdapt.needed && eraSel && eraSel.value === 'adapt') {
        opts.eraAdapted = true;
        opts.eraTechNote = `${G.pendingIdea.eraAdapt.requested.join('、')} 在 ${G.pendingIdea.eraYear} 年还不存在，已换成当时能用的技术：${G.pendingIdea.eraAdapt.available.join('、')}`;
      }
      const r = startVenture(G.state, text, arch, opts);
      if (!r.ok) { alert(r.error); break; }
      const vv = r.venture;
      Analytics.track('venture_start', { archetype: arch.id });
      G.state.flags.eventChoice = '赚钱点子 → 开始了「' + vv.name + '」';
      G.state.omenLog.push({ turn: G.state.turn, text: '你写下第一行计划的那天晚上，停电了。' });
      autosave('专属线已生成');
      setScreen(`
        <h1>专属线已生成</h1>
        <div class="card big"><h2>${esc(vv.name)}</h2>
          <p>${esc(arch.name)} · 启动 ${vv.cost} 万已付 · 风险：${esc(arch.risk)}</p>
          ${vv.aiReviewed ? `<p>AI 审核：${esc(vv.aiNote)}</p>` : ''}
          ${vv.eraAdapted ? `<p>年代适配：${esc(vv.eraTechNote)}</p>` : ''}
          <p>里程碑：${arch.milestones.map((m, i) => `${i + 1}. ${esc(m.name)}（${esc(rewardText(m.reward))}）`).join('；')}</p>
          <p>跑通后每年：${esc(rewardText(arch.running))}。</p>
          <p class="muted">你的原话写进了这条线：“${esc(vv.text.slice(0, 60))}”。每年花 1 AP 推进，推进那一刻就封存结果，结算时只读档。</p>
        </div>
        <div class="actions"><button class="primary" data-act="year-refresh">回到今年</button></div>`);
      G.pendingIdea = null;
      break;
    }
    case 'idea-validate': {
      // v0.7.1: same guard as idea-confirm — validating a non-venture
      // makes no sense either (there is nothing to validate for free).
      const p0v = G.pendingIdea;
      if (p0v && p0v.nonVenture && !(p0v.aiVerdict && p0v.aiVerdict.reasonable)) { alert('系统判断这不是一条创业线：先改想法，或者请 AI 审核。'); break; }
      const sel = $('#idea-arch');
      const selVal = sel && sel.value;
      const arch = VENTURE_ARCHETYPES.find((x) => x.id === (selVal || (G.pendingIdea && G.pendingIdea.archId))) || VENTURE_ARCHETYPES[0];
      const text = (G.pendingIdea && G.pendingIdea.text) || '';
      const v = G.pendingIdea && G.pendingIdea.aiVerdict;
      const opts = { validateOnly: true };
      if (v && v.reasonable && arch.id === v.archetypeId) {
        opts.aiReviewed = true;
        opts.aiNote = v.reason;
      }
      // v1.1 (b): same era choice as idea-confirm — adapt only when the
      // player picked it on the era panel.
      const eraSelV = $('#idea-era-adapt');
      if (G.pendingIdea && G.pendingIdea.eraAdapt && G.pendingIdea.eraAdapt.needed && eraSelV && eraSelV.value === 'adapt') {
        opts.eraAdapted = true;
        opts.eraTechNote = `${G.pendingIdea.eraAdapt.requested.join('、')} 在 ${G.pendingIdea.eraYear} 年还不存在，已换成当时能用的技术：${G.pendingIdea.eraAdapt.available.join('、')}`;
      }
      const r = startVenture(G.state, text, arch, opts);
      if (!r.ok) { alert(r.error); break; }
      const vv = r.venture;
      Analytics.track('venture_start', { archetype: arch.id });
      G.state.flags.eventChoice = '赚钱点子 → 开始验证「' + vv.name + '」';
      autosave('验证已开始');
      setScreen(`
        <h1>验证开始了</h1>
        <div class="card big"><h2>${esc(vv.name)}</h2>
          <p>验证中，不花钱：${esc(arch.validation)}</p>
          ${vv.aiReviewed ? `<p>AI 审核：${esc(vv.aiNote)}</p>` : ''}
          ${vv.eraAdapted ? `<p>年代适配：${esc(vv.eraTechNote)}</p>` : ''}
          ${v && !v.reasonable ? `<p>AI 的看法：${esc(v.reason)}</p>` : ''}
          <p class="muted">每年花 1 AP 推进验证，通过后再付启动费 ${vv.cost} 万正式开干。你的原话：“${esc(vv.text.slice(0, 60))}”。</p>
        </div>
        <div class="actions"><button class="primary" data-act="year-refresh">回到今年</button></div>`);
      G.pendingIdea = null;
      break;
    }
    case 'idea-back': G.pendingIdea = null; startYearRefresh(); break;
    case 'idea-note': {
      const text = ((G.pendingIdea && G.pendingIdea.text) || ($('#idea-text') ? $('#idea-text').value : '') || '').trim();
      if (text.length < 2) { alert('先写一句你的点子。'); break; }
      G.state.ideaNotes = G.state.ideaNotes || [];
      G.state.ideaNotes.push({ turn: G.state.turn, text: text.slice(0, 200) });
      G.state.flags.eventChoice = '赚钱点子 → 先记下来了';
      G.pendingIdea = null;
      autosave('点子已记下');
      startYearRefresh();
      break;
    }
    case 'venture-advance': {
      const s = G.state;
      const v = (s.ventures || []).find((x) => x.status === 'active' || x.status === 'validating');
      if (!v || s.ap < 1 || s.flags.advancedVenture) break;
      const arch = VENTURE_ARCHETYPES.find((a) => a.id === v.archetype);
      s.ap -= 1;
      s.attrs.stress += 3;
      s.flags.advancedVenture = v.id;
      if (arch) {
        // Seal the die NOW: the settlement only reads it, never re-rolls.
        const chance = ventureChance(s, arch);
        const roll = G.rng.int(1, 100);
        v.sealed = { roll, chance, stage: v.stage, success: roll <= chance };
        s.rngState = G.rng.getState();
      }
      s.yearActions.push('推进项目：' + v.name);
      autosave();
      startYearRefresh();
      break;
    }
    case 'year-refresh': startYearRefresh(); break;
    case 'action': applyAction(id); break;
    case 'year-end': endYear(); break;
    case 't5-pick': pickT5(id); break;
    case 't5-sector-pick': pickT5Sector(id); break;
    case 't5-subsector-pick': pickT5Subsector(id); break;
    // v1.4.2：体制内入职考试流程。
    case 'exam-type': pickCivilExamType(id); break;
    case 'exam-province': pickCivilExamProvince(id); break;
    case 'exam-position': pickCivilExamPosition(id); break;
    case 'exam-confirm': screenCivilExamWritten(); break;
    case 'exam-written': resolveCivilExamWritten(); break;
    case 'exam-interview': resolveCivilExamInterview(); break;
    case 'exam-hire': civilExamHire(); break;
    case 'exam-back': if (G.examDraft && G.examDraft.type === 'provincial') screenCivilExamProvince(); else screenCivilExamType(); break;
    case 'exam-back-type': screenCivilExamType(); break;
    case 'exam-back-position': screenCivilExamPosition(); break;
    case 'exam-fail-repick': screenCivilExamPosition(); break;
    case 'exam-fail-retype': G.examDraft = { type: null, provinceId: null, positionId: null }; screenCivilExamType(); break;
    case 'exam-quit': G.examDraft = null; screenT5(); break;
    case 'shengben-t5': if (attemptShengben(G.state, G.rng, 0)) screenT5(); break;
    case 'shengben-year': if (attemptShengben(G.state, G.rng, 1)) startYearRefresh(); break;
    case 'transfer-major': if (attemptTransferMajor(G.state, G.rng)) startYearRefresh(); break;
    // v1.4.2：考证学习 + 官场诱惑。
    case 'cert-study': if (certStudy(G.state, id)) startYearRefresh(); break;
    case 'tempt-moonlight': acceptMoonlight(G.state); startYearRefresh(); break;
    case 'tempt-xiahai': acceptXiahai(G.state); startYearRefresh(); break;
    case 'tempt-decline': declineTemptation(G.state); startYearRefresh(); break;
    case 't6-pick': pickT6(id); break;
    case 't12-intimate': G.t12Intimate = id; if (id === 'single') G.t12Cost = 'none'; screenT12(); break;
    case 't12-boundary': {
      G.t12Boundary = id;
      // v1.4：非双缺席出身里父母就是养育者，断亲即全断，目标自动为
      // all；双缺席出身必须在屏上另选目标，否则不许签字。
      if (id === 'estranged' && !(G.state.origin && G.state.origin.familyKey === 'absentBoth')) G.t12Scope = 'all';
      else if (id !== 'estranged') G.t12Scope = null;
      screenT12();
      break;
    }
    case 't12-scope': G.t12Scope = id; screenT12(); break;
    case 't12-cost': G.t12Cost = id; screenT12(); break;
    case 't12-confirm': signT12(); break;
    case 't14-pick': pickT14(id); break;
    case 't16-pick': pickT16(id); break;
    case 't18-pick': pickT18(id); break;
    case 't18-settle': screenSettlement(); break;
    case 'kindness-accept': kindnessAccept(G.state); resumeYear(G.state.turn); break;
    case 'kindness-defer': kindnessDefer(G.state); resumeYear(G.state.turn); break;
    case 'kindness-decline': kindnessDecline(G.state); resumeYear(G.state.turn); break;
    case 'drill-lobby': G.drillReturn = 'title'; screenDrillLobby(); break;
    case 'drill-lobby-year': G.drillReturn = 'year'; screenDrillLobby(); break;
    case 'drill-start': screenDrill(id); break;
    case 'drill-back': {
      if (G.drillReturn === 'year' && G.state) resumeYear(G.state.turn);
      else screenTitle();
      break;
    }
    // v1.4.1：总结页的“返回演练”回演练列表，不是标题屏。
    case 'drill-back-lobby': screenDrillLobby(); break;
    case 'drill-send': {
      const d = G.drill;
      if (!d) break;
      const inp = $('#drill-input');
      const text = (inp ? inp.value : '').trim();
      if (!text) { alert('先写一句你想说的话。'); break; }
      if (d.topic === 'sanctuary') {
        const cr = sanctuaryReply(text);
        recordDrill(d.npcId, d.topic, text, cr.text, cr.crisis ? 0 : 2);
        screenDrill(d.topic);
        break;
      }
      const mem = npcMemoryFor(d.npcId);
      const r = npcReply(d.npcId, text, mem, d.topic);
      recordDrill(d.npcId, d.topic, text, r.text, r.trustDelta);
      screenDrill(d.topic);
      break;
    }
    case 'drill-en-send': {
      const inp = $('#drill-input');
      const text = (inp ? inp.value : '').trim();
      if (!text) { alert('先用英文写一句回答。'); break; }
      const fb = interviewEnFeedback(text);
      G.drillEnFeedback = fb;
      G.drillEnResults = G.drillEnResults || [];
      G.drillEnResults.push({ q: G.drillEnQ || 0, score: fb.score, lines: fb.lines });
      recordDrill('interviewer', 'en-interview', text, fb.lines.join(' '), fb.score >= 2 ? 3 : 0);
      // v1.4：Q3 发送后不再循环回 Q1，改为“三问完成”总结页。
      const next = (G.drillEnQ || 0) + 1;
      if (next >= EN_INTERVIEW_QUESTIONS.length) { G.drillEnDone = true; screenEnSummary(); }
      else { G.drillEnQ = next; screenEnInterview(); }
      break;
    }
    case 'drill-voice-start': {
      const SR = (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;
      const st = $('#drill-voice-status');
      if (!SR) { if (st) st.textContent = '这台设备 / 浏览器不支持语音识别，已转文字输入：直接打字回答。'; break; }
      const rec = new SR();
      rec.lang = 'en-US';
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (ev) => {
        const text = (ev.results && ev.results[0] && ev.results[0][0]) ? ev.results[0][0].transcript : '';
        const inp2 = $('#drill-input');
        if (inp2) inp2.value = text;
        const st2 = $('#drill-voice-status');
        if (st2) st2.textContent = text ? '识别到了，确认一下再发送。' : '没听清，再说一次，或直接打字。';
      };
      rec.onerror = (ev) => {
        const st2 = $('#drill-voice-status');
        if (st2) st2.textContent = (ev && ev.error === 'not-allowed') ? '麦克风权限被拒：直接打字回答。' : '语音识别出错了，已转文字输入。';
      };
      try { rec.start(); } catch (e) { if (st) st.textContent = '语音识别启动失败，已转文字输入。'; }
      break;
    }
    case 'drill-voice-send': {
      const inp = $('#drill-input');
      const text = (inp ? inp.value : '').trim();
      if (!text) { alert('先写一句回答（语音识别或打字都行）。'); break; }
      const fb = interviewEnFeedback(text);
      G.drillVoiceFeedback = fb;
      G.drillVoiceResults = G.drillVoiceResults || [];
      G.drillVoiceResults.push({ q: G.drillVoiceQ || 0, score: fb.score, lines: fb.lines });
      recordDrill('interviewer', 'voice', text, fb.lines.join(' '), fb.score >= 2 ? 3 : 0);
      // v1.4：Q3 发送后不再循环回 Q1，改为“三问完成”总结页。
      const next = (G.drillVoiceQ || 0) + 1;
      if (next >= EN_INTERVIEW_QUESTIONS.length) { G.drillVoiceDone = true; screenVoiceSummary(); }
      else { G.drillVoiceQ = next; screenVoiceInterview(); }
      break;
    }
    // v1.4：总结页的“再练一次”——状态清零，从 Q1 重练。
    case 'drill-en-retry': {
      G.drillEnQ = 0; G.drillEnResults = []; G.drillEnFeedback = null; G.drillEnDone = false;
      screenEnInterview();
      break;
    }
    case 'drill-voice-retry': {
      G.drillVoiceQ = 0; G.drillVoiceResults = []; G.drillVoiceFeedback = null; G.drillVoiceDone = false;
      screenVoiceInterview();
      break;
    }
    case 'h5-checkup': {
      const s = G.state;
      if (s.turn !== 13 || s.flags.h5Checkup || s.ap < 1) break;
      s.ap -= 1;
      s.flags.h5Checkup = true;
      const care = sealedCareSubject(s);
      autosave(care.kind === 'self' ? '自己体检完成' : '带' + care.label + '体检完成');
      startYearRefresh();
      break;
    }
    case 'to-slice': enterSlice(false); break;
    case 'slice-pick': pickSlice(Number(id)); break;
    // v1.4 (P1-3): 教培细分补填。补选后写回 jobProfile 并重进切片
    // （H2 此时才封存）；跳过则按未知细分继续，本次教培修正为 0。
    case 'slice-subsector-pick': {
      const s = G.state;
      const jp = s.flags.jobProfile;
      const sub = (SECTORS.find((x) => x.id === 'education') || { subsectors: [] }).subsectors.find((x) => x.id === id);
      if (jp) { jp.subsector = sub ? sub.id : null; jp.policyExposure = sub ? !!sub.policyExposure : false; }
      s.flags.subsectorMissing = false;
      autosave('教培细分已补填');
      enterSlice(false);
      break;
    }
    case 'slice-subsector-skip': {
      const s = G.state;
      s.flags.subsectorMissing = false;
      autosave('教培细分未填，按未知继续');
      enterSlice(false);
      break;
    }
    case 'slice-next':
      G.state.sliceStep += 1;
      autosave(); // v1.2 (P0-1): 切片步骤推进即保存，重进恢复到这一步
      if (G.state.sliceStep < 3) renderSliceDecision();
      else sliceEnd();
      break;
    case 'restart':
      G.state.runNumber = (G.state.runNumber || 1) + 1;
      saveMeta(G.meta);
      screenTitle();
      break;
    case 'export': exportSave(); break;
    case 'import': importSave(); break;
    case 'import-do': doImport(); break;
    case 'reset':
      // v1.3 (P0-4): 重置只清当前槽位的本地存档，不清全局 meta——
      // 其他槽位的存档、教训卡图鉴、演练记忆（npcMemory）都是共享
      // 资料，重置一个周目位不得把它们一起抹掉。
      if (confirm(`清除 ${G.pickedSlot} 号位的本地存档，回到标题？（其他周目位与共享图鉴、演练记忆不受影响）`)) { clearSave(G.pickedSlot); screenTitle(); }
      break;
    case 'analytics-toggle': {
      const off = !Analytics.optedOut();
      Analytics.setOptOut(off);
      refreshAnalyticsNote();
      break;
    }
    case 'back': screenTitle(); break;
    case 'title': screenTitle(); break;
  }
});

function refreshAnalyticsNote() {
  const note = document.querySelector('#analytics-note');
  const btn = document.querySelector('#analytics-toggle');
  if (!note || !btn) return;
  const off = Analytics.optedOut();
  note.textContent = off
    ? '匿名游玩统计已停止，不会发送任何数据。'
    : '匿名游玩统计已开启：只发回合与选项编号，不含任何个人信息、不记 IP。';
  btn.textContent = off ? '重新开启' : '停止发送';
}

function init() {
  Analytics.init();
  G = { state: null, rng: null, meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 };
  screenTitle();
  refreshAnalyticsNote();
}

document.addEventListener('DOMContentLoaded', init);
