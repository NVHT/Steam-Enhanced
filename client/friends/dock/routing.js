/*
 * Chat routing: whether a chat opens in the dock, the overlay or Steam's own window, and the
 * error shown when it can't open (it goes after a while, held while hovered or focused).
 *
 * Parts: routing.js (this file: the routing decisions, the counts and the embed) and
 * routing-patches.js (Steam's methods wrapped to route through it, and their undo).
 */
((SE) => {
  const ns = window.__seFriendsDockParts;
  if (!ns) return;
  const { app, ctx, flyoutOwnedTabs, friendsOf, groupsOf, schedule, state, store } = ns;
  const { live } = ns;

  const { mainWindow, run } = SE;

  const chatError = document.createElement('div');

  const chatErrorText = document.createElement('span');
  const dismissChatError = document.createElement('button');

  function revealDock() {
    state.dockHidden = false;
    store.set('se-fdock-hidden', '0');
    ns.place();
  }

  // A chat error goes by itself after a while, but never while the pointer or focus is on it
  const CHAT_ERROR_MS = 6000;
  let chatErrorTimer = 0;

  function hideChatError() {
    clearTimeout(chatErrorTimer);
    chatErrorTimer = 0;
    if (state.destroyed || chatError.hidden) return;
    chatError.hidden = true;
    ns.place();
  }

  function holdChatError() {
    clearTimeout(chatErrorTimer);
    chatErrorTimer = 0;
  }

  function releaseChatError() {
    holdChatError();
    if (!chatError.hidden && !chatError.matches(':hover, :focus-within')) {
      chatErrorTimer = setTimeout(hideChatError, CHAT_ERROR_MS);
    }
  }

  chatError.addEventListener('pointerenter', holdChatError);
  chatError.addEventListener('focusin', holdChatError);
  chatError.addEventListener('pointerleave', releaseChatError);
  chatError.addEventListener('focusout', releaseChatError);

  function reportChatError() {
    chatErrorText.textContent = 'Unable to open chat here. Open its window from the Friends & Chat menu.';
    chatError.hidden = false;
    revealDock();
    releaseChatError();
  }

  function findFriend(id) {
    if (id == null || typeof id === 'object') return null;
    const raw = String(id);
    if (raw.startsWith('cg')) return null;
    const clean = raw.startsWith('f') ? raw.slice(1) : raw;
    const a = app();
    return (
      a &&
      friendsOf(a).find(
        (f) => String(run(() => f.accountid) ?? run(() => f.persona.GetAccountID())) === clean
      )
    );
  }

  function groupIdOf(g) {
    if (!g || typeof g !== 'object') return '';
    return String(run(() => g.GetGroupID?.()) ?? run(() => g.m_ulGroupID) ?? '');
  }

  function groupUniqueId(g) {
    if (!g) return '';
    if (typeof g === 'string') return g.startsWith('cg') ? g : `cg${g}`;
    const uid = run(() => g.unique_id) || run(() => g.GetUniqueID?.());
    if (uid) return String(uid);
    const id = groupIdOf(g);
    return id ? `cg${id}` : '';
  }

  function findGroup(idOrGroup) {
    const a = app();
    if (!a || idOrGroup == null) return null;
    if (typeof idOrGroup === 'object') {
      const parent =
        run(() => idOrGroup.GetGroup?.()) ||
        run(() => idOrGroup.group) ||
        run(() => idOrGroup.m_group) ||
        run(() => idOrGroup.chatRoomGroup);
      if (parent && parent !== idOrGroup) {
        const resolved = findGroup(parent);
        if (resolved) return resolved;
      }
      if (groupIdOf(idOrGroup)) return idOrGroup;
      const uid = String(run(() => idOrGroup.unique_id) || run(() => idOrGroup.GetUniqueID?.()) || '');
      if (uid.startsWith('cg')) idOrGroup = uid.slice(2);
      else return null;
    }
    const raw = String(idOrGroup);
    if (raw.startsWith('f')) return null;
    const clean = raw.startsWith('cg') ? raw.slice(2) : raw;
    if (!clean) return null;
    const direct =
      run(() => a.ChatStore?.GetChatRoomGroup?.(clean)) ||
      run(() => a.ChatStore?.m_mapChatGroups?.get?.(clean));
    if (direct) return direct;
    return (
      groupsOf(a).find((g) => {
        const gid = groupIdOf(g);
        const uid = groupUniqueId(g);
        return gid === clean || gid === raw || uid === raw;
      }) || null
    );
  }

  function findGroupTab(tabs, group) {
    if (!tabs || !group) return null;
    const gid = groupIdOf(group);
    const uid = groupUniqueId(group);
    const list =
      run(() => tabs.tabs) ||
      run(() => tabs.m_rgTabs) ||
      run(() => tabs.GetTabs?.()) ||
      [];
    for (const tab of list) {
      const tabGroup =
        run(() => tab?.GetChatRoomGroup?.()) ||
        run(() => tab?.m_group) ||
        run(() => tab?.GetChatView?.()?.chat) ||
        run(() => tab?.GetChatView?.()?.m_group);
      if (tabGroup === group) return tab;
      if (gid && groupIdOf(tabGroup) === gid) return tab;
      const tabUid = String(run(() => tab?.GetUniqueID?.()) || run(() => tab?.unique_id) || '');
      if (uid && tabUid === uid) return tab;
    }
    return null;
  }

  function resolveGroupFromRow(el) {
    const item = el?.closest?.('.ChatRoomListGroupItem') || el;
    for (const node of [el, item]) {
      if (!node) continue;
      const g = SE.fromProps?.(node, 20, (props) => {
        const candidate = props?.group || props?.chatRoomGroup || props?.m_group || props?.room?.m_group;
        return candidate &&
          typeof candidate === 'object' &&
          ('voiceRoomList' in candidate ||
            typeof candidate.GetGroupID === 'function' ||
            candidate.m_ulGroupID != null)
          ? candidate
          : null;
      });
      if (g) return g;
    }
    return null;
  }

  function isOverlayContext(browser) {
    return Boolean(browser && (
      Number(browser.m_unPID) > 0 || run(() => app()?.BIsOverlayBrowserContext?.(browser))
    ));
  }

  function isDesktopContext(browser) {
    if (!browser || typeof browser !== 'object') return true;
    if (isOverlayContext(browser)) return false;
    const main = run(() => mainWindow()?.params?.browserInfo);
    return browser.m_eUIMode == null || main?.m_eUIMode == null ||
      browser.m_eUIMode === main.m_eUIMode;
  }

  function desktopChatContext(a, fallback) {
    // Steam changes its default to the overlay while a game is running.
    const root = run(() => a.UIStore.GetRootChatPerContextData().browser_context);
    if (root && isDesktopContext(root)) return root;
    return [fallback, window.__FriendsUIBrowserContext, ctx(a)].find(
      (browser) => browser && isDesktopContext(browser)
    );
  }

  function findOverlayState() {
    const a = app();
    let fallbackBrowser = null;
    for (const o of SE.owners()) {
      for (const p of run(() => o.g_PopupManager?.m_mapPopups?.values?.()) || []) {
        const bi = run(() => p?.browser_info || p?.m_browserInfo || p?.params?.browser_info);
        const pid = Number(run(() => bi?.m_unPID ?? p?.m_unPID)) || 0;
        const isOv =
          pid > 0 ||
          (bi && typeof a?.BIsOverlayBrowserContext === 'function' && run(() => a.BIsOverlayBrowserContext(bi))) ||
          /^SP Overlay:/i.test(run(() => p?.strTitle || p?.window?.document?.title) || '');
        if (!isOv) continue;
        if (!fallbackBrowser && isOverlayContext(bi)) fallbackBrowser = bi;
        const focused =
          Boolean(run(() => p?.focused)) ||
          Boolean(run(() => p?.BIsFocused?.())) ||
          Boolean(run(() => p?.window?.document?.hasFocus?.()));
        if (focused) return { active: true, focused: true, browser: isOverlayContext(bi) ? bi : fallbackBrowser };
      }
    }
    const preferred = a && ctx(a);
    fallbackBrowser ??= isOverlayContext(preferred) ? preferred : overlayChatContexts(a)[0];
    return fallbackBrowser ? { active: true, focused: false, browser: fallbackBrowser } : null;
  }

  function overlayChatContexts(a) {
    return (run(() => a?.UIStore?.GetAllBrowserContexts?.()) || []).filter(isOverlayContext);
  }

  function gameInForeground() {
    if (!state.foregroundApp) return false;
    const { appid, pid } = state.foregroundApp;
    if (overlayChatContexts(app()).some((browser) =>
      (pid > 0 && Number(browser.m_unPID) === pid) ||
      (appid > 0 && Number(browser.m_unAppID) === appid)
    )) return true;
    return appid > 0 && (
      [...SE.owners()].some((owner) => Number(run(() => owner.SteamUIStore?.MainRunningAppID)) === appid) ||
      SE.isRunning(appid)
    );
  }

  function desktopChatFocused() {
    if (gameInForeground()) return false;
    const popup = live.chatPopup?.doc;
    if (document.hasFocus() || (popup?.visibilityState !== 'hidden' && popup?.hasFocus?.())) return true;
    if (state.focusedBrowserView && ns.onStore()) return true;
    const main = mainWindow();
    return Boolean(main && [...SE.owners()].some((owner) =>
      run(() => owner.SteamUIStore?.GetFocusedWindowInstance?.()) === main
    ));
  }

  function isInGame() {
    const a = app();
    if (
      run(() => a?.FriendStore?.self?.persona?.is_ingame) ||
      Number(run(() => a?.FriendStore?.self?.persona?.m_unGamePlayedAppID)) > 0
    ) {
      return true;
    }
    for (const o of SE.owners()) {
      const ui = run(() => o.SteamUIStore);
      if (run(() => ui?.IsAnyAppRunning?.()) || Number(run(() => ui?.MainRunningAppID)) > 0 ||
          run(() => ui?.RunningApps?.length > 0)) return true;
    }
    return isOverlayContext(a && ctx(a)) || Boolean(findOverlayState()?.focused);
  }

  let nativeInteraction = false;
  let nativeInteractionUntil = 0;
  let desktopInteractionAt = 0;
  let interactionToken = 0;
  // Re-entry counts, raised here and by Steam's patched methods (routing-patches.js)
  live.bypassingDockChat = 0;
  live.syncingChat = 0;
  live.backgroundChat = 0;
  const pendingOverlayChats = new Map();

  const isNativeInteraction = () => nativeInteraction || performance.now() < nativeInteractionUntil;

  // The routing's own state let go with Steam's methods (restoreChatRouting, routing-patches.js)
  function resetRouteState() {
    pendingOverlayChats.clear();
    nativeInteraction = false;
    nativeInteractionUntil = 0;
  }

  /*
   * Steam's own window instead of the dock: from the overlay, or while a game is in front of
   * Steam. A game merely running (a launcher, a tool, one minimised) with Steam out of focus
   * still uses the dock, which brings Steam forward (openRoutedChat).
   */
  function shouldBypassDock(browser) {
    if (!isDesktopContext(browser)) return true;
    if (!isInGame()) return false;
    if (isNativeInteraction()) return false;
    const ov = findOverlayState();
    if (ov?.focused) return true;
    if (performance.now() - desktopInteractionAt < 1200) return false;
    return gameInForeground() && !document.hasFocus() && !live.chatPopup?.doc?.hasFocus?.();
  }

  function canRouteChat(browser, activate) {
    if (!canUseDock()) return false;
    if (activate && !isDesktopContext(browser)) return false;
    if (gameInForeground()) return false; // a game in front: Steam's own path, over it
    return isDesktopContext(browser) || (!activate && isOverlayContext(browser));
  }

  // "Chats open in: Window" (client/shared/settings.js): every chat takes Steam's own path
  function canUseDock() {
    return !state.destroyed && !state.manualWindowOpen && !state.allowNativeWindow && SE.railMode() &&
      SE.settings?.get('chat-open') !== 'window';
  }

  function openRoutedChat(id, browser, chat, activate, room, mirror = activate) {
    if (activate) {
      state.chatNavigationUntil = performance.now() + 1500;
      if (!desktopChatFocused()) {
        const main = mainWindow();
        if (typeof main?.BringToFront === 'function') run(() => main.BringToFront());
        else run(() => window.SteamClient?.Window?.BringToFront?.());
        run(() => window.focus());
      }
    }
    return openDockChat(id, browser, chat, room, mirror, activate);
  }

  function openFriendNotification(accountId) {
    if (state.destroyed || !SE.railMode() || !/^\d{1,10}$/.test(accountId)) return false;
    const id = Number(accountId);
    if (!id || id > 0xffffffff) return false;
    const a = app();
    const chat = run(() => a?.ChatStore.GetFriendChat(id));
    if (!chat) return false;

    pendingOverlayChats.delete(`f${id}`);
    state.chatNavigationUntil = performance.now() + 1500;
    if (live.chatNavigation) live.chatNavigation.minimized = false;

    const store = run(() => window.SteamUIStore?.WindowStore);
    if (typeof store?.EnsureMainWindowCreated === 'function') {
      run(() => store.EnsureMainWindowCreated(true));
    } else if (typeof mainWindow()?.BringToFront === 'function') {
      run(() => mainWindow().BringToFront());
    } else {
      run(() => window.SteamClient?.Window?.BringToFront?.());
    }
    run(() => window.focus());
    return openDockChat(id, undefined, chat);
  }

  function resumeOverlayChat() {
    if (!pendingOverlayChats.size || !canUseDock() || !desktopChatFocused()) return;
    if (live.chatNavigation || (!ns.onLibrary() && !ns.onStore())) return;

    const chats = [...pendingOverlayChats];
    pendingOverlayChats.clear();
    for (const [uid, room] of chats) {
      const group = uid.startsWith('cg') ? findGroup(uid) : null;
      if (!openRoutedChat(uid, undefined, group, true, room, false)) reportChatError();
    }
  }

  let chatHandoffQueued = false;

  function requestChatHandoff() {
    if (!pendingOverlayChats.size || chatHandoffQueued || state.destroyed) return;
    chatHandoffQueued = true;
    queueMicrotask(() => {
      chatHandoffQueued = false;
      resumeOverlayChat();
    });
  }

  function onDesktopChatFocus(event) {
    // The main window can regain focus before Steam reports the new foreground app.
    if (event.isTrusted && document.hasFocus()) state.foregroundApp = null;
    requestChatHandoff();
    schedule();
  }

  function queueOverlayChat(uid, room) {
    if (!uid || !/^(?:f\d+|cg\d+)$/.test(uid) || !canUseDock()) return;
    pendingOverlayChats.delete(uid);
    pendingOverlayChats.set(uid, room);
    requestChatHandoff();
  }

  function syncWithOverlay(uid, room) {
    const a = app();
    if (!uid || !canUseDock() || !isInGame()) return;
    const ui = a.UIStore;
    live.syncingChat++;
    try {
      for (const browser of overlayChatContexts(a)) {
        run(() => {
          const tab = ui.ShowAndOrActivateTabByID(browser, uid, false);
          if (!tab) return;
          if (room != null) tab.GetChatView?.()?.SelectChat?.(room);
          const data = ui.GetPerContextChatData(browser);
          const tabs = ui.GetTabSetByUniqueID(data, uid)?.tabSet;
          if (tabs?.activeTab !== tab) tabs?.ActivateTab(tab);
        });
      }
    } finally {
      live.syncingChat--;
    }
  }

  function closeMirroredChat(ui, contexts, uid) {
    live.syncingChat++;
    try {
      for (const browser of contexts) {
        if (browser) run(() => ui?.CloseTabByIDInContext?.(browser, uid));
      }
    } finally {
      live.syncingChat--;
    }
  }

  function runBypassedChat(self, original, args, uid, activate, room) {
    const a = app();
    if (activate && uid && isDesktopContext(args[0]) && !isNativeInteraction()) flyoutOwnedTabs.delete(uid);
    const callArgs = [...args];
    const browser = callArgs[0];
    const playing = isInGame() || gameInForeground();
    if (uid && isDesktopContext(browser) && playing && canUseDock() && !desktopChatFocused()) {
      const ov = findOverlayState();
      if (ov?.browser && !isDesktopContext(ov.browser)) {
        callArgs[0] = ov.browser;
      }
    }
    const effectiveBrowser = callArgs[0];
    if (!isDesktopContext(effectiveBrowser) && state.chatContext && !state.chatContext.previous) {
      const ovPerContext = run(() => a?.UIStore?.GetPerContextChatData?.(effectiveBrowser));
      if (
        ovPerContext &&
        ovPerContext !== state.chatContext.data &&
        run(() => ovPerContext.IsFriendsListSingleWindow?.())
      ) {
        run(() => ovPerContext.SetFriendsListSingleWindowMode?.(false));
      }
    }
    const background = playing && !activate;
    if (background) live.backgroundChat++;
    live.bypassingDockChat++;
    try {
      const result = original.apply(self, callArgs);
      if (activate && isOverlayContext(effectiveBrowser)) queueOverlayChat(uid, room);
      return result;
    } finally {
      live.bypassingDockChat--;
      if (background) live.backgroundChat--;
    }
  }

  live.lastNativeRoute = null;

  function markDesktopInteraction() {
    desktopInteractionAt = performance.now();
  }

  function markDockInteraction() {
    ns.installChatRouting();
    // Using the dock again ends "Open window" (state.allowNativeWindow, main.js openWindow): its
    // chats and the Friends list come back to the dock, while the window's own stay in it till then
    state.allowNativeWindow = false;
    const now = performance.now();
    desktopInteractionAt = now;
    nativeInteraction = true;
    nativeInteractionUntil = now + 800;
    const token = ++interactionToken;
    queueMicrotask(() => {
      if (interactionToken === token) nativeInteraction = false;
    });
  }

  const interactionEvents = ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'keydown'];

  // The chat openDockChat was asked for: its group (null for a friend) and its tab's unique id
  function resolveDockChat(a, id, chatOverride) {
    const group =
      findGroup(chatOverride) ||
      (typeof id === 'object' || String(id ?? '').startsWith('cg') ? findGroup(id) : null) ||
      (!findFriend(id) ? findGroup(id) : null);
    const friend = !group ? findFriend(run(() => chatOverride?.chat_partner?.accountid) ?? id) : null;
    const friendAccountId = friend
      ? String(run(() => friend.accountid) ?? run(() => friend.persona?.GetAccountID?.()) ?? id)
      : !group && id != null && !String(id).startsWith('cg')
        ? String(id).replace(/^f/, '')
        : '';
    const chat = !group
      ? (chatOverride?.unique_id && !group ? chatOverride : null) ||
        (friendAccountId ? run(() => a.ChatStore.GetFriendChat(Number(friendAccountId))) : null)
      : null;
    const uniqueId = group
      ? groupUniqueId(group)
      : String(run(() => chat?.unique_id) || (friendAccountId ? `f${friendAccountId}` : id || ''));
    return { group, uniqueId };
  }

  // Whether this Steam has every chat-data and tab-set method the embed calls
  function canEmbedChat(perContext, tabs, uniqueId) {
    return !(
      !perContext ||
      !tabs ||
      !uniqueId ||
      typeof perContext.SetFriendsListSingleWindowMode !== 'function' ||
      typeof perContext.IsFriendsListSingleWindow !== 'function' ||
      typeof tabs.GetTabByUniqueID !== 'function' ||
      typeof tabs.ActivateTab !== 'function' ||
      typeof tabs.CloseAllTabs !== 'function'
    );
  }

  // Single-window mode on in this context, the previous mode kept for when the dock lets go
  function claimChatContext(perContext) {
    if (state.chatContext && state.chatContext.data !== perContext) {
      run(() => state.chatContext.data.SetFriendsListSingleWindowMode(state.chatContext.previous));
      state.chatContext = null;
    }
    if (!state.chatContext) {
      state.chatContext = { data: perContext, previous: perContext.IsFriendsListSingleWindow() };
    }
    perContext.SetFriendsListSingleWindowMode(true);
  }

  // Finds or makes the chat's tab and selects it (and its room); returns the tab's real unique id
  function openEmbeddedTab(ui, browser, tabs, group, uniqueId, room, preserveSelection) {
    state.openingDockChat++;
    let realUid = uniqueId;
    try {
      const existing =
        run(() => tabs.GetTabByUniqueID(uniqueId)) || (group && findGroupTab(tabs, group));
      if (!existing) flyoutOwnedTabs.set(uniqueId, tabs);
      let tab =
        existing ||
        (typeof ui.CreateNewTabFromUniqueID === 'function'
          ? run(() => ui.CreateNewTabFromUniqueID(tabs, uniqueId, false))
          : null);
      if (!tab && group) {
        if (typeof tabs.AddChatRoomGroupTab === 'function') {
          tab = run(() => tabs.AddChatRoomGroupTab(group, !preserveSelection));
        }
        if (!tab && typeof ui.ShowAndOrActivateChatRoomGroup === 'function') {
          run(() => ui.ShowAndOrActivateChatRoomGroup(browser, group, !preserveSelection));
        }
        tab =
          tab ||
          run(() => tabs.GetTabByUniqueID(uniqueId)) ||
          findGroupTab(tabs, group) ||
          (run(() => tabs.activeTab?.GetChatRoomGroup?.()) === group ? tabs.activeTab : null);
      }
      if (!tab) {
        flyoutOwnedTabs.delete(uniqueId);
        throw new Error('Unable to create embedded chat tab');
      }
      realUid = String(run(() => tab.GetUniqueID?.()) || run(() => tab.unique_id) || uniqueId);
      if (!existing && realUid !== uniqueId) {
        flyoutOwnedTabs.delete(uniqueId);
        flyoutOwnedTabs.set(realUid, tabs);
      }
      if (!preserveSelection) tabs.ActivateTab(tab);
      if (!preserveSelection && group && room != null) {
        const view = run(() => tab.GetChatView?.());
        if (typeof view?.SelectChat === 'function') run(() => view.SelectChat(room));
        else run(() => group.SelectChatRoom?.(room));
      }
    } finally {
      state.openingDockChat--;
    }
    return realUid;
  }

  function showEmbeddedChat(ui, tabs, realUid, room, preserveSelection, mirror) {
    state.dockTabs = tabs;
    ns.dock.dataset.chat = '1';
    if (!preserveSelection) {
      state.activeChatFriend = realUid;
      ns.resetMinimized();
      ns.chatBack.hidden = false;
      if (live.chatNavigation) live.chatNavigation.minimized = false;
    } else {
      ns.updateChatChip();
    }
    run(() => ui.SerializePopupState?.());
    chatError.hidden = true;
    revealDock();
    ns.syncGroupFlyouts();
    if (mirror) syncWithOverlay(realUid, room);
  }

  // A failed embed: the dock's chat state cleared and the context's single-window mode put back
  function resetEmbeddedChat() {
    delete ns.dock.dataset.chat;
    ns.resetMinimized();
    ns.chatBack.hidden = true;
    state.activeChatFriend = null;
    state.dockTabs = null;
    if (state.chatContext) {
      run(() => state.chatContext.data.SetFriendsListSingleWindowMode(state.chatContext.previous));
      state.chatContext = null;
    }
  }

  function openDockChat(id, browserOverride, chatOverride, room, mirror = true, activate = true) {
    const a = app();
    if (!a || state.view !== 'steam') return false;
    state.allowNativeWindow = false;

    const { group, uniqueId } = resolveDockChat(a, id, chatOverride);

    if (!state.steamMounted) ns.showSteam();
    if (!state.steamMounted) return false;

    const browser = desktopChatContext(a, browserOverride);
    if (!browser) return false;
    const ui = a.UIStore;
    const perContext = run(() => ui.GetPerContextChatData(browser));
    const tabs = run(() => ui.GetDefaultTabSetForContext(browser));

    if (!canEmbedChat(perContext, tabs, uniqueId)) return false;

    const preserveSelection = !activate && ns.dock.dataset.chat === '1' && tabs === state.dockTabs && Boolean(tabs.activeTab);
    try {
      claimChatContext(perContext);
      const realUid = openEmbeddedTab(ui, browser, tabs, group, uniqueId, room, preserveSelection);
      showEmbeddedChat(ui, tabs, realUid, room, preserveSelection, mirror);
      return true;
    } catch (error) {
      console.warn('[Steam Enhanced] embedded chat', error);
      if (preserveSelection) return false;
      resetEmbeddedChat();
      return false;
    }
  }

  Object.assign(ns, {
    canRouteChat, canUseDock, chatError, chatErrorText, closeMirroredChat, holdChatError,
    desktopChatContext, desktopChatFocused, dismissChatError, findFriend, findGroup, findGroupTab,
    gameInForeground, groupUniqueId, interactionEvents, isDesktopContext, isInGame,
    isOverlayContext, markDesktopInteraction, markDockInteraction, onDesktopChatFocus,
    openDockChat, openFriendNotification, openRoutedChat, overlayChatContexts, pendingOverlayChats,
    queueOverlayChat, reportChatError, requestChatHandoff, resetRouteState, resolveGroupFromRow,
    resumeOverlayChat, revealDock, runBypassedChat, shouldBypassDock, syncWithOverlay,
  });
})(window.__se);
