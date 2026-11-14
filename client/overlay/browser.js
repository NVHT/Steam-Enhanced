/*
 * Overlay: the Browser and Settings views.
 *
 * Part of client/overlay/ (see context.js).
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedOverlayParts;
  if (!ns) return;
  const { el } = SE;
  const { GUIDES_URL, ICON, NEWS_URL, WIDGET, button, desktopOverlay, openToolWidget, root, scheduleRender, setText } = ns;

  /* ---------- Browser ---------- */

  // The overlay browser's tabs: DesktopOverlay.web_requests
  // ([{ requestid, strURL }]), opened with AddWebPageRequest and closed with
  // RemoveWebPageRequest(requestid); its window id is "Browser".
  const webTabs = () =>
    (SE.run(() => Array.from(desktopOverlay().web_requests || [])) || []).map(tab => ({
      id: Number(tab.requestid),
      url: String(tab.strURL || ''),
    }));

  const openBrowser = () =>
    openToolWidget('browser') || SE.run(() => desktopOverlay().SetWindowVisibility(WIDGET.browser, 1));

  const closeWebTab = id => {
    SE.run(() => desktopOverlay().RemoveWebPageRequest(id));
    scheduleRender();
  };

  // A typed address opens as typed (https:// added); anything else searches.
  const addressUrl = text => {
    const value = text.trim();
    if (!value) return '';
    if (/^https?:\/\//i.test(value)) return value;
    if (/^[^\s]+\.[a-z]{2,}(\/\S*)?$/i.test(value)) return `https://${value}`;
    return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
  };

  const gameLinks = appid => [
    ['Store page', `https://store.steampowered.com/app/${appid}/`],
    ['Community hub', `https://steamcommunity.com/app/${appid}/`],
    ['Discussions', `https://steamcommunity.com/app/${appid}/discussions/`],
    ['Guides', GUIDES_URL(appid)],
    ['News', NEWS_URL(appid)],
  ];

  const tabLabel = url => {
    try {
      const u = new URL(url);
      return { host: u.hostname.replace(/^www\./, ''), path: (u.pathname + u.search).replace(/\/$/, '') || '/' };
    } catch (_) {
      return { host: url, path: '' };
    }
  };

  const renderBrowserView = (part, appid) => {
    const linksSig = String(appid);
    if (part.linksSig !== linksSig) {
      part.linksSig = linksSig;
      part.links.replaceChildren(
        ...(appid ? gameLinks(appid) : []).map(([label, url]) => {
          const link = button('se-ov-chip-btn', { url });
          link.textContent = label;
          return link;
        })
      );
    }
    const tabs = webTabs();
    const tabsSig = JSON.stringify(tabs);
    if (part.tabsSig === tabsSig) return;
    part.tabsSig = tabsSig;
    part.tabs.replaceChildren(
      ...(tabs.length
        ? tabs.map(tab => {
            const { host, path } = tabLabel(tab.url);
            const row = el('div', 'se-ov-web-tab');
            const open = button('se-ov-web-open', { webOpen: '' });
            open.title = tab.url;
            const badge = el('span', 'se-ov-web-badge', host.charAt(0).toUpperCase());
            const text = el('span', 'se-ov-friend-text');
            text.append(el('span', 'se-ov-friend-name', host), el('span', 'se-ov-friend-status', path));
            open.append(badge, text);
            const close = button('se-ov-web-close', { webClose: String(tab.id) });
            close.setAttribute('aria-label', `Close ${host}`);
            close.innerHTML = ICON.close;
            row.append(open, close);
            return row;
          })
        : [el('p', 'se-ov-tool-text', 'No open tabs.')])
    );
  };

  /* ---------- Settings ---------- */

  // Backdrop darkness: a CSS variable on this window, kept per user
  // in localStorage. Slider values are in `unit`; `toCss` maps them to the
  // variable (stored as --se-overlay-dim, 0.4-1.4). The backdrop's edges reach
  // full black at 100%; past it the lighter centre darkens too, until 140%
  // hides the game entirely (alphas over 1 clamp).
  const BACKDROP = Object.freeze({
    dim: {
      label: 'Darkness',
      cssVar: '--se-overlay-dim',
      storageKey: 'se-overlay-dim',
      min: 40,
      max: 140,
      fallback: 120,
      unit: '%',
      toCss: value => String(value / 100),
      fromStored: stored => stored * 100,
      toStored: value => value / 100,
    },
  });

  const readBackdrop = key => {
    const spec = BACKDROP[key];
    try {
      const raw = localStorage.getItem(spec.storageKey);
      const value = raw === null ? NaN : Math.round(spec.fromStored(Number(raw)));
      if (value >= spec.min && value <= spec.max) return value;
    } catch (_) {}
    return null;
  };

  const applyBackdrop = (key, value) =>
    SE.cssVar(root, BACKDROP[key].cssVar, value == null ? null : BACKDROP[key].toCss(value));

  const applyBackdrops = (clear = false) => {
    for (const key of Object.keys(BACKDROP)) applyBackdrop(key, clear ? null : readBackdrop(key));
  };

  const setBackdrop = (key, raw) => {
    const spec = BACKDROP[key];
    if (!spec || !Number.isFinite(raw)) return;
    const value = Math.min(spec.max, Math.max(spec.min, Math.round(raw)));
    applyBackdrop(key, value);
    try {
      localStorage.setItem(spec.storageKey, String(spec.toStored(value)));
    } catch (_) {}
    scheduleRender();
  };

  const renderSettingsView = part => {
    for (const [key, spec] of Object.entries(BACKDROP)) {
      const { range, value } = part.sliders[key];
      const current = readBackdrop(key) ?? spec.fallback;
      if (document.activeElement !== range) range.value = String(current);
      setText(value, `${current}${spec.unit}`);
    }
  };

  Object.assign(ns, { BACKDROP, addressUrl, applyBackdrops, closeWebTab, openBrowser, renderBrowserView, renderSettingsView, setBackdrop });
});
