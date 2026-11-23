/*
 * Steam's friend picker, rebuilt as a checklist wherever a dialog shows it: Create / Manage
 * Category, Create a new chat, Invite to a group chat, Remote Play's invite. Steam's label and
 * the chosen count over a search field; then each friend a row with their face, name, status and
 * a check at its end. Chosen friends lead the list when it opens and on every search, so
 * toggling never moves a row out from under the pointer. Rows come a page at a time as the list
 * scrolls, and the list reaches down to the dialog's footer, measured on open and on resize.
 *
 * Steam's picker (sp.js, FriendPicker) is a field of chosen-friend chips to type into, over a
 * list of the friends not chosen; its props carry the label, the chosen friends
 * (rgPickedFriends), onChange (the dialog keeps the list it saves) and excludeFriend (friends it
 * can't offer, e.g. a chat's members).
 *
 * The picker stays mounted, hidden ([data-se-fpick], friend-picker.css), and the theme's block
 * follows it: a sibling React doesn't touch while the dialog is open. Each toggle hands onChange
 * every chosen friend (Steam's player objects), so the dialog saves as it always has; a change
 * from elsewhere (a friend dropped on the invite dialog) is read back from the picker's props.
 * Chosen accounts who aren't listed (no longer friends) stay chosen.
 *
 * Big Picture (.GamepadMode) keeps Steam's picker.
 */
((SE) => {
  window.__seFriendPicker?.destroy();

  const { run, esc } = SE;
  const ROOT = 'data-se-fpick';
  const OURS = 'se-fpick';
  const PICKER = '.FriendPicker';
  // Rows drawn at a time; the next page when the list's end scrolls near
  const PAGE = 100;
  // The list's floor
  const MIN_LIST = 160;
  // Steam's "?" picture, what an account without an avatar reports
  const DEFAULT_AVATAR = /fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb/i;
  // Away and Snooze (EPersonaState 3, 4)
  const AWAY = { 3: 'Away', 4: 'Snooze' };
  const RANK = { ingame: 0, online: 0, away: 1, offline: 2 };

  const attempt = SE.attempt('Friend picker');
  const isOurs = (node) => node.nodeType === 1 && !!node.closest?.(`.${OURS}`);
  const friendStore = () => run(() => SE.global('g_FriendsUIApp', (a) => a.FriendStore).FriendStore);
  let made = 0;

  // The picker's props: { label, rgPickedFriends, onChange, excludeFriend, ... }, a few fibers up
  const pickerProps = (picker) =>
    SE.fromProps(picker, 8, (p) => (typeof p.onChange === 'function' && Array.isArray(p.rgPickedFriends) ? p : undefined));

  // A friend as a row shows them
  function describe(player) {
    const p = player.persona;
    const name = run(() => player.display_name) || run(() => p.m_strPlayerName) || '';
    let state = 'offline';
    let line;
    if (run(() => p.is_ingame)) {
      state = 'ingame';
      line = run(() => p.GetCurrentGameName()) || 'In game';
    } else if (run(() => p.is_online)) {
      const away = AWAY[p.m_ePersonaState];
      state = away ? 'away' : 'online';
      line = away || 'Online';
    } else {
      const when = SE.ago(run(() => p.last_seen_online) || 0);
      line = when ? `Last online ${when}` : 'Offline';
    }
    const url = run(() => p.avatar_url_medium) || '';
    return {
      id: player.accountid,
      player,
      name,
      state,
      line,
      avatar: url && !DEFAULT_AVATAR.test(url) ? url : '',
      initials: SE.initials(name) || '?',
    };
  }

  const face = (f) =>
    f.avatar
      ? `<img src="${esc(f.avatar)}" alt="" draggable="false">`
      : `<b aria-hidden="true">${esc(f.initials)}</b>`;

  const rowHTML = (f, on) =>
    `<div class="${OURS}-row" role="option" aria-selected="${on}" tabindex="-1" data-id="${f.id}" data-state="${f.state}">` +
    `<span class="${OURS}-av" data-initials="${esc(f.initials)}">${face(f)}</span>` +
    `<span class="${OURS}-text"><span class="${OURS}-name">${esc(f.name)}</span><span class="${OURS}-line">${esc(f.line)}</span></span>` +
    `<span class="${OURS}-check" aria-hidden="true"></span></div>`;

  function build(doc, label) {
    const id = `${OURS}-label-${++made}`;
    const block = doc.createElement('div');
    block.className = OURS;
    block.innerHTML =
      `<div class="${OURS}-head"><span class="${OURS}-label" id="${id}">${esc(label)}</span><span class="${OURS}-count" aria-live="polite"></span></div>` +
      `<label class="${OURS}-search"><span class="se-search-icon" aria-hidden="true"></span>` +
      `<input type="text" placeholder="Search friends" aria-label="Search friends" autocomplete="off" spellcheck="false"></label>` +
      `<div class="${OURS}-list" role="listbox" aria-multiselectable="true" aria-labelledby="${id}">` +
      `<div class="${OURS}-note" role="presentation" hidden></div><i class="${OURS}-end" aria-hidden="true"></i></div>`;
    return block;
  }

  const createView = (picker) => {
    const props = pickerProps(picker);
    if (!props) return null;

    // Every friend the picker offers, and the chosen ones (accounts not listed kept too)
    const byId = new Map();
    for (const player of run(() => friendStore().all_friends) || []) {
      if (props.excludeFriend && run(() => props.excludeFriend(player))) continue;
      const f = attempt(() => describe(player), null);
      if (f) byId.set(f.id, f);
    }
    const picked = new Set();
    const others = new Map();
    const readPicked = (chosen) => {
      picked.clear();
      others.clear();
      for (const player of chosen) {
        picked.add(player.accountid);
        if (!byId.has(player.accountid)) others.set(player.accountid, player);
      }
    };
    readPicked(props.rgPickedFriends);

    const label = typeof props.label === 'string' && props.label ? props.label : 'Friends';
    const block = build(picker.ownerDocument, label);
    const input = block.querySelector('input');
    const list = block.querySelector(`.${OURS}-list`);
    const count = block.querySelector(`.${OURS}-count`);
    const note = block.querySelector(`.${OURS}-note`);
    const end = block.querySelector(`.${OURS}-end`);
    const isRow = (node) => !!node?.classList?.contains(`${OURS}-row`);
    const rows = () => list.querySelectorAll(`.${OURS}-row`);
    let found = [];
    let shown = 0;
    let active = null;
    let frame = 0;

    const sortKey = (a, b) =>
      picked.has(b.id) - picked.has(a.id) || RANK[a.state] - RANK[b.state] || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

    const matches = (f, query) =>
      !query || (run(() => f.player.BMatchesSearchString(query, false)) ?? f.name.toLocaleLowerCase().includes(query));

    const paintCount = () => {
      count.textContent = picked.size ? `${picked.size.toLocaleString()} chosen` : 'None chosen';
    };

    // The next page of rows, before the end marker
    const more = () => {
      if (shown >= found.length) return;
      const page = found.slice(shown, shown + PAGE);
      shown += page.length;
      end.insertAdjacentHTML('beforebegin', page.map((f) => rowHTML(f, picked.has(f.id))).join(''));
    };

    // The list for the search text: chosen first, then online, then by name
    const render = () => {
      frame = 0;
      const query = input.value.trim().toLocaleLowerCase();
      found = [...byId.values()].filter((f) => matches(f, query)).sort(sortKey);
      shown = 0;
      for (const row of rows()) row.remove();
      more();
      list.scrollTop = 0;
      active = list.querySelector(`.${OURS}-row`);
      if (active) active.tabIndex = 0;
      const text = !byId.size ? 'Your friends show up here' : found.length ? '' : `No friends match “${input.value.trim()}”`;
      note.textContent = text;
      note.hidden = !text;
    };

    // The end marker nearing view draws the next page (no scroll handler, no layout read)
    const pager = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) more();
    }, { root: list, rootMargin: '0px 0px 300px 0px' });

    // The list down to the footer's top, less the dialog's gap: read on open and on resize
    let fitFrame = 0;
    const fit = () => {
      fitFrame = 0;
      const footer = picker.closest('.DialogContent, form')?.querySelector('.DialogFooter');
      if (!footer || !list.isConnected) return;
      const gap = SE.px('--se-space-5');
      const top = list.getBoundingClientRect().top;
      const room = footer.getBoundingClientRect().top - gap - top;
      // Never past the window, should the footer follow the list instead of sitting at the foot
      const cap = innerHeight - top - footer.offsetHeight - 2 * gap;
      SE.cssVar(block, '--se-fpick-h', `${Math.max(MIN_LIST, Math.floor(Math.min(room, cap)))}px`);
    };
    const fitSoon = () => {
      if (!fitFrame) fitFrame = requestAnimationFrame(fit);
    };
    const renderSoon = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };

    // The dialog keeps the list: every chosen friend, as the picker hands it over
    const push = () => {
      const current = pickerProps(picker);
      const players = [...picked].map((id) => byId.get(id)?.player || others.get(id)).filter(Boolean);
      attempt(() => current?.onChange(players));
    };

    const paintRows = () => {
      for (const row of rows()) row.setAttribute('aria-selected', String(picked.has(Number(row.dataset.id))));
    };

    const toggle = (row) => {
      const id = Number(row.dataset.id);
      if (picked.has(id)) picked.delete(id);
      else picked.add(id);
      row.setAttribute('aria-selected', String(picked.has(id)));
      paintCount();
      push();
    };

    // The list is one Tab stop (a roving tabindex): arrows move, Space or Enter toggles
    const focusRow = (row) => {
      if (!row) return;
      if (active && active !== row) active.tabIndex = -1;
      active = row;
      row.tabIndex = 0;
      row.focus();
    };

    const onClick = (event) => {
      const row = event.target.closest(`.${OURS}-row`);
      if (!row) return;
      toggle(row);
      focusRow(row);
    };

    const onKeyDown = (event) => {
      if (event.target === input) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          focusRow(active);
        } else if (event.key === 'Enter') {
          // The first match, not the dialog's submit
          event.preventDefault();
          const first = list.querySelector(`.${OURS}-row`);
          if (first) toggle(first);
        }
        return;
      }
      const row = event.target.closest?.(`.${OURS}-row`);
      if (!row) return;
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        toggle(row);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (event.key === 'ArrowDown' && !isRow(row.nextElementSibling)) more();
        const next = event.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling;
        if (isRow(next)) focusRow(next);
        else if (event.key === 'ArrowUp') input.focus();
      } else if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        // End: every page, then the last row
        if (event.key === 'End') while (shown < found.length) more();
        const all = rows();
        focusRow(event.key === 'Home' ? all[0] : all[all.length - 1]);
      }
    };

    // error doesn't bubble: a face that fails to load becomes the friend's initials
    const onError = (event) => {
      const img = event.target;
      if (img?.tagName !== 'IMG') return;
      const av = img.closest(`.${OURS}-av`);
      if (!av) return;
      const initials = picker.ownerDocument.createElement('b');
      initials.setAttribute('aria-hidden', 'true');
      initials.textContent = av.dataset.initials || '?';
      img.replaceWith(initials);
    };

    // Chosen from elsewhere (a friend dropped on the invite dialog): the picker redraws its chips
    const sync = () => {
      const chosen = pickerProps(picker)?.rgPickedFriends;
      if (!chosen || (chosen.length === picked.size && chosen.every((p) => picked.has(p.accountid)))) return;
      readPicked(chosen);
      paintRows();
      paintCount();
    };

    block.addEventListener('click', onClick);
    block.addEventListener('keydown', onKeyDown);
    list.addEventListener('error', onError, true);
    input.addEventListener('input', renderSoon);
    picker.after(block);
    SE.attr(picker, ROOT, '');
    const change = SE.onChange(picker, sync);
    addEventListener('resize', fitSoon);
    paintCount();
    render();
    pager.observe(end);
    fitSoon();

    return {
      root: picker,
      destroy() {
        change.disconnect();
        pager.disconnect();
        removeEventListener('resize', fitSoon);
        cancelAnimationFrame(frame);
        cancelAnimationFrame(fitFrame);
        block.removeEventListener('click', onClick);
        block.removeEventListener('keydown', onKeyDown);
        list.removeEventListener('error', onError, true);
        input.removeEventListener('input', renderSoon);
        block.remove();
        SE.unmark(picker, ROOT);
      },
    };
  };

  const mounted = SE.mount(
    'Friend picker',
    () => [...document.querySelectorAll(PICKER)].filter((picker) => !picker.closest('.GamepadMode')),
    createView,
    // Inside the observer's own callback: rebuilt before the dialog's first paint, so Steam's
    // picker never shows
    { sync: true, scope: PICKER, ignore: isOurs }
  );

  window.__seFriendPicker = {
    destroy() {
      mounted.destroy();
      delete window.__seFriendPicker;
    },
  };
})(window.__se);
