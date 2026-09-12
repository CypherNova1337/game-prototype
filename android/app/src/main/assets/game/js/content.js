/* ------------------------------------------------------------------
 * content.js — everything the game is *about*: who you fight, where,
 * what the store sells and what the pass pays out.
 *
 * Kept apart from data.js (which owns items and rates) so content can
 * grow without the tuning constants moving around underneath it.
 * ------------------------------------------------------------------ */

/* ---------------- hostiles ---------------- */

const ENEMIES = {
  // Ossuary Belt — scavengers who strip wrecks and anyone still in them
  scav_picker:   { name: 'Bone Picker',      faction: 'raven',   icon: 'ic-pistol',  base: 42, role: 'skirmisher' },
  scav_cutter:   { name: 'Hull Cutter',      faction: 'raven',   icon: 'ic-blade',   base: 50, role: 'striker' },
  scav_hauler:   { name: 'Scrap Hauler',     faction: 'raven',   icon: 'ic-shield',  base: 62, role: 'bulwark' },
  scav_swarm:    { name: 'Swarm Drone',      faction: 'raven',   icon: 'ic-drone',   base: 34, role: 'skirmisher' },

  // Helix Drydock — corporate security with better toys than you
  helix_sentry:  { name: 'Drydock Sentry',   faction: 'helix',   icon: 'ic-rifle',   base: 58, role: 'striker' },
  helix_warden:  { name: 'Contract Warden',  faction: 'helix',   icon: 'ic-visor',   base: 66, role: 'skirmisher' },
  helix_bastion: { name: 'Bastion Frame',    faction: 'helix',   icon: 'ic-shield',  base: 80, role: 'bulwark' },
  helix_lance:   { name: 'Lance Platform',   faction: 'helix',   icon: 'ic-cannon',  base: 74, role: 'artillery' },

  // Cinder Reach — Solaris zealots burning their own worlds first
  sol_pilgrim:   { name: 'Ash Pilgrim',      faction: 'solaris', icon: 'ic-helm',    base: 68, role: 'striker' },
  sol_censor:    { name: 'Flame Censor',     faction: 'solaris', icon: 'ic-reactor', base: 82, role: 'artillery' },
  sol_deacon:    { name: 'Cinder Deacon',    faction: 'solaris', icon: 'ic-visor',   base: 90, role: 'support' },

  // The Black Fold — whatever the Voidkin left behind
  void_husk:     { name: 'Drift Husk',       faction: 'voidk',   icon: 'ic-helm',    base: 86, role: 'striker' },
  void_maw:      { name: 'Fold Maw',         faction: 'voidk',   icon: 'ic-core',    base: 104, role: 'artillery' },
  void_echo:     { name: 'Echo of Nyx',      faction: 'voidk',   icon: 'ic-visor',   base: 96, role: 'skirmisher' },

  // Bosses — one per chapter, each with a signature the log calls out
  boss_carrion:  { name: 'CARRION PRIME',    faction: 'raven',   icon: 'ic-cannon',  base: 120, role: 'boss',
                   boss: true, hpScale: 1.9, signature: { name: 'Scrap Storm', cd: 3, effect: 'volley', power: 1.1 } },
  boss_foreman:  { name: 'FOREMAN ATLAS',    faction: 'helix',   icon: 'ic-shield',  base: 150, role: 'boss',
                   boss: true, hpScale: 2.0, signature: { name: 'Lockdown', cd: 3, effect: 'strike', power: 2.2 } },
  boss_pyre:     { name: 'THE PYRE SAINT',   faction: 'solaris', icon: 'ic-reactor', base: 178, role: 'boss',
                   boss: true, hpScale: 2.0, signature: { name: 'Immolation', cd: 2, effect: 'volley', power: 1.3 } },
  boss_fold:     { name: 'THE FOLD ITSELF',  faction: 'voidk',   icon: 'ic-core',    base: 215, role: 'boss',
                   boss: true, hpScale: 2.2, signature: { name: 'Unmake', cd: 2, effect: 'execute', power: 2.6 } }
};

/* Role decides how a hostile behaves, so a line of four reads differently
   depending on what is standing in it. */
const ROLE = {
  skirmisher: { hp: 0.85, atk: 1.1,  spd: 13 },
  striker:    { hp: 1.0,  atk: 1.0,  spd: 11 },
  bulwark:    { hp: 1.6,  atk: 0.7,  spd: 8  },
  artillery:  { hp: 0.8,  atk: 1.25, spd: 9  },
  support:    { hp: 1.0,  atk: 0.85, spd: 12 },
  boss:       { hp: 1.0,  atk: 1.05, spd: 10 }
};

/* ---------------- campaign ---------------- */

/* Reward curve. Kept separate from the combat curve below so payouts can
   be generous without making fights harder. */
const TIER_SCALE = tier => 1 + 0.34 * (tier - 1);

/* What a player realistically fields at each tier, measured from the
   armory a normal run produces. Encounters are budgeted against this
   rather than scaled by a compounding multiplier — with a multiplier the
   enemies outgrow the player between every chapter step, which is exactly
   what tools/balance.js caught on the first pass. */
const POWER_CURVE = [
  120, 155, 195, 245, 305,        // chapter 1
  385, 455, 535, 655, 785,        // chapter 2
  900, 1010, 1120, 1230, 1340,    // chapter 3
  1450, 1560, 1670, 1780, 1900    // chapter 4
];

/* The tail of that curve is bounded by what a player can actually field:
   the best three items at max level come to roughly 2,530 power, so the
   final node must sit well under it. tools/economy.js caught the first
   pass, where node 19 demanded more power than the game could produce. */
const MAX_REACHABLE_POWER = 2530;

/* Share of the player's own power a node may field, per chapter and per
   position in it. Solved by tools/calibrate.js for ~85% win on curve
   (~60% on bosses) — later chapters need more pressure because the
   squads there have far better abilities, not just bigger numbers. */
const NODE_PRESSURE = {
  ch1: [0.90, 0.92, 0.99, 0.99, 0.79],
  ch2: [1.02, 1.04, 1.06, 1.12, 0.83],
  ch3: [1.07, 1.15, 1.14, 1.18, 0.82],
  ch4: [1.17, 1.21, 1.20, 1.23, 0.91]
};

/** Total enemy power a node may spend, and how it splits across the line. */
function nodeBudget(node) {
  const curve = POWER_CURVE[Math.min(POWER_CURVE.length - 1, node.tier - 1)];
  const position = node.tier % 5 === 0 ? 4 : (node.tier % 5) - 1;
  const chapter = node.chapter || chapterOf(node.id);
  const table = NODE_PRESSURE[chapter] || NODE_PRESSURE.ch1;
  return curve * table[Math.max(0, position)] * (node.pressure || 1);
}

/** Chapter lookup for node objects that were not taken from ALL_NODES. */
function chapterOf(nodeId) {
  const chapter = CHAPTERS.find(c => c.nodes.some(n => n.id === nodeId));
  return chapter ? chapter.id : 'ch1';
}

/** One enemy's slice of the budget, weighted by how big a thing it is. */
function enemyShare(node, index) {
  const weights = node.comp.map(id => ENEMIES[id].base);
  const total = weights.reduce((a, b) => a + b, 0);
  return nodeBudget(node) * (weights[index] / total);
}

const CHAPTERS = [
  {
    id: 'ch1', name: 'OSSUARY BELT', faction: 'raven',
    blurb: 'A graveyard of hulls, picked over by people who got here first.',
    nodes: [
      { id: 'c1n1', name: 'Drift Approach',   tier: 1,  fuel: 6,  comp: ['scav_swarm', 'scav_picker', 'scav_picker'] },
      { id: 'c1n2', name: 'Rib Corridor',     tier: 2,  fuel: 6,  comp: ['scav_picker', 'scav_cutter', 'scav_swarm', 'scav_swarm'] },
      { id: 'c1n3', name: 'The Spine',        tier: 3,  fuel: 8,  comp: ['scav_cutter', 'scav_cutter', 'scav_hauler'] },
      { id: 'c1n4', name: 'Marrow Hold',      tier: 4,  fuel: 8,  comp: ['scav_hauler', 'scav_cutter', 'scav_picker', 'scav_swarm'] },
      { id: 'c1n5', name: 'Carrion Throne',   tier: 5,  fuel: 10, comp: ['boss_carrion', 'scav_cutter', 'scav_hauler'], boss: true }
    ]
  },
  {
    id: 'ch2', name: 'HELIX DRYDOCK', faction: 'helix',
    blurb: 'Someone is still building warships here, and they are not hiring.',
    nodes: [
      { id: 'c2n1', name: 'Outer Gantry',     tier: 6,  fuel: 10, comp: ['helix_sentry', 'helix_sentry', 'helix_warden'] },
      { id: 'c2n2', name: 'Coolant Deck',     tier: 7,  fuel: 10, comp: ['helix_warden', 'helix_lance', 'helix_sentry', 'helix_sentry'] },
      { id: 'c2n3', name: 'Slipway Four',     tier: 8,  fuel: 12, comp: ['helix_bastion', 'helix_lance', 'helix_warden'] },
      { id: 'c2n4', name: 'Contract Floor',   tier: 9,  fuel: 12, comp: ['helix_bastion', 'helix_bastion', 'helix_lance', 'helix_warden'] },
      { id: 'c2n5', name: "Foreman's Yard",   tier: 10, fuel: 14, comp: ['boss_foreman', 'helix_bastion', 'helix_lance'], boss: true }
    ]
  },
  {
    id: 'ch3', name: 'CINDER REACH', faction: 'solaris',
    blurb: 'They set their own sky on fire to keep the Fold out. It did not work.',
    nodes: [
      { id: 'c3n1', name: 'Ashfall Landing',  tier: 11, fuel: 14, comp: ['sol_pilgrim', 'sol_pilgrim', 'sol_censor'] },
      { id: 'c3n2', name: 'The Long Vigil',   tier: 12, fuel: 14, comp: ['sol_pilgrim', 'sol_censor', 'sol_deacon', 'sol_pilgrim'] },
      { id: 'c3n3', name: 'Reliquary Span',   tier: 13, fuel: 16, comp: ['sol_deacon', 'sol_censor', 'sol_censor'] },
      { id: 'c3n4', name: 'Furnace Nave',     tier: 14, fuel: 16, comp: ['sol_deacon', 'sol_deacon', 'sol_pilgrim', 'sol_censor'] },
      { id: 'c3n5', name: 'The Last Sermon',  tier: 15, fuel: 18, comp: ['boss_pyre', 'sol_deacon', 'sol_censor'], boss: true }
    ]
  },
  {
    id: 'ch4', name: 'THE BLACK FOLD', faction: 'voidk',
    blurb: 'Space here remembers being something else. It would like to be that again.',
    nodes: [
      { id: 'c4n1', name: 'Threshold',        tier: 16, fuel: 18, comp: ['void_husk', 'void_husk', 'void_echo'] },
      { id: 'c4n2', name: 'Recursion',        tier: 17, fuel: 18, comp: ['void_echo', 'void_maw', 'void_husk', 'void_husk'] },
      { id: 'c4n3', name: 'The Quiet Choir',  tier: 18, fuel: 20, comp: ['void_maw', 'void_maw', 'void_echo'] },
      { id: 'c4n4', name: 'Unwritten Deck',   tier: 19, fuel: 20, comp: ['void_maw', 'void_echo', 'void_echo', 'void_husk'] },
      { id: 'c4n5', name: 'The Fold Itself',  tier: 20, fuel: 22, comp: ['boss_fold', 'void_maw', 'void_echo'], boss: true }
    ]
  }
];

/** Payout for a node, derived from its tier so the curve stays consistent. */
function nodeRewards(node) {
  const t = node.tier;
  const bossBonus = node.boss ? 2.2 : 1;
  return {
    scrap: Math.round(180 * TIER_SCALE(t) * bossBonus),
    chronite: Math.round(42 * TIER_SCALE(t) * bossBonus),
    xp: Math.round(18 * (1 + 0.12 * (t - 1)) * bossBonus),
    firstClear: Math.round(150 * (node.boss ? 3 : 1) + 25 * t)
  };
}

const ALL_NODES = CHAPTERS.reduce((list, ch) =>
  list.concat(ch.nodes.map(n => Object.assign({ chapter: ch.id, faction: ch.faction }, n))), []);

function getNode(nodeId) {
  return ALL_NODES.find(n => n.id === nodeId) || null;
}

/* Stars are the replay hook: clearing is one, clearing well is three. */
const STAR_GOALS = [
  { id: 'clear',   label: 'Clear the sector' },
  { id: 'nolosses', label: 'No unit lost' },
  { id: 'fast',    label: 'Win within 6 rounds' }
];

/* ---------------- cosmetics ---------------- */

/* Themes only move colour tokens. Nothing here touches a number that
   matters in a fight — that is the whole rule of the store. */
const THEMES = {
  drift:  { name: 'DRIFT STANDARD', free: true,
            vars: { '--cyan': '#2af5ff', '--magenta': '#ff4fd1', '--gold': '#ffc247',
                    '--bg': '#05070f', '--line-hot': 'rgba(42,245,255,.55)' } },
  voidk:  { name: 'VOIDKIN',
            vars: { '--cyan': '#9d7bff', '--magenta': '#ff6bd6', '--gold': '#c9a6ff',
                    '--bg': '#07060f', '--line-hot': 'rgba(157,123,255,.55)' } },
  solar:  { name: 'SOLAR FLARE',
            vars: { '--cyan': '#ffb347', '--magenta': '#ff6a3d', '--gold': '#ffd98a',
                    '--bg': '#0d0703', '--line-hot': 'rgba(255,179,71,.55)' } },
  raven:  { name: 'RAVEN SIGNAL',
            vars: { '--cyan': '#ff4fd1', '--magenta': '#ff2d6f', '--gold': '#ffa8e0',
                    '--bg': '#0b0410', '--line-hot': 'rgba(255,79,209,.55)' } },
  mono:   { name: 'DEAD CHANNEL',
            vars: { '--cyan': '#7dffb0', '--magenta': '#c8ffd8', '--gold': '#e8fff0',
                    '--bg': '#030805', '--line-hot': 'rgba(125,255,176,.5)' } }
};

const SIGILS = {
  nova:   { name: 'NOVA', icon: 'ic-star', free: true },
  helm:   { name: 'VANGUARD', icon: 'ic-helm' },
  core:   { name: 'CORE', icon: 'ic-core' },
  blade:  { name: 'EDGE', icon: 'ic-blade' },
  drone:  { name: 'SWARM', icon: 'ic-drone' },
  shield: { name: 'BULWARK', icon: 'ic-shield' }
};

const TITLES = {
  drifter:   { name: 'Drifter', free: true },
  salvager:  { name: 'Salvager', free: true },
  breaker:   { name: 'Hull Breaker' },
  ascendant: { name: 'The Ascendant' },
  quiet:     { name: 'Quiet Professional' },
  founder:   { name: 'Founding Drifter' }
};

/* ---------------- store ---------------- */

/* Prices are display-only: this build has no payment processor wired up
   and takes no money. See Commerce in store.js. */
const STORE = {
  cosmetics: [
    { id: 'theme_voidk',  kind: 'theme',  ref: 'voidk',  name: 'VOIDKIN palette',      price: 2.99, blurb: 'Violet hangar lighting and Fold-touched accents.' },
    { id: 'theme_solar',  kind: 'theme',  ref: 'solar',  name: 'SOLAR FLARE palette',  price: 2.99, blurb: 'Burnt orange, for people who liked Cinder Reach.' },
    { id: 'theme_raven',  kind: 'theme',  ref: 'raven',  name: 'RAVEN SIGNAL palette', price: 2.99, blurb: 'Scavenger pink. Loud on purpose.' },
    { id: 'theme_mono',   kind: 'theme',  ref: 'mono',   name: 'DEAD CHANNEL palette', price: 3.99, blurb: 'Phosphor green. Reads like a salvaged terminal.' },
    { id: 'sigil_pack',   kind: 'sigils', ref: ['helm', 'core', 'blade', 'drone', 'shield'], name: 'Sigil collection', price: 3.99, blurb: 'Five squad emblems for the deploy screen.' },
    { id: 'title_pack',   kind: 'titles', ref: ['breaker', 'ascendant', 'quiet'], name: 'Callsign set', price: 1.99, blurb: 'Three commander titles.' }
  ],
  currency: [
    { id: 'chr_small',  kind: 'chronite', amount: 1200,  price: 1.99,  name: 'Chronite cache' },
    { id: 'chr_mid',    kind: 'chronite', amount: 6800,  price: 9.99,  name: 'Chronite vault',   tag: 'POPULAR' },
    { id: 'chr_large',  kind: 'chronite', amount: 22000, price: 29.99, name: 'Chronite reserve', tag: 'BEST VALUE' }
  ],
  pass: { id: 'pass_premium', name: 'DRIFT PASS — premium track', price: 9.99,
          blurb: 'Cosmetics and chronite on top of the free track. Every gameplay reward on the free track stays free.' },
  supporter: { id: 'supporter', name: 'Founding Drifter', price: 4.99,
               blurb: 'A badge, a title, and 150 chronite a day, forever. No power, no exclusivity.' }
};

/* ---------------- drift pass ---------------- */

const PASS = {
  levels: 30,
  xpPerLevel: 120,
  /** Free track pays every level; the premium track sits alongside it. */
  reward(level, premium) {
    if (!premium) {
      if (level % 10 === 0) return { chronite: 800, label: '800 chronite' };
      if (level % 5 === 0)  return { shards: 25, label: '25 shards' };
      if (level % 2 === 0)  return { chronite: 180, label: '180 chronite' };
      return { scrap: 400, label: '400 scrap' };
    }
    if (level === 30) return { cosmetic: { kind: 'title', ref: 'ascendant' }, label: 'Title: The Ascendant' };
    if (level === 20) return { cosmetic: { kind: 'theme', ref: 'mono' }, label: 'DEAD CHANNEL palette' };
    if (level === 10) return { cosmetic: { kind: 'sigil', ref: 'core' }, label: 'Sigil: CORE' };
    if (level % 5 === 0) return { chronite: 600, label: '600 chronite' };
    return { chronite: 220, label: '220 chronite' };
  }
};

/* ---------------- daily contracts ---------------- */

const QUESTS = [
  { id: 'q_deploy',  text: 'Clear 3 sectors',            goal: 3, reward: { chronite: 200 } },
  { id: 'q_summon',  text: 'Summon once',                goal: 1, reward: { chronite: 150 } },
  { id: 'q_flawless', text: 'Win without losing a unit', goal: 1, reward: { shards: 10 } },
  { id: 'q_upgrade', text: 'Upgrade any item',           goal: 1, reward: { scrap: 600 } }
];

const DAILY_LOGIN = { chronite: 250, fuel: 20 };
