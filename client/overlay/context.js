/*
 * In-game overlay controller (SP Overlay windows).
 *
 * Steam's native overlay layout is kept; its toolbars, clock and top-right
 * Back to Game are hidden (overlay.css). These scripts fill the top-left time
 * stats column:
 *   - a header: the game logo over two rows, beside Time · This session and
 *     Total · Last 2 weeks; clicking the time starts a timer (it then shows
 *     the elapsed time), in place of Steam's Clock/Timer;
 *   - a rail of duotone view tabs with Back to game
 *     and Exit game at its foot, both forwarding to Steam's own buttons;
 *   - a drawer beside it with the open view: Overview (Achievements, Friends,
 *     Your Screenshots, Guides, Recent News), Achievements (the full list with
 *     rarity tiers), Friends, Remote Play Together, Notes, Controller, Browser
 *     and Settings. Steam's widget windows open centred at a fixed size.
 *
 * Steam draws Game Overview in a separate popup window,
 * so its DOM is never moved here. The sections read the same Steam data
 * instead. Every section hides itself when its data is missing or Steam does
 * not answer; `__seOverlay.debug()` in the overlay's DevTools says why.
 * Everything re-syncs on a slow poll, so React re-renders and token edits are
 * picked up. Data also loads in the background while the overlay is hidden,
 * so the column is filled the moment it opens.
 *
 * Plain scripts, listed part by part in client/loader.js and run in this order, sharing
 * window.__steamEnhancedOverlayParts (values parts reassign live on its `live`):
 * - context.js       selectors, icons, and Steam's shared context (this one)
 * - data.js          the async data cache and Steam's protobuf services
 * - sources.js       achievements, friends, screenshots, guides and news data
 * - widgets.js       the toolbar's widgets and their windows, centred at a fixed size
 * - dom.js           building the column: stats, sections, views, cards, the logo trim
 * - render.js        rendering the sections, the view tabs and the timer
 * - friends.js       the Friends, Remote Play and Controller views
 * - notes.js         the Notes view
 * - browser.js       the Browser and Settings views
 * - achievements.js  the full achievements list
 * - main.js          fitting to the screen, start, debug() and the API (destroy())
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = (window.__steamEnhancedOverlayParts = { live: {} });
  const { C } = SE;
  const { live } = ns;
  live.achData = null;
  live.ui = null;
  live.view = 'overview';
  live.instance = null;
  live.shotSample = null;
  live.guidesServiceError = null;
  live.guidesRaw = null;
  live.controllerSample = null;

  window.__seOverlay?.destroy();

  const ATTR = 'data-se-ov';
  const LOGO_ATTR = 'data-se-ov-logo';
  const SCROLL_ATTR = 'data-se-ov-scroll';
  const TICK_MS = 1000;
  const SEL = Object.freeze({
    timeStats: `.${C.AchievementContent_TopSection} .${C.TimeStats}`,
    logo: `.${C.TopSectionMiddle}.${C.ShowGameLogo} img`,
    backToGame: `.${C.AchievementContent_TopSection} .${C.BackToGameBtn}`,
    // Steam's Exit game button in the time stats column (hidden; the rail's clicks it).
    exitGame: `.${C.AchievementContent_TopSection} .${C.TimeStats} .BoygotvcKo4DC4dSix8G3`,
    // ToolbarContainer > ToolbarButton (module 13, not in the core class map).
    toolbarButton: '._3OzkVrQFFPv0aV41N4MrHV ._3ZLaTxSHxeGcoKlIy_-Z0L',
  });
  // ToolbarButton's "widget open" state.
  const TOOLBAR_ACTIVE = '_1BXjK5v8XI_SEhGola5ftn';
  const ICON = Object.freeze({
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.6v10.8a.6.6 0 0 0 .9.5l8.6-5.4a.6.6 0 0 0 0-1L4.9 2.1a.6.6 0 0 0-.9.5z"/></svg>',
    chevron: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    star: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m8 1.6 1.9 4 4.4.5-3.3 3 .9 4.3L8 11.2l-3.9 2.2.9-4.3-3.3-3 4.4-.5z"/></svg>',
    open: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3 5 11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    power: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2v5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M4.6 4.4a5 5 0 1 0 6.8 0" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    close: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    trash: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    search: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m10.5 10.5 3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  });
  // Rail icons: one duotone set on a 24px grid. The back shape is the second
  // tone (TONE), the detail on top full strength (FILL); both follow `color`.
  const TONE = 'fill="currentColor" fill-opacity=".38"';
  const FILL = 'fill="currentColor"';
  const icon24 = body => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  const VIEW_ICON = Object.freeze({
    overview: icon24(`<rect x="3" y="3" width="8" height="10" rx="2.2" ${FILL}/><rect x="13" y="3" width="8" height="6" rx="2.2" ${TONE}/><rect x="13" y="11" width="8" height="10" rx="2.2" ${FILL}/><rect x="3" y="15" width="8" height="6" rx="2.2" ${TONE}/>`),
    achievements: icon24(`<path d="M7.2 2.5h3.3l2.3 6.2H9.5zM16.8 2.5h-3.3l-2.3 6.2h3.3z" ${TONE}/><circle cx="12" cy="15.3" r="6.2" ${TONE}/><path d="m12 11.3 1.25 2.55 2.8.4-2.03 1.98.48 2.79L12 17.7l-2.5 1.32.48-2.79-2.03-1.98 2.8-.4z" ${FILL}/>`),
    friends: icon24(`<circle cx="16.6" cy="8" r="3.1" ${TONE}/><path d="M13 14.2a5.6 5.6 0 0 1 9 4.4v.9a1 1 0 0 1-1 1h-6.4z" ${TONE}/><circle cx="9" cy="7.6" r="3.9" ${FILL}/><path d="M1.8 19.4a7.2 7.2 0 0 1 14.4 0v.6a1 1 0 0 1-1 1H2.8a1 1 0 0 1-1-1z" ${FILL}/>`),
    remote: icon24(`<rect x="2" y="3" width="20" height="13.5" rx="2.6" ${TONE}/><rect x="7.5" y="19" width="9" height="2.2" rx="1.1" ${FILL}/><rect x="11" y="16" width="2" height="3.5" ${FILL}/><path d="M8.6 10.6a4.8 4.8 0 0 1 6.8 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M6.2 8.2a8.2 8.2 0 0 1 11.6 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-opacity=".6"/><circle cx="12" cy="12.9" r="1.4" ${FILL}/>`),
    notes: icon24(`<rect x="4" y="2" width="16" height="20" rx="2.8" ${TONE}/><rect x="7.5" y="7" width="9" height="1.9" rx=".95" ${FILL}/><rect x="7.5" y="11" width="9" height="1.9" rx=".95" ${FILL}/><rect x="7.5" y="15" width="5.5" height="1.9" rx=".95" ${FILL}/>`),
    controller: icon24(`<path d="M7.2 6h9.6a5 5 0 0 1 4.9 6l-1.1 5.3a2.7 2.7 0 0 1-4.6 1.3L13.8 16.5h-3.6l-2.2 2.1a2.7 2.7 0 0 1-4.6-1.3L2.3 12a5 5 0 0 1 4.9-6z" ${TONE}/><path d="M7 8.9h1.8v1.9h1.9v1.8H8.8v1.9H7v-1.9H5.1v-1.8H7z" ${FILL}/><circle cx="16" cy="10.4" r="1.35" ${FILL}/><circle cx="18.1" cy="12.8" r="1.35" ${FILL}/>`),
    browser: icon24(`<circle cx="12" cy="12" r="10" ${TONE}/><path d="M2.6 12h18.8M12 2.3c2.7 2.7 4 6 4 9.7s-1.3 7-4 9.7c-2.7-2.7-4-6-4-9.7s1.3-7 4-9.7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>`),
    settings: icon24(`<path d="M9.4 4.6L10 1.9h4l.6 2.7.8.3 2.3-1.5 2.9 2.9-1.5 2.3.3.8 2.7.6v4l-2.7.6-.3.8 1.5 2.3-2.9 2.9-2.3-1.5-.8.3-.6 2.7h-4l-.6-2.7-.8-.3-2.3 1.5-2.9-2.9 1.5-2.3-.3-.8-2.7-.6v-4l2.7-.6.3-.8-1.5-2.3 2.9-2.9 2.3 1.5z" ${TONE}/><circle cx="12" cy="12" r="3.6" ${FILL}/>`),
  });

  const root = document.documentElement;

  const enabled = () =>
    getComputedStyle(root).getPropertyValue('--se-overlay').trim().toLowerCase() !== 'off';

  /* ---------- Steam context ---------- */

  // Steam's stores and SteamClient bindings live in the shared JS context (the
  // window that owns SteamUIStore). This popup's own globals are a fallback:
  // its SteamClient doesn't answer every call.
  const contextWindows = () =>
    [...SE.owners()].sort(
      (a, b) => Number(!!SE.run(() => b.SteamUIStore)) - Number(!!SE.run(() => a.SteamUIStore))
    );

  const contextGlobal = key => {
    for (const win of contextWindows()) {
      const value = SE.run(() => win[key]);
      if (value) return value;
    }
    return null;
  };

  // The first export of a module whose source has every marker that `pick` accepts. Used
  // inside SE.findModule tests, which own the scan and cache its result.
  const exportOf = (src, id, req, markers, pick) => {
    if (!markers.every(marker => src.includes(marker))) return null;
    for (const value of Object.values(SE.run(() => req(id)) || {})) {
      if (SE.run(() => pick(value))) return value;
    }
    return null;
  };

  const titlePid = () => Number(/^SP Overlay:\s*(\d+)/.exec(document.title)?.[1]) || 0;

  const findInstance = () => {
    if (live.instance && SE.run(() => live.instance.BrowserWindow) === window) return live.instance;
    live.instance = null;
    const pid = titlePid();
    for (const win of SE.owners()) {
      const list = SE.run(() => win.SteamUIStore?.WindowStore?.OverlayWindows);
      if (!Array.isArray(list)) continue;
      live.instance =
        list.find(inst => SE.run(() => inst.BrowserWindow) === window) ||
        (pid && list.find(inst => SE.run(() => inst.params.browserInfo.m_unPID) === pid)) ||
        null;
      if (live.instance) break;
    }
    return live.instance;
  };

  const desktopOverlay = () => SE.run(() => findInstance()?.DesktopOverlay) || null;

  const overviewOf = appid => (appid ? SE.run(() => SE.appStore()?.GetAppOverviewByAppID(appid)) || null : null);

  const readStats = () => {
    const ov = desktopOverlay();
    const appid = Number(SE.run(() => ov?.appid)) || 0;
    const app = overviewOf(appid);
    const start = Number(SE.run(() => ov?.time_session_start)) || 0;
    return {
      appid,
      name: SE.run(() => app?.display_name) || '',
      session: start ? Math.max(0, Math.floor((Date.now() / 1000 - start) / 60)) : null,
      total: Number(SE.run(() => app?.minutes_playtime_forever)),
      recent: Number(SE.run(() => app?.minutes_playtime_last_two_weeks)),
    };
  };

  // Minutes under an hour stay in minutes; longer spans read in hours.
  const duration = minutes => {
    if (!Number.isFinite(minutes) || minutes < 0) return { value: '–', unit: '' };
    if (minutes < 60) return { value: String(minutes), unit: 'min' };
    return { value: (minutes / 60).toFixed(1), unit: 'hrs' };
  };

  // Widget ids and visibility values from Steam's DesktopOverlay enums.
  const openWidget = id => SE.run(() => desktopOverlay()?.SetWindowVisibility(id, 1));

  // Web pages open as a new tab in the overlay's own browser:
  // DesktopOverlay.AddWebPageRequest(url, activate) adds the tab, saves it and
  // shows the Browser widget. Outside an overlay (or if that ever fails), Steam's
  // URL handler opens the page in the client instead.
  const openUrl = url => {
    const overlay = desktopOverlay();
    if (typeof overlay?.AddWebPageRequest === 'function') {
      try {
        overlay.AddWebPageRequest(url, true);
        return;
      } catch (err) {
        console.warn('[Steam Enhanced overlay] browser tab failed', err);
      }
    }
    SE.run(() => contextGlobal('SteamClient').URL.ExecuteSteamURL(`steam://openurl/${url}`));
  };

  // Steam's own overlay path for a friend's chat: the chat window opens in
  // this overlay (and still goes through the theme's chat routing).
  const openChat = steamid64 => {
    const accountId = SE.run(() => Number(BigInt(steamid64) & 0xffffffffn));
    if (!accountId) return;
    const browserInfo = SE.run(() => findInstance().params.browserInfo);
    const friend = SE.run(() => contextGlobal('g_FriendsUIApp').FriendStore.GetFriend(accountId));
    if (friend && browserInfo) SE.run(() => friend.OpenChatDialog(browserInfo));
  };

  const accountIdOf = steamid64 => SE.run(() => Number(BigInt(steamid64) & 0xffffffffn)) || 0;

  const selfSteamId = () =>
    SE.run(() => contextGlobal('App').m_CurrentUser.strSteamID) ||
    SE.run(() => String(contextGlobal('g_FriendsUIApp').FriendStore.self.steamid64)) ||
    '';

  Object.assign(ns, { ATTR, ICON, LOGO_ATTR, SCROLL_ATTR, SEL, TICK_MS, TOOLBAR_ACTIVE, VIEW_ICON, accountIdOf, contextGlobal, contextWindows, desktopOverlay, duration, enabled, exportOf, openChat, openUrl, openWidget, overviewOf, readStats, root, selfSteamId });
});
