<p align="center">
  <img src="assets/logo.png" alt="" width="56"><br>
  <b>Steam Enhanced</b> · Changelog
</p>

<p align="center">
  <sub>What each version added. Steam Enhanced installs and updates through Millennium: see the <a href="README.md#install">README</a>.</sub>
</p>

| Version | Date | In short |
| --- | --- | --- |
| [**1.3.5**](#v1-3-5) | Nov 22, 2026 | Friends and tray menus, Game Properties, shortcuts, a faster client |
| [**1.3.0**](#v1-3-0) | Nov 21, 2026 | Library Home drawn by the theme, library menus, a contrast and focus pass |
| [**1.2.1**](#v1-2-1) | Nov 20, 2026 | Two fixes |
| [**1.2.0**](#v1-2-0) | Nov 18, 2026 | Appearance settings, the Store and Community redesigned, one look for icons and menus |
| [**1.1.0**](#v1-1-0) | Nov 15, 2026 | Settings in Millennium, six plugins themed, one loading spinner |
| [**1.0.0**](#v1-0-0) | Nov 13, 2026 | The first public release |

<br>

<a name="v1-3-5"></a>

## 1.3.5 · Nov 22, 2026

> Friends menus and the tray menu in the theme's style, Game Properties redesigned, new keyboard shortcuts, and a faster client.

**Library**
- **Game Properties**: a redesign. Every setting row has the same layout and an icon of its own, and the game's hero art runs across the top of the window.
- **Right-click menus**: Home's and the game page's small menus and the text menu now match the game menu. The game menu also handles non-Steam games.
- **Dialogs**: Mark as Private and Exit Game rebuilt like the other dialogs, with the game's art, its name and a clear red action.

**Friends**
- **Friends dock**: the folded rail is in labelled sections (Chats, Favorites, Playing, Online, Groups), each person shown once. The rest go in a searchable flyout.
- **Menus**: the friend menu and the friends list's game, category and group chat menus all use the library menus' style.

**Client**
- **Tray menu**: you and your status first, then the download in progress, your recent games, Steam's pages as icon tiles, and Exit Steam in red.
- **Shortcuts**: <kbd>Ctrl</kbd>+<kbd>`</kbd> opens Steam Settings, <kbd>Ctrl</kbd>+<kbd>1</kbd> Millennium, <kbd>Ctrl</kbd>+<kbd>R</kbd> reloads the UI and <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> restarts Steam. The Settings and Steam menus show them on their rows.
- **Account menu**: each row says what it does.
- **Notifications**: tidier times, sale art and avatars.

**Plugins**
- **Brew Hub 1.1.0** support.

**Fixes and polish**
- Restart Steam works from every window.
- A game's Play row keeps its green when the menu has no bar.
- The friends dock keeps its list when the game list scrolls.
- Popups over Store pages get the theme's look.
- Exit Game and Delete Collection share one red button. A group's initials match in the dock and in its menu.
- 32 px hit targets and readable highlighted rows throughout.

**Under the hood**
- Each window loads the theme's stylesheets through a single import, so a full style pass is faster (about 58 ms down to 43 ms on Home).
- The theme's update passes no longer force layouts.
- A performance profiler for client windows (`dev/perf.js`, <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>).
- One segmented control, danger button, card and chip everywhere. Shared helpers for library art, relative times and initials.

<br>

<a name="v1-3-0"></a>

<details>
<summary><b>1.3.0</b> · Nov 21, 2026 · A theme-drawn Library Home, rebuilt library menus and collection dialogs, and a release-wide pass on contrast, focus and motion.</summary>
<br>

**Library**
- **Library Home**: a cinematic stage for your recent games, favourites, a collection or your newest additions, over a board of panels: Favorites, Collections, Recently added and Friend activity. It fits the window, never scrolls, and you set all of it up from its own menus.
- **Right-click menus**: a game's menu has no submenus: Play, Favorite, Files, Hide and Uninstall sit in a bar over the rows, and Collections opens the theme's picker. Collection menus match.
- **New Collection** and **Delete Collection** dialogs rebuilt.
- **Library Filters**: one row of chips per section and a Clear button, over Store pages too.
- **Columns**: the game list and Friends dock scale with the window, fold away on small windows, and keep an adjusted width as a share of the window.

**Client**
- **Announcements** on the rail, with a news feed and right-click shortcuts.
- **Steam menus** keep their shadow, stay open when a Store page takes the focus back, and keep the windows they open in front.
- **Friends & Chat**: a click opens the menu, a right-click shows or folds the dock.
- **Game page**: a red Stop state for the play button.

**Store**
- **Store front**: event takeover art and a full-width take-under banner.
- **Steam Charts**: whole rows clickable again after Steam changed its markup.

**Plugins**
- **Brew Hub** support.

**Fixes and polish**
- Count badges, play buttons and faint labels now meet WCAG AA contrast.
- Every control the theme builds shows keyboard focus and has a 32 px target.
- Reduced motion also covers the library menus, the overlay's views and the snooze glow.
- The Game Properties settings icon is back, Brew Hub's Refresh hides when it should, and New Collection keeps the type you picked.
- Listeners, videos and background checks are released when they're done, and pause while Steam is hidden.

**Under the hood**
- The settings menu and the picker live in one shared place, and every image works through one fallback chain.
- New release checks: an audit of the whole theme and a design check of its rules.

</details>

<a name="v1-2-1"></a>

<details>
<summary><b>1.2.1</b> · Nov 20, 2026 · Two fixes on top of 1.2.0.</summary>
<br>

**Fixes**

- **Menus with reduced motion**: with Steam's Reduce Motion or the theme's Animations: Reduced on, the theme's menus (the rail's page menus, Announcements, Downloads, Settings) opened in the wrong place, and over a Store or Community page some didn't show at all. They now open where they belong.
- **Library Manager settings**: the segmented controls and switches (Animations, Corners, Glass effects...) snapped back to their old value after a click. They now keep the value you pick.

</details>

<a name="v1-2-0"></a>

<details>
<summary><b>1.2.0</b> · Nov 18, 2026 · Appearance settings, a redesigned Store and Community, and one look for every icon, menu and search box.</summary>
<br>

**Settings**
- **Appearance tab**: Font (SN Pro by default, Xmind or Steam's Motiva Sans), Animations, Glass effects and Corners.
- **Library Home stage**: cycling speed, tray, height, strip and details, each a setting.
- **Adjustable widths**: drag the game list or the Friends dock to the width you want.
- **Web pages**: keep the theme on the Store and Community, or switch back to Steam's own.

**Client**
- **Navigation rail**: Store, Library, Community and Profile open menus of their pages, with the one you're on lit.
- **Downloads card** from the rail, a redesigned **account menu** and **Steam menu**, and tips on every title-bar button.
- **Title-bar search** with the game-type picker, and one search field across the client.
- **Millennium settings** and the **Library Manager** redesigned.
- **Game page**: status as a stat, clickable stats and achievement tips across the whole tile.
- **Icons**: duotone, in the text colour everywhere.

**Store**
- **Wishlist** around an options column, with a grid view.
- **Search**, **Cart**, **Age check** and **Checkout** redesigned.

**Community**
- **Reviews**, **guides**, comment threads and the hub header redesigned; hub Group Chat opens in the Friends dock.
- **Formatted text** (quotes, code, tables, spoilers) in one look on guides, posts, comments, reviews and profiles.
- **One search field** and **one breadcrumb trail** across the Store, Community and Support.

**Under the hood**
- Type and spacing on token scales, a split core, and large files split into parts.

</details>

<a name="v1-1-0"></a>

<details>
<summary><b>1.1.0</b> · Nov 15, 2026 · Theme settings inside Millennium, six plugins themed to match, and one loading spinner everywhere.</summary>
<br>

**Settings**
- **Theme settings in Millennium**: Startup, Library, Overlay and Toasts tabs, no files to edit.
- **Accent colour**: pick it in Millennium's colour picker and the whole theme follows.
- **Loading spinner**: one spinner across the client and the web, in five styles (Refined by default). The splash screen follows your choice.

**Plugin support**, each themed to match when installed
- **[[Extendium](https://github.com/BossSloth/Extendium)](https://github.com/BossSloth/Extendium)**: Chrome extensions inside Steam's browser.
- **[[Size on Disk](https://github.com/k0d13/steam-size-on-disk)](https://github.com/k0d13/steam-size-on-disk)**: disk space per installed game.
- **[[Player Count](https://github.com/swindlesmccoop/playercount-badge)](https://github.com/swindlesmccoop/playercount-badge)**: live player counts, replacing the theme's own.
- **[[ProtonDB Library Badges](https://github.com/Yohlo/protondb-library-badges)](https://github.com/Yohlo/protondb-library-badges)**: compatibility tiers for Linux and Steam Deck.
- **[[Achievement Manager](https://github.com/madmaxgrey/AchievementManager)](https://github.com/madmaxgrey/AchievementManager)**: unlock and lock achievements.
- **[[SteamGridDB](https://github.com/DevsNate/SteamGridDB-Millennium)](https://github.com/DevsNate/SteamGridDB-Millennium)**: custom grids, heroes, logos and icons, with a redesigned window.

**Client**
- **Window cover and splash entrance** when Steam starts.
- **Menus**: submenus sized to the themed menu.
- **Overlay**: Settings fills its window, with a lighter modal veil.

**Community**
- **Market** and **Discussions home** redesigned, with smooth trailer playback.

**Under the hood**
- One shared token set for client and web, scoped client loading, and a full audit: dead code removed, performance and memory-leak fixes.

</details>

<a name="v1-0-0"></a>

<details>
<summary><b>1.0.0</b> · Nov 13, 2026 · The Steam you always wanted. The first public release of Steam Enhanced, a Millennium theme that imagines what the Steam desktop client should look like.</summary>
<br>

**Client**
- **Library Home**: a cinematic hero stage over your recent games, with a glass tray of news, favourites and collections.
- **Game pages**: two columns, HowLongToBeat bars and achievement rarity tiers. Finish a game and it turns gold: *Mastered*.
- **Collections**: one view for one or all collections, grid or list, with drag and drop.
- **Friends dock**: grouped by game, collapsible to a slim rail, with Steam chat beside it.
- **Downloads**: live network and disk speed on a running graph, with Up Next underneath.
- **In-game overlay**: playtime stats, a rail of views and a drawer for the open one.
- **Startup, toasts, notifications, settings and dialogs**, all redesigned.

**Store, Community & Support**
- A cinema store front, redesigned game pages, browse pages, account pages and legal documents.
- Profiles, Activity, Hubs, Discussions and Inventory on the Community.
- Every Steam Support page.

</details>
