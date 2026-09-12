/* ------------------------------------------------------------------
 * storage.js — the save layer.
 *
 * Deliberately shaped like a Nakama storage engine: reads and writes go
 * through collection / key / value records and return promises, so the
 * body of the game never touches localStorage directly. Swapping this
 * file for real Nakama calls should not require touching state.js.
 * ------------------------------------------------------------------ */

const Storage = (() => {
  const PREFIX = 'nova::';

  function recordKey(collection, key) {
    return PREFIX + collection + '::' + key;
  }

  /** Read one storage object. Resolves to null when nothing is written yet. */
  function read(collection, key) {
    return new Promise(resolve => {
      let raw = null;
      try {
        raw = window.localStorage.getItem(recordKey(collection, key));
      } catch (err) {
        console.warn('[storage] read blocked', err);
      }
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        console.warn('[storage] corrupt record, discarding', collection, key, err);
        resolve(null);
      }
    });
  }

  /** Write one storage object. `value` is any JSON-serialisable payload. */
  function write(collection, key, value) {
    return new Promise(resolve => {
      const record = {
        collection,
        key,
        value,                       // Nakama keeps this as a string; we keep the object
        version: Date.now()
      };
      try {
        window.localStorage.setItem(recordKey(collection, key), JSON.stringify(record));
        resolve(record);
      } catch (err) {
        console.warn('[storage] write failed', err);
        resolve(null);
      }
    });
  }

  function remove(collection, key) {
    return new Promise(resolve => {
      try {
        window.localStorage.removeItem(recordKey(collection, key));
      } catch (err) {
        console.warn('[storage] delete failed', err);
      }
      resolve();
    });
  }

  return { read, write, remove };
})();
