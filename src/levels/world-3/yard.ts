import type { ItemKind, Rng, Vec, World } from '../../engine/index.ts';
import { Terrain, setTerrain, setTile, vec } from '../../engine/index.ts';

/**
 * Shared scenery for The Sorting Yards. Every World 3 level is a walled shed with an open
 * floor, so a bot can always reach any interior tile by running along x and then along y —
 * which is what keeps the reference solutions short enough to be honest translations.
 */

/** The classes the Yards stock. w3-03 also files `ice`, which is racked in the cold store. */
export const YARD_CLASSES: readonly ItemKind[] = [
  'crate',
  'part',
  'chip',
  'cell',
  'ore',
  'stone',
  'scrap',
];

/** The declared manifest order for w3-03. Printed verbatim in that level's brief. */
export const MANIFEST_ORDER: readonly ItemKind[] = [...YARD_CLASSES, 'ice'];

/**
 * Discards the first few draws of a fresh stream. mulberry32 seeded with 1, 2 and 3 returns
 * near-identical first values, which would hand consecutive seeds the same crate count.
 */
export function warm(rng: Rng): void {
  for (let i = 0; i < 3; i++) rng.next();
}

/** Walls the outer ring. The interior is everything from (1, 1) to (w - 2, h - 2). */
export function frame(world: World): void {
  for (let x = 0; x < world.w; x++) {
    setTerrain(world, vec(x, 0), Terrain.Wall);
    setTerrain(world, vec(x, world.h - 1), Terrain.Wall);
  }
  for (let y = 0; y < world.h; y++) {
    setTerrain(world, vec(0, y), Terrain.Wall);
    setTerrain(world, vec(world.w - 1, y), Terrain.Wall);
  }
}

/** Every interior tile, in row-major order. */
export function interior(world: World): Vec[] {
  const out: Vec[] = [];
  for (let y = 1; y < world.h - 1; y++) {
    for (let x = 1; x < world.w - 1; x++) out.push(vec(x, y));
  }
  return out;
}

/**
 * Hands out distinct tiles from a shuffled bag. Every level draws its crates, depots and bot
 * start from one picker so that nothing is ever placed on top of anything else.
 */
export function tilePicker(rng: Rng, pool: readonly Vec[]): () => Vec {
  const bag = rng.shuffle(pool);
  let next = 0;
  return () => {
    const tile = bag[next++];
    if (!tile) throw new Error('tilePicker: ran out of tiles');
    return tile;
  };
}

/** A depot pad with its class stencilled on it. Bots read the stencil with `scan(dir).mark`. */
export function depotPad(world: World, at: Vec, kind: ItemKind): void {
  setTile(world, at, { terrain: Terrain.Pad, mark: kind });
}

/** Every pad tile that carries a stencil, paired with the class painted on it. */
export function stencilledDepots(world: World): { at: Vec; kind: ItemKind }[] {
  const out: { at: Vec; kind: ItemKind }[] = [];
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const tile = world.tiles[y * world.w + x];
      if (tile?.terrain === Terrain.Pad && tile.mark)
        out.push({ at: vec(x, y), kind: tile.mark as ItemKind });
    }
  }
  return out;
}

/** Total count of `kind` lying loose anywhere in the world. */
export function groundTotal(world: World, kind: ItemKind): number {
  return world.items.reduce((sum, stack) => (stack.kind === kind ? sum + stack.count : sum), 0);
}

export const key = (at: Vec): string => `${at.x},${at.y}`;
