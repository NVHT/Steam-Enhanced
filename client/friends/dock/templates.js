/*
 * Right-hand Friends & Chat dock for Library and Store/Community views.
 *
 * - Expanded mode mounts Steam's native Friends & Chat tree inside `.se-fd-steam`
 *   (falling back to a lightweight FriendStore-driven panel if the webpack embed
 *   entry cannot be resolved).
 * - Collapsed mode renders a 60px rail in labelled sections: unread chats, favorites, playing,
 *   online and group chats; favorites, online and groups capped with a "+N" tile whose flyout
 *   lists the rest.
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
 * - member-list.js a group's members menu without the offline ones
 * - embed.js      mounting Steam's own Friends & Chat tree
 * - dock.js        the dock element, rendering and placement
 * - chat-popup.js  the chat flyout: popup window, portal, geometry, minimize chip
 * - friend-card.js the friend card on an avatar hovered in the open panel
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
      '<g fill="currentColor" stroke="none" style="fill-opacity:var(--se-icon-duo)"><circle cx="11" cy="11" r="6.5"/></g><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    game: '<rect x="3" y="7" width="18" height="11" rx="4"/><path d="M8 11v3M6.5 12.5h3M15.5 12h.01M18 13.5h.01"/>',
  };

  const svg = (n, s = 16) =>
    `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

  // A friend's face; without a picture of their own (none, Steam's "?", or one that failed to
  // load: onAvatarError in dock.js), their initials
  const avatar = (url, state, size, cls = '', name = '') => {
    const own = url && !SE.isDefaultAvatar(url) && !deadAvatars.has(url);
    const text = name ? initials(name) : '';
    const face = own
      ? `<img src="${esc(url)}" alt="" draggable="false">`
      : text
        ? groupInitials(text)
        : '';
    return `<span class="se-fd-av ${cls}" data-state="${state}"${text ? ` data-initials="${esc(text)}"` : ''} style="--s:${size}px">${face}</span>`;
  };

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

  const initials = SE.initials;

  const groupInitials = (text) => `<b class="se-fd-ginit" aria-hidden="true">${esc(text)}</b>`;

  const groupAvatar = (name, url, size) => {
    const text = initials(name);
    return `<span class="se-fd-gav" data-initials="${esc(text)}"${size ? ` style="--s:${size}px"` : ''}>${
      url ? `<img src="${esc(url)}" alt="" draggable="false">` : groupInitials(text)
    }</span>`;
  };

  const gameIcon = (g, size, badge) =>
    `<span class="se-fd-gicon" style="--s:${size}px">${g.icon ? `<img src="${esc(g.icon)}" alt="" draggable="false">` : svg('game', Math.round(size * 0.55))}${badge ? `<b>${badge}</b>` : ''}</span>`;

  const statusLabel = (st) => ns.COPY[st] || ns.COPY.online;
  const match = (name) => !ns.state.filter || name.toLowerCase().includes(ns.state.filter);

  const friendRow = (f, sub, compact) =>
    `<div class="se-fd-row${compact ? ' se-fd-compact' : ''}" data-friend="${f.id}" role="button" tabindex="0">${avatar(f.avatar, f.state, compact ? 28 : 30, '', f.name)}` +
    `<div class="se-fd-text"><div class="se-fd-name">${esc(f.name)}</div><div class="se-fd-sub" data-state="${f.state}">${esc(sub)}</div></div></div>`;

  const groupRow = (g) =>
    `<div class="se-fd-row" data-group="${esc(g.id)}" role="button" tabindex="0">${groupAvatar(g.name, g.avatar)}<div class="se-fd-text"><div class="se-fd-name">${esc(g.name)}</div></div></div>`;

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
    // Collapsing is the title bar's button, beside Friends & Chat (client/header/header-actions.js)
    `<button type="button" class="se-fd-icon" data-act="add" data-se-tip="${ns.COPY.add}" aria-label="${ns.COPY.add}"><span class="se-fd-mask" data-icon="invite" aria-hidden="true"></span></button></div>` +
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
            gr.map(groupRow).join('')
          )
        : '') +
      '</div>'
    );
  }

  /*
   * The rail: Chats and Playing (never capped), Favorites, Online, Groups. Nobody shows
   * twice: a section skips whoever a section above it already holds. Playing puts the games two
   * or more friends share first, as tiles, then whoever plays alone, as faces with the game in
   * the corner. A capped section ends in a "+N" tile whose flyout lists the rest. Steam's compact
   * settings: compact favorites shrinks Favorites, the compact friends list every other section
   * (smaller faces in a 32 px tile, so the hit target stays, and higher caps).
   */
  const RAIL_CAP = { favorites: [4, 6], online: [3, 5], groups: [2, 3] };
  const RAIL_AV = [32, 24];
  const RAIL_GAME = [38, 28];

  const tileKey = (x) => (x.group ? `g${x.id}` : `f${x.id}`);

  function railModel(d) {
    const shown = new Set();
    const take = (list) =>
      list.filter((x) => {
        const key = tileKey(x);
        if (shown.has(key)) return false;
        shown.add(key);
        return true;
      });
    const chats = take(d.chats);
    const favorites = take(d.favorites);
    const shared = [];
    const solo = [];
    for (const g of d.games) {
      const fs = take(g.friends);
      if (fs.length > 1) shared.push({ ...g, friends: fs, tile: true });
      else solo.push(...fs);
    }
    solo.sort((x, y) => x.name.localeCompare(y.name, undefined, { sensitivity: 'base' }));
    const sections = [
      ['chats', chats],
      ['favorites', favorites],
      ['playing', [...shared, ...solo]],
      ['online', take(d.online)],
      ['groups', take(d.groups)],
    ];
    return sections
      .filter(([, items]) => items.length)
      .map(([key, items]) => {
        const compact = key === 'favorites' ? d.compact.favorites : d.compact.list;
        const cap = RAIL_CAP[key]?.[+compact] ?? Infinity;
        // One over the cap shows whole: a "+1" tile would take the place it frees
        const cut = items.length > cap + 1 ? cap : items.length;
        return { key, compact, items: items.slice(0, cut), rest: items.slice(cut) };
      });
  }

  const unreadBadge = (n) => (n ? `<b class="se-fd-unread">${n > 99 ? '99+' : n}</b>` : '');

  function railTile(x, compact) {
    const av = RAIL_AV[+compact];
    if (x.tile) {
      return `<button type="button" class="se-fd-railtile se-fd-railgame" data-game="${esc(x.key)}" data-fly="${esc(x.key)}" aria-label="${esc(x.name)}">${gameIcon(x, RAIL_GAME[+compact], x.friends.length)}</button>`;
    }
    const label = x.unread ? ns.COPY.unread(x.name, x.unread) : x.name;
    if (x.group) {
      return `<button type="button" class="se-fd-railtile se-fd-railgroup" data-group="${esc(x.id)}" data-se-tip="${esc(x.name)}" aria-label="${esc(label)}">${groupAvatar(x.name, x.avatar, av)}${unreadBadge(x.unread)}</button>`;
    }
    const corner = x.game ? `<span class="se-fd-railcorner">${gameIcon(x.game, Math.round(av / 2))}</span>` : '';
    return `<button type="button" class="se-fd-railtile se-fd-railfriend" data-friend="${x.id}" aria-label="${esc(label)}">${avatar(x.avatar, x.game ? 'ingame' : x.state, av, '', x.name)}${corner}${unreadBadge(x.unread)}</button>`;
  }

  const railHTML = (d) =>
    railModel(d)
      .map(({ key, compact, items, rest }) => {
        const label = ns.COPY.rail[key];
        const more = rest.length
          ? `<button type="button" class="se-fd-railtile se-fd-railmore" data-fly="more:${key}" aria-label="${esc(ns.COPY.moreIn(rest.length, label))}"><span style="--s:${RAIL_AV[+compact]}px">${ns.COPY.more(rest.length)}</span></button>`
          : '';
        return `<div class="se-fd-railsec" data-rail="${key}"${compact ? ' data-compact' : ''}><span class="se-fd-raillabel">${esc(label)}</span>${items.map((x) => railTile(x, compact)).join('')}${more}</div>`;
      })
      .join('');

  /*
   * A "+N" tile's flyout: the section's rest, one line each, under a heading per status (group
   * chats have none), with a search once the list is long.
   * The search's text is set after the markup (ui.js), so typing never changes it.
   */
  const FLY_SEARCH_AT = 8;
  const STATUS_RANK = ['ingame', 'online', 'busy', 'away', 'snooze', 'offline', 'invisible'];

  const lineRow = (x) =>
    `<div class="se-fd-row se-fd-line" ${x.group ? `data-group="${esc(x.id)}"` : `data-friend="${x.id}"`} data-name="${esc(x.name.toLowerCase())}" role="button" tabindex="0">` +
    (x.group ? groupAvatar(x.name, x.avatar, 22) : avatar(x.avatar, x.game ? 'ingame' : x.state, 22, '', x.name)) +
    `<span class="se-fd-name">${esc(x.name)}</span></div>`;

  function flyGroups(sec) {
    if (sec.key === 'groups') return [{ label: '', items: sec.rest }];
    const byKey = new Map();
    for (const x of sec.rest) {
      const key = x.game ? 'ingame' : x.state;
      if (!byKey.has(key)) byKey.set(key, { key, label: key === 'ingame' ? ns.COPY.inGame : statusLabel(key), items: [] });
      byKey.get(key).items.push(x);
    }
    return [...byKey.values()].sort((x, y) => STATUS_RANK.indexOf(x.key) - STATUS_RANK.indexOf(y.key));
  }

  function moreFlyHTML(sec) {
    const groups = flyGroups(sec)
      .map(
        (g) =>
          `<div class="se-fd-flygroup">${g.label ? `<div class="se-fd-flylabel">${esc(g.label)}<span>${g.items.length}</span></div>` : ''}` +
          `${g.items.map(lineRow).join('')}</div>`
      )
      .join('');
    const search =
      sec.rest.length >= FLY_SEARCH_AT
        ? `<label class="se-fd-search se-fd-flysearch">${svg('search', 14)}<input type="search" spellcheck="false" placeholder="${esc(ns.COPY.flySearch)}" aria-label="${esc(ns.COPY.flySearch)}"></label>`
        : '';
    return (
      `<div class="se-fd-flyhead"><div><div class="se-fd-name">${esc(ns.COPY.rail[sec.key])}</div>` +
      `<div class="se-fd-sub">${esc(ns.COPY.more(sec.rest.length))}</div></div></div>${search}` +
      `<div class="se-fd-flybody se-fd-flylist">${groups}<div class="se-fd-flyempty" hidden>${esc(ns.COPY.noMatch)}</div></div>`
    );
  }

  // Shows the rows whose name holds q, and the headings that still have one; counts follow
  function filterFly(root, q) {
    const query = q.trim().toLowerCase();
    let any = false;
    for (const group of root.querySelectorAll('.se-fd-flygroup')) {
      let shown = 0;
      for (const row of group.querySelectorAll('[data-name]')) {
        const match = !query || row.dataset.name.includes(query);
        row.hidden = !match;
        shown += match;
      }
      group.hidden = !shown;
      any ||= shown > 0;
      const count = group.querySelector('.se-fd-flylabel span');
      if (count) count.textContent = shown;
    }
    root.querySelector('.se-fd-flyempty')?.toggleAttribute('hidden', any);
  }

  /*
   * A card head's banner: the game's header through its copies (SE.headerURLs: newer games keep
   * it under a hashed path, the bare header.jpg 404s), stacked as background layers so a failed
   * copy shows the next (friends-dock.css .se-fd-flyhead). Non-Steam games (appid 0) have none,
   * and the head keeps its plain surface.
   */
  const cssURL = (url) => `url("${url.replace(/["\\\n]/g, encodeURIComponent)}")`;
  const headArt = (appid) => {
    const urls = (appid && run(() => SE.headerURLs(appid))) || [];
    return urls.length ? ` style="${esc(`--art:${urls.map(cssURL).join(', ')}`)}"` : '';
  };

  const flyHTML = (g) =>
    `<div class="se-fd-flyhead"${headArt(g.appid)}>` +
    `${gameIcon(g, 30)}<div><div class="se-fd-name">${esc(g.name)}</div><div class="se-fd-sub se-fd-green">${esc(ns.COPY.friendsIn(g.friends.length))}</div></div></div>` +
    `<div class="se-fd-flybody se-fd-ingame">${g.friends.map((f) => friendRow(f, f.rp, true)).join('')}</div>`;

  /*
   * The friend card (an avatar hovered in the open panel; client/friends/dock/friend-card.js):
   * the game flyout's card, headed by the friend. f: { name, avatar, state, appid, status,
   * detail }, state 'ingame' while playing.
   */
  const friendCardHTML = (f) =>
    `<div class="se-fd-card">` +
    `<div class="se-fd-flyhead"${headArt(f.appid)}>${avatar(f.avatar, f.state, 44, '', f.name)}` +
    `<div class="se-fd-text"><div class="se-fd-name">${esc(f.name)}</div>` +
    `<div class="se-fd-sub" data-state="${f.state}">${esc(f.status)}</div></div></div>` +
    (f.detail ? `<div class="se-fd-flybody"><div class="se-fd-sub">${esc(f.detail)}</div></div>` : '') +
    `</div>`;

  Object.assign(ns, {
    DEAD_AVATAR_LIMIT, avatar, deadAvatars, flyHTML, friendCardHTML, groupAvatar, groupAvatarURL,
    filterFly, groupInitials, moreFlyHTML, panelHTML, railHTML, railModel, statusLabel, svg, usableAvatar,
  });
})(window.__se);
