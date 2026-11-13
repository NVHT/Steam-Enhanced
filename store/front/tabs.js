/*
 * Store front tabbed lists (Popular New Releases, Top Sellers, Popular Upcoming, Specials,
 * Trending Free): a ranked list with a spotlight card beside it (front/tabs.css).
 *
 * Steam already renders the list (.tab_row_item) and builds a hover preview per row in
 * #tab_preview_container (home.js, InstrumentTabbedSectionv2). This keeps Steam's markup and
 * behaviour, and adds what the layout needs that Steam doesn't render:
 *   - per row: tag chips and a plain release date (Steam's are comma-joined text with a
 *     "Released:" label), and the price widget tagged for the shared price chip;
 *   - on the spotlight: a "#rank · list" badge, the row's date beside its review summary, and
 *     a "View in store" button for the focused row;
 *   - beside the tabs: a "See more" link to the active list's full page.
 *
 * Steam switches tabs and focuses rows by class and inline display, so class/style changes
 * inside the section are watched too (and nothing outside it).
 *
 * Tags:
 *   data-se-tabs                the section          data-se-tabs-split  the list + preview columns
 *   data-se-tabs-list           the list column      data-se-tabs-spot   the preview column
 *   data-se-tabs-row            a processed row      data-se-price       its price widget
 */
export default (dom) => {
  const { mark, unmark, setText, el, scope, tagPrice } = dom;
  const life = scope();

  const MAX_TAGS = 3;
  // Each list's own "See more" strip: .see_more_link today, .tab_see_more in older markup.
  const MORE_LINK = ':is(.see_more_link, .tab_see_more) a[href]';
  // "See more" targets for lists that have no strip of their own, by tab content id.
  const MORE_FALLBACK = {
    tab_newreleases_content: '/explore/new/',
    tab_topsellers_content: '/search/?filter=topsellers',
    tab_upcoming_content: '/search/?filter=popularcomingsoon',
    tab_specials_content: '/specials',
    tab_trendingfree_content: '/genre/Free%20to%20Play/',
  };
  const ATTRS = ['data-se-tabs', 'data-se-tabs-split', 'data-se-tabs-list', 'data-se-tabs-spot', 'data-se-tabs-row', 'data-se-tabs-more', 'data-se-tabs-idle'];

  const setHref = (node, href) => {
    if (href) mark(node, 'href', href);
    else unmark(node, 'href');
  };
  const arrow = () => el('span', { class: 'se-arrow-icon', 'aria-hidden': 'true' });

  // "Released: Nov 9, 2026" -> "Nov 9, 2026"; values without a label pass through.
  const dateOf = (row) => (row.querySelector('.tab_item_release_date')?.textContent.trim() ?? '').replace(/^[^:]{1,24}:\s*/, '');

  /* ---------- Rows ---------- */

  const decorateRow = (row) => {
    if (row.hasAttribute('data-se-tabs-row')) return;
    const content = row.querySelector('.tab_item_content');
    const info = content?.querySelector('.tab_item_col:not(.tab_item_price)');
    if (!content || !info) return;

    const tags = [...row.querySelectorAll('.tab_item_tags .top_tag')]
      .map((tag) => tag.textContent.replace(/^[,\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, MAX_TAGS);
    if (tags.length) info.append(el('span', { class: 'se-chips' }, tags.map((tag) => el('span', { class: 'se-chip-tag', text: tag }))));

    const dateCell = el('span', { class: 'se-tabs__date', text: dateOf(row) });
    const price = content.querySelector('.tab_item_price');
    if (price) price.before(dateCell);
    else content.append(dateCell);

    // Only the list's own widget; .tab_item_capsule_purchase repeats it for Steam's grid view.
    const widget = content.querySelector('.tab_item_purchase .discount_block');
    if (widget) tagPrice(widget);
    mark(row, 'data-se-tabs-row');
  };

  /* ---------- Section ---------- */

  let ui = null; // what this script adds outside rows, built once per section

  // The badge and button sit beside Steam's container, not in it: Steam marks every sibling of
  // the focused preview inert, which would make the button unclickable.
  const buildUi = (section, menu, container) => {
    const more = el('a', { class: 'se-tabs__more' }, ['See more', arrow()]);
    menu.append(more);
    const badge = el('span', { class: 'se-tabs__badge' });
    const view = el('a', { class: 'se-tabs__view' }, ['View in store', arrow()]);
    const foot = el('div', { class: 'se-tabs__foot' }, view);
    container.after(badge, foot);
    return { section, container, more, badge, foot, view };
  };
  const dropUi = () => {
    ui?.more.remove();
    ui?.badge.remove();
    ui?.foot.remove();
    ui = null;
  };

  const activeContent = (section) =>
    [...section.querySelectorAll('.home_tab_content')].find((node) => getComputedStyle(node).display !== 'none') ?? null;

  // Steam builds a row's preview on its first hover. Open the focused (or first) row's preview
  // through Steam's own handler, without moving keyboard focus.
  const primed = new WeakSet();
  const primePreview = (content, rows) => {
    if (primed.has(content)) return;
    primed.add(content);
    const row = rows.find((item) => item.classList.contains('focus')) ?? rows[0];
    if (row && typeof window.$J === 'function') window.$J(row).triggerHandler('focus');
  };

  const update = () => {
    const tabsRow = document.querySelector('.home_tabs_row_ctn');
    const section = tabsRow?.closest('.home_pagecontent_ctn');
    const menu = tabsRow?.closest('.tabs_menu_ctn');
    const container = document.getElementById('tab_preview_container');
    if (!section || !menu) return;
    mark(section, 'data-se-tabs');

    // Columns: the list and the preview, each as a direct child of their shared parent.
    const list = section.querySelector('.home_tabs_sections');
    let spot = null;
    if (list && container) {
      for (let node = container; node && node !== section; node = node.parentElement) {
        if (node.parentElement === list.parentElement) {
          spot = node;
          break;
        }
      }
    }
    if (spot) {
      mark(list.parentElement, 'data-se-tabs-split');
      mark(list, 'data-se-tabs-list');
      mark(spot, 'data-se-tabs-spot');
    }

    if (!ui || ui.section !== section || !ui.more.isConnected || ui.container !== container) {
      dropUi();
      if (container) ui = buildUi(section, menu, container);
    }

    const content = activeContent(section);
    const rows = content ? [...content.querySelectorAll('.tab_row_item')] : [];
    rows.forEach(decorateRow);
    if (!ui) return;

    // "See more": the first link of the active list's own strip; Steam's strip goes only when
    // ours points at the same list.
    const ownMore = content?.querySelector(MORE_LINK)?.getAttribute('href');
    const fallback = content && MORE_FALLBACK[content.id];
    setHref(ui.more, ownMore ?? (fallback ? new URL(fallback, location.origin).href : ''));
    if (ownMore) mark(section, 'data-se-tabs-more');
    else unmark(section, 'data-se-tabs-more');

    // Spotlight: follows Steam's focused row and its preview.
    const focused = rows.find((row) => row.classList.contains('focus'));
    const preview = container.querySelector(':scope > .tab_preview.focus');
    if (!preview || !focused) {
      mark(container, 'data-se-tabs-idle');
      if (rows.length && !preview) primePreview(content, rows);
      return;
    }
    unmark(container, 'data-se-tabs-idle');

    const tab = section.querySelector('.home_tab_button.active')?.textContent.trim() ?? '';
    setText(ui.badge, `#${rows.indexOf(focused) + 1}${tab ? ` · ${tab}` : ''}`);
    setHref(ui.view, focused.getAttribute('href'));

    // Steam reuses each row's preview, so its date only needs adding once.
    const date = dateOf(focused);
    if (date && !preview.querySelector('.se-tabs__spot-date')) {
      const line = el('span', { class: 'se-tabs__spot-date', text: date });
      const review = preview.querySelector('.tab_review_summary');
      if (review) review.after(line);
      else preview.querySelector('.tab_preview_details, .tab_title')?.after(line);
    }
  };

  life.observe(update, {
    attributes: ['class', 'style'],
    filter: (record) =>
      record.type !== 'attributes' || Boolean(record.target.closest?.('[data-se-tabs], #tab_preview_container')),
  });
  dom.ready().then(() => life.alive && update());

  return () => {
    life.destroy();
    dropUi();
    document.querySelectorAll('.se-tabs__date, .se-tabs__spot-date, [data-se-tabs-row] .se-chips').forEach((node) => node.remove());
    for (const node of document.querySelectorAll(ATTRS.map((name) => `[${name}]`).join(', '))) {
      for (const name of ATTRS) node.removeAttribute(name);
    }
  };
};
