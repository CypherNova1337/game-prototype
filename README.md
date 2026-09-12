# Nova Drift — sci-fi gacha prototype (Android)

A playable, installable prototype of the sci-fi gacha game from the design
transcript: summon units, catalogue them in a grid-based armory, assign a
strike team, and run sectors to earn the currency for the next summon.

**Download:** [`dist/nova-drift-0.1.0-prototype.apk`](dist/nova-drift-0.1.0-prototype.apk) (32 KB)

> Not an Unreal build. The transcript describes a UE5 + Nakama project; that
> toolchain can't be compiled here. This prototype re-implements the same
> systems — item database, item slots, the 4-wide inventory grid, server-shaped
> save/load — as a standalone APK so the loop is testable on a phone today.
> See [`docs/UNREAL-MAPPING.md`](docs/UNREAL-MAPPING.md) for how each piece
> lines up with the Blueprints in the transcript.

## Install

```bash
adb install -r dist/nova-drift-0.1.0-prototype.apk
```

Or copy the APK to the device and open it (allow "install from unknown
sources"). Android 8.0+ (minSdk 26), portrait, ~32 KB, fully offline.
Both APKs are signed with the standard Android debug key — fine for
sideloading, not for distribution.

## What's in it

| System | Detail |
|---|---|
| Summon | 1× / 10× pulls, animated reveal, skip-all, 4 rarity tiers |
| Pity | Guaranteed ENHANCED+ every 10; ASCENDANT soft pity from 60, hard at 70 |
| Item database | 25 items across 3 types, 4 factions, line-art icon per row |
| Armory | 4-per-row slot grid, type filters, detail sheet, duplicate → shards |
| Upgrades | Level 1–10 per item, scrap + shards, +12% base power per level |
| Deploy | 3-slot strike team, 5 sectors, faction matchup bonus (+20%), fuel economy |
| Save | Device-local, written through a Nakama-shaped storage layer |

Starting grant: 4,800 chronite (three 10-pulls), 1,500 scrap, full fuel,
plus a three-item starter kit so DEPLOY is usable before the first summon.

## Layout

```
android/                      Gradle project (AGP 8.7.3, minSdk 26, targetSdk 34)
  app/src/main/java/...       MainActivity — WebView host + back-button bridge
  app/src/main/assets/game/   the game
    index.html                shell + SVG icon sprite (one symbol per item row)
    css/style.css             console/HUD styling, rarity carried by --r
    js/data.js                item database, rarities, banner, sectors, economy
    js/storage.js             save layer, shaped like Nakama storage objects
    js/state.js               player save + every rule that mutates it
    js/gacha.js               pull rates and both pity systems
    js/missions.js            sector resolution and rewards
    js/ui.js                  screens, slots, overlays
    js/main.js                boot
dist/                         built APKs
docs/                         design notes and the Unreal mapping
```

## Build

```bash
cd android
ANDROID_HOME=/path/to/android-sdk ./gradlew assembleRelease
# -> app/build/outputs/apk/release/app-release.apk
```

Needs JDK 17+ and an Android SDK with platform 34 / build-tools 34.0.0.

## Editing the game

`js/data.js` is the content file — add a row to `ITEMS`, point `icon` at a
`<symbol>` in `index.html`, and it appears in the pool, the armory and the
squad picker with no other changes. Rates live in `RARITY[*].weight` and
`BANNER.pity`; sector difficulty and payouts in `SECTORS`.

## Known gaps

Deliberately out of scope for a vertical slice: no combat scene (sector runs
resolve as a single power check), no account or cloud save, no audio, no
banner rotation, and no real item art — icons are procedural line-art symbols.
