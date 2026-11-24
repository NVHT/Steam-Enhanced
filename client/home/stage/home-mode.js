/*
 * Which Home shows: the theme's, or Steam's own (the Home setting, SE.settings: the title bar's
 * Home switch, client/header/header-actions.js; the settings window's Home tab; the switch beside
 * the Home stage menu's title, stage-settings.js). Steam puts Steam's Home back at once; stage.js
 * asks homeMode(). A change reaches the stage through stage-settings.js's settings listener.
 */
((SE) => {
  const ns = window.__seHomeStageParts;
  if (!ns) return;

  const homeMode = () => (SE.settings?.get('home') === 'steam' ? 'steam' : 'theme');
  const setHomeMode = (mode) => SE.settings?.set('home', mode === 'steam' ? 'steam' : 'theme');

  // The choice kept before the settings window (localStorage se-home-mode): moved in once
  const OLD_KEY = 'se-home-mode';
  SE.run(() => {
    if (localStorage.getItem(OLD_KEY) === 'steam') setHomeMode('steam');
    localStorage.removeItem(OLD_KEY);
  });

  Object.assign(ns, { homeMode, setHomeMode });
})(window.__se);
