'use strict';
// v1.4.3 tests (V19-xx): 高考线数据校准 —— 吉林 2026 专科线纠错 +
// 2023–2025 三年补线（报告 §3.4，教育在线转载，status 一律待核实）。
//   吉林 2026 历史/物理 vocational 150 → 160（官方 160，报告 §3 前提纠正 2）。
//   山东 2023–2025 改为单行“不分”（删多余 理 行，仿山东 2020 只 1 行先例）；
//     辽宁 2023–2025 历史/物理；吉林/黑龙江 2023 文史/理工（老高考一本/二本），
//     2024–2025 历史/物理。
// Harness: same vm sandbox + DOM stub as test-v18 (plus confirm stub).
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
  // engine.js exportCode/importCode use btoa/atob (browser APIs);
  // the Node vm sandbox needs Buffer-backed equivalents.
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
for (const f of ['rng.js', 'data.js', 'interpersonal.js', 'stocks.js', 'gaokao-lines.js', 'era-events.js', 'era.js', 'engine.js', 'ai-review.js', 'analytics.js', 'game.js']) {
  vm.runInContext(fs.readFileSync(path.join(REPO, 'js', f), 'utf8'), sandbox, { filename: f });
}
const ctx = (code) => vm.runInContext(code, sandbox);
const L = (key) => ctx(`GAOKAO_LINES[${JSON.stringify(key)}]`);
const META = ctx('GAOKAO_LINES_META');

// ---------- 吉林 2026 专科线纠错（150 → 160，官方值） ----------
{
  check('V19-01 吉林 2026 历史 vocational=160', L('jilin|2026|历史') && L('jilin|2026|历史').vocational === 160, JSON.stringify(L('jilin|2026|历史')));
  check('V19-02 吉林 2026 物理 vocational=160', L('jilin|2026|物理') && L('jilin|2026|物理').vocational === 160, JSON.stringify(L('jilin|2026|物理')));
  check('V19-03 吉林 2026 两行 status 仍是已核实，note 追加“专科官方160”',
    L('jilin|2026|历史').status === '已核实' && L('jilin|2026|物理').status === '已核实'
    && L('jilin|2026|历史').note.includes('专科官方160') && L('jilin|2026|物理').note.includes('专科官方160'));
}

// ---------- 山东 2023–2025 单行“不分” ----------
{
  check('V19-04 山东 2023 不分 tier2=443（一段线）', L('shandong|2023|不分') && L('shandong|2023|不分').tier2 === 443, JSON.stringify(L('shandong|2023|不分')));
  check('V19-05 山东 2024 不分 tier2=444', L('shandong|2024|不分') && L('shandong|2024|不分').tier2 === 444, JSON.stringify(L('shandong|2024|不分')));
  check('V19-06 山东 2025 不分 tier2=441', L('shandong|2025|不分') && L('shandong|2025|不分').tier2 === 441, JSON.stringify(L('shandong|2025|不分')));
  check('V19-07 山东 2023 无 文/理 行、只有 不分 行',
    L('shandong|2023|不分') !== undefined && L('shandong|2023|文') === undefined && L('shandong|2023|理') === undefined);
  check('V19-08 山东 2024/2025 同样无 文/理 行',
    L('shandong|2024|文') === undefined && L('shandong|2024|理') === undefined
    && L('shandong|2025|文') === undefined && L('shandong|2025|理') === undefined);
  check('V19-09 山东 2023–2025 不分行：专科 150、regime new33、status 待核实、note 写特殊类型与来源',
    ['2023', '2024', '2025'].every((y) => {
      const r = L(`shandong|${y}|不分`);
      return r.vocational === 150 && r.regime === 'new33' && r.status === '待核实'
        && r.note.includes('特殊类型') && r.note.includes('教育在线转载');
    }));
}

// ---------- 吉林 / 黑龙江 2024 历史/物理 ----------
{
  check('V19-10 吉林 2024 历史 tier2=369', L('jilin|2024|历史') && L('jilin|2024|历史').tier2 === 369, JSON.stringify(L('jilin|2024|历史')));
  check('V19-11 吉林 2024 物理 tier2=345', L('jilin|2024|物理') && L('jilin|2024|物理').tier2 === 345, JSON.stringify(L('jilin|2024|物理')));
  check('V19-12 黑龙江 2024 历史 tier2=410', L('heilongjiang|2024|历史') && L('heilongjiang|2024|历史').tier2 === 410, JSON.stringify(L('heilongjiang|2024|历史')));
}

// ---------- 辽宁 2025 物理 + 其余补线抽查 ----------
{
  check('V19-13 辽宁 2025 物理 tier2=367', L('liaoning|2025|物理') && L('liaoning|2025|物理').tier2 === 367, JSON.stringify(L('liaoning|2025|物理')));
  check('V19-14 吉林 2023 文史一本/二本：tier1=485、tier2=341',
    L('jilin|2023|文史') && L('jilin|2023|文史').tier1 === 485 && L('jilin|2023|文史').tier2 === 341, JSON.stringify(L('jilin|2023|文史')));
  check('V19-15 吉林 2023 理工一本/二本：tier1=463、tier2=292',
    L('jilin|2023|理工') && L('jilin|2023|理工').tier1 === 463 && L('jilin|2023|理工').tier2 === 292, JSON.stringify(L('jilin|2023|理工')));
  check('V19-16 黑龙江 2023 文史一本/二本：tier1=430、tier2=341',
    L('heilongjiang|2023|文史') && L('heilongjiang|2023|文史').tier1 === 430 && L('heilongjiang|2023|文史').tier2 === 341, JSON.stringify(L('heilongjiang|2023|文史')));
  check('V19-17 黑龙江 2023 理工一本/二本：tier1=408、tier2=287',
    L('heilongjiang|2023|理工') && L('heilongjiang|2023|理工').tier1 === 408 && L('heilongjiang|2023|理工').tier2 === 287, JSON.stringify(L('heilongjiang|2023|理工')));
  check('V19-18 辽宁 2024 历史 tier2=400、物理 tier2=368',
    L('liaoning|2024|历史').tier2 === 400 && L('liaoning|2024|物理').tier2 === 368);
  check('V19-19 吉林/黑龙江 2023 老高考行 regime=split（邻 2022 行写法），2024–2025 行 regime=merged',
    L('jilin|2023|文史').regime === 'split' && L('heilongjiang|2023|文史').regime === 'split'
    && L('jilin|2024|历史').regime === 'merged' && L('heilongjiang|2024|历史').regime === 'merged'
    && L('jilin|2025|物理').regime === 'merged' && L('heilongjiang|2025|物理').regime === 'merged');
  check('V19-20 全部 21 行新填行 status 一律待核实、note 含教育在线转载',
    (() => {
      const keys = [];
      for (const y of ['2023', '2024', '2025']) keys.push(`shandong|${y}|不分`);
      for (const y of ['2023', '2024', '2025']) for (const t of ['历史', '物理']) keys.push(`liaoning|${y}|${t}`);
      for (const y of ['2024', '2025']) for (const t of ['历史', '物理']) { keys.push(`jilin|${y}|${t}`); keys.push(`heilongjiang|${y}|${t}`); }
      for (const t of ['文史', '理工']) { keys.push(`jilin|2023|${t}`); keys.push(`heilongjiang|2023|${t}`); }
      return keys.length === 21 && keys.every((k) => {
        const r = L(k);
        return r && r.status === '待核实' && r.note.includes('教育在线转载');
      });
    })());
}

// ---------- META 计数 ----------
{
  check('V19-21 META rows=305（原 308，删 3 行山东 理 行）', META.rows === 305, JSON.stringify(META));
  check('V19-22 META verified=108（不变）', META.verified === 108, JSON.stringify(META));
  check('V19-23 META toVerify=21（原 0，增加填上的 21 行）', META.toVerify === 21, JSON.stringify(META));
  check('V19-24 META unprovided=176（原 200，少 24 = 填上 21 行 + 删 3 行）', META.unprovided === 176, JSON.stringify(META));
  check('V19-25 META 三数之和 = rows', META.verified + META.toVerify + META.unprovided === META.rows);
}

console.log(failures === 0 ? 'ALL PASS (v19-gaokao)' : failures + ' FAILURE(S) (v19-gaokao)');
process.exit(failures === 0 ? 0 : 1);
