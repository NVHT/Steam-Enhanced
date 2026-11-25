/*
 * A toast as the theme draws it, in any window: Steam's toast windows (client/toasts/, which
 * read Steam's toasts and play them) and the sample on Settings › Notifications
 * (client/settings/dialog/notifications.js). Styles: card.css.
 *
 * SE.toastCard:
 * - KINDS, icon(name, cls), BASE_W / TRAY_W / ZOOM, PRUNE_MS: the kinds (eyebrow, accent,
 *   countdown, art, glyph), their duotone glyphs, the tray's size, the layers' crossfade
 * - layer(entry) → { layer, urls }: a Stage layer (art, grade, content, countdown), painted
 * - paint(entry, layer) → tier id: its content again (a toast Steam changed)
 * - compactEyebrow(entry): the Compact style's eyebrow (the kind's glyph and label)
 * - entry(kind, fields): an entry as steam.js reads one, filled in from its kind
 * - sample(width, { still }) → { root, show(entry, style), destroy() }: a toast at rest in a page
 *   (still: nothing in it moves or fades, card.css), the Stage
 *   drawn `width` px wide (TRAY_W by default)
 * - stopVideos(root): a friend's looping profile video stopped
 */
((SE) => {
  const { esc, run } = SE;

  // Size: the tray is laid out at BASE_W (card.css) and zoomed as a whole to TRAY_W
  const BASE_W = 420;
  const TRAY_W = 350;
  const ZOOM = TRAY_W / BASE_W;
  const PRUNE_MS = 650; // finished layers leave after their crossfade (card.css)

  /*
   * Kinds: eyebrow, accent, countdown (0 = until handled), art source and fallback icon.
   * `pri` toasts play next instead of joining the end of the queue.
   */
  const KINDS = Object.freeze({
    msg: { label: 'Message', accent: 'msg', ms: 6000, art: 'avatar', icon: 'chat' },
    online: { label: 'Online', accent: 'on', ms: 4000, art: 'avatar', icon: 'dot' },
    playing: { label: 'Now playing', accent: 'play', ms: 6000, art: 'app', icon: 'play' },
    invite: { label: 'Invite', accent: 'inv', ms: 12000, art: 'app', icon: 'pad' },
    request: { label: 'Friend request', accent: 'inv', ms: 12000, art: 'avatar', icon: 'plus' },
    call: { label: 'Voice call', accent: 'play', ms: 0, pri: true, art: 'avatar', icon: 'phone' },
    ach: { label: 'Achievement unlocked', accent: 'ach', ms: 5000, art: 'app', icon: 'trophy' },
    ready: { label: 'Ready to play', accent: 'play', ms: 8000, art: 'app', icon: 'check', play: true },
    update: { label: 'Updated', accent: 'dl', ms: 6000, art: 'app', icon: 'down' },
    shot: { label: 'Screenshot saved', accent: 'dl', ms: 4000, art: 'image', icon: 'camera' },
    clip: { label: 'Game Recording', accent: 'dl', ms: 4000, art: 'app', icon: 'rec' },
    sale: { label: 'Wishlist', accent: 'shop', ms: 6000, art: 'app', icon: 'tag' },
    gift: { label: 'Gift received', accent: 'ach', ms: 6000, art: 'app', icon: 'gift' },
    item: { label: 'New item', accent: 'shop', ms: 6000, art: 'app', icon: 'cube' },
    trade: { label: 'Trade offer', accent: 'shop', ms: 6000, art: 'avatar', icon: 'trade' },
    comment: { label: 'Comment', accent: 'msg', ms: 6000, art: 'avatar', icon: 'chat' },
    family: { label: 'Steam Family', accent: 'sys', ms: 12000, art: 'app', icon: 'home' },
    battery: { label: 'Battery low', accent: 'ach', ms: 6000, art: 'ambient', icon: 'battery' },
    error: { label: 'Needs attention', accent: 'err', ms: 0, pri: true, art: 'app', icon: 'alert' },
    overlay: { label: 'Steam overlay', accent: 'sys', ms: 4000, art: 'app', icon: 'screen' },
    controller: { label: 'Controller', accent: 'sys', ms: 5000, art: 'ambient', icon: 'pad' },
    system: { label: 'Steam', accent: 'sys', ms: 5000, art: 'app', icon: 'steam' },
  });

  /*
   * Duotone glyphs: the shape in a 40% tint of the toast's color, the detail at full strength
   * (`.d` paths and strokes). One color, two tones.
   */
  const T = 'opacity=".4"';
  const S = 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const ICONS = Object.freeze({
    chat: `<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3h13A1.5 1.5 0 0 1 20 4.5v10a1.5 1.5 0 0 1-1.5 1.5H9l-5 4z" fill="currentColor" ${T}/><path d="M8 8h8M8 11.5h5" ${S}/>`,
    dot: `<circle cx="12" cy="12" r="9" fill="currentColor" ${T}/><circle cx="12" cy="12" r="4.5" fill="currentColor"/>`,
    play: `<circle cx="12" cy="12" r="10" fill="currentColor" ${T}/><path d="M10 8.2l6 3.8-6 3.8z" fill="currentColor"/>`,
    pad: `<path d="M7 7h10a4 4 0 0 1 4 4v4.5a2.5 2.5 0 0 1-4.4 1.6L14.8 15H9.2l-1.8 2.1A2.5 2.5 0 0 1 3 15.5V11a4 4 0 0 1 4-4z" fill="currentColor" ${T}/><path d="M8 9.8v3.4M6.3 11.5h3.4" ${S}/><circle cx="15.5" cy="10.6" r="1.2" fill="currentColor"/><circle cx="17.6" cy="12.7" r="1.2" fill="currentColor"/>`,
    plus: `<circle cx="9" cy="8" r="4" fill="currentColor" ${T}/><path d="M2 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5z" fill="currentColor" ${T}/><path d="M19 8v6M16 11h6" ${S}/>`,
    phone: `<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z" fill="currentColor"/><path d="M15 3.5a6 6 0 0 1 5.5 5.5M15 7a2.5 2.5 0 0 1 2 2" ${S} ${T}/>`,
    trophy: `<path d="M7 3h10v6a5 5 0 0 1-10 0z" fill="currentColor" ${T}/><path d="M7 5H4.5a3 3 0 0 0 3 4.5M17 5h2.5a3 3 0 0 1-3 4.5M12 14v3.5M8 20.5h8" ${S}/>`,
    cup: `<path d="M7 3h10v6a5 5 0 0 1-10 0z" fill="currentColor"/><path d="M7 5H4a3.5 3.5 0 0 0 3.5 5M17 5h3a3.5 3.5 0 0 1-3.5 5" ${S}/><path d="M10.5 15h3v3h-3zM7.5 19h9v2h-9z" fill="currentColor" ${T}/>`,
    check: `<circle cx="12" cy="12" r="10" fill="currentColor" ${T}/><path d="M7.5 12.2l3 3 6-6.4" ${S} stroke-width="2.4"/>`,
    down: `<path d="M4 15h16v3.5A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5z" fill="currentColor" ${T}/><path d="M12 3.5v9M8 8.5l4 4 4-4" ${S}/>`,
    camera: `<path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2.7l1.8-2.5h6l1.8 2.5h2.7A1.5 1.5 0 0 1 21 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" fill="currentColor" ${T}/><circle cx="12" cy="13.5" r="3.6" ${S}/>`,
    rec: `<circle cx="12" cy="12" r="9.5" fill="currentColor" ${T}/><circle cx="12" cy="12" r="4.5" fill="currentColor"/>`,
    tag: `<path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h6.9a1.5 1.5 0 0 1 1.1.4l8.3 8.4a1.5 1.5 0 0 1 0 2.1l-6.8 6.8a1.5 1.5 0 0 1-2.1 0l-8.4-8.3a1.5 1.5 0 0 1-.4-1.1z" fill="currentColor" ${T}/><circle cx="8" cy="8" r="1.8" fill="currentColor"/>`,
    gift: `<path d="M4 12h16v7.5A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5zM3 8.5A1.5 1.5 0 0 1 4.5 7h15A1.5 1.5 0 0 1 21 8.5V12H3z" fill="currentColor" ${T}/><path d="M12 7v14M12 7c-1.5-3-5-3-5-1s3 1 5 1c2 0 5 1 5-1s-3.5-2-5 1" ${S}/>`,
    cube: `<path d="M12 3l8 4.5L12 12 4 7.5z" fill="currentColor"/><path d="M4 7.5L12 12v9l-8-4.5zM20 7.5V16.5L12 21v-9z" fill="currentColor" ${T}/>`,
    trade: `<path d="M4 8h14l-4-4" ${S} stroke-width="2.2"/><path d="M20 16H6l4 4" ${S} stroke-width="2.2" ${T}/>`,
    home: `<path d="M3.5 11L12 3.5l8.5 7.5v8.5A1.5 1.5 0 0 1 19 21H5a1.5 1.5 0 0 1-1.5-1.5z" fill="currentColor" ${T}/><path d="M10 21v-5.5h4V21" ${S}/>`,
    battery: `<rect x="2.5" y="7" width="17" height="10" rx="2.5" fill="currentColor" ${T}/><path d="M21.5 10.5v3" ${S}/><rect x="5" y="9.5" width="3.5" height="5" rx="1" fill="currentColor"/>`,
    alert: `<path d="M10.3 4.2a2 2 0 0 1 3.4 0l7.6 13.2a2 2 0 0 1-1.7 3H4.4a2 2 0 0 1-1.7-3z" fill="currentColor" ${T}/><path d="M12 9.5v4M12 16.8h.01" ${S} stroke-width="2.4"/>`,
    screen: `<rect x="2.5" y="4" width="19" height="13" rx="2" fill="currentColor" ${T}/><path d="M8 20.5h8M12 17v3.5M6.5 13h6" ${S}/>`,
    steam: `<circle cx="12" cy="12" r="10" fill="currentColor" ${T}/><circle cx="12" cy="12" r="4" fill="currentColor"/>`,
    close: '<path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
  });
  const icon = (name, cls = '') =>
    `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.steam}</svg>`;

  // A friend's profile background as the toast's art (SE.profileBackground, client/shared/mini-profile.js)
  async function profileArt(accountId, art) {
    const bg = await SE.profileBackground(accountId);
    if (!bg || !art.isConnected) return;
    const { video, still } = bg;
    let el;
    if (video) {
      el = document.createElement('video');
      Object.assign(el, { src: video, muted: true, loop: true, autoplay: true, playsInline: true });
      el.setAttribute('aria-hidden', 'true');
    } else if (still) {
      el = SE.art.img([still], 'se-tst-hero');
    } else {
      return;
    }
    el.className = 'se-tst-hero';
    const show = () => {
      // The toast left before the video loaded: stop it rather than keep it playing off-screen
      if (!art.isConnected) return video && stopVideos(el);
      art.replaceChildren(el);
      delete art.dataset.ambient;
    };
    if (video) el.addEventListener('loadeddata', show, { once: true });
    else el.addEventListener('load', show, { once: true });
    if (video) run(() => el.play());
  }

  // A looping profile video keeps decoding until it is paused and its source dropped
  function stopVideos(root) {
    const list = root instanceof HTMLVideoElement ? [root] : root.querySelectorAll('video');
    for (const el of list) {
      run(() => {
        el.pause();
        el.removeAttribute('src');
        el.load();
      });
    }
  }

  /*
   * The ground for toasts with no art: a wireframe of the themed Library (rail, game list,
   * Home, Friends dock) drawn to the stage's shape. It comes alive in the toast's color: the
   * selection moves down the list, the bottom cards light in turn, friends' status rings
   * breathe, the hero panel glows, and a light passes over it all.
   */
  const AMBIENT_SVG = (() => {
    const box = (x, y, s, r, cls = 'se-tst-wf-ln', extra = '') =>
      `<rect class="${cls}" x="${x}" y="${y}" width="${s}" height="${s}" rx="${r}"${extra}/>`;
    const line = (x, y, w, h = 2) => `<rect class="se-tst-wf-line" x="${x}" y="${y}" width="${w}" height="${h}" rx="1"/>`;
    // A section header: chevron (open or closed), title and count
    const head = (x, y, w, closed) =>
      `<path class="se-tst-wf-ln" d="${closed ? `M${x} ${y - 2.5}l2.5 2.5-2.5 2.5` : `M${x - 1} ${y - 1}l2.5 2.5 2.5-2.5`}"/>` +
      line(x + 8, y - 0.5, w, 1.5) + line(x + 12 + w, y - 0.5, 5, 1.5);

    // Rail: Steam button, four pages (Library current), divider, four more
    const railY = [30, 42, 70, 82, 98, 110, 122, 134];
    const rail =
      '<circle class="se-tst-wf-ln" cx="17" cy="17" r="5"/><circle class="se-tst-wf-ln" cx="17" cy="17" r="2"/>' +
      railY.map(y => box(13, y, 8, 2.5)).join('') +
      '<rect class="se-tst-wf-tint" x="10" y="53" width="14" height="14" rx="4"/>' +
      '<rect class="se-tst-wf-bar" x="4.5" y="56" width="1.5" height="8" rx=".75"/>' +
      box(13, 56, 8, 2.5, 'se-tst-wf-ln se-tst-wf-on') +
      '<path class="se-tst-wf-ln" d="M12 92h10"/>';

    // Game list: a section of rows (icon and name), the selection walks down it
    const rows = [62, 44, 70, 38, 54, 48, 60]
      .map((w, i) => box(40, 26 + i * 11, 6, 1.5) + line(51, 28 + i * 11, w))
      .join('');
    const list =
      head(40, 15, 40) + rows +
      '<g class="se-tst-wf-sel"><rect class="se-tst-wf-tint" x="36" y="24" width="92" height="10" rx="3"/>' +
      '<rect class="se-tst-wf-bar" x="31" y="26" width="1.5" height="6" rx=".75"/></g>' +
      head(40, 106, 52, true) + head(40, 116, 46);

    // Friends dock: you, Playing now with a game and its players, then Online
    const av = (x, y, s, st, i) =>
      box(x, y, s, s * .23, 'se-tst-wf-fr', ` data-st="${st}"${i == null ? '' : ` style="--i:${i}"`}`);
    const game = (y, w) =>
      box(324, y, 10, 2.5) + `<circle class="se-tst-wf-fr" data-st="game" cx="334" cy="${y + 10}" r="2"/>` +
      line(339, y + 2, w) + line(339, y + 6.5, w * .6, 1.5);
    const friend = (x, y, st, w, i) => av(x, y, 8, st, i) + line(x + 12, y + 1.5, w) + line(x + 12, y + 5.5, w * .7, 1.5);
    const dock =
      box(324, 11, 11, 2.5, 'se-tst-wf-ln se-tst-wf-on') + line(339, 13.5, 26) + line(339, 18, 16, 1.5) +
      [372, 381, 390].map(x => box(x, 13, 6, 1.5)).join('') +
      '<path class="se-tst-wf-ln" d="M324 28h74"/>' + line(324, 33, 22, 1.5) +
      game(39, 32) + friend(330, 53, 'game', 22, 0) + friend(330, 64, 'game', 18, 1) +
      head(325, 80, 18) + friend(324, 87, 'on', 28, 2) + friend(324, 98, 'on', 22, 3) + friend(324, 109, 'off', 26, 4);

    return (
      '<svg class="se-tst-wf" viewBox="0 0 408 124" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">' +
      '<rect class="se-tst-wf-ln" x="4" y="6" width="400" height="150" rx="10"/>' +
      '<path class="se-tst-wf-ln" d="M30 6v150M134 6v150M318 6v150"/>' +
      rail + list +
      '<rect class="se-tst-wf-ln" x="142" y="12" width="168" height="78" rx="6"/>' +
      // A soft-edged gradient rather than a blur filter, which re-rasterised every frame.
      '<radialGradient id="se-tst-glow-ID"><stop class="se-tst-wf-glow-stop" offset="0" stop-opacity=".4"/>' +
      '<stop class="se-tst-wf-glow-stop" offset=".45" stop-opacity=".28"/><stop class="se-tst-wf-glow-stop" offset="1" stop-opacity="0"/></radialGradient>' +
      '<ellipse class="se-tst-wf-glow" cx="226" cy="50" rx="66" ry="44" fill="url(#se-tst-glow-ID)"/>' +
      [0, 1, 2].map(i => `<rect class="se-tst-wf-ln se-tst-wf-card" style="--i:${i}" x="${148 + i * 57}" y="96" width="51" height="40" rx="5"/>`).join('') +
      dock +
      '</svg><i class="se-tst-wf-light"></i>'
    );
  })();
  // Each ground gets its own gradient id: url(#…) resolves to the document's first match,
  // which would paint every layer in the first layer's colour.
  let ambientSeq = 0;
  const ambientHTML = () => AMBIENT_SVG.replaceAll('se-tst-glow-ID', `se-tst-glow-${++ambientSeq}`);

  const artURLs = (m) => {
    // "Achievement art: Icon only": no game art, so the achievement's icon glows instead (fallback)
    if (m.kind === 'ach' && SE.settings?.get('toast-ach-art') === 'icon') return [];
    const hero = m.appid && m.artKind !== 'ambient' ? SE.heroURLs(m.appid, SE.appStore()) : [];
    if (m.artKind === 'image' && m.shot) return [m.shot, ...hero];
    if (m.artKind === 'app' || m.artKind === 'image') return hero;
    return [];
  };

  function sparkles(rank) {
    return `<span class="se-tst-fx" aria-hidden="true">${'<i class="se-tst-spark"></i>'.repeat(rank)}</span>`;
  }

  // Presence as an outline round the avatar, as in the friends list: blue online, green in game.
  const PRESENCE = Object.freeze({ online: 'online', playing: 'ingame' });

  function tileHTML(m, tier) {
    const img = m.icon ? `<img class="se-tst-tile-img" src="${esc(m.icon)}" alt="" draggable="false">` : icon(m.glyph);
    if (m.kind !== 'ach') return img;
    if (m.mastered) return icon('cup') + sparkles(5);
    return tier ? img + sparkles(tier.rank) + `<b class="se-tst-initial">${tier.name[0]}</b>` : img;
  }

  function rightHTML(m, tier) {
    if (m.kind === 'ach' && m.mastered) {
      return `<div class="se-tst-stat"><b>${m.mastered.total}<small> / ${m.mastered.total}</small></b><em class="se-tst-pill">100%</em></div>`;
    }
    // With Rarity tiers off: the rate alone
    if (m.kind === 'ach' && (tier || Number.isFinite(m.pct))) {
      return `<div class="se-tst-stat"><b>${esc(SE.rarity.fmtPct(m.pct))}%</b>${tier ? `<em class="se-tst-pill">${tier.name}</em>` : ''}</div>`;
    }
    return m.buttons
      .map((b, i) => {
        const cls = i === 0 ? (m.play ? 'se-tst-btn-play' : 'se-tst-btn-acc') : 'se-tst-btn-glass';
        return `<button type="button" class="se-tst-btn ${cls}" data-se-tst-act="${i}"${m.stale ? ' disabled' : ''}>${esc(b.label)}</button>`;
      })
      .join('');
  }

  function detailHTML(m) {
    if (m.kind === 'ach' && m.mastered) {
      const chips = m.mastered.counts
        .map(c => `<i data-se-tier="${c.t.id}">${c.t.name[0]} ${c.n}</i>`)
        .join('');
      return `<div class="se-tst-chips">${chips}</div>`;
    }
    return `<div class="se-tst-ds">${esc(m.text)}</div>`;
  }

  function layer(e) {
    const el = document.createElement('div');
    el.className = 'se-tst-layer';
    if (e.id != null) el.dataset.id = String(e.id);
    el.dataset.accent = e.accent;

    const art = document.createElement('div');
    art.className = 'se-tst-art';
    const urls = artURLs(e);
    // No art: the theme's own ground (card.css), lit in the toast's color.
    const ambient = () => {
      art.replaceChildren();
      art.dataset.ambient = '';
      art.insertAdjacentHTML('beforeend', ambientHTML());
    };
    // No game art: the avatar as a glow (friends, achievements), else the ambient ground.
    const fallback = () => {
      if (e.icon && e.artKind !== 'ambient') art.replaceChildren(SE.art.img([e.icon], 'se-tst-glow'));
      else ambient();
    };
    if (urls.length) art.appendChild(SE.art.img(urls, 'se-tst-hero', fallback));
    else fallback();
    // A friend: their mini-profile background replaces the glow once it arrives.
    if (e.accountId && !urls.length) profileArt(e.accountId, art);

    el.append(art);
    el.insertAdjacentHTML(
      'beforeend',
      '<div class="se-tst-grade"></div><div class="se-tst-ct"></div>' +
        '<button type="button" class="se-tst-sweep" aria-label="Dismiss">' +
        '<svg class="se-tst-ring" viewBox="0 0 30 30" aria-hidden="true">' +
        '<circle class="se-tst-trk" cx="15" cy="15" r="13.5"/><circle class="se-tst-arc" cx="15" cy="15" r="13.5"/></svg>' +
        `<span class="se-tst-lead"></span><span class="se-tst-kdot"></span>${icon('close', 'se-tst-x')}</button>`
    );
    paint(e, el);
    return { layer: el, urls };
  }

  // The layer's content and rarity; returns the tier id (the strip's thumb takes it too)
  function paint(e, el) {
    const tier = e.kind === 'ach' && !e.mastered ? SE.rarity.tierOf(e.pct) : null;
    const tierId = (e.mastered ? 'legendary' : tier?.id) || null;
    SE.attr(el, 'data-se-tier', tierId);
    const label = e.kind === 'ach' && e.mastered ? 'Game mastered' : e.label;
    el.querySelector('.se-tst-ct').innerHTML =
      `<div class="se-tst-tile"${PRESENCE[e.kind] ? ` data-presence="${PRESENCE[e.kind]}"` : ''}>${tileHTML(e, tier)}</div>` +
      `<div class="se-tst-tx"><div class="se-tst-ey">${esc(label)}</div>` +
      `<div class="se-tst-tt">${esc(e.title)}</div>${detailHTML(e)}</div>` +
      `<div class="se-tst-rt">${rightHTML(e, tier)}</div>`;
    return tierId;
  }

  const compactEyebrow = (e) =>
    `<div class="se-tst-cmp-ey">${icon(e.glyph, 'se-tst-cmp-gl')}<span>${esc(e.label)}</span></div>`;

  // An entry as steam.js reads one, its kind's look filled in; `fields` may override the label
  function entry(kind, fields) {
    const k = KINDS[kind] || KINDS.system;
    return {
      kind: KINDS[kind] ? kind : 'system',
      label: k.label,
      accent: k.accent,
      artKind: k.art,
      glyph: k.icon,
      play: !!k.play,
      title: '',
      text: '',
      icon: '',
      buttons: [],
      appid: 0,
      accountId: 0,
      pct: NaN,
      ...fields,
    };
  }

  /*
   * A toast at rest in a page, in the Toast style asked for: Stage (the tray and its stage, the
   * countdown ring full: data-sticky) or Compact (Steam's toast markup, its plain classes only,
   * dressed as compact.js dresses Steam's). show() crossfades the Stage's layers as the toast
   * window does.
   */
  function sample(width = TRAY_W, { still = false } = {}) {
    const root = document.createElement('div');
    root.className = 'se-tst-sample';
    if (still) root.dataset.still = '';
    let stage = null;
    let shown = '';
    const timers = new Set();

    function stageOf() {
      if (stage) return stage;
      stopVideos(root);
      root.replaceChildren();
      root.removeAttribute('data-se-tst-compact');
      const tray = document.createElement('div');
      tray.className = 'se-tst-tray';
      tray.dataset.show = '';
      tray.style.setProperty('--se-tst-zoom', String(Math.round((width / BASE_W) * 10000) / 10000));
      stage = document.createElement('div');
      stage.className = 'se-tst-stage';
      tray.append(stage);
      root.append(tray);
      return stage;
    }

    function showStage(e) {
      const into = stageOf();
      const { layer: el } = layer(e);
      el.dataset.sticky = '';
      into.append(el);
      for (const old of into.querySelectorAll(':scope > [data-on]')) {
        delete old.dataset.on;
        const t = setTimeout(() => {
          timers.delete(t);
          stopVideos(old);
          old.remove();
        }, PRUNE_MS);
        timers.add(t);
      }
      void el.offsetWidth; // start from the hidden layer, so it fades in
      el.dataset.on = '';
    }

    function showCompact(e) {
      stage = null;
      stopVideos(root);
      root.dataset.seTstCompact = e.accent;
      const pic = e.icon || artURLs(e)[0];
      root.innerHTML =
        '<div class="DesktopToastPopup"><div class="DesktopToastTemplate">' +
        `<div class="StandardLogoDimensions">${pic ? `<img src="${esc(pic)}" alt="">` : icon(e.glyph)}</div>` +
        `<div class="Content">${compactEyebrow(e)}<div class="Title">${esc(e.title)}</div>` +
        `<div class="StandardNotificationDescription">${esc(e.text)}</div></div></div></div>`;
    }

    return {
      root,
      show(e, style) {
        const key = [style, e.kind, e.title, e.text, e.appid, e.icon].join('|');
        if (key === shown) return;
        shown = key;
        if (style === 'compact') showCompact(e);
        else showStage(e);
      },
      destroy() {
        for (const t of timers) clearTimeout(t);
        timers.clear();
        stopVideos(root);
        root.remove();
      },
    };
  }

  SE.toastCard = Object.freeze({
    BASE_W, KINDS, PRUNE_MS, TRAY_W, ZOOM, compactEyebrow, entry, icon, layer, paint, sample, stopVideos,
  });
})(window.__se);
