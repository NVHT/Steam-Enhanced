/*
 * Site loader, shared by every web site the theme styles (store/loader.js, community/loader.js,
 * help/loader.js): each site's loader is only its config. Given the pages and files, this:
 *
 *   - puts the site class and one class per matched page on <html> before any stylesheet, so
 *     the CSS applies from the first paint
 *   - adds each matched stylesheet in list order (the cascade)
 *   - starts each matched script: an ES module whose default export is `init(dom)`, given the
 *     shared runtime (web/dom.js), returning its destroy function (or a promise of one). A
 *     file's `preload` lists the modules its script imports itself: they download alongside it
 *     instead of after it.
 *   - re-evaluates on client-side navigation (React Router): a page newly entered gets its
 *     files; a page-scoped script whose pages no longer match is destroyed, and starts again
 *     if one comes back. Stylesheets stay: they are scoped to their page class.
 *   - exposes window[global].destroy(), which undoes every feature and class
 *
 * Files resolve against the site's loader URL and carry its ?v=<theme version>, so the web
 * view's cache never mixes builds.
 *
 * Reveal: core/core.js hides the page until it is styled. Once the first page's stylesheets
 * have loaded and its scripts have run their first pass (cards built, rows marked), <html>
 * gets [data-se-styled] and the page shows, themed, in one paint. A slow or failing file can't
 * hold the page: REVEAL_MAX_MS caps the wait.
 */
const REVEAL_MAX_MS = 800;

const settled = (link) =>
  new Promise((resolve) => {
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', resolve, { once: true });
  });

/**
 * @param {{
 *   base: string,                                           the site loader's import.meta.url
 *   siteClass: string,                                      class on <html> for every page
 *   global: string,                                         window property for destroy()
 *   pages: Record<string, { test: (path: string) => boolean, root: string | null }>,
 *   files: { css?: string, js?: string, preload?: string[], on?: string[] }[],  in cascade order
 * }} config
 */
export const start = ({ base, siteClass, global, pages, files }) => {
  if (window[global]) return;

  const version = new URL(base).searchParams.get('v');
  const asset = (file, from = base) => {
    const url = new URL(file, from);
    if (version) url.searchParams.set('v', version);
    return url.href;
  };

  const root = document.documentElement;
  const head = document.head ?? root;
  const sheets = new Set();
  /** @type {Map<string, Promise<(() => void) | null>>} running scripts → their destroy */
  const running = new Map();
  /** @type {Map<string, Promise<void>>} scripts being destroyed → when that is done */
  const stopping = new Map();
  /** Scripts that returned no destroy: they stay for the page's life. */
  const permanent = new Set();
  const firstPass = []; // the first page's stylesheets and scripts, until it is revealed
  let revealed = false;
  let lastStylesheet = null;
  let dom = null;

  const preload = (file) => {
    const href = asset(file);
    if (head.querySelector(`link[rel="modulepreload"][href="${href}"]`)) return;
    head.append(Object.assign(document.createElement('link'), { rel: 'modulepreload', href }));
  };

  const startScript = (file, imports = []) => {
    imports.forEach(preload);
    dom ??= import(asset('./dom.js', import.meta.url));
    const previous = stopping.get(file); // a quick leave-and-return: its destroy runs first
    const run = (async () => {
      try {
        await previous;
        const [runtime, feature] = await Promise.all([dom, import(asset(file))]);
        const destroy = await feature.default(runtime);
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

  const addStylesheet = (file) => {
    sheets.add(file);
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = asset(file);
    link.setAttribute('blocking', 'render'); // holds the first paint where the link is in time for it
    link.dataset.seFeature = file;
    // Keep list order even when a later navigation adds a page's sheet.
    if (lastStylesheet?.isConnected) lastStylesheet.after(link);
    else head.append(link);
    lastStylesheet = link;
    if (!revealed) firstPass.push(settled(link));
  };

  const apply = () => {
    const path = location.pathname;
    const matched = new Set(Object.keys(pages).filter((page) => pages[page].test(path)));

    root.classList.add(siteClass);
    for (const [page, { root: className }] of Object.entries(pages)) {
      if (className) root.classList.toggle(className, matched.has(page));
    }

    for (const file of files) {
      const active = !file.on || file.on.some((page) => matched.has(page));
      if (active && file.css && !sheets.has(file.css)) addStylesheet(file.css);
      if (!file.js || permanent.has(file.js)) continue;
      if (active && !running.has(file.js)) {
        const run = startScript(file.js, file.preload);
        if (!revealed) firstPass.push(run);
      } else if (!active && running.has(file.js)) {
        stopScript(file.js);
      }
    }
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
      document.querySelectorAll('link[data-se-feature]').forEach((link) => link.remove());
      root.classList.remove(siteClass, ...Object.values(pages).map((page) => page.root).filter(Boolean));
      sheets.clear();
      permanent.clear();
      delete window[global];
    },
  };
};
