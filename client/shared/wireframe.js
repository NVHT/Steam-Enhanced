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
 */
((SE) => {
  if (!SE) return;

  const repeat = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join('');
  // A line of text; tone: '' (a line), 'strong', 'accent', 'green'
  const txt = (w, tone = '') => `<i class="se-wf-txt"${tone ? ` data-tone="${tone}"` : ''} style="width:calc(${w} * var(--u))"></i>`;
  const ico = () => '<b class="se-wf-ico"></b>';
  // A section's header: its chevron, label and count
  const head = (w) => `<span class="se-wf-head">${txt(w)}<i class="se-wf-count"></i></span>`;

  function build(alive, busy) {
    const turn = (i) => (alive ? ` data-turn style="--se-wf-turn:${i}"` : '');

    const rail =
      `<div class="se-wf-rail">${ico()}` +
      `<span class="se-wf-rail-nav"><span class="se-wf-rail-on">${ico()}</span>${ico()}${ico()}</span>` +
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

    return `<div class="se-wf"${alive ? ' data-alive' : ''}${busy ? ' data-busy' : ''}><span class="se-wf-sweep"></span>${rail}${list}${home}${friends}</div>`;
  }

  SE.wireframe = ({ alive = false, busy = false } = {}) => build(alive, alive && busy);
})(window.__se);
