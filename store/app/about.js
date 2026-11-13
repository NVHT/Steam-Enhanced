/*
 * Game page "About this game" (/app/<id>/...), under the summary strip: the whole description
 * under a heading, flowed into as many columns as keep it within one row's height. Nothing is
 * clipped and nothing scrolls on its own; short descriptions stay one short column.
 *
 * Steam's trailer player is no longer shown inline: the summary strip's trailer tiles open it
 * fullscreen (app/trailers.js). It must stay rendered for that (Steam's fullscreen view is the
 * player itself, raised into the top layer, and an element under display: none can't be), so
 * app/about.css takes it out of the layout without hiding it, and it is paused whenever its
 * fullscreen view is closed.
 *
 * Nothing of Steam's moves: its players measure and position themselves, and React breaks
 * when nodes leave its tree. The player column's parent becomes the layout ([data-se-about];
 * on the store today that is .game_media_and_summary_ctn > #game_highlights > .leftcol): the
 * About column is inserted beside the player column. Steam's own About section further down
 * is hidden; its content is cloned here. Styles: app/about.css.
 */
const ROOT_FLAG = 'se-app-about-on';

export default async (dom) => {
  const { el, ready, scope } = dom;
  await ready();

  const life = scope();
  const media = document.querySelector('.page_top_area .game_media_and_summary_ctn');
  const player = media?.querySelector('.highlight_ctn')?.closest('.leftcol') ?? media?.querySelector('.leftcol');
  const host = player?.parentElement;
  const source = document.getElementById('game_area_description');
  if (!media || !host || !source) return () => life.destroy();

  /* ---------- Description ---------- */

  const body = source.cloneNode(true);
  body.removeAttribute('id'); // Steam's id stays unique to its own (hidden) copy
  body.querySelector('h2')?.remove(); // "About This Game": our heading replaces it

  // Steam's own section (heading + autocollapse) is hidden once ours mounts.
  const original = source.closest('.game_page_autocollapse_ctn') ?? source.closest('#aboutThisGame') ?? source;
  original.setAttribute('data-se-about-source', '');

  /* ---------- Layout ---------- */

  const columns = el('div', { class: 'se-app-about__body' }, [body]);
  const about = el('section', { class: 'se-app-about', 'aria-labelledby': 'se-app-about-title' }, [
    el('h2', { class: 'se-app-about__title', id: 'se-app-about-title', text: 'About this game' }),
    columns,
  ]);

  host.setAttribute('data-se-about', '');
  host.append(about);
  document.documentElement.classList.add(ROOT_FLAG);

  /* ---------- Columns ----------
   * The text flows into balanced columns across the row. The column count is the fewest
   * that keep the row within its height (--se-about-row, which follows the window height), up
   * to as many as fit the width at
   * --se-about-column-min each. A short description stays one column and only as tall as its
   * text; one too long even for every column lets the row grow rather than clip.
   */
  const px = (style, name) => parseFloat(style.getPropertyValue(name)) || 0;

  /*
   * The row height is a clamp() of the window height, which getPropertyValue returns
   * unresolved: a zero-width probe sized by it gives the pixels.
   */
  const rowProbe = el('div', { class: 'se-app-about__probe', 'aria-hidden': 'true' });
  about.append(rowProbe);
  const rowHeight = () => rowProbe.getBoundingClientRect().height;

  let laidWidth = -1;
  let laidRow = -1;
  const layout = () => {
    const width = columns.clientWidth;
    if (!width) return;
    laidWidth = width;

    const style = getComputedStyle(columns);
    const row = rowHeight();
    laidRow = row;
    const minColumn = px(style, '--se-about-column-min');
    const gap = parseFloat(style.columnGap) || 0;
    const most = Math.max(1, Math.floor((width + gap) / (minColumn + gap)));

    let count = 1;
    for (; count < most; count += 1) {
      columns.style.columnCount = String(count);
      if (columns.offsetHeight <= row) break;
    }
    columns.style.columnCount = String(count);
    columns.dataset.seColumns = String(count);
  };

  // Width changes re-flow; the height changes this makes don't re-trigger it.
  const sizes = new ResizeObserver(() => {
    if (columns.clientWidth !== laidWidth) layout();
  });
  sizes.observe(columns);
  life.add(() => sizes.disconnect());
  // The row follows the window height too.
  life.listen(window, 'resize', () => {
    if (rowHeight() !== laidRow) layout();
  });
  /*
   * Banner images and videos (Steam's feature art, often the whole description) fill their
   * column, so image-only descriptions leave no gaps; small inline images and icons keep their
   * size. Known once each one has loaded its dimensions.
   */
  const WIDE_MEDIA = 240;
  /*
   * Tall art (a long infographic) can't break across columns, so it would stretch the row and
   * leave the columns beside it empty: it is capped at the row's height instead, whole.
   */
  const TALL_MEDIA = 1.4; // height / width
  const sizeMedia = () => {
    for (const media of body.querySelectorAll('img, video')) {
      const width = media.naturalWidth || media.videoWidth || 0;
      const height = media.naturalHeight || media.videoHeight || 0;
      if (!width) continue;
      media.toggleAttribute('data-se-wide', width >= WIDE_MEDIA);
      media.toggleAttribute('data-se-tall', height / width > TALL_MEDIA);
    }
  };
  const relayout = () => {
    sizeMedia();
    layout();
  };

  // Images, videos and the theme font change the text's height once they arrive.
  life.listen(columns, 'load', relayout, true);
  life.listen(columns, 'loadedmetadata', relayout, true);
  document.fonts?.ready.then(() => {
    if (about.isConnected) layout();
  });
  relayout();

  /* ---------- Steam's player, kept for the fullscreen view ---------- */

  // Paused whenever its fullscreen view is closed, so the off-page player never plays on.
  const pauseAll = () => player.querySelectorAll('video').forEach((video) => video.pause());
  const popover = player.querySelector('[popover]');
  if (popover) {
    life.listen(popover, 'toggle', (event) => {
      if (event.newState === 'closed') pauseAll();
    });
  }
  // Steam autoplays the first trailer once it loads; stop it while no fullscreen view is up
  // (Steam's own: its [popover] open, or the browser's fullscreen on one of its parts).
  const viewing = () => Boolean(popover?.matches(':popover-open') || (document.fullscreenElement && player.contains(document.fullscreenElement)));
  life.listen(player, 'play', () => {
    if (!viewing()) pauseAll();
  }, true);
  life.listen(document, 'fullscreenchange', () => {
    if (!viewing()) pauseAll();
  });
  pauseAll();

  return () => {
    life.destroy();
    about.remove();
    host.removeAttribute('data-se-about');
    original.removeAttribute('data-se-about-source');
    document.documentElement.classList.remove(ROOT_FLAG);
  };
};
