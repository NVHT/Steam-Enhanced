/*
 * The startup window (client/startup/startup.css, sign-in.css): the lockup and the two-step bar
 * (Network, then signing in; the Library's own bar is the splash's), the background layer, and
 * the sign-in form's tags.
 */
((SE) => {
  window.__seStartup?.destroy();
  if (!document.body) return;

  const { C } = SE;
  const CLS = {
    animatedBg: C.LoginAnimatedBackground,
    china: C.SteamChina,
    login: C.Login,
    statusBox: C.LoginStatusContainer,
    chooser: C.UserChooser,
    // Steam Guard's "Account name: …" line, on its code and its mobile confirmation screens
    guard: C.ProtectingAccount,
    // A failed sign-in's title (Can't connect, Too many retries...)
    failure: C.FailureTitle,
    spinner: C.SpinnerLoaderContainer,
  };

  const SIGNIN_ATTR = 'data-se-si';
  // LoginStore loginState enum: 2 = network, 3 = steam server, 4 = library, 6 = shutdown
  const LOGIN_PHASES = { 2: 'net', 3: 'server', 4: 'lib', 6: 'off' };
  // The failure screen's `failure` prop (sp.js, the login module's failure enum): 3 = Network
  const FAILURE_NETWORK = 3;
  const VALID_BACKGROUNDS = ['aurora', 'library', 'mosaic', 'wall', 'plain', 'dots', 'steam'];

  const docRoot = document.documentElement;
  const MOSAIC_COLS = 12;
  const MOSAIC_GAP = 6;

  let lockup = null;
  let steps = null;
  let bgLayer = null;
  let bgLayerKind = '';
  let bgLayerHost = null;
  let poller = null;
  let loginEvents = null;
  let watcher = null;
  let mosaicResizeObserver = null;
  // The Startup background setting (client/shared/settings.js), read live
  const resolveBackgroundSetting = () => {
    const val = SE.settings?.get('startup-background');
    return VALID_BACKGROUNDS.includes(val) ? val : 'aurora';
  };

  const resolveLoginStore = () => {
    for (const win of SE.owners()) {
      try {
        if (win.loginStore && typeof win.loginStore.loginState === 'number') {
          return win.loginStore;
        }
      } catch {}
    }
    return null;
  };

  const readPhase = (statusBox) => {
    const store = resolveLoginStore();
    const state = store
      ? store.loginState
      : SE.fromProps(statusBox, 12, (p) => (typeof p.loginState === 'number' ? p.loginState : undefined));
    return LOGIN_PHASES[state] || '';
  };

  const buildLockup = () => {
    const el = document.createElement('div');
    el.className = 'se-startup-lockup';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="se-startup-brand"><span class="se-startup-tile"></span><span class="se-startup-word"><small>Steam</small><b>Enhanced</b></span></div>' +
      '<div class="se-startup-heading"><b></b><span></span></div>';
    return el;
  };

  // Steam's own status line says the same in the window's language; the bar is decoration.
  const buildSteps = () => {
    const el = document.createElement('div');
    el.className = 'se-startup-steps';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="se-startup-track"><span data-step="net"><i></i></span><span data-step="server"><i></i></span></div>' +
      '<div class="se-startup-labels">' +
        '<span data-step="net"><i class="se-startup-spin se-spin-arc"></i><b class="se-startup-tick"></b><span></span></span>' +
        '<span data-step="server"><i class="se-startup-spin se-spin-arc"></i><b class="se-startup-tick"></b><img class="se-startup-avatar" alt=""><span></span></span>' +
      '</div>';
    return el;
  };

  /*
   * Each step's state, fill and words: a login screen waits on the second step; the Library
   * phase is the signed-in beat (its own progress is the splash's bar); shutting down ends both.
   */
  // The status screen's title (Steam's own status line is often empty); none on a login screen.
  const HEADINGS = {
    net: ['Connecting…', ''],
    server: ['Signing in…', 'The Library opens next, in the main window.'],
    lib: ['Signed in', 'Opening the Library…'],
    off: ['Shutting down…', ''],
  };

  const stepStates = (phase, account) => {
    const who = account?.name;
    const signingIn = who ? `Signing in as ${who}…` : 'Signing in…';
    // Each label names its step, a spinner while it runs and a tick once done; the heading
    // says what is happening.
    const net = phase === 'net'
      ? { state: 'current', fill: 0, text: 'Network' }
      : { state: 'done', fill: 1, text: 'Network' };
    let server;
    if (phase === 'net') server = { state: 'waiting', fill: 0, text: signingIn };
    else if (phase === 'server') server = { state: 'current', fill: 0, text: signingIn };
    else if (phase === 'lib') server = { state: 'done', fill: 1, text: who ? `Signed in as ${who}` : 'Signed in' };
    else if (phase === 'off') server = { state: 'done', fill: 1, text: 'Shutting down' };
    else server = { state: 'waiting', fill: 0, text: 'Waiting for sign-in' };
    // A failed sign-in: no connection stops at the first step, anything else at the second.
    if (phase === 'net-failed') return { net: { state: 'failed', fill: 1, text: 'No connection' }, server };
    if (phase === 'failed') return { net, server: { state: 'failed', fill: 1, text: 'Sign-in failed' } };
    return { net, server };
  };

  const updateSteps = (phase, account) => {
    for (const [id, step] of Object.entries(stepStates(phase, account))) {
      for (const el of steps.querySelectorAll(`[data-step="${id}"]`)) SE.mark(el, 'data-state', step.state);
      const track = steps.querySelector(`.se-startup-track [data-step="${id}"]`);
      if (track.style.getPropertyValue('--se-fill') !== String(step.fill)) track.style.setProperty('--se-fill', step.fill);
      const text = steps.querySelector(`.se-startup-labels [data-step="${id}"] > span`);
      if (text.textContent !== step.text) text.textContent = step.text;
    }
    const [title, sub] = HEADINGS[phase] || ['', ''];
    const heading = lockup.querySelector('.se-startup-heading');
    if (heading.firstChild.textContent !== title) heading.firstChild.textContent = title;
    if (heading.lastChild.textContent !== sub) heading.lastChild.textContent = sub;
    const avatar = steps.querySelector('.se-startup-avatar');
    const src = phase === 'net' || phase === 'server' || phase === 'lib' ? account?.avatar || '' : '';
    if (src && avatar.getAttribute('src') !== src) avatar.src = src;
    else if (!src && avatar.hasAttribute('src')) avatar.removeAttribute('src');
  };

  // The lockup and the bar, kept in the login host of whichever screen is up.
  const mountChrome = (host, withSteps) => {
    if (!lockup || lockup.parentNode !== host) {
      lockup?.remove();
      lockup = buildLockup();
      host.append(lockup);
    }
    if (!withSteps) {
      steps?.remove();
      steps = null;
    } else if (!steps || steps.parentNode !== host) {
      steps?.remove();
      steps = buildSteps();
      host.append(steps);
    }
  };

  const removeChrome = () => {
    lockup?.remove();
    steps?.remove();
    lockup = steps = null;
  };

  /*
   * The account Steam shows under its status line: the box holding the status screen's only
   * image outside the spinner. Read by structure (no class of its own in the class map), then
   * hidden: its name and avatar move into the bar.
   */
  const readAccount = (statusBox) => {
    const img = [...statusBox.querySelectorAll('img')].find(el => !el.closest(`.${CLS.spinner}`));
    let chip = img;
    while (chip && chip !== statusBox && !chip.textContent.trim()) chip = chip.parentElement;
    if (!img || !chip || chip === statusBox) return null;
    SE.mark(chip, 'data-se-startup-account');
    return { name: chip.textContent.trim(), avatar: img.currentSrc || img.src };
  };

  const resolveWallImage = (host) => {
    const computedBg = getComputedStyle(host).backgroundImage;
    if (computedBg && computedBg !== 'none') return computedBg;
    return host.classList.contains(CLS.china)
      ? 'url(/images/client_login_bg_grid_china.jpg)'
      : 'url(/images/client_login_bg_grid.jpg)';
  };

  const syncMosaicGrid = () => {
    if (!bgLayer || bgLayerKind !== 'mosaic') return;
    const grid = bgLayer.querySelector('.se-startup-mosaic');
    const width = bgLayer.clientWidth || innerWidth;
    const height = bgLayer.clientHeight || innerHeight;
    const cellWidth = (width - MOSAIC_GAP * (MOSAIC_COLS + 1)) / MOSAIC_COLS;
    const rows = Math.ceil(height / (cellWidth * 1.5 + MOSAIC_GAP)) + 1;
    const targetCount = MOSAIC_COLS * rows;

    while (grid.children.length < targetCount) {
      const idx = grid.children.length;
      const tile = document.createElement('span');
      tile.style.setProperty('--se-tile-dur', `${6 + ((idx * 13) % 7)}s`);
      tile.style.setProperty('--se-tile-delay', `${-((idx * 37) % 97) / 10}s`);
      grid.append(tile);
    }
    while (grid.children.length > targetCount) {
      grid.lastChild.remove();
    }
  };

  const removeBackgroundLayer = () => {
    mosaicResizeObserver?.disconnect();
    mosaicResizeObserver = null;
    bgLayer?.remove();
    bgLayer = null;
    if (bgLayerHost) SE.unmark(bgLayerHost, 'data-se-startup-host');
    bgLayerHost = null;
    bgLayerKind = '';
  };

  const mountBackgroundLayer = (kind) => {
    const host = document.querySelector(`.${CLS.animatedBg}`);
    if (kind === 'steam' || !host) {
      removeBackgroundLayer();
      return;
    }
    if (bgLayer && bgLayerHost === host && bgLayerKind === kind) return;
    removeBackgroundLayer();

    const wallImg = resolveWallImage(host);
    bgLayer = document.createElement('div');
    bgLayer.className = 'se-startup-bg';
    bgLayer.dataset.kind = kind;
    bgLayer.setAttribute('aria-hidden', 'true');
    bgLayer.style.setProperty('--se-startup-wall', wallImg);

    if (kind === 'mosaic') bgLayer.innerHTML = '<div class="se-startup-mosaic"></div>';
    // The Library's wireframe, alive and busy (client/shared/wireframe.js); Aurora draws it
    // faintly over three glows (startup.css)
    const wireframe = SE.wireframe?.({ alive: true, busy: true }) || '';
    if (kind === 'library') bgLayer.innerHTML = wireframe;
    if (kind === 'aurora') bgLayer.innerHTML = '<i class="se-startup-glow"></i>'.repeat(3) + wireframe;
    host.append(bgLayer);
    bgLayerHost = host;
    bgLayerKind = kind;
    SE.mark(host, 'data-se-startup-host');

    if (kind === 'mosaic') {
      syncMosaicGrid();
      mosaicResizeObserver = new ResizeObserver(syncMosaicGrid);
      mosaicResizeObserver.observe(bgLayer);
    }
  };

  // Tag sign-in form elements structurally so sign-in.css remains resilient to hash changes.
  const tagNode = (el, role) => {
    if (el) SE.mark(el, SIGNIN_ATTR, role);
  };

  const clearSigninTags = () => {
    for (const el of document.querySelectorAll(`[${SIGNIN_ATTR}]`)) {
      SE.unmark(el, SIGNIN_ATTR);
      SE.unmark(el, 'data-se-si-busy');
    }
  };

  const annotateSigninForm = (form) => {
    const cardNode = form.parentElement;
    const columnNode = cardNode?.parentElement;
    if (!cardNode || !columnNode) return;

    tagNode(columnNode, 'column');
    tagNode(cardNode, 'card');
    tagNode(form, 'form');

    let passedCard = false;
    for (const child of columnNode.children) {
      if (child === cardNode) {
        passedCard = true;
        continue;
      }
      if (!passedCard && child.querySelector('svg')) {
        tagNode(child, 'logo');
        for (const sub of child.children) {
          tagNode(sub, sub.tagName.toLowerCase() === 'svg' ? 'wordmark' : 'back');
        }
      } else if (passedCard && child.querySelector('a, div, span')) {
        tagNode(child, 'footer');
        for (const sub of child.children) {
          if (sub.children.length) {
            tagNode(sub, 'create');
            tagNode(sub.firstElementChild, 'create-prompt');
            if (sub.lastElementChild !== sub.firstElementChild) {
              tagNode(sub.lastElementChild, 'create-link');
            }
          } else {
            tagNode(sub, 'help');
          }
        }
      }
    }

    const formChildren = [...form.children];
    for (const child of formChildren) {
      if (child.querySelector('input')) {
        tagNode(child, 'field');
        tagNode(child.querySelector('label'), 'label');
        tagNode(child.querySelector('input'), 'input');
      } else if (child.querySelector('[role="checkbox"]')) {
        tagNode(child, 'remember');
        tagNode(child.querySelector('[role="checkbox"]'), 'check');
      } else if (child.querySelector('button')) {
        tagNode(child, 'submit');
        tagNode(child.querySelector('button'), 'button');
      } else if (child === formChildren[formChildren.length - 1] || !child.querySelector('*')) {
        tagNode(child, 'error');
      }
    }

    const qrColumn = [...cardNode.children].find(el => el !== form);
    if (qrColumn) {
      tagNode(qrColumn, 'qr');
      const innerBox = qrColumn.firstElementChild;
      const parts = innerBox ? [...innerBox.children] : [];
      const qrTile = parts.find(el => el.querySelector('canvas, svg, img'));
      for (const el of parts) {
        if (el === qrTile) continue;
        if (el.tagName === 'LABEL') tagNode(el, 'qr-label');
        else if (el.querySelector('a')) tagNode(el, 'qr-help');
      }
      if (qrTile) {
        tagNode(qrTile, 'qr-tile');
        const relWrapper = [...qrTile.querySelectorAll('div')].find(d => d.style.position === 'relative');
        tagNode(relWrapper?.firstElementChild || qrTile.querySelector('canvas, svg, img'), 'qr-code');
        if (relWrapper && relWrapper.children.length > 1) {
          SE.mark(qrTile, 'data-se-si-busy');
        } else {
          SE.unmark(qrTile, 'data-se-si-busy');
        }
      }
    }

  };

  const detectLoginScreen = () => {
    const loginHost = document.querySelector(`.${CLS.login}`);
    if (!loginHost) return null;
    // The form first, window-wide: from the chooser (Add Account) it wasn't found in the host.
    const passwordInput = document.querySelector('form input[type="password"]');
    if (passwordInput) return { kind: 'signin', el: passwordInput.closest('form') };
    const guard = document.querySelector(`.${CLS.guard}`);
    if (guard) return { kind: 'guard', el: guard };
    const failure = document.querySelector(`.${CLS.failure}`);
    if (failure) return { kind: 'failure', el: failure };
    const chooser = loginHost.querySelector(`.${CLS.chooser}`);
    if (chooser) return { kind: 'chooser', el: chooser };
    return { kind: 'other', el: loginHost };
  };

  const stopPolling = () => {
    poller?.disconnect();
    poller = null;
    SE.run(() => loginEvents?.unregister?.());
    loginEvents = null;
  };

  const resetStartupState = () => {
    stopPolling();
    removeChrome();
    clearSigninTags();
    for (const el of document.querySelectorAll('[data-se-startup-account]')) SE.unmark(el, 'data-se-startup-account');
    removeBackgroundLayer();
    for (const attrName of ['data-se-startup', 'data-se-startup-phase', 'data-se-startup-bg', 'data-se-login']) {
      SE.unmark(docRoot, attrName);
    }
  };

  const update = () => {
    const statusBox = document.querySelector(`.${CLS.statusBox}`);
    const loginHost = statusBox?.closest(`.${CLS.login}`);
    const phase = statusBox ? readPhase(statusBox) : '';
    const bgKind = resolveBackgroundSetting();

    if (statusBox && loginHost && phase) {
      clearSigninTags();
      SE.unmark(docRoot, 'data-se-login');
      SE.mark(docRoot, 'data-se-startup');
      SE.mark(docRoot, 'data-se-startup-phase', phase);
      SE.mark(docRoot, 'data-se-startup-bg', bgKind);
      mountChrome(loginHost, true);
      updateSteps(phase, readAccount(statusBox));
      mountBackgroundLayer(bgKind);
      return;
    }

    const screen = detectLoginScreen();
    if (!screen) {
      resetStartupState();
      return;
    }

    SE.unmark(docRoot, 'data-se-startup-phase');
    SE.mark(docRoot, 'data-se-startup');
    SE.mark(docRoot, 'data-se-login', screen.kind);
    SE.mark(docRoot, 'data-se-startup-bg', bgKind);

    if (screen.kind === 'signin') annotateSigninForm(screen.el);
    else clearSigninTags();
    // The chooser, the form and Steam Guard have no step to show (the last two need the window's foot).
    const withSteps = screen.kind === 'other' || screen.kind === 'failure';
    mountChrome(document.querySelector(`.${CLS.login}`), withSteps);
    if (screen.kind === 'failure') {
      const failure = SE.fromProps(screen.el, 12, (p) => (typeof p.failure === 'number' ? p.failure : undefined));
      updateSteps(failure === FAILURE_NETWORK ? 'net-failed' : 'failed', null);
    } else if (withSteps) updateSteps('', null);
    mountBackgroundLayer(bgKind);
  };

  const startPolling = () => {
    if (poller) return;
    update();
    // Steam reports each login step and percentage (loginStore.OnLoginStateChange is fed by the
    // same event), so the bar moves on the event. The poll stays as a slow backstop for the
    // card swaps the event doesn't cover.
    loginEvents = SE.run(() => SE.global('SteamClient')?.User?.RegisterForLoginStateChange?.(() => update()));
    poller = SE.poll(update, loginEvents ? 1000 : 250, { active: () => !!document.querySelector(`.${CLS.statusBox}`) });
  };

  const stopWatching = () => {
    watcher?.disconnect();
    watcher = null;
  };

  const check = () => {
    if (document.querySelector(`.${CLS.statusBox}`)) startPolling();
    else if (detectLoginScreen()) update();
    else if (poller || lockup || bgLayer || docRoot.hasAttribute('data-se-startup')) {
      resetStartupState();
    }
  };

  // Kept for the window's life (sign-out or an account switch can show sign-in again later).
  // Sync, so a new screen is tagged before its first paint (throttled, Steam's bare form showed
  // for a few frames); check() is two querySelector calls when nothing startup-related is up.
  watcher = SE.watch(check, { sync: true });
  check();

  // The Hero background (gone) saved art here; drop what it left.
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && /^se-startup-(art|diag|hero:)/.test(key)) localStorage.removeItem(key);
    }
  } catch {}

  window.__seStartup = {
    destroy() {
      stopWatching();
      resetStartupState();
      delete window.__seStartup;
    },
  };
})(window.__se);
