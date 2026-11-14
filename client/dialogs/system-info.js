/*
 * System Information (Help › System Information), rebuilt: a spec summary of the four parts
 * people ask about (processor, graphics, memory, display) under a one-line system strip, then
 * every survey section as a card of label/value rows, with section chips that follow the scroll,
 * a filter, copy on click and Copy specs beside Steam's own Compare and Close. The system line
 * (OS, form factor, maker) sits under the title, clear of the window's caption buttons.
 *
 * Steam renders the dialog as HardwareSurveyDialog + Desktop (sp.js, the "open/systeminfo"
 * popup): DialogHeader, DialogBodyText, a throbber or the HardwareSurveySections scroll panel,
 * and the footer. The survey steps share those classes; only System Information has a node
 * between the body text and the footer, which is how it is told apart.
 *
 * Steam's nodes stay mounted (hidden by system-info.css) and React keeps owning them. Rows are
 * read from Steam's rendered sections, so text stays localised. Each section's surveyData prop
 * ({ strSectionName, vecEntries: [key | { strName, vecArgs }] }, from SteamClient.User.RunSurvey)
 * names what every row is, which drives icons, the summary and the label/value split. Without
 * it, rows still split on their colon and the summary stays hidden.
 *
 * Identifiers (IP address, MAC and disk serial hashes) are blurred until clicked and left out of
 * Copy specs, so the specs can be pasted anywhere.
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  window.__steamEnhancedSystemInfo?.destroy();

  const ROOT = '._3v2Gg_GCpLHpHQDLFQ7cvI.hYVp3sXyS0uYfJnzVoK-m';
  const SECTION = '.RRhNQ2haTbK9z71YoH2R3';
  const BUILT = 'data-se-sysinfo';
  const KEY_PREFIX = /^#?SteamUI_ValveSurvey_Summary_/;
  const COPIED_MS = 1400;
  const TIP_RETRY_MS = 250;
  const TIP_RETRIES = 40;
  const SPY_OFFSET = 28; // px below the list's top edge that counts as "reading this section"

  /* Duotone icons, as about-steam.js draws them: `d` is the soft fill layer under the stroke. */
  const ICONS = {
    pc: '<rect class="d" x="6" y="3" width="12" height="18" rx="2"/><rect x="6" y="3" width="12" height="18" rx="2"/><path d="M9.5 7h5M9.5 10h5"/><circle cx="12" cy="16" r="1.4"/>',
    cpu: '<rect class="d" x="5" y="5" width="14" height="14" rx="2"/><rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>',
    gpu: '<rect class="d" x="3" y="6" width="18" height="11" rx="2"/><path d="M2 4h1v16M3 6h16a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3M7 17v3h5v-3"/><circle cx="14" cy="11.5" r="3"/>',
    ram: '<rect class="d" x="2" y="7" width="20" height="9" rx="1.5"/><rect x="2" y="7" width="20" height="9" rx="1.5"/><path d="M6 10v3M10 10v3M14 10v3M18 10v3M5 16v3M19 16v3"/>',
    display: '<rect class="d" x="3" y="4" width="18" height="12" rx="2"/><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>',
    os: '<rect class="d" x="3" y="4" width="18" height="5"/><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M6.5 6.5h.01M9.5 6.5h.01"/>',
    audio: '<path class="d" d="M4 9h4l5-4v14l-5-4H4z"/><path d="M4 9h4l5-4v14l-5-4H4zM17 9a4 4 0 0 1 0 6M19.5 6.5a8 8 0 0 1 0 11"/>',
    disk: '<rect class="d" x="3" y="13" width="18" height="7" rx="2"/><path d="M6 4h12l3 9v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5zM3 13h18M17 16.5h.01M13.5 16.5h.01"/>',
    network: '<circle class="d" cx="12" cy="18.5" r="2"/><path d="M2.5 9a14 14 0 0 1 19 0M5.8 12.4a9 9 0 0 1 12.4 0M9 15.7a4.5 4.5 0 0 1 6 0"/><circle cx="12" cy="18.5" r="2"/>',
    vr: '<path class="d" d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4l-3-3-3 3H5a2 2 0 0 1-2-2z"/><path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4l-3-3-3 3H5a2 2 0 0 1-2-2z"/>',
    apps: '<rect class="d" x="4" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    alert: '<path class="d" d="M12 3.5l9 16H3z"/><path d="M12 3.5l9 16H3zM12 10v4M12 16.8h.01"/>',
    game: '<path class="d" d="M7 7h10a5 5 0 0 1 4.9 6l-.6 3a2.5 2.5 0 0 1-4.3 1.2L15 15H9l-2 2.2A2.5 2.5 0 0 1 2.7 16l-.6-3A5 5 0 0 1 7 7z"/><path d="M7 7h10a5 5 0 0 1 4.9 6l-.6 3a2.5 2.5 0 0 1-4.3 1.2L15 15H9l-2 2.2A2.5 2.5 0 0 1 2.7 16l-.6-3A5 5 0 0 1 7 7zM7.5 10v4M5.5 12h4M15.5 11h.01M17.5 13h.01"/>',
    info: '<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    copy: '<rect class="d" x="8" y="8" width="12" height="12" rx="2.5"/><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    search: '<circle class="d" cx="11" cy="11" r="6.5"/><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    clear: '<path d="M7 7l10 10M17 7L7 17"/>',
    eye: '<path class="d" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  };

  /* Survey section keys (steamui_english SteamUI_ValveSurvey_Summary_*) to icons */
  const SECTION_ICONS = {
    Computer: 'pc',
    Processor: 'cpu',
    OSVersion: 'os',
    VideoCard: 'gpu',
    Memory: 'ram',
    Audio: 'audio',
    Storage: 'disk',
    IP: 'network',
    VRHardware: 'vr',
    Software: 'apps',
    FailureReports: 'alert',
    Game_Display_Settings: 'game',
    Misc: 'info',
  };

  /* Short chip names for Steam's English section titles; other languages keep Steam's own. */
  const SHORT_TITLES = [
    [/^computer information$/i, 'Computer'],
    [/^processor information$/i, 'Processor'],
    [/^operating system\b/i, 'OS'],
    [/^video card$/i, 'Graphics'],
    [/^sound card$/i, 'Audio'],
    [/^network information$/i, 'Network'],
    [/^vr hardware$/i, 'VR'],
    [/^installed software$/i, 'Software'],
    [/^recent failure reports$/i, 'Failures'],
    [/^game display settings$/i, 'Games'],
    [/^miscellaneous$/i, 'Misc'],
  ];

  /* Rows that identify this machine: blurred until revealed, never in Copy specs. */
  const PRIVATE_KEYS = new Set(['IPAddress', 'MACAddressHash', 'DiskSerialHash']);

  /* Placeholders OEM boards report instead of a real name */
  const PLACEHOLDER = /^(?:system (?:product name|manufacturer)|to be filled by o\.?e\.?m\.?|default string|not applicable|none|unknown|o\.?e\.?m\.?)$/i;

  const views = new Set();

  /* ---------- Helpers ---------- */

  const attempt = (fn, fallback) => {
    try {
      return fn();
    } catch (err) {
      console.warn('[Steam Enhanced] System Information:', err);
      return fallback;
    }
  };

  const clean = text => String(text ?? '').replace(/\s+/g, ' ').trim();

  const { el } = SE;

  const { icon } = SE.icons(ICONS, 'info');

  const button = (className, children, onClick, label) => {
    const node = el('button', className);
    node.type = 'button';
    node.append(...children);
    if (label) node.setAttribute('aria-label', label);
    node.addEventListener('click', onClick);
    return node;
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

  /* ---------- Reading Steam's sections ---------- */

  const keyOf = name => (typeof name === 'string' ? name.replace(KEY_PREFIX, '') : '');

  /* Literal arguments of a survey entry; `#` arguments are localisation tokens, not text. */
  const argsOf = entry =>
    (Array.isArray(entry?.vecArgs) ? entry.vecArgs : [])
      .map(arg => clean(arg))
      .filter(arg => arg && !arg.startsWith('#'));

  /*
   * "Label:  value" to { label, value }. With the entry's arguments the value starts at the
   * first one, whatever the language; without them, Steam's two-space gap after the colon wins,
   * then the last colon in the first few dozen characters. No label means a standalone fact
   * ("No Touch Input Detected", "16 logical processors"), shown as a pill.
   */
  const splitRow = (text, args) => {
    const at = args.length ? text.indexOf(args[0]) : -1;
    if (at === 0) return { label: '', value: text };
    if (at > 0) {
      const head = text.slice(0, at).trim();
      if (/[:：]$/.test(head)) return { label: head.replace(/\s*[:：]$/, ''), value: text.slice(at).trim() };
    }
    const match = text.match(/^(.{1,60}?)[:：]\s{2,}(.+)$/) || text.match(/^(.{1,48})[:：]\s+(.+)$/);
    return match ? { label: match[1].trim(), value: match[2].trim() } : { label: '', value: text };
  };

  const readSection = node => {
    const heading = node.querySelector(':scope > h3');
    const data = SE.fromProps?.(node, 8, props => props.surveyData) ?? null;
    const entries = Array.isArray(data?.vecEntries) ? data.vecEntries : [];
    const rows = [...node.children]
      .filter(child => child !== heading)
      .map((child, i) => {
        const entry = entries[i];
        const key = keyOf(typeof entry === 'string' ? entry : entry?.strName);
        // The original text keeps Steam's spacing for the split; display text is collapsed
        const raw = child.textContent.replace(/[ \t]*\n[ \t]*/g, ' ').trim();
        const args = argsOf(entry);
        const { label, value } = splitRow(raw, args);
        return { key, args, label: clean(label), value: clean(value), private: PRIVATE_KEYS.has(key) };
      })
      .filter(row => row.value || row.label);
    const title = clean(heading?.textContent).replace(/\s*[:：]$/, '');
    return { key: keyOf(data?.strSectionName), title, rows };
  };

  const readSections = root => [...root.querySelectorAll(SECTION)].map(readSection).filter(section => section.title || section.rows.length);

  /* ---------- Summary ---------- */

  const gb = mb => {
    const value = Number(mb) / 1024;
    if (!Number.isFinite(value) || value <= 0) return '';
    return `${value >= 10 ? Math.round(value) : Number(value.toFixed(1))} GB`;
  };

  const ghz = mhz => {
    const value = Number(mhz) / 1000;
    return Number.isFinite(value) && value > 0 ? `${value.toFixed(2)} GHz` : '';
  };

  /* "AMD Ryzen 7 9800X3D 8-Core Processor" -> "AMD Ryzen 7 9800X3D"; trademarks and clocks go */
  const tidyCPU = name =>
    clean(
      name
        .replace(/\((?:R|TM|C)\)|[®™]/gi, '')
        .replace(/\b\d+-Core\b/i, '')
        .replace(/\b(?:CPU|Processor)\b/gi, '')
        .replace(/@\s*[\d.]+\s*GHz/i, ''),
    );

  const join = (...parts) => parts.filter(Boolean).join(' · ');

  /*
   * The headline facts, from the entries' own arguments (language-neutral numbers). Returns
   * { tiles, meta }; a tile with no value is left out.
   */
  const summarise = sections => {
    const byKey = new Map();
    for (const section of sections) for (const row of section.rows) if (row.key && !byKey.has(row.key)) byKey.set(row.key, row);
    const arg = (key, i = 0) => byKey.get(key)?.args[i] ?? '';
    const first = (...keys) => keys.map(key => arg(key)).find(Boolean) ?? '';

    const cores = arg('PhysicalPlural') || arg('PhysicalSingular');
    const threads = arg('LogicalPlural') || arg('LogicalSingular');
    const cpuName = arg('CPUBrand');
    const resolution = arg('PrimaryMonitorResolution').replace(/\s*x\s*/i, ' × ');
    const monitors = Number(arg('NumberOfMonitors'));
    const refresh = arg('RefreshRate');

    const tiles = [
      {
        id: 'cpu',
        label: 'Processor',
        value: tidyCPU(cpuName),
        full: cpuName,
        sub: join(cores && `${cores} cores`, threads && `${threads} threads`, ghz(arg('CPUSpeed'))),
      },
      {
        id: 'gpu',
        label: 'Graphics',
        value: first('VideoDriverName', 'DirectXCard'),
        sub: join(gb(arg('VRAMSize')), arg('VideoDriverVersion') && `Driver ${arg('VideoDriverVersion')}`),
      },
      { id: 'ram', label: 'Memory', value: gb(arg('RAM')), sub: arg('RAM') ? `${Number(arg('RAM')).toLocaleString()} MB` : '' },
      {
        id: 'display',
        label: 'Display',
        value: resolution,
        sub: join(refresh && `${refresh} Hz`, monitors > 1 && `${monitors} displays`),
      },
    ].filter(tile => tile.value);

    const osName = arg('OSVersionString');
    const bits = arg('OSVersionString', 1);
    const vendor = [arg('ComputerManufacturer'), arg('ComputerModel') || arg('HardwareModel')].filter(part => part && !PLACEHOLDER.test(part));
    const form = byKey.get('DesktopSystem') ?? byKey.get('LaptopSystem');
    const meta = [
      osName && { icon: 'os', text: join(osName, bits && `${bits}-bit`) },
      form && { icon: 'pc', text: form.value },
      vendor.length && { icon: 'info', text: [...new Set(vendor)].join(' ') },
    ].filter(Boolean);

    return { tiles, meta };
  };

  /* ---------- Copy specs ---------- */

  const specsText = sections =>
    sections
      .map(section => {
        const rows = section.rows.filter(row => !row.private).map(row => `  ${row.label ? `${row.label}: ${row.value}` : row.value}`);
        return rows.length ? [section.title, ...rows].join('\n') : '';
      })
      .filter(Boolean)
      .join('\n\n');

  /* ---------- Steam tooltips (as about-steam.js mounts them) ---------- */

  const nativeTooltips = () =>
    attempt(() => SE.global?.('__steamEnhancedNativeTooltips', api => typeof api?.resolve === 'function')?.resolve() ?? null, null);

  const mountTip = ({ React, DOM, Tooltip }, node, label, direction) => {
    const host = el('span', 'se-sysinfo-tip');
    node.setAttribute('data-se-sysinfo-tip', '');
    node.append(host);
    const root = DOM.createRoot(host);
    root.render(
      React.createElement(Tooltip, {
        toolTipContent: label,
        bTopmost: true,
        nDelayShowMS: 300,
        direction,
        nBodyAlignment: 0.5,
        nBodyDistance: 6,
        bPortalToBody: true,
        children: React.createElement('span', { className: 'se-sysinfo-tip-hitbox' }),
      }),
    );
    return () => {
      attempt(() => root.unmount());
      host.remove();
      node.removeAttribute('data-se-sysinfo-tip');
    };
  };

  /* ---------- View ---------- */

  const createView = root => {
    const doc = root.ownerDocument;
    const win = doc.defaultView;
    const cleanups = [];
    const timers = new Map();
    const listen = (target, type, fn, options) => {
      target.addEventListener(type, fn, options);
      cleanups.push(() => target.removeEventListener(type, fn, options));
    };

    /*
     * Tooltips: Steam's own once webpack is up, `title` if it never is. Each tip belongs to a
     * bucket (an array of unmounts), so a redraw can drop the tips of the nodes it replaces.
     */
    let native = null; // null: still looking; false: gave up
    let tipTries = 0;
    let tipTimer = 0;
    const pendingTips = [];
    const tip = (bucket, node, label, direction = 'top') => {
      if (native) bucket.push(mountTip(native, node, label, direction));
      else if (native === false) node.title = label;
      else pendingTips.push([bucket, node, label, direction]);
    };
    const mountTips = () => {
      native = nativeTooltips();
      if (!native && ++tipTries < TIP_RETRIES) {
        native = null;
        tipTimer = setTimeout(mountTips, TIP_RETRY_MS);
        return;
      }
      native ||= false;
      for (const [bucket, node, label, direction] of pendingTips.splice(0)) if (node.isConnected) tip(bucket, node, label, direction);
    };
    const specTips = [];
    const cardTips = [];
    const dropTips = bucket => {
      for (const unmount of bucket.splice(0)) attempt(unmount);
    };
    cleanups.push(() => {
      clearTimeout(tipTimer);
      pendingTips.length = 0;
      dropTips(specTips);
      dropTips(cardTips);
    });

    /* Copied feedback: the node shows a check for a moment */
    const flash = node => {
      clearTimeout(timers.get(node));
      node.setAttribute('data-copied', '');
      timers.set(node, setTimeout(() => {
        node.removeAttribute('data-copied');
        timers.delete(node);
      }, COPIED_MS));
    };
    cleanups.push(() => {
      for (const [node, id] of timers) {
        clearTimeout(id);
        node.removeAttribute('data-copied');
      }
      timers.clear();
    });

    /* System strip: OS, form factor, maker */
    const meta = el('div', 'se-sysinfo-meta');

    /* Spec summary */
    const specs = el('div', 'se-sysinfo-specs');

    /* Toolbar: section chips and the filter */
    const chips = el('nav', 'se-sysinfo-chips');
    chips.setAttribute('aria-label', 'Sections');
    const field = el('label', 'se-sysinfo-filter');
    const input = el('input');
    input.type = 'search';
    input.placeholder = 'Filter';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Filter hardware details');
    const clear = button('se-sysinfo-filter-clear', [icon('clear')], () => {
      setFilter('');
      input.focus();
    }, 'Clear filter');
    field.append(icon('search'), input, clear);
    const bar = el('div', 'se-sysinfo-bar');
    bar.append(chips, field);

    /* Section cards */
    const list = el('div', 'se-sysinfo-list');
    list.tabIndex = -1;
    const empty = el('p', 'se-sysinfo-empty');
    empty.hidden = true;

    /* Loading: skeleton tiles and rows until Steam's survey returns */
    const loading = el('div', 'se-sysinfo-loading');
    loading.append(el('span', 'se-sysinfo-loading-text', 'Detecting hardware…'));
    for (let i = 0; i < 3; i++) loading.append(el('span', 'se-sysinfo-skeleton'));

    const view = el('div', 'se-sysinfo-view');
    view.append(specs, bar, list);
    list.append(loading);

    /* Copy specs, beside Steam's footer */
    const copyLabel = el('span', null, 'Copy specs');
    let sections = [];
    const copyAll = button('se-sysinfo-copyall', [icon('copy'), copyLabel], () => {
      if (!sections.length) return;
      copyText(specsText(sections));
      flash(copyAll);
      copyLabel.textContent = 'Copied';
      clearTimeout(copyAll.labelTimer);
      copyAll.labelTimer = setTimeout(() => (copyLabel.textContent = 'Copy specs'), COPIED_MS);
    });
    cleanups.push(() => clearTimeout(copyAll.labelTimer));
    tip(cleanups, copyAll, 'Copy specs (Ctrl+C). IP and hardware IDs are left out.');

    /* ---------- Render ---------- */

    let cards = [];
    let signature = '';
    let filter = '';

    const renderMeta = items => {
      meta.replaceChildren(
        ...items.map(item => {
          const chip = el('span', 'se-sysinfo-meta-item');
          chip.append(icon(item.icon), el('span', null, item.text));
          return chip;
        }),
      );
      meta.hidden = !items.length;
    };

    const renderSpecs = tiles => {
      dropTips(specTips);
      specs.replaceChildren(
        ...tiles.map(tile => {
          const chip = el('span', 'se-sysinfo-spec-icon');
          chip.append(icon(tile.id));
          const text = el('span', 'se-sysinfo-spec-text');
          text.append(
            el('span', 'se-sysinfo-spec-label', tile.label),
            el('span', 'se-sysinfo-spec-value', tile.value),
            el('span', 'se-sysinfo-spec-sub', tile.sub),
          );
          const node = button('se-sysinfo-spec', [chip, text, icon('check')], () => {
            copyText(tile.full || tile.value);
            flash(node);
          });
          tip(specTips, node, tile.full && tile.full !== tile.value ? `${tile.full}. Click to copy` : 'Click to copy');
          return node;
        }),
      );
      specs.hidden = !tiles.length;
      SE.attr?.(specs, 'data-count', tiles.length || null);
    };

    const renderRow = row => {
      if (!row.label) {
        const pill = button('se-sysinfo-pill', [el('span', 'se-sysinfo-pill-text', row.value), icon('check')], () => {
          copyText(row.value);
          flash(pill);
        });
        return { node: pill, row };
      }
      const value = el('span', 'se-sysinfo-row-value', row.value);
      if (/^(?:0x[0-9a-f]+|[0-9a-f]{12,})$/i.test(row.value)) value.classList.add('se-sysinfo-mono');
      const node = button('se-sysinfo-row', [el('span', 'se-sysinfo-row-label', row.label), value, icon(row.private ? 'eye' : 'check')], () => {
        if (row.private && !node.hasAttribute('data-revealed')) {
          node.setAttribute('data-revealed', '');
          return;
        }
        copyText(row.value);
        flash(node);
      });
      if (row.private) node.setAttribute('data-private', '');
      return { node, row };
    };

    const renderCards = () => {
      dropTips(cardTips);
      active = -1;
      cards = sections.map((section, index) => {
        const kind = SECTION_ICONS[section.key] ?? 'info';
        const card = el('section', 'se-sysinfo-card');
        const iconChip = el('span', 'se-sysinfo-card-icon');
        iconChip.append(icon(kind));
        const title = el('h3', 'se-sysinfo-card-title', section.title);
        const count = el('span', 'se-sysinfo-card-count', String(section.rows.length));
        const copy = button('se-sysinfo-card-copy', [icon('copy')], () => {
          copyText(specsText([section]));
          flash(copy);
        }, 'Copy section');
        tip(cardTips, copy, 'Copy section');
        const head = el('header', 'se-sysinfo-card-head');
        head.append(iconChip, title, count, copy);

        const rendered = section.rows.map(renderRow);
        const pills = el('div', 'se-sysinfo-pills');
        const rows = el('div', 'se-sysinfo-rows');
        for (const { node, row } of rendered) (row.label ? rows : pills).append(node);
        card.append(head);
        if (pills.childElementCount) card.append(pills);
        if (rows.childElementCount) card.append(rows);

        const chip = button('se-sysinfo-chip', [icon(kind), el('span', null, shortTitle(section.title))], () => scrollToCard(index));
        return { card, chip, section, rows: rendered, title };
      });
      chips.replaceChildren(...cards.map(entry => entry.chip));
      list.replaceChildren(...cards.map(entry => entry.card), empty);
      applyFilter();
      spy();
    };

    const shortTitle = title => SHORT_TITLES.find(([re]) => re.test(title))?.[1] ?? title;

    /* Steam's sections, read again whenever they change; the view only redraws on new content */
    const update = () => {
      const next = readSections(root);
      const nextSignature = JSON.stringify(next.map(section => [section.title, section.rows.map(row => row.value)]));
      if (nextSignature === signature) return;
      signature = nextSignature;
      sections = next;
      SE.attr?.(root, 'data-se-sysinfo-ready', sections.length ? '' : null);
      copyAll.disabled = !sections.length;
      if (!sections.length) {
        renderMeta([]);
        renderSpecs([]);
        chips.replaceChildren();
        list.replaceChildren(loading);
        return;
      }
      const { tiles, meta: items } = summarise(sections);
      renderMeta(items);
      renderSpecs(tiles);
      renderCards();
    };

    /* ---------- Filter ---------- */

    /* Wraps each case-insensitive match of `query` in <mark>; plain text otherwise */
    const highlight = (node, text, query) => {
      if (!query) {
        node.textContent = text;
        return;
      }
      const lower = text.toLowerCase();
      const parts = [];
      let from = 0;
      for (let at = lower.indexOf(query); at >= 0; at = lower.indexOf(query, from)) {
        if (at > from) parts.push(text.slice(from, at));
        parts.push(el('mark', null, text.slice(at, at + query.length)));
        from = at + query.length;
      }
      parts.push(text.slice(from));
      node.replaceChildren(...parts);
    };

    const applyFilter = () => {
      const query = filter.toLowerCase();
      let shown = 0;
      for (const entry of cards) {
        const titleHit = !!query && entry.section.title.toLowerCase().includes(query);
        let hits = 0;
        for (const { node, row } of entry.rows) {
          const hit = !query || titleHit || `${row.label} ${row.value}`.toLowerCase().includes(query);
          node.hidden = !hit;
          if (hit) hits++;
          const mark = titleHit || row.private ? '' : query;
          const label = node.querySelector('.se-sysinfo-row-label');
          if (label) highlight(label, row.label, mark);
          highlight(node.querySelector('.se-sysinfo-row-value, .se-sysinfo-pill-text'), row.value, mark);
        }
        highlight(entry.title, entry.section.title, titleHit ? query : '');
        const visible = !query || titleHit || hits > 0;
        entry.card.hidden = !visible;
        entry.chip.hidden = !visible;
        if (visible) shown++;
      }
      field.toggleAttribute('data-filled', !!filter);
      empty.hidden = !query || shown > 0;
      empty.textContent = query ? `Nothing matches “${filter}”` : '';
      spy();
    };

    const setFilter = value => {
      filter = value.trim();
      if (input.value !== value) input.value = value;
      applyFilter();
      list.scrollTop = 0;
    };
    listen(input, 'input', () => setFilter(input.value));

    /* ---------- Scroll spy ---------- */

    let active = -1;
    let spyFrame = 0;
    const spy = () => {
      const visible = cards.filter(entry => !entry.card.hidden);
      // A window that isn't laid out (hidden, minimised) has no scroll position to read
      if (!visible.length || !list.clientHeight) return;
      const top = list.scrollTop + SPY_OFFSET;
      const atEnd = list.scrollTop > 0 && list.scrollTop + list.clientHeight >= list.scrollHeight - 2;
      let current = visible[0];
      if (atEnd) current = visible[visible.length - 1];
      else for (const entry of visible) if (entry.card.offsetTop <= top) current = entry;
      const index = cards.indexOf(current);
      if (index === active) return;
      active = index;
      cards.forEach((entry, i) => entry.chip.toggleAttribute('data-active', i === index));
      // Keep the active chip in view without scrolling the window
      const chip = current.chip;
      const left = chip.offsetLeft; // chips is the offset parent (system-info.css)
      if (left < chips.scrollLeft) chips.scrollLeft = left - 8;
      else if (left + chip.offsetWidth > chips.scrollLeft + chips.clientWidth) chips.scrollLeft = left + chip.offsetWidth - chips.clientWidth + 8;
    };
    listen(list, 'scroll', () => {
      if (!spyFrame) spyFrame = win.requestAnimationFrame(() => {
        spyFrame = 0;
        spy();
      });
    }, { passive: true });
    cleanups.push(() => win.cancelAnimationFrame(spyFrame));

    // Resizing changes which card is at the top, and a window shown late gets its first layout here
    if (win.ResizeObserver) {
      const resize = new win.ResizeObserver(() => {
        active = -1;
        spy();
      });
      resize.observe(list);
      cleanups.push(() => resize.disconnect());
    }

    const reducedMotion = () => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const scrollToCard = index => {
      const card = cards[index]?.card;
      if (!card) return;
      list.scrollTo({ top: card.offsetTop, behavior: reducedMotion() ? 'auto' : 'smooth' }); // list is the offset parent
    };

    /* Vertical wheel scrolls the chip strip sideways */
    listen(chips, 'wheel', event => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || chips.scrollWidth <= chips.clientWidth) return;
      event.preventDefault();
      chips.scrollLeft += event.deltaY;
    }, { passive: false });

    /* ---------- Keys ---------- */

    // Ctrl+F filters; Esc clears the filter, then closes; Ctrl+C with nothing selected copies the specs
    listen(doc, 'keydown', event => {
      if (event.defaultPrevented) return;
      const mod = (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey;
      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        input.focus();
        input.select();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        if (filter) setFilter('');
        else root.querySelector(':scope > .DialogFooter button:last-of-type')?.click();
      } else if (mod && event.key.toLowerCase() === 'c') {
        if (win.getSelection()?.toString() || event.target?.closest?.('input, textarea, [contenteditable]')) return;
        event.preventDefault();
        copyAll.click();
      }
    });

    update();
    mountTips();

    const nodes = [meta, view, copyAll];
    for (const node of nodes) node.classList.add('se-sysinfo');

    return {
      nodes,
      update,
      destroy() {
        for (const fn of cleanups.splice(0)) attempt(fn);
        for (const node of nodes) node.remove();
        SE.attr?.(root, 'data-se-sysinfo-ready', null);
        views.delete(this);
      },
    };
  };

  /* ---------- Mounting ---------- */

  const viewOf = new WeakMap();

  /* System Information is the one survey layout with a node between the body text and the footer */
  const isSystemInfo = root => {
    const footer = root.querySelector(':scope > .DialogFooter');
    const before = footer?.previousElementSibling;
    return !!before && !before.matches('.DialogBodyText, .DialogHeader');
  };

  const build = root => {
    viewOf.get(root)?.destroy();
    root.querySelectorAll(':scope > .se-sysinfo').forEach(node => node.remove());
    const view = createView(root);
    viewOf.set(root, view);
    views.add(view);
    const footer = root.querySelector(':scope > .DialogFooter');
    for (const node of view.nodes) footer.before(node);
    SE.mark(root, BUILT);
  };

  const scan = () => {
    for (const root of document.querySelectorAll(ROOT)) {
      const view = viewOf.get(root);
      if (view && root.hasAttribute(BUILT) && root.querySelector(':scope > .se-sysinfo-view')) {
        view.update();
        continue;
      }
      if (isSystemInfo(root)) build(root);
    }
  };

  const watcher = SE.watch(scan, { throttle: 100, scope: ROOT, ignore: node => !!node.closest?.('.se-sysinfo') });
  scan();

  window.__steamEnhancedSystemInfo = {
    destroy() {
      watcher.disconnect();
      for (const view of [...views]) view.destroy();
      document.querySelectorAll('.se-sysinfo').forEach(node => node.remove());
      document.querySelectorAll(`[${BUILT}]`).forEach(node => SE.unmark(node, BUILT));
      delete window.__steamEnhancedSystemInfo;
    },
  };
});
