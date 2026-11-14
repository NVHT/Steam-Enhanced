/*
 * Community Market home (/market/): the parts CSS can't do alone.
 *
 *   - Hero: "Sell an item" moves out of the activity tab row into the wallet card, so the
 *     header holds every account action. Moved back on destroy.
 *   - Hero stats: one chip per activity section (sell listings, buy orders) with its live
 *     count. Labels are Steam's own section titles, so every language reads right. A chip
 *     opens My Active Listings and scrolls to its section.
 *   - Hero art: the first popular items, as a fanned tile wall behind the wallet.
 *   - Rarity: each row's quality colour (Steam's inline border-color on the item image, or the
 *     name colour) becomes --se-q, which the tile glow reads.
 *   - One tab bar: Steam's two bars (My Active Listings / My Market History; Popular / Newly
 *     Listed / Recently Sold) become one theme-built bar, in that order, with icons, the listings count
 *     and a sliding pill under the open tab. Each button clicks Steam's own tab, so Steam's
 *     code still loads and switches each panel; Steam's bars are hidden while the theme's is
 *     in place. The page opens on the listings; the activity panel shows only once its tab is
 *     clicked ([data-se-mkt-view] on #BG_bottom: "browse" or "activity").
 *   - History: the "who you traded with" column shows only when some row names someone
 *     ([data-se-mkt-partners]); Steam fills it with empty markup otherwise.
 *   - Game filter: a field over Browse by Game that filters all ~760 game buttons (the top ten,
 *     "more" and unvetted lists) as you type, expanding the hidden lists while it has a query.
 *
 * Ids and classes are Steam's (SteamTracking: steamcommunity.com/public/css/skin_1/
 * economy_market.css, public/javascript/market.js) and the page report.
 */
const HERO_ART_MAX = 6;

export default (dom) => {
  const $ = dom.scope();
  const { el, mark, unmark, setText, setVar, squash } = dom;

  /* ---------- Hero: "Sell an item" joins the wallet card ---------- */

  const placeSell = () => {
    const sell = document.querySelector('#myMarketTabs .pick_and_sell_button');
    const wallet = document.querySelector('#BG_top .user_info');
    if (!sell || !wallet) return;
    const anchor = document.createComment('se-market-sell');
    sell.before(anchor);
    mark(sell, 'data-se-mkt-sell');
    wallet.append(sell);
    $.add(() => {
      unmark(sell, 'data-se-mkt-sell');
      if (anchor.isConnected) anchor.replaceWith(sell);
    });
  };

  /* ---------- One tab bar: listings and activity ---------- */

  // Bar order: your activity first, then the listings (the page still opens on the listings)
  const TABS = [
    { id: 'tabMyListings', view: 'activity', icon: 'listings', count: 'my_market_activelistings_number' },
    { id: 'tabMyMarketHistory', view: 'activity', icon: 'history' },
    { id: 'tabPopularItems', view: 'browse', icon: 'popular' },
    { id: 'tabRecentSellListings', view: 'browse', icon: 'new' },
    { id: 'tabRecentSoldListings', view: 'browse', icon: 'sold' },
  ];
  let view = 'browse';

  const setView = (next) => {
    view = next;
    mark(document.getElementById('BG_bottom'), 'data-se-mkt-view', view);
    requestAnimationFrame(() => placeBar());
  };

  // Capture: the view is set before Steam's own handler runs, whatever it does with the event
  $.listen(
    document,
    'click',
    (event) => {
      const tab = event.target instanceof Element ? event.target.closest('a.market_tab_well_tab') : null;
      const entry = tab && TABS.find(({ id }) => id === tab.id);
      if (entry) setView(entry.view);
    },
    true,
  );
  $.add(() => unmark(document.getElementById('BG_bottom'), 'data-se-mkt-view'));

  const pill = el('span', { class: 'se-mkt-tabs-pill', 'aria-hidden': 'true' });
  const bar = el('div', { class: 'se-mkt-tabs', role: 'tablist', 'aria-label': 'Market' }, [pill]);
  const buttons = new Map(); // tab id -> { button, label, count }
  $.add(() => bar.remove());

  // Steam's label is the tab's own text, without its "( 0 )" count
  const labelOf = (tab) => {
    const contents = tab.querySelector('.market_tab_well_tab_contents') ?? tab;
    return squash([...contents.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join(' '));
  };

  const buildBar = () => {
    let group = null;
    for (const entry of TABS) {
      const tab = document.getElementById(entry.id);
      if (!tab || buttons.has(entry.id)) continue;
      if (group && group !== entry.view) bar.append(el('span', { class: 'se-mkt-tabs-divider', 'aria-hidden': 'true' }));
      group = entry.view;
      const label = el('span', { class: 'se-mkt-tab-label' });
      const count = entry.count ? el('span', { class: 'se-mkt-tab-count' }) : null;
      const button = el(
        'button',
        { type: 'button', role: 'tab', class: 'se-mkt-tab', 'data-se-mkt-icon': entry.icon },
        [el('span', { class: 'se-mkt-tab-icon', 'aria-hidden': 'true' }), label, count],
      );
      $.listen(button, 'click', () => document.getElementById(entry.id)?.click());
      bar.append(button);
      buttons.set(entry.id, { button, label, count, entry });
    }
  };

  const movePill = () => {
    const active = [...buttons.values()].find(({ button }) => button.getAttribute('aria-selected') === 'true')?.button;
    if (!active) {
      pill.style.opacity = '0';
      return;
    }
    setVar(pill, '--x', `${active.offsetLeft}px`);
    setVar(pill, '--w', `${active.offsetWidth}px`);
    pill.style.opacity = '1';
  };

  const placeBar = () => {
    const home = document.getElementById('BG_bottom');
    const steamBar = document.getElementById('myMarketTabs');
    if (!home || !steamBar) return;
    buildBar();
    if (!buttons.size) return;
    if (bar.nextElementSibling !== steamBar) steamBar.before(bar);

    for (const [id, { button, label, count, entry }] of buttons) {
      const tab = document.getElementById(id);
      if (!tab) continue;
      setText(label, labelOf(tab));
      if (count) setText(count, squash(document.getElementById(entry.count)?.textContent) || '0');
      const selected = entry.view === view && tab.classList.contains('market_tab_well_tab_active');
      mark(button, 'aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    }
    movePill();
  };

  // Arrow keys move between tabs (the tablist pattern)
  $.listen(bar, 'keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const list = [...buttons.values()].map(({ button }) => button);
    const at = list.indexOf(document.activeElement);
    if (at < 0) return;
    event.preventDefault();
    const next =
      event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : (at + (event.key === 'ArrowRight' ? 1 : -1) + list.length) % list.length;
    list[next].focus();
    list[next].click();
  });

  // Labels load with the font and the window resizes: keep the pill on its tab
  const resize = new ResizeObserver(() => movePill());
  resize.observe(bar);
  $.add(() => resize.disconnect());

  /* ---------- Hero stats ---------- */

  const STATS = ['my_market_selllistings_number', 'my_market_buylistings_number'];
  const stats = el('div', { class: 'se-mkt-stats', 'data-se-mkt-stats': true });
  const chips = new Map(); // count id -> { chip, count, label }
  $.add(() => stats.remove());

  const openSection = (section) => {
    const tab = document.getElementById('tabMyListings');
    if (tab && !tab.classList.contains('market_tab_well_tab_active')) tab.click();
    setView('activity');
    section.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const placeStats = () => {
    const top = document.getElementById('BG_top');
    const title = top?.querySelector('h1.market_header');
    if (!title) return;
    if (stats.previousElementSibling !== title) title.after(stats);

    for (const id of STATS) {
      const number = document.getElementById(id);
      const section = number?.closest('.my_listing_section');
      if (!section) continue;
      let entry = chips.get(id);
      if (!entry) {
        const count = el('strong', { class: 'se-mkt-stat-n' });
        const label = el('span', { class: 'se-mkt-stat-label' });
        const chip = el('button', { type: 'button', class: 'se-mkt-stat' }, [count, label]);
        $.listen(chip, 'click', () => openSection(section));
        stats.append(chip);
        entry = { chip, count, label };
        chips.set(id, entry);
      }
      const value = squash(number.textContent) || '0';
      setText(entry.count, value);
      setText(entry.label, squash(section.querySelector('.my_market_header_active')?.textContent));
      if (value === '0') mark(entry.chip, 'data-se-mkt-empty');
      else unmark(entry.chip, 'data-se-mkt-empty');
    }
  };

  /* ---------- Hero art: popular items as a tile wall ---------- */

  const art = el('div', { class: 'se-mkt-art', 'aria-hidden': 'true' });
  let artKey = '';
  $.add(() => art.remove());

  const placeArt = () => {
    const header = document.getElementById('BG_top');
    if (!header) return;
    const items = [...document.querySelectorAll('#popularItemsRows .market_listing_row')].slice(0, HERO_ART_MAX);
    const tiles = items
      .map((row) => ({ img: row.querySelector('.market_listing_item_img'), q: row.style.getPropertyValue('--se-q') }))
      .filter(({ img }) => img?.currentSrc || img?.src);
    const key = tiles.map(({ img }) => img.currentSrc || img.src).join('|');
    if (tiles.length < 3 || key === artKey) return;
    artKey = key;
    art.replaceChildren(
      ...tiles.map(({ img, q }) => {
        const tile = el('span', { class: 'se-mkt-art-tile' }, [el('img', { src: img.currentSrc || img.src, alt: '', loading: 'lazy' })]);
        if (q) tile.style.setProperty('--se-q', q);
        return tile;
      }),
    );
    if (art.parentElement !== header) header.prepend(art);
  };

  /* ---------- History: who you traded with, and the +/- badges ---------- */

  // Steam fills the column with empty markup when there is no one to show: the column only
  // shows (page.css) when some row names someone
  const tagPartners = () => {
    const history = document.getElementById('tabContentsMyMarketHistory');
    if (!history) return;
    const named = [...history.querySelectorAll('.market_listing_row .market_listing_whoactedwith')].some((cell) => squash(cell.textContent));
    if (named) mark(history, 'data-se-mkt-partners');
    else unmark(history, 'data-se-mkt-partners');

    // +/- as a badge (page.css): Steam's cell holds "+" (bought) or "-" (sold) as text
    for (const cell of history.querySelectorAll('.market_listing_row .market_listing_gainorloss')) {
      const sign = squash(cell.textContent);
      if (sign === '+' || sign === '-') mark(cell, 'data-se-mkt-gain', sign);
      else unmark(cell, 'data-se-mkt-gain');
    }
  };
  $.add(() => {
    unmark(document.getElementById('tabContentsMyMarketHistory'), 'data-se-mkt-partners');
    for (const cell of document.querySelectorAll('[data-se-mkt-gain]')) cell.removeAttribute('data-se-mkt-gain');
  });

  /* ---------- Rarity ---------- */

  const tagRows = () => {
    for (const row of document.querySelectorAll('#BG_bottom .market_listing_row')) {
      const img = row.querySelector('.market_listing_item_img');
      const name = row.querySelector('.market_listing_item_name');
      const colour = img?.style.borderColor || name?.style.color || '';
      if (colour) setVar(row, '--se-q', colour);
    }
  };
  $.add(() => {
    for (const row of document.querySelectorAll('#BG_bottom .market_listing_row')) row.style.removeProperty('--se-q');
  });

  /* ---------- Game filter ---------- */

  const field = el('input', {
    type: 'search',
    class: 'se-mkt-filter-input',
    placeholder: 'Filter games',
    autocomplete: 'off',
    spellcheck: false,
    'aria-label': 'Filter games',
  });
  const filter = el('label', { class: 'se-mkt-filter', 'data-se-mkt-filter': true }, [field]);
  const none = el('p', { class: 'se-mkt-filter-none', text: 'No games match.', hidden: true });
  const names = new WeakMap(); // game button -> lower-case name
  let group = null;

  const nameOf = (button) => {
    let name = names.get(button);
    if (name == null) {
      name = squash(button.querySelector('.game_button_game_name')?.textContent).toLowerCase();
      names.set(button, name);
    }
    return name;
  };

  const runFilter = () => {
    if (!group) return;
    const query = squash(field.value).toLowerCase();
    if (query) mark(group, 'data-se-mkt-filtering');
    else unmark(group, 'data-se-mkt-filtering');
    let shown = 0;
    for (const button of group.querySelectorAll('a.game_button')) {
      if (query && !nameOf(button).includes(query)) {
        mark(button, 'data-se-mkt-hide');
      } else {
        unmark(button, 'data-se-mkt-hide');
        shown += 1;
      }
    }
    none.hidden = !query || shown > 0;
  };

  $.listen(field, 'input', runFilter);
  $.listen(field, 'keydown', (event) => {
    if (event.key !== 'Escape' || !field.value) return;
    event.preventDefault();
    field.value = '';
    runFilter();
  });

  const placeFilter = () => {
    const found = document.querySelector('#browseItems .market_search_game_button_group');
    if (!found) return;
    group = found;
    const tip = group.querySelector(':scope > .market_search_sidebar_section_tip_small');
    if (filter.parentElement !== group) {
      if (tip) tip.after(filter);
      else group.prepend(filter);
    }
    if (none.parentElement !== group) group.append(none);
  };
  $.add(() => {
    filter.remove();
    none.remove();
    unmark(group, 'data-se-mkt-filtering');
    for (const button of document.querySelectorAll('[data-se-mkt-hide]')) button.removeAttribute('data-se-mkt-hide');
  });

  /* ---------- Run ---------- */

  const scan = () => {
    mark(document.getElementById('BG_bottom'), 'data-se-mkt-view', view);
    placeBar();
    placeSell();
    placeStats();
    tagPartners();
    tagRows();
    placeArt();
    placeFilter();
  };

  $.observe(scan, { attributes: ['class'] });
  scan();

  return () => $.destroy();
};
