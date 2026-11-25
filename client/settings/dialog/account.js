/*
 * Steam Settings › Account as a profile banner (styles: client/settings/pages.css, "Account").
 *
 * Steam's header row (picture, name, status, View Profile) becomes the banner: the theme's
 * friend art behind it (SE.dialogArt.friend: your profile background, else your picture
 * blurred) and a wallet button beside View Profile that runs Steam's own Add Funds. It shows the
 * balance from Add Funds' line; Steam writes that line only when there's money (no amount, no
 * currency otherwise), so an empty wallet shows zero in the Store country's currency. The friend
 * code gets a copy button (SE.copyButton) beside Add Friends. The email row is marked so CSS
 * blurs the address until hovered, and Add Funds without a balance so its empty line goes.
 *
 * The page is found by its route (the content's id ends "/settings/account_Content"), the same
 * in every language. Steam's nodes stay mounted and React keeps owning them; the theme only adds
 * the art and its two buttons and sets attributes.
 */
((SE) => {
  window.__seSettingsAccount?.destroy();
  const ns = window.__seSettingsParts;
  if (!ns) return;

  const PAGE = '[id$="/settings/account_Content"]';
  const BANNER = 'data-se-acct-banner';
  const PRIVATE = 'data-se-private';
  const EMPTY = 'data-se-acct-empty';

  // Your account id, from the friends app of whichever window has it
  const selfId = () => {
    for (const owner of SE.owners()) {
      const id = SE.run(() => owner.g_FriendsUIApp?.FriendStore?.self?.accountid);
      if (id) return id;
    }
    return 0;
  };

  /*
   * Steam prices each Store country in one currency; a country with none of its own pays in USD.
   * The wallet's currency is the country's, so zero is written in it (Intl formats the symbol and
   * the decimals: none for JPY, VND, KRW…).
   */
  const EUR = 'AT BE CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SI SK AD MC SM VA ME XK';
  const CURRENCY = {
    GB: 'GBP', RU: 'RUB', BR: 'BRL', JP: 'JPY', NO: 'NOK', ID: 'IDR', MY: 'MYR', PH: 'PHP',
    SG: 'SGD', TH: 'THB', VN: 'VND', KR: 'KRW', UA: 'UAH', MX: 'MXN', CA: 'CAD', AU: 'AUD',
    NZ: 'NZD', PL: 'PLN', CH: 'CHF', LI: 'CHF', CN: 'CNY', IN: 'INR', CL: 'CLP', PE: 'PEN',
    CO: 'COP', ZA: 'ZAR', HK: 'HKD', TW: 'TWD', SA: 'SAR', AE: 'AED', IL: 'ILS', KZ: 'KZT',
    KW: 'KWD', QA: 'QAR', CR: 'CRC', UY: 'UYU',
  };
  for (const country of EUR.split(' ')) CURRENCY[country] = 'EUR';

  const zero = () => {
    const country = (new URLSearchParams(location.search).get('COUNTRY') || '').toUpperCase();
    try {
      return new Intl.NumberFormat(navigator.language, { style: 'currency', currency: CURRENCY[country] || 'USD' }).format(0);
    } catch {
      return '0'; // a currency this engine can't format
    }
  };

  // Steam's Add Funds: the first of its three buttons
  const FUNDS = '.FatButtonRow > .FatButton:first-child';

  const wallets = new Map(); // wallet button → its text
  const tips = SE.nativeTips({ direction: 'top' });

  const createView = (field) => {
    const nodes = [];
    const avatar = field.querySelector('img.avatar')?.src || '';
    const art = SE.run(() => SE.dialogArt.friend(field, selfId(), avatar));
    if (art) {
      art.classList.add('se-acct-art');
      nodes.push(art);
    }
    // The wallet: its balance, and a click runs Steam's own Add Funds
    const wallet = SE.el('button', 'se-acct-wallet');
    wallet.type = 'button';
    wallet.setAttribute('aria-label', 'Add funds');
    const amount = SE.el('span');
    wallet.append(amount);
    wallet.addEventListener('click', () => field.closest(PAGE)?.querySelector(FUNDS)?.click());
    field.querySelector(':scope > .FieldRightColumn')?.prepend(wallet);
    nodes.push(wallet);
    wallets.set(wallet, amount);
    const bucket = [];
    tips.tip(wallet, 'Add funds', { bucket });
    SE.attr(field, BANNER, '');
    // View Profile: the page's one primary action (the theme's primary button, controls.css)
    const view = field.querySelector('button.DialogButton');
    SE.attr(view, 'data-se-primary', '');
    sync();
    return {
      destroy() {
        tips.drop(bucket);
        wallets.delete(wallet);
        for (const node of nodes) node?.remove();
        SE.unmark(field, BANNER);
        SE.unmark(view, 'data-se-primary');
      },
    };
  };

  // The wallet's balance, the friend code's copy button and the email mark, kept in step with
  // Steam's rows
  function sync() {
    const page = document.querySelector(PAGE);
    if (!page) return;
    // Add Funds' Details is a non-breaking space until there's a balance
    const funds = page.querySelector(FUNDS);
    const details = funds?.querySelector('.Details');
    const line = (details?.textContent || '').trim();
    SE.attr(funds, EMPTY, line ? null : '');
    // The balance is the line's highlighted span ("Wallet balance: <span>$12.40</span>")
    const balance = line ? (details.querySelector('span')?.textContent || '').trim() || line : zero();
    for (const amount of wallets.values()) {
      if (amount.textContent !== balance) amount.textContent = balance;
    }
    const self = String(selfId() || '');
    for (const field of page.querySelectorAll('.Field')) {
      const value = (field.querySelector('.EntryValue')?.textContent || '').trim();
      SE.attr(field, PRIVATE, value.includes('@') ? '' : null);
      // The friend code is your account id
      const right = field.querySelector(':scope > .FieldRightColumn');
      if (self && value === self && right && !right.querySelector('.se-acct-copy')) {
        const copy = SE.copyButton({ text: () => value, label: 'Copy friend code' });
        copy.classList.add('se-acct-copy');
        right.prepend(copy);
      }
    }
  }

  const mounted = SE.mount(
    'Settings account',
    () => [...document.querySelectorAll(`${PAGE} .Field:has(.AvatarAndLabel)`)],
    createView,
    // Before the page's first paint, so Steam's plain header never shows
    { sync: true, scope: PAGE, ignore: SE.inside('.se-acct-art, .se-acct-wallet, .se-acct-copy') }
  );
  const watcher = SE.watch(sync, { scope: PAGE, characterData: true, ignore: SE.inside('.se-acct-wallet, .se-acct-copy') });

  window.__seSettingsAccount = {
    destroy() {
      mounted.destroy();
      watcher.disconnect();
      tips.destroy();
      for (const copy of document.querySelectorAll('.se-acct-copy')) copy.remove();
      for (const node of document.querySelectorAll(`[${PRIVATE}], [${EMPTY}]`)) {
        SE.unmark(node, PRIVATE);
        SE.unmark(node, EMPTY);
      }
      delete window.__seSettingsAccount;
    },
  };
})(window.__se);
