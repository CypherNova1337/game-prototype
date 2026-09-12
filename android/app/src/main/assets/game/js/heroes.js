/* ------------------------------------------------------------------
 * heroes.js — the champions you collect, and what they can do.
 *
 * Heroes are the summonable units. Gear (gear.js) is equipped onto
 * them; nothing else fights. Every hero has three skills: A1 has no
 * cooldown, A2 and A3 do.
 * ------------------------------------------------------------------ */

/* Affinity triangle: magic beats spirit beats force beats magic.
   Void is neutral in both directions — never weak, never strong. */
const AFFINITY = {
  magic:  { name: 'MAGIC',  color: '#4aa3ff', beats: 'spirit' },
  spirit: { name: 'SPIRIT', color: '#49e08a', beats: 'force'  },
  force:  { name: 'FORCE',  color: '#ff5f6d', beats: 'magic'  },
  void:   { name: 'VOID',   color: '#b46bff', beats: null     }
};

const ROLE = {
  attack:  { name: 'ATTACK',  hp: 0.85, atk: 1.20, def: 0.85 },
  defense: { name: 'DEFENSE', hp: 1.05, atk: 0.82, def: 1.30 },
  support: { name: 'SUPPORT', hp: 1.00, atk: 0.85, def: 1.05 },
  vitality:{ name: 'VITALITY',hp: 1.30, atk: 0.88, def: 0.95 }
};

/* Base stats before role shaping, by rarity. Levelling scales these. */
const RARITY_BASE = {
  common:    { hp: 7200,  atk: 480,  def: 480  },
  rare:      { hp: 9600,  atk: 640,  def: 620  },
  epic:      { hp: 12600, atk: 830,  def: 790  },
  legendary: { hp: 15600, atk: 1030, def: 960  }
};

/* Every effect a skill can apply. Keeping the list short keeps the
   combat log readable, which matters more than breadth here. */
const STATUS = {
  atk_up:    { name: 'ATK UP',    kind: 'buff',   stat: 'atk', mod: 0.35 },
  def_up:    { name: 'DEF UP',    kind: 'buff',   stat: 'def', mod: 0.40 },
  spd_up:    { name: 'SPD UP',    kind: 'buff',   stat: 'spd', mod: 0.25 },
  crit_up:   { name: 'CRIT UP',   kind: 'buff',   stat: 'crate', mod: 0.25, flat: true },
  shield:    { name: 'SHIELD',    kind: 'buff' },
  regen:     { name: 'REGEN',     kind: 'buff' },
  atk_down:  { name: 'ATK DOWN',  kind: 'debuff', stat: 'atk', mod: -0.30 },
  def_down:  { name: 'DEF DOWN',  kind: 'debuff', stat: 'def', mod: -0.35 },
  spd_down:  { name: 'SPD DOWN',  kind: 'debuff', stat: 'spd', mod: -0.20 },
  poison:    { name: 'POISON',    kind: 'debuff' },
  stun:      { name: 'STUN',      kind: 'debuff' },
  heal_block:{ name: 'HEAL BLOCK',kind: 'debuff' }
};

/* Shorthand builders so the roster below stays readable. */
const dmg = (name, mult, cd, opts) =>
  Object.assign({ name, type: 'damage', mult, cd: cd || 0, target: 'enemy' }, opts || {});
const aoe = (name, mult, cd, opts) =>
  Object.assign({ name, type: 'damage', mult, cd, target: 'all_enemies' }, opts || {});
const support = (name, cd, opts) =>
  Object.assign({ name, type: 'support', mult: 0, cd, target: 'all_allies' }, opts || {});

const HEROES = [
  /* ---------------- ASCENDANT ---------------- */
  {
    id: 'nyx', name: 'NYX-07', title: 'Ghostline', rarity: 'legendary',
    faction: 'voidk', affinity: 'void', role: 'attack',
    spd: 112, crate: 0.20, cdmg: 0.75, acc: 40, res: 30,
    art: { frame: 'visor', build: 'lean', weapon: 'blade', accent: '#b46bff' },
    lore: 'Walked out of the Fold three years after the Fold ate her ship.',
    skills: [
      dmg('Severance', 3.4),
      dmg('Phase Cut', 4.6, 3, { hits: 2, applies: [{ id: 'def_down', chance: 0.75, turns: 2 }] }),
      dmg('Unwrite', 7.2, 5, { ignoreDef: 0.5, note: 'Ignores half of the target defence' })
    ]
  },
  {
    id: 'vex', name: 'MARSHAL VEX', title: 'Corona', rarity: 'legendary',
    faction: 'solaris', affinity: 'force', role: 'support',
    spd: 104, crate: 0.15, cdmg: 0.60, acc: 60, res: 40,
    art: { frame: 'crown', build: 'tall', weapon: 'staff', accent: '#ffc247' },
    lore: 'Held the Cinder line for nine days with two hundred conscripts.',
    skills: [
      dmg('Command Shot', 3.1),
      support('Corona Call', 4, { applies: [{ id: 'atk_up', chance: 1, turns: 2 }, { id: 'crit_up', chance: 1, turns: 2 }] }),
      support('Hold The Line', 5, { heal: 0.25, applies: [{ id: 'def_up', chance: 1, turns: 2 }] })
    ]
  },
  {
    id: 'atlas', name: 'FOREMAN ATLAS', title: 'The Drydock', rarity: 'legendary',
    faction: 'helix', affinity: 'magic', role: 'defense',
    spd: 96, crate: 0.12, cdmg: 0.55, acc: 50, res: 60,
    art: { frame: 'helm', build: 'heavy', weapon: 'cannon', accent: '#2af5ff' },
    lore: 'Built warships for forty years. Wears one now.',
    skills: [
      dmg('Rivet Gun', 2.9, 0, { scaleDef: true }),
      aoe('Lockdown', 3.0, 4, { applies: [{ id: 'stun', chance: 0.5, turns: 1 }] }),
      support('Bulwark Protocol', 5, { shield: 0.35, applies: [{ id: 'def_up', chance: 1, turns: 3 }] })
    ]
  },
  {
    id: 'pyre', name: 'PYRE SAINT', title: 'Immolation', rarity: 'legendary',
    faction: 'solaris', affinity: 'spirit', role: 'attack',
    spd: 108, crate: 0.18, cdmg: 0.70, acc: 55, res: 35,
    art: { frame: 'mask', build: 'tall', weapon: 'staff', accent: '#ff8a3d' },
    lore: 'Set the sky on fire to keep something worse out of it.',
    skills: [
      dmg('Ember Lash', 3.3),
      aoe('Ashfall', 3.6, 3, { applies: [{ id: 'poison', chance: 0.7, turns: 2 }] }),
      aoe('Immolation', 5.4, 5, { applies: [{ id: 'heal_block', chance: 0.8, turns: 2 }] })
    ]
  },

  /* ---------------- PROTOTYPE ---------------- */
  {
    id: 'kestrel', name: 'KESTREL', title: 'Talon Drop', rarity: 'epic',
    faction: 'raven', affinity: 'force', role: 'attack',
    spd: 115, crate: 0.20, cdmg: 0.65, acc: 45, res: 25,
    art: { frame: 'visor', build: 'lean', weapon: 'claws', accent: '#ff4fd1' },
    lore: 'Drops from orbit for fun. Bills for it afterwards.',
    skills: [
      dmg('Talon Strike', 3.2),
      dmg('Dive', 4.4, 3, { hits: 3 }),
      dmg('Killing Blow', 5.8, 4, { executeUnder: 0.35, note: 'Hits far harder below 35% health' })
    ]
  },
  {
    id: 'marrow', name: 'DR. MARROW', title: 'Field Surgery', rarity: 'epic',
    faction: 'helix', affinity: 'magic', role: 'support',
    spd: 106, crate: 0.10, cdmg: 0.50, acc: 65, res: 45,
    art: { frame: 'mask', build: 'lean', weapon: 'none', accent: '#5be9ff' },
    lore: 'Has never lost a patient he was paid enough to keep.',
    skills: [
      dmg('Scalpel', 2.7),
      support('Triage', 3, { heal: 0.22, target: 'lowest_ally' }),
      support('Vital Surge', 4, { heal: 0.15, applies: [{ id: 'regen', chance: 1, turns: 3 }] })
    ]
  },
  {
    id: 'edge', name: 'VOIDEDGE', title: 'Sever', rarity: 'epic',
    faction: 'voidk', affinity: 'void', role: 'attack',
    spd: 110, crate: 0.22, cdmg: 0.70, acc: 40, res: 30,
    art: { frame: 'hood', build: 'lean', weapon: 'blade', accent: '#9d7bff' },
    lore: 'Cuts shields first. Nobody has asked how.',
    skills: [
      dmg('Rend', 3.3),
      dmg('Shieldbreak', 4.2, 3, { breakShield: true }),
      dmg('Nightfall', 5.5, 4, { lifesteal: 0.3 })
    ]
  },
  {
    id: 'aegis', name: 'AEGIS', title: 'Bulwark', rarity: 'epic',
    faction: 'solaris', affinity: 'spirit', role: 'defense',
    spd: 92, crate: 0.10, cdmg: 0.50, acc: 50, res: 55,
    art: { frame: 'helm', build: 'heavy', weapon: 'none', accent: '#ffc247' },
    lore: 'A wall that files paperwork.',
    skills: [
      dmg('Shield Bash', 2.6, 0, { scaleDef: true, applies: [{ id: 'spd_down', chance: 0.5, turns: 2 }] }),
      support('Aegis Field', 4, { shield: 0.28 }),
      support('Immovable', 5, { applies: [{ id: 'def_up', chance: 1, turns: 3 }, { id: 'atk_up', chance: 1, turns: 2 }] })
    ]
  },
  {
    id: 'wraith', name: 'WRAITH', title: 'Cloakwork', rarity: 'epic',
    faction: 'voidk', affinity: 'magic', role: 'support',
    spd: 113, crate: 0.15, cdmg: 0.60, acc: 60, res: 40,
    art: { frame: 'hood', build: 'tall', weapon: 'staff', accent: '#b46bff' },
    lore: 'Was never on the manifest. Was always on the ship.',
    skills: [
      dmg('Static Lash', 2.9),
      support('Veil', 3, { applies: [{ id: 'spd_up', chance: 1, turns: 2 }] }),
      aoe('Hex Field', 3.2, 4, { applies: [{ id: 'atk_down', chance: 0.75, turns: 2 }, { id: 'spd_down', chance: 0.6, turns: 2 }] })
    ]
  },
  {
    id: 'bastion', name: 'BASTION', title: 'Frame', rarity: 'epic',
    faction: 'helix', affinity: 'force', role: 'vitality',
    spd: 88, crate: 0.08, cdmg: 0.50, acc: 45, res: 50,
    art: { frame: 'core', build: 'heavy', weapon: 'cannon', accent: '#2af5ff' },
    lore: 'Nine tonnes of contract security, painted corporate white.',
    skills: [
      dmg('Crush', 2.8, 0, { scaleHp: true }),
      aoe('Suppression', 2.9, 3, { applies: [{ id: 'atk_down', chance: 0.7, turns: 2 }] }),
      support('Fortify', 4, { heal: 0.18, shield: 0.2 })
    ]
  },
  {
    id: 'deacon', name: 'CINDER DEACON', title: 'Last Rites', rarity: 'epic',
    faction: 'solaris', affinity: 'force', role: 'support',
    spd: 101, crate: 0.12, cdmg: 0.55, acc: 70, res: 35,
    art: { frame: 'crown', build: 'tall', weapon: 'staff', accent: '#ff8a3d' },
    lore: 'Reads the rites over the sector before burning it.',
    skills: [
      dmg('Censer', 2.8),
      aoe('Last Rites', 3.1, 3, { applies: [{ id: 'heal_block', chance: 0.7, turns: 2 }] }),
      support('Benediction', 4, { heal: 0.2, cleanse: true })
    ]
  },
  {
    id: 'echo', name: 'ECHO', title: 'Recursion', rarity: 'epic',
    faction: 'voidk', affinity: 'spirit', role: 'attack',
    spd: 118, crate: 0.18, cdmg: 0.68, acc: 50, res: 30,
    art: { frame: 'visor', build: 'lean', weapon: 'blade', accent: '#9d7bff' },
    lore: 'Something that learned a person and kept the shape.',
    skills: [
      dmg('Mirror Cut', 3.1),
      dmg('Recur', 4.0, 3, { hits: 2, extraTurn: 0.3 }),
      aoe('Unmaking', 4.6, 4, { applies: [{ id: 'def_down', chance: 0.7, turns: 2 }] })
    ]
  },

  /* ---------------- ENHANCED ---------------- */
  {
    id: 'dax', name: 'SGT. DAX', title: 'Hold Fast', rarity: 'rare',
    faction: 'solaris', affinity: 'force', role: 'defense',
    spd: 94, crate: 0.10, cdmg: 0.50, acc: 45, res: 45,
    art: { frame: 'helm', build: 'heavy', weapon: 'rifle', accent: '#ffc247' },
    lore: 'Twenty years in, still first through the door.',
    skills: [
      dmg('Service Rifle', 2.8),
      support('Dig In', 3, { applies: [{ id: 'def_up', chance: 1, turns: 2 }] }),
      dmg('Breach', 3.8, 4, { applies: [{ id: 'stun', chance: 0.4, turns: 1 }] })
    ]
  },
  {
    id: 'wisp', name: 'WISP', title: 'Quiet Work', rarity: 'rare',
    faction: 'raven', affinity: 'magic', role: 'attack',
    spd: 116, crate: 0.18, cdmg: 0.62, acc: 40, res: 25,
    art: { frame: 'hood', build: 'lean', weapon: 'blade', accent: '#ff4fd1' },
    lore: 'Paid in salvage rights and silence.',
    skills: [
      dmg('Shiv', 3.0),
      dmg('Backstab', 4.2, 3, { executeUnder: 0.4 }),
      dmg('Vanish', 3.4, 4, { applies: [{ id: 'spd_up', chance: 1, turns: 2 }], self: true })
    ]
  },
  {
    id: 'warden', name: 'CONTRACT WARDEN', title: 'Clause Nine', rarity: 'rare',
    faction: 'helix', affinity: 'magic', role: 'attack',
    spd: 105, crate: 0.15, cdmg: 0.58, acc: 55, res: 30,
    art: { frame: 'visor', build: 'tall', weapon: 'rifle', accent: '#2af5ff' },
    lore: 'Enforces terms nobody read.',
    skills: [
      dmg('Writ', 3.0),
      dmg('Penalty Clause', 4.0, 3, { applies: [{ id: 'atk_down', chance: 0.7, turns: 2 }] }),
      aoe('Foreclosure', 3.4, 4)
    ]
  },
  {
    id: 'hauler', name: 'SCRAP HAULER', title: 'Deadweight', rarity: 'rare',
    faction: 'raven', affinity: 'spirit', role: 'vitality',
    spd: 86, crate: 0.08, cdmg: 0.50, acc: 40, res: 45,
    art: { frame: 'core', build: 'heavy', weapon: 'none', accent: '#ff4fd1' },
    lore: 'Carries more than should be structurally possible.',
    skills: [
      dmg('Slam', 2.6, 0, { scaleHp: true }),
      support('Brace', 3, { shield: 0.22 }),
      dmg('Deadweight', 3.6, 4, { scaleHp: true, applies: [{ id: 'spd_down', chance: 0.6, turns: 2 }] })
    ]
  },
  {
    id: 'censor', name: 'FLAME CENSOR', title: 'Purifier', rarity: 'rare',
    faction: 'solaris', affinity: 'spirit', role: 'attack',
    spd: 100, crate: 0.15, cdmg: 0.60, acc: 50, res: 30,
    art: { frame: 'mask', build: 'tall', weapon: 'cannon', accent: '#ff8a3d' },
    lore: 'Burns the record along with the room.',
    skills: [
      dmg('Flare', 3.0),
      aoe('Cleansing Fire', 3.2, 3, { applies: [{ id: 'poison', chance: 0.6, turns: 2 }] }),
      dmg('Pyre', 4.4, 4)
    ]
  },
  {
    id: 'husk', name: 'DRIFT HUSK', title: 'Leftover', rarity: 'rare',
    faction: 'voidk', affinity: 'void', role: 'vitality',
    spd: 90, crate: 0.10, cdmg: 0.55, acc: 45, res: 50,
    art: { frame: 'core', build: 'tall', weapon: 'claws', accent: '#9d7bff' },
    lore: 'Whatever the Fold finished with.',
    skills: [
      dmg('Grasp', 2.7, 0, { lifesteal: 0.2 }),
      dmg('Drain', 3.6, 3, { lifesteal: 0.4 }),
      support('Regrow', 4, { heal: 0.18, applies: [{ id: 'regen', chance: 1, turns: 2 }] })
    ]
  },
  {
    id: 'sentry', name: 'DRYDOCK SENTRY', title: 'Standing Order', rarity: 'rare',
    faction: 'helix', affinity: 'force', role: 'defense',
    spd: 93, crate: 0.10, cdmg: 0.50, acc: 45, res: 40,
    art: { frame: 'helm', build: 'heavy', weapon: 'rifle', accent: '#5be9ff' },
    lore: 'Has stood in the same corridor for eleven years.',
    skills: [
      dmg('Suppress', 2.7, 0, { scaleDef: true }),
      support('Interlock', 3, { applies: [{ id: 'def_up', chance: 1, turns: 2 }] }),
      dmg('Riot Round', 3.8, 4, { applies: [{ id: 'spd_down', chance: 0.6, turns: 2 }] })
    ]
  },
  {
    id: 'pilgrim', name: 'ASH PILGRIM', title: 'The Long Walk', rarity: 'rare',
    faction: 'solaris', affinity: 'force', role: 'attack',
    spd: 102, crate: 0.14, cdmg: 0.58, acc: 45, res: 35,
    art: { frame: 'hood', build: 'tall', weapon: 'staff', accent: '#ffc247' },
    lore: 'Walked from Cinder Reach to the Belt. On foot.',
    skills: [
      dmg('Pilgrim Staff', 2.9),
      dmg('Faithful Strike', 4.0, 3),
      support('Testament', 4, { heal: 0.14, applies: [{ id: 'atk_up', chance: 1, turns: 2 }] })
    ]
  },
  {
    id: 'cutter', name: 'HULL CUTTER', title: 'Two Torches', rarity: 'rare',
    faction: 'raven', affinity: 'force', role: 'attack',
    spd: 107, crate: 0.16, cdmg: 0.60, acc: 40, res: 25,
    art: { frame: 'mask', build: 'lean', weapon: 'claws', accent: '#ff4fd1' },
    lore: 'Opens ships like tins, with the crew still aboard.',
    skills: [
      dmg('Torch', 3.0),
      dmg('Cut Away', 4.1, 3, { hits: 2 }),
      dmg('Breaching Charge', 4.6, 4, { breakShield: true })
    ]
  },

  /* ---------------- STANDARD ---------------- */
  {
    id: 'rook', name: 'CONSCRIPT ROOK', title: 'Fresh Issue', rarity: 'common',
    faction: 'solaris', affinity: 'force', role: 'attack',
    spd: 98, crate: 0.12, cdmg: 0.50, acc: 35, res: 20,
    art: { frame: 'helm', build: 'lean', weapon: 'rifle', accent: '#9fb4cc' },
    lore: 'Six weeks of training and a very good attitude.',
    skills: [
      dmg('Rifle Shot', 2.8),
      dmg('Suppressing Fire', 3.6, 3, { applies: [{ id: 'atk_down', chance: 0.5, turns: 2 }] }),
      support('Dig In', 4, { applies: [{ id: 'def_up', chance: 1, turns: 2 }] })
    ]
  },
  {
    id: 'picker', name: 'BONE PICKER', title: 'Salvage Rights', rarity: 'common',
    faction: 'raven', affinity: 'spirit', role: 'attack',
    spd: 103, crate: 0.12, cdmg: 0.50, acc: 35, res: 20,
    art: { frame: 'mask', build: 'lean', weapon: 'blade', accent: '#9fb4cc' },
    lore: 'Strips hulls for a living. Not fussy about which.',
    skills: [
      dmg('Pry Bar', 2.8),
      dmg('Scavenge', 3.5, 3, { lifesteal: 0.25 }),
      dmg('Junk Throw', 3.4, 4, { applies: [{ id: 'spd_down', chance: 0.5, turns: 2 }] })
    ]
  },
  {
    id: 'medtech', name: 'FIELD MEDTECH', title: 'Patch Kit', rarity: 'common',
    faction: 'helix', affinity: 'magic', role: 'support',
    spd: 99, crate: 0.08, cdmg: 0.50, acc: 45, res: 30,
    art: { frame: 'visor', build: 'lean', weapon: 'none', accent: '#9fb4cc' },
    lore: 'Third-year student, two years of field experience.',
    skills: [
      dmg('Stim Shot', 2.5),
      support('Patch Up', 3, { heal: 0.16, target: 'lowest_ally' }),
      support('Stimulant', 4, { applies: [{ id: 'atk_up', chance: 1, turns: 2 }] })
    ]
  },
  {
    id: 'plating', name: 'SALVAGE FRAME', title: 'Bolted On', rarity: 'common',
    faction: 'raven', affinity: 'force', role: 'defense',
    spd: 84, crate: 0.08, cdmg: 0.50, acc: 35, res: 35,
    art: { frame: 'core', build: 'heavy', weapon: 'none', accent: '#9fb4cc' },
    lore: 'A person somewhere inside all that hull scrap.',
    skills: [
      dmg('Hull Punch', 2.5, 0, { scaleDef: true }),
      support('Plate Up', 3, { shield: 0.18 }),
      dmg('Ram', 3.4, 4, { scaleDef: true })
    ]
  },
  {
    id: 'swarm', name: 'SWARM UNIT', title: 'Cheap And Many', rarity: 'common',
    faction: 'voidk', affinity: 'magic', role: 'attack',
    spd: 109, crate: 0.14, cdmg: 0.52, acc: 35, res: 20,
    art: { frame: 'core', build: 'lean', weapon: 'claws', accent: '#9fb4cc' },
    lore: 'One is a nuisance. They are never one.',
    skills: [
      dmg('Sting', 2.6, 0, { hits: 2 }),
      aoe('Swarm', 2.4, 3),
      dmg('Overrun', 3.6, 4, { hits: 3 })
    ]
  },
  {
    id: 'lance', name: 'LANCE PLATFORM', title: 'Fire Support', rarity: 'common',
    faction: 'helix', affinity: 'void', role: 'attack',
    spd: 89, crate: 0.14, cdmg: 0.58, acc: 40, res: 25,
    art: { frame: 'core', build: 'heavy', weapon: 'cannon', accent: '#9fb4cc' },
    lore: 'A gun that someone remembered to give legs.',
    skills: [
      dmg('Lance Shot', 3.0),
      dmg('Overcharge', 4.2, 4),
      aoe('Barrage', 2.8, 4)
    ]
  }
];

const HERO_BY_ID = HEROES.reduce((map, h) => { map[h.id] = h; return map; }, {});

function getHero(id) { return HERO_BY_ID[id] || null; }
function heroesOfRarity(rarityId) { return HEROES.filter(h => h.rarity === rarityId); }

/** Base stats for a hero at level 1, after role shaping. */
function heroBaseStats(hero) {
  const base = RARITY_BASE[hero.rarity];
  const role = ROLE[hero.role];
  return {
    hp: Math.round(base.hp * role.hp),
    atk: Math.round(base.atk * role.atk),
    def: Math.round(base.def * role.def),
    spd: hero.spd,
    crate: hero.crate,
    cdmg: hero.cdmg,
    acc: hero.acc,
    res: hero.res
  };
}

/** Affinity matchup: 1 strong, -1 weak, 0 neutral. */
function affinityMatch(attacker, defender) {
  if (!attacker || !defender) return 0;
  if (AFFINITY[attacker].beats === defender) return 1;
  if (AFFINITY[defender].beats === attacker) return -1;
  return 0;
}
