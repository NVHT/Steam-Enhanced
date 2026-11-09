/*
 * Collapse the Library sidebar header controls into a 7-slot icon bar. Header counts are
 * owned by features/library/game-list.js.
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  const { C } = SE;
  window.__steamEnhancedSidebarIcons?.destroy();

  const roots = new Map();
  let observer;

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
    entry.onKey = event => {
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
      if (search.querySelector('input')?.value) setOpen(root, entry, true);
    }
  };

  const start = () => {
    observer = SE.watch(update);
    update();
  };

  window.__steamEnhancedSidebarIcons = {
    destroy() {
      observer?.disconnect();
      for (const [root, entry] of roots) restoreRoot(root, entry);
      roots.clear();
      removeEventListener('DOMContentLoaded', start);
      delete window.__steamEnhancedSidebarIcons;
    },
  };

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
});
