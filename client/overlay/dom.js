/*
 * Overlay: building the column (stats, sections, views, cards) and trimming the logo.
 *
 * Part of client/overlay/ (see context.js).
 */
((SE) => {
  const ns = window.__seOverlayParts;
  if (!ns) return;
  const { el } = SE;
  const { ACH_TABS, ICON, SEL, VIEW_ICON, openChat, openToolWidget, openUrl, openWidget } = ns;

  const button = (className, attrs = {}) => {
    const node = el('button', className);
    node.type = 'button';
    for (const [key, value] of Object.entries(attrs)) node.dataset[key] = value;
    return node;
  };

  const img = (className, src) => {
    const node = el('img', className);
    node.alt = '';
    node.loading = 'lazy';
    node.decoding = 'async';
    if (src) node.src = src;
    return node;
  };

  const buildStat = (label) => {
    const cell = el('div', 'se-ov-stat');
    const value = el('div', 'se-ov-stat-value');
    value.append(el('b'), el('small'));
    cell.append(el('div', 'se-ov-stat-label', label), value);
    return cell;
  };

  // A search input in a styled box with an icon, so the overlay's own input
  // styles never decide its size. The column's input handler routes it by
  // `data-search`.
  const searchField = (kind, placeholder) => {
    const box = el('label', 'se-ov-achl-searchbox');
    box.innerHTML = ICON.search;
    const input = el('input', 'se-ov-achl-search');
    input.type = 'text';
    input.placeholder = placeholder;
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', placeholder);
    input.dataset.search = kind;
    box.append(input);
    return { box, input };
  };

  const buildBar = (ratio) => {
    const bar = el('div', 'se-ov-bar');
    const fill = el('i');
    fill.style.width = `${(ratio * 100).toFixed(1)}%`;
    bar.append(fill);
    return bar;
  };

  // A section with a header label and, optionally, a header link: `meta` is
  // the link's text, `action` the data attributes the delegated click reads.
  const buildSection = (key, label, link) => {
    const section = el('section', 'se-ov-sec');
    section.dataset.sec = key;
    section.hidden = true;
    const head = el('div', 'se-ov-sec-head');
    head.append(el('span', 'se-ov-sec-label', label));
    let meta = null;
    if (link) {
      const open = button('se-ov-sec-link', link.action);
      open.setAttribute('aria-label', link.aria);
      open.innerHTML = ICON.chevron;
      meta = el('span', 'se-ov-sec-meta', link.text || '');
      open.prepend(meta);
      head.append(open);
    } else {
      meta = el('span', 'se-ov-sec-note');
      head.append(meta);
    }
    const body = el('div', 'se-ov-sec-body');
    section.append(head, body);
    return { section, head, meta, body, signature: '' };
  };

  const { tierOf, fmtPct } = SE.rarity;

  // An achievement icon with its rarity tier: aura and sparkles when unlocked,
  // the tier's initial either way (core/achievement-tiers.css).
  const achIcon = (className, item, achieved) => {
    const box = el('span', className);
    box.append(img(null, item.icon));
    const tier = tierOf(item.pct);
    if (tier) {
      box.dataset.seTier = tier.id;
      if (!achieved) box.dataset.seTierLocked = '';
      box.append(SE.rarity.fx(tier, !achieved));
    }
    return box;
  };

  // The full list (Steam's Achievements widget, in the column): header with a
  // way back, the progress bar, tier chips that filter, search, tabs and rows.
  // Built once; only the counts and rows change.
  const buildAchList = () => {
    const panel = el('section', 'se-ov-view se-ov-achl');
    panel.dataset.view = 'achievements';
    panel.setAttribute('aria-label', 'Achievements');

    const bar = buildBar(0);
    const chips = el('div', 'se-ov-achl-tiers');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', 'Filter by rarity');

    const { box: searchBox, input: search } = searchField('achievements', 'Search achievements');

    const tabs = el('div', 'se-ov-achl-tabs');
    tabs.setAttribute('role', 'tablist');
    const tabButtons = new Map(
      ACH_TABS.map(({ id }) => {
        const tab = button('se-ov-achl-tab', { achTab: id });
        tab.setAttribute('role', 'tab');
        tabs.append(tab);
        return [id, tab];
      })
    );

    const list = el('ul', 'se-ov-achl-list');
    const empty = el('p', 'se-ov-achl-empty');
    panel.append(bar, chips, searchBox, tabs, list, empty);
    return { panel, bar, chips, search, tabButtons, list, empty, chipsSig: '', rowsSig: '' };
  };

  // The rail of view tabs, the drawer head naming the open view, and the
  // footer under them: Exit game under the rail, Back to game (labelled, with
  // its shortcut) under the drawer. Icon-only buttons name themselves in a
  // flyout (`data-tip`, drawn by CSS) instead of the slow native tooltip.
  const buildTabs = () => {
    const rail = el('nav', 'se-ov-rail');
    rail.setAttribute('aria-label', 'Overlay views');
    const tabs = new Map(
      ns.VIEWS.map(({ id, label }) => {
        const tab = button('se-ov-tab', { view: id, tip: label });
        tab.setAttribute('aria-label', label);
        tab.setAttribute('aria-pressed', 'false');
        const icon = el('span', 'se-ov-tab-icon');
        icon.innerHTML = VIEW_ICON[id];
        tab.append(icon);
        rail.append(tab);
        return [id, { tab }];
      })
    );
    rail.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-view]');
      if (tab) ns.setView(tab.dataset.view);
    });

    const back = button('se-ov-back');
    back.setAttribute('aria-keyshortcuts', 'Shift+Tab');
    back.innerHTML = ICON.play;
    back.append(el('span', 'se-ov-back-label', 'Back to game'), el('kbd', 'se-ov-back-key', 'Shift+Tab'));
    back.addEventListener('click', () => document.querySelector(SEL.backToGame)?.click());
    const exit = button('se-ov-exit', { tip: 'Exit game' });
    exit.setAttribute('aria-label', 'Exit game');
    exit.innerHTML = ICON.power;
    exit.addEventListener('click', () => document.querySelector(SEL.exitGame)?.click());

    const head = el('div', 'se-ov-tabs-head');
    const title = el('h2', 'se-ov-tabs-title');
    const note = el('span', 'se-ov-tabs-note');
    head.append(title, note);
    return { rail, tabs, head, title, note, back, exit };
  };

  // The time cell: today's time; click to start the timer (it then shows the
  // elapsed time), click again to pause, right-click to reset to the clock.
  const buildTimeCell = () => {
    const cell = button('se-ov-stat se-ov-time');
    const label = el('div', 'se-ov-stat-label');
    const value = el('div', 'se-ov-stat-value');
    const b = el('b');
    const small = el('small');
    value.append(b, small);
    cell.append(label, value);
    cell.addEventListener('click', () => (ns.timer.running() ? ns.timer.pause() : ns.timer.start()));
    cell.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      ns.timer.reset();
    });
    return { cell, label, b, small };
  };

  const buildFriendsView = () => {
    const panel = el('section', 'se-ov-view se-ov-friends');
    panel.dataset.view = 'friends';
    panel.setAttribute('aria-label', 'Friends');
    const { box: searchBox } = searchField('friends', 'Search friends');
    const list = el('div', 'se-ov-friends-list');
    const listPane = el('div', 'se-ov-friends-pane');
    listPane.append(searchBox, list);
    panel.append(listPane);
    return { panel, list, sig: '' };
  };

  const sectionLabel = (text) => el('h3', 'se-ov-friends-group', text);

  // Remote Play Together, drawn in the column: you as host with hosting
  // state; inviting opens Steam's own window.
  const buildRemoteView = () => {
    const panel = el('section', 'se-ov-view se-ov-remote');
    panel.dataset.view = 'remote';
    panel.setAttribute('aria-label', 'Remote Play Together');

    const host = el('div', 'se-ov-card-row');
    const hostAvatar = el('span', 'se-ov-avatar');
    hostAvatar.dataset.status = 'ingame';
    const hostText = el('span', 'se-ov-friend-text');
    const hostName = el('span', 'se-ov-friend-name');
    const hostStatus = el('span', 'se-ov-friend-status');
    hostText.append(hostName, hostStatus);
    host.append(hostAvatar, hostText, el('span', 'se-ov-pill', 'Host'));

    // Friend and guest invites go through Steam's own window.
    const open = button('se-ov-btn', { tool: 'remote' });
    open.innerHTML = ICON.open;
    open.prepend(el('span', null, 'Invite friends or a guest'));
    open.title = "Steam's Remote Play Together window";

    const notice = el('p', 'se-ov-tool-text');
    notice.hidden = true;
    panel.append(host, notice, open);
    return { panel, hostAvatar, hostName, hostStatus, notice };
  };

  // Controller, drawn in the column: Steam Input for this game, what the
  // game supports, the connected controllers, and the layout editor.
  const buildControllerView = () => {
    const panel = el('section', 'se-ov-view se-ov-pad');
    panel.dataset.view = 'controller';
    panel.setAttribute('aria-label', 'Controller');

    const toggle = button('se-ov-switch-row', { padSwitch: '' });
    toggle.setAttribute('role', 'switch');
    const toggleText = el('span', 'se-ov-friend-text');
    toggleText.append(
      el('span', 'se-ov-friend-name', "Use the game's built-in support"),
      el('span', 'se-ov-switch-desc')
    );
    toggle.append(toggleText, el('span', 'se-ov-switch'));

    const support = el('div', 'se-ov-chips');
    const pads = el('div', 'se-ov-pad-list');
    const layout = button('se-ov-btn', { padLayout: '' });
    layout.innerHTML = ICON.chevron;
    layout.prepend(el('span', null, 'Controller layout'));
    panel.append(toggle, sectionLabel('Game support'), support, sectionLabel('Connected'), pads, layout);
    return { panel, toggle, desc: toggle.querySelector('.se-ov-switch-desc'), support, pads, sig: '' };
  };

  // Notes, drawn in the column: picker, new/delete, title, a formatting bar
  // and the editor. Saves through Steam's notes store (see Notes below).
  const buildNotesView = () => {
    const panel = el('section', 'se-ov-view se-ov-notes-view');
    panel.dataset.view = 'notes';
    panel.setAttribute('aria-label', 'Notes');

    const bar = el('div', 'se-ov-notes-bar');
    const pickerBox = el('label', 'se-ov-select');
    const picker = el('select', 'se-ov-select-input');
    picker.setAttribute('aria-label', 'Note');
    picker.dataset.notePick = '';
    pickerBox.append(picker);
    const add = button('se-ov-btn', { noteNew: '' });
    add.textContent = '+ New';
    const remove = button('se-ov-btn se-ov-btn-icon', { noteDelete: '' });
    remove.setAttribute('aria-label', 'Delete note');
    remove.title = 'Delete note';
    remove.innerHTML = ICON.trash;
    bar.append(pickerBox, add, remove);

    const confirm = el('div', 'se-ov-confirm');
    confirm.hidden = true;
    const yes = button('se-ov-btn se-ov-btn-danger', { noteDeleteYes: '' });
    yes.textContent = 'Delete';
    const no = button('se-ov-btn', { noteDeleteNo: '' });
    no.textContent = 'Keep';
    confirm.append(el('span', null, 'Delete this note? This can’t be undone.'), yes, no);

    const tools = el('div', 'se-ov-format');
    tools.setAttribute('role', 'toolbar');
    tools.setAttribute('aria-label', 'Formatting');
    for (const [cmd, label, glyph] of ns.FORMAT_TOOLS) {
      const tool = button('se-ov-format-btn', { format: cmd });
      tool.setAttribute('aria-label', label);
      tool.title = label;
      tool.innerHTML = glyph;
      // Keep the editor's selection when a tool is pressed.
      tool.addEventListener('mousedown', (event) => event.preventDefault());
      tools.append(tool);
    }

    const editor = el('div', 'se-ov-note-editor');
    editor.contentEditable = 'true';
    editor.spellcheck = true;
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-multiline', 'true');
    editor.setAttribute('aria-label', 'Note');
    editor.dataset.noteField = '';

    const foot = el('div', 'se-ov-notes-foot');
    const status = el('span', 'se-ov-notes-status');
    const steam = button('se-ov-link', { tool: 'notes' });
    steam.textContent = 'Open in Steam’s editor';
    foot.append(status, steam);

    const empty = el('p', 'se-ov-tool-text');
    panel.append(bar, confirm, tools, editor, foot, empty);
    return { panel, picker, add, remove, confirm, tools, editor, status, steam, empty, listSig: '' };
  };

  // Browser, drawn in the column: an address field, this game's pages, and
  // the overlay browser's open tabs (Steam's own browser shows the page).
  const buildBrowserView = () => {
    const panel = el('section', 'se-ov-view se-ov-browser');
    panel.dataset.view = 'browser';
    panel.setAttribute('aria-label', 'Browser');

    const form = el('form', 'se-ov-field se-ov-address');
    form.setAttribute('role', 'search');
    const icon = el('span', 'se-ov-address-icon');
    icon.innerHTML = ICON.search;
    const input = el('input', 'se-ov-field-input');
    input.type = 'text';
    input.placeholder = 'Search or enter address';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Search or enter address');
    const go = button('se-ov-field-go');
    go.type = 'submit';
    go.setAttribute('aria-label', 'Open');
    go.innerHTML = ICON.chevron;
    form.append(icon, input, go);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const target = ns.addressUrl(input.value);
      if (!target) return;
      openUrl(target);
      input.value = '';
    });

    const links = el('div', 'se-ov-links');
    const tabs = el('div', 'se-ov-web-tabs');
    const open = button('se-ov-btn', { webOpen: '' });
    open.innerHTML = ICON.open;
    open.prepend(el('span', null, 'Open browser'));
    panel.append(form, sectionLabel('This game'), links, sectionLabel('Open tabs'), tabs, open);
    return { panel, links, tabs, linksSig: '', tabsSig: '' };
  };

  // Settings, drawn in the column: the theme's overlay options, and Steam's
  // own in-game settings one click away.
  const buildSettingsView = () => {
    const panel = el('section', 'se-ov-view se-ov-settings');
    panel.dataset.view = 'settings';
    panel.setAttribute('aria-label', 'Settings');

    const sliders = {};
    const rows = Object.entries(ns.BACKDROP).map(([key, spec]) => {
      const row = el('label', 'se-ov-slider');
      const range = el('input', 'se-ov-range');
      range.type = 'range';
      range.min = String(spec.min);
      range.max = String(spec.max);
      range.step = '1';
      range.dataset.backdrop = key;
      range.setAttribute('aria-label', spec.label);
      const value = el('span', 'se-ov-tool-value');
      row.append(el('span', 'se-ov-tool-label', spec.label), range, value);
      sliders[key] = { range, value };
      return row;
    });

    const steam = button('se-ov-btn', { steamSettings: '' });
    steam.innerHTML = ICON.open;
    steam.prepend(el('span', null, 'Steam overlay settings'));

    panel.append(sectionLabel('Backdrop'), ...rows, sectionLabel('Steam'), steam);
    return { panel, sliders };
  };

  const buildOverview = () => {
    const wrap = el('div', 'se-ov-overview');
    const parts = {
      achievements: buildSection('achievements', 'Achievements', {
        aria: 'Show all achievements',
        action: { view: 'achievements' },
      }),
      friends: buildSection('friends', 'Friends'),
      screenshots: buildSection('screenshots', 'Your screenshots', {
        text: 'View all',
        aria: 'Open screenshots',
        action: { widget: 'Screenshots' },
      }),
      guides: buildSection('guides', 'Guides', { text: 'Browse', aria: 'Browse guides', action: { url: '' } }),
      news: buildSection('news', 'Recent news', { text: 'All news', aria: 'Open all news', action: { url: '' } }),
    };

    // One delegated handler: avatars open chat, `data-widget` opens an overlay
    // widget, `data-url` a web page, `data-view` switches the column, and the
    // list's tabs and tier chips filter it.
    wrap.addEventListener('click', (event) => {
      const target = event.target.closest(
        '[data-steamid], [data-widget], [data-url], [data-view], [data-ach-tab], [data-ach-tier], [data-tool], [data-offline], [data-pad-switch], [data-pad-layout], [data-web-open], [data-web-close], [data-steam-settings], [data-format], [data-note-new], [data-note-delete], [data-note-delete-yes], [data-note-delete-no]'
      );
      if (!target || !wrap.contains(target)) return;
      const { steamid, widget, url, view: nextView, achTab, achTier, tool } = target.dataset;
      if (target.dataset.format) ns.formatNote(target.dataset.format);
      else if (target.dataset.noteNew !== undefined) ns.newNote();
      else if (target.dataset.noteDelete !== undefined) ns.askDeleteNote(true);
      else if (target.dataset.noteDeleteYes !== undefined) ns.deleteNote();
      else if (target.dataset.noteDeleteNo !== undefined) ns.askDeleteNote(false);
      else if (target.dataset.padSwitch !== undefined) ns.toggleSteamInput();
      else if (target.dataset.padLayout !== undefined) ns.openControllerLayout();
      else if (target.dataset.webOpen !== undefined) ns.openBrowser(target.dataset.webOpen);
      else if (target.dataset.webClose) ns.closeWebTab(Number(target.dataset.webClose));
      else if (target.dataset.steamSettings !== undefined) openToolWidget('settings');
      else if (steamid) openChat(steamid);
      else if (tool) openToolWidget(tool);
      else if (target.dataset.offline !== undefined) ns.setFriendsState({ offline: !ns.friendsState.offline });
      else if (widget) openWidget(widget);
      else if (url) openUrl(url);
      else if (nextView) ns.setView(nextView);
      else if (achTab) ns.setListState({ tab: achTab });
      else if (achTier !== undefined) ns.setListState({ tier: ns.listState.tier === achTier ? null : achTier });
    });
    wrap.addEventListener('input', (event) => {
      const { search } = event.target.dataset;
      if (search === 'achievements') ns.setListState({ query: event.target.value });
      else if (search === 'friends') ns.setFriendsState({ query: event.target.value });
      else if (event.target.dataset.backdrop) ns.setBackdrop(event.target.dataset.backdrop, Number(event.target.value));
      else if (event.target.closest('[data-note-field]')) ns.noteEdited();
    });
    wrap.addEventListener('change', (event) => {
      if (event.target.dataset.notePick !== undefined) ns.pickNote(event.target.value);
    });
    // The bottom fade shows only while more content sits below.
    wrap.addEventListener('scroll', () => ns.updateScrollHint(wrap), { passive: true });

    const list = buildAchList();
    const friendsView = buildFriendsView();
    const tools = {
      remote: buildRemoteView(),
      notes: buildNotesView(),
      controller: buildControllerView(),
      browser: buildBrowserView(),
      settings: buildSettingsView(),
    };
    wrap.append(
      ...Object.values(parts).map(part => part.section),
      list.panel,
      friendsView.panel,
      ...Object.values(tools).map(tool => tool.panel)
    );
    return { wrap, ...parts, list, friendsView, tools };
  };

  // Header: the logo over two rows, beside Time · This session and
  // Total · Last 2 weeks. Body: the rail beside the drawer (the open view).
  const buildCard = () => {
    const card = el('div', 'se-ov-card');
    const logo = img('se-ov-logo');
    logo.loading = 'eager';
    const name = el('div', 'se-ov-name');
    const time = buildTimeCell();
    const session = buildStat('This session');
    const total = buildStat('Total');
    const recent = buildStat('Last 2 weeks');
    card.append(logo, name, time.cell, session, total, recent);

    const overview = buildOverview();
    const tabs = buildTabs();
    const body = el('div', 'se-ov-body');
    const drawer = el('div', 'se-ov-drawer');
    drawer.append(tabs.head, overview.wrap);
    body.append(tabs.rail, drawer, tabs.exit, tabs.back);
    return { card, body, logo, name, time, stats: { session, total, recent }, overview, tabs };
  };

  /* ---------- Logo trim ---------- */

  // Library logos often sit on a padded transparent canvas. Measure the opaque
  // bounds once per URL and crop with `object-view-box`, so the logo hugs the
  // corner. Cross-origin images without CORS can't be read; they stay as-is.
  const ALPHA_MIN = 8;
  const SAMPLE_MAX = 320;
  const trims = new Map();

  const measureTrim = (src) =>
    new Promise(resolve => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.decoding = 'async';
      image.onerror = () => resolve(null);
      image.onload = () => {
        const scale = Math.min(1, SAMPLE_MAX / Math.max(image.naturalWidth, image.naturalHeight));
        const w = Math.max(1, Math.round(image.naturalWidth * scale));
        const h = Math.max(1, Math.round(image.naturalHeight * scale));
        const ctx = Object.assign(document.createElement('canvas'), { width: w, height: h })
          .getContext('2d', { willReadFrequently: true });
        const data = SE.run(() => (ctx.drawImage(image, 0, 0, w, h), ctx.getImageData(0, 0, w, h).data));
        if (!data) return resolve(null);
        let top = h, left = w, right = -1, bottom = -1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            if (data[(y * w + x) * 4 + 3] < ALPHA_MIN) continue;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
          }
        }
        if (right < 0) return resolve(null);
        const pct = (n, total) => `${((n / total) * 100).toFixed(2)}%`;
        resolve(`inset(${pct(top, h)} ${pct(w - 1 - right, w)} ${pct(h - 1 - bottom, h)} ${pct(left, w)})`);
      };
      image.src = src;
    });

  const applyTrim = (logo, src) => {
    if (!trims.has(src)) {
      trims.set(src, null);
      measureTrim(src).then(box => {
        trims.set(src, box);
        if (logo.getAttribute('src') === src) logo.style.objectViewBox = box || '';
      });
    }
    logo.style.objectViewBox = trims.get(src) || '';
  };

  Object.assign(ns, { achIcon, applyTrim, buildBar, buildCard, button, fmtPct, img, tierOf });
})(window.__se);
