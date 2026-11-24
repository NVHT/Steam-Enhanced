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
  const ns = (window.__seSystemReportParts = {});
  const { el } = SE;

  window.__seSystemReport?.destroy();

  const ROOT = `.${SE.C.SystemReportDialog}`; // SystemReportDialog
  const CONTAINER = `.${SE.C.SystemReportContainer}`; // SystemReportContainer
  const TEXT_BOX = `.${SE.C.TextContainer}`; // TextContainer
  const TEXT = `.${SE.C.Text}`; // Text
  const BUILT = 'data-se-sysreport';
  const CHAIN = 'data-se-sysreport-chain';
  const MODE_KEY = 'se-sysreport-mode';
  const COPIED_MS = 1400;
  const SPY_OFFSET = 28; // px below the list's top edge that counts as "reading this section"
  const FLAG_MIN = 4; // a section needs this many on/off feature flags to show them as chips
  const OPEN_MAX = 12; // nested groups this small start open

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

  // Core masks (core/icons-*.css), drawn by system-info.css (.se-sysinfo-icon) as in System Information
  const icon = (name) => {
    const node = el('span', 'se-sysinfo-icon');
    node.dataset.icon = name;
    node.setAttribute('aria-hidden', 'true');
    return node;
  };

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

  const bytes = (count) => SE.bytes(count, { short: true });

  /* "AudioDevices" -> "Audio device", for naming the entries of a list block */
  const singular = (key) => ns.humanize(key).replace(/ies$/, 'y').replace(/(?<!s)s$/, '');

  const kb = (text) => {
    const size = new Blob([text]).size / 1024;
    return size >= 1024 ? `${(size / 1024).toFixed(1)} MB` : `${size >= 10 ? Math.round(size) : size.toFixed(1)} KB`;
  };
  Object.assign(ns, {
    ACRONYM, BOOL_KEY, BUILT, CATEGORIES, CHAIN, CONTAINER, COPIED_MS, FLAG_KEY, FLAG_MIN,
    MODE_KEY, NAME_KEY, OPEN_MAX, OTHER, PLACEHOLDER, PRIVATE_KEY, ROOT, SHORT_TITLES, SPY_OFFSET,
    TEXT, TEXT_BOX, attempt, button, bytes, clean, copyText, icon, kb,
    singular, storage, views,
  });
})(window.__se);
