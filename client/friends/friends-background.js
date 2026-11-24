/*
 * Suppress automatic desktop Friends popup window creation on startup while preserving overlay and
 * manual opens. One exception: a Friends window left open when Steam closed comes back, as in
 * plain Steam. Steam's C++ side says so at startup (the desktop app's
 * m_bShowFriendsListOnLoadFromLoader) and hands the first popup the window's last place
 * (LoaderWindowRestoreDetails), the only restore that keeps a second screen; a window opened
 * later from the dock restores in-session and lands on the primary.
 */
((SE) => {
  window.__seFriendsBackground?.destroy();

  let destroyed = false;
  const patchedApps = new Map();
  const patchedOwners = new Map();
  const patchedRestores = new Map();
  const reopened = new WeakSet();

  // After Steam's startup restore: the Friends window, if it was open at exit, through the dock's
  // "Open window" (so the dock lets it through, as for a manual open)
  function reopenIfLeftOpen(app) {
    if (destroyed || reopened.has(app)) return;
    if (SE.run(() => app.m_DesktopApp?.m_bShowFriendsListOnLoadFromLoader) !== true) return;
    const show = patchedApps.get(app)?.original;
    if (typeof show !== 'function') return;
    reopened.add(app);
    const open = () => show.call(app, true);
    const dock = window.__seFriendsDock;
    SE.run(() => (typeof dock?.openWindow === 'function' ? dock.openWindow(open) : open()));
  }

  function suppressRestore(app) {
    const ui = SE.run(() => app?.UIStore);
    if (destroyed || !ui || patchedRestores.has(ui) || typeof ui.RestoreFromStateObject !== 'function') return;
    const own = Object.getOwnPropertyDescriptor(ui, 'RestoreFromStateObject');
    if (own && !own.configurable) return;
    const original = ui.RestoreFromStateObject;
    const wrapper = function (state, _suppressPopups, ...args) {
      const result = original.call(this, state, true, ...args);
      reopenIfLeftOpen(app);
      return result;
    };
    Object.defineProperty(ui, 'RestoreFromStateObject', { configurable: true, writable: true, value: wrapper });
    patchedRestores.set(ui, { own, wrapper });
  }

  const patchFriendsApp = (app) => {
    if (!app || patchedApps.has(app) || typeof app.ShowPopupFriendsListAtStartup !== 'function') {
      return;
    }
    const own = Object.getOwnPropertyDescriptor(app, 'ShowPopupFriendsListAtStartup');
    const original = app.ShowPopupFriendsListAtStartup;
    if (own && !own.configurable) return;

    const blocked = function (browser, ...rest) {
      const isOverlay =
        Number(browser?.m_unPID) > 0 ||
        (typeof this?.BIsOverlayBrowserContext === 'function' &&
          this.BIsOverlayBrowserContext(browser));
      if (isOverlay) {
        return original.call(this, browser, ...rest);
      }
      return undefined;
    };

    try {
      Object.defineProperty(app, 'ShowPopupFriendsListAtStartup', {
        configurable: true,
        writable: true,
        value: blocked,
      });
      patchedApps.set(app, { own, blocked, original });
    } catch {}
  };

  const restoreApp = (app) => {
    const saved = patchedApps.get(app);
    if (!saved) return;
    try {
      if (app.ShowPopupFriendsListAtStartup === saved.blocked) {
        if (saved.own) Object.defineProperty(app, 'ShowPopupFriendsListAtStartup', saved.own);
        else delete app.ShowPopupFriendsListAtStartup;
      }
    } catch {}
    patchedApps.delete(app);
  };

  // Every owner trapped and its app patched: the setter covers any later app, so polling can stop.
  const settled = () =>
    [...SE.owners()].every(owner => {
      const app = SE.run(() => owner.g_FriendsUIApp);
      return patchedOwners.has(owner) && !!app && patchedApps.has(app) && patchedRestores.has(SE.run(() => app.UIStore));
    });

  const scanOwners = () => {
    const reachableApps = new Set();
    for (const owner of SE.owners()) {
      try {
        reachableApps.add(owner.g_FriendsUIApp);
        patchFriendsApp(owner.g_FriendsUIApp);
        suppressRestore(owner.g_FriendsUIApp);
        if (patchedOwners.has(owner)) continue;

        const descriptor = Object.getOwnPropertyDescriptor(owner, 'g_FriendsUIApp');
        if (
          descriptor &&
          (!descriptor.configurable || !('value' in descriptor) || !descriptor.writable)
        ) {
          continue;
        }

        let currentValue = descriptor?.value;
        const get = () => currentValue;
        const set = (nextValue) => {
          if (currentValue !== nextValue) restoreApp(currentValue);
          currentValue = nextValue;
          patchFriendsApp(nextValue);
          queueMicrotask(() => SE.run(() => suppressRestore(nextValue)));
        };
        Object.defineProperty(owner, 'g_FriendsUIApp', {
          configurable: true,
          enumerable: descriptor?.enumerable ?? true,
          get,
          set,
        });
        patchedOwners.set(owner, { descriptor, get, set });
      } catch {}
    }

    for (const app of [...patchedApps.keys()]) {
      if (!reachableApps.has(app)) restoreApp(app);
    }
  };

  let timer = null;
  scanOwners();
  // Keeps checking (cheaply) after everything is patched: Steam can swap an app's UIStore later.
  timer = SE.poll(scanOwners, settled() ? 2000 : 1000);

  window.__seFriendsBackground = {
    destroy() {
      destroyed = true;
      timer?.disconnect();
      for (const [owner, saved] of patchedOwners) {
        try {
          const current = Object.getOwnPropertyDescriptor(owner, 'g_FriendsUIApp');
          if (current?.get !== saved.get || current?.set !== saved.set) continue;
          const value = owner.g_FriendsUIApp;
          if (saved.descriptor) {
            Object.defineProperty(owner, 'g_FriendsUIApp', { ...saved.descriptor, value });
          } else if (value !== undefined) {
            Object.defineProperty(owner, 'g_FriendsUIApp', {
              configurable: true,
              enumerable: true,
              writable: true,
              value,
            });
          } else {
            delete owner.g_FriendsUIApp;
          }
        } catch {}
      }
      for (const app of [...patchedApps.keys()]) restoreApp(app);
      for (const [ui, { own, wrapper }] of patchedRestores) {
        SE.run(() => {
          if (ui.RestoreFromStateObject !== wrapper) return;
          if (own) Object.defineProperty(ui, 'RestoreFromStateObject', own);
          else delete ui.RestoreFromStateObject;
        });
      }
      patchedRestores.clear();
      patchedOwners.clear();
      patchedApps.clear();
      delete window.__seFriendsBackground;
    },
  };
})(window.__se);
