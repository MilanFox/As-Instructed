import type { ItemKind, Rng, Vec, World } from '../../engine/index.ts';
import { Terrain, setTerrain, setTile, vec } from '../../engine/index.ts';

export const YARD_CLASSES: readonly ItemKind[] = [
  'crate',
  'part',
  'chip',
  'cell',
  'ore',
  'stone',
  'scrap',
];

export function warm(rng: Rng): void {
  for (let i = 0; i < 3; i++) rng.next();
}

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

export function interior(world: World): Vec[] {
  const out: Vec[] = [];
  for (let y = 1; y < world.h - 1; y++) {
    for (let x = 1; x < world.w - 1; x++) out.push(vec(x, y));
  }
  return out;
}

export function tilePicker(rng: Rng, pool: readonly Vec[]): () => Vec {
  const bag = rng.shuffle(pool);
  let next = 0;
  return () => {
    const tile = bag[next++];
    if (!tile) throw new Error('tilePicker: ran out of tiles');
    return tile;
  };
}

export function depotPad(world: World, at: Vec, kind: ItemKind): void {
  setTile(world, at, { terrain: Terrain.Pad, mark: kind });
}

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

export function groundTotal(world: World, kind: ItemKind): number {
  return world.items.reduce((sum, stack) => (stack.kind === kind ? sum + stack.count : sum), 0);
}

export const key = (at: Vec): string => `${at.x},${at.y}`;
