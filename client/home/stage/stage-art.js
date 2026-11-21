/*
 * The Home stage's background art beyond its picture (stage-settings.js "Background art"):
 *   parallax   the art follows the pointer a little, the blurred fill behind it the other way
 *   shots      the game's store screenshots, cross-fading one after another
 *   trailer    the game's trailer (mature ones too), muted, on repeat: its full stream
 *              (hls.js) at the quality the view shows, else its micro-trailer, else its
 *              screenshots
 * Screenshots and trailers come from Steam's store item cache (StoreItemCache, asked once per
 * game with include_screenshots / include_trailers), screenshots at full size; a game without
 * them keeps its art. Only
 * the layer on show gets them; they pause while the stage is out of sight and stay off under
 * reduced motion. stage.js calls paintArtMedia() from select(), and
 * stopArtMedia() on teardown; stage-hero.css draws them.
 */
((SE) => {
  const ns = window.__seHomeStageParts;
  if (!ns) return;
  const { live, reducedMotion } = ns;
  const { run } = SE;

  // Seconds each screenshot stays before the next fades in
  const SHOT_SECONDS = 7;
  // Screenshots taken per game
  const SHOTS_MAX = 8;
  // The art's furthest move under the pointer, in percent of the stage
  const PARALLAX = 1.6;

  const storeCache = () => SE.global('StoreItemCache', (c) => typeof c.GetApp === 'function');

  /* ---------- Steam's store data ---------- */

  /*
   * A screenshot at its full size: Steam's list can name a scaled copy (ss_….600x338.jpg); the
   * name without the size is the picture as uploaded (1920 × 1080 or more)
   */
  const fullShot = (url) => url.replace(/\.\d+x\d+(\.(?:jpe?g|png|webp))(?=[?#]|$)/i, '$1');

  // appid → Promise of { shots: [{ url, scaled }], hls: manifest url | '', micro: url | '' }
  const media = new Map();

  function mediaOf(appid) {
    let p = media.get(appid);
    if (p) return p;
    const cache = storeCache();
    if (!cache) return Promise.resolve({ shots: [], hls: '', micro: '' });
    p = Promise.resolve(run(() => cache.QueueAppRequest(appid, { include_screenshots: true, include_trailers: true })))
      .catch(() => null)
      .then(() => {
        const item = run(() => cache.GetApp(appid));
        const shots = (run(() => item.GetScreenshots(true)) || []).slice(0, SHOTS_MAX).map((url) => ({ url: fullShot(url), scaled: url }));
        // The highlight trailers first (the store page's own), mature ones too
        const trailers = run(() => item.GetAllTrailers()?.GetAllTrailers(false)) || [];
        let hls = '';
        let micro = '';
        for (const t of trailers) {
          hls ||= run(() => t.GetTrailerHls()) || '';
          const m = run(() => t.GetMicroTrailer());
          micro ||= m?.strWebMURL || m?.strMP4URL || '';
          if (hls && micro) break;
        }
        return { shots, hls, micro };
      });
    media.set(appid, p);
    return p;
  }

  /*
   * hls.js (its classic build, shared with the Store's trailer player: web/store/vendor), added
   * once on first use from the theme folder, found by the client loader's own address
   */
  let hlsLibrary = null;
  function loadHls() {
    hlsLibrary ??= new Promise((resolve) => {
      if (window.Hls) {
        resolve();
        return;
      }
      const self = [...document.scripts].find((el) => /\/client\/loader\.js(?:[?#]|$)/.test(el.src))?.src;
      if (!self) {
        resolve();
        return;
      }
      const url = new URL('../web/store/vendor/hls.min.js', self);
      url.search = new URL(self).search;
      const script = document.createElement('script');
      script.src = url.href;
      script.dataset.seFeature = 'hls';
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', resolve, { once: true });
      (document.head ?? document.documentElement).append(script);
    }).then(() => (window.Hls?.isSupported?.() ? window.Hls : null));
    return hlsLibrary;
  }

  /* ---------- The layer on show ---------- */

  // The screenshots' turn
  let timer = 0;
  // The trailer's check on whether the stage is in sight (SE.poll)
  let sight = null;
  // The trailer's stream (hls.js), torn down with it
  let hlsPlayer = null;
  let mediaLayer = null;

  const mode = () => (reducedMotion.matches ? 'still' : ns.stageSettings().motion);
  const idle = () => document.visibilityState !== 'visible' || !live.stage || !SE.visible(live.stage);

  function clearMedia(layer) {
    hlsPlayer?.destroy();
    hlsPlayer = null;
    layer?.querySelectorAll('.se-hs-media').forEach((el) => {
      el.querySelector('video')?.pause();
      el.remove();
    });
    layer?.removeAttribute('data-media');
    if (layer) delete layer.dataset.want;
  }

  // The window hidden: SE.poll rests then, so the trailer is paused here and played again by
  // the poll's first tick on return
  let pauseHidden = null;

  function stopSight() {
    sight?.disconnect();
    sight = null;
    if (pauseHidden) document.removeEventListener('visibilitychange', pauseHidden);
    pauseHidden = null;
  }

  function stopArtMedia() {
    clearInterval(timer);
    timer = 0;
    stopSight();
    clearMedia(mediaLayer);
    mediaLayer = null;
    setPointer(0, 0);
  }

  // A full-view box over the art for screenshots or a video; shown once something in it plays
  function mediaBox(layer, kind) {
    const box = document.createElement('div');
    box.className = 'se-hs-media';
    box.dataset.kind = kind;
    layer.appendChild(box);
    return box;
  }

  function showShots(layer, shots) {
    const box = mediaBox(layer, 'shots');
    const imgs = shots.map(({ url, scaled }) => {
      const img = document.createElement('img');
      img.className = 'se-hs-shot';
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.dataset.src = url;
      // The full size missing: Steam's scaled copy, then none
      img.addEventListener('error', () => {
        if (img.src !== scaled && scaled !== url) {
          img.src = scaled;
          return;
        }
        img.dataset.dead = '';
        img.remove();
      });
      return img;
    });
    // Puts a screenshot in the box (it starts loading)
    const load = (img) => {
      if (img.parentElement || 'dead' in img.dataset) return;
      img.src = img.dataset.src;
      box.appendChild(img);
    };
    let i = -1;
    const next = () => {
      if (!box.isConnected) return;
      for (let n = 0; n < imgs.length; n++) {
        i = (i + 1) % imgs.length;
        if (!('dead' in imgs[i].dataset)) break;
      }
      const img = imgs[i];
      if ('dead' in img.dataset) return;
      load(img);
      const on = () => {
        box.querySelectorAll('.se-hs-shot[data-on]').forEach((o) => o !== img && o.removeAttribute('data-on'));
        img.setAttribute('data-on', '');
        layer.setAttribute('data-media', '');
      };
      if (img.complete && img.naturalWidth) on();
      else img.addEventListener('load', on, { once: true });
      // The next one loads now, so it's ready when its turn comes
      load(imgs[(i + 1) % imgs.length]);
    };
    next();
    if (imgs.length > 1) {
      timer = setInterval(() => {
        if (!idle()) next();
      }, SHOT_SECONDS * 1000);
    }
  }

  /*
   * The game's trailer, muted, on a loop: its full stream through hls.js at the quality the view
   * can show (capped to the stage's size, starting high), else its micro-trailer (a short,
   * small loop); neither, or both failing, its screenshots (showShots), then the art
   */
  async function showVideo(layer, { hls, micro, shots }) {
    const box = mediaBox(layer, 'trailer');
    const toShots = () => {
      clearInterval(timer);
      timer = 0;
      stopSight();
      hlsPlayer?.destroy();
      hlsPlayer = null;
      box.remove();
      layer.removeAttribute('data-media');
      if (shots.length && mediaLayer === layer) showShots(layer, shots);
      else clearMedia(layer);
    };
    const v = document.createElement('video');
    v.className = 'se-hs-video';
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.setAttribute('aria-hidden', 'true');
    v.addEventListener('playing', () => layer.setAttribute('data-media', ''), { once: true });
    box.appendChild(v);
    const current = () => box.isConnected && mediaLayer === layer;

    let streaming = false;
    const Hls = hls ? await loadHls() : null;
    if (!current()) return;
    if (Hls) {
      const player = new Hls({
        capLevelToPlayerSize: true,
        startLevel: -1,
        // A first guess of a fast line, so it opens at a sharp level rather than climbing to one
        abrEwmaDefaultEstimate: 8e6,
        maxBufferLength: 20,
      });
      player.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal || hlsPlayer !== player) return;
        player.destroy();
        hlsPlayer = null;
        if (micro && current()) v.src = micro;
        else if (current()) toShots();
      });
      player.loadSource(hls);
      player.attachMedia(v);
      hlsPlayer = player;
      streaming = true;
    } else if (micro) {
      v.src = micro;
    } else {
      toShots();
      return;
    }
    // The micro-trailer failing too (the stream's errors come through hls.js)
    v.addEventListener('error', () => {
      if (current() && (!streaming || !hlsPlayer)) toShots();
    });
    if (!idle()) run(() => v.play()?.catch(() => {}));
    // Out of sight (another page over Home): paused, playing again on return. Polled: Steam has
    // no event for a page covering Home.
    stopSight();
    sight = SE.poll(() => {
      if (idle()) v.pause();
      else if (v.paused) run(() => v.play()?.catch(() => {}));
    }, 1500, { active: current });
    pauseHidden = () => {
      if (document.visibilityState === 'hidden') v.pause();
    };
    document.addEventListener('visibilitychange', pauseHidden);
  }

  /** The background for the game on show, by the setting: called whenever select() runs. */
  function paintArtMedia() {
    const stage = live.stage;
    const app = live.apps[live.selected];
    const layer = stage?.querySelectorAll('.se-hs-layer')[live.selected];
    const m = mode();
    const want = m === 'shots' || m === 'trailer' ? `${m}:${app?.appid}` : '';
    if (layer === mediaLayer && layer?.dataset.want === want) return;
    stopArtMedia();
    if (!layer || !app || !want) return;
    mediaLayer = layer;
    layer.dataset.want = want;
    mediaOf(app.appid).then(({ shots, hls, micro }) => {
      if (mediaLayer !== layer || layer.dataset.want !== want || !layer.isConnected) return;
      // Trailer: a game without one shows its screenshots
      if (m === 'trailer' && (hls || micro)) showVideo(layer, { hls, micro, shots });
      else if (shots.length) showShots(layer, shots);
    });
  }

  /* ---------- Parallax ---------- */

  let frame = 0;
  let px = 0;
  let py = 0;

  function setPointer(x, y) {
    px = x;
    py = y;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!live.stage) return;
      SE.cssVar(live.stage, '--se-hs-px', `${(px * PARALLAX).toFixed(2)}%`);
      SE.cssVar(live.stage, '--se-hs-py', `${(py * PARALLAX).toFixed(2)}%`);
    });
  }

  // Over the stage: -1 … 1 from its middle, the art moving against the pointer; off it, centred
  function onPointerMove(e) {
    const stage = live.stage;
    if (!stage || mode() !== 'parallax') return;
    if (!stage.contains(e.target)) {
      if (px || py) setPointer(0, 0);
      return;
    }
    const r = stage.getBoundingClientRect();
    setPointer(-((e.clientX - r.left) / r.width - 0.5) * 2, -((e.clientY - r.top) / r.height - 0.5) * 2);
  }

  // main.js starts the pointer watch with Home and stops it, pending frame too, in destroy()
  function startParallax() {
    document.addEventListener('pointermove', onPointerMove, { passive: true });
  }

  function stopParallax() {
    document.removeEventListener('pointermove', onPointerMove);
    cancelAnimationFrame(frame);
    frame = 0;
    px = 0;
    py = 0;
  }

  Object.assign(ns, { paintArtMedia, stopArtMedia, startParallax, stopParallax });
})(window.__se);
