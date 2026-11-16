/*
 * Checkout config: which files Steam's checkout pages get (checkout.steampowered.com: Payment
 * Info, Review + Purchase, receipt). core/core.js hands it to web/shared/site-loader.js, which
 * puts the common files first (common: 'lite': tokens, the web base, the spinner) and requests
 * every file with ?v=<theme version>.
 *
 * Checkout is one classic page that swaps its steps in place, so its look is site-wide: page.css
 * on every page. <html> gets .se-checkout.
 */
(() => {
  'use strict';

  window.__seWeb.configure({
    siteClass: 'se-checkout',
    common: 'lite',
    pages: {},
    files: [
      { css: 'page.css' },
    ],
  });
})();
