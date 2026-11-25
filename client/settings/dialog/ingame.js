/*
 * Steam Settings › In Game: a preview of a game with the overlay over it, and the page's four
 * sections as tabs (styles: client/settings/pages-ingame.css).
 *
 * The preview is your last game's art as the screen, drawn from Steam's rows as they are now:
 * - The performance monitor, drawn as Steam draws it in a game (one strip: FPS, CPU, GPU, RAM):
 *   where it sits (a corner or an edge's middle), its detail level, its graphs, temperatures, and
 *   its text size, text contrast and background (the sliders). A dropdown's choice is its place in Steam's list, from its
 *   props; a slider's its place (ns.sliderAt): the same in every language
 * - Enable the Steam Overlay, Overlay shortcut key(s): the key that opens it, or "Overlay off"
 * - Take a screenshot, display a notification: the screenshot key, and the toast it shows: the
 *   theme's own (SE.toastCard's sample, client/toasts/card.js), in the Toast style setting's look
 * Hovering a row lights the part it changes. Rows are told by their label (shared.js's way);
 * a switch's value is its On class, a key's its button text.
 *
 * Tabs: each of Steam's sections (a DialogControlsSection: its heading and rows) is a tab, named
 * by the heading's own text. Steam's nodes are only marked with their tab and hidden by CSS. A
 * row Settings search finds switches to its tab first (ns.revealers); a section Steam unfolds
 * (Toolbar Preferences) is shown as it opens, and when it folds away the tab before it is.
 */
((SE) => {
  window.__seSettingsInGame?.destroy();
  const ns = window.__seSettingsParts;
  if (!ns) return;

  const { run, el } = SE;
  const TAB = 'data-se-ig-tab';
  const SECTION = '.DialogControlsSection';
  const HEAD = '.SettingsDialogSubHeader';

  // A row's label → what it sets in the preview
  const ROWS = [
    [/^enable the steam overlay/i, 'overlay', 'toggle'],
    [/^overlay shortcut/i, 'overlayKey', 'key'],
    [/^show performance monitor/i, 'monitor', 'drop'],
    [/^toggle performance monitor/i, 'monitorKey', 'key'],
    [/^performance detail level/i, 'detail', 'index'],
    [/fps avg\/min graph/i, 'fpsGraph', 'toggle'],
    [/per-core graph/i, 'coreGraph', 'toggle'],
    [/kernel driver/i, 'temps', 'toggle'],
    [/^text size scaling/i, 'textSize', 'slider'],
    [/^text contrast/i, 'contrast', 'slider'],
    [/^background opacity/i, 'opacity', 'slider'],
    [/^take a screenshot/i, 'shotKey', 'key'],
    [/screenshot is taken, display a notification/i, 'shotToast', 'toggle'],
  ];
  // Which part of the preview a row lights
  const PARTS = { overlay: 'overlay', overlayKey: 'overlay', shotKey: 'shot', shotToast: 'shot' };
  const partOf = (key) => PARTS[key] || (key ? 'monitor' : null); // the monitor's rows light it
  // Where the monitor sits, by its place in Steam's list (Off, Top-left, Top-center, Top-right,
  // Bottom-right, Bottom-center, Bottom-left)
  const PLACES = ['', 'tl', 'tc', 'tr', 'br', 'bc', 'bl'];

  const rowOf = (field) => ROWS.find(([re]) => re.test(ns.fieldLabel(field))) || null;

  function read(page) {
    const rows = ns.rowsOf(page, ROWS);
    const state = {};
    for (const [, key, kind] of ROWS) {
      const field = rows[key];
      if (kind === 'toggle') state[key] = ns.switchOn(field);
      else if (kind === 'drop') state[key] = PLACES[ns.choiceAt(field) ?? 0] || '';
      else if (kind === 'index') state[key] = ns.choiceAt(field) ?? 0;
      else if (kind === 'slider') state[key] = field ? ns.sliderAt(field)?.at ?? null : null;
      else state[key] = field ? ns.text(field.querySelector('.FieldRightColumn')) : '';
    }
    return state;
  }

  /*
   * Steam's monitor as it draws it in a game: one strip, its parts split by thin bars, each label
   * in its colour, values white, units small and raised. A part's data-level is the detail level
   * that adds it (0 FPS alone, 1 + its low and high, 2 + CPU and GPU use, 3 + temperatures,
   * clocks and memory); data-need a switch it also needs (the graphs, the kernel driver's temps).
   */
  const piece = (level, html, need = '') => `<span data-level="${level}"${need ? ` data-need="${need}"` : ''}>${html}</span>`;
  const sep = (level) => `<i class="se-ig-sep" data-level="${level}"></i>`;
  const unit = (u) => `<sup>${u}</sup>`;
  const graph = (name, bars, level) =>
    `<span class="se-ig-graph" data-graph="${name}" data-level="${level}" data-need="${name}">${bars.map((h) => `<i style="height:${h}%"></i>`).join('')}</span>`;
  const MONITOR =
    piece(0, '<b data-tone="fps">FPS</b> 391') +
    piece(1, '↓333 ↑473') +
    graph('fps', [72, 80, 76, 88, 84, 92, 70, 86, 90, 82], 1) +
    sep(2) +
    piece(2, '<b data-tone="cpu">CPU</b> 16%/↑76%') +
    graph('cores', [42, 65, 30, 78, 52, 24, 60, 36], 2) +
    piece(3, `51${unit('°C')}`, 'temps') +
    piece(3, `5.06/↑5.26${unit('GHz')}`) +
    sep(2) +
    piece(2, '<b data-tone="gpu">GPU</b> 8%') +
    piece(3, `47${unit('°C')}`, 'temps') +
    piece(3, `10.4/15.6${unit('GB')}`) +
    sep(3) +
    piece(3, `<b data-tone="ram">RAM</b> 30.8/63.6${unit('GB')}`);
  const TOAST_W = 170; // the screenshot toast, well smaller than the real one (card.js TRAY_W)
  const part = (node, name) => {
    node.dataset.part = name;
    return node;
  };

  // A key chip: the key and what it does
  const chip = (what) => {
    const node = el('span', 'se-ig-chip');
    const key = el('kbd', 'se-ig-key');
    node.append(key, el('span', '', what));
    return { node, key };
  };

  function makePreview() {
    const root = el('div', 'se-ig-preview');
    root.setAttribute('aria-hidden', 'true'); // a picture of a game; Steam's rows are the controls
    const screen = el('div', 'se-ig-screen');
    const game = ns.lastGame();
    const urls = game ? run(() => SE.heroURLs(game.appid, game.store)) || [] : [];
    if (urls.length) {
      const img = SE.art.img(urls, '', () => img.remove());
      img.addEventListener('load', () => SE.mark(screen, 'data-ready'), { once: true });
      screen.append(img);
    }
    // The performance monitor at its place, as much of it as the detail level shows
    const monitor = part(el('div', 'se-ig-monitor'), 'monitor');
    monitor.innerHTML = MONITOR;
    // The screenshot toast: the theme's own, as a game's screenshot shows it (its art the game's)
    const toast = part(el('div', 'se-ig-toast'), 'shot');
    const sample = SE.toastCard?.sample(TOAST_W, { still: true }); // a picture: nothing moves
    const showToast = () =>
      sample?.show(
        SE.toastCard.entry('shot', { title: 'Screenshot saved', text: game?.name || 'Your game', appid: game?.appid || 0 }),
        SE.settings?.get('toast-style') === 'compact' ? 'compact' : 'stage'
      );
    if (sample) {
      toast.append(sample.root);
      showToast();
    }
    const offStyle = sample ? SE.settings?.on(showToast) : null;
    const keys = el('div', 'se-ig-keys');
    const overlay = chip('Overlay');
    const monitorKey = chip('Monitor');
    const shot = chip('Screenshot');
    part(overlay.node, 'overlay');
    part(monitorKey.node, 'monitor');
    part(shot.node, 'shot');
    keys.append(overlay.node, monitorKey.node, shot.node);
    screen.append(monitor, toast);
    root.append(screen, keys);
    const destroy = () => {
      offStyle?.();
      sample?.destroy();
    };
    return { root, screen, overlay, monitorKey, shot, destroy };
  }

  const setText = (node, value) => {
    if (node.textContent !== value) node.textContent = value;
  };

  function draw(v, s) {
    SE.attr(v.screen, 'data-monitor', s.monitor || null);
    v.screen.dataset.detail = String(s.detail ?? 0);
    SE.attr(v.screen, 'data-fps-graph', s.fpsGraph ? '' : null);
    SE.attr(v.screen, 'data-core-graph', s.coreGraph ? '' : null);
    SE.attr(v.screen, 'data-temps', s.temps ? '' : null);
    // Steam's sliders: text size around its default, text strength, the panel's backing
    SE.cssVar(v.screen, '--se-ig-scale', s.textSize == null ? null : String(0.75 + s.textSize * 0.6));
    SE.cssVar(v.screen, '--se-ig-ink', s.contrast == null ? null : String(0.45 + s.contrast * 0.55));
    SE.cssVar(v.screen, '--se-ig-back', s.opacity == null ? null : `${Math.round(s.opacity * 100)}%`);
    SE.attr(v.screen, 'data-overlay-off', s.overlay === false ? '' : null);
    SE.attr(v.screen, 'data-toast', s.shotToast ? '' : null);
    setText(v.overlay.key, s.overlay === false ? 'Off' : s.overlayKey || 'Shift+Tab');
    setText(v.monitorKey.key, s.monitorKey || '—');
    setText(v.shot.key, s.shotKey || 'F12');
  }

  /* ---------- Tabs ---------- */

  let active = 0; // the tab shown, kept while the window lives

  // Each of Steam's sections (a heading and its rows) marked as a tab; → the sections' names
  function markTabs(body) {
    const sections = [...body.querySelectorAll(SECTION)].filter((s) => !s.parentElement.closest(SECTION));
    sections.forEach((section, i) => SE.attr(section, TAB, String(i)));
    return sections.map((section) => ns.text(section.querySelector(HEAD)));
  }

  function show(index) {
    active = index;
    for (const v of view.views) drawTabs(v);
  }

  function drawTabs(v) {
    SE.attr(v.body, 'data-se-ig-show', String(active));
    for (const [i, button] of v.buttons.entries()) button.setAttribute('aria-selected', String(i === active));
  }

  // The tab to show once the sections change: a section Steam just unfolded (Toolbar Preferences
  // opens one under the overlay's), else the one shown, else, when that one went, the one before
  function tabAfter(before, names) {
    if (!before.length) return active < names.length ? active : 0; // first drawn: the kept tab
    const added = names.find((n) => !before.includes(n));
    if (added) return names.indexOf(added);
    const kept = names.indexOf(before[active]);
    if (kept >= 0) return kept;
    return Math.max(0, names.indexOf(before[active - 1]));
  }

  function syncTabs(v) {
    const names = markTabs(v.body);
    if (names.join('\n') !== v.names.join('\n')) {
      active = tabAfter(v.names, names);
      v.names = names;
      v.buttons = names.map((name, i) => {
        const button = el('button', '', name);
        button.type = 'button';
        button.setAttribute('role', 'tab');
        button.addEventListener('click', () => show(i));
        return button;
      });
      v.tabs.replaceChildren(...v.buttons);
    }
    drawTabs(v);
  }

  // Settings search found a row: its tab first
  const reveal = (row) => {
    const node = row.closest(`${view.PAGE} [${TAB}]`);
    const index = Number(node?.getAttribute(TAB));
    if (node && Number.isFinite(index) && index !== active) show(index);
  };
  ns.revealers.add(reveal);

  /* ---------- The view ---------- */

  const view = ns.pageView({
    route: 'ingame',
    make(body) {
      const preview = makePreview();
      const tabs = el('div', 'se-seg se-ig-tabs');
      tabs.setAttribute('role', 'tablist');
      const root = el('div', 'se-ig-view');
      root.append(preview.root, tabs);
      return {
        root,
        body,
        preview,
        tabs,
        names: [],
        buttons: [],
        destroy() {
          preview.destroy();
          SE.attr(body, 'data-se-ig-show', null);
          for (const node of body.querySelectorAll(`[${TAB}]`)) node.removeAttribute(TAB);
        },
      };
    },
    read,
    draw(v, s) {
      draw(v.preview, s);
      syncTabs(v);
    },
    // Rows Steam adds, its switches' On class, a key's or a dropdown's text, a slider's style
    attributes: ['class', 'style'],
    characterData: true,
  });

  // The hovered row's part lit
  let hovered = null;
  const onOver = (event) => {
    const field = event.target.closest?.(`${view.PAGE} .Field`);
    const key = field ? partOf(rowOf(field)?.[1]) : null;
    if (key === hovered) return;
    hovered = key;
    for (const v of view.views) {
      for (const node of v.preview.root.querySelectorAll('[data-part]')) SE.attr(node, 'data-lit', node.dataset.part === key ? '' : null);
    }
  };
  document.addEventListener('pointerover', onOver);

  window.__seSettingsInGame = {
    destroy() {
      view.destroy();
      ns.revealers.delete(reveal);
      document.removeEventListener('pointerover', onOver);
      delete window.__seSettingsInGame;
    },
  };
})(window.__se);
