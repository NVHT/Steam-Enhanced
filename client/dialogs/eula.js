/*
 * EULA, rebuilt: the game's hero art bleeds in behind the top under its capsule and name (Steam's
 * intro line stays as the subtitle), the language picker shares a toolbar row with a reading
 * estimate, a progress meter and a jump to the end (or back to the top), and the agreement fades
 * at whichever edge has more to scroll.
 *
 * Steam renders the dialog from module 61398 (CSS module 70446): a GenericConfirmDialog whose
 * content carries EulaModalDialog, DialogHeader "EULA", then EulaDialogContent holding
 * DialogBodyText (EulaIntro), and once the agreement has loaded LanguageFieldContainer (only with
 * two or more languages) and EULAScrolling (EULAContent, BBCode), else EULAThrobber or EULAError,
 * then the footer's ConfirmButtons (Accept, Cancel).
 *
 * Every native node stays mounted and React keeps owning it. The theme reads { appid } from the
 * live fibers, marks the dialog ([data-se-eula]) and adds its own nodes only where React's child
 * lists never change: the start of DialogBodyText, the end of EulaDialogContent and of
 * DialogContent. Accepting is still Steam's button; reading isn't enforced.
 *
 * Big Picture (.GamepadMode) keeps Steam's dialog.
 */
(window.__se ? fn => fn(window.__se) : fn => addEventListener('se-core', () => fn(window.__se), { once: true }))(SE => {
  window.__steamEnhancedEula?.destroy();

  /* EulaModalDialog CSS module (70446) */
  const C = {
    modal: '._3jj_KvFzq6XW7NasX_7Tvv',
    content: '._2YXHRFCzmxgvxVGtA3TWVf',
    intro: '._3q_Ir9vDx5xeUcjwJEW8_k',
    scrolling: '._7lXDajp5HNY9Kpnbeykv',
    text: '._1dbgUdk0xgEX7E4Db_r5mb',
  };

  const OURS = 'se-eula';
  const ROOT = 'data-se-eula';
  const EDGE = 'data-se-eula-edge';
  const READ = 'data-se-eula-read';
  const MAX_DEPTH = 12;
  const WORDS_PER_MINUTE = 230;
  const END_SLACK = 8; // px from the bottom that counts as the end
  const PANEL = '--eula-panel-h'; // the agreement's height (eula.css), set by fit()
  const MIN_PANEL = 160;

  /* Duotone: `d` is the soft fill layer under the stroke (styles: .se-eula-tools svg .d) */
  const ICONS = {
    down: '<circle class="d" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="M12 7.8v8M8.8 12.8l3.2 3.2 3.2-3.2"/>',
    up: '<circle class="d" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="M12 16.2v-8M8.8 11.2L12 8l3.2 3.2"/>',
    clock: '<circle class="d" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  };

  const views = new Set();
  const viewOf = new WeakMap();

  /* ---------- Helpers ---------- */

  const attempt = (fn, fallback) => {
    try {
      return fn();
    } catch (err) {
      console.warn('[Steam Enhanced] EULA:', err);
      return fallback;
    }
  };

  const { el } = SE;

  const { setText } = SE;

  const { icon, setIcon } = SE.icons(ICONS);


  const isOurs = SE.inside(`.${OURS}`);

  /* Tries each URL in turn; drops the image (and calls onFail) when none loads */
  const loadFirst = (img, urls, onLoad, onFail) => {
    let index = 0;
    const next = () => {
      if (index < urls.length) img.src = urls[index++];
      else onFail();
    };
    img.addEventListener('load', onLoad);
    img.addEventListener('error', next);
    next();
  };

  /* ---------- Reading Steam's state ---------- */

  const readAppId = node => {
    let fiber = SE.liveFiber?.(node);
    for (let depth = 0; fiber && depth < MAX_DEPTH; fiber = fiber.return, depth++) {
      const props = fiber.memoizedProps;
      if (props && typeof props === 'object' && props.eulaWorkflow && Number(props.appid) > 0) return Number(props.appid);
    }
    return 0;
  };

  const appName = appid => attempt(() => SE.appStore?.()?.GetAppOverviewByAppID(appid)?.display_name, '') || '';

  const scrolls = node => {
    if (node.scrollHeight - node.clientHeight <= END_SLACK) return false;
    const { overflowY } = getComputedStyle(node);
    return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
  };

  /*
   * The element that actually scrolls the agreement: Steam's scroll panel wraps EULAContent in
   * its own scroller, so walk from the text up to EULAScrolling and take the first that scrolls.
   */
  const scrollerOf = scrolling => {
    for (let node = scrolling.querySelector(C.text); node; node = node.parentElement) {
      if (scrolls(node)) return node;
      if (node === scrolling) break;
    }
    return scrolling;
  };

  /*
   * Bottom edge of what clips the dialog: the dialog itself or the modal frame around it (any of
   * them that clip or scroll), else the window. Wrappers inside the dialog don't count: they
   * hug the footer and would always read as overflowing.
   */
  const clipBottom = root => {
    const doc = root.ownerDocument;
    let bottom = doc.defaultView.innerHeight;
    for (let cur = root; cur && cur !== doc.documentElement; cur = cur.parentElement) {
      if (getComputedStyle(cur).overflowY === 'visible') continue;
      const rect = cur.getBoundingClientRect();
      bottom = Math.min(bottom, rect.top + cur.clientTop + cur.clientHeight);
    }
    return bottom;
  };

  /* ---------- Header: hero art, capsule, name ---------- */

  const buildArt = (host, appid) => {
    const art = el('div', `${OURS} ${OURS}-art se-dialog-art`);
    art.setAttribute('aria-hidden', 'true');
    const img = el('img');
    img.alt = '';
    img.decoding = 'async';
    art.append(img);
    loadFirst(img, attempt(() => SE.heroURLs(appid), []) ?? [], () => SE.mark(art, 'data-ready'), () => art.remove());
    host.append(art);
    return art;
  };

  const buildGame = (body, appid) => {
    const game = el('div', `${OURS} ${OURS}-game`);
    const capsule = el('div', `${OURS}-capsule`);
    const img = el('img');
    img.alt = '';
    img.decoding = 'async';
    capsule.append(img);
    const name = el('div', `${OURS}-name`, appName(appid));
    game.append(capsule, name);
    const cdn = `https://shared.steamstatic.com/store_item_assets/steam/apps/${appid}`;
    loadFirst(img, [`/assets/${appid}/header.jpg`, `${cdn}/header.jpg`], () => SE.mark(capsule, 'data-ready'), () => capsule.remove());
    body.prepend(game);
    return { game, name };
  };

  /* ---------- Toolbar: reading time, progress, jump ---------- */

  const buildTools = content => {
    const tools = el('div', `${OURS} ${OURS}-tools`);

    const time = el('span', `${OURS}-time`);
    const timeText = el('span');
    time.append(icon('clock'), timeText);

    const meter = el('span', `${OURS}-meter`);
    meter.setAttribute('role', 'progressbar');
    meter.setAttribute('aria-valuemin', '0');
    meter.setAttribute('aria-valuemax', '100');
    meter.setAttribute('aria-label', 'Read so far');
    const track = el('span', `${OURS}-meter-track`);
    const fill = el('i');
    track.append(fill);
    const percent = el('span', `${OURS}-meter-text`);
    meter.append(track, percent);

    const jump = el('button', `${OURS}-jump`);
    jump.type = 'button';
    const jumpIcon = icon('down');
    const jumpText = el('span');
    jump.append(jumpIcon, jumpText);

    tools.append(time, meter, jump);

    /* Edge fades: a layer over the agreement (same grid cell), never inside Steam's scroller */
    const fade = el('div', `${OURS} ${OURS}-fade`);
    fade.setAttribute('aria-hidden', 'true');

    content.append(tools, fade);
    return { tools, fade, timeText, meter, fill, percent, jump, jumpIcon, jumpText };
  };

  /* ---------- View ---------- */

  const createView = root => {
    const cleanups = [];
    let art = null;
    let game = null;
    let tools = null;
    let appid = 0;
    let watched = null; // EULAScrolling, while bound
    let scroller = null; // what scrolls inside it
    let scrollCleanup = null;
    let words = -1;
    let frame = 0;

    const content = () => root.querySelector(C.content);

    /* Progress and edges from the scroller's position */
    const measure = () => {
      if (!tools || !scroller) return;
      const max = scroller.scrollHeight - scroller.clientHeight;
      const scrollable = max > END_SLACK;
      const atEnd = !scrollable || scroller.scrollTop >= max - END_SLACK;
      const ratio = scrollable ? Math.min(1, scroller.scrollTop / max) : 1;
      const value = Math.round((atEnd ? 1 : ratio) * 100);

      tools.fill.style.transform = `scaleX(${value / 100})`;
      setText(tools.percent, `${value}%`);
      tools.meter.setAttribute('aria-valuenow', String(value));
      SE.attr(root, READ, atEnd ? '' : null);

      const edge = !scrollable ? 'none' : scroller.scrollTop <= END_SLACK ? 'top' : atEnd ? 'end' : 'middle';
      SE.attr(root, EDGE, edge);
      SE.attr(tools.jump, 'hidden', scrollable ? null : '');
      setIcon(tools.jumpIcon, atEnd ? 'up' : 'down');
      setText(tools.jumpText, atEnd ? 'Back to top' : 'Jump to end');
    };

    /*
     * Sizes the agreement to the space the dialog has: start from the stylesheet's height, then
     * take back however far the footer reaches past what clips it (the modal frame or window),
     * so the buttons are never cut off. It only ever shrinks the agreement.
     */
    let fitFrame = 0;
    let fitting = false;
    const fit = () => {
      fitFrame = 0;
      const footer = content()?.querySelector('.DialogFooter');
      if (!watched?.isConnected || !footer) return;
      fitting = true;
      root.style.removeProperty(PANEL);
      const over = footer.getBoundingClientRect().bottom - clipBottom(root);
      if (over > 0) {
        const height = Math.max(MIN_PANEL, Math.floor(watched.getBoundingClientRect().height - over));
        root.style.setProperty(PANEL, `${height}px`);
      }
      // the size change this causes lands in the next frame's ResizeObserver pass
      requestAnimationFrame(() => {
        fitting = false;
      });
    };
    const scheduleFit = () => {
      if (!fitFrame) fitFrame = requestAnimationFrame(fit);
    };
    const view = root.ownerDocument.defaultView;
    view.addEventListener('resize', scheduleFit);
    let lastSize = '';
    const sizeWatch = new ResizeObserver(() => {
      // fit() changes the panel, which resizes the dialog: only refit for outside changes
      const box = root.getBoundingClientRect();
      const size = `${Math.round(box.width)}x${Math.round(box.height)}`;
      if (size !== lastSize && !fitting) scheduleFit();
      lastSize = size;
    });
    sizeWatch.observe(root);
    cleanups.push(() => {
      sizeWatch.disconnect();
      view.removeEventListener('resize', scheduleFit);
      if (fitFrame) cancelAnimationFrame(fitFrame);
      root.style.removeProperty(PANEL);
    });

    const bindScroller = scrolling => {
      if (scrolling && scrolling === watched) {
        // Steam may only start scrolling an inner wrapper once the text has laid out
        const next = scrollerOf(scrolling);
        scroller = next;
        return;
      }
      if (!scrolling && !watched) return;
      scrollCleanup?.();
      scrollCleanup = null;
      watched = scrolling;
      scroller = scrolling ? scrollerOf(scrolling) : null;
      words = -1;
      if (!scrolling) return;
      scheduleFit();

      /* scroll doesn't bubble: capture it on the panel, from whichever element inside scrolls */
      const onScroll = event => {
        const target = event.target;
        if (target !== scroller && target.nodeType === 1 && scrolling.contains(target)) scroller = target;
        measure();
      };
      const resize = new ResizeObserver(() => schedule());
      scrolling.addEventListener('scroll', onScroll, { capture: true, passive: true });
      resize.observe(scrolling);
      const text = scrolling.querySelector(C.text);
      if (text) resize.observe(text);
      const target = scrolling;
      scrollCleanup = () => {
        target.removeEventListener('scroll', onScroll, { capture: true });
        resize.disconnect();
        SE.unmark(root, EDGE);
      };
    };

    const onJump = () => {
      if (!scroller) return;
      const max = scroller.scrollHeight - scroller.clientHeight;
      const atEnd = scroller.scrollTop >= max - END_SLACK;
      scroller.scrollTo({ top: atEnd ? 0 : max, behavior: 'smooth' });
    };

    const sync = () => {
      frame = 0;
      if (!root.isConnected) return;
      const box = content();
      SE.attr(root, ROOT, box ? '' : null);
      if (!box) return;

      const id = attempt(() => readAppId(box), 0);
      if (id !== appid) {
        art?.remove();
        game?.game.remove();
        art = game = null;
        appid = id;
      }

      /* Hero art behind the top, capsule and name over Steam's intro */
      const host = box.closest('.DialogContent');
      if (art && (!art.isConnected || art.parentElement !== host)) art = null;
      if (!art && appid && host) art = attempt(() => buildArt(host, appid), null);
      const body = box.querySelector(C.intro)?.parentElement;
      if (game && (!game.game.isConnected || game.game.parentElement !== body)) game = null;
      if (!game && appid && body) game = attempt(() => buildGame(body, appid), null);
      if (game && !game.name.textContent) setText(game.name, appName(appid));
      SE.attr(root, 'data-se-eula-game', game ? '' : null);

      /* Toolbar, once there's an agreement to read */
      const scrolling = box.querySelector(C.scrolling);
      if (tools && !tools.tools.isConnected) {
        tools.fade.remove();
        tools = null;
      }
      if (scrolling && !tools) {
        tools = attempt(() => buildTools(box), null);
        tools?.jump.addEventListener('click', onJump);
      }
      SE.attr(root, 'data-se-eula-tools', tools && scrolling ? '' : null);
      bindScroller(scrolling);

      /* Reading estimate, recounted when the text (or its language) changes */
      if (tools && scroller) {
        const text = scrolling.querySelector(C.text)?.textContent ?? '';
        const count = text.split(/\s+/).filter(Boolean).length;
        if (count !== words) {
          words = count;
          const minutes = Math.max(1, Math.round(count / WORDS_PER_MINUTE));
          setText(tools.timeText, `${minutes} min read`);
          tools.timeText.parentElement.title = `${count.toLocaleString()} words`;
        }
      }
      measure();
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };

    /* Loading, errors and language switches swap the agreement's nodes and text */
    const observer = new MutationObserver(records => {
      if (records.some(record => !isOurs(record.target) && ![...record.addedNodes, ...record.removedNodes].every(isOurs))) schedule();
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    cleanups.push(() => observer.disconnect());

    sync();

    return {
      root,
      destroy() {
        if (frame) cancelAnimationFrame(frame);
        for (const fn of cleanups.splice(0)) attempt(fn);
        scrollCleanup?.();
        art?.remove();
        game?.game.remove();
        tools?.tools.remove();
        tools?.fade.remove();
        for (const name of [ROOT, READ, EDGE, 'data-se-eula-game', 'data-se-eula-tools']) SE.unmark(root, name);
        views.delete(this);
        viewOf.delete(root);
      },
    };
  };

  /* ---------- Lifecycle ---------- */

  const scan = () => {
    for (const view of [...views]) if (!view.root.isConnected) view.destroy();
    for (const node of document.querySelectorAll(C.content)) {
      if (node.closest('.GamepadMode')) continue;
      const root = node.closest(C.modal) ?? node.closest('.DialogContent');
      if (!root || viewOf.has(root)) continue;
      const view = attempt(() => createView(root), null);
      if (!view) continue;
      views.add(view);
      viewOf.set(root, view);
    }
  };

  const watcher = SE.watch(scan, { throttle: 120, ignore: isOurs });
  scan();

  window.__steamEnhancedEula = {
    destroy() {
      watcher.disconnect();
      for (const view of [...views]) view.destroy();
      document.querySelectorAll(`.${OURS}`).forEach(node => node.remove());
      delete window.__steamEnhancedEula;
    },
  };
});
