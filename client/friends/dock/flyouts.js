/*
 * Store/Community browser clicks, Community hubs' Group Chat, game group flyouts, and syncing the
 * dock with Steam's chat tabs.
 */
((SE) => {
  const ns = window.__seFriendsDockParts;
  if (!ns) return;
  const {
    app, closeMirroredChat, flyoutOwnedTabs, overlayChatContexts, pendingOverlayChats,
    requestChatHandoff, schedule, state,
  } = ns;
  const { live } = ns;

  const { run } = SE;

  const browserClickListeners = new Map();
  const BROWSER_MESSAGES = new Set(['SteamEnhanced.ChatBrowserFocus', 'SteamEnhanced.OpenClanChat']);
  const CLAN_BASE = 103582791429521408n;

  const RESULT_OK = 1;
  const RESULT_ACCESS_DENIED = 15;

  /** The dock's chat error, with this reason in place of the generic text. */
  function groupChatError(reason) {
    ns.reportChatError();
    ns.chatErrorText.textContent = reason;
  }

  /**
   * A Community hub's Group Chat (web/community/hub/page.js sends the game group's SteamID64).
   * Steam's own link (steam://friends/joinchat) never reaches the client from the Store/Community
   * view, so the page hands it here. The group's chat is looked up; a member's opens straight
   * away, otherwise Steam joins it first (as its own link would). Showing it goes through chat
   * routing (routing.js), which puts it in the flyout. Steam's join reports a failure only in
   * its result, so every failure is said in the dock rather than doing nothing.
   */
  function openClanChat(steamid) {
    if (!/^\d{18}$/.test(String(steamid ?? ''))) return;
    const accountId = BigInt(steamid) - CLAN_BASE;
    if (accountId <= 0n || accountId > 0xffffffffn) return;
    const a = app();
    const clan = run(() => a.FriendStore.ClanStore.GetOrCreateClan(Number(accountId)));
    const chats = run(() => a.ChatStore);
    if (typeof clan?.GetChatRoomGroupID !== 'function' || !chats) {
      groupChatError("Unable to open this group chat: Steam's chat isn't ready.");
      return;
    }
    const browser = run(() => a.UIStore.GetRootChatPerContextData().browser_context) || run(() => a.GetDefaultBrowserContext());
    Promise.resolve(run(() => clan.GetChatRoomGroupID()))
      .then((groupId) => {
        if (state.destroyed) return null;
        if (!groupId) throw new Error('This group has no chat.');
        const group = run(() => chats.GetChatRoomGroup(groupId));
        if (group && run(() => group.BIsCurrentUserAMember())) {
          a.UIStore.ShowAndOrActivateChatRoomGroup(browser, group, true);
          return null;
        }
        return chats.InviteStore.JoinChatGroup(groupId, null, browser);
      })
      .then((joined) => {
        if (!joined || joined.result === RESULT_OK || state.destroyed) return;
        // A game's group chat takes its group's members, and following the game is how you join
        // that group: Steam refuses anyone else
        groupChatError(joined.result === RESULT_ACCESS_DENIED
          ? 'Only followers can join this game\'s group chat. Follow it, then open Group Chat again.'
          : `Steam couldn't join this group chat (error ${joined.result}).`);
      })
      .catch((error) => {
        console.warn('[Steam Enhanced] group chat', error);
        if (!state.destroyed) groupChatError(`Unable to open this group chat: ${error?.message || error}`);
      });
  }

  function syncBrowserClicks() {
    const active = new Set();
    for (const owner of SE.owners()) {
      const manager = run(() => owner.MainWindowBrowserManager);
      const browser = manager?.m_browser;
      if (!browser || typeof browser.on !== 'function') continue;
      active.add(browser);
      if (browserClickListeners.has(browser)) continue;

      const listener = (message, args, requestingURL) => {
        if (state.destroyed || !BROWSER_MESSAGES.has(message)) return;
        const source = requestingURL || manager.m_URL || manager.m_URLRequested || '';
        if (!/^https:\/\/(?:store\.steampowered\.com|steamcommunity\.com)(?:\/|$)/i.test(source)) return;
        if (message === 'SteamEnhanced.OpenClanChat') {
          openClanChat(args);
          return;
        }
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
      } catch {}
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
})(window.__se);
