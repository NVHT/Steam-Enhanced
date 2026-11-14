/*
 * Finding Steam's menu API (ContextMenuManager, React, the menu components) in its bundles.
 */
((SE) => {
  const ns = window.__seSteamMenuParts;
  if (!ns) return;
  const { ROOT_BTN_SELECTOR } = ns;

  // Known webpack module IDs and export keys for fast-path resolution.
  const KNOWN_MODULES = {
    React: [63696],
    menus: [1582, '_G'],
    submenu: [12711, 'Vs'],
    registry: [377, 'XX'],
    parental: [54069, 'l9'],
    features: [28532, 'z9', 'uX'],
    localize: [7727, 'we'],
    styles: [51319],
  };

  function sourceOf(req, id) {
    try {
      return Function.prototype.toString.call(req.m[id]);
    } catch {
      return '';
    }
  }

  function exportNames(src) {
    const out = {};
    const match = /\.d\(\s*[\w$]+\s*,\s*\{([^}]*)\}\s*\)/.exec(src);
    if (match) {
      for (const [, key, local] of match[1].matchAll(/([\w$]+)\s*:\s*\(\)\s*=>\s*([\w$.]+)/g)) {
        out[local] = key;
      }
    }
    return out;
  }

  function importsOf(src) {
    const out = {};
    for (const [, alias, id] of src.matchAll(/([\w$]+)\s*=\s*[\w$]+\(\s*(\d+)\s*\)/g)) {
      if (!(alias in out)) out[alias] = Number(id);
    }
    for (const [, alias, target] of src.matchAll(/([\w$]+)\s*=\s*[\w$]+\.n\(\s*([\w$]+)\s*\)/g)) {
      if (!(alias in out) && target in out) out[alias] = out[target];
    }
    return out;
  }

  const isReact = (r) => Boolean(r?.createElement && r.Fragment && r.useState);
  const isStyles = (o) => typeof o?.MenuItem === 'string' && typeof o.Separator === 'string';

  function resolveFromKnown(req) {
    const k = KNOWN_MODULES;
    if (!req?.m?.[k.menus[0]] || !req.m[k.submenu[0]] || !req.m[k.registry[0]]) {
      return null;
    }
    const React = req(k.React[0]);
    const menus = req(k.menus[0]);
    const context = req(k.submenu[0]);
    const registry = req(k.registry[0])[k.registry[1]];
    const parental = req(k.parental[0]);
    const features = req(k.features[0]);
    const MenuItems = menus[k.menus[1]];
    const SubMenu = context[k.submenu[1]];
    const usePermission = parental[k.parental[1]];
    const localize = req(k.localize[0])[k.localize[1]];
    const menuStyles = req(k.styles[0]);

    if (
      !isReact(React) ||
      typeof MenuItems !== 'function' ||
      typeof SubMenu !== 'function' ||
      !registry?.GetContextMenuManager ||
      typeof usePermission !== 'function' ||
      features[k.features[1]] === undefined ||
      typeof localize !== 'function' ||
      !isStyles(menuStyles)
    ) {
      return null;
    }

    return {
      React,
      MenuItems,
      SubMenu,
      registry,
      localize,
      menuStyles,
      usePermission,
      allowed: features[k.features[1]],
      defaultFeature: features[k.features[2]],
    };
  }

  // The webpack module whose source holds every needle (one cached scan per key, in core).
  const moduleWith = (key, ...needles) =>
    SE.findModule(`steam-menu:${key}`, (src, id, req) => needles.every((n) => src.includes(n)) && { id, req });

  function resolveFromSource() {
    const menusMod = moduleWith('menus', '"Menus"', 'disabledItemClass', 'parentalFeature');
    const submenuMod = moduleWith('submenu', 'OnSubMenuMouseEnter', 'bInGamepadUI');
    const registryMod = moduleWith('registry', 'm_mapManagers', 'GetContextMenuManagerFromWindow');
    if (!menusMod || !submenuMod || !registryMod) return null;

    const { req, id: menusId } = menusMod;
    const src = sourceOf(req, menusId);
    const exported = exportNames(src);
    const imports = importsOf(src);
    const mod = req(menusId);
    const pick = (alias, key) => {
      const id = imports[alias];
      return id === undefined ? undefined : req(id)?.[key];
    };

    const items = /([\w$]+)\s*=\s*\(?\s*([\w$]+)\s*\)?\s*=>\s*\{\s*const\s*\{\s*disabledItemClass\s*:\s*[\w$]+\s*,\s*menuItems\s*:/.exec(src);
    const MenuItems = items && mod[exported[items[1]]];
    const feat = /parentalFeature\s*:\s*([\w$]+)\s*=\s*([\w$]+)\.([\w$]+)/.exec(src);
    const perm = feat && new RegExp(`([\\w$]+)\\s*=\\s*\\(\\s*0\\s*,\\s*([\\w$]+)\\.([\\w$]+)\\s*\\)\\s*\\(\\s*${feat[1].replace(/\$/g, '\\$')}\\s*\\)\\s*,\\s*[\\w$]+\\s*=\\s*\\1\\s*!==?\\s*([\\w$]+)\\.([\\w$]+)`).exec(src);
    const loc = /\(\s*0\s*,\s*([\w$]+)\.([\w$]+)\s*\)\s*\(\s*"#/.exec(src);

    let React;
    let menuStyles;
    for (const id of new Set(Object.values(imports))) {
      let m;
      try {
        m = req(id);
      } catch {
        continue;
      }
      if (!React && isReact(m)) React = m;
      if (!menuStyles && isStyles(m)) menuStyles = m;
    }

    const subSrc = sourceOf(submenuMod.req, submenuMod.id);
    const subNames = exportNames(subSrc);
    const subMod = submenuMod.req(submenuMod.id);
    const sub = /([\w$]+)\s*=\s*\(?\s*([\w$]+)\s*\)?\s*=>\s*\{\s*const\s+([\w$]+)\s*=\s*\(\s*0\s*,\s*[\w$.]+\s*\)\s*\(\s*\)\s*;?\s*return\s*\(\s*0\s*,\s*[\w$.]+\s*\)\s*\(\s*[\w$]+\s*,\s*\{\s*\.\.\.\s*\2\s*,\s*bInGamepadUI\s*:\s*\3\s*\}/.exec(subSrc);
    const SubMenu = sub && subMod[subNames[sub[1]]];
    const registry = Object.values(registryMod.req(registryMod.id) || {}).find((v) => v && typeof v.GetContextMenuManager === 'function');

    const resolved = {
      React,
      MenuItems,
      SubMenu,
      registry,
      menuStyles,
      localize: loc && pick(loc[1], loc[2]),
      usePermission: perm && pick(perm[2], perm[3]),
      allowed: perm && pick(perm[4], perm[5]),
      defaultFeature: feat && pick(feat[2], feat[3]),
    };

    if (
      !isReact(React) ||
      typeof MenuItems !== 'function' ||
      typeof SubMenu !== 'function' ||
      !registry ||
      typeof resolved.localize !== 'function' ||
      typeof resolved.usePermission !== 'function' ||
      resolved.allowed === undefined ||
      !isStyles(menuStyles)
    ) {
      return null;
    }
    return resolved;
  }

  function resolveMenuApi() {
    for (const req of SE.requires()) {
      try {
        const found = resolveFromKnown(req);
        if (found) return found;
      } catch {}
    }
    try {
      return resolveFromSource() || undefined;
    } catch {
      return undefined;
    }
  }

  function contextManager(fiber) {
    for (let current = fiber; current; current = current.return) {
      for (let dep = current.dependencies?.firstContext; dep; dep = dep.next) {
        const value = dep.memoizedValue;
        if (value?.CreateContextMenuInstance && value.GetAllMenus) return value;
      }
    }
    return undefined;
  }

  function retainedMenu(fiber) {
    for (let hook = fiber?.memoizedState; hook; hook = hook.next) {
      const value = hook.memoizedState?.current;
      if (value?.Show && value?.Hide && 'ReactElement' in value) return value;
    }
    return undefined;
  }

  // The root menu's config sits a few levels above its button; 60 is a generous cap.
  function configuration(node) {
    for (let fiber = SE.fiber(node), depth = 0; fiber && depth < 60; fiber = fiber.return, depth++) {
      const props = fiber.memoizedProps;
      if (props?.title?.endsWith?.(' Root Menu') && (props.menuContent || props.menuItems)) {
        return {
          props,
          instance: retainedMenu(fiber),
          manager: contextManager(fiber),
        };
      }
    }
    return undefined;
  }

  function configurations() {
    const found = new Map();
    for (const node of document.querySelectorAll(ROOT_BTN_SELECTOR)) {
      const entry = configuration(node);
      if (entry) {
        found.set(entry.props.title.replace(/ Root Menu$/, ''), { node, ...entry });
      }
    }
    return found;
  }
  Object.assign(ns, { configurations, contextManager, exportNames, resolveMenuApi, retainedMenu });
})(window.__se);
