/*
 * Steam's page popups (#modalContent, web/shared/modals.css), on every Store and Community page:
 * the address in the popup's bar opens the page in this window, in the client. Steam gives it
 * target="_blank", which sends it to the system browser.
 *
 * One delegated listener, since Steam builds the popup only when it first opens. A click with a
 * modifier key or the middle button keeps the browser's own behaviour.
 */
(() => {
  'use strict';
  const web = window.__seWeb;

  const LINK = '#modalContentTitleBar a[href]';

  web.define((dom) => {
    const $ = dom.scope();

    $.listen(document, 'click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest(LINK) : null;
      if (!link) return;
      event.preventDefault();
      location.assign(link.href);
    }, true);

    return () => $.destroy();
  });
})();
