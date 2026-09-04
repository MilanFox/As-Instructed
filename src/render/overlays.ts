/**
 * Grid, highlights, vignette, plant maturity gauges and the tile-hover readout.
 *
 * Two things here are load-bearing rather than decorative:
 *
 * - **Plant growth gauges.** DESIGN.md §11 A5 requires maturity to be readable at a glance;
 *   w2-03 is unsolvable otherwise. The six-sprite stage ladder in `tiles.ts` carries most of it,
 *   and this adds an arc gauge plus a "ready" pip so the last stage is unmistakable.
 * - **`describeTile`.** The UI asks the renderer what is under the cursor. Keeping the query
 *   here means the UI never has to learn the World layout.
 */

import { Terrain, maturity, terrainProps, tileAt } from '../engine/index.ts';
import type { ItemKind, Machine, Vec, World } from '../engine/index.ts';
import { alpha, overlay, palette } from './theme.ts';
import type { ViewRange } from './camera.ts';
import { roundRect } from './sprites.ts';

/** One `stroke()` for the whole viewport. ASSETS.md §4.6: never a per-tile blit. */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  tilePx: number,
  range: ViewRange,
  major = 5,
): void {
  const tile = tilePx;
  if (tile < 10) return;
  const x0 = range.x0;
  const y0 = range.y0;
  const x1 = range.x1 + 1;
  const y1 = range.y1 + 1;

  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = overlay.grid;
  ctx.beginPath();
  for (let x = x0; x <= x1; x++) {
    if (x % major === 0) continue;
    const px = Math.round(x * tile) + 0.5;
    ctx.moveTo(px, y0 * tile);
    ctx.lineTo(px, y1 * tile);
  }
  for (let y = y0; y <= y1; y++) {
    if (y % major === 0) continue;
    const py = Math.round(y * tile) + 0.5;
    ctx.moveTo(x0 * tile, py);
    ctx.lineTo(x1 * tile, py);
  }
  ctx.stroke();

  ctx.strokeStyle = overlay.gridMajor;
  ctx.beginPath();
  for (let x = x0; x <= x1; x++) {
    if (x % major !== 0) continue;
    const px = Math.round(x * tile) + 0.5;
    ctx.moveTo(px, y0 * tile);
    ctx.lineTo(px, y1 * tile);
  }
  for (let y = y0; y <= y1; y++) {
    if (y % major !== 0) continue;
    const py = Math.round(y * tile) + 0.5;
    ctx.moveTo(x0 * tile, py);
    ctx.lineTo(x1 * tile, py);
  }
  ctx.stroke();
  ctx.restore();
}

/** Corner brackets. Used for goals (amber, pulsing) and hover (cyan, steady). */
export function drawBrackets(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tilePx: number,
  color: string,
  strength: number,
  inset = 0.1,
): void {
  const px = x * tilePx;
  const py = y * tilePx;
  const i = tilePx * inset;
  const len = tilePx * 0.26;
  ctx.save();
  ctx.strokeStyle = alpha(color, strength);
  ctx.lineWidth = Math.max(1.5, tilePx * 0.045);
  ctx.lineCap = 'square';
  ctx.beginPath();
  ctx.moveTo(px + i, py + i + len);
  ctx.lineTo(px + i, py + i);
  ctx.lineTo(px + i + len, py + i);
  ctx.moveTo(px + tilePx - i - len, py + i);
  ctx.lineTo(px + tilePx - i, py + i);
  ctx.lineTo(px + tilePx - i, py + i + len);
  ctx.moveTo(px + tilePx - i, py + tilePx - i - len);
  ctx.lineTo(px + tilePx - i, py + tilePx - i);
  ctx.lineTo(px + tilePx - i - len, py + tilePx - i);
  ctx.moveTo(px + i + len, py + tilePx - i);
  ctx.lineTo(px + i, py + tilePx - i);
  ctx.lineTo(px + i, py + tilePx - i - len);
  ctx.stroke();
  ctx.restore();
}

/** Objective / goal cells. Pulses on an ~800 ms cycle, per ASSETS.md's `overlay.selection` note. */
export function drawGoals(
  ctx: CanvasRenderingContext2D,
  cells: readonly Vec[],
  tilePx: number,
  time: number,
  met: boolean,
): void {
  if (cells.length === 0) return;
  const pulse = 0.55 + 0.45 * Math.sin(time * (Math.PI * 2) / 0.8);
  const color = met ? palette.ok : overlay.goal;
  for (const cell of cells) {
    ctx.save();
    ctx.fillStyle = alpha(color, 0.08 + pulse * 0.06);
    ctx.fillRect(cell.x * tilePx, cell.y * tilePx, tilePx, tilePx);
    ctx.restore();
    drawBrackets(ctx, cell.x, cell.y, tilePx, color, 0.5 + pulse * 0.5);
  }
}

export function drawHover(
  ctx: CanvasRenderingContext2D,
  cell: Vec,
  tilePx: number,
): void {
  ctx.save();
  ctx.fillStyle = alpha(overlay.hover, 0.07);
  ctx.fillRect(cell.x * tilePx, cell.y * tilePx, tilePx, tilePx);
  ctx.restore();
  drawBrackets(ctx, cell.x, cell.y, tilePx, overlay.hover, 0.85, 0.06);
}

/**
 * Crop maturity, drawn over the plant sprite. The arc is the actual number; the pip is the
 * "you can harvest this now" signal, which is the state a player needs at a glance.
 */
export function drawPlantGauge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tilePx: number,
  growth: number,
  max: number,
  time: number,
): void {
  if (max <= 0 || tilePx < 18) return;
  const ratio = Math.max(0, Math.min(1, growth / max));
  const cx = (x + 0.5) * tilePx;
  const cy = (y + 0.86) * tilePx;
  const w = tilePx * 0.56;
  const h = Math.max(2, tilePx * 0.075);

  ctx.save();
  ctx.fillStyle = alpha(palette.bgVoid, 0.72);
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = ratio >= 1 ? palette.ok : palette.accent2;
  roundRect(ctx, cx - w / 2, cy - h / 2, Math.max(h, w * ratio), h, h / 2);
  ctx.fill();

  if (ratio >= 1) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    ctx.strokeStyle = alpha(palette.ok, 0.3 + pulse * 0.35);
    ctx.lineWidth = Math.max(1.5, tilePx * 0.035);
    ctx.beginPath();
    ctx.arc((x + 0.5) * tilePx, (y + 0.46) * tilePx, tilePx * (0.3 + pulse * 0.05), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

/** World 4 breadcrumbs written with `mark()`. */
export function drawMark(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tilePx: number,
): void {
  if (tilePx < 20) return;
  const cx = (x + 0.5) * tilePx;
  const cy = (y + 0.28) * tilePx;
  const label = text.length > 4 ? `${text.slice(0, 3)}…` : text;
  ctx.save();
  ctx.font = `600 ${Math.round(tilePx * 0.22)}px 'JetBrains Mono', ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(label).width + tilePx * 0.16;
  ctx.fillStyle = alpha(palette.bgVoid, 0.8);
  roundRect(ctx, cx - w / 2, cy - tilePx * 0.13, w, tilePx * 0.26, tilePx * 0.06);
  ctx.fill();
  ctx.strokeStyle = alpha(palette.accent, 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = palette.accent;
  ctx.fillText(label, cx, cy);
  ctx.restore();
}

/** Everything outside the grid, so a small level does not float on bare canvas. */
export function drawOutOfBounds(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  tilePx: number,
): void {
  const w = cols * tilePx;
  const h = rows * tilePx;
  ctx.save();
  ctx.strokeStyle = alpha(palette.inkDim, 0.35);
  ctx.lineWidth = Math.max(1, tilePx * 0.03);
  ctx.strokeRect(-0.5, -0.5, w + 1, h + 1);
  ctx.restore();
}

let vignetteKey = '';
let vignette: CanvasGradient | null = null;

/** Subtle corner falloff. DESIGN.md §8: no bloom, no curvature — this is the only screen effect. */
export function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const key = `${Math.round(width)}x${Math.round(height)}`;
  if (key !== vignetteKey || !vignette) {
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.hypot(cx, cy);
    const g = ctx.createRadialGradient(cx, cy, r * 0.55, cx, cy, r);
    g.addColorStop(0, 'rgba(0, 0, 0, 0)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0.42)');
    vignette = g;
    vignetteKey = key;
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Hover readout
// ---------------------------------------------------------------------------

export interface TileReadout {
  at: Vec;
  terrain: Terrain;
  walkable: boolean;
  /** Crop maturity at the queried tick, or `null` on a tile with no crop. */
  growth: number | null;
  maxGrowth: number | null;
  crop: ItemKind | null;
  items: { kind: ItemKind; count: number }[];
  botId: number | null;
  botName: string | null;
  machine: { id: string; kind: string; state: string } | null;
  mark: string | null;
  /** Single-line summary, ready to drop into a tooltip. */
  label: string;
}

function machineAtCell(world: World, x: number, y: number): Machine | undefined {
  return world.machines.find((m) => m.at.x === x && m.at.y === y);
}

/**
 * What is at (`x`, `y`) as of `tick`. Called on pointer move, never per frame, so it is allowed
 * to allocate.
 */
export function describeTile(world: World, x: number, y: number, tick: number): TileReadout | null {
  const tile = tileAt(world, { x, y });
  if (!tile) return null;
  const props = terrainProps(tile.terrain);
  const bot = world.bots.find((b) => b.alive && b.at.x === x && b.at.y === y) ?? null;
  const machine = machineAtCell(world, x, y) ?? null;
  const items = world.items
    .filter((s) => s.at.x === x && s.at.y === y && s.count > 0)
    .map((s) => ({ kind: s.kind, count: s.count }));
  const hasCrop = tile.maxGrowth !== undefined && tile.maxGrowth > 0;
  const growth = hasCrop ? maturity(tile, tick) : null;

  const parts: string[] = [`${x},${y}`, tile.terrain];
  if (hasCrop && growth !== null) parts.push(`crop ${growth}/${tile.maxGrowth ?? 0}`);
  if (bot) parts.push(bot.name);
  if (machine) parts.push(`${machine.kind}:${machine.state}`);
  for (const item of items) parts.push(`${item.kind} x${item.count}`);
  if (tile.mark) parts.push(`mark "${tile.mark}"`);

  return {
    at: { x, y },
    terrain: tile.terrain,
    walkable: props.walkable,
    growth,
    maxGrowth: hasCrop ? (tile.maxGrowth ?? null) : null,
    crop: hasCrop ? (tile.crop ?? null) : null,
    items,
    botId: bot ? bot.id : null,
    botName: bot ? bot.name : null,
    machine: machine ? { id: machine.id, kind: machine.kind, state: machine.state } : null,
    mark: tile.mark ?? null,
    label: parts.join(' · '),
  };
}

/** Cells an objective is about, when the level exposes them. Used by `Renderer.setHighlights`. */
export function padCells(world: World): Vec[] {
  const cells: Vec[] = [];
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const tile = tileAt(world, { x, y });
      if (tile?.terrain === Terrain.Pad) cells.push({ x, y });
    }
  }
  return cells;
}
