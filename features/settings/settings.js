/*
 * Steam Settings, Game Properties, and Millennium Settings layout controller.
 *
 * - Resizes and centers Steam Settings (1080x1010) and Game Properties (1040x840)
 *   windows when shown.
 * - Populates sidebar category headers, duotone navigation icons, and a live
 *   cross-page settings search bar.
 * - Tags contiguous Field rows with card boundary attributes (`data-se-c`),
 *   section headers (`data-se-sec`), segmented radio groups, keyboard shortcut
 *   badges (`data-se-kbd`), and row icons (`data-se-row`).
 * - Enhances Game Properties tabs (Cloud quota bar, Build ID copy actions,
 *   disk usage bar, DLC counts, and Workshop empty states).
 */
(window.__se
  ? (init) => init(window.__se)
  : (init) => addEventListener('se-core', () => init(window.__se), { once: true })
)((SE) => {
  const { C, attr: setAttr, fromProps } = SE;
  window.__steamEnhancedSettings?.destroy?.();

  const LIST = `.${C.PagedSettingsDialog_PageList}`;
  const ITEM = `.${C.PagedSettingsDialog_PageListItem}`;
  const SEP = `.${C.PageListSeparator}`;
  const TITLE = `.${C.PagedSettingsDialog_Title}`;
  const TEXT = `.${C.PageListItem_Title}`;
  const ACTIVE = C.PagedSettingsDialog_Active;
  const CONTENT = `.${C.PagedSettingsDialog_PageContent}`;
  const FIELD = `.${C.Field}`;
  const FIELD_BG = C.Background;
  const LABEL = `.${C.FieldLabel}`;
  const ACCOUNT_HEADER = `:is(.${C.CurrentUserProfileBackground_AvatarAndLabel}, .${C.EntryLabel_AvatarAndLabel})`;
  const UPDATE_TIMING = `.${C.FakeContainer}`;
  const SECTION = `.SettingsDialogSubHeader, .${C.SettingsDialogSubHeader}, .DialogControlsSectionHeader, .DialogSubHeader, .${C.Subheader}`;
  const BODY_TEXT = `.SettingsDialogBodyText, .${C.SettingsDialogBodyText}, .DialogBodyText, .DialogLabel, .${C.SettingsDialogDescriptionText}`;
  const SIZE = { w: 1080, h: 1010 };
  const PROPS_SIZE = { w: 1040, h: 840 };

  const PAGES = [
    ['Account', 'account', 'Your profile, wallet and how others find you'],
    ['Friends & Chat', 'friendsic', 'How your friends list and chats look and behave'],
    ['Family', 'family', 'Library sharing, parental controls and purchase requests'],
    ['Security', 'security', 'Sign-in, Steam Guard and devices'],
    ['Notifications', 'notify', 'Toasts, sounds and where Steam reaches you'],
    ['Interface', 'interface', 'Language, start-up and how Steam looks'],
    ['Store', 'storeic', 'What the store shows you'],
    ['Library', 'libic', 'Size, performance and what the list shows'],
    ['Downloads', 'dl', 'Region, speed, updates and shaders'],
    ['Storage', 'storage', 'Drives and what is installed on them'],
    ['Cloud', 'cloud', 'Saves and screenshots'],
    ['In Game', 'ingame', 'The Steam Overlay, performance monitor and screenshots'],
    ['Accessibility', 'access', 'Size, contrast and motion'],
    ['Controller', 'controller', 'Connected controllers and setup'],
    ['Game Recording', 'rec', 'Record gameplay in the background or on demand'],
    ['Voice', 'voice', 'Microphone, speakers and transmission'],
    ['Remote Play', 'remote', 'Stream games between your devices'],
    ['Broadcast', 'broadcast', 'Let friends watch you play'],
    ['Music', 'music', 'Soundtrack playback in Steam'],
  ];
  const BY_NAME = new Map(PAGES.map((p) => [p[0].toLowerCase(), p]));

  const MILL_PAGES = [
    ['General', 'mgeneral', 'How Millennium starts, updates and loads themes', 'general'],
    ['Themes', 'mthemes', 'Change how Steam looks. One theme runs at a time.', 'themes'],
    ['Quick CSS', 'mcss', 'Your own tweaks, on top of the theme, in every Steam window as you type', 'quickcss'],
    ['Plugins', 'mplugins', 'Turn plugins on or off; changes apply after you save', 'plugins'],
    ['Updates', 'mupdates', 'Millennium, theme and plugin updates', 'updates'],
    ['Logs', 'mlogs', 'What Millennium and its plugins report', 'logs'],
  ];
  const MILL_BY_NAME = new Map(MILL_PAGES.map((p) => [p[0].toLowerCase(), p]));
  const MILL_BY_KEY = new Map(MILL_PAGES.map((p) => [p[3], p]));
  const MILL_GROUPS = ['Customize', 'Maintain'];
  const GROUPS = ['Account', 'Steam', 'Devices & media'];

  const ROW_ICONS = [
    [/^family view/i, 'security'],
    [/^account name/i, 'account'],
    [/^steam guard$/i, 'check'],
    [/^enable steam cloud/i, 'cloud'],
    [/^screenshot management/i, 'interface'],
    [/^add a new controller/i, 'add'],
    [/^voice input device/i, 'voice'],
    [/^voice output device/i, 'music'],
    [/^enable remote play/i, 'remote'],
    [/^volume$/i, 'music'],
    [/^friend code/i, 'friendsic'],
    [/^email address/i, 'mail'],
    [/^vac status/i, 'check'],
  ];

  const PRE_LABELS = [
    [/^friend code/i, 'Account'],
    [/^append nicknames/i, 'Friends list'],
    [/^family view/i, 'Restrictions'],
    [/^voice transmission type/i, 'Transmission'],
    [/^pause music when starting/i, 'Playback'],
    [/^download high quality audio/i, 'Downloads'],
  ];

  const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const fieldLabel = (n) => text(n.querySelector?.(LABEL));
  const KEY_RE = /^(?:(?:shift|ctrl|control|alt|cmd|win)\s*\+\s*)*(?:f\d{1,2}|tab|space|insert|delete|home|end|page ?(?:up|down)|key ?pad.*|num.*|[a-z0-9]|none|[^\s]+\s*\+\s*[^\s]+)$/i;
  // Steam draws a connected controller's icon inside its name (no CSS-module key in core's map).
  const CONTROLLER_ICON = ':is(.JASigq2q1TdofKTOw7MQt, ._3IdIX2_eZXnDrm2wqIpTSQ, ._28B5PnW21FOp5fzffM9K6) > ._30lE6NZfqKKk3ozfL--IYQ';
  const TILE_SUBS = {
    'add a non-steam game': 'Shortcuts to other programs',
    'activate a product': 'Enter a product code',
    'browse the steam store': 'Find something new',
  };

  // Pre-indexed English option labels for cross-page search before pages have been visited.
  const OPTIONS = {
    'Account': [
      'Friend Code',
      'Email Address',
      'VAC Status',
      'Add Funds',
      'Wallet',
      'Privacy Settings',
      'Account Details',
      'View Profile',
      'Add Friends',
    ],
    'Friends & Chat': [
      "Append nicknames to friends' names",
      'Group friends together by game',
      'Hide offline friends in custom categories',
      'Hide categorized friends in Online/Offline Friends',
      "Ignore 'Away' status when sorting friends",
      'Sign in to friends when Steam starts',
      'Enable Animated Avatars & Animated Avatar Frames',
      'Compact friends list & chat view',
      'Compact favorite friends area',
      'Dock chats to the friends list',
      'Open a new window for new chats (rather than a tab)',
      "Don't embed images and other media in-line",
      'Remember my open chats',
      'Disable spellcheck in chat message entry',
      'Disable animated room effects',
      'Chat Filtering',
      'Chat Font Size',
    ],
    'Family': [
      'Steam Families',
      'Create or Join a Steam Family',
      'Family View',
      'Parental controls',
      'Library sharing',
    ],
    'Security': [
      'Account Name',
      'Change Password',
      "Don't save account credentials on this computer",
      'Steam Guard',
      'Manage Steam Guard',
      'Backup Steam Guard Codes',
      'Deauthorize All Devices',
    ],
    'Notifications': [
      'Show Notification Toasts',
      'Play a sound when a notification toast is displayed',
      'Client Notifications',
      'When I unlock an achievement',
      'When I connect or disconnect a controller',
      "When a controller's battery is low",
      'Friend Notifications',
      'When a friend joins a game',
      'When a friend comes online',
      'When I receive a direct chat message',
      'When I receive a chat room notification',
      'Flash window when I receive a chat message',
      'Store News',
      "There's a major sale",
      'Personal Activity',
      'I receive a friend invitation',
      'A discussion I subscribed to has a reply',
      'I receive a new item in my inventory',
      'I receive a gift',
      'I receive a new trade offer',
      'I receive a reply from Steam Support',
      'I receive a Steam Turn notification',
      'I receive an invite to a Playtest or Limited Launch',
      'Review copy for a Steam Curator group',
      'I receive Steam Community Awards',
      'My annual Steam Replay is now available',
      'Wishlist Activity',
      'An item on my wishlist is on sale',
      'An item on my wishlist has released',
      'A demo for an item on my wishlist has released',
      'Developer / Game News',
      'A publisher or developer I followed has released',
      'A publisher or developer I followed has released a demo',
      'Game-specific event notifications',
      'A season pass I own ships new content',
      'A game I follow has shipped new content from their roadmap',
      'Email Opt-out',
      'Opt out from all email marketing communications',
    ],
    'Interface': [
      'Steam Client Language',
      '24-hour clock',
      'Client Beta Participation',
      'Report a bug',
      'Start Up Location',
      'Scale text and icons to match monitor settings',
      'Run Steam when my computer starts',
      'Start Steam in Big Picture Mode',
      'Ask which account to use each time Steam starts',
      'Notify me about additions or changes to my games',
      'Enable smooth scrolling in web views',
      'Enable GPU accelerated rendering in web views',
      'Enable hardware video decoding',
      'Taskbar Preferences',
    ],
    'Store': [
      'Mature Content',
      'Exclude from My Store',
      'Discovery Queue Content',
      'New On Steam Queue Content',
      'Platform Preference',
      'Steam Deck Feedback',
      'Live Broadcasts',
    ],
    'Library': [
      'Display size for Library user interface elements',
      'Low Bandwidth Mode',
      'Low Performance Mode',
      'Disable Community Content',
      'Show game icons in the left column',
      'Ready to Play should include streamable games',
      'Show Steam Deck compatibility information in library',
      'Add a Non-Steam Game',
      'Activate a Product',
      'Browse the Steam Store',
    ],
    'Downloads': [
      'Download region',
      'Limit download speed',
      'Display download rates in bits per second',
      'Game update timing',
      'Schedule auto-updates',
      'Allow downloads during gameplay',
      'Throttle downloads while streaming',
      'Clear Download Cache',
      'Game File Transfer over Local Network',
      'Allow transfers from this device to',
      'Shader Pre-Caching',
      'Enable Shader Pre-caching',
      'Allow background processing of Vulkan shaders',
    ],
    'Storage': ['Drives', 'Installed games', 'Uninstall', 'Move', 'Add Drive', 'Size on Disk'],
    'Cloud': ['Enable Steam Cloud', 'Screenshot Management'],
    'In Game': [
      'Enable the Steam Overlay while in-game',
      'Show toolbar as list view',
      'Restore my previous browser tabs when starting a game',
      'Use the Big Picture Overlay when using a controller',
      'Scale Steam Overlay text and icons to match monitor settings',
      'Overlay shortcut key(s)',
      'Web browser home page',
      'Delete Web Browser Data',
      'Toolbar Preferences',
      'Overlay Performance Monitor',
      'Show performance monitor',
      'Toggle performance monitor key(s)',
      'Performance detail level',
      'Show FPS Avg/Min Graph',
      'Show CPU Utilization Per-Core Graph',
      'Enable kernel driver based metrics (CPU Temperature)',
      'Text size scaling',
      'Text contrast/saturation',
      'Background opacity',
      'Take a screenshot',
      'When a screenshot is taken, display a notification',
      'When a screenshot is taken, play a sound',
      'Save an external copy of my screenshots',
      'Server browser pings/minute',
      'Steam Networking',
    ],
    'Accessibility': ['UI Scale', 'High Contrast Mode', 'Reduce Motion'],
    'Controller': [
      'Connected Controllers',
      'Add a new controller',
      'Disconnected Controllers',
      'Steam Controller Adapters',
      'Advanced Settings',
    ],
    'Game Recording': [
      'Recording Off',
      'Record in Background',
      'Record Manually',
      'Learn More about Game Recording',
    ],
    'Voice': [
      'Voice Input Device',
      'Start Microphone Test',
      'Voice Output Device',
      'Input volume/gain',
      'Output volume/gain',
      'Voice Transmission Type',
      'Mute toggle hotkey assigned as',
      'Play a short sound on microphone toggle',
      'Voice Transmission Threshold',
      'Advanced Options',
    ],
    'Remote Play': [
      'Enable Remote Play',
      'Computers & Devices',
      'Pair Steam Link',
      'Allow Direct Connection (IP sharing)',
      'Connection PIN',
      'Enable Advanced Host Options',
      'Enable Advanced Client Options',
      'Learn More about Remote Play',
    ],
    'Broadcast': [
      'Broadcast Status',
      'Manage Broadcast',
      'Privacy setting',
      'Video Dimensions',
      'Maximum Bitrate',
      'Optimize encoding for',
      "Show viewers' chat in game",
      'Record video from all applications on this machine',
      'Record audio from all applications on this machine',
      'Record my microphone',
      'Show upload stats',
      'View Broadcast Support Pages',
    ],
    'Music': [
      'Volume',
      'Pause music when starting an application',
      'Pause music when voice chatting',
      'Download high quality audio files',
    ],
  };

  const LEARNED_KEY = 'se-settings-index';
  let learned = {};
  try {
    learned = JSON.parse(localStorage.getItem(LEARNED_KEY) || '{}') || {};
  } catch (_) {
    learned = {};
  }

  let observer;
  let frame = 0;
  let search;
  let results;
  let sizedFor = null;
  let pendingHit = null;
  let hitTries = 0;
  let cursor = 0;

  /*
   * Steam Settings in any language: first by its pages' identifiers when React exposes them,
   * then by the Account page's name (a few languages), then by size (no other paged dialog
   * comes close to its 19 pages). Only asked once Millennium and Properties are ruled out.
   */
  const STEAM_PAGE_ID = /^(?:\/?settings\/)?account$/i;
  const STEAM_ACCOUNT = /^(account|konto|compte|cuenta|conta)$/i;
  const steamLists = new WeakMap();

  function isSteamSettings(list, items) {
    if (steamLists.has(list)) return steamLists.get(list);
    const pages = fromProps(list, 10, (p) => (Array.isArray(p.pages) ? p.pages : undefined));
    const byId = pages?.some((page) =>
      [page?.identifier, page?.route, page?.key, page?.name].some((v) => typeof v === 'string' && STEAM_PAGE_ID.test(v))
    );
    const steam = Boolean(byId) || items.some((i) => STEAM_ACCOUNT.test(pageNameOf(i))) || items.length >= 14;
    if (items.length) steamLists.set(list, steam);
    return steam;
  }

  function sizeWindow(size = SIZE) {
    const win = window.SteamClient?.Window;
    if (!win?.ResizeTo || document.visibilityState !== 'visible') return;
    const s = window.screen;
    const availW = s.availWidth || size.w;
    const availH = s.availHeight || size.h;
    const w = Math.min(size.w, availW - 32);
    const h = Math.min(size.h, availH - 32);
    try {
      win.ResizeTo(w, h, true);
      if (win.MoveTo) {
        const x = (s.availLeft || 0) + Math.round((availW - w) / 2);
        const y = (s.availTop || 0) + Math.round((availH - h) / 2);
        win.MoveTo(x, y, window.devicePixelRatio || true);
      }
    } catch (_) {}
  }

  const norm = (t) => (t || '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

  function pageItems() {
    const list = document.querySelector(LIST);
    return list ? [...list.querySelectorAll(ITEM)] : [];
  }

  function pageNameOf(item) {
    return text(item.querySelector(TEXT) || item);
  }

  function catalogue() {
    const items = pageItems();
    const out = [];
    const seen = new Set();
    items.forEach((item, i) => {
      const name = pageNameOf(item);
      const en = BY_NAME.get(name.toLowerCase())?.[0] || (items.length === PAGES.length ? PAGES[i][0] : null);
      const labels = [...((en && OPTIONS[en]) || []), ...(learned[name] || [])];
      const mine = [];
      for (const label of labels) {
        const n = norm(label);
        if (mine.some((m) => n.startsWith(m) || m.startsWith(n))) continue;
        mine.push(n);
        const key = `${i}|${n}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push([label, i]);
        }
      }
    });
    return out;
  }

  function score(label, q) {
    const l = norm(label);
    const lw = l.split(/[^a-z0-9\u00c0-\uffff]+/).filter(Boolean);
    const words = q.split(' ').filter(Boolean);
    const hit = (w) => lw.some((x) => x.startsWith(w)) || (w.length >= 4 && l.includes(w));
    if (!words.length || !words.every(hit)) return -1;
    if (l.startsWith(q)) return 3;
    if (lw.some((x) => x.startsWith(words[0]))) return 2;
    return 1;
  }

  function renderResults(q) {
    if (!results) return;
    const items = pageItems();
    const hits = q
      ? catalogue()
          .map(([label, i]) => [score(label, q), label, i])
          .filter((h) => h[0] > 0)
          .sort((a, b) => b[0] - a[0] || a[1].length - b[1].length)
          .slice(0, 8)
      : [];

    results.replaceChildren();
    results.hidden = !hits.length;
    if (!hits.length) return;

    cursor = Math.min(cursor, hits.length - 1);
    const head = document.createElement('div');
    head.className = 'se-settings-results-head';
    head.textContent = 'Settings';
    results.append(head);

    hits.forEach(([, label, i], n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'se-settings-result';
      if (n === cursor) b.setAttribute('data-se-cur', '');
      const t = document.createElement('span');
      t.textContent = label;
      const p = document.createElement('span');
      p.className = 'se-settings-result-page';
      p.textContent = items[i] ? pageNameOf(items[i]) : '';
      b.append(t, p);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => open(i, label));
      results.append(b);
    });
  }

  function filter(list, q) {
    const query = norm(q);
    if (list) {
      setAttr(list, 'data-se-filtering', query ? '' : null);
      for (const item of list.querySelectorAll(ITEM)) {
        const t = norm(pageNameOf(item));
        setAttr(item, 'data-se-miss', query && !t.includes(query) ? '' : null);
      }
    }
    renderResults(query);
  }

  function open(index, label) {
    const item = pageItems()[index];
    if (!item) return;
    pendingHit = label ? norm(label) : null;
    hitTries = 0;
    item.click();
    schedule();
  }

  function revealHit(content) {
    if (!pendingHit || !content) return;
    const target = pendingHit;
    const candidates = content.querySelectorAll(
      `${LABEL}, [data-se-sec], [data-se-seglabel], .SettingsDialogSubHeader, .DialogControlsSectionHeader, .${C.Header}, button, .${C.NotificationSectionHeader}, .${C.SettingsDialogBodyText}, .${C.Title}`
    );
    let best = null;
    for (const el of candidates) {
      const t = norm(el.textContent);
      if (!t) continue;
      if (t === target || t.startsWith(target) || (target.length > 6 && t.includes(target))) {
        best = el;
        break;
      }
    }
    if (!best) {
      if (++hitTries > 40) pendingHit = null;
      else setTimeout(schedule, 50);
      return;
    }
    pendingHit = null;
    const row =
      best.closest(
        `${FIELD}, [data-se-c], .${C.RecordingModeOption}, .${C.ActionSection} button, .${C.NotificationSectionHeader}`
      ) || best;

    let sc = row.parentElement;
    while (sc && sc !== document.body) {
      const oy = getComputedStyle(sc).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && sc.scrollHeight > sc.clientHeight + 1) break;
      sc = sc.parentElement;
    }
    if (sc && sc !== document.body) {
      const r = row.getBoundingClientRect();
      const b = sc.getBoundingClientRect();
      sc.scrollTo({
        top: sc.scrollTop + (r.top - b.top) - (b.height - r.height) / 2,
        behavior: 'smooth',
      });
    }
    row.removeAttribute('data-se-hit');
    void row.offsetWidth;
    row.setAttribute('data-se-hit', '');
    setTimeout(() => row.removeAttribute('data-se-hit'), 2400);
  }

  function learn(content, list) {
    const active = list?.querySelector(`${ITEM}.${ACTIVE}`);
    if (!active || !content) return;
    const name = pageNameOf(active);
    const labels = [
      ...new Set(
        [...content.querySelectorAll(`${LABEL}, .SettingsDialogSubHeader, .DialogControlsSectionHeader, .${C.Header}`)]
          .map((el) => text(el))
          .filter((t) => t && t.length <= 120)
      ),
    ];
    if (!labels.length) return;
    const prev = learned[name] || [];
    if (labels.length === prev.length && labels.every((l, i) => l === prev[i])) return;
    learned[name] = labels;
    try {
      localStorage.setItem(LEARNED_KEY, JSON.stringify(learned));
    } catch (_) {}
  }

  function millPageOf(item, items) {
    return (
      MILL_BY_NAME.get(pageNameOf(item).toLowerCase()) ||
      (items.length === MILL_PAGES.length ? MILL_PAGES[items.indexOf(item)] : null) ||
      null
    );
  }

  function sidebar(list, steam, mill) {
    const items = [...list.querySelectorAll(ITEM)];
    if (mill) {
      [...list.querySelectorAll(SEP)]
        .filter((sep) => !sep.classList.contains('se-mill-label'))
        .forEach((sep, i) => setAttr(sep, 'data-se-label', MILL_GROUPS[i] || null));
      items.forEach((item) => setAttr(item, 'data-se-icon', millPageOf(item, items)?.[1] || null));
    }
    if (steam) {
      setAttr(list, 'data-se-label', GROUPS[0]);
      [...list.querySelectorAll(SEP)].forEach((sep, i) => setAttr(sep, 'data-se-label', GROUPS[i + 1] || null));
      const byIndex = items.length === PAGES.length;
      items.forEach((item, i) => {
        const page = BY_NAME.get(pageNameOf(item).toLowerCase()) || (byIndex ? PAGES[i] : null);
        setAttr(item, 'data-se-icon', page ? page[1] : null);
      });
    }

    const title = document.querySelector(TITLE);
    if (title && steam && /^steam settings$/i.test(text(title))) {
      setAttr(title, 'data-se-title', 'Settings');
    }
    if (title && !search) {
      search = document.createElement('label');
      search.className = 'se-settings-search';
      search.innerHTML =
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="se-fill" cx="11" cy="11" r="7"/><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg><input type="text" placeholder="Search settings" aria-label="Search settings" spellcheck="false">';
      const input = search.querySelector('input');
      results = document.createElement('div');
      results.className = 'se-settings-results';
      results.hidden = true;
      input.addEventListener('input', () => {
        cursor = 0;
        filter(document.querySelector(LIST), input.value);
      });
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        const rows = results ? [...results.querySelectorAll('.se-settings-result')] : [];
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          if (!rows.length) return;
          e.preventDefault();
          cursor = (cursor + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length;
          rows.forEach((r, n) => setAttr(r, 'data-se-cur', n === cursor ? '' : null));
          rows[cursor].scrollIntoView({ block: 'nearest' });
        }
        if (e.key === 'Escape') {
          input.value = '';
          cursor = 0;
          filter(document.querySelector(LIST), '');
        }
        if (e.key === 'Enter') {
          if (rows.length) rows[cursor]?.click();
          else document.querySelector(`${LIST} ${ITEM}:not([data-se-miss])`)?.click();
        }
      });
    }
    if (title && search && search.previousElementSibling !== title) title.after(search);
    if (search && results && search.nextElementSibling !== results) search.after(results);
  }

  function adjacent(a, b, allow) {
    const range = document.createRange();
    range.setStartAfter(a);
    range.setEndBefore(b);
    const frag = range.cloneContents();
    if (allow) frag.querySelectorAll(allow).forEach((n) => n.remove());
    if (frag.textContent.trim()) return false;
    return !frag.querySelector('button, input, img, svg, [role], canvas, video');
  }

  function sections(content) {
    for (const el of content.querySelectorAll(SECTION)) {
      if (el.closest(FIELD)) continue;
      setAttr(el, 'data-se-sec', el.hasAttribute('data-se-seglabel') ? null : '');
      const next = el.nextElementSibling;
      if (
        next &&
        next.matches(BODY_TEXT) &&
        !next.nextElementSibling?.matches('.Shared_Radio_Group, :has(> .Shared_Radio_Group), :has(> * > .Shared_Radio_Group)')
      ) {
        setAttr(next, 'data-se-secsub', '');
      }
    }
  }

  function pickers(content) {
    for (const group of content.querySelectorAll('.Shared_Radio_Group')) {
      if (group.closest(FIELD)) continue;
      let host = group;
      while (
        !host.previousElementSibling &&
        host.parentElement &&
        host.parentElement.children.length === 1 &&
        !host.parentElement.matches(CONTENT)
      ) {
        host = host.parentElement;
      }
      const label = host.previousElementSibling;
      if (!label || label.matches(FIELD) || label.querySelector('button, input') || text(label).length > 140) {
        continue;
      }
      setAttr(label, 'data-se-seglabel', '');
      setAttr(label, 'data-se-sec', null);
      setAttr(label, 'data-se-secsub', null);
      setAttr(host, 'data-se-seg', '');
      const w = group.offsetWidth;
      if (w) SE.cssVar(label, '--se-seg-w', `${w}px`);
    }
  }

  function preLabels(content) {
    for (const field of content.querySelectorAll(`${FIELD}.${FIELD_BG}`)) {
      const label = fieldLabel(field);
      const pre = PRE_FOR.get(field) || PRE_LABELS.find(([re]) => re.test(label))?.[1] || null;
      setAttr(field, 'data-se-pre', pre);
      const left = field.querySelector(`:scope > .${C.FieldLeftColumn}`);
      if (left) setAttr(left, 'data-se-pre-text', pre);
    }
  }

  function cards(content) {
    const sel = `${FIELD}.${FIELD_BG}, [data-se-seglabel], ${UPDATE_TIMING}, [data-se-sec]`;
    const nodes = [...content.querySelectorAll(sel)].filter(
      (n) =>
        n.hasAttribute('data-se-sec') ||
        (!n.matches(`${FIELD}:has(${ACCOUNT_HEADER})`) && !n.parentElement.closest(`${FIELD}, ${UPDATE_TIMING}`))
    );
    let prev = null;
    let runNodes = [];

    const flush = () => {
      runNodes.forEach((n, i) => {
        const flags = [];
        if (i === 0) flags.push('f');
        if (i === runNodes.length - 1) flags.push('l');
        if (i === 0 && runNodes.afterSection) flags.push('s');
        setAttr(n, 'data-se-c', flags.join(' ') || 'm');
      });
      runNodes = [];
    };

    for (const n of nodes) {
      if (n.hasAttribute('data-se-sec')) {
        flush();
        prev = n;
        continue;
      }
      const start =
        prev && prev.hasAttribute('data-se-seglabel') && prev.nextElementSibling?.hasAttribute('data-se-seg')
          ? prev.nextElementSibling
          : prev;
      if (prev && !prev.hasAttribute('data-se-sec') && !n.hasAttribute('data-se-pre') && start && adjacent(start, n)) {
        runNodes.push(n);
      } else {
        flush();
        runNodes.push(n);
        runNodes.afterSection = Boolean(
          prev && prev.hasAttribute('data-se-sec') && adjacent(prev, n, `[data-se-secsub], .${C.Toggles}`)
        );
      }
      prev = n;
    }
    flush();

    content.querySelectorAll('[data-se-c]').forEach((n) => {
      if (!nodes.includes(n) || n.hasAttribute('data-se-sec')) {
        n.removeAttribute('data-se-c');
      }
    });
  }

  function rows(content) {
    for (const field of content.querySelectorAll(`${FIELD}[data-se-c]`)) {
      const label = text(field.querySelector(LABEL));
      let icon = ROW_FOR.get(field) || ROW_ICONS.find(([re]) => re.test(label))?.[1] || null;
      if (/^broadcast status/i.test(label)) {
        icon = /not broadcasting/i.test(label) ? 'dot-off' : 'dot-on';
      }
      setAttr(field, 'data-se-row', icon);
      setAttr(field, 'data-se-nickname-preview', /^append nicknames/i.test(label) ? '' : null);
      setAttr(field, 'data-se-name', !label && field.querySelector(`.${C.MicrophoneTest}`) ? 'Microphone test' : null);

      const lab = field.querySelector(LABEL);
      const hasSlider = Boolean(field.querySelector('.SliderControlPanelGroup'));
      if (lab) {
        for (const n of lab.querySelectorAll('*')) {
          setAttr(
            n,
            'data-se-sval',
            hasSlider && !n.childElementCount && /^\s*-?\d+(?:[.,]\d+)?\s*%?\s*$/.test(n.textContent)
              ? ''
              : null
          );
        }
      }

      const first = lab?.firstElementChild;
      const ownIcon =
        first && !first.matches(`.${C.FieldIcon}`) && first.matches('svg, img') && text(lab).length > 0 && !icon
          ? first
          : null;
      setAttr(field, 'data-se-licon', ownIcon ? '' : null);
      lab?.querySelectorAll('[data-se-licon-el]').forEach((n) => {
        if (n !== ownIcon) n.removeAttribute('data-se-licon-el');
      });
      if (ownIcon) setAttr(ownIcon, 'data-se-licon-el', '');

      const addBtn = /^add a new controller/i.test(label) ? field.querySelector('button.DialogButton') : null;
      field.querySelectorAll('button.DialogButton').forEach((b) => {
        setAttr(b, 'data-se-primary', b === addBtn ? '' : null);
      });
      setAttr(field, 'data-se-good', /^vac status/i.test(label) && /no vac ban/i.test(text(field)) ? '' : null);
      for (const b of field.querySelectorAll('button.DialogButton')) {
        setAttr(b, 'data-se-kbd', KEY_RE.test(text(b)) && text(b).length <= 18 ? '' : null);
      }
      setAttr(field, 'data-se-ctl', field.querySelector(CONTROLLER_ICON) ? '' : null);
    }

    [...content.querySelectorAll(`.${C.ActionSection} button.DialogButton`)].forEach((b, i) => {
      setAttr(b, 'data-se-sub', TILE_SUBS[text(b).toLowerCase()] || null);
      setAttr(b, 'data-se-tile', ['add', 'tag', 'storeic'][i] || null);
    });

    const sort = content.querySelector(`.${C.AppHeader} .${C.LibraryImageBackgroundGlow_SortingDropDown}`);
    if (sort) {
      setAttr(sort, 'data-se-sortlabel', /^items/i.test(text(content.querySelector(`.${C.AppHeader}`))) ? 'Sort' : null);
    }

    const selected = content.querySelector(`.${C.AppActionSelected}`);
    if (selected) {
      const m = /^\s*selected\s+(\d+)\s+apps?\s*\(\s*(.+?)\s*\)\s*$/i.exec(selected.textContent || '');
      setAttr(selected, 'data-se-count', m ? `${m[1]} selected` : null);
      setAttr(selected, 'data-se-size', m ? m[2] : null);
    }

    const drive = content.querySelector(`.${C.DriveDropdownControl}`);
    const usage = content.querySelector(`.${C.DriveUsage}`)?.parentElement;
    markOnly(content, 'data-se-drive', usage);
    if (drive && usage && !usage.contains(drive)) {
      const cur = parseFloat(usage.style.getPropertyValue('--se-join')) || 0;
      const gap = usage.getBoundingClientRect().top - drive.getBoundingClientRect().bottom;
      const want = Math.round(cur - gap);
      if (Math.abs(gap) > 0.5 && want <= 0 && want > -80) SE.cssVar(usage, '--se-join', `${want}px`);
    }

    const familyBox = content.querySelector(`.${C.TrySteamFamiliesButtonContainer}`)?.parentElement;
    markOnly(content, 'data-se-family', familyBox);
    const family = familyBox?.firstElementChild;
    if (family && !family.matches(`.${C.TrySteamFamiliesButtonContainer}`)) {
      setAttr(family, 'data-se-head', /steam families/i.test(text(family)) ? 'Steam Families' : null);
    }
  }

  // Marks `el` (if any) and clears the mark from every other element under `root`.
  function markOnly(root, name, el) {
    root.querySelectorAll(`[${name}]`).forEach((n) => n !== el && n.removeAttribute(name));
    if (el) setAttr(el, name, '');
  }

  /*
   * Sideways scrollers and Steam's sticky "Email" header (Notifications) are found from computed
   * styles. Reading them forces layout, so it runs at most every 300 ms, all reads before writes,
   * instead of inside every mutation pass.
   */
  let scanTimer = 0;

  function scheduleScan() {
    if (!scanTimer) scanTimer = setTimeout(layoutScan, 300);
  }

  function layoutScan() {
    scanTimer = 0;
    const content = document.querySelector(CONTENT);
    if (!content) return;
    const scrollers = [];
    for (const el of [content, ...content.querySelectorAll('*')]) {
      if (el.hasAttribute('data-se-noxs') || el.scrollWidth - el.clientWidth < 2) continue;
      const ox = getComputedStyle(el).overflowX;
      if (ox === 'auto' || ox === 'scroll') scrollers.push(el);
    }
    const sticky = [];
    for (const el of content.querySelectorAll('div, span')) {
      if (el.childElementCount || !/^(email|e-mail)$/i.test(text(el))) continue;
      for (let n = el, i = 0; i < 10 && n && n !== content; i++, n = n.parentElement) {
        const { position } = getComputedStyle(n);
        if (position === 'sticky' || position === 'fixed') {
          sticky.push(n);
          break;
        }
      }
    }
    scrollers.forEach((el) => setAttr(el, 'data-se-noxs', ''));
    sticky.forEach((el) => setAttr(el, 'data-se-sticky', ''));
  }

  const PROPS_ROOT = `:is(.${C.AppProperties}, .AppProperties)`;
  const P = {
    buildInfo: `.${C.BuildInfo}`,
    cloudUsage: `.${C.SteamCloudUsage}`,
    diskRow: `.${C.BrowseDiskRow}`,
    diskSize: `.${C.BrowseDiskSize}`,
    topLine: `.${C.SectionTopLine}`,
    betas: `.${C.BetasTable}`,
    inputGrid: `.${C.SteamInputStatusGrid}`,
    dlcGrid: `.${C.DlcGrid}`,
    dlcTop: `.${C.DlcTopRow}`,
    wsTop: `.${C.WorkshopTopRow}`,
    wsScroll: `.${C.WorkshopItemsRowsScrollable}`,
    wsRow: `.${C.WorkshopItemRow}`,
    privDlc: `.${C.PrivacyDLCSection}`,
    artwork: `.${C.AssetWrapper}`,
    noGap: `.${C.NoBottomGap}`,
  };
  const PROPS_BLOCK = `.${C.Field}, .SettingsDialogSubHeader, .SettingsDialogBodyText, [data-se-ptext], .${C.BrowseDiskRow}, .${C.DlcTopRow}, .${C.BuildInfo}, button.DialogButton, .${C.WorkshopTopRow}, .${C.BetasTable}`;
  const PROPS_NAMES = {
    'general': ['pgen', 'general'],
    'updates': ['dl', 'updates'],
    'installed files': ['pfolder', 'files'],
    'local files': ['pfolder', 'files'],
    'game versions & betas': ['pbranch', 'betas'],
    'betas': ['pbranch', 'betas'],
    'controller': ['controller', 'controller'],
    'dlc': ['pdlc', 'dlc'],
    'workshop': ['pworkshop', 'workshop'],
    'game recording': ['rec', 'rec'],
    'privacy': ['security', 'privacy'],
    'customization': ['pcustom', 'custom'],
    'compatibility': ['pcompat', 'compat'],
    'shortcut': ['pgen', 'shortcut'],
    'performance': ['ingame', 'performance'],
    'feedback': ['notify', 'feedback'],
  };

  const PRE_FOR = new WeakMap();
  const ROW_FOR = new WeakMap();
  // Elements this module adds carry this mark, so destroy() finds them without a Set that keeps
  // every replaced node alive.
  const OWN = 'data-se-own';

  const own = (tag, cls) => {
    const el = document.createElement(tag);
    el.className = cls;
    el.setAttribute(OWN, 'settings');
    return el;
  };

  function bytesOf(str) {
    const m = /([\d.,]+)\s*([KMGT]?)i?B/i.exec(str || '');
    if (!m) return NaN;
    return parseFloat(m[1].replace(',', '.')) * 1024 ** ' KMGT'.indexOf((m[2] || ' ').toUpperCase());
  }

  function fmtBytes(n) {
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
  }

  let folders = null;
  let folderAsk = 0;

  function installFolder(i) {
    const store = window.installFolderStore || window.opener?.installFolderStore;
    const f = store?.GetInstallFolder?.(i);
    if (f) return f;
    if (folders) return folders.find((x) => x.nFolderIndex == i);
    if (Date.now() - folderAsk > 5000 && window.SteamClient?.InstallFolder?.GetInstallFolders) {
      folderAsk = Date.now();
      SteamClient.InstallFolder.GetInstallFolders()
        .then((r) => {
          folders = r;
          schedule();
        })
        .catch(() => {});
    }
    return null;
  }

  function copyText(t) {
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(t);
        return;
      }
    } catch (_) {}
    const a = document.createElement('textarea');
    a.value = t;
    document.body.append(a);
    a.select();
    try {
      document.execCommand('copy');
    } catch (_) {}
    a.remove();
  }

  const COPY_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>';

  function propsGeneralPage(content, details) {
    const usage = content.querySelector(P.cloudUsage);
    let box = usage?.parentElement.querySelector(':scope > .se-cloud');
    if (usage) {
      const spans = usage.querySelectorAll(':scope > span');
      const tUsed = text(spans[0] || usage.childNodes[0]);
      const tAvail = text(spans[1] || spans[0]);
      const used = bytesOf(details?.strCloudBytesUsed || tUsed);
      const avail = bytesOf(details?.strCloudBytesAvailable || tAvail);
      if (used >= 0 && avail >= 0 && spans.length >= 2) {
        if (!box) {
          box = own('div', 'se-cloud');
          box.innerHTML = '<div class="se-pbar"></div><div class="se-cloud-text"><span></span><span></span></div>';
        }
        box
          .querySelector('.se-pbar')
          .style.setProperty('--p', `${Math.max(0.5, Math.min(100, (used / Math.max(1, used + avail)) * 100)).toFixed(2)}%`);
        const [a, b] = box.querySelectorAll('.se-cloud-text > span');
        if (a.textContent !== tUsed) a.textContent = tUsed;
        if (b.textContent !== tAvail) b.textContent = tAvail;
        if (box.nextElementSibling !== usage) usage.before(box);
        setAttr(usage, 'data-se-cloud', '');
        const toggle = box.previousElementSibling?.matches(FIELD) ? box.previousElementSibling : null;
        content.querySelectorAll('[data-se-cloudrow]').forEach((f) => {
          if (f !== toggle) f.removeAttribute('data-se-cloudrow');
        });
        if (toggle) {
          setAttr(toggle, 'data-se-cloudrow', '');
          ROW_FOR.set(toggle, 'cloud');
        }
      } else {
        box?.remove();
        usage.removeAttribute('data-se-cloud');
      }
    }
    const launch = content.querySelector('input.DialogTextInputBase, .DialogInput');
    if (launch && /^\s*-|^$/.test(launch.value || '') && launch.closest('.DialogBody')) {
      setAttr(launch, 'data-se-launch', '');
    }
  }

  function propsUpdatesPage(content) {
    const info = content.querySelector(P.buildInfo);
    if (!info) return;
    PRE_FOR.set(info, 'About this build');
    setAttr(info, 'data-se-pre-text', 'About this build');
    [...info.children].forEach((d) => {
      if (d.tagName === 'BR' || d.classList.contains('se-copy')) return;
      const m = /^([^:：]{1,40})[:：]\s*(.+)$/.exec(text(d.childNodes[0]));
      const when = m && /updated/i.test(m[1]) ? /^(.*?\d{4})(?:,?\s+(?:at\s+)?(.+))?$/.exec(m[2]) : null;
      setAttr(d, 'data-se-k', m ? (when ? 'Last updated' : m[1]) : null);
      setAttr(d, 'data-se-v', m ? (when ? when[1] : m[2]) : null);
      setAttr(d, 'data-se-v2', when?.[2] || null);
      let c = d.querySelector(':scope > .se-copy');
      const copyable = m && /^\d+$/.test(m[2]);
      if (copyable && !c) {
        c = own('button', 'se-copy');
        c.type = 'button';
        c.title = 'Copy';
        c.innerHTML = COPY_SVG;
        c.addEventListener('click', (e) => {
          e.stopPropagation();
          copyText(c.parentElement?.getAttribute('data-se-v') || '');
          c.setAttribute('data-done', '');
          setTimeout(() => c.removeAttribute('data-done'), 1200);
        });
        d.append(c);
      } else if (!copyable && c) {
        c.remove();
      }
    });
  }

  function propsFilesPage(content, details) {
    const row = content.querySelector(P.diskRow);
    const size = row?.querySelector(P.diskSize);
    if (size) {
      const m = /^\s*([\d.,]+\s*\S+)\s+(.+?)\s*$/.exec(text(size));
      setAttr(size, 'data-se-big', m ? m[1] : null);
      setAttr(size, 'data-se-rest', m ? m[2] : null);
    }
    const f = details ? installFolder(details.iInstallFolder) : null;
    let disk = row?.querySelector(':scope > .se-disk');
    if (row && f && f.nCapacity > 0) {
      if (!disk) {
        disk = own('div', 'se-disk');
        disk.innerHTML = '<span class="se-disk-text"></span><div class="se-pbar"></div>';
      }
      const t = `${fmtBytes(f.nFreeSpace)} free of ${fmtBytes(f.nCapacity)}`;
      const st = disk.querySelector('.se-disk-text');
      if (st.textContent !== t) st.textContent = t;
      disk.querySelector('.se-pbar').style.setProperty('--p', `${(((f.nCapacity - f.nFreeSpace) / f.nCapacity) * 100).toFixed(1)}%`);
      if (disk.parentElement !== row || disk.nextElementSibling) row.append(disk);
    } else if (disk) {
      disk.remove();
    }

    const group = content.querySelector(P.topLine);
    const rowsHere = group ? [...group.querySelectorAll(FIELD)].filter((x) => !x.parentElement.closest(FIELD)) : [];
    rowsHere.forEach((r, i) => {
      ROW_FOR.set(r, i === rowsHere.length - 1 ? 'pshield' : i === 0 ? 'pbackup' : 'storage');
      if (i === 0) PRE_FOR.set(r, 'Maintenance');
      else PRE_FOR.delete(r);
    });
  }

  function propsWorkshopPage(content) {
    const scroll = content.querySelector(P.wsScroll);
    const emptyNow = scroll && !scroll.querySelector(P.wsRow);
    setAttr(scroll, 'data-se-ws-empty', emptyNow ? '' : null);
    let empty = content.querySelector('.se-ws-empty');
    if (emptyNow) {
      if (!empty) {
        empty = own('div', 'se-ws-empty');
        empty.innerHTML =
          '<div class="se-ws-icon"></div><div class="se-ws-title">No Workshop items yet</div><div class="se-ws-text">Items you subscribe to in the Workshop show up here, in the order the game loads them.</div><button type="button" class="se-ws-btn">Browse the Workshop</button>';
        empty.querySelector('button').addEventListener('click', () => {
          content.querySelector('.DialogBody button.DialogButton, button.DialogButton')?.click();
        });
      }
      if (empty.previousElementSibling !== scroll) scroll.after(empty);
    } else if (empty) {
      empty.remove();
    }
    const visit = content.querySelector('.DialogBody button.DialogButton');
    if (visit) setAttr(visit, 'data-se-paccent', '');
  }

  function propsPage(content, list) {
    const body = content.querySelector('.DialogBody') || content;
    const details =
      fromProps(body, 8, (p) => (p.details && p.details.unAppID ? p.details : undefined)) ||
      fromProps(content, 8, (p) => (p.details && p.details.unAppID ? p.details : undefined));
    const active = list?.querySelector(`${ITEM}.${ACTIVE}`);
    const markers = [
      ['updates', P.buildInfo],
      ['files', P.diskRow],
      ['betas', P.betas],
      ['controller', P.inputGrid],
      ['dlc', P.dlcGrid],
      ['workshop', P.wsTop],
      ['privacy', P.privDlc],
      ['custom', P.artwork],
      ['general', P.cloudUsage],
    ];
    const key =
      markers.find(([, sel]) => content.querySelector(sel))?.[0] ||
      PROPS_NAMES[norm(active ? pageNameOf(active) : '')]?.[1] ||
      null;
    const header = content.querySelector('.DialogHeader');
    let sub = null;
    const fields = [...content.querySelectorAll(`${FIELD}`)].filter((f) => !f.parentElement.closest(FIELD));

    if (key === 'general') propsGeneralPage(content, details);
    if (key === 'updates') propsUpdatesPage(content);
    if (key === 'files') propsFilesPage(content, details);
    if (key === 'betas') {
      const intro = content.querySelector(`${FIELD}${P.noGap}`);
      if (intro) setAttr(intro, 'data-se-ptext', '');
    }
    if (key === 'dlc' && details?.vecDLC) {
      const n = details.vecDLC.length;
      const on = details.vecDLC.filter((d) => d.bEnabled).length;
      sub = `${n} DLC · ${on} installed`;
    }
    if (key === 'custom') sub = 'Artwork for this game in your library';
    if (key === 'workshop') propsWorkshopPage(content);
    if (key === 'rec') {
      const first = fields[0];
      const off = fields.some((f) => f.matches(`.${C.Disabled}`)) || fields.length === 1;
      fields.forEach((f, i) => setAttr(f, 'data-se-notice', i === 0 ? (off ? 'off' : 'on') : null));
      if (first) ROW_FOR.set(first, 'rec');
    }
    if (key === 'privacy') {
      const last = fields[fields.length - 1];
      content.querySelectorAll('[data-se-danger]').forEach((b) => {
        if (!last?.contains(b)) b.removeAttribute('data-se-danger');
      });
      const b = last?.querySelector('button.DialogButton');
      if (b && !last.querySelector('[role="checkbox"]')) setAttr(b, 'data-se-danger', '');
    }
    if (key === 'custom') {
      fields.forEach((f) => setAttr(f, 'data-se-art', f.querySelector(P.artwork) ? '' : null));
    }
    if (header) setAttr(header, 'data-se-sub', sub);

    const isText = (el) =>
      el.tagName === 'DIV' &&
      !el.closest('[data-se-pfirst] > *') &&
      [...el.children].every((c) => /^(SPAN|A|B|I|BR)$/.test(c.tagName) && !c.children.length) &&
      text(el).length > 0;

    const firstBlock = [...body.querySelectorAll(`${PROPS_BLOCK}, div`)].find(
      (el) =>
        el.getClientRects().length &&
        !el.parentElement.closest(PROPS_BLOCK) &&
        (el.matches(PROPS_BLOCK) || isText(el))
    );
    const isSub = (el) => el.matches('.SettingsDialogBodyText, [data-se-ptext]') || (!el.matches(PROPS_BLOCK) && isText(el));
    const subs = [];
    for (let el = firstBlock && isSub(firstBlock) ? firstBlock : null; el && isSub(el); el = el.nextElementSibling) {
      subs.push(el);
    }

    content.querySelectorAll('[data-se-pfirst]').forEach((el) => {
      if (el !== firstBlock) el.removeAttribute('data-se-pfirst');
    });
    content.querySelectorAll('[data-se-psub]').forEach((el) => {
      if (!subs.includes(el)) el.removeAttribute('data-se-psub');
    });
    if (firstBlock) setAttr(firstBlock, 'data-se-pfirst', subs.length ? 'sub' : '');
    subs.forEach((el) => {
      if (!el.hasAttribute('data-se-ptext')) setAttr(el, 'data-se-psub', '');
    });
  }

  let propsCover;
  let propsApp = null;

  function clearPropsCover() {
    if (!propsCover) return;
    const { title, image } = propsCover;
    image.onload = image.onerror = null;
    title.removeAttribute('data-se-cover');
    title.style.removeProperty('--se-props-cover');
    propsCover = null;
  }

  function resetProps() {
    clearPropsCover();
    propsApp = null;
  }

  /*
   * The game a Properties window is for, with the Library store that knows it. Resolving it
   * walks the fiber chain (and, without an id, every app's name), so the answer is kept for the
   * title element; a partial answer is retried every 2 s rather than on every mutation.
   */
  function propsTarget(title, content) {
    const name = text(title);
    const now = performance.now();
    if (propsApp?.title === title && propsApp.name === name && (propsApp.app || now < propsApp.retry)) {
      return propsApp;
    }
    // Properties is portaled into a separate document by the main Steam UI.
    // The React root can still reach the Library store when window.opener is absent.
    const windows = SE.owners();
    let appid;
    let overview;
    for (let fiber = SE.liveFiber(title); fiber; fiber = fiber.return) {
      const p = fiber.memoizedProps;
      if (!appid) appid = Number(p?.appId || p?.details?.unAppID);
      if (!overview && Array.isArray(p?.pages)) {
        overview = p.pages.find((page) => page?.content?.props?.overview?.appid)?.content.props.overview;
      }
      const container = fiber.stateNode?.containerInfo;
      const owner = container?.ownerDocument?.defaultView || container?.defaultView;
      if (owner) windows.add(owner);
    }
    const stores = [...windows].map((owner) => SE.run(() => owner.appStore)).filter(Boolean);
    const pageAppId = content && fromProps(content.querySelector('.DialogBody') || content, 12,
      (p) => p.details?.unAppID || p.overview?.appid);
    appid ||= Number(overview?.appid || pageAppId);
    if (!appid) {
      const matches = new Set(stores.flatMap((store) => SE.run(() =>
        store.allApps.filter((app) => app.display_name === name).map((app) => Number(app.appid))
      ) || []));
      if (matches.size === 1) [appid] = matches;
    }
    const valid = Number.isSafeInteger(appid) && appid > 0;
    const store = valid ? stores.find((candidate) => SE.run(() => candidate.GetAppOverviewByAppID(appid))) || stores[0] : null;
    const app = valid
      ? SE.run(() => store?.GetAppOverviewByAppID(appid)) || (Number(overview?.appid) === appid ? overview : null)
      : null;
    propsApp = { title, name, appid: valid ? appid : 0, store, app, retry: now + 2000 };
    return propsApp;
  }

  function propsSidebar(list, content) {
    list.querySelectorAll(ITEM).forEach((item) =>
      setAttr(item, 'data-se-icon', PROPS_NAMES[norm(pageNameOf(item))]?.[0] || null)
    );
    const title = document.querySelector(TITLE);
    if (!title) return;
    setAttr(title, 'data-se-ptitle', '');

    const { appid, store, app } = propsTarget(title, content);
    if (!appid) {
      clearPropsCover();
      return;
    }
    const urls = SE.coverURLs(app || { appid }, store);
    const filename = app?.library_capsule_filename;
    if (filename) {
      const path = filename.split('/').map(encodeURIComponent).join('/');
      urls.push(`https://shared.steamstatic.com/store_item_assets/steam/apps/${appid}/${path}`);
    }
    const portrait = app && SE.run(() => store?.GetPregeneratedVerticalCapsuleForApp(app));
    if (portrait) urls.push(portrait);
    const sources = [...new Set(urls.map((url) => /^\/(assets|customimages)\//.test(url)
      ? `https://steamloopback.host${url}`
      : url))];
    const key = sources.join('\n');
    if (propsCover?.title === title && propsCover.key === key) return;

    clearPropsCover();
    const image = new Image();
    const cover = { title, image, key };
    propsCover = cover;
    let next = 0;
    const loadNext = () => {
      if (propsCover === cover && next < sources.length) image.src = sources[next++];
    };
    image.onerror = loadNext;
    image.onload = () => {
      if (propsCover !== cover) return;
      title.style.setProperty('--se-props-cover', `url(${JSON.stringify(image.src)})`);
      setAttr(title, 'data-se-cover', '');
    };
    loadNext();
  }

  /*
   * millennium-pages.js decorates Millennium's pages from inside this pass (hooks.before runs
   * ahead of the card steps, hooks.after once they are done), so its marks and ours are written
   * once per pass and never undo each other.
   */
  const millApi = {
    pre: (el, label) => (label ? PRE_FOR.set(el, label) : PRE_FOR.delete(el)),
    bytesOf,
    fmtBytes,
  };

  function millHook(name, content, key) {
    const fn = window.__steamEnhancedMillPages?.hooks?.[name];
    if (typeof fn !== 'function') return null;
    try {
      return fn(content, key, millApi);
    } catch (e) {
      console.warn('[Steam Enhanced] Millennium:', e);
      return null;
    }
  }

  function page(content, list, steam, mill) {
    const header = content.querySelector('.DialogHeader');
    const active = list?.querySelector(`${ITEM}.${ACTIVE}`);
    let sub = null;
    if (steam && header && active && !header.querySelector('button')) {
      sub = BY_NAME.get(pageNameOf(active).toLowerCase())?.[2] || null;
    }
    const millKey = mill && active ? millPageOf(active, [...list.querySelectorAll(ITEM)])?.[3] || null : null;
    if (mill) {
      setAttr(content, 'data-se-mill-page', millKey);
      if (header && !header.querySelector('button')) sub = MILL_BY_KEY.get(millKey)?.[2] || null;
      sub = millHook('before', content, millKey) || sub;
    }
    if (header && !document.documentElement.hasAttribute('data-se-props')) {
      setAttr(header, 'data-se-sub', sub);
    }
    for (const step of [pickers, sections, preLabels, cards, rows]) {
      try {
        step(content);
      } catch (e) {
        console.warn('[Steam Enhanced] settings:', step.name, e);
      }
    }
    if (mill) millHook('after', content, millKey);
    scheduleScan();
  }

  const PROPS_PAGES = ['installed files', 'local files', 'game versions & betas', 'betas', 'dlc', 'workshop', 'customization'];

  function isPropsDialog(items, content) {
    return (
      Boolean(document.querySelector(PROPS_ROOT)) ||
      items.filter((i) => PROPS_PAGES.includes(norm(pageNameOf(i)))).length >= 2 ||
      Boolean(content && fromProps(content.querySelector('.DialogBody') || content, 8, (p) => p.details?.unAppID))
    );
  }

  function update() {
    frame = 0;
    const list = document.querySelector(LIST);
    const root = document.documentElement;
    if (!list) {
      resetProps();
      setAttr(root, 'data-se-mill', null);
      return;
    }
    const items = [...list.querySelectorAll(ITEM)];
    const content = document.querySelector(CONTENT);
    const mill = Boolean(list.closest('.MillenniumSettings'));
    const isProps = !mill && isPropsDialog(items, content);
    const steam = !mill && !isProps && isSteamSettings(list, items);
    setAttr(root, 'data-se-settings', steam ? '' : null);
    setAttr(root, 'data-se-mill', mill ? '' : null);
    setAttr(root, 'data-se-props', isProps ? '' : null);
    observer?.takeRecords();
    sidebar(list, steam, mill);

    if (isProps) {
      propsSidebar(list, content);
    } else {
      resetProps();
    }
    if (content && isProps) {
      try {
        propsPage(content, list);
      } catch (e) {
        console.warn('[Steam Enhanced] properties:', e);
      }
    }
    if (content) page(content, list, steam, mill);
    if (content && steam) {
      try {
        learn(content, list);
        revealHit(content);
      } catch (e) {
        console.warn('[Steam Enhanced] settings search:', e);
      }
    }
    if ((steam || isProps) && sizedFor !== document.visibilityState && document.visibilityState === 'visible') {
      sizedFor = 'visible';
      sizeWindow(steam ? SIZE : PROPS_SIZE);
    }
    observer?.takeRecords();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  let syncRuns = 0;
  let syncReset = 0;

  function onMutate() {
    if (syncRuns >= 4) {
      schedule();
      return;
    }
    syncRuns++;
    if (!syncReset) {
      syncReset = requestAnimationFrame(() => {
        syncRuns = 0;
        syncReset = 0;
      });
    }
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    try {
      update();
    } catch (e) {
      console.warn('[Steam Enhanced] settings:', e);
    }
  }

  function onVisibility() {
    if (document.visibilityState !== 'visible') sizedFor = null;
    else schedule();
  }

  function start() {
    // Sync: the cards and labels must be in place before Steam's re-render paints. The main
    // window's high-traffic chrome (top bar, game list, friends dock) never holds a dialog.
    observer = SE.watch(onMutate, { attributes: ['class'], sync: true, ignore: SE.inSide });
    document.addEventListener('visibilitychange', onVisibility);
    addEventListener('resize', schedule);
    schedule();
  }

  // Everything update() marks lives in the dialog (or on <html>), so destroy() can undo it there
  // without touching other modules' marks of the same name elsewhere.
  const MARKS = [
    'art', 'big', 'c', 'cloud', 'cloudrow', 'count', 'cover', 'ctl', 'cur', 'danger', 'drive', 'family',
    'filtering', 'good', 'head', 'hit', 'icon', 'k', 'kbd', 'label', 'launch', 'licon', 'licon-el', 'mill-page',
    'miss', 'name', 'nickname-preview', 'notice', 'noxs', 'paccent', 'pfirst', 'pre', 'pre-text', 'primary',
    'psub', 'ptext', 'ptitle', 'rest', 'row', 'sec', 'secsub', 'seg', 'seglabel', 'size', 'sortlabel', 'sticky',
    'sub', 'sval', 'tile', 'title', 'v', 'v2', 'ws-empty',
  ].map((m) => `data-se-${m}`);
  const VARS = ['--se-seg-w', '--se-join'];

  function unmarkAll() {
    const sel = MARKS.map((m) => `[${m}]`).join(',');
    for (const root of document.querySelectorAll(`${LIST}, ${CONTENT}, ${TITLE}`)) {
      for (const el of [root, ...root.querySelectorAll(sel)]) {
        for (const m of MARKS) el.removeAttribute(m);
        for (const v of VARS) el.style.removeProperty(v);
      }
    }
    for (const m of ['data-se-settings', 'data-se-mill', 'data-se-props']) document.documentElement.removeAttribute(m);
  }

  window.__steamEnhancedSettings = {
    refresh: schedule,
    destroy() {
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      if (syncReset) cancelAnimationFrame(syncReset);
      clearTimeout(scanTimer);
      search?.remove();
      results?.remove();
      resetProps();
      document.querySelectorAll(`[${OWN}="settings"]`).forEach((el) => el.remove());
      unmarkAll();
      document.removeEventListener('visibilitychange', onVisibility);
      removeEventListener('resize', schedule);
      delete window.__steamEnhancedSettings;
    },
  };

  if (document.body) {
    start();
  } else {
    addEventListener('DOMContentLoaded', start, { once: true });
  }
});
