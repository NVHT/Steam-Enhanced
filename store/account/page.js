/*
 * Account pages (/account/ and every page its sidebar links to: Store preferences, Family
 * Management, Security & Devices, Language Preferences, Data & Browsing, Notification
 * Settings, Playtests ...). They share one frame: a left column of nav links and a right column
 * of content. Rebuilt as:
 *
 *   - the wallet card of Add funds and Redeem a code: label over the balance
 *   - the Steam ID under the title on every account page (Purchase History too), as a chip
 *     with copy and profile buttons
 *   - the sidebar as a sticky card, each link with an icon
 *   - Account details: each blue header bar and its block as one card (icon chip, title,
 *     sub-blocks as tiles), the wallet balance as the store tile's headline figure, the
 *     delete-account strip as a danger card
 *   - every other page: the content column as one card, Steam's controls in the theme's look
 *     (a sidebar-less settings page, Update Store & Wallet Country, the same)
 *
 * Icons follow the section's English title or Steam's header icon file, then the order; sidebar
 * icons follow the link's path, so every language gets them. Server-rendered nodes move into the
 * theme's cards; destroy() puts every one back where it was.
 */
const ICONS = {
  user: '<circle class="d" cx="12" cy="8" r="4"/><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle class="d" cx="15" cy="7" r="2"/><circle cx="15" cy="7" r="2"/><circle class="d" cx="9" cy="17" r="2"/><circle cx="9" cy="17" r="2"/>',
  family: '<circle class="d" cx="8.5" cy="8" r="3"/><circle cx="8.5" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.5"/><path d="M3 19.5a5.5 5.5 0 0 1 11 0M14.5 15.2a4.5 4.5 0 0 1 6.5 4.3"/>',
  bell: '<path class="d" d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 21h4"/>',
  mail: '<rect class="d" x="3" y="5" width="18" height="14" rx="3"/><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7l8 6 8-6"/>',
  cookie: '<path class="d" d="M20.5 12.5A8.5 8.5 0 1 1 11.5 3.5a3 3 0 0 0 4 3.5 3 3 0 0 0 5 5.5z"/><path d="M20.5 12.5A8.5 8.5 0 1 1 11.5 3.5a3 3 0 0 0 4 3.5 3 3 0 0 0 5 5.5zM8.5 10h.01M14 15h.01M9.5 15.5h.01"/>',
  globe: '<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z"/>',
  shield: '<path class="d" d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6zM9 12l2 2 4-4"/>',
  flask: '<path class="d" d="M6.2 16.5L10 10V3.5h4V10l3.8 6.5c.9 1.6-.2 3.5-2 3.5H8.2c-1.8 0-2.9-1.9-2-3.5z"/><path d="M9 3.5h6M10 3.5V10l-3.8 6.5c-.9 1.6.2 3.5 2 3.5h7.6c1.8 0 2.9-1.9 2-3.5L14 10V3.5M7.5 14.5h9"/>',
  wallet: '<path class="d" d="M4 7h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M4 7h15a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a2 2 0 0 1 2-2h11v3M16 13.5h.01"/>',
  receipt: '<path class="d" d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/>',
  danger: '<path class="d" d="M12 3.5l9 16H3z"/><path d="M12 3.5l9 16H3zM12 10v4M12 17h.01"/>',
  id: '<rect class="d" x="3" y="5" width="18" height="14" rx="3"/><rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="9" cy="11" r="2"/><path d="M6 16a3 3 0 0 1 6 0M15 10h3M15 14h3"/>',
  copy: '<rect class="d" x="9" y="9" width="11" height="11" rx="2.5"/><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M15 9V6.5A2.5 2.5 0 0 0 12.5 4h-6A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 6.5 15H9"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  eye: '<path class="d" d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  hidden: '<path class="d" d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>',
  join: '<path class="d" d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5z"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5M10 17l5-5-5-5M15 12H3"/>',
  create: '<circle class="d" cx="9" cy="8" r="4"/><circle cx="9" cy="8" r="4"/><path d="M2 20.5a7 7 0 0 1 14 0M19 8v6M16 11h6"/>',
  chat: '<path class="d" d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 4v-4A2 2 0 0 1 4 14z"/><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4 4v-4A2 2 0 0 1 4 14zM9 10h.01M12 10h.01M15 10h.01"/>',
  compass: '<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  monitor: '<rect class="d" x="3" y="4.5" width="18" height="12" rx="2"/><rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M9 20h6M12 16.5V20"/>',
  broadcast: '<circle class="d" cx="12" cy="12" r="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M8 8a5.5 5.5 0 0 0 0 8M16 8a5.5 5.5 0 0 1 0 8M5 5a9.5 9.5 0 0 0 0 14M19 5a9.5 9.5 0 0 1 0 14"/>',
  motion: '<path class="d" d="M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16z"/><path d="M3 9h5M2 13h6M4 17h4M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM11 9.5v5l4-2.5z"/>',
  phone: '<rect class="d" x="7" y="3" width="10" height="18" rx="2.5"/><rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 17.5h2"/>',
  dot: '<circle class="d" cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="4"/>',
};

/* Section titles (English) and Steam's header icon files to icons; otherwise the order's icon */
const SECTION_ICON = [
  [/family/i, 'family'],
  [/signed out|authorized device|device/i, 'monitor'],
  [/mature/i, 'eye'],
  [/language/i, 'globe'],
  [/cookie|browsing|data collection/i, 'cookie'],
  [/notification/i, 'bell'],
  [/playtest/i, 'flask'],
  [/ignor/i, 'hidden'],
  [/store content|product type/i, 'sliders'],
  [/community|chat/i, 'chat'],
  [/discovery|queue/i, 'compass'],
  [/platform|operating/i, 'monitor'],
  [/broadcast/i, 'broadcast'],
  [/motion|animat/i, 'motion'],
  [/purchase|store|wallet|history/i, 'wallet'],
  [/contact|e-?mail|phone/i, 'mail'],
  [/family/i, 'family'],
  [/security|guard|privacy/i, 'shield'],
];
const SECTION_ORDER = ['wallet', 'mail', 'family', 'shield'];

/* Sidebar links by path, the same in every language. First match wins:
   "languagepreferences" is a globe before it is a preference. */
const LINK_ICON = [
  [/playtest|beta/i, 'flask'],
  [/notification/i, 'bell'],
  [/email|optout/i, 'mail'],
  [/cookie|browsing|data/i, 'cookie'],
  [/language/i, 'globe'],
  [/family/i, 'family'],
  [/device|security|guard|twofactor|privacy/i, 'shield'],
  [/history|license|purchase/i, 'receipt'],
  [/preference/i, 'sliders'],
  [/^\/account\/?$/i, 'user'],
];

/* Links whose path says nothing (an app page, a help wizard): the English label */
const LINK_TEXT_ICON = [
  [/playtest|beta/i, 'flask'],
  [/security|device/i, 'shield'],
  [/data|browsing|cookie/i, 'cookie'],
  [/notification/i, 'bell'],
];

const STEAM_ID = /\b7656119\d{10}\b/;
const STEAM_ID_BASE = 76561197960265728n; // SteamID64 of account 0 (individual, public universe)
const COPIED_MS = 1600;
const CACHE_KEY = 'se-account-id';

/** An icon as a CSS url(), for a mask where the theme can't put an <svg> (React-owned nodes). */
const iconUrl = (name, color = '#000') =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${(ICONS[name] ?? ICONS.dot).replace(/class="d"/g, `fill="${color}" fill-opacity=".3" stroke="none"`)}</svg>`,
  )}")`;

const svg = (name) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('aria-hidden', 'true');
  node.innerHTML = ICONS[name] ?? ICONS.dot;
  return node;
};

const pick = (table, text) => table.find(([test]) => test.test(text))?.[1];

const pathOf = (link) => {
  try {
    return new URL(link.href, location.href).pathname;
  } catch {
    return '';
  }
};

/** Clipboard API first; the hidden-textarea fallback covers web views that refuse it. */
const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
    field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  }
};

const cache = {
  read() {
    try {
      return JSON.parse(localStorage.getItem(CACHE_KEY)) ?? {};
    } catch {
      return {};
    }
  },
  write(value) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(value));
    } catch {}
  },
};

/*
 * The signed-in Steam ID and the page's word for it. Only Account details prints them
 * (.youraccount_steamid); every other account page has the ID in the store's app config
 * (data-userinfo) or its account-ID global. The label Account details printed is kept, so
 * the chip reads the same in the user's language on every page.
 */
const readSteamId = (idLine) => {
  const cached = cache.read();
  const fromLine = idLine?.textContent.match(STEAM_ID)?.[0];
  if (fromLine) {
    const label = squashLabel(idLine.textContent.replace(fromLine, ''));
    cache.write({ id: fromLine, label });
    return { id: fromLine, label };
  }
  let id = null;
  try {
    id = JSON.parse(document.getElementById('application_config')?.dataset.userinfo ?? 'null')?.steamid ?? null;
  } catch {}
  if (!STEAM_ID.test(id ?? '') && Number(window.g_AccountID) > 0) id = String(STEAM_ID_BASE + BigInt(window.g_AccountID));
  if (!STEAM_ID.test(id ?? '') && STEAM_ID.test(String(window.g_steamID ?? ''))) id = String(window.g_steamID);
  // Steam's newer pages (Notification Settings, Playtests) carry neither: the ID this account's
  // own pages last showed stands in
  if (!STEAM_ID.test(id ?? '') && STEAM_ID.test(cached.id ?? '') && document.getElementById('StoreTemplate')) id = cached.id;
  if (!STEAM_ID.test(id ?? '')) return null; // signed out
  if (cached.id !== id) cache.write({ id, label: null });
  return { id, label: cached.id === id ? cached.label : null };
};

const squashLabel = (text) => text.replace(/\s+/g, ' ').trim().replace(/[:：]$/, '').trim() || null;

const isBlank = (node) => !node.textContent.trim() && !node.querySelector('img, input:not([type="hidden"]), button, select, svg, iframe, canvas');

export default async (dom) => {
  await dom.ready();
  const $ = dom.scope();
  const root = document.documentElement;
  const added = [];
  const add = (node) => (added.push(node), node);
  const moves = [];
  const move = (node, target) => {
    moves.push([node, node.parentNode, node.nextSibling]);
    target.append(node);
  };
  const marks = [];
  const mark = (node, name, value = '') => {
    dom.mark(node, name, value);
    marks.push([node, name]);
  };

  /* ---------- Header: Steam ID chip, on every account page ---------- */

  const makeChip = (account) => {
    const { id: steamId } = account;
    const label = account.label ?? 'Steam ID';
    const copy = dom.el('button', { class: 'se-account-id-btn', type: 'button', 'aria-label': `Copy ${label}`, title: `Copy ${label}` }, svg('copy'));
    let reset = 0;
    $.listen(copy, 'click', async () => {
      if (!(await copyText(steamId)) || !$.alive) return;
      copy.replaceChildren(svg('check'));
      copy.dataset.copied = '';
      clearTimeout(reset);
      reset = setTimeout(() => {
        copy.replaceChildren(svg('copy'));
        delete copy.dataset.copied;
      }, COPIED_MS);
    });
    $.add(() => clearTimeout(reset));

    const profile = dom.el(
      'a',
      { class: 'se-account-id-btn', href: `https://steamcommunity.com/profiles/${steamId}`, 'aria-label': 'Open profile', title: 'Open profile' },
      svg('external'),
    );
    return add(dom.el('div', { class: 'se-account-id', 'data-se-account': 'id' }, [
      svg('id'),
      dom.el('span', { class: 'se-account-id-label', text: label }),
      dom.el('span', { class: 'se-account-id-num', text: steamId }),
      dom.el('span', { class: 'se-account-id-actions' }, [copy, profile]),
    ]));
  };

  const header = document.querySelector('.page_header_ctn .page_content');
  const idLine = header?.querySelector('.youraccount_steamid');
  const account = header && readSteamId(idLine);
  if (account) {
    const chip = makeChip(account);
    const title = header.querySelector('h2.pageheader');
    if (idLine) {
      idLine.after(chip);
      mark(idLine, 'data-se-account-hidden');
    } else if (title) {
      title.after(chip);
    } else {
      header.append(chip);
    }
  }

  /* ---------- Wallet card (Add funds, Redeem a code): label over the balance ---------- */

  // Steam positions the balance row for its floats, which buries the figure under the card's
  // header in the theme's layout. Its two nodes move into the theme's own head instead; they
  // stay Steam's nodes, so the balance still updates live after a code is redeemed.
  for (const balance of document.querySelectorAll('.accountInfoBlock .accountBalance')) {
    const figure = balance.querySelector('.accountData');
    if (!figure) continue;
    const head = add(dom.el('div', { class: 'se-account-balance', 'data-se-account': 'balance' }));
    balance.before(head);
    const label = balance.querySelector('.accountLabel');
    if (label) move(label, head);
    move(figure, head);
    mark(balance, 'data-se-account-hidden');
  }

  // Pages without the sidebar keep their own layout: the chip is all, except a lone settings
  // page (Update Store & Wallet Country: a header bar over a form), which becomes one card
  const nav = document.querySelector('.page_content > .two_column.left');
  const content = nav?.parentElement.querySelector(':scope > .two_column.right');
  if (!nav || !content) {
    const main = document.querySelector('#main_content:has(> .account_header_line)');
    if (main) {
      mark(main, 'data-se-account-layout', 'panel');
      mark(root, 'data-se-account-ready');
    }
  }
  /* ---------- Steam's newer account pages (Notification Settings, Playtests) ----------
   * A different frame (#StoreTemplate), rendered by React after load, with hashed class names.
   * The theme finds its parts by shape: the column of /account links is the sidebar, the
   * element after it the content, the h2 over them the title; inside the content, a short
   * text-only child is a section heading and anything else a section body. It marks them and
   * page.css styles the marks; nothing inside React's tree moves. Sidebar icons ride a CSS
   * variable on each link (a mask in page.css), since React owns the links' children.
   */
  if (!nav && document.getElementById('StoreTemplate')) {
    const MODERN = 'data-se-account-modern';
    const tagged = [];
    const tag = (node, value) => {
      if (!node || node.getAttribute(MODERN) === value) return;
      dom.mark(node, MODERN, value);
      tagged.push(node);
    };
    const here = location.pathname.replace(/\/+$/, '');
    let chip = null;

    const scan = () => {
      const panel = [...document.querySelectorAll('#StoreTemplate a[href*="/account"]')]
        .map((link) => link.parentElement)
        .find((parent) => parent && parent.querySelectorAll(':scope > a[href*="/account"]').length >= 4);
      const body = panel?.nextElementSibling;
      if (!panel || !body) return;
      const frame = panel.parentElement;
      tag(frame, 'frame');
      tag(panel, 'nav');
      tag(body, 'content');

      for (const link of panel.querySelectorAll(':scope > a')) {
        tag(link, pathOf(link).replace(/\/+$/, '') === here ? 'link-active' : 'link');
        if (!link.style.getPropertyValue('--se-account-icon')) {
          link.style.setProperty('--se-account-icon', iconUrl(pick(LINK_ICON, pathOf(link)) ?? pick(LINK_TEXT_ICON, link.textContent) ?? 'dot'));
        }
      }

      const title = frame.parentElement?.previousElementSibling?.querySelector('h2');
      if (title) {
        tag(title.parentElement, 'header');
        tag(title, 'title');
        tag(title.previousElementSibling, 'crumbs');
        const account = readSteamId(null);
        if (account && !chip) {
          chip = makeChip(account);
          title.after(chip);
        }
      }

      // Section bodies share a class (hashed, so learned here): the class most common among the
      // children that hold elements. A text-only child without it is a heading; with it, a
      // body that happens to hold only text ("You have not joined any Steam Playtests").
      const sections = [...body.children].filter((child) => !child.hasAttribute(dom.OWN));
      const counts = new Map();
      for (const child of sections.filter((child) => child.firstElementChild)) {
        for (const name of child.classList) counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      const shared = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
      for (const child of sections) {
        const heading = !child.firstElementChild && !(shared && child.classList.contains(shared));
        tag(child, heading ? 'heading' : 'block');
      }
      dom.mark(root, 'data-se-account-ready');
    };

    scan();
    $.observe(scan);
    return () => {
      $.destroy();
      for (const node of tagged) {
        dom.unmark(node, MODERN);
        node.style?.removeProperty('--se-account-icon');
      }
      for (const node of added.reverse()) node.remove();
      dom.unmark(root, 'data-se-account-ready');
    };
  }

  const restore = () => {
    for (const [node, name] of marks.reverse()) dom.unmark(node, name);
    while (moves.length) {
      const [node, parent, next] = moves.pop();
      parent.insertBefore(node, next?.parentNode === parent ? next : null);
    }
    for (const node of added.reverse()) node.remove();
  };
  if (!nav || !content) return () => {
    $.destroy();
    restore();
  };

  /* ---------- Sidebar: an icon per link ---------- */

  mark(nav, 'role', 'navigation');
  const links = [...nav.querySelectorAll(':scope > a.nav_item')];
  for (const link of links) {
    link.prepend(add(dom.el('span', { class: 'se-account-nav-icon' }, svg(pick(LINK_ICON, pathOf(link)) ?? pick(LINK_TEXT_ICON, link.textContent) ?? 'dot'))));
    mark(link, 'data-se-account-nav');
    if (link.classList.contains('active')) mark(link, 'aria-current', 'page');
  }

  /* ---------- Content ---------- */

  const sections = content.querySelectorAll(':scope > .account_header_line').length;
  mark(content, 'data-se-account-layout', sections ? 'cards' : 'panel');

  // React sections (Family Management, Security & Devices, Data & Browsing) arrive after load
  // and React owns them: no <svg> goes in. Each header bar and each big dialog button gets its
  // icon as a CSS variable instead, drawn by page.css as a chip; Steam's own glyph steps aside.
  // Drawn as one pseudo-element (Steam's dialog buttons keep ::before for themselves): the chip
  // is its background colour, the icon a background image already in the theme's colour.
  const ICON_VAR = '--se-account-icon';
  const iconColor = getComputedStyle(root).getPropertyValue('--se-text-dim').trim() || '#b8c0c8';
  const decorated = new Set();
  const decorate = (node, icon) => {
    if (!icon || node.style.getPropertyValue(ICON_VAR)) return;
    node.style.setProperty(ICON_VAR, iconUrl(icon, iconColor));
    decorated.add(node);
  };
  const BUTTON_ICON = [
    [/join/i, 'join'],
    [/create/i, 'create'],
  ];
  const decorateReact = () => {
    for (const bar of content.querySelectorAll('.account_header_line')) {
      if (bar.closest('.se-account-card')) continue;
      const title = dom.squash(bar.textContent);
      decorate(bar, pick(SECTION_ICON, title) ?? 'dot');
    }
    // Only the big choice buttons (they carry Steam's glyph); a form's "Create" stays a button
    for (const button of content.querySelectorAll('.DialogButton:not(.Small):has(svg)')) {
      decorate(button, pick(BUTTON_ICON, dom.squash(button.textContent)));
    }
  };
  // Steam paints parts of these React sections in its own blues and greys (Steam Guard's
  // authenticator panel, its link buttons) under hashed classes. Any box whose background is
  // none of the theme's colours gets a tone mark, read by shape: small, narrow beside its row,
  // short-texted and clickable, a button; anything else, a tile. page.css repaints both.
  const TONE = 'data-se-account-tone';
  const toned = new Set();
  const themeColors = (() => {
    const probe = dom.el('div', { 'aria-hidden': 'true' });
    probe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden';
    document.body.append(probe);
    const colors = new Set(['rgba(0, 0, 0, 0)', 'transparent']);
    for (const token of ['--se-bg', '--se-surface', '--se-surface-2', '--se-pill', '--se-field', '--se-hover', '--se-accent', '--se-accent-hover', '--se-accent-surface']) {
      probe.style.backgroundColor = `var(${token})`;
      colors.add(getComputedStyle(probe).backgroundColor);
    }
    probe.remove();
    return colors;
  })();
  const SKIP = '[data-se-own], .account_header_line, .DialogButton, [class*="DialogToggle"], .ActiveTab, input, textarea, select, img, svg';
  const toneReact = () => {
    // Measured against the content column, not the box's parent: Steam wraps buttons in
    // wrappers exactly their size
    const section = content.getBoundingClientRect().width || Infinity;
    for (const box of content.querySelectorAll('div, a, span')) {
      if (box.hasAttribute(TONE) || box.closest('.se-account-card') || box.matches(SKIP) || box.closest('.DialogButton, [class*="DialogToggle"]')) continue;
      const style = getComputedStyle(box);
      if (themeColors.has(style.backgroundColor) || style.backgroundImage !== 'none') continue;
      const { height, width } = box.getBoundingClientRect();
      if (!height) continue;
      const text = dom.squash(box.textContent);
      // An empty box is decoration (the hairline between Security's two columns): leave it
      if (!text && !box.firstElementChild) continue;
      // A box that only holds a dialog button is its holder ("Sign out everywhere"): the button
      // carries the look
      if (box.children.length === 1 && box.firstElementChild.matches('.DialogButton')) continue;
      // A button is short, under half the column wide (a full-width bar of the same height is
      // a header) and clickable-looking
      const button = height <= 52 && width < section * 0.5 && text.length > 0 && text.length <= 60
        && !box.querySelector('div div') && (box.matches('a, [role="button"], .Focusable') || style.cursor === 'pointer');
      dom.mark(box, TONE, button ? 'button' : 'tile');
      toned.add(box);
    }
  };

  // Steam's picture icons in these sections (the green Steam Guard shield, a device's phone or
  // PC) → the theme's icon chips, chosen by the words around them. React owns the images, so
  // they stay and take the chip as their look (page.css): an <img> swaps its content, an <svg>
  // hides its paths over a background.
  const GLYPH = 'data-se-account-glyph';
  const GLYPH_ICON = [
    [/authenticator|steam guard/i, 'shield'],
    [/mobile|phone|android|iphone|ipad|sm-[a-z0-9]/i, 'phone'],
    [/browser|web|chrome|firefox|safari|edge/i, 'globe'],
    [/pc|client|windows|mac|linux|steam deck|desktop/i, 'monitor'],
  ];
  const glyphed = new Set();
  const badgeColor = getComputedStyle(root).getPropertyValue('--se-on-accent').trim() || '#071423';
  const glyphReact = () => {
    for (const icon of content.querySelectorAll('img, svg')) {
      if (icon.hasAttribute(GLYPH) || icon.closest('[data-se-own], .DialogButton, a, .account_header_line, .se-account-card')) continue;
      if (icon.parentElement?.closest('svg')) continue;
      // An icon inside a button ("Sign out everywhere") is the button's own: a short label next
      // to it says so. A device row is clickable too, but its text runs long.
      const holder = icon.closest('button, [role="button"], .Focusable');
      if (holder && dom.squash(holder.textContent).length < 40) continue;
      const { width, height } = icon.getBoundingClientRect();
      if (width < 24 || height < 24) continue;
      const row = icon.closest('.Panel, [data-se-account-tone]') ?? icon.parentElement?.parentElement ?? icon.parentElement;
      const name = pick(GLYPH_ICON, dom.squash(row?.textContent)) ?? 'monitor';
      icon.style.setProperty(ICON_VAR, iconUrl(name, iconColor));
      dom.mark(icon, GLYPH, icon.tagName.toLowerCase() === 'img' ? 'img' : 'svg');
      glyphed.add(icon);

      // Steam's small status picture laid over the device icon (the green "Steam Guard on"
      // shield): the theme's shield badge on the chip's corner
      for (const badge of icon.parentElement?.querySelectorAll(':scope > img:not([data-se-account-glyph])') ?? []) {
        badge.style.setProperty(ICON_VAR, iconUrl('shield', badgeColor));
        dom.mark(badge, GLYPH, 'badge');
        glyphed.add(badge);
      }
    }
  };

  if (!sections) {
    decorateReact();
    toneReact();
    glyphReact();
    $.observe(() => {
      decorateReact();
      toneReact();
      glyphReact();
    }, { filter: (record) => content.contains(record.target) });
    $.add(() => {
      for (const node of toned) node.removeAttribute(TONE);
      for (const node of glyphed) {
        node.removeAttribute(GLYPH);
        node.style.removeProperty(ICON_VAR);
      }
    });
    $.add(() => {
      for (const node of decorated) node.style.removeProperty(ICON_VAR);
    });
  }

  if (sections) {
    // Header bar + the block(s) under it → one card. Account details puts .account_setting_block
    // under each bar, Store preferences .account_settings_container, and wraps one of its
    // sections (bar and container) in a plain <div>; that wrapper's parts move into the card
    // too, and the empty wrapper drops out.
    let titled = 0;
    let card = null;
    const open = (header) => {
      const title = dom.squash(header.textContent);
      const file = header.querySelector('img')?.getAttribute('src') ?? '';
      const icon = pick(SECTION_ICON, title) ?? pick(SECTION_ICON, file) ?? SECTION_ORDER[titled] ?? 'dot';
      titled++;
      card = add(dom.el('section', { class: 'se-account-card', 'data-se-account': 'card' }));
      content.insertBefore(card, header.parentElement === content ? header : header.parentElement);
      (header.firstElementChild ?? header).prepend(add(dom.el('span', { class: 'se-account-chip' }, svg(icon))));
      move(header, card);
    };
    const BODY = '.account_setting_block, .account_settings_container';
    for (const node of [...content.children]) {
      if (node.matches('.account_header_line')) {
        open(node);
      } else if (node.matches('div:not([class])') && node.querySelector(':scope > .account_header_line')) {
        for (const part of [...node.children]) {
          if (part.matches('.account_header_line')) open(part);
          else if (card && part.matches(BODY)) move(part, card);
        }
        if (!node.children.length) mark(node, 'data-se-account-hidden');
      } else if (node.matches('.account_setting_block_short')) {
        // Headerless: Steam's own delete-account strip, or any other loose block
        const danger = Boolean(node.querySelector('.delete_link'));
        const solo = add(dom.el('section', { class: 'se-account-card', 'data-se-account': 'card', 'data-tone': danger ? 'danger' : null }));
        if (danger) solo.append(dom.el('span', { class: 'se-account-chip' }, svg('danger')));
        content.insertBefore(solo, node);
        move(node, solo);
        card = null;
      } else if (card && node.matches(BODY)) {
        move(node, card);
      } else if (!node.matches('a') && isBlank(node)) {
        // Spacers and clearers; named anchors stay, as scroll targets
        mark(node, 'data-se-account-hidden');
      }
    }
  }

  const texts = []; // text nodes the theme rewrote, with their original text

  // Sub-blocks: blank ones and float clearers drop out
  for (const block of content.querySelectorAll('.account_setting_block, .account_setting_block_short')) {
    for (const child of block.children) {
      if (isBlank(child)) mark(child, 'data-se-account-hidden');
    }
  }
  // The balance as the tile's own headline: Steam's row is positioned for its float layout
  // (account.css) and lands above the tile in a flex column, so the theme draws its own.
  const balance = content.querySelector('.account_setting_sub_block > .accountBalance');
  const amount = balance?.querySelector('.accountData a, .accountData');
  if (balance && amount) {
    const wallet = balance.parentElement;
    const label = dom.squash(balance.querySelector('.accountLabel')?.textContent);
    const figure = amount.matches('a')
      ? dom.el('a', { class: 'se-account-balance-amount', href: amount.href, text: dom.squash(amount.textContent) })
      : dom.el('span', { class: 'se-account-balance-amount', text: dom.squash(amount.textContent) });
    wallet.prepend(add(dom.el('div', { class: 'se-account-balance', 'data-se-account': 'balance' }, [
      label ? dom.el('span', { class: 'se-account-balance-label', text: label }) : null,
      figure,
    ])));
    mark(wallet, 'data-se-account-wallet');
    mark(balance, 'data-se-account-hidden');
  }

  // Saved cards: Steam's "|" cell between Edit and Delete; the pill buttons part them now
  for (const cell of content.querySelectorAll('.payment_method_box td')) {
    if (!cell.querySelector('a, button, input') && /^[|｜·•]?$/.test(dom.squash(cell.textContent))) mark(cell, 'data-se-account-hidden');
  }
  for (const cell of content.querySelectorAll('.payment_method_box td:has(> a)')) {
    for (const node of cell.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && /^[\s|｜·•]+$/.test(node.textContent) && node.textContent.trim()) {
        texts.push([node, node.textContent]);
        node.textContent = '';
      }
    }
  }

  // Steam's inline phone image ("Phone: [img] Ends in 33") gives way to the theme's glyph:
  // matched by the image file, else by the line it sits in (English)
  for (const img of content.querySelectorAll('.account_setting_sub_block img')) {
    const line = img.parentElement;
    if (!/phone|mobile|sms/i.test(img.getAttribute('src') ?? '') && !/phone/i.test(line?.textContent ?? '')) continue;
    const glyph = add(svg('phone'));
    glyph.classList.add('se-account-inline-icon');
    img.before(glyph);
    mark(img, 'data-se-account-hidden');
  }

  // Steam leads its loose lines with "- " as a bullet; the cards don't need it
  for (const line of content.querySelectorAll('.account_setting_sub_block_long > div')) {
    const text = [...line.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!text || !/^\s*[-–—]\s+/.test(text.textContent)) continue;
    texts.push([text, text.textContent]);
    text.textContent = text.textContent.replace(/^\s*[-–—]\s+/, '');
  }

  mark(root, 'data-se-account-ready');

  return () => {
    $.destroy();
    for (const [node, text] of texts) node.textContent = text;
    restore();
  };
};
