/* ------------------------------------------------------------------
 * combat.js — turn-meter battles.
 *
 * Every unit fills a turn meter at a rate set by SPD; whoever fills it
 * first acts. Speed is therefore the most valuable stat in the game,
 * which is what makes a boots roll worth chasing.
 *
 * Pure logic: resolves the whole fight and returns a timeline of events
 * for battle.js to animate, and for the headless tuning harnesses to
 * run thousands of times.
 * ------------------------------------------------------------------ */

const Combat = (() => {

  const TICK = 0.07;             // turn meter gained per point of SPD per tick

  /* Mitigation compares defence to the attacker's own attack rather than
     to a fixed constant. A flat constant looks fine early and then
     strangles the late game, where both sides' stats are ten times
     bigger: fights ran past a hundred turns before this changed. */
  const DEF_RATIO = 1.6;
  const VARIANCE = 0.12;
  const AFFINITY_MOD = 0.25;     // strong hits +25%, weak hits -25%
  const MAX_TURNS = 120;         // hard stop; a stalled fight is a loss

  const rand = (a, b) => a + Math.random() * (b - a);
  const living = units => units.filter(u => u.hp > 0);

  /* ---------------- unit construction ---------------- */

  function makeUnit(hero, stats, side, index) {
    return {
      uid: side + index,
      heroId: hero.id,
      name: hero.name,
      title: hero.title,
      art: hero.art,
      rarity: hero.rarity,
      faction: hero.faction,
      affinity: hero.affinity,
      role: hero.role,
      side,
      skills: hero.skills,
      cooldowns: hero.skills.map(() => 0),
      hp: stats.hp,
      maxHp: stats.hp,
      atk: stats.atk,
      def: stats.def,
      spd: stats.spd,
      crate: stats.crate,
      cdmg: stats.cdmg,
      acc: stats.acc,
      res: stats.res,
      lifesteal: stats.lifesteal || 0,
      shield: 0,
      tm: 0,
      statuses: []               // { id, turns, value }
    };
  }

  /* ---------------- status helpers ---------------- */

  function hasStatus(unit, id) {
    return unit.statuses.some(s => s.id === id);
  }

  /** Stat after buffs and debuffs. */
  function effective(unit, stat) {
    let value = unit[stat];
    let mod = 0;
    unit.statuses.forEach(s => {
      const def = STATUS[s.id];
      if (def && def.stat === stat) {
        if (def.flat) value += def.mod;
        else mod += def.mod;
      }
    });
    return def_clamp(stat, value * (1 + mod));
  }

  function def_clamp(stat, value) {
    if (stat === 'crate') return Math.max(0, Math.min(1, value));
    return Math.max(0, value);
  }

  /** Debuffs land on an accuracy-versus-resistance roll. */
  function lands(attacker, target, chance) {
    const gap = (attacker.acc - target.res) / 400;
    return Math.random() < Math.max(0.15, Math.min(0.95, chance + gap));
  }

  function applyStatus(attacker, target, spec, events) {
    const def = STATUS[spec.id];
    if (!def) return;
    const isDebuff = def.kind === 'debuff';

    if (isDebuff && !lands(attacker, target, spec.chance)) {
      events.push({ t: 'status', id: target.uid, status: spec.id, resisted: true });
      return;
    }

    const existing = target.statuses.find(s => s.id === spec.id);
    if (existing) existing.turns = Math.max(existing.turns, spec.turns);
    else target.statuses.push({ id: spec.id, turns: spec.turns });

    events.push({ t: 'status', id: target.uid, status: spec.id, kind: def.kind });
  }

  /* ---------------- damage ---------------- */

  function strike(attacker, target, skill, events) {
    const affinity = affinityMatch(attacker.affinity, target.affinity);
    const atk = effective(attacker, 'atk');
    const defence = effective(target, 'def') * (1 - (skill.ignoreDef || 0));

    let base = atk * skill.mult;
    if (skill.scaleDef) base = effective(attacker, 'def') * skill.mult * 1.35;
    if (skill.scaleHp) base = attacker.maxHp * skill.mult * 0.09;
    if (skill.executeUnder && target.hp / target.maxHp < skill.executeUnder) base *= 1.7;

    const mitigation = 1 / (1 + defence / Math.max(1, atk * DEF_RATIO));
    // A weak hit cannot crit — the same rule the affinity triangle uses
    // to make a bad matchup feel bad rather than just slightly worse.
    const crit = affinity >= 0 && Math.random() < effective(attacker, 'crate');
    const critMod = crit ? 1 + attacker.cdmg : 1;
    const affinityMod = 1 + affinity * AFFINITY_MOD;

    const amount = base * mitigation * critMod * affinityMod * rand(1 - VARIANCE, 1 + VARIANCE);

    let remaining = Math.round(amount);
    let absorbed = 0;
    if (target.shield > 0) {
      absorbed = Math.min(target.shield, remaining);
      target.shield -= absorbed;
      remaining -= absorbed;
    }
    if (skill.breakShield) target.shield = 0;
    target.hp = Math.max(0, target.hp - remaining);

    events.push({
      t: 'hit', id: target.uid, from: attacker.uid,
      dmg: remaining, absorbed, crit, affinity
    });

    const leech = (attacker.lifesteal || 0) + (skill.lifesteal || 0);
    if (leech > 0 && remaining > 0) {
      const healed = Math.round(remaining * leech);
      attacker.hp = Math.min(attacker.maxHp, attacker.hp + healed);
      events.push({ t: 'heal', id: attacker.uid, amount: healed });
    }

    (skill.applies || []).forEach(spec => {
      if (target.hp > 0) applyStatus(attacker, target, spec, events);
    });

    return remaining;
  }

  /* ---------------- targeting ---------------- */

  function chooseTargets(actor, skill, allies, foes) {
    switch (skill.target) {
      case 'all_enemies': return living(foes);
      case 'all_allies': return living(allies);
      case 'self': return [actor];
      case 'lowest_ally': {
        const alive = living(allies);
        if (!alive.length) return [];
        return [alive.reduce((worst, u) => (u.hp / u.maxHp < worst.hp / worst.maxHp ? u : worst))];
      }
      default: {
        const alive = living(foes);
        if (!alive.length) return [];
        // Prefer a weak affinity matchup, then the softest target — the
        // same read a competent player makes.
        const scored = alive.map(u => ({
          u,
          score: (affinityMatch(actor.affinity, u.affinity) * 40) - (u.hp / u.maxHp) * 30
                 + (u.role === 'support' ? 12 : 0)
        }));
        scored.sort((a, b) => b.score - a.score);
        // A little noise so a fight is not the same script twice.
        return [Math.random() < 0.75 ? scored[0].u : scored[Math.floor(Math.random() * scored.length)].u];
      }
    }
  }

  /** AI skill pick: strongest ready skill, biased to openers that buff. */
  function chooseSkill(actor, allies, foes) {
    for (let i = actor.skills.length - 1; i >= 0; i--) {
      if (actor.cooldowns[i] > 0) continue;
      const skill = actor.skills[i];

      // Do not waste a heal on a healthy team or a buff already up.
      if (skill.type === 'support') {
        const hurt = living(allies).some(u => u.hp / u.maxHp < 0.8);
        const buffs = (skill.applies || []).map(a => a.id);
        const alreadyUp = buffs.length && buffs.every(id => living(allies).every(u => hasStatus(u, id)));
        if (skill.heal && !hurt && !skill.shield) continue;
        if (alreadyUp && !skill.heal && !skill.shield) continue;
      }
      return i;
    }
    return 0;
  }

  /* ---------------- a turn ---------------- */

  function takeTurn(actor, allies, foes, events) {
    // Statuses tick at the top of the owner's turn.
    if (hasStatus(actor, 'poison')) {
      const tick = Math.round(actor.maxHp * 0.05);
      actor.hp = Math.max(0, actor.hp - tick);
      events.push({ t: 'hit', id: actor.uid, dmg: tick, poison: true });
    }
    if (hasStatus(actor, 'regen')) {
      const tick = Math.round(actor.maxHp * 0.08);
      actor.hp = Math.min(actor.maxHp, actor.hp + tick);
      events.push({ t: 'heal', id: actor.uid, amount: tick });
    }

    if (actor.hp <= 0) return;

    if (hasStatus(actor, 'stun')) {
      events.push({ t: 'stunned', id: actor.uid });
      return;
    }

    const index = chooseSkill(actor, allies, foes);
    const skill = actor.skills[index];
    if (skill.cd) actor.cooldowns[index] = skill.cd;

    const targets = chooseTargets(actor, skill, allies, foes);
    events.push({
      t: 'skill', id: actor.uid, skill: skill.name, index,
      target: targets.map(u => u.uid), kind: skill.type
    });

    if (skill.type === 'damage') {
      const hits = skill.hits || 1;
      for (let h = 0; h < hits; h++) {
        targets.forEach(target => { if (target.hp > 0) strike(actor, target, skill, events); });
      }
    } else {
      targets.forEach(target => {
        if (target.hp <= 0) return;
        if (skill.heal && !hasStatus(target, 'heal_block')) {
          const healed = Math.round(target.maxHp * skill.heal + effective(actor, 'atk') * 1.2);
          target.hp = Math.min(target.maxHp, target.hp + healed);
          events.push({ t: 'heal', id: target.uid, amount: healed });
        }
        if (skill.shield) {
          const amount = Math.round(target.maxHp * skill.shield);
          target.shield += amount;
          events.push({ t: 'shield', id: target.uid, amount });
        }
        if (skill.cleanse) {
          const removed = target.statuses.filter(s => STATUS[s.id].kind === 'debuff').length;
          target.statuses = target.statuses.filter(s => STATUS[s.id].kind !== 'debuff');
          if (removed) events.push({ t: 'cleanse', id: target.uid });
        }
        (skill.applies || []).forEach(spec => applyStatus(actor, target, spec, events));
      });
    }

    if (skill.extraTurn && Math.random() < skill.extraTurn) {
      actor.tm = 100;
      events.push({ t: 'extra', id: actor.uid });
    }

    allies.concat(foes).forEach(u => {
      if (u.hp <= 0 && !u.down) {
        u.down = true;
        events.push({ t: 'ko', id: u.uid, name: u.name, side: u.side });
      }
    });
  }

  function endOfTurn(actor) {
    actor.cooldowns = actor.cooldowns.map(c => (c > 0 ? c - 1 : 0));
    actor.statuses = actor.statuses
      .map(s => ({ id: s.id, turns: s.turns - 1 }))
      .filter(s => s.turns > 0);
  }

  /* ---------------- the fight ---------------- */

  /**
   * @param allyUnits  array of { hero, stats }
   * @param foeUnits   array of { hero, stats }
   */
  function resolve(allyUnits, foeUnits) {
    const allies = allyUnits.map((u, i) => makeUnit(u.hero, u.stats, 'ally', i));
    const foes = foeUnits.map((u, i) => makeUnit(u.hero, u.stats, 'foe', i));

    const events = [{ t: 'start', allies: snapshot(allies), foes: snapshot(foes) }];
    let turns = 0;

    while (turns < MAX_TURNS && living(allies).length && living(foes).length) {
      // Advance the clock until somebody is ready to act.
      let guard = 0;
      let actor = null;
      while (!actor && guard++ < 500) {
        allies.concat(foes).forEach(u => {
          if (u.hp > 0) u.tm += effective(u, 'spd') * TICK;
        });
        const ready = allies.concat(foes).filter(u => u.hp > 0 && u.tm >= 100);
        if (ready.length) {
          ready.sort((a, b) => b.tm - a.tm || effective(b, 'spd') - effective(a, 'spd'));
          actor = ready[0];
        }
      }
      if (!actor) break;

      turns += 1;
      actor.tm = 0;

      events.push({ t: 'meter', bars: allies.concat(foes).map(u => ({ id: u.uid, tm: Math.min(100, u.tm) })) });
      events.push({ t: 'turn', id: actor.uid, name: actor.name, side: actor.side });

      takeTurn(
        actor,
        actor.side === 'ally' ? allies : foes,
        actor.side === 'ally' ? foes : allies,
        events
      );
      endOfTurn(actor);
    }

    const won = living(foes).length === 0 && living(allies).length > 0;
    const losses = allies.filter(u => u.hp <= 0).length;

    events.push({ t: 'end', won, turns, losses });

    return {
      won, turns, losses,
      survivors: living(allies).length,
      stars: won ? starsFor(turns, losses) : 0,
      events
    };
  }

  /* Three stars wants a clean, fast win — the thresholds are set from
     the turn counts tools/balance.js actually reports. */
  function starsFor(turns, losses) {
    let stars = 1;
    if (losses === 0) stars += 1;
    if (turns <= 34) stars += 1;
    return stars;
  }

  function snapshot(units) {
    return units.map(u => ({
      uid: u.uid, heroId: u.heroId, name: u.name, title: u.title, art: u.art,
      rarity: u.rarity, affinity: u.affinity, role: u.role, side: u.side,
      hp: u.hp, maxHp: u.maxHp, spd: u.spd, boss: !!u.boss
    }));
  }

  /** Cheap Monte Carlo for the briefing screen. */
  function forecast(allyUnits, foeUnits, runs) {
    const n = runs || 24;
    let wins = 0;
    for (let i = 0; i < n; i++) if (resolve(allyUnits, foeUnits).won) wins += 1;
    return wins / n;
  }

  return { resolve, forecast, effective, STATUS_TABLE: STATUS };
})();
