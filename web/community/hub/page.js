/*
 * Community Hub (/app/<id>...): what hub/page.css can't do alone.
 *
 *  - Hero art: the game's library hero, preloaded from Steam's CDN (two hosts, in order) and
 *    set (--se-hub-art, [data-se-hub-art]) on the header card only once one has loaded, so a
 *    game without hero art keeps the plain card. The card is .apphub_HomeHeader on the home
 *    tabs and the .game_title_area around the plain header on the forum-style tabs.
 *  - Shared items (/sharedfiles/filedetails/: guides, screenshots, workshop items) carry the
 *    hub's header too: the game comes from the header's links (appIdOf), and the item's
 *    breadcrumbs move under the card (moveCrumbs).
 *  - Header parts on every tab: Steam renders the live stats (in-game count, group chat,
 *    Follow, View Stats), the friends who play and "More ways to connect" only on the home
 *    tab. Every other tab fetches the home page, parses just its header and copies the parts
 *    it lacks into its own header, so every tab's card has the same rows and height. The home
 *    tab's feed note ("Most popular community and official content for the past week")
 *    describes only that tab's feed, so it isn't copied. Steam's inline handlers come along,
 *    but some (Follow) call functions only the home page's inline scripts define: those
 *    definitions are lifted from the fetched page and defined here when missing. Parts are
 *    cached per game for a few minutes in sessionStorage (only a complete set), so moving
 *    between tabs fetches nothing; a click on the stats (Follow) drops the cache so the next
 *    tab shows the new state. The shared observer puts the parts back if Steam re-renders the
 *    header. A click anywhere on a stats chip runs its link (chipClicks).
 *  - Friends who play: Steam's "+N" chip shows the total; it is rewritten to the friends
 *    without an avatar shown.
 *  - Social links: Steam's HTML holds only a mount for "More ways to connect" that its script
 *    fills after load, and that script renders into every .social_links it finds, so copies of
 *    it multiplied. Wherever Steam has rendered the strip, its label and links (not markup)
 *    are kept per game in localStorage for a week; other tabs draw the theme's own strip
 *    (.se-hub-social) from them, and hub/page.css hides it whenever Steam's own has links.
 *  - Toolbar: Steam renders a tab's sort, time range and language filters inside the header
 *    card, which hub/page.css limits to the content and the footer strip. They move into a row
 *    above the feed (.se-hub-toolbar), as Steam's own nodes so their handlers keep working.
 *    The sort dropdown becomes chips, with a period dropdown for Most Helpful (buildSort); the
 *    other dropdowns (language) become the web's one dropdown (web/shared/select.js).
 *  - Announcements and the News tab's reader: hub/news.js.
 *  - Masonry feed: the cards sit in a grid of thin rows (--se-hub-row); each card spans as
 *    many rows as its height needs (--se-hub-span), measured with a ResizeObserver so it
 *    follows image loads, window resizes and Steam's "See More Content" pages. The grid only
 *    switches to thin rows ([data-se-hub-grid]) once the measuring runs.
 *
 * destroy() removes every variable, mark and observer.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  const GRID = '#AppHubCards';
  const CARD = '.apphub_Card';

  // The header card: the home tabs' full header, the forum-style tabs' plain one, or a shared
  // item's (a guide, a screenshot, a workshop item: /sharedfiles/filedetails/), which carries the
  // hub's header too
  const PLAIN_HEADER = ':is(.game_title_area, .sharedfiles_item_page_header):has(.apphub_HomeHeaderContent)';
  const findHeader = () => document.querySelector('.apphub_HomeHeader') ?? document.querySelector(PLAIN_HEADER);

  // The game: in the path on the hub, else from the header's Store Page link or section tabs
  const APP_LINK = '.apphub_OtherSiteInfo a[href*="/app/"], .apphub_sectionTab[href*="/app/"]';
  const currentAppId = () =>
    location.pathname.match(/^\/app\/(\d+)/)?.[1] ??
    document.querySelector(APP_LINK)?.getAttribute('href')?.match(/\/app\/(\d+)/)?.[1] ??
    null;

  /** The game's id, once the header that names it has been parsed. */
  const appIdOf = async (dom) => {
    const now = currentAppId();
    if (now) return now;
    await dom.ready();
    return currentAppId();
  };

  /** Hero art behind the header. */
  const buildArt = async (dom, $) => {
    const appid = await appIdOf(dom);
    if (!appid || !$.alive) return;
    let art = null;

    const apply = () => {
      const header = findHeader();
      if (!header || !art) return;
      dom.setVar(header, '--se-hub-art', `url("${art}")`);
      dom.mark(header, 'data-se-hub-art');
    };

    dom.firstLoaded(dom.heroURLs(appid)).then((url) => {
      if (!$.alive || !url) return;
      art = url;
      apply();
      $.observe(apply);
    });

    $.add(() => {
      const header = findHeader();
      header?.style.removeProperty('--se-hub-art');
      header?.removeAttribute('data-se-hub-art');
    });
  };

  const HOME = /^\/app\/\d+\/?$/;
  const PART_CACHE_MS = 5 * 60 * 1000;
  // Header parts copied from the home tab: into the header's content grid, or onto the card itself.
  const CONTENT_PARTS = ['.apphub_Stats', '.apphub_recentFriendsArea'];

  /** The home page's header as HTML: only that slice is parsed, not the whole page. It runs to
      the feed (#AppHubCards); the header's own footer (social links, the feed note) sits after
      blocks that reuse filter class names, so an earlier marker cut the social links off. */
  const headerSlice = (html) => {
    const start = html.search(/<div[^>]*class="apphub_HomeHeader["\s]/);
    if (start < 0) return null;
    const end = html.indexOf('id="AppHubCards"', start);
    return html.slice(start, end > start ? html.lastIndexOf('<', end) : start + 100000);
  };

  // bump the version when the parts change
  const partsKey = (appid) => `se-hub-parts:5:${appid}`;

  /** Names of the functions a subtree's inline handlers (on*, javascript: links) call. */
  const handlerCalls = (root) => {
    const names = new Set();
    for (const node of root.querySelectorAll('*')) {
      for (const { name, value } of node.attributes) {
        const code = name.startsWith('on') ? value : name === 'href' && /^javascript:/i.test(value) ? value.slice(11) : '';
        for (const [, fn] of code.matchAll(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g)) names.add(fn);
      }
    }
    return names;
  };

  /** End of the block whose "{" is at open: the index after its "}", skipping strings and comments. */
  const blockEnd = (code, open) => {
    let depth = 0;
    for (let i = open; i < code.length; i++) {
      const ch = code[i];
      if (ch === '"' || ch === "'" || ch === '`') {
        for (i++; i < code.length && code[i] !== ch; i++) if (code[i] === '\\') i++;
      } else if (ch === '/' && code[i + 1] === '/') {
        i = code.indexOf('\n', i);
        if (i < 0) return -1;
      } else if (ch === '/' && code[i + 1] === '*') {
        i = code.indexOf('*/', i + 2) + 1;
        if (i <= 0) return -1;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}' && --depth === 0) {
        return i + 1;
      }
    }
    return -1;
  };

  /** Each named function's declaration ({ name: source }) as the page's inline scripts define it. */
  const inlineDefinitions = (html, names) => {
    const scripts = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]);
    const defs = {};
    for (const name of names) {
      const declaration = new RegExp(`\\bfunction\\s+${name.replace(/\$/g, '\\$')}\\s*\\(`);
      for (const code of scripts) {
        const start = code.search(declaration);
        if (start < 0) continue;
        const end = blockEnd(code, code.indexOf('{', start));
        if (end > 0) defs[name] = code.slice(start, end);
        break;
      }
    }
    return defs;
  };

  /** The home tab's header parts ({ selector: outerHTML }) for one game, plus the inline
      functions their handlers call (defs), cached briefly. */
  const homeParts = async (appid) => {
    const key = partsKey(appid);
    try {
      const cached = JSON.parse(sessionStorage.getItem(key));
      if (cached && Date.now() - cached.at < PART_CACHE_MS) return cached.parts;
    } catch {
      // no cache: fetch
    }
    try {
      // no-store: a Follow made a moment ago must show in the copy
      const response = await fetch(`/app/${appid}/`, { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) return null;
      const html = await response.text();
      const slice = headerSlice(html);
      if (!slice) return null;
      const template = document.createElement('template');
      template.innerHTML = slice;
      const parts = {};
      const calls = new Set();
      for (const selector of CONTENT_PARTS) {
        const node = template.content.querySelector(selector);
        parts[selector] = node?.outerHTML ?? null;
        if (node) for (const name of handlerCalls(node)) calls.add(name);
      }
      // A page without the stats (an error page, a sign-in wall) is not a set worth keeping
      if (!parts['.apphub_Stats']) return null;
      parts.defs = inlineDefinitions(html, calls);
      try {
        sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), parts }));
      } catch {
        // storage full or blocked: works uncached
      }
      return parts;
    } catch {
      return null;
    }
  };

  /** One part as a live node. importNode re-creates it in this document, so Steam's inline
      onclick handlers (Follow, Group Chat, View Stats) are live. */
  const partNode = (html) => {
    const template = document.createElement('template');
    template.innerHTML = html;
    const source = template.content.firstElementChild;
    return source ? document.importNode(source, true) : null;
  };

  const HEADER_NODES = '.apphub_HomeHeader, .game_title_area, .sharedfiles_item_page_header';
  const SOCIAL_CACHE_MS = 7 * 24 * 60 * 60 * 1000;
  const socialKey = (appid) => `se-hub-social:2:${appid}`;

  /** The social strip saved for this game ({ label, links: [{ href, target, title, svg }] }), or null. */
  const savedSocial = (appid) => {
    try {
      const saved = JSON.parse(localStorage.getItem(socialKey(appid)));
      return saved && Date.now() - saved.at < SOCIAL_CACHE_MS ? saved.strip : null;
    } catch {
      return null;
    }
  };

  // Header changes only: inside the card, or the card itself arriving
  const touchesHeader = (record) =>
    Boolean(record.target.closest?.(HEADER_NODES)) ||
    [...record.addedNodes].some((node) => node.nodeType === 1 && (node.matches(HEADER_NODES) || node.querySelector(HEADER_NODES)));

  /** Steam's rendered strip on this page, once its script has filled the mount. */
  const nativeSocial = () => {
    const strip = findHeader()?.querySelector(':scope > .social_links');
    return strip?.querySelector('a[href]') ? strip : null;
  };

  /** Save the strip's label and links (not its markup) once Steam has rendered it, on any tab. */
  const keepSocial = async (dom, $) => {
    const appid = await appIdOf(dom);
    if (!appid || !$.alive) return;
    const scan = () => {
      const strip = nativeSocial();
      if (!strip) return;
      const data = {
        label: dom.squash(strip.querySelector(':scope > div > div:first-child')?.textContent),
        links: [...strip.querySelectorAll('a[href]')].map((link) => ({
          href: link.href,
          target: link.getAttribute('target') ?? '',
          title: link.getAttribute('aria-label') ?? link.title ?? '',
          svg: link.querySelector('svg')?.outerHTML ?? '',
        })),
      };
      if (JSON.stringify(savedSocial(appid)) === JSON.stringify(data)) return;
      try {
        localStorage.setItem(socialKey(appid), JSON.stringify({ at: Date.now(), strip: data }));
      } catch {
        // storage full or blocked: other tabs show only Steam's own strip
      }
    };
    scan();
    $.observe(scan, { filter: touchesHeader });
  };

  /** The saved strip as the theme's own element, in the markup shape the strip's styles expect. */
  const buildSocial = (dom, strip) => {
    const links = strip.links.map(({ href, target, title, svg }) => {
      const icon = document.createElement('template');
      icon.innerHTML = svg;
      const link = dom.el('a', { href, title: title || null, 'aria-label': title || null }, [
        dom.el('div', {}, icon.content.firstElementChild ? [document.importNode(icon.content.firstElementChild, true)] : []),
      ]);
      if (target) {
        link.target = target;
        link.rel = 'noopener';
      }
      return link;
    });
    return dom.el('div', { class: 'se-hub-social' }, [
      dom.el('div', {}, [dom.el('div', { text: strip.label }), dom.el('div', {}, links)]),
    ]);
  };

  // Functions defined from the home page's inline scripts: once per document, and kept on
  // teardown, since Steam's handlers in the copied parts may still call them
  const definedHandlers = new Set();

  /** Define the copied handlers' functions this page lacks, in the page's own scope. */
  const defineHandlers = (defs) => {
    for (const [name, source] of Object.entries(defs ?? {})) {
      if (definedHandlers.has(name) || typeof window[name] === 'function') continue;
      definedHandlers.add(name);
      const script = document.createElement('script');
      script.textContent = source;
      document.head.append(script);
      script.remove(); // the declaration stays global once run
    }
  };

  /** A click on the stats (Follow) changes what the home page renders: drop the cached copy on
      every tab, the home tab included, so the next tab fetches the new state. */
  const dropPartsOnClick = async (dom, $) => {
    const appid = await appIdOf(dom);
    if (!appid || !$.alive) return;
    const drop = (event) => {
      if (!event.target.closest?.('.apphub_Stats')) return;
      try {
        sessionStorage.removeItem(partsKey(appid));
      } catch {
        // storage blocked: nothing cached
      }
    };
    document.addEventListener('click', drop, true);
    $.add(() => document.removeEventListener('click', drop, true));
  };

  // A clan's SteamID64 (the game's group): 103582791429521408 + its account id
  const CLAN_ID = /\b(1035827\d{11})\b/;

  /** The game group's SteamID64, when the link is Group Chat (Steam's
      javascript:OpenGroupChat( '<clan id>' )); null for any other chip (Follow). Only the link
      itself is read: a clan id elsewhere in the header must never turn Follow into a chat. */
  const clanSteamId = (link) =>
    `${link.getAttribute('href') ?? ''} ${link.getAttribute('onclick') ?? ''}`.match(CLAN_ID)?.[1] ?? null;

  /**
   * The stats chips look like one button (hub/page.css), but in a chip with a count and a link
   * ("5,693 in Group Chat") only the link's text took clicks. A click anywhere on a chip runs
   * its link, on every tab. Group Chat's own link (OpenGroupChat: steam://friends/joinchat)
   * never reaches the client from the Store/Community view, so the game group's id is handed
   * to the Friends dock (client/friends/dock/flyouts.js), which opens the chat in its flyout.
   * Outside the client (no SteamClient) Steam's link runs as it is.
   */
  const chipClicks = ($) => {
    const onClick = (event) => {
      if (event.button !== 0) return;
      const chip = event.target.closest?.('.apphub_Stats .apphub_Chat');
      const link = chip?.querySelector('a');
      if (!link) return;
      const steamid = clanSteamId(link);
      const host = window.SteamClient?.BrowserView;
      if (steamid && typeof host?.PostMessageToParent === 'function') {
        event.preventDefault();
        event.stopPropagation();
        try {
          host.PostMessageToParent('SteamEnhanced.OpenClanChat', steamid);
        } catch {
          // no host to hand it to
        }
        return;
      }
      if (event.target.closest('a')) return;
      event.preventDefault();
      link.click();
    };
    document.addEventListener('click', onClick, true);
    $.add(() => document.removeEventListener('click', onClick, true));
  };

  /** The home tab's stats, friends and social strip on every other tab. */
  const buildParts = async (dom, $, originals) => {
    if (HOME.test(location.pathname)) return;
    const appid = await appIdOf(dom);
    if (!appid || !$.alive) return;
    let parts = null;

    // Idempotent: adds only what the header lacks, so it can run on every header change
    const apply = () => {
      const header = findHeader();
      const content = header?.querySelector('.apphub_HomeHeaderContent');
      if (!parts || !content) return;
      for (const selector of CONTENT_PARTS) {
        if (!parts[selector] || content.querySelector(selector)) continue;
        const node = partNode(parts[selector]);
        if (!node) continue;
        node.setAttribute(dom.OWN, ''); // Steam's own changes inside (the stats menu) wake no one
        content.append($.owned(node));
        if (node.matches('.apphub_recentFriendsArea')) fixMoreCount(node, originals);
      }
      // Steam's own strip, when this tab renders one, hides this copy (hub/page.css)
      const strip = savedSocial(appid);
      if (strip && !header.querySelector(':scope > .se-hub-social')) header.append($.owned(buildSocial(dom, strip)));
    };

    homeParts(appid).then((found) => {
      if (!$.alive || !found) return;
      parts = found;
      defineHandlers(parts.defs);
      apply();
      $.observe(apply, { filter: touchesHeader });
    });
  };

  /** A shared item's header holds its breadcrumbs (Game > Guides > author's guides): they move
      under the card, which keeps only the hub's rows. */
  const moveCrumbs = ($) => {
    const apply = () => {
      const header = findHeader();
      const crumbs = header?.matches('.sharedfiles_item_page_header') && header.querySelector(':scope > .breadcrumbs');
      if (crumbs) $.move(crumbs, header.parentNode, header.nextSibling);
    };
    apply();
    $.observe(apply, { filter: touchesHeader });
  };

  const digits = (text) => Number.parseInt(String(text ?? '').replace(/\D/g, ''), 10);

  /**
   * Steam's "+N" chip after the friend avatars holds the total ("20 Friends who play" shows 8
   * avatars and "+20"). Rewrite it to the friends not shown. Only when it equals the total, so a
   * correct count from Steam is never subtracted again, and the rewrite runs once per chip.
   * originals keeps Steam's text for teardown.
   */
  const fixMoreCount = (area, originals) => {
    const chip = area?.querySelector('.apphub_more_friends_who_play');
    if (!chip || originals.has(chip)) return;
    const total = digits(area.querySelector(':scope > a:not(.apphub_more_friends_who_play)')?.textContent);
    const shown = area.querySelectorAll('.apphub_friend_block_row .playerAvatar').length;
    if (!total || !shown || digits(chip.textContent) !== total) return;
    originals.set(chip, chip.textContent);
    const rest = total - shown;
    if (rest > 0) chip.textContent = `+${rest}`;
    else chip.hidden = true; // every friend already has an avatar
  };

  /** The friends who play: the "+N" chip counts only the friends without an avatar shown. */
  const buildMoreFriends = ($, originals) => {
    const scan = () => {
      for (const area of document.querySelectorAll('.apphub_recentFriendsArea')) fixMoreCount(area, originals);
    };
    scan();
    $.observe(scan, { filter: touchesHeader });
    $.add(() => {
      for (const [chip, text] of originals) {
        chip.textContent = text;
        chip.hidden = false;
      }
      originals.clear();
    });
  };

  // A header block holding filters. The header's content, footer strip and Steam's responsive
  // copies of the section tabs (a dropdown too) never qualify
  const FILTER_BLOCK = '.apphub_SectionFilter, :has(div.filterselect, .apphub_SortByContainer)';
  const HEADER_KEEP = '.apphub_HomeHeaderContent, .social_links, .se-hub-social, [class*="responsive"], :has(.apphub_sectionTab)';

  /**
   * The tab's filters, out of the header card into a toolbar row above the feed. Each filter
   * block's first div dropdown is the sort, as chips (buildSort); every other one (language), and a
   * sort the chips can't read, becomes the web's one dropdown (web/shared/select.js).
   */
  const buildToolbar = (dom, $, selectReady) => {
    const done = new WeakSet();

    // Once web/shared/select.js is in: the toolbar row is already in place, so this shifts nothing down.
    // One row: each control takes its caption ("Show", "Language") as its name, and the caption
    // goes; the help link ("About Reviews") becomes a text button at the row's end
    const dropdowns = () => selectReady.then((select) => {
      if (!select || !$.alive) return;
      for (const block of document.querySelectorAll('.se-hub-toolbar > *, #AppHubContent .apphub_SectionFilter')) {
        const captions = [...block.querySelectorAll('.apphub_SectionFilterLabel')];
        block.querySelectorAll('div.filterselect').forEach((filter, index) => {
          if (done.has(filter)) return;
          done.add(filter);
          // The nearest caption before it that no other control has taken
          const caption = captions.filter((node) => node.compareDocumentPosition(filter) & Node.DOCUMENT_POSITION_FOLLOWING).pop();
          if (caption) captions.splice(captions.indexOf(caption), 1);
          const name = dom.squash(caption?.textContent) || null;
          const list = select.findList(filter, '.filterselect_options');
          const replaced = (index === 0 && buildSort(dom, $, select, filter, list, name)) ||
            select.enhanceDivSelect(dom, $, filter, list, { option: 'div.option', name });
          if (replaced) select.hideSource($, caption);
        });
        // Only a button link: other tabs' blocks hold their sorts as plain text links
        for (const link of block.querySelectorAll('a[href][class*="btn"]:not(div.filterselect a, .filterselect_options a, [data-se-hub-help])')) {
          const text = dom.squash(link.textContent);
          if (!text) continue;
          $.mark(link, 'data-se-hub-help');
          // Out of Steam's wrapper (its own spacing) into the row, after the dropdowns
          if (link.parentElement !== block) $.move(link, block);
        }
      }
    });

    let bar = null;
    let empty = null;

    // Above the feed; with no feed at all (a filter with nothing in it, e.g. Friends' Items when
    // no friend has posted), under the header, so the filters stay in reach
    const place = (header, grid) => {
      if (grid?.parentNode) {
        if (bar.nextElementSibling !== grid) grid.before(bar);
      } else if (header.nextElementSibling !== bar) {
        header.after(bar);
      }
    };

    // Steam shows nothing at all for an empty filter; the theme says so. Only once the page is
    // parsed, so a feed that hasn't arrived yet never reads as empty
    const showEmpty = (grid) => {
      const isEmpty = !grid && document.readyState !== 'loading';
      if (isEmpty && !empty?.isConnected) {
        empty = $.owned(dom.el('div', { class: 'se-hub-empty', role: 'status' }, [
          dom.el('p', { class: 'se-hub-empty__title', text: 'Nothing here yet' }),
          dom.el('p', { class: 'se-hub-empty__text', text: 'Try another sort or filter.' }),
        ]));
      }
      if (isEmpty) {
        if (bar.nextElementSibling !== empty) bar.after(empty);
      } else if (empty) {
        empty.remove();
        empty = null;
      }
    };

    // Idempotent: moves only blocks still in the header, so it can run on every header change
    const apply = () => {
      const header = findHeader();
      if (!header) return;
      const grid = document.querySelector(GRID);
      const blocks = [...header.children].filter(
        (node) => node.matches(FILTER_BLOCK) && !node.matches(HEADER_KEEP) && !node.hasAttribute(dom.OWN),
      );
      if (blocks.length && !bar) bar = $.owned(dom.el('div', { class: 'se-hub-toolbar' }));
      if (!bar) return;
      place(header, grid);
      for (const block of blocks) $.move(block, bar);
      showEmpty(grid);
      dropdowns();
    };

    // Runs from the start, not after load: the row is in place as the feed first paints, so the
    // cards never jump down. The header or the feed arriving wakes it; the end of parsing settles
    // whether the feed is there at all
    apply();
    $.observe(apply, { filter: (record) => touchesHeader(record) || [...record.addedNodes].some(
      (node) => node.nodeType === 1 && (node.matches(GRID) || node.querySelector(GRID))) });
    dom.ready().then(() => {
      if ($.alive) apply();
    });
  };

  /**
   * Sort chips: Steam's sort is one div dropdown ("Most Helpful (Week)") whose options pair a sort
   * with an optional period. The sorts become a segmented row of chips (.se-hub-sort); a sort with
   * periods (Most Helpful) gets the web's dropdown beside it while it is the current one. Both
   * click Steam's own option, so its handler loads the view as before; Steam's dropdown stays in
   * the page, hidden (web/shared/select.js hideSource). Returns whether the chips stand in.
   */
  // "Most Helpful (Week)": the sort, then the period in brackets. Read from the text, not the
  // markup, which nests the parts differently by tab
  const WITH_PERIOD = /^(.*?)\s*\(([^()]+)\)$/;
  const parseOption = (dom, option) => {
    const full = dom.squash(option.textContent);
    const [, base = full, period = null] = full.match(WITH_PERIOD) ?? [];
    return base ? { option, base, period, full } : null;
  };

  // More choices than this is a list to pick from (languages), not a set of sorts
  const MAX_SORTS = 8;

  const buildSort = (dom, $, select, filter, list, name) => {
    const options = [...(list?.querySelectorAll('div.option') ?? [])]
      .map((option) => parseOption(dom, option))
      .filter(Boolean);
    const shown = select.shownChoice(dom, filter, list);
    const current = options.find((entry) => entry.full === shown) ?? null;
    const groups = new Map();
    for (const entry of options) (groups.get(entry.base) ?? groups.set(entry.base, []).get(entry.base)).push(entry);
    if (!current || groups.size < 2 || groups.size > MAX_SORTS) return false;

    const chips = [...groups].map(([base, entries]) => {
      const on = current.base === base;
      const chip = dom.el('button', { class: 'se-hub-sort__chip', type: 'button', text: base, 'aria-pressed': String(on) });
      // A sort with periods opens at its first (Steam lists All Time first); the current one is a no-op
      $.listen(chip, 'click', () => {
        if (!on) entries[0].option.click();
      });
      return chip;
    });
    const row = dom.el('div', { class: 'se-hub-sort', role: 'group', 'aria-label': name }, chips);
    filter.before($.owned(row));
    select.hideSource($, filter);
    select.hideSource($, list);

    const periods = current.period ? groups.get(current.base) : null;
    if (periods?.length > 1) {
      const native = dom.el('select', { 'aria-label': current.base }, periods.map((entry, index) =>
        dom.el('option', { value: String(index), text: entry.period, selected: entry === current })));
      row.after($.owned(native));
      select.enhanceSelect(dom, $, native);
      $.listen(native, 'change', () => periods[Number(native.value)]?.option.click());
    }
    return true;
  };

  /** Row spans for the masonry feed. */
  const buildMasonry = (dom, $) => {
    const grid = document.querySelector(GRID);
    if (!grid) return;

    const style = getComputedStyle(grid);
    const row = Number.parseFloat(style.getPropertyValue('--se-hub-row')) || 4;
    const gap = Number.parseFloat(style.getPropertyValue('--se-hub-gap')) || 0;

    // The card's bottom margin is the gap, so the span covers height + gap.
    const size = (card, height) => {
      if (height > 0) dom.setVar(card, '--se-hub-span', String(Math.ceil((height + gap) / row)));
    };

    const resize = new ResizeObserver((entries) => {
      for (const entry of entries) size(entry.target, entry.borderBoxSize?.[0]?.blockSize ?? entry.target.offsetHeight);
    });

    const watched = new Set();
    const scan = () => {
      for (const card of grid.querySelectorAll(CARD)) {
        if (watched.has(card)) continue;
        watched.add(card);
        resize.observe(card);
      }
      for (const card of watched) {
        if (card.isConnected) continue;
        watched.delete(card);
        resize.unobserve(card);
      }
    };

    scan();
    $.mark(grid, 'data-se-hub-grid');
    $.observe(scan, { filter: (record) => grid.contains(record.target) });
    $.add(() => {
      resize.disconnect();
      for (const card of watched) card.style.removeProperty('--se-hub-span');
      watched.clear();
    });
  };

  web.define(async (dom) => {
    const $ = dom.scope();
    const originals = new Map();
    buildArt(dom, $);
    buildMoreFriends($, originals);
    buildParts(dom, $, originals);
    dropPartsOnClick(dom, $);
    chipClicks($);
    keepSocial(dom, $);
    moveCrumbs($);
    const selectReady = Promise.resolve(web.parts.select)
      .catch(() => null); // Steam's own dropdowns stay, in the web dropdown's look (web/shared/select.css)
    buildToolbar(dom, $, selectReady);
    await dom.ready();
    if ($.alive) buildMasonry(dom, $);
    return () => $.destroy();
  });
})();
