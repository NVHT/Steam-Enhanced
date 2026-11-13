/*
 * Millennium Library Manager modal wrapper.
 *
 * Wraps Millennium's native sidebar drawer (Ctrl+2) in a two-column centered
 * modal layout with a searchable theme/plugin navigation list, active item
 * header, empty state, and theme reload footer.
 */
(window.__se
  ? (init) => init(window.__se)
  : (init) => addEventListener('se-core', () => init(window.__se), { once: true })
)((SE) => {
  window.__steamEnhancedLibraryManager?.destroy();

  const { esc } = SE;
  const made = new Set();
  const make = (tag, cls, html) => {
    const el = document.createElement(tag);
    el.className = cls;
    if (html) el.innerHTML = html;
    made.add(el);
    return el;
  };

  const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>';
  const ICON_SETTINGS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>';
  const ICON_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const ICON_GRID = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></svg>';
  const ICON_INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>';

  // Matches Millennium's DesktopSideBarFocusedItemType enum.
  const PLUGIN = 0;
  const THEME = 1;

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
      if (v && typeof v.setFocusedItem === 'function' && 'plugins' in v && 'themes' in v) {
        return v;
      }
    }
    return null;
  }

  const nameOf = (item) => item?.data?.common_name || item?.data?.name || item?.native || '';
  const configurable = (theme) => Boolean(theme?.data?.Conditions || theme?.data?.RootColors);
  const plugins = (v) => (v.plugins || []).filter((p) => p && p.data?.name !== 'core');
  const themes = (v) => (v.themes || []).filter(Boolean);

  // Cache of plugin editability derived from Millennium's navigation panel registry
  // or its fallback disabledReason flags (0 = editable, 1 = no settings, 2 = disabled).
  const editable = new Map();

  // Millennium's registry of plugin settings panels. A miss is remembered for 5 s: paint asks
  // twice per plugin, on every change in the drawer.
  const PANELS = 'MILLENNIUM_SIDEBAR_NAVIGATION_PANELS';
  let panelsFound = null;
  let panelsRetry = 0;

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
      if (plugin) {
        seen.push([plugin.data.name, off ? (plugin.enabled ? 1 : 2) : 0]);
      }
    }
    if (seen.some(([, r]) => r === 0)) {
      for (const [name, r] of seen) editable.set(name, r !== 1);
    }
  }

  // Millennium toggles sidebar visibility by rewriting a sibling <style> block.
  function stateOf(bar) {
    for (const style of bar.parentElement?.querySelectorAll(':scope > style') || []) {
      const t = style.textContent;
      const at = t.search(/\.MillenniumDesktopSidebar\s*\{/);
      if (at < 0) continue;
      const rule = t.slice(at, t.indexOf('}', at));
      const shown = !/display:\s*none/.test(rule);
      return {
        shown,
        open: shown && /translateX\(0(px)?\)/.test(rule),
      };
    }
    return { shown: false, open: false };
  }

  let query = '';
  let switchTimer = 0;

  function build(bar) {
    const head = make(
      'div',
      'se-lmx-head',
      '<div class="se-lmx-titles"><b>Library Manager</b><span>Settings for each plugin and theme</span></div>' +
        `<button type="button" class="se-lmx-ib" data-act="settings" aria-label="Millennium settings" title="Millennium settings">${ICON_SETTINGS}</button>` +
        `<button type="button" class="se-lmx-ib" data-ghost data-act="close" aria-label="Close" title="Close (Esc)">${ICON_CLOSE}</button>`
    );
    head.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      const v = context(bar);
      if (!act || !v) return;
      if (act === 'close') v.closeMenu?.();
      if (act === 'settings') {
        v.closeMenu?.();
        if (!window.__seMillenniumWindow?.openDirect?.()) {
          window.__seMillenniumWindow?.showError?.();
        }
      }
    });

    const list = make(
      'nav',
      'se-lmx-list',
      `<label class="se-lmx-filter">${ICON_SEARCH}<input type="search" placeholder="Filter" aria-label="Filter plugins and themes"></label><div class="se-lmx-items"></div>`
    );
    list.setAttribute('aria-label', 'Plugins and themes');
    list.querySelector('input').addEventListener('input', (e) => {
      query = e.target.value.trim().toLowerCase();
      list.dataset.sig = '';
      paint(bar);
    });
    list.addEventListener('click', (e) => {
      const b = e.target.closest('.se-lmx-item');
      const v = context(bar);
      if (!b || b.disabled || !v) return;
      const pool = b.dataset.kind === 'theme' ? themes(v) : plugins(v);
      const item = pool[Number(b.dataset.i)];
      if (!item) return;
      const type = b.dataset.kind === 'theme' ? THEME : PLUGIN;
      if (v.focusedItem === item) return;

      // Clear the active item briefly before focusing the next one so Millennium's
      // editor component unmounts cleanly instead of retaining stale tab state.
      clearTimeout(switchTimer);
      if (v.focusedItem) {
        v.setFocusedItem(undefined, undefined);
        switchTimer = setTimeout(() => context(bar)?.setFocusedItem(item, type), 60);
      } else {
        v.setFocusedItem(item, type);
      }
    });

    const ph = make('div', 'se-lmx-ph', '<b></b><span class="se-lmx-chip"></span>');
    const empty = make(
      'div',
      'se-lmx-empty',
      `<span class="se-lmx-tile">${ICON_GRID}</span><b>Pick a plugin or theme</b><span>Its settings open here.</span>`
    );
    const foot = make(
      'div',
      'se-lmx-foot',
      `${ICON_INFO}<span>Some changes apply after Steam reloads</span><button type="button">Reload Steam</button>`
    );
    foot.querySelector('button').addEventListener('click', () => {
      for (const o of [window, ...SE.owners()]) {
        try {
          if (o.SteamClient?.Browser?.RestartJSContext) {
            o.SteamClient.Browser.RestartJSContext();
            return;
          }
        } catch (_) {}
      }
    });

    return { head, list, ph, empty, foot };
  }

  let parts = null;
  let observer = null;

  function paint(bar) {
    const v = context(bar);
    if (!v) return;
    if (!parts || !parts.head.isConnected || parts.bar !== bar) {
      for (const el of made) el.remove();
      made.clear();
      parts = { bar, ...build(bar) };
    }

    const content = bar.querySelector(':scope > .MillenniumDesktopSidebar_Content');
    if (bar.firstElementChild !== parts.head) bar.prepend(parts.head);
    if (parts.head.nextElementSibling !== parts.list) parts.head.after(parts.list);
    if (parts.list.nextElementSibling !== parts.ph) parts.list.after(parts.ph);
    for (const el of [parts.empty, parts.foot]) {
      if (el.parentElement !== bar) bar.append(el);
    }

    const focused = v.focusedItem ? nameOf(v.focusedItem) : '';
    const kind = v.focusedItemType === THEME ? 'Theme' : v.focusedItemType === PLUGIN ? 'Plugin' : '';
    const name = parts.ph.firstChild;
    const chip = parts.ph.lastChild;
    if (name.textContent !== focused) name.textContent = focused;
    if (chip.textContent !== kind) chip.textContent = kind;
    parts.foot.hidden = v.focusedItemType !== THEME;

    if (!v.focusedItem) learn(bar);
    const T = themes(v);
    const P = plugins(v);
    const sig = [
      T.map(nameOf).join(','),
      P.map((p) => `${nameOf(p)}:${p.enabled ? 1 : 0}:${hasSettings(p) ? 1 : 0}`).join(','),
      focused,
      query,
    ].join('|');

    const items = parts.list.querySelector('.se-lmx-items');
    if (parts.list.dataset.sig !== sig) {
      parts.list.dataset.sig = sig;
      const shown = (item) => !query || nameOf(item).toLowerCase().includes(query);
      const row = (item, i, itemKind) => {
        const off = itemKind === 'plugin' && !item.enabled;
        const has = itemKind === 'plugin' ? !off && hasSettings(item) : configurable(item);
        const n = itemKind === 'theme' && item?.data?.Conditions ? Object.keys(item.data.Conditions).length : 0;
        const meta = off
          ? 'Off'
          : !has
            ? 'No settings'
            : itemKind === 'plugin'
              ? 'Plugin settings'
              : [n && `${n} ${n === 1 ? 'option' : 'options'}`, item?.data?.RootColors && 'colors']
                  .filter(Boolean)
                  .join(' · ') || 'Theme settings';
        const on = Boolean(focused && nameOf(item) === focused);
        return (
          `<button type="button" class="se-lmx-item" data-kind="${itemKind}" data-i="${i}"${on ? ' data-on aria-current="true"' : ''}${has ? '' : ' disabled'}>` +
          `<span class="se-lmx-name">${esc(nameOf(item))}</span><span class="se-lmx-meta">${esc(meta)}</span></button>`
        );
      };

      const t = T.map((x, i) => [x, i]).filter(([x]) => shown(x));
      const p = P.map((x, i) => [x, i]).filter(([x]) => shown(x));
      items.innerHTML =
        (t.length ? '<span class="se-lmx-label">Themes</span>' + t.map(([x, i]) => row(x, i, 'theme')).join('') : '') +
        (p.length ? '<span class="se-lmx-label">Plugins</span>' + p.map(([x, i]) => row(x, i, 'plugin')).join('') : '') +
        (!t.length && !p.length ? '<span class="se-lmx-note">Nothing matches.</span>' : '');
    }

    const st = stateOf(bar);
    if (st.shown !== bar.hasAttribute('data-se-shown')) bar.toggleAttribute('data-se-shown', st.shown);
    if (st.open !== bar.hasAttribute('data-se-open')) bar.toggleAttribute('data-se-open', st.open);
    if (content && !bar.hasAttribute('data-se-lmx')) bar.setAttribute('data-se-lmx', '');
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
    if (e.key !== 'Escape') return;
    const drawer = sidebar();
    if (!drawer?.hasAttribute('data-se-open')) return;
    if (e.target?.closest?.('.se-lmx-filter') && e.target.value) return;
    context(drawer)?.closeMenu?.();
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

  window.__steamEnhancedLibraryManager = {
    destroy() {
      observer?.disconnect();
      clearTimeout(switchTimer);
      for (const el of made) el.remove();
      document.removeEventListener('keydown', onKey, true);
      const drawer = sidebar();
      drawer?.removeAttribute('data-se-open');
      drawer?.removeAttribute('data-se-shown');
      drawer?.removeAttribute('data-se-lmx');
      delete window.__steamEnhancedLibraryManager;
    },
  };

  if (document.body) {
    start();
  } else {
    addEventListener('DOMContentLoaded', start, { once: true });
  }
});
