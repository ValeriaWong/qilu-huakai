'use strict';
/**
 * 股票线历史数据（《歧路花开》v1.4.3）。
 * 数据来源：~/workspace/hackathon-tracker/alipay-emerge-rpg-exam-research-20261121.md §8
 * （上证指数年表 §8.1.1 为已核实全文；定性 §8.1.5；事件 §8.3）。
 * - 2024 年行按多源修正：维基的 3,407.33 / +14.53% 是错的，以 1stock1、
 *   amsflow、Wind 三源一致的 3,351.76 / +12.67% 为准；2025 年涨幅按修正
 *   后 2024 基数重算为 +18.41%。
 * - 2026 年未收官不进表：报告明确说 2026 数据是截至 10–11 月的片段，
 *   不可用。
 * - 深证成指年表未收录：报告说缺失，1stock1 的表是深证综指口径，不可代用。
 * - 沪深 300 / 创业板指的逐年收盘点位未收录：未核实。
 * - 散户盈亏比例数字未收录：“七亏二平一赚”无官方出处，“八亏一平一赚”
 *   与 18.9% 只见自媒体。
 * 纯数据 + 纯函数，不碰游戏逻辑。
 */

// 上证指数年表 2010–2025（16 行）。
// close：年末收盘点位；change：年涨跌幅（%）；regime：当年定性（§8.1.5）。
const STOCK_INDEX_YEARS = [
  { year: 2010, close: 2808.08, change: -14.31, regime: '震荡跌' },
  { year: 2011, close: 2199.42, change: -21.68, regime: '熊市' },
  { year: 2012, close: 2269.13, change: 3.17, regime: '磨底反弹' },
  { year: 2013, close: 2115.98, change: -6.75, regime: '分化' },
  { year: 2014, close: 3234.68, change: 52.87, regime: '牛市启动' },
  { year: 2015, close: 3539.18, change: 9.41, regime: '疯牛→股灾' },
  { year: 2016, close: 3103.64, change: -12.31, regime: '熔断熊市' },
  { year: 2017, close: 3307.17, change: 6.56, regime: '结构牛' },
  { year: 2018, close: 2493.90, change: -24.59, regime: '全面熊市' },
  { year: 2019, close: 3050.12, change: 22.30, regime: '反弹牛' },
  { year: 2020, close: 3473.07, change: 13.87, regime: '疫情V型+结构牛' },
  { year: 2021, close: 3639.78, change: 4.80, regime: '分化顶' },
  { year: 2022, close: 3089.26, change: -15.13, regime: '熊市' },
  { year: 2023, close: 2974.94, change: -3.70, regime: '阴跌' },
  { year: 2024, close: 3351.76, change: 12.67, regime: '924反转' },
  { year: 2025, close: 3968.84, change: 18.41, regime: '科技牛' },
];

// 重大事件表（§8.3，有明确日期的事件）。
// verified：'verified' = 已核实原文；'summary' = 仅搜索摘要（报告 §8.3
// 标“未核实”），游戏内展示时须标注“媒体报道口径”，且 body 里不写
// 未核实的精确数字（如当日涨跌幅）。
const STOCK_MAJOR_EVENTS = [
  { date: '2015-06-12', title: '牛市顶 5178.19 点', body: '上证盘中见 5,178.19 点，为本轮牛市顶点。', verified: 'verified' },
  { date: '2016-01-04', title: '第一次熔断', body: '首个交易日沪深 300 先后触 5%、7% 两度熔断提前收盘，上证收跌 6.85% 报 3,296.66 点。', verified: 'verified' },
  { date: '2016-01-07', title: '第二次熔断，当晚取消', body: '沪深 300 两度熔断提前收盘，当晚沪深交易所与中金所宣布自 1 月 8 日起暂停实施熔断机制，至今未恢复。', verified: 'verified' },
  { date: '2019-06-13', title: '科创板开板', body: '上交所科创板正式开板，注册制试点落地。', verified: 'verified' },
  { date: '2023-02-17', title: '全面注册制启动', body: '证监会发布相关制度规则并施行，审核权下放至沪深交易所。', verified: 'verified' },
  { date: '2024-09-24', title: '924 行情启动', body: '国新办发布会出台一揽子政策支持资本市场，行情启动。（媒体报道口径，未核实原文）', verified: 'summary' },
  { date: '2025-04-07', title: '对等关税黑色星期一', body: '美方宣布对华加征关税后，A股大跌。（媒体报道口径，未核实原文）', verified: 'summary' },
];

// 返回该年的年表行对象，查不到返回 null。
function stockYear(year) {
  const row = STOCK_INDEX_YEARS.find((r) => r.year === year);
  return row || null;
}

// 返回该年的定性（regime 字符串），查不到返回 null。
function stockRegime(year) {
  const row = stockYear(year);
  return row ? row.regime : null;
}

if (typeof module !== 'undefined') { module.exports = { STOCK_INDEX_YEARS, STOCK_MAJOR_EVENTS, stockYear, stockRegime }; }
