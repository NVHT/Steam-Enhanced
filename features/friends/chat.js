/* Populate direct-chat headers, group-chat layout attributes, and composer placeholders. */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  const previousDocuments = window.__steamEnhancedChat?.documents?.() || [];
  window.__steamEnhancedChat?.destroy();
  if (!document.body) return;

  const { C, run } = SE;
  const TAB_CLS = C.ChatTab;
  const TAB_ACTIVE_CLS = C.ChatTab_Active;
  const TEXTAREA_CLS = C.chatTextarea;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  /* Desktop chat dialogs (not Big Picture's): chat.css keys every rule on this mark */
  const DIALOG = 'data-se-chat';
  /* The Friends window's list collapse button is shown: the tab strip leaves room for it */
  const LIST_TOGGLE = 'data-se-list-toggle';
  const SCOPE = '.friendsui-container, .multiChatDialog';
  const COMPACT = run(() => new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }));
  const compactNum = n => run(() => COMPACT.format(n)) || String(n);

  const ICONS = {
    voice:
      '<path class="fill" d="M5 4.5h3l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6.5a2 2 0 0 1 2-2z"/>' +
      '<path d="M5 4.5h3l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6.5a2 2 0 0 1 2-2z"/>',
    invite:
      '<circle class="fill" cx="9.5" cy="8" r="3.5"/>' +
      '<circle cx="9.5" cy="8" r="3.5"/>' +
      '<path d="M3 20c.8-3.4 3.4-5.2 6.5-5.2s5.7 1.8 6.5 5.2M19.5 8.5v6M16.5 11.5h6"/>',
    more:
      '<circle class="dot" cx="6" cy="12" r="1.5"/>' +
      '<circle class="dot" cx="12" cy="12" r="1.5"/>' +
      '<circle class="dot" cx="18" cy="12" r="1.5"/>',
  };

  const createIcon = name => {
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
    btn.addEventListener('click', event => {
      event.stopPropagation();
      onClick(btn, event);
    });
    return btn;
  };

  const resolveChatModel = win => SE.fromProps(win, 40, p => p.chatView?.chat || null);

  const readPersonaStatus = persona => {
    if (!persona) return { cls: 'offline', text: '' };
    if (run(() => persona.is_ingame)) {
      return {
        cls: run(() => persona.is_awayOrSnooze) ? 'ingame-away' : 'ingame',
        text: run(() => persona.GetCurrentGameName()) || 'In game',
      };
    }
    if (run(() => persona.is_awayOrSnooze)) return { cls: 'awayOrSnooze', text: 'Away' };
    if (run(() => persona.is_online)) return { cls: 'online', text: 'Online' };
    return { cls: 'offline', text: 'Offline' };
  };

  const setText = (el, text) => {
    if (el.textContent !== text) el.textContent = text;
  };

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

  const toggleVoiceCall = win => {
    const chat = resolveChatModel(win);
    if (chat && typeof chat.ToggleVoiceChat === 'function') {
      run(() => chat.ToggleVoiceChat());
      return;
    }
    win.querySelector('.ChatMessageEntryVoice .VoiceToggle, .ChatMessageEntryVoice button')?.click();
  };

  const buildDirectChatHeader = win => {
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
      createHeaderTile('more', 'More', btn => openActiveTabContextMenu(win, btn))
    );

    head.append(avatarBox, whoBox, actions);
    return head;
  };

  const syncDirectChatHeader = win => {
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
      const parseDigits = el => {
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

  const attachedDocuments = new Map();
  let frame = 0;

  // Live collections: cheap enough to read on every mutation, before the frame paints.
  const markDialogs = doc => {
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

        if (isDirectChat) {
          SE.mark(win, 'data-se-friendchat');
          const partnerName = syncDirectChatHeader(win);
          syncComposerPlaceholder(win, partnerName ? `Message ${partnerName}` : '');
        } else {
          SE.unmark(win, 'data-se-friendchat');
          const channelName = win
            .querySelector('.ActiveTextChannel .chatRoomTextChannelName')
            ?.textContent.trim()
            .replace(/^#\s*/, '');
          syncGroupChatLayout(win, channelName);
          syncComposerPlaceholder(win, channelName ? `Message #${channelName}` : 'Message');
        }
      }
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

  window.__steamEnhancedChat = {
    documents: () => [...attachedDocuments.keys()],
    detachDocument(doc) {
      attachedDocuments.get(doc)?.disconnect();
      attachedDocuments.delete(doc);
    },
    attachDocument(doc) {
      if (!doc || doc === document || attachedDocuments.has(doc)) return () => {};
      // The popup paints on its own frames: mark new dialogs before it can paint them unstyled.
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
        for (const el of doc.querySelectorAll('.se-chat-head, .se-group-channel')) el.remove();
        for (const el of doc.querySelectorAll('[data-se-stats]')) el.removeAttribute('data-se-stats');
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
      delete window.__steamEnhancedChat;
    },
  };

  for (const doc of previousDocuments) {
    if (doc.body && !doc.defaultView?.closed) {
      window.__steamEnhancedChat.attachDocument(doc);
    }
  }
});
