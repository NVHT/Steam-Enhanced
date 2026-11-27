/*
 * The theme's settings, part 1 of 3 (client/shared/settings.js names what they do), listed first:
 * the colour palette's base tokens, the presets that set them, and a Custom palette filled from a
 * base. Shared with settings-schema.js and settings.js on window.__seSettingsPaletteParts.
 */
(() => {
  const COLOUR = /^(?:#[0-9a-f]{6}|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*(?:0|1|0?\.\d+)\s*\))$/i;

  /*
   * The colour palette: the base tokens of core/tokens.css a preset sets, by key. The settings
   * window's Custom editor shows them in this order, under their `group` (the editor's section:
   * Surfaces, States and lines, Text, Accent).
   */
  const PALETTE_TOKENS = [
    ['bg', '--se-bg', 'Background', 'Surfaces'],
    ['sidebar', '--se-sidebar', 'Sidebar', 'Surfaces'],
    ['surface', '--se-surface', 'Surface', 'Surfaces'],
    ['surface2', '--se-surface-2', 'Raised surface', 'Surfaces'],
    ['field', '--se-field', 'Field', 'Surfaces'],
    ['ink', '--se-bg-ink', 'Deepest ink', 'Surfaces'],
    ['hover', '--se-hover', 'Hover', 'States and lines'],
    ['selected', '--se-selected', 'Selected', 'States and lines'],
    ['track', '--se-track', 'Track', 'States and lines'],
    ['border', '--se-border-strong', 'Strong border', 'States and lines'],
    ['hairline', '--se-hairline', 'Hairline', 'States and lines'],
    ['divider', '--se-divider', 'Divider', 'States and lines'],
    ['strong', '--se-text-strong', 'Strong', 'Text'],
    ['text', '--se-text', 'Text', 'Text'],
    ['dim', '--se-text-dim', 'Dim', 'Text'],
    ['muted', '--se-text-muted', 'Muted', 'Text'],
    ['faint', '--se-text-faint', 'Faint', 'Text'],
    ['accent', '--se-color-accent', 'Accent', 'Accent'],
    ['onAccent', '--se-on-accent', 'On the accent', 'Accent'],
  ].map(([key, token, label, group]) => ({ key, token, label, group }));

  // Text colours and what they sit on, for the editor's contrast marks (WCAG AA, 4.5:1)
  const READ_ON = { strong: 'selected', text: 'surface2', dim: 'surface2', muted: 'selected', faint: 'surface2', onAccent: 'accent' };

  const LINES = { hairline: 'rgba(255, 255, 255, .06)', divider: 'rgba(255, 255, 255, .08)' };
  /*
   * The presets: Enhanced is tokens.css's own values; each other preset sets every token. A
   * preset's `group` is the mood the settings window files it under (Neutral, Cool, Warm).
   */
  const PRESETS = [
    {
      v: 'enhanced', label: 'Enhanced', group: 'Neutral', colors: {
        bg: '#171a20', sidebar: '#1d2128', surface: '#1f242b', surface2: '#262c35', field: '#15181d', ink: '#0f1115',
        hover: '#2c3440', selected: '#33404f', track: '#3a424d', border: '#4a525e', ...LINES,
        strong: '#ffffff', text: '#e6e8eb', dim: '#b8c0c8', muted: '#a2acb7', faint: '#8994a2', accent: '#7cc4ff', onAccent: '#0f1115',
      },
    },
    {
      v: 'graphite', label: 'Graphite', group: 'Neutral', colors: {
        bg: '#1c1c1c', sidebar: '#202020', surface: '#262626', surface2: '#2e2e2e', field: '#161616', ink: '#0e0e0e',
        hover: '#333333', selected: '#3b3b3b', track: '#444444', border: '#555555', ...LINES,
        strong: '#ffffff', text: '#f3f3f3', dim: '#d6d6d6', muted: '#bdbdbd', faint: '#9a9a9a', accent: '#60cdff', onAccent: '#001a28',
      },
    },
    {
      v: 'nebula', label: 'Nebula', group: 'Cool', colors: {
        bg: '#0d0f1e', sidebar: '#12152b', surface: '#151833', surface2: '#1d2142', field: '#0a0c18', ink: '#07081a',
        hover: '#232852', selected: '#2c315e', track: '#343a6b', border: '#454c80', ...LINES,
        strong: '#ffffff', text: '#e8e9ff', dim: '#c3c6ee', muted: '#a9add6', faint: '#8b90bf', accent: '#a493ff', onAccent: '#120b33',
      },
    },
    {
      v: 'mono', label: 'Mono', group: 'Neutral', colors: {
        bg: '#111111', sidebar: '#151515', surface: '#191919', surface2: '#212121', field: '#0c0c0c', ink: '#0a0a0a',
        hover: '#282828', selected: '#303030', track: '#3a3a3a', border: '#4a4a4a', ...LINES,
        strong: '#ffffff', text: '#e8e8e8', dim: '#c4c4c4', muted: '#a6a6a6', faint: '#8c8c8c', accent: '#ececec', onAccent: '#111111',
      },
    },
    {
      v: 'tonal', label: 'Tonal', group: 'Cool', colors: {
        bg: '#141218', sidebar: '#19171d', surface: '#1d1b20', surface2: '#2b2930', field: '#0f0d13', ink: '#0d0b10',
        hover: '#36333d', selected: '#4a4458', track: '#49454f', border: '#5b5763', ...LINES,
        strong: '#ffffff', text: '#e6e0e9', dim: '#ddd7e0', muted: '#cac4d0', faint: '#a49eac', accent: '#d0bcff', onAccent: '#381e72',
      },
    },
    {
      v: 'ember', label: 'Ember', group: 'Warm', colors: {
        bg: '#1a1614', sidebar: '#1e1a18', surface: '#241f1c', surface2: '#2e2926', field: '#120f0e', ink: '#0a0908',
        hover: '#37312d', selected: '#413b37', track: '#4d4742', border: '#625b56', ...LINES,
        strong: '#ffffff', text: '#f2e6dc', dim: '#c9beb6', muted: '#b0a69f', faint: '#9a918a', accent: '#ffb366', onAccent: '#100d0c',
      },
    },
    {
      v: 'forest', label: 'Forest', group: 'Warm', colors: {
        bg: '#121815', sidebar: '#161c19', surface: '#1a221e', surface2: '#242c28', field: '#0d110f', ink: '#070a08',
        hover: '#2b3430', selected: '#353e39', track: '#414a45', border: '#545e59', ...LINES,
        strong: '#ffffff', text: '#dcebe2', dim: '#b5c3bb', muted: '#9eaba4', faint: '#89968e', accent: '#7fd8a6', onAccent: '#0b0e0d',
      },
    },
    {
      v: 'abyss', label: 'Abyss', group: 'Cool', colors: {
        bg: '#0b1619', sidebar: '#0e1b1f', surface: '#122126', surface2: '#1c2b30', field: '#080f12', ink: '#04090a',
        hover: '#243338', selected: '#2e3e42', track: '#394a4e', border: '#4d5e63', ...LINES,
        strong: '#ffffff', text: '#d7eef0', dim: '#b0c5c8', muted: '#96abae', faint: '#819598', accent: '#5fe1e8', onAccent: '#070d0f',
      },
    },
    {
      v: 'rosewood', label: 'Rosewood', group: 'Warm', colors: {
        bg: '#1a1316', sidebar: '#1f171a', surface: '#251b20', surface2: '#2f252a', field: '#120d0f', ink: '#0a0809',
        hover: '#372d32', selected: '#41363c', track: '#4e4247', border: '#62565b', ...LINES,
        strong: '#ffffff', text: '#f0dfe5', dim: '#c7b8be', muted: '#afa0a5', faint: '#9b8c91', accent: '#ff8fab', onAccent: '#100b0d',
      },
    },
    {
      v: 'slate', label: 'Slate', group: 'Neutral', colors: {
        bg: '#1b1f24', sidebar: '#1e2328', surface: '#22272e', surface2: '#2b3038', field: '#131619', ink: '#0b0c0e',
        hover: '#33383f', selected: '#3c4149', track: '#474d54', border: '#5a6067', ...LINES,
        strong: '#ffffff', text: '#dde4ec', dim: '#b8bec6', muted: '#a8afb7', faint: '#9399a1', accent: '#8fb3d9', onAccent: '#101316',
      },
    },
    {
      v: 'midnight', label: 'Midnight', group: 'Cool', colors: {
        bg: '#090c14', sidebar: '#0c1019', surface: '#10151f', surface2: '#1a1f2a', field: '#06080e', ink: '#040508',
        hover: '#232832', selected: '#2d323d', track: '#393f4a', border: '#4e545f', ...LINES,
        strong: '#ffffff', text: '#dfe6f5', dim: '#b6bcca', muted: '#959ca9', faint: '#828894', accent: '#4d9fff', onAccent: '#05070c',
      },
    },
    {
      v: 'sand', label: 'Sand', group: 'Warm', colors: {
        bg: '#1c1a17', sidebar: '#201e1b', surface: '#26231f', surface2: '#302d29', field: '#141210', ink: '#0b0a09',
        hover: '#383530', selected: '#423f3a', track: '#4e4a45', border: '#625e58', ...LINES,
        strong: '#ffffff', text: '#eee8de', dim: '#c6c1b8', muted: '#b1aca4', faint: '#9a958e', accent: '#e6c07b', onAccent: '#11100e',
      },
    },
    {
      v: 'void', label: 'Void', group: 'Neutral', colors: {
        bg: '#000000', sidebar: '#000000', surface: '#0a0a0a', surface2: '#141414', field: '#000000', ink: '#000000',
        hover: '#1c1c1c', selected: '#262626', track: '#303030', border: '#3d3d3d', ...LINES,
        strong: '#ffffff', text: '#e6e6e6', dim: '#bababa', muted: '#929292', faint: '#7f7f7f', accent: '#ffffff', onAccent: '#000000',
      },
    },
  ];
  const presetOf = (v) => PRESETS.find((preset) => preset.v === v) || PRESETS[0];

  // A Custom palette as kept: every token a colour, any missing one from `base`
  const fillPalette = (colors, base = PRESETS[0].colors) => {
    const out = {};
    for (const { key } of PALETTE_TOKENS) {
      const value = typeof colors?.[key] === 'string' ? colors[key].trim() : '';
      out[key] = COLOUR.test(value) ? value.toLowerCase() : base[key];
    }
    return out;
  };

  window.__seSettingsPaletteParts = { PALETTE_TOKENS, PRESETS, READ_ON, fillPalette, presetOf };
})();
