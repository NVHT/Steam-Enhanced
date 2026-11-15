/*
 * Checkout loader: which files Steam's checkout pages get (checkout.steampowered.com: Payment
 * Info, Review + Purchase, receipt). The mechanics are web/site-loader.js; this is the config.
 * core/core.js loads this module with ?v=<theme version>, and every file (the site loader
 * included) is requested with the same one.
 *
 * Checkout is one classic page that swaps its steps in place, so its look is site-wide: tokens
 * (core/tokens.css), web/base.css, and checkout/page.css on every page. <html> gets
 * .se-checkout.
 */
const versioned = (file) => {
  const url = new URL(file, import.meta.url);
  url.search = new URL(import.meta.url).search;
  return url.href;
};
const { start } = await import(versioned('../web/site-loader.js'));

start({
  base: import.meta.url,
  siteClass: 'se-checkout',
  global: '__seCheckout',
  pages: {},
  files: [
    { css: '../core/tokens.css' },
    { css: '../web/base.css' },
    { css: '../core/spinner.css' },
    { css: 'page.css' },
  ],
});
