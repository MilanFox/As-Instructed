/**
 * Grid, highlights, vignette, plant maturity gauges and the tile-hover readout.
 *
 * Two things here are load-bearing rather than decorative:
 *
 * - **Plant growth gauges.** DESIGN.md §11 A5 requires maturity to be readable at a glance;
 *   w2-02 is unsolvable otherwise. The six-sprite stage ladder in `tiles.ts` carries most of it,
 *   and this adds an arc gauge plus a "ready" pip so the last stage is unmistakable.
 * - **`describeTile`.** The UI asks the renderer what is under the cursor. Keeping the query
 *   here means the UI never has to learn the World layout.
 */

import { Terrain, maturity, terrainProps, tileAt } from '../engine/index.ts';
import type { ItemKind, Machine, Vec, World } from '../engine/index.ts';
import { alpha, overlay, palette } from './theme.ts';
import type { ViewRange } from './camera.ts';
import { roundRect } from './sprites.ts';

/**
 * Every threshold and every minimum stroke in this file is quoted in *screen* pixels and scaled
 * by `dpr` at the call site, because `tilePx` here is in device pixels.
 *
 * That distinction is the whole legibility story at small tile sizes. A `Math.max(1.5, …)` floor
 * on a device-pixel canvas is 0.75 css px on a retina display — a stroke the eye cannot resolve —
 * and a `tilePx < 18` cutoff hides a gauge at 18 css px while showing it at 9. Both read as "the
 * overlay is broken on my machine", and both are the same missing division.
 */
const MIN_STROKE_PX = 1.5;

/** One `stroke()` for the whole viewport. ASSETS.md §4.6: never a per-tile blit. */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  tilePx: number,
  range: ViewRange,
  major = 5,
  dpr = 1,
): void {
  const tile = tilePx;
  if (tile < 10 * dpr) return;
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

/**
 * Screen pixels per tile at which the corner brackets start closing up, and at which they have
 * closed completely.
 *
 * A bracket is four ticks of line near four corners. At 48 px that is a restrained way to say
 * "this cell" — the eye reads the implied box and the tile itself stays visible. At 13 px the
 * ticks are three pixels long with a two-pixel gap between them, and there is no implied box left
 * to read: it is four specks. So the arms grow as the tile shrinks until they meet, and the
 * treatment becomes a closed outline. Same language, same colour, same weight — the marker simply
 * stops relying on the viewer being able to interpolate a shape that is smaller than a full stop.
 */
export const BRACKET_TIGHTEN_PX = 30;
export const BRACKET_CLOSED_PX = 15;

/** 0 at comfortable tile sizes, 1 once the brackets have closed into a box. */
export function bracketCloseness(tilePx: number, dpr = 1): number {
  const css = tilePx / dpr;
  if (css >= BRACKET_TIGHTEN_PX) return 0;
  if (css <= BRACKET_CLOSED_PX) return 1;
  return (BRACKET_TIGHTEN_PX - css) / (BRACKET_TIGHTEN_PX - BRACKET_CLOSED_PX);
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
  dpr = 1,
): void {
  const close = bracketCloseness(tilePx, dpr);
  const px = x * tilePx;
  const py = y * tilePx;
  // Tighter to the cell edge as it closes, so a 13 px tile spends its pixels on the marker rather
  // than on the gap around it.
  const i = tilePx * (inset - inset * 0.45 * close);
  const reach = tilePx * 0.5 - i;
  const len = tilePx * 0.26 + (reach - tilePx * 0.26) * close;
  ctx.save();
  ctx.strokeStyle = alpha(color, strength);
  // The weight has a floor in *screen* pixels and gains a little as the brackets close, which is
  // what keeps the outline a line rather than a hairline once the tile is smaller than the stroke
  // would like to be.
  ctx.lineWidth = Math.max(MIN_STROKE_PX * dpr * (1 + close * 0.4), tilePx * 0.045);
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
  /** 0..1 decaying just after the run finishes. The brackets take a breath and let go. */
  completion = 0,
  dpr = 1,
): void {
  if (cells.length === 0) return;
  const pulse = 0.55 + 0.45 * Math.sin((time * (Math.PI * 2)) / 0.8);
  const color = met ? palette.ok : overlay.goal;
  const lift = completion * completion;
  // The wash inside the cell carries progressively more of the signal as the outline runs out of
  // room. At 48 px it is a hint under the brackets; at 13 px, where the outline is most of the
  // tile, it is what makes the marked cell a *colour* the eye can find without reading a shape.
  const close = bracketCloseness(tilePx, dpr);
  const wash = 0.08 + pulse * 0.06 + lift * 0.1 + close * 0.13;
  for (const cell of cells) {
    ctx.save();
    ctx.fillStyle = alpha(color, wash);
    ctx.fillRect(cell.x * tilePx, cell.y * tilePx, tilePx, tilePx);
    ctx.restore();
    drawBrackets(
      ctx,
      cell.x,
      cell.y,
      tilePx,
      color,
      Math.min(1, 0.5 + pulse * 0.5 + lift * 0.4),
      0.1,
      dpr,
    );
  }
}

export function drawHover(
  ctx: CanvasRenderingContext2D,
  cell: Vec,
  tilePx: number,
  dpr = 1,
): void {
  ctx.save();
  ctx.fillStyle = alpha(overlay.hover, 0.07);
  ctx.fillRect(cell.x * tilePx, cell.y * tilePx, tilePx, tilePx);
  ctx.restore();
  drawBrackets(ctx, cell.x, cell.y, tilePx, overlay.hover, 0.85, 0.06, dpr);
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
  dpr = 1,
): void {
  if (max <= 0 || tilePx < 18 * dpr) return;
  const ratio = Math.max(0, Math.min(1, growth / max));
  const cx = (x + 0.5) * tilePx;
  const cy = (y + 0.86) * tilePx;
  const w = tilePx * 0.56;
  const h = Math.max(2 * dpr, tilePx * 0.075);

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
    ctx.lineWidth = Math.max(MIN_STROKE_PX * dpr, tilePx * 0.035);
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
  dpr = 1,
): void {
  if (tilePx < 20 * dpr) return;
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
  ctx.lineWidth = dpr;
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
  dpr = 1,
): void {
  const w = cols * tilePx;
  const h = rows * tilePx;
  ctx.save();
  ctx.strokeStyle = alpha(palette.inkDim, 0.35);
  ctx.lineWidth = Math.max(dpr, tilePx * 0.03);
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

const celebrationGradients = new Map<string, CanvasGradient>();

/**
 * The full-screen tint behind a celebration.
 *
 * A wash from the edges inward rather than a flash: at its peak the centre of the screen — where
 * the bots and any text are — is barely touched, and the colour arrives in the periphery, which
 * is where a human notices a change without having to look at it. No bloom, no flash frame, and
 * nothing here survives `strength` reaching zero.
 */
export function drawCelebration(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
  strength: number,
): void {
  if (strength <= 0.005) return;
  const key = `${Math.round(width)}x${Math.round(height)}:${color}`;
  let gradient = celebrationGradients.get(key);
  if (!gradient) {
    const cx = width / 2;
    const cy = height / 2;
    const r = Math.hypot(cx, cy);
    gradient = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    gradient.addColorStop(0, alpha(color, 0));
    gradient.addColorStop(0.62, alpha(color, 0.35));
    gradient.addColorStop(1, alpha(color, 1));
    // One entry per viewport size per medal colour: five colours and a resize or two, not a leak.
    if (celebrationGradients.size > 24) celebrationGradients.clear();
    celebrationGradients.set(key, gradient);
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = Math.min(1, strength);
  ctx.fillStyle = gradient;
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
