/*
 * Media viewer for the game page: a modal <dialog> with the current item, prev / next, a
 * counter and a thumbnail rail. Screenshots show as images; trailers play in the theme's own
 * player (app/player.js, passed in as createPlayer). Steam's own viewer can't be opened
 * reliably from outside its player (its handlers sit on markup that changes), so the theme
 * shows the media itself.
 *
 *   const viewer = createViewer(dom, { createPlayer });
 *   viewer.open([{ full, tile }, ...], index);                                   // screenshots
 *   viewer.open([{ video: { hls, mp4 }, tile, title }, ...], index, {
 *     noun: 'Trailer', onFail: (i) => ... });    // a trailer this player can't play → onFail
 *   viewer.destroy();
 *
 * Keys: ← / → step (wrapping), Home / End jump, Esc closes (native to <dialog>); the player
 * takes its own keys while focused. Clicking the dark backdrop closes too. Neighbouring
 * shots are preloaded so stepping feels instant. Styles: app/summary.css (.se-viewer).
 */
export const createViewer = (dom, { createPlayer } = {}) => {
  const { el, scope } = dom;
  const life = scope();
  let shots = [];
  let index = 0;
  let noun = 'Screenshot';
  let onFail = null;
  let player = null; // made on the first trailer

  const image = el('img', { class: 'se-viewer__image', alt: '', decoding: 'async' });
  const counter = el('span', { class: 'se-viewer__count', 'aria-live': 'polite' });
  const rail = el('div', { class: 'se-viewer__rail', role: 'list', 'aria-label': 'Screenshots' });
  const button = (mod, label) => el('button', { class: `se-viewer__btn se-viewer__btn--${mod}`, type: 'button', 'aria-label': label });
  const prev = button('prev', 'Previous screenshot');
  const next = button('next', 'Next screenshot');
  const close = button('close', 'Close');

  const dialog = el('dialog', { class: 'se-viewer', 'aria-label': 'Screenshots' }, [
    el('div', { class: 'se-viewer__top' }, [counter, close]),
    el('div', { class: 'se-viewer__stage' }, [prev, image, next]),
    rail,
  ]);

  const preload = (i) => {
    const shot = shots[(i + shots.length) % shots.length];
    if (shot?.full) new Image().src = shot.full;
  };

  /** A trailer: the player takes the image's place and starts it; a failure hands it back. */
  const showVideo = (shot) => {
    if (!player && createPlayer) {
      player = createPlayer(dom);
      player.element.classList.add('se-viewer__player');
      next.before(player.element);
    }
    image.hidden = true;
    if (!player) {
      onFail?.(index);
      return;
    }
    player.element.hidden = false;
    const at = index;
    player.load({ ...shot.video, poster: shot.full || shot.tile, title: shot.title }).then((ok) => {
      if (!ok && at === index && dialog.open) onFail?.(at);
    });
    player.focus();
  };

  const show = (i) => {
    if (!shots.length) return;
    index = (i + shots.length) % shots.length;
    const shot = shots[index];
    counter.textContent = `${index + 1} / ${shots.length}`;
    [...rail.children].forEach((thumb, n) => thumb.toggleAttribute('aria-current', n === index));
    rail.children[index]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    if (shot.video) {
      showVideo(shot);
      return;
    }
    if (player) {
      player.unload();
      player.element.hidden = true;
    }
    image.hidden = false;
    image.dataset.seLoading = '';
    // The full file first; a store that never had one falls back to the tile size.
    image.onerror = () => {
      image.onerror = null;
      image.src = shot.tile;
    };
    image.onload = () => delete image.dataset.seLoading;
    image.src = shot.full;
    image.alt = `${noun} ${index + 1} of ${shots.length}`;
    preload(index + 1);
    preload(index - 1);
  };

  const fillRail = () => {
    rail.replaceChildren(
      ...shots.map((shot, n) => {
        const thumb = el('button', {
          class: 'se-viewer__thumb',
          type: 'button',
          role: 'listitem',
          title: shot.title || null,
          'aria-label': shot.title || `${noun} ${n + 1}`,
          'data-se-video': shot.video ? '' : null,
        }, [el('img', { src: shot.tile, alt: '', loading: 'lazy', decoding: 'async' })]);
        thumb.addEventListener('click', () => show(n));
        return thumb;
      }),
    );
    const single = shots.length < 2;
    rail.hidden = single;
    prev.hidden = single;
    next.hidden = single;
  };

  life.listen(prev, 'click', () => show(index - 1));
  life.listen(next, 'click', () => show(index + 1));
  life.listen(close, 'click', () => dialog.close());
  // A click whose target is the dialog itself landed on the backdrop / empty frame.
  life.listen(dialog, 'click', (event) => {
    if (event.target === dialog || event.target.classList?.contains('se-viewer__stage')) dialog.close();
  });
  life.listen(dialog, 'keydown', (event) => {
    if (event.target.matches?.('input, select, textarea')) return; // the player's sliders and menu keep their keys
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (step) show(index + step);
    else if (event.key === 'Home') show(0);
    else if (event.key === 'End') show(shots.length - 1);
    else return;
    event.preventDefault();
  });
  // A mouse wheel scrolls the rail sideways (trackpads already scroll it horizontally).
  life.listen(rail, 'wheel', (event) => {
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY) || rail.scrollWidth <= rail.clientWidth) return;
    rail.scrollBy({ left: event.deltaY });
    event.preventDefault();
  }, { passive: false });
  // Keep the page still behind the viewer; a closed viewer stops its trailer.
  life.listen(dialog, 'close', () => {
    document.documentElement.classList.remove('se-viewer-open');
    player?.unload();
  });

  return {
    /** Open on `list[start]`; the list is copied, so later page changes don't shift it. */
    open(list, start = 0, options = {}) {
      if (!list.length) return;
      noun = options.noun ?? 'Screenshot';
      onFail = options.onFail ?? null;
      shots = list.map(({ full, tile, video, title }) => ({ full, tile, video, title }));
      const label = `${noun}s`;
      dialog.setAttribute('aria-label', label);
      rail.setAttribute('aria-label', label);
      prev.setAttribute('aria-label', `Previous ${noun.toLowerCase()}`);
      next.setAttribute('aria-label', `Next ${noun.toLowerCase()}`);
      if (!dialog.isConnected) document.body.append(dialog);
      fillRail();
      if (!dialog.open) dialog.showModal();
      document.documentElement.classList.add('se-viewer-open');
      show(start);
      if (!shots[index]?.video) (shots.length > 1 ? next : close).focus({ preventScroll: true });
    },
    close() {
      if (dialog.open) dialog.close();
    },
    destroy() {
      if (dialog.open) dialog.close();
      player?.destroy();
      life.destroy();
      dialog.remove();
    },
  };
};
