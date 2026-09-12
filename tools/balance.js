/*
 * tools/balance.js — headless difficulty tuning.
 *
 * Runs the real combat engine against every campaign node with a squad
 * pinned to an exact power level, so encounter design can be judged
 * independently of whether the economy gets a player there (that is a
 * separate question, measured by tools/economy.js).
 *
 *   node tools/balance.js [runsPerNode]
 *
 * Reads: win rate at 75% / 100% / 125% of the tier's power curve.
 * A healthy node wins ~80% on curve, is a real fight below it, and is
 * comfortable above it. Bosses sit lower on purpose.
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
vm.runInContext(
  'globalThis.__api = { ITEMS, ALL_NODES, Combat, POWER_CURVE, nodeBudget };', sandbox);
const { ITEMS, ALL_NODES, Combat, POWER_CURVE, nodeBudget } = sandbox.__api;

const item = id => ITEMS.find(i => i.id === id);

/* A representative trio per chapter: the mix of abilities a player would
   plausibly be fielding there, since composition changes fights as much
   as raw power does. */
const SQUADS = {
  ch1: ['op_rook', 'wep_sidearm', 'gear_plating'],
  ch2: ['op_dax', 'wep_m4x', 'gear_scout'],
  ch3: ['op_kestrel', 'wep_arcflux', 'gear_aegis'],
  ch4: ['op_nyx', 'wep_singular', 'gear_aegis']
};

const RUNS = parseInt(process.argv[2], 10) || 300;
const BANDS = [0.75, 1.0, 1.25];

function trial(node, ids, targetPower) {
  const raw = ids.reduce((t, id) => t + item(id).power, 0);
  const k = targetPower / raw;
  const powerOf = id => Math.round(item(id).power * k);

  let wins = 0, rounds = 0, stars = [0, 0, 0], wipes = 0;
  for (let i = 0; i < RUNS; i++) {
    const r = Combat.resolve(ids, node, powerOf);
    rounds += r.rounds;
    if (r.won) { wins++; stars[r.stars - 1]++; } else if (r.survivors === 0) wipes++;
  }
  return { rate: wins / RUNS, rounds: rounds / RUNS, stars, wipes: wipes / RUNS };
}

console.log('node                  tier   budget    -25%   on curve   +25%   rounds  stars(1/2/3)');
console.log('-'.repeat(92));

const problems = [];

for (const node of ALL_NODES) {
  const ids = SQUADS[node.chapter];
  const curve = POWER_CURVE[node.tier - 1];
  const results = BANDS.map(b => trial(node, ids, Math.round(curve * b)));
  const on = results[1];

  const pct = r => (r.rate * 100).toFixed(0).padStart(4) + '%';
  console.log(
    `${(node.name + (node.boss ? ' [BOSS]' : '')).padEnd(21)} ${String(node.tier).padStart(3)}` +
    ` ${String(Math.round(nodeBudget(node))).padStart(8)}   ${pct(results[0])}` +
    `     ${pct(results[1])}  ${pct(results[2])}   ${on.rounds.toFixed(1).padStart(5)}` +
    `  ${on.stars.join('/')}`
  );

  const want = node.boss ? [0.5, 0.75] : [0.72, 0.93];
  if (on.rate < want[0]) problems.push(`${node.name} too hard (${(on.rate * 100).toFixed(0)}%)`);
  if (on.rate > want[1]) problems.push(`${node.name} too easy (${(on.rate * 100).toFixed(0)}%)`);
}

console.log('-'.repeat(92));
console.log(problems.length ? problems.join('\n') : 'every node inside its target band');
