/*
 * The board under the stage: the theme's panels, on pages, on a 12-column grid that never
 * scrolls, one row of panels. Its layout (every panel's order, which are on, their settings and
 * width: 4, 8 or 12 of the board's columns, from their ⋯ menu) is kept in localStorage (se-home-board): panels are turned on and
 * off and put in order from the Home stage menu's Panels (setPanelOn, setPanelOrder), set from their own ⋯ menu (a
 * settings menu, client/shared/menu.js), which can also remove them. As the board narrows it takes fewer columns (8, then 4), each
 * panel's width scaled to match and the last in a row stretched to fill it; panels that don't
 * fit on a page move to the next, with arrows and a dot for each page.
 * Panels: Favorites and Collections (tray.js); the library and Community panels
 * (panels-library.js, panels-community.js) join the list from there. A pass paints the page showing and hands
 * back what to fit once measured (stage.js runs paint, measure, fit in that order).
 */
((SE) => {
  const ns = window.__seHomeStageParts;
  if (!ns) return;
  const {
    dropOwn, fitColl, fitTiles, menuSegment, paintColl, paintFav, schedule,
    userCollections,
  } = ns;
  const { live } = ns;


  /* ---------- The layout ---------- */

  const KEY = 'se-home-board';
  // Each panel: its name, default width (of 12) and settings with their choices
  const PANELS = {
    fav: {
      name: 'Favorites',
      desc: 'Favorites, or any collection, as capsules',
      span: 4,
      // Its capsules set the board's height (boardIdeal)
      capsules: true,
      opts: {
        sort: [['az', 'A–Z'], ['recent', 'Recent'], ['hours', 'Most played']],
        hours: [['on', 'Show'], ['off', 'Hide']],
      },
    },
    coll: {
      name: 'Collections',
      desc: 'Your collections as cards',
      span: 4,
      opts: { sort: [['az', 'A–Z'], ['size', 'Most games'], ['recent', 'Recent']] },
    },
  };
  const OPT_LABELS = { sort: 'Sort', hours: 'Hours', show: 'Show', games: 'Games' };
  // The library and Community panels (panels-library.js, panels-community.js): only added from
  // the Home stage menu's Panels, never in the default
  const PAINT_MORE = {};
  const MORE = { ...ns.LIBRARY_PANELS, ...ns.COMMUNITY_PANELS };
  for (const [type, { paint, labels, ...def }] of Object.entries(MORE)) {
    PANELS[type] = def;
    PAINT_MORE[type] = paint;
    Object.assign(OPT_LABELS, labels);
  }
  const ORDER = ['fav', 'coll'];
  // A panel's widths, of the board's 12 columns: a third, two thirds, all of it
  const WIDTHS = [4, 8, 12];
  // A row's least height, so a panel always has room for its heading and a few items
  const ROW_LEAST = 220;
  const PAGER_H = 36;

  // A panel's settings: each a known choice (the first is the default); Favorites' collection
  function panelOpts(type, saved) {
    const opts = {};
    for (const [k, choices] of Object.entries(PANELS[type].opts)) {
      opts[k] = choices.some(([id]) => id === saved?.[k]) ? saved[k] : choices[0][0];
    }
    if (type === 'fav') opts.source = typeof saved?.source === 'string' && saved.source ? saved.source : 'favorite';
    return opts;
  }

  /*
   * Every panel in the order the Home stage menu lists them (stage-settings.js), the order the
   * board shows the ones turned on: the saved order, then the panels on the board it doesn't
   * name, then the rest in PANELS' order.
   */
  function fullOrder(saved, panels) {
    const list = [];
    const add = (type) => {
      if (PANELS[type] && !list.includes(type)) list.push(type);
    };
    if (Array.isArray(saved)) saved.forEach(add);
    panels.forEach((p) => add(p.type));
    Object.keys(PANELS).forEach(add);
    return list;
  }

  // A layout's panels in its order
  const inOrder = (order, panels) => panels.slice().sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));

  function defaultLayout() {
    const panels = ORDER.map((type) => ({ type, span: PANELS[type].span, opts: panelOpts(type) }));
    return { order: fullOrder(null, panels), panels };
  }

  let layoutCache = null;

  function boardLayout() {
    if (layoutCache) return layoutCache;
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    } catch {
      saved = null;
    }
    const seen = new Set();
    if (!Array.isArray(saved?.panels)) {
      layoutCache = defaultLayout();
      return layoutCache;
    }
    const panels = saved.panels
      .filter((p) => PANELS[p?.type] && !seen.has(p.type) && seen.add(p.type))
      .map((p) => ({
        type: p.type,
        // A width of 4, 8 or 12 of the board's 12 columns (its ⋯ menu), else the panel's own
        span: WIDTHS.includes(Number(p.span)) ? Number(p.span) : PANELS[p.type].span,
        opts: panelOpts(p.type, p.opts),
      }));
    // An empty board is kept: every panel turned off
    // One row only: a saved row count (the old 1 | 2 setting) is dropped
    const order = fullOrder(saved.order, panels);
    layoutCache = { order, panels: inOrder(order, panels) };
    return layoutCache;
  }

  function saveLayout(next) {
    layoutCache = next;
    try {
      if (next) localStorage.setItem(KEY, JSON.stringify(next));
      else localStorage.removeItem(KEY);
    } catch {
      // storage refused: the change still holds for this session
    }
    schedule();
  }

  const panelOf = (type) => boardLayout().panels.find((p) => p.type === type);

  // Columns for the board's width: a panel never narrower than ~300 px
  const columnsFor = (width) => (width >= 1300 ? 12 : width >= 860 ? 8 : 4);

  /** The layout on this width: rows of { type, span } in order, each row a page. */
  function pack(layout, width) {
    const cols = columnsFor(width);
    const least = cols === 12 ? 3 : 4;
    const rows = [];
    let row = null;
    for (const p of layout.panels) {
      const span = Math.min(cols, Math.max(least, Math.round((p.span * cols) / 12)));
      if (!row || row.used + span > cols) {
        row = { cells: [], used: 0 };
        rows.push(row);
      }
      row.cells.push({ type: p.type, span });
      row.used += span;
    }
    for (const r of rows) r.cells[r.cells.length - 1].span += cols - r.used;
    return { cols, pages: rows.map((r) => [r]) };
  }

  /* ---------- The board ---------- */

  let board = null;
  let cellsEl = null;
  let pager = null;
  const cells = new Map(); // panel type → its cell, kept while the board lives
  let page = 0;
  let pageCount = 1;
  let refresh = null; // SE.poll handle
  // A panel moved from its menu: the board turns to the page it lands on
  let follow = null;

  const ICON_PREV = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>';
  const ICON_NEXT = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

  function goTo(n) {
    const next = Math.max(0, Math.min(pageCount - 1, n));
    if (next === page) return;
    page = next;
    schedule();
  }

  function boardEl() {
    if (board) return board;
    board = document.createElement('div');
    board.className = 'se-hs-board';
    board.innerHTML =
      '<div class="se-hs-cells"></div>' +
      '<div class="se-hs-pager" role="group" aria-label="Panel pages" hidden></div>';
    cellsEl = board.firstChild;
    pager = board.lastChild;
    cellsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-panel-menu]');
      if (b) openPanelMenu(b, b.closest('.se-hs-cell').dataset.panel);
    });
    pager.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.step) goTo(page + Number(b.dataset.step));
      else if (b.dataset.page) goTo(Number(b.dataset.page));
    });
    // Friends and achievements change with nothing on Home changing: a pass every half minute
    // (polled: Steam has no change event Home could hear for them)
    refresh = SE.poll(schedule, 30000, { active: () => board?.isConnected });
    return board;
  }

  const boardWidth = () => board?.clientWidth || (live.scope ? live.scope.clientWidth - 48 : 0);

  /*
   * The board's height: its row as tall as the capsule panels on the page showing (Favorites,
   * Recently added: `capsules`) need for the games they show to fill their width, edge to edge
   * with the heading, plus the pager when there are pages. A panel holds up to 3 rows, 3
   * across for every 4 of 12 columns (tray.js's fitTiles); fewer games take fewer across (never
   * under 3) and fewer rows, so 11 favorites in a half-width panel get bigger capsules than
   * 6 across would give. Before a panel's capsules are painted it counts as full.
   * Never taller than the design height, a 4-column panel's 3 × 3 (also the height with no
   * capsule panel showing): a full-width panel with few games would otherwise push the board
   * over the stage.
   * The numbers are the stylesheets': the cell's padding (stage-tray.css), the heading
   * (stage-shelves.css), the grid's gap; 2 px to spare so rounding never narrows a grid.
   */
  const CELL_TOP = 16;
  const CELL_BOTTOM = 12;
  const CELL_SIDES = 32;
  const HEAD_H = 40;
  const TILE_GAP = 8;
  const TILE_RATIO = 460 / 215;
  // `rows` rows of capsules, `across` of them filling a cell `cellW` wide
  function capsuleGrid(cellW, across, rows = 3) {
    const tileW = (cellW - CELL_SIDES - (across - 1) * TILE_GAP) / across;
    return rows * (tileW / TILE_RATIO) + (rows - 1) * TILE_GAP;
  }

  // The capsules a panel shows: its painted tiles, up to what it holds (`most`)
  function capsulesShown(type, most) {
    const painted = cells.get(type)?.querySelectorAll('.se-hs-tile').length || 0;
    return painted ? Math.min(painted, most) : most;
  }

  function boardIdeal(width) {
    if (!(width > 0)) return ROW_LEAST;
    const { cols, pages } = pack(boardLayout(), width);
    const showing = pages[Math.min(page, pages.length - 1)] || [];
    const span4 = Math.min(cols, Math.max(cols === 12 ? 3 : 4, Math.round((4 * cols) / 12)));
    const design = capsuleGrid((width * span4) / cols, 3);
    let grid = 0;
    for (const row of showing) {
      for (const { type, span } of row.cells) {
        if (!PANELS[type]?.capsules) continue;
        const most = Math.max(1, Math.round(((span / cols) * 12) / 4)) * 3;
        const shown = capsulesShown(type, most * 3);
        const across = Math.min(most, Math.max(3, Math.ceil(shown / 3)));
        grid = Math.max(grid, capsuleGrid((width * span) / cols, across, Math.min(3, Math.ceil(shown / across))));
      }
    }
    grid = grid ? Math.min(grid, design) : design;
    return Math.ceil(CELL_TOP + HEAD_H + grid + CELL_BOTTOM) + 2 + (pageCount > 1 ? PAGER_H : 0);
  }

  /** The board's least height for its row (and the pager when there are pages). */
  const boardLeast = () => ROW_LEAST + (pageCount > 1 ? PAGER_H : 0);

  function sizeBoard(px) {
    if (!board) return;
    const h = px ? `${px}px` : '';
    if (board.style.height !== h) board.style.height = h;
  }

  function cellFor(type) {
    let cell = cells.get(type);
    if (!cell) {
      cell = document.createElement('section');
      cell.className = 'se-hs-cell';
      cell.dataset.panel = type;
      cell.setAttribute('aria-label', PANELS[type].name);
      cells.set(type, cell);
    }
    return cell;
  }

  function paintPager() {
    const hide = pageCount < 2;
    if (pager.hidden !== hide) pager.hidden = hide;
    if (hide) return;
    const sig = `${page}/${pageCount}`;
    if (pager.dataset.sig === sig) return;
    pager.dataset.sig = sig;
    let dots = '';
    for (let i = 0; i < pageCount; i++) {
      dots += `<button type="button" data-page="${i}" aria-label="Page ${i + 1} of ${pageCount}"${i === page ? ' aria-current="true"' : ''}></button>`;
    }
    pager.innerHTML =
      `<button type="button" data-step="-1" aria-label="Previous page"${page === 0 ? ' disabled' : ''}>${ICON_PREV}</button>` +
      dots +
      `<button type="button" data-step="1" aria-label="Next page"${page === pageCount - 1 ? ' disabled' : ''}>${ICON_NEXT}</button>`;
  }

  /**
   * Paint the page showing (writes only). Returns what to fit once measured:
   * [{ entry, grid, fit }], grid being the element whose box the fit needs.
   */
  function paintBoard(width) {
    boardEl();
    const { cols, pages } = pack(boardLayout(), width);
    pageCount = Math.max(1, pages.length);
    if (follow) {
      const at = pages.findIndex((rows) => rows.some((row) => row.cells.some((c) => c.type === follow)));
      if (at >= 0) page = at;
      follow = null;
    }
    if (page >= pageCount) page = pageCount - 1;
    SE.cssVar(cellsEl, '--se-hs-cols', String(cols));

    const showing = pages[page] || [];
    const order = [];
    showing.forEach((row, r) => {
      row.cells.forEach(({ type, span }, i) => {
        const cell = cellFor(type);
        const column = `span ${span}`;
        if (cell.style.gridColumn !== column) cell.style.gridColumn = column;
        SE.attr(cell, 'data-first', i === 0 ? '' : null);
        SE.attr(cell, 'data-below', r > 0 ? '' : null);
        order.push(cell);
      });
    });
    // Cells leave and come in only when the page changes, in order
    for (const cell of [...cellsEl.children]) {
      if (!order.includes(cell)) cell.remove();
    }
    order.forEach((cell, i) => {
      if (cellsEl.children[i] !== cell) cellsEl.insertBefore(cell, cellsEl.children[i] || null);
    });
    paintPager();

    const fits = [];
    for (const cell of order) {
      const type = cell.dataset.panel;
      const job = PAINT[type](cell, panelOf(type)?.opts || panelOpts(type));
      if (job) fits.push(job);
    }
    // An open menu follows its button when the board moves it (a panel moved, a new page)
    ns.placeMenu();
    return fits;
  }

  /** teardown(): the board goes; a full teardown (not leaving Home) forgets its cells too. */
  function dropBoard(leaving) {
    for (const cell of cells.values()) dropOwn(cell);
    board?.remove();
    if (!leaving) {
      refresh?.disconnect();
      refresh = null;
      cells.clear();
      board = null;
      page = 0;
    }
  }

  /* ---------- Favorites and Collections ---------- */

  // A collection's name (the Favorites panel can show any collection)
  const collectionName = (id) =>
    id === 'favorite'
      ? 'Favorites'
      : (userCollections().find((c) => String(c.id) === id)?.displayName || 'Favorites');

  function paintFavorites(cell, { source, sort, hours }) {
    const entry = paintFav(cell, source, collectionName(source), { sort, hours: hours === 'on' });
    return entry && { entry, grid: entry.el.querySelector('.se-hs-grid'), fit: fitTiles };
  }

  function paintCollections(cell, { sort }) {
    const entry = paintColl(cell, sort);
    return entry && { entry, grid: entry.el.querySelector('.se-hs-cgrid'), fit: fitColl };
  }

  /* ---------- A panel's ⋯ menu ---------- */

  // The pickers that choose what a panel shows (picks.js), opened from its menu: the row's
  // name and the key its choice is kept under
  const PICKERS = {
    fav: ['Choose games', () => ns.favPickKey(), (b, from) => ns.favPicker(b, from)],
    coll: ['Choose collections', () => 'se-home-coll-pick', (b, from) => ns.collPicker(b, from)],
  };
  // Each setting's icon in the menu (sliders for any other)
  const OPT_ICONS = { sort: 'list-ordered', hours: 'chart', show: 'view-expanded', games: 'grid' };

  let menuAnchor = null;
  let menuType = null;

  // A row opening a page of its own (a picker in the menu's place), its current value at its end
  const valueRow = (act, iconName, name, value) =>
    `<button type="button" class="se-mn-row" data-act="${act}">` +
    `<span class="se-mn-icon" style="--se-mn-icon: var(--se-icon-${iconName})"></span>` +
    `<span class="se-mn-name">${SE.esc(name)}</span>` +
    `<span class="se-mn-value">${SE.esc(value)}</span>` +
    '<span class="se-mn-chev"></span></button>';

  /*
   * The body: one row per setting, each with its icon (the collection shown and the games
   * chosen, each opening its page in the menu's place; a choice of several as a segmented control)
   */
  function paintPanelMenu() {
    const layout = boardLayout();
    const p = layout.panels.find((x) => x.type === menuType);
    if (!p) return '<span class="se-hs-empty">This panel isn’t on the board</span>';
    let html = '';
    const picker = PICKERS[menuType];
    const picks = picker ? ns.readPick(picker[1]()) : null;
    if (menuType === 'fav') {
      // The collection shown, its list a page of its own (picks.js sourcePicker); "Replaced"
      // while games are chosen
      html += valueRow('colls', 'folder', 'Collection', picks?.length ? 'Replaced' : collectionName(p.opts.source));
    }
    html += Object.entries(PANELS[menuType].opts)
      .map(([k, choices]) => menuSegment(k, OPT_LABELS[k], choices, p.opts[k], OPT_ICONS[k] || 'sliders'))
      .join('');
    if (picker) {
      const n = picks?.length || 0;
      html += valueRow('pick', 'list', picker[0], menuType === 'fav' ? (n ? `${n} chosen` : 'None') : !picks ? 'All' : n ? `${n} chosen` : 'None');
    }
    return html;
  }

  /*
   * The menu's header control: the panel's width as three pictures of the board's 12 columns
   * (a third, two thirds, all of it filled), the one set lit
   */
  function panelWidthControl() {
    const p = boardLayout().panels.find((x) => x.type === menuType);
    if (!p) return '';
    return `<div class="se-seg se-hs-mn-widths" role="group" aria-label="Width">${WIDTHS.map((n) => {
      const on = p.span === n;
      return (
        `<button type="button" data-set="span" data-val="${n}" aria-pressed="${on}"${on ? ' data-on' : ''} ` +
        `title="${n} of 12 columns" aria-label="${n} of 12 columns" style="--se-hs-w: ${(n / 12) * 100}%"></button>`
      );
    }).join('')}</div>`;
  }

  // The footer's last row: taking the panel off Home (the Home stage menu's Panels add it back)
  const REMOVE_ROW =
    '<button type="button" class="se-mn-row" data-act="remove">' +
    '<span class="se-mn-icon" style="--se-mn-icon: var(--se-icon-eye-off)"></span>' +
    '<span class="se-mn-name">Remove from Home</span></button>';

  // A copy of the layout to change, and the open menu's panel in it
  function editable() {
    const layout = boardLayout();
    const panels = layout.panels.map((p) => ({ ...p, opts: { ...p.opts } }));
    return { layout, panels, i: panels.findIndex((p) => p.type === menuType) };
  }

  function onPanelMenuClick(e) {
    const { layout, panels, i } = editable();
    if (i < 0) return;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'pick' || act === 'colls') {
      // A page in the menu's place (its side of the ⋯), its ‹ coming back to the menu
      const anchor = menuAnchor;
      const type = menuType;
      const from = { side: ns.menuSide(), height: ns.menuHeight(), back: (s) => openPanelMenu(anchor, type, s) };
      ns.closeMenu();
      if (act === 'pick') {
        PICKERS[type]?.[2](anchor, from);
        return;
      }
      ns.sourcePicker(anchor, {
        ...from,
        current: () => boardLayout().panels.find((x) => x.type === 'fav')?.opts.source || 'favorite',
        onChoose: setFavSource,
      });
      return;
    }
    if (act === 'remove') {
      const type = menuType;
      ns.closeMenu();
      setPanelOn(type, false);
      return;
    }
    const b = e.target.closest('[data-set]');
    if (!b) return;
    const { set: key, val } = b.dataset;
    if (key === 'span' && WIDTHS.includes(Number(val))) {
      panels[i].span = Number(val);
      follow = menuType;
      saveLayout({ ...layout, panels });
    } else if (PANELS[menuType].opts[key]?.some(([id]) => id === val)) {
      panels[i].opts[key] = val;
      saveLayout({ ...layout, panels });
    }
    ns.repaintMenu();
  }

  // The collection Favorites shows: chosen, it replaces any games chosen (picks.js favPicker)
  function setFavSource(id) {
    const layout = boardLayout();
    const panels = layout.panels.map((p) => (p.type === 'fav' ? { ...p, opts: { ...p.opts, source: id } } : p));
    ns.writePick(ns.favPickKey(), null);
    saveLayout({ ...layout, panels });
  }

  // Reset: the panel's width and settings back to their defaults; its place stays
  function resetPanel() {
    const { layout, panels, i } = editable();
    if (i < 0) return;
    panels[i] = { type: menuType, span: PANELS[menuType].span, opts: panelOpts(menuType) };
    saveLayout({ ...layout, panels });
  }

  /*
   * Adding a panel (in its place in the order, at its own width and default settings, the
   * board moving to the page that shows it) or removing one: the Home stage menu's Panels rows
   * (stage-settings.js) and a panel's own Remove from Home.
   */
  function setPanelOn(type, on) {
    const layout = boardLayout();
    const has = layout.panels.some((p) => p.type === type);
    if (!PANELS[type] || has === on) return;
    if (on) {
      follow = type;
      const panels = [...layout.panels, { type, span: PANELS[type].span, opts: panelOpts(type) }];
      saveLayout({ ...layout, panels: inOrder(layout.order, panels) });
    } else {
      saveLayout({ ...layout, panels: layout.panels.filter((p) => p.type !== type) });
    }
  }

  /** A new order for every panel (the Home stage menu's Panels, dragged): the board follows it. */
  function setPanelOrder(types) {
    const layout = boardLayout();
    const order = fullOrder(types, layout.panels);
    saveLayout({ ...layout, order, panels: inOrder(order, layout.panels) });
  }

  function openPanelMenu(button, type, side) {
    menuAnchor = button;
    menuType = type;
    ns.openMenu(button, {
      label: `${PANELS[type].name} settings`,
      title: PANELS[type].name,
      head: panelWidthControl,
      paint: paintPanelMenu,
      foot: REMOVE_ROW,
      onClick: onPanelMenuClick,
      onReset: resetPanel,
      side,
    });
  }

  const PAINT = {
    fav: paintFavorites,
    coll: paintCollections,
    ...PAINT_MORE,
  };

  Object.assign(ns, {
    BOARD_PANELS: PANELS,
    boardEl,
    boardLayout,
    boardIdeal,
    boardLeast,
    boardWidth,
    dropBoard,
    paintBoard,
    setPanelOn,
    setPanelOrder,
    sizeBoard,
  });
})(window.__se);
