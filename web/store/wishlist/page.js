/*
 * Wishlist (/wishlist/id/<name>/, /wishlist/profiles/<steamid>/):
 *  - Tags Steam's React wishlist by part ([data-se-wl="<part>"]), so wishlist/page.css and the
 *    shared looks (shared/ui.css) style meaning, not hashed classes. Every hashed class the page
 *    depends on is in the maps below (the wishlist's own CSS chunks; this file is their only
 *    home), with a structural fallback where Steam keeps a stable hook.
 *  - Tags each row's price widget for the shared price chip ([data-se-price]).
 *  - The options column: Steam keeps its Options panel and Sort menu mounted while closed
 *    (popover="manual"), so page.css lays the Options form out in the column for good (the
 *    panel is kept from opening as a popover) and the Sort button becomes the column's
 *    dropdown. Each Options section is tagged by what it
 *    filters ([data-se-wl-opt]); a "Filters" head (count and Reset) is added above them. Steam's
 *    inputs stay the only state: Reset clicks them back to their defaults.
 *  - The header: a "Wishlist" label over the owner's name in its own case (the page title;
 *    Steam's heading is all caps), Share (copies the wishlist's link), notification settings
 *    and a line on ranking on your own wishlist only (Steam shows its Share button there and
 *    nowhere else), and stat tiles: the item count, and from the wishlist's store data how many
 *    are on sale and coming soon.
 *  - Layout: List (Steam's own rows) or Grid (wishlist/grid.js, drawn from the store data and
 *    following Steam's search, filters, View and Sort), switched in the column and remembered.
 *  - Store data (wishlist/data.js): the wishlist's apps, prices, releases and tags, loaded
 *    once per page from Steam's Web API as the store page itself does. It gives the column's Tags section (your top tags and how many
 *    games carry each; a tag goes into Steam's search, which matches tags) and the header's
 *    sale and coming-soon counts. Without it (a friend's list under a custom URL, a private
 *    list, the API unreachable) those parts stay hidden and Steam's search still finds tags.
 * The list is virtualised and drag-sortable: rows mount and unmount as it scrolls and Steam
 * re-renders a row's insides (Add to Cart → In Cart), so tagging reruns on every change and
 * writes only on change. destroy() untags everything and removes what was added.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  const ROLE = 'data-se-wl';
  const OPT = 'data-se-wl-opt';
  const VIEW = 'data-se-wl-view';
  const FILL = '--se-wl-fill';
  const LAYOUT = 'data-se-wl-layout';
  const DATE = 'data-se-wl-date';
  const ON = 'data-se-wl-on';
  const REVIEW = 'data-se-wl-review';
  const TOP_TAGS = 8; // tags shown before "Show all" (the column's Tags section)

  /** "Very Positive" → positive, "Mixed" → mixed, "Mostly Negative" → negative; else null. */
  const reviewLean = (text) => {
    const words = (text ?? '').trim().toLowerCase();
    if (/^(overwhelmingly |very |mostly )?positive$/.test(words)) return 'positive';
    if (words === 'mixed') return 'mixed';
    if (/^(overwhelmingly |very |mostly )?negative$/.test(words)) return 'negative';
    return null;
  };
  const LAYOUT_KEY = 'se-wishlist-layout';

  /* Page parts, found in the document. [part, selector] */
  const PAGE = [
    ['page', '.awGgT3ZKumU-'],
    ['head', '.KFyvA5BJClc-'],
    ['owner', '.n5zwruAY98Q-'],
    ['giftcard', '.z4nYR-MCfbI-'],
    ['bar', '.DFhzzTUhoEs-'],
    ['search', '.DFhzzTUhoEs- > input'],
    ['tools', '.smdxg72XyCE-'],
    ['options', '.IShbIXSFzbI-'],
    ['menu', '._8SeGvT1Jess-'],
    ['sort-value', '.JAybs32rLv4-'],
    ['count', '._8MgL3GQMdss-'],
    ['filter', '.cDJOlrqyRq8-'],
    ['list', '.PLkUpk974nY-'],
  ];
  const SEL = Object.fromEntries(PAGE);
  // Steam's Notification Settings link closes the Options form; the header's bell opens it too.
  const NOTIFY = 'a[href*="notificationsettings"]';
  const NOTIFY_URL = 'https://store.steampowered.com/account/notificationsettings';

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
  const EXTRAS = PARTS.find(([part]) => part === 'extras')[1];
  const NOT_FLAG = PARTS.filter(([part]) => ['tag', 'tags-label', 'demo'].includes(part)).map(([, selector]) => selector).join(', ');
  const PRICE = ':is(.Cj7J5QHbL-0-, .StoreSalePriceWidgetContainer)';

  /* ---------- Options sections ---------- */

  // The sections that filter the list: counted in the head, cleared by Reset.
  const FILTERS = new Set(['discount', 'price', 'type', 'platform', 'deck', 'exclude', 'demo']);

  /** What an Options section sets, from its inputs' names (Steam's form names are stable). */
  const optionKey = (section) => {
    if (section.querySelector(NOTIFY)) return 'notify';
    if (section.querySelector('input[type="range"]')) return 'price';
    const name = section.querySelector('input[name]')?.name ?? '';
    if (name === 'viewmode') return 'view';
    if (name.startsWith('exclude_')) return 'exclude';
    if (name === 'type_verified' || name === 'type_playable') return 'deck';
    if (name.startsWith('type_')) return 'type';
    if (name === 'has_demo') return 'demo';
    return name || null; // discount, platform
  };

  /** How far a section is from its default: radios count once, each ticked box once. */
  const changes = (section) => {
    const range = section.querySelector('input[type="range"]');
    if (range) return range.value === range.max ? 0 : 1;
    const radios = section.querySelectorAll('input[type="radio"]');
    if (radios.length) return radios[0].checked ? 0 : 1;
    return section.querySelectorAll('input[type="checkbox"]:checked').length;
  };

  // React tracks an input's value through its own setter: set it the native way, then announce it.
  const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

  /** Put one section back to its default through Steam's own inputs. */
  const resetSection = (section) => {
    const range = section.querySelector('input[type="range"]');
    if (range) {
      if (range.value === range.max) return;
      setNativeValue.call(range, range.max);
      range.dispatchEvent(new Event('input', { bubbles: true }));
      range.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }
    const first = section.querySelector('input[type="radio"]');
    if (first) {
      if (!first.checked) first.click();
      return;
    }
    for (const box of section.querySelectorAll('input[type="checkbox"]:checked')) box.click();
  };


  /* ---------- Reading the page ---------- */

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
    // A badge in the tag line that isn't a tag or the demo (Early Access): the innermost
    // element with text of its own.
    for (const extras of card.querySelectorAll(EXTRAS)) {
      for (const node of extras.querySelectorAll('*')) {
        if (node.children.length || !node.textContent.trim() || node.closest(NOT_FLAG)) continue;
        writes.push([node, 'flag']);
      }
    }
  };

  /** The owner's avatar, and their profile frame when they have one (frames are square art). */
  const readOwner = (owner, writes) => {
    const images = owner.querySelectorAll('a img');
    if (images[0]) writes.push([images[0], 'avatar']);
    if (images[1]) writes.push([images[1], 'frame']);
  };

  /** The toolbar's buttons: Options opens the form, Sort its menu; the rest is Share (own list). */
  const readTools = (tools, options, menu, writes) => {
    for (const button of tools.querySelectorAll(':scope > button')) {
      if (options && button.nextElementSibling === options) writes.push([button, 'options-btn']);
      else if (button.querySelector(SEL['sort-value']) || (menu && button.nextElementSibling === menu)) writes.push([button, 'sort']);
      else writes.push([button, 'share']);
    }
  };

  web.define(async (dom) => {
    const $ = dom.scope();
    await dom.ready();

    const priced = new Set();
    const keyed = new Set();
    let page = null;
    let options = null;

    /* The header's own row: Share, notification settings, and how ranking works. */
    const shareLabel = dom.el('span', { text: 'Share' });
    const share = dom.el('button', { type: 'button', [ROLE]: 'own-share', title: 'Copy a link to this wishlist' }, [
      dom.el('span', { [ROLE]: 'own-icon', 'aria-hidden': 'true' }),
      shareLabel,
    ]);
    const notify = dom.el('a', { href: NOTIFY_URL, [ROLE]: 'own-notify', title: 'Notification settings', 'aria-label': 'Notification settings' }, [
      dom.el('span', { [ROLE]: 'own-icon', 'aria-hidden': 'true' }),
    ]);
    const meta = $.owned(dom.el('div', { [ROLE]: 'own-meta' }, [
      share,
      notify,
      dom.el('span', { [ROLE]: 'own-sep', 'aria-hidden': 'true' }),
      dom.el('span', { [ROLE]: 'own-hint', text: 'Ranked by you. Drag a game, or type a number, to move it.' }),
    ]));

    /* The owner's name as the page title has it ("NVHT's wishlist"); Steam's heading stays if
       the title says something else. */
    const pageTitle = dom.squash(document.title.split(/\s[|–—-]\s/)[0]);
    const heading = /wishlist/i.test(pageTitle)
      ? $.owned(dom.el('div', { [ROLE]: 'own-heading' }, [
        dom.el('span', { [ROLE]: 'own-label', text: 'Wishlist' }),
        dom.el('h1', { [ROLE]: 'own-name', text: pageTitle }),
      ]))
      : null;

    /* Stat tiles: the item count (following Steam's count), then from the store data how many
       are on sale and coming soon. */
    const tile = (label, part = '') => {
      const value = dom.el('span', { [ROLE]: `own-stat-value${part}` });
      const node = dom.el('div', { [ROLE]: 'own-stat', hidden: true }, [dom.el('span', { [ROLE]: 'own-label', text: label }), value]);
      return { node, value };
    };
    const items = tile('Items');
    const onSale = tile('On sale', '-sale');
    const comingSoon = tile('Coming soon');
    const stats = $.owned(dom.el('div', { [ROLE]: 'own-stats' }, [items.node, onSale.node, comingSoon.node]));

    /* The column's "Display" head, over View and Sort, and Sort's own label. */
    const display = $.owned(dom.el('div', { [ROLE]: 'own-display', text: 'Display' }));
    const sortLabel = $.owned(dom.el('div', { [ROLE]: 'own-sort-label', text: 'Sort by' }));

    /* List or Grid: an icon switch leading the View row, shown once the store data (which the grid is
       drawn from) has loaded. The choice is kept for next time. */
    const layoutButton = (value, label) => dom.el('button', { type: 'button', [ROLE]: 'own-layout-btn', 'data-se-wl-layout-option': value, 'aria-pressed': 'false', 'aria-label': label, title: label });
    const layoutList = layoutButton('list', 'List');
    const layoutGrid = layoutButton('grid', 'Grid');
    const layoutSwitch = $.owned(dom.el('div', { [ROLE]: 'own-layout', role: 'group', 'aria-label': 'Layout', hidden: true }, [layoutList, layoutGrid]));
    let layout = 'list';
    try {
      if (localStorage.getItem(LAYOUT_KEY) === 'grid') layout = 'grid';
    } catch {}
    const grid = web.parts.wishlistGrid?.create(dom, () => ({
      form: options?.querySelector('form') ?? null,
      query: searchBox()?.value ?? '',
      sort: page?.querySelector(SEL['sort-value'])?.textContent ?? '',
    })) ?? null;
    if (grid) {
      $.owned(grid.node);
      $.add(grid.destroy);
    }

    /* The items in view (Steam's list or the grid) ease in after a change of layout or view:
       a short fade and rise, so the switch reads as one motion instead of a jump. */
    const settle = () => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const items = grid && !grid.node.hidden ? grid.node : page?.querySelector(SEL.list);
      items?.animate?.(
        [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }],
        { duration: 200, easing: 'cubic-bezier(.2, .7, .2, 1)' },
      );
    };

    /* The column's "Filters" head: how many are on, and Reset. */
    const count = dom.el('span', { [ROLE]: 'own-count', hidden: true });
    const reset = dom.el('button', { type: 'button', [ROLE]: 'own-reset', text: 'Reset', disabled: true });
    const head = $.owned(dom.el('div', { [ROLE]: 'own-filters' }, [
      dom.el('span', { [ROLE]: 'own-title', text: 'Filters' }),
      count,
      reset,
    ]));

    /*
     * The column's Tags section, from the store data: "Find a tag", your top tags as chips with
     * how many games carry each, and "Show all". A chip puts its tag in Steam's search (which
     * matches tags); the chip in the search now shows on, and clicking it again clears it.
     */
    let tagData = [];
    let listTotal = null;
    let showAll = false;
    const tagFind = dom.el('input', { type: 'search', placeholder: 'Find a tag', 'aria-label': 'Find a tag', [ROLE]: 'own-tag-find' });
    const tagList = dom.el('div', { [ROLE]: 'own-tag-list', role: 'group', 'aria-label': 'Tags' });
    const tagMore = dom.el('button', { type: 'button', [ROLE]: 'own-tag-more' });
    const tagField = dom.el('label', { [ROLE]: 'own-tag-field' }, [tagFind]);
    const tagRetry = dom.el('button', { type: 'button', [ROLE]: 'own-tag-more', text: 'Retry' });
    const tagError = dom.el('div', { [ROLE]: 'own-tag-error', hidden: true }, [
      dom.el('span', { text: 'Couldn’t load your tags.' }),
      tagRetry,
    ]);
    const tags = $.owned(dom.el('section', { [ROLE]: 'own-tags', hidden: true }, [
      dom.el('h3', { [ROLE]: 'own-tags-title', text: 'Tags' }),
      tagField,
      tagList,
      tagMore,
      tagError,
    ]));

    const searchBox = () => page?.querySelector(SEL.search);

    /** Steam's search, set the way React hears it. */
    const search = (text) => {
      const box = searchBox();
      if (!box) return;
      setNativeValue.call(box, text);
      box.dispatchEvent(new Event('input', { bubbles: true }));
    };

    /** The chips for the tags in view: the top ones, every one, or those matching "Find a tag". */
    const renderTags = () => {
      const query = dom.squash(tagFind.value).toLowerCase();
      const shown = query
        ? tagData.filter((tag) => tag.name.toLowerCase().includes(query))
        : showAll ? tagData : tagData.slice(0, TOP_TAGS);
      tagList.replaceChildren(...shown.map((tag) => dom.el('button', {
        type: 'button',
        [ROLE]: 'own-tag',
        'data-se-wl-tag': tag.name,
        'aria-pressed': 'false',
      }, [tag.name, dom.el('span', { [ROLE]: 'own-tag-count', text: String(tag.count) })])));
      tagMore.hidden = Boolean(query) || tagData.length <= TOP_TAGS;
      dom.setText(tagMore, showAll ? 'Show fewer' : `Show all ${tagData.length} tags`);
      syncTags();
    };

    /** Each chip on while its tag is Steam's search. */
    const syncTags = () => {
      const current = dom.squash(searchBox()?.value).toLowerCase();
      for (const chip of tagList.children) {
        const on = chip.dataset.seWlTag.toLowerCase() === current;
        if (chip.getAttribute('aria-pressed') !== String(on)) chip.setAttribute('aria-pressed', String(on));
      }
    };

    $.listen(tagList, 'click', (event) => {
      const chip = event.target.closest('[data-se-wl-tag]');
      if (!chip) return;
      search(chip.getAttribute('aria-pressed') === 'true' ? '' : chip.dataset.seWlTag);
      syncTags();
    });
    $.listen(tagFind, 'input', renderTags);
    $.listen(tagMore, 'click', () => {
      showAll = !showAll;
      renderTags();
    });

    /** What follows Steam's inputs: the view, the filter count, the price track's fill. */
    const sync = dom.perFrame(() => {
      // The whole list once the store data is in (Steam's count follows its filters).
      const total = listTotal ?? page?.querySelector(SEL.count)?.textContent.match(/\d[\d,.\s]*/)?.[0].trim() ?? '';
      dom.setText(items.value, total);
      items.node.hidden = !total;
      syncTags();

      if (!options?.isConnected) return;
      let changed = 0;
      for (const section of keyed) {
        if (!section.isConnected) continue;
        const key = section.getAttribute(OPT);
        if (FILTERS.has(key)) changed += changes(section);
      }
      dom.setText(count, String(changed));
      count.hidden = !changed;
      reset.disabled = !changed;

      syncLayout();
      const view = options.querySelector('input[name="viewmode"]:checked')?.value;
      if (page && view) dom.mark(page, VIEW, view);

      const range = options.querySelector('input[type="range"]');
      if (range) {
        const span = Number(range.max) - Number(range.min) || 1;
        dom.setVar(range, FILL, `${((Number(range.value) - Number(range.min)) / span) * 100}%`);
      }
    });

    /** The layout in force: Grid only once its data is in. */
    const syncLayout = () => {
      const gridOn = layout === 'grid' && Boolean(grid) && !layoutSwitch.hidden;
      if (page) dom.mark(page, LAYOUT, gridOn ? 'grid' : 'list');
      for (const button of [layoutList, layoutGrid]) {
        const on = button.dataset.seWlLayoutOption === (gridOn ? 'grid' : 'list');
        if (button.getAttribute('aria-pressed') !== String(on)) button.setAttribute('aria-pressed', String(on));
      }
      if (grid) {
        grid.node.hidden = !gridOn;
        grid.render();
      }
    };
    $.listen(layoutSwitch, 'click', (event) => {
      const button = event.target.closest('[data-se-wl-layout-option]');
      if (!button) return;
      if (button.dataset.seWlLayoutOption === layout) return;
      layout = button.dataset.seWlLayoutOption;
      try {
        localStorage.setItem(LAYOUT_KEY, layout);
      } catch {}
      syncLayout();
      settle();
    });

    const tag = () => {
      const writes = [];
      for (const [part, selector] of PAGE) {
        for (const node of document.querySelectorAll(selector)) writes.push([node, part]);
      }

      // The search field: the shared search field, its magnifier drawn on the column
      const search = document.querySelector(SEL.search);
      $.search(search, search?.parentElement);

      page = document.querySelector(SEL.page);
      options = document.querySelector(SEL.options) ?? document.querySelector(`${SEL.tools} > [popover]:has(> form)`);
      const menu = document.querySelector(SEL.menu);
      if (options) writes.push([options, 'options']);

      if (page) {
        // Steam's page wrapper and the art wash it paints behind the column.
        const stage = page.parentElement;
        writes.push([stage, 'stage']);
        for (const child of stage.children) if (child !== page && !child.childElementCount) writes.push([child, 'wash']);
        for (const owner of page.querySelectorAll(SEL.owner)) readOwner(owner, writes);
        // A friend's wishlist: Steam's "Send a Gift Card" link beside the owner.
        const pageHead = page.querySelector(SEL.head);
        if (pageHead && !pageHead.querySelector(SEL.giftcard)) {
          for (const link of pageHead.querySelectorAll(':scope > a')) writes.push([link, 'giftcard']);
        }
        // The active filter chips' row.
        const filter = page.querySelector(SEL.filter);
        if (filter && filter.parentElement !== page) writes.push([filter.parentElement, 'filters']);
      }
      const tools = document.querySelector(SEL.tools);
      if (tools) readTools(tools, options, menu, writes);

      // Each Options section, by what it sets.
      const sections = [];
      if (options) {
        for (const section of options.querySelectorAll('form > section')) {
          const key = optionKey(section);
          if (key) sections.push([section, key]);
        }
        const link = options.querySelector(NOTIFY);
        if (link && notify.href !== link.href) notify.href = link.href;
      }

      const prices = [];
      for (const card of cardsIn(document)) {
        readCard(card, writes);
        prices.push(...card.querySelectorAll(PRICE));
      }

      for (const [node, part] of writes) dom.mark(node, ROLE, part);
      for (const [section, key] of sections) {
        dom.mark(section, OPT, key);
        keyed.add(section);
      }
      for (const section of keyed) if (!section.isConnected) keyed.delete(section);
      for (const price of prices) {
        dom.tagPrice(price);
        priced.add(price);
      }
      for (const price of priced) if (!price.isConnected) priced.delete(price);
      // The Sort menu's row for the order in force.
      const sortText = dom.squash(page?.querySelector(SEL['sort-value'])?.textContent).toLowerCase();
      for (const item of menu?.querySelectorAll(':scope > button') ?? []) {
        if (sortText && dom.squash(item.textContent).toLowerCase() === sortText) dom.mark(item, ON);
        else dom.unmark(item, ON);
      }
      // How the reviews lean, from Steam's summary words: the fact's icon and colour follow.
      for (const value of document.querySelectorAll(`[${ROLE}="fact-value"]`)) {
        const fact = value.closest(`[${ROLE}="fact"]`);
        const lean = reviewLean(value.textContent);
        if (fact && lean) dom.mark(fact, REVIEW, lean);
        else if (fact) dom.unmark(fact, REVIEW);
      }
      // "Added on Dec 10, 2020": the date alone, for the card's "Added Dec 10, 2020".
      for (const added of document.querySelectorAll(`[${ROLE}="added-date"]`)) {
        const date = added.textContent.match(/^\s*Added on\s+(.+?)\s*$/i)?.[1];
        if (date) dom.mark(added, DATE, date);
        else dom.unmark(added, DATE);
      }

      // The theme's own parts, put back if Steam re-rendered their parents.
      const owner = page?.querySelector(SEL.owner);
      if (owner && heading && heading.parentNode !== owner) owner.append(heading);
      if (owner && meta.parentNode !== owner) owner.append(meta);
      const pageHead = page?.querySelector(SEL.head);
      if (pageHead && stats.parentNode !== pageHead) pageHead.append(stats);
      const bar = page?.querySelector(SEL.bar);
      if (bar && display.parentNode !== bar) bar.append(display);
      // List / Grid leads the View row, before Compact / Expanded (after its heading).
      const viewRow = options?.querySelector(`[${OPT}="view"]`);
      const viewHead = viewRow?.querySelector(':scope > h3');
      if (viewRow && (layoutSwitch.parentNode !== viewRow || layoutSwitch.previousElementSibling !== viewHead)) {
        if (viewHead) viewHead.after(layoutSwitch);
        else viewRow.prepend(layoutSwitch);
      }
      const list = page?.querySelector(SEL.list);
      if (grid && list && grid.node.previousElementSibling !== list) list.after(grid.node);
      if (bar && sortLabel.parentNode !== bar) bar.append(sortLabel);
      if (bar && head.parentNode !== bar) bar.append(head);
      if (bar && tags.parentNode !== bar) bar.append(tags);

      load();
      sync();
    };

    let shareReset = 0;
    $.listen(share, 'click', async () => {
      const copied = await dom.copy(`${location.origin}${location.pathname}`);
      if (!$.alive) return;
      dom.setText(shareLabel, copied ? 'Link copied' : 'Couldn’t copy');
      clearTimeout(shareReset);
      shareReset = $.timeout(() => dom.setText(shareLabel, 'Share'), 2000);
    });
    $.listen(reset, 'click', () => {
      for (const section of keyed) {
        if (section.isConnected && FILTERS.has(section.getAttribute(OPT))) resetSection(section);
      }
      sync();
    });
    // The Options form lives in the column: Steam opening it as a popover would lift it into
    // the top layer, over the page. Opening is cancelable, so it never happens.
    $.listen(document, 'beforetoggle', (event) => {
      if (event.target === options && event.newState === 'open') event.preventDefault();
    }, true);
    // The Sort menu opens as wide as the Sort field and under its left edge (Steam places it a
    // little off and sizes it to its rows). Width first, as Steam may place it by either edge.
    $.listen(document, 'toggle', (event) => {
      const menu = event.target;
      if (event.newState !== 'open' || menu?.getAttribute?.(ROLE) !== 'menu') return;
      const field = document.querySelector(`[${ROLE}="sort"]`);
      if (!field) return;
      dom.setVar(menu, '--se-wl-menu-dx', '0px');
      dom.setVar(menu, '--se-wl-menu-w', `${field.getBoundingClientRect().width}px`);
      const dx = field.getBoundingClientRect().left - menu.getBoundingClientRect().left;
      dom.setVar(menu, '--se-wl-menu-dx', `${Math.round(dx * 100) / 100}px`);
    }, true);
    // Compact / Expanded: once Steam has redrawn its rows (next frame), the items ease in.
    $.listen(document, 'change', (event) => {
      if (event.target?.name !== 'viewmode') return;
      requestAnimationFrame(() => requestAnimationFrame(() => $.alive && settle()));
    }, true);
    // Steam's inputs change their checked state and value without touching the DOM tree.
    $.listen(document, 'change', sync, true);
    $.listen(document, 'input', sync, true);

    // The store data, once Steam has loaded the list (its count is up, so its own wishlist
    // request has been made) and its toolbar (on your own list it holds the Share button).
    const loading = new AbortController();
    $.add(() => loading.abort());
    let loadStarted = false;
    /** The Tags section loaded (its chips), or failed (a line and Retry; the reason on hover). */
    const showTags = (error = null) => {
      tags.hidden = false;
      tagError.hidden = !error;
      tagError.title = error ? String(error.message || error) : '';
      tagField.hidden = Boolean(error);
      tagList.hidden = Boolean(error);
      if (error) tagMore.hidden = true;
      else renderTags();
    };

    const load = () => {
      if (loadStarted || !document.querySelector(SEL.tools) || !/\d/.test(document.querySelector(SEL.count)?.textContent ?? '')) return;
      loadStarted = true;
      web.parts.wishlistData.load(Boolean(document.querySelector(`[${ROLE}="share"]`)), loading.signal)
        .then((data) => {
          if (!$.alive || !data) return;
          dom.setText(onSale.value, String(data.onSale));
          dom.setText(comingSoon.value, String(data.comingSoon));
          onSale.node.hidden = false;
          comingSoon.node.hidden = false;
          listTotal = data.total.toLocaleString();
          tagData = data.tags;
          if (grid && data.apps.length) {
            grid.setApps(data.apps, Boolean(document.querySelector(`[${ROLE}="share"]`)));
            layoutSwitch.hidden = false;
            sync();
          }
          showTags(tagData.length ? null : new Error(`No tags in the store data (${data.summary})`));
        })
        .catch((error) => {
          if (error.name === 'AbortError' || !$.alive) return;
          console.warn('[Steam Enhanced] Wishlist store data:', error);
          showTags(error);
        });
    };
    $.listen(tagRetry, 'click', () => {
      loadStarted = false;
      tagError.hidden = true;
      load();
    });

    tag();

    // Rows mount as the list scrolls and Steam re-renders their insides: any child-list change
    // may bring new parts. Drag moves only restyle rows (style attributes), which don't wake this.
    $.observe(tag);
    $.add(() => {
      sync.cancel();
      for (const node of document.querySelectorAll(`[${ROLE}]`)) node.removeAttribute(ROLE);
      for (const node of document.querySelectorAll(`[${OPT}]`)) node.removeAttribute(OPT);
      for (const node of document.querySelectorAll(`[${VIEW}]`)) node.removeAttribute(VIEW);
      page?.removeAttribute(LAYOUT);
      for (const node of document.querySelectorAll(`[${DATE}]`)) node.removeAttribute(DATE);
      for (const node of document.querySelectorAll(`[${ON}]`)) node.removeAttribute(ON);
      for (const node of document.querySelectorAll(`[${REVIEW}]`)) node.removeAttribute(REVIEW);
      for (const node of document.querySelectorAll('input[type="range"]')) node.style.removeProperty(FILL);
      for (const node of document.querySelectorAll(`[${ROLE}="menu"]`)) {
        node.style.removeProperty('--se-wl-menu-w');
        node.style.removeProperty('--se-wl-menu-dx');
      }
      for (const price of priced) dom.untagPrice(price);
      priced.clear();
      keyed.clear();
    });

    return () => $.destroy();
  });
})();
