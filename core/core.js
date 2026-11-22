/*
 * Web pages: add the site loader (web/shared/site-loader.js) and the site's config from the
 * theme folder core.js was served from; the config decides which files each page gets:
 * web/store/loader.js, web/community/loader.js, web/help/loader.js or web/checkout/loader.js.
 * Millennium injects core.js into every web view, so this needs no dedicated skin.json rules
 * (new rules only take effect after a full Steam restart). Both are requested with
 * ?v=<theme version> so the web view's cache never mixes builds; the site loader passes the same
 * version on to every file. The version comes from the last visit (localStorage) so the page needn't wait; skin.json
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
    'store.steampowered.com': { loader: '../web/store/loader.js', global: '__seStore' },
    'steamcommunity.com': { loader: '../web/community/loader.js', global: '__seCommunity' },
    'help.steampowered.com': { loader: '../web/help/loader.js', global: '__seHelp' },
    'checkout.steampowered.com': { loader: '../web/checkout/loader.js', global: '__seCheckout' },
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
  // "Web pages" setting, Steam's own: Millennium puts options/web/restyle-off.css in the page's
  // HTML as a <link>, ahead of this script, and the theme stays out of the page entirely.
  if (document.querySelector('link[href*="/options/web/restyle-off.css"]')) return;

  const { loader } = site;
  const coreSrc = document.currentScript?.src ||
    [...document.scripts].find((script) => /\/core\/core\.js(?:[?#]|$)/.test(script.src))?.src;
  if (!coreSrc || document.querySelector('[data-se-feature]')) return;

  // No flash of Steam's own look: until the site's loader has its first stylesheets and page
  // scripts in ([data-se-styled], set by the loader), the page shows only the theme's
  // background. Set here, synchronously, because everything after is async (skin.json, the
  // site loader and config, their stylesheets). If the loader never gets there, a CSS timer shows the
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

  const SITE_LOADER = '../web/shared/site-loader.js';

  // The site loader, then the site's config: classic scripts, downloaded together and run in
  // that order (async = false); the config hands itself to the loader, which then starts.
  const load = (version) => {
    const versioned = (file) => {
      const url = new URL(file, coreSrc);
      if (version) url.searchParams.set('v', version);
      return url.href;
    };
    const head = document.head ?? document.documentElement;
    const add = (file) =>
      new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = versioned(file);
        script.async = false;
        script.dataset.seFeature = 'loader';
        script.addEventListener('load', resolve, { once: true });
        script.addEventListener('error', reject, { once: true });
        head.append(script);
      });
    Promise.all([add(SITE_LOADER), add(loader)])
      .then(() => window.__seWeb.start(site.global))
      .catch((error) => {
        console.error('[Steam Enhanced] site loader failed:', error);
        reveal();
      });
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

  // The old build's copies stay until every new stylesheet has loaded (or STALE_MAX_MS passes).
  // The site loader's sheets are <style>s of @imports, marked [data-se-loaded] once all are in
  // (web/shared/site-loader.js).
  const dropWhenReady = (stale, started = performance.now()) => {
    const fresh = [...document.querySelectorAll('[data-se-sheets]')];
    if ((fresh.length && fresh.every((sheet) => sheet.hasAttribute('data-se-loaded'))) || performance.now() - started > STALE_MAX_MS) {
      stale.forEach((sheet) => sheet.remove());
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
      'font:700 11px/1 var(--se-font,"SN Pro","Motiva Sans",Arial,sans-serif);font-variant-numeric:tabular-nums;' +
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
    const stale = [...document.querySelectorAll('[data-se-sheets]')].map((sheet) => {
      const copy = sheet.cloneNode(true); // its imports come from the cache
      for (const name of ['data-se-feature', 'data-se-sheets', 'data-se-loaded', 'blocking']) copy.removeAttribute(name);
      copy.dataset.seStale = '';
      sheet.before(copy);
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
    document.querySelectorAll('script[data-se-feature="loader"]').forEach((script) => script.remove());
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
 * web page. Loaded only on the first press, so it costs nothing until then, or at once when
 * its "Catch next dialog" wait is armed in this tab (it survives a reload to catch dialogs
 * a page shows while it loads).
 */
(() => {
  if (window.__seInspectorHotkey) return;
  window.__seInspectorHotkey = true;
  const coreSrc = document.currentScript?.src ||
    [...document.scripts].find((script) => /\/core\/core\.js(?:[?#]|$)/.test(script.src))?.src;
  const load = () => {
    if (!coreSrc) {
      console.warn('[Steam Enhanced] Element picker: theme folder not found from this window.');
      return;
    }
    const script = document.createElement('script');
    const url = new URL('../dev/inspector.js', coreSrc);
    url.searchParams.set('v', String(Date.now()));
    script.src = url.href;
    (document.head ?? document.documentElement).append(script);
  };
  addEventListener(
    'keydown',
    (event) => {
      if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey || event.code !== 'KeyE') return;
      event.preventDefault();
      event.stopPropagation();
      if (window.__seInspector) window.__seInspector.toggle();
      else load();
    },
    true
  );
  try {
    if (sessionStorage.getItem('se-inspector-catch') === '1') load();
  } catch {} // storage blocked: no armed catch to resume
})();

/*
 * Profiler (dev/perf.js), a performance aid: Ctrl+Shift+P arms it in every client window
 * (localStorage "se-perf"; client/loader.js then loads it before the runtime) and opens its
 * panel here. Costs nothing until pressed.
 */
(() => {
  if (window.__sePerfHotkey) return;
  window.__sePerfHotkey = true;
  const coreSrc = document.currentScript?.src ||
    [...document.scripts].find((script) => /\/core\/core\.js(?:[?#]|$)/.test(script.src))?.src;
  addEventListener(
    'keydown',
    (event) => {
      if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey || event.code !== 'KeyP') return;
      event.preventDefault();
      event.stopPropagation();
      if (window.__sePerf) {
        window.__sePerf.toggle();
        return;
      }
      if (!coreSrc) return;
      try {
        localStorage.setItem('se-perf', '1');
      } catch {}
      const script = document.createElement('script');
      script.src = new URL('../dev/perf.js', coreSrc).href;
      (document.head ?? document.documentElement).append(script);
    },
    true
  );
})();
