/*
 * About Steam: rebuilt as a brand panel (theme logo, name, version, tagline) beside Steam's facts
 * as tiles. The facts are read from Steam's own dialog, so they stay live and localised; every tile
 * copies its value on click, and "Copy all" copies the whole set for bug reports.
 *
 * Steam's header and fact list stay mounted (hidden by about-steam.css once the layout is built),
 * and its footer (Close) is kept and placed in the grid, so React keeps owning its own nodes.
 * Without this script, utility-dialogs.css still styles the stock dialog.
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  window.__steamEnhancedAboutSteam?.destroy();

  const DIALOG = '.DialogContent.FFIKUQ7BGKw6vO1voazlr';
  const HEADER = '._3QhXBKJwISpG-AmpbOQgLQ';
  const BODY = '._32eeZuly3nnz3cMXdSgyj9';
  const LABEL = '._2yhBdvNsgdBGL_UjfmTDGH';
  const BUILT = 'data-se-about';
  const FALLBACK_VERSION = '1.92.10';
  const AUTHOR = 'NVHT';
  const TAGLINE = 'The Steam you always wanted.';
  const COPIED_MS = 1400;

  let themeVersion = FALLBACK_VERSION;
  let copiedTimer = 0;

  /* Steam lists: beta branch, version, client build, web build, API version. */
  const readFacts = body => {
    const facts = [];
    let current = null;
    for (const node of body.childNodes) {
      if (node.nodeType === 1 && node.matches(LABEL)) {
        current = { label: node.textContent.replace(/[:：]\s*$/, '').trim(), value: '' };
        facts.push(current);
      } else if (current && node.nodeType === 1 && node.tagName === 'BR') {
        current = null;
      } else if (current) {
        current.value = `${current.value} ${node.textContent}`.trim();
      }
    }
    return facts.filter(fact => fact.label);
  };

  /* "Wed, Oct 21, 2026 4:11 PM UTC -07:00" -> { main: "Oct 21, 2026", sub: "4:11 PM" } */
  const splitDate = value => {
    const match = value.match(/^(?:[^\d,]+,\s*)?(.*?\d{4})\s+(.+?)(?:\s+UTC.*)?$/);
    return match ? { main: match[1], sub: match[2] } : { main: value, sub: '' };
  };

  const shortLabel = label => label.replace(/^Steam\s+/i, '');

  /* The skin's own manifest is the source of the version; the constant covers a failed fetch. */
  const loadThemeVersion = async () => {
    const asset = [...document.querySelectorAll('link[href], script[src]')]
      .map(el => el.href || el.src)
      .find(url => /\/shared\/(?:tokens\.css|core\.js)(?:[?#]|$)/.test(url));
    if (!asset) return;
    try {
      const response = await fetch(new URL('../skin.json', asset), { cache: 'no-store' });
      const version = (await response.json())?.version;
      if (typeof version === 'string' && version) themeVersion = version;
    } catch (_) {}
  };

  const copyText = async text => {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (_) {}
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  };

  const flashCopied = (button, hint) => {
    const previous = hint.textContent;
    clearTimeout(copiedTimer);
    for (const node of document.querySelectorAll(`[${BUILT}] [data-copied]`)) node.removeAttribute('data-copied');
    button.setAttribute('data-copied', '');
    hint.textContent = 'Copied';
    copiedTimer = setTimeout(() => {
      button.removeAttribute('data-copied');
      hint.textContent = previous;
    }, COPIED_MS);
  };

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const copyButton = (className, copyValue, children, hint) => {
    const button = el('button', className);
    button.type = 'button';
    button.append(...children);
    button.addEventListener('click', () => {
      copyText(copyValue);
      flashCopied(button, hint);
    });
    return button;
  };

  const buildBrand = () => {
    const brand = el('div', 'se-about-brand');
    const name = el('div', 'se-about-name');
    name.append(el('span', 'se-about-name-steam', 'Steam'), ' Enhanced');
    const version = el('div', 'se-about-version', `v${themeVersion} · by ${AUTHOR}`);
    brand.append(el('div', 'se-about-logo'), name, version, el('div', 'se-about-tagline', TAGLINE));
    return brand;
  };

  const buildMain = (title, facts) => {
    const main = el('div', 'se-about-main');
    main.append(el('div', 'se-about-title', title));

    const [branch, version, client, web, api] = facts;
    if (version) {
      const hint = el('span', 'se-about-hint', 'Click to copy');
      const text = el('span', 'se-about-hero-text');
      text.append(el('span', 'se-about-label', shortLabel(version.label)), el('span', 'se-about-hero-value', version.value));
      main.append(copyButton('se-about-hero', version.value, [text, hint], hint));
    }

    const grid = el('div', 'se-about-tiles');
    const tile = (fact, { date = false, accent = false } = {}) => {
      if (!fact) return;
      const parts = date ? splitDate(fact.value) : { main: fact.value, sub: '' };
      const hint = el('span', 'se-about-sub', parts.sub);
      const row = el('span', 'se-about-row');
      const value = el('span', 'se-about-value', parts.main);
      if (accent) value.setAttribute('data-accent', '');
      row.append(value, hint);
      grid.append(copyButton('se-about-tile', fact.value, [el('span', 'se-about-label', shortLabel(fact.label)), row], hint));
    };
    tile(client, { date: true });
    tile(web, { date: true });
    tile(api);
    tile(branch, { accent: true });
    main.append(grid);
    return main;
  };

  const buildCopyAll = facts => {
    const text = [`Steam Enhanced ${themeVersion}`, ...facts.map(fact => `${fact.label}: ${fact.value}`)].join('\n');
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>';
    const label = el('span', null, 'Copy all');
    return copyButton('se-about-copyall', text, [icon, label], label);
  };

  const build = dialog => {
    const inner = dialog.querySelector(':scope > .DialogContent_InnerWidth');
    const header = inner?.querySelector(HEADER);
    const body = inner?.querySelector(BODY);
    if (!inner || !header || !body) return;
    const facts = readFacts(body);
    if (!facts.length) return;

    inner.querySelectorAll(':scope > .se-about').forEach(node => node.remove());
    const title = header.textContent.trim() || 'About Steam';
    const brand = buildBrand();
    const main = buildMain(title, facts);
    const copyAll = buildCopyAll(facts);
    for (const node of [brand, main, copyAll]) node.classList.add('se-about');
    inner.append(brand, main, copyAll);
    SE.mark(dialog, BUILT);
  };

  const scan = () => {
    for (const dialog of document.querySelectorAll(DIALOG)) {
      const inner = dialog.querySelector(':scope > .DialogContent_InnerWidth');
      if (dialog.hasAttribute(BUILT) && inner?.querySelector(':scope > .se-about-main')) continue;
      build(dialog);
    }
  };

  const watcher = SE.watch(scan, { throttle: 100 });
  scan();
  loadThemeVersion().then(() => {
    for (const node of document.querySelectorAll('.se-about-version')) {
      node.textContent = `v${themeVersion} · by ${AUTHOR}`;
    }
  });

  window.__steamEnhancedAboutSteam = {
    destroy() {
      watcher.disconnect();
      clearTimeout(copiedTimer);
      document.querySelectorAll('.se-about').forEach(node => node.remove());
      document.querySelectorAll(`[${BUILT}]`).forEach(node => SE.unmark(node, BUILT));
      delete window.__steamEnhancedAboutSteam;
    },
  };
});
