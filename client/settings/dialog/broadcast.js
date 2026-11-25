/*
 * Steam Settings › Broadcast: what your viewers would see (styles:
 * client/settings/pages-broadcast.css, the card pages-hero.css).
 *
 *   [ What viewers see                                       ]
 *   [ Your game, their chat where you put it                 ]
 *   [ [ (your last game)                [chat] ]             ]
 *   [ [ Mic                         2.4 Mbps ↑ ]             ]
 *
 * Read from Steam's rows: where viewers' chat sits (the dropdown's place: Off, Top-left,
 * Top-center, Top-right, Bottom-right, Bottom-center, Bottom-left), the microphone and
 * upload-stats switches, and privacy (its first choice, broadcasting off, dims the screen). The
 * status, size, bitrate and encoding stay Steam's rows under it: the card doesn't repeat them.
 */
((SE) => {
  window.__seSettingsBroadcast?.destroy();
  const ns = window.__seSettingsParts;
  if (!ns) return;

  const { el, run } = SE;
  const ROWS = [
    [/^privacy/i, 'privacy'],
    [/viewers.? chat/i, 'chat'],
    [/^record my microphone/i, 'mic'],
    [/^show upload stats/i, 'stats'],
  ];
  const PLACES = ['', 'tl', 'tc', 'tr', 'br', 'bc', 'bl'];

  const view = ns.pageView({
    route: 'broadcast',
    make() {
      const hero = ns.pageHero();
      const stage = el('div', 'se-bc-stage');
      const screen = el('div', 'se-bc-screen');
      const game = ns.lastGame();
      const urls = game ? run(() => SE.heroURLs(game.appid, game.store)) || [] : [];
      if (urls.length) {
        const img = SE.art.img(urls, '', () => img.remove());
        img.addEventListener('load', () => SE.mark(screen, 'data-ready'), { once: true });
        screen.append(img);
      }
      const chat = el('div', 'se-bc-chat');
      for (let i = 0; i < 3; i++) chat.append(el('i'));
      const stats = el('div', 'se-bc-stats', '2.4 Mbps ↑');
      const mic = el('div', 'se-bc-mic', 'Mic');
      screen.append(chat, stats, mic);
      hero.body.append(screen);
      hero.title('What viewers see');
      return { root: hero.root, hero, screen };
    },
    read(page) {
      const rows = ns.rowsOf(page, ROWS);
      return {
        off: ns.choiceAt(rows.privacy) === 0,
        chat: PLACES[ns.choiceAt(rows.chat) ?? 0] || '',
        mic: ns.switchOn(rows.mic),
        stats: ns.switchOn(rows.stats),
      };
    },
    draw(v, s) {
      v.hero.line(s.off ? 'Broadcasting is off' : s.chat ? 'Your game, their chat where you put it' : 'Your game, without their chat');
      SE.attr(v.screen, 'data-off', s.off ? '' : null);
      SE.attr(v.screen, 'data-chat', s.chat || null);
      SE.attr(v.screen, 'data-mic', s.mic ? '' : null);
      SE.attr(v.screen, 'data-stats', s.stats ? '' : null);
    },
    characterData: true,
  });

  window.__seSettingsBroadcast = {
    destroy() {
      view.destroy();
      delete window.__seSettingsBroadcast;
    },
  };
})(window.__se);
