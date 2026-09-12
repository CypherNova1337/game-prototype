/* ------------------------------------------------------------------
 * content.js — everything the game is *about*: who you fight, where,
 * what the store sells and what the pass pays out.
 *
 * Kept apart from data.js (which owns items and rates) so content can
 * grow without the tuning constants moving around underneath it.
 * ------------------------------------------------------------------ */

/* ---------------- hostiles ---------------- */

/* Hostiles are drawn from the same roster you summon from: a Bone Picker
   fights the way your Bone Picker does. Chapter bosses are the four
   ASCENDANTs, so you meet a champion before you can ever pull one. */

const TEAM_SIZE = 4;

/** Weight used to split a node's power budget across its line. */
const ARCHETYPE_WEIGHT = { common: 1, rare: 1.35, epic: 1.8, legendary: 2.6 };

/**
 * Scale an archetype to a target power score. Solved rather than guessed:
 * the power formula is linear in HP/ATK/DEF, so the multiplier follows
 * directly.
 */
function scaleToPower(hero, targetPower, opts) {
  const o = opts || {};
  const base = heroBaseStats(hero);
  const fixed = base.spd * 6 + base.crate * 320 + base.cdmg * 160;
  const linear = base.hp * 0.09 + base.atk * 1.7 + base.def * 1.1;
  const k = Math.max(0.15, (targetPower - fixed) / linear);

  const stats = {
    hp: Math.round(base.hp * k * (o.hpScale || 1)),
    atk: Math.round(base.atk * k),
    def: Math.round(base.def * k),
    spd: base.spd + (o.spdBonus || 0),
    crate: base.crate + (o.boss ? 0.08 : 0),
    cdmg: base.cdmg + (o.boss ? 0.15 : 0),
    acc: base.acc + Math.round(targetPower / 60),
    res: base.res + Math.round(targetPower / 80),
    lifesteal: 0
  };
  stats.power = Math.round(
    stats.hp * 0.09 + stats.atk * 1.7 + stats.def * 1.1 + stats.spd * 6
    + stats.crate * 320 + stats.cdmg * 160
  );
  return stats;
}

/** Build the hostile line for a node, ready to hand to Combat.resolve. */
function buildFoes(node) {
  const budget = nodeBudget(node);
  const weights = node.comp.map(id => ARCHETYPE_WEIGHT[getHero(id).rarity] || 1);
  const total = weights.reduce((a, b) => a + b, 0);

  return node.comp.map((heroId, i) => {
    const hero = getHero(heroId);
    const isBoss = !!node.boss && i === 0;
    const share = budget * (weights[i] / total) * (isBoss ? 1.15 : 1);
    const stats = scaleToPower(hero, share, {
      boss: isBoss,
      hpScale: isBoss ? 2.1 : 1,
      spdBonus: isBoss ? 6 : 0
    });
    return { hero, stats, boss: isBoss };
  });
}

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
  11000, 12600, 14500, 16600, 19000,        // chapter 1
  21800, 25000, 28700, 33000, 37800,        // chapter 2
  43400, 48000, 53000, 58000, 64000,        // chapter 3
  70000, 77000, 84000, 92000, 100000        // chapter 4
];

/* The tail is bounded by what a player actually reaches, which is not the
   same as the theoretical maximum. A perfectly geared team of four maxed
   ASCENDANTs would be around 190,000, but tools/economy.js shows a
   well-played free account plateauing near 95,000-120,000: real gear is a
   mix of whatever dropped, not six ideal pieces. An earlier tail of
   149,000 left the last two nodes unwinnable for a maxed account with a
   million scrap it had nothing to spend on. */
const MAX_REACHABLE_POWER = 120000;

/* Share of the player's own power a node may field, per chapter and per
   position in it. Solved by tools/calibrate.js for ~85% win on curve
   (~60% on bosses) — later chapters need more pressure because the
   squads there have far better abilities, not just bigger numbers. */
const NODE_PRESSURE = {
  ch1: [0.72, 0.80, 0.80, 0.87, 0.65],
  ch2: [0.90, 0.96, 0.76, 0.71, 0.46],
  ch3: [0.92, 0.91, 0.91, 0.97, 0.67],
  ch4: [0.80, 0.92, 0.76, 0.88, 0.74]
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
      { id: 'c1n1', name: 'Drift Approach',   tier: 1,  fuel: 6,  comp: ['swarm', 'picker', 'picker'] },
      { id: 'c1n2', name: 'Rib Corridor',     tier: 2,  fuel: 6,  comp: ['picker', 'cutter', 'swarm', 'swarm'] },
      { id: 'c1n3', name: 'The Spine',        tier: 3,  fuel: 8,  comp: ['cutter', 'cutter', 'plating'] },
      { id: 'c1n4', name: 'Marrow Hold',      tier: 4,  fuel: 8,  comp: ['plating', 'cutter', 'picker', 'hauler'] },
      { id: 'c1n5', name: 'Carrion Throne',   tier: 5,  fuel: 10, comp: ['kestrel', 'cutter', 'hauler', 'plating'], boss: true }
    ]
  },
  {
    id: 'ch2', name: 'HELIX DRYDOCK', faction: 'helix',
    blurb: 'Someone is still building warships here, and they are not hiring.',
    nodes: [
      { id: 'c2n1', name: 'Outer Gantry',     tier: 6,  fuel: 10, comp: ['sentry', 'sentry', 'warden'] },
      { id: 'c2n2', name: 'Coolant Deck',     tier: 7,  fuel: 10, comp: ['warden', 'lance', 'sentry', 'medtech'] },
      { id: 'c2n3', name: 'Slipway Four',     tier: 8,  fuel: 12, comp: ['bastion', 'lance', 'warden'] },
      { id: 'c2n4', name: 'Contract Floor',   tier: 9,  fuel: 12, comp: ['bastion', 'bastion', 'lance', 'medtech'] },
      { id: 'c2n5', name: "Foreman's Yard",   tier: 10, fuel: 14, comp: ['atlas', 'bastion', 'lance', 'warden'], boss: true }
    ]
  },
  {
    id: 'ch3', name: 'CINDER REACH', faction: 'solaris',
    blurb: 'They set their own sky on fire to keep the Fold out. It did not work.',
    nodes: [
      { id: 'c3n1', name: 'Ashfall Landing',  tier: 11, fuel: 14, comp: ['pilgrim', 'pilgrim', 'censor'] },
      { id: 'c3n2', name: 'The Long Vigil',   tier: 12, fuel: 14, comp: ['pilgrim', 'censor', 'deacon', 'rook'] },
      { id: 'c3n3', name: 'Reliquary Span',   tier: 13, fuel: 16, comp: ['deacon', 'censor', 'censor'] },
      { id: 'c3n4', name: 'Furnace Nave',     tier: 14, fuel: 16, comp: ['deacon', 'dax', 'pilgrim', 'censor'] },
      { id: 'c3n5', name: 'The Last Sermon',  tier: 15, fuel: 18, comp: ['pyre', 'deacon', 'censor', 'dax'], boss: true }
    ]
  },
  {
    id: 'ch4', name: 'THE BLACK FOLD', faction: 'voidk',
    blurb: 'Space here remembers being something else. It would like to be that again.',
    nodes: [
      { id: 'c4n1', name: 'Threshold',        tier: 16, fuel: 18, comp: ['husk', 'husk', 'echo'] },
      { id: 'c4n2', name: 'Recursion',        tier: 17, fuel: 18, comp: ['echo', 'wraith', 'husk', 'husk'] },
      { id: 'c4n3', name: 'The Quiet Choir',  tier: 18, fuel: 20, comp: ['wraith', 'edge', 'echo'] },
      { id: 'c4n4', name: 'Unwritten Deck',   tier: 19, fuel: 20, comp: ['edge', 'echo', 'wraith', 'husk'] },
      { id: 'c4n5', name: 'The Fold Itself',  tier: 20, fuel: 22, comp: ['nyx', 'edge', 'wraith', 'echo'], boss: true }
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
  { id: 'q_deploy',  text: 'Clear 3 sectors',            goal: 3, reward: { chronite: 220 } },
  { id: 'q_summon',  text: 'Summon once',                goal: 1, reward: { chronite: 150 } },
  { id: 'q_flawless', text: 'Win without losing a champion', goal: 1, reward: { shards: 14 } },
  { id: 'q_upgrade', text: 'Upgrade a champion or a piece of gear', goal: 1, reward: { scrap: 2400 } }
];

const DAILY_LOGIN = { chronite: 250, fuel: 20 };
