/*
 * tools/balance.js — headless difficulty tuning.
 *
 * Runs the real combat engine against every campaign node with a team
 * pinned to an exact power level, so encounter design can be judged
 * independently of whether the economy gets a player there (that is a
 * separate question, measured by tools/economy.js).
 *
 *   node tools/balance.js [runsPerNode]
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
  HEROES, getHero, ALL_NODES, Combat, POWER_CURVE, nodeBudget, buildFoes,
  scaleToPower, TEAM_SIZE
};`, sandbox);
const api = sandbox.__api;

/* A plausible team per chapter: the mix of roles and affinities a player
   would actually be fielding there. Composition changes fights as much
   as raw power does. */
const TEAMS = {
  ch1: ['rook', 'picker', 'medtech', 'plating'],
  ch2: ['dax', 'warden', 'marrow', 'sentry'],
  ch3: ['kestrel', 'wisp', 'marrow', 'aegis'],
  ch4: ['nyx', 'kestrel', 'vex', 'aegis']
};

function team(node, targetPower) {
  const ids = TEAMS[node.chapter];
  return ids.map(id => {
    const hero = api.getHero(id);
    return { hero, stats: api.scaleToPower(hero, targetPower / ids.length) };
  });
}

const RUNS = parseInt(process.argv[2], 10) || 200;
const BANDS = [0.75, 1.0, 1.25];

function trial(node, power) {
  const allies = team(node, power);
  let wins = 0, turns = 0, stars = [0, 0, 0];
  for (let i = 0; i < RUNS; i++) {
    const r = api.Combat.resolve(allies, api.buildFoes(node));
    turns += r.turns;
    if (r.won) { wins++; stars[r.stars - 1]++; }
  }
  return { rate: wins / RUNS, turns: turns / RUNS, stars };
}

console.log('node                  tier    budget    -25%   on curve   +25%   turns  stars(1/2/3)');
console.log('-'.repeat(92));

const problems = [];

for (const node of api.ALL_NODES) {
  const curve = api.POWER_CURVE[node.tier - 1];
  const results = BANDS.map(b => trial(node, Math.round(curve * b)));
  const on = results[1];
  const pct = r => (r.rate * 100).toFixed(0).padStart(4) + '%';

  console.log(
    `${(node.name + (node.boss ? ' [BOSS]' : '')).padEnd(21)} ${String(node.tier).padStart(3)}` +
    ` ${String(Math.round(api.nodeBudget(node))).padStart(9)}   ${pct(results[0])}` +
    `     ${pct(results[1])}  ${pct(results[2])}   ${on.turns.toFixed(1).padStart(5)}` +
    `  ${on.stars.join('/')}`
  );

  const want = node.boss ? [0.5, 0.78] : [0.72, 0.94];
  if (on.rate < want[0]) problems.push(`${node.name} too hard (${(on.rate * 100).toFixed(0)}%)`);
  if (on.rate > want[1]) problems.push(`${node.name} too easy (${(on.rate * 100).toFixed(0)}%)`);
}

console.log('-'.repeat(92));
console.log(problems.length ? problems.join('\n') : 'every node inside its target band');
