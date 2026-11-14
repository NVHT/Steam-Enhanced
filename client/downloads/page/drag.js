/* Reordering the queue: grips, keyboard moves, and the pointer drag (with Steam's own held off). */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedDownloadsParts;
  if (!ns) return;
  const { C } = SE;
  const { ITEM, PAGE_SELECTOR, QUEUE, RBD_HANDLE, ROW, ROW_ART, appIdFromArt, clickTarget, handlerOf, mountedNodes, press, setAttr, steamDownloads } = ns;
  const { live } = ns;

  // ---------------------------------------------------------------------------------------
  // Queue reordering: a grip on each Up Next row. The row lifts and follows the pointer, the
  // others slide aside, a line marks the landing spot; dropping on the transfer at the top
  // downloads it now. Steam's own drag is held off on these rows so the two never fight.
  // ---------------------------------------------------------------------------------------
  const SORT_SECTION = `${QUEUE} .${C.Section}:not(.${C.Completed})`;
  const GRIP_ICON = '<svg viewBox="0 0 12 20" aria-hidden="true"><circle cx="3" cy="4" r="1.6"/><circle cx="9" cy="4" r="1.6"/>' +
    '<circle cx="3" cy="10" r="1.6"/><circle cx="9" cy="10" r="1.6"/><circle cx="3" cy="16" r="1.6"/><circle cx="9" cy="16" r="1.6"/></svg>';
  const rbdHandles = new Map();

  const itemAppId = (item) => item.getAttribute('data-rbd-draggable-id') || appIdFromArt(item.querySelector(`${ROW_ART} img`)?.currentSrc || item.querySelector(`${ROW_ART} img`)?.src);

  function syncGrips(page) {
    for (const section of page.querySelectorAll(SORT_SECTION)) {
      const items = [...section.querySelectorAll(`:scope ${ITEM}`)].filter((item) => item.querySelector(ROW));
      const sortable = items.length > 1;
      for (const item of items) {
        const card = item.querySelector(ROW);
        let grip = card?.querySelector(':scope > .se-dl-grip');
        if (!sortable || !card) {
          grip?.remove();
          setAttr(card, 'data-se-dl-sortable', null);
          continue;
        }
        if (!grip) {
          grip = document.createElement('button');
          grip.type = 'button';
          grip.className = 'se-dl-grip';
          grip.setAttribute('aria-label', 'Drag to reorder');
          grip.innerHTML = GRIP_ICON;
          grip.addEventListener('pointerdown', startDrag);
          grip.addEventListener('keydown', moveByKey);
          card.prepend(grip);
          mountedNodes.add(grip);
        }
        // A grip is never an action (an earlier build could tag it as one)
        if (grip.hasAttribute('data-se-dl-action')) {
          grip.removeAttribute('data-se-dl-action');
          grip.removeAttribute('data-se-dl-text');
          grip.querySelectorAll('.se-dl-icon, .se-dl-label').forEach((el) => el.remove());
        }
        setAttr(card, 'data-se-dl-sortable', '1');
        // Steam's own drag (react-beautiful-dnd) finds its handle by this attribute; without it
        // Steam never starts a drag of its own here. The value goes back on destroy.
        if (item.hasAttribute(RBD_HANDLE)) {
          rbdHandles.set(item, item.getAttribute(RBD_HANDLE));
          item.removeAttribute(RBD_HANDLE);
        }
      }
    }
  }

  // Steam's queue API: the first reorder call this build has
  // Steam moves a queued app one place at a time; a jump is that many single moves
  function moveInQueue(appid, from, to) {
    const api = steamDownloads();
    const name = to < from ? 'MoveAppUpdateUp' : 'MoveAppUpdateDown';
    if (!appid || from === to || typeof api?.[name] !== 'function') return false;
    for (let step = Math.abs(to - from); step > 0; step--) SE.run(() => api[name](Number(appid)));
    return true;
  }

  // "Download now": Steam's own handler on the row's Download button
  function downloadNow(item) {
    const button = item.querySelector('[data-se-dl-action="download"]');
    const handler = handlerOf(button) || handlerOf(clickTarget(button));
    if (handler) SE.run(() => handler({ type: 'click', target: button, currentTarget: button, preventDefault() {}, stopPropagation() {} }));
    else press(clickTarget(button));
  }

  // Keyboard: arrow keys move the row one place
  function moveByKey(event) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const item = event.currentTarget.closest(ITEM);
    const section = item?.closest(SORT_SECTION);
    const items = [...(section?.querySelectorAll(`:scope ${ITEM}`) || [])];
    const from = items.indexOf(item);
    const to = from + (event.key === 'ArrowUp' ? -1 : 1);
    if (from < 0 || to < 0 || to >= items.length) return;
    event.preventDefault();
    moveInQueue(itemAppId(item), from, to);
  }

  // From the grip: lifts at once
  function startDrag(event) {
    if (event.button !== 0 || live.drag) return;
    event.preventDefault();
    event.stopPropagation();
    beginDrag(event.currentTarget.closest(ITEM), event, event.currentTarget);
  }

  function beginDrag(item, event, captor) {
    const section = item?.closest(SORT_SECTION);
    const page = item?.closest(PAGE_SELECTOR);
    if (!section || !page || live.drag) return;
    const items = [...section.querySelectorAll(`:scope ${ITEM}`)];
    const rects = items.map((el) => el.getBoundingClientRect());
    const from = items.indexOf(item);
    const origin = rects[from];
    const gap = items.length > 1 ? Math.max(0, (rects[1].top - rects[0].bottom)) : 8;

    // The lifted card: a copy that floats above the page, so the scrolling queue cannot clip it
    // on its way to the transfer at the top. The original stays in the list as the landing slot.
    const ghost = item.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    for (const name of ghost.getAttributeNames()) if (name.startsWith('data-rbd-')) ghost.removeAttribute(name);
    ghost.removeAttribute('tabindex');
    ghost.removeAttribute('role');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('data-se-dl-ghost', '');
    Object.assign(ghost.style, { left: `${origin.left}px`, top: `${origin.top}px`, width: `${origin.width}px` });
    section.append(ghost);

    live.drag = {
      item, items, rects, from, to: from, step: origin.height + gap, section, page, ghost,
      startY: event.clientY, pointerId: event.pointerId, captor, now: false,
    };
    SE.run(() => captor.setPointerCapture(event.pointerId));
    setAttr(item, 'data-se-dl-dragging', '1');
    setAttr(section, 'data-se-dl-sorting', '1');
    addEventListener('pointermove', moveDrag, true);
    addEventListener('pointerup', endDrag, true);
    addEventListener('pointercancel', cancelDrag, true);
    addEventListener('keydown', escapeDrag, true);
  }

  function moveDrag(event) {
    if (!live.drag || event.pointerId !== live.drag.pointerId) return;
    const { item, items, rects, from, step, section, page, ghost } = live.drag;
    const dy = event.clientY - live.drag.startY;
    ghost.style.transform = `translateY(${dy}px)`;

    // Above the queue, over the transfer: download now
    const hero = page.querySelector('.se-dlh');
    const box = hero?.getBoundingClientRect();
    live.drag.now = !!box && event.clientY >= box.top && event.clientY < section.getBoundingClientRect().top;
    setAttr(hero, 'data-drop', live.drag.now ? '1' : null);
    setAttr(ghost, 'data-now', live.drag.now ? '1' : null);

    // Landing index: how many of the other cards' middles the lifted card's middle has passed
    const middle = rects[from].top + rects[from].height / 2 + dy;
    let to = 0;
    rects.forEach((rect, index) => {
      if (index !== from && middle > rect.top + rect.height / 2) to++;
    });
    live.drag.to = live.drag.now ? from : to;

    // The others slide aside; the slot moves to where the card will land
    items.forEach((el, index) => {
      let shift = 0;
      if (el === item) shift = (live.drag.to - from) * step;
      else if (index > from && index <= live.drag.to) shift = -step;
      else if (index < from && index >= live.drag.to) shift = step;
      el.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }

  function finishDrag(commit) {
    if (!live.drag) return;
    const { item, items, section, page, ghost, from, to, now, captor, pointerId } = live.drag;
    live.drag = null;
    removeEventListener('pointermove', moveDrag, true);
    removeEventListener('pointerup', endDrag, true);
    removeEventListener('pointercancel', cancelDrag, true);
    removeEventListener('keydown', escapeDrag, true);
    SE.run(() => captor.releasePointerCapture(pointerId));
    ghost.remove();
    setAttr(page.querySelector('.se-dlh'), 'data-drop', null);
    if (commit && now) downloadNow(item);
    else if (commit && to !== from) moveInQueue(itemAppId(item), from, to);
    // Settle back; Steam re-renders the new order
    setAttr(item, 'data-se-dl-dragging', null);
    setAttr(section, 'data-se-dl-sorting', null);
    for (const el of items) el.style.transform = '';
  }

  const endDrag = (event) => live.drag && event.pointerId === live.drag.pointerId && finishDrag(true);
  const cancelDrag = () => finishDrag(false);
  const escapeDrag = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      finishDrag(false);
    }
  };

  // The whole card drags too (past a few pixels, so a click is still a click). Steam's own drag
  // on queue cards stays off: it would run alongside this one and drop on targets this layout
  // hides. Listening on the window, in capture, gets ahead of Steam's handlers.
  const DRAG_SLOP = 5;
  let pending = null;
  const NATIVE_DRAG_EVENTS = ['dragstart', 'mousedown', 'pointerdown', 'touchstart'];

  const holdNativeDrag = (event) => {
    const target = event.target;
    const item = target instanceof Element && target.closest(`${SORT_SECTION} ${ITEM}`);
    if (!item || item.hasAttribute('data-se-dl-ghost')) return;
    if (target.closest('.se-dl-grip, [data-se-dl-action], [data-se-dl-bar]')) return;
    if (event.type === 'dragstart' || event.type === 'mousedown') event.preventDefault();
    event.stopPropagation();
    if (event.type === 'pointerdown' && event.button === 0 && !live.drag && item.querySelector('.se-dl-grip')) {
      pending = { item, x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    }
  };

  const watchPending = (event) => {
    if (!pending || event.pointerId !== pending.pointerId) return;
    if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) < DRAG_SLOP) return;
    const { item, y } = pending;
    pending = null;
    beginDrag(item, { clientY: y, pointerId: event.pointerId }, item);
    moveDrag(event);
  };
  const dropPending = () => {
    pending = null;
  };

  Object.assign(ns, { NATIVE_DRAG_EVENTS, SORT_SECTION, dropPending, finishDrag, holdNativeDrag, rbdHandles, syncGrips, watchPending });
});
