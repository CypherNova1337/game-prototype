/* ------------------------------------------------------------------
 * main.js — boot.
 * ------------------------------------------------------------------ */

(function boot() {

  function firstRunGrant() {
    const save = State.get();
    if (Object.keys(save.inventory).length > 0) return;

    // A starter kit so DEPLOY is usable before the first summon.
    ['op_rook', 'wep_m4x', 'gear_scout'].forEach(id => State.addItem(id));
    State.autoSquad();
    State.pushLog('Drifter registered. Standard kit issued.', 'info');
  }

  function ready() {
    State.load().then(() => {
      firstRunGrant();
      UI.bind();
      UI.render();
    });
  }

  // Keep the save current when the app is backgrounded or killed.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      State.flush();
    } else {
      State.tickFuel();
      UI.render();
    }
  });

  window.addEventListener('pagehide', () => State.flush());

  // Exposed for MainActivity's hardware back-button bridge.
  window.Nova = {
    handleBack: () => UI.handleBack(),
    version: '0.1.0'
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
