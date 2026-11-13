/*
 * Site loader, shared by the web sites other than the store (community/loader.js,
 * help/loader.js): each site's loader is just its config. Given the pages and files, this:
 *
 *   - puts the site class and one class per matched page on <html> before any stylesheet, so
 *     the CSS applies from the first paint
 *   - adds each matched stylesheet in list order (the cascade) and starts each script, an ES
 *     module whose default export is `init(dom)` with the store's runtime (store/shared/dom.js)
 *     returning its destroy function
 *   - re-evaluates on client-side navigation (React Router) and loads what a newly entered
 *     page needs
 *   - exposes window[global].destroy(), which undoes every feature and class
 *
 * Files resolve against the site loader's own URL and carry its ?v=<theme version>, so the
 * web view's cache never mixes builds. The store keeps its own loader (store/loader.js), which
 * also handles its game-row pages.
 */

/*
 * Reveal: core/core.js hides the page until it is styled. Once the first page's stylesheets
 * have loaded and its scripts have run their first pass (cards built, rows marked), <html>
 * gets [data-se-styled] and the page shows, themed, in one paint. A slow or failing file
 * can't hold the page: REVEAL_MAX_MS caps the wait.
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
 *   files: { css?: string, js?: string, on?: string[] }[],  in cascade order
 * }} config
 */
export const start = ({ base, siteClass, global, pages, files }) => {
  if (window[global]) return;

  const version = new URL(base).searchParams.get('v');
  const asset = (file) => {
    const url = new URL(file, base);
    if (version) url.searchParams.set('v', version);
    return url.href;
  };

  const root = document.documentElement;
  const head = document.head ?? root;
  const loaded = new Set();
  const firstPass = []; // the first page's stylesheets and scripts, until it is revealed
  let revealed = false;
  const destroys = [];
  let lastStylesheet = null;
  let dom = null;

  const startScript = async (file) => {
    dom ??= import(asset(new URL('../store/shared/dom.js', import.meta.url).href));
    try {
      const [runtime, feature] = await Promise.all([dom, import(asset(file))]);
      const destroy = await feature.default(runtime);
      if (typeof destroy === 'function') destroys.push(destroy);
    } catch (error) {
      console.error(`[Steam Enhanced] ${file} failed:`, error);
    }
  };

  const apply = () => {
    const path = location.pathname;
    const matched = new Set(Object.keys(pages).filter((page) => pages[page].test(path)));

    root.classList.add(siteClass);
    for (const [page, { root: className }] of Object.entries(pages)) {
      if (className) root.classList.toggle(className, matched.has(page));
    }

    for (const file of files) {
      if (file.on && !file.on.some((page) => matched.has(page))) continue;
      if (file.css && !loaded.has(file.css)) {
        loaded.add(file.css);
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = asset(file.css);
        link.setAttribute('blocking', 'render'); // holds the first paint where the link is in time for it
        link.dataset.seFeature = file.css;
        // Keep list order even when a later navigation adds a page's sheet.
        if (lastStylesheet?.isConnected) lastStylesheet.after(link);
        else head.append(link);
        lastStylesheet = link;
        if (!revealed) firstPass.push(settled(link));
      }
      if (file.js && !loaded.has(file.js)) {
        loaded.add(file.js);
        const run = startScript(file.js);
        if (!revealed) firstPass.push(run);
      }
    }
  };

  apply();
  Promise.race([Promise.allSettled(firstPass), new Promise((resolve) => setTimeout(resolve, REVEAL_MAX_MS))]).then(() => {
    revealed = true;
    firstPass.length = 0;
    root.setAttribute('data-se-styled', '');
  });
  // Client-side navigation: the Navigation API reports every URL change.
  window.navigation?.addEventListener('currententrychange', apply);
  addEventListener('popstate', apply);

  window[global] = {
    destroy() {
      window.navigation?.removeEventListener('currententrychange', apply);
      removeEventListener('popstate', apply);
      while (destroys.length) destroys.pop()();
      document.querySelectorAll('link[data-se-feature]').forEach((link) => link.remove());
      root.classList.remove(siteClass, ...Object.values(pages).map((page) => page.root).filter(Boolean));
      loaded.clear();
      delete window[global];
    },
  };
};
