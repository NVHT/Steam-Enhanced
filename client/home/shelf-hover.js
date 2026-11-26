/*
 * A Home shelf's hover card (Steam's AppPortraitHover, in its HoverPosition popover; drawn by
 * client/shared/hover-cards.css): resting on a cover opens it sideways into its card, the covers
 * on that side sliding away to make the room and the shelf's others stepping back
 * (client/home/shelf-hover.css).
 *
 * The card is pinned to the cover in the window (position: fixed, --se-shelf-x / -y / -h in a
 * rule of the card's own, setPlace), not left where Steam puts it: Steam places it again on every render of the card, by
 * its own target a few px off the cover. The cover entered holds still at once (its hover lift
 * off, data-se-still), so one read of it, as the pointer enters, gives where the card goes; its
 * side (data-se-shelf-hot) follows Steam's rule (right while the window has room), moved left
 * when it would run past the shelf, over the Friends column.
 */
((SE) => {
  window.__seShelfHover?.destroy();
  const { C } = SE;

  // A shelf's cover box (LibraryItemBox): the grid's cells around it are display: contents
  const COVER = `.${C.Showcase} .${C.LibraryItemBox}`;
  const HOVER = `.${C.HoverPosition}`;
  const CARD = `.${C.AppPortraitHover}`;
  const HOT = 'data-se-shelf-hot';
  const STILL = 'data-se-still';
  const PEEK = 'data-se-peek';
  const PEEKED = 'data-se-peeked';
  /*
   * The card's place (--se-shelf-x / -y / -h) in a rule of its own, aimed at Steam's card only:
   * set on <html>, every element inherited them, and each cover entered restyled the whole
   * window (thousands of covers on a big shelf)
   */
  const placeSheet = document.createElement('style');
  placeSheet.id = 'se-shelf-place';
  document.head.append(placeSheet);
  const setPlace = (x, y, h) => {
    const text = x == null ? '' : `${CARD}{--se-shelf-x:${x}px;--se-shelf-y:${y}px;--se-shelf-h:${h}px}`;
    if (placeSheet.textContent !== text) placeSheet.textContent = text;
  };
  // Steam's rule (sp.js, the hover's placement): 8 px off, 10 px allowed past the window's edge
  const DISTANCE = 8;
  const ALLOWANCE = 10;
  const root = document.documentElement;

  let hot = null; // the cover under the pointer
  let peek = null; // { shelf, box, slid }: the shelf opened while the card shows
  let cardWidth = 0; // --se-hc-width, read once

  /*
   * The covers on the card's side slide away by its width: only those in the open cover's row
   * (an expanded shelf's grid row, [role="row"]; a carousel's list), each as a whole (its box and
   * what sits under it, the friends badge). A grid cell is display: contents, so its children
   * move; a carousel item moves itself. Animated here (translate, held at its end), not by CSS
   * transitions, which would take over Steam's own on those elements.
   */
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const itemOf = (box) => {
    let item = box;
    while (item.parentElement && !item.matches('[role="listitem"]') && !item.parentElement.matches('[role="row"]')) {
      item = item.parentElement;
    }
    return item.parentElement ? item : null;
  };

  const movers = (item) => (getComputedStyle(item).display === 'contents' ? [...item.children] : [item]);

  const timing = () => {
    const style = getComputedStyle(root);
    const still = reduced.matches || SE.settings?.get('motion') === 'reduced';
    return {
      duration: still ? 0 : parseFloat(style.getPropertyValue('--se-dur-slower')) * 1000 || 500,
      easing: style.getPropertyValue('--se-ease').trim() || 'ease-out',
    };
  };

  const slide = (items, dx) => {
    const options = { ...timing(), fill: 'forwards' };
    return items.flatMap(movers).map((el) =>
      el.animate([{ translate: '0px 0px' }, { translate: `${dx}px 0px` }], options));
  };

  // Back to place, then let go of the held end
  const slideBack = (animations) => {
    for (const animation of animations) {
      animation.onfinish = () => animation.cancel();
      animation.reverse();
    }
  };

  // at once: back in place without the slide (the page scrolled, so Steam closed the card)
  const clearPeek = (atOnce = false) => {
    if (!peek) return;
    peek.shelf.removeAttribute(PEEK);
    peek.box.removeAttribute(PEEKED);
    if (atOnce) for (const animation of peek.slid) animation.cancel();
    else slideBack(peek.slid);
    peek = null;
  };

  // The open cover takes the card's room in its row
  const setPeek = (box) => {
    if (peek?.box === box) return;
    clearPeek();
    const shelf = box.closest(`.${C.Showcase}`);
    const item = itemOf(box);
    let slid = [];
    if (item) {
      const peers = [...item.parentElement.children];
      const at = peers.indexOf(item);
      const after = root.getAttribute(HOT) === 'right';
      slid = slide(after ? peers.slice(at + 1) : peers.slice(0, at), after ? cardWidth : -cardWidth);
    }
    shelf.setAttribute(PEEK, '');
    box.setAttribute(PEEKED, '');
    peek = { shelf, box, slid };
  };

  const releaseHot = () => {
    hot?.removeAttribute(STILL);
    hot = null;
  };

  const clearHot = () => {
    releaseHot();
    root.removeAttribute(HOT);
    setPlace(null);
    clearPeek();
  };

  // The card's place, from the cover entered, held still first so it's read where it stays
  const setHot = (cover) => {
    releaseHot();
    hot = cover;
    cover.setAttribute(STILL, '');
    cardWidth ||= parseFloat(getComputedStyle(root).getPropertyValue('--se-hc-width')) || 320;
    const box = cover.getBoundingClientRect();
    const shelf = cover.closest(`.${C.Showcase}`).getBoundingClientRect();
    const end = box.right + DISTANCE + cardWidth;
    const right = end - innerWidth <= ALLOWANCE && box.right + cardWidth <= shelf.right;
    setPlace(right ? box.right : box.left - cardWidth, box.top, box.height);
    root.setAttribute(HOT, right ? 'right' : 'left');
  };

  // The cover the pointer last came onto during a scroll (Steam's page moving under it fires the
  // pointer's events), taken up once the scroll ends
  let pending = null;

  const enter = (cover) => {
    if (cover === hot) return;
    if (cover && !cover.closest(`.${C.Reordering}`)) setHot(cover);
    else if (hot) {
      releaseHot();
      sync();
    }
  };

  const onOver = (event) => {
    const cover = event.target instanceof Element ? event.target.closest(COVER) : null;
    if (scrollTimer) {
      pending = cover;
      return;
    }
    enter(cover);
  };

  /*
   * A game without screenshots: Steam fills the card with its small store capsule, crude once
   * stretched to the card. Its library hero (wide art made to be cropped) goes over it, through
   * its copies (SE.heroURLs, SE.art); if none loads, the capsule stays.
   */
  const BANNER = `.${C.ScreenshotCrossfade}`;
  const FALLBACK = `.${C.NoScreenshotFallbackWrapper}`;
  const heroed = new WeakSet(); // cards given their hero
  const giveHero = (card, cover) => {
    if (heroed.has(card)) return;
    const banner = card.querySelector(BANNER);
    if (!banner?.querySelector(FALLBACK)) return;
    heroed.add(card);
    const appid = SE.appOf(cover)?.appid;
    const urls = appid ? SE.heroURLs(appid) : [];
    if (!urls?.length) return;
    const img = SE.art.img(urls, 'se-shelf-hero', () => img.remove());
    banner.append(img);
  };

  // The shelf opens while the card is up; the card keeps its place as it fades
  const sync = () => {
    const card = [...document.querySelectorAll(HOVER)].map((el) => el.querySelector(CARD)).find(Boolean);
    const shown = !!card;
    if (shown && hot?.isConnected && !scrollTimer) {
      setPeek(hot);
      giveHero(card, hot);
    } else clearPeek();
    if (!shown && !hot && root.hasAttribute(HOT)) clearHot();
  };

  const watcher = SE.watch(sync);
  document.addEventListener('pointerover', onOver, true);

  /*
   * Scrolling: a quiet spell, until the page has been still for SCROLL_QUIET_MS. The shelf closes
   * at once and no cover opens meanwhile; every card is faded out (data-se-shelf-scrolling on
   * <html>, shelf-hover.css): Steam keeps its card up while the page moves, left where the cover
   * was. The card of the cover left behind stays hidden (data-se-gone) until Steam removes it; the
   * cover under the pointer once still is taken up then, and opens a card of its own.
   */
  const SCROLL_QUIET_MS = 200;
  const SCROLLING = 'data-se-shelf-scrolling';
  let scrollTimer = 0;
  const onScroll = () => {
    if (!scrollTimer) root.setAttribute(SCROLLING, '');
    clearTimeout(scrollTimer);
    // Debounced: the spell ends a moment after the last scroll event
    scrollTimer = setTimeout(() => {
      scrollTimer = 0;
      root.removeAttribute(SCROLLING);
      // The pointer stayed put while the page moved under it: the cover it came onto then
      // (its entering came during the spell, and comes no more; no hit test, which lays out)
      const cover = pending?.isConnected ? pending : null;
      pending = null;
      enter(cover);
    }, SCROLL_QUIET_MS);
    if (!peek && !hot) return;
    for (const card of document.querySelectorAll(`${HOVER} ${CARD}`)) card.setAttribute('data-se-gone', '');
    clearPeek(true);
    clearHot();
  };
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  const onResize = () => { cardWidth = 0; };
  addEventListener('resize', onResize);

  window.__seShelfHover = {
    destroy() {
      watcher.disconnect();
      document.removeEventListener('pointerover', onOver, true);
      document.removeEventListener('scroll', onScroll, { capture: true });
      clearTimeout(scrollTimer);
      root.removeAttribute(SCROLLING);
      removeEventListener('resize', onResize);
      clearHot();
      placeSheet.remove();
      delete window.__seShelfHover;
    },
  };
})(window.__se);
