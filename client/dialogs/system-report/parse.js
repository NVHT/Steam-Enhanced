/*
 * System Report: reading the KeyValues report into sections, values and the spec summary.
 *
 * Part of client/dialogs/system-report/ (see shared.js).
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedSystemReportParts;
  if (!ns) return;
  const { ACRONYM, CATEGORIES, OTHER, PLACEHOLDER, clean } = ns;

  /*
   * "ComputerManufacturer" -> "Computer manufacturer", "CPUFamily" -> "CPU family", "IsLaptop" ->
   * "Laptop". Keys that aren't identifiers (paths, device names) stay as written.
   */
  const humanize = key => {
    if (!/^[A-Za-z][\w.]*$/.test(String(key))) return String(key);
    const words = String(key)
      .replace(/[_.]+/g, ' ')
      .replace(/([a-z\d])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .split(/\s+/)
      .filter(Boolean);
    if (words.length > 1 && /^Is$/.test(words[0])) words.shift();
    return words.map((word, i) => (ACRONYM.test(word) ? word : i ? word.toLowerCase() : word[0].toUpperCase() + word.slice(1))).join(' ') || String(key);
  };

  /* ---------- KeyValues ---------- */

  /*
   * Steam's text KeyValues: "key" "value" and "key" { ... }, quoted or bare tokens, // comments,
   * [$PLATFORM] conditionals (skipped). Backslashes are literal (paths), except \" that doesn't end
   * a token. Tolerant: returns what parsed before any error, and where the error was.
   */
  const parseKV = text => {
    const n = text.length;
    let i = 0;

    const skipSpace = () => {
      for (;;) {
        while (i < n && text.charCodeAt(i) <= 32) i++;
        if (text[i] === '/' && text[i + 1] === '/') {
          while (i < n && text[i] !== '\n') i++;
          continue;
        }
        if (text[i] === '[' && text[i + 1] === '$') {
          const end = text.indexOf(']', i);
          if (end > 0) {
            i = end + 1;
            continue;
          }
        }
        return;
      }
    };

    const token = () => {
      skipSpace();
      if (i >= n) return null;
      const c = text[i];
      if (c === '{' || c === '}') {
        i++;
        return { type: c };
      }
      if (c === '"') {
        let s = '';
        for (i++; i < n; i++) {
          const ch = text[i];
          if (ch === '\\' && text[i + 1] === '"' && i + 2 < n && !/[\s{}]/.test(text[i + 2])) {
            s += '"';
            i++;
          } else if (ch === '"') break;
          else s += ch;
        }
        i++;
        return { type: 's', value: s };
      }
      const start = i;
      while (i < n && text.charCodeAt(i) > 32 && !'{}"'.includes(text[i])) i++;
      return { type: 's', value: text.slice(start, i) };
    };

    const list = depth => {
      const out = [];
      for (;;) {
        const key = token();
        if (!key) {
          if (depth) throw new Error('unclosed block');
          return out;
        }
        if (key.type === '}') {
          if (!depth) throw new Error('unexpected }');
          return out;
        }
        if (key.type !== 's') throw new Error('expected a key');
        const value = token();
        if (!value) throw new Error('missing value');
        if (value.type === '{') {
          const node = { key: key.value, children: [] };
          out.push(node);
          node.children = list(depth + 1);
        } else if (value.type === 's') out.push({ key: key.value, value: value.value });
        else throw new Error('expected a value');
      }
    };

    // On an error the partial tree still holds every entry read up to it
    const root = { key: '', children: [] };
    const read = depth => {
      const out = [];
      for (;;) {
        const key = token();
        if (!key || key.type === '}') return out;
        const value = token();
        if (key.type !== 's' || !value) return out;
        if (value.type === '{') {
          const node = { key: key.value, children: [] };
          out.push(node);
          try {
            node.children = list(depth + 1);
          } catch (err) {
            throw Object.assign(err, { partial: out });
          }
        } else out.push({ key: key.value, value: value.value });
      }
    };
    try {
      root.children = read(0);
      return { root, error: i < n ? 'trailing text' : null };
    } catch (err) {
      root.children = err.partial ?? [];
      return { root, error: err.message };
    }
  };

  const isBlock = node => Array.isArray(node.children);
  const leafCount = node => (isBlock(node) ? node.children.reduce((sum, child) => sum + leafCount(child), 0) : 1);

  /* ---------- Model ---------- */

  const categoryOf = key => CATEGORIES.find(cat => cat.test.test(key)) ?? null;

  /*
   * Report tree to sections: root values grouped by category (a key no rule claims joins the one
   * before it), each root block its own section. A single wrapping block ("systemreport") is
   * unwrapped first.
   */
  const toSections = root => {
    let top = root.children;
    while (top.length === 1 && isBlock(top[0])) top = top[0].children;

    const sections = [];
    const byCategory = new Map();
    let previous = null;
    for (const node of top) {
      if (isBlock(node)) {
        const cat = categoryOf(node.key);
        sections.push({ id: `b:${node.key}`, icon: cat?.id ?? 'info', title: humanize(node.key), key: node.key, entries: node.children });
        continue;
      }
      const cat = categoryOf(node.key) ?? previous ?? OTHER;
      previous = cat;
      let section = byCategory.get(cat);
      if (!section) {
        section = { id: `c:${cat.id}`, icon: cat.id, title: cat.title, key: '', entries: [] };
        byCategory.set(cat, section);
        sections.push(section);
      }
      section.entries.push(node);
    }
    // A block named like a category section ("Displays") joins it; its entries keep its key
    const byTitle = new Map([...byCategory.values()].map(section => [section.title.toLowerCase(), section]));
    return sections.filter(section => {
      const host = section.key && byTitle.get(section.title.toLowerCase());
      if (!host) return true;
      for (const node of section.entries) host.entries.push({ ...node, parentKey: section.key });
      return false;
    });
  };

  /* Index of every value by key, first wins, for the summary */
  const indexValues = (entries, map = new Map()) => {
    for (const node of entries) {
      if (isBlock(node)) indexValues(node.children, map);
      else if (!map.has(node.key.toLowerCase())) map.set(node.key.toLowerCase(), clean(node.value));
    }
    return map;
  };

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

  /* Headline facts by well-known keys; a tile whose value isn't in the report is left out */
  const summarise = values => {
    const pick = (...keys) => keys.map(key => values.get(key.toLowerCase())).find(value => value && !PLACEHOLDER.test(value)) ?? '';
    const cpuName = pick('CPUBrand', 'CPUName', 'ProcessorName', 'CPU');
    const cores = pick('PhysicalProcessors', 'PhysicalCores', 'NumCores');
    const threads = pick('LogicalProcessors', 'LogicalCores', 'NumThreads');
    const ram = pick('RAM', 'SystemRAM', 'TotalRAM', 'PhysicalMemory', 'SystemRAMMB', 'RAMMB');
    const gpu = pick('VideoCard', 'VideoCardName', 'VideoDriverName', 'DirectXCard', 'GPU', 'GPUName', 'AdapterDescription', 'VideoAdapter');
    const vram = pick('VRAM', 'VRAMSize', 'VideoMemory', 'DedicatedVideoMemory');
    const os = pick('OSVersionString', 'OSName', 'OSVersion', 'OS', 'OperatingSystem');
    const kernel = pick('OSBuild', 'OSBuildNumber', 'KernelVersion');
    const resolution = pick('PrimaryMonitorResolution', 'PrimaryDisplayResolution', 'Resolution', 'DesktopResolution');
    const refresh = pick('RefreshRate', 'PrimaryMonitorRefreshRate', 'PrimaryDisplayRefreshRate');
    const memory = /^\d+$/.test(ram) ? gb(ram) : ram;

    const tiles = [
      { id: 'cpu', label: 'Processor', value: tidyCPU(cpuName), full: cpuName, sub: join(cores && `${cores} cores`, threads && `${threads} threads`, ghz(pick('CPUSpeed', 'CPUSpeedMHz'))) },
      { id: 'gpu', label: 'Graphics', value: gpu, sub: /^\d+$/.test(vram) ? gb(vram) : vram },
      { id: 'ram', label: 'Memory', value: memory, sub: /^\d+$/.test(ram) ? `${Number(ram).toLocaleString()} MB` : '' },
      os ? { id: 'os', label: 'System', value: os, sub: kernel } : { id: 'display', label: 'Display', value: resolution.replace(/\s*x\s*/i, ' × '), sub: refresh && `${refresh} Hz` },
    ].filter(tile => tile.value);

    const maker = [...new Set([pick('ComputerManufacturer', 'SystemManufacturer'), pick('ComputerModel', 'SystemProductName', 'SystemModel')].filter(Boolean))].join(' ');
    return { tiles, maker };
  };

  /* ---------- Copy text ---------- */

  const entryLines = (entries, indent = '') =>
    entries.flatMap(node =>
      isBlock(node)
        ? [`${indent}${node.key}`, ...entryLines(node.children, `${indent}  `)]
        : [`${indent}${node.key}: ${clean(node.value)}`],
    );

  const sectionText = section => [section.title, ...entryLines(section.entries, '  ')].join('\n');
  Object.assign(ns, {
    humanize, indexValues, isBlock, leafCount, parseKV, sectionText, summarise, toSections,
  });
});
