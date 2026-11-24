/*
 * Header actions, part 1 of 2 (client/header/header-actions.js names the feature), listed just
 * before it: what the rail's Settings menu opens (Steam Settings, Millennium, the Library
 * Manager), Reload UI and Restart Steam (SE.reloadUI, SE.restartSteam), and the main window's
 * keyboard shortcuts.
 */
((SE) => {
  window.__seHeaderShortcuts?.destroy();

  function openSteamSettings() {
    if (SE.run(() => window.SteamClient?.URL?.ExecuteSteamURL?.('steam://open/settings')) !== undefined) {
      return;
    }
    location.href = 'steam://open/settings';
  }

  function openMillennium() {
    if (!window.__seMillenniumWindow?.openDirect?.()) {
      window.__seMillenniumWindow?.showError?.();
    }
  }

  // false: a plain restart, as Steam's own Restart buttons make it (true is another kind of restart)
  const restartSteam = (SE.restartSteam = () => SE.steamCall('User', 'StartRestart', false));
  const reloadNow = () => SE.steamCall('Browser', 'RestartJSContext');

  /*
   * Reload UI during a voice call leaves the main window dropping timers and Steam's own menus
   * taking no input until a full restart (CLAUDE.md, Windows and Millennium). So while a call is
   * on it asks first, in Steam's own confirm dialog (SE.steamConfirm, the look of Mark as
   * Private), else the action menu: leave the call and then reload (once Steam says the call is
   * over, giving up after a few seconds rather than reload in it), restart Steam, or cancel.
   * Shared with the Steam menu's rows (client/header/menu/actions.js).
   */
  const ASK = {
    title: "You're in a voice call",
    description: 'Reloading now can leave Steam not responding until it restarts. Leave the call first, or restart Steam (the call ends).',
  };
  const LEAVE_WAIT_MS = 5000;
  const voice = () => SE.global('g_FriendsUIApp', (app) => app.VoiceStore)?.VoiceStore;
  const inCall = () => SE.run(() => voice().IsAnyVoiceActive()) === true;

  function leaveThenReload() {
    SE.run(() => voice().OnUserEndVoiceChat());
    const started = performance.now();
    const check = () => {
      if (!inCall()) reloadNow();
      else if (performance.now() - started < LEAVE_WAIT_MS) setTimeout(check, 150);
    };
    setTimeout(check, 150);
  }

  const reloadUI = (SE.reloadUI = () => {
    if (!inCall()) return reloadNow();
    const asked = SE.steamConfirm?.({
      ...ASK,
      // Short: Steam's buttons share one width, and a longer label wrapped
      ok: 'Leave and reload',
      middle: 'Restart Steam',
      cancel: 'Cancel',
      onOK: leaveThenReload,
      onMiddle: restartSteam,
    });
    if (asked || !SE.layer?.menu) return;
    SE.layer.menu(
      [
        { heading: ASK.title },
        { note: ASK.description },
        { label: 'Leave the call and reload', icon: '--se-icon-refresh', run: leaveThenReload },
        { label: 'Restart Steam', hint: 'The call ends', icon: '--se-icon-restart', run: restartSteam },
        { label: 'Cancel', icon: '--se-icon-close-sm', run: () => {} },
      ],
      // In the middle of the window, a third of the way down: no button opened it
      (width, height) => ({ left: Math.max(0, (innerWidth - width) / 2), top: Math.max(0, (innerHeight - height) / 3) })
    );
  });

  /*
   * Keyboard shortcuts, in the main window: Ctrl+` Steam Settings, Ctrl+Shift+` the theme's
   * settings (client/settings/theme/), Ctrl+1 Millennium (beside
   * Millennium's own Ctrl+2, the Library Manager), Ctrl+R Reload UI, Ctrl+Shift+R Restart Steam
   * (shown on the Settings menu's and the Steam menu's rows). By the key's place (event.code),
   * so they work on any keyboard layout.
   */
  const SHORTCUTS = {
    Backquote: openSteamSettings,
    'Shift+Backquote': () => window.__seThemeSettings?.open(),
    Digit1: openMillennium,
    KeyR: reloadUI,
    'Shift+KeyR': restartSteam,
  };

  function onShortcut(event) {
    if (!event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
    // The Keyboard shortcuts setting (client/shared/settings.js), read at each press
    if (SE.settings?.get('shortcuts') === 'off') return;
    const action = SHORTCUTS[(event.shiftKey ? 'Shift+' : '') + event.code];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  }


  function openLibraryManager() {
    if (window.__seMillenniumWindow?.openLibraryManager) {
      window.__seMillenniumWindow.openLibraryManager();
      return;
    }
    SE.run(() =>
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: '2',
          code: 'Digit2',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        })
      )
    );
  }

  addEventListener('keydown', onShortcut, true);

  window.__seHeaderActionsParts = { openSteamSettings, openMillennium, openLibraryManager };
  window.__seHeaderShortcuts = {
    destroy() {
      removeEventListener('keydown', onShortcut, true);
      delete window.__seHeaderShortcuts;
    },
  };
})(window.__se);
