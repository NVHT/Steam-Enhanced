/*
 * DLC hub (/dlc/<appid>/...): Steam renders it with the curator template (curator.css,
 * curator_recommendations.css). dlc/page.css restyles it; this script adds what CSS can't reach:
 *
 *  - Hero: the base game's capsule (the curator avatar) painted, blurred, behind the header
 *    ([data-se-dlc-hero] + an owned art layer), a stats line under the title (add-on count from
 *    the "All" filter, live follower count) and a Store Page pill beside Follow.
 *  - Tabs: a sliding pill behind the selected browse tab (Top Sellers, New Releases ...), kept
 *    on the selected tab as Steam switches tabs and as the row resizes.
 *  - Prices: every price in the featured carousels and the list is tagged [data-se-price] for
 *    the shared glass chip (shared/ui.css). Steam replaces the list over AJAX on each tab,
 *    filter and page, so the tagging reruns whenever the list changes.
 *  - Featured: each add-on as a spotlight card (buildSpotlight): screenshots crossfading behind
 *    the text, a rail of thumbnails, the add-on's name above its blurb.
 *  - Report dialog: its radio choices become clickable option rows (buildChoices).
 *
 * destroy() removes every owned node, attribute and listener.
 */

const GRID = '.creator_grid_ctn';
const HERO = '#curator_header_area_ctn_id';
const PRICE = '.discount_block:not(.empty)';

const plural = new Intl.PluralRules('en');
const addOns = (count) => `${count.toLocaleString()} ${plural.select(count) === 'one' ? 'add-on' : 'add-ons'}`;

/**
 * Hero: art wash, a stats line under the title ("3 add-ons · 1,103,465 followers"; the
 * follower count is re-read whenever Steam rewrites it after Follow / Unfollow), and a Store
 * Page pill placed after Steam's Follow button so the two read as one action row. Steam's own
 * nodes stay where they are. Returns its undo.
 */
const buildHero = (dom, scope) => {
  const hero = document.querySelector(HERO);
  const capsule = hero?.querySelector('img.curator_avatar');
  const title = hero?.querySelector('.curator_name');
  if (!hero || !capsule || !title) return () => {};

  dom.mark(hero, 'data-se-dlc-hero');
  dom.setVar(hero, '--se-dlc-art', `url("${capsule.currentSrc || capsule.src}")`);
  const art = dom.el('div', { class: 'se-dlc-hero__art', 'aria-hidden': 'true' });
  hero.prepend(art);
  const owned = [art];

  // Stats line.
  const stats = dom.el('p', { class: 'se-dlc-hero__stats' });
  const count = Number.parseInt(document.querySelector('#filter_tagid_num_all')?.textContent.replace(/\D/g, ''), 10);
  if (Number.isFinite(count)) stats.append(dom.el('span', { text: addOns(count) }));
  const followers = hero.querySelector('.num_followers');
  const followersLabel = dom.squash(hero.querySelector('.num_followers_text')?.textContent).toLowerCase() || 'followers';
  const followersOut = followers ? dom.el('span') : null;
  if (followersOut) stats.append(followersOut);
  const syncFollowers = () => {
    if (followersOut) dom.setText(followersOut, `${dom.squash(followers.textContent)} ${followersLabel}`);
  };
  syncFollowers();
  if (stats.childElementCount) {
    title.after(stats);
    owned.push(stats);
  }
  if (followers) scope.observe(syncFollowers, { filter: (record) => followers.contains(record.target) });

  // Social links row: empty on DLC pages but still painted as a bar. Empty means nothing in it
  // takes up space (its links can be present but hidden).
  const social = hero.querySelector('.socialmedia_accounts');
  if (social && ![...social.querySelectorAll('*')].some((node) => node.offsetWidth > 0 && node.offsetHeight > 0)) {
    dom.mark(social, 'data-se-empty');
  }

  // Store Page, beside Follow.
  const store = title.querySelector('a[href]');
  const anchor = hero.querySelector('.follow_controls') ?? stats;
  if (store && anchor.isConnected) {
    const link = dom.el('a', { class: 'se-dlc-hero__store', href: store.href, text: 'Store Page' });
    anchor.after(link);
    owned.push(link);
  }

  return () => {
    for (const node of owned) node.remove();
    dom.unmark(social, 'data-se-empty');
    dom.unmark(hero, 'data-se-dlc-hero');
    hero.style.removeProperty('--se-dlc-art');
  };
};

/** Sliding pill behind the selected browse tab. Returns its undo. */
const buildTabs = (dom, scope) => {
  const tabs = document.querySelector(`${GRID} .browse_tabs`);
  if (!tabs) return () => {};

  const pill = dom.el('span', { class: 'se-dlc-tabs__pill', 'aria-hidden': 'true' });
  tabs.prepend(pill);
  dom.mark(tabs, 'data-se-dlc-tabs');

  const place = dom.perFrame(() => {
    const selected = tabs.querySelector(':scope > a.selected');
    pill.hidden = !selected;
    if (!selected) return;
    // offset* are relative to the tab row (position: relative); --y follows a wrapped row.
    dom.setVar(pill, '--x', `${selected.offsetLeft}px`);
    dom.setVar(pill, '--y', `${selected.offsetTop}px`);
    dom.setVar(pill, '--w', `${selected.offsetWidth}px`);
  });

  place();
  // The first placement lands without a slide; moves after it animate.
  const settle = requestAnimationFrame(() => requestAnimationFrame(() => dom.mark(tabs, 'data-se-dlc-tabs', 'ready')));
  const resize = new ResizeObserver(place);
  resize.observe(tabs);
  scope.observe(place, { attributes: ['class'], filter: (record) => record.target.parentElement === tabs });

  return () => {
    cancelAnimationFrame(settle);
    place.cancel();
    resize.disconnect();
    pill.remove();
    dom.unmark(tabs, 'data-se-dlc-tabs');
  };
};

/*
 * Report dialog (the flag in the Featured / Lists bar): Steam lists bare radios, each followed
 * by its text and a <br>. Each radio and its text go into a label[data-se-choice] (the whole
 * row clicks; Steam still reads the same inputs), with the lead word before " - " split off as
 * the row's title. shared/modals.css styles the rows. Returns the undo for one dialog.
 */
const CHOICE_END = 'input[type="radio"], textarea, div, p, form';
const CHOICE_TITLE = /^(\s*)([^-\u2013\u2014:]{2,40}?)(\s+[-\u2013\u2014:]\s+)/;

const unwrap = (node) => node?.replaceWith(...node.childNodes);

const buildChoices = (dom, dialog) => {
  const radios = [...dialog.querySelectorAll('.newmodal_content input[type="radio"]')].filter((radio) => !radio.closest('label'));
  const lists = new Set();
  const rows = [];

  for (const radio of radios) {
    const label = dom.el('label', { 'data-se-choice': true });
    const text = dom.el('span', { 'data-se-choice-text': true });
    let next = radio.nextSibling;
    while (next && next.nodeName !== 'BR' && !(next.nodeType === 1 && next.matches(CHOICE_END))) {
      const following = next.nextSibling;
      text.append(next);
      next = following;
    }
    lists.add(radio.parentElement);
    radio.before(label);
    label.append(radio, text);

    // "Offensive - Contains content ..." -> title "Offensive", then the description.
    const lead = text.firstChild;
    const match = lead?.nodeType === Node.TEXT_NODE && CHOICE_TITLE.exec(lead.data);
    if (match) {
      lead.splitText(match[0].length);
      const sep = lead.splitText(match[1].length + match[2].length);
      const title = dom.el('span', { 'data-se-choice-title': true });
      const hidden = dom.el('span', { hidden: true });
      lead.before(title);
      title.append(lead);
      sep.before(hidden);
      hidden.append(sep);
      rows.push({ label, text, title, hidden });
    } else {
      rows.push({ label, text });
    }
  }
  for (const list of lists) dom.mark(list, 'data-se-choice-list');

  return () => {
    for (const { label, text, title, hidden } of rows) {
      unwrap(title);
      unwrap(hidden);
      unwrap(text);
      const parent = label.parentNode;
      unwrap(label);
      parent?.normalize();
    }
    for (const list of lists) dom.unmark(list, 'data-se-choice-list');
  };
};

/*
 * Spotlight (each featured add-on): the screenshots fill the card behind the text, one at a
 * time. A stage of two layers crossfades between them, advancing every SPOT_MS (paused while
 * the pointer is on the card, the tab is hidden, or the user prefers reduced motion); pointing
 * at or focusing a thumbnail shows it. The stage loads the 1920 × 1080 version of each
 * screenshot, falling back to the thumbnail's own image. The add-on's name (from the capsule's
 * alt text, else its store URL) goes above the blurb, and the blurb's bare text is wrapped so
 * it can clamp and lose Steam's quote marks. Returns the undo for one card.
 */
const SPOT_MS = 6000;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const cssUrl = (value) => /url\(["']?(.*?)["']?\)/.exec(value)?.[1] ?? '';
const fullSize = (url) => url.replace(/[._](?:116x65|600x338|800x450)(\.jpg)/i, '.1920x1080$1');
const nameFromUrl = (href) => {
  const slug = /\/app\/\d+\/([^/?#]+)/.exec(href ?? '')?.[1];
  return slug ? decodeURIComponent(slug).replace(/_+/g, ' ').trim() : '';
};

const buildSpotlight = (dom, focus) => {
  const local = dom.scope();
  const link = focus.querySelector('.capsule > a[href]');
  const review = focus.querySelector('.curator_review');
  const thumbs = [...focus.querySelectorAll('.screenshots > div')].filter((thumb) => cssUrl(getComputedStyle(thumb).backgroundImage));

  // Name.
  const name = dom.squash(focus.querySelector('img.capimg')?.alt) || nameFromUrl(link?.href);
  if (review && name) {
    const title = dom.el('h3', { class: 'se-dlc-spot__title' }, dom.el('a', { href: link.href, text: name }));
    review.prepend(title);
    local.add(() => title.remove());
  }

  // Blurb: Steam's bare text nodes, in one clampable span without the quote marks.
  if (review) {
    const texts = [...review.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE && node.data.trim());
    if (texts.length) {
      const original = texts.map((node) => node.data);
      const blurb = dom.el('span', { class: 'se-dlc-spot__blurb' });
      texts[0].before(blurb);
      blurb.append(...texts);
      texts[0].data = texts[0].data.replace(/^[\s"“”]+/, '');
      texts.at(-1).data = texts.at(-1).data.replace(/[\s"“”]+$/, '');
      local.add(() => {
        texts.forEach((node, i) => { node.data = original[i]; });
        blurb.replaceWith(...blurb.childNodes);
      });
    }
  }

  if (!thumbs.length) return () => local.destroy();

  // Stage.
  const layers = [0, 1].map(() => dom.el('div', { class: 'se-dlc-spot__layer' }));
  const stage = dom.el('div', { class: 'se-dlc-spot__stage', 'aria-hidden': 'true' }, layers);
  focus.prepend(stage);
  dom.setVar(focus, '--se-dlc-spot-ms', `${SPOT_MS}ms`);
  local.add(() => {
    stage.remove();
    focus.style.removeProperty('--se-dlc-spot-ms');
  });

  let current = -1;
  let front = 0;
  let timer = 0;
  let token = 0;

  const paint = (url) => {
    front = 1 - front;
    const layer = layers[front];
    layer.style.backgroundImage = `url("${url}")`;
    dom.mark(layer, 'data-on');
    dom.unmark(layers[1 - front], 'data-on');
  };

  const show = (index) => {
    if (index === current) return;
    current = index;
    thumbs.forEach((thumb, i) => (i === index ? dom.mark(thumb, 'data-se-on') : dom.unmark(thumb, 'data-se-on')));
    const small = cssUrl(getComputedStyle(thumbs[index]).backgroundImage);
    const large = fullSize(small);
    const ticket = ++token;
    if (large === small) return paint(small);
    const image = new Image();
    image.onload = () => ticket === token && paint(large);
    image.onerror = () => ticket === token && paint(small);
    image.src = large;
  };

  const paused = () => focus.matches(':hover') || document.hidden || reducedMotion.matches;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!paused()) show((current + 1) % thumbs.length);
      schedule();
    }, SPOT_MS);
  };
  // A thumbnail picked by hand restarts its timer bar along with the clock.
  const pick = (index) => {
    current = -1;
    show(index);
    schedule();
  };

  thumbs.forEach((thumb, index) => {
    dom.mark(thumb, 'role', 'button');
    dom.mark(thumb, 'tabindex', '0');
    dom.mark(thumb, 'aria-label', `Screenshot ${index + 1} of ${thumbs.length}`);
    local.listen(thumb, 'pointerenter', () => current !== index && pick(index));
    local.listen(thumb, 'focus', () => current !== index && pick(index));
    local.add(() => {
      for (const attr of ['data-se-on', 'role', 'tabindex', 'aria-label']) dom.unmark(thumb, attr);
    });
  });
  local.listen(document, 'visibilitychange', () => dom[document.hidden ? 'mark' : 'unmark'](focus, 'data-se-paused'));
  local.add(() => {
    clearTimeout(timer);
    token++;
    dom.unmark(focus, 'data-se-paused');
  });

  show(0);
  if (thumbs.length > 1) schedule();
  return () => local.destroy();
};

export default async (dom) => {
  await dom.ready();
  const grid = document.querySelector(GRID);
  if (!grid) return () => {};

  const scope = dom.scope();
  scope.add(buildHero(dom, scope));
  scope.add(buildTabs(dom, scope));

  const tagged = new Set();
  const tagPrices = () => {
    for (const price of grid.querySelectorAll(PRICE)) {
      dom.tagPrice(price);
      tagged.add(price);
    }
    for (const price of tagged) if (!price.isConnected) tagged.delete(price);
  };
  tagPrices();
  scope.observe(tagPrices, { filter: (record) => grid.contains(record.target) });
  scope.add(() => {
    for (const price of tagged) dom.unmark(price, 'data-se-price');
    tagged.clear();
  });

  // Spotlights: one per featured carousel's current item; paging moves .focus, so rescan.
  const spots = new Map();
  const scanSpots = () => {
    const current = new Set(grid.querySelectorAll('.curator_featured > .focus'));
    for (const [focus, undo] of spots) {
      if (!current.has(focus) || !focus.isConnected) {
        undo();
        spots.delete(focus);
      }
    }
    for (const focus of current) if (!spots.has(focus)) spots.set(focus, buildSpotlight(dom, focus));
  };
  scanSpots();
  scope.observe(scanSpots, {
    attributes: ['class'],
    filter: (record) => record.target.closest?.('.curator_featured') || record.target.matches?.('.curator_featured'),
  });
  scope.add(() => {
    for (const undo of spots.values()) undo();
    spots.clear();
  });

  // Dialogs open into <body>, outside the grid.
  const dialogs = new Map();
  const scanDialogs = () => {
    for (const dialog of document.querySelectorAll('.newmodal')) {
      if (!dialogs.has(dialog) && dialog.querySelector('.newmodal_content input[type="radio"]')) {
        dialogs.set(dialog, buildChoices(dom, dialog));
      }
    }
    for (const [dialog, undo] of dialogs) if (!dialog.isConnected) dialogs.delete(dialog);
  };
  scanDialogs();
  scope.observe(scanDialogs, { filter: (record) => [...record.addedNodes, ...record.removedNodes].some((node) => node.nodeType === 1) });
  scope.add(() => {
    for (const undo of dialogs.values()) undo();
    dialogs.clear();
  });

  return () => scope.destroy();
};
