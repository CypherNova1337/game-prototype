/* ------------------------------------------------------------------
 * storage.js — the save layer.
 *
 * Writes go to the native SaveVault when the app provides it: the save
 * then lives in app-private storage signed with a non-extractable device
 * key, so an edited save is rejected on load instead of trusted. In a
 * plain browser (the dev harness) it falls back to localStorage, which is
 * fine for testing and trusted no further than any other client data.
 *
 * The read/write surface is shaped like a remote storage engine on
 * purpose — collection, key, value, version — so moving the save to a
 * server later means rewriting this file and nothing else.
 * ------------------------------------------------------------------ */

const Storage = (() => {
  const FALLBACK_KEY = 'nova::store';

  const vault = (() => {
    try {
      const v = window.NovaSave;
      return v && typeof v.read === 'function' && typeof v.write === 'function' ? v : null;
    } catch (err) {
      return null;
    }
  })();

  let cache = null;   // { "collection::key": record }

  function loadAll() {
    if (cache) return cache;
    let raw = '';
    try {
      raw = vault ? vault.read() : (window.localStorage.getItem(FALLBACK_KEY) || '');
    } catch (err) {
      console.warn('[storage] read blocked:', err && err.message);
    }
    try {
      cache = raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.warn('[storage] unreadable store, starting clean');
      cache = {};
    }
    if (typeof cache !== 'object' || cache === null || Array.isArray(cache)) cache = {};
    return cache;
  }

  function persist() {
    const blob = JSON.stringify(cache);
    try {
      if (vault) return vault.write(blob);
      window.localStorage.setItem(FALLBACK_KEY, blob);
      return true;
    } catch (err) {
      console.warn('[storage] write failed:', err && err.message);
      return false;
    }
  }

  const id = (collection, key) => collection + '::' + key;

  /** Read one storage object. Resolves to null when nothing is written yet. */
  function read(collection, key) {
    return Promise.resolve(loadAll()[id(collection, key)] || null);
  }

  /** Write one storage object. `value` is any JSON-serialisable payload. */
  function write(collection, key, value) {
    const record = { collection, key, value, version: Date.now() };
    loadAll()[id(collection, key)] = record;
    persist();
    return Promise.resolve(record);
  }

  function remove(collection, key) {
    delete loadAll()[id(collection, key)];
    persist();
    return Promise.resolve();
  }

  /** Wipe everything, including the native file when there is one. */
  function clearAll() {
    cache = {};
    try {
      if (vault && typeof vault.wipe === 'function') vault.wipe();
      else window.localStorage.removeItem(FALLBACK_KEY);
    } catch (err) {
      console.warn('[storage] wipe failed:', err && err.message);
    }
    return Promise.resolve();
  }

  /** Human-readable backing store, shown in the diagnostics panel. */
  function backend() {
    if (!vault) return 'browser storage (dev)';
    try {
      return typeof vault.backend === 'function' ? vault.backend() : 'device keystore';
    } catch (err) {
      return 'device keystore';
    }
  }

  return { read, write, remove, clearAll, backend, secured: !!vault };
})();
