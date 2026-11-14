/*
 * Overlay: the Friends, Remote Play and Controller views.
 *
 * Part of client/overlay/ (see context.js).
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedOverlayParts;
  if (!ns) return;
  const { el } = SE;
  const { button, contextGlobal, friendStore, img, openToolWidget, overviewOf, readStats, scheduleRender, setText, toFriend } = ns;
  const { live } = ns;

  /* ---------- Friends view ---------- */

  const friendsState = { query: '', offline: false };
  const OFFLINE_MAX = 200;

  const setFriendsState = patch => {
    Object.assign(friendsState, patch);
    scheduleRender();
  };

  const gameName = appid => (appid ? SE.run(() => SE.appStore().GetAppOverviewByAppID(appid).display_name) || '' : '');

  // Every friend with what the list shows: status, and what they're playing.
  const allFriends = () =>
    (SE.run(() => friendStore().allFriends) || [])
      .filter(state => !state.is_blocked)
      .map(state => {
        const persona = SE.run(() => state.persona) || {};
        const friend = toFriend(state);
        const appid = Number(persona.m_unGamePlayedAppID) || 0;
        return { ...friend, appid, game: gameName(appid) || persona.m_strGameExtraInfo || '' };
      });

  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

  const friendGroups = (appid, query) => {
    const q = query.trim().toLowerCase();
    const list = allFriends().filter(friend => !q || friend.name.toLowerCase().includes(q));
    const here = list.filter(friend => appid && friend.appid === appid).sort(byName);
    const online = list
      .filter(friend => friend.status !== 'offline' && !here.includes(friend))
      // Playing something first, then online, then away.
      .sort((a, b) => Number(!!b.appid) - Number(!!a.appid) || Number(a.away) - Number(b.away) || byName(a, b));
    const offline = list.filter(friend => friend.status === 'offline').sort(byName);
    return { here, online, offline };
  };

  const statusLine = (friend, appid) => {
    if (friend.appid && friend.appid === appid) return friend.game || 'In this game';
    if (friend.appid || friend.status === 'ingame') return friend.game ? `Playing ${friend.game}` : 'In a game';
    if (friend.status === 'offline') return 'Offline';
    return friend.away ? 'Away' : 'Online';
  };

  const friendRow = (friend, appid) => {
    const row = button('se-ov-friend', { steamid: friend.steamid });
    row.title = `Chat with ${friend.name}`;
    const avatar = el('span', 'se-ov-avatar');
    avatar.dataset.status = friend.status;
    if (friend.away) avatar.dataset.away = '';
    avatar.append(img(null, friend.avatar));
    const text = el('span', 'se-ov-friend-text');
    const status = el('span', 'se-ov-friend-status', statusLine(friend, appid));
    status.dataset.status = friend.appid === appid && appid ? 'here' : friend.status;
    text.append(el('span', 'se-ov-friend-name', friend.name), status);
    row.append(avatar, text, el('span', 'se-ov-friend-chat', 'Chat'));
    return row;
  };

  const renderFriendsView = (part, appid, groups) => {
    const sig = JSON.stringify([
      appid,
      friendsState.offline,
      ...['here', 'online', 'offline'].map(key =>
        groups[key].map(f => [f.steamid, f.status, f.away, f.appid, f.name, f.avatar])
      ),
    ]);
    if (part.sig === sig) return;
    part.sig = sig;
    const fragment = document.createDocumentFragment();
    const group = (label, friends) => {
      if (!friends.length) return;
      fragment.append(el('h3', 'se-ov-friends-group', `${label} · ${friends.length}`));
      for (const friend of friends) fragment.append(friendRow(friend, appid));
    };
    group('In this game', groups.here);
    group('Online', groups.online);
    if (groups.offline.length) {
      const toggle = button('se-ov-friends-more', { offline: '' });
      toggle.setAttribute('aria-expanded', String(friendsState.offline));
      toggle.textContent = `Offline · ${groups.offline.length}`;
      fragment.append(toggle);
      if (friendsState.offline) for (const friend of groups.offline.slice(0, OFFLINE_MAX)) fragment.append(friendRow(friend, appid));
    }
    if (!fragment.childNodes.length) fragment.append(el('p', 'se-ov-achl-empty', 'No friends match.'));
    part.list.replaceChildren(fragment);
  };

  /* ---------- Remote Play, Notes, Controller ---------- */

  const remoteApi = () => contextGlobal('SteamClient')?.RemotePlay || null;
  const remotePlayStatus = () => {
    const store = contextGlobal('RemotePlayStore_SteamUI');
    const streams = SE.run(() => store.remoteClientStreams);
    const guests = Array.isArray(streams) ? streams.length : Number(SE.run(() => streams.size)) || 0;
    return { hosting: !!SE.run(() => store.BIsStreamingRemotePlayTogetherGame()), guests };
  };

  const selfFriend = () => {
    const self = SE.run(() => friendStore().self);
    return self ? toFriend(self) : null;
  };

  // Steam Input per game: SteamClient.Apps.SetThirdPartyControllerConfiguration
  // (0 default, 1 forced off, 2 forced on). Steam doesn't expose the current
  // value here, so the switch starts from what the connected controller does.
  const STEAM_INPUT = Object.freeze({ off: 1, on: 2 });
  const padState = { builtIn: null };
  // xbox_controller_support on the app: 0 none, 1 partial, 2 full.
  const SUPPORT_LABEL = Object.freeze({ 0: 'No controller support', 1: 'Partial Xbox support', 2: 'Full Xbox support' });

  const connectedControllers = () => {
    const store = contextGlobal('ControllerStore');
    const list = SE.run(() => Array.from(store.GetControllersSorted() || store.GetControllers() || [])) || [];
    live.controllerSample = list[0] || null;
    return {
      steamInput: !!SE.run(() => store.BSteamInputEnabledForAnyConnectedController()),
      list: list.map(c => ({
        name:
          String(c?.strName || '').trim() ||
          SE.run(() => store.GetControllerTypeString(c.eControllerType)) ||
          'Controller',
        battery: Number(c?.ucBatteryLevel),
        charging: !!c?.bCharging,
        wireless: !!(c?.bWireless || c?.bBluetooth),
      })),
    };
  };

  const toggleSteamInput = () => {
    const appid = readStats().appid;
    const apps = contextGlobal('SteamClient')?.Apps;
    if (!appid || typeof apps?.SetThirdPartyControllerConfiguration !== 'function') return;
    const builtIn = !(padState.builtIn ?? !connectedControllers().steamInput);
    SE.run(() => apps.SetThirdPartyControllerConfiguration(appid, builtIn ? STEAM_INPUT.off : STEAM_INPUT.on));
    padState.builtIn = builtIn;
    scheduleRender();
  };

  // Steam's Controller window, in this overlay (ShowControllerConfigurator
  // would open the editor in the desktop client instead).
  const openControllerLayout = () => openToolWidget('controller');

  const renderRemoteView = (part, appid) => {
    const me = selfFriend();
    const status = remotePlayStatus();
    if (me) {
      if (part.hostAvatar.dataset.src !== me.avatar) {
        part.hostAvatar.dataset.src = me.avatar;
        part.hostAvatar.replaceChildren(img(null, me.avatar));
      }
      setText(part.hostName, me.name);
    }
    setText(part.hostStatus, status.hosting ? `Hosting · ${status.guests} guest${status.guests === 1 ? '' : 's'}` : 'Not hosting yet');

    const canInvite = SE.run(() => remoteApi().BCanCreateInviteForGame(String(appid), false));
    setText(part.notice, canInvite === false ? "This game can't be shared over Remote Play Together." : '');
    part.notice.hidden = canInvite !== false;
  };

  const renderControllerView = (part, appid) => {
    const pads = connectedControllers();
    const builtIn = padState.builtIn ?? !pads.steamInput;
    const level = Number(SE.run(() => overviewOf(appid).xbox_controller_support));
    const sig = JSON.stringify([pads, builtIn, level]);
    if (part.sig === sig) return;
    part.sig = sig;
    part.toggle.setAttribute('aria-checked', String(builtIn));
    setText(
      part.desc,
      builtIn
        ? 'Steam Input is off: the game reads your controller directly.'
        : 'Steam Input is on: Steam translates your controller for the game.'
    );
    const chip = (text, good) => {
      const node = el('span', 'se-ov-chip', text);
      node.dataset.good = String(good);
      return node;
    };
    part.support.replaceChildren(
      chip(SUPPORT_LABEL[level] || 'Support not listed', level >= 1),
      chip(builtIn ? 'Using game support' : 'Using Steam Input', true)
    );
    part.pads.replaceChildren(
      ...(pads.list.length
        ? pads.list.map(pad => {
            const parts = [pad.wireless ? 'Wireless' : 'Wired'];
            if (Number.isFinite(pad.battery) && pad.battery > 0 && pad.battery <= 100) {
              parts.push(`${pad.battery}%${pad.charging ? ' · charging' : ''}`);
            }
            return toolRow(pad.name, parts.join(' · '));
          })
        : [el('p', 'se-ov-tool-text', 'No controller connected.')])
    );
  };

  const toolRow = (label, value) => {
    const row = el('div', 'se-ov-tool-row');
    row.append(el('span', 'se-ov-tool-label', label), el('span', 'se-ov-tool-value', value));
    return row;
  };

  const renderToolViews = (tools, appid) => {
    if (live.view === 'remote') renderRemoteView(tools.remote, appid);
    if (live.view === 'controller') renderControllerView(tools.controller, appid);
    if (live.view === 'browser') ns.renderBrowserView(tools.browser, appid);
    if (live.view === 'settings') ns.renderSettingsView(tools.settings);
  };

  Object.assign(ns, { friendGroups, friendsState, openControllerLayout, renderFriendsView, renderToolViews, setFriendsState, toggleSteamInput });
});
