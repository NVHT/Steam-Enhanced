/*
 * Discussions home (/discussions/): the parts CSS can't do alone. Styles are discussions/home.css.
 *
 *   - Search: the theme's own field in place of Steam's, whose absolutely placed input and box
 *     art (forums.css) fight every restyle: the shared search field (its submit button the
 *     magnifier) with a "/" key hint.
 *     Submitting copies the query into Steam's input and clicks Steam's submit image, so
 *     Steam's own search runs; without one it submits Steam's form. Steam's field is hidden
 *     ([data-se-dsc-search]) only while the theme's is in place. "/" focuses the field from
 *     anywhere on the page. The Game Forums tab's game search is the shared search field.
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
 *   - Quick list: Steam's div dropdown becomes the web's one dropdown (web/shared/select.js), as every
 *     dropdown on the web does; choosing clicks Steam's own item.
 *   - Tooltips: the tabs' `title` hovers (feature group blurbs, full last-post dates ...) show in
 *     the theme's tooltip (shared/tips.js) in place of the browser's light system box.
 *
 * Classes and ids are Steam's (SteamTracking: steamcommunity.com/public/css/skin_1/
 * discussions.css, forums.css) and the page report.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

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

  // Feature groups: [pattern over "<link> <name>", core icon (--se-icon-*)]; the first match wins
  const GROUP_ICONS = [
    [/filmmaker|\bsfm\b/i, 'art-trailer'],
    [/\bsdk\b|coding/i, 'code'],
    [/beta/i, 'refresh'],
    [/trading|cards/i, 'cards'],
    [/remote|stream|link/i, 'video'],
    [/frame/i, 'vr'],
    [/vr\b|steamvr|virtual/i, 'vr'],
    [/deck/i, 'deck'],
    [/market/i, 'tag'],
    [/universe/i, 'globe'],
    [/linux|proton/i, 'console'],
    [/labs?\b/i, 'flask'],
    [/broadcast/i, 'broadcast'],
    [/famil/i, 'family'],
    [/music|soundtrack/i, 'music'],
    [/controller/i, 'gamepad'],
    [/machine/i, 'pc'],
    [/chat/i, 'bubble'],
  ];

  // Steam forums: [pattern over the forum's name, core icon]; the first match wins. The language
  // forums are named in their own language, so they match on the word for "forum" and the
  // language's own name.
  const FORUM_ICONS = [
    [/new to steam/i, 'sparkle'],
    [/help|tips/i, 'help'],
    [/suggest|idea/i, 'idea'],
    [/\bmac\b|macos/i, 'display'],
    [/mobile/i, 'mobile'],
    [/community/i, 'family'],
    [/\bvac\b|cheat/i, 'shield'],
    [/hardware|operating/i, 'cpu'],
    [/off.?topic/i, 'mug'],
    [/server/i, 'server'],
    [/level design|mapping/i, 'map'],
    [/\bart\b|sound/i, 'palette'],
    [/coding|scripting|\bsdk\b/i, 'code'],
    [/discussion/i, 'community'],
    [/форум|deutsch|franc|portugu|españ|espan|ital|polsk|nederl|türk|česk|magyar|中文|日本|한국|ไทย|\bfor[oum]+\b|fórum/i, 'language'],
  ];

  /** A core icon mask as --se-dsc-line (home-forums.css); its tile sets the size and tone. */
  const lineIcon = (name) => {
    const node = web.dom.el('span', { class: 'se-dsc-line' });
    node.style.setProperty('--se-dsc-line', `var(--se-icon-${name})`);
    return node;
  };

  const isTyping = (target) =>
    target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));

  web.define(async (dom) => {
    const [{ titleTips }, { enhanceDivSelect, findList }] = await Promise.all([
      Promise.resolve(web.parts.tips),
      Promise.resolve(web.parts.select),
    ]);
    const $ = dom.scope();
    const { el, mark, unmark, setVar, squash } = dom;

    const tips = titleTips(dom, TIP_TARGETS);
    $.add(() => tips.destroy());

    /* ---------- Search: the theme's field, Steam's search behind it ---------- */

    const field = el('input', { type: 'text', class: 'se-dsc-search-input', autocomplete: 'off', enterKeyHint: 'search' });
    field.spellcheck = false; // el() skips false values
    const hint = el('kbd', { class: 'se-dsc-key', text: '/', 'aria-hidden': 'true' });
    const go = el('button', { type: 'submit', 'aria-label': 'Search' });
    const search = el('form', { class: 'se-dsc-search', role: 'search' }, [field, hint, go]);
    $.add(() => search.remove());
    $.search(field, search, go);

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

    // Geometry is read only when the open tab changes or the ResizeObserver says a tab moved
    // (`measure`), never on a plain observer pass
    let pillOn = null;
    const movePill = (measure = false) => {
      const active = tabs().find((tab) => tab.classList.contains('active'));
      if (!active) {
        pillOn = null;
        pill.style.opacity = '0';
        return;
      }
      if (active === pillOn && !measure) return;
      pillOn = active;
      dom.slidePill(pill, { x: active.offsetLeft, w: active.offsetWidth });
      pill.style.opacity = '1';
    };

    const placeTabs = () => {
      const bar = document.querySelector('.discussions_header');
      if (!bar) return;
      mark(bar, 'role', 'tablist');
      mark(bar, 'data-se-dsc-tabs');
      if (pill.parentElement !== bar) {
        bar.prepend(pill);
        resize.observe(bar);
      }
      for (const tab of tabs()) {
        resize.observe(tab); // a no-op for a tab already observed
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

    const resize = new ResizeObserver(() => movePill(true));
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

    // A forum row's name: the name node's own text nodes (not its child elements' text), else
    // all of its text
    const forumName = (row) => {
      const nameNode = row.querySelector('.discussions_forumlist_forumname');
      const own = [...(nameNode?.childNodes ?? [])].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent).join(' ');
      return squash(own) || squash(nameNode?.textContent);
    };

    const forumRows = () =>
      [...document.querySelectorAll('#forum_list_general .discussions_forum_row')].map((row) => ({
        name: forumName(row),
        href: row.querySelector('.discussions_forumlist_linkoverlay a[href]')?.getAttribute('href') ?? '',
        threads: Number((row.querySelector('.discussions_forumlist_topiccount')?.textContent ?? '').replace(/\D/g, '')) || 0,
        last: squash(row.querySelector('.discussions_forumlist_lastpost')?.textContent),
      }));

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
        const name = forumName(row);
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

    /* ---------- Game search: the shared search field, Steam's image button its magnifier ---------- */

    const placeGameSearch = () => {
      const input = document.querySelector('#game_search_form .discussionSearchText');
      const box = input?.closest('.discussionSearchTextContainer');
      if (box) $.search(input, box, box.querySelector('.discussionSearchTextSubmitImg'));
    };

    /* ---------- Quick list: the web's one dropdown over Steam's ---------- */

    // enhanceDivSelect does a dropdown once; choosing clicks Steam's own item
    const placeQuickList = () => {
      const trigger = document.getElementById('quicklistselect');
      if (!trigger) return;
      enhanceDivSelect(dom, $, trigger, findList(trigger, '#quicklistselect_options'), { option: '.option, .popup_menu_item' });
    };

    /* ---------- Run ---------- */

    const scan = () => {
      placeSearch();
      placeGameSearch();
      placeTabs();
      placeRecent();
      placeArt();
      placeExtras();
      placeTiles();
      placeTitle();
      placeGroupIcons();
      placeQuickList();
      tips.scan();
    };

    $.observe(scan, { attributes: ['class'] });
    scan();

    return () => $.destroy();
  });
})();
