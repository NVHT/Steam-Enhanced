/*
 * Steam Settings › Accessibility: a slice of the Library as your settings draw it, over Steam's
 * rows (styles: client/settings/pages-accessibility.css).
 *
 *   [ Recent games                                          See all ]
 *   [ [cover][cover][cover][cover][cover][cover][cover][cover]       ]
 *   [ [art] Your last game  Play ━━━━━━   |  Show friends' activity (o) ]
 *
 * Your recent games' covers, your last game as a card (its art, name, when you played it, a Play
 * button and a bar that moves) and a settings row. The frame keeps one size from the window's
 * width; the slice is drawn to fill it, then follows the page's rows as they are now:
 * - UI Scale: the whole slice zoomed to the scale Steam's slider stands at (its place, ns.sliderAt,
 *   along its range: its props' min and max; Steam's accessibility_desktop_ui_scale runs 0.5 to 2,
 *   default 1; or its value when the props carry one): bigger fits less, cut at the frame's padding
 * - High Contrast Mode: brighter text and outlined edges
 * - Reduce Motion: the bar stands still
 * Rows are told by their label (shared.js's way); a switch's value is its On class.
 */
((SE) => {
  window.__seSettingsAccessibility?.destroy();
  const ns = window.__seSettingsParts;
  if (!ns) return;

  const { run, el } = SE;
  // Steam's UI Scale range (sp.js: accessibility_desktop_ui_scale), when the props don't give it
  const RANGE = { min: 0.5, max: 2 };

  const ROWS = [
    [/^ui scale/i, 'scale'],
    [/^high contrast/i, 'contrast'],
    [/^reduce motion/i, 'still'],
  ];

  // The slider's range and, when it carries one, its value (its live React props)
  const sliderProps = (field) =>
    SE.fromProps(
      field.querySelector(ns.SLIDER),
      8,
      (p) => (typeof p.min === 'number' && typeof p.max === 'number' && p.max > p.min ? p : undefined),
      { live: true }
    );

  // The scale the slider stands at: its value, else its place along its range
  function scaleOf(field) {
    if (!field) return 1;
    const props = run(() => sliderProps(field));
    if (typeof props?.value === 'number') return props.value;
    const at = ns.sliderAt(field)?.at;
    const { min, max } = props || RANGE;
    return at == null ? 1 : min + at * (max - min);
  }

  function read(page) {
    const rows = ns.rowsOf(page, ROWS);
    return {
      scale: scaleOf(rows.scale),
      contrast: ns.switchOn(rows.contrast),
      still: ns.switchOn(rows.still),
    };
  }

  const COVERS = 8; // recent games' covers in the row (as many as fit show)

  function makeCard(game) {
    const card = el('div', 'se-a11y-card');
    const art = el('div', 'se-a11y-art');
    const urls = game ? run(() => SE.headerURLs(game.appid, game.store)) || [] : [];
    if (urls.length) art.append(SE.art.img(urls, '', () => art.classList.add('se-a11y-blank')));
    const body = el('div', 'se-a11y-body');
    body.append(
      el('div', 'se-a11y-name', game?.name || 'Your game'),
      el('div', 'se-a11y-when', game ? `Last played ${SE.ago(game.played)}` : 'Last played today')
    );
    const row = el('div', 'se-a11y-row');
    const bar = el('div', 'se-a11y-bar');
    bar.append(el('span'));
    row.append(el('span', 'se-a11y-play', 'Play'), bar);
    body.append(row);
    card.append(art, body);
    return card;
  }

  // The slice: a heading and button, the covers, the card beside a settings row with its switch
  function makeSlice() {
    const slice = el('div', 'se-a11y-slice');
    const head = el('div', 'se-a11y-head');
    head.append(el('span', 'se-a11y-h', 'Recent games'), el('span', 'se-a11y-btn', 'See all'));
    const covers = el('div', 'se-a11y-covers');
    const { store, apps } = ns.recentGames(COVERS);
    for (const app of apps) {
      const cover = el('div', 'se-a11y-cover');
      const urls = run(() => SE.coverURLs(app, store)) || [];
      if (urls.length) cover.append(SE.art.img(urls, '', () => cover.classList.add('se-a11y-blank')));
      covers.append(cover);
    }
    const setting = el('div', 'se-a11y-setting');
    setting.append(el('span', 'se-a11y-label', "Show friends' activity"), el('i', 'se-a11y-switch'));
    const foot = el('div', 'se-a11y-foot');
    foot.append(makeCard(ns.lastGame()), setting);
    slice.append(head, covers, foot);
    return slice;
  }

  // The slice's width at its own size; a wider frame draws it larger, up to FIT_MAX
  // (pages-accessibility.css sizes the frame to match)
  const FIT_W = 560;
  const FIT_MAX = 1.4;

  function makePreview() {
    const root = el('div', 'se-a11y-preview');
    root.setAttribute('aria-hidden', 'true'); // a picture of the settings; Steam's rows are the controls
    const frame = el('div', 'se-a11y-frame');
    frame.append(makeSlice());
    const caption = el('div', 'se-a11y-caption');
    const chips = el('div', 'se-a11y-chips');
    caption.append(el('span', 'se-a11y-title', 'Yours'), chips);
    root.append(frame, caption);
    const v = { root, frame, chips, chipsKey: '', scale: 1, width: 0, height: 0 };
    // The frame's inside, read only when it resizes (the window's width)
    const fit = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1].contentRect;
      v.width = box.width;
      v.height = box.height;
      size(v);
    });
    fit.observe(frame);
    v.destroy = () => fit.disconnect();
    return v;
  }

  /*
   * The slice's zoom and the room it's laid out in: grown with the frame (up to FIT_MAX), times
   * your scale; laid out in the frame's inside at that zoom, so a bigger scale fits less (covers
   * drop off, text shortens, what runs past the foot is cut at the frame's padding, not its edge).
   * Worked out here: Chromium doesn't zoom a percentage size, so CSS can't.
   */
  function size(v) {
    if (!v.width) return;
    const zoom = Math.min(FIT_MAX, v.width / FIT_W) * v.scale;
    SE.cssVar(v.frame, '--se-a11y-zoom', (Math.round(zoom * 1000) / 1000).toString());
    SE.cssVar(v.frame, '--se-a11y-room', `${Math.floor(v.width / zoom)}px`);
    SE.cssVar(v.frame, '--se-a11y-room-h', `${Math.floor(v.height / zoom)}px`);
  }

  function draw(v, s) {
    const scale = Math.max(RANGE.min, Math.min(RANGE.max, s.scale || 1));
    if (scale !== v.scale) {
      v.scale = scale;
      size(v);
    }
    SE.attr(v.frame, 'data-contrast', s.contrast ? '' : null);
    SE.attr(v.frame, 'data-still', s.still ? '' : null);
    const chips = [`${Math.round(scale * 20) * 5}%`, s.contrast && 'High contrast', s.still && 'Still'].filter(Boolean);
    const key = chips.join('|');
    if (key === v.chipsKey) return;
    v.chipsKey = key;
    v.chips.replaceChildren(...chips.map((name) => el('span', 'se-a11y-chip', name)));
  }

  const view = ns.pageView({
    route: 'accessibility',
    make: makePreview,
    read,
    draw,
    // The switches' On class, the slider's style as it moves
    attributes: ['class', 'style'],
  });

  window.__seSettingsAccessibility = {
    destroy() {
      view.destroy();
      delete window.__seSettingsAccessibility;
    },
  };
})(window.__se);
