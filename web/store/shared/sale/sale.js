/*
 * Steam's sale-page renderer and React price widgets, on every store page (shared/sale/sale.css,
 * shared/ui.css).
 *
 *  - Price widgets (.StoreSalePriceWidgetContainer) are tagged for the shared price chip
 *    (dom.tagPrice). The store bar's menus style theirs by class and are left alone.
 *  - DLC art: the box holding Steam's purple corner image is marked [data-se-dlc].
 *  - Capsule carousels (pure-react-carousel) get two things CSS can't do on its own:
 *     · they loop, so Steam never disables their arrows: each arrow is marked [data-se-end]
 *       while the first / last slide is in view, and shared/sale/sale.css hides it there;
 *     · their wrappers are padded and transformed differently per section, so each arrow is
 *       placed by measurement (--se-arrow-x / --se-arrow-y): just inside the edge of the row's
 *       visible window (the slider, which clips the tiles), level with the tiles' middle.
 *       Placing from the window, not the end tile, matters: Steam flags half-visible tiles as
 *       visible too, so their edges sit anywhere;
 *     · each section insets, shifts and gutters its row differently, so a row's tiles are
 *       pulled onto the page column by measurement: the tray wrapper's start margin and width
 *       are set inline so its edges sit at the column's, less the outer cards' gutters in their
 *       slide.
 *       The wrapper doesn't move when the row slides (the tray inside it does), so a pass
 *       measured mid-slide is still right.
 *  - Section titles: Steam insets some headers; each title is moved onto the column's edge
 *    by measurement (its label box's start margin, inline).
 *
 * Runs only when React adds widgets or a carousel's slides change class (scrolling); all
 * measurements of a pass are read before any arrow is moved.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  web.define((dom) => {
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
      // DLC marker (shared/sale/sale.css): the art box holding Steam's purple corner image.
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

    // A row's cards (sale capsules, library capsules, event cards); TILE as the fallback.
    const CARD = '.iwrzh-mg8hE-, ._8Wp5WbqAbJA-, .OtherEvents_EventCtn';

    /**
     * Where the row's tray wrapper must sit for its outer cards to meet the column: its edges
     * at the column's, less the card's gutter inside its slide on each side. The wrapper itself
     * never moves when the row slides (only the tray inside it does), so measuring it is stable.
     */
    const measurePull = (carousel, slide) => {
      const column = carousel.closest('[data-se-wide]');
      const wrapper = carousel.querySelector('.carousel__slider-tray-wrapper');
      // A slide can hold several cards (event rows: a grid of three): the gutters are the first
      // card's at the start and the last card's at the end.
      const cards = slide.querySelectorAll(CARD);
      const first = cards[0] ?? slide.querySelector(TILE);
      const last = cards[cards.length - 1] ?? first;
      if (!column || !wrapper || !first) return null;
      const col = column.getBoundingClientRect();
      const box = wrapper.getBoundingClientRect();
      const cell = slide.getBoundingClientRect();
      const head = first.getBoundingClientRect();
      const tail = last.getBoundingClientRect();
      if (!col.width || !box.width || !head.width || !tail.width) return null;
      const left = col.left - (head.left - cell.left);
      const right = col.right + (cell.right - tail.right);
      const margin = parseFloat(getComputedStyle(wrapper).marginInlineStart) || 0;
      return { wrapper, start: `${Math.round(margin + left - box.left)}px`, width: `${Math.round(right - left)}px` };
    };

    /** A section title's label box, moved so the title starts on the column's edge. */
    const measureTitle = (header) => {
      const column = header.closest('[data-se-wide]');
      const label = header.closest('.SaleSectionLabelCtn');
      if (!column || !label) return null;
      const dx = header.getBoundingClientRect().left - column.getBoundingClientRect().left;
      if (Math.abs(dx) < 0.5) return null;
      const current = parseFloat(getComputedStyle(label).marginInlineStart) || 0;
      return { label, margin: `${Math.round(current - dx)}px` };
    };

    const pinned = new Set();
    const pin = (node, property, value) => {
      if (node.style.getPropertyValue(property) === value) return;
      node.style.setProperty(property, value, 'important'); // overrides Steam's inline layout
      pinned.add(node);
    };

    const syncCarousels = () => {
      const writes = [];
      const pulls = [];
      for (const carousel of document.querySelectorAll(CAROUSEL)) {
        const slides = [...carousel.querySelectorAll('.carousel__slide')];
        if (!slides.length) continue;
        const visible = slides.filter((slide) => slide.classList.contains('carousel__slide--visible'));
        const frame = carousel.querySelector(WINDOW) ?? carousel;
        const pull = measurePull(carousel, visible[0] ?? slides[0]);
        if (pull) pulls.push(pull);
        const ends = [
          ['left', carousel.querySelector('.CarouselBtnLeft'), slides[0], visible[0]],
          ['right', carousel.querySelector('.CarouselBtnRight'), slides.at(-1), visible.at(-1)],
        ];
        for (const [side, button, end, edge] of ends) {
          if (!button) continue;
          writes.push({ button, end: end.classList.contains('carousel__slide--visible'), move: edge && measureArrow(button, frame, edge, side) });
        }
      }
      const titles = [...document.querySelectorAll('.SaleOuterContainer .SaleSectionHeader')].map(measureTitle).filter(Boolean);
      for (const { wrapper, start, width } of pulls) {
        pin(wrapper, 'margin-inline-start', start);
        pin(wrapper, 'width', width);
      }
      for (const { label, margin } of titles) pin(label, 'margin-inline-start', margin);
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
      for (const node of pinned) {
        node.style.removeProperty('margin-inline-start');
        node.style.removeProperty('width');
      }
      pinned.clear();
    };
  });
})();
