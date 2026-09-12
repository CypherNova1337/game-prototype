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
  for (const f of ['data.js', 'heroes.js', 'gear.js', 'content.js', 'storage.js',
                   'state.js', 'gacha.js', 'combat.js', 'campaign.js']) {
    vm.runInContext(fs.readFileSync(path.join(GAME, f), 'utf8'), sandbox, { filename: f });
  }
  vm.runInContext(`globalThis.__api = {
    State, Gacha, Combat, Campaign, ALL_NODES, HEROES, ECONOMY, BANNER,
    QUESTS, DAILY_LOGIN, getNode, getHero, RARITY_ORDER, Gear,
    SLOT_ORDER, HERO_MAX_LEVEL, HERO_MAX_STARS
  };`, sandbox);
  return sandbox.__api;
}

/** One free-to-play run. Returns the day each chapter was finished. */
async function simulate(maxDays) {
  const g = newWorld();
  await g.State.load();

  // Same starter four the real game grants on first launch.
  ['rook', 'picker', 'medtech', 'plating'].forEach(id => g.State.addHero(id));
  g.State.autoTeam();
  ['weapon', 'helmet', 'chest', 'boots'].forEach((slot, i) => {
    const item = g.Gear.create({ slot, rarity: 'common', tier: 1, set: i < 2 ? 'life' : 'offense' });
    g.State.addGear(item);
    const heroId = g.State.get().team[i];
    if (heroId) g.State.equipGear(heroId, item.id);
  });

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
          if (results) { pulls += 10; g.State.autoTeam(); }
        }
        equipBest(g, save);
        sellJunk(g);
        upgradeTeam(g, save);

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

  const lastNode = g.ALL_NODES[g.ALL_NODES.length - 1];
  const stuckAt = g.ALL_NODES.find(n => !g.State.isCleared(n.id));
  return {
    milestones, pulls, deploys, wins, spentReal,
    teamPower: g.State.teamPower(),
    needed: stuckAt ? g.Campaign.recommendedPower(stuckAt) : g.Campaign.recommendedPower(lastNode),
    stuckName: stuckAt ? stuckAt.name : 'none',
    scrap: g.State.get().wallet.scrap,
    levels: g.State.get().team.map(id => id ? g.State.heroEntry(id).level : 0).join('/'),
    starsTeam: g.State.get().team.map(id => id ? g.State.heroEntry(id).stars : 0).join('/'),
    stars: g.State.totalStars(),
    items: g.State.roster().length,
    gear: g.State.gearList().length,
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

/**
 * Scrap everything unworn except the few best pieces per slot. Hoarding
 * every drop is not how anyone plays, and the scrap matters.
 */
function sellJunk(g) {
  for (const slot of g.SLOT_ORDER) {
    const spare = g.State.gearList(item => item.slot === slot && !item.equipped);
    spare.slice(6).forEach(item => g.State.sellGear(item.id));
  }
}

/** Level and ascend the deployed team while it is affordable. */
function upgradeTeam(g, save) {
  let progress = true;
  while (progress) {
    progress = false;
    for (const id of save.team) {
      if (!id) continue;
      if (g.State.canAscend(id)) { g.State.ascendHero(id); progress = true; }
      if (g.State.canLevel(id)) { g.State.levelHero(id); progress = true; }
    }
  }
}

/** Put the strongest available piece in every empty slot, and upgrade it. */
function equipBest(g, save) {
  for (const heroId of save.team) {
    if (!heroId) continue;
    for (const slot of g.SLOT_ORDER) {
      const owned = g.State.heroEntry(heroId);
      const current = g.State.gearOf(owned.equipped[slot]);
      const options = g.State.gearList(item => item.slot === slot && !item.equipped);
      const best = options[0];
      if (best && (!current || g.Gear.score(best) > g.Gear.score(current))) {
        g.State.equipGear(heroId, best.id);
      }
    }
  }
  // Sink spare scrap into gear the team is actually wearing.
  for (const heroId of save.team) {
    if (!heroId) continue;
    const owned = g.State.heroEntry(heroId);
    for (const slot of g.SLOT_ORDER) {
      const id = owned.equipped[slot];
      let guard = 0;
      while (id && g.State.canUpgradeGear(id) && guard++ < 20) g.State.upgradeGear(id);
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
      `${r.items} champs, ${r.gear} gear, ` +
      `pass lv${r.passLevel}, $${r.spentReal.toFixed(2)} spent`
    );
    console.log(
      `        power ${Math.round(r.teamPower).toLocaleString()} vs ${r.needed.toLocaleString()} needed ` +
      `at "${r.stuckName}" · levels ${r.levels} · stars ${r.starsTeam} · scrap ${Math.round(r.scrap).toLocaleString()}`
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
