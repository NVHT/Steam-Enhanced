/*
 * Chat routing: whether a chat opens in the dock, the overlay or Steam's own window, and the
 * error shown when it can't open.
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedFriendsDockParts;
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

  function reportChatError() {
    chatErrorText.textContent = 'Unable to open chat here. Right-click Friends & Chat to open its window.';
    chatError.hidden = false;
    revealDock();
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
    return appid > 0 && [...SE.owners()].some((owner) => {
      const ui = run(() => owner.SteamUIStore);
      return Number(run(() => ui?.MainRunningAppID)) === appid ||
        run(() => ui?.RunningApps?.some((game) => Number(game.appid) === appid));
    });
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

  let routingApp = null;
  let nativeInteraction = false;
  let nativeInteractionUntil = 0;
  let desktopInteractionAt = 0;
  let interactionToken = 0;
  let bypassingDockChat = 0;
  let syncingChat = 0;
  let backgroundChat = 0;
  const pendingOverlayChats = new Map();

  const isNativeInteraction = () => nativeInteraction || performance.now() < nativeInteractionUntil;

  function shouldBypassDock(browser) {
    if (!isDesktopContext(browser)) return true;
    if (!isInGame()) return false;
    if (isNativeInteraction()) return false;
    const ov = findOverlayState();
    if (ov?.focused) return true;
    if (performance.now() - desktopInteractionAt < 1200) return false;
    return !document.hasFocus() && !live.chatPopup?.doc?.hasFocus?.();
  }

  function canRouteChat(browser, activate) {
    if (!canUseDock()) return false;
    if (activate && !isDesktopContext(browser)) return false;
    if (gameInForeground() || (isInGame() && !desktopChatFocused())) return false;
    return isDesktopContext(browser) || (!activate && isOverlayContext(browser));
  }

  function canUseDock() {
    return !state.destroyed && !state.manualWindowOpen && !state.allowNativeWindow && SE.railMode();
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
    syncingChat++;
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
      syncingChat--;
    }
  }

  function closeMirroredChat(ui, contexts, uid) {
    syncingChat++;
    try {
      for (const browser of contexts) {
        if (browser) run(() => ui?.CloseTabByIDInContext?.(browser, uid));
      }
    } finally {
      syncingChat--;
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
    if (background) backgroundChat++;
    bypassingDockChat++;
    try {
      const result = original.apply(self, callArgs);
      if (activate && isOverlayContext(effectiveBrowser)) queueOverlayChat(uid, room);
      return result;
    } finally {
      bypassingDockChat--;
      if (background) backgroundChat--;
    }
  }

  live.lastNativeRoute = null;
  const routingPatches = [];

  function restoreChatRouting() {
    for (const p of routingPatches) {
      try {
        if (p.target[p.name] !== p.wrapper) continue;
        if (p.own) Object.defineProperty(p.target, p.name, p.own);
        else delete p.target[p.name];
      } catch (_) {}
    }
    routingPatches.length = 0;
    routingApp = null;
    pendingOverlayChats.clear();
    nativeInteraction = false;
    nativeInteractionUntil = 0;
  }

  function installChatRouting() {
    const a = app();
    if (!a || routingApp === a) return;
    restoreChatRouting();
    routingApp = a;

    const patch = (target, name, route) => {
      if (typeof target?.[name] !== 'function') return;
      const ownDesc = Object.getOwnPropertyDescriptor(target, name);
      const original = target[name];
      if (ownDesc && !ownDesc.configurable) return;
      const wrapper = function (...args) {
        return route.call(this, original, args);
      };
      try {
        Object.defineProperty(target, name, { configurable: true, writable: true, value: wrapper });
        routingPatches.push({ target, name, own: ownDesc, wrapper });
      } catch (_) {}
    };

    const navigateWithChat = function (original, args) {
      const kind = this === mainWindow() ? 'route' : 'url';
      ns.beginChatNavigation(kind, args[0]);
      try {
        return original.apply(this, args);
      } finally {
        schedule();
      }
    };

    patch(mainWindow(), 'Navigate', navigateWithChat);
    for (const owner of SE.owners()) {
      patch(run(() => owner.MainWindowBrowserManager), 'ShowURL', navigateWithChat);
    }

    const routeFriend = function (original, args) {
      if (state.openingDockChat || bypassingDockChat || syncingChat) return original.apply(this, args);
      const [browser, id, show = true, activate = show] = args;
      const chat = run(() => a.ChatStore.GetFriendChat(Number(id)));
      const uid = run(() => chat?.unique_id) || (id != null ? `f${id}` : '');
      if (!show) return original.apply(this, args);
      if (canRouteChat(browser, activate) && chat && openRoutedChat(id, browser, chat, activate)) {
        if (activate) live.lastNativeRoute = { id: String(id), uid, at: performance.now() };
        return chat;
      }
      return runBypassedChat(this, original, args, uid, activate);
    };

    patch(a, 'ShowFriendChatDialog', routeFriend);
    patch(a.UIStore, 'ShowFriendChatDialog', routeFriend);

    const routeGroup = function (original, args) {
      if (state.openingDockChat || bypassingDockChat || syncingChat) return original.apply(this, args);
      const [browser, groupArg, activate = true, roomArg] = args;
      const group = findGroup(groupArg);
      const uid = group && groupUniqueId(group);
      const room = run(() => roomArg?.GetRoomID?.()) ?? roomArg;
      if (canRouteChat(browser, activate !== false) && uid) {
        if (openRoutedChat(uid, browser, group, activate !== false, room)) {
          if (activate !== false) live.lastNativeRoute = { id: uid, uid, at: performance.now() };
          return run(() => state.dockTabs?.GetTabByUniqueID?.(uid)) || findGroupTab(state.dockTabs, group);
        }
      }
      return runBypassedChat(this, original, args, uid, activate !== false, room);
    };

    patch(a.UIStore, 'ShowAndOrActivateChatRoomGroup', routeGroup);
    patch(a.m_DesktopApp, 'ShowChatRoomGroupDialog', function (original, args) {
      if (state.openingDockChat || bypassingDockChat || syncingChat) return original.apply(this, args);
      const [browser, groupId, room] = args;
      const group = findGroup(groupId);
      const uid = groupUniqueId(group);
      const channel = room == null ? null : run(() => group?.GetChatRoom?.(room));
      if (!uid || run(() => group.BIsCurrentUserAMember?.()) === false ||
          run(() => channel?.BVoiceActive?.())) return original.apply(this, args);
      if (canRouteChat(browser, true) && openRoutedChat(uid, browser, group, true, room)) return;
      return runBypassedChat(this, original, args, uid, true, room);
    });

    patch(a.UIStore, 'OpenChatRoomGroupTrial', function (original, args) {
      if (state.openingDockChat || bypassingDockChat || syncingChat) return original.apply(this, args);
      const [browser, groupID] = args;
      const group = findGroup(groupID);
      if (group && canRouteChat(browser, true)) {
        return routeGroup.call(this, original, [browser, group, true]);
      }
      return runBypassedChat(this, original, args, groupUniqueId(group), true);
    });

    patch(a.UIStore, 'ShowAndOrActivateChat', function (original, args) {
      if (state.openingDockChat || bypassingDockChat || syncingChat) return original.apply(this, args);
      const [browser, chat, activate] = args;
      const incoming = activate === false;
      const friendID = run(() => chat?.chat_partner?.accountid);
      const group = friendID == null
        ? findGroup(run(() => chat?.GetParentGroupID?.()) ?? chat)
        : null;
      const room = group ? run(() => chat?.GetRoomID?.()) : undefined;
      const uid =
        friendID != null
          ? String(run(() => chat?.unique_id) || `f${friendID}`)
          : group
            ? groupUniqueId(group)
            : '';

      if (uid && canRouteChat(browser, !incoming) &&
          openRoutedChat(friendID ?? uid, browser, group || chat, !incoming, room)) {
        if (!incoming) live.lastNativeRoute = { id: String(friendID ?? uid), uid, at: performance.now() };
        const tab = run(() => state.dockTabs?.GetTabByUniqueID?.(uid)) || (group && findGroupTab(state.dockTabs, group));
        return run(() => tab?.GetChatView?.()) ?? null;
      }
      return runBypassedChat(this, original, args, uid, !incoming, room);
    });

    patch(a.UIStore, 'ShowAndOrActivateTabByID', function (original, args) {
      if (state.openingDockChat || bypassingDockChat || syncingChat) return original.apply(this, args);
      const [browser, id, activate = true] = args;
      const chatTab = typeof id === 'string' && /^(?:f\d+|cg.+)$/.test(id);
      if (activate && chatTab && canRouteChat(browser, true)) {
        const group = id.startsWith('cg') ? findGroup(id) : null;
        if (openRoutedChat(id, browser, group || { unique_id: id }, true)) {
          live.lastNativeRoute = { id, uid: id, at: performance.now() };
          return run(() => state.dockTabs?.GetTabByUniqueID?.(id)) || (group && findGroupTab(state.dockTabs, group));
        }
      }
      return runBypassedChat(this, original, args, chatTab ? id : '', activate);
    });

    patch(a.NotificationManager, 'DisplayNotification', function (original, args) {
      const [notice] = args;
      const tag = typeof notice?.tag === 'string' ? notice.tag : '';
      const groupMessage = tag.startsWith('groupmsg_');
      const chatMessage = groupMessage || tag.startsWith('message_');
      const quiet = chatMessage && isInGame() && !gameInForeground() &&
        (desktopChatFocused() || state.foregroundApp !== null);
      if (!quiet && tag.startsWith('message_') && typeof args[1] === 'function') {
        const callback = args[1];
        args[1] = function (...clickArgs) {
          if (!openFriendNotification(tag.slice('message_'.length))) {
            return callback.apply(this, clickArgs);
          }
        };
      }
      const result = quiet ? Promise.resolve() : original.apply(this, args);
      // Group messages reach the flyout through the notification producer.
      if (groupMessage && canRouteChat(undefined, false)) {
        const group = findGroup(notice.chatroomgroupid);
        const uid = groupUniqueId(group);
        if (uid) openRoutedChat(uid, undefined, group, false, notice.chatroomid);
      }
      return result;
    });

    for (const voice of new Set([a.VoiceStore, a.ChatStore?.VoiceChat].filter(Boolean))) {
      for (const name of [
        'InitiateFriendChat',
        'AcceptPartnersOneOnOneChatRequest',
        'OnAcceptOneOnOneVoiceChat',
      ]) {
        patch(voice, name, function (original, args) {
          const id = run(() => args[0]?.GetAccountID?.()) ?? Number(args[0]);
          if (
            !gameInForeground() &&
            !shouldBypassDock(undefined) &&
            !state.manualWindowOpen &&
            !state.allowNativeWindow &&
            SE.railMode() &&
            findFriend(id)
          ) {
            if (!openDockChat(id)) reportChatError();
          }
          return original.apply(this, args);
        });
      }
    }

    patch(a.UIStore, 'SerializePopupStateToObject', function (original, args) {
      const popup = original.apply(this, args);
      if (!popup || typeof popup !== 'object') return popup;
      let next = popup;
      if (state.chatContext && !state.chatContext.previous) {
        for (const key of ['bSingleWindowMode', 'singleWindowMode', 'bUseSingleWindowMode']) {
          if (key in next && next[key] === true) {
            if (next === popup) next = { ...popup };
            next[key] = false;
          }
        }
      }
      const saved = next?.defaultTabs;
      if (!flyoutOwnedTabs.size || !Array.isArray(saved?.tabs)) return next;
      const tabs = saved.tabs.filter((id) => !flyoutOwnedTabs.has(id));
      if (tabs.length === saved.tabs.length) return next;
      return {
        ...next,
        defaultTabs: tabs.length
          ? {
              ...saved,
              tabs,
              active_tab: tabs.includes(saved.active_tab) ? saved.active_tab : tabs[0],
            }
          : undefined,
      };
    });

    patch(a.UIStore, 'BroadcastNewTabToAllBrowserContexts', function (original, args) {
      if (state.openingDockChat || syncingChat || backgroundChat) return undefined;
      // A native overlay activation is handed off when the desktop regains focus.
      if (isOverlayContext(args[0]) && canUseDock()) return undefined;
      bypassingDockChat++;
      try {
        return original.apply(this, args);
      } finally {
        bypassingDockChat--;
      }
    });

    patch(a.UIStore, 'BroadcastCloseTabToAllBrowserContexts', function (original, args) {
      if (syncingChat) return undefined;
      return original.apply(this, args);
    });

    patch(a.UIStore, 'CloseTab', function (original, args) {
      const [browser, tab] = args;
      const uid = run(() => tab?.GetUniqueID?.());
      const sync = uid && canUseDock() && !syncingChat &&
        !this.m_bSuppressBrowserContextBroadcasting;
      const result = original.apply(this, args);
      if (!sync) return result;
      pendingOverlayChats.delete(uid);
      const desktop = desktopChatContext(a);
      const targets = isOverlayContext(browser)
        ? [desktop]
        : isDesktopContext(browser) ? overlayChatContexts(a) : [];
      closeMirroredChat(this, targets, uid);
      schedule();
      return result;
    });

    patch(a.UIStore, 'OnOverlayBrowserCreated', function (original, args) {
      bypassingDockChat++;
      try {
        return original.apply(this, args);
      } finally {
        bypassingDockChat--;
      }
    });

    patch(a.UIStore, 'ShowAndOrActivateChatForTabset', function (original, args) {
      const result = original.apply(this, args);
      const [tabs, chat, activate] = args;
      if (!activate || state.openingDockChat || bypassingDockChat || syncingChat ||
          !isOverlayContext(run(() => tabs?.GetBrowserContext?.()))) return result;
      const tab = tabs.activeTab;
      const uid = run(() => tab?.GetUniqueID?.()) || run(() => chat?.unique_id);
      const room = run(() => tab.GetChatView().GetActiveChatView().chat.GetRoomID());
      queueOverlayChat(uid, room);
      return result;
    });

    patch(a.UIStore, 'FocusTabSet', function (original, args) {
      if (syncingChat) return undefined;
      const [tabs] = args;
      if (!state.openingDockChat && !bypassingDockChat && canUseDock()) {
        const browser = run(() => tabs?.GetBrowserContext?.());
        const tab = tabs?.activeTab;
        const uid = run(() => tab?.GetUniqueID?.());
        const room = run(() => tab.GetChatView().GetActiveChatView().chat.GetRoomID());
        if (isOverlayContext(browser) && !backgroundChat) queueOverlayChat(uid, room);
        else if (tabs === state.dockTabs) syncWithOverlay(uid, room);
      }
      if (
        !bypassingDockChat &&
        !state.manualWindowOpen &&
        !state.allowNativeWindow &&
        (state.openingDockChat || (ns.dock.dataset.chat === '1' && args[0] === state.dockTabs))
      ) {
        return undefined;
      }
      return original.apply(this, args);
    });

    const routePopup = function (original, args) {
      if (
        bypassingDockChat ||
        shouldBypassDock(args[0]) ||
        state.manualWindowOpen ||
        state.allowNativeWindow ||
        !SE.railMode()
      ) {
        return original.apply(this, args);
      }
      if (!state.openingDockChat) revealDock();
      return undefined;
    };
    patch(a, 'ShowPopupFriendsList', routePopup);
    patch(a.m_DesktopApp, 'ShowPopupFriendsList', routePopup);
  }

  function markDesktopInteraction() {
    desktopInteractionAt = performance.now();
  }

  function markDockInteraction() {
    installChatRouting();
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

  function openDockChat(id, browserOverride, chatOverride, room, mirror = true, activate = true) {
    const a = app();
    if (!a || state.view !== 'steam') return false;
    state.allowNativeWindow = false;

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

    if (!state.steamMounted) ns.showSteam();
    if (!state.steamMounted) return false;

    const browser = desktopChatContext(a, browserOverride);
    if (!browser) return false;
    const ui = a.UIStore;
    const perContext = run(() => ui.GetPerContextChatData(browser));
    const tabs = run(() => ui.GetDefaultTabSetForContext(browser));

    if (
      !perContext ||
      !tabs ||
      !uniqueId ||
      typeof perContext.SetFriendsListSingleWindowMode !== 'function' ||
      typeof perContext.IsFriendsListSingleWindow !== 'function' ||
      typeof tabs.GetTabByUniqueID !== 'function' ||
      typeof tabs.ActivateTab !== 'function' ||
      typeof tabs.CloseAllTabs !== 'function'
    ) {
      return false;
    }

    const preserveSelection = !activate && ns.dock.dataset.chat === '1' && tabs === state.dockTabs && Boolean(tabs.activeTab);
    try {
      if (state.chatContext && state.chatContext.data !== perContext) {
        run(() => state.chatContext.data.SetFriendsListSingleWindowMode(state.chatContext.previous));
        state.chatContext = null;
      }
      if (!state.chatContext) {
        state.chatContext = { data: perContext, previous: perContext.IsFriendsListSingleWindow() };
      }
      perContext.SetFriendsListSingleWindowMode(true);

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
      return true;
    } catch (error) {
      console.warn('[Steam Enhanced] embedded chat', error);
      if (preserveSelection) return false;
      delete ns.dock.dataset.chat;
      ns.resetMinimized();
      ns.chatBack.hidden = true;
      state.activeChatFriend = null;
      state.dockTabs = null;
      if (state.chatContext) {
        run(() => state.chatContext.data.SetFriendsListSingleWindowMode(state.chatContext.previous));
        state.chatContext = null;
      }
      return false;
    }
  }

  Object.assign(ns, {
    chatError, chatErrorText, closeMirroredChat, desktopChatFocused, dismissChatError, findFriend,
    findGroup, gameInForeground, groupUniqueId, installChatRouting, interactionEvents,
    markDesktopInteraction, markDockInteraction, onDesktopChatFocus, openDockChat,
    openFriendNotification, overlayChatContexts, pendingOverlayChats, reportChatError,
    requestChatHandoff, resolveGroupFromRow, restoreChatRouting, resumeOverlayChat,
  });
});
