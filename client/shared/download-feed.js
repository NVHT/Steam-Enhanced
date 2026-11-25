/*
 * Steam's live download feeds (SteamClient.Downloads' RegisterForDownloadOverview and
 * RegisterForDownloadItems), one subscription for every part that reads them: the rail's
 * Downloads card (client/header/downloads-card.js), the Downloads page (client/downloads/page/)
 * and Settings › Downloads (client/settings/dialog/downloads.js). Steam's download store can
 * sit stale while no one subscribes, so these are the source of truth. Registered while anyone listens, dropped with the last.
 *   SE.downloadFeed  { overview, items, subscribe(fn) → unsubscribe }
 */
((SE) => {
  window.__seDownloadFeed?.destroy?.();
  const state = (window.__seDownloadFeed = {});
  const { run } = SE;

  const listeners = new Set();
  let registrations = [];
  const feed = { overview: null, items: null, subscribe };

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
