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
    if (Object.keys(save.inventory).length > 0) return;

    // A starter kit so DEPLOY is usable before the first summon.
    ['op_rook', 'wep_m4x', 'gear_scout'].forEach(id => State.addItem(id));
    State.autoSquad();
    State.pushLog('Drifter registered. Standard kit issued.', 'info');
  }

  function clearBootScreen() {
    const boot = document.getElementById('boot');
    if (boot && boot.parentNode) boot.parentNode.removeChild(boot);
  }

  function ready() {
    State.load()
      .then(() => {
        firstRunGrant();
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
    } else {
      State.tickFuel();
      UI.render();
    }
  });

  window.addEventListener('pagehide', () => State.flush());

  // Exposed for MainActivity's hardware back-button bridge.
  window.Nova = {
    handleBack: () => UI.handleBack(),
    version: '0.1.1'
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    ready();
  }
})();
