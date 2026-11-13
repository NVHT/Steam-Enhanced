/*
 * Steam's sale-page renderer and React price widgets, on every store page (shared/sale.css,
 * shared/ui.css).
 *
 *  - Price widgets (.StoreSalePriceWidgetContainer) are tagged for the shared price chip
 *    (dom.tagPrice). The store bar's menus style theirs by class and are left alone.
 *  - DLC art: the box holding Steam's purple corner image is marked [data-se-dlc].
 *  - Capsule carousels (pure-react-carousel) get two things CSS can't do on its own:
 *     · they loop, so Steam never disables their arrows: each arrow is marked [data-se-end]
 *       while the first / last slide is in view, and shared/sale.css hides it there;
 *     · their wrappers are padded and transformed differently per section, so each arrow is
 *       placed by measurement (--se-arrow-x / --se-arrow-y): just inside the edge of the row's
 *       visible window (the slider, which clips the tiles), level with the tiles' middle.
 *       Placing from the window, not the end tile, matters: Steam flags half-visible tiles as
 *       visible too, so their edges sit anywhere.
 *
 * Runs only when React adds widgets or a carousel's slides change class (scrolling); all
 * measurements of a pass are read before any arrow is moved.
 */
export default (dom) => {
  const { scope, tagPrice, untagPrices, setVar } = dom;
  const life = scope();

  const PRICE = '.StoreSalePriceWidgetContainer';
  const NAV = '[data-se-nav]';
  const CAROUSEL = '.SaleOuterContainer .SaleSectionCarousel';
  const WINDOW = '.carousel__slider';
  const TILE = '.iwrzh-mg8hE-, ._8Wp5WbqAbJA-, .carousel__inner-slide > * > *';
  // Arrow centre's distance in from the window's edge: a 44px circle 12px clear of the edge.
  const ARROW_OFFSET = 22 + 12;

  /* Widgets and DLC corner images inside newly added content (or the whole page). */
  const DLC = 'img[src*="/capsule_dlc"]';
  const tagContent = (root) => {
    const prices = root.matches?.(PRICE) ? [root] : root.querySelectorAll(PRICE);
    for (const price of prices) if (!price.closest(NAV)) tagPrice(price);
    // DLC marker (shared/sale.css): the art box holding Steam's purple corner image.
    const dlc = root.matches?.(DLC) ? [root] : root.querySelectorAll(DLC);
    for (const img of dlc) dom.mark(img.parentElement, 'data-se-dlc');
  };

  /** Where an arrow should move: computed from layout reads only. */
  const measureArrow = (button, frame, slide, side) => {
    const tile = slide.querySelector(TILE) ?? slide;
    const view = frame.getBoundingClientRect();
    const target = tile.getBoundingClientRect();
    const arrow = button.getBoundingClientRect();
    if (!view.width || !target.height || !arrow.width) return null;
    const style = getComputedStyle(button);
    const edge = side === 'left' ? view.left + ARROW_OFFSET : view.right - ARROW_OFFSET;
    const dx = edge - (arrow.left + arrow.width / 2);
    const dy = target.top + target.height / 2 - (arrow.top + arrow.height / 2);
    const x = parseFloat(side === 'left' ? style.left : style.right) || 0;
    const y = parseFloat(style.top) || 0;
    return {
      x: Math.abs(dx) > 0.5 ? `${Math.round(side === 'left' ? x + dx : x - dx)}px` : null,
      y: Math.abs(dy) > 0.5 ? `${Math.round(y + dy)}px` : null,
    };
  };

  const syncCarousels = () => {
    const writes = [];
    for (const carousel of document.querySelectorAll(CAROUSEL)) {
      const slides = [...carousel.querySelectorAll('.carousel__slide')];
      if (!slides.length) continue;
      const visible = slides.filter((slide) => slide.classList.contains('carousel__slide--visible'));
      const frame = carousel.querySelector(WINDOW) ?? carousel;
      const ends = [
        ['left', carousel.querySelector('.CarouselBtnLeft'), slides[0], visible[0]],
        ['right', carousel.querySelector('.CarouselBtnRight'), slides.at(-1), visible.at(-1)],
      ];
      for (const [side, button, end, edge] of ends) {
        if (!button) continue;
        writes.push({ button, end: end.classList.contains('carousel__slide--visible'), move: edge && measureArrow(button, frame, edge, side) });
      }
    }
    for (const { button, end, move } of writes) {
      button.toggleAttribute('data-se-end', end);
      if (move?.x) setVar(button, '--se-arrow-x', move.x);
      if (move?.y) setVar(button, '--se-arrow-y', move.y);
    }
  };

  /** Records that matter: new nodes anywhere (widgets), class changes on carousel slides. */
  const onChange = (records) => {
    let carousels = false;
    for (const record of records) {
      if (record.type === 'attributes') {
        carousels = true;
        continue;
      }
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        tagContent(node);
        carousels ||= Boolean(node.closest(CAROUSEL) || node.querySelector(CAROUSEL));
      }
      // React re-renders a widget's insides (sorting, country change).
      const widget = record.target.closest?.(PRICE);
      if (widget && !widget.closest(NAV)) tagPrice(widget);
    }
    if (carousels) syncCarousels();
  };

  tagContent(document);
  syncCarousels();
  life.observe(onChange, {
    attributes: ['class'],
    filter: (record) => record.type !== 'attributes' || record.target.classList?.contains('carousel__slide'),
  });
  life.listen(window, 'resize', dom.perFrame(syncCarousels));

  return () => {
    life.destroy();
    untagPrices();
    document.querySelectorAll('[data-se-dlc]').forEach((node) => node.removeAttribute('data-se-dlc'));
    for (const node of document.querySelectorAll('.CarouselBtnLeft, .CarouselBtnRight')) {
      node.removeAttribute('data-se-end');
      node.style.removeProperty('--se-arrow-x');
      node.style.removeProperty('--se-arrow-y');
    }
  };
};
