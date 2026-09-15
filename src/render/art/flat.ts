import type { ArtDirection } from './types.ts';

export const flat: ArtDirection = {
  id: 'flat',
  label: 'Flat',

  palette: {
    bgVoid: '#0a0e14',
    bgPanel: '#121820',
    bgRaised: '#1b2430',
    ink: '#c9d5e3',
    inkDim: '#6a7a8c',
    accent: '#35e0c8',
    accent2: '#ffb020',
    danger: '#ff5d5d',
    ok: '#7ee06a',
    gold: '#ffd166',
    silver: '#c0cbd8',
    bronze: '#cd8b52',
  },

  bot: {
    hullDark: '#1a222c',
    hull: '#33404f',
    hullLight: '#46566a',
    rim: '#8298b0',
    glass: '#0d1319',
    tread: '#121821',
    shadow: 'rgba(0, 0, 0, 0.45)',
  },

  fxColors: {
    dust: '#8a7a68',
    spark: '#ffd166',
    chip: '#c0cbd8',
    pulse: '#35e0c8',
    power: '#ffb020',
    bad: '#ff5d5d',
    good: '#7ee06a',
  },

  overlay: {
    grid: 'rgba(106, 122, 140, 0.18)',
    gridMajor: 'rgba(106, 122, 140, 0.30)',
    goal: '#ffb020',
    hover: '#35e0c8',
    vignette: '#000000',
    outOfBounds: '#070a0f',
  },

  metrics: {
    gridWidth: 0.5,
    gridMajorWidth: 0.5,
    gridMinTilePx: 10,
    outlineWidth: 1.5,
    botDetailTilePx: 22,
  },

  trail: { cold: '#0a0e14', hot: '#ff5d5d', minAlpha: 0.16, maxAlpha: 0.36 },
  referenceFloor: '#6b7681',

  botAccents: [
    '#35e0c8',
    '#ffb020',
    '#7ee06a',
    '#ff5d5d',
    '#4ea8ff',
    '#ff7ad9',
    '#ffd166',
    '#9a7bd8',
    '#5ce1e6',
    '#f2825b',
    '#a3e635',
    '#e879f9',
  ],
};
