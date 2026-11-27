/*
 * The theme's settings, part 2 of 3 (client/shared/settings.js names what they do), listed between
 * settings-palette.js and settings.js: the schema, every setting and its choices. Shared with
 * settings.js on window.__seSettingsSchemaParts.
 */
((SE) => {
  // The palette's presets (settings-palette.js, listed just before)
  const { PRESETS } = window.__seSettingsPaletteParts || {};
  if (!PRESETS) return;

  // A choice: its value, its label, the option stylesheet it switches on (none for the
  // default) and its name in Millennium's old Conditions (`from`, for the first run)
  const opt = (v, label, file = null, from = label) => ({ v, label, file, from });
  const ON = opt('on', 'On', null, 'yes');
  const off = (file) => opt('off', 'Off', file, 'no');

  /*
   * Each setting: key, tab, label, hint, and its choices. def: its default, else the first
   * choice (type 'multi': any of them on, all by default; type 'text': a string).
   * section: the heading its tab groups it under; requires: [[key, value], ...] the settings it
   * applies with (the window hides it otherwise, and a section left empty; a 'multi' setting holds
   * a value while that choice is on);
   * visual: its choices drawn as pictures
   * (client/settings/theme/theme-settings.css); hide (multi): a selector, % standing for a
   * choice (or { choice: selector }, a Steam class through SE.C), whose matches go while that choice is off (client/loader.js applyOptions); type
   * 'text': a kept string, no choices, drawn as a button opening the theme's picker (picker: its
   * choices, client/settings/theme/theme-settings.js PICKERS). scope says where its stylesheets
   * go: client windows (the default), web pages, or both. from: its name in Millennium's old
   * Conditions. The palette's choices are the presets and Custom (its colours under the key
   * 'palette-custom').
   */
  // What's New's settings apply while Steam's Home shows it
  const WHATS_NEW_SHOWN = [['home', 'steam'], ['steam-home-parts', 'whatsnew']];

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
      values: [
        opt('square', 'Square', 'options/appearance/corners-square.css'), opt('sharp', 'Sharp', 'options/appearance/corners-sharp.css'),
        opt('default', 'Default'), opt('round', 'Round', 'options/appearance/corners-round.css'),
      ],
      def: 'default',
    },
    {
      key: 'contrast', tab: 'Appearance', label: 'Contrast', scope: 'both',
      hint: 'High: brighter secondary text and stronger lines.',
      values: [opt('standard', 'Standard'), opt('high', 'High', 'options/appearance/contrast-high.css')],
    },
    {
      key: 'motion', tab: 'Appearance', label: 'Animations', from: 'Animations', scope: 'both',
      hint: 'Reduced: hovers and panels change at once; spinners still play.',
      values: [opt('full', 'Full'), opt('reduced', 'Reduced', 'options/appearance/motion-reduced.css')],
    },
    {
      key: 'glass', tab: 'Appearance', label: 'Glass effects', from: 'Glass effects', scope: 'both',
      hint: 'The frosted blur behind panels and bars. Off is lighter on slower PCs.',
      values: [opt('on', 'On'), opt('off', 'Off', 'options/appearance/glass-off.css')],
    },
    {
      key: 'game-art', tab: 'Appearance', label: 'Game art',
      hint: "The game's art behind the top of a dialog and of Game Properties.",
      values: [opt('on', 'On'), opt('off', 'Off', 'options/appearance/game-art-off.css')],
    },
    {
      // Linux (XWayland, or X11 without a compositor) draws a popup window's transparent parts
      // black: the shadow's room and what's past the rounded corners. Solid there unless chosen otherwise.
      key: 'popups', tab: 'Appearance', label: 'Menu windows',
      hint: 'Solid: no shadow around menus in their own window, for Linux, where it shows black.',
      values: [opt('shadowed', 'Shadowed'), opt('solid', 'Solid', 'options/appearance/popups-solid.css')],
      def: /\bLinux\b/.test(navigator.userAgent) ? 'solid' : 'shadowed',
    },
    {
      key: 'menu-hints', tab: 'Appearance', label: 'Menu hints',
      hint: "The short line under each menu row's name.",
      values: [opt('on', 'On'), opt('off', 'Off', 'options/appearance/menu-hints-off.css')],
    },
    {
      key: 'click-opens', section: 'Clicks and menus', tab: 'Navigation', label: 'Click opens',
      hint: 'Store, Library, Community, Profile, Friends, Downloads. A right-click opens the other.',
      values: [opt('page', 'Page'), opt('menu', 'Menu')],
    },
    {
      key: 'menu-hover', section: 'Clicks and menus', tab: 'Navigation', label: 'Menus open on hover',
      hint: 'A rail menu, or the downloads card, opens when the pointer rests on its button.',
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
      key: 'shortcuts', section: 'Keyboard', tab: 'Navigation', label: 'Keyboard shortcuts',
      hint: "The theme's Ctrl shortcuts, such as Ctrl+R Reload UI, shown in the menus.",
      values: [opt('on', 'On'), opt('off', 'Off', 'options/navigation/shortcuts-off.css')],
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
      key: 'startup-wait', section: 'Entrance', tab: 'Startup', label: 'Wait for Library',
      hint: 'Until ready holds the window until the Library settles (up to 3 s).',
      values: [opt('ready', 'Until ready'), opt('now', 'At once')],
    },
    {
      key: 'splash-when', section: 'Entrance', requires: [['entrance', 'splash']], tab: 'Startup', label: 'Show splash',
      hint: 'Other starts use Logo.',
      values: [opt('every', 'Every start'), opt('daily', 'Once a day'), opt('first', 'First start only')],
    },
    {
      key: 'splash-art', section: 'Entrance', requires: [['entrance', 'splash'], ['home', 'theme']], tab: 'Startup', label: 'Splash art',
      // 'last': Home's first game. With Steam's Home there's no stage to land in: no art
      hint: "The game the splash shows. Home's game moves into the Home stage as it opens.",
      values: [opt('last', "Home's game"), opt('random', 'Random recent'), opt('none', 'None')],
    },
    {
      key: 'startup-background', section: 'Background', visual: true, tab: 'Startup', label: 'Startup background', from: 'Startup background',
      hint: 'Behind the sign-in and startup screens.',
      values: [
        opt('aurora', 'Aurora'), opt('library', 'Library'),
        opt('mosaic', 'Mosaic'), opt('wall', 'Wall'),
        opt('plain', 'Plain'), opt('dots', 'Dots'),
        opt('steam', 'Steam'),
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
      key: 'logo-place', section: 'Game page', tab: 'Library', label: 'Logo place',
      hint: "Centred above the play bar, or where Steam puts it: there Move and size the logo, in the art's right-click menu, places it.",
      values: [opt('centred', 'Centred', 'options/library/logo-centred.css'), opt('steam', "Steam's")],
    },
    {
      key: 'game-list-icons', section: 'Game list', tab: 'Library', label: 'Game icons',
      hint: "Each game's small icon before its name in the list.",
      values: [opt('on', 'On'), opt('off', 'Off', 'options/library/game-icons-off.css')],
    },
    {
      key: 'cover-chips', section: 'Covers', tab: 'Library', label: 'Status chips',
      hint: "A chip in each cover's corner: ready to play, not installed, or updating. Off: no marks, Steam's buttons too.",
      // client/library/cover-state.js draws them
      values: [opt('on', 'On'), opt('off', 'Off', 'options/library/cover-chips-off.css')],
    },
    {
      key: 'cover-chips-show', section: 'Covers', requires: [['cover-chips', 'on']], tab: 'Library', label: 'Show chips',
      hint: "On hover: a cover's chip shows while you point at it, as Steam's Deck badge does; a download's stays.",
      values: [opt('hover', 'On hover', 'options/library/cover-chips-hover.css'), opt('always', 'Always')],
    },
    {
      key: 'cover-friends', section: 'Covers', tab: 'Library', label: 'Friends playing',
      hint: "Friends in the game, as faces or a count in a cover's corner. Its hover card still lists them.",
      values: [opt('on', 'On'), opt('off', 'Off', 'options/library/cover-friends-off.css')],
    },
    {
      key: 'deck-badge-show', section: 'Covers', tab: 'Library', label: 'Steam Deck badge',
      hint: "How a game runs on Steam Deck, in a cover's corner. On hover: while you point at the cover, as Steam shows it.",
      values: [opt('hover', 'On hover'), opt('always', 'Always', 'options/library/deck-badge-always.css')],
    },
    {
      key: 'release-chips', section: 'Covers', tab: 'Library', label: 'Release chips',
      hint: "Coming soon, ready to pre-load, or new to your library, in a cover's top corner. Off: no mark, Steam's banner too.",
      values: [opt('on', 'On'), opt('off', 'Off')], // client/library/cover-state.js
    },
    {
      key: 'dim-uninstalled', section: 'Covers', tab: 'Library', label: 'Dim uninstalled games',
      hint: "Covers of games that aren't installed fade back until you point at one.",
      def: 'off',
      values: [opt('on', 'On', 'options/library/dim-uninstalled.css'), opt('off', 'Off')],
    },
    /*
     * Home: which Home shows, and the Home stage's own settings (client/home/stage/stage-settings.js,
     * whose menu, a right click on the title bar's Home switch, edits the same values).
     */
    {
      key: 'home', section: 'Home', visual: true, tab: 'Home', label: 'Home',
      hint: "The theme's stage and panels, or Steam's own Home.",
      values: [opt('theme', 'Stage'), opt('steam', "Steam's")],
    },
    {
      key: 'steam-home-parts', section: "Steam's Home", requires: [['home', 'steam']], tab: 'Home',
      label: 'Shown', type: 'multi', hint: "Parts of Steam's Home; the rest go.",
      // Steam's own classes (no stable attribute on them): What's New (its Updates container), and the
      // Add shelf row
      hide: { whatsnew: `.${SE.C.UpdatesContainer}`, addshelf: `.${SE.C.AddShowcaseRow}` },
      values: [opt('whatsnew', "What's New"), opt('addshelf', 'Add shelf')],
    },
    // What's New, its own group under Steam's Home (client/home/whats-new.css, options/home/)
    {
      key: 'whats-new-art', section: "What's New", requires: WHATS_NEW_SHOWN, tab: 'Home',
      label: 'Pictures', hint: 'Off: each news item as its title, game and date only.',
      values: [opt('on', 'On'), opt('off', 'Off', 'options/home/whats-new-art-off.css')],
    },
    {
      key: 'whats-new-summary', section: "What's New", requires: [...WHATS_NEW_SHOWN, ['whats-new-art', 'on']],
      tab: 'Home', label: 'Summary on hover', hint: "The news's summary, rising over its picture.",
      values: [opt('on', 'On'), opt('off', 'Off', 'options/home/whats-new-summary-off.css')],
    },
    {
      key: 'whats-new-cards', section: "What's New", requires: WHATS_NEW_SHOWN, tab: 'Home',
      label: 'Cards across', hint: 'How many news items fill the row, 6 at least. Auto: more on a wider window.',
      values: [
        opt('auto', 'Auto'), opt('6', '6', 'options/home/whats-new-6.css'), opt('8', '8', 'options/home/whats-new-8.css'),
        opt('10', '10', 'options/home/whats-new-10.css'),
      ],
    },
    {
      key: 'stage-source', section: 'Featured games', requires: [['home', 'theme']], tab: 'Home', label: 'Games',
      hint: 'What the stage features.',
      values: [opt('recent', 'Recent'), opt('favorites', 'Favorites'), opt('collection', 'Collection'), opt('added', 'Added')],
    },
    {
      key: 'stage-collection', section: 'Featured games', requires: [['home', 'theme'], ['stage-source', 'collection']],
      tab: 'Home', type: 'text', picker: 'collection', label: 'Collection', hint: 'The collection the stage features.',
      values: [], def: '',
    },
    {
      key: 'stage-count', section: 'Featured games', requires: [['home', 'theme']], tab: 'Home', label: 'How many',
      hint: 'Games the stage cycles through.',
      values: [opt('4', '4'), opt('6', '6'), opt('8', '8'), opt('10', '10')],
      def: '6',
    },
    {
      key: 'stage-details', section: 'Featured games', requires: [['home', 'theme']], tab: 'Home', label: 'Details',
      type: 'multi', hint: 'What the stage shows about a game.',
      values: [
        opt('logo', 'Logo'), opt('by', 'Developer'), opt('reviews', 'Reviews'), opt('live', 'Playing now'),
        opt('desc', 'Description'), opt('hours', 'Hours'), opt('ach', 'Achievements'), opt('last', 'Last played'),
      ],
    },
    {
      key: 'stage-nav', section: 'Switching games', requires: [['home', 'theme']], tab: 'Home', label: 'Game picker',
      hint: 'Under the stage: thumbnails, dots, or nothing.',
      values: [opt('thumbs', 'Thumbnails'), opt('dots', 'Dots'), opt('none', 'Hidden')],
    },
    {
      key: 'stage-cycle', section: 'Switching games', requires: [['home', 'theme']], tab: 'Home', label: 'Auto-switch',
      hint: 'How long each game stays before the next.',
      values: [opt('off', 'Off'), opt('slow', '15 s'), opt('normal', '9 s'), opt('fast', '5 s')],
      def: 'normal',
    },
    {
      key: 'stage-motion', section: 'Background art', visual: true, requires: [['home', 'theme']], tab: 'Home', label: 'Background',
      hint: 'Behind the featured game. Still with reduced motion.',
      values: [opt('zoom', 'Zoom'), opt('parallax', 'Parallax'), opt('shots', 'Screenshots'), opt('trailer', 'Trailer'), opt('still', 'Still')],
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
      key: 'offline-friends', section: 'Dock', tab: 'Friends', label: 'Offline friends',
      hint: "In the dock, open or folded: the Offline section and offline friends in your categories. The Friends window lists everyone.",
      values: [opt('hidden', 'Hidden', 'options/friends/offline-hidden.css'), opt('shown', 'Shown')],
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
      key: 'offline-members', section: 'Chats', tab: 'Friends', label: 'Offline group members',
      hint: "In a group chat's members list.",
      values: [opt('hidden', 'Hidden'), opt('shown', 'Shown')],
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
      values: [ON, off()],
    },
    {
      key: 'toasts-in-game', section: 'Toasts', visual: true, requires: [['toasts', 'on']], tab: 'Toasts', label: 'Toasts in game', from: 'Toasts in game',
      hint: 'Show the restyled toasts while a game is running.',
      values: [ON, off()],
    },
    {
      key: 'toast-style', section: 'Look', visual: true, requires: [['toasts', 'on']], tab: 'Toasts', label: 'Toast style', from: 'Toast style',
      hint: "Stage: one card at the bottom centre. Compact: Steam's toasts, restyled.",
      values: [opt('stage', 'Stage'), opt('compact', 'Compact')],
    },
    {
      key: 'toast-position', section: 'Look', visual: true, requires: [['toasts', 'on'], ['toast-style', 'compact']], tab: 'Toasts', label: 'Compact toast position', from: 'Compact toast position',
      hint: "The centre of the screen edge, or Steam's corner.",
      values: [opt('centre', 'Centre'), opt('corner', 'Corner')],
    },
    {
      key: 'stage-position', section: 'Look', visual: true, requires: [['toasts', 'on'], ['toast-style', 'stage']],
      tab: 'Toasts', label: 'Stage position', hint: "Where the Stage card sits: the screen's bottom or top centre, or the bottom-right corner.",
      values: [
        opt('bottom', 'Bottom'), opt('top', 'Top', 'options/toasts/stage-top.css'),
        opt('corner', 'Corner', 'options/toasts/stage-corner.css'),
      ],
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
      values: [ON, off()],
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
    {
      key: 'millennium-open', tab: 'Millennium', label: 'Settings open in',
      hint: 'Window: a window of its own. Overlay: a dialog over the client. Page: inside the main window, as Millennium does.',
      values: [opt('window', 'Window'), opt('overlay', 'Overlay'), opt('page', 'Page')],
    },
  ];
  // A 'multi' setting is a set of the choices turned on (all by default), kept in list order
  for (const item of SCHEMA) item.def ??= item.type === 'multi' ? item.values.map((c) => c.v) : item.values[0].v;

  window.__seSettingsSchemaParts = { SCHEMA };
})(window.__se);
