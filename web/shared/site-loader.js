/*
 * Site loader, shared by every web site the theme styles. core/core.js adds it and the site's
 * config (web/store/loader.js, web/community/loader.js, web/help/loader.js,
 * web/checkout/loader.js: each only `window.__seWeb.configure({ ... })`), then calls
 * window.__seWeb.start(global). Given the pages and files, this:
 *
 *   - puts the common files first (COMMON): every site gets the runtime (dom.js), the tokens,
 *     the web base, the search field and the spinner; `common: 'full'` adds what the redesigned sites share
 *     (level badges, the friend card, Steam's dialogs, the dropdown, scroll to top)
 *   - puts the site class and one class per matched page on <html> before any stylesheet, so
 *     the CSS applies from the first paint
 *   - adds each matched stylesheet in list order (the cascade), a pass's new ones @imported by
 *     one <style> (addStylesheets)
 *   - runs each matched script, a classic script, in list order. A page script hands its
 *     `init(dom)` to web.define(); init gets the shared runtime (web.dom, web/shared/dom.js) and
 *     returns its destroy function (or a promise of one). A part publishes what pages use on
 *     web.parts (the dropdown, a page's helpers) and is listed before the pages that use it.
 *   - re-evaluates on client-side navigation (React Router): a page newly entered gets its
 *     files; a page-scoped script whose pages no longer match is destroyed, and its init runs
 *     again if one comes back (a script runs once). Stylesheets stay: they are scoped to their
 *     page class.
 *   - exposes window[global].destroy(), which undoes every feature and class
 *
 * Files resolve against the site's config URL and carry its ?v=<theme version>, so the web
 * view's cache never mixes builds.
 *
 * Reveal: core/core.js hides the page until it is styled. Once the first page's stylesheets
 * have loaded and its scripts have run their first pass (cards built, rows marked), <html>
 * gets [data-se-styled] and the page shows, themed, in one paint. A slow or failing file can't
 * hold the page: REVEAL_MAX_MS caps the wait.
 */
(() => {
  'use strict';
  const SELF = document.currentScript?.src;
  if (!SELF) return;

  const REVEAL_MAX_MS = 800;

  /** Files every site starts with, in cascade order, relative to this file. */
  const COMMON = {
    lite: [{ js: 'dom.js' }, { css: '../../core/tokens.css' }, { css: '../../core/icons-nav.css' }, { css: '../../core/icons-ui.css' }, { css: 'base.css' }, { css: 'search-field.css' }, { css: '../../core/spinner.css' }],
    full: [
      { js: 'dom.js' },
      { css: '../../core/tokens.css' },
      { css: '../../core/icons-nav.css' },
      { css: '../../core/icons-ui.css' },
      { css: '../../core/levels.css' },
      { css: 'base.css' },
      { css: 'search-field.css' },
      { css: 'miniprofile.css' },
      { css: 'modals.css', js: 'modals.js' },
      { css: 'select.css' },
      { css: 'scroll-top.css', js: 'scroll-top.js' },
      { css: '../../core/spinner.css' },
    ],
  };

  const settled = (node) =>
    new Promise((resolve) => {
      node.addEventListener('load', resolve, { once: true });
      node.addEventListener('error', resolve, { once: true });
    });

  // Each page script's init, by the file it came from (its <script>'s data-se-file)
  const inits = new Map();

  /**
   * @param {{
   *   base: string,                                           the site config's URL (with ?v=)
   *   siteClass: string,                                      class on <html> for every page
   *   global: string,                                         window property for destroy()
   *   common: 'lite' | 'full',                                the common files (COMMON)
   *   pages: Record<string, { test: (path: string) => boolean, root: string | null }>,
   *   files: { css?: string, js?: string, on?: string[] }[],  in cascade and run order
   * }} config
   */
  const start = ({ base, siteClass, global, common, pages, files: siteFiles }) => {
    if (window[global]) return;

    const version = new URL(base).searchParams.get('v');
    const asset = (file) => {
      const url = new URL(file, base);
      if (version) url.searchParams.set('v', version);
      return url.href;
    };

    // Common files resolve against this file, the site's own against its config
    const near = (file) => file && new URL(file, SELF).href;
    const files = [
      ...COMMON[common].map(({ css, js }) => ({ css: near(css), js: near(js) })),
      ...siteFiles,
    ];

    const root = document.documentElement;
    const head = document.head ?? root;
    const sheets = new Set();
    /** @type {Map<string, Promise<void>>} scripts added → when each has run */
    const added = new Map();
    /** @type {Map<string, Promise<(() => void) | null>>} running scripts → their destroy */
    const running = new Map();
    /** @type {Map<string, Promise<void>>} scripts being destroyed → when that is done */
    const stopping = new Map();
    /** Parts, and pages whose init returned no destroy: they stay for the page's life. */
    const permanent = new Set();
    const firstPass = []; // the first page's stylesheets and scripts, until it is revealed
    let revealed = false;
    let lastStylesheet = null;

    // Added in list order and run in it (async = false), so a part runs before its pages.
    const addScript = (file) => {
      if (!added.has(file)) {
        const script = document.createElement('script');
        script.src = asset(file);
        script.async = false;
        script.dataset.seFile = file;
        script.dataset.seFeature = file;
        added.set(file, settled(script));
        head.append(script);
      }
      return added.get(file);
    };

    const startScript = (file) => {
      const previous = stopping.get(file); // a quick leave-and-return: its destroy runs first
      const ran = addScript(file);
      const run = (async () => {
        try {
          await Promise.all([previous, ran]);
          const init = inits.get(file);
          const destroy = init ? await init(window.__seWeb.dom) : null;
          if (typeof destroy === 'function') return destroy;
          permanent.add(file);
        } catch (error) {
          console.error(`[Steam Enhanced] ${file} failed:`, error);
        }
        return null;
      })();
      running.set(file, run);
      return run;
    };

    const stopScript = (file) => {
      const run = running.get(file);
      running.delete(file);
      if (!run) return;
      const done = run.then((destroy) => {
        try {
          destroy?.();
        } catch (error) {
          console.error(`[Steam Enhanced] ${file} destroy failed:`, error);
        }
      });
      stopping.set(file, done);
      done.then(() => {
        if (stopping.get(file) === done) stopping.delete(file);
      });
    };

    /*
     * A pass's new stylesheets go in through one <style> of @imports, in list order: Chromium
     * matches an element against each sheet on its own and imports fold into the importing sheet,
     * so one sheet per file cost every style pass (as in client/loader.js). A later navigation's
     * page sheets get their own, after the last. [data-se-sheets] marks them for live reload
     * (core/core.js); [data-se-loaded] once every import is in.
     */
    const addStylesheets = (list) => {
      const style = document.createElement('style');
      style.setAttribute('blocking', 'render'); // holds the first paint where it is in time for it
      style.dataset.seFeature = 'sheets';
      style.dataset.seSheets = '';
      style.textContent = list.map((file) => `@import url("${asset(file)}");`).join('\n');
      const loaded = settled(style).then(() => {
        style.dataset.seLoaded = '';
      });
      // Keep list order even when a later navigation adds a page's sheet.
      if (lastStylesheet?.isConnected) lastStylesheet.after(style);
      else head.append(style);
      lastStylesheet = style;
      if (!revealed) firstPass.push(loaded);
    };

    const apply = () => {
      const path = location.pathname;
      const matched = new Set(Object.keys(pages).filter((page) => pages[page].test(path)));

      root.classList.add(siteClass);
      for (const [page, { root: className }] of Object.entries(pages)) {
        if (className) root.classList.toggle(className, matched.has(page));
      }

      const newSheets = [];
      for (const file of files) {
        const active = !file.on || file.on.some((page) => matched.has(page));
        if (active && file.css && !sheets.has(file.css)) {
          sheets.add(file.css);
          newSheets.push(file.css);
        }
        if (!file.js || permanent.has(file.js)) continue;
        if (active && !running.has(file.js)) {
          const run = startScript(file.js);
          if (!revealed) firstPass.push(run);
        } else if (!active && running.has(file.js)) {
          stopScript(file.js);
        }
      }
      if (newSheets.length) addStylesheets(newSheets);
    };

    apply();
    Promise.race([Promise.allSettled(firstPass), new Promise((resolve) => setTimeout(resolve, REVEAL_MAX_MS))]).then(() => {
      revealed = true;
      firstPass.length = 0;
      root.setAttribute('data-se-styled', '');
    });

    // Client-side navigation: the Navigation API reports every URL change; popstate covers the
    // rest. apply() is idempotent, so both firing for one change is harmless.
    window.navigation?.addEventListener('currententrychange', apply);
    addEventListener('popstate', apply);

    window[global] = {
      destroy() {
        window.navigation?.removeEventListener('currententrychange', apply);
        removeEventListener('popstate', apply);
        for (const file of [...running.keys()].reverse()) stopScript(file);
        document.querySelectorAll('[data-se-feature]').forEach((node) => node.remove());
        root.classList.remove(siteClass, ...Object.values(pages).map((page) => page.root).filter(Boolean));
        sheets.clear();
        added.clear();
        permanent.clear();
        delete window[global];
      },
    };
  };

  /*
   * The web's one namespace. Every build's site loader makes it afresh (a live-reload swap
   * adds the new build's scripts), so nothing of an old build's parts or inits carries over.
   */
  let config = null;
  window.__seWeb = {
    dom: null,
    parts: {},
    /** A page script hands over its init: keyed by the file its <script> was added for. */
    define(init) {
      const file = document.currentScript?.dataset.seFile;
      if (file && typeof init === 'function') inits.set(file, init);
    },
    /** The site's config (web/<site>/loader.js); its URL is the base its files resolve against. */
    configure(options) {
      config = { ...options, base: document.currentScript?.src };
    },
    /** core/core.js, once the config has run: `global` is where destroy() goes. */
    start(global) {
      if (config?.base) start({ ...config, global });
    },
  };
})();
