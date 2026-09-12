/*
 * tools/calibrate.js — finds the encounter pressure that hits a target
 * win rate, instead of guessing at constants.
 *
 * For every node it binary-searches the budget multiplier that produces
 * the desired win rate for a squad sitting exactly on the power curve,
 * then prints the value to paste into NODE_PRESSURE.
 *
 *   node tools/calibrate.js [runsPerProbe]
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const GAME = path.join(__dirname, '..', 'android/app/src/main/assets/game/js');
const sandbox = { console, Math, Date, JSON };
vm.createContext(sandbox);
for (const f of ['data.js', 'content.js', 'combat.js']) {
  vm.runInContext(fs.readFileSync(path.join(GAME, f), 'utf8'), sandbox, { filename: f });
}
vm.runInContext('globalThis.__api = { ITEMS, ALL_NODES, Combat, POWER_CURVE };', sandbox);
const { ITEMS, ALL_NODES, Combat, POWER_CURVE } = sandbox.__api;

const item = id => ITEMS.find(i => i.id === id);
const SQUADS = {
  ch1: ['op_rook', 'wep_sidearm', 'gear_plating'],
  ch2: ['op_dax', 'wep_m4x', 'gear_scout'],
  ch3: ['op_kestrel', 'wep_arcflux', 'gear_aegis'],
  ch4: ['op_nyx', 'wep_singular', 'gear_aegis']
};

const RUNS = parseInt(process.argv[2], 10) || 160;
const TARGET_NORMAL = 0.85;
const TARGET_BOSS = 0.6;

function winRate(node, pressure) {
  const ids = SQUADS[node.chapter];
  const raw = ids.reduce((t, id) => t + item(id).power, 0);
  const k = POWER_CURVE[node.tier - 1] / raw;
  const powerOf = id => Math.round(item(id).power * k);
  const probe = Object.assign({}, node, { pressure });

  let wins = 0;
  for (let i = 0; i < RUNS; i++) if (Combat.resolve(ids, probe, powerOf).won) wins++;
  return wins / RUNS;
}

/** Higher pressure means a harder node, so win rate falls as it rises. */
function solve(node, target) {
  let lo = 0.3, hi = 4.0;
  for (let step = 0; step < 12; step++) {
    const mid = (lo + hi) / 2;
    if (winRate(node, mid) > target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

console.log('node                  pos  boss   multiplier for target');
console.log('-'.repeat(60));

const byPosition = [[], [], [], [], []];

for (const node of ALL_NODES) {
  const position = node.tier % 5 === 0 ? 4 : (node.tier % 5) - 1;
  const target = node.boss ? TARGET_BOSS : TARGET_NORMAL;
  const m = solve(node, target);
  byPosition[Math.max(0, position)].push(m);
  console.log(
    `${node.name.padEnd(21)} ${String(position).padStart(3)}  ${node.boss ? 'yes ' : 'no  '}` +
    `  ${m.toFixed(2)}`
  );
}

console.log('-'.repeat(60));
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
console.log('suggested NODE_PRESSURE (existing values are multiplied by these):');
console.log('  [' + byPosition.map(a => avg(a).toFixed(2)).join(', ') + ']');
