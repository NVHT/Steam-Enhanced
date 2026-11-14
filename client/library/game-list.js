/*
 * Game list helpers: give every row one status icon (downloading, queued, running) at its end,
 * with Steam's own words as its tooltip (client/header/header-tooltips.js draws
 * [data-se-tip]), sync each downloading row's progress, and own the bracketed counts of the
 * library's headers ("(12)" → data-se-count="12"), drawn by the CSS without the brackets.
 * Styled in client/library/game-list.css.
 */
((SE) => {
  const { C } = SE;
  window.__seGameList?.destroy();

  /* Collection headers in the list carry the count in their own element */
  const SECTION_COUNT = `.${C.HoverOverlay_Container} .${C.SectionCount}`;
  /* Elsewhere it is a leaf somewhere inside the header */
  const COUNT_HEADERS = `.SectionHeaderContent, .${C.ShowcaseHeader}, .${C.CollectionLabel}`;
  const ROW_SELECTOR = `.${C.AppIconDownloading_Container}`;
  const ENTRY_SELECTOR = `.${C.GameListEntryContainer}`;
  const STATUS_COLUMN = `.${C.StatusIcon}`;
  const LABEL_SELECTOR = `.${C.DownloadProgress}`;
  const ICON_CLASS = 'se-gl-status';
  const COUNT_RE = /\(\s*([\d.,\s]+?(?:\s*\/\s*[\d.,\s]+?)?)\s*\)/;
  const LEAF_COUNT_RE = new RegExp(`^${COUNT_RE.source}$`);

  const activeEntries = new Set();
  const icons = new Set();
  const counted = new Set();

  /* "1% (310.2 Mbps)" → { value: 1, pct: "1%", rate: "310.2 Mbps" } */
  const parseLabel = (text) => {
    const match = /(\d+(?:[.,]\d+)?)\s*%/.exec(text || '');
    if (!match) return null;
    const value = Math.max(0, Math.min(100, parseFloat(match[1].replace(',', '.'))));
    const rate = /\(\s*([^()]*?\d[^()]*?)\s*\)/.exec(text)?.[1] || null;
    return { value, pct: `${match[1]}%`, rate };
  };

  /* What a row is doing, and how its tooltip reads */
  const statusOf = (row) => {
    const text = (row.querySelector(LABEL_SELECTOR)?.textContent || '').trim();
    const progress = parseLabel(text);
    if (progress) {
      return {
        state: 'downloading',
        tip: ['Downloading', progress.pct, progress.rate].filter(Boolean).join(' · '),
        value: progress.value,
      };
    }
    if (row.classList.contains(C.AppIconDownloading_Running)) {
      return { state: 'running', tip: text || 'Running' };
    }
    if (row.classList.contains(C.AppIconDownloading_Updating)) {
      return { state: 'queued', tip: text || 'Queued' };
    }
    return null;
  };

  const dropIcon = (icon) => {
    icon.remove();
    icons.delete(icon);
  };

  /*
   * One icon per row, inside Steam's status column (after the friends icon). Rows are
   * recycled as the list scrolls, so each pass sets or removes it from the row's current state.
   * Returns the icon, or null.
   */
  const syncIcon = (row, entry, status) => {
    /* Steam's status column; the entry itself on a row drawn without one */
    const column = row.querySelector(STATUS_COLUMN) || entry;
    let icon = row.querySelector(`.${ICON_CLASS}`);
    if (icon && (!status || icon.parentElement !== column)) {
      dropIcon(icon);
      icon = null;
    }
    if (!status || !column) return null;
    if (!icon) {
      icon = document.createElement('span');
      icon.className = ICON_CLASS;
      icon.setAttribute('role', 'img');
      icon.setAttribute('data-se-tip-dir', 'top');
      column.appendChild(icon);
      icons.add(icon);
    }
    SE.mark(icon, 'data-se-state', status.state);
    SE.mark(icon, 'data-se-tip', status.tip);
    SE.mark(icon, 'aria-label', status.tip);
    return icon;
  };

  const setCount = (el, match) => {
    if (match) {
      SE.mark(el, 'data-se-count', match[1].trim().replace(/\s*\/\s*/, ' / '));
      counted.add(el);
    } else if (counted.delete(el)) {
      SE.unmark(el, 'data-se-count');
    }
  };

  const markCounts = () => {
    for (const el of counted) if (!el.isConnected) counted.delete(el);
    for (const el of document.querySelectorAll(SECTION_COUNT)) setCount(el, COUNT_RE.exec(el.textContent || ''));
    for (const header of document.querySelectorAll(COUNT_HEADERS)) {
      for (const el of header.querySelectorAll('*')) {
        if (!el.childElementCount && !el.matches(SECTION_COUNT)) setCount(el, LEAF_COUNT_RE.exec(el.textContent.trim()));
      }
    }
  };

  const update = () => {
    markCounts();

    const currentEntries = new Set();
    for (const row of document.querySelectorAll(ROW_SELECTOR)) {
      const entry = row.matches(ENTRY_SELECTOR) ? row : row.querySelector(ENTRY_SELECTOR);
      const status = statusOf(row);
      const icon = syncIcon(row, entry, status);
      if (status?.state !== 'downloading') continue;
      /* The icon's ring reads it from the entry; a row without one keeps it on the icon */
      const target = entry || icon;
      if (!target) continue;
      SE.cssVar(target, '--se-dl-pct', `${status.value}%`);
      currentEntries.add(target);
    }

    for (const entry of activeEntries) {
      if (!currentEntries.has(entry)) SE.cssVar(entry, '--se-dl-pct', null);
    }
    activeEntries.clear();
    for (const entry of currentEntries) activeEntries.add(entry);

    for (const icon of icons) {
      if (!icon.isConnected) icons.delete(icon);
    }
  };

  /*
   * Class changes catch a game starting or stopping; throttled, as the watch is document-wide.
   * The icon's own attributes are not watched, so marking it never feeds back.
   */
  const watcher = SE.watch(update, { characterData: true, attributes: ['class'], throttle: 150 });
  update();

  window.__seGameList = {
    destroy() {
      watcher.disconnect();
      for (const entry of activeEntries) SE.cssVar(entry, '--se-dl-pct', null);
      activeEntries.clear();
      for (const icon of icons) icon.remove();
      icons.clear();
      for (const el of counted) SE.unmark(el, 'data-se-count');
      counted.clear();
    },
  };
})(window.__se);
