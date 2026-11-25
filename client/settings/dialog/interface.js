/*
 * Steam Settings › Interface: a live preview of your Steam client over Steam's rows (styles:
 * client/settings/pages-interface.css).
 *
 * The preview is the theme's wireframe Library (SE.wireframe) in a small window, drawn from what
 * Steam's own rows say now and redrawn as they change:
 * - Start Up Location: the page the window opens on (Library, Store, News, Friend Activity,
 *   Community Home); Big Picture: its TV layout instead
 * - Ask which account to use: an account picker over it
 * - 24-hour clock: the time in its bar, in that format; Notify me about additions: a dot on its
 *   bell; Client Beta Participation: a Beta badge on its bar
 * - beside it: where Steam opens (Start Up Location, Big Picture), when (Run Steam when my computer
 *   starts, the account picker), and chips for Steam Client Language (its name and "Hello") and
 *   Scale text and icons (the scale it draws at, the wireframe drawn larger too)
 * Hovering a row lights the part it changes. Rows are told apart by their label, as the page's
 * row icons are (shared.js); a value is read from the row's switch (its On class) or dropdown
 * (its current text; Start Up Location and Client Beta Participation by their chosen option's
 * value, the same in every language). The Advanced rows and Taskbar Preferences change nothing
 * it shows.
 *
 * The page is found by its route (the content's id ends "/settings/interface_Content"), the same
 * in every language. The preview is the theme's own node first in Steam's body, after the page's
 * title (ns.pageView); Steam's rows stay as they are.
 */
((SE) => {
  window.__seSettingsInterface?.destroy();
  const ns = window.__seSettingsParts;
  if (!ns || !SE.wireframe) return;

  const { el } = SE;

  // A row's label → the part of the preview it changes
  const ROWS = [
    [/client language/i, 'lang'],
    [/24-hour clock/i, 'clock'],
    [/beta participation/i, 'beta'],
    [/start up location/i, 'start'],
    [/scale text and icons/i, 'scale'],
    [/run steam when my computer starts/i, 'boot'],
    [/big picture mode/i, 'bigpicture'],
    [/which account to use/i, 'account'],
    [/notify me about additions/i, 'notify'],
  ];

  // Start Up Location's options (their data in Steam's rgOptions) → the wireframe's view; the
  // Library's is the default
  const VIEWS = { store: 'store', friendactivity: 'activity', news: 'news', community: 'community' };
  // Client Beta Participation's option for no beta (Steam's #Settings_Beta_None, data "-1")
  const NO_BETA = '-1';

  // "Hello" in the language Steam is set to, by its name in English or its own
  const HELLO = [
    [/english/i, 'Hello'], [/german|deutsch/i, 'Hallo'], [/french|français/i, 'Bonjour'],
    [/spanish|español/i, 'Hola'], [/italian/i, 'Ciao'], [/portugu/i, 'Olá'],
    [/russian|русский/i, 'Привет'], [/ukrain|україн/i, 'Привіт'], [/japanese|日本語/i, 'こんにちは'],
    [/korean|한국어/i, '안녕하세요'], [/chinese|中文/i, '你好'], [/polish|polski/i, 'Cześć'],
    [/turkish|türkçe/i, 'Merhaba'], [/dutch|nederlands/i, 'Hallo'], [/swedish|svenska/i, 'Hej'],
    [/danish|dansk/i, 'Hej'], [/norwegian|norsk/i, 'Hei'], [/finnish|suomi/i, 'Hei'],
    [/czech|čeština/i, 'Ahoj'], [/hungarian|magyar/i, 'Szia'], [/greek|ελληνικά/i, 'Γειά'],
    [/thai|ไทย/i, 'สวัสดี'], [/vietnam|tiếng việt/i, 'Xin chào'], [/romanian|română/i, 'Salut'],
    [/bulgarian|български/i, 'Здравей'], [/arabic|العربية/i, 'مرحبا'], [/indonesia/i, 'Halo'],
  ];

  const keyOf = (field) => {
    const label = ns.fieldLabel(field);
    return ROWS.find(([re]) => re.test(label))?.[1] || null;
  };

  // A dropdown row's chosen option's data (ns.choiceAt's place in its live rgOptions), or null
  const dataOf = (field) => {
    const at = ns.choiceAt(field);
    const drop = field?.querySelector('.DialogDropDown');
    if (at === null || !drop) return null;
    const data = SE.run(() =>
      SE.fromProps(drop, 8, (p) => (Array.isArray(p.rgOptions) ? p.rgOptions[at]?.data : undefined), { live: true })
    );
    return data === undefined || data === null ? null : String(data);
  };

  // Each known row's value: true / false for a switch, the shown text for a dropdown; Start Up
  // Location's and Client Beta's chosen options as their data
  function read(page) {
    const rows = ns.rowsOf(page, ROWS);
    const state = {};
    for (const [key, field] of Object.entries(rows)) {
      const drop = field.querySelector('.DialogDropDown_CurrentDisplay');
      if (drop) state[key] = ns.text(drop);
      else if (field.querySelector('.Toggle')) state[key] = ns.switchOn(field);
    }
    state.startData = dataOf(rows.start);
    state.betaData = dataOf(rows.beta);
    return state;
  }

  const part = (cls, name, text = '') => {
    const node = el('span', cls, text);
    node.dataset.part = name;
    return node;
  };

  function makePreview() {
    const root = el('div', 'se-ifc-preview');
    root.setAttribute('aria-hidden', 'true'); // a picture of the client, not a control
    const win = el('div', 'se-ifc-window');
    win.dataset.part = 'bigpicture';
    const bar = el('div', 'se-ifc-bar');
    const beta = part('se-ifc-beta', 'beta', 'Beta');
    const bell = part('se-ifc-bell', 'notify');
    const clock = part('se-ifc-clock', 'clock');
    bar.append(beta, bell, clock);
    const screen = el('div', 'se-ifc-screen');
    screen.dataset.part = 'start';
    const account = part('se-ifc-account', 'account');
    account.append(el('b'), el('b'), el('b'));
    win.append(bar, screen, account);
    // The left side: where Steam opens (title), when (line), then the language and scale chips
    const title = part('se-ifc-title', 'start');
    const boot = part('se-ifc-line', 'boot');
    const lang = part('se-ifc-chip', 'lang');
    const scale = part('se-ifc-chip', 'scale');
    const chips = el('div', 'se-ifc-chips');
    chips.append(lang, scale);
    const side = el('div', 'se-ifc-side');
    side.append(title, boot, chips);
    root.append(side, win);
    return { root, win, beta, bell, clock, screen, account, title, lang, boot, scale, view: '', clock24: false };
  }

  const timeText = (v) =>
    new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !v.clock24 });

  function draw(v, s) {
    // The Library with Home on Steam's is Steam's Home
    const library = SE.settings?.get('home') === 'steam' ? 'steamhome' : 'library';
    const view = s.bigpicture ? 'bigpicture' : VIEWS[s.startData] || library;
    if (view !== v.view) {
      v.view = view;
      v.screen.innerHTML = SE.wireframe({ view });
    }
    v.clock24 = !!s.clock;
    const time = timeText(v);
    if (v.clock.textContent !== time) v.clock.textContent = time;
    SE.attr(v.beta, 'data-on', s.betaData !== null && s.betaData !== NO_BETA ? '' : null);
    SE.attr(v.bell, 'data-on', s.notify ? '' : null);
    SE.attr(v.account, 'data-on', s.account ? '' : null);
    SE.attr(v.win, 'data-scaled', s.scale ? '' : null);
    const name = s.lang || '';
    const hello = HELLO.find(([re]) => re.test(name))?.[1];
    const langText = [name, hello].filter(Boolean).join(' · ');
    if (v.lang.textContent !== langText) v.lang.textContent = langText;
    const where = s.bigpicture ? 'Opens in Big Picture' : `Opens on ${s.start || 'the Library'}`;
    if (v.title.textContent !== where) v.title.textContent = where;
    const bootText = [s.boot ? 'When your computer starts' : 'When you start it', s.account ? 'asks which account' : '']
      .filter(Boolean)
      .join(', ');
    if (v.boot.textContent !== bootText) v.boot.textContent = bootText;
    const scaleText = `Drawn at ${s.scale ? Math.round((window.devicePixelRatio || 1) * 100) : 100}%`;
    if (v.scale.textContent !== scaleText) v.scale.textContent = scaleText;
  }

  // Before the page's first paint, so the rows never jump down; redrawn as Steam's switches move
  // their On class and its dropdowns change their text
  const page = ns.pageView({ route: 'interface', make: makePreview, read, draw, characterData: true });

  // The hovered row's part lit, the rest of the preview dimmed
  let hovered = null;
  const onOver = (event) => {
    const field = event.target.closest?.(`${page.PAGE} .Field`);
    const key = field ? keyOf(field) : null;
    if (key === hovered) return;
    hovered = key;
    for (const v of page.views) {
      SE.attr(v.root, 'data-focus', key);
      for (const node of v.root.querySelectorAll('[data-part]')) SE.attr(node, 'data-lit', node.dataset.part === key ? '' : null);
    }
  };

  // The preview's clock: no event says the minute turned, so it's checked while the page is open
  const clock = SE.poll(() => {
    for (const v of page.views) {
      const time = timeText(v);
      if (v.clock.textContent !== time) v.clock.textContent = time;
    }
  }, 15000, { active: () => page.views.size > 0 });
  document.addEventListener('pointerover', onOver);

  window.__seSettingsInterface = {
    destroy() {
      page.destroy();
      clock.disconnect();
      document.removeEventListener('pointerover', onOver);
      delete window.__seSettingsInterface;
    },
  };
})(window.__se);
