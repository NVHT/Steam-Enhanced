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

  /*
   * A group's call, as a bar under its header (friends-dock-chat-group.css .se-fd-group-call, the look of
   * a one-to-one call's): the channel, the faces in it, then mic, headphones and leave: stand-ins
   * for Steam's own (in the channel list, else the message box; SE.callTools,
   * client/friends/call-tools.js). Muted: Steam's "disabled"; leave is never off.
   */
  const CALL_TOOLS = { mic: 'ToggleMicrophoneButton', out: 'ToggleVoiceOutputButton', end: 'chatEndVoiceChat' };
  const CALL_FACES = 4;
  const steamCallTool = (win, kind) =>
    win.querySelector(`.chatRoomGroupNavColumn .VoiceControlPanelButton.${CALL_TOOLS[kind]}`) ||
    win.querySelector(`.ChatMessageEntryVoice .${CALL_TOOLS[kind]}`);
  const isMuted = (original, kind) => kind !== 'end' && original.classList.contains('disabled');

  function onCallTool(event) {
    if (SE.callTools.click(event, steamCallTool)) schedule();
  }

  function buildCallBar(doc) {
    const bar = doc.createElement('div');
    bar.className = 'se-fd-group-call';
    bar.hidden = true;
    bar.innerHTML =
      '<span class="se-fd-call-name"></span><span class="se-fd-call-faces"></span>' +
      Object.keys(CALL_TOOLS).map((kind) => `<button type="button" class="se-call-tool" data-tool="${kind}"></button>`).join('');
    bar.addEventListener('click', onCallTool);
    return bar;
  }

  function syncCallBar(win, bar) {
    const active = win.querySelector('.ActiveVoiceChannel');
    SE.attr(win, 'data-se-in-call', !!active);
    if (bar.hidden !== !active) bar.hidden = !active;
    if (!active) return;
    SE.setText(bar.querySelector('.se-fd-call-name'), active.querySelector('.chatRoomVoiceChannelName')?.textContent.trim() || 'Voice');
    // The faces in the call: their pictures, or their initials for Steam's "?"
    const faces = bar.querySelector('.se-fd-call-faces');
    const people = [...active.querySelectorAll('.VoiceChannelParticipants .friend')].slice(0, CALL_FACES).map((friend) => ({
      src: friend.querySelector(`img.avatar, img.${SE.C.avatar}`)?.getAttribute('src') || '',
      name: friend.querySelector('.playerName')?.textContent.trim() || '',
    }));
    const key = people.map((p) => `${p.src}|${p.name}`).join(',');
    if (faces.dataset.key !== key) {
      faces.dataset.key = key;
      faces.replaceChildren(...people.map(({ src, name }) => {
        const face = win.ownerDocument.createElement('span');
        face.className = 'se-fd-call-face';
        face.title = name;
        if (src && !SE.isDefaultAvatar?.(src)) {
          const img = win.ownerDocument.createElement('img');
          img.alt = '';
          img.draggable = false;
          img.src = src;
          face.append(img);
        } else {
          face.textContent = SE.initials(name);
        }
        return face;
      }));
    }
    SE.callTools.sync(win, bar.querySelectorAll('.se-call-tool'), steamCallTool, isMuted);
  }

  /*
   * A group in the flyout: its channels and members as two tiles in the header, before Steam's
   * bell, invite and settings (each opens Steam's own list as a small menu), and its call as a bar
   * under the header.
   */
  const keepFocus = (event) => event.preventDefault();

  function buildGroupTools(doc) {
    const tools = doc.createElement('span');
    tools.className = 'se-fd-group-tools';
    tools.innerHTML =
      '<button type="button" class="se-call-tool" data-tool="channels" aria-expanded="false" aria-label="Channels" title="Channels"></button>' +
      '<button type="button" class="se-call-tool" data-tool="members" aria-expanded="false" aria-label="Members" title="Members"></button>';
    // A press doesn't focus them: Steam's focus handling then marked them focus-visible, a ring on
    // every click. Tab still reaches them, with the ring.
    tools.addEventListener('mousedown', keepFocus);
    return tools;
  }

  function syncGroupFlyouts() {
    for (const [win, entry] of groupFlyouts) {
      if (!ns.chatRoot().contains(win)) entry.dispose();
    }
    for (const win of ns.chatRoot().querySelectorAll('.chatWindow.MultiUserChat')) {
      const headerEl = win.querySelector(':scope > .chatHeader.titleBarContainer');
      const controls = headerEl?.querySelector('.chatRoomGroupControls');
      if (!controls) continue;
      let entry = groupFlyouts.get(win);

      if (!entry || !controls.contains(entry.tools) || !win.contains(entry.callBar)) {
        entry?.dispose();
        win.dataset.seFlyoutGroup = '1';
        const doc = win.ownerDocument;
        const tools = buildGroupTools(doc);
        const [channels, members] = tools.children;
        controls.prepend(tools);
        const callBar = buildCallBar(doc);
        win.insertBefore(callBar, headerEl.nextSibling);

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
          callBar,
          dispose() {
            channels.removeEventListener('click', showChannels);
            members.removeEventListener('click', showMembers);
            win.removeEventListener('click', onChoose);
            callBar.removeEventListener('click', onCallTool);
            tools.removeEventListener('mousedown', keepFocus);
            tools.remove();
            callBar.remove();
            delete win.dataset.seFlyoutGroup;
            delete win.dataset.seGroupPanel;
            win.removeAttribute('data-se-in-call');
            win.style.removeProperty('--se-members-rows');
            groupFlyouts.delete(win);
          },
        };
        groupFlyouts.set(win, entry);
      }

      const membersLabel = headerEl.querySelector('.statMembersTotal')?.textContent.trim() || 'Members';
      if (entry.members.title !== membersLabel) {
        entry.members.title = membersLabel;
        entry.members.setAttribute('aria-label', membersLabel);
      }
      syncCallBar(win, entry.callBar);
      // Its members menu lists the online ones (member-list.js)
      ns.hideOfflineMembers?.(win);
      // ...as tall as its rows: Steam's list is virtualized (no height of its own), and its inner
      // box's inline height is the rows' total, read with no layout
      const rows = win.querySelector('.MemberListColumn > .Panel [style*="will-change"] > div')?.style.height || '';
      if (win.style.getPropertyValue('--se-members-rows') !== rows) win.style.setProperty('--se-members-rows', rows || null);

      // A group with only its default chat has an empty list (no channels, no "Add voice channel"):
      // no # then, rather than an empty menu; a call still starts from the message box
      const noChannels = !win.querySelector(
        '.chatRoomGroupNavColumn :is(.chatRoomTextChannel, .chatRoomVoiceChannel, .ChannelTypeTitle)'
      );
      SE.attr(entry.channels, 'hidden', noChannels ? '' : null);
      if (noChannels && win.dataset.seGroupPanel === 'channels') closeGroupPanels();
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

  Object.assign(ns, {
    browserClickListeners, closeChat, closeGroupPanels, disposeGroupFlyouts, syncBrowserClicks,
    syncChatTabs, syncGroupFlyouts,
  });
})(window.__se);
