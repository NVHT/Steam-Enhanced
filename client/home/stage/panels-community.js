/*
 * A board panel from the Community (board.js adds it to its list): Friend activity, your
 * friends' activity today from Steam's activity feed (the client's appActivityStore, the feed a
 * game page's Activity shows, read for every game at once): achievements, new games, wishlists,
 * recommendations, screenshots, first plays. Not on the board until turned on in the Home stage menu.
 *
 * A row is one sentence ("Xera started Vampire Survivors and unlocked 7 achievements"), the
 * time at its end (in the accent while it's new since your last look), and a picture in a slot
 * of one width: the achievements' icons stacked (+N; epic and legendary ringed in their tier's
 * colour), the screenshot, or the game's capsule. Back-to-back posts by one friend in one game
 * (a first play, achievements, screenshots) merge into one row. The avatar carries the friend's
 * presence ring, shows their card on hover (the Friends dock's) and opens their profile; the
 * rest of the row opens your achievement comparison, the screenshot, or the game (the library's
 * page if you own it, else the store's). Hover cards: the achievement icons (name, description,
 * rarity), a screenshot (larger), "N more" (a friend's other games). The heading has View all
 * (your Activity page). Right-click a row to hide that friend's activity or that kind of post.
 * Keys: Up / Down move between rows, Enter opens one, the menu key opens the hide menu.
 */
((SE) => {
  const ns = window.__seHomeStageParts;
  if (!ns) return;
  const { client, imgTag, ownPanel, panelMenuButton } = ns;
  const { navigate, run } = SE;

  const esc = SE.esc;
  const LIST = 150; // rows painted; the list scrolls
  const MERGE_S = 6 * 3600; // a friend's posts in one game this close together are one row
  const STACK = 3; // achievement icons shown before +N

  /** The row's time: "now", "8 min", "3 h" (every row is today's). */
  function timeText(t) {
    const s = Date.now() / 1000 - t;
    if (s < 60) return 'now';
    if (s < 3600) return `${Math.floor(s / 60)} min`;
    return `${Math.floor(s / 3600)} h`;
  }

  const openInSteam = (url) => run(() => client().URL.ExecuteSteamURL(`steam://openurl/${url}`));

  // A game you own opens in the library; any other on its store page
  function openGame(appid) {
    if (!appid) return;
    if (run(() => SE.appStore().GetAppOverviewByAppID(appid))) navigate(`/library/app/${appid}`);
    else openInSteam(`https://store.steampowered.com/app/${appid}/`);
  }

  /*
   * A game's name and capsule art: the library's name, else Steam's store item cache. Games the cache doesn't hold yet (a friend's
   * wishlist) are asked for once, with their assets.
   */
  const storeCache = () => SE.global('StoreItemCache', (c) => typeof c.GetApp === 'function');
  const asked = new Set();
  function requestGames(appids) {
    const cache = storeCache();
    const missing = appids.filter((id) => id && !asked.has(id) && !run(() => cache.GetApp(id)));
    if (!cache || !missing.length) return;
    missing.forEach((id) => asked.add(id));
    Promise.resolve(run(() => cache.QueueMultipleAppRequests(missing, { include_assets: true })))
      .then(() => ns.schedule())
      .catch(() => {});
  }

  function gameOf(appid) {
    const app = run(() => SE.appStore().GetAppOverviewByAppID(appid));
    const item = run(() => storeCache()?.GetApp(appid));
    const cdn = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}`;
    return {
      name: app?.display_name || run(() => item.GetName()) || '',
      art: [run(() => item.GetAssets().GetSmallCapsuleURL()), `${cdn}/capsule_231x87.jpg`, `${cdn}/header.jpg`].filter(Boolean),
    };
  }

  /* ---------- Reading the feed ---------- */

  // Steam's user news types (EUserNewsType) the panel shows
  const SHOWN = new Set([2, 3, 9, 10, 13, 14, 30]);
  // The ones that merge: a first play, achievements and screenshots in one game
  const MERGES = new Set([2, 13, 30]);
  // What a right-click can hide, by type: its key and its name in the menu
  const HIDE = {
    2: ['achievements', 'Achievements'],
    3: ['purchases', 'New games'],
    9: ['wishlists', 'Wishlists'],
    10: ['recommendations', 'Recommendations'],
    13: ['screenshots', 'Screenshots and videos'],
    14: ['screenshots', 'Screenshots and videos'],
    30: ['firstplays', 'First plays'],
  };

  /* What's hidden (localStorage se-home-factivity-hidden): friends by account id, kinds by key */
  const HIDDEN_KEY = 'se-home-factivity-hidden';
  function hidden() {
    try {
      const saved = JSON.parse(localStorage.getItem(HIDDEN_KEY));
      return { friends: new Set(saved?.friends || []), kinds: new Set(saved?.kinds || []) };
    } catch {
      return { friends: new Set(), kinds: new Set() };
    }
  }
  function saveHidden(next) {
    try {
      if (!next.friends.size && !next.kinds.size) localStorage.removeItem(HIDDEN_KEY);
      else localStorage.setItem(HIDDEN_KEY, JSON.stringify({ friends: [...next.friends], kinds: [...next.kinds] }));
    } catch {
      // Storage refused: nothing is hidden for good
    }
    ns.schedule();
  }
  const FEED = 0; // every game's activity, not one game's
  const REFETCH_MS = 5 * 60000;
  let fetchedAt = 0;

  const activityStore = () => SE.global('appActivityStore', (s) => typeof s.GetAppActivity === 'function');
  const friendStore = () => SE.global('g_FriendsUIApp', (a) => a.FriendStore)?.FriendStore;

  // A presence for the avatar's ring (EPersonaState), as the rail's own avatar shows yours
  const PRESENCE = { 0: 'offline', 1: 'online', 2: 'online', 3: 'away', 4: 'away', 5: 'online', 6: 'online', 7: 'offline' };

  function friendOf(steamID) {
    const id = run(() => steamID.GetAccountID());
    const player = id ? run(() => friendStore().GetPlayer(id)) : null;
    const persona = run(() => player.persona);
    const presence = PRESENCE[run(() => persona.m_ePersonaState)] || 'offline';
    const ingame = presence !== 'offline' && Boolean(run(() => persona.is_ingame));
    const sid = run(() => steamID.ConvertTo64BitString()) || '';
    return {
      id,
      sid,
      name: run(() => player.display_name) || run(() => persona.m_strPlayerName) || 'A friend',
      avatar: run(() => persona.avatar_url_medium) || '',
      // online, away, offline; in game: ingame, or ingame-away
      state: ingame ? (presence === 'away' ? 'ingame-away' : 'ingame') : presence,
    };
  }

  // An event's games: the new-game and wishlist events carry a list (GetFilteredAppIds), the
  // others one game
  const appsOf = (ev) =>
    (run(() => ev.GetFilteredAppIds?.()) || run(() => ev.GetAppIds?.()) || [run(() => ev.appid)])
      .map(Number)
      .filter(Boolean);

  // Today's start (local midnight), in Unix seconds: only the day's activity is shown
  const todayStart = () => new Date().setHours(0, 0, 0, 0) / 1000;

  function readEvents() {
    const store = activityStore();
    if (!store) return null;
    if (Date.now() - fetchedAt > REFETCH_MS) {
      fetchedAt = Date.now();
      run(() => store.FetchLatestActivity(FEED));
    }
    const model = run(() => store.GetAppActivity(FEED));
    if (!model) return { rows: [], loading: true };
    const self = run(() => store.m_CMInterface.steamid.GetAccountID());
    const hide = hidden();
    const since = todayStart();
    const events = [];
    for (const day of run(() => model.appActivityByDay) || []) {
      for (const ev of run(() => day.events) || []) {
        if (ev.bIsGameActivity || !SHOWN.has(ev.eEventType) || ev.rtEventTime < since) continue;
        const actor = run(() => ev.steamIDActor.GetAccountID());
        if ((self && actor === self) || hide.friends.has(actor) || hide.kinds.has(HIDE[ev.eEventType]?.[0])) continue;
        const apps = appsOf(ev);
        if (apps.length) events.push({ ev, apps, t: ev.rtEventTime });
      }
    }
    events.sort((a, b) => b.t - a.t);
    return { rows: mergeRows(events).slice(0, LIST), loading: false };
  }

  /*
   * Newest first, a friend's first play, achievements and screenshots in one game merge into
   * the row above them while they're within MERGE_S of it.
   */
  function mergeRows(events) {
    const rows = [];
    for (const { ev, apps, t } of events) {
      const actor = run(() => ev.steamIDActor.GetAccountID());
      const last = rows.at(-1);
      const merges =
        MERGES.has(ev.eEventType) &&
        last?.merges &&
        last.actor === actor &&
        last.apps[0] === apps[0] &&
        last.oldest - t <= MERGE_S;
      const row = merges
        ? last
        : { key: ev.unUniqueID, actor, steamID: ev.steamIDActor, apps, t, oldest: t, types: new Set(), ach: [], shots: [], merges: MERGES.has(ev.eEventType) };
      row.types.add(ev.eEventType);
      row.oldest = Math.min(row.oldest, t);
      if (ev.eEventType === 2) row.ach.push(...(run(() => ev.achievements) || []));
      if (ev.eEventType === 13) row.shots.push(...(run(() => ev.screenshots) || []));
      if (!merges) rows.push(row);
    }
    return rows;
  }

  /* ---------- A row ---------- */

  /** The row's sentence after the friend's name: what they did, the game in bold. */
  function sentence(row, game) {
    const g = `<b>${esc(game.name || 'a game')}</b>`;
    // The rest of a friend's games: a card of them on hover
    const more =
      row.apps.length > 1 ? ` and <span class="se-hs-fothers" data-card="more:${row.key}">${row.apps.length - 1} more</span>` : '';
    const t = row.types;
    if (t.has(3)) return `got ${g}${more}`;
    if (t.has(9)) return `wishlisted ${g}${more}`;
    if (t.has(10)) return `recommended ${g}`;
    if (t.has(14)) return `shared a video of ${g}`;
    const parts = [];
    if (t.has(30)) parts.push(`started ${g}`);
    const where = parts.length ? '' : ` in ${g}`;
    if (row.ach.length === 1) parts.push(`unlocked <b>${esc(row.ach[0].strName)}</b>${where}`);
    else if (row.ach.length) parts.push(`unlocked ${row.ach.length} achievements${where}`);
    if (row.shots.length) {
      const of = parts.length ? '' : ` of ${g}`;
      parts.push(`${row.shots.length === 1 ? 'shared a screenshot' : `shared ${row.shots.length} screenshots`}${of}`);
    }
    return parts.join(' and ') || `played ${g}`;
  }

  /*
   * The row's picture, in a slot of one width so every row's time lines up: achievement icons
   * stacked (the rare ones, epic and legendary, ringed in their tier's colour), the screenshot,
   * or the game's capsule at its own shape.
   */
  const RARE = new Set(['legendary', 'epic']);
  function picture(row, game) {
    if (row.ach.length) {
      const icons = row.ach
        .slice(0, STACK)
        .map((a) => {
          const tier = SE.rarity.tierOf(a.flAchieved);
          const ring = tier && RARE.has(tier.id) ? ` data-se-tier="${tier.id}"` : '';
          return `<img src="${esc(a.strImage)}" alt="" draggable="false"${ring}>`;
        })
        .join('');
      const rest = row.ach.length - STACK;
      return (
        `<span class="se-hs-fpic"><span class="se-hs-fstack" data-card="ach:${row.key}">${icons}` +
        `${rest > 0 ? `<span class="se-hs-fmore">+${rest}</span>` : ''}</span></span>`
      );
    }
    const shot = row.shots[0]?.preview_url;
    const urls = shot ? [shot] : game.art;
    return (
      '<span class="se-hs-fpic">' +
      (urls.length
        ? `<span class="se-hs-ithumb"${shot ? ` data-card="shot:${row.key}"` : ''}>${imgTag(urls, 'se-hs-fart')}</span>`
        : '') +
      '</span>'
    );
  }

  // Where the row goes: achievements to your comparison with the friend, a screenshot to its page,
  // anything else to the game
  function targetOf(row, friend) {
    if (row.ach.length && friend.sid) return `url:https://steamcommunity.com/profiles/${friend.sid}/stats/${row.apps[0]}/compare`;
    const shot = row.shots[0]?.publishedfileid;
    if (shot) return `url:https://steamcommunity.com/sharedfiles/filedetails/?id=${shot}`;
    return `app:${row.apps[0]}`;
  }

  function rowHTML(row, seenAt, friend, game) {
    const text = sentence(row, game);
    const plain = `${friend.name} ${text.replace(/<[^>]+>/g, '')}`;
    const kinds = [...new Set([...row.types].map((t) => HIDE[t]?.[0]).filter(Boolean))].join(',');
    return (
      `<div class="se-hs-item" data-item role="listitem" data-friend-id="${friend.id || ''}" data-friend-name="${esc(friend.name)}" data-kinds="${kinds}"${row.t > seenAt ? ' data-new' : ''}>` +
      `<button type="button" class="se-hs-iicon" data-avatar data-state="${friend.state}" data-profile="${esc(friend.sid)}" data-friend="${friend.id || ''}" aria-label="${esc(friend.name)}’s profile">` +
      (friend.avatar ? `<img src="${esc(friend.avatar)}" alt="" draggable="false">` : '') +
      '</button>' +
      // No title: the client shows one as its own tooltip, which flickered against the hover cards
      `<button type="button" class="se-hs-fmain" data-go="${esc(targetOf(row, friend))}" aria-label="${esc(plain)}">` +
      `<span class="se-hs-fline"><b>${esc(friend.name)}</b> ${text}</span>` +
      `<span class="se-hs-ftime">${esc(timeText(row.t))}</span>` +
      picture(row, game) +
      '</button></div>'
    );
  }

  /*
   * Each row's markup, kept while what it shows is the same: a pass still reads the friend and
   * the game, but builds markup only for rows whose inputs moved. Rows that left the list drop.
   */
  let rowCache = new Map(); // row.key → { inputs, html }
  function rowsHTML(rows, seenAt) {
    const next = new Map();
    const html = rows.map((row) => {
      const friend = friendOf(row.steamID);
      const game = gameOf(row.apps[0]);
      const inputs = [
        row.t, row.oldest, row.apps.length, [...row.types].join(), row.ach.length, row.shots.length,
        friend.id, friend.name, friend.state, friend.avatar, game.name, game.art[0] || '',
        timeText(row.t), row.t > seenAt,
      ].join('|');
      const key = String(row.key);
      const hit = rowCache.get(key);
      const entry = hit?.inputs === inputs ? hit : { inputs, html: rowHTML(row, seenAt, friend, game) };
      next.set(key, entry);
      return entry.html;
    });
    rowCache = next;
    return html.join('');
  }

  /* ---------- The panel ---------- */

  const ACTIVITY_URL = 'https://steamcommunity.com/my/home/';

  function onClick(e) {
    if (e.target.closest('[data-all]')) {
      openInSteam(ACTIVITY_URL);
      return;
    }
    const profile = e.target.closest('[data-profile]');
    if (profile) {
      if (profile.dataset.profile) openInSteam(`https://steamcommunity.com/profiles/${profile.dataset.profile}/`);
      return;
    }
    const go = e.target.closest('[data-go]')?.dataset.go;
    if (!go) return;
    if (go.startsWith('url:')) openInSteam(go.slice(4));
    else openGame(Number(go.slice(4)));
  }

  // Right-click a row: hide that friend, or a kind of post it shows; or bring back what's hidden
  function onContext(e) {
    const row = e.target.closest('[data-item]');
    if (!row || !SE.layer) return;
    e.preventDefault();
    const hide = hidden();
    const id = Number(row.dataset.friendId);
    const kinds = row.dataset.kinds.split(',').filter(Boolean);
    const names = Object.fromEntries(Object.values(HIDE));
    const items = [{ heading: 'Hide' }];
    if (id) {
      items.push({
        label: `${row.dataset.friendName}’s activity`,
        icon: '--se-icon-eye-off',
        run: () => saveHidden({ ...hide, friends: new Set([...hide.friends, id]) }),
      });
    }
    for (const kind of kinds) {
      items.push({
        label: names[kind],
        hint: 'From every friend',
        icon: '--se-icon-eye-off',
        run: () => saveHidden({ ...hide, kinds: new Set([...hide.kinds, kind]) }),
      });
    }
    if (hide.friends.size || hide.kinds.size) {
      const count = hide.friends.size + hide.kinds.size;
      items.push(
        { separator: true },
        {
          label: 'Show everything again',
          hint: `${count} hidden`,
          icon: '--se-icon-restore',
          run: () => saveHidden({ friends: new Set(), kinds: new Set() }),
        }
      );
    }
    // From the keyboard's menu key the event has no pointer: the menu opens under the row
    const r = row.getBoundingClientRect();
    const at = e.clientX || e.clientY ? { left: e.clientX, top: e.clientY } : { left: r.left + 40, top: r.bottom };
    SE.layer.menu(items, at);
  }

  /*
   * New since your last look: the newest post's time is kept (localStorage
   * se-home-factivity-seen) as the panel shows; posts after the time kept when this look began
   * have their time in the accent. A look begins when the panel paints after a minute without painting (Home left,
   * or the window away).
   */
  const SEEN_KEY = 'se-home-factivity-seen';
  let lookSeen = null;
  let lastPaint = 0;
  let savedSeen = 0; // the last time written: a paint writes only when it changes
  function seenAt(rows) {
    if (lookSeen === null || performance.now() - lastPaint > 60000) {
      lookSeen = Number(SE.run(() => localStorage.getItem(SEEN_KEY))) || todayStart();
    }
    lastPaint = performance.now();
    const newest = rows.reduce((t, r) => Math.max(t, r.t), 0);
    if (newest > lookSeen && newest !== savedSeen) {
      savedSeen = newest;
      SE.run(() => localStorage.setItem(SEEN_KEY, String(newest)));
    }
    return lookSeen;
  }

  /*
   * Hover cards, drawn by the popup layer as the theme's other cards (client/shared/popup-layer.js):
   * the achievements of a row (icon, name, description, rarity; up to eight, then +N), or its
   * screenshot larger with its caption. Beside what was hovered, kept inside the window.
   */
  const shown = new Map(); // row key → row, for the cards
  const CARD_ACH = 8;

  function achCard(row) {
    const game = gameOf(row.apps[0]);
    const list = row.ach.slice(0, CARD_ACH).map((a) => {
      const tier = SE.rarity.tierOf(a.flAchieved);
      const pct = typeof a.flAchieved === 'number' ? `${SE.rarity.fmtPct(a.flAchieved)}%` : '';
      return (
        '<div class="se-hs-fcard-row">' +
        `<img src="${esc(a.strImage)}" alt=""${tier ? ` data-se-tier="${tier.id}"` : ''}>` +
        `<span class="se-hs-fcard-text"><b>${esc(a.strName)}</b><span>${esc(a.strDescription || '')}</span></span>` +
        (tier ? `<span class="se-hs-fcard-rare" data-se-tier="${tier.id}">${esc(tier.name)}<span>${pct}</span></span>` : '') +
        '</div>'
      );
    });
    const rest = row.ach.length - CARD_ACH;
    return (
      '<div class="se-hs-fcard">' +
      `<div class="se-hs-fcard-head">${esc(game.name || 'Achievements')}<span>${row.ach.length} unlocked</span></div>` +
      list.join('') +
      (rest > 0 ? `<div class="se-hs-fcard-foot">+${rest} more</div>` : '') +
      '</div>'
    );
  }

  function shotCard(row) {
    const shot = row.shots[0];
    const more = row.shots.length - 1;
    return (
      '<div class="se-hs-fcard" data-shot>' +
      `<img src="${esc(shot.file_url || shot.preview_url)}" alt="">` +
      (shot.file_description ? `<div class="se-hs-fcard-caption">${esc(shot.file_description)}</div>` : '') +
      (more > 0 ? `<div class="se-hs-fcard-foot">+${more} more</div>` : '') +
      '</div>'
    );
  }

  // A friend's other games (their wishlist or new games past the first): name and capsule
  function moreCard(row) {
    const games = row.apps.slice(1, 1 + CARD_ACH).map((id) => {
      const game = gameOf(id);
      return (
        '<div class="se-hs-fcard-row">' +
        `<span class="se-hs-ithumb">${game.art.length ? imgTag(game.art, 'se-hs-fart') : ''}</span>` +
        `<span class="se-hs-fcard-text"><b>${esc(game.name || 'A game')}</b></span></div>`
      );
    });
    const rest = row.apps.length - 1 - CARD_ACH;
    return (
      '<div class="se-hs-fcard">' +
      `<div class="se-hs-fcard-head">Also<span>${row.apps.length - 1} more</span></div>` +
      games.join('') +
      (rest > 0 ? `<div class="se-hs-fcard-foot">+${rest} more</div>` : '') +
      '</div>'
    );
  }

  const CARD = { ach: achCard, shot: shotCard, more: moreCard };

  const cards = SE.layer?.hover({
    sheets: ['client/shared/achievement-tiers.css', 'client/home/stage/stage-panels.css'],
    place: (node) => {
      const r = node.getBoundingClientRect();
      const gap = SE.px('--se-space-3');
      // Left of the picture (it sits at the row's right end); under "N more" in the sentence. The
      // layer keeps it in the window.
      return node.dataset.card.startsWith('more:')
        ? { left: r.left, top: r.bottom + gap }
        : (w, h) => ({ left: r.left - gap - w, top: r.top + r.height / 2 - h / 2 });
    },
    draw: (node, row) => (container) => {
      container.insertAdjacentHTML('beforeend', CARD[node.dataset.card.split(':')[0]](row));
    },
  });

  function onCardOver(e) {
    const node = e.target.closest('[data-card]');
    const row = node && shown.get(node.dataset.card.slice(node.dataset.card.indexOf(':') + 1));
    if (row && cards && node !== cards.node) cards.enter(node, row);
  }

  function onCardOut(e) {
    if (cards?.left(e)) cards.leave();
  }

  /*
   * A repaint replaces the rows: a card (ours, or the friend card) whose row went with it never
   * hears the pointer leave, so it closes here. So does one when the list scrolls or the pointer
   * leaves the panel.
   */
  function dropCards(always = false) {
    if (cards?.node && (always || !cards.node.isConnected)) cards.leave();
    window.__seFriendsDockParts?.friendCard?.dropFor?.(always);
  }

  // Up / Down move between rows (their main button); Enter opens one as a click does
  function onKey(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const list = e.currentTarget;
    const rows = [...list.querySelectorAll('.se-hs-fmain')];
    const i = rows.indexOf(document.activeElement?.closest('.se-hs-item')?.querySelector('.se-hs-fmain'));
    const next = rows[i < 0 ? 0 : Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (!next) return;
    e.preventDefault();
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }

  function paintActivity(cell) {
    const entry = ownPanel(cell, 'se-hs-factivity', (el) => {
      el.innerHTML =
        '<div class="se-hs-ohead"><span class="se-hs-nh">Friend activity</span>' +
        `<button type="button" class="se-hs-hall" data-all>View all</button>${panelMenuButton('Friend activity')}</div>` +
        '<div class="se-hs-list" role="list"></div>';
      el.addEventListener('click', (e) => {
        if (!e.target.closest('[data-panel-menu]')) onClick(e);
      });
      el.addEventListener('contextmenu', onContext);
      el.addEventListener('mouseover', onCardOver);
      el.addEventListener('mouseout', onCardOut);
      const list = el.querySelector('.se-hs-list');
      list.addEventListener('keydown', onKey);
      list.addEventListener('scroll', () => dropCards(true), { passive: true });
      el.addEventListener('mouseleave', () => dropCards(true));
      // An avatar hovered shows the friend's card, the Friends dock's (client/friends/dock/friend-card.js)
      const card = () => window.__seFriendsDockParts?.friendCard;
      el.addEventListener('mouseover', (e) => {
        const avatar = e.target.closest('[data-friend]');
        if (avatar && Number(avatar.dataset.friend)) card()?.showFor(avatar, Number(avatar.dataset.friend));
      });
      el.addEventListener('mouseout', (e) => card()?.leaveFor(e));
    });
    const data = readEvents();
    const rows = data?.rows || [];
    requestGames(rows.flatMap((r) => r.apps));
    const seen = seenAt(rows);
    shown.clear();
    for (const row of rows) shown.set(String(row.key), row);
    const list = entry.el.querySelector('.se-hs-list');
    const html = rowsHTML(rows, seen);
    // The markup is the signature: names, art and times arriving all change it
    const sig = `${data ? (data.loading ? 'loading' : '') : 'none'}|${html}`;
    if (entry.sig !== sig) {
      entry.sig = sig;
      // A repaint keeps where the list was scrolled to (and the row that had focus)
      const top = list.scrollTop;
      const focused = list.contains(document.activeElement)
        ? document.activeElement.closest('.se-hs-item')?.querySelector('.se-hs-fmain')?.dataset.go
        : null;
      list.innerHTML =
        html ||
        `<span class="se-hs-empty">${
          !data
            ? 'Friend activity isn’t available yet'
            : data.loading
              ? 'Loading friend activity…'
              : 'Nothing from your friends today'
        }</span>`;
      // A scroll write forces layout: only when there's a place to go back to
      if (top) list.scrollTop = top;
      dropCards();
      if (focused) list.querySelector(`.se-hs-fmain[data-go="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
    }
    // Scrolls rather than fits: nothing to fit once measured
    return { entry, grid: list, fit: () => {} };
  }

  /* ---------- Its place on the board (board.js) ---------- */

  ns.COMMUNITY_PANELS = {
    factivity: {
      name: 'Friend activity',
      desc: 'What your friends did today',
      span: 4,
      opts: {},
      paint: paintActivity,
    },
  };
})(window.__se);
