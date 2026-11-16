/*
 * Collapse the Library sidebar header controls into a 7-slot icon bar. Header counts are
 * owned by client/library/game-list.js.
 *
 * Recent and Ready to play can be joined by more toggles in their row: Steam's Linux-games
 * toggle (Tux, Linux only) and plugin buttons (ProtonDB Library Badges' dots). The row's tile
 * count goes to --se-view-n on <html> so both toolbars (this one and the title-bar list,
 * client/navigation) lay out a slot for each; Steam's own extra toggle is marked for its icon.
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

  const update = () => {
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
        [games, games.textContent.trim() || 'Games'],
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
    observer = SE.watch(update, { attributes: ['class'] }); // React can rewrite the root's className
    update();
  };

  window.__seSidebarIcons = {
    destroy() {
      observer?.disconnect();
      for (const [root, entry] of roots) restoreRoot(root, entry);
      roots.clear();
      SE.cssVar(ROOT, VIEW_N, null);
      for (const node of document.querySelectorAll(`[${VIEW}]`)) SE.unmark(node, VIEW);
      removeEventListener('DOMContentLoaded', start);
      delete window.__seSidebarIcons;
    },
  };

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
})(window.__se);
