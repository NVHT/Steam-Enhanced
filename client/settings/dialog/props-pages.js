/*
 * Steam Settings, Game Properties and Millennium Settings: the Game Properties General, Updates,
 * Files and Workshop pages.
 *
 * Part of client/settings/dialog/ (see shared.js).
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedSettingsParts;
  if (!ns) return;
  const { C, attr: setAttr } = SE;
  const { FIELD, text } = ns;

  const PROPS_ROOT = `:is(.${C.AppProperties}, .AppProperties)`;
  const P = {
    buildInfo: `.${C.BuildInfo}`,
    cloudUsage: `.${C.SteamCloudUsage}`,
    diskRow: `.${C.BrowseDiskRow}`,
    diskSize: `.${C.BrowseDiskSize}`,
    topLine: `.${C.SectionTopLine}`,
    betas: `.${C.BetasTable}`,
    inputGrid: `.${C.SteamInputStatusGrid}`,
    dlcGrid: `.${C.DlcGrid}`,
    dlcTop: `.${C.DlcTopRow}`,
    wsTop: `.${C.WorkshopTopRow}`,
    wsScroll: `.${C.WorkshopItemsRowsScrollable}`,
    wsRow: `.${C.WorkshopItemRow}`,
    privDlc: `.${C.PrivacyDLCSection}`,
    artwork: `.${C.AssetWrapper}`,
    noGap: `.${C.NoBottomGap}`,
  };
  const PROPS_BLOCK = `.${C.Field}, .SettingsDialogSubHeader, .SettingsDialogBodyText, [data-se-ptext], .${C.BrowseDiskRow}, .${C.DlcTopRow}, .${C.BuildInfo}, button.DialogButton, .${C.WorkshopTopRow}, .${C.BetasTable}`;
  const PROPS_NAMES = {
    'general': ['pgen', 'general'],
    'updates': ['dl', 'updates'],
    'installed files': ['pfolder', 'files'],
    'local files': ['pfolder', 'files'],
    'game versions & betas': ['pbranch', 'betas'],
    'betas': ['pbranch', 'betas'],
    'controller': ['controller', 'controller'],
    'dlc': ['pdlc', 'dlc'],
    'workshop': ['pworkshop', 'workshop'],
    'game recording': ['rec', 'rec'],
    'privacy': ['security', 'privacy'],
    'customization': ['pcustom', 'custom'],
    'compatibility': ['pcompat', 'compat'],
    'shortcut': ['pgen', 'shortcut'],
    'performance': ['ingame', 'performance'],
    'feedback': ['notify', 'feedback'],
  };

  const PRE_FOR = new WeakMap();
  const ROW_FOR = new WeakMap();
  // Elements this module adds carry this mark, so destroy() finds them without a Set that keeps
  // every replaced node alive.
  const OWN = 'data-se-own';

  const own = (tag, cls) => {
    const el = document.createElement(tag);
    el.className = cls;
    el.setAttribute(OWN, 'settings');
    return el;
  };

  function bytesOf(str) {
    const m = /([\d.,]+)\s*([KMGT]?)i?B/i.exec(str || '');
    if (!m) return NaN;
    return parseFloat(m[1].replace(',', '.')) * 1024 ** ' KMGT'.indexOf((m[2] || ' ').toUpperCase());
  }

  function fmtBytes(n) {
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) {
      n /= 1024;
      i++;
    }
    return `${n >= 100 || i === 0 ? Math.round(n) : n.toFixed(1)} ${u[i]}`;
  }

  let folders = null;
  let folderAsk = 0;

  function installFolder(i) {
    const store = window.installFolderStore || window.opener?.installFolderStore;
    const f = store?.GetInstallFolder?.(i);
    if (f) return f;
    if (folders) return folders.find((x) => x.nFolderIndex == i);
    if (Date.now() - folderAsk > 5000 && window.SteamClient?.InstallFolder?.GetInstallFolders) {
      folderAsk = Date.now();
      SteamClient.InstallFolder.GetInstallFolders()
        .then((r) => {
          folders = r;
          ns.schedule();
        })
        .catch(() => {});
    }
    return null;
  }

  function copyText(t) {
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(t);
        return;
      }
    } catch (_) {}
    const a = document.createElement('textarea');
    a.value = t;
    document.body.append(a);
    a.select();
    try {
      document.execCommand('copy');
    } catch (_) {}
    a.remove();
  }

  const COPY_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>';

  function propsGeneralPage(content, details) {
    const usage = content.querySelector(P.cloudUsage);
    let box = usage?.parentElement.querySelector(':scope > .se-cloud');
    if (usage) {
      const spans = usage.querySelectorAll(':scope > span');
      const tUsed = text(spans[0] || usage.childNodes[0]);
      const tAvail = text(spans[1] || spans[0]);
      const used = bytesOf(details?.strCloudBytesUsed || tUsed);
      const avail = bytesOf(details?.strCloudBytesAvailable || tAvail);
      if (used >= 0 && avail >= 0 && spans.length >= 2) {
        if (!box) {
          box = own('div', 'se-cloud');
          box.innerHTML = '<div class="se-pbar"></div><div class="se-cloud-text"><span></span><span></span></div>';
        }
        box
          .querySelector('.se-pbar')
          .style.setProperty('--p', `${Math.max(0.5, Math.min(100, (used / Math.max(1, used + avail)) * 100)).toFixed(2)}%`);
        const [a, b] = box.querySelectorAll('.se-cloud-text > span');
        if (a.textContent !== tUsed) a.textContent = tUsed;
        if (b.textContent !== tAvail) b.textContent = tAvail;
        if (box.nextElementSibling !== usage) usage.before(box);
        setAttr(usage, 'data-se-cloud', '');
        const toggle = box.previousElementSibling?.matches(FIELD) ? box.previousElementSibling : null;
        content.querySelectorAll('[data-se-cloudrow]').forEach((f) => {
          if (f !== toggle) f.removeAttribute('data-se-cloudrow');
        });
        if (toggle) {
          setAttr(toggle, 'data-se-cloudrow', '');
          ROW_FOR.set(toggle, 'cloud');
        }
      } else {
        box?.remove();
        usage.removeAttribute('data-se-cloud');
      }
    }
    const launch = content.querySelector('input.DialogTextInputBase, .DialogInput');
    if (launch && /^\s*-|^$/.test(launch.value || '') && launch.closest('.DialogBody')) {
      setAttr(launch, 'data-se-launch', '');
    }
  }

  function propsUpdatesPage(content) {
    const info = content.querySelector(P.buildInfo);
    if (!info) return;
    PRE_FOR.set(info, 'About this build');
    setAttr(info, 'data-se-pre-text', 'About this build');
    [...info.children].forEach((d) => {
      if (d.tagName === 'BR' || d.classList.contains('se-copy')) return;
      const m = /^([^:：]{1,40})[:：]\s*(.+)$/.exec(text(d.childNodes[0]));
      const when = m && /updated/i.test(m[1]) ? /^(.*?\d{4})(?:,?\s+(?:at\s+)?(.+))?$/.exec(m[2]) : null;
      setAttr(d, 'data-se-k', m ? (when ? 'Last updated' : m[1]) : null);
      setAttr(d, 'data-se-v', m ? (when ? when[1] : m[2]) : null);
      setAttr(d, 'data-se-v2', when?.[2] || null);
      let c = d.querySelector(':scope > .se-copy');
      const copyable = m && /^\d+$/.test(m[2]);
      if (copyable && !c) {
        c = own('button', 'se-copy');
        c.type = 'button';
        c.title = 'Copy';
        c.innerHTML = COPY_SVG;
        c.addEventListener('click', (e) => {
          e.stopPropagation();
          copyText(c.parentElement?.getAttribute('data-se-v') || '');
          c.setAttribute('data-done', '');
          setTimeout(() => c.removeAttribute('data-done'), 1200);
        });
        d.append(c);
      } else if (!copyable && c) {
        c.remove();
      }
    });
  }

  function propsFilesPage(content, details) {
    const row = content.querySelector(P.diskRow);
    const size = row?.querySelector(P.diskSize);
    if (size) {
      const m = /^\s*([\d.,]+\s*\S+)\s+(.+?)\s*$/.exec(text(size));
      setAttr(size, 'data-se-big', m ? m[1] : null);
      setAttr(size, 'data-se-rest', m ? m[2] : null);
    }
    const f = details ? installFolder(details.iInstallFolder) : null;
    let disk = row?.querySelector(':scope > .se-disk');
    if (row && f && f.nCapacity > 0) {
      if (!disk) {
        disk = own('div', 'se-disk');
        disk.innerHTML = '<span class="se-disk-text"></span><div class="se-pbar"></div>';
      }
      const t = `${fmtBytes(f.nFreeSpace)} free of ${fmtBytes(f.nCapacity)}`;
      const st = disk.querySelector('.se-disk-text');
      if (st.textContent !== t) st.textContent = t;
      disk.querySelector('.se-pbar').style.setProperty('--p', `${(((f.nCapacity - f.nFreeSpace) / f.nCapacity) * 100).toFixed(1)}%`);
      if (disk.parentElement !== row || disk.nextElementSibling) row.append(disk);
    } else if (disk) {
      disk.remove();
    }

    const group = content.querySelector(P.topLine);
    const rowsHere = group ? [...group.querySelectorAll(FIELD)].filter((x) => !x.parentElement.closest(FIELD)) : [];
    rowsHere.forEach((r, i) => {
      ROW_FOR.set(r, i === rowsHere.length - 1 ? 'pshield' : i === 0 ? 'pbackup' : 'storage');
      if (i === 0) PRE_FOR.set(r, 'Maintenance');
      else PRE_FOR.delete(r);
    });
  }

  function propsWorkshopPage(content) {
    const scroll = content.querySelector(P.wsScroll);
    const emptyNow = scroll && !scroll.querySelector(P.wsRow);
    setAttr(scroll, 'data-se-ws-empty', emptyNow ? '' : null);
    let empty = content.querySelector('.se-ws-empty');
    if (emptyNow) {
      if (!empty) {
        empty = own('div', 'se-ws-empty');
        empty.innerHTML =
          '<div class="se-ws-icon"></div><div class="se-ws-title">No Workshop items yet</div><div class="se-ws-text">Items you subscribe to in the Workshop show up here, in the order the game loads them.</div><button type="button" class="se-ws-btn">Browse the Workshop</button>';
        empty.querySelector('button').addEventListener('click', () => {
          content.querySelector('.DialogBody button.DialogButton, button.DialogButton')?.click();
        });
      }
      if (empty.previousElementSibling !== scroll) scroll.after(empty);
    } else if (empty) {
      empty.remove();
    }
    const visit = content.querySelector('.DialogBody button.DialogButton');
    if (visit) setAttr(visit, 'data-se-paccent', '');
  }
  Object.assign(ns, {
    OWN, P, PRE_FOR, PROPS_BLOCK, PROPS_NAMES, PROPS_ROOT, ROW_FOR, bytesOf, fmtBytes,
    propsFilesPage, propsGeneralPage, propsUpdatesPage, propsWorkshopPage,
  });
});
