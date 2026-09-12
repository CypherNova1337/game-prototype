/* ------------------------------------------------------------------
 * campaign.js — deploying to a node and paying out afterwards.
 *
 * The fight lives in combat.js; this spends fuel, decides what a clear
 * is worth, and rolls the gear that drops out of it.
 * ------------------------------------------------------------------ */

const Campaign = (() => {

  const teamReady = () => State.get().team.some(id => id);

  function canDeploy(node) {
    return teamReady() && State.get().fuel.amount >= node.fuel && State.isUnlocked(node.id);
  }

  /** Monte-Carlo odds for the briefing screen. */
  function forecast(node) {
    if (!teamReady()) return 0;
    return Combat.forecast(State.teamUnits(), buildFoes(node), 20);
  }

  /** What the node expects you to be fielding. */
  function recommendedPower(node) {
    return Math.round(POWER_CURVE[Math.min(POWER_CURVE.length - 1, node.tier - 1)]);
  }

  /** Roll a piece of gear appropriate to how deep the node is. */
  function rollDrop(node) {
    const item = Gear.create({
      tier: node.tier,
      rarity: ECONOMY.dropRarity(node.tier)
    });
    State.addGear(item);
    return item;
  }

  /**
   * Run a node. Returns the battle plus everything it paid out, or null
   * when the deploy was not legal.
   */
  function deploy(node) {
    if (!canDeploy(node)) return null;

    const save = State.get();
    save.fuel.amount -= node.fuel;
    if (save.fuel.amount < ECONOMY.fuelCap - 1) save.fuel.lastTick = Date.now();
    save.stats.missionsRun += 1;

    const alreadyCleared = State.isCleared(node.id);
    const battle = Combat.resolve(State.teamUnits(), buildFoes(node));
    const base = nodeRewards(node);
    const payout = { scrap: 0, chronite: 0, xp: 0, firstClear: 0, drops: [], stars: battle.stars };

    if (battle.won) {
      const starBonus = 1 + (battle.stars - 1) * 0.15;
      // Replaying a cleared node still pays scrap — that is the levelling
      // grind — but only a third of the chronite, so summon currency
      // cannot be farmed without limit.
      const repeatChronite = alreadyCleared ? 0.34 : 1;
      payout.scrap = Math.round(base.scrap * starBonus);
      payout.chronite = Math.round(base.chronite * starBonus * repeatChronite);
      payout.xp = base.xp;

      if (State.recordClear(node.id, battle.stars).firstClear) payout.firstClear = base.firstClear;

      save.stats.missionsWon += 1;
      save.stats.battlesWon += 1;
      if (node.boss) save.stats.bossesFelled += 1;
      if (battle.stars === 3) save.stats.perfectClears += 1;

      // Gear is the campaign's real reward; bosses drop two pieces.
      const drops = node.boss ? 2 : (Math.random() < 0.55 ? 1 : 0);
      for (let i = 0; i < drops; i++) payout.drops.push(rollDrop(node));

      State.advanceQuest('q_deploy', 1);
      if (battle.losses === 0) State.advanceQuest('q_flawless', 1);
    } else {
      payout.scrap = Math.round(base.scrap * 0.25);
      payout.xp = Math.round(base.xp * 0.3);
    }

    State.grantBundle({
      scrap: payout.scrap,
      chronite: payout.chronite + payout.firstClear,
      xp: payout.xp
    });

    State.pushLog(
      battle.won ? `${node.name} cleared — ${battle.stars}★` : `Fell back from ${node.name}`,
      battle.won ? (node.boss ? 'gold' : 'good') : 'bad'
    );
    State.save();

    return { battle, payout, node };
  }

  return { canDeploy, deploy, forecast, recommendedPower, teamReady };
})();
