/* ------------------------------------------------------------------
 * store.js — the shop, and the rule it exists under.
 *
 * Nothing sold here changes a number that decides a fight. The catalogue
 * is cosmetics, a pass whose gameplay rewards are all on the free track,
 * and chronite — which is earned freely by playing and only ever buys
 * summons that the campaign also pays for.
 *
 * No payment processor is wired up. Commerce is a stub with the real
 * shape a Play Billing integration would need, so the seam is already in
 * the right place; see docs/SECURITY.md for what has to be true before
 * it handles money (server-side receipt validation, entitlements the
 * client cannot mint).
 * ------------------------------------------------------------------ */

const Commerce = (() => {
  const PROVIDER = {
    id: 'prototype-stub',
    live: false,
    notice: 'PROTOTYPE STORE — no payment is processed and nothing is charged.'
  };

  /**
   * Stands in for a billing flow. A real one would launch the platform
   * purchase sheet, receive a signed receipt, and hand it to the server
   * for validation before anything is granted. The client granting its
   * own entitlement, as here, is exactly what must not survive contact
   * with real money.
   */
  function purchase(sku) {
    return new Promise(resolve => {
      setTimeout(() => resolve({
        ok: true,
        sku: sku.id,
        receipt: { provider: PROVIDER.id, at: Date.now(), validated: false }
      }), 320);
    });
  }

  return { PROVIDER, purchase };
})();

const Store = (() => {

  /** Has this catalogue entry already been bought? */
  function isOwned(entry) {
    switch (entry.kind) {
      case 'theme':  return State.owns('themes', entry.ref);
      case 'sigils': return entry.ref.every(r => State.owns('sigils', r));
      case 'titles': return entry.ref.every(r => State.owns('titles', r));
      case 'pass':   return State.get().entitlements.passPremium;
      case 'supporter': return State.get().entitlements.supporter;
      default: return false;   // currency packs are repeatable
    }
  }

  /** Applies what an entry grants. Called only after Commerce resolves. */
  function fulfil(entry) {
    const save = State.get();
    switch (entry.kind) {
      case 'theme':
        State.grantCosmetic('themes', entry.ref);
        State.setCosmetic('theme', entry.ref);
        Cosmetics.apply();
        break;
      case 'sigils':
        entry.ref.forEach(r => State.grantCosmetic('sigils', r));
        break;
      case 'titles':
        entry.ref.forEach(r => State.grantCosmetic('titles', r));
        break;
      case 'chronite':
        State.grant('chronite', entry.amount);
        break;
      case 'pass':
        save.entitlements.passPremium = true;
        break;
      case 'supporter':
        save.entitlements.supporter = true;
        State.grantCosmetic('titles', 'founder');
        break;
    }
    save.stats.spent += entry.price || 0;
    State.save();
  }

  function buy(entry) {
    return Commerce.purchase(entry).then(result => {
      if (!result.ok) return { ok: false };
      fulfil(entry);
      State.pushLog(`Store: ${entry.name}`, 'info');
      return { ok: true, entry };
    });
  }

  /** Flat list of everything on sale, in the order the screen shows it. */
  function catalogue() {
    return [
      Object.assign({ kind: 'pass' }, STORE.pass),
      Object.assign({ kind: 'supporter' }, STORE.supporter)
    ].concat(STORE.cosmetics, STORE.currency);
  }

  return { catalogue, isOwned, buy, fulfil };
})();

/* ------------------------------------------------------------------
 * Cosmetics — applying what the player has equipped.
 * ------------------------------------------------------------------ */

const Cosmetics = (() => {

  /** Writes the equipped theme's tokens onto the document root. */
  function apply() {
    const save = State.get();
    const theme = THEMES[save.cosmetics.theme] || THEMES.drift;
    const root = document.documentElement;

    // Clear anything a previous theme set, so switching back is clean.
    Object.keys(THEMES).forEach(id => {
      Object.keys(THEMES[id].vars).forEach(v => root.style.removeProperty(v));
    });
    Object.keys(theme.vars).forEach(v => root.style.setProperty(v, theme.vars[v]));
  }

  function sigil() {
    const save = State.get();
    return SIGILS[save.cosmetics.sigil] || SIGILS.nova;
  }

  function title() {
    const save = State.get();
    return TITLES[save.cosmetics.title] || TITLES.drifter;
  }

  /** Everything the player owns in a slot, for the equip screen. */
  function ownedIn(slot) {
    const table = slot === 'theme' ? THEMES : slot === 'sigil' ? SIGILS : TITLES;
    const bucket = slot === 'theme' ? 'themes' : slot === 'sigil' ? 'sigils' : 'titles';
    return Object.keys(table).filter(id => table[id].free || State.owns(bucket, id));
  }

  return { apply, sigil, title, ownedIn };
})();
