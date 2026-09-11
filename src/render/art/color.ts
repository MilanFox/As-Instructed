const ALPHA_STEPS = 64;
const alphaTables = new Map<string, string[]>();

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
