/*
 * Game list drag and drop.
 *
 * - Drop zones. Steam's zones ("drag here to remove from …", "drag and hold here to view All
 *   Collections", "… to add to …") exist only while a game is dragged and have no class of
 *   their own to rely on; they are found by their dashed outline inside the library. Restyling
 *   and moving Steam's own elements kept failing on what surrounds them (the paint layer they
 *   live in, fades, clipping), so they are hidden (data-se-dropzone) and the theme draws its own
 *   cards instead: a tray across the top of the game list (.se-gd-tray), one card per zone,
 *   remove first, each showing a copy of Steam's words. The drag events a card receives are
 *   handed on to its Steam zone (dragenter, dragover, dragleave, drop), so Steam still decides
 *   what a drop does and runs its own "hold" timer.
 * - The dragged row dims (data-se-dragsource) and <html data-se-gamedrag> is set for the drag.
 * - Steam's full-size cover ghost is hidden and a compact chip follows the pointer instead:
 *   the game's icon and name, with a count when several selected games move together, tinted
 *   by the card under it.
 * Styled in features/library/game-drag.css.
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  window.__steamEnhancedGameDrag?.destroy();
  if (!document.body) return;

  const { C, esc } = SE;
  const ENTRY = `.${C.GameListEntryContainer}`;
  const NAME = `.${C.GameListEntryName}`;
  const SELECTED = `.${C.AppIconDownloading_Selected}`;
  const LIBRARY = `.${C.AchievementsOverlayContainer_Container}`;
  const LIST = `.${C.LeftListSizableContainer}`;
  const LIST_HEAD = `.${C.GameListHomeAndSearch_Container}`;
  const ZONE = 'data-se-dropzone';
  const OVER = 'data-se-over';
  const SOURCE = 'data-se-dragsource';
  const ACTIVE = 'data-se-gamedrag';
  const MIN_ZONE_W = 60;
  const MIN_ZONE_H = 28;
  /* Descendants checked per mutated node; zones are shallow, a re-rendered page is not */
  const INSPECT_LIMIT = 240;
  /* Steam's zones stay hidden this long after a drag, past their own fade-out */
  const RELEASE_MS = 900;
  const SCROLL_CLIMB = 14;
  const docRoot = document.documentElement;

  let session = null;

  /* ---------- Finding Steam's zones ---------- */

  const rgb = value => (/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(value) || []).slice(1).map(Number);

  /* A dashed outline on the element or its ::before, as Steam draws a drop zone */
  const dashedColor = el => {
    for (const pseudo of [null, '::before']) {
      const style = getComputedStyle(el, pseudo);
      if (style.borderTopStyle === 'dashed') return style.borderTopColor;
      if (style.outlineStyle === 'dashed') return style.outlineColor;
    }
    return null;
  };

  const classify = color => {
    const [r = 0, g = 0, b = 0] = rgb(color);
    return r > g + 40 && r > b + 40 ? 'remove' : 'add';
  };

  const adopt = (zone, kind) => {
    zone.setAttribute(ZONE, kind);
    session.zones.set(zone, buildCard(zone, kind));
    scheduleLayout();
  };

  const consider = el => {
    if (!session || session.zones.has(el) || el.closest(`${ENTRY}, .se-gd-ghost, .se-gd-tray`)) return;
    if (el.parentElement?.closest(`[${ZONE}]`)) return;
    /* Hidden by a previous drag and not yet released: still a zone */
    const kept = el.getAttribute(ZONE);
    if (kept) return adopt(el, kept);
    if (el.offsetWidth < MIN_ZONE_W || el.offsetHeight < MIN_ZONE_H) return;
    const color = dashedColor(el);
    if (color) adopt(el, classify(color));
  };

  const inspect = node => {
    if (node.nodeType !== 1) return;
    consider(node);
    const all = node.getElementsByTagName('*');
    for (let i = 0; i < all.length && i < INSPECT_LIMIT; i++) consider(all[i]);
  };

  /* Everything in the library except the rows themselves (hundreds, never a zone) */
  const scanAll = root => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: node => (node.matches(ENTRY) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) consider(node);
  };

  const onMutations = records => {
    if (!session) return;
    for (const record of records) {
      const zone = record.target.nodeType === 1 ? record.target.closest(`[${ZONE}]`) : record.target.parentElement?.closest(`[${ZONE}]`);
      if (zone && session.zones.has(zone)) {
        session.stale.add(zone);
        continue;
      }
      if (record.type === 'attributes') inspect(record.target);
      else for (const node of record.addedNodes) inspect(node);
    }
    for (const zone of session.zones.keys()) {
      if (!zone.isConnected) {
        session.zones.get(zone).remove();
        session.zones.delete(zone);
      }
    }
    scheduleLayout();
  };

  /* ---------- The theme's cards ---------- */

  /* Steam's words (and the game's icon) inside the card; nothing in it takes the pointer */
  const fillCard = (card, zone) => {
    const body = card.querySelector('.se-gd-words');
    body.replaceChildren(...[...zone.childNodes].map(node => node.cloneNode(true)));
    for (const el of body.querySelectorAll('[id]')) el.removeAttribute('id');
  };

  const buildCard = (zone, kind) => {
    const card = document.createElement('div');
    card.className = 'se-gd-card';
    card.dataset.kind = kind;
    card.innerHTML = '<i class="se-gd-icon" aria-hidden="true"></i><div class="se-gd-words"></div>';
    fillCard(card, zone);
    for (const [type, handler] of CARD_EVENTS) card.addEventListener(type, event => handler(event, zone, card));
    return card;
  };

  /*
   * A drag event on a card, handed to its Steam zone: same data (dataTransfer) and the zone's
   * center as the position. Returns whether Steam's handler accepted it (preventDefault).
   */
  const forward = (type, event, zone) => {
    const r = zone.getBoundingClientRect();
    const copy = new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      dataTransfer: event.dataTransfer,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
      screenX: event.screenX,
      screenY: event.screenY,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    });
    zone.dispatchEvent(copy);
    return copy.defaultPrevented;
  };

  const setOver = card => {
    if (!session || session.over === card) return;
    session.over?.removeAttribute(OVER);
    session.over = card;
    card?.setAttribute(OVER, '');
    SE.attr(session.ghost, 'data-se-tone', card?.dataset.kind);
  };

  const CARD_EVENTS = [
    [
      'dragenter',
      (event, zone, card) => {
        event.preventDefault();
        forward('dragenter', event, zone);
        setOver(card);
      },
    ],
    [
      'dragover',
      (event, zone) => {
        /* Only what Steam accepts can be dropped here */
        if (forward('dragover', event, zone)) event.preventDefault();
      },
    ],
    [
      'dragleave',
      (event, zone, card) => {
        forward('dragleave', event, zone);
        if (session?.over === card) setOver(null);
      },
    ],
    [
      'drop',
      (event, zone) => {
        event.preventDefault();
        forward('drop', event, zone);
        end();
      },
    ],
  ];

  /* ---------- Tray layout ---------- */

  const scrollerOf = entry => {
    for (let node = entry.parentElement, i = 0; node && node !== document.body && i < SCROLL_CLIMB; node = node.parentElement, i++) {
      const { overflowY } = getComputedStyle(node);
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    }
    return null;
  };

  const listArea = entry => {
    const area = scrollerOf(entry) || entry.closest(LIST);
    return area ? { area, head: entry.closest(LIST)?.querySelector(LIST_HEAD) || null } : null;
  };

  /* The rows' box (under the list column's Home/search header, if the box includes it) */
  const measureList = list => {
    if (!list?.area.isConnected) return null;
    const box = list.area.getBoundingClientRect();
    const head = list.head?.isConnected ? list.head.getBoundingClientRect() : null;
    const top = head && head.bottom > box.top && head.bottom < box.bottom - 80 ? head.bottom : box.top;
    return box.width ? { left: box.left, top, width: box.width } : null;
  };

  const layoutZones = () => {
    if (!session) return;
    session.layout = 0;
    const { tray } = session;

    for (const zone of session.stale) if (session.zones.has(zone)) fillCard(session.zones.get(zone), zone);
    session.stale.clear();

    const cards = [...session.zones.entries()]
      .filter(([zone]) => zone.isConnected)
      .sort(([, a], [, b]) => (a.dataset.kind === 'remove' ? 0 : 1) - (b.dataset.kind === 'remove' ? 0 : 1))
      .map(([, card]) => card);
    const box = measureList(session.list) || session.box;
    if (box) session.box = box;
    if (!cards.length || !box) {
      tray.hidden = true;
      return;
    }

    tray.style.left = `${box.left}px`;
    tray.style.top = `${box.top}px`;
    tray.style.width = `${box.width}px`;
    tray.style.setProperty('--se-gd-count', String(cards.length));
    if (cards.some((card, i) => tray.children[i] !== card) || tray.childElementCount !== cards.length) {
      tray.replaceChildren(...cards);
    }
    tray.hidden = false;
  };

  const scheduleLayout = () => {
    if (session && !session.layout) session.layout = requestAnimationFrame(layoutZones);
  };

  /* ---------- Ghost ---------- */

  /*
   * Steam blanks the browser's drag image and draws its own: the game's full cover in a layer
   * that follows the pointer, over the very list being dropped on. That layer is looked for
   * near the pointer for the first moments of the drag: among what Steam added to the page
   * since the drag began, then among images in a fixed or pointer-transparent layer. Once found
   * it is hidden (data-se-steamghost) and the theme's chip follows the pointer in its place,
   * tinted by the zone under it. Until then, or if Steam's cover can't be reached, the chip
   * stays hidden, so there is never a second ghost.
   */
  const STEAM_GHOST = 'data-se-steamghost';
  const HOTSPOT = 18; /* the chip's icon center */
  const GHOST_SEARCH_MS = 1500;
  const GHOST_REACH = 120;
  const GHOST_CLIMB = 6;
  const GHOST_MIN = 40;
  const GHOST_MAX = 520;
  const ADDED_LIMIT = 60;
  const RECENT_BODY_CHILDREN = 6;

  const isSelected = entry =>
    Boolean(entry.matches(SELECTED) || entry.closest(SELECTED) || entry.querySelector(SELECTED));

  /* Rows are virtualized: only drawn rows can be counted, so the count is a floor */
  const selectionSize = (entry, root) =>
    isSelected(entry) ? Math.max(1, root.querySelectorAll(`${LIST} ${SELECTED}`).length) : 1;

  const buildGhost = (entry, count) => {
    const icon = entry.querySelector('img')?.currentSrc || '';
    const name = (entry.querySelector(NAME) || entry).textContent.trim();
    const ghost = document.createElement('div');
    ghost.className = 'se-gd-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.innerHTML =
      '<span class="se-gd-chip">' +
      (icon ? `<img src="${esc(icon)}" alt="">` : '<i class="se-gd-noicon"></i>') +
      `<span class="se-gd-name">${esc(name)}</span>` +
      (count > 1 ? `<b class="se-gd-count">${count}</b>` : '') +
      '</span>';
    document.body.appendChild(ghost);
    return ghost;
  };

  const near = (rect, x, y) =>
    rect.width >= GHOST_MIN &&
    rect.height >= GHOST_MIN &&
    rect.width <= GHOST_MAX &&
    rect.height <= GHOST_MAX &&
    x >= rect.left - GHOST_REACH &&
    x <= rect.right + GHOST_REACH &&
    y >= rect.top - GHOST_REACH &&
    y <= rect.bottom + GHOST_REACH;

  const excluded = el => Boolean(el.closest(`${ENTRY}, [${ZONE}], .se-gd-ghost, .se-gd-tray, [${STEAM_GHOST}]`));

  const hasArt = el => el.tagName === 'IMG' || el.tagName === 'CANVAS' || getComputedStyle(el).backgroundImage.includes('url(');

  /* The element that moves: the nearest fixed (or pointer-transparent absolute) ancestor */
  const movingLayer = el => {
    for (let node = el, i = 0; node && node !== document.body && i <= GHOST_CLIMB; node = node.parentElement, i++) {
      const style = getComputedStyle(node);
      if (style.position === 'fixed') return node;
      if (style.position === 'absolute' && style.pointerEvents === 'none') return node;
    }
    return null;
  };

  const findSteamGhost = (x, y) => {
    /* What Steam mounted for this drag: added since, or just before (portals go last in body) */
    const recent = [...document.body.children].slice(-RECENT_BODY_CHILDREN);
    for (const node of [...session.added, ...recent]) {
      if (!node.isConnected || excluded(node)) continue;
      const candidates = [node, ...[...node.getElementsByTagName('*')].slice(0, ADDED_LIMIT)];
      for (const el of candidates) {
        if (!hasArt(el) || !near(el.getBoundingClientRect(), x, y)) continue;
        const layer = movingLayer(el);
        if (layer && near(layer.getBoundingClientRect(), x, y)) return layer;
      }
    }
    /* Already mounted before the drag began, only shown now */
    for (const img of document.images) {
      if (excluded(img) || !near(img.getBoundingClientRect(), x, y)) continue;
      const layer = movingLayer(img);
      if (layer && near(layer.getBoundingClientRect(), x, y)) return layer;
    }
    return null;
  };

  const onBodyMutations = records => {
    if (!session) return;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === 1 && session.added.length < ADDED_LIMIT) session.added.push(node);
      }
    }
  };

  const moveGhost = () => {
    if (!session) return;
    session.move = 0;
    const { ghost, x, y } = session;
    ghost.style.transform = `translate3d(${x - HOTSPOT}px, ${y - HOTSPOT}px, 0)`;
    if (!session.steamGhost?.isConnected && performance.now() < session.searchUntil) {
      session.steamGhost = findSteamGhost(x, y);
      session.steamGhost?.setAttribute(STEAM_GHOST, '');
    }
    SE.attr(ghost, 'data-se-away', session.steamGhost?.isConnected ? null : '');
  };

  const track = (x, y) => {
    /* Some dragover events report 0,0 */
    if (!session || (!x && !y)) return;
    session.x = x;
    session.y = y;
    if (!session.move) session.move = requestAnimationFrame(moveGhost);
  };

  /* ---------- Session ---------- */

  /* Steam fades its zones out after a drag; they stay hidden until gone or past that fade */
  const releaseLater = zones => {
    setTimeout(() => {
      for (const zone of zones) {
        if (session?.zones.has(zone)) continue;
        zone.removeAttribute(ZONE);
      }
    }, RELEASE_MS);
  };

  const end = () => {
    if (!session) return;
    const { observer, bodyObserver, zones, tray, entry, frame, move, layout, ghost, steamGhost } = session;
    session = null;
    cancelAnimationFrame(frame);
    cancelAnimationFrame(move);
    cancelAnimationFrame(layout);
    observer.disconnect();
    bodyObserver.disconnect();
    releaseLater([...zones.keys()]);
    tray.remove();
    entry.removeAttribute(SOURCE);
    steamGhost?.removeAttribute(STEAM_GHOST);
    docRoot.removeAttribute(ACTIVE);
    ghost.setAttribute('data-se-away', '');
    setTimeout(() => ghost.remove(), 200);
  };

  /* Bubble phase on window: Steam's own dragstart (React, at its root) has already run */
  const onDragStart = event => {
    if (!event.isTrusted) return;
    end();
    const entry = event.target?.closest?.(ENTRY) || event.target?.querySelector?.(ENTRY);
    const root = entry?.closest(LIBRARY);
    if (!entry || !root) return;

    const tray = document.createElement('div');
    tray.className = 'se-gd-tray';
    tray.hidden = true;
    document.body.appendChild(tray);

    session = {
      entry,
      tray,
      zones: new Map(),
      stale: new Set(),
      over: null,
      observer: new MutationObserver(onMutations),
      bodyObserver: new MutationObserver(onBodyMutations),
      added: [],
      frame: 0,
      move: 0,
      layout: 0,
      x: 0,
      y: 0,
      ghost: buildGhost(entry, selectionSize(entry, root)),
      list: listArea(entry),
      box: null,
      steamGhost: null,
      startedAt: performance.now(),
      searchUntil: performance.now() + GHOST_SEARCH_MS,
    };
    session.ghost.setAttribute('data-se-away', '');
    entry.setAttribute(SOURCE, '');
    docRoot.setAttribute(ACTIVE, '');
    session.box = measureList(session.list);
    session.observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    session.bodyObserver.observe(document.body, { childList: true, subtree: true });
    const { bodyObserver } = session;
    setTimeout(() => bodyObserver.disconnect(), GHOST_SEARCH_MS);
    /* Zones Steam drew in the same task as the dragstart, before the observer existed */
    session.frame = requestAnimationFrame(() => session && scanAll(root));
    track(event.clientX, event.clientY);
  };

  /* The theme's own handed-on events (untrusted) are not the user's pointer */
  const onDragOver = event => {
    if (!session || !event.isTrusted) return;
    if (!event.target?.closest?.('.se-gd-card')) setOver(null);
    track(event.clientX, event.clientY);
  };

  /* Leaving the window (no element to enter) */
  const onDragLeave = event => {
    if (!session || !event.isTrusted || event.relatedTarget) return;
    setOver(null);
    session.ghost.setAttribute('data-se-away', '');
  };

  /* A drop on a card ends the session in the card's handler, after handing it on */
  const onDrop = event => {
    if (event.isTrusted && !event.target?.closest?.('.se-gd-card')) end();
  };

  const onDragEnd = event => {
    if (event.isTrusted) end();
  };

  /*
   * dragend goes to the source row, which Steam may have re-rendered away mid-drag, so the
   * first mouse move after a drag ends the session too (none fire during one; the grace period
   * skips a move delivered just as the drag begins).
   */
  const onMouseMove = () => {
    if (session && performance.now() - session.startedAt > 250) end();
  };

  const listeners = [
    ['dragstart', onDragStart, false],
    ['dragover', onDragOver, true],
    ['dragleave', onDragLeave, true],
    ['drop', onDrop, true],
    ['dragend', onDragEnd, true],
    ['mousemove', onMouseMove, true],
  ];

  for (const [type, fn, capture] of listeners) window.addEventListener(type, fn, capture);

  window.__steamEnhancedGameDrag = {
    destroy() {
      end();
      for (const [type, fn, capture] of listeners) window.removeEventListener(type, fn, capture);
      for (const el of document.querySelectorAll('.se-gd-ghost, .se-gd-tray')) el.remove();
      for (const el of document.querySelectorAll(`[${ZONE}]`)) el.removeAttribute(ZONE);
      delete window.__steamEnhancedGameDrag;
    },
  };
});
