/*
 * A friend's small dialogs, rebuilt: Add / Change Nickname and Friend Notifications (and Invite
 * to Group Chat's header, below). Both lead
 * with the friend, as the game dialogs lead with the game: their profile background behind the
 * top (SE.dialogArt.friend; their picture blurred when they have none), Steam's title as an
 * eyebrow, then their face, name and status.
 *
 *   Nickname       one field labelled Nickname, Steam's line about it under the field
 *   Notifications  "Use my default notifications settings" as a switch; while it's on, a line
 *                  says what the defaults do instead of a greyed-out table; off, each event a
 *                  row with a bell and a sound toggle (Steam's checkboxes, as icons)
 *
 * Steam renders them from sp.js: NicknameDialog (its text, then a .friend row: picture, name,
 * "current nickname set as" and the field) and FriendNotificationsDialog (its text, a .friend
 * row, the defaults checkbox, then SettingsGroup's table: a header row and three rows of two
 * checkboxes). Their props carry the friend ({ player }). Steam's nodes stay mounted and keep
 * saving; the theme adds the header after Steam's title and, for Notifications, the defaults
 * line at the body's end (child lists React doesn't change while the dialog is open), and
 * friend-dialogs.css hides what the header replaces ([data-se-friend]).
 *
 * Invite to Group Chat (ChatRoomGroupInviteDialog) keeps Steam's header, its title an eyebrow over
 * the group's picture and name (client/dialogs/utility/friends.css): a group without a picture of
 * its own (initials, or an ad-hoc chat's members' faces, "?" for one without) gets the initials
 * tile, and one with a picture gets it blurred behind the top ([data-se-friend="invite"]).
 *
 * A group chat's Notifications (ChatRoomNotificationSettingsDialog, its props { group }) leads
 * with the chat the same way: its picture blurred behind the top, then its picture (an unnamed
 * chat's members' faces, else its initials), name and members. The level dropdown becomes a list
 * of radio rows, each saying what it does; a choice calls Steam's own handler (the level
 * component's set_notification_level), and Steam's dropdown stays in, hidden, as the source of
 * truth ([data-se-friend="chat"]). The unread switch and the channels are Steam's, restyled.
 */
((SE) => {
  window.__seFriendDialogs?.destroy();

  const { run, esc } = SE;
  const DIALOGS = '.NicknameDialog, .FriendNotificationsDialog, .ChatRoomGroupInviteDialog, .ChatRoomNotificationSettingsDialog';
  // Steam's level component draws its own .ChatRoomNotificationSettingsDialog inside the dialog's
  const INNER_CHAT = '.ChatRoomNotificationSettingsDialog .ChatRoomNotificationSettingsDialog';
  const ROOT = 'data-se-friend';
  const OURS = 'se-friend';

  const attempt = SE.attempt('Friend dialogs');
  const isOurs = (node) => node.nodeType === 1 && !!node.closest?.(`.${OURS}-head, .${OURS}-defaults, .${OURS}-av, .${OURS}-levels, .se-dialog-art`);
  const playerOf = (root) => SE.fromProps(root, 14, (p) => (p.player?.persona ? p.player : undefined));

  // The events, in Steam's rows' order: [what, its show setting, its sound setting]
  const EVENTS = [
    ['their games', 'bNotifications_ShowIngame', 'bSounds_PlayIngame'],
    ['coming online', 'bNotifications_ShowOnline', 'bSounds_PlayOnline'],
    ['their messages', 'bNotifications_ShowMessage', 'bSounds_PlayMessage'],
  ];

  // "A", "A and B", "A, B and C"
  const join = (items) => (items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

  // What the default notification settings do, in one line
  function defaultsLine() {
    const settings = run(() => SE.global('g_FriendsUIApp', (a) => a.SettingsStore).SettingsStore.FriendsSettings);
    if (!settings) return '';
    const shows = EVENTS.filter(([, show]) => settings[show]).map(([what]) => what);
    const sounds = EVENTS.filter(([, , sound]) => settings[sound]).map(([what]) => what);
    if (!shows.length && !sounds.length) return 'Following your defaults: nothing about them notifies you.';
    const parts = [];
    if (shows.length) parts.push(`a notification for ${join(shows)}`);
    if (sounds.length) parts.push(`a sound for ${join(sounds)}`);
    return `Following your defaults: ${parts.join(', and ')}.`;
  }

  // The friend under the eyebrow: face, name, status
  function buildHead(doc, player, name) {
    const f = SE.friendStatus(player, 'full');
    const head = doc.createElement('div');
    head.className = `${OURS}-head`;
    head.dataset.state = f.state;
    head.innerHTML =
      `<span class="${OURS}-av" data-initials="${esc(f.initials)}">` +
      (f.avatar ? `<img src="${esc(f.avatar)}" alt="" draggable="false">` : `<b aria-hidden="true">${esc(f.initials)}</b>`) +
      `</span><span class="${OURS}-text"><span class="se-dialog-name">${esc(name || f.name)}</span>` +
      `<span class="${OURS}-line">${esc(f.line)}</span></span>`;
    return { head, avatar: f.avatar };
  }

  // Invite to Group Chat: the group's picture as the art, else its initials as the face
  const createInvite = (root) => {
    const row = root.querySelector('.DialogHeader .displayRow');
    if (!row) return null;
    const own = row.querySelector('.ChatRoomGroupAvatar.HasAvatar img')?.getAttribute('src');
    let node = null;
    if (own) {
      node = SE.dialogArt.picture(root.closest('.DialogContent') ?? root, own);
    } else {
      const name = row.querySelector('.DialogHeaderSubtitle')?.textContent || '';
      node = root.ownerDocument.createElement('span');
      node.className = `${OURS}-av`;
      node.innerHTML = `<b aria-hidden="true">${esc(SE.initials(name) || '#')}</b>`;
      row.prepend(node);
    }
    SE.attr(root, ROOT, 'invite');
    return {
      root,
      destroy() {
        node?.remove();
        SE.unmark(root, ROOT);
      },
    };
  };

  /* ---------- A group chat's Notifications ---------- */

  // Steam's levels, in its options' order (all, any mention, direct mention, none): an icon and
  // what each does; Steam's labels name them
  const LEVELS = [
    ['bell', 'A notification for each new message'],
    ['at', 'When someone mentions everyone, or you'],
    ['user', 'Only when someone mentions you by name'],
    ['bell-off', 'No notifications; the chat stays quiet'],
  ];

  const clanOf = (group) =>
    run(() => (group.BIsClanChatRoom() ? SE.global('g_FriendsUIApp', (a) => a.FriendStore).FriendStore.ClanStore.GetClan(group.GetClanID()) : null));

  // The chat's face: its picture or its clan's, an unnamed chat's first two members, else initials
  function chatFace(doc, group, name) {
    const av = doc.createElement('span');
    av.className = `${OURS}-av`;
    av.dataset.initials = SE.initials(name) || '#';
    const own = run(() => (group.hasIcon ? group.avatar_url_full : clanOf(group)?.avatar_url_full)) || '';
    const faces = own || run(() => group.IsNamedGroupChat())
      ? []
      : (run(() => group.members_to_highlight.members) || [])
        .map((m) => run(() => m.persona.avatar_url_medium))
        .filter((url) => url && !SE.isDefaultAvatar?.(url))
        .slice(0, 2);
    if (own) av.innerHTML = `<img src="${esc(own)}" alt="" draggable="false">`;
    else if (faces.length === 2) {
      av.dataset.faces = '';
      av.innerHTML = faces.map((url) => `<img src="${esc(url)}" alt="" draggable="false">`).join('');
    } else if (faces.length) av.innerHTML = `<img src="${esc(faces[0])}" alt="" draggable="false">`;
    else av.innerHTML = `<b aria-hidden="true">${esc(av.dataset.initials)}</b>`;
    return { av, picture: own || faces[0] || '' };
  }

  // "Group chat · 2 members", "Steam group · 42 members · 3 text channels"
  function chatLine(group) {
    const parts = [run(() => group.BIsClanChatRoom()) ? 'Steam group' : 'Group chat'];
    // Steam's own count (its multi-face picture's): the summary until the full list has loaded
    const members = run(() => (group.m_bFullStateLoaded ? group.m_groupMembers.unfiltered_count : group.m_cMemberSummaryCount)) || 0;
    if (members) parts.push(SE.dialogArt.count(members, 'member', 'members'));
    const channels = run(() => group.chatRoomList.filter((room) => room.BShouldTrackUnreadMessages()).length) || 0;
    if (channels > 1) parts.push(SE.dialogArt.count(channels, 'text channel', 'text channels'));
    return parts.join(' · ');
  }

  // A group chat under a dialog's eyebrow: its face, name and line. destroy() removes it
  function chatHead(doc, group, name) {
    const head = doc.createElement('div');
    head.className = `${OURS}-head`;
    const { av, picture } = chatFace(doc, group, name);
    const text = doc.createElement('span');
    text.className = `${OURS}-text`;
    text.innerHTML = `<span class="se-dialog-name">${esc(name)}</span><span class="${OURS}-line">${esc(chatLine(group))}</span>`;
    head.append(av, text);
    // A picture that fails to load: the initials
    const onError = (event) => {
      if (event.target?.tagName !== 'IMG') return;
      const b = doc.createElement('b');
      b.setAttribute('aria-hidden', 'true');
      b.textContent = av.dataset.initials;
      delete av.dataset.faces;
      av.replaceChildren(b);
    };
    head.addEventListener('error', onError, true);
    return {
      head,
      picture,
      destroy() {
        head.removeEventListener('error', onError, true);
        head.remove();
      },
    };
  }
  SE.chatHead = chatHead;

  // The levels as radio rows, inside Steam's .notificationRow (a child list React leaves alone)
  function buildLevels(doc, level) {
    const list = doc.createElement('div');
    list.className = `${OURS}-levels`;
    list.setAttribute('role', 'radiogroup');
    const current = run(() => level.get_notification_level(true));
    level.drop_down_options.forEach((option, i) => {
      const [icon, what] = LEVELS[i] || LEVELS[0];
      const row = doc.createElement('label');
      row.className = `${OURS}-level`;
      row.style.setProperty('--se-friend-icon', `var(--se-icon-${icon})`);
      row.innerHTML =
        `<input type="radio" name="se-chat-level" value="${i}"${option.data === current ? ' checked' : ''}>` +
        `<span class="${OURS}-level-icon" aria-hidden="true"></span>` +
        `<span class="${OURS}-text"><span class="${OURS}-level-name">${esc(String(option.label))}</span>` +
        `<span class="${OURS}-line">${esc(what)}</span></span>`;
      list.append(row);
    });
    return list;
  }

  const createChat = (root) => {
    const group = SE.fromProps(root, 14, (p) => (p.group?.chatRoomList ? p.group : undefined));
    const title = root.querySelector('.DialogHeader');
    const row = root.querySelector('.notificationRow');
    const level = row && SE.findDown(root, (p) => typeof p.set_notification_level === 'function' && Array.isArray(p.drop_down_options));
    if (!group || !title || !level) return null;
    const doc = root.ownerDocument;
    // The name Steam shows ("A and B" for an unnamed chat), in its "For chatroom …" line
    const name = root.querySelector('.whiteText')?.textContent.trim() || run(() => group.name) || '';

    const { head, picture, destroy: unhead } = chatHead(doc, group, name);
    title.after(head);
    const art = picture ? attempt(() => SE.dialogArt.picture(root.closest('.DialogContent') ?? root, picture), null) : null;

    const list = buildLevels(doc, level);
    row.append(list);
    const onPick = (event) => {
      const option = level.drop_down_options[Number(event.target.value)];
      if (option) attempt(() => level.set_notification_level(option.data));
    };
    list.addEventListener('change', onPick);

    SE.attr(root, ROOT, 'chat');

    // The window fits the rebuilt dialog, and again as the unread switch shows or hides
    let unfit = SE.dialogArt.fitWindow(root, { shrink: true });
    const refit = SE.onChange(root.querySelector('.DialogBody') ?? root, () => {
      unfit();
      unfit = SE.dialogArt.fitWindow(root, { shrink: true });
    }, { ignore: isOurs });

    return {
      root,
      destroy() {
        refit.disconnect();
        unfit();
        list.removeEventListener('change', onPick);
        unhead();
        for (const node of [list, art]) node?.remove();
        SE.unmark(root, ROOT);
      },
    };
  };

  const createView = (root) => {
    if (root.matches('.ChatRoomGroupInviteDialog')) return createInvite(root);
    if (root.matches('.ChatRoomNotificationSettingsDialog')) return createChat(root);
    const player = playerOf(root);
    const title = root.querySelector('.DialogHeader');
    if (!player || !title) return null;
    const nickname = root.matches('.NicknameDialog');
    const doc = root.ownerDocument;
    const nodes = [];

    // The nickname dialog names them by their Steam name, the field holding the nickname
    const name = nickname ? run(() => player.persona.m_strPlayerName) : '';
    const { head, avatar } = buildHead(doc, player, name);
    title.after(head);
    nodes.push(head);
    const art = attempt(() => SE.dialogArt.friend(root.closest('.DialogContent') ?? root, player.accountid, avatar), null);
    if (art) nodes.push(art);

    // A picture that fails to load: their initials
    const onError = (event) => {
      if (event.target?.tagName !== 'IMG') return;
      const av = event.target.closest(`.${OURS}-av`);
      if (!av) return;
      const b = doc.createElement('b');
      b.setAttribute('aria-hidden', 'true');
      b.textContent = av.dataset.initials || '?';
      event.target.replaceWith(b);
    };
    head.addEventListener('error', onError, true);

    const titled = []; // Steam's checkboxes given a title and aria-label, cleared on destroy
    if (!nickname) {
      const body = root.querySelector('.DialogBody');
      const line = defaultsLine();
      if (body && line) {
        const defaults = doc.createElement('div');
        defaults.className = `${OURS}-defaults`;
        defaults.textContent = line;
        body.append(defaults);
        nodes.push(defaults);
      }
      // Each toggle named by its column (Steam's header row: Show a notification, Play a sound)
      const titles = [...root.querySelectorAll('.FriendsSettingsNotificationRow_Header .FriendsSettingsNotificationRow_Checkbox')].map(
        (cell) => cell.textContent.trim()
      );
      for (const row of root.querySelectorAll('.FriendsSettingsNotificationRow:not(.FriendsSettingsNotificationRow_Header)')) {
        const label = row.querySelector('.FriendsSettingsNotificationRow_Label')?.textContent.trim() || '';
        row.querySelectorAll('.FriendsSettingsNotificationRow_Checkbox .DialogCheckbox').forEach((box, i) => {
          if (!titles[i]) return;
          box.title = titles[i];
          box.setAttribute('aria-label', `${titles[i]}: ${label}`);
          titled.push(box);
        });
      }
    }

    SE.attr(root, ROOT, nickname ? 'nickname' : 'notifications');

    // Steam sizes both windows for its own, longer dialogs: the window fits the rebuilt one, and
    // again each time the defaults switch shows or hides the events (the body's useDefaults class)
    let unfit = SE.dialogArt.fitWindow(root, { shrink: true });
    const body = root.querySelector('.DialogBody');
    const refit = () => {
      unfit();
      unfit = SE.dialogArt.fitWindow(root, { shrink: true });
    };
    const switched = !nickname && body ? SE.onChange(body, refit, { attributes: ['class'], ignore: isOurs }) : null;

    return {
      root,
      destroy() {
        switched?.disconnect();
        unfit();
        head.removeEventListener('error', onError, true);
        // A moving background stops with the dialog
        for (const video of art?.querySelectorAll('video') || []) video.pause();
        for (const node of nodes) node.remove();
        for (const box of titled) {
          box.removeAttribute('title');
          box.removeAttribute('aria-label');
        }
        SE.unmark(root, ROOT);
      },
    };
  };

  const mounted = SE.mount(
    'Friend dialogs',
    () => [...document.querySelectorAll(DIALOGS)].filter((root) => !root.closest('.GamepadMode') && !root.matches(INNER_CHAT)),
    createView,
    // Inside the observer's own callback: the header is in before the dialog's first paint
    { sync: true, scope: DIALOGS, ignore: isOurs }
  );

  window.__seFriendDialogs = {
    destroy() {
      mounted.destroy();
      delete SE.chatHead;
      delete window.__seFriendDialogs;
    },
  };
})(window.__se);
