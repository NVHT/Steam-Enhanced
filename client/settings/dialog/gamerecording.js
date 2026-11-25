/*
 * Steam Settings › Game Recording: your last game with what Steam keeps of it (styles:
 * client/settings/pages-gamerecording.css, the card pages-hero.css).
 *
 *   [ (your last game's art)                                     ]
 *   [ (video) Recording in the background                        ]
 *   [         Keeps the last 120 minutes, ready to clip          ]
 *   [ 120 min ago ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ ● Now   ]
 *
 * The mode is Steam's chosen card (RecordingModeOption, its Active class: Off, Background,
 * Manual in Steam's order); the minutes and the key are the marked-up words in its cards' text,
 * so they follow Steam's settings and language. The timeline: empty (Off), all of it kept,
 * fading back to its oldest minute (Background), one clip in it (Manual).
 */
((SE) => {
  window.__seSettingsRecording?.destroy();
  const ns = window.__seSettingsParts;
  if (!ns) return;

  const { C, el, run } = SE;
  const MODES = ['off', 'background', 'manual'];

  const view = ns.pageView({
    route: 'gamerecording',
    make() {
      const hero = ns.pageHero();
      const game = ns.lastGame();
      if (game) hero.setArt(run(() => SE.heroURLs(game.appid, game.store)) || []);
      const line = el('div', 'se-rec-line');
      const track = el('div', 'se-rec-track');
      track.append(el('span', 'se-rec-kept'), el('span', 'se-rec-clip'));
      const from = el('span', 'se-rec-from');
      line.append(from, track, el('span', 'se-rec-now', 'Now'));
      hero.body.append(line);
      return { root: hero.root, hero, line, from };
    },
    read(page) {
      const options = [...page.querySelectorAll(`.${C.RecordingModeOption}`)];
      const index = options.findIndex((o) => o.classList.contains('Active'));
      // The marked-up word in a card's text (bold minutes, the key): its innermost short element
      const bold = (i) =>
        [...(options[i]?.querySelectorAll('.Body *') || [])]
          .filter((n) => !n.firstElementChild)
          .map((n) => ns.text(n))
          .find((t) => t && t.length <= 24) || '';
      return { mode: MODES[index] || 'off', minutes: bold(1), key: bold(2) };
    },
    draw(v, s) {
      v.line.dataset.mode = s.mode;
      v.from.textContent = s.minutes ? `${s.minutes} min ago` : '';
      if (s.mode === 'background') {
        v.hero.title('Recording in the background');
        v.hero.line(s.minutes ? `Keeps the last ${s.minutes} minutes, ready to clip` : 'Keeps your recent play, ready to clip');
      } else if (s.mode === 'manual') {
        v.hero.title('Recording when you ask');
        v.hero.line(s.key ? `Press ${s.key} in a game to start and stop` : 'Start and stop it in a game');
      } else {
        v.hero.title('Not recording');
        v.hero.line("Steam won't record your games");
      }
    },
  });

  window.__seSettingsRecording = {
    destroy() {
      view.destroy();
      delete window.__seSettingsRecording;
    },
  };
})(window.__se);
