/*
 * Steam Settings › Controller: one card over each of the page's views (the card pages-hero.css, its
 * art client/settings/pages-controller.css). The page's route stays the same while Steam swaps its
 * views; the list has the plain header, the others one with a back button (ControllerSettingsHeader).
 *
 * The list: how many controllers are connected.
 *
 *   [ 4 controllers connected                [controller][  deck  ][frame] ]
 *   [ 1 disconnected                                                       ]
 *
 *   The connected ones are the first section's rows with a controller label or icon ("Add a new
 *   controller" has neither), the disconnected ones carry DisconnectedControllerLabel. On the
 *   right, Steam's own line drawings of its hardware (steamui/images/controller/: the Steam
 *   Controller, the Deck, the Steam Frame's controllers) in a row, each lit while one of its kind is
 *   connected. The rows under it name the controllers: the card doesn't repeat them.
 *
 * A controller's Details: its face buttons as games show them.
 *
 *   [ Buttons as games show them                 ((   (Y)   ))   ]
 *   [ Xbox layout                                (( (X) (B) ))   ]
 *   [                                               (A)          ]
 *
 *   Its kind's glyphs (Xbox letters, PlayStation shapes, Nintendo letters; told by Steam's type for
 *   it, else its name), swapped A/B and X/Y with Use Nintendo Button Layout on, Big Picture's
 *   universal glyphs (each button a diamond with its own place filled) with Universal Face Button
 *   Glyphs on, buzz marks while Game rumble is on. Its switches are told by what they run
 *   (SetUseNintendoButtonLayout, SetUseUniversalFaceButtonGlyphs, SetControllerRumbleSetting).
 *
 * Advanced Settings: which controller families Steam Input takes.
 *
 *   [ Steam Input                  Xbox ───────╮                ]
 *   [ On for PlayStation      PlayStation ─[Steam Input]── Game  ]
 *   [                          Switch Pro ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╯       ]
 *
 *   Each family through Steam Input to the game while it's on, straight to the game (faint) while
 *   off; PlayStation dashed for "in games without support". Its rows are told by what Steam built
 *   them from: the family switches carry a controllerType (Xbox, Switch Pro, generic, in that
 *   order), PlayStation is the dropdown of options 0, 1, 2 (disabled, when needed, enabled).
 *
 * Add a new controller: how to connect one.
 *
 *   [ Connect a controller                       <-- [plug]~~~  [steam controller] ]
 *   [ Steam Controller Puck Detected. Connect a Steam Controller via USB to pair.  ]
 *   [ To pair a controller via Bluetooth, use your operating system's settings... ]
 *
 *   Steam's picture and Puck note replaced by the card (the note as its line), Steam's Steam
 *   Controller drawing with its cable while a Puck is there, else the list's three drawings.
 */
((SE) => {
  window.__seSettingsController?.destroy();
  const ns = window.__seSettingsParts;
  if (!ns) return;

  const { C, el } = SE;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------- The list ----------

  // Steam's drawings, left to right, each with the names that light it (Steam's words for them)
  const ART = '/images/controller/controller_config_controller_';
  const PIECES = [
    ['controller', 'triton.svg', /steam controller/i],
    ['deck', 'steam_deck.svg', /steam deck/i],
    ['frame', 'steam_frame.svg', /steam frame/i],
  ];

  /*
   * Each drawing read once and kept as lines alone, placed inline so pages-controller.css gives
   * every line one tone: the Deck's dark body and screen fills dropped (they'd hide what's behind),
   * the Frame's stylesheet (global class names, its lines drawn as filled shapes) turned into plain
   * fills.
   */
  const DARK = /^#0d131b$/i;
  const drawings = new Map();
  const drawingOf = (file) => {
    if (!drawings.has(file)) {
      drawings.set(
        file,
        fetch(ART + file)
          .then((r) => (r.ok ? r.text() : Promise.reject()))
          .then((text) => {
            const svg = new DOMParser().parseFromString(text, 'image/svg+xml').querySelector('svg');
            if (!svg) return null;
            svg.querySelectorAll('style').forEach((n) => n.remove());
            svg.querySelectorAll('[class]').forEach((n) => {
              n.removeAttribute('class');
              n.setAttribute('fill', 'white');
            });
            svg.querySelectorAll('[fill]').forEach((n) => DARK.test(n.getAttribute('fill')) && n.setAttribute('fill', 'none'));
            svg.removeAttribute('width');
            svg.removeAttribute('height');
            svg.setAttribute('aria-hidden', 'true');
            return svg;
          })
          .catch(() => null)
      );
    }
    return drawings.get(file);
  };

  const makeArt = () => {
    const art = el('span', 'se-ctl-art');
    for (const [name, file] of PIECES) {
      const piece = el('span', 'se-ctl-piece');
      piece.dataset.piece = name;
      art.append(piece);
      drawingOf(file).then((svg) => (svg ? piece.append(document.importNode(svg, true)) : piece.remove()));
    }
    return art;
  };

  // A connected row's name: its ControllerLabel's own Text (without its connection), else its label
  const nameOf = (field) => ns.text(field.querySelector(`.${C.ControllerLabel} .Text`)) || ns.fieldLabel(field);
  const connected = (page) =>
    [...(page.querySelector('.DialogControlsSection')?.querySelectorAll(ns.FIELD) || [])]
      .filter((field) => field.querySelector(`.${C.ControllerLabel}, .FieldIcon`))
      .map(nameOf);
  const disconnected = (page) => page.querySelectorAll(`.${C.DisconnectedControllerLabel}`).length;
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // ---------- Steam's rows, by what built them ----------

  const propsOf = (field, pick) => SE.run(() => SE.fromProps(field, 10, pick, { live: true }));
  const fieldsOf = (page) => [...page.querySelectorAll(ns.FIELD)];
  // A switch row by what its onChange runs (its source names Steam's call)
  const switchRunning = (fields, call) =>
    fields.find((field) =>
      propsOf(field, (p) => (typeof p.onChange === 'function' && String(p.onChange).includes(call)) || undefined)
    );

  // ---------- A controller's Details ----------

  // Steam's controller types (its EControllerType) with their own glyphs; the rest by name
  const TYPE_KIND = { 31: 'xbox', 32: 'xbox', 33: 'ps', 34: 'ps', 45: 'ps', 38: 'nintendo', 39: 'nintendo', 40: 'nintendo', 41: 'nintendo' };
  const NAME_KIND = [
    [/dualsense|dualshock|playstation|\bps[345]\b/i, 'ps'],
    [/switch|joy-?con|nintendo/i, 'nintendo'],
  ];
  // Top, right, bottom, left; PlayStation's as shapes
  const GLYPHS = {
    xbox: ['Y', 'B', 'A', 'X'],
    ps: ['triangle', 'circle', 'cross', 'square'],
    nintendo: ['X', 'A', 'B', 'Y'],
  };
  const LAYOUT = { xbox: 'Xbox layout', ps: 'PlayStation layout', nintendo: 'Nintendo layout' };
  const SWAPPED = { xbox: 'A and B, X and Y swapped', ps: 'Cross and circle, square and triangle swapped', nintendo: 'A and B, X and Y swapped' };

  const readDetails = (page, fields) => {
    const rumble = switchRunning(fields, 'SetControllerRumbleSetting');
    const type = rumble && propsOf(rumble, (p) => p.icon?.props?.controllerType);
    const name = ns.text(page.querySelector(`.${C.ControllerSettingsHeader}`));
    const kind = TYPE_KIND[type] || NAME_KIND.find(([re]) => re.test(name))?.[1] || 'xbox';
    return {
      kind,
      swapped: ns.switchOn(switchRunning(fields, 'SetUseNintendoButtonLayout')),
      universal: ns.switchOn(switchRunning(fields, 'SetUseUniversalFaceButtonGlyphs')),
      rumble: rumble ? ns.switchOn(rumble) : null,
    };
  };

  const svg = (tag, attrs) => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  // The four buttons around (80, 60) on a 160 × 120 grid, rumble marks either side
  const PLACES = [[80, 20], [120, 60], [80, 100], [40, 60]];
  const SHAPES = {
    triangle: (x, y) => svg('path', { d: `M${x} ${y - 7}L${x + 7} ${y + 5}H${x - 7}Z` }),
    circle: (x, y) => svg('circle', { cx: x, cy: y, r: 6.5 }),
    cross: (x, y) => svg('path', { d: `M${x - 6} ${y - 6}L${x + 6} ${y + 6}M${x + 6} ${y - 6}L${x - 6} ${y + 6}` }),
    square: (x, y) => svg('rect', { x: x - 6, y: y - 6, width: 12, height: 12, rx: 1.5 }),
  };
  // Big Picture's universal glyph: four dots in a diamond, the button's own place filled
  const universalGlyph = (x, y, place) => {
    const g = svg('g', {});
    PLACES.forEach(([px, py], i) => {
      const dot = svg('circle', { cx: x + (px - 80) / 6.5, cy: y + (py - 60) / 6.5, r: 2.6 });
      if (i === place) dot.classList.add('se-ctl-dot-on');
      g.append(dot);
    });
    return g;
  };

  const makeFace = () => {
    const root = svg('svg', { viewBox: '0 0 160 120', class: 'se-ctl-face', 'aria-hidden': 'true' });
    return { root, key: '' };
  };

  const drawFace = (face, { kind, swapped, universal, rumble }) => {
    const key = `${kind}|${swapped}|${universal}|${rumble}`;
    if (key === face.key) return;
    face.key = key;
    const glyphs = GLYPHS[kind];
    // Nintendo layout swaps the pairs: top with left, right with bottom
    const at = swapped ? [glyphs[3], glyphs[2], glyphs[1], glyphs[0]] : glyphs;
    const parts = [];
    PLACES.forEach(([x, y], i) => {
      parts.push(svg('circle', { cx: x, cy: y, r: 17, class: 'se-ctl-btn' }));
      if (universal) parts.push(universalGlyph(x, y, i));
      else if (SHAPES[at[i]]) parts.push(SHAPES[at[i]](x, y));
      else {
        const t = svg('text', { x, y: y + 5.5, 'text-anchor': 'middle', class: 'se-ctl-letter' });
        t.textContent = at[i];
        parts.push(t);
      }
    });
    if (rumble) {
      parts.push(svg('path', { d: 'M12 40Q2 60 12 80M4 32Q-10 60 4 88', class: 'se-ctl-buzz' }));
      parts.push(svg('path', { d: 'M148 40Q158 60 148 80M156 32Q170 60 156 88', class: 'se-ctl-buzz' }));
    }
    face.root.replaceChildren(...parts);
  };

  // ---------- Advanced Settings ----------

  // The families, top to bottom, with each one's row as Steam builds it
  const FAMILIES = ['Xbox', 'PlayStation', 'Switch Pro', 'Generic'];
  const PS_OPTIONS = '0,1,2';

  const readAdvanced = (fields) => {
    // The family switches (Xbox, Switch Pro, generic), each its first row: Switch Pro's own layout
    // switch sits inside its family's part too
    const typed = new Map();
    for (const field of fields) {
      const type = propsOf(field, (p) => ('controllerType' in p && 'label' in p ? p.controllerType : undefined));
      if (type !== undefined && !typed.has(type)) typed.set(type, field);
    }
    if (!typed.size) return null;
    const [xbox, switchPro, generic] = [...typed.values()];
    const psField = fields.find(
      (field) => propsOf(field, (p) => (Array.isArray(p.rgOptions) && p.rgOptions.map((o) => o?.data).join() === PS_OPTIONS) || undefined)
    );
    const ps = psField ? ns.choiceAt(psField) : null;
    // 0 off, 1 in games without support, 2 on
    return [ns.switchOn(xbox) ? 2 : 0, ps ?? 0, ns.switchOn(switchPro) ? 2 : 0, ns.switchOn(generic) ? 2 : 0];
  };

  // Rows clear of the Steam Input box's band (48–80), lines from x 104
  const ROWS = [12, 38, 90, 116];
  const makeMap = () => {
    const root = svg('svg', { viewBox: '0 0 440 128', class: 'se-ctl-map', 'aria-hidden': 'true' });
    const links = ROWS.map(() => svg('path', { class: 'se-ctl-link' }));
    const labels = ROWS.map((y, i) => {
      const t = svg('text', { x: 96, y: y + 4, 'text-anchor': 'end', class: 'se-ctl-family' });
      t.textContent = FAMILIES[i];
      return t;
    });
    const node = (x, w, text) => {
      const g = svg('g', { class: 'se-ctl-node' });
      const t = svg('text', { x: x + w / 2, y: 68, 'text-anchor': 'middle' });
      t.textContent = text;
      g.append(svg('rect', { x, y: 48, width: w, height: 32, rx: 8 }), t);
      return g;
    };
    const input = node(196, 108, 'Steam Input');
    const out = svg('path', { d: 'M304 64H356', class: 'se-ctl-link' });
    root.append(...links, out, input, node(356, 80, 'Game'), ...labels);
    return { root, links, labels, input, out, key: '' };
  };

  const drawMap = (map, states) => {
    const key = states.join();
    if (key === map.key) return;
    map.key = key;
    states.forEach((state, i) => {
      const y = ROWS[i];
      // Through Steam Input: into its box's side; around it: along the row, then down or up to Game
      map.links[i].setAttribute(
        'd',
        state ? `M104 ${y}C150 ${y} 160 64 196 64` : `M104 ${y}H318C340 ${y} 340 64 356 64`
      );
      map.links[i].dataset.state = ['off', 'part', 'on'][state];
      map.labels[i].dataset.state = ['off', 'part', 'on'][state];
    });
    const any = states.some(Boolean);
    map.input.toggleAttribute('data-on', any);
    map.out.dataset.state = any ? 'on' : 'off';
  };

  const and = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);
  const summary = (states) => {
    const on = FAMILIES.filter((_, i) => states[i] === 2);
    const part = FAMILIES.filter((_, i) => states[i] === 1);
    if (!on.length && !part.length) return 'Off for every controller family';
    return [on.length && `On for ${and(on)}`, part.length && `${and(part)} in games without support`]
      .filter(Boolean)
      .join(' · ');
  };

  // ---------- Add a new controller ----------

  /*
   * Steam's view: its picture (PairingController: a Steam Controller and cable while a Puck is
   * there, else a row of recommended controllers), the Puck's note under it, a separator, then the
   * Bluetooth note (or, where Steam pairs over Bluetooth itself, a row). Both notes are bare divs.
   * The card takes the picture's place and the Puck's note as its line (Steam's words, any
   * language); the Bluetooth note becomes a card of its own (pages-controller.css).
   */
  const bare = (node) => node?.tagName === 'DIV' && !node.className && !node.querySelector(ns.FIELD);
  const readAdd = (pair) => {
    const note = bare(pair.nextElementSibling) ? pair.nextElementSibling : null;
    const last = pair.parentElement?.lastElementChild;
    return { pair, note, bluetooth: last !== note && bare(last) ? last : null, puck: ns.text(note) };
  };

  // A Steam Controller, its cable on the way in (Steam's own picture, drawn as lines)
  const makePlug = () => {
    const root = el('span', 'se-ctl-plug');
    const piece = el('span', 'se-ctl-piece');
    piece.dataset.piece = 'controller';
    piece.dataset.lit = '';
    drawingOf('triton.svg').then((drawing) => drawing && piece.append(document.importNode(drawing, true)));
    const cable = svg('svg', { viewBox: '0 0 200 140', class: 'se-ctl-cable', 'aria-hidden': 'true' });
    cable.append(
      svg('path', { d: 'M14 70H52M28 56L14 70L28 84', class: 'se-ctl-cable-arrow' }),
      svg('rect', { x: 62, y: 62, width: 30, height: 16, rx: 4 }),
      svg('path', { d: 'M92 70C130 70 140 112 196 112' })
    );
    root.append(piece, cable);
    return root;
  };

  // ---------- The card ----------

  const MODES = {
    list: (v) => v.art,
    details: (v) => (v.face ||= makeFace()).root,
    advanced: (v) => (v.map ||= makeMap()).root,
    add: (v) => (v.plug ||= makePlug()),
    'add-any': (v) => (v.anyArt ||= makeArt()),
  };

  const read = (page) => {
    if (!page.querySelector(`.${C.ControllerSettingsHeader}`)) {
      return { mode: 'list', on: connected(page), off: disconnected(page) };
    }
    const fields = fieldsOf(page);
    // Details: rows built for one controller (their props carry its index)
    if (fields.some((field) => Number.isInteger(propsOf(field, (p) => p.controllerIndex)))) {
      return { mode: 'details', ...readDetails(page, fields) };
    }
    const pair = page.querySelector(`.${C.PairingController}`);
    if (pair) {
      const add = readAdd(pair);
      return { mode: add.puck ? 'add' : 'add-any', ...add };
    }
    const families = readAdvanced(fields);
    return families ? { mode: 'advanced', families } : { mode: null };
  };

  // The add view's marks on Steam's nodes (pages-controller.css moves the pairing parts and hides
  // its picture): taken off when the view leaves it, and on teardown
  const addMarked = new Map(); // node → its dataset key
  const markAdd = (node, key) => {
    node.dataset[key] = '';
    addMarked.set(node, key);
  };
  const unmarkAdd = () => {
    for (const [node, key] of addMarked) delete node.dataset[key];
    addMarked.clear();
  };

  const view = ns.pageView({
    // Steam's route for this page carries a controller's type and place
    route: 'controller/:type/:controllerIndex',
    header: `.${C.ControllerSettingsHeader}`,
    make() {
      const hero = ns.pageHero();
      return { root: hero.root, hero, art: makeArt(), mode: '' };
    },
    read,
    draw(v, state) {
      const { mode } = state;
      if (mode !== 'add' && mode !== 'add-any') unmarkAdd();
      v.root.hidden = !mode;
      if (!mode) return;
      if (mode !== v.mode) {
        v.mode = mode;
        v.root.dataset.ctlMode = mode;
        v.hero.side.replaceChildren(MODES[mode](v));
      }
      if (mode === 'list') {
        const { on, off } = state;
        v.hero.title(on.length ? `${plural(on.length, 'controller', 'controllers')} connected` : 'No controller connected');
        v.hero.line(off ? `${off} disconnected` : on.length ? '' : 'Plug one in, or pair one over Bluetooth');
        for (const [name, , re] of PIECES) {
          v.art.querySelector(`[data-piece="${name}"]`)?.toggleAttribute('data-lit', on.some((n) => re.test(n)));
        }
      } else if (mode === 'details') {
        v.hero.title('Buttons as games show them');
        v.hero.line(
          [state.swapped ? SWAPPED[state.kind] : LAYOUT[state.kind], state.universal && 'Universal glyphs in Big Picture', state.rumble === false && 'Rumble off']
            .filter(Boolean)
            .join(' · ')
        );
        drawFace(v.face, state);
      } else if (mode === 'add' || mode === 'add-any') {
        v.hero.title('Connect a controller');
        v.hero.line(state.puck || 'Plug one in with a USB cable');
        markAdd(state.pair, 'seCtlMoved');
        if (state.note) markAdd(state.note, 'seCtlMoved');
        if (state.bluetooth) markAdd(state.bluetooth, 'seCtlBluetooth');
      } else {
        v.hero.title('Steam Input');
        v.hero.line(summary(state.families));
        drawMap(v.map, state.families);
      }
    },
  });

  window.__seSettingsController = {
    destroy() {
      view.destroy();
      unmarkAdd();
      delete window.__seSettingsController;
    },
  };
})(window.__se);
