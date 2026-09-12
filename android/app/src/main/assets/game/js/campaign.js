/* ------------------------------------------------------------------
 * campaign.js — deploying to a node and paying out afterwards.
 *
 * The fight itself lives in combat.js; this is the part that spends
 * fuel, decides what a clear is worth, and moves the rest of the game
 * forward when one happens.
 * ------------------------------------------------------------------ */

const Campaign = (() => {

  const powerOf = itemId => State.getPower(itemId);

  function squadReady() {
    return State.get().squad.some(id => id);
  }

  function canDeploy(node) {
    return squadReady() && State.get().fuel.amount >= node.fuel && State.isUnlocked(node.id);
  }

  /** Monte-Carlo odds for the briefing screen. Cheap enough to run live. */
  function forecast(node) {
    if (!squadReady()) return 0;
    return Combat.forecast(State.get().squad, node, powerOf, 30);
  }

  /** Recommended power, so a player knows what a node actually wants. */
  function recommendedPower(node) {
    return Math.round(POWER_CURVE[Math.min(POWER_CURVE.length - 1, node.tier - 1)]);
  }

  /**
   * Run a node. Returns the battle result plus everything it paid out,
   * or null when the deploy was not legal.
   */
  function deploy(node) {
    if (!canDeploy(node)) return null;

    const save = State.get();
    save.fuel.amount -= node.fuel;
    if (save.fuel.amount < ECONOMY.fuelCap - 1) save.fuel.lastTick = Date.now();
    save.stats.missionsRun += 1;

    const alreadyCleared = State.isCleared(node.id);
    const battle = Combat.resolve(save.squad, node, powerOf);
    const base = nodeRewards(node);
    const payout = { scrap: 0, chronite: 0, xp: 0, firstClear: 0, drop: null, stars: battle.stars };

    if (battle.won) {
      const starBonus = 1 + (battle.stars - 1) * 0.15;
      // Replaying a cleared node still pays scrap — that is the upgrade
      // grind — but only a third of the chronite, so summon currency
      // cannot be farmed without limit.
      const repeatChronite = alreadyCleared ? 0.34 : 1;
      payout.scrap = Math.round(base.scrap * starBonus);
      payout.chronite = Math.round(base.chronite * starBonus * repeatChronite);
      payout.xp = base.xp;

      const record = State.recordClear(node.id, battle.stars);
      if (record.firstClear) payout.firstClear = base.firstClear;

      save.stats.missionsWon += 1;
      save.stats.battlesWon += 1;
      if (node.boss) save.stats.bossesFelled += 1;
      if (battle.stars === 3) save.stats.perfectClears += 1;

      // Salvage skews low; the good pulls come from summoning.
      if (Math.random() < 0.3) {
        const roll = Math.random();
        const rarityId = roll < 0.05 ? 'epic' : roll < 0.38 ? 'rare' : 'common';
        const pool = itemsOfRarity(rarityId);
        const itemId = pool[Math.floor(Math.random() * pool.length)].id;
        const added = State.addItem(itemId);
        payout.drop = { itemId, isNew: added.isNew, shards: added.shards };
      }

      State.advanceQuest('q_deploy', 1);
      if (battle.losses === 0) State.advanceQuest('q_flawless', 1);
    } else {
      // A failed run still strips something usable off the wreck.
      payout.scrap = Math.round(base.scrap * 0.25);
      payout.xp = Math.round(base.xp * 0.3);
    }

    State.grantBundle({
      scrap: payout.scrap,
      chronite: payout.chronite + payout.firstClear,
      xp: payout.xp
    });

    State.pushLog(
      battle.won
        ? `${node.name} cleared — ${battle.stars}★`
        : `Fell back from ${node.name}`,
      battle.won ? (node.boss ? 'gold' : 'good') : 'bad'
    );
    State.save();

    return { battle, payout, node };
  }

  return { canDeploy, deploy, forecast, recommendedPower, squadReady };
})();
