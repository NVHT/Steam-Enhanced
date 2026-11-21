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

Steam Enhanced rebuilds the Steam client around your library. A slim navigation rail, a cinematic Home you set up yourself, two-column game pages, a Friends dock that stays in reach and an in-game overlay to match. The Store, Community and Support pages follow in the same look, so every window feels like one app.

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
> **Any screen size.** The layout follows the window, not the monitor: the game list and Friends dock scale with it, and the Home and game pages rearrange as space runs out. On small windows the dock folds to its rail (1400 px and under) and the game list steps aside (1000 px and under); open either by hand and it stays open.

### Optional plugins

The theme styles these when they're installed, so they look built in.

| Plugin | What it adds | Shows up in |
| --- | --- | --- |
| **[HLTB for Millennium](https://github.com/jcdoll/hltb-millennium-plugin)**<br><sub><code>jcdoll/hltb-millennium-plugin</code></sub> | HowLongToBeat completion times | Game page |
| **[Extendium](https://github.com/BossSloth/Extendium)**<br><sub><code>BossSloth/Extendium</code></sub> | Chrome extensions inside Steam's browser | Steam's browser |
| **[Size on Disk](https://github.com/k0d13/steam-size-on-disk)**<br><sub><code>k0d13/steam-size-on-disk</code></sub> | Disk space taken by each installed game | Game page · Settings |
| **[Player Count](https://github.com/swindlesmccoop/playercount-badge)**<br><sub><code>swindlesmccoop/playercount-badge</code></sub> | Live player counts, replacing the theme's own | Game page |
| **[ProtonDB Library Badges](https://github.com/Yohlo/protondb-library-badges)**<br><sub><code>Yohlo/protondb-library-badges</code></sub> | ProtonDB tiers for Linux and Steam Deck | Game page · Library |
| **[Achievement Manager](https://github.com/madmaxgrey/AchievementManager)**<br><sub><code>madmaxgrey/AchievementManager</code></sub> | Unlock and lock achievements | Game page · Its own window |
| **[SteamGridDB](https://github.com/DevsNate/SteamGridDB-Millennium)**<br><sub><code>DevsNate/SteamGridDB-Millennium</code></sub> | Custom grids, heroes, logos and icons | Its own window |
| **[Brew Hub](https://github.com/madmaxgrey/BrewHub)**<br><sub><code>madmaxgrey/BrewHub</code></sub> | Browse and install community themes and plugins | Millennium Settings |

<br>

## ✦ The client

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>Library Home</h3>
      <sub>A cinematic stage for your recent games, favourites, a collection or your newest additions, over a board of panels: Favorites, Collections, Recently added and Friend activity. It fits the window and never scrolls, and you set all of it up from its own menu.</sub>
    </td>
    <td width="33%" valign="top">
      <h3>Game pages</h3>
      <sub>Two independent columns, HowLongToBeat bars and achievement rarity tiers from Legendary to Common. The play button turns red to stop a running game, and finishing a game turns the banner gold: <b>Mastered</b>.</sub>
    </td>
    <td width="33%" valign="top">
      <h3>Collections</h3>
      <sub>One view for a single collection or all of them, grid or list, summary banners, and drag and drop that shows where things land.</sub>
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h3>Friends</h3>
      <sub>A seamless dock grouped by what friends are playing, with favorites up top and offline friends out of the way. Fold it to a slim rail, hover an avatar for their card, click to chat beside it.</sub>
    </td>
    <td valign="top">
      <h3>Downloads</h3>
      <sub>The current download up front, live network, peak and disk speed on a running graph, and Up Next underneath.</sub>
    </td>
    <td valign="top">
      <h3>In-game overlay</h3>
      <sub>Session and total playtime beside the game logo, a rail of tabs (Overview, Achievements, Friends, Remote Play, Notes, Controller, Browser, Settings) and a drawer for the open view.</sub>
    </td>
  </tr>
  <tr>
    <td valign="top">
      <h3>Startup</h3>
      <sub>A Network, Steam, Library step strip, seven startup backgrounds, and five loading spinner styles that apply everywhere: client, Store and Community.</sub>
    </td>
    <td valign="top">
      <h3>About Steam</h3>
      <sub>Version and live update status up front, copy-on-click build tiles, the beta branch one click away, and Steam's latest patch notes in the dialog.</sub>
    </td>
    <td valign="top">
      <h3>Toasts</h3>
      <sub>Notifications play on a small stage at the bottom centre, on the desktop and in game, with achievements in their rarity tier.</sub>
    </td>
  </tr>
</table>

**Everywhere else**

| Area | What changes |
| --- | --- |
| **Navigation** | An icon-only rail. Store, Library, Community and Profile open menus of their pages on click, or jump straight to the first one on right-click. At its foot: notifications, Announcements, Games, Downloads and Settings. |
| **Title bar** | Library search with its view toggles inside, the Steam Enhanced lockup over the game list, your avatar with name and status (hover for your card, click for your account menu) and Friends &amp; Chat. |
| **Announcements** | A news feed of Steam's posts and your games', with unread dots and Mark all read. |
| **Notifications** | Grouped by day, in a panel that opens on click. |
| **Menus** | Every menu the theme draws shares one look: grouped rows with an icon, a name and a hint, opening and closing with a little motion. A game's right-click menu has no submenus: Play, Favorite, Files, Hide and Uninstall sit in a bar over the rest, and its Collections row opens a searchable list to tick, rename, delete or make collections. A collection's menu works the same way. |
| **Address bar** | A toolbar with a pill address field above Store and Community pages. |
| **Settings &amp; dialogs** | Steam Settings, App Properties, Millennium Settings, Library Manager, install, uninstall, backups, product activation, and new and deleted collections. |
| **System Information &amp; Report** | Spec tiles and section cards with jump chips and a filter. IPs, MACs and hardware IDs stay blurred until clicked. |

<br>

## ✦ Store, Community &amp; Support

Every web page fills the window and shares the theme's cards, glass chips, dropdowns and type, one search field (the client's) and one breadcrumb trail.

| Area | What changes |
| --- | --- |
| **Store front** | A cinema hero from Featured &amp; Recommended with game tabs and a glass info bar, event takeover art, ranked lists beside a spotlight card, and a capsule store bar with hover menus of art tiles. |
| **Game pages** | A title card over the hero art, one summary band with screenshots and features, the trailer as a card with a picker, and About This Game in a reader window. |
| **Browse** | New &amp; Upcoming, Charts, Labs, DLC, Next Fest (with a live countdown), Steam Awards and Replay, plus sale and event pages. |
| **Search** | Results as cards with aligned date, review and price columns, one toolbar for search and sort, and filters as folding cards. |
| **Wishlist** | A filter column with search, sort, views and your top tags, item cards with review facts and tag pills, and the shared price chip beside Add to Cart (Purchase as a gift on someone else's). |
| **Checkout** | The cart and checkout as one flow: item cards, a sticky total, payment details and Steam Points as cards, and Purchase as the one primary button. |
| **Account** | One settings page with a sticky sidebar: Account details, Purchase History and Licenses with search and filters, Add Funds, Redeem, phone, country and Family View. |
| **Legal** | The Subscriber Agreement and Privacy Policy as documents with a contents sidebar and progress bar. |
| **Community** | Profiles as glass cards over their own background, a three-column Activity feed, Hubs with a News reader and Guides, reviews with a verdict hero over the game's art, Discussions, a 5 × 5 inventory grid with rarity glows and a Community Market with a wallet hero and ranked listings. Formatted text (headings, quotes, code, tables, lists, spoilers) looks the same in guides, posts, comments, reviews and profiles. |
| **Support** | Every help.steampowered.com page, from the wizard to refunds and account recovery. |

<br>

## ✦ Make it yours

Most of it is in **Millennium → Themes → Steam Enhanced → Edit**, on the tab named in each section, plus the **Accent** colour used for links, buttons and selections. Settings apply as soon as you pick them; the **Web** tab needs a Steam restart.

<details>
<summary><b>Library Home</b> &nbsp;<sub>its own menu</sub></summary>
<br>

Hover the Home stage and open its menu (upper right) to set up the whole Home at once:

- **Home:** Steam Enhanced or Steam's own.
- **Featured games:** recently played, Favorites A–Z, a collection or recently added, and how many.
- **On the stage:** which details show, and thumbnails, dots or nothing to move between games.
- **Cycling:** how often it moves on to the next game.
- **Background:** a slow zoom, parallax that follows your pointer, the game's screenshots, its trailer (muted), or still.
- **Panels:** add or remove panels and drag them into order. With none, the stage fills the window.

Each panel has its own ⋯ menu for its width (a third, two thirds or the whole board) and what it shows: Favorites can show any collection or games you pick, with sort orders and hours on or off. Panels that don't fit move to more pages.

</details>

<details>
<summary><b>Appearance</b> &nbsp;<sub>font, motion, glass, corners</sub></summary>
<br>

| Setting | Options | What it does |
| --- | --- | --- |
| Font | **SN Pro**, Xmind, Steam (Motiva Sans) | The typeface everywhere: client, Store, Community, Support and Checkout. SN Pro and Xmind are bundled variable fonts. |
| Animations | **Full**, Reduced | Reduced: hovers, presses and panels change at once instead of moving. Spinners and the window entrance still play. |
| Glass effects | **On**, Off | Off drops the frosted blur and makes see-through surfaces solid. Lighter on slower PCs. |
| Corners | **Default**, Sharp, Round | How rounded every corner is. |

</details>

<details>
<summary><b>Startup</b> &nbsp;<sub>entrance, background, spinner</sub></summary>
<br>

Windows stay on the theme background until they've loaded (the main window until the Library has finished building), so Steam's own look never flashes.

| Window entrance | How a window appears once loaded |
| --- | --- |
| **Splash** | The main window plays the Steam Enhanced splash while the Library builds, reaching *Ready* in gold just as the Library appears. Other windows use Logo. |
| Logo | The Steam Enhanced mark breathes while the window loads, then grows and dissolves into it. |
| Fade | The window fades in. |
| None | The window appears at once. |

| Startup background | Behind the sign-in and startup screens |
| --- | --- |
| **Library** | A wireframe outline of the themed Library window. |
| Hero | Crossfading hero art from your 8 most recently played games. |
| Mosaic | A breathing tile grid over Steam's login capsule wall. |
| Wall | Steam's login capsule wall, blurred and dimmed. |
| Plain | The theme background with a soft radial glow. |
| Dots | A fading dot matrix. |
| Steam | Steam's own login background. |

| Loading spinner | One spinner for every loader: client, Splash, Store, Community and Support |
| --- | --- |
| **Refined** | A wider arc with a rounded, lit head on a thin track. |
| Comet | A short tail led by a bright dot, around a gently floating mark. |
| Elastic | A solid arc that stretches ahead and catches up. |
| Breathe | Refined, with the mark breathing and a soft halo. |
| Classic | A fading tail with a flat head. |

</details>

<details>
<summary><b>Library &amp; Friends</b> &nbsp;<sub>column widths</sub></summary>
<br>

| Setting | Options | What it does |
| --- | --- | --- |
| Game list width | **Fixed**, Adjustable | Fixed scales with the window and has no divider. Adjustable: drag the list's right edge (double-click resets). |
| Friends dock width | **Fixed**, Adjustable | The same, on the dock's left edge. |

</details>

<details>
<summary><b>Overlay</b> &nbsp;<sub>restyle, darkness</sub></summary>
<br>

| Setting | Options | What it does |
| --- | --- | --- |
| In-game overlay restyle | **yes**, no | no restores Steam's in-game overlay. |
| Overlay darkness | **Default**, Light, Dark | The backdrop behind the overlay. Dark hides the game. The overlay's own Darkness slider overrides it. |

</details>

<details>
<summary><b>Toasts</b> &nbsp;<sub>notifications</sub></summary>
<br>

| Setting | Options | What it does |
| --- | --- | --- |
| Notification toasts | **yes**, no | no restores Steam's toasts, desktop and in game. |
| Toasts in game | **yes**, no | no keeps Steam's own in-game toasts. |
| Toast style | **Stage**, Compact | Stage plays toasts on a small stage; Compact restyles Steam's toasts as cards. |
| Compact toast position | **Centre**, Corner | Compact toasts only: the centre of the screen edge, or Steam's corner. |

</details>

<details>
<summary><b>Web</b> &nbsp;<sub>Store, Community, Support, Checkout</sub></summary>
<br>

| Setting | Options | What it does |
| --- | --- | --- |
| Web pages | **Theme**, Steam's own | Steam's own leaves those pages exactly as Steam draws them. The client stays themed. Restart Steam after changing it. |

</details>

<details>
<summary><b>Beyond the settings</b> &nbsp;<sub><code>core/tokens.css</code></sub></summary>
<br>

Every colour, radius, elevation and feature switch lives on `:root` in **`core/tokens.css`**. Change a value and restart Steam. A few take finer values than their setting offers:

| Token | Default | Range |
| --- | --- | --- |
| `--se-overlay-dim` | `1.2` | `0.4`–`1.4`: edges are black from 1, the whole game is hidden at 1.4. |
| `--se-col-w` | `clamp(280px, 210px + 5.46875vw, 420px)` | The game list and Friends dock width. Any CSS length, fixed or scaling. |

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
├── dev/          Element inspector (Ctrl+Shift+E) and the class map and CSS check scripts
└── assets/       Logos, Millennium header and splash
```

<br>

---

<p align="center">
  <img src="assets/logo.png" alt="" width="40"><br>
  Made by <b>NVHT</b><br>
  <sub>Released under the <a href="LICENSE">MIT License</a>. Steam Enhanced is an unofficial theme and is not affiliated with Valve.</sub>
</p>
