/* ------------------------------------------------------------------
 * gear.js — equipment, and how a hero's numbers are actually built.
 *
 * Six slots per hero. Every piece carries one main stat decided by its
 * slot, plus up to four substats decided by its rarity. Wearing two or
 * four pieces of a set adds its bonus on top. Hero base stats alone are
 * a fraction of a built hero's power — the gear is the build.
 * ------------------------------------------------------------------ */

const SLOTS = {
  weapon:    { name: 'WEAPON',    icon: 'ic-rifle',   main: 'atk_flat' },
  helmet:    { name: 'HELMET',    icon: 'ic-helm',    main: 'hp_flat' },
  shield:    { name: 'SHIELD',    icon: 'ic-shield',  main: 'def_flat' },
  gauntlets: { name: 'GAUNTLETS', icon: 'ic-core',    main: null },
  chest:     { name: 'CHESTPLATE',icon: 'ic-visor',   main: null },
  boots:     { name: 'BOOTS',     icon: 'ic-drone',   main: null }
};

const SLOT_ORDER = ['weapon', 'helmet', 'shield', 'gauntlets', 'chest', 'boots'];

/* Which main stats a free-main-stat slot can roll. Boots are the only
   source of flat speed, which is what makes a speed roll worth chasing. */
const SLOT_MAINS = {
  gauntlets: ['atk_pct', 'def_pct', 'hp_pct', 'crate', 'cdmg'],
  chest:     ['atk_pct', 'def_pct', 'hp_pct', 'acc', 'res'],
  boots:     ['atk_pct', 'def_pct', 'hp_pct', 'spd']
};

const STATS = {
  hp_flat:  { name: 'HP',        pct: false, main: 1400, sub: [180, 420] },
  hp_pct:   { name: 'HP%',       pct: true,  main: 0.14, sub: [0.02, 0.05] },
  atk_flat: { name: 'ATK',       pct: false, main: 95,   sub: [14, 32] },
  atk_pct:  { name: 'ATK%',      pct: true,  main: 0.14, sub: [0.02, 0.05] },
  def_flat: { name: 'DEF',       pct: false, main: 90,   sub: [12, 28] },
  def_pct:  { name: 'DEF%',      pct: true,  main: 0.15, sub: [0.02, 0.05] },
  spd:      { name: 'SPD',       pct: false, main: 10,   sub: [2, 5] },
  crate:    { name: 'C.RATE',    pct: true,  main: 0.11, sub: [0.02, 0.04] },
  cdmg:     { name: 'C.DMG',     pct: true,  main: 0.16, sub: [0.03, 0.06] },
  acc:      { name: 'ACC',       pct: false, main: 30,   sub: [4, 9] },
  res:      { name: 'RES',       pct: false, main: 30,   sub: [4, 9] }
};

/* Sets. `pieces` is how many you must wear for the bonus to count. */
const GEAR_SETS = {
  life:      { name: 'LIFE',      pieces: 2, bonus: { hp_pct: 0.15 },  color: '#49e08a' },
  offense:   { name: 'OFFENSE',   pieces: 2, bonus: { atk_pct: 0.15 }, color: '#ff5f6d' },
  defiant:   { name: 'DEFIANT',   pieces: 2, bonus: { def_pct: 0.18 }, color: '#5be9ff' },
  keen:      { name: 'KEEN',      pieces: 2, bonus: { crate: 0.12 },   color: '#ffc247' },
  swift:     { name: 'SWIFT',     pieces: 4, bonus: { spd_pct: 0.12 }, color: '#2af5ff' },
  savage:    { name: 'SAVAGE',    pieces: 4, bonus: { cdmg: 0.28 },    color: '#ff4fd1' },
  leech:     { name: 'LEECH',     pieces: 4, bonus: { lifesteal: 0.2 },color: '#b46bff',
               note: 'Heals for 20% of damage dealt' },
  bulwark:   { name: 'BULWARK',   pieces: 4, bonus: { hp_pct: 0.1, def_pct: 0.12 }, color: '#9fb4cc' }
};

const SET_IDS = Object.keys(GEAR_SETS);

/* Gear rarity decides substat count and how good the main stat is. */
const GEAR_RARITY = {
  common:    { subs: 1, mainScale: 0.70, color: '#8294ab', label: 'SALVAGED' },
  rare:      { subs: 2, mainScale: 0.85, color: '#2af5ff', label: 'REFINED' },
  epic:      { subs: 3, mainScale: 1.00, color: '#b46bff', label: 'MILSPEC' },
  legendary: { subs: 4, mainScale: 1.18, color: '#ffc247', label: 'RELIC' }
};

const GEAR_MAX_LEVEL = 16;

const Gear = (() => {
  const pick = list => list[Math.floor(Math.random() * list.length)];
  const between = (a, b) => a + Math.random() * (b - a);

  let nextId = 1;

  /** Ensures generated ids never collide with a loaded save. */
  function seedIds(existing) {
    existing.forEach(g => {
      const n = parseInt(String(g.id).replace(/\D/g, ''), 10);
      if (n >= nextId) nextId = n + 1;
    });
  }

  function rollSubstat(exclude) {
    const options = Object.keys(STATS).filter(s => exclude.indexOf(s) === -1);
    const stat = pick(options);
    const range = STATS[stat].sub;
    return { stat, value: roundStat(stat, between(range[0], range[1])) };
  }

  function roundStat(stat, value) {
    return STATS[stat].pct ? Math.round(value * 1000) / 1000 : Math.round(value);
  }

  /**
   * Make a piece of gear. `tier` scales flat values with campaign depth,
   * so chapter four drops are meaningfully better than chapter one.
   */
  function create(opts) {
    const o = opts || {};
    const slot = o.slot || pick(SLOT_ORDER);
    const rarity = o.rarity || 'common';
    const tier = o.tier || 1;
    const set = o.set || pick(SET_IDS);

    const mainStat = SLOTS[slot].main || pick(SLOT_MAINS[slot]);
    const tierScale = 1 + (tier - 1) * 0.09;
    const mainValue = roundStat(mainStat,
      STATS[mainStat].main * GEAR_RARITY[rarity].mainScale
      * (STATS[mainStat].pct ? 1 : tierScale));

    const used = [mainStat];
    const subs = [];
    for (let i = 0; i < GEAR_RARITY[rarity].subs; i++) {
      const sub = rollSubstat(used);
      used.push(sub.stat);
      if (!STATS[sub.stat].pct) sub.value = Math.round(sub.value * tierScale);
      subs.push(sub);
    }

    return {
      id: 'g' + (nextId++),
      slot, set, rarity, tier, level: 0,
      main: { stat: mainStat, value: mainValue },
      subs,
      equipped: null          // hero id, when worn
    };
  }

  /** Main stat grows 9% of its base per level; +16 is roughly 2.4x. */
  function mainValue(item) {
    const base = item.main.value;
    return roundStat(item.main.stat, base * (1 + item.level * 0.09));
  }

  function upgradeCost(item) {
    return {
      scrap: Math.round(120 * Math.pow(1.28, item.level) * (1 + item.tier * 0.08)),
      shards: item.level >= 12 ? 4 : item.level >= 8 ? 2 : 0
    };
  }

  /** Every fourth level also rolls one substat higher. */
  function upgrade(item) {
    if (item.level >= GEAR_MAX_LEVEL) return null;
    item.level += 1;
    let improved = null;
    if (item.level % 4 === 0 && item.subs.length) {
      const sub = pick(item.subs);
      const range = STATS[sub.stat].sub;
      const gain = roundStat(sub.stat, between(range[0], range[1]) * 0.55);
      sub.value = roundStat(sub.stat, sub.value + gain);
      improved = { stat: sub.stat, gain };
    }
    return { level: item.level, improved };
  }

  /** Power score, only used for sorting and for "is this an upgrade?" */
  function score(item) {
    const weight = { hp_flat: 0.05, atk_flat: 1, def_flat: 0.9, spd: 12, hp_pct: 180,
                     atk_pct: 200, def_pct: 180, crate: 200, cdmg: 140, acc: 4, res: 4 };
    let total = mainValue(item) * (weight[item.main.stat] || 1);
    item.subs.forEach(s => { total += s.value * (weight[s.stat] || 1); });
    return Math.round(total);
  }

  function label(stat, value) {
    const def = STATS[stat];
    if (!def) return '';
    return def.pct ? def.name + ' +' + Math.round(value * 1000) / 10 + '%'
                   : def.name + ' +' + Math.round(value);
  }

  return {
    create, mainValue, upgrade, upgradeCost, score, label, seedIds,
    rollSubstat
  };
})();

/* ------------------------------------------------------------------
 * Stat assembly — base, level, ascension, gear, set bonuses.
 * ------------------------------------------------------------------ */

const HERO_MAX_LEVEL = 40;
const HERO_MAX_STARS = 5;

/** Level multiplier applied to a hero's base HP / ATK / DEF. */
function levelScale(level) { return 1 + (level - 1) * 0.085; }

/** Each ascension star is a flat uplift on top of levelling. */
function starScale(stars) { return 1 + (stars - 1) * 0.14; }

/**
 * Final stats for an owned hero.
 * @param hero    roster entry
 * @param owned   { level, stars, equipped: {slot: gearId} }
 * @param gearOf  function(gearId) -> gear item
 */
function heroStats(hero, owned, gearOf) {
  const base = heroBaseStats(hero);
  const scale = levelScale(owned.level || 1) * starScale(owned.stars || 1);

  const stats = {
    hp: base.hp * scale,
    atk: base.atk * scale,
    def: base.def * scale,
    spd: base.spd,
    crate: base.crate,
    cdmg: base.cdmg,
    acc: base.acc,
    res: base.res,
    lifesteal: 0
  };

  const flat = { hp: 0, atk: 0, def: 0, spd: 0, acc: 0, res: 0 };
  const pct = { hp: 0, atk: 0, def: 0, spd: 0 };
  const setCount = {};

  SLOT_ORDER.forEach(slot => {
    const item = gearOf((owned.equipped || {})[slot]);
    if (!item) return;
    setCount[item.set] = (setCount[item.set] || 0) + 1;

    const apply = (stat, value) => {
      switch (stat) {
        case 'hp_flat': flat.hp += value; break;
        case 'atk_flat': flat.atk += value; break;
        case 'def_flat': flat.def += value; break;
        case 'spd': flat.spd += value; break;
        case 'acc': flat.acc += value; break;
        case 'res': flat.res += value; break;
        case 'hp_pct': pct.hp += value; break;
        case 'atk_pct': pct.atk += value; break;
        case 'def_pct': pct.def += value; break;
        case 'crate': stats.crate += value; break;
        case 'cdmg': stats.cdmg += value; break;
      }
    };

    apply(item.main.stat, Gear.mainValue(item));
    item.subs.forEach(s => apply(s.stat, s.value));
  });

  // Set bonuses stack per completed set (four pieces of a 2-set = twice).
  Object.keys(setCount).forEach(setId => {
    const set = GEAR_SETS[setId];
    if (!set) return;
    const completions = Math.floor(setCount[setId] / set.pieces);
    for (let i = 0; i < completions; i++) {
      Object.keys(set.bonus).forEach(key => {
        const value = set.bonus[key];
        if (key === 'hp_pct') pct.hp += value;
        else if (key === 'atk_pct') pct.atk += value;
        else if (key === 'def_pct') pct.def += value;
        else if (key === 'spd_pct') pct.spd += value;
        else if (key === 'crate') stats.crate += value;
        else if (key === 'cdmg') stats.cdmg += value;
        else if (key === 'lifesteal') stats.lifesteal += value;
      });
    }
  });

  stats.hp = Math.round(stats.hp * (1 + pct.hp) + flat.hp);
  stats.atk = Math.round(stats.atk * (1 + pct.atk) + flat.atk);
  stats.def = Math.round(stats.def * (1 + pct.def) + flat.def);
  stats.spd = Math.round(stats.spd * (1 + pct.spd) + flat.spd);
  stats.acc = Math.round(stats.acc + flat.acc);
  stats.res = Math.round(stats.res + flat.res);
  stats.crate = Math.min(1, stats.crate);

  // One number for sorting rosters and gating campaign nodes.
  stats.power = Math.round(
    stats.hp * 0.09 + stats.atk * 1.7 + stats.def * 1.1 + stats.spd * 6
    + stats.crate * 320 + stats.cdmg * 160
  );

  return stats;
}

/** Which set bonuses are actually active, for the hero sheet. */
function activeSets(owned, gearOf) {
  const count = {};
  SLOT_ORDER.forEach(slot => {
    const item = gearOf((owned.equipped || {})[slot]);
    if (item) count[item.set] = (count[item.set] || 0) + 1;
  });
  return Object.keys(count)
    .filter(id => GEAR_SETS[id] && count[id] >= GEAR_SETS[id].pieces)
    .map(id => ({ id, set: GEAR_SETS[id], stacks: Math.floor(count[id] / GEAR_SETS[id].pieces) }));
}
