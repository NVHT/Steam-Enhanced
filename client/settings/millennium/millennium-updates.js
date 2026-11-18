/*
 * Millennium Settings › Updates: a status card (up to date / updates available / checking /
 * couldn't check, with Check for updates) over a list of everything Millennium checks:
 * Millennium itself, the theme in use and the plugins it tracks, each with its state and a
 * Download button when there's an update.
 *
 * Millennium's own page stays mounted underneath (hidden): its update cards hold the download
 * actions and their progress, so a row's Download calls that card's own onUpdateClick and shows
 * its progress text, and Check calls the page's own fetchAvailableUpdates(true).
 *
 * Part of client/settings/millennium/: registers on window.__seMillParts; millennium-pages.js runs
 * it from its rAF pass (step, layout).
 */
((SE) => {
  const { attr: setAttr, run, esc } = SE;
  const parts = (window.__seMillParts = window.__seMillParts || {});
  const icon = (name) => parts.icon?.(name) || '';

  let checking = false;
  let checkedAt = 0;
  let failedDetail = '';

  // The page's update context (fetchAvailableUpdates, themeUpdates, pluginUpdates, …), from the
  // provider's fiber above Millennium's own content (ours has no fiber).
  function contextOf(body) {
    const start = [...body.children].find((c) => !c.hasAttribute('data-se-own')) || body;
    for (let f = SE.liveFiber(start), n = 0; f && n < 60; f = f.return, n++) {
      const v = f.memoizedProps?.value;
      if (v && typeof v.fetchAvailableUpdates === 'function' && 'hasReceivedUpdates' in v) return v;
    }
    return null;
  }

  // Millennium's update cards (one per update): name and the card's live props.
  function cardsOf(body) {
    const out = [];
    for (const field of body.querySelectorAll('.MillenniumUpdates_Field')) {
      for (let f = SE.fiber(field), n = 0; f && n < 10; f = f.return, n++) {
        const inst = f.stateNode;
        if (inst?.props && typeof inst.props.onUpdateClick === 'function' && inst.props.update) {
          out.push(inst.props);
          break;
        }
      }
    }
    return out;
  }

  const nameOf = (v) => (typeof v === 'string' ? v : '');
  const versionText = (v) => (v ? (/^v/i.test(v) ? v : `v${v}`) : '');

  // The rows: Millennium, the theme in use (and any other theme with an update), the plugins.
  function rowsOf(ctx, cards, core) {
    const rows = [];
    const byName = (name) => cards.find((c) => nameOf(c.update?.name) === name);

    const mill = core?.millenniumUpdates;
    const millCard = cards.find((c) => /^Millennium@/.test(nameOf(c.update?.name)));
    rows.push({
      kind: 'core',
      label: 'Loads your theme and plugins',
      name: 'Millennium',
      version: versionText(core?.version),
      update: Boolean(mill?.hasUpdate),
      to: mill?.newVersion?.tag_name || '',
      card: millCard,
    });

    const themeUpdates = Array.isArray(ctx?.themeUpdates) ? ctx.themeUpdates : [];
    const active = core?.activeTheme;
    const activeNative = active?.native;
    if (active && activeNative && activeNative !== 'default') {
      const up = themeUpdates.find((t) => t.native === activeNative);
      rows.push({
        kind: 'theme',
        label: 'Theme in use',
        name: active.data?.name || activeNative,
        version: versionText(active.data?.version),
        update: Boolean(up),
        note: up?.message,
        card: up && byName(up.name),
      });
    }
    for (const t of themeUpdates) {
      if (t.native === activeNative) continue;
      rows.push({ kind: 'theme', label: 'Theme', name: t.name, version: '', update: true, note: t.message, card: byName(t.name) });
    }

    const pluginUpdates = Array.isArray(ctx?.pluginUpdates) ? ctx.pluginUpdates : [];
    const seen = new Set();
    for (const p of pluginUpdates) {
      const name = p?.pluginInfo?.pluginJson?.common_name || p?.pluginInfo?.pluginJson?.name || p?.name;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      rows.push({
        kind: 'plugin',
        label: 'Plugin',
        name,
        version: '',
        update: Boolean(p.hasUpdate),
        note: p.hasUpdate ? p.commitMessage : '',
        card: p.hasUpdate ? byName(name) : null,
      });
    }
    return rows;
  }

  const firstLine = (s) => String(s || '').replace(/^#.*$/gm, '').split('\n').map((l) => l.trim()).find(Boolean) || '';

  function rowHtml(r, waiting) {
    const tile = `<span class="se-mtile">${icon(r.kind === 'core' ? 'core' : r.kind === 'theme' ? 'palette' : 'puzzle')}</span>`;
    const sub = r.update && r.note ? firstLine(r.note) : r.label;
    const head =
      `<div class="se-upd-name"><b>${esc(r.name)}</b>${r.version ? `<span class="se-mver">${esc(r.version)}</span>` : ''}</div>` +
      `<span class="se-upd-sub">${esc(sub)}</span>`;
    let state = '';
    let action = '';
    const card = r.card;
    if (waiting) {
      state = '<span class="se-mchip" data-tone="muted">Checking…</span>';
    } else if (card?.disabled) {
      state = `<span class="se-mchip" data-tone="ok">${icon('check')}Restart to finish</span>`;
    } else if (r.update) {
      state = `<span class="se-mchip" data-tone="accent">${icon('download')}${r.to ? `${esc(r.to)} available` : 'Update available'}</span>`;
      action = card?.isUpdating
        ? `<button type="button" class="se-mbtn" data-size="sm" disabled><span class="se-mspin se-spin-arc" aria-hidden="true"></span>${esc(card.statusText || 'Updating…')}</button>`
        : card
          ? `<button type="button" class="se-mbtn" data-size="sm" data-act="download">${icon('download')}Download</button>`
          : '';
    } else {
      state = `<span class="se-mchip" data-tone="ok">${icon('check')}Up to date</span>`;
    }
    return `<div class="se-upd-row" data-name="${esc(r.name)}">${tile}<div class="se-upd-text">${head}</div>${state}<span class="se-upd-act">${action}</span></div>`;
  }

  function rootOf(body) {
    let root = body.querySelector(':scope > .se-upd');
    if (root) return root;
    root = parts.make(
      'div',
      'se-upd',
      '<section class="se-upd-hero"><span class="se-upd-mark"></span><div class="se-upd-hero-text"><b></b><span></span><small></small></div>' +
        '<button type="button" class="se-mbtn" data-act="check"></button></section>' +
        '<section class="se-upd-list"><header><span class="se-mlabel">What Millennium checks</span><span class="se-upd-count"></span></header><div class="se-upd-rows" role="list"></div></section>'
    );
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]:not(:disabled)');
      if (!b) return;
      if (b.dataset.act === 'check') check(body);
      if (b.dataset.act === 'download') {
        const name = b.closest('[data-name]')?.dataset.name;
        const r = (root.__rows || []).find((x) => x.name === name);
        if (r?.card) {
          b.disabled = true;
          run(() => r.card.onUpdateClick());
        }
      }
    });
    body.prepend(root);
    return root;
  }

  async function check(body) {
    const ctx = contextOf(body);
    if (!ctx || checking) return;
    checking = true;
    parts.schedule?.();
    try {
      await ctx.fetchAvailableUpdates(true);
      checkedAt = Date.now();
    } catch {}
    checking = false;
    parts.schedule?.();
  }

  // Returns whether the page was drawn (a requested check only runs once it is).
  function step(content, opts = {}) {
    const body = content.querySelector('.DialogBody');
    if (!body) return false;
    const ctx = contextOf(body);
    const core = parts.core?.();
    if (!ctx) {
      // Millennium's page isn't the one this part knows: leave it as it is.
      body.querySelector(':scope > .se-upd')?.remove();
      setAttr(body, 'data-se-upd', null);
      return false;
    }
    setAttr(body, 'data-se-upd', '');
    const root = rootOf(body);
    if (body.firstElementChild !== root) body.prepend(root);
    if (opts.check) check(body);

    const placeholder = body.querySelector('.MillenniumPlaceholder_Text');
    if (ctx.hasUpdateError && placeholder) failedDetail = placeholder.textContent.trim();
    const waiting = checking || !ctx.hasReceivedUpdates;
    const cards = cardsOf(body);
    const rows = rowsOf(ctx, cards, core);
    root.__rows = rows;
    const count = rows.filter((r) => r.update).length;
    const plugins = rows.filter((r) => r.kind === 'plugin').length;

    const state = ctx.hasUpdateError && !waiting ? 'error' : waiting ? 'checking' : count ? 'available' : 'current';
    const words = {
      error: ["Couldn't check for updates", failedDetail || 'Millennium could not reach GitHub.'],
      checking: ['Checking for updates…', 'Asking GitHub about Millennium, your theme and your plugins.'],
      available: [count === 1 ? '1 update available' : `${count} updates available`, 'Download each one; Millennium asks to reload Steam when one needs it.'],
      current: ['You’re up to date', `Millennium, your theme${plugins ? ` and ${plugins === 1 ? 'your plugin' : `your ${plugins} plugins`}` : ''} are on their latest versions.`],
    }[state];
    setAttr(root, 'data-state', state);

    const hero = root.querySelector('.se-upd-hero');
    const mark = hero.querySelector('.se-upd-mark');
    const markIcon = { error: 'alert', checking: 'refresh', available: 'download', current: 'check' }[state];
    if (mark.dataset.icon !== markIcon) {
      mark.dataset.icon = markIcon;
      mark.innerHTML = icon(markIcon);
    }
    const [t, s, small] = hero.querySelector('.se-upd-hero-text').children;
    if (t.textContent !== words[0]) t.textContent = words[0];
    if (s.textContent !== words[1]) s.textContent = words[1];
    const when = checkedAt
      ? `Last checked ${new Date(checkedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
      : '';
    if (small.textContent !== when) small.textContent = when;

    const btn = hero.querySelector('[data-act="check"]');
    const btnHtml = waiting
      ? `<span class="se-mspin se-spin-arc" aria-hidden="true"></span>Checking`
      : `${icon('refresh')}${state === 'error' ? 'Try again' : state === 'available' ? 'Check again' : 'Check for updates'}`;
    if (btn.dataset.sig !== btnHtml) {
      btn.dataset.sig = btnHtml;
      btn.innerHTML = btnHtml;
    }
    btn.disabled = waiting;
    setAttr(btn, 'data-tone', state === 'current' ? 'primary' : null);

    const countText = waiting ? '' : `${rows.length} ${rows.length === 1 ? 'item' : 'items'} · ${count ? `${count} to update` : 'all current'}`;
    const countEl = root.querySelector('.se-upd-count');
    if (countEl.textContent !== countText) countEl.textContent = countText;

    const list = root.querySelector('.se-upd-rows');
    const html = rows.map((r) => rowHtml(r, waiting)).join('');
    if (list.dataset.sig !== html) {
      list.dataset.sig = html;
      list.innerHTML = html;
    }
    return true;
  }

  // The list reaches the window's foot and scrolls inside itself when there are many plugins.
  function layout(content) {
    const rows = content.querySelector('.se-upd-rows');
    if (rows) parts.fillHeight?.(rows, content, '--se-upd-rows-h', 120);
  }

  parts.updates = {
    step,
    layout,
    reset() {
      failedDetail = '';
    },
    own: '.se-upd',
    marks: ['data-se-upd'],
    vars: ['--se-upd-rows-h'],
  };
})(window.__se);
