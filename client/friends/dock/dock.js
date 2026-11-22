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

  const { C } = SE;

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

  function reconcile(host, desired) {
    const existing = [...host.childNodes];
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
    if (state.flyKey) showFly(state.flyKey, true);
  }

  const onLibrary = SE.libraryShown;
  const onStore = SE.browserShown;
  const localSelector = `.${C.LocalContentContainer}`;

  live.localObserver = undefined;
  let watchedLocal;

  function watchLocal() {
    const node = document.querySelector(localSelector);
    if (node === watchedLocal) return;
    live.localObserver?.disconnect();
    watchedLocal = node;
    if (!node) return;
    // Own observer on purpose: one node's style/class/hidden; on the shared observer these attributes would be watched on every node in the window
    live.localObserver = new MutationObserver(() => place());
    live.localObserver.observe(node, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  }

  /*
   * The dock's Friends bar sits level with the game list's first collection header (Favorites):
   * its centre, measured while the list is at its top, sets --se-fd-bar-y, the bar's offset from
   * the top of Steam's header in the dock (friendListHeaderContainer, which holds the bar and the
   * favorites). Collection header: SE.C.HoverOverlay_Container (client/library/game-list.css).
   * A scrolled list keeps the last value.
   */
  const LIST_HEADER = `.${C.HoverOverlay_Container}`;
  const BAR_H = 30; // .socialListTab, client/friends/list/friends-search.css
  let barY = null;

  function scrollerOf(node) {
    for (let el = node.parentElement; el && el !== document.body; el = el.parentElement) {
      const { overflowY } = getComputedStyle(el);
      if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return el;
    }
    return null;
  }

  /*
   * The place is measured only after the header or Steam's list resized (barSizer), the game
   * list stopped scrolling (it may be back at its top), or either node changed: every dock pass
   * measuring it forced a layout of the whole window.
   */
  let barNodes = [];
  let barDirty = true;
  let barScrollTimer = 0;
  live.barSizer = undefined;
  live.barScroller = null;
  const remeasureBar = () => {
    barDirty = true;
    ns.schedule();
  };
  const onBarScroll = () => {
    clearTimeout(barScrollTimer);
    barScrollTimer = setTimeout(remeasureBar, 150);
  };
  live.releaseBar = () => {
    clearTimeout(barScrollTimer);
    live.barSizer?.disconnect();
    live.barScroller?.removeEventListener('scroll', onBarScroll);
    live.barScroller = null;
  };

  function alignBar() {
    const header = document.querySelector(LIST_HEADER);
    const content = dock.querySelector('.se-fd-steam .friendListHeaderContainer');
    if (header !== barNodes[0] || content !== barNodes[1]) {
      barNodes = [header, content];
      barDirty = true;
      live.barSizer ??= new ResizeObserver(remeasureBar);
      live.barSizer.disconnect();
      for (const node of barNodes) if (node) live.barSizer.observe(node);
    }
    if (!barDirty) return;
    barDirty = false;
    if (!header || !content || !header.getClientRects().length) return;
    // Measured only at the top: the list keeps only its rows in view, so once scrolled the first
    // header on the page is a later collection's, far down, and would push Steam's list out of the dock
    const scroller = scrollerOf(header);
    if (scroller !== live.barScroller) {
      live.barScroller?.removeEventListener('scroll', onBarScroll);
      live.barScroller = scroller;
      scroller?.addEventListener('scroll', onBarScroll, { passive: true });
    }
    if (scroller?.scrollTop) return;
    const box = header.getBoundingClientRect();
    const centre = box.top + box.height / 2;
    const y = Math.max(0, Math.round(centre - BAR_H / 2 - content.getBoundingClientRect().top));
    if (y === barY) return;
    barY = y;
    SE.cssVar(dock, '--se-fd-bar-y', `${y}px`);
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
      if (dock.dataset.mode === 'open') alignBar();
    } else {
      dock.remove();
      hideFly(true);
    }
    ns.chatMinimize.hidden = dock.dataset.chat !== '1' || dock.dataset.chatMinimized === '1';
    ns.syncChatOverlay(show && storePage);
  }

  Object.assign(ns, { dock, fly, onAvatarError, onLibrary, onSearch, onStore, own, place, render });
})(window.__se);
