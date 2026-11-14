/*
 * Toasts: clicks and hovers on the dock, scanning for new toasts, the watchers.
 *
 * Part of client/toasts/ (see context.js).
 */
((SE) => {
  const ns = window.__seToastsParts;
  if (!ns) return;
  const { mark, run, unmark } = SE;
  const { ADOPT_TIMEOUT_MS, ON_ATTR, SRC_ATTR, WAIT_ATTR, activeEntry, add, alive, byKey, closed, describe, entryById, finish, fit, held, hoverSteam, hub, inDock, isStage, keyOf, letGo, notify, openEntries, pendingKeys, play, root, skipped, slotFor, sync, templateOf, watchPlace } = ns;
  const { live } = ns;

  /* ---------- Events (stage window) ---------- */

  function onDockClick(e) {
    const thumb = e.target.closest('.se-tst-thumb');
    if (thumb) return play(Number(thumb.dataset.id));

    const layer = e.target.closest('.se-tst-layer');
    const m = layer && entryById(Number(layer.dataset.id));
    if (!m || m.done) return undefined;

    if (e.target.closest('.se-tst-sweep')) return finish(m, 'close button');

    // Steam's toast may live in another toast window: its elements and handlers still work
    // from here, as long as that window is open.
    const usable = !m.stale && alive(m.win);
    const act = e.target.closest('[data-se-tst-act]');
    if (act) {
      const b = m.buttons[Number(act.dataset.seTstAct)];
      if (usable && b?.el?.isConnected) run(() => b.el.click());
      return finish(m, 'action');
    }

    // The toast itself: Steam's own click (opens the chat, game, store page...), then the
    // theme's friend-chat forwarding, as when the native toast is clicked.
    if (usable && m.click?.isConnected) {
      run(() => m.click.click());
      run(() => (m.win.__seFriendNotificationClicks || window.__seFriendNotificationClicks)?.forward?.(m.click));
    }
    return finish(m, 'click');
  }

  function onDockAnimationEnd(e) {
    if (e.animationName === 'se-tst-fill') {
      const layer = e.target.closest('.se-tst-layer');
      const cur = activeEntry();
      if (cur && layer && Number(layer.dataset.id) === cur.id) finish(cur, 'countdown');
    } else if (e.animationName === 'se-tst-close' && e.target === live.tray && hub().closing) {
      closed();
    }
  }

  // Hovering the tray pauses the countdown (CSS); the hub keeps the time so a new stage agrees.
  function onTrayHover(e) {
    const h = hub();
    if (!e.target.closest?.('.se-tst-tray')) return;
    if (e.type === 'pointerover' && !h.pausedAt && h.active) {
      h.pausedAt = Date.now();
      hoverSteam(true);
    } else if (e.type === 'pointerout' && h.pausedAt && !live.tray?.contains(e.relatedTarget)) {
      h.startedAt += Date.now() - h.pausedAt;
      h.pausedAt = 0;
      hoverSteam(false);
    }
  }

  /* ---------- Scanning this window's Steam toasts ---------- */

  function scan() {
    if (!document.body) return;
    const found = new Map();
    for (const el of document.body.querySelectorAll('*')) {
      if (inDock(el)) continue;
      const key = keyOf(el);
      if (key !== null && !found.has(key)) found.set(key, el); // document order: the first hit is the toast's root
    }
    if (isStage() && live.tray?.hasAttribute('data-show')) {
      fit();
      watchPlace();
    }
    live.lastScan = { at: new Date().toISOString(), elements: document.body.getElementsByTagName('*').length, toasts: found.size, read: [] };

    const now = Date.now();
    noteUnreadable(found, now);
    for (const [key, src] of found) {
      if (skipped.has(key)) continue;
      const m = byKey.get(key);
      if (m && !m.done) {
        refresh(m, key, src);
        continue;
      }
      if (m) continue; // finished; Steam just hasn't removed it yet
      const info = describe(key, src);
      live.lastScan.read.push({ kind: info.kind, title: info.title, text: info.text, template: !!templateOf(src) });
      if (info.title) {
        pendingKeys.delete(key);
        add(key, src, info);
      } else if (!pendingKeys.has(key)) {
        pendingKeys.set(key, now);
      } else if (now - pendingKeys.get(key) > ADOPT_TIMEOUT_MS) {
        letGo(key, src, pendingKeys.get(key));
        unmark(root, WAIT_ATTR);
        pendingKeys.delete(key);
        skipped.add(key);
      }
    }

    // Toasts Steam dropped: the one playing finishes on its own timer, queued ones are kept a while.
    for (const [k, m] of byKey) {
      if (found.has(k)) continue;
      if (!m.done && !m.stale) {
        m.stale = true;
        m.rev++;
        notify();
      }
      // Finished toasts are forgotten once Steam has removed them too (never replayed before that).
      if (m.done) byKey.delete(k);
    }

    // Steam's own drawing goes out of sight only while every toast it has is on the stage.
    const all = found.size > 0 && [...found.keys()].every(k => byKey.has(k));
    SE.attr(root, ON_ATTR, all || null);
  }

  // Text on screen but no notification found behind it: say so once, with what React holds.
  let unseenSince = 0;
  let probeWarned = false;
  function noteUnreadable(found, now) {
    if (found.size || probeWarned || !document.body.innerText.trim()) {
      unseenSince = 0;
      return;
    }
    if (!unseenSince) unseenSince = now;
    else if (now - unseenSince > ADOPT_TIMEOUT_MS) {
      probeWarned = true;
      console.warn('[Steam Enhanced] Toasts: no notification data found, Steam\'s toasts stay as they are.', JSON.stringify(ns.probe(), null, 1));
    }
  }

  // A grouped toast (more messages from one friend) changes in place: follow it.
  function refresh(m, key, src) {
    if (src !== m.src) {
      unmark(m.src, SRC_ATTR);
      m.src = src;
      mark(src, SRC_ATTR);
    }
    const info = describe(key, src);
    m.buttons = info.buttons;
    m.click = info.click;
    m.dismiss = info.dismiss || m.dismiss;
    if (!info.title || (info.title === m.title && info.text === m.text && info.icon === m.seenIcon)) return;
    Object.assign(m, { title: info.title, text: info.text, seenIcon: info.icon, icon: info.icon || m.icon });
    m.rev++;
    // New content: Steam restarts its timer, and so does the stage if it's playing this one.
    if (info.ms) m.deadline = Date.now() + info.ms;
    const h = hub();
    if (m.id === h.active) {
      h.startedAt = Date.now();
      h.pausedAt = 0;
      h.slot = slotFor(m, h, openEntries().length);
      h.playRev++;
    }
    notify();
  }

  /* ---------- Lifecycle ---------- */

  const busy = () => hub().entries.length > 0 || pendingKeys.size > 0 || unseenSince > 0;
  const step = () => {
    scan();
    sync();
  };

  // Steam closed this toast window: its queued toasts stay queued (without their buttons),
  // and if it was the stage, the next newest window takes over.
  function onPageHide() {
    const h = hub();
    // Steam closed it on its own timer (the theme hadn't dismissed it): Steam doesn't wait.
    const own = [...byKey.values()];
    if (!live.dismissedByUs && own.length) {
      const first = Math.min(...own.map(e => e.born));
      h.steamCloses.push({ window: window.name, after: Date.now() - first, steamMs: own[0].steamMs, held: own.some(e => held(e.key)) });
      if (h.steamCloses.length > 6) h.steamCloses.shift();
      h.timerHeld = false;
    }
    for (const e of h.entries) if (e.win === window && !e.done) e.stale = true;
    const i = h.wins.indexOf(window);
    if (i >= 0) h.wins.splice(i, 1);
    if (h.stage === window) h.stage = null;
    const others = h.wins.filter(alive);
    // The last toast window: nothing is left to show the queue, so it ends here.
    if (!others.length) {
      h.entries.splice(0);
      Object.assign(h, { active: 0, open: false, closing: false, pausedAt: 0 });
    }
    for (const w of others) run(() => w.__seToasts?.wake?.());
  }

  Object.assign(ns, { busy, onDockAnimationEnd, onDockClick, onPageHide, onTrayHover, step });
})(window.__se);
