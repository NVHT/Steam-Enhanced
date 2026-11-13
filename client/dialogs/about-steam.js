/*
 * About Steam, rebuilt as a centred stage: the theme credit, Steam's version as the hero, a live
 * update status pill, Steam's other facts as icon tiles, and a footer with Report an issue,
 * the latest Steam patch notes, Copy all and Steam's own Close.
 *
 * Facts are read from Steam's own dialog, so they stay live and localised. Steam's header and
 * body stay mounted (hidden by about-steam.css) and its footer (Close) is kept and placed in the
 * grid, so React keeps owning its own nodes. Without this script, the utility dialog styles
 * (client/dialogs/utility/) still style the stock dialog.
 *
 * Steam APIs used (SteamTracking, steamui/sp.js), all optional; whatever is missing is hidden or
 * falls back:
 *   window.UpdateStore.m_updater   m_updateState, GetLastCheckTime(), CheckForUpdates()
 *   SteamClient.Updates            CheckForUpdates() (when UpdateStore isn't built yet)
 *   SteamClient.URL                ExecuteSteamURL() for steam:// and steam://openurl/ links
 *   SteamClient.User               StartRestart(false), once an update is ready
 *   MainWindowInstance.Navigator   Settings('Interface') for beta participation; Home({ partnerEvent })
 *                                  shows a news post in the client's own event overlay
 * Patch notes: the newest patch-notes event (type 12) in Steam's own news feed (app 593110), from
 * the store's partner events endpoint, fetched by the main window as news-hub.js does.
 * The patch notes open in a panel inside the dialog: the post's BBCode is turned into DOM nodes
 * here (never HTML), images and video are left out, and links open through Steam.
 * Tooltips are Steam's own React tooltip (core/native-tooltips.js, from this window or the main
 * one), retried until webpack has it; `title` stands in only if it never turns up.
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  window.__steamEnhancedAboutSteam?.destroy();

  const DIALOG = '.DialogContent.FFIKUQ7BGKw6vO1voazlr';
  const HEADER = '._3QhXBKJwISpG-AmpbOQgLQ';
  const BODY = '._32eeZuly3nnz3cMXdSgyj9';
  const LABEL = '._2yhBdvNsgdBGL_UjfmTDGH';
  const BUILT = 'data-se-about';
  const AUTHOR = 'NVHT';
  const COPIED_MS = 1400;
  const RESTART_ARM_MS = 3000;
  const MIN_CHECK_MS = 700; // keep "Checking" on screen long enough to read
  const TIP_RETRY_MS = 250;
  const TIP_RETRIES = 40; // ~10 s for webpack and core/native-tooltips.js to come up
  const TICK_MS = 5000;
  const STORAGE = { checked: 'se-about-last-check' };
  const STEAM_NEWS_APP = 593110;
  const PATCH_NOTES_EVENT = 12;
  const LINKS = {
    steamNews: `https://store.steampowered.com/news/app/${STEAM_NEWS_APP}/`,
    patchNotesFeed: `https://store.steampowered.com/events/ajaxgetpartnereventspageable/?clan_accountid=0&appid=${STEAM_NEWS_APP}&offset=0&count=20&l=english`,
    issues: 'https://github.com/NVHT/Steam-Enhanced/issues',
    checkForUpdates: 'steam://checkforupdates',
  };
  // Steam's updater states (sp.js module 25589). Below AVAILABLE, nothing is pending.
  const UPDATE = { CHECKING: 3, AVAILABLE: 4, APPLYING: 5, READY: 6 };

  /* Duotone icons: `d` paths are the soft fill layer (about-steam.css), the rest is the stroke. */
  const ICONS = {
    calendar:
      '<path class="d" d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3H4z"/><path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 3v4M16 3v4"/>',
    globe:
      '<circle class="d" cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z"/>',
    code: '<rect class="d" x="4" y="4" width="16" height="16" rx="2"/><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
    branch:
      '<path class="d" d="M6 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/><path d="M6 4v10M6 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 10c0 4-6 3-12 6"/>',
    copy: '<rect class="d" x="8" y="8" width="12" height="12" rx="2.5"/><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    notes:
      '<path class="d" d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    flag: '<path class="d" d="M5 4h11l-2 4 2 4H5z"/><path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    refresh: '<circle class="d" cx="12" cy="12" r="8"/><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    external:
      '<rect class="d" x="4" y="6" width="14" height="14" rx="2"/><path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  };

  let themeVersion = '';
  let versionRequest = null;
  const flashes = new Map();
  const views = new Set();

  /* ---------- Steam and storage access ---------- */

  const attempt = (fn, fallback) => {
    try {
      return fn();
    } catch (err) {
      console.warn('[Steam Enhanced] About Steam:', err);
      return fallback;
    }
  };

  /** A bound SteamClient method, or null when this client doesn't have it. */
  const steamFn = (namespace, method) => {
    const api = SE.global('SteamClient')?.[namespace];
    return typeof api?.[method] === 'function' ? api[method].bind(api) : null;
  };

  /** The main window's navigator: Steam's own routes, as its menus use them. */
  const steamNavigator = () => SE.mainWindow?.()?.Navigator ?? null;

  const bringMainToFront = () => attempt(() => SE.mainWindow?.()?.BrowserWindow?.SteamClient?.Window?.BringToFront?.());

  const openSettings = page => {
    const nav = steamNavigator();
    if (typeof nav?.Settings === 'function' && attempt(() => (nav.Settings(page), true), false)) return true;
    return openLink(`steam://open/settings/${page.toLowerCase()}`);
  };

  /** A Steam news post in the client's event overlay, else the client's store view, else a link. */
  const openNewsPost = post => {
    const nav = steamNavigator();
    if (post?.gid && typeof nav?.Home === 'function' &&
        attempt(() => (nav.Home({ partnerEvent: { appid: STEAM_NEWS_APP, gid: post.gid } }), true), false)) {
      bringMainToFront();
      return true;
    }
    if (typeof nav?.SteamWeb === 'function' && attempt(() => (nav.SteamWeb(post?.url ?? LINKS.steamNews), true), false)) {
      bringMainToFront();
      return true;
    }
    return openLink(post?.url ?? LINKS.steamNews);
  };

  const openLink = url => {
    const execute = steamFn('URL', 'ExecuteSteamURL');
    if (execute) return attempt(() => (execute(url.startsWith('steam://') ? url : `steam://openurl/${url}`), true), false);
    if (url.startsWith('steam://')) return false;
    window.open(url, '_blank', 'noopener');
    return true;
  };

  const store = {
    get: key => attempt(() => localStorage.getItem(key), null),
    set: (key, value) => attempt(() => localStorage.setItem(key, value)),
  };

  /** Steam's updater store, built by the main window the first time anything asks for updates. */
  const updater = () => SE.global('UpdateStore', s => !!s?.m_updater)?.m_updater ?? null;

  const readUpdateState = () => {
    const u = updater();
    const state = u?.m_updateState;
    if (!state) return null;
    const results = state.update_check_results || [];
    return {
      state: Number(state.state) || 0,
      available: results.some(result => result.available),
      checkedAt: attempt(() => u.GetLastCheckTime(), null), // unix seconds
    };
  };

  const checkForUpdates = async () => {
    const u = updater();
    if (typeof u?.CheckForUpdates === 'function') return u.CheckForUpdates();
    const direct = steamFn('Updates', 'CheckForUpdates');
    if (direct) return direct();
    return openLink(LINKS.checkForUpdates);
  };

  /* The main window's fetch carries the store session, as client/home/news-hub.js relies on. */
  const storeFetch = () => {
    for (const win of SE.owners?.() ?? [window]) {
      try {
        if (win.SteamUIStore && typeof win.fetch === 'function') return win.fetch.bind(win);
      } catch (_) {}
    }
    return window.fetch.bind(window);
  };

  /** The newest stable patch notes in Steam's news ({ gid, url, title, time, body }), or null. */
  let patchNotes = null;
  const latestPatchNotes = () =>
    (patchNotes ||= (async () => {
      try {
        const response = await storeFetch()(LINKS.patchNotesFeed, { credentials: 'include', signal: AbortSignal.timeout(8000) });
        const data = await response.json();
        const latest = (data?.events || [])
          .filter(event => Number(event.event_type) === PATCH_NOTES_EVENT && event.gid && !/\bbeta\b/i.test(event.event_name || ''))
          .sort((a, b) => Number(b.rtime32_start_time) - Number(a.rtime32_start_time))[0];
        if (latest) {
          return {
            gid: String(latest.gid),
            url: `${LINKS.steamNews}view/${latest.gid}`,
            title: String(latest.event_name || '').trim() || 'Steam Client Update',
            time: Number(latest.rtime32_start_time) * 1000 || null,
            body: typeof latest.announcement_body?.body === 'string' ? latest.announcement_body.body : '',
          };
        }
      } catch (err) {
        console.warn('[Steam Enhanced] About Steam: patch notes lookup failed', err);
      }
      patchNotes = null; // try again next time
      return null;
    })());

  /*
   * Steam's announcement BBCode as DOM nodes. Tags map to elements; unknown tags are dropped
   * with their text kept; media tags are dropped with their contents. Unclosed tags close at the
   * end, stray closing tags are ignored, and [*] closes the previous list item.
   */
  const BB_TAGS = {
    h1: 'h3', h2: 'h4', h3: 'h5', b: 'strong', i: 'em', u: 'u', strike: 's', p: 'p',
    list: 'ul', olist: 'ol', '*': 'li', url: 'a', code: 'code', quote: 'blockquote', spoiler: 'span',
  };
  const BB_VOID = new Set(['hr', 'br']);
  const BB_MEDIA = new Set(['img', 'video', 'previewyoutube', 'youtube', 'dynamiclink']);
  const BB_BLOCK = new Set(['h1', 'h2', 'h3', 'p', 'list', 'olist', '*', 'quote', 'hr', 'table', 'tr', ...BB_MEDIA]);

  /* [url=x], [url="x"] and [url href="x"] all name the link */
  const bbHref = arg => {
    const raw = (arg || '').trim();
    const quoted = raw.match(/(?:^|\s)href\s*=\s*"([^"]*)"/i)?.[1] ?? raw.replace(/^=?\s*["']?|["']$/g, '');
    return /^https?:\/\//i.test(quoted) ? quoted : '';
  };

  const renderBBCode = (source, onLink) => {
    const root = document.createDocumentFragment();
    const stack = [{ tag: null, node: root }];
    let skip = 0; // depth inside media tags
    const top = () => stack[stack.length - 1];
    const inList = () => /^(?:ul|ol)$/i.test(top().node.tagName || '');
    const text = chunk => {
      if (skip || !chunk || (inList() && !chunk.trim())) return;
      chunk.split('\n').forEach((line, i) => {
        if (i && !inList()) top().node.append(document.createElement('br'));
        if (line) top().node.append(line);
      });
    };
    const close = tag => {
      const index = stack.map(entry => entry.tag).lastIndexOf(tag);
      if (index > 0) stack.length = index;
    };
    const re = /\[(\/?)([a-z0-9*]+)((?:=|\s)[^\]]*)?\]/gi;
    const tokens = [...source.matchAll(re)];
    let last = 0;
    let prevBlock = true;
    tokens.forEach(match => {
      const [, closing, rawTag, arg] = match;
      const tag = rawTag.toLowerCase();
      const block = BB_BLOCK.has(tag);
      // Line breaks that only separate block tags are layout in the source, not content
      let chunk = source.slice(last, match.index);
      if (prevBlock) chunk = chunk.replace(/^[ \t]*\r?\n/, '');
      if (block) chunk = chunk.replace(/\r?\n[ \t]*$/, '');
      text(chunk.replace(/\r/g, ''));
      last = match.index + match[0].length;
      prevBlock = block;

      if (BB_MEDIA.has(tag)) {
        skip = closing ? Math.max(0, skip - 1) : skip + 1;
        return;
      }
      if (skip) return;
      if (BB_VOID.has(tag)) {
        if (!closing) top().node.append(document.createElement(tag));
        return;
      }
      const element = BB_TAGS[tag];
      if (!element) return;
      if (closing) {
        close(tag);
        return;
      }
      if (tag === '*' && top().tag === '*') stack.pop();
      // [*][p]…[/p]: a paragraph inside a list item would push the text below its bullet
      if (tag === 'p' && top().tag === '*') {
        stack.push({ tag, node: top().node });
        return;
      }
      const node = document.createElement(element);
      if (tag === 'url') {
        const href = bbHref(arg);
        if (href) {
          node.href = href;
          node.addEventListener('click', event => {
            event.preventDefault();
            onLink(href);
          });
        }
      }
      top().node.append(node);
      stack.push({ tag, node });
    });
    let tail = source.slice(last);
    if (prevBlock) tail = tail.replace(/^[ \t]*\r?\n/, '');
    text(tail.replace(/\r/g, ''));
    return root;
  };

  const formatDay = time =>
    time ? new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';

  /* ---------- Facts ---------- */

  /* Each fact is a label span followed by loose text up to the next <br>. */
  const readFacts = body => {
    const facts = [];
    let current = null;
    for (const node of body.childNodes) {
      if (node.nodeType === 1 && node.matches(LABEL)) {
        current = { label: node.textContent.replace(/[:：]\s*$/, '').trim(), value: '' };
        facts.push(current);
      } else if (current && node.nodeType === 1 && node.tagName === 'BR') {
        current = null;
      } else if (current) {
        current.value = `${current.value} ${node.textContent}`.trim();
      }
    }
    return facts.filter(fact => fact.label);
  };

  /*
   * Steam lists: beta branch (only on some builds), client version, client build date, web build
   * date, API version. Labels are localised, so English labels are tried first and the list's
   * order is the fallback.
   */
  const FACT_LABELS = {
    branch: /beta|branch/i,
    api: /\bapi\b/i,
    web: /\bweb\b/i,
    client: /build|date/i,
    version: /version/i,
  };

  const classifyFacts = facts => {
    const byKey = {};
    const rest = [];
    for (const fact of facts) {
      const key = Object.keys(FACT_LABELS).find(k => !byKey[k] && FACT_LABELS[k].test(fact.label));
      if (key) byKey[key] = fact;
      else rest.push(fact);
    }
    if (!rest.length) return byKey;
    const order = facts.length >= 5 ? ['branch', 'version', 'client', 'web', 'api'] : ['version', 'client', 'web', 'api'];
    return Object.fromEntries(order.map((key, i) => [key, facts[i]]));
  };

  /* "Wed, Oct 21, 2026 4:11 PM UTC -07:00" -> { main: "Oct 21, 2026", sub: "4:11 PM", time: ms } */
  const splitDate = value => {
    const match = value.match(/^(?:[^\d,]+,\s*)?(.*?\d{4})\s+(.+?)(?:\s+UTC.*)?$/);
    const iso = value
      .replace(/^[^\d,]+,\s*/, '')
      .replace(/\s*UTC\s*([+-])(\d{1,2}):?(\d{2})\s*$/, (_, sign, h, m) => ` GMT${sign}${h.padStart(2, '0')}${m}`);
    const time = Date.parse(iso);
    return { main: match ? match[1] : value, sub: match ? match[2] : '', time: Number.isNaN(time) ? null : time };
  };

  /* English labels get the short form the layout was drawn for; other languages keep Steam's. */
  const heroLabel = label => (/^steam client version$/i.test(label) ? 'Steam version' : label);
  const TILE_LABELS = { 'client build date': 'Client build', 'web build date': 'Web build', 'beta branch': 'Branch' };
  const tileLabel = label => {
    const short = label.replace(/^Steam\s+/i, '');
    return TILE_LABELS[short.toLowerCase()] ?? short;
  };

  const ago = seconds => {
    if (seconds < 45) return 'just now';
    const min = Math.round(seconds / 60);
    if (min < 60) return `${min} min ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr} hr ago`;
    const day = Math.round(hr / 24);
    if (day < 2) return 'Yesterday';
    if (day < 14) return `${day} days ago`;
    if (day < 60) return `${Math.round(day / 7)} wk ago`;
    if (day < 365) return `${Math.round(day / 30)} mo ago`;
    return `${Math.round(day / 365)} yr ago`;
  };

  const buildAge = time => {
    if (time == null) return '';
    const seconds = Math.max(0, (Date.now() - time) / 1000);
    return seconds < 86400 ? 'Today' : ago(seconds);
  };

  /* ---------- Theme version ---------- */

  const versionText = () => (themeVersion ? `v${themeVersion}` : '');

  /* The skin's own manifest is the source of the version: read once, when the dialog first opens. */
  const loadThemeVersion = () =>
    (versionRequest ||= (async () => {
      const asset = [...document.querySelectorAll('link[href], script[src]')]
        .map(node => node.href || node.src)
        .find(url => /\/core\/(?:tokens\.css|core\.js)(?:[?#]|$)/.test(url));
      if (!asset) return;
      try {
        const response = await fetch(new URL('../skin.json', asset), { cache: 'no-store' });
        const version = (await response.json())?.version;
        if (typeof version === 'string' && version) themeVersion = version;
      } catch (_) {}
      for (const node of document.querySelectorAll('.se-about-theme-version')) node.textContent = versionText();
    })());

  /* ---------- DOM helpers ---------- */

  const copyText = async text => {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (_) {}
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  };

  // button -> { timer, hint, text }: each keeps its own original text, so quick clicks never stick.
  const restoreFlash = button => {
    const flash = flashes.get(button);
    if (!flash) return;
    clearTimeout(flash.timer);
    flashes.delete(button);
    button.removeAttribute('data-copied');
    flash.hint.textContent = flash.text;
  };

  const flash = (button, hint, message = 'Copied') => {
    for (const other of [...flashes.keys()]) if (other !== button) restoreFlash(other);
    const text = flashes.get(button)?.text ?? hint.textContent;
    clearTimeout(flashes.get(button)?.timer);
    button.setAttribute('data-copied', '');
    hint.textContent = message;
    flashes.set(button, { hint, text, timer: setTimeout(() => restoreFlash(button), COPIED_MS) });
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const icon = name => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name];
    return svg;
  };

  const button = (className, children, onClick, { label } = {}) => {
    const node = el('button', className);
    node.type = 'button';
    node.append(...children);
    if (label) node.setAttribute('aria-label', label);
    node.addEventListener('click', onClick);
    return node;
  };

  /** Steam's React, ReactDOM and tooltip component, from this window or the main one. */
  const nativeTooltips = () =>
    attempt(() => SE.global('__steamEnhancedNativeTooltips', api => typeof api?.resolve === 'function')?.resolve() ?? null, null);

  /*
   * Steam's own tooltip on `node`, mounted into a hit box that covers it (as
   * client/header/header-tooltips.js does). Returns the unmount.
   */
  const mountTip = ({ React, DOM, Tooltip }, node, label, direction) => {
    const host = el('span', 'se-about-tip');
    node.setAttribute('data-se-about-tip', '');
    node.append(host);
    const root = DOM.createRoot(host);
    root.render(
      React.createElement(Tooltip, {
        toolTipContent: label,
        bTopmost: true,
        nDelayShowMS: 200,
        direction,
        nBodyAlignment: 0.5,
        nBodyDistance: 6,
        bPortalToBody: true,
        children: React.createElement('span', { className: 'se-about-tip-hitbox' }),
      }),
    );
    return () => {
      attempt(() => root.unmount());
      host.remove();
      node.removeAttribute('data-se-about-tip');
    };
  };

  /* ---------- View ---------- */

  const createView = (dialog, inner, facts) => {
    const doc = dialog.ownerDocument;
    const win = doc.defaultView;
    const { branch, version, client, web, api } = classifyFacts(facts);
    const cleanups = [];
    const later = (fn, ms) => {
      const id = setTimeout(fn, ms);
      cleanups.push(() => clearTimeout(id));
      return id;
    };
    const listen = (target, type, fn, options) => {
      target.addEventListener(type, fn, options);
      cleanups.push(() => target.removeEventListener(type, fn, options));
    };

    let checking = false;
    latestPatchNotes(); // warm, so the button opens the post at once
    const tips = [];
    const tip = (node, label, direction = 'bottom') => tips.push([node, label, direction]);

    /* Credit */
    const credit = el('div', 'se-about-credit');
    const name = el('span', 'se-about-credit-name');
    name.append(el('span', 'se-about-credit-steam', 'Steam'), ' Enhanced ');
    credit.append(
      el('span', 'se-about-logo'),
      name,
      el('span', 'se-about-theme-version', versionText()),
      el('span', 'se-about-credit-by', `· by ${AUTHOR}`),
    );

    /* Hero: Steam's version, click to copy */
    const heroHint = el('span', 'se-about-hero-label', version ? heroLabel(version.label) : 'Steam version');
    const hero = button('se-about-hero', [heroHint, el('span', 'se-about-hero-value', version?.value ?? '')], () => {
      copyText(version?.value ?? '');
      flash(hero, heroHint);
    });
    tip(hero, 'Click to copy');

    /* Update status pill */
    const status = el('div', 'se-about-status');
    const dot = el('span', 'se-about-status-dot');
    const statusText = el('span', 'se-about-status-text');
    const statusWhen = el('span', 'se-about-status-when');
    const statusLabel = el('span', 'se-about-status-label');
    statusLabel.append(statusText, ' ', statusWhen);
    const refresh = button('se-about-refresh', [icon('refresh')], () => runCheck(), { label: 'Check for updates' });
    tip(refresh, 'Check for updates');

    /* Once an update is ready, the pill offers Restart; the first click arms it for a few seconds. */
    const restartLabel = el('span', null, 'Restart');
    const restart = button('se-about-restart-chip', [restartLabel], () => {
      if (restart.hasAttribute('data-armed')) {
        disarm();
        restartLabel.textContent = 'Restarting…';
        steamFn('User', 'StartRestart')?.(false);
        return;
      }
      restart.setAttribute('data-armed', '');
      restartLabel.textContent = 'Click again';
      armTimer = setTimeout(disarm, RESTART_ARM_MS);
    });
    let armTimer = null;
    const disarm = () => {
      clearTimeout(armTimer);
      restart.removeAttribute('data-armed');
      restartLabel.textContent = 'Restart';
    };
    cleanups.push(disarm);
    tip(restart, 'Restart Steam to install the update');
    status.append(dot, statusLabel, refresh, restart);

    const renderStatus = () => {
      const update = readUpdateState();
      const localCheck = Number(store.get(STORAGE.checked)) || null;
      let kind;
      let text;
      let when = '';
      if (checking || update?.state === UPDATE.CHECKING) {
        kind = 'checking';
        text = 'Checking for updates';
      } else if (update?.state === UPDATE.READY) {
        kind = 'ready';
        text = 'Update ready';
      } else if (update?.state === UPDATE.APPLYING) {
        kind = 'pending';
        text = 'Downloading update';
      } else if (update && (update.available || update.state === UPDATE.AVAILABLE)) {
        kind = 'pending';
        text = 'Update available';
      } else if (update?.checkedAt) {
        kind = 'current';
        text = 'Up to date';
        when = ago(Math.max(0, Date.now() / 1000 - update.checkedAt));
      } else {
        kind = 'unknown';
        text = 'Steam updates';
        when = localCheck ? `checked ${ago(Math.max(0, (Date.now() - localCheck) / 1000))}` : 'not checked yet';
      }
      SE.mark(status, 'data-state', kind);
      statusText.textContent = text;
      statusWhen.textContent = when;
      refresh.disabled = kind === 'checking';
      refresh.hidden = kind === 'ready';
      restart.hidden = kind !== 'ready' || !steamFn('User', 'StartRestart');
    };

    const runCheck = async () => {
      if (checking) return;
      checking = true;
      renderStatus();
      const started = Date.now();
      try {
        await checkForUpdates();
      } catch (err) {
        console.warn('[Steam Enhanced] About Steam: update check failed', err);
      }
      store.set(STORAGE.checked, String(Date.now()));
      later(() => {
        checking = false;
        renderStatus();
      }, Math.max(0, MIN_CHECK_MS - (Date.now() - started)));
    };

    const ticker = setInterval(renderStatus, TICK_MS);
    cleanups.push(() => clearInterval(ticker));

    /* Facts as icon tiles */
    const tiles = el('div', 'se-about-tiles');
    const tile = (fact, iconName, { date = false, action = null } = {}) => {
      const parts = fact && date ? splitDate(fact.value) : { main: fact?.value ?? 'None', sub: '', time: null };
      const sub = el('span', 'se-about-tile-sub', action ? action.label : date ? buildAge(parts.time) : '');
      const text = el('span', 'se-about-tile-text');
      text.append(el('span', 'se-about-tile-label', fact ? tileLabel(fact.label) : 'Branch'), el('span', 'se-about-tile-value', parts.main));
      const chip = el('span', 'se-about-tile-icon');
      chip.append(icon(iconName));
      const node = button('se-about-tile', [chip, text, sub], () => {
        if (action) {
          if (action.run()) flash(node, sub, 'Opening…');
          return;
        }
        copyText(fact?.value ?? '');
        flash(node, sub);
      });
      tip(node, action ? action.title : date && parts.sub ? `${parts.main} at ${parts.sub}` : 'Click to copy', 'top');
      tiles.append(node);
    };
    tile(client, 'calendar', { date: true });
    tile(web, 'globe', { date: true });
    tile(api, 'code');
    tile(branch, 'branch', {
      action: { label: 'Change ›', title: 'Change in Settings › Interface', run: () => openSettings('Interface') },
    });

    /* Footer: Report an issue and the latest patch notes on the left */
    const tools = el('div', 'se-about-tools');
    const issue = button('se-about-tool', [icon('flag')], () => openLink(LINKS.issues), { label: 'Report an issue' });
    const notes = button('se-about-tool', [icon('notes')], () => openNotes(), { label: 'Patch notes' });
    tip(issue, 'Report an issue on GitHub', 'top');
    tip(notes, 'Latest Steam patch notes', 'top');
    tools.append(issue, notes);

    /* Patch notes panel: covers the dialog, Back returns to the facts */
    const panel = el('section', 'se-about-notes');
    panel.hidden = true;
    panel.setAttribute('aria-label', 'Patch notes');
    const back = button('se-about-notes-back', [icon('back')], () => closeNotes(), { label: 'Back' });
    const notesTitle = el('span', 'se-about-notes-title', 'Patch notes');
    const notesDate = el('span', 'se-about-notes-date');
    const heading = el('div', 'se-about-notes-heading');
    heading.append(notesTitle, notesDate);
    let shownPost = null;
    const openInSteam = button('se-about-tool', [icon('external')], () => openNewsPost(shownPost), {
      label: 'Open in Steam',
    });
    tip(back, 'Back', 'bottom');
    tip(openInSteam, 'Open in Steam', 'bottom');
    const bar = el('div', 'se-about-notes-bar');
    bar.append(back, heading, openInSteam);
    const notesBody = el('div', 'se-about-notes-body');
    panel.append(bar, notesBody);

    const showMessage = message => notesBody.replaceChildren(el('p', 'se-about-notes-message', message));

    /* Steam's title strip sits over the panel's bar and takes its clicks: hand them through while open */
    const setNotesOpen = open => {
      panel.hidden = !open;
      SE.attr(doc.documentElement, 'data-se-about-notes', open || null);
    };
    cleanups.push(() => setNotesOpen(false));

    const openNotes = async () => {
      setNotesOpen(true);
      back.focus();
      if (shownPost) return;
      notesTitle.textContent = 'Patch notes';
      notesDate.textContent = '';
      showMessage('Loading the latest patch notes…');
      const post = await latestPatchNotes();
      if (!post) {
        showMessage("Couldn't load the patch notes. Open in Steam to read them there.");
        return;
      }
      shownPost = post;
      notesTitle.textContent = post.title;
      notesDate.textContent = formatDay(post.time);
      if (post.body.trim()) {
        notesBody.replaceChildren(renderBBCode(post.body, openLink));
        notesBody.scrollTop = 0;
      } else {
        showMessage('This post has no text here. Open in Steam to read it.');
      }
    };

    const closeNotes = () => {
      if (panel.hidden) return;
      setNotesOpen(false);
      notes.focus();
    };

    /* Copy all */
    const copyAllLabel = el('span', null, 'Copy all');
    const copyAll = button('se-about-copyall', [icon('copy'), copyAllLabel], () => {
      copyText([`Steam Enhanced ${versionText()}`.trim(), ...facts.map(fact => `${fact.label}: ${fact.value}`)].join('\n'));
      flash(copyAll, copyAllLabel);
    });
    tip(copyAll, 'Copy all (Ctrl+C)', 'top');

    /* Keys: Esc closes the notes, then the dialog; Ctrl+C with nothing selected copies all. */
    listen(doc, 'keydown', event => {
      if (event.defaultPrevented) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!panel.hidden) closeNotes();
        else dialog.querySelector('.DialogFooter button')?.click();
      } else if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'c') {
        if (!panel.hidden || win.getSelection()?.toString() || event.target?.closest?.('input, textarea, [contenteditable]')) return;
        event.preventDefault();
        copyAll.click();
      }
    });

    renderStatus();

    /* Steam's tooltips, once webpack and core/native-tooltips.js are up; `title` if they never are */
    let tipTries = 0;
    const mountTips = () => {
      const native = nativeTooltips();
      if (native) {
        for (const [node, label, direction] of tips) cleanups.push(mountTip(native, node, label, direction));
        return;
      }
      if (++tipTries < TIP_RETRIES) {
        later(mountTips, TIP_RETRY_MS);
        return;
      }
      for (const [node, label] of tips) node.title = label;
    };
    mountTips();

    const nodes = [credit, hero, status, tiles, tools, copyAll, panel];
    for (const node of nodes) node.classList.add('se-about');

    return {
      nodes,
      destroy() {
        for (const fn of cleanups.splice(0)) attempt(fn);
        for (const node of nodes) {
          for (const target of [node, ...node.querySelectorAll('[data-copied]')]) restoreFlash(target);
          node.remove();
        }
        views.delete(this);
      },
    };
  };

  const viewOf = new WeakMap();

  const build = dialog => {
    const inner = dialog.querySelector(':scope > .DialogContent_InnerWidth');
    const header = inner?.querySelector(HEADER);
    const body = inner?.querySelector(BODY);
    if (!inner || !header || !body) return;
    const facts = readFacts(body);
    if (!facts.length) return;

    viewOf.get(dialog)?.destroy();
    inner.querySelectorAll(':scope > .se-about').forEach(node => node.remove());
    const view = createView(dialog, inner, facts);
    viewOf.set(dialog, view);
    views.add(view);
    const footer = inner.querySelector(':scope > .DialogFooter');
    for (const node of view.nodes) footer ? footer.before(node) : inner.append(node);
    SE.mark(dialog, BUILT);
    loadThemeVersion();
  };

  const scan = () => {
    for (const dialog of document.querySelectorAll(DIALOG)) {
      const inner = dialog.querySelector(':scope > .DialogContent_InnerWidth');
      if (dialog.hasAttribute(BUILT) && inner?.querySelector(':scope > .se-about-hero')) continue;
      build(dialog);
    }
  };

  const watcher = SE.watch(scan, { throttle: 100 });
  scan();

  window.__steamEnhancedAboutSteam = {
    destroy() {
      watcher.disconnect();
      for (const view of [...views]) view.destroy();
      for (const button of [...flashes.keys()]) restoreFlash(button);
      document.querySelectorAll('.se-about').forEach(node => node.remove());
      document.querySelectorAll(`[${BUILT}]`).forEach(node => SE.unmark(node, BUILT));
      delete window.__steamEnhancedAboutSteam;
    },
  };
});
