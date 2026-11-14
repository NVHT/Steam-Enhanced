/* Steam's download store, the live overview, and pressing Steam's own controls (pause). */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedDownloadsParts;
  if (!ns) return;
  const { LINKS_ROW, SEL } = ns;
  const { live } = ns;

  // Steam's download API (SteamClient.Downloads). The overview subscription is the source of
  // truth for "paused"; the store is read when the subscription is unavailable.
  const steamDownloads = () => SE.global('SteamClient', (client) => client.Downloads)?.Downloads || null;
  const downloadOverview = () =>
    live.liveOverview || SE.global('downloadsStore', (store) => store.m_DownloadOverview)?.m_DownloadOverview || null;

  // The control Steam's handler is on: the button itself, not a wrapper around it
  const CLICKABLE = 'button, [role="button"], .DialogButton';
  const clickTarget = (el) => (el?.matches(CLICKABLE) ? el : el?.querySelector(CLICKABLE)) || el;

  // A real press: pointer and mouse events, then click (Steam's buttons listen to different ones)
  function press(el) {
    if (!el) return;
    const init = { bubbles: true, cancelable: true, composed: true, button: 0, view: window };
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
      el.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, { ...init, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(type, init));
    }
    el.click();
  }

  // React's props on a DOM node (Steam's UI is React): the handler Steam itself runs on click
  const handlerOf = (el) => {
    const props = SE.props(el);
    return props?.onClick || props?.onActivate || props?.onOKButton || null;
  };

  // Steam's pause/resume control in its (hidden) transfer block: an element with an icon and a
  // click handler, outside the links, preferring the controls beside the time left; innermost wins
  function findPauseHandler(row) {
    if (!row) return null;
    const links = row.querySelector(LINKS_ROW);
    const candidates = [row, ...row.querySelectorAll('*')].filter((el) =>
      handlerOf(el) && el.querySelector('svg') && !links?.contains(el) && !el.closest(SEL.graph)
    );
    candidates.sort((a, b) =>
      Number(!!b.closest(SEL.controls)) - Number(!!a.closest(SEL.controls)) ||
      a.querySelectorAll('*').length - b.querySelectorAll('*').length
    );
    const el = candidates[0];
    return el ? { el, handler: handlerOf(el) } : null;
  }

  // Pause/resume: Steam's own handler first (exactly what its button does), then a pressed
  // button, then the download API
  function togglePause(refs) {
    const resume = refs.paused;
    const own = findPauseHandler(refs.row);
    if (own) {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      SE.run(() => own.handler({
        type: 'click', target: own.el, currentTarget: own.el, nativeEvent: event,
        preventDefault() {}, stopPropagation() {}, persist() {},
      }));
    } else if (refs.source?.button) {
      press(clickTarget(refs.source.button));
    } else {
      const api = steamDownloads();
      const appid = Number(refs.appid);
      const perApp = resume ? 'ResumeAppUpdate' : 'PauseAppUpdate';
      if (appid && typeof api?.[perApp] === 'function') SE.run(() => api[perApp](appid));
      else SE.run(() => api?.EnableAllDownloads(resume));
    }
    // Show the new state at once; Steam's state confirms it on the next update
    refs.paused = !resume;
    refs.optimistic = Date.now();
    ns.schedule();
  }

  Object.assign(ns, { clickTarget, downloadOverview, findPauseHandler, handlerOf, press, steamDownloads, togglePause });
});
