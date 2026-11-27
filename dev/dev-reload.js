/*
 * Dev reload (Ctrl+Shift+U, core/core.js; only with dev/live-reload.json on): this window's
 * stylesheets again, and with `scripts` its scripts too, without Reload UI. client/loader.js loads
 * this file on the first reload in a window and hands it its own parts (`loader`). Each file is
 * read past the cache and compared with its text at this window's last reload: only the changed
 * ones come again (all of them on a window's first reload, with nothing to compare). The new
 * sheets go in beside the old and take over once loaded, so nothing flashes; each script, run
 * again, calls its old copy's destroy() first, in list order. The runtime stays: features hold
 * it. Other client windows follow through the storage event (the loader's listener). The badge
 * gives the time and count, and stays, listing them, when a script threw or a global lost its
 * destroy(). Ctrl+Shift+Y (mode 'pick') opens a list of this window's files to reload one.
 */
(() => {
  const LATE_MS = 2000; // a re-run script's errors this long after it loaded still count (its first awaits and timers)
  const texts = new Map(); // file → its text at this window's last reload

  // A short note at the window's foot-left; a closed shadow root, so no style reaches it
  let badge = null;
  let badgeTimer = 0;
  const dropBadge = () => {
    clearTimeout(badgeTimer);
    badge?.remove();
    badge = null;
  };
  const showBadge = (text, problems = []) => {
    dropBadge();
    const host = (badge = document.createElement('div'));
    const stays = problems.length > 0;
    host.style.cssText =
      `all:initial;position:fixed;left:10px;bottom:10px;z-index:2147483000;max-width:min(560px,calc(100vw - 20px));pointer-events:${stays ? 'auto' : 'none'}`;
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>
      .badge { display: inline-block; box-sizing: border-box; max-width: 100%; padding: 5px 10px; border-radius: 10px; background: rgba(16, 18, 23, .88); box-shadow: inset 0 0 0 1px #7cc4ff; color: #fff; font: 700 11px/1.4 system-ui, sans-serif; }
      .badge[data-problems] { padding: 8px 12px; box-shadow: inset 0 0 0 1px #ff7b7b; cursor: pointer; }
      ul { max-height: 40vh; margin: 6px 0 0; padding: 0 0 0 14px; overflow: auto; font-weight: 400; color: #ffc2c2; }
      li { overflow-wrap: anywhere; }
      .hint { margin-top: 6px; font-weight: 400; color: #6f7883; }
    </style><div class="badge"><div class="text"></div></div>`;
    const box = root.querySelector('.badge');
    box.querySelector('.text').textContent = text;
    if (stays) {
      box.dataset.problems = '';
      const list = document.createElement('ul');
      list.append(...problems.map((line) => Object.assign(document.createElement('li'), { textContent: line })));
      const hint = Object.assign(document.createElement('div'), { className: 'hint', textContent: 'Click to close' });
      box.append(list, hint);
      host.addEventListener('click', dropBadge, { once: true });
    } else {
      badgeTimer = setTimeout(dropBadge, 1500);
    }
    (document.body ?? document.documentElement).append(host);
  };

  // A file's own URL without the reload stamp, read past the cache; null when it can't be read
  const readText = (loader, file) => {
    const url = new URL(loader.asset(file));
    url.searchParams.delete('se-reload');
    return fetch(url.href, { cache: 'no-store' })
      .then((response) => (response.ok ? response.text() : null))
      .catch(() => null);
  };

  // The files whose text differs from the last reload's, in the order given; one never seen or
  // unreadable counts as changed (reloaded as before this check existed). Records the new texts.
  const changedOf = async (loader, files) => {
    const read = await Promise.all(files.map((file) => readText(loader, file)));
    return files.filter((file, i) => {
      const text = read[i];
      if (text === null) return true;
      const same = texts.get(file) === text;
      texts.set(file, text);
      return !same;
    });
  };

  // This window's theme scripts, in list order, without the runtime (features hold it)
  const scriptsOf = (loader) => [...loader.added].filter((file) => file.endsWith('.js') && !loader.RUNTIME.includes(file));

  // The option files se-options imports (client/loader.js applyOptions), as theme paths
  const optionFilesOf = (loader) => {
    const rootPath = decodeURIComponent(new URL(loader.asset('-')).pathname).slice(0, -1);
    const css = document.getElementById('se-options')?.textContent ?? '';
    return [...css.matchAll(/@import url\("([^"]+)"\)/g)]
      .map(([, href]) => decodeURIComponent(new URL(href).pathname))
      .filter((path) => path.startsWith(rootPath))
      .map((path) => path.slice(rootPath.length));
  };

  // A new se-sheets from the loader's URLs beside the old, taking over once loaded; true if it loaded
  const swapSheets = (loader) =>
    new Promise((done) => {
      const old = document.getElementById('se-sheets');
      const style = document.createElement('style');
      style.textContent = loader.sheetImports();
      const swap = (event) => {
        old?.remove();
        style.id = 'se-sheets';
        done(event.type === 'load');
      };
      style.addEventListener('load', swap, { once: true });
      style.addEventListener('error', swap, { once: true });
      if (old) old.after(style);
      else loader.head.append(style);
    });

  // se-options again with the new stamp; resolves once the new one is in (applyOptions swaps it)
  const swapOptions = (loader) =>
    new Promise((done) => {
      const old = [...document.querySelectorAll('style#se-options')].pop();
      loader.applyOptions();
      const style = [...document.querySelectorAll('style#se-options')].pop();
      if (!style || style === old) return done();
      style.addEventListener('load', done, { once: true });
      style.addEventListener('error', done, { once: true });
    });

  // Each script again in list order (async = false keeps it); resolves once all have run
  const runScripts = (loader, files, byURL, problems) =>
    new Promise((done) => {
      let left = files.length;
      if (!left) return done();
      const settle = (file) => (event) => {
        if (event.type === 'error') problems.add(`${file}: didn't load`);
        if (--left === 0) done();
      };
      for (const file of files) {
        loader.head.querySelector(`script[data-se-file="${file}"]`)?.remove();
        loader.addScript(file);
        const script = loader.head.querySelector(`script[data-se-file="${file}"]`);
        if (!script) {
          if (--left === 0) done();
          continue;
        }
        byURL.set(script.src, file);
        const end = settle(file);
        script.addEventListener('load', end, { once: true });
        script.addEventListener('error', end, { once: true });
      }
    });

  /*
   * Theme globals that lost their teardown. A feature publishes `window.__se<Feature> = {
   * destroy() }` and a split one's parts `window.__se<Feature>Parts` (no destroy; CLAUDE.md
   * section 5). So an `__se…` object a re-run script put in place (another object than before the
   * reload), not a Parts bag, with no destroy() can't be torn down by the next reload.
   */
  const globalsNow = () =>
    new Map(Object.keys(window).filter((key) => /^__se[A-Z]/.test(key)).map((key) => [key, window[key]]));
  const lostTeardown = (before) => {
    const lines = [];
    for (const [key, value] of globalsNow()) {
      if (key.endsWith('Parts') || !value || typeof value !== 'object' || before.get(key) === value) continue;
      if (typeof value.destroy !== 'function') lines.push(`window.${key}: no destroy()`);
    }
    return lines;
  };

  const plural = (n) => `${n} file${n === 1 ? '' : 's'}`;

  /*
   * Puts the changed files in: sheets and option files under a new stamp (the loader's `fresh`,
   * read only as a URL is built, so unchanged files keep theirs and their cached copies), scripts
   * run again. Errors from the re-run scripts are caught for LATE_MS after they ran, and a late one
   * shows the badge again.
   */
  const apply = async (loader, start, { sheets, options, scripts }, label) => {
    loader.stamp(String(Date.now()));
    for (const file of sheets) loader.sheets.set(file, loader.asset(file));
    const problems = new Set();
    const byURL = new Map();
    let shown = ''; // the badge's line once it's up
    const onError = (event) => {
      const file = byURL.get(event.filename);
      if (!file) return;
      const line = `${file}${event.lineno ? `:${event.lineno}` : ''}: ${event.message}`;
      if (problems.has(line)) return;
      problems.add(line);
      if (shown) showBadge(shown, [...problems]);
    };
    addEventListener('error', onError);
    const before = scripts.length ? globalsNow() : null;
    const waits = [runScripts(loader, scripts, byURL, problems)];
    if (sheets.length) waits.push(swapSheets(loader).then((ok) => ok || problems.add('Stylesheets: an import failed to load')));
    if (options.length) waits.push(swapOptions(loader));
    await Promise.all(waits);
    const ms = Math.round(performance.now() - start);
    if (before) lostTeardown(before).forEach((line) => problems.add(line));
    shown = `${label} · ${ms} ms`;
    showBadge(shown, [...problems]);
    if (scripts.length) setTimeout(() => removeEventListener('error', onError), LATE_MS);
    else removeEventListener('error', onError);
  };

  const reloadChanged = async (loader, withScripts) => {
    const start = performance.now();
    const [sheets, options, scripts] = await Promise.all([
      changedOf(loader, [...loader.sheets.keys()]),
      changedOf(loader, optionFilesOf(loader)),
      withScripts ? changedOf(loader, scriptsOf(loader)) : [],
    ]);
    const css = sheets.length + options.length;
    const count = css + scripts.length;
    if (!count) return showBadge(`Nothing changed · ${Math.round(performance.now() - start)} ms`);
    const kind = css && scripts.length ? 'CSS and JS' : css ? 'CSS' : 'JS';
    await apply(loader, start, { sheets, options, scripts }, `${kind} reloaded · ${plural(count)}`);
  };

  const reloadOne = async (loader, file) => {
    const start = performance.now();
    await changedOf(loader, [file]); // its text recorded, so the next full reload compares with it
    const css = file.endsWith('.css');
    await apply(loader, start, { sheets: css ? [file] : [], options: [], scripts: css ? [] : [file] }, `${file} reloaded`);
  };

  // One reload at a time: a press during one waits its turn
  let queue = Promise.resolve();
  const enqueue = (run) => {
    queue = queue.then(run).catch((error) => showBadge('Reload failed', [String(error?.message ?? error)]));
  };

  // The file list (mode 'pick'): this window's sheets, then its scripts; a later press closes it
  let picker = null;
  const openPicker = (loader) => {
    const files = [...loader.sheets.keys(), ...scriptsOf(loader)];
    const host = document.createElement('div');
    host.style.cssText = 'all: initial; position: fixed; top: 48px; left: 50%; transform: translateX(-50%); max-height: calc(100vh - 96px); display: flex; z-index: 2147483600;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>
      /* The theme's thin dark scrollbar (core/scrollbars.css doesn't reach a shadow root) */
      ::-webkit-scrollbar { width: 10px; height: 10px; background: transparent; }
      ::-webkit-scrollbar-track, ::-webkit-scrollbar-corner { background: transparent; }
      ::-webkit-scrollbar-button { display: none; }
      ::-webkit-scrollbar-thumb { min-height: 40px; border: 3px solid transparent; border-radius: 999px; background: rgba(255, 255, 255, .18) padding-box; }
      ::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, .3) padding-box; }
      .panel { box-sizing: border-box; display: flex; flex-direction: column; width: 380px; max-width: calc(100vw - 32px); max-height: 100%; border-radius: 10px; background: #16191e; color: #c6ccd4; box-shadow: 0 12px 40px rgba(0, 0, 0, .6); font: 12px/1.4 system-ui, sans-serif; overflow: hidden; }
      .head { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-bottom: 1px solid #252a31; }
      .title { font-weight: 700; font-size: 13px; color: #fff; }
      input, button { font: inherit; color: inherit; }
      input { box-sizing: border-box; width: 100%; padding: 6px; border: 0; border-radius: 6px; background: #252a31; }
      input::placeholder { color: #6f7883; }
      input:focus-visible, .entry:focus-visible { outline: 2px solid #7cc4ff; outline-offset: 1px; }
      .list { overflow: auto; padding: 4px 8px 12px; }
      .entry { display: block; width: 100%; padding: 6px 8px; border: 0; border-radius: 6px; background: none; text-align: left; overflow-wrap: anywhere; cursor: pointer; }
      .entry:hover, .entry[aria-selected="true"] { background: #252a31; color: #fff; }
      .empty { padding: 6px 8px; color: #6f7883; }
    </style>
    <div class="panel" role="dialog" aria-label="Reload one file">
      <div class="head">
        <div class="title">Reload one file</div>
        <input type="search" autocomplete="off" spellcheck="false" placeholder="Filter files" aria-label="Filter files" role="combobox" aria-controls="se-dr-list" aria-expanded="true">
      </div>
      <div class="list" id="se-dr-list" role="listbox"></div>
    </div>`;
    const input = root.querySelector('input');
    const list = root.querySelector('.list');
    let shown = files;
    let at = 0;

    const draw = () => {
      const query = input.value.trim().toLowerCase();
      shown = query ? files.filter((file) => file.toLowerCase().includes(query)) : files;
      at = Math.max(0, Math.min(at, shown.length - 1));
      if (!shown.length) {
        list.replaceChildren(Object.assign(document.createElement('div'), { className: 'empty', textContent: 'No file matches' }));
        return;
      }
      list.replaceChildren(
        ...shown.map((file, i) => {
          const entry = Object.assign(document.createElement('button'), { className: 'entry', type: 'button', textContent: file });
          entry.dataset.file = file;
          entry.setAttribute('role', 'option');
          entry.setAttribute('aria-selected', String(i === at));
          return entry;
        })
      );
    };
    const mark = (next) => {
      at = Math.max(0, Math.min(next, shown.length - 1));
      list.querySelectorAll('.entry').forEach((entry, i) => entry.setAttribute('aria-selected', String(i === at)));
      list.children[at]?.scrollIntoView({ block: 'nearest' });
    };
    const choose = (file) => {
      close();
      if (file) enqueue(() => reloadOne(loader, file));
    };

    // Keys stay in the panel: Steam's own shortcuts (Esc closes some windows) never see them
    const onKey = (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        choose(shown[at]);
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        mark(at + (event.key === 'ArrowDown' ? 1 : -1));
      }
    };
    const onClick = (event) => {
      const entry = event.target.closest?.('.entry');
      if (entry) choose(entry.dataset.file);
    };
    const onInput = () => {
      at = 0;
      draw();
    };
    // A press outside the panel closes it
    const onOutside = (event) => {
      if (!event.composedPath().includes(host)) close();
    };

    const close = () => {
      removeEventListener('pointerdown', onOutside, true);
      host.remove();
      if (picker === api) picker = null;
    };
    const api = { close };

    root.addEventListener('keydown', onKey);
    list.addEventListener('click', onClick);
    input.addEventListener('input', onInput);
    addEventListener('pointerdown', onOutside, true);
    draw();
    (document.body ?? document.documentElement).append(host);
    input.focus();
    return api;
  };

  /**
   * loader: { stamp(value), sheets, asset(file), sheetImports(), head, applyOptions(), added,
   * RUNTIME, addScript(file) }, client/loader.js's own parts. mode: false (sheets), true (sheets
   * and scripts) or 'pick' (the file list).
   */
  window.__seDevReload = (loader, mode = false) => {
    if (mode === 'pick') {
      if (picker) picker.close();
      else picker = openPicker(loader);
      return;
    }
    enqueue(() => reloadChanged(loader, Boolean(mode)));
  };
})();
