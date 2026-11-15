/*
 * Wishlist (/wishlist/id/<name>/, /wishlist/profiles/<steamid>/):
 *  - Tags Steam's React wishlist by part ([data-se-wl="<part>"]), so wishlist/page.css and the
 *    shared looks (shared/ui.css) style meaning, not hashed classes. Every hashed class the page
 *    depends on is in the maps below (the wishlist's own CSS chunks; this file is their only
 *    home), with a structural fallback where Steam keeps a stable hook.
 *  - Tags each row's price widget for the shared price chip ([data-se-price]).
 * The list is virtualised and drag-sortable: rows mount and unmount as it scrolls and Steam
 * re-renders a row's insides (Add to Cart → In Cart), so tagging reruns on every change and
 * writes only on change. destroy() untags everything.
 */

const ROLE = 'data-se-wl';

/* Page parts, found in the document. [part, selector] */
const PAGE = [
  ['page', '.awGgT3ZKumU-'],
  ['head', '.KFyvA5BJClc-'],
  ['owner', '.n5zwruAY98Q-'],
  ['bar', '.DFhzzTUhoEs-'],
  ['search', '.DFhzzTUhoEs- > input'],
  ['menu', '.h2hJmhz41JY-'],
  ['sort-value', '.JAybs32rLv4-'],
  ['count', '._8MgL3GQMdss-'],
  ['filter', '.cDJOlrqyRq8-'],
  ['list', '.PLkUpk974nY-'],
];
const SEL = Object.fromEntries(PAGE);
// The toolbar's buttons (Options, Sort, view), not the items of the menus they open: a label
// makes a pill, an icon alone an icon button.
const TOOLS = '.smdxg72XyCE- > button';

/* A row's card, then its parts, found inside each card. [part, selector, fallback] */
const CARD = '.PE-3oq-yIvg-';
// react-beautiful-dnd's own attributes: stable whatever Steam's build hashes.
const DRAG_HANDLE = '[data-rbd-drag-handle-draggable-id]';
const DRAGGABLE = '[data-rbd-draggable-id]';
const PARTS = [
  ['handle', '.E0AZ1CRvqNk-', DRAG_HANDLE],
  ['grip', '.A-pGqULyrJo-'],
  ['rank', '.Ndh5LdeIG9s- input', `${DRAG_HANDLE} input`],
  ['capsule', '.nyQD3NZQjZU-', 'a[href*="/app/"]:has(img)'],
  ['title', '.P-zVPa2bdmQ-'],
  ['cats', '.lZzQoZsDjew-'],
  ['cats-label', '.JmLh4Njn6Xg-'],
  ['cat-add', '.Vy3rNuKLunU-'],
  ['details', '.S5hFnwUsp6o-'],
  ['facts', '.uQ8Li0MwEhQ-'],
  ['fact-label', '.TU39sK7r2pU-'],
  ['fact-value', '.nqLMv8j-iBw-'],
  ['extras', '.eX2oOjw5sGc-'],
  ['demo', '.kkZ9PsIE60o-'],
  ['tags', '._9JnnSUDfcOw-'],
  ['tags-label', '.ZdGB16lKY0I-'],
  ['tag', '.U3ndjc3qoW8-'],
  ['buy', '._5obTMJByPr0-'],
  ['cart', '.LrqeL6o22aQ-'],
  ['added', '._7RIfZsoAbnY-'],
  ['added-date', '.lgaj8WbBqtc-'],
  ['remove', '.p0Gsr94HawQ-'],
  ['remove-label', '.MqFcMoKfvAw-'],
];
const FACTS = PARTS.find(([part]) => part === 'facts')[1];
const PRICE = ':is(.Cj7J5QHbL-0-, .StoreSalePriceWidgetContainer)';

/** Every card on screen: by class, else the parent of each drag handle. */
const cardsIn = (root) => {
  const cards = [...root.querySelectorAll(CARD)];
  if (cards.length) return cards;
  return [...root.querySelectorAll(DRAG_HANDLE)].map((handle) => handle.parentElement).filter(Boolean);
};

/** [node, part] writes for one card, read before any is applied. */
const readCard = (card, writes) => {
  writes.push([card, 'card']);
  const row = card.closest(DRAGGABLE);
  if (row && row !== card) writes.push([row, 'row']);
  for (const [part, selector, fallback] of PARTS) {
    let nodes = card.querySelectorAll(selector);
    if (!nodes.length && fallback) nodes = card.querySelectorAll(fallback);
    for (const node of nodes) writes.push([node, part]);
  }
  for (const fact of card.querySelectorAll(`${FACTS} > *`)) writes.push([fact, 'fact']);
};

/** The owner's avatar, and their profile frame when they have one (frames are square art). */
const readOwner = (owner, writes) => {
  const images = owner.querySelectorAll('a img');
  if (images[0]) writes.push([images[0], 'avatar']);
  if (images[1]) writes.push([images[1], 'frame']);
};

export default async (dom) => {
  const $ = dom.scope();
  await dom.ready();

  const priced = new Set();

  const tag = () => {
    const writes = [];
    for (const [part, selector] of PAGE) {
      for (const node of document.querySelectorAll(selector)) writes.push([node, part]);
    }
    for (const button of document.querySelectorAll(TOOLS)) {
      writes.push([button, dom.squash(button.textContent) ? 'tool' : 'tool-icon']);
    }

    const page = document.querySelector(SEL.page);
    if (page) {
      // Steam's page wrapper and the art wash it paints behind the column.
      const stage = page.parentElement;
      writes.push([stage, 'stage']);
      for (const child of stage.children) if (child !== page && !child.childElementCount) writes.push([child, 'wash']);
      for (const owner of page.querySelectorAll(SEL.owner)) readOwner(owner, writes);
      // The active filter chips' row.
      const filter = page.querySelector(SEL.filter);
      if (filter && filter.parentElement !== page) writes.push([filter.parentElement, 'filters']);
    }

    const prices = [];
    for (const card of cardsIn(document)) {
      readCard(card, writes);
      prices.push(...card.querySelectorAll(PRICE));
    }

    for (const [node, part] of writes) dom.mark(node, ROLE, part);
    for (const price of prices) {
      dom.tagPrice(price);
      priced.add(price);
    }
    for (const price of priced) if (!price.isConnected) priced.delete(price);
  };

  tag();
  // Rows mount as the list scrolls and Steam re-renders their insides: any child-list change
  // may bring new parts. Drag moves only restyle rows (style attributes), which don't wake this.
  $.observe(tag);
  $.add(() => {
    for (const node of document.querySelectorAll(`[${ROLE}]`)) node.removeAttribute(ROLE);
    for (const price of priced) dom.untagPrice(price);
    priced.clear();
  });

  return () => $.destroy();
};
