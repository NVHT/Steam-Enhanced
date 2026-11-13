/*
 * Store front and the explore lists: the content rows below the hero ("Recommended Based on
 * the Games You Play", "Top Played on Steam Deck", "Your Wishlist", New On Steam's bucket rows
 * and the like).
 *
 * Their markup mixes classic store classes with hashed React ones that change with each store
 * build. Instead of chasing those names, each row is found by its shape (a heading followed by
 * a carousel) and its parts are tagged; shared/rows.css styles the tags. The calendar and
 * Discovery Queue banner (front/sections.css), item flags (shared/rows.css) and the game hover
 * card (shared/ui.css) are styled from CSS alone.
 *
 * The first pass covers the page; after that only carousels inside newly added content are
 * (re)tagged, as React fills rows in while they scroll into view.
 *
 * Tags:
 *   data-se-shelf="bare|panel"  the row; "panel" when Steam gave it a backdrop
 *   data-se-shelf-head          heading row        data-se-shelf-title  the heading
 *   data-se-shelf-more          its buttons        data-se-shelf-panel  Steam's backdrop
 *   data-se-slot                one carousel item  data-se-tile         the link in it
 *   data-se-tile-art            the capsule art    data-se-price-bar    the strip under it
 *   data-se-price               the price widget (dom.tagPrice)
 *   data-se-arrow="prev|next"   carousel arrows    data-se-pips         the page dots
 */
export default (dom) => {
  const { mark, scope, tagPrice } = dom;
  const life = scope();
  const isFront = document.documentElement.classList.contains('se-store-front');

  const ROOT = '.home_page_body_ctn';
  // Rows the theme styles elsewhere (front/hero.css, front/sections.css) or that aren't shelves.
  const SKIP = [
    '#home_maincap_v7',
    '[data-se-own]',
    '#module_discounts_and_events',
    '.nHdn-Ea4zSg-', // Personal Calendar (front/sections.css)
    '.mzAzU7-I6qg-', // Discovery Queue banner (front/sections.css)
    '.home_tabs_row_ctn',
    '#tab_preview_container',
    '#global_hover',
    '[data-se-nav]', // store bar and its menus (shared/nav.css)
    '[data-se-explore-feature]', // explore lists' header capsules (explore/page.css)
    '#footer',
  ].join(', ');
  // Item containers: React and classic carousels, the classic Wishlist / DLC four-packs, and
  // New On Steam's price-band grids and bucket rows ("New Top Sellers", "Under $10"...).
  const CAROUSEL = '.carousel__slider, .carousel_container, .home_discount_games_ctn, .home_specials_grid, .bucket > * > .bucket_contents';
  const HEADING = 'h2, h3, [role="heading"], .home_section_title, .home_page_content_title, .SaleSectionHeader';
  // Steam renders an empty .discount_block for games with no price yet (upcoming); never a chip.
  const PRICE = '.dkW-v-f4lTw-, .StoreSalePriceWidgetContainer, .discount_block:not(.empty)';
  const ARROW = {
    prev: '.CarouselBtnLeft, .arrow.left',
    next: '.CarouselBtnRight, .arrow.right',
  };
  const PIPS = '.I8j65FBXdOY-, .carousel__dot-group, .carousel_thumbs';
  // Modules styled whole by their classes in front/sections.css: only prices, arrows and dots are tagged.
  const BY_CLASS = '.community_recommendations_by_steam_labs_ctn, .content_hub_carousel_ctn';
  const MAX_CLIMB = 8;
  // A row never climbs past its module: one .home_pagecontent_ctn on the front page; New On
  // Steam's classic sections are .home_ctn blocks.
  const MODULE = isFront ? '.home_pagecontent_ctn' : '.home_pagecontent_ctn, .home_ctn';

  /*
   * No endless "more content" below the last row: the page ends at the footer. home.js
   * declares this flag (false) and checks it on every scroll before loading another batch;
   * set again on load in case home.js runs after this file. shared/rows.css hides the area.
   */
  const stopAutoload = () => {
    window.g_bDisableAutoloader = true;
  };
  stopAutoload();
  life.listen(window, 'load', stopAutoload, { once: true });
  life.add(() => {
    window.g_bDisableAutoloader = false;
  });

  const before = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  const visibleBackdrop = (node) => {
    const style = getComputedStyle(node);
    if (style.backgroundImage !== 'none') return true;
    const alpha = /rgba?\(([^)]+)\)/.exec(style.backgroundColor)?.[1].split(',')[3];
    return style.backgroundColor !== 'transparent' && (alpha === undefined || Number(alpha) > 0.02);
  };

  /** Nearest ancestor of the carousel that also holds a heading placed before it. */
  const findShelf = (carousel) => {
    let node = carousel.parentElement;
    for (let depth = 0; node && depth < MAX_CLIMB; depth++, node = node.parentElement) {
      if (node === document.body) return null;
      const heading = [...node.querySelectorAll(HEADING)].find(
        // Innermost match: .home_page_content_title can wrap an <h2> and the row's buttons.
        (h) => !carousel.contains(h) && before(h, carousel) && !h.querySelector(HEADING) && h.textContent.trim(),
      );
      if (heading) return { shelf: node, heading };
      if (node.matches(MODULE)) return null; // never climb into the next module
    }
    return null;
  };

  /** The heading's row: its ancestor that is a direct child of the shelf, unless that also wraps the carousel. */
  const headRowOf = (shelf, heading, carousel) => {
    let row = heading;
    while (row.parentElement && row.parentElement !== shelf) row = row.parentElement;
    return row.contains(carousel) ? heading.parentElement : row;
  };

  /* React carousels: one .carousel__slide per item; classic ones and four-packs: see below. */
  const slotsOf = (carousel) => {
    const slides = carousel.querySelectorAll('.carousel__slide');
    if (slides.length) return [...slides];
    // Classic carousels: the items are the children of each page <div> in .carousel_items; the
    // four-packs (.home_discount_games_ctn) list them directly. Links deeper inside an item (a
    // reviewer's avatar, a curator's name) are never items of their own.
    const pages = carousel.querySelector(':scope .carousel_items');
    const items = pages
      ? [...pages.children].flatMap((page) => (page.matches('a[href]') ? [page] : [...page.children]))
      : [...carousel.children];
    return items.filter((item) => item.querySelector('img'));
  };

  // Classic prices moved into the art box, so destroy() can put them back.
  const moved = [];
  life.add(() => {
    for (const { price, parent, next } of moved.reverse()) {
      if (parent.isConnected) parent.insertBefore(price, next?.parentNode === parent ? next : null);
    }
    moved.length = 0;
  });

  const tagTiles = (carousel) => {
    for (const slot of slotsOf(carousel)) {
      const img = slot.querySelector('img');
      if (!img) continue;
      const link = slot.matches('a[href]') ? slot : img.closest('a[href]');
      const tile = link && slot.contains(link) ? link : slot;
      mark(slot, 'data-se-slot');
      mark(tile, 'data-se-tile');
      const art = img.parentElement && img.parentElement !== tile && img.parentElement !== slot ? img.parentElement : img;
      mark(art, 'data-se-tile-art');

      const price = slot.querySelector(PRICE);
      if (!price) continue;
      tagPrice(price);
      const bar = price.parentElement;
      if (bar === tile && art !== img && !price.closest('[data-reactroot], .carousel__slide')) {
        // Classic capsule: the price sits in the link under the art. It moves into the art box
        // (server-rendered markup, not React's) so it rides the art's corner like the others.
        moved.push({ price, parent: bar, next: price.nextSibling });
        art.append(price);
      } else if (bar && bar !== tile && bar !== slot && !bar.contains(img)) {
        mark(bar, 'data-se-price-bar');
      }
    }
  };

  const tagArrowsAndPips = (root) => {
    for (const [side, selector] of Object.entries(ARROW)) {
      for (const arrow of root.querySelectorAll(selector)) mark(arrow, 'data-se-arrow', side);
    }
    for (const pips of root.querySelectorAll(PIPS)) mark(pips, 'data-se-pips');
  };

  const tagShelf = (carousel) => {
    if (carousel.closest(SKIP) || carousel.closest('[data-se-slot]')) return;
    // "Recommended by the community" (one large review card per page) and the category tiles
    // are not rows of game tiles; front/sections.css styles them by class.
    const byClass = carousel.closest(BY_CLASS);
    if (byClass) {
      for (const price of byClass.querySelectorAll(PRICE)) tagPrice(price);
      tagArrowsAndPips(byClass);
      return;
    }
    const found = findShelf(carousel);
    if (!found || found.shelf.closest(SKIP)) return;
    const { shelf, heading } = found;

    const head = headRowOf(shelf, heading, carousel);
    mark(head, 'data-se-shelf-head');
    mark(heading, 'data-se-shelf-title');
    for (const button of head.querySelectorAll('a[href], button')) {
      if (!heading.contains(button)) mark(button, 'data-se-shelf-more');
    }

    // Steam's backdrop (the blue panel): any painted box between the shelf and the carousel,
    // from the container itself (the four-packs paint the panel on it).
    let panel = false;
    for (let node = carousel; node && node !== shelf; node = node.parentElement) {
      if (!node.contains(head) && visibleBackdrop(node)) {
        mark(node, 'data-se-shelf-panel');
        panel = true;
      }
    }
    mark(shelf, 'data-se-shelf', panel ? 'panel' : 'bare');

    tagTiles(carousel);
    tagArrowsAndPips(shelf);
  };

  /** Carousels in or around the given nodes. */
  const carouselsIn = (nodes) => {
    const found = new Set();
    for (const node of nodes) {
      if (node.nodeType !== 1 || !node.isConnected) continue;
      const outer = node.closest(CAROUSEL);
      if (outer) found.add(outer);
      // A heading that renders after its carousel: rescan its module.
      const scopeNode = !outer && (node.matches(HEADING) || node.querySelector(HEADING)) ?node.closest(MODULE) ?? node.parentElement : node;
      for (const inner of scopeNode.querySelectorAll(CAROUSEL)) found.add(inner);
    }
    return found;
  };

  const root = () => document.querySelector(ROOT) ?? document.body;
  const scanAll = () => {
    const container = root();
    if (container) for (const carousel of container.querySelectorAll(CAROUSEL)) tagShelf(carousel);
  };

  life.observe((records) => {
    const container = root();
    const added = records.flatMap((record) => [...record.addedNodes]).filter((node) => container?.contains(node));
    for (const carousel of carouselsIn(added)) tagShelf(carousel);
  });
  dom.ready().then(() => life.alive && scanAll());
  scanAll();

  const ATTRS = [
    'data-se-shelf', 'data-se-shelf-head', 'data-se-shelf-title', 'data-se-shelf-more', 'data-se-shelf-panel',
    'data-se-slot', 'data-se-tile', 'data-se-tile-art', 'data-se-price-bar', 'data-se-arrow', 'data-se-pips',
  ];

  return () => {
    life.destroy();
    for (const node of document.querySelectorAll(ATTRS.map((name) => `[${name}]`).join(', '))) {
      for (const name of ATTRS) node.removeAttribute(name);
    }
  };
};
