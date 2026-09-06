/**
 * The renderer's live view of the current art direction.
 *
 * This used to be the palette itself: one frozen record, hand-mirrored from `tokens.css`. It is
 * now a set of live bindings onto whichever direction is selected, so every existing call site —
 * `palette.bgVoid`, `overlay.grid`, `bot.hull` — keeps working unchanged while the values behind
 * them can be swapped wholesale. The directions live in `art/`; this file is the only thing that
 * knows which one is current.
 *
 * These still duplicate `src/ui/styles/tokens.css` rather than reading it: Canvas2D cannot read
 * CSS custom properties without a layout round-trip per frame, and the renderer must not touch
 * the DOM inside the RAF loop. What is new is that the duplication now runs one way and is
 * mechanical — `applyArtDirection()` writes the direction's palette onto `:root` as custom
 * properties, so the stylesheet takes its values *from* here and the two cannot drift.
 */
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

let current: ArtDirection = DIRECTIONS.standard;

/**
 * Bumped on every change. Anything holding a table derived from the palette — the trail ramp is
 * the only one — compares against this once per draw rather than subscribing, which keeps the
 * dependency pointing one way and costs a single integer compare per frame.
 */
let version = 0;

export function artVersion(): number {
  return version;
}

export function artDirection(): ArtDirection {
  return current;
}

/*
 * Live bindings. ES module semantics mean a `let` reassigned here is seen by every importer, so
 * `import { palette } from './theme.ts'` stays correct across a direction change without a single
 * call site learning that directions exist.
 */
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

/**
 * Selects a direction for the renderer.
 *
 * Does not touch the DOM and does not invalidate the terrain cache — the caller owns both,
 * because the terrain layer keys on the direction id and will rebuild itself on the next frame.
 */
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

/**
 * Writes the direction onto the document as CSS custom properties and a `data-art` attribute.
 *
 * The attribute is what lets each direction ship its own stylesheet without a build flag, and
 * writing the palette across means the chrome and the canvas cannot disagree about what `accent`
 * means — which is the defect AUDIT-UI describes as the canvas not joining the chrome. Called
 * once at startup and again on a change, never in a frame.
 */
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
