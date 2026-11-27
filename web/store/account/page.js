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
(() => {
  'use strict';
  const web = window.__seWeb;

  /*
   * Icons are core's masks (core/icons-*.css): the tables below name them (`--se-icon-<name>`).
   * Each drawn element carries its mask as --se-account-icon, set inline, so the same rule draws
   * a theme node and a React-owned one (page.css, react.css, newer.css).
   */
  const ICON_VAR = '--se-account-icon';

  /* Section titles (English) and Steam's header icon files to icons; otherwise the order's icon */
  const SECTION_ICON = [
    [/family/i, 'family'],
    [/signed out|authorized device|device/i, 'display'],
    [/mature/i, 'eye'],
    [/language/i, 'globe'],
    [/cookie|browsing|data collection/i, 'cookie'],
    [/notification/i, 'bell'],
    [/playtest/i, 'flask'],
    [/ignor/i, 'eye-off'],
    [/store content|product type/i, 'sliders'],
    [/community|chat/i, 'bubble'],
    [/discovery|queue/i, 'compass'],
    [/platform|operating/i, 'display'],
    [/broadcast/i, 'broadcast'],
    [/motion|animat/i, 'motion'],
    [/purchase|store|wallet|history/i, 'wallet'],
    [/contact|e-?mail|phone/i, 'mail'],
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

  const iconVar = (name) => `var(--se-icon-${name})`;

  /** Give a node its icon: the mask its CSS draws in currentColor. */
  const setIcon = (node, name) => node.style.setProperty(ICON_VAR, iconVar(name));

  /** A theme icon (web/store/shared/account.css); its holder sets the size and tone. */
  const icon = (name, className = 'se-account-icon') => {
    const node = web.dom.el('span', { class: className, 'aria-hidden': 'true' });
    setIcon(node, name);
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

  /** The Steam ID (and its label) an account page last showed, for the pages that carry neither. */
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
      } catch { /* storage refused (full or blocked): kept in memory only */ }
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
    } catch { /* a stored value that won't parse: the default stands */ }
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

  web.define(async (dom) => {
    await dom.ready();
    const $ = dom.scope();
    const root = document.documentElement;
    const { mark, move, owned: add } = $;

    /* ---------- Header: Steam ID chip, on every account page ---------- */

    const makeChip = (account) => {
      const { id: steamId } = account;
      const label = account.label ?? 'Steam ID';
      const copyIcon = icon('copy');
      const copy = dom.el('button', { class: 'se-account-id-btn', type: 'button', 'aria-label': `Copy ${label}`, title: `Copy ${label}` }, copyIcon);
      let reset = 0;
      $.listen(copy, 'click', async () => {
        if (!(await dom.copy(steamId)) || !$.alive) return;
        setIcon(copyIcon, 'check');
        copy.dataset.copied = '';
        clearTimeout(reset);
        reset = setTimeout(() => {
          setIcon(copyIcon, 'copy');
          delete copy.dataset.copied;
        }, COPIED_MS);
      });
      $.add(() => clearTimeout(reset));

      const profile = dom.el(
        'a',
        { class: 'se-account-id-btn', href: `https://steamcommunity.com/profiles/${steamId}`, 'aria-label': 'Open profile', title: 'Open profile' },
        icon('external'),
      );
      return add(dom.el('div', { class: 'se-account-id', 'data-se-account': 'id' }, [
        icon('id-card'),
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
     * newer.css styles the marks; nothing inside React's tree moves. Sidebar icons ride a CSS
     * variable on each link (a mask in newer.css), since React owns the links' children.
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
      const template = document.getElementById('StoreTemplate');
      let chip = null;
      let panel = null;

      const scan = () => {
        // The sidebar found once is kept while React leaves it in place
        if (!panel?.isConnected) {
          panel = [...template.querySelectorAll('a[href*="/account"]')]
            .map((link) => link.parentElement)
            .find((parent) => parent && parent.querySelectorAll(':scope > a[href*="/account"]').length >= 4) ?? null;
        }
        const body = panel?.nextElementSibling;
        if (!panel || !body) return;
        const frame = panel.parentElement;
        tag(frame, 'frame');
        tag(panel, 'nav');
        tag(body, 'content');

        for (const link of panel.querySelectorAll(':scope > a')) {
          tag(link, pathOf(link).replace(/\/+$/, '') === here ? 'link-active' : 'link');
          if (!link.style.getPropertyValue(ICON_VAR)) setIcon(link, pick(LINK_ICON, pathOf(link)) ?? pick(LINK_TEXT_ICON, link.textContent) ?? 'dot');
        }

        const title = frame.parentElement?.previousElementSibling?.querySelector('h2');
        if (title) {
          tag(title.parentElement, 'header');
          tag(title, 'title');
          tag(title.previousElementSibling, 'crumbs');
          const account = readSteamId(null);
          // A React re-render can drop the chip with the header: a new one goes after the title
          if (account && !chip?.isConnected) {
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
      $.observe(scan, { filter: (record) => template.contains(record.target) });
      return () => {
        $.destroy();
        for (const node of tagged) {
          dom.unmark(node, MODERN);
          node.style?.removeProperty(ICON_VAR);
        }
        dom.unmark(root, 'data-se-account-ready');
      };
    }

    if (!nav || !content) return () => $.destroy();

    /* ---------- Sidebar: an icon per link ---------- */

    mark(nav, 'role', 'navigation');
    const links = [...nav.querySelectorAll(':scope > a.nav_item')];
    for (const link of links) {
      link.prepend(add(dom.el('span', { class: 'se-account-nav-icon' }, icon(pick(LINK_ICON, pathOf(link)) ?? pick(LINK_TEXT_ICON, link.textContent) ?? 'dot'))));
      mark(link, 'data-se-account-nav');
      if (link.classList.contains('active')) mark(link, 'aria-current', 'page');
    }

    /* ---------- Content ---------- */

    const sections = content.querySelectorAll(':scope > .account_header_line').length;
    mark(content, 'data-se-account-layout', sections ? 'cards' : 'panel');

    // React sections (Family Management, Security & Devices, Data & Browsing) arrive after load
    // and React owns them: nothing goes in. Each header bar and each big dialog button gets its
    // icon as a CSS variable instead, drawn by react.css as a chip (its two pseudo-elements: the
    // chip and the icon's mask); Steam's own glyph steps aside.
    const decorated = new Set();
    const decorate = (node, name) => {
      if (!name || node.style.getPropertyValue(ICON_VAR)) return;
      setIcon(node, name);
      decorated.add(node);
    };
    const BUTTON_ICON = [
      [/join/i, 'join'],
      [/create/i, 'invite'],
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
    // short-texted and clickable, a button; anything else, a tile. react.css repaints both.
    // A box is read once: one settled (toned, or in a theme colour) is never read again; an
    // unsized or empty one waits for the next change around it.
    const TONE = 'data-se-account-tone';
    const toned = new Set();
    const settled = new WeakSet();
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
    // Measured against the content column, not the box's parent: Steam wraps buttons in wrappers
    // exactly their size. Its width is kept from the ResizeObserver below.
    let section = Infinity;
    const toneBox = (box) => {
      if (settled.has(box) || box.hasAttribute(TONE) || box.closest('.se-account-card') || box.matches(SKIP) || box.closest('.DialogButton, [class*="DialogToggle"]')) return;
      const style = getComputedStyle(box);
      if (themeColors.has(style.backgroundColor) || style.backgroundImage !== 'none') {
        settled.add(box);
        return;
      }
      const { height, width } = box.getBoundingClientRect();
      if (!height) return;
      const text = dom.squash(box.textContent);
      // An empty box is decoration (the hairline between Security's two columns): leave it
      if (!text && !box.firstElementChild) return;
      // A box that only holds a dialog button is its holder ("Sign out everywhere"): the button
      // carries the look
      if (box.children.length === 1 && box.firstElementChild.matches('.DialogButton')) {
        settled.add(box);
        return;
      }
      // A button is short, under half the column wide (a full-width bar of the same height is
      // a header) and clickable-looking
      const button = height <= 52 && width < section * 0.5 && text.length > 0 && text.length <= 60
        && !box.querySelector('div div') && (box.matches('a, [role="button"], .Focusable') || style.cursor === 'pointer');
      dom.mark(box, TONE, button ? 'button' : 'tile');
      toned.add(box);
    };
    /** Each subtree's boxes, the subtree's root among them. */
    const boxesIn = (roots, selector) => {
      const found = new Set();
      for (const node of roots) {
        if (!node.isConnected || !content.contains(node)) continue;
        if (node.matches(selector)) found.add(node);
        for (const box of node.querySelectorAll(selector)) found.add(box);
      }
      return found;
    };
    const toneReact = (roots) => {
      for (const box of boxesIn(roots, 'div, a, span')) toneBox(box);
    };

    // Steam's picture icons in these sections (the green Steam Guard shield, a device's phone or
    // PC) → the theme's icon chips, chosen by the words around them. Each picture stays (hidden)
    // and the theme's chip goes right before it (react.css), recording what it stands in for: an
    // <img> or an <svg> (their places in Steam's rows differ), or a status badge. A chip whose
    // picture React replaced or moved goes, and the next pass makes a new one.
    const GLYPH = 'data-se-account-glyph';
    const GLYPH_ICON = [
      [/authenticator|steam guard/i, 'shield'],
      [/mobile|phone|android|iphone|ipad|sm-[a-z0-9]/i, 'mobile'],
      [/browser|web|chrome|firefox|safari|edge/i, 'globe'],
      [/pc|client|windows|mac|linux|steam deck|desktop/i, 'display'],
    ];
    const glyphs = new Map(); // Steam's picture → the theme's chip before it
    const standIn = (picture, name, kind) => {
      const chip = icon(name, 'se-account-glyph');
      chip.setAttribute(GLYPH, kind);
      picture.before(chip);
      dom.mark(picture, 'data-se-account-hidden');
      glyphs.set(picture, chip);
    };
    const dropGlyph = (picture, chip) => {
      chip.remove();
      dom.unmark(picture, 'data-se-account-hidden');
      glyphs.delete(picture);
    };
    const smallPictures = new WeakSet(); // measured under a chip's size: never read again
    const glyphReact = (roots) => {
      for (const [picture, chip] of glyphs) {
        if (!picture.isConnected || chip.nextElementSibling !== picture) dropGlyph(picture, chip);
      }
      for (const picture of boxesIn(roots, 'img, svg')) {
        if (glyphs.has(picture) || smallPictures.has(picture) || picture.closest('[data-se-own], .DialogButton, a, .account_header_line, .se-account-card')) continue;
        if (picture.parentElement?.closest('svg')) continue;
        // An icon inside a button ("Sign out everywhere") is the button's own: a short label next
        // to it says so. A device row is clickable too, but its text runs long.
        const holder = picture.closest('button, [role="button"], .Focusable');
        if (holder && dom.squash(holder.textContent).length < 40) continue;
        const { width, height } = picture.getBoundingClientRect();
        if (!width || !height) continue; // not laid out yet
        if (width < 24 || height < 24) {
          smallPictures.add(picture);
          continue;
        }
        const row = picture.closest('.Panel, [data-se-account-tone]') ?? picture.parentElement?.parentElement ?? picture.parentElement;
        const name = pick(GLYPH_ICON, dom.squash(row?.textContent)) ?? 'display';
        standIn(picture, name, picture.tagName.toLowerCase() === 'img' ? 'img' : 'svg');

        // Steam's small status picture laid over the device icon (the green "Steam Guard on"
        // shield): the theme's shield badge on the chip's corner
        for (const badge of picture.parentElement?.querySelectorAll(':scope > img') ?? []) {
          if (badge !== picture && !glyphs.has(badge)) standIn(badge, 'shield', 'badge');
        }
      }
    };

    if (!sections) {
      // The observer only gathers what changed; the reads run in the frame after, over those
      // subtrees alone, with the column's width from the ResizeObserver
      section = content.getBoundingClientRect().width || Infinity;
      const changed = new Set();
      const measure = dom.perFrame(() => {
        const roots = [...changed];
        changed.clear();
        toneReact(roots);
        glyphReact(roots);
      });
      $.add(measure.cancel);
      const resize = new ResizeObserver(([entry]) => {
        section = entry.borderBoxSize?.[0]?.inlineSize || entry.contentRect.width || Infinity;
      });
      resize.observe(content);
      $.add(() => resize.disconnect());

      decorateReact();
      toneReact([content]);
      glyphReact([content]);
      $.observe((records) => {
        decorateReact();
        for (const record of records) changed.add(record.target);
        measure();
      }, { filter: (record) => content.contains(record.target) });
      $.add(() => {
        for (const node of toned) node.removeAttribute(TONE);
        for (const [picture, chip] of glyphs) dropGlyph(picture, chip);
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
        const name = pick(SECTION_ICON, title) ?? pick(SECTION_ICON, file) ?? SECTION_ORDER[titled] ?? 'dot';
        titled++;
        card = add(dom.el('section', { class: 'se-account-card', 'data-se-account': 'card' }));
        content.insertBefore(card, header.parentElement === content ? header : header.parentElement);
        (header.firstElementChild ?? header).prepend(add(dom.el('span', { class: 'se-account-chip' }, icon(name))));
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
          if (danger) solo.append(dom.el('span', { class: 'se-account-chip' }, icon('warning')));
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
      img.before(add(icon('mobile', 'se-account-icon se-account-inline-icon')));
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
    };
  });
})();
