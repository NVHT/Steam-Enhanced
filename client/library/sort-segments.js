/*
 * The sort control of a Library shelf and a collection page (Steam's sort bar, its SortingDropDown):
 * one "<icon> <order> ⌄" button opening the theme's picker (SE.picker, client/shared/picker.js)
 * with every order Steam offers, the current one marked. The orders, their names (in Steam's
 * language) and the change are Steam's own: read from the bar's props and handed back through its
 * onSortChangeCallback, so Steam's dropdown stays hidden as the source of truth
 * (client/library/sort-segments.css).
 */
((SE) => {
  const { C, fromProps } = SE;
  window.__seSortSegments?.destroy();

  const SORT_HOST_SELECTOR = `.${C.DragInProgress_SortingDropDown}, .${C.LibraryImageBackgroundGlow_SortingDropDown}`;

  // The bar's change and current order, and its dropdown's orders (Steam offers ten)
  const readSortState = (host) => {
    const own = fromProps(host, 8, (p) => (typeof p.onSortChangeCallback === 'function' ? p : null), { live: true });
    const dropdown = host.querySelector('.DialogDropDown');
    const menu = dropdown && fromProps(dropdown, 8, (p) => (Array.isArray(p.rgOptions) ? p : null), { live: true });
    if (!own || !menu || menu.rgOptions.length !== 10) return null;
    return { own, options: menu.rgOptions, dropdown };
  };

  // Each order's icon, by Steam's sort id (its ESortOption: 1 Alphabetical … 11 Steam Review)
  const ICONS = {
    1: 'sort-az', 2: 'trophy', 3: 'refresh', 4: 'clock', 5: 'play', 6: 'calendar',
    7: 'library', 8: 'drive', 9: 'chart', 10: 'friends', 11: 'thumb',
  };

  const currentIndex = (state) => state.options.findIndex((option) => option.data === state.own.initialValue);

  const mounted = new Map(); // host → its button

  const mount = (host) => {
    const state = readSortState(host);
    if (!state) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'se-pick-btn';
    button.setAttribute('aria-haspopup', 'dialog');
    button.innerHTML = '<span class="se-pick-btn-icon"></span><span class="se-pick-btn-value"></span>';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const now = readSortState(host);
      if (!now) return;
      SE.picker.open(button, {
        title: 'Sort by',
        single: true,
        current: () => String(currentIndex(readSortState(host) || now)),
        items: () => [{ label: '', rows: now.options.map((option, i) => ({ id: String(i), name: option.label, icon: ICONS[option.data] })) }],
        onChoose: (id) => {
          const latest = readSortState(host);
          const option = latest?.options[Number(id)];
          if (option && option.data !== latest.own.initialValue) SE.run(() => latest.own.onSortChangeCallback(option.data));
        },
      });
    });
    state.dropdown.parentElement.insertBefore(button, state.dropdown);
    host.dataset.seSortseg = '';
    mounted.set(host, button);
  };

  // The button shows the current order: its icon and name (the word "Sort" only for screen readers)
  const sync = (host, button) => {
    const state = readSortState(host);
    const option = state?.options[currentIndex(state)];
    const name = option?.label || '';
    const value = button.querySelector('.se-pick-btn-value');
    if (value.textContent !== name) value.textContent = name;
    const icon = ICONS[option?.data] || 'sort-az';
    if (button.dataset.icon !== icon) {
      button.dataset.icon = icon;
      button.style.setProperty('--se-pick-btn-icon', `var(--se-icon-${icon})`);
    }
    const label = `Sort by ${name}`;
    if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
  };

  let observer;

  const update = () => {
    for (const [host, button] of mounted) {
      if (host.isConnected && button.isConnected) continue;
      button.remove();
      mounted.delete(host);
    }
    for (const host of document.querySelectorAll(SORT_HOST_SELECTOR)) {
      if (!mounted.has(host)) mount(host);
    }
    for (const [host, button] of mounted) sync(host, button);
  };

  const start = () => {
    observer = SE.watch(update, { characterData: true });
    update();
  };

  window.__seSortSegments = {
    destroy() {
      observer?.disconnect();
      for (const [host, button] of mounted) {
        button.remove();
        delete host.dataset.seSortseg;
      }
      mounted.clear();
      removeEventListener('DOMContentLoaded', start);
      delete window.__seSortSegments;
    },
  };

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
})(window.__se);
