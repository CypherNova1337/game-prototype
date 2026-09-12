/* ------------------------------------------------------------------
 * data.js — static game database.
 *
 * This is the prototype's stand-in for DT_ItemDatabase / S_ItemVisuals:
 * every item is keyed by a string id (the same id the save layer stores),
 * and everything the UI needs to draw a slot hangs off that row.
 * ------------------------------------------------------------------ */

const RARITY = {
  common:    { id: 'common',    label: 'STANDARD',  stars: 1, color: '#8294ab', glow: 'rgba(130,148,171,.45)', weight: 0.600, shards: 1,  scrap: 40  },
  rare:      { id: 'rare',      label: 'ENHANCED',  stars: 2, color: '#2af5ff', glow: 'rgba(42,245,255,.45)',  weight: 0.300, shards: 5,  scrap: 120 },
  epic:      { id: 'epic',      label: 'PROTOTYPE', stars: 3, color: '#b46bff', glow: 'rgba(180,107,255,.5)',  weight: 0.085, shards: 20, scrap: 400 },
  legendary: { id: 'legendary', label: 'ASCENDANT', stars: 4, color: '#ffc247', glow: 'rgba(255,194,71,.55)',  weight: 0.015, shards: 60, scrap: 1200 }
};

const RARITY_ORDER = ['legendary', 'epic', 'rare', 'common'];

const FACTION = {
  helix:   { id: 'helix',   name: 'HELIX SYNDICATE', color: '#2af5ff' },
  raven:   { id: 'raven',   name: 'RAVEN COLLECTIVE', color: '#ff4fd1' },
  solaris: { id: 'solaris', name: 'SOLARIS COMPACT',  color: '#ffc247' },
  voidk:   { id: 'voidk',   name: 'VOIDKIN',          color: '#9d7bff' }
};

/* icon = id of an <symbol> in the sprite baked into index.html */
const ITEMS = [
  // ---- LEGENDARY ------------------------------------------------
  { id: 'op_nyx',        name: 'NYX-07 "Ghostline"',  type: 'OPERATIVE', rarity: 'legendary', faction: 'voidk',   icon: 'ic-helm',    power: 420, trait: 'Phase Step — ignores the first hit of every engagement.' },
  { id: 'wep_singular',  name: 'Singularity Lance',   type: 'WEAPON',    rarity: 'legendary', faction: 'helix',   icon: 'ic-cannon',  power: 400, trait: 'Collapse — overkill damage chains to the next target.' },
  { id: 'op_solmarch',   name: 'Sol Marshal Vex',     type: 'OPERATIVE', rarity: 'legendary', faction: 'solaris', icon: 'ic-visor',   power: 395, trait: 'Corona — squad power +8% on Solaris-threat sectors.' },

  // ---- EPIC -----------------------------------------------------
  { id: 'op_kestrel',    name: 'Kestrel',             type: 'OPERATIVE', rarity: 'epic', faction: 'raven',   icon: 'ic-helm',   power: 240, trait: 'Talon Drop — opens with a free strike.' },
  { id: 'wep_arcflux',   name: 'Arcflux Repeater',    type: 'WEAPON',    rarity: 'epic', faction: 'helix',   icon: 'ic-rifle',  power: 235, trait: 'Chain arc across three hostiles.' },
  { id: 'wep_voidedge',  name: 'Voidedge',            type: 'WEAPON',    rarity: 'epic', faction: 'voidk',   icon: 'ic-blade',  power: 230, trait: 'Severs shields before armour.' },
  { id: 'gear_aegis',    name: 'Aegis Bulwark',       type: 'GEAR',      rarity: 'epic', faction: 'solaris', icon: 'ic-shield', power: 225, trait: 'Absorbs 25% of incoming sector damage.' },
  { id: 'gear_wraith',   name: 'Wraith Core',         type: 'GEAR',      rarity: 'epic', faction: 'voidk',   icon: 'ic-core',   power: 228, trait: 'Cloaks the squad for the first assault wave.' },
  { id: 'op_marrow',     name: 'Dr. Marrow',          type: 'OPERATIVE', rarity: 'epic', faction: 'helix',   icon: 'ic-visor',  power: 232, trait: 'Field surgery — salvage yield +15%.' },

  // ---- RARE -----------------------------------------------------
  { id: 'wep_m4x',       name: 'M4-X Service Rifle',  type: 'WEAPON',    rarity: 'rare', faction: 'solaris', icon: 'ic-rifle',   power: 120, trait: 'Reliable. Boring. Never jams.' },
  { id: 'wep_ripper',    name: 'Ripper SMG',          type: 'WEAPON',    rarity: 'rare', faction: 'raven',   icon: 'ic-pistol',  power: 115, trait: 'High fire rate, terrible manners.' },
  { id: 'wep_hexblade',  name: 'Hexblade',            type: 'WEAPON',    rarity: 'rare', faction: 'voidk',   icon: 'ic-blade',   power: 118, trait: 'Cuts cleanly through drone plating.' },
  { id: 'gear_scout',    name: 'Scout Drone MK-II',   type: 'GEAR',      rarity: 'rare', faction: 'helix',   icon: 'ic-drone',   power: 112, trait: 'Reveals sector threat before deployment.' },
  { id: 'gear_pulse',    name: 'Pulse Reactor',       type: 'GEAR',      rarity: 'rare', faction: 'helix',   icon: 'ic-reactor', power: 116, trait: 'Fuel regenerates 10% faster.' },
  { id: 'op_dax',        name: 'Sgt. Dax',            type: 'OPERATIVE', rarity: 'rare', faction: 'solaris', icon: 'ic-helm',    power: 122, trait: 'Holds the line long enough for everyone else.' },
  { id: 'op_wisp',       name: 'Wisp',                type: 'OPERATIVE', rarity: 'rare', faction: 'raven',   icon: 'ic-visor',   power: 119, trait: 'Slips past sentries unseen.' },
  { id: 'gear_kite',     name: 'Kite Shield Array',   type: 'GEAR',      rarity: 'rare', faction: 'solaris', icon: 'ic-shield',  power: 114, trait: 'Deployable cover for the whole fireteam.' },

  // ---- COMMON ---------------------------------------------------
  { id: 'wep_sidearm',   name: 'Colonial Sidearm',    type: 'WEAPON', rarity: 'common', faction: 'solaris', icon: 'ic-pistol',  power: 48, trait: 'Standard issue since the first drop.' },
  { id: 'wep_scrapgun',  name: 'Scrapgun',            type: 'WEAPON', rarity: 'common', faction: 'raven',   icon: 'ic-rifle',   power: 46, trait: 'Assembled from three worse guns.' },
  { id: 'wep_shiv',      name: 'Carbon Shiv',         type: 'WEAPON', rarity: 'common', faction: 'voidk',   icon: 'ic-blade',   power: 44, trait: 'Quiet, and that is the whole pitch.' },
  { id: 'gear_patch',    name: 'Patch Kit',           type: 'GEAR',   rarity: 'common', faction: 'helix',   icon: 'ic-core',    power: 40, trait: 'Keeps a squad upright one wave longer.' },
  { id: 'gear_beacon',   name: 'Signal Beacon',       type: 'GEAR',   rarity: 'common', faction: 'helix',   icon: 'ic-drone',   power: 42, trait: 'Calls extraction. Eventually.' },
  { id: 'gear_plating',  name: 'Salvage Plating',     type: 'GEAR',   rarity: 'common', faction: 'raven',   icon: 'ic-shield',  power: 45, trait: 'Bolted-on hull scrap. It counts.' },
  { id: 'op_rook',       name: 'Rookie Conscript',    type: 'OPERATIVE', rarity: 'common', faction: 'solaris', icon: 'ic-helm',  power: 50, trait: 'Eager. Statistically doomed. Cheap.' },
  { id: 'gear_cell',     name: 'Spare Power Cell',    type: 'GEAR',   rarity: 'common', faction: 'voidk',   icon: 'ic-reactor', power: 43, trait: 'Warm to the touch. Probably fine.' }
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

const ECONOMY = {
  fuelCap: 60,
  fuelRegenMs: 4 * 60 * 1000,   // one unit every four minutes
  startChronite: 4800,
  startScrap: 1500,
  levelCap: 10,
  upgradeScrap: level => Math.round(180 * Math.pow(1.45, level - 1)),
  upgradeShards: level => level * 2,
  powerPerLevel: 0.12           // +12% of base power per level over 1
};
