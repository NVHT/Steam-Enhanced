/*
 * Builds the dock's elements and wires every listener in the order the single file did, then
 * starts the watchers and exposes window.__steamEnhancedFriendsDock.
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedFriendsDockParts;
  if (!ns) return;
  const {
    app, browserClickListeners, cancelChatNavigation, chatBack, chatChip, chatError, chatErrorText,
    chatMinimize, chipAvatar, chipChevron, chipCount, chipName, chipText, closeChat,
    closeChatPopup, closedSections, closeMenu, deadAvatars, dismissChatError, disposeSteam, dock,
    fly, flyoutOwnedTabs, gameInForeground, hideFly, hideMenu, installChatRouting,
    interactionEvents, keepLibraryManagers, markDesktopInteraction, markDockInteraction, menu,
    minimizeChat, onAvatarError, onContext, onDesktopChatFocus, onKeyMenu, onLibrary,
    onNativeChannelClick, onNativeFriendClick, onSearch, onStore, openChat, openFriendNotification,
    openGames, openGroup, own, pendingOverlayChats, place, pressRow, releaseFlyoutTabs, render,
    requestChatHandoff, resetMinimized, restoreChat, restoreChatRenderer, restoreChatRouting,
    resumeOverlayChat, schedule, setMode, showFly, state, statusMenu, steamBar, steamHost,
    steamURL, store, svg, sync, syncBrowserClicks, syncChatTabs, unguardLibraryManagers,
  } = ns;
  const { live } = ns;

  const { run } = SE;

  /* ---------- Setup: the dock's elements and listeners, in the order they were wired ---------- */

  dock.className = 'se-fdock';
  dock.setAttribute('aria-label', 'Friends');
  own.className = 'se-fd-own';
  dock.appendChild(own);
  dock.addEventListener('error', onAvatarError, true);
  fly.className = 'se-fd-fly';
  own.addEventListener('input', onSearch);
  own.addEventListener('compositionend', onSearch);
  own.addEventListener('keydown', (event) => {
    if (!event.target.matches('.se-fd-search input')) return;
    event.stopPropagation();
    if (event.key === 'Escape') {
      state.filter = '';
      state.searchText = '';
      state.searching = false;
      render();
    }
  });
  steamHost.className = 'se-fd-steam friendsui-container client_chat_frame fullheight';
  steamBar.className = 'se-fd-steambar';
  chatBack.type = 'button';
  chatBack.className = 'se-fd-chat-back';
  chatBack.textContent = '×';
  chatBack.setAttribute('aria-label', 'Close chat');
  chatBack.hidden = true;
  dock.appendChild(chatBack);
  chatMinimize.type = 'button';
  chatMinimize.className = 'se-fd-chat-back se-fd-chat-minimize';
  chatMinimize.textContent = '−';
  chatMinimize.hidden = true;
  chatMinimize.setAttribute('aria-label', 'Minimize chat');
  dock.appendChild(chatMinimize);
  chatChip.type = 'button';
  chatChip.className = 'se-fd-chat-chip';
  chatChip.hidden = true;
  chipAvatar.className = 'se-fd-chat-chip-avatar';
  chipText.className = 'se-fd-chat-chip-text';
  chipName.className = 'se-fd-chat-chip-name';
  chipCount.className = 'se-fd-chat-chip-count';
  chipChevron.className = 'se-fd-chat-chip-chevron';
  chipChevron.innerHTML = svg('chev', 16);
  chipText.append(chipName, chipCount);
  chatChip.append(chipAvatar, chipText, chipChevron);
  /* The chip can sit outside the dock (Store/Community pages), so it listens too */
  chatChip.addEventListener('error', onAvatarError, true);
  dock.append(chatChip);
  chatChip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    event.stopPropagation();
    if (dock.dataset.chatMinimized === '1') restoreChat();
  });
  chatChip.addEventListener('click', (event) => {
    event.stopPropagation();
    if (dock.dataset.chatMinimized === '1') restoreChat();
  });
  chatMinimize.addEventListener('click', minimizeChat);
  chatBack.addEventListener('click', closeChat);
  addEventListener('beforeunload', releaseFlyoutTabs);
  chatError.className = 'se-fd-chat-error';
  chatError.setAttribute('role', 'alert');
  chatError.hidden = true;
  dismissChatError.type = 'button';
  dismissChatError.textContent = '×';
  dismissChatError.setAttribute('aria-label', 'Dismiss chat error');
  dismissChatError.addEventListener('click', () => {
    chatError.hidden = true;
    place();
  });
  chatError.append(chatErrorText, dismissChatError);
  dock.append(chatError);
  for (const type of interactionEvents) {
    steamHost.addEventListener(type, markDockInteraction, true);
    dock.addEventListener(type, markDockInteraction, true);
    fly.addEventListener(type, markDockInteraction, true);
    document.addEventListener(type, markDesktopInteraction, true);
  }
  document.addEventListener('contextmenu', markDesktopInteraction, true);
  steamHost.addEventListener('click', onNativeFriendClick, true);
  steamHost.addEventListener('dblclick', onNativeFriendClick, true);
  steamHost.addEventListener('click', onNativeChannelClick);
  menu.className = 'se-fd-menu';
  menu.setAttribute('role', 'menu');
  dock.addEventListener('click', (e) => {
    if (steamHost.contains(e.target)) return;
    const el = e.target.closest('[data-act], [data-game], [data-friend], [data-group], [data-section]');
    if (!el || !dock.contains(el)) return;
    e.stopPropagation();
    const act = el.dataset.act;
    if (act === 'collapse') return setMode('rail');
    if (act === 'expand') return setMode('open');
    if (act === 'add') return steamURL('steam://friends/add');
    if (act === 'status') return statusMenu(el);
    if (act === 'search') {
      state.searching = !state.searching;
      if (!state.searching) {
        state.filter = '';
        state.searchText = '';
      }
      state.sig = '';
      return render();
    }
    if (el.dataset.section) {
      const k = el.dataset.section;
      if (closedSections.has(k)) closedSections.delete(k);
      else closedSections.add(k);
      state.sig = '';
      return render();
    }
    if (el.dataset.friend) return openChat(el.dataset.friend);
    if (el.dataset.group) return openGroup(el.dataset.group);
    if (el.dataset.game && state.mode !== 'rail') {
      const k = el.dataset.game;
      if (openGames.has(k)) openGames.delete(k);
      else openGames.add(k);
      state.sig = '';
      return render();
    }
    return undefined;
  });
  own.addEventListener('keydown', pressRow);
  fly.addEventListener('keydown', pressRow);
  dock.addEventListener('mouseover', (e) => {
    const tile = e.target.closest('.se-fd-railgame');
    if (tile) showFly(tile.dataset.game);
  });
  dock.addEventListener('mouseout', (e) => {
    if (e.target.closest('.se-fd-railgame') && !e.relatedTarget?.closest?.('.se-fd-railgame, .se-fd-fly')) {
      hideFly();
    }
  });
  fly.addEventListener('mouseenter', () => clearTimeout(state.flyTimer));
  fly.addEventListener('mouseleave', () => hideFly());
  fly.addEventListener('click', (e) => {
    const row = e.target.closest('[data-friend]');
    if (row) {
      e.stopPropagation();
      openChat(row.dataset.friend);
    }
  });
  dock.addEventListener('contextmenu', onContext);
  fly.addEventListener('contextmenu', onContext);
  addEventListener('keydown', onKeyMenu, true);
  addEventListener('click', closeMenu, true);



  /*
   * Page changes drive placement; the dock's own subtree (Steam's list, a chat's messages) only
   * matters for the chat tabs, so it gets its own throttled subscriber.
   */
  const watcher = SE.watch(sync, { ignore: SE.inSide, throttle: 100 });
  const chatWatcher = SE.watch(syncChatTabs, { scope: '.se-fd-steam', throttle: 100 });
  window.addEventListener('focus', onDesktopChatFocus);
  document.addEventListener('visibilitychange', requestChatHandoff);
  const focusRegistration = run(() => window.SteamClient?.System?.UI?.RegisterForFocusChangeEvents?.((event) => {
    const focused = event?.focusedApp;
    state.foregroundApp = focused ? { appid: Number(focused.appid), pid: Number(focused.pid) } : null;
    if (gameInForeground()) state.focusedBrowserView = null;
    requestChatHandoff();
    schedule();
  }));
  const notificationRegistration = run(() => window.SteamClient?.Messaging?.RegisterForMessages?.(
    'SteamEnhanced.Chat',
    (channel, message, accountId) => {
      if (channel === 'SteamEnhanced.Chat' && message === 'OpenFriendNotification') {
        openFriendNotification(accountId);
      }
    },
  ));
  let lastConnection = '';
  let lastFullRefresh = 0;

  function refreshFriends() {
    syncBrowserClicks();
    syncChatTabs();
    installChatRouting();
    resumeOverlayChat();
    const a = app();
    const connected = run(() => a.CMInterface.BIsConnected()) ?? run(() => a.CMInterface.logged_on);
    if (connected) run(() => a.FriendStore.EnsureFriendsListLoaded?.(false));

    const connection = JSON.stringify([
      run(() => a.CMInterface.logged_on),
      run(() => a.ready_to_render),
      run(() => a.FriendStore.self.persona.m_ePersonaState),
      run(() => a.FriendStore.all_friends.length),
    ]);
    const changed = connection !== lastConnection;
    lastConnection = connection;
    if (!changed && performance.now() - lastFullRefresh < 2000) return;
    lastFullRefresh = performance.now();
    if (changed) state.readAt = -Infinity;
    keepLibraryManagers();
    if (dock.isConnected) render();
    place();
  }

  const timer = SE.poll(refreshFriends, 1000, {
    active: () =>
      SE.railMode() &&
      (pendingOverlayChats.size || (!state.dockHidden && (onLibrary() || onStore() || dock.dataset.chat === '1'))),
  });

  installChatRouting();
  syncBrowserClicks();
  place();

  window.__steamEnhancedFriendsDock = {
    prepareModal: keepLibraryManagers,
    toggle() {
      if (state.destroyed) return undefined;
      state.dockHidden = !state.dockHidden;
      if (!state.dockHidden) state.allowNativeWindow = false;
      store.set('se-fdock-hidden', state.dockHidden ? '1' : '0');
      hideMenu();
      hideFly(true);
      place();
      return !state.dockHidden;
    },
    openWindow(openNative) {
      state.allowNativeWindow = true;
      pendingOverlayChats.clear();
      chatError.hidden = true;
      closeChatPopup();
      restoreChatRenderer();
      delete dock.dataset.chat;
      resetMinimized();
      chatBack.hidden = true;
      state.activeChatFriend = null;
      flyoutOwnedTabs.clear();
      run(() => app()?.UIStore.SerializePopupState?.());
      if (state.chatContext) {
        run(() => state.chatContext.data.SetFriendsListSingleWindowMode(state.chatContext.previous));
        state.chatContext = null;
      }
      state.manualWindowOpen++;
      try {
        return openNative();
      } finally {
        state.manualWindowOpen--;
      }
    },
    destroy() {
      if (state.destroyed) return;
      state.destroyed = true;
      for (const [browser, listener] of browserClickListeners) {
        run(() => browser.off?.('message', listener));
      }
      browserClickListeners.clear();
      cancelChatNavigation();
      clearTimeout(state.statusTimer);
      clearTimeout(state.flyTimer);
      watcher.disconnect();
      chatWatcher.disconnect();
      live.localObserver?.disconnect();
      timer?.disconnect();
      if (live.frame) cancelAnimationFrame(live.frame);
      window.removeEventListener('focus', onDesktopChatFocus);
      document.removeEventListener('visibilitychange', requestChatHandoff);
      run(() => focusRegistration?.unregister?.());
      run(() => notificationRegistration?.unregister?.());
      removeEventListener('click', closeMenu, true);
      removeEventListener('keydown', onKeyMenu, true);
      hideMenu();
      removeEventListener('beforeunload', releaseFlyoutTabs);
      closeChatPopup();
      releaseFlyoutTabs();
      for (const type of interactionEvents) {
        steamHost.removeEventListener(type, markDockInteraction, true);
        dock.removeEventListener(type, markDockInteraction, true);
        fly.removeEventListener(type, markDockInteraction, true);
        document.removeEventListener(type, markDesktopInteraction, true);
      }
      document.removeEventListener('contextmenu', markDesktopInteraction, true);
      disposeSteam();
      unguardLibraryManagers();
      restoreChatRouting();
      steamHost.removeEventListener('click', onNativeFriendClick, true);
      steamHost.removeEventListener('dblclick', onNativeFriendClick, true);
      steamHost.removeEventListener('click', onNativeChannelClick);
      dock.remove();
      fly.remove();
      own.textContent = '';
      fly.textContent = '';
      state.data = null;
      state.sig = '';
      openGames.clear();
      closedSections.clear();
      deadAvatars.clear();
      state.geometryCache = null;
      delete document.body.dataset.seFdock;
      document.body.removeAttribute('data-se-store-list');
      delete window.__steamEnhancedFriendsDock;
    },
  };
});
