/*
 * Discussions home (/discussions/): the parts CSS can't do alone. Styles are discussions/home.css.
 *
 *   - Search: the theme's own field (input, "/" key hint, round search button) in place of
 *     Steam's, whose absolutely placed input and box art (forums.css) fight every restyle.
 *     Submitting copies the query into Steam's input and clicks Steam's submit image, so
 *     Steam's own search runs; without one it submits Steam's form. Steam's field is hidden
 *     ([data-se-dsc-search]) only while the theme's is in place. "/" focuses the field from
 *     anywhere on the page.
 *   - Hero extras, from the page's own data: a "Popular" row (the five Steam forums with the most
 *     threads, as chips) and a stats row (forum count, total threads, the newest post's time).
 *     Rebuilt only when their data changes.
 *   - Section titles (Steam Feature Discussions, Games You've Recently Played): Steam writes
 *     them in capitals; each is lower-cased
 *     ([data-se-dsc-case]) so CSS can capitalise it like the "Steam Forums" heading. Restored
 *     on destroy.
 *   - Feature group tiles: each Steam feature group's picture becomes a theme duotone icon matched
 *     from the group's link and name (cards, VR, Deck, Market ...), or its first letter when none
 *     matches; the same neutral tile as the forum cards.
 *   - Forum tiles: each Steam forum card's icon (Steam's envelope, its unread mark) becomes a
 *     theme duotone icon matched from the forum's name (the language forums share one), or its
 *     first letter when none matches.
 *   - Tabs: Steam's three forum tabs become a tablist with a pill that slides to the open tab.
 *     Each tab is still Steam's own link, so Steam's code switches the panels.
 *   - Recent games: each card gets the game's store header art (--se-dsc-art) and, in place of
 *     Steam's 32px app icon, its tall library cover (--se-dsc-cover, [data-se-dsc-cover]), each
 *     preloaded from Steam's CDN and only set once it has loaded, so a game without one keeps
 *     what it had. The Game Forums tab's Games You've Recently Played rows get the same. Each panel gets its card count
 *     (--se-dsc-recent, at most 4) for its columns. Steam renders the unread indicator on every
 *     card; a card is tagged unread ([data-se-dsc-unread]) only when the indicator holds a real
 *     icon (not a blank spacer, not hidden).
 *
 *   - Tooltips: the tabs' `title` hovers (feature group blurbs, full last-post dates ...) show in
 *     the theme's tooltip (shared/tips.js) in place of the browser's light system box.
 *
 * Classes and ids are Steam's (SteamTracking: steamcommunity.com/public/css/skin_1/
 * discussions.css, forums.css) and the page report.
 */


// Elements whose `title` moves to the theme's tooltip
const TIP_TARGETS = '#discussions_tab_contents [title]:not(input, textarea, select, iframe)';
const ART_URLS = (appid) => [
  `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`,
];

const COVER_URLS = (appid) => [
  `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appid}/library_600x900.jpg`,
  `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`,
];

const preload = (url) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => (img.naturalWidth > 1 ? resolve(url) : reject(new Error('empty')));
    img.onerror = reject;
    img.src = url;
  });

const firstLoaded = async (urls) => {
  for (const url of urls) {
    try {
      return await preload(url);
    } catch {
      // next host
    }
  }
  return null;
};

const appidOf = (href) => {
  try {
    return new URL(href, location.href).pathname.match(/^\/app\/(\d+)/)?.[1] ?? null;
  } catch {
    return null;
  }
};

// Feature groups: [pattern over "<link> <name>", icon]; the first match wins
const GROUP_ICONS = [
  [/filmmaker|\bsfm\b/i, 'film'],
  [/\bsdk\b|coding/i, 'code'],
  [/beta/i, 'beta'],
  [/trading|cards/i, 'cards'],
  [/remote|stream|link/i, 'remote'],
  [/frame/i, 'vr'],
  [/vr\b|steamvr|virtual/i, 'vr'],
  [/deck/i, 'deck'],
  [/market/i, 'market'],
  [/universe/i, 'universe'],
  [/linux|proton/i, 'linux'],
  [/labs?\b/i, 'labs'],
  [/broadcast/i, 'broadcast'],
  [/famil/i, 'families'],
  [/music|soundtrack/i, 'music'],
  [/controller/i, 'controller'],
  [/machine/i, 'machine'],
  [/chat/i, 'chat'],
];

// Steam forums: [pattern over the forum's name, icon]; the first match wins. The language
// forums are named in their own language, so they match on the word for "forum" and the
// language's own name.
const FORUM_ICONS = [
  [/new to steam/i, 'new'],
  [/help|tips/i, 'help'],
  [/suggest|idea/i, 'idea'],
  [/\bmac\b|macos/i, 'mac'],
  [/mobile/i, 'mobile'],
  [/community/i, 'families'],
  [/\bvac\b|cheat/i, 'vac'],
  [/hardware|operating/i, 'hardware'],
  [/off.?topic/i, 'offtopic'],
  [/server/i, 'server'],
  [/level design|mapping/i, 'level'],
  [/\bart\b|sound/i, 'art'],
  [/coding|scripting|\bsdk\b/i, 'code'],
  [/discussion/i, 'discuss'],
  [/форум|deutsch|franc|portugu|españ|espan|ital|polsk|nederl|türk|česk|magyar|中文|日本|한국|ไทย|\bfor[oum]+\b|fórum/i, 'language'],
];

// 24px duotone line icons: the outline in currentColor over a soft fill of it (the theme's
// duotone style, as core/tokens.css's --se-icon-* icons)
const ICON_SVG = {
  new: '<path fill="currentColor" fill-opacity=".32" d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/><path fill="currentColor" fill-opacity=".32" d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  help: '<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".32"/><circle cx="12" cy="12" r="3.5"/><path d="m5.6 5.6 4 4M14.4 14.4l4 4M18.4 5.6l-4 4M9.6 14.4l-4 4"/>',
  idea: '<path d="M9 18h6M10 21h4"/><path fill="currentColor" fill-opacity=".32" d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  discuss: '<path fill="currentColor" fill-opacity=".32" d="M3 5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H8l-4 3v-3H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M18 9h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-1v3l-4-3h-5a1 1 0 0 1-1-1v-1"/>',
  mac: '<rect x="4" y="5" width="16" height="11" rx="1.5" fill="currentColor" fill-opacity=".32"/><path d="M2 19h20"/>',
  mobile: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5" fill="currentColor" fill-opacity=".32"/><path d="M11 18h2"/>',
  vac: '<path fill="currentColor" fill-opacity=".32" d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
  hardware: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" fill-opacity=".32"/><rect x="9.5" y="9.5" width="5" height="5" rx=".5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  offtopic: '<path fill="currentColor" fill-opacity=".32" d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 2.5v2.5M12 2.5v2.5"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2" fill="currentColor" fill-opacity=".32"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  level: '<path fill="currentColor" fill-opacity=".32" d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20z"/><path d="M9 4v13.5M15 6.5V20"/>',
  art: '<path fill="currentColor" fill-opacity=".32" d="M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.9 1.5-1.9-.3-1 .4-2.1 1.5-2.1H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  code: '<rect x="3" y="4" width="18" height="16" rx="2" fill="currentColor" fill-opacity=".32"/><path d="m9 9-3 3 3 3M15 9l3 3-3 3"/>',
  film: '<rect x="3" y="5" width="18" height="14" rx="2" fill="currentColor" fill-opacity=".32"/><path d="M7 5v14M17 5v14M3 9.5h4M3 14.5h4M17 9.5h4M17 14.5h4"/>',
  language: '<path fill="currentColor" fill-opacity=".32" d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="m9 14 3-7 3 7M10 12h4"/>',
  beta: '<circle cx="12" cy="12" r="8" stroke="none" fill="currentColor" fill-opacity=".32"/><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v4h-4"/><path d="M12 8v4l2.5 1.5"/>',
  cards: '<rect x="3.5" y="6" width="11" height="14" rx="2" fill="currentColor" fill-opacity=".32" transform="rotate(-8 9 13)"/><path d="M15.6 4.4 20.2 6l-3.4 12.6"/>',
  remote: '<rect x="3" y="4" width="18" height="13" rx="2" fill="currentColor" fill-opacity=".32"/><path d="M8 21h8"/><path d="m10.5 8 4 2.5-4 2.5z"/>',
  vr: '<path fill="currentColor" fill-opacity=".32" d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4l-2-2.5h-2L9 17H5a2 2 0 0 1-2-2z"/>',
  deck: '<rect x="2" y="7" width="20" height="10" rx="3" fill="currentColor" fill-opacity=".32"/><rect x="8" y="9.5" width="8" height="5" rx="1"/>',
  market: '<path d="M3 12V4h8l10 10-8 8z" fill="currentColor" fill-opacity=".32"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  universe: '<circle cx="12" cy="12" r="9" fill="currentColor" fill-opacity=".32"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  linux: '<rect x="3" y="4" width="18" height="16" rx="2" fill="currentColor" fill-opacity=".32"/><path d="m7 9 3 3-3 3M13 15h4"/>',
  labs: '<path stroke="none" fill="currentColor" fill-opacity=".32" d="M10.5 9.5 5 18.5A1.7 1.7 0 0 0 6.5 21h11a1.7 1.7 0 0 0 1.5-2.5l-5.5-9z"/><path d="M9.5 3h5M10.5 3v6.5L5 18.5A1.7 1.7 0 0 0 6.5 21h11a1.7 1.7 0 0 0 1.5-2.5l-5.5-9V3"/><path d="M7.5 15h9"/>',
  broadcast: '<circle cx="12" cy="12" r="2" fill="currentColor" fill-opacity=".32"/><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  families: '<circle cx="9" cy="8" r="3.5" fill="currentColor" fill-opacity=".32"/><path d="M2.5 20c.6-3.6 3.2-5.8 6.5-5.8s5.9 2.2 6.5 5.8M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.6c1.7.8 2.7 2.7 3 5.4"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5" fill="currentColor" fill-opacity=".32"/><circle cx="17.5" cy="16" r="2.5" fill="currentColor" fill-opacity=".32"/>',
  controller: '<path fill="currentColor" fill-opacity=".32" d="M7 7h10a5 5 0 0 1 4.9 6l-.6 3a2.6 2.6 0 0 1-4.5 1.2L14.8 15H9.2l-2 2.2A2.6 2.6 0 0 1 2.7 16l-.6-3A5 5 0 0 1 7 7z"/><path d="M7.5 10v3M6 11.5h3M15.5 11h.01M17.5 12.5h.01"/>',
  machine: '<rect x="4" y="3" width="16" height="18" rx="2" fill="currentColor" fill-opacity=".32"/><path d="M4 15h16M15 18h2"/>',
  chat: '<path fill="currentColor" fill-opacity=".32" d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/>',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

const lineIcon = (name) => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('data-se-own', '');
  // Static, theme-authored markup only
  svg.innerHTML = ICON_SVG[name];
  return svg;
};

const isTyping = (target) =>
  target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));

export default async (dom) => {
  const { titleTips } = await dom.importNear(import.meta.url, '../shared/tips.js');
  const $ = dom.scope();
  const { el, mark, unmark, setVar, squash } = dom;

  const tips = titleTips(dom, TIP_TARGETS);
  $.add(() => tips.destroy());

  /* ---------- Search: the theme's field, Steam's search behind it ---------- */

  const field = el('input', { type: 'text', class: 'se-dsc-search-input', autocomplete: 'off', enterKeyHint: 'search' });
  field.spellcheck = false; // el() skips false values
  const hint = el('kbd', { class: 'se-dsc-key', text: '/', 'aria-hidden': 'true' });
  const go = el('button', { type: 'submit', class: 'se-dsc-search-go', 'aria-label': 'Search' });
  const search = el('form', { class: 'se-dsc-search', role: 'search' }, [field, hint, go]);
  $.add(() => search.remove());

  const steamForm = () => document.getElementById('GlobalDiscussionSearchForm');

  $.listen(search, 'submit', (event) => {
    event.preventDefault();
    const form = steamForm();
    const input = form?.querySelector('.discussionSearchText');
    const query = field.value.trim();
    if (!form || !input || !query) return;
    input.value = query;
    const submit = form.querySelector('.discussionSearchTextSubmitImg');
    if (submit) submit.click();
    else form.requestSubmit();
  });

  const placeSearch = () => {
    const ctn = document.querySelector('.global_discussion_search_ctn');
    const input = steamForm()?.querySelector('.discussionSearchText');
    if (!ctn || !input) return;
    if (search.nextElementSibling !== ctn) {
      ctn.before(search);
      if (!field.value) field.value = input.value;
    }
    const label = input.getAttribute('placeholder') || 'Search discussions';
    if (field.placeholder !== label) field.placeholder = label;
    mark(field, 'aria-label', label);
    mark(ctn, 'data-se-dsc-search');
  };
  $.add(() => unmark(document.querySelector('.global_discussion_search_ctn'), 'data-se-dsc-search'));

  $.listen(document, 'keydown', (event) => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
    if (!search.isConnected) return;
    event.preventDefault();
    field.focus();
    field.select();
  });

  $.listen(field, 'keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (field.value) field.value = '';
    else field.blur();
  });

  /* ---------- Tabs: a tablist with a sliding pill ---------- */

  const pill = el('span', { class: 'se-dsc-tabs-pill', 'aria-hidden': 'true' });
  $.add(() => pill.remove());

  const tabs = () => [...document.querySelectorAll('.discussions_header > a.group_tab')];

  const movePill = () => {
    const active = tabs().find((tab) => tab.classList.contains('active'));
    if (!active) {
      pill.style.opacity = '0';
      return;
    }
    setVar(pill, '--x', `${active.offsetLeft}px`);
    setVar(pill, '--w', `${active.offsetWidth}px`);
    pill.style.opacity = '1';
  };

  const placeTabs = () => {
    const bar = document.querySelector('.discussions_header');
    if (!bar) return;
    mark(bar, 'role', 'tablist');
    mark(bar, 'data-se-dsc-tabs');
    if (pill.parentElement !== bar) bar.prepend(pill);
    for (const tab of tabs()) {
      const selected = tab.classList.contains('active');
      mark(tab, 'role', 'tab');
      mark(tab, 'aria-selected', String(selected));
      mark(tab, 'tabindex', selected ? '0' : '-1');
    }
    movePill();
  };

  $.listen(document, 'keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const list = tabs();
    const at = list.indexOf(document.activeElement);
    if (at < 0) return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : (at + step + list.length) % list.length;
    list[next].focus();
    list[next].click();
  });

  const resize = new ResizeObserver(() => movePill());
  $.add(() => resize.disconnect());

  $.add(() => {
    const bar = document.querySelector('[data-se-dsc-tabs]');
    if (!bar) return;
    for (const name of ['role', 'data-se-dsc-tabs']) bar.removeAttribute(name);
    for (const tab of tabs()) for (const name of ['role', 'aria-selected', 'tabindex']) tab.removeAttribute(name);
  });

  /* ---------- Recent games: store header art ---------- */

  const art = new Map(); // appid -> Promise<url | null>
  const covers = new Map(); // appid -> Promise<url | null>

  const BLANK = /(?:^data:|trans|blank|spacer|1x1)/i;

  const isUnread = (card) => {
    const img = card.querySelector('.recent_game_discussions_unread_indicator img');
    const src = img?.getAttribute('src') ?? '';
    return Boolean(img) && Boolean(src) && !BLANK.test(src) && !img.hidden && img.style.display !== 'none' && img.style.visibility !== 'hidden';
  };

  const placeRecent = () => {
    for (const panel of document.querySelectorAll('.discussion_tab_content_area')) {
      const count = panel.querySelectorAll(':scope > a.recent_game_discussion:not(.quasi_official_group)').length;
      if (count) setVar(panel, '--se-dsc-recent', String(Math.min(count, 4)));
    }
    for (const card of document.querySelectorAll('a.recent_game_discussion:not(.quasi_official_group)')) {
      if (isUnread(card)) mark(card, 'data-se-dsc-unread');
      else unmark(card, 'data-se-dsc-unread');
    }
  };
  $.add(() => {
    for (const panel of document.querySelectorAll('.discussion_tab_content_area')) panel.style.removeProperty('--se-dsc-recent');
    for (const card of document.querySelectorAll('[data-se-dsc-unread]')) card.removeAttribute('data-se-dsc-unread');
  });

  // Recent game cards (Steam Forums tab) and the Games You've Recently Played rows (Game Forums
  // tab): the card's own link, or the row's link inside it
  const ART_TARGETS = 'a.recent_game_discussion:not(.quasi_official_group), .discussions_recentlyplayed';

  const placeArt = () => {
    for (const card of document.querySelectorAll(ART_TARGETS)) {
      if (card.hasAttribute('data-se-dsc-art')) continue;
      const href = card.matches('a') ? card.getAttribute('href') : card.querySelector('a[href]')?.getAttribute('href');
      const appid = appidOf(href ?? '');
      if (!appid) continue;
      mark(card, 'data-se-dsc-art', 'loading');
      if (!art.has(appid)) art.set(appid, firstLoaded(ART_URLS(appid)));
      art.get(appid).then((url) => {
        if (!$.alive || !card.isConnected) return;
        if (!url) {
          mark(card, 'data-se-dsc-art', 'none');
          return;
        }
        setVar(card, '--se-dsc-art', `url("${url}")`);
        mark(card, 'data-se-dsc-art', 'ready');
      });
      if (!covers.has(appid)) covers.set(appid, firstLoaded(COVER_URLS(appid)));
      covers.get(appid).then((url) => {
        if (!$.alive || !card.isConnected || !url) return;
        setVar(card, '--se-dsc-cover', `url("${url}")`);
        mark(card, 'data-se-dsc-cover');
      });
    }
  };
  $.add(() => {
    for (const card of document.querySelectorAll('[data-se-dsc-art], [data-se-dsc-cover]')) {
      card.style.removeProperty('--se-dsc-art');
      card.style.removeProperty('--se-dsc-cover');
      card.removeAttribute('data-se-dsc-art');
      card.removeAttribute('data-se-dsc-cover');
    }
  });

  /* ---------- Hero extras: popular forums, stats ---------- */

  const POPULAR_MAX = 5;
  const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
  const whole = new Intl.NumberFormat();

  // "3 minutes ago" -> seconds; unknown wording sorts last
  const UNITS = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
  const ageOf = (text) => {
    const t = text.toLowerCase();
    if (/just now|moments? ago/.test(t)) return 0;
    const match = t.match(/(\d+|an?|one)\s+(second|minute|hour|day|week|month|year)s?\s+ago/);
    if (!match) return Infinity;
    const n = /^\d+$/.test(match[1]) ? Number(match[1]) : 1;
    return n * UNITS[match[2]];
  };

  const forumRows = () =>
    [...document.querySelectorAll('#forum_list_general .discussions_forum_row')].map((row) => {
      const nameNode = row.querySelector('.discussions_forumlist_forumname');
      const ownText = [...(nameNode?.childNodes ?? [])].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join(' ');
      return {
        name: squash(ownText) || squash(nameNode?.textContent),
        href: row.querySelector('.discussions_forumlist_linkoverlay a[href]')?.getAttribute('href') ?? '',
        threads: Number((row.querySelector('.discussions_forumlist_topiccount')?.textContent ?? '').replace(/\D/g, '')) || 0,
        last: squash(row.querySelector('.discussions_forumlist_lastpost')?.textContent),
      };
    });

  const popular = el('div', { class: 'se-dsc-popular' });
  const stats = el('div', { class: 'se-dsc-stats' });
  const extras = el('div', { class: 'se-dsc-hero-extras' }, [popular, stats]);
  let extrasKey = '';
  $.add(() => extras.remove());

  const stat = (value, label, title) =>
    el('div', { class: 'se-dsc-stat', title: title ?? null }, [
      el('strong', { class: 'se-dsc-stat-n', text: value }),
      el('span', { class: 'se-dsc-stat-label', text: label }),
    ]);

  const placeExtras = () => {
    const content = document.querySelector('.discussions_page > .grouppage_content_area .group_content');
    if (!content) return;
    const rows = forumRows().filter((row) => row.name && row.href);
    if (!rows.length) return;
    if (extras.parentElement !== content) content.append(extras);

    const key = rows.map((row) => `${row.href}|${row.threads}|${row.last}`).join('\n');
    if (key === extrasKey) return;
    extrasKey = key;

    const top = [...rows].sort((a, b) => b.threads - a.threads).slice(0, POPULAR_MAX);
    popular.replaceChildren(
      el('span', { class: 'se-dsc-popular-label', text: 'Popular' }),
      ...top.map((row) => el('a', { class: 'se-dsc-chip', href: row.href, text: row.name })),
    );

    const total = rows.reduce((sum, row) => sum + row.threads, 0);
    const newest = rows.reduce((best, row) => (ageOf(row.last) < ageOf(best.last) ? row : best), rows[0]);
    stats.replaceChildren(
      stat(String(rows.length), 'Steam forums'),
      stat(compact.format(total), 'Discussions', whole.format(total)),
      stat(newest.last || '—', 'Latest post', newest.name),
    );
  };

  /* ---------- Forum tiles: theme icons ---------- */

  const placeTiles = () => {
    for (const row of document.querySelectorAll('.discussions_forum_row')) {
      const icon = row.querySelector('.discussions_forumlist_icon');
      if (!icon || icon.querySelector(':scope > .se-dsc-mono')) continue;
      const nameNode = row.querySelector('.discussions_forumlist_forumname');
      const own = [...(nameNode?.childNodes ?? [])].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join(' ');
      const name = squash(own) || squash(nameNode?.textContent);
      if (!name) continue;
      const match = FORUM_ICONS.find(([pattern]) => pattern.test(name))?.[1];
      const mono = el('span', { class: 'se-dsc-mono', 'aria-hidden': 'true' });
      if (match) mono.append(lineIcon(match));
      else mono.textContent = [...name][0];
      icon.append(mono);
    }
  };
  $.add(() => {
    for (const mono of document.querySelectorAll('.discussions_forumlist_icon > .se-dsc-mono')) mono.remove();
  });

  /* ---------- Feature group tiles: theme icons ---------- */

  const placeGroupIcons = () => {
    for (const card of document.querySelectorAll('a.recent_game_discussion.quasi_official_group')) {
      const avatar = card.querySelector('.playerAvatar');
      if (!avatar || avatar.querySelector(':scope > .se-dsc-glyph')) continue;
      const name = squash(card.querySelector('.recent_game_discussion_name')?.textContent);
      const key = `${card.getAttribute('href') ?? ''} ${name}`;
      const icon = GROUP_ICONS.find(([pattern]) => pattern.test(key))?.[1];
      const glyph = el('span', { class: 'se-dsc-glyph', 'aria-hidden': 'true' });
      if (icon) glyph.append(lineIcon(icon));
      else glyph.textContent = [...name][0] ?? '';
      if (!icon) mark(glyph, 'data-se-dsc-letter');
      avatar.append(glyph);
    }
  };
  $.add(() => {
    for (const glyph of document.querySelectorAll('.playerAvatar > .se-dsc-glyph')) glyph.remove();
  });

  /* ---------- Feature discussions title: capitals to a heading's case ---------- */

  const titles = new Map(); // node -> Steam's text

  const placeTitle = () => {
    for (const node of document.querySelectorAll('.forum_list_right > .discussions_forumlist_header > *, #forum_list_games .rightbox_content_header')) {
      if (titles.has(node) || node.childElementCount) continue;
      const text = node.textContent;
      if (!/\p{L}/u.test(text) || text !== text.toLocaleUpperCase()) continue;
      titles.set(node, text);
      node.textContent = text.toLocaleLowerCase();
      mark(node, 'data-se-dsc-case');
    }
  };
  $.add(() => {
    for (const [node, text] of titles) {
      if (!node.isConnected) continue;
      node.textContent = text;
      node.removeAttribute('data-se-dsc-case');
    }
    titles.clear();
  });

  /* ---------- Run ---------- */

  const scan = () => {
    placeSearch();
    placeTabs();
    placeRecent();
    placeArt();
    placeExtras();
    placeTiles();
    placeTitle();
    placeGroupIcons();
    tips.scan();
  };

  $.observe(scan, { attributes: ['class'] });
  scan();

  const bar = document.querySelector('.discussions_header');
  if (bar) resize.observe(bar);

  return () => $.destroy();
};
