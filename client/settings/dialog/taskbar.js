/*
 * Steam Settings › Interface › Taskbar Preferences: the tray menu those switches build, beside
 * them (styles: client/settings/pages-interface.css; each option's glyph: core/icons-nav.css).
 *
 *   [ Status options              ]   [ (NV) NVHT                 ]
 *   [ Online ················ (on)]   [ Online  Away  Invisible   ]
 *   [ ...                         ]   [ [▣] [▣] [▣] [▣] [▣]       ]
 *   [ Destinations                ]   [ [▣] [▣] [▣] [▣] [▣]       ]
 *   [ Store ················· (on)]   [ Exit Steam                ]
 *   [ ...                         ]   Exit: the taskbar's list only
 *
 * Steam draws the switches once Set Taskbar Preferences is pressed, one per jump list option (a
 * jumplist_flags bit); each row is told apart by the option its React props carry, never its
 * label, and the preview takes its words from the rows, so it follows Steam's language. The tray
 * shows the statuses (in its header, client/tray/tray.js), pages and modes that are on; it always
 * ends with Exit Steam (Steam's AlwaysExit), so the Exit switch changes only the list Windows draws
 * on the taskbar. Hovering a switch lights what it changes.
 */
((SE) => {
  window.__seSettingsTaskbar?.destroy();
  const ns = window.__seSettingsParts;
  if (!ns) return;

  const { C, el } = SE;
  const PAGE = '[id$="/settings/interface_Content"]';
  // The block Steam draws the switches in (its MarginTop div): the one holding jump list rows
  const BLOCK = `${PAGE} .${C.MarginTop}`;
  const PAGES = ['Store', 'MyGames', 'Community', 'FriendActivity', 'Friends', 'Screenshots', 'Servers', 'Settings'];
  const MODES = ['BigPicture', 'VR'];
  const STATUSES = ['Online', 'Away', 'Invisible', 'Offline'];
  const TASKBAR_ONLY = new Set(['Exit']);

  // A row's jump list option (its C0 component's props: option and the flags it edits), kept per row
  const options = new WeakMap();
  const optionOf = (field) => {
    if (!options.has(field)) {
      const option = SE.run(() =>
        SE.fromProps(field, 8, (p) => (typeof p.option === 'string' && 'flags' in p ? p.option : undefined))
      );
      options.set(field, option || null);
    }
    return options.get(field);
  };

  // The block's rows: option → { on, label }
  function read(block) {
    const rows = {};
    for (const field of block.querySelectorAll(ns.FIELD)) {
      const option = optionOf(field);
      if (option) rows[option] = { on: ns.switchOn(field), label: ns.fieldLabel(field) };
    }
    return rows;
  }

  const self = () => SE.run(() => SE.global('g_FriendsUIApp', (app) => app.FriendStore).FriendStore.self);

  function makeHead() {
    const head = el('div', 'se-jl-head');
    const avatar = el('span', 'se-jl-avatar');
    const me = self();
    const name = SE.run(() => me.display_name) || '';
    const url = SE.run(() => me.persona.avatar_url_medium) || '';
    if (url && !SE.isDefaultAvatar(url)) {
      const img = el('img');
      img.src = url;
      img.alt = '';
      avatar.append(img);
    } else {
      avatar.textContent = SE.initials(name) || '?';
    }
    const who = el('div', 'se-jl-who');
    who.append(el('span', 'se-jl-name', name), el('span', 'se-jl-statuses'));
    head.append(avatar, who);
    return head;
  }

  const item = (cls, option, label) => {
    const node = el('span', cls, label);
    node.dataset.seTrayOption = option;
    return node;
  };

  function draw(v, rows) {
    const key = JSON.stringify(rows);
    if (key === v.key) return;
    v.key = key;
    const statuses = v.head.querySelector('.se-jl-statuses');
    statuses.replaceChildren(...STATUSES.filter((o) => rows[o]?.on).map((o) => item('se-jl-status', o, rows[o].label)));
    // Pages, then modes: icon tiles, as in the tray
    const tiles = [...PAGES, ...MODES].filter((o) => rows[o]?.on);
    v.pages.replaceChildren(...tiles.map((o) => item('se-jl-tile', o, '')));
    SE.attr(v.pages, 'data-empty', tiles.length ? null : '');
    v.exit.textContent = rows.Exit?.label || '';
    v.exit.dataset.seTrayOption = 'AlwaysExit';
  }

  const views = new Set();
  const sync = () => {
    for (const v of views) draw(v, read(v.block));
  };

  const ignore = SE.inside('.se-jl');
  const mounted = SE.mount(
    'Settings taskbar',
    () => [...document.querySelectorAll(BLOCK)].filter((block) => [...block.querySelectorAll(ns.FIELD)].some(optionOf)),
    (block) => {
      const root = el('div', 'se-jl');
      root.setAttribute('aria-hidden', 'true'); // a picture of the tray menu; Steam's switches stay the controls
      const menu = el('div', 'se-jl-menu');
      const head = makeHead();
      const pages = el('div', 'se-jl-pages');
      const exit = el('span', 'se-jl-row se-jl-exit');
      menu.append(head, pages, exit);
      const note = el('div', 'se-jl-note', "Exit changes only the taskbar's right-click list: the tray always ends with it");
      root.append(menu, note);
      block.prepend(root);
      SE.mark(block, 'data-se-jl');
      const v = { block, root, head, pages, exit, note, key: '' };
      views.add(v);
      SE.run(sync);
      return {
        destroy() {
          views.delete(v);
          root.remove();
          SE.unmark(block, 'data-se-jl');
        },
      };
    },
    { sync: true, scope: PAGE, ignore }
  );
  // Steam's switches flip their On class
  const watcher = SE.watch(sync, { scope: PAGE, attributes: ['class'], throttle: 50, ignore });

  // The hovered switch's part lit: its tile or row, or the note for the taskbar's own options
  let hovered = null;
  const onOver = (event) => {
    const field = event.target.closest?.(`[data-se-jl] ${ns.FIELD}`);
    const option = field ? optionOf(field) : null;
    if (option === hovered) return;
    hovered = option;
    for (const v of views) {
      SE.attr(v.root, 'data-focus', option ? '' : null);
      for (const node of v.root.querySelectorAll('[data-se-tray-option]')) {
        SE.attr(node, 'data-lit', node.dataset.seTrayOption === option ? '' : null);
      }
      SE.attr(v.note, 'data-lit', option && TASKBAR_ONLY.has(option) ? '' : null);
    }
  };
  document.addEventListener('pointerover', onOver);

  window.__seSettingsTaskbar = {
    destroy() {
      mounted.destroy();
      watcher.disconnect();
      document.removeEventListener('pointerover', onOver);
      delete window.__seSettingsTaskbar;
    },
  };
})(window.__se);
