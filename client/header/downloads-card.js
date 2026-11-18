/*
 * The Downloads card: a click on the rail's Downloads button opens the transfer in progress
 * (the game's art and name, a progress bar, percent, speed and time left; with nothing
 * downloading, the first queued game and how far it got), how many games are queued after it,
 * a Pause / Resume button and "Open Downloads"; a click again, a click elsewhere, Escape, or
 * the pointer leaving the button and the card closes it. A right click opens the Downloads page straight away (what a click did).
 *
 * Read from Steam's live download feeds (RegisterForDownloadOverview, RegisterForDownloadItems;
 * the download store as a fallback) and its app store, refreshed each second while open. Pause / Resume is Steam's own
 * SteamClient.Downloads.EnableAllDownloads. Drawn in a popup-layer panel
 * (client/shared/popup-layer.js), styled by client/header/downloads-card.css, opened as the
 * rail's other menus open: beside the rail, above the button.
 */
((SE) => {
  window.__seDownloadsCard?.destroy();
  const layer = SE.layer;
  if (!layer || !document.body) return;
  const { run, esc } = SE;

  const BUTTON = '.se-header-action[data-se-action="downloads"]';
  const SHEETS = ['client/header/downloads-card.css'];

  /* ---------- Steam's download state ---------- */

  const store = () => SE.global('downloadsStore', (value) => value.m_DownloadOverview !== undefined);
  const steamDownloads = () => SE.global('SteamClient', (client) => client.Downloads)?.Downloads || null;
  const appName = (appid) =>
    run(() => SE.global('appStore')?.GetAppOverviewByAppID(Number(appid))?.display_name) || '';

  /*
   * The queue's games still to come, in queue order. Steam's live feed gives a list per client
   * ({ remote_client_id, ... } with the games in a list inside), the store a flat list, an
   * observable array or a map depending on the build: every object with an appid within a few
   * levels counts, once.
   */
  function queueItems(downloads) {
    const found = new Map();
    const seen = new Set();
    const walk = (value, depth) => {
      if (!value || typeof value !== 'object' || seen.has(value) || depth > 3) return;
      seen.add(value);
      if (Number(value.appid) && 'completed' in value) {
        if (!found.has(Number(value.appid))) found.set(Number(value.appid), value);
        return;
      }
      const children = Array.isArray(value)
        ? value
        : typeof value.values === 'function' && !(value instanceof String)
          ? run(() => [...value.values()]) || Object.values(value)
          : Object.values(value);
      for (const child of children) walk(child, depth + 1);
    };
    walk(liveItems || run(() => downloads?.m_DownloadItems), 0);
    return [...found.values()]
      .filter((item) => !item.completed)
      .sort((a, b) => (Number(a.queue_index) || 0) - (Number(b.queue_index) || 0));
  }

  const numberOrNull = (value) => (value == null || !Number.isFinite(Number(value)) ? null : Number(value));
  const percentOf = (done, total) => (total > 0 ? Math.min(100, (done / total) * 100) : null);

  /*
   * The game the card is about: the one downloading, else (downloads paused, or waiting) the
   * first in the queue, with how far it got. queued counts the others.
   */
  function readState() {
    const downloads = store();
    const overview = liveOverview || window.__seDownloadsParts?.live?.liveOverview || downloads?.m_DownloadOverview || null;
    const items = queueItems(downloads);
    const active = Number(overview?.update_appid) || 0;
    const appid = active || Number(items[0]?.appid) || 0;
    const queued = items.filter((item) => Number(item.appid) !== appid).length;
    if (!appid) return { appid: 0, queued: 0 };
    const base = { appid, queued, name: appName(appid), paused: Boolean(overview?.paused) };
    if (active) {
      return {
        ...base,
        state: base.paused ? 'paused' : 'downloading',
        // Steam's overall percentage (what its Downloads page shows), then the ring's reading,
        // then the overview's bytes, downloaded or processed
        percent: numberOrNull(overview.overall_percent_complete) ??
          run(() => window.__seHeaderActions?.downloadPercent?.()) ??
          percentOf(Number(overview.update_bytes_downloaded) || 0, Number(overview.update_bytes_to_download) || 0) ??
          percentOf(Number(overview.update_bytes_processed) || 0, Number(overview.update_bytes_to_process) || 0),
        speed: Number(overview.update_network_bytes_per_second) || 0,
        seconds: Number(overview.overall_estimated_time_remaining_sec ?? overview.update_seconds_remaining) || 0,
      };
    }
    const item = items[0];
    return {
      ...base,
      state: base.paused || item.paused ? 'paused' : 'queued',
      percent: percentOf(Number(item.downloaded_bytes) || 0, Number(item.total_bytes) || 0),
      speed: 0,
      seconds: 0,
    };
  }

  const speedText = (bytes) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB/s` : `${Math.round(bytes / 1e3)} KB/s`);

  function timeText(seconds) {
    if (!(seconds > 0)) return '';
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `${minutes} min left`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours} h ${rest} min left` : `${hours} h left`;
  }

  function detailText(state) {
    const parts = [];
    if (state.percent != null) parts.push(`${Math.floor(state.percent)}%`);
    if (state.state === 'paused') parts.push('Paused');
    else if (state.state === 'queued') parts.push('Queued');
    else {
      if (state.speed) parts.push(speedText(state.speed));
      const left = timeText(state.seconds);
      if (left) parts.push(left);
    }
    return parts.join(' · ');
  }

  const queueText = (count) => (count ? `${count} ${count === 1 ? 'game' : 'games'} queued` : 'Nothing queued');

  /*
   * Steam's live feeds (what its Downloads page reads): the store's copy can sit stale while no
   * one subscribes, so the card keeps its own subscription from the start
   */
  let liveOverview = null;
  let liveItems = null;
  // The open card re-renders on each feed update (Steam sends them about once a second while
  // something moves), so it needs no timer of its own
  let onFeed = null;
  const api = steamDownloads();
  const subscriptions = [
    run(() => api?.RegisterForDownloadOverview?.((overview) => {
      liveOverview = overview;
      onFeed?.();
    })),
    // (isDownloading, items) in the builds seen; whichever argument is the list
    run(() => api?.RegisterForDownloadItems?.((...args) => {
      liveItems = args.find((arg) => arg && typeof arg === 'object' && typeof arg !== 'boolean') ?? liveItems;
      onFeed?.();
    })),
  ];

  /* ---------- The card ---------- */

  function cardHTML(state) {
    const open = '<div class="se-dlc-sep" role="separator"></div>' +
      '<button type="button" class="se-dlc-row" data-act="open"><span class="se-dlc-icon"></span>' +
      '<span class="se-dlc-label">Open Downloads</span></button>';
    if (!state.appid) {
      return `<div class="se-dlc-heading">Downloads</div><div class="se-dlc-empty">No downloads</div>${open}`;
    }
    const HEADING = { downloading: 'Downloading', paused: 'Paused', queued: 'Up next' };
    const waiting = state.state !== 'downloading';
    const art = SE.heroURLs(state.appid);
    const percent = state.percent == null ? 0 : state.percent;
    return `<div class="se-dlc-heading">${HEADING[state.state]}</div>` +
      '<div class="se-dlc-now">' +
      `<img class="se-dlc-art" alt="" src="${esc(art[0] || '')}" data-fallbacks="${esc(art.slice(1).join(' '))}">` +
      '<div class="se-dlc-text">' +
      `<div class="se-dlc-game">${esc(state.name || `App ${state.appid}`)}</div>` +
      `<div class="se-dlc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(percent)}">` +
      `<span style="transform: scaleX(${(percent / 100).toFixed(3)})"></span></div>` +
      `<span class="se-dlc-detail">${esc(detailText(state))}</span>` +
      '</div></div>' +
      '<div class="se-dlc-next">' +
      `<div class="se-dlc-text"><span class="se-dlc-hint">${waiting ? 'After it' : 'Up next'}</span><span class="se-dlc-queue">${esc(queueText(state.queued))}</span></div>` +
      `<button type="button" class="se-dlc-toggle" data-act="toggle" data-paused="${waiting}" ` +
      `aria-label="${waiting ? 'Resume downloads' : 'Pause downloads'}"><span></span></button>` +
      `</div>${open}`;
  }

  // Art: the next source when one fails, then none
  function onArtError(event) {
    const img = event.target;
    if (!img.matches?.('.se-dlc-art')) return;
    const [next, ...rest] = (img.dataset.fallbacks || '').split(' ').filter(Boolean);
    img.dataset.fallbacks = rest.join(' ');
    if (next) img.src = next;
    else img.removeAttribute('src');
  }

  let open = null;
  let owner = null;
  // Leaving the button or the card closes it, as Steam's rail menus close
  let leaving = null;
  let lastState = null;
  let destroyed = false;
  // Set while the theme itself presses the button to open the Downloads page
  let passThrough = false;

  function close() {
    leaving?.dispose();
    leaving = null;
    open?.release();
    open = null;
    SE.attr(owner, 'aria-expanded', owner ? 'false' : null);
    owner = null;
  }

  // The Downloads page, as the button's own click opens it
  function openPage(button) {
    close();
    passThrough = true;
    try {
      button?.click();
    } finally {
      passThrough = false;
    }
  }

  function togglePause() {
    const api = steamDownloads();
    const resume = Boolean(lastState?.appid) && lastState.state !== 'downloading';
    run(() => api?.EnableAllDownloads(resume));
  }

  function build(container) {
    const doc = container.ownerDocument;
    const card = doc.createElement('div');
    card.className = 'se-dlc';
    container.append(card);
    let signature = '';

    const render = () => {
      // A reading Steam changed under the theme leaves the card as it was, not empty
      const state = run(readState);
      if (!state) {
        if (!signature) card.innerHTML = cardHTML({ appid: 0, queued: 0 });
        return;
      }
      lastState = state;
      const html = cardHTML(state);
      if (html === signature) return;
      // Same game: only the moving parts change, so the art and a hovered button stay put
      const bar = card.querySelector('.se-dlc-bar');
      if (bar && signature && state.appid && card.dataset.appid === String(state.appid) &&
        card.dataset.state === String(state.state) && card.dataset.queued === String(state.queued)) {
        const percent = state.percent == null ? 0 : state.percent;
        bar.setAttribute('aria-valuenow', String(Math.round(percent)));
        bar.firstElementChild.style.transform = `scaleX(${(percent / 100).toFixed(3)})`;
        SE.setText(card.querySelector('.se-dlc-detail'), detailText(state));
      } else {
        card.innerHTML = html;
        card.dataset.appid = String(state.appid);
        card.dataset.state = String(state.state);
        card.dataset.paused = String(Boolean(state.appid) && state.state !== 'downloading');
        card.dataset.queued = String(state.queued);
      }
      signature = html;
    };

    card.addEventListener('error', onArtError, true);
    leaving?.watch(card);
    card.addEventListener('click', (event) => {
      const act = event.target.closest?.('[data-act]')?.dataset.act;
      if (act === 'toggle') {
        togglePause();
        setTimeout(safeRender, 150);
      } else if (act === 'open') {
        openPage(document.querySelector(BUTTON));
      }
    });

    const safeRender = () => {
      try {
        render();
      } catch (error) {
        console.warn('[Steam Enhanced] downloads card:', error);
        if (!card.firstChild) card.innerHTML = cardHTML({ appid: 0, queued: 0 });
      }
    };
    safeRender();
    onFeed = safeRender;
    return () => {
      if (onFeed === safeRender) onFeed = null;
    };
  }


  function show(button) {
    if (destroyed || !button.isConnected) return;
    open?.release();
    open = layer.panel({ sheets: SHEETS });
    if (!open) return;
    owner = button;
    SE.attr(button, 'aria-expanded', 'true');
    leaving?.dispose();
    leaving = layer.leaveCloser?.(button, close) || null;
    // Beside the rail, its bottom level with the button's, as every rail menu opens
    open.show(layer.besideRail(button, { foot: true }), build);
  }

  // A click toggles the card; the button's own click (the Downloads page) is held back
  function onClick(event) {
    const button = event.target.closest?.(BUTTON);
    if (!button || passThrough) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (open && !open.released) close();
    else show(button);
  }

  // A right click: the Downloads page, at once
  function onContextMenu(event) {
    const button = event.target.closest?.(BUTTON);
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openPage(button);
  }

  // A press elsewhere closes the card (presses in its own window never reach here)
  function onDown(event) {
    if (!open) return;
    const target = event.target;
    if (target.closest?.(BUTTON) || target.closest?.('.se-dlc')) return;
    close();
  }

  function onKey(event) {
    if (event.key === 'Escape' && open) close();
  }

  function mark() {
    const button = document.querySelector(BUTTON);
    if (button && button.getAttribute('aria-haspopup') !== 'dialog') button.setAttribute('aria-haspopup', 'dialog');
  }
  // The button can be redrawn by Steam: mark it again whenever the title bar changes
  const markPoll = SE.watch(mark, { scope: '.se-header-actions' });
  mark();

  addEventListener('click', onClick, true);
  addEventListener('contextmenu', onContextMenu, true);
  addEventListener('pointerdown', onDown, true);
  addEventListener('keydown', onKey, true);

  window.__seDownloadsCard = {
    destroy() {
      destroyed = true;
      close();
      markPoll?.disconnect?.();
      for (const subscription of subscriptions) run(() => subscription?.unregister());
      removeEventListener('click', onClick, true);
      removeEventListener('contextmenu', onContextMenu, true);
      removeEventListener('pointerdown', onDown, true);
      removeEventListener('keydown', onKey, true);
    },
  };
})(window.__se);
