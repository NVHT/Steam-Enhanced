/*
 * Store config: which files each store page gets (store.steampowered.com), and the page
 * classes their CSS is scoped to. core/core.js hands it to web/shared/site-loader.js, which puts
 * the common files first (common: 'full') and requests every file with ?v=<theme version>.
 *
 * <html> gets .se-store and one class per matched page (.se-store-front, .se-store-charts ...),
 * plus .se-store-rows on pages with game rows. Every file below a page's own folder is scoped
 * to that page's class; a page's scripts stop when you navigate away from it.
 *
 * Layout:
 *   shared/     every store page: layout, Steam's controls (ui.css), store dialog content
 *               (modals.css; the dialog itself is web/shared/modals.css), the store bar (nav),
 *               sale-page sections (sale);
 *               rows.css/js: the game rows of the front page and Explore
 *   front/      the store front (/)
 *   app/        game pages (/app/<id>/...); the parts summary.js and hero.js use (player,
 *               viewer, trailers, highlights, deck) are listed before them
 *   explore/    New On Steam (/explore/new/), Upcoming (/explore/upcoming/)
 *   charts/     Steam Charts (/charts/...)
 *   labs/       Steam Labs (/labs/)
 *   dlc/        DLC hub of a game (/dlc/<appid>/...)
 *   agecheck/   Age check gate (/agecheck/app|sub|bundle/<id>)
 *   cart/       Shopping cart (/cart/)
 *   wishlist/   Wishlist (/wishlist/id/<name>/, /wishlist/profiles/<steamid>/)
 *   search/     Search results (/search/)
 *   nextfest/   Steam Next Fest (/sale/nextfest/)
 *   awards/     The Steam Awards: results.* (/steamawards/2016 ...), archive.* (/steamawards/archive)
 *   replay/     Steam Replay (/replay/<steamid>/<year>)
 *   marketing/  Marketing messages (/marketingmessages/)
 *   reviews/    Introducing Steam Reviews (/reviews/: the hub's "About Reviews")
 *   legal/      legal.*: Legal Info (/legal/), Video Policy (/video_policy);
 *               agreement.*: Subscriber Agreement (/subscriber_agreement/), Privacy Policy
 *   account/    page.*: every account page (/account/..., Add funds, Phone, Family View): the
 *               header, page colour and Steam ID chip; table.*: the account tables' toolbar and
 *               sticky header. One folder per sub-page on top of it: history/ licenses/
 *               funds/ redeem/ phone/ parental/
 *   vendor/     hls.js (app/player.js)
 */
(() => {
  'use strict';

  const isFront = (path) => path === '/';
  const isExplore = (path) => /^\/explore\/(?:new|upcoming)\/?$/i.test(path);

  window.__seWeb.configure({
    siteClass: 'se-store',
    common: 'full',
    pages: {
      front: { test: isFront, root: 'se-store-front' },
      app: { test: (path) => /^\/app\/\d+(?:\/|$)/i.test(path), root: 'se-store-app' },
      explore: { test: isExplore, root: 'se-store-explore' },
      charts: { test: (path) => /^\/charts(?:\/|$)/i.test(path), root: 'se-store-charts' },
      labs: { test: (path) => /^\/labs\/?$/i.test(path), root: 'se-store-labs' },
      dlc: { test: (path) => /^\/dlc\/\d+(?:\/|$)/i.test(path), root: 'se-store-dlc' },
      agecheck: { test: (path) => /^\/agecheck\/(?:app|sub|bundle)\/\d+(?:\/|$)/i.test(path), root: 'se-store-agecheck' },
      cart: { test: (path) => /^\/cart\/?$/i.test(path), root: 'se-store-cart' },
      search: { test: (path) => /^\/search\/?$/i.test(path), root: 'se-store-search' },
      wishlist: { test: (path) => /^\/wishlist\/(?:id|profiles)\/[^/]+\/?$/i.test(path), root: 'se-store-wishlist' },
      nextfest: { test: (path) => /^\/sale\/nextfest\/?$/i.test(path), root: 'se-store-nextfest' },
      // Its script sets .se-store-awards itself: it measures Steam's own layout first.
      awards: { test: (path) => /^\/steamawards\/\d{4}\/?$/i.test(path), root: null },
      awardsArchive: { test: (path) => /^\/steamawards\/archive\/?$/i.test(path), root: 'se-store-awards-archive' },
      replay: { test: (path) => /^\/replay(?:\/|$)/i.test(path), root: 'se-store-replay' },
      marketing: { test: (path) => /^\/marketingmessages(?:\/|$)/i.test(path), root: 'se-store-marketing' },
      reviews: { test: (path) => /^\/reviews\/?$/i.test(path), root: 'se-store-reviews' },
      ssa: { test: (path) => /^\/(?:subscriber|privacy)_agreement(?:\/|$)/i.test(path), root: 'se-store-ssa' },
      legal: { test: (path) => /^\/(?:legal|video_policy)\/?$/i.test(path), root: 'se-store-legal' },
      account: { test: (path) => /^\/(?:account(?:\/[\w-]+)*|steamaccount\/addfunds|phone\/manage|parental(?:\/[\w-]+)?)\/?$/i.test(path), root: 'se-store-account' },
      accountHistory: { test: (path) => /^\/account\/history\/?$/i.test(path), root: 'se-store-account-history' },
      accountLicenses: { test: (path) => /^\/account\/licenses\/?$/i.test(path), root: 'se-store-account-licenses' },
      redeem: { test: (path) => /^\/account\/redeemwalletcode\/?$/i.test(path), root: 'se-store-redeem' },
      addFunds: { test: (path) => /^\/steamaccount\/addfunds\/?$/i.test(path), root: 'se-store-addfunds' },
      phone: { test: (path) => /^\/phone\/manage\/?$/i.test(path), root: 'se-store-phone' },
      parental: { test: (path) => /^\/parental(?:\/[\w-]+)?\/?$/i.test(path), root: 'se-store-parental' },
      rows: { test: (path) => isFront(path) || isExplore(path), root: 'se-store-rows' },
    },
    files: [
      { css: 'shared/layout.css' },
      { css: 'shared/ui.css' },
      { css: 'shared/ui-buttons.css' },
      { css: 'shared/ui-flags.css' },
      { css: 'shared/ui-price.css' },
      { css: 'shared/ui-hover.css' },
      { css: 'shared/modals.css' },
      { css: 'shared/nav.css', js: 'shared/nav.js' },
      { css: 'shared/nav-panel.css' },
      { css: 'shared/nav-suggest.css' },
      { css: 'shared/sale/sale.css', js: 'shared/sale/sale.js' },
      { css: 'shared/sale/sale-tiers.css' },
      { css: 'shared/sale/sale-sections.css' },
      { css: 'shared/sale/sale-library.css' },
      { css: 'shared/sale/sale-controls.css' },
      { css: 'shared/sale/sale-browser.css' },
      { js: 'front/hero-takeover.js', on: ['front'] },
      { css: 'front/hero.css', js: 'front/hero.js', on: ['front'] },
      { css: 'shared/rows.css', js: 'shared/rows.js', on: ['rows'] },
      { css: 'front/sections.css', js: 'front/sections.js', on: ['front'] },
      { css: 'front/tabs.css', js: 'front/tabs.js', on: ['front'] },
      { js: 'app/deck.js', on: ['app'] },
      { css: 'app/hero.css', js: 'app/hero.js', on: ['app'] },
      { js: '../shared/select.js', on: ['app'] },
      { js: 'app/player.js', on: ['app'] },
      { js: 'app/viewer.js', on: ['app'] },
      { js: 'app/trailers.js', on: ['app'] },
      { js: 'app/highlights.js', on: ['app'] },
      { css: 'app/summary.css', js: 'app/summary.js', on: ['app'] },
      { css: 'app/summary-details.css', on: ['app'] },
      { css: 'app/summary-actions.css', on: ['app'] },
      { css: 'app/summary-viewer.css', on: ['app'] },
      { css: 'app/about.css', js: 'app/about.js', on: ['app'] },
      { css: 'app/hidden.css', on: ['app'] },
      { css: 'app/purchase.css', js: 'app/purchase.js', on: ['app'] },
      { css: 'explore/page.css', js: 'explore/page.js', on: ['explore'] },
      { css: 'charts/page.css', on: ['charts'] },
      { css: 'labs/page.css', js: 'labs/page.js', on: ['labs'] },
      { css: 'dlc/page.css', js: 'dlc/page.js', on: ['dlc'] },
      { css: 'dlc/featured.css', on: ['dlc'] },
      { css: 'dlc/browse.css', on: ['dlc'] },
      { css: 'agecheck/page.css', js: 'agecheck/page.js', on: ['agecheck'] },
      { css: 'cart/page.css', js: 'cart/page.js', on: ['cart'] },
      { js: 'wishlist/grid.js', on: ['wishlist'] },
      { css: 'wishlist/page.css', js: 'wishlist/page.js', on: ['wishlist'] },
      { css: 'wishlist/column.css', on: ['wishlist'] },
      { css: 'wishlist/grid.css', on: ['wishlist'] },
      { css: 'search/page.css', js: 'search/page.js', on: ['search'] },
      { css: 'nextfest/page.css', js: 'nextfest/page.js', on: ['nextfest'] },
      { css: 'awards/results.css', js: 'awards/results.js', on: ['awards'] },
      { css: 'awards/results-2017.css', on: ['awards'] },
      { css: 'awards/results-2022.css', on: ['awards'] },
      { css: 'awards/archive.css', js: 'awards/archive.js', on: ['awardsArchive'] },
      { css: 'replay/page.css', on: ['replay'] },
      { css: 'marketing/page.css', on: ['marketing'] },
      { css: 'reviews/page.css', on: ['reviews'] },
      { css: 'legal/agreement.css', js: 'legal/agreement.js', on: ['ssa'] },
      { css: 'legal/legal.css', js: 'legal/legal.js', on: ['legal'] },
      { css: 'account/page.css', js: 'account/page.js', on: ['account'] },
      { css: 'account/settings.css', on: ['account'] },
      { css: 'account/tiles.css', on: ['account'] },
      { css: 'account/frame.css', on: ['account'] },
      { css: 'account/react.css', on: ['account'] },
      { css: 'account/newer.css', on: ['account'] },
      { css: 'account/table.css', js: 'account/table.js', on: ['accountHistory', 'accountLicenses'] },
      { css: 'account/history/page.css', js: 'account/history/page.js', on: ['accountHistory'] },
      { css: 'account/licenses/page.css', js: 'account/licenses/page.js', on: ['accountLicenses'] },
      { css: 'account/funds/page.css', js: 'account/funds/page.js', on: ['addFunds'] },
      { css: 'account/redeem/page.css', on: ['redeem'] },
      { css: 'account/phone/page.css', js: 'account/phone/page.js', on: ['phone'] },
      { css: 'account/parental/page.css', js: 'account/parental/page.js', on: ['parental'] },
    ],
  });
})();
