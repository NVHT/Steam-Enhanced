/*
 * Steam started on a Store or Community page (Settings › Interface › Start Up Location): the
 * Library shown once, then the page again.
 *
 * Steam renders the Library only the first time it's shown, so a window that opens on a page has
 * none: the theme's game list beside the page (client/friends/dock/dock.js, data-se-store-list)
 * stays an empty column until the Library is visited. At startup the main window goes to Library
 * Home and, once its game list is there, back to the page it opened on (SE.openPage, the address
 * Steam's browser view asked for; the Library blanks the view, so the page loads again). Under
 * the splash the page loads out of sight and shows as it leaves (client/entrance/entrance.js,
 * toPage()). Once per window: after that Steam keeps the Library mounted under every page.
 *
 * Where the window opened is told to the splash (setView) and remembered for the next one
 * (START_KEY): the splash draws that page, and is up before Steam says.
 *
 * Steam sets the main window's route and the page's address a while after this runs, so each
 * pass waits for both (and stops at once if the Library's list shows up on its own). `state`
 * says where it got to, for the element report (dev/inspector-report.js).
 */
((SE) => {
  window.__seStartOnPage?.destroy();
  if (!SE?.mainWindow) return;

  const { C, run } = SE;
  const LIST = `.${C.GameListHomeAndSearch_Container}`;
  const GIVE_UP_MS = 30000; // a startup that never settles: leave the window as it is

  const START_KEY = 'se-start-view'; // client/entrance/entrance.js reads it
  // The splash's view of an address: News, the Store, Friend Activity, the rest of Community
  const viewOf = (url) => {
    if (/^https?:\/\/store\.steampowered\.com\/news\b/i.test(url)) return 'news';
    if (/^https?:\/\/store\.steampowered\.com/i.test(url)) return 'store';
    const community = /^https?:\/\/steamcommunity\.com(\/.*)?$/i.exec(url);
    if (!community) return 'library';
    const own = /^\/(?:(?:id|profiles)\/[^/]+|my)\/(?:home|myactivity)\b/i;
    return own.test(community[1] || '') ? 'activity' : 'community';
  };
  const opensOn = (view) => {
    run(() => localStorage.setItem(START_KEY, view));
    window.__seEntrance?.setView?.(view);
  };

  const browserURL = () => {
    const manager = SE.global('MainWindowBrowserManager');
    return run(() => manager?.m_URLRequested || manager?.m_URL) || '';
  };

  const api = {
    state: 'waiting for the main window',
    destroy() {
      stop();
      offStyled?.();
      delete window.__seStartOnPage;
    },
  };

  let watcher = null;
  let timer = 0;
  let back = ''; // the page to go back to, once the list is there

  /*
   * The page in Steam's view telling it has the theme's look (SteamEnhanced.Styled, core/core.js):
   * returns whether it has, the listener going once it says so or this is destroyed
   */
  let styled = false;
  let offStyled = null;
  function listenStyled() {
    const browser = run(() => SE.global('MainWindowBrowserManager')?.m_browser);
    if (typeof browser?.on !== 'function') return null;
    const listener = (message) => {
      if (message !== 'SteamEnhanced.Styled') return;
      styled = true;
      offStyled?.();
    };
    run(() => browser.on('message', listener));
    offStyled = () => {
      run(() => browser.off?.('message', listener));
      offStyled = null;
    };
    return () => styled;
  }

  function stop(state) {
    if (state) api.state = state;
    watcher?.disconnect();
    watcher = null;
    clearTimeout(timer);
    timer = 0;
  }

  function step() {
    if (!watcher) return;
    const list = document.querySelector(LIST);
    if (back) {
      // On Library Home: back to the page once the list has rendered
      if (!list) return;
      const url = back;
      // The splash lets the page out once the page says it has its look (core/core.js)
      window.__seEntrance?.toPage?.(listenStyled());
      stop(`back to ${url}`);
      SE.openPage(url);
      return;
    }
    if (list) {
      opensOn('library');
      stop('the Library was already there');
      return;
    }
    if (!run(() => SE.mainWindow()?.LocationPathName)) return;
    if (!SE.browserShown()) {
      api.state = 'waiting for a page (the Library is showing)';
      return;
    }
    const url = browserURL();
    if (!/^https?:\/\//i.test(url)) {
      api.state = 'waiting for the page address';
      return;
    }
    back = url;
    opensOn(viewOf(url));
    api.state = SE.navigate('/library/home') ? 'showing the Library' : 'Steam would not show the Library';
  }

  watcher = SE.watch(step, { throttle: 100 });
  timer = setTimeout(() => stop(`gave up (${api.state})`), GIVE_UP_MS);
  step();

  window.__seStartOnPage = api;
})(window.__se);
