'use strict';
// 65% 征兆固定种子统计（可复现）：
//   node tests/omen-seed-stats.js
// 方法：固定种子，H4/H5/H6/E 四颗骰各封若干条征兆，数 accurate 的比例。
// 批次 A（与 test-v15.js V15-27 / test-v16.js V16-76 同方法）：
//   种子 1..100，H4(70)x3 + H5(2)x3 = 600 条。
// 批次 B：种子 101..200，H6(55)x3 + E({roll:40, chance:45})x2 = 500 条。
// 合计 1100 条。判定：每批与合计的准确率都落在 [0.60, 0.70]。
// sealDie(state, rng, name, value, N) 按数量从 OMEN_TEXTS 注册表生成
// 征兆，accurate = rng.chance(0.65)。
const fs = require('fs');
const path = require('path');

function repoJs() {
  const a = path.join(__dirname, '..', 'js');
  if (fs.existsSync(path.join(a, 'engine.js'))) return a;
  return path.join(__dirname, '..', 'qilu-huakai', 'js');
}
const JS = repoJs();
const { makeRng } = require(path.join(JS, 'rng.js'));
const { newRun, sealDie } = require(path.join(JS, 'engine.js'));

function batch(label, seeds, dice) {
  let accurate = 0, total = 0;
  for (const seed of seeds) {
    const st = newRun(seed, {});
    st.flags.careSubject = 'parents';
    const rng = makeRng(seed);
    for (const [name, value, n] of dice) sealDie(st, rng, name, value, n);
    for (const o of st.omenLog) { total += 1; if (o.accurate) accurate += 1; }
  }
  const frac = accurate / total;
  const ok = frac >= 0.60 && frac <= 0.70;
  console.log(`${label}: accurate=${accurate}/${total} = ${frac.toFixed(4)} ${ok ? 'IN [0.60, 0.70]' : 'OUT OF RANGE'}`);
  return { accurate, total, ok };
}

const seedsA = Array.from({ length: 100 }, (_, i) => i + 1);
const seedsB = Array.from({ length: 100 }, (_, i) => i + 101);
const a = batch('Batch A (H4x3 + H5x3, seeds 1-100)', seedsA, [['H4', 70, 3], ['H5', 2, 3]]);
const b = batch('Batch B (H6x3 + Ex2, seeds 101-200)', seedsB, [['H6', 55, 3], ['E', { roll: 40, chance: 45 }, 2]]);
const total = a.total + b.total;
const accurate = a.accurate + b.accurate;
const frac = accurate / total;
const ok = frac >= 0.60 && frac <= 0.70;
console.log(`Total: accurate=${accurate}/${total} = ${frac.toFixed(4)} ${ok ? 'IN [0.60, 0.70]' : 'OUT OF RANGE'}`);
console.log(ok && a.ok && b.ok ? 'PASS: 65% omen accuracy verified on fixed seeds.' : 'FAIL: accuracy outside [0.60, 0.70].');
process.exit(ok && a.ok && b.ok ? 0 : 1);
