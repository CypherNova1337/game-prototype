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
      stats: { pulls: 0, legendaries: 0, missionsRun: 0, missionsWon: 0 },
      log: []
    };
  }

  function migrate(save) {
    // Only one schema so far; this is where future saves get patched up.
    const base = freshSave();
    return Object.assign(base, save, {
      wallet: Object.assign(base.wallet, save.wallet),
      fuel: Object.assign(base.fuel, save.fuel),
      pity: Object.assign(base.pity, save.pity),
      stats: Object.assign(base.stats, save.stats)
    });
  }

  async function load() {
    const record = await Storage.read(COLLECTION, KEY);
    data = record && record.value ? migrate(record.value) : freshSave();
    tickFuel();
    return data;
  }

  function save() {
    // Coalesce the burst of writes a ten-pull produces into one commit.
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      Storage.write(COLLECTION, KEY, data);
    }, 120);
  }

  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    return Storage.write(COLLECTION, KEY, data);
  }

  async function reset() {
    await Storage.clearAll();
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

  /* ---------------- log ---------------- */

  function pushLog(text, tone) {
    data.log.unshift({ text, tone: tone || 'info', at: Date.now() });
    data.log = data.log.slice(0, 20);
    save();
  }

  return {
    load, save, flush, reset, get,
    tickFuel, msToNextFuel,
    canAfford, spend, grant,
    addItem, owned, inventoryIds, getEntry, getPower,
    upgradeCost, canUpgrade, upgrade,
    setSquadSlot, squadPower, autoSquad,
    pushLog
  };
})();
