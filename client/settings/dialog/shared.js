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
 * - Enhances Game Properties tabs (Cloud quota bar, Build ID copy actions,
 *   disk usage bar, DLC counts, and Workshop empty states).
 *
 * Plain scripts, listed part by part in client/loader.js and run in this order, sharing
 * window.__steamEnhancedSettingsParts (values parts reassign live on its `live`). The parts:
 * - shared.js       selectors, page and group tables, row icons, text helpers
 * - options.js      the search catalogue's built-in entries
 * - search.js       the settings search bar: catalogue, scoring, results, jumping to a hit
 * - window.js       which window this is, and sizing it
 * - sidebar.js      sidebar headers and icons
 * - layout.js       sections, pickers, cards and row tagging, and the layout scan
 * - props-pages.js  Game Properties: the General, Updates, Files and Workshop pages
 * - props.js        Game Properties: the page pass, the cover, the sidebar
 * - main.js         the update pass, watchers, start, and the API (destroy())
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = (window.__steamEnhancedSettingsParts = { live: {} });
  const { C } = SE;
  const { live } = ns;
  live.search = undefined;
  live.results = undefined;
  live.cursor = 0;
  live.frame = 0;
  live.sizedFor = null;
  live.observer = undefined;
  live.scanTimer = 0;

  window.__steamEnhancedSettings?.destroy?.();

  const LIST = `.${C.PagedSettingsDialog_PageList}`;
  const ITEM = `.${C.PagedSettingsDialog_PageListItem}`;
  const SEP = `.${C.PageListSeparator}`;
  const TITLE = `.${C.PagedSettingsDialog_Title}`;
  const TEXT = `.${C.PageListItem_Title}`;
  const ACTIVE = C.PagedSettingsDialog_Active;
  const CONTENT = `.${C.PagedSettingsDialog_PageContent}`;
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
  const MILL_BY_NAME = new Map(MILL_PAGES.map((p) => [p[0].toLowerCase(), p]));
  const MILL_BY_KEY = new Map(MILL_PAGES.map((p) => [p[3], p]));
  const MILL_GROUPS = ['Customize', 'Maintain'];
  const GROUPS = ['Account', 'Steam', 'Devices & media'];

  const ROW_ICONS = [
    [/^family view/i, 'security'],
    [/^account name/i, 'account'],
    [/^steam guard$/i, 'check'],
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
  ];

  const PRE_LABELS = [
    [/^friend code/i, 'Account'],
    [/^append nicknames/i, 'Friends list'],
    [/^family view/i, 'Restrictions'],
    [/^voice transmission type/i, 'Transmission'],
    [/^pause music when starting/i, 'Playback'],
    [/^download high quality audio/i, 'Downloads'],
  ];

  const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const fieldLabel = (n) => text(n.querySelector?.(LABEL));
  const KEY_RE = /^(?:(?:shift|ctrl|control|alt|cmd|win)\s*\+\s*)*(?:f\d{1,2}|tab|space|insert|delete|home|end|page ?(?:up|down)|key ?pad.*|num.*|[a-z0-9]|none|[^\s]+\s*\+\s*[^\s]+)$/i;
  // Steam draws a connected controller's icon inside its name (no CSS-module key in core's map).
  const CONTROLLER_ICON = ':is(.JASigq2q1TdofKTOw7MQt, ._3IdIX2_eZXnDrm2wqIpTSQ, ._28B5PnW21FOp5fzffM9K6) > ._30lE6NZfqKKk3ozfL--IYQ';
  const TILE_SUBS = {
    'add a non-steam game': 'Shortcuts to other programs',
    'activate a product': 'Enter a product code',
    'browse the steam store': 'Find something new',
  };
  Object.assign(ns, {
    ACCOUNT_HEADER, ACTIVE, BODY_TEXT, BY_NAME, CONTENT, CONTROLLER_ICON, FIELD, FIELD_BG, GROUPS,
    ITEM, KEY_RE, LABEL, LIST, MILL_BY_KEY, MILL_BY_NAME, MILL_GROUPS, MILL_PAGES, PAGES,
    PRE_LABELS, PROPS_SIZE, ROW_ICONS, SECTION, SEP, SIZE, TEXT, TILE_SUBS, TITLE, UPDATE_TIMING,
    fieldLabel, text,
  });
});
