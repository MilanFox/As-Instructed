import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Terrain, createWorld, setTile } from '../../engine/index.ts';
import type { Tile, World } from '../../engine/index.ts';
import type { TerrainPaint } from '../art/types.ts';

const TILE = 96;

interface Mark {
  x: number;
  y: number;
  w: number;
  h: number;
  a: number;
}

function alphaOf(style: string): number {
  const comma = style.lastIndexOf(',');
  if (!style.startsWith('rgba(') || comma < 0) return 1;
  return Number.parseFloat(style.slice(comma + 1));
}

class Recorder {
  readonly marks: Mark[] = [];
  fillStyle = '#000000';
  imageSmoothingEnabled = false;

  save(): void {}
  restore(): void {}
  setTransform(): void {}

  clearRect(): void {
    this.marks.length = 0;
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    this.marks.push({ x, y, w, h, a: alphaOf(this.fillStyle) });
  }

  drawImage(
    source: { ctx: Recorder },
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
  ): void {
    for (const mark of source.ctx.marks) {
      const x0 = Math.max(mark.x, sx);
      const y0 = Math.max(mark.y, sy);
      const x1 = Math.min(mark.x + mark.w, sx + sw);
      const y1 = Math.min(mark.y + mark.h, sy + sh);
      if (x1 <= x0 || y1 <= y0) continue;
      this.marks.push({ x: x0 - sx + dx, y: y0 - sy + dy, w: x1 - x0, h: y1 - y0, a: mark.a });
    }
  }
}

function ink(marks: readonly Mark[], cx: number, cy: number): number {
  let covered = 0;
  for (const mark of marks) {
    const x0 = Math.max(mark.x, cx);
    const y0 = Math.max(mark.y, cy);
    const x1 = Math.min(mark.x + mark.w, cx + TILE);
    const y1 = Math.min(mark.y + mark.h, cy + TILE);
    if (x1 <= x0 || y1 <= y0) continue;
    covered += (x1 - x0) * (y1 - y0) * mark.a;
  }
  return covered / (TILE * TILE);
}

const GROUND: readonly Terrain[] = [
  Terrain.Floor,
  Terrain.Regolith,
  Terrain.Soil,
  Terrain.Rock,
  Terrain.Ore,
  Terrain.Rubble,
  Terrain.Ice,
  Terrain.Wall,
  Terrain.Pad,
  Terrain.Depot,
  Terrain.Cable,
  Terrain.Conveyor,
  Terrain.Pit,
];

let coverage = new Map<Terrain, number>();
let priorDocument: unknown;

beforeAll(async () => {
  const host = globalThis as { document?: unknown };
  priorDocument = host.document;
  host.document = {
    createElement: (): unknown => {
      const ctx = new Recorder();
      return { width: 0, height: 0, ctx, getContext: (): Recorder => ctx };
    },
  };

  const { signal } = (await import('../art/signal.ts')) as { signal: { paintTerrain?: unknown } };

  const world: World = createWorld({ w: GROUND.length, h: 1, fill: Terrain.Floor });
  GROUND.forEach((terrain, x) => {
    const tile: Tile = { terrain };
    if (terrain === Terrain.Conveyor) tile.meta = { facing: 1 };
    setTile(world, { x, y: 0 }, tile);
  });

  const board = new Recorder();
  const paint = {
    ctx: board,
    world,
    tilePx: TILE,
    width: world.w * TILE,
    height: TILE,
  } as unknown as TerrainPaint;
  (signal.paintTerrain as (p: TerrainPaint) => void)(paint);

  coverage = new Map(GROUND.map((terrain, x) => [terrain, ink(board.marks, x * TILE, 0)]));

  if (priorDocument === undefined) delete host.document;
  else host.document = priorDocument;
});

afterAll(() => {
  const host = globalThis as { document?: unknown };
  if (priorDocument === undefined) delete host.document;
  else host.document = priorDocument;
});

describe('signal paints ground, it does not leave a hole in the tube', () => {
  const MIN_INK = 0.05;

  for (const terrain of GROUND) {
    it(`${terrain} covers its tile`, () => {
      expect(coverage.get(terrain) ?? 0).toBeGreaterThan(MIN_INK);
    });
  }

  it('keeps solid terrain denser than the ground a bot drives on', () => {
    expect(coverage.get(Terrain.Wall) ?? 0).toBeGreaterThan(coverage.get(Terrain.Floor) ?? 1);
  });
});
