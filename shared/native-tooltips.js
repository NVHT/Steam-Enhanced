/* Webpack module discovery for Steam's native React tooltip component. */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  if (window.__steamEnhancedNativeTooltips) return;

  let cachedApi = null;
  const KNOWN_MODULE_IDS = [63696, 7470, 47438];

  const findNativeComponents = req => {
    try {
      const factories = req.m || {};
      const safeRequire = id => {
        try {
          return req(id);
        } catch (_) {
          return null;
        }
      };
      const unwrapExports = mod => [mod, mod?.default].filter(Boolean);

      let React = null;
      let DOM = null;
      let Tooltip = null;

      const inspectModule = mod => {
        for (const exp of unwrapExports(mod)) {
          if (exp.createElement && exp.useState && exp.Component) React = exp;
          if (typeof exp.createRoot === 'function') DOM = exp;
          for (const candidate of Object.values(exp)) {
            if (typeof candidate !== 'function') continue;
            const src = Function.prototype.toString.call(candidate);
            if (src.includes('tool-tip-source') && src.includes('toolTipContent')) {
              Tooltip = candidate;
            }
          }
        }
      };

      for (const id of KNOWN_MODULE_IDS) {
        if (factories[id]) inspectModule(safeRequire(id));
      }

      if (!React || !DOM || !Tooltip) {
        for (const [id, factory] of Object.entries(factories)) {
          const src = Function.prototype.toString.call(factory);
          if (!src.includes('tool-tip-source') || !src.includes('toolTipContent')) continue;
          inspectModule(safeRequire(id));
          const depIds = [...src.matchAll(/\b\w+\((\d+)\)/g)].map(m => m[1]);
          for (const depId of new Set(depIds)) {
            if (factories[depId]) inspectModule(safeRequire(depId));
          }
        }
      }

      if (React && DOM && Tooltip) {
        let libraryDivider;
        for (const [id, factory] of Object.entries(factories)) {
          if (!Function.prototype.toString.call(factory).includes('LibraryWindowDivider')) continue;
          for (const exp of unwrapExports(safeRequire(id))) {
            if (typeof exp.LibraryWindowDivider === 'string') {
              libraryDivider = exp.LibraryWindowDivider;
              break;
            }
          }
          if (libraryDivider) break;
        }
        return { React, DOM, Tooltip, libraryDivider };
      }
    } catch (_) {}
    return null;
  };

  const resolve = () => {
    if (cachedApi) return cachedApi;
    for (const req of SE.requires()) {
      const components = findNativeComponents(req);
      if (components) {
        cachedApi = components;
        return cachedApi;
      }
    }
    return null;
  };

  window.__steamEnhancedNativeTooltips = { resolve };
});
