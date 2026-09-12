/* ------------------------------------------------------------------
 * missions.js — the deploy loop that pays for the next summon.
 * ------------------------------------------------------------------ */

const Missions = (() => {

  /** Odds of clearing a sector, from squad power against its threat rating. */
  function successChance(sector) {
    const power = State.squadPower(sector.threat);
    const ratio = power / sector.power;
    return Math.max(0.05, Math.min(0.95, 0.12 + 0.83 * ratio));
  }

  function canDeploy(sector) {
    const save = State.get();
    const hasSquad = save.squad.some(id => id);
    return hasSquad && save.fuel.amount >= sector.fuel;
  }

  /**
   * Resolve a sector run. Returns a report the results screen renders,
   * or null when the run was not affordable.
   */
  function deploy(sector) {
    if (!canDeploy(sector)) return null;

    const save = State.get();
    const chance = successChance(sector);
    const won = Math.random() < chance;

    save.fuel.amount -= sector.fuel;
    if (save.fuel.amount < ECONOMY.fuelCap - 1) {
      // Restart the regen clock from now so partial progress is not banked.
      save.fuel.lastTick = Date.now();
    }
    save.stats.missionsRun += 1;

    const report = {
      sector,
      won,
      chance,
      power: State.squadPower(sector.threat),
      scrap: 0,
      chronite: 0,
      drop: null
    };

    if (won) {
      save.stats.missionsWon += 1;
      report.scrap = Math.round(sector.scrap * (0.85 + Math.random() * 0.3));
      report.chronite = Math.round(sector.chronite * (0.85 + Math.random() * 0.3));

      if (Math.random() < sector.dropChance) {
        // Salvage skews to the low end; the good stuff comes from summons.
        const roll = Math.random();
        const rarityId = roll < 0.06 ? 'epic' : roll < 0.4 ? 'rare' : 'common';
        const pool = itemsOfRarity(rarityId);
        const itemId = pool[Math.floor(Math.random() * pool.length)].id;
        const added = State.addItem(itemId);
        report.drop = { itemId, isNew: added.isNew, shards: added.shards };
      }
    } else {
      // A failed run still strips something usable off the wreck.
      report.scrap = Math.round(sector.scrap * 0.2);
    }

    State.grant('scrap', report.scrap);
    State.grant('chronite', report.chronite);
    State.pushLog(
      `${won ? 'Cleared' : 'Lost contact in'} ${sector.name}`,
      won ? 'good' : 'bad'
    );
    State.save();
    return report;
  }

  return { successChance, canDeploy, deploy };
})();
