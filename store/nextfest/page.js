/*
 * Steam Next Fest (/sale/nextfest/): between editions, turns the "Coming Soon" text section
 * into a countdown hero (nextfest/page.css).
 *
 * Steam's text section reads "Save the Dates: Feb 22 - Mar 1, 2027" in one <b>. When that
 * parses, the hero gets its parts in the theme's own nodes, so the copy can be set apart:
 *  - an eyebrow ("Save the dates"), the range as the headline, in the viewer's locale;
 *  - a live countdown to the start (10:00 Pacific, when every Next Fest opens), then to the
 *    end while the fest runs ("Live now"); it is removed once the fest is over.
 * When it doesn't parse (another language, a new wording), Steam's line stays as it is.
 *
 * It also lines the reminder's pop-up up with the page's button (see "Reminder menu").
 */
export default (dom) => {
  const { el, setText, setVar, scope } = dom;
  const life = scope();

  const DATE_LINE = '.SaleOuterContainer .text_section .SaleTextCtn .SaveDate';
  const PACIFIC = 'America/Los_Angeles';
  const START_HOUR = 10;

  /* ---------- Dates ---------- */

  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  // "Feb 22 - Mar 1, 2027", "February 22 – 28, 2027" (end month optional).
  const RANGE = /\b([A-Za-z]{3,9})\.?\s+(\d{1,2})\s*[-–—]\s*(?:([A-Za-z]{3,9})\.?\s+)?(\d{1,2}),?\s+(\d{4})\b/;
  const monthIndex = (name) => MONTHS.indexOf(name.slice(0, 3).toLowerCase());

  const zoneParts = new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  });

  /** Offset of Pacific time from UTC at an instant, in ms. */
  const zoneOffset = (instant) => {
    const parts = Object.fromEntries(zoneParts.formatToParts(instant).map(({ type, value }) => [type, Number(value)]));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) - instant;
  };

  /** A Pacific wall-clock time as an instant (DST-correct; two passes settle any edge). */
  const pacificTime = (year, month, day, hour) => {
    const wall = Date.UTC(year, month, day, hour);
    return wall - zoneOffset(wall - zoneOffset(wall));
  };

  /** { start, end } instants from Steam's date line, or null. */
  const parseRange = (text) => {
    const match = RANGE.exec(text);
    if (!match) return null;
    const [, fromMonth, fromDay, toMonth, toDay, yearText] = match;
    const year = Number(yearText);
    const from = monthIndex(fromMonth);
    const to = toMonth ? monthIndex(toMonth) : from;
    if (from < 0 || to < 0) return null;
    // "Dec 28 - Jan 4, 2027": the year printed is the end's.
    const start = pacificTime(to < from ? year - 1 : year, from, Number(fromDay), START_HOUR);
    const end = pacificTime(year, to, Number(toDay), START_HOUR);
    return end > start ? { start, end } : null;
  };

  const formatRange = ({ start, end }) => {
    const format = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: PACIFIC });
    return format.formatRange(start, end);
  };

  /* ---------- Hero parts ---------- */

  const UNITS = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
    ['second', 1],
  ];
  // One formatter per unit, made once: the countdown asks for labels every second.
  const unitFormats = new Map(UNITS.map(([unit]) => [unit, new Intl.NumberFormat(undefined, { style: 'unit', unit, unitDisplay: 'long' })]));
  const unitLabel = (unit, value) =>
    unitFormats.get(unit).formatToParts(value).filter(({ type }) => type === 'unit').map(({ value: label }) => label).join('');

  const buildHeading = (range) =>
    el('div', { 'data-se-nf-heading': true }, [
      el('span', { 'data-se-nf-eyebrow': true, text: 'Save the dates' }),
      el('time', { 'data-se-nf-range': true, dateTime: new Date(range.start).toISOString(), text: formatRange(range) }),
    ]);

  /** The countdown: a status line over four tiles; render() fills them for a moment in time. */
  const buildCountdown = (range) => {
    const status = el('span', { 'data-se-nf-status': true });
    const values = UNITS.map(([unit, size]) => ({
      unit,
      size,
      value: el('span', { 'data-se-nf-value': true }),
      label: el('span', { 'data-se-nf-label': true }),
    }));
    const node = el('div', { 'data-se-nf-countdown': true, role: 'timer', 'aria-live': 'off' }, [
      status,
      el('div', { 'data-se-nf-tiles': true }, values.map(({ unit, value, label }) => el('div', { 'data-se-nf-tile': `${unit}s` }, [value, label]))),
    ]);

    /** @returns {boolean} false once the fest is over. */
    const render = (now) => {
      if (now >= range.end) return false;
      const live = now >= range.start;
      node.toggleAttribute('data-se-nf-live', live);
      setText(status, live ? 'Live now · ends in' : 'Starts in');
      let rest = Math.max(0, Math.floor(((live ? range.end : range.start) - now) / 1000));
      for (const { unit, size, value, label } of values) {
        const amount = Math.floor(rest / size);
        rest -= amount * size;
        setText(value, unit === 'day' ? String(amount) : String(amount).padStart(2, '0'));
        setText(label, unitLabel(unit, amount));
      }
      return true;
    };

    return { node, render };
  };

  /* ---------- Wiring ---------- */

  let state = null; // { line, heading, countdown }
  let timer = 0;

  const stopTimer = () => {
    clearTimeout(timer);
    clearInterval(timer);
    timer = 0;
  };

  const detach = () => {
    stopTimer();
    if (!state) return;
    state.heading.remove();
    state.countdown.node.remove();
    state.line.removeAttribute('data-se-nf-parsed');
    state = null;
  };
  life.add(detach);

  const tick = () => {
    if (state && !state.countdown.render(Date.now())) {
      stopTimer();
      state.countdown.node.remove();
    }
  };

  const attach = () => {
    const line = document.querySelector(DATE_LINE);
    if (state && state.line === line && state.heading.isConnected) return;
    detach();
    if (!line) return;
    const range = parseRange(line.textContent);
    if (!range || Date.now() >= range.end) return;

    state = { line, heading: buildHeading(range), countdown: buildCountdown(range) };
    line.setAttribute('data-se-nf-parsed', '');
    line.after(state.heading, state.countdown.node);
    tick();
    // Aligned to the second, so the seconds tile turns over with the clock. One id for the
    // lead-in and the interval (they share a pool), so stopTimer() stops either.
    timer = setTimeout(() => {
      tick();
      if (state) timer = setInterval(tick, 1000);
    }, 1000 - (Date.now() % 1000));
  };

  /* ---------- Reminder menu ---------- */

  /*
   * "Set a reminder" opens a pop-up on <body> that starts with its own copy of the button,
   * meant to cover the page's button exactly, with the menu under it. Steam places it from its
   * stock button height, so with the theme's taller pill the copy lands below the real one. The
   * pop-up is moved by the difference (--se-nf-menu-x / -y, read by nextfest/page.css),
   * measured from where the copy is now, so it settles in one pass.
   */
  const MENU = '._8D33ZtA7ymg-';
  const BUTTON = '.RemindMeWidget';

  const alignMenu = () => {
    const menu = [...document.querySelectorAll(MENU)].find((node) => node.querySelector(BUTTON));
    const anchor = document.querySelector(`.SaleOuterContainer ${BUTTON}`);
    if (!menu || !anchor) return;
    const target = anchor.getBoundingClientRect();
    const current = menu.querySelector(BUTTON).getBoundingClientRect();
    if (!target.width || !current.width) return;
    const dx = target.left + target.width / 2 - (current.left + current.width / 2);
    const dy = target.top - current.top;
    const x = parseFloat(menu.style.getPropertyValue('--se-nf-menu-x')) || 0;
    const y = parseFloat(menu.style.getPropertyValue('--se-nf-menu-y')) || 0;
    if (Math.abs(dx) > 0.5) setVar(menu, '--se-nf-menu-x', `${Math.round(x + dx)}px`);
    if (Math.abs(dy) > 0.5) setVar(menu, '--se-nf-menu-y', `${Math.round(y + dy)}px`);
  };
  life.add(() => {
    for (const menu of document.querySelectorAll(MENU)) {
      menu.style.removeProperty('--se-nf-menu-x');
      menu.style.removeProperty('--se-nf-menu-y');
    }
  });

  const sync = () => {
    attach();
    alignMenu();
  };

  // Steam opens the pop-up with classes ("visible ready") and may restyle it as it settles;
  // only the pop-up's own class/style changes matter.
  life.observe(sync, {
    attributes: ['class', 'style'],
    filter: (record) => record.type !== 'attributes' || record.target.matches?.(MENU),
  });
  life.listen(window, 'resize', dom.perFrame(alignMenu));
  sync();

  return () => life.destroy();
};
