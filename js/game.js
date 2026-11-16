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
    <h1>T1 · 18 岁 · 高考志愿填报</h1>
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
    <p class="muted">承诺卡 A（志愿，T2–T4 兑现，T5 回顾）：专业锁定 8 年，决定专业成长系数 k。</p>`);
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
    signedAt: 'T1', dueTurn: 4,
    snapshot: { skill: a.skill, express: a.express, network: a.network, family: a.family, k },
  };
  autosave('承诺 A 已签署并封存');
  setScreen(`
    <h1>承诺卡 A 已签署</h1>
    <div class="card"><p>专业系数 k = ${k}，T2–T4 兑现，T5 回顾。骰子已封存，兑现时只读档、不重掷。</p>
    <p class="muted">征兆已记下，兑现那天会拿出来对照：你当时收到过什么信号、忽略了什么。</p></div>
    <div class="actions"><button class="primary" data-act="year-start">进入 T2 · 19 岁</button></div>`);
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
  s.ap = 3 - (s.flags.nextYearApPenalty || 0);
  if (s.flags.nextYearApPenalty) s.flags.nextYearApPenalty = 0;
  if (s.flags.selfFunded && turn >= 2 && turn <= 4) s.ap -= 1; // 自挣学费（A 卡兑现窗口 T2–T4）
  s.ap = Math.max(1, s.ap);
  // Housing state: dorm until the internship year, then renting. Events
  // with a housing gate (ev-rent) read this, not the player's age.
  if (!s.flags.housing) s.flags.housing = 'dorm';
  if (turn === 4) s.flags.housing = 'rent';
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
    ${eventCardHtml(ev, s)}
    ${venturePanelHtml(s)}
    <h2>今年的行动（${s.ap} AP）</h2>
    <div class="options">${ventureActionHtml(s)}${ACTIONS.map((ac) => `<button class="opt" data-act="action" data-id="${ac.id}" ${s.ap < ac.ap ? 'disabled' : ''}><b>${ac.name}</b><span>${ac.desc}</span></button>`).join('')}</div>
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
    ${eventCardHtml(ev, s)}
    ${venturePanelHtml(s)}
    <h2>今年的行动（${s.ap} AP）</h2>
    <div class="options">${ventureActionHtml(s)}${ACTIONS.map((ac) => `<button class="opt" data-act="action" data-id="${ac.id}" ${s.ap < ac.ap ? 'disabled' : ''}><b>${ac.name}</b><span>${ac.desc}</span></button>`).join('')}</div>
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
  for (const v of (s.ventures || [])) {
    const arch = VENTURE_ARCHETYPES.find((a) => a.id === v.archetype);
    if (!arch) continue;
    ventureLines.push(...resolveVentureYear(s, G.rng, v, arch, s.flags.advancedVenture === v.id));
  }
  s.flags.advancedVenture = null;
  s.rngState = G.rng.getState();
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
      ${ventureLines.length ? `<div><b>我的项目</b><p>${esc(ventureLines.join(' '))}</p></div>` : ''}
    </div>
    ${next <= 8 ? `<div class="actions"><button class="primary" data-act="year-next" data-id="${next}">进入 T${next} · ${17 + next} 岁</button></div>`
      : `<div class="actions"><button class="primary" data-act="to-slice">进入 T9 · 26 岁裁员之夜</button></div>`}`);
}

// ---------- T5 / T6 key years ----------
function screenT5() {
  const s = G.state;
  setScreen(`
    <h1>T5 · 22 岁 · 毕业去向</h1>
    <p class="intro">承诺卡 A（志愿）已在 T4 兑现——回头看，18 岁的选择把你带到了这里。专业系数 k = ${s.flags.majorK}，起点已定。同时签下承诺卡 B：第一份工作，锁定城市 × 行业，后续 80% 的机会只从这条线长出来。</p>
    <div class="card"><p><b>offer 档位（内部公式）：</b>档位 = floor((专业×0.5 + 表达×0.3 + 人脉×0.2) / 100 × 4) + 1。你当前是 <b>${offerTier(s)} 档</b>（1 小公司 / 2 普通 / 3 好公司 / 4 大厂）。</p></div>
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
  s.flags.housing = 'rent';
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
    s.commitments.A = { text: '志愿：听父母的', signedAt: 'T1', dueTurn: 4, snapshot: {} };
    s.commitments.B = { text: '第一份工作：普通公司', signedAt: 'T5', dueTurn: 6, snapshot: {} };
    s.flags.employment = 'employed';
    s.flags.housing = 'rent';
    s.rngState = rng.getState();
  }
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
  if (gap <= 0) {
    return [
      { text: '靠储蓄，不借', fx: { stress: -2 }, seal: '你算了一下存款，够撑三个月。这笔账不用跟家里开这个口。', omen: '你把存款 App 的数字截了个图，存进了备忘录。' },
      { text: '借 1 万以防万一', fx: { money: 1, stress: -2 }, seal: '你跟家里借了 1 万垫底。妈妈说：“不够再说。”', omen: '转账到账的短信提示音，在深夜格外响。' },
      { text: '压缩开支，硬扛', fx: { money: 0.5, stress: 2 }, seal: '你把下个月的预算砍了一半。外卖换成了自己做饭。', omen: '你打开记账 App，删掉了三个订阅。' },
    ];
  }
  const half = Math.round((gap / 2) * 10) / 10;
  return [
    { text: `跟家里借 ${gap} 万`, fx: { money: gap, family: -1, stress: -5 }, seal: '妈妈没问为什么，只说了一句：“卡号发来。”家庭线 −1——不是关系坏了，是你开始记账了。', omen: '转账到账的短信提示音，在深夜格外响。' },
    { text: '不借，自己扛', fx: { stress: 6 }, seal: '你没开口。这三个月会很难，但你想试试不靠家里能走多远。', omen: '你打开存款 App，看了一眼余额，又关上了。' },
    { text: `借一半，${half} 万`, fx: { money: half, stress: -2 }, seal: `你借了 ${half} 万。一半靠家里，一半靠自己——这是你能接受的中间态。`, omen: '妈妈多转了 5000，备注写着“别省着”。' },
  ];
}

function renderSliceDecision() {
  const s = G.state;
  const d = T9_SLICE.decisions[s.sliceStep];
  const options = d.dynamic === 'borrow' ? sliceBorrowOptions(s) : d.options;
  G.sliceOptions = options;
  const elapsed = Math.floor((Date.now() - (s.sliceStart || Date.now())) / 1000);
  setScreen(`
    <h1>T9 · 26 岁 · 裁员之夜</h1>
    <p class="intro">${esc(T9_SLICE.intro)}</p>
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
  G.meta.runsFinished = (G.meta.runsFinished || 0) + 1;
  saveMeta(G.meta);
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
  const omens = s.omenLog.filter((o) => o.turn === 9).map((o) => o.text).join(' ');
  setScreen(`
    <h1>切片结束 · 26 岁这一夜</h1>
    <p class="intro">${esc(T9_SLICE.outro)}</p>
    ${h2Card}
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

// v0.3: idea confirm screen. G.pendingIdea = { text, archId, themes,
//   explanation, aiReviewing, aiVerdict: null | {reasonable, archetypeId,
//   cost, reason}, aiError: '' }.
// AI review is opt-in: only when the player taps 请 AI 审核 is the idea
// (plus their explanation) sent to a free keyless AI endpoint; the verdict
// is the FINAL result — it sets the archetype and startup cost. If the
// verdict says the idea does not hold up, direct start is closed and the
// player either revises or validates for free. If the AI cannot be reached,
// the keyword result stands and the screen says so.
function renderIdeaConfirm() {
  const p = G.pendingIdea;
  if (!p) return;
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
  setScreen(`
    <h1>确认一下这条线</h1>
    <div class="card big">
      <p>你的原话：“${esc(p.text)}”</p>
      <p>系统识别为：<b>${esc(arch.name)}</b>${p.themes.length ? ' · 主题：' + p.themes.map((t) => esc(t)).join('、') : ''}</p>
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
    case 'idea-start': {
      const text = ($('#idea-text').value || '').trim();
      if (text.length < 2) { alert('先写一句你的点子。'); break; }
      const arch = classifyVenture(text, VENTURE_ARCHETYPES);
      const themes = ventureThemes(text, THEME_KEYWORDS);
      G.pendingIdea = { text, archId: arch.id, themes, explanation: '', aiReviewing: false, aiVerdict: null, aiError: '' };
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
          if (res.verdict.reasonable) G.pendingIdea.archId = res.verdict.archetypeId;
        } else {
          G.pendingIdea.aiVerdict = null;
          G.pendingIdea.aiError = res.error;
        }
        renderIdeaConfirm();
      });
      break;
    }
    case 'idea-confirm': {
      const sel = $('#idea-arch');
      const arch = VENTURE_ARCHETYPES.find((x) => x.id === (sel ? sel.value : (G.pendingIdea && G.pendingIdea.archId))) || VENTURE_ARCHETYPES[0];
      const text = (G.pendingIdea && G.pendingIdea.text) || '';
      const v = G.pendingIdea && G.pendingIdea.aiVerdict;
      const opts = {};
      if (v && v.reasonable && arch.id === v.archetypeId) {
        opts.costOverride = v.cost;
        opts.aiReviewed = true;
        opts.aiNote = v.reason;
      }
      const r = startVenture(G.state, text, arch, opts);
      if (!r.ok) { alert(r.error); break; }
      const vv = r.venture;
      G.state.flags.eventChoice = '赚钱点子 → 开始了「' + vv.name + '」';
      G.state.omenLog.push({ turn: G.state.turn, text: '你写下第一行计划的那天晚上，停电了。' });
      autosave('专属线已生成');
      setScreen(`
        <h1>专属线已生成</h1>
        <div class="card big"><h2>${esc(vv.name)}</h2>
          <p>${esc(arch.name)} · 启动 ${vv.cost} 万已付 · 风险：${esc(arch.risk)}</p>
          ${vv.aiReviewed ? `<p>AI 审核：${esc(vv.aiNote)}</p>` : ''}
          <p>里程碑：${arch.milestones.map((m, i) => `${i + 1}. ${esc(m.name)}（${esc(rewardText(m.reward))}）`).join('；')}</p>
          <p>跑通后每年：${esc(rewardText(arch.running))}。</p>
          <p class="muted">你的原话写进了这条线：“${esc(vv.text.slice(0, 60))}”。每年花 1 AP 推进，推进那一刻就封存结果，结算时只读档。</p>
        </div>
        <div class="actions"><button class="primary" data-act="year-refresh">回到今年</button></div>`);
      G.pendingIdea = null;
      break;
    }
    case 'idea-validate': {
      const sel = $('#idea-arch');
      const arch = VENTURE_ARCHETYPES.find((x) => x.id === (sel ? sel.value : (G.pendingIdea && G.pendingIdea.archId))) || VENTURE_ARCHETYPES[0];
      const text = (G.pendingIdea && G.pendingIdea.text) || '';
      const v = G.pendingIdea && G.pendingIdea.aiVerdict;
      const opts = { validateOnly: true };
      if (v && v.reasonable && arch.id === v.archetypeId) {
        opts.aiReviewed = true;
        opts.aiNote = v.reason;
      }
      const r = startVenture(G.state, text, arch, opts);
      if (!r.ok) { alert(r.error); break; }
      const vv = r.venture;
      G.state.flags.eventChoice = '赚钱点子 → 开始验证「' + vv.name + '」';
      autosave('验证已开始');
      setScreen(`
        <h1>验证开始了</h1>
        <div class="card big"><h2>${esc(vv.name)}</h2>
          <p>验证中，不花钱：${esc(arch.validation)}</p>
          ${vv.aiReviewed ? `<p>AI 审核：${esc(vv.aiNote)}</p>` : ''}
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
