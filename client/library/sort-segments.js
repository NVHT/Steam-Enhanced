/* Convert Library shelf and collection sort dropdowns into a 4-part segmented control. */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  const { C, fiber: fiberOf, fromProps } = SE;
  window.__steamEnhancedSortSegments?.destroy();

  const SORT_HOST_SELECTOR = `.${C.DragInProgress_SortingDropDown}, .${C.LibraryImageBackgroundGlow_SortingDropDown}`;
  const SEGMENTS = [
    { key: 'az', index: 0 },
    { key: 'recent', index: 4 },
    { key: 'hours', index: 3 },
  ];
  const COPY = {
    az: 'A–Z',
    recent: 'Recent',
    hours: 'Hours',
  };

  const readSortState = host => {
    const ownerProps = fromProps(host, 8, p =>
      typeof p.onSortChangeCallback === 'function' ? p : null
    );
    const dropdown = host.querySelector('.DialogDropDown');
    const menuProps = dropdown && fromProps(dropdown, 8, p => (Array.isArray(p.rgOptions) ? p : null));
    if (!ownerProps || !menuProps || menuProps.rgOptions.length !== 10) return null;
    return { own: ownerProps, options: menuProps.rgOptions, dd: dropdown };
  };

  const mountedHosts = new Map();

  const dropdownController = dd => {
    for (let f = fiberOf(dd), i = 0; f && i < 16; f = f.return, i++) {
      const instance = f.stateNode;
      if (
        instance &&
        typeof instance.HideMenu === 'function' &&
        typeof instance.ToggleMenu === 'function' &&
        instance.element === dd
      ) {
        return instance;
      }
    }
    return null;
  };

  const isEventInsideTrigger = (event, dd) => {
    if (dd.contains(event.target)) return true;
    const rect = dd.getBoundingClientRect();
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      event.clientX >= rect.left &&
      event.clientX < rect.right &&
      event.clientY >= rect.top &&
      event.clientY < rect.bottom
    );
  };

  let closingClick = null;

  const onTriggerPointerDown = event => {
    if (event.button !== 0) return;
    closingClick = null;
    for (const host of mountedHosts.keys()) {
      const dd = readSortState(host)?.dd;
      if (!dd?.isConnected) continue;
      const controller = dropdownController(dd);
      if (!controller?.state?.bOpened) continue;
      const menuEl = controller.m_iMenuInstance?.m_element;
      if (menuEl?.contains(event.target)) continue;
      if (isEventInsideTrigger(event, dd)) {
        closingClick = { dd, until: performance.now() + 1000 };
        event.preventDefault();
        event.stopImmediatePropagation();
        controller.HideMenu();
        return;
      }
      controller.HideMenu();
    }
  };

  const onTriggerClick = event => {
    const pending = closingClick;
    closingClick = null;
    if (
      !pending ||
      performance.now() > pending.until ||
      event.detail === 0 ||
      !pending.dd.isConnected ||
      !isEventInsideTrigger(event, pending.dd)
    ) {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const mountSegments = host => {
    const state = readSortState(host);
    if (!state) return;

    const group = document.createElement('div');
    group.className = 'se-sortseg';
    group.setAttribute('role', 'radiogroup');

    for (const seg of SEGMENTS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'se-seg-btn';
      btn.dataset.seg = seg.key;
      btn.textContent = COPY[seg.key];
      btn.title = state.options[seg.index].label;
      btn.setAttribute('role', 'radio');
      btn.addEventListener('click', event => {
        event.stopPropagation();
        const current = readSortState(host);
        if (!current || btn.getAttribute('aria-checked') === 'true') return;
        current.own.onSortChangeCallback(current.options[seg.index].data);
      });
      group.appendChild(btn);
    }

    state.dd.parentElement.insertBefore(group, state.dd);
    host.dataset.seSortseg = '';
    mountedHosts.set(host, group);
  };

  const syncSegments = (host, group) => {
    const state = readSortState(host);
    if (!state) return;
    const currentVal = state.own.initialValue;
    let isPrimarySegmentActive = false;

    for (const btn of group.children) {
      const seg = SEGMENTS.find(s => s.key === btn.dataset.seg);
      const isSelected = state.options[seg.index].data === currentVal;
      isPrimarySegmentActive ||= isSelected;
      SE.mark(btn, 'aria-checked', String(isSelected));
    }

    const mode = isPrimarySegmentActive ? 'main' : 'other';
    if (host.dataset.seSortseg !== mode) host.dataset.seSortseg = mode;
  };

  const markedReorderRows = new Set();

  /* Steam's own word for "Done" (any locale), with the English one as a fallback */
  let doneLabels = null;
  const doneWords = () => {
    if (doneLabels) return doneLabels;
    doneLabels = new Set(['Done']);
    const localize = SE.global('LocalizeString', fn => typeof fn === 'function');
    for (const token of ['#Button_Done', '#Done']) {
      const word = SE.run(localize, token);
      if (typeof word === 'string' && word && word !== token) doneLabels.add(word.trim());
    }
    return doneLabels;
  };

  const syncReorderHeader = () => {
    const headers = [...document.querySelectorAll(`.${C.ShowcaseHeader}.${C.Reordering}`)];
    for (const row of markedReorderRows) {
      if (!row.isConnected || !headers.length) {
        row.removeAttribute('data-se-reorder-heading');
        markedReorderRows.delete(row);
      }
    }
    if (!headers.length) return;

    let root = headers[0].parentElement;
    while (root && root !== document.body) {
      const words = doneWords();
      const doneBtn = [...root.querySelectorAll('button, [role="button"], .DialogButton')].find(
        el => words.has(el.textContent.trim()) && !el.closest(`.${C.ShowcaseHeader}`)
      );
      if (doneBtn) {
        const row = doneBtn.parentElement;
        if (row && !row.querySelector(`.${C.ShowcaseHeader}`)) {
          SE.mark(row, 'data-se-reorder-heading');
          markedReorderRows.add(row);
        }
        break;
      }
      root = root.parentElement;
    }
  };

  let observer;

  const update = () => {
    syncReorderHeader();
    for (const [host, group] of mountedHosts) {
      if (!host.isConnected || !group.isConnected) {
        group.remove();
        mountedHosts.delete(host);
      }
    }
    for (const host of document.querySelectorAll(SORT_HOST_SELECTOR)) {
      if (!mountedHosts.has(host)) mountSegments(host);
    }
    for (const [host, group] of mountedHosts) {
      syncSegments(host, group);
    }
  };

  const start = () => {
    document.addEventListener('pointerdown', onTriggerPointerDown, true);
    document.addEventListener('click', onTriggerClick, true);
    observer = SE.watch(update, { characterData: true });
    update();
  };

  window.__steamEnhancedSortSegments = {
    destroy() {
      document.removeEventListener('pointerdown', onTriggerPointerDown, true);
      document.removeEventListener('click', onTriggerClick, true);
      closingClick = null;
      observer?.disconnect();
      for (const [host, group] of mountedHosts) {
        group.remove();
        delete host.dataset.seSortseg;
      }
      mountedHosts.clear();
      for (const row of markedReorderRows) {
        row.removeAttribute('data-se-reorder-heading');
      }
      markedReorderRows.clear();
      removeEventListener('DOMContentLoaded', start);
      delete window.__steamEnhancedSortSegments;
    },
  };

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
});
