/*
 * Reading Steam's transfer block: selectors, icons, text and number helpers, the pause button.
 */
((SE) => {
  const ns = window.__seDownloadsParts;
  if (!ns) return;
  const { C } = SE;
  const { LINKS_ROW } = ns;

  // ---------------------------------------------------------------------------------------
  // Hero: the transfer in progress, drawn by the theme (Steam's own block stays mounted, out
  // of sight, as the data source; Pause and the links press Steam's own buttons).
  // ---------------------------------------------------------------------------------------
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SEL = {
    name: `.${C.ActiveItemLiveRegion_Name}`,
    tag: `.${C.ContentTypes} .${C.ContentType}`,
    bar: `.${C.ProgressBar}`,
    installBar: `.${C.Disk}`,
    barLabel: `.${C.Autofocused_Label}, .${C.State}`,
    timeLeft: `.${C.DownloadTimeRemaining}`,
    stat: `.${C.SingleStat}`,
    statValue: `.${C.Figure}`,
    statLabel: `.${C.LegendText}`,
    controls: `.${C.Bottom}`,
    // Steam's pause/resume: its action slot, its action-button class, or any button-like
    // element; class names and tags vary between builds
    pause: `.${C.ButtonWrapper} > *, .${C.ActiveItemLiveRegion_Button}, button, .DialogButton, [role="button"]`,
    links: `${LINKS_ROW} > *`,
    graph: `.${C.DownloadGraphWrapper}`,
    graphBar: `.${C.GraphBarWrapper}, .${C.GraphBarDownload}`,
    diskLine: `.${C.GraphLine}`,
    scroller: `.${C.TopSection} > .${C.Section}`,
  };
  // Dual-tone stat icons: a soft filled shape under a solid stroke, both in currentColor
  const STAT_ICON = {
    network: '<path class="tone" d="M7.5 19h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6.4 9.9 4.6 4.6 0 0 0 7.5 19z"/>' +
      '<path d="M12 10.5v6.5m-3-3 3 3 3-3"/>',
    peak: '<path class="tone" d="M13.5 2.5 4.5 14h7l-1.2 7.5 9.2-12h-7.2z"/>' +
      '<path d="M13.5 2.5 4.5 14h7l-1.2 7.5 9.2-12h-7.2z"/>',
    disk: '<path class="tone" d="M3.5 13.5h17v5a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/>' +
      '<path d="M3.5 13.5 6.2 5.5h11.6l2.7 8"/><path d="M16.5 16.75h.01M13.5 16.75h.01"/>',
  };

  const ICON = {
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    resume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
  };

  const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
  // Each text node separated by a space: Steam splits labels and values into separate nodes
  // ("Paused" + "41%"), and textContent would glue them together
  const textOf = (el) => {
    if (!el) return '';
    const parts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement?.closest('svg, .se-dl-label')) continue;
      const text = node.nodeValue.trim();
      if (text) parts.push(text);
    }
    return clean(parts.join(' '));
  };
  const round = (n) => Math.round(n * 10) / 10;
  const percentOf = (bar) => {
    const now = parseFloat(bar?.closest('[role="progressbar"]')?.getAttribute('aria-valuenow') ??
      bar?.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow') ??
      bar?.getAttribute('aria-valuenow'));
    if (Number.isFinite(now)) return now;
    const width = parseFloat(bar?.querySelector(':scope > div')?.style.width);
    return Number.isFinite(width) ? width : null;
  };

  // Writes only on change: the update runs every tick and Steam's DOM is watched
  const setText = (el, value) => {
    if (el.textContent !== value) el.textContent = value;
  };
  const setHidden = (el, hidden) => {
    if (el.hidden !== hidden) el.hidden = hidden;
  };

  // The outermost button-like element, outside the links row: nested matches are its parts
  function findPause(root) {
    if (!root) return null;
    const links = root.querySelector(LINKS_ROW);
    return [...root.querySelectorAll(SEL.pause)].find((el) =>
      !links?.contains(el) && !el.parentElement.closest(SEL.pause) && (el.querySelector('svg') || textOf(el))
    ) || null;
  }

  function readTransfer(item) {
    const bars = [...item.querySelectorAll(SEL.bar)].map((bar) => {
      const host = bar.parentElement;
      const label = textOf(host?.querySelector(SEL.barLabel));
      const figures = clean(textOf(host).replace(label, '')
        .replace(/^(?:paused|queued|waiting|downloading|installing|updating)\b\s*/i, '')
        .replace(/^\d+(?:[.,]\d+)?\s*%$/, ''));
      return { install: bar.matches(SEL.installBar), label, figures, value: percentOf(bar) };
    });
    const download = bars.find((bar) => !bar.install) || null;
    const install = bars.find((bar) => bar.install) || null;
    const controls = item.querySelector(SEL.controls);
    return {
      name: textOf(item.querySelector(SEL.name)),
      tags: [...new Set([...item.querySelectorAll(SEL.tag)].map(textOf).filter(Boolean))],
      download,
      install,
      timeLeft: textOf(item.querySelector(SEL.timeLeft)),
      stats: [...item.querySelectorAll(SEL.stat)].slice(0, 3).map((stat) => ({
        value: textOf(stat.querySelector(SEL.statValue)),
        label: textOf(stat.querySelector(SEL.statLabel)),
      })),
      button: findPause(controls) || findPause(item),
      links: [...item.querySelectorAll(SEL.links)].filter((el) => textOf(el)),
      graph: item.querySelector(SEL.graph),
    };
  }

  Object.assign(ns, { ICON, SEL, STAT_ICON, SVG_NS, findPause, readTransfer, round, setHidden, setText, textOf });
})(window.__se);
