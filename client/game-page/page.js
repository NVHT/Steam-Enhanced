/*
 * Page-wide parts: the scroll-to-top button and the review prompt.
 */
((SE) => {
  const ns = window.__seGamePageParts;
  if (!ns) return;
  const { drop, own } = ns;
  const { live } = ns;

  const { C, mark, cssVar: setVar, unmark } = SE;

  const TOP_BTN = `:is(.${C.ScrollToTopButton}, .ScrollToTopButton)`;

  /*
   * Steam shows the button only once its scroller is scrolled, so it is placed from scrolls,
   * never from the page's pass: there, the first read paid the style pass of a page still being
   * drawn. A scroller's first scroll places it at once (after that layout), later ones once they
   * settle; a window resize places every button. A scroller resizing (topSizer) places it again
   * once that settles too, and only while scrolled (the button may show): a page being built
   * resizes its scroller over and over.
   */
  live.topSizer = undefined;
  const placedFor = new WeakMap();
  const topChecked = new WeakSet(); // wrappers checked by anchorWrap; per instance, so a reload re-checks
  const lastProgress = new WeakMap(); // btn → its scroller's last progress (0 to 1)

  // A button serves one scroller: the one it served before is let go, and so is a scroller Steam
  // removed (a removed box reports one last resize), so replaced pages aren't kept alive
  function watchScroller(btn, sc) {
    live.topSizer ??= new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (!entry.target.isConnected) {
          live.topSizer.unobserve(entry.target);
          continue;
        }
        const btn = topFor.get(entry.target);
        if (btn?.__seSc !== entry.target) continue;
        placedFor.delete(btn);
        // Scrolled (the button may show): placed once things settle, as after a scroll. Not
        // here: leaving a scrolled page resizes the scroller while the next one is drawn.
        if (lastProgress.get(btn) > 0) settleLater(entry.target);
      }
    });
    const old = btn.__seSc;
    if (old && old !== sc) live.topSizer.unobserve(old);
    btn.__seSc = sc;
    topFor.set(sc, btn);
    live.topSizer.observe(sc);
  }

  // How far down its scroller is, as the button's ring shows it (0 to 1)
  const setProgress = (btn, top, max) => {
    const at = max > 0 ? Math.min(1, Math.max(0, top / max)) : 0;
    lastProgress.set(btn, at);
    setVar(btn, '--se-scroll', at.toFixed(3));
  };

  // A wrapper that isn't Steam's position box holds the button: it anchors it (one read each)
  function anchorWrap(wrap) {
    if (topChecked.has(wrap)) return;
    topChecked.add(wrap);
    if (
      !wrap.matches(`:is(.${C.ScrollToTopButtonPosition}, .ScrollToTopButtonPosition)`) &&
      getComputedStyle(wrap).position === 'static'
    ) {
      mark(wrap, 'data-se-top-host');
    }
  }

  function placeTop(btn) {
    const sc = btn.__seSc;
    if (!sc?.isConnected) return;
    placedFor.set(btn, sc);
    if (!servesScroller(btn, sc)) {
      live.topSizer?.unobserve(sc);
      btn.__seSc = null;
      return;
    }
    setProgress(btn, sc.scrollTop, sc.scrollHeight - sc.clientHeight);
    const wrap = btn.parentElement;
    if (!wrap) return;
    anchorWrap(wrap);
    const o = wrap.getBoundingClientRect();
    const r = sc.getBoundingClientRect();
    const bar = sc.offsetWidth - sc.clientWidth;
    setVar(btn, '--se-top-x', `${Math.round(r.right - o.left - bar - 48 - 20)}px`);
    setVar(btn, '--se-top-y', `${Math.round(Math.min(r.bottom, innerHeight) - o.top - 48 - 20)}px`);
  }

  /*
   * A button belongs to a scroller only if the scroller holds it, or sits under it. Without
   * this, scrolling the game list (also tall, and a near relative in the DOM) handed the
   * page's button the list's box, and the button was drawn in the header beside the list.
   */
  function servesScroller(btn, sc) {
    if (sc.contains(btn)) return true;
    const host = btn.parentElement?.parentElement;
    if (!host) return false;
    const a = sc.getBoundingClientRect();
    const b = host.getBoundingClientRect();
    const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    return a.width > 0 && overlap >= a.width * 0.5;
  }

  /*
   * The ring follows a scroll once it settles (SCROLL_SETTLE_MS after the last event), its reads
   * taken right after the next layout (SE.afterLayout). Read in the event, its frame or after its
   * paint, each cost a style pass and a layout while the page was still being drawn (a virtualized
   * grid redrawing under the scroll: Home's Uncategorized). A scroll doesn't move the scroller's
   * box or the button's place: those are measured on a scroller's first scroll, and when either
   * resizes (topSizer, onResizeTop).
   */
  const SCROLL_SETTLE_MS = 120;
  let scrolled = null;
  live.scrollTimer = 0;
  const topFor = new WeakMap();

  // Scrollers already scrolled once
  const tried = new WeakSet();

  function onAnyScroll(e) {
    const t = e.target === document ? document.scrollingElement : e.target;
    // A scroller's first scroll places its button now, before Steam shows it. Later ones wait to
    // settle: leaving a scrolled page scrolls its scroller back while the next page is drawn, and
    // a button placed before keeps that place meanwhile.
    if (t instanceof Element && !tried.has(t)) {
      tried.add(t);
      SE.afterLayout(t, () => placeScrolled(t));
    }
    // Then debounced: the ring follows once the scroll has settled
    settleLater(t);
  }

  function settleLater(t) {
    scrolled = t;
    clearTimeout(live.scrollTimer);
    live.scrollTimer = setTimeout(() => {
      live.scrollTimer = 0;
      const t = scrolled;
      scrolled = null;
      if (t instanceof Element) SE.afterLayout(t, () => placeScrolled(t));
    }, SCROLL_SETTLE_MS);
  }

  function placeScrolled(t) {
    if (!t.isConnected || t.closest(SE.SIDE)) return;
    const known = topFor.get(t);
    if (known && !known.isConnected) topFor.delete(t);
    if (known?.isConnected && known.__seSc === t && placedFor.get(known) === t) {
      setProgress(known, t.scrollTop, t.scrollHeight - t.clientHeight);
      return;
    }
    if (t.clientHeight < innerHeight * 0.6 || t.scrollHeight - t.clientHeight < 50) return;
    if (known?.isConnected && known.__seSc === t) {
      placeTop(known);
      return;
    }
    let best = null;
    let bestSteps = 7;
    for (const btn of document.querySelectorAll(TOP_BTN)) {
      if (!servesScroller(btn, t)) continue;
      let steps = 0;
      for (let n = btn.parentElement; n && steps < bestSteps; n = n.parentElement, steps++) {
        if (n === t || n.contains(t)) break;
      }
      if (steps < bestSteps) {
        best = btn;
        bestSteps = steps;
      }
    }
    if (!best) return;
    watchScroller(best, t);
    placeTop(best);
  }

  function onResizeTop() {
    for (const btn of document.querySelectorAll(TOP_BTN)) placeTop(btn);
  }

  const RV_BOX = `.${C.ReviewContainer}`;
  const RV_ROW = `.${C.WriteReviewContainer_RatingContainer}`;
  const RV_TIME = `.${C.WriteReviewContainer_Playtime}`;
  const RV_ASK = `.${C.RecommendGame}`;
  const RV_BTN = `:is(.${C.ReviewThumbButton}, .${C.CompactThumbButton})`;
  const RV_UP = `.${C.Up}`;
  const RV_DOWN = `.${C.Down}`;

  function placeReviewPrompt() {
    for (const box of document.querySelectorAll(RV_BOX)) {
      const time = box.querySelector(RV_TIME);
      const row = box.querySelector(RV_ROW);
      if (!time || !row) continue;
      const said = time.textContent.trim();
      const m =
        said.match(/^You['’]ve played for ([\d.,]+)\s+(\S+)$/i) || said.match(/([\d][\d.,]*)\s+(\S+)/);
      let tile = row.querySelector(':scope > .se-rv-hours');
      if (m) {
        if (!tile) {
          tile = own('div', 'se-rv-hours');
          tile.innerHTML = '<b></b><i></i>';
        }
        if (tile.firstChild.textContent !== m[1]) tile.firstChild.textContent = m[1];
        if (tile.lastChild.textContent !== m[2]) tile.lastChild.textContent = m[2];
        if (row.firstElementChild !== tile) row.prepend(tile);
        mark(box, 'data-se-rv-hours');
      } else {
        drop(tile);
        unmark(box, 'data-se-rv-hours');
      }
      const english = /^You['’]ve played for /i.test(said);
      if (english && m) {
        mark(time, 'data-se-rv-text', 'Your review helps other players decide.');
      } else {
        unmark(time, 'data-se-rv-text');
      }
      const btns = [...box.querySelectorAll(RV_BTN)];
      const pics = btns.filter((b) => b.querySelector('svg, img'));
      btns.forEach((b, n) => {
        const kind = b.querySelector(RV_UP)
          ? 'up'
          : b.querySelector(RV_DOWN)
            ? 'down'
            : pics.length
              ? pics.includes(b)
                ? pics.indexOf(b)
                  ? 'down'
                  : 'up'
                : 'later'
              : ['up', 'down', 'later'][n];
        if (kind) mark(b, 'data-se-rv-btn', kind);
      });
      const ask = box.querySelector(RV_ASK);
      if (ask) {
        if (/^Would you recommend this game to other players\?$/i.test(ask.textContent.trim())) {
          mark(ask, 'data-se-rv-text', 'Would you recommend this game?');
        } else {
          unmark(ask, 'data-se-rv-text');
        }
      }
    }
  }

  Object.assign(ns, { onAnyScroll, onResizeTop, placeReviewPrompt });
})(window.__se);
