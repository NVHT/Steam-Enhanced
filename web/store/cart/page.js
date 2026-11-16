/*
 * Shopping cart (/cart/):
 *  - Tags the recommendations' price widgets for the shared price chip (shared/ui.css
 *    [data-se-price]).
 *  - Sizes the gift picker's menu to the picker while it is open.
 *  - Tags the recommendations' hover card by meaning. The cart is on Steam's newer store
 *    build, whose hover card has different hashed classes from the store front's
 *    (saletags.css .PFP2RDjCi0w-), so its parts are found from the stable hooks it does keep
 *    (.WishlistButton, .WidgetTag) and from layout, then share the store's hover card rules
 *    (shared/sale/sale.css, shared/ui.css [data-se-hcard*]).
 * - Tags every part the page styles by meaning ([data-se-cart~="<part>"], from the map below).
 * Steam renders both after load and re-renders them, so tagging reruns whenever the page
 * changes. destroy() untags everything it tagged.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  /*
   * Every hashed class of the cart's store build the page depends on, by part: the cart's
   * React CSS chunks rehash on Steam's store builds, and this map is their only home. The page
   * tags each part ([data-se-cart~="<part>"]) and cart/page.css styles the parts, not the hashes.
   */
  const ROLE = 'data-se-cart';
  const PARTS_MAP = [
    ['wash', '.otLXAz3VIiY-'],
    ['page', '.cE9cj0nbqpY-'],
    ['crumbs', '.OgjhAXUXuQw-'],
    ['crumb-current', '.l3tXfL5lEk0-'],
    ['title', '.X7xBVzjXbzw-'],
    ['notice', '.Px5OaOH5lTc-'],
    ['layout', '.escxTMUGmsQ-'],
    ['main', '.ieJQh9DBcSw-'],
    ['side', '.NKiRqw1jQHg-'],
    ['items', '.I3wNTGX8W84-'],
    ['item', '.i-xXuvHLioU-'],
    ['item-body', '.bKkQiLkI-vk-'],
    ['capsule', '._7RJqaqzA6VI-'],
    ['details', '.T7ZPZdCVy-E-'],
    ['platforms', '.F1Hc-V5ZZNo-'],
    ['item-foot', '.fDgifICDL4M-'],
    ['item-icons', '.P8g8lT95CGk-'],
    ['price-changed', '.YwCPuM47bBA-'],
    ['price', '.dstuYF4eZu4-'],
    ['price-was', '.-nS4ZC0Bruo-'],
    ['item-action', '.BFDdk5e7x8k-, ._8IaR06zcRE4-, ._5BH7TDomMoc-, .VlO2XVO6mXQ-'],
    ['actions', '.TVsiH2tTSD8-'],
    ['actions-group', '._16QRYa6K5mY-'],
    ['remove-all', '.HLT-2RoiFj8-'],
    ['button', '.D8IENuW8Q7w-'],
    ['continue', '.bJV2ai-gAcA-'],
    ['summary', '.FlJmiJl70GU-'],
    ['summary-card', '.i1XZFikuzME-'],
    ['total-row', '.ZxG3hS-2Jjo-'],
    ['total-label', '.fWNjRJXvRgI-'],
    ['total', '.n9HLAjXXhvI-'],
    ['tax-note', '.bi47TlP7SSw-'],
    ['licence', '.nfxC9n3FRVE-'],
    ['licence-title', '.FN7MZpXIvZw-'],
    ['licence-text', '.YrxkWXNtDMU-'],
    ['recs', '._982gncrqNug-'],
    ['recs-title', '._2fWfeYh526c-'],
    ['rec-grid', '.HErt5lcVyYU-'],
    ['rec', '.FrKuhV62L-U-'],
  ];
  const PAGE = PARTS_MAP.find(([part]) => part === 'page')[1];
  const PRICES = `:is(${PAGE}, [data-se-hcard]) .StoreSalePriceWidgetContainer`;
  const CARD = 'data-se-hcard';
  const PICK_MENU = '.l39SV-qhMqE-';
  // The recommendations' hover card in the cart's store build (DU31Ug13.css: a gradient slab in
  // Steam's tooltip layer). Found by its class first; by its wishlist button and tags otherwise.
  const HOVER_CARD = '.tWdu3iqQbcE-';
  const CARD_PARTS = [CARD, 'data-se-hcard-title', 'data-se-hcard-tags', 'data-se-hcard-capsule', 'data-se-hcard-meta', 'data-se-hcard-wish', 'data-se-hcard-slab', 'data-se-hcard-text'];
  // Steam's header capsule is 460×215; trailers and screenshots are 16:9, so the shape tells
  // them apart whether or not the trailer has laid out yet.
  const CAPSULE_RATIO = [1.9, 2.4];
  // Steam's wishlist star (every store build draws the same polygon); its holder is the button.
  const STAR = 'svg polygon[points^="50 4.7"]';

  const untagCard = (card) => {
    for (const node of [card, ...card.querySelectorAll(CARD_PARTS.map((name) => `[${name}]`).join(', '))]) {
      for (const name of CARD_PARTS) node.removeAttribute(name);
    }
  };

  /** Steam's link blue (#66c0f4 and its kin): blue clearly above red and green. */
  const isBlue = (color) => {
    const [r, g, b] = (color.match(/\d+(\.\d+)?/g) || []).map(Number);
    return b > 150 && b - r > 50 && b - g > 10;
  };

  /** The game's tag row: Steam's .WidgetTag chips, else the box holding three or more short links. */
  const tagRowOf = (card) => {
    const chip = card.querySelector('.WidgetTag');
    if (chip) return chip.parentElement;
    for (const box of card.querySelectorAll('div')) {
      const links = [...box.children].filter((child) => child.matches('a, span, div') && !child.childElementCount);
      if (links.length >= 3 && links.length === box.childElementCount && links.every((link) => link.textContent.trim().length <= 24)) return box;
    }
    return null;
  };

  /** The floating box a wishlist button sits in, holding the game's tags too. */
  const cardOf = (wish) => {
    for (let node = wish.parentElement; node && node !== document.body; node = node.parentElement) {
      if (!tagRowOf(node)) continue;
      const { position } = getComputedStyle(node);
      if (position === 'absolute' || position === 'fixed') return node;
    }
    return null;
  };

  /** The deepest node holding every one of nodes. */
  const commonAncestor = (nodes) => {
    if (!nodes.length) return null;
    let node = nodes[0].parentElement;
    while (node && !nodes.every((other) => node.contains(other))) node = node.parentElement;
    return node;
  };

  /**
   * Reads, then the writes to apply. null when the card isn't laid out yet (it fades in), so a
   * later pass retries it.
   */
  const readCard = (card) => {
    const area = (node) => {
      const box = node.getBoundingClientRect();
      return box.width * box.height;
    };
    const media = [...card.querySelectorAll('img, video')].filter((node) => !node.closest('.WishlistButton') && area(node) > 0);
    if (!media.length) return null;

    const writes = [];
    const [shot] = media.sort((a, b) => area(b) - area(a));
    const capsule = media.find((node) => {
      if (!node.matches('img') || node === shot) return false;
      const { width, height } = node.getBoundingClientRect();
      return width >= 120 && width / height >= CAPSULE_RATIO[0] && width / height <= CAPSULE_RATIO[1];
    });
    // The capsule loads after the card opens: tag nothing until it has, so a later pass reads
    // the finished card.
    if (!capsule) return null;
    writes.push([capsule.parentElement.childElementCount === 1 ? capsule.parentElement : capsule, 'data-se-hcard-capsule']);

    const tags = tagRowOf(card);
    if (tags) writes.push([tags, 'data-se-hcard-tags']);

    const star = card.querySelector(STAR)?.closest('svg')?.parentElement;
    if (star && star !== card) writes.push([star, 'data-se-hcard-wish']);

    // Nodes outside the price, tags and wishlist button: the largest text leaf is the title; Steam's
    // blue ones (review count, release date) and blue platform icons are the quiet metadata.
    let title = null;
    let titleSize = 0;
    for (const node of card.querySelectorAll('div, span, a, svg')) {
      if (node.closest('[data-se-price], .StoreSalePriceWidgetContainer, .WidgetTag, .WishlistButton') || tags?.contains(node) || star?.contains(node)) continue;
      const style = getComputedStyle(node);
      // Steam's gradient slab behind the text: the card's own panel shows through instead.
      if (!node.contains(shot) && (style.backgroundImage !== 'none' || !/rgba\(.*, 0\)|transparent/.test(style.backgroundColor))) {
        writes.push([node, 'data-se-hcard-slab']);
      }
      if (node.matches('svg')) {
        if (isBlue(style.fill) || isBlue(style.color)) writes.push([node, 'data-se-hcard-meta']);
        continue;
      }
      if (node.childElementCount || !node.textContent.trim()) continue;
      const size = parseFloat(style.fontSize) || 0;
      if (size > titleSize) {
        title = node;
        titleSize = size;
      }
      if (isBlue(style.color)) writes.push([node, 'data-se-hcard-meta']);
    }
    if (title) writes.push([title, 'data-se-hcard-title']);
    // The title, tags and metadata share one column; it takes the card's inset, unless it also
    // holds the screenshot (which stays edge to edge).
    const text = commonAncestor([title, tags].filter(Boolean));
    if (text && text !== card && !text.contains(shot)) writes.push([text, 'data-se-hcard-text']);
    writes.push([card, CARD]);
    return writes;
  };

  web.define(async (dom) => {
    const $ = dom.scope();
    await dom.ready();

    const tagged = new Set();
    const partNodes = new Set();
    const cards = new Set();
    const menus = new Set();

    // Wishlist buttons already walked up from: most sit in the cart's own tiles, never in a
    // hover card, and walking up (computed styles, a search for the tag row) is the costly part.
    const walked = new WeakSet();

    /** The open gift picker's width, read before any write (cart/page.css [data-se-cart-pick]). */
    const readPicker = () => {
      const picker = document.querySelector(`${PAGE} [role="combobox"][aria-expanded="true"]`);
      return picker ? `${Math.round(picker.getBoundingClientRect().width)}px` : null;
    };

    const tag = () => {
      // Reads: every card's layout, the picker's width.
      const pending = [];
      const found = new Set(document.querySelectorAll(HOVER_CARD));
      for (const wish of document.querySelectorAll('.WishlistButton')) {
        if (walked.has(wish)) continue;
        const card = cardOf(wish);
        if (card) found.add(card);
        else walked.add(wish);
      }
      for (const card of found) if (!card.hasAttribute(CARD)) pending.push(readCard(card));
      const pickerWidth = readPicker();
      const parts = new Map();
      for (const [part, selector] of PARTS_MAP) {
        for (const node of document.querySelectorAll(selector)) parts.set(node, [...(parts.get(node) || []), part]);
      }

      // Writes.
      for (const [node, names] of parts) {
        dom.mark(node, ROLE, names.join(' '));
        partNodes.add(node);
      }
      for (const node of partNodes) if (!node.isConnected) partNodes.delete(node);
      for (const writes of pending) {
        if (!writes) continue;
        for (const [node, name] of writes) dom.mark(node, name);
        cards.add(writes[writes.length - 1][0]);
      }
      for (const card of cards) if (!card.isConnected) cards.delete(card);

      for (const price of document.querySelectorAll(PRICES)) {
        dom.tagPrice(price);
        tagged.add(price);
      }
      for (const price of tagged) if (!price.isConnected) tagged.delete(price);

      if (pickerWidth) {
        for (const menu of document.querySelectorAll(PICK_MENU)) {
          dom.setVar(menu, '--se-cart-pick-w', pickerWidth);
          dom.mark(menu, 'data-se-cart-pick');
          menus.add(menu);
        }
      }
      for (const menu of menus) if (!menu.isConnected) menus.delete(menu);
    };

    tag();
    // The cart mounts and re-renders whole subtrees, and mounts the hover card on hover, so any
    // change may bring new widgets.
    $.observe(tag);
    /*
     * A hover card is tagged only once its capsule has loaded and it has faded in, but an image
     * finishing or a fade ending changes no DOM, so the observer alone would leave that card
     * as Steam drew it. load doesn't bubble: caught in the capture phase.
     */
    const settle = dom.perFrame(tag);
    for (const type of ['load', 'transitionend', 'animationend']) $.listen(document, type, settle, true);
    $.add(() => {
      for (const node of partNodes) node.removeAttribute(ROLE);
      for (const price of tagged) dom.untagPrice(price);
      for (const card of cards) untagCard(card);
      for (const menu of menus) {
        menu.removeAttribute('data-se-cart-pick');
        menu.style.removeProperty('--se-cart-pick-w');
      }
      tagged.clear();
      partNodes.clear();
      cards.clear();
      menus.clear();
    });

    return () => $.destroy();
  });
})();
