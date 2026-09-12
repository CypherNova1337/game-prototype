/* ------------------------------------------------------------------
 * battle.js — plays a resolved fight back on a perspective stage.
 *
 * combat.js has already decided the outcome; this walks its timeline.
 * The arena is real CSS 3D: a ground plane rotated away from the
 * camera, two ranks of billboarded figures placed at different depths,
 * and attackers that travel toward their target and back.
 *
 * Units are built once and mutated in place — no re-render mid-fight,
 * which is what keeps it smooth on a slow WebView.
 * ------------------------------------------------------------------ */

const Battle = (() => {

  const host = document.getElementById('overlay');

  let timer = null;
  let state = null;

  /* Base delays in ms, divided by the speed multiplier. */
  const STEP = {
    turn: 300, skill: 460, hit: 230, heal: 220, shield: 220,
    status: 140, ko: 420, meter: 0, stunned: 320, cleanse: 180, extra: 200, end: 600
  };

  /* ---------------- stage ---------------- */

  /** Rank positions: allies downstage large, hostiles upstage small. */
  function place(index, count, side) {
    const spread = Math.min(66, count * 16.5);
    const step = count > 1 ? spread / (count - 1) : 0;
    const x = 50 - spread / 2 + step * index;
    // A slight arc so the line does not read as a flat row of stickers.
    const arc = count > 1 ? Math.abs(index - (count - 1) / 2) / ((count - 1) / 2) : 0;
    return side === 'ally'
      ? { x, y: 13 + arc * 3, scale: 1 - arc * 0.05, z: 40 - arc * 10 }
      : { x, y: 41 + arc * 3, scale: 0.72 - arc * 0.04, z: -120 + arc * 12 };
  }

  function unitNode(unit, index, count) {
    const hero = getHero(unit.heroId) || { art: {}, name: unit.name };
    const pos = place(index, count, unit.side);
    const accent = Portrait.accentOf(hero);
    const rarity = RARITY[unit.rarity] || RARITY.rare;

    return `
      <div class="fighter ${unit.side === 'ally' ? 'is-ally' : 'is-foe'} ${unit.boss ? 'is-boss' : ''}"
           data-unit="${unit.uid}"
           style="left:${pos.x}%; bottom:${pos.y}%;
                  --scale:${pos.scale}; --z:${pos.z}px; --accent:${accent};
                  --edge:${rarity.edge}">
        <div class="fighter-body">
          ${Portrait.figure(hero, { className: 'fighter-art' })}
          <div class="floaters"></div>
        </div>
        <div class="fighter-plate">
          <div class="fighter-name">${escapeText(unit.name)}</div>
          <div class="hpbar"><i class="hp" style="width:100%"></i><i class="shield"></i></div>
          <div class="tmbar"><i style="width:0%"></i></div>
          <div class="statuses"></div>
        </div>
      </div>`;
  }

  function escapeText(value) {
    return String(value).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function build(node, result) {
    const start = result.events[0];
    host.classList.remove('hidden');
    host.innerHTML = `
      <div class="battle" id="battle">
        <div class="arena" id="arena">
          <div class="skyline">
            <svg viewBox="0 0 400 120" preserveAspectRatio="none">
              <path d="M0 120 L0 74 L26 74 L34 52 L62 52 L70 74 L104 74 L104 40 L128 30 L150 40 L150 74
                       L196 74 L208 58 L238 58 L248 74 L286 74 L286 46 L310 36 L332 46 L332 74
                       L366 74 L374 60 L400 60 L400 120 Z"
                    fill="#070c18" stroke="rgba(90,160,200,.28)" stroke-width="1"/>
              <circle cx="128" cy="30" r="2.5" fill="rgba(42,245,255,.7)"/>
              <circle cx="310" cy="36" r="2.5" fill="rgba(255,79,209,.6)"/>
            </svg>
          </div>
          <div class="ground"><div class="grid-lines"></div></div>
          <div class="horizon"></div>
          <div class="stage" id="stage">
            ${start.foes.map((u, i) => unitNode(u, i, start.foes.length)).join('')}
            ${start.allies.map((u, i) => unitNode(u, i, start.allies.length)).join('')}
          </div>
        </div>

        <div class="battle-hud">
          <div class="battle-node">${escapeText(node.name)}</div>
          <div class="battle-turn" id="b-turn">TURN 1</div>
          <button class="battle-speed" data-act="battle-speed" id="b-speed">1×</button>
          <button class="battle-skip" data-act="battle-skip">SKIP</button>
        </div>

        <div class="cutin" id="b-cutin"></div>
        <div class="battle-call" id="b-call"></div>
      </div>`;

    const units = {};
    start.allies.concat(start.foes).forEach(u => {
      const el = host.querySelector('[data-unit="' + u.uid + '"]');
      units[u.uid] = {
        uid: u.uid, heroId: u.heroId, name: u.name, side: u.side,
        hp: u.hp, maxHp: u.maxHp, shield: 0, statuses: {}, el
      };
      paint(units[u.uid]);
    });
    return units;
  }

  /* ---------------- painting ---------------- */

  function paint(unit) {
    if (!unit.el) return;
    unit.el.querySelector('.hp').style.width =
      Math.max(0, (unit.hp / unit.maxHp) * 100) + '%';
    unit.el.querySelector('.shield').style.width =
      Math.min(100, (unit.shield / unit.maxHp) * 100) + '%';
  }

  function paintMeter(bars) {
    bars.forEach(b => {
      const unit = state.units[b.id];
      if (!unit || !unit.el) return;
      const fill = unit.el.querySelector('.tmbar > i');
      if (fill) fill.style.width = Math.min(100, b.tm) + '%';
    });
  }

  function paintStatuses(unit) {
    if (!unit.el) return;
    const box = unit.el.querySelector('.statuses');
    box.innerHTML = Object.keys(unit.statuses).map(id => {
      const def = STATUS[id];
      return `<i class="pip ${def.kind}" title="${def.name}"></i>`;
    }).join('');
  }

  function floater(unit, text, kind) {
    if (!unit.el) return;
    const layer = unit.el.querySelector('.floaters');
    const node = document.createElement('span');
    node.className = 'floater ' + kind;
    node.textContent = text;
    node.style.setProperty('--drift', (Math.random() * 30 - 15) + 'px');
    layer.appendChild(node);
    setTimeout(() => node.remove(), 1100);
  }

  function shake(force) {
    const arena = document.getElementById('arena');
    if (!arena) return;
    arena.classList.remove('shake', 'shake-hard');
    void arena.offsetWidth;
    arena.classList.add(force > 1 ? 'shake-hard' : 'shake');
  }

  /** Move the attacker toward its target, then let CSS spring it back. */
  function lunge(actorUid, targetUids) {
    const actor = state.units[actorUid];
    const target = state.units[(targetUids || [])[0]];
    if (!actor || !actor.el || !target || !target.el) return;

    const a = actor.el.getBoundingClientRect();
    const b = target.el.getBoundingClientRect();
    const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
    const dy = (b.top + b.height / 2) - (a.top + a.height / 2);

    // Move a third of the way: enough to read as a charge, not so far
    // that the attacker ends up standing inside the other rank.
    actor.el.style.setProperty('--lx', dx * 0.34 + 'px');
    actor.el.style.setProperty('--ly', dy * 0.34 + 'px');
    actor.el.classList.add('lunging');
    setTimeout(() => {
      if (actor.el) {
        actor.el.classList.remove('lunging');
        actor.el.style.removeProperty('--lx');
        actor.el.style.removeProperty('--ly');
      }
    }, 420 / state.speed);
  }

  function cutIn(unit, skillName) {
    const box = document.getElementById('b-cutin');
    if (!box) return;
    const hero = getHero(unit.heroId);
    if (!hero) return;
    box.className = 'cutin show ' + (unit.side === 'ally' ? 'from-left' : 'from-right');
    box.innerHTML = `
      <div class="cutin-art" style="--accent:${Portrait.accentOf(hero)}">
        ${Portrait.bust(hero, { showWeapon: false })}
      </div>
      <div class="cutin-text">
        <b>${escapeText(unit.name)}</b>
        <span>${escapeText(skillName)}</span>
      </div>`;
    clearTimeout(box._t);
    box._t = setTimeout(() => { box.className = 'cutin'; }, 900 / state.speed);
  }

  function say(text, tone) {
    const call = document.getElementById('b-call');
    if (!call) return;
    call.textContent = text;
    call.className = 'battle-call ' + (tone || '');
    call.classList.remove('flash');
    void call.offsetWidth;
    call.classList.add('flash');
  }

  /* ---------------- event application ---------------- */

  function applyEvent(event, silent) {
    const units = state.units;

    switch (event.t) {
      case 'meter':
        if (!silent) paintMeter(event.bars);
        break;

      case 'turn': {
        state.turn += 1;
        const label = document.getElementById('b-turn');
        if (label && !silent) {
          label.textContent = 'TURN ' + state.turn;
          label.classList.remove('pulse');
          void label.offsetWidth;
          label.classList.add('pulse');
        }
        if (!silent) {
          Object.keys(units).forEach(id => units[id].el && units[id].el.classList.remove('active'));
          const actor = units[event.id];
          if (actor && actor.el) actor.el.classList.add('active');
        }
        break;
      }

      case 'skill': {
        const actor = units[event.id];
        if (silent || !actor) break;
        // Only the cooldown skills get a cut-in; a basic attack every
        // turn would make the screen unreadable.
        if (event.index > 0) {
          cutIn(actor, event.skill);
          Sfx.play('ability');
        }
        if (event.kind === 'damage') lunge(event.id, event.target);
        break;
      }

      case 'hit': {
        const target = units[event.id];
        if (!target) break;
        target.hp = Math.max(0, target.hp - event.dmg);
        if (event.absorbed) target.shield = Math.max(0, target.shield - event.absorbed);
        paint(target);
        if (silent) break;

        if (event.poison) {
          floater(target, '-' + Math.round(event.dmg), 'poison');
        } else {
          floater(target, '-' + Math.round(event.dmg), event.crit ? 'crit' : 'dmg');
          if (event.affinity > 0) floater(target, 'STRONG', 'strong');
          if (event.affinity < 0) floater(target, 'WEAK', 'weak');
          if (target.el) {
            target.el.classList.add('struck');
            setTimeout(() => target.el && target.el.classList.remove('struck'), 280);
          }
          if (event.crit) { Sfx.play('crit'); shake(2); }
          else { Sfx.play('hit'); shake(1); }
        }
        break;
      }

      case 'heal': {
        const target = units[event.id];
        if (!target) break;
        target.hp = Math.min(target.maxHp, target.hp + event.amount);
        paint(target);
        if (!silent) { floater(target, '+' + Math.round(event.amount), 'heal'); Sfx.play('heal'); }
        break;
      }

      case 'shield': {
        const target = units[event.id];
        if (!target) break;
        target.shield += event.amount;
        paint(target);
        if (!silent) { floater(target, 'SHIELD', 'shieldtag'); Sfx.play('shield'); }
        break;
      }

      case 'status': {
        const target = units[event.id];
        if (!target) break;
        if (event.resisted) {
          if (!silent) floater(target, 'RESIST', 'resist');
          break;
        }
        target.statuses[event.status] = true;
        paintStatuses(target);
        if (!silent) floater(target, STATUS[event.status].name, event.kind === 'buff' ? 'buff' : 'debuff');
        break;
      }

      case 'cleanse': {
        const target = units[event.id];
        if (!target) break;
        target.statuses = {};
        paintStatuses(target);
        if (!silent) floater(target, 'CLEANSED', 'buff');
        break;
      }

      case 'stunned':
        if (!silent) {
          const unit = units[event.id];
          if (unit) floater(unit, 'STUNNED', 'debuff');
        }
        break;

      case 'ko': {
        const unit = units[event.id];
        if (unit && unit.el) unit.el.classList.add('down');
        if (!silent) {
          say(event.name + ' is down', event.side === 'ally' ? 'bad' : 'good');
          Sfx.play('ko');
        }
        break;
      }

      case 'end':
        finish(event);
        break;
    }
  }

  /* ---------------- playback ---------------- */

  function step() {
    if (!state || state.index >= state.events.length) return;
    const event = state.events[state.index++];
    applyEvent(event, false);
    if (event.t === 'end') return;

    // Chain zero-delay events (meter updates) into the same frame.
    const delay = (STEP[event.t] || 200) / state.speed;
    timer = setTimeout(step, Math.max(16, delay));
  }

  function skip() {
    if (!state) return;
    clearTimeout(timer);
    while (state.index < state.events.length) {
      const event = state.events[state.index++];
      if (event.t === 'end') { finish(event); return; }
      applyEvent(event, true);
    }
  }

  function cycleSpeed() {
    if (!state) return;
    state.speed = state.speed >= 4 ? 1 : state.speed + 1;
    const button = document.getElementById('b-speed');
    if (button) button.textContent = state.speed + '×';
    State.setSetting('battleSpeed', state.speed);
  }

  function finish(event) {
    const stage = document.getElementById('battle');
    if (stage) {
      const banner = document.createElement('div');
      banner.className = 'battle-verdict ' + (event.won ? 'win' : 'loss');
      banner.textContent = event.won ? 'VICTORY' : 'DEFEAT';
      stage.appendChild(banner);
    }
    Sfx.play(event.won ? 'victory' : 'defeat');

    const done = state.onDone;
    const result = state.result;
    state = null;
    setTimeout(() => done(result), 1300);
  }

  /** Play a resolved battle, then hand the result back to the caller. */
  function play(node, result, onDone) {
    state = {
      result,
      events: result.events,
      index: 1,                    // event 0 is the roster snapshot
      turn: 0,
      speed: State.get().settings.battleSpeed || 1,
      units: build(node, result),
      onDone
    };
    const button = document.getElementById('b-speed');
    if (button) button.textContent = state.speed + '×';
    timer = setTimeout(step, 600);
  }

  function handleAction(action) {
    if (action === 'battle-skip') { skip(); return true; }
    if (action === 'battle-speed') { cycleSpeed(); return true; }
    return false;
  }

  return { play, handleAction, isRunning: () => !!state };
})();
