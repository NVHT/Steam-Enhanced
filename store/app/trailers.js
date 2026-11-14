/*
 * The game page's trailers, read from and played through Steam's own React media carousel
 * (.gamehighlight_desktopcarousel), for app/summary.js's trailer tiles. The player itself is
 * kept off the layout by app/about.css and only shown through its fullscreen view.
 *
 * The carousel is two wrapper divs around: the player (the one element with [popover], which
 * is also Steam's fullscreen "Trailers & Screenshots" overlay), hidden panels, and the
 * thumbnail strip, whose items are an <img> each; trailer items also carry a play icon (<svg>),
 * and the selected item has one class more than the rest. Class names are hashed per build,
 * so everything is found by structure. Titles and thumbnails come from the carousel's
 * data-props ({ trailers: [...] }) when they parse, else from the strip and "Trailer N".
 *
 * readTrailerMedia() adds each trailer's video sources for the theme's own player; where it
 * finds none (or the player can't play them), openTrailer() plays the trailer in Steam's own
 * player instead: it selects the strip item and brings up Steam's fullscreen view.
 */

export const findCarousel = () => document.querySelector('.gamehighlight_desktopcarousel');

const squash = (text) => (text ?? '').replace(/\s+/g, ' ').trim();
const pickString = (object, keys) => keys.map((key) => object?.[key]).find((value) => typeof value === 'string' && value.trim()) ?? '';

const propsTrailers = (carousel) => {
  try {
    const list = JSON.parse(carousel?.dataset.props ?? '{}').trailers;
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

/** The strip's trailer items in order: { item, selected, title, thumb }. */
export const readTrailers = (carousel = findCarousel()) => {
  const props = propsTrailers(carousel);
  const items = [...(carousel?.querySelectorAll(':scope > div > div > :not([popover]) img') ?? [])]
    .map((img) => img.parentElement)
    .filter((item, i, all) => item && all.indexOf(item) === i);
  const trailers = items.filter((item) => item.querySelector('svg'));
  // The selected item is the one with an extra class.
  const base = Math.min(...items.map((item) => item.classList.length));
  return trailers.map((item, i) => ({
    item,
    selected: items.length > 1 && item.classList.length > base,
    title: squash(pickString(props[i], ['name', 'title', 'strName', 'label'])) || `Trailer ${i + 1}`,
    thumb: pickString(props[i], ['thumbnail', 'poster', 'screenshot']) || item.querySelector('img')?.src || '',
  }));
};

/* ---------- Video sources, for the theme's own player (app/player.js) ---------- */

/*
 * Where each trailer's files are: the carousel's data-props first, else the store's own
 * /api/appdetails (filters=movies), fetched once per page. Field names differ between the
 * two and between store builds, so each entry is searched for its URLs by what they are:
 *   hls   an .m3u8 manifest (H.264 preferred over other codecs)
 *   mp4   a progressive .mp4 / .webm file (the largest named "max" preferred)
 */
const urlsIn = (value, found = []) => {
  if (typeof value === 'string') {
    if (/^https?:\/\//.test(value)) found.push(value);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) urlsIn(item, found);
  }
  return found;
};

const pickSources = (entry) => {
  const urls = urlsIn(entry);
  const manifests = urls.filter((url) => /\.m3u8(?:[?#]|$)/i.test(url));
  const files = urls.filter((url) => /\.(?:mp4|webm)(?:[?#]|$)/i.test(url) && !/microtrailer/i.test(url));
  const hls = manifests.find((url) => /h264|264/i.test(url)) ?? manifests[0] ?? '';
  const mp4 = files.find((url) => /max/i.test(url) && /\.mp4/i.test(url)) ?? files.find((url) => /\.mp4/i.test(url)) ?? files[0] ?? '';
  return hls || mp4 ? { hls, mp4 } : null;
};

const appId = () => /\/app\/(\d+)/.exec(location.pathname)?.[1] ?? null;
let storeMovies = null;
const fetchStoreMovies = () => {
  const id = appId();
  storeMovies ??= id
    ? fetch(`/api/appdetails?appids=${id}&filters=movies`, { credentials: 'same-origin' })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => data?.[id]?.data?.movies ?? [])
        .catch(() => [])
    : Promise.resolve([]);
  return storeMovies;
};

/**
 * Trailers with their sources: [{ title, thumb, hls, mp4 }], in the strip's order. A trailer
 * without playable sources keeps hls / mp4 empty (the caller falls back to Steam's player).
 */
export const readTrailerMedia = async (carousel = findCarousel()) => {
  const trailers = readTrailers(carousel);
  const props = propsTrailers(carousel);
  let movies = null;
  const result = [];
  for (const [i, trailer] of trailers.entries()) {
    let sources = pickSources(props[i]);
    if (!sources) {
      movies ??= await fetchStoreMovies();
      const match = movies.find((movie) => squash(movie?.name) === trailer.title) ?? movies[i];
      sources = pickSources(match);
    }
    result.push({ title: trailer.title, thumb: trailer.thumb, hls: sources?.hls ?? '', mp4: sources?.mp4 ?? '' });
  }
  return result;
};

/** Switch Steam's player to trailer `index` (as a click on its strip item would). */
export const selectTrailer = (index, carousel = findCarousel()) => {
  readTrailers(carousel)[index]?.item.click();
};

/*
 * Steam's own control for the overlay: a button in the player whose label names fullscreen /
 * expanding (labels are localised, so English and the common forms only). Without one, the
 * player's [popover] is shown directly, which is what that button does.
 */
const EXPAND = /full\s*-?\s*screen|expand|enlarge|maximi[sz]e/i;

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

/**
 * Open Steam's overlay, select trailer `index` in it, and start it playing. The overlay opens
 * first: app/about.js pauses any play that starts while it is closed, and Steam starts loading
 * a trailer the moment it is selected, so selecting first left its stream paused mid-load
 * (stuck at 0:00 behind Steam's spinner).
 */
export const openTrailer = async (index, carousel = findCarousel()) => {
  const player = carousel?.querySelector('[popover]');
  if (!player) return false;

  if (!player.matches(':popover-open')) {
    const expand = [...player.querySelectorAll('button, [role="button"]')].find((button) =>
      EXPAND.test(`${button.getAttribute('aria-label') ?? ''} ${button.title ?? ''}`),
    );
    if (expand) expand.click();
    else {
      try {
        player.showPopover();
      } catch {
        return false;
      }
    }
    await nextFrame();
  }

  selectTrailer(index, carousel);
  await nextFrame(); // React swaps the slide on its next render

  // The slide on screen holds the selected trailer's video; the track keeps the others mounted.
  const video = [...player.querySelectorAll('video')].find((node) => {
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.right > 0 && box.left < innerWidth;
  });
  video?.play?.().catch(() => {}); // autoplay rules may refuse; Steam's own play button remains
  return true;
};
