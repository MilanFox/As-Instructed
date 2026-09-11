import type { Vec } from '../../engine/index.ts';

export function at(pos: Vec): string {
  return `(${String(pos.x)}, ${String(pos.y)})`;
}

export function crates(n: number): string {
  return n === 1 ? '1 crate' : `${String(n)} crates`;
}

export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${String(n)}th`;
  const suffix = ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${String(n)}${suffix}`;
}
