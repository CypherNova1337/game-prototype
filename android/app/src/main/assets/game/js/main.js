/* ------------------------------------------------------------------
 * main.js — boot.
 * ------------------------------------------------------------------ */

(function boot() {

  /**
   * Anything that stops the game from starting gets painted on screen with
   * enough detail to act on. A silent black screen is the one failure mode
   * that cannot be reported from a phone.
   */
  function fatal(what, err) {
    try {
      const detail = [
        what,
        err && (err.stack || err.message || String(err)),
        'engine: ' + (navigator.userAgent || 'unknown'),
        'storage: ' + (window.NovaSave ? 'device vault' : 'browser'),
        'viewport: ' + window.innerWidth + ' x ' + window.innerHeight
      ].filter(Boolean).join('\n\n');

      const panel = document.createElement('div');
      panel.id = 'fatal';
      const title = document.createElement('h1');
      title.textContent = 'NOVA DRIFT FAILED TO START';
      const pre = document.createElement('pre');
      pre.textContent = detail;          // textContent, never innerHTML
      panel.appendChild(title);
      panel.appendChild(pre);
      document.body.appendChild(panel);
    } catch (nested) {
      console.error('fatal handler failed', nested);
    }
    console.error(what, err);
  }

  window.addEventListener('error', ev => fatal('Unhandled error', ev.error || ev.message));
  window.addEventListener('unhandledrejection', ev => fatal('Unhandled rejection', ev.reason));

  function firstRunGrant() {
    const save = State.get();
    if (Object.keys(save.heroes).length > 0) return;

    // A starter four so the first sector is playable before any summon:
    // an attacker, a defender, a healer and a body.
    ['rook', 'picker', 'medtech', 'plating'].forEach(id => State.addHero(id));
    State.autoTeam();

    // One piece of gear each, so the equip screen is not an empty room.
    ['weapon', 'helmet', 'chest', 'boots'].forEach((slot, i) => {
      const item = Gear.create({ slot, rarity: 'common', tier: 1, set: i < 2 ? 'life' : 'offense' });
      State.addGear(item);
      const heroId = State.get().team[i];
      if (heroId) State.equipGear(heroId, item.id);
    });

    State.pushLog('Drifter registered. Four champions assigned.', 'info');
  }

  function applyAudioSettings() {
    const settings = State.get().settings;
    Sfx.setEnabled('sfx', settings.sfx !== false);
    // Music waits for the first tap: browsers hold the audio clock until
    // a gesture, so starting here would be silently dropped.
    Sfx.setEnabled('music', settings.music !== false);
    document.body.addEventListener('pointerdown', function once() {
      Sfx.unlock();
      if (State.get().settings.music !== false) Sfx.startMusic();
      document.body.removeEventListener('pointerdown', once);
    });
  }

  function clearBootScreen() {
    const boot = document.getElementById('boot');
    if (boot && boot.parentNode) boot.parentNode.removeChild(boot);
  }

  function ready() {
    State.load()
      .then(() => {
        firstRunGrant();
        Cosmetics.apply();
        State.collectSupporter();
        applyAudioSettings();
        UI.bind();
        UI.render();
        clearBootScreen();
      })
      .catch(err => {
        clearBootScreen();
        fatal('Save could not be loaded', err);
      });
  }

  // Keep the save current when the app is backgrounded or killed.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      State.flush();
      Sfx.stopMusic();
    } else {
      State.tickFuel();
      State.collectSupporter();
      if (State.get().settings.music !== false) Sfx.startMusic();
      UI.render();
    }
  });

  window.addEventListener('pagehide', () => State.flush());

  // Exposed for MainActivity's hardware back-button bridge.
  window.Nova = {
    handleBack: () => UI.handleBack(),
    version: '0.3.0'
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
