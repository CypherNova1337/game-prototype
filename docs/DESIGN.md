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

## Champions and gear

Champions are what you summon; gear is what makes them. A champion carries a
role (attack / defense / support / vitality), an affinity, a faction, three
skills, and base stats shaped by its rarity. Six gear slots hang off it —
weapon, helmet, shield, gauntlets, chestplate, boots — each with a main stat
fixed by slot and up to four substats decided by rarity, upgradable to +16.

The split matters: a naked legendary is about 5,000 power, the same champion
in a full set of upgraded gear is 10,000, and maxed it passes 45,000. Pulling
a good champion is the start of building one, not the end.

Set bonuses stack per completed set, so six pieces of a 2-piece set is that
bonus three times. Boots are the only source of flat SPD, which is the stat
the turn meter runs on — that is deliberate, and it is why a speed roll on
boots is the thing worth chasing.

## Combat

Turn-meter, four champions against three to five hostiles. Every unit fills a
meter at a rate set by SPD; whoever fills it first acts. A1 has no cooldown,
A2 and A3 do, and the AI picks the strongest ready skill that is not wasted
(it will not heal a healthy team or re-apply a buff already up).

Damage compares the target's defence to the *attacker's own attack* rather
than to a fixed constant. That sounds like a detail and is not: with a flat
constant the late game strangles, because both sides' stats are ten times
bigger than the constant. Fights ran past a hundred turns before this changed.

The affinity triangle — Magic ▸ Spirit ▸ Force ▸ Magic, Void neutral — gives
±25% damage, and a weak hit cannot crit at all. That second rule is what makes
a bad matchup feel bad rather than marginally worse.

## The arena

A real CSS 3D stage, not a row of cards: a ground plane rotated away from the
camera with a grid printed on it, two ranks of billboarded figures at
different depths and scales, a skyline of wrecked hulls behind, and attackers
that travel a third of the way toward their target and spring back. Skills
above A1 get a cut-in with the champion's portrait. Crits shake the camera.

Champion art is procedural: a helmet type, a body build, a weapon and an
accent colour assemble into a bust for cards and a standing figure for the
arena. No image files ship in the package.

## Difficulty and pacing, as measured

Encounters are budgeted against an explicit power curve — what a player
plausibly fields at each tier — rather than a compounding multiplier.
Pressure per chapter is solved by `tools/calibrate.js` for ~85% win on normal
nodes and ~60% on bosses at curve.

The curve's tail is set from what a free account *actually reaches*, not from
the theoretical maximum. A perfectly geared team of four maxed ASCENDANTs
would be near 190,000 power; `tools/economy.js` shows a well-played free
account plateauing at 95,000-120,000, because real gear is whatever dropped.
An earlier tail of 149,000 left the last two nodes unwinnable for a maxed
account sitting on a million unspent scrap.

Free-to-play completion: 5 of 5 simulated runs clear all 20 nodes for
nothing, in 21-26 days, finishing at champion level 15-31 of 40 — so the
campaign ends before the build does.

## What a next pass should add

1. **Manual battles.** Skills are AI-picked today. Letting the player choose
   which ability fires on each turn is the biggest gap against the reference,
   and it needs the engine to become step-wise rather than pre-resolved.
2. Server-authoritative pulls and combat — both are client-side today.
3. Arena / PvP, dungeons that drop specific sets, and a clan layer.
4. Banner rotation with a pity counter per banner.
5. More campaign, and a first-run tutorial beat.
