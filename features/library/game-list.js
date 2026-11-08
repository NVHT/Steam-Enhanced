/*
 * Game list helpers: strip the brackets from collection counts, sync each downloading row's
 * progress, and give every row one status icon (downloading, queued, running) at its end, with
 * Steam's own words as its tooltip (features/header/header-tooltips.js draws [data-se-tip]).
 * Styled in features/library/game-list.css.
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  const { C } = SE;
  window.__steamEnhancedGameList?.destroy();

  const COUNT_SELECTOR = `.${C.HoverOverlay_Container} .${C.SectionCount}`;
  const ROW_SELECTOR = `.${C.AppIconDownloading_Container}`;
  const ENTRY_SELECTOR = `.${C.GameListEntryContainer}`;
  const STATUS_COLUMN = `.${C.StatusIcon}`;
  const LABEL_SELECTOR = `.${C.DownloadProgress}`;
  const ICON_CLASS = 'se-gl-status';

  const activeEntries = new Set();
  const icons = new Set();

  /* "1% (310.2 Mbps)" → { value: 1, pct: "1%", rate: "310.2 Mbps" } */
  const parseLabel = text => {
    const match = /(\d+(?:[.,]\d+)?)\s*%/.exec(text || '');
    if (!match) return null;
    const value = Math.max(0, Math.min(100, parseFloat(match[1].replace(',', '.'))));
    const rate = /\(\s*([^()]*?\d[^()]*?)\s*\)/.exec(text)?.[1] || null;
    return { value, pct: `${match[1]}%`, rate };
  };

  /* What a row is doing, and how its tooltip reads */
  const statusOf = row => {
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

  /*
   * One icon per row, inside Steam's status column (after the friends icon). Rows are
   * recycled as the list scrolls, so each pass sets or removes it from the row's current state.
   */
  const syncIcon = (row, status) => {
    /* Steam's status column; the entry itself on a row drawn without one */
    const column = row.querySelector(STATUS_COLUMN) || row.querySelector(ENTRY_SELECTOR);
    let icon = row.querySelector(`.${ICON_CLASS}`);
    if (icon && icon.parentElement !== column) {
      icon.remove();
      icons.delete(icon);
      icon = null;
    }
    if (!status || !column) {
      if (icon) {
        icon.remove();
        icons.delete(icon);
      }
      return;
    }
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
    const pct = status.value == null ? '' : `${status.value}%`;
    if (icon.style.getPropertyValue('--se-dl-pct') !== pct) {
      if (pct) icon.style.setProperty('--se-dl-pct', pct);
      else icon.style.removeProperty('--se-dl-pct');
    }
  };

  const update = () => {
    for (const el of document.querySelectorAll(COUNT_SELECTOR)) {
      const match = /\(\s*([\d\s/,.]+?)\s*\)/.exec(el.textContent || '');
      SE.attr(el, 'data-se-count', match ? match[1] : null);
    }

    const currentEntries = new Set();
    for (const row of document.querySelectorAll(ROW_SELECTOR)) {
      const status = statusOf(row);
      syncIcon(row, status);

      const entry = row.matches(ENTRY_SELECTOR) ? row : row.querySelector(ENTRY_SELECTOR);
      if (!entry || status?.state !== 'downloading') continue;
      const pct = `${status.value}%`;
      if (entry.style.getPropertyValue('--se-dl-pct') !== pct) entry.style.setProperty('--se-dl-pct', pct);
      currentEntries.add(entry);
    }

    for (const entry of activeEntries) {
      if (!currentEntries.has(entry)) entry.style.removeProperty('--se-dl-pct');
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

  window.__steamEnhancedGameList = {
    destroy() {
      watcher.disconnect();
      for (const entry of activeEntries) entry.style.removeProperty('--se-dl-pct');
      for (const icon of icons) icon.remove();
      icons.clear();
    },
  };
});
