/*
 * Shared data: user-facing copy, Steam's FriendStore lookups, saved settings, and the `state`
 * object every part reads and writes.
 */
((SE) => {
  const ns = window.__seFriendsDockParts;
  if (!ns) return;
  const { groupAvatarURL } = ns;

  const { run } = SE;

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
   * State the dock's parts share (the dock, its chat flyout, Steam's embedded Friends, chat
   * routing, menus). One object, so every part reads and sets the same values.
   */
  const state = {
    dockHidden: store.get('se-fdock-hidden', '0') === '1',
    manualWindowOpen: 0,
    allowNativeWindow: false,
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
    flyGame: null,
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
    COPY, STATE, ago, app, closedSections, ctx, flyoutOwnedTabs, friendsOf, groupsOf, importOf,
    managerTimers, openGames, read, state, store,
  });
})(window.__se);
