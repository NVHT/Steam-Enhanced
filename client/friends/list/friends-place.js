/*
 * The Friends window opens where it was last, second screen included. Steam saves its place
 * without the monitor and keeps a second screen only on its startup reopen, so any later open
 * landed on the primary. Its place (and the screen it sat on) is kept here as the window hides
 * or closes and restored when the window opens; if that screen is gone, it stays where Steam
 * put it.
 */
((SE) => {
  window.__seFriendsPlace?.destroy();
  const root = document.documentElement;
  if (!root.classList.contains('friendsui-container') || !root.classList.contains('SavedDimensionsPopup')) return;

  const KEY = 'se-friends-place';
  // A move is done once the window reports the new place; give up after this many frames
  const SETTLE_FRAMES = 60;

  const steamWindow = () => SE.run(() => window.SteamClient.Window);
  const screenBox = () => [screen.availLeft, screen.availTop, screen.availWidth, screen.availHeight].join(',');

  function save() {
    // Maximized or zero-sized (minimized, being torn down): nothing worth keeping
    if (!outerWidth || !outerHeight) return;
    if (outerWidth >= screen.availWidth && outerHeight >= screen.availHeight) return;
    SE.run(() => localStorage.setItem(KEY, JSON.stringify({
      x: screenX, y: screenY, scale: devicePixelRatio, screen: screenBox(),
    })));
  }

  const read = () => SE.run(() => {
    const place = JSON.parse(localStorage.getItem(KEY));
    return Number.isFinite(place?.x) && Number.isFinite(place?.y) && place.scale > 0 ? place : null;
  });

  let frame = 0;

  // Once per document: a JS reload must not pull back a window moved since
  function restore() {
    if (root.dataset.sePlaced) return;
    root.dataset.sePlaced = '1';
    const place = read();
    const win = steamWindow();
    if (!place || !win || (screenX === place.x && screenY === place.y)) return;
    const from = { x: screenX, y: screenY, scale: devicePixelRatio };
    SE.run(() => win.MoveTo(place.x, place.y, place.scale));
    let frames = 0;
    const settle = () => {
      frame = 0;
      if (screenX !== place.x || screenY !== place.y) {
        if (++frames < SETTLE_FRAMES) frame = requestAnimationFrame(settle);
        return;
      }
      // Landed on another screen than the saved one (unplugged, rearranged): back to Steam's place
      if (place.screen && screenBox() !== place.screen) SE.run(() => win.MoveTo(from.x, from.y, from.scale));
    };
    frame = requestAnimationFrame(settle);
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') save();
  };

  window.addEventListener('pagehide', save);
  window.addEventListener('blur', save);
  document.addEventListener('visibilitychange', onVisibility);
  restore();

  window.__seFriendsPlace = {
    destroy() {
      cancelAnimationFrame(frame);
      window.removeEventListener('pagehide', save);
      window.removeEventListener('blur', save);
      document.removeEventListener('visibilitychange', onVisibility);
      delete window.__seFriendsPlace;
    },
  };
})(window.__se);
