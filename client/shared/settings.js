/*
 * The theme's settings (SE.settings): what each one offers, where the choice is kept, and how
 * a change reaches every window and web page at once.
 *
 * Kept in localStorage "se-settings", which every client window shares:
 *   values   each setting not at its default, by key
 *   client   the option stylesheets (options/) those values switch on in client windows
 *   web      the same for Store, Community, Support and Checkout pages
 *   vars     the colour palette's base tokens ({ '--se-bg': '#…' }), when not the default
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
  const COLOUR = /^(?:#[0-9a-f]{6}|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\))$/i;
  const MAIN = Boolean(window.__seClient?.groups?.has('main'));
  const SEND = 'SteamEnhanced.Settings'; // the client → a page (core/core.js)
  const ASK = 'SteamEnhanced.SettingsRequest'; // a page → the client, as it loads

  // A choice: its value, its label, the option stylesheet it switches on (none for the
  // default) and its name in Millennium's old Conditions (`from`, for the first run)
  const opt = (v, label, file = null, from = label) => ({ v, label, file, from });
  const ON = opt('on', 'On', null, 'yes');
  const off = (file) => opt('off', 'Off', file, 'no');

  /*
   * The colour palette: the base tokens of core/tokens.css a preset sets, by key (the settings
   * window's Custom editor shows them in this order, under `group`). Enhanced is tokens.css's
   * own values; each other preset sets every one. group: the mood the settings window files it
   * under (Neutral, Cool, Warm).
   */
  const PALETTE_TOKENS = [
    ['bg', '--se-bg', 'Background', 'Surfaces'],
    ['sidebar', '--se-sidebar', 'Sidebar', 'Surfaces'],
    ['surface', '--se-surface', 'Surface', 'Surfaces'],
    ['surface2', '--se-surface-2', 'Raised surface', 'Surfaces'],
    ['field', '--se-field', 'Field', 'Surfaces'],
    ['ink', '--se-bg-ink', 'Deepest ink', 'Surfaces'],
    ['hover', '--se-hover', 'Hover', 'States and lines'],
    ['selected', '--se-selected', 'Selected', 'States and lines'],
    ['track', '--se-track', 'Track', 'States and lines'],
    ['border', '--se-border-strong', 'Strong border', 'States and lines'],
    ['hairline', '--se-hairline', 'Hairline', 'States and lines'],
    ['divider', '--se-divider', 'Divider', 'States and lines'],
    ['strong', '--se-text-strong', 'Strong', 'Text'],
    ['text', '--se-text', 'Text', 'Text'],
    ['dim', '--se-text-dim', 'Dim', 'Text'],
    ['muted', '--se-text-muted', 'Muted', 'Text'],
    ['faint', '--se-text-faint', 'Faint', 'Text'],
    ['accent', '--se-color-accent', 'Accent', 'Accent'],
    ['onAccent', '--se-on-accent', 'On the accent', 'Accent'],
  ].map(([key, token, label, group]) => ({ key, token, label, group }));

  // Text colours and what they sit on, for the editor's contrast marks (WCAG AA, 4.5:1)
  const READ_ON = { strong: 'selected', text: 'surface2', dim: 'surface2', muted: 'selected', faint: 'surface2', onAccent: 'accent' };

  const LINES = { hairline: 'rgba(255, 255, 255, .06)', divider: 'rgba(255, 255, 255, .08)' };
  const PRESETS = [
    {
      v: 'enhanced', label: 'Enhanced', group: 'Neutral', colors: {
        bg: '#171a20', sidebar: '#1d2128', surface: '#1f242b', surface2: '#262c35', field: '#15181d', ink: '#0f1115',
        hover: '#2c3440', selected: '#33404f', track: '#3a424d', border: '#4a525e', ...LINES,
        strong: '#ffffff', text: '#e6e8eb', dim: '#b8c0c8', muted: '#a2acb7', faint: '#8994a2', accent: '#7cc4ff', onAccent: '#0f1115',
      },
    },
    {
      v: 'graphite', label: 'Graphite', group: 'Neutral', colors: {
        bg: '#1c1c1c', sidebar: '#202020', surface: '#262626', surface2: '#2e2e2e', field: '#161616', ink: '#0e0e0e',
        hover: '#333333', selected: '#3b3b3b', track: '#444444', border: '#555555', ...LINES,
        strong: '#ffffff', text: '#f3f3f3', dim: '#d6d6d6', muted: '#bdbdbd', faint: '#9a9a9a', accent: '#60cdff', onAccent: '#001a28',
      },
    },
    {
      v: 'nebula', label: 'Nebula', group: 'Cool', colors: {
        bg: '#0d0f1e', sidebar: '#12152b', surface: '#151833', surface2: '#1d2142', field: '#0a0c18', ink: '#07081a',
        hover: '#232852', selected: '#2c315e', track: '#343a6b', border: '#454c80', ...LINES,
        strong: '#ffffff', text: '#e8e9ff', dim: '#c3c6ee', muted: '#a9add6', faint: '#8b90bf', accent: '#a493ff', onAccent: '#120b33',
      },
    },
    {
      v: 'mono', label: 'Mono', group: 'Neutral', colors: {
        bg: '#111111', sidebar: '#151515', surface: '#191919', surface2: '#212121', field: '#0c0c0c', ink: '#0a0a0a',
        hover: '#282828', selected: '#303030', track: '#3a3a3a', border: '#4a4a4a', ...LINES,
        strong: '#ffffff', text: '#e8e8e8', dim: '#c4c4c4', muted: '#a6a6a6', faint: '#8c8c8c', accent: '#ececec', onAccent: '#111111',
      },
    },
    {
      v: 'tonal', label: 'Tonal', group: 'Cool', colors: {
        bg: '#141218', sidebar: '#19171d', surface: '#1d1b20', surface2: '#2b2930', field: '#0f0d13', ink: '#0d0b10',
        hover: '#36333d', selected: '#4a4458', track: '#49454f', border: '#5b5763', ...LINES,
        strong: '#ffffff', text: '#e6e0e9', dim: '#ddd7e0', muted: '#cac4d0', faint: '#a49eac', accent: '#d0bcff', onAccent: '#381e72',
      },
    },
    {
      v: 'ember', label: 'Ember', group: 'Warm', colors: {
        bg: '#1a1614', sidebar: '#1e1a18', surface: '#241f1c', surface2: '#2e2926', field: '#120f0e', ink: '#0a0908',
        hover: '#37312d', selected: '#413b37', track: '#4d4742', border: '#625b56', ...LINES,
        strong: '#ffffff', text: '#f2e6dc', dim: '#c9beb6', muted: '#b0a69f', faint: '#9a918a', accent: '#ffb366', onAccent: '#100d0c',
      },
    },
    {
      v: 'forest', label: 'Forest', group: 'Warm', colors: {
        bg: '#121815', sidebar: '#161c19', surface: '#1a221e', surface2: '#242c28', field: '#0d110f', ink: '#070a08',
        hover: '#2b3430', selected: '#353e39', track: '#414a45', border: '#545e59', ...LINES,
        strong: '#ffffff', text: '#dcebe2', dim: '#b5c3bb', muted: '#9eaba4', faint: '#89968e', accent: '#7fd8a6', onAccent: '#0b0e0d',
      },
    },
    {
      v: 'abyss', label: 'Abyss', group: 'Cool', colors: {
        bg: '#0b1619', sidebar: '#0e1b1f', surface: '#122126', surface2: '#1c2b30', field: '#080f12', ink: '#04090a',
        hover: '#243338', selected: '#2e3e42', track: '#394a4e', border: '#4d5e63', ...LINES,
        strong: '#ffffff', text: '#d7eef0', dim: '#b0c5c8', muted: '#96abae', faint: '#819598', accent: '#5fe1e8', onAccent: '#070d0f',
      },
    },
    {
      v: 'rosewood', label: 'Rosewood', group: 'Warm', colors: {
        bg: '#1a1316', sidebar: '#1f171a', surface: '#251b20', surface2: '#2f252a', field: '#120d0f', ink: '#0a0809',
        hover: '#372d32', selected: '#41363c', track: '#4e4247', border: '#62565b', ...LINES,
        strong: '#ffffff', text: '#f0dfe5', dim: '#c7b8be', muted: '#afa0a5', faint: '#9b8c91', accent: '#ff8fab', onAccent: '#100b0d',
      },
    },
    {
      v: 'slate', label: 'Slate', group: 'Neutral', colors: {
        bg: '#1b1f24', sidebar: '#1e2328', surface: '#22272e', surface2: '#2b3038', field: '#131619', ink: '#0b0c0e',
        hover: '#33383f', selected: '#3c4149', track: '#474d54', border: '#5a6067', ...LINES,
        strong: '#ffffff', text: '#dde4ec', dim: '#b8bec6', muted: '#a8afb7', faint: '#9399a1', accent: '#8fb3d9', onAccent: '#101316',
      },
    },
    {
      v: 'midnight', label: 'Midnight', group: 'Cool', colors: {
        bg: '#090c14', sidebar: '#0c1019', surface: '#10151f', surface2: '#1a1f2a', field: '#06080e', ink: '#040508',
        hover: '#232832', selected: '#2d323d', track: '#393f4a', border: '#4e545f', ...LINES,
        strong: '#ffffff', text: '#dfe6f5', dim: '#b6bcca', muted: '#959ca9', faint: '#828894', accent: '#4d9fff', onAccent: '#05070c',
      },
    },
    {
      v: 'sand', label: 'Sand', group: 'Warm', colors: {
        bg: '#1c1a17', sidebar: '#201e1b', surface: '#26231f', surface2: '#302d29', field: '#141210', ink: '#0b0a09',
        hover: '#383530', selected: '#423f3a', track: '#4e4a45', border: '#625e58', ...LINES,
        strong: '#ffffff', text: '#eee8de', dim: '#c6c1b8', muted: '#b1aca4', faint: '#9a958e', accent: '#e6c07b', onAccent: '#11100e',
      },
    },
    {
      v: 'void', label: 'Void', group: 'Neutral', colors: {
        bg: '#000000', sidebar: '#000000', surface: '#0a0a0a', surface2: '#141414', field: '#000000', ink: '#000000',
        hover: '#1c1c1c', selected: '#262626', track: '#303030', border: '#3d3d3d', ...LINES,
        strong: '#ffffff', text: '#e6e6e6', dim: '#bababa', muted: '#929292', faint: '#7f7f7f', accent: '#ffffff', onAccent: '#000000',
      },
    },
  ];
  const presetOf = (v) => PRESETS.find((preset) => preset.v === v) || PRESETS[0];

  // A Custom palette as kept: every token a colour, any missing one from `base`
  const fillPalette = (colors, base = PRESETS[0].colors) => {
    const out = {};
    for (const { key } of PALETTE_TOKENS) {
      const value = typeof colors?.[key] === 'string' ? colors[key].trim() : '';
      out[key] = COLOUR.test(value) ? value.toLowerCase() : base[key];
    }
    return out;
  };

  /*
   * Each setting: key, tab, label, hint, and its choices (the first is the default; type 'multi':
 * any of them on, all by default).
 * section: the heading its tab groups it under; requires: [[key, value], ...] the settings it
 * applies with (the window dims it otherwise); visual: its choices drawn as pictures
 * (client/settings/theme/theme-settings.css); hide (multi): a selector, % standing for a choice,
 * whose matches go while that choice is off (client/loader.js applyOptions). scope says
   * where its stylesheets go: client windows (the default), web pages, or both. from: its name in
   * Millennium's old Conditions. The palette's choices are the presets and Custom (its colours
   * under the key 'palette-custom').
   */
  const SCHEMA = [
    {
      key: 'font', tab: 'Appearance', label: 'Font', from: 'Font', scope: 'both',
      hint: 'The typeface everywhere, web pages too.',
      values: [
        opt('sn-pro', 'SN Pro'),
        opt('xmind', 'Xmind', 'options/appearance/font-xmind.css'),
        opt('motiva', 'Motiva Sans', 'options/appearance/font-motiva-sans.css', 'Steam (Motiva Sans)'),
      ],
    },
    {
      key: 'palette', tab: 'Appearance', label: 'Colours', type: 'palette',
      hint: 'A colour preset, or Custom to set each colour yourself. Client windows and web pages.',
      values: [...PRESETS.map((preset) => opt(preset.v, preset.label)), opt('custom', 'Custom')],
    },
    {
      key: 'corners', tab: 'Appearance', label: 'Corners', from: 'Corners', scope: 'both',
      hint: 'How rounded corners are, everywhere.',
      values: [opt('default', 'Default'), opt('sharp', 'Sharp', 'options/appearance/corners-sharp.css'), opt('round', 'Round', 'options/appearance/corners-round.css')],
    },
    {
      key: 'glass', tab: 'Appearance', label: 'Glass effects', from: 'Glass effects', scope: 'both',
      hint: 'The frosted blur behind panels and bars. Off is lighter on slower PCs.',
      values: [opt('on', 'On'), opt('off', 'Off', 'options/appearance/glass-off.css')],
    },
    {
      key: 'contrast', tab: 'Appearance', label: 'Contrast', scope: 'both',
      hint: 'High: brighter secondary text and stronger lines.',
      values: [opt('standard', 'Standard'), opt('high', 'High', 'options/appearance/contrast-high.css')],
    },
    {
      key: 'game-art', tab: 'Appearance', label: 'Game art',
      hint: "The game's art behind the top of a dialog and of Game Properties.",
      values: [opt('on', 'On'), opt('off', 'Off', 'options/appearance/game-art-off.css')],
    },
    {
      key: 'motion', tab: 'Appearance', label: 'Animations', from: 'Animations', scope: 'both',
      hint: 'Reduced: hovers and panels change at once; spinners still play.',
      values: [opt('full', 'Full'), opt('reduced', 'Reduced', 'options/appearance/motion-reduced.css')],
    },
    {
      key: 'click-opens', section: 'Clicks and menus', tab: 'Navigation', label: 'Click opens',
      hint: 'Store, Library, Community, Profile, Friends, Downloads. A right-click opens the other.',
      values: [opt('menu', 'Menu'), opt('page', 'Page')],
    },
    {
      key: 'menu-hover', section: 'Clicks and menus', tab: 'Navigation', label: 'Menus open on hover',
      hint: 'A rail menu opens when the pointer rests on its button.',
      values: [opt('off', 'Off'), opt('on', 'On')],
    },
    {
      key: 'hover-delay', section: 'Clicks and menus', requires: [['menu-hover', 'on']], tab: 'Navigation', label: 'Hover delay',
      hint: 'How long the pointer rests before the menu opens.',
      values: [
        opt('short', 'Short', 'options/navigation/hover-short.css'), opt('default', 'Default'),
        opt('long', 'Long', 'options/navigation/hover-long.css'),
      ],
      def: 'default',
    },
    {
      key: 'rail-buttons', section: 'Rail', tab: 'Navigation', label: 'Rail buttons', type: 'multi',
      hint: 'Shown on the rail; the rest close up. Settings and your avatar always stay.',
      values: [
        opt('store', 'Store'), opt('library', 'Library'), opt('community', 'Community'),
        opt('profile', 'Profile'), opt('alerts', 'Alerts'), opt('news', 'News'), opt('games', 'Games'),
        opt('downloads', 'Downloads'),
      ],
    },
    {
      key: 'rail-labels', section: 'Rail', tab: 'Navigation', label: 'Rail labels',
      hint: "Each rail button's name under its icon.",
      values: [opt('off', 'Off'), opt('on', 'On', 'options/appearance/rail-labels.css')],
    },
    {
      key: 'avatar-name', section: 'Rail', tab: 'Navigation', label: 'Name under avatar',
      hint: 'Your name under the avatar at the foot of the rail.',
      values: [opt('on', 'On'), opt('off', 'Off', 'options/navigation/avatar-name-off.css')],
    },
    {
      key: 'game-count', section: 'Title bar', tab: 'Navigation', label: 'Game count',
      hint: "How many games the Library shows, under the theme's name.",
      values: [opt('on', 'On'), opt('off', 'Off', 'options/navigation/game-count-off.css')],
    },
    {
      key: 'entrance', section: 'Entrance', visual: true, tab: 'Startup', label: 'Window entrance', from: 'Window entrance',
      hint: "How a window appears once loaded. Splash is the main window's; others use Logo.",
      values: [
        opt('splash', 'Splash'), opt('logo', 'Logo'),
        opt('fade', 'Fade'), opt('none', 'None'),
      ],
    },
    {
      key: 'splash-when', section: 'Entrance', requires: [['entrance', 'splash']], tab: 'Startup', label: 'Show splash',
      hint: 'Other starts use Logo.',
      values: [opt('every', 'Every start'), opt('daily', 'Once a day'), opt('first', 'First start only')],
    },
    {
      key: 'startup-wait', section: 'Loading', tab: 'Startup', label: 'Wait for Library',
      hint: 'Until ready holds the window until the Library settles (up to 3 s).',
      values: [opt('ready', 'Until ready'), opt('now', 'At once')],
    },
    {
      key: 'splash-art', section: 'Entrance', requires: [['entrance', 'splash']], tab: 'Startup', label: 'Splash art',
      hint: 'The game the splash shows.',
      values: [opt('last', 'Last played'), opt('random', 'Random recent'), opt('none', 'None')],
    },
    {
      key: 'startup-background', section: 'Background', visual: true, tab: 'Startup', label: 'Startup background', from: 'Startup background',
      hint: 'Behind the sign-in and startup screens.',
      values: [
        opt('aurora', 'Aurora'), opt('library', 'Library', 'options/startup/background-library.css'),
        opt('mosaic', 'Mosaic', 'options/startup/background-mosaic.css'), opt('wall', 'Wall', 'options/startup/background-wall.css'),
        opt('plain', 'Plain', 'options/startup/background-plain.css'), opt('dots', 'Dots', 'options/startup/background-dots.css'),
        opt('steam', 'Steam', 'options/startup/background-steam.css'),
      ],
    },
    {
      key: 'background-motion', section: 'Background', tab: 'Startup', label: 'Background motion',
      hint: 'Still is lighter on slower PCs.',
      values: [opt('animated', 'Animated'), opt('still', 'Still', 'options/startup/background-still.css')],
    },
    {
      key: 'spinner', section: 'Loading', visual: true, tab: 'Startup', label: 'Loading spinner', from: 'Loading spinner', scope: 'both',
      hint: 'Everywhere: client windows, the splash and web pages.',
      values: [
        opt('refined', 'Refined'), opt('comet', 'Comet', 'options/startup/spinner-comet.css'),
        opt('elastic', 'Elastic', 'options/startup/spinner-elastic.css'), opt('breathe', 'Breathe', 'options/startup/spinner-breathe.css'),
        opt('classic', 'Classic', 'options/startup/spinner-classic.css'),
      ],
    },
    {
      key: 'game-sections', section: 'Game page', tab: 'Library', label: 'Game page sections', type: 'multi',
      hint: "Shown on a game's page; the rest go.",
      hide: '[data-se-sec="%"]', // client/game-page/layout.js tags each section
      values: [
        opt('achievements', 'Achievements'), opt('friends', 'Friends who play'), opt('activity', 'Activity'),
        opt('screenshots', 'Screenshots'), opt('cards', 'Trading cards'), opt('dlc', 'DLC'),
        opt('workshop', 'Workshop'), opt('review', 'My review'), opt('notes', 'Notes'),
      ],
    },
    {
      key: 'rarity-tiers', section: 'Game page', tab: 'Library', label: 'Rarity tiers',
      hint: 'Achievements grouped by rarity (Legendary to Common); Off shows the plain % of players.',
      values: [opt('on', 'On'), opt('off', 'Off')],
    },
    {
      key: 'game-list-icons', section: 'Game list', tab: 'Library', label: 'Game icons',
      hint: "Each game's small icon before its name in the list.",
      values: [opt('on', 'On'), opt('off', 'Off', 'options/library/game-icons-off.css')],
    },
    {
      key: 'game-list-width', section: 'Game list', tab: 'Library', label: 'Game list width', from: 'Game list width',
      hint: "Adjustable: drag the list's right edge (double-click resets).",
      values: [opt('fixed', 'Fixed'), opt('adjustable', 'Adjustable', 'options/library/game-list-adjustable.css')],
    },
    {
      key: 'dock-start', section: 'Dock', tab: 'Friends', label: 'Dock at startup',
      hint: 'How the Friends dock starts each time Steam does.',
      values: [opt('last', 'As left'), opt('open', 'Open'), opt('folded', 'Folded')],
    },
    {
      key: 'dock-width', section: 'Dock', tab: 'Friends', label: 'Friends dock width', from: 'Friends dock width',
      hint: "Adjustable: drag the dock's left edge (double-click resets).",
      values: [opt('fixed', 'Fixed'), opt('adjustable', 'Adjustable', 'options/friends/dock-adjustable.css')],
    },
    {
      key: 'chat-open', section: 'Chats', tab: 'Friends', label: 'Chats open in',
      hint: "Dock: a chat opens beside the dock. Window: in Steam's own chat window.",
      values: [opt('dock', 'Dock'), opt('window', 'Window')],
    },
    {
      key: 'hover-cards', section: 'Friend cards', tab: 'Friends', label: 'Friend cards',
      hint: "A friend's card when the pointer rests on them: the dock, the friends list, Home.",
      values: [opt('on', 'On'), opt('off', 'Off')],
    },
    {
      key: 'hover-card-delay', section: 'Friend cards', requires: [['hover-cards', 'on']], tab: 'Friends',
      label: 'Card delay', hint: 'How long the pointer rests before the card shows.',
      values: [
        opt('short', 'Short', 'options/friends/card-delay-short.css'), opt('default', 'Default'),
        opt('long', 'Long', 'options/friends/card-delay-long.css'),
      ],
      def: 'default',
    },
    {
      key: 'profile-backgrounds', section: 'Friend cards', tab: 'Friends', label: 'Profile backgrounds',
      hint: "Friends' profile backgrounds in cards, dialogs and toasts. Still and Off save bandwidth.",
      values: [
        opt('video', 'Video'), opt('still', 'Still', 'options/friends/backgrounds-still.css'),
        opt('off', 'Off', 'options/friends/backgrounds-off.css'),
      ],
    },
    {
      key: 'toasts', section: 'Toasts', visual: true, tab: 'Toasts', label: 'Restyle toasts', from: 'Notification toasts',
      hint: "Steam's notification toasts in the theme's design.",
      values: [ON, off('options/toasts/off.css')],
    },
    {
      key: 'toasts-in-game', section: 'Toasts', visual: true, requires: [['toasts', 'on']], tab: 'Toasts', label: 'Toasts in game', from: 'Toasts in game',
      hint: 'Show the restyled toasts while a game is running.',
      values: [ON, off('options/toasts/in-game-off.css')],
    },
    {
      key: 'toast-style', section: 'Look', visual: true, requires: [['toasts', 'on']], tab: 'Toasts', label: 'Toast style', from: 'Toast style',
      hint: "Stage: one card at the bottom centre. Compact: Steam's toasts, restyled.",
      values: [opt('stage', 'Stage'), opt('compact', 'Compact', 'options/toasts/style-compact.css')],
    },
    {
      key: 'toast-position', section: 'Look', visual: true, requires: [['toasts', 'on'], ['toast-style', 'compact']], tab: 'Toasts', label: 'Compact toast position', from: 'Compact toast position',
      hint: "The centre of the screen edge, or Steam's corner.",
      values: [opt('centre', 'Centre'), opt('corner', 'Corner', 'options/toasts/position-corner.css')],
    },
    {
      key: 'stage-position', section: 'Look', visual: true, requires: [['toasts', 'on'], ['toast-style', 'stage']],
      tab: 'Toasts', label: 'Stage position', hint: "Where the Stage card sits: the screen's bottom or top centre.",
      values: [opt('bottom', 'Bottom'), opt('top', 'Top', 'options/toasts/stage-top.css')],
    },
    {
      key: 'toast-ach-art', section: 'Look', visual: true, requires: [['toasts', 'on'], ['toast-style', 'stage']],
      tab: 'Toasts', label: 'Achievement art', hint: "Behind an achievement toast: the game's art, or the achievement's icon.",
      values: [opt('game', 'Game art'), opt('icon', 'Icon only')],
    },
    {
      key: 'toast-hover', section: 'Timing', requires: [['toasts', 'on']], tab: 'Toasts', label: 'Pause on hover',
      hint: 'A toast you point at waits until the pointer leaves.',
      values: [opt('on', 'On'), opt('off', 'Off', 'options/toasts/hover-off.css')],
    },
    {
      key: 'toast-time', section: 'Timing', requires: [['toasts', 'on']], tab: 'Toasts',
      label: 'How long toasts stay', hint: "Each toast's time on screen, against Steam's own.",
      values: [opt('steam', "Steam's"), opt('shorter', 'Shorter'), opt('longer', 'Longer')],
    },
    {
      key: 'toast-queue', section: 'Timing', visual: true, requires: [['toasts', 'on'], ['toast-style', 'stage']],
      tab: 'Toasts', label: 'Queue', hint: 'The toasts waiting behind the Stage card.',
      values: [
        opt('strip', 'Thumbnails'), opt('count', 'Count only', 'options/toasts/queue-count.css'),
        opt('hidden', 'Hidden', 'options/toasts/queue-hidden.css'),
      ],
    },
    {
      key: 'overlay', section: 'Look', visual: true, tab: 'Overlay', label: 'Restyle the overlay', from: 'In-game overlay restyle',
      hint: "The in-game overlay in the theme's design, from its next opening.",
      values: [ON, off('options/overlay/restyle-off.css')],
    },
    {
      key: 'overlay-darkness', section: 'Look', visual: true, requires: [['overlay', 'on']], tab: 'Overlay', label: 'Overlay darkness', from: 'Overlay darkness',
      hint: 'The backdrop behind the overlay. Its own Darkness slider overrides it.',
      values: [opt('default', 'Default'), opt('light', 'Light', 'options/overlay/darkness-light.css'), opt('dark', 'Dark', 'options/overlay/darkness-dark.css')],
    },
    {
      key: 'overlay-open', section: 'Opening', requires: [['overlay', 'on']], tab: 'Overlay', label: 'Opens on',
      hint: 'The view the overlay shows each time it opens.',
      values: [
        opt('overview', 'Overview'), opt('achievements', 'Achievements'), opt('friends', 'Friends'),
        opt('last', 'Last view'),
      ],
    },
    {
      key: 'overlay-ach-tab', section: 'Opening', requires: [['overlay', 'on']], tab: 'Overlay',
      label: 'Achievements open on', hint: "The achievements view's first tab.",
      values: [opt('progress', 'In progress'), opt('unlocked', 'Unlocked'), opt('locked', 'Locked')],
    },
    {
      key: 'overlay-panels', section: 'Overview', requires: [['overlay', 'on']], tab: 'Overlay',
      label: 'Overview panels', type: 'multi', hint: "Shown on the overlay's overview; the rest go.",
      hide: '[data-sec="%"]', // client/overlay/dom.js buildSection
      values: [
        opt('achievements', 'Achievements'), opt('friends', 'Friends'), opt('screenshots', 'Screenshots'),
        opt('guides', 'Guides'), opt('news', 'News'),
      ],
    },
    {
      key: 'overlay-views', section: 'Overview', requires: [['overlay', 'on']], tab: 'Overlay',
      label: 'Views', type: 'multi', hint: "The overlay rail's views shown; the rest go.",
      hide: '[data-view="%"]', // client/overlay/dom.js: a view's tab and its panel
      values: [
        opt('remote', 'Remote Play'), opt('notes', 'Notes'), opt('controller', 'Controller'),
        opt('browser', 'Browser'),
      ],
    },
    {
      key: 'overlay-clock', section: 'Header', requires: [['overlay', 'on']], tab: 'Overlay', label: 'Clock',
      hint: "The time of day in the overlay's header (its timer too).",
      values: [
        opt('auto', 'Auto'), opt('12', '12-hour'), opt('24', '24-hour'),
        opt('off', 'Off', 'options/overlay/clock-off.css'),
      ],
    },
    {
      key: 'overlay-playtime', section: 'Header', requires: [['overlay', 'on']], tab: 'Overlay', label: 'Play time',
      hint: 'This session, total and the last 2 weeks, in the header.',
      values: [opt('on', 'On'), opt('off', 'Off', 'options/overlay/playtime-off.css')],
    },
    {
      key: 'web-sites', section: 'Sites', tab: 'Web pages', label: 'Themed sites', type: 'multi',
      hint: "The sites in the theme's design; the rest as Steam draws them, from their next page.",
      values: [
        opt('store', 'Store'), opt('community', 'Community'), opt('help', 'Support'),
        opt('checkout', 'Checkout'),
      ],
    },
    {
      key: 'page-width', section: 'Layout', scope: 'web', tab: 'Web pages', label: 'Page width',
      hint: 'How wide Store and Community pages run on a wide screen.',
      values: [
        opt('default', 'Default'), opt('comfortable', 'Comfortable', 'options/web/width-comfortable.css'),
        opt('wide', 'Edge to edge', 'options/web/width-wide.css'),
      ],
    },
  ];
  // A 'multi' setting is a set of the choices turned on (all by default), kept in list order
  for (const item of SCHEMA) item.def ??= item.type === 'multi' ? item.values.map((c) => c.v) : item.values[0].v;
  const TABS = [...new Set(SCHEMA.map((item) => item.tab))];
  const byKey = new Map(SCHEMA.map((item) => [item.key, item]));

  const valid = (item, value) =>
    item.type === 'multi'
      ? Array.isArray(value) && value.every((v) => item.values.some((choice) => choice.v === v))
      : item.values.some((choice) => choice.v === value);
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

  // What's kept: the values not at their default, the stylesheets they switch on and the
  // palette's tokens (none for Enhanced: tokens.css holds it)
  const pack = (values) => {
    const kept = {};
    const client = [];
    const web = [];
    for (const item of SCHEMA) {
      const value = values[item.key];
      if (!valid(item, value) || same(value, item.def)) continue;
      kept[item.key] = value;
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
        if (!kept[item.key].includes(choice.v)) hide.push(item.hide.replace('%', choice.v));
      }
    }
    return { values: kept, client, web, vars, hide };
  };

  const listeners = new Set();
  let destroyed = false;

  // Rarity tiers: SE.rarity (core/runtime.js) gives no tier while the setting is off
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

  const OLD_ENTRANCE_KEY = 'se-entrance'; // the loader's copy of the entrance, before this file

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
