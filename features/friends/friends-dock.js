/*
 * Right-hand Friends & Chat dock for Library and Store/Community views.
 *
 * - Expanded mode mounts Steam's native Friends & Chat tree inside `.se-fd-steam`
 *   (falling back to a lightweight FriendStore-driven panel if the webpack embed
 *   entry cannot be resolved).
 * - Collapsed mode renders a 60px avatar rail showing self status, active game
 *   groups (with hover flyout), online friends, and group chats.
 * - Clicking a friend or group opens an anchored chat flyout beside the dock,
 *   using a ReactDOM portal into a native context-menu popup when Store/Community
 *   browser surfaces are active.
 */
(window.__se
  ? (init) => init(window.__se)
  : (init) => addEventListener('se-core', () => init(window.__se), { once: true })
)((SE) => {
  window.__steamEnhancedFriendsDock?.destroy();
  if (!document.body) return;

  const COPY = {
    playing: 'Playing now',
    online: 'Online',
    away: 'Away',
    busy: 'Busy',
    snooze: 'Snooze',
    invisible: 'Invisible',
    offline: 'Offline',
    groups: 'Group chats',
    inGame: 'In game',
    search: 'Search friends',
    add: 'Add a friend',
    collapse: 'Collapse',
    expand: 'Show friends',
    lastOnline: (t) => `Last online ${t}`,
    more: (n) => `+${n}`,
    friendsIn: (n) => `${n} friend${n === 1 ? '' : 's'} playing`,
    message: 'Send message',
    profile: 'View profile',
    viewGame: (g) => `View ${g} in Library`,
    steamFailed: (r) => `Steam's Friends & Chat couldn't be shown here (${r}).`,
  };

  const { C, run, esc, mainWindow } = SE;

  const app = () => SE.global('g_FriendsUIApp', (a) => a.FriendStore);

  const ctx = (a) => run(() => a.GetDefaultBrowserContext());

  // webpack `alias = req(123)` import inside a module's source, resolved to that module.
  const importOf = (src, alias, req) => {
    const name = alias.replace(/[$]/g, '\\$&');
    const hit = new RegExp(`(?:^|[^\\w$])${name}\\s*=\\s*[\\w$]+\\(\\s*(\\d+)\\s*\\)`).exec(src);
    return hit ? run(() => req(hit[1])) : null;
  };

  const STATE = {
    0: 'offline',
    1: 'online',
    2: 'busy',
    3: 'away',
    4: 'snooze',
    5: 'online',
    6: 'online',
    7: 'invisible',
  };

  const friendsOf = (a) => run(() => a.FriendStore.all_friends) || [];

  function groupsOf(a) {
    const map = run(() => a.ChatStore.m_mapChatGroups);
    const list = map ? [...map.values()] : run(() => a.ChatStore.chatRoomGroups) || [];
    return list.filter((g) => g && run(() => g.BIsCurrentUserAMember()) !== false);
  }

  function ago(t) {
    if (!t) return '';
    const s = Date.now() / 1000 - t;
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    if (s < 172800) return 'yesterday';
    return `${Math.round(s / 86400)} days ago`;
  }

  function read() {
    const a = app();
    if (!a) return null;
    const self = run(() => a.FriendStore.self);
    const me = self && {
      name: run(() => self.display_name) || run(() => self.persona.m_strPlayerName) || '',
      avatar: run(() => self.persona.avatar_url_medium) || '',
      state: STATE[run(() => self.persona.m_ePersonaState)] || 'online',
    };

    const games = new Map();
    const online = [];
    const offline = [];

    for (const f of friendsOf(a)) {
      const p = f?.persona;
      if (!p) continue;
      const item = {
        id: run(() => f.accountid) ?? run(() => p.GetAccountID()),
        name: run(() => f.display_name) || p.m_strPlayerName || '',
        avatar: run(() => p.avatar_url_medium) || '',
        state: STATE[p.m_ePersonaState] || 'offline',
        last: run(() => p.last_seen_online) || 0,
      };
      if (run(() => p.is_ingame)) {
        const appid = p.m_unGamePlayedAppID || 0;
        const key = appid ? `a${appid}` : `n${run(() => p.GetCurrentGameName()) || ''}`;
        item.rp = run(() => p.GetCurrentGameRichPresence()) || COPY.inGame;
        let g = games.get(key);
        if (!g) {
          g = {
            key,
            appid,
            name: run(() => p.GetCurrentGameName()) || '',
            icon: run(() => p.GetCurrentGameIconURL()) || '',
            friends: [],
          };
          games.set(key, g);
        }
        g.friends.push(item);
      } else if (run(() => p.is_online)) {
        online.push(item);
      } else {
        offline.push(item);
      }
    }

    const byName = (x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: 'base' });
    const list = [...games.values()].sort((x, y) => y.friends.length - x.friends.length || x.name.localeCompare(y.name));
    for (const g of list) g.friends.sort(byName);
    online.sort((x, y) => (x.state !== 'online') - (y.state !== 'online') || byName(x, y));
    offline.sort((x, y) => (y.last || 0) - (x.last || 0));

    const groups = groupsOf(a)
      .map((g) => ({
        id: String(run(() => g.GetGroupID()) ?? run(() => g.m_ulGroupID) ?? ''),
        name: run(() => g.name) || '',
        avatar: groupAvatarURL(g),
      }))
      .filter((g) => g.id)
      .sort(byName);

    return { me, games: list, online, offline, groups };
  }

  const store = {
    get: (k, d) => {
      try {
        return localStorage.getItem(k) ?? d;
      } catch (_) {
        return d;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch (_) {}
    },
  };

  let dockHidden = store.get('se-fdock-hidden', '0') === '1';
  let manualWindowOpen = 0;
  let allowNativeWindow = false;
  let mode = store.get('se-fdock', 'open');
  let view = 'steam';
  let steamError = '';
  const flyoutOwnedTabs = new Map();
  let destroyed = false;
  let statusTimer = 0;
  const managerTimers = new Set();
  const openGames = new Set();
  const closedSections = new Set(['offline']);
  let firstGameOpened = false;
  let filter = '';
  let searchText = '';
  let searching = false;

  const ICON = {
    search:
      '<g fill="currentColor" fill-opacity=".32" stroke="none"><circle cx="11" cy="11" r="6.5"/></g><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    add:
      '<g fill="currentColor" fill-opacity=".32" stroke="none"><circle cx="9.5" cy="8" r="3.5"/></g><circle cx="9.5" cy="8" r="3.5"/><path d="M3 20c.8-3.4 3.4-5.2 6.5-5.2s5.7 1.8 6.5 5.2M19.5 8.5v6M16.5 11.5h6"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    game: '<rect x="3" y="7" width="18" height="11" rx="4"/><path d="M8 11v3M6.5 12.5h3M15.5 12h.01M18 13.5h.01"/>',
  };

  const svg = (n, s = 16) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

  // The collapse glyph is the shared token (tokens.css), drawn as a mask in currentColor.
  const COLLAPSE_ICON = '<span class="se-fd-mask" style="--se-fd-mask:var(--se-icon-collapse)" aria-hidden="true"></span>';

  const avatar = (url, state, size, cls = '') =>
    `<span class="se-fd-av ${cls}" data-state="${state}" style="--s:${size}px">${url ? `<img src="${esc(url)}" alt="" draggable="false">` : ''}</span>`;

  /*
   * Group chat avatars. A chat without its own art still reports an avatar URL, one with an
   * empty or all-zero hash that 404s, so the rail showed broken-image tiles. Such URLs are
   * dropped, any URL that fails to load is remembered (see onAvatarError), and both fall back
   * to the chat's initials, as Steam draws them.
   */
  const EMPTY_AVATAR = /\/(?:0{40})?(?:_medium|_full)?\.jpg(?:[?#]|$)/i;
  const deadAvatars = new Set();
  const DEAD_AVATAR_LIMIT = 200;

  const usableAvatar = (url) =>
    typeof url === 'string' && /^https?:\/\//i.test(url) && !EMPTY_AVATAR.test(url) && !deadAvatars.has(url) ? url : '';

  function groupAvatarURL(g) {
    for (const key of ['avatar_url_medium', 'avatar_url_full', 'avatar_url']) {
      const url = usableAvatar(run(() => g[key]));
      if (url) return url;
    }
    return '';
  }

  const initials = (name) =>
    String(name || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => [...word][0])
      .join('')
      .toUpperCase() || '#';

  const groupInitials = (text) => `<b class="se-fd-ginit" aria-hidden="true">${esc(text)}</b>`;

  const groupAvatar = (name, url) => {
    const text = initials(name);
    return `<span class="se-fd-gav" data-initials="${esc(text)}">${
      url ? `<img src="${esc(url)}" alt="" draggable="false">` : groupInitials(text)
    }</span>`;
  };

  const gameIcon = (g, size, badge) =>
    `<span class="se-fd-gicon" style="--s:${size}px">${g.icon ? `<img src="${esc(g.icon)}" alt="" draggable="false">` : svg('game', Math.round(size * 0.55))}${badge ? `<b>${badge}</b>` : ''}</span>`;

  const statusLabel = (st) => COPY[st] || COPY.online;
  const match = (name) => !filter || name.toLowerCase().includes(filter);

  const friendRow = (f, sub, compact) =>
    `<div class="se-fd-row${compact ? ' se-fd-compact' : ''}" data-friend="${f.id}" role="button" tabindex="0">${avatar(f.avatar, f.state, compact ? 28 : 30)}` +
    `<div class="se-fd-text"><div class="se-fd-name">${esc(f.name)}</div><div class="se-fd-sub" data-state="${f.state}">${esc(sub)}</div></div></div>`;

  function section(key, title, count, body) {
    const closed = closedSections.has(key);
    return (
      `<div class="se-fd-head" data-section="${key}" role="button" tabindex="0" aria-expanded="${!closed}"><span class="se-fd-chev">${svg('down', 14)}</span>` +
      `<span class="se-fd-label">${esc(title)}</span><span class="se-fd-count">${count}</span></div>${closed ? '' : body}`
    );
  }

  function gameRow(g) {
    const fs = g.friends.filter((f) => match(f.name));
    if (!fs.length) return '';
    const open = openGames.has(g.key) || Boolean(filter);
    const who =
      fs
        .slice(0, 2)
        .map((f) => f.name)
        .join(', ') + (fs.length > 2 ? ` ${COPY.more(fs.length - 2)}` : '');
    return (
      `<div class="se-fd-game${open ? ' se-fd-open' : ''}" data-game="${esc(g.key)}" role="button" tabindex="0" aria-expanded="${open}">${gameIcon(g, 34, fs.length)}` +
      `<div class="se-fd-text"><div class="se-fd-name">${esc(g.name)}</div><div class="se-fd-sub">${esc(who)}</div></div><span class="se-fd-chev">${svg('chev', 14)}</span></div>` +
      (open ? `<div class="se-fd-thread">${fs.map((f) => friendRow(f, f.rp, true)).join('')}</div>` : '')
    );
  }

  const header = (me) =>
    `<div class="se-fd-me">${avatar(me?.avatar, me?.state || 'online', 36)}` +
    `<button type="button" class="se-fd-status" data-act="status"><span class="se-fd-myname">${esc(me?.name || '')}</span><span class="se-fd-mystate" data-state="${me?.state || 'online'}">${esc(statusLabel(me?.state))}${svg('down', 12)}</span></button>` +
    `<button type="button" class="se-fd-icon" data-act="search" data-se-tip="${COPY.search}" aria-label="${COPY.search}">${svg('search', 20)}</button>` +
    `<button type="button" class="se-fd-icon" data-act="add" data-se-tip="${COPY.add}" aria-label="${COPY.add}">${svg('add', 20)}</button>` +
    `<button type="button" class="se-fd-icon" data-act="collapse" data-se-tip="${COPY.collapse}" aria-label="${COPY.collapse}">${COLLAPSE_ICON}</button></div>` +
    (steamError ? `<div class="se-fd-error">${esc(steamError)}</div>` : '');

  function panelHTML(d) {
    if (!firstGameOpened && d.games.length) {
      openGames.add(d.games[0].key);
      firstGameOpened = true;
    }
    const games = d.games.map(gameRow).join('');
    const on = d.online.filter((f) => match(f.name));
    const off = d.offline.filter((f) => match(f.name));
    const gr = d.groups.filter((g) => match(g.name));

    return (
      header(d.me) +
      (searching
        ? `<label class="se-fd-search">${svg('search', 14)}<input type="search" spellcheck="false" placeholder="${COPY.search}" value="${esc(searchText)}"></label>`
        : '') +
      '<div class="se-fd-scroll">' +
      (games ? `<div class="se-fd-label se-fd-pad">${COPY.playing}</div>${games}` : '') +
      section('online', COPY.online, on.length, on.map((f) => friendRow(f, statusLabel(f.state))).join('')) +
      section(
        'offline',
        COPY.offline,
        off.length,
        off.map((f) => friendRow(f, f.last ? COPY.lastOnline(ago(f.last)) : COPY.offline)).join('')
      ) +
      (d.groups.length
        ? section(
            'groups',
            COPY.groups,
            gr.length,
            gr
              .map(
                (g) =>
                  `<div class="se-fd-row" data-group="${esc(g.id)}" role="button" tabindex="0">${groupAvatar(g.name, g.avatar)}<div class="se-fd-text"><div class="se-fd-name">${esc(g.name)}</div></div></div>`
              )
              .join('')
          )
        : '') +
      '</div>'
    );
  }

  function railHTML(d) {
    return (
      `<button type="button" class="se-fd-railme" data-act="expand" data-se-tip="${COPY.expand}" aria-label="${COPY.expand}">${avatar(d.me?.avatar, d.me?.state || 'online', 34)}</button>` +
      (d.games.length ? '<i class="se-fd-rule"></i>' : '') +
      d.games
        .map(
          (g) =>
            `<button type="button" class="se-fd-railgame" data-game="${esc(g.key)}" aria-label="${esc(g.name)}">${gameIcon(g, 38, g.friends.length)}</button>`
        )
        .join('') +
      (d.online.length ? '<i class="se-fd-rule"></i>' : '') +
      d.online
        .map(
          (f) =>
            `<button type="button" class="se-fd-railfriend" data-friend="${f.id}" data-se-tip="${esc(f.name)} · ${esc(statusLabel(f.state))}" aria-label="${esc(f.name)}">${avatar(f.avatar, f.state, 32)}</button>`
        )
        .join('') +
      (d.groups.length ? '<i class="se-fd-rule"></i>' : '') +
      d.groups
        .map(
          (g) =>
            `<button type="button" class="se-fd-railgroup" data-group="${esc(g.id)}" data-se-tip="${esc(g.name)}" aria-label="${esc(g.name)}">${groupAvatar(g.name, g.avatar)}</button>`
        )
        .join('')
    );
  }

  // Non-Steam games (appid 0) have no store header: the card keeps its plain surface.
  const flyHTML = (g) =>
    `<div class="se-fd-flyhead"${g.appid ? ` style="--art:url('https://shared.steamstatic.com/store_item_assets/steam/apps/${g.appid}/header.jpg')"` : ''}>` +
    `${gameIcon(g, 30)}<div><div class="se-fd-name">${esc(g.name)}</div><div class="se-fd-sub se-fd-green">${esc(COPY.friendsIn(g.friends.length))}</div></div></div>` +
    `<div class="se-fd-flybody">${g.friends.map((f) => friendRow(f, f.rp, true)).join('')}</div>`;

  const dock = document.createElement('aside');
  dock.className = 'se-fdock';
  dock.setAttribute('aria-label', 'Friends');

  const own = document.createElement('div');
  own.className = 'se-fd-own';
  dock.appendChild(own);

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

  dock.addEventListener('error', onAvatarError, true);

  const fly = document.createElement('div');
  fly.className = 'se-fd-fly';

  let data = null;
  let sig = '';
  let flyGame = null;
  let flyTimer = 0;

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
    searchText = event.target.value;
    filter = searchText.trim().toLowerCase();
    render();
  }

  own.addEventListener('input', onSearch);
  own.addEventListener('compositionend', onSearch);
  own.addEventListener('keydown', (event) => {
    if (!event.target.matches('.se-fd-search input')) return;
    event.stopPropagation();
    if (event.key === 'Escape') {
      filter = '';
      searchText = '';
      searching = false;
      render();
    }
  });

  const signature = (d) =>
    JSON.stringify([
      mode,
      view,
      steamError,
      filter,
      searchText,
      searching,
      [...openGames],
      [...closedSections],
      d,
    ]);

  let readAt = 0;

  // Steam's own tree fills the open dock: only whether Friends is ready matters, not the list.
  function renderSteam() {
    const ready = Boolean(app());
    dock.hidden = !ready;
    if (!ready) return;
    data = null;
    sig = '';
    dock.dataset.mode = mode;
    dock.dataset.view = view;
    if (own.childNodes.length) own.textContent = '';
    showSteam();
  }

  function render(lazy) {
    if (destroyed) return;
    if (mode !== 'rail' && view === 'steam') return renderSteam();
    if (lazy && sig && data && performance.now() - readAt < 1000) return;
    readAt = performance.now();
    data = read();
    if (!data) {
      dock.hidden = true;
      return;
    }
    dock.hidden = false;
    const s = signature(data);
    if (s === sig) return;
    sig = s;

    const previousInput = own.querySelector('.se-fd-search input');
    const scroll = own.querySelector('.se-fd-scroll')?.scrollTop || 0;
    dock.dataset.mode = mode;
    dock.dataset.view = mode === 'rail' ? 'theme' : view;

    patchPanel(own, mode === 'rail' ? railHTML(data) : panelHTML(data));
    const sc = own.querySelector('.se-fd-scroll');
    if (sc) sc.scrollTop = scroll;
    const input = own.querySelector('.se-fd-search input');
    if (input && input !== previousInput && searching && document.hasFocus()) {
      input.focus();
    }
    if (flyGame) showFly(flyGame, true);
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

  let localObserver;
  let watchedLocal;

  function watchLocal() {
    const node = document.querySelector(localSelector);
    if (node === watchedLocal) return;
    localObserver?.disconnect();
    watchedLocal = node;
    if (!node) return;
    localObserver = new MutationObserver(() => place());
    localObserver.observe(node, { attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  }

  function place() {
    if (destroyed) return;
    watchLocal();
    const storePage = SE.railMode() && onStore();
    document.body.toggleAttribute('data-se-store-list', storePage);
    const show = !dockHidden && SE.railMode() && (onLibrary() || storePage || dock.dataset.chat === '1' || !chatError.hidden);
    const want = show ? mode : '';
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
    chatMinimize.hidden = dock.dataset.chat !== '1' || dock.dataset.chatMinimized === '1';
    syncChatOverlay(show && storePage);
  }

  const steamHost = document.createElement('div');
  steamHost.className = 'se-fd-steam friendsui-container client_chat_frame fullheight';
  const steamBar = document.createElement('div');
  steamBar.className = 'se-fd-steambar';

  let steamMounted = false;
  let steamRoot = null;
  let chatContext = null;
  let activeChatFriend = null;
  let dockTabs = null;

  const chatBack = document.createElement('button');
  chatBack.type = 'button';
  chatBack.className = 'se-fd-chat-back';
  chatBack.textContent = '×';
  chatBack.setAttribute('aria-label', 'Close chat');
  chatBack.hidden = true;
  dock.appendChild(chatBack);

  const chatMinimize = document.createElement('button');
  chatMinimize.type = 'button';
  chatMinimize.className = 'se-fd-chat-back se-fd-chat-minimize';
  chatMinimize.textContent = '−';
  chatMinimize.hidden = true;
  chatMinimize.setAttribute('aria-label', 'Minimize chat');
  dock.appendChild(chatMinimize);

  const chatChip = document.createElement('button');
  chatChip.type = 'button';
  chatChip.className = 'se-fd-chat-chip';
  chatChip.hidden = true;

  const chipAvatar = document.createElement('span');
  const chipText = document.createElement('span');
  const chipName = document.createElement('span');
  const chipCount = document.createElement('span');
  const chipChevron = document.createElement('span');
  chipAvatar.className = 'se-fd-chat-chip-avatar';
  chipText.className = 'se-fd-chat-chip-text';
  chipName.className = 'se-fd-chat-chip-name';
  chipCount.className = 'se-fd-chat-chip-count';
  chipChevron.className = 'se-fd-chat-chip-chevron';
  chipChevron.innerHTML = svg('chev', 16);
  chipText.append(chipName, chipCount);
  chatChip.append(chipAvatar, chipText, chipChevron);
  /* The chip can sit outside the dock (Store/Community pages), so it listens too */
  chatChip.addEventListener('error', onAvatarError, true);
  dock.append(chatChip);

  let chatPopup = null;
  let popupRuntime = null;
  let popupFailure = false;
  let popupRuntimeFailure = '';

  // React, the window's context-menu manager and ReactDOM's createPortal/flushSync, for the Store popup.
  function findChatPopupRuntime() {
    if (popupRuntime) return popupRuntime;
    const found = {};
    const complete = () =>
      found.React && found.manager && found.createPortal && found.flushSync ? { ...found } : null;
    const inspect = (exp) => {
      const values = [exp];
      try {
        values.push(...Object.values(exp || {}));
      } catch (_) {}
      for (const value of values) {
        if (typeof value?.createPortal === 'function') found.createPortal ||= value.createPortal;
        if (typeof value?.flushSync === 'function') found.flushSync ||= value.flushSync;
        if (!found.React && typeof value?.createElement === 'function' && typeof value?.useState === 'function') {
          found.React = value;
        }
        if (!found.manager) {
          const candidate = run(() => value?.m_mapManagers?.get(window));
          if (typeof candidate?.CreateContextMenuInstance === 'function') found.manager = candidate;
        }
      }
    };

    for (const req of SE.requires()) {
      for (const module of Object.values(req.c || {})) inspect(module?.exports);
    }
    popupRuntime =
      complete() ||
      SE.findModule('friends-dock:popup-runtime', (source, id, req) => {
        if (
          (!found.manager && source.includes('GetContextMenuManagerFromWindow') && source.includes('m_mapManagers')) ||
          (!found.React && source.includes('createElement') && source.includes('useState') && source.includes('Fragment'))
        ) {
          run(() => inspect(req(id)));
        }
        if ((!found.createPortal || !found.flushSync) && source.includes('.createPortal')) {
          for (const call of source.matchAll(/([\w$]+)\.createPortal\b/g)) {
            inspect(importOf(source, call[1], req));
            if (found.createPortal && found.flushSync) break;
          }
          if (!found.createPortal || !found.flushSync) run(() => inspect(req(id)));
        }
        return complete();
      });

    popupRuntimeFailure = popupRuntime
      ? ''
      : [
          !found.React && 'React',
          !found.manager && 'context-menu manager',
          !found.createPortal && 'ReactDOM portal',
          !found.flushSync && 'ReactDOM synchronous commit',
        ]
          .filter(Boolean)
          .join(', ');
    return popupRuntime;
  }

  let portalTarget = null;
  let chatRenderer = null;
  const chatRoot = () => chatPopup?.chatHost || steamHost;

  function findChatAncestry(panel) {
    let chatFiber;
    let parent;
    let ownerContext;
    let modalContext;

    for (let fiber = panel && SE.fiber(panel); fiber; fiber = fiber.return) {
      const instance = fiber.stateNode;
      const props = fiber.memoizedProps;
      if (fiber.tag === 10 && props?.value?.ownerWindow && !ownerContext) {
        ownerContext = { Type: fiber.type, value: props.value };
      }
      if (!modalContext && props?.browserInfo && 'bUsePopups' in props && typeof fiber.type !== 'string') {
        modalContext = {
          Type: fiber.elementType || fiber.type,
          browserInfo: props.browserInfo,
          DialogWrapper: props.DialogWrapper,
          bUseDialogElement: props.bUseDialogElement,
        };
      }
      if (!chatFiber && typeof instance?.OnChatTabRef === 'function' && instance.props?.tabs) {
        chatFiber = fiber;
        continue;
      }
      if (
        chatFiber &&
        typeof instance?.forceUpdate === 'function' &&
        instance.props?.tabset === chatFiber.stateNode.props.tabs &&
        !parent
      ) {
        parent = instance;
      }
    }

    if (!chatFiber || !parent) {
      throw new Error(panel ? 'Chat component not found in React ancestry' : 'Chat panel has not mounted');
    }
    if (!ownerContext || !modalContext) {
      throw new Error('Steam popup context providers unavailable');
    }
    return { chatFiber, parent, ownerContext, modalContext };
  }

  function setChatPortal(target, runtime) {
    if (target && !chatRenderer) {
      const { chatFiber, parent, ownerContext, modalContext } = findChatAncestry(
        steamHost.querySelector('.multiChatDialog')
      );
      const jsx = findEmbed()?.jsx;
      if (!jsx) throw new Error('Steam JSX runtime unavailable');
      const type = chatFiber.type;
      const tabs = chatFiber.stateNode.props.tabs;
      const ref = parent.m_refChatDialog || chatFiber.ref;
      const patches = [];

      try {
        for (const name of ['jsx', 'jsxs']) {
          const ownDesc = Object.getOwnPropertyDescriptor(jsx, name);
          if (!ownDesc || typeof ownDesc.value !== 'function' || !ownDesc.writable) continue;
          const original = ownDesc.value;
          const wrapper = function (Type, props, ...rest) {
            const element = original.call(this, Type, props, ...rest);
            const matches = props?.tabs === tabs && (ref ? props.ref === ref : Type === type);
            if (!portalTarget || !matches) return element;
            chatRenderer.matches++;
            const ownerWindow = portalTarget.ownerDocument.defaultView;

            // Rebase Steam's window and manager context providers to the popup document
            // so dialogs/context menus spawned from chat do not target the Library window.
            const localManagers = runtime.React.createElement(
              modalContext.Type,
              {
                browserInfo: modalContext.browserInfo,
                DialogWrapper: modalContext.DialogWrapper,
                bUseDialogElement: modalContext.bUseDialogElement,
                bUsePopups: true,
                bOnlyPopups: true,
                bRenderOverlayAtRoot: false,
                bRegisterManagersWithWindow: true,
                refModalManager: chatPopup?.modalRef,
                refContextMenuManager: chatPopup?.menuRef,
              },
              element
            );
            const content = runtime.React.createElement(
              ownerContext.Type,
              { value: { ...ownerContext.value, ownerWindow } },
              localManagers
            );
            return runtime.createPortal(content, portalTarget, 'se-chat-flyout');
          };
          Object.defineProperty(jsx, name, { ...ownDesc, value: wrapper });
          patches.push({ name, own: ownDesc, wrapper });
        }
        if (!patches.length) throw new Error('Steam JSX runtime is read-only');
        chatRenderer = { parent, jsx, patches, matches: 0, flushSync: runtime.flushSync };
      } catch (error) {
        for (const patch of patches) Object.defineProperty(jsx, patch.name, patch.own);
        throw error;
      }
    }
    portalTarget = target;
    if (chatRenderer) chatRenderer.flushSync(() => chatRenderer.parent.forceUpdate());
  }

  function restoreChatRenderer() {
    portalTarget = null;
    if (!chatRenderer) return;
    const { jsx, patches } = chatRenderer;
    for (const patch of patches) {
      if (jsx[patch.name] === patch.wrapper) {
        Object.defineProperty(jsx, patch.name, patch.own);
      }
    }
    chatRenderer = null;
  }

  function returnChatHost(entry) {
    if (entry.restored) return;
    entry.restored = true;
    run(() => entry.restorePositioner?.());
    clearTimeout(entry.portalTimer);
    run(() => entry.doc?.defaultView?.removeEventListener('beforeunload', entry.onClose));
    try {
      setChatPortal(null);
    } catch (error) {
      console.warn('[Steam Enhanced] return chat portal', error);
    } finally {
      run(restoreChatRenderer);
      for (const type of interactionEvents) {
        run(() => entry.chatHost?.removeEventListener(type, markDockInteraction, true));
      }
      run(() => entry.chatObserver?.disconnect());
      run(() => entry.detachChatEnhancements?.());
      run(disposeGroupFlyouts);
      run(() => dock.append(chatBack, chatMinimize, chatChip));
    }
  }

  function closeChatPopup() {
    const entry = chatPopup;
    if (!entry) return;
    chatPopup = null;
    returnChatHost(entry);
    run(() => entry.handle?.Hide());
    run(() => entry.manager?.ReleaseHiddenMenu?.(entry.handle));
    entry.anchor?.remove();
  }

  /*
   * The flyout's box follows only the window size, the dock's mode and the kind of chat, so the
   * layout reads (computed style, dock rect) happen when one of those changes, not every frame.
   */
  let geometryCache = null;

  function chatGeometry(minimized) {
    const group =
      Boolean(chatRoot().querySelector('.MultiUserChat:not([data-activechat="false"])')) ||
      Boolean(run(() => dockTabs?.activeTab?.GetChatRoomGroup?.()) || run(() => dockTabs?.activeTab?.m_group)) ||
      Boolean(findGroup(activeChatFriend));
    const key = [innerWidth, innerHeight, minimized, group, dock.dataset.mode, dock.isConnected].join('|');
    if (geometryCache?.key !== key) geometryCache = { key, value: measureChat(minimized, group) };
    return geometryCache.value;
  }

  function measureChat(minimized, group) {
    const style = getComputedStyle(dock);
    const pixels = (name) => parseFloat(style.getPropertyValue(name)) || 0;
    const edge = pixels('--se-chat-edge');
    const bottom = pixels('--se-chat-bottom');
    const rect = dock.getBoundingClientRect();
    const dockWidth = rect.width;
    const maximumWidth = pixels(minimized ? '--se-chat-chip-width' : group ? '--se-chat-group-width' : '--se-chat-width');
    const width = Math.max(1, Math.min(maximumWidth, innerWidth - dockWidth - edge * 2));
    const height = minimized
      ? pixels('--se-chat-chip-height')
      : Math.max(1, Math.min(pixels('--se-chat-max-height'), innerHeight - pixels('--se-chat-height-clearance')));
    const left = Math.max(edge, rect.left - edge - width);
    const top = Math.max(0, innerHeight - bottom - height);
    return { width, height, edge, bottom, left, top };
  }

  function positionChatPopup(entry) {
    if (entry.restored || chatPopup !== entry) return;
    const nativeWindow = entry.doc?.defaultView?.SteamClient?.Window;
    if (typeof nativeWindow?.PositionWindowRelative !== 'function') return;
    entry.restoreDetails ||= Promise.resolve().then(() => window.SteamClient.Window.GetWindowRestoreDetails());
    entry.restoreDetails
      .then((details) => {
        entry.restoreDetails = null;
        if (entry.restored || chatPopup !== entry) return;
        const geometry = chatGeometry(entry.minimized);
        const left = Math.max(geometry.edge, dock.getBoundingClientRect().left - geometry.edge - entry.width);
        const top = Math.max(0, innerHeight - geometry.bottom - entry.height);
        nativeWindow.PositionWindowRelative(details, left, top, entry.width, entry.height);
      })
      .catch(() => {
        entry.restoreDetails = null;
      });
  }

  function resizeChatPopup(entry, minimized, geometry) {
    entry.minimized = minimized;
    entry.width = geometry.width;
    entry.height = geometry.height;
    entry.left = geometry.left;
    entry.top = geometry.top;

    const node = entry.node;
    const root = entry.doc.documentElement;
    if (!entry.restorePositioner) {
      for (let fiber = SE.fiber(node); fiber; fiber = fiber.return) {
        const instance = fiber.stateNode;
        if (typeof instance?.PositionMenu !== 'function' || typeof instance?.PositionPopupWindow !== 'function') {
          continue;
        }
        const ownDesc = Object.getOwnPropertyDescriptor(instance, 'PositionPopupWindow');
        if (ownDesc && !ownDesc.configurable) break;
        const position = () => positionChatPopup(entry);
        Object.defineProperty(instance, 'PositionPopupWindow', {
          configurable: true,
          writable: true,
          value: position,
        });
        entry.restorePositioner = () => {
          if (instance.PositionPopupWindow !== position) return;
          if (ownDesc) Object.defineProperty(instance, 'PositionPopupWindow', ownDesc);
          else delete instance.PositionPopupWindow;
        };
        break;
      }
    }

    for (const element of [node, root]) {
      element.style.setProperty('--se-chat-host-width', `${entry.width}px`);
      element.style.setProperty('--se-chat-host-height', `${entry.height}px`);
    }
    node.style.setProperty('--se-chat-height', `${entry.height}px`);

    const menuElement = entry.handle?.m_element;
    if (menuElement?.style) {
      menuElement.style.setProperty('width', `${entry.width}px`, 'important');
      menuElement.style.setProperty('height', `${entry.height}px`, 'important');
      menuElement.style.setProperty('min-width', '0px', 'important');
      menuElement.style.setProperty('min-height', '0px', 'important');
    }

    if (minimized) {
      node.dataset.chatMinimized = '1';
      root.dataset.seChatMinimized = '1';
    } else {
      delete node.dataset.chatMinimized;
      delete root.dataset.seChatMinimized;
    }

    entry.sizeSignal.replaceChildren(entry.doc.createTextNode(''));
    positionChatPopup(entry);
  }

  let restoringChat = false;
  let overlayWasEnabled = false;
  let chatNavigationUntil = 0;
  let chatNavigation = null;
  let navigationFrame = 0;

  function cancelChatNavigation() {
    chatNavigation = null;
    if (navigationFrame) cancelAnimationFrame(navigationFrame);
    navigationFrame = 0;
  }

  function beginChatNavigation(kind, destination) {
    if (dock.dataset.chat !== '1') return;
    const saved = chatNavigation?.minimized ?? (dock.dataset.chatMinimized === '1');
    cancelChatNavigation();
    const transaction = (chatNavigation = {
      minimized: saved,
      kind,
      destination: typeof destination === 'string' ? destination : '',
      signature: '',
      stable: 0,
      deadline: performance.now() + 1200,
    });
    closeChatPopup();

    const settle = () => {
      navigationFrame = 0;
      if (destroyed || chatNavigation !== transaction || dock.dataset.chat !== '1') return;
      const path = run(() => mainWindow()?.LocationPathName) || '';
      let requested = '';
      let current = '';
      for (const owner of SE.owners()) {
        const manager = run(() => owner.MainWindowBrowserManager);
        requested ||= run(() => manager?.m_URLRequested) || '';
        current ||= run(() => manager?.m_URL) || '';
      }
      const browser = onStore();
      const ready =
        transaction.kind === 'route'
          ? !transaction.destination || path === transaction.destination || path.startsWith(`${transaction.destination}/`)
          : browser &&
            (!transaction.destination ||
              current === transaction.destination ||
              (!current && requested === transaction.destination));
      const sigStr = JSON.stringify([path, requested, current, browser]);
      transaction.stable = ready && sigStr === transaction.signature ? transaction.stable + 1 : 0;
      transaction.signature = sigStr;
      if (transaction.stable < 2 && performance.now() < transaction.deadline) {
        navigationFrame = requestAnimationFrame(settle);
        return;
      }
      chatNavigation = null;
      requestChatHandoff();
      if (transaction.minimized) {
        dock.dataset.chatMinimized = '1';
        chatChip.hidden = false;
        chatBack.hidden = true;
      } else {
        resetMinimized();
        chatBack.hidden = false;
      }
      restoringChat = true;
      try {
        place();
      } finally {
        restoringChat = false;
      }
    };
    navigationFrame = requestAnimationFrame(settle);
  }

  function mountChatPopupDocument(node, entry, runtime) {
    if (!node || chatPopup !== entry || entry.restored || entry.doc) return;
    const doc = node.ownerDocument;
    entry.doc = doc;
    entry.node = node;

    // The popup's title ends in "Menu", so only the `.*` patches reach it; scrollbars.css is one.
    for (const sheet of document.querySelectorAll('link[rel="stylesheet"]')) {
      if (!/(?:shared\/(?:tokens|icons)|features\/friends\/(?:friends|chat|friends-dock))\.css(?:[?#]|$)/.test(sheet.href)) {
        continue;
      }
      if ([...doc.querySelectorAll('link[rel="stylesheet"]')].some((link) => link.href === sheet.href)) continue;
      const copy = sheet.cloneNode(true);
      copy.href = sheet.href;
      doc.head.appendChild(copy);
    }

    doc.documentElement.classList.add('se-chat-popup-document');
    delete doc.documentElement.dataset.seChatMinimized;
    doc.documentElement.style.removeProperty('--se-chat-host-width');
    doc.documentElement.style.removeProperty('--se-chat-host-height');
    if (entry.minimized) {
      doc.documentElement.dataset.seChatMinimized = '1';
      doc.documentElement.style.setProperty('--se-chat-host-width', `${entry.width}px`);
      doc.documentElement.style.setProperty('--se-chat-host-height', `${entry.height}px`);
    }

    window.__steamEnhancedChat?.attachDocument(doc);
    entry.detachChatEnhancements = () => window.__steamEnhancedChat?.detachDocument(doc);

    node.className = 'se-fdock se-fd-popup-host';
    node.dataset.mode = 'rail';
    node.dataset.chat = '1';
    node.style.setProperty('--se-chat-host-width', `${entry.width}px`);
    node.style.setProperty('--se-chat-host-height', `${entry.height}px`);
    node.style.setProperty('--se-chat-height', `${entry.height}px`);
    node.style.setProperty('--se-chat-right', '0px');
    node.style.setProperty('--se-chat-bottom', '0px');
    node.style.setProperty('--se-chat-edge', '0px');
    if (entry.minimized) node.dataset.chatMinimized = '1';
    node.append(chatChip);

    const shell = doc.createElement('div');
    shell.className = 'se-fd-steam friendsui-container client_chat_frame fullheight';
    shell.innerHTML = '<div class="chat_main"><div class="chat_main_flex"></div></div>';
    node.append(shell, chatBack, chatMinimize);
    entry.chatHost = shell;
    for (const type of interactionEvents) {
      shell.addEventListener(type, markDockInteraction, true);
    }
    entry.chatObserver = new MutationObserver(schedule);
    entry.chatObserver.observe(shell, { childList: true, subtree: true });

    let attempts = 0;
    const attach = () => {
      if (chatPopup !== entry || entry.restored || destroyed) return;
      try {
        setChatPortal(shell.querySelector('.chat_main_flex'), runtime);
        if (!shell.querySelector('.multiChatDialog')) {
          throw new Error(`Chat portal has not committed (${chatRenderer?.matches || 0} matches)`);
        }
      } catch (error) {
        if (++attempts < 20 && /not mounted|not found in React ancestry|has not committed/.test(error.message)) {
          entry.portalTimer = setTimeout(attach, attempts < 5 ? 16 : 50);
          return;
        }
        queueMicrotask(() => {
          if (chatPopup !== entry) return;
          closeChatPopup();
          popupFailure = true;
          chatErrorText.textContent = `Unable to separate chat: ${error.message}.`;
          chatError.hidden = false;
          console.warn('[Steam Enhanced] chat portal', error);
        });
      }
    };
    queueMicrotask(attach);

    entry.sizeSignal = doc.createElement('span');
    entry.sizeSignal.hidden = true;
    node.append(entry.sizeSignal);
    resizeChatPopup(entry, entry.minimized, entry);
    doc.defaultView.addEventListener('beforeunload', entry.onClose);
  }

  function syncChatOverlay(enabled) {
    if (chatNavigation) return;
    const enteringBrowser = enabled && !overlayWasEnabled;
    if (enabled !== overlayWasEnabled && dock.dataset.chat === '1') {
      chatNavigationUntil = performance.now() + 1500;
    }
    overlayWasEnabled = enabled;
    const minimized = dock.dataset.chatMinimized === '1';

    if (!enabled || dock.dataset.chat !== '1') {
      closeChatPopup();
      popupFailure = false;
      return;
    }

    const geometry = chatGeometry(minimized);
    if (
      chatPopup &&
      chatPopup.minimized === minimized &&
      chatPopup.width === geometry.width &&
      chatPopup.height === geometry.height &&
      chatPopup.left === geometry.left &&
      chatPopup.top === geometry.top
    ) {
      return;
    }
    if (chatPopup?.node && !chatPopup.restored && chatPopup.handle?.visible) {
      resizeChatPopup(chatPopup, minimized, geometry);
      return;
    }
    if (
      !minimized &&
      !restoringChat &&
      !enteringBrowser &&
      performance.now() > chatNavigationUntil &&
      !desktopChatFocused()
    ) {
      return;
    }

    closeChatPopup();
    if (popupFailure) return;
    keepLibraryManagers();
    const runtime = findChatPopupRuntime();
    if (!runtime) {
      popupFailure = true;
      chatErrorText.textContent = `Steam chat popup unavailable (${popupRuntimeFailure}). Return to Library to use the flyout.`;
      chatError.hidden = false;
      return;
    }
    if (runtime.manager.ActiveMenu?.visible) return;

    const { width, height, edge, bottom, left, top } = geometry;
    const anchor = document.createElement('span');
    anchor.setAttribute('aria-hidden', 'true');
    anchor.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;width:0;height:0';
    anchor.getBoundingClientRect = () => {
      const anchorLeft = dock.getBoundingClientRect().left - edge;
      return new DOMRect(Math.max(edge, anchorLeft), Math.max(0, innerHeight - bottom), 0, 0);
    };
    document.body.appendChild(anchor);

    const entry = {
      minimized,
      width,
      height,
      left,
      top,
      anchor,
      manager: runtime.manager,
      handle: null,
      restored: false,
      doc: null,
      modalRef: { current: null },
      menuRef: { current: null },
    };

    entry.onClose = () => {
      if (chatPopup !== entry) return;
      chatPopup = null;
      returnChatHost(entry);
      entry.anchor.remove();
      queueMicrotask(() => run(() => entry.manager.ReleaseHiddenMenu?.(entry.handle)));
      queueMicrotask(() => {
        if (destroyed || dock.dataset.chat !== '1') return;
        if (!chatPopup) place();
      });
    };

    const mount = (node) => mountChatPopupDocument(node, entry, runtime);
    try {
      chatPopup = entry;
      entry.handle = runtime.manager.CreateContextMenuInstance(
        runtime.React.createElement('div', { ref: mount }),
        anchor,
        undefined,
        undefined,
        {
          bForcePopup: true,
          bStandalone: true,
          bDisableMouseOverlay: true,
          bOverlapHorizontal: false,
          bOverlapVertical: true,
          bPreferPopLeft: true,
          bPreferPopTop: true,
          bFitToWindow: true,
          bShiftToFitWindow: true,
          bGrowToElementWidth: false,
          bSkipFocusWhenReady: true,
          bNoFocusWhenShown: true,
          strClassName: 'se-chat-context-popup',
          title: 'Steam Enhanced Chat Flyout Menu',
        }
      );
      if (
        typeof entry.handle?.Show !== 'function' ||
        typeof entry.handle?.Hide !== 'function' ||
        typeof entry.handle?.SetOnHideCallback !== 'function'
      ) {
        throw new Error('No native context-popup handle');
      }
      entry.handle.TakeFocus = () => {};
      const cancel = entry.handle.OnCancel;
      if (typeof cancel === 'function') {
        entry.handle.OnCancel = function (...args) {
          if (chatPopup === entry) return undefined;
          return cancel.apply(this, args);
        };
      }
      entry.handle.SetOnHideCallback(entry.onClose);
      entry.handle.Show();
    } catch (error) {
      closeChatPopup();
      popupFailure = true;
      chatErrorText.textContent = 'Unable to create the Steam chat popup. Return to Library to use the flyout.';
      chatError.hidden = false;
      console.warn('[Steam Enhanced] native chat popup', error);
    }
  }

  const TAB_NAME = ['.ChatTabName', '.chatTabName', C.ChatTabContent_ChatRoomName, C.playerName]
    .filter(Boolean)
    .map((cls) => (cls.startsWith('.') ? cls : `.${cls}`))
    .join(', ');

  let chipSignature = '';
  let chipCountSeen = -1;

  function resetMinimized() {
    delete dock.dataset.chatMinimized;
    chatChip.hidden = true;
    chipSignature = '';
    chipCountSeen = -1;
  }

  function updateChatChip() {
    if (dock.dataset.chatMinimized !== '1' || !dockTabs) return;
    const count = dockTabs.tabCount;

    const active = chatRoot().querySelector(`.chatTab.active, .${C.ChatTab}.${C.ChatTab_Active}`);
    const friend = findFriend(activeChatFriend);
    const group = !friend ? findGroup(activeChatFriend) : null;
    const name =
      active
        ?.querySelector(TAB_NAME)
        ?.textContent?.trim() ||
      run(() => friend.display_name) ||
      run(() => group.name) ||
      chatRoot()
        .querySelector('.chatWindow.MultiUserChat:not([data-activechat="false"]) .chatRoomGroupHeaderName')
        ?.textContent.trim() ||
      'Chat';
    const url =
      active?.querySelector('.avatarHolder img, .ChatRoomGroupAvatar img')?.getAttribute('src') ||
      run(() => friend.persona.avatar_url_medium) ||
      run(() => group.avatar_url_medium) ||
      chatRoot()
        .querySelector('.chatWindow.MultiUserChat:not([data-activechat="false"]) .ChatRoomGroupAvatar img')
        ?.getAttribute('src') ||
      '';
    const isGroup = Boolean(group && !friend);
    const art = isGroup ? usableAvatar(url) : url;
    const state = friend ? STATE[run(() => friend.persona.m_ePersonaState)] || 'online' : 'online';
    const sigStr = JSON.stringify([name, art, state, isGroup, count]);
    chipCountSeen = count;
    if (sigStr === chipSignature) return;
    chipSignature = sigStr;
    chipName.textContent = name;
    chipCount.textContent = count === 1 ? '1 chat' : `${count} chats`;
    chipAvatar.innerHTML = isGroup ? groupAvatar(name, art) : avatar(art, state, 30);
    chatChip.setAttribute('aria-label', `Restore ${name}, ${chipCount.textContent}`);
  }

  function restoreChat() {
    if (dock.dataset.chat !== '1' || !dockTabs?.tabCount) return;
    resetMinimized();
    chatBack.hidden = false;
    restoringChat = true;
    try {
      place();
    } finally {
      restoringChat = false;
    }
    run(() => dockTabs.FocusTextInput?.());
  }

  function minimizeChat() {
    cancelChatNavigation();
    if (dock.dataset.chat !== '1' || dock.dataset.chatMinimized === '1' || !dockTabs?.tabCount) return;
    dock.dataset.chatMinimized = '1';
    chatBack.hidden = true;
    chatChip.hidden = false;
    closeGroupPanels();
    updateChatChip();
    place();
    if (steamHost.contains(document.activeElement)) {
      document.activeElement?.blur?.();
    }
  }

  chatChip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.stopPropagation();
    if (dock.dataset.chatMinimized === '1') restoreChat();
  });
  chatChip.addEventListener('click', (event) => {
    event.stopPropagation();
    if (dock.dataset.chatMinimized === '1') restoreChat();
  });
  chatMinimize.addEventListener('click', minimizeChat);

  const browserClickListeners = new Map();
  let focusedBrowserView = null;

  function syncBrowserClicks() {
    const active = new Set();
    for (const owner of SE.owners()) {
      const manager = run(() => owner.MainWindowBrowserManager);
      const browser = manager?.m_browser;
      if (!browser || typeof browser.on !== 'function') continue;
      active.add(browser);
      if (browserClickListeners.has(browser)) continue;

      const listener = (message, args, requestingURL) => {
        if (destroyed || message !== 'SteamEnhanced.ChatBrowserFocus') return;
        const source = requestingURL || manager.m_URL || manager.m_URLRequested || '';
        if (!/^https:\/\/(?:store\.steampowered\.com|steamcommunity\.com)(?:\/|$)/i.test(source)) return;
        if (args === 'blur' && focusedBrowserView === browser) focusedBrowserView = null;
        if (args === 'focus' && onStore()) {
          focusedBrowserView = browser;
          foregroundApp = null;
          requestChatHandoff();
          schedule();
        }
      };
      run(() => {
        browser.on('message', listener);
        browserClickListeners.set(browser, listener);
      });
    }
    for (const [browser, listener] of browserClickListeners) {
      if (!active.has(browser)) {
        run(() => browser.off?.('message', listener));
        browserClickListeners.delete(browser);
        if (focusedBrowserView === browser) focusedBrowserView = null;
      }
    }
  }

  const groupFlyouts = new Map();

  function closeGroupPanels() {
    for (const [win, entry] of groupFlyouts) {
      delete win.dataset.seGroupPanel;
      entry.channels.setAttribute('aria-expanded', 'false');
      entry.members.setAttribute('aria-expanded', 'false');
    }
  }

  function disposeGroupFlyouts() {
    for (const dispose of [...groupFlyouts.values()].map((entry) => entry.dispose)) {
      dispose();
    }
  }

  function syncGroupFlyouts() {
    for (const [win, entry] of groupFlyouts) {
      if (!chatRoot().contains(win)) entry.dispose();
    }
    for (const win of chatRoot().querySelectorAll('.chatWindow.MultiUserChat')) {
      const headerEl = win.querySelector(':scope > .chatHeader.titleBarContainer');
      if (!headerEl) continue;
      win.dataset.seFlyoutGroup = '1';
      let entry = groupFlyouts.get(win);

      if (!entry || !win.contains(entry.tools)) {
        entry?.dispose();
        const tools = document.createElement('div');
        const channels = document.createElement('button');
        const members = document.createElement('button');
        tools.className = 'se-fd-group-tools';
        channels.type = 'button';
        members.type = 'button';
        channels.className = 'se-fd-group-channels';
        members.className = 'se-fd-group-members';
        channels.setAttribute('aria-expanded', 'false');
        members.setAttribute('aria-expanded', 'false');
        channels.setAttribute('aria-label', 'Show text and voice channels');
        members.setAttribute('aria-label', 'Show group members');
        tools.append(channels, members);
        win.insertBefore(tools, headerEl.nextSibling);

        const toggle = (panel) => {
          const open = win.dataset.seGroupPanel !== panel;
          closeGroupPanels();
          if (open) win.dataset.seGroupPanel = panel;
          channels.setAttribute('aria-expanded', String(open && panel === 'channels'));
          members.setAttribute('aria-expanded', String(open && panel === 'members'));
        };
        const showChannels = () => toggle('channels');
        const showMembers = () => toggle('members');
        const onChoose = (event) => {
          if (event.target.closest?.('.chatRoomTextChannel, .chatRoomVoiceChannel, .MemberListColumn .friend')) {
            closeGroupPanels();
          }
        };
        channels.addEventListener('click', showChannels);
        members.addEventListener('click', showMembers);
        win.addEventListener('click', onChoose);
        entry = {
          tools,
          channels,
          members,
          toggle,
          voiceBar: null,
          dispose() {
            channels.removeEventListener('click', showChannels);
            members.removeEventListener('click', showMembers);
            win.removeEventListener('click', onChoose);
            tools.remove();
            entry.voiceBar?.remove();
            delete win.dataset.seFlyoutGroup;
            delete win.dataset.seGroupPanel;
            groupFlyouts.delete(win);
          },
        };
        groupFlyouts.set(win, entry);
      }

      const channel =
        win
          .querySelector('.ActiveTextChannel .chatRoomTextChannelName')
          ?.textContent.trim()
          .replace(/^#\s*/, '') || 'Channels';
      const label = channel === 'Channels' ? 'Channels ▾' : `# ${channel} ▾`;
      if (entry.channels.textContent !== label) entry.channels.textContent = label;

      const total = headerEl.querySelector('.statMembersTotal')?.textContent.trim();
      const membersLabel = total || 'Members';
      if (entry.members.textContent !== membersLabel) entry.members.textContent = membersLabel;

      const column = win.querySelector('.chatHistoryAndMembers > .displayColumn.fullWidth');
      let composer = column?.querySelector('.chatEntry');
      if (column && composer) {
        while (composer.parentElement !== column) composer = composer.parentElement;
        if (!entry.voiceBar || !win.contains(entry.voiceBar)) {
          const bar = document.createElement('div');
          const status = document.createElement('span');
          const action = document.createElement('button');
          bar.className = 'se-fd-group-voice';
          action.type = 'button';
          action.addEventListener('click', () => entry.toggle('channels'));
          bar.append(status, action);
          column.insertBefore(bar, composer);
          entry.voiceBar = bar;
        }
        const currentVoice = win.querySelector('.ActiveVoiceChannel .chatRoomVoiceChannelName')?.textContent.trim();
        const voiceLabel = currentVoice ? `Voice · ${currentVoice}` : 'Voice channels';
        const actionLabel = currentVoice ? 'Manage voice' : 'Join voice ▾';
        if (entry.voiceBar.firstChild.textContent !== voiceLabel) {
          entry.voiceBar.firstChild.textContent = voiceLabel;
        }
        if (entry.voiceBar.lastChild.textContent !== actionLabel) {
          entry.voiceBar.lastChild.textContent = actionLabel;
        }
        const noVoice = !win.querySelector('.chatRoomVoiceChannel');
        if (entry.voiceBar.hidden !== noVoice) entry.voiceBar.hidden = noVoice;
      }

      const noChannels = !win.querySelector('.chatRoomGroupNavColumn');
      if (entry.channels.disabled !== noChannels) entry.channels.disabled = noChannels;
      const noMembers = !win.querySelector('.MemberListColumn');
      if (entry.members.disabled !== noMembers) entry.members.disabled = noMembers;
    }
  }

  function closeChat(closePending = true) {
    cancelChatNavigation();
    if (closePending) {
      const a = app();
      const contexts = overlayChatContexts(a);
      for (const uid of pendingOverlayChats.keys()) closeMirroredChat(a?.UIStore, contexts, uid);
      pendingOverlayChats.clear();
    }
    const tabs = dockTabs;
    delete dock.dataset.chat;
    resetMinimized();
    chatBack.hidden = true;
    activeChatFriend = null;
    dockTabs = null;

    closeChatPopup();
    restoreChatRenderer();

    if (tabs && tabs.tabCount !== 0) {
      try {
        openingDockChat++;
        tabs.CloseAllTabs();
      } catch (error) {
        console.warn('[Steam Enhanced] close flyout tabs', error);
      } finally {
        openingDockChat--;
      }
    }
    if (!tabs || tabs.tabCount === 0) flyoutOwnedTabs.clear();
    if (chatContext) {
      try {
        chatContext.data.SetFriendsListSingleWindowMode(chatContext.previous);
      } catch (_) {}
      chatContext = null;
    }
    place();
  }

  function syncChatTabs() {
    if (dockTabs?.activeTab) {
      const uid = run(() => dockTabs.activeTab.GetUniqueID?.()) || run(() => dockTabs.activeTab.unique_id);
      if (uid) activeChatFriend = String(uid);
    }
    syncGroupFlyouts();
    if (dock.dataset.chat === '1' && dockTabs && dockTabs.tabCount === 0) {
      closeChat(false);
      return;
    }
    updateChatChip();
    if (chatPopup && !chatPopup.restored && chatPopup.handle?.visible && dock.dataset.chat === '1') {
      const minimized = dock.dataset.chatMinimized === '1';
      const geometry = chatGeometry(minimized);
      if (
        chatPopup.minimized !== minimized ||
        chatPopup.width !== geometry.width ||
        chatPopup.height !== geometry.height
      ) {
        resizeChatPopup(chatPopup, minimized, geometry);
      }
    }
  }

  chatBack.addEventListener('click', closeChat);

  // Steam's Friends & Chat embed entry (mount(FriendStore, ChatStore, elTarget)), its ReactDOM and JSX runtime.
  const findEmbed = () =>
    SE.findModule('friends-dock:embed', (src, id, req) => {
      if (!src.includes('PopupFriendsListDimensions') || !src.includes('elTarget')) return null;
      const exp = run(() => req(id));
      for (const k of Object.keys(exp || {})) {
        const fn = run(() => exp[k]);
        if (typeof fn !== 'function' || fn.prototype?.render || fn.length !== 3) continue;
        const body = Function.prototype.toString.call(fn);
        if (!body.includes('elTarget')) continue;
        const calls = [...body.matchAll(/\(0,\s*([\w$]+)\.createRoot\s*\)/g)];
        if (calls.length !== 1) continue;
        const dom = importOf(src, calls[0][1], req);
        const descriptor = dom && Object.getOwnPropertyDescriptor(dom, 'createRoot');
        if (typeof descriptor?.value !== 'function' || !descriptor.writable) continue;
        let jsx;
        for (const call of src.matchAll(/([\w$]+)\.jsx\b/g)) {
          const candidate = importOf(src, call[1], req);
          if (typeof candidate?.jsx === 'function' && typeof candidate?.jsxs === 'function') {
            jsx = candidate;
            break;
          }
        }
        return { mount: fn, dom, jsx };
      }
      return null;
    });

  // Guard the Library window's modal manager entry in `m_mapModalManager` so the
  // embedded Friends & Chat tree does not overwrite the Library's modal overlay host.
  function managerRegistries() {
    const map = SE.findModule('friends-dock:modal-managers', (src, id, req) => {
      if (!src.includes('Stomping CModalManager')) return null;
      for (const v of Object.values(run(() => req(id)) || {})) {
        const candidate = v?.m_mapModalManager;
        if (typeof candidate?.get === 'function' && typeof candidate.set === 'function') return candidate;
      }
      return null;
    });
    return map ? [{ map }] : [];
  }

  function isPanelManager(value) {
    if (!value || typeof value !== 'object') return false;
    for (const el of steamHost.querySelectorAll('.FullModalOverlay')) {
      if (SE.fromProps(el, 8, (p) => p.ModalManager) === value) return true;
    }
    return false;
  }

  let libraryManagers = null;

  function keepLibraryManagers() {
    if (!libraryManagers) return;
    for (const r of libraryManagers) {
      try {
        const current = r.native.get.call(r.map, window);
        if (current === r.own) continue;
        if (current && !isPanelManager(current)) {
          r.own = current;
        } else if (r.own && current !== r.own) {
          r.native.set.call(r.map, window, r.own);
        }
      } catch (_) {}
    }
  }

  function guardLibraryManagers() {
    if (libraryManagers?.length) {
      keepLibraryManagers();
      return;
    }
    libraryManagers = [];
    for (const { map } of managerRegistries()) {
      const proto = Object.getPrototypeOf(map);
      const native = { get: proto?.get, set: proto?.set };
      if (typeof native.get !== 'function' || typeof native.set !== 'function') continue;
      const r = { map, native, own: undefined, set: null };
      r.set = function (key, value) {
        if (this === map && key === window && !destroyed) {
          try {
            if (isPanelManager(value)) {
              const current = native.get.call(map, window);
              if (current && !isPanelManager(current)) return this;
              if (r.own) {
                native.set.call(map, window, r.own);
                return this;
              }
            } else if (value) {
              r.own = value;
            }
          } catch (_) {}
        }
        return native.set.call(this, key, value);
      };
      const ownDesc = Object.getOwnPropertyDescriptor(map, 'set');
      if (ownDesc && !ownDesc.configurable) continue;
      try {
        Object.defineProperty(map, 'set', { configurable: true, writable: true, value: r.set });
      } catch (_) {
        continue;
      }
      r.saved = ownDesc;
      libraryManagers.push(r);
    }
    keepLibraryManagers();
  }

  function unguardLibraryManagers() {
    keepLibraryManagers();
    for (const r of libraryManagers || []) {
      try {
        if (r.map.set !== r.set) continue;
        if (r.saved) Object.defineProperty(r.map, 'set', r.saved);
        else delete r.map.set;
      } catch (_) {}
    }
    libraryManagers = null;
  }

  // Prevent the embedded FriendsUI container from overwriting the main window's document.title.
  let titlePatch = null;

  // The FriendsUI class whose `title` setter writes `this[windowKey].document.title`.
  const findTitleSetter = () =>
    SE.findModule('friends-dock:title', (src, id, req) => {
      if (!src.includes('FriendsUI Browser context missing from owner window') || !/\.document\.title\s*=/.test(src)) {
        return null;
      }
      const exp = run(() => req(id));
      for (const name of Object.keys(exp || {})) {
        const proto = run(() => exp[name])?.prototype;
        const descriptor = proto && Object.getOwnPropertyDescriptor(proto, 'title');
        if (!descriptor?.configurable || typeof descriptor.set !== 'function') continue;
        const match = /this\.([\w$]+)\.document\.title\s*=/.exec(Function.prototype.toString.call(descriptor.set));
        if (match) return { proto, descriptor, windowKey: match[1] };
      }
      return null;
    });

  function protectMainTitle() {
    if (titlePatch) return true;
    const found = findTitleSetter();
    if (!found) return false;
    const { proto, descriptor, windowKey } = found;
    if (Object.getOwnPropertyDescriptor(proto, 'title')?.set !== descriptor.set) return false;
    const set = function (title) {
      if (this[windowKey] === window) return undefined;
      return descriptor.set.call(this, title);
    };
    Object.defineProperty(proto, 'title', { ...descriptor, set });
    titlePatch = { proto, descriptor, set };
    return true;
  }

  function restoreTitleSetter() {
    if (!titlePatch) return;
    const { proto, descriptor, set } = titlePatch;
    if (Object.getOwnPropertyDescriptor(proto, 'title')?.set === set) {
      Object.defineProperty(proto, 'title', descriptor);
    }
    titlePatch = null;
  }

  function releaseFlyoutTabs() {
    openingDockChat++;
    try {
      for (const [id, tabs] of flyoutOwnedTabs) {
        const tab = run(() => tabs.GetTabByUniqueID(id));
        if (tab) {
          run(() => tabs.RemoveTab(tab));
          run(() => tab.OnTabClosed?.());
        }
      }
      flyoutOwnedTabs.clear();
      run(() => app()?.UIStore.SerializePopupState?.());
    } finally {
      openingDockChat--;
    }
  }

  addEventListener('beforeunload', releaseFlyoutTabs);

  function disposeSteam() {
    closeChatPopup();
    restoreChatRenderer();
    disposeGroupFlyouts();
    for (const timer of managerTimers) clearTimeout(timer);
    managerTimers.clear();
    try {
      steamRoot?.unmount();
    } catch (e) {
      console.warn('[Steam Enhanced] friends dock cleanup', e);
    } finally {
      steamRoot = null;
      steamMounted = false;
      if (chatContext) {
        try {
          chatContext.data.SetFriendsListSingleWindowMode(chatContext.previous);
        } catch (_) {}
        chatContext = null;
      }
      delete dock.dataset.chat;
      resetMinimized();
      chatBack.hidden = true;
      activeChatFriend = null;
      dockTabs = null;
      restoreTitleSetter();
      keepLibraryManagers();
      steamHost.remove();
      steamBar.remove();
    }
  }

  function showSteam() {
    if (destroyed) return;
    const a = app();
    if (!steamMounted) {
      try {
        if (!a) throw new Error('no friend data');
        const embed = findEmbed();
        if (!embed) throw new Error('not found in this Steam version');
        if (!protectMainTitle()) throw new Error('main-window title protection unavailable');
        steamBar.innerHTML = `<button type="button" class="se-fd-icon" data-act="collapse" data-se-tip="${COPY.collapse}" aria-label="${COPY.collapse}">${COLLAPSE_ICON}</button>`;
        dock.append(steamBar, steamHost);
        guardLibraryManagers();

        const original = embed.dom.createRoot;
        const capture = function (target, ...args) {
          const root = original.call(this, target, ...args);
          if (target === steamHost) steamRoot = root;
          return root;
        };
        try {
          embed.dom.createRoot = capture;
          if (embed.dom.createRoot !== capture) throw new Error('root capture unavailable');
          embed.mount(a.FriendStore, a.ChatStore, steamHost);
          if (typeof steamRoot?.unmount !== 'function') throw new Error('root cleanup unavailable');
        } finally {
          embed.dom.createRoot = original;
        }
        steamMounted = true;
        for (const ms of [0, 50, 250, 1000]) {
          const timer = setTimeout(() => {
            managerTimers.delete(timer);
            keepLibraryManagers();
          }, ms);
          managerTimers.add(timer);
        }
      } catch (e) {
        disposeSteam();
        console.warn('[Steam Enhanced] friends dock: Steam view', e);
        steamError = COPY.steamFailed(e?.message || String(e));
        view = 'theme';
        sig = '';
        render();
      }
    }
  }

  const chatError = document.createElement('div');
  chatError.className = 'se-fd-chat-error';
  chatError.setAttribute('role', 'alert');
  chatError.hidden = true;

  const chatErrorText = document.createElement('span');
  const dismissChatError = document.createElement('button');
  dismissChatError.type = 'button';
  dismissChatError.textContent = '×';
  dismissChatError.setAttribute('aria-label', 'Dismiss chat error');
  dismissChatError.addEventListener('click', () => {
    chatError.hidden = true;
    place();
  });
  chatError.append(chatErrorText, dismissChatError);
  dock.append(chatError);

  function revealDock() {
    dockHidden = false;
    store.set('se-fdock-hidden', '0');
    place();
  }

  function reportChatError() {
    chatErrorText.textContent = 'Unable to open chat here. Right-click Friends & Chat to open its window.';
    chatError.hidden = false;
    revealDock();
  }

  function findFriend(id) {
    if (id == null || typeof id === 'object') return null;
    const raw = String(id);
    if (raw.startsWith('cg')) return null;
    const clean = raw.startsWith('f') ? raw.slice(1) : raw;
    const a = app();
    return (
      a &&
      friendsOf(a).find(
        (f) => String(run(() => f.accountid) ?? run(() => f.persona.GetAccountID())) === clean
      )
    );
  }

  function groupIdOf(g) {
    if (!g || typeof g !== 'object') return '';
    return String(run(() => g.GetGroupID?.()) ?? run(() => g.m_ulGroupID) ?? '');
  }

  function groupUniqueId(g) {
    if (!g) return '';
    if (typeof g === 'string') return g.startsWith('cg') ? g : `cg${g}`;
    const uid = run(() => g.unique_id) || run(() => g.GetUniqueID?.());
    if (uid) return String(uid);
    const id = groupIdOf(g);
    return id ? `cg${id}` : '';
  }

  function findGroup(idOrGroup) {
    const a = app();
    if (!a || idOrGroup == null) return null;
    if (typeof idOrGroup === 'object') {
      const parent =
        run(() => idOrGroup.GetGroup?.()) ||
        run(() => idOrGroup.group) ||
        run(() => idOrGroup.m_group) ||
        run(() => idOrGroup.chatRoomGroup);
      if (parent && parent !== idOrGroup) {
        const resolved = findGroup(parent);
        if (resolved) return resolved;
      }
      if (groupIdOf(idOrGroup)) return idOrGroup;
      const uid = String(run(() => idOrGroup.unique_id) || run(() => idOrGroup.GetUniqueID?.()) || '');
      if (uid.startsWith('cg')) idOrGroup = uid.slice(2);
      else return null;
    }
    const raw = String(idOrGroup);
    if (raw.startsWith('f')) return null;
    const clean = raw.startsWith('cg') ? raw.slice(2) : raw;
    if (!clean) return null;
    const direct =
      run(() => a.ChatStore?.GetChatRoomGroup?.(clean)) ||
      run(() => a.ChatStore?.m_mapChatGroups?.get?.(clean));
    if (direct) return direct;
    return (
      groupsOf(a).find((g) => {
        const gid = groupIdOf(g);
        const uid = groupUniqueId(g);
        return gid === clean || gid === raw || uid === raw;
      }) || null
    );
  }

  function findGroupTab(tabs, group) {
    if (!tabs || !group) return null;
    const gid = groupIdOf(group);
    const uid = groupUniqueId(group);
    const list =
      run(() => tabs.tabs) ||
      run(() => tabs.m_rgTabs) ||
      run(() => tabs.GetTabs?.()) ||
      [];
    for (const tab of list) {
      const tabGroup =
        run(() => tab?.GetChatRoomGroup?.()) ||
        run(() => tab?.m_group) ||
        run(() => tab?.GetChatView?.()?.chat) ||
        run(() => tab?.GetChatView?.()?.m_group);
      if (tabGroup === group) return tab;
      if (gid && groupIdOf(tabGroup) === gid) return tab;
      const tabUid = String(run(() => tab?.GetUniqueID?.()) || run(() => tab?.unique_id) || '');
      if (uid && tabUid === uid) return tab;
    }
    return null;
  }

  function resolveGroupFromRow(el) {
    const item = el?.closest?.('.ChatRoomListGroupItem') || el;
    for (const node of [el, item]) {
      if (!node) continue;
      const g = SE.fromProps?.(node, 20, (props) => {
        const candidate = props?.group || props?.chatRoomGroup || props?.m_group || props?.room?.m_group;
        return candidate &&
          typeof candidate === 'object' &&
          ('voiceRoomList' in candidate ||
            typeof candidate.GetGroupID === 'function' ||
            candidate.m_ulGroupID != null)
          ? candidate
          : null;
      });
      if (g) return g;
    }
    return null;
  }

  function isOverlayContext(browser) {
    return Boolean(browser && (
      Number(browser.m_unPID) > 0 || run(() => app()?.BIsOverlayBrowserContext?.(browser))
    ));
  }

  function isDesktopContext(browser) {
    if (!browser || typeof browser !== 'object') return true;
    if (isOverlayContext(browser)) return false;
    const main = run(() => mainWindow()?.params?.browserInfo);
    return browser.m_eUIMode == null || main?.m_eUIMode == null ||
      browser.m_eUIMode === main.m_eUIMode;
  }

  function desktopChatContext(a, fallback) {
    // Steam changes its default to the overlay while a game is running.
    const root = run(() => a.UIStore.GetRootChatPerContextData().browser_context);
    if (root && isDesktopContext(root)) return root;
    return [fallback, window.__FriendsUIBrowserContext, ctx(a)].find(
      (browser) => browser && isDesktopContext(browser)
    );
  }

  function findOverlayState() {
    const a = app();
    let fallbackBrowser = null;
    for (const o of SE.owners()) {
      for (const p of run(() => o.g_PopupManager?.m_mapPopups?.values?.()) || []) {
        const bi = run(() => p?.browser_info || p?.m_browserInfo || p?.params?.browser_info);
        const pid = Number(run(() => bi?.m_unPID ?? p?.m_unPID)) || 0;
        const isOv =
          pid > 0 ||
          (bi && typeof a?.BIsOverlayBrowserContext === 'function' && run(() => a.BIsOverlayBrowserContext(bi))) ||
          /^SP Overlay:/i.test(run(() => p?.strTitle || p?.window?.document?.title) || '');
        if (!isOv) continue;
        if (!fallbackBrowser && isOverlayContext(bi)) fallbackBrowser = bi;
        const focused =
          Boolean(run(() => p?.focused)) ||
          Boolean(run(() => p?.BIsFocused?.())) ||
          Boolean(run(() => p?.window?.document?.hasFocus?.()));
        if (focused) return { active: true, focused: true, browser: isOverlayContext(bi) ? bi : fallbackBrowser };
      }
    }
    const preferred = a && ctx(a);
    fallbackBrowser ??= isOverlayContext(preferred) ? preferred : overlayChatContexts(a)[0];
    return fallbackBrowser ? { active: true, focused: false, browser: fallbackBrowser } : null;
  }

  function overlayChatContexts(a) {
    return (run(() => a?.UIStore?.GetAllBrowserContexts?.()) || []).filter(isOverlayContext);
  }

  let foregroundApp = null;

  function gameInForeground() {
    if (!foregroundApp) return false;
    const { appid, pid } = foregroundApp;
    if (overlayChatContexts(app()).some((browser) =>
      (pid > 0 && Number(browser.m_unPID) === pid) ||
      (appid > 0 && Number(browser.m_unAppID) === appid)
    )) return true;
    return appid > 0 && [...SE.owners()].some((owner) => {
      const ui = run(() => owner.SteamUIStore);
      return Number(run(() => ui?.MainRunningAppID)) === appid ||
        run(() => ui?.RunningApps?.some((game) => Number(game.appid) === appid));
    });
  }

  function desktopChatFocused() {
    if (gameInForeground()) return false;
    const popup = chatPopup?.doc;
    if (document.hasFocus() || (popup?.visibilityState !== 'hidden' && popup?.hasFocus?.())) return true;
    if (focusedBrowserView && onStore()) return true;
    const main = mainWindow();
    return Boolean(main && [...SE.owners()].some((owner) =>
      run(() => owner.SteamUIStore?.GetFocusedWindowInstance?.()) === main
    ));
  }

  function isInGame() {
    const a = app();
    if (
      run(() => a?.FriendStore?.self?.persona?.is_ingame) ||
      Number(run(() => a?.FriendStore?.self?.persona?.m_unGamePlayedAppID)) > 0
    ) {
      return true;
    }
    for (const o of SE.owners()) {
      const ui = run(() => o.SteamUIStore);
      if (run(() => ui?.IsAnyAppRunning?.()) || Number(run(() => ui?.MainRunningAppID)) > 0 ||
          run(() => ui?.RunningApps?.length > 0)) return true;
    }
    return isOverlayContext(a && ctx(a)) || Boolean(findOverlayState()?.focused);
  }

  let routingApp = null;
  let nativeInteraction = false;
  let nativeInteractionUntil = 0;
  let desktopInteractionAt = 0;
  let interactionToken = 0;
  let openingDockChat = 0;
  let bypassingDockChat = 0;
  let syncingChat = 0;
  let backgroundChat = 0;
  const pendingOverlayChats = new Map();

  const isNativeInteraction = () => nativeInteraction || performance.now() < nativeInteractionUntil;

  function shouldBypassDock(browser) {
    if (!isDesktopContext(browser)) return true;
    if (!isInGame()) return false;
    if (isNativeInteraction()) return false;
    const ov = findOverlayState();
    if (ov?.focused) return true;
    if (performance.now() - desktopInteractionAt < 1200) return false;
    return !document.hasFocus() && !chatPopup?.doc?.hasFocus?.();
  }

  function canRouteChat(browser, activate) {
    if (!canUseDock()) return false;
    if (activate && !isDesktopContext(browser)) return false;
    if (gameInForeground() || (isInGame() && !desktopChatFocused())) return false;
    return isDesktopContext(browser) || (!activate && isOverlayContext(browser));
  }

  function canUseDock() {
    return !destroyed && !manualWindowOpen && !allowNativeWindow && SE.railMode();
  }

  function openRoutedChat(id, browser, chat, activate, room, mirror = activate) {
    if (activate) {
      chatNavigationUntil = performance.now() + 1500;
      if (!desktopChatFocused()) {
        const main = mainWindow();
        if (typeof main?.BringToFront === 'function') run(() => main.BringToFront());
        else run(() => window.SteamClient?.Window?.BringToFront?.());
        run(() => window.focus());
      }
    }
    return openDockChat(id, browser, chat, room, mirror, activate);
  }

  function openFriendNotification(accountId) {
    if (destroyed || !SE.railMode() || !/^\d{1,10}$/.test(accountId)) return false;
    const id = Number(accountId);
    if (!id || id > 0xffffffff) return false;
    const a = app();
    const chat = run(() => a?.ChatStore.GetFriendChat(id));
    if (!chat) return false;

    pendingOverlayChats.delete(`f${id}`);
    chatNavigationUntil = performance.now() + 1500;
    if (chatNavigation) chatNavigation.minimized = false;

    const store = run(() => window.SteamUIStore?.WindowStore);
    if (typeof store?.EnsureMainWindowCreated === 'function') {
      run(() => store.EnsureMainWindowCreated(true));
    } else if (typeof mainWindow()?.BringToFront === 'function') {
      run(() => mainWindow().BringToFront());
    } else {
      run(() => window.SteamClient?.Window?.BringToFront?.());
    }
    run(() => window.focus());
    return openDockChat(id, undefined, chat);
  }

  function resumeOverlayChat() {
    if (!pendingOverlayChats.size || !canUseDock() || !desktopChatFocused()) return;
    if (chatNavigation || (!onLibrary() && !onStore())) return;

    const chats = [...pendingOverlayChats];
    pendingOverlayChats.clear();
    for (const [uid, room] of chats) {
      const group = uid.startsWith('cg') ? findGroup(uid) : null;
      if (!openRoutedChat(uid, undefined, group, true, room, false)) reportChatError();
    }
  }

  let chatHandoffQueued = false;

  function requestChatHandoff() {
    if (!pendingOverlayChats.size || chatHandoffQueued || destroyed) return;
    chatHandoffQueued = true;
    queueMicrotask(() => {
      chatHandoffQueued = false;
      resumeOverlayChat();
    });
  }

  function onDesktopChatFocus(event) {
    // The main window can regain focus before Steam reports the new foreground app.
    if (event.isTrusted && document.hasFocus()) foregroundApp = null;
    requestChatHandoff();
    schedule();
  }

  function queueOverlayChat(uid, room) {
    if (!uid || !/^(?:f\d+|cg\d+)$/.test(uid) || !canUseDock()) return;
    pendingOverlayChats.delete(uid);
    pendingOverlayChats.set(uid, room);
    requestChatHandoff();
  }

  function syncWithOverlay(uid, room) {
    const a = app();
    if (!uid || !canUseDock() || !isInGame()) return;
    const ui = a.UIStore;
    syncingChat++;
    try {
      for (const browser of overlayChatContexts(a)) {
        run(() => {
          const tab = ui.ShowAndOrActivateTabByID(browser, uid, false);
          if (!tab) return;
          if (room != null) tab.GetChatView?.()?.SelectChat?.(room);
          const data = ui.GetPerContextChatData(browser);
          const tabs = ui.GetTabSetByUniqueID(data, uid)?.tabSet;
          if (tabs?.activeTab !== tab) tabs?.ActivateTab(tab);
        });
      }
    } finally {
      syncingChat--;
    }
  }

  function closeMirroredChat(ui, contexts, uid) {
    syncingChat++;
    try {
      for (const browser of contexts) {
        if (browser) run(() => ui?.CloseTabByIDInContext?.(browser, uid));
      }
    } finally {
      syncingChat--;
    }
  }

  function runBypassedChat(self, original, args, uid, activate, room) {
    const a = app();
    if (activate && uid && isDesktopContext(args[0]) && !isNativeInteraction()) flyoutOwnedTabs.delete(uid);
    const callArgs = [...args];
    const browser = callArgs[0];
    const playing = isInGame() || gameInForeground();
    if (uid && isDesktopContext(browser) && playing && canUseDock() && !desktopChatFocused()) {
      const ov = findOverlayState();
      if (ov?.browser && !isDesktopContext(ov.browser)) {
        callArgs[0] = ov.browser;
      }
    }
    const effectiveBrowser = callArgs[0];
    if (!isDesktopContext(effectiveBrowser) && chatContext && !chatContext.previous) {
      const ovPerContext = run(() => a?.UIStore?.GetPerContextChatData?.(effectiveBrowser));
      if (
        ovPerContext &&
        ovPerContext !== chatContext.data &&
        run(() => ovPerContext.IsFriendsListSingleWindow?.())
      ) {
        run(() => ovPerContext.SetFriendsListSingleWindowMode?.(false));
      }
    }
    const background = playing && !activate;
    if (background) backgroundChat++;
    bypassingDockChat++;
    try {
      const result = original.apply(self, callArgs);
      if (activate && isOverlayContext(effectiveBrowser)) queueOverlayChat(uid, room);
      return result;
    } finally {
      bypassingDockChat--;
      if (background) backgroundChat--;
    }
  }

  let lastNativeRoute = null;
  const routingPatches = [];

  function restoreChatRouting() {
    for (const p of routingPatches) {
      try {
        if (p.target[p.name] !== p.wrapper) continue;
        if (p.own) Object.defineProperty(p.target, p.name, p.own);
        else delete p.target[p.name];
      } catch (_) {}
    }
    routingPatches.length = 0;
    routingApp = null;
    pendingOverlayChats.clear();
    nativeInteraction = false;
    nativeInteractionUntil = 0;
  }

  function installChatRouting() {
    const a = app();
    if (!a || routingApp === a) return;
    restoreChatRouting();
    routingApp = a;

    const patch = (target, name, route) => {
      if (typeof target?.[name] !== 'function') return;
      const ownDesc = Object.getOwnPropertyDescriptor(target, name);
      const original = target[name];
      if (ownDesc && !ownDesc.configurable) return;
      const wrapper = function (...args) {
        return route.call(this, original, args);
      };
      try {
        Object.defineProperty(target, name, { configurable: true, writable: true, value: wrapper });
        routingPatches.push({ target, name, own: ownDesc, wrapper });
      } catch (_) {}
    };

    const navigateWithChat = function (original, args) {
      const kind = this === mainWindow() ? 'route' : 'url';
      beginChatNavigation(kind, args[0]);
      try {
        return original.apply(this, args);
      } finally {
        schedule();
      }
    };

    patch(mainWindow(), 'Navigate', navigateWithChat);
    for (const owner of SE.owners()) {
      patch(run(() => owner.MainWindowBrowserManager), 'ShowURL', navigateWithChat);
    }

    const routeFriend = function (original, args) {
      if (openingDockChat || bypassingDockChat || syncingChat) return original.apply(this, args);
      const [browser, id, show = true, activate = show] = args;
      const chat = run(() => a.ChatStore.GetFriendChat(Number(id)));
      const uid = run(() => chat?.unique_id) || (id != null ? `f${id}` : '');
      if (!show) return original.apply(this, args);
      if (canRouteChat(browser, activate) && chat && openRoutedChat(id, browser, chat, activate)) {
        if (activate) lastNativeRoute = { id: String(id), uid, at: performance.now() };
        return chat;
      }
      return runBypassedChat(this, original, args, uid, activate);
    };

    patch(a, 'ShowFriendChatDialog', routeFriend);
    patch(a.UIStore, 'ShowFriendChatDialog', routeFriend);

    const routeGroup = function (original, args) {
      if (openingDockChat || bypassingDockChat || syncingChat) return original.apply(this, args);
      const [browser, groupArg, activate = true, roomArg] = args;
      const group = findGroup(groupArg);
      const uid = group && groupUniqueId(group);
      const room = run(() => roomArg?.GetRoomID?.()) ?? roomArg;
      if (canRouteChat(browser, activate !== false) && uid) {
        if (openRoutedChat(uid, browser, group, activate !== false, room)) {
          if (activate !== false) lastNativeRoute = { id: uid, uid, at: performance.now() };
          return run(() => dockTabs?.GetTabByUniqueID?.(uid)) || findGroupTab(dockTabs, group);
        }
      }
      return runBypassedChat(this, original, args, uid, activate !== false, room);
    };

    patch(a.UIStore, 'ShowAndOrActivateChatRoomGroup', routeGroup);
    patch(a.m_DesktopApp, 'ShowChatRoomGroupDialog', function (original, args) {
      if (openingDockChat || bypassingDockChat || syncingChat) return original.apply(this, args);
      const [browser, groupId, room] = args;
      const group = findGroup(groupId);
      const uid = groupUniqueId(group);
      const channel = room == null ? null : run(() => group?.GetChatRoom?.(room));
      if (!uid || run(() => group.BIsCurrentUserAMember?.()) === false ||
          run(() => channel?.BVoiceActive?.())) return original.apply(this, args);
      if (canRouteChat(browser, true) && openRoutedChat(uid, browser, group, true, room)) return;
      return runBypassedChat(this, original, args, uid, true, room);
    });

    patch(a.UIStore, 'OpenChatRoomGroupTrial', function (original, args) {
      if (openingDockChat || bypassingDockChat || syncingChat) return original.apply(this, args);
      const [browser, groupID] = args;
      const group = findGroup(groupID);
      if (group && canRouteChat(browser, true)) {
        return routeGroup.call(this, original, [browser, group, true]);
      }
      return runBypassedChat(this, original, args, groupUniqueId(group), true);
    });

    patch(a.UIStore, 'ShowAndOrActivateChat', function (original, args) {
      if (openingDockChat || bypassingDockChat || syncingChat) return original.apply(this, args);
      const [browser, chat, activate] = args;
      const incoming = activate === false;
      const friendID = run(() => chat?.chat_partner?.accountid);
      const group = friendID == null
        ? findGroup(run(() => chat?.GetParentGroupID?.()) ?? chat)
        : null;
      const room = group ? run(() => chat?.GetRoomID?.()) : undefined;
      const uid =
        friendID != null
          ? String(run(() => chat?.unique_id) || `f${friendID}`)
          : group
            ? groupUniqueId(group)
            : '';

      if (uid && canRouteChat(browser, !incoming) &&
          openRoutedChat(friendID ?? uid, browser, group || chat, !incoming, room)) {
        if (!incoming) lastNativeRoute = { id: String(friendID ?? uid), uid, at: performance.now() };
        const tab = run(() => dockTabs?.GetTabByUniqueID?.(uid)) || (group && findGroupTab(dockTabs, group));
        return run(() => tab?.GetChatView?.()) ?? null;
      }
      return runBypassedChat(this, original, args, uid, !incoming, room);
    });

    patch(a.UIStore, 'ShowAndOrActivateTabByID', function (original, args) {
      if (openingDockChat || bypassingDockChat || syncingChat) return original.apply(this, args);
      const [browser, id, activate = true] = args;
      const chatTab = typeof id === 'string' && /^(?:f\d+|cg.+)$/.test(id);
      if (activate && chatTab && canRouteChat(browser, true)) {
        const group = id.startsWith('cg') ? findGroup(id) : null;
        if (openRoutedChat(id, browser, group || { unique_id: id }, true)) {
          lastNativeRoute = { id, uid: id, at: performance.now() };
          return run(() => dockTabs?.GetTabByUniqueID?.(id)) || (group && findGroupTab(dockTabs, group));
        }
      }
      return runBypassedChat(this, original, args, chatTab ? id : '', activate);
    });

    patch(a.NotificationManager, 'DisplayNotification', function (original, args) {
      const [notice] = args;
      const tag = typeof notice?.tag === 'string' ? notice.tag : '';
      const groupMessage = tag.startsWith('groupmsg_');
      const chatMessage = groupMessage || tag.startsWith('message_');
      const quiet = chatMessage && isInGame() && !gameInForeground() &&
        (desktopChatFocused() || foregroundApp !== null);
      if (!quiet && tag.startsWith('message_') && typeof args[1] === 'function') {
        const callback = args[1];
        args[1] = function (...clickArgs) {
          if (!openFriendNotification(tag.slice('message_'.length))) {
            return callback.apply(this, clickArgs);
          }
        };
      }
      const result = quiet ? Promise.resolve() : original.apply(this, args);
      // Group messages reach the flyout through the notification producer.
      if (groupMessage && canRouteChat(undefined, false)) {
        const group = findGroup(notice.chatroomgroupid);
        const uid = groupUniqueId(group);
        if (uid) openRoutedChat(uid, undefined, group, false, notice.chatroomid);
      }
      return result;
    });

    for (const voice of new Set([a.VoiceStore, a.ChatStore?.VoiceChat].filter(Boolean))) {
      for (const name of [
        'InitiateFriendChat',
        'AcceptPartnersOneOnOneChatRequest',
        'OnAcceptOneOnOneVoiceChat',
      ]) {
        patch(voice, name, function (original, args) {
          const id = run(() => args[0]?.GetAccountID?.()) ?? Number(args[0]);
          if (
            !gameInForeground() &&
            !shouldBypassDock(undefined) &&
            !manualWindowOpen &&
            !allowNativeWindow &&
            SE.railMode() &&
            findFriend(id)
          ) {
            if (!openDockChat(id)) reportChatError();
          }
          return original.apply(this, args);
        });
      }
    }

    patch(a.UIStore, 'SerializePopupStateToObject', function (original, args) {
      const state = original.apply(this, args);
      if (!state || typeof state !== 'object') return state;
      let next = state;
      if (chatContext && !chatContext.previous) {
        for (const key of ['bSingleWindowMode', 'singleWindowMode', 'bUseSingleWindowMode']) {
          if (key in next && next[key] === true) {
            if (next === state) next = { ...state };
            next[key] = false;
          }
        }
      }
      const saved = next?.defaultTabs;
      if (!flyoutOwnedTabs.size || !Array.isArray(saved?.tabs)) return next;
      const tabs = saved.tabs.filter((id) => !flyoutOwnedTabs.has(id));
      if (tabs.length === saved.tabs.length) return next;
      return {
        ...next,
        defaultTabs: tabs.length
          ? {
              ...saved,
              tabs,
              active_tab: tabs.includes(saved.active_tab) ? saved.active_tab : tabs[0],
            }
          : undefined,
      };
    });

    patch(a.UIStore, 'BroadcastNewTabToAllBrowserContexts', function (original, args) {
      if (openingDockChat || syncingChat || backgroundChat) return undefined;
      // A native overlay activation is handed off when the desktop regains focus.
      if (isOverlayContext(args[0]) && canUseDock()) return undefined;
      bypassingDockChat++;
      try {
        return original.apply(this, args);
      } finally {
        bypassingDockChat--;
      }
    });

    patch(a.UIStore, 'BroadcastCloseTabToAllBrowserContexts', function (original, args) {
      if (syncingChat) return undefined;
      return original.apply(this, args);
    });

    patch(a.UIStore, 'CloseTab', function (original, args) {
      const [browser, tab] = args;
      const uid = run(() => tab?.GetUniqueID?.());
      const sync = uid && canUseDock() && !syncingChat &&
        !this.m_bSuppressBrowserContextBroadcasting;
      const result = original.apply(this, args);
      if (!sync) return result;
      pendingOverlayChats.delete(uid);
      const desktop = desktopChatContext(a);
      const targets = isOverlayContext(browser)
        ? [desktop]
        : isDesktopContext(browser) ? overlayChatContexts(a) : [];
      closeMirroredChat(this, targets, uid);
      schedule();
      return result;
    });

    patch(a.UIStore, 'OnOverlayBrowserCreated', function (original, args) {
      bypassingDockChat++;
      try {
        return original.apply(this, args);
      } finally {
        bypassingDockChat--;
      }
    });

    patch(a.UIStore, 'ShowAndOrActivateChatForTabset', function (original, args) {
      const result = original.apply(this, args);
      const [tabs, chat, activate] = args;
      if (!activate || openingDockChat || bypassingDockChat || syncingChat ||
          !isOverlayContext(run(() => tabs?.GetBrowserContext?.()))) return result;
      const tab = tabs.activeTab;
      const uid = run(() => tab?.GetUniqueID?.()) || run(() => chat?.unique_id);
      const room = run(() => tab.GetChatView().GetActiveChatView().chat.GetRoomID());
      queueOverlayChat(uid, room);
      return result;
    });

    patch(a.UIStore, 'FocusTabSet', function (original, args) {
      if (syncingChat) return undefined;
      const [tabs] = args;
      if (!openingDockChat && !bypassingDockChat && canUseDock()) {
        const browser = run(() => tabs?.GetBrowserContext?.());
        const tab = tabs?.activeTab;
        const uid = run(() => tab?.GetUniqueID?.());
        const room = run(() => tab.GetChatView().GetActiveChatView().chat.GetRoomID());
        if (isOverlayContext(browser) && !backgroundChat) queueOverlayChat(uid, room);
        else if (tabs === dockTabs) syncWithOverlay(uid, room);
      }
      if (
        !bypassingDockChat &&
        !manualWindowOpen &&
        !allowNativeWindow &&
        (openingDockChat || (dock.dataset.chat === '1' && args[0] === dockTabs))
      ) {
        return undefined;
      }
      return original.apply(this, args);
    });

    const routePopup = function (original, args) {
      if (
        bypassingDockChat ||
        shouldBypassDock(args[0]) ||
        manualWindowOpen ||
        allowNativeWindow ||
        !SE.railMode()
      ) {
        return original.apply(this, args);
      }
      if (!openingDockChat) revealDock();
      return undefined;
    };
    patch(a, 'ShowPopupFriendsList', routePopup);
    patch(a.m_DesktopApp, 'ShowPopupFriendsList', routePopup);
  }

  function markDesktopInteraction() {
    desktopInteractionAt = performance.now();
  }

  function markDockInteraction() {
    installChatRouting();
    const now = performance.now();
    desktopInteractionAt = now;
    nativeInteraction = true;
    nativeInteractionUntil = now + 800;
    const token = ++interactionToken;
    queueMicrotask(() => {
      if (interactionToken === token) nativeInteraction = false;
    });
  }

  const interactionEvents = ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'keydown'];
  for (const type of interactionEvents) {
    steamHost.addEventListener(type, markDockInteraction, true);
    dock.addEventListener(type, markDockInteraction, true);
    fly.addEventListener(type, markDockInteraction, true);
    document.addEventListener(type, markDesktopInteraction, true);
  }
  document.addEventListener('contextmenu', markDesktopInteraction, true);

  function openDockChat(id, browserOverride, chatOverride, room, mirror = true, activate = true) {
    const a = app();
    if (!a || view !== 'steam') return false;
    allowNativeWindow = false;

    const group =
      findGroup(chatOverride) ||
      (typeof id === 'object' || String(id ?? '').startsWith('cg') ? findGroup(id) : null) ||
      (!findFriend(id) ? findGroup(id) : null);
    const friend = !group ? findFriend(run(() => chatOverride?.chat_partner?.accountid) ?? id) : null;
    const friendAccountId = friend
      ? String(run(() => friend.accountid) ?? run(() => friend.persona?.GetAccountID?.()) ?? id)
      : !group && id != null && !String(id).startsWith('cg')
        ? String(id).replace(/^f/, '')
        : '';
    const chat = !group
      ? (chatOverride?.unique_id && !group ? chatOverride : null) ||
        (friendAccountId ? run(() => a.ChatStore.GetFriendChat(Number(friendAccountId))) : null)
      : null;
    const uniqueId = group
      ? groupUniqueId(group)
      : String(run(() => chat?.unique_id) || (friendAccountId ? `f${friendAccountId}` : id || ''));

    if (!steamMounted) showSteam();
    if (!steamMounted) return false;

    const browser = desktopChatContext(a, browserOverride);
    if (!browser) return false;
    const ui = a.UIStore;
    const perContext = run(() => ui.GetPerContextChatData(browser));
    const tabs = run(() => ui.GetDefaultTabSetForContext(browser));

    if (
      !perContext ||
      !tabs ||
      !uniqueId ||
      typeof perContext.SetFriendsListSingleWindowMode !== 'function' ||
      typeof perContext.IsFriendsListSingleWindow !== 'function' ||
      typeof tabs.GetTabByUniqueID !== 'function' ||
      typeof tabs.ActivateTab !== 'function' ||
      typeof tabs.CloseAllTabs !== 'function'
    ) {
      return false;
    }

    const preserveSelection = !activate && dock.dataset.chat === '1' && tabs === dockTabs && Boolean(tabs.activeTab);
    try {
      if (chatContext && chatContext.data !== perContext) {
        run(() => chatContext.data.SetFriendsListSingleWindowMode(chatContext.previous));
        chatContext = null;
      }
      if (!chatContext) {
        chatContext = { data: perContext, previous: perContext.IsFriendsListSingleWindow() };
      }
      perContext.SetFriendsListSingleWindowMode(true);

      openingDockChat++;
      let realUid = uniqueId;
      try {
        const existing =
          run(() => tabs.GetTabByUniqueID(uniqueId)) || (group && findGroupTab(tabs, group));
        if (!existing) flyoutOwnedTabs.set(uniqueId, tabs);
        let tab =
          existing ||
          (typeof ui.CreateNewTabFromUniqueID === 'function'
            ? run(() => ui.CreateNewTabFromUniqueID(tabs, uniqueId, false))
            : null);
        if (!tab && group) {
          if (typeof tabs.AddChatRoomGroupTab === 'function') {
            tab = run(() => tabs.AddChatRoomGroupTab(group, !preserveSelection));
          }
          if (!tab && typeof ui.ShowAndOrActivateChatRoomGroup === 'function') {
            run(() => ui.ShowAndOrActivateChatRoomGroup(browser, group, !preserveSelection));
          }
          tab =
            tab ||
            run(() => tabs.GetTabByUniqueID(uniqueId)) ||
            findGroupTab(tabs, group) ||
            (run(() => tabs.activeTab?.GetChatRoomGroup?.()) === group ? tabs.activeTab : null);
        }
        if (!tab) {
          flyoutOwnedTabs.delete(uniqueId);
          throw new Error('Unable to create embedded chat tab');
        }
        realUid = String(run(() => tab.GetUniqueID?.()) || run(() => tab.unique_id) || uniqueId);
        if (!existing && realUid !== uniqueId) {
          flyoutOwnedTabs.delete(uniqueId);
          flyoutOwnedTabs.set(realUid, tabs);
        }
        if (!preserveSelection) tabs.ActivateTab(tab);
        if (!preserveSelection && group && room != null) {
          const view = run(() => tab.GetChatView?.());
          if (typeof view?.SelectChat === 'function') run(() => view.SelectChat(room));
          else run(() => group.SelectChatRoom?.(room));
        }
      } finally {
        openingDockChat--;
      }

      dockTabs = tabs;
      dock.dataset.chat = '1';
      if (!preserveSelection) {
        activeChatFriend = realUid;
        resetMinimized();
        chatBack.hidden = false;
        if (chatNavigation) chatNavigation.minimized = false;
      } else {
        updateChatChip();
      }
      run(() => ui.SerializePopupState?.());
      chatError.hidden = true;
      revealDock();
      syncGroupFlyouts();
      if (mirror) syncWithOverlay(realUid, room);
      return true;
    } catch (error) {
      console.warn('[Steam Enhanced] embedded chat', error);
      if (preserveSelection) return false;
      delete dock.dataset.chat;
      resetMinimized();
      chatBack.hidden = true;
      activeChatFriend = null;
      dockTabs = null;
      if (chatContext) {
        run(() => chatContext.data.SetFriendsListSingleWindowMode(chatContext.previous));
        chatContext = null;
      }
      return false;
    }
  }

  function onNativeFriendClick(event) {
    if (event.type === 'dblclick' || event.detail > 1) {
      if (
        event.target.closest?.('.friendsListContainer .friend, .friendlist .friend') ||
        (event.target.closest?.(
          '.friendsListContainer .ChatRoomListGroupItem_header, .friendlist .ChatRoomListGroupItem_header'
        ) &&
          !event.target.closest?.('.openGroupButton, .ContextMenuButton'))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }
    if (event.button != null && event.button !== 0) return;

    const groupHeader = event.target.closest?.('.ChatRoomListGroupItem_header');
    if (
      groupHeader &&
      groupHeader.closest('.friendsListContainer, .friendlist') &&
      steamHost.contains(groupHeader) &&
      !event.target.closest('.openGroupButton, .ContextMenuButton, button, a, input, textarea')
    ) {
      const group = resolveGroupFromRow(groupHeader);
      const uid = group && groupUniqueId(group);
      const justRouted =
        uid &&
        (lastNativeRoute?.id === uid || lastNativeRoute?.uid === uid) &&
        performance.now() - lastNativeRoute.at < 350;
      if (group && uid && (justRouted || openDockChat(uid, undefined, group))) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      return;
    }

    const row = event.target.closest?.('.friend');
    if (
      !row ||
      !row.closest('.friendsListContainer, .friendlist') ||
      !steamHost.contains(row) ||
      row.closest('.currentUserContainer') ||
      event.target.closest('button, a, input, textarea')
    ) {
      return;
    }
    const friend = SE.fromProps?.(row, 20, (props) => (props.friend?.accountid != null ? props.friend : null));
    const fid = friend && String(friend.accountid);
    const fuid = fid ? `f${fid}` : '';
    const justRouted =
      friend &&
      (lastNativeRoute?.id === fid || lastNativeRoute?.uid === fuid) &&
      performance.now() - lastNativeRoute.at < 350;
    if (friend && findFriend(friend.accountid) && (justRouted || openDockChat(friend.accountid))) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function onNativeChannelClick(event) {
    if (event.button != null && event.button !== 0) return;
    const channel = event.target.closest?.(
      '.ChatRoomListGroupItemChatRooms .chatRoomVoiceChannel, .ChatRoomListGroupItemChatRooms .chatRoomTextChannel'
    );
    if (
      !channel ||
      !steamHost.contains(channel) ||
      event.target.closest('.ContextMenuButton, button, a, input, textarea')
    ) {
      return;
    }
    const group = resolveGroupFromRow(channel);
    const uid = group && groupUniqueId(group);
    if (!group || !uid) return;
    const justRouted =
      (lastNativeRoute?.id === uid || lastNativeRoute?.uid === uid) &&
      performance.now() - lastNativeRoute.at < 350;
    if (!justRouted) {
      openDockChat(uid, undefined, group);
    }
  }

  steamHost.addEventListener('click', onNativeFriendClick, true);
  steamHost.addEventListener('dblclick', onNativeFriendClick, true);
  steamHost.addEventListener('click', onNativeChannelClick);

  function openChat(id) {
    const a = app();
    const f = findFriend(id);
    if (!a || !f) return;
    if (!openDockChat(id)) {
      if (SE.railMode()) reportChatError();
      else run(() => f.OpenChatDialog(ctx(a)));
    }
  }

  function openGroup(id) {
    const a = app();
    const g = findGroup(id);
    if (!a || !g) return;
    const uid = groupUniqueId(g);
    if (uid && openDockChat(uid, ctx(a), g)) return;
    if (SE.railMode()) reportChatError();
    else run(() => a.UIStore.ShowAndOrActivateChatRoomGroup(ctx(a), g, true));
  }

  const steamURL = (url) => run(() => window.SteamClient.URL.ExecuteSteamURL(url));

  function setMode(m) {
    mode = m;
    store.set('se-fdock', m);
    hideFly(true);
    sig = '';
    place();
  }

  const menu = document.createElement('div');
  menu.className = 'se-fd-menu';
  menu.setAttribute('role', 'menu');

  function hideMenu() {
    menu.remove();
    menu.textContent = '';
  }

  function showMenu(items, x, y) {
    menu.textContent = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      if (it.state) b.dataset.state = it.state;
      b.innerHTML = `${it.state ? '<i></i>' : ''}<span></span>`;
      b.lastChild.textContent = it.label;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        hideMenu();
        it.run();
      });
      menu.appendChild(b);
    }
    document.body.appendChild(menu);
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    menu.style.left = `${Math.max(8, Math.min(x, innerWidth - w - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, innerHeight - h - 8))}px`;
    menu.querySelector('button')?.focus({ preventScroll: true });
  }

  const PERSONA = { online: 1, away: 3, invisible: 7 };

  function setStatus(st) {
    const a = app();
    const done =
      st === 'offline'
        ? run(() => (a.SignOutOfFriends ? (a.SignOutOfFriends(), true) : false))
        : run(() => (a.FriendStore.SetUserPersonaState(PERSONA[st]), true));
    if (!done) steamURL(`steam://friends/status/${st}`);
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusTimer = 0;
      sig = '';
      render();
    }, 300);
  }

  function statusMenu(btn) {
    if (menu.isConnected) {
      hideMenu();
      return;
    }
    const r = btn.getBoundingClientRect();
    showMenu(
      ['online', 'away', 'invisible', 'offline'].map((st) => ({
        state: st,
        label: statusLabel(st),
        run: () => setStatus(st),
      })),
      r.left,
      r.bottom + 6
    );
  }

  function friendMenu(id, x, y) {
    const f = findFriend(id);
    if (!f) return;
    const appid = run(() => f.persona.m_unGamePlayedAppID) || 0;
    const items = [
      { label: COPY.message, run: () => openChat(id) },
      {
        label: COPY.profile,
        run: () => {
          const u =
            run(() => f.persona.GetCommunityProfileURL?.()) ||
            run(() => f.GetCommunityProfileURL?.()) ||
            `https://steamcommunity.com/profiles/${run(() => f.persona.GetSteamIDAsString())}/`;
          steamURL(`steam://openurl/${u}`);
        },
      },
    ];
    if (appid) {
      items.push({
        label: COPY.viewGame(run(() => f.persona.GetCurrentGameName()) || ''),
        run: () => {
          const m = mainWindow();
          run(() => m.Navigate(`/library/app/${appid}`));
        },
      });
    }
    showMenu(items, x, y);
  }

  dock.addEventListener('click', (e) => {
    if (steamHost.contains(e.target)) return;
    const el = e.target.closest('[data-act], [data-game], [data-friend], [data-group], [data-section]');
    if (!el || !dock.contains(el)) return;
    e.stopPropagation();
    const act = el.dataset.act;
    if (act === 'collapse') return setMode('rail');
    if (act === 'expand') return setMode('open');
    if (act === 'add') return steamURL('steam://friends/add');
    if (act === 'status') return statusMenu(el);
    if (act === 'search') {
      searching = !searching;
      if (!searching) {
        filter = '';
        searchText = '';
      }
      sig = '';
      return render();
    }
    if (el.dataset.section) {
      const k = el.dataset.section;
      if (closedSections.has(k)) closedSections.delete(k);
      else closedSections.add(k);
      sig = '';
      return render();
    }
    if (el.dataset.friend) return openChat(el.dataset.friend);
    if (el.dataset.group) return openGroup(el.dataset.group);
    if (el.dataset.game && mode !== 'rail') {
      const k = el.dataset.game;
      if (openGames.has(k)) openGames.delete(k);
      else openGames.add(k);
      sig = '';
      return render();
    }
    return undefined;
  });

  // Rows are divs with role=button: Enter and Space press them, as on a button.
  function pressRow(e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button]')) {
      e.preventDefault();
      e.target.click();
    }
  }

  own.addEventListener('keydown', pressRow);
  fly.addEventListener('keydown', pressRow);

  function showFly(key, keep) {
    const g = data?.games.find((x) => x.key === key);
    const tile = dock.querySelector(`.se-fd-railgame[data-game="${CSS.escape(key)}"]`);
    if (!g || !tile) return hideFly(true);
    clearTimeout(flyTimer);
    flyGame = key;
    const html = flyHTML(g);
    if (!keep || fly.dataset.key !== key || fly.dataset.html !== html) {
      fly.innerHTML = html;
      fly.dataset.key = key;
      fly.dataset.html = html;
    }
    const r = tile.getBoundingClientRect();
    fly.style.top = `${Math.max(8, Math.min(r.top - 6, innerHeight - fly.offsetHeight - 8))}px`;
    fly.classList.add('se-fd-show');
    return undefined;
  }

  function hideFly(now) {
    clearTimeout(flyTimer);
    const go = () => {
      flyGame = null;
      fly.classList.remove('se-fd-show');
    };
    if (now) go();
    else flyTimer = setTimeout(go, 220);
  }

  dock.addEventListener('mouseover', (e) => {
    const tile = e.target.closest('.se-fd-railgame');
    if (tile) showFly(tile.dataset.game);
  });
  dock.addEventListener('mouseout', (e) => {
    if (e.target.closest('.se-fd-railgame') && !e.relatedTarget?.closest?.('.se-fd-railgame, .se-fd-fly')) {
      hideFly();
    }
  });
  fly.addEventListener('mouseenter', () => clearTimeout(flyTimer));
  fly.addEventListener('mouseleave', () => hideFly());
  fly.addEventListener('click', (e) => {
    const row = e.target.closest('[data-friend]');
    if (row) {
      e.stopPropagation();
      openChat(row.dataset.friend);
    }
  });

  function closeMenu(e) {
    if (!e.target.closest?.('.se-fd-menu, [data-act="status"]')) hideMenu();

    const navigation = e.target.closest?.('.se-menu-icon, .se-rail-extra, a[href]');
    const href = navigation?.getAttribute('href') || navigation?.dataset?.url || '';
    if (
      navigation &&
      (navigation.matches('.se-menu-icon, .se-rail-extra') ||
        /^(?:https?:\/\/(?:store\.steampowered\.com|steamcommunity\.com)(?:\/|$)|steam:\/\/(?:store|openurl)\/|\/(?:library|store|community)\b)/i.test(
          href
        ))
    ) {
      chatNavigationUntil = performance.now() + 1500;
      return;
    }

  }

  function onContext(e) {
    const row = e.target.closest?.('[data-friend]');
    if (!row || steamHost.contains(row) || !(dock.contains(row) || fly.contains(row))) return;
    e.preventDefault();
    e.stopPropagation();
    friendMenu(row.dataset.friend, e.clientX, e.clientY);
  }

  dock.addEventListener('contextmenu', onContext);
  fly.addEventListener('contextmenu', onContext);

  function onKeyMenu(event) {
    if (event.key === 'Escape' && menu.isConnected) hideMenu();
  }

  addEventListener('keydown', onKeyMenu, true);
  addEventListener('click', closeMenu, true);

  let frame = 0;

  function sync() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (destroyed) return;
    syncChatTabs();
    keepLibraryManagers();
    resumeOverlayChat();
    place();
  }

  // For callers outside the observer (navigation, focus, native events): one pass next frame.
  function schedule() {
    if (!destroyed && !frame) frame = requestAnimationFrame(sync);
  }

  /*
   * Page changes drive placement; the dock's own subtree (Steam's list, a chat's messages) only
   * matters for the chat tabs, so it gets its own throttled subscriber.
   */
  const watcher = SE.watch(sync, { ignore: SE.inSide, throttle: 100 });
  const chatWatcher = SE.watch(syncChatTabs, { scope: '.se-fd-steam', throttle: 100 });
  window.addEventListener('focus', onDesktopChatFocus);
  document.addEventListener('visibilitychange', requestChatHandoff);
  const focusRegistration = run(() => window.SteamClient?.System?.UI?.RegisterForFocusChangeEvents?.((event) => {
    const focused = event?.focusedApp;
    foregroundApp = focused ? { appid: Number(focused.appid), pid: Number(focused.pid) } : null;
    if (gameInForeground()) focusedBrowserView = null;
    requestChatHandoff();
    schedule();
  }));
  const notificationRegistration = run(() => window.SteamClient?.Messaging?.RegisterForMessages?.(
    'SteamEnhanced.Chat',
    (channel, message, accountId) => {
      if (channel === 'SteamEnhanced.Chat' && message === 'OpenFriendNotification') {
        openFriendNotification(accountId);
      }
    },
  ));
  let lastConnection = '';
  let lastFullRefresh = 0;

  function refreshFriends() {
    syncBrowserClicks();
    syncChatTabs();
    installChatRouting();
    resumeOverlayChat();
    const a = app();
    const connected = run(() => a.CMInterface.BIsConnected()) ?? run(() => a.CMInterface.logged_on);
    if (connected) run(() => a.FriendStore.EnsureFriendsListLoaded?.(false));

    const connection = JSON.stringify([
      run(() => a.CMInterface.logged_on),
      run(() => a.ready_to_render),
      run(() => a.FriendStore.self.persona.m_ePersonaState),
      run(() => a.FriendStore.all_friends.length),
    ]);
    const changed = connection !== lastConnection;
    lastConnection = connection;
    if (!changed && performance.now() - lastFullRefresh < 2000) return;
    lastFullRefresh = performance.now();
    if (changed) readAt = -Infinity;
    keepLibraryManagers();
    if (dock.isConnected) render();
    place();
  }

  const timer = SE.poll(refreshFriends, 1000, {
    active: () =>
      SE.railMode() &&
      (pendingOverlayChats.size || (!dockHidden && (onLibrary() || onStore() || dock.dataset.chat === '1'))),
  });

  installChatRouting();
  syncBrowserClicks();
  place();

  window.__steamEnhancedFriendsDock = {
    prepareModal: keepLibraryManagers,
    toggle() {
      if (destroyed) return undefined;
      dockHidden = !dockHidden;
      if (!dockHidden) allowNativeWindow = false;
      store.set('se-fdock-hidden', dockHidden ? '1' : '0');
      hideMenu();
      hideFly(true);
      place();
      return !dockHidden;
    },
    openWindow(openNative) {
      allowNativeWindow = true;
      pendingOverlayChats.clear();
      chatError.hidden = true;
      closeChatPopup();
      restoreChatRenderer();
      delete dock.dataset.chat;
      resetMinimized();
      chatBack.hidden = true;
      activeChatFriend = null;
      flyoutOwnedTabs.clear();
      run(() => app()?.UIStore.SerializePopupState?.());
      if (chatContext) {
        run(() => chatContext.data.SetFriendsListSingleWindowMode(chatContext.previous));
        chatContext = null;
      }
      manualWindowOpen++;
      try {
        return openNative();
      } finally {
        manualWindowOpen--;
      }
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const [browser, listener] of browserClickListeners) {
        run(() => browser.off?.('message', listener));
      }
      browserClickListeners.clear();
      cancelChatNavigation();
      clearTimeout(statusTimer);
      clearTimeout(flyTimer);
      watcher.disconnect();
      chatWatcher.disconnect();
      localObserver?.disconnect();
      timer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('focus', onDesktopChatFocus);
      document.removeEventListener('visibilitychange', requestChatHandoff);
      run(() => focusRegistration?.unregister?.());
      run(() => notificationRegistration?.unregister?.());
      removeEventListener('click', closeMenu, true);
      removeEventListener('keydown', onKeyMenu, true);
      hideMenu();
      removeEventListener('beforeunload', releaseFlyoutTabs);
      closeChatPopup();
      releaseFlyoutTabs();
      for (const type of interactionEvents) {
        steamHost.removeEventListener(type, markDockInteraction, true);
        dock.removeEventListener(type, markDockInteraction, true);
        fly.removeEventListener(type, markDockInteraction, true);
        document.removeEventListener(type, markDesktopInteraction, true);
      }
      document.removeEventListener('contextmenu', markDesktopInteraction, true);
      disposeSteam();
      unguardLibraryManagers();
      restoreChatRouting();
      steamHost.removeEventListener('click', onNativeFriendClick, true);
      steamHost.removeEventListener('dblclick', onNativeFriendClick, true);
      steamHost.removeEventListener('click', onNativeChannelClick);
      dock.remove();
      fly.remove();
      own.textContent = '';
      fly.textContent = '';
      data = null;
      sig = '';
      openGames.clear();
      closedSections.clear();
      deadAvatars.clear();
      geometryCache = null;
      delete document.body.dataset.seFdock;
      document.body.removeAttribute('data-se-store-list');
      delete window.__steamEnhancedFriendsDock;
    },
  };
});
