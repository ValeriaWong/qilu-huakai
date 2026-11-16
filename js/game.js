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
  return { familyKey: key, familyName: fam.name, card: fam.card, fragments, counter, attrs: a };
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
    // 家庭抗压：v5 改成 T1 就可见的「家庭兜底」。
    s.flags.familySafety = s.origin.attrs.money >= 2 ? '家里能接住你一次，但只有一次。' : '家里接不住你——这条路得你自己走。';
    s.rngState = rng.getState();
    autosave();
    screenOrigin();
  }, 1500);
}

function screenOrigin() {
  const s = G.state, o = s.origin;
  setScreen(`
    <h1>S2 · 出身卡</h1>
    <p class="tagline">你没得选的那部分</p>
    <div class="card">
      <p><b>家庭：</b>${esc(o.card.family)}</p>
      <p><b>父母：</b>${esc(o.card.parents)}</p>
      <p><b>${esc(o.card.money)}</b></p>
      <p><b>${esc(o.card.city)}</b></p>
      <p><b>判词：</b>${esc(o.card.verdict)}</p>
    </div>
    <p class="intro">即将面对的第一个岔路口：高考志愿三天截止，父亲已备好省内师范名单。</p>
    <div class="actions"><button class="primary" data-act="to-fragments">看看那 18 年</button></div>`);
}

function screenFragments() {
  const s = G.state, o = s.origin;
  setScreen(`
    <h1>S3 · 那 18 年</h1>
    <p class="intro">成长记录是展开层，点开看，默认收起，可以跳过。这一段没有输入框。</p>
    ${o.fragments.map((f, i) => `<details class="fragment"><summary>片段 ${i + 1}${i === o.fragments.length - 1 && o.counter ? ' · 反例' : ''}</summary><p>${esc(f)}</p></details>`).join('')}
    <div class="actions"><button class="primary" data-act="to-transition">继续</button></div>`);
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
function screenT1() {
  const s = G.state;
  s.turn = 1; s.ap = 3;
  const h0 = s.sealed.H0;
  const tampered = h0 && h0.value >= 60;
  setScreen(`
    <h1>T1 · 18 岁 · 高考报名</h1>
    <p class="intro">选专业时，有的父母会阻止你报想报的专业，有的不会——从这里开始，你自己做决定。</p>
    <div class="card">
      <p><b>家庭兜底：</b>${esc(s.flags.familySafety || '')}</p>
      <p><b>征兆：</b>${h0 ? h0.omens.map((o) => esc(o.text)).join(' ') : ''}</p>
      ${tampered ? `<p class="warn">这颗骰在你出生那年掷出：父母干预强度 ${h0.value}。第一志愿已经被改成了省内师范。</p>` : `<p>父母干预强度 ${h0 ? h0.value : '?'}，这一次，他们让你自己填。</p>`}
    </div>
    <h2>你的第一志愿</h2>
    <div class="options">
      <button class="opt" data-act="t1-pick" data-id="obey"><b>听父母的</b><span>家庭线 +1，自主执念进度 −1。专业系数 k = 1.0。</span></button>
      <button class="opt" data-act="t1-pick" data-id="insist"><b>坚持自己</b><span>家庭线 −1。专业系数 k = 1.3；家庭经济 ≤2 档时需自挣学费（T2–T5 每年 −1 AP）。</span></button>
      <button class="opt" data-act="t1-pick" data-id="negotiate"><b>谈判，折中</b><span>家庭线不变。专业系数 k = 1.0，留一个以后再谈的口子。</span></button>
    </div>
    <p class="muted">承诺卡 A（志愿，T5 兑现）：专业锁定 8 年，决定专业成长系数 k。</p>`);
}

function pickT1(choice) {
  const s = G.state, a = s.attrs;
  const k = { obey: 1.0, insist: 1.3, negotiate: 1.0 }[choice];
  if (choice === 'obey') { a.family += 1; s.flags.obsessionProgress = (s.flags.obsessionProgress || 0) - 1; }
  if (choice === 'insist') {
    a.family -= 1;
    if (s.origin.attrs.money <= 2) { s.flags.selfFunded = true; }
  }
  s.flags.majorK = k;
  s.commitments.A = {
    text: '志愿：' + { obey: '听父母的', insist: '坚持自己', negotiate: '谈判折中' }[choice],
    signedAt: 'T1', dueTurn: 5,
    snapshot: { skill: a.skill, express: a.express, network: a.network, family: a.family, k },
  };
  autosave('承诺 A 已签署并封存');
  setScreen(`
    <h1>承诺卡 A 已签署</h1>
    <div class="card"><p>专业系数 k = ${k}，T5 兑现。骰子已封存，兑现时只读档、不重掷。</p>
    <p class="muted">征兆已记下，兑现那天会拿出来对照：你当时收到过什么信号、忽略了什么。</p></div>
    <div class="actions"><button class="primary" data-act="year-start">进入 T2 · 19 岁</button></div>`);
}

// ---------- yearly loop T2–T8 ----------
function startYear(turn) {
  const s = G.state;
  s.turn = turn;
  s.ap = 3 - (s.flags.nextYearApPenalty || 0);
  if (s.flags.nextYearApPenalty) s.flags.nextYearApPenalty = 0;
  if (s.flags.selfFunded && turn >= 2 && turn <= 5) s.ap -= 1; // 自挣学费
  s.ap = Math.max(1, s.ap);
  s.yearActions = [];
  s.flags.eventChoice = ''; // reset: last year's choice must not leak into this year's brief
  // Independent scheduler: H3 industry cycle, H7 political wind, H9 accident.
  const rng = G.rng;
  if (rng.chance(0.15) && !s.flags.industryDown) {
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
  if (turn === 5) return screenT5();
  if (turn === 6) return screenT6();
  const ev = rng.pick(YEAR_EVENTS);
  s.currentEvent = ev;
  setScreen(`
    <h1>T${turn} · ${17 + turn} 岁</h1>
    <p class="muted">本年 AP：${s.ap}。每年只能选 3 件，这是全游戏的取舍。</p>
    ${s.flags.industryDown ? '<p class="warn">行业下行期：薪资判定 −20%，晋升成功率 −15%。</p>' : ''}
    <div class="card"><h2>${esc(ev.title)}</h2><p>${esc(ev.body)}</p>
      <div class="options">${ev.options.map((o, i) => `<button class="opt" data-act="event-pick" data-id="${i}">${esc(o.text)}</button>`).join('')}</div>
    </div>
    <h2>今年的行动（${s.ap} AP）</h2>
    <div class="options">${ACTIONS.map((ac) => `<button class="opt" data-act="action" data-id="${ac.id}" ${s.ap < ac.ap ? 'disabled' : ''}><b>${ac.name}</b><span>${ac.desc}</span></button>`).join('')}</div>
    <div class="actions"><button class="primary" data-act="year-end">结束这一年 → 结算</button></div>`);
}

function applyAction(id) {
  const s = G.state;
  const ac = ACTIONS.find((x) => x.id === id);
  if (!ac || s.ap < ac.ap) return;
  s.ap -= ac.ap;
  const a = s.attrs;
  // Copy fx: never mutate the shared ACTIONS table (study's k-multiplier
  // and overtime's tense bonus are per-use).
  const fx = { ...ac.fx };
  if (ac.id === 'study' && s.flags.majorK) fx.skill = Math.round(5 * s.flags.majorK);
  if (ac.id === 'overtime' && pressureTier(a.stress).id === 'tense') {
    fx.money = Math.round(8 * 1.3);
    fx.skill = Math.round(2 * 1.3);
  }
  for (const [k, v] of Object.entries(fx)) a[k] = (a[k] || 0) + v;
  if (ac.id === 'social' && pressureTier(a.stress).id === 'tense') a.stress -= 3;
  if (ac.id === 'rest') s.flags.restBonus = true;
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
  const eventDone = !!s.flags.eventChoice;
  setScreen(`
    <h1>T${turn} · ${17 + turn} 岁</h1>
    <p class="muted">本年 AP：${s.ap}。已选：${s.yearActions.join('、') || '无'}</p>
    <div class="card"><h2>${esc(ev.title)}</h2><p>${esc(ev.body)}</p>
      ${eventDone
        ? '<p class="muted">（事件已选，见结算卡。）</p>'
        : `<div class="options">${ev.options.map((o, i) => `<button class="opt" data-act="event-pick" data-id="${i}">${esc(o.text)}</button>`).join('')}</div>`}
    </div>
    <h2>今年的行动（${s.ap} AP）</h2>
    <div class="options">${ACTIONS.map((ac) => `<button class="opt" data-act="action" data-id="${ac.id}" ${s.ap < ac.ap ? 'disabled' : ''}><b>${ac.name}</b><span>${ac.desc}</span></button>`).join('')}</div>
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
  const res = settleYear(s, DIFFICULTIES[s.difficulty]);
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
    </div>
    ${next <= 8 ? `<div class="actions"><button class="primary" data-act="year-next" data-id="${next}">进入 T${next} · ${17 + next} 岁</button></div>`
      : `<div class="actions"><button class="primary" data-act="to-slice">进入 T9 · 26 岁裁员之夜</button></div>`}`);
}

// ---------- T5 / T6 key years ----------
function screenT5() {
  const s = G.state;
  setScreen(`
    <h1>T5 · 22 岁 · 毕业去向</h1>
    <p class="intro">承诺卡 A（志愿）今天兑现：专业系数 k = ${s.flags.majorK}，起点已定。同时签下承诺卡 B：第一份工作，锁定城市 × 行业，后续 80% 的机会只从这条线长出来。</p>
    <div class="card"><p><b>offer 档位（内部公式）：</b>档位 = floor((专业×0.5 + 表达×0.3 + 人脉×0.2) / 100 × 4) + 1。你当前是 <b>${offerTier(s)} 档</b>（1 小公司 / 2 普通 / 3 好公司 / 4 大厂）。</p></div>
    <div class="options">${T5_JOBS.map((j) => `<button class="opt" data-act="t5-pick" data-id="${j.id}"><b>${j.name}</b><span>${j.desc} 钱 +${j.money} 万/年。</span></button>`).join('')}</div>`);
}

function pickT5(id) {
  const s = G.state;
  const j = T5_JOBS.find((x) => x.id === id);
  s.attrs.money += j.money;
  s.attrs.stress += j.stress;
  if (id === 'bigtech') s.flags.highPay = true;
  s.commitments.B = { text: '第一份工作：' + j.name, signedAt: 'T5', dueTurn: 6, snapshot: { ...s.attrs } };
  autosave('承诺 B 已签署');
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
    s.flags.familySafety = s.origin.attrs.money >= 2 ? '家里能接住你一次，但只有一次。' : '家里接不住你——这条路得你自己走。';
    s.commitments.A = { text: '志愿：听父母的', signedAt: 'T1', dueTurn: 5, snapshot: {} };
    s.commitments.B = { text: '第一份工作：普通公司', signedAt: 'T5', dueTurn: 6, snapshot: {} };
    s.rngState = rng.getState();
  }
  s.turn = 9; s.ap = 3;
  s.sliceStart = Date.now();
  s.sliceStep = 0;
  autosave('进入 T9 切片');
  renderSliceDecision();
}

function renderSliceDecision() {
  const s = G.state;
  const d = T9_SLICE.decisions[s.sliceStep];
  const elapsed = Math.floor((Date.now() - (s.sliceStart || Date.now())) / 1000);
  setScreen(`
    <h1>T9 · 26 岁 · 裁员之夜</h1>
    <p class="intro">${esc(T9_SLICE.intro)}</p>
    <p class="muted">切片用时 ${elapsed} 秒 · 第 ${s.sliceStep + 1} 个决定 / 共 3 个 · 第一个决定在 90 秒内出现（本切片直接开局即是）。</p>
    <div class="card big"><h2>${esc(d.title)}</h2><p>${esc(d.body)}</p>
      <div class="options">${d.options.map((o, i) => `<button class="opt" data-act="slice-pick" data-id="${i}"><b>${esc(o.text)}</b></button>`).join('')}</div>
    </div>
    <p class="muted">每个决定都会封存并自动保存。承诺 C（裁员应对）兑现从 T10 开始。</p>`);
}

function pickSlice(i) {
  const s = G.state;
  const d = T9_SLICE.decisions[s.sliceStep];
  const o = d.options[i];
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
  G.meta.runsFinished = (G.meta.runsFinished || 0) + 1;
  saveMeta(G.meta);
  const decs = T9_SLICE.decisions.map((d) => {
    const got = s.decisions[d.id];
    return `<p><b>${esc(d.title)}</b><br>${got ? esc(got.text) + '——' + esc(got.seal) : '未决定'}</p>`;
  }).join('');
  const omens = s.omenLog.filter((o) => o.turn === 9).map((o) => o.text).join(' ');
  setScreen(`
    <h1>切片结束 · 26 岁这一夜</h1>
    <p class="intro">${esc(T9_SLICE.outro)}</p>
    <div class="card">${decs}</div>
    <div class="card"><h2>征兆回放</h2><p>${esc(omens || '今夜没有征兆。')}</p></div>
    <div class="card"><h2>你的状态</h2>
      <p>钱 ${s.attrs.money} 万 · 健康 ${s.attrs.health} · 压力 ${s.attrs.stress}（${pressureTier(s.attrs.stress).name}）· 家庭线 ${s.attrs.family} · Debt ${s.attrs.debt}</p>
      <p class="muted">执念：${s.obsessions.map((id) => (OBSESSIONS.find((o) => o.id === id) || {}).name).join('、') || '未选'}</p>
    </div>
    <p class="muted">下一版：T10–T18 完整年度循环、承诺 C/D/E/F 兑现卡、35 岁结算与「再来一次」（解锁 S4 改写入口与并行周目位）。</p>
    <div class="actions">
      <button class="primary" data-act="restart">再来一次（解锁 S4 改写）</button>
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
    case 't1-pick': pickT1(id); break;
    case 'year-start': startYear(2); break;
    case 'year-next': startYear(Number(id)); break;
    case 'event-pick': pickEvent(Number(id)); break;
    case 'action': applyAction(id); break;
    case 'year-end': endYear(); break;
    case 't5-pick': pickT5(id); break;
    case 't6-pick': pickT6(id); break;
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
    case 'back': screenTitle(); break;
    case 'title': screenTitle(); break;
  }
});

function init() {
  G = { state: null, rng: null, meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 };
  screenTitle();
}

document.addEventListener('DOMContentLoaded', init);
