/*
 * Overlay: the async data cache and calls to Steam's protobuf services.
 *
 * Part of client/overlay/ (see context.js).
 */
(window.__se ? (fn) => fn(window.__se) : (fn) => addEventListener('se-core', () => fn(window.__se), { once: true }))((SE) => {
  const ns = window.__steamEnhancedOverlayParts;
  if (!ns) return;
  const { contextGlobal, exportOf } = ns;

  /* ---------- Async data cache ---------- */

  const LOAD_TIMEOUT_MS = 10_000;

  const withTimeout = promise => {
    let timer = 0;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), LOAD_TIMEOUT_MS);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  };

  // One entry per key: keeps the last good value (shown at once while a
  // refresh runs), refreshes after `ttl`, and backs off by `retry` after a
  // failure or a call that never answers. `onSettled` re-renders on arrival.
  const createCache = ({ ttl, retry, load, onSettled }) => {
    const entries = new Map();
    return {
      get(key) {
        let entry = entries.get(key);
        const now = Date.now();
        if (!entry) entries.set(key, (entry = { value: null, due: 0, pending: false, error: null, at: 0 }));
        if (!entry.pending && now >= entry.due) {
          entry.pending = true;
          Promise.resolve()
            .then(() => withTimeout(load(key)))
            .then(
              value => {
                entry.value = value;
                entry.error = null;
                entry.due = Date.now() + ttl;
              },
              err => {
                entry.error = String(err?.message || err);
                entry.due = Date.now() + retry;
              }
            )
            .finally(() => {
              entry.pending = false;
              entry.at = Date.now();
              onSettled();
            });
        }
        return entry.value;
      },
      expire(key) {
        for (const [k, entry] of entries) if (key === undefined || k === key) entry.due = 0;
      },
      clear() {
        entries.clear();
      },
      // For `__seOverlay.debug()`.
      inspect(key) {
        const entry = entries.get(key);
        if (!entry) return { status: 'not requested' };
        return {
          status: entry.pending ? 'loading' : entry.error ? 'error' : 'ok',
          error: entry.error,
          value: entry.value,
          settledSecondsAgo: entry.at ? Math.round((Date.now() - entry.at) / 1000) : null,
        };
      },
    };
  };

  /* ---------- Steam services ---------- */

  // Steam's protobuf service calls, found by shape in Steam's webpack modules:
  // the service object, its request classes and the shared message wrapper.
  // One SE.findModule pass resolves every part of an API.
  const servicePart = (name, methods) => [
    [`${name}.${methods[0]}#1`],
    value => methods.every(method => typeof value?.[method] === 'function'),
  ];
  const requestPart = className => [
    [className],
    value => typeof value === 'function' && value.prototype.getClassName() === className,
  ];
  const MESSAGE_PART = [
    ['InitFromPacket', 'SerializeBody'],
    value =>
      typeof value?.Init === 'function' &&
      typeof value.InitFromPacket === 'function' &&
      typeof value.prototype?.Body === 'function' &&
      typeof value.prototype?.Hdr === 'function',
  ];

  // The resolver also reports which parts it last failed to find (debug).
  const defineApi = (key, parts) => {
    const all = { ...parts, Message: MESSAGE_PART };
    let missing = [];
    const resolve = () => {
      const found = {};
      const api = SE.findModule(key, (src, id, req) => {
        for (const [part, [markers, pick]] of Object.entries(all)) {
          if (!found[part]) found[part] = exportOf(src, id, req, markers, pick);
        }
        return Object.keys(all).every(part => found[part]) ? found : null;
      });
      // A cached hit or miss skips the scan; only a fresh scan updates this.
      if (Object.keys(found).length) missing = Object.keys(all).filter(part => !found[part]);
      else if (api) missing = [];
      return api;
    };
    resolve.missing = () => missing;
    return resolve;
  };

  const callService = async (resolveApi, method, requestKey, fill) => {
    const api = resolveApi();
    const transport = SE.run(() => contextGlobal('g_FriendsUIApp').CMInterface.GetServiceTransport());
    if (!api) throw new Error(`service not found (missing: ${resolveApi.missing().join(', ') || 'unknown'})`);
    if (!transport) throw new Error('no service transport');
    const msg = api.Message.Init(api[requestKey]);
    fill(msg.Body());
    const res = await api.service[method](transport, msg);
    if (!res?.BSuccess?.()) throw new Error(`EResult ${SE.run(() => res.GetEResult())}`);
    return res.Body().toObject();
  };

  Object.assign(ns, { LOAD_TIMEOUT_MS, callService, createCache, defineApi, requestPart, servicePart });
});
