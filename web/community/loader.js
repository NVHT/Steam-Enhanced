/*
 * Community config: which files each Steam Community page gets (steamcommunity.com). core/core.js
 * hands it to web/shared/site-loader.js, which puts the common files first (common: 'full':
 * tokens, level badges, the web base, the friend card, Steam's dialogs, the dropdown, scroll to
 * top, the spinner) and requests every file with ?v=<theme version>.
 *
 * <html> gets .se-community and one class per matched page (.se-community-dmca ...). Every
 * redesigned classic page also matches `ui` (.se-community-ui): the shared frame, buttons,
 * avatars and comments.
 *
 * Layout:
 *   shared/        ui.css: what the redesigned classic pages share; bbcode.css: Steam's
 *                  formatted text (guides, posts, comments, reviews, profiles); small-header.css: the
 *                  profile sub-page header card (inventory, activity settings, edit profile);
 *                  compose.js: the comment box's formatting row
 *   dmca/          Notice of Copyright Infringement (/dmca/create/)
 *   profile/       Profile (/id/<name>, /profiles/<steamid>)
 *   activity/      Friend Activity and My Activity (/id/<name>/home, /id/<name>/myactivity)
 *   activity-settings/  Friend Activity Settings (/id/<name>/blotteredit)
 *   inventory/     Item inventory (/id/<name>/inventory)
 *   edit-profile/  Edit Profile (/id/<name>/edit/info, /edit/avatar... every tab)
 *   hub/           Community Hub (/app/<id> and its tabs), and the header card of every shared
 *                  item (/sharedfiles/filedetails/); news.css/js: announcement cards and
 *                  the News tab's reader; guides.css/js: the Guides tab on top of page.css
 *   discussions/   Discussions (/discussions/, hub and group forums, topics); home.css/js:
 *                  the Discussions home (/discussions/) on top of page.css
 *   market/        Community Market home (/market/)
 *   review/        A user's review of a game (/id/<name>/recommended/<appid>), also shown in the
 *                  hub's review popup (?insideModal=1)
 *   guides-home/   Steam Guides, the page that explains guides (/guides)
 *   guide/         A guide (/sharedfiles/filedetails/?id=<id>). Every shared item (guides,
 *                  screenshots, workshop items) gets the hub's header card (hub/); guide/ only
 *                  restyles the page when it holds a guide
 */
(() => {
  'use strict';

  // /id/<name> or /profiles/<steamid>, then the rest of the path ('' on the profile itself)
  const PROFILE = /^\/(?:id|profiles)\/[^/]+(\/.*)?$/i;
  const profileRest = (path) => {
    const match = path.match(PROFILE);
    return match ? (match[1] ?? '').replace(/\/+$/, '') : null;
  };

  const isProfile = (path) => profileRest(path) === '';
  const isActivity = (path) =>
    /^\/(?:home|myactivity)$/i.test(profileRest(path) ?? '') || /^\/my\/(?:home|myactivity)(?:\/|$)/i.test(path);
  const isActivitySettings = (path) => /^\/blotteredit$/i.test(profileRest(path) ?? '');
  const isInventory = (path) => /^\/inventory(?:\/|$)/i.test(profileRest(path) ?? '');
  const isEditProfile = (path) => /^\/edit(?:\/|$)/i.test(profileRest(path) ?? '');
  const isHub = (path) => /^\/app\/\d+(?:\/|$)/i.test(path);
  const isHubGuides = (path) => /^\/app\/\d+\/guides(?:\/|$)/i.test(path);
  const isDiscussions = (path) =>
    /^\/discussions(?:\/|$)/i.test(path) ||
    /^\/(?:app\/\d+|groups\/[^/]+)\/(?:discussions|tradingforum|eventcomments)(?:\/|$)/i.test(path);
  const isDiscussionsHome = (path) => /^\/discussions\/?$/i.test(path);
  const isMarket = (path) => /^\/market\/?$/i.test(path);
  const isReview = (path) => /^\/recommended\/\d+$/i.test(profileRest(path) ?? '');
  const isSharedFile = (path) => /^\/sharedfiles\/filedetails\/?$/i.test(path);
  const isGuidesHome = (path) => /^\/guides\/?$/i.test(path);

  const classic = [isProfile, isActivity, isActivitySettings, isInventory, isEditProfile, isHub, isDiscussions, isMarket, isReview, isSharedFile, isGuidesHome];

  window.__seWeb.configure({
    siteClass: 'se-community',
    common: 'full',
    pages: {
      ui: { test: (path) => classic.some((test) => test(path)), root: 'se-community-ui' },
      dmca: { test: (path) => /^\/dmca(?:\/|$)/i.test(path), root: 'se-community-dmca' },
      profile: { test: isProfile, root: 'se-community-profile' },
      activity: { test: isActivity, root: 'se-community-activity' },
      activitySettings: { test: isActivitySettings, root: 'se-community-activity-settings' },
      inventory: { test: isInventory, root: 'se-community-inventory' },
      editProfile: { test: isEditProfile, root: 'se-community-edit-profile' },
      hub: { test: (path) => isHub(path) || isSharedFile(path), root: 'se-community-hub' },
      hubGuides: { test: isHubGuides, root: 'se-community-hub-guides' },
      discussions: { test: isDiscussions, root: 'se-community-discussions' },
      discussionsHome: { test: isDiscussionsHome, root: 'se-community-discussions-home' },
      market: { test: isMarket, root: 'se-community-market' },
      review: { test: isReview, root: 'se-community-review' },
      sharedFile: { test: isSharedFile, root: 'se-community-sharedfile' },
      guidesHome: { test: isGuidesHome, root: 'se-community-guides-home' },
    },
    files: [
      { css: 'shared/ui.css', on: ['ui'] },
      { css: 'shared/ui-comments.css', on: ['ui'] },
      { css: 'shared/bbcode.css', on: ['ui'] },
      { css: 'shared/ui-friends.css', on: ['ui'] },
      { css: 'shared/ui-icons.css', on: ['ui'] },
      { css: 'shared/ui-tooltips.css', on: ['ui'] },
      { css: 'shared/ui-footer.css', on: ['ui'] },
      { js: 'shared/compose.js', on: ['ui'] },
      { css: 'shared/small-header.css', on: ['inventory', 'activitySettings', 'editProfile', 'review'] },
      { css: 'dmca/page.css', js: 'dmca/page.js', on: ['dmca'] },
      { js: 'shared/icons.js', on: ['profile', 'activity'] },
      { css: 'profile/page.css', js: 'profile/page.js', on: ['profile'] },
      { css: 'profile/columns.css', on: ['profile'] },
      { css: 'profile/showcases.css', on: ['profile'] },
      { css: 'profile/recent.css', on: ['profile'] },
      { css: 'profile/side.css', on: ['profile'] },
      { css: 'activity/page.css', js: 'activity/page.js', on: ['activity'] },
      { css: 'activity-settings/page.css', js: 'activity-settings/page.js', on: ['activitySettings'] },
      { css: 'inventory/page.css', js: 'inventory/page.js', on: ['inventory'] },
      { css: 'inventory/grid.css', on: ['inventory'] },
      { css: 'inventory/panel.css', on: ['inventory'] },
      { css: 'edit-profile/page.css', js: 'edit-profile/page.js', on: ['editProfile'] },
      { js: '../shared/select.js', on: ['hub', 'hubGuides', 'discussionsHome'] },
      { css: 'hub/page.css', js: 'hub/page.js', on: ['hub'] },
      { css: 'hub/toolbar.css', on: ['hub'] },
      { css: 'hub/feed.css', on: ['hub'] },
      { css: 'hub/posts.css', on: ['hub'] },
      { css: 'hub/chrome.css', on: ['hub'] },
      { css: 'hub/news.css', js: 'hub/news.js', on: ['hub'] },
      { css: 'hub/guides.css', js: 'hub/guides.js', on: ['hubGuides'] },
      { css: 'discussions/page.css', js: 'discussions/page.js', on: ['discussions'] },
      { js: 'shared/tips.js', on: ['discussionsHome'] },
      { css: 'discussions/home.css', js: 'discussions/home.js', on: ['discussionsHome'] },
      { css: 'discussions/home-tabs.css', on: ['discussionsHome'] },
      { css: 'discussions/home-forums.css', on: ['discussionsHome'] },
      { css: 'discussions/home-games.css', on: ['discussionsHome'] },
      { css: 'market/page.css', js: 'market/page.js', on: ['market'] },
      { css: 'market/tabs.css', on: ['market'] },
      { css: 'market/listings.css', on: ['market'] },
      { css: 'market/history.css', on: ['market'] },
      { css: 'market/sidebar.css', on: ['market'] },
      { css: 'review/page.css', js: 'review/page.js', on: ['review'] },
      { css: 'guide/page.css', js: 'guide/page.js', on: ['sharedFile'] },
      { css: 'guides-home/page.css', js: 'guides-home/page.js', on: ['guidesHome'] },
    ],
  });
})();
