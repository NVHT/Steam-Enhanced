/*
 * Friends playing hover: tag the parts of Steam's popup over a game's friends icon in the
 * library list so client/friends/friend-hover.css can draw it in the theme's style.
 *
 * Steam gives the popup and its rows global class names (FriendStatusHover /
 * FriendStatusHoverRow) beside their hashed ones, so those are matched first. The hashed
 * names are a fallback, read once from the game-list CSS module (found by FriendIsPlaying's
 * hash) through SE.findModule and shared across windows on Steam's webpack require.
 *
 * Loaded in every window: Steam can draw the popup in a window of its own, where only this
 * file (and core.js) runs.
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  const { C } = SE;
  window.__steamEnhancedFriendHover?.destroy();

  /* Versioned: an older build cached the export with both class names */
  const CACHE_KEY = '__seFriendHoverClasses2';
  const GLOBAL_HOVER = '.FriendStatusHover';
  const GLOBAL_ROW = '.FriendStatusHoverRow';
  const TOOLTIP_HOST_SELECTOR = `.${C.ToolTipCustom}, .${C.TextToolTip}`;
  const CLIENT_CHROME = `.${C.AppIconDownloading_Container}, .${C.FocusNavigationRoot_TitleBarControls}`;
  const ATTRS = [
    'data-se-fh',
    'data-se-fh-host',
    'data-se-fh-row',
    'data-se-fh-av',
    'data-se-fh-name',
    'data-se-fh-game',
    'data-se-fh-deco',
  ];

  /* "_2iiN7AYnLFTRFRiuipiYJz FriendStatusHover" → "_2iiN7AYnLFTRFRiuipiYJz" */
  const firstClass = value => (typeof value === 'string' ? value.trim().split(/\s+/)[0] || null : null);

  const readHash = (src, name) =>
    new RegExp(`\\\\?["']?\\b${name}\\\\?["']?\\s*:\\s*\\\\?["']([\\w-]+)`).exec(src)?.[1] || null;

  const fromModule = (src, id, req) => {
    if (!src.includes(C.FriendIsPlaying) && !src.includes('FriendStatusHoverRow')) return null;
    let hover = null;
    let row = null;
    try {
      const mod = req(id);
      const exp = [mod, mod?.default].find(e => typeof e?.FriendStatusHover === 'string');
      hover = firstClass(exp?.FriendStatusHover);
      row = firstClass(exp?.FriendStatusHoverRow);
    } catch (_) {}
    hover ||= readHash(src, 'FriendStatusHover');
    row ||= readHash(src, 'FriendStatusHoverRow');
    if (!hover || !row) return null;
    req[CACHE_KEY] = { hover, row };
    return req[CACHE_KEY];
  };

  /* Hashed classes: another window's lookup first, then one cached module scan */
  const hashed = () => {
    for (const req of SE.requires()) if (req[CACHE_KEY]) return req[CACHE_KEY];
    return SE.findModule('friend-hover-classes', fromModule);
  };

  /* Elements that hold their own text, in document order */
  const textHolders = root => {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: node => (node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (el && el !== root && !out.includes(el)) out.push(el);
    }
    return out;
  };

  const tagRow = row => {
    SE.mark(row, 'data-se-fh-row');
    const avatar = row.querySelector('img');
    if (avatar) SE.mark(avatar, 'data-se-fh-av');

    const [name, game] = textHolders(row);
    if (name) SE.mark(name, 'data-se-fh-name');
    if (game) SE.mark(game, 'data-se-fh-game');

    /* Steam's status stripe, avatar frames and other empty leaves */
    for (const el of row.querySelectorAll('*')) {
      if (el === avatar || el.childElementCount || el.closest('svg')) continue;
      if (el.tagName !== 'IMG' && el.textContent.trim()) continue;
      SE.mark(el, 'data-se-fh-deco');
    }
  };

  /* The popup has a window to itself when nothing else of the client is drawn in it */
  const ownsWindow = hover =>
    !document.querySelector(CLIENT_CHROME) && hover.getBoundingClientRect().width >= innerWidth * 0.6;

  const findHovers = () => {
    const found = [...document.querySelectorAll(GLOBAL_HOVER)];
    if (found.length) return { hovers: found, row: GLOBAL_ROW };
    /*
     * Only scan for the hashed names where a popup can be: inside a tooltip, or in a window of
     * its own. Context menus and toasts never pay for the scan.
     */
    if (!document.querySelector(TOOLTIP_HOST_SELECTOR) && document.querySelector(CLIENT_CHROME)) {
      return { hovers: [], row: GLOBAL_ROW };
    }
    const cls = hashed();
    return cls
      ? { hovers: [...document.querySelectorAll(`.${cls.hover}`)], row: `.${cls.row}, ${GLOBAL_ROW}` }
      : { hovers: [], row: GLOBAL_ROW };
  };

  const update = () => {
    if (!document.body) return;
    const { hovers, row } = findHovers();
    for (const hover of hovers) {
      SE.mark(hover, 'data-se-fh');
      SE.mark(hover.closest(TOOLTIP_HOST_SELECTOR) || hover, 'data-se-fh-host');
      for (const el of hover.querySelectorAll(row)) tagRow(el);
    }
    SE.attr(document.documentElement, 'data-se-fh-window', hovers.some(ownsWindow) ? '' : null);
  };

  const watcher = SE.watch(update, { throttle: 100 });
  update();

  window.__steamEnhancedFriendHover = {
    destroy() {
      watcher.disconnect();
      SE.unmark(document.documentElement, 'data-se-fh-window');
      for (const el of document.querySelectorAll(ATTRS.map(name => `[${name}]`).join(','))) {
        for (const name of ATTRS) SE.unmark(el, name);
      }
    },
  };
});
