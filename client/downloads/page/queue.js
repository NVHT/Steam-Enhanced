/*
 * The queue rows' action buttons: icons, tagging and the per-row action bar.
 */
((SE) => {
  const ns = window.__seDownloadsParts;
  if (!ns) return;
  const { C } = SE;
  const { LINKS_ROW, ROW, SEL, SVG_NS, mountedNodes, setAttr, textOf } = ns;

  // Page buttons (settings, queue actions, section actions): tagged by role and given the
  // theme's dual-tone icon, so the CSS styles them as one tile set whatever classes Steam uses
  // A queue entry: Steam's draggable wrapper around the card (react-beautiful-dnd's handle)
  const ITEM = `.${C.SectionItemWrapper}`;
  const RBD_HANDLE = 'data-rbd-drag-handle-context-id';
  const QUEUE = `.${C.ItemLists}`;
  const QUEUE_ROW_SELECTOR = `${QUEUE} ${ROW}`;
  const SECTION_TITLE_SELECTOR = `.${C.SectionTitle}`;
  const SETTINGS_SELECTOR = `.${C.SettingsButton} .${C.DiskGraph_Button}`;
  const ACTION_ICON = {
    settings: '<path class="tone" d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/>' +
      '<path d="M10.3 3.5h3.4l.5 2.4 1.7 1 2.3-.8 1.7 2.9-1.8 1.7v1.9l1.8 1.7-1.7 2.9-2.3-.8-1.7 1-.5 2.4h-3.4l-.5-2.4-1.7-1-2.3.8-1.7-2.9 1.8-1.7v-1.9L3.9 9l1.7-2.9 2.3.8 1.7-1z"/>' +
      '<circle cx="12" cy="12" r="3"/>',
    download: '<path class="tone" d="M4.5 15.5h15v3a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5z"/>' +
      '<path d="M12 4v10m-4-4 4 4 4-4M4.5 15.5v3A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5v-3"/>',
    remove: '<circle class="tone" cx="12" cy="12" r="8.5"/>' +
      '<circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6m0-6-6 6"/>',
    play: '<path class="tone" d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.3-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z"/>' +
      '<path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.3-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z"/>',
  };

  // "remove" before "play": a row's Play label never names removal, the reverse can
  function actionIcon(el) {
    const label = `${el.getAttribute('aria-label') || ''} ${el.title || ''} ${textOf(el)}`.toLowerCase();
    if (el.matches(`.${C.RemoveFromQueue}`) || /remove|cancel|delete/.test(label)) return 'remove';
    if (el.matches(`.${C.PlayButton}`) || /\bplay\b/.test(label)) return 'play';
    if (/clear/.test(label)) return 'clear';
    return 'download';
  }

  // Labelled section actions (Clear all) keep just their label; Download now gains one, like
  // Steam's Install button
  function tagAction(el, icon) {
    setAttr(el, 'data-se-dl-action', icon);
    let label = el.querySelector(':scope > .se-dl-label');
    if (icon === 'download' && !textOf(el)) {
      if (!label) {
        label = document.createElement('span');
        label.className = 'se-dl-label';
        label.textContent = 'Download';
        el.append(label);
        mountedNodes.add(label);
      }
    } else {
      label?.remove();
    }
    setAttr(el, 'data-se-dl-text', textOf(el) || el.querySelector(':scope > .se-dl-label') ? '1' : null);
    let svg = el.querySelector(':scope > svg.se-dl-icon');
    if (icon === 'clear') {
      svg?.remove();
      return;
    }
    if (svg?.dataset.icon === icon) return;
    if (!svg) {
      svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('class', 'se-dl-icon');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      el.prepend(svg);
      mountedNodes.add(svg);
    }
    svg.dataset.icon = icon;
    svg.innerHTML = ACTION_ICON[icon];
  }

  // A control: a button-like element (tag, role, tab stop or Steam's button classes)
  const CONTROL = `button, [role="button"], [tabindex], .DialogButton, .${C.ActiveItemLiveRegion_Button}, .${C.PlayButton}`;
  const ROW_NAME = SEL.name;
  const ROW_ART = `.${C.AppPortrait}`;

  // A row's actions: each outermost control in the row that is not the row's own body (it
  // holds neither the name nor the art) and has a box. Steam draws some icons with CSS, so an
  // svg is not required.
  function rowControls(scope) {
    const controls = [];
    for (const el of scope.querySelectorAll(CONTROL)) {
      if (el.querySelector(ROW_NAME) || el.querySelector(ROW_ART) || el.closest(ROW_ART)) continue;
      if (el.closest(`${LINKS_ROW}, ${SEL.bar}, .se-dl-icon, .se-dl-grip`)) continue;
      let outer = true;
      for (let up = el.parentElement; up && up !== scope; up = up.parentElement) {
        if (up.matches(CONTROL) && !up.querySelector(ROW_NAME)) {
          outer = false;
          break;
        }
      }
      if (outer && (el.hasAttribute('data-se-dl-action') || el.getClientRects().length)) controls.push(el);
    }
    return controls;
  }

  // The innermost box holding every action: pinned to the row's end, always shown
  function actionBar(controls, scope) {
    let bar = controls[0]?.parentElement;
    while (bar && bar !== scope && !controls.every((el) => bar.contains(el))) bar = bar.parentElement;
    return bar && bar !== scope ? bar : null;
  }

  // Batched as reads (every row's controls), writes (tags), one measure pass, then the
  // reserved widths, so a long queue costs two layouts per frame rather than one per row
  function tagActions(page) {
    const rows = [...page.querySelectorAll(QUEUE_ROW_SELECTOR)].map((row) => {
      const scope = row.closest(ITEM) || row;
      return { row, scope, controls: rowControls(scope), bar: null };
    });
    const settings = page.querySelector(SETTINGS_SELECTOR);
    if (settings) tagAction(settings, 'settings');
    for (const title of page.querySelectorAll(SECTION_TITLE_SELECTOR)) {
      for (const el of title.querySelectorAll(CONTROL)) {
        if (!el.parentElement.closest(CONTROL) && textOf(el)) tagAction(el, actionIcon(el));
      }
    }
    for (const entry of rows) {
      const { scope, controls } = entry;
      // Unlabelled Steam icons: the last icon-only control is remove (✕ ends every row), the
      // others start the download now
      const iconOnly = controls.filter((el) => !textOf(el) && !el.querySelector(':scope > .se-dl-label'));
      for (const el of controls) {
        let icon = actionIcon(el);
        if (icon === 'download' && el === iconOnly[iconOnly.length - 1]) icon = 'remove';
        tagAction(el, icon);
      }
      for (const el of scope.querySelectorAll('[data-se-dl-bar]')) {
        if (!controls.some((control) => el.contains(control))) el.removeAttribute('data-se-dl-bar');
      }
      entry.bar = actionBar(controls, scope);
      if (entry.bar) setAttr(entry.bar, 'data-se-dl-bar', '1');
    }
    // Room at the row's end for the bar: the state text stops 20px short of it
    const widths = rows.map(({ bar }) => (bar ? Math.ceil(bar.getBoundingClientRect().width) + 20 : 0));
    rows.forEach(({ row }, index) => SE.cssVar(row, '--dl-actions-w', `${widths[index]}px`));
  }

  Object.assign(ns, { ITEM, QUEUE, RBD_HANDLE, ROW_ART, tagActions });
})(window.__se);
