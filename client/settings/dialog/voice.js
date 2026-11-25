/*
 * Steam Settings › Voice: how your microphone sends, drawn as a level meter with the noise
 * threshold across it (styles: client/settings/pages-voice.css, the card pages-hero.css).
 *
 *   [ Open Microphone                                           ]
 *   [ Sends when you speak above the threshold                  ]
 *   [ ▁▃▅▇▅▃▂▁▂▄▆█▆▄▂▁▁▂▃▅▃▂▁▁ (the threshold dashed across)      ]
 *   [ Noise threshold: Medium (Recommended)                      ]
 *
 * Read from Steam's rows: Voice Transmission Type and Threshold (radio groups: their checked
 * button's place and its own words) and the hotkey row's key. Bars under
 * the threshold are what Steam holds back; Off lets everything through.
 */
((SE) => {
  window.__seSettingsVoice?.destroy();
  const ns = window.__seSettingsParts;
  if (!ns) return;

  const { el } = SE;
  const ROWS = [
    [/^voice transmission type/i, 'type'],
    [/^voice transmission threshold/i, 'threshold'],
    [/hotkey/i, 'key'],
  ];
  // A speaking voice's levels, in percent of the meter's height
  const LEVELS = [14, 30, 52, 74, 58, 36, 22, 12, 26, 48, 70, 92, 76, 50, 28, 14, 10, 18, 34, 56, 40, 24, 12, 8];
  // The threshold's height per choice (Off, Medium, High: Steam's order)
  const THRESHOLDS = [0, 32, 56];

  const chosenWords = (field) => {
    const i = ns.choiceAt(field);
    // Steam's words sit in separate spans: "Medium" + "(Recommended)"
    return i == null ? '' : ns.text(field.querySelectorAll('.Shared_Radio_Group [role="radio"]')[i]).replace(/(\S)\(/g, '$1 (');
  };

  const view = ns.pageView({
    route: 'voice',
    make() {
      const hero = ns.pageHero();
      const meter = el('div', 'se-voice-meter');
      const bars = LEVELS.map((h) => {
        const bar = el('i');
        bar.style.height = `${h}%`;
        meter.append(bar);
        return bar;
      });
      const gate = el('div', 'se-voice-gate');
      meter.append(gate);
      const gateName = el('div', 'se-voice-caption');
      hero.body.append(meter, gateName);
      return { root: hero.root, hero, meter, bars, gate, gateName };
    },
    read(page) {
      const rows = ns.rowsOf(page, ROWS);
      const key = rows.key && ns.text(rows.key.querySelector('.FieldRightColumn button, .FieldRightColumn'));
      return {
        type: ns.choiceAt(rows.type) ?? 0,
        typeName: rows.type ? chosenWords(rows.type) : '',
        threshold: ns.choiceAt(rows.threshold) ?? 1,
        thresholdName: rows.threshold ? chosenWords(rows.threshold) : '',
        key: key && !/^none$/i.test(key) ? key : '',
      };
    },
    draw(v, s) {
      const how = [
        'Sends when you speak above the threshold',
        s.key ? `Hold ${s.key} to talk` : 'Hold your key to talk',
        s.key ? `Hold ${s.key} to mute` : 'Hold your key to mute',
      ][s.type];
      v.hero.title(s.typeName || 'Open Microphone');
      v.hero.line(how);
      const level = THRESHOLDS[s.threshold] ?? THRESHOLDS[1];
      SE.cssVar(v.meter, '--se-voice-gate', String(level / 100));
      SE.attr(v.gate, 'data-off', level ? null : '');
      const caption = s.thresholdName ? `Noise threshold: ${s.thresholdName}` : '';
      if (v.gateName.textContent !== caption) v.gateName.textContent = caption;
      v.bars.forEach((bar, i) => SE.attr(bar, 'data-held', LEVELS[i] < level ? '' : null));
    },
  });

  window.__seSettingsVoice = {
    destroy() {
      view.destroy();
      delete window.__seSettingsVoice;
    },
  };
})(window.__se);
