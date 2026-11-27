/*
 * Chat routing, continued from routing.js: Steam's chat, tab, notification, voice and
 * navigation methods wrapped to route through the dock, and restoreChatRouting to undo them.
 */
((SE) => {
  const ns = window.__seFriendsDockParts;
  if (!ns) return;
  const {
    app, canRouteChat, canUseDock, closeMirroredChat, desktopChatContext, desktopChatFocused,
    findFriend, findGroup, findGroupTab, flyoutOwnedTabs, gameInForeground, groupUniqueId,
    isDesktopContext, isInGame, isOverlayContext, openDockChat, openFriendNotification,
    openRoutedChat, overlayChatContexts, pendingOverlayChats, queueOverlayChat, reportChatError,
    resetRouteState, revealDock, runBypassedChat, schedule, shouldBypassDock, state,
    syncWithOverlay,
  } = ns;
  const { live } = ns;

  const { mainWindow, run } = SE;

  let routingApp = null;
  const routingPatches = [];

  function restoreChatRouting() {
    for (const p of routingPatches) {
      try {
        if (p.target[p.name] !== p.wrapper) continue;
        if (p.own) Object.defineProperty(p.target, p.name, p.own);
        else delete p.target[p.name];
      } catch { /* a frozen or replaced object refuses the undo: the theme's wrapper stays */ }
    }
    routingPatches.length = 0;
    routingApp = null;
    resetRouteState();
  }

  // Wraps target[name] so `route` runs with Steam's original; restoreChatRouting puts it back
  function patch(target, name, route) {
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
    } catch { /* a frozen or replaced object refuses the patch: Steam's own stays */ }
  }

  function navigateWithChat(original, args) {
    const kind = this === mainWindow() ? 'route' : 'url';
    ns.beginChatNavigation(kind, args[0]);
    try {
      return original.apply(this, args);
    } finally {
      schedule();
    }
  }

  function patchNavigation() {
    patch(mainWindow(), 'Navigate', navigateWithChat);
    for (const owner of SE.owners()) {
      patch(run(() => owner.MainWindowBrowserManager), 'ShowURL', navigateWithChat);
    }
  }

  function patchFriendAndGroupChats(a) {
    const routeFriend = function (original, args) {
      if (state.openingDockChat || live.bypassingDockChat || live.syncingChat) return original.apply(this, args);
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
      if (state.openingDockChat || live.bypassingDockChat || live.syncingChat) return original.apply(this, args);
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
      if (state.openingDockChat || live.bypassingDockChat || live.syncingChat) return original.apply(this, args);
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
      if (state.openingDockChat || live.bypassingDockChat || live.syncingChat) return original.apply(this, args);
      const [browser, groupID] = args;
      const group = findGroup(groupID);
      if (group && canRouteChat(browser, true)) {
        return routeGroup.call(this, original, [browser, group, true]);
      }
      return runBypassedChat(this, original, args, groupUniqueId(group), true);
    });
  }

  // Steam's generic openers: a chat object, or a tab's unique id ("f123", "cg…")
  function patchChatActivation(a) {
    patch(a.UIStore, 'ShowAndOrActivateChat', function (original, args) {
      if (state.openingDockChat || live.bypassingDockChat || live.syncingChat) return original.apply(this, args);
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
      if (state.openingDockChat || live.bypassingDockChat || live.syncingChat) return original.apply(this, args);
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
  }

  function patchNotifications(a) {
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
  }

  function patchVoiceChats(a) {
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
  }

  // The saved popup state: single-window mode off while the dock holds it, flyout tabs left out
  function patchPopupState(a) {
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
  }

  // Tabs opened and closed across browser contexts (desktop and overlay)
  function patchTabBroadcasts(a) {
    patch(a.UIStore, 'BroadcastNewTabToAllBrowserContexts', function (original, args) {
      if (state.openingDockChat || live.syncingChat || live.backgroundChat) return undefined;
      // A native overlay activation is handed off when the desktop regains focus.
      if (isOverlayContext(args[0]) && canUseDock()) return undefined;
      live.bypassingDockChat++;
      try {
        return original.apply(this, args);
      } finally {
        live.bypassingDockChat--;
      }
    });

    patch(a.UIStore, 'BroadcastCloseTabToAllBrowserContexts', function (original, args) {
      if (live.syncingChat) return undefined;
      return original.apply(this, args);
    });

    patch(a.UIStore, 'CloseTab', function (original, args) {
      const [browser, tab] = args;
      const uid = run(() => tab?.GetUniqueID?.());
      const sync = uid && canUseDock() && !live.syncingChat &&
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
      live.bypassingDockChat++;
      try {
        return original.apply(this, args);
      } finally {
        live.bypassingDockChat--;
      }
    });
  }

  function patchTabFocus(a) {
    patch(a.UIStore, 'ShowAndOrActivateChatForTabset', function (original, args) {
      const result = original.apply(this, args);
      const [tabs, chat, activate] = args;
      if (!activate || state.openingDockChat || live.bypassingDockChat || live.syncingChat ||
          !isOverlayContext(run(() => tabs?.GetBrowserContext?.()))) return result;
      const tab = tabs.activeTab;
      const uid = run(() => tab?.GetUniqueID?.()) || run(() => chat?.unique_id);
      const room = run(() => tab.GetChatView().GetActiveChatView().chat.GetRoomID());
      queueOverlayChat(uid, room);
      return result;
    });

    patch(a.UIStore, 'FocusTabSet', function (original, args) {
      if (live.syncingChat) return undefined;
      const [tabs] = args;
      if (!state.openingDockChat && !live.bypassingDockChat && canUseDock()) {
        const browser = run(() => tabs?.GetBrowserContext?.());
        const tab = tabs?.activeTab;
        const uid = run(() => tab?.GetUniqueID?.());
        const room = run(() => tab.GetChatView().GetActiveChatView().chat.GetRoomID());
        if (isOverlayContext(browser) && !live.backgroundChat) queueOverlayChat(uid, room);
        else if (tabs === state.dockTabs) syncWithOverlay(uid, room);
      }
      if (
        !live.bypassingDockChat &&
        !state.manualWindowOpen &&
        !state.allowNativeWindow &&
        (state.openingDockChat || (ns.dock.dataset.chat === '1' && args[0] === state.dockTabs))
      ) {
        return undefined;
      }
      return original.apply(this, args);
    });
  }

  function patchPopupFriendsList(a) {
    const routePopup = function (original, args) {
      if (
        live.bypassingDockChat ||
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

  function installChatRouting() {
    const a = app();
    if (!a || routingApp === a) return;
    restoreChatRouting();
    routingApp = a;

    patchNavigation();
    patchFriendAndGroupChats(a);
    patchChatActivation(a);
    patchNotifications(a);
    patchVoiceChats(a);
    patchPopupState(a);
    patchTabBroadcasts(a);
    patchTabFocus(a);
    patchPopupFriendsList(a);
  }

  Object.assign(ns, { installChatRouting, restoreChatRouting });
})(window.__se);
