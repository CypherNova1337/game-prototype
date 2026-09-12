/* ------------------------------------------------------------------
 * ui.js — every screen, card and overlay.
 *
 * Screens render as HTML strings into #screen and are driven by
 * delegated clicks on [data-act], so nothing needs re-binding after a
 * repaint. The battle arena is the exception: it owns its own DOM and
 * mutates it in place (see battle.js).
 * ------------------------------------------------------------------ */

const UI = (() => {

  const screenEl = document.getElementById('screen');
  const hudEl = document.getElementById('hud');
  const navEl = document.getElementById('nav');
  const overlayEl = document.getElementById('overlay');
  const toastEl = document.getElementById('toast');

  let current = 'campaign';
  let rosterTab = 'champions';
  let gearFilter = 'ALL';
  let storeTab = 'pass';
  let pendingTeamSlot = null;
  let pendingGearSlot = null;
  let pendingHero = null;

  /* ---------------- helpers ---------------- */

  const icon = (id, cls) => `<svg class="${cls || ''}"><use href="#${id}"></use></svg>`;
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const esc = s => String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const money = n => '$' + n.toFixed(2);
  const pct = n => Math.round(n * 100) + '%';

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
    { id: 'campaign', label: 'DEPLOY',  icon: 'ic-deploy' },
    { id: 'summon',   label: 'SUMMON',  icon: 'ic-summon' },
    { id: 'roster',   label: 'ROSTER',  icon: 'ic-armory' },
    { id: 'store',    label: 'STORE',   icon: 'ic-chronite' },
    { id: 'system',   label: 'SYSTEM',  icon: 'ic-system' }
  ];

  const anyQuestReady = () => QUESTS.some(q => State.questClaimable(q.id));

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

  /* ---------------- champion card ---------------- */

  function heroCard(heroId, opts) {
    opts = opts || {};
    const hero = getHero(heroId);
    const owned = State.heroEntry(heroId);
    const rarity = RARITY[hero.rarity];
    const affinity = AFFINITY[hero.affinity];
    const deployed = State.get().team.indexOf(heroId) !== -1;

    return `
      <button class="hero-card" style="${accent(rarity)}" ${opts.attrs || ''}>
        ${Portrait.bust(hero)}
        <span class="lvtag">LV${owned ? owned.level : 1}</span>
        <span class="afftag" style="background:${affinity.color};color:${affinity.color}"></span>
        ${deployed && !opts.hideDeployed ? '<span class="deployed">DEPLOYED</span>' : ''}
        <span class="nameplate">
          <span class="nm">${esc(hero.name)}</span>
          <span class="hstars">${stars(owned ? owned.stars : 1, HERO_MAX_STARS)}</span>
        </span>
      </button>`;
  }

  /* ---------------- screen: CAMPAIGN ---------------- */

  function screenCampaign() {
    const save = State.get();
    const sigil = Cosmetics.sigil();

    const teamHTML = save.team.map((heroId, i) => {
      const hero = heroId ? getHero(heroId) : null;
      return `
        <button class="team-slot ${hero ? 'filled' : ''}"
                style="${hero ? accent(RARITY[hero.rarity]) : ''}"
                data-act="pick-team" data-slot="${i}">
          ${hero ? Portrait.bust(hero) + `<span class="tname">${esc(hero.name)}</span>` : 'EMPTY'}
        </button>`;
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
        <div class="team-slots">${teamHTML}</div>
        <div class="power-readout">
          <span class="small dim">TEAM POWER</span>
          <b class="num">${fmt(State.teamPower())}</b>
          <button class="btn ghost" style="width:auto;padding:7px 12px" data-act="auto-team">AUTO</button>
        </div>
      </section>

      <section class="panel">
        <div class="title">DAILY CONTRACTS <span class="muted">resets at midnight</span></div>
        ${QUESTS.map(q => {
          const done = State.questProgress(q.id);
          const ready = State.questClaimable(q.id);
          const claimed = State.get().quests.claimed.indexOf(q.id) !== -1;
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
      </section>

      ${chaptersHTML}`;
  }

  /* ---------------- screen: SUMMON ---------------- */

  function screenSummon() {
    const save = State.get();
    const feature = getHero(BANNER.featured);
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
        <div class="banner-art">${Portrait.figure(feature)}</div>
        <div class="copy">
          <h1>${esc(BANNER.name)}</h1>
          <p>${esc(BANNER.subtitle)}</p>
          <div class="li">
            ASCENDANT rate-up 50%<br>
            Guaranteed ENHANCED+ every ${BANNER.pity.rareFloorEvery}<br>
            Guaranteed ASCENDANT at ${BANNER.pity.hard}
          </div>
        </div>
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
        <div class="sheet-hero">
          <div class="sheet-portrait">${Portrait.bust(feature)}</div>
          <div style="min-width:0;flex:1">
            <h2 style="font-size:15px;margin:0">${esc(feature.name)}</h2>
            <div class="sub">"${esc(feature.title)}" · ${RARITY[feature.rarity].label}</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
              <span class="role-pill">${ROLE[feature.role].name}</span>
              <span class="role-pill" style="--r:${AFFINITY[feature.affinity].color};--edge:${AFFINITY[feature.affinity].color}">
                ${AFFINITY[feature.affinity].name}</span>
            </div>
            <div class="small dim" style="margin-top:8px">
              ${State.ownsHero(BANNER.featured) ? 'IN ROSTER' : 'NOT YET RECRUITED'}
            </div>
          </div>
        </div>
        <p class="trait">${esc(feature.lore)}</p>
      </section>`;
  }

  /* ---------------- screen: ROSTER (champions + gear) ---------------- */

  function screenRoster() {
    const tabs = [['champions', 'CHAMPIONS'], ['gear', 'GEAR']]
      .map(([id, label]) =>
        `<button class="chip ${rosterTab === id ? 'on' : ''}" data-act="roster-tab" data-t="${id}">${label}</button>`
      ).join('');
    return `<div class="chips">${tabs}</div>${rosterTab === 'champions' ? championsSection() : gearSection()}`;
  }

  function championsSection() {
    const ids = State.roster();
    const body = ids.length
      ? `<div class="hero-grid">${ids.map(id =>
          heroCard(id, { attrs: `data-act="hero" data-id="${id}"` })).join('')}</div>`
      : '<div class="empty-note">No champions yet.<br>Summon on the DRIFT PROTOCOL banner.</div>';

    return `
      <div class="title">CHAMPIONS <span class="muted">${ids.length}/${HEROES.length} RECRUITED</span></div>
      <section class="panel">${body}</section>`;
  }

  function gearSection() {
    const all = State.gearList();
    const filtered = gearFilter === 'ALL' ? all : all.filter(g => g.slot === gearFilter);

    const chips = ['ALL'].concat(SLOT_ORDER).map(f =>
      `<button class="chip ${f === gearFilter ? 'on' : ''}" data-act="gear-filter" data-f="${f}">
         ${f === 'ALL' ? 'ALL' : SLOTS[f].name}</button>`
    ).join('');

    const rows = filtered.slice(0, 60).map(item => gearRow(item,
      `data-act="gear-detail" data-id="${item.id}"`)).join('');

    return `
      <div class="chips">${chips}</div>
      <div class="title">GEAR <span class="muted">${all.length} PIECES</span></div>
      ${filtered.length ? rows
        : '<div class="empty-note">No gear yet.<br>Sectors drop it — bosses drop two pieces.</div>'}
      ${filtered.length > 60 ? '<p class="small dim">Showing the 60 strongest.</p>' : ''}`;
  }

  function gearRow(item, attrs) {
    const rarity = GEAR_RARITY[item.rarity];
    const set = GEAR_SETS[item.set];
    const worn = item.equipped ? getHero(item.equipped) : null;
    return `
      <button class="gear-row ${worn ? 'worn' : ''}"
              style="--r:${rarity.color};--edge:${rarity.color}55;--tint:${rarity.color}14" ${attrs || ''}>
        <span class="gicon">${icon(SLOTS[item.slot].icon)}</span>
        <span class="ginfo">
          <b>${esc(set.name)} ${esc(SLOTS[item.slot].name)}</b>
          <span>${esc(Gear.label(item.main.stat, Gear.mainValue(item)))}
            · ${rarity.label}${worn ? ' · worn by ' + esc(worn.name) : ''}</span>
        </span>
        <span class="glevel">+${item.level}</span>
      </button>`;
  }

  /* ---------------- screen: STORE ---------------- */

  function screenStore() {
    const tabs = [['pass', 'DRIFT PASS'], ['shop', 'SHOP'], ['looks', 'APPEARANCE']]
      .map(([id, label]) =>
        `<button class="chip ${storeTab === id ? 'on' : ''}" data-act="store-tab" data-t="${id}">${label}</button>`
      ).join('');

    return `
      <div class="store-notice">${esc(Commerce.PROVIDER.notice)}</div>
      <div class="chips">${tabs}</div>
      ${storeTab === 'pass' ? passSection() : storeTab === 'shop' ? shopSection() : appearanceSection()}`;
  }

  function passSection() {
    const save = State.get();
    const premium = save.entitlements.passPremium;
    const progress = (save.pass.xp / PASS.xpPerLevel) * 100;

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
        <div class="pass-xp"><i style="width:${progress}%"></i></div>
        <div class="fairplay">
          <b>HOW THIS WORKS</b>
          Pass levels come from playing — every battle pays XP. The free track
          pays out at every single level and contains all of the chronite,
          scrap and shards. The premium track adds cosmetics on top. Nothing
          on either track makes your champions stronger than the other.
        </div>
        ${premium ? '' : `
          <div class="product">
            <div class="info"><b>${esc(STORE.pass.name)}</b><span>${esc(STORE.pass.blurb)}</span></div>
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
        Every champion, every piece of gear and every sector is reachable
        without spending. Nothing here sells power, stats, or an exclusive
        champion. Chronite is earned by playing; buying it only skips
        waiting. There are no ads and no energy you can pay to refill.
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
        <p class="small dim" style="margin:10px 0 0">${esc(THEMES[save.cosmetics.theme].name)} equipped.</p>
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
          ${save.settings[key] ? 'ON' : 'OFF'}</button>
      </div>`;

    return `
      <section class="panel">
        <div class="title">COMMANDER</div>
        <div class="statline"><span class="dim">CALLSIGN</span><b>${esc(Cosmetics.title().name)}</b></div>
        ${line('CAMPAIGN STARS', `${State.totalStars()} / ${ALL_NODES.length * 3}`)}
        ${line('SECTORS CLEARED', `${ALL_NODES.filter(n => State.isCleared(n.id)).length} / ${ALL_NODES.length}`)}
        ${line('CHAMPIONS', `${State.roster().length} / ${HEROES.length}`)}
        ${line('GEAR HELD', fmt(State.gearList().length))}
        ${line('BOSSES FELLED', fmt(st.bossesFelled))}
        ${line('PASS LEVEL', save.pass.level + ' / ' + PASS.levels)}
      </section>

      <section class="panel">
        <div class="title">SERVICE RECORD</div>
        ${line('SUMMONS PERFORMED', fmt(st.pulls))}
        ${line('ASCENDANTS PULLED', fmt(st.legendaries))}
        ${line('SECTORS RUN', fmt(st.missionsRun))}
        ${line('CLEAR RATE', winRate + '%')}
        ${line('PERFECT CLEARS', fmt(st.perfectClears))}
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
        ${line('3D SUPPORT', supports('transform-style', 'preserve-3d') ? 'full' : 'flat fallback')}
        <p class="small dim" style="line-height:1.7;margin:10px 0 0">
          Read this out if the game misbehaves on your device — it says which
          browser engine and storage the build is actually running on.
        </p>
      </section>

      <section class="panel">
        <div class="title">BUILD</div>
        <div class="statline"><span class="dim">VERSION</span><b>0.3.0 prototype</b></div>
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
    roster: screenRoster,
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

  function openSheet(html, cls) {
    overlayEl.innerHTML = `<div class="sheet ${cls || ''}">${html}</div>`;
    overlayEl.classList.remove('hidden');
  }

  function closeOverlay() {
    overlayEl.classList.add('hidden');
    overlayEl.innerHTML = '';
  }

  const isOverlayOpen = () => !overlayEl.classList.contains('hidden');

  /* -------- champion sheet -------- */

  function showHero(heroId) {
    pendingHero = heroId;
    const hero = getHero(heroId);
    const owned = State.heroEntry(heroId);
    if (!owned) return;

    const rarity = RARITY[hero.rarity];
    const affinity = AFFINITY[hero.affinity];
    const stats = State.statsFor(heroId);
    const sets = activeSets(owned, State.gearOf);

    const levelCost = State.levelCost(heroId);
    const ascendCost = State.ascendCost(heroId);
    const canLevel = State.canLevel(heroId);
    const canAscend = State.canAscend(heroId);
    const maxLevel = owned.level >= HERO_MAX_LEVEL;
    const maxStars = owned.stars >= HERO_MAX_STARS;

    const slotsHTML = SLOT_ORDER.map(slot => {
      const item = State.gearOf(owned.equipped[slot]);
      const rar = item ? GEAR_RARITY[item.rarity] : null;
      return `
        <button class="gear-slot ${item ? 'filled' : ''}"
                style="${item ? `--r:${rar.color};--edge:${rar.color}66;--tint:${rar.color}18` : ''}"
                data-act="gear-pick" data-slot="${slot}">
          ${icon(SLOTS[slot].icon)}
          <span class="slotname">${SLOTS[slot].name}</span>
          ${item ? `<span class="plus">+${item.level}</span>
                    <span class="setname">${esc(GEAR_SETS[item.set].name)}</span>` : ''}
        </button>`;
    }).join('');

    const skillsHTML = hero.skills.map((skill, i) => `
      <div class="skill-row" style="${accent(rarity)}">
        <span class="badge">A${i + 1}</span>
        <span class="body">
          <b>${esc(skill.name)}</b>
          <span>${esc(describeSkill(skill))}</span>
        </span>
      </div>`).join('');

    openSheet(`
      <div style="${accent(rarity)}">
        <div class="sheet-hero">
          <div class="sheet-portrait">${Portrait.bust(hero)}</div>
          <div style="min-width:0;flex:1">
            <h2>${esc(hero.name)}</h2>
            <div class="sub">"${esc(hero.title)}"</div>
            <div class="hstars" style="display:flex;gap:2px;margin:4px 0">${stars(owned.stars, HERO_MAX_STARS)}</div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">
              <span class="role-pill">${ROLE[hero.role].name}</span>
              <span class="role-pill" style="--r:${affinity.color};--edge:${affinity.color}">${affinity.name}</span>
              <span class="role-pill" style="--r:${FACTION[hero.faction].color};--edge:${FACTION[hero.faction].color}">
                ${esc(FACTION[hero.faction].name.split(' ')[0])}</span>
            </div>
            <div class="small dim" style="margin-top:6px">LEVEL ${owned.level} / ${HERO_MAX_LEVEL}
              · POWER ${fmt(stats.power)}</div>
          </div>
        </div>

        <div class="statgrid">
          <div><span>HP</span><b>${fmt(stats.hp)}</b></div>
          <div><span>ATK</span><b>${fmt(stats.atk)}</b></div>
          <div><span>DEF</span><b>${fmt(stats.def)}</b></div>
          <div><span>SPD</span><b>${fmt(stats.spd)}</b></div>
          <div><span>C.RATE</span><b>${pct(stats.crate)}</b></div>
          <div><span>C.DMG</span><b>${pct(stats.cdmg)}</b></div>
          <div><span>ACC</span><b>${fmt(stats.acc)}</b></div>
          <div><span>RES</span><b>${fmt(stats.res)}</b></div>
        </div>

        <div class="title" style="margin-top:14px">GEAR</div>
        <div class="gear-slots">${slotsHTML}</div>
        ${sets.length ? `<p class="small" style="margin-top:8px">${sets.map(s =>
          `<span class="role-pill" style="--r:${s.set.color};--edge:${s.set.color}">${s.set.name}${s.stacks > 1 ? ' ×' + s.stacks : ''}</span>`
        ).join(' ')}</p>` : '<p class="small dim" style="margin-top:8px">No set bonus active.</p>'}

        <div class="title" style="margin-top:14px">SKILLS</div>
        ${skillsHTML}

        <p class="trait">${esc(hero.lore)}</p>

        ${maxLevel ? '<button class="btn ghost" disabled>MAX LEVEL</button>'
          : `<button class="btn ${canLevel ? '' : 'ghost'}" data-act="level-hero" data-id="${heroId}"
               ${canLevel ? '' : 'disabled'}>LEVEL UP &nbsp;${icon('ic-scrap')}${fmt(levelCost.scrap)}</button>`}
        <div style="height:8px"></div>
        ${maxStars ? '<button class="btn ghost" disabled>FULLY ASCENDED</button>'
          : `<button class="btn ${canAscend ? 'gold' : 'ghost'}" data-act="ascend-hero" data-id="${heroId}"
               ${canAscend ? '' : 'disabled'}>ASCEND &nbsp;${icon('ic-shard')}${fmt(ascendCost.shards)}</button>`}
        <div style="height:8px"></div>
        <button class="btn ghost" data-act="close">CLOSE</button>
      </div>`);
  }

  /** Plain-language description of what a skill does. */
  function describeSkill(skill) {
    const bits = [];
    if (skill.type === 'damage') {
      bits.push(`${skill.mult.toFixed(1)}× ATK`
        + (skill.hits > 1 ? ` ×${skill.hits} hits` : '')
        + (skill.target === 'all_enemies' ? ' to all enemies' : ''));
      if (skill.ignoreDef) bits.push(`ignores ${pct(skill.ignoreDef)} DEF`);
      if (skill.lifesteal) bits.push(`heals for ${pct(skill.lifesteal)} of damage`);
      if (skill.executeUnder) bits.push(`+70% below ${pct(skill.executeUnder)} HP`);
      if (skill.breakShield) bits.push('destroys shields');
      if (skill.scaleDef) bits.push('scales on DEF');
      if (skill.scaleHp) bits.push('scales on HP');
    } else {
      if (skill.heal) bits.push(`heals ${pct(skill.heal)} max HP`);
      if (skill.shield) bits.push(`shields ${pct(skill.shield)} max HP`);
      if (skill.cleanse) bits.push('removes debuffs');
    }
    (skill.applies || []).forEach(a => {
      bits.push(`${STATUS[a.id].name} ${a.chance < 1 ? pct(a.chance) + ' ' : ''}for ${a.turns} turns`);
    });
    if (skill.extraTurn) bits.push(`${pct(skill.extraTurn)} chance of an extra turn`);
    return bits.join(' · ') + (skill.cd ? ` — ${skill.cd} turn cooldown` : ' — no cooldown');
  }

  /* -------- gear picker and detail -------- */

  function showGearPicker(slot) {
    pendingGearSlot = slot;
    const options = State.gearList(g => g.slot === slot);
    const equippedId = State.heroEntry(pendingHero).equipped[slot];

    openSheet(`
      <h2>${SLOTS[slot].name}</h2>
      <div class="sub">SELECT A PIECE</div>
      ${equippedId ? `<button class="btn ghost" data-act="unequip" data-slot="${slot}">REMOVE CURRENT</button>
                      <div style="height:10px"></div>` : ''}
      ${options.length
        ? options.slice(0, 40).map(item => gearRow(item, `data-act="equip-gear" data-id="${item.id}"`)).join('')
        : '<div class="empty-note">Nothing for this slot yet.</div>'}
      <div style="height:8px"></div>
      <button class="btn ghost" data-act="back-hero">BACK</button>`);
  }

  function showGearDetail(gearId) {
    const item = State.gearOf(gearId);
    if (!item) return;
    const rarity = GEAR_RARITY[item.rarity];
    const set = GEAR_SETS[item.set];
    const cost = Gear.upgradeCost(item);
    const canUp = State.canUpgradeGear(gearId);
    const maxed = item.level >= GEAR_MAX_LEVEL;
    const worn = item.equipped ? getHero(item.equipped) : null;

    openSheet(`
      <div style="--r:${rarity.color};--edge:${rarity.color}66;--tint:${rarity.color}18">
        <h2>${esc(set.name)} ${esc(SLOTS[item.slot].name)}</h2>
        <div class="sub">${rarity.label} · +${item.level} · TIER ${item.tier}</div>
        <div class="statline"><span class="dim">MAIN</span>
          <b>${esc(Gear.label(item.main.stat, Gear.mainValue(item)))}</b></div>
        ${item.subs.map(s => `<div class="substat"><span>${STATS[s.stat].name}</span>
          <b>${esc(Gear.label(s.stat, s.value).split('+')[1])}</b></div>`).join('')}
        <p class="trait">${esc(set.name)} set — ${set.pieces} pieces:
          ${esc(setBonusText(set))}${set.note ? '. ' + esc(set.note) : ''}</p>
        ${worn ? `<div class="statline"><span class="dim">WORN BY</span><b>${esc(worn.name)}</b></div>` : ''}
        <div style="height:12px"></div>
        ${maxed ? '<button class="btn ghost" disabled>FULLY UPGRADED</button>'
          : `<button class="btn ${canUp ? '' : 'ghost'}" data-act="upgrade-gear" data-id="${gearId}"
               ${canUp ? '' : 'disabled'}>UPGRADE &nbsp;${icon('ic-scrap')}${fmt(cost.scrap)}
               ${cost.shards ? icon('ic-shard') + cost.shards : ''}</button>`}
        <div style="height:8px"></div>
        <button class="btn danger" data-act="sell-gear" data-id="${gearId}">SCRAP THIS PIECE</button>
        <div style="height:8px"></div>
        <button class="btn ghost" data-act="close">CLOSE</button>
      </div>`);
  }

  function setBonusText(set) {
    return Object.keys(set.bonus).map(key => {
      const value = set.bonus[key];
      const names = { hp_pct: 'HP', atk_pct: 'ATK', def_pct: 'DEF', spd_pct: 'SPD',
                      crate: 'C.RATE', cdmg: 'C.DMG', lifesteal: 'lifesteal' };
      return `+${Math.round(value * 100)}% ${names[key] || key}`;
    }).join(', ');
  }

  /* -------- team picker -------- */

  function showTeamPicker(slotIndex) {
    pendingTeamSlot = slotIndex;
    const ids = State.roster();
    openSheet(`
      <h2>SLOT ${slotIndex + 1}</h2>
      <div class="sub">SELECT A CHAMPION</div>
      ${ids.length
        ? `<div class="hero-grid">${ids.map(id => {
            const stats = State.statsFor(id);
            return `<div>${heroCard(id, { attrs: `data-act="assign" data-id="${id}"`, hideDeployed: false })}
                    <div class="squad-name">${fmt(stats.power)}</div></div>`;
          }).join('')}</div>`
        : '<div class="empty-note">Roster is empty. Summon first.</div>'}
      <div style="height:12px"></div>
      <button class="btn ghost" data-act="clear-slot">CLEAR SLOT</button>
      <div style="height:8px"></div>
      <button class="btn ghost" data-act="close">CANCEL</button>`);
  }

  /* -------- briefing and report -------- */

  function showBriefing(nodeId) {
    const node = getNode(nodeId);
    const faction = FACTION[node.faction];
    const save = State.get();
    const odds = Math.round(Campaign.forecast(node) * 100);
    const recommended = Campaign.recommendedPower(node);
    const power = State.teamPower();
    const rewards = nodeRewards(node);
    const got = State.starsOn(node.id);
    const foes = buildFoes(node);

    const noTeam = !Campaign.teamReady();
    const noFuel = save.fuel.amount < node.fuel;

    const line = foes.map(f => `
      <div class="reward" style="${accent(RARITY[f.hero.rarity])}">
        <span style="width:18px;height:18px;display:inline-block;color:${AFFINITY[f.hero.affinity].color}">
          ${icon('ic-star')}</span>
        ${esc(f.hero.name)}${f.boss ? ' <b>BOSS</b>' : ''}
        <b>${fmt(f.stats.power)}</b>
      </div>`).join('');

    openSheet(`
      <div style="${accent(faction)}">
        <h2>${esc(node.name)}</h2>
        <div class="sub">${esc(faction.name)} · ${node.boss ? 'BOSS SECTOR' : 'SECTOR'}</div>
        <div class="statline"><span class="dim">RECOMMENDED POWER</span><b>${fmt(recommended)}</b></div>
        <div class="statline"><span class="dim">YOUR TEAM</span>
          <b style="color:${power >= recommended ? 'var(--good)' : 'var(--bad)'}">${fmt(power)}</b></div>
        <div class="statline"><span class="dim">ESTIMATED ODDS</span><b>${odds}%</b></div>
        <div class="statline"><span class="dim">FUEL</span><b>${node.fuel}</b></div>
        <div class="statline"><span class="dim">BEST RESULT</span><b>${got}★ / 3★</b></div>
        <p class="trait">${STAR_GOALS.map(g => g.label).join(' · ')}.</p>
        <div class="title">HOSTILE LINE</div>
        ${line}
        <div class="title">PAYOUT</div>
        <div class="statline"><span class="dim">SCRAP / CHRONITE</span>
          <b>${fmt(rewards.scrap)} / ${fmt(rewards.chronite)}</b></div>
        <div class="statline"><span class="dim">GEAR</span>
          <b>${node.boss ? '2 pieces' : 'chance of 1'}</b></div>
        ${got === 0 ? `<div class="statline"><span class="dim">FIRST CLEAR</span>
          <b>${fmt(rewards.firstClear)} chronite</b></div>` : ''}
        <div style="height:14px"></div>
        <button class="btn" data-act="run" data-id="${node.id}" ${noTeam || noFuel ? 'disabled' : ''}>
          ${noTeam ? 'BUILD A TEAM FIRST' : noFuel ? 'NOT ENOUGH FUEL' : 'DEPLOY'}
        </button>
        <div style="height:8px"></div>
        <button class="btn ghost" data-act="close">ABORT</button>
      </div>`);
  }

  function showReport(outcome) {
    const { battle, payout, node } = outcome;
    const faction = FACTION[node.faction];

    openSheet(`
      <div style="${accent(faction)}">
        <div class="verdict ${battle.won ? 'win' : 'loss'}">${battle.won ? 'VICTORY' : 'DEFEAT'}</div>
        <p class="small dim" style="text-align:center;margin:0 0 10px">
          ${esc(node.name)} · ${battle.turns} turns · ${battle.losses} lost
        </p>
        ${battle.won ? `<div style="text-align:center;margin-bottom:12px;--r:var(--gold)">
          ${stars(battle.stars, 3)}</div>` : ''}
        <div class="reward" style="--r:#9fb4cc">${icon('ic-scrap')} SCRAP <b>+${fmt(payout.scrap)}</b></div>
        <div class="reward" style="--r:var(--cyan)">${icon('ic-chronite')} CHRONITE <b>+${fmt(payout.chronite)}</b></div>
        ${payout.firstClear ? `<div class="reward" style="--r:var(--gold)">
          ${icon('ic-star')} FIRST CLEAR <b>+${fmt(payout.firstClear)}</b></div>` : ''}
        <div class="reward" style="--r:var(--magenta)">${icon('ic-summon')} PASS XP <b>+${payout.xp}</b></div>
        ${payout.drops.map(item => {
          const rar = GEAR_RARITY[item.rarity];
          return `<div class="reward" style="--r:${rar.color}">
            ${icon(SLOTS[item.slot].icon)} ${esc(GEAR_SETS[item.set].name)} ${esc(SLOTS[item.slot].name)}
            <b>${rar.label}</b></div>`;
        }).join('')}
        <div style="height:14px"></div>
        <button class="btn" data-act="close">CONFIRM</button>
      </div>`);
  }

  /* -------- summon reveal -------- */

  let reveal = null;

  function startReveal(results) {
    reveal = { results, index: 0 };
    overlayEl.classList.remove('hidden');
    drawReveal();
  }

  function drawReveal() {
    const r = reveal.results[reveal.index];
    const hero = getHero(r.heroId);
    const rarity = RARITY[r.rarity];
    const many = reveal.results.length > 1;

    overlayEl.innerHTML = `
      <div class="reveal ${r.rarity}" data-act="advance" style="${accent(rarity)}">
        <div class="warp"></div>
        ${many ? `<div class="counter">${reveal.index + 1} / ${reveal.results.length}</div>` : ''}
        ${many ? '<button class="skip" data-act="skip-reveal">SKIP ALL</button>' : ''}
        <div class="card">
          <div class="rr">${rarity.label}</div>
          <div class="card-art">${Portrait.figure(hero)}</div>
          <div class="nm">${esc(hero.name)}</div>
          <div class="dupe">${esc(ROLE[hero.role].name)} · ${esc(AFFINITY[hero.affinity].name)}</div>
          ${stars(rarity.stars)}
          ${r.isNew
            ? '<div class="newtag2">NEW CHAMPION</div>'
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
        <div class="sub">${results.length} CHAMPIONS · ${newCount} NEW</div>
        <div class="hero-grid">${results.map(r =>
          heroCard(r.heroId, { attrs: `data-act="hero" data-id="${r.heroId}"`, hideDeployed: true })).join('')}</div>
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
      case 'roster-tab': rosterTab = el.dataset.t; render(); break;
      case 'gear-filter': gearFilter = el.dataset.f; render(); break;
      case 'store-tab': storeTab = el.dataset.t; render(); break;

      case 'pull': doPull(parseInt(el.dataset.n, 10)); break;
      case 'advance': advanceReveal(); break;
      case 'skip-reveal': {
        const all = reveal.results;
        reveal = null;
        showPullSummary(all);
        break;
      }

      case 'hero': showHero(el.dataset.id); break;
      case 'back-hero': showHero(pendingHero); break;

      case 'level-hero': {
        const id = el.dataset.id;
        if (State.levelHero(id)) {
          Sfx.play('levelup');
          State.advanceQuest('q_upgrade', 1);
          showHero(id);
          renderHUD();
        } else { toast('Not enough scrap.'); Sfx.play('error'); }
        break;
      }
      case 'ascend-hero': {
        const id = el.dataset.id;
        if (State.ascendHero(id)) {
          Sfx.play('levelup');
          toast(getHero(id).name + ' ascended.');
          showHero(id);
          renderHUD();
        } else { toast('Not enough shards.'); Sfx.play('error'); }
        break;
      }

      case 'gear-pick': showGearPicker(el.dataset.slot); break;
      case 'equip-gear':
        State.equipGear(pendingHero, el.dataset.id);
        Sfx.play('confirm');
        showHero(pendingHero);
        break;
      case 'unequip':
        State.unequipGear(pendingHero, el.dataset.slot);
        showHero(pendingHero);
        break;
      case 'gear-detail': showGearDetail(el.dataset.id); break;
      case 'upgrade-gear': {
        const result = State.upgradeGear(el.dataset.id);
        if (result) {
          Sfx.play('levelup');
          State.advanceQuest('q_upgrade', 1);
          if (result.improved) toast(STATS[result.improved.stat].name + ' improved.');
          showGearDetail(el.dataset.id);
          renderHUD();
        } else { toast('Not enough materials.'); Sfx.play('error'); }
        break;
      }
      case 'sell-gear': {
        const value = State.sellGear(el.dataset.id);
        Sfx.play('confirm');
        toast('Scrapped for ' + fmt(value) + ' scrap.');
        closeOverlay();
        render();
        break;
      }

      case 'pick-team': showTeamPicker(parseInt(el.dataset.slot, 10)); break;
      case 'assign':
        State.setTeamSlot(pendingTeamSlot, el.dataset.id);
        closeOverlay();
        render();
        break;
      case 'clear-slot':
        State.setTeamSlot(pendingTeamSlot, null);
        closeOverlay();
        render();
        break;
      case 'auto-team':
        State.autoTeam();
        toast('Strongest champions deployed.');
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
      case 'claim-quest':
        if (State.claimQuest(el.dataset.id)) { Sfx.play('confirm'); toast('Contract paid.'); render(); }
        break;
      case 'claim-pass': {
        const reward = State.claimPass(parseInt(el.dataset.lv, 10), el.dataset.prem === '1');
        if (reward) { Sfx.play('levelup'); toast(reward.label + ' claimed.'); render(); }
        break;
      }

      case 'buy': {
        const entry = Store.catalogue().find(e => e.id === el.dataset.id);
        if (entry) confirmPurchase(entry);
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
          toast('Not unlocked yet.'); Sfx.play('error'); break;
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
        const now = State.get().settings.battleSpeed || 1;
        State.setSetting('battleSpeed', now >= 4 ? 1 : now + 1);
        render();
        break;
      }

      case 'reset':
        openSheet(`
          <h2>WIPE SAVE DATA</h2>
          <div class="sub">THIS CANNOT BE UNDONE</div>
          <p class="trait">Every champion, every piece of gear and all campaign
            progress on this device will be erased.</p>
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
      if (['tab', 'node', 'pull', 'run', 'buy', 'hero'].indexOf(el.dataset.act) !== -1) Sfx.play('tap');
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
