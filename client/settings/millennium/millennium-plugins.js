/*
 * Millennium Settings › Plugins: four stat tiles (installed, on, memory, CPU), an All / On / Off
 * filter with a pager (six cards a page, so the window never scrolls), each plugin as a card, and
 * a save bar that only asks for a reload while a change is waiting.
 *
 * Millennium's own rows stay where React put them: millennium-plugins.css lays each row out as a
 * card and this part adds what a card has beyond the row (its icon tile and its footer: usage
 * and log status). Everything is read from the row component's live props, so the cards
 * follow Millennium's state rather than its markup.
 *
 * Part of client/settings/millennium/: registers on window.__seMillParts; millennium-pages.js runs
 * it from the settings dialog's pass (before, after) and its rAF pass (layout).
 */
((SE) => {
  const { attr: setAttr, esc } = SE;
  const parts = (window.__seMillParts = window.__seMillParts || {});
  const icon = (name) => parts.icon?.(name) || '';

  const PLUGIN = '.MillenniumPlugins_PluginField';
  const PER_PAGE = 6;

  let mode = 'all';
  let page = 0;

  // The row's component (RenderPluginComponent): its live props.
  function rowOf(field) {
    for (let f = SE.fiber(field), n = 0; f && n < 12; f = f.return, n++) {
      const inst = f.stateNode;
      if (inst && typeof inst.openPluginSettings === 'function' && inst.props?.plugin) return inst;
    }
    return null;
  }

  const fmtBytes = (n) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${(n / 1024).toFixed(1)} KB`);

  /*
   * What a card shows, from its row's props (null when Millennium's props can't be read). A change
   * waits when the switch differs from what Millennium has saved (its own test in
   * handleCheckboxChange); legacy plugins can't be switched, so never wait.
   */
  function infoOf(field) {
    const p = rowOf(field)?.props;
    if (!p) return null;
    const plugin = p.plugin;
    const on = Boolean(p.isEnabled);
    const change = !p.isLegacy && on !== Boolean(plugin?.enabled) ? { enabled: on } : null;
    const m = p.metrics;
    const running = Boolean(plugin?.enabled) && !p.isLegacy && plugin?.status !== 'crashed';
    return {
      on: Boolean(p.isEnabled) && !p.isLegacy,
      running,
      heap: running && m?.rss_bytes > 0 ? m.heap_bytes || 0 : 0,
      cpu: running && m?.rss_bytes > 0 ? m.cpu_percent || 0 : 0,
      measured: running && m?.rss_bytes > 0,
      legacy: Boolean(p.isLegacy),
      crashed: plugin?.status === 'crashed',
      errors: Boolean(p.hasErrors),
      warnings: Boolean(p.hasWarnings),
      change,
    };
  }

  function chip(kind, text, ic) {
    return `<span class="se-mchip" data-tone="${kind}">${ic ? icon(ic) : ''}${esc(text)}</span>`;
  }

  function footHtml(i) {
    // A change waiting for the reload says so first; otherwise what the plugin is using now.
    const usage = i.change
      ? chip('warning', i.change.enabled ? 'On after reload' : 'Off after reload', 'reload')
      : i.measured
        ? `<span class="se-pcard-stat" title="Memory">${icon('memory')}${fmtBytes(i.heap)}</span><span class="se-pcard-stat" title="CPU">${icon('cpu')}${i.cpu.toFixed(1)}%</span>`
        : `<span class="se-pcard-stat" data-idle>${i.running ? 'Starting…' : 'Not running'}</span>`;
    const status = i.legacy
      ? chip('error', 'Needs an update', 'alert')
      : i.crashed
        ? chip('error', 'Crashed', 'alert')
        : i.errors
          ? `<span class="se-mchip" data-tone="error" title="It logged errors: see Logs">${icon('alert')}Errors</span>`
          : i.warnings
            ? `<span class="se-mchip" data-tone="warning" title="It logged warnings: see Logs">${icon('alert')}Warnings</span>`
            : '';
    return `${usage}${status}`;
  }

  function decorate(field, i) {
    let tile = field.querySelector(':scope > .se-pcard-tile');
    if (!tile) {
      tile = parts.make('span', 'se-mtile se-pcard-tile', icon('puzzle'));
      tile.setAttribute('aria-hidden', 'true');
    }
    let foot = field.querySelector(':scope > .se-pcard-foot');
    if (!foot) {
      foot = parts.make('div', 'se-pcard-foot');
    }
    // Ours go after React's children, where its own updates never touch them.
    if (field.lastElementChild !== foot || foot.previousElementSibling !== tile) field.append(tile, foot);

    const html = i ? footHtml(i) : '';
    if (foot.dataset.sig !== html) {
      foot.dataset.sig = html;
      foot.innerHTML = html;
    }
    const pend = i?.change ? (i.change.enabled ? 'on' : 'off') : null;
    setAttr(field, 'data-se-pend', pend);
    setAttr(field, 'data-se-on', i ? (i.on ? 'yes' : 'no') : null);
  }

  function statsOf(content, fields, infos) {
    let strip = content.querySelector('.se-pstats');
    if (!strip) {
      strip = parts.make(
        'div',
        'se-pstats',
        [
          ['puzzle', 'Installed', 'n'],
          ['plug', 'On', 'on'],
          ['memory', 'Memory', 'mem'],
          ['cpu', 'CPU', 'cpu'],
        ]
          .map(([ic, label, k]) => `<div class="se-pstat"><span class="se-mtile">${icon(ic)}</span><div><span>${label}</span><b data-k="${k}"></b></div></div>`)
          .join('')
      );
    }
    const known = infos.filter(Boolean);
    const values = {
      n: String(fields.length),
      on: String(known.length ? known.filter((i) => i.on).length : fields.filter((f) => f.getAttribute('data-se-on') === 'yes').length),
      mem: known.some((i) => i.measured) ? fmtBytes(known.reduce((a, i) => a + i.heap, 0)) : '—',
      cpu: known.some((i) => i.measured) ? `${known.reduce((a, i) => a + i.cpu, 0).toFixed(1)}%` : '—',
    };
    for (const b of strip.querySelectorAll('b[data-k]')) {
      if (b.textContent !== values[b.dataset.k]) b.textContent = values[b.dataset.k];
    }
    return strip;
  }

  function toolOf(content) {
    let bar = content.querySelector('.se-mtool[data-for="plugins"]');
    if (bar) return bar;
    bar = parts.make(
      'div',
      'se-mtool',
      '<span class="se-seg" role="group" aria-label="Show">' +
        ['all', 'on', 'off']
          .map((m) => `<button type="button" data-mode="${m}">${m === 'all' ? 'All' : m === 'on' ? 'On' : 'Off'} <b></b></button>`)
          .join('') +
        '</span>' +
        `<div class="se-mpager" role="group" aria-label="Pages"><button type="button" data-step="-1" aria-label="Previous page">${icon('prev')}</button>` +
        `<span aria-live="polite"></span><button type="button" data-step="1" aria-label="Next page">${icon('next')}</button></div>`
    );
    bar.dataset.for = 'plugins';
    bar.addEventListener('click', (e) => {
      const m = e.target.closest('[data-mode]');
      const s = Number(e.target.closest('[data-step]')?.dataset.step);
      if (m) {
        mode = m.dataset.mode;
        page = 0;
      } else if (s) {
        page += s;
      } else {
        return;
      }
      show(content);
    });
    return bar;
  }

  // The filter and the pager: one page of the plugins the filter keeps.
  function show(content) {
    const fields = [...content.querySelectorAll(PLUGIN)];
    const kept = fields.filter((f) => mode === 'all' || f.getAttribute('data-se-on') === (mode === 'on' ? 'yes' : 'no'));
    const pages = Math.max(1, Math.ceil(kept.length / PER_PAGE));
    page = Math.min(Math.max(page, 0), pages - 1);
    for (const f of fields) {
      const at = kept.indexOf(f);
      setAttr(f, 'data-se-hide', at >= 0 && Math.floor(at / PER_PAGE) === page ? null : '');
    }
    const bar = content.querySelector('.se-mtool[data-for="plugins"]');
    if (!bar) return;
    const on = fields.filter((f) => f.getAttribute('data-se-on') === 'yes').length;
    const counts = { all: fields.length, on, off: fields.length - on };
    for (const b of bar.querySelectorAll('[data-mode]')) {
      const sel = b.dataset.mode === mode;
      setAttr(b, 'data-on', sel ? '' : null);
      setAttr(b, 'aria-pressed', sel ? 'true' : 'false');
      const n = String(counts[b.dataset.mode]);
      if (b.lastChild.textContent !== n) b.lastChild.textContent = n;
    }
    const pager = bar.querySelector('.se-mpager');
    setAttr(pager, 'hidden', pages > 1 ? null : '');
    const words = `${page + 1} of ${pages}`;
    const count = pager.querySelector('span');
    if (count.textContent !== words) count.textContent = words;
    pager.querySelector('[data-step="-1"]').disabled = page === 0;
    pager.querySelector('[data-step="1"]').disabled = page === pages - 1;
  }

  // Millennium's Save stays hidden; this bar asks for the reload while a change waits.
  function saveOf(content, fields, infos) {
    const save = content.querySelector('.MillenniumButtonsSection [data-button-type="save"]');
    let bar = content.querySelector('.se-mill-save');
    if (!save) {
      bar?.remove();
      return;
    }
    if (!bar) {
      bar = parts.make(
        'div',
        'se-mill-save',
        `${icon('info')}<div class="se-mill-save-text"><b></b><span></span></div>` +
          `<button type="button" class="se-mbtn" data-tone="primary">${icon('reload')}Save &amp; reload Steam</button>`
      );
      bar.setAttribute('role', 'status');
      bar.querySelector('button').addEventListener('click', () => {
        content.querySelector('.MillenniumButtonsSection [data-button-type="save"]')?.click();
      });
    }
    const anchor = fields[fields.length - 1];
    if (anchor && bar.previousElementSibling !== anchor) anchor.after(bar);

    // Counted from the cards; Millennium's Save button (disabled as a class, not the attribute)
    // only stands in when no row's props can be read.
    const known = infos.filter(Boolean);
    const n = known.length
      ? known.filter((i) => i.change).length
      : save.disabled || save.matches('.Disabled, [aria-disabled="true"]')
        ? 0
        : 1;
    const title = n > 1 ? `${n} changes waiting` : n === 1 ? '1 change waiting' : '';
    const line = n ? 'Plugins switch on or off after Steam reloads.' : 'Switching a plugin on or off takes effect after you save and reload Steam.';
    setAttr(bar, 'data-quiet', n ? null : '');
    const [b, span] = bar.querySelector('.se-mill-save-text').children;
    if (b.textContent !== title) b.textContent = title;
    if (span.textContent !== line) span.textContent = line;
  }

  function after(content) {
    const fields = [...content.querySelectorAll(PLUGIN)];
    const old = content.querySelectorAll('.se-pstats, .se-mtool[data-for="plugins"], .se-mill-save');
    if (!fields.length) {
      old.forEach((el) => el.remove());
      return;
    }
    const infos = fields.map(infoOf);
    fields.forEach((f, i) => decorate(f, infos[i]));

    const strip = statsOf(content, fields, infos);
    const bar = toolOf(content);
    if (bar.nextElementSibling !== fields[0]) fields[0].before(bar);
    if (strip.nextElementSibling !== bar) bar.before(strip);
    show(content);
    saveOf(content, fields, infos);
  }

  // The save bar sits at the window's foot: the room left under the cards goes above it.
  function layout(content) {
    const bar = content.querySelector('.se-mill-save');
    if (!bar) return;
    const box = content.getBoundingClientRect();
    const foot =
      Math.min(box.top + content.clientTop + content.clientHeight, innerHeight) -
      (parseFloat(getComputedStyle(content).paddingBottom) || 0);
    const now = parseFloat(bar.style.getPropertyValue('--se-psave-push')) || 0;
    const free = Math.floor(foot - bar.getBoundingClientRect().bottom + now);
    SE.cssVar(bar, '--se-psave-push', `${Math.max(0, free)}px`);
  }

  parts.plugins = {
    // The cards say what each plugin is; the page's sub-line stays Millennium's own.
    before(content, api) {
      for (const f of content.querySelectorAll(PLUGIN)) api.pre(f, null);
      return null;
    },
    after,
    layout,
    reset() {
      mode = 'all';
      page = 0;
    },
    own: '.se-pstats, .se-mtool[data-for="plugins"], .se-mill-save, .se-pcard-tile, .se-pcard-foot',
    marks: ['data-se-on', 'data-se-hide', 'data-se-pend'],
    vars: [],
  };
})(window.__se);
