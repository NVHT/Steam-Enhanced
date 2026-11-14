/*
 * The native Library switch: opens Steam's own Library list beside the page when it can.
 */
((SE) => {
  const ns = window.__seDownloadsParts;
  if (!ns) return;
  const { live } = ns;

  // Steam's router is found by module id; a build without it is retried now and then, not
  // every frame (each try walks every webpack bundle).
  const NATIVE_RETRY_MS = 30000;
  let nativeSwitch;
  let nativeRetryAt = 0;

  function enableNativeLibrary(page) {
    if (live.restoreLibraryRoute || performance.now() < nativeRetryAt) return;
    nativeRetryAt = performance.now() + NATIVE_RETRY_MS;
    for (const require of SE.requires()) {
      const router = SE.run(() => require.m?.[49519] && require(49519));
      const React = SE.run(() => require.m?.[63696] && require(63696));
      const prototype = router?.dO?.prototype;
      const render = prototype?.render;
      if (typeof render !== 'function' || !React?.cloneElement || !router.qh) continue;

      function withLibrary() {
        const output = render.call(this);
        const routes = this.props.children;
        if (!Array.isArray(routes) || routes.length !== 2) return output;
        const [downloads, library] = routes;
        if (downloads?.props?.path !== '/library/downloads' ||
            library?.type !== router.qh || library.props.path !== '/library') return output;
        nativeSwitch = this;
        const location = this.props.location;
        const path = location?.pathname || SE.run(() => SE.mainWindow()?.LocationPathName);
        if (path !== '/library/downloads' && path !== '/library/downloads/') return output;

        return React.createElement('div', { className: 'se-dl-native-layout' },
          React.createElement('div', { className: 'se-dl-native-list' },
            React.cloneElement(library, {
              location,
              computedMatch: { path: '/library', url: '/library', isExact: false, params: {} },
            })
          ),
          React.createElement('div', { className: 'se-dl-native-content' }, output)
        );
      }

      prototype.render = withLibrary;
      live.restoreLibraryRoute = () => {
        if (prototype.render === withLibrary) {
          prototype.render = render;
          nativeSwitch?.forceUpdate();
        }
      };
      // Reloading the theme on Downloads needs one render of the mounted switch.
      for (let fiber = SE.liveFiber(page); fiber; fiber = fiber.return) {
        if (fiber.type === router.dO && fiber.stateNode?.props?.children?.[0]?.props?.path === '/library/downloads') {
          fiber.stateNode.forceUpdate();
          break;
        }
      }
      return;
    }
  }

  Object.assign(ns, { enableNativeLibrary });
})(window.__se);
