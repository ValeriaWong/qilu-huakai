'use strict';
// v1.4.3 股票线历史数据表测试（V19-xx）。
// 只测 js/stocks.js 的纯数据 + 纯函数，不碰游戏逻辑。
// Harness：沿用 test-v18.js 的 vm 沙箱写法（DOM stub 只为 data.js
// 的顶层代码服务；这里只加载 rng.js、data.js、stocks.js）。
// 数据来源：研究报告 §8（上证年表已核实全文）；2024 年行按三源修正，
// 2026 未收官不进表，深证成指与沪深 300/创业板点位、散户盈亏比例
// 因未核实一律不收录。
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const REPO = path.join(__dirname, '..');

let failures = 0;
let total = 0;
function check(name, cond, extra) {
  total += 1;
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
const sandbox = {
  console,
  setTimeout: () => 0, clearTimeout: () => {},
  document: {
    querySelector(sel) { return els.get(sel) || makeEl(sel); },
    querySelectorAll() { return []; },
    addEventListener() {},
  },
  window: { scrollTo() {} },
  btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
  atob: (s) => Buffer.from(s, 'base64').toString('binary'),
  alert() {},
  confirm() { return true; },
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
for (const f of ['rng.js', 'data.js', 'stocks.js']) {
  vm.runInContext(fs.readFileSync(path.join(REPO, 'js', f), 'utf8'), sandbox, { filename: f });
}
const ctx = (code) => vm.runInContext(code, sandbox);

// ---------- 年表：共 16 行（2010–2025） ----------
check('V19-01 年表共 16 行，2010–2025 全齐',
  ctx('STOCK_INDEX_YEARS.length') === 16
  && ctx('STOCK_INDEX_YEARS.map((r) => r.year).join(",")') === '2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025');
check('V19-02 每行字段齐全：year/close/change/regime，且 close/change 为数字',
  ctx(`STOCK_INDEX_YEARS.every((r) => Number.isInteger(r.year) && typeof r.close === 'number' && typeof r.change === 'number' && typeof r.regime === 'string' && r.regime.length > 0)`) === true);
check('V19-03 2014 close 3234.68 / change +52.87',
  ctx('stockYear(2014).close') === 3234.68 && ctx('stockYear(2014).change') === 52.87);
check('V19-04 2015 close 3539.18 / change +9.41',
  ctx('stockYear(2015).close') === 3539.18 && ctx('stockYear(2015).change') === 9.41);
check('V19-05 2024 close 3351.76 / change +12.67（修正数，不是维基错数 3407.33 / +14.53）',
  ctx('stockYear(2024).close') === 3351.76 && ctx('stockYear(2024).change') === 12.67
  && ctx('STOCK_INDEX_YEARS.every((r) => r.close !== 3407.33)') === true);
check('V19-06 2025 close 3968.84 / change +18.41（按修正后 2024 基数重算）',
  ctx('stockYear(2025).close') === 3968.84 && ctx('stockYear(2025).change') === 18.41);
check('V19-07 2011 change -21.68',
  ctx('stockYear(2011).change') === -21.68 && ctx('stockYear(2011).close') === 2199.42);
check('V19-08 涨幅自洽：2025 涨幅 ≈ 3968.84/3351.76-1（18.41%）',
  Math.abs(ctx('stockYear(2025).close') / ctx('stockYear(2024).close') - 1 - ctx('stockYear(2025).change') / 100) < 0.0002);

// ---------- 无 2026 行；查不到返回 null ----------
check('V19-09 无 2026 行：stockYear(2026) 与 stockYear(2009) 返回 null',
  ctx('stockYear(2026)') === null && ctx('stockYear(2009)') === null && ctx('STOCK_INDEX_YEARS.some((r) => r.year === 2026)') === false);
check('V19-10 stockRegime 查不到返回 null：2026 与 2009',
  ctx('stockRegime(2026)') === null && ctx('stockRegime(2009)') === null);

// ---------- regime 抽查 ----------
check('V19-11 regime：2015 疯牛→股灾、2018 全面熊市、2024 924反转',
  ctx(`stockRegime(2015)`) === '疯牛→股灾' && ctx(`stockRegime(2018)`) === '全面熊市' && ctx(`stockRegime(2024)`) === '924反转');
check('V19-12 regime 全表与 §8.1.5 一致',
  ctx(`STOCK_INDEX_YEARS.map((r) => r.regime).join('|')`) === '震荡跌|熊市|磨底反弹|分化|牛市启动|疯牛→股灾|熔断熊市|结构牛|全面熊市|反弹牛|疫情V型+结构牛|分化顶|熊市|阴跌|924反转|科技牛');

// ---------- 重大事件表：共 7 条 ----------
check('V19-13 STOCK_MAJOR_EVENTS 共 7 条',
  ctx('STOCK_MAJOR_EVENTS.length') === 7
  && ctx('STOCK_MAJOR_EVENTS.map((e) => e.date).join(",")') === '2015-06-12,2016-01-04,2016-01-07,2019-06-13,2023-02-17,2024-09-24,2025-04-07');
check('V19-14 事件抽查：2016-01-07 第二次熔断、当晚取消',
  ctx(`STOCK_MAJOR_EVENTS.find((e) => e.date === '2016-01-07').title`) === '第二次熔断，当晚取消'
  && ctx(`STOCK_MAJOR_EVENTS.find((e) => e.date === '2016-01-07').body`).includes('暂停实施熔断机制'));
check('V19-15 事件抽查：2024-09-24 924 行情启动',
  ctx(`STOCK_MAJOR_EVENTS.find((e) => e.date === '2024-09-24').title`) === '924 行情启动'
  && ctx(`STOCK_MAJOR_EVENTS.find((e) => e.date === '2024-09-24').body`).includes('一揽子政策'));
check('V19-16 事件抽查：2015-06-12 牛市顶 5178.19 点、2025-04-07 对等关税黑色星期一（摘要级，不写未核实的精确跌幅）',
  ctx(`STOCK_MAJOR_EVENTS.find((e) => e.date === '2015-06-12').title`) === '牛市顶 5178.19 点'
  && ctx(`STOCK_MAJOR_EVENTS.find((e) => e.date === '2025-04-07').title`) === '对等关税黑色星期一'
  && ctx(`STOCK_MAJOR_EVENTS.find((e) => e.date === '2025-04-07').body`).includes('大跌')
  && ctx(`STOCK_MAJOR_EVENTS.find((e) => e.date === '2025-04-07').body`).indexOf('-7.34%') === -1);
check('V19-17 事件每行字段齐全：date/title/body/verified 均为非空字符串',
  ctx(`STOCK_MAJOR_EVENTS.every((e) => typeof e.date === 'string' && e.date.length === 10 && typeof e.title === 'string' && e.title.length > 0 && typeof e.body === 'string' && e.body.length > 0 && (e.verified === 'verified' || e.verified === 'summary'))`) === true);

// ---------- 未核实内容一律不进表 ----------
check('V19-18 全表不含散户盈亏比例字样：七亏二平一赚 / 八亏一平一赚 / 18.9%',
  ctx(`JSON.stringify(STOCK_INDEX_YEARS).indexOf('七亏二平一赚')`) === -1
  && ctx(`JSON.stringify(STOCK_INDEX_YEARS).indexOf('八亏一平一赚')`) === -1
  && ctx(`JSON.stringify(STOCK_MAJOR_EVENTS).indexOf('七亏二平一赚')`) === -1
  && ctx(`JSON.stringify(STOCK_MAJOR_EVENTS).indexOf('八亏一平一赚')`) === -1
  && ctx(`JSON.stringify(STOCK_INDEX_YEARS).indexOf('18.9%')`) === -1
  && ctx(`JSON.stringify(STOCK_MAJOR_EVENTS).indexOf('18.9%')`) === -1);
check('V19-19 全表不含维基 2024 错数 3407.33 / 14.53',
  ctx(`JSON.stringify(STOCK_INDEX_YEARS).indexOf('3407.33')`) === -1
  && ctx(`JSON.stringify(STOCK_INDEX_YEARS).indexOf('14.53')`) === -1);

// ---------- 核实级别：前 5 条已核实，后 2 条仅搜索摘要 ----------
check('V19-21 核实级别：前 5 条 verified，后 2 条 summary；摘要级事件 body 不含未核实的精确涨跌幅',
  ctx(`STOCK_MAJOR_EVENTS.slice(0, 5).every((e) => e.verified === 'verified')`) === true
  && ctx(`STOCK_MAJOR_EVENTS.slice(5).every((e) => e.verified === 'summary')`) === true
  && ctx(`STOCK_MAJOR_EVENTS.slice(5).every((e) => e.body.indexOf('4.15%') === -1 && e.body.indexOf('5.54%') === -1 && e.body.indexOf('-7.34%') === -1)`) === true
  && ctx(`STOCK_MAJOR_EVENTS.slice(5).every((e) => e.body.indexOf('媒体报道口径') !== -1)`) === true);

// ---------- stockYear 返回的是行对象本身 ----------
check('V19-20 stockYear 返回行对象：2010 close 2808.08 / regime 震荡跌',
  ctx('stockYear(2010).close') === 2808.08 && ctx('stockYear(2010).regime') === '震荡跌' && ctx('stockYear(2010).year') === 2010);

console.log(failures === 0 ? `ALL PASS (v19, ${total}/${total})` : failures + ' FAILURE(S) (v19, ' + total + ' checks)');
process.exit(failures === 0 ? 0 : 1);
