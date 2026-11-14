/*
 * Steam Settings, Game Properties and Millennium Settings: sections, pickers, cards, row tagging,
 * and the layout scan.
 *
 * Part of client/settings/dialog/ (see shared.js).
 */
((SE) => {
  const ns = window.__seSettingsParts;
  if (!ns) return;
  const { C, attr: setAttr } = SE;
  const {
    ACCOUNT_HEADER, BODY_TEXT, CONTENT, CONTROLLER_ICON, FIELD, FIELD_BG, KEY_RE, LABEL,
    PRE_LABELS, ROW_ICONS, SECTION, TILE_SUBS, UPDATE_TIMING, adjacent, fieldLabel, text,
  } = ns;
  const { live } = ns;

  function sections(content) {
    for (const el of content.querySelectorAll(SECTION)) {
      if (el.closest(FIELD)) continue;
      setAttr(el, 'data-se-sec', el.hasAttribute('data-se-seglabel') ? null : '');
      const next = el.nextElementSibling;
      if (
        next &&
        next.matches(BODY_TEXT) &&
        !next.nextElementSibling?.matches('.Shared_Radio_Group, :has(> .Shared_Radio_Group), :has(> * > .Shared_Radio_Group)')
      ) {
        setAttr(next, 'data-se-secsub', '');
      }
    }
  }

  function pickers(content) {
    for (const group of content.querySelectorAll('.Shared_Radio_Group')) {
      if (group.closest(FIELD)) continue;
      let host = group;
      while (
        !host.previousElementSibling &&
        host.parentElement &&
        host.parentElement.children.length === 1 &&
        !host.parentElement.matches(CONTENT)
      ) {
        host = host.parentElement;
      }
      const label = host.previousElementSibling;
      if (!label || label.matches(FIELD) || label.querySelector('button, input') || text(label).length > 140) {
        continue;
      }
      setAttr(label, 'data-se-seglabel', '');
      setAttr(label, 'data-se-sec', null);
      setAttr(label, 'data-se-secsub', null);
      setAttr(host, 'data-se-seg', '');
      const w = group.offsetWidth;
      if (w) SE.cssVar(label, '--se-seg-w', `${w}px`);
    }
  }

  function preLabels(content) {
    for (const field of content.querySelectorAll(`${FIELD}.${FIELD_BG}`)) {
      const label = fieldLabel(field);
      const pre = ns.PRE_FOR.get(field) || PRE_LABELS.find(([re]) => re.test(label))?.[1] || null;
      setAttr(field, 'data-se-pre', pre);
      const left = field.querySelector(`:scope > .${C.FieldLeftColumn}`);
      if (left) setAttr(left, 'data-se-pre-text', pre);
    }
  }

  function cards(content) {
    const sel = `${FIELD}.${FIELD_BG}, [data-se-seglabel], ${UPDATE_TIMING}, [data-se-sec]`;
    const nodes = [...content.querySelectorAll(sel)].filter(
      (n) =>
        n.hasAttribute('data-se-sec') ||
        (!n.matches(`${FIELD}:has(${ACCOUNT_HEADER})`) && !n.parentElement.closest(`${FIELD}, ${UPDATE_TIMING}`))
    );
    let prev = null;
    let runNodes = [];

    const flush = () => {
      runNodes.forEach((n, i) => {
        const flags = [];
        if (i === 0) flags.push('f');
        if (i === runNodes.length - 1) flags.push('l');
        if (i === 0 && runNodes.afterSection) flags.push('s');
        setAttr(n, 'data-se-c', flags.join(' ') || 'm');
      });
      runNodes = [];
    };

    for (const n of nodes) {
      if (n.hasAttribute('data-se-sec')) {
        flush();
        prev = n;
        continue;
      }
      const start =
        prev && prev.hasAttribute('data-se-seglabel') && prev.nextElementSibling?.hasAttribute('data-se-seg')
          ? prev.nextElementSibling
          : prev;
      if (prev && !prev.hasAttribute('data-se-sec') && !n.hasAttribute('data-se-pre') && start && adjacent(start, n)) {
        runNodes.push(n);
      } else {
        flush();
        runNodes.push(n);
        runNodes.afterSection = Boolean(
          prev && prev.hasAttribute('data-se-sec') && adjacent(prev, n, `[data-se-secsub], .${C.Toggles}`)
        );
      }
      prev = n;
    }
    flush();

    content.querySelectorAll('[data-se-c]').forEach((n) => {
      if (!nodes.includes(n) || n.hasAttribute('data-se-sec')) {
        n.removeAttribute('data-se-c');
      }
    });
  }

  function rows(content) {
    for (const field of content.querySelectorAll(`${FIELD}[data-se-c]`)) {
      const label = text(field.querySelector(LABEL));
      let icon = ns.ROW_FOR.get(field) || ROW_ICONS.find(([re]) => re.test(label))?.[1] || null;
      if (/^broadcast status/i.test(label)) {
        icon = /not broadcasting/i.test(label) ? 'dot-off' : 'dot-on';
      }
      setAttr(field, 'data-se-row', icon);
      setAttr(field, 'data-se-nickname-preview', /^append nicknames/i.test(label) ? '' : null);
      setAttr(field, 'data-se-name', !label && field.querySelector(`.${C.MicrophoneTest}`) ? 'Microphone test' : null);

      const lab = field.querySelector(LABEL);
      const hasSlider = Boolean(field.querySelector('.SliderControlPanelGroup'));
      if (lab) {
        for (const n of lab.querySelectorAll('*')) {
          setAttr(
            n,
            'data-se-sval',
            hasSlider && !n.childElementCount && /^\s*-?\d+(?:[.,]\d+)?\s*%?\s*$/.test(n.textContent)
              ? ''
              : null
          );
        }
      }

      const first = lab?.firstElementChild;
      const ownIcon =
        first && !first.matches(`.${C.FieldIcon}`) && first.matches('svg, img') && text(lab).length > 0 && !icon
          ? first
          : null;
      setAttr(field, 'data-se-licon', ownIcon ? '' : null);
      lab?.querySelectorAll('[data-se-licon-el]').forEach((n) => {
        if (n !== ownIcon) n.removeAttribute('data-se-licon-el');
      });
      if (ownIcon) setAttr(ownIcon, 'data-se-licon-el', '');

      const addBtn = /^add a new controller/i.test(label) ? field.querySelector('button.DialogButton') : null;
      field.querySelectorAll('button.DialogButton').forEach((b) => {
        setAttr(b, 'data-se-primary', b === addBtn ? '' : null);
      });
      setAttr(field, 'data-se-good', /^vac status/i.test(label) && /no vac ban/i.test(text(field)) ? '' : null);
      for (const b of field.querySelectorAll('button.DialogButton')) {
        setAttr(b, 'data-se-kbd', KEY_RE.test(text(b)) && text(b).length <= 18 ? '' : null);
      }
      setAttr(field, 'data-se-ctl', field.querySelector(CONTROLLER_ICON) ? '' : null);
    }

    [...content.querySelectorAll(`.${C.ActionSection} button.DialogButton`)].forEach((b, i) => {
      setAttr(b, 'data-se-sub', TILE_SUBS[text(b).toLowerCase()] || null);
      setAttr(b, 'data-se-tile', ['add', 'tag', 'storeic'][i] || null);
    });

    const sort = content.querySelector(`.${C.AppHeader} .${C.LibraryImageBackgroundGlow_SortingDropDown}`);
    if (sort) {
      setAttr(sort, 'data-se-sortlabel', /^items/i.test(text(content.querySelector(`.${C.AppHeader}`))) ? 'Sort' : null);
    }

    const selected = content.querySelector(`.${C.AppActionSelected}`);
    if (selected) {
      const m = /^\s*selected\s+(\d+)\s+apps?\s*\(\s*(.+?)\s*\)\s*$/i.exec(selected.textContent || '');
      setAttr(selected, 'data-se-count', m ? `${m[1]} selected` : null);
      setAttr(selected, 'data-se-size', m ? m[2] : null);
    }

    const drive = content.querySelector(`.${C.DriveDropdownControl}`);
    const usage = content.querySelector(`.${C.DriveUsage}`)?.parentElement;
    markOnly(content, 'data-se-drive', usage);
    if (drive && usage && !usage.contains(drive)) {
      const cur = parseFloat(usage.style.getPropertyValue('--se-join')) || 0;
      const gap = usage.getBoundingClientRect().top - drive.getBoundingClientRect().bottom;
      const want = Math.round(cur - gap);
      if (Math.abs(gap) > 0.5 && want <= 0 && want > -80) SE.cssVar(usage, '--se-join', `${want}px`);
    }

    const familyBox = content.querySelector(`.${C.TrySteamFamiliesButtonContainer}`)?.parentElement;
    markOnly(content, 'data-se-family', familyBox);
    const family = familyBox?.firstElementChild;
    if (family && !family.matches(`.${C.TrySteamFamiliesButtonContainer}`)) {
      setAttr(family, 'data-se-head', /steam families/i.test(text(family)) ? 'Steam Families' : null);
    }
  }

  // Marks `el` (if any) and clears the mark from every other element under `root`.
  function markOnly(root, name, el) {
    root.querySelectorAll(`[${name}]`).forEach((n) => n !== el && n.removeAttribute(name));
    if (el) setAttr(el, name, '');
  }

  function scheduleScan() {
    if (!live.scanTimer) live.scanTimer = setTimeout(layoutScan, 300);
  }

  function layoutScan() {
    live.scanTimer = 0;
    const content = document.querySelector(CONTENT);
    if (!content) return;
    const scrollers = [];
    for (const el of [content, ...content.querySelectorAll('*')]) {
      if (el.hasAttribute('data-se-noxs') || el.scrollWidth - el.clientWidth < 2) continue;
      const ox = getComputedStyle(el).overflowX;
      if (ox === 'auto' || ox === 'scroll') scrollers.push(el);
    }
    const sticky = [];
    for (const el of content.querySelectorAll('div, span')) {
      if (el.childElementCount || !/^(email|e-mail)$/i.test(text(el))) continue;
      for (let n = el, i = 0; i < 10 && n && n !== content; i++, n = n.parentElement) {
        const { position } = getComputedStyle(n);
        if (position === 'sticky' || position === 'fixed') {
          sticky.push(n);
          break;
        }
      }
    }
    scrollers.forEach((el) => setAttr(el, 'data-se-noxs', ''));
    sticky.forEach((el) => setAttr(el, 'data-se-sticky', ''));
  }
  Object.assign(ns, { cards, pickers, preLabels, rows, scheduleScan, sections });
})(window.__se);
