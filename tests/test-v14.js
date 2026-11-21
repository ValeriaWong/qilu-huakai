'use strict';
// v1.1 tests (B-xx) — WorkBuddy mechanism recheck 2026-11-18:
// (b) 创业年代技术表 + adapter + confirm-screen wiring; H0 two-level
// confirm (obey stance); T9 out-of-table default 0; NPC new bands;
// 考公 78; 外企 82/75 (2014-17 is 82 per final adjudication 2026-11-20). (The (b) table was PAUSED 2026-11-17 pending
// verification; the recheck supplied it, so the table + adapter +
// these tests land here, not in test-v11.)
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const REPO = path.join(__dirname, '..');

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('PASS  ' + name);
  else { failures += 1; console.log('FAIL  ' + name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); }
}

// --- stub DOM (same shape as test-v11) ---
const els = new Map();
function makeEl(sel) {
  const el = {
    _html: '', _value: '', disabled: false, textContent: '',
    listeners: {},
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = String(v); },
    get value() { return this._value; },
    set value(v) { this._value = String(v); },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
  };
  els.set(sel, el);
  return el;
}
let clickHandler = null;
const sandbox = {
  console,
  setTimeout: () => 0, clearTimeout: () => {},
  document: {
    querySelector(sel) { return els.get(sel) || makeEl(sel); },
    querySelectorAll() { return []; },
    addEventListener(type, fn) { if (type === 'click') clickHandler = fn; },
  },
  window: { scrollTo() {} },
  alert(msg) { sandbox.__alerts.push(String(msg)); },
  __alerts: [],
  localStorage: (() => {
    const m = new Map();
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
    };
  })(),
};
vm.createContext(sandbox);
for (const f of ['rng.js', 'data.js', 'interpersonal.js', 'stocks.js', 'gaokao-lines.js', 'era-events.js', 'era.js', 'engine.js', 'ai-review.js', 'analytics.js', 'game.js']) {
  vm.runInContext(fs.readFileSync(path.join(REPO, 'js', f), 'utf8'), sandbox, { filename: f });
}
const ctx = (code) => vm.runInContext(code, sandbox);
const screenHtml = () => (els.get('#screen') ? els.get('#screen')._html : '');
function click(act, id) {
  clickHandler({ target: { closest: () => ({ dataset: { act, id: id === undefined ? '' : String(id) } }) } });
}
// Era state (from test-v11).
function eraState(o) {
  const opts = Object.assign({
    birthYear: 1995, examYear: 2013, familyKey: 'model', homeRegion: 'jilin',
    econ: { tier: 'E2', cash: 20, min: 8, max: 30, label: 'E2 · 8–30万' },
    bg: { locale: 'city', urban: true, soe: true, stocks: true, trading: true, selfHouse: false, medical: false },
    attrs: null, turn: 0,
  }, o || {});
  ctx(`G = { state: newRun(12345, { difficulty: 'normal' }), rng: makeRng(12345), meta: loadMeta(), pickedObsessions: new Set(), pickedDifficulty: 'normal', pickedSlot: 1 };
    G.state.turn = ${opts.turn};
    G.state.origin = { familyKey: '${opts.familyKey}', familyName: '模范父母', card: { family: 'f', parents: 'p', money: 'm', city: 'c', verdict: 'v' }, fragments: ['片段一', '片段二', '片段三'], counter: false, attrs: { money: 5, health: 85, stress: 10, skill: 20, express: 20, network: 20, influence: 20, family: 0, debt: 0 }, homeRegion: '${opts.homeRegion}', econ: ${JSON.stringify(opts.econ)}, bg: ${JSON.stringify(opts.bg)} };
    G.state.flags.era = { birthYear: ${opts.birthYear}, examYear: ${opts.examYear} };
    G.state.flags.familyEcon = G.state.origin.econ;
    G.state.flags.familyBg = G.state.origin.bg;
    G.state.flags.familySafety = '家里能接住你一次，但只有一次。';`);
  if (opts.attrs) ctx(`Object.assign(G.state.attrs, ${JSON.stringify(opts.attrs)});`);
}
// T1 era setup with a controlled H0 (from test-v11).
function gaokaoCtx(examYear, base) {
  const track = examYear >= 2020 ? '不分' : '文';
  return `G.state.flags.gaokao = { region: 'shandong', base: ${base}, era: { birthYear: ${examYear - 18}, examYear: ${examYear}, track: '${track}', mode: '${examYear >= 2020 ? 'new33' : 'split'}' }, row: lookupLine('shandong', ${examYear}, '${track}') };`;
}
function toT1Era(examYear, h0value, familyKey, base) {
  eraState({ birthYear: examYear - 18, examYear, familyKey: familyKey || 'model', turn: 1 });
  ctx(`G.state.sealed.H0 = { value: ${h0value}, omens: [{ text: '你妈说隔壁家孩子学了会计。' }] };`);
  ctx(gaokaoCtx(examYear, base === undefined ? 600 : base));
  ctx('screenT1()');
}
// Idea flow (from test-v10): type the idea, open the confirm screen.
function startIdea(text) {
  sandbox.document.querySelector('#idea-text').value = text;
  click('idea-start');
}
// Venture in a given calendar year: examYear + turn - 1 = year.
function ventureState(examYear, turn) {
  eraState({ birthYear: examYear - 18, examYear, turn });
  ctx('G.state.attrs.money = 5;');
}

// ---------- (b) 创业年代技术表 ----------
{
  const B = ctx('({ VENTURE_TECH_SEGMENTS, ventureTechForYear, adaptVentureTech })');
  check('B-01 segments: 11 segments in order (1988-2009 split by product launch years, not one tech level)', B.VENTURE_TECH_SEGMENTS.length === 11
    && B.VENTURE_TECH_SEGMENTS.map((s) => s.label).join('|') === 'PC 单机时代|互联网早期|宽带 / 搜索 / 电商萌芽|Web 2.0 / 社交 / 移动前夜|规则 / 关键词 / 传统 ML|传统 NLP / 推荐 + 移动互联网|深度学习 NLP + 短视频 / 直播电商|BERT 时代|ChatGPT 式生成式 AI|RAG / Agent|架空');
  const label = (y) => B.ventureTechForYear(y).label;
  check('B-01 segment years: 1988/1993 PC; 1994/1999 early internet; 2000/2005 broadband; 2006/2009 Web 2.0; 2010/2012 rules; 2013/2015 trad NLP; 2016/2018 deep learning; 2019/2021 BERT; 2022/2023 generative; 2024/2026 RAG',
    label(1988) === 'PC 单机时代' && label(1993) === 'PC 单机时代'
    && label(1994) === '互联网早期' && label(1999) === '互联网早期'
    && label(2000) === '宽带 / 搜索 / 电商萌芽' && label(2005) === '宽带 / 搜索 / 电商萌芽'
    && label(2006) === 'Web 2.0 / 社交 / 移动前夜' && label(2009) === 'Web 2.0 / 社交 / 移动前夜'
    && label(2010) === '规则 / 关键词 / 传统 ML' && label(2012) === '规则 / 关键词 / 传统 ML'
    && label(2013) === '传统 NLP / 推荐 + 移动互联网' && label(2015) === '传统 NLP / 推荐 + 移动互联网'
    && label(2016) === '深度学习 NLP + 短视频 / 直播电商' && label(2018) === '深度学习 NLP + 短视频 / 直播电商'
    && label(2019) === 'BERT 时代' && label(2021) === 'BERT 时代'
    && label(2022) === 'ChatGPT 式生成式 AI' && label(2023) === 'ChatGPT 式生成式 AI'
    && label(2024) === 'RAG / Agent' && label(2026) === 'RAG / Agent');
  check('B-01 pre-1988 clamps to the first segment', label(1987) === 'PC 单机时代' && label(1980) === 'PC 单机时代');
  check('B-01 pre-2010 tech has launch-year deferrals (淘宝 2001 -> 2003; 门户 1990 -> 1994)', B.adaptVentureTech('开个淘宝网店', 2001).needed === true && B.adaptVentureTech('开个淘宝网店', 2001).deferUntil === 2003 && B.adaptVentureTech('做个门户网站', 1990).needed === true && B.adaptVentureTech('做个门户网站', 1990).deferUntil === 1994);
  check('B-01 2027+ is fictional (no adaptation)', label(2027) === '架空' && label(2030) === '架空' && B.ventureTechForYear(2027).tech.length === 0);
  check('B-01 word2vec sits in the 2013-15 segment', B.ventureTechForYear(2014).tech.includes('词向量'));
  check('B-01 2024 segment tech includes RAG + Agent', B.ventureTechForYear(2025).tech.includes('RAG') && B.ventureTechForYear(2025).tech.includes('Agent'));

  const ad = (text, year) => B.adaptVentureTech(text, year);
  check('B-02 ChatGPT in 2013: needed, requested 生成式 AI, available = 2013 segment tech', (() => {
    const r = ad('用 ChatGPT 做一个求职助手', 2013);
    return r.needed === true && r.requested.includes('生成式 AI') && r.segment.label === '传统 NLP / 推荐 + 移动互联网' && r.available.includes('传统 NLP') && r.available.includes('推荐系统');
  })());
  check('B-02 ChatGPT in 2023: not needed', ad('用 ChatGPT 做一个求职助手', 2023).needed === false);
  check('B-02 RAG in 2022: needed; in 2024: not needed', ad('做一个 RAG 知识库助手', 2022).needed === true && ad('做一个 RAG 知识库助手', 2022).requested.includes('RAG / Agent') && ad('做一个 RAG 知识库助手', 2024).needed === false);
  check('B-02 BERT in 2017: needed; in 2019: not needed', ad('用 BERT 做文本分类服务', 2017).needed === true && ad('用 BERT 做文本分类服务', 2019).needed === false);
  check('B-02 深度学习 in 2014: needed; in 2016: not needed', ad('用深度学习做图像识别', 2014).needed === true && ad('用深度学习做图像识别', 2016).needed === false);
  check('B-02 word2vec in 2013: not needed (released 2013); in 2011: needed', ad('用 word2vec 做词向量搜索', 2013).needed === false && ad('用 word2vec 做词向量搜索', 2011).needed === true);
  check('B-02 区块链 in 2016: needed (2017-18 wave); in 2018: not needed', ad('做区块链溯源', 2016).needed === true && ad('做区块链溯源', 2018).needed === false);
  check('B-02 短视频 in 2015: needed; in 2016: not needed', ad('开个短视频账号卖货', 2015).needed === true && ad('开个短视频账号卖货', 2016).needed === false);
  check('B-02 公众号 in 2012: needed; in 2013: not needed', ad('开个公众号卖课', 2012).needed === true && ad('开个公众号卖课', 2013).needed === false);
  check('B-02 plain idea never triggers: 奶茶店 in any year', ad('开奶茶店', 2011).needed === false && ad('开奶茶店', 2025).needed === false);
  check('B-02 fictional year never triggers, even for ChatGPT', ad('用 ChatGPT 做一个求职助手', 2027).needed === false && ad('做一个 RAG 知识库助手', 2030).needed === false);
  check('B-02 multiple unavailable techs all listed', (() => {
    const r = ad('用 ChatGPT + RAG 做智能体', 2015);
    return r.needed === true && r.requested.includes('生成式 AI') && r.requested.includes('RAG / Agent');
  })());
}

// ---------- (b) idea-flow wiring ----------
{
  // 2013 cohort, turn 4 -> calendar 2016: ChatGPT does not exist yet.
  ventureState(2013, 4);
  startIdea('用 ChatGPT 做一个求职助手');
  check('B-03 2016 idea: eraYear 2016, adapter flags 生成式 AI, deferUntil 2022', ctx('G.pendingIdea.eraYear') === 2016 && ctx('G.pendingIdea.eraAdapt.needed') === true && ctx('G.pendingIdea.eraAdapt.requested').includes('生成式 AI') && ctx('G.pendingIdea.eraAdapt.deferUntil') === 2022);
  check('B-03 confirm panel shows the era warning + three responses, no keep default, no direct confirm', screenHtml().includes('年代提醒') && screenHtml().includes('生成式 AI') && screenHtml().includes('data-act="idea-era"') && screenHtml().includes('换成当时能用的技术，现在就开') && screenHtml().includes('先记下来，等技术出现再开') && screenHtml().includes('先免费验证一个当时能做的简化版') && !screenHtml().includes('就按我写的来') && !screenHtml().includes('id="idea-era-adapt"') && !screenHtml().includes('data-act="idea-confirm"'));
  // adapt: creates the line with the era mark + note naming the swap.
  click('idea-era', 'adapt');
  check('B-03 adapt: venture stores eraAdapted + note naming the swap', ctx('G.state.ventures.length') === 1 && ctx('G.state.ventures[0].eraAdapted') === true && String(ctx('G.state.ventures[0].eraTechNote')).includes('生成式 AI') && String(ctx('G.state.ventures[0].eraTechNote')).includes('深度学习') && screenHtml().includes('年代适配'));
  // variant: free validation of an era-feasible simplified version.
  ventureState(2013, 4);
  startIdea('用 ChatGPT 做一个求职助手');
  click('idea-era', 'variant');
  check('B-03 variant: validating venture keeps the era mark', ctx('G.state.ventures[0].status') === 'validating' && ctx('G.state.ventures[0].eraAdapted') === true);
  // defer: NO venture is created; the note is deferred, and the screen
  // never names the future year (no spoiler: no "2022", no "七年后").
  ventureState(2013, 4);
  startIdea('用 ChatGPT 做一个求职助手');
  click('idea-era', 'defer');
  check('B-03 defer: no venture created, deferred note recorded', ctx('G.state.ventures.length') === 0 && (ctx('G.state.ideaNotes') || []).some((n) => n.deferred === true && n.deferredUntil === 2022));
  check('B-03 defer screen never names the future year', screenHtml().includes('先记下来了') && !screenHtml().includes('2022') && !screenHtml().includes('七年'));
  // No mismatch, no panel: a 2016 milk-tea idea shows no era warning.
  ventureState(2013, 4);
  startIdea('开奶茶店');
  check('B-03 no mismatch: no era warning, no era responses', !screenHtml().includes('年代提醒') && !screenHtml().includes('data-act="idea-era"'));
  // Same idea in 2024: ChatGPT already exists, no warning either.
  ventureState(2021, 4);
  startIdea('用 ChatGPT 做一个求职助手');
  check('B-03 2024 idea: no era warning (tech already exists)', ctx('G.pendingIdea.eraAdapt.needed') === false && !screenHtml().includes('年代提醒'));
}

// ---------- (d) H0 two-level confirm, obey stance ----------
{
  const H = ctx('({ H0_TAMPER_THRESHOLD, isH0Tampered })');
  check('B-04 H0 tamper threshold is the named constant 60 [PLACEHOLDER]', H.H0_TAMPER_THRESHOLD === 60);
  toT1Era(2015, 70, 'model');
  ctx(`document.querySelector('#t1-major').value = '计算机';`);
  click('t1-pick', 'obey');
  check('B-04 draft obey: choice made, NOT confirmed, tamper open, confirm button shown', ctx('G.state.flags.t1ChoiceMade') === true && ctx('G.state.flags.t1Confirmed') !== true && H.isH0Tampered(ctx('G.state')) === true && screenHtml().includes('data-act="t1-confirm"') && screenHtml().includes('听父母的'));
  click('t1-confirm');
  check('B-04 submit obey: major 省内师范 (parents), tamper ends', ctx('G.state.major').name === '省内师范' && ctx('G.state.major').source === 'parents' && H.isH0Tampered(ctx('G.state')) === false);
}

// ---------- T9 out-of-table years default 0 (explicit rule, v1.1) ----------
{
  const T = ctx('({ t9YearAdjustment, t9IndustryAdjustment, t9H2Chance })');
  check('B-05 out-of-table years: Y defaults 0 (2018/2019/2024/2025/2026)', [2018, 2019, 2024, 2025, 2026].every((y) => T.t9YearAdjustment(y) === 0));
  check('B-05 out-of-table years: I defaults 0 for any industry', T.t9IndustryAdjustment(2019, '互联网') === 0 && T.t9IndustryAdjustment(2024, '教培') === 0 && T.t9IndustryAdjustment(2026, '互联网') === 0 && T.t9IndustryAdjustment(2018, '线下服务') === 0);
  check('B-05 out-of-table years: H2 chance is base 20 alone', T.t9H2Chance(0, 2019, '互联网') === 20 && T.t9H2Chance(0, 2025, '教培') === 20);
}

// ---------- (f) NPC new bands / 考公 78 / 外企 82-75 ----------
{
  const F = ctx('({ npcContactForYear, civilServiceAppeal, civilServiceWeight, foreignFirmVisibility })');
  check('B-06 NPC 2009: no 微博， has 开心网', (() => { const c = F.npcContactForYear(2009); return !c.includes('微博') && c.includes('开心网'); })());
  check('B-06 NPC 2010: 微博 + 开心网', (() => { const c = F.npcContactForYear(2010); return c.includes('微博') && c.includes('开心网'); })());
  check('B-06 NPC 2013: 陌陌 moves here; 2012 has none', F.npcContactForYear(2013).includes('陌陌') && !F.npcContactForYear(2012).includes('陌陌'));
  check('B-06 NPC 2016: no 小红书 yet; 2018: 小红书', !F.npcContactForYear(2016).includes('小红书') && F.npcContactForYear(2018).includes('小红书'));
  check('B-07 考公 2024-2026 appeal is 78 (weight 0.78)', F.civilServiceAppeal(2024) === 78 && F.civilServiceAppeal(2025) === 78 && F.civilServiceAppeal(2026) === 78 && F.civilServiceWeight(2025) === 0.78);
  check('B-07 外企 2015/2016 is 82, 2019/2020 is 75', F.foreignFirmVisibility(2015).weight === 82 && F.foreignFirmVisibility(2016).weight === 82 && F.foreignFirmVisibility(2019).weight === 75 && F.foreignFirmVisibility(2020).weight === 75);
}

console.log(failures === 0 ? '\nALL PASS (v14)' : `\n${failures} FAILURE(S) (v14)`);
process.exit(failures === 0 ? 0 : 1);
