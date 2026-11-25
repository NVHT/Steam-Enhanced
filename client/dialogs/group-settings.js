/*
 * A group chat's Group Settings, led by the chat as the friend dialogs are: Steam's sidebar
 * becomes the dialog's head, its title an eyebrow over the chat's face, name and members
 * (SE.chatHead, friend-dialogs.js) with the picture blurred behind, and its pages a row of tabs
 * under it (group-settings.css), with Steam's Leave button small and red in the head. An unsaved
 * chat shows two pages (Save Group Chat, Invite Links; its Leave Group Chat page goes, the button
 * does the same), a saved group six (General, Channels, Permissions, Invite Links, Invited Users,
 * Bans): [data-se-groupset="unsaved" | "saved"].
 *
 * Steam renders the dialog from sp.js: a component with props { groupView } around its paged
 * layout (module 72945: Container > Nav [NavTitle, NavItems, the Leave button] + Content).
 * Steam remounts the dialog when a chat is saved (IsNamedGroupChat), and the view with it.
 * Invite Links' rows each gain a Copy button and their expiry as time left ("in 5 hr", Steam's
 * date in the tooltip), read from the page's props ({ inviteLinks: { rgInviteLinks } }, each
 * link's time_expires()).
 */
((SE) => {
  window.__seGroupSettings?.destroy();

  const { run } = SE;
  const ROOT = 'data-se-groupset';
  const OURS = 'se-gs';

  const attempt = SE.attempt('Group settings');
  const isOurs = (node) => node.nodeType === 1 && !!node.closest?.(`.se-friend-head, .${OURS}-copy, .se-dialog-art`);

  // A link lasting longer than this keeps Steam's date (or its "Never expires")
  const FAR_SECS = 365 * 86400;

  // "in 40 min", "in 5 hr", "in 3 days"; "Expired" once past; '' when far off
  function timeLeft(unixSeconds) {
    const secs = unixSeconds - Date.now() / 1000;
    if (secs > FAR_SECS) return '';
    if (secs <= 0) return 'Expired';
    if (secs < 3600) return `in ${Math.max(1, Math.round(secs / 60))} min`;
    if (secs < 86400) return `in ${Math.round(secs / 3600)} hr`;
    const days = Math.round(secs / 86400);
    return `in ${days} ${days === 1 ? 'day' : 'days'}`;
  }

  // Invite Links: each row its time left and a Copy button before Delete
  function syncInvites(root, doc) {
    const table = root.querySelector('.InviteLinksTable');
    if (!table) return;
    const links = SE.fromProps(table, 12, (p) => (Array.isArray(p.inviteLinks?.rgInviteLinks) ? p.inviteLinks.rgInviteLinks : undefined)) || [];
    table.querySelectorAll('tbody tr').forEach((row, i) => {
      const date = row.querySelector('.dateCell');
      const expires = run(() => links[i].time_expires());
      const left = date && expires ? timeLeft(expires) : '';
      if (!left) delete date?.dataset.seLeft;
      else {
        if (date.dataset.seLeft !== left) date.dataset.seLeft = left;
        const full = date.textContent.trim();
        if (date.title !== full) date.title = full;
      }
      const cell = row.querySelector('.buttonCell');
      if (!cell || cell.querySelector(`.${OURS}-copy`)) return;
      // The theme's copy button (SE.copyButton), filled to sit beside Delete
      const copy = SE.copyButton({
        text: () => row.querySelector('.inviteURLLink')?.value || '',
        label: 'Copy link',
        doc,
        win: doc.defaultView,
      });
      copy.classList.add(`${OURS}-copy`);
      copy.dataset.tone = 'button';
      cell.prepend(copy);
    });
  }

  const createView = (root) => {
    const groupView = SE.fromProps(root, 20, (p) => (typeof p.groupView?.GetGroup === 'function' ? p.groupView : undefined));
    const group = run(() => groupView.GetGroup());
    const named = run(() => group.IsNamedGroupChat());
    if (!group || typeof named !== 'boolean') return null;
    const nav = root.querySelector(`.${SE.C.Nav}`);
    const title = nav?.querySelector(`.${SE.C.NavTitle}`);
    if (!title) return null;
    const doc = root.ownerDocument;

    const { head, picture, destroy: unhead } = SE.chatHead(doc, group, run(() => group.name) || '');
    title.after(head);
    const art = picture ? attempt(() => SE.dialogArt.picture(root, picture), null) : null;
    SE.attr(root, ROOT, named ? 'saved' : 'unsaved');
    // A saved group's Leave shows as its icon alone (group-settings.css): its name on hover
    const leave = named ? nav.querySelector('.SVGIcon_ExitIcon')?.parentElement : null;
    if (leave && !leave.title) leave.title = leave.textContent.trim();

    // Pages swap and rows load: the rows get theirs. The window keeps Steam's size; the page
    // scrolls under the head (group-settings.css)
    const sync = () => attempt(() => syncInvites(root, doc));
    sync();
    const changes = SE.onChange(root, sync, { ignore: isOurs });

    return {
      root,
      destroy() {
        changes.disconnect();
        for (const node of root.querySelectorAll(`.${OURS}-copy`)) node.remove();
        for (const cell of root.querySelectorAll('.dateCell[data-se-left]')) {
          delete cell.dataset.seLeft;
          cell.removeAttribute('title');
        }
        if (leave) leave.removeAttribute('title');
        unhead();
        art?.remove();
        SE.unmark(root, ROOT);
      },
    };
  };

  const mounted = SE.mount(
    'Group settings',
    () => [...document.querySelectorAll(`.${SE.C.NavItem_Container}`)].filter((root) => !root.closest('.GamepadMode')),
    createView,
    // Inside the observer's own callback: the head is in before the dialog's first paint
    { sync: true, ignore: isOurs }
  );

  window.__seGroupSettings = {
    destroy() {
      mounted.destroy();
      delete window.__seGroupSettings;
    },
  };
})(window.__se);
