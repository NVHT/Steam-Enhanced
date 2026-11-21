/*
 * The Home stage's own settings: what it features, which details it shows and how it moves
 * between games, and the menu that edits them (the sliders button in the stage's corner,
 * a settings menu, client/shared/menu.js).
 * Kept in localStorage (se-home-stage-settings); a change applies at once, no reload.
 *   source      recent | favorites (A–Z) | collection (+ collection id) | added (newest first)
 *   count       games featured: 4, 6, 8 or 10
 *   details     logo, by, reviews, live, desc, hours, ach, last: shown or not
 *   nav         thumbs | dots | none          cycle   off | slow | normal | fast
 *   motion      zoom | parallax | shots | trailer | still (the background art: stage-art.js)
 * The stage reads them through stageSettings(), stageApps(), cycleSeconds() and
 * applyStageLook(); stage-settings.css holds the button and the menu's Home rows.
 */
((SE) => {
  const ns = window.__seHomeStageParts;
  if (!ns) return;
  const { collectionApps, collectionStore, libraryGames, schedule, sorted, userCollections } = ns;
  const { live } = ns;

  const { run } = SE;

  const KEY = 'se-home-stage-settings';
  const DETAILS = [
    ['logo', 'Logo'],
    ['by', 'Developer · year'],
    ['reviews', 'Reviews'],
    ['live', 'Playing now'],
    ['desc', 'Description'],
    ['hours', 'Hours played'],
    ['ach', 'Achievements'],
    ['last', 'Last played'],
  ];
  const DEFAULTS = {
    source: 'recent',
    collection: '',
    count: 6,
    nav: 'thumbs',
    cycle: 'normal',
    motion: 'zoom',
    details: { logo: true, by: true, reviews: true, live: true, desc: true, hours: true, ach: true, last: true },
  };
  const OPTIONS = {
    source: [['recent', 'Recently played'], ['favorites', 'Favorites'], ['collection', 'A collection'], ['added', 'Recently added']],
    count: [[4, '4'], [6, '6'], [8, '8'], [10, '10']],
    nav: [['thumbs', 'Thumbnails'], ['dots', 'Dots'], ['none', 'Hidden']],
    // The words are the seconds on each game (CYCLE_SECONDS)
    cycle: [['off', 'Off'], ['slow', '15 s'], ['normal', '9 s'], ['fast', '5 s']],
    motion: [['zoom', 'Slow zoom'], ['parallax', 'Parallax'], ['shots', 'Screenshots'], ['trailer', 'Trailer'], ['still', 'Still']],
  };
  const CYCLE_SECONDS = { off: 0, slow: 15, normal: 9, fast: 5 };

  /* ---------- The settings ---------- */

  let current = null;

  function stageSettings() {
    if (current) return current;
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch {
      saved = null;
    }
    const s = { ...DEFAULTS, details: { ...DEFAULTS.details } };
    if (saved && typeof saved === 'object') {
      for (const k of Object.keys(OPTIONS)) {
        if (OPTIONS[k].some(([id]) => id === saved[k])) s[k] = saved[k];
      }
      // "Not played yet" was a source before "Recently added" took its place
      if (saved.source === 'backlog') s.source = 'added';
      if (typeof saved.collection === 'string') s.collection = saved.collection;
      for (const [k] of DETAILS) {
        if (typeof saved.details?.[k] === 'boolean') s.details[k] = saved.details[k];
      }
    }
    current = s;
    return s;
  }

  function save(next) {
    current = next;
    try {
      if (next) localStorage.setItem(KEY, JSON.stringify(next));
      else localStorage.removeItem(KEY);
    } catch {
      // storage refused: the change still holds for this session
    }
    appsCache.sig = '';
    applyStageLook();
    // The cycle and the strip's timer follow at once; the games and details on the next pass
    if (live.stage && live.apps.length) {
      ns.select(live.selected);
      ns.restartCycle();
    }
    schedule();
  }

  const change = (patch) => {
    const s = stageSettings();
    save({ ...s, ...patch, details: { ...s.details, ...patch.details } });
  };

  const cycleSeconds = () => CYCLE_SECONDS[stageSettings().cycle];

  /** The stage's look from the settings: its strip, its art's motion. Writes only on change. */
  function applyStageLook() {
    const stage = live.stage;
    if (!stage) return;
    const s = stageSettings();
    SE.mark(stage, 'data-nav', s.nav);
    SE.mark(stage, 'data-motion', s.motion);
    const strip = stage.querySelector('.se-hs-strip');
    const hide = s.nav === 'none' || live.apps.length < 2;
    if (strip && strip.hidden !== hide) strip.hidden = hide;
  }

  /* ---------- The games it features ---------- */

  const playable = (a) =>
    a &&
    (a.app_type === 1 || a.app_type === 1073741824) &&
    a.visible_in_game_list !== false &&
    !(run(() => collectionStore().BIsHidden(a.appid)) || false);

  const appsCache = { at: 0, sig: '', list: [] };

  /** The featured games; an empty source (no favorites yet) falls back to recently played. */
  function stageApps() {
    const s = stageSettings();
    const sig = `${s.source}|${s.collection}|${s.count}`;
    if (sig === appsCache.sig && Date.now() - appsCache.at < 5000) return appsCache.list;
    let list = [];
    if (s.source === 'added') {
      list = libraryGames()
        .filter((a) => playable(a) && a.rt_purchased_time > 0)
        .sort((a, b) => b.rt_purchased_time - a.rt_purchased_time)
        .slice(0, s.count);
    } else if (s.source === 'favorites') {
      list = sorted((collectionApps('favorite') || []).filter(playable), 'az').slice(0, s.count);
    } else if (s.source === 'collection') {
      list = sorted((collectionApps(s.collection) || []).filter(playable), 'recent').slice(0, s.count);
    }
    if (!list.length) list = ns.recentApps(s.count);
    Object.assign(appsCache, { at: Date.now(), sig, list });
    return list;
  }

  /* ---------- The menu (client/shared/menu.js) ---------- */

  const { menuGroup, menuOption, menuRadio, menuSegButtons, menuSegment, menuToggle } = ns;

  const SOURCE_ICONS = { recent: 'restore', favorites: 'heart', collection: 'folder', added: 'calendar' };
  const MOTION_ICONS = { zoom: 'art-zoom', parallax: 'art-parallax', shots: 'photo', trailer: 'art-trailer', still: 'pause' };
  // Each background's line under its name
  const MOTION_LINES = {
    zoom: 'A slow push-in on the art',
    parallax: 'Moves a little with your pointer',
    shots: 'The game’s screenshots, one after another',
    trailer: 'Its short silent trailer, on repeat',
    still: 'The art, held still',
  };
  const collectionName = (id) => {
    const c = userCollections().find((x) => String(x.id) === id);
    return c ? c.displayName || c.strName || 'A collection' : '';
  };

  // Each source's line: what it picks (the collection's name for "A collection")
  function sourceLine(id, s) {
    if (id === 'collection') return collectionName(s.collection) || 'Pick one below';
    return { recent: 'Last played first', favorites: 'Your favorites, A–Z', added: 'Newest in your library' }[id];
  }

  // Beside the title: which Home shows (home-mode.js keeps it), Steam putting Steam's own back at once
  const HOME_MODES = [['theme', 'Steam Enhanced'], ['steam', 'Steam']];
  const menuHead = () => ns.menuSegButtons('home', 'Home', HOME_MODES, ns.homeMode());

  function paintMenu() {
    const s = stageSettings();
    const seg = (key, label) => menuSegment(key, label, OPTIONS[key], s[key]);
    const collections =
      s.source === 'collection'
        ? `<div class="se-hs-mn-colls" role="radiogroup" aria-label="Collection">${
            userCollections()
              .map((c) => {
                const n = run(() => c.visibleApps.length) || 0;
                return menuRadio('se-hs-coll', String(c.id), c.displayName || c.strName || c.id, s.collection === String(c.id), n.toLocaleString());
              })
              .join('') || '<span class="se-hs-empty">No collections yet</span>'
          }</div>`
        : '';
    return (
      panelRows() +
      menuGroup('Games', menuSegButtons('count', 'How many games', OPTIONS.count, s.count)) +
      `<div role="radiogroup" aria-label="Games">${OPTIONS.source
        .map(([id, text]) => menuOption('source', id, text, sourceLine(id, s), SOURCE_ICONS[id], s.source === id))
        .join('')}</div>` +
      collections +
      menuGroup('Details') +
      `<div class="se-hs-mn-pair">${DETAILS.map(([k, text]) => menuToggle(k, text, s.details[k])).join('')}</div>` +
      menuGroup('Switching games') +
      seg('nav', 'Game picker') +
      seg('cycle', 'Auto-switch') +
      menuGroup('Background art') +
      `<div role="radiogroup" aria-label="Background art">${OPTIONS.motion
        .map(([id, text]) => menuOption('motion', id, text, MOTION_LINES[id], MOTION_ICONS[id], s.motion === id))
        .join('')}</div>`
    );
  }

  /*
   * The board's panels (board.js), in the order the board shows them: each row a grip, its name
   * over what it shows, the square mark lit while it's on Home. Turning one on adds it in its
   * place; off takes it away. Dragging a row (dragPanels), or Alt + Up / Down on it, changes the
   * order, and the board's with it.
   */
  function panelRows() {
    const layout = ns.boardLayout();
    const on = new Set(layout.panels.map((p) => p.type));
    return (
      menuGroup('Panels') +
      '<div class="se-hs-mn-panels">' +
      layout.order
        .map((type) => {
          const p = ns.BOARD_PANELS[type];
          const lit = on.has(type);
          const name = SE.esc(p.name);
          return (
            `<div class="se-hs-mn-prow" data-order="${type}">` +
            `<button type="button" class="se-mn-row" aria-pressed="${lit}" data-panel="${type}"${lit ? ' data-on' : ''} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown">` +
            '<span class="se-hs-mn-grip" aria-hidden="true"></span>' +
            `<span class="se-mn-text"><span class="se-mn-name">${name}</span>` +
            `<span class="se-mn-sub">${SE.esc(p.desc)}</span></span><span class="se-mn-mark"></span></button>` +
            '</div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  /*
   * Dragging a panel row: a press on it that moves 4 px becomes a drag.
   * The row follows the pointer, the others making room as it passes their middle; let go, the
   * board takes the new order. The click that ends a drag doesn't turn the panel on or off.
   * Mouse events on the window, so the drag holds wherever the pointer goes.
   */
  const DRAG_START = 4;
  let dragged = false;

  function dragPanels(e) {
    if (e.button !== 0) return;
    const row = e.target.closest('[data-order]');
    const list = row?.parentElement;
    if (!list) return;
    const startY = e.clientY;
    const startTop = row.getBoundingClientRect().top;
    let dragging = false;
    let shift = 0; // the row's translate, px
    dragged = false;

    const move = (ev) => {
      if (!dragging) {
        if (Math.abs(ev.clientY - startY) < DRAG_START) return;
        dragging = true;
        SE.mark(row, 'data-dragging');
        SE.mark(list, 'data-dragging');
      }
      ev.preventDefault();
      // Its place: before the first other row whose middle is below the pointer
      const others = [...list.children].filter((other) => other !== row);
      const before = others.find((other) => {
        const r = other.getBoundingClientRect();
        return ev.clientY < r.top + r.height / 2;
      });
      if (row.nextElementSibling !== (before || null)) list.insertBefore(row, before || null);
      // And under the pointer, wherever its place put it: its spot without the shift, then
      // the shift that puts it where the pointer has carried it
      const natural = row.getBoundingClientRect().top - shift;
      shift = startTop + (ev.clientY - startY) - natural;
      row.style.translate = `0 ${shift}px`;
    };

    const up = () => {
      removeEventListener('mousemove', move, true);
      removeEventListener('mouseup', up, true);
      if (!dragging) return;
      dragged = true;
      // Only the click this mouseup makes is swallowed: a drop outside the menu makes none, and
      // the flag would eat the next real click
      setTimeout(() => {
        dragged = false;
      });
      row.style.translate = '';
      SE.unmark(row, 'data-dragging');
      SE.unmark(list, 'data-dragging');
      ns.setPanelOrder([...list.children].map((r) => r.dataset.order));
      ns.repaintMenu();
    };

    addEventListener('mousemove', move, true);
    addEventListener('mouseup', up, true);
  }

  // A panel to place `to` (0-based, kept in range), the others shifting: the board takes the new order
  function placePanel(type, to) {
    const order = ns.boardLayout().order.filter((t) => t !== type);
    const at = Math.max(0, Math.min(order.length, to));
    if (ns.boardLayout().order[at] === type) {
      ns.repaintMenu();
      return;
    }
    order.splice(at, 0, type);
    ns.setPanelOrder(order);
    ns.repaintMenu();
  }

  const placeOf = (type) => ns.boardLayout().order.indexOf(type);

  // Alt + Up / Down on a panel row moves it a place
  function onPanelKey(e) {
    const row = e.target.closest?.('[data-panel]');
    if (!row || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    placePanel(row.dataset.panel, placeOf(row.dataset.panel) + (e.key === 'ArrowUp' ? -1 : 1));
  }

  function onMenuClick(e) {
    // The click that ends a drag only drops the row
    if (dragged) {
      dragged = false;
      return;
    }
    const panel = e.target.closest('[data-panel]');
    if (panel) {
      ns.setPanelOn(panel.dataset.panel, !panel.hasAttribute('data-on'));
      ns.repaintMenu();
      return;
    }
    const chip = e.target.closest('[data-toggle]');
    if (chip) {
      const k = chip.dataset.toggle;
      change({ details: { [k]: !stageSettings().details[k] } });
      ns.repaintMenu();
      return;
    }
    const b = e.target.closest('[data-set]');
    if (!b) return;
    const key = b.dataset.set;
    if (key === 'home') {
      if (b.dataset.val === 'steam') {
        ns.closeMenu();
        ns.setHomeMode('steam');
      }
      return;
    }
    const value = OPTIONS[key]?.find(([id]) => String(id) === b.dataset.val)?.[0];
    if (value === undefined) return;
    const patch = { [key]: value };
    // Choosing "A collection" with none picked yet starts on the first one
    const first = userCollections()[0];
    if (value === 'collection' && !stageSettings().collection && first) patch.collection = String(first.id);
    change(patch);
    ns.repaintMenu();
  }

  function onMenuChange(e) {
    if (e.target.name !== 'se-hs-coll') return;
    change({ collection: e.target.value });
    // The row's line names the collection (no repaint: the list keeps its scroll)
    const menu = e.target.closest('.se-mn');
    const sub = menu?.querySelector('[data-val="collection"] .se-mn-sub');
    if (sub) sub.textContent = collectionName(e.target.value);
  }

  function openStageMenu(button) {
    ns.openMenu(button, {
      label: 'Home stage settings',
      title: 'Home stage',
      head: menuHead,
      paint: paintMenu,
      onClick: onMenuClick,
      onChange: onMenuChange,
      onKeyDown: onPanelKey,
      onMouseDown: dragPanels,
      onReset: () => save(null),
    });
  }

  Object.assign(ns, {
    applyStageLook, cycleSeconds, openStageMenu, playable, stageApps, stageSettings,
  });
})(window.__se);
