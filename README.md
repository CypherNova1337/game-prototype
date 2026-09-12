# Nova Drift — sci-fi gacha prototype (Android)

A playable, installable prototype of the sci-fi gacha game from the design
transcript: summon units, catalogue them in a grid-based armory, assign a
strike team, and run sectors to earn the currency for the next summon.

**Download:** [`dist/nova-drift-0.1.1-prototype.apk`](dist/nova-drift-0.1.1-prototype.apk) (42 KB)

> This is the game, not a mock-up of one: a native Android package with the
> systems from the design transcript rebuilt in a stack that ships in seconds
> and installs anywhere. [`docs/UNREAL-MAPPING.md`](docs/UNREAL-MAPPING.md)
> keeps the correspondence to the original Blueprints
> (`DT_ItemDatabase`, `WBP_ItemSlot`, the 4-wide grid, Nakama storage) so the
> earlier design work carries over intact.

## If it does not start

Build 0.1.0 opened to an unresponsive screen on device. Four things could each
have caused that on their own, and all four are fixed rather than guessed at:

1. **The tab bar sat under the system navigation bar.** The app drew
   edge-to-edge with the status bar hidden, which put the gesture strip on top
   of the bottom tab row and fed those taps to the system instead of the game.
   The window now fits the system insets.
2. **Item tiles used `aspect-ratio` with no height.** On a WebView older than
   Chrome 88 every tile collapsed to zero height — present but untappable.
   They now have a pixel floor.
3. **`color-mix()` (Chrome 111+, 2023)** styled every tile, card and sector.
   Older engines discard the whole declaration, losing borders and
   backgrounds. All accents are now pre-mixed rgba values.
4. **`localStorage` on a `file://` origin** is treated as an opaque origin by
   some OEM WebViews and throws. The game is now served over a real https
   origin from inside the APK, and the save moved out of the WebView entirely.

If a build ever fails again, it now says so on screen instead of going black:
any boot error paints a panel with the engine version, storage backend and
stack trace. The **SYSTEM** tab shows the same diagnostics at any time, and
`adb logcat -s NovaDrift` carries every console line out of the WebView.

## Install

```bash
adb install -r dist/nova-drift-0.1.1-prototype.apk
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
| Save | App-private, HMAC-signed with a non-extractable device key |
| Security | Zero permissions, no network, locked-down WebView — see [docs/SECURITY.md](docs/SECURITY.md) |

Starting grant: 4,800 chronite (three 10-pulls), 1,500 scrap, full fuel,
plus a three-item starter kit so DEPLOY is usable before the first summon.

## Layout

```
android/                      Gradle project (AGP 8.7.3, minSdk 26, targetSdk 34)
  app/src/main/java/...
    MainActivity.java         window, WebView setup, failure surfaces
    AssetOrigin.java          serves assets over https + CSP, refuses everything else
    SaveVault.java            HMAC-signed save in app-private storage
  app/src/test/java/...       unit tests for the asset path parser
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
ANDROID_HOME=/path/to/android-sdk ./gradlew test assembleRelease
# -> app/build/outputs/apk/release/app-release.apk
```

Needs JDK 17+ and an Android SDK with platform 34 / build-tools 34.0.0.

## Editing the game

`js/data.js` is the content file — add a row to `ITEMS`, point `icon` at a
`<symbol>` in `index.html`, and it appears in the pool, the armory and the
squad picker with no other changes. Rates live in `RARITY[*].weight` and
`BANNER.pity`; sector difficulty and payouts in `SECTORS`.

## Security posture

Zero permissions (not even `INTERNET`), no third-party code in the APK, no
network calls, cleartext traffic blocked, save authenticated with an
Android Keystore key, and a WebView that can only ever load bytes from its own
package. The summon roll still happens on the client, which is fine while the
game is offline and is the first thing to move server-side when it is not.
[docs/SECURITY.md](docs/SECURITY.md) has the threat model, the controls, the
known limits, and the checklist every new feature has to pass.

## Known gaps

Deliberately out of scope for a vertical slice: no combat scene (sector runs
resolve as a single power check), no account or cloud save, no audio, no
banner rotation, and no real item art — icons are procedural line-art symbols.
