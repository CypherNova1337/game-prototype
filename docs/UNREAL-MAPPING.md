# Mapping this prototype back to the Unreal + Nakama build

The design transcript stops mid-way through the inventory system in UE5:
`WBP_ItemSlot`, `WBP_InventoryScreen`, `DT_ItemDatabase`, `S_ItemVisuals`, a
`LocalInventoryIDs` array filled from Nakama storage objects, and the "I" key
toggle. This prototype implements the same systems in a form that builds to an
APK today. Here's what corresponds to what.

| Transcript / Unreal | This prototype | Notes |
|---|---|---|
| `DT_ItemDatabase` (Data Table) | `ITEMS` in `js/data.js` | Row name = item id string, same key the save stores |
| `S_ItemVisuals` (struct) | the fields on each row | `icon`, `name`, `rarity`, `power`, `trait`, `faction` |
| Icon (Texture2D) | `<symbol>` in `index.html` | Vector line-art; swap for real art later |
| `Get Data Table Row` | `getItemRow(itemId)` | Same lookup-by-id contract |
| `WBP_ItemSlot` + `UpdateSlot(ItemID)` | `UI.slotHTML(itemId)` in `js/ui.js` | Builds one tile from an id |
| `WBP_InventoryScreen` + `RefreshGrid(ItemArray)` | `screenArmory()` | Clears and rebuilds the grid from the id list |
| `Add Child to Uniform Grid`, Row = `Index / 4`, Column = `Index % 4` | `.grid { grid-template-columns: repeat(4, 1fr) }` | Same 4-wide layout, handled by the layout engine |
| `LocalInventoryIDs` (array of String) | `State.inventoryIds()` | Sorted by rarity then power for display |
| `Clear` before the For Each Loop (the duplicate-glitch fix) | `screenArmory()` rebuilds from scratch each render | The bug the transcript warns about can't occur: nothing appends to a live list |
| `List Storage Objects` → `Break NakamaStorageObjectList` → `For Each Loop` → `Split Struct Pin` → `Value` → `Parse Into Array` | `Storage.read(collection, key)` in `js/storage.js` | Returns one `{collection, key, value, version}` record; `state.js` never sees the transport |
| `Write Storage Objects` | `Storage.write(collection, key, value)` | Debounced through `State.save()` so a 10-pull is one commit |
| `Server_LoadInventory` on `BeginPlay` | `State.load()` in `js/main.js` | Same "load before first paint" ordering |
| "I" key → Flip Flop → Create Widget → Add to Viewport | bottom nav → `UI.go('armory')` | Phone UI, so a tab replaces the key toggle |
| `Set Input Mode Game And UI` / mouse cursor | not needed | Touch-only |

## Porting the systems back into Unreal

The parts worth lifting are the rules, not the rendering:

- **Pull rates and pity** — `js/gacha.js`. `legendaryChance()` is the soft-pity
  ramp (flat base until pull 60, then +6%/pull, forced at 70); `rollRarity()`
  also enforces the rare floor every 10. Both counters live on the save so they
  survive a relaunch. This maps cleanly to a Blueprint Function Library, or to
  a Nakama RPC if you want the roll server-authoritative (you should — a
  client-side roll is trivially editable).
- **Duplicate handling** — `State.addItem()`. First copy unlocks the item, every
  copy after converts to shards + scrap. This is what makes a 10-pull of
  commons feel like it paid for something.
- **Upgrade curve** — `ECONOMY.upgradeScrap/upgradeShards/powerPerLevel` in
  `js/data.js`. Level 1→10 roughly triples an item's power.
- **Sector resolution** — `js/missions.js`. `successChance()` is the only combat
  maths in the build; in the Unreal version this is where a real encounter
  scene would slot in, with the power check as the fallback for auto-runs.

## If this should become the Unreal build instead

The storage layer is the seam. `js/storage.js` is the only file that knows
where saves live; swapping its two functions for Nakama client calls
(`listStorageObjects` / `writeStorageObjects`, collection `player`, key `save`)
makes the rest of the game cloud-backed without touching `state.js`. That same
split is worth keeping in the Blueprint version: one function that returns the
id array, and everything else reading from that array.
