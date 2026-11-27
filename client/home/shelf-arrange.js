/*
 * Arrange shelves (Steam's Home, its shelves' reorder mode; client/home/shelf-arrange.css): each
 * shelf a card with what it is, ↑ ↓ moving a focused one, and beside each card its shelf as a
 * wireframe in the shape Home draws it (a collection's covers; recent games and Play Next a wide
 * card, then covers; the collections view's tiles): a column following the order as shelves
 * move, row for row with the cards, outlining the one being dragged, pointed at or focused.
 * Steam stacks the shelves in its own flow and drags them by the first one's height, so every
 * card keeps one height; a move by key goes through the list's own OnReorder(id, above, below),
 * the call its drag ends with. The list keeps its shelves in order (state.rgShowcases) and,
 * during a drag, the order they'd drop in (state.rgOrder). Beside Steam's Add shelf, an Arrange
 * shelves button opens the mode without a drag (the list's bReorderMode, which Done ends;
 * client/library/library-home.css draws both buttons).
 */
((SE) => {
  const { C } = SE;
  window.__seShelfArrange?.destroy();

  const HEADER = `.${C.ShowcaseHeader}.${C.Reordering}`;
  // How many of each part a wireframe draws, so every one fills its card to the same edge
  const COUNT = { cover: 8, lead: 6, tile: 5 };
  const views = new Map(); // header → { id, destroy }
  let focusId = null; // a shelf moved by key, focused again once Steam has redrawn it
  let map = null; // the wireframes: { root, list, panel, shelves: Map<id, element>, order }
  let pointedId = null;
  let frame = 0;

  // live: the element's own fiber can hold an older render's props, from before a move
  const showcaseOf = (header) =>
    SE.fromProps(header, 12, (p) => (typeof p.showcase?.nShowcaseId === 'number' ? p.showcase : null), { live: true });

  const listOf = (header) =>
    SE.fromProps(header, 40, (p, fiber) => (typeof fiber.stateNode?.OnReorder === 'function' ? fiber.stateNode : null));

  // What a shelf is: a line saying so, and the shape Home draws it in
  const describe = (showcase) => {
    const id = showcase.strCollectionId;
    if (!id) return { kind: 'Empty shelf', shape: 'empty' };
    if (id === 'play-next') return { kind: "Steam's suggestions", shape: 'lead' };
    if (id === 'recent-games') return { kind: 'Recently played', shape: 'lead' };
    if (id === 'all-collections') return { kind: 'Every collection', shape: 'tile' };
    const collections = SE.global('collectionStore');
    const collection = SE.run(() => collections.GetCollection(id));
    const own = SE.run(() => collections.userCollections.includes(collection));
    const kind = id === 'favorite' ? 'Your favorites'
      : own ? (collection.bIsDynamic ? 'Dynamic collection' : 'Collection')
      : 'Library section';
    return { kind, shape: 'cover' };
  };

  /* The card: the kind line under Steam's name, focusable for ↑ ↓ */
  const build = (header) => {
    const showcase = showcaseOf(header);
    if (!showcase) return null;
    const { kind } = describe(showcase);
    const name = header.firstElementChild?.textContent.replace(/\(\s*[\d.,\s/]+\)/, '').trim();

    const line = document.createElement('div');
    line.className = 'se-arrange-kind';
    line.textContent = kind;
    header.append(line);
    SE.mark(header, 'tabindex', '0');
    SE.mark(header, 'aria-label', `${name ? `${name}, ` : ''}${kind}. Up and down arrows move it.`);
    SE.mark(header, 'data-se-arrange');
    return {
      id: showcase.nShowcaseId,
      destroy() {
        line.remove();
        for (const attr of ['tabindex', 'aria-label', 'data-se-arrange']) header.removeAttribute(attr);
      },
    };
  };

  /* The wireframes */
  const part = (parent, cls) => {
    const el = parent.appendChild(document.createElement('span'));
    el.className = cls;
    return el;
  };

  const miniShelf = (showcase) => {
    const { shape } = describe(showcase);
    const shelf = document.createElement('div');
    shelf.className = 'se-arrange-map-shelf';
    shelf.dataset.shape = shape;
    if (shape === 'empty') part(shelf, 'se-arrange-map-empty');
    if (shape === 'lead') part(shelf, 'se-arrange-map-cover').toggleAttribute('data-lead', true);
    if (shape === 'cover' || shape === 'lead') {
      for (let i = 0; i < COUNT[shape]; i++) part(shelf, 'se-arrange-map-cover');
    }
    // A collection's tile: three covers fanned over its name
    if (shape === 'tile') {
      for (let i = 0; i < COUNT.tile; i++) {
        const tile = part(shelf, 'se-arrange-map-tile');
        for (let j = 0; j < 3; j++) part(tile, 'se-arrange-map-fan');
      }
    }
    return shelf;
  };

  // Order and outline, from the list's state: no layout read
  const drawMap = () => {
    frame = 0;
    if (!map) return;
    const state = map.list.state || {};
    const order = (state.rgOrder || state.rgShowcases || []).filter(Boolean);
    const key = order.map((showcase) => showcase.nShowcaseId).join();
    if (key !== map.order) {
      map.order = key;
      const keep = new Set();
      for (const showcase of order) {
        const id = showcase.nShowcaseId;
        keep.add(id);
        if (!map.shelves.has(id)) map.shelves.set(id, miniShelf(showcase));
        map.panel.appendChild(map.shelves.get(id));
      }
      for (const [id, shelf] of map.shelves) {
        if (keep.has(id)) continue;
        shelf.remove();
        map.shelves.delete(id);
      }
    }
    const focused = views.get(document.activeElement)?.id;
    const selected = state.nDraggingShowcase ?? pointedId ?? focused ?? null;
    for (const [id, shelf] of map.shelves) shelf.toggleAttribute('data-selected', id === selected);
  };

  const scheduleMap = () => {
    if (map && !frame) frame = requestAnimationFrame(drawMap);
  };

  // The shelf pointed at; during a drag the list only moves shelves by transform, so its drop
  // order is read again as the pointer moves
  const onPointer = (event) => {
    const header = event.target instanceof Element && event.target.closest('[data-se-arrange]');
    pointedId = header ? views.get(header)?.id ?? null : null;
    scheduleMap();
  };

  const LISTENERS = [['mousemove', onPointer], ['mouseover', onPointer], ['focusin', scheduleMap], ['focusout', scheduleMap]];

  const openMap = (root, list) => {
    // Drawings beside cards that say the same: hidden from screen readers
    const panel = document.createElement('div');
    panel.className = 'se-arrange-map';
    panel.setAttribute('aria-hidden', 'true');
    root.appendChild(panel);
    for (const [type, fn] of LISTENERS) document.addEventListener(type, fn, true);
    map = { root, list, panel, shelves: new Map(), order: '' };
  };

  const closeMap = () => {
    if (!map) return;
    for (const [type, fn] of LISTENERS) document.removeEventListener(type, fn, true);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    map.panel.remove();
    map = null;
    pointedId = null;
  };

  // The wireframes live in Steam's shelf list (its only class is Reordering) while it's open
  const syncMap = (headers) => {
    const first = headers.values().next().value;
    const root = first?.closest(`.${C.Reordering}:not(.${C.ShowcaseHeader})`);
    if (map && map.root !== root) closeMap();
    if (!root) return;
    if (!map) {
      const list = listOf(first);
      if (!list) return;
      openMap(root, list);
    }
    if (!map.panel.isConnected) root.appendChild(map.panel);
    scheduleMap();
  };

  /* Arrange shelves, beside Steam's Add shelf: off while there's nothing to reorder */
  const ROW = `.${C.AddShowcaseRow}`;
  // AddShowcaseRow → { button, list }: the shelf list found once, its state read on each pass
  const tools = new Map();
  /*
   * Steam's Add shelf is a plain div with a click handler: made a button the keyboard reaches
   * (Tab, then Enter or Space clicks it), out of the order while Steam disables it (an empty
   * shelf waiting to be set)
   */
  const ADD = `${ROW} .${C.AddShowcase}`;
  const ADD_DISABLED = C.AddShowcase_Disabled;
  const syncAdd = (add) => {
    SE.attr(add, 'role', 'button');
    SE.attr(add, 'tabindex', add.classList.contains(ADD_DISABLED) ? '-1' : '0');
    SE.attr(add, 'aria-disabled', add.classList.contains(ADD_DISABLED) ? 'true' : null);
  };

  const syncTools = () => {
    for (const [row, tool] of tools) {
      if (row.isConnected) continue;
      tool.button.remove();
      tools.delete(row);
    }
    for (const row of document.querySelectorAll(ROW)) {
      let tool = tools.get(row);
      if (!tool) {
        const list = listOf(row);
        if (!list) continue;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'se-shelf-arrange';
        // An icon button, its name in the theme's tip (client/header/header-tooltips.js)
        button.setAttribute('aria-label', 'Arrange shelves');
        button.dataset.seTip = 'Arrange shelves';
        button.addEventListener('click', () => SE.run(() => list.setState({ bReorderMode: true })));
        row.append(button);
        tool = { button, list };
        tools.set(row, tool);
      }
      const few = (SE.run(() => tool.list.state.rgShowcases.length) || 0) < 2;
      if (tool.button.disabled !== few) tool.button.disabled = few;
    }
    for (const add of document.querySelectorAll(ADD)) syncAdd(add);
  };

  const update = () => {
    const headers = new Set(document.querySelectorAll(HEADER));
    for (const [header, view] of views) {
      if (headers.has(header) && header.isConnected) continue;
      view.destroy();
      views.delete(header);
    }
    for (const header of headers) {
      if (views.has(header)) continue;
      const view = SE.run(() => build(header));
      if (view) views.set(header, view);
    }
    SE.run(() => syncMap(headers));
    SE.run(syncTools);
    if (focusId == null) return;
    const header = [...views].find(([, view]) => view.id === focusId)?.[0];
    if (!header) return;
    focusId = null;
    if (document.activeElement !== header) header.focus();
  };

  // ↑ ↓ on a focused shelf: its new neighbours, read in the order Steam drew the shelves
  const onKeyDown = (event) => {
    if (event.target instanceof Element && event.target.matches(ADD) && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      if (event.target.getAttribute('aria-disabled') !== 'true') event.target.click();
      return;
    }
    const header = event.target;
    if (!(header instanceof Element) || !header.matches('[data-se-arrange]')) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const step = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (!step) return;
    event.preventDefault();
    const list = listOf(header);
    const shelves = [...document.querySelectorAll(HEADER)].map(showcaseOf);
    const at = shelves.findIndex((shelf) => shelf && shelf.nShowcaseId === views.get(header)?.id);
    const to = at + step;
    if (!list || at < 0 || to < 0 || to >= shelves.length) return;
    const [above, below] = step < 0 ? [shelves[to - 1], shelves[to]] : [shelves[to], shelves[to + 1]];
    focusId = shelves[at].nShowcaseId;
    SE.run(() => list.OnReorder(focusId, above, below));
  };

  const watcher = SE.watch(update, { attributes: ['class'] });
  document.addEventListener('keydown', onKeyDown);
  update();

  window.__seShelfArrange = {
    destroy() {
      watcher.disconnect();
      document.removeEventListener('keydown', onKeyDown);
      closeMap();
      for (const view of views.values()) view.destroy();
      views.clear();
      for (const tool of tools.values()) tool.button.remove();
      tools.clear();
      for (const add of document.querySelectorAll(ADD)) {
        for (const name of ['role', 'tabindex', 'aria-disabled']) add.removeAttribute(name);
      }
      delete window.__seShelfArrange;
    },
  };
})(window.__se);
