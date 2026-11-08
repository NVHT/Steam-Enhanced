/* Concurrent player count badge via Steam CM protobuf transport with Web API fallback. */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  window.__steamEnhancedPlayerCount?.destroy();

  const { C } = SE;
  const CACHE_TTL_MS = 60000;
  const cache = new Map();
  const numberFormat = new Intl.NumberFormat();

  let badge = null;
  let valueNode = null;
  let hostRow = null;
  let currentAppId = 0;
  let activeRequest = null;
  let frame = 0;
  let destroyed = false;

  const isValidAppId = id => Number.isSafeInteger(id) && id > 0 && id <= 4294967295;

  const resolveSelectedAppId = target => {
    const fromRow = SE.fromProps(target, 80, p => {
      const id = Number(
        p.overview?.appid ?? p.appOverview?.appid ?? p.app?.appid ?? p.appid ?? p.appId
      );
      return isValidAppId(id) ? id : undefined;
    });

    let fromRoute = 0;
    for (const owner of SE.owners()) {
      try {
        const path =
          owner.MainWindowBrowserManager?.m_lastLocation?.pathname ||
          owner.location?.pathname ||
          '';
        const match = path.match(/\/app\/(\d+)(?:\/|$)/);
        if (match) {
          fromRoute = Number(match[1]);
          break;
        }
      } catch (_) {}
    }

    if (fromRow && fromRoute && fromRow !== fromRoute) return 0;
    const resolved = fromRow || fromRoute;
    return isValidAppId(resolved) ? resolved : 0;
  };

  // Minimal protobuf codec for CMsgDPGetNumberOfCurrentPlayers (EMsg 5592).
  class PlayerRequest {
    constructor() {
      this.appid = 0;
    }
    serializeBinary() {
      const bytes = [8];
      let val = this.appid >>> 0;
      do {
        const low = val & 127;
        val >>>= 7;
        bytes.push(low | (val ? 128 : 0));
      } while (val);
      return new Uint8Array(bytes);
    }
    toObject() {
      return { appid: this.appid };
    }
    getClassName() {
      return 'CMsgDPGetNumberOfCurrentPlayers';
    }
  }

  class PlayerResponse {
    constructor() {
      this.result = 2;
      this.count = null;
    }
    static deserializeBinaryFromReader(body, reader) {
      while (reader.nextField() && !reader.isEndGroup()) {
        switch (reader.getFieldNumber()) {
          case 1:
            body.result = reader.readInt32();
            break;
          case 2:
            body.count = reader.readInt32();
            break;
          default:
            reader.skipField();
        }
      }
      return body;
    }
    eresult() {
      return this.result;
    }
    player_count() {
      return this.count;
    }
    toObject() {
      return { eresult: this.result, player_count: this.count };
    }
    getClassName() {
      return 'CMsgDPGetNumberOfCurrentPlayersResponse';
    }
  }

  let cachedMessageType = null;

  const resolveMessageType = () => {
    if (cachedMessageType) return cachedMessageType;
    for (const req of SE.requires()) {
      for (const [id, factory] of Object.entries(req.m || {})) {
        let src;
        try {
          src = Function.prototype.toString.call(factory);
        } catch (_) {
          continue;
        }
        if (!src.includes('InitFromPacket') || !src.includes('SerializeBody')) continue;
        try {
          for (const candidate of Object.values(req(id) || {})) {
            if (
              typeof candidate?.Init === 'function' &&
              typeof candidate.InitFromPacket === 'function' &&
              typeof candidate.prototype?.Serialize === 'function' &&
              typeof candidate.prototype?.Hdr === 'function'
            ) {
              cachedMessageType = candidate;
              return candidate;
            }
          }
        } catch (_) {}
      }
    }
    return null;
  };

  const resolveNativeTransport = () => {
    for (const owner of SE.owners()) {
      try {
        const cm = owner.g_FriendsUIApp?.CMInterface;
        if (typeof cm?.SendMsgAndAwaitResponse !== 'function') continue;
        const Message = resolveMessageType();
        if (Message) return { cm, Message };
      } catch (_) {}
    }
    return null;
  };

  const requestViaNativeCM = (transport, appid, signal) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('Request cancelled'));
        return;
      }
      const onAbort = () => reject(new Error('Request cancelled'));
      signal.addEventListener('abort', onAbort, { once: true });

      let operation;
      try {
        const message = transport.Message.Init(PlayerRequest, 5592);
        message.Body().appid = appid;
        operation = transport.cm.SendMsgAndAwaitResponse(message, PlayerResponse);
      } catch (err) {
        signal.removeEventListener('abort', onAbort);
        reject(err);
        return;
      }

      Promise.resolve(operation)
        .then(reply => {
          if (signal.aborted) return;
          const body = reply?.Body?.();
          const result = body?.eresult?.();
          if (reply?.BIsValid?.() === false || result !== 1) {
            throw new Error(
              `Native Steam player-count result ${result ?? reply?.GetEResult?.() ?? 'invalid'}`
            );
          }
          const count = body.player_count();
          if (!Number.isSafeInteger(count) || count < 0) {
            throw new Error('Invalid native player count');
          }
          resolve(count);
        })
        .catch(reject)
        .finally(() => signal.removeEventListener('abort', onAbort));
    });

  const fetchPlayerCount = async (appid, signal) => {
    const transport = resolveNativeTransport();
    if (transport) return requestViaNativeCM(transport, appid, signal);

    const url = new URL('https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/');
    url.searchParams.set('appid', String(appid));

    let response;
    try {
      response = await window.fetch(url, { credentials: 'omit', signal });
    } catch (err) {
      throw new Error(`Native Steam transport unavailable; web request: ${err?.message || err}`);
    }
    if (!response.ok) throw new Error(`Steam API HTTP ${response.status}`);
    const payload = (await response.json())?.response;
    if (payload?.result !== 1 || !Number.isSafeInteger(payload.player_count) || payload.player_count < 0) {
      throw new Error('Invalid Steam API response');
    }
    return payload.player_count;
  };

  const storeCacheEntry = (appid, entry) => {
    cache.delete(appid);
    cache.set(appid, entry);
    if (cache.size > 32) cache.delete(cache.keys().next().value);
  };

  const abortActiveRequest = () => {
    if (!activeRequest) return;
    const prev = activeRequest;
    activeRequest = null;
    clearTimeout(prev.timeout);
    prev.controller.abort();
    badge?.removeAttribute('aria-busy');
  };

  const unmountBadge = () => {
    abortActiveRequest();
    badge?.remove();
    badge = null;
    valueNode = null;
    hostRow = null;
    currentAppId = 0;
  };

  const renderBadge = entry => {
    if (!badge || !valueNode) return;
    const text = entry?.error ? 'Request failed' : entry ? numberFormat.format(entry.count) : 'Loading…';
    if (valueNode.textContent !== text) valueNode.textContent = text;

    const tip = entry?.error
      ? `Player count: ${entry.error}. Click to retry after one minute.`
      : 'Players currently in game on Steam. Updates once per minute; click to refresh.';
    if (badge.getAttribute('data-se-tip') !== tip) badge.setAttribute('data-se-tip', tip);

    const ariaLabel = `Players: ${text}`;
    if (badge.getAttribute('aria-label') !== ariaLabel) badge.setAttribute('aria-label', ariaLabel);

    const state = entry?.error ? 'error' : entry ? 'ready' : 'loading';
    if (badge.dataset.state !== state) badge.dataset.state = state;
  };

  const refreshBadge = async () => {
    if (
      destroyed ||
      !currentAppId ||
      !badge?.isConnected ||
      !SE.visible(badge) ||
      document.visibilityState === 'hidden'
    ) {
      return;
    }

    const id = currentAppId;
    const cached = cache.get(id);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      renderBadge(cached);
      return;
    }
    if (activeRequest?.id === id) return;

    abortActiveRequest();
    const job = { id, controller: new AbortController(), timeout: null, timedOut: false };
    activeRequest = job;
    job.timeout = setTimeout(() => {
      job.timedOut = true;
      job.controller.abort();
    }, 10000);
    badge.setAttribute('aria-busy', 'true');

    let entry;
    try {
      const count = await fetchPlayerCount(id, job.controller.signal);
      entry = { count, at: Date.now() };
    } catch (err) {
      if (job.controller.signal.aborted && !job.timedOut) return;
      const message = job.timedOut ? 'Request timed out' : err?.message || String(err);
      entry = { error: message, at: Date.now() };
      console.warn('[Steam Enhanced] Player count request failed', { appid: id, error: message });
    } finally {
      clearTimeout(job.timeout);
      if (activeRequest === job) {
        activeRequest = null;
        badge?.removeAttribute('aria-busy');
      }
    }

    if (
      destroyed ||
      currentAppId !== id ||
      !badge?.isConnected ||
      (job.controller.signal.aborted && !job.timedOut)
    ) {
      return;
    }
    storeCacheEntry(id, entry);
    renderBadge(entry);
  };

  const positionBadge = target => {
    const achievements = [...target.children].find(
      node =>
        node !== badge &&
        (node.classList.contains(C.MiniAchievements) || node.querySelector(`.${C.MiniAchievements}`))
    );
    if (achievements) {
      if (badge.nextElementSibling !== achievements) target.insertBefore(badge, achievements);
    } else if (target.lastElementChild !== badge) {
      target.append(badge);
    }
  };

  const mountBadge = target => {
    badge = document.createElement('button');
    badge.type = 'button';
    badge.id = 'se-player-count';
    badge.className = `${C.GameStat} se-player-count`;

    const icon = document.createElement('span');
    icon.className = 'se-player-count-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="9" cy="7" r="3"/><path d="M3 20v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 4v3"/></svg>';

    const textWrap = document.createElement('span');
    textWrap.className = 'se-player-count-text';

    const label = document.createElement('span');
    label.className = C.PlayBarLabel;
    label.textContent = 'Players';

    valueNode = document.createElement('span');
    valueNode.className = C.PlayBarDetailLabel;

    textWrap.append(label, valueNode);
    badge.append(icon, textWrap);
    badge.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      void refreshBadge();
    });

    positionBadge(target);
    renderBadge(cache.get(currentAppId));
  };

  const update = () => {
    frame = 0;
    if (destroyed) return;
    if (document.visibilityState === 'hidden') {
      abortActiveRequest();
      return;
    }
    // Defer to the standalone Player Count plugin if present.
    if (document.getElementById('playercount-badge')) {
      unmountBadge();
      return;
    }

    const stat = [...document.querySelectorAll(`.${C.InPage} .${C.GameStat}`)].find(
      node => node !== badge && SE.visible(node)
    );
    const target = stat?.closest(`.${C.GameStatsSection}`);
    const nextAppId = target && resolveSelectedAppId(target);

    if (!target || !nextAppId) {
      unmountBadge();
      return;
    }
    if (nextAppId !== currentAppId || target !== hostRow || !badge?.isConnected) {
      unmountBadge();
      currentAppId = nextAppId;
      hostRow = target;
      mountBadge(target);
    } else {
      positionBadge(target);
    }
    void refreshBadge();
  };

  const schedule = () => {
    if (!destroyed && !frame) frame = requestAnimationFrame(update);
  };

  const watcher = SE.watch(schedule, { attributes: ['class', 'hidden'], ignore: SE.inside(SE.SIDE) });
  const timer = SE.poll(() => update(), CACHE_TTL_MS, { active: () => !!badge && SE.visible(badge) });
  document.addEventListener('visibilitychange', schedule);

  const countForApp = async appid => {
    if (!isValidAppId(appid)) return null;
    const cached = cache.get(appid);
    if (cached && !cached.error && Date.now() - cached.at < CACHE_TTL_MS) {
      return cached.count;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const count = await fetchPlayerCount(appid, controller.signal);
      storeCacheEntry(appid, { count, at: Date.now() });
      return count;
    } catch (_) {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  window.__steamEnhancedPlayerCount = {
    count: countForApp,
    destroy() {
      destroyed = true;
      watcher.disconnect();
      timer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', schedule);
      unmountBadge();
      cache.clear();
      delete window.__steamEnhancedPlayerCount;
    },
  };

  update();
});
