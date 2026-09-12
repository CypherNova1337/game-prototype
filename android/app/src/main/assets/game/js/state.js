/* ------------------------------------------------------------------
 * state.js — the player save and every rule that mutates it.
 *
 * Two collections matter: heroes (summoned, levelled, ascended) and
 * gear (dropped, upgraded, equipped onto heroes). Nothing here draws.
 * ------------------------------------------------------------------ */

const State = (() => {
  const COLLECTION = 'player';
  const KEY = 'save';
  const SAVE_VERSION = 2;

  let data = null;
  let saveTimer = null;

  function freshSave() {
    return {
      saveVersion: SAVE_VERSION,
      createdAt: Date.now(),
      wallet: {
        chronite: ECONOMY.startChronite,
        scrap: ECONOMY.startScrap,
        shards: 0
      },
      fuel: { amount: ECONOMY.fuelCap, lastTick: Date.now() },

      // heroId -> { level, stars, copies, equipped: {slot: gearId}, obtainedAt }
      heroes: {},
      // gearId -> gear item
      gear: {},
      team: [null, null, null, null],

      pity: { sinceLegendary: 0, sinceRare: 0 },
      campaign: { stars: {}, lastNode: null },
      pass: { xp: 0, level: 1, claimedFree: [], claimedPremium: [] },
      quests: { day: null, progress: {}, claimed: [] },
      login: { lastDay: null, streak: 0 },

      entitlements: {
        themes: ['drift'], sigils: ['nova'], titles: ['drifter', 'salvager'],
        passPremium: false, supporter: false, supporterLastPaid: null
      },
      cosmetics: { theme: 'drift', sigil: 'nova', title: 'drifter' },
      settings: { sfx: true, music: true, battleSpeed: 1 },

      stats: {
        pulls: 0, legendaries: 0, missionsRun: 0, missionsWon: 0,
        battlesWon: 0, bossesFelled: 0, perfectClears: 0, spent: 0
      },
      log: []
    };
  }

  /**
   * Saves from before the hero rewrite held items, not champions, and
   * there is no honest way to convert one into the other. Currency,
   * campaign progress and purchases carry over; the collection restarts.
   */
  function migrate(save) {
    const base = freshSave();
    if (!save.saveVersion || save.saveVersion < 2) {
      const carried = Object.assign(base, {
        wallet: Object.assign(base.wallet, save.wallet),
        campaign: Object.assign(base.campaign, save.campaign),
        pass: Object.assign(base.pass, save.pass),
        entitlements: Object.assign(base.entitlements, save.entitlements),
        cosmetics: Object.assign(base.cosmetics, save.cosmetics),
        settings: Object.assign(base.settings, save.settings),
        stats: Object.assign(base.stats, save.stats),
        saveVersion: SAVE_VERSION,
        heroes: {}, gear: {}, team: [null, null, null, null]
      });
      carried.log = [{ text: 'Roster rebuilt for the champion system.', tone: 'info', at: Date.now() }];
      return carried;
    }

    const merged = Object.assign(base, save);
    ['wallet', 'fuel', 'pity', 'stats', 'campaign', 'pass', 'quests',
     'login', 'entitlements', 'cosmetics', 'settings'].forEach(key => {
      merged[key] = Object.assign({}, base[key], save[key] || {});
    });
    return merged;
  }

  async function load() {
    const record = await SaveStore.read(COLLECTION, KEY);
    data = record && record.value ? migrate(record.value) : freshSave();
    Gear.seedIds(Object.keys(data.gear).map(id => data.gear[id]));
    tickFuel();
    return data;
  }

  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      SaveStore.write(COLLECTION, KEY, data);
    }, 120);
  }

  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    return SaveStore.write(COLLECTION, KEY, data);
  }

  async function reset() {
    await SaveStore.clearAll();
    data = freshSave();
    await flush();
    return data;
  }

  function get() { return data; }

  /* ---------------- fuel ---------------- */

  function tickFuel() {
    const now = Date.now();
    const fuel = data.fuel;
    if (fuel.amount >= ECONOMY.fuelCap) { fuel.lastTick = now; return; }
    const gained = Math.floor((now - fuel.lastTick) / ECONOMY.fuelRegenMs);
    if (gained > 0) {
      fuel.amount = Math.min(ECONOMY.fuelCap, fuel.amount + gained);
      fuel.lastTick = fuel.amount >= ECONOMY.fuelCap
        ? now : fuel.lastTick + gained * ECONOMY.fuelRegenMs;
      save();
    }
  }

  function msToNextFuel() {
    if (data.fuel.amount >= ECONOMY.fuelCap) return 0;
    return Math.max(0, data.fuel.lastTick + ECONOMY.fuelRegenMs - Date.now());
  }

  /* ---------------- wallet ---------------- */

  const canAfford = (currency, amount) => data.wallet[currency] >= amount;

  function spend(currency, amount) {
    if (!canAfford(currency, amount)) return false;
    data.wallet[currency] -= amount;
    save();
    return true;
  }

  function grant(currency, amount) {
    data.wallet[currency] += amount;
    save();
  }

  /* ---------------- heroes ---------------- */

  /** First copy recruits; every copy after becomes ascension material. */
  function addHero(heroId) {
    const hero = getHero(heroId);
    if (!hero) return null;
    const rarity = RARITY[hero.rarity];
    const existing = data.heroes[heroId];

    if (!existing) {
      data.heroes[heroId] = {
        level: 1, stars: 1, copies: 1, equipped: {}, obtainedAt: Date.now()
      };
      save();
      return { heroId, isNew: true, shards: 0, scrap: 0 };
    }

    existing.copies += 1;
    data.wallet.shards += rarity.shards;
    data.wallet.scrap += rarity.scrap;
    save();
    return { heroId, isNew: false, shards: rarity.shards, scrap: rarity.scrap };
  }

  const ownsHero = heroId => !!data.heroes[heroId];
  const heroEntry = heroId => data.heroes[heroId] || null;
  const gearOf = gearId => (gearId && data.gear[gearId]) || null;

  /** Assembled stats for an owned hero, gear and sets included. */
  function statsFor(heroId) {
    const hero = getHero(heroId);
    const owned = data.heroes[heroId];
    if (!hero || !owned) return null;
    return heroStats(hero, owned, gearOf);
  }

  function heroPower(heroId) {
    const stats = statsFor(heroId);
    return stats ? stats.power : 0;
  }

  /** Roster order: rarity first, then what is actually strongest. */
  function roster() {
    return Object.keys(data.heroes).sort((a, b) => {
      const ra = RARITY_ORDER.indexOf(getHero(a).rarity);
      const rb = RARITY_ORDER.indexOf(getHero(b).rarity);
      return ra !== rb ? ra - rb : heroPower(b) - heroPower(a);
    });
  }

  function levelCost(heroId) {
    const owned = data.heroes[heroId];
    if (!owned) return null;
    return { scrap: ECONOMY.levelScrap(owned.level, getHero(heroId).rarity) };
  }

  function canLevel(heroId) {
    const owned = data.heroes[heroId];
    if (!owned || owned.level >= HERO_MAX_LEVEL) return false;
    return data.wallet.scrap >= levelCost(heroId).scrap;
  }

  function levelHero(heroId) {
    if (!canLevel(heroId)) return false;
    data.wallet.scrap -= levelCost(heroId).scrap;
    data.heroes[heroId].level += 1;
    save();
    return true;
  }

  function ascendCost(heroId) {
    const owned = data.heroes[heroId];
    if (!owned) return null;
    return { shards: ECONOMY.ascendShards(owned.stars) };
  }

  function canAscend(heroId) {
    const owned = data.heroes[heroId];
    if (!owned || owned.stars >= HERO_MAX_STARS) return false;
    return data.wallet.shards >= ascendCost(heroId).shards;
  }

  function ascendHero(heroId) {
    if (!canAscend(heroId)) return false;
    data.wallet.shards -= ascendCost(heroId).shards;
    data.heroes[heroId].stars += 1;
    save();
    return true;
  }

  /* ---------------- gear ---------------- */

  function addGear(item) {
    data.gear[item.id] = item;
    save();
    return item;
  }

  function gearList(filter) {
    const all = Object.keys(data.gear).map(id => data.gear[id]);
    const list = filter ? all.filter(filter) : all;
    return list.sort((a, b) => Gear.score(b) - Gear.score(a));
  }

  /** Equips onto a hero, moving the piece off whoever else had it. */
  function equipGear(heroId, gearId) {
    const owned = data.heroes[heroId];
    const item = data.gear[gearId];
    if (!owned || !item) return false;

    if (item.equipped && item.equipped !== heroId) {
      const previous = data.heroes[item.equipped];
      if (previous && previous.equipped[item.slot] === gearId) {
        delete previous.equipped[item.slot];
      }
    }

    const displaced = owned.equipped[item.slot];
    if (displaced && data.gear[displaced]) data.gear[displaced].equipped = null;

    owned.equipped[item.slot] = gearId;
    item.equipped = heroId;
    save();
    return true;
  }

  function unequipGear(heroId, slot) {
    const owned = data.heroes[heroId];
    if (!owned) return false;
    const gearId = owned.equipped[slot];
    if (gearId && data.gear[gearId]) data.gear[gearId].equipped = null;
    delete owned.equipped[slot];
    save();
    return true;
  }

  function upgradeGearCost(gearId) {
    const item = data.gear[gearId];
    return item ? Gear.upgradeCost(item) : null;
  }

  function canUpgradeGear(gearId) {
    const item = data.gear[gearId];
    if (!item || item.level >= GEAR_MAX_LEVEL) return false;
    const cost = Gear.upgradeCost(item);
    return data.wallet.scrap >= cost.scrap && data.wallet.shards >= cost.shards;
  }

  function upgradeGear(gearId) {
    if (!canUpgradeGear(gearId)) return null;
    const item = data.gear[gearId];
    const cost = Gear.upgradeCost(item);
    data.wallet.scrap -= cost.scrap;
    data.wallet.shards -= cost.shards;
    const result = Gear.upgrade(item);
    save();
    return result;
  }

  /** Scrapping unwanted gear is the main scrap faucet outside battle. */
  function sellGear(gearId) {
    const item = data.gear[gearId];
    if (!item) return 0;
    if (item.equipped) unequipGear(item.equipped, item.slot);
    const value = Math.round(60 * (1 + item.tier * 0.1) * (1 + item.level * 0.25)
                  * (item.rarity === 'legendary' ? 3 : item.rarity === 'epic' ? 2 : 1));
    delete data.gear[gearId];
    data.wallet.scrap += value;
    save();
    return value;
  }

  /* ---------------- team ---------------- */

  function setTeamSlot(index, heroId) {
    if (heroId) data.team = data.team.map(id => (id === heroId ? null : id));
    data.team[index] = heroId;
    save();
  }

  function teamPower() {
    return data.team.reduce((total, id) => total + (id ? heroPower(id) : 0), 0);
  }

  function autoTeam() {
    const best = roster().slice().sort((a, b) => heroPower(b) - heroPower(a));
    data.team = [0, 1, 2, 3].map(i => best[i] || null);
    save();
  }

  /** Units ready for Combat.resolve. */
  function teamUnits() {
    return data.team.filter(Boolean).map(id => ({
      hero: getHero(id),
      stats: statsFor(id)
    }));
  }

  /* ---------------- campaign ---------------- */

  const starsOn = nodeId => data.campaign.stars[nodeId] || 0;
  const isCleared = nodeId => starsOn(nodeId) > 0;

  function totalStars() {
    return Object.keys(data.campaign.stars)
      .reduce((sum, id) => sum + data.campaign.stars[id], 0);
  }

  function isUnlocked(nodeId) {
    const index = ALL_NODES.findIndex(n => n.id === nodeId);
    if (index <= 0) return index === 0;
    return isCleared(ALL_NODES[index - 1].id);
  }

  function nextNode() {
    return ALL_NODES.find(n => !isCleared(n.id)) || ALL_NODES[ALL_NODES.length - 1];
  }

  function recordClear(nodeId, stars) {
    const previous = starsOn(nodeId);
    if (stars > previous) data.campaign.stars[nodeId] = stars;
    data.campaign.lastNode = nodeId;
    save();
    return { firstClear: previous === 0, improved: stars > previous, previous };
  }

  /* ---------------- drift pass ---------------- */

  function addPassXp(amount) {
    const before = data.pass.level;
    data.pass.xp += amount;
    while (data.pass.level < PASS.levels && data.pass.xp >= PASS.xpPerLevel) {
      data.pass.xp -= PASS.xpPerLevel;
      data.pass.level += 1;
    }
    if (data.pass.level >= PASS.levels) data.pass.xp = Math.min(data.pass.xp, PASS.xpPerLevel);
    save();
    return { levelsGained: data.pass.level - before, level: data.pass.level };
  }

  function passClaimable(level, premium) {
    if (level > data.pass.level) return false;
    if (premium && !data.entitlements.passPremium) return false;
    const claimed = premium ? data.pass.claimedPremium : data.pass.claimedFree;
    return claimed.indexOf(level) === -1;
  }

  function claimPass(level, premium) {
    if (!passClaimable(level, premium)) return null;
    const reward = PASS.reward(level, premium);
    (premium ? data.pass.claimedPremium : data.pass.claimedFree).push(level);
    grantBundle(reward);
    save();
    return reward;
  }

  /* ---------------- dailies ---------------- */

  const today = () => new Date().toISOString().slice(0, 10);

  function ensureDaily() {
    if (data.quests.day === today()) return false;
    data.quests.day = today();
    data.quests.progress = {};
    data.quests.claimed = [];
    save();
    return true;
  }

  const questProgress = questId => data.quests.progress[questId] || 0;

  function advanceQuest(questId, amount) {
    ensureDaily();
    const quest = QUESTS.find(q => q.id === questId);
    if (!quest) return;
    data.quests.progress[questId] = Math.min(quest.goal, questProgress(questId) + (amount || 1));
    save();
  }

  function questClaimable(questId) {
    const quest = QUESTS.find(q => q.id === questId);
    return !!quest && questProgress(questId) >= quest.goal
        && data.quests.claimed.indexOf(questId) === -1;
  }

  function claimQuest(questId) {
    if (!questClaimable(questId)) return null;
    const quest = QUESTS.find(q => q.id === questId);
    data.quests.claimed.push(questId);
    grantBundle(quest.reward);
    save();
    return quest.reward;
  }

  const loginClaimable = () => data.login.lastDay !== today();

  function claimLogin() {
    if (!loginClaimable()) return null;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    data.login.streak = data.login.lastDay === yesterday ? data.login.streak + 1 : 1;
    data.login.lastDay = today();
    data.wallet.chronite += DAILY_LOGIN.chronite;
    data.fuel.amount = Math.min(ECONOMY.fuelCap, data.fuel.amount + DAILY_LOGIN.fuel);
    save();
    return { chronite: DAILY_LOGIN.chronite, fuel: DAILY_LOGIN.fuel, streak: data.login.streak };
  }

  function collectSupporter() {
    if (!data.entitlements.supporter) return null;
    if (data.entitlements.supporterLastPaid === today()) return null;
    data.entitlements.supporterLastPaid = today();
    data.wallet.chronite += 150;
    save();
    return { chronite: 150 };
  }

  /* ---------------- entitlements ---------------- */

  function owns(kind, ref) {
    const list = data.entitlements[kind];
    return Array.isArray(list) ? list.indexOf(ref) !== -1 : !!list;
  }

  function grantCosmetic(kind, ref) {
    const list = data.entitlements[kind];
    if (Array.isArray(list) && list.indexOf(ref) === -1) list.push(ref);
    save();
  }

  function setCosmetic(slot, ref) { data.cosmetics[slot] = ref; save(); }
  function setSetting(key, value) { data.settings[key] = value; save(); }

  function grantBundle(reward) {
    if (!reward) return;
    if (reward.chronite) data.wallet.chronite += reward.chronite;
    if (reward.scrap) data.wallet.scrap += reward.scrap;
    if (reward.shards) data.wallet.shards += reward.shards;
    if (reward.fuel) data.fuel.amount = Math.min(ECONOMY.fuelCap, data.fuel.amount + reward.fuel);
    if (reward.xp) addPassXp(reward.xp);
    if (reward.cosmetic) {
      const bucket = reward.cosmetic.kind === 'theme' ? 'themes'
                   : reward.cosmetic.kind === 'sigil' ? 'sigils' : 'titles';
      grantCosmetic(bucket, reward.cosmetic.ref);
    }
    save();
  }

  function pushLog(text, tone) {
    data.log.unshift({ text, tone: tone || 'info', at: Date.now() });
    data.log = data.log.slice(0, 20);
    save();
  }

  return {
    load, save, flush, reset, get,
    tickFuel, msToNextFuel,
    canAfford, spend, grant, grantBundle,
    addHero, ownsHero, heroEntry, statsFor, heroPower, roster,
    levelCost, canLevel, levelHero, ascendCost, canAscend, ascendHero,
    addGear, gearList, gearOf, equipGear, unequipGear,
    upgradeGearCost, canUpgradeGear, upgradeGear, sellGear,
    setTeamSlot, teamPower, autoTeam, teamUnits,
    starsOn, totalStars, isCleared, isUnlocked, nextNode, recordClear,
    addPassXp, passClaimable, claimPass,
    ensureDaily, questProgress, advanceQuest, questClaimable, claimQuest,
    loginClaimable, claimLogin, collectSupporter,
    owns, grantCosmetic, setCosmetic, setSetting,
    pushLog
  };
})();
