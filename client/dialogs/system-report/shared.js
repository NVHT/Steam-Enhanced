/*
 * System Report (Help › Steam System Report), rebuilt: Steam's report is a KeyValues dump in a
 * monospace box. This reads it into a spec summary (processor, graphics, memory, OS), a card per
 * section with label/value rows, CPU instruction sets as a chip grid and nested blocks as
 * collapsible groups, with section chips that follow the scroll, a filter, copy on click and a
 * Raw view (line-numbered, highlighted, filterable). Steam's Submit, Copy and Close stay as they
 * are.
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
 *
 * Plain scripts, listed part by part in client/loader.js and run in this order, sharing
 * window.__seSystemReportParts:
 * - shared.js  selectors, icons, categories, small helpers (copy, storage, bytes)
 * - parse.js   reading the KeyValues report into sections, values and the spec summary
 * - view.js    the rebuilt view: highlighting, tooltips, and createView
 * - main.js    finding the dialog, building the view, the watcher and destroy()
 */
((SE) => {
  const ns = (window.__seSystemReportParts = { live: {} });
  const { el } = SE;

  window.__seSystemReport?.destroy();

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

  const attempt = SE.attempt('System Report');

  const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

  const { icon } = SE.icons(ICONS, 'info');

  const button = (className, children, onClick, label) => {
    const node = el('button', className);
    node.type = 'button';
    node.append(...children);
    if (label) node.setAttribute('aria-label', label);
    node.addEventListener('click', onClick);
    return node;
  };

  const copyText = (text, win) => SE.copy(text, win);

  const storage = {
    get: (key) => attempt(() => localStorage.getItem(key), null),
    set: (key, value) => attempt(() => localStorage.setItem(key, value)),
  };

  const BYTE_UNITS = ['KB', 'MB', 'GB', 'TB', 'PB'];
  const bytes = (count) => {
    let value = count;
    let unit = -1;
    while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
      value /= 1024;
      unit++;
    }
    return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${BYTE_UNITS[unit]}`;
  };

  /* "AudioDevices" -> "Audio device", for naming the entries of a list block */
  const singular = (key) => ns.humanize(key).replace(/ies$/, 'y').replace(/(?<!s)s$/, '');

  const kb = (text) => {
    const size = new Blob([text]).size / 1024;
    return size >= 1024 ? `${(size / 1024).toFixed(1)} MB` : `${size >= 10 ? Math.round(size) : size.toFixed(1)} KB`;
  };
  Object.assign(ns, {
    ACRONYM, BOOL_KEY, BUILT, CATEGORIES, CHAIN, CONTAINER, COPIED_MS, FLAG_KEY, FLAG_MIN,
    MODE_KEY, NAME_KEY, OPEN_MAX, OTHER, PLACEHOLDER, PRIVATE_KEY, ROOT, SHORT_TITLES, SPY_OFFSET,
    TEXT, TEXT_BOX, TIP_RETRIES, TIP_RETRY_MS, attempt, button, bytes, clean, copyText, icon, kb,
    singular, storage, views,
  });
})(window.__se);
