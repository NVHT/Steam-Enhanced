/*
 * Demand-paged News Hub feed for Library Home What's New carousel.
 */
((SE) => {
  const { C } = SE;
  window.__seNewsHub?.destroy?.();

  const WINDOW_SECONDS = 7 * 24 * 60 * 60;
  const CARD_BATCH = 24;
  const ACTIVE_MS = 800;
  const EVENT_TYPES = '9,10,11,12,13,14,15,16,20,21,22,23,24,25,26,27,28,29,31,32,34,35';
  const CAROUSEL_SELECTOR = `.${C.EventRowCarousel}, [class*="EventRowCarousel"]`;
  const CONTAINER_SELECTOR = `.${C.UpdatesContainer}`;

  const state = (window.__seNewsHub = {
    events: new Map(),
    documents: new Map(),
    feeds: [],
    busy: false,
    loaded: false,
    stopped: false,
    requests: 0,
    activeUntil: 0,
  });

  const savedCaps = new Map();
  const originals = {};
  const wrappers = {};
  const emptySince = new WeakMap();
  const skippedGids = new Set();

  let emptyTimer;
  let lastFullScanAt = -Infinity;
  let owner;
  let eventStore;
  let partnerStore;
  let initPoll;
  let refreshTimer;
  let observer;
  let nativeHost;
  let nativeComponent;

  const nowSeconds = () => Math.floor(Date.now() / 1000);

  const ownedLibraryAppIds = () =>
    new Set(
      (owner?.appStore?.allApps || [])
        .filter(app => app.appid > 0 && app.BIsOwned?.() && !app.BIsBorrowed?.())
        .map(app => app.appid)
    );

  const isWithinWindow = (entry) => {
    const current = nowSeconds();
    return entry.time >= current - WINDOW_SECONDS && entry.time <= current;
  };

  const visibleModels = () =>
    [...state.events.values()]
      .filter(entry => isWithinWindow(entry) && !skippedGids.has(String(entry.model.GID)))
      .sort((a, b) => b.time - a.time)
      .map(entry => entry.model);

  const pendingDocuments = () =>
    [...state.documents.entries()]
      .filter(([id, doc]) => !state.events.has(id) && isWithinWindow(doc))
      .sort((a, b) => b[1].time - a[1].time);

  const isFeedExhausted = () => state.feeds.every(feed => feed.done) && !pendingDocuments().length;
  const isUserActive = () => Date.now() < state.activeUntil;

  const homeScope = () => document.querySelector('.LibraryHome')?.parentElement;
  const findCarousel = () => homeScope()?.querySelector(CAROUSEL_SELECTOR);
  const findScrollArea = () => findCarousel()?.querySelector('[role="list"]');

  function isScrolledNearEnd() {
    const area = findScrollArea();
    return (
      !!area &&
      area.clientWidth > 0 &&
      area.scrollWidth - area.clientWidth - Math.abs(area.scrollLeft) <= area.clientWidth * 1.5
    );
  }

  // A new array makes Steam's observers re-render What's New (and re-ask our wrappers).
  function notifyEventStore() {
    const list = eventStore?.m_vecHomeBestEventsForUser;
    if (Array.isArray(list)) eventStore.m_vecHomeBestEventsForUser = [...list];
  }

  function patchNativeCap() {
    if (state.stopped) return;
    const scope = homeScope();
    if (!scope) return;
    if (
      nativeHost &&
      scope.contains(nativeHost) &&
      nativeComponent?.k_MaxSmallCapsToShow === Infinity
    ) {
      return;
    }

    const preferred = [
      ...scope.querySelectorAll(`${CONTAINER_SELECTOR}, ${CAROUSEL_SELECTOR}, [class*="UpdatesContainer"]`),
    ];
    const visited = new Set();
    if (uncapComponentInNodes(preferred, visited)) return;

    // Last resort, every fiber above every node of Home: at most every 10 s.
    const now = performance.now();
    if (now - lastFullScanAt < 10000) return;
    lastFullScanAt = now;
    uncapComponentInNodes(scope.querySelectorAll('*'), visited);
  }

  function uncapComponentInNodes(candidates, visited) {
    for (const element of candidates) {
      for (let fiber = SE.fiber(element), depth = 0; fiber && depth < 80; fiber = fiber.return, depth++) {
        if (visited.has(fiber)) break;
        visited.add(fiber);
        const instance = fiber.stateNode;
        if (!instance || !Object.prototype.hasOwnProperty.call(instance, 'k_MaxSmallCapsToShow')) {
          continue;
        }
        nativeHost = element;
        nativeComponent = instance;
        if (!savedCaps.has(instance)) {
          savedCaps.set(instance, instance.k_MaxSmallCapsToShow);
          instance.k_MaxSmallCapsToShow = Infinity;
          instance.forceUpdate?.();
        }
        return true;
      }
    }
    return false;
  }

  function pruneEmptyCards() {
    if (state.stopped) return;
    clearTimeout(emptyTimer);
    const root = findCarousel();
    if (!root) return;

    let waitingForAsyncImage = false;
    let removedAny = false;

    const emptyCapsules = root.querySelectorAll(
      `.${C.PartnerEventRowCapsule}:empty, .PartnerEventRowCapsule:empty`
    );
    for (const element of emptyCapsules) {
      const firstSeen = emptySince.get(element) ?? Date.now();
      emptySince.set(element, firstSeen);
      if (Date.now() - firstSeen < 3000) {
        waitingForAsyncImage = true;
        continue;
      }
      for (let fiber = SE.fiber(element), depth = 0; fiber && depth < 30; fiber = fiber.return, depth++) {
        const event = fiber.memoizedProps?.event;
        const gid = event?.GID && String(event.GID);
        if (gid && state.events.has(gid)) {
          if (!skippedGids.has(gid)) {
            skippedGids.add(gid);
            removedAny = true;
          }
          break;
        }
      }
    }

    if (waitingForAsyncImage) emptyTimer = setTimeout(pruneEmptyCards, 1000);
    if (removedAny) {
      notifyEventStore();
      if (isUserActive() && isScrolledNearEnd()) pumpFeed();
    }
  }

  function onMutate() {
    if (!homeScope()) return;
    patchNativeCap();
    pruneEmptyCards();
  }

  async function fetchFeedPage(feed) {
    const url = new URL('https://store.steampowered.com/events/ajaxgetusereventcalendarrange/');
    url.search = new URLSearchParams({
      minTime: state.cutoff,
      maxTime: feed.cursor,
      ascending: 'false',
      maxResults: feed.pageSize,
      populateEvents: 15,
      appTypes: feed.key,
      eventTypes: EVENT_TYPES,
    });
    if (feed.key === 'steam') url.searchParams.set('collectionID', 'steam');

    state.requests++;
    const response = await owner.fetch(url, {
      credentials: 'include',
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`News Hub HTTP ${response.status}`);

    const data = await response.json();
    if (Number(data.success) !== 1 || !Array.isArray(data.documents)) {
      throw new Error('Invalid News Hub response');
    }
    if (state.stopped) return;

    if (
      feed.key === 'library' &&
      data.documents.length &&
      !(data.apps || []).some(app => Number(app.source) & 1)
    ) {
      throw new Error('News Hub did not return authenticated Library sources');
    }

    partnerStore.RegisterClanEvents(data.events || []);
    let oldestTimestamp = feed.cursor;
    let newlyAdded = 0;
    const ownedIds = ownedLibraryAppIds();

    for (const doc of data.documents) {
      const time = Number(doc.start_time);
      if (!Number.isFinite(time)) continue;
      oldestTimestamp = Math.min(oldestTimestamp, time);
      if (
        !doc.unique_id ||
        time < state.cutoff ||
        time > state.end ||
        (feed.key === 'library' && !ownedIds.has(Number(doc.appid)))
      ) {
        continue;
      }
      const id = String(doc.unique_id);
      if (!state.documents.has(id)) newlyAdded++;
      state.documents.set(id, { time });
      feed.ids.add(id);
    }

    if (data.backwardComplete || oldestTimestamp < state.cutoff) {
      feed.done = true;
    } else if (oldestTimestamp < feed.cursor) {
      feed.cursor = oldestTimestamp;
      feed.pageSize = 50;
    } else {
      feed.pageSize += 50;
      if (feed.pageSize > 1000 || (!data.documents.length && !newlyAdded)) {
        throw new Error('News Hub pagination stalled');
      }
    }
  }

  async function pumpFeed(initial = false) {
    if (state.busy || state.stopped || (!initial && (!isUserActive() || !isScrolledNearEnd()))) {
      return;
    }
    state.busy = true;
    state.error = false;

    const canContinue = () => !state.stopped && (initial || (isUserActive() && isScrolledNearEnd()));

    try {
      // Inside the try: a throw here must still clear `busy` in finally.
      patchNativeCap();
      notifyEventStore();
      for (const feed of state.feeds) {
        while (
          !feed.done &&
          [...feed.ids].filter(id => !state.events.has(id) && isWithinWindow(state.documents.get(id)))
            .length < CARD_BATCH
        ) {
          if (!canContinue()) return;
          await fetchFeedPage(feed);
        }
      }
      if (!canContinue()) return;

      const batch = pendingDocuments().slice(0, CARD_BATCH);
      const missingIds = batch.map(([id]) => id).filter(id => !partnerStore.GetClanEventModel(id));
      if (missingIds.length) {
        if (!canContinue()) return;
        await partnerStore.LoadBatchPartnerEventsByEventGIDsOrAnnouncementGIDs(missingIds);
      }
      if (state.stopped) return;

      const resolved = batch.map(([id, doc]) => [id, { ...doc, model: partnerStore.GetClanEventModel(id) }]);
      if (resolved.some(([, entry]) => !entry.model)) {
        throw new Error('Failed to resolve partner event models');
      }
      for (const [id, entry] of resolved) state.events.set(id, entry);
      state.loaded = true;
    } catch (err) {
      state.error = true;
      console.warn('[Steam Enhanced News Hub]', err);
    } finally {
      state.busy = false;
      if (!state.stopped) {
        notifyEventStore();
        patchNativeCap();
        if (!state.error && !isFeedExhausted() && isUserActive() && isScrolledNearEnd()) {
          queueMicrotask(() => pumpFeed());
        }
      }
    }
  }

  function onUserActivity(event) {
    const root = findCarousel();
    if (!root || !root.contains(event.target)) return;
    if (event.type === 'wheel' && !event.deltaX && !event.shiftKey) return;
    if (
      event.type === 'keydown' &&
      !['ArrowLeft', 'ArrowRight', 'End', 'PageDown'].includes(event.key)
    ) {
      return;
    }
    state.activeUntil = Date.now() + ACTIVE_MS;
    pumpFeed();
  }

  function resetFeeds() {
    if (state.busy || state.stopped) return;
    state.cutoff = nowSeconds() - WINDOW_SECONDS;
    state.end = nowSeconds();
    skippedGids.clear();
    state.events.clear();
    state.documents.clear();
    state.loaded = false;
    state.activeUntil = 0;
    state.feeds = [{ key: 'steam', cursor: state.end, pageSize: 50, done: false, ids: new Set() }];
    if (ownedLibraryAppIds().size) {
      state.feeds.push({
        key: 'library',
        cursor: state.end,
        pageSize: 50,
        done: false,
        ids: new Set(),
      });
    }
    pumpFeed(true);
  }

  function tryInit() {
    if (state.stopped || !document.body || !document.querySelector('.LibraryHome')) return;
    for (const candidate of SE.owners()) {
      try {
        if (candidate.appStore && candidate.libraryEventStore && candidate.partnerEventStore) {
          owner = candidate;
          break;
        }
      } catch {}
    }

    eventStore = owner?.libraryEventStore;
    partnerStore = owner?.partnerEventStore;
    if (
      !eventStore?.GetWhatsNewEvents ||
      !eventStore?.GetLibraryHomeBestEventsForUser ||
      !partnerStore?.RegisterClanEvents ||
      !partnerStore?.GetClanEventModel ||
      !partnerStore?.LoadBatchPartnerEventsByEventGIDsOrAnnouncementGIDs
    ) {
      return;
    }

    initPoll?.disconnect();
    originals.news = eventStore.GetLibraryHomeBestEventsForUser;
    originals.takeovers = eventStore.GetTakeOverEvents;
    originals.status = eventStore.GetWhatsNewEvents;

    wrappers.news = function () {
      originals.news.call(this);
      return visibleModels();
    };
    wrappers.takeovers = () => [];
    wrappers.status = function () {
      return {
        ...originals.status.call(this),
        bEventsLoaded: state.loaded || state.error,
        bInitialLoadPending: state.busy && !state.loaded,
        eventsToShow: visibleModels(),
        takeoverEvents: [],
      };
    };

    eventStore.GetLibraryHomeBestEventsForUser = wrappers.news;
    eventStore.GetTakeOverEvents = wrappers.takeovers;
    eventStore.GetWhatsNewEvents = wrappers.status;

    observer = SE.watch(onMutate, { ignore: SE.inSide });
    for (const type of ['scroll', 'wheel', 'keydown']) {
      document.addEventListener(type, onUserActivity, true);
    }

    refreshTimer = setInterval(() => {
      if (!homeScope()) return; // nothing to refresh off Home; the next visit rebuilds anyway
      notifyEventStore();
      patchNativeCap();
      const area = findScrollArea();
      if (!state.busy && !isUserActive() && (!area || Math.abs(area.scrollLeft) < 1)) {
        resetFeeds();
      }
    }, 10 * 60 * 1000);

    resetFeeds();
  }

  state.destroy = () => {
    state.stopped = true;
    initPoll?.disconnect();
    clearInterval(refreshTimer);
    clearTimeout(emptyTimer);
    observer?.disconnect();
    for (const type of ['scroll', 'wheel', 'keydown']) {
      document.removeEventListener(type, onUserActivity, true);
    }
    for (const [instance, limit] of savedCaps) {
      instance.k_MaxSmallCapsToShow = limit;
      instance.forceUpdate?.();
    }
    const methods = [
      ['GetLibraryHomeBestEventsForUser', 'news'],
      ['GetTakeOverEvents', 'takeovers'],
      ['GetWhatsNewEvents', 'status'],
    ];
    for (const [method, key] of methods) {
      if (eventStore?.[method] === wrappers[key] && originals[key]) {
        eventStore[method] = originals[key];
      }
    }
    if (eventStore) notifyEventStore();
    delete window.__seNewsHub;
  };

  // Until Home is first opened: a visibility-aware poll that idles at core's slow rate.
  initPoll = SE.poll(tryInit, 1000, { active: () => !!document.querySelector('.LibraryHome') });
  tryInit();
})(window.__se);
