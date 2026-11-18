/*
 * Which Home shows: the theme's, or Steam's own (the Steam Enhanced | Steam switch beside the
 * Home stage menu's title, stage-settings.js; localStorage se-home-mode). Steam puts Steam's
 * Home back at once; a button over it brings the theme's back. stage.js asks homeMode() and
 * paints that button (paintBackButton).
 */
((SE) => {
  const ns = window.__seHomeStageParts;
  if (!ns) return;
  const { schedule } = ns;

  const MODE_KEY = 'se-home-mode';

  function homeMode() {
    try {
      return localStorage.getItem(MODE_KEY) === 'steam' ? 'steam' : 'theme';
    } catch {
      return 'theme';
    }
  }

  function setHomeMode(mode) {
    try {
      if (mode === 'steam') localStorage.setItem(MODE_KEY, 'steam');
      else localStorage.removeItem(MODE_KEY);
    } catch {
      // storage refused: the switch still holds for this session
    }
    schedule();
  }

  let back = null;

  /** On Steam's Home (Home: Steam), the way back: a button at its top, `home` its container. */
  function paintBackButton(home) {
    if (!home) {
      back?.remove();
      return;
    }
    if (!back) {
      back = document.createElement('div');
      back.className = 'se-hs-back';
      back.innerHTML = '<button type="button">Use Steam Enhanced Home</button>';
      back.firstChild.addEventListener('click', () => setHomeMode('theme'));
    }
    if (home.firstElementChild !== back) home.prepend(back);
  }

  Object.assign(ns, { homeMode, paintBackButton, setHomeMode });
})(window.__se);
