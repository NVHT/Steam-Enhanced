/*
 * Millennium Library Manager window.
 *
 * Turns Millennium's sidebar drawer (Ctrl+2) into a centered two-column window:
 * - Head: title, item counts, Millennium settings, close.
 * - List: Overview (back to the overview), All / Themes / Plugins, one row per item (icon tile,
 *   details, a plugin's On / Off as a presence dot); arrow keys move between rows.
 * - Nothing open: an overview (the active theme, plugin counts).
 * - An item open: its header (kind, version, author) with "Find a setting", a tab strip that
 *   drives Millennium's own tab menu, then Millennium's editor. Rows off their default carry a
 *   dot; an On / Off pair shows as a switch, a few short values as a segmented control; a found setting is scrolled to and
 *   flashed.
 * - A theme setting changed this session: a bar offering to reload Steam.
 * - Steam Enhanced's own row and the overview's Customize open the theme's settings window
 *   (client/settings/theme/): its settings aren't Millennium's.
 *
 * Millennium's editor stays the source of truth: the strip and the search call the props of its
 * own dropdowns, so values are always written by Millennium. If those props can't be found, its
 * tab menu stays visible instead. Paired with `client/settings/library-manager/library-manager.css`.
 */
((SE) => {
  window.__seLibraryManager?.destroy();

  const { esc, C } = SE;

  // The head's two buttons draw the shared Millennium and window-close icons in CSS.
  // Duotone, the theme's icon style: outlines over a soft fill, both in the text colour (no colour
  // of their own). `.se-duo` shapes take the fill (`--se-icon-duo`); stroke="none" ones are fill
  // only. Every icon in the window is one of these.
  const svg = (body) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const ICON = {
    chevron: svg('<circle class="se-duo" cx="12" cy="12" r="9" stroke="none"/><path d="M10.5 8.5l3.5 3.5-3.5 3.5"/>'),
    overview: svg('<rect class="se-duo" x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect class="se-duo" x="13" y="13" width="7" height="7" rx="2"/>'),
    info: svg('<circle class="se-duo" cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.75v.25"/>'),
    // Tiles: a theme is a palette, a plugin a puzzle piece.
    theme: svg(
      '<path class="se-duo" d="M12 3.5a8.5 8.5 0 100 17c1 0 1.5-.7 1.5-1.4 0-1.1-.9-1.4-.9-2.4s.8-1.4 1.9-1.4h2A4 4 0 0020.5 11.5c0-4.4-3.8-8-8.5-8z"/>' +
        '<circle cx="7.75" cy="11.5" r=".6"/><circle cx="10" cy="7.5" r=".6"/><circle cx="14.5" cy="7.5" r=".6"/>'
    ),
    plugin: svg(
      '<path class="se-duo" d="M10 6V5a2 2 0 014 0v1h3.5a1 1 0 011 1v3.5h-1a2 2 0 000 4h1V18a1 1 0 01-1 1H14v-1a2 2 0 00-4 0v1H6.5a1 1 0 01-1-1v-3.5h1a2 2 0 000-4h-1V7a1 1 0 011-1z"/>'
    ),
  };

  // Millennium's DesktopSideBarFocusedItemType enum.
  const PLUGIN = 0;
  const THEME = 1;

  // This script only runs while Steam Enhanced is the theme in use, so it is the active one.
  const SELF = 'Steam Enhanced';
  const MAX_RESULTS = 8;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  const made = new Set();
  const make = (tag, cls, html) => {
    const el = document.createElement(tag);
    el.className = cls;
    if (html) el.innerHTML = html;
    made.add(el);
    return el;
  };
  const { setText } = SE;
  const toggleAttr = (el, name, on) => {
    if (el.hasAttribute(name) !== on) el.toggleAttribute(name, on);
  };

  /* ---------- Millennium's drawer and its data ---------- */

  let known = null;
  const sidebar = () =>
    known?.isConnected ? known : (known = document.querySelector('.MillenniumDesktopSidebar'));

  // Only the drawer and the <style> Millennium rewrites beside it matter; until the drawer
  // exists, every mutation might be the one that mounts it.
  const outsideDrawer = (node) => {
    if (!known?.isConnected) return false;
    const el = node.nodeType === 1 ? node : node.parentElement;
    const host = known.parentElement;
    return !el || !(known.contains(el) || el === host || el.parentElement === host);
  };

  function context(bar) {
    for (let f = SE.liveFiber(bar); f; f = f.return) {
      const v = f.memoizedProps?.value;
      if (v && typeof v.setFocusedItem === 'function' && 'plugins' in v && 'themes' in v) return v;
    }
    return null;
  }

  const nameOf = (item) => item?.data?.common_name || item?.data?.name || item?.native || '';
  const conditionsOf = (theme) => theme?.data?.Conditions || null;
  const configurable = (theme) => Boolean(conditionsOf(theme) || theme?.data?.RootColors);
  const plugins = (v) => (v.plugins || []).filter((p) => p && p.data?.name !== 'core');
  const themes = (v) => (v.themes || []).filter(Boolean);
  const isSelf = (theme) => theme?.data?.name === SELF;
  // This theme's settings live in its own window (client/settings/theme/), not Millennium's editor
  const openThemeSettings = () => window.__seThemeSettings?.open();
  const hasThemeSettings = (theme) => isSelf(theme) || configurable(theme);

  // Plugin editability, from Millennium's registry of settings panels or, failing that, the
  // disabledReason flags on its own list (0 = editable, 1 = no settings, 2 = disabled).
  const editable = new Map();
  const PANELS = 'MILLENNIUM_SIDEBAR_NAVIGATION_PANELS';
  let panelsFound = null;
  let panelsRetry = 0;

  // A miss is remembered for 5 s: paint asks per plugin on every change in the drawer.
  function panels() {
    if (panelsFound || performance.now() < panelsRetry) return panelsFound;
    const isPanels = (p) => Boolean(p) && typeof p === 'object';
    panelsFound = SE.global(PANELS, isPanels);
    for (const w of panelsFound ? [] : SE.run(() => window.__seMillenniumWindow?.windows?.()) || []) {
      const p = SE.run(() => w[PANELS]);
      if (isPanels(p)) {
        panelsFound = p;
        break;
      }
    }
    panelsRetry = performance.now() + 5000;
    return panelsFound;
  }

  function hasSettings(plugin) {
    const p = panels();
    if (p) return Boolean(p[plugin?.data?.name]);
    return editable.get(plugin?.data?.name) !== false;
  }

  function learn(bar) {
    const seen = [];
    const v = context(bar);
    for (const b of bar.querySelectorAll('.MillenniumDesktopSidebar_Content .MillenniumDesktopSidebar_LibraryItemButton')) {
      const p = SE.fromProps(b, 40, (q) => (q.plugin && 'disabledReason' in q ? q : null));
      if (p?.plugin?.data?.name) {
        seen.push([p.plugin.data.name, p.disabledReason]);
        continue;
      }
      const label = (b.textContent || '').replace(/\s+/g, ' ').trim();
      const plugin = (v?.plugins || []).find((x) => x?.data?.common_name === label || x?.data?.name === label);
      const off = b.disabled || b.classList.contains('Disabled') || b.getAttribute('aria-disabled') === 'true';
      if (plugin) seen.push([plugin.data.name, off ? (plugin.enabled ? 1 : 2) : 0]);
    }
    if (seen.some(([, r]) => r === 0)) {
      for (const [name, r] of seen) editable.set(name, r !== 1);
    }
  }

  // Millennium toggles the drawer by rewriting a sibling <style> block.
  function stateOf(bar) {
    for (const style of bar.parentElement?.querySelectorAll(':scope > style') || []) {
      const t = style.textContent;
      const at = t.search(/\.MillenniumDesktopSidebar\s*\{/);
      if (at < 0) continue;
      const rule = t.slice(at, t.indexOf('}', at));
      const shown = !/display:\s*none/.test(rule);
      return { shown, open: shown && /translateX\(0(px)?\)/.test(rule) };
    }
    return { shown: false, open: false };
  }

  // A rendered DialogDropDown, read through Steam's props (rgOptions, selectedOption, onChange).
  // selectedOption's shape differs between callers (an option's data, the option itself, or a
  // label), so the selection is matched every way and, failing that, by the label on screen.
  const labelOf = (option) => String(option?.label ?? option?.data ?? '');

  // Steam's dropdown component behind a DialogDropDown: the one whose state holds the label shown.
  function dropdownInstance(el) {
    for (let f = SE.fiber(el), depth = 0; f && depth < 12; f = f.return, depth++) {
      const s = f.stateNode;
      if (typeof s?.OnValueSelected === 'function' && typeof s.setState === 'function') return s;
    }
    return null;
  }

  function dropdownOf(el) {
    const dd = el
      ? SE.fromProps(el, 12, (q) => (Array.isArray(q.rgOptions) && typeof q.onChange === 'function' ? q : null))
      : null;
    if (!dd) return null;
    // The label on screen first (what Steam drew), then the props.
    const shown = el.textContent.trim();
    const sel = dd.selectedOption;
    let index = dd.rgOptions.findIndex((o) => labelOf(o) === shown);
    if (index < 0) {
      index = dd.rgOptions.findIndex(
        (o) => o === sel || o?.data === sel || (sel != null && typeof sel === 'object' && o?.data === sel.data)
      );
    }
    return {
      options: dd.rgOptions,
      index,
      selected: dd.rgOptions[index] || null,
      // Always sent: the menu's own selection is stale (it keeps its first option), so comparing
      // against it would block a return to the first tab. Recorded on Steam's dropdown too, as a
      // pick from its menu would be: Millennium's onChange alone saves the value but leaves the
      // label (Millennium's strDefaultLabel, never redrawn), and every read here is of that label.
      choose(option) {
        if (!option) return;
        SE.run(() => {
          const instance = dropdownInstance(el);
          instance?.setState({ value: option });
          dd.onChange(option, instance || undefined);
        });
      },
    };
  }

  const TAB_MENU = '.MillenniumDesktopSidebar_EditorHeader .DialogDropDown';

  // A setting with a few short values shows them as a segmented control, and an On / Off pair as
  // a switch (the dropdown stays, hidden, as the one Millennium writes through); longer lists
  // keep the dropdown.
  const SEG_MAX = 3;
  const SEG_MAX_CHARS = 24;
  const ON = /^(on|yes)$/i;
  const OFF = /^(off|no)$/i;
  function controlFor(options) {
    if (options.length === 2) {
      const on = options.findIndex((o) => ON.test(labelOf(o)));
      const off = options.findIndex((o) => OFF.test(labelOf(o)));
      if (on >= 0 && off >= 0) return { kind: 'switch', on, off };
    }
    const fits =
      options.length > 1 &&
      options.length <= SEG_MAX &&
      options.reduce((n, o) => n + labelOf(o).length, 0) <= SEG_MAX_CHARS;
    return fits ? { kind: 'seg' } : null;
  }

  /* ---------- Small view helpers ---------- */

  // state: a plugin's 'on' / 'off', drawn as a presence dot on the tile's corner.
  const tile = (item, kind, { cls = '', state = '' } = {}) =>
    `<span class="se-lmx-tile${cls}"${state ? ` data-state="${state}"` : ''}>${kind === 'theme' ? ICON.theme : ICON.plugin}</span>`;

  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  function themeSummary(theme) {
    const conds = Object.values(conditionsOf(theme) || {});
    const tabs = new Set(conds.map((c) => c?.tab).filter(Boolean)).size;
    return [
      conds.length && plural(conds.length, 'option') + (tabs > 1 ? ` in ${tabs} tabs` : ''),
      theme?.data?.RootColors && 'colors',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  /* ---------- State ---------- */

  let scope = 'all';
  let parts = null;
  let observer = null;

  // Find a setting
  let findQuery = '';
  let findActive = 0;
  let findOpen = false;
  let reveal = '';
  let lastTab = '';

  // Theme settings you touched this session: name -> { first, last }. A row is tracked from the
  // moment you click its control (its value then is `first`), never from what a paint reads: while
  // Millennium switches tabs it reuses rows, briefly pairing one setting's name with another's
  // value. The bar counts the ones whose value moved; "Later" hides it until another one does.
  const touched = new Map();
  let dismissedAt = 0;

  const changedCount = () => {
    let n = 0;
    for (const { first, last } of touched.values()) if (first !== last) n++;
    return n;
  };

  /* ---------- Build (once per drawer) ---------- */

  // A theme just opened from another item starts on its first tab: switching straight from one
  // item to the next (no blank moment in between, which flashed the overview) can leave
  // Millennium's editor on the tab the last theme was on.
  let freshTheme = false;

  function focusItem(bar, item, type) {
    const v = context(bar);
    if (!v || !item || v.focusedItem === item) return;
    freshTheme = Boolean(v.focusedItem) && type === THEME;
    v.setFocusedItem(item, type);
  }

  function reloadSteam() {
    for (const o of [window, ...SE.owners()]) {
      try {
        if (o.SteamClient?.Browser?.RestartJSContext) {
          o.SteamClient.Browser.RestartJSContext();
          return;
        }
      } catch {}
    }
  }

  function build(bar) {
    const head = make(
      'header',
      'se-lmx-head',
      '<div class="se-lmx-titles"><b>Library Manager</b><span></span></div>' +
        `<button type="button" class="se-lmx-ib" data-act="settings" aria-label="Millennium settings" title="Millennium settings"></button>` +
        `<button type="button" class="se-lmx-ib" data-act="close" aria-label="Close" title="Close (Esc)"></button>`
    );

    const list = make(
      'nav',
      'se-lmx-list',
      `<button type="button" class="se-lmx-item" data-overview><span class="se-lmx-tile">${ICON.overview}</span><span class="se-lmx-text"><span class="se-lmx-name">Overview</span></span></button>` +
        '<div class="se-seg" role="group" aria-label="Show">' +
        ['all', 'theme', 'plugin']
          .map((s) => `<button type="button" data-scope="${s}">${s === 'all' ? 'All' : s === 'theme' ? 'Themes' : 'Plugins'}</button>`)
          .join('') +
        '</div><div class="se-lmx-items"></div>'
    );
    list.setAttribute('aria-label', 'Plugins and themes');

    const ph = make(
      'div',
      'se-lmx-ph',
      '<span class="se-lmx-ph-tile"></span><div class="se-lmx-ph-text"><b></b><span class="se-lmx-chips"></span></div>' +
        `<div class="se-lmx-find"><label class="se-lmx-field"><span class="se-search-icon" aria-hidden="true"></span><input type="search" placeholder="Find a setting" aria-label="Find a setting" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="se-lmx-results"></label>` +
        '<div class="se-lmx-results" id="se-lmx-results" role="listbox" aria-label="Settings" hidden></div></div>'
    );

    const tabs = make('div', 'se-lmx-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Setting groups');

    const overview = make('section', 'se-lmx-overview');
    overview.setAttribute('aria-label', 'Overview');

    const notice = make(
      'div',
      'se-lmx-bar',
      `${ICON.info}<span></span><button type="button" data-act="later">Later</button><button type="button" data-act="reload" data-primary>Reload Steam</button>`
    );
    notice.setAttribute('role', 'status');
    notice.hidden = true;

    // One delegated handler per part.
    head.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      const v = context(bar);
      if (!act || !v) return;
      v.closeMenu?.();
      if (act === 'settings' && !window.__seMillenniumWindow?.openDirect?.()) {
        window.__seMillenniumWindow?.showError?.();
      }
    });

    list.addEventListener('click', (e) => {
      const s = e.target.closest('[data-scope]')?.dataset.scope;
      if (s) {
        scope = s;
        list.dataset.sig = '';
        paint(bar);
        return;
      }
      const b = e.target.closest('.se-lmx-item');
      const v = context(bar);
      if (!b || b.disabled || !v) return;
      if (b.hasAttribute('data-overview')) {
        if (v.focusedItem) v.setFocusedItem(undefined, undefined);
        return;
      }
      const isTheme = b.dataset.kind === 'theme';
      const item = (isTheme ? themes(v) : plugins(v))[Number(b.dataset.i)];
      if (isTheme && isSelf(item)) openThemeSettings();
      else focusItem(bar, item, isTheme ? THEME : PLUGIN);
    });
    list.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const rows = [...list.querySelectorAll('.se-lmx-item:not([disabled])')];
      if (!rows.length) return;
      e.preventDefault();
      const at = rows.indexOf(document.activeElement);
      const next = at < 0 ? 0 : (at + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length;
      rows[next].focus();
    });

    const find = ph.querySelector('.se-lmx-find input');
    const results = ph.querySelector('.se-lmx-results');
    find.addEventListener('input', () => {
      findQuery = find.value.trim().toLowerCase();
      findActive = 0;
      findOpen = Boolean(findQuery);
      paintFind(bar);
    });
    find.addEventListener('focus', () => {
      findOpen = Boolean(findQuery);
      paintFind(bar);
    });
    find.addEventListener('blur', () => {
      findOpen = false;
      paintFind(bar);
    });
    find.addEventListener('keydown', (e) => {
      const count = results.querySelectorAll('[data-name]').length;
      if (e.key === 'Escape') {
        e.preventDefault();
        find.value = '';
        findQuery = '';
        findOpen = false;
        paintFind(bar);
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && count) {
        e.preventDefault();
        findOpen = true;
        findActive = (findActive + (e.key === 'ArrowDown' ? 1 : -1) + count) % count;
        paintFind(bar);
      } else if (e.key === 'Enter' && findOpen && count) {
        e.preventDefault();
        pick(bar, results.querySelectorAll('[data-name]')[findActive]?.dataset.name);
      }
    });
    // mousedown, not click: the input's blur would close the list before a click lands.
    results.addEventListener('mousedown', (e) => {
      const b = e.target.closest('[data-name]');
      if (!b) return;
      e.preventDefault();
      pick(bar, b.dataset.name);
    });

    tabs.addEventListener('click', (e) => {
      const i = e.target.closest('[data-tab]')?.dataset.tab;
      const menu = dropdownOf(bar.querySelector(TAB_MENU));
      const option = menu?.options[Number(i)];
      if (!option || e.target.closest('[data-tab]').hasAttribute('data-on')) return;
      lastTab = labelOf(option);
      menu.choose(option);
      paint(bar);
    });

    overview.addEventListener('click', (e) => {
      if (!e.target.closest('[data-act="customize"]')) return;
      openThemeSettings();
    });

    notice.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'reload') reloadSteam();
      if (act === 'later') {
        dismissedAt = changedCount();
        notice.hidden = true;
      }
    });

    return { head, list, ph, tabs, overview, notice };
  }

  /* ---------- Find a setting ---------- */

  function searchConditions(theme) {
    const conds = conditionsOf(theme);
    if (!conds || !findQuery) return [];
    const hits = [];
    for (const [name, c] of Object.entries(conds)) {
      const n = name.toLowerCase();
      const hay = [c?.tab, c?.description, ...Object.keys(c?.values || {})].join(' ').toLowerCase();
      const rank = n.startsWith(findQuery) ? 0 : n.includes(findQuery) ? 1 : hay.includes(findQuery) ? 2 : -1;
      if (rank >= 0) hits.push({ name, tab: c?.tab || '', description: c?.description || '', rank });
    }
    return hits.sort((a, b) => a.rank - b.rank).slice(0, MAX_RESULTS);
  }

  function paintFind(bar) {
    if (!parts) return;
    const v = context(bar);
    const theme = v?.focusedItemType === THEME ? v.focusedItem : null;
    const input = parts.ph.querySelector('.se-lmx-find input');
    const results = parts.ph.querySelector('.se-lmx-results');
    const hits = findOpen ? searchConditions(theme) : [];

    const sig = hits.map((h) => h.name).join('|') + `#${findActive}`;
    if (results.dataset.sig !== sig) {
      results.dataset.sig = sig;
      results.innerHTML = hits
        .map(
          (h, i) =>
            `<div class="se-lmx-result" role="option" id="se-lmx-r${i}" data-name="${esc(h.name)}"${i === findActive ? ' aria-selected="true"' : ''}>` +
            `<b>${esc(h.name)}</b><span>${esc([h.tab, h.description].filter(Boolean).join(' · '))}</span></div>`
        )
        .join('');
    }
    const empty = findOpen && !hits.length;
    if (empty && !results.querySelector('.se-lmx-note')) results.innerHTML = '<span class="se-lmx-note">No setting matches.</span>';
    results.hidden = !findOpen;
    input.setAttribute('aria-expanded', String(findOpen && hits.length > 0));
    if (findOpen && hits.length) input.setAttribute('aria-activedescendant', `se-lmx-r${findActive}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function pick(bar, name) {
    const v = context(bar);
    const cond = name && conditionsOf(v?.focusedItem)?.[name];
    if (!cond) return;
    const menu = dropdownOf(bar.querySelector(TAB_MENU));
    const option = menu?.options.find((o) => labelOf(o) === cond.tab);
    if (option) {
      lastTab = cond.tab;
      menu.choose(option);
    }
    reveal = name;
    findOpen = false;
    paintFind(bar);
    parts.ph.querySelector('.se-lmx-find input').blur();
    paint(bar);
  }

  /* ---------- Paint ---------- */

  function paintHead(v) {
    const T = themes(v);
    const P = plugins(v);
    setText(parts.head.querySelector('.se-lmx-titles span'), [plural(T.length, 'theme'), plural(P.length, 'plugin')].join(' · '));
  }

  function paintList(v, focused) {
    const T = themes(v);
    const P = plugins(v);
    const sig = [
      T.map(nameOf).join(','),
      P.map((p) => `${nameOf(p)}:${p.enabled ? 1 : 0}:${hasSettings(p) ? 1 : 0}`).join(','),
      focused,
      scope,
    ].join('|');
    const list = parts.list;
    if (list.dataset.sig === sig) return;
    list.dataset.sig = sig;

    const home = list.querySelector('[data-overview]');
    toggleAttr(home, 'data-on', !focused);
    if (focused) home.removeAttribute('aria-current');
    else home.setAttribute('aria-current', 'page');

    for (const b of list.querySelectorAll('[data-scope]')) {
      const on = b.dataset.scope === scope;
      toggleAttr(b, 'data-on', on);
      b.setAttribute('aria-pressed', String(on));
    }

    const row = (item, i, kind) => {
      const off = kind === 'plugin' && !item.enabled;
      const has = kind === 'plugin' ? !off && hasSettings(item) : hasThemeSettings(item);
      // A plugin's state is read, not set here: a word in its details and a presence dot on its
      // tile, never a control-like chip.
      const meta =
        kind === 'theme'
          ? [isSelf(item) && 'Active', isSelf(item) ? 'Theme settings' : has ? themeSummary(item) : 'No settings'].filter(Boolean).join(' · ')
          : [off ? 'Off' : 'On', has ? 'Plugin settings' : 'No settings'].join(' · ');
      const on = Boolean(focused && nameOf(item) === focused);
      return (
        `<button type="button" class="se-lmx-item" data-kind="${kind}" data-i="${i}"${on ? ' data-on aria-current="true"' : ''}${off ? ' data-off' : ''}${has ? '' : ' disabled'}>` +
        tile(item, kind, { state: kind === 'plugin' ? (off ? 'off' : 'on') : '' }) +
        `<span class="se-lmx-text"><span class="se-lmx-name">${esc(nameOf(item))}</span><span class="se-lmx-meta">${esc(meta)}</span></span>` +
        `${has ? `<span class="se-lmx-go">${ICON.chevron}</span>` : ''}</button>`
      );
    };

    const t = scope === 'plugin' ? [] : T.map((x, i) => [x, i]);
    const p = scope === 'theme' ? [] : P.map((x, i) => [x, i]);
    list.querySelector('.se-lmx-items').innerHTML =
      (t.length ? '<span class="se-lmx-label">Themes</span>' + t.map(([x, i]) => row(x, i, 'theme')).join('') : '') +
      (p.length ? '<span class="se-lmx-label">Plugins</span>' + p.map(([x, i]) => row(x, i, 'plugin')).join('') : '') +
      (!t.length && !p.length ? `<span class="se-lmx-note">No ${scope === 'theme' ? 'themes' : 'plugins'} installed.</span>` : '');
  }

  function paintOverview(v) {
    const self = themes(v).find(isSelf);
    const P = plugins(v);
    const on = P.filter((p) => p.enabled).length;
    const withSettings = P.filter((p) => p.enabled && hasSettings(p)).length + themes(v).filter(hasThemeSettings).length;
    const sig = [self && nameOf(self), self?.data?.version, on, P.length, withSettings].join('|');
    if (parts.overview.dataset.sig === sig) return;
    parts.overview.dataset.sig = sig;

    const by = [self?.data?.version && `v${self.data.version}`, self?.data?.author && `by ${self.data.author}`]
      .filter(Boolean)
      .join(' · ');
    const stat = (n, label) => `<div class="se-lmx-stat"><b>${n}</b><span>${label}</span></div>`;
    parts.overview.innerHTML =
      '<span class="se-lmx-label">Overview</span>' +
      (self
        ? `<article class="se-lmx-hero">${tile(self, 'theme', { cls: ' se-lmx-tile-lg' })}<div class="se-lmx-hero-text"><span class="se-lmx-kicker">Active theme</span><b>${esc(nameOf(self))}</b><span>${esc(by)}</span></div>` +
          '<button type="button" class="se-lmx-btn" data-primary data-act="customize">Customize</button></article>'
        : '') +
      `<div class="se-lmx-stats">${stat(on, 'Plugins on')}${stat(P.length - on, 'Plugins off')}${stat(withSettings, 'With settings')}</div>` ;
  }

  function paintItem(v, bar) {
    const item = v.focusedItem;
    const kind = v.focusedItemType === THEME ? 'theme' : 'plugin';
    const key = item ? `${kind}:${nameOf(item)}` : '';
    const ph = parts.ph;
    if (ph.dataset.key !== key) {
      ph.dataset.key = key;
      ph.querySelector('.se-lmx-ph-tile').innerHTML = item ? tile(item, kind) : '';
      setText(ph.querySelector('b'), nameOf(item));
      const chips = [kind === 'theme' ? 'Theme' : 'Plugin', item?.data?.version && `v${item.data.version}`, item?.data?.author && `by ${item.data.author}`];
      ph.querySelector('.se-lmx-chips').innerHTML = chips
        .filter(Boolean)
        .map((c, i) => `<span class="se-lmx-chip"${i ? '' : ' data-kind'}>${esc(c)}</span>`)
        .join('');
      const input = ph.querySelector('.se-lmx-find input');
      input.value = '';
      findQuery = '';
      findOpen = false;
      reveal = '';
      lastTab = '';
      paintFind(bar);
    }
    toggleAttr(ph, 'data-find', kind === 'theme' && Boolean(conditionsOf(item)));
  }

  // Millennium's tab menu, redrawn as a strip. Without its props the menu itself stays.
  // The tab on screen, read from the rows Millennium drew: each row's setting names its tab in
  // skin.json. No setting rows (Colors): the one tab no setting belongs to. Millennium's menu
  // keeps reporting its first option, so it can't say which tab is open.
  function shownTab(v, bar, menu) {
    const conds = conditionsOf(v.focusedItem);
    if (!conds) return '';
    for (const label of bar.querySelectorAll(`.MillenniumDesktopSidebar_EditorContent .${C.FieldLabel}`)) {
      const tab = conds[label.textContent.trim()]?.tab;
      if (tab) return tab;
    }
    const used = new Set(Object.values(conds).map((c) => c?.tab));
    const spare = menu.options.map(labelOf).filter((l) => !used.has(l));
    return spare.length === 1 ? spare[0] : '';
  }

  function paintTabs(v, bar) {
    const menu = dropdownOf(bar.querySelector(TAB_MENU));
    // Found: the strip replaces the menu (and shows only when there is more than one tab).
    toggleAttr(bar, 'data-se-lmx-tabs', Boolean(menu));
    const many = Boolean(menu && menu.options.length > 1);
    if (parts.tabs.hidden === many) parts.tabs.hidden = !many;
    if (!many) {
      if (parts.tabs.dataset.sig) {
        parts.tabs.dataset.sig = '';
        parts.tabs.textContent = '';
      }
      return;
    }
    // The tab on screen; while it is still drawing, the one last picked here; else the menu's own.
    const want = shownTab(v, bar, menu) || lastTab;
    const at = want ? menu.options.findIndex((o) => labelOf(o) === want) : -1;
    const current = at >= 0 ? at : Math.max(0, menu.index);
    if (freshTheme) {
      freshTheme = false;
      lastTab = labelOf(menu.options[0]);
      if (current !== 0) menu.choose(menu.options[0]);
    }
    const sig = menu.options.map(labelOf).join('|') + `#${current}`;
    if (parts.tabs.dataset.sig === sig) return;
    parts.tabs.dataset.sig = sig;
    parts.tabs.innerHTML = menu.options
      .map((o, i) => {
        const on = i === current;
        return `<button type="button" role="tab" data-tab="${i}" aria-selected="${on}"${on ? ' data-on' : ''}>${esc(labelOf(o))}</button>`;
      })
      .join('');
  }


  // Each rendered setting row: note its value, mark it when off its default, reveal a found one.
  function paintRows(v, bar) {
    if (v.focusedItemType !== THEME) return;
    const conds = conditionsOf(v.focusedItem) || {};
    const content = bar.querySelector('.MillenniumDesktopSidebar_EditorContent');
    if (!content) return;

    const reads = [];
    for (const field of content.querySelectorAll(`.${C.Field}`)) {
      const name = field.querySelector(`.${C.FieldLabel}`)?.textContent.trim();
      const cond = name && conds[name];
      if (!cond) continue;
      const dropdown = field.querySelector('.DialogDropDown');
      const menu = dropdownOf(dropdown);
      const value = labelOf(menu?.selected);
      reads.push({ field, name, dropdown, menu, value, off: Boolean(value) && value !== String(cond.default ?? '') });
    }

    for (const r of reads) paintChoice(r);

    for (const { field, name, value, off } of reads) {
      const label = field.querySelector(`.${C.FieldLabel}`);
      toggleAttr(label, 'data-se-lmx-changed', off);
      const seen = value && touched.get(name);
      if (seen) seen.last = value;
    }

    if (reveal) {
      const hit = reads.find((r) => r.name === reveal);
      if (hit) {
        reveal = '';
        hit.field.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'auto' : 'smooth' });
        hit.field.removeAttribute('data-se-lmx-flash');
        void hit.field.offsetWidth; // restart the flash when the same row is found twice
        hit.field.setAttribute('data-se-lmx-flash', '');
      }
    }
  }

  // The stand-in for one row's dropdown (a switch or a segmented control): built once per row,
  // re-marked each paint.
  function paintChoice({ field, name, dropdown, menu }) {
    let el = field.querySelector(':scope .se-lmx-choice');
    const control = menu && dropdown ? controlFor(menu.options) : null;
    if (dropdown) toggleAttr(dropdown, 'data-se-lmx-seg', Boolean(control));
    if (!control) {
      el?.remove();
      return;
    }
    const sig = `${control.kind}:${menu.options.map(labelOf).join('|')}`;
    if (!el || el.dataset.sig !== sig) {
      el?.remove();
      if (control.kind === 'switch') {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'se-lmx-switch se-lmx-choice';
        el.setAttribute('role', 'switch');
        el.dataset.optOn = control.on;
        el.dataset.optOff = control.off;
      } else {
        el = document.createElement('div');
        el.className = 'se-seg se-lmx-choice';
        el.setAttribute('role', 'group');
        el.innerHTML = menu.options
          .map((o, i) => `<button type="button" data-opt="${i}">${esc(labelOf(o))}</button>`)
          .join('');
      }
      el.setAttribute('aria-label', name);
      el.dataset.sig = sig;
      dropdown.after(el);
    }
    if (control.kind === 'switch') {
      const on = String(menu.index === control.on);
      if (el.getAttribute('aria-checked') !== on) el.setAttribute('aria-checked', on);
      return;
    }
    for (const b of el.children) {
      const on = Number(b.dataset.opt) === menu.index;
      toggleAttr(b, 'data-on', on);
      if (b.getAttribute('aria-pressed') !== String(on)) b.setAttribute('aria-pressed', String(on));
    }
  }

  // A setting row about to change (its switch, segmented control or Millennium's own dropdown):
  // start tracking it at the value it has now.
  function touch(target) {
    const field = target.closest?.(`.MillenniumDesktopSidebar_EditorContent .${C.Field}`);
    if (!field || !target.closest('.se-lmx-choice, .DialogDropDown')) return;
    const name = field.querySelector(`.${C.FieldLabel}`)?.textContent.trim();
    const value = labelOf(dropdownOf(field.querySelector('.DialogDropDown'))?.selected);
    if (name && value && !touched.has(name)) touched.set(name, { first: value, last: value });
  }

  // One listener on the drawer for every row's switch and segmented control.
  function onChoice(e) {
    touch(e.target);
    const sw = e.target.closest?.('.se-lmx-switch');
    const b = sw || e.target.closest?.('.se-seg.se-lmx-choice [data-opt]');
    if (!b || (!sw && b.hasAttribute('data-on'))) return;
    const menu = dropdownOf(b.closest(`.${C.Field}`)?.querySelector('.DialogDropDown'));
    if (!menu) return;
    const i = sw ? (sw.getAttribute('aria-checked') === 'true' ? sw.dataset.optOff : sw.dataset.optOn) : b.dataset.opt;
    menu.choose(menu.options[Number(i)]);
  }

  // Only while the window is open: the bar belongs to it.
  function paintNotice(open) {
    const n = changedCount();
    if (n < dismissedAt) dismissedAt = n; // a setting moved back: the next change shows again
    const show = open && n > dismissedAt;
    if (parts.notice.hidden === show) parts.notice.hidden = !show;
    if (show) setText(parts.notice.querySelector('span'), `${plural(n, 'setting')} changed · some apply after Steam reloads`);
  }

  function place(bar) {
    const order = [parts.head, parts.list, parts.ph, parts.tabs, parts.overview];
    if (bar.firstElementChild !== parts.head) bar.prepend(parts.head);
    for (let i = 1; i < order.length; i++) {
      if (order[i - 1].nextElementSibling !== order[i]) order[i - 1].after(order[i]);
    }
    if (parts.notice.parentElement !== bar || bar.lastElementChild !== parts.notice) bar.append(parts.notice);
  }

  function paint(bar) {
    const v = context(bar);
    if (!v) return;
    if (!parts || !parts.head.isConnected || parts.bar !== bar) {
      for (const el of made) el.remove();
      made.clear();
      parts?.bar.removeEventListener('click', onChoice);
      parts = { bar, ...build(bar) };
      bar.addEventListener('click', onChoice);
    }
    place(bar);

    const focused = v.focusedItem ? nameOf(v.focusedItem) : '';
    if (!v.focusedItem) learn(bar);
    paintHead(v);
    paintList(v, focused);
    if (v.focusedItem) {
      paintItem(v, bar);
      paintTabs(v, bar);
      paintRows(v, bar);
    } else {
      paintOverview(v);
      toggleAttr(bar, 'data-se-lmx-tabs', false);
    }
    const st = stateOf(bar);
    // Opened from Millennium's own buttons in the settings window: that window would cover it.
    if (st.open && !bar.hasAttribute('data-se-open')) SE.run(() => window.__seMillenniumWindow?.yieldToManager?.());
    paintNotice(st.open);
    toggleAttr(bar, 'data-se-shown', st.shown);
    toggleAttr(bar, 'data-se-open', st.open);
    toggleAttr(bar, 'data-se-lmx', Boolean(bar.querySelector(':scope > .MillenniumDesktopSidebar_Content')));
  }

  function update() {
    const drawer = sidebar();
    if (!drawer) return;
    try {
      paint(drawer);
    } catch (e) {
      console.warn('[Steam Enhanced] Library Manager:', e);
    }
    observer?.takeRecords();
  }

  function onKey(e) {
    const drawer = sidebar();
    if (!parts || !drawer?.hasAttribute('data-se-open')) return;
    if (e.key === 'Escape') {
      // A field with text clears itself first.
      if (e.target?.closest?.('.se-lmx-field') && e.target.value) return;
      context(drawer)?.closeMenu?.();
    } else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') {
      // Ctrl+F: Find a setting, while a theme with settings is open.
      if (!parts.ph.hasAttribute('data-find') || !drawer.hasAttribute('data-focused-item-type')) return;
      e.preventDefault();
      const input = parts.ph.querySelector('.se-lmx-find input');
      input.focus();
      input.select();
    }
  }

  function start() {
    // Core batches non-sync subscribers into one frame, so update() runs at most once per frame.
    observer = SE.watch(update, {
      characterData: true,
      attributes: ['data-focused-item-type', 'disabled'],
      ignore: outsideDrawer,
    });
    document.addEventListener('keydown', onKey, true);
    update();
  }

  window.__seLibraryManager = {
    destroy() {
      // Destroyed before the body existed: never start
      removeEventListener('DOMContentLoaded', start);
      observer?.disconnect();
      for (const el of made) el.remove();
      made.clear();
      document.removeEventListener('keydown', onKey, true);
      const drawer = sidebar();
      for (const a of ['data-se-open', 'data-se-shown', 'data-se-lmx', 'data-se-lmx-tabs']) drawer?.removeAttribute(a);
      parts?.bar.removeEventListener('click', onChoice);
      for (const el of drawer?.querySelectorAll('.se-lmx-choice') || []) el.remove();
      for (const el of drawer?.querySelectorAll('[data-se-lmx-changed], [data-se-lmx-flash], [data-se-lmx-seg]') || []) {
        el.removeAttribute('data-se-lmx-changed');
        el.removeAttribute('data-se-lmx-flash');
        el.removeAttribute('data-se-lmx-seg');
      }
      delete window.__seLibraryManager;
    },
  };

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
})(window.__se);
