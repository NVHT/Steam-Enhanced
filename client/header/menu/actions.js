/*
 * The added menus: View/Friends/Games/Help as submenus, and restart/reload actions.
 */
((SE) => {
  const ns = window.__seSteamMenuParts;
  if (!ns) return;
  const { owners } = SE;
  const { SUBMENU_NAMES, Submenu, configurations, movedGroups, normalizeMenuLabel } = ns;
  const { live } = ns;

  function AdditionalMenus() {
    const entries = configurations();
    return live.api.React.createElement(
      live.api.React.Fragment,
      null,
      ...SUBMENU_NAMES.map((name) => live.api.React.createElement(Submenu, { key: name, name, entry: entries.get(name) }))
    );
  }

  function groupSeparator(key) {
    return live.api.React.createElement('hr', {
      key,
      className: [live.api.menuStyles.MenuItem, live.api.menuStyles.Separator, `se-menu-group-${key}`].filter(Boolean).join(' '),
    });
  }

  function SteamClientActions({ instance, nativeWindow }) {
    const marker = live.api.React.useRef(null);

    live.api.React.useLayoutEffect(() => {
      const root = marker.current.parentElement;
      const doc = root.ownerDocument;
      const itemClass = live.api.menuStyles.MenuItem.split(' ')[0];
      const exitLabel = normalizeMenuLabel(live.api.localize('#Menu_Exit'));
      const pluginItem = 'data-restart-steam-root-item';
      function steamCommand(namespace, method, ...args) {
        for (const owner of new Set([nativeWindow, ...owners()])) {
          const target = owner?.SteamClient?.[namespace];
          if (typeof target?.[method] === 'function') return target[method](...args);
        }
        throw new Error(`Steam's ${namespace}.${method} command is unavailable`);
      }

      const actions = [
        ['restart', 'Restart Steam', () => steamCommand('User', 'StartRestart', true)],
        ['reload', 'Reload UI', () => steamCommand('Browser', 'RestartJSContext')],
      ];
      const rows = new Map();
      const separator = doc.createElement('hr');
      separator.className = [live.api.menuStyles.MenuItem, live.api.menuStyles.Separator].join(' ');
      let template;

      function makeRow(exit, label, run) {
        const row = doc.createElement('button');
        row.type = 'button';
        row.setAttribute('role', 'menuitem');
        row.className = exit.className;
        row.style.cssText = 'font-family:inherit;text-align:start;cursor:pointer';
        row.textContent = label;
        row.addEventListener('click', async (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (row.disabled) return;
          row.disabled = true;
          row.textContent = label;
          row.removeAttribute('title');
          try {
            // Dispatch before closing the popup that received the click.
            await run();
          } catch (error) {
            row.disabled = false;
            row.textContent = `${label} failed — try again`;
            row.title = error?.message || String(error);
            console.warn(`[Steam Enhanced] ${label}:`, error);
            return;
          }
          row.disabled = false;
          try {
            instance.Hide();
          } catch (error) {
            console.warn('[Steam Enhanced] Could not close the Steam menu:', error);
          }
        });
        return row;
      }

      function refresh() {
        const exit = [...root.querySelectorAll(`[role="menuitem"], .${itemClass}`)].find(
          (item) => !item.hasAttribute(pluginItem) &&
            normalizeMenuLabel(item.textContent) === exitLabel
        );
        if (exit !== template) {
          for (const row of rows.values()) row.remove();
          rows.clear();
          template = exit;
          if (exit) {
            for (const [key, label, run] of actions) rows.set(key, makeRow(exit, label, run));
          }
        }
        if (!exit) {
          separator.remove();
          return;
        }

        const parent = exit.parentElement;
        const pluginRows = [...parent.children].filter((item) => item.hasAttribute(pluginItem));
        const pluginKeys = new Set(pluginRows.map((item) => item.getAttribute(pluginItem)));
        const group = [];
        for (const [key, row] of rows) {
          if (pluginKeys.has(key)) row.remove();
          else group.push(row);
        }
        if (group.length && !pluginKeys.has('separator')) group.push(separator);
        else separator.remove();

        // Leave the plugin's group intact so its own layout hook can position it.
        let anchor = pluginRows[0] || exit;
        for (const row of group.reverse()) {
          if (row.nextElementSibling !== anchor) parent.insertBefore(row, anchor);
          anchor = row;
        }
      }

      const observer = new MutationObserver(refresh);
      observer.observe(root, { childList: true, subtree: true });
      refresh();
      return () => {
        observer.disconnect();
        for (const row of rows.values()) row.remove();
        separator.remove();
      };
    }, [instance, nativeWindow]);

    return live.api.React.createElement('span', { hidden: true, ref: marker });
  }

  function placeGroup(doc) {
    const start = doc.querySelector('.se-menu-group-start');
    const end = doc.querySelector('.se-menu-group-end');
    const parent = start?.parentElement;
    if (!parent || end?.parentElement !== parent) return;

    const group = [start, ...parent.querySelectorAll(':scope > .se-steam-native-submenu'), end];
    if (group.length <= 2) return;

    const label = normalizeMenuLabel(live.api.localize('#Menu_CheckForSteamUpdates'));
    const updateNode = [...parent.children].find((node) => !group.includes(node) && normalizeMenuLabel(node.textContent) === label);
    if (!updateNode) return;

    const previous = updateNode.previousElementSibling;
    if (previous === end) return;

    if (!movedGroups.has(parent)) {
      movedGroups.set(parent, { group, anchor: end.nextSibling, separator: null, display: '' });
    }
    const saved = movedGroups.get(parent);
    if (previous?.tagName === 'HR' && previous !== start && previous !== end) {
      saved.separator = previous;
      saved.display = previous.style.display;
      previous.style.display = 'none';
    }
    for (const node of group) {
      parent.insertBefore(node, updateNode);
    }
  }
  Object.assign(ns, { AdditionalMenus, SteamClientActions, groupSeparator, placeGroup });
})(window.__se);
