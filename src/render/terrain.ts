import { Terrain, tileAt } from '../engine/index.ts';
import type { Tile, World } from '../engine/index.ts';
import { snapTilePx } from './camera.ts';
import { alpha, artDirection, palette } from './theme.ts';
import type { ArtId } from './art/types.ts';
import type { Biome, TileSet } from './tiles.ts';
import { TILE_PX, biomeArt, terrainArt } from './tiles.ts';

const MAX_CACHE_EDGE = 4096;

export interface TerrainKey {
  cols: number;
  rows: number;
  biome: Biome;
  revision: number;
  cacheTilePx: number;
  art: ArtId;
}

export function cacheTilePxFor(deviceTilePx: number, cols: number, rows: number): number {
  const areaCap = Math.floor(MAX_CACHE_EDGE / Math.max(1, Math.max(cols, rows)));
  const cap = Math.max(4, Math.min(TILE_PX, areaCap));
  return Math.max(4, Math.min(cap, snapTilePx(deviceTilePx)));
}

export function keysEqual(a: TerrainKey | null, b: TerrainKey): boolean {
  return (
    a !== null &&
    a.cols === b.cols &&
    a.rows === b.rows &&
    a.biome === b.biome &&
    a.revision === b.revision &&
    a.cacheTilePx === b.cacheTilePx &&
    a.art === b.art
  );
}

export class TerrainLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private key: TerrainKey | null = null;
  rebuilds = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1;
    this.canvas.height = 1;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('terrain: 2d context unavailable');
    this.ctx = ctx;
  }

  get cacheTilePx(): number {
    return this.key?.cacheTilePx ?? TILE_PX;
  }

  invalidate(): void {
    this.key = null;
  }

  sync(
    world: World,
    tiles: TileSet,
    biome: Biome,
    revision: number,
    deviceTilePx: number,
  ): boolean {
    const cacheTilePx = cacheTilePxFor(deviceTilePx, world.w, world.h);
    const next: TerrainKey = {
      cols: world.w,
      rows: world.h,
      biome,
      revision,
      cacheTilePx,
      art: artDirection().id,
    };
    if (keysEqual(this.key, next)) return false;
    this.key = next;
    this.rebuilds++;
    this.render(world, tiles, biome, cacheTilePx);
    return true;
  }

  private render(world: World, tiles: TileSet, biome: Biome, tilePx: number): void {
    const width = world.w * tilePx;
    const height = world.h * tilePx;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = tilePx < TILE_PX;
    ctx.imageSmoothingQuality = 'high';

    const art = artDirection();
    if (art.paintTerrain) {
      art.paintTerrain({ ctx, world, tilePx, biome, tiles, width, height });
      return;
    }

    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const tile = tileAt(world, { x, y });
        if (!tile) continue;
        const art = terrainArt(tile.terrain, tile, biome, x, y);
        tiles.draw(ctx, art.base, x * tilePx, y * tilePx, tilePx);
      }
    }
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const tile = tileAt(world, { x, y });
        if (!tile) continue;
        const art = terrainArt(tile.terrain, tile, biome, x, y);
        if (art.prop) tiles.draw(ctx, art.prop, x * tilePx, y * tilePx, tilePx);
      }
    }

    this.tintSolids(world, ctx, tilePx);
    this.renderPits(world, ctx, tilePx);
    this.renderWallShadows(world, ctx, tilePx);

    const dim = biomeArt(biome).dim;
    if (dim < 1) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = alpha(palette.bgVoid, 1 - dim);
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  private tintSolids(world: World, ctx: CanvasRenderingContext2D, tilePx: number): void {
    ctx.save();
    const wall = alpha(palette.bgVoid, 0.42);
    const obstacle = alpha(palette.bgVoid, 0.22);
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const tile = tileAt(world, { x, y });
        if (!isSolid(tile)) continue;
        const isWall = !tile || tile.terrain === Terrain.Wall || tile.terrain === Terrain.Void;
        ctx.fillStyle = isWall ? wall : obstacle;
        ctx.fillRect(x * tilePx, y * tilePx, tilePx, tilePx);
      }
    }
    ctx.restore();
  }

  private renderPits(world: World, ctx: CanvasRenderingContext2D, tilePx: number): void {
    const r = tilePx * 0.36;
    ctx.save();
    ctx.lineWidth = Math.max(1, tilePx * 0.05);
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        if (tileAt(world, { x, y })?.terrain !== Terrain.Pit) continue;
        const cx = (x + 0.5) * tilePx;
        const cy = (y + 0.52) * tilePx;
        ctx.fillStyle = alpha(palette.bgVoid, 0.88);
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.88, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = alpha(palette.inkDim, 0.55);
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.88, 0, Math.PI * 1.08, Math.PI * 1.92);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private renderWallShadows(world: World, ctx: CanvasRenderingContext2D, tilePx: number): void {
    const depth = Math.max(2, Math.round(tilePx * 0.28));
    const gradient = ctx.createLinearGradient(0, 0, 0, depth);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.42)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save();
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        if (!isSolid(tileAt(world, { x, y }))) continue;
        if (isSolid(tileAt(world, { x, y: y + 1 }))) continue;
        ctx.save();
        ctx.translate(x * tilePx, (y + 1) * tilePx);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, tilePx, depth);
        ctx.restore();
      }
    }
    ctx.restore();
  }
}

function isSolid(tile: Tile | undefined): boolean {
  if (!tile) return true;
  return (
    tile.terrain === Terrain.Wall ||
    tile.terrain === Terrain.Rock ||
    tile.terrain === Terrain.Ore ||
    tile.terrain === Terrain.Rubble ||
    tile.terrain === Terrain.Void
  );
}
