/* ------------------------------------------------------------------
 * data.js — static game database.
 *
 * This is the prototype's stand-in for DT_ItemDatabase / S_ItemVisuals:
 * every item is keyed by a string id (the same id the save layer stores),
 * and everything the UI needs to draw a slot hangs off that row.
 * ------------------------------------------------------------------ */

/* edge/tint are pre-mixed rgba rather than color-mix(), which only exists
   in WebViews from 2023 onward and silently voids the whole declaration
   on anything older. */
const RARITY = {
  common:    { id: 'common',    label: 'STANDARD',  stars: 1, color: '#8294ab',
               glow: 'rgba(130,148,171,.45)', edge: 'rgba(130,148,171,.5)',  tint: 'rgba(130,148,171,.16)',
               weight: 0.600, shards: 1,  scrap: 40  },
  rare:      { id: 'rare',      label: 'ENHANCED',  stars: 2, color: '#2af5ff',
               glow: 'rgba(42,245,255,.45)',  edge: 'rgba(42,245,255,.5)',   tint: 'rgba(42,245,255,.16)',
               weight: 0.300, shards: 5,  scrap: 120 },
  epic:      { id: 'epic',      label: 'PROTOTYPE', stars: 3, color: '#b46bff',
               glow: 'rgba(180,107,255,.5)',  edge: 'rgba(180,107,255,.55)', tint: 'rgba(180,107,255,.18)',
               weight: 0.085, shards: 20, scrap: 400 },
  legendary: { id: 'legendary', label: 'ASCENDANT', stars: 4, color: '#ffc247',
               glow: 'rgba(255,194,71,.55)',  edge: 'rgba(255,194,71,.6)',   tint: 'rgba(255,194,71,.2)',
               weight: 0.015, shards: 60, scrap: 1200 }
};

const RARITY_ORDER = ['legendary', 'epic', 'rare', 'common'];

const FACTION = {
  helix:   { id: 'helix',   name: 'HELIX SYNDICATE',  color: '#2af5ff', edge: 'rgba(42,245,255,.5)',  tint: 'rgba(42,245,255,.12)' },
  raven:   { id: 'raven',   name: 'RAVEN COLLECTIVE', color: '#ff4fd1', edge: 'rgba(255,79,209,.5)',  tint: 'rgba(255,79,209,.12)' },
  solaris: { id: 'solaris', name: 'SOLARIS COMPACT',  color: '#ffc247', edge: 'rgba(255,194,71,.5)',  tint: 'rgba(255,194,71,.12)' },
  voidk:   { id: 'voidk',   name: 'VOIDKIN',          color: '#9d7bff', edge: 'rgba(157,123,255,.5)', tint: 'rgba(157,123,255,.12)' }
};

/* icon = id of an <symbol> in the sprite baked into index.html
   ability  = what the unit does when its cooldown comes up in combat
   cd       = rounds between casts (it fires on the round it reaches) */
const ITEMS = [
  // ---- LEGENDARY ------------------------------------------------
  { id: 'op_nyx',        name: 'NYX-07 "Ghostline"',  type: 'OPERATIVE', rarity: 'legendary', faction: 'voidk',   icon: 'ic-helm',    power: 420,
    trait: 'Phase Step — enters every engagement already shielded.',
    ability: { name: 'Phase Execution', cd: 2, effect: 'execute', power: 2.1, note: 'Strikes the weakest target for massive damage' },
    passive: { effect: 'shield', value: 0.25 } },
  { id: 'wep_singular',  name: 'Singularity Lance',   type: 'WEAPON',    rarity: 'legendary', faction: 'helix',   icon: 'ic-cannon',  power: 400,
    trait: 'Collapse — overkill damage chains to the next target.',
    ability: { name: 'Event Horizon', cd: 3, effect: 'volley', power: 1.35, note: 'Hits the entire enemy line' } },
  { id: 'op_solmarch',   name: 'Sol Marshal Vex',     type: 'OPERATIVE', rarity: 'legendary', faction: 'solaris', icon: 'ic-visor',   power: 395,
    trait: 'Corona — the whole squad fights harder under their command.',
    ability: { name: 'Corona Call', cd: 3, effect: 'rally', power: 0.35, note: 'Raises squad attack for 2 rounds' } },

  // ---- EPIC -----------------------------------------------------
  { id: 'op_kestrel',    name: 'Kestrel',             type: 'OPERATIVE', rarity: 'epic', faction: 'raven',   icon: 'ic-helm',   power: 240,
    trait: 'Talon Drop — opens with a free strike.',
    ability: { name: 'Talon Drop', cd: 2, effect: 'strike', power: 1.9, note: 'A single devastating hit' } },
  { id: 'wep_arcflux',   name: 'Arcflux Repeater',    type: 'WEAPON',    rarity: 'epic', faction: 'helix',   icon: 'ic-rifle',  power: 235,
    trait: 'Chain arc across three hostiles.',
    ability: { name: 'Chain Arc', cd: 2, effect: 'volley', power: 0.85, note: 'Arcs across the enemy line' } },
  { id: 'wep_voidedge',  name: 'Voidedge',            type: 'WEAPON',    rarity: 'epic', faction: 'voidk',   icon: 'ic-blade',  power: 230,
    trait: 'Severs shields before armour.',
    ability: { name: 'Sever', cd: 2, effect: 'siphon', power: 1.5, note: 'Cuts deep and feeds on the wound' } },
  { id: 'gear_aegis',    name: 'Aegis Bulwark',       type: 'GEAR',      rarity: 'epic', faction: 'solaris', icon: 'ic-shield', power: 225,
    trait: 'Absorbs a quarter of everything aimed at the squad.',
    ability: { name: 'Bulwark', cd: 3, effect: 'ward', power: 0.6, note: 'Shields the most wounded ally' } },
  { id: 'gear_wraith',   name: 'Wraith Core',         type: 'GEAR',      rarity: 'epic', faction: 'voidk',   icon: 'ic-core',   power: 228,
    trait: 'Cloaks the squad for the first assault wave.',
    ability: { name: 'Phase Veil', cd: 3, effect: 'ward', power: 0.5, note: 'Shields an ally and blurs the line' } },
  { id: 'op_marrow',     name: 'Dr. Marrow',          type: 'OPERATIVE', rarity: 'epic', faction: 'helix',   icon: 'ic-visor',  power: 232,
    trait: 'Field surgery keeps a losing fight going.',
    ability: { name: 'Field Surgery', cd: 2, effect: 'mend', power: 0.45, note: 'Patches up the worst-hurt ally' } },

  // ---- RARE -----------------------------------------------------
  { id: 'wep_m4x',       name: 'M4-X Service Rifle',  type: 'WEAPON',    rarity: 'rare', faction: 'solaris', icon: 'ic-rifle',   power: 120,
    trait: 'Reliable. Boring. Never jams.',
    ability: { name: 'Burst Fire', cd: 2, effect: 'strike', power: 1.6, note: 'A tight, disciplined burst' } },
  { id: 'wep_ripper',    name: 'Ripper SMG',          type: 'WEAPON',    rarity: 'rare', faction: 'raven',   icon: 'ic-pistol',  power: 115,
    trait: 'High fire rate, terrible manners.',
    ability: { name: 'Spray', cd: 3, effect: 'volley', power: 0.7, note: 'Sprays the whole line' } },
  { id: 'wep_hexblade',  name: 'Hexblade',            type: 'WEAPON',    rarity: 'rare', faction: 'voidk',   icon: 'ic-blade',   power: 118,
    trait: 'Cuts cleanly through drone plating.',
    ability: { name: 'Hex Cut', cd: 2, effect: 'siphon', power: 1.3, note: 'Bleeds the target and mends the wielder' } },
  { id: 'gear_scout',    name: 'Scout Drone MK-II',   type: 'GEAR',      rarity: 'rare', faction: 'helix',   icon: 'ic-drone',   power: 112,
    trait: 'Marks the weak point before anyone else sees it.',
    ability: { name: 'Target Paint', cd: 3, effect: 'rally', power: 0.2, note: 'Marks targets; squad hits harder' } },
  { id: 'gear_pulse',    name: 'Pulse Reactor',       type: 'GEAR',      rarity: 'rare', faction: 'helix',   icon: 'ic-reactor', power: 116,
    trait: 'Dumps raw power into the nearest friendly system.',
    ability: { name: 'Overcharge', cd: 3, effect: 'ward', power: 0.4, note: 'Overcharges an ally shield' } },
  { id: 'op_dax',        name: 'Sgt. Dax',            type: 'OPERATIVE', rarity: 'rare', faction: 'solaris', icon: 'ic-helm',    power: 122,
    trait: 'Holds the line long enough for everyone else.',
    ability: { name: 'Hold Fast', cd: 3, effect: 'ward', power: 0.55, note: 'Braces an ally against the next blow' } },
  { id: 'op_wisp',       name: 'Wisp',                type: 'OPERATIVE', rarity: 'rare', faction: 'raven',   icon: 'ic-visor',   power: 119,
    trait: 'Slips past sentries unseen.',
    ability: { name: 'Backstab', cd: 2, effect: 'execute', power: 1.5, note: 'Finds the softest target' } },
  { id: 'gear_kite',     name: 'Kite Shield Array',   type: 'GEAR',      rarity: 'rare', faction: 'solaris', icon: 'ic-shield',  power: 114,
    trait: 'Deployable cover for the whole fireteam.',
    ability: { name: 'Deploy Cover', cd: 3, effect: 'ward', power: 0.45, note: 'Throws up cover for an ally' } },

  // ---- COMMON ---------------------------------------------------
  { id: 'wep_sidearm',   name: 'Colonial Sidearm',    type: 'WEAPON', rarity: 'common', faction: 'solaris', icon: 'ic-pistol',  power: 48,
    trait: 'Standard issue since the first drop.',
    ability: { name: 'Aimed Shot', cd: 3, effect: 'strike', power: 1.4, note: 'One careful shot' } },
  { id: 'wep_scrapgun',  name: 'Scrapgun',            type: 'WEAPON', rarity: 'common', faction: 'raven',   icon: 'ic-rifle',   power: 46,
    trait: 'Assembled from three worse guns.',
    ability: { name: 'Scattershot', cd: 3, effect: 'volley', power: 0.55, note: 'Sprays whatever is in front' } },
  { id: 'wep_shiv',      name: 'Carbon Shiv',         type: 'WEAPON', rarity: 'common', faction: 'voidk',   icon: 'ic-blade',   power: 44,
    trait: 'Quiet, and that is the whole pitch.',
    ability: { name: 'Quiet Work', cd: 3, effect: 'execute', power: 1.3, note: 'Finishes the wounded' } },
  { id: 'gear_patch',    name: 'Patch Kit',           type: 'GEAR',   rarity: 'common', faction: 'helix',   icon: 'ic-core',    power: 40,
    trait: 'Keeps a squad upright one wave longer.',
    ability: { name: 'Patch Up', cd: 3, effect: 'mend', power: 0.3, note: 'A field dressing, nothing fancy' } },
  { id: 'gear_beacon',   name: 'Signal Beacon',       type: 'GEAR',   rarity: 'common', faction: 'helix',   icon: 'ic-drone',   power: 42,
    trait: 'Calls extraction. Eventually.',
    ability: { name: 'Mark', cd: 3, effect: 'rally', power: 0.15, note: 'Calls in a firing solution' } },
  { id: 'gear_plating',  name: 'Salvage Plating',     type: 'GEAR',   rarity: 'common', faction: 'raven',   icon: 'ic-shield',  power: 45,
    trait: 'Bolted-on hull scrap. It counts.',
    ability: { name: 'Brace', cd: 3, effect: 'ward', power: 0.35, note: 'Bolts scrap over the worst of it' } },
  { id: 'op_rook',       name: 'Rookie Conscript',    type: 'OPERATIVE', rarity: 'common', faction: 'solaris', icon: 'ic-helm',  power: 50,
    trait: 'Eager. Statistically doomed. Cheap.',
    ability: { name: 'Desperate Swing', cd: 3, effect: 'strike', power: 1.35, note: 'Everything they have, all at once' } },
  { id: 'gear_cell',     name: 'Spare Power Cell',    type: 'GEAR',   rarity: 'common', faction: 'voidk',   icon: 'ic-reactor', power: 43,
    trait: 'Warm to the touch. Probably fine.',
    ability: { name: 'Discharge', cd: 3, effect: 'strike', power: 1.45, note: 'Dumps the whole cell downrange' } }
];

const ITEM_BY_ID = ITEMS.reduce((map, item) => { map[item.id] = item; return map; }, {});

/** Look up a row the way Get Data Table Row would. */
function getItemRow(itemId) {
  return ITEM_BY_ID[itemId] || null;
}

function itemsOfRarity(rarityId) {
  return ITEMS.filter(i => i.rarity === rarityId);
}

/* ------------------------------------------------------------------
 * Banner — what the summon screen pulls from.
 * ------------------------------------------------------------------ */
const BANNER = {
  id: 'drift_01',
  name: 'DRIFT PROTOCOL',
  subtitle: 'Rate-up: NYX-07 "Ghostline"',
  featured: 'op_nyx',
  featuredChance: 0.5,   // half of all legendaries resolve to the featured unit
  costSingle: 160,
  costMulti: 1440,       // 10x at a discount
  pity: { soft: 60, hard: 70, rareFloorEvery: 10 }
};

/* ------------------------------------------------------------------
 * Sectors — the deploy loop that feeds currency back into summoning.
 * ------------------------------------------------------------------ */
const SECTORS = [
  { id: 's1', name: 'Ossuary Belt',    threat: 'raven',   power: 120,  fuel: 8,  scrap: 260,  chronite: 60,  dropChance: 0.25 },
  { id: 's2', name: 'Helix Drydock',   threat: 'helix',   power: 300,  fuel: 10, scrap: 520,  chronite: 110, dropChance: 0.3  },
  { id: 's3', name: 'Cinder Reach',    threat: 'solaris', power: 560,  fuel: 12, scrap: 900,  chronite: 170, dropChance: 0.35 },
  { id: 's4', name: 'The Black Fold',  threat: 'voidk',   power: 880,  fuel: 14, scrap: 1500, chronite: 240, dropChance: 0.4  },
  { id: 's5', name: 'Carrier Wreck 9', threat: 'raven',   power: 1250, fuel: 16, scrap: 2300, chronite: 320, dropChance: 0.45 }
];

/* Combat derives from the same power number the armory shows, so a player
   never has to learn a second stat system to understand a fight. */
const COMBAT = {
  hpPerPower: 4.2,
  baseCrit: 0.06,
  critMultiplier: 1.8,
  variance: 0.22,          // +/- swing on every hit
  factionBonus: 0.2,       // matching the sector threat
  maxRounds: 14,
  speedByType: { OPERATIVE: 12, WEAPON: 10, GEAR: 8 },
  speedByRarity: { common: 0, rare: 1, epic: 2, legendary: 3 }
};

const ECONOMY = {
  fuelCap: 60,
  fuelRegenMs: 4 * 60 * 1000,   // one unit every four minutes
  startChronite: 1600,
  startScrap: 1500,
  levelCap: 10,
  // Levels are the real progression gate. Scrap comes from replaying
  // cleared nodes; shards come only from duplicate pulls, which is what
  // keeps the campaign from being cleared in a weekend.
  upgradeScrap: level => Math.round(220 * Math.pow(1.5, level - 1)),
  upgradeShards: level => level * 3,
  powerPerLevel: 0.12           // +12% of base power per level over 1
};
