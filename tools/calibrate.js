/*
 * tools/calibrate.js — finds the encounter pressure that hits a target
 * win rate, instead of guessing at constants.
 *
 *   node tools/calibrate.js [runsPerProbe]
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const GAME = path.join(__dirname, '..', 'android/app/src/main/assets/game/js');
const sandbox = { console, Math, Date, JSON };
vm.createContext(sandbox);
for (const f of ['data.js', 'heroes.js', 'gear.js', 'content.js', 'combat.js']) {
  vm.runInContext(fs.readFileSync(path.join(GAME, f), 'utf8'), sandbox, { filename: f });
}
vm.runInContext(`globalThis.__api = {
  getHero, ALL_NODES, Combat, POWER_CURVE, buildFoes, scaleToPower, NODE_PRESSURE
};`, sandbox);
const api = sandbox.__api;

const TEAMS = {
  ch1: ['rook', 'picker', 'medtech', 'plating'],
  ch2: ['dax', 'warden', 'marrow', 'sentry'],
  ch3: ['kestrel', 'wisp', 'marrow', 'aegis'],
  ch4: ['nyx', 'kestrel', 'vex', 'aegis']
};

const RUNS = parseInt(process.argv[2], 10) || 120;
const TARGET_NORMAL = 0.85;
const TARGET_BOSS = 0.62;

function winRate(node, pressure) {
  const ids = TEAMS[node.chapter];
  const power = api.POWER_CURVE[node.tier - 1];
  const allies = ids.map(id => ({
    hero: api.getHero(id),
    stats: api.scaleToPower(api.getHero(id), power / ids.length)
  }));
  const probe = Object.assign({}, node, { pressure });
  const foes = api.buildFoes(probe);

  let wins = 0;
  for (let i = 0; i < RUNS; i++) if (api.Combat.resolve(allies, foes).won) wins++;
  return wins / RUNS;
}

/** Higher pressure means a harder node, so win rate falls as it rises. */
function solve(node, target) {
  let lo = 0.2, hi = 5.0;
  for (let step = 0; step < 12; step++) {
    const mid = (lo + hi) / 2;
    if (winRate(node, mid) > target) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

console.log('node                  ch   pos  boss   multiplier   new pressure');
console.log('-'.repeat(68));

const suggested = { ch1: [], ch2: [], ch3: [], ch4: [] };

for (const node of api.ALL_NODES) {
  const position = node.tier % 5 === 0 ? 4 : (node.tier % 5) - 1;
  const slot = Math.max(0, position);
  const target = node.boss ? TARGET_BOSS : TARGET_NORMAL;
  const m = solve(node, target);
  const current = api.NODE_PRESSURE[node.chapter][slot];
  suggested[node.chapter][slot] = current * m;

  console.log(
    `${node.name.padEnd(21)} ${node.chapter}  ${String(slot).padStart(3)}  ` +
    `${node.boss ? 'yes ' : 'no  '}  ${m.toFixed(2).padStart(8)}   ${(current * m).toFixed(2).padStart(8)}`
  );
}

console.log('-'.repeat(68));
console.log('const NODE_PRESSURE = {');
['ch1', 'ch2', 'ch3', 'ch4'].forEach(ch => {
  console.log(`  ${ch}: [${suggested[ch].map(v => v.toFixed(2)).join(', ')}],`);
});
console.log('};');
