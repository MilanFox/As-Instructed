/**
 * The renderer's single colour source. DESIGN.md §8 fixes the palette; every value below is
 * either lifted verbatim from there or derived from it. Nothing in `src/render/` may hardcode a
 * colour literal — if a shade is missing, add it here.
 *
 * These duplicate `src/ui/styles/tokens.css` on purpose: Canvas2D cannot read CSS custom
 * properties without a layout round-trip per frame, and the renderer must not touch the DOM
 * inside the RAF loop.
 */

export const palette = {
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
} as const;

export type PaletteKey = keyof typeof palette;

/**
 * Opacity steps `alpha()` quantises to. 1/64 is well below the point a human can see a step, and
 * bounding the step count is what makes the table cache viable.
 */
const ALPHA_STEPS = 64;
const alphaTables = new Map<string, string[]>();

/**
 * `rgba()` string for a colour at a given opacity, memoised.
 *
 * This is called from inside draw loops — tread marks, brackets, gauges, the blocked-move flash —
 * so building the string each time would allocate a few hundred short-lived strings per frame and
 * show up as periodic multi-frame GC pauses during playback. One table per colour, built once.
 */
export function alpha(hex: string, a: number): string {
  const step = a <= 0 ? 0 : a >= 1 ? ALPHA_STEPS : Math.round(a * ALPHA_STEPS);
  let table = alphaTables.get(hex);
  if (!table) {
    const n = Number.parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    table = new Array<string>(ALPHA_STEPS + 1);
    for (let i = 0; i <= ALPHA_STEPS; i++) {
      table[i] = `rgba(${r}, ${g}, ${b}, ${(i / ALPHA_STEPS).toFixed(4)})`;
    }
    alphaTables.set(hex, table);
  }
  return table[step] as string;
}

export function shade(hex: string, factor: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) * factor);
  const g = clamp(((n >> 8) & 255) * factor);
  const b = clamp((n & 255) * factor);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * Per-bot accent hues. World 7 puts twenty-odd bots on one grid and the player has to be able to
 * say "that one is bot 6" at a glance, so these are chosen for maximum separation at 48 px while
 * staying inside the game's cool-industrial range. Index by `botId % BOT_ACCENTS.length`.
 */
export const BOT_ACCENTS: readonly string[] = [
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
];

export function botAccent(botId: number): string {
  const list = BOT_ACCENTS;
  return list[((botId % list.length) + list.length) % list.length] as string;
}

/** Chassis colours shared by every bot; only the accent trim differs. */
export const bot = {
  hullDark: '#1a222c',
  hull: '#33404f',
  hullLight: '#46566a',
  rim: '#8298b0',
  glass: '#0d1319',
  tread: '#121821',
  shadow: 'rgba(0, 0, 0, 0.45)',
} as const;

export const fxColors = {
  dust: '#8a7a68',
  spark: '#ffd166',
  chip: '#c0cbd8',
  pulse: '#35e0c8',
  power: '#ffb020',
  bad: '#ff5d5d',
  good: '#7ee06a',
} as const;

export const overlay = {
  grid: 'rgba(106, 122, 140, 0.18)',
  gridMajor: 'rgba(106, 122, 140, 0.30)',
  goal: '#ffb020',
  hover: '#35e0c8',
  vignette: '#000000',
  outOfBounds: '#070a0f',
} as const;
