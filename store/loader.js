/*
 * Store loader: which files each store page gets (store.steampowered.com), and the page
 * classes their CSS is scoped to. The mechanics are web/site-loader.js; this is the config.
 * core/core.js loads this module with ?v=<theme version>, and every file is requested with
 * the same one.
 *
 * <html> gets .se-store and one class per matched page (.se-store-front, .se-store-charts ...),
 * plus .se-store-rows on pages with game rows. Every file below a page's own folder is scoped
 * to that page's class; a page's scripts stop when you navigate away from it.
 *
 * Layout:
 *   shared/     every store page: layout, Steam's controls (ui.css), classic dialogs
 *               (modals.css), the store bar (nav), sale-page sections (sale), back-to-top;
 *               rows.css/js: the game rows of the front page and Explore
 *   front/      the store front (/)
 *   app/        game pages (/app/<id>/...); summary.js and hero.js import their helpers
 *               (viewer, trailers, player, highlights, deck) themselves, preloaded
 *   explore/    New On Steam (/explore/new/), Upcoming (/explore/upcoming/)
 *   charts/     Steam Charts (/charts/...)
 *   labs/       Steam Labs (/labs/)
 *   dlc/        DLC hub of a game (/dlc/<appid>/...)
 *   nextfest/   Steam Next Fest (/sale/nextfest/)
 *   awards/     The Steam Awards: results.* (/steamawards/2016 ...), archive.* (/steamawards/archive)
 *   replay/     Steam Replay (/replay/<steamid>/<year>)
 *   marketing/  Marketing messages (/marketingmessages/)
 *   legal/      legal.*: Legal Info (/legal/), Video Policy (/video_policy);
 *               agreement.*: Subscriber Agreement (/subscriber_agreement/), Privacy Policy
 *   account/    page.*: every account page (/account/..., Add funds, Phone, Family View): the
 *               header, page colour and Steam ID chip; table.*: the account tables' toolbar and
 *               sticky header. One folder per sub-page on top of it: history/ licenses/
 *               funds/ redeem/ phone/ parental/
 *   vendor/     hls.js (app/player.js)
 */
const versioned = (file) => {
  const url = new URL(file, import.meta.url);
  url.search = new URL(import.meta.url).search;
  return url.href;
};
const { start } = await import(versioned('../web/site-loader.js'));

const isFront = (path) => path === '/';
const isExplore = (path) => /^\/explore\/(?:new|upcoming)\/?$/i.test(path);

start({
  base: import.meta.url,
  siteClass: 'se-store',
  global: '__seStore',
  pages: {
    front: { test: isFront, root: 'se-store-front' },
    app: { test: (path) => /^\/app\/\d+(?:\/|$)/i.test(path), root: 'se-store-app' },
    explore: { test: isExplore, root: 'se-store-explore' },
    charts: { test: (path) => /^\/charts(?:\/|$)/i.test(path), root: 'se-store-charts' },
    labs: { test: (path) => /^\/labs\/?$/i.test(path), root: 'se-store-labs' },
    dlc: { test: (path) => /^\/dlc\/\d+(?:\/|$)/i.test(path), root: 'se-store-dlc' },
    nextfest: { test: (path) => /^\/sale\/nextfest\/?$/i.test(path), root: 'se-store-nextfest' },
    // Its script sets .se-store-awards itself: it measures Steam's own layout first.
    awards: { test: (path) => /^\/steamawards\/\d{4}\/?$/i.test(path), root: null },
    awardsArchive: { test: (path) => /^\/steamawards\/archive\/?$/i.test(path), root: 'se-store-awards-archive' },
    replay: { test: (path) => /^\/replay(?:\/|$)/i.test(path), root: 'se-store-replay' },
    marketing: { test: (path) => /^\/marketingmessages(?:\/|$)/i.test(path), root: 'se-store-marketing' },
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
    { css: '../core/tokens.css' },
    { css: '../web/base.css' },
    { css: 'shared/layout.css' },
    { css: 'shared/ui.css' },
    { css: 'shared/modals.css' },
    { css: 'shared/nav.css', js: 'shared/nav.js' },
    { css: 'shared/sale.css', js: 'shared/sale.js' },
    { css: 'shared/scroll-top.css', js: 'shared/scroll-top.js' },
    { css: 'front/hero.css', js: 'front/hero.js', on: ['front'] },
    { css: 'shared/rows.css', js: 'shared/rows.js', on: ['rows'] },
    { css: 'front/sections.css', on: ['front'] },
    { css: 'front/tabs.css', js: 'front/tabs.js', on: ['front'] },
    { css: 'app/hero.css', js: 'app/hero.js', preload: ['app/deck.js'], on: ['app'] },
    {
      css: 'app/summary.css',
      js: 'app/summary.js',
      preload: ['app/viewer.js', 'app/trailers.js', 'app/player.js', 'app/highlights.js'],
      on: ['app'],
    },
    { css: 'app/about.css', js: 'app/about.js', on: ['app'] },
    { css: 'app/hidden.css', on: ['app'] },
    { css: 'app/purchase.css', js: 'app/purchase.js', on: ['app'] },
    { css: 'explore/page.css', js: 'explore/page.js', on: ['explore'] },
    { css: 'charts/page.css', on: ['charts'] },
    { css: 'labs/page.css', js: 'labs/page.js', on: ['labs'] },
    { css: 'dlc/page.css', js: 'dlc/page.js', on: ['dlc'] },
    { css: 'nextfest/page.css', js: 'nextfest/page.js', on: ['nextfest'] },
    { css: 'awards/results.css', js: 'awards/results.js', on: ['awards'] },
    { css: 'awards/archive.css', js: 'awards/archive.js', on: ['awardsArchive'] },
    { css: 'replay/page.css', on: ['replay'] },
    { css: 'marketing/page.css', on: ['marketing'] },
    { css: 'legal/agreement.css', js: 'legal/agreement.js', on: ['ssa'] },
    { css: 'legal/legal.css', js: 'legal/legal.js', on: ['legal'] },
    { css: 'account/page.css', js: 'account/page.js', on: ['account'] },
    { css: 'account/table.css', on: ['accountHistory', 'accountLicenses'] },
    { css: 'account/history/page.css', js: 'account/history/page.js', preload: ['account/table.js'], on: ['accountHistory'] },
    { css: 'account/licenses/page.css', js: 'account/licenses/page.js', preload: ['account/table.js'], on: ['accountLicenses'] },
    { css: 'account/funds/page.css', js: 'account/funds/page.js', on: ['addFunds'] },
    { css: 'account/redeem/page.css', on: ['redeem'] },
    { css: 'account/phone/page.css', js: 'account/phone/page.js', on: ['phone'] },
    { css: 'account/parental/page.css', js: 'account/parental/page.js', on: ['parental'] },
  ],
});
