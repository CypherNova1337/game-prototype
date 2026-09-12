/* ------------------------------------------------------------------
 * combat.js — the fight.
 *
 * Pure logic: it takes a squad and a node, resolves the whole battle,
 * and returns a timeline of events. Nothing here touches the DOM, which
 * is what lets tools/balance.js run thousands of fights headlessly to
 * tune the difficulty curve.
 * ------------------------------------------------------------------ */

const Combat = (() => {

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = list => list[Math.floor(Math.random() * list.length)];

  /* ---------------- roster building ---------------- */

  function squadUnit(itemId, nodeFaction, powerOf) {
    const row = getItemRow(itemId);
    const power = powerOf(itemId);
    const matched = row.faction === nodeFaction;
    const atk = Math.round(power * (matched ? 1 + COMBAT.factionBonus : 1));
    const hp = Math.round(power * COMBAT.hpPerPower);

    return {
      side: 'squad',
      id: itemId,
      name: row.name,
      icon: row.icon,
      rarity: row.rarity,
      faction: row.faction,
      matched,
      atk,
      hp,
      maxHp: hp,
      shield: row.passive && row.passive.effect === 'shield'
        ? Math.round(hp * row.passive.value) : 0,
      spd: COMBAT.speedByType[row.type] + COMBAT.speedByRarity[row.rarity],
      crit: COMBAT.baseCrit + COMBAT.speedByRarity[row.rarity] * 0.02,
      ability: row.ability,
      cdLeft: row.ability ? row.ability.cd : 0,
      buff: 0,
      buffRounds: 0
    };
  }

  function enemyUnit(enemyId, node, index) {
    const def = ENEMIES[enemyId];
    const role = ROLE[def.role] || ROLE.striker;
    const power = enemyShare(node, index);
    const hp = Math.round(power * COMBAT.hpPerPower * role.hp * (def.hpScale || 1));

    return {
      side: 'foe',
      id: enemyId + '#' + index,
      name: def.name,
      icon: def.icon,
      rarity: def.boss ? 'legendary' : 'rare',
      faction: def.faction,
      boss: !!def.boss,
      atk: Math.round(power * role.atk),
      hp,
      maxHp: hp,
      shield: 0,
      spd: role.spd,
      crit: def.boss ? 0.12 : COMBAT.baseCrit,
      ability: def.signature || null,
      cdLeft: def.signature ? def.signature.cd : 0,
      buff: 0,
      buffRounds: 0
    };
  }

  /* ---------------- targeting ---------------- */

  const living = units => units.filter(u => u.hp > 0);

  function chooseTarget(enemies) {
    const alive = living(enemies);
    if (!alive.length) return null;
    // Mostly sensible, sometimes not — a line that always focuses the same
    // target reads like a spreadsheet rather than a firefight.
    if (Math.random() < 0.6) {
      return alive.reduce((weakest, u) => (u.hp < weakest.hp ? u : weakest));
    }
    return pick(alive);
  }

  function weakestAlly(allies) {
    const alive = living(allies);
    if (!alive.length) return null;
    return alive.reduce((worst, u) =>
      (u.hp / u.maxHp < worst.hp / worst.maxHp ? u : worst));
  }

  /* ---------------- damage ---------------- */

  function applyDamage(target, amount) {
    let remaining = Math.round(amount);
    let absorbed = 0;
    if (target.shield > 0) {
      absorbed = Math.min(target.shield, remaining);
      target.shield -= absorbed;
      remaining -= absorbed;
    }
    target.hp = Math.max(0, target.hp - remaining);
    return { dealt: remaining, absorbed };
  }

  function hitFor(actor, multiplier) {
    const base = actor.atk * (1 + actor.buff) * multiplier;
    const swing = rand(1 - COMBAT.variance, 1 + COMBAT.variance);
    const crit = Math.random() < actor.crit;
    return {
      amount: base * swing * (crit ? COMBAT.critMultiplier : 1),
      crit
    };
  }

  /* ---------------- one unit's turn ---------------- */

  function takeTurn(actor, allies, foes, events) {
    const useAbility = actor.ability && actor.cdLeft <= 0;
    const effect = useAbility ? actor.ability.effect : 'basic';
    const power = useAbility ? actor.ability.power : 1;
    const hits = [];

    if (useAbility) actor.cdLeft = actor.ability.cd;

    switch (effect) {
      case 'volley': {
        living(foes).forEach(target => {
          const { amount, crit } = hitFor(actor, power);
          const res = applyDamage(target, amount);
          hits.push({ id: target.id, dmg: res.dealt, absorbed: res.absorbed, crit });
        });
        break;
      }

      case 'execute': {
        const target = living(foes).length
          ? living(foes).reduce((w, u) => (u.hp / u.maxHp < w.hp / w.maxHp ? u : w))
          : null;
        if (target) {
          const finisher = target.hp / target.maxHp < 0.3 ? 1.5 : 1;
          const { amount, crit } = hitFor(actor, power * finisher);
          const res = applyDamage(target, amount);
          hits.push({ id: target.id, dmg: res.dealt, absorbed: res.absorbed, crit });
        }
        break;
      }

      case 'siphon': {
        const target = chooseTarget(foes);
        if (target) {
          const { amount, crit } = hitFor(actor, power);
          const res = applyDamage(target, amount);
          const healed = Math.round(res.dealt * 0.4);
          actor.hp = Math.min(actor.maxHp, actor.hp + healed);
          hits.push({ id: target.id, dmg: res.dealt, absorbed: res.absorbed, crit });
          hits.push({ id: actor.id, heal: healed });
        }
        break;
      }

      case 'mend': {
        const ally = weakestAlly(allies);
        if (ally) {
          const healed = Math.round(actor.atk * power * 3);
          ally.hp = Math.min(ally.maxHp, ally.hp + healed);
          hits.push({ id: ally.id, heal: healed });
        }
        break;
      }

      case 'ward': {
        const ally = weakestAlly(allies) || actor;
        const shield = Math.round(actor.atk * power * 3);
        ally.shield += shield;
        hits.push({ id: ally.id, shield });
        break;
      }

      case 'rally': {
        living(allies).forEach(ally => {
          ally.buff = power;
          ally.buffRounds = 2;
          hits.push({ id: ally.id, buff: power });
        });
        break;
      }

      case 'strike':
      case 'basic':
      default: {
        const target = chooseTarget(foes);
        if (target) {
          const { amount, crit } = hitFor(actor, power);
          const res = applyDamage(target, amount);
          hits.push({ id: target.id, dmg: res.dealt, absorbed: res.absorbed, crit });
        }
        break;
      }
    }

    events.push({
      type: 'act',
      actor: actor.id,
      side: actor.side,
      kind: useAbility ? 'ability' : 'attack',
      ability: useAbility ? actor.ability.name : null,
      effect,
      hits
    });

    // Anything that died as a result gets its own beat in the timeline.
    allies.concat(foes).forEach(u => {
      if (u.hp <= 0 && !u.down) {
        u.down = true;
        events.push({ type: 'ko', id: u.id, side: u.side, name: u.name });
      }
    });
  }

  /* ---------------- the battle ---------------- */

  /**
   * @param squadIds  up to three item ids (nulls are skipped)
   * @param node      a campaign node from content.js
   * @param powerOf   function(itemId) -> effective power, injected so the
   *                  engine never has to know about the save
   */
  function resolve(squadIds, node, powerOf) {
    const squad = squadIds.filter(Boolean).map(id => squadUnit(id, node.faction, powerOf));
    const foes = node.comp.map((enemyId, i) => enemyUnit(enemyId, node, i));

    const events = [{ type: 'start', squad: snapshot(squad), foes: snapshot(foes) }];
    let round = 0;

    while (round < COMBAT.maxRounds && living(squad).length && living(foes).length) {
      round += 1;
      events.push({ type: 'round', n: round });

      const order = squad.concat(foes)
        .filter(u => u.hp > 0)
        .sort((a, b) => (b.spd - a.spd) || (a.side === 'squad' ? -1 : 1));

      for (const actor of order) {
        if (actor.hp <= 0) continue;
        if (!living(squad).length || !living(foes).length) break;
        takeTurn(
          actor,
          actor.side === 'squad' ? squad : foes,
          actor.side === 'squad' ? foes : squad,
          events
        );
      }

      // Cooldowns and buffs tick at the end of the round, so an ability
      // cast this round cannot also fire again next round.
      squad.concat(foes).forEach(u => {
        if (u.cdLeft > 0) u.cdLeft -= 1;
        if (u.buffRounds > 0) {
          u.buffRounds -= 1;
          if (u.buffRounds === 0) u.buff = 0;
        }
      });
    }

    const won = living(foes).length === 0 && living(squad).length > 0;
    const losses = squad.filter(u => u.hp <= 0).length;

    events.push({ type: 'end', won, rounds: round, losses });

    return {
      won,
      rounds: round,
      losses,
      survivors: living(squad).length,
      stars: won ? starsFor(round, losses) : 0,
      events
    };
  }

  function starsFor(rounds, losses) {
    let stars = 1;
    if (losses === 0) stars += 1;
    if (rounds <= 6) stars += 1;
    return stars;
  }

  function snapshot(units) {
    return units.map(u => ({
      id: u.id, name: u.name, icon: u.icon, rarity: u.rarity, faction: u.faction,
      hp: u.hp, maxHp: u.maxHp, shield: u.shield, atk: u.atk, boss: !!u.boss,
      matched: !!u.matched, ability: u.ability ? u.ability.name : null
    }));
  }

  /** Rough odds, for the pre-battle briefing. Cheap Monte Carlo. */
  function forecast(squadIds, node, powerOf, runs) {
    const n = runs || 40;
    let wins = 0;
    for (let i = 0; i < n; i++) {
      if (resolve(squadIds, node, powerOf).won) wins += 1;
    }
    return wins / n;
  }

  return { resolve, forecast, squadUnit, enemyUnit };
})();
