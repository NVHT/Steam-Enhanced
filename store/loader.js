/*
 * Store loader: which files each store page gets, and the page classes their CSS is scoped to.
 *
 * core/core.js (injected by Millennium into every web view) loads this module on
 * store.steampowered.com with ?v=<theme version>; every file below is requested with the same
 * version, so the web view's cache never mixes builds.
 *
 * Before any stylesheet is added, <html> gets .se-store (every store page) and one class per
 * page it matches (.se-store-front, .se-store-charts ...), so the CSS applies from its first
 * paint and no script has to mark its own page. The store navigates some pages client-side
 * (React Router); on each navigation the classes are re-evaluated and any page newly entered
 * gets its files.
 *
 * Scripts are ES modules whose default export is `init(dom)`, given the shared runtime
 * (shared/dom.js); it returns the feature's destroy function (or a promise of one).
 * window.__seStore.destroy() undoes every feature and class.
 *
 * Layout:
 *   shared/        every store page, or every page with game rows (modals.css: Steam's
 *                  classic dialogs)
 *   front/         the store front (/)
 *   app/           game pages (/app/<id>/...)
 *   explore/       New On Steam (/explore/new/), Upcoming (/explore/upcoming/)
 *   charts/        Steam Charts (/charts/...)
 *   labs/          Steam Labs (/labs/)
 *   dlc/           DLC hub of a game (/dlc/<appid>/...)
 *   nextfest/      Steam Next Fest (/sale/nextfest/)
 *   steam-awards/  The Steam Awards results (/steamawards/2016 ...)
 *   steam-awards-archive/  The Steam Awards Archive (/steamawards/archive)
 *   replay/        Steam Replay (/replay/<steamid>/<year>)
 *   marketing/     Marketing messages (/marketingmessages/)
 *   subscriber-agreement/  Steam Subscriber Agreement (/subscriber_agreement/), Privacy Policy
 *                  (/privacy_agreement/)
 *   legal/         Legal Info (/legal/), Video Policy (/video_policy)
 *   account/       Account details (/account/) and its sidebar's pages (/account/<page>, and
 *                  their sub-pages: /account/familymanagement/join ...), plus
 *                  the header, page colour and Steam ID chip of every account page (Add funds,
 *                  Manage phone number and Family View too); table.css/table.js are the account tables'
 *                  shared toolbar and sticky header
 *   account-history/  Purchase History (/account/history/), on top of account/
 *   account-licenses/ Licenses and product key activations (/account/licenses/), on top of account/
 *   account-funds/    Add funds to your Steam Wallet (/steamaccount/addfunds), on top of account/
 *   account-redeem/   Redeem a Steam Gift Card or Wallet Code (/account/redeemwalletcode), on top of account/
 *   account-phone/    Manage phone number (/phone/manage), on top of account/
 *   parental/         Family View (/parental/...), on top of account/
 *
 * Stylesheets go in in list order, which settles rules that tie on specificity.
 */
const PAGES = {
  front: { test: (path) => path === '/', root: 'se-store-front' },
  app: { test: (path) => /^\/app\/\d+(?:\/|$)/i.test(path), root: 'se-store-app' },
  explore: { test: (path) => /^\/explore\/(?:new|upcoming)\/?$/i.test(path), root: 'se-store-explore' },
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
};
const ROWS = ['front', 'explore'];
const STORE_CLASS = 'se-store';
const ROWS_CLASS = 'se-store-rows';

/** @type {{ css?: string, js?: string, on?: (keyof typeof PAGES)[] }[]} */
const FILES = [
  { css: 'shared/base.css' },
  { css: 'shared/ui.css' },
  { css: 'shared/modals.css' },
  { css: 'shared/nav.css', js: 'shared/nav.js' },
  { css: 'shared/sale.css', js: 'shared/sale.js' },
  { css: 'shared/scroll-top.css', js: 'shared/scroll-top.js' },
  { css: 'front/hero.css', js: 'front/hero.js', on: ['front'] },
  { css: 'shared/rows.css', js: 'shared/rows.js', on: ROWS },
  { css: 'front/sections.css', on: ['front'] },
  { css: 'front/tabs.css', js: 'front/tabs.js', on: ['front'] },
  { css: 'app/hero.css', js: 'app/hero.js', on: ['app'] },
  { css: 'app/summary.css', js: 'app/summary.js', on: ['app'] },
  { css: 'app/about.css', js: 'app/about.js', on: ['app'] },
  { css: 'app/hidden.css', on: ['app'] },
  { css: 'app/purchase.css', js: 'app/purchase.js', on: ['app'] },
  { css: 'explore/page.css', js: 'explore/page.js', on: ['explore'] },
  { css: 'charts/page.css', on: ['charts'] },
  { css: 'labs/page.css', js: 'labs/page.js', on: ['labs'] },
  { css: 'dlc/page.css', js: 'dlc/page.js', on: ['dlc'] },
  { css: 'nextfest/page.css', js: 'nextfest/page.js', on: ['nextfest'] },
  { css: 'steam-awards/page.css', js: 'steam-awards/page.js', on: ['awards'] },
  { css: 'steam-awards-archive/page.css', js: 'steam-awards-archive/page.js', on: ['awardsArchive'] },
  { css: 'replay/page.css', on: ['replay'] },
  { css: 'marketing/page.css', on: ['marketing'] },
  { css: 'subscriber-agreement/page.css', js: 'subscriber-agreement/page.js', on: ['ssa'] },
  { css: 'legal/page.css', js: 'legal/page.js', on: ['legal'] },
  { css: 'account/page.css', js: 'account/page.js', on: ['account'] },
  { css: 'account/table.css', on: ['accountHistory', 'accountLicenses'] },
  { css: 'account-history/page.css', js: 'account-history/page.js', on: ['accountHistory'] },
  { css: 'account-licenses/page.css', js: 'account-licenses/page.js', on: ['accountLicenses'] },
  { css: 'account-funds/page.css', js: 'account-funds/page.js', on: ['addFunds'] },
  { css: 'account-redeem/page.css', on: ['redeem'] },
  { css: 'account-phone/page.css', js: 'account-phone/page.js', on: ['phone'] },
  { css: 'parental/page.css', js: 'parental/page.js', on: ['parental'] },
];

const version = new URL(import.meta.url).searchParams.get('v');
const asset = (file) => {
  const url = new URL(file, import.meta.url);
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

const startScript = async (file) => {
  dom ??= import(asset('shared/dom.js'));
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
  const matched = new Set(Object.keys(PAGES).filter((page) => PAGES[page].test(path)));

  root.classList.add(STORE_CLASS);
  for (const [page, { root: className }] of Object.entries(PAGES)) {
    if (className) root.classList.toggle(className, matched.has(page));
  }
  root.classList.toggle(ROWS_CLASS, ROWS.some((page) => matched.has(page)));

  for (const file of FILES) {
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
// Client-side navigation (React Router): the Navigation API reports every URL change.
window.navigation?.addEventListener('currententrychange', apply);
addEventListener('popstate', apply);

window.__seStore = {
  destroy() {
    window.navigation?.removeEventListener('currententrychange', apply);
    removeEventListener('popstate', apply);
    while (destroys.length) destroys.pop()();
    document.querySelectorAll('link[data-se-feature]').forEach((link) => link.remove());
    root.classList.remove(STORE_CLASS, ROWS_CLASS, ...Object.values(PAGES).map((page) => page.root).filter(Boolean));
    loaded.clear();
    delete window.__seStore;
  },
};
