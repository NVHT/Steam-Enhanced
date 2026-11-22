/*
 * SteamGridDB (github.com/DevsNate/SteamGridDB-Millennium): its window's API key setup (.sgdbApiKeySetup), paired with steamgriddb.css.
 *
 * The plugin asks for a personal API key in three Steam fields (get it, paste it, save it).
 * The theme shows them as a guided card: "Connect SteamGridDB", one step row per field with a
 * step circle (done / current / to do), a Paste chip in the key field, a "Looks like a valid
 * key" check, and the storage note and Save key button as the card's footer.
 *
 * The plugin's React owns every node, so nothing of its is moved or rebuilt: wording is swapped
 * through [data-se-text] (shown by CSS in place of the node's own text), states are attributes,
 * and the Paste chip and the check are theme elements put beside the plugin's (.se-sgdb-*).
 * Saving is the plugin's own button.
 *
 * The plugin turns the theme off in its window on purpose (desktop-window/theme-isolation.ts:
 * every Millennium-injected sheet gets media="not all", so the window looks like Big Picture).
 * The theme brings its own look back for this window only: it adopts its tokens, spinner and
 * steamgriddb.css as constructed sheets (document.adoptedStyleSheets), which the plugin's
 * isolation leaves alone. steamgriddb.css styles the key setup and the artwork browser (tabs,
 * toolbar, tiles) and brings its own @font-face.
 *
 * On the artwork browser this also tags the tabs (which one, its group: artwork types or
 * Manage / Collections) for their icons and pill groups, adds a result count after Filter and
 * small / large icons at the size slider's ends.
 *
 * Only runs in the plugin's window (titled "SteamGridDB", root class steamgriddb).
 */
((SE) => {
  const KEY = '__seSteamGridDB';
  window[KEY]?.destroy?.();

  /*
   * The plugin opens its window, then names it: when this runs the title can still be empty.
   * So the window is recognised by its title or the plugin's root class (html.steamgriddb),
   * whichever comes first, and until then only the title and that class are watched.
   */
  const html = document.documentElement;
  const isPluginWindow = () => document.title === 'SteamGridDB' || html.classList.contains('steamgriddb');

  const ROOT = '.sgdbApiKeySetup';
  // SteamGridDB keys are 32 hex characters
  const VALID = /^[a-f0-9]{32}$/i;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;

  // The theme's wording for the plugin's (matched loosely, so a reworded plugin keeps its own)
  const LABELS = [
    [/get your key/i, 'Get your key'],
    [/paste it/i, 'Paste it'],
    [/save it/i, 'Save it'],
  ];

  const relabel = (node, text) => SE.attr(node, 'data-se-text', text);

  // A button's label: a theme element inside it (Steam draws its own ::before on buttons)
  function relabelButton(button, text) {
    if (!button) return;
    SE.attr(button, 'data-se-sgdb-btn', '');
    let label = button.querySelector(':scope > .se-sgdb-label');
    if (!label) {
      label = SE.el('span', 'se-sgdb-label');
      button.prepend(label);
    }
    SE.setText(label, text);
  }

  // Writes the key the way typing would, so the plugin's React state follows
  function enter(input, text) {
    setValue.call(input, text.trim());
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }

  async function paste(input) {
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      // Clipboard read refused: let Chromium paste into the focused field
      input.focus();
      document.execCommand('paste');
      return;
    }
    if (text) enter(input, text);
  }

  function pasteChip(input) {
    const wrap = input.closest(`.${SE.C.className_className3}`);
    if (!wrap || wrap.querySelector(':scope > .se-sgdb-paste')) return;
    const chip = SE.el('button', 'se-sgdb-paste', 'Paste');
    chip.type = 'button';
    /*
     * The chip sits inside the field's <label> and Steam's focusable panel: its presses stop here,
     * so neither the label nor Steam's handlers (which open the field's own Paste menu) see them.
     */
    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'contextmenu']) {
      chip.addEventListener(type, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    }
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      paste(input);
    });
    wrap.append(chip);
  }

  function validMark(field) {
    const row = field.querySelector('.FieldLabelRow');
    if (!row || row.querySelector(':scope > .se-sgdb-ok')) return;
    row.append(SE.el('span', 'se-sgdb-ok', 'Looks like a valid key'));
  }

  // ---------- The artwork browser ----------

  const PAGE = '.sgdbDesktopPage';
  const ART = new Set(['grid_p', 'grid_l', 'hero', 'logo', 'icon']);

  // Tabs: which one ([data-se-sgdb-tab], from the id's ending), its group and the group's ends
  function tagTabs(page) {
    const tabs = [...page.querySelectorAll('.TabRow .Tab')];
    const key = (tab) => /(grid_p|grid_l|hero|logo|icon|manage|collections)$/.exec(tab.id)?.[1] ?? null;
    tabs.forEach((tab, i) => {
      const k = key(tab);
      const group = k ? (ART.has(k) ? 'art' : 'tools') : null;
      SE.attr(tab, 'data-se-sgdb-tab', k);
      SE.attr(tab, 'data-se-sgdb-group', group);
      const groupOf = (t) => (t ? (ART.has(key(t)) ? 'art' : key(t) ? 'tools' : null) : null);
      const edges = [];
      if (groupOf(tabs[i - 1]) !== group) edges.push('start');
      if (groupOf(tabs[i + 1]) !== group) edges.push('end');
      SE.attr(tab, 'data-se-sgdb-edge', group ? edges.join(' ') : null);
    });
  }

  // "50 results", after the Filter button
  function resultCount(page) {
    const toolbar = page.querySelector('.sgdb-asset-toolbar');
    if (!toolbar) return;
    const filters = toolbar.querySelector(':scope > .filter-buttons');
    let count = toolbar.querySelector(':scope > .se-sgdb-count');
    if (!count) {
      count = SE.el('span', 'se-sgdb-count');
      if (filters) filters.after(count);
      else toolbar.prepend(count);
    }
    const n = page.querySelectorAll('#images-container > .asset-box-wrap').length;
    SE.setText(count, n ? `${n} ${n === 1 ? 'result' : 'results'}` : '');
  }

  // Small and large grid icons at the size slider's ends
  function sizeIcons(page) {
    const slider = page.querySelector('.sgdb-asset-toolbar .size-slider');
    if (!slider || slider.querySelector(':scope > .se-sgdb-size')) return;
    const small = SE.el('span', 'se-sgdb-size');
    small.dataset.seSgdbSize = 'small';
    const large = SE.el('span', 'se-sgdb-size');
    large.dataset.seSgdbSize = 'large';
    slider.prepend(small);
    slider.append(large);
  }

  // Manage's action buttons carry no names; their order is fixed by the plugin:
  // [add to collection, only once the artwork is ours] clear, browse, [invisible, not on icons]
  const ACTIONS = {
    add: 'Add to collection',
    clear: 'Clear custom artwork',
    browse: 'Browse local files',
    blank: 'Use invisible artwork',
  };

  function tagActions(page) {
    for (const overlay of page.querySelectorAll('#local-images-container .action-overlay')) {
      const buttons = [...overlay.children].filter((node) => node.classList.contains('action-button'));
      const names = ['clear', 'browse'];
      if (!overlay.closest('.asset-wrap-icon')) names.push('blank');
      if (buttons.length > names.length) names.unshift('add');
      buttons.forEach((button, i) => {
        const name = names[i];
        if (!name || button.dataset.seSgdbAction === name) return;
        SE.attr(button, 'data-se-sgdb-action', name);
        button.title = ACTIONS[name];
        button.setAttribute('aria-label', ACTIONS[name]);
      });
    }
  }

  // Manage fits the window: the stylesheet lays it out from the height left below the tabs.
  const FIT_GAP = 24;
  const fitWatched = new WeakSet();

  function fitManage(page) {
    const box = page.querySelector('#local-images-container');
    const scroller = box?.closest('.TabContentsScroll');
    if (!scroller) return;
    if (!fitWatched.has(scroller)) {
      fitWatched.add(scroller);
      new ResizeObserver(() => fitManage(page)).observe(scroller);
    }
    const top = box.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
    const fit = `${Math.max(0, Math.floor(scroller.clientHeight - top - FIT_GAP))}px`;
    if (box.style.getPropertyValue('--se-sgdb-fit') !== fit) box.style.setProperty('--se-sgdb-fit', fit);
    if (!box.hasAttribute('data-se-sgdb-fit')) SE.attr(box, 'data-se-sgdb-fit', '');
  }

  function decorateBrowser(page) {
    tagTabs(page);
    resultCount(page);
    sizeIcons(page);
    tagActions(page);
    fitManage(page);
  }

  function update() {
    try {
      run();
    } catch (err) {
      console.error('[Steam Enhanced] SteamGridDB', err);
    }
  }

  function run() {
    const page = document.querySelector(PAGE);
    if (page) {
      declareLayer();
      adoptTheme();
      decorateBrowser(page);
    }
    const root = document.querySelector(ROOT);
    if (!root) return;
    declareLayer();
    adoptTheme();
    if (adopted.length) markReady(root);

    relabel(root.querySelector('.DialogHeader'), 'Connect SteamGridDB');
    relabel(root.querySelector('.DialogBodyText'), 'Add your personal API key to browse and apply custom artwork.');

    const fields = [...root.querySelectorAll('.DialogControlsSection > .Field')];
    const input = root.querySelector('input.DialogInput');
    const value = input?.value.trim() ?? '';
    const valid = VALID.test(value);
    SE.attr(root, 'data-se-sgdb-key', valid ? 'valid' : value ? 'typed' : 'empty');

    fields.forEach((field, i) => {
      const step = i + 1;
      SE.attr(field, 'data-se-sgdb-step', step);
      const label = field.querySelector('.FieldLabel');
      const own = label?.textContent.replace(/^\s*\d+\.\s*/, '') ?? '';
      relabel(label, LABELS.find(([re]) => re.test(own))?.[1] ?? own);
      // Step 1 is done once the window is open; the key field is current until it holds a key
      const state = step === 1 ? 'done' : step === 2 ? (valid ? 'done' : 'on') : valid ? 'on' : 'todo';
      SE.attr(field, 'data-se-sgdb-state', state);
    });

    const [get, enterKey, save] = fields;
    if (get) relabelButton(get.querySelector('.DialogButton'), 'Open SteamGridDB');
    if (save) relabelButton(save.querySelector('.DialogButton'), 'Save key');
    if (enterKey) {
      validMark(enterKey);
      // The storage note becomes the card's footer
      SE.attr(enterKey.querySelector(':scope > .FieldLeftColumn > .FieldDescription, .FieldDescription'), 'data-se-sgdb-note', '');
    }
    if (input) {
      if (!input.placeholder) input.placeholder = 'Personal API key';
      pasteChip(input);
    }
  }

  /*
   * The theme's sheets for the setup, adopted past the plugin's isolation. Their URLs come from
   * the loader's links (still in <head>, only switched off); baseURL keeps their relative urls
   * (the font) resolving next to the files.
   */
  const SHEETS = ['core/tokens.css', 'core/icons-nav.css', 'core/icons-ui.css', 'core/spinner.css', 'compat/steamgriddb/steamgriddb.css', 'compat/steamgriddb/steamgriddb-browser.css'];

  /*
   * The artwork browser's rules are in a cascade layer, se-sgdb (steamgriddb.css), against the
   * plugin's own layer (sgdb-presentation), both !important: for important rules the layer
   * declared first wins, so se-sgdb is declared here, at the top of <head>, ahead of the
   * plugin's <style> in the page. The plugin's isolation leaves this element alone (its id).
   */
  function declareLayer() {
    if (document.getElementById('se-sgdb-layers')) return;
    const style = document.createElement('style');
    style.id = 'se-sgdb-layers';
    style.textContent = '@layer se-sgdb;';
    (document.head ?? html).prepend(style);
  }
  let adopted = [];
  let adopting = null;

  function adoptTheme() {
    if (adopting) return adopting;
    // The loader's file → URL list (client/loader.js imports them all through one <style>)
    const hrefs = SHEETS.map((file) => window.__seClient?.sheets?.get(file));
    if (hrefs.some((h) => !h)) return null;
    adopting = Promise.all(
      hrefs.map(async (href) => {
        const res = await fetch(href, { cache: 'no-cache' });
        const sheet = new CSSStyleSheet({ baseURL: href });
        await sheet.replace(await res.text());
        return sheet;
      }),
    )
      .then((sheets) => {
        adopted = sheets;
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, ...sheets];
        markReady(document.querySelector(ROOT));
      })
      .catch((err) => {
        adopting = null;
        console.warn('[Steam Enhanced] SteamGridDB: could not load the theme sheets', err);
      });
    return adopting;
  }

  /*
   * Transitions start two frames after the card's first themed paint, so the change from the
   * plugin's look into the theme's isn't animated (a setup remounted after the key is cleared
   * gets the same).
   */
  const pending = new WeakSet();
  function markReady(root) {
    if (!root || root.hasAttribute('data-se-sgdb-ready') || pending.has(root)) return;
    pending.add(root);
    requestAnimationFrame(() => requestAnimationFrame(() => SE.attr(root, 'data-se-sgdb-ready', '')));
  }

  const onInput = (e) => {
    // Checked by tag, not instanceof: the plugin's React may render into this window from another
    if (e.target?.tagName === 'INPUT' && e.target.closest(ROOT)) update();
  };

  let watcher = null;
  function start() {
    document.addEventListener('input', onInput, true);
    // Unscoped: the setup mounts after the window opens, and again after the key is cleared
    watcher = SE.watch(update, { throttle: 50 });
    update();
  }

  let waiting = null;
  if (isPluginWindow()) {
    start();
  } else {
    // Own observer on purpose: it watches <head> and <html>'s class for the plugin's window to appear, which the shared observer (<body> only) can't see; disconnects once it has
    waiting = new MutationObserver(() => {
      if (!isPluginWindow()) return;
      waiting.disconnect();
      waiting = null;
      start();
    });
    waiting.observe(document.head ?? html, { childList: true, subtree: true, characterData: true });
    waiting.observe(html, { attributes: true, attributeFilter: ['class'] });
  }

  window[KEY] = {
    destroy() {
      waiting?.disconnect();
      watcher?.disconnect();
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((sheet) => !adopted.includes(sheet));
      document.removeEventListener('input', onInput, true);
      document.querySelectorAll('.se-sgdb-paste, .se-sgdb-ok, .se-sgdb-label, .se-sgdb-count, .se-sgdb-size, #se-sgdb-layers').forEach((n) => n.remove());
    },
  };
})(window.__se);
