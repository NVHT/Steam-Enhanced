/*
 * SE.openPage(url): a Store or Community page in the main window, or a steam:// link, opened
 * so it still works after a game has run. Steam's navigator (its SteamWeb) then stops opening
 * anything until a restart: the call returns and nothing loads, while the main browser view's
 * ShowURL and the client's ExecuteSteamURL still work.
 *
 *   steam://  through the client's handler (some open a dialog: nothing to check)
 *   a page    through the navigator, as Steam's own menus open it; checked a moment later (the
 *             main window left its page, or the browser view asks for that address) and, if
 *             not, through ShowURL, checked again, then Steam's openurl link
 *
 * SE.openPage.CHECK_MS is that moment, for a caller with a way of its own to try first.
 */
((SE) => {
  if (!SE || SE.openPage) return;

  // How long a navigation may take to show before the next way is tried
  const CHECK_MS = 400;

  const routePath = () => SE.run(() => SE.mainWindow()?.LocationPathName) || '';
  const browserManager = () => SE.global('MainWindowBrowserManager');
  const browserURL = () => SE.run(() => browserManager()?.m_URLRequested || browserManager()?.m_URL) || '';
  const navigator = () =>
    SE.run(() => SE.mainWindow()?.Navigator) || SE.run(() => SE.global('tempNavStore')?.GetNavigator()) || null;

  // The page asked for, give or take a trailing slash, a query or a hash added on the way, or a
  // page under it (a redirect deeper: /points to /points/shop); a site's front page only itself
  const bare = (url) => url.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  const tookURL = (url) => {
    const want = bare(url);
    const now = bare(browserURL());
    return now === want || (/^https?:\/\/[^/]+\/./.test(want) && now.startsWith(`${want}/`));
  };
  const didOpen = (url, before) => routePath() !== before || tookURL(url);

  // Runs `next` unless the main window has moved to `url` by then
  const unlessOpened = (url, before, next) => setTimeout(() => didOpen(url, before) || next(), CHECK_MS);

  const openURLLink = (url) => SE.steamCall('URL', 'ExecuteSteamURL', `steam://openurl/${url}`);

  function showURL(url) {
    const manager = browserManager();
    const before = routePath();
    if (typeof manager?.ShowURL === 'function' && SE.run(() => (manager.ShowURL(url), true))) {
      unlessOpened(url, before, () => openURLLink(url));
    } else {
      openURLLink(url);
    }
  }

  function openPage(url) {
    if (typeof url !== 'string' || !url) return;
    if (url.startsWith('steam://')) {
      SE.steamCall('URL', 'ExecuteSteamURL', url);
      return;
    }
    const nav = navigator();
    const before = routePath();
    if (typeof nav?.SteamWeb === 'function' && SE.run(() => (nav.SteamWeb(url), true))) {
      unlessOpened(url, before, () => showURL(url));
    } else {
      showURL(url);
    }
  }

  openPage.CHECK_MS = CHECK_MS;
  SE.openPage = openPage;
})(window.__se);
