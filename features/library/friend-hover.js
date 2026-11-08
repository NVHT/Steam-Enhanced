/*
 * Friends playing hover: tag the parts of Steam's popup over a game's friends icon in the
 * library list so features/library/friend-hover.css can draw it in the theme's style.
 *
 * FriendStatusHover / FriendStatusHoverRow live in the game-list CSS module beside
 * FriendIsPlaying, but are not in the class map. The module is found by FriendIsPlaying's
 * hash, then required for its exports (its source is parsed when requiring fails). An export
 * holds the hash and Steam's global name ("_2iiN… FriendStatusHover"); the hash is kept. The
 * result is cached on Steam's webpack require, so every window shares one lookup.
 *
 * Loaded in every window: Steam can draw the popup in a window of its own, where only this
 * file (and core.js) runs.
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  const { C } = SE;
  window.__steamEnhancedFriendHover?.destroy();

  /* Versioned: an older build cached the export with both class names */
  const CACHE_KEY = '__seFriendHoverClasses2';
  const RETRY_MIN_MS = 2000;
  const RETRY_MAX_MS = 60000;
  const GLOBAL = { hover: 'FriendStatusHover', row: 'FriendStatusHoverRow' };
  const TOOLTIP_HOST_SELECTOR = `.${C.ToolTipCustom}, .${C.TextToolTip}`;
  const ATTRS = [
    'data-se-fh',
    'data-se-fh-host',
    'data-se-fh-row',
    'data-se-fh-av',
    'data-se-fh-name',
    'data-se-fh-game',
    'data-se-fh-deco',
  ];

  let classes = null;
  let lastTry = -Infinity;
  let retryMs = RETRY_MIN_MS;

  /* "_2iiN7AYnLFTRFRiuipiYJz FriendStatusHover" → "_2iiN7AYnLFTRFRiuipiYJz" */
  const firstClass = value => (typeof value === 'string' ? value.trim().split(/\s+/)[0] || null : null);

  const readHash = (src, name) =>
    new RegExp(`\\\\?["']?\\b${name}\\\\?["']?\\s*:\\s*\\\\?["']([\\w-]+)`).exec(src)?.[1] || null;

  const lookup = req => {
    if (req[CACHE_KEY]) return req[CACHE_KEY];
    for (const [id, factory] of Object.entries(req.m || {})) {
      let src;
      try {
        src = Function.prototype.toString.call(factory);
      } catch (_) {
        continue;
      }
      if (!src.includes(C.FriendIsPlaying) && !src.includes('FriendStatusHoverRow')) continue;

      let hover = null;
      let row = null;
      try {
        const mod = req(id);
        for (const exp of [mod, mod?.default]) {
          if (typeof exp?.FriendStatusHover === 'string') {
            hover = firstClass(exp.FriendStatusHover);
            row = firstClass(exp.FriendStatusHoverRow);
            break;
          }
        }
      } catch (_) {}
      hover ||= readHash(src, 'FriendStatusHover');
      row ||= readHash(src, 'FriendStatusHoverRow');
      if (hover && row) {
        req[CACHE_KEY] = { hover, row };
        return req[CACHE_KEY];
      }
    }
    return null;
  };

  const resolve = () => {
    if (classes) return classes;
    const now = performance.now();
    if (now - lastTry < retryMs) return null;
    lastTry = now;
    for (const req of SE.requires()) {
      classes = lookup(req);
      if (classes) return classes;
    }
    /* Backs off while the library's module is not loaded */
    retryMs = Math.min(retryMs * 2, RETRY_MAX_MS);
    return null;
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
    !document.querySelector(`.${C.AppIconDownloading_Container}, .${C.FocusNavigationRoot_TitleBarControls}`) &&
    hover.getBoundingClientRect().width >= innerWidth * 0.6;

  const update = () => {
    const hovers = document.body ? [...document.querySelectorAll('[data-se-fh]')] : [];
    /* Steam also gives both elements a global class name, matched as well */
    const cls = resolve();
    const hoverSelector = cls ? `.${cls.hover}, .${GLOBAL.hover}` : `.${GLOBAL.hover}`;
    const rowSelector = cls ? `.${cls.row}, .${GLOBAL.row}` : `.${GLOBAL.row}`;
    for (const hover of document.querySelectorAll(hoverSelector)) {
      if (!hovers.includes(hover)) hovers.push(hover);
      SE.mark(hover, 'data-se-fh');
      SE.mark(hover.closest(TOOLTIP_HOST_SELECTOR) || hover, 'data-se-fh-host');
      for (const row of hover.querySelectorAll(rowSelector)) tagRow(row);
    }
    const solo = hovers.some(hover => hover.isConnected && ownsWindow(hover));
    SE.attr(document.documentElement, 'data-se-fh-window', solo ? '' : null);
  };

  const watcher = SE.watch(update);
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
