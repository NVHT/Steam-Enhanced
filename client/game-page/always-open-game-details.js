/*
 * Keep Steam's game details info panel (cover, description, tags) open on every game page.
 *
 * Steam remembers which games had the panel opened in a static Set on the panel's component
 * (s_setGameInfoVisible) and reads it when the page mounts. Once that component is known,
 * the Set answers "yes" for every game, so Steam renders each page with the panel open from
 * its first render: nothing is changed after the page has drawn.
 *
 * Only the first page seen after Steam starts needs its panel opened late. That update goes
 * through Steam's own React as a transition: the panel's contents suspend while their data
 * loads, and an urgent update there let React hide the whole app (a black main window for
 * about a second) until it arrived. A transition keeps the current page on screen instead.
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  const { C } = SE;
  if (window.__steamEnhancedGameDetails) return;
  const state = (window.__steamEnhancedGameDetails = {});

  const PANEL = `.${C.AppGameInfoContainer}.${C.AppDetailsCollapsed}`;

  let observer;
  let patchedSet = null;
  let transition = null;
  let transitionMissAt = -Infinity;
  const RETRY_MS = 30000;

  // Steam's React, as Millennium exposes it; a startTransition from any other copy of React
  // would not reach Steam's renderer and the update would stay urgent. A miss (React not
  // loaded yet) is retried after RETRY_MS instead of being remembered for good.
  const findTransition = () => {
    if (transition || performance.now() - transitionMissAt < RETRY_MS) return transition;
    const fromMillennium = SE.global('SP_REACT', react => typeof react.startTransition === 'function');
    if (fromMillennium) return (transition = fromMillennium.startTransition);
    // Without Millennium's handle: Steam's React is the copy that its react-dom loaded.
    for (const req of SE.requires()) {
      for (const mod of Object.values(req.c || {})) {
        const exp = mod?.exports;
        if (
          typeof exp?.startTransition === 'function' &&
          typeof exp.createElement === 'function' &&
          typeof exp.useSyncExternalStore === 'function'
        ) {
          return (transition = exp.startTransition);
        }
      }
    }
    transitionMissAt = performance.now();
    return null;
  };

  const alwaysOpen = (set) => {
    if (set === patchedSet || !(set instanceof Set)) return;
    try {
      if (patchedSet) delete patchedSet.has;
      Object.defineProperty(set, 'has', { configurable: true, writable: true, value: () => true });
      patchedSet = set;
      // Every later page now renders open by itself: watch only as a slow safety net, in case
      // Steam replaces the Set.
      watchPanels(2000);
    } catch (_) {}
  };

  const panelOwner = (panel) => {
    let fiber = SE.fiber(panel);
    for (let depth = 0; fiber && depth < 50; depth++, fiber = fiber.return) {
      const component = fiber.stateNode;
      if (
        component &&
        typeof component.setState === 'function' &&
        typeof component.state?.bShowGameInfo === 'boolean' &&
        typeof component.onGameInfoToggle === 'function' &&
        component.props?.overview
      ) {
        return component;
      }
    }
    return null;
  };

  // The state stays false until the transition commits; don't queue it again meanwhile.
  const opening = new WeakSet();

  const openPanel = (component) => {
    if (opening.has(component)) return;
    opening.add(component);
    const update = () => component.setState({ bShowGameInfo: true }, () => opening.delete(component));
    const start = findTransition();
    if (start) start(update);
    else update();
  };

  const expand = () => {
    for (const panel of document.querySelectorAll(PANEL)) {
      const component = panelOwner(panel);
      if (!component || component.state.bShowGameInfo) continue;
      alwaysOpen(component.constructor?.s_setGameInfoVisible);
      openPanel(component);
    }
  };

  // core already batches watchers into one frame.
  function watchPanels(throttle = 0) {
    observer?.disconnect();
    observer = SE.watch(expand, { attributes: ['class'], ignore: SE.inSide, throttle });
  }

  const start = () => {
    watchPanels();
    expand();
  };

  state.destroy = () => {
    observer?.disconnect();
    if (patchedSet) delete patchedSet.has;
    patchedSet = null;
    removeEventListener('DOMContentLoaded', start);
    delete window.__steamEnhancedGameDetails;
  };

  if (document.body) start();
  else addEventListener('DOMContentLoaded', start, { once: true });
});
