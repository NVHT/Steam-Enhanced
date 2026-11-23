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
 */
((SE) => {
  window.__seFriendDialogs?.destroy();

  const { run, esc } = SE;
  const DIALOGS = '.NicknameDialog, .FriendNotificationsDialog, .ChatRoomGroupInviteDialog';
  const ROOT = 'data-se-friend';
  const OURS = 'se-friend';

  const attempt = SE.attempt('Friend dialogs');
  const isOurs = (node) => node.nodeType === 1 && !!node.closest?.(`.${OURS}-head, .${OURS}-defaults, .${OURS}-av, .se-dialog-art`);
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

  const createView = (root) => {
    if (root.matches('.ChatRoomGroupInviteDialog')) return createInvite(root);
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
        SE.unmark(root, ROOT);
      },
    };
  };

  const mounted = SE.mount(
    'Friend dialogs',
    () => [...document.querySelectorAll(DIALOGS)].filter((root) => !root.closest('.GamepadMode')),
    createView,
    // Inside the observer's own callback: the header is in before the dialog's first paint
    { sync: true, scope: DIALOGS, ignore: isOurs }
  );

  window.__seFriendDialogs = {
    destroy() {
      mounted.destroy();
      delete window.__seFriendDialogs;
    },
  };
})(window.__se);
