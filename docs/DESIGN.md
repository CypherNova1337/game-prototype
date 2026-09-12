# Nova Drift — prototype design notes

A vertical slice, built to answer one question: does the summon → catalogue →
deploy → summon loop hold together on a phone?

## The loop

```
SUMMON  spend chronite on the banner        →  items
ARMORY  catalogue, upgrade with dupes       →  power
DEPLOY  spend fuel on a sector              →  scrap + chronite
                                            └→ back to SUMMON
```

Fuel is the session limiter (cap 60, +1 per 4 minutes, 8–16 per run), so a
sitting ends naturally instead of running forever. Chronite comes back fast
enough from sectors that a player who never spends is still pulling.

## Rarity

| Tier | Name | Base rate | Dupe value |
|---|---|---|---|
| ★ | STANDARD | 60.0% | 1 shard, 40 scrap |
| ★★ | ENHANCED | 30.0% | 5 shards, 120 scrap |
| ★★★ | PROTOTYPE | 8.5% | 20 shards, 400 scrap |
| ★★★★ | ASCENDANT | 1.5% | 60 shards, 1,200 scrap |

Two pity systems, both standard for the genre and both visible in the UI:
ENHANCED-or-better is guaranteed every 10 pulls, and ASCENDANT ramps +6% per
pull from 60 and is forced at 70. Simulated over 2,000 pulls the effective
ASCENDANT rate lands near 2.4% and the longest observed drought is exactly the
hard-pity value.

## Factions

Four factions (HELIX, RAVEN, SOLARIS, VOIDKIN) exist to make squad-building a
decision rather than "equip highest number": each sector is held by one
faction, and matching items get +20% power there. A wide roster beats a tall
one on the harder sectors.

## Economy tuning

- Starting grant of 4,800 chronite = three 10-pulls, enough to see a
  PROTOTYPE and feel the pity bar move on first run.
- 10× costs 1,440 against 1,600 for ten singles — a 10% nudge toward the
  multi, which is where the reveal sequence actually reads well.
- Upgrades cost scrap (plentiful, from sectors) and shards (scarce, from
  duplicates only), so pulling and running both feed progression.

## Screens

- **DEPLOY** — strike team (3 slots) with an AUTO button, sector list with live
  clear odds, transmissions log.
- **SUMMON** — banner, published rates, pity counter, 1×/10×, rate-up dossier.
- **ARMORY** — 4-per-row slot grid with type filters; tapping a tile opens the
  detail sheet with upgrade.
- **SYSTEM** — service record, full log, save wipe.

## Combat

Turn-based, three units against a hostile line of three to five. Every item
carries an ability on a cooldown — strike, volley, execute, siphon, mend, ward
or rally — so a squad is a composition, not a sum. Units act in speed order,
damage swings +/-22%, crits multiply by 1.8, and shields absorb before health.

Combat derives entirely from the power number the armory already shows, so a
player never has to learn a second stat system: HP is power x 4.2, attack is
power, and matching a sector's faction adds 20%.

The engine (`js/combat.js`) resolves a whole fight up front and returns a
timeline of events; `js/battle.js` animates that timeline. Keeping those apart
is what lets `tools/balance.js` run thousands of fights headlessly.

## Difficulty and pacing, as measured

Encounters are budgeted against an explicit power curve — what a player
plausibly fields at each tier — rather than a compounding multiplier. Pressure
values per chapter are solved by `tools/calibrate.js` to hit ~85% win on
normal nodes and ~60% on bosses for a squad sitting on the curve.

Below the curve the drop is steep: a squad at 75% power wins almost nothing.
That is inherent to a damage race, and the fix is honesty rather than
softening — the briefing screen shows recommended power, your power, and live
Monte-Carlo odds before any fuel is spent.

Free-to-play completion is measured by `tools/economy.js`: 5 of 5 simulated
runs clear all 20 nodes for nothing, in 2-8 days of aggressive play, taking
120-170 summons and 2-4 ASCENDANTs on the way.

## What a next pass should add

1. Server-authoritative pulls and combat — both are client-side today.
2. More roster: 25 items and 3 legendaries is thin for a gacha, and it caps
   how long the collection stays interesting.
3. Banner rotation with a pity counter per banner.
4. Item art and a first-run tutorial beat.
5. More campaign: 20 nodes is a few days of content, and the limit on playtime
   is content, not monetisation — which is the right way round, but it does
   mean the game currently ends.
