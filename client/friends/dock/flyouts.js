/*
 * Store/Community browser clicks, game group flyouts, and syncing the dock with Steam's chat tabs.
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedFriendsDockParts;
  if (!ns) return;
  const {
    app, closeMirroredChat, flyoutOwnedTabs, overlayChatContexts, pendingOverlayChats,
    requestChatHandoff, schedule, state,
  } = ns;
  const { live } = ns;

  const { run } = SE;

  const browserClickListeners = new Map();

  function syncBrowserClicks() {
    const active = new Set();
    for (const owner of SE.owners()) {
      const manager = run(() => owner.MainWindowBrowserManager);
      const browser = manager?.m_browser;
      if (!browser || typeof browser.on !== 'function') continue;
      active.add(browser);
      if (browserClickListeners.has(browser)) continue;

      const listener = (message, args, requestingURL) => {
        if (state.destroyed || message !== 'SteamEnhanced.ChatBrowserFocus') return;
        const source = requestingURL || manager.m_URL || manager.m_URLRequested || '';
        if (!/^https:\/\/(?:store\.steampowered\.com|steamcommunity\.com)(?:\/|$)/i.test(source)) return;
        if (args === 'blur' && state.focusedBrowserView === browser) state.focusedBrowserView = null;
        if (args === 'focus' && ns.onStore()) {
          state.focusedBrowserView = browser;
          state.foregroundApp = null;
          requestChatHandoff();
          schedule();
        }
      };
      run(() => {
        browser.on('message', listener);
        browserClickListeners.set(browser, listener);
      });
    }
    for (const [browser, listener] of browserClickListeners) {
      if (!active.has(browser)) {
        run(() => browser.off?.('message', listener));
        browserClickListeners.delete(browser);
        if (state.focusedBrowserView === browser) state.focusedBrowserView = null;
      }
    }
  }

  const groupFlyouts = new Map();

  function closeGroupPanels() {
    for (const [win, entry] of groupFlyouts) {
      delete win.dataset.seGroupPanel;
      entry.channels.setAttribute('aria-expanded', 'false');
      entry.members.setAttribute('aria-expanded', 'false');
    }
  }

  function disposeGroupFlyouts() {
    for (const dispose of [...groupFlyouts.values()].map((entry) => entry.dispose)) {
      dispose();
    }
  }

  function syncGroupFlyouts() {
    for (const [win, entry] of groupFlyouts) {
      if (!ns.chatRoot().contains(win)) entry.dispose();
    }
    for (const win of ns.chatRoot().querySelectorAll('.chatWindow.MultiUserChat')) {
      const headerEl = win.querySelector(':scope > .chatHeader.titleBarContainer');
      if (!headerEl) continue;
      win.dataset.seFlyoutGroup = '1';
      let entry = groupFlyouts.get(win);

      if (!entry || !win.contains(entry.tools)) {
        entry?.dispose();
        const tools = document.createElement('div');
        const channels = document.createElement('button');
        const members = document.createElement('button');
        tools.className = 'se-fd-group-tools';
        channels.type = 'button';
        members.type = 'button';
        channels.className = 'se-fd-group-channels';
        members.className = 'se-fd-group-members';
        channels.setAttribute('aria-expanded', 'false');
        members.setAttribute('aria-expanded', 'false');
        channels.setAttribute('aria-label', 'Show text and voice channels');
        members.setAttribute('aria-label', 'Show group members');
        tools.append(channels, members);
        win.insertBefore(tools, headerEl.nextSibling);

        const toggle = (panel) => {
          const open = win.dataset.seGroupPanel !== panel;
          closeGroupPanels();
          if (open) win.dataset.seGroupPanel = panel;
          channels.setAttribute('aria-expanded', String(open && panel === 'channels'));
          members.setAttribute('aria-expanded', String(open && panel === 'members'));
        };
        const showChannels = () => toggle('channels');
        const showMembers = () => toggle('members');
        const onChoose = (event) => {
          if (event.target.closest?.('.chatRoomTextChannel, .chatRoomVoiceChannel, .MemberListColumn .friend')) {
            closeGroupPanels();
          }
        };
        channels.addEventListener('click', showChannels);
        members.addEventListener('click', showMembers);
        win.addEventListener('click', onChoose);
        entry = {
          tools,
          channels,
          members,
          toggle,
          voiceBar: null,
          dispose() {
            channels.removeEventListener('click', showChannels);
            members.removeEventListener('click', showMembers);
            win.removeEventListener('click', onChoose);
            tools.remove();
            entry.voiceBar?.remove();
            delete win.dataset.seFlyoutGroup;
            delete win.dataset.seGroupPanel;
            groupFlyouts.delete(win);
          },
        };
        groupFlyouts.set(win, entry);
      }

      const channel =
        win
          .querySelector('.ActiveTextChannel .chatRoomTextChannelName')
          ?.textContent.trim()
          .replace(/^#\s*/, '') || 'Channels';
      const label = channel === 'Channels' ? 'Channels ▾' : `# ${channel} ▾`;
      if (entry.channels.textContent !== label) entry.channels.textContent = label;

      const total = headerEl.querySelector('.statMembersTotal')?.textContent.trim();
      const membersLabel = total || 'Members';
      if (entry.members.textContent !== membersLabel) entry.members.textContent = membersLabel;

      const column = win.querySelector('.chatHistoryAndMembers > .displayColumn.fullWidth');
      let composer = column?.querySelector('.chatEntry');
      if (column && composer) {
        while (composer.parentElement !== column) composer = composer.parentElement;
        if (!entry.voiceBar || !win.contains(entry.voiceBar)) {
          const bar = document.createElement('div');
          const status = document.createElement('span');
          const action = document.createElement('button');
          bar.className = 'se-fd-group-voice';
          action.type = 'button';
          action.addEventListener('click', () => entry.toggle('channels'));
          bar.append(status, action);
          column.insertBefore(bar, composer);
          entry.voiceBar = bar;
        }
        const currentVoice = win.querySelector('.ActiveVoiceChannel .chatRoomVoiceChannelName')?.textContent.trim();
        const voiceLabel = currentVoice ? `Voice · ${currentVoice}` : 'Voice channels';
        const actionLabel = currentVoice ? 'Manage voice' : 'Join voice ▾';
        if (entry.voiceBar.firstChild.textContent !== voiceLabel) {
          entry.voiceBar.firstChild.textContent = voiceLabel;
        }
        if (entry.voiceBar.lastChild.textContent !== actionLabel) {
          entry.voiceBar.lastChild.textContent = actionLabel;
        }
        const noVoice = !win.querySelector('.chatRoomVoiceChannel');
        if (entry.voiceBar.hidden !== noVoice) entry.voiceBar.hidden = noVoice;
      }

      const noChannels = !win.querySelector('.chatRoomGroupNavColumn');
      if (entry.channels.disabled !== noChannels) entry.channels.disabled = noChannels;
      const noMembers = !win.querySelector('.MemberListColumn');
      if (entry.members.disabled !== noMembers) entry.members.disabled = noMembers;
    }
  }

  function closeChat(closePending = true) {
    ns.cancelChatNavigation();
    if (closePending) {
      const a = app();
      const contexts = overlayChatContexts(a);
      for (const uid of pendingOverlayChats.keys()) closeMirroredChat(a?.UIStore, contexts, uid);
      pendingOverlayChats.clear();
    }
    const tabs = state.dockTabs;
    delete ns.dock.dataset.chat;
    ns.resetMinimized();
    ns.chatBack.hidden = true;
    state.activeChatFriend = null;
    state.dockTabs = null;

    ns.closeChatPopup();
    ns.restoreChatRenderer();

    if (tabs && tabs.tabCount !== 0) {
      try {
        state.openingDockChat++;
        tabs.CloseAllTabs();
      } catch (error) {
        console.warn('[Steam Enhanced] close flyout tabs', error);
      } finally {
        state.openingDockChat--;
      }
    }
    if (!tabs || tabs.tabCount === 0) flyoutOwnedTabs.clear();
    if (state.chatContext) {
      try {
        state.chatContext.data.SetFriendsListSingleWindowMode(state.chatContext.previous);
      } catch (_) {}
      state.chatContext = null;
    }
    ns.place();
  }

  function syncChatTabs() {
    if (state.dockTabs?.activeTab) {
      const uid = run(() => state.dockTabs.activeTab.GetUniqueID?.()) || run(() => state.dockTabs.activeTab.unique_id);
      if (uid) state.activeChatFriend = String(uid);
    }
    syncGroupFlyouts();
    if (ns.dock.dataset.chat === '1' && state.dockTabs && state.dockTabs.tabCount === 0) {
      closeChat(false);
      return;
    }
    ns.updateChatChip();
    if (live.chatPopup && !live.chatPopup.restored && live.chatPopup.handle?.visible && ns.dock.dataset.chat === '1') {
      const minimized = ns.dock.dataset.chatMinimized === '1';
      const geometry = ns.chatGeometry(minimized);
      if (
        live.chatPopup.minimized !== minimized ||
        live.chatPopup.width !== geometry.width ||
        live.chatPopup.height !== geometry.height
      ) {
        ns.resizeChatPopup(live.chatPopup, minimized, geometry);
      }
    }
  }

  // Steam's Friends & Chat embed entry (mount(FriendStore, ChatStore, elTarget)), its ReactDOM and JSX runtime.

  Object.assign(ns, {
    browserClickListeners, closeChat, closeGroupPanels, disposeGroupFlyouts, syncBrowserClicks,
    syncChatTabs, syncGroupFlyouts,
  });
});
