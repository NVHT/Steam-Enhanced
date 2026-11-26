/*
 * Steam's live download feeds (SteamClient.Downloads' RegisterForDownloadOverview and
 * RegisterForDownloadItems), one subscription for every part that reads them: the rail's
 * Downloads card (client/header/downloads-card.js), the Downloads page (client/downloads/page/)
 * and Settings › Downloads (client/settings/dialog/downloads.js). Steam's download store can
 * sit stale while no one subscribes, so these are the source of truth. Registered while anyone listens, dropped with the last.
 *   SE.downloadFeed  { overview, items, subscribe(fn) → unsubscribe, queue(fallback) }
 *     queue: the games still to come, in queue order (fallback: a list to read while the feed has none)
 */
((SE) => {
  window.__seDownloadFeed?.destroy?.();
  const state = (window.__seDownloadFeed = {});
  const { run } = SE;

  const listeners = new Set();
  let registrations = [];
  const feed = { overview: null, items: null, subscribe, queue };

  const notify = () => {
    for (const fn of listeners) run(fn);
  };

  function register() {
    const api = SE.global('SteamClient', (client) => client.Downloads)?.Downloads || null;
    registrations = [
      run(() => api?.RegisterForDownloadOverview?.((overview) => {
        feed.overview = overview;
        notify();
      })),
      // (isDownloading, items) in the builds seen; whichever argument is the list
      run(() => api?.RegisterForDownloadItems?.((...args) => {
        feed.items = args.find((arg) => arg && typeof arg === 'object') ?? feed.items;
        notify();
      })),
    ];
  }

  function unregister() {
    for (const registration of registrations) run(() => registration?.unregister());
    registrations = [];
    // Unwatched, the last values go stale
    feed.overview = null;
    feed.items = null;
  }

  /*
   * The queue's games still to come, in queue order. Steam's live feed gives a list per client
   * ({ remote_client_id, ... } with the games in a list inside), the store a flat list, an
   * observable array or a map depending on the build: every object with an appid within a few
   * levels counts, once.
   */
  function queue(fallback) {
    const found = new Map();
    const seen = new Set();
    const walk = (value, depth) => {
      if (!value || typeof value !== 'object' || seen.has(value) || depth > 3) return;
      seen.add(value);
      if (Number(value.appid) && 'completed' in value) {
        if (!found.has(Number(value.appid))) found.set(Number(value.appid), value);
        return;
      }
      const children = Array.isArray(value)
        ? value
        : typeof value.values === 'function' && !(value instanceof String)
          ? run(() => [...value.values()]) || Object.values(value)
          : Object.values(value);
      for (const child of children) walk(child, depth + 1);
    };
    walk(feed.items || fallback, 0);
    return [...found.values()]
      .filter((item) => !item.completed)
      .sort((a, b) => (Number(a.queue_index) || 0) - (Number(b.queue_index) || 0));
  }

  /** fn runs on each update (about once a second while something moves); returns the unsubscribe. */
  function subscribe(fn) {
    listeners.add(fn);
    if (listeners.size === 1) register();
    return () => {
      if (!listeners.delete(fn) || listeners.size) return;
      unregister();
    };
  }

  state.destroy = () => {
    listeners.clear();
    unregister();
    if (SE.downloadFeed === feed) delete SE.downloadFeed;
    if (window.__seDownloadFeed === state) delete window.__seDownloadFeed;
  };

  SE.downloadFeed = feed;
})(window.__se);
