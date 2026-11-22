/*
 * Header: play bar icons, stat kinds, the game status, the "and N more" developer names,
 * labels, the main button's STOP state and the game logo sized to its visible pixels
 * (--se-logo-crop).
 */
((SE) => {
  const ns = window.__seGamePageParts;
  if (!ns) return;
  const { APP_BUTTONS, ASSOCIATION, drop, NAME, own, RIGHT_CONTROLS, srcOf } = ns;

  const { C, fiber: fiberOf, mark, cssVar: setVar, unmark } = SE;

  const FAVORITE = `.${C.FavoriteButton}`;
  const UNIT = `.${C.MenuButtonContainer}, .${C.PlayBar_MenuButton}, ${FAVORITE}`;
  const TILE = `.${C.PlayBar_MenuButton}, ${FAVORITE}`;
  const holds = (el, sel) => el.matches(sel) || Boolean(el.querySelector(sel));
  const ICONS = [
    ['heart', (el) => Boolean(el.closest(FAVORITE)) || Boolean(el.querySelector(FAVORITE))],
    ['gear', (el) => el.matches(`.${C.MenuButtonContainer}`) && !el.matches('[id], [role="button"]')],
    ['pad', (el) => holds(el, `.${C.ControllerConfigButton}`)],
    ['info', (el) => holds(el, `.${C.GameInfoButton}, .${C.DotDotDot}`)],
  ];

  // Read once per element: measuring every control on each page pass forced a layout each time
  const buttonLike = new WeakMap();
  function isButton(el) {
    if (el.matches(UNIT)) return true;
    let known = buttonLike.get(el);
    if (known === undefined) {
      const r = el.getBoundingClientRect();
      known = r.width >= 20 && r.width <= 64 && r.height >= 20 && r.height <= 64 && Boolean(el.querySelector('svg, img'));
      if (r.width) buttonLike.set(el, known);
    }
    return known;
  }

  function markIcon(el) {
    const tile = el.matches(TILE) ? el : el.querySelector(`:scope > :is(${TILE})`) || el.querySelector(TILE) || el;
    const hit = ICONS.find(([, test]) => test(el));
    if (hit) mark(tile, 'data-se-icon', hit[0]);
    else unmark(tile, 'data-se-icon');
  }

  function placePlayBarIcons() {
    for (const controls of document.querySelectorAll(RIGHT_CONTROLS)) {
      if (!controls.querySelector(APP_BUTTONS)) continue;
      const widget = window.__seHltb?.widgetSelector;
      const walk = (el) => {
        for (const child of el.children) {
          if (widget && child.matches(widget)) continue;
          if (isButton(child)) markIcon(child);
          else walk(child);
        }
      };
      walk(controls);
    }
  }

  /*
   * Play bar stats Steam gives no class of their own. "Space Required" shares Last Played's
   * classes, so it is told apart by its React parents: the stat itself (label, no icon,
   * tooltip or classNames) rendered by a component that reads only `details`, while nothing
   * of the game is on disk. Last Played's parent passes bIsApplicationOrTool; the beta stat
   * has a tooltip.
   */
  const GAME_STAT = `.${C.GameStatsSection} .${C.GameStat}`;

  function statKind(el) {
    let stat = null;
    for (let cur = fiberOf(el), depth = 0; cur && depth < 10; cur = cur.return, depth++) {
      const p = cur.memoizedProps;
      if (!p || typeof p !== 'object') continue;
      if (!stat) {
        if ('label' in p) stat = p;
        continue;
      }
      const d = p.details;
      if (!d) continue;
      const plain = !stat.icon && !stat.classNames && !stat.strTooltip;
      return plain && !('bIsApplicationOrTool' in p) && !d.bHasAnyLocalContent && d.lDiskSpaceRequiredBytes > 0
        ? 'space'
        : null;
    }
    return null;
  }

  function placeStatKinds() {
    for (const el of document.querySelectorAll(GAME_STAT)) {
      const kind = statKind(el);
      if (kind) mark(el, 'data-se-stat', kind);
      else unmark(el, 'data-se-stat');
    }
  }

  /*
   * Game status (Launching, Installing, Update Queued…): Steam's DetailsSection, one markup for
   * every state. Its kind comes from the overview's display_status (EDisplayStatus): busy states
   * turn the theme's spinner ring (.se-spin-arc, so they follow the Loading spinner setting), the
   * rest get a still icon by data-se-status (play-bar.css).
   */
  const STATUS = `.${C.StatusAndStats} > .${C.DetailsSection}`;
  const STATUS_KINDS = new Map([
    ...[1, 2, 3, 5, 6, 7, 8, 36].map((s) => [s, 'busy']),
    ...[19, 23].map((s) => [s, 'queued']),
    ...[18, 22].map((s) => [s, 'paused']),
    ...[20, 24].map((s) => [s, 'required']),
    ...[38, 39].map((s) => [s, 'error']),
    ...[12, 14, 17, 21, 25, 26].map((s) => [s, 'blocked']),
  ]);
  const SPIN = 'se-status-spin';

  function statusKind(section) {
    const overview = SE.fromProps(section, 6, (p) => p.overview);
    if (!overview) return 'busy';
    if (overview.BIsAppBlocked?.()) return 'blocked';
    return STATUS_KINDS.get(overview.selected_per_client_data?.display_status) ?? 'info';
  }

  function placeStatus() {
    for (const section of document.querySelectorAll(STATUS)) {
      const kind = statusKind(section);
      mark(section, 'data-se-status', kind);
      // Only a bar under the status (Starting / Stopping download): no detail text to show
      const value = section.querySelector(`.${C.PlayBarDetailLabel}`);
      if (value && !value.textContent.trim()) mark(section, 'data-se-bare');
      else unmark(section, 'data-se-bare');
      let spin = section.querySelector(`:scope > .${SPIN}`);
      if (kind !== 'busy') {
        drop(spin);
        continue;
      }
      // Appended last: React inserts its own children before ours, and the grid places them all.
      if (!spin) {
        spin = own('span', `${SPIN} se-spin-arc`);
        spin.setAttribute('aria-hidden', 'true');
      }
      if (section.lastElementChild !== spin) section.appendChild(spin);
    }
  }

  const SHOW_FIRST = 1;

  function placeMoreNames() {
    for (const list of document.querySelectorAll(ASSOCIATION)) {
      const hidden = list.querySelectorAll(`:scope > ${NAME}`).length - SHOW_FIRST;
      let link = list.querySelector(':scope > .se-assoc-more');
      if (hidden < 2) {
        drop(link);
        list.classList.remove('se-assoc-collapsed');
        continue;
      }
      if (!link) {
        link = own('button', 'se-assoc-more');
        link.type = 'button';
        link.addEventListener('click', (e) => {
          e.stopPropagation();
          const collapsed = list.classList.toggle('se-assoc-collapsed');
          link.textContent = collapsed ? `and ${list.dataset.seMoreCount} more` : 'show less';
        });
        list.classList.add('se-assoc-collapsed');
      }
      list.dataset.seMoreCount = String(hidden);
      if (list.classList.contains('se-assoc-collapsed')) {
        const labelStr = `and ${hidden} more`;
        if (link.textContent !== labelStr) link.textContent = labelStr;
      }
      if (list.lastElementChild !== link) list.appendChild(link);
    }
  }

  /*
   * The main button's state Steam gives no class for: STOP (this game is running) is drawn
   * like Install (not Green). Marked data-se-action="stop" for play-bar.css's red recipe. The
   * game is the button's own (its props' overview): the client's URL carries no app id.
   */
  const PLAY_CONTAINER = `.${C.PlayButtonContainer}`;
  const PLAY_GREEN = `.${C.Green}`;

  function placePlayAction() {
    for (const el of document.querySelectorAll(PLAY_CONTAINER)) {
      if (!el.matches(PLAY_GREEN) && SE.isRunning(SE.appOf(el)?.appid)) mark(el, 'data-se-action', 'stop');
      else unmark(el, 'data-se-action');
    }
  }

  function placeLabels() {
    for (const labelEl of document.querySelectorAll(`.${C.ConciseContainer_Container} .${C.Label}`)) {
      const word = labelEl.textContent.trim().replace(/\s*[:：]\s*$/, '');
      if (word) mark(labelEl, 'data-se-label', word);
    }
  }

  const LOGO = `.${C.AppDetailsOverviewPanel_Header} .${C.BoxSizer} img.${C.TitleLogo}`;
  const LOGO_CROP = '--se-logo-crop';
  const logoCrops = new Map();
  const logoSources = new WeakMap();
  let logoSizingActive = CSS.supports('object-view-box', 'inset(1%)');

  /*
   * Pixel reads must stay on the CPU. A default 2D canvas is GPU-backed, and reading it back
   * (getImageData) stalls Steam's GPU process; at 4K the whole main window then repaints
   * black for about a second while every tile is rastered again. `willReadFrequently`
   * keeps the canvas in software, and the read waits for an idle moment so it never lands
   * in the frames that draw the page.
   */
  const LOGO_SAMPLE = 512;
  const whenIdle = (fn) => new Promise((resolve, reject) => {
    const run = () => {
      try {
        resolve(fn());
      } catch (error) {
        reject(error);
      }
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 1000 });
    else setTimeout(run, 200);
  });

  function measureLogoCrop(img) {
    const scale = Math.min(1, LOGO_SAMPLE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = Object.assign(document.createElement('canvas'), { width, height });
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return '';
    let data;
    try {
      ctx.drawImage(img, 0, 0, width, height);
      ({ data } = ctx.getImageData(0, 0, width, height));
    } finally {
      // Free the backing store now rather than at the next GC.
      canvas.width = canvas.height = 0;
    }

    let left = width;
    let right = -1;
    let top = height;
    let bottom = -1;
    for (let y = 0, alpha = 3; y < height; y++) {
      for (let x = 0; x < width; x++, alpha += 4) {
        if (!data[alpha]) continue;
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
    if (right < 0) return '';

    // Leave one sample pixel at a cropped edge to protect fine antialiasing.
    const insets = [
      Math.max(0, top - 1) / height,
      Math.max(0, width - right - 2) / width,
      Math.max(0, height - bottom - 2) / height,
      Math.max(0, left - 1) / width,
    ];
    return insets.some(Boolean) ? `inset(${insets.map(value => `${value * 100}%`).join(' ')})` : '';
  }

  async function readLogoCrop(img, source) {
    try {
      return await whenIdle(() => measureLogoCrop(img));
    } catch (error) {
      if (error.name !== 'SecurityError') return '';
    }

    // Steam may load remote artwork without CORS. Try an anonymous copy for pixel access.
    const copy = new Image();
    copy.crossOrigin = 'anonymous';
    copy.src = source;
    try {
      await copy.decode();
      return await whenIdle(() => measureLogoCrop(copy));
    } catch {
      return '';
    }
  }

  function sizeLogo(img) {
    const source = srcOf(img);
    if (logoSources.get(img) === source) return;
    img.style.removeProperty(LOGO_CROP);
    if (!source || !img.complete || !img.naturalWidth) return;

    logoSources.set(img, source);
    if (!logoCrops.has(source)) {
      if (logoCrops.size >= 80) logoCrops.delete(logoCrops.keys().next().value);
      logoCrops.set(source, readLogoCrop(img, source));
    }
    logoCrops.get(source).then(crop => {
      if (crop && logoSizingActive && img.isConnected && img.matches(LOGO) && srcOf(img) === source) {
        setVar(img, LOGO_CROP, crop);
      }
    });
  }

  function sizeLogos() {
    if (logoSizingActive) document.querySelectorAll(LOGO).forEach(sizeLogo);
  }

  function onLogoLoad(event) {
    const img = event.target;
    if (!logoSizingActive || !img.matches?.(LOGO)) return;
    logoSources.delete(img);
    sizeLogo(img);
  }

  /** destroy(): stop sizing logos and forget the measured crops. */
  function stopLogos() {
    logoSizingActive = false;
    logoCrops.clear();
  }

  Object.assign(ns, {
    LOGO_CROP, onLogoLoad, placeLabels, placeMoreNames, placePlayAction, placePlayBarIcons,
    placeStatKinds, placeStatus, sizeLogos, stopLogos,
  });
})(window.__se);
