/*
 * Support config: which files Steam Support pages get (help.steampowered.com). core/core.js
 * hands it to web/shared/site-loader.js, which puts the common files first (common: 'lite':
 * tokens, the web base, the spinner) and requests every file with ?v=<theme version>.
 *
 * Support is one wizard that swaps its content in place, so its look is site-wide: site.css and
 * site.js on every page. <html> gets .se-help.
 */
(() => {
  'use strict';

  window.__seWeb.configure({
    siteClass: 'se-help',
    common: 'lite',
    pages: {},
    files: [
      { css: 'site.css', js: 'site.js' },
      { css: 'site-pages.css' },
      { css: 'site-forms.css' },
    ],
  });
})();
