/*
 * The explore lists, New On Steam (/explore/new/) and Upcoming (/explore/upcoming/), redesigned
 * to match the store front. Both pages share one classic template.
 *
 * The game rows are the shared ones (shared/rows.js/.css). This covers what only these pages
 * have (explore/page.css):
 *   - the page heading, set like the front page's section titles but larger;
 *   - the two header capsules ("Popular this month", "Top Wishlists"...), as a pair of art
 *     tiles with a glass label chip and the shared price chip;
 *   - the queue, as a row of four art tiles on a theme card under a centred button;
 *   - the classic tabbed list, as the store front's ranked list with tag chips;
 *   - the bucket rows ("New Top Sellers"...), given round arrows in place of Steam's scrollbar.
 *
 * Tags:
 *   data-se-explore-head       the page heading block   data-se-explore-title      its heading
 *   data-se-explore-feature    header capsule pair      data-se-explore-cap        one capsule
 *   data-se-explore-cap-art    its art                  data-se-explore-cap-label  its label chip
 *   data-se-explore-cap-info   Steam's strip under the art (label text + price)
 *   data-se-explore-queue      the queue section
 *   data-se-explore-tabs       tabbed list column       data-se-explore-row        a processed row
 *   data-se-arrow              round arrows added to each bucket row (shared/rows.css)
 */
export default (dom) => {
  const { mark, el, scope, tagPrice } = dom;
  const life = scope();

  const HEADER = '.page_header_ctn';
  const TITLE = '.pageheader, h1, h2';
  // New On Steam: .newonsteam_headercaps; Upcoming: .comingsoon_headercaps (same markup).
  const FEATURE = '.newonsteam_headercaps, .comingsoon_headercaps';
  const CAP = '.newonsteam_headercap, .comingsoon_headercap, :scope > a[href]';
  const QUEUE = '.discovery_queue_ctn';
  const PRICE = '.discount_block:not(.empty)'; // empty: no price yet (upcoming)
  const LABEL_FALLBACK = 'Popular this month';
  const TAB_COLUMN = '.home_tab_col, .home_leftcol';
  const BUCKET_ROW = '.bucket > * > .bucket_contents';
  const MAX_TAGS = 3;
  const ATTRS = [
    'data-se-explore-head', 'data-se-explore-title', 'data-se-explore-feature', 'data-se-explore-cap',
    'data-se-explore-cap-art', 'data-se-explore-cap-info', 'data-se-explore-queue', 'data-se-explore-tabs', 'data-se-explore-row',
  ];

  /* ---------- Heading ---------- */

  const tagHeader = () => {
    const header = document.querySelector(HEADER);
    if (!header) return;
    mark(header, 'data-se-explore-head');
    mark([...header.querySelectorAll(TITLE)].find((node) => node.textContent.trim()), 'data-se-explore-title');
  };

  /* ---------- Header capsules ---------- */

  /*
   * Markup: a.newonsteam_headercap > img, div.info ("Popular this month" as a bare text node,
   * then the price widget), div.ds_flag, div.ds_options. The info strip's text becomes a glass
   * chip on the art (ours, so its text survives Steam's re-renders); the strip itself is
   * dissolved in CSS and its price rides the art's corner.
   */
  const labelOf = (info) =>
    info
      ? [...info.childNodes]
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent.trim())
          .filter(Boolean)
          .join(' ')
      : '';

  const tagCap = (cap) => {
    const img = cap.querySelector('img');
    if (!img) return;
    mark(cap, 'data-se-explore-cap');
    mark(img, 'data-se-explore-cap-art');
    const info = cap.querySelector(':scope > .info');
    mark(info, 'data-se-explore-cap-info');
    const price = cap.querySelector(PRICE);
    if (price) tagPrice(price);

    let chip = cap.querySelector(':scope > [data-se-explore-cap-label]');
    if (!chip) {
      chip = el('span', { 'data-se-explore-cap-label': true });
      cap.append(chip);
    }
    dom.setText(chip, labelOf(info) || LABEL_FALLBACK);
  };

  const tagFeature = () => {
    const feature = document.querySelector(FEATURE);
    if (!feature) return;
    mark(feature, 'data-se-explore-feature');
    for (const cap of feature.querySelectorAll(CAP)) {
      // A wrapper div's link is the capsule; a bare link already is one.
      tagCap(cap.matches('a[href]') ? cap : cap.querySelector('a[href]') ?? cap);
    }
  };

  /* ---------- Tabbed list ---------- */

  // Steam's tag line: <span class="top_tag">A</span><span class="top_tag">, B</span>...
  const tagsOf = (row) =>
    [...row.querySelectorAll('.tab_item_top_tags .top_tag')]
      .map((tag) => tag.textContent.replace(/^[,\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, MAX_TAGS);

  const decorateRow = (row) => {
    if (row.hasAttribute('data-se-explore-row')) return;
    // New On Steam: the price is the row's own child; Upcoming wraps it with Pre-Purchase.
    const price = row.querySelector(':scope > .discount_block, :scope > .prepurchase_price_ctn > .discount_block');
    if (price) tagPrice(price);
    const tags = tagsOf(row);
    const details = row.querySelector('.tab_item_details');
    if (tags.length && details) details.append(el('span', { class: 'se-chips' }, tags.map((tag) => el('span', { class: 'se-chip-tag', text: tag }))));
    mark(row, 'data-se-explore-row');
  };

  const tagTabs = () => {
    const column = document.querySelector('.home_tabs_row_ctn')?.closest(TAB_COLUMN);
    if (!column) return;
    mark(column, 'data-se-explore-tabs');
    // Upcoming renders each list's "See more" above its rows; it belongs under them.
    for (const more of column.querySelectorAll('.tab_content > .tab_see_more:not(:last-child)')) more.parentElement.append(more);
    // Every list, hidden ones too: switching tabs then never shows an undecorated frame.
    column.querySelectorAll('.tab_content_items > .tab_item, .tab_content > .tab_item').forEach(decorateRow);
  };

  /* ---------- Bucket rows: round arrows that page the scroller ---------- */

  const syncArrows = (scroller) => {
    const ctn = scroller.parentElement;
    const prev = ctn.querySelector(':scope > [data-se-arrow="prev"]');
    const next = ctn.querySelector(':scope > [data-se-arrow="next"]');
    if (!prev || !next) return;
    const max = scroller.scrollWidth - scroller.clientWidth;
    prev.hidden = scroller.scrollLeft <= 2;
    next.hidden = scroller.scrollLeft >= max - 2;
  };

  const arrowFor = (scroller, side) => {
    const button = el('button', {
      type: 'button',
      class: `se-explore__arrow se-explore__arrow--${side}`,
      'data-se-arrow': side,
      'aria-label': side === 'prev' ? 'Previous' : 'Next',
    });
    button.addEventListener('click', () => {
      // One page: the visible width, less a sliver so the edge tile stays in view as context.
      const step = Math.max(scroller.clientWidth - 48, 120) * (side === 'prev' ? -1 : 1);
      scroller.scrollBy({ left: step, behavior: 'smooth' });
    });
    return button;
  };

  const wired = new WeakSet();
  const tagBuckets = () => {
    for (const scroller of document.querySelectorAll(BUCKET_ROW)) {
      if (!scroller.parentElement) continue;
      if (!wired.has(scroller)) {
        wired.add(scroller);
        scroller.parentElement.append(arrowFor(scroller, 'prev'), arrowFor(scroller, 'next'));
        life.listen(scroller, 'scroll', () => syncArrows(scroller), { passive: true });
      }
      syncArrows(scroller);
    }
  };

  const scan = () => {
    tagHeader();
    tagFeature();
    for (const queue of document.querySelectorAll(QUEUE)) mark(queue, 'data-se-explore-queue');
    tagTabs();
    tagBuckets();
  };

  life.observe(scan);
  life.listen(window, 'resize', dom.perFrame(() => document.querySelectorAll(BUCKET_ROW).forEach(syncArrows)));
  dom.ready().then(() => life.alive && scan());

  return () => {
    life.destroy();
    document.querySelectorAll('.se-explore__arrow, [data-se-explore-cap-label], [data-se-explore-row] .se-chips').forEach((node) => node.remove());
    for (const node of document.querySelectorAll(ATTRS.map((name) => `[${name}]`).join(', '))) {
      for (const name of ATTRS) node.removeAttribute(name);
    }
  };
};
