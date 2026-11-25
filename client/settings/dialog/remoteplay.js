/*
 * Steam Settings › Remote Play: this computer and what it can stream to (styles:
 * client/settings/pages-remoteplay.css, the card pages-hero.css).
 *
 *   [ Remote Play is on                                          ]
 *   [ Stream your games to a TV, phone or computer               ]
 *   [ [pc] This computer - - - - [tv] [phone] [pc]                ]
 *
 * Read from Steam's row Enable Remote Play (off: the link and devices dim); the rest stay
 * Steam's rows under it: the card doesn't repeat them.
 */
((SE) => {
  window.__seSettingsRemotePlay?.destroy();
  const ns = window.__seSettingsParts;
  if (!ns) return;

  const { el } = SE;
  const ROWS = [[/^enable remote play/i, 'enabled']];
  const DEVICES = ['tv', 'phone', 'pc'];

  const view = ns.pageView({
    route: 'remoteplay',
    make() {
      const hero = ns.pageHero();
      const map = el('div', 'se-rp-map');
      const host = el('span', 'se-rp-host');
      host.append(el('i', 'se-rp-device'), el('span', '', 'This computer'));
      const devices = el('span', 'se-rp-devices');
      for (const kind of DEVICES) {
        const device = el('i', 'se-rp-device');
        device.dataset.kind = kind;
        devices.append(device);
      }
      map.append(host, el('span', 'se-rp-link'), devices);
      hero.body.append(map);
      return { root: hero.root, hero, map };
    },
    read(page) {
      const rows = ns.rowsOf(page, ROWS);
      return { on: ns.switchOn(rows.enabled) };
    },
    draw(v, s) {
      v.hero.title(s.on ? 'Remote Play is on' : 'Remote Play is off');
      v.hero.line(s.on ? 'Stream your games to a TV, phone or another computer' : 'Turn it on to stream between your devices');
      SE.attr(v.map, 'data-off', s.on ? null : '');
    },
  });

  window.__seSettingsRemotePlay = {
    destroy() {
      view.destroy();
      delete window.__seSettingsRemotePlay;
    },
  };
})(window.__se);
