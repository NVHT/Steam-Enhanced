/*
 * Web pages: load the site's loader from the theme folder core.js was served from; it decides
 * which files each page gets: store/loader.js, community/loader.js or help/loader.js.
 * Millennium injects core.js into every web view, so this needs no dedicated skin.json rules
 * (new rules only take effect after a full Steam restart). Requested with ?v=<theme version>
 * so the web view's cache never mixes builds; the loader passes the same version on to every
 * file. The version comes from the last visit (localStorage) so the page needn't wait; skin.json
 * is read uncached on every load all the same, and a changed version swaps the build in place.
 * If skin.json can't be read on a first visit, files load unversioned and cache normally.
 * Until the loader has styled the page, a guard hides Steam's own look (see below).
 *
 * Live reload (development): when dev/live-reload.json says {"enabled": true} (git-ignored,
 * so released builds never poll), an open page re-reads skin.json every LIVE_MS while visible.
 * A new version swaps the build in place: copies of the current stylesheets hold the page's
 * look, the site's destroy() undoes every feature, the loader starts again at the new version,
 * and the copies go once the new sheets have loaded. No page reload, no Steam restart. A
 * "Live <version>" badge (bottom-left) shows it is running and flashes on each swap.
 */
(() => {
  const SITES = {
    'store.steampowered.com': { loader: '../store/loader.js', global: '__seStore' },
    'steamcommunity.com': { loader: '../community/loader.js', global: '__seCommunity' },
    'help.steampowered.com': { loader: '../help/loader.js', global: '__seHelp' },
  };
  const site = SITES[location.hostname];
  if (!site) return;

  // Store and Community pages tell their host (the Friends dock's chat flyout) when they take
  // or lose focus, so the flyout knows a click inside it isn't a click away.
  if (site.global !== '__seHelp' && !window.__seBrowserChatClicks) {
    const relay = (event) => {
      if (!event.isTrusted || event.target !== window) return;
      try {
        window.SteamClient?.BrowserView?.PostMessageToParent('SteamEnhanced.ChatBrowserFocus', event.type);
      } catch {}
    };
    addEventListener('focus', relay);
    addEventListener('blur', relay);
    window.__seBrowserChatClicks = true;
  }
  const { loader } = site;
  const coreSrc = document.currentScript?.src ||
    [...document.scripts].find((script) => /\/core\/core\.js(?:[?#]|$)/.test(script.src))?.src;
  if (!coreSrc || document.querySelector('[data-se-feature]')) return;

  // No flash of Steam's own look: until the site's loader has its first stylesheets and page
  // scripts in ([data-se-styled], set by the loader), the page shows only the theme's
  // background. Set here, synchronously, because everything after is async (skin.json, the
  // loader module, its stylesheets). If the loader never gets there, a CSS timer shows the
  // page anyway; visibility stays non-!important so that animation can win.
  const root = document.documentElement;
  if (!root.hasAttribute('data-se-styled') && !document.getElementById('se-guard')) {
    const guard = document.createElement('style');
    guard.id = 'se-guard';
    guard.textContent =
      'html:not([data-se-styled]){background:#171a20!important}' + // --se-bg (core/tokens.css)
      'html:not([data-se-styled]) body{visibility:hidden;animation:se-guard 0s 1.5s forwards}' +
      '@keyframes se-guard{to{visibility:visible}}';
    (document.head ?? root).append(guard);
  }
  const reveal = () => root.setAttribute('data-se-styled', '');

  // Every site's loader imports web/site-loader.js, which imports web/dom.js: preloading both
  // with the loader starts all three downloads at once instead of one after another. The URLs
  // must match the imports exactly (same ?v=) for the browser to reuse them.
  const PRELOAD = ['../web/site-loader.js', '../web/dom.js'];

  const load = (version) => {
    const versioned = (file) => {
      const url = new URL(file, coreSrc);
      if (version) url.searchParams.set('v', version);
      return url.href;
    };
    const head = document.head ?? document.documentElement;
    for (const file of PRELOAD) {
      const href = versioned(file);
      if (head.querySelector(`link[rel="modulepreload"][href="${href}"]`)) continue;
      head.append(Object.assign(document.createElement('link'), { rel: 'modulepreload', href }));
    }
    const url = new URL(versioned(loader));
    const script = document.createElement('script');
    script.type = 'module';
    script.src = url.href;
    script.dataset.seFeature = 'loader';
    script.addEventListener('error', reveal, { once: true });
    head.append(script);
  };
  // Never from cache, and a fresh URL each time: a version bump leaves skin.json the same size,
  // and a size-based validator would answer "not modified" and hand back the old version.
  const readVersion = () => {
    const url = new URL('../skin.json', coreSrc);
    url.searchParams.set('t', String(Date.now()));
    return fetch(url, { cache: 'no-store' })
      .then((response) => response.json())
      .then((skin) => skin.version ?? null);
  };

  /* ---------- Live reload (development) ---------- */

  const LIVE_MS = 2000;
  const STALE_MAX_MS = 3000;
  let current = null;

  // The old build's copies stay until every new stylesheet has loaded (or STALE_MAX_MS passes)
  const dropWhenReady = (stale, started = performance.now()) => {
    const fresh = [...document.querySelectorAll('link[data-se-feature]')];
    if ((fresh.length && fresh.every((link) => link.sheet)) || performance.now() - started > STALE_MAX_MS) {
      stale.forEach((link) => link.remove());
    } else {
      setTimeout(() => dropWhenReady(stale, started), 100);
    }
  };

  // Badge: bottom-left, shows the running build; flashes on each swap. Shadow DOM, so no page
  // or theme style reaches it.
  let badge = null;
  const showBadge = () => {
    const host = document.createElement('div');
    host.id = 'se-live-reload';
    host.style.cssText = 'position:fixed;left:10px;bottom:10px;z-index:2147483000;pointer-events:none';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<style>' +
      'span{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:999px;' +
      'background:rgba(16,18,23,.82);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);color:#98a2ad;' +
      'font:700 11px/1 "Xmind","Motiva Sans",Arial,sans-serif;font-variant-numeric:tabular-nums;' +
      'transition:color .3s,box-shadow .3s}' +
      'span::before{content:"";width:6px;height:6px;border-radius:50%;background:#90ba3c}' +
      'span.flash{color:#fff;box-shadow:inset 0 0 0 1px #7cc4ff,0 0 0 3px rgba(124,196,255,.3)}' +
      '</style><span></span>';
    badge = shadow.querySelector('span');
    badge.textContent = `Live ${current ?? ''}`.trim();
    (document.body ?? root).append(host);
  };
  const flashBadge = (version) => {
    if (!badge) return;
    badge.textContent = `Live ${version}`;
    badge.classList.add('flash');
    setTimeout(() => badge.classList.remove('flash'), 1500);
  };

  const swap = (version) => {
    current = version;
    flashBadge(version);
    const stale = [...document.querySelectorAll('link[data-se-feature]')].map((link) => {
      const copy = link.cloneNode();
      copy.removeAttribute('data-se-feature');
      copy.removeAttribute('blocking');
      copy.dataset.seStale = '';
      link.before(copy);
      return copy;
    });
    // destroy() drops the page classes the copies are scoped to; they come back until the new
    // loader sets its own
    const classes = [...root.classList].filter((name) => name.startsWith('se-'));
    try {
      window[site.global]?.destroy();
    } catch (error) {
      console.error('[Steam Enhanced] live reload: destroy failed', error);
    }
    if (classes.length) root.classList.add(...classes);
    document.querySelector('script[data-se-feature="loader"]')?.remove();
    load(version);
    dropWhenReady(stale);
    console.info(`[Steam Enhanced] now running ${version}`);
  };

  const poll = async () => {
    if (document.visibilityState === 'visible') {
      try {
        const version = await readVersion();
        if (version && current && version !== current) swap(version);
      } catch {}
    }
    setTimeout(poll, LIVE_MS);
  };

  const startLiveReload = () =>
    fetch(new URL(`../dev/live-reload.json?t=${Date.now()}`, coreSrc), { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((config) => {
        if (!config?.enabled) return;
        if (document.body) showBadge();
        else addEventListener('DOMContentLoaded', showBadge, { once: true });
        setTimeout(poll, LIVE_MS);
      })
      .catch(() => {});

  /*
   * The build to load: the version last seen on this site, so the page doesn't wait on a
   * skin.json round trip. skin.json is still read on every load; if it names another version
   * (the theme was updated), that build swaps in once the first one has started, as live reload
   * does. First visit: wait for skin.json, as before.
   */
  const VERSION_KEY = 'se-theme-version';
  let seen = null;
  try {
    seen = localStorage.getItem(VERSION_KEY);
  } catch {}
  const remember = (version) => {
    try {
      if (version) localStorage.setItem(VERSION_KEY, version);
    } catch {}
  };
  // The first build's loader has run start() (its site global exists), or 5 s have passed
  const started = (since = performance.now()) =>
    new Promise((resolve) => {
      const check = () =>
        window[site.global] || performance.now() - since > 5000 ? resolve() : setTimeout(check, 50);
      check();
    });

  if (seen) {
    current = seen;
    load(seen);
  }
  readVersion()
    .then(
      (version) => {
        remember(version);
        if (!seen) {
          current = version;
          load(version);
        } else if (version && version !== seen) {
          started().then(() => swap(version));
        }
      },
      () => {
        if (!seen) load(null);
      }
    )
    .finally(startLiveReload);
})();

/*
 * Element picker (dev/inspector.js), a theming aid: Ctrl+Shift+E in any Steam window or
 * web page. Loaded only on the first press, so it costs nothing until then.
 */
(() => {
  if (window.__seInspectorHotkey) return;
  window.__seInspectorHotkey = true;
  const coreSrc = document.currentScript?.src ||
    [...document.scripts].find((script) => /\/core\/core\.js(?:[?#]|$)/.test(script.src))?.src;
  addEventListener(
    'keydown',
    (event) => {
      if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey || event.code !== 'KeyE') return;
      event.preventDefault();
      event.stopPropagation();
      if (window.__seInspector) {
        window.__seInspector.toggle();
        return;
      }
      if (!coreSrc) {
        console.warn('[Steam Enhanced] Element picker: theme folder not found from this window.');
        return;
      }
      const script = document.createElement('script');
      const url = new URL('../dev/inspector.js', coreSrc);
      url.searchParams.set('v', String(Date.now()));
      script.src = url.href;
      (document.head ?? document.documentElement).append(script);
    },
    true
  );
})();

/* Shared runtime utilities, React fiber helpers, and CSS module class map. */
(() => {
  if (window.__se) return;

  /* @classmap:start */
  const C = {
    AccountMenu: '_3yD46y5pd3zOGR7CzKs0mC',
    AchievementContent_TopSection: 'fi6UDkxJq66MLo2z9wabQ',
    AchievementCountLabel: '_2muiKHUkOiTvX-6arqnQUC',
    AchievementIconWrapper: '_1fEbX-PfpZ2FhkhttWcm-V',
    AchievementsOverlayContainer_Container: '_3xRRJfD2xy95i9NhJxLTp0',
    AchievementsTable: '_1BnbXfdEvRubouJucJRU7z',
    ActionSection: 'RoSh6WoygUX6LLAoB20f3',
    ActiveItemLiveRegion_Button: '_3oavRVhIS9tC3vBsFT4Ggi',
    ActiveItemLiveRegion_Name: '_35eOQ6EeVHNV5HGBrJ1-Vu',
    ActiveScreenshot: '_290DqV3rdr3Mjn-Nfyv4My',
    ActivityAchievementUnlocked: 'yJLy7HDLJT44C1fcm6lPI',
    ActivityCommentThread: '_39nnaT_CLE0m_WXVIrAwaG',
    ActivityCommentThreadMinimized: 'EhWKRN0QCGwfB7zcx7DwQ',
    ActivityCommentThreadMinimized_RatingContainer: '_3KynfhyRTjRbiUVeqUdUBJ',
    AddGameButton: '_2foCkpRXhqq0UGVE50BWqj',
    AddReply: '_2Yybx8PCzkzdKoaf-yf0TH',
    AddShowcase: '_2aw5aUUo3lrK6wxJb4_ms5',
    AddShowcaseRow: '_3SkuN_ykQuWGF94fclHdhJ',
    AdvancedSearchButton: '_1TxHdzOt3OD9ikR3xIseKe',
    AdvancedSearchContainer: 'vCCmYvn9yQ_V8CpKupllU',
    AdvancedSearchPane: 'Woh0kBQCmatzC1daBX9i6',
    AdvancedSearchPaneContainer: '_1dgAMymUAUYzUcZjUjOFm7',
    AnnouncementsButton: '_5wILZhsLODVwGfcJ0hKmJ',
    AppActionSelected: '_1dFOkDnInbUQgf2eUbF2G9',
    AppActivityDay_Active: 'n98drbUHUKTXfcwqFg2WB',
    AppActivityDay_BadgeSection: '_3G7i5g23e7CREVJMvy-uuM',
    AppActivityDay_EmptyCircle: '_3e5oohRG1PHKAKLXpQM18g',
    AppActivityDay_RemainderContainer: '_3rSv3w2J_INq58pcvME5iJ',
    AppButtonsContainer: 'lO1IF132jJ1gc9yz2HYvV',
    AppCount: '_3A3N3EnrSNMQLL058Qbzsn',
    AppDetailsCollapsed: '_3yfoeR7q8sXXS2UyFcIK1K',
    AppDetailsMain: '_2Nq6ov7A1hGcHXVOXNt_OE',
    AppDetailsSection: '_2r4TK4BAuU-J4FuF_O7v_5',
    AppGameInfoContainer: '_25oBZpa3dUcMw8QAsa2u67',
    AppHeader: '_3_uaa39SNrhTAYH7hF9tbE',
    AppIconDownloading_Container: '_2-O4ZG0KrnSrzISHBKctFQ',
    AppIconDownloading_Running: '_10GdoB3tQXXGFToQ3yY_SK',
    AppIconDownloading_Selected: '_1UBpAXP408Ez_L_mXhW5Q9',
    AppIconDownloading_Updating: '_1LVQp3h_vGOZ8TuDUEge0k',
    AppPortrait: '_2pjdgFqp04LlhgtFS0rQn_',
    AppProperties: '_1FyBL6obxHQ2Z2CsaV2Gbz',
    ArrowWrapper_GameIconAndName: '_3_xMyCJAh_Dv99KgZ54P3j',
    AssetWrapper: '_1eMH32d87AouZB0uhgsXtx',
    Association: '_-9icu8LqT7inRSJISgnkh',
    Autofocused_Label: '_3a973VY2X3US_cZqA9ZgNF',
    Background: '_2CCdODv0vfzOMrEBUzZwfI',
    BackToGameBtn: 'mh8m9p4PBg_Qrev1bfTzc',
    BadgeMaxed: '_2JMEE2dz_3JMJg5pNiinj5',
    BasicHomeUpdates_EventTime: '_1xu4iu0Qa3cGcIr-rZAsVb',
    BasicHomeUpdates_GameIconAndName: '_2hemZcvJgBSV9YvlToW1Zv',
    BasicUI: 'fqntpaymdveMMSFkyHYNz',
    BetasTable: '_3jWpi0kJp_piNEvdMufMmy',
    Body: '_5uvIN6jXDXzzck59F-nhv',
    Bottom: '_1r3ouwFT2-tsTAcnXYZ6NU',
    BranchBar_TitleBarControls: '_3cykd-VfN_xBxf3Qxriccm',
    BrowseDiskRow: 'vgVsCDEci0IK6JY9IrT9w',
    BrowseDiskSize: 'b5YdRXAobg5HWhcfAlIeZ',
    BuildInfo: 't4XYbyKAM5Yz-nmWNHSLB',
    Button: '_2Szzh5sKyGgnLUR870zbDE',
    ButtonWrapper: '_2ZfashhZu6uE9fCwyPS9mJ',
    CanClick: '_3Mds9UG-5yRsWUclIV_Y9q',
    CarouselThumb: '_1Lot-TP3cPLuTO6bGZm8up',
    ChatTab: '_2XZq-_f6npaQdAgeRzKIkz',
    ChatTab_Active: 'Yd-DsWkYiFiYwpci--Yk_',
    ChatTabContent_ChatRoomName: '_1HNpQBKKKQ1tG2OZH3CSsh',
    chatTextarea: '_113iuw_HlE_qSgt9cGWCSv',
    CheckboxWithImage: '_3mzKdQXht__YHo6PX1LmB6',
    ChildrenContainer: '_1VMQWnw-9FBp-MVXUbWfS_',
    Collection: '_3IWn-2rn7x98o5fDd0rAxb',
    CollectionLabel: '_1J1LQ0vGtpM3n0xw7XwQM6',
    ColumnContainer: 'OhSdLYuggDtBcWjYP0j_9',
    ColumnContainer_Container: '_27RcNu8aXKBpYkHcNNrt-X',
    ComingSoonIcon: '_1pvlnhvtB1Th8xS9GzDjvt',
    Comment: '_515RL2DZmyqkYq3yOP_m7',
    CommentButton: '_3i62HEXIhsNTd5-Z4uL3K',
    CommunityContentContainer: 'A6G1leLXs7Vqw45hoXg-l',
    CompactThumbButton: '_35_OgqfHHZfSzTYfv367K6',
    Completed: 'Zh51LA1WZNKTkf1qlZabn',
    ConciseContainer_Container: '_2jPMy2QZr8bWi6yrk5ZzHA',
    ConciseContainer_Name: '_2j8Xh4pPOOgF4MF6FVUI28',
    ContainerHide_Container: '_20QAC4WMXm8qFE8waUT5oo',
    ContentType: 'Rgy-7t7i1Yv97qhWQae7K',
    ContentTypes: '_1IKbaHLvcciS-EMMYx1WVG',
    contextMenuItem: '_1n7Wloe5jZ6fSuvV18NNWI',
    ControllerConfigButton: '_1oYt_BfxCHnA-_6sfUHiNn',
    ControllerSectionBody: 'bG5F-o9ZUikaoNCIniMEa',
    ControllerSupportSectionHeader: '_2L06P_EWxoS_20kC2eNCQl',
    Count: '_1CGnw50aAma6AYKF51Qzsm',
    CurrentUserProfileBackground_AvatarAndLabel: 'lqhIkQ_wpSeJd6Y8bYFCo',
    Desc: '_2gLHbXukQBdrIKhqEYVvOe',
    DetailsAndType: 'Bku7JSkuQ7NyWi6M4w1sl',
    Disabled: 'aIeh3X5T2M074RLW1qn6_',
    Disk: 'HifZB5TP6WNuubp1dzyxS',
    DiskGraph_Button: '_3Tfp8-wTAttW3WVa_X9JVC',
    DlcGrid: '_3sXdOJ9DEh5zdS54_ptwgW',
    DlcTopRow: 'ZII4C3WPvs65P3yvAtV69',
    DotDotDot: 'zvLq1GUCH3yLuqv_TXBJ1',
    Down: '_32G01cdyGED_NiCadEgWAL',
    DownloadGraphWrapper: '_3GBFL10vEfhI28U95WaqMj',
    DownloadProgress: '_3uk3F1BmAJQR6rl1TPcaif',
    DownloadSectionActiveItem: '_2sCvZTD6ZTZz3p9_ekH_gI',
    DownloadsPage: '_1bq4x9pa4-9RLY-dXWUZTp',
    DownloadStatusContent: 'ip-YZhijAMZcuRoXBGiye',
    DownloadTimeRemaining: '_3nx-k9xXUVgejG1BIAc84r',
    DragInProgress_SortingDropDown: '_30PVtUudUBJBzac0vEncl_',
    DriveDropdownControl: '_18pPl6a2EhE7NRoba3yw7L',
    DriveUsage: '_1LvKJs5FKB30xbur_XL2DL',
    DropDown: 'EDl_mzaY3WxkgmYVD8W4d',
    EmoticonButton: 'bACIuqv-b_9TztCczFK19',
    EmptyDate_AddedDate: '_1ANYFgwMyPpwJjIndAdGSr',
    EntryLabel_AvatarAndLabel: '_2SLehb0Hvx-jWmuv0gPqB-',
    Event: 'UVeN0kaD3zv1feMj_mMw5',
    EventActorAvatar: '_1gVy5n_zNp3tXpwU2aV9k8',
    EventBody: 'NEMXhMlqXOCJwfgWlHXhT',
    EventHeadline: 'QCKBqF2k_sRLcXJ5qQIEl',
    EventImageWrapper: '_3Yd9bnm5cESPzqV_j5-WJt',
    EventRowCarousel: '_11cYvnWDwOeGdlUpfGNlYt',
    FakeContainer: '_3Vl2zkYPoCpw1q_1n28D3z',
    FavoriteButton: '_21hXW2oDD7zvNsoOaW7Yob',
    Featured: '_1j_gja8bHXjiS-BeSQk8hb',
    Featured_Name: '_39Y01uSRcLiDg5DneTTR0m',
    Featured_RemainderContainer: 'lZ2c49vTWJ60klQOY9l2K',
    FeaturedCapsule: 'xp7A-08Y404Of3FBHqX32',
    Field: 'eKmEXJCm_lgme24Fp_HWt',
    FieldIcon: '_2DM37juowId1V_DScp3l4',
    FieldLabel: '_3jMlJm4PQCA8SfNlUR99Fo',
    FieldLeftColumn: '_2tALpM7z8naXJ35Pp5fNAG',
    Figure: 'eXF8xL2LUtzeWMbK-FSRz',
    FocusNavigationRoot_TitleBarControls: '_1-9sir4j_KQiMqdkZjQN0u',
    FriendIsPlaying: 'cNZ3wORgnf1KSNhI2eE2M',
    FriendsButton: '_1TdaAqMFadi0UTqilrkelR',
    FriendsSection_AvatarAndLabel: '_1GCZAht_W2I3Elndk5cU0-',
    GameInfoButton: '_2v1XDHrL4pTW4qCXaYUPG6',
    GameListEntryContainer: '_1vO6BoiVslZgs1kqDGdUs8',
    GameListEntryName: '_2SXJM0PeFEi3gbC7V3S5pE',
    GameListHomeAndSearch_Container: '_3x1HklzyDs4TEjACrRO2tB',
    GamepadUIToggle: '_3LKQ3S_yqrebeNLF6aeiog',
    GameStat: '_1kiZKVbDe-9Ikootk57kpA',
    GameStatsSection: '_1mDAVT4sTzFRwJtlKCw2Ws',
    GraphBarDownload: 'OS07NfYlp6v-Eh5oQ7dwn',
    GraphBarWrapper: 'gpPxCvNVctmdxo8yfyEAJ',
    GraphLine: '_3H2JWLH8rucdSC1XVZ7Xdk',
    GridWithControls: 'rz1mrOnj9WN6UErES7qsq',
    Header: '_1RUoX0kTOBfqpwCaBZGDLJ',
    HeaderImage: '_2NqL3nV35eJFAu56_Yu-WM',
    HiddenLabel_AchievementIconWrapper: '_1DmdUWkRKPlUYGtbBrrRtx',
    HighlightDiv: '_2xTb6N-jUUQ-mIkMB6OVMm',
    HomeBox: '_3AhYljPF4e4E8LaBt-FoY0',
    HoverOverlay_Container: '_2sYIghGVXJr6tsQVvcryy8',
    Icon: '_34bQcTHo5QKzuujoEyU1tm',
    IconRow: '_1rvHQ_ELBAWYmrssg3iNZE',
    InCollection: '_3ANruIVwRSgaU7L1eWRnf8',
    InGame: 'X40qiCKsKLskkN1pEsNNT',
    InnerContainer: '_37mmOlZM_8n5yJAG5CHiW7',
    InnerContainerLower_BadgeSection: '_3g3jmTgyAQZeyo10abbOmV',
    InnerContainerLower_EmptyCircle: '_2feGA5T49Nk1_dTnwfOnL',
    InPage: '_1U7LKpx70kEsz3jJwAFOi-',
    ItemLists: '_1ugNiylO2vKXhirsGocAxa',
    ItemWrapper: '_2H_ytAwp5tfeou0kdWjLl4',
    Label: '_1vYL2q-91QLy-FBzntE7E5',
    Landscape: '_3VOR2AeYATx3qSE0I-Pm-5',
    LeftColumn: '_1sZgBDTw5NH-yuVDZK1SUU',
    LeftListSizableContainer: '_9sPoVBFyE_vE87mnZJ5aB',
    LegendText: '_1iulCOMUxV6sBbqoKo_yXw',
    LibraryImageBackgroundGlow_SortingDropDown: '_1tBzypb5E2AwNuBuVns9Hl',
    LibraryItemActionButton: '_3AjoLnMNKxYmNTGTJCLfgs',
    LibraryItemBox: 'WYgDg9NyCcMIVuMyZ_NBC',
    LibraryItemBoxSubscript: '_1LJqx_qFOC8199RBQO5kU8',
    LikeButton: '_161IKq84RwQO4abJSCqv7q',
    LocalContentContainer: 'RGNMWtyj73_-WdhflrmuY',
    Login: 'VZ6x_grhNkIYJG__jEEyp',
    LoginAnimatedBackground: '_3MJTdOkAxu5hiJ565avrpz',
    LoginStatusContainer: '_1TR3CCCdSmI-0MXucYBuP2',
    MakeCommentsVisible: 'FPxfNOUIyMTxA5iyxVWGX',
    MCGreen: '_1KR40mXc7Z4Dss99aBDbyN',
    MCOrange: '_1H3NRDhuiZh5xH5jZsiI38',
    MCRed: '_3lWVD8RYypVvbk60T5Vqcs',
    MenuButtonContainer: '_3oddBTkj_FjknCgBnPqcmQ',
    MenuHeader: '_2PF_m-I5yte3WnQhpcz8RC',
    Message_AddedDate: '_1NfcbH4-VtKb4Li2YePACD',
    MicrophoneTest: '_2Dptk9e7W_k4zYB5wfRTcp',
    MiniAchievements: 'UAhWiMg9Q2VPsQQBj_ikT',
    NewCollection: '_2_dwxMdH27kBf-gQ3Wrk7z',
    NewUpdates_EventTime: '_2rlKqvybYupc-uk64cdQ8D',
    NoBottomGap: 'kSXF93bSHe9G2fC96Bf8X',
    NotificationMenuItem: '_3zfQA8bEKpisPtsyT4SovP',
    NotificationsButton: 'RtSv39ZoBOySnb8XQ5hJf',
    NotificationSectionHeader: '_2zGUtyw-lRSsEUPY1qaqf7',
    NotificationsMenu: '_1UgM1Pm8SbTWX7_2f-crGt',
    On: 'yLrDAetGoWx0GYqA6ShfS',
    OuterContainer_Container: '_2q70uOe6xM3-c5XIVfBLe6',
    OuterContainer_Header: '_2rqTSCLSSEycEiuCS_OkpX',
    PagedSettingsDialog_Active: '_2DpXjzK3WWsOtUWUrcuOG7',
    PagedSettingsDialog_PageContent: 'CFTLX2wIKOK3hNV-fS7_V',
    PagedSettingsDialog_PageList: '_18QCu-7MTzd51UpVbYysDy',
    PagedSettingsDialog_PageListItem: '_1-vlriAtKYDViAEunue4VO',
    PagedSettingsDialog_Title: '_2rjVTGz8aLvqOdz5v2gq5C',
    PageListItem_Title: '_2PPbMrzl8PKBwpkjYs9b0i',
    PageListSeparator: '_1Hye7o1wYIfc9TE9QKRW4T',
    PartnerEventRowCapsule: '_3YO5BpDmZERh_G8kaWbaSJ',
    PartnerEventRowCapsule_MainImageContainer: 'SPz0ipLqfF1oAO7tdrkdY',
    PinnedBody: 'h-lNlCUnCRbIcn38-Oqaw',
    PinnedTemplateDesktop: '_3k90ug209sE23xAMqcM74s',
    PlayBar_MenuButton: '_3qDWQGB0rtwM3qpXTb11Q-',
    PlayBar_Playtime: '_1aKegVl9_lSdNAyWYZQlr9',
    PlayBarDetailLabel: '_2TYVGoD27ZMfjRirKQNLfk',
    PlayBarLabel: '_34lrt5-Fc3usZU6trA1P0-',
    PlayButton: 'sQZ70orTPi-ELUlaS-ywR',
    playerName: 'nOdcT-MoOaXGePXLyPe0H',
    PlayNextCarouselSubHeading: '_2VByWZ91DPPVmK_PDiHEmq',
    PlayNextSubHead: '_1kdinbVqPuXSbJRQa_pAuw',
    PostTextEntry: '_3x31AgESSlUqX3D4MTHv2m',
    PrimaryAchievement: '_26QliGU0MSP6WN4r-RtI5q',
    PrivacyDLCSection: '_3S8RX620BmLdH407KK505',
    ProgressBar: '_1vMU1vG5ZtLihr3mfXUymR',
    RatingBar: '_1yWgPveQ73QeYCdLcs6oFQ',
    Reactions: '_35yrbgVC5TQttl8IPVlKQB',
    Recent: 'xlk1bGKnsOI8mxsguNaXr',
    RecentGame: '_1esfEVxhqNfh8fzr_kEGKa',
    RecommendGame: 'My1beniJXh9pXud8rxYLK',
    RecordingModeOption: '_7EGqd8bdiXJBd2fj5Hh8r',
    RemoveFromQueue: '_2xR-V97DWI7svSjgiCb3N-',
    Reordering: '_2Ho8z58cxQIJljp55uGkdt',
    ReviewContainer: '_3LE-6w1ItIAB4CKJFCa3Od',
    ReviewThumbButton: '_1kCN0pAntrcGCSmcc-vYdk',
    RightColumn: '_2aor4XVOYzN1PBSREk0UbO',
    RightControls: '_1EAxK56o5a9Nieu5HYkJ4k',
    RootMenuBar: '_3s0lkohH8wU2do0K1il28Y',
    RootMenuButton: '_2UyOBeiSdBayaFdRa39N2O',
    Row: '_1BAKXmqQdWRWmWX9_CbhuY',
    ScreenshotCarousel: '_1pdQdoLxwmuMZpXXNHI2Uo',
    ScrollContainer: 'u1xD3KJEgksF_J_5TLZzO',
    ScrollContainer_Header: '_2Th-vimU76KOpmdy45yu52',
    ScrollToTopButton: '_1J21tLst5SEhBPkVRT53UV',
    ScrollToTopButtonPosition: 'sG1Gf1SWuzJQ8dxDWU6DT',
    Section: '_3Mbhnlk1Go2j8yCdjthzc7',
    SectionCount: '_29uten9Yy8q-n7woDEOXVF',
    SectionHeader: '_1Q2q_tQ9_Eq8YdEHNAHS3F',
    SectionItem: '_1VNuYHM6BPBOJspC6zPf5r',
    SectionItemWrapper: '_21P7c4MWmsU2QSZeL-uyZo',
    SectionTitle: 'qq2xItSXjpCsNrcxyPJtO',
    SectionTopLine: 'r3hOLjghfVd2FkvKjlsrO',
    SeekTarget: 'vzLedtsu3TtTlKLEKzIhH',
    Selected: '_1gqEjB5QsKT_NftD1dEsdZ',
    SettingsButton: 'lzk4zNVWG2zPV5Mk_o5GL',
    SettingsDialogBodyText: '_1RCWDLVLFja1TdD1P53BMq',
    SettingsDialogDescriptionText: '_3w92Ej5Kq7nbt5WACQ6jwI',
    SettingsDialogSubHeader: '_2rK4YqGvSzXLj1bPZL8xMJ',
    Showcase: 'V7RuDNUxhxoBRaiGWbk3B',
    ShowcaseHeader: '_23SnllqT_AqZ1C_QHcNQ4Z',
    ShowGameLogo: '_3KwfoP3QLtY80hx0gtZBZ4',
    SingleStat: '_26UBk-6weCeV-VClfXNWJZ',
    SpinnerLoaderContainer: '_3CN5DkgNMvdtT9fJhNOj_v',
    State: '_2ns4wnmgr4XBzARpwn2NZ1',
    StatusIcon: '_2-J2nMJ1zmDok8-jqXlf1e',
    SteamChina: '_3CERUTDGnY-gTdzXj_vKEW',
    SteamCloudUsage: '_2Dfy8vuNMdABIKGO2KHbVF',
    SteamInputStatusGrid: '_3lj3-GDYOlcoIFB3fFo1ko',
    Subheader: '_2dugqZ0TI7OxPPLsqpzvaQ',
    Subsection: '_39bm0CkBxBjJsnPpAzoZlv',
    SubsectionHeader: 'nTb1NqsRSnwl0UTOYn_JA',
    SuperNav: '_2D64jIEK7wpUR_NlObDW76',
    SuperNav_MenuButton: '_19axKcqYRuaJ8vdYKYmtTQ',
    SuperNavBar: '_3Z3ohQ8-1NKnCZkbS6fvy',
    SuperNavMenu: '_7AlhCx3XGzBeIrQaCneUD',
    TextToolTip: '_2FxbHJzYoH024ko7zqcJOf',
    TimeStamp: '_3ljAdVsP0faRHBhKgvOybK',
    TimeStats: 'vCykYvbW9JAoUuOZK3L8M',
    Title: '_1wqvBi2kzs_fhdUKaWBZUW',
    Toggle: '_9Ql-oVe_j8E-vsDdyVdWo',
    Toggles: '_27r3CjIYhU20TsukVgm25C',
    ToolTipCustom: '_3XGRklQrZMakU2xaYB0cLD',
    TopBar: '_3Z7VQ1IMk4E3HsHvrkLNgo',
    TopSection: '_373v1eWNyaPKhgnea9FZSt',
    TopSectionMiddle: 'iu7jaxFxWk1sYge_kwKmz',
    TrySteamFamiliesButtonContainer: 'WIVHxIb79kMHNG7iA_Q9H',
    UnachievedSection: '_3ca11X3AK6npLS3emMa5Lr',
    UninstalledIcon: '_8YrRmy_c6O0FCxFT8gjqo',
    UnlockedLabel: '_3jC8om-5Sci_dkUB-6VYiU',
    Up: '_2DXZFTajHVRmKt3QsZzKY3',
    UpdatesContainer: '_17uEBe5Ri8TMsnfELvs8-N',
    UserChooser: '_27A5ub1QLLIMmgywKVMg4z',
    ViewLastNews: '_1EC1xjjUGqI7fqX6PVzJA3',
    ViewName: '_3kSh7qVSTDcPDePx9kya8C',
    WhatsNewHeaderText: 'fyxt0H7Cwfirf9908slPp',
    WorkshopItemRow: 'pht3SaejGcAJEjNG8d6nd',
    WorkshopItemsRowsScrollable: '_3ZhiKhciPyiGGxDFuGOYpc',
    WorkshopTopRow: '_3Oi_Xmyy8um3Ta4VoOH35b',
    WriteReviewContainer_Playtime: 'qX4kNo6O0M-mYntdErKSJ',
    WriteReviewContainer_RatingContainer: '_2SAb6geDpe6toA1GaP0GjH',
  };
  /* @classmap:end */

  const run = (fn, ...args) => {
    try {
      return fn(...args);
    } catch {
      return undefined;
    }
  };

  // Cache the React expando suffix after the first hit to avoid Object.keys() on hot paths.
  let fiberKeyHint = '';
  let propsKeyHint = '';

  const fiberKey = (el) => {
    if (!el) return undefined;
    if (fiberKeyHint && el[fiberKeyHint] !== undefined) return fiberKeyHint;
    const key = Object.keys(el).find(
      k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
    );
    if (key) fiberKeyHint = key;
    return key;
  };

  const fiber = (el) => {
    const key = fiberKey(el);
    return key ? el[key] : null;
  };

  const liveFiber = (target) => {
    const nodeFiber = target && (target.nodeType ? fiber(target) : target);
    if (!nodeFiber) return null;
    let rootFiber = nodeFiber;
    while (rootFiber.return) rootFiber = rootFiber.return;
    const root = rootFiber.stateNode;
    return root?.current && root.current !== rootFiber && nodeFiber.alternate
      ? nodeFiber.alternate
      : nodeFiber;
  };

  const props = (el) => {
    if (!el) return null;
    if (propsKeyHint && el[propsKeyHint] !== undefined) return el[propsKeyHint];
    const key = Object.keys(el).find(
      k => k.startsWith('__reactProps$') || k.startsWith('__reactEventHandlers$')
    );
    if (key) propsKeyHint = key;
    return key ? el[key] : null;
  };

  const fromProps = (el, maxDepth, selector) => {
    for (let cur = fiber(el), depth = 0; cur && depth < maxDepth; cur = cur.return, depth++) {
      const memoized = cur.memoizedProps;
      if (!memoized || typeof memoized !== 'object') continue;
      const val = selector(memoized);
      if (val !== undefined && val !== null) return val;
    }
    return undefined;
  };

  const findDown = (el, predicate, limit = 600) => {
    const start = fiber(el);
    const stack = start ? [start.child] : [];
    let visited = 0;
    while (stack.length && visited++ < limit) {
      const cur = stack.pop();
      if (!cur) continue;
      const memoized = cur.memoizedProps;
      if (memoized && typeof memoized === 'object' && predicate(memoized)) return memoized;
      if (cur.sibling) stack.push(cur.sibling);
      if (cur.child) stack.push(cur.child);
    }
    return null;
  };

  const owners = () => {
    const wins = new Set([window]);
    for (const win of wins) {
      for (const rel of ['opener', 'parent']) {
        try {
          if (win[rel]) wins.add(win[rel]);
        } catch {}
      }
    }
    return wins;
  };

  const mainWindow = () => {
    for (const win of owners()) {
      try {
        const instance = win.SteamUIStore?.WindowStore?.MainWindowInstance;
        if (instance) return instance;
      } catch {}
    }
    return null;
  };

  const navigate = (route) => {
    const main = mainWindow();
    if (main && typeof main.Navigate === 'function') {
      try {
        main.Navigate(route);
        return true;
      } catch {}
    }
    return false;
  };

  const requireCache = new WeakMap();

  // webpack's require() for every bundle reachable from this window. A chunk array is only
  // probed once webpack has hooked its push, so no junk entries pile up before the runtime loads.
  const requires = () => {
    const list = [];
    for (const win of owners()) {
      let names;
      try {
        names = Object.getOwnPropertyNames(win).filter(k => k.startsWith('webpackChunk'));
      } catch {
        continue;
      }
      for (const globalName of names) {
        const chunks = win[globalName];
        if (!Array.isArray(chunks)) continue;
        let req = requireCache.get(chunks);
        if (!req && chunks.push !== Array.prototype.push) {
          chunks.push([['se-core-' + Math.random().toString(36).slice(2)], {}, (r) => { req = r; }]);
          if (req) requireCache.set(chunks, req);
        }
        if (req && !list.includes(req)) list.push(req);
      }
    }
    return list;
  };

  /*
   * Scans webpack module sources once per key. `test(src, id, req)` returns the wanted value
   * (or anything falsy to keep looking). Hits are kept for good; misses are remembered for
   * `retry` ms, so a hot path that asks every frame costs one scan per window, not one per call.
   */
  const moduleCache = new Map();
  const findModule = (key, test, { retry = 30000 } = {}) => {
    const cached = moduleCache.get(key);
    if (cached && (cached.hit || performance.now() < cached.until)) return cached.value;
    let value = null;
    let scanned = 0;
    outer: for (const req of requires()) {
      for (const id of Object.keys(req.m || {})) {
        scanned++;
        let src;
        try {
          src = Function.prototype.toString.call(req.m[id]);
        } catch {
          continue;
        }
        try {
          value = test(src, id, req) || null;
        } catch {
          value = null;
        }
        if (value) break outer;
      }
    }
    // Nothing to scan yet (webpack not hooked): don't remember that as a miss.
    if (scanned) moduleCache.set(key, { value, hit: !!value, until: performance.now() + retry });
    return value;
  };

  // The first truthy `name` global across this window and its opener/parent chain.
  const global = (name, test) => {
    for (const win of owners()) {
      try {
        const value = win[name];
        if (value && (!test || test(value))) return value;
      } catch {}
    }
    return null;
  };

  // Sets a custom property only when it changes (no style invalidation for a no-op write).
  const cssVar = (el, name, value) => {
    if (!el) return;
    if (value == null || value === '') {
      if (el.style.getPropertyValue(name)) el.style.removeProperty(name);
    } else if (el.style.getPropertyValue(name) !== String(value)) {
      el.style.setProperty(name, String(value));
    }
  };

  const railMode = () => !!document.body?.classList.contains('se-header-actions-ready');

  const mark = (el, name, value = '') => {
    if (el && el.getAttribute(name) !== value) el.setAttribute(name, value);
  };

  const unmark = (el, name) => {
    if (el && el.hasAttribute(name)) el.removeAttribute(name);
  };

  const attr = (el, name, value) => {
    if (!el) return;
    if (value == null || value === false) unmark(el, name);
    else mark(el, name, String(value));
  };

  // A theme element: tag, optional class, optional text.
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  // Writes text only when it differs: a rewrite swaps the text node out from under the pointer.
  const setText = (node, value) => {
    if (node && node.textContent !== value) node.textContent = value;
  };

  /*
   * Inline SVG icons from a name -> markup map (24-unit viewBox):
   *   const { icon, setIcon } = SE.icons(ICONS, 'info');
   * icon(name, className?) makes one; setIcon(svg, name) swaps an icon in place. `fallback`
   * names the icon used for an unknown name.
   */
  const icons = (map, fallback) => {
    const markup = (name) => map[name] ?? (fallback ? map[fallback] : '') ?? '';
    return {
      icon(name, className) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');
        if (className) svg.setAttribute('class', className);
        svg.dataset.icon = name;
        svg.innerHTML = markup(name);
        return svg;
      },
      setIcon(svg, name) {
        if (svg.dataset.icon === name) return;
        svg.dataset.icon = name;
        svg.innerHTML = markup(name);
      },
    };
  };

  const HTML_ENTITIES = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch]);

  const isInstalled = (app) => {
    try {
      return !!app.per_client_data && [...app.per_client_data].some(client => client.installed);
    } catch {
      return !!app?.installed;
    }
  };

  const resolveAppStore = () => global('appStore');

  const coverURLs = (app, store) => {
    const appStore = store || resolveAppStore();
    const urls = [];
    const push = (val) => {
      if (Array.isArray(val)) urls.push(...val.filter(Boolean));
      else if (typeof val === 'string' && val) urls.push(val);
    };
    if (appStore && app) {
      if (app.rt_custom_image_mtime) push(run(() => appStore.GetCustomVerticalCapsuleURLs(app)));
      push(run(() => appStore.GetCachedVerticalCapsuleURL(app)));
      push(run(() => appStore.GetVerticalCapsuleURLForApp(app)));
    }
    if (app?.appid) {
      urls.push(
        `/assets/${app.appid}/library_600x900.jpg`,
        `https://shared.steamstatic.com/store_item_assets/steam/apps/${app.appid}/library_600x900.jpg`
      );
    }
    return [...new Set(urls)];
  };

  // Hero art for an app: the user's custom hero, the local copy, then the CDN (header as a last resort).
  const heroURLs = (appid, store) => {
    if (!appid) return [];
    const appStore = store || resolveAppStore();
    const app = appStore && run(() => appStore.GetAppOverviewByAppID(Number(appid)));
    const cdn = `https://shared.steamstatic.com/store_item_assets/steam/apps/${appid}`;
    const urls = [];
    if (app?.rt_custom_image_mtime) {
      const custom = run(() => appStore.GetCustomHeroImageURLs(app));
      if (Array.isArray(custom)) urls.push(...custom.filter(Boolean));
    }
    urls.push(
      `/assets/${appid}/library_hero.jpg`,
      `${cdn}/library_hero.jpg`,
      `/assets/${appid}/header.jpg`,
      `${cdn}/header.jpg`
    );
    return [...new Set(urls)];
  };

  // Achievement rarity tiers by global unlock rate (% of players). Colors: --se-tier-* in tokens.css.
  const TIERS = Object.freeze([
    Object.freeze({ id: 'legendary', name: 'Legendary', max: 5, rank: 5 }),
    Object.freeze({ id: 'epic', name: 'Epic', max: 15, rank: 4 }),
    Object.freeze({ id: 'rare', name: 'Rare', max: 35, rank: 3 }),
    Object.freeze({ id: 'uncommon', name: 'Uncommon', max: 60, rank: 2 }),
    Object.freeze({ id: 'common', name: 'Common', max: Infinity, rank: 1 }),
  ]);
  const tierOf = (pct) => (typeof pct === 'number' && Number.isFinite(pct) ? TIERS.find(t => pct <= t.max) : null);
  const fmtPct = (pct) => (pct > 0 && pct < 0.1 ? '<0.1' : pct.toFixed(1));
  // The layer over a tiered icon (styles: core/achievement-tiers.css): one sparkle
  // per tier rank when unlocked, and the tier's initial so it reads without color.
  const tierFx = (tier, locked) => {
    const fx = document.createElement('span');
    fx.className = 'se-ach-fx';
    fx.setAttribute('aria-hidden', 'true');
    if (!locked) {
      for (let i = 0; i < tier.rank; i++) fx.appendChild(document.createElement('i')).className = 'se-ach-spark';
    }
    fx.appendChild(document.createElement('b')).textContent = tier.name[0];
    return fx;
  };
  const rarity = Object.freeze({ TIERS, tierOf, fmtPct, fx: tierFx });

  // Multiplexed document.body MutationObserver shared across feature modules.
  // Filters out no-op attribute/characterData writes to prevent observer feedback loops.
  const subscribers = [];
  const pendingSubs = new Set();
  let observer = null;
  let observerConfigKey = '';
  let scheduledFrame = 0;

  const hasRecordChanged = (record) => {
    if (record.type === 'attributes') {
      const target = record.target;
      const current = target.getAttributeNS
        ? target.getAttributeNS(record.attributeNamespace, record.attributeName)
        : null;
      return current !== record.oldValue;
    }
    if (record.type === 'characterData') return record.target.data !== record.oldValue;
    return true;
  };

  // Per-dispatch memo of ignore/scope verdicts, so 20 subscribers sharing SE.inside(SE.SIDE)
  // walk closest() once per record target instead of once each.
  let verdicts = null;
  const verdict = (key, node, test) => {
    if (!verdicts) verdicts = new Map(); // a nested dispatch (takeRecords in a sync sub) cleared it
    let byNode = verdicts.get(key);
    if (!byNode) verdicts.set(key, (byNode = new Map()));
    let result = byNode.get(node);
    if (result === undefined) byNode.set(node, (result = !!run(test, node)));
    return result;
  };

  const relevant = (sub, node) =>
    (!sub.scope || verdict(sub.scope, node, inside(sub.scope))) &&
    !(sub.ignore && verdict(sub.ignore, node, sub.ignore));

  // A scope root that mounts or unmounts is a change for that scope too: its parent, the
  // record's target, sits outside it.
  const touchesScope = (scope, record) => {
    for (const list of [record.addedNodes, record.removedNodes]) {
      for (const node of list) {
        if (node.nodeType === 1 && (node.matches(scope) || node.querySelector(scope))) return true;
      }
    }
    return false;
  };

  const matchesSubscriber = (sub, record) => {
    const typeMatches =
      record.type === 'childList' ||
      (record.type === 'attributes'
        ? sub.attributes.includes(record.attributeName)
        : sub.characterData);
    if (!typeMatches) return false;
    if (relevant(sub, record.target)) return true;
    return !!sub.scope && record.type === 'childList' && !(sub.ignore && verdict(sub.ignore, record.target, sub.ignore)) &&
      touchesScope(sub.scope, record);
  };

  const invokeSubscriber = (sub) => {
    sub.last = performance.now();
    try {
      sub.fn();
    } catch (err) {
      console.warn('[Steam Enhanced]', err);
    }
  };

  const flushFrame = () => {
    scheduledFrame = 0;
    const due = subscribers.filter(sub => pendingSubs.has(sub));
    pendingSubs.clear();
    for (const sub of due) invokeSubscriber(sub);
  };

  const enqueueSubscriber = (sub) => {
    if (sub.throttle) {
      if (sub.timer) return;
      const remaining = sub.last + sub.throttle - performance.now();
      if (remaining > 0) {
        sub.timer = setTimeout(() => {
          sub.timer = 0;
          enqueueSubscriber(sub);
        }, remaining);
        return;
      }
    }
    pendingSubs.add(sub);
    if (!scheduledFrame) scheduledFrame = requestAnimationFrame(flushFrame);
  };

  const dispatchRecords = (records, excludedSub) => {
    if (!records.length) return;
    const activeRecords = [];
    const mutatedAttrs = new Set();
    let hasChildList = false;
    let hasCharData = false;

    for (const record of records) {
      if (!hasRecordChanged(record)) continue;
      activeRecords.push(record);
      if (record.type === 'childList') hasChildList = true;
      else if (record.type === 'attributes') mutatedAttrs.add(record.attributeName);
      else hasCharData = true;
    }
    if (!activeRecords.length) return;

    verdicts = new Map();
    for (const sub of subscribers) {
      if (sub === excludedSub) continue;
      const filtered = !!(sub.ignore || sub.scope);
      if (
        !filtered &&
        !hasChildList &&
        !(hasCharData && sub.characterData) &&
        !sub.attributes.some(attrName => mutatedAttrs.has(attrName))
      ) {
        continue;
      }
      if (filtered && !activeRecords.some(record => matchesSubscriber(sub, record))) continue;

      if (sub.records) {
        try {
          sub.fn(activeRecords.filter(record => matchesSubscriber(sub, record)));
        } catch (err) {
          console.warn('[Steam Enhanced]', err);
        }
      } else if (sub.sync && !sub.throttle) {
        invokeSubscriber(sub);
      } else {
        enqueueSubscriber(sub);
      }
    }
    verdicts = null;
  };

  let waitingForBody = false;
  const syncObserver = () => {
    if (!document.body) {
      if (!waitingForBody) {
        waitingForBody = true;
        addEventListener('DOMContentLoaded', () => {
          waitingForBody = false;
          syncObserver();
        }, { once: true });
      }
      return;
    }
    if (!subscribers.length) {
      if (observer) {
        observer.disconnect();
        observer = null;
        observerConfigKey = '';
      }
      return;
    }
    const attrs = [...new Set(subscribers.flatMap(sub => sub.attributes))].sort();
    const watchText = subscribers.some(sub => sub.characterData);
    const key = attrs.join(',') + (watchText ? '|text' : '');
    if (observer && key === observerConfigKey) return;

    if (observer) dispatchRecords(observer.takeRecords());
    else observer = new MutationObserver(records => dispatchRecords(records));

    observerConfigKey = key;
    observer.disconnect();
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      ...(watchText ? { characterData: true, characterDataOldValue: true } : {}),
      ...(attrs.length ? { attributes: true, attributeOldValue: true, attributeFilter: attrs } : {}),
    });
  };

  /*
   * Subscribes to body mutations. Non-sync subscribers are already coalesced into one rAF, so
   * callers don't need their own frame scheduling. Options:
   *   scope       only mutations inside this selector count (cheapest way to stay quiet)
   *   ignore      node => true to skip mutations under that node
   *   attributes  attribute names to watch (each widens the shared observer: keep it short)
   *   characterData, throttle (ms), sync (run inside the observer callback), records (get them)
   */
  const watch = (fn, opts = {}) => {
    const sub = {
      scope: typeof opts.scope === 'string' && opts.scope ? opts.scope : null,
      fn,
      attributes: opts.attributes || [],
      characterData: !!opts.characterData,
      sync: !!opts.sync,
      records: !!opts.records,
      throttle: Math.max(0, Number(opts.throttle) || 0),
      ignore: typeof opts.ignore === 'function' ? opts.ignore : null,
      last: -Infinity,
      timer: 0,
    };
    subscribers.push(sub);
    syncObserver();
    return {
      disconnect() {
        const idx = subscribers.indexOf(sub);
        if (idx < 0) return;
        subscribers.splice(idx, 1);
        pendingSubs.delete(sub);
        if (sub.timer) {
          clearTimeout(sub.timer);
          sub.timer = 0;
        }
        syncObserver();
      },
      takeRecords() {
        if (observer) dispatchRecords(observer.takeRecords(), sub);
        pendingSubs.delete(sub);
        if (sub.timer) {
          clearTimeout(sub.timer);
          sub.timer = 0;
        }
        return [];
      },
    };
  };

  // One predicate per selector, so verdicts are shared between subscribers using the same one.
  const insideCache = new Map();
  const inside = (selector) => {
    let test = insideCache.get(selector);
    if (!test) {
      test = (node) => {
        const el = node?.nodeType === 1 ? node : node?.parentElement;
        return !!el?.closest?.(selector);
      };
      insideCache.set(selector, test);
    }
    return test;
  };

  // High-frequency chrome regions excluded by content-area observers.
  const SIDE = `.${C.TopBar}, .${C.GameListHomeAndSearch_Container}, .se-fdock, .se-fd-fly, .se-fd-menu`;

  const visible = (target) => {
    const nodes = typeof target === 'string' ? document.querySelectorAll(target) : [target];
    return [...nodes].some(
      el => el?.isConnected && !el.closest('[hidden]') && el.getClientRects().length > 0
    );
  };

  const poll = (fn, delay, opts = {}) => {
    const doc = opts.document || document;
    const win = doc.defaultView;
    // While inactive, re-check `active` every 0.5-1.5 s (the old fixed 500 ms ran a layout read
    // twice a second per poll). Watchers call refresh() to wake it sooner.
    const idleInterval = Number(opts.idle) || Math.min(Math.max(delay, 500), 1500);
    let lastWake = 0;
    let timer = null;
    let stopped = false;
    let isActive = false;

    const isDocumentVisible = () => !win?.closed && doc.visibilityState !== 'hidden';

    const tick = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (stopped || !isDocumentVisible()) {
        isActive = false;
        return;
      }
      isActive = !opts.active || !!run(opts.active);
      if (isActive) {
        try {
          fn();
        } catch (err) {
          console.warn('[Steam Enhanced]', err);
        }
      }
      if (!stopped && timer === null) {
        timer = setTimeout(tick, isActive ? delay : idleInterval);
      }
    };

    const wake = () => {
      if (stopped || !isDocumentVisible() || (timer !== null && isActive)) return;
      const now = performance.now();
      if (timer !== null && now - lastWake < 100) return; // resize fires per frame
      lastWake = now;
      tick();
    };

    const wakeEvents = ['resize', 'focus', 'pageshow'];
    doc.addEventListener('visibilitychange', wake);
    for (const type of wakeEvents) win?.addEventListener?.(type, wake);

    if (isDocumentVisible()) {
      isActive = !opts.active || !!run(opts.active);
      timer = setTimeout(tick, isActive ? delay : idleInterval);
    }

    return {
      refresh: wake,
      disconnect() {
        stopped = true;
        if (timer !== null) clearTimeout(timer);
        timer = null;
        doc.removeEventListener('visibilitychange', wake);
        for (const type of wakeEvents) win?.removeEventListener?.(type, wake);
      },
    };
  };

  /* ---------- Small shared helpers ---------- */

  // A labelled try: attempt(fn, fallback) runs fn and, if it throws, warns under `label` and
  // returns `fallback`. One per feature: const attempt = SE.attempt('Install');
  const attempt = (label) => (fn, fallback) => {
    try {
      return fn();
    } catch (err) {
      console.warn(`[Steam Enhanced] ${label}:`, err);
      return fallback;
    }
  };

  // Copies text to the clipboard of `win`: the async API, else a selected textarea (some Steam
  // windows refuse the API). Resolves true once copied.
  const copy = async (text, win = window) => {
    try {
      await win.navigator.clipboard.writeText(text);
      return true;
    } catch {}
    const doc = win.document;
    const area = doc.createElement('textarea');
    area.value = text;
    area.readOnly = true;
    area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;pointer-events:none';
    (doc.body ?? doc.documentElement).append(area);
    area.select();
    let copied = false;
    try {
      copied = doc.execCommand('copy');
    } catch {}
    area.remove();
    return copied;
  };

  // The theme's version, from its own skin.json: fetched once per window. Resolves null if the
  // manifest can't be read.
  const coreSrc =
    document.currentScript?.src ||
    [...document.scripts].find(script => /\/core\/core\.js(?:[?#]|$)/.test(script.src))?.src;
  let versionRequest = null;
  const themeVersion = () =>
    (versionRequest ??= coreSrc
      ? fetch(new URL('../skin.json', coreSrc), { cache: 'no-store' })
          .then(response => response.json())
          .then(skin => (typeof skin?.version === 'string' && skin.version ? skin.version : null))
          .catch(() => null)
      : Promise.resolve(null));

  /*
   * Runs fn at most once per frame while `root`'s subtree changes. Changes on or inside nodes
   * `ignore(node)` claims (the theme's own) don't count. options: attributes (names to watch),
   * characterData. Returns { schedule, disconnect }; schedule() queues a run by hand.
   */
  const onChange = (root, fn, { attributes = null, characterData = false, ignore = null } = {}) => {
    let frame = 0;
    const theirs = (node) => !ignore || !ignore(node);
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          fn();
        });
      }
    };
    const observer = new MutationObserver(records => {
      const changed = records.some(
        record =>
          theirs(record.target) &&
          (record.type !== 'childList' || [...record.addedNodes, ...record.removedNodes].some(theirs))
      );
      if (changed) schedule();
    });
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData,
      ...(attributes ? { attributes: true, attributeFilter: attributes } : {}),
    });
    return {
      schedule,
      disconnect() {
        observer.disconnect();
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
      },
    };
  };

  /*
   * One view per root. find() lists the roots on the page; create(root) builds a view (an object
   * with destroy()) or returns nothing to try that root again on the next scan. Scans run on
   * page changes (SE.watch with `options`), and a view whose root has left the page is
   * destroyed. Returns { views, scan, destroy }; views maps root -> view.
   */
  const mount = (label, find, create, options = {}) => {
    const tryIt = attempt(label);
    const views = new Map();
    const scan = () => {
      for (const [root, view] of views) {
        if (root.isConnected) continue;
        views.delete(root);
        tryIt(() => view.destroy());
      }
      for (const root of tryIt(find, [])) {
        if (!root || views.has(root)) continue;
        const view = tryIt(() => create(root), null);
        if (view) views.set(root, view);
      }
    };
    const watcher = watch(scan, options);
    scan();
    return {
      views,
      scan,
      destroy() {
        watcher.disconnect();
        for (const view of views.values()) tryIt(() => view.destroy());
        views.clear();
      },
    };
  };

  window.__se = {
    C,
    run,
    fiber,
    liveFiber,
    props,
    fromProps,
    findDown,
    owners,
    mainWindow,
    navigate,
    requires,
    findModule,
    global,
    appStore: resolveAppStore,
    cssVar,
    railMode,
    mark,
    unmark,
    attr,
    esc,
    el,
    setText,
    icons,
    isInstalled,
    coverURLs,
    heroURLs,
    rarity,
    watch,
    visible,
    poll,
    inside,
    attempt,
    copy,
    themeVersion,
    onChange,
    mount,
    SIDE,
    inSide: inside(SIDE),
  };
  dispatchEvent(new Event('se-core'));
})();
