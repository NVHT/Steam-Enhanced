/*
 * Startup preview: a theming aid. Ctrl+Shift+L (loaded on demand by core/core.js) in a client
 * window draws every screen of the startup window (the status phases, the account chooser,
 * the sign-in form, a failed sign-in, Steam Guard) in a box the size of the startup window, so
 * client/startup/ can be checked without signing out or dropping the network. Ctrl+Shift+L
 * again (or Esc, or Close) removes it. Its "Real" buttons restart Steam into the real startup
 * window (the account chooser or the sign-in form), after a second click.
 *
 * The screens are Steam's own markup, rebuilt from sp.js (the login module, the account chooser,
 * the status screen and the code input) with Steam's English text; the theme's real startup.js
 * and CSS then style them, as in the startup window. The box is transformed, so the screens'
 * fixed parts place themselves in it. What startup.js reads from Steam's state gets a stand-in:
 * a failure's kind (a fiber on its title holding that prop) and the status phase (window
 * .loginStore, Steam's debugging global, swapped while a status screen shows and put back after).
 */
(() => {
  if (window.__seStartupPreview) {
    window.__seStartupPreview.destroy();
    return;
  }
  const SE = window.__se;
  if (!SE || !document.body) return;

  // The startup window's size, in CSS px
  const WINDOW_W = 705;
  const WINDOW_H = 440;
  // The failure enum (sp.js, the login module): 3 = Network, 5 = RateLimitExceeded
  const FAILURE = { network: 3, rateLimit: 5 };
  // LoginStore loginState (client/startup/startup.js): 2 network, 3 server, 4 library, 6 shutdown
  const LOGIN_STATE = { network: 2, server: 3, library: 4, shutdown: 6 };
  const ACCOUNT = 'previewaccount';
  const PERSONA = 'Preview Player';

  const K = {
    // The startup window's hosts (client/startup/startup.js)
    login: SE.C.Login,
    animatedBg: SE.C.LoginAnimatedBackground,
    // The login module
    standardLayout: SE.C.StandardLayout,
    compact: SE.C.Compact,
    formContainer: SE.C.FormContainer,
    logoContainer: SE.C.LogoContainer,
    headerLogo: SE.C.HeaderLogo,
    flexCol: SE.C.FlexCol,
    alignCenter: SE.C.AlignItemsCenter,
    protectingAccount: SE.C.ProtectingAccount,
    label: SE.C.AccountCreation_Label,
    accountName: SE.C.AccountName,
    description: SE.C.Description,
    entryContainer: SE.C.ConfirmationEntryContainer,
    formError: SE.C.FormError,
    fromMobileContainer: SE.C.EnterCodeFromMobileContainer,
    fromMobile: SE.C.EnterCodeFromMobile,
    mobileIcon: SE.C.AwaitingMobileConfIcon,
    fromEmailContainer: SE.C.EnterCodeFromEmailContainer,
    fromEmail: SE.C.EnterCodeFromEmail,
    emailAddress: SE.C.EnterCodeEmailAddress,
    emailIcon: SE.C.AwaitingEmailConfIcon,
    backupContainer: SE.C.EnterBackupCodeContainer,
    textLink: SE.C.TextLink,
    textCenter: SE.C.TextAlignCenter,
    confirmation: SE.C.ConfirmationContainer,
    confirmText: SE.C.AwaitingMobileConfText,
    linkContainer: SE.C.LinkContainer,
    codeInsteadLink: SE.C.EnterCodeInsteadLink,
    failureTitle: SE.C.FailureTitle,
    failureDescription: SE.C.FailureDescription,
    failureButtons: SE.C.FailureButtons,
    submitButton: SE.C.SubmitButton,
    tryAgainButton: SE.C.TryAgainButton,
    offerOffline: SE.C.OfferOffline,
    offerOfflineButton: SE.C.OfferOfflineButton,
    errorReference: SE.C.MutedErrorReference,
    // The segmented code input
    codeInput: SE.C.SegmentedCharacterInput,
    codeInputDanger: SE.C.Danger,
    codeInputBackup: SE.C.BackupCode,
    codeInputCell: SE.C.Input,
    // The sign-in form (the login module, embedded in the client)
    embeddedRoot: SE.C.EmbeddedRoot,
    inClient: SE.C.InClient,
    backArrowContainer: SE.C.BackArrowContainer,
    sideBySide: SE.C.SideBySide,
    embedded: SE.C.Embedded,
    loginForm: SE.C.LoginForm,
    textField: SE.C.TextField,
    textInput: SE.C.TextInput,
    textInputDanger: SE.C.Danger,
    fieldLabel: SE.C.AccountCreation_FieldLabel,
    fieldLabelHighlight: SE.C.Highlight,
    checkboxField: SE.C.CheckboxField,
    checkboxLabel: SE.C.CheckboxFieldLabel,
    checkbox: SE.C.Checkbox,
    check: SE.C.Check,
    signInButtonContainer: SE.C.SignInButtonContainer,
    qrSection: SE.C.QRSection,
    qrCodeContainer: SE.C.QRCodeContainer,
    qr: SE.C.QR,
    useMobileAppForQR: SE.C.UseMobileAppForQR,
    embeddedRootFooter: SE.C.EmbeddedRootFooter,
    accountCreation: SE.C.AccountCreation,
    accountCreationPrompt: SE.C.AccountCreationPrompt,
    // The status screen and its throbber
    statusContainer: SE.C.LoginStatusContainer,
    statusLine: SE.C.LoginStatus,
    statusProgress: SE.C.Progress,
    statusUser: SE.C.UserContainer,
    statusAvatar: SE.C.Avatar,
    statusPersona: SE.C.PersonaName,
    throbber: SE.C.BigPictureBoot_Container,
    throbberBackground: SE.C.ContainerBackground,
    throbberSpinner: SE.C.SpinnerLoaderContainer,
    throbberMedium: SE.C.Medium,
    throbberStatus: SE.C.LoadingStatus,
    statusThrobber: SE.C.StatusThrobber,
    // The account chooser
    userChooser: SE.C.UserChooser,
    chooserContent: SE.C.Content,
    chooserLogo: SE.C.HeaderLogo,
    avatarContainer: SE.C.AvatarContainer,
    whosPlaying: SE.C.WhosPlaying,
    cachedUsers: SE.C.CachedUsers,
    userList: SE.C.UserList,
    user: SE.C.User,
    userIcon: SE.C.Account_Icon,
    userName: SE.C.Account_Name,
    userPersona: SE.C.Persona,
    userAccount: SE.C.Account,
    userExisting: SE.C.Existing,
    userNew: SE.C.New,
    moreMenuButton: SE.C.MoreMenuButton,
    moreMenuIcon: SE.C.MoreMenuIcon,
    chooserToggle: SE.C.Account_Toggle,
  };

  const el = (tag, classes, children = [], attrs = {}) => {
    const node = document.createElement(tag);
    if (classes) node.className = classes.join(' ');
    for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
    node.append(...children);
    return node;
  };
  const row = (classes, children) => el('div', classes, children, { style: 'display: flex; flex-direction: row; justify-content: space-evenly; align-items: center;' });
  const col = (classes, children, gap) => el('section', [K.flexCol, ...classes], children, gap === undefined ? {} : { style: `gap: ${gap}px;` });
  const link = (text, href) => (href
    ? el('a', [K.textLink, K.textCenter], [text], { href })
    : el('div', [K.textLink, K.textCenter], [text]));

  // Steam's panel: the logo row only on Steam Guard screens.
  const layout = (children, withLogo) => el('section', [K.flexCol, K.standardLayout, K.compact, 'IN_CLIENT'], [
    ...(withLogo ? [el('div', [K.logoContainer], [el('div', [K.headerLogo])])] : []),
    el('div', [K.formContainer], children),
  ], { style: 'gap: 0px;' });

  const account = (type) => el('div', [K.protectingAccount], [
    el('div', [K.label], ['Account: ', el('span', [K.accountName], [ACCOUNT])]),
    el('div', [K.description], [type === 'email'
      ? 'You have an email authenticator protecting this account.'
      : 'You have a mobile authenticator protecting this account.']),
  ]);

  const codeInput = (length, { danger, backup }) => el(
    'div',
    [K.codeInput, ...(danger ? [K.codeInputDanger] : []), ...(backup ? [K.codeInputBackup] : [])],
    Array.from({ length }, () => el('input', [K.codeInputCell], [], { type: 'text', maxlength: '1', autocomplete: 'none' }))
  );

  // The code screen: mobile, email or backup code; `wrong` shows the wrong-code state.
  const codeScreen = ({ type, backup = false, wrong = false }) => {
    let prompt;
    if (backup) {
      prompt = row([K.backupContainer], [col([], [
        el('div', [K.fromMobile], ['Enter seven digit backup code']),
        el('div', [K.label], ['Backup codes are single-use Steam Guard codes that you can generate for your account.']),
      ])]);
    } else if (type === 'email') {
      prompt = row([K.fromEmailContainer], [
        col([K.alignCenter], [el('div', [], [el('div', [K.fromEmail], [
          'Enter the code from your email address at: ', el('span', [K.emailAddress], ['p•••@example.com']),
        ])])]),
        el('div', [K.emailIcon]),
      ]);
    } else {
      prompt = row([K.fromMobileContainer], [
        el('div', [K.fromMobile], ['Enter the code from your Steam Mobile App']),
        el('div', [K.mobileIcon]),
      ]);
    }
    const help = type === 'email'
      ? 'Help, I no longer have access to the email address for this account'
      : 'Help, I no longer have access to my Steam Mobile App';
    return layout([el('form', [], [col([K.alignCenter], [
      account(type),
      el('div', [K.entryContainer], [
        col([K.alignCenter], [
          ...(wrong ? [el('div', [K.formError], ['Incorrect code, please try again'])] : []),
          codeInput(backup ? 7 : 5, { danger: wrong, backup }),
        ], 2),
        prompt,
      ]),
      ...(type === 'mobile' ? [link(backup ? 'Use mobile authenticator code' : 'Use backup code')] : []),
      link(help, 'https://help.steampowered.com/'),
    ], 14)])], true);
  };

  const confirmScreen = () => layout([col([], [
    account('mobile'),
    col([K.alignCenter], [el('div', [K.confirmation], [
      el('img', [], [], { src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', alt: '' }),
      el('div', [K.confirmText], ['Use the ', el('b', [], ['Steam Mobile App']), ' to confirm your sign in...']),
    ])]),
    el('div', [K.linkContainer], [
      el('div', [K.codeInsteadLink], [link('Enter a code instead')]),
      link('Help, I no longer have access to my Steam Mobile App', 'https://help.steampowered.com/'),
    ]),
  ], 24)], true);

  // The React fiber key Steam's elements carry, so startup.js reads the stand-in as it would Steam's
  const fiberKey = () => {
    for (const node of document.querySelectorAll('body *')) {
      const key = Object.keys(node).find((k) => k.startsWith('__reactFiber$'));
      if (key) return key;
    }
    return '__reactFiber$sePreview';
  };

  const failureScreen = (failure) => {
    const network = failure === FAILURE.network;
    const title = el('div', [K.failureTitle], [network ? 'Connection Problem' : 'Too Many Retries']);
    title[fiberKey()] = { memoizedProps: { failure }, return: null };
    return layout([
      col([K.alignCenter], [
        title,
        el('div', [K.failureDescription], [network
          ? 'There was a problem communicating with Steam. Please try again later.'
          : 'There have been too many sign in failures from your location in a short time period. Please wait and try again later.']),
        ...(network ? [el('div', [K.failureDescription], ['You can try running Steam in Offline Mode.'])] : []),
        el('div', [K.failureButtons], [
          el('button', [K.submitButton, K.tryAgainButton], ['Retry'], { type: 'button' }),
          ...(network ? [el('div', [K.offerOffline], [el('button', [K.offerOfflineButton], ['Enter Offline Mode'], { type: 'button' })])] : []),
        ], { style: 'display: flex; flex-direction: row;' }),
      ], 12),
      ...(network ? [] : [el('div', [K.errorReference], ['Error Code: 84'])]),
    ], false);
  };

  // A plain avatar: a tile with the persona's initial (no network, no account's picture)
  const AVATAR = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#2a475e"/><text x="32" y="42" font-family="sans-serif" font-size="30" font-weight="700" fill="#c7d5e0" text-anchor="middle">P</text></svg>')}`;

  // The status screen; its phase comes from the swapped window.loginStore (see the header)
  const statusScreen = (state) => {
    const persona = state === LOGIN_STATE.server || state === LOGIN_STATE.library;
    return el('div', [K.statusContainer], [
      el('div', [K.throbber, K.throbberBackground, K.statusThrobber], [
        el('div', [K.throbberSpinner], [
          el('img', [K.throbberMedium], [], { alt: 'Steam Spinner', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }),
          el('div', [K.throbberStatus], [
            el('div', [K.statusLine], [{
              [LOGIN_STATE.network]: 'Waiting for network...',
              [LOGIN_STATE.server]: 'Logging in...',
              [LOGIN_STATE.library]: 'Loading user data...',
              [LOGIN_STATE.shutdown]: 'Shutting down...',
            }[state]]),
            el('div', [K.statusProgress], [el('div')]),
            ...(persona ? [el('div', [K.statusUser], [
              el('div', [K.statusAvatar], [el('img', [], [], { src: AVATAR, alt: '' })]),
              el('div', [K.statusPersona], [PERSONA]),
            ])] : []),
          ]),
        ]),
      ]),
    ]);
  };

  // The account chooser: two saved accounts and Add Account
  const chooserScreen = () => {
    const user = (persona, accountName) => el('div', [K.user, K.userExisting], [
      el('div', [K.userIcon], [
        el('img', [], [], { src: AVATAR, alt: '' }),
        el('div', [K.moreMenuButton], [el('div', [K.moreMenuIcon], [el('div')])]),
      ]),
      el('div', [K.userName, K.userPersona], [persona]),
      el('div', [K.userName, K.userAccount], [accountName]),
    ], { role: 'button', tabindex: '0' });
    return el('div', [K.userChooser], [el('div', [K.chooserContent], [
      el('div', [K.chooserLogo]),
      el('div', [K.avatarContainer], [
        el('div', [K.whosPlaying], ["Who's playing?"]),
        el('div', [K.cachedUsers], [
          el('div', [K.userList], [
            user(PERSONA, ACCOUNT),
            user('Second Player', 'secondaccount'),
            el('div', [K.user, K.userNew], [
              el('div', [K.userIcon], [el('div')]),
              el('div', [K.userName, K.userPersona], ['Add Account']),
            ], { role: 'link', tabindex: '0' }),
          ]),
          el('div', [K.chooserToggle], [
            el('div', [], ['Ask which account to use each time Steam starts']),
            el('div', [], [], { role: 'switch', 'aria-checked': 'true', tabindex: '0' }),
          ]),
        ]),
      ]),
    ])]);
  };

  // The sign-in form beside the QR code; `wrong` shows the check-your-password state
  const signInScreen = ({ wrong = false } = {}) => {
    const field = (label, type, highlight) => el('div', [K.textField], [
      el('label', [K.fieldLabel, ...(highlight ? [K.fieldLabelHighlight] : [])], [label]),
      el('input', [K.textInput, ...(wrong ? [K.textInputDanger] : [])], [], { type, value: type === 'password' ? '' : ACCOUNT }),
    ]);
    const qrCanvas = el('canvas', [], [], { width: '120', height: '120' });
    const pen = qrCanvas.getContext('2d');
    if (pen) {
      pen.fillStyle = '#fff';
      pen.fillRect(0, 0, 120, 120);
      pen.fillStyle = '#000';
      for (let i = 0; i < 400; i++) if ((i * 37 + (i >> 3) * 11) % 7 < 3) pen.fillRect((i % 20) * 6, Math.floor(i / 20) * 6, 6, 6);
    }
    return el('section', [K.flexCol, K.embeddedRoot, K.inClient], [
      el('div', [K.logoContainer], [
        el('div', [K.backArrowContainer], [el('div')]),
        document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
      ]),
      el('div', [K.sideBySide, K.embedded], [
        el('form', [K.loginForm], [
          field('Sign in with account name', 'text', true),
          field('Password', 'password', false),
          el('div', [K.checkboxField], [
            el('div', [K.checkbox], [el('div', [K.check], [el('div')])], { role: 'checkbox', 'aria-checked': 'true', tabindex: '0' }),
            el('label', [K.checkboxLabel], ['Remember me']),
          ]),
          el('div', [K.signInButtonContainer], [el('button', [K.submitButton], ['Sign in'], { type: 'submit' })]),
          el('div', [K.formError], [wrong ? 'Please check your password and account name and try again.' : ' ']),
        ]),
        el('div', [K.qrSection], [el('div', [K.qrCodeContainer], [
          el('label', [K.fieldLabel, K.fieldLabelHighlight], ['Or sign in with QR']),
          el('div', [K.qr], [el('div', [], [qrCanvas], { style: 'position: relative;' })]),
          el('div', [K.useMobileAppForQR], ['Use the ', el('a', [], ['Steam Mobile App'], { href: 'https://store.steampowered.com/mobile' }), ' to sign in via QR Code']),
        ])]),
      ]),
      el('div', [K.embeddedRootFooter, K.inClient], [
        el('a', [K.textLink, K.textCenter], ["Help, I can't sign in"], { href: 'https://help.steampowered.com/' }),
        el('div', [K.accountCreation, K.inClient], [
          el('span', [K.accountCreationPrompt], ["Don't have a Steam account?"]),
          el('a', [K.textLink], ['Create a Free Account'], { href: 'https://store.steampowered.com/join' }),
        ]),
      ]),
    ]);
  };

  // [name, build, loginState]: a status screen sets the swapped store's state
  const SCREENS = [
    ['Network', () => statusScreen(LOGIN_STATE.network), LOGIN_STATE.network],
    ['Signing in', () => statusScreen(LOGIN_STATE.server), LOGIN_STATE.server],
    ['Library', () => statusScreen(LOGIN_STATE.library), LOGIN_STATE.library],
    ['Shutting down', () => statusScreen(LOGIN_STATE.shutdown), LOGIN_STATE.shutdown],
    ['Accounts', chooserScreen],
    ['Sign in', () => signInScreen()],
    ['Wrong password', () => signInScreen({ wrong: true })],
    ['Connection problem', () => failureScreen(FAILURE.network)],
    ['Too many retries', () => failureScreen(FAILURE.rateLimit)],
    ['Mobile code', () => codeScreen({ type: 'mobile' })],
    ['Wrong code', () => codeScreen({ type: 'mobile', wrong: true })],
    ['Email code', () => codeScreen({ type: 'email' })],
    ['Backup code', () => codeScreen({ type: 'mobile', backup: true })],
    ['Confirm on phone', confirmScreen],
  ];

  // The real startup window: Steam restarts into it; signing back in may ask for Steam Guard
  const REAL = [
    ['Real: accounts', () => SE.steamCall('User', 'RestartToUserChooser')],
    ['Real: sign in', () => SE.steamCall('User', 'RestartToLoginScreen')],
  ];

  // Steam's window.loginStore, swapped for a stand-in while a status screen shows
  const realLoginStore = { had: Object.prototype.hasOwnProperty.call(window, 'loginStore'), value: window.loginStore };
  const setLoginState = (state) => {
    if (state) window.loginStore = { loginState: state };
    else if (realLoginStore.had) window.loginStore = realLoginStore.value;
    else delete window.loginStore;
  };

  // The stand-in window: transformed, so fixed descendants place themselves in it.
  const shade = el('div', [], [], {
    style: 'position: fixed; inset: 0; z-index: 2147483600; background: rgba(0, 0, 0, .6);',
  });
  const frame = el('div', [], [], {
    style: `position: fixed; left: 50%; top: 50%; z-index: 2147483601; width: ${WINDOW_W}px; height: ${WINDOW_H}px; transform: translate(-50%, -50%); overflow: hidden; border-radius: 8px; box-shadow: 0 24px 64px rgba(0, 0, 0, .6);`,
  });
  const background = el('div', [K.animatedBg], [], { style: 'position: absolute; inset: 0;' });
  const host = el('div', [K.login], [], { style: 'position: absolute; inset: 0;' });
  frame.append(background, host);

  // The switcher, in a closed shadow root so neither Steam's nor the theme's styles reach it
  const bar = document.createElement('div');
  bar.style.cssText = 'all: initial; position: fixed; left: 50%; top: 16px; z-index: 2147483602; transform: translateX(-50%);';
  const barRoot = bar.attachShadow({ mode: 'closed' });
  barRoot.innerHTML = `<style>
    /* The theme's thin dark scrollbar (core/scrollbars.css doesn't reach a shadow root) */
    ::-webkit-scrollbar { width: 10px; height: 10px; background: transparent; }
    ::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
    ::-webkit-scrollbar-button { display: none; }
    ::-webkit-scrollbar-thumb { min-height: 40px; border: 3px solid transparent; border-radius: 999px; background: rgba(255, 255, 255, .18) padding-box; }
    ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, .3) padding-box; }
    div { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; max-width: 760px; padding: 6px; border-radius: 8px; background: #16191e; box-shadow: 0 8px 24px rgba(0, 0, 0, .5); font: 600 12px system-ui, sans-serif; }
    button { padding: 6px 10px; border: 0; border-radius: 6px; background: #252a31; color: #c6ccd4; font: inherit; cursor: pointer; }
    button:hover { background: #313741; color: #fff; }
    button[aria-pressed="true"] { background: #7cc4ff; color: #0b0d10; }
    button[data-real] { background: #3a2a1c; color: #ffb36b; }
    button[data-armed] { background: #5a1f1f; color: #ff9d9d; }
    button:focus-visible { outline: 2px solid #7cc4ff; outline-offset: 2px; }
  </style><div>${SCREENS.map(([name], i) => `<button type="button" data-i="${i}">${name}</button>`).join('')}${REAL.map(([name], i) => `<button type="button" data-real="${i}" title="Restarts Steam into it: click twice">${name}</button>`).join('')}<button type="button" data-close>Close</button></div>`;

  let screen = null;
  const show = (index) => {
    screen?.remove();
    setLoginState(SCREENS[index][2]);
    screen = SCREENS[index][1]();
    host.prepend(screen);
    for (const button of barRoot.querySelectorAll('[data-i]')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.i) === index));
    }
  };

  // A real button restarts Steam: the first click arms it, the second runs it
  const runReal = (button) => {
    if (!button.hasAttribute('data-armed')) {
      barRoot.querySelector('[data-armed]')?.removeAttribute('data-armed');
      button.setAttribute('data-armed', '');
      button.textContent = 'Click again to restart';
      return;
    }
    const [, run] = REAL[Number(button.dataset.real)];
    destroy();
    run();
  };

  const onBarClick = (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-close')) destroy();
    else if (button.dataset.real !== undefined) runReal(button);
    else show(Number(button.dataset.i));
  };
  const onKey = (event) => {
    if (event.key === 'Escape') destroy();
  };
  // The screens' links and buttons are stand-ins: nothing to open or submit.
  const onFrameClick = (event) => {
    if (event.target.closest('a, button, form')) event.preventDefault();
  };
  const onSubmit = (event) => event.preventDefault();

  const destroy = () => {
    barRoot.removeEventListener('click', onBarClick);
    removeEventListener('keydown', onKey, true);
    frame.removeEventListener('click', onFrameClick);
    frame.removeEventListener('submit', onSubmit);
    setLoginState(0);
    shade.remove();
    frame.remove();
    bar.remove();
    delete window.__seStartupPreview;
  };

  barRoot.addEventListener('click', onBarClick);
  addEventListener('keydown', onKey, true);
  frame.addEventListener('click', onFrameClick);
  frame.addEventListener('submit', onSubmit);
  document.body.append(shade, frame, bar);
  show(0);

  window.__seStartupPreview = { destroy };
})();
