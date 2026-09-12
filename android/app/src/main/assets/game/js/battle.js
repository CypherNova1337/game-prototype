/* ------------------------------------------------------------------
 * battle.js — plays a resolved fight back to the player.
 *
 * combat.js has already decided the outcome; this walks its timeline and
 * animates it. Units are built once and then mutated in place — no
 * re-rendering mid-fight, which keeps it smooth on a slow WebView.
 * ------------------------------------------------------------------ */

const Battle = (() => {

  const host = document.getElementById('overlay');

  let timer = null;
  let state = null;   // { result, events, index, speed, units, onDone }

  const STEP = { act: 560, round: 420, ko: 380, start: 300, end: 700 };

  /* ---------------- building the stage ---------------- */

  function unitCard(unit, side) {
    const scheme = side === 'foe'
      ? (unit.boss ? RARITY.legendary : FACTION[unit.faction] || RARITY.rare)
      : (RARITY[unit.rarity] || RARITY.rare);
    return `
      <div class="bunit side-${side}" data-unit="${unit.id}"
           style="--r:${scheme.color};--edge:${scheme.edge};--tint:${scheme.tint}">
        <div class="bunit-frame">
          ${unit.boss ? '<span class="boss-tag">BOSS</span>' : ''}
          <svg class="bunit-icon"><use href="#${unit.icon}"></use></svg>
          <div class="floaters"></div>
        </div>
        <div class="bunit-name">${escapeText(unit.name)}</div>
        <div class="hpbar"><i class="hp" style="width:100%"></i><i class="shield"></i></div>
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
        <div class="battle-top">
          <div class="battle-node">${escapeText(node.name)}</div>
          <div class="battle-round" id="b-round">ROUND 1</div>
          <button class="battle-speed" data-act="battle-speed" id="b-speed">1×</button>
          <button class="battle-skip" data-act="battle-skip">SKIP</button>
        </div>

        <div class="battle-line line-foes" id="b-foes">
          ${start.foes.map(u => unitCard(u, 'foe')).join('')}
        </div>

        <div class="battle-mid">
          <div class="mid-rings"><i></i><i></i><i></i></div>
          <div class="mid-rule"></div>
          <div class="battle-call" id="b-call">CONTACT</div>
          <div class="mid-rule"></div>
        </div>

        <div class="battle-line line-allies" id="b-squad">
          ${start.squad.map(u => unitCard(u, 'squad')).join('')}
        </div>
      </div>`;

    const units = {};
    start.squad.concat(start.foes).forEach(u => {
      units[u.id] = {
        hp: u.hp, maxHp: u.maxHp, shield: u.shield, name: u.name,
        el: host.querySelector(`[data-unit="${cssEscape(u.id)}"]`)
      };
      paintBars(units[u.id]);
    });
    return units;
  }

  /** Unit ids contain '#', which is not a valid bare attribute selector. */
  function cssEscape(value) {
    return String(value).replace(/([#.:[\]])/g, '\\$1');
  }

  /* ---------------- painting ---------------- */

  function paintBars(unit) {
    if (!unit.el) return;
    const hp = unit.el.querySelector('.hp');
    const shield = unit.el.querySelector('.shield');
    hp.style.width = Math.max(0, (unit.hp / unit.maxHp) * 100) + '%';
    shield.style.width = Math.min(100, (unit.shield / unit.maxHp) * 100) + '%';
  }

  function floater(unit, text, kind) {
    if (!unit.el) return;
    const layer = unit.el.querySelector('.floaters');
    const node = document.createElement('span');
    node.className = 'floater ' + kind;
    node.textContent = text;
    layer.appendChild(node);
    setTimeout(() => node.remove(), 1100);
  }

  function shake(intensity) {
    const stage = document.getElementById('battle');
    if (!stage) return;
    stage.classList.remove('shake', 'shake-hard');
    void stage.offsetWidth;                     // restart the animation
    stage.classList.add(intensity > 1 ? 'shake-hard' : 'shake');
  }

  /* ---------------- playback ---------------- */

  function applyEvent(event) {
    const units = state.units;

    switch (event.type) {
      case 'round': {
        const label = document.getElementById('b-round');
        if (label) {
          label.textContent = 'ROUND ' + event.n;
          label.classList.remove('pulse');
          void label.offsetWidth;
          label.classList.add('pulse');
        }
        break;
      }

      case 'act': {
        const actor = units[event.actor];
        if (actor && actor.el) {
          actor.el.classList.add(event.side === 'squad' ? 'lunge-up' : 'lunge-down');
          setTimeout(() => actor.el && actor.el.classList.remove('lunge-up', 'lunge-down'), 320);
        }

        if (event.kind === 'ability') {
          say(`${actor ? actor.name : ''} — ${event.ability}`, event.side);
          Sfx.play('ability');
        }

        let biggestCrit = 0;
        event.hits.forEach(hit => {
          const target = units[hit.id];
          if (!target) return;

          if (hit.dmg !== undefined) {
            target.hp = Math.max(0, target.hp - hit.dmg);
            if (hit.absorbed) target.shield = Math.max(0, target.shield - hit.absorbed);
            floater(target, '-' + Math.round(hit.dmg), hit.crit ? 'crit' : 'dmg');
            if (target.el) {
              target.el.classList.add('struck');
              setTimeout(() => target.el && target.el.classList.remove('struck'), 260);
            }
            if (hit.crit) biggestCrit = 2;
          }
          if (hit.heal) {
            target.hp = Math.min(target.maxHp, target.hp + hit.heal);
            floater(target, '+' + Math.round(hit.heal), 'heal');
          }
          if (hit.shield) {
            target.shield += hit.shield;
            floater(target, '+' + Math.round(hit.shield), 'shield');
          }
          if (hit.buff) floater(target, 'ATK UP', 'buff');
          paintBars(target);
        });

        if (event.kind === 'ability' && event.effect === 'mend') Sfx.play('heal');
        else if (event.kind === 'ability' && event.effect === 'ward') Sfx.play('shield');
        else if (biggestCrit) { Sfx.play('crit'); shake(2); }
        else if (event.hits.some(h => h.dmg)) { Sfx.play('hit'); shake(1); }
        break;
      }

      case 'ko': {
        const unit = units[event.id];
        if (unit && unit.el) unit.el.classList.add('down');
        say(`${event.name} is down`, event.side === 'squad' ? 'bad' : 'good');
        Sfx.play('ko');
        break;
      }

      case 'end':
        finish(event);
        break;
    }
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

  function step() {
    if (!state) return;
    if (state.index >= state.events.length) return;

    const event = state.events[state.index++];
    applyEvent(event);

    if (event.type === 'end') return;

    const delay = (STEP[event.type] || 400) / state.speed;
    timer = setTimeout(step, delay);
  }

  /** Fast-forward: apply everything left with no animation. */
  function skip() {
    if (!state) return;
    clearTimeout(timer);
    while (state.index < state.events.length) {
      const event = state.events[state.index++];
      if (event.type === 'end') { finish(event); return; }
      // Apply state changes silently so the bars end up correct.
      if (event.type === 'act') {
        event.hits.forEach(hit => {
          const target = state.units[hit.id];
          if (!target) return;
          if (hit.dmg !== undefined) target.hp = Math.max(0, target.hp - hit.dmg);
          if (hit.heal) target.hp = Math.min(target.maxHp, target.hp + hit.heal);
          if (hit.shield) target.shield += hit.shield;
          paintBars(target);
        });
      }
      if (event.type === 'ko') {
        const unit = state.units[event.id];
        if (unit && unit.el) unit.el.classList.add('down');
      }
    }
  }

  function cycleSpeed() {
    if (!state) return;
    state.speed = state.speed >= 3 ? 1 : state.speed + 1;
    const button = document.getElementById('b-speed');
    if (button) button.textContent = state.speed + '×';
  }

  function finish(event) {
    const stage = document.getElementById('battle');
    if (stage) {
      const banner = document.createElement('div');
      banner.className = 'battle-verdict ' + (event.won ? 'win' : 'loss');
      banner.textContent = event.won ? 'SECTOR CLEAR' : 'FALL BACK';
      stage.appendChild(banner);
    }
    Sfx.play(event.won ? 'victory' : 'defeat');

    const done = state.onDone;
    const result = state.result;
    state = null;
    setTimeout(() => done(result), 1200);
  }

  /* ---------------- entry point ---------------- */

  /** Play a resolved battle, then hand the result back to the caller. */
  function play(node, result, onDone) {
    state = {
      result,
      events: result.events,
      index: 1,                       // event 0 is the roster snapshot
      speed: State.get().settings.battleSpeed || 1,
      units: build(node, result),
      onDone
    };
    const button = document.getElementById('b-speed');
    if (button) button.textContent = state.speed + '×';
    timer = setTimeout(step, 500);
  }

  function handleAction(action) {
    if (action === 'battle-skip') { skip(); return true; }
    if (action === 'battle-speed') {
      cycleSpeed();
      State.setSetting('battleSpeed', state ? state.speed : 1);
      return true;
    }
    return false;
  }

  const isRunning = () => !!state;

  return { play, handleAction, isRunning };
})();
