/*
 * Mounting Steam's own Friends & Chat tree in the dock, guarding its modal managers and the
 * main window title.
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedFriendsDockParts;
  if (!ns) return;
  const {
    app, COLLAPSE_ICON, COPY, disposeGroupFlyouts, flyoutOwnedTabs, importOf, managerTimers, state,
  } = ns;

  const { run } = SE;

  const findEmbed = () =>
    SE.findModule('friends-dock:embed', (src, id, req) => {
      if (!src.includes('PopupFriendsListDimensions') || !src.includes('elTarget')) return null;
      const exp = run(() => req(id));
      for (const k of Object.keys(exp || {})) {
        const fn = run(() => exp[k]);
        if (typeof fn !== 'function' || fn.prototype?.render || fn.length !== 3) continue;
        const body = Function.prototype.toString.call(fn);
        if (!body.includes('elTarget')) continue;
        const calls = [...body.matchAll(/\(0,\s*([\w$]+)\.createRoot\s*\)/g)];
        if (calls.length !== 1) continue;
        const dom = importOf(src, calls[0][1], req);
        const descriptor = dom && Object.getOwnPropertyDescriptor(dom, 'createRoot');
        if (typeof descriptor?.value !== 'function' || !descriptor.writable) continue;
        let jsx;
        for (const call of src.matchAll(/([\w$]+)\.jsx\b/g)) {
          const candidate = importOf(src, call[1], req);
          if (typeof candidate?.jsx === 'function' && typeof candidate?.jsxs === 'function') {
            jsx = candidate;
            break;
          }
        }
        return { mount: fn, dom, jsx };
      }
      return null;
    });

  // Guard the Library window's modal manager entry in `m_mapModalManager` so the
  // embedded Friends & Chat tree does not overwrite the Library's modal overlay host.
  function managerRegistries() {
    const map = SE.findModule('friends-dock:modal-managers', (src, id, req) => {
      if (!src.includes('Stomping CModalManager')) return null;
      for (const v of Object.values(run(() => req(id)) || {})) {
        const candidate = v?.m_mapModalManager;
        if (typeof candidate?.get === 'function' && typeof candidate.set === 'function') return candidate;
      }
      return null;
    });
    return map ? [{ map }] : [];
  }

  function isPanelManager(value) {
    if (!value || typeof value !== 'object') return false;
    for (const el of ns.steamHost.querySelectorAll('.FullModalOverlay')) {
      if (SE.fromProps(el, 8, (p) => p.ModalManager) === value) return true;
    }
    return false;
  }

  let libraryManagers = null;

  function keepLibraryManagers() {
    if (!libraryManagers) return;
    for (const r of libraryManagers) {
      try {
        const current = r.native.get.call(r.map, window);
        if (current === r.own) continue;
        if (current && !isPanelManager(current)) {
          r.own = current;
        } else if (r.own && current !== r.own) {
          r.native.set.call(r.map, window, r.own);
        }
      } catch (_) {}
    }
  }

  function guardLibraryManagers() {
    if (libraryManagers?.length) {
      keepLibraryManagers();
      return;
    }
    libraryManagers = [];
    for (const { map } of managerRegistries()) {
      const proto = Object.getPrototypeOf(map);
      const native = { get: proto?.get, set: proto?.set };
      if (typeof native.get !== 'function' || typeof native.set !== 'function') continue;
      const r = { map, native, own: undefined, set: null };
      r.set = function (key, value) {
        if (this === map && key === window && !state.destroyed) {
          try {
            if (isPanelManager(value)) {
              const current = native.get.call(map, window);
              if (current && !isPanelManager(current)) return this;
              if (r.own) {
                native.set.call(map, window, r.own);
                return this;
              }
            } else if (value) {
              r.own = value;
            }
          } catch (_) {}
        }
        return native.set.call(this, key, value);
      };
      const ownDesc = Object.getOwnPropertyDescriptor(map, 'set');
      if (ownDesc && !ownDesc.configurable) continue;
      try {
        Object.defineProperty(map, 'set', { configurable: true, writable: true, value: r.set });
      } catch (_) {
        continue;
      }
      r.saved = ownDesc;
      libraryManagers.push(r);
    }
    keepLibraryManagers();
  }

  function unguardLibraryManagers() {
    keepLibraryManagers();
    for (const r of libraryManagers || []) {
      try {
        if (r.map.set !== r.set) continue;
        if (r.saved) Object.defineProperty(r.map, 'set', r.saved);
        else delete r.map.set;
      } catch (_) {}
    }
    libraryManagers = null;
  }

  // Prevent the embedded FriendsUI container from overwriting the main window's document.title.
  let titlePatch = null;

  // The FriendsUI class whose `title` setter writes `this[windowKey].document.title`.
  const findTitleSetter = () =>
    SE.findModule('friends-dock:title', (src, id, req) => {
      if (!src.includes('FriendsUI Browser context missing from owner window') || !/\.document\.title\s*=/.test(src)) {
        return null;
      }
      const exp = run(() => req(id));
      for (const name of Object.keys(exp || {})) {
        const proto = run(() => exp[name])?.prototype;
        const descriptor = proto && Object.getOwnPropertyDescriptor(proto, 'title');
        if (!descriptor?.configurable || typeof descriptor.set !== 'function') continue;
        const match = /this\.([\w$]+)\.document\.title\s*=/.exec(Function.prototype.toString.call(descriptor.set));
        if (match) return { proto, descriptor, windowKey: match[1] };
      }
      return null;
    });

  function protectMainTitle() {
    if (titlePatch) return true;
    const found = findTitleSetter();
    if (!found) return false;
    const { proto, descriptor, windowKey } = found;
    if (Object.getOwnPropertyDescriptor(proto, 'title')?.set !== descriptor.set) return false;
    const set = function (title) {
      if (this[windowKey] === window) return undefined;
      return descriptor.set.call(this, title);
    };
    Object.defineProperty(proto, 'title', { ...descriptor, set });
    titlePatch = { proto, descriptor, set };
    return true;
  }

  function restoreTitleSetter() {
    if (!titlePatch) return;
    const { proto, descriptor, set } = titlePatch;
    if (Object.getOwnPropertyDescriptor(proto, 'title')?.set === set) {
      Object.defineProperty(proto, 'title', descriptor);
    }
    titlePatch = null;
  }

  function releaseFlyoutTabs() {
    state.openingDockChat++;
    try {
      for (const [id, tabs] of flyoutOwnedTabs) {
        const tab = run(() => tabs.GetTabByUniqueID(id));
        if (tab) {
          run(() => tabs.RemoveTab(tab));
          run(() => tab.OnTabClosed?.());
        }
      }
      flyoutOwnedTabs.clear();
      run(() => app()?.UIStore.SerializePopupState?.());
    } finally {
      state.openingDockChat--;
    }
  }

  function disposeSteam() {
    ns.closeChatPopup();
    ns.restoreChatRenderer();
    disposeGroupFlyouts();
    for (const timer of managerTimers) clearTimeout(timer);
    managerTimers.clear();
    try {
      state.steamRoot?.unmount();
    } catch (e) {
      console.warn('[Steam Enhanced] friends dock cleanup', e);
    } finally {
      state.steamRoot = null;
      state.steamMounted = false;
      if (state.chatContext) {
        try {
          state.chatContext.data.SetFriendsListSingleWindowMode(state.chatContext.previous);
        } catch (_) {}
        state.chatContext = null;
      }
      delete ns.dock.dataset.chat;
      ns.resetMinimized();
      ns.chatBack.hidden = true;
      state.activeChatFriend = null;
      state.dockTabs = null;
      restoreTitleSetter();
      keepLibraryManagers();
      ns.steamHost.remove();
      ns.steamBar.remove();
    }
  }

  function showSteam() {
    if (state.destroyed) return;
    const a = app();
    if (!state.steamMounted) {
      try {
        if (!a) throw new Error('no friend data');
        const embed = findEmbed();
        if (!embed) throw new Error('not found in this Steam version');
        if (!protectMainTitle()) throw new Error('main-window title protection unavailable');
        ns.steamBar.innerHTML = `<button type="button" class="se-fd-icon" data-act="collapse" data-se-tip="${COPY.collapse}" aria-label="${COPY.collapse}">${COLLAPSE_ICON}</button>`;
        ns.dock.append(ns.steamBar, ns.steamHost);
        guardLibraryManagers();

        const original = embed.dom.createRoot;
        const capture = function (target, ...args) {
          const root = original.call(this, target, ...args);
          if (target === ns.steamHost) state.steamRoot = root;
          return root;
        };
        try {
          embed.dom.createRoot = capture;
          if (embed.dom.createRoot !== capture) throw new Error('root capture unavailable');
          embed.mount(a.FriendStore, a.ChatStore, ns.steamHost);
          if (typeof state.steamRoot?.unmount !== 'function') throw new Error('root cleanup unavailable');
        } finally {
          embed.dom.createRoot = original;
        }
        state.steamMounted = true;
        for (const ms of [0, 50, 250, 1000]) {
          const timer = setTimeout(() => {
            managerTimers.delete(timer);
            keepLibraryManagers();
          }, ms);
          managerTimers.add(timer);
        }
      } catch (e) {
        disposeSteam();
        console.warn('[Steam Enhanced] friends dock: Steam view', e);
        state.steamError = COPY.steamFailed(e?.message || String(e));
        state.view = 'theme';
        state.sig = '';
        ns.render();
      }
    }
  }

  Object.assign(ns, {
    disposeSteam, findEmbed, keepLibraryManagers, releaseFlyoutTabs, showSteam,
    unguardLibraryManagers,
  });
});
