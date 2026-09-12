/*
 * tools/economy.js — can a free player finish the game?
 *
 * Drives the real systems (State, Gacha, Combat, Campaign) with a
 * free-to-play agent: three sessions a day, daily login and contracts,
 * summon when affordable, upgrade the squad, push the campaign. Prints
 * how long the campaign takes and what it cost — which must be nothing.
 *
 *   node tools/economy.js [days] [runs]
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const GAME = path.join(__dirname, '..', 'android/app/src/main/assets/game/js');

function newWorld() {
  const store = {};
  const sandbox = {
    console, Math, Date, JSON, setTimeout, clearTimeout, Promise,
    window: { localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    }}
  };
  vm.createContext(sandbox);
  for (const f of ['data.js', 'content.js', 'storage.js', 'state.js',
                   'gacha.js', 'combat.js', 'campaign.js']) {
    vm.runInContext(fs.readFileSync(path.join(GAME, f), 'utf8'), sandbox, { filename: f });
  }
  vm.runInContext(`globalThis.__api = {
    State, Gacha, Combat, Campaign, ALL_NODES, ITEMS, ECONOMY, BANNER,
    QUESTS, DAILY_LOGIN, getNode, getItemRow, RARITY_ORDER
  };`, sandbox);
  return sandbox.__api;
}

/** One free-to-play run. Returns the day each chapter was finished. */
async function simulate(maxDays) {
  const g = newWorld();
  await g.State.load();

  // Same starter kit the real game grants on first launch.
  ['op_rook', 'wep_m4x', 'gear_scout'].forEach(id => g.State.addItem(id));
  g.State.autoSquad();

  const save = g.State.get();
  const milestones = {};
  let pulls = 0, spentReal = 0, deploys = 0, wins = 0;

  for (let day = 1; day <= maxDays; day++) {
    // Daily login and a full set of contracts an active player would finish.
    g.State.grantBundle({ chronite: g.DAILY_LOGIN.chronite });
    g.QUESTS.forEach(q => g.State.grantBundle(q.reward));

    for (let session = 0; session < 3; session++) {
      save.fuel.amount = g.ECONOMY.fuelCap;         // accumulated between sessions

      while (true) {
        // Summon whenever a ten-pull is affordable, then re-kit.
        if (save.wallet.chronite >= g.BANNER.costMulti) {
          const results = g.Gacha.pull(10);
          if (results) { pulls += 10; g.State.autoSquad(); }
        }
        upgradeSquad(g, save);

        const target = chooseNode(g);
        if (!target || save.fuel.amount < target.fuel) break;

        const outcome = g.Campaign.deploy(target);
        if (!outcome) break;
        deploys++;
        if (outcome.battle.won) wins++;
      }
    }

    for (const chapter of ['ch1', 'ch2', 'ch3', 'ch4']) {
      if (!milestones[chapter]) {
        const nodes = g.ALL_NODES.filter(n => n.chapter === chapter);
        if (nodes.every(n => g.State.isCleared(n.id))) milestones[chapter] = day;
      }
    }
    if (milestones.ch4) break;
  }

  return {
    milestones, pulls, deploys, wins, spentReal,
    stars: g.State.totalStars(),
    items: g.State.inventoryIds().length,
    legendaries: save.stats.legendaries,
    passLevel: save.pass.level,
    cleared: g.ALL_NODES.filter(n => g.State.isCleared(n.id)).length
  };
}

/** Push the furthest node that looks winnable; otherwise farm the best cleared one. */
function chooseNode(g) {
  const next = g.ALL_NODES.find(n => !g.State.isCleared(n.id) && g.State.isUnlocked(n.id));
  if (next && g.Campaign.forecast(next) >= 0.35) return next;

  const cleared = g.ALL_NODES.filter(n => g.State.isCleared(n.id));
  return cleared.length ? cleared[cleared.length - 1] : next;
}

/** Spend scrap and shards on the deployed squad, best item first. */
function upgradeSquad(g, save) {
  let progress = true;
  while (progress) {
    progress = false;
    for (const id of save.squad) {
      if (id && g.State.canUpgrade(id)) { g.State.upgrade(id); progress = true; }
    }
  }
}

(async () => {
  const maxDays = parseInt(process.argv[2], 10) || 120;
  const runs = parseInt(process.argv[3], 10) || 5;

  console.log(`free-to-play simulation — ${runs} runs, ${maxDays} day cap\n`);
  const finishes = [];

  for (let i = 0; i < runs; i++) {
    const r = await simulate(maxDays);
    finishes.push(r);
    console.log(
      `run ${i + 1}: ch1 day ${r.milestones.ch1 || '-'}, ch2 ${r.milestones.ch2 || '-'}, ` +
      `ch3 ${r.milestones.ch3 || '-'}, ch4 ${r.milestones.ch4 || 'NOT CLEARED'} | ` +
      `${r.cleared}/20 nodes, ${r.stars}★, ${r.pulls} pulls, ${r.legendaries} ascendants, ` +
      `pass lv${r.passLevel}, $${r.spentReal.toFixed(2)} spent`
    );
  }

  const done = finishes.filter(r => r.milestones.ch4);
  console.log('');
  if (done.length) {
    const days = done.map(r => r.milestones.ch4);
    console.log(`campaign completed free in ${done.length}/${runs} runs — ` +
                `${Math.min(...days)}-${Math.max(...days)} days`);
  } else {
    console.log(`NOT COMPLETABLE inside ${maxDays} days without paying — economy needs work`);
  }
  console.log('real money required: $' + Math.max(...finishes.map(r => r.spentReal)).toFixed(2));
})();
