/*
 * Community loader: which files each Steam Community page gets (steamcommunity.com). The
 * mechanics are core/site-loader.js; this is the config. core/core.js loads this module with
 * ?v=<theme version>, and every file (the site loader included) is requested with the same one.
 *
 * <html> gets .se-community and one class per matched page (.se-community-dmca ...). The
 * store's tokens (store/shared/base.css) cover this site too. Every redesigned classic page
 * also matches `ui` (.se-community-ui): the shared frame, buttons, avatars and comments.
 *
 * Layout:
 *   shared/        ui.css: what the redesigned classic pages share; small-header.css: the
 *                  profile sub-page header card (inventory, activity settings, edit profile)
 *   dmca/          Notice of Copyright Infringement (/dmca/create/)
 *   profile/       Profile (/id/<name>, /profiles/<steamid>)
 *   activity/      Friend Activity and My Activity (/id/<name>/home, /id/<name>/myactivity)
 *   activity-settings/  Friend Activity Settings (/id/<name>/blotteredit)
 *   inventory/     Item inventory (/id/<name>/inventory)
 *   edit-profile/  Edit Profile (/id/<name>/edit/info, /edit/avatar... every tab)
 *   hub/           Community Hub (/app/<id> and its tabs)
 *   discussions/   Discussions (/discussions/, hub and group forums, topics)
 */
const versioned = (file) => {
  const url = new URL(file, import.meta.url);
  url.search = new URL(import.meta.url).search;
  return url.href;
};
const { start } = await import(versioned('../core/site-loader.js'));

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
const isDiscussions = (path) =>
  /^\/discussions(?:\/|$)/i.test(path) ||
  /^\/(?:app\/\d+|groups\/[^/]+)\/(?:discussions|tradingforum|eventcomments)(?:\/|$)/i.test(path);

const classic = [isProfile, isActivity, isActivitySettings, isInventory, isEditProfile, isHub, isDiscussions];

start({
  base: import.meta.url,
  siteClass: 'se-community',
  global: '__seCommunity',
  pages: {
    ui: { test: (path) => classic.some((test) => test(path)), root: 'se-community-ui' },
    dmca: { test: (path) => /^\/dmca(?:\/|$)/i.test(path), root: 'se-community-dmca' },
    profile: { test: isProfile, root: 'se-community-profile' },
    activity: { test: isActivity, root: 'se-community-activity' },
    activitySettings: { test: isActivitySettings, root: 'se-community-activity-settings' },
    inventory: { test: isInventory, root: 'se-community-inventory' },
    editProfile: { test: isEditProfile, root: 'se-community-edit-profile' },
    hub: { test: isHub, root: 'se-community-hub' },
    discussions: { test: isDiscussions, root: 'se-community-discussions' },
  },
  files: [
    { css: '../store/shared/base.css' },
    { css: 'shared/ui.css', on: ['ui'] },
    { css: 'shared/small-header.css', on: ['inventory', 'activitySettings', 'editProfile'] },
    { css: 'dmca/page.css', js: 'dmca/page.js', on: ['dmca'] },
    { css: 'profile/page.css', js: 'profile/page.js', on: ['profile'] },
    { css: 'activity/page.css', js: 'activity/page.js', on: ['activity'] },
    { css: 'activity-settings/page.css', js: 'activity-settings/page.js', on: ['activitySettings'] },
    { css: 'inventory/page.css', js: 'inventory/page.js', on: ['inventory'] },
    { css: 'edit-profile/page.css', js: 'edit-profile/page.js', on: ['editProfile'] },
    { css: 'hub/page.css', js: 'hub/page.js', on: ['hub'] },
    { css: 'discussions/page.css', js: 'discussions/page.js', on: ['discussions'] },
  ],
});
