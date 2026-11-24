/*
 * Shared data: user-facing copy, Steam's FriendStore lookups, saved settings, and the `state`
 * object every part reads and writes.
 */
((SE) => {
  const ns = window.__seFriendsDockParts;
  if (!ns) return;
  const { groupAvatarURL } = ns;

  const { importOf, run } = SE;

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
    lastOnline: (t) => `Last online ${t}`,
    more: (n) => `+${n}`,
    moreIn: (n, label) => `${n} more in ${label}`,
    flySearch: 'Search',
    noMatch: 'No one matches',
    unread: (name, n) => `${name}, ${n} unread`,
    // The rail's sections (its labels must fit 60 px in capitals)
    rail: { chats: 'Chats', favorites: 'Favorites', playing: 'Playing', online: 'Online', groups: 'Groups' },
    friendsIn: (n) => `${n} friend${n === 1 ? '' : 's'} playing`,
    message: 'Send message',
    messageHint: 'Open a chat with them',
    profile: 'View profile',
    profileHint: 'Their page on Steam Community',
    viewGame: (g) => `View ${g} in Library`,
    viewGameHint: 'Its page in your library',
    openGroup: 'Open chat',
    openGroupHint: 'The group’s chat',
    favorite: 'Add to favorites',
    favoriteHint: 'Pin it to the top of your list',
    unfavorite: 'Remove from favorites',
    unfavoriteHint: 'Unpin it from the top',
    leaveGroup: 'Leave group chat',
    leaveGroupHint: 'You can rejoin by invite',
    steamFailed: (r) => `Steam's Friends & Chat couldn't be shown here (${r}).`,
  };



  const app = () => SE.global('g_FriendsUIApp', (a) => a.FriendStore);

  const ctx = (a) => run(() => a.GetDefaultBrowserContext());

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

  // A chat group's unread count: its rooms', each as Steam's notification level counts it
  const groupUnread = (g) => {
    let n = 0;
    for (const room of run(() => g.m_mapRooms.values()) || []) n += run(() => room.unread_message_count) || 0;
    return n;
  };

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
    const byId = new Map();

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
      byId.set(item.id, item);
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
        item.game = { key, appid, name: g.name, icon: g.icon };
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

    const groupById = new Map();
    const groups = groupsOf(a)
      .map((g) => {
        const item = {
          id: String(run(() => g.GetGroupID()) ?? run(() => g.m_ulGroupID) ?? ''),
          group: true,
          name: run(() => g.name) || '',
          avatar: groupAvatarURL(g),
          unread: groupUnread(g),
        };
        groupById.set(item.id, item);
        return item;
      })
      .filter((g) => g.id)
      .sort(byName);

    // Steam's favorites in its order (a friend or a chat group; a clan has no chat to open here)
    const favorites = (run(() => a.FriendStore.FavoritesStore.favorites) || [])
      .map((fav) =>
        fav?.friend
          ? byId.get(run(() => fav.friend.accountid))
          : fav?.chat && groupById.get(String(run(() => fav.chat.GetGroupID()) ?? ''))
      )
      .filter(Boolean);

    // Unread conversations, newest first: friends' (blocked ones aside), then group chats'
    const friendChats = (run(() => a.ChatStore.FriendChatStore.m_rgFriendChats) || [])
      .map((c) => {
        const unread = run(() => (c.is_blocked_friend ? 0 : c.unread_message_count)) || 0;
        const item = unread && byId.get(run(() => c.m_unAccountIDFriend));
        return item && { ...item, unread, at: run(() => c.time_last_message) || 0 };
      })
      .filter(Boolean)
      .sort((x, y) => y.at - x.at);
    const chats = [...friendChats, ...groups.filter((g) => g.unread)];

    const settings = run(() => a.SettingsStore.FriendsSettings);
    const compact = {
      favorites: Boolean(run(() => settings.bCompactQuickAccess)),
      list: Boolean(run(() => settings.bCompactFriendsList)),
    };

    return { me, games: list, online, offline, groups, favorites, chats, compact };
  }

  const store = {
    get: (k, d) => {
      try {
        return localStorage.getItem(k) ?? d;
      } catch {
        return d;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch {}
    },
  };

  /*
   * "Dock at startup" (client/shared/settings.js): Open or Folded sets how this session starts,
   * written where the dock keeps its choice; As left keeps what's there
   */
  const dockStart = SE.settings?.get('dock-start');
  if (dockStart === 'open' || dockStart === 'folded') {
    store.set('se-fdock-hidden', '0');
    store.set('se-fdock', dockStart === 'open' ? 'open' : 'rail');
  }

  /*
   * State the dock's parts share (the dock, its chat flyout, Steam's embedded Friends, chat
   * routing, menus). One object, so every part reads and sets the same values.
   */
  const state = {
    dockHidden: store.get('se-fdock-hidden', '0') === '1',
    manualWindowOpen: 0,
    allowNativeWindow: false,
    // Open or rail as drawn; the saved choice is store 'se-fdock' (small windows fold it, ui.js)
    mode: store.get('se-fdock', 'open'),
    view: 'steam',
    steamError: '',
    destroyed: false,
    statusTimer: 0,
    firstGameOpened: false,
    filter: '',
    searchText: '',
    searching: false,
    data: null,
    sig: '',
    flyKey: null,
    // The open "+N" flyout's search text (ui.js)
    flyQuery: '',
    flyTimer: 0,
    readAt: 0,
    steamMounted: false,
    steamRoot: null,
    chatContext: null,
    activeChatFriend: null,
    dockTabs: null,
    // The flyout's box follows only the window size, the dock's mode and the kind of chat, so the
    // layout reads (computed style, dock rect) happen when one of those changes, not every frame.
    geometryCache: null,
    chatNavigationUntil: 0,
    focusedBrowserView: null,
    foregroundApp: null,
    openingDockChat: 0,
  };
  const flyoutOwnedTabs = new Map();
  const managerTimers = new Set();
  const openGames = new Set();
  const closedSections = new Set(['offline']);

  Object.assign(ns, {
    COPY, STATE, ago: SE.ago, app, closedSections, ctx, flyoutOwnedTabs, friendsOf, groupsOf, importOf,
    managerTimers, openGames, read, state, store,
  });
})(window.__se);
