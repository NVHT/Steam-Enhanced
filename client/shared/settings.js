/*
 * The theme's settings (SE.settings), part 3 of 3 (listed just before it: settings-palette.js,
 * the palette; settings-schema.js, what each setting offers): where the choice is kept, and how
 * a change reaches every window and web page at once.
 *
 * Kept in localStorage "se-settings", which every client window shares:
 *   values   each setting not at its default, by key
 *   client   the option stylesheets (options/) those values switch on in client windows
 *   web      the same for Store, Community, Support and Checkout pages
 *   vars     the colour palette's base tokens ({ '--se-bg': '#…' }), when not the default
 *   hide     selectors whose matches go in client windows: a multi setting's choices that are
 *            off, through its `hide`
 * client/loader.js puts `client` and `vars` in each window's <style id="se-options"> before
 * its first paint (__seClient.applyOptions) and this file re-applies them on a change, in its own
 * window directly and in the others through the storage event. Web pages keep their own copy
 * (core/core.js): the main window sends it to its browser view on every change, and to a page
 * that asks as it loads.
 *
 * The first run takes over the choices Millennium kept for the theme's old skin.json Conditions
 * (main window, Millennium's backend through client/shared/plugin-rpc.js).
 * The settings window (client/settings/theme/) draws `schema`.
 */
((SE) => {
  window.__seSettingsStore?.destroy();
  const { run } = SE;

  const KEY = 'se-settings';
  const HEX = /^#[0-9a-f]{6}$/i;
  const MAIN = Boolean(window.__seClient?.groups?.has('main'));
  const SEND = 'SteamEnhanced.Settings'; // the client → a page (core/core.js)
  const ASK = 'SteamEnhanced.SettingsRequest'; // a page → the client, as it loads

  // The colour palette and its presets (client/shared/settings-palette.js)
  const parts = window.__seSettingsPaletteParts || {};
  const { PALETTE_TOKENS, PRESETS, READ_ON, fillPalette, presetOf } = parts;
  if (!PRESETS) return;

  // Every setting and its choices (client/shared/settings-schema.js)
  const schemaParts = window.__seSettingsSchemaParts || {};
  const { SCHEMA } = schemaParts;
  if (!SCHEMA) return;

  const TABS = [...new Set(SCHEMA.map((item) => item.tab))];
  const byKey = new Map(SCHEMA.map((item) => [item.key, item]));

  const valid = (item, value) => {
    if (item.type === 'multi') return Array.isArray(value) && value.every((v) => item.values.some((choice) => choice.v === v));
    // A kept string with no choices (hidden: not drawn by the settings window), e.g. an id
    if (item.type === 'text') return typeof value === 'string' && value.length <= 200;
    return item.values.some((choice) => choice.v === value);
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // A multi setting's choices on, in the schema's order
  const ordered = (item, value) => item.values.map((c) => c.v).filter((v) => value.includes(v));

  const read = () => {
    const saved = run(() => JSON.parse(localStorage.getItem(KEY)));
    return saved && typeof saved === 'object' ? saved : {};
  };

  const get = (key) => {
    const item = byKey.get(key);
    if (!item) return undefined;
    const value = read().values?.[key];
    if (!valid(item, value)) return item.type === 'multi' ? [...item.def] : item.def;
    return item.type === 'multi' ? ordered(item, value) : value;
  };

  // The palette's colours: the preset's, or Custom's (kept, else the last preset's copy)
  const paletteColors = (values) =>
    values.palette === 'custom' ? fillPalette(values['palette-custom']) : { ...presetOf(values.palette).colors };

  // What's kept: the values not at their default, the stylesheets the chosen values switch on
  // (a default's too: Menu windows defaults to Solid on Linux) and the palette's tokens (none
  // for Enhanced: tokens.css holds it)
  const pack = (values) => {
    const kept = {};
    const client = [];
    const web = [];
    for (const item of SCHEMA) {
      let value = values[item.key];
      if (!valid(item, value) || same(value, item.def)) value = item.def;
      else kept[item.key] = value;
      const file = item.values.find((choice) => choice.v === value)?.file;
      if (!file) continue;
      if (item.scope !== 'web') client.push(file);
      if (item.scope === 'web' || item.scope === 'both') web.push(file);
    }
    // Custom colours stay kept while a preset is on, so Custom comes back as it was left
    if (values['palette-custom'] && typeof values['palette-custom'] === 'object') {
      kept['palette-custom'] = fillPalette(values['palette-custom']);
    }
    let vars = null;
    if (kept.palette) {
      const colors = paletteColors(kept);
      vars = Object.fromEntries(PALETTE_TOKENS.map(({ key, token }) => [token, colors[key]]));
    }
    // A multi setting with `hide` (a selector, % for the choice): the choices off go, in client windows
    const hide = [];
    for (const item of SCHEMA) {
      if (item.type !== 'multi' || !item.hide || !kept[item.key]) continue;
      for (const choice of item.values) {
        if (kept[item.key].includes(choice.v)) continue;
        // `hide`: a selector, % for the choice; or a selector per choice
        const selector = typeof item.hide === 'string' ? item.hide.replace('%', choice.v) : item.hide[choice.v];
        if (selector) hide.push(selector);
      }
    }
    return { values: kept, client, web, vars, hide };
  };

  const listeners = new Set();
  let destroyed = false;

  // Rarity tiers: SE.rarity (core/runtime-art.js) gives no tier while the setting is off
  const syncTiers = () => run(() => SE.rarity.setTiers(get('rarity-tiers') !== 'off'));
  syncTiers();

  // A change, this window's own or another's: its look, then whoever listens, then the web
  function changed() {
    run(() => window.__seClient?.applyOptions?.());
    syncTiers();
    for (const fn of listeners) run(fn);
    if (MAIN) sendToWeb();
  }

  const write = (values) => {
    run(() => localStorage.setItem(KEY, JSON.stringify(pack(values))));
    changed();
  };

  const current = () => ({ ...(read().values || {}) });

  const set = (key, value) => {
    const item = byKey.get(key);
    if (!item || !valid(item, value)) return;
    const next = item.type === 'multi' ? ordered(item, value) : value;
    if (same(get(key), next)) return;
    write({ ...current(), [key]: next });
  };

  // The palette in use, by token key ({ bg: '#…', … })
  const palette = () => paletteColors(current());

  // Custom colours, kept or none yet
  const customColors = () => {
    const kept = current()['palette-custom'];
    return kept && typeof kept === 'object' ? fillPalette(kept) : null;
  };

  // Custom from `colors` (partial: the rest from the palette in use), switched on
  const setCustom = (colors = {}) => {
    const values = current();
    const base = paletteColors(values);
    write({ ...values, palette: 'custom', 'palette-custom': fillPalette({ ...base, ...colors }, base) });
  };

  const onStorage = (event) => {
    if (event.key === KEY) changed();
  };
  addEventListener('storage', onStorage);

  /* ---------- Web pages (main window) ---------- */

  // What a page keeps: its stylesheets, the palette, and whether the theme restyles it at all
  const forWeb = () => {
    const saved = read();
    return JSON.stringify({
      values: Array.isArray(saved.values?.['web-sites']) ? { 'web-sites': saved.values['web-sites'] } : {},
      web: Array.isArray(saved.web) ? saved.web : [],
      vars: saved.vars || null,
    });
  };

  const browsers = () =>
    [...SE.owners()]
      .map((owner) => run(() => owner.MainWindowBrowserManager?.m_browser))
      .filter((browser) => typeof browser?.PostMessage === 'function');

  // Pages ask as they load: each browser view gets one listener, added once it exists
  const asking = new Map();
  let browserWatch = null;
  const listen = () => {
    for (const browser of browsers()) {
      if (asking.has(browser) || typeof browser.on !== 'function') continue;
      const listener = (message) => {
        if (message === ASK) run(() => browser.PostMessage(SEND, forWeb()));
      };
      run(() => browser.on('message', listener));
      asking.set(browser, listener);
    }
    if (asking.size) {
      browserWatch?.disconnect();
      browserWatch = null;
    }
  };

  function sendToWeb() {
    listen();
    const data = forWeb();
    for (const browser of browsers()) run(() => browser.PostMessage(SEND, data));
  }

  /* ---------- First run: Millennium's old Conditions (main window) ---------- */

  const OLD_ENTRANCE_KEY = 'se-entrance'; // a separate entrance choice in localStorage, also taken over

  // Millennium's config, wherever its answer keeps it: the theme's Conditions are the object
  // naming "Window entrance", its colours the one naming --se-color-accent
  const findOld = (root) => {
    const found = {};
    const queue = [[root, 0]];
    while (queue.length) {
      const [node, depth] = queue.shift();
      if (!node || typeof node !== 'object' || depth > 6) continue;
      if (typeof node['Window entrance'] === 'string') found.conditions ||= node;
      if (typeof node['--se-color-accent'] === 'string') found.accent ||= node['--se-color-accent'];
      for (const value of Object.values(node)) queue.push([value, depth + 1]);
    }
    return found.conditions || found.accent ? found : null;
  };

  const parse = (value) => {
    let out = value;
    for (let i = 0; i < 2 && typeof out === 'string'; i++) out = run(() => JSON.parse(out)) ?? null;
    return out;
  };

  let rpcWait = null;
  const rpcReady = () =>
    window.__sePluginRpc
      ? Promise.resolve(window.__sePluginRpc)
      : new Promise((resolve) => {
        const done = () => {
          clearTimeout(rpcWait?.timer);
          removeEventListener('se-plugin-rpc-ready', done);
          rpcWait = null;
          resolve(window.__sePluginRpc || null);
        };
        rpcWait = { done, timer: setTimeout(done, 5000) };
        addEventListener('se-plugin-rpc-ready', done);
      });

  // Written only once Millennium answered (an answer without the old Conditions has nothing to
  // take over): no RPC or both calls failing write nothing, so the next start tries again
  async function migrate() {
    if (run(() => localStorage.getItem(KEY)) != null) {
      run(() => localStorage.removeItem(OLD_ENTRANCE_KEY));
      return;
    }
    const values = {};
    let answered = false;
    const rpc = await rpcReady();
    for (const method of rpc ? ['Core_GetStartConfig', 'Core_GetBackendConfig'] : []) {
      const reply = await rpc.call('core', method, []).then((value) => ({ value }), () => null);
      if (!reply) continue;
      answered = true;
      const old = findOld(parse(reply.value));
      if (!old) continue;
      for (const item of SCHEMA) {
        const choice = item.from && item.values.find((c) => c.from === old.conditions?.[item.from]);
        if (choice) values[item.key] = choice.v;
      }
      // "Web pages: Steam's own" was every site; Themed sites has none on
      if (old.conditions?.['Web pages'] === "Steam's own") values['web-sites'] = [];
      // A changed accent: Custom, the theme's own colours with it
      if (HEX.test(old.accent || '') && old.accent.toLowerCase() !== PRESETS[0].colors.accent) {
        values.palette = 'custom';
        values['palette-custom'] = fillPalette({ ...PRESETS[0].colors, accent: old.accent });
      }
      break;
    }
    if (!answered || destroyed || run(() => localStorage.getItem(KEY)) != null) return;
    const entrance = run(() => localStorage.getItem(OLD_ENTRANCE_KEY));
    if (!values.entrance && valid(byKey.get('entrance'), entrance)) values.entrance = entrance;
    write(values);
    // The loader's old copy goes only once it is kept here
    if (run(() => localStorage.getItem(KEY)) != null) run(() => localStorage.removeItem(OLD_ENTRANCE_KEY));
  }

  if (MAIN) {
    listen();
    // The browser view appears once Steam has built the main window: look again as it changes
    if (!asking.size) browserWatch = SE.watch(listen, { throttle: 1000 });
    migrate();
    // What's kept follows the schema and this machine: a choice's selector or stylesheet
    // changed, a Steam class rehashed, or a default's stylesheet never kept (a first start
    // on Linux) is packed again at once instead of on the next change
    const saved = read();
    const packed = pack(saved.values || {});
    const stale = ['hide', 'client', 'web'].some((part) => JSON.stringify(saved[part] || []) !== JSON.stringify(packed[part]));
    if (stale) write(saved.values || {});
  }

  SE.settings = {
    schema: SCHEMA,
    tabs: TABS,
    presets: PRESETS,
    paletteTokens: PALETTE_TOKENS,
    readOn: READ_ON,
    get,
    set,
    palette,
    customColors,
    setCustom,
    /** Calls fn after every change, from any window; returns the unsubscribe. */
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  window.__seSettingsStore = {
    destroy() {
      destroyed = true;
      removeEventListener('storage', onStorage);
      browserWatch?.disconnect();
      rpcWait?.done();
      for (const [browser, listener] of asking) run(() => browser.off?.('message', listener));
      asking.clear();
      listeners.clear();
      delete SE.settings;
      delete window.__seSettingsStore;
    },
  };
})(window.__se);
