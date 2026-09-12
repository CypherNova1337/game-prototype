/* ------------------------------------------------------------------
 * ui.js — every screen, slot and overlay.
 *
 * Screens are rendered as HTML strings into #screen and driven by
 * delegated clicks on [data-act], so nothing has to be re-bound after
 * a repaint.
 * ------------------------------------------------------------------ */

const UI = (() => {

  const screenEl = document.getElementById('screen');
  const hudEl = document.getElementById('hud');
  const navEl = document.getElementById('nav');
  const overlayEl = document.getElementById('overlay');
  const toastEl = document.getElementById('toast');

  let current = 'deploy';
  let armoryFilter = 'ALL';
  let pendingSquadSlot = null;

  /* ---------------- helpers ---------------- */

  const icon = (id, cls) => `<svg class="${cls || ''}"><use href="#${id}"></use></svg>`;
  const fmt = n => Math.round(n).toLocaleString('en-US');
  const esc = s => String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** Inline custom properties for a rarity or faction accent. */
  function accent(def, extra) {
    return `--r:${def.color};--edge:${def.edge || def.color};`
         + `--tint:${def.tint || 'transparent'};--glow:${def.glow || def.color};`
         + (extra || '');
  }

  function stars(n) {
    return `<span class="stars">${icon('ic-star').repeat(n)}</span>`;
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 1700);
  }

  function timeLeft(ms) {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

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
    { id: 'deploy', label: 'DEPLOY', icon: 'ic-deploy' },
    { id: 'summon', label: 'SUMMON', icon: 'ic-summon' },
    { id: 'armory', label: 'ARMORY', icon: 'ic-armory' },
    { id: 'system', label: 'SYSTEM', icon: 'ic-system' }
  ];

  function renderNav() {
    navEl.innerHTML = TABS.map(t => `
      <button class="nav-btn ${t.id === current ? 'active' : ''}" data-act="tab" data-tab="${t.id}">
        ${icon(t.icon)}<span>${t.label}</span>
      </button>`).join('');
  }

  /* ---------------- item slot ---------------- */

  /** One inventory tile. This is the prototype's WBP_ItemSlot. */
  function slotHTML(itemId, opts) {
    opts = opts || {};
    if (!itemId) {
      return `<button class="slot empty" ${opts.attrs || ''}>
                <span class="small dim">EMPTY</span>
              </button>`;
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

  /* ---------------- screen: DEPLOY ---------------- */

  function screenDeploy() {
    const save = State.get();
    const squadHTML = save.squad.map((itemId, i) => {
      const row = itemId ? getItemRow(itemId) : null;
      return `<div>
        ${slotHTML(itemId, { attrs: `data-act="pick-squad" data-slot="${i}"` })}
        <div class="squad-name">${row ? esc(row.name) : 'SELECT'}</div>
      </div>`;
    }).join('');

    const sectorsHTML = SECTORS.map(s => {
      const faction = FACTION[s.threat];
      const chance = Math.round(Missions.successChance(s) * 100);
      const locked = save.fuel.amount < s.fuel;
      return `
        <button class="sector" style="${accent(faction)}" data-act="sector" data-id="${s.id}">
          <div class="sector-head">
            <b>${esc(s.name)}</b>
            <span class="tag">${esc(faction.name.split(' ')[0])}</span>
          </div>
          <div class="sector-meta">
            <span>${icon('ic-deploy')} THREAT ${fmt(s.power)}</span>
            <span>${icon('ic-fuel')} ${s.fuel}${locked ? ' (LOW)' : ''}</span>
            <span class="num">${chance}% CLEAR</span>
          </div>
          <div class="bar"><i style="width:${chance}%"></i></div>
        </button>`;
    }).join('');

    return `
      <section class="panel">
        <div class="title">STRIKE TEAM <span class="muted">— tap a slot to assign</span></div>
        <div class="squad">${squadHTML}</div>
        <div class="power-readout">
          <span class="small dim">SQUAD POWER</span>
          <b class="num">${fmt(State.squadPower(null))}</b>
          <button class="btn ghost" style="width:auto;padding:7px 12px" data-act="auto-squad">AUTO</button>
        </div>
      </section>

      <div class="title">SECTORS</div>
      ${sectorsHTML}

      <section class="panel">
        <div class="title">TRANSMISSIONS</div>
        ${save.log.length
          ? save.log.slice(0, 6).map(l => `<div class="log-line ${l.tone}">${esc(l.text)}</div>`).join('')
          : '<div class="log-line">No traffic on this channel.</div>'}
      </section>`;
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
      ${canSingle ? '' : '<p class="empty-note small">Out of chronite — run a sector to refill.</p>'}

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

    const chips = ['ALL', 'OPERATIVE', 'WEAPON', 'GEAR'].map(f => `
      <button class="chip ${f === armoryFilter ? 'on' : ''}" data-act="filter" data-f="${f}">${f}</button>`
    ).join('');

    const body = ids.length
      ? `<div class="grid">${ids.map(id =>
          slotHTML(id, { attrs: `data-act="detail" data-id="${id}"` })).join('')}</div>`
      : `<div class="empty-note">Nothing here yet.<br>Summon on the DRIFT PROTOCOL banner to stock the armory.</div>`;

    const total = State.inventoryIds().length;
    return `
      <div class="title">ARMORY <span class="muted">${total}/${ITEMS.length} CATALOGUED</span></div>
      <div class="chips">${chips}</div>
      <section class="panel">${body}</section>`;
  }

  /* ---------------- screen: SYSTEM ---------------- */

  function screenSystem() {
    const save = State.get();
    const st = save.stats;
    const winRate = st.missionsRun ? Math.round((st.missionsWon / st.missionsRun) * 100) : 0;
    const line = (k, v) => `<div class="statline"><span class="dim">${k}</span><b class="num">${v}</b></div>`;

    return `
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
        <div class="title">LOG</div>
        ${save.log.length
          ? save.log.map(l => `<div class="log-line ${l.tone}">${esc(l.text)}</div>`).join('')
          : '<div class="log-line">Empty.</div>'}
      </section>

      <section class="panel">
        <div class="title">DIAGNOSTICS</div>
        ${line('SAVE BACKEND', Storage.backend())}
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
        <div class="statline"><span class="dim">VERSION</span><b>0.1.1 prototype</b></div>
        <div class="statline"><span class="dim">SAVE</span><b>${Storage.secured ? 'signed on device' : 'browser (dev)'}</b></div>
        <p class="small dim" style="line-height:1.7;margin:12px 0 14px">
          Vertical-slice prototype: summon, catalogue, deploy. Progress is stored on
          this device only — there is no account and nothing leaves the phone.
        </p>
        <button class="btn danger" data-act="reset">WIPE SAVE DATA</button>
      </section>`;
  }

  /** Chrome/WebView build string, trimmed to the part that matters. */
  function engineName() {
    const ua = navigator.userAgent || '';
    const chrome = ua.match(/Chrome\/(\d+)/);
    const android = ua.match(/Android (\d+)/);
    return (chrome ? 'WebView ' + chrome[1] : 'unknown engine')
         + (android ? ' · Android ' + android[1] : '');
  }

  function supports(prop, value) {
    return !!(window.CSS && CSS.supports && CSS.supports(prop, value));
  }

  /* ---------------- router ---------------- */

  const SCREENS = {
    deploy: screenDeploy,
    summon: screenSummon,
    armory: screenArmory,
    system: screenSystem
  };

  function render() {
    State.tickFuel();
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

  function isOverlayOpen() {
    return !overlayEl.classList.contains('hidden');
  }

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
        <div class="statline"><span class="dim">ALLEGIANCE</span><b>${esc(FACTION[row.faction].name)}</b></div>
        <div class="statline"><span class="dim">COPIES HELD</span><b>${entry.copies}</b></div>
        <div style="height:14px"></div>
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

  /* -------- sector briefing + report -------- */

  function showSectorBrief(sectorId) {
    const sector = SECTORS.find(s => s.id === sectorId);
    const save = State.get();
    const faction = FACTION[sector.threat];
    const power = State.squadPower(sector.threat);
    const chance = Math.round(Missions.successChance(sector) * 100);
    const noSquad = !save.squad.some(id => id);
    const noFuel = save.fuel.amount < sector.fuel;

    openSheet(`
      <div style="${accent(faction)}">
        <h2>${esc(sector.name)}</h2>
        <div class="sub">${esc(faction.name)} CONTROLLED</div>
        <div class="statline"><span class="dim">THREAT RATING</span><b>${fmt(sector.power)}</b></div>
        <div class="statline"><span class="dim">YOUR POWER</span><b>${fmt(power)}</b></div>
        <div class="statline"><span class="dim">CLEAR CHANCE</span><b>${chance}%</b></div>
        <div class="statline"><span class="dim">FUEL COST</span><b>${sector.fuel}</b></div>
        <p class="trait">Matching allegiance grants +20% power against this sector's threat.</p>
        <div class="statline"><span class="dim">PAYOUT</span><b>${fmt(sector.scrap)} scrap · ${fmt(sector.chronite)} chronite</b></div>
        <div style="height:14px"></div>
        <button class="btn" data-act="run" data-id="${sector.id}" ${noSquad || noFuel ? 'disabled' : ''}>
          ${noSquad ? 'ASSIGN A SQUAD FIRST' : noFuel ? 'NOT ENOUGH FUEL' : 'DEPLOY'}
        </button>
        <div style="height:8px"></div>
        <button class="btn ghost" data-act="close">ABORT</button>
      </div>`);
  }

  function showReport(report) {
    const faction = FACTION[report.sector.threat];
    const dropRow = report.drop ? getItemRow(report.drop.itemId) : null;
    openSheet(`
      <div style="${accent(faction)}">
        <div class="verdict ${report.won ? 'win' : 'loss'}">${report.won ? 'SECTOR CLEAR' : 'FALLBACK'}</div>
        <p class="small dim" style="text-align:center;margin:0 0 14px">
          ${esc(report.sector.name)} · ${Math.round(report.chance * 100)}% odds · power ${fmt(report.power)}
        </p>
        <div class="reward" style="--r:#9fb4cc">${icon('ic-scrap')} SCRAP <b>+${fmt(report.scrap)}</b></div>
        <div class="reward" style="--r:var(--cyan)">${icon('ic-chronite')} CHRONITE <b>+${fmt(report.chronite)}</b></div>
        ${dropRow ? `
          <div class="reward" style="${accent(RARITY[dropRow.rarity])}">
            ${icon(dropRow.icon)} ${esc(dropRow.name)}
            <b>${report.drop.isNew ? 'NEW' : '+' + report.drop.shards + ' shards'}</b>
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
    overlayEl.innerHTML = '';
    drawReveal();
  }

  function drawReveal() {
    const r = reveal.results[reveal.index];
    const row = getItemRow(r.itemId);
    const rarity = RARITY[r.rarity];
    const many = reveal.results.length > 1;

    overlayEl.innerHTML = `
      <div class="reveal" data-act="advance" style="${accent(rarity)}">
        <div class="warp"></div>
        ${many ? `<div class="counter">${reveal.index + 1} / ${reveal.results.length}</div>` : ''}
        <div class="card">
          <div class="rr">${rarity.label}</div>
          ${icon(row.icon, 'glyph')}
          <div class="nm">${esc(row.name)}</div>
          ${stars(rarity.stars)}
          ${r.isNew
            ? '<div class="newtag2">NEW ACQUISITION</div>'
            : `<div class="dupe">duplicate · +${r.shards} shards · +${fmt(r.scrap)} scrap</div>`}
        </div>
        ${many ? '<button class="skip" data-act="skip-reveal">SKIP ALL</button>' : ''}
        <div class="hint">TAP TO CONTINUE</div>
      </div>`;
  }

  function advanceReveal() {
    reveal.index += 1;
    if (reveal.index < reveal.results.length) {
      drawReveal();
    } else {
      showPullSummary(reveal.results);
      reveal = null;
    }
  }

  function showPullSummary(results) {
    if (results.length === 1) {
      closeOverlay();
      render();
      return;
    }
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
    if (!results) { toast('Not enough chronite.'); return; }
    startReveal(results);
  }

  function handleAction(act, el) {
    switch (act) {
      case 'tab':
        go(el.dataset.tab);
        break;

      case 'filter':
        armoryFilter = el.dataset.f;
        render();
        break;

      case 'pull':
        doPull(parseInt(el.dataset.n, 10));
        break;

      case 'advance':
        advanceReveal();
        break;

      case 'skip-reveal': {
        const all = reveal.results;
        reveal = null;
        showPullSummary(all);
        break;
      }

      case 'detail':
        showDetail(el.dataset.id);
        break;

      case 'upgrade': {
        const id = el.dataset.id;
        if (State.upgrade(id)) {
          toast('Upgrade installed.');
          showDetail(id);
          renderHUD();
        } else {
          toast('Not enough materials.');
        }
        break;
      }

      case 'pick-squad':
        showSquadPicker(parseInt(el.dataset.slot, 10));
        break;

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

      case 'sector':
        showSectorBrief(el.dataset.id);
        break;

      case 'run': {
        const sector = SECTORS.find(s => s.id === el.dataset.id);
        const report = Missions.deploy(sector);
        if (!report) { toast('Cannot deploy.'); break; }
        showReport(report);
        renderHUD();
        break;
      }

      case 'reset':
        openSheet(`
          <h2>WIPE SAVE DATA</h2>
          <div class="sub">THIS CANNOT BE UNDONE</div>
          <p class="trait">Every summon, item and upgrade on this device will be erased.</p>
          <button class="btn danger" data-act="reset-confirm">ERASE EVERYTHING</button>
          <div style="height:8px"></div>
          <button class="btn ghost" data-act="close">KEEP MY DATA</button>`);
        break;

      case 'reset-confirm':
        State.reset().then(() => {
          closeOverlay();
          go('deploy');
          toast('Save wiped.');
        });
        break;

      case 'close':
        closeOverlay();
        render();
        break;
    }
  }

  function bind() {
    document.body.addEventListener('click', ev => {
      const el = ev.target.closest('[data-act]');
      if (!el) return;
      ev.preventDefault();
      ev.stopPropagation();
      handleAction(el.dataset.act, el);
    });

    screenEl.addEventListener('scroll', () => { screenEl._scroll = screenEl.scrollTop; });

    // Fuel ticks up in real time, so keep the HUD honest.
    setInterval(() => {
      State.tickFuel();
      if (!isOverlayOpen()) renderHUD();
    }, 1000);
  }

  /** Hardware back button. Returns true when the game consumed the press. */
  function handleBack() {
    if (reveal) return true;             // don't let a reveal be escaped mid-sequence
    if (isOverlayOpen()) { closeOverlay(); render(); return true; }
    if (current !== 'deploy') { go('deploy'); return true; }
    return false;
  }

  return { bind, render, go, handleBack, toast };
})();
