/*
 * System Report (Help › Steam System Report), rebuilt: Steam's report is a KeyValues dump in a
 * monospace box. This reads it into a spec summary (processor, graphics, memory, OS), a card per
 * section with label/value rows, CPU instruction sets as a chip grid and nested blocks as
 * collapsible groups, with section chips that follow the scroll, a filter, copy on click and a
 * Raw view (line-numbered, highlighted, filterable). Steam's Submit, Copy and Close stay as they are.
 *
 * Steam renders it in sp.js (module 87419): a ConfirmDialog with className SystemReportDialog
 * whose DialogBodyText holds the description and SystemReportContainer, which holds a throbber
 * while the report is gathered or uploaded, or TextContainer › Text with the report. Text is cut
 * at 100 KB until scrolled; the full string is the sReport prop, read from React. Without it the
 * shown text is parsed.
 *
 * Steam's nodes stay mounted (hidden by system-report.css) and React keeps owning them. Labels
 * come from the report's own keys (English identifiers in every language), split into words;
 * the original key is in each label's tooltip. Identifiers (IP, MAC, serials, hashes, account
 * names) are blurred until clicked. Blurring is visual only: Steam's Copy and Submit send the
 * report as gathered.
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  window.__steamEnhancedSystemReport?.destroy();

  const ROOT = '._2TAQYpbxatDYN3Ex76KX5u'; // SystemReportDialog
  const CONTAINER = '._7jaC6UFFrvcKq2UlJr1Pb'; // SystemReportContainer
  const TEXT_BOX = '.Cw--cBWy7v1Ey1JF0VkBN'; // TextContainer
  const TEXT = '.keUMR-i_7Q6QoQvP-I2jG'; // Text
  const BUILT = 'data-se-sysreport';
  const CHAIN = 'data-se-sysreport-chain';
  const MODE_KEY = 'se-sysreport-mode';
  const COPIED_MS = 1400;
  const TIP_RETRY_MS = 250;
  const TIP_RETRIES = 40;
  const SPY_OFFSET = 28; // px below the list's top edge that counts as "reading this section"
  const FLAG_MIN = 4; // a section needs this many on/off feature flags to show them as chips
  const OPEN_MAX = 12; // nested groups this small start open

  /* Duotone icons, as system-info.js draws them: `d` is the soft fill layer under the stroke. */
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
    game: '<path class="d" d="M7 7h10a5 5 0 0 1 4.9 6l-.6 3a2.5 2.5 0 0 1-4.3 1.2L15 15H9l-2 2.2A2.5 2.5 0 0 1 2.7 16l-.6-3A5 5 0 0 1 7 7z"/><path d="M7 7h10a5 5 0 0 1 4.9 6l-.6 3a2.5 2.5 0 0 1-4.3 1.2L15 15H9l-2 2.2A2.5 2.5 0 0 1 2.7 16l-.6-3A5 5 0 0 1 7 7zM7.5 10v4M5.5 12h4M15.5 11h.01M17.5 13h.01"/>',
    steam: '<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><circle cx="15" cy="9.5" r="2.5"/><circle cx="8.5" cy="15" r="1.8"/><path d="M10 14l3-2.6"/>',
    apps: '<rect class="d" x="4" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
    alert: '<path class="d" d="M12 3.5l9 16H3z"/><path d="M12 3.5l9 16H3zM12 10v4M12 16.8h.01"/>',
    info: '<circle class="d" cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    copy: '<rect class="d" x="8" y="8" width="12" height="12" rx="2.5"/><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    search: '<circle class="d" cx="11" cy="11" r="6.5"/><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    clear: '<path d="M7 7l10 10M17 7L7 17"/>',
    eye: '<path class="d" d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    chevron: '<path d="M9 6l6 6-6 6"/>',
    cards: '<rect class="d" x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="13" width="16" height="7" rx="2"/>',
    code: '<path d="M8.5 7L4 12l4.5 5M15.5 7L20 12l-4.5 5M13.5 5l-3 14"/>',
    expand: '<path d="M7 9l5-5 5 5M7 15l5 5 5-5"/>',
    collapse: '<path d="M7 4l5 5 5-5M7 20l5-5 5 5"/>',
  };

  /*
   * Report keys to sections, first match wins. Steam writes related keys together, so a root key
   * no rule claims joins the section of the key before it.
   */
  const CATEGORIES = [
    { id: 'pc', title: 'Computer', test: /^(?:Computer|IsLaptop|Laptop|IsDesktop|Touch|Hardware|BIOS|Motherboard|BaseBoard|Chassis|System(?:Manufacturer|Model|Product|Family|SKU))/i },
    { id: 'cpu', title: 'Processor', test: /^(?:CPU|Processor|Logical(?:Processors|Cores)|Physical(?:Processors|Cores)|HyperThread|NumCores|NumThreads|(?:SSE|AVX|FMA|AES|FCMOV|CMOV|MMX|3DNow|SHA|BMI|F16C|POPCNT|LZCNT|ABM|RDRAND|RDSEED|XOP|VMX|SVM|CX8|CX16|ERMS|NX|TSC|HTT|LAHF|MOVBE|PCLMUL)[A-Z\d]*[a-z]?$)/ },
    { id: 'os', title: 'Operating system', test: /^(?:OS|Kernel|Windows|Linux|MacOS|OSX|Platform|Distro|Desktop(?:Environment|Session)|Wow64|Is64Bit|Locale|TimeZone|Timezone|SystemLanguage|UILanguage|UserLanguage)/i },
    { id: 'ram', title: 'Memory', test: /^(?:RAM|SystemRAM|TotalRAM|PhysicalMemory|Memory|PageFile|Swap|VirtualMemory)/i },
    { id: 'gpu', title: 'Graphics', test: /^(?:Video|GPU|VRAM|DirectX|D3D|DXGI|DX\d|OpenGL|GL[A-Z_]|Vulkan|Adapter|Graphics|Driver(?:Version|Date|Name))/i },
    { id: 'display', title: 'Displays', test: /(?:Monitor|Display|Resolution|RefreshRate|DPI|HDR)/i },
    { id: 'audio', title: 'Audio', test: /^(?:Audio|Sound|Speaker|Microphone)/i },
    { id: 'disk', title: 'Storage', test: /(?:Disk|Drive|Storage|HDD|SSD|NVMe|Volume|FreeSpace|LibraryFolder)/i },
    { id: 'network', title: 'Network', test: /(?:^Net|^IP|MACAddress|Network|Proxy|Connection|Bandwidth|DNS|Ethernet|WiFi|Wireless)/i },
    { id: 'game', title: 'Input', test: /(?:Controller|Gamepad|Joystick|Keyboard|Mouse|^HID|SteamInput)/i },
    { id: 'vr', title: 'VR', test: /(?:^VR|HMD|OpenXR|OpenVR|SteamVR)/ },
    { id: 'alert', title: 'Failure reports', test: /(?:Crash|Failure|Minidump|Error)/i },
    { id: 'apps', title: 'Software', test: /(?:Software|Application|Antivirus|Firewall|Overlay(?:s|Apps))/i },
    { id: 'steam', title: 'Steam', test: /^(?:Steam|Client|Universe|Beta|Package|Bootstrapper|Build|Cloud|Content|Install|Account|Launcher|CEF|WebHelper)/i },
  ];
  const OTHER = { id: 'info', title: 'Other', test: null };
  const SHORT_TITLES = { 'Operating system': 'OS', 'Failure reports': 'Failures' };

  /* On/off CPU feature flags: SSE41, AVX512F, SSE4a, FCMOV */
  const FLAG_KEY = /^[A-Z][A-Z\d_]{1,11}[a-z]?$/;
  /* Yes/no fields, where 0/1 is a boolean rather than a count */
  const BOOL_KEY = /^(?:Is|Has|Supports?|Can|Uses?|Allow)[A-Z\d]|(?:Enabled|Supported|Present|Available|Active|Installed)$/;
  /* Identifiers: blurred until revealed */
  const PRIVATE_KEY = /(?:IPAddress|IPv[46]|MACAddress|^MAC$|Serial|Hash$|SteamID|AccountID|AccountName|UserName|PersonaName|ComputerName|HostName|MachineName|MachineGUID|^GUID$)/i;
  /* Placeholders OEM boards report instead of a real name */
  const PLACEHOLDER = /^(?:system (?:product name|manufacturer|version|serial number)|to be filled by o\.?e\.?m\.?|default string|not applicable|n\/a|none|unknown|o\.?e\.?m\.?)$/i;
  /* Child fields that name an entry of a list block */
  const NAME_KEY = /^(?:Name|FriendlyName|DeviceName|Description|DeviceDescription|Model|Product|ProductName|Adapter|Label|Title|Path)$/i;
  /* Words kept upper case when splitting keys */
  const ACRONYM = /^(?:[A-Z\d]{2,}|[A-Z]\d+[A-Za-z]?)$/;

  const views = new Set();

  /* ---------- Helpers ---------- */

  const attempt = (fn, fallback) => {
    try {
      return fn();
    } catch (err) {
      console.warn('[Steam Enhanced] System Report:', err);
      return fallback;
    }
  };

  const clean = text => String(text ?? '').replace(/\s+/g, ' ').trim();

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };

  const icon = name => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name] ?? ICONS.info;
    return svg;
  };

  const button = (className, children, onClick, label) => {
    const node = el('button', className);
    node.type = 'button';
    node.append(...children);
    if (label) node.setAttribute('aria-label', label);
    node.addEventListener('click', onClick);
    return node;
  };

  const copyText = async (text, win = window) => {
    try {
      await win.navigator.clipboard.writeText(text);
      return;
    } catch (_) {}
    const doc = win.document;
    const area = doc.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    doc.body.append(area);
    area.select();
    doc.execCommand('copy');
    area.remove();
  };

  const storage = {
    get: key => attempt(() => localStorage.getItem(key), null),
    set: (key, value) => attempt(() => localStorage.setItem(key, value)),
  };

  const BYTE_UNITS = ['KB', 'MB', 'GB', 'TB', 'PB'];
  const bytes = count => {
    let value = count;
    let unit = -1;
    while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
      value /= 1024;
      unit++;
    }
    return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${BYTE_UNITS[unit]}`;
  };

  /* "AudioDevices" -> "Audio device", for naming the entries of a list block */
  const singular = key => humanize(key).replace(/ies$/, 'y').replace(/(?<!s)s$/, '');

  const kb = text => {
    const size = new Blob([text]).size / 1024;
    return size >= 1024 ? `${(size / 1024).toFixed(1)} MB` : `${size >= 10 ? Math.round(size) : size.toFixed(1)} KB`;
  };

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

  /* ---------- Mounting ---------- */

  const viewOf = new WeakMap();

  /* Every element from the dialog root down to DialogBody fills its parent (system-report.css) */
  const markChain = (root, body) => {
    for (let node = body; node && node !== root; node = node.parentElement) SE.mark(node, CHAIN);
  };

  const build = root => {
    const container = root.querySelector(CONTAINER);
    const body = container?.closest('.DialogBody');
    const text = container?.parentElement;
    const footer = body?.querySelector(':scope > .DialogFooter');
    if (!container || !body || !text || !footer) return;
    viewOf.get(root)?.destroy();
    root.querySelectorAll('.se-sysreport').forEach(node => node.remove());
    const view = createView(root, body, container);
    viewOf.set(root, view);
    views.add(view);
    container.after(view.view);
    footer.before(view.status);
    markChain(root, body);
    SE.mark(root, BUILT);
  };

  const scan = () => {
    for (const root of document.querySelectorAll(ROOT)) {
      const view = viewOf.get(root);
      if (view && root.hasAttribute(BUILT) && view.view.isConnected && view.status.isConnected) {
        view.update();
        continue;
      }
      build(root);
    }
  };

  const watcher = SE.watch(scan, { throttle: 100, scope: ROOT, ignore: node => !!node.closest?.('.se-sysreport') });
  scan();

  window.__steamEnhancedSystemReport = {
    destroy() {
      watcher.disconnect();
      for (const view of [...views]) view.destroy();
      document.querySelectorAll('.se-sysreport').forEach(node => node.remove());
      document.querySelectorAll(`[${BUILT}]`).forEach(node => SE.unmark(node, BUILT));
      document.querySelectorAll(`[${CHAIN}]`).forEach(node => SE.unmark(node, CHAIN));
      delete window.__steamEnhancedSystemReport;
    },
  };
});
