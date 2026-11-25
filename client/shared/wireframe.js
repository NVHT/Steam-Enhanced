/*
 * SE.wireframe(): the Library as a wireframe, drawn from the theme's real Library: the rail,
 * the game list in collapsible sections, Home (the search bar, the stage flush to the column,
 * the board's three panels) and the friends column. Drawn by client/shared/wireframe.css. Used
 * by the splash (client/entrance/entrance.js) and the startup window's background
 * (client/startup/startup.js); returns markup, the caller places it.
 * SE.wireframe({ alive: true }) draws it alive (wireframe.css): it draws itself in, the selection
 * steps down the Favorites rows and the friends in a game come online one at a time, each item's
 * turn in --se-wf-turn (of its column's --se-wf-turns). { alive: true, busy: true } (both)
 * moves more of it, as if loading: the board's capsules shimmer, its activity lights up row by
 * row, the search field's caret blinks, the updating game's dot and the Library tab pulse.
 * SE.wireframe({ view }) draws another page in place of Home, beside the game list, the rail
 * lighting its tab: 'store' (the theme's front page: Cinema hero, deal tiles, the tabbed list),
 * 'activity' (the theme's Friend Activity: shortcuts, feed, friends in game), 'community'
 * (Community Home, Steam's own: tabs over a masonry of cards), 'news' (Steam's News Hub: its
 * navigation, Coming soon's cards, Today's stories), 'steamhome' (the Library's Home as Steam
 * draws it, the Home setting on Steam's: What's New's cards, a shelf of capsules, the Add shelf
 * row), 'friends' (the friends list
 * on its own) or 'bigpicture' (Big Picture: no rail or columns, a hero over a row of tall
 * capsules). Settings › Interface's preview (client/settings/dialog/interface.js) and the Store
 * page's hero (store.js, its page alone).
 */
((SE) => {
  if (!SE) return;

  const repeat = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join('');
  // A line of text; tone: '' (a line), 'strong', 'accent', 'green'
  const txt = (w, tone = '') => `<i class="se-wf-txt"${tone ? ` data-tone="${tone}"` : ''} style="width:calc(${w} * var(--u))"></i>`;
  const ico = () => '<b class="se-wf-ico"></b>';
  // A section's header: its chevron, label and count
  const head = (w) => `<span class="se-wf-head">${txt(w)}<i class="se-wf-count"></i></span>`;

  // The rail's tabs, Library first as the theme's rail has it; the view's own is lit
  const RAIL_TABS = ['library', 'store', 'community'];
  const tabOf = (view) => ({ activity: 'community', news: 'store' })[view] || view;

  function build(alive, busy, view) {
    const turn = (i) => (alive ? ` data-turn style="--se-wf-turn:${i}"` : '');

    const lit = RAIL_TABS.includes(tabOf(view)) ? tabOf(view) : 'library';
    const tab = (name) => (name === lit ? `<span class="se-wf-rail-on">${ico()}</span>` : ico());
    const rail =
      `<div class="se-wf-rail">${ico()}` +
      `<span class="se-wf-rail-nav">${RAIL_TABS.map(tab).join('')}</span>` +
      '<span class="se-wf-rail-foot"><b class="se-wf-rail-me"></b></span>' +
      '</div>';

    // [title width, installed (bright), updating (a blue dot)]; a line per game, no icons
    const row = ([w, lit = false, upd = false], i, turns) =>
      `<span class="se-wf-row"${lit ? ' data-lit' : ''}${turns ? turn(i) : ''}>${txt(w)}` +
      (upd ? '<s class="se-wf-dot"></s>' : '') +
      '</span>';
    const rows = (list, turns = false) => list.map((r, i) => row(r, i, turns)).join('');
    // Two sections, far fewer rows than the real list: the layout, not every line
    const FAVORITES = [[150, 1], [110, 1], [100, 1], [160, 1], [90], [130, 1], [80, 1], [170, 1]];
    const SECOND = [[130], [150], [80], [140, 1, 1], [120]];
    const list =
      `<div class="se-wf-list"${alive ? ` style="--se-wf-turns:${FAVORITES.length}"` : ''}>` +
      `<span class="se-wf-libhead"><b></b>${txt(80, 'strong')}</span>` +
      head(50) + rows(FAVORITES, true) +
      head(70) + rows(SECOND) +
      '</div>';

    const stage =
      '<div class="se-wf-stage">' +
      '<span class="se-wf-game"><span class="se-wf-logo"><i></i><i></i></span><b class="se-wf-play"></b></span>' +
      `<span class="se-wf-strip">${repeat(6, (i) => `<b${i === 1 ? ' data-on' : ''}></b>`)}</span>` +
      '</div>';

    // The board: Friend activity, Favorites, Recently added
    const ACTIVITY = [200, 160, 210, 180];
    const panel = (w, body) => `<span class="se-wf-panel">${txt(w, 'strong')}${body}</span>`;
    const activity = ACTIVITY.map((w, i) => `<span class="se-wf-act"${busy ? turn(i) : ''}><b></b>${txt(w)}</span>`).join('');
    // Busy: each capsule's shimmer starts a step after the last
    const grid = `<span class="se-wf-grid">${repeat(3, (i) => `<b${busy ? ` style="--se-wf-i:${i}"` : ''}></b>`)}</span>`;
    const home =
      '<div class="se-wf-home"><span class="se-wf-top"><i class="se-wf-search"></i></span>' +
      stage +
      `<span class="se-wf-board"${busy ? ` style="--se-wf-turns:${ACTIVITY.length}"` : ''}>${panel(90, activity)}${panel(80, grid)}${panel(90, grid)}</span>` +
      '</div>';

    // A game's group and the friends in it, indented; then friends elsewhere. One line each.
    let member = 0;
    const friend = (w, inGame = false) =>
      `<span class="se-wf-friend"${inGame ? ` data-in${turn(member++)}` : ''}><b></b>${txt(w, inGame ? 'green' : 'strong')}</span>`;
    const friends =
      '<div class="se-wf-friends"' + (alive ? ' style="--se-wf-turns:4"' : '') + '>' +
      txt(50) +
      `<span class="se-wf-favs">${repeat(3, () => '<b></b>')}</span>` +
      `<span class="se-wf-group"><b></b>${txt(100, 'strong')}</span>` +
      [60, 90, 70, 100].map((w) => friend(w, true)).join('') +
      head(60) +
      [110, 90, 70, 100, 60, 120].map((w) => friend(w)).join('') +
      '</div>';

    const open = (name) =>
      `<div class="se-wf" data-view="${name}"${alive ? ' data-alive' : ''}${busy ? ' data-busy' : ''}><span class="se-wf-sweep"></span>`;
    if (view === 'bigpicture') return `${open(view)}${bigPicture()}</div>`;
    if (view === 'friends') return `${open(view)}${friends}</div>`;
    // The game list stays beside every page in the main window, as the theme's Library has it
    // Named …Page: build() has its own `activity` (the board's rows)
    const PAGES = { store: storePage, activity: activityPage, community: communityPage, news: newsPage, steamhome: steamHomePage };
    const page = list + (PAGES[view]?.(busy) ?? home);
    return `${open(view)}${rail}${page}${friends}</div>`;
  }

  /*
   * The Store's front page as the theme draws it (web/store/front/): the store bar, the Cinema
   * hero (its game tabs on top, the glass bar below: meta, description, four shots, buy), then
   * Discounts & Events' art tiles and the tabbed list beside its spotlight
   */
  function storePage() {
    const tabs = repeat(5, (i) => `<b${i === 0 ? ' data-on' : ''}></b>`);
    const cinema =
      `<span class="se-wf-cinema"><span class="se-wf-cinema-top">${txt(70, 'strong')}<span>${tabs}</span></span>` +
      `<span class="se-wf-cinema-bar"><span>${txt(110, 'strong')}${txt(70)}</span>${txt(150)}` +
      `<span class="se-wf-shots">${repeat(4, () => '<b></b>')}</span><b class="se-wf-buy"></b></span></span>`;
    const list = `<span class="se-wf-ranked">${repeat(4, () => `<span><b></b>${txt(110, 'strong')}</span>`)}</span>`;
    return (
      `<div class="se-wf-page"><span class="se-wf-storebar">${[50, 60, 45, 70].map((w) => txt(w, 'strong')).join('')}<i class="se-wf-search"></i></span>` +
      cinema +
      txt(120, 'strong') + `<span class="se-wf-caps">${repeat(4, () => '<b></b>')}</span>` +
      `<span class="se-wf-tabbed">${list}<b></b></span>` +
      '</div>'
    );
  }

  /*
   * Friend Activity as the theme draws it (web/community/activity/): its title and search, then
   * three columns: you over your shortcuts, the feed (the composer, then event cards: author,
   * wide art, actions), and the friends in game over your groups
   */
  function activityPage() {
    const event = `<span class="se-wf-event"><span><b></b>${txt(90, 'strong')}</span><i></i>${txt(60)}</span>`;
    return (
      `<div class="se-wf-page"><span class="se-wf-pagehead">${txt(160, 'strong')}<i class="se-wf-search"></i></span>` +
      '<span class="se-wf-activity">' +
      `<span class="se-wf-shortcuts"><b></b>${[70, 50, 60, 55, 65].map((w) => txt(w)).join('')}</span>` +
      `<span class="se-wf-events"><span class="se-wf-compose"></span>${event}${event}</span>` +
      `<span class="se-wf-side"><b></b><span>${repeat(4, () => `<span><b></b>${txt(70, 'green')}</span>`)}</span><b></b></span>` +
      '</span></div>'
    );
  }

  /*
   * Community Home and News, Steam's own pages (the theme leaves them as they are): a title over
   * the content tabs, then a masonry of cards (pictures and text)
   */
  /*
   * News, Steam's own News Hub (the theme leaves it as it is): its navigation column, then
   * Coming soon's three cards and Today's list of stories, each a wide picture beside its title
   * and summary
   */
  function newsPage() {
    const story = (w) => `<span><i></i><span>${txt(w, 'strong')}${txt(w * 1.5)}</span></span>`;
    return (
      '<div class="se-wf-page"><span class="se-wf-hub">' +
      `<span class="se-wf-hub-side"><b></b>${[90, 70, 80, 60, 75].map((w) => txt(w)).join('')}</span>` +
      `<span class="se-wf-hub-main">${txt(110, 'strong')}<span class="se-wf-hub-soon">${repeat(3, () => '<b></b>')}</span>` +
      `${txt(60, 'strong')}<span class="se-wf-hub-list">${[180, 150, 200, 160].map(story).join('')}</span></span>` +
      '</span></div>'
    );
  }

  function communityPage() {
    const HEIGHTS = [[220, 140], [150, 240], [260, 120], [170, 200]];
    const columns = HEIGHTS.map((col) => `<span>${col.map((h) => `<b style="height:calc(${h} * var(--u))"></b>`).join('')}</span>`).join('');
    return (
      `<div class="se-wf-page"><span class="se-wf-pagehead">${txt(180, 'strong')}<i class="se-wf-search"></i></span>` +
      `<span class="se-wf-menu">${[40, 80, 60, 55, 70, 65].map((w, i) => txt(w, i === 0 ? 'accent' : 'strong')).join('')}</span>` +
      `<span class="se-wf-masonry">${columns}</span></div>`
    );
  }

  /*
   * The Library's Home as Steam draws it: What's New (its heading over a row of event cards, each
   * art over two lines), then two shelves (each its heading, a wide capsule and tall ones) and the
   * Add shelf row between two rules
   */
  function steamHomePage(busy) {
    const card = (w) => `<span><b></b>${txt(w, 'strong')}${txt(w * 0.7)}</span>`;
    const capsule = (i) => `<b${i === 0 ? ' data-wide' : ''}${busy ? ` style="--se-wf-i:${i}"` : ''}></b>`;
    return (
      '<div class="se-wf-page se-wf-sh">' +
      `<span class="se-wf-sh-news">${txt(90, 'strong')}<span class="se-wf-sh-cards">${[110, 90, 120, 100].map(card).join('')}</span></span>` +
      txt(110, 'strong') +
      `<span class="se-wf-sh-shelf">${repeat(7, capsule)}</span>` +
      txt(80, 'strong') +
      `<span class="se-wf-sh-shelf">${repeat(7, (i) => capsule(i + 7))}</span>` +
      `<span class="se-wf-sh-add"><i></i>${txt(70)}<i></i></span>` +
      '</div>'
    );
  }

  // Big Picture: its top bar, a hero with the game's logo and PLAY, a row of tall capsules
  function bigPicture() {
    return (
      `<div class="se-wf-bp"><span class="se-wf-bp-top">${ico()}${txt(90, 'strong')}${txt(60)}</span>` +
      '<span class="se-wf-bp-hero"><span class="se-wf-logo"><i></i><i></i></span><b class="se-wf-play"></b></span>' +
      `<span class="se-wf-bp-row">${repeat(6, (i) => `<b${i === 0 ? ' data-on' : ''}></b>`)}</span></div>`
    );
  }

  SE.wireframe = ({ alive = false, busy = false, view = 'library' } = {}) => build(alive, alive && busy, view);
})(window.__se);
