/*
 * Collapse the Library sidebar header controls into a 7-slot icon bar. Header counts are
 * owned by client/library/game-list.js.
 *
 * Recent and Ready to play can be joined by more toggles in their row: Steam's Linux-games
 * toggle (Tux, Linux only) and plugin buttons (ProtonDB Library Badges' dots). The row's tile
 * count goes to --se-view-n on <html> so this toolbar lays out a slot for each; Steam's own
 * extra toggle is marked for its icon. While the list shows, the whole row sits in the title-bar
 * search (client/navigation/nav-rail.js measures it).
 */
((SE) => {
  const { C } = SE;
  window.__seSidebarIcons?.destroy();

  const roots = new Map();
  let observer;

  const ROOT = document.documentElement;
  const VIEW_N = '--se-view-n';
  const VIEW = 'data-se-view';
  // Steam shows the OS toggle only on its own platform; it is drawn with the Linux icon only there.
  const OS_VIEW = /Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent) ? 'linux' : null;

  /*
   * Recent and Ready to play are the row's first two children. A native toggle after them is
   * Steam's OS toggle; a plugin's is wrapped (ProtonDB's .pdb-dots-toggle), so not marked.
   */
  const syncViewToggles = (root) => {
    const bar = root.querySelector(`.${C.CheckboxWithImage}`)?.parentElement;
    if (!bar) return;
    const toggles = [...bar.children];
    SE.cssVar(ROOT, VIEW_N, toggles.length > 2 ? String(toggles.length) : null);
    toggles.forEach((node, i) => {
      const native = i > 1 && node.classList.contains(C.CheckboxWithImage);
      SE.attr(node, VIEW, native ? OS_VIEW : null);
    });
  };

  function restoreRoot(root, entry) {
    entry.button.remove();
    entry.search.removeEventListener('keydown', entry.onKey);
    root.classList.remove('se-sidebar-icons', 'se-sidebar-search-open');
    for (const [node, label] of entry.labels) {
      node.classList.remove('se-sidebar-tip');
      SE.attr(node, 'aria-label', label);
    }
  }

  const setOpen = (root, entry, open) => {
    root.classList.toggle('se-sidebar-search-open', open);
    SE.mark(entry.button, 'aria-expanded', String(open));
  };

  const mount = (root, search) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'se-sidebar-search se-sidebar-tip';
    button.setAttribute('aria-label', 'Search games');
    button.setAttribute('aria-expanded', 'false');
    const entry = { button, search, labels: new Map() };

    button.addEventListener('click', () => {
      const open = !root.classList.contains('se-sidebar-search-open');
      setOpen(root, entry, open);
      if (open) search.querySelector('input')?.focus();
    });
    entry.onKey = (event) => {
      if (event.key === 'Escape' && !search.querySelector('input')?.value) {
        setOpen(root, entry, false);
        button.focus();
      }
    };
    search.addEventListener('keydown', entry.onKey);
    root.appendChild(button);
    roots.set(root, entry);
    return entry;
  };

  /*
   * The game-type menu (the picker's dropdown, Steam's own): each row is marked so
   * sidebar-icons.css can draw it in the Settings menu's language. A row is Steam's
   * DialogCheckbox_Container (role="checkbox", aria-checked): a DialogCheckbox box (its click
   * target, drawn as the type's icon), then a label: ViewName "Games" with a hidden AppCount
   * "(4409)" inside it, or a plain span for "Group by Collection" (in a tool-tip wrapper).
   * A summary goes first (syncTypeSummary). Marked: data-se-type (games, soundtracks, software, videos, tools, group; read from the
   * text, not the order, so a missing type doesn't shift the icons), data-se-part (box, name,
   * count), data-se-type-count (the number, which the name draws after it) and data-se-on.
   */
  const TYPE = 'data-se-type';
  const PART = 'data-se-part';
  const ON = 'data-se-on';
  const COUNT = 'data-se-type-count';
  const TYPE_WORDS = [
    ['collection', 'group'],
    ['soundtrack', 'soundtracks'],
    ['software', 'software'],
    ['video', 'videos'],
    ['tool', 'tools'],
    ['game', 'games'],
  ];
  const typeOf = (text) => TYPE_WORDS.find(([word]) => text.includes(word))?.[1] || null;

  /*
   * The menu's summary, first in the panel: how many apps the list shows (the on types'
   * counts added up; Games' when none is on, which Steam then lists), how many types are on,
   * and whether it's grouped. Rewritten only when
   * it changes.
   */
  function syncTypeSummary(menu) {
    const rows = [...menu.querySelectorAll(`[${TYPE}]`)];
    const types = rows.filter((row) => row.getAttribute(TYPE) !== 'group');
    if (!types.length) return;
    // With no type ticked, Steam still lists games: the summary says so instead of "0"
    const ticked = types.filter((row) => row.hasAttribute(ON));
    const on = ticked.length ? ticked : types.filter((row) => row.getAttribute(TYPE) === 'games');
    const shown = on.reduce((sum, row) => {
      const n = row.querySelector(`[${COUNT}]`)?.getAttribute(COUNT).replace(/,/g, '');
      return sum + (Number(n) || 0);
    }, 0);
    const grouped = rows.some((row) => row.getAttribute(TYPE) === 'group' && row.hasAttribute(ON));
    let summary = menu.querySelector(':scope > .se-type-summary');
    if (!summary) {
      summary = SE.el('div', 'se-type-summary');
      summary.append(SE.el('span', 'se-type-summary-title'), SE.el('span', 'se-type-summary-line'));
    }
    if (menu.firstElementChild !== summary) menu.prepend(summary);
    SE.setText(summary.firstElementChild, `Showing ${shown.toLocaleString('en')}`);
    SE.setText(
      summary.lastElementChild,
      (ticked.length ? `${ticked.length} of ${types.length} types` : 'Games, by default') +
        (grouped ? ' · grouped' : '')
    );
  }

  function markTypeMenus() {
    for (const row of document.querySelectorAll(`.${C.DropDown} .${C.Row}`)) {
      SE.attr(row, TYPE, typeOf(row.textContent.trim().toLowerCase()));
      const box = row.querySelector('.DialogCheckbox');
      const count = row.querySelector(`.${C.AppCount}`);
      const name =
        row.querySelector(`.${C.ViewName}`) || row.querySelector(`.${C.className_className4} > span`);
      SE.attr(box, PART, 'box');
      SE.attr(name, PART, 'name');
      SE.attr(count, PART, 'count');
      const digits = (count || row).textContent.match(/\d[\d,.]*/)?.[0].replace(/[,.]/g, '');
      SE.attr(name, COUNT, digits ? Number(digits).toLocaleString('en') : null);
      // On: Steam's box wears Active, the row aria-checked; either says so (they can land in
      // separate renders, and the menu is read between them)
      const on = box?.classList.contains('Active') || row.getAttribute('aria-checked') === 'true';
      SE.attr(row, ON, on ? '' : null);
    }
    for (const menu of document.querySelectorAll(`.${C.DropDown}`)) syncTypeSummary(menu);
  }

  const update = () => {
    markTypeMenus();
    for (const [root, entry] of roots) {
      if (!root.isConnected) {
        restoreRoot(root, entry);
        roots.delete(root);
      }
    }

    for (const root of document.querySelectorAll(`.${C.GameListHomeAndSearch_Container}`)) {
      const home = root.querySelector(`.${C.HomeBox} a`);
      const games = root.querySelector(`.${C.MenuHeader}`);
      const search = root.querySelector(`.${C.ContainerHide_Container}`);
      if (!home || !games || !search || !root.querySelector(`.${C.AdvancedSearchButton}`)) continue;

      const entry = roots.get(root) || mount(root, search);
      for (const [node, label] of [
        [home, home.textContent.trim() || 'Home'],
        // The tip names the control and what it shows now: "Game type: Games"
        [games, `Game type: ${games.textContent.trim() || 'Games'}`],
      ]) {
        if (!entry.labels.has(node)) entry.labels.set(node, node.getAttribute('aria-label'));
        node.classList.add('se-sidebar-tip');
        SE.mark(node, 'aria-label', label);
      }

      root.classList.add('se-sidebar-icons');
      syncViewToggles(root);
      if (search.querySelector('input')?.value) setOpen(root, entry, true);
    }
  };

  const start = () => {
    // React can rewrite the root's className; a menu row's state is its box's class and its
    // aria-checked
    observer = SE.watch(update, { attributes: ['class', 'aria-checked'] });
    update();
  };

  window.__seSidebarIcons = {
    destroy() {
      observer?.disconnect();
      for (const [root, entry] of roots) restoreRoot(root, entry);
      roots.clear();
      SE.cssVar(ROOT, VIEW_N, null);
      for (const node of document.querySelectorAll(`[${VIEW}]`)) SE.unmark(node, VIEW);
      for (const node of document.querySelectorAll('.se-type-summary')) node.remove();
      for (const attr of [TYPE, PART, ON, COUNT]) {
        for (const node of document.querySelectorAll(`[${attr}]`)) node.removeAttribute(attr);
      }
      removeEventListener('DOMContentLoaded', start);
      delete window.__seSidebarIcons;
    },
  };

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
})(window.__se);
