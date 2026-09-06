/**
 * The look as it shipped, expressed as one entry in the registry.
 *
 * Every value here was lifted verbatim from the old frozen records in `theme.ts`, so selecting
 * `standard` is a no-op against the build that existed before the registry did. It is kept for
 * exactly one reason: a spike that cannot show you what you already had is not a comparison.
 *
 * It implements no painter hooks, which is what makes it the definition of the fallback path —
 * the tile atlas draws the terrain and `sprites.ts` draws the bot.
 */
import type { ArtDirection } from './types.ts';

export const standard: ArtDirection = {
  id: 'standard',
  label: 'Standard',

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

  /*
   * `gridWidth: 0.5` is not a preference, it is the old `ctx.lineWidth = 1` written in the new
   * unit. That 1 was in *device* pixels, so on the 2x display this is developed on it has always
   * been half a CSS pixel — which is AUDIT-UI F6, and which the other directions do not inherit.
   */
  metrics: {
    gridWidth: 0.5,
    gridMajorWidth: 0.5,
    gridMinTilePx: 10,
    outlineWidth: 1.5,
    botDetailTilePx: 22,
  },

  /*
   * The FIX-TRAIL §7 ramp, unchanged: a darkening at the cold end, red by the sixth visit, alpha
   * still deepening to the tenth. `referenceFloor` is the World 4 cave floor as it actually
   * renders — `floor.rock` #89a2a3 under the cave biome's 0.7 dim — which is the surface that
   * caught the original calibration out.
   */
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
