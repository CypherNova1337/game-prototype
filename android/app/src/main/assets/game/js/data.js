/* ------------------------------------------------------------------
 * data.js — rarities, factions, the summon banner and economy tuning.
 *
 * The champion roster lives in heroes.js and equipment in gear.js; this
 * file is the numbers that sit around them.
 * ------------------------------------------------------------------ */

/* edge/tint are pre-mixed rgba rather than color-mix(), which only exists
   in WebViews from 2023 onward and silently voids the whole declaration
   on anything older. */
const RARITY = {
  common:    { id: 'common',    label: 'STANDARD',  stars: 1, color: '#8294ab',
               glow: 'rgba(130,148,171,.45)', edge: 'rgba(130,148,171,.5)',  tint: 'rgba(130,148,171,.16)',
               weight: 0.600, shards: 2,  scrap: 300  },
  rare:      { id: 'rare',      label: 'ENHANCED',  stars: 2, color: '#2af5ff',
               glow: 'rgba(42,245,255,.45)',  edge: 'rgba(42,245,255,.5)',   tint: 'rgba(42,245,255,.16)',
               weight: 0.300, shards: 8,  scrap: 900 },
  epic:      { id: 'epic',      label: 'PROTOTYPE', stars: 3, color: '#b46bff',
               glow: 'rgba(180,107,255,.5)',  edge: 'rgba(180,107,255,.55)', tint: 'rgba(180,107,255,.18)',
               weight: 0.085, shards: 30, scrap: 2600 },
  legendary: { id: 'legendary', label: 'ASCENDANT', stars: 4, color: '#ffc247',
               glow: 'rgba(255,194,71,.55)',  edge: 'rgba(255,194,71,.6)',   tint: 'rgba(255,194,71,.2)',
               weight: 0.015, shards: 90, scrap: 7000 }
};

const RARITY_ORDER = ['legendary', 'epic', 'rare', 'common'];

const FACTION = {
  helix:   { id: 'helix',   name: 'HELIX SYNDICATE',  color: '#2af5ff', edge: 'rgba(42,245,255,.5)',  tint: 'rgba(42,245,255,.12)' },
  raven:   { id: 'raven',   name: 'RAVEN COLLECTIVE', color: '#ff4fd1', edge: 'rgba(255,79,209,.5)',  tint: 'rgba(255,79,209,.12)' },
  solaris: { id: 'solaris', name: 'SOLARIS COMPACT',  color: '#ffc247', edge: 'rgba(255,194,71,.5)',  tint: 'rgba(255,194,71,.12)' },
  voidk:   { id: 'voidk',   name: 'VOIDKIN',          color: '#9d7bff', edge: 'rgba(157,123,255,.5)', tint: 'rgba(157,123,255,.12)' }
};

/* ------------------------------------------------------------------
 * Banner — what the summon screen pulls from.
 * ------------------------------------------------------------------ */
const BANNER = {
  id: 'drift_01',
  name: 'DRIFT PROTOCOL',
  subtitle: 'Rate-up: NYX-07 "Ghostline"',
  featured: 'nyx',
  featuredChance: 0.5,   // half of all ASCENDANTs resolve to the featured champion
  costSingle: 160,
  costMulti: 1440,       // 10x at a discount
  pity: { soft: 60, hard: 70, rareFloorEvery: 10 }
};

/* ------------------------------------------------------------------
 * Economy. Levelling a champion burns scrap; ascending burns shards,
 * which only ever come from duplicate pulls — that pairing is what
 * keeps summoning worthwhile after the roster is full.
 * ------------------------------------------------------------------ */
const ECONOMY = {
  fuelCap: 60,
  fuelRegenMs: 4 * 60 * 1000,
  startChronite: 1600,
  startScrap: 4000,

  levelScrap: (level, rarity) => Math.round(
    90 * Math.pow(1.09, level) *
    ({ common: 1, rare: 1.3, epic: 1.7, legendary: 2.2 }[rarity] || 1)
  ),
  ascendShards: stars => [40, 90, 180, 320][stars - 1] || 999999,

  /* Gear drops: how deep the campaign is decides how good a drop can be. */
  dropRarity: tier => {
    const roll = Math.random();
    if (tier >= 14) return roll < 0.12 ? 'legendary' : roll < 0.45 ? 'epic' : 'rare';
    if (tier >= 9)  return roll < 0.04 ? 'legendary' : roll < 0.28 ? 'epic' : roll < 0.75 ? 'rare' : 'common';
    if (tier >= 4)  return roll < 0.12 ? 'epic' : roll < 0.55 ? 'rare' : 'common';
    return roll < 0.04 ? 'epic' : roll < 0.32 ? 'rare' : 'common';
  }
};
