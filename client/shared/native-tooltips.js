/*
 * Webpack module discovery for Steam's native React tooltip component.
 */
((SE) => {
  if (window.__seNativeTooltips) return;

  // Modules that held React, ReactDOM and the tooltip in recent builds: tried before a scan
  const KNOWN_MODULE_IDS = [63696, 7470, 47438];
  const DEPENDENCY = /\b\w+\((\d+)\)/g;

  const load = (req, id) => {
    try {
      return req(id);
    } catch {
      return null;
    }
  };
  const exportsOf = (mod) => [mod, mod?.default].filter(Boolean);
  const isTooltipSource = (src) => src.includes('tool-tip-source') && src.includes('toolTipContent');
  const complete = (found) => !!(found.React && found.DOM && found.Tooltip);

  const inspect = (found, mod) => {
    for (const exp of exportsOf(mod)) {
      if (exp.createElement && exp.useState && exp.Component) found.React = exp;
      if (typeof exp.createRoot === 'function') found.DOM = exp;
      for (const candidate of Object.values(exp)) {
        if (typeof candidate !== 'function') continue;
        const src = Function.prototype.toString.call(candidate);
        if (isTooltipSource(src)) found.Tooltip = candidate;
      }
    }
  };

  // One scan (cached by SE.findModule, misses included): the known ids first, then the
  // tooltip's own module and the modules it requires
  const findComponents = () => {
    const perBundle = new Map();
    return SE.findModule('native-tooltips:components', (src, id, req) => {
      let found = perBundle.get(req);
      if (!found) {
        perBundle.set(req, (found = {}));
        for (const known of KNOWN_MODULE_IDS) {
          if (req.m?.[known]) inspect(found, load(req, known));
        }
        if (complete(found)) return found;
      }
      if (!isTooltipSource(src)) return null;
      inspect(found, load(req, id));
      for (const dep of new Set(Array.from(src.matchAll(DEPENDENCY), (match) => match[1]))) {
        if (req.m?.[dep]) inspect(found, load(req, dep));
      }
      return complete(found) ? found : null;
    });
  };

  const findLibraryDivider = () =>
    SE.findModule('native-tooltips:library-divider', (src, id, req) => {
      if (!src.includes('LibraryWindowDivider')) return null;
      return exportsOf(load(req, id)).find(exp => typeof exp.LibraryWindowDivider === 'string')?.LibraryWindowDivider;
    });

  let cachedApi = null;
  const resolve = () => {
    if (cachedApi) return cachedApi;
    const found = findComponents();
    if (!found) return null;
    const { React, DOM, Tooltip } = found;
    cachedApi = {
      React,
      DOM,
      Tooltip,
      get libraryDivider() {
        return findLibraryDivider() || undefined;
      },
    };
    return cachedApi;
  };

  window.__seNativeTooltips = { resolve };
})(window.__se);
