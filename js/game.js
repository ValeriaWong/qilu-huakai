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
  const save = loadGame();
  const slots = meta.slots.map((sl) =>
    sl.unlocked
      ? `<button class="slot open" data-act="slot" data-id="${sl.id}">${sl.id} 号位 · 进行中</button>`
      : `<button class="slot locked" data-act="slot-locked" data-id="${sl.id}">${sl.id} 号位 · 付费解锁</button>`
  ).join('');
  setScreen(`
    <h1>歧路花开</h1>
    <p class="tagline">人生不止一条路，把不敢做的选择，先在这里演练一遍。</p>
    <p class="intro">《歧路花开》不是人生模拟器，是人生决策演练场。演练从 18 岁开始。每年 3 个行动点，承诺与兑现错开 1–3 年，骰子在签署那一刻封存，兑现时只读档、不重掷。</p>
    <h2>选 1–2 条执念</h2>
    <div class="chips">${OBSESSIONS.map((o) => `<button class="chip" data-act="obsession" data-id="${o.id}">${o.name}<small>${o.desc}</small></button>`).join('')}</div>
    <h2>难度（免费，開局锁死）</h2>
    <div class="chips">${Object.entries(DIFFICULTIES).map(([k, d]) => `<button class="chip" data-act="difficulty" data-id="${k}">${d.name}<small>${d.note}</small></button>`).join('')}</div>
    <h2>周目位</h2>
    <p class="muted">免费 1 位；2–3 号位付费解锁（演示版未接入支付，不会真的收费）。图鉴继承信息，不继承数值。</p>
    <div class="chips">${slots}</div>
    <div class="actions">
      <button class="primary" data-act="start">开始新的人生</button>
      <button data-act="slice">3 分钟切片：直接进 26 岁</button>
      ${save ? `<button data-act="continue">继续（${save.turn === 0 ? '开局' : 'T' + save.turn + ' · ' + (17 + save.turn) + ' 岁'}）</button>` : ''}
    </div>
    <p class="foot">本地存档，不开数据源，不用登录。存档码可导出 / 导入。v5 设计稿见仓库 README。</p>
    <div class="actions small">
      <button data-act="export">导出存档码</button>
      <button data-act="import">导入存档码</button>
      <button data-act="reset">重开（清除存档）</button>
    </div>`);
  G.pickedObsessions = new Set();
  G.pickedDifficulty = 'normal';
  G.pickedSlot = 1;
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
  const base = { model: 20, absentFather: 45, absentMother: 45, absentBoth: 40, orphan: 0, npd: 80 }[familyKey] ?? 40;
  return Math.max(0, Math.min(100, base + rng.int(-15, 15)));
}

function startNew(mode) {
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
    // H0: 出生时封存，T1 兑现。
    const h0 = rollH0(rng, s.origin.familyKey);
    sealDie(s, rng, 'H0', h0, [
      { text: '你妈说隔壁家孩子学了会计。' },
      { text: '你爸把招生简章翻到了第 38 页。' },
    ]);
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
  const h0 = rollH0(G.rng, key);
  sealDie(s, G.rng, 'H0', h0, [
    { text: '你妈说隔壁家孩子学了会计。' },
    { text: '你爸把招生简章翻到了第 38 页。' },
  ]);
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
  s.turn = 1; s.ap = 3;
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
  const tamperFactors = tampered ? h0TamperFactors(s) : null;
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
      ${tampered ? `<p class="warn">这颗骰在你出生那年掷出：父母干预强度 ${h0.value}。${tamperFactors.system === 'online' ? '网上填报，账号密码在父母手里，' : '那年是现场填报，你爸去学校机房，'}第一志愿已经被改成了省内师范。截止前你还能自己改回来——坚持自己或谈判，就是改回来；听父母的，就是认了。</p>` : `<p>父母干预强度 ${h0 ? h0.value : '?'}，这一次，他们让你自己填。</p>`}
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
function transferMajorEligible(s) {
  return !!(s.flags.adjusted && s.turn >= 2 && s.turn <= 4);
}
function transferMajorHtml(s) {
  if (!transferMajorEligible(s)) return '';
  const tried = s.flags.transferYear === s.turn;
  const last = s.flags.transferLast;
  const result = last && last.turn === s.turn ? `<p>${esc(last.text)}</p>` : '';
  return `<div class="card"><h2>转专业</h2>${result}<button class="opt" data-act="transfer-major" ${s.ap < 1 || tried ? 'disabled' : ''}><b>转回${esc(s.flags.adjustedFrom || '想读的专业')}</b><span>1 AP，50% 成功。今年一次机会，成功后读回你想读的专业；失败压力 +10。${tried ? '（今年已试过）' : ''}</span></button></div>`;
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

function startYear(turn) {
  const s = G.state;
  s.turn = turn;
  Analytics.track('turn_start', { turn });
  s.ap = 3 - (s.flags.nextYearApPenalty || 0);
  if (s.flags.nextYearApPenalty) s.flags.nextYearApPenalty = 0;
  if (s.flags.selfFunded && turn >= 2 && turn <= 5) s.ap -= 1; // 自挣学费（A 卡兑现窗口 T2–T4，v0.7 设计为 T2–T5 四年；T5 无行动环节，实际扣 T2–T4）
  s.ap = Math.max(1, s.ap);
  // v1.0: T18 只有 1 AP——最后一件想做的事（崩档次年 AP −1 在这里不
  // 再叠加，T18 就是 1 点）。
  if (turn === 18) s.ap = 1;
  // v1.0 D: 结婚的 AP 代价。文档只写“部分年份 AP −1”，没写明哪几年。
  // 取“买房/生育年（T13）AP −1”，其余年份不扣（见设计文档 v1.0 节）。
  if (turn === 13 && s.flags.relationship === 'partner') s.ap = Math.max(1, s.ap - 1);
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
  // v1.0 承诺兑现与防挫败（都在各自函数里 guard：只算一次，重进不重算）。
  // T13 签署 H5（父母病情基础值 1–3，T16 兑现；体检可 −1 级）。
  if (turn === 13 && !s.sealed.H5) {
    sealDie(s, rng, 'H5', rng.int(1, 3), [
      { text: '电话里的咳嗽声比上个月重了。' },
      { text: '亲戚欲言又止，说“你爸妈最近总往医院跑”。' },
      { text: '他们开始交代存折放在哪个抽屉。' },
    ]);
    s.rngState = rng.getState();
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
    ${venturePanelHtml(s)}
    ${shengbenHtml(s, 'year')}
    ${transferMajorHtml(s)}
    <h2>今年的行动（${s.ap} AP）</h2>
    <div class="options">${ventureActionHtml(s)}${yearActionButtons(s)}</div>
    <div class="actions"><button class="primary" data-act="year-end">结束这一年 → 结算</button></div>`);
}

function applyAction(id) {
  const s = G.state;
  const ac = ACTIONS.find((x) => x.id === id);
  if (!ac || s.ap < ac.ap) return;
  // v1.0 D 断亲：此项消失（按钮已隐藏，这里是纵深防御）。
  if (s.flags.estranged && id === 'family') return;
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
  const ev = s.currentEvent;
  setScreen(`
    <h1>T${turn} · ${17 + turn} 岁</h1>
    <p class="muted">本年 AP：${s.ap}。已选：${s.yearActions.join('、') || '无'}</p>
    ${eraYearCardHtml(s, turn)}
    ${yearExtraCardsHtml(s)}
    ${eventCardHtml(ev, s)}
    ${venturePanelHtml(s)}
    ${shengbenHtml(s, 'year')}
    ${transferMajorHtml(s)}
    <h2>今年的行动（${s.ap} AP）</h2>
    <div class="options">${ventureActionHtml(s)}${yearActionButtons(s)}</div>
    <div class="actions"><button class="primary" data-act="year-end">结束这一年 → 结算</button></div>`);
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
  autosave('年度结算完成');
  const next = s.turn + 1;
  setScreen(`
    <h1>年度结算卡 · T${s.turn}</h1>
    <div class="settle">
      <div><b>今年做了什么</b><p>${esc(s.yearActions.join('、') || '无')}</p></div>
      <div><b>属性变化</b><p>压力 ${res.before.stress} → ${a.stress}（${res.tier === 'calm' ? '稳' : res.tier === 'tense' ? '紧绷' : '崩'}），健康 ${res.before.health} → ${a.health}，钱 ${res.before.money} → ${a.money} 万，Debt ${res.before.debt} → ${a.debt}</p></div>
      <div><b>人生简报</b><p>${esc(brief)}</p></div>
      <div><b>被记下的征兆</b><p>${esc(s.omenLog.filter((o) => o.turn === s.turn).map((o) => o.text).join(' ') || '今年没有征兆。')}</p></div>
      ${ventureLines.length ? `<div><b>我的项目</b><p>${esc(ventureLines.join(' '))}</p></div>` : ''}
    </div>
    ${next === 9 ? `<div class="actions"><button class="primary" data-act="to-slice">进入 T9 · 26 岁裁员之夜</button></div>`
      : `<div class="actions"><button class="primary" data-act="year-next" data-id="${next}">进入 T${next} · ${17 + next} 岁</button></div>`}`);
}

// ---------- v1.0: T10–T18 ----------
function yearActionButtons(s) {
  // v1.0 D 断亲后“陪家人 / 伴侣”此项消失。
  return ACTIONS.filter((ac) => !(s.flags.estranged && ac.id === 'family'))
    .map((ac) => `<button class="opt" data-act="action" data-id="${ac.id}" ${s.ap < ac.ap ? 'disabled' : ''}><b>${ac.name}</b><span>${ac.desc}</span></button>`).join('');
}

function yearExtraCardsHtml(s) {
  return cRevealCardHtml(s) + h5SignHtml(s) + h5CheckupHtml(s) + t15OmenHtml(s) + fRevealCardHtml(s) + dStatusHtml(s) + (G.kindnessHtml || '');
}

function omenReplayHtml(s, turns) {
  const list = (s.omenLog || []).filter((o) => turns.includes(o.turn)).map((o) => o.text).reverse();
  return list.length ? esc(list.join(' ')) : '那几年没有留下征兆。';
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
  addLesson(s, 'C', 'H2 裁员名单：进切片那一刻就封存了，三个决定只定应对、不定结果。');
  autosave('承诺 C 已兑现');
}

function cRevealCardHtml(s) {
  if (s.turn !== 10 || !s.flags.cRevealed) return '';
  return redemptionCardHtml(s, 'C');
}

// ---------- v1.0: H5 体检（T13，1 AP）----------
function h5SignHtml(s) {
  if (s.turn !== 13 || !s.sealed.H5) return '';
  return `<div class="card"><h2>父母的身体 · 已封存</h2><p>征兆：${esc(s.sealed.H5.omens.map((o) => o.text).join(' '))}</p><p class="muted">这颗骰在你 30 岁那年掷出，T16 兑现。带父母体检（1 AP）可让等级 −1。</p></div>`;
}

function h5CheckupHtml(s) {
  if (s.turn !== 13 || !s.sealed.H5 || s.flags.h5Checkup) return '';
  return `<div class="card"><h2>带父母体检</h2><button class="opt" data-act="h5-checkup" ${s.ap < 1 ? 'disabled' : ''}><b>带父母去体检</b><span>1 AP。T13 才能做：父母病情等级 −1（T16 兑现时算）。${s.ap < 1 ? '（AP 不够）' : ''}</span></button></div>`;
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
  addLesson(s, 'F', 'F 父母的病：没有正确选项的一格。选哪个，都是真的放弃。');
  autosave('承诺 F 已兑现');
}

function fRevealCardHtml(s) {
  if (s.turn !== 17 || !s.flags.fRevealed || !s.commitments.F) return '';
  return redemptionCardHtml(s, 'F');
}

// ---------- v1.0: D 在 T13 的持续兑现（一行状态）----------
function dStatusHtml(s) {
  if (s.turn !== 13 || !s.commitments.D) return '';
  if (s.flags.relationship === 'partner') return `<div class="card"><p><b>伴侣线：</b>你们一起扛到了 30 岁。T14 押注时他/她是否共担，看 T12 签署时封存的 H4（大于 60 才共担）。</p></div>`;
  if (s.flags.estranged) return `<div class="card"><p><b>断亲后：</b>家庭线一直是 0，压力每年少恢复 3 点。“陪家人”这条路已经没有了。</p></div>`;
  return `<div class="card"><p><b>关系槽：</b>这一格空着。T14 押注、T16 父母病倒，都只能靠你自己。</p></div>`;
}

// ---------- v1.0: 防挫败硬规则（连续 2 次兑现失败 → 意外的善意）----------
function kindnessName(s) {
  if (s.flags.relationship === 'partner') return '伴侣';
  if (s.flags.stance === 'li') return '老李';
  if (s.flags.stance === 'wang') return '王姐';
  return '老陈';
}

function kindnessHtmlFor(s) {
  return `<div class="card"><h2>意外的善意</h2><p>${esc(kindnessName(s))}主动帮了你一次，没提条件。压力 −8，人脉 +2。连续两次兑现失败之后，总得有人推你一把——这是规则，不是运气。</p></div>`;
}

function kindnessCheck(s) {
  // 本年已触发过（重进/刷新）：只显示卡，不再重复给收益。
  if (s.flags.kindnessTurn === s.turn) return kindnessHtmlFor(s);
  if ((s.flags.consecFails || 0) < 2) return '';
  s.flags.kindnessTurn = s.turn;
  s.flags.consecFails = 0;
  s.attrs.stress = Math.max(0, s.attrs.stress - 8);
  s.attrs.network = (s.attrs.network || 0) + 2;
  s.yearlyLog.push({ turn: s.turn, type: 'kindness', text: '意外的善意：' + kindnessName(s) + '主动帮了你一次。压力 −8，人脉 +2。' });
  autosave('意外的善意');
  return kindnessHtmlFor(s);
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
    const decs = T9_SLICE.decisions.map((dd) => {
      const got = s.decisions[dd.id];
      return got ? got.text : '未决定';
    }).join('；');
    const branch = s.flags.t9Branch ? (T9_BRANCH_LABEL[s.flags.t9Branch] || s.flags.t9Branch) : '未知';
    return grid(
      esc('裁员应对：' + decs),
      (typeof h2.chance === 'number'
        ? `裁员概率 ${h2.chance}%，掷出 ${h2.roll}。这颗骰在你 26 岁那年掷出。`
        : '没有封存的 H2（旧存档或直接进 T10）。'),
      (typeof h2.laidOff === 'boolean'
        ? (h2.laidOff ? `被裁了。N = 8 万到账，走的是「${esc(branch)}」这条线。` : `岗位保住了，走的是「${esc(branch)}」这条线。`)
        : '裁员判定未知。'),
      '裁员名单没有最小翻盘点：进名单的四个原因，都是过去三年写好的。',
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
      third += snap.line === 'startup' ? ' 押的现金归零，压力进崩档，健康 −20。' : ` 押的 ${snap.staked} 万没了，压力进崩档，健康 −20。`;
      if (typeof snap.h6 === 'number' && snap.h6 < 35) third += ' 合伙人卷款跑路（H6 < 35），剩下的钱再 −30%。';
      if (res.divorced) third += ' 伴侣也走了（H4 < 30，押注失败触发离婚/分手）。';
    }
    let fourth;
    if (res.success) fourth = '成功了。没有需要翻盘的点。';
    else {
      const flips = counterfactualFlips(s);
      fourth = flips.length ? flips.map((f) => esc(f.text)).join('<br>') : '这一年没有单点能救你，是三个因子各差一点。';
    }
    return grid(first, second, third, fourth, omenReplayHtml(s, [14, 15, 16]));
  }
  if (id === 'F') {
    const c = s.commitments.F;
    if (!c) return '';
    const h5 = s.flags.h5Result || {};
    const fr = s.flags.fResult || {};
    const metNames = { money: '钱 ≥30 万', partner: '有伴侣支持', health: '健康 ≥60' };
    const metText = (fr.met || []).map((m) => metNames[m]).join('、') || '三项都没够上';
    return grid(
      esc(c.text) + `<br>父母病情 ${h5.level || '?'} 级${h5.checkup ? '（体检 −1 级）' : ''}。`,
      '这一格没有封存的骰子——没有正确选项，只有取舍。父母病情那颗骰在你 30 岁那年掷出（T13 签署）。',
      `抗压判定：${esc(metText)}，三选二${fr.pass ? '成立' : '不成立'}，压力 +${fr.pass ? 25 : 45}${fr.pass ? '' : '、健康 −15'}。`,
      '这一格没有成功率公式，所以没有最小翻盘点：三个选项都疼，选哪个都是真的放弃。',
      omenReplayHtml(s, [13, 14, 15, 16]));
  }
  return '';
}

// ---------- v1.0: T12 关系锁定 ----------
function screenT12() {
  const s = G.state;
  if (s.commitments.D) { showT12Signed(s); return; }
  setScreen(`
    <h1>T12 · 29 岁 · 关系锁定</h1>
    <p class="intro">只此一个亲密关系槽，占满 6 年（T13–T18）。这一格没有骰子——但它决定 T14 押注时伴侣是否共担，也决定 T16 那一格你身边有没有人。</p>
    ${G.kindnessHtml || ''}
    <div class="options">
      <button class="opt" data-act="t12-pick" data-id="partner"><b>和伴侣定下来（结婚）</b><span>现金 −30 万；买房/生育年（T13）AP −1。伴侣的真实想法在签署时封存（H4），T14 押注时见分晓。</span></button>
      <button class="opt" data-act="t12-pick" data-id="estranged"><b>断亲</b><span>家庭线永久归零；自主执念进度 +2；压力恢复 −3/年（每年结算时恢复量少 3）。“陪家人”行动从此消失。</span></button>
      <button class="opt" data-act="t12-pick" data-id="none"><b>都不选</b><span>这一格空着。6 年里没有人跟你分担，也没有人拖你后腿。</span></button>
    </div>
    <p class="muted">承诺 D（关系槽，T13–T18 持续兑现）：无骰，但 H4 决定 T14 押注时伴侣是否共担。</p>`);
}

function showT12Signed(s) {
  const d = s.commitments.D;
  const h4 = s.sealed.H4;
  setScreen(`
    <h1>承诺卡 D 已签署</h1>
    <div class="card"><p>${esc(d ? d.text : '')}</p>
    ${h4 ? `<p>征兆：${esc(h4.omens.map((o) => o.text).join(' '))}</p><p class="muted">伴侣的真实想法已在签署时封存（H4，29 岁那年掷出）。他/她是否愿共担风险，T14 押注时见分晓——对外只看征兆，不看数字。</p>` : ''}
    ${s.flags.estranged ? '<p>家庭线已归零，压力恢复从此每年少 3 点。“陪家人”行动已消失。</p>' : ''}
    <p class="muted">D 在 T13–T18 持续兑现：结婚的 AP 代价落在 T13；伴侣共担落在 T14；有没有人陪你扛，落在 T16。</p></div>
    <div class="actions"><button class="primary" data-act="year-next" data-id="13">进入 T13 · 30 岁</button></div>`);
}

function pickT12(id) {
  const s = G.state, a = s.attrs;
  if (s.commitments.D) { showT12Signed(s); return; }
  if (id === 'partner') {
    a.money -= 30;
    s.flags.relationship = 'partner';
    // H4：伴侣真实想法，签署时 roll 1–100 封存。>60 愿共担风险，
    // 30–60 只想稳定，<30 只想解决自己的问题。
    sealDie(s, G.rng, 'H4', G.rng.int(1, 100), [
      { text: '他/她谈钱的时候，先算的是你们俩的账。' },
      { text: '你加班到半夜，他/她问的是“什么时候回来”。' },
      { text: '见父母时，他/她坐在你这边。' },
    ]);
    s.commitments.D = { text: '关系槽：伴侣（结婚，现金 −30 万）', signedAt: 'T12', dueTurn: 13, snapshot: { ...a } };
  } else if (id === 'estranged') {
    a.family = 0;
    s.flags.estranged = true;
    s.flags.relationship = 'none';
    s.flags.obsessionProgress = (s.flags.obsessionProgress || 0) + 2;
    s.commitments.D = { text: '关系槽：断亲（家庭线永久归零）', signedAt: 'T12', dueTurn: 13, snapshot: { ...a } };
  } else {
    s.flags.relationship = 'none';
    s.commitments.D = { text: '关系槽：都不选', signedAt: 'T12', dueTurn: 13, snapshot: { ...a } };
  }
  s.rngState = G.rng.getState();
  autosave('承诺 D 已签署');
  Analytics.track('commitment', { card: 'D', choice: id });
  showT12Signed(s);
}

// ---------- v1.0: T14 押注 ----------
const E_LINES = [
  { id: 'startup', name: '创业', desc: '押上全部现金 + 2 年时间 + 绑定合伙人。合伙人可靠性在签署时封存（H6）。失败：现金归零、压力进崩档、健康 −20。' },
  { id: 'abroad', name: '裸辞出国', desc: '押上一半现金，出去闯两年。没有合伙人，成败只看你自己攒下的底子。' },
  { id: 'takeover', name: '接盘', desc: '接手一个现成的盘子，押上一半现金。盘子是现成的，坑也是现成的。' },
  { id: 'work', name: '继续打工', desc: '不押注。两年平稳打工，攒下 4 万，压力 +4。没有骰子，也没有翻盘。' },
];

function eOmensFor(lineId) {
  // 兑现结果的征兆（签署时给玩家看，准确率 65%，见 sealDie）。
  if (lineId === 'startup') return [
    { text: '签约那天，他迟到了半小时。' },
    { text: '第一笔钱打过去之后，他三天没回消息。' },
  ];
  if (lineId === 'abroad') return [
    { text: '签证材料递上去的那天，你手心全是汗。' },
    { text: '中介的电话开始打不通了。' },
  ];
  if (lineId === 'takeover') return [
    { text: '交接那天，前老板走得很快。' },
    { text: '账本上有两页被撕掉了。' },
  ];
  return [];
}

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
    // 即算合作经验。H6 表写 35–60 成功率 −20%，公式写 −10，以公式为准。
    let roll = G.rng.int(1, 100);
    if (a.network >= 50) roll += 10;
    if ((s.ventures || []).length) roll += 15;
    h6 = Math.max(0, Math.min(100, roll));
    partnerMod = h6 > 60 ? 15 : h6 >= 35 ? -10 : -25;
    s.flags.partnerMod = partnerMod;
    s.flags.h6 = h6;
    sealDie(s, G.rng, 'H6', h6, [
      { text: '他谈分成时的眼神飘了一下。' },
      { text: '他说“先干起来，钱的事以后再说”。' },
      { text: '他把老婆拉进了群，说“家里人都支持”。' },
    ]);
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
  let roll = null;
  if (chance !== null) {
    roll = G.rng.int(1, 100);
    sealDie(s, G.rng, 'E', roll, eOmensFor(line.id));
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
    // 失败：创业押全部≈现金归零；出国/接盘押一半，扣押金、剩一半。
    // H6 < 35 卷款跑路：剩下的钱再 −30%（创业失败已归零，这一项只在
    // 剩钱时才咬得到数，见设计文档 v1.0 节待定清单）。
    if (snap.line === 'startup') a.money = 0;
    else a.money = Math.max(0, Math.round((a.money - staked) * 10) / 10);
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

function h5CostText(lvl) {
  if (lvl === 1) return '1 级：现金 −15 万，压力 +15。';
  if (lvl === 2) return '2 级：现金 −40 万，压力 +30，还必须放弃一条线（下面选）。';
  return '3 级：现金 −80 万，压力 +45，健康 −15，破防事件。';
}

function applyH5(s) {
  if (s.flags.h5Applied) return;
  s.flags.h5Applied = true;
  const lvl = h5Level(s);
  const a = s.attrs;
  if (lvl === 1) { a.money -= 15; a.stress += 15; }
  else if (lvl === 2) { a.money -= 40; a.stress += 30; }
  else { a.money -= 80; a.stress += 45; a.health -= 15; }
  a.money = Math.round(a.money * 10) / 10;
  a.health = Math.max(0, Math.min(100, a.health));
  a.stress = Math.min(100, a.stress);
  s.flags.h5Result = { level: lvl, checkup: !!s.flags.h5Checkup, base: s.sealed.H5 ? s.sealed.H5.value : 1 };
  autosave('父母病情已兑现（H5 ' + lvl + ' 级）');
}

function screenT16() {
  const s = G.state;
  resolveE(s);
  applyH5(s);
  if (s.commitments.F) { showT16Signed(s); return; }
  const lvl = s.flags.h5Result.level;
  setScreen(`
    <h1>T16 · 33 岁 · 父母病倒</h1>
    <p class="intro">没有正确选项的一格。必须放弃事业 / 关系 / 健康之一，没有第三个选项。放弃的那条线永久 −1 格。</p>
    ${redemptionCardHtml(s, 'E')}
    <div class="card"><h2>父母的病（H5 · ${lvl} 级${s.flags.h5Result.checkup ? '，体检 −1 级' : ''}）</h2>
      <p>${h5CostText(lvl)}</p>
      <p class="muted">这颗骰在你 30 岁那年掷出（T13 签署）${s.flags.h5Result.checkup ? '；你带他们做过体检，等级 −1。' : '；T13 你没带他们体检。'}</p>
      ${lvl === 3 ? '<p class="warn">破防事件：那天晚上你没睡着。不是钱的事，是你第一次发现，他们真的会老。（破防事件的具体内容文档未给，当前为占位文案，见设计文档 v1.0 节待定清单。）</p>' : ''}
    </div>
    ${G.kindnessHtml || ''}
    <h2>你放弃哪一条线？</h2>
    <div class="options">
      <button class="opt" data-act="t16-pick" data-id="career"><b>放弃事业</b><span>专业 −10，影响力 −10。升职、跳槽、创业线都先放下。</span></button>
      <button class="opt" data-act="t16-pick" data-id="relationship"><b>放弃关系</b><span>家庭线 −2。${s.flags.relationship === 'partner' ? '伴侣离开。' : '（你现在没有伴侣，断的是和家人的线。）'}</span></button>
      <button class="opt" data-act="t16-pick" data-id="health"><b>放弃健康</b><span>健康 −20。自己的身体先往后排。</span></button>
    </div>
    <p class="muted">抗压判定（钱 ≥30 万 / 有伴侣支持 / 健康 ≥60，三选二）：成立 → 压力 +25；否则压力 +45、健康 −15。判定读放弃前的状态（H5 的账已结过）。</p>`);
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
  // 抗压判定读放弃前的状态（H5 的账已在进 T16 时结过，放弃的代价
  // 不应反过来改写判定本身）。
  const res = fResilience(s);
  // 放弃的那条线永久 −1 格（解释性映射：事业 = 专业/影响力各 −10；
  // 关系 = 家庭线 −2，有伴侣则伴侣离开；健康 = 健康 −20）。
  if (id === 'career') { a.skill -= 10; a.influence -= 10; }
  else if (id === 'relationship') {
    a.family -= 2;
    if (s.flags.relationship === 'partner') { s.flags.relationship = 'none'; s.flags.partnerGone = true; }
  } else { a.health -= 20; }
  if (res.pass) a.stress += 25;
  else { a.stress += 45; a.health -= 15; }
  a.health = Math.max(0, Math.min(100, a.health));
  a.stress = Math.min(100, Math.max(0, a.stress));
  const label = { career: '事业', relationship: '关系', health: '健康' }[id];
  s.commitments.F = { text: '父母的病：放弃' + label + '（H5 ' + (s.flags.h5Result ? s.flags.h5Result.level : '?') + ' 级）', signedAt: 'T16', dueTurn: 17, snapshot: { ...a } };
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
      ? `<div class="card"><p>你做的最后一件事：<b>${esc({ family: '陪家人/伴侣吃顿饭', health: '好好睡一觉，去体检', write: '把这 18 年写下来' }[s.flags.t18Choice] || '')}</b></p></div>
      <div class="actions"><button class="primary" data-act="t18-settle">去结算 · 35 岁</button></div>`
      : `<div class="options">
      <button class="opt" data-act="t18-pick" data-id="family" ${s.flags.estranged ? 'disabled' : ''}><b>陪家人/伴侣吃顿饭</b><span>1 AP。家庭线 +1，压力 −8。${s.flags.estranged ? '（断亲后没有这条路。）' : ''}</span></button>
      <button class="opt" data-act="t18-pick" data-id="health"><b>好好睡一觉，去体检</b><span>1 AP。健康 +5，压力 −8。</span></button>
      <button class="opt" data-act="t18-pick" data-id="write"><b>把这 18 年写下来</b><span>1 AP。影响力 +6，压力 −3。写给以后的人看。</span></button>
    </div>`}`);
}

function pickT18(id) {
  const s = G.state, a = s.attrs;
  if (s.flags.t18Done || s.ap < 1) return;
  if (id === 'family' && s.flags.estranged) return;
  s.ap -= 1;
  if (id === 'family') { a.family += 1; a.stress -= 8; }
  else if (id === 'health') { a.health += 5; a.stress -= 8; }
  else { a.influence += 6; a.stress -= 3; }
  a.health = Math.max(0, Math.min(100, a.health));
  a.stress = Math.max(0, a.stress);
  s.flags.t18Done = true;
  s.flags.t18Choice = id;
  s.yearActions = s.yearActions || [];
  s.yearActions.push({ family: '陪家人/伴侣吃顿饭', health: '好好睡一觉，去体检', write: '把这 18 年写下来' }[id]);
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
  setScreen(`
    <h1>T5 · 22 岁 · 毕业去向</h1>
    <p class="intro">承诺卡 A（志愿）已在 T4 兑现——回头看，18 岁的选择把你带到了这里。你的专业是 <b>${esc(s.major ? s.major.name : '（旧存档，未记录）')}</b>${s.major && s.major.tier ? `（${esc(s.major.tier)}）` : ''}，专业系数 k = ${s.flags.majorK}，起点已定。同时签下承诺卡 B：第一份工作，锁定城市 × 行业，后续 80% 的机会只从这条线长出来。</p>
    <div class="card"><p><b>offer 档位（内部公式）：</b>档位 = floor((专业×0.5 + 表达×0.3 + 人脉×0.2) / 100 × 4) + 1。你当前是 <b>${offerTier(s)} 档</b>（1 小公司 / 2 普通 / 3 好公司 / 4 大厂）。</p></div>
    ${t5EraLineHtml(s)}
    ${eraYearCardHtml(s, 5)}
    ${shengbenHtml(s, 't5')}
    <div class="options">${T5_JOBS.map((j) => `<button class="opt" data-act="t5-pick" data-id="${j.id}"><b>${j.name}</b><span>${j.desc} 钱 +${j.money} 万/年。</span></button>`).join('')}</div>`);
}

function pickT5(id) {
  const s = G.state;
  const j = T5_JOBS.find((x) => x.id === id);
  s.attrs.money += j.money;
  s.attrs.stress += j.stress;
  if (id === 'bigtech') s.flags.highPay = true;
  // Employment state from here on: gates ev-race / ev-boundary.
  s.flags.employment = id === 'startup' ? 'startup' : 'employed';
  s.flags.jobIndustry = j.industry; // v0.7: chronicle industry conditions read this
  s.flags.housing = 'rent';
  s.commitments.B = { text: '第一份工作：' + j.name, signedAt: 'T5', dueTurn: 6, snapshot: { ...s.attrs } };
  autosave('承诺 B 已签署');
  Analytics.track('commitment', { card: 'B', choice: id });
  setScreen(`
    <h1>承诺卡 B 已签署</h1>
    <div class="card"><p>你去了${j.name}。这条线的 NPC 池已经换了——接下来几年遇到的人，大多从这里来。</p></div>
    <div class="actions"><button class="primary" data-act="year-next" data-id="6">进入 T6 · 23 岁</button></div>`);
}

function screenT6() {
  const s = G.state;
  setScreen(`
    <h1>T6 · 23 岁 · 入职第一年</h1>
    <p class="intro">半承诺：站队。抱某位领导，还是保持中立？半承诺可撤销，但有代价——反悔后该 NPC 意愿 −40，且新靠山对你的信任上限 60（“他背叛过老李”）。</p>
    <div class="options">
      <button class="opt" data-act="t6-pick" data-id="li"><b>站队老李</b><span>业务骨干，能力偏好型；跟他能学到东西，但他不护短。</span></button>
      <button class="opt" data-act="t6-pick" data-id="wang"><b>站队王姐</b><span>手握资源，关系偏好型；跟她有饭局，但要先学会敬酒。</span></button>
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
function enterSlice(direct) {
  const s = G.state;
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
  if (!s.flags.h2) {
    if (s.flags.industryDown) s.flags.deptShrinking = true;
    const h2chance = layoffChance(s);
    const h2roll = G.rng.int(1, 100);
    s.flags.h2 = { chance: h2chance, roll: h2roll, laidOff: h2roll <= h2chance };
    s.rngState = G.rng.getState();
  }
  s.turn = 9; s.ap = 3;
  Analytics.track('turn_start', { turn: 9 });
  s.sliceStart = Date.now();
  s.sliceStep = 0;
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
  const d = T9_SLICE.decisions[s.sliceStep];
  let options = d.dynamic === 'borrow' ? sliceBorrowOptions(s) : d.options;
  // P1 (f, recheck 2026-11-17): before 2013 微信 is not the default
  // contact channel — the probe goes by QQ. 2013+ keeps 微信.
  if (d.id === 'call-laochen' && s.flags.t9Crisis) {
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
  setScreen(`
    <h1>T9 · 26 岁 · 裁员之夜</h1>
    <p class="intro">${esc(T9_SLICE.intro)}</p>
    ${s.flags.t9Crisis ? `<p class="muted">背景：${s.flags.t9Crisis.crisisYear} 年${esc(s.flags.t9Crisis.label)}${s.flags.t9Crisis.fictional ? '（架空推演）' : ''}——这就是你撞上的那场危机。</p>` : ''}
    <p class="muted">切片用时 ${elapsed} 秒 · 第 ${s.sliceStep + 1} 个决定 / 共 3 个 · 第一个决定在 90 秒内出现（本切片直接开局即是）。</p>
    <div class="card big"><h2>${esc(d.title)}</h2><p>${esc(d.body)}</p>
      <div class="options">${options.map((o, i) => `<button class="opt" data-act="slice-pick" data-id="${i}"><b>${esc(o.text)}</b></button>`).join('')}</div>
    </div>
    <p class="muted">每个决定都会封存并自动保存。承诺 C（裁员应对）兑现从 T10 开始。</p>`);
}

function pickSlice(i) {
  const s = G.state;
  const d = T9_SLICE.decisions[s.sliceStep];
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
  // v0.8: slice outcome as an enum (laid off / kept / kept via transfer).
  const h2s = s.flags.h2;
  const hrTalk = s.decisions['hr-talk'];
  const triedTransfer = !!(hrTalk && hrTalk.text.includes('转岗'));
  Analytics.track('slice', { outcome: !h2s ? 'unknown' : h2s.laidOff ? 'laid_off' : triedTransfer ? 'kept_transfer' : 'kept' });
  // H2 resolution: the layoff die was sealed on entering the slice — read
  // it here and apply the compensation. N = 工龄 4 年 × 月薪 2 万 = 8 万；
  // the +1 代通知金 depends on the dismissal ground, so it is NOT automatic.
  let h2Card = '';
  const h2 = s.flags.h2;
  if (h2) {
    const hr = s.decisions['hr-talk'];
    const triedTransfer = hr && hr.text.includes('转岗');
    if (h2.laidOff) {
      s.attrs.money += 8;
      h2Card = `<div class="card"><h2>裁员判定：你被裁了</h2><p>进切片时封存的骰子：掷出 ${h2.roll} ≤ ${h2.chance}（H2 裁员概率）。你在同一家公司 4 年，月薪 2 万，N = 8 万到账。${triedTransfer ? '你争取过转岗，但没有真实岗位空出来。' : ''}代通知金是否另算，取决于解除情形——谈话里你问清楚了没有？</p></div>`;
    } else if (triedTransfer) {
      s.attrs.stress = Math.max(0, s.attrs.stress - 5);
      h2Card = `<div class="card"><h2>裁员判定：岗位保住了</h2><p>进切片时封存的骰子：掷出 ${h2.roll} > ${h2.chance}（H2 裁员概率）。你不在这一批名单里。转岗谈成了——转到了新项目组，压力 −5。</p></div>`;
    } else {
      s.attrs.stress += 5;
      h2Card = `<div class="card"><h2>裁员判定：岗位保住了</h2><p>进切片时封存的骰子：掷出 ${h2.roll} > ${h2.chance}（H2 裁员概率）。你不在这一批名单里，但项目被砍了，压力 +5。</p></div>`;
    }
  }
  const decs = T9_SLICE.decisions.map((d) => {
    const got = s.decisions[d.id];
    return `<p><b>${esc(d.title)}</b><br>${got ? esc(got.text) + '——' + esc(got.seal) : '未决定'}</p>`;
  }).join('');
  // P1 (a): the crisis background + the branch this night puts the
  // player on. The branch only shapes the aftermath; the H2 die was
  // sealed when the slice was entered.
  const crisis = s.flags.t9Crisis;
  const branch = t9Branch(s);
  s.flags.t9Branch = branch;
  const crisisCard = crisis ? `<div class="card"><h2>这一夜的背景</h2><p>${crisis.crisisYear} 年${esc(crisis.label)}${crisis.fictional ? '（架空推演）' : ''}。这一夜之后，你走的是「${esc(T9_BRANCH_LABEL[branch] || branch)}」这条线。</p></div>` : '';
  const omens = s.omenLog.filter((o) => o.turn === 9).map((o) => o.text).join(' ');
  setScreen(`
    <h1>切片结束 · 26 岁这一夜</h1>
    <p class="intro">${esc(T9_SLICE.outro)}</p>
    ${h2Card}
    ${crisisCard}
    <div class="card">${decs}</div>
    <div class="card"><h2>征兆回放</h2><p>${esc(omens || '今夜没有征兆。')}</p></div>
    <div class="card"><h2>你的状态</h2>
      <p>钱 ${s.attrs.money} 万 · 健康 ${s.attrs.health} · 压力 ${s.attrs.stress}（${pressureTier(s.attrs.stress).name}）· 家庭线 ${s.attrs.family} · Debt ${s.attrs.debt}</p>
      <p class="muted">执念：${s.obsessions.map((id) => (OBSESSIONS.find((o) => o.id === id) || {}).name).join('、') || '未选'}</p>
    </div>
    <p class="muted">承诺 C（裁员应对）兑现从 T10 开始。35 岁结算后才出现「再来一次」（解锁 S4 改写入口与并行周目位）——结算前没有改写入口。</p>
    <div class="actions">
      <button class="primary" data-act="year-next" data-id="10">进入 T10 · 27 岁</button>
      <button data-act="export">导出存档码</button>
      <button data-act="title">回到标题</button>
    </div>`);
}

// ---------- global actions ----------
function exportSave() {
  const code = exportCode(G.state);
  setScreen(`<h1>存档码</h1><p class="intro">种子与封存骰都在码里，导入后一模一样。自己备份，别发给别人。</p>
    <textarea rows="6" readonly onclick="this.select()">${esc(code)}</textarea>
    <div class="actions"><button class="primary" data-act="back">返回</button></div>`);
}

function importSave() {
  setScreen(`<h1>导入存档码</h1><textarea id="import-code" rows="6" placeholder="粘贴 QILU1- 开头的存档码"></textarea>
    <div class="actions"><button class="primary" data-act="import-do">导入</button><button data-act="back">返回</button></div>`);
}

function doImport() {
  const code = $('#import-code').value;
  const r = importCode(code);
  if (!r.ok) { alert(r.error); return; }
  G.state = r.state;
  G.rng = makeRng(r.state.seed);
  G.rng.setState(r.state.rngState || r.state.seed);
  autosave('已导入');
  alert('导入成功。');
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
  // v1.1 (b): era mismatch panel — shown only when the adapter found
  // tech that did not exist in the venture's year. The player picks
  // keep (default: use it as written) or adapt (swap to the era's tech).
  let eraHtml = '';
  if (p.eraAdapt && p.eraAdapt.needed) {
    eraHtml = `<p class="warn">年代提醒：你写的「${esc(p.eraAdapt.requested.join('、'))}」在 ${p.eraYear} 年还不存在。当时能用的是：${esc(p.eraAdapt.available.join('、'))}。你的原意不变，只换技术——换还是不换，你定。</p>
      <p>年代适配：<select id="idea-era-adapt"><option value="keep" selected>就按我写的来</option><option value="adapt">换成当时能用的技术</option></select></p>`;
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
      ${canDirect ? '<button class="primary" data-act="idea-confirm">确认开始</button>' : ''}
      <button data-act="idea-validate">先做免费验证</button>
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
    case 'slot': G.pickedSlot = Number(id); refreshChips(); break;
    case 'slot-locked': alert('2–3 号位付费解锁。演示版未接入支付，不会真的收费。'); break;
    case 'start': startNew('full'); break;
    case 'slice': startNew('slice'); break;
    case 'continue': {
      const s = loadGame();
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
      G.pendingIdea = { text, archId: arch.id, themes, explanation: '', aiReviewing: false, aiVerdict: null, aiError: '', nonVenture: nv ? nv.kind : '', nonVentureReason: nv ? nv.reason : '', eraAdapt, eraYear, eraAdaptChoice: 'keep' };
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
    case 'shengben-t5': if (attemptShengben(G.state, G.rng, 0)) screenT5(); break;
    case 'shengben-year': if (attemptShengben(G.state, G.rng, 1)) startYearRefresh(); break;
    case 'transfer-major': if (attemptTransferMajor(G.state, G.rng)) startYearRefresh(); break;
    case 't6-pick': pickT6(id); break;
    case 't12-pick': pickT12(id); break;
    case 't14-pick': pickT14(id); break;
    case 't16-pick': pickT16(id); break;
    case 't18-pick': pickT18(id); break;
    case 't18-settle': screenSettlement(); break;
    case 'h5-checkup': {
      const s = G.state;
      if (s.turn !== 13 || s.flags.h5Checkup || s.ap < 1) break;
      s.ap -= 1;
      s.flags.h5Checkup = true;
      autosave('带父母体检完成');
      startYearRefresh();
      break;
    }
    case 'to-slice': enterSlice(false); break;
    case 'slice-pick': pickSlice(Number(id)); break;
    case 'slice-next':
      G.state.sliceStep += 1;
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
      if (confirm('清除本地存档与周目记录，回到标题？')) { clearSave(); localStorage.removeItem(META_KEY); G.meta = loadMeta(); screenTitle(); }
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
