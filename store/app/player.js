/*
 * The theme's video player, for trailers in the game page viewer (app/viewer.js).
 *
 *   const player = createPlayer(dom);
 *   stage.append(player.element);
 *   await player.load({ hls, mp4, poster, title });   // true once it can play
 *   player.unload();  player.destroy();
 *
 * Steam streams trailers as HLS (and DASH). HLS plays natively where the browser can, else
 * through hls.js (ES module build, store/vendor/hls.min.js), imported on first use.
 * A plain MP4 / WebM plays as is. load() resolves false when nothing here can play the trailer,
 * so the caller can fall back to Steam's own player.
 *
 * Controls: play / pause, seek (with buffered range), time, mute + volume, quality (HLS levels,
 * "Auto" first), fullscreen. Keys while the player has focus: Space / K play-pause, M mute,
 * F fullscreen, J / L back / forward 10 s. The bar fades out while playing and the pointer
 * rests; any movement brings it back.
 */

/** hls.js, ES module build. Served as .js: Millennium's file server doesn't label .mjs as JavaScript. */
const VENDOR = '../vendor/hls.min.js';
/** How long a source may take to show its first frame's metadata before the next is tried. */
const LOAD_TIMEOUT_MS = 10000;
const IDLE_MS = 2200;
const STEP_S = 10;

/** hls.js, imported once from the theme's vendor folder. */
let hlsLibrary = null;

const loadHls = () => {
  hlsLibrary ??= (async () => {
    const url = new URL(VENDOR, import.meta.url);
    url.search = new URL(import.meta.url).search;
    try {
      const { default: Hls } = await import(url.href);
      if (Hls?.isSupported?.()) return Hls;
    } catch (error) {
      console.debug('[Steam Enhanced] hls.js not loaded', error);
    }
    console.warn('[Steam Enhanced] hls.js unavailable; trailers fall back to Steam\'s player');
    return null;
  })();
  return hlsLibrary;
};

const time = (seconds) => {
  if (!Number.isFinite(seconds)) return '0:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};

export const createPlayer = ({ el, scope }) => {
  const life = scope();
  let hls = null;
  let ticket = 0;

  const video = el('video', { class: 'se-player__video', playsInline: true, preload: 'metadata' });
  const button = (mod, label) => el('button', { class: `se-player__btn se-player__btn--${mod}`, type: 'button', 'aria-label': label, title: label });

  const play = button('play', 'Play');
  const mute = button('mute', 'Mute');
  const volume = el('input', { class: 'se-player__volume', type: 'range', min: '0', max: '1', step: '0.05', value: '1', 'aria-label': 'Volume' });
  const clock = el('span', { class: 'se-player__time', 'aria-hidden': 'true' });
  const seek = el('input', { class: 'se-player__seek', type: 'range', min: '0', max: '1000', step: '1', value: '0', 'aria-label': 'Seek' });
  const quality = el('select', { class: 'se-player__quality', 'aria-label': 'Quality' });
  const full = button('full', 'Fullscreen');
  const big = button('big', 'Play');
  const status = el('div', { class: 'se-player__status', role: 'status' });

  const bar = el('div', { class: 'se-player__bar' }, [
    seek,
    el('div', { class: 'se-player__row' }, [
      play,
      el('div', { class: 'se-player__sound' }, [mute, volume]),
      clock,
      el('span', { class: 'se-player__spacer' }),
      quality,
      full,
    ]),
  ]);
  const element = el('div', { class: 'se-player', tabIndex: 0, 'data-se-paused': '' }, [video, big, status, bar]);

  /* ---------- State → controls ---------- */

  const renderPlay = () => {
    const paused = video.paused;
    element.toggleAttribute('data-se-paused', paused);
    const label = paused ? 'Play' : 'Pause';
    play.setAttribute('aria-label', label);
    play.title = label;
  };

  const renderTime = () => {
    const duration = video.duration;
    if (document.activeElement !== seek && Number.isFinite(duration) && duration > 0) {
      seek.value = String(Math.round((video.currentTime / duration) * 1000));
    }
    const buffered = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
    seek.style.setProperty('--se-played', `${(Number(seek.value) / 10).toFixed(2)}%`);
    seek.style.setProperty('--se-buffered', Number.isFinite(duration) && duration > 0 ? `${((buffered / duration) * 100).toFixed(2)}%` : '0%');
    clock.textContent = `${time(video.currentTime)} / ${time(duration)}`;
  };

  const renderSound = () => {
    const silent = video.muted || video.volume === 0;
    element.toggleAttribute('data-se-muted', silent);
    const label = silent ? 'Unmute' : 'Mute';
    mute.setAttribute('aria-label', label);
    mute.title = label;
    volume.value = String(video.muted ? 0 : video.volume);
    volume.style.setProperty('--se-level', `${Number(volume.value) * 100}%`);
  };

  const setStatus = (text) => {
    status.textContent = text;
    status.hidden = !text;
  };

  /** HLS levels as the quality menu: "Auto", then each height, highest first. */
  const renderLevels = () => {
    const levels = hls?.levels ?? [];
    quality.hidden = levels.length < 2;
    if (quality.hidden) return;
    const options = levels
      .map((level, i) => ({ i, height: level.height || 0 }))
      .filter((level) => level.height)
      .sort((a, b) => b.height - a.height);
    quality.replaceChildren(
      el('option', { value: '-1', text: 'Auto' }),
      ...options.map((level) => el('option', { value: String(level.i), text: `${level.height}p` })),
    );
    quality.value = String(hls.autoLevelEnabled ? -1 : hls.currentLevel);
  };

  /* ---------- Controls → video ---------- */

  const toggle = () => (video.paused ? video.play().catch(() => {}) : video.pause());
  const toggleFull = () => (document.fullscreenElement === element ? document.exitFullscreen() : element.requestFullscreen?.());

  life.listen(play, 'click', toggle);
  life.listen(big, 'click', toggle);
  life.listen(video, 'click', toggle);
  life.listen(video, 'dblclick', toggleFull);
  life.listen(full, 'click', toggleFull);
  life.listen(mute, 'click', () => {
    if (video.muted || video.volume === 0) {
      video.muted = false;
      if (video.volume === 0) video.volume = 0.5;
    } else {
      video.muted = true;
    }
  });
  life.listen(volume, 'input', () => {
    video.volume = Number(volume.value);
    video.muted = video.volume === 0;
  });
  life.listen(seek, 'input', () => {
    if (Number.isFinite(video.duration)) video.currentTime = (Number(seek.value) / 1000) * video.duration;
    renderTime();
  });
  life.listen(quality, 'change', () => {
    if (hls) hls.currentLevel = Number(quality.value); // -1: back to automatic
  });

  for (const type of ['play', 'pause', 'ended']) life.listen(video, type, renderPlay);
  for (const type of ['timeupdate', 'durationchange', 'progress', 'seeked', 'loadedmetadata']) life.listen(video, type, renderTime);
  life.listen(video, 'volumechange', renderSound);
  life.listen(video, 'waiting', () => element.setAttribute('data-se-waiting', ''));
  for (const type of ['playing', 'canplay', 'pause']) life.listen(video, type, () => element.removeAttribute('data-se-waiting'));
  life.listen(document, 'fullscreenchange', () => element.toggleAttribute('data-se-full', document.fullscreenElement === element));

  /* Keys while focus is in the player (the viewer keeps ← / → for stepping between trailers). */
  life.listen(element, 'keydown', (event) => {
    if (event.target === volume || event.target === seek || event.target === quality) return;
    const key = event.key.toLowerCase();
    if (key === ' ' || key === 'k') toggle();
    else if (key === 'm') mute.click();
    else if (key === 'f') toggleFull();
    else if (key === 'j') video.currentTime = Math.max(0, video.currentTime - STEP_S);
    else if (key === 'l') video.currentTime = Math.min(video.duration || Infinity, video.currentTime + STEP_S);
    else return;
    event.preventDefault();
    event.stopPropagation();
  });

  /* The bar rests out of sight while playing and the pointer is still. */
  let idle = 0;
  const wake = () => {
    element.removeAttribute('data-se-idle');
    clearTimeout(idle);
    idle = setTimeout(() => {
      if (!video.paused && !bar.matches(':hover, :focus-within')) element.setAttribute('data-se-idle', '');
    }, IDLE_MS);
  };
  life.listen(element, 'pointermove', wake);
  life.listen(element, 'keydown', wake);
  life.listen(video, 'play', wake);
  life.add(() => clearTimeout(idle));

  /* ---------- Loading ---------- */

  const unload = () => {
    ticket += 1;
    hls?.destroy();
    hls = null;
    video.pause();
    video.removeAttribute('src');
    video.removeAttribute('poster');
    video.load();
    quality.hidden = true;
    setStatus('');
    renderPlay();
    renderTime();
  };

  /**
   * Load a trailer and start it. Order: hls.js (adaptive, with the quality menu), the
   * browser's own HLS where it claims it (Chromium can answer "maybe" yet never load, so it is
   * timed out), then MP4 / WebM. Resolves true when playback can start, false when nothing here
   * can play it.
   */
  const load = async ({ hls: manifest, mp4, poster, title } = {}) => {
    unload();
    const mine = ticket;
    if (poster) video.poster = poster;
    element.setAttribute('aria-label', title ? `Trailer: ${title}` : 'Trailer');
    setStatus('Loading…');

    const ready = () =>
      new Promise((resolve) => {
        const done = (ok) => {
          clearTimeout(timer);
          video.removeEventListener('loadedmetadata', yes);
          video.removeEventListener('error', no);
          resolve(ok);
        };
        const yes = () => done(true);
        const no = () => done(false);
        const timer = setTimeout(no, LOAD_TIMEOUT_MS);
        video.addEventListener('loadedmetadata', yes, { once: true });
        video.addEventListener('error', no, { once: true });
      });

    let ok = false;
    if (manifest) {
      const Hls = await loadHls();
      if (mine !== ticket) return false;
      if (Hls) {
        hls = new Hls({ capLevelToPlayerSize: true, startLevel: -1 });
        const parsed = new Promise((resolve) => {
          const timer = setTimeout(() => resolve(false), LOAD_TIMEOUT_MS);
          hls.once(Hls.Events.MANIFEST_PARSED, () => {
            clearTimeout(timer);
            resolve(true);
          });
          hls.on(Hls.Events.ERROR, (_, data) => {
            if (!data.fatal) return;
            console.warn('[Steam Enhanced] trailer stream failed:', data.type, data.details);
            clearTimeout(timer);
            resolve(false);
          });
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, () => {
          if (quality.value !== '-1') quality.value = String(hls.currentLevel);
        });
        hls.loadSource(manifest);
        hls.attachMedia(video);
        ok = await parsed;
        if (ok) renderLevels();
        else {
          hls.destroy();
          hls = null;
        }
      }
    }
    if (!ok && manifest && mine === ticket && video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = manifest;
      ok = await ready();
    }
    if (!ok && mp4 && mine === ticket) {
      video.src = mp4;
      ok = await ready();
    }
    if (mine !== ticket) return false;
    setStatus('');
    if (ok) {
      renderSound();
      video.play().catch(() => renderPlay()); // autoplay may be refused: the big play button stays
    }
    return ok;
  };

  renderPlay();
  renderTime();
  renderSound();
  quality.hidden = true;
  setStatus('');

  return {
    element,
    load,
    unload,
    focus: () => element.focus({ preventScroll: true }),
    destroy() {
      unload();
      life.destroy();
      element.remove();
    },
  };
};
