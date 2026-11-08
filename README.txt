STEAM ENHANCED
Author: NVHT

Millennium theme for the Steam desktop client. Restyles the Library, game
details, navigation, Friends & Chat, settings, downloads, startup, and modal
dialogs while keeping Steam's React tree and native state management intact.

REQUIREMENTS & INSTALLATION

Requires the Steam desktop client and Millennium with theme JavaScript enabled.
Optional: HLTB for Millennium (provides completion times through its backend).
Keep the plugin enabled. Its Show in Library option can be turned off because
Steam Enhanced reads GetHltbData directly. No separate API helper is required.

1. Exit Steam completely.
2. Extract the archive into `<Steam>/steamui/skins/` so the manifest sits at:
   `<Steam>/steamui/skins/Steam-Enhanced/skin.json`
3. Launch Steam, open Millennium -> Themes, and select Steam Enhanced.
4. Enable theme JavaScript and restart Steam.

When updating, remove or back up the previous `Steam-Enhanced` directory while
Steam is closed before extracting the new release. Merging directories in place
can leave stale scripts or stylesheets behind.

OVERVIEW

- Steam Enhanced branding: the theme's logo on the Steam menu button, the startup
  screen, the account chooser, the sign-in window and the loading spinners.
- Navigation rail, consolidated root menu, title-bar library search, and header
  quick actions. Restart Steam and Reload UI appear above Exit in the Steam menu.
- Library Home hero stage with a glass tray for What's New, Favorites, and
  Collections.
- Unified Collection and All Collections views with grid/list switching and
  summary banners.
- Game list drag and drop: a compact game chip as the drag image, the dragged
  row dimmed, and Steam's drop zones drawn as the theme's cards that light up
  under the pointer.
- Independent two-column game pages with custom HLTB progress bars, full-width
  achievement rows, full DLC grids, friend activity tabs, and media carousels.
- Achievement rarity tiers (Legendary, Epic, Rare, Uncommon, Common) by global
  unlock rate: sparkles, aura, and the tier's initial on each icon, plus a
  progress banner that turns into a gold "Mastered" banner at 100%.
- Right-hand Friends dock with native chat flyouts and matching standalone
  Friends & Chat windows.
- Restyled Steam Settings, App Properties, Millennium Settings popup, and
  Millennium Library Manager modal.
- About Steam rebuilt with the theme's brand panel and Steam's details as
  tiles: click a tile to copy it, or Copy all for bug reports.
- Master-detail Downloads view with live progress telemetry.
- Custom startup progress strip, configurable startup backgrounds, and unified
  loading spinners.
- In-game overlay restyled in the Steam Enhanced look, keeping Steam's own
  layout.

IN-GAME OVERLAY

- Steam's overlay layout is kept: the clock and session stats, the game logo,
  Back to Game, and the toolbar stay where Steam puts them, in any toolbar
  location (including list view).
- The top-left corner becomes a game card: the clock and date, the game
  logo, playtime this session / total / last two weeks, and Back to game and
  Exit game buttons in the theme's button style.
- Under the buttons: Achievements (unlocked / total, the closest ones to
  unlocking, or the latest unlocks) and Friends (in-game now, played
  recently). Click the Achievements header to open Steam's Achievements
  widget, or an avatar to open a chat with that friend.
- The toolbar becomes one rounded bar. Open widgets are marked with an accent
  line instead of Steam's blue button.
- Exit Game, Back to Game, and the Timeline hint use the theme's colours and
  type. The backdrop is a softer theme-tinted dim.
- Widget windows (Game Overview, Achievements, Guides, ...) get the theme's
  window chrome, and Game Overview sections become cards.

FRIENDS & CHAT

Header button:
- Left-click toggles the Friends dock.
- Right-click opens Steam's standalone Friends & Chat window.
- Dock state persists across restarts; hiding the dock keeps open chat tabs
  mounted.

Friends dock:
- Collapse switches the dock to a 60px avatar and active-game rail.
- Clicking your own avatar in the rail expands the full list.
- Clicking a friend opens their native chat in an adjacent flyout.
- Store and Community pages host the same flyout via a native context popup
  without spawning a separate OS taskbar window.

Chat flyout:
- Use the flyout controls to minimize or close the conversation. Closing the
  last tab closes the flyout.
- Selecting an open conversation activates it. Clicking elsewhere leaves the
  flyout open.
- Library, Store, and Community share the same conversation tabs and minimized pill.
- Steam startup and reload skip reopening desktop Friends & Chat windows.

NOTIFICATIONS & ACCOUNT MENU

Hovering the notification bell opens the menu when unread/recent items exist,
or displays a native tooltip when the tray is empty. Notifications are grouped
by day below a consolidated summary card.

The account avatar menu exposes profile actions, Do Not Disturb, and an Online
Status submenu.

CONFIGURATION (shared/tokens.css)

All palette colors, radii, elevations, control heights, and feature toggles
live on `:root` in `shared/tokens.css`. Restart Steam after editing tokens.

`--se-startup-background` (default: `library`)
  `library`  Wireframe outline of the themed Library window (no cached art required).
  `hero`     Crossfading hero artwork from your 8 most recently played games.
  `mosaic`   Breathing 2:3 tile grid over Steam's login capsule wall.
  `wall`     Blurred, dimmed login capsule wall.
  `plain`    Solid theme background with a subtle radial glow.
  `dots`     Fading dot matrix over the base background.
  `steam`    Unmodified native Steam login background.

`--se-spinner` (default: `sweep`)
  `sweep`    Conic arc with a glowing lead dot around the Steam Enhanced mark.
  `deck`     Three game covers shuffling front-to-back.
  `flip`     Two-sided card flipping through recent game covers.
  `stack`    Four game covers dropping onto a stack.
  `ring`     Solid accent arc around the Steam Enhanced mark.
  `steam`    Unmodified native Steam throbber.
  (Spinners smaller than 40px automatically fall back to `sweep`.)

`--se-home-stage` (default: `on`)
  Set to `off` to restore Steam's default Library Home layout (useful when
  adding or reordering shelves).

`--se-home-stage-cycle` (default: `9`)
  Seconds between hero stage transitions. Set to `0` to disable auto-cycling.

`--se-home-stage-tray` (default: `30`)
  Minimum viewport height percentage reserved for the bottom glass tray (0-70).

`--se-overlay` (default: `on`)
  Set to `off` to restore Steam's default in-game overlay look.

`--se-overlay-dim` (default: `0.9`)
  Backdrop darkness behind the overlay (0-1).

DIRECTORY LAYOUT

  skin.json       Millennium manifest and window match rules.
  shared/         Core runtime (`SE`), design tokens, icon masks, scrollbars.
  features/       Feature scripts and stylesheets grouped by client surface.
  compatibility/  Standalone styles for webview contexts (`webkit.css`).
  branding/       Logo sources and the Millennium store header and splash images.
  tools/          CSS module hash indexer and rehash utility (`classmap.py`).

MAINTENANCE & TROUBLESHOOTING

- If the theme does not appear in Millennium, verify that `skin.json` sits at
  `steamui/skins/Steam-Enhanced/skin.json`.
- If interactive features are missing, ensure theme JavaScript is enabled in
  Millennium settings.
- When a Steam client update rotates CSS module hashes, run:
  `python3 tools/classmap.py rehash <path-to-extracted-steamui> .`
