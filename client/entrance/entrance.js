/*
 * Splash entrance (--se-entrance: splash), main window only; paired with entrance.css.
 *
 * client/loader.js holds the main window under a cover until the Library has finished
 * building, and marks <html data-se-entrance> with the setting. With "splash", this mounts the
 * splash over that cover as soon as the theme's scripts run, and the loader calls finish()
 * the moment the Library is ready (instead of lifting its cover), so the splash's "Ready" lands
 * on a finished Library:
 *
 *   loading  the Library bar creeps toward 90% on the compositor, never reaching the end on its own
 *   finish   the bar fills, turns gold and flares, "Ready", a spark on the tile (READY_HOLD_MS)
 *   leave    the splash fades off the Library underneath, then removes itself
 *
 * Only the Library: the startup window before it has already shown Network and sign-in. The
 * look is Splash D from the brand sheet (entrance.css scales it to any window); the markup below
 * is its wireframe Library and centre. If the loader never calls finish(), SAFETY_MS does.
 */
(() => {
  window.__seEntrance?.destroy();
  const root = document.documentElement;
  // tokens.css's setting once it has loaded, else the loader's (the last value seen)
  const setting = getComputedStyle(root).getPropertyValue('--se-entrance').trim().toLowerCase();
  if (root.hasAttribute('data-se-styled') || (setting || root.dataset.seEntrance) !== 'splash') return;

  const CREEP_MS = 3200;
  const FILL_MS = 320;
  const READY_HOLD_MS = 650;
  const LEAVE_MS = 500;
  const SAFETY_MS = 6000;

  const LABEL = 'Library';
  const LOADING = 'Loading';
  const READY = 'Ready';
  const TAGLINE = 'The Steam you always wanted.';

  /* ---------- Splash D's wireframe Library ---------- */

  const repeat = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join('');
  const txt = (w, style = '') => `<i class="se-ent-txt" style="width:calc(${w} * var(--u))${style}"></i>`;
  const head = (w, closed = false) => `<span class="se-ent-head"${closed ? ' data-closed' : ''}>${txt(w)}${txt(14)}</span>`;
  const ico = () => '<b class="se-ent-ico"></b>';

  const rail =
    '<div class="se-ent-rail"><b class="se-ent-rail-logo"></b>' +
    `${ico()}<span class="se-ent-rail-on">${ico()}</span>${ico()}${ico()}` +
    `<b class="se-ent-rail-rule"></b>${repeat(4, ico)}` +
    `<span class="se-ent-rail-foot">${ico()}<b class="se-ent-rail-dl"></b>${repeat(4, ico)}${ico()}<b class="se-ent-rail-me"></b></span>` +
    '</div>';

  // [width of the title line, 'lit' | 'sel' | '', extra: 'run' | 'dl']
  const row = ([w, kind = '', extra = '']) =>
    `<span class="se-ent-row"${kind ? ` data-${kind}` : ''}><b></b>${txt(w)}` +
    (extra === 'run' ? '<s class="se-ent-run"></s>' : '') +
    (extra === 'dl' ? '<s class="se-ent-dl"></s><s class="se-ent-dlbar"></s>' : '') +
    '</span>';
  const list =
    '<div class="se-ent-list">' +
    head(90) +
    [[170, 'sel'], [110, 'lit', 'run'], [130, 'lit', 'run'], [140, 'lit'], [120, '', 'dl'], [125, 'lit'], [100]].map(row).join('') +
    head(110) +
    [[110, 'lit'], [90], [130, 'lit']].map(row).join('') +
    head(150, true) +
    head(130) +
    [[100], [120], [115], [125, 'lit'], [105], [95, 'lit'], [120]].map(row).join('') +
    '</div>';

  const home =
    '<div class="se-ent-home"><b class="se-ent-stage"></b>' +
    `<span class="se-ent-tray">${repeat(3, () => '<b></b>')}</span></div>`;

  // [size, ring colour, top line, second line (colour), indented, group]
  const friend = ([size, ring, w1, w2, line2, indent = false, group = false]) =>
    `<span class="se-ent-friend"${indent ? ' data-in' : ''}${group ? ' data-group' : ''}>` +
    `<b style="--size:${size};--ring:${ring}"></b>` +
    `<span class="se-ent-lines">${txt(w1)}${txt(w2, `;background:${line2}`)}</span></span>`;
  const GREEN = 'rgba(108, 194, 74, .6)';
  const BLUE = 'rgba(76, 180, 255, .6)';
  const LINE = 'rgba(124, 196, 255, .3)';
  const friends =
    '<div class="se-ent-friends">' +
    `<span class="se-ent-me"><b></b><span class="se-ent-lines">${txt(110)}${txt(60, `;background:${BLUE}`)}</span><s></s><i></i><i></i><i></i></span>` +
    txt(90) +
    friend([38, LINE, 130, 80, LINE, false, true]) +
    friend([30, GREEN, 90, 110, GREEN, true]) +
    friend([30, GREEN, 70, 90, GREEN, true]) +
    friend([38, LINE, 110, 50, LINE, false, true]) +
    head(70) +
    friend([34, BLUE, 100, 60, BLUE]) +
    friend([34, BLUE, 80, 60, BLUE]) +
    friend([34, BLUE, 90, 50, BLUE]).replace('class="se-ent-friend"', 'class="se-ent-friend" style="opacity:.6"') +
    head(80, true) +
    '</div>';

  const centre =
    '<div class="se-ent-centre">' +
    '<div class="se-ent-tile"><span class="se-ent-track"></span><span class="se-ent-ring"></span>' +
    '<span class="se-ent-mark"></span><span class="se-ent-spark"></span></div>' +
    '<div class="se-ent-word"><div class="se-ent-kicker">STEAM</div><div class="se-ent-title">Enhanced</div></div>' +
    '<div class="se-ent-progress"><div class="se-ent-bar"><span></span></div>' +
    `<div class="se-ent-label"><span>${LABEL}</span><span class="se-ent-status">${LOADING}</span></div></div>` +
    `<div class="se-ent-tag">${TAGLINE}</div>` +
    '</div>';

  const el = document.createElement('div');
  el.id = 'se-entrance';
  el.dataset.phase = 'loading';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML =
    `<div class="se-ent-frame"><span class="se-ent-sweep"></span>${rail}${list}${home}${friends}</div>` +
    `<div class="se-ent-vignette"></div><div class="se-ent-glow"></div>${centre}`;
  // Outside <body>: the loader watches the body's DOM to tell when the Library is built
  root.append(el);

  const status = el.querySelector('.se-ent-status');
  const libBar = el.querySelector('.se-ent-bar > span');
  const creep = libBar.animate([{ transform: 'scaleX(.04)' }, { transform: 'scaleX(.9)' }], {
    duration: CREEP_MS,
    easing: 'cubic-bezier(.2, .6, .3, 1)',
    fill: 'forwards',
  });

  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };

  const destroy = () => {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    creep.cancel();
    el.remove();
    if (window.__seEntrance === api) delete window.__seEntrance;
  };

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    const from = getComputedStyle(libBar).transform; // wherever the creep had got to
    creep.cancel();
    libBar.animate([{ transform: from === 'none' ? 'scaleX(.04)' : from }, { transform: 'none' }], {
      duration: FILL_MS,
      easing: 'cubic-bezier(.4, 0, .2, 1)',
      fill: 'forwards',
    });
    later(() => {
      status.textContent = READY;
      el.dataset.phase = 'ready';
    }, FILL_MS);
    later(() => {
      el.dataset.phase = 'leave';
    }, FILL_MS + READY_HOLD_MS);
    later(destroy, FILL_MS + READY_HOLD_MS + LEAVE_MS + 50);
  };

  later(finish, SAFETY_MS);
  const api = { finish, destroy };
  window.__seEntrance = api;
})();
