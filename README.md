<p align="center">
  <img src="branding/header.png" alt="Steam Enhanced: the Steam you always wanted" width="100%">
</p>

<h1 align="center">Steam Enhanced</h1>

<p align="center">
  <strong>The Steam you always wanted.</strong><br>
  A Millennium theme for the Steam desktop client by <strong>NVHT</strong>.
</p>

---

Steam Enhanced rebuilds the Steam client from the Library out: a navigation rail, a cinematic Home stage, two-column game pages with HowLongToBeat and achievement rarity, a Friends dock that never leaves the window, and a restyled in-game overlay. Steam's own interface still runs underneath. Its state, data and behaviour are untouched, so everything keeps working the way Steam intends. It just looks and feels the way it always should have.

## Highlights

### A Library that feels like home
<p align="center"><img src="branding/showcase/home.jpg" alt="Library Home with the hero stage, glass tray and Friends dock" width="100%"></p>

- **Hero Home stage.** Your recently played games fill the screen with full-bleed artwork, the game's logo, and a glass tray for What's New, Favorites and Collections.
- **Collections done properly.** One unified view for a collection and for All Collections, with grid/list switching and summary banners.
- **Drag and drop that shows you where things land.** Dragging a game picks up a compact game chip, dims the row it came from, and lights up Steam's drop zones as cards under the pointer.

<p align="center"><img src="branding/showcase/collections.jpg" alt="All Collections as a grid of fanned cover stacks" width="100%"></p>


### Game pages worth opening
<p align="center"><img src="branding/showcase/game-page.jpg" alt="Game page with the stats bar, post-game summary and a gold Mastered achievements banner" width="100%"></p>

- **Two independent columns** with full-width achievement rows, complete DLC grids, friend activity tabs and media carousels.
- **HowLongToBeat built in.** Custom progress bars show how far you are through Main Story, Main + Extras and Completionist (with the HLTB for Millennium plugin).
- **Achievement rarity tiers.** Every achievement is ranked Legendary, Epic, Rare, Uncommon or Common by global unlock rate, with sparkles, an aura and the tier's initial on its icon. Finish a game and the progress banner turns into a gold **Mastered** banner.

### Friends, always in reach
<p align="center"><img src="branding/showcase/friends-chat.jpg" alt="Friends dock with a native chat flyout open beside it" width="100%"></p>

- **Friends dock** on the right of the window. Collapse it to a slim 60px rail of avatars and the games your friends are playing.
- **Native chat flyouts.** Click a friend and their real Steam chat opens beside the dock. Library, Store and Community share the same tabs, and the Store and Community pages host the flyout without spawning another taskbar window.
- **Smarter header.** Left-click the Friends button to toggle the dock, right-click for Steam's standalone Friends & Chat window.

### Everything else, finished to match
<p align="center">
  <img src="branding/showcase/downloads.jpg" alt="Downloads with live network and disk telemetry" width="49%">
  <img src="branding/showcase/startup.jpg" alt="Startup screen with the Network, Steam and Library progress strip" width="49%">
</p>

- **Navigation rail** with a consolidated root menu, title-bar library search and header quick actions. Restart Steam and Reload UI sit right above Exit.
- **Downloads** as a master-detail view with live progress telemetry.
- **Notifications** grouped by day under a summary card, opened by hovering the bell. The account menu has profile actions, Do Not Disturb and Online Status.
- **Settings and dialogs.** Steam Settings, App Properties, the Millennium Settings popup and the Millennium Library Manager all restyled.
- **About Steam, rebuilt.** A brand panel beside Steam's details as tiles. Click a tile to copy it, or Copy all for a bug report in one click.
- **Startup.** A step-by-step progress strip (Network, Steam, Library), seven startup backgrounds and a family of loading spinners.
- **Branding throughout.** The Steam Enhanced logo on the Steam menu button, the startup screen, the account chooser, the sign-in window and the loading spinners.

### An in-game overlay that matches
<p align="center"><img src="branding/showcase/overlay.jpg" alt="In-game overlay with the game card, achievements and friends" width="100%"></p>

Steam's overlay layout stays where Steam puts it, in any toolbar position, list view included. On top of it:
- **A game card** in the top-left corner: the clock and date, the game's logo, playtime this session, in total and over the last two weeks, plus Back to Game and Exit Game.
- **Achievements and Friends at a glance.** Unlocked / total, the ones closest to unlocking or your latest unlocks, and friends in-game now or played recently. Click the Achievements header to open Steam's Achievements widget, or an avatar to chat.
- **One rounded toolbar** with an accent line on open widgets, the theme's colours and type on every control, and a softer, theme-tinted backdrop.
- **Widget windows** (Game Overview, Achievements, Guides and more) get the theme's window chrome, and Game Overview sections become cards.

## Install

**You need:** the Steam desktop client and [Millennium](https://steambrew.app) with theme JavaScript enabled.<br>
**Optional:** HLTB for Millennium, for completion times. Keep the plugin enabled; its *Show in Library* option can be off, because Steam Enhanced reads its data directly.

1. Exit Steam completely.
2. Extract the release into `<Steam>/steamui/skins/`, so the manifest sits at
   `<Steam>/steamui/skins/Steam-Enhanced/skin.json`.
3. Launch Steam, open **Millennium → Themes** and select **Steam Enhanced**.
4. Enable theme JavaScript and restart Steam.

> **Updating?** With Steam closed, remove (or back up) the old `Steam-Enhanced` folder before extracting the new release. Merging folders can leave stale scripts and stylesheets behind.

## Make it yours

Every colour, radius, elevation, control height and feature switch lives on `:root` in **`shared/tokens.css`**. Edit a value and restart Steam.

### Startup background: `--se-startup-background`

| Value | Look |
| --- | --- |
| `library` *(default)* | A wireframe outline of the themed Library window. No cached art needed. |
| `hero` | Crossfading hero artwork from your 8 most recently played games. |
| `mosaic` | A breathing 2:3 tile grid over Steam's login capsule wall. |
| `wall` | Steam's login capsule wall, blurred and dimmed. |
| `plain` | The solid theme background with a soft radial glow. |
| `dots` | A fading dot matrix over the base background. |
| `steam` | Steam's own login background, untouched. |

### Loading spinner: `--se-spinner`

| Value | Look |
| --- | --- |
| `sweep` *(default)* | A conic arc with a glowing lead dot around the Steam Enhanced mark. |
| `deck` | Three of your game covers shuffling front to back. |
| `flip` | A two-sided card flipping through recent game covers. |
| `stack` | Four game covers dropping onto a stack. |
| `ring` | A solid accent arc around the Steam Enhanced mark. |
| `steam` | Steam's own throbber, untouched. |

Spinners smaller than 40px fall back to `sweep`.

### Home stage and overlay

| Token | Default | What it does |
| --- | --- | --- |
| `--se-home-stage` | `on` | `off` restores Steam's default Library Home (handy when adding or reordering shelves). |
| `--se-home-stage-cycle` | `9` | Seconds between hero transitions. `0` stops auto-cycling. |
| `--se-home-stage-tray` | `30` | Minimum share of the window height kept for the glass tray, in percent (0–70). |
| `--se-overlay` | `on` | `off` restores Steam's default in-game overlay look. |
| `--se-overlay-dim` | `0.9` | How dark the backdrop behind the overlay is (0–1). |

## Troubleshooting

- **Theme missing from Millennium?** Check that `skin.json` sits at `steamui/skins/Steam-Enhanced/skin.json`.
- **Interactive features missing?** Turn on theme JavaScript in Millennium's settings.
- **Something broke after a Steam update?** Steam may have rotated its CSS module class names. Rehash them with:
  ```
  python3 tools/classmap.py rehash <path-to-extracted-steamui> .
  ```

## What's inside

| Folder | Contents |
| --- | --- |
| `skin.json` | Millennium manifest and window match rules. |
| `shared/` | Core runtime (`SE`), design tokens, icon masks, scrollbars. |
| `features/` | Feature scripts and stylesheets, grouped by part of the client. |
| `compatibility/` | Standalone styles for web views (`webkit.css`). |
| `branding/` | Logo sources, and the header and splash images for the Millennium store. |
| `tools/` | CSS class-name indexer and rehash utility (`classmap.py`), and the spinner image builder (`spinner_svg.py`). |

---

<p align="center">Made by <strong>NVHT</strong> · Steam Enhanced is an unofficial theme and is not affiliated with Valve.</p>
