/*
 * HowLongToBeat data and progress card for the Steam library game page.
 */
(() => {
  const LOCAL_PLUGIN = 'hltb-for-steam';
  const STORE_PLUGIN = 'hltb-for-millennium';
  const WIDGET = `#${LOCAL_PLUGIN}, #${STORE_PLUGIN}`;

  function createCard({ C, esc, mark, unmark, fromProps, appIdOf, appStore, own, drop, schedule }) {
    const STAT = `.${C.InPage} .${C.GameStat}`;

    function playtimeText(c) {
      const stats = [...c.querySelectorAll(STAT)];
      const el =
        stats.find((s) => /play\s*time|playtime/i.test(s.querySelector(`.${C.PlayBarLabel}`)?.textContent || '')) ||
        stats.find((s) => s.matches(`.${C.PlayBar_Playtime}:not([id])`));
      return el?.querySelector(`.${C.PlayBarDetailLabel}`)?.textContent || '';
    }

    function hours(text) {
      const t = String(text || '').replace(/½/g, '.5').replace(',', '.');
      const n = parseFloat((t.match(/\d+(?:\.\d+)?/) || [])[0]);
      if (!isFinite(n)) return NaN;
      return /min/i.test(t) ? n / 60 : n;
    }

    const fmt = (n) => (n >= 1000 ? n.toFixed(0) : n.toFixed(1)).replace(/\.0$/, '');
    const shortLabel = (l) => l.replace(/^main story$/i, 'Main').replace(/^main \+ extras?$/i, 'Main + extras');
    const TICK =
      '<svg class="se-hltb-tick" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="8"/><path d="M4.5 8.2l2.3 2.3 4.7-4.9"/></svg>';

    function hltbHtml(times, vals, played) {
      const you = isFinite(played) && played > 0;
      const last = vals[vals.length - 1];
      const stageName = (i) => {
        const n = shortLabel(times[i][1]);
        return /^main \+ extras$/i.test(n) ? '+ Extras' : n;
      };
      const goalName = (i) => {
        const n = shortLabel(times[i][1]);
        return /^main$/i.test(n) ? 'the main story' : n.toLowerCase();
      };
      let prev = 0;
      let bars = '';
      let labs = '';
      vals.forEach((v, i) => {
        const f = you ? Math.max(0, Math.min(1, (played - prev) / Math.max(0.01, v - prev))) : 0;
        const st = f >= 1 ? 'done' : f > 0 ? 'now' : 'next';
        const w = `${(f * 100).toFixed(1)}%`;
        bars += `<span class="se-hltb-seg" data-st="${st}"><span style="width:${w}"></span>${st === 'now' ? `<i style="left:${w}"></i>` : ''}</span>`;
        labs += `<span class="se-hltb-stage"><span class="se-hltb-val">${fmt(v)}h${you && played >= v ? TICK : ''}</span><span class="se-hltb-lab">${esc(stageName(i))}</span></span>`;
        prev = v;
      });
      let foot = '';
      if (you) {
        const k = vals.findIndex((v) => played < v);
        foot =
          k >= 0
            ? `<b>${fmt(vals[k] - played)} h</b> to ${esc(goalName(k))}`
            : `<b>${(played / last).toFixed(1).replace(/\.0$/, '')}×</b> the ${esc(goalName(vals.length - 1))} time`;
      }
      return (
        `<div class="se-hltb-head"><span class="se-hltb-title">How long to beat</span>${you ? `<span class="se-hltb-you">You: ${fmt(played)} h</span>` : ''}</div>` +
        `<div class="se-hltb-bars"${you && played >= last ? ' data-all' : ''}>${bars}</div><div class="se-hltb-stages">${labs}</div>` +
        (foot ? `<div class="se-hltb-foot">${foot}</div>` : '')
      );
    }

    const hltbResults = new Map();
    const hltbRequests = new Map();
    let destroyed = false;
    let activePlugin;

    async function requestHltb(plugin, appid, name, refresh = false) {
      let result = await window.__sePluginRpc.call(
        plugin, 'GetHltbData', [appid, name || null, refresh]
      );
      for (let depth = 0; typeof result === 'string' && depth < 2; depth++) result = JSON.parse(result);
      if (result?.success !== true) throw new Error(result?.error || 'HLTB plugin returned an invalid response');
      return result;
    }

    async function findHltbBackend(appid, name) {
      const preferred = activePlugin ??
        (document.getElementById(STORE_PLUGIN) && !document.getElementById(LOCAL_PLUGIN)
          ? STORE_PLUGIN
          : LOCAL_PLUGIN);

      try {
        return { plugin: preferred, result: await requestHltb(preferred, appid, name) };
      } catch {
        if (destroyed) return null;
        const fallback = preferred === LOCAL_PLUGIN ? STORE_PLUGIN : LOCAL_PLUGIN;
        return { plugin: fallback, result: await requestHltb(fallback, appid, name) };
      }
    }

    function loadHltb(appid, name) {
      if (hltbRequests.has(appid)) return;
      const request = (async () => {
        try {
          const backend = await findHltbBackend(appid, name);
          if (destroyed || !backend) return;
          const { plugin, result } = backend;
          activePlugin = plugin;
          hltbResults.set(appid, { data: result.data, expires: Date.now() + 300000 });
          schedule();
          // Use the plugin's stale cache immediately, then refresh it once.
          if (result.fromCache && (result.isStale || !result.data?.game_id)) {
            const fresh = await requestHltb(plugin, appid, name, true);
            if (!destroyed) hltbResults.set(appid, { data: fresh.data, expires: Date.now() + 300000 });
          }
        } catch (error) {
          if (!destroyed) {
            const cached = hltbResults.get(appid);
            hltbResults.set(appid, { data: cached?.data, expires: Date.now() + 60000 });
            console.warn('[Steam Enhanced] HLTB plugin:', error);
          }
        } finally {
          hltbRequests.delete(appid);
          while (hltbResults.size > 200) hltbResults.delete(hltbResults.keys().next().value);
          if (!destroyed) schedule();
        }
      })();
      hltbRequests.set(appid, request);
    }

    function restoreWidget() {
      for (const source of document.querySelectorAll(WIDGET)) unmark(source, 'data-se-copied');
    }

    function placeHltb(c) {
      const appid = appIdOf(c);
      let card = c.querySelector(':scope > .se-hltb-card');
      if (!Number.isSafeInteger(appid) || appid <= 0) {
        drop(card);
        restoreWidget();
        return;
      }
      const cached = hltbResults.get(appid);
      if ((!cached || cached.expires <= Date.now()) && window.__sePluginRpc) {
        const name = appStore?.()?.GetAppOverviewByAppID(appid)?.display_name ||
          fromProps(c, 120, (p) => p.overview?.display_name || p.appOverview?.display_name);
        loadHltb(appid, name);
      }
      const times = [
        [cached?.data?.comp_main, 'Main Story'],
        [cached?.data?.comp_plus, 'Main + Extras'],
        [cached?.data?.comp_100, 'Completionist'],
      ].filter(([value]) => typeof value === 'number' && isFinite(value) && value > 0);
      if (!times.length) {
        drop(card);
        restoreWidget();
        return;
      }
      const vals = times.map(([value]) => value);
      const played = hours(playtimeText(c));
      if (!card) {
        card = own('div', 'se-hltb-card');
        card.dataset.seSec = 'hltb';
      }
      const sig = JSON.stringify([appid, times, played]);
      if (card.dataset.sig !== sig) {
        card.dataset.sig = sig;
        card.innerHTML = hltbHtml(times, vals, played);
      }
      if (card.parentElement !== c) c.appendChild(card);
      for (const source of document.querySelectorAll(WIDGET)) mark(source, 'data-se-copied');
    }

    addEventListener('se-plugin-rpc-ready', schedule);

    return {
      place: placeHltb,
      destroy() {
        destroyed = true;
        hltbResults.clear();
        hltbRequests.clear();
        removeEventListener('se-plugin-rpc-ready', schedule);
        restoreWidget();
      },
    };
  }

  window.__seHltb = { createCard, widgetSelector: WIDGET };
  dispatchEvent(new Event('se-hltb-ready'));
})();
