/*
 * Annotate Friends list group counts, active game players, and group chat previews, and fold
 * the favorites under the Friends bar's label.
 */
((SE) => {
  window.__seFriendsList?.destroy();
  if (!document.body) return;

  const { C, run, attr } = SE;
  const setAttr = (el, name, value) => attr(el, name, value || null);

  const resolveFriendsApp = () => SE.global('g_FriendsUIApp', (app) => app.FriendStore);

  const LIST_SELECTOR = '.friendlist:not(.GamepadMode)';
  /* The list and the Friends & Chat frame around it (banners sit outside the list itself) */
  const SCOPE = '.friendsui-container, .friendlist';
  const PLAYER_NAME_CLS = C.playerName;
  const COUNT_RE = /^\(\s*(\d[\d.,\s]*?)\s*\)$/;

  const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const formatPlayerSummary = (names) =>
    names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '');
  const compareNames = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });

  let playingCache = null;
  let playingCachedAt = 0;

  const playersByGame = () => {
    if (playingCache && performance.now() - playingCachedAt < 1000) return playingCache;
    playingCachedAt = performance.now();
    const app = resolveFriendsApp();
    const map = new Map();
    const allFriends = (app && run(() => app.FriendStore.all_friends)) || [];

    for (const friend of allFriends) {
      const persona = friend?.persona;
      if (!persona || !run(() => persona.is_ingame)) continue;
      const game = normalize(run(() => persona.GetCurrentGameName()));
      const name = run(() => friend.display_name) || persona.m_strPlayerName || '';
      if (!game || !name) continue;
      if (!map.has(game)) map.set(game, []);
      map.get(game).push(name);
    }

    for (const names of map.values()) names.sort(compareNames);
    playingCache = app ? map : null;
    return playingCache;
  };

  const lastSeenPlayers = new Map();

  const resolveChatGroup = (el) => {
    for (let f = SE.fiber(el), i = 0; f && i < 12; f = f.return, i++) {
      const group = f.memoizedProps?.group;
      if (group && typeof group === 'object' && 'voiceRoomList' in group) return group;
    }
    return null;
  };

  const stripBBCode = (text) =>
    String(text || '')
      .replace(/\[\/?[^\]]*\]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const formatLastMessage = (group) =>
    run(() => {
      const room = group.room_with_last_message;
      const body = stripBBCode(room && room.GetLastMessage());
      if (!body) return '';
      const sender =
        run(() => resolveFriendsApp().FriendStore.GetPlayer(room.accountid_last_message).display_name) ||
        '';
      return sender ? `${sender}: ${body}` : body;
    }) || '';

  const activeVoiceChannelName = (group) =>
    run(() => {
      for (const room of group.voiceRoomList) {
        if (!room.voice_active_contains_self && room.voice_active_member_list?.member_count > 0) {
          return room.name || '';
        }
      }
      return '';
    }) || '';

  /*
   * Banners over the list have no class of their own to rely on, so they are recognised by how
   * Steam paints them, among the elements above the favorites, and marked data-se-banner
   * (client/friends/list/friends.css draws them):
   * - "connection" ("Disconnected", "Reconnecting…"): a gradient strip (on the element or its
   *   ::before) with a short text, or, should Steam repaint it, its English wording;
   * - "invite" ("Invite anyone to play", Remote Play Together while in a game): a solid strip
   *   with an icon and an uppercase label.
   * A mark sticks to its element (the theme's look no longer matches Steam's paint), and the
   * check runs at most once a second, as it reads computed styles.
   */
  const BANNER = 'data-se-banner';
  const BANNER_SCAN_MS = 1000;
  const BANNER_SCAN_LIMIT = 250;
  const CONNECTION_TEXT = /^(?:disconnected|reconnecting|connecting|offline mode)\b/i;
  const BANNER_SKIP = '.statusHeaderGlow, .avatarHolder, .playerAvatar, .ContextMenuButton, [class^="se-"], [class*=" se-"]';
  let bannerScanAt = -Infinity;

  const hasOwnText = (el) => [...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim());

  const opaque = (color) => {
    const alpha = /rgba\([^)]*,\s*([\d.]+)\s*\)/.exec(color);
    return color !== 'transparent' && (!alpha || Number(alpha[1]) > .5);
  };

  const bannerKind = (el, minWidth) => {
    if (el.matches(BANNER_SKIP) || el.parentElement?.closest(`[${BANNER}]`)) return null;
    const rect = el.getBoundingClientRect();
    if (rect.height < 18 || rect.height > 64 || rect.width < minWidth) return null;
    const text = el.textContent.trim();
    if (!text || text.length > 60) return null;
    const style = getComputedStyle(el);
    if (
      style.backgroundImage.includes('gradient') ||
      getComputedStyle(el, '::before').backgroundImage.includes('gradient') ||
      (CONNECTION_TEXT.test(text) && opaque(style.backgroundColor))
    ) {
      return 'connection';
    }
    if (
      opaque(style.backgroundColor) &&
      el.querySelector('svg') &&
      /* Only elements holding text can show it uppercase: one style read each, not one per node */
      [el, ...el.querySelectorAll('*')].some(node => hasOwnText(node) && getComputedStyle(node).textTransform === 'uppercase')
    ) {
      return 'invite';
    }
    return null;
  };

  const markBanners = (list) => {
    /* The banner sits above the list's own container, across the top of Friends & Chat */
    const host = list.closest('.chat_main, .friendsui-container') || list.closest('.friendsListContainer') || list;
    const boundary = host.querySelector('.quickAccessFriends, .socialTabSearchContainer, .friendGroup');
    const minWidth = list.getBoundingClientRect().width * .6;
    const nodes = host.getElementsByTagName('*');
    for (let i = 0; i < nodes.length && i < BANNER_SCAN_LIMIT; i++) {
      const node = nodes[i];
      if (boundary && (node === boundary || !(node.compareDocumentPosition(boundary) & Node.DOCUMENT_POSITION_FOLLOWING))) break;
      if (node.hasAttribute(BANNER)) continue;
      const kind = bannerKind(node, minWidth);
      if (kind) node.setAttribute(BANNER, kind);
    }
    if (host.closest('.se-fd-steam')) markDockStrays(host);
  };

  /*
   * In the Library's dock a close button sits on the connection banner's end: Steam's window
   * X (the embedded Friends window can't be closed) or the banner's own. It does nothing there,
   * so any small control over the banner's end is marked data-se-dock-stray and hidden by
   * client/friends/friends-dock.css. The standalone Friends window keeps it.
   */
  const STRAY = 'data-se-dock-stray';
  const STRAY_MAX = 36;
  const STRAY_REACH = 56;

  const markDockStrays = (host) => {
    const banner = host.querySelector(`[${BANNER}="connection"]`);
    if (!banner) return;
    const edge = banner.getBoundingClientRect();
    const nodes = host.getElementsByTagName('*');
    for (let i = 0; i < nodes.length && i < BANNER_SCAN_LIMIT; i++) {
      const node = nodes[i];
      if (node === banner || node.contains(banner) || node.closest('.friendListButtons')) continue;
      const r = node.getBoundingClientRect();
      if (!r.width || r.width > STRAY_MAX || r.height > STRAY_MAX) continue;
      const overEnd = r.left >= edge.right - STRAY_REACH && r.left <= edge.right && r.bottom >= edge.top && r.top <= edge.bottom;
      if (overEnd && !node.parentElement?.hasAttribute(STRAY)) node.setAttribute(STRAY, '');
    }
  };

  /*
   * The favorites fold away under the Friends bar's label, as a list section does under its
   * header (client/friends/list/friends-search.css draws the label and its chevron). Steam's own
   * click on the label opens the search; a click (or Enter / Space) there folds the favorites
   * instead, before Steam hears it, and the magnifier still searches. Remembered across windows
   * and restarts (localStorage); data-se-favorites on Steam's header carries it.
   */
  const FAVORITES_KEY = 'se-favorites-folded';
  const FAVORITES_LABEL = `${LIST_SELECTOR} .socialListTab:not(.TabSearchActive) .tabLabel`;
  const readFolded = () => run(() => localStorage.getItem(FAVORITES_KEY) === '1') || false;

  const syncFavorites = (list) => {
    const folded = readFolded();
    setAttr(list.querySelector('.friendListHeaderContainer'), 'data-se-favorites', folded ? 'folded' : 'open');
    const label = list.querySelector('.socialListTab .tabLabel');
    if (!label) return;
    setAttr(label, 'role', 'button');
    setAttr(label, 'tabindex', '0');
    setAttr(label, 'aria-expanded', folded ? 'false' : 'true');
    // The favorites' count at the bar's end, as Group Chats counts its chats
    const count = list.querySelectorAll('.quickAccessFriends .favoriteElement').length;
    setAttr(label, 'data-se-count', count ? String(count) : '');
  };

  /*
   * Folding and opening, one motion for the whole list: what folds (the favorites, a section's
   * friends) shrinks from its height to nothing as it fades, and grows back the same way, 0.3s
   * eased in and out. data-se-folding holds it shown while it moves
   * (client/friends/list/friends-rows.css times it, so the theme's reduced Animations and the
   * system's reduced motion end it at once); then the inline sizes go and done() runs.
   */
  const FOLDING = 'data-se-folding';
  const FOLD_SIZES = ['height', 'opacity', 'padding-top', 'padding-bottom', 'margin-top', 'margin-bottom'];
  const foldTimers = new WeakMap();

  const settleFold = (el) => {
    clearTimeout(foldTimers.get(el));
    foldTimers.delete(el);
    el.removeAttribute(FOLDING);
    for (const name of FOLD_SIZES) el.style.removeProperty(name);
  };

  const shut = (el) => {
    el.style.setProperty('height', '0px');
    el.style.setProperty('opacity', '0');
    for (const name of FOLD_SIZES.slice(2)) el.style.setProperty(name, '0px', 'important');
  };

  // from / to: the height before and after (0 when folded)
  const moveBox = (el, from, to, done = () => settleFold(el)) => {
    clearTimeout(foldTimers.get(el));
    el.setAttribute(FOLDING, '');
    if (from) {
      el.style.setProperty('height', `${from}px`);
      for (const name of FOLD_SIZES.slice(1)) el.style.removeProperty(name);
    } else {
      shut(el);
    }
    void el.offsetHeight; // the start, laid out before the end is set
    if (to) {
      el.style.setProperty('height', `${to}px`);
      for (const name of FOLD_SIZES.slice(1)) el.style.removeProperty(name);
    } else {
      shut(el);
    }
    const seconds = Math.max(...getComputedStyle(el).transitionDuration.split(',').map(parseFloat));
    if (!(seconds > 0.01)) done();
    else foldTimers.set(el, setTimeout(done, seconds * 1000 + 30));
  };

  const toggleFavorites = (event) => {
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    if (event.type === 'click' && event.button !== 0) return;
    if (!event.target.closest?.(FAVORITES_LABEL)) return;
    event.preventDefault();
    event.stopPropagation();
    const folding = !readFolded();
    const lists = [...document.querySelectorAll(LIST_SELECTOR)];
    const favorites = lists.map((list) => list.querySelector('.quickAccessFriends:not(.emptyQuickAccess)'));
    // Where each one starts: its height now (one moving is caught where it is)
    const from = favorites.map((el) => (el ? el.getBoundingClientRect().height : 0));
    favorites.forEach((el) => el && settleFold(el));
    run(() => localStorage.setItem(FAVORITES_KEY, folding ? '1' : '0'));
    lists.forEach(syncFavorites);
    favorites.forEach((el, i) => {
      if (!el?.isConnected) return;
      if (folding) moveBox(el, from[i], 0);
      else moveBox(el, from[i], el.getBoundingClientRect().height);
    });
  };

  for (const type of ['click', 'keydown']) document.addEventListener(type, toggleFavorites, true);

  /*
   * The list's sections (UNREAD MESSAGES, ONLINE, OFFLINE, a game, your categories) fold the
   * same way. Steam fades each row out, then drops them all at once, so everything below jumps
   * up; opening, the rows pop in and fade. Here the section's friends move as one instead:
   * - closing, the click is held: they shrink to nothing, then Steam gets the click and closes
   *   the section, which stays at nothing until its rows are gone (Steam keeps them a moment);
   * - opening, Steam opens it at once, already held at nothing (its rows' own fade is off while
   *   they are, friends-rows.css), and it grows to its height once drawn.
   * The chevron turns on the click (data-se-fold). A body taller than the window moves only a
   * window's height; the rest is out of sight.
   */
  const SECTION_HEAD = `${LIST_SELECTOR} .friendGroup .groupName`;
  const SECTION_ROWS = '.friend, .SteamPlayerGroupFooter, .unreadFriend, .friendCategoryContainer';
  const HOLD_MS = 1000;
  let releasing = null;

  // A section's friends: what follows its header (the name, or the box that holds it)
  const sectionBody = (head) => {
    const header = head.parentElement?.classList.contains('groupHeaderContainer') ? head.parentElement : head;
    const body = header.nextElementSibling;
    return body && !body.matches('.groupName, .groupHeaderContainer, hr') ? body : null;
  };

  // Closed: held at nothing until Steam has let its rows go, then given back
  const holdClosed = (body, head) => {
    const until = performance.now() + HOLD_MS;
    const check = () => {
      if (body.isConnected && body.querySelector(SECTION_ROWS) && performance.now() < until) {
        requestAnimationFrame(check);
        return;
      }
      settleFold(body);
      head.removeAttribute('data-se-fold');
    };
    requestAnimationFrame(check);
  };

  const growSection = (head, body) => {
    const target = head.isConnected ? sectionBody(head) || body : body;
    if (!target?.isConnected) return;
    if (target !== body) settleFold(body);
    // Its natural height, measured still marked (its rows' own fade stays off), sizes cleared
    clearTimeout(foldTimers.get(target));
    target.setAttribute(FOLDING, '');
    for (const name of FOLD_SIZES) target.style.removeProperty(name);
    const natural = target.getBoundingClientRect().height;
    moveBox(target, 0, Math.min(natural, innerHeight));
  };

  const onSection = (event) => {
    if (event.button !== 0) return;
    const head = event.target.closest?.(SECTION_HEAD);
    if (!head || head === releasing || event.target.closest('.ContextMenuButton, .SortByRecent, button, a')) return;
    const body = sectionBody(head);
    if (!body) return;
    if (body.hasAttribute(FOLDING)) {
      // Already moving: this click waits for it
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (head.classList.contains('Collapsed')) {
      moveBox(body, 0, 0, () => {});
      requestAnimationFrame(() => requestAnimationFrame(() => growSection(head, body)));
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    head.setAttribute('data-se-fold', 'close');
    const from = Math.min(body.getBoundingClientRect().height, innerHeight);
    moveBox(body, from, 0, () => {
      releasing = head;
      try {
        head.click();
      } finally {
        releasing = null;
      }
      holdClosed(body, head);
    });
  };

  document.addEventListener('click', onSection, true);

  const update = () => {
    const lists = document.querySelectorAll(LIST_SELECTOR);
    if (!lists.length) return;
    const games = new Set();

    const scanBanners = performance.now() - bannerScanAt > BANNER_SCAN_MS;
    if (scanBanners) bannerScanAt = performance.now();

    for (const list of lists) {
      if (scanBanners) markBanners(list);
      syncFavorites(list);

      for (const countEl of list.querySelectorAll('.friendGroup .groupName .groupCount')) {
        const match = COUNT_RE.exec(countEl.textContent.trim());
        setAttr(countEl, 'data-se-count', match ? match[1].trim() : '');
      }

      for (const head of list.querySelectorAll('.friendGroup.gameGroup:not(.OtherGamesGroup) > .groupName')) {
        const game = normalize(
          [...head.childNodes]
            .filter(n => n.nodeType === 3)
            .map(n => n.textContent)
            .join('')
        );
        if (!game) continue;
        games.add(game);

        const visibleNames = [
          ...head.parentElement.querySelectorAll(`.friendsContainer .friend .${PLAYER_NAME_CLS}`),
        ]
          .map(el => (el.firstChild?.textContent || '').trim())
          .filter(Boolean)
          .sort(compareNames);

        if (visibleNames.length) lastSeenPlayers.set(game, visibleNames);
        const names = playersByGame()?.get(game) || lastSeenPlayers.get(game) || [];
        setAttr(head, 'data-se-who', names.length ? formatPlayerSummary(names) : '');
      }

      for (const section of list.querySelectorAll('.FriendsListChatSection')) {
        const dragBar = section.querySelector('.chatSectionTitle .voiceRoomDragBar');
        if (dragBar) {
          setAttr(
            dragBar,
            'data-se-count',
            String(section.querySelectorAll('.ChatRoomListGroupItem').length || '')
          );
        }
        for (const item of section.querySelectorAll('.ChatRoomListGroupItem')) {
          const group = resolveChatGroup(item);
          const statusBox = item.querySelector('.groupNameStatusContainer');
          if (statusBox) setAttr(statusBox, 'data-se-sub', group ? formatLastMessage(group) : '');
          const voiceIndicator = item.querySelector('.membersInVoice');
          if (voiceIndicator) {
            setAttr(voiceIndicator, 'data-se-voice', (group && activeVoiceChannelName(group)) || 'Voice');
          }
        }
      }
    }
    /* Only games that still have a group: the cache follows the list instead of growing */
    for (const game of lastSeenPlayers.keys()) {
      if (!games.has(game)) lastSeenPlayers.delete(game);
    }
  };

  /*
   * Outside the main window this also loads into Settings, Properties and the like: nothing runs
   * there beyond a class lookup per mutation until a Friends list appears.
   */
  let watcher = null;
  let timer = null;
  const start = () => {
    if (watcher) return;
    gate.disconnect();
    watcher = SE.watch(update, { scope: SCOPE, throttle: 250 });
    // Persona changes come from FriendStore, not a SteamClient event; 2 s backstop for rows
    // that update without a DOM mutation, only while the list is visible.
    timer = SE.poll(update, 2000, { active: () => SE.visible(LIST_SELECTOR) });
    update();
  };
  const gate = SE.watch(() => {
    if (document.getElementsByClassName('friendlist').length) start();
  });
  if (document.getElementsByClassName('friendlist').length) start();

  window.__seFriendsList = {
    destroy() {
      for (const type of ['click', 'keydown']) document.removeEventListener(type, toggleFavorites, true);
      document.removeEventListener('click', onSection, true);
      for (const el of document.querySelectorAll(`${LIST_SELECTOR} [data-se-fold]`)) el.removeAttribute('data-se-fold');
      gate.disconnect();
      watcher?.disconnect();
      timer?.disconnect();
      lastSeenPlayers.clear();
      for (const el of document.querySelectorAll(`[${BANNER}]`)) el.removeAttribute(BANNER);
      for (const el of document.querySelectorAll(`[${STRAY}]`)) el.removeAttribute(STRAY);
      for (const el of document.querySelectorAll(`${LIST_SELECTOR} [data-se-favorites]`)) {
        el.removeAttribute('data-se-favorites');
      }
      for (const el of document.querySelectorAll(`${LIST_SELECTOR} [${FOLDING}]`)) settleFold(el);
      for (const el of document.querySelectorAll(`${LIST_SELECTOR} .tabLabel[role="button"]`)) {
        for (const name of ['role', 'tabindex', 'aria-expanded', 'data-se-count']) el.removeAttribute(name);
      }
      for (const attrName of ['data-se-who', 'data-se-sub', 'data-se-voice']) {
        for (const el of document.querySelectorAll(`${LIST_SELECTOR} [${attrName}]`)) {
          el.removeAttribute(attrName);
        }
      }
      for (const el of document.querySelectorAll(`${LIST_SELECTOR} .voiceRoomDragBar[data-se-count]`)) {
        el.removeAttribute('data-se-count');
      }
      delete window.__seFriendsList;
    },
  };
})(window.__se);
