'use strict';
// v1.4.3 tests (V19-xx): 职场人际事件数据表（js/interpersonal.js）。
// 来源：研究报告 §7，全 95 条（上下级 25、同事 15、派系 8、其他 21、
// 局中局 16、web3 10）。只测数据，不碰游戏逻辑。
// Harness: same vm sandbox + DOM stub as test-v18, but only rng.js,
// data.js and interpersonal.js are loaded (interpersonal.js has no
// other module dependencies).
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const REPO = path.join(__dirname, '..');

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('PASS  ' + name);
  else { failures += 1; console.log('FAIL  ' + name + (extra !== undefined ? ' :: ' + String(extra).slice(0, 300) : '')); }
}

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
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  alert(msg) { sandbox.__alerts.push(String(msg)); },
  __alerts: [],
  confirm(msg) { sandbox.__confirms.push(String(msg)); return true; },
  __confirms: [],
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
for (const f of ['rng.js', 'data.js', 'interpersonal.js']) {
  vm.runInContext(fs.readFileSync(path.join(REPO, 'js', f), 'utf8'), sandbox, { filename: f });
}
const ctx = (code) => vm.runInContext(code, sandbox);
const EVENTS = ctx('INTERPERSONAL_EVENTS');
const CATS = ctx('INTERPERSONAL_EVENT_CATS');

const countBy = (cat) => EVENTS.filter((e) => e.cat === cat).length;

// ---------- 总数与六类条数 ----------
check('V19-01 总数 95 条', EVENTS.length === 95, EVENTS.length);
check('V19-02a 上下级 25 条', countBy('superior') === 25, countBy('superior'));
check('V19-02b 同事 15 条', countBy('peer') === 15, countBy('peer'));
check('V19-02c 派系 8 条', countBy('faction') === 8, countBy('faction'));
check('V19-02d 其他 21 条', countBy('other') === 21, countBy('other'));
check('V19-02e 局中局 16 条', countBy('scheme') === 16, countBy('scheme'));
check('V19-02f web3 10 条', countBy('web3') === 10, countBy('web3'));

// ---------- id 唯一与编号规则 ----------
{
  const ids = EVENTS.map((e) => e.id);
  check('V19-03 id 唯一', new Set(ids).size === ids.length, ids.length - new Set(ids).size + ' duplicates');
  const prefix = { superior: 'ip-superior-', peer: 'ip-peer-', faction: 'ip-faction-', other: 'ip-other-', scheme: 'ip-scheme-', web3: 'ip-web3-' };
  check('V19-04 id 前缀与 cat 一致（ip-<cat>-NN）',
    EVENTS.every((e) => e.id.startsWith(prefix[e.cat]) && /^ip-[a-z0-9]+-\d{2}$/.test(e.id)));
  check('V19-05 每类内编号连续从 01 开始',
    Object.keys(prefix).every((cat) => {
      const ns = EVENTS.filter((e) => e.cat === cat).map((e) => parseInt(e.id.slice(prefix[cat].length), 10)).sort((a, b) => a - b);
      return ns.every((n, i) => n === i + 1);
    }));
}

// ---------- 每条结构完整 ----------
check('V19-06 每条都有 id/cat/title/body/effect',
  EVENTS.every((e) => typeof e.id === 'string' && e.id
    && typeof e.cat === 'string' && e.cat
    && typeof e.title === 'string' && e.title
    && typeof e.body === 'string' && e.body.length > 10
    && e.effect && typeof e.effect === 'object'));
check('V19-07 每条都有 trigger，且 company 是数组',
  EVENTS.every((e) => e.trigger && Array.isArray(e.trigger.company)));
check('V19-08 cat 只在六类之内', EVENTS.every((e) => Object.prototype.hasOwnProperty.call(CATS, e.cat)));

// ---------- body 泛化：无真实公司名 / 人名 / 统计数字 ----------
const BANNED_COMPANIES = ['阿里', '谷歌', '美团', '字节', '网易', '搜狗', '中芯', '拼多多', '携程', '百度', '深兰', '腾讯', '华为', '小米', '京东'];
const BANNED_NAMES = ['梁孟松', '蒋尚义', 'YAMY', 'Byron', 'Cabot', '赵海平', '王小川', '徐明朝'];
{
  const badCompany = EVENTS.filter((e) => BANNED_COMPANIES.some((w) => e.body.includes(w)));
  check('V19-09 body 不含真实公司名（阿里/谷歌/美团/字节/网易/搜狗/中芯/拼多多/携程/百度/深兰/腾讯/华为/小米/京东）',
    badCompany.length === 0, badCompany.map((e) => e.id).join(','));
  const badName = EVENTS.filter((e) => BANNED_NAMES.some((w) => e.body.includes(w)));
  check('V19-10 body 不含真实人名（梁孟松/蒋尚义/YAMY/Byron/Cabot/赵海平/王小川/徐明朝）',
    badName.length === 0, badName.map((e) => e.id).join(','));
  const badStat = EVENTS.filter((e) => e.body.includes('%') || e.body.includes('63.65'));
  check('V19-11 body 不含“%”与“63.65”这类统计数字',
    badStat.length === 0, badStat.map((e) => e.id).join(','));
}

// ---------- web3 / scheme 标记 ----------
{
  const web3 = EVENTS.filter((e) => e.cat === 'web3');
  check('V19-12 web3 类 10 条全有 trigger.sector=\'web3\'',
    web3.length === 10 && web3.every((e) => e.trigger.sector === 'web3'));
  check('V19-13 非 web3 类不填 sector',
    EVENTS.filter((e) => e.cat !== 'web3').every((e) => e.trigger.sector === undefined));
  const scheme = EVENTS.filter((e) => e.cat === 'scheme');
  check('V19-14 scheme 类 16 条全有 trigger.hidden=true',
    scheme.length === 16 && scheme.every((e) => e.trigger.hidden === true));
  check('V19-15 非 scheme 类不填 hidden',
    EVENTS.filter((e) => e.cat !== 'scheme').every((e) => e.trigger.hidden === undefined));
}

// ---------- trigger.company 取值 ----------
{
  const allowed = ['small', 'medium', 'large', 'foreign', 'startup', 'public'];
  check('V19-16 trigger.company 取值只在 small/medium/large/foreign/startup/public 之内',
    EVENTS.every((e) => e.trigger.company.every((c) => allowed.includes(c))));
}

// ---------- effect 键与数值范围 ----------
{
  const allowedKeys = ['stress', 'money', 'influence', 'network', 'health', 'family'];
  check('V19-17 effect 的键只在 stress/money/influence/network/health/family 六个之内',
    EVENTS.every((e) => Object.keys(e.effect).every((k) => allowedKeys.includes(k))));
  const inRange = (e) => {
    const f = e.effect;
    return (f.stress === undefined || (Number.isInteger(f.stress) && f.stress >= 2 && f.stress <= 8))
      && (f.money === undefined || (Number.isInteger(f.money) && f.money >= -3 && f.money <= 0))
      && (f.influence === undefined || (Number.isInteger(f.influence) && f.influence >= -5 && f.influence <= 0))
      && (f.network === undefined || (Number.isInteger(f.network) && f.network >= -3 && f.network <= 0))
      && (f.health === undefined || (f.health === 0 || f.health === -1))
      && (f.family === undefined || (f.family === 0 || f.family === -1));
  };
  const badFx = EVENTS.filter((e) => !inRange(e));
  check('V19-18 effect 数值在合理范围（stress 2～8、money -3～0、influence -5～0、network -3～0、health/family 0 或 -1）',
    badFx.length === 0, badFx.map((e) => e.id).join(','));
  check('V19-19 每条 effect 至少含 stress（人际事件总有压力代价）',
    EVENTS.every((e) => typeof e.effect.stress === 'number'));
}

// ---------- 分类表 ----------
check('V19-20 INTERPERSONAL_EVENT_CATS 六类齐全，count 与实际条数一致',
  ['superior', 'peer', 'faction', 'other', 'scheme', 'web3'].every((cat) => CATS[cat] && CATS[cat].count === countBy(cat))
  && Object.keys(CATS).length === 6);
check('V19-21 分类表每类都有中文名',
  Object.values(CATS).every((c) => typeof c.name === 'string' && c.name.length > 0));

console.log(failures === 0 ? 'ALL PASS (v19)' : failures + ' FAILURE(S) (v19)');
process.exit(failures === 0 ? 0 : 1);
