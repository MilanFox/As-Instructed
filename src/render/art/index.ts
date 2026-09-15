import { deepsite } from './deepsite.ts';
import { flat } from './flat.ts';
import { signal } from './signal.ts';
import type { ArtDirection, ArtId } from './types.ts';

export const DIRECTIONS: Readonly<Record<ArtId, ArtDirection>> = Object.freeze({
  deepsite,
  signal,
  flat,
});

export const ART_IDS: readonly ArtId[] = ['deepsite', 'signal', 'flat'];

export function isArtId(value: unknown): value is ArtId {
  return typeof value === 'string' && (ART_IDS as readonly string[]).includes(value);
}

export * from './types.ts';
export { alpha, luminance, mix, shade } from './color.ts';
