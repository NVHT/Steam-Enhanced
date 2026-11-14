/*
 * The dock element: its own panel, rendering and patching, and placement beside the Library or
 * Store/Community view.
 */
((SE) => {
  const ns = window.__seFriendsDockParts;
  if (!ns) return;
  const {
    app, chatError, closedSections, DEAD_AVATAR_LIMIT, deadAvatars, groupInitials, hideFly,
    openGames, panelHTML, railHTML, read, showFly, showSteam, state,
  } = ns;
  const { live } = ns;

  const { C, mainWindow, run } = SE;

  const dock = document.createElement('aside');

  const own = document.createElement('div');

  /* error doesn't bubble: caught on the way down, for the panel, the rail and the chat chip */
  function onAvatarError(event) {
    const img = event.target;
    const tile = img?.tagName === 'IMG' ? img.closest('.se-fd-gav') : null;
    if (!tile) return;
    const src = img.getAttribute('src');
    if (src) {
      // Oldest first out: a Set keeps insertion order.
      if (deadAvatars.size >= DEAD_AVATAR_LIMIT) deadAvatars.delete(deadAvatars.values().next().value);
      deadAvatars.add(src);
    }
    img.outerHTML = groupInitials(tile.dataset.initials || '#');
  }

  const fly = document.createElement('div');

  function panelKey(node) {
    if (node.nodeType !== 1) return null;
    for (const name of ['data-friend', 'data-game', 'data-group', 'data-section', 'data-act']) {
      if (node.hasAttribute(name)) return `${node.tagName}|${name}|${node.getAttribute(name)}`;
    }
    return `${node.tagName}|${node.getAttribute('class') || ''}`;
  }

  const foreign = (node) => node.nodeType === 1 && node.classList.contains('se-header-tooltip-host');

  function reconcile(host, desired) {
    const existing = [...host.childNodes].filter((node) => !foreign(node));
    const pool = new Map();
    for (const node of existing) {
      const key = panelKey(node);
      if (!pool.has(key)) pool.set(key, []);
      pool.get(key).push(node);
    }
    const kept = new Set();
    let cursor = host.firstChild;

    for (const next of [...desired.childNodes]) {
      const key = panelKey(next);
      const candidates = pool.get(key);
      let node = candidates?.shift();
      if (node && node.nodeType !== next.nodeType) node = null;
      if (!node) {
        node = next.cloneNode(true);
      } else if (node.nodeType === 3) {
        if (node.nodeValue !== next.nodeValue) node.nodeValue = next.nodeValue;
      } else if (node.nodeType === 1) {
        for (const attr of [...node.attributes]) {
          if (!next.hasAttribute(attr.name) && !attr.name.startsWith('data-se-')) {
            node.removeAttribute(attr.name);
          }
        }
        for (const attr of [...next.attributes]) {
          if (node.getAttribute(attr.name) !== attr.value) {
            node.setAttribute(attr.name, attr.value);
          }
        }
        if (node.tagName === 'INPUT' && document.activeElement !== node && node.value !== next.value) {
          node.value = next.value;
        }
        reconcile(node, next);
      }
      kept.add(node);
      while (cursor && foreign(cursor)) cursor = cursor.nextSibling;
      if (node !== cursor) host.insertBefore(node, cursor);
      cursor = node.nextSibling;
    }

    for (const node of existing) {
      if (!kept.has(node)) node.remove();
    }
  }

  function patchPanel(host, html) {
    const template = document.createElement('template');
    template.innerHTML = html;
    reconcile(host, template.content);
  }

  function onSearch(event) {
    if (!event.target.matches('.se-fd-search input') || event.isComposing) return;
    state.searchText = event.target.value;
    state.filter = state.searchText.trim().toLowerCase();
    render();
  }

  const signature = (d) =>
    JSON.stringify([
      state.mode,
      state.view,
      state.steamError,
      state.filter,
      state.searchText,
      state.searching,
      [...openGames],
      [...closedSections],
      d,
    ]);

  // Steam's own tree fills the open dock: only whether Friends is ready matters, not the list.
  function renderSteam() {
    const ready = Boolean(app());
    dock.hidden = !ready;
    if (!ready) return;
    state.data = null;
    state.sig = '';
    dock.dataset.mode = state.mode;
    dock.dataset.view = state.view;
    if (own.childNodes.length) own.textContent = '';
    showSteam();
  }

  function render(lazy) {
    if (state.destroyed) return;
    if (state.mode !== 'rail' && state.view === 'steam') return renderSteam();
    if (lazy && state.sig && state.data && performance.now() - state.readAt < 1000) return;
    state.readAt = performance.now();
    state.data = read();
    if (!state.data) {
      dock.hidden = true;
      return;
    }
    dock.hidden = false;
    const s = signature(state.data);
    if (s === state.sig) return;
    state.sig = s;

    const previousInput = own.querySelector('.se-fd-search input');
    const scroll = own.querySelector('.se-fd-scroll')?.scrollTop || 0;
    dock.dataset.mode = state.mode;
    dock.dataset.view = state.mode === 'rail' ? 'theme' : state.view;

    patchPanel(own, state.mode === 'rail' ? railHTML(state.data) : panelHTML(state.data));
    const sc = own.querySelector('.se-fd-scroll');
    if (sc) sc.scrollTop = scroll;
    const input = own.querySelector('.se-fd-search input');
    if (input && input !== previousInput && state.searching && document.hasFocus()) {
      input.focus();
    }
    if (state.flyGame) showFly(state.flyGame, true);
  }

  function onLibrary() {
    const p = run(() => mainWindow()?.LocationPathName);
    return p ? /^\/library\b/.test(p) : Boolean(document.querySelector(`.${C.GameListHomeAndSearch_Container}`));
  }

  const localSelector = `.${C.LocalContentContainer}`;

  function onStore() {
    const path = run(() => mainWindow()?.LocationPathName) || '';
    if (/^\/(?:store|community|browser)(?:\/|$)/i.test(path)) return true;
    const local = document.querySelector(localSelector);
    if (local?.hidden || local?.style.display === 'none') return true;
    if (path) return false;
    for (const owner of SE.owners()) {
      const manager = run(() => owner.MainWindowBrowserManager);
      const url = run(() => manager?.m_URLRequested || manager?.m_URL) || '';
      if (/^https?:\/\//i.test(url) && !onLibrary()) return true;
    }
    return false;
  }

  live.localObserver = undefined;
  let watchedLocal;

  function watchLocal() {
    const node = document.querySelector(localSelector);
    if (node === watchedLocal) return;
    live.localObserver?.disconnect();
    watchedLocal = node;
    if (!node) return;
    live.localObserver = new MutationObserver(() => place());
    live.localObserver.observe(node, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  }

  function place() {
    if (state.destroyed) return;
    watchLocal();
    const storePage = SE.railMode() && onStore();
    document.body.toggleAttribute('data-se-store-list', storePage);
    const show = !state.dockHidden && SE.railMode() && (onLibrary() || storePage || dock.dataset.chat === '1' || !chatError.hidden);
    const want = show ? state.mode : '';
    if (document.body.dataset.seFdock !== want) {
      if (want) document.body.dataset.seFdock = want;
      else delete document.body.dataset.seFdock;
    }
    if (show) {
      if (dock.parentElement !== document.body) document.body.appendChild(dock);
      if (fly.parentElement !== document.body) document.body.appendChild(fly);
      render(true);
    } else {
      dock.remove();
      hideFly(true);
    }
    ns.chatMinimize.hidden = dock.dataset.chat !== '1' || dock.dataset.chatMinimized === '1';
    ns.syncChatOverlay(show && storePage);
  }

  Object.assign(ns, { dock, fly, onAvatarError, onLibrary, onSearch, onStore, own, place, render });
})(window.__se);
