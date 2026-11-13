/* Relay Store and Community webview focus to the chat flyout. */
(() => {
  const GLOBAL_KEY = '__seBrowserChatClicks';
  window[GLOBAL_KEY]?.destroy();
  if (!/^https:\/\/(?:store\.steampowered\.com|steamcommunity\.com)(?:\/|$)/i.test(location.href)) {
    return;
  }

  const notifyParent = (message, value) => {
    try {
      window.SteamClient?.BrowserView?.PostMessageToParent(message, value);
    } catch (_) {}
  };

  const onFocus = (event) => {
    if (event.isTrusted && event.target === window) {
      notifyParent('SteamEnhanced.ChatBrowserFocus', event.type);
    }
  };

  window.addEventListener('focus', onFocus);
  window.addEventListener('blur', onFocus);
  window[GLOBAL_KEY] = {
    destroy() {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onFocus);
      delete window[GLOBAL_KEY];
    },
  };
})();
