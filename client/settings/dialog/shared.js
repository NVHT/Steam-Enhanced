/*
 * Steam Settings, Game Properties, and Millennium Settings layout controller.
 *
 * - Resizes and centers Steam Settings (1080x1010) and Game Properties (1040x840)
 *   windows when shown.
 * - Populates sidebar category headers, duotone navigation icons, and a live
 *   cross-page settings search bar.
 * - Tags contiguous Field rows with card boundary attributes (`data-se-c`),
 *   section headers (`data-se-sec`), segmented radio groups, keyboard shortcut
 *   badges (`data-se-kbd`), and row icons (`data-se-row`).
 * - Enhances Game Properties tabs (the game header, Cloud quota bar, Build ID copy
 *   actions, disk usage bar, short DLC names, and Workshop empty states).
 *
 * Plain scripts, listed part by part in client/loader.js and run in this order, sharing
 * window.__seSettingsParts (values parts reassign live on its `live`). The parts:
 * - shared.js       selectors, page and group tables, row icons, text helpers
 * - options.js      the search catalogue's built-in entries
 * - search.js       the settings search bar: catalogue, scoring, results, jumping to a hit
 * - window.js       which window this is, and sizing it
 * - sidebar.js      sidebar headers and icons
 * - layout.js       sections, pickers, cards and row tagging, and the layout scan
 * - props-pages.js  Game Properties: the General, Updates, Files and Workshop pages
 * - props-header.js Game Properties: the game's hero art across the window's top
 * - props.js        Game Properties: the page pass (row icons, DLC names), the sidebar
 * - account.js … music.js  a Steam Settings page's own view each (Account, Friends, … Music)
 * - main.js         the update pass, watchers, start, and the API (destroy())
 */
((SE) => {
  // revealers: a page that hides rows (In Game's tabs) shows one search found (search.js)
  const ns = (window.__seSettingsParts = { live: {}, revealers: new Set() });
  const { C } = SE;
  const { live } = ns;
  live.search = undefined;
  live.results = undefined;
  live.cursor = 0;
  live.frame = 0;
  live.sizedFor = null;
  live.observer = undefined;
  live.scanTimer = 0;

  window.__seSettings?.destroy?.();

  const LIST = `.${C.PagedSettingsDialog_PageList}`;
  const ITEM = `.${C.PagedSettingsDialog_PageListItem}`;
  const SEP = `.${C.PageListSeparator}`;
  const TITLE = `.${C.PagedSettingsDialog_Title}`;
  const TEXT = `.${C.PageListItem_Title}`;
  const ACTIVE = C.PagedSettingsDialog_Active;
  const CONTENT = `.${C.PagedSettingsDialog_PageContent}`;
  /*
   * The page on show. Steam's paged dialog can keep every page visited mounted, the others
   * hidden by an inline display: none (Millennium 3.7's settings: its SDK hands the pages to the
   * dialog directly); the first page content in the document can then be a hidden one.
   */
  const activeContent = (root = document) =>
    [...root.querySelectorAll(CONTENT)].find((el) => el.style.display !== 'none') || null;
  const FIELD = `.${C.Field}`;
  const FIELD_BG = C.Background;
  const LABEL = `.${C.FieldLabel}`;
  const ACCOUNT_HEADER = `:is(.${C.CurrentUserProfileBackground_AvatarAndLabel}, .${C.EntryLabel_AvatarAndLabel})`;
  const UPDATE_TIMING = `.${C.FakeContainer}`;
  const SECTION = `.SettingsDialogSubHeader, .${C.SettingsDialogSubHeader}, .DialogControlsSectionHeader, .DialogSubHeader, .${C.Subheader}`;
  const BODY_TEXT = `.SettingsDialogBodyText, .${C.SettingsDialogBodyText}, .DialogBodyText, .DialogLabel, .${C.SettingsDialogDescriptionText}`;
  const SIZE = { w: 1080, h: 1010 };
  const PROPS_SIZE = { w: 1040, h: 840 };

  const PAGES = [
    ['Account', 'account', 'Your profile, wallet and how others find you'],
    ['Friends & Chat', 'friendsic', 'How your friends list and chats look and behave'],
    ['Family', 'family', 'Library sharing, parental controls and purchase requests'],
    ['Security', 'security', 'Sign-in, Steam Guard and devices'],
    ['Notifications', 'notify', 'Toasts, sounds and where Steam reaches you'],
    ['Interface', 'interface', 'Language, start-up and how Steam looks'],
    ['Store', 'storeic', 'What the store shows you'],
    ['Library', 'libic', 'Size, performance and what the list shows'],
    ['Downloads', 'dl', 'Region, speed, updates and shaders'],
    ['Storage', 'storage', 'Drives and what is installed on them'],
    ['Cloud', 'cloud', 'Saves and screenshots'],
    ['In Game', 'ingame', 'The Steam Overlay, performance monitor and screenshots'],
    ['Accessibility', 'access', 'Size, contrast and motion'],
    ['Controller', 'controller', 'Connected controllers and setup'],
    ['Game Recording', 'rec', 'Record gameplay in the background or on demand'],
    ['Voice', 'voice', 'Microphone, speakers and transmission'],
    ['Remote Play', 'remote', 'Stream games between your devices'],
    ['Broadcast', 'broadcast', 'Let friends watch you play'],
    ['Music', 'music', 'Soundtrack playback in Steam'],
  ];
  const BY_NAME = new Map(PAGES.map((p) => [p[0].toLowerCase(), p]));

  const MILL_PAGES = [
    ['General', 'mgeneral', 'How Millennium starts, updates and loads themes', 'general'],
    ['Themes', 'mthemes', 'Change how Steam looks. One theme runs at a time.', 'themes'],
    ['Quick CSS', 'mcss', 'Your own tweaks, on top of the theme, in every Steam window as you type', 'quickcss'],
    ['Plugins', 'mplugins', 'Turn plugins on or off; changes apply after you save', 'plugins'],
    ['Updates', 'mupdates', 'Millennium, theme and plugin updates', 'updates'],
    ['Logs', 'mlogs', 'What Millennium and its plugins report', 'logs'],
  ];
  /*
   * Pages plugins add to the Millennium sidebar that the theme designs (compat/), in the same
   * shape. Kept out of MILL_PAGES: the sidebar's by-position fallback matches that list's length,
   * which a plugin that isn't installed would break.
   */
  const MILL_PLUGIN_PAGES = [
    ['Brew Hub', 'mbrewhub', 'Themes and plugins from the community, ready to install', 'brewhub'],
  ];
  const MILL_BY_NAME = new Map([...MILL_PAGES, ...MILL_PLUGIN_PAGES].map((p) => [p[0].toLowerCase(), p]));
  const MILL_BY_KEY = new Map([...MILL_PAGES, ...MILL_PLUGIN_PAGES].map((p) => [p[3], p]));
  const MILL_GROUPS = ['Customize', 'Maintain'];
  const GROUPS = ['Account', 'Steam', 'Devices & media'];

  const ROW_ICONS = [
    [/^family view/i, 'security'],
    [/^account name/i, 'account'],
    [/^steam guard$/i, 'check'],
    [/^don't save account credentials/i, 'device'],
    [/^backup steam guard codes/i, 'key'],
    [/^deauthori[sz]e all/i, 'signout'],
    [/^enable steam cloud/i, 'cloud'],
    [/^screenshot management/i, 'interface'],
    [/^add a new controller/i, 'add'],
    [/^voice input device/i, 'voice'],
    [/^voice output device/i, 'music'],
    [/^enable remote play/i, 'remote'],
    [/^volume$/i, 'music'],
    [/^friend code/i, 'friendsic'],
    [/^email address/i, 'mail'],
    [/^vac status/i, 'check'],
    // Store (store.js): each preference's tile
    [/^mature content/i, 'mature'],
    [/^exclude from my store/i, 'exclude'],
    [/^platform preference/i, 'platform'],
    [/^discovery queue/i, 'discovery'],
    [/^new on steam queue/i, 'newonsteam'],
    [/^steam deck feedback/i, 'deck'],
    [/^live broadcasts/i, 'broadcasts'],
  ];

  const PRE_LABELS = [
    [/^friend code/i, 'Account'],
    [/^account name/i, 'Sign-in'],
    [/^append nicknames/i, 'Friends list'],
    [/^family view/i, 'Restrictions'],
    [/^voice transmission type/i, 'Transmission'],
    [/^pause music when starting/i, 'Playback'],
    [/^download high quality audio/i, 'Downloads'],
  ];

  const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const fieldLabel = (n) => text(n.querySelector?.(LABEL));
  // A row's slider: its place from 0 to 1 and its default's (Steam's --normalized-slider-value
  // and --normalized-slider-default-value on the slider), null without one. Its style attribute
  // changes as it moves.
  const SLIDER = '.SliderControlAndNotches';
  const sliderAt = (field) => {
    const style = field.querySelector(SLIDER)?.style;
    const read = (name) => Number.parseFloat(style?.getPropertyValue(name));
    const at = read('--normalized-slider-value');
    if (!Number.isFinite(at)) return null;
    const def = read('--normalized-slider-default-value');
    return { at: Math.max(0, Math.min(1, at)), def: Number.isFinite(def) ? def : null };
  };
  const KEY_RE = /^(?:(?:shift|ctrl|control|alt|cmd|win)\s*\+\s*)*(?:f\d{1,2}|tab|space|insert|delete|home|end|page ?(?:up|down)|key ?pad.*|num.*|[a-z0-9]|none|[^\s]+\s*\+\s*[^\s]+)$/i;
  // Steam draws a connected controller's icon inside its name (no CSS-module key in core's map).
  const CONTROLLER_ICON = `:is(.${C.ControllerLabel}, .${C.DongleLabel}, .${C.DisconnectedControllerLabel}) > .${C.AllControllersContainer_Icon}`;
  const TILE_SUBS = {
    'add a non-steam game': 'Shortcuts to other programs',
    'activate a product': 'Enter a product code',
    'browse the steam store': 'Find something new',
  };
  /* ---------- Page views: a theme part over a Steam page, redrawn from its rows ---------- */

  // A row's switch: its On class
  const switchOn = (field) => Boolean(field?.querySelector('.Toggle')?.classList.contains('On'));

  // A row's choice as its place in the list, the same in every language: a radio group's checked
  // button, else a dropdown's shown option found in its options (its live React props: the
  // element's own fiber can hold the last choice), by its label (some dropdowns' option data
  // aren't unique), else by selectedOption. null without one.
  const choiceAt = (field) => {
    const radios = [...(field?.querySelectorAll('.Shared_Radio_Group [role="radio"]') || [])];
    if (radios.length) {
      const i = radios.findIndex((r) => r.getAttribute('aria-checked') === 'true');
      return i < 0 ? null : i;
    }
    const drop = field?.querySelector('.DialogDropDown');
    if (!drop) return null;
    const shown = text(drop.querySelector('.DialogDropDown_CurrentDisplay'));
    const i = SE.run(() =>
      SE.fromProps(
        drop,
        8,
        (p) => {
          if (!Array.isArray(p.rgOptions) || !('selectedOption' in p)) return undefined;
          const byLabel = p.rgOptions.findIndex((o) => typeof o?.label === 'string' && o.label.trim() === shown);
          return byLabel >= 0 ? byLabel : p.rgOptions.findIndex((o) => o?.data === p.selectedOption);
        },
        { live: true }
      )
    );
    return Number.isInteger(i) && i >= 0 ? i : null;
  };

  // A page's rows by what they do: [[label regex, key]] → { key: field }
  const rowsOf = (page, rows) => {
    const found = {};
    for (const field of page.querySelectorAll(FIELD)) {
      const label = fieldLabel(field);
      const key = rows.find(([re]) => re.test(label))?.[1];
      if (key && !(key in found)) found[key] = field;
    }
    return found;
  };

  // Your Library's played games, last played first: { store, apps } (at most count)
  const recentGames = (count) => {
    const store = SE.run(() => SE.global('appStore', (st) => st.allApps));
    const apps = (SE.run(() => store.allApps) || [])
      .filter((a) => a?.rt_last_time_played > 0 && SE.isLibraryGame(a))
      .sort((a, b) => b.rt_last_time_played - a.rt_last_time_played)
      .slice(0, count);
    return { store, apps };
  };

  // Your last played game: { appid, name, played, store } or null
  const lastGame = () => {
    const { store, apps } = recentGames(1);
    const app = apps[0];
    return app ? { appid: app.appid, name: app.display_name || '', played: app.rt_last_time_played, store } : null;
  };

  /*
   * A page's hero card (pages-hero.css): a title and a line (no glyph: most rows have none),
   * room below for the page's own parts (body), line art on its right (side), and art behind it
   * all while setArt() has some
   * (other art replaces it, none takes it away).
   * aria-hidden: a picture of the page's state; Steam's rows stay the controls.
   */
  const pageHero = () => {
    const el = (tag, cls, text) => SE.el(tag, cls, text);
    const root = el('div', 'se-page-hero');
    root.setAttribute('aria-hidden', 'true');
    const title = el('div', 'se-page-hero-title');
    const line = el('div', 'se-page-hero-line');
    const text = el('div', 'se-page-hero-text');
    text.append(title, line);
    const body = el('div', 'se-page-hero-body');
    // Line art on the card's right (the page's own, e.g. Security's phone), beside the text
    const side = el('div', 'se-page-hero-side');
    root.append(text, body, side);
    let art = null;
    let artKey = '';
    const set = (node, value) => {
      if (node.textContent !== value) node.textContent = value;
    };
    return {
      root,
      body,
      side,
      title: (value) => set(title, value),
      line: (value) => set(line, value),
      setArt(urls) {
        const key = urls?.[0] || '';
        if (key === artKey) return;
        artKey = key;
        art?.remove();
        art = null;
        SE.unmark(root, 'data-art');
        if (!key) return;
        art = el('div', 'se-page-hero-art');
        const img = SE.art.img(urls, '', () => art.remove());
        img.addEventListener('load', () => SE.mark(art, 'data-ready'), { once: true });
        art.append(img);
        root.prepend(art);
        SE.mark(root, 'data-art');
      },
    };
  };

  /*
   * A theme part over one Steam page, kept in step with the page's rows:
   *   route       the page's route ("voice": its content's id ends "/settings/voice_Content");
   *               some carry parameters ("controller/:type/:controllerIndex")
   *   make(body)  → a view { root, destroy? }, put first in the page's body before its first paint
   *   read(page)  → the page's state; draw(view, state) shows it (both after every change)
   *   attributes  what to watch besides the rows Steam adds (class: switches and radios)
   *   characterData  watch text changes too (rows whose values Steam rewrites in place)
   *   header      a header of the page's own views to follow instead (Controller's sub-views)
   * → { PAGE, views (the live ones), sync(), destroy() }
   */
  const pageView = ({ route, make, read, draw, header: viewHeader, attributes = ['class'], characterData = false }) => {
    const PAGE = `[id$="/settings/${route}_Content"]`;
    const views = new Set();
    const ignore = SE.inside('.se-page-view');
    // First, after the page's header where Steam draws it inside the body (Controller: in a panel),
    // or a view's own; again when Steam redraws it (Controller's views swap it), moved only when out
    // of place
    const place = (v) => {
      const header =
        (viewHeader && v.body.querySelector(`:scope ${viewHeader}`)) ||
        v.body.querySelector(':scope > .DialogHeader, :scope > .Panel > .DialogHeader');
      if (header) {
        if (header.nextElementSibling !== v.root) header.after(v.root);
      } else if (v.body.firstElementChild !== v.root) v.body.prepend(v.root);
    };
    const sync = () => {
      const page = document.querySelector(PAGE);
      if (!page) return;
      const state = read(page);
      for (const v of views) {
        place(v);
        draw(v, state);
      }
    };
    const mounted = SE.mount(
      `Settings ${route}`,
      () => [...document.querySelectorAll(`${PAGE} .DialogBody`)],
      (body) => {
        const v = make(body);
        v.body = body;
        v.root.classList.add('se-page-view');
        place(v);
        views.add(v);
        SE.run(sync);
        return {
          destroy() {
            views.delete(v);
            v.destroy?.();
            v.root.remove();
          },
        };
      },
      { sync: true, scope: PAGE, ignore }
    );
    const watcher = SE.watch(sync, { scope: PAGE, attributes, characterData, throttle: 50, ignore });
    return {
      PAGE,
      views,
      sync,
      destroy() {
        mounted.destroy();
        watcher.disconnect();
      },
    };
  };

  Object.assign(ns, {
    choiceAt, lastGame, pageHero, pageView, recentGames, rowsOf, switchOn,
    ACCOUNT_HEADER, ACTIVE, BODY_TEXT, BY_NAME, CONTENT, CONTROLLER_ICON, FIELD, FIELD_BG, GROUPS,
    ITEM, KEY_RE, LABEL, LIST, MILL_BY_KEY, MILL_BY_NAME, MILL_GROUPS, MILL_PAGES, PAGES,
    PRE_LABELS, PROPS_SIZE, ROW_ICONS, SECTION, SEP, SIZE, SLIDER, TEXT, TILE_SUBS, TITLE,
    UPDATE_TIMING, activeContent, fieldLabel, sliderAt, text,
  });
})(window.__se);
