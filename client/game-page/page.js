/*
 * Page-wide parts: the scroll-to-top button and the review prompt.
 */
((SE) => {
  const ns = window.__seGamePageParts;
  if (!ns) return;
  const { drop, own, topChecked } = ns;
  const { live } = ns;

  const { C, mark, cssVar: setVar, unmark } = SE;

  const TOP_BTN = `:is(.${C.ScrollToTopButton}, .ScrollToTopButton)`;

  function placeTop(btn) {
    const sc = btn.__seSc;
    if (!sc?.isConnected) return;
    if (!servesScroller(btn, sc)) {
      btn.__seSc = null;
      return;
    }
    const max = sc.scrollHeight - sc.clientHeight;
    setVar(btn, '--se-scroll', String(max > 0 ? Math.min(1, Math.max(0, sc.scrollTop / max)).toFixed(3) : 0));
    const wrap = btn.parentElement;
    if (!wrap) return;
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

  // Scroll events arrive many times a frame: keep the latest scroller and place once per frame.
  let scrolled = null;
  live.scrollFrame = 0;
  const topFor = new WeakMap();

  function onAnyScroll(e) {
    scrolled = e.target === document ? document.scrollingElement : e.target;
    if (!live.scrollFrame) live.scrollFrame = requestAnimationFrame(placeScrolled);
  }

  function placeScrolled() {
    live.scrollFrame = 0;
    const t = scrolled;
    scrolled = null;
    if (!(t instanceof Element) || t.clientHeight < innerHeight * 0.6 || t.scrollHeight - t.clientHeight < 50) return;
    if (t.closest(SE.SIDE)) return;
    const known = topFor.get(t);
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
    best.__seSc = t;
    topFor.set(t, best);
    placeTop(best);
  }

  function onResizeTop() {
    for (const btn of document.querySelectorAll(TOP_BTN)) placeTop(btn);
  }

  function placeScrollTop() {
    for (const btn of document.querySelectorAll(TOP_BTN)) {
      const w = btn.parentElement;
      // One computed-style read per wrapper, not one per pass.
      if (w && !topChecked.has(w)) {
        topChecked.add(w);
        if (
          !w.matches(`:is(.${C.ScrollToTopButtonPosition}, .ScrollToTopButtonPosition)`) &&
          getComputedStyle(w).position === 'static'
        ) {
          mark(w, 'data-se-top-host');
        }
      }
      placeTop(btn);
    }
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

  Object.assign(ns, { onAnyScroll, onResizeTop, placeReviewPrompt, placeScrollTop });
})(window.__se);
