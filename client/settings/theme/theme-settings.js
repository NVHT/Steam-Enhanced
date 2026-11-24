/*
 * The theme's settings window: every setting (SE.settings, client/shared/settings.js) in a Steam
 * popup window of its own. A sidebar (the theme's name and version, a search, a tab per group)
 * beside the tab's page. Appearance: the colour presets and Custom as swatch tiles by mood,
 * Custom's editor (every colour a preset sets, with contrast marks), then Fine-tune. Every other
 * setting: a row with a segmented control, picture tiles (a visual one) or chips (a multi one).
 * A change applies at once, everywhere.
 *
 * Opened from the rail's Settings menu (client/header/header-actions.js) through
 * window.__seThemeSettings.open(). The popup is Steam's own popup modal (Steam's React and modal
 * manager, from client/settings/millennium/millennium-window.js), drawn from this window; the
 * look is theme-settings.css, which the popup's loader gives it (desktop windows).
 */
((SE) => {
  window.__seThemeSettings?.destroy();
  const { run } = SE;

  const TITLE = 'Steam Enhanced';
  const WIDTH = 1120;
  const HEIGHT = 820;

  // Each tab's icon (a mask token, core/icons-*.css) and the line under its title
  const TABS = {
    Appearance: ['--se-icon-sliders', 'How the theme looks, in every window and web page.'],
    Navigation: ['--se-icon-compass', 'The rail and the title bar.'],
    Home: ['--se-icon-home', "The Library's Home: its stage and the games it features."],
    Startup: ['--se-icon-power', 'What shows while Steam and its windows load.'],
    Library: ['--se-icon-library', 'The Library and its game list.'],
    Friends: ['--se-icon-friends', 'The Friends dock.'],
    Toasts: ['--se-icon-bell', "Steam's notification toasts."],
    Overlay: ['--se-icon-tv', 'The in-game Steam Overlay.'],
    'Web pages': ['--se-icon-globe', 'Store, Community, Support and Checkout.'],
  };


  // Each setting's icon in its row's tile (a mask token, core/icons-*.css)
  const ICONS = {
    font: 'quote', contrast: 'eye', corners: 'grid', glass: 'dynamic', popups: 'tux', 'menu-hints': 'list', 'rail-labels': 'list',
    'game-art': 'photo', motion: 'activity', entrance: 'play', 'startup-background': 'home-stage',
    spinner: 'refresh', 'game-list-width': 'view-expanded', 'dock-width': 'friends', toasts: 'bell',
    'toasts-in-game': 'console', 'toast-style': 'view-compact', 'toast-position': 'move', overlay: 'tv',
    'overlay-darkness': 'moon', 'click-opens': 'external', 'menu-hover': 'fold', shortcuts: 'key',
    home: 'home', 'stage-source': 'heart', 'stage-count': 'list-ordered', 'stage-details': 'info',
    'stage-nav': 'view-compact', 'stage-cycle': 'restore', 'stage-motion': 'art-zoom',
    'hover-delay': 'snooze', 'avatar-name': 'user', 'game-count': 'chart', 'rail-buttons': 'list-ordered',
    'dock-start': 'power', 'chat-open': 'bubble', 'hover-cards': 'user', 'hover-card-delay': 'snooze',
    'profile-backgrounds': 'photo',
    'toast-time': 'snooze', 'toast-queue': 'list', 'stage-position': 'move', 'toast-ach-art': 'art-zoom',
    'toast-hover': 'pause', 'overlay-open': 'tv', 'overlay-ach-tab': 'badge', 'overlay-panels': 'grid',
    'overlay-views': 'list', 'overlay-clock': 'calendar', 'overlay-playtime': 'activity',
    'web-sites': 'globe', 'page-width': 'view-expanded',
    'game-sections': 'folder', 'game-list-icons': 'tag', 'rarity-tiers': 'badge',
    'splash-when': 'calendar', 'startup-wait': 'pause', 'splash-art': 'art-zoom', 'background-motion': 'art-parallax',
  };

  // A multi setting's choices' icons, by setting (Rail buttons: each rail button's own)
  const CHIP_ICONS = {
    'rail-buttons': {
      store: 'store', library: 'library', community: 'community', profile: 'user', alerts: 'bell',
      news: 'announcements', games: 'console', downloads: 'install',
    },
    'game-sections': {
      achievements: 'badge', friends: 'friends', activity: 'activity', screenshots: 'photo', cards: 'inventory',
      dlc: 'gift', workshop: 'workshop', review: 'thumb', notes: 'edit',
    },
    'overlay-panels': { achievements: 'badge', friends: 'friends', screenshots: 'photo', guides: 'workshop', news: 'news' },
    'overlay-views': { remote: 'broadcast', notes: 'edit', controller: 'console', browser: 'globe' },
    'web-sites': { store: 'store', community: 'community', help: 'help', checkout: 'cart' },
  };

  // WCAG contrast of two #rrggbb colours (an rgba() line counts as no text colour)
  const luminance = (hex) => {
    const m = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [n >> 16, (n >> 8) & 255, n & 255]
      .map((v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4))
      .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  };
  const contrast = (a, b) => {
    const x = luminance(a);
    const y = luminance(b);
    return x == null || y == null ? Infinity : (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };

  let popup = null;
  let view = null; // the mounted view: { doc, destroy }

  /* ---------- The view ---------- */

  function mount(host) {
    const doc = host.ownerDocument;
    const settings = SE.settings;
    if (!settings) return () => {};
    const make = (tag, className, text) => {
      const node = doc.createElement(tag);
      if (className) node.className = className;
      if (text != null) node.textContent = text;
      return node;
    };
    const button = (className, text) => {
      const node = make('button', className, text);
      node.type = 'button';
      return node;
    };
    const tabNames = settings.tabs;

    let tab = tabNames[0];
    let query = '';
    let updates = []; // each shown control's refresh, after a change
    let shape = ''; // what the page's structure depends on: a change of it redraws the page

    /* Sidebar */
    const side = make('nav', 'se-ts-side');
    side.setAttribute('aria-label', 'Settings');
    const brand = make('div', 'se-ts-brand');
    const mark = make('span', 'se-ts-mark');
    mark.setAttribute('aria-hidden', 'true');
    const names = make('div');
    const version = make('div', 'se-ts-version');
    names.append(make('div', 'se-ts-name', TITLE), version);
    brand.append(mark, names);
    SE.themeVersion?.().then((v) => {
      if (v) version.textContent = `Version ${v}`;
    });

    const search = make('label', 'se-ts-search');
    const icon = make('span', 'se-search-icon');
    icon.setAttribute('aria-hidden', 'true');
    const input = make('input');
    input.type = 'search';
    input.placeholder = 'Search settings';
    input.setAttribute('aria-label', 'Search settings');
    search.append(icon, input);

    const tabList = make('div', 'se-ts-tabs');
    tabList.setAttribute('role', 'tablist');
    tabList.setAttribute('aria-orientation', 'vertical');
    const tabButtons = new Map(
      tabNames.map((name) => {
        const node = button('se-ts-tab', name);
        node.setAttribute('role', 'tab');
        node.dataset.tab = name;
        node.style.setProperty('--se-ts-icon', `var(${TABS[name]?.[0] || '--se-icon-settings'})`);
        tabList.append(node);
        return [name, node];
      })
    );
    side.append(brand, search, tabList);

    /* Page */
    // The page: its header stays while the content under it scrolls, as Steam Settings' does
    const page = make('main', 'se-ts-page');
    page.setAttribute('role', 'tabpanel');
    const pageHead = make('div', 'se-ts-page-head');
    const pageBody = make('div', 'se-ts-page-body');
    page.append(pageHead, pageBody);
    host.append(side, page);

    // A multi setting's choices as chips, each its icon and name, lit when on (aria-pressed)
    const toggles = (item) => {
      const group = make('div', 'se-ts-chips');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', item.label);
      const buttons = item.values.map((choice) => {
        const node = button('se-ts-chip', choice.label);
        node.dataset.value = choice.v;
        node.style.setProperty('--se-ts-icon', `var(--se-icon-${CHIP_ICONS[item.key]?.[choice.v] || 'check'})`);
        group.append(node);
        return node;
      });
      group.addEventListener('click', (event) => {
        const node = event.target.closest('button[data-value]');
        if (!node) return;
        const on = settings.get(item.key);
        const v = node.dataset.value;
        settings.set(item.key, on.includes(v) ? on.filter((x) => x !== v) : [...on, v]);
      });
      updates.push(() => {
        const on = settings.get(item.key);
        for (const node of buttons) node.setAttribute('aria-pressed', String(on.includes(node.dataset.value)));
      });
      return group;
    };

    // A visual setting's choices as picture tiles: each a drawing of itself (data-setting,
    // data-value; theme-settings.css, the spinners from spinner-previews.css) over its name
    const pictures = (item) => {
      const group = make('div', 'se-ts-picks');
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', item.label);
      const tiles = item.values.map((choice) => {
        const tile = button('se-ts-pick');
        tile.setAttribute('role', 'radio');
        tile.dataset.value = choice.v;
        const art = make('span', 'se-ts-pick-art');
        art.setAttribute('aria-hidden', 'true');
        art.dataset.setting = item.key;
        art.dataset.value = choice.v;
        tile.append(art, make('span', 'se-ts-pick-name', choice.label));
        group.append(tile);
        return tile;
      });
      group.addEventListener('click', (event) => {
        const tile = event.target.closest('button[data-value]');
        if (tile) settings.set(item.key, tile.dataset.value);
      });
      updates.push(() => {
        const value = settings.get(item.key);
        for (const tile of tiles) tile.setAttribute('aria-checked', String(tile.dataset.value === value));
      });
      return group;
    };

    // A segmented control (client/shared/segmented.css) of the setting's choices
    const segmented = (item) => {
      const group = make('div', 'se-seg');
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-label', item.label);
      const buttons = item.values.map((choice) => {
        const node = button('', choice.label);
        node.setAttribute('role', 'radio');
        node.dataset.value = choice.v;
        group.append(node);
        return node;
      });
      group.addEventListener('click', (event) => {
        const node = event.target.closest('button[data-value]');
        if (node) pick(item, node.dataset.value);
      });
      updates.push(() => {
        const value = settings.get(item.key);
        for (const node of buttons) node.setAttribute('aria-checked', String(node.dataset.value === value));
      });
      return group;
    };

    // Picking a palette's Custom brings back the colours kept, or starts from the palette in use
    const pick = (item, value) => {
      if (item.key === 'palette' && value === 'custom' && !settings.customColors()) settings.setCustom();
      else settings.set(item.key, value);
    };

    // A row: the setting's icon tile, its name and line, then its control
    const row = (item, withTab) => {
      const node = make('div', 'se-ts-row');
      const tile = make('span', 'se-ts-row-icon');
      tile.setAttribute('aria-hidden', 'true');
      tile.style.setProperty('--se-ts-icon', `var(--se-icon-${ICONS[item.key] || 'settings'})`);
      node.append(tile);
      const text = make('div', 'se-ts-text');
      if (withTab) text.append(make('div', 'se-ts-row-tab', item.tab));
      text.append(make('div', 'se-ts-label', item.label), make('div', 'se-ts-hint', item.hint));
      // Chips, or more than four choices: the control goes under the text, which keeps its line
      if (item.type === 'multi' || item.visual || item.values.length > 4) node.classList.add('se-ts-row-wide');
      const control = item.type === 'multi' ? toggles(item) : item.visual ? pictures(item) : segmented(item);
      node.append(text, control);
      // A setting that applies only with others (requires) dims, its controls off, until they hold
      if (item.requires) {
        updates.push(() => {
          const off = !item.requires.every(([key, value]) => settings.get(key) === value);
          node.classList.toggle('se-ts-row-off', off);
          for (const control of node.querySelectorAll('button')) control.disabled = off;
        });
      }
      return node;
    };

    // A tab's rows: a card per section (its heading over it), else one card
    const sections = (items) => {
      const groups = new Map();
      for (const item of items) {
        const name = item.section || '';
        if (!groups.has(name)) groups.set(name, []);
        groups.get(name).push(item);
      }
      return [...groups].flatMap(([name, list]) => {
        const rows = make('div', 'se-ts-rows');
        rows.append(...list.map((item) => row(item)));
        return name ? [heading(name), rows] : [rows];
      });
    };

    const heading = (text, aside) => {
      const head = make('div', 'se-ts-section-head');
      head.append(make('h2', 'se-ts-eyebrow', text));
      if (aside) head.append(aside);
      return head;
    };

    /*
     * The palettes as swatch tiles under their mood (the preset's group), each filled with its
     * own background and striped with its text, raised panel and accent (--se-ts-p-* on the
     * tile); Custom closes the last group as a dashed tile. One radio group across them all.
     */
    const paletteCards = () => {
      const item = settings.schema.find((s) => s.key === 'palette');
      const box = make('div', 'se-ts-palettes');
      box.setAttribute('role', 'radiogroup');
      box.setAttribute('aria-label', 'Colours');
      const groups = new Map();
      const rowOf = (name) => {
        let row = groups.get(name);
        if (!row) {
          const group = make('div', 'se-ts-palette-group');
          row = make('div', 'se-ts-palette-row');
          group.append(make('span', 'se-ts-palette-mood', name), row);
          box.append(group);
          groups.set(name, row);
        }
        return row;
      };
      const tiles = item.values.map((choice) => {
        const preset = settings.presets.find((p) => p.v === choice.v);
        const tile = button('se-ts-palette');
        tile.setAttribute('role', 'radio');
        tile.dataset.value = choice.v;
        const swatch = make('span', 'se-ts-palette-art');
        swatch.setAttribute('aria-hidden', 'true');
        if (!preset) tile.classList.add('se-ts-palette-custom');
        tile.append(swatch, make('span', 'se-ts-palette-name', choice.label));
        return { tile, preset };
      });
      // Presets in their groups' first-seen order, Custom after the last
      for (const { tile, preset } of tiles) if (preset) rowOf(preset.group || 'Other').append(tile);
      const last = [...groups.values()].pop() || rowOf('Other');
      for (const { tile, preset } of tiles) if (!preset) last.append(tile);
      box.addEventListener('click', (event) => {
        const tile = event.target.closest('button[data-value]');
        if (tile) pick(item, tile.dataset.value);
      });
      updates.push(() => {
        const value = settings.get('palette');
        for (const { tile, preset } of tiles) {
          tile.setAttribute('aria-checked', String(tile.dataset.value === value));
          if (!preset) continue;
          for (const key of ['bg', 'surface2', 'text', 'accent']) tile.style.setProperty(`--se-ts-p-${key}`, preset.colors[key]);
        }
      });
      return box;
    };

    // Custom's editor: every colour a preset sets, by group; a hex (or rgba() line) each
    const customEditor = () => {
      const box = make('section', 'se-ts-custom');
      const head = make('div', 'se-ts-custom-head');
      const titles = make('div');
      titles.append(
        make('div', 'se-ts-label', 'Custom colours'),
        make('div', 'se-ts-hint', 'Every colour a preset sets. Type a colour to change it; text marked AA is hard to read on its surface.')
      );
      const starts = make('div', 'se-ts-starts');
      starts.append(make('span', 'se-ts-hint', 'Start from'));
      for (const preset of settings.presets) {
        const node = button('se-ts-start', preset.label);
        node.addEventListener('click', () => settings.setCustom(preset.colors));
        starts.append(node);
      }
      head.append(titles, starts);
      const groups = make('div', 'se-ts-custom-groups');
      const byGroup = new Map();
      for (const token of settings.paletteTokens) {
        let group = byGroup.get(token.group);
        if (!group) {
          group = make('div', 'se-ts-custom-group');
          group.append(make('h3', 'se-ts-eyebrow', token.group));
          byGroup.set(token.group, group);
          groups.append(group);
        }
        const field = make('label', 'se-ts-colour');
        const swatch = make('span', 'se-ts-colour-swatch');
        swatch.setAttribute('aria-hidden', 'true');
        const name = make('span', 'se-ts-colour-name', token.label);
        const warn = make('span', 'se-ts-aa', 'AA');
        warn.title = 'Below 4.5:1 contrast on its surface';
        name.append(warn);
        const hex = make('input', 'se-ts-hex');
        hex.type = 'text';
        hex.spellcheck = false;
        hex.setAttribute('aria-label', token.label);
        // A valid colour applies as typed; anything else waits, and goes back when left
        hex.addEventListener('input', () => {
          const value = hex.value.trim();
          if (/^#[0-9a-f]{6}$/i.test(value) || /^rgba\([^)]*\)$/i.test(value)) settings.setCustom({ [token.key]: value });
        });
        hex.addEventListener('blur', () => {
          hex.value = settings.palette()[token.key];
        });
        field.append(swatch, name, hex);
        group.append(field);
        updates.push(() => {
          const colors = settings.palette();
          const value = colors[token.key];
          swatch.style.setProperty('--se-ts-swatch', value);
          if (doc.activeElement !== hex) hex.value = value;
          const on = settings.readOn[token.key];
          warn.hidden = !on || contrast(value, colors[on]) >= 4.5;
        });
      }
      box.append(head, groups);
      return box;
    };

    const header = (title, line) => {
      const head = make('header', 'se-ts-head');
      head.append(make('h1', 'se-ts-title', title));
      if (line) head.append(make('p', 'se-ts-intro', line));
      return head;
    };

    const appearance = (items) => {
      const status = make('span', 'se-ts-hint');
      updates.push(() => {
        const value = settings.get('palette');
        status.textContent = value === 'custom' ? 'Custom' : settings.presets.find((p) => p.v === value)?.label || '';
      });
      const parts = [heading('Colours', status), paletteCards()];
      if (settings.get('palette') === 'custom') parts.push(customEditor());
      const rows = make('div', 'se-ts-rows');
      rows.append(...items.filter((item) => item.key !== 'palette').map((item) => row(item)));
      parts.push(heading('Fine-tune'), rows);
      return parts;
    };

    // The page: the tab's, or every match of the search
    const render = () => {
      updates = [];
      const words = query.toLowerCase().split(/\s+/).filter(Boolean);
      const matches = (item) => {
        const text = [item.label, item.hint, item.tab, ...item.values.map((c) => c.label)].join(' ').toLowerCase();
        return words.every((word) => text.includes(word));
      };
      for (const [name, node] of tabButtons) {
        const on = !words.length && name === tab;
        node.setAttribute('aria-selected', String(on));
        node.tabIndex = on || (words.length && name === tabNames[0]) ? 0 : -1;
      }
      let parts;
      if (words.length) {
        const found = settings.schema.filter((item) => !item.hidden && matches(item));
        const rows = make('div', 'se-ts-rows');
        rows.append(...found.map((item) => row(item, true)));
        if (!found.length) rows.append(make('p', 'se-ts-empty', 'No settings match.'));
        parts = [header(`${found.length} ${found.length === 1 ? 'setting' : 'settings'}`), rows];
      } else {
        const items = settings.schema.filter((item) => item.tab === tab && !item.hidden);
        const body = tab === 'Appearance' ? appearance(items) : sections(items);
        parts = [header(tab, TABS[tab]?.[1]), ...body];
      }
      const [head, ...body] = parts;
      pageHead.replaceChildren(head);
      pageBody.replaceChildren(...body);
      shape = `${tab}|${query}|${settings.get('palette') === 'custom'}`;
      updates.forEach(run);
    };

    // A change from here or another window: redraw when the page's structure changed, else
    // refresh the controls in place (a colour being typed keeps its field and focus)
    const off = settings.on(() => {
      if (shape !== `${tab}|${query}|${settings.get('palette') === 'custom'}`) render();
      else updates.forEach(run);
    });

    const showTab = (name) => {
      tab = name;
      query = '';
      input.value = '';
      render();
      pageBody.scrollTop = 0;
    };
    tabList.addEventListener('click', (event) => {
      const node = event.target.closest('[data-tab]');
      if (node) showTab(node.dataset.tab);
    });
    // Up and Down move between tabs, as a vertical tab list does
    tabList.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const next = tabNames[(tabNames.indexOf(tab) + (event.key === 'ArrowDown' ? 1 : tabNames.length - 1)) % tabNames.length];
      showTab(next);
      tabButtons.get(next).focus();
    });
    input.addEventListener('input', () => {
      query = input.value;
      render();
    });
    render();

    // The page fills the popup under Steam's title bar: its top, read once
    const frame = requestAnimationFrame(() => {
      host.style.setProperty('--se-ts-top', `${Math.round(host.getBoundingClientRect().top)}px`);
    });

    view = { doc, destroy: null };
    const destroy = () => {
      cancelAnimationFrame(frame);
      off();
      host.replaceChildren();
      if (view?.doc === doc) view = null;
    };
    view.destroy = destroy;
    return destroy;
  }

  /* ---------- The popup ---------- */

  function open() {
    if (popup && view?.doc) {
      run(() => view.doc.defaultView.focus());
      return true;
    }
    const runtime = window.__seMillenniumWindow?.popupRuntime?.();
    if (!runtime || !SE.settings) {
      console.warn('[Steam Enhanced] Settings window:', !SE.settings ? 'no settings' : "Steam's popup runtime was not found");
      return false;
    }
    const { React } = runtime;
    // The page, mounted into the popup's document once React has put it there
    const Host = () => {
      const ref = React.useRef(null);
      React.useEffect(() => mount(ref.current), []);
      return React.createElement('div', { ref, className: 'se-ts' });
    };
    window.__seFriendsDock?.prepareModal?.();
    let handle = null;
    try {
      // The same options and actions Millennium's own window passes (Steam reads both)
      handle = runtime.showModal(
        React.createElement(Host),
        window,
        TITLE,
        {
          bForcePopOut: true,
          bNeverPopOut: false,
          bHideMainWindowForPopouts: false,
          popupWidth: WIDTH,
          popupHeight: HEIGHT,
          strTitle: TITLE,
          fnOnClose: () => {
            if (popup === handle) popup = null;
          },
        },
        undefined,
        { bHideActions: false }
      );
    } catch (error) {
      console.warn('[Steam Enhanced] Settings window:', error);
    }
    if (!handle) return false;
    popup = handle;
    return true;
  }

  window.__seThemeSettings = {
    open,
    destroy() {
      view?.destroy();
      run(() => popup?.Close());
      popup = null;
      delete window.__seThemeSettings;
    },
  };
})(window.__se);
