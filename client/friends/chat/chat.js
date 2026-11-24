/*
 * Populate direct-chat headers, group-chat layout attributes, and composer placeholders; and read
 * the log (syncLog): a sender's blocks within ten minutes form one run (data-se-run: the later
 * blocks lose their speaker line), a later run by the same sender continues their streak
 * (data-se-streak: its time only, no face or name again), each line knows its place in its run
 * (data-se-pos: first, mid, last or only, so a run's bubbles join), the speaker line's time
 * shows the hour only (data-se-time: the day lines give the date), and a day line with nothing under it hides
 * (data-se-trailing). Styles: messages.css, bubbles.css.
 */
((SE) => {
  const previousDocuments = window.__seChat?.documents?.() || [];
  window.__seChat?.destroy();
  if (!document.body) return;

  const { C, run } = SE;
  const TAB_CLS = C.ChatTab;
  const TAB_ACTIVE_CLS = C.ChatTab_Active;
  const TEXTAREA_CLS = C.chatTextarea;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  /* Desktop chat dialogs (not Big Picture's): the chat styles (client/friends/chat/*.css) key every rule on this mark */
  const DIALOG = 'data-se-chat';
  /* The Friends window's list collapse button is shown: the tab strip leaves room for it */
  const LIST_TOGGLE = 'data-se-list-toggle';
  const SCOPE = '.friendsui-container, .multiChatDialog';
  const COMPACT = run(() => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }));
  const compactNum = (n) => run(() => COMPACT.format(n)) || String(n);

  const ICONS = {
    more:
      '<circle class="dot" cx="6" cy="12" r="1.5"/>' +
      '<circle class="dot" cx="12" cy="12" r="1.5"/>' +
      '<circle class="dot" cx="18" cy="12" r="1.5"/>',
  };

  // Voice and invite are core masks (--se-icon-phone / -invite, header.css); the dots stay drawn
  const MASK_ICONS = new Set(['voice', 'invite']);
  const createIcon = (name) => {
    if (MASK_ICONS.has(name)) {
      const mask = document.createElement('span');
      mask.className = 'se-chat-tile-mask';
      mask.dataset.icon = name;
      mask.setAttribute('aria-hidden', 'true');
      return mask;
    }
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name];
    return svg;
  };

  const createHeaderTile = (name, label, onClick) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `se-chat-tile se-chat-${name}`;
    btn.setAttribute('data-se-chat-tip', label);
    btn.setAttribute('aria-label', label);
    btn.append(createIcon(name));
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick(btn, event);
    });
    return btn;
  };

  const resolveChatModel = (win) => SE.fromProps(win, 40, (p) => p.chatView?.chat || null);

  // A sender's next block this soon after their last (seconds) continues the run
  const RUN_GAP = 600;
  const TIME = run(() => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }));
  const LOG_ITEMS = '.ChatMessageBlock, .msg.timeDivision';

  // A block's messages (unAccountID, rtTimestamp), from its props
  const messagesOf = (block) =>
    SE.fromProps(block, 6, (p) => (Array.isArray(p.messages) && p.messages.length ? p.messages : undefined));

  // A group header's picture made of its members' (a group without its own): no "?" faces
  const markGroupPicture = (win) => SE.markGroupFaces?.(win.querySelector(':scope > .chatHeader .ChatRoomMultiFriendAvatar'));

  const syncLog = (win) => {
    const items = win.querySelectorAll(LOG_ITEMS);
    let prev = null;
    // The current run's lines, marked with their place once the run ends
    let lines = [];
    const endRun = () => {
      lines.forEach((line, n) =>
        SE.mark(line, 'data-se-pos', lines.length === 1 ? 'only' : n === 0 ? 'first' : n === lines.length - 1 ? 'last' : 'mid')
      );
      lines = [];
    };
    items.forEach((item, i) => {
      if (!item.classList.contains('ChatMessageBlock')) {
        // A day or time-gap line ends a run; the last item in the log, it heads nothing
        prev = null;
        endRun();
        SE.attr(item, 'data-se-trailing', i === items.length - 1);
        return;
      }
      const msgs = messagesOf(item);
      const first = msgs?.[0];
      const last = msgs?.[msgs.length - 1];
      const gap = first && prev ? first.rtTimestamp - prev.last : -1;
      const sameSender = !!(prev && first && first.unAccountID === prev.sender);
      const continues = sameSender && gap >= 0 && gap <= RUN_GAP;
      SE.attr(item, 'data-se-run', continues);
      // A new run by the same sender (after a pause): a group shows its time, not the face again
      SE.attr(item, 'data-se-streak', sameSender && !continues);
      if (!continues) endRun();
      lines.push(...item.querySelectorAll('.msg:not(.timeDivision)'));
      const stamp = item.querySelector('.ChatSpeaker .speakerTimeStamp');
      if (stamp && first && TIME) SE.mark(stamp, 'data-se-time', TIME.format(new Date(first.rtTimestamp * 1000)));
      prev = first ? { sender: first.unAccountID, last: last.rtTimestamp } : null;
    });
    endRun();
  };

  const readPersonaStatus = (persona) => {
    if (!persona) return { cls: 'offline', text: '' };
    if (run(() => persona.is_ingame)) {
      return {
        cls: run(() => persona.is_awayOrSnooze) ? 'ingame-away' : 'ingame',
        text: run(() => persona.GetCurrentGameName()) || 'In game',
      };
    }
    if (run(() => persona.is_awayOrSnooze)) return { cls: 'awayOrSnooze', text: 'Away' };
    if (run(() => persona.is_online)) return { cls: 'online', text: 'Online' };
    const when = SE.ago(run(() => persona.last_seen_online) || 0);
    return { cls: 'offline', text: when ? `Last online ${when}` : 'Offline' };
  };

  const { setText } = SE;

  const openActiveTabContextMenu = (win, triggerBtn) => {
    const dialog = win.closest('.multiChatDialog');
    const tab = dialog?.querySelector(`.${TAB_CLS}.${TAB_ACTIVE_CLS}, .chatTab.active`);
    if (!tab) return;
    const rect = triggerBtn.getBoundingClientRect();
    const view = win.ownerDocument.defaultView;
    const event = new view.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view,
      clientX: rect.left,
      clientY: rect.bottom + 4,
      button: 2,
    });
    tab.dispatchEvent(event);
  };

  const toggleVoiceCall = (win) => {
    const chat = resolveChatModel(win);
    if (chat && typeof chat.ToggleVoiceChat === 'function') {
      run(() => chat.ToggleVoiceChat());
      return;
    }
    win.querySelector('.ChatMessageEntryVoice .VoiceToggle, .ChatMessageEntryVoice button')?.click();
  };

  const buildDirectChatHeader = (win) => {
    const head = document.createElement('div');
    head.className = 'se-chat-head';

    const avatarBox = document.createElement('div');
    avatarBox.className = 'se-chat-avatar';
    const img = document.createElement('img');
    img.alt = '';
    img.draggable = false;
    avatarBox.append(img);

    const whoBox = document.createElement('div');
    whoBox.className = 'se-chat-who';
    const nameEl = document.createElement('div');
    nameEl.className = 'se-chat-name';
    const statusEl = document.createElement('div');
    statusEl.className = 'se-chat-status';
    whoBox.append(nameEl, statusEl);

    const actions = document.createElement('div');
    actions.className = 'se-chat-actions';
    actions.append(
      createHeaderTile('voice', 'Start voice chat', () => toggleVoiceCall(win)),
      createHeaderTile('invite', 'Invite to a group chat', () =>
        win.querySelector('.inviteAnotherFriendButton')?.click()
      ),
      createHeaderTile('more', 'More', (btn) => openActiveTabContextMenu(win, btn))
    );

    head.append(avatarBox, whoBox, actions);
    return head;
  };

  const syncDirectChatHeader = (win) => {
    const header = win.querySelector(':scope > .chatHeader:not(.titleBarContainer)');
    if (!header) return null;
    const chat = resolveChatModel(win);
    const partner = chat && run(() => chat.chat_partner);
    if (!partner) return null;

    let head = header.querySelector(':scope > .se-chat-head');
    if (!head) {
      head = buildDirectChatHeader(win);
      header.append(head);
    }

    const persona = run(() => partner.persona);
    const status = readPersonaStatus(persona);
    const displayName = run(() => partner.display_name) || run(() => persona.m_strPlayerName) || '';
    const avatarUrl = run(() => persona.avatar_url_medium) || run(() => persona.avatar_url) || '';

    const img = head.querySelector('.se-chat-avatar img');
    if (avatarUrl && img.getAttribute('src') !== avatarUrl) {
      img.setAttribute('src', avatarUrl);
    }

    setText(head.querySelector('.se-chat-name'), displayName);
    setText(head.querySelector('.se-chat-status'), status.text);
    SE.mark(head, 'data-se-status', status.cls);

    const isVoiceActive = !!run(() => chat.BVoiceActive?.());
    if (isVoiceActive) SE.mark(head, 'data-se-voice');
    else SE.unmark(head, 'data-se-voice');

    const voiceBtn = head.querySelector('.se-chat-voice');
    const voiceLabel = isVoiceActive ? 'End voice chat' : 'Start voice chat';
    if (voiceBtn.getAttribute('data-se-chat-tip') !== voiceLabel) {
      voiceBtn.setAttribute('data-se-chat-tip', voiceLabel);
      voiceBtn.setAttribute('aria-label', voiceLabel);
    }
    return displayName;
  };

  const syncComposerPlaceholder = (win, text) => {
    const textarea = win.querySelector(`.chatEntry textarea.${TEXTAREA_CLS}, .chatEntry textarea`);
    if (!textarea || !text) return;
    if (textarea.getAttribute('placeholder') !== text && !textarea.dataset.seOwnPlaceholder) {
      if (textarea.hasAttribute('placeholder') && !textarea.hasAttribute('data-se-placeholder')) {
        textarea.dataset.seOwnPlaceholder = '1';
        return;
      }
      textarea.setAttribute('placeholder', text);
      SE.mark(textarea, 'data-se-placeholder');
    }
  };

  const syncGroupChatLayout = (win, channelName) => {
    const header = win.querySelector(':scope > .chatHeader.titleBarContainer');
    const navColumn = win.querySelector('.chatRoomGroupNavColumn');
    const isGroupLayoutActive = !!(
      !win.closest('.se-fdock') &&
      header &&
      header.querySelector('.chatRoomGroupHeader') &&
      navColumn &&
      !navColumn.classList.contains('defaultChatOnly')
    );

    if (!isGroupLayoutActive) {
      SE.unmark(win, 'data-se-grouplayout');
      SE.unmark(win, 'data-se-members');
      SE.unmark(win, 'data-se-navcollapsed');
      header?.querySelector(':scope > .se-group-channel')?.remove();
      return;
    }

    SE.mark(win, 'data-se-grouplayout');
    if (navColumn.classList.contains('chatRoomGroupNavCollapsed')) {
      SE.mark(win, 'data-se-navcollapsed');
    } else {
      SE.unmark(win, 'data-se-navcollapsed');
    }

    const memberColumn = win.querySelector('.MemberListColumn');
    SE.mark(
      win,
      'data-se-members',
      !memberColumn
        ? 'none'
        : memberColumn.classList.contains('MemberListViewCompact')
          ? 'compact'
          : 'wide'
    );

    let channelBadge = header.querySelector(':scope > .se-group-channel');
    if (!channelBadge) {
      channelBadge = document.createElement('div');
      channelBadge.className = 'se-group-channel';
      channelBadge.append(document.createElement('span'));
      header.append(channelBadge);
    }
    setText(channelBadge.firstChild, channelName || '');

    const stats = header.querySelector('.chatRoomGroupStats');
    if (stats) {
      const parseDigits = (el) => {
        const match = el && el.textContent.replace(/[\s.,\u00a0\u202f']/g, '').match(/\d+/);
        return match ? +match[0] : null;
      };

      const onlineCount = parseDigits(stats.querySelector('.statMembersOnline'));
      const totalCount = parseDigits(stats.querySelector('.statMembersTotal'));
      const parts = [];
      if (onlineCount != null) parts.push(`${compactNum(onlineCount)} online`);
      if (totalCount != null) parts.push(`${compactNum(totalCount)} members`);
      if (parts.length) SE.mark(stats, 'data-se-stats', parts.join(' · '));
      else SE.unmark(stats, 'data-se-stats');
    }
  };

  /*
   * A one-to-one call's bar (calls.css): Steam's strip over the log, with the mic and headphone
   * buttons beside its own gear and hang-up: stand-ins for the message box's (SE.callTools,
   * client/friends/call-tools.js). Muted: Steam's "disabled", or no microphone.
   */
  const CALL_TOOLS = 'se-call-tools';
  const STEAM_TOOL = { mic: '.ToggleMicrophoneButton', out: '.ToggleVoiceOutputButton' };
  const steamTool = (win, kind) => win.querySelector(`.ChatMessageEntryVoice ${STEAM_TOOL[kind]}`);
  const isMuted = (original) => original.classList.contains('disabled') || original.classList.contains('NoMicrophone');

  const syncCallTools = (win) => {
    const bar = win.querySelector('.OneOnOneVoiceRoomControls');
    if (!bar) return;
    let tools = bar.querySelector(`:scope > .${CALL_TOOLS}`);
    if (!tools) {
      tools = win.ownerDocument.createElement('span');
      tools.className = CALL_TOOLS;
      tools.innerHTML = Object.keys(STEAM_TOOL).map((kind) => `<button type="button" class="se-call-tool" data-tool="${kind}"></button>`).join('');
      tools.addEventListener('click', onCallTool);
      bar.append(tools);
    }
    SE.callTools.sync(win, tools.children, steamTool, isMuted);
  };

  function onCallTool(event) {
    const win = SE.callTools.click(event, steamTool);
    // Steam redraws the original's state; the stand-in follows next frame
    if (win) requestAnimationFrame(() => win.isConnected && syncCallTools(win));
  }

  /*
   * The Friends dock's chat flyout with two or more chats: the open chats as faces down a rail on
   * the left (friends-dock-chat-rail.css .se-chat-rail), in place of Steam's tab strip. The strip stays
   * mounted, hidden, and does the work: a face's click goes to its tab, its × to the tab's close,
   * and each face reads its tab (picture, name, status, unread count, open).
   */
  const RAIL = 'se-chat-rail';
  const tabOf = new WeakMap();
  const faceOf = new WeakMap();
  const STATES = ['ingame', 'online', 'awayOrSnooze', 'offline'];

  const onRailClick = (event) => {
    const face = event.target.closest?.(`.${RAIL}-face`);
    const tab = face && tabOf.get(face);
    if (!tab?.isConnected) return;
    if (event.target.closest(`.${RAIL}-close`)) {
      tab.querySelector(`.CloseButton, .${C.CloseButton}`)?.click();
      return;
    }
    // A tab is a focusable panel that switches through its own activation, not a click: call the
    // strip's selectTab with the tab, as its click would (else the click, for an older build)
    const own = SE.fromProps(tab, 6, (p) => (typeof p.selectTab === 'function' && p.tab ? p : undefined));
    if (own) run(() => own.selectTab(own.tab));
    else tab.click();
  };

  const buildFace = (doc) => {
    const face = doc.createElement('button');
    face.type = 'button';
    face.className = `${RAIL}-face`;
    face.innerHTML =
      `<span class="${RAIL}-pic"><img alt="" draggable="false"></span>` +
      `<b class="${RAIL}-count" hidden></b><span class="${RAIL}-close" aria-hidden="true"></span>`;
    return face;
  };

  const syncFace = (face, tab) => {
    const friend = tab.querySelector('.friend');
    const name =
      tab.querySelector(`.playerName, .chatTabName, .${C.ChatTabContent_ChatRoomName}`)?.textContent.trim() ||
      tab.textContent.trim();
    const src = tab.querySelector('img')?.getAttribute('src') || '';
    const img = face.querySelector('img');
    if (src && img.getAttribute('src') !== src) img.setAttribute('src', src);
    SE.attr(img, 'hidden', src ? null : '');
    if (face.title !== name && face.getAttribute('aria-label') !== name) {
      face.title = name;
      face.setAttribute('aria-label', name);
    }
    SE.mark(face, 'data-state', (friend && STATES.find((s) => friend.classList.contains(s))) || 'none');
    const open = tab.classList.contains(TAB_ACTIVE_CLS) || tab.classList.contains('Active');
    SE.attr(face, 'aria-current', open ? 'true' : null);
    const badge = tab.querySelector('.chatTabUnreadBadge, .ChatUnreadMessageIndicator');
    const count = face.querySelector(`.${RAIL}-count`);
    const text = badge ? badge.textContent.trim() || '•' : '';
    SE.setText(count, text);
    SE.attr(count, 'hidden', text ? null : '');
  };

  const syncRail = (dialog) => {
    const tabs = [...dialog.querySelectorAll(`.${TAB_CLS}`)];
    let rail = dialog.querySelector(`:scope > .${RAIL}`);
    if (tabs.length < 2) {
      rail?.remove();
      SE.unmark(dialog, 'data-se-rail');
      return;
    }
    if (!rail) {
      rail = dialog.ownerDocument.createElement('nav');
      rail.className = RAIL;
      rail.setAttribute('aria-label', 'Open chats');
      rail.addEventListener('click', onRailClick);
      dialog.append(rail);
    }
    const faces = tabs.map((tab) => {
      let face = faceOf.get(tab);
      if (!face) {
        face = buildFace(dialog.ownerDocument);
        faceOf.set(tab, face);
        tabOf.set(face, tab);
      }
      syncFace(face, tab);
      return face;
    });
    if (faces.some((face, i) => rail.children[i] !== face) || rail.children.length !== faces.length) rail.replaceChildren(...faces);
    SE.mark(dialog, 'data-se-rail');
  };

  const attachedDocuments = new Map();
  let frame = 0;

  // Live collections: cheap enough to read on every mutation, before the frame paints.
  const markDialogs = (doc) => {
    const dialogs = doc.getElementsByClassName('multiChatDialog');
    if (!dialogs.length) return false;
    const listToggle = doc.getElementsByClassName('friendListCollapse').length > 0;
    for (const dialog of dialogs) {
      const desktop = !dialog.parentElement?.closest('.GamepadMode');
      SE.attr(dialog, DIALOG, desktop);
      SE.attr(dialog, LIST_TOGGLE, desktop && listToggle);
    }
    return true;
  };

  const update = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    for (const doc of [document, ...attachedDocuments.keys()]) {
      if (!markDialogs(doc)) continue;
      for (const win of doc.querySelectorAll(`.multiChatDialog[${DIALOG}] .chatWindow`)) {
        const isDirectChat =
          !!win.querySelector(':scope > .chatHeader:not(.titleBarContainer)') &&
          !win.querySelector(':scope > .chatHeader.titleBarContainer');

        syncLog(win);
        if (isDirectChat) {
          SE.mark(win, 'data-se-friendchat');
          syncCallTools(win);
          const partnerName = syncDirectChatHeader(win);
          syncComposerPlaceholder(win, partnerName ? `Message ${partnerName}` : '');
        } else {
          SE.unmark(win, 'data-se-friendchat');
          markGroupPicture(win);
          const channelName = win
            .querySelector('.ActiveTextChannel .chatRoomTextChannelName')
            ?.textContent.trim()
            .replace(/^#\s*/, '');
          syncGroupChatLayout(win, channelName);
          syncComposerPlaceholder(win, channelName ? `Message #${channelName}` : 'Message');
        }
      }
      for (const dialog of doc.querySelectorAll(`.se-fdock .multiChatDialog[${DIALOG}]`)) syncRail(dialog);
    }
  };

  // Attached popup documents have their own observers; their changes land here once per frame.
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };

  /*
   * Most windows this runs in (Settings, Properties…) never show a chat: only the cheap mark pass
   * runs until Friends & Chat appears, then the full pass, limited to its subtree.
   */
  let watcher = null;
  let timer = null;
  const start = () => {
    watcher = SE.watch(update, { scope: SCOPE, throttle: 100 });
    // Friends data reaches the chat through Steam's stores, not a SteamClient event; 2 s backstop
    // for changes that render without a DOM mutation, only while a chat window is up.
    timer = SE.poll(update, 2000, {
      active: () =>
        SE.visible('.multiChatDialog .chatWindow') ||
        [...attachedDocuments.keys()].some(doc => !!doc.querySelector('.multiChatDialog .chatWindow')),
    });
    update();
  };
  const onAnyMutation = () => {
    if (markDialogs(document) || document.querySelector('.friendsui-container')) {
      if (!watcher) start();
    }
  };
  // `class` too: entering Big Picture (GamepadMode) or the list toggle can change without new nodes.
  const markWatcher = SE.watch(onAnyMutation, { attributes: ['class'] });
  onAnyMutation();

  window.__seChat = {
    documents: () => [...attachedDocuments.keys()],
    detachDocument(doc) {
      attachedDocuments.get(doc)?.disconnect();
      attachedDocuments.delete(doc);
    },
    attachDocument(doc) {
      if (!doc || doc === document || attachedDocuments.has(doc)) return () => {};
      // The popup paints on its own frames: mark new dialogs before it can paint them unstyled.
      // Own observer on purpose: another window's document (one observer per window, its own)
      const obs = new MutationObserver(() => {
        markDialogs(doc);
        schedule();
      });
      obs.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
      attachedDocuments.set(doc, obs);
      markDialogs(doc);
      schedule();
      return () => {
        obs.disconnect();
        attachedDocuments.delete(doc);
      };
    },
    destroy() {
      const docs = [document, ...attachedDocuments.keys()];
      for (const obs of attachedDocuments.values()) obs.disconnect();
      attachedDocuments.clear();
      markWatcher.disconnect();
      watcher?.disconnect();
      timer?.disconnect();
      if (frame) cancelAnimationFrame(frame);

      for (const doc of docs) {
        for (const el of doc.querySelectorAll('.se-chat-head, .se-group-channel, .se-chat-rail, .se-call-tools')) el.remove();
        for (const el of doc.querySelectorAll('[data-se-rail]')) el.removeAttribute('data-se-rail');
        for (const el of doc.querySelectorAll('[data-se-stats]')) el.removeAttribute('data-se-stats');
        for (const el of doc.querySelectorAll('[data-se-run], [data-se-streak], [data-se-time], [data-se-trailing], [data-se-pos], [data-se-faces], [data-se-bare]')) {
          for (const name of ['data-se-run', 'data-se-streak', 'data-se-time', 'data-se-trailing', 'data-se-pos', 'data-se-faces', 'data-se-bare']) el.removeAttribute(name);
        }
        for (const el of doc.querySelectorAll('[data-se-grouplayout], [data-se-friendchat]')) {
          el.removeAttribute('data-se-grouplayout');
          el.removeAttribute('data-se-members');
          el.removeAttribute('data-se-friendchat');
          el.removeAttribute('data-se-navcollapsed');
        }
        for (const el of doc.querySelectorAll(`[${DIALOG}], [${LIST_TOGGLE}]`)) {
          el.removeAttribute(DIALOG);
          el.removeAttribute(LIST_TOGGLE);
        }
        for (const el of doc.querySelectorAll('textarea[data-se-placeholder]')) {
          el.removeAttribute('placeholder');
          el.removeAttribute('data-se-placeholder');
        }
      }
      delete window.__seChat;
    },
  };

  for (const doc of previousDocuments) {
    if (doc.body && !doc.defaultView?.closed) {
      window.__seChat.attachDocument(doc);
    }
  }
})(window.__se);
