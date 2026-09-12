/* ------------------------------------------------------------------
 * gacha.js — the summon maths.
 *
 * Two pity systems, both standard for the genre:
 *   - a rare floor: every 10th pull is at least ENHANCED
 *   - legendary pity: the rate ramps from the soft threshold and is
 *     guaranteed at the hard one, then the counter resets
 * ------------------------------------------------------------------ */

const Gacha = (() => {

  /** Legendary chance for the current pull, including the soft-pity ramp. */
  function legendaryChance(sinceLegendary) {
    const base = RARITY.legendary.weight;
    const { soft, hard } = BANNER.pity;
    if (sinceLegendary + 1 >= hard) return 1;
    if (sinceLegendary + 1 <= soft) return base;
    const stepsIn = sinceLegendary + 1 - soft;
    return Math.min(1, base + stepsIn * 0.06);
  }

  function rollRarity(pity) {
    if (Math.random() < legendaryChance(pity.sinceLegendary)) return 'legendary';

    // The rare floor only kicks in once the guarantee is actually due.
    const rareDue = pity.sinceRare + 1 >= BANNER.pity.rareFloorEvery;
    const roll = Math.random();

    if (roll < RARITY.epic.weight) return 'epic';
    if (rareDue) return 'rare';
    if (roll < RARITY.epic.weight + RARITY.rare.weight) return 'rare';
    return 'common';
  }

  function pickHero(rarityId) {
    if (rarityId === 'legendary' && Math.random() < BANNER.featuredChance) {
      return BANNER.featured;
    }
    const pool = heroesOfRarity(rarityId);
    return pool[Math.floor(Math.random() * pool.length)].id;
  }

  function rollOnce() {
    const save = State.get();
    const rarityId = rollRarity(save.pity);
    const heroId = pickHero(rarityId);

    if (rarityId === 'legendary') {
      save.pity.sinceLegendary = 0;
      save.pity.sinceRare = 0;
      save.stats.legendaries += 1;
    } else if (rarityId === 'epic' || rarityId === 'rare') {
      save.pity.sinceLegendary += 1;
      save.pity.sinceRare = 0;
    } else {
      save.pity.sinceLegendary += 1;
      save.pity.sinceRare += 1;
    }

    save.stats.pulls += 1;

    const result = State.addHero(heroId);
    return {
      heroId,
      rarity: rarityId,
      isNew: result.isNew,
      shards: result.shards,
      scrap: result.scrap,
      featured: heroId === BANNER.featured
    };
  }

  /**
   * Run a summon of `count` pulls. Returns null when the player cannot
   * pay, so the caller can show the shortfall instead of a reveal.
   */
  function pull(count) {
    const cost = count === 1 ? BANNER.costSingle : BANNER.costMulti;
    if (!State.spend('chronite', cost)) return null;

    const results = [];
    for (let i = 0; i < count; i++) results.push(rollOnce());

    const best = results.reduce((a, b) =>
      RARITY_ORDER.indexOf(b.rarity) < RARITY_ORDER.indexOf(a.rarity) ? b : a);
    State.pushLog(
      `Summoned ${count}× — best pull ${getHero(best.heroId).name}`,
      best.rarity === 'legendary' ? 'gold' : 'info'
    );
    State.save();
    return results;
  }

  return { pull, legendaryChance };
})();
