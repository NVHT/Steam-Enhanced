/*
 * Continues library-manager.js (see its header), listed before it: Millennium's drawer and
 * its data, read from its React context and dropdown props. No state of the window, no
 * listeners: the base reads these from window.__seLibraryManagerParts.
 */
((SE) => {
  // Millennium's DesktopSideBarFocusedItemType enum.
  const PLUGIN = 0;
  const THEME = 1;

  // This script only runs while Steam Enhanced is the theme in use, so it is the active one.
  const SELF = 'Steam Enhanced';

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

  window.__seLibraryManagerParts = {
    PLUGIN,
    THEME,
    sidebar,
    outsideDrawer,
    context,
    nameOf,
    conditionsOf,
    plugins,
    themes,
    isSelf,
    openThemeSettings,
    hasThemeSettings,
    hasSettings,
    learn,
    stateOf,
    labelOf,
    dropdownOf,
    TAB_MENU,
    controlFor,
  };
})(window.__se);
