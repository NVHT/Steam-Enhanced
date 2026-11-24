/*
 * Feedback on a rebuilt dialog's own controls (About Steam, System Information, System Report):
 *
 *   SE.nativeTips({ delay, direction })  Steam's own React tooltip on theme controls, from this
 *     window or the main one (client/shared/native-tooltips.js), looked for until webpack has it;
 *     `title` stands in if it never turns up. Returns:
 *       tip(node, label, { direction, bucket })  bucket: an array the caller drops on a redraw
 *       drop(bucket)                            unmounts a bucket's tips (and its waiting ones)
 *       destroy()                               every tip and the lookup
 *   SE.copiedFlash(ms)  marks a control [data-copied] for `ms`. Returns { flash(node), destroy() }.
 *
 * The tip's hit box covers its control: dialog-controls.css.
 */
((SE) => {
  const RETRY_MS = 250;
  const RETRIES = 40; // ~10 s for webpack and native-tooltips.js to come up

  const attempt = SE.attempt('Dialog tips');

  const resolve = () =>
    attempt(() => SE.global('__seNativeTooltips', (api) => typeof api?.resolve === 'function')?.resolve() ?? null, null);

  const mount = ({ React, DOM, Tooltip }, node, label, direction, delay) => {
    const host = SE.el('span', 'se-native-tip');
    node.setAttribute('data-se-native-tip', '');
    node.append(host);
    const root = DOM.createRoot(host);
    root.render(
      React.createElement(Tooltip, {
        toolTipContent: label,
        bTopmost: true,
        nDelayShowMS: delay,
        direction,
        nBodyAlignment: 0.5,
        nBodyDistance: 6,
        bPortalToBody: true,
        children: React.createElement('span', { className: 'se-native-tip-hitbox' }),
      }),
    );
    return () => {
      attempt(() => root.unmount());
      host.remove();
      node.removeAttribute('data-se-native-tip');
    };
  };

  SE.nativeTips = ({ delay = 300, direction: defaultDirection = 'top' } = {}) => {
    let native = null; // null: still looking; false: gave up
    let tries = 0;
    let timer = 0;
    const waiting = [];
    const buckets = new Set();
    const own = [];

    const add = (node, label, direction, bucket) => {
      if (native) bucket.push(mount(native, node, label, direction, delay));
      else if (native === false) node.title = label;
      else waiting.push([node, label, direction, bucket]);
    };

    const look = () => {
      timer = 0;
      native = resolve();
      if (!native && ++tries < RETRIES) {
        native = null;
        timer = setTimeout(look, RETRY_MS);
        return;
      }
      native ||= false;
      for (const entry of waiting.splice(0)) add(...entry);
    };

    const drop = (bucket) => {
      for (let i = waiting.length - 1; i >= 0; i--) if (waiting[i][3] === bucket) waiting.splice(i, 1);
      for (const unmount of bucket.splice(0)) attempt(unmount);
    };

    look();

    return {
      tip(node, label, { direction = defaultDirection, bucket = own } = {}) {
        buckets.add(bucket);
        add(node, label, direction, bucket);
      },
      drop,
      destroy() {
        clearTimeout(timer);
        waiting.length = 0;
        for (const bucket of buckets) drop(bucket);
        buckets.clear();
      },
    };
  };

  SE.copiedFlash = (ms) => {
    const timers = new Map();
    return {
      flash(node) {
        clearTimeout(timers.get(node));
        node.setAttribute('data-copied', '');
        timers.set(node, setTimeout(() => {
          node.removeAttribute('data-copied');
          timers.delete(node);
        }, ms));
      },
      destroy() {
        for (const [node, id] of timers) {
          clearTimeout(id);
          node.removeAttribute('data-copied');
        }
        timers.clear();
      },
    };
  };
})(window.__se);
