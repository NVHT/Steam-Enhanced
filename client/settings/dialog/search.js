/*
 * Steam Settings, Game Properties and Millennium Settings: the settings search bar (catalogue,
 * scoring, results, jumping to a hit).
 *
 * Part of client/settings/dialog/ (see shared.js).
 */
((SE) => {
  const ns = window.__seSettingsParts;
  if (!ns) return;
  const { C, attr: setAttr } = SE;
  const { ACTIVE, BY_NAME, FIELD, ITEM, LABEL, LIST, OPTIONS, PAGES, TEXT, text } = ns;
  const { live } = ns;

  const LEARNED_KEY = 'se-settings-index';
  let learned = {};
  try {
    learned = JSON.parse(localStorage.getItem(LEARNED_KEY) || '{}') || {};
  } catch {
    learned = {};
  }
  let pendingHit = null;
  let hitTries = 0;

  const norm = (t) => (t || '').toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

  function pageItems() {
    const list = document.querySelector(LIST);
    return list ? [...list.querySelectorAll(ITEM)] : [];
  }

  function pageNameOf(item) {
    return text(item.querySelector(TEXT) || item);
  }

  function catalogue() {
    const items = pageItems();
    const out = [];
    const seen = new Set();
    items.forEach((item, i) => {
      const name = pageNameOf(item);
      const en = BY_NAME.get(name.toLowerCase())?.[0] || (items.length === PAGES.length ? PAGES[i][0] : null);
      const labels = [...((en && OPTIONS[en]) || []), ...(learned[name] || [])];
      const mine = [];
      for (const label of labels) {
        const n = norm(label);
        if (mine.some((m) => n.startsWith(m) || m.startsWith(n))) continue;
        mine.push(n);
        const key = `${i}|${n}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push([label, i]);
        }
      }
    });
    return out;
  }

  function score(label, q) {
    const l = norm(label);
    const lw = l.split(/[^a-z0-9\u00c0-\uffff]+/).filter(Boolean);
    const words = q.split(' ').filter(Boolean);
    const hit = (w) => lw.some((x) => x.startsWith(w)) || (w.length >= 4 && l.includes(w));
    if (!words.length || !words.every(hit)) return -1;
    if (l.startsWith(q)) return 3;
    if (lw.some((x) => x.startsWith(words[0]))) return 2;
    return 1;
  }

  function renderResults(q) {
    if (!live.results) return;
    const items = pageItems();
    const hits = q
      ? catalogue()
          .map(([label, i]) => [score(label, q), label, i])
          .filter((h) => h[0] > 0)
          .sort((a, b) => b[0] - a[0] || a[1].length - b[1].length)
          .slice(0, 8)
      : [];

    live.results.replaceChildren();
    live.results.hidden = !hits.length;
    if (!hits.length) return;

    live.cursor = Math.min(live.cursor, hits.length - 1);
    const head = document.createElement('div');
    head.className = 'se-settings-results-head';
    head.textContent = 'Settings';
    live.results.append(head);

    hits.forEach(([, label, i], n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'se-settings-result';
      if (n === live.cursor) b.setAttribute('data-se-cur', '');
      const t = document.createElement('span');
      t.textContent = label;
      const p = document.createElement('span');
      p.className = 'se-settings-result-page';
      p.textContent = items[i] ? pageNameOf(items[i]) : '';
      b.append(t, p);
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => open(i, label));
      live.results.append(b);
    });
  }

  function filter(list, q) {
    const query = norm(q);
    if (list) {
      setAttr(list, 'data-se-filtering', query ? '' : null);
      for (const item of list.querySelectorAll(ITEM)) {
        const t = norm(pageNameOf(item));
        setAttr(item, 'data-se-miss', query && !t.includes(query) ? '' : null);
      }
    }
    renderResults(query);
  }

  function open(index, label) {
    const item = pageItems()[index];
    if (!item) return;
    pendingHit = label ? norm(label) : null;
    hitTries = 0;
    item.click();
    ns.schedule();
  }

  function revealHit(content) {
    if (!pendingHit || !content) return;
    const target = pendingHit;
    const candidates = content.querySelectorAll(
      `${LABEL}, [data-se-sec], [data-se-seglabel], .SettingsDialogSubHeader, .DialogControlsSectionHeader, .${C.Header}, button, .${C.NotificationSectionHeader}, .${C.SettingsDialogBodyText}, .${C.Title}`
    );
    let best = null;
    for (const el of candidates) {
      const t = norm(el.textContent);
      if (!t) continue;
      if (t === target || t.startsWith(target) || (target.length > 6 && t.includes(target))) {
        best = el;
        break;
      }
    }
    if (!best) {
      if (++hitTries > 40) pendingHit = null;
      else setTimeout(ns.schedule, 50);
      return;
    }
    pendingHit = null;
    const row =
      best.closest(
        `${FIELD}, [data-se-c], .${C.RecordingModeOption}, .${C.ActionSection} button, .${C.NotificationSectionHeader}`
      ) || best;

    let sc = row.parentElement;
    while (sc && sc !== document.body) {
      const oy = getComputedStyle(sc).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && sc.scrollHeight > sc.clientHeight + 1) break;
      sc = sc.parentElement;
    }
    if (sc && sc !== document.body) {
      const r = row.getBoundingClientRect();
      const b = sc.getBoundingClientRect();
      sc.scrollTo({
        top: sc.scrollTop + (r.top - b.top) - (b.height - r.height) / 2,
        behavior: 'smooth',
      });
    }
    row.removeAttribute('data-se-hit');
    void row.offsetWidth;
    row.setAttribute('data-se-hit', '');
    setTimeout(() => row.removeAttribute('data-se-hit'), 2400);
  }

  function learn(content, list) {
    const active = list?.querySelector(`${ITEM}.${ACTIVE}`);
    if (!active || !content) return;
    const name = pageNameOf(active);
    const labels = [
      ...new Set(
        [...content.querySelectorAll(`${LABEL}, .SettingsDialogSubHeader, .DialogControlsSectionHeader, .${C.Header}`)]
          .map((el) => text(el))
          .filter((t) => t && t.length <= 120)
      ),
    ];
    if (!labels.length) return;
    const prev = learned[name] || [];
    if (labels.length === prev.length && labels.every((l, i) => l === prev[i])) return;
    learned[name] = labels;
    try {
      localStorage.setItem(LEARNED_KEY, JSON.stringify(learned));
    } catch {}
  }
  Object.assign(ns, { filter, learn, norm, pageNameOf, revealHit });
})(window.__se);
