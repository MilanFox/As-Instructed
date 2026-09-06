/**
 * Colour arithmetic, with no dependency on which art direction is loaded.
 *
 * This lives below the registry rather than inside `theme.ts` so a direction file can call
 * `alpha()` and `mix()` while building its own painters without importing the module that
 * imports it. Same functions, same memoisation, no cycle.
 */

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
 *
 * The cache is keyed by colour, so it survives an art-direction change without going stale; a
 * direction that is switched away from simply leaves its tables behind, which is a few kilobytes
 * and not worth the bookkeeping to reclaim.
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

/**
 * Linear blend between two colours, `t` in 0..1.
 *
 * Exists so a ramp between two *existing* hues counts as derived colour rather than a new accent
 * — the visited-tile trail runs the void colour to danger and would otherwise need literals for
 * every step. Call it while building a lookup table, never per draw.
 */
export function mix(from: string, to: string, t: number): string {
  const k = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const a = Number.parseInt(from.slice(1), 16);
  const b = Number.parseInt(to.slice(1), 16);
  const lerp = (shift: number): number =>
    Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * k);
  return `#${((1 << 24) | (lerp(16) << 16) | (lerp(8) << 8) | lerp(0)).toString(16).slice(1)}`;
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
 * Relative luminance, 0..1, for a `#rrggbb` string.
 *
 * The trail's cold end has to be a *darkening* of whatever floor it lands on, and "darker" is a
 * luminance claim rather than a hue one. FIX-TRAIL §7 is the whole reason this is here: the first
 * ramp was calibrated by eye against one biome and drew nothing at all against another.
 */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}
