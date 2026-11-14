/*
 * Annotate Friends list group counts, active game players, and group chat previews.
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
   * (client/friends/friends.css draws them):
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

  const update = () => {
    const lists = document.querySelectorAll(LIST_SELECTOR);
    if (!lists.length) return;
    const games = new Set();

    const scanBanners = performance.now() - bannerScanAt > BANNER_SCAN_MS;
    if (scanBanners) bannerScanAt = performance.now();

    for (const list of lists) {
      if (scanBanners) markBanners(list);

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
    timer = SE.poll(update, 2000, { active: () => SE.visible(LIST_SELECTOR) });
    update();
  };
  const gate = SE.watch(() => {
    if (document.getElementsByClassName('friendlist').length) start();
  });
  if (document.getElementsByClassName('friendlist').length) start();

  window.__seFriendsList = {
    destroy() {
      gate.disconnect();
      watcher?.disconnect();
      timer?.disconnect();
      lastSeenPlayers.clear();
      for (const el of document.querySelectorAll(`[${BANNER}]`)) el.removeAttribute(BANNER);
      for (const el of document.querySelectorAll(`[${STRAY}]`)) el.removeAttribute(STRAY);
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
