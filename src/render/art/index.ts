/**
 * The art-direction registry.
 *
 * One entry per direction, each a self-contained file. Nothing here imports `theme.ts` — the
 * dependency runs the other way, so a direction can use `alpha()` and `mix()` from `color.ts`
 * while `theme.ts` holds the live bindings the renderer draws from.
 *
 * Adding a direction is adding a file and a line. That is the whole point of the seam: three
 * people can author three looks without touching the same source.
 */
import { deepsite } from './deepsite.ts';
import { signal } from './signal.ts';
import { standard } from './standard.ts';
import type { ArtDirection, ArtId } from './types.ts';

export const DIRECTIONS: Readonly<Record<ArtId, ArtDirection>> = Object.freeze({
  standard,
  signal,
  deepsite,
});

export const ART_IDS: readonly ArtId[] = ['standard', 'signal', 'deepsite'];

export function isArtId(value: unknown): value is ArtId {
  return typeof value === 'string' && (ART_IDS as readonly string[]).includes(value);
}

export * from './types.ts';
export { alpha, luminance, mix, shade } from './color.ts';
