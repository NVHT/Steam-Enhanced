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
 *
 * Plain scripts, listed part by part in client/loader.js and run in this order, sharing
 * window.__seFriendsDockParts (values parts reassign live on its `live`):
 * - templates.js   icons, avatars and the panel/rail/flyout markup
 * - data.js        copy, Steam lookups, saved settings and the shared `state`
 * - ui.js          native list clicks, menus, the hover flyout and the frame pass
 * - routing.js     which surface opens a chat (dock, overlay, native window)
 * - flyouts.js     browser clicks, game group flyouts and chat tabs
 * - embed.js       mounting Steam's own Friends & Chat tree
 * - dock.js        the dock element, rendering and placement
 * - chat-popup.js  the chat flyout: popup window, portal, geometry, minimize chip
 * - main.js        builds the elements and wires every listener in the original order,
 *                  then starts the watchers and exposes the dock's API
 * Parts only declare; main.js is the one place that does work at load.
 *
 * This part: markup, meaning icons, avatars (with dead-image fallbacks), and the panel, rail
 * and flyout HTML. It also closes a previous dock and skips windows without a body.
 */
((SE) => {
  window.__seFriendsDock?.destroy();
  if (!document.body) return;
  const ns = (window.__seFriendsDockParts = { live: {} });

  const { esc, run } = SE;

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

  const statusLabel = (st) => ns.COPY[st] || ns.COPY.online;
  const match = (name) => !ns.state.filter || name.toLowerCase().includes(ns.state.filter);

  const friendRow = (f, sub, compact) =>
    `<div class="se-fd-row${compact ? ' se-fd-compact' : ''}" data-friend="${f.id}" role="button" tabindex="0">${avatar(f.avatar, f.state, compact ? 28 : 30)}` +
    `<div class="se-fd-text"><div class="se-fd-name">${esc(f.name)}</div><div class="se-fd-sub" data-state="${f.state}">${esc(sub)}</div></div></div>`;

  function section(key, title, count, body) {
    const closed = ns.closedSections.has(key);
    return (
      `<div class="se-fd-head" data-section="${key}" role="button" tabindex="0" aria-expanded="${!closed}"><span class="se-fd-chev">${svg('down', 14)}</span>` +
      `<span class="se-fd-label">${esc(title)}</span><span class="se-fd-count">${count}</span></div>${closed ? '' : body}`
    );
  }

  function gameRow(g) {
    const fs = g.friends.filter((f) => match(f.name));
    if (!fs.length) return '';
    const open = ns.openGames.has(g.key) || Boolean(ns.state.filter);
    const who =
      fs
        .slice(0, 2)
        .map((f) => f.name)
        .join(', ') + (fs.length > 2 ? ` ${ns.COPY.more(fs.length - 2)}` : '');
    return (
      `<div class="se-fd-game${open ? ' se-fd-open' : ''}" data-game="${esc(g.key)}" role="button" tabindex="0" aria-expanded="${open}">${gameIcon(g, 34, fs.length)}` +
      `<div class="se-fd-text"><div class="se-fd-name">${esc(g.name)}</div><div class="se-fd-sub">${esc(who)}</div></div><span class="se-fd-chev">${svg('chev', 14)}</span></div>` +
      (open ? `<div class="se-fd-thread">${fs.map((f) => friendRow(f, f.rp, true)).join('')}</div>` : '')
    );
  }

  const header = (me) =>
    `<div class="se-fd-me">${avatar(me?.avatar, me?.state || 'online', 36)}` +
    `<button type="button" class="se-fd-status" data-act="status"><span class="se-fd-myname">${esc(me?.name || '')}</span><span class="se-fd-mystate" data-state="${me?.state || 'online'}">${esc(statusLabel(me?.state))}${svg('down', 12)}</span></button>` +
    `<button type="button" class="se-fd-icon" data-act="search" data-se-tip="${ns.COPY.search}" aria-label="${ns.COPY.search}">${svg('search', 20)}</button>` +
    `<button type="button" class="se-fd-icon" data-act="add" data-se-tip="${ns.COPY.add}" aria-label="${ns.COPY.add}">${svg('add', 20)}</button>` +
    `<button type="button" class="se-fd-icon" data-act="collapse" data-se-tip="${ns.COPY.collapse}" aria-label="${ns.COPY.collapse}">${COLLAPSE_ICON}</button></div>` +
    (ns.state.steamError ? `<div class="se-fd-error">${esc(ns.state.steamError)}</div>` : '');

  function panelHTML(d) {
    if (!ns.state.firstGameOpened && d.games.length) {
      ns.openGames.add(d.games[0].key);
      ns.state.firstGameOpened = true;
    }
    const games = d.games.map(gameRow).join('');
    const on = d.online.filter((f) => match(f.name));
    const off = d.offline.filter((f) => match(f.name));
    const gr = d.groups.filter((g) => match(g.name));

    return (
      header(d.me) +
      (ns.state.searching
        ? `<label class="se-fd-search">${svg('search', 14)}<input type="search" spellcheck="false" placeholder="${ns.COPY.search}" value="${esc(ns.state.searchText)}"></label>`
        : '') +
      '<div class="se-fd-scroll">' +
      (games ? `<div class="se-fd-label se-fd-pad">${ns.COPY.playing}</div>${games}` : '') +
      section('online', ns.COPY.online, on.length, on.map((f) => friendRow(f, statusLabel(f.state))).join('')) +
      section(
        'offline',
        ns.COPY.offline,
        off.length,
        off.map((f) => friendRow(f, f.last ? ns.COPY.lastOnline(ns.ago(f.last)) : ns.COPY.offline)).join('')
      ) +
      (d.groups.length
        ? section(
            'groups',
            ns.COPY.groups,
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
      `<button type="button" class="se-fd-railme" data-act="expand" data-se-tip="${ns.COPY.expand}" aria-label="${ns.COPY.expand}">${avatar(d.me?.avatar, d.me?.state || 'online', 34)}</button>` +
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
    `${gameIcon(g, 30)}<div><div class="se-fd-name">${esc(g.name)}</div><div class="se-fd-sub se-fd-green">${esc(ns.COPY.friendsIn(g.friends.length))}</div></div></div>` +
    `<div class="se-fd-flybody">${g.friends.map((f) => friendRow(f, f.rp, true)).join('')}</div>`;

  Object.assign(ns, {
    COLLAPSE_ICON, DEAD_AVATAR_LIMIT, avatar, deadAvatars, flyHTML, groupAvatar, groupAvatarURL,
    groupInitials, panelHTML, railHTML, statusLabel, svg, usableAvatar,
  });
})(window.__se);
