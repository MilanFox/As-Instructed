import { DIRECTIONS } from './art/index.ts';
import type {
  ArtDirection,
  ArtId,
  BotColors,
  FxColors,
  Metrics,
  OverlayColors,
  Palette,
  TrailRamp,
} from './art/types.ts';

export { alpha, luminance, mix, shade } from './art/color.ts';
export type { ArtDirection, ArtId, Metrics, TrailRamp } from './art/types.ts';
export { ART_IDS, DIRECTIONS, isArtId } from './art/index.ts';

let current: ArtDirection = DIRECTIONS.flat;

let version = 0;

export function artVersion(): number {
  return version;
}

export function artDirection(): ArtDirection {
  return current;
}

export let palette: Palette = current.palette;
export let bot: BotColors = current.bot;
export let fxColors: FxColors = current.fxColors;
export let overlay: OverlayColors = current.overlay;
export let metrics: Metrics = current.metrics;
export let trailRamp: TrailRamp = current.trail;
export let BOT_ACCENTS: readonly string[] = current.botAccents;

export type PaletteKey = keyof Palette;

export function botAccent(botId: number): string {
  const list = BOT_ACCENTS;
  return list[((botId % list.length) + list.length) % list.length] as string;
}

export function setArtDirection(id: ArtId): void {
  const next = DIRECTIONS[id];
  if (next === current) return;
  current = next;
  palette = next.palette;
  bot = next.bot;
  fxColors = next.fxColors;
  overlay = next.overlay;
  metrics = next.metrics;
  trailRamp = next.trail;
  BOT_ACCENTS = next.botAccents;
  version++;
}

export function applyArtDirection(id: ArtId, root?: HTMLElement): void {
  setArtDirection(id);
  const element = root ?? (typeof document === 'undefined' ? null : document.documentElement);
  if (!element) return;
  element.dataset['art'] = id;
  const style = element.style;
  const p = current.palette;
  style.setProperty('--bg-void', p.bgVoid);
  style.setProperty('--bg-panel', p.bgPanel);
  style.setProperty('--bg-raised', p.bgRaised);
  style.setProperty('--ink', p.ink);
  style.setProperty('--ink-dim', p.inkDim);
  style.setProperty('--accent', p.accent);
  style.setProperty('--accent-2', p.accent2);
  style.setProperty('--danger', p.danger);
  style.setProperty('--ok', p.ok);
  style.setProperty('--gold', p.gold);
  style.setProperty('--silver', p.silver);
  style.setProperty('--bronze', p.bronze);
}
