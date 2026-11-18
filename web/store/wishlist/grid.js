/*
 * Wishlist grid (a part: web.parts.wishlistGrid, used by wishlist/page.js).
 *
 * Steam draws the wishlist as one virtualised list with rows of a fixed height, so a grid can't
 * be Steam's own rows rearranged: the grid is drawn by the theme from the wishlist's store data
 * (page.js loads it once per page). It follows Steam's own controls, which stay the only state:
 * the search (names and tags), every Options filter, View (Compact: smaller cards) and the
 * Sort menu's choice. Cards link to the game's page; the buy button opens its purchase area
 * (Add to Cart there, or Purchase as a Gift on a friend's list).
 *
 * Each card is built once and kept by app; a render only filters, sorts and reorders them, and
 * touches the DOM only when the order changes.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  const ROLE = 'data-se-wl';
  const ASSETS = 'https://shared.fastly.steamstatic.com/store_item_assets/';
  const CARD_TAGS = 2; // tags on a card
  const DECK = { type_verified: 3, type_playable: 2 }; // Steam Deck compatibility categories
  const TYPES = { type_games: [0], type_software: [6, 13], type_dlc: [4] }; // EStoreAppType

  const num = (value) => Number(value ?? 0) || 0;
  const list = (value) => [].concat(value ?? []).filter(Boolean);

  /** A store asset's URL from the item's format ("steam/apps/<id>/${FILENAME}?t=…"). */
  const assetURL = (app, file) => {
    const format = app.assets?.asset_url_format;
    if (format && file) return ASSETS + format.replace('${FILENAME}', file);
    return `${ASSETS}steam/apps/${app.appid}/header.jpg`;
  };

  const price = (app) => app.best_purchase_option ?? null;
  const cents = (app) => (app.is_free ? 0 : num(price(app)?.final_price_in_cents));
  const discount = (app) => num(price(app)?.discount_pct);
  const comingSoon = (app) => Boolean(app.release?.is_coming_soon ?? app.is_coming_soon);
  const released = (app) => num(app.release?.steam_release_date);
  const review = (app) => app.reviews?.summary_filtered ?? null;

  /** "Under $15.00" → 1500 (cents); the datalist's labels are in the store's currency. */
  const limitCents = (label) => {
    const digits = (label ?? '').replace(/[^\d.,]/g, '');
    if (!digits) return Infinity;
    const normal = /,\d{2}$/.test(digits) ? digits.replace(/\./g, '').replace(',', '.') : digits.replace(/,/g, '');
    return Math.round(parseFloat(normal) * 100);
  };

  /** What Steam's controls ask for, read from its inputs. */
  const readControls = (form, query, sortText) => {
    const on = (name) => Boolean(form?.querySelector(`input[name="${name}"]:checked`));
    const radio = (name) => form?.querySelector(`input[name="${name}"]:checked`)?.value ?? '';
    const range = form?.querySelector('input[type="range"]');
    let maxCents = Infinity;
    if (range && range.value !== range.max) {
      maxCents = range.value === range.min
        ? 0
        : limitCents(range.list?.querySelector(`option[value="${range.value}"]`)?.label);
    }
    return {
      query: (query ?? '').trim().toLowerCase(),
      compact: radio('viewmode') === 'compact',
      platform: radio('platform'),
      discount: radio('discount'),
      types: Object.keys(TYPES).filter(on).flatMap((name) => TYPES[name]),
      deck: Object.keys(DECK).filter(on).map((name) => DECK[name]),
      noEarly: on('exclude_earlyaccess'),
      noPre: on('exclude_prerelease'),
      noVR: on('exclude_vr'),
      demo: on('has_demo'),
      maxCents,
      sort: (sortText ?? '').toLowerCase(),
    };
  };

  const matches = (app, c) => {
    if (c.query && !app.name?.toLowerCase().includes(c.query) && !app.tagNames.some((tag) => tag.toLowerCase().includes(c.query))) return false;
    const p = app.platforms ?? {};
    if (c.platform === 'mac' && !p.mac) return false;
    if (c.platform === 'linux' && !p.steamos_linux) return false;
    if (c.discount === 'any' && !discount(app)) return false;
    if (/^\d+$/.test(c.discount) && discount(app) < Number(c.discount)) return false;
    if (c.types.length && !c.types.includes(num(app.type))) return false;
    if (c.deck.length && !c.deck.includes(num(p.steam_deck_compat_category))) return false;
    if (c.noEarly && (app.is_early_access || app.release?.is_early_access)) return false;
    if (c.noPre && comingSoon(app)) return false;
    if (c.noVR && p.vr_support?.vrhmd_only) return false;
    if (c.demo && !list(app.related_items?.demo_appid).length && !list(app.related_items?.demos).length) return false;
    if (c.maxCents !== Infinity && (comingSoon(app) || cents(app) > c.maxCents)) return false;
    return true;
  };

  /** Steam's sort choices by their menu text; anything unknown keeps your ranking. */
  const SORTS = [
    [/name/, (a, b) => (a.name ?? '').localeCompare(b.name ?? '')],
    [/price/, (a, b) => cents(a) - cents(b)],
    [/discount/, (a, b) => discount(b) - discount(a)],
    [/added/, (a, b) => num(b.date_added) - num(a.date_added)],
    [/release/, (a, b) => (released(b) || Infinity) - (released(a) || Infinity)],
    [/review/, (a, b) => num(review(b)?.review_score) - num(review(a)?.review_score) || num(review(b)?.percent_positive) - num(review(a)?.percent_positive)],
  ];
  const byRank = (a, b) => a.rank - b.rank;

  const sorter = (text) => {
    const found = SORTS.find(([test]) => test.test(text));
    return found ? (a, b) => found[1](a, b) || byRank(a, b) : byRank;
  };

  /** The shared price chip's markup (shared/ui-price.css): badge, then was over now. */
  const priceChip = (dom, app) => {
    const option = price(app);
    if (app.is_free) return dom.el('div', { [ROLE]: 'own-price', 'data-se-price': true }, [dom.el('div', { 'data-se-price-now': true, text: 'Free' })]);
    if (!option?.formatted_final_price) return null;
    const pct = discount(app);
    return dom.el('div', { [ROLE]: 'own-price', 'data-se-price': true }, [
      pct ? dom.el('div', { 'data-se-price-pct': true, text: `-${pct}%` }) : null,
      pct && option.formatted_original_price
        ? dom.el('div', { 'data-se-price-amounts': true }, [
          dom.el('div', { 'data-se-price-was': true, text: option.formatted_original_price }),
          dom.el('div', { 'data-se-price-now': true, text: option.formatted_final_price }),
        ])
        : dom.el('div', { 'data-se-price-now': true, text: option.formatted_final_price }),
    ]);
  };

  /** Steam's review score (1 Overwhelmingly Negative … 5 Mixed … 9 Overwhelmingly Positive). */
  const lean = (score) => (score >= 6 ? 'positive' : score === 5 ? 'mixed' : score >= 1 ? 'negative' : null);

  /** The line under the title: the review label, then the year (or when it's coming). */
  const factLine = (app) => {
    const facts = [];
    const summary = review(app);
    if (summary?.review_score_label && num(summary.review_count)) facts.push(['review', summary.review_score_label, lean(num(summary.review_score))]);
    if (comingSoon(app)) facts.push(['date', app.release?.custom_release_date_message || 'Coming soon']);
    else if (released(app)) facts.push(['date', String(new Date(released(app) * 1000).getFullYear())]);
    return facts;
  };

  const buildCard = (dom, app, own) => {
    const href = `/app/${app.appid}/`;
    const art = app.assets?.header;
    const img = dom.el('img', {
      src: assetURL(app, art),
      alt: '',
      loading: 'lazy',
      decoding: 'async',
      ...(app.assets?.header_2x ? { srcset: `${assetURL(app, art)} 1x, ${assetURL(app, app.assets.header_2x)} 2x` } : {}),
    });
    img.addEventListener('error', () => {
      const fallback = `${ASSETS}steam/apps/${app.appid}/header.jpg`;
      if (img.src !== fallback) {
        img.removeAttribute('srcset');
        img.src = fallback;
      }
    }, { once: true });
    const rank = own ? dom.el('span', { [ROLE]: 'own-grid-rank', text: `#${app.rank}`, title: 'Your rank' }) : null;
    const buyLabel = own ? 'Add to Cart' : 'Purchase as a Gift';
    // The card holds the hover shadow; its contents sit in a wrapper that skips rendering
    // off-screen (content-visibility on the card itself would clip the shadow).
    return dom.el('article', { [ROLE]: 'own-grid-card', 'data-se-wl-app': String(app.appid) }, [dom.el('div', { [ROLE]: 'own-grid-inner' }, [
      dom.el('a', { [ROLE]: 'own-grid-art', href, tabIndex: -1, 'aria-hidden': 'true' }, [img, rank]),
      dom.el('div', { [ROLE]: 'own-grid-body' }, [
        dom.el('a', { [ROLE]: 'own-grid-title', href, text: app.name || `App ${app.appid}`, title: app.name || '' }),
        dom.el('div', { [ROLE]: 'own-grid-facts' }, factLine(app).map(([kind, text, leaning]) => dom.el('span', { [ROLE]: 'own-grid-fact', 'data-se-wl-fact': kind, 'data-se-wl-review': leaning, text }))),
        dom.el('div', { [ROLE]: 'own-grid-tags' }, app.tagNames.slice(0, CARD_TAGS).map((tag) => dom.el('span', { [ROLE]: 'own-grid-tag', class: 'se-chip-tag', text: tag }))),
        dom.el('div', { [ROLE]: 'own-grid-buy' }, [
          priceChip(dom, app),
          comingSoon(app) && !price(app) ? dom.el('span', { [ROLE]: 'own-grid-soon', text: 'Coming soon' }) : null,
          dom.el('a', {
            [ROLE]: 'own-grid-cart',
            'data-se-wl-gift': own ? null : true,
            href: `${href}#game_area_purchase`,
            title: `${buyLabel} on the store page`,
            'aria-label': `${buyLabel}: ${app.name ?? ''}`,
          }),
        ]),
      ]),
    ])]);
  };

  /**
   * The grid. getState() returns { form, query, sort } (Steam's Options form, its search text,
   * its Sort menu's text). Returns { node, setApps(apps, own), render(), count() }.
   */
  const create = (dom, getState) => {
    const grid = dom.el('div', { [ROLE]: 'own-grid', role: 'list', 'aria-label': 'Wishlist' });
    const empty = dom.el('p', { [ROLE]: 'own-grid-empty', text: 'Nothing on your wishlist matches these filters.', hidden: true });
    const node = dom.el('div', { [ROLE]: 'own-grid-wrap', hidden: true }, [grid, empty]);
    let apps = [];
    const cards = new Map();
    let own = true;
    let shown = 0;

    const cardFor = (app) => {
      let card = cards.get(app.appid);
      if (!card) {
        card = buildCard(dom, app, own);
        card.setAttribute('role', 'listitem');
        cards.set(app.appid, card);
      }
      return card;
    };

    // Cards are built ahead, a few at a time while the page is idle, so the first switch to
    // Grid only has to place them.
    let idle = 0;
    const idleCall = window.requestIdleCallback ?? ((fn) => setTimeout(() => fn({ timeRemaining: () => 8 }), 1));
    const idleCancel = window.cancelIdleCallback ?? clearTimeout;
    const buildAhead = (from = 0) => {
      idle = idleCall((deadline) => {
        let i = from;
        while (i < apps.length && deadline.timeRemaining() > 2) cardFor(apps[i++]);
        if (i < apps.length) buildAhead(i);
      });
    };

    const setApps = (data, isOwn) => {
      own = isOwn;
      apps = data;
      cards.clear();
      grid.replaceChildren();
      empty.textContent = own ? 'Nothing on your wishlist matches these filters.' : 'Nothing on this wishlist matches these filters.';
      idleCancel(idle);
      buildAhead();
    };

    const render = () => {
      if (node.hidden || !apps.length) return;
      const { form, query, sort } = getState();
      const controls = readControls(form, query, sort);
      const order = apps.filter((app) => matches(app, controls)).sort(sorter(controls.sort));
      dom.mark(grid, 'data-se-wl-density', controls.compact ? 'compact' : 'expanded');
      const next = order.map(cardFor);
      const same = next.length === grid.children.length && next.every((card, i) => grid.children[i] === card);
      if (!same) grid.replaceChildren(...next);
      shown = next.length;
      empty.hidden = Boolean(shown);
    };

    const destroy = () => idleCancel(idle);

    return { node, setApps, render, destroy, count: () => shown };
  };

  web.parts.wishlistGrid = { create };
})();
