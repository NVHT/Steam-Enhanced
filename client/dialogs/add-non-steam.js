/*
 * Add a Non-Steam Game, rebuilt: one toolbar (search, sort, All / Selected, a helper filter), a
 * list of two-line program cards (name over a path whose file name never truncates) grouped by
 * letter, an empty state, a selection summary with Clear beside Browse, and the selected count on
 * the Add button. Programs already in the Library carry an "In Library" tag; uninstallers,
 * updaters, setup and crash tools are hidden until the filter is turned off (a pick stays shown).
 * Ctrl+A selects every shown program not already in the Library, Ctrl+F jumps to search, the
 * arrow keys walk the list and Space toggles. Icons are duotone, as across the theme.
 *
 * Steam renders the dialog from sp.js (AddNonSteamGameDialog, the "open/addnonsteamgame" popup,
 * or the modal variant): DialogBodyText, a filter input, a header row whose two cells sort
 * (Name ⇄ NameReverse, Path ⇄ PathReverse), the GameList of rows keyed by strCmdline, and a
 * footer of Browse, Spacer, Add Selected and Cancel. Selection lives in the component's state
 * as a Set of command lines.
 *
 * Every native node stays mounted and React keeps owning it. The theme only adds attributes to
 * Steam's nodes and appends its own children where React's child lists never change (row ends,
 * the content root, the footer), and drives the dialog by clicking Steam's own controls, so
 * sorting, filtering, selection and Add behave exactly as Steam's.
 *
 * "In Library" compares each row's executable with the shortcuts already in the Library: their
 * appids from appStore (app_type k_EAppType_Shortcut) and their strShortcutExe from app details,
 * read through appDetailsStore where this window can reach it (Steam's main window), else
 * SteamClient.Apps.RegisterForAppDetails.
 */
((SE) => {
  window.__seAddNonSteam?.destroy();

  /* AddNonSteamGameDialog CSS module (sp.js 92445) */
  const C = {
    root: '.zhaKeChn9HPNSMtk0ami_',
    header: '._3m0MnUo45wjLOfNLpZ-3KH',
    name: '._1kVk1iZQs3Blqmz6k0qeFV',
    path: '._1LM_TWL_05e13S1LS9wHao',
    list: '._1e6tjguQEHdYIehM9aRmO5',
    row: '._1cXzMrhKqoTeIK_bPpNLIC',
    icon: '._1lI4JF6IbYhApR8FbMR8Nr',
    loading: '._2xttHmlEaBDSek3NmEjep0',
    arrow: '._22hYbsRuIIJj7Fcm97dEOE',
    footer: '.kOsdHFGVApmVzmcTgOixo',
    browse: '._3XOLUJOxOIjqw9EpFcBr0z',
  };

  const BUILT = 'data-se-ns';
  const OURS = 'se-ns';
  const MAX_HOOKS = 60;
  const MAX_DEPTH = 8;
  const SHORTCUT_APP_TYPE = 1073741824; // k_EAppType_Shortcut
  const DETAILS_TIMEOUT_MS = 4000;
  const HELPERS_KEY = 'se-add-non-steam-hide-helpers';

  /*
   * Helper executables: uninstallers, updaters, installers, crash and bug reporters. A program
   * with launch arguments is never one (Discord's Update.exe --processStart Discord.exe).
   */
  const HELPER_FILE =
    /^(?:unins\d*|uninst(?:all)?(?:er)?|setup|install(?:er)?|update(?:r)?|maintenancetool|repair|elevate|dxsetup|vc_?redist.*|.*(?:uninstall|updater|crash ?(?:pad|reporter|handler|sender)|bug ?(?:report|splat)|errorreport|helper).*)$/i;
  const HELPER_NAME = /\b(?:uninstall(?:er)?|updater|crash reporter|bug report(?:er)?|setup|repair tool)\b/i;

  /* Duotone: `d` is the soft fill layer under the stroke (styles: .se-ns svg .d) */
  const ICONS = {
    arrowUp: '<path d="M12 19V5M6 11l6-6 6 6"/>',
    arrowDown: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    sortName: '<rect class="d" x="3" y="4" width="9" height="16" rx="2"/><path d="M7.5 4v16M4.5 16.5l3 3.5 3-3.5M15 6h6M15 10.5h4.5M15 15h3"/>',
    folder: '<path class="d" d="M3 9h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    apps: '<rect class="d" x="4" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    check: '<circle class="d" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.3l2.4 2.4 4.6-4.9"/>',
    search: '<circle class="d" cx="11" cy="11" r="6.5"/><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    filter: '<path class="d" d="M4 5h16l-6 7.5V19l-4-2v-4.5z"/><path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"/>',
    folderAdd: '<path class="d" d="M3 9h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 11v5M9.5 13.5h5"/>',
    add: '<rect class="d" x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="M12 8v8M8 12h8"/>',
    library: '<rect class="d" x="4" y="3" width="6" height="18" rx="1.5"/><rect x="4" y="3" width="6" height="18" rx="1.5"/><rect x="12" y="6" width="5" height="15" rx="1.5"/><path d="M19.5 7.5l2 13"/>',
  };

  /* ---------- Helpers ---------- */

  const attempt = SE.attempt('Add a Non-Steam Game');

  const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

  const { el } = SE;

  const { setText } = SE;

  const { icon } = SE.icons(ICONS);

  const button = (className, onClick) => {
    const node = el('button', className);
    node.type = 'button'; // the dialog is a form: a bare button would submit it (Add Selected)
    node.addEventListener('click', onClick);
    return node;
  };

  const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => resolve()));

  const isOurs = SE.inside(`.${OURS}`);

  const storage = {
    get: (key, fallback) => attempt(() => localStorage.getItem(key) ?? fallback, fallback),
    set: (key, value) => attempt(() => localStorage.setItem(key, value)),
  };

  /* An executable path as a comparable key: no quotes, backslashes, case-folded (Windows paths) */
  const pathKey = (path) => String(path ?? '').trim().replace(/^"(.*)"$/, '$1').replace(/\//g, '\\').toLowerCase();

  /* ---------- Reading Steam's state ---------- */

  const isSelected = (row) => !!row.querySelector('.DialogCheckbox.Active');

  /* The app behind a row ({ strAppName, strExePath, strArguments, strCmdline }) */
  const appOf = (row) => SE.fromProps?.(row, 3, (p) => (p.app?.strCmdline != null ? p.app : undefined)) ?? null;

  /*
   * The dialog component's selection: the one Set in its hooks (command lines). Read from the
   * live fiber so it is this render's Set, not the previous one. The popup's objects come from
   * Steam's main window, so the type check can't use instanceof.
   */
  const readSelection = (root) => {
    let fiber = SE.liveFiber?.(root);
    for (let depth = 0; fiber && depth < MAX_DEPTH; fiber = fiber.return, depth++) {
      if (typeof fiber.type !== 'function') continue;
      let hook = fiber.memoizedState;
      for (let i = 0; hook && typeof hook === 'object' && 'next' in hook && i < MAX_HOOKS; hook = hook.next, i++) {
        if (Object.prototype.toString.call(hook.memoizedState) === '[object Set]') return hook.memoizedState;
      }
    }
    return null;
  };

  /*
   * Which header cell carries the sort caret, and which way it points. Steam's Carat swaps the
   * path inside the same <svg> when the direction flips, and a DOM node's fiber can be the stale
   * alternate, so the direction is read from the drawn path: its tip sits above the middle of
   * the 36-unit box for "up" (M17.98 10.23) and below it for "down" (M17.98 26.54).
   */
  const readSort = (header) => {
    for (const [key, selector] of [['name', C.name], ['path', C.path]]) {
      const arrow = header?.querySelector(`:scope > ${selector} ${C.arrow}`);
      if (!arrow) continue;
      const tipY = Number(arrow.querySelector('path')?.getAttribute('d')?.match(/^M\s*[\d.]+[\s,]+([\d.]+)/)?.[1]);
      return { key, dir: tipY > 18 ? 'down' : 'up' };
    }
    return { key: 'name', dir: 'up' };
  };

  /* A command line ("C:\dir\app.exe" --flag, or unquoted without arguments) to { exe, args } */
  const parseCmdline = (cmdline) => {
    const text = String(cmdline ?? '').trim();
    const quoted = text.match(/^"([^"]*)"\s*(.*)$/);
    return quoted ? { exe: quoted[1], args: quoted[2] } : { exe: text, args: '' };
  };

  /* "C:\Program Files\7-Zip\7zFM.exe" (quoted or not) to { dir, file } */
  const splitPath = (path) => {
    const bare = String(path ?? '').trim().replace(/^"(.*)"$/, '$1');
    const cut = Math.max(bare.lastIndexOf('\\'), bare.lastIndexOf('/')) + 1;
    return { dir: bare.slice(0, cut), file: bare.slice(cut) };
  };

  /* Letter group for a name: A–Z (any script's letters, upper-cased), everything else "#" */
  const groupOf = (name) => {
    const first = clean(name).charAt(0);
    return /\p{L}/u.test(first) ? first.toLocaleUpperCase() : '#';
  };

  /* ---------- Tooltips ---------- */

  /*
   * Steam's tooltip, drawn by the theme: its TextToolTip skin (restyled in dialogs.css) in a
   * top-layer popover, shown after Steam's 300 ms delay above the node and flipped below when
   * there's no room. Steam's own React Tooltip can't be used here: this popup has no webpack,
   * and one mounted from the main window's React never shows in it.
   *
   * One per view. set(node, label) gives a node a tip, relabels it (live, if showing) or, with
   * no label, takes it away. Hover is delegated from the dialog root.
   */
  const createTips = (root) => {
    const doc = root.ownerDocument;
    const win = doc.defaultView;
    const labels = new Map();
    let shownFor = null; // the node whose tip is up
    let pending = null; // the node whose tip is waiting out the delay
    let timer = 0;

    const pop = el('div', `${OURS} ${OURS}-tooltip`);
    pop.setAttribute('popover', 'manual');
    pop.setAttribute('role', 'tooltip');
    // The box itself is set inline, over the UA's centred, framed [popover] and any page rule
    // that reaches it, so only the skin comes from stylesheets
    for (const [name, value] of Object.entries({
      position: 'fixed',
      inset: 'auto',
      margin: '0',
      padding: '0',
      border: '0',
      background: 'none',
      'box-shadow': 'none',
      overflow: 'visible',
      width: 'max-content',
      height: 'auto',
      'max-width': 'none',
      'pointer-events': 'none',
    })) {
      pop.style.setProperty(name, value, 'important');
    }
    const body = el('div', SE.C.TextToolTip);
    pop.append(body);
    doc.body.append(pop);

    const place = (node) => {
      const box = node.getBoundingClientRect();
      const tip = pop.getBoundingClientRect();
      const gap = 6;
      const edge = 8;
      const above = box.top - gap - tip.height;
      const top = above >= edge ? above : box.bottom + gap;
      const left = Math.min(Math.max(box.left + (box.width - tip.width) / 2, edge), win.innerWidth - tip.width - edge);
      pop.style.setProperty('left', `${Math.round(left)}px`, 'important');
      pop.style.setProperty('top', `${Math.round(top)}px`, 'important');
    };

    const hide = () => {
      clearTimeout(timer);
      timer = 0;
      if (!shownFor) return;
      shownFor = null;
      pop.removeAttribute('data-shown');
      attempt(() => pop.hidePopover?.());
    };

    const show = (node) => {
      shownFor = node;
      body.textContent = labels.get(node);
      attempt(() => pop.showPopover?.());
      place(node);
      pop.setAttribute('data-shown', '');
    };

    const owner = (target) => {
      for (let node = target; node && node !== root.parentNode; node = node.parentElement) {
        if (labels.has(node)) return node;
      }
      return null;
    };

    const onOver = (event) => {
      const node = owner(event.target);
      if (node === shownFor || (node && timer && node === pending)) return;
      hide();
      if (!node) return;
      pending = node;
      timer = setTimeout(() => {
        timer = 0;
        if (node.isConnected && labels.has(node)) show(node);
      }, 300);
    };

    const onOut = (event) => {
      if (owner(event.relatedTarget) === (shownFor ?? pending)) return;
      pending = null;
      hide();
    };

    root.addEventListener('pointerover', onOver);
    root.addEventListener('pointerout', onOut);
    root.addEventListener('pointerdown', hide, true);
    root.addEventListener('scroll', hide, true);

    const set = (node, label) => {
      if (!node) return;
      if (!label) {
        labels.delete(node);
        if (node === shownFor || node === pending) hide();
        return;
      }
      if (labels.get(node) === label) return;
      labels.set(node, label);
      if (node === shownFor) {
        body.textContent = label;
        place(node);
      }
    };

    /* Labels of nodes React has since removed */
    const prune = () => {
      for (const node of labels.keys()) if (!node.isConnected) set(node, null);
    };

    const destroy = () => {
      hide();
      root.removeEventListener('pointerover', onOver);
      root.removeEventListener('pointerout', onOut);
      root.removeEventListener('pointerdown', hide, true);
      root.removeEventListener('scroll', hide, true);
      labels.clear();
      pop.remove();
    };

    return { set, prune, destroy };
  };

  /* ---------- Shortcuts already in the Library ---------- */

  /* The window that owns Steam's stores (the main window), reached from this popup */
  const storeWindow = () => {
    for (const win of SE.owners?.() ?? [window]) {
      try {
        if (win.appStore && win.SteamClient?.Apps) return win;
      } catch {}
    }
    return null;
  };

  /* One shortcut's executable, from the details Steam already holds or a one-off subscription */
  const shortcutExe = (win, appid) =>
    new Promise(resolve => {
      let handle = null;
      let done = false;
      const finish = (exe) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        // The first callback can arrive inside the register call, before `handle` is set
        queueMicrotask(() => attempt(() => handle?.unregister()));
        resolve(exe || null);
      };
      const timer = setTimeout(() => finish(null), DETAILS_TIMEOUT_MS);
      const onDetails = (details) => {
        if (details?.strShortcutExe != null) finish(details.strShortcutExe);
      };
      const store = win.appDetailsStore;
      onDetails(attempt(() => store?.GetAppDetails?.(appid), null));
      if (done) return;
      handle =
        typeof store?.RegisterForAppData === 'function'
          ? attempt(() => store.RegisterForAppData(appid, onDetails), null)
          : attempt(() => win.SteamClient.Apps.RegisterForAppDetails(appid, onDetails), null);
      if (!handle) finish(null);
    });

  /* Path keys of every shortcut in the Library */
  const libraryPaths = async () => {
    const win = storeWindow();
    if (!win) return new Set();
    const appids = attempt(
      () => [...win.appStore.allApps].filter(app => app?.app_type === SHORTCUT_APP_TYPE).map(app => app.appid),
      [],
    );
    const exes = await Promise.all(appids.map(appid => shortcutExe(win, appid)));
    return new Set(exes.filter(Boolean).map(pathKey));
  };

  /* ---------- Row decoration ---------- */

  const rowInfo = new WeakMap();

  const isHelper = (name, file, args) =>
    !args && (HELPER_FILE.test(file.replace(/\.[^.]+$/, '')) || HELPER_NAME.test(name));

  /* Adds the path line and the In Library tag once per row; returns what the view needs */
  const decorate = (row) => {
    const known = rowInfo.get(row);
    if (known && row.querySelector(`:scope > .${OURS}-path`)) return known;
    const app = appOf(row);
    const name = app?.strAppName ?? clean(row.querySelector(`:scope > ${C.name}`)?.textContent);
    const cmdline = app?.strCmdline ?? clean(row.querySelector(`:scope > ${C.path}`)?.textContent);
    const parsed = parseCmdline(cmdline);
    const { dir, file } = splitPath(app?.strExePath ?? parsed.exe);
    const args = clean(app ? app.strArguments : parsed.args);

    const line = el('span', `${OURS} ${OURS}-path`);
    line.append(el('span', `${OURS}-dir`, dir), el('span', `${OURS}-file`, file || cmdline));
    if (args) line.append(el('span', `${OURS}-args`, args));
    const tag = el('span', `${OURS} ${OURS}-tag`);
    tag.append(icon('library'), el('span', null, 'In Library'));
    row.append(line, tag);

    SE.attr?.(row, 'tabindex', '-1');
    // Shown only when the program has no icon
    const initial = clean(name).charAt(0);
    SE.attr?.(row.querySelector(`:scope > ${C.icon}`), 'data-se-initial', initial ? initial.toLocaleUpperCase() : '?');

    const info = {
      name,
      cmdline,
      line,
      tag,
      exe: pathKey(app?.strExePath ?? parsed.exe),
      helper: isHelper(clean(name), file, args),
    };
    rowInfo.set(row, info);
    SE.attr?.(row, 'data-se-helper', info.helper ? '' : null);
    return info;
  };

  /* ---------- View ---------- */

  const createView = (root) => {
    const header = root.querySelector(`:scope > ${C.header}`);
    const list = root.querySelector(`:scope > ${C.list}`);
    const footer = root.querySelector(`:scope > ${C.footer}`);
    const browse = footer?.querySelector(`:scope > ${C.browse}`);
    const cleanups = [];
    let view = 'all';
    let hideHelpers = storage.get(HELPERS_KEY, '1') === '1';
    let owned = new Set();
    const tips = createTips(root);
    cleanups.push(tips.destroy);

    const listen = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts);
      cleanups.push(() => target.removeEventListener(type, fn, opts));
    };

    const rows = () => [...list.querySelectorAll(`:scope > ${C.row}`)];
    const isOwned = (row) => owned.has(rowInfo.get(row)?.exe);
    const isHidden = (row) => hideHelpers && !!rowInfo.get(row)?.helper && !isSelected(row);
    const shown = (row) => (view === 'all' || isSelected(row)) && !isHidden(row);
    const shownRows = () => rows().filter(shown);
    const searchInput = () => root.querySelector(':scope > .DialogInput_Wrapper input');
    const addButton = () =>
      footer?.querySelector(':scope > button.Primary') ?? footer?.querySelector(':scope > button:nth-last-of-type(2)');

    /* A duotone glyph ahead of a Steam button's label; React leaves a static label's text node alone */
    const ensureIcon = (target, name) => {
      if (!target || target.querySelector(`:scope > svg.${OURS}-btn-icon`)) return;
      const svg = icon(name);
      svg.classList.add(OURS, `${OURS}-btn-icon`);
      target.prepend(svg);
    };

    const clearSearch = async () => {
      const clear = root.querySelector(':scope > .DialogInput_Wrapper .DialogInput_ClearAction');
      if (!clear) return false;
      clear.click();
      await nextFrame();
      return true;
    };

    /* Toolbar: sort by Program / Location, All / Selected, then the helper filter */
    const tools = el('div', `${OURS} ${OURS}-tools`);

    const sortGroup = el('div', `${OURS}-seg`);
    sortGroup.setAttribute('role', 'group');
    sortGroup.setAttribute('aria-label', 'Sort');
    const sortButtons = [['name', C.name], ['path', C.path]].map(([key, selector]) => {
      const cell = header?.querySelector(`:scope > ${selector}`);
      const label = clean(cell?.textContent) || (key === 'name' ? 'Program' : 'Location');
      const node = button(`${OURS}-seg-btn`, () => cell?.click());
      node.dataset.key = key;
      node.dataset.label = label.toLocaleLowerCase();
      node.setAttribute('aria-label', `Sort by ${node.dataset.label}`); // the label hides in narrow windows
      const arrow = icon('arrowUp');
      arrow.classList.add(`${OURS}-arrow`);
      node.append(icon(key === 'name' ? 'sortName' : 'folder'), el('span', null, label.charAt(0) + label.slice(1).toLocaleLowerCase()), arrow);
      sortGroup.append(node);
      return node;
    });

    const viewGroup = el('div', `${OURS}-seg`);
    viewGroup.setAttribute('role', 'group');
    viewGroup.setAttribute('aria-label', 'Show');
    const viewButtons = [['all', 'All'], ['selected', 'Selected']].map(([key, label]) => {
      const node = button(`${OURS}-seg-btn`, async () => {
        if (key === view) return;
        // Selected shows every pick, so a search that hides some of them goes
        if (key === 'selected') await clearSearch();
        view = key;
        list.scrollTop = 0;
        update();
      });
      node.dataset.key = key;
      node.setAttribute('aria-label', label);
      tips.set(node, key === 'all' ? 'Every program found' : 'Only the programs you picked');
      node.append(icon(key === 'all' ? 'apps' : 'check'), el('span', null, label), el('b', `${OURS}-count`));
      viewGroup.append(node);
      return node;
    });

    // Pressed = helpers hidden; the count is how many this search turned up
    const helpers = button(`${OURS}-toggle`, () => {
      hideHelpers = !hideHelpers;
      storage.set(HELPERS_KEY, hideHelpers ? '1' : '0');
      update();
    });
    helpers.append(icon('filter'), el('b', `${OURS}-count`));

    tools.append(sortGroup, viewGroup, helpers);

    /* Empty state, over the list */
    const empty = el('div', `${OURS} ${OURS}-empty`);
    const emptyIcon = el('span', `${OURS}-empty-icon`);
    const emptyTitle = el('strong');
    const emptyText = el('span');
    empty.append(emptyIcon, emptyTitle, emptyText);
    empty.hidden = true;

    /* Selection summary beside Browse */
    const summary = el('div', `${OURS} ${OURS}-summary`);
    const summaryText = el('span');
    const clearAll = button(`${OURS}-link`, async () => {
      // Picks hidden by a search can't be clicked off, so the search goes first
      const selection = readSelection(root);
      const visible = rows().filter(isSelected).length;
      if (selection && selection.size > visible) await clearSearch();
      for (const row of rows()) if (isSelected(row)) row.click();
    });
    clearAll.textContent = 'Clear';
    tips.set(clearAll, 'Clear the selection');
    summary.append(summaryText, clearAll);
    summary.hidden = true;

    /* ---------- Render ---------- */

    const renderEmpty = (shownCount, loading) => {
      empty.hidden = loading || shownCount > 0;
      if (empty.hidden) return;
      const query = clean(searchInput()?.value);
      const [name, title, text] =
        view === 'selected'
          ? ['check', 'Nothing selected yet', 'Pick programs from All, or Browse for one that isn’t listed.']
          : query
            ? ['search', `No programs match “${query}”`, 'Try another name or folder, or Browse for the program.']
            : ['apps', 'No programs found', 'Browse for the program you want to add.'];
      if (emptyIcon.dataset.icon !== name) {
        emptyIcon.dataset.icon = name;
        emptyIcon.replaceChildren(icon(name));
      }
      setText(emptyTitle, title);
      setText(emptyText, text);
    };

    const update = () => {
      if (!root.isConnected) return;
      const all = rows();
      for (const row of all) decorate(row);

      const loading = !!list.querySelector(`:scope > ${C.loading}`);
      const selection = readSelection(root);
      const selectedCount = selection ? selection.size : all.filter(isSelected).length;
      const sort = readSort(header);

      SE.attr?.(root, 'data-se-ns-view', view);
      SE.attr?.(root, 'data-se-ns-sort', sort.key);
      SE.attr?.(root, 'data-se-ns-loading', loading ? '' : null);
      SE.attr?.(root, 'data-se-ns-helpers', hideHelpers ? 'hide' : 'show');

      for (const node of sortButtons) {
        const active = node.dataset.key === sort.key;
        node.setAttribute('aria-pressed', String(active));
        // Redraw only on a flip: innerHTML never reads back as written (<path/> → <path></path>),
        // and swapping the icon under the pointer every frame restarts its hover
        const svg = node.querySelector(`.${OURS}-arrow`);
        if (svg.dataset.dir !== sort.dir) {
          svg.dataset.dir = sort.dir;
          svg.innerHTML = ICONS[sort.dir === 'down' ? 'arrowDown' : 'arrowUp'];
        }
        const order = sort.dir === 'down' ? 'Z to A' : 'A to Z';
        tips.set(node, active ? `Sorted by ${node.dataset.label}, ${order} · click to reverse` : `Sort by ${node.dataset.label}`);
      }

      const helperCount = all.filter(row => rowInfo.get(row)?.helper).length;
      const listed = loading ? 0 : all.filter(row => !isHidden(row)).length;
      for (const node of viewButtons) {
        node.setAttribute('aria-pressed', String(node.dataset.key === view));
        const count = node.dataset.key === 'all' ? listed : selectedCount;
        setText(node.querySelector('b'), count ? count.toLocaleString() : '');
      }

      helpers.setAttribute('aria-pressed', String(hideHelpers));
      helpers.hidden = helperCount === 0 && !loading;
      setText(helpers.querySelector('b'), helperCount ? helperCount.toLocaleString() : '');
      const helperTip = `${helperCount.toLocaleString()} uninstallers, updaters and setup tools`;
      const tip = hideHelpers ? `Hiding ${helperTip} · click to show` : `Showing ${helperTip} · click to hide`;
      tips.set(helpers, tip);
      helpers.setAttribute('aria-label', tip);

      for (const row of all) SE.attr?.(row, 'data-se-owned', isOwned(row) ? '' : null);

      // Letter groups by name, over the rows this view shows
      let previous = null;
      const visible = [];
      for (const row of all) {
        if (!shown(row)) {
          SE.attr?.(row, 'data-se-letter', null);
          continue;
        }
        visible.push(row);
        const letter = sort.key === 'name' ? groupOf(appOf(row)?.strAppName ?? row.querySelector(`:scope > ${C.name}`)?.textContent) : null;
        SE.attr?.(row, 'data-se-letter', letter && letter !== previous ? letter : null);
        previous = letter;
      }

      renderEmpty(visible.length, loading);

      // Reads after the writes above: one layout pass. A path gets its full command line as a
      // tip only while something in it is cut short; a Library tag explains itself.
      tips.prune();
      const onScreen = new Set(visible);
      for (const row of all) {
        const info = rowInfo.get(row);
        if (!info) continue;
        const cut = onScreen.has(row) && [...info.line.children].some(part => part.scrollWidth > part.clientWidth + 1);
        tips.set(info.line, cut ? info.cmdline : null);
        tips.set(info.tag, isOwned(row) ? 'Already in your Library. Adding it again makes a second shortcut.' : null);
      }

      summary.hidden = selectedCount === 0;
      setText(summaryText, `${selectedCount.toLocaleString()} selected`);
      ensureIcon(browse, 'folderAdd');
      ensureIcon(addButton(), 'add');
      SE.attr?.(addButton(), 'data-se-count', selectedCount > 0 ? selectedCount.toLocaleString() : null);
    };

    // Rows and the loader are child-list changes; selection is the checkbox's class; `d`: the
    // sort caret flips by redrawing its path, with no class change
    const change = SE.onChange(root, update, { attributes: ['class', 'd'], characterData: true, ignore: isOurs });
    const { schedule } = change;
    cleanups.push(change.disconnect);

    /* ---------- Keyboard ---------- */

    const move = (from, step) => {
      const targets = shownRows();
      if (!targets.length) return;
      const at = targets.indexOf(from);
      const next =
        at < 0 ? targets[step > 0 ? 0 : targets.length - 1] : targets[Math.min(targets.length - 1, Math.max(0, at + step))];
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: 'nearest' });
    };

    listen(list, 'keydown', (event) => {
      const row = event.target.closest?.(C.row);
      switch (event.key) {
        case 'ArrowDown':
          move(row, 1);
          break;
        case 'ArrowUp':
          move(row, -1);
          break;
        case 'Home':
          move(null, 1);
          break;
        case 'End':
          move(null, -1);
          break;
        case ' ':
          if (!row) return;
          row.click();
          break;
        default:
          return;
      }
      event.preventDefault();
    });

    listen(root, 'keydown', (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      const typing = event.target.matches?.('input, textarea');
      if (key === 'f') {
        event.preventDefault();
        searchInput()?.focus();
        searchInput()?.select();
      } else if (key === 'a' && !typing) {
        event.preventDefault();
        // Programs already in the Library are left out, so Ctrl+A never adds a duplicate
        const picks = shownRows().filter(row => !isOwned(row) || isSelected(row));
        // Ctrl+A again on a fully selected list clears it
        const target = !picks.every(isSelected);
        for (const row of picks) if (isSelected(row) !== target) row.click();
      }
    });

    /* ---------- Mount ---------- */

    SE.attr?.(list, 'tabindex', '0');
    header.after(tools);
    list.after(empty);
    browse?.after(summary);
    SE.mark(root, BUILT);

    // A resize changes which paths are cut short
    const resizer = new ResizeObserver(schedule);
    resizer.observe(list);
    cleanups.push(() => resizer.disconnect());
    // The search box value isn't a mutation
    listen(root, 'input', schedule);

    update();

    let alive = true;
    cleanups.push(() => (alive = false));
    libraryPaths()
      .then(paths => {
        if (!alive) return;
        owned = paths;
        update();
      })
      .catch(err => console.warn('[Steam Enhanced] Add a Non-Steam Game: Library shortcuts', err));

    const nodes = [tools, empty, summary];
    return {
      root,
      update,
      destroy() {
        for (const fn of cleanups.splice(0)) attempt(fn);
        for (const node of nodes) node.remove();
        for (const row of root.querySelectorAll(C.row)) {
          row.querySelectorAll(`:scope > .${OURS}`).forEach(node => node.remove());
          for (const name of ['data-se-letter', 'data-se-helper', 'data-se-owned', 'tabindex']) SE.unmark(row, name);
          rowInfo.delete(row);
        }
        root.querySelectorAll('[data-se-initial]').forEach(node => SE.unmark(node, 'data-se-initial'));
        footer?.querySelectorAll(`svg.${OURS}-btn-icon`).forEach(node => node.remove());
        SE.unmark(list, 'tabindex');
        SE.unmark(addButton(), 'data-se-count');
        for (const name of [BUILT, 'data-se-ns-view', 'data-se-ns-sort', 'data-se-ns-loading', 'data-se-ns-helpers']) {
          SE.unmark(root, name);
        }
      },
    };
  };

  /* ---------- Mounting ---------- */

  /* Steam's layout, checked before anything is added: the parts the view drives must be there */
  const isComplete = (root) =>
    !!root.querySelector(`:scope > ${C.header}`) &&
    !!root.querySelector(`:scope > ${C.list}`) &&
    !!root.querySelector(`:scope > ${C.footer}`);

  const mounted = SE.mount(
    'Add a Non-Steam Game',
    () => [...document.querySelectorAll(C.root)].filter(isComplete),
    createView,
    { throttle: 100, scope: C.root, ignore: isOurs }
  );

  window.__seAddNonSteam = {
    destroy() {
      mounted.destroy();
      document.querySelectorAll(`.${OURS}`).forEach(node => node.remove());
      delete window.__seAddNonSteam;
    },
  };
})(window.__se);
