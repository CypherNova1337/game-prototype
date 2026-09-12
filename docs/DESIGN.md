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

## What a next pass should add

1. A real sector encounter instead of a single power roll.
2. Server-authoritative pulls (see `docs/UNREAL-MAPPING.md`) — the current
   roll is client-side and editable.
3. Banner rotation with a pity counter per banner.
4. Item art, audio, and a first-run tutorial beat.
