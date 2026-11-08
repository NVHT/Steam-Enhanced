/* Collapse Library sidebar header controls into a 7-slot icon bar and annotate bracketed counts. */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  const { C } = SE;
  window.__steamEnhancedSidebarIcons?.destroy();

  const roots = new Map();
  let observer;
  let frame = 0;

  function restoreRoot(root, entry) {
    entry.button.remove();
    entry.search.removeEventListener('keydown', entry.onKey);
    root.classList.remove('se-sidebar-icons', 'se-sidebar-search-open');
    for (const [node, label] of entry.labels) {
      node.classList.remove('se-sidebar-tip');
      SE.attr(node, 'aria-label', label);
    }
  }

  const COUNT_RE = /^\(\s*([\d.,\s]+?(?:\s*\/\s*[\d.,\s]+?)?)\s*\)$/;

  const markCounts = () => {
    const headers = document.querySelectorAll(
      `.SectionHeaderContent, .${C.ShowcaseHeader}, .friendGroup .groupName, .${C.CollectionLabel}`
    );
    for (const header of headers) {
      for (const el of header.querySelectorAll('*')) {
        if (el.children.length) continue;
        const match = COUNT_RE.exec(el.textContent.trim());
        SE.attr(el, 'data-se-count', match ? match[1].replace(/\s*\/\s*/, ' / ') : null);
      }
    }
  };

  const update = () => {
    frame = 0;
    markCounts();

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

      let entry = roots.get(root);
      if (!entry) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'se-sidebar-search se-sidebar-tip';
        button.setAttribute('aria-label', 'Search games');
        button.setAttribute('aria-expanded', 'false');
        button.addEventListener('click', () => {
          const open = !root.classList.contains('se-sidebar-search-open');
          root.classList.toggle('se-sidebar-search-open', open);
          button.setAttribute('aria-expanded', String(open));
          if (open) root.querySelector(`.${C.ContainerHide_Container} input`)?.focus();
        });

        const onKey = event => {
          if (event.key === 'Escape' && !search.querySelector('input')?.value) {
            root.classList.remove('se-sidebar-search-open');
            button.setAttribute('aria-expanded', 'false');
            button.focus();
          }
        };

        search.addEventListener('keydown', onKey);
        root.appendChild(button);
        entry = { button, search, onKey, labels: new Map() };
        roots.set(root, entry);
      }

      const targets = [
        [home, home.textContent.trim() || 'Home'],
        [games, games.textContent.trim() || 'Games'],
      ];
      for (const [node, label] of targets) {
        if (!entry.labels.has(node)) entry.labels.set(node, node.getAttribute('aria-label'));
        if (!node.classList.contains('se-sidebar-tip')) node.classList.add('se-sidebar-tip');
        SE.mark(node, 'aria-label', label);
      }

      if (!root.classList.contains('se-sidebar-icons')) {
        root.classList.add('se-sidebar-icons');
      }
      if (search.querySelector('input')?.value && !root.classList.contains('se-sidebar-search-open')) {
        root.classList.add('se-sidebar-search-open');
        entry.button.setAttribute('aria-expanded', 'true');
      }
    }
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  const start = () => {
    observer = SE.watch(schedule, { attributes: ['class'], sync: true });
    schedule();
  };

  window.__steamEnhancedSidebarIcons = {
    destroy() {
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      for (const [root, entry] of roots) restoreRoot(root, entry);
      roots.clear();
      for (const el of document.querySelectorAll('[data-se-count]')) {
        el.removeAttribute('data-se-count');
      }
      removeEventListener('DOMContentLoaded', start);
      delete window.__steamEnhancedSidebarIcons;
    },
  };

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
});
