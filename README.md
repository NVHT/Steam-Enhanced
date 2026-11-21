<p align="center">
  <img src="assets/header.gif" alt="Steam Enhanced: the Steam you always wanted" width="100%">
</p>

<h1 align="center">Steam Enhanced</h1>

<p align="center">
  <b>The Steam you always wanted.</b><br>
  <sub>A Millennium theme that imagines what the Steam desktop client should look like.</sub>
</p>

<p align="center">
  <img alt="Millennium theme" src="https://img.shields.io/badge/Millennium-theme-7cc4ff?style=for-the-badge&labelColor=171a20">
  <a href="https://github.com/NVHT/Steam-Enhanced/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/NVHT/Steam-Enhanced?style=for-the-badge&label=release&labelColor=171a20&color=f0c060"></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-98a2ad?style=for-the-badge&labelColor=171a20"></a>
</p>

<p align="center">
  <a href="#-install">Install</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#-the-client">The client</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#-store-community--support">Store &amp; Community</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#-make-it-yours">Make it yours</a>
  &nbsp;&nbsp;·&nbsp;&nbsp;
  <a href="#-licenses">Licenses</a>
</p>

<br>

Steam Enhanced rebuilds the Steam client around your library: a slim navigation rail, a cinematic Home you set up yourself, two-column game pages, a Friends dock in reach and an in-game overlay to match. The Store, Community and Support pages follow in the same look, so every window feels like one app.

> [!NOTE]
> Steam still runs underneath. Your library, data and settings behave exactly as Steam intends.

<br>

## ✦ Install

> [!IMPORTANT]
> **Requires** the [Steam](https://store.steampowered.com/about/) desktop client and [Millennium](https://steambrew.app), with theme JavaScript on.

1. Download the [latest release](https://github.com/NVHT/Steam-Enhanced/releases/latest).
2. Exit Steam from **Steam → Exit**.
3. Extract the `Steam-Enhanced` folder into `<Steam>/millennium/themes/`, so you end up with `themes/Steam-Enhanced/skin.json`.
4. Start Steam, open **Millennium → Themes** and select **Steam Enhanced**.

> [!TIP]
> **Updating?** With Steam closed, delete the old `Steam-Enhanced` folder before extracting. Merging leaves stale files behind.

> [!NOTE]
> **Any screen size.** The layout follows the window, not the monitor. The game list and Friends dock scale with it; at 1400 px and under the dock folds to its rail, at 1000 px and under the game list steps aside. Open either by hand and it stays open.

### Optional plugins

Installed, these look built in.

| Plugin | What it adds | Shows up in |
| --- | --- | --- |
| **[HLTB for Millennium](https://github.com/jcdoll/hltb-millennium-plugin)** | HowLongToBeat completion times | Game page |
| **[Extendium](https://github.com/BossSloth/Extendium)** | Chrome extensions inside Steam's browser | Steam's browser |
| **[Size on Disk](https://github.com/k0d13/steam-size-on-disk)** | Disk space taken by each installed game | Game page · Settings |
| **[Player Count](https://github.com/swindlesmccoop/playercount-badge)** | Live player counts, in place of the theme's own | Game page |
| **[ProtonDB Library Badges](https://github.com/Yohlo/protondb-library-badges)** | ProtonDB tiers for Linux and Steam Deck | Game page · Library |
| **[Achievement Manager](https://github.com/madmaxgrey/AchievementManager)** | Unlock and lock achievements | Game page · Its own window |
| **[SteamGridDB](https://github.com/DevsNate/SteamGridDB-Millennium)** | Custom grids, heroes, logos and icons | Its own window |
| **[Brew Hub](https://github.com/madmaxgrey/BrewHub)** | Browse and install community themes and plugins | Millennium Settings |

<br>

## ✦ The client

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>Library Home</h3>
      <sub>A cinematic stage for your recent games, favourites, a collection or your newest additions, over a board of panels. It fits the window and never scrolls.</sub>
    </td>
    <td width="33%" valign="top">
      <h3>Game pages</h3>
      <sub>Two columns, HowLongToBeat bars and achievement rarity tiers. The play button turns red to stop a game; finish one and the banner turns gold: <b>Mastered</b>.</sub>
    </td>
    <td width="33%" valign="top">
      <h3>Collections</h3>
      <sub>One collection or all of them, grid or list, summary banners, and drag and drop that shows where things land.</sub>
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h3>Friends</h3>
      <sub>A dock grouped by what friends are playing, favourites up top. Fold it to a rail, hover an avatar for their card, chat beside it.</sub>
    </td>
    <td valign="top">
      <h3>Downloads</h3>
      <sub>The current download up front, network and disk speed on a live graph, Up Next underneath.</sub>
    </td>
    <td valign="top">
      <h3>In-game overlay</h3>
      <sub>Session and total playtime by the game's logo, a rail of tabs from Achievements to Notes, and a drawer for the open view.</sub>
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h3>Startup</h3>
      <sub>A Network, Steam, Library step strip, seven backgrounds and five spinner styles that apply everywhere.</sub>
    </td>
    <td valign="top">
      <h3>About Steam</h3>
      <sub>Version and update status up front, copy-on-click build tiles, the beta branch one click away, Steam's latest patch notes.</sub>
    </td>
    <td valign="top">
      <h3>Toasts</h3>
      <sub>Notifications play on a small stage at the bottom centre, on the desktop and in game, achievements in their rarity tier.</sub>
    </td>
  </tr>
</table>

**Everywhere else**

- **Navigation:** an icon-only rail. Store, Library, Community and Profile open menus of their pages (right-click jumps to the first). At its foot: notifications, Announcements, Games, Downloads and Settings.
- **Title bar:** Library search with a Filters panel (a row of chips per section, Clear to reset), your avatar with status and account menu, and Friends &amp; Chat.
- **Announcements and notifications:** Steam's news and your games' in one feed with unread dots; notifications grouped by day.
- **Menus:** one look for every menu the theme draws. A game's right-click menu has no submenus: Play, Favorite, Files, Hide and Uninstall in a bar, and Collections opens a searchable list to tick, rename, delete or make collections.
- **Settings and dialogs:** Steam Settings, App Properties, Millennium Settings, Library Manager, install, uninstall, backups, product activation, and new and deleted collections.
- **System Information and Report:** spec tiles and section cards with jump chips and a filter; IPs, MACs and hardware IDs stay blurred until clicked.

<br>

## ✦ Store, Community &amp; Support

Every web page fills the window and shares the theme's cards, chips, dropdowns, type, one search field and one breadcrumb trail.

- **Store front:** a cinema hero with game tabs, event takeover art, ranked lists beside a spotlight card, and a store bar with hover menus of art tiles.
- **Game pages:** a title card over the hero art, one summary band with screenshots and features, the trailer as a card, About This Game in a reader window.
- **Browse and search:** New &amp; Upcoming, Charts, Labs, DLC, Next Fest, Steam Awards, Replay and sale pages; search results as cards with aligned date, review and price columns.
- **Wishlist, cart and checkout:** a filter column with your top tags, item cards with review facts, then cart and checkout as one flow with a sticky total and Purchase as the one primary button.
- **Account and legal:** one settings page with a sticky sidebar (history, licenses, funds, Family View); agreements as documents with a contents sidebar.
- **Community:** profiles as glass cards over their own background, a three-column Activity feed, Hubs with a News reader and Guides, reviews, Discussions, an inventory grid with rarity glows and the Market. Formatted text looks the same in guides, posts, comments, reviews and profiles.
- **Support:** every help.steampowered.com page, from the wizard to refunds and account recovery.

<br>

## ✦ Make it yours

Most of it is in **Millennium → Themes → Steam Enhanced → Edit**, on the tab named in each section, plus the **Accent** colour for links, buttons and selections. Settings apply at once; the **Web** tab needs a Steam restart.

<details>
<summary><b>Library Home</b> &nbsp;<sub>its own menu</sub></summary>
<br>

Hover the Home stage and open its menu (upper right):

- **Home:** Steam Enhanced or Steam's own.
- **Featured games:** recently played, Favorites A–Z, a collection or recently added, and how many.
- **On the stage:** which details show, and thumbnails, dots or nothing to move between games.
- **Cycling:** how often it moves to the next game.
- **Background:** a slow zoom, parallax that follows your pointer, screenshots, the trailer (muted), or still.
- **Panels:** Favorites, Collections, Recently added and Friend activity; add, remove and drag them into order. With none, the stage fills the window.

Each panel's ⋯ menu sets its width (a third, two thirds or the whole board) and what it shows. Panels that don't fit move to more pages.

</details>

<details>
<summary><b>Appearance</b> &nbsp;<sub>font, motion, glass, corners</sub></summary>
<br>

| Setting | Options | What it does |
| --- | --- | --- |
| Font | **SN Pro**, Xmind, Steam (Motiva Sans) | The typeface everywhere: client, Store, Community, Support and Checkout. |
| Animations | **Full**, Reduced | Reduced: hovers, presses and panels change at once. Spinners and the window entrance still play. |
| Glass effects | **On**, Off | Off drops the frosted blur and makes see-through surfaces solid. Lighter on slower PCs. |
| Corners | **Default**, Sharp, Round | How rounded every corner is. |

</details>

<details>
<summary><b>Startup</b> &nbsp;<sub>entrance, background, spinner</sub></summary>
<br>

Windows stay on the theme background until they've loaded, so Steam's own look never flashes.

| Setting | Options | What it does |
| --- | --- | --- |
| Window entrance | **Splash**, Logo, Fade, None | Splash plays in the main window while the Library builds, reaching *Ready* in gold as it appears; other windows use Logo. |
| Startup background | **Library**, Hero, Mosaic, Wall, Plain, Dots, Steam | Behind the sign-in and startup screens: a wireframe of the Library, your recent games' hero art, Steam's capsule wall, a plain glow, a dot matrix, or Steam's own. |
| Loading spinner | **Refined**, Comet, Elastic, Breathe, Classic | One spinner for every loader: client, Splash, Store, Community and Support. |

</details>

<details>
<summary><b>Library, Friends, Overlay, Toasts, Web</b></summary>
<br>

| Setting | Options | What it does |
| --- | --- | --- |
| Game list width | **Fixed**, Adjustable | Fixed scales with the window. Adjustable: drag the list's edge (double-click resets). |
| Friends dock width | **Fixed**, Adjustable | The same, on the dock's edge. |
| In-game overlay restyle | **yes**, no | no restores Steam's overlay. |
| Overlay darkness | **Default**, Light, Dark | The backdrop behind the overlay; Dark hides the game. The overlay's own slider overrides it. |
| Notification toasts | **yes**, no | no restores Steam's toasts, desktop and in game. |
| Toasts in game | **yes**, no | no keeps Steam's own in-game toasts. |
| Toast style | **Stage**, Compact | Compact restyles Steam's toasts as cards. |
| Compact toast position | **Centre**, Corner | Where Compact toasts show. |
| Web pages | **Theme**, Steam's own | Steam's own leaves the Store, Community, Support and Checkout as Steam draws them. Restart Steam after changing it. |

</details>

<details>
<summary><b>Beyond the settings</b> &nbsp;<sub><code>core/tokens.css</code></sub></summary>
<br>

Every colour, radius, elevation and feature switch lives on `:root` in **`core/tokens.css`**. Change a value and restart Steam. Two take finer values than their setting:

| Token | Default | Range |
| --- | --- | --- |
| `--se-overlay-dim` | `1.2` | `0.4`–`1.4`: edges are black from 1, the game is hidden at 1.4. |
| `--se-col-w` | `clamp(280px, 210px + 5.46875vw, 420px)` | The game list and Friends dock width. Any CSS length. |

</details>

<br>

## ✦ Licenses

Steam Enhanced is released under the [MIT License](LICENSE). It bundles a few third-party pieces, each under its own license, kept beside the files it covers:

| Component | Used for | License |
| --- | --- | --- |
| [SN Pro](https://github.com/supernotes/sn-pro) · © 2024 The SN Pro Project Authors | Default typeface | SIL Open Font License 1.1 · [`core/fonts/SNPro-OFL.txt`](core/fonts/SNPro-OFL.txt) |
| [Xmind](https://github.com/lamzhonghang/xmind) · © 2025 The Xmind Project Authors | Optional typeface | SIL Open Font License 1.1 · [`core/fonts/Xmind-OFL.txt`](core/fonts/Xmind-OFL.txt) |
| [hls.js](https://github.com/video-dev/hls.js) 1.6.15 · © 2017 Dailymotion | Store trailers and the Home stage's trailer background | Apache License 2.0 · [`web/store/vendor/hls.js-LICENSE`](web/store/vendor/hls.js-LICENSE) |

Steam and the Steam logo are trademarks of Valve Corporation. Steam Enhanced is an unofficial theme and is not affiliated with Valve.

<br>

## ✦ Project layout

```text
Steam-Enhanced/
├── skin.json     Millennium manifest: settings, and core.js plus the client loader in every window
├── core/         Shared by client and web: runtime and class map, tokens and icons, font, motion, spinner
├── client/       Client features, one folder per area; shared/ for client-wide parts; loader.js maps windows to files
├── web/          The web sites: shared/ first, then store/, community/, help/ and checkout/, one folder per page
├── compat/       Plugin integrations, one folder per plugin
├── options/      Setting overrides Millennium applies when you pick them, one folder per settings tab
├── dev/          Element inspector (Ctrl+Shift+E), class map tools, and the CSS, colour, audit and design checks
└── assets/       Logos, Millennium header and splash
```

<br>

---

<p align="center">
  <img src="assets/logo.png" alt="" width="40"><br>
  Made by <b>NVHT</b><br>
  <sub>Released under the <a href="LICENSE">MIT License</a>. Steam Enhanced is an unofficial theme and is not affiliated with Valve.</sub>
</p>
