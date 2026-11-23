/*
 * Dialog launcher: a theming aid. Ctrl+Shift+D (loaded on demand by core/core.js) in a client
 * window opens a panel that shows Steam's dialogs on demand, so client/dialogs/ can be checked
 * without hunting for each one. Ctrl+Shift+D again hides the panel; Stop removes the launcher.
 *
 * Real (Steam opens them itself, on the game picked at the top):
 *   Steam commands     steam:// links Steam handles (SteamClient.URL.ExecuteSteamURL)
 *   Steam calls        SteamClient methods that open a dialog or window
 *   Steam functions    Steam's own show functions (desktop, then Steam Deck), found in its bundles
 *                      by the text their dialog shows
 * Their buttons are live: an entry marked "acts" does something when opened, one marked
 * "confirm acts" does it if its dialog is confirmed. Commands that only change something
 * (status, settings, exit) are left out.
 *
 * Mock (Steam's own React components, shown through Steam's own modal call; nothing acts):
 *   Generic dialog     Steam's confirm dialog in each of its forms, with harmless callbacks
 *   Recorded           every dialog Steam shows while the launcher is loaded (in any window of
 *                      this JS context) is kept for this session and can be shown again: its
 *                      component and props, with every onX / fnX callback replaced by a no-op
 *
 * Steam's internals are found by what their source says, not by module ids or export names
 * (both change between builds); an entry whose piece isn't found is shown greyed out.
 */
(() => {
  if (window.__seDialogLauncher) {
    window.__seDialogLauncher.toggle();
    return;
  }
  const SE = window.__se;
  if (!SE || !document.body) return;

  const fnSource = (fn) => {
    try {
      return Function.prototype.toString.call(fn);
    } catch {
      return '';
    }
  };
  const exportWhere = (exports, test) => {
    for (const value of Object.values(exports || {})) {
      if (typeof value === 'function' && SE.run(() => test(value))) return value;
    }
    return null;
  };
  // A module whose source has every one of `needles`, and what `pick(exports, src, req)` takes from it.
  const moduleWith = (key, needles, pick) => SE.findModule(`dev:dialogs:${key}`, (src, id, req) => {
    if (!needles.every((needle) => src.includes(needle))) return null;
    const exports = SE.run(() => req(id));
    return exports ? pick(exports, src, req) : null;
  });

  /*
   * Steam's modal call (show(element, window, options)), its confirm dialog component, React,
   * and the modal manager's prototype (for recording).
   */
  const steam = (() => {
    const showModule = moduleWith('show', ['Conflicting popout options'], (exports, src, req) => {
      const show = exportWhere(exports, (fn) => fnSource(fn).includes('bHideMainWindowForPopouts:!0'));
      // The manager: `const h=(0,r.tx)(m),F=w?.bForcePopOut...` names the module and its getter
      const [, alias, getter] = src.match(/=\(0,([\w$]+)\.([\w$]+)\)\(\w+\),\w+=\w+\?\.bForcePopOut/) || [];
      const managerOf = alias ? SE.run(() => SE.importOf(src, alias, req)?.[getter]) : null;
      return show ? { show, managerOf } : null;
    });
    const dialogModule = moduleWith('confirm', ['bProgressDialog', '#Error_FailureNotice'], (exports, src, req) => {
      const confirm = exportWhere(exports, (fn) => fnSource(fn).includes('bProgressDialog'));
      const failure = exportWhere(exports, (fn) => fnSource(fn).includes('#Error_FailureNotice') && !fnSource(fn).includes('bProgressDialog'));
      const [, reactAlias] = src.match(/([\w$]+)\.useId\(\)/) || [];
      const React = reactAlias ? SE.run(() => SE.importOf(src, reactAlias, req)) : null;
      return confirm && React?.createElement ? { confirm, failure, React } : null;
    });
    return { ...showModule, ...dialogModule };
  })();

  /*
   * A Steam show function: from the module whose source has every one of `needles` (text its
   * dialog shows), the export whose own source passes `test`.
   */
  const steamFunction = (key, needles, test) => moduleWith(`fn:${key}`, needles, (exports) =>
    exportWhere(exports, (fn) => test(fnSource(fn))));
  const has = (...parts) => (src) => parts.every((part) => src.includes(part));
  // A one-line show function: `function f(w){(0,x.pg)((0,e.jsx)(C,{}),w)}`, maybe returned
  const tiny = (src) => /^(?:async )?function [\w$]+\([\w$]*\)\{(?:return)?\(0,[\w$]+\.pg\)/.test(src);

  const noop = () => Promise.resolve();
  const isCallback = (name) => /^(on|fn)[A-Z]/.test(name);
  let reopening = false;

  const showMock = (type, props) => {
    if (!steam.show || !steam.React) return;
    reopening = true;
    try {
      steam.show(steam.React.createElement(type, props), window);
    } finally {
      reopening = false;
    }
  };

  // Recording: every element Steam hands its modal manager, until Stop
  const recorded = [];
  let unrecord = null;
  const record = (element, title, where) => {
    if (reopening || !element?.type || !element.props) return;
    const type = element.type;
    const name = title || type.displayName || type.name || 'Dialog';
    const last = recorded[recorded.length - 1];
    if (last && last.type === type && last.name === name) return;
    recorded.push({ type, props: element.props, name: `${name} (${where})`, at: new Date() });
    renderList();
  };
  const startRecording = () => {
    const manager = steam.managerOf && SE.run(() => steam.managerOf(window));
    const proto = manager && Object.getPrototypeOf(manager);
    if (!proto?.ShowModal || !proto.ShowLegacyPopupModal) return;
    const { ShowModal, ShowLegacyPopupModal } = proto;
    proto.ShowModal = function (element, ...rest) {
      SE.run(() => record(element, '', 'in window'));
      return ShowModal.call(this, element, ...rest);
    };
    proto.ShowLegacyPopupModal = function (title, element, ...rest) {
      SE.run(() => record(element, typeof title === 'string' ? title : '', 'popup'));
      return ShowLegacyPopupModal.call(this, title, element, ...rest);
    };
    unrecord = () => {
      proto.ShowModal = ShowModal;
      proto.ShowLegacyPopupModal = ShowLegacyPopupModal;
    };
  };
  const neutralized = (props) => {
    const out = {};
    for (const [key, value] of Object.entries(props)) {
      if (key === 'closeModal') continue; // Steam's modal call gives it a new one
      out[key] = typeof value === 'function' && isCallback(key) ? noop : value;
    }
    return out;
  };

  // The game the real entries act on: installed games first, most recently played first
  const games = () => {
    const store = SE.appStore();
    const all = SE.run(() => [...store.allApps]) || [];
    return all
      .filter((app) => app?.app_type === 1)
      .map((app) => ({ appid: app.appid, name: app.display_name, installed: !!SE.isInstalled(app), played: app.rt_last_time_played || 0 }))
      .sort((a, b) => (b.installed - a.installed) || (b.played - a.played))
      .slice(0, 300);
  };
  let appid = 0;
  const overview = () => SE.run(() => SE.appStore()?.GetAppOverviewByAppID(appid));
  const url = (path) => () => SE.steamCall('URL', 'ExecuteSteamURL', `steam://${path}`);
  const call = (namespace, method, args) => () => SE.steamCall(namespace, method, ...args());

  const confirmProps = (extra) => ({
    strTitle: 'Dialog title',
    strDescription: 'A line of description, the kind Steam puts in its confirm dialogs. It wraps when it runs long enough to need a second line.',
    strOKButtonText: 'Confirm',
    strCancelButtonText: 'Cancel',
    onOK: noop,
    onCancel: noop,
    ...extra,
  });

  /*
   * Steam's own show functions (sp.js), each found by text its dialog shows and called as Steam
   * calls it: [group, name, module needles, test on the function's source, args, note]. Left out:
   * the ones that only open from inside a button (React components), the ones needing Steam
   * objects the launcher can't make (chat groups, screenshots, a EULA workflow, cloud conflicts:
   * Recorded catches those), and Restart / Shut down PC, which act before any dialog.
   */
  const none = () => {};
  const STEAM_FUNCTIONS = [
    ['Steam functions', 'New collection', ['#GameAction_NewCollectionDialogTitle'], has('#GameAction_NewCollectionDialogTitle'),
      () => [window, overview() ? [overview()] : [], 'se-dialog-launcher'], 'game, confirm acts'],
    ['Steam functions', 'Exit game', ['#GameAction_ConfirmExitGameTitle'], has('#GameAction_ConfirmExitGameTitle'),
      () => [String(appid), appid, none, none, window], 'game'],
    ['Steam functions', 'Stop streaming', ['#GameAction_ConfirmStopStreamingTitle'], has('#GameAction_ConfirmStopStreamingTitle'),
      () => [String(appid), none, none, window], 'game'],
    ['Steam functions', 'Artwork viewer', ['nMaxScreenPercentage', 'bHideShareButton'], has('nMaxScreenPercentage'),
      () => [{ strURL: SE.run(() => SE.heroURLs(appid)?.[0]) || '', strTitle: overview()?.display_name || '' }], 'game'],
    ['Steam functions', 'Back up games', ['#BackupApps_Title'], (src) => src.includes('#BackupApps_Title') && !src.includes('apps:'),
      () => [window]],
    ['Steam functions', 'Back up this game', ['#BackupApps_Title'], has('#BackupApps_Title', 'apps:'),
      () => [[appid], window], 'game'],
    ['Steam functions', 'Move install folder', ['#ContentManagement_MoveApps_Title'], has('#ContentManagement_MoveApps_Title'),
      () => [[appid], window], 'game, confirm acts'],
    ['Steam functions', 'Uninstall failed', ['#UninstallDialog_Title'], has('#UninstallDialog_Title', 'eError'),
      () => [appid, 2], 'game'],
    ['Steam functions', 'Family-shared game', ['#BorrowGameDialog_Description_InFamily'], has('GetAppOverviewByGameID'),
      () => [String(appid), window], 'a borrowed game'],
    ['Steam functions', 'Steam Input notice', ['k_eIntroToSteamInputGames'], has('k_eIntroToSteamInputGames'),
      () => [appid, none, none], 'game'],
    ['Steam functions', 'Activation failed', ['#Activate_InvalidCode_Headline'], tiny, () => [window]],
    ['Steam functions', 'Video unsupported', ['#VideoError_PlaybackUnsupported'], has('#VideoError_PlaybackUnsupported'), () => [window]],
    ['Steam functions', 'Network sign-in page', ['strManualCaptivePortalURL'], has('strManualCaptivePortalURL'),
      () => [window, 'https://store.steampowered.com/']],
    ['Steam functions', 'Go online', ['#UserManagement_GoOnline_Desc'], has('#UserManagement_GoOnline_Desc'), () => [window, true], 'confirm acts'],
    ['Steam functions', 'Restart required', ['#Settings_RestartRequired_Title'], has('#Settings_RestartRequired_Title'), () => [{}], 'confirm acts'],
    ['Steam functions', 'Hardware survey prompt', ['#SteamUI_ValveSurvey_PromptLabel'], has('#SteamUI_ValveSurvey_PromptLabel'), () => [window], 'confirm acts'],
    ['Steam functions', 'Hardware survey', ['#SteamUI_ValveSurvey_PromptLabel'], (src) => tiny(src) && !src.includes('PromptLabel'), () => [window], 'confirm acts'],
    ['Steam functions', 'Remote Play PIN', ['#RemoteDevicePIN_Title'], has('#RemoteDevicePIN_Title'), () => [window], 'confirm acts'],
    ['Steam functions', 'Friends settings', ['#FriendSettings_Title'], has('#FriendSettings_Title'), () => [null, window, undefined]],
    ['Steam functions', 'Create a group chat', ['"CreateChatDialog"'], has('CreateChatDialog'), () => [null, window], 'confirm acts'],
    ['Steam functions', 'Still in voice chat', ['"ActiveVoiceAlert"'], has('ActiveVoiceAlert'), () => [window], 'unless turned off'],
    ['Steam Deck functions', 'System update (BIOS)', ['#Settings_Updates_ScaryBIOSWarningTitle'], has('sOverrideAutoMessage'), () => [none, none, undefined]],
    ['Steam Deck functions', 'Firmware update', ['#Settings_Updates_BlankScreenWarning_Title'], (src) => src.includes('onOK:') && !src.includes('sOverrideAutoMessage'), () => [none, none]],
    ['Steam Deck functions', 'Dock firmware update', ['#SteamDock_UnsupportedFirmwareModal_Title'], has('IsLockScreenActive'), () => [], 'confirm acts'],
    ['Steam Deck functions', 'Proxy settings', ['#Settings_Internet_Proxy_Settings'], tiny, () => [window], 'confirm acts'],
    ['Steam Deck functions', 'Keyboard layouts', ['#KeyboardLayout_Select'], tiny, () => [window], 'confirm acts'],
    ['Steam Deck functions', 'Controller order', ['#QuickAccess_ReorderControllers_Reorder'], has('ownerWindow'), () => [{ ownerWindow: window }], 'confirm acts'],
    ['Steam Deck functions', 'Battery info', ['#QuickAccess_Tab_Perf_BatteryFullDetailsTitle'], has('fnOnClose'), () => [none]],
  ];

  /*
   * [group, name, run, note]: `run` opens it; `note` is "acts" / "confirm acts" or what the
   * entry needs. A function that returns false means its piece wasn't found.
   */
  const ENTRIES = [
    ['Steam commands', 'Activate a product', url('open/activateproduct')],
    ['Steam commands', 'Add a non-Steam game', url('open/addnonsteamgame')],
    ['Steam commands', 'Game servers', url('open/servers')],
    ['Steam commands', 'System information', url('open/systeminfo')],
    ['Steam commands', 'System report', url('open/systemreport')],
    ['Steam commands', 'About Steam', url('open/about')],
    ['Steam commands', 'Change email', url('open/changeemail')],
    ['Steam commands', 'Settings', url('open/settings')],
    ['Steam commands', 'Screenshots', url('open/screenshots')],
    ['Steam commands', 'Friends list', url('open/friends')],
    ['Steam commands', 'Games list (small)', url('open/minigameslist')],
    ['Steam commands', 'Games list (large)', url('open/largegameslist')],
    ['Steam commands', 'Restore a backup', url('open/restoredialog')],
    ['Steam commands', 'Guest passes', url('guestpasses')],
    ['Steam commands', 'Add a friend', url('friends/add')],
    ['Steam commands', 'Check for updates', url('checkforupdates'), 'acts'],
    ['Steam commands', 'Sign out', url('signout'), 'confirm acts'],
    ['Steam commands', 'Change account', url('changeuser'), 'confirm acts'],
    ['Steam commands', 'Back up game', () => url(`backup/${appid}`)(), 'game'],
    ['Steam commands', 'CD keys', () => url(`cdkeys/${appid}`)(), 'game'],
    ['Steam commands', 'Install', () => url(`install/${appid}`)(), 'game, confirm acts'],
    ['Steam commands', 'Uninstall', () => url(`uninstall/${appid}`)(), 'game, confirm acts'],
    ['Steam commands', 'Verify files', () => url(`validate/${appid}`)(), 'game, acts'],
    ['Steam commands', 'Controller configuration', url('currentcontrollerconfig')],
    ['Steam commands', 'Running app controls', url('open/apprunningcontrols')],
    ['Steam calls', 'Game properties', call('Apps', 'OpenAppSettingsDialog', () => [appid, '']), 'game'],
    ['Steam calls', 'Controller configurator', call('Apps', 'ShowControllerConfigurator', () => [appid]), 'game'],
    ['Steam calls', 'Install wizard', call('Installs', 'OpenInstallWizard', () => [[appid]]), 'game, confirm acts'],
    ['Steam calls', 'Uninstall wizard', call('Installs', 'OpenUninstallWizard', () => [[appid], false]), 'game, confirm acts'],
    ...STEAM_FUNCTIONS.map(([group, name, needles, test, args, note]) => [group, name, () => {
      const fn = steamFunction(name, needles, test);
      if (!fn) return false;
      fn(...args());
    }, note]),
    ['Generic dialog', 'Confirm', () => (steam.confirm ? showMock(steam.confirm, confirmProps()) : false)],
    ['Generic dialog', 'Destructive confirm', () => (steam.confirm ? showMock(steam.confirm, confirmProps({ strTitle: 'Delete this?', strOKButtonText: 'Delete', bDestructiveWarning: true })) : false)],
    ['Generic dialog', 'Alert', () => (steam.confirm ? showMock(steam.confirm, confirmProps({ bAlertDialog: true, strOKButtonText: 'OK' })) : false)],
    ['Generic dialog', 'Three buttons', () => (steam.confirm ? showMock(steam.confirm, confirmProps({ strMiddleButtonText: 'Maybe', onMiddleButton: noop })) : false)],
    ['Generic dialog', 'Disabled OK', () => (steam.confirm ? showMock(steam.confirm, confirmProps({ bOKDisabled: true })) : false)],
    ['Generic dialog', 'Progress (no buttons)', () => (steam.confirm ? showMock(steam.confirm, confirmProps({ strTitle: 'Working…', bProgressDialog: true })) : false)],
    ['Generic dialog', 'Long text', () => (steam.confirm ? showMock(steam.confirm, confirmProps({ strDescription: 'A long description. '.repeat(60) })) : false)],
    ['Generic dialog', 'Failure notice', () => (steam.failure ? showMock(steam.failure, { strDescription: 'Something went wrong while doing the thing.' }) : false)],
  ];

  // The panel, in a closed shadow root so neither Steam's nor the theme's styles reach it
  const host = document.createElement('div');
  host.style.cssText = 'all: initial; position: fixed; top: 48px; right: 16px; bottom: 16px; z-index: 2147483600;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    .panel { box-sizing: border-box; display: flex; flex-direction: column; width: 320px; max-height: 100%; border-radius: 10px; background: #16191e; color: #c6ccd4; box-shadow: 0 12px 40px rgba(0, 0, 0, .6); font: 12px/1.4 system-ui, sans-serif; overflow: hidden; }
    .head { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-bottom: 1px solid #252a31; }
    .title { display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 13px; color: #fff; }
    select, button { font: inherit; color: inherit; }
    select { width: 100%; padding: 6px; border: 0; border-radius: 6px; background: #252a31; }
    .list { overflow: auto; padding: 4px 8px 12px; }
    h3 { margin: 12px 4px 4px; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: #6f7883; }
    .entry { display: flex; width: 100%; align-items: baseline; justify-content: space-between; gap: 8px; padding: 6px 8px; border: 0; border-radius: 6px; background: none; text-align: left; cursor: pointer; }
    .entry:hover { background: #252a31; color: #fff; }
    .entry:focus-visible, select:focus-visible, .small:focus-visible { outline: 2px solid #7cc4ff; outline-offset: 1px; }
    .entry[aria-disabled="true"] { opacity: .4; cursor: default; }
    .note { flex: none; font-size: 11px; color: #6f7883; }
    .note.acts { color: #ffb36b; }
    .entry[data-armed] .note { color: #ff7b7b; }
    .small { padding: 3px 8px; border: 0; border-radius: 6px; background: #252a31; cursor: pointer; }
    .small:hover { background: #313741; color: #fff; }
    .empty { padding: 6px 8px; color: #6f7883; }
  </style>
  <div class="panel" role="dialog" aria-label="Dialog launcher">
    <div class="head">
      <div class="title">Dialogs <span><button class="small" data-hide>Hide</button> <button class="small" data-stop>Stop</button></span></div>
      <select data-game aria-label="Game for the real entries"></select>
    </div>
    <div class="list" data-list></div>
  </div>`;

  const list = root.querySelector('[data-list]');
  const select = root.querySelector('[data-game]');
  const failed = new Set();

  const fillGames = () => {
    const options = games();
    select.replaceChildren(...options.map((game) => {
      const option = document.createElement('option');
      option.value = String(game.appid);
      option.textContent = `${game.name}${game.installed ? '' : ' (not installed)'}`;
      return option;
    }));
    appid = options[0]?.appid || 0;
  };

  function renderList() {
    const groups = new Map();
    ENTRIES.forEach(([group, name, , note], i) => {
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push({ key: `e${i}`, name, note });
    });
    groups.set('Recorded', recorded.map((item, i) => ({ key: `r${i}`, name: item.name, note: item.at.toLocaleTimeString() })));
    const parts = [];
    for (const [group, items] of groups) {
      parts.push(`<h3>${group}</h3>`);
      if (!items.length) {
        parts.push(`<div class="empty">${unrecord ? 'Dialogs Steam shows from now on appear here.' : "Steam's modal manager wasn't found: nothing is recorded."}</div>`);
      }
      for (const { key, name, note } of items) {
        const acts = note && note.includes('acts');
        const label = name.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
        parts.push(`<button class="entry" data-key="${key}"${failed.has(key) ? ' aria-disabled="true"' : ''}><span>${label}</span>${note ? `<span class="note${acts ? ' acts' : ''}">${note}</span>` : ''}</button>`);
      }
    }
    list.innerHTML = parts.join('');
  }

  // An entry that acts needs a second click, so a stray click can't run it
  let armed = '';
  const runEntry = (button) => {
    const key = button.dataset.key;
    if (failed.has(key)) return;
    if (key.startsWith('r')) {
      const item = recorded[Number(key.slice(1))];
      if (item) showMock(item.type, neutralized(item.props));
      return;
    }
    const [, , run, note = ''] = ENTRIES[Number(key.slice(1))];
    if (note.includes('acts') && armed !== key) {
      armed = key;
      list.querySelector('[data-armed]')?.removeAttribute('data-armed');
      button.setAttribute('data-armed', '');
      button.querySelector('.note').textContent = 'click again';
      return;
    }
    armed = '';
    if (SE.run(run) === false) {
      failed.add(key);
      renderList();
    }
  };

  const onClick = (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-hide')) toggle();
    else if (button.hasAttribute('data-stop')) destroy();
    else if (button.dataset.key) runEntry(button);
  };
  const onChange = () => {
    appid = Number(select.value) || 0;
  };

  let shown = true;
  const toggle = () => {
    shown = !shown;
    host.style.display = shown ? '' : 'none';
    if (shown) fillGames();
  };
  const destroy = () => {
    unrecord?.();
    root.removeEventListener('click', onClick);
    select.removeEventListener('change', onChange);
    host.remove();
    delete window.__seDialogLauncher;
  };

  root.addEventListener('click', onClick);
  select.addEventListener('change', onChange);
  startRecording();
  fillGames();
  renderList();
  document.body.append(host);

  window.__seDialogLauncher = { toggle, destroy };
})();
