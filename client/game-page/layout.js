/*
 * Game Details page layout: tags each overview card ([data-se-sec]) and sets its row span
 * (--se-span) so the two-column grid stacks cards without gaps; places the HowLongToBeat card
 * (compat/hltb-for-steam/hltb-for-steam.js) among them.
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedGamePageParts;
  if (!ns) return;
  const { appIdOf, drop, own, schedule } = ns;
  const { live } = ns;

  const { C, esc, fromProps, mark, cssVar: setVar, unmark } = SE;

  live.hltb = undefined;

  const CONTAINER = `.${C.ColumnContainer_Container}`;
  const COLUMNS = `:scope > .${C.ColumnContainer}`;
  const RIGHT = `.${C.RightColumn}`;
  const LEFT = `.${C.LeftColumn}`;
  const SEEK = C.SeekTarget;
  const CONTROLLER = `.${C.ControllerSectionBody}, .${C.ControllerSupportSectionHeader}`;
  const HEADING = `.${C.SectionHeader}`;
  const BODY = `:is(.${C.Body}, .Body)`;
  const RIGHT_CONTROLS = `.${C.RightControls}`;
  const APP_BUTTONS = `.${C.AppButtonsContainer}`;
  const ASSOCIATION = `.${C.ConciseContainer_Container} .${C.Association}`;
  const NAME = `.${C.ConciseContainer_Name}`;

  const NAMES = new Set([
    'friends',
    'additionalcontent',
    'achievements',
    'notes',
    'cards',
    'dlc',
    'workshop',
    'screenshots',
    'review',
    'activityrollup',
    'activity',
    'community',
  ]);

  const sectionName = (el) =>
    fromProps(el, 6, (p) => (typeof p.name === 'string' && NAMES.has(p.name) ? p.name : null));

  function tagSections(c) {
    const cols = c.querySelector(COLUMNS);
    if (!cols) return;
    for (const [col, side] of [
      [cols.querySelector(`:scope > ${RIGHT}`), 'right'],
      [cols.querySelector(`:scope > ${LEFT}`), 'left'],
    ]) {
      if (!col) continue;
      for (const el of col.children) {
        const seek = el.classList.contains(SEEK);
        const name = seek
          ? sectionName(el)
          : side === 'left'
            ? 'notice'
            : el.querySelector(CONTROLLER)
              ? 'controller'
              : 'mastersubincluded';
        if (name) mark(el, 'data-se-sec', name);
        else unmark(el, 'data-se-sec');
      }
    }
  }

  const ROW = 1;
  const GAP = 16;
  live.sizer = undefined;
  live.fitQueued = 0;
  const sized = new Set();

  function pieces(c) {
    const out = [];
    const info = c.querySelector(
      `:scope > .${C.AppGameInfoContainer} > .${C.ConciseContainer_Container} > .${C.InnerContainer}`
    );
    if (info) out.push(...info.children);
    const cols = c.querySelector(COLUMNS);
    if (cols) {
      for (const el of cols.children) {
        if (el.matches(`${RIGHT}, ${LEFT}`)) out.push(...el.children);
        else out.push(el);
      }
    }
    out.push(...c.querySelectorAll(':scope > .se-hltb-card'));
    return out;
  }

  function fit() {
    live.fitQueued = 0;
    const c = document.querySelector(CONTAINER);
    if (!c) return;
    // Batch DOM geometry reads before writing custom properties to avoid layout thrashing.
    const spans = pieces(c).map((el) => [el, el.getBoundingClientRect().height]);
    for (const [el, h] of spans) {
      setVar(el, '--se-span', String(h > 0 ? Math.ceil((h + GAP) / ROW) : 1));
    }
  }

  // Sizes change only through the ResizeObserver (it also reports each piece once on observe).
  function placeSpans(c) {
    if (!live.sizer) {
      live.sizer = new ResizeObserver(() => {
        if (!live.fitQueued) live.fitQueued = requestAnimationFrame(fit);
      });
    }
    for (const el of sized) {
      if (!el.isConnected) {
        live.sizer.unobserve(el);
        sized.delete(el);
      }
    }
    for (const el of pieces(c)) {
      if (!sized.has(el)) {
        sized.add(el);
        live.sizer.observe(el);
      }
    }
  }

  function layout() {
    for (const c of document.querySelectorAll(CONTAINER)) {
      if (!c.querySelector(COLUMNS)) continue;
      for (const step of [tagSections, live.hltb?.place, placeSpans]) {
        try {
          step?.(c);
        } catch (_) {}
      }
    }
  }

  function attachHltb() {
    const integration = window.__steamEnhancedHltb;
    if (!integration) return;
    live.hltb?.destroy();
    live.hltb = integration.createCard({
      C,
      esc,
      mark,
      unmark,
      fromProps,
      appIdOf,
      appStore: SE.appStore,
      own,
      drop,
      schedule,
    });
    schedule();
  }

  Object.assign(ns, {
    APP_BUTTONS, ASSOCIATION, BODY, CONTAINER, HEADING, NAME, RIGHT_CONTROLS, SEEK, attachHltb,
    layout, sized,
  });
});
