/*
 * The games' right-click menu (the library list, Home, the game page), with no submenu
 * (client/library/game-menu.css): a bar of the quick actions on top, an icon over a short word
 * each (Play, Install or Stop tinted as the game page's button; Favorite; Files; Hide;
 * Uninstall in red), then rows with an icon, Steam's name and a hint (Collections, shortcut,
 * back up, private, other rows and plugins' rows), Properties last.
 *
 * Steam's rows stay Steam's (its library context menu: their clicks, plugins' rows) and are told
 * apart by their key or what they run (their onSelected), never by their words. Manage's rows are
 * drawn in the menu itself: the menu class's BuildManageSubmenu hands back its rows, not the
 * submenu. React owns Steam's rows, so they are never moved: the panel is a grid and each row's
 * place is its CSS `order`. Add to › and Remove from › are hidden: Collections opens the
 * theme's picker (SE.picker, client/shared/picker.js) in the menu's place: every collection
 * ticked or not, a search, and a row making a new one; its ‹ shows the menu again. The theme's
 * row and dividers are plain nodes put among Steam's rows (React never owns them).
 *
 * The patching and the bar-and-rows layout are shared with the collection menu
 * (client/library/collection-menu.js) through ns.libraryMenus.
 *
 * Two parts on the Steam menu's namespace: this file (rows, bar, patching), then
 * game-menu-collections.js (the Collections row's picker, ns.gameMenuCollections).
 *
 * Steam makes a game's menu through the window's own menu manager (GetContextMenuManagerFromWindow),
 * not the Steam button's: every manager's CreateContextMenuInstance is wrapped on their class
 * (found by its fields), and the Steam menu's `createHooks` cover the one it wraps itself. Part
 * of the Steam menu's patching (client/header/menu/shared.js); `cleanups` undoes it.
 */
((SE) => {
  const ns = window.__seSteamMenuParts;
  if (!ns) return;
  const { C, run } = SE;
  const { live } = ns;

  // The rows' hint lines (the bar's buttons have none)
  const HINTS = {
    shortcut: 'Launch it from the desktop',
    unlist: 'Its files stay on your PC',
    backup: 'Save a copy to restore later',
    private: 'Friends won’t see it',
    manage: 'Shortcuts, hide, uninstall',
    dismiss: 'Stop suggesting it',
    properties: 'Updates, launch options, DLC',
  };
  // A non-Steam game's Properties has no updates or DLC
  const SHORTCUT_PROPERTIES = 'Target, launch options, controller';
  // Set or Clear custom artwork, by whether the game has its own art now
  const ARTWORK = { set: 'Your own cover, hero and logo', clear: 'Back to Steam’s art' };

  // The bar's buttons, by kind, with their word under the icon (Play's comes from actionOf)
  const BAR = {
    primary: null,
    favorite: 'Favorite',
    unfavorite: 'Unfavorite',
    browse: 'Files',
    hide: 'Hide',
    unhide: 'Unhide',
    uninstall: 'Uninstall',
  };
  const ACTION_WORD = { play: 'Play', install: 'Install', stop: 'Stop' };

  /*
   * Manage's rows Steam gives a key: their onSelected is one shared closure (the action's name
   * is a variable in it), so the key is the only thing telling them apart
   */
  const KEYS = {
    AddDesktopShortcut: 'shortcut',
    // Steam's RemoveShortcut removes a non-Steam game from the library (not a desktop shortcut)
    RemoveShortcut: 'unlist',
    BackupFiles: 'backup',
    Uninstall: 'uninstall',
  };

  /** instance -> { own, getter, overview } */
  const patched = new Map();
  /** menu panel -> its MutationObserver */
  const observers = new Map();
  /** The library menus this patches (registered at the end) */
  const kinds = [];

  const source = (fn) => (typeof fn === 'function' ? run(() => Function.prototype.toString.call(fn)) || '' : '');

  // A React children value as a flat list of elements (arrays and fragments opened)
  function flat(children, out = []) {
    if (Array.isArray(children)) {
      for (const child of children) flat(child, out);
    } else if (children && typeof children === 'object') {
      if (children.type === live.api?.React.Fragment) flat(children.props?.children, out);
      else out.push(children);
    }
    return out;
  }

  // A menu's element whose props pass `test`: the menu's own or one under it
  function findElement(node, test, depth = 0) {
    if (!node || depth > 4) return null;
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = findElement(child, test, depth);
        if (found) return found;
      }
      return null;
    }
    const props = node.props;
    if (!props) return null;
    if (run(test, props)) return node;
    return findElement(props.children, test, depth + 1);
  }

  // The game menu's props (Steam's LibraryContextMenu: { overview, ... })
  const isGameMenu = (props) =>
    typeof props.overview?.appid === 'number' && typeof props.overview.BIsModOrShortcut === 'function';

  /* ---------- Steam's rows ---------- */

  // A submenu by its rows: Add to › (keys add-to-…), Remove from › (remove-from-…), Manage (its
  // hide / uninstall rows), or another (a plugin's, Family's)
  function submenuKind(children) {
    const list = flat(children);
    const keys = list.map((child) => String(child.key ?? ''));
    if (keys.some((k) => k.startsWith('add-to-') || k === 'add-all-to-new')) return 'add';
    if (keys.some((k) => k.startsWith('remove-from-'))) return 'remove';
    if (keys.includes('Uninstall') || list.some((child) => /(?:AddTo|RemoveFrom)Hidden/.test(source(child.props?.onSelected)))) {
      return 'manage';
    }
    return 'sub';
  }

  // A key from KEYS on the fibers handing the row the same onSelected (few levels: a disabled row's is undefined)
  function keyedKind(f, fn) {
    for (let depth = 0; f && depth < 4 && f.memoizedProps?.onSelected === fn; f = f.return, depth++) {
      if (KEYS[f.key]) return KEYS[f.key];
    }
    return null;
  }

  // What a row's onSelected runs (the method it calls keeps its name in Steam's bundle)
  function kindOfAction(fn) {
    const src = source(fn);
    if (src.includes('RemoveFromFavorites')) return 'unfavorite';
    if (src.includes('AddToFavorites')) return 'favorite';
    if (src.includes('RemoveFromHidden')) return 'unhide';
    if (src.includes('AddToHidden')) return 'hide';
    if (src.includes('BrowseLocalFiles')) return 'browse';
    if (src.includes('bPrivate')) return 'private';
    if (src.includes('AppProperties')) return 'properties';
    if (src.includes('launchSource') || src.includes('OpenInstallWizard')) return 'primary';
    return null;
  }

  /*
   * Set or Clear custom artwork runs the menu's own onChangeArtwork (a bound store method: no
   * source to read), handed down from the menu's props above the row
   */
  function isArtwork(f, fn) {
    for (let depth = 0; f && depth < 30; f = f.return, depth++) {
      const props = f.memoizedProps;
      if (props && typeof props === 'object' && 'onChangeArtwork' in props) return Boolean(fn) && props.onChangeArtwork === fn;
    }
    return false;
  }

  // Rows found disabled (no onSelected) whose kind their component told: they can never act
  const disabledRows = new WeakSet();

  // A disabled row has no onSelected: Mark as Private's is told by its component, which names its string
  function disabledKind(f) {
    for (let depth = 0; f && depth < 4; f = f.return, depth++) {
      const type = f.type;
      if (source(type?.type || type?.render || type).includes('MarkAsPrivate')) return 'private';
    }
    return null;
  }

  /*
   * What a Steam row is, from the nearest props that say: a row's key or onSelected, or a
   * submenu's label and rows. Stops at the first such props, so it never reads the menu's own.
   */
  function kindOf(row) {
    for (let f = SE.fiber(row), depth = 0; f && depth < 12; f = f.return, depth++) {
      const props = f.memoizedProps;
      if (!props || typeof props !== 'object') continue;
      if ('onSelected' in props) {
        // Browse local files runs the same shared closure as the main action: told by Steam's own (localized) name
        if (props.children && props.children === run(() => live.api?.localize('#GameAction_BrowseLocalFiles'))) return 'browse';
        // Dismiss from Play Next runs a bound method (no source): told by its localized name
        if (props.children && props.children === run(() => live.api?.localize('#GameAction_DismissPlayNext'))) return 'dismiss';
        if (!props.onSelected) {
          const kind = disabledKind(f);
          if (kind) disabledRows.add(row);
          return kind || 'other';
        }
        return keyedKind(f, props.onSelected) || kindOfAction(props.onSelected) || (isArtwork(f, props.onSelected) ? 'artwork' : 'other');
      }
      if ('label' in props && props.children) return submenuKind(props.children);
    }
    return 'other';
  }

  // The games the menu acts on: Steam's own pick (several when they were selected together)
  function targetApps(panel, instance) {
    const row = panel.querySelector(`.${C.contextMenuItem}:not([data-se-gm-own])`);
    for (let f = row && SE.fiber(row), depth = 0; f && depth < 40; f = f.return, depth++) {
      if (typeof f.stateNode?.GetTargetApps === 'function') {
        const apps = run(() => f.stateNode.GetTargetApps());
        if (apps?.length) return apps;
        break;
      }
    }
    const overview = patched.get(instance)?.props?.overview;
    return overview ? [overview] : [];
  }

  /*
   * The main row's face, as the game page's button: Stop while it runs, Play when Steam's row is
   * Play (a one-game row carries its action's name as a class: Play, Update, Install, Resume…),
   * else Install's (Update and Resume included)
   */
  function actionOf(apps, row) {
    if (apps.length !== 1) return 'install';
    if (SE.isRunning(apps[0].appid)) return 'stop';
    return row?.classList.contains('Play') ? 'play' : 'install';
  }

  // The main button's word: Steam's own (Play, Update, Resume, in your language) when it is short
  const PRIMARY_WORD_MAX = 12;

  function hoursText(apps) {
    const minutes = apps.length === 1 ? apps[0].minutes_playtime_forever || 0 : 0;
    if (!minutes) return null;
    const h = minutes / 60;
    return `${h < 10 ? h.toFixed(1) : Math.round(h).toLocaleString()} h`;
  }

  /* ---------- Layout ---------- */

  // The fewest buttons a bar is drawn with (two side by side read as a stray pair: a list instead)
  const MIN_BAR = 3;

  /*
   * A row of the theme's, in Steam's row classes (hover, press) so it looks like its neighbours.
   * Pointing at it closes an open submenu (a plugin's), as pointing at Steam's own rows does:
   * through the menu's HideSubMenu, never the submenu's own Hide (that hides its parent too).
   */
  function ownRow(doc, kind, label, instance, onClick) {
    const node = doc.createElement('button');
    node.type = 'button';
    node.className = [live.api?.menuStyles?.MenuItem, C.contextMenuItem, 'contextMenuItem'].filter(Boolean).join(' ');
    node.setAttribute('role', 'menuitem');
    node.setAttribute('data-se-gm', kind);
    node.setAttribute('data-se-gm-slot', kind);
    node.append(label);
    const chevron = doc.createElement('span');
    chevron.className = 'se-gm-chevron';
    node.append(chevron);
    node.addEventListener('mouseenter', () => run(() => instance.HideSubMenu?.()));
    node.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      run(onClick, event);
    });
    return node;
  }

  function divider(doc, slot) {
    const node = doc.createElement('div');
    node.className = 'se-gm-divider';
    node.setAttribute('role', 'separator');
    node.setAttribute('data-se-gm-slot', slot);
    return node;
  }

  function own(panel, key, build) {
    let node = panel.querySelector(`[data-se-gm-own="${key}"]`);
    if (!node) {
      node = build(panel.ownerDocument);
      node.setAttribute('data-se-gm-own', key);
    }
    return node;
  }

  // The direct child of `container` holding `node`
  function slotOf(node, container) {
    let slot = node;
    while (slot && slot.parentElement !== container) slot = slot.parentElement;
    return slot || null;
  }

  // In the list (its place is its CSS order), or out of it; moved only when not there yet
  function keep(node, container, wanted) {
    if (!wanted) node.remove();
    else if (node.parentElement !== container) container.appendChild(node);
  }

  /*
   * The library menus' shared layout (this menu, client/library/collection-menu.js): every Steam
   * row marked by its kind (spec.kindOf); kinds in spec.bar become bar buttons with a word under
   * their icon (spec.word) and Steam's whole name as their tooltip (spec.title, else the name);
   * the rest are rows with a hint (spec.hints); kinds in spec.danger are red. Sets the bar's
   * columns and its divider, there only when rows follow the bar. A bar needs MIN_BAR buttons:
   * with fewer, every row is a row. Kinds in spec.skip (rows a menu hides or draws above its
   * bar) count for neither. Returns { container, rows, found, barCount }, or null.
   */
  function layoutRows(panel, spec) {
    const rows = [...panel.querySelectorAll(`.${C.contextMenuItem}`)].filter((row) => !row.hasAttribute('data-se-gm-own'));
    if (!rows.length) return null;

    // Where Steam's rows sit together: the list the bar and rows are ordered in
    let container = rows[0].parentElement;
    while (container && !rows.every((row) => container.contains(row))) container = container.parentElement;
    if (!container) return null;
    SE.attr(container, 'data-se-gm-list', '');

    const found = {};
    let barCount = 0;
    // Two buttons or fewer make no bar: those rows stay rows (with their hints, if any)
    const kinds = new Map(rows.map((row) => [row, spec.kindOf(row)]));
    const barKinds = [...kinds.values()].filter((kind) => spec.bar.includes(kind) && !spec.skip?.includes(kind));
    const useBar = barKinds.length >= MIN_BAR;
    for (const row of rows) {
      const kind = kinds.get(row);
      const inBar = useBar && spec.bar.includes(kind);
      const name = row.textContent.trim();
      const slot = slotOf(row, container);
      SE.attr(row, 'data-se-gm', kind);
      SE.attr(row, 'data-se-gm-place', inBar ? 'bar' : null);
      SE.attr(row, 'data-se-gm-hint', inBar ? null : spec.hints[kind] || null);
      SE.attr(row, 'data-se-gm-danger', spec.danger?.includes(kind) ? '' : null);
      SE.attr(row, 'data-se-gm-short', inBar ? spec.word(kind, row) : null);
      SE.attr(row, 'title', inBar ? spec.title?.(kind, name) || name : null);
      SE.attr(row, 'aria-label', inBar ? name : null);
      SE.attr(slot, 'data-se-gm-slot', kind);
      SE.attr(slot, 'data-se-gm-bar', inBar ? '' : null);
      // Focusable for the arrow keys (menuKeys); Steam's rows have no tabindex of their own
      if (!row.hasAttribute('tabindex')) row.setAttribute('tabindex', '-1');
      if (inBar) barCount++;
      found[kind] ||= row;
    }
    // The bar's columns (the grid in game-menu.css)
    if (container.style.getPropertyValue('--se-gm-bar') !== String(barCount || 1)) {
      container.style.setProperty('--se-gm-bar', String(barCount || 1));
    }
    const follows = rows.some((row) => {
      const kind = row.getAttribute('data-se-gm');
      return row.getAttribute('data-se-gm-place') !== 'bar' && !spec.skip?.includes(kind) && !row.hasAttribute('data-se-gm-off');
    });
    keep(own(panel, 'bar-end', (doc) => divider(doc, 'bar-end')), container, barCount > 0 && follows);
    return { container, rows, found, barCount };
  }

  function layout(panel, instance) {
    const apps = targetApps(panel, instance);
    const laid = layoutRows(panel, {
      kindOf,
      bar: Object.keys(BAR),
      hints: HINTS,
      danger: ['uninstall', 'unlist'],
      word: (kind, row) => {
        if (kind !== 'primary') return BAR[kind];
        const name = row.textContent.trim();
        return name && name.length <= PRIMARY_WORD_MAX ? name : ACTION_WORD[actionOf(apps, row)];
      },
      // Play's tooltip carries your hours
      title: (kind, name) => (kind === 'primary' ? [name, hoursText(apps)].filter(Boolean).join(' · ') : null),
    });
    if (!laid) return;
    const { container, rows, found } = laid;
    flattenFromRow(rows[0]);
    // Judged here, not in word(): a menu without a bar never asks Play for its word
    if (found.primary) SE.attr(found.primary, 'data-se-gm-action', actionOf(apps, found.primary));
    if (found.artwork) SE.attr(found.artwork, 'data-se-gm-hint', patched.get(instance)?.props?.hasCustomArtwork ? ARTWORK.clear : ARTWORK.set);
    if (found.properties && apps.length && apps.every((app) => run(() => app.BIsShortcut()))) {
      SE.attr(found.properties, 'data-se-gm-hint', SHORTCUT_PROPERTIES);
    }
    // Mark as Private greyed out (non-Steam games can't be private): a row that can never act goes
    rows.forEach((row) => SE.attr(row, 'data-se-gm-off', disabledRows.has(row) ? '' : null));

    // Collections: the next part's (game-menu-collections.js)
    const picker = ns.gameMenuCollections;
    if (picker) {
      const coll = own(panel, 'collections', (doc) => ownRow(doc, 'collections', 'Collections', instance, () => picker.open(panel, instance)));
      SE.attr(coll, 'data-se-gm-hint', picker.hint(apps));
      keep(coll, container, true);
    }
    keep(own(panel, 'last', (doc) => divider(doc, 'last')), container, Boolean(found.properties));
  }

  // The menu's panel ([data-se-lib-menu] = its kind), laid out now and again whenever Steam redraws its rows
  function arrange(marker, instance, kind) {
    const panel = marker.closest(`.${C.contextMenuContents}`) || marker.parentElement;
    if (!panel) return;
    SE.attr(panel, 'data-se-lib-menu', kind.name);
    kind.layout(panel, instance);
    if (observers.has(panel)) return;
    // Gone with the panel (a menu's panel is never reused)
    panel.addEventListener('keydown', menuKeys, true);
    // Own observer on purpose: one open menu's rows, gone with the menu (pruned on the next menu)
    const obs = new MutationObserver(() => {
      if (panel.isConnected) run(kind.layout, panel, instance);
      else stopObserving(panel);
    });
    obs.observe(panel, { childList: true, subtree: true });
    observers.set(panel, obs);
  }

  /*
   * The arrow keys follow what you see (rows are placed by CSS order, Steam's own keys walk its
   * DOM order): up and down to the nearest row on the line above or below, left and right along
   * the bar; Enter and Space press the focused row.
   */
  function menuKeys(event) {
    const panel = event.currentTarget;
    const doc = panel.ownerDocument;
    const rows = [...panel.querySelectorAll('[data-se-gm]')].filter((row) => row.getClientRects().length && !row.classList.contains('disabled'));
    if (!rows.length) return;
    const current = doc.activeElement?.closest?.('[data-se-gm]');
    if ((event.key === 'Enter' || event.key === ' ') && current && panel.contains(current)) {
      event.preventDefault();
      event.stopPropagation();
      current.click();
      return;
    }
    const step = { ArrowDown: 1, ArrowUp: -1, ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    // Reading order: lines top to bottom, left to right on each
    const placed = rows
      .map((row) => ({ row, rect: row.getBoundingClientRect() }))
      .sort((a, b) => Math.round(a.rect.top - b.rect.top) || a.rect.left - b.rect.left);
    const at = placed.findIndex((p) => p.row === current);
    let next = null;
    if (at < 0) {
      next = step > 0 ? placed[0] : placed[placed.length - 1];
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const same = placed.filter((p) => Math.abs(p.rect.top - placed[at].rect.top) < 1);
      next = same[same.indexOf(placed[at]) + step] || null;
    } else {
      // The nearest row (by its centre) on the next line up or down
      const lines = [...new Set(placed.map((p) => Math.round(p.rect.top)))];
      const line = lines[lines.indexOf(Math.round(placed[at].rect.top)) + step];
      const centre = placed[at].rect.left + placed[at].rect.width / 2;
      const onLine = placed.filter((p) => Math.round(p.rect.top) === line);
      next = onLine.sort((a, b) => Math.abs(a.rect.left + a.rect.width / 2 - centre) - Math.abs(b.rect.left + b.rect.width / 2 - centre))[0] || null;
    }
    next?.row.focus({ preventScroll: true });
  }

  function stopObserving(panel) {
    observers.get(panel)?.disconnect();
    observers.delete(panel);
  }

  /* ---------- Patching ---------- */

  // The menu's panel ([data-se-lib-menu]): what opens and closes, in the page or its own window
  function menuFrame(instance) {
    const root = instance.m_element || instance.m_popupContextMenu?.root_element;
    return root?.closest?.('[data-se-lib-menu]') || root?.querySelector?.('[data-se-lib-menu]') || null;
  }

  function unpatch(instance, saved) {
    patched.delete(instance);
    saved.closer?.restore();
    if (Object.getOwnPropertyDescriptor(instance, 'ReactElement')?.get !== saved.getter) return;
    if (saved.own) Object.defineProperty(instance, 'ReactElement', saved.own);
    else delete instance.ReactElement;
  }

  // Closed menus put back, so neither map grows over a session
  function prune() {
    for (const [instance, saved] of patched) {
      if (!instance.visible) unpatch(instance, saved);
    }
    for (const panel of observers.keys()) {
      if (!panel.isConnected) stopObserving(panel);
    }
  }

  /*
   * A library menu, as it is made: a hidden marker goes beside its element (the element is the
   * menu itself, so it takes no children), whose ref lays the panel out once Steam's rows are in
   * (refs attach after the rows are in the DOM). Which menu it is: the first kind whose test
   * its element's props pass.
   */
  function patchLibraryMenu(instance) {
    prune();
    // Steam's React and menu styles, shared with the Steam menu (found here if it hasn't yet)
    if (!live.api) live.api = ns.resolveMenuApi();
    if (!instance || patched.has(instance) || !live.api?.React) return;
    const own = Object.getOwnPropertyDescriptor(instance, 'ReactElement');
    if (own && !own.configurable) return;
    let descriptor = own;
    for (let proto = instance; !descriptor && (proto = Object.getPrototypeOf(proto)); ) {
      descriptor = Object.getOwnPropertyDescriptor(proto, 'ReactElement');
    }
    if (!descriptor?.get) return;
    const originalGet = descriptor.get;
    const element = run(() => originalGet.call(instance));
    let kind = null;
    let menu = null;
    for (const candidate of kinds) {
      menu = findElement(element, candidate.test);
      if (menu) {
        kind = candidate;
        break;
      }
    }
    if (!kind) return;
    run(() => kind.patched?.(menu, instance));
    // The game it was opened on, for dialogs its rows open with several games (Mark as Private)
    if (isGameMenu(menu.props)) SE.noteMenuApp(menu.props.overview.appid);

    const { React } = live.api;
    // Runs inside Steam's render: nothing it throws may reach React (a throw there takes the page down)
    const marker = (node) => node && run(arrange, node, instance, kind);
    const getter = function () {
      const element = originalGet.call(this);
      if (!React.isValidElement(element)) return element;
      return React.createElement(
        React.Fragment,
        null,
        React.createElement('div', { hidden: true, 'data-se-gm-marker': '', ref: marker }),
        element
      );
    };
    Object.defineProperty(instance, 'ReactElement', { configurable: true, get: getter });
    // Closing plays the menus' animation on the panel (client/header/menu/shared.js)
    const closer = ns.animateClose(instance, menuFrame);
    patched.set(instance, { own, getter, props: menu.props, closer });
  }

  // Steam's library menu class (the menu's element is a wrapper around it), when its module exports it
  const menuClass = () =>
    SE.findModule('game-menu:library-menu', (src, id, req) => {
      if (!src.includes('BuildManageSubmenu')) return null;
      return Object.values(run(() => req(id)) || {}).find((v) => typeof v?.prototype?.BuildManageSubmenu === 'function') || null;
    });

  /*
   * Not exported: the class from the open menu (the component above its rows that has the
   * method), wrapped, and that menu drawn again so its Manage rows come inline (once a session)
   */
  function flattenFromRow(row) {
    if (manageHook) return;
    for (let f = SE.fiber(row), depth = 0; f && depth < 40; f = f.return, depth++) {
      const node = f.stateNode;
      if (typeof node?.BuildManageSubmenu !== 'function') continue;
      let proto = Object.getPrototypeOf(node);
      while (proto && !Object.prototype.hasOwnProperty.call(proto, 'BuildManageSubmenu')) proto = Object.getPrototypeOf(proto);
      if (flattenManage(proto)) run(() => node.forceUpdate());
      return;
    }
  }

  /*
   * Manage's rows in the menu itself: the menu class's BuildManageSubmenu (its name kept in
   * Steam's bundle) hands back the submenu's rows in a fragment, so Steam draws its own rows
   * (their hooks, clicks and plugins' rows intact) inline. Once, on the class; undone by cleanups.
   */
  let manageHook = null;
  function flattenManage(proto) {
    if (manageHook || typeof proto?.BuildManageSubmenu !== 'function') return false;
    const { React } = live.api;
    const original = proto.BuildManageSubmenu;
    const wrapped = function (...args) {
      const submenu = original.apply(this, args);
      // Runs inside Steam's render: the submenu as Steam made it whenever it isn't the expected shape
      const rows = React.isValidElement(submenu) && 'label' in submenu.props ? submenu.props.children : null;
      return rows ? React.createElement(React.Fragment, null, rows) : submenu;
    };
    proto.BuildManageSubmenu = wrapped;
    manageHook = { proto, original, wrapped };
    return true;
  }

  // Steam's menu manager class, found by its fields (module "m_rgActiveSubmenus")
  const managerClass = () =>
    SE.findModule('game-menu:manager', (src, id, req) => {
      if (!src.includes('m_rgActiveSubmenus') || !src.includes('m_setHiddenMenus')) return null;
      return Object.values(run(() => req(id)) || {}).find((v) => typeof v?.prototype?.CreateContextMenuInstance === 'function') || null;
    });

  let hooked = null;
  function hookManagers() {
    if (hooked) return true;
    const proto = managerClass()?.prototype;
    if (!proto) return false;
    const original = proto.CreateContextMenuInstance;
    const wrapped = function (...args) {
      const instance = original.apply(this, args);
      run(patchLibraryMenu, instance);
      return instance;
    };
    proto.CreateContextMenuInstance = wrapped;
    hooked = { proto, original, wrapped };
    return true;
  }

  // Startup retry: Steam's bundles can still be loading. Capped at 40 tries (10 s).
  let retries = 0;
  let retryTimer = null;
  const tryHook = () => {
    retryTimer = null;
    if (!hookManagers() && ++retries < 40) retryTimer = setTimeout(tryHook, 250);
  };
  tryHook();

  /*
   * The library's menus, each { name, test(props), layout(panel, instance), patched(element, instance) }:
   * the game menu here; others (client/library/collection-menu.js, client/friends/friend-menu.js,
   * listed after this file) through ns.libraryMenus.add, with this file's layoutRows, source and
   * its own / divider / keep for the theme's nodes among Steam's rows
   */
  kinds.push({ name: 'game', test: isGameMenu, layout, patched: () => flattenManage(menuClass()?.prototype) });
  ns.libraryMenus = { add: (kind) => kinds.push(kind), layoutRows, source, targetApps, patchLibraryMenu, own, divider, keep };

  ns.createHooks.push(patchLibraryMenu);
  ns.cleanups.push(() => {
    clearTimeout(retryTimer);
    if (hooked?.proto.CreateContextMenuInstance === hooked?.wrapped) hooked.proto.CreateContextMenuInstance = hooked.original;
    hooked = null;
    if (manageHook?.proto.BuildManageSubmenu === manageHook?.wrapped) manageHook.proto.BuildManageSubmenu = manageHook.original;
    manageHook = null;
    for (const [instance, saved] of patched) unpatch(instance, saved);
    for (const panel of [...observers.keys()]) stopObserving(panel);
  });
})(window.__se);
