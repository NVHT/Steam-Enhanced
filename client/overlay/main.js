/*
 * Overlay: fitting to the screen, start, `debug()` and the API (`destroy()`).
 *
 * Part of client/overlay/ (see context.js).
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedOverlayParts;
  if (!ns) return;
  const { ATTR, LOGO_ATTR, SCROLL_ATTR, SEL, TICK_MS, VIEW_ATTR, WINDOW_TICK_MS, achievementsCache, applyBackdrops, applyTrim, buildCard, caches, centerWidgets, checkNewScreenshot, contextWindows, enabled, flushSave, friendStore, friendsInGame, guidesCache, newsCache, notes, notesStore, readStats, recentCache, renderOverview, renderTabs, renderTime, replacedButtons, resolveAchievementStore, resolveGameplayApi, resolveGuidesApi, root, scheduleRender, screenshotsApi, screenshotsCache, setStat, setText, setView, shotAppId, shotUrl, syncToolbar, toolButtons, windowsDebug } = ns;
  const { live } = ns;

  /* ---------- Fit to the screen ---------- */

  const BOTTOM_GAP = 32;
  const FIT_MIN = 160;

  const updateScrollHint = wrap => {
    const more = wrap.scrollHeight - wrap.clientHeight - wrap.scrollTop > 1;
    SE.attr(wrap, SCROLL_ATTR, more ? '' : null);
  };

  // The rail and drawer take the height left under the header, and the open
  // view scrolls inside the drawer, so the column never runs off the screen.
  const fitOverview = (body, wrap) => {
    const bodyTop = body.getBoundingClientRect().top;
    const bottom = Math.max(bodyTop + FIT_MIN, innerHeight - BOTTOM_GAP);
    SE.cssVar(body, '--se-ov-body-h', `${Math.floor(bottom - bodyTop)}px`);
    const top = wrap.getBoundingClientRect().top;
    SE.cssVar(wrap, '--se-ov-avail', `${Math.max(FIT_MIN, Math.floor(bottom - top))}px`);
    updateScrollHint(wrap);
  };

  const render = () => {
    const host = document.querySelector(SEL.timeStats);
    if (!host) return;
    live.ui ||= buildCard();
    // React may replace the host; re-attach on the next tick when it does.
    if (live.ui.card.parentNode !== host) host.prepend(live.ui.card);
    if (live.ui.body.parentNode !== host) host.append(live.ui.body);

    const stats = readStats();
    const nativeLogo = document.querySelector(SEL.logo);
    const src = nativeLogo?.currentSrc || nativeLogo?.src || '';
    if (src && live.ui.logo.getAttribute('src') !== src) {
      live.ui.logo.src = src;
      applyTrim(live.ui.logo, src);
    }
    SE.attr(live.ui.logo, 'hidden', src ? null : '');
    SE.attr(live.ui.name, 'hidden', src || !stats.name ? '' : null);
    setText(live.ui.name, stats.name);
    // Only hide Steam's centred logo once ours has taken its place.
    SE.attr(root, LOGO_ATTR, src ? '' : null);

    setStat(live.ui.stats.session, stats.session);
    setStat(live.ui.stats.total, stats.total);
    setStat(live.ui.stats.recent, stats.recent);
    renderTime(live.ui.time);

    renderOverview(live.ui.overview, stats.appid);
    syncToolbar();
    const inGame = stats.appid ? friendsInGame(stats.appid).length : 0;
    const online = (SE.run(() => friendStore().allFriends) || []).filter(f => SE.run(() => f.persona.is_online)).length;
    renderTabs(live.ui.tabs, {
      achievements: live.achData?.total ? `${live.achData.unlocked} / ${live.achData.total} · ${Math.round((live.achData.unlocked / live.achData.total) * 100)}%` : '',
      friends: [inGame && `${inGame} in game`, `${online} online`].filter(Boolean).join(' · '),
    });
    fitOverview(live.ui.body, live.ui.overview.wrap);
  };

  const teardown = () => {
    live.ui?.card.remove();
    live.ui?.body.remove();
    for (const replaced of replacedButtons) replaced.release();
    live.view = 'overview';
    SE.attr(live.ui?.overview.wrap, VIEW_ATTR, null);
    SE.attr(root, LOGO_ATTR, null);
  };

  function sync() {
    const on = enabled();
    SE.attr(root, ATTR, on ? '' : null);
    if (on) SE.run(render);
    else teardown();
  }

  // The overlay window exists (hidden) from game launch, but SE.poll pauses
  // while it's hidden. Warm every cache on a slow timer meanwhile, so the
  // column is filled the moment the overlay opens. Hidden-tab timers are
  // throttled by the browser; this only needs to run now and then.
  const PREFETCH_MS = 20_000;

  const prefetch = () => {
    if (!enabled()) return;
    const appid = readStats().appid;
    if (!appid) return;
    achievementsCache.get(appid);
    recentCache.get(appid);
    screenshotsCache.get(appid);
    guidesCache.get(appid);
    newsCache.get(appid);
    SE.run(checkNewScreenshot);
  };

  // Unlocks made while playing should show as soon as the overlay opens.
  const onVisibility = () => {
    // The overlay opens on the overview each time.
    if (document.visibilityState !== 'visible') {
      flushSave();
      return setView('overview');
    }
    achievementsCache.expire();
    SE.run(checkNewScreenshot);
    sync();
  };
  document.addEventListener('visibilitychange', onVisibility);
  addEventListener('resize', scheduleRender);

  applyBackdrops();
  sync();
  const loop = SE.poll(sync, TICK_MS);
  const windowLoop = SE.poll(() => enabled() && centerWidgets(), WINDOW_TICK_MS);
  const prefetchTimer = setInterval(() => SE.run(prefetch), PREFETCH_MS);
  SE.run(prefetch);

  // Method and field names of the stores the next views would use.
  const namesOf = obj => {
    const names = new Set();
    for (let p = obj, depth = 0; p && p !== Object.prototype && depth < 4; p = Object.getPrototypeOf(p), depth++) {
      for (const name of Object.getOwnPropertyNames(p)) names.add(name);
    }
    return [...names].filter(name => name !== 'constructor').slice(0, 150);
  };
  // An object's names plus, for each array field, the fields of its first item
  // (e.g. a chat's message list).
  const shapeOf = obj => {
    if (!obj) return null;
    const arrays = {};
    for (const name of namesOf(obj)) {
      const value = SE.run(() => obj[name]);
      const first = Array.isArray(value) ? value[0] : null;
      if (first && typeof first === 'object') arrays[name] = namesOf(first).slice(0, 40);
    }
    return { names: namesOf(obj), arrays };
  };

  // Identifiers mentioning notes in Steam's code: method and store names survive minifying.
  const noteNames = () => {
    const found = new Set();
    for (const req of SE.requires()) {
      for (const id of Object.keys(req.m || {})) {
        const src = SE.run(() => Function.prototype.toString.call(req.m[id])) || '';
        if (!/Notes?/.test(src)) continue;
        for (const [name] of src.matchAll(/\b[A-Za-z_]*Notes?[A-Za-z_]*\b/g)) {
          if (name.length > 5 && found.size < 120) found.add(name);
        }
      }
    }
    return [...found];
  };

  const discover = () => {
    const win = contextWindows()[0];
    return {
      remotePlay: shapeOf(SE.run(() => win.RemotePlayStore_SteamUI)),
      controllerConfigurator: namesOf(SE.run(() => win.controllerConfiguratorStore)),
      controller: namesOf(SE.run(() => win.ControllerStore)),
      notes: noteNames(),
    };
  };

  // `__seOverlay.debug()` in the SP Overlay DevTools: what each section has
  // and why a hidden one is empty.
  const debug = () => {
    const appid = readStats().appid;
    const report = {
      appid,
      achievements: resolveAchievementStore() ? 'AchievementStore' : achievementsCache.inspect(appid),
      friendsInGame: appid ? friendsInGame(appid).length : 0,
      recentPlayers: { ...recentCache.inspect(appid), missingParts: resolveGameplayApi.missing() },
      screenshots: {
        ...screenshotsCache.inspect(appid),
        methods: Object.keys(screenshotsApi() || {}),
        sampleFields: live.shotSample ? Object.keys(live.shotSample) : null,
        sampleAppId: live.shotSample ? shotAppId(live.shotSample) : null,
        sampleUrl: live.shotSample ? shotUrl(live.shotSample) : null,
      },
      guides: {
        ...guidesCache.inspect(appid),
        serviceError: live.guidesServiceError,
        serviceResults: live.guidesRaw,
        missingParts: resolveGuidesApi.missing(),
      },
      news: newsCache.inspect(appid),
      // For the Remote Play, Notes and Controller views.
      toolbar: [...document.querySelectorAll(SEL.toolbarButton)].map(b => [...b.classList].filter(c => /^[A-Z]/.test(c) && c !== 'ToolbarButton' && c !== 'DialogButton')),
      toolButtons: Object.fromEntries(Object.entries(toolButtons).map(([id, t]) => [id, !!t.current()])),
      discovery: discover(),
      notes: { store: !!notesStore(), state: { ...notes, list: notes.list?.length ?? null } },
      controllerSample: live.controllerSample && namesOf(live.controllerSample),
      windows: windowsDebug(),
    };
    console.log('[Steam Enhanced overlay]', report);
    return report;
  };

  window.__seOverlay = {
    debug,
    destroy() {
      loop.disconnect();
      windowLoop.disconnect();
      clearInterval(prefetchTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      removeEventListener('resize', scheduleRender);
      teardown();
      applyBackdrops(true);
      for (const cache of caches) cache.clear();
      live.ui = null;
      live.instance = null;
      SE.attr(root, ATTR, null);
    },
  };

  Object.assign(ns, { namesOf, sync, updateScrollHint });
});
