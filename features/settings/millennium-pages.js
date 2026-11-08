/*
 * Millennium Settings page enhancements.
 *
 * Runs in both Millennium Settings surfaces alongside settings.js (which tags
 * [data-se-mill-page] on the active page content container):
 * - Themes: adds an installed count + search bar, applies skin.json header_image
 *   previews, and exposes a "Theme settings" shortcut on the active theme.
 * - Plugins: adds an All / On / Off segmented filter and search input.
 * - Quick CSS: mounts an inline syntax-highlighted CSS editor wired to
 *   Millennium's Core_LoadQuickCss / Core_SaveQuickCss FFI bindings.
 * - Logs: mounts a source selector sidebar and log-level filter pills.
 * - Updates: formats ISO release timestamps into localized dates.
 * - General: tags the About section for side-by-side card layout.
 */
(window.__se
  ? (init) => init(window.__se)
  : (init) => addEventListener('se-core', () => init(window.__se), { once: true })
)((SE) => {
  const { C, run, attr: setAttr } = SE;
  window.__steamEnhancedMillPages?.destroy();

  const CONTENT = `.${C.PagedSettingsDialog_PageContent}`;
  const made = new Set();
  const make = (tag, cls, html) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (html) el.innerHTML = html;
    made.add(el);
    return el;
  };
  const text = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

  const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>';
  const ICON_SLIDERS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>';
  const ICON_WINDOW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/></svg>';

  function filterBox(placeholder, onInput) {
    const box = make(
      'label',
      'se-mfilter',
      `${ICON_SEARCH}<input type="search" placeholder="${placeholder}" aria-label="${placeholder}">`
    );
    const input = box.querySelector('input');
    input.addEventListener('input', () => onInput(input.value));
    return box;
  }

  const matches = (el, q, nameSel) =>
    !q || text(el.querySelector(nameSel) || el).toLowerCase().includes(q.trim().toLowerCase());

  const THEME = '.MillenniumThemes_ThemeItem';
  let themeQuery = '';

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
        bar.innerHTML = '<span class="se-mtool-label"></span>';
        bar.append(
          filterBox('Filter themes', (q) => {
            themeQuery = q;
            applyThemeFilter(content);
          })
        );
      }
      if (bar.nextElementSibling !== rest[0]) rest[0].before(bar);
      const label = bar.querySelector('.se-mtool-label');
      const words = `Installed · ${fields.length}`;
      if (label.textContent !== words) label.textContent = words;
    }

    applyThemeFilter(content);

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

      let ts = f.querySelector('.se-theme-settings');
      const configurable = f.hasAttribute('data-se-active') && Boolean(data.Conditions || data.RootColors);
      if (!configurable) {
        ts?.remove();
        continue;
      }
      const first = f.querySelector('.DialogButton:not(.MillenniumIconButton)');
      if (!first) continue;
      if (!ts) {
        ts = make('button', 'DialogButton se-theme-settings', `${ICON_SLIDERS}<span>Theme settings</span>`);
        ts.type = 'button';
        ts.addEventListener('click', (e) => {
          e.stopPropagation();
          openManager({ theme: data.name });
        });
      }
      if (ts.nextElementSibling !== first) first.before(ts);
    }
  }

  function applyThemeFilter(content) {
    content.querySelectorAll(`${THEME}:not([data-se-active])`).forEach((f) => {
      setAttr(f, 'data-se-hide', matches(f, themeQuery, '.MillenniumThemes_ThemeLabel') ? null : '');
    });
  }

  function openManager(target) {
    const host = window.__seMillenniumWindow ?? bridge();
    run(() => host?.openLibraryManager?.(target));
  }

  const PLUGIN = '.MillenniumPlugins_PluginField';
  let pluginQuery = '';
  let pluginMode = 'all';

  function plugins(content) {
    const fields = [...content.querySelectorAll(PLUGIN)];
    let bar = content.querySelector('.se-mtool[data-for="plugins"]');
    if (!fields.length) {
      bar?.remove();
      return;
    }
    if (!bar) {
      bar = make('div', 'se-mtool');
      bar.dataset.for = 'plugins';
      bar.innerHTML =
        '<span class="se-mseg" role="group" aria-label="Show">' +
        ['all', 'on', 'off']
          .map((m) => `<button type="button" data-mode="${m}">${m === 'all' ? 'All' : m === 'on' ? 'On' : 'Off'} <b></b></button>`)
          .join('') +
        '</span>';
      bar.querySelector('.se-mseg').addEventListener('click', (e) => {
        const b = e.target.closest('[data-mode]');
        if (b) {
          pluginMode = b.dataset.mode;
          applyPluginFilter(content);
        }
      });
      bar.append(
        filterBox('Filter plugins', (q) => {
          pluginQuery = q;
          applyPluginFilter(content);
        })
      );
    }
    if (bar.nextElementSibling !== fields[0]) fields[0].before(bar);
    const on = fields.filter((f) => f.getAttribute('data-se-on') === 'yes').length;
    const counts = { all: fields.length, on, off: fields.length - on };
    bar.querySelectorAll('[data-mode]').forEach((b) => {
      const n = String(counts[b.dataset.mode]);
      if (b.lastChild.textContent !== n) b.lastChild.textContent = n;
    });
    applyPluginFilter(content);
  }

  function applyPluginFilter(content) {
    content.querySelectorAll('.se-mtool[data-for="plugins"] [data-mode]').forEach((b) => {
      setAttr(b, 'data-on', b.dataset.mode === pluginMode ? '' : null);
      setAttr(b, 'aria-pressed', b.dataset.mode === pluginMode ? 'true' : 'false');
    });
    content.querySelectorAll(PLUGIN).forEach((f) => {
      const state = f.getAttribute('data-se-on');
      const show =
        matches(f, pluginQuery, '.MillenniumPlugins_PluginLabel') &&
        (pluginMode === 'all' || (pluginMode === 'on' ? state === 'yes' : state === 'no'));
      setAttr(f, 'data-se-hide', show ? null : '');
    });
  }

  function realms() {
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
        } catch (_) {}
      }
    }
    for (const el of [watchToggle(), page]) {
      for (let f = SE.fiber(el), n = 0; f && n < 4000; f = f.return, n++) {
        if ((f.tag === 3 || f.tag === 4) && f.stateNode?.containerInfo) {
          add(run(() => f.stateNode.containerInfo.ownerDocument?.defaultView));
        }
      }
    }
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
        } catch (_) {}
      }
    }
    return out;
  }

  function bridge() {
    for (const w of [window, ...SE.owners()]) {
      try {
        if (w.__seMillBridge) return w.__seMillBridge;
      } catch (_) {}
    }
    return null;
  }

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

  const timeout = (promise, ms = 6000) =>
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('No answer from Millennium')), ms)),
    ]);

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

  const escHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

  function highlight(css) {
    let out = '';
    let depth = 0;
    let inValue = false;
    const re = /\/\*[\s\S]*?(?:\*\/|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|[{}:;]|[^{}:;"'/]+|\//g;
    for (const [t] of css.matchAll(re)) {
      if (t.startsWith('/*')) {
        out += `<span class="c">${escHtml(t)}</span>`;
      } else if (t[0] === '"' || t[0] === "'") {
        out += `<span class="v">${escHtml(t)}</span>`;
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
        out += `<span class="${depth === 0 || t === ':' ? 's' : inValue ? 'v' : 'p'}">${escHtml(t)}</span>`;
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
      '<div class="se-qc-bar"><span class="se-qc-file">quick.css</span><span class="se-qc-state" data-state="loading"><i></i><span>Loading…</span></span>' +
      '<span class="se-qc-tools"><span class="se-qc-watch">Watch the file<button type="button" class="se-msw" role="switch" aria-checked="false" aria-label="Watch the file for edits made in another editor"></button></span></span></div>' +
      '<div class="se-qc-main"><div class="se-qc-cur" aria-hidden="true"></div><pre class="se-qc-gutter" aria-hidden="true"></pre>' +
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

    const paint = () => {
      const v = ta.value;
      hl.innerHTML = highlight(v);
      const n = v.split('\n').length;
      if (n !== lines) {
        lines = n;
        gutter.textContent = `${Array.from({ length: n }, (_, i) => i + 1).join('\n')}\n`;
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
          root.dataset.loaded = '1';
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
          state('error', 'Can’t save from here: use Open in a window');
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
    const poll = SE.poll(
      () => {
        if (document.activeElement !== ta && ta.value === saved) load();
      },
      3000,
      { active: () => root.isConnected }
    );
    addEventListener('focus', load);
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
        removeEventListener('focus', load);
      },
    };
  }

  const watchToggle = () =>
    document.querySelector(`${CONTENT}[data-se-mill-page="quickcss"] .DialogBody .${C.Toggle}`);
  const openWindowButton = () =>
    [...document.querySelectorAll(`${CONTENT}[data-se-mill-page="quickcss"] .DialogBody .DialogButton:not(.se-qc-open)`)].pop();

  function quickCss(content) {
    const body = content.querySelector('.DialogBody');
    if (!body) return;
    setAttr(body, 'data-se-qc', '');
    if (!qc || !qc.root.isConnected) {
      qc?.destroy();
      qc = buildEditor();
    }
    if (qc.root.parentElement !== body) body.append(qc.root);

    let open = content.querySelector('.se-qc-open');
    if (!open) {
      open = make('button', 'DialogButton se-qc-open se-mill-act', `${ICON_WINDOW}<span>Open in a window</span>`);
      open.type = 'button';
      open.addEventListener('click', () => openWindowButton()?.click());
    }
    if (open.parentElement !== body) body.append(open);

    const toggle = watchToggle();
    const on = Boolean(toggle?.classList.contains(C.On));
    setAttr(qc.sw, 'aria-checked', on ? 'true' : 'false');
    setAttr(qc.sw, 'data-on', on ? '' : null);
    setAttr(qc.sw.parentElement, 'hidden', toggle ? null : '');
    fill(qc.root, content);
  }

  function fill(el, content) {
    const box = content.getBoundingClientRect();
    const foot =
      Math.min(box.top + content.clientTop + content.clientHeight, innerHeight) -
      (parseFloat(getComputedStyle(content).paddingBottom) || 0);
    const h = `${Math.max(260, Math.floor(foot - el.getBoundingClientRect().top + (content.scrollTop || 0)))}px`;
    if (el.style.getPropertyValue('--se-fill-h') !== h) {
      el.style.setProperty('--se-fill-h', h);
    }
  }

  function logViewer(content) {
    const el = content.querySelector('.MillenniumLogs_TextContainer, .MillenniumLogsSection, .MillenniumLogs_Text');
    for (let f = SE.fiber(el); f; f = f.return) {
      const st = f.stateNode?.state;
      if (st && typeof st === 'object' && 'logData' in st && 'selectedLog' in st) {
        return f.stateNode;
      }
    }
    return null;
  }

  let logLevel = 'all';

  function logs(content) {
    const viewer = logViewer(content);
    const st = viewer?.state;
    if (!st?.logData?.length) return;
    const body = content.querySelector('.DialogBody');
    if (!body) return;

    const box = content.querySelector('.MillenniumLogs_TextContainer');
    let empty = content.querySelector('.se-logs-empty');
    if (st.selectedLog) {
      empty?.remove();
    } else if (!empty) {
      empty = make(
        'div',
        'se-logs-empty',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8.5L19 7.5V21H6zM14.5 3v4.5H19M9 12h7M9 16h4.5"/></svg><b>Pick a source</b><span>Its log opens here.</span>'
      );
    }

    for (let p = content; p && p !== document.body; p = p.parentElement) {
      if (p.hasAttribute('data-se-lock') || /(auto|scroll)/.test(getComputedStyle(p).overflowY)) {
        if (p.scrollTop) p.scrollTop = 0;
        setAttr(p, 'data-se-lock', '');
      }
    }

    const header = content.querySelector('.DialogHeader');
    if (header && !header.querySelector('*') && header.textContent !== 'Logs') {
      header.textContent = 'Logs';
    }

    let list = content.querySelector('.se-logs-src');
    if (!list) {
      list = make('div', 'se-logs-src');
      list.setAttribute('role', 'list');
      list.setAttribute('aria-label', 'Sources');
      list.addEventListener('click', (e) => {
        const b = e.target.closest('[data-i]');
        const v = logViewer(content);
        const log = v?.state?.logData?.[Number(b?.dataset.i)];
        if (!log) return;
        const search = content.querySelector('.MillenniumLogs_NavContainer input');
        if (search) search.value = '';
        v.setState({ selectedLog: log, searchedLogs: log.logs, searchQuery: '' });
      });
    }
    if (body.firstElementChild !== list) body.prepend(list);
    if (!st.selectedLog && list.nextElementSibling !== empty) list.after(empty);

    const selected = st.selectedLog?.name ?? '';
    const sig = `${st.logData.map((l) => l.name).join('|')}#${selected}`;
    if (list.dataset.sig !== sig) {
      list.dataset.sig = sig;
      list.innerHTML =
        '<span class="se-logs-head">Sources</span>' +
        st.logData
          .map((l, i) => {
            const errors = (l.logs || []).filter((x) => x.level === 2).length;
            const warnings = (l.logs || []).filter((x) => x.level === 1).length;
            const badge = errors
              ? `<b data-k="error" aria-label="${errors} errors">${errors}</b>`
              : warnings
                ? `<b data-k="warning" aria-label="${warnings} warnings">${warnings}</b>`
                : '';
            return `<button type="button" role="listitem" data-i="${i}"${selected && l.name === selected ? ' data-on aria-current="true"' : ''}><span>${SE.esc(l.name)}</span>${badge}</button>`;
          })
          .join('');
    }

    if (!box) return;
    const nav = content.querySelector('.MillenniumLogs_NavContainer');
    let seg = content.querySelector('.se-logs-level');
    if (nav) {
      if (!seg) {
        seg = make('span', 'se-mseg se-logs-level');
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', 'Level');
        seg.innerHTML =
          '<button type="button" data-level="all">All</button><button type="button" data-level="error">Errors <b></b></button><button type="button" data-level="warning">Warnings <b></b></button>';
        seg.addEventListener('click', (e) => {
          const b = e.target.closest('[data-level]');
          if (b) {
            logLevel = b.dataset.level;
            logs(content);
          }
        });
      }
      if (seg.parentElement !== nav || nav.lastElementChild !== seg) nav.append(seg);
      const counts = { error: st.errorCount || 0, warning: st.warningCount || 0 };
      seg.querySelectorAll('[data-level]').forEach((b) => {
        setAttr(b, 'data-on', b.dataset.level === logLevel ? '' : null);
        setAttr(b, 'aria-pressed', b.dataset.level === logLevel ? 'true' : 'false');
        const n = b.querySelector('b');
        if (n && n.textContent !== String(counts[b.dataset.level])) {
          n.textContent = String(counts[b.dataset.level]);
        }
      });
    }

    setAttr(box, 'data-se-level', logLevel === 'all' ? null : logLevel);
    let foot = box.querySelector(':scope > .se-logs-foot');
    if (!foot) foot = make('div', 'se-logs-foot');
    if (box.lastElementChild !== foot) box.append(foot);

    const n = (st.searchQuery ? st.searchedLogs : st.selectedLog.logs)?.length || 0;
    const words = `${n.toLocaleString()} ${n === 1 ? 'line' : 'lines'}`;
    if (foot.textContent !== words) foot.textContent = words;
  }

  const ISO = /^\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)\s*$/;

  function updates(content) {
    for (const b of content.querySelectorAll('.MillenniumUpdates_Description b')) {
      const node = b.nextSibling;
      const m = node?.nodeType === 3 && ISO.exec(node.nodeValue);
      if (!m) continue;
      const d = new Date(m[1]);
      if (isNaN(d)) continue;
      node.nodeValue = ` ${d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })}`;
    }
  }

  function general(content) {
    const sections = [...content.querySelectorAll('.DialogBody > .DialogControlsSection, .DialogBody .DialogControlsSection')];
    for (const s of sections) {
      setAttr(s, 'data-se-about', /^about$/i.test(text(s.firstElementChild)) ? '' : null);
    }
    setAttr(
      content.querySelector('.DialogBody'),
      'data-se-general',
      sections.some((s) => s.hasAttribute('data-se-about')) ? '' : null
    );
  }

  const OWN = {
    themes: '.se-mtool[data-for="themes"], .se-theme-settings',
    plugins: '.se-mtool[data-for="plugins"]',
    quickcss: '.se-qc, .se-qc-open',
    logs: '.se-logs-src, .se-logs-level, .se-logs-foot, .se-logs-empty',
  };
  const MARKS = {
    quickcss: ['data-se-qc'],
    general: ['data-se-general'],
    logs: ['data-se-level', 'data-se-lock'],
  };

  let frame = 0;
  let observer = null;
  let lastKey = null;

  function update() {
    frame = 0;
    const content = document.querySelector(`.MillenniumSettings ${CONTENT}[data-se-mill-page]`);
    const key = content?.getAttribute('data-se-mill-page') || null;
    if (key !== lastKey) {
      lastKey = key;
      themeQuery = '';
      pluginQuery = '';
      pluginMode = 'all';
      logLevel = 'all';
      if (key !== 'quickcss' && qc) {
        qc.destroy();
        qc.root.remove();
        qc = null;
      }
    }
    for (const [page, sel] of Object.entries(OWN)) {
      if (page !== key) document.querySelectorAll(sel).forEach((el) => el.remove());
    }
    for (const [page, attrs] of Object.entries(MARKS)) {
      if (page !== key) {
        for (const attr of attrs) {
          document.querySelectorAll(`[${attr}]`).forEach((el) => el.removeAttribute(attr));
        }
      }
    }
    if (!content) return;
    const steps = { themes, plugins, quickcss: quickCss, logs, general, updates }[key];
    try {
      steps?.(content);
    } catch (e) {
      console.warn('[Steam Enhanced] Millennium page:', key, e);
    }
    observer?.takeRecords();
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  function start() {
    observer = SE.watch(schedule, { attributes: ['class', 'data-se-mill-page', 'data-se-on'] });
    addEventListener('resize', schedule);
    schedule();
  }

  window.__steamEnhancedMillPages = {
    destroy() {
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
      qc?.destroy();
      qc = null;
      for (const el of made) el.remove();
      document
        .querySelectorAll(
          '[data-se-hide], [data-se-thumb], [data-se-about], [data-se-general], [data-se-qc], [data-se-level], [data-se-lock]'
        )
        .forEach((el) => {
          for (const a of [
            'data-se-hide',
            'data-se-thumb',
            'data-se-about',
            'data-se-general',
            'data-se-qc',
            'data-se-level',
            'data-se-lock',
          ]) {
            el.removeAttribute(a);
          }
        });
      removeEventListener('resize', schedule);
      delete window.__steamEnhancedMillPages;
    },
  };

  if (document.body) {
    start();
  } else {
    addEventListener('DOMContentLoaded', start, { once: true });
  }
});
