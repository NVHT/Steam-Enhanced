/*
 * The Friends window opens where it was last, second screen included. Steam saves its place
 * without the monitor and keeps a second screen only on its startup reopen, so any later open
 * landed on the primary. Here the window's own restore details (SteamClient.Window
 * GetWindowRestoreDetails: Steam's string for its place, size and screen, the kind its startup
 * reopen uses) are kept each time it moves, resizes or hides, and handed back to Steam
 * (RestoreWindowSizeAndPosition) when the window opens. Steam's own restore, not a move by
 * coordinates: a screen with another scale, or set apart from the first, maps its pixels
 * differently, and a MoveTo from CSS pixels landed between the screens.
 */
((SE) => {
  window.__seFriendsPlace?.destroy();
  const root = document.documentElement;
  if (!root.classList.contains('friendsui-container') || !root.classList.contains('SavedDimensionsPopup')) return;

  const KEY = 'se-friends-restore';
  // A move reports on every step of a drag: keep the place once it has rested this long
  const SAVE_DELAY_MS = 300;

  const steamWindow = () => SE.run(() => window.SteamClient.Window);
  const details = () => {
    const win = steamWindow();
    return typeof win?.GetWindowRestoreDetails === 'function' ? Promise.resolve(win.GetWindowRestoreDetails()) : Promise.resolve('');
  };

  let destroyed = false;
  let timer = 0;

  function save() {
    clearTimeout(timer);
    timer = 0;
    // Maximized or zero-sized (minimized, being torn down): nothing worth keeping
    if (!outerWidth || !outerHeight || (outerWidth >= screen.availWidth && outerHeight >= screen.availHeight)) return;
    details()
      .then((text) => {
        if (!destroyed && typeof text === 'string' && text) SE.run(() => localStorage.setItem(KEY, text));
      })
      .catch(() => {});
  }
  const saveSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY_MS);
  };

  // Once per document: a JS reload must not pull back a window moved since
  function restore() {
    if (root.dataset.sePlaced) return;
    root.dataset.sePlaced = '1';
    const saved = SE.run(() => localStorage.getItem(KEY));
    const win = steamWindow();
    if (!saved || typeof win?.RestoreWindowSizeAndPosition !== 'function') return;
    details()
      .then((now) => {
        if (!destroyed && now !== saved) SE.run(() => win.RestoreWindowSizeAndPosition(saved));
      })
      .catch(() => {});
  }

  // Steam tells a popup window it moved or resized through a message to it
  const onMessage = (event) => {
    if (event.data === 'window_moved' || event.data === 'window_resized') saveSoon();
  };
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') save();
  };

  window.addEventListener('message', onMessage);
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', onVisibility);
  SE.run(() => localStorage.removeItem('se-friends-place')); // the place as coordinates, before this
  restore();

  window.__seFriendsPlace = {
    destroy() {
      destroyed = true;
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      window.removeEventListener('pagehide', save);
      document.removeEventListener('visibilitychange', onVisibility);
      delete window.__seFriendsPlace;
    },
  };
})(window.__se);
