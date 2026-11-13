/*
 * Support loader: which files Steam Support pages get (help.steampowered.com). The mechanics
 * are core/site-loader.js; this is the config. core/core.js loads this module with
 * ?v=<theme version>, and every file (the site loader included) is requested with the same one.
 *
 * Support is one wizard that swaps its content in place, so its look is site-wide: the store's
 * tokens (store/shared/base.css) and help/site.css + help/site.js on every page. <html> gets
 * .se-help.
 */
const versioned = (file) => {
  const url = new URL(file, import.meta.url);
  url.search = new URL(import.meta.url).search;
  return url.href;
};
const { start } = await import(versioned('../core/site-loader.js'));

start({
  base: import.meta.url,
  siteClass: 'se-help',
  global: '__seHelp',
  pages: {},
  files: [
    { css: '../store/shared/base.css' },
    { css: 'site.css', js: 'site.js' },
  ],
});
