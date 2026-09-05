import type { Vec } from '../../engine/index.ts';

/**
 * Wording shared by World 3's divergences. The Yards are laid out on a grid the player is looking
 * at while they read the failure, so every point a level names here is a tile, an arrival number
 * or a tick — never an index into something only the level can see.
 */

/** A coordinate, written the way the briefs and the facts tables write one. */
export function at(pos: Vec): string {
  return `(${String(pos.x)}, ${String(pos.y)})`;
}

/** `1 crate`, `4 crates`. A divergence that says `1 crates` reads as a bug in the game. */
export function crates(n: number): string {
  return n === 1 ? '1 crate' : `${String(n)} crates`;
}

/** `1st`, `2nd`, `13th`. Used where the point of divergence is a position in a sequence. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${String(n)}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${String(n)}${suffix}`;
}
