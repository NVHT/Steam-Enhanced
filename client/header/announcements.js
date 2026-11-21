/*
 * The rail's Announcements button: a click opens a news menu beside it (the theme's menu,
 * SE.layer.menu) instead of Steam's own: Steam's posts, then your games', each with its art, its
 * kind and source, its time and an accent dot while unread; Mark all read in the header, Steam
 * News at the foot. The news is Steam's (client/shared/news-feed.js, SE.news). A dot on the
 * button while anything is unread (client/navigation/nav-rail.css).
 */
((SE) => {
  const { C } = SE;
  window.__seAnnouncements?.destroy?.();
  const state = (window.__seAnnouncements = {});
  if (!SE.news || !SE.layer) return;

  // Steam's button in the title bar's controls (at the rail's foot); the theme's own buttons
  // carry the same class (client/header/header-actions.js) and Big Picture may too.
  const BUTTON = [
    `.${C.FocusNavigationRoot_TitleBarControls} .${C.AnnouncementsButton}`,
    ':not(.se-header-action):not(.se-native-header-button)',
    `:not(.${C.GamepadUIToggle})`,
  ].join('');
  const STEAM_ROWS = 4;
  const GAME_ROWS = 5;
  const KIND_ICON = {
    steam: '--se-icon-news',
    news: '--se-icon-news',
    events: '--se-icon-calendar',
    streams: '--se-icon-broadcast',
    updates: '--se-icon-refresh',
    releases: '--se-icon-store',
    sales: '--se-icon-tag',
  };

  /*
   * What has been read: every post up to `through` (Unix seconds), and the keys of later ones
   * opened since. A first run counts the last three days as new.
   */
  const READ_KEY = 'se-announcements-read';
  const MAX_KEYS = 200;
  function loadRead() {
    try {
      const saved = JSON.parse(localStorage.getItem(READ_KEY));
      if (Number.isFinite(saved?.through) && Array.isArray(saved.keys)) {
        return { through: saved.through, keys: new Set(saved.keys) };
      }
    } catch {
      // Unreadable: start over
    }
    return { through: Date.now() / 1000 - 3 * 86400, keys: new Set() };
  }
  const read = loadRead();
  function saveRead() {
    try {
      localStorage.setItem(READ_KEY, JSON.stringify({ through: read.through, keys: [...read.keys].slice(-MAX_KEYS) }));
    } catch {
      // Storage full or off: read state lasts this session
    }
  }
  const isUnread = (it) => it.t > read.through && !read.keys.has(it.key);

  function markRead(it) {
    read.keys.add(it.key);
    saveRead();
    refresh();
  }

  function markAllRead(items) {
    read.through = Math.max(read.through, ...items.map((it) => it.t || 0));
    read.keys.clear();
    saveRead();
    refresh();
  }

  // A short time for the row's end: 5m, 3h, 2d, then the date
  function ago(t) {
    const s = Date.now() / 1000 - t;
    if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
    return new Date(t * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function row(it) {
    const kind = SE.news.KINDS[it.kind] || SE.news.KINDS.news;
    return {
      label: it.title,
      hint: it.kind === 'steam' ? it.game : `${kind} · ${it.game}`,
      // The poster's picture: Steam's group avatar for its own posts, a game's square icon for
      // its posts (it reads at 32px), else the post's art; the kind's glyph until one loads
      art: (it.kind === 'steam' ? it.avatar : it.icon) || it.img || '',
      icon: KIND_ICON[it.kind] || KIND_ICON.news,
      time: ago(it.t),
      unread: isUnread(it),
      run: () => {
        markRead(it);
        SE.news.open(it);
      },
    };
  }

  // What the menu shows: Steam's latest posts, then your games'
  function latest() {
    const { items, loading } = SE.news.items();
    const steam = items.filter((it) => it.kind === 'steam').slice(0, STEAM_ROWS);
    const games = items.filter((it) => it.kind !== 'steam').slice(0, GAME_ROWS);
    return { steam, games, shown: [...steam, ...games], loading };
  }

  function entries() {
    const { steam, games, shown, loading } = latest();
    const unread = shown.some(isUnread);
    const list = [
      {
        heading: 'Announcements',
        action: unread
          ? {
              label: 'Mark all read',
              run: (menu) => {
                markAllRead(shown);
                menu.update(entries());
              },
            }
          : null,
      },
    ];
    if (!shown.length) list.push({ note: loading ? 'Loading news…' : 'No news lately' });
    if (steam.length) list.push({ heading: 'Steam' }, ...steam.map(row));
    if (games.length) {
      if (steam.length) list.push({ separator: true });
      list.push({ heading: 'Your games' }, ...games.map(row));
    }
    list.push(
      { separator: true },
      { label: 'Open Steam News', icon: '--se-icon-news', external: true, run: () => SE.news.openHub() }
    );
    return list;
  }

  let menu = null;
  function toggle(button) {
    if (menu && !menu.released) {
      menu.release();
      menu = null;
      return;
    }
    menu = SE.layer.menu(
      entries(),
      // Beside the rail, its bottom level with the button's, as every foot menu opens
      SE.layer.besideRail(button, { foot: true }),
      { owner: button, closeOnLeave: true }
    );
    // No panel could open: the news hub instead
    if (!menu) SE.news.openHub();
  }

  // The button's dot: anything unread among what the menu shows
  let unreadCount = 0;
  function refresh() {
    unreadCount = latest().shown.filter(isUnread).length;
    mark();
  }

  // Steam re-renders the button: its marks go back on with every structural change
  function mark() {
    const button = document.querySelector(BUTTON);
    if (!button) return;
    SE.attr(button, 'aria-haspopup', 'menu');
    SE.attr(button, 'data-se-unread', unreadCount ? '' : null);
  }

  // The click is the theme's while the rail is up: Steam's own handler never hears it
  const railUp = () => document.body?.classList.contains('se-header-actions-ready');
  function onClick(event) {
    const button = railUp() && event.target.closest?.(BUTTON);
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggle(button);
  }

  function onKey(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const button = railUp() && event.target.closest?.(BUTTON);
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggle(button);
  }

  addEventListener('click', onClick, true);
  addEventListener('keydown', onKey, true);
  const offNews = SE.news.onChange(refresh);
  const observer = SE.watch(mark, { throttle: 300 });
  // Steam's events load on their own, with no change event: counted again every minute
  const timer = SE.poll(refresh, 60000);
  refresh();

  state.destroy = () => {
    removeEventListener('click', onClick, true);
    removeEventListener('keydown', onKey, true);
    offNews();
    observer?.disconnect();
    timer?.disconnect();
    menu?.release();
    const button = document.querySelector(BUTTON);
    if (button) {
      SE.attr(button, 'data-se-unread', null);
      SE.attr(button, 'aria-haspopup', null);
    }
  };
})(window.__se);
