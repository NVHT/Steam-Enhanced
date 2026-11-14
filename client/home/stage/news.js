/*
 * What's New column: Steam's news cards read into items, their kinds and sources, the featured
 * card and its carousel, opening a card, and Steam's official news feed.
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedHomeStageParts;
  if (!ns) return;
  const {
    client, dayLabel, decode, ICON_FILTER, NEWS_CARD, NEWS_DATE, NEWS_GAME, NEWS_HEADING,
    NEWS_IMAGE, newsPicker, partnerEventStore, readPick, schedule,
  } = ns;
  const { live } = ns;

  const { run } = SE;

  function newsCards(row) {
    let cards = [...row.querySelectorAll(NEWS_CARD)].filter((c) => c.childElementCount);
    if (!cards.length) {
      cards = [...row.querySelectorAll(NEWS_IMAGE)].map((img) => {
        let el = img;
        for (let i = 0; i < 6 && el.parentElement && el.parentElement !== row; i++) {
          el = el.parentElement;
          if (el.querySelector(NEWS_GAME)) break;
        }
        return el;
      });
    }
    return [...new Set(cards)];
  }

  function imageOf(card) {
    const box = card.querySelector(NEWS_IMAGE) || card;
    const img = box.matches('img') ? box : box.querySelector('img');
    const src = img?.currentSrc || img?.src;
    if (src && !src.startsWith('data:')) return src;
    for (const el of [box, ...box.querySelectorAll('*')].slice(0, 30)) {
      const m = /url\(["']?([^"')]+)["']?\)/.exec(el.style?.backgroundImage || '');
      if (m) return m[1];
    }
    const appid = SE.fromProps(card, 14, (p) =>
      typeof p.event?.appid === 'number' ? p.event.appid : typeof p.appid === 'number' ? p.appid : null
    );
    return appid ? `/assets/${appid}/header.jpg` : '';
  }

  function language() {
    for (const o of SE.owners()) {
      const l = run(() => o.LocalizationManager.GetELanguageFallbackOrder()[0]);
      if (typeof l === 'number') return l;
    }
    return 0;
  }

  const isEvent = (v) => v && typeof v === 'object' && (v.GID !== undefined || v.AnnouncementGID !== undefined);

  // A card's event, found once per layout pass (title, time, kind and item all need it).
  let cardEvents = new Map();
  function eventOf(card) {
    if (!cardEvents.has(card)) cardEvents.set(card, SE.fromProps(card, 14, (p) => (isEvent(p.event) ? p.event : null)) || null);
    return cardEvents.get(card);
  }

  function eventTitle(card) {
    const ev = eventOf(card);
    if (!ev) return '';
    const lang = language();
    const name =
      run(() => ev.GetNameWithFallback(lang)) ||
      (ev.name && (ev.name[lang] || ev.name[0])) ||
      ev.event_name ||
      '';
    return typeof name === 'string' ? name.trim() : '';
  }

  function eventTime(card) {
    const ev = eventOf(card);
    if (!ev) return 0;
    const t = run(() => ev.GetStartTimeAndDateUnixSeconds()) ?? ev.startTime ?? ev.rtime32_start_time ?? ev.start_time;
    return typeof t === 'number' && t > 0 ? t : 0;
  }

  const NEWS_TYPES = {
    events: 'Events',
    streams: 'Live-streams',
    updates: 'Content updates',
    releases: 'Releases',
    sales: 'Sales',
    news: 'News',
    steam: 'Steam official',
  };
  const NEWS_SUBS = { steam: 'Steam Blog and News' };
  const TYPE_KIND = {
    22: 'events',
    23: 'events',
    24: 'events',
    25: 'events',
    26: 'events',
    27: 'events',
    35: 'events',
    11: 'streams',
    17: 'streams',
    18: 'streams',
    19: 'streams',
    12: 'updates',
    13: 'updates',
    14: 'updates',
    30: 'updates',
    32: 'updates',
    33: 'updates',
    10: 'releases',
    15: 'releases',
    16: 'releases',
    29: 'releases',
    20: 'sales',
    21: 'sales',
    31: 'sales',
    28: 'news',
    34: 'news',
  };
  const STEAM_APP = 593110;
  const STEAM_SOURCES = [
    { name: 'Steam Frame', app: 4165890 },
    { name: 'Steam Client Beta', clan: 4397053, group: 'steamclientbeta' },
    { name: 'Steam Promotions', clan: 39049601 },
    { name: 'Steam Hardware', clan: 45479024, group: 'steam_hardware' },
    { name: 'Steam Deck', app: 1675200 },
    { name: 'Steam News', app: STEAM_APP, clan: 4 },
    { name: 'SteamVR', app: 250820 },
  ];
  const steamSource = (appid, clan) => STEAM_SOURCES.find((source) =>
    (source.app && source.app === Number(appid)) || (source.clan && source.clan === Number(clan))
  );

  function officialSourceFromLink(link) {
    const app = /\/(?:app|games)\/(\d+)(?:[/?#]|$)/i.exec(link)?.[1];
    const group = /\/(?:group|groups)\/([^/?#]+)/i.exec(link)?.[1]?.toLowerCase();
    return steamSource(app, group) || STEAM_SOURCES.find((source) => group && source.group === group);
  }

  function eventKind(card, title, game) {
    const ev = eventOf(card);
    const clan = run(() => ev.clanSteamID.GetAccountID()) ?? run(() => ev.clan_account_id);
    if (steamSource(ev?.appid, clan) || /^steam( blog| news( hub)?| official)?$/i.test(game || '')) return 'steam';
    const t = Number(ev?.type ?? ev?.event_type);
    if (TYPE_KIND[t]) return TYPE_KIND[t];
    if (/% off|\b(sale|deal|discount|free weekend|free to play this weekend)\b/i.test(title)) return 'sales';
    if (/\b(live ?stream|streaming|twitch|broadcast|live now)\b/i.test(title)) return 'streams';
    if (/\b(dlc|out now|available now|launch(es|ed)?|release[sd]?|early access|coming)\b/i.test(title)) {
      return 'releases';
    }
    if (/\b(update|patch|hotfix|changelog|beta|v?\d+\.\d+(\.\d+)?)\b/i.test(title)) return 'updates';
    if (/\b(event|season|contest|challenge|tournament|halloween|christmas|anniversary)\b/i.test(title)) {
      return 'events';
    }
    return 'news';
  }

  const WEEK = 7 * 24 * 60 * 60;
  const SKIP = `${NEWS_IMAGE}, ${NEWS_DATE}, ${NEWS_GAME}`;

  function shownTitle(card) {
    const walk = document.createTreeWalker(card, NodeFilter.SHOW_ELEMENT);
    for (let el = walk.nextNode(); el; el = walk.nextNode()) {
      if (el.closest(SKIP)) continue;
      if ([...el.children].some((c) => c.textContent.trim())) continue;
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      if (text && el.getClientRects().length) return text;
    }
    return '';
  }

  function newsExcerpt(value, title, game) {
    if (typeof value !== 'string') return '';
    const normalize = (line) => line.replace(/\s+/g, ' ').trim();
    const repeated = [title, game].map((line) => normalize(line).toLowerCase());
    const excerpt = decode(value)
      .replace(/\[(img|previewyoutube|video|spoiler)\b[^\]]*\][\s\S]*?\[\/\1\]/gi, '')
      .replace(/\{STEAM_CLAN_IMAGE\}[^\s\]]+/g, '')
      .replace(/<\/?(?:p|div|li|h[1-6]|br)\b[^>]*>/gi, '\n')
      .replace(/\[\/?(?:h[1-6]|list|olist|p)\b[^\]]*\]/gi, '\n')
      .replace(/<\/?[a-z][^>]*>|\[\/?(?:b|i|u|s|strike|url|quote|code|center|hr|table|tr|td)\b[^\]]*\]|\[\*\]/gi, '')
      .replace(/https?:\/\/\S+/gi, '')
      .split(/\r?\n/)
      .map(normalize)
      .filter((line) => /[\p{L}\p{N}]/u.test(line) && !repeated.includes(line.toLowerCase()))
      .join(' ');
    return excerpt.length > 320 ? excerpt.slice(0, 320).trimEnd() + '…' : excerpt;
  }

  function newsItem(card) {
    const game = card.querySelector(NEWS_GAME);
    const title = eventTitle(card) || shownTitle(card);
    const event = eventOf(card);
    const clan = run(() => event.clanSteamID.GetAccountID()) ?? event?.clan_account_id;
    const source = steamSource(event?.appid, clan);
    const name = source?.name || game?.textContent.trim() || '';
    const lang = language();
    const summary = run(() => event?.GetSummaryWithFallback?.(lang, 320));
    const raw = card.querySelector(NEWS_DATE)?.textContent.trim() || '';
    return {
      img: imageOf(card),
      title,
      game: name,
      icon: game?.querySelector('img')?.src || '',
      day: dayLabel(eventTime(card)) || raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase(),
      kind: source ? 'steam' : eventKind(card, title, name),
      excerpt: newsExcerpt(summary, title, name),
    };
  }

  function carouselOf(row, cards) {
    const heading = row.querySelector(NEWS_HEADING);
    let el = cards[0];
    while (
      el.parentElement &&
      el.parentElement !== row &&
      !(heading && el.parentElement.contains(heading)) &&
      cards.every((c) => el.parentElement.contains(c))
    ) {
      el = el.parentElement;
    }
    while (el !== row && !cards.every((c) => el.contains(c))) {
      el = el.parentElement;
    }
    return el === row ? null : el;
  }

  let newsSig = '';
  let newsBox = null;
  let newsFeat = null;
  live.newsHeads = null;
  let newsHead = null;
  let newsFilt = null;
  let newsCardsNow = [];
  let newsItems = [];
  let featured = 0;

  const NEWS_HUB = 'https://store.steampowered.com/news/collection/library/';
  const openHub = () => {
    const sc = client();
    run(() => sc.URL.ExecuteSteamURL(`steam://openurl/${NEWS_HUB}`));
  };

  function officialEventLink(url, sourceName) {
    const post = /^https:\/\/store\.steampowered\.com\/news\/(app|group)\/(\d+)\/view\/(\d+)(?:[/?#]|$)/i.exec(url);
    if (post) {
      const [, kind, source, eventid] = post;
      return kind.toLowerCase() === 'app'
        ? { appid: Number(source), eventid }
        : { clan: Number(source), eventid };
    }
    const announcement = /^https:\/\/steamcommunity\.com\/(?:games|app|groups|gid)\/[^/]+\/announcements\/detail\/(\d+)(?:[/?#]|$)/i.exec(url);
    if (!announcement) return null;
    const source = officialSourceFromLink(url) || STEAM_SOURCES.find(({ name }) => name === sourceName);
    if (!source) return null;
    return { appid: source.app, clan: source.clan, announcement: announcement[1] };
  }

  async function resolveOfficialEvent({ url, game }) {
    const link = officialEventLink(url, game);
    const store = partnerEventStore();
    if (!link || !store) return null;
    const { appid, clan, eventid, announcement } = link;
    const cached = eventid
      ? store.GetClanEventModel?.(eventid)
      : store.GetClanEventFromAnnouncementGID?.(announcement);
    if (cached) return cached;
    const clanID = clan ? { GetAccountID: () => clan } : undefined;
    const load = store.LoadPartnerEventGeneric;
    if (typeof load !== 'function') return null;
    let timer;
    try {
      return await Promise.race([
        load.call(store, clanID, appid, eventid, announcement, 0),
        new Promise((resolve) => { timer = setTimeout(resolve, 3500); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  let newsOpenRequest = 0;

  async function openCard(i) {
    const request = ++newsOpenRequest;
    const it = newsItems[i];
    if (it?.url) {
      let event;
      try {
        event = await resolveOfficialEvent(it);
      } catch (_) {
        // A failed event lookup can still use the original link.
      }
      if (request !== newsOpenRequest) return;
      const main = SE.mainWindow();
      const appid = Number(event?.appid) || undefined;
      const clanSteamID = event?.clanSteamID;
      if (event?.GID && (appid || clanSteamID) && typeof main?.Navigate === 'function' &&
          main.BCanNavigate?.() !== false) {
        try {
          const location = main.m_history?.location;
          const state = location?.pathname === '/library/home' ? location.state : null;
          main.Navigate('/library/home', false, false, {
            ...(state && typeof state === 'object' ? state : {}),
            event_to_show: { appid, eventid: event.GID, clanSteamID },
          });
          return;
        } catch (_) {
          // A client without the Library event route can still use the link.
        }
      }
      const sc = client();
      run(() => sc.URL.ExecuteSteamURL(`steam://openurl/${it.url}`));
      return;
    }
    const card = newsCardsNow[i];
    if (card?.isConnected) (card.querySelector(NEWS_IMAGE) || card).click();
  }

  const STEAM_NEWS_DAYS = 30;
  const STEAM_NEWS_FEED = 'https://store.steampowered.com/feeds/news/collection/steam';
  let steamNews = { at: 0, items: [], busy: false };

  function clanImage(t) {
    const m =
      /\[img(?:\s+src=["']?([^"'\]\s]+)["']?)?\]\s*([^\[\s]*)/i.exec(t || '') ||
      /(\{STEAM_CLAN_IMAGE\}[^\s"'\[\]]+)/.exec(t || '');
    const raw = (m && (m[1] || m[2])) || '';
    return raw
      .replace('{STEAM_CLAN_IMAGE}', 'https://clan.akamai.steamstatic.com/images')
      .replace(/^http:/, 'https:');
  }

  function officialItem(source, title, contents, url, t, artwork) {
    title = decode(String(title || '')).trim();
    if (!title || !Number.isFinite(t) || !/^https:\/\//i.test(url)) return null;
    return {
      img: /^https?:\/\//i.test(artwork || '') ? decode(artwork).replace(/^http:/i, 'https:') : clanImage(contents),
      title,
      game: source.name,
      excerpt: newsExcerpt(contents, title, source.name),
      icon: '',
      day: dayLabel(t),
      kind: 'steam',
      url,
      t,
    };
  }

  async function steamCollection() {
    const response = await fetch(STEAM_NEWS_FEED, { credentials: 'omit' });
    if (!response.ok) return [];
    const feed = new DOMParser().parseFromString(await response.text(), 'application/xml');
    return [...feed.querySelectorAll('channel > item')].map((item) => {
      const field = (name) => item.querySelector(name)?.textContent?.trim() || '';
      const link = field('link');
      const source = officialSourceFromLink(link);
      if (!source) return null;
      const body = field('description');
      const image = [...item.children].find((el) =>
        ['thumbnail', 'content', 'enclosure'].includes(el.localName) &&
        (el.localName === 'thumbnail' || el.getAttribute('medium') === 'image' || el.getAttribute('type')?.startsWith('image/'))
      )?.getAttribute('url') || /<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(body)?.[1];
      return officialItem(source, field('title'), body, link, Date.parse(field('pubDate')) / 1000, image);
    });
  }

  async function steamNativeNews(source) {
    const store = partnerEventStore();
    // The pageable method reads the clan through GetAccountID when no app is supplied.
    const clan = source.app ? undefined : { GetAccountID: () => source.clan };
    const path = source.app ? `app/${source.app}` : `group/${source.clan}`;
    const events = await store?.LoadPartnerEventsPageable?.(clan, source.app, 0, 24) || [];
    const lang = language();
    return events.map((event) => officialItem(
      source,
      event.GetNameWithFallback(lang),
      event.GetSummaryWithFallback(lang, 320),
      `https://store.steampowered.com/news/${path}/view/${event.GID}`,
      event.GetStartTimeAndDateUnixSeconds(),
      event.GetImageURL('capsule', lang) || event.GetImageURL('header', lang)
    ));
  }

  async function steamLegacyNews() {
    const response = await fetch(
      `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${STEAM_APP}&count=24&maxlength=0&feeds=steam_community_announcements`,
      { credentials: 'omit' }
    );
    if (!response.ok) return [];
    const data = await response.json();
    return (data?.appnews?.newsitems || []).map((item) =>
      officialItem(steamSource(STEAM_APP), item.title, item.contents, item.url, item.date)
    );
  }

  const officialNewsKey = (item) =>
    `${item.game.toLowerCase()}:${item.title.toLowerCase().replace(/[\p{P}\s]+/gu, ' ').trim()}`;

  async function loadSteamOfficial() {
    const requests = [...STEAM_SOURCES.map(steamNativeNews), steamCollection(), steamLegacyNews()];
    const results = await Promise.allSettled(requests.map(async (request) => {
      let timer;
      try {
        return await Promise.race([request, new Promise((resolve) => {
          timer = setTimeout(() => resolve([]), 8000);
        })]);
      } finally {
        clearTimeout(timer);
      }
    }));
    const since = Date.now() / 1000 - STEAM_NEWS_DAYS * 86400;
    const items = new Map();
    for (const result of [...results, { status: "fulfilled", value: steamNews.items }]) {
      if (result.status !== 'fulfilled') continue;
      for (const item of result.value) {
        if (!item || item.t < since) continue;
        const key = officialNewsKey(item);
        const previous = items.get(key);
        if (!previous) items.set(key, item);
        else if (!previous.img && item.img) previous.img = item.img;
      }
    }
    steamNews.items = [...items.values()].sort((a, b) => b.t - a.t);
    steamNews.at = Date.now();
    steamNews.busy = false;
    schedule();
  }

  function steamOfficial() {
    if (!steamNews.busy && Date.now() - steamNews.at > (steamNews.items.length ? 30 : 2) * 60000) {
      steamNews.busy = true;
      void loadSteamOfficial();
    }
    return steamNews.items;
  }

  function paintFeature() {
    const it = newsItems[featured];
    if (newsFeat) newsFeat.hidden = !it;
    if (!newsFeat || !it) return;
    newsFeat.dataset.i = String(featured);
    newsFeat.setAttribute('aria-label', it.title);
    newsFeat.innerHTML =
      '<span class="se-hs-fpreview"><span class="se-hs-fheader">' +
      `<span class="se-hs-fkind">${SE.esc(NEWS_TYPES[it.kind] || NEWS_TYPES.news)}</span></span>` +
      (it.img ? `<img class="se-hs-fimg" src="${SE.esc(it.img)}" alt="" draggable="false">` : '') +
      (it.kind === 'steam' ? `<span class="se-hs-fsteam"${it.img ? ' hidden' : ''} aria-hidden="true">STEAM</span>` : '') +
      (it.excerpt
        ? `<span class="se-hs-fcaption"><span class="se-hs-fexcerpt">${SE.esc(it.excerpt)}</span></span>`
        : '') +
      '</span>';
    const fallback = newsFeat.querySelector('.se-hs-fsteam');
    const image = newsFeat.querySelector('.se-hs-fimg');
    if (fallback && image) {
      const showFallback = () => {
        image.remove();
        fallback.hidden = false;
      };
      image.addEventListener('error', showFallback, { once: true });
      if (image.complete && !image.naturalWidth) showFallback();
    }
    live.newsHeads?.querySelectorAll('.se-hs-hline').forEach((b) => {
      b.toggleAttribute('data-on', Number(b.dataset.i) === featured);
    });
  }

  function feature(i) {
    if (i !== featured && newsItems[i]) {
      featured = i;
      paintFeature();
    }
  }

  let newsCarousel = null;
  let newsWeekDone = false;

  function onHeadsScroll() {
    if (!live.newsHeads || newsWeekDone || live.newsHeads.scrollTop + live.newsHeads.clientHeight < live.newsHeads.scrollHeight - 140) {
      return;
    }
    const area = newsCarousel?.querySelector('[role="list"]') || newsCarousel;
    if (!area?.isConnected) return;
    area.scrollLeft = area.scrollWidth;
    area.dispatchEvent(new Event('scroll'));
  }

  function ensureNewsElements(row, ownHeading) {
    if (!newsBox) {
      newsBox = document.createElement('div');
      newsBox.className = 'se-hs-news';
      newsBox.innerHTML = '<button type="button" class="se-hs-feat"></button><div class="se-hs-heads" role="list"></div>';
      newsFeat = newsBox.firstChild;
      live.newsHeads = newsBox.lastChild;
      newsBox.addEventListener('click', (e) => {
        if (e.target.closest('.se-hs-hall')) {
          openHub();
          return;
        }
        const b = e.target.closest('[data-i]');
        if (b) openCard(Number(b.dataset.i));
      });
      live.newsHeads.addEventListener('pointerover', (e) => {
        const b = e.target.closest('.se-hs-hline');
        if (!b) return;
        feature(Number(b.dataset.i));
      });
      live.newsHeads.addEventListener(
        'scroll',
        () => {
          onHeadsScroll();
          SE.mark(
            live.newsHeads,
            'data-end',
            live.newsHeads.scrollTop + live.newsHeads.clientHeight >= live.newsHeads.scrollHeight - 2 ? 'yes' : 'no'
          );
        },
        { passive: true }
      );
      live.newsHeads.addEventListener('focusin', (e) => {
        const b = e.target.closest('.se-hs-hline');
        if (b) feature(Number(b.dataset.i));
      });
    }
    if (!newsFilt) {
      newsFilt = document.createElement('button');
      newsFilt.type = 'button';
      newsFilt.className = 'se-hs-pickbtn se-hs-nfilter';
      newsFilt.title = 'Filter news';
      newsFilt.setAttribute('aria-label', 'Filter news');
      newsFilt.setAttribute('aria-haspopup', 'dialog');
      newsFilt.setAttribute('aria-expanded', 'false');
      newsFilt.innerHTML = `${ICON_FILTER}<span class="se-hs-nflabel"></span>`;
      newsFilt.addEventListener('click', () => newsPicker(newsFilt));
    }
    if (ownHeading) {
      if (!newsHead) {
        newsHead = document.createElement('div');
        newsHead.className = 'se-hs-nhead';
        newsHead.innerHTML =
          '<span class="se-hs-nh">What’s New</span><span class="se-hs-ncount"></span>' +
          '<button type="button" class="se-hs-hall">View all news</button>';
        newsHead.addEventListener('click', (e) => {
          if (e.target.closest('.se-hs-hall')) openHub();
        });
      }
      if (newsHead.parentElement !== row || newsHead.nextElementSibling !== newsBox) {
        row.appendChild(newsHead);
      }
      const all = newsHead.querySelector('.se-hs-hall');
      if (newsFilt.parentElement !== newsHead || newsFilt.nextElementSibling !== all) {
        newsHead.insertBefore(newsFilt, all);
      }
      SE.unmark(newsFilt, 'data-bar');
    } else {
      newsHead?.remove();
      if (newsFilt.parentElement !== row || newsFilt.nextElementSibling !== newsBox) {
        row.appendChild(newsFilt);
      }
      SE.mark(newsFilt, 'data-bar');
    }
    if (
      newsBox.parentElement !== row ||
      (ownHeading && newsHead.nextElementSibling !== newsBox) ||
      (!ownHeading && newsFilt.nextElementSibling !== newsBox)
    ) {
      row.appendChild(newsBox);
    }
  }

  function paintNews(row) {
    const cards = row ? newsCards(row) : [];
    const carousel = cards.length ? carouselOf(row, cards) : null;
    row?.querySelectorAll('[data-se-hs-carousel]').forEach((el) => {
      if (el !== carousel) el.removeAttribute('data-se-hs-carousel');
    });
    if (!row || !carousel) {
      newsBox?.remove();
      newsHead?.remove();
      newsFilt?.remove();
      newsSig = '';
      return;
    }
    SE.mark(carousel, 'data-se-hs-carousel');
    newsCarousel = carousel;

    const heading = row.querySelector(NEWS_HEADING);
    const ownHeading = !(heading && !carousel.contains(heading) && heading.getClientRects().length);
    ensureNewsElements(row, ownHeading);

    const types = readPick('se-home-news-types');
    const want = types ? new Set(types) : null;
    const label = !want ? 'All types' : want.size === 1 ? NEWS_TYPES[[...want][0]] || '1 type' : `${want.size} types`;
    const lab = newsFilt.querySelector('.se-hs-nflabel');
    if (lab.textContent !== label) lab.textContent = label;
    newsFilt.toggleAttribute('data-on', Boolean(want));

    const since = Date.now() / 1000 - WEEK;
    const week = cards.filter((c) => {
      const t = eventTime(c);
      return !t || t >= since;
    });
    newsWeekDone = week.length < cards.length;

    const all = week.map((c) => ({ card: c, item: newsItem(c) }));
    const official = steamOfficial();
    if (official.length && (!want || want.has('steam'))) {
      let last = Date.now() / 1000;
      for (const x of all) {
        const t = eventTime(x.card);
        x.t = t || last;
        last = x.t;
      }
      const nativeKeys = new Set(all.filter(({ item }) => item.kind === 'steam').map(({ item }) => officialNewsKey(item)));
      for (const it of official) {
        if (!nativeKeys.has(officialNewsKey(it))) all.push({ card: null, item: it, t: it.t });
      }
      all.sort((a, b) => b.t - a.t);
    }

    const shown = want ? all.filter((x) => want.has(x.item.kind)) : all;
    const count = newsHead?.querySelector('.se-hs-ncount');
    if (count && count.textContent !== `· ${shown.length}`) count.textContent = `· ${shown.length}`;
    newsCardsNow = shown.map((x) => x.card);
    const items = shown.map((x) => x.item);
    const sig = (types || []).join() + JSON.stringify(items);

    if (sig !== newsSig) {
      newsSig = sig;
      newsItems = items;
      if (featured >= items.length) featured = 0;
      if (live.newsHeads.dataset.types !== (types || []).join()) {
        live.newsHeads.dataset.types = (types || []).join();
        live.newsHeads.scrollTop = 0;
        featured = 0;
      }
      let lastDay = null;
      live.newsHeads.innerHTML =
        items
          .map(
            (it, i) =>
              (it.day && it.day !== lastDay ? `<span class="se-hs-hday">${SE.esc((lastDay = it.day))}</span>` : '') +
              `<button type="button" class="se-hs-hline" role="listitem" data-i="${i}">` +
              `<span class="se-hs-htitle">${SE.esc(it.title)}</span>` +
              (it.game
                ? `<span class="se-hs-hmeta">${it.icon ? `<img src="${SE.esc(it.icon)}" alt="">` : ''}<span>${SE.esc(it.game)}</span></span>`
                : '') +
              '</button>'
          )
          .join('') +
        (items.length ? '' : '<span class="se-hs-empty">Nothing of these types lately</span>') +
        '<button type="button" class="se-hs-hall" data-foot>View all news</button>';
      paintFeature();
    }
    live.newsHeads.querySelector('[data-foot]').hidden = ownHeading;
  }

  /** teardown(): drop the news column; a full teardown (not leaving Home) forgets the news too. */
  function resetNews(leaving) {
    newsBox?.remove();
    newsHead?.remove();
    newsFilt?.remove();
    newsCardsNow = [];
    if (!leaving) {
      newsSig = '';
      newsItems = [];
      featured = 0;
    }
  }

  /** Each layout pass finds every card's event afresh. */
  function resetCardEvents() {
    cardEvents = new Map();
  }

  /** destroy(): a news card opening now is dropped when its lookup returns. */
  function cancelNewsOpen() {
    newsOpenRequest++;
  }

  Object.assign(ns, {
    NEWS_SUBS, NEWS_TYPES, cancelNewsOpen, paintNews, resetCardEvents, resetNews,
  });
});
