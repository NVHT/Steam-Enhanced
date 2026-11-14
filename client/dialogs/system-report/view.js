/*
 * System Report: the rebuilt view (highlighting, tooltips, createView).
 *
 * Part of client/dialogs/system-report/ (see shared.js).
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedSystemReportParts;
  if (!ns) return;
  const { el } = SE;
  const {
    BOOL_KEY, COPIED_MS, FLAG_KEY, FLAG_MIN, MODE_KEY, NAME_KEY, OPEN_MAX, PLACEHOLDER,
    PRIVATE_KEY, SHORT_TITLES, SPY_OFFSET, TEXT, TEXT_BOX, TIP_RETRIES, TIP_RETRY_MS, attempt,
    button, bytes, clean, copyText, humanize, icon, indexValues, isBlock, kb, leafCount, parseKV,
    sectionText, singular, storage, summarise, toSections, views,
  } = ns;

  /* ---------- Raw view ---------- */

  const escapeHTML = SE.esc ?? (text => String(text).replace(/[&<>"']/g, ch => `&#${ch.charCodeAt(0)};`));

  /* One line of KeyValues to highlighted HTML: first string the key, the second the value */
  const highlightLine = line => {
    let html = '';
    let from = 0;
    let strings = 0;
    for (const match of line.matchAll(/"[^"]*"|[{}]|\/\/.*$/g)) {
      html += escapeHTML(line.slice(from, match.index));
      const token = match[0];
      const kind = token.startsWith('//') ? 'c' : token === '{' || token === '}' ? 'b' : strings++ ? (/^"-?[\d.]+"$/.test(token) ? 'n' : 'v') : 'k';
      html += `<span class="se-sysreport-raw-${kind}">${escapeHTML(token)}</span>`;
      from = match.index + token.length;
    }
    return html + escapeHTML(line.slice(from));
  };

  /* ---------- Steam tooltips (as system-info.js mounts them) ---------- */

  const nativeTooltips = () =>
    attempt(() => SE.global?.('__steamEnhancedNativeTooltips', api => typeof api?.resolve === 'function')?.resolve() ?? null, null);

  const mountTip = ({ React, DOM, Tooltip }, node, label, direction) => {
    const host = el('span', 'se-sysreport-tip');
    node.setAttribute('data-se-sysreport-tip', '');
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
        children: React.createElement('span', { className: 'se-sysreport-tip-hitbox' }),
      }),
    );
    return () => {
      attempt(() => root.unmount());
      host.remove();
      node.removeAttribute('data-se-sysreport-tip');
    };
  };

  /* ---------- Reading Steam's dialog ---------- */

  /* The full report from the Text component's props; the shown (maybe cut) text otherwise */
  const readReport = container => {
    const box = container.querySelector(TEXT_BOX);
    if (!box) return null;
    const full = SE.fromProps?.(box, 6, props => (typeof props.sReport === 'string' ? props.sReport : undefined));
    return full ?? box.querySelector(TEXT)?.textContent ?? null;
  };

  /* ---------- View ---------- */

  const createView = (root, body, container) => {
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
    const fixedTips = [];
    const specTips = [];
    const contentTips = [];
    const dropTips = bucket => {
      for (const unmount of bucket.splice(0)) attempt(unmount);
    };
    cleanups.push(() => {
      clearTimeout(tipTimer);
      pendingTips.length = 0;
      dropTips(fixedTips);
      dropTips(specTips);
      dropTips(contentTips);
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
    const copy = (text, node) => {
      copyText(text, win);
      flash(node);
    };

    /* ---------- Static layout ---------- */

    const specs = el('div', 'se-sysreport-specs');

    // Toolbar: section chips, the filter, expand/collapse and the Details/Raw switch
    const chips = el('nav', 'se-sysreport-chips');
    chips.setAttribute('aria-label', 'Sections');

    const field = el('label', 'se-sysreport-filter');
    const input = el('input');
    input.type = 'search';
    input.placeholder = 'Filter';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Filter the report');
    const clearFilter = button('se-sysreport-filter-clear', [icon('clear')], () => {
      setFilter('');
      input.focus();
    }, 'Clear filter');
    field.append(icon('search'), input, clearFilter);

    const toggleIcon = el('span', 'se-sysreport-tool-icon');
    const toggleAll = button('se-sysreport-tool', [toggleIcon], () => setAllOpen(!allOpen()), 'Expand all');
    tip(fixedTips, toggleAll, 'Expand or collapse all groups');

    const modes = el('div', 'se-sysreport-modes');
    modes.setAttribute('role', 'tablist');
    const modeButton = (mode, name, label) => {
      const node = button('se-sysreport-mode', [icon(name), el('span', null, label)], () => setMode(mode));
      node.setAttribute('role', 'tab');
      node.dataset.mode = mode;
      return node;
    };
    modes.append(modeButton('details', 'cards', 'Details'), modeButton('raw', 'code', 'Raw'));

    const bar = el('div', 'se-sysreport-bar');
    bar.append(chips, field, toggleAll, modes);

    // Details: section cards
    const list = el('div', 'se-sysreport-list');
    list.tabIndex = -1;
    const empty = el('p', 'se-sysreport-empty');
    empty.hidden = true;

    // Raw: the report as written, line numbered
    const raw = el('div', 'se-sysreport-raw');
    raw.tabIndex = -1;
    const rawEmpty = el('p', 'se-sysreport-empty');
    rawEmpty.hidden = true;

    // Loading: skeletons until Steam has gathered the report
    const loading = el('div', 'se-sysreport-loading');
    for (let i = 0; i < 4; i++) loading.append(el('span', 'se-sysreport-skeleton'));

    // Uploading: a bar over the report while Steam submits it
    const busy = el('div', 'se-sysreport-busy');
    busy.append(el('span', 'se-sysreport-busy-bar'));

    const view = el('div', 'se-sysreport-view');
    view.append(specs, bar, list, raw, loading, busy);

    // Footer line: maker · entries · size
    const status = el('div', 'se-sysreport-status');

    /* ---------- State ---------- */

    let report = null;
    let sections = [];
    let cards = [];
    let items = []; // every filterable row: { node, text, label?, value?, labelText, valueText, groups, card }
    let groups = []; // every <details>
    let rawLines = [];
    let rawBuilt = false;
    let filter = '';
    let mode = storage.get(MODE_KEY) === 'raw' ? 'raw' : 'details';
    let openSnapshot = null; // groups' open state from before a filter forced them open

    /* ---------- Render: summary ---------- */

    const renderSpecs = tiles => {
      dropTips(specTips);
      specs.replaceChildren(
        ...tiles.map(tile => {
          const chip = el('span', 'se-sysreport-spec-icon');
          chip.append(icon(tile.id));
          const text = el('span', 'se-sysreport-spec-text');
          text.append(el('span', 'se-sysreport-spec-label', tile.label), el('span', 'se-sysreport-spec-value', tile.value), el('span', 'se-sysreport-spec-sub', tile.sub));
          const node = button('se-sysreport-spec', [chip, text, icon('check')], () => copy(tile.full || tile.value, node));
          tip(specTips, node, tile.full && tile.full !== tile.value ? `${tile.full}. Click to copy` : 'Click to copy');
          return node;
        }),
      );
      specs.hidden = !tiles.length;
      SE.attr?.(specs, 'data-count', tiles.length || null);
    };

    /* ---------- Render: rows ---------- */

    const valueKind = node => {
      const value = clean(node.value);
      if (!value) return { text: 'Empty', kind: 'empty' };
      if (/(?:Size|Space|Bytes|Capacity)$/i.test(node.key) && /^\d{7,}$/.test(value)) return { text: bytes(Number(value)), kind: '', exact: Number(value).toLocaleString() };
      if (PLACEHOLDER.test(value)) return { text: value, kind: 'placeholder' };
      if (BOOL_KEY.test(node.key) && (value === '0' || value === '1')) return { text: value === '1' ? 'Yes' : 'No', kind: value === '1' ? 'yes' : 'no' };
      if (/^(?:0x[\da-f]+|[\da-f]{16,}|[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})$/i.test(value)) return { text: value, kind: 'mono' };
      return { text: value, kind: '' };
    };

    const renderRow = (node, ctx, parentKey) => {
      const { text, kind, exact } = valueKind(node);
      const isPrivate = PRIVATE_KEY.test(node.key) && kind !== 'empty';
      // Entries of a list block ("0", "1") are named after it: "Audio device 1"
      const listKey = node.parentKey ?? parentKey;
      const name = /^\d+$/.test(node.key) && listKey ? `${singular(listKey)} ${Number(node.key) + 1}` : humanize(node.key);
      const label = el('span', 'se-sysreport-row-label', name);
      const value = el('span', 'se-sysreport-row-value', text);
      if (kind) value.dataset.kind = kind;
      if (exact) value.title = `${exact} bytes`;
      const row = button('se-sysreport-row', [label, value, icon(isPrivate ? 'eye' : 'check')], () => {
        if (isPrivate && !row.hasAttribute('data-revealed')) {
          row.setAttribute('data-revealed', '');
          return;
        }
        copy(clean(node.value), row);
      });
      if (isPrivate) row.setAttribute('data-private', '');
      // The report's own key, for support threads; a native title, as rows can number in the hundreds
      if (label.textContent !== node.key) label.title = node.key;
      items.push({ node: row, label, value, labelText: label.textContent, valueText: text, text: `${node.key} ${label.textContent} ${text}`.toLowerCase(), groups: ctx.groups, card: ctx.card, private: isPrivate });
      return row;
    };

    const renderFlags = (flags, ctx) => {
      const wrap = el('div', 'se-sysreport-flags');
      const on = flags.filter(flag => flag.value.trim() === '1').length;
      const head = el('div', 'se-sysreport-flags-head');
      head.append(el('span', 'se-sysreport-flags-title', 'Instruction sets'), el('span', 'se-sysreport-flags-count', `${on} of ${flags.length} supported`));
      const grid = el('div', 'se-sysreport-flags-grid');
      for (const flag of flags) {
        const enabled = flag.value.trim() === '1';
        const chip = button('se-sysreport-flag', [icon(enabled ? 'check' : 'clear'), el('span', null, flag.key)], () => copy(`${flag.key}: ${flag.value.trim()}`, chip));
        chip.toggleAttribute('data-on', enabled);
        chip.setAttribute('aria-label', `${flag.key}: ${enabled ? 'supported' : 'not supported'}`);
        items.push({ node: chip, labelText: flag.key, text: `${flag.key} ${enabled ? 'supported yes' : 'no'}`.toLowerCase(), groups: ctx.groups, card: ctx.card, flag: true });
        grid.append(chip);
      }
      wrap.append(head, grid);
      return wrap;
    };

    /* A list block's entries are named by a child field; "Monitor 0" otherwise */
    const groupTitle = (node, parentKey) => {
      if (/^\d+$/.test(node.key)) {
        const named = node.children.find(child => !isBlock(child) && NAME_KEY.test(child.key) && clean(child.value));
        if (named) return clean(named.value);
        const listKey = node.parentKey ?? parentKey;
        return listKey ? `${singular(listKey)} ${Number(node.key) + 1}` : `#${Number(node.key) + 1}`;
      }
      return humanize(node.key);
    };

    /* Entries of one level: flags as chips, values as rows, blocks as collapsible groups */
    const renderEntries = (entries, ctx, parentKey) => {
      const out = [];
      const values = entries.filter(node => !isBlock(node));
      const flags = values.filter(node => FLAG_KEY.test(node.key) && /^\s*[01]\s*$/.test(node.value));
      const useFlags = flags.length >= FLAG_MIN;
      if (useFlags) out.push(renderFlags(flags, ctx));
      const asFlag = new Set(useFlags ? flags : []);
      // Rows between blocks share a list; a block starts a new one after it
      let rows = null;
      for (const node of entries) {
        if (isBlock(node)) {
          rows = null;
          out.push(renderGroup(node, ctx, parentKey));
        } else if (!asFlag.has(node)) {
          if (!rows) out.push((rows = el('div', 'se-sysreport-rows')));
          rows.append(renderRow(node, ctx, parentKey));
        }
      }
      return out;
    };

    const renderGroup = (node, ctx, parentKey) => {
      const group = el('details', 'se-sysreport-group');
      const count = leafCount(node);
      group.open = count <= OPEN_MAX;
      const summary = el('summary', 'se-sysreport-group-head');
      const title = el('span', 'se-sysreport-group-title', groupTitle(node, parentKey));
      summary.append(icon('chevron'), title, el('span', 'se-sysreport-count', String(count)));
      const inner = { ...ctx, groups: [...ctx.groups, group] };
      const content = el('div', 'se-sysreport-group-body');
      content.append(...renderEntries(node.children, inner, node.key));
      group.append(summary, content);
      groups.push(group);
      items.push({ node: null, title, titleText: title.textContent, text: `${node.key} ${title.textContent}`.toLowerCase(), groups: inner.groups, card: ctx.card, groupTitle: true });
      return group;
    };

    const shortTitle = title => SHORT_TITLES[title] ?? title;

    const renderCards = () => {
      dropTips(contentTips);
      items = [];
      groups = [];
      active = -1;
      cards = sections.map((section, index) => {
        const card = el('section', 'se-sysreport-card');
        const iconChip = el('span', 'se-sysreport-card-icon');
        iconChip.append(icon(section.icon));
        const title = el('h3', 'se-sysreport-card-title', section.title);
        const count = el('span', 'se-sysreport-count', String(section.entries.reduce((sum, node) => sum + leafCount(node), 0)));
        const copyButton = button('se-sysreport-card-copy', [icon('copy')], () => copy(sectionText(section), copyButton), 'Copy section');
        tip(contentTips, copyButton, 'Copy section');
        const head = el('header', 'se-sysreport-card-head');
        head.append(iconChip, title, count, copyButton);
        const entry = { card, section, title, chip: null };
        card.append(head, ...renderEntries(section.entries, { groups: [], card: entry }, section.key));
        entry.chip = button('se-sysreport-chip', [icon(section.icon), el('span', null, shortTitle(section.title))], () => scrollToCard(index));
        return entry;
      });
      chips.replaceChildren(...cards.map(entry => entry.chip));
      list.replaceChildren(...cards.map(entry => entry.card), empty);
      toggleAll.hidden = !groups.length;
      syncToggleAll();
    };

    /* ---------- Render: raw ---------- */

    const buildRaw = () => {
      if (rawBuilt || report == null) return;
      rawBuilt = true;
      const lines = report.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split('\n');
      const html = lines.map((line, i) => `<div class="se-sysreport-raw-line" data-n="${i + 1}">${highlightLine(line.replace(/\t/g, '    ')) || ' '}</div>`).join('');
      raw.innerHTML = html;
      raw.append(rawEmpty);
      rawLines = [...raw.querySelectorAll('.se-sysreport-raw-line')].map((node, i) => ({ node, text: lines[i].toLowerCase() }));
      raw.style.setProperty('--se-sysreport-gutter', `${String(lines.length).length}ch`);
    };

    /* ---------- Update from Steam ---------- */

    const update = () => {
      const next = readReport(container);
      const ready = next != null && next.length > 0;
      // While Steam uploads, its throbber replaces the text: keep showing the last report, busy
      SE.attr?.(root, 'data-se-sysreport-busy', !ready && report != null ? '' : null);
      if (!ready || next === report) {
        SE.attr?.(root, 'data-se-sysreport-ready', report != null ? '' : null);
        return;
      }
      report = next;
      rawBuilt = false;
      rawLines = [];
      SE.attr?.(root, 'data-se-sysreport-ready', '');

      const { root: tree, error } = parseKV(report);
      sections = toSections(tree);
      const values = indexValues(tree.children);
      const { tiles, maker } = summarise(values);
      const entries = sections.reduce((sum, section) => sum + section.entries.reduce((n, node) => n + leafCount(node), 0), 0);
      // Not KeyValues, or too little of it read to be useful: the report is shown raw only
      const parsed = /^\s*"/.test(report) && entries >= 3 && (!error || entries >= 20);
      if (error) console.warn(`[Steam Enhanced] System Report: read ${entries} entries before: ${error}`);
      SE.attr?.(root, 'data-se-sysreport-parsed', parsed ? '' : null);

      renderSpecs(parsed ? tiles : []);
      if (parsed) renderCards();
      else {
        cards = [];
        chips.replaceChildren();
        list.replaceChildren(empty);
      }
      status.replaceChildren(...[maker, parsed && `${entries.toLocaleString()} entries`, kb(report)].filter(Boolean).map(text => el('span', null, text)));
      setMode(parsed ? mode : 'raw', false);
    };

    /* ---------- Mode ---------- */

    const setMode = (next, remember = true) => {
      const parsed = root.hasAttribute('data-se-sysreport-parsed');
      mode = next === 'raw' || !parsed ? 'raw' : 'details';
      if (remember && parsed) storage.set(MODE_KEY, mode);
      if (mode === 'raw') buildRaw();
      SE.attr?.(root, 'data-se-sysreport-mode', mode);
      for (const node of modes.children) {
        const selected = node.dataset.mode === mode;
        node.toggleAttribute('data-active', selected);
        node.setAttribute('aria-selected', String(selected));
        node.disabled = !parsed && node.dataset.mode === 'details';
      }
      applyFilter();
    };

    /* ---------- Filter ---------- */

    /* Wraps each case-insensitive match of `query` in <mark>; plain text otherwise */
    const highlight = (node, text, query) => {
      if (!node) return;
      if (!query) {
        if (node.childElementCount || node.textContent !== text) node.textContent = text;
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

    const filterDetails = query => {
      // Groups open to show matches, and go back to how they were once the filter is cleared
      if (query && !openSnapshot) openSnapshot = groups.map(group => group.open);
      const shownGroups = new Set();
      const shownCards = new Set();
      for (const entry of cards) {
        entry.titleHit = !!query && entry.section.title.toLowerCase().includes(query);
        highlight(entry.title, entry.section.title, entry.titleHit ? query : '');
      }
      // A group whose title matches shows everything in it: mark those first
      const hitGroups = new Set();
      for (const item of items) {
        if (!item.groupTitle) continue;
        const titleHit = !!query && item.text.includes(query);
        if (titleHit) hitGroups.add(item.groups[item.groups.length - 1]);
        highlight(item.title, item.titleText, titleHit && !item.card.titleHit ? query : '');
      }
      for (const item of items) {
        const hit = !query || item.card.titleHit || item.text.includes(query) || item.groups.some(group => hitGroups.has(group));
        if (item.groupTitle) {
          if (hit) {
            shownCards.add(item.card);
            for (const group of item.groups) shownGroups.add(group);
          }
          continue;
        }
        item.node.hidden = !hit;
        if (hit) {
          shownCards.add(item.card);
          for (const group of item.groups) shownGroups.add(group);
        }
        const mark = item.card.titleHit || item.private ? '' : query;
        if (item.flag) continue;
        highlight(item.label, item.labelText, mark);
        highlight(item.value, item.valueText, mark);
      }
      for (const group of groups) {
        group.hidden = !!query && !shownGroups.has(group);
        if (query && shownGroups.has(group)) group.open = true;
      }
      if (!query && openSnapshot) {
        groups.forEach((group, i) => (group.open = openSnapshot[i] ?? group.open));
        openSnapshot = null;
      }
      for (const block of list.querySelectorAll('.se-sysreport-rows, .se-sysreport-flags')) {
        block.hidden = !!query && !block.querySelector(':scope > .se-sysreport-row:not([hidden]), .se-sysreport-flag:not([hidden])');
      }
      let shown = 0;
      for (const entry of cards) {
        const visible = !query || shownCards.has(entry);
        entry.card.hidden = !visible;
        entry.chip.hidden = !visible;
        if (visible) shown++;
      }
      empty.hidden = !query || shown > 0;
      empty.textContent = query ? `Nothing matches “${filter}”` : '';
      syncToggleAll();
      spy();
    };

    const filterRaw = query => {
      let shown = 0;
      for (const line of rawLines) {
        const hit = !query || line.text.includes(query);
        line.node.hidden = !hit;
        if (hit) shown++;
        if (query && hit) line.node.setAttribute('data-hit', '');
        else line.node.removeAttribute('data-hit');
      }
      rawEmpty.hidden = !query || shown > 0;
      rawEmpty.textContent = query ? `Nothing matches “${filter}”` : '';
      SE.attr?.(raw, 'data-filtered', query ? '' : null);
    };

    const applyFilter = () => {
      const query = filter.toLowerCase();
      field.toggleAttribute('data-filled', !!filter);
      if (mode === 'raw') filterRaw(query);
      else filterDetails(query);
    };

    const setFilter = value => {
      filter = value.trim();
      if (input.value !== value) input.value = value;
      applyFilter();
      list.scrollTop = 0;
      raw.scrollTop = 0;
    };
    listen(input, 'input', () => setFilter(input.value));

    /* ---------- Expand / collapse ---------- */

    const allOpen = () => groups.length > 0 && groups.filter(group => !group.hidden).every(group => group.open);
    const syncToggleAll = () => {
      const open = allOpen();
      toggleIcon.replaceChildren(icon(open ? 'collapse' : 'expand'));
      toggleAll.setAttribute('aria-label', open ? 'Collapse all' : 'Expand all');
    };
    const setAllOpen = open => {
      for (const group of groups) if (!group.hidden) group.open = open;
      syncToggleAll();
    };
    // <details> toggle doesn't bubble: listen in the capture phase
    listen(list, 'toggle', () => syncToggleAll(), true);

    /* ---------- Scroll spy ---------- */

    let active = -1;
    let spyFrame = 0;
    const spy = () => {
      const visible = cards.filter(entry => !entry.card.hidden);
      // A window that isn't laid out (hidden, minimised, Raw) has no scroll position to read
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
      const left = chip.offsetLeft; // chips is the offset parent (system-report.css)
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

    // Vertical wheel scrolls the chip strip sideways
    listen(chips, 'wheel', event => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || chips.scrollWidth <= chips.clientWidth) return;
      event.preventDefault();
      chips.scrollLeft += event.deltaY;
    }, { passive: false });

    /* ---------- Keys ---------- */

    // Ctrl+F filters; Esc clears the filter before Steam gets it (Steam's Esc closes the dialog)
    listen(doc, 'keydown', event => {
      if (event.defaultPrevented) return;
      const mod = (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey;
      if (mod && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        input.focus();
        input.select();
      } else if (event.key === 'Escape' && filter) {
        event.preventDefault();
        event.stopPropagation();
        setFilter('');
      }
    }, true);

    update();
    mountTips();

    const nodes = [view, status];
    for (const node of nodes) node.classList.add('se-sysreport');

    return {
      nodes,
      view,
      status,
      update,
      destroy() {
        for (const fn of cleanups.splice(0)) attempt(fn);
        for (const node of nodes) node.remove();
        for (const name of ['data-se-sysreport-ready', 'data-se-sysreport-busy', 'data-se-sysreport-parsed', 'data-se-sysreport-mode']) SE.attr?.(root, name, null);
        views.delete(this);
      },
    };
  };
  Object.assign(ns, { createView });
});
