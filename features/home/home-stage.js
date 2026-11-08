/*
 * Library Home hero stage and bottom shelf tray.
 *
 * Renders recently played games in a full-bleed hero carousel with game logo,
 * store review summary, live player count, playtime/achievement counters,
 * Play/Install action button, and an 8-item thumbnail selector strip. Below the
 * stage, What's New, Favorites, and Collections are arranged side by side in a
 * three-column tray.
 *
 * Controlled via CSS custom properties in shared/tokens.css:
 *   --se-home-stage (on | off)
 *   --se-home-stage-cycle (seconds)
 *   --se-home-stage-tray (percentage of viewport height)
 */
(window.__se
  ? (init) => init(window.__se)
  : (init) => addEventListener('se-core', () => init(window.__se), { once: true })
)((SE) => {
  const { C, run, navigate, isInstalled, coverURLs, findDown } = SE;
  window.__steamEnhancedHomeStage?.destroy();

  const NEWS = `.${C.UpdatesContainer}`;
  const SHELF = `.${C.Showcase}`;
  const SHELF_HEADER = `.${C.ShowcaseHeader}`;
  const RECENT = `.${C.RecentGame}, .${C.EmptyDate_AddedDate}, .${C.FeaturedCapsule}`;
  const PLAY_NEXT = `.${C.PlayNextSubHead}, .${C.PlayNextCarouselSubHeading}, .${C.Message_AddedDate}`;
  const COLLECTION_TILE = `.${C.Collection}`;
  const ADD_SHELF = `.${C.AddShowcaseRow}, .${C.AddShowcase}`;
  const COVER = `.${C.LibraryItemBox}`;
  const NEWS_CARD = `.${C.PartnerEventRowCapsule}`;
  const NEWS_IMAGE = `.${C.PartnerEventRowCapsule_MainImageContainer}, .${C.EventImageWrapper}`;
  const NEWS_DATE = `.${C.NewUpdates_EventTime}, .${C.BasicHomeUpdates_EventTime}`;
  const NEWS_GAME = `.${C.ArrowWrapper_GameIconAndName}, .${C.BasicHomeUpdates_GameIconAndName}`;
  const NEWS_HEADING = `.${C.WhatsNewHeaderText}`;

  const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const enabled = () => token('--se-home-stage') !== 'off';
  const cycleSeconds = () => {
    const n = parseFloat(token('--se-home-stage-cycle'));
    return Number.isFinite(n) ? Math.max(0, n) : 9;
  };
  const trayShare = () => {
    const n = parseFloat(token('--se-home-stage-tray'));
    return Number.isFinite(n) ? Math.min(70, Math.max(0, n)) : 30;
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function host() {
    for (const o of SE.owners()) {
      try {
        if (o.appStore?.allApps) return o;
      } catch (_) {}
    }
    return null;
  }

  function client() {
    for (const o of SE.owners()) {
      try {
        if (o.SteamClient?.Apps) return o.SteamClient;
      } catch (_) {}
    }
    return window.SteamClient;
  }

  let recentCache = { at: 0, list: [] };

  function recentApps() {
    if (Date.now() - recentCache.at < 5000) return recentCache.list;
    const o = host();
    let list = [];
    if (o) {
      const hidden = (id) => run(() => o.collectionStore.BIsHidden(id)) || false;
      list =
        run(() =>
          o.appStore.allApps
            .filter(
              (a) =>
                a &&
                a.rt_last_time_played > 0 &&
                (a.app_type === 1 || a.app_type === 1073741824) &&
                a.visible_in_game_list !== false &&
                !hidden(a.appid)
            )
            .sort((a, b) => b.rt_last_time_played - a.rt_last_time_played)
            .slice(0, 8)
        ) || [];
    }
    recentCache = { at: Date.now(), list };
    return list;
  }

  const CDN = (id) => `https://shared.steamstatic.com/store_item_assets/steam/apps/${id}`;

  function artURLs(app, kind) {
    const s = host()?.appStore;
    const list = [];
    const add = (v) => {
      if (Array.isArray(v)) list.push(...v.filter(Boolean));
      else if (typeof v === 'string' && v) list.push(v);
    };
    if (s && app.rt_custom_image_mtime) {
      add(run(() => (kind === 'hero' ? s.GetCustomHeroImageURLs(app) : s.GetCustomLogoImageURLs(app))));
    }
    const file = kind === 'hero' ? 'library_hero.jpg' : 'logo.png';
    list.push(`/assets/${app.appid}/${file}`, `${CDN(app.appid)}/${file}`);
    if (kind === 'hero') {
      list.push(`/assets/${app.appid}/header.jpg`, `${CDN(app.appid)}/header.jpg`);
    }
    return [...new Set(list)];
  }

  /*
   * Art tries a local copy first, then the CDN. Until one copy has loaded the image is marked
   * data-se-art-wait and drawn as nothing (shared/images.css): a failed copy, and the wait
   * while the next loads, otherwise show the browser's broken-image icon.
   */
  const ART_WAIT = 'data-se-art-wait';

  function artImg(app, kind, cls, onFail) {
    const img = document.createElement('img');
    img.className = cls;
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.setAttribute(ART_WAIT, '');
    img.addEventListener('load', () => img.removeAttribute(ART_WAIT));
    const urls = artURLs(app, kind);
    let i = 0;
    img.onerror = () => {
      if (i < urls.length) {
        img.src = urls[i++];
      } else {
        img.onerror = null;
        img.hidden = true;
        onFail?.();
      }
    };
    img.src = urls[i++];
    return img;
  }

  const achievements = new Map();

  function achievementsOf(id) {
    if (achievements.has(id)) return achievements.get(id);
    achievements.set(id, null);
    const sc = client();
    if (typeof sc?.Apps?.GetMyAchievementsForApp !== 'function') return null;
    Promise.resolve(sc.Apps.GetMyAchievementsForApp(String(id)))
      .then((r) => {
        if (typeof r === 'string') r = JSON.parse(r);
        const all = r?.data?.rgAchievements;
        if (r?.result !== 1 || !Array.isArray(all) || !all.length) return;
        achievements.set(id, { got: all.filter((a) => a.bAchieved).length, total: all.length });
        if (apps[selected]?.appid === id) paintGame();
      })
      .catch(() => {});
    return null;
  }

  const INFO_KEY = 'se-home-info';
  const INFO_DAYS = 7;
  const infoCache = (() => {
    try {
      return JSON.parse(localStorage.getItem(INFO_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  })();
  try {
    localStorage.removeItem('se-home-desc');
  } catch (_) {}

  const infoAsked = new Set();
  let langAsk = null;

  const steamLanguage = () =>
    (langAsk ||= Promise.resolve(run(() => client().Settings.GetCurrentLanguage())).then(
      (l) => (typeof l === 'string' && /^[a-z]+$/.test(l) ? l : 'english'),
      () => 'english'
    ));

  function decode(t) {
    const el = document.createElement('textarea');
    el.innerHTML = t;
    return el.value;
  }

  function infoOf(id) {
    const hit = infoCache[id];
    if (hit && Date.now() - hit.at < INFO_DAYS * 864e5) return hit;
    if (infoAsked.has(id)) return hit || null;
    infoAsked.add(id);

    steamLanguage()
      .then((lang) => {
        const input = {
          ids: [{ appid: id }],
          context: { language: lang, country_code: 'US' },
          data_request: { include_basic_info: true, include_release: true, include_reviews: true },
        };
        return fetch(
          `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`,
          { credentials: 'omit' }
        );
      })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const item = j?.response?.store_items?.[0];
        if (!item) return;
        const b = item.basic_info || {};
        const rev = item.reviews?.summary_filtered || {};
        const rel = Number(item.release?.steam_release_date || item.release?.original_release_date) || 0;
        infoCache[id] = {
          at: Date.now(),
          text: decode(String(b.short_description || ''))
            .replace(/\s+/g, ' ')
            .trim(),
          dev: (b.developers || [])
            .map((d) => d?.name)
            .filter(Boolean)
            .slice(0, 2)
            .join(', '),
          year: rel ? new Date(rel * 1000).getFullYear() : 0,
          pct: Number.isFinite(rev.percent_positive) && rev.review_count >= 10 ? rev.percent_positive : null,
          score: String(rev.review_score_label || ''),
        };
        const keys = Object.keys(infoCache).sort((a, b) => infoCache[b].at - infoCache[a].at);
        for (const k of keys.slice(60)) delete infoCache[k];
        try {
          localStorage.setItem(INFO_KEY, JSON.stringify(infoCache));
        } catch (_) {}
        if (apps[selected]?.appid === id) paintGame();
      })
      .catch(() => {});

    return hit || null;
  }

  const players = new Map();

  function playersOf(id) {
    const hit = players.get(id);
    if (hit && Date.now() - hit.at < 60000) return hit.count;
    const ask = window.__steamEnhancedPlayerCount?.count;
    if (typeof ask !== 'function' || hit?.busy) return hit?.count ?? null;
    players.set(id, { ...hit, busy: true });
    Promise.resolve(ask(id)).then(
      (count) => {
        players.set(id, { count: Number.isSafeInteger(count) ? count : null, at: Date.now() });
        if (apps[selected]?.appid === id) paintGame();
      },
      () => players.set(id, { count: null, at: Date.now() })
    );
    return hit?.count ?? null;
  }

  const compact = (n) => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

  function hours(minutes) {
    const h = (minutes || 0) / 60;
    return h < 100 ? String(Math.round(h * 10) / 10) : Math.round(h).toLocaleString();
  }

  function relativeDate(t, weekdayForWeek) {
    if (!t) return '';
    const d = new Date(t * 1000);
    const now = new Date();
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const days = Math.round((day(now) - day(d)) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return weekdayForWeek ? d.toLocaleDateString(undefined, { weekday: 'long' }) : `${days} days ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  const when = (t) => relativeDate(t, false);
  const dayLabel = (t) => relativeDate(t, true);

  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>';
  const ICON_INSTALL = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
  const ICON_FILTER = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16l-6 7.5V19l-4-2v-4.5z"/></svg>';
  const ICON_PICK = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>';

  let scope = null;
  let scroller = null;
  let stage = null;
  let tray = null;
  let apps = [];
  let selected = 0;
  let appsSig = '';
  let hovering = false;
  let cycleTimer = 0;
  let cycleDue = false;
  const marked = new Set();
  const logos = new Map();

  function buildStage() {
    const el = document.createElement('div');
    el.className = 'se-hs-stage';
    el.innerHTML =
      '<div class="se-hs-art" aria-hidden="true"><div class="se-hs-grade"></div></div>' +
      '<div class="se-hs-body">' +
      '<button type="button" class="se-hs-title" data-act="page" title="Open game page"><span class="se-hs-name"></span></button>' +
      '<div class="se-hs-side">' +
      '<div class="se-hs-top"><span class="se-hs-by" hidden></span><span class="se-hs-chips"></span></div>' +
      '<p class="se-hs-desc" hidden></p>' +
      '<div class="se-hs-row">' +
      '<div class="se-hs-actions"><button type="button" class="se-hs-play" data-act="play"></button></div>' +
      '<div class="se-hs-meta"></div>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="se-hs-strip" role="group" aria-label="Recent games"></div>';
    el.addEventListener('click', onClick);
    el.addEventListener('pointerenter', () => {
      hovering = true;
    });
    el.addEventListener('pointerleave', () => {
      hovering = false;
    });
    return el;
  }

  function onClick(e) {
    const thumb = e.target.closest('.se-hs-thumb');
    if (thumb) {
      select(Number(thumb.dataset.i));
      restartCycle();
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    const app = apps[selected];
    if (!act || !app) return;
    const sc = client();
    if (act === 'play') {
      if (isInstalled(app)) run(() => sc.Apps.RunGame(String(app.appid), '', -1, 100));
      else run(() => sc.URL.ExecuteSteamURL(`steam://install/${app.appid}`));
    } else if (act === 'page') {
      navigate(`/library/app/${app.appid}`);
    }
  }

  function buildGames() {
    const art = stage.querySelector('.se-hs-art');
    const grade = art.querySelector('.se-hs-grade');
    art.querySelectorAll('.se-hs-layer').forEach((l) => l.remove());
    const strip = stage.querySelector('.se-hs-strip');
    strip.textContent = '';

    apps.forEach((app, i) => {
      const layer = document.createElement('div');
      layer.className = 'se-hs-layer';
      layer.appendChild(artImg(app, 'hero', 'se-hs-hero'));
      art.insertBefore(layer, grade);

      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'se-hs-thumb';
      b.dataset.i = String(i);
      b.setAttribute('aria-label', app.display_name || '');

      const pic = document.createElement('span');
      pic.className = 'se-hs-pic';
      pic.appendChild(artImg(app, 'hero', 'se-hs-thumbimg'));

      const label = document.createElement('span');
      label.className = 'se-hs-thumblabel';
      const name = document.createElement('span');
      name.className = 'se-hs-thumbname';
      name.textContent = app.display_name || '';
      const date = document.createElement('span');
      date.className = 'se-hs-thumbdate';
      date.textContent = when(app.rt_last_time_played);

      label.append(name, date);
      pic.appendChild(label);
      b.appendChild(pic);
      strip.appendChild(b);
    });
    strip.hidden = apps.length < 2;
  }

  function logoFor(app) {
    let entry = logos.get(app.appid);
    if (!entry) {
      entry = { ok: true };
      entry.img = artImg(app, 'logo', 'se-hs-logo', () => {
        entry.ok = false;
        if (apps[selected]?.appid === app.appid) paintGame();
      });
      logos.set(app.appid, entry);
    }
    return entry;
  }

  function paintGame() {
    const app = apps[selected];
    if (!stage || !app) return;
    const title = stage.querySelector('.se-hs-title');
    const logo = logoFor(app);
    title.querySelectorAll('.se-hs-logo').forEach((img) => {
      if (img !== logo.img) img.remove();
    });
    if (logo.ok && logo.img.parentElement !== title) title.prepend(logo.img);
    SE.mark(title, 'data-logo', logo.ok ? 'yes' : 'no');
    title.querySelector('.se-hs-name').textContent = app.display_name || '';

    const ach = achievementsOf(app.appid);
    const stat = (value, label, extra = '') => `<span class="se-hs-stat"${extra}><b>${value}</b><em>${label}</em></span>`;
    const info = infoOf(app.appid);
    const now = playersOf(app.appid);
    const recent = app.minutes_playtime_last_two_weeks || 0;
    const parts = [
      stat(
        `${SE.esc(hours(app.minutes_playtime_forever))}<small> h</small>`,
        recent ? `played · ${SE.esc(hours(recent))} h in 2 weeks` : 'played'
      ),
    ];
    if (ach) {
      const pct = Math.round((ach.got / ach.total) * 100);
      parts.push(
        `<span class="se-hs-stat" data-ach${pct === 100 ? ' data-perfect' : ''}><b>${ach.got}<small> / ${ach.total}</small></b>` +
          `<em>achievements<span class="se-hs-achbar" aria-hidden="true"><span style="width:${pct}%"></span></span></em></span>`
      );
    }
    const meta = stage.querySelector('.se-hs-meta');
    const html = parts.join('');
    if (meta.innerHTML !== html) meta.innerHTML = html;

    const chips = [];
    if (info?.pct != null) {
      const tone = info.pct >= 70 ? 'good' : info.pct >= 40 ? 'mixed' : 'bad';
      chips.push(`<span class="se-hs-chip" data-reviews="${tone}">${info.pct}% · ${SE.esc(info.score || 'positive')}</span>`);
    }
    if (now != null && now > 0) {
      chips.push(`<span class="se-hs-chip" data-live><i></i>${SE.esc(compact(now))} playing now</span>`);
    }
    const chipBox = stage.querySelector('.se-hs-chips');
    const chipHtml = chips.join('');
    if (chipBox.innerHTML !== chipHtml) chipBox.innerHTML = chipHtml;

    const desc = stage.querySelector('.se-hs-desc');
    const text = info?.text || '';
    if (desc.textContent !== text) desc.textContent = text;
    desc.hidden = !text;

    const by = stage.querySelector('.se-hs-by');
    const byText = [info?.dev, info?.year || ''].filter(Boolean).join(' · ');
    if (by.textContent !== byText) by.textContent = byText;
    by.hidden = !byText;

    const play = stage.querySelector('.se-hs-play');
    const installed = isInstalled(app);
    const playHtml = installed ? `${ICON_PLAY}<span>Play</span>` : `${ICON_INSTALL}<span>Install</span>`;
    if (play.innerHTML !== playHtml) play.innerHTML = playHtml;
    SE.mark(play, 'data-kind', installed ? 'play' : 'install');
  }

  function select(i) {
    if (!stage || !apps.length) return;
    selected = Math.max(0, Math.min(apps.length - 1, i || 0));
    stage.querySelectorAll('.se-hs-layer').forEach((l, n) => l.toggleAttribute('data-on', n === selected));
    stage.querySelectorAll('.se-hs-thumb').forEach((t, n) => {
      const on = n === selected;
      t.toggleAttribute('data-on', on);
      t.setAttribute('aria-pressed', on ? 'true' : 'false');
      t.querySelector('.se-hs-prog')?.remove();
      if (on && cycleSeconds() > 0 && !reducedMotion.matches && apps.length > 1) {
        const bar = document.createElement('span');
        bar.className = 'se-hs-prog';
        t.querySelector('.se-hs-pic').appendChild(bar);
      }
    });
    paintGame();
  }

  // Cards the strip shows (set by home-stage.css container queries), capped to the games.
  function stripCount() {
    const strip = stage?.querySelector('.se-hs-strip');
    const cols = strip ? parseInt(getComputedStyle(strip).getPropertyValue('--se-hs-cols'), 10) : NaN;
    return Math.min(apps.length, cols > 0 ? cols : apps.length);
  }

  // Keep the shown game on a visible card after the strip narrows.
  function fitStrip() {
    if (apps.length && selected >= stripCount()) select(0);
  }

  function restartCycle() {
    clearInterval(cycleTimer);
    cycleTimer = 0;
    const seconds = cycleSeconds();
    if (!seconds || reducedMotion.matches) return;
    stage?.style.setProperty('--se-hs-cycle', `${seconds}s`);
    cycleTimer = setInterval(() => {
      if (hovering || document.visibilityState !== 'visible' || !stage?.isConnected) return;
      const shown = stripCount();
      if (shown < 2 || !SE.visible(stage)) return;
      select((selected + 1) % shown);
    }, seconds * 1000);
  }

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

  function eventTitle(card) {
    const ev = SE.fromProps(card, 14, (p) => (isEvent(p.event) ? p.event : null));
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
    const ev = SE.fromProps(card, 14, (p) => (isEvent(p.event) ? p.event : null));
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
    const ev = SE.fromProps(card, 14, (p) => (isEvent(p.event) ? p.event : null));
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
    const event = SE.fromProps(card, 14, (p) => (isEvent(p.event) ? p.event : null));
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
  let newsHeads = null;
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
    const store = host()?.partnerEventStore;
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
    const store = host()?.partnerEventStore;
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
    newsHeads?.querySelectorAll('.se-hs-hline').forEach((b) => {
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
    if (!newsHeads || newsWeekDone || newsHeads.scrollTop + newsHeads.clientHeight < newsHeads.scrollHeight - 140) {
      return;
    }
    const area = newsCarousel?.querySelector('[role="list"]') || newsCarousel;
    if (!area?.isConnected) return;
    area.scrollLeft = area.scrollWidth;
    area.dispatchEvent(new Event('scroll'));
  }

  function fitHeads() {
    if (!newsHeads) return;
    newsHeads.querySelectorAll('.se-hs-hline[hidden]').forEach((b) => {
      b.hidden = false;
    });
    SE.mark(newsHeads, 'data-more', newsHeads.scrollHeight > newsHeads.clientHeight + 2 ? 'yes' : 'no');
  }

  function ensureNewsElements(row, ownHeading) {
    if (!newsBox) {
      newsBox = document.createElement('div');
      newsBox.className = 'se-hs-news';
      newsBox.innerHTML = '<button type="button" class="se-hs-feat"></button><div class="se-hs-heads" role="list"></div>';
      newsFeat = newsBox.firstChild;
      newsHeads = newsBox.lastChild;
      newsBox.addEventListener('click', (e) => {
        if (e.target.closest('.se-hs-hall')) {
          openHub();
          return;
        }
        const b = e.target.closest('[data-i]');
        if (b) openCard(Number(b.dataset.i));
      });
      newsHeads.addEventListener('pointerover', (e) => {
        const b = e.target.closest('.se-hs-hline');
        if (!b) return;
        feature(Number(b.dataset.i));
      });
      newsHeads.addEventListener(
        'scroll',
        () => {
          onHeadsScroll();
          SE.mark(
            newsHeads,
            'data-end',
            newsHeads.scrollTop + newsHeads.clientHeight >= newsHeads.scrollHeight - 2 ? 'yes' : 'no'
          );
        },
        { passive: true }
      );
      newsHeads.addEventListener('focusin', (e) => {
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
      if (newsHeads.dataset.types !== (types || []).join()) {
        newsHeads.dataset.types = (types || []).join();
        newsHeads.scrollTop = 0;
        featured = 0;
      }
      let lastDay = null;
      newsHeads.innerHTML =
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
    newsHeads.querySelector('[data-foot]').hidden = ownHeading;
    fitHeads();
  }

  function wideURLs(app) {
    const s = host()?.appStore;
    const list = [];
    const add = (v) => {
      if (Array.isArray(v)) list.push(...v.filter(Boolean));
      else if (typeof v === 'string' && v) list.push(v);
    };
    if (s) {
      if (app.rt_custom_image_mtime) {
        add(run(() => s.GetCustomLandcapeImageURLs(app)));
        add(run(() => s.GetCustomLandscapeImageURLs(app)));
      }
      add(run(() => s.GetCachedLandscapeImageURL(app)));
      add(run(() => s.GetLandscapeImageURLForApp(app)));
    }
    list.push(
      `/assets/${app.appid}/header.jpg`,
      `${CDN(app.appid)}/header.jpg`,
      `/assets/${app.appid}/library_hero.jpg`
    );
    return [...new Set(list)];
  }

  const imgTag = (urls, cls) =>
    `<img class="${cls}" alt="" draggable="false" loading="lazy" ${ART_WAIT} src="${SE.esc(urls[0])}" data-urls="${SE.esc(JSON.stringify(urls.slice(1)))}">`;

  /* load doesn't bubble: caught on the way down, beside onImgError */
  function onImgLoad(e) {
    if (e.target instanceof HTMLImageElement) e.target.removeAttribute(ART_WAIT);
  }

  function onImgError(e) {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.urls) return;
    const rest = JSON.parse(img.dataset.urls);
    if (rest.length) {
      img.dataset.urls = JSON.stringify(rest.slice(1));
      img.src = rest[0];
    } else {
      delete img.dataset.urls;
      img.hidden = true;
    }
  }

  const collectionStore = () => host()?.collectionStore;
  const collectionApps = (id) => {
    const c = run(() => collectionStore().GetCollection(id));
    return c ? run(() => [...c.visibleApps]) || [] : null;
  };
  const hoursText = (app) =>
    app.minutes_playtime_forever ? `${hours(app.minutes_playtime_forever)} h` : 'Not played';

  function readPick(key) {
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      return Array.isArray(v) ? v.map(String) : null;
    } catch (_) {
      return null;
    }
  }

  function writePick(key, ids) {
    try {
      if (ids) localStorage.setItem(key, JSON.stringify(ids));
      else localStorage.removeItem(key);
    } catch (_) {}
  }

  function appById(id) {
    const s = host()?.appStore;
    return (
      run(() => s.GetAppOverviewByAppID(Number(id))) ||
      run(() => s.allApps.find((a) => String(a.appid) === String(id))) ||
      null
    );
  }

  const libraryGames = () =>
    run(() =>
      host().appStore.allApps.filter(
        (a) => a && (a.app_type === 1 || a.app_type === 1073741824) && a.visible_in_game_list !== false
      )
    ) || [];

  let pickEl = null;
  let pickOpts = null;
  let pickAnchor = null;

  function closePick() {
    if (!pickEl) return;
    pickEl.remove();
    pickEl = null;
    pickOpts = null;
    document.removeEventListener('pointerdown', onPickOutside, true);
    document.removeEventListener('keydown', onPickKey, true);
    pickAnchor?.setAttribute('aria-expanded', 'false');
    pickAnchor = null;
  }

  function onPickOutside(e) {
    if (pickEl && !pickEl.contains(e.target) && !pickAnchor?.contains(e.target)) {
      closePick();
    }
  }

  function placePick() {
    if (!pickEl || !pickAnchor?.isConnected) {
      closePick();
      return;
    }
    const r = pickAnchor.getBoundingClientRect();
    const w = pickEl.offsetWidth;
    const h = pickEl.offsetHeight;
    const left = Math.max(12, Math.min(r.right - w, innerWidth - w - 12));
    const top = r.bottom + 8 + h <= innerHeight - 12 ? r.bottom + 8 : Math.max(12, r.top - 8 - h);
    pickEl.style.left = `${left}px`;
    pickEl.style.top = `${top}px`;
  }

  const pickedNow = () => readPick(pickOpts.key) || pickOpts.defaults();

  function paintPick() {
    if (!pickEl) return;
    const q = (pickEl.querySelector('.se-hs-pk-search')?.value || '').trim().toLowerCase();
    const chosen = new Set(pickedNow());
    const groups = pickOpts.items(q);
    pickEl.querySelector('.se-hs-pk-list').innerHTML =
      groups
        .map(
          (g) =>
            (g.label && g.rows.length ? `<div class="se-hs-pk-group">${SE.esc(g.label)}</div>` : '') +
            g.rows
              .map(
                (r) =>
                  '<label class="se-hs-pk-row">' +
                  `<input type="checkbox" data-id="${SE.esc(r.id)}"${chosen.has(String(r.id)) ? ' checked' : ''}>` +
                  (r.img ? `<span class="se-hs-pk-pic">${imgTag(r.img, 'se-hs-pk-img')}</span>` : '') +
                  `<span class="se-hs-pk-text"><span class="se-hs-pk-name">${SE.esc(r.name)}</span>${r.sub ? `<span class="se-hs-pk-sub">${SE.esc(r.sub)}</span>` : ''}</span>` +
                  '</label>'
              )
              .join('')
        )
        .join('') || '<span class="se-hs-empty">Nothing found</span>';
    paintPickFoot();
  }

  function paintPickFoot() {
    if (!pickEl) return;
    const picks = readPick(pickOpts.key);
    pickEl.querySelector('.se-hs-pk-count').textContent = !picks
      ? pickOpts.allText
      : picks.length
        ? `${picks.length} chosen`
        : 'None shown';
    pickEl.querySelector('[data-pk-all]').disabled = !picks;
    pickEl.querySelector('[data-pk-none]').disabled = Boolean(picks && !picks.length);
  }

  function onPickKey(e) {
    if (e.key === 'Escape' && pickEl) {
      e.stopPropagation();
      const a = pickAnchor;
      closePick();
      a?.focus();
    }
  }

  function openPick(anchor, opts) {
    if (pickEl && pickAnchor === anchor) {
      closePick();
      return;
    }
    closePick();
    pickOpts = opts;
    pickAnchor = anchor;
    anchor.setAttribute('aria-expanded', 'true');
    pickEl = document.createElement('div');
    pickEl.className = 'se-hs-pick';
    pickEl.setAttribute('role', 'dialog');
    pickEl.setAttribute('aria-label', opts.title);
    pickEl.innerHTML =
      `<div class="se-hs-pk-head"><span class="se-hs-pk-title">${SE.esc(opts.title)}</span>` +
      '<button type="button" class="se-hs-pk-x" data-pk-close aria-label="Close">×</button></div>' +
      (opts.placeholder
        ? `<input type="search" class="se-hs-pk-search" placeholder="${SE.esc(opts.placeholder)}" aria-label="${SE.esc(opts.placeholder)}">`
        : '') +
      '<div class="se-hs-pk-list"></div>' +
      '<div class="se-hs-pk-foot"><span class="se-hs-pk-count"></span>' +
      '<button type="button" class="se-hs-hall" data-pk-all>Show all</button>' +
      '<button type="button" class="se-hs-hall" data-pk-none>Show none</button>' +
      '<button type="button" class="se-hs-pk-done" data-pk-close>Done</button></div>';

    pickEl.addEventListener('error', onImgError, true);
    pickEl.addEventListener('load', onImgLoad, true);
    pickEl.addEventListener('input', (e) => {
      if (e.target.matches('.se-hs-pk-search')) {
        paintPick();
        placePick();
      }
    });
    pickEl.addEventListener('change', (e) => {
      const box = e.target.closest('input[type="checkbox"][data-id]');
      if (!box) return;
      const ids = pickedNow().filter((id) => id !== box.dataset.id);
      if (box.checked) ids.push(box.dataset.id);
      writePick(pickOpts.key, ids);
      paintPickFoot();
      schedule();
    });
    pickEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-pk-close]')) {
        closePick();
        return;
      }
      if (e.target.closest('[data-pk-all]')) {
        writePick(pickOpts.key, null);
        paintPick();
        schedule();
      }
      if (e.target.closest('[data-pk-none]')) {
        writePick(pickOpts.key, []);
        paintPick();
        schedule();
      }
    });

    document.body.appendChild(pickEl);
    document.addEventListener('pointerdown', onPickOutside, true);
    document.addEventListener('keydown', onPickKey, true);
    paintPick();
    placePick();
    (pickEl.querySelector('.se-hs-pk-search') || pickEl.querySelector('input'))?.focus();
  }

  function favPicker(anchor) {
    openPick(anchor, {
      key: 'se-home-fav-pick',
      title: 'Games in Favorites',
      placeholder: 'Search your library',
      allText: 'Showing all favorites',
      defaults: () => (collectionApps(favCollection) || []).map((a) => String(a.appid)),
      items: (q) => {
        const favs = sorted(collectionApps(favCollection) || [], 'az');
        const ids = new Set(favs.map((a) => String(a.appid)));
        const match = (a) => !q || String(a.display_name || '').toLowerCase().includes(q);
        const row = (a) => ({
          id: String(a.appid),
          name: a.display_name,
          sub: hoursText(a),
          img: coverURLs(a, host()?.appStore),
        });
        const extra = (readPick('se-home-fav-pick') || [])
          .filter((id) => !ids.has(id))
          .map(appById)
          .filter(Boolean);
        const more =
          q.length >= 2
            ? sorted(
                libraryGames().filter((a) => !ids.has(String(a.appid)) && match(a)),
                'az'
              ).slice(0, 40)
            : [];
        const seen = new Set();
        const once = (list) => list.filter((a) => !seen.has(String(a.appid)) && seen.add(String(a.appid)));
        return [
          { label: '', rows: once(favs.filter(match)).map(row) },
          { label: 'Other games', rows: once([...extra.filter(match), ...more]).map(row) },
        ];
      },
    });
  }

  function newsPicker(anchor) {
    openPick(anchor, {
      key: 'se-home-news-types',
      title: 'News types',
      placeholder: '',
      allText: 'Showing every type',
      defaults: () => Object.keys(NEWS_TYPES),
      items: () => [
        {
          label: '',
          rows: Object.entries(NEWS_TYPES).map(([id, name]) => ({
            id,
            name,
            sub: NEWS_SUBS[id] || '',
          })),
        },
      ],
    });
  }

  function collPicker(anchor) {
    openPick(anchor, {
      key: 'se-home-coll-pick',
      title: 'Collections to show',
      placeholder: 'Search collections',
      allText: 'Showing all collections',
      defaults: () => userCollections().map((c) => String(c.id)),
      items: (q) => [
        {
          label: '',
          rows: userCollections()
            .filter((c) => !q || String(c.displayName || c.id).toLowerCase().includes(q))
            .map((c) => {
              const n = run(() => c.visibleApps.length) || 0;
              return {
                id: String(c.id),
                name: c.displayName || c.strName || c.id,
                sub: `${n.toLocaleString()} ${n === 1 ? 'game' : 'games'}`,
              };
            }),
        },
      ],
    });
  }

  const sorted = (list, k) =>
    list.slice().sort(
      k === 'recent'
        ? (a, b) => (b.rt_last_time_played || 0) - (a.rt_last_time_played || 0)
        : k === 'hours'
          ? (a, b) => (b.minutes_playtime_forever || 0) - (a.minutes_playtime_forever || 0)
          : (a, b) => String(a.sort_as || a.display_name || '').localeCompare(String(b.sort_as || b.display_name || ''))
    );

  const own = new Map();
  const spare = new Map();

  function ownPanel(row, cls, build) {
    let entry = own.get(row);
    if (!entry && spare.has(cls)) {
      entry = spare.get(cls);
      spare.delete(cls);
      own.set(row, entry);
    }
    if (!entry) {
      const el = document.createElement('div');
      el.className = `se-hs-own ${cls}`;
      build(el);
      el.addEventListener('error', onImgError, true);
      el.addEventListener('load', onImgLoad, true);
      entry = { el, sig: '', cls };
      own.set(row, entry);
    }
    if (entry.el.parentElement !== row) row.appendChild(entry.el);
    SE.mark(row, 'data-se-hs-own');
    return entry;
  }

  function dropOwn(row) {
    const e = own.get(row);
    e?.el.remove();
    own.delete(row);
    SE.unmark(row, 'data-se-hs-own');
  }

  function dropAllOwn(keep) {
    for (const [row, e] of [...own]) {
      if (keep) {
        e.el.remove();
        own.delete(row);
        SE.unmark(row, 'data-se-hs-own');
        spare.set(e.cls, e);
      } else {
        dropOwn(row);
      }
    }
    if (!keep) spare.clear();
    document.querySelectorAll('[data-se-hs-own]').forEach((el) => el.removeAttribute('data-se-hs-own'));
  }

  let favCollection = 'favorite';
  let favApps = [];

  function paintFav(row, id, title) {
    const colApps = id ? collectionApps(id) : null;
    if (!colApps) {
      dropOwn(row);
      return;
    }
    favCollection = id;
    const entry = ownPanel(row, 'se-hs-fav', (el) => {
      el.innerHTML =
        '<div class="se-hs-ohead"><span class="se-hs-nh"></span><span class="se-hs-ncount"></span>' +
        `<button type="button" class="se-hs-pickbtn" data-pick aria-label="Choose games" title="Choose games" aria-haspopup="dialog" aria-expanded="false">${ICON_PICK}</button></div>` +
        '<div class="se-hs-grid"></div>';
      el.addEventListener('click', (e) => {
        const pick = e.target.closest('[data-pick]');
        if (pick) {
          favPicker(pick);
          return;
        }
        if (e.target.closest('[data-more]')) {
          navigate(`/library/collection/${encodeURIComponent(favCollection)}`);
          return;
        }
        const play = e.target.closest('[data-play]');
        const tile = e.target.closest('[data-app]');
        const app = tile && favApps.find((a) => String(a.appid) === tile.dataset.app);
        if (!app) return;
        if (play) {
          e.stopPropagation();
          run(() => client().Apps.RunGame(String(app.appid), '', -1, 100));
          return;
        }
        navigate(`/library/app/${app.appid}`);
      });
    });

    const k = 'az';
    const picks = readPick('se-home-fav-pick');
    const list = sorted(picks ? picks.map(appById).filter(Boolean) : colApps, k);
    favApps = list;
    const shown = list.slice(0, 30);
    const sig = [
      title,
      k,
      list.length,
      picks ? 'p' : '',
      ...shown.map((a) => `${a.appid}:${a.minutes_playtime_forever || 0}:${isInstalled(a) ? 1 : 0}`),
    ].join('|');

    const el = entry.el;
    const grid = el.querySelector('.se-hs-grid');
    if (entry.sig !== sig) {
      entry.sig = sig;
      el.querySelector('.se-hs-nh').textContent = title || 'Favorites';
      el.querySelector('.se-hs-ncount').textContent = `· ${list.length}`;
      grid.innerHTML =
        shown
          .map(
            (a) =>
              `<button type="button" class="se-hs-tile" data-app="${a.appid}" aria-label="${SE.esc(a.display_name)}">` +
              imgTag(wideURLs(a), 'se-hs-timg') +
              '<span class="se-hs-tshade"></span>' +
              `<span class="se-hs-tfoot"><span class="se-hs-tname">${SE.esc(a.display_name)}</span><span class="se-hs-thrs">${SE.esc(hoursText(a))}</span></span>` +
              (isInstalled(a) ? `<span class="se-hs-tplay" data-play title="Play">${ICON_PLAY}</span>` : '') +
              '<span class="se-hs-tmore"></span>' +
              '</button>'
          )
          .join('') || `<span class="se-hs-empty">${picks ? 'No games chosen' : 'No favorites yet'}</span>`;
    }

    const tiles = [...grid.querySelectorAll('.se-hs-tile')];
    const W = grid.clientWidth;
    const H = grid.clientHeight;
    const GAP = 10;
    const natural = (W - GAP * 2) / 3 / (460 / 215);
    const room = W > 0 && H > 0 ? Math.max(1, Math.floor((H + GAP) / (natural * 0.85 + GAP))) : 2;
    const rows = Math.max(1, Math.min(room, Math.ceil(tiles.length / 3)));
    const fit = room * 3;
    const rowH =
      !(W > 0 && H > 0)
        ? 'auto'
        : rows === room
          ? '1fr'
          : `${Math.floor(Math.min(natural * 1.15, (H - GAP * (rows - 1)) / rows))}px`;

    if (grid.style.getPropertyValue('--se-hs-frows') !== String(rows)) {
      grid.style.setProperty('--se-hs-frows', String(rows));
    }
    if (grid.style.getPropertyValue('--se-hs-frowh') !== rowH) {
      grid.style.setProperty('--se-hs-frowh', rowH);
    }

    const over = tiles.length > fit;
    const show = over ? fit : tiles.length;
    tiles.forEach((t, i) => {
      const hide = i >= show;
      if (t.hidden !== hide) t.hidden = hide;
      const isMore = over && i === fit - 1;
      if (t.hasAttribute('data-more') !== isMore) t.toggleAttribute('data-more', isMore);
      if (isMore) {
        const n = tiles.length - fit + 1;
        const txt = `+${n}`;
        if (t.querySelector('.se-hs-tmore').textContent !== txt) {
          t.querySelector('.se-hs-tmore').textContent = txt;
          t.setAttribute('aria-label', `${n} more favorites`);
        }
      } else if (t.querySelector('.se-hs-tmore').textContent) {
        t.querySelector('.se-hs-tmore').textContent = '';
        t.setAttribute('aria-label', favApps.find((a) => String(a.appid) === t.dataset.app)?.display_name || '');
      }
    });
  }

  function userCollections() {
    const list = run(() => [...collectionStore().userCollections]) || [];
    return list
      .filter((c) => c && c.id !== 'uncategorized' && (c.bIsEditable || (run(() => c.visibleApps.length) || 0)))
      .sort((a, b) => String(a.displayName || a.id).localeCompare(String(b.displayName || b.id)));
  }

  function paintColl(row) {
    let list = collectionStore() ? userCollections() : null;
    if (!list) {
      dropOwn(row);
      return;
    }
    const entry = ownPanel(row, 'se-hs-coll', (el) => {
      el.innerHTML =
        '<div class="se-hs-ohead"><span class="se-hs-nh">Collections</span><span class="se-hs-ncount"></span>' +
        `<button type="button" class="se-hs-pickbtn" data-pick aria-label="Choose collections" title="Choose collections" aria-haspopup="dialog" aria-expanded="false">${ICON_PICK}</button>` +
        '<button type="button" class="se-hs-hall" data-all>View all</button></div><div class="se-hs-clist-box"><div class="se-hs-cgrid" role="list"></div></div>';
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-all]')) {
          navigate('/library/collections');
          return;
        }
        const pick = e.target.closest('[data-pick]');
        if (pick) {
          collPicker(pick);
          return;
        }
        if (e.target.closest('[data-cmore]')) {
          navigate('/library/collections');
          return;
        }
        const r = e.target.closest('[data-coll]');
        if (r) navigate(`/library/collection/${encodeURIComponent(r.dataset.coll)}`);
      });
    });

    const picks = readPick('se-home-coll-pick');
    const total = list.length;
    if (picks) {
      const want = new Set(picks);
      list = list.filter((c) => want.has(String(c.id)));
    }
    const rows = list.map((c) => {
      const colApps = (run(() => [...c.visibleApps]) || [])
        .slice()
        .sort((a, b) => (b.rt_last_time_played || 0) - (a.rt_last_time_played || 0));
      return {
        id: c.id,
        name: c.displayName || c.strName || c.id,
        count: colApps.length,
        covers: colApps.slice(0, 3),
      };
    });

    const sig =
      (picks ? `${total}|` : '') +
      rows.map((r) => `${r.id}:${r.name}:${r.count}:${r.covers.map((a) => a.appid).join('.')}`).join('|');
    const grid = entry.el.querySelector('.se-hs-cgrid');

    if (entry.sig !== sig) {
      entry.sig = sig;
      entry.el.querySelector('.se-hs-ncount').textContent = picks ? `· ${rows.length} of ${total}` : `· ${rows.length}`;
      const store = host()?.appStore;
      grid.innerHTML =
        rows
          .map((r) => {
            const [a, b, c] = r.covers;
            const cover = (app, cls) =>
              app ? `<span class="se-hs-fcov ${cls}">${imgTag(coverURLs(app, store), 'se-hs-fimg2')}</span>` : '';
            return (
              `<button type="button" class="se-hs-ccard" role="listitem" data-coll="${SE.esc(r.id)}" aria-label="${SE.esc(r.name)}">` +
              `<span class="se-hs-ctext"><span class="se-hs-cname">${SE.esc(r.name)}</span>` +
              `<span class="se-hs-csub">${r.count.toLocaleString()} ${r.count === 1 ? 'game' : 'games'}</span></span>` +
              `<span class="se-hs-cfan">${cover(b, 'l')}${cover(c, 'r')}${cover(a, 'm')}</span></button>`
            );
          })
          .join('') +
        '<button type="button" class="se-hs-ccard" data-cmore hidden><span class="se-hs-cmore"></span></button>' +
        (rows.length ? '' : `<span class="se-hs-empty">${picks ? 'No collections chosen' : 'No collections yet'}</span>`);
    }

    const tiles = [...grid.querySelectorAll('[data-coll]')];
    const moreTile = grid.querySelector('[data-cmore]');
    const W = grid.clientWidth;
    const H = grid.clientHeight;
    const GAP = 10;
    const cols = W >= 600 ? 3 : W < 300 ? 1 : 2;
    let fit = tiles.length;
    let cardH = 104;

    if (W > 0 && H > 0) {
      const least = cols === 1 ? 64 : 84;
      const room = Math.max(1, Math.floor((H + GAP) / (least + GAP)));
      const rowCount = Math.max(1, Math.min(room, Math.ceil((tiles.length || 1) / cols)));
      const share = (H - GAP * (rowCount - 1)) / rowCount;
      cardH = rowCount === room ? Math.floor(share * 100) / 100 : Math.floor(Math.min(124, share));
      fit = cols * room;
    }

    if (grid.style.getPropertyValue('--se-hs-ccols') !== String(cols)) {
      grid.style.setProperty('--se-hs-ccols', String(cols));
    }
    if (grid.style.getPropertyValue('--se-hs-ch') !== `${cardH}px`) {
      grid.style.setProperty('--se-hs-ch', `${cardH}px`);
    }

    const over = tiles.length > fit && fit > 1;
    const show = over ? fit - 1 : Math.min(tiles.length, fit);
    tiles.forEach((t, i) => {
      const hide = i >= show;
      if (t.hidden !== hide) t.hidden = hide;
    });
    if (moreTile) {
      if (moreTile.hidden !== !over) moreTile.hidden = !over;
      const txt = `+${tiles.length - show}`;
      const tm = moreTile.querySelector('.se-hs-cmore');
      if (over && tm.textContent !== txt) {
        tm.textContent = txt;
        moreTile.setAttribute('aria-label', `${tiles.length - show} more collections`);
      }
    }
  }

  function idIn(p) {
    for (const k of ['strCollectionId', 'collectionId', 'strCollectionID', 'collectionid']) {
      if (typeof p[k] === 'string') return p[k];
    }
    for (const k of ['collection', 'showcase']) {
      const v = p[k];
      if (v && typeof v === 'object') {
        for (const kk of ['strCollectionId', 'm_strId', 'id']) {
          if (typeof v[kk] === 'string') return v[kk];
        }
      }
    }
    return null;
  }

  const shelfIds = new WeakMap();

  function shelfId(shelf) {
    if (shelfIds.has(shelf)) return shelfIds.get(shelf);
    let id = SE.fromProps(shelf, 8, idIn);
    if (!id) {
      const down = findDown(shelf, (p) => Boolean(idIn(p)));
      id = down ? idIn(down) : null;
    }
    if (id) shelfIds.set(shelf, id);
    return id;
  }

  function isFavorites(shelf) {
    const id = shelfId(shelf);
    if (id) return id === 'favorite';
    return /favo/i.test(shelf.querySelector(SHELF_HEADER)?.textContent || '');
  }

  function kindOf(el) {
    if (el.matches(NEWS) || el.querySelector(NEWS)) return 'news';
    if (el.matches(ADD_SHELF) || (el.querySelector(ADD_SHELF) && !el.querySelector(SHELF))) return 'add';
    if (el.querySelector(PLAY_NEXT)) return 'playnext';
    if (el.matches(RECENT) || el.querySelector(RECENT)) return 'recent';
    const shelf = el.matches(SHELF) ? el : el.querySelector(SHELF);
    if (!shelf) return 'other';
    if (shelf.querySelector(COLLECTION_TILE)) return 'coll';
    const name = shelf.querySelector(SHELF_HEADER)?.textContent || '';
    if (/collection/i.test(name) && !shelf.querySelector(COVER)) return 'coll';
    return isFavorites(shelf) ? 'fav' : 'shelf';
  }

  function scrollerOf(el) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowY) && p.clientHeight > 0) return p;
    }
    return document.scrollingElement || document.documentElement;
  }

  function mark(el, name, value = '') {
    SE.mark(el, name, value);
    marked.add(el);
  }

  function clearMarks(keep) {
    for (const el of marked) {
      if (keep?.has(el)) continue;
      for (const a of [
        'data-se-hs',
        'data-se-hs-lock',
        'data-se-hs-narrow',
        'data-se-hs-n',
        'data-se-hs-flat',
        'data-se-hs-sec',
        'data-se-hs-col',
        'data-se-hs-last',
      ]) {
        SE.unmark(el, a);
      }
      marked.delete(el);
    }
  }

  let appliedVh = 0;
  let pendingVh = 0;
  let pendingAt = 0;
  let settleTimer = 0;
  const SETTLE_MS = 180;
  const HEADROOM = 8;
  let locked = [];

  function lockScroll() {
    const want = [];
    for (let p = scope.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      if (p.hasAttribute('data-se-hs-scroll-lock') || /(auto|scroll|overlay)/.test(getComputedStyle(p).overflowY)) {
        want.push(p);
      }
    }
    want.push(document.body, document.documentElement);
    for (const el of locked) {
      if (!want.includes(el)) SE.unmark(el, 'data-se-hs-scroll-lock');
    }
    for (const el of want) {
      if (!el.hasAttribute('data-se-hs-scroll-lock')) {
        if (el.scrollTop) el.scrollTop = 0;
        SE.mark(el, 'data-se-hs-scroll-lock');
      }
    }
    locked = want;
  }

  function unlockScroller() {
    for (const el of locked) SE.unmark(el, 'data-se-hs-scroll-lock');
    locked = [];
  }

  function teardown(leaving) {
    closePick();
    unlockScroller();
    clearMarks();
    dropAllOwn(leaving);
    document.querySelectorAll('[data-se-hs-carousel]').forEach((el) => el.removeAttribute('data-se-hs-carousel'));
    newsBox?.remove();
    newsHead?.remove();
    newsFilt?.remove();
    newsCardsNow = [];
    if (!leaving) {
      newsSig = '';
      newsItems = [];
      featured = 0;
      appsSig = '';
    }
    stage?.remove();
    tray?.remove();
    clearInterval(cycleTimer);
    cycleTimer = 0;
    cycleDue = true;
    hovering = false;
    scope = null;
    scroller = null;
    appliedVh = 0;
    pendingVh = 0;
    clearTimeout(settleTimer);
  }

  function setOn(on) {
    if (on) SE.mark(document.documentElement, 'data-se-hs-on');
    else SE.unmark(document.documentElement, 'data-se-hs-on');
  }

  const usable = () =>
    document.visibilityState !== 'hidden' &&
    innerWidth >= 480 &&
    innerHeight >= 360 &&
    (!scroller || scroller === document.scrollingElement || scroller.clientHeight >= 300);

  let isNarrow = false;

  function collectHomeRows(lib) {
    const shelves = [...lib.querySelectorAll(SHELF)];
    let list = lib;
    if (shelves.length) {
      list = shelves[0].parentElement;
      while (list && list !== lib && !shelves.every((s) => list.contains(s))) {
        list = list.parentElement;
      }
      if (!list || !lib.contains(list)) list = lib;
    }
    const flat = new Set();
    for (let el = list; el && el !== scope; el = el.parentElement) flat.add(el);
    const news = scope.querySelector(NEWS);
    if (news) {
      for (let el = news.parentElement; el && el !== scope; el = el.parentElement) flat.add(el);
    }

    const rows = [];
    for (const parent of [scope, ...flat]) {
      for (const child of parent.children) {
        if (flat.has(child) || child === stage || child === tray) continue;
        rows.push(child);
      }
    }
    return { flat, rows };
  }

  function applyStageDimensions(trayRows, kinds) {
    const view = scroller?.clientHeight || innerHeight;
    const top =
      scope.getBoundingClientRect().top -
      (scroller?.getBoundingClientRect?.().top || 0) +
      (scroller?.scrollTop || 0);
    const measured = Math.max(420, Math.round(view - Math.max(0, top)) - HEADROOM);
    const now = performance.now();

    if (!appliedVh || measured === appliedVh) {
      appliedVh = measured;
      pendingVh = 0;
    } else if (measured !== pendingVh) {
      pendingVh = measured;
      pendingAt = now;
      clearTimeout(settleTimer);
      settleTimer = setTimeout(schedule, SETTLE_MS + 20);
    } else if (now - pendingAt >= SETTLE_MS) {
      appliedVh = measured;
      pendingVh = 0;
    }

    const vh = appliedVh;
    const want = Math.round((vh * trayShare()) / 100);
    const ownHeight = (r) => {
      const cs = getComputedStyle(r);
      const panel = r.querySelector(':scope > .se-hs-own');
      const parts = panel ? [...panel.children] : [...r.children];
      const least = (c) =>
        c.classList.contains('se-hs-clist-box')
          ? 150
          : c.classList.contains('se-hs-grid')
            ? Math.round(2 * ((c.clientWidth - 20) / 3 / (460 / 215)) + 10)
            : c.offsetHeight;
      const inner = parts.reduce((h, c) => h + least(c), 0) + (panel ? 8 : 14);
      return inner + (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
    };

    const content = trayRows.length
      ? Math.max(...trayRows.filter((r) => kinds.get(r) !== 'news').map(ownHeight), 0)
      : 0;
    const trayBox = trayRows.length && !isNarrow ? Math.min(Math.max(want, content, 220), vh - 340 - 22) : 0;
    const px = trayBox ? `${trayBox}px` : '';
    if (tray.style.height !== px) tray.style.height = px;
    const trayH = trayBox ? trayBox + 22 : 0;

    const set = (k, v) => {
      if (stage.style.getPropertyValue(k) !== v) stage.style.setProperty(k, v);
    };
    set('--se-hs-vh', `${vh}px`);
    set('--se-hs-h', `${Math.max(340, isNarrow ? Math.round(vh * 0.7) : vh - trayH)}px`);

    const lock = !isNarrow && trayRows.length > 0 && vh - trayH >= 340;
    if (lock) {
      mark(scope, 'data-se-hs-lock');
      lockScroll();
    } else {
      SE.unmark(scope, 'data-se-hs-lock');
      unlockScroller();
    }
  }

  function layout() {
    if (scope && !usable()) return;
    const lib = document.querySelector('.LibraryHome');
    const home = lib?.parentElement;
    if (!home) {
      if (scope) teardown(true);
      return;
    }
    if (!enabled()) {
      if (scope) teardown();
      setOn(false);
      return;
    }
    apps = recentApps();
    if (!apps.length) {
      if (scope) teardown();
      setOn(false);
      return;
    }
    if (scope !== home) {
      if (scope) teardown(true);
      scope = home;
      scroller = scrollerOf(home);
    }
    if (!stage) stage = buildStage();
    if (!tray) {
      tray = document.createElement('div');
      tray.className = 'se-hs-tray';
      tray.setAttribute('aria-hidden', 'true');
    }
    if (stage.parentElement !== scope) scope.prepend(stage);
    if (tray.parentElement !== scope) scope.appendChild(tray);

    const { flat, rows } = collectHomeRows(lib);
    clearMarks(new Set([scope, ...flat, ...rows]));
    mark(scope, 'data-se-hs');
    for (const el of flat) mark(el, 'data-se-hs-flat');

    const kinds = new Map(rows.map((r) => [r, kindOf(r)]));
    const firstOf = (k) => rows.find((r) => kinds.get(r) === k);
    if (!firstOf('fav')) {
      const s = firstOf('shelf');
      if (s) kinds.set(s, 'fav');
    }
    const trayRows = ['news', 'fav', 'coll'].map(firstOf).filter(Boolean);
    for (const r of rows) {
      let k = kinds.get(r);
      if ((k === 'news' || k === 'fav' || k === 'coll') && !trayRows.includes(r)) {
        k = k === 'news' ? 'other' : 'shelf';
      }
      mark(r, 'data-se-hs-sec', k);
      const col = trayRows.indexOf(r);
      if (col >= 0) mark(r, 'data-se-hs-col', String(col + 1));
      else SE.unmark(r, 'data-se-hs-col');
      if (col >= 0 && col === trayRows.length - 1) mark(r, 'data-se-hs-last');
      else SE.unmark(r, 'data-se-hs-last');
    }

    mark(scope, 'data-se-hs-n', String(trayRows.length));
    isNarrow = narrow.matches;
    if (isNarrow) mark(scope, 'data-se-hs-narrow');
    else SE.unmark(scope, 'data-se-hs-narrow');
    tray.hidden = !trayRows.length;

    paintNews(trayRows.find((r) => kinds.get(r) === 'news') || null);
    for (const row of [...own.keys()]) {
      if (!trayRows.includes(row)) dropOwn(row);
    }

    const favRow = trayRows.find((r) => kinds.get(r) === 'fav');
    if (favRow) {
      const shelf = favRow.matches(SHELF) ? favRow : favRow.querySelector(SHELF);
      const id = (shelf && shelfId(shelf)) || (shelf && isFavorites(shelf) ? 'favorite' : null);
      const title =
        id === 'favorite'
          ? 'Favorites'
          : (shelf?.querySelector(SHELF_HEADER)?.textContent || '').replace(/[·•].*$/, '').trim();
      paintFav(favRow, id, title);
    }

    const collRow = trayRows.find((r) => kinds.get(r) === 'coll');
    if (collRow) paintColl(collRow);

    const sig = apps.map((a) => a.appid).join(',');
    if (sig !== appsSig) {
      const keepId = apps[selected]?.appid;
      appsSig = sig;
      buildGames();
      const again = apps.findIndex((a) => a.appid === keepId);
      select(again >= 0 && selected !== 0 ? again : 0);
      restartCycle();
    } else {
      paintGame();
    }

    if (cycleDue) {
      cycleDue = false;
      if (!cycleTimer) restartCycle();
    }
    setOn(true);
    applyStageDimensions(trayRows, kinds);
    fitStrip();
  }

  const narrow = matchMedia('(max-width: 1100px)');
  let frame = 0;
  let watcher = null;
  let sizes = null;
  let watched = new Set();

  function watchSizes() {
    if (!sizes) return;
    const want = new Set(scope ? [scroller, ...scope.querySelectorAll('[data-se-hs-col]')].filter(Boolean) : []);
    for (const el of watched) {
      if (!want.has(el)) sizes.unobserve(el);
    }
    for (const el of want) {
      if (!watched.has(el)) sizes.observe(el);
    }
    watched = want;
  }

  let laidAt = -Infinity;
  let sizeTimer = 0;

  function update() {
    if (frame) {
      cancelAnimationFrame(frame);
      frame = 0;
    }
    laidAt = performance.now();
    try {
      layout();
    } catch (e) {
      setOn(false);
      console.warn('[Steam Enhanced] home stage', e);
    }
    watcher?.takeRecords();
    watchSizes();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  // Throttle ResizeObserver callbacks during window/splitter drags to 120ms.
  function scheduleSize() {
    const wait = laidAt + 120 - performance.now();
    if (wait <= 0) {
      schedule();
      return;
    }
    if (!sizeTimer) {
      sizeTimer = setTimeout(() => {
        sizeTimer = 0;
        schedule();
      }, wait);
    }
  }

  function onResize() {
    scheduleSize();
    if (pickEl) placePick();
  }

  const NEW_ROW =
    ':scope > :not([data-se-hs-sec]):not([data-se-hs-flat]):not(.se-hs-stage):not(.se-hs-tray), ' +
    '[data-se-hs-flat] > :not([data-se-hs-sec]):not([data-se-hs-flat])';

  function onMutate() {
    const home = document.querySelector('.LibraryHome')?.parentElement;
    if (home && (home !== scope || !stage?.isConnected || home.querySelector(NEW_ROW))) {
      update();
    } else {
      schedule();
    }
  }

  function onMotion() {
    if (stage) {
      select(selected);
      restartCycle();
    }
  }

  function start() {
    watcher = SE.watch(onMutate, {
      sync: true,
      ignore: (node) => {
        const el = node.nodeType === 1 ? node : node.parentElement;
        return Boolean(el?.closest(`.se-hs-stage, .se-hs-pick, ${SE.SIDE}`));
      },
    });
    sizes = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleSize) : null;
    addEventListener('resize', onResize);
    narrow.addEventListener?.('change', schedule);
    document.addEventListener('visibilitychange', schedule);
    reducedMotion.addEventListener?.('change', onMotion);
    schedule();
  }

  window.__steamEnhancedHomeStage = {
    destroy() {
      newsOpenRequest++;
      watcher?.disconnect();
      sizes?.disconnect();
      removeEventListener('resize', onResize);
      narrow.removeEventListener?.('change', schedule);
      document.removeEventListener('visibilitychange', schedule);
      reducedMotion.removeEventListener?.('change', onMotion);
      if (frame) cancelAnimationFrame(frame);
      clearTimeout(sizeTimer);
      teardown();
      setOn(false);
      stage = null;
      tray = null;
      removeEventListener('DOMContentLoaded', start);
      delete window.__steamEnhancedHomeStage;
    },
  };

  if (document.body) {
    start();
  } else {
    addEventListener('DOMContentLoaded', start, { once: true });
  }
});
