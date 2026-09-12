/* ------------------------------------------------------------------
 * ui.js — every screen, slot and overlay.
 *
 * Screens render as HTML strings into #screen and are driven by
 * delegated clicks on [data-act], so nothing needs re-binding after a
 * repaint. The battle screen is the exception: it owns its own DOM and
 * mutates it in place (see battle.js).
 * ------------------------------------------------------------------ */

const UI = (() => {

  const screenEl = document.getElementById('screen');
  const hudEl = document.getElementById('hud');
  const navEl = document.getElementById('nav');
  const overlayEl = document.getElementById('overlay');
  const toastEl = document.getElementById('toast');

  let current = 'campaign';
  let armoryFilter = 'ALL';
  let pendingSquadSlot = null;
  let storeTab = 'pass';

  /* ---------------- helpers ---------------- */

  const icon = (id, cls) => `<svg class="${cls || ''}"><use href="#${id}"></use></svg>`;
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const esc = s => String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = n => '$' + n.toFixed(2);

  /** Inline custom properties for a rarity or faction accent. */
  function accent(def, extra) {
    return `--r:${def.color};--edge:${def.edge || def.color};`
         + `--tint:${def.tint || 'transparent'};--glow:${def.glow || def.color};`
         + (extra || '');
  }

  function stars(n, of) {
    const total = of || n;
    let out = '<span class="stars">';
    for (let i = 0; i < total; i++) out += icon('ic-star', i < n ? 'on' : '');
    return out + '</span>';
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 1700);
  }

  function timeLeft(ms) {
    const total = Math.ceil(ms / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  function engineName() {
    const ua = navigator.userAgent || '';
    const chrome = ua.match(/Chrome\/(\d+)/);
    const android = ua.match(/Android (\d+)/);
    return (chrome ? 'WebView ' + chrome[1] : 'unknown engine')
         + (android ? ' · Android ' + android[1] : '');
  }

  const supports = (prop, value) =>
    !!(window.CSS && CSS.supports && CSS.supports(prop, value));

  /* ---------------- HUD + nav ---------------- */

  function renderHUD() {
    const save = State.get();
    const w = save.wallet;
    const fuelNext = State.msToNextFuel();
    hudEl.innerHTML = `
      <div class="brand"><b>NOVA</b><span>DRIFT</span></div>
      <div class="wallet">
        <div class="cur fuel">${icon('ic-fuel')}<b class="num">${save.fuel.amount}</b>
          <i>${fuelNext ? timeLeft(fuelNext) : '/' + ECONOMY.fuelCap}</i></div>
        <div class="cur shard">${icon('ic-shard')}<b class="num">${fmt(w.shards)}</b></div>
        <div class="cur scrap">${icon('ic-scrap')}<b class="num">${fmt(w.scrap)}</b></div>
        <div class="cur chron">${icon('ic-chronite')}<b class="num">${fmt(w.chronite)}</b></div>
      </div>`;
  }

  const TABS = [
    { id: 'campaign', label: 'DEPLOY', icon: 'ic-deploy' },
    { id: 'summon',   label: 'SUMMON', icon: 'ic-summon' },
    { id: 'armory',   label: 'ARMORY', icon: 'ic-armory' },
    { id: 'store',    label: 'STORE',  icon: 'ic-chronite' },
    { id: 'system',   label: 'SYSTEM', icon: 'ic-system' }
  ];

  function renderNav() {
    navEl.innerHTML = TABS.map(t => {
      const alert = t.id === 'campaign' && (State.loginClaimable() || anyQuestReady());
      return `
        <button class="nav-btn ${t.id === current ? 'active' : ''}" data-act="tab" data-tab="${t.id}">
          ${icon(t.icon)}<span>${t.label}</span>
          ${alert ? '<i class="dot"></i>' : ''}
        </button>`;
    }).join('');
  }

  function anyQuestReady() {
    return QUESTS.some(q => State.questClaimable(q.id));
  }

  /* ---------------- item slot ---------------- */

  /** One inventory tile. The prototype's WBP_ItemSlot. */
  function slotHTML(itemId, opts) {
    opts = opts || {};
    if (!itemId) {
      return `<button class="slot empty" ${opts.attrs || ''}><span class="small dim">EMPTY</span></button>`;
    }
    const row = getItemRow(itemId);
    const entry = State.getEntry(itemId);
    const rarity = RARITY[row.rarity];
    return `
      <button class="slot" style="${accent(rarity)}" ${opts.attrs || ''}>
        ${icon(row.icon, 'glyph')}
        ${entry && entry.level > 1 ? `<span class="lv">LV${entry.level}</span>` : ''}
        ${entry && entry.copies > 1 ? `<span class="copies">×${entry.copies}</span>` : ''}
      </button>`;
  }

  /* ---------------- screen: CAMPAIGN ---------------- */

  function screenCampaign() {
    const save = State.get();
    const sigil = Cosmetics.sigil();

    const squadHTML = save.squad.map((itemId, i) => {
      const row = itemId ? getItemRow(itemId) : null;
      return `<div>
        ${slotHTML(itemId, { attrs: `data-act="pick-squad" data-slot="${i}"` })}
        <div class="squad-name">${row ? esc(row.name) : 'SELECT'}</div>
      </div>`;
    }).join('');

    const next = State.nextNode();

    const chaptersHTML = CHAPTERS.map(chapter => {
      const faction = FACTION[chapter.faction];
      const earned = chapter.nodes.reduce((sum, n) => sum + State.starsOn(n.id), 0);
      const open = chapter.nodes.some(n => State.isUnlocked(n.id));

      const nodesHTML = chapter.nodes.map((node, i) => {
        const unlocked = State.isUnlocked(node.id);
        const got = State.starsOn(node.id);
        return `
          <button class="node ${unlocked ? '' : 'locked'} ${node.boss ? 'boss' : ''}
                   ${node.id === next.id ? 'next' : ''}"
                  data-act="${unlocked ? 'node' : 'locked-node'}" data-id="${node.id}">
            <span class="idx">${unlocked ? i + 1 : '🔒'}</span>
            <span class="body">
              <b>${esc(node.name)}${node.boss ? ' — BOSS' : ''}</b>
              <span>PWR ${fmt(Campaign.recommendedPower(node))} · ${node.fuel} fuel · ${node.comp.length} hostiles</span>
            </span>
            <span class="nstars">${stars(got, 3)}</span>
          </button>`;
      }).join('');

      return `
        <section class="chapter" style="${accent(faction)}" ${open ? '' : 'hidden'}>
          <div class="chapter-head">
            <span class="chapter-stars">${earned}/15 ★</span>
            <h2>${esc(chapter.name)}</h2>
            <p>${esc(chapter.blurb)}</p>
          </div>
          ${nodesHTML}
        </section>`;
    }).join('');

    return `
      ${State.loginClaimable() ? `
        <button class="btn gold" data-act="claim-login" style="margin-bottom:12px">
          ${icon('ic-chronite')} COLLECT DAILY — ${DAILY_LOGIN.chronite} CHRONITE + ${DAILY_LOGIN.fuel} FUEL
        </button>` : ''}

      <section class="panel">
        <div class="title">STRIKE TEAM
          <span class="sigil-badge" style="margin-left:auto">${icon(sigil.icon)}${esc(sigil.name)}</span>
        </div>
        <div class="squad">${squadHTML}</div>
        <div class="power-readout">
          <span class="small dim">SQUAD POWER</span>
          <b class="num">${fmt(State.squadPower(null))}</b>
          <button class="btn ghost" style="width:auto;padding:7px 12px" data-act="auto-squad">AUTO</button>
        </div>
      </section>

      <section class="panel">
        <div class="title">DAILY CONTRACTS <span class="muted">resets at midnight</span></div>
        ${QUESTS.map(q => {
          const done = State.questProgress(q.id);
          const ready = State.questClaimable(q.id);
          const claimed = State.get().quests.claimed.indexOf(q.id) !== -1;
          const reward = q.reward.chronite ? `${q.reward.chronite} chronite`
                       : q.reward.shards ? `${q.reward.shards} shards`
                       : `${q.reward.scrap} scrap`;
          return `
            <div class="contract">
              <div class="info">
                <b>${esc(q.text)}</b>
                <div class="prog"><i style="width:${Math.min(100, (done / q.goal) * 100)}%"></i></div>
              </div>
              <button class="claim ${ready ? 'ready' : ''}" data-act="claim-quest" data-id="${q.id}"
                ${ready ? '' : 'disabled'}>${claimed ? 'DONE' : ready ? 'CLAIM' : `${done}/${q.goal}`}</button>
            </div>`;
        }).join('')}
        <p class="small dim" style="margin:10px 0 0">${esc('Rewards: ' + QUESTS.map(q =>
          q.reward.chronite ? q.reward.chronite + ' chronite'
          : q.reward.shards ? q.reward.shards + ' shards'
          : q.reward.scrap + ' scrap').join(' · '))}</p>
      </section>

      ${chaptersHTML}`;
  }

  /* ---------------- screen: SUMMON ---------------- */

  function screenSummon() {
    const save = State.get();
    const feature = getItemRow(BANNER.featured);
    const chance = Gacha.legendaryChance(save.pity.sinceLegendary);
    const pityPct = Math.min(100, (save.pity.sinceLegendary / BANNER.pity.hard) * 100);

    const rate = r => `
      <div class="rate-row" style="${accent(RARITY[r])}">
        <span class="k">${RARITY[r].label}</span>
        <span class="num dim">${(RARITY[r].weight * 100).toFixed(1)}%</span>
      </div>`;

    const canSingle = save.wallet.chronite >= BANNER.costSingle;
    const canMulti = save.wallet.chronite >= BANNER.costMulti;

    return `
      <section class="banner">
        <div class="rays"></div>
        <div class="copy">
          <h1>${esc(BANNER.name)}</h1>
          <p>${esc(BANNER.subtitle)}</p>
          <div class="li">
            ASCENDANT rate-up 50%<br>
            Guaranteed ENHANCED+ every ${BANNER.pity.rareFloorEvery}<br>
            Guaranteed ASCENDANT at ${BANNER.pity.hard}
          </div>
        </div>
        ${icon(feature.icon, 'feature')}
      </section>

      <section class="panel">
        <div class="title">DROP RATES</div>
        ${RARITY_ORDER.map(rate).join('')}
        <div class="pity-wrap">
          <div class="rate-row">
            <span class="dim small">PITY ${save.pity.sinceLegendary} / ${BANNER.pity.hard}</span>
            <span class="dim small num">CURRENT ASCENDANT ${(chance * 100).toFixed(1)}%</span>
          </div>
          <div class="pity-bar"><i style="width:${pityPct}%"></i></div>
        </div>
      </section>

      <div class="btn-row">
        <button class="btn" data-act="pull" data-n="1" ${canSingle ? '' : 'disabled'}>
          ${icon('ic-chronite')} 1× &nbsp;${fmt(BANNER.costSingle)}
        </button>
        <button class="btn gold" data-act="pull" data-n="10" ${canMulti ? '' : 'disabled'}>
          ${icon('ic-chronite')} 10× &nbsp;${fmt(BANNER.costMulti)}
        </button>
      </div>
      ${canSingle ? '' : '<p class="empty-note small">Out of chronite — run a sector or claim your contracts.</p>'}

      <section class="panel" style="${accent(RARITY[feature.rarity], 'margin-top:12px')}">
        <div class="title">RATE-UP DOSSIER</div>
        <div class="detail-head">
          <div class="detail-icon">${icon(feature.icon)}</div>
          <div style="min-width:0">
            <h2 style="font-size:15px">${esc(feature.name)}</h2>
            <div class="sub">${RARITY[feature.rarity].label} · ${feature.type}</div>
            ${stars(RARITY[feature.rarity].stars)}
            <div class="small dim" style="margin-top:6px">
              ${State.owned(BANNER.featured)
                ? 'IN ARMORY · LV' + State.getEntry(BANNER.featured).level
                : 'NOT YET ACQUIRED'}
            </div>
          </div>
        </div>
        <p class="trait">${esc(feature.trait)}</p>
      </section>`;
  }

  /* ---------------- screen: ARMORY ---------------- */

  function screenArmory() {
    const ids = State.inventoryIds()
      .filter(id => armoryFilter === 'ALL' || getItemRow(id).type === armoryFilter);

    const chips = ['ALL', 'OPERATIVE', 'WEAPON', 'GEAR'].map(f =>
      `<button class="chip ${f === armoryFilter ? 'on' : ''}" data-act="filter" data-f="${f}">${f}</button>`
    ).join('');

    const body = ids.length
      ? `<div class="grid">${ids.map(id =>
          slotHTML(id, { attrs: `data-act="detail" data-id="${id}"` })).join('')}</div>`
      : '<div class="empty-note">Nothing here yet.<br>Summon on the DRIFT PROTOCOL banner to stock the armory.</div>';

    return `
      <div class="title">ARMORY <span class="muted">${State.inventoryIds().length}/${ITEMS.length} CATALOGUED</span></div>
      <div class="chips">${chips}</div>
      <section class="panel">${body}</section>`;
  }

  /* ---------------- screen: STORE ---------------- */

  function screenStore() {
    const save = State.get();
    const tabs = [['pass', 'DRIFT PASS'], ['shop', 'SHOP'], ['looks', 'APPEARANCE']]
      .map(([id, label]) =>
        `<button class="chip ${storeTab === id ? 'on' : ''}" data-act="store-tab" data-t="${id}">${label}</button>`
      ).join('');

    return `
      <div class="store-notice">${esc(Commerce.PROVIDER.notice)}</div>
      <div class="chips">${tabs}</div>
      ${storeTab === 'pass' ? passSection()
        : storeTab === 'shop' ? shopSection()
        : appearanceSection()}`;
  }

  function passSection() {
    const save = State.get();
    const premium = save.entitlements.passPremium;
    const pct = (save.pass.xp / PASS.xpPerLevel) * 100;

    const rows = [];
    for (let lv = 1; lv <= PASS.levels; lv++) {
      const free = PASS.reward(lv, false);
      const prem = PASS.reward(lv, true);
      const freeState = State.passClaimable(lv, false) ? 'ready'
        : save.pass.claimedFree.indexOf(lv) !== -1 ? 'claimed'
        : lv > save.pass.level ? 'locked' : '';
      const premState = !premium ? 'locked'
        : State.passClaimable(lv, true) ? 'ready'
        : save.pass.claimedPremium.indexOf(lv) !== -1 ? 'claimed'
        : lv > save.pass.level ? 'locked' : '';
      rows.push(`
        <div class="tier premium-row">
          <span class="lv">${lv}</span>
          <button class="reward ${freeState}" data-act="claim-pass" data-lv="${lv}" data-prem="0"
            ${freeState === 'ready' ? '' : 'disabled'}>${esc(free.label)}</button>
          <button class="reward prem ${premState}" data-act="claim-pass" data-lv="${lv}" data-prem="1"
            ${premState === 'ready' ? '' : 'disabled'}>${esc(prem.label)}</button>
        </div>`);
    }

    return `
      <section class="panel">
        <div class="title">DRIFT PASS <span class="muted">free track · premium track</span></div>
        <div class="pass-head">
          <span class="small dim">LEVEL</span><b>${save.pass.level}</b>
          <span class="small dim">${save.pass.xp} / ${PASS.xpPerLevel} XP</span>
        </div>
        <div class="pass-xp"><i style="width:${pct}%"></i></div>
        <div class="fairplay">
          <b>HOW THIS WORKS</b>
          Pass levels come from playing — every battle pays XP. The free track
          pays out at every single level and contains all of the chronite,
          scrap and shards. The premium track adds cosmetics on top. Nothing
          on either track makes your squad stronger than the other.
        </div>
        ${premium ? '' : `
          <div class="product">
            <div class="info">
              <b>${esc(STORE.pass.name)}</b>
              <span>${esc(STORE.pass.blurb)}</span>
            </div>
            <button class="buy" data-act="buy" data-id="pass_premium">${money(STORE.pass.price)}</button>
          </div>`}
        ${rows.join('')}
      </section>`;
  }

  function shopSection() {
    const entries = Store.catalogue().filter(e => e.kind !== 'pass');
    const product = entry => {
      const owned = Store.isOwned(entry);
      const label = entry.kind === 'chronite' ? `+${fmt(entry.amount)}` : '';
      return `
        <div class="product">
          <div class="info">
            <b>${esc(entry.name)} ${label}</b>
            <span>${esc(entry.blurb || '')}</span>
            ${entry.tag ? `<span class="tag">${esc(entry.tag)}</span>` : ''}
          </div>
          <button class="buy ${owned ? 'owned' : ''}" data-act="buy" data-id="${entry.id}"
            ${owned ? 'disabled' : ''}>${owned ? 'OWNED' : money(entry.price)}</button>
        </div>`;
    };

    return `
      <div class="fairplay">
        <b>FAIR PLAY</b>
        Every item, every unit and every sector in this game is reachable
        without spending. Nothing here sells power, stats, or an exclusive
        unit. Chronite is earned by playing; buying it only skips waiting.
        There are no ads and no energy you can pay to refill.
      </div>
      <div class="title">COSMETICS</div>
      ${entries.filter(e => ['theme', 'sigils', 'titles', 'supporter'].indexOf(e.kind) !== -1).map(product).join('')}
      <div class="title">CHRONITE</div>
      ${entries.filter(e => e.kind === 'chronite').map(product).join('')}`;
  }

  function appearanceSection() {
    const save = State.get();

    const themeSwatch = id => {
      const theme = THEMES[id];
      const owned = theme.free || State.owns('themes', id);
      return `
        <button class="swatch ${save.cosmetics.theme === id ? 'on' : ''} ${owned ? '' : 'locked'}"
                data-act="equip" data-slot="theme" data-ref="${id}" title="${esc(theme.name)}">
          <i style="background:${theme.vars['--cyan']}"></i>
          <i style="background:${theme.vars['--magenta']}"></i>
          <i style="background:${theme.vars['--gold']}"></i>
        </button>`;
    };

    const sigilButton = id => {
      const owned = SIGILS[id].free || State.owns('sigils', id);
      return `
        <button class="swatch ${save.cosmetics.sigil === id ? 'on' : ''} ${owned ? '' : 'locked'}"
                data-act="equip" data-slot="sigil" data-ref="${id}">
          ${icon(SIGILS[id].icon, 'glyph')}
        </button>`;
    };

    const titleRow = id => {
      const owned = TITLES[id].free || State.owns('titles', id);
      return `
        <button class="chip ${save.cosmetics.title === id ? 'on' : ''}" data-act="equip"
                data-slot="title" data-ref="${id}" ${owned ? '' : 'disabled'}>
          ${esc(TITLES[id].name)}${owned ? '' : ' 🔒'}
        </button>`;
    };

    return `
      <section class="panel">
        <div class="title">PALETTE</div>
        <div class="swatches">${Object.keys(THEMES).map(themeSwatch).join('')}</div>
        <p class="small dim" style="margin:10px 0 0">
          ${esc(THEMES[save.cosmetics.theme].name)} equipped.
        </p>
      </section>
      <section class="panel">
        <div class="title">SQUAD SIGIL</div>
        <div class="swatches">${Object.keys(SIGILS).map(sigilButton).join('')}</div>
      </section>
      <section class="panel">
        <div class="title">CALLSIGN</div>
        <div class="chips">${Object.keys(TITLES).map(titleRow).join('')}</div>
      </section>`;
  }

  /* ---------------- screen: SYSTEM ---------------- */

  function screenSystem() {
    const save = State.get();
    const st = save.stats;
    const winRate = st.missionsRun ? Math.round((st.missionsWon / st.missionsRun) * 100) : 0;
    const line = (k, v) => `<div class="statline"><span class="dim">${k}</span><b class="num">${v}</b></div>`;
    const toggle = (label, key) => `
      <div class="toggle">
        <span>${label}</span>
        <button class="${save.settings[key] ? 'on' : ''}" data-act="toggle" data-key="${key}">
          ${save.settings[key] ? 'ON' : 'OFF'}
        </button>
      </div>`;

    return `
      <section class="panel">
        <div class="title">COMMANDER</div>
        <div class="statline"><span class="dim">CALLSIGN</span><b>${esc(Cosmetics.title().name)}</b></div>
        ${line('CAMPAIGN STARS', `${State.totalStars()} / ${ALL_NODES.length * 3}`)}
        ${line('SECTORS CLEARED', `${ALL_NODES.filter(n => State.isCleared(n.id)).length} / ${ALL_NODES.length}`)}
        ${line('BOSSES FELLED', fmt(st.bossesFelled))}
        ${line('PERFECT CLEARS', fmt(st.perfectClears))}
        ${line('PASS LEVEL', save.pass.level + ' / ' + PASS.levels)}
      </section>

      <section class="panel">
        <div class="title">SERVICE RECORD</div>
        ${line('SUMMONS PERFORMED', fmt(st.pulls))}
        ${line('ASCENDANTS PULLED', fmt(st.legendaries))}
        ${line('ITEMS CATALOGUED', `${State.inventoryIds().length} / ${ITEMS.length}`)}
        ${line('SECTORS RUN', fmt(st.missionsRun))}
        ${line('CLEAR RATE', winRate + '%')}
        ${line('PITY COUNTER', `${save.pity.sinceLegendary} / ${BANNER.pity.hard}`)}
      </section>

      <section class="panel">
        <div class="title">SETTINGS</div>
        ${toggle('Sound effects', 'sfx')}
        ${toggle('Ambient music', 'music')}
        <div class="toggle">
          <span>Battle speed</span>
          <button class="on" data-act="cycle-speed">${save.settings.battleSpeed || 1}×</button>
        </div>
      </section>

      <section class="panel">
        <div class="title">LOG</div>
        ${save.log.length
          ? save.log.map(l => `<div class="log-line ${l.tone}">${esc(l.text)}</div>`).join('')
          : '<div class="log-line">Empty.</div>'}
      </section>

      <section class="panel">
        <div class="title">DIAGNOSTICS</div>
        ${line('SAVE BACKEND', SaveStore.backend())}
        ${line('ENGINE', engineName())}
        ${line('VIEWPORT', window.innerWidth + ' × ' + window.innerHeight)}
        ${line('LAYOUT SUPPORT', supports('aspect-ratio', '1') ? 'full' : 'fallback')}
        <p class="small dim" style="line-height:1.7;margin:10px 0 0">
          Read this out if the game misbehaves on your device — it says which
          browser engine and storage the build is actually running on.
        </p>
      </section>

      <section class="panel">
        <div class="title">BUILD</div>
        <div class="statline"><span class="dim">VERSION</span><b>0.2.0 prototype</b></div>
        <div class="statline"><span class="dim">SAVE</span><b>${SaveStore.secured ? 'signed on device' : 'browser (dev)'}</b></div>
        <p class="small dim" style="line-height:1.7;margin:12px 0 14px">
          Progress is stored on this device only — there is no account and
          nothing leaves the phone. The store takes no payment.
        </p>
        <button class="btn danger" data-act="reset">WIPE SAVE DATA</button>
      </section>`;
  }

  /* ---------------- router ---------------- */

  const SCREENS = {
    campaign: screenCampaign,
    summon: screenSummon,
    armory: screenArmory,
    store: screenStore,
    system: screenSystem
  };

  function render() {
    State.tickFuel();
    State.ensureDaily();
    renderHUD();
    renderNav();
    screenEl.innerHTML = SCREENS[current]();
    screenEl.scrollTop = screenEl._scroll || 0;
  }

  function go(tab) {
    current = tab;
    screenEl._scroll = 0;
    render();
  }

  /* ---------------- overlays ---------------- */

  function openSheet(html) {
    overlayEl.innerHTML = `<div class="sheet">${html}</div>`;
    overlayEl.classList.remove('hidden');
  }

  function closeOverlay() {
    overlayEl.classList.add('hidden');
    overlayEl.innerHTML = '';
  }

  const isOverlayOpen = () => !overlayEl.classList.contains('hidden');

  /* -------- item detail -------- */

  function showDetail(itemId) {
    const row = getItemRow(itemId);
    const entry = State.getEntry(itemId);
    const rarity = RARITY[row.rarity];
    const cost = State.upgradeCost(itemId);
    const maxed = entry.level >= ECONOMY.levelCap;
    const can = State.canUpgrade(itemId);

    openSheet(`
      <div style="${accent(rarity)}">
        <div class="detail-head">
          <div class="detail-icon">${icon(row.icon)}</div>
          <div style="min-width:0">
            <h2>${esc(row.name)}</h2>
            <div class="sub">${rarity.label} · ${row.type}</div>
            ${stars(rarity.stars)}
          </div>
        </div>
        <p class="trait">${esc(row.trait)}</p>
        <div class="statline"><span class="dim">POWER</span><b>${fmt(State.getPower(itemId))}</b></div>
        <div class="statline"><span class="dim">LEVEL</span><b>${entry.level} / ${ECONOMY.levelCap}</b></div>
        <div class="statline"><span class="dim">ABILITY</span><b>${esc(row.ability.name)}</b></div>
        <div class="statline"><span class="dim">COOLDOWN</span><b>${row.ability.cd} rounds</b></div>
        <div class="statline"><span class="dim">ALLEGIANCE</span><b>${esc(FACTION[row.faction].name)}</b></div>
        <div class="statline"><span class="dim">COPIES HELD</span><b>${entry.copies}</b></div>
        <p class="trait">${esc(row.ability.note)}.</p>
        ${maxed
          ? '<button class="btn ghost" disabled>MAX LEVEL</button>'
          : `<button class="btn ${can ? '' : 'ghost'}" data-act="upgrade" data-id="${itemId}" ${can ? '' : 'disabled'}>
               UPGRADE &nbsp;${icon('ic-scrap')}${fmt(cost.scrap)} &nbsp;${icon('ic-shard')}${cost.shards}
             </button>`}
        <div style="height:10px"></div>
        <button class="btn ghost" data-act="close">CLOSE</button>
      </div>`);
  }

  /* -------- squad picker -------- */

  function showSquadPicker(slotIndex) {
    pendingSquadSlot = slotIndex;
    const ids = State.inventoryIds();
    openSheet(`
      <h2>ASSIGN SLOT ${slotIndex + 1}</h2>
      <div class="sub">SELECT A UNIT</div>
      ${ids.length
        ? `<div class="grid">${ids.map(id => {
              const row = getItemRow(id);
              return `<div>${slotHTML(id, { attrs: `data-act="assign" data-id="${id}"` })}
                      <div class="squad-name">${fmt(State.getPower(id))}</div>
                      <div class="squad-name" style="color:${FACTION[row.faction].color}">${esc(row.type)}</div>
                      </div>`;
            }).join('')}</div>`
        : '<div class="empty-note">Armory is empty. Summon something first.</div>'}
      <div style="height:12px"></div>
      <button class="btn ghost" data-act="clear-slot">CLEAR SLOT</button>
      <div style="height:8px"></div>
      <button class="btn ghost" data-act="close">CANCEL</button>`);
  }

  /* -------- node briefing -------- */

  function showBriefing(nodeId) {
    const node = getNode(nodeId);
    const faction = FACTION[node.faction];
    const save = State.get();
    const odds = Math.round(Campaign.forecast(node) * 100);
    const recommended = Campaign.recommendedPower(node);
    const power = State.squadPower(node.faction);
    const rewards = nodeRewards(node);
    const got = State.starsOn(node.id);

    const noSquad = !Campaign.squadReady();
    const noFuel = save.fuel.amount < node.fuel;

    const line = node.comp.map(id => {
      const enemy = ENEMIES[id];
      return `<div class="reward" style="${accent(FACTION[enemy.faction])}">
                ${icon(enemy.icon)} ${esc(enemy.name)}${enemy.boss ? ' <b>BOSS</b>' : ''}
              </div>`;
    }).join('');

    openSheet(`
      <div style="${accent(faction)}">
        <h2>${esc(node.name)}</h2>
        <div class="sub">${esc(faction.name)} · ${node.boss ? 'BOSS SECTOR' : 'SECTOR'}</div>
        <div class="statline"><span class="dim">RECOMMENDED POWER</span><b>${fmt(recommended)}</b></div>
        <div class="statline"><span class="dim">YOUR POWER</span>
          <b style="color:${power >= recommended ? 'var(--good)' : 'var(--bad)'}">${fmt(power)}</b></div>
        <div class="statline"><span class="dim">ESTIMATED ODDS</span><b>${odds}%</b></div>
        <div class="statline"><span class="dim">FUEL</span><b>${node.fuel}</b></div>
        <div class="statline"><span class="dim">BEST RESULT</span><b>${got}★ / 3★</b></div>
        <p class="trait">Matching allegiance grants +${Math.round(COMBAT.factionBonus * 100)}% power here.
          ${STAR_GOALS.map(g => g.label).join(' · ')}.</p>
        <div class="title">HOSTILE LINE</div>
        ${line}
        <div class="title">PAYOUT</div>
        <div class="statline"><span class="dim">SCRAP / CHRONITE</span><b>${fmt(rewards.scrap)} / ${fmt(rewards.chronite)}</b></div>
        <div class="statline"><span class="dim">PASS XP</span><b>${rewards.xp}</b></div>
        ${got === 0 ? `<div class="statline"><span class="dim">FIRST CLEAR BONUS</span><b>${fmt(rewards.firstClear)} chronite</b></div>` : ''}
        <div style="height:14px"></div>
        <button class="btn" data-act="run" data-id="${node.id}" ${noSquad || noFuel ? 'disabled' : ''}>
          ${noSquad ? 'ASSIGN A SQUAD FIRST' : noFuel ? 'NOT ENOUGH FUEL' : 'DEPLOY'}
        </button>
        <div style="height:8px"></div>
        <button class="btn ghost" data-act="close">ABORT</button>
      </div>`);
  }

  /* -------- after-action report -------- */

  function showReport(outcome) {
    const { battle, payout, node } = outcome;
    const faction = FACTION[node.faction];
    const dropRow = payout.drop ? getItemRow(payout.drop.itemId) : null;

    openSheet(`
      <div style="${accent(faction)}">
        <div class="verdict ${battle.won ? 'win' : 'loss'}">${battle.won ? 'SECTOR CLEAR' : 'FALL BACK'}</div>
        <p class="small dim" style="text-align:center;margin:0 0 10px">
          ${esc(node.name)} · ${battle.rounds} rounds · ${battle.losses} lost
        </p>
        ${battle.won ? `<div style="text-align:center;margin-bottom:12px;--r:var(--gold)">${stars(battle.stars, 3)}</div>` : ''}
        <div class="reward" style="--r:#9fb4cc">${icon('ic-scrap')} SCRAP <b>+${fmt(payout.scrap)}</b></div>
        <div class="reward" style="--r:var(--cyan)">${icon('ic-chronite')} CHRONITE <b>+${fmt(payout.chronite)}</b></div>
        ${payout.firstClear ? `<div class="reward" style="--r:var(--gold)">${icon('ic-star')} FIRST CLEAR <b>+${fmt(payout.firstClear)}</b></div>` : ''}
        <div class="reward" style="--r:var(--magenta)">${icon('ic-summon')} PASS XP <b>+${payout.xp}</b></div>
        ${dropRow ? `
          <div class="reward" style="${accent(RARITY[dropRow.rarity])}">
            ${icon(dropRow.icon)} ${esc(dropRow.name)}
            <b>${payout.drop.isNew ? 'NEW' : '+' + payout.drop.shards + ' shards'}</b>
          </div>` : ''}
        <div style="height:14px"></div>
        <button class="btn" data-act="close">CONFIRM</button>
      </div>`);
  }

  /* -------- pull reveal -------- */

  let reveal = null;

  function startReveal(results) {
    reveal = { results, index: 0 };
    overlayEl.classList.remove('hidden');
    drawReveal();
  }

  function drawReveal() {
    const r = reveal.results[reveal.index];
    const row = getItemRow(r.itemId);
    const rarity = RARITY[r.rarity];
    const many = reveal.results.length > 1;

    overlayEl.innerHTML = `
      <div class="reveal ${r.rarity}" data-act="advance" style="${accent(rarity)}">
        <div class="warp"></div>
        ${many ? `<div class="counter">${reveal.index + 1} / ${reveal.results.length}</div>` : ''}
        ${many ? '<button class="skip" data-act="skip-reveal">SKIP ALL</button>' : ''}
        <div class="card">
          <div class="rr">${rarity.label}</div>
          ${icon(row.icon, 'glyph')}
          <div class="nm">${esc(row.name)}</div>
          ${stars(rarity.stars)}
          ${r.isNew
            ? '<div class="newtag2">NEW ACQUISITION</div>'
            : `<div class="dupe">duplicate · +${r.shards} shards · +${fmt(r.scrap)} scrap</div>`}
        </div>
        <div class="hint">TAP TO CONTINUE</div>
      </div>`;

    Sfx.play('reveal_' + r.rarity);
  }

  function advanceReveal() {
    reveal.index += 1;
    if (reveal.index < reveal.results.length) drawReveal();
    else { const all = reveal.results; reveal = null; showPullSummary(all); }
  }

  function showPullSummary(results) {
    if (results.length === 1) { closeOverlay(); render(); return; }
    const newCount = results.filter(r => r.isNew).length;
    overlayEl.innerHTML = `
      <div class="sheet">
        <h2>SUMMON COMPLETE</h2>
        <div class="sub">${results.length} UNITS · ${newCount} NEW</div>
        <div class="grid">${results.map(r =>
          slotHTML(r.itemId, { attrs: `data-act="detail" data-id="${r.itemId}"` })).join('')}</div>
        <div style="height:14px"></div>
        <button class="btn" data-act="close">CONFIRM</button>
      </div>`;
  }

  /* ---------------- actions ---------------- */

  function doPull(count) {
    const results = Gacha.pull(count);
    if (!results) { toast('Not enough chronite.'); Sfx.play('error'); return; }
    Sfx.play('charge');
    State.advanceQuest('q_summon', count);
    setTimeout(() => startReveal(results), 620);
  }

  function runNode(nodeId) {
    const node = getNode(nodeId);
    const outcome = Campaign.deploy(node);
    if (!outcome) { toast('Cannot deploy.'); Sfx.play('error'); return; }

    closeOverlay();
    Battle.play(node, outcome.battle, () => {
      closeOverlay();
      render();
      showReport(outcome);
    });
  }

  function handleAction(act, el) {
    if (Battle.handleAction(act)) return;

    switch (act) {
      case 'tab': go(el.dataset.tab); break;
      case 'store-tab': storeTab = el.dataset.t; render(); break;
      case 'filter': armoryFilter = el.dataset.f; render(); break;

      case 'pull': doPull(parseInt(el.dataset.n, 10)); break;
      case 'advance': advanceReveal(); break;
      case 'skip-reveal': {
        const all = reveal.results;
        reveal = null;
        showPullSummary(all);
        break;
      }

      case 'detail': showDetail(el.dataset.id); break;
      case 'upgrade': {
        const id = el.dataset.id;
        if (State.upgrade(id)) {
          Sfx.play('levelup');
          State.advanceQuest('q_upgrade', 1);
          showDetail(id);
          renderHUD();
        } else {
          toast('Not enough materials.');
          Sfx.play('error');
        }
        break;
      }

      case 'pick-squad': showSquadPicker(parseInt(el.dataset.slot, 10)); break;
      case 'assign':
        State.setSquadSlot(pendingSquadSlot, el.dataset.id);
        closeOverlay();
        render();
        break;
      case 'clear-slot':
        State.setSquadSlot(pendingSquadSlot, null);
        closeOverlay();
        render();
        break;
      case 'auto-squad':
        State.autoSquad();
        toast('Best available units deployed.');
        render();
        break;

      case 'node': showBriefing(el.dataset.id); break;
      case 'locked-node': toast('Clear the previous sector first.'); break;
      case 'run': runNode(el.dataset.id); break;

      case 'claim-login': {
        const got = State.claimLogin();
        if (got) {
          Sfx.play('confirm');
          toast(`+${got.chronite} chronite, +${got.fuel} fuel — day ${got.streak}`);
          render();
        }
        break;
      }
      case 'claim-quest': {
        const reward = State.claimQuest(el.dataset.id);
        if (reward) { Sfx.play('confirm'); toast('Contract paid.'); render(); }
        break;
      }
      case 'claim-pass': {
        const reward = State.claimPass(parseInt(el.dataset.lv, 10), el.dataset.prem === '1');
        if (reward) { Sfx.play('levelup'); toast(reward.label + ' claimed.'); render(); }
        break;
      }

      case 'buy': {
        const entry = Store.catalogue().find(e => e.id === el.dataset.id);
        if (!entry) break;
        confirmPurchase(entry);
        break;
      }
      case 'buy-confirm': {
        const entry = Store.catalogue().find(e => e.id === el.dataset.id);
        el.disabled = true;
        Store.buy(entry).then(result => {
          closeOverlay();
          if (result.ok) { Sfx.play('confirm'); toast(entry.name + ' unlocked.'); }
          render();
        });
        break;
      }

      case 'equip': {
        const slot = el.dataset.slot;
        const ref = el.dataset.ref;
        const table = slot === 'theme' ? THEMES : slot === 'sigil' ? SIGILS : TITLES;
        const bucket = slot === 'theme' ? 'themes' : slot === 'sigil' ? 'sigils' : 'titles';
        if (!table[ref].free && !State.owns(bucket, ref)) {
          toast('Not unlocked yet.');
          Sfx.play('error');
          break;
        }
        State.setCosmetic(slot, ref);
        Cosmetics.apply();
        render();
        break;
      }

      case 'toggle': {
        const key = el.dataset.key;
        const next = !State.get().settings[key];
        State.setSetting(key, next);
        Sfx.setEnabled(key, next);
        render();
        break;
      }
      case 'cycle-speed': {
        const next = (State.get().settings.battleSpeed || 1) >= 3
          ? 1 : (State.get().settings.battleSpeed || 1) + 1;
        State.setSetting('battleSpeed', next);
        render();
        break;
      }

      case 'reset':
        openSheet(`
          <h2>WIPE SAVE DATA</h2>
          <div class="sub">THIS CANNOT BE UNDONE</div>
          <p class="trait">Every summon, item, clear and unlock on this device will be erased.</p>
          <button class="btn danger" data-act="reset-confirm">ERASE EVERYTHING</button>
          <div style="height:8px"></div>
          <button class="btn ghost" data-act="close">KEEP MY DATA</button>`);
        break;
      case 'reset-confirm':
        State.reset().then(() => {
          closeOverlay();
          Cosmetics.apply();
          go('campaign');
          toast('Save wiped.');
        });
        break;

      case 'close': closeOverlay(); render(); break;
    }
  }

  function confirmPurchase(entry) {
    openSheet(`
      <h2>${esc(entry.name)}</h2>
      <div class="sub">${money(entry.price)}</div>
      <div class="store-notice">${esc(Commerce.PROVIDER.notice)}</div>
      <p class="trait">${esc(entry.blurb || 'Unlocks immediately.')}</p>
      <button class="btn" data-act="buy-confirm" data-id="${entry.id}">CONFIRM (NO CHARGE)</button>
      <div style="height:8px"></div>
      <button class="btn ghost" data-act="close">CANCEL</button>`);
  }

  function bind() {
    document.body.addEventListener('click', ev => {
      const el = ev.target.closest('[data-act]');
      if (!el) return;
      ev.preventDefault();
      ev.stopPropagation();
      Sfx.unlock();
      if (['tab', 'node', 'pull', 'run', 'buy', 'detail'].indexOf(el.dataset.act) !== -1) {
        Sfx.play('tap');
      }
      handleAction(el.dataset.act, el);
    });

    screenEl.addEventListener('scroll', () => { screenEl._scroll = screenEl.scrollTop; });

    setInterval(() => {
      State.tickFuel();
      if (!isOverlayOpen()) renderHUD();
    }, 1000);
  }

  /** Hardware back button. Returns true when the game consumed the press. */
  function handleBack() {
    if (Battle.isRunning()) return true;
    if (reveal) return true;
    if (isOverlayOpen()) { closeOverlay(); render(); Sfx.play('back'); return true; }
    if (current !== 'campaign') { go('campaign'); Sfx.play('back'); return true; }
    return false;
  }

  return { bind, render, go, handleBack, toast };
})();
