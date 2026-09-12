/* ------------------------------------------------------------------
 * state.js — the player save and every rule that mutates it.
 *
 * Nothing here draws: screens read from State and call these methods,
 * which is what keeps the pull maths testable outside the UI.
 * ------------------------------------------------------------------ */

const State = (() => {
  const COLLECTION = 'player';
  const KEY = 'save';
  const SAVE_VERSION = 1;

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
      // itemId -> { level, copies, obtainedAt }
      inventory: {},
      squad: [null, null, null],
      pity: { sinceLegendary: 0, sinceRare: 0 },

      // campaign progress: nodeId -> best star count
      campaign: { stars: {}, lastNode: null },

      // drift pass
      pass: { xp: 0, level: 1, claimedFree: [], claimedPremium: [] },

      // daily contracts, rerolled on date change
      quests: { day: null, progress: {}, claimed: [] },
      login: { lastDay: null, streak: 0 },

      // purchases. Everything here is cosmetic or currency — never power.
      entitlements: {
        themes: ['drift'],
        sigils: ['nova'],
        titles: ['drifter', 'salvager'],
        passPremium: false,
        supporter: false,
        supporterLastPaid: null
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

  /** Older saves keep their progress and gain whatever fields are new. */
  function migrate(save) {
    const base = freshSave();
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
    tickFuel();
    return data;
  }

  function save() {
    // Coalesce the burst of writes a ten-pull produces into one commit.
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
    if (fuel.amount >= ECONOMY.fuelCap) {
      fuel.lastTick = now;
      return;
    }
    const elapsed = now - fuel.lastTick;
    const gained = Math.floor(elapsed / ECONOMY.fuelRegenMs);
    if (gained > 0) {
      fuel.amount = Math.min(ECONOMY.fuelCap, fuel.amount + gained);
      fuel.lastTick = fuel.amount >= ECONOMY.fuelCap
        ? now
        : fuel.lastTick + gained * ECONOMY.fuelRegenMs;
      save();
    }
  }

  function msToNextFuel() {
    if (data.fuel.amount >= ECONOMY.fuelCap) return 0;
    return Math.max(0, data.fuel.lastTick + ECONOMY.fuelRegenMs - Date.now());
  }

  /* ---------------- wallet ---------------- */

  function canAfford(currency, amount) {
    return data.wallet[currency] >= amount;
  }

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

  /* ---------------- inventory ---------------- */

  /**
   * Add one copy of an item. First copy unlocks it; every copy after that
   * becomes shards, which is the prototype's duplicate-protection rule.
   */
  function addItem(itemId) {
    const row = getItemRow(itemId);
    if (!row) return null;

    const rarity = RARITY[row.rarity];
    const existing = data.inventory[itemId];

    if (!existing) {
      data.inventory[itemId] = { level: 1, copies: 1, obtainedAt: Date.now() };
      save();
      return { itemId, isNew: true, shards: 0, scrap: 0 };
    }

    existing.copies += 1;
    data.wallet.shards += rarity.shards;
    data.wallet.scrap += rarity.scrap;
    save();
    return { itemId, isNew: false, shards: rarity.shards, scrap: rarity.scrap };
  }

  function owned(itemId) { return !!data.inventory[itemId]; }

  /** Ids only, in the order the armory should show them. */
  function inventoryIds() {
    return Object.keys(data.inventory).sort((a, b) => {
      const ra = RARITY_ORDER.indexOf(getItemRow(a).rarity);
      const rb = RARITY_ORDER.indexOf(getItemRow(b).rarity);
      if (ra !== rb) return ra - rb;
      return getPower(b) - getPower(a);
    });
  }

  function getEntry(itemId) { return data.inventory[itemId] || null; }

  /** Effective power: base row power scaled by the item's level. */
  function getPower(itemId) {
    const row = getItemRow(itemId);
    const entry = data.inventory[itemId];
    if (!row) return 0;
    const level = entry ? entry.level : 1;
    return Math.round(row.power * (1 + (level - 1) * ECONOMY.powerPerLevel));
  }

  function upgradeCost(itemId) {
    const entry = data.inventory[itemId];
    if (!entry) return null;
    return {
      scrap: ECONOMY.upgradeScrap(entry.level),
      shards: ECONOMY.upgradeShards(entry.level)
    };
  }

  function canUpgrade(itemId) {
    const entry = data.inventory[itemId];
    if (!entry || entry.level >= ECONOMY.levelCap) return false;
    const cost = upgradeCost(itemId);
    return data.wallet.scrap >= cost.scrap && data.wallet.shards >= cost.shards;
  }

  function upgrade(itemId) {
    if (!canUpgrade(itemId)) return false;
    const cost = upgradeCost(itemId);
    data.wallet.scrap -= cost.scrap;
    data.wallet.shards -= cost.shards;
    data.inventory[itemId].level += 1;
    save();
    return true;
  }

  /* ---------------- squad ---------------- */

  function setSquadSlot(index, itemId) {
    // An item can only be deployed once; clear it from any other slot first.
    if (itemId) {
      data.squad = data.squad.map(id => (id === itemId ? null : id));
    }
    data.squad[index] = itemId;
    save();
  }

  function squadPower(threatFaction) {
    return data.squad.reduce((total, itemId) => {
      if (!itemId) return total;
      const row = getItemRow(itemId);
      let power = getPower(itemId);
      if (threatFaction && row.faction === threatFaction) power = Math.round(power * 1.2);
      return total + power;
    }, 0);
  }

  function autoSquad() {
    const best = inventoryIds()
      .slice()
      .sort((a, b) => getPower(b) - getPower(a))
      .slice(0, 3);
    data.squad = [best[0] || null, best[1] || null, best[2] || null];
    save();
  }

  /* ---------------- campaign ---------------- */

  function starsOn(nodeId) { return data.campaign.stars[nodeId] || 0; }

  function totalStars() {
    return Object.keys(data.campaign.stars)
      .reduce((sum, id) => sum + data.campaign.stars[id], 0);
  }

  function isCleared(nodeId) { return starsOn(nodeId) > 0; }

  /** Nodes unlock in order; the first one is always open. */
  function isUnlocked(nodeId) {
    const index = ALL_NODES.findIndex(n => n.id === nodeId);
    if (index <= 0) return index === 0;
    return isCleared(ALL_NODES[index - 1].id);
  }

  function nextNode() {
    return ALL_NODES.find(n => !isCleared(n.id)) || ALL_NODES[ALL_NODES.length - 1];
  }

  /** Records a clear, keeping the best star count. Returns what is new. */
  function recordClear(nodeId, stars) {
    const previous = starsOn(nodeId);
    const firstClear = previous === 0;
    if (stars > previous) data.campaign.stars[nodeId] = stars;
    data.campaign.lastNode = nodeId;
    save();
    return { firstClear, improved: stars > previous, previous };
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

  /* ---------------- daily contracts ---------------- */

  const today = () => new Date().toISOString().slice(0, 10);

  /** Rolls the day over if needed. Safe to call on every render. */
  function ensureDaily() {
    if (data.quests.day === today()) return false;
    data.quests.day = today();
    data.quests.progress = {};
    data.quests.claimed = [];
    save();
    return true;
  }

  function questProgress(questId) { return data.quests.progress[questId] || 0; }

  function advanceQuest(questId, amount) {
    ensureDaily();
    const quest = QUESTS.find(q => q.id === questId);
    if (!quest) return;
    const next = Math.min(quest.goal, questProgress(questId) + (amount || 1));
    data.quests.progress[questId] = next;
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

  function loginClaimable() { return data.login.lastDay !== today(); }

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

  /** Supporter pays a daily trickle; convenience, never power. */
  function collectSupporter() {
    if (!data.entitlements.supporter) return null;
    if (data.entitlements.supporterLastPaid === today()) return null;
    data.entitlements.supporterLastPaid = today();
    data.wallet.chronite += 150;
    save();
    return { chronite: 150 };
  }

  /* ---------------- entitlements and cosmetics ---------------- */

  function owns(kind, ref) {
    const list = data.entitlements[kind];
    return Array.isArray(list) ? list.indexOf(ref) !== -1 : !!list;
  }

  function grantCosmetic(kind, ref) {
    const list = data.entitlements[kind];
    if (Array.isArray(list) && list.indexOf(ref) === -1) list.push(ref);
    save();
  }

  function setCosmetic(slot, ref) {
    data.cosmetics[slot] = ref;
    save();
  }

  function setSetting(key, value) {
    data.settings[key] = value;
    save();
  }

  /** Applies a reward object of any shape: currency, xp or a cosmetic. */
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

  /* ---------------- log ---------------- */

  function pushLog(text, tone) {
    data.log.unshift({ text, tone: tone || 'info', at: Date.now() });
    data.log = data.log.slice(0, 20);
    save();
  }

  return {
    load, save, flush, reset, get,
    tickFuel, msToNextFuel,
    canAfford, spend, grant, grantBundle,
    addItem, owned, inventoryIds, getEntry, getPower,
    upgradeCost, canUpgrade, upgrade,
    setSquadSlot, squadPower, autoSquad,
    starsOn, totalStars, isCleared, isUnlocked, nextNode, recordClear,
    addPassXp, passClaimable, claimPass,
    ensureDaily, questProgress, advanceQuest, questClaimable, claimQuest,
    loginClaimable, claimLogin, collectSupporter,
    owns, grantCosmetic, setCosmetic, setSetting,
    pushLog
  };
})();
