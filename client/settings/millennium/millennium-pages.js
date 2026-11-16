/*
 * Millennium Settings page enhancements.
 *
 * Driven by client/settings/dialog/: it tags [data-se-mill-page] on the active page and calls
 * hooks.before / hooks.after from inside its own pass, so there is no second observer.
 * - Rows (in the dialog's pass): the theme in use and initials.
 * - Themes: adds an installed count and a pager (six a page, so the window never scrolls),
 *   applies skin.json header_image previews.
 * - Quick CSS: mounts an inline syntax-highlighted CSS editor wired to
 *   Millennium's Core_LoadQuickCss / Core_SaveQuickCss FFI bindings.
 * - General: a status card (version, channel, Check for updates) over Checks & alerts, Themes
 *   and Network, laid out to fit the fixed window.
 * - Plugins, Updates and Logs are parts of their own (millennium-plugins.js, -updates.js,
 *   -logs.js), registered on window.__seMillParts with the icons (millennium-icons.js) and run
 *   from here: before / after in the dialog's pass, step / layout in this file's rAF pass. This
 *   file hands them its helpers (make, text, core, fillHeight, schedule).
 */
((SE) => {
  const { C, run, esc, attr: setAttr } = SE;
  window.__seMillPages?.destroy();
  const parts = (window.__seMillParts = window.__seMillParts || {});
  const PARTS = ['plugins', 'updates', 'logs'];

  const CONTENT = `.${C.PagedSettingsDialog_PageContent}`;
  const ROOT = '.MillenniumSettings';
  // Added elements carry this mark, so cleanup finds them without a Set that keeps old nodes alive.
  const OWN = 'data-se-own';
  const make = (tag, cls, html) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html) el.innerHTML = html;
    el.setAttribute(OWN, 'mill');
    return el;
  };
  const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();


  const THEME = '.MillenniumThemes_ThemeItem';
  // Installed themes (all but the one in use) show a page at a time, so the window never scrolls.
  const THEMES_PER_PAGE = 6;
  let themePage = 0;
  const ICON_PREV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14.5 6.5L9 12l5.5 5.5"/></svg>';
  const ICON_NEXT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.5 6.5L15 12l-5.5 5.5"/></svg>';

  const themeData = (field) =>
    SE.fromProps(field, 8, (p) => (p.theme && typeof p.theme === 'object' && 'activeTheme' in p ? p.theme : null));

  function themes(content) {
    const fields = [...content.querySelectorAll(THEME)];
    const rest = fields.filter((f) => !f.hasAttribute('data-se-active'));
    let bar = content.querySelector('.se-mtool[data-for="themes"]');
    if (!rest.length) {
      bar?.remove();
    } else {
      if (!bar) {
        bar = make('div', 'se-mtool');
        bar.dataset.for = 'themes';
        bar.innerHTML =
          '<span class="se-mtool-label"></span>' +
          `<div class="se-mpager" role="group" aria-label="Pages"><button type="button" data-step="-1" aria-label="Previous page">${ICON_PREV}</button>` +
          `<span aria-live="polite"></span><button type="button" data-step="1" aria-label="Next page">${ICON_NEXT}</button></div>`;
        bar.querySelector('.se-mpager').addEventListener('click', (e) => {
          const step = Number(e.target.closest('[data-step]')?.dataset.step);
          if (!step) return;
          themePage += step;
          paginate(content);
        });
      }
      if (bar.nextElementSibling !== rest[0]) rest[0].before(bar);
      const label = bar.querySelector('.se-mtool-label');
      const words = `Installed · ${rest.length}`;
      if (label.textContent !== words) label.textContent = words;
    }

    paginate(content);

    for (const f of fields) {
      const data = run(() => themeData(f)?.data) || {};
      const img =
        typeof data.header_image === 'string' && /^https?:\/\//.test(data.header_image)
          ? data.header_image
          : null;
      setAttr(f, 'data-se-thumb', img ? '' : null);
      const want = img ? `url("${img.replace(/["\\]/g, '')}")` : '';
      if (f.style.getPropertyValue('--se-thumb') !== want) {
        if (want) f.style.setProperty('--se-thumb', want);
        else f.style.removeProperty('--se-thumb');
      }
    }
  }

  // Shows one page of the installed themes; the pager says where you are and stops at the ends.
  function paginate(content) {
    const rest = [...content.querySelectorAll(`${THEME}:not([data-se-active])`)];
    const pages = Math.max(1, Math.ceil(rest.length / THEMES_PER_PAGE));
    themePage = Math.min(Math.max(themePage, 0), pages - 1);
    rest.forEach((f, i) => setAttr(f, 'data-se-hide', Math.floor(i / THEMES_PER_PAGE) === themePage ? null : ''));
    const pager = content.querySelector('.se-mtool[data-for="themes"] .se-mpager');
    if (!pager) return;
    setAttr(pager, 'hidden', pages > 1 ? null : '');
    const words = `${themePage + 1} of ${pages}`;
    const count = pager.querySelector('span');
    if (count.textContent !== words) count.textContent = words;
    pager.querySelector('[data-step="-1"]').disabled = themePage === 0;
    pager.querySelector('[data-step="1"]').disabled = themePage === pages - 1;
  }

  /*
   * Rows, from inside the dialog's pass: `before` runs ahead of its card steps (and returns the
   * page's sub-line), `after` once the cards are drawn; `api` reaches the dialog's pre-labels.
   * Plugins, Updates and Logs hand theirs to their part.
   */
  function isActiveTheme(field) {
    const p = SE.fromProps(field, 6, (q) => (q.theme && 'activeTheme' in q ? q : undefined));
    if (p) {
      return Boolean(p.activeTheme && (p.theme?.data?.name === p.activeTheme || p.theme?.native === p.activeTheme));
    }
    return Boolean(field.querySelector(`.${C.FieldIcon} svg`));
  }

  function before(content, key, api) {
    if (key === 'themes') {
      for (const f of content.querySelectorAll(THEME)) {
        setAttr(f, 'data-se-active', isActiveTheme(f) ? '' : null);
        const lab = f.querySelector('.MillenniumThemes_ThemeLabel');
        const name = text(lab?.firstChild) || text(lab);
        const initial = name ? [...name.replace(/^[^\p{L}\p{N}]+/u, '')][0]?.toLocaleUpperCase() || null : null;
        setAttr(f, 'data-se-initial', initial);
        if (lab) setAttr(lab, 'data-se-initial', initial);
        api.pre(f, null);
      }
      return null;
    }
    if (PARTS.includes(key)) return parts[key]?.before?.(content, api) ?? null;
    return null;
  }

  function after(content, key) {
    if (PARTS.includes(key)) run(() => parts[key]?.after?.(content));
    if (key === 'themes') {
      const fields = [...content.querySelectorAll(THEME)];
      const rest = fields.filter((f) => !f.hasAttribute('data-se-active'));
      fields.filter((f) => f.hasAttribute('data-se-active')).forEach((f) => setAttr(f, 'data-se-c', 'f l'));
      rest.forEach((f, i) =>
        setAttr(f, 'data-se-c', [i === 0 && 'f', i === rest.length - 1 && 'l'].filter(Boolean).join(' ') || 'm')
      );
    }
    schedule();
  }

  // Every realm Millennium's code might live in. Walking the fibers is costly and ffi() asks on
  // each call (the Quick CSS poll every 3 s), so the list is kept for 5 s unless a window closed.
  let realmCache = null;

  function realms() {
    const now = performance.now();
    if (realmCache && now < realmCache.until && realmCache.list.every((w) => !run(() => w.closed))) {
      return realmCache.list;
    }
    const out = [];
    const add = (w) => {
      if (w && !out.includes(w)) out.push(w);
    };
    const page = document.querySelector('.MillenniumSettings');
    for (const el of [watchToggle(), page?.querySelector('.DialogButton'), page]) {
      const fn = el && SE.fromProps(el, 12, (p) => Object.values(p).find((v) => typeof v === 'function') || null);
      if (fn) {
        try {
          add(fn.constructor('return globalThis')());
        } catch {}
      }
    }
    for (const el of [watchToggle(), page]) {
      for (let f = SE.fiber(el), n = 0; f && n < 4000; f = f.return, n++) {
        if ((f.tag === 3 || f.tag === 4) && f.stateNode?.containerInfo) {
          add(run(() => f.stateNode.containerInfo.ownerDocument?.defaultView));
        }
      }
    }
    for (const w of run(() => bridge()?.windows?.()) || []) add(w);
    const queue = [...out, window, ...SE.owners()];
    const seen = [];
    while (queue.length && seen.length < 16) {
      const w = queue.shift();
      if (!w || seen.includes(w)) continue;
      seen.push(w);
      add(w);
      for (const k of ['opener', 'parent', 'top']) {
        try {
          const n = w[k];
          if (n && n !== w) queue.push(n);
        } catch {}
      }
    }
    realmCache = { list: out, until: now + 5000 };
    return out;
  }

  // The main window's millennium-window.js hands each Millennium popup this bridge.
  const bridge = () => SE.global('__seMillBridge');

  const BINDER = 'MILLENNIUM_PRIVATE_INTERNAL_FOREIGN_FUNCTION_INTERFACE_DO_NOT_USE';

  function standIn(w) {
    return {
      pending: new Map(),
      next: 900000,
      call(type, plugin, method, argumentList) {
        return new Promise((resolve, reject) => {
          const id = this.next++;
          this.pending.set(id, { resolve, reject });
          w.__private_millennium_ffi_do_not_use__(
            JSON.stringify({
              id: type,
              call_id: id,
              caller: '',
              data: { pluginName: plugin, methodName: method, argumentList },
            })
          );
          setTimeout(() => {
            if (this.pending.delete(id)) reject(new Error('No answer from Millennium'));
          }, 6000);
        });
      },
      __handleResponse(id, response) {
        const p = this.pending.get(id);
        if (!p) return;
        this.pending.delete(id);
        if (response?.success) p.resolve(response.returnJson ?? null);
        else p.reject(new Error(response?.returnJson || 'Millennium error'));
      },
    };
  }

  const timeout = (promise, ms = 6000) => {
    let timer = 0;
    const expiry = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('No answer from Millennium')), ms);
    });
    return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
  };

  async function ffi(name, args = []) {
    const tries = [];
    const wins = [window, ...realms()];
    const real = (o) => {
      const b = run(() => o[BINDER]);
      return b && typeof b.call === 'function' && typeof b.__handleResponse === 'function' && b !== o.__seFfiStandIn;
    };
    const bound = (o) => typeof run(() => o.__private_millennium_ffi_do_not_use__) === 'function';

    for (const o of wins) {
      if (bound(o) && real(o)) {
        tries.push(() => o[BINDER].call(0, 'core', name, args, undefined, true));
      }
    }
    const b = bridge();
    if (b) tries.push(() => b.ffi(name, args));
    for (const o of wins) {
      if (bound(o) && !real(o)) {
        tries.push(() => {
          const s = o.__seFfiStandIn || (o.__seFfiStandIn = standIn(o));
          if (!o[BINDER]) o[BINDER] = s;
          return s.call(0, 'core', name, args);
        });
      }
    }

    let error = null;
    for (const t of tries) {
      try {
        return await timeout(Promise.resolve(t()));
      } catch (e) {
        error = e;
      }
    }
    if (!ffi.told) {
      ffi.told = true;
      console.warn('[Steam Enhanced] Quick CSS:', name, 'failed', error);
    }
    throw error || new Error('Millennium is not reachable from this window');
  }

  function core() {
    const c = run(() => bridge()?.core());
    if (c) return c;
    for (const o of realms()) {
      const found = run(() => o.PLUGIN_LIST?.core);
      if (found) return found;
    }
    return null;
  }

  function reapply() {
    const fn = core()?.OnQuickCssFileChanged;
    if (typeof fn === 'function') run(fn);
  }

  function highlight(css) {
    let out = '';
    let depth = 0;
    let inValue = false;
    const re = /\/\*[\s\S]*?(?:\*\/|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|[{}:;]|[^{}:;"'/]+|\//g;
    for (const [t] of css.matchAll(re)) {
      if (t.startsWith('/*')) {
        out += `<span class="c">${esc(t)}</span>`;
      } else if (t[0] === '"' || t[0] === "'") {
        out += `<span class="v">${esc(t)}</span>`;
      } else if (t === '{') {
        depth++;
        inValue = false;
        out += '<span class="u">{</span>';
      } else if (t === '}') {
        depth = Math.max(0, depth - 1);
        inValue = false;
        out += '<span class="u">}</span>';
      } else if (t === ';') {
        inValue = false;
        out += '<span class="u">;</span>';
      } else if (t === ':' && depth > 0 && !inValue) {
        inValue = true;
        out += '<span class="u">:</span>';
      } else {
        out += `<span class="${depth === 0 || t === ':' ? 's' : inValue ? 'v' : 'p'}">${esc(t)}</span>`;
      }
    }
    return `${out}\n`;
  }

  const LINE = 22;
  const PAD = 12;
  let qc = null;

  function buildEditor() {
    const root = make('div', 'se-qc');
    root.innerHTML =
      '<div class="se-qc-bar"><div class="se-qc-name"><span class="se-qc-file">quick.css</span><span class="se-qc-state" data-state="loading"><i></i><span>Loading…</span></span></div>' +
      '<span class="se-qc-tools"><span class="se-qc-watch">Watch the file<button type="button" class="se-msw" role="switch" aria-checked="false" aria-label="Watch the file for edits made in another editor"></button></span>' +
      `<span class="se-qc-sep" aria-hidden="true"></span><button type="button" class="se-mbtn" data-size="icon" data-tone="ghost" data-act="copy" aria-label="Copy all" title="Copy all">${parts.icon?.('copy') || ''}</button></span></div>` +
      '<div class="se-qc-main"><div class="se-qc-cur" aria-hidden="true"></div>' +
      '<div class="se-qc-empty" aria-hidden="true" hidden><b>Nothing here yet</b>' +
      '<span>Type CSS and it applies to every Steam window as you go.</span></div>' +
      '<pre class="se-qc-gutter" aria-hidden="true"></pre>' +
      '<div class="se-qc-code"><pre class="se-qc-hl" aria-hidden="true"></pre><textarea class="se-qc-ta" spellcheck="false" wrap="off" autocomplete="off" aria-label="Quick CSS"></textarea></div></div>' +
      '<div class="se-qc-foot"><span data-k="rules"></span><span data-k="bytes"></span><span class="se-qc-pos"></span><span>CSS</span></div>';

    const ta = root.querySelector('textarea');
    const hl = root.querySelector('.se-qc-hl');
    const gutter = root.querySelector('.se-qc-gutter');
    const cur = root.querySelector('.se-qc-cur');
    const state = (s, words) => {
      const el = root.querySelector('.se-qc-state');
      el.dataset.state = s;
      el.lastChild.textContent = words;
    };

    let lines = 0;
    let saveTimer = 0;
    let saved = '';

    const caret = () => {
      const before = ta.value.slice(0, ta.selectionStart).split('\n');
      const line = before.length;
      const col = before[before.length - 1].length + 1;
      root.querySelector('.se-qc-pos').textContent = `Ln ${line}, Col ${col}`;
      cur.style.transform = `translateY(${PAD + (line - 1) * LINE - ta.scrollTop}px)`;
      setAttr(cur, 'hidden', document.activeElement === ta ? null : '');
    };

    const empty = root.querySelector('.se-qc-empty');
    const paint = () => {
      const v = ta.value;
      // An empty file says so in the editor; the note goes as soon as there's anything in it.
      setAttr(empty, 'hidden', v.trim() || !root.dataset.loaded ? '' : null);
      hl.innerHTML = highlight(v);
      // Line numbers only once there's something to number (an empty file has none).
      const n = v ? v.split('\n').length : 0;
      if (n !== lines) {
        lines = n;
        gutter.textContent = n ? `${Array.from({ length: n }, (_, i) => i + 1).join('\n')}\n` : '';
      }
      const rules = (v.match(/[^{}]*{[^}]*}/g) || []).length;
      const bytes = new TextEncoder().encode(v).length;
      root.querySelector('[data-k="rules"]').textContent = `${rules} ${rules === 1 ? 'rule' : 'rules'}`;
      root.querySelector('[data-k="bytes"]').textContent =
        bytes < 1024 ? `${bytes} bytes` : `${(bytes / 1024).toFixed(1)} KB`;
      caret();
    };

    const scroll = () => {
      hl.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
      gutter.style.transform = `translateY(${-ta.scrollTop}px)`;
      caret();
    };

    const save = () => {
      const v = ta.value;
      ffi('Core_SaveQuickCss', [v])
        .then(() => {
          saved = v;
          reapply();
          if (ta.value === v) state('saved', 'Saved · applied');
        })
        .catch(() => state('error', 'Couldn’t save'));
    };

    const load = () =>
      ffi('Core_LoadQuickCss')
        .then((v) => {
          if (typeof v !== 'string') v = v == null ? '' : String(v);
          if (ta.value !== saved && root.dataset.loaded) return;
          if (v !== ta.value) {
            const pos = ta.selectionStart;
            ta.value = v;
            ta.selectionStart = ta.selectionEnd = Math.min(pos, v.length);
            paint();
          }
          saved = v;
          const first = !root.dataset.loaded;
          root.dataset.loaded = '1';
          if (first) paint(); // the empty-file note waits for the first load
          ta.readOnly = false;
          state('saved', 'Saved · applied');
        })
        .catch(() => {
          let v = core()?.quickCss ?? document.getElementById('MillenniumQuickCss')?.textContent;
          if (!v) {
            v =
              '/* Steam Enhanced couldn’t reach Millennium from this window.\n   Windows checked:\n' +
              realms()
                .map(
                  (o) =>
                    '   · ' +
                    (run(
                      () =>
                        `${o.document?.title || o.location?.pathname || '?'} — binder ${Boolean(o[BINDER])}, binding ${typeof o.__private_millennium_ffi_do_not_use__}, core ${Boolean(o.PLUGIN_LIST?.core)}`
                    ) || '?')
                )
                .join('\n') +
              `\n   Bridge from the main window: ${Boolean(bridge())}\n*/\n`;
          }
          if (!root.dataset.loaded) {
            ta.value = v;
            saved = v;
            paint();
            root.dataset.loaded = '1';
          }
          ta.readOnly = true;
          state('error', 'Can’t reach Millennium from this window');
        });

    ta.addEventListener('input', () => {
      paint();
      state('saving', 'Saving…');
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 300);
    });
    ta.addEventListener('scroll', scroll, { passive: true });
    for (const ev of ['keyup', 'click', 'focus', 'blur', 'select']) {
      ta.addEventListener(ev, caret);
    }
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        document.execCommand('insertText', false, '  ');
      } else if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
        const start = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1;
        const line = ta.value.slice(start, ta.selectionStart);
        const indent = (/^\s*/.exec(line)?.[0] || '') + (/\{\s*$/.test(line) ? '  ' : '');
        if (indent) {
          e.preventDefault();
          document.execCommand('insertText', false, `\n${indent}`);
        }
      }
    });

    const sw = root.querySelector('.se-msw');
    sw.addEventListener('click', () => watchToggle()?.click());
    const copy = root.querySelector('[data-act="copy"]');
    copy.addEventListener('click', () => {
      Promise.resolve(run(() => SE.copy(ta.value))).then(() => {
        copy.innerHTML = parts.icon?.('done') || '';
        copy.title = 'Copied';
        setTimeout(() => {
          copy.innerHTML = parts.icon?.('copy') || '';
          copy.title = 'Copy all';
        }, 2000);
      });
    });
    // Edits made in another editor only apply while Millennium watches the file, so only then
    // is there anything new to read back.
    const poll = SE.poll(
      () => {
        if (document.activeElement !== ta && ta.value === saved) load();
      },
      3000,
      { active: () => root.isConnected && watching() }
    );
    const onFocus = () => {
      if (root.isConnected) load();
    };
    addEventListener('focus', onFocus);
    load();

    return {
      root,
      ta,
      sw,
      paint,
      scroll,
      destroy() {
        poll?.disconnect?.();
        clearTimeout(saveTimer);
        removeEventListener('focus', onFocus);
      },
    };
  }

  const watchToggle = () =>
    document.querySelector(`${CONTENT}[data-se-mill-page="quickcss"] .DialogBody .${C.Toggle}`);
  const watching = () => Boolean(watchToggle()?.classList.contains(C.On));

  function quickCss(content) {
    const body = content.querySelector('.DialogBody');
    if (!body) return;
    setAttr(body, 'data-se-qc', '');
    if (!qc || !qc.root.isConnected) {
      qc?.destroy();
      qc = buildEditor();
    }
    if (qc.root.parentElement !== body) body.append(qc.root);

    const toggle = watchToggle();
    const on = watching();
    setAttr(qc.sw, 'aria-checked', on ? 'true' : 'false');
    setAttr(qc.sw, 'data-on', on ? '' : null);
    setAttr(qc.sw.parentElement, 'hidden', toggle ? null : '');
    setAttr(qc.root.querySelector('.se-qc-sep'), 'hidden', toggle ? null : '');
    fillHeight(qc.root, content, '--se-fill-h', 260);
  }

  // Sizes `el` (through the custom property `name`) to reach the page's bottom padding, minus
  // `reserve` px for what sits under it. Runs in the rAF pass, after the dialog's writes.
  function fillHeight(el, content, name, min, reserve = 0) {
    const box = content.getBoundingClientRect();
    const foot =
      Math.min(box.top + content.clientTop + content.clientHeight, innerHeight) -
      (parseFloat(getComputedStyle(content).paddingBottom) || 0);
    const h = Math.max(min, Math.floor(foot - reserve - el.getBoundingClientRect().top + (content.scrollTop || 0)));
    SE.cssVar(el, name, `${h}px`);
  }

  /*
   * General: a status card (Millennium's version, update channel, Check for updates), with the
   * Updates section as its strip and About folded into it; then Checks & alerts (On startup with
   * Notifications under it), Themes, and Network in one row. Millennium's sections stay where
   * React put them: a grid places them, attributes title them, so its controls keep working.
   * Sections are found by their English headers; any missing, and the page keeps its old layout.
   */
  const GENERAL = [
    ['start', /^on startup$/i],
    ['upd', /^updates?$/i],
    ['notif', /^notifications?$/i],
    ['themes', /^themes?$/i],
    ['net', /^network$/i],
    ['about', /^about$/i],
  ];
  const PANELS = {
    start: ['Checks & alerts', 'What Millennium looks for, and when it tells you'],
    themes: ['Themes', 'What a theme is allowed to change'],
    net: ['Network', 'Route Millennium through a proxy: HTTP, HTTPS or SOCKS5. Empty: a direct connection.'],
  };
  const PAGE_ITEM = `.${C.PagedSettingsDialog_PageList} .${C.PagedSettingsDialog_PageListItem}`;
  let checkOnUpdates = false;

  // A row's label, and its value: a dropdown's choice, else the text after the label (About).
  function fieldsOf(section) {
    return [...section.querySelectorAll(`.${C.Field}`)].map((f) => {
      const label = text(f.querySelector(`.${C.FieldLabel}`));
      const dd = f.querySelector('.DialogDropDown');
      const value = dd ? text(dd) : text(f).slice(label.length).trim();
      return { label, value };
    });
  }

  const valueOf = (fields, re) => fields.find((f) => re.test(f.label))?.value || '';
  const dayOf = (stamp) => stamp.split(',')[0].trim();

  function heroOf(host) {
    let hero = host.querySelector(':scope > .se-mgen-hero');
    if (!hero) {
      hero = make(
        'article',
        'se-mgen-hero',
        '<span class="se-mgen-mark" aria-hidden="true"></span><div class="se-mgen-text"><b></b><span></span></div>' +
          '<button type="button" class="se-mgen-check">Check for updates</button>'
      );
      hero.querySelector('.se-mgen-check').addEventListener('click', () => {
        const item = [...document.querySelectorAll(PAGE_ITEM)].find((i) => /^updates$/i.test(text(i)));
        if (!item) return;
        checkOnUpdates = true;
        item.click();
      });
    }
    if (host.firstElementChild !== hero) host.prepend(hero);
    return hero;
  }

  function general(content) {
    const found = {};
    for (const s of content.querySelectorAll('.DialogBody .DialogControlsSection')) {
      const t = text(s.querySelector('.DialogControlsSectionHeader') || s.firstElementChild);
      const key = GENERAL.find(([, re]) => re.test(t))?.[0];
      if (key && !found[key]) found[key] = s;
    }
    const host = found.start?.parentElement;
    const ok =
      Boolean(host && found.upd && found.themes && found.about) &&
      Object.values(found).every((s) => s.parentElement === host);
    if (!ok) {
      content.querySelector('.se-mgen-hero')?.remove();
      for (const el of content.querySelectorAll('[data-se-mgen], [data-se-mgsec]')) {
        el.removeAttribute('data-se-mgen');
        el.removeAttribute('data-se-mgsec');
      }
      return;
    }

    setAttr(host, 'data-se-mgen', '');
    for (const [key, s] of Object.entries(found)) {
      setAttr(s, 'data-se-mgsec', key);
      const head = s.querySelector('.DialogControlsSectionHeader') || s.firstElementChild;
      setAttr(head, 'data-se-mgtitle', PANELS[key]?.[0] || null);
      setAttr(head, 'data-se-mgsub', PANELS[key]?.[1] || null);
    }

    // The strip's two rows: short names over their dropdowns, Channel first
    for (const f of found.upd.querySelectorAll(`.${C.Field}`)) {
      const label = f.querySelector(`.${C.FieldLabel}`);
      const name = text(label);
      const kind = /channel/i.test(name) ? 'channel' : /available|update for/i.test(name) ? 'when' : null;
      setAttr(f, 'data-se-mgfield', kind);
      setAttr(label, 'data-se-mglabel', kind === 'channel' ? 'Channel' : kind === 'when' ? 'When an update is ready' : null);
    }

    // Network's three rows, so the stylesheet can lay them out as one
    if (found.net) {
      const NET = [['proxy', /url|proxy$/i], ['user', /user/i], ['pass', /pass/i]];
      for (const f of found.net.querySelectorAll(`.${C.Field}`)) {
        const name = text(f.querySelector(`.${C.FieldLabel}`)) || text(f);
        setAttr(f, 'data-se-mgfield', NET.find(([, re]) => re.test(name))?.[0] || null);
      }
    }

    const about = fieldsOf(found.about);
    const upd = fieldsOf(found.upd);
    const version = valueOf(about, /millennium version/i) || about[0]?.value || '';
    const channel = valueOf(upd, /channel/i);
    const when = valueOf(upd, /available|update for/i);
    const builds = [
      [valueOf(about, /client api/i) && `Client API ${valueOf(about, /client api/i)}`, valueOf(about, /browser api/i) && `Browser API ${valueOf(about, /browser api/i)}`],
      [valueOf(about, /millennium build/i) && `Built ${dayOf(valueOf(about, /millennium build/i))}`, valueOf(about, /loader build/i) && `Loader ${dayOf(valueOf(about, /loader build/i))}`],
    ]
      .map((line) => line.filter(Boolean).join(' · '))
      .filter(Boolean)
      .join('\n');
    setAttr(found.upd, 'data-se-mgbuild', builds || null);

    const hero = heroOf(host);
    const title = hero.querySelector('.se-mgen-text b');
    const status = hero.querySelector('.se-mgen-text span');
    const line = [channel && `${channel} channel`, when].filter(Boolean).join(' · ');
    if (title.textContent !== `Millennium ${version}`.trim()) title.textContent = `Millennium ${version}`.trim();
    if (status.textContent !== line) status.textContent = line;
  }

  // What each page adds, removed when the window moves to another page (the parts say theirs).
  const PAGE_OWN = {
    themes: '.se-mtool[data-for="themes"]',
    quickcss: '.se-qc',
    general: '.se-mgen-hero',
  };
  const PAGE_MARKS = {
    themes: ['data-se-active', 'data-se-initial', 'data-se-hide', 'data-se-thumb'],
    quickcss: ['data-se-qc'],
    general: ['data-se-mgen', 'data-se-mgsec', 'data-se-mgtitle', 'data-se-mgsub', 'data-se-mgbuild', 'data-se-mgfield', 'data-se-mglabel'],
  };
  const PAGE_VARS = { themes: ['--se-thumb'] };
  const ownOf = (key) => PAGE_OWN[key] || parts[key]?.own || '';
  const marksOf = (key) => PAGE_MARKS[key] || parts[key]?.marks || [];
  const varsOf = (key) => PAGE_VARS[key] || parts[key]?.vars || [];
  const allMarks = () => [...new Set([...Object.values(PAGE_MARKS).flat(), ...PARTS.flatMap(marksOf)])];
  const allVars = () => [...new Set([...Object.values(PAGE_VARS).flat(), ...PARTS.flatMap(varsOf)])];

  // data-se-lock sits on the page's scrolling ancestors, which may be outside .MillenniumSettings.
  function unlock() {
    document.querySelectorAll('[data-se-lock]').forEach((el) => el.removeAttribute('data-se-lock'));
  }

  function leave(key, root) {
    if (!key) return;
    if (key === 'quickcss' && qc) {
      qc.destroy();
      qc = null;
    }
    if (key === 'logs') unlock();
    if (key === 'updates') checkOnUpdates = false;
    run(() => parts[key]?.reset?.());
    const scope = root || document;
    const own = ownOf(key);
    if (own) scope.querySelectorAll(own).forEach((el) => el.remove());
    const marks = marksOf(key);
    const vars = varsOf(key);
    if (!marks.length) return;
    for (const el of scope.querySelectorAll(marks.map((m) => `[${m}]`).join(','))) {
      for (const m of marks) el.removeAttribute(m);
      for (const v of vars) el.style.removeProperty(v);
    }
  }

  // Logs fills the window: its page and the scrolling boxes around it stay put (the log scrolls).
  function lockScroll(content) {
    for (let p = content; p && p !== document.body; p = p.parentElement) {
      if (p.hasAttribute('data-se-lock') || /(auto|scroll)/.test(getComputedStyle(p).overflowY)) {
        if (p.scrollTop) p.scrollTop = 0;
        setAttr(p, 'data-se-lock', '');
      }
    }
  }

  let frame = 0;
  let lastKey = null;

  function update() {
    frame = 0;
    const content = document.querySelector(`${ROOT} ${CONTENT}[data-se-mill-page]`);
    const key = content?.getAttribute('data-se-mill-page') || null;
    if (key !== lastKey) {
      leave(lastKey, content?.closest(ROOT));
      lastKey = key;
      themePage = 0;
    }
    if (!content) return;
    try {
      if (key === 'logs') lockScroll(content);
      if (key === 'updates') {
        if (parts.updates?.step(content, { check: checkOnUpdates })) checkOnUpdates = false;
      } else {
        ({ themes, quickcss: quickCss, general }[key] || parts[key]?.step)?.(content);
      }
      parts[key]?.layout?.(content);
    } catch (e) {
      console.warn('[Steam Enhanced] Millennium page:', key, e);
    }
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  Object.assign(parts, { make, text, core, fillHeight, schedule });

  // Millennium's own Quick CSS editor window: tag <html> instead of an html:has() rule that every
  // window would evaluate on every change. A live collection makes the check a length read.
  const editors = document.getElementsByClassName('MillenniumQuickCss_CodeEditor');
  const tagEditor = () => setAttr(document.documentElement, 'data-se-qce', editors.length ? '' : null);
  let editorWatch = null;

  function start() {
    tagEditor();
    // client/settings/dialog/ only drives this module while a Millennium page is up; this watch notices it
    // going away so leave() resets filters and stops the Quick CSS poll.
    editorWatch = SE.watch(() => {
      tagEditor();
      if (lastKey && !document.querySelector(`${ROOT} ${CONTENT}[data-se-mill-page]`)) schedule();
    }, { throttle: 250 });
    addEventListener('resize', schedule);
    schedule();
    window.__seSettings?.refresh?.(); // in case the dialog's first pass ran before the hooks existed
  }

  window.__seMillPages = {
    hooks: { before, after },
    destroy() {
      editorWatch?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      qc?.destroy();
      qc = null;
      document.querySelectorAll(`[${OWN}="mill"]`).forEach((el) => el.remove());
      const marks = allMarks();
      const vars = allVars();
      const sel = marks.map((m) => `[${m}]`).join(',');
      for (const root of document.querySelectorAll(ROOT)) {
        for (const el of root.querySelectorAll(sel)) {
          for (const m of marks) el.removeAttribute(m);
          for (const v of vars) el.style.removeProperty(v);
        }
      }
      unlock();
      document.documentElement.removeAttribute('data-se-qce');
      removeEventListener('resize', schedule);
      delete window.__seMillPages;
    },
  };

  if (document.body) {
    start();
  } else {
    addEventListener('DOMContentLoaded', start, { once: true });
  }
})(window.__se);
