/*
 * Millennium backend calls for theme features that run outside a plugin realm.
 */
(() => {
  window.__sePluginRpc?.destroy();

  const bindingName = 'MILLENNIUM_PRIVATE_INTERNAL_FOREIGN_FUNCTION_INTERFACE_DO_NOT_USE';
  const timeoutMs = 60000;
  const calls = new Set();
  let fallback;
  let destroyed = false;

  function createBinder(owner) {
    const descriptor = Object.getOwnPropertyDescriptor(owner, bindingName);
    const pending = new Map();
    let nextId = Math.floor(Math.random() * 1000000000);
    let released = false;

    function restore() {
      if (!released || pending.size || owner[bindingName] !== binder) return;
      if (descriptor) Object.defineProperty(owner, bindingName, descriptor);
      else delete owner[bindingName];
    }

    const binder = {
      call(type, pluginName, methodName, argumentList, callSite, raw = false) {
        return new Promise((resolve, reject) => {
          const id = nextId++;
          const finish = (error, value) => {
            const entry = pending.get(id);
            if (!entry) return;
            pending.delete(id);
            clearTimeout(entry.timer);
            if (error) reject(error);
            else resolve(raw ? value : JSON.stringify(value));
            restore();
          };
          const timer = setTimeout(() => finish(new Error('Millennium backend request timed out')), timeoutMs);
          pending.set(id, { timer, finish });
          try {
            owner.__private_millennium_ffi_do_not_use__(JSON.stringify({
              id: type,
              call_id: id,
              caller: '',
              data: { pluginName, methodName, argumentList },
            }));
          } catch (error) {
            finish(error);
          }
        });
      },
      __handleResponse(id, response) {
        const entry = pending.get(id);
        if (!entry) return;
        if (response?.success) entry.finish(null, response.returnJson ?? null);
        else entry.finish(new Error(String(response?.returnJson || 'Millennium backend request failed')));
      },
    };
    owner[bindingName] = binder;
    fallback = { release() { released = true; restore(); } };
    return binder;
  }

  function resolveBinder() {
    const owners = window.__se?.owners?.() || [window];
    for (const owner of owners) {
      try {
        if (typeof owner.__private_millennium_ffi_do_not_use__ !== 'function') continue;
        const binder = owner[bindingName];
        if (typeof binder?.call === 'function' && typeof binder.__handleResponse === 'function') return binder;
        if (!binder) return createBinder(owner);
      } catch {}
    }
    throw new Error('Millennium backend bridge is unavailable');
  }

  window.__sePluginRpc = {
    call(plugin, method, args) {
      if (destroyed) return Promise.reject(new Error('Theme backend bridge was disposed'));
      return new Promise((resolve, reject) => {
        const entry = { reject, timer: null };
        const finish = (error, value) => {
          if (!calls.delete(entry)) return;
          clearTimeout(entry.timer);
          if (error) reject(error);
          else resolve(value);
        };
        calls.add(entry);
        entry.timer = setTimeout(() => finish(new Error('Millennium backend request timed out')), timeoutMs);
        try {
          Promise.resolve(resolveBinder().call(0, plugin, method, args, undefined, true))
            .then(value => finish(null, value), (error) => finish(error));
        } catch (error) {
          finish(error);
        }
      });
    },
    destroy() {
      destroyed = true;
      for (const entry of calls) {
        clearTimeout(entry.timer);
        entry.reject(new Error('Theme backend bridge was disposed'));
      }
      calls.clear();
      fallback?.release();
      delete window.__sePluginRpc;
    },
  };
  dispatchEvent(new Event('se-plugin-rpc-ready'));
})();
