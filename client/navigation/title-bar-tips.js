/*
 * Navigation, part 3 of 4 (window.__seNavParts; client/navigation/title-bar-search.js names the
 * parts): Steam's own tips for title-bar controls, moved under the control they belong to, and
 * the game-type menu's counts (each row's, and the total the list header shows).
 */
((SE) => {
  const ns = window.__seNavParts;
  if (!ns) return;
  const { C, railMode } = SE;

  /* Virtualized rows and collection headers: their hover/selection churn never matters here */
  const LIST_ROWS = SE.inside(`.${C.AppIconDownloading_Container}, .${C.HoverOverlay_Container}`);

  // Reposition native tooltips beneath title-bar controls
  const TOOLTIP_SELECTOR = `.${C.ToolTipCustom}, .${C.TextToolTip}`;
  let hoveredElement = null;
  let tipObserver;

  const titleBarBottom = () =>
    document.querySelector(`.${C.TopBar}`)?.getBoundingClientRect().bottom || 48;

  function onMouseOver(event) {
    hoveredElement = event.target instanceof Element ? event.target : null;
  }

  const resolveTitleBarControl = (el) => {
    if (!el?.isConnected) return null;
    const rect = el.getBoundingClientRect();
    return rect.top < titleBarBottom() - 2 &&
      rect.bottom > 0 &&
      rect.height <= 64 &&
      rect.width <= 480
      ? el
      : null;
  };

  function positionTitleBarTooltip(tip) {
    if (!railMode()) return;
    const hovered = resolveTitleBarControl(hoveredElement);
    if (!hovered) return;

    const anchor =
      hovered.closest(
        `.${C.CheckboxWithImage}, .${C.MenuHeader}, .se-list-toggle, .se-list-top, .se-title-search, [role=button], button`
      ) || hovered;

    let container = null;
    for (let node = tip; node && node !== document.body; node = node.parentElement) {
      if (node.contains(anchor)) break;
      const pos = getComputedStyle(node).position;
      if ((pos === 'absolute' || pos === 'fixed') && node.getBoundingClientRect().width > 0) {
        container = node;
        break;
      }
    }
    if (!container) {
      container = tip;
      container.style.setProperty('position', 'fixed', 'important');
      container.style.setProperty('z-index', 'var(--se-z-popover, 1000)', 'important');
    }

    const anchorRect = anchor.getBoundingClientRect();
    const boxRect = container.getBoundingClientRect();
    if (!boxRect.width || boxRect.width > 480 || boxRect.height > 320 || anchorRect.height > 64) {
      return;
    }

    // Under its control, centred on it (core/runtime.js SE.tipSpot)
    const desired = SE.tipSpot(anchorRect, boxRect.width, boxRect.height, 'bottom');

    if (Math.abs(boxRect.top - desired.top) < 1 && Math.abs(boxRect.left - desired.left) < 1) {
      return;
    }

    for (const [prop, val] of [
      ['bottom', 'auto'],
      ['right', 'auto'],
      ['transform', 'none'],
      ['margin', '0'],
    ]) {
      container.style.setProperty(prop, val, 'important');
    }

    let left = desired.left;
    let top = desired.top;
    for (let pass = 0; pass < 2; pass++) {
      container.style.setProperty('left', `${left}px`, 'important');
      container.style.setProperty('top', `${top}px`, 'important');
      const currentRect = container.getBoundingClientRect();
      const dx = desired.left - currentRect.left;
      const dy = desired.top - currentRect.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) break;
      left += Math.round(dx);
      top += Math.round(dy);
    }
  }

  function inspectGameTypeMenu(menu) {
    let total = 0;
    let hasActive = false;
    let gamesCount = null;
    for (const row of menu.querySelectorAll(`.${C.Row}`)) {
      const countEl = row.querySelector(`.${C.AppCount}`);
      if (!countEl) continue;
      const digits = countEl.textContent.replace(/[^\d]/g, '');
      const formatted = digits ? Number(digits).toLocaleString('en') : '';
      SE.mark(countEl, 'data-se-n', formatted);
      if (digits && /^games/i.test(row.textContent.trim())) gamesCount = Number(digits);
      if (digits && row.querySelector('.DialogCheckbox.Active')) {
        total += Number(digits);
        hasActive = true;
      }
    }
    // No type ticked: Steam lists games, so the count is Games' (as the menu's summary says)
    if (!hasActive && gamesCount !== null) {
      total = gamesCount;
      hasActive = true;
    }
    if (hasActive) ns.titleBar.setViewCount(total);
  }

  function observeTooltips() {
    /*
     * Records from the list rows are dropped by `ignore`; class changes are kept for the
     * game-type menu's checkboxes, which are inspected only when a record touches the menu.
     */
    tipObserver = SE.watch(
      records => {
        const menu = document.querySelector(`.${C.DropDown}`);
        if (menu && records.some(({ target }) => menu.contains(target) || target.contains(menu))) {
          inspectGameTypeMenu(menu);
        }
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (!(node instanceof Element)) continue;
            const tip = node.matches(TOOLTIP_SELECTOR) ? node : node.querySelector(TOOLTIP_SELECTOR);
            if (tip) {
              requestAnimationFrame(() => {
                positionTitleBarTooltip(tip);
                setTimeout(() => positionTitleBarTooltip(tip), 80);
              });
            }
          }
        }
      },
      { attributes: ['class'], records: true, ignore: LIST_ROWS }
    );
    document.addEventListener('mouseover', onMouseOver, true);
  }

  ns.LIST_ROWS = LIST_ROWS;
  ns.tips = {
    start: observeTooltips,
    destroy() {
      document.removeEventListener('mouseover', onMouseOver, true);
      tipObserver?.disconnect();
    },
  };
})(window.__se);
