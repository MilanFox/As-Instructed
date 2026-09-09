/**
 * Grid, highlights, vignette, plant maturity gauges and the tile-hover readout.
 *
 * Two things here are load-bearing rather than decorative:
 *
 * - **Plant growth gauges.** DESIGN.md §8 requires maturity to be readable at a glance;
 *   w2-02 is unsolvable otherwise. The six-sprite stage ladder in `tiles.ts` carries most of it,
 *   and this adds an arc gauge plus a "ready" pip so the last stage is unmistakable.
 * - **`describeTile`.** The UI asks the renderer what is under the cursor. Keeping the query
 *   here means the UI never has to learn the World layout.
 */

import { FED_BY, MANUAL_ONLY, Terrain, maturity, sproutsIn, terrainProps, tileAt } from '../engine/index.ts';
import type { ItemKind, Machine, Tile, Vec, World } from '../engine/index.ts';
import { alpha, artDirection, luminance, metrics, overlay, palette } from './theme.ts';
import type { ViewRange } from './camera.ts';
import { roundRect } from './sprites.ts';
import { TRAIL_MIN_VISITS } from './trail.ts';

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

/** One `stroke()` for the whole viewport. Never a per-tile blit. */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  tilePx: number,
  range: ViewRange,
  major = 5,
  dpr = 1,
): void {
  const tile = tilePx;
  if (tile < metrics.gridMinTilePx * dpr) return;
  const x0 = range.x0;
  const y0 = range.y0;
  const x1 = range.x1 + 1;
  const y1 = range.y1 + 1;

  ctx.save();
  ctx.lineWidth = metrics.gridWidth * dpr;
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

  ctx.lineWidth = metrics.gridMajorWidth * dpr;
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

/** Objective / goal cells. Pulses on an ~800 ms cycle. */
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

/**
 * A crop whose growth clock has not started yet (`sproutsIn(tile, t) > 0`). Maturity reads 0 here
 * exactly like a freshly-started crop does, and no stage sprite carries the difference — without
 * this the tile is a silent "0" a player can only recover by hovering. Steady, not pulsing: it is
 * reporting a fact about the tile, not asking for attention the way a ready-to-harvest pip does.
 */
export function drawSprouting(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tilePx: number,
  ticksLeft: number,
  dpr = 1,
): void {
  if (tilePx < 14 * dpr) return;
  const cx = (x + 0.2) * tilePx;
  const cy = (y + 0.2) * tilePx;
  const r = Math.max(3 * dpr, tilePx * 0.11);

  ctx.save();
  ctx.fillStyle = alpha(palette.bgVoid, 0.6);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = palette.inkDim;
  ctx.lineWidth = Math.max(MIN_STROKE_PX * dpr, tilePx * 0.028);
  ctx.stroke();
  // A clock hand pointing to noon, so the ring reads as "waiting" rather than an empty circle.
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - r * 0.65);
  ctx.stroke();
  ctx.restore();

  if (tilePx < 26 * dpr) return;
  ctx.save();
  ctx.font = `600 ${Math.round(tilePx * 0.17)}px 'JetBrains Mono', ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.inkDim;
  ctx.fillText(String(ticksLeft), cx + r + tilePx * 0.06, cy);
  ctx.restore();
}

/** Ticks the spoilage hand takes to go once round. One lap is a long time to leave a crop standing. */
const SPOIL_LAP_TICKS = 12;

/** Laps drawn as tree rings before the face stops growing. The number goes on counting. */
const SPOIL_MAX_LAPS = 2;

/**
 * Ticks this crop has stood mature and unpicked as of `t`, which is the quantity `w2-04`'s
 * `crop-spoilage` bonus charges for. Zero on anything that is not both ripe and on a clock.
 *
 * Keyed on `meta.plantedAt` rather than on `growth >= maxGrowth`, for the same reason the ledger
 * in `world-2/shared.ts` is: a tile has a growth clock exactly when it has a `plantedAt`, and that
 * is also the condition `drawSprouting` reads. `w2-02`'s field is authored ripe with no clock on
 * it at all and so gets no badge, which is right — nothing there grades how long anything waits,
 * and a badge on all forty tiles would be noise over the one distinction that level is played on.
 */
export function ripeFor(tile: Tile, t: number): number {
  const plantedAt = tile.meta?.['plantedAt'];
  const max = tile.maxGrowth ?? 0;
  if (typeof plantedAt !== 'number' || max <= 0) return 0;
  return Math.max(0, Math.floor(t) - (plantedAt + max));
}

/**
 * A crop that ripened and is still standing — `drawSprouting`'s far side.
 *
 * `maturity()` clamps at `maxGrowth` and the stage ladder ends at ripe, so from the moment the
 * last stage lands the board has nothing further to say: one tick overdue and thirty are the same
 * pixels, on the level whose bonus is exactly that difference.
 *
 * Deliberately the same instrument as `drawSprouting` — same corner, same centre, same radius,
 * same face — because it is the same clock read on the other side of the mark. The two can never
 * both be up (one wants `t < plantedAt`, the other `t > plantedAt + maxGrowth`), so the corner is
 * never contested and the player learns one dial rather than two.
 *
 * What separates them is *fill*, not hue. The face darkens through a wedge as the hand sweeps a
 * lap every `SPOIL_LAP_TICKS`, and a completed lap leaves a tree ring behind. `renderPits` in
 * `terrain.ts` settled the house rule this follows: stay inside the art direction rather than
 * reaching for a warning colour, and draw the thing itself. A solid face against a hollow one also
 * survives greyscale, and survives the zoom below which the number is hidden — which is precisely
 * where a dim amber tint would stop saying anything.
 */
export function drawSpoiling(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tilePx: number,
  ticksOver: number,
  dpr = 1,
): void {
  if (tilePx < 14 * dpr) return;
  const cx = (x + 0.2) * tilePx;
  const cy = (y + 0.2) * tilePx;
  const r = Math.max(3 * dpr, tilePx * 0.11);
  const laps = Math.min(SPOIL_MAX_LAPS, Math.floor(ticksOver / SPOIL_LAP_TICKS));
  const noon = -Math.PI / 2;
  const swept = ((ticksOver % SPOIL_LAP_TICKS) / SPOIL_LAP_TICKS) * Math.PI * 2;

  ctx.save();
  ctx.fillStyle = alpha(palette.bgVoid, 0.6);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // The wedge from noon round to the hand is the lap in progress; past one lap the face is solid,
  // which is the step that carries at a glance and at any size.
  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, noon, noon + (laps > 0 ? Math.PI * 2 : swept));
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = Math.max(MIN_STROKE_PX * dpr, tilePx * 0.028);
  ctx.strokeStyle = palette.ink;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  // Rings inset rather than added outside: an outer ring at the third lap would cross the tile
  // edge and start reading as a mark on the neighbour.
  ctx.strokeStyle = alpha(palette.bgVoid, 0.85);
  for (let lap = 1; lap <= laps; lap++) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * (1 - lap * 0.3), 0, Math.PI * 2);
    ctx.stroke();
  }
  // The hand goes on sweeping over a filled face, so a lapped clock still visibly runs.
  ctx.strokeStyle = laps > 0 ? alpha(palette.bgVoid, 0.85) : palette.ink;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(noon + swept) * r * 0.65, cy + Math.sin(noon + swept) * r * 0.65);
  ctx.stroke();
  ctx.restore();

  if (tilePx < 26 * dpr) return;
  ctx.save();
  ctx.font = `600 ${Math.round(tilePx * 0.17)}px 'JetBrains Mono', ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = palette.ink;
  ctx.fillText(String(ticksOver), cx + r + tilePx * 0.06, cy);
  ctx.restore();
}

/**
 * Lines in one of an antenna tile's band logs — `rx` inbound, `tx` outbound — or `-1` when this
 * tile carries no such log at all.
 *
 * Counts newlines instead of splitting, because this runs inside `frame()` where nothing may
 * allocate, and an antenna holding forty packets would otherwise make forty strings a frame.
 *
 * `-1` rather than `0` is the load-bearing part: "there is no band here" and "the band is quiet
 * this shift" are different facts, and `w6-01`'s seed 3 — where the correct program does nothing
 * at all — is the second one. Telling them apart is the whole of DESIGN.md §11.8's unread packet.
 */
export function bandLines(tile: Tile, key: 'rx' | 'tx'): number {
  const value = tile.meta?.[key];
  if (typeof value !== 'string') return -1;
  if (value === '') return 0;
  let lines = 1;
  for (let i = 0; i < value.length; i++) {
    if (value.charCodeAt(i) === 10) lines++;
  }
  return lines;
}

/** How far `receive()` has read into the inbound band. Packets behind it are spent. */
export function bandCursor(tile: Tile): number {
  const next = tile.meta?.['rxNext'];
  return typeof next === 'number' ? next : 0;
}

/**
 * The antenna's buffer: how deep the inbound queue is and how far through it the run has read.
 *
 * DESIGN.md §11.8 names "an unread packet" as one of its own three worked examples of a known
 * unknown a preview has to draw, and the antenna was the one tile in the game that drew nothing:
 * identical with zero packets on it and with twelve, identical after every read. `buffered()` now
 * answers the count in code (`docs/audits/handoff-antenna.md`); this is the board half.
 *
 * Two marks, in the order they earn their pixels:
 *
 * - **A cursor bar** on the tile's south edge, in the same place and the same shape as
 *   `drawPlantGauge`'s maturity strip, because it is the same statement — a run through a fixed
 *   quantity. Spent packets are `--ink-dim` behind the cursor, unread ones `--ink` ahead of it.
 *   It survives to a smaller tile than the rest of the cluster, because "how far through" is what
 *   makes `w6-02`'s twenty-to-forty packets worth scrubbing.
 * - **A card stack and the unread count**, once there is room to read a number. The stack is what
 *   says "packets" rather than "a gauge"; the number is what a player would otherwise have had to
 *   spend a `receive()` to learn.
 *
 * An empty band draws the outline and a dim `0` rather than nothing — that is the difference
 * between a quiet shift and no listening post, and it is a difference the level is played on.
 *
 * Nothing here animates on its own. `buffered()` deliberately writes no tile change, so a program
 * that polls the depth every tick must not make the tile flicker; the drawing moves only when
 * `receive()` advances the cursor, which is a real `tileChange` in the trace and therefore scrubs.
 */
export function drawBuffer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tilePx: number,
  unread: number,
  total: number,
  dpr = 1,
): void {
  if (tilePx < 16 * dpr) return;
  const read = Math.max(0, total - unread);
  const w = tilePx * 0.62;
  const h = Math.max(2 * dpr, tilePx * 0.075);
  const bx = (x + 0.5) * tilePx - w / 2;
  const by = (y + 0.88) * tilePx - h / 2;

  ctx.save();
  ctx.fillStyle = alpha(palette.bgVoid, 0.72);
  roundRect(ctx, bx, by, w, h, h / 2);
  ctx.fill();
  if (total > 0) {
    const split = w * (read / total);
    if (read > 0) {
      ctx.fillStyle = alpha(palette.inkDim, 0.9);
      roundRect(ctx, bx, by, Math.max(h, split), h, h / 2);
      ctx.fill();
    }
    if (unread > 0) {
      ctx.fillStyle = palette.ink;
      roundRect(ctx, bx + split, by, Math.max(h, w - split), h, h / 2);
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = alpha(palette.inkDim, 0.7);
    ctx.lineWidth = Math.max(1, dpr);
    roundRect(ctx, bx, by, w, h, h / 2);
    ctx.stroke();
  }
  ctx.restore();

  if (tilePx < 26 * dpr) return;
  const live = unread > 0;
  const label = String(unread);
  const cardW = tilePx * 0.13;
  const cardH = tilePx * 0.17;
  const step = tilePx * 0.035;

  ctx.save();
  ctx.font = `600 ${Math.round(tilePx * 0.19)}px 'JetBrains Mono', ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const cluster = cardW + step * 2 + tilePx * 0.08 + ctx.measureText(label).width;
  const left = (x + 0.5) * tilePx - cluster / 2;
  const cy = (y + 0.66) * tilePx;
  ctx.lineWidth = Math.max(1, dpr);
  // Back to front. Only the front card — the one at the cursor — goes to full ink, so a drained
  // buffer is a stack that is still visibly there and no longer saying anything.
  for (let card = 2; card >= 0; card--) {
    const cx = left + card * step;
    const top = cy - cardH / 2 - card * step * 0.6;
    ctx.fillStyle = alpha(palette.bgVoid, 0.85);
    roundRect(ctx, cx, top, cardW, cardH, tilePx * 0.025);
    ctx.fill();
    ctx.strokeStyle = card === 0 && live ? palette.ink : palette.inkDim;
    ctx.stroke();
  }
  ctx.fillStyle = live ? palette.ink : palette.inkDim;
  ctx.fillText(label, left + cardW + step * 2 + tilePx * 0.08, cy);
  ctx.restore();
}

/**
 * The `Machine.vars` keys worth a badge, best first. A machine holding several is read down this
 * list and shows the first one found.
 *
 * An allow-list rather than a rule, because every rule anyone would write picks the wrong key.
 * Worlds 5-8 put twenty-nine keys into `vars` and most of them are not quantities at all: `dep0: 3`
 * means "`sub-3` feeds me", `c0..c59` are positions packed as `y * w + x`, `salt` and `key` are
 * cryptographic material, `feed` and `prereq:<id>` are edges wearing a number's clothes, and
 * `band: 4470` is a joke constant. Badging any of those puts a confident wrong number on a tile,
 * which is worse than the blank it replaced. So the list is the keys that are genuinely a
 * magnitude *and* that a level grades, states on a fact card, or whose solution reads them.
 *
 * `manual`, `fed:` and `link:` are absent on purpose: they are relations and refusals, and they
 * get `drawCrank` and `drawTether` instead.
 *
 * Ordering is by how much the comparison is worth on the board. `capacity`/`draw` are first
 * because `w5-04` is a level about which feeder is biggest; `cost`/`stages` next because the
 * machine's own `state` already counts up toward them, so the badge completes a `4 of 12`; `deps`
 * next because a `0` badge instantly marks the roots of `w8-03`'s dependency graph, which is the
 * first thing that level asks a player to find.
 */
export const BADGE_VARS: readonly string[] = [
  'capacity',
  'draw',
  'cost',
  'stages',
  'deps',
  'requisition',
  'stations',
  'sites',
  'shift',
  'travelBudget',
  'cableBudget',
  'scouts',
  'workers',
  'crops',
  'jobs',
  'probeBudget',
  'bound',
  'sent',
];

/** The key this machine should badge, or `''` for none. Allocation-free; runs inside `frame()`. */
export function badgeVarKey(machine: Machine): string {
  for (let i = 0; i < BADGE_VARS.length; i++) {
    const key = BADGE_VARS[i] as string;
    if (typeof machine.vars[key] === 'number') return key;
  }
  return '';
}

/**
 * One number off a machine's `vars`, on the machine's tile.
 *
 * Worlds 5 to 8 keep their substance in `Machine.vars` and the board drew none of it: two nodes
 * with `capacity: 12` and `capacity: 30` were the same sprite, so "which feeder is the largest" —
 * a comparison the eye makes instantly in every other game — was a `probe()` loop. The badge does
 * not replace `probe()`, which still answers everything; it restores the *comparison*.
 *
 * Ink text on a dim-bordered plate, deliberately not `--accent`: `drawMark` owns cyan on a tile
 * because a mark is something the player wrote, and this is something the level authored. The two
 * have to stay tellable apart on `w8-05`, where a sink carries both.
 */
export function drawVarBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tilePx: number,
  value: number,
  dpr = 1,
): void {
  if (tilePx < 22 * dpr) return;
  const label = Math.abs(value) >= 10000 ? `${Math.round(value / 1000)}k` : String(value);
  ctx.save();
  ctx.font = `600 ${Math.round(tilePx * 0.2)}px 'JetBrains Mono', ui-monospace, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(label).width + tilePx * 0.14;
  const h = tilePx * 0.26;
  const cx = (x + 1) * tilePx - w / 2 - tilePx * 0.07;
  const cy = (y + 0.17) * tilePx;
  ctx.fillStyle = alpha(palette.bgVoid, 0.82);
  roundRect(ctx, cx - w / 2, cy - h / 2, w, h, tilePx * 0.05);
  ctx.fill();
  ctx.strokeStyle = alpha(palette.inkDim, 0.85);
  ctx.lineWidth = Math.max(1, dpr);
  ctx.stroke();
  ctx.fillStyle = palette.ink;
  ctx.fillText(label, cx, cy);
  ctx.restore();
}

/**
 * How far a machine is through its `cycle`, for the machines that have more than two steps in one.
 *
 * `w8-05`'s airlock cranks through `['sealed','1',…,'8','open']` and the board did not move for
 * eight of the nine steps: the machine glow fires only for `on`/`open`/`busy`, so `sealed` and `1`
 * through `8` were the identical unglowing door. That is `w2-04`'s `0/8` failure again — a mechanic
 * in progress drawn as a mechanic that is not happening — and worse than it was there, because
 * `0/8` at least printed a number. `w7-04`'s job levers build the same `['open','1',…,'done']`
 * shape and get this for nothing.
 *
 * The vocabulary is `drawSprouting`'s, deliberately: a ring plus a number, both zoom cutoffs
 * already tuned, saying the same thing it says — *this is partway through, and here is how far*.
 * It reads clockwise from noon in `--accent`, because unlike the crop clocks this is the player's
 * own progress and §8 gives cyan to the player.
 */
export function drawStageRing(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tilePx: number,
  step: number,
  steps: number,
  dpr = 1,
): void {
  if (steps <= 0 || tilePx < 14 * dpr) return;
  const cx = (x + 0.8) * tilePx;
  const cy = (y + 0.8) * tilePx;
  const r = Math.max(3 * dpr, tilePx * 0.11);
  const done = Math.max(0, Math.min(1, step / steps));
  const noon = -Math.PI / 2;

  ctx.save();
  ctx.fillStyle = alpha(palette.bgVoid, 0.7);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(MIN_STROKE_PX * dpr, tilePx * 0.032);
  ctx.strokeStyle = alpha(palette.inkDim, 0.8);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  if (done > 0) {
    ctx.strokeStyle = done >= 1 ? palette.ok : palette.accent;
    ctx.beginPath();
    ctx.arc(cx, cy, r, noon, noon + done * Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  if (tilePx < 26 * dpr) return;
  ctx.save();
  ctx.font = `600 ${Math.round(tilePx * 0.17)}px 'JetBrains Mono', ui-monospace, monospace`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = done >= 1 ? palette.ok : palette.ink;
  ctx.fillText(`${step}/${steps}`, cx - r - tilePx * 0.06, cy);
  ctx.restore();
}

/**
 * `MANUAL_ONLY` — a machine `power()` refuses, that only a `use()` at its tile moves.
 *
 * `types.ts:118-125` argues the case for publishing this in `vars` at all: "a rule the player
 * cannot read before they break it is not a rule, it is a trap." It then satisfies that argument
 * on the API leg only, and a station that will refuse `power()` was pixel-identical to one that
 * will take it. A crank is the shortest way to say the actual rule — *this one is turned, not
 * switched* — and it survives greyscale, which a coloured plate would not.
 */
export function drawCrank(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tilePx: number,
  dpr = 1,
): void {
  if (tilePx < 18 * dpr) return;
  const cx = (x + 0.2) * tilePx;
  const cy = (y + 0.8) * tilePx;
  const r = Math.max(3 * dpr, tilePx * 0.1);
  ctx.save();
  ctx.fillStyle = alpha(palette.bgVoid, 0.7);
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = Math.max(MIN_STROKE_PX * dpr, tilePx * 0.03);
  ctx.lineCap = 'round';
  // Boss, arm, handle. Three marks, because two of them is an arrow and one of them is a dot.
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + r * 0.85, cy - r * 0.6);
  ctx.stroke();
  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  ctx.arc(cx + r * 0.85, cy - r * 0.6, Math.max(1.2 * dpr, r * 0.24), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Hoisted so `setLineDash` never allocates inside the frame. Rewritten in place per call. */
const TETHER_SOLID: number[] = [];
const TETHER_DASH: number[] = [0, 0];

/**
 * A line from a machine to a cell it is bound to, with a diamond on the cell.
 *
 * Serves the two findings that are the same picture. `FED_BY` (`types.ts:127-141`) says a machine
 * draws from another one and quietly returns `false` until that one reads `on` — a refusal that is
 * silent *by design*, so the board was the only place it could ever have been drawn. `Machine.links`
 * is the set of tiles whose terrain flips with the machine's state, and while `w8-05`'s gates were
 * visible as walls, nothing said those two walls were ever going to move, or which machine moved
 * them.
 *
 * Live is solid and `--accent`; dead is dashed and `--ink-dim`. The dash matters as much as the
 * colour: `signal` is a single phosphor and a distinction carried only in hue is not a distinction
 * there. A dashed line reads as a connection that is not currently carrying, which is exactly what
 * a cold feeder and a shut gate both are.
 */
export function drawTether(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  tilePx: number,
  live: boolean,
  dpr = 1,
): void {
  if (tilePx < 14 * dpr) return;
  const ax = (fromX + 0.5) * tilePx;
  const ay = (fromY + 0.5) * tilePx;
  const bx = (toX + 0.5) * tilePx;
  const by = (toY + 0.5) * tilePx;
  TETHER_DASH[0] = tilePx * 0.1;
  TETHER_DASH[1] = tilePx * 0.08;

  ctx.save();
  ctx.strokeStyle = alpha(live ? palette.accent : palette.inkDim, live ? 0.8 : 0.55);
  ctx.lineWidth = Math.max(1, dpr);
  ctx.setLineDash(live ? TETHER_SOLID : TETHER_DASH);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  // The diamond, always solid: the line says which machine, the diamond says which cell, and the
  // cell has to go on saying it once the eye has left the line.
  ctx.setLineDash(TETHER_SOLID);
  const s = Math.max(2 * dpr, tilePx * 0.12);
  ctx.beginPath();
  ctx.moveTo(bx, by - s);
  ctx.lineTo(bx + s, by);
  ctx.lineTo(bx, by + s);
  ctx.lineTo(bx - s, by);
  ctx.closePath();
  ctx.stroke();
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
  ctx.lineWidth = Math.max(metrics.outlineWidth * dpr, tilePx * 0.03);
  ctx.strokeRect(-0.5, -0.5, w + 1, h + 1);
  ctx.restore();
}

let vignetteKey = '';
let vignette: CanvasGradient | null = null;

/**
 * Subtle corner falloff. DESIGN.md §8: no bloom, no curvature — this is the only screen effect.
 *
 * A vignette is a lens artefact, and not every direction has a lens: on a board that is a printed
 * sheet it is a grey smudge over the paper corners, which is precisely the effect that direction
 * exists to avoid. Gated on the luminance of the floor the direction actually paints rather than
 * on a list of ids, so it stays a property of the look and a new direction gets the right answer
 * without editing this file.
 */
export function drawVignette(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  if (luminance(artDirection().referenceFloor) > 0.4) return;
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
  /** Ticks remaining before this crop's growth clock starts; 0 once growing or if there's no crop. */
  sproutsIn: number;
  /** Ticks this crop has stood mature and unpicked; 0 unless it is both ripe and on a clock. */
  ripeFor: number;
  crop: ItemKind | null;
  items: { kind: ItemKind; count: number }[];
  botId: number | null;
  botName: string | null;
  machine: { id: string; kind: string; state: string } | null;
  /**
   * The antenna band on this tile, or `null` on a tile that carries none. `unread` is the depth
   * `buffered()` reports; `sent` is the outbound log, which the board deliberately leaves to text.
   */
  buffer: { unread: number; total: number; sent: number } | null;
  mark: string | null;
  /** Times a bot has stood here at or before this tick. `0` when nothing has. */
  visits: number;
  /** Single-line summary, ready to drop into a tooltip. */
  label: string;
}

function machineAtCell(world: World, x: number, y: number): Machine | undefined {
  return world.machines.find((m) => m.at.x === x && m.at.y === y);
}

/**
 * What is at (`x`, `y`) as of `tick`. Called on pointer move, never per frame, so it is allowed
 * to allocate.
 *
 * `visits` comes in from the caller rather than out of the world, because the count is derived
 * from the trace's arrival ticks (`trail.ts`) and not stored on a tile. The trail's colour ramp
 * saturates at `TRAIL_MAX_VISITS`, which is right for the ramp — `w4-02`'s worst *correct* tile is
 * touched six times, so ten hands the top of the ramp to runs that are genuinely stuck — but it
 * does mean fifteen visits and a hundred draw the same wash. The exact figure belongs in text.
 */
export function describeTile(
  world: World,
  x: number,
  y: number,
  tick: number,
  visits = 0,
): TileReadout | null {
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
  const sprouting = hasCrop ? sproutsIn(tile, tick) : 0;
  const overripe = hasCrop ? ripeFor(tile, tick) : 0;
  // The board draws the inbound depth; the outbound tally is a second number in the same cluster
  // and the tile has not got the room, so it lands here instead. `w6-02`'s "relay the clean ones"
  // is a before/after pair, and this is where a player reads both halves of it.
  const inbound = bandLines(tile, 'rx');
  const buffer =
    inbound < 0
      ? null
      : {
          unread: Math.max(0, inbound - bandCursor(tile)),
          total: inbound,
          sent: Math.max(0, bandLines(tile, 'tx')),
        };

  const parts: string[] = [`${x},${y}`, tile.terrain];
  if (hasCrop && growth !== null) {
    parts.push(sprouting > 0 ? `crop sprouts in ${sprouting}t` : `crop ${growth}/${tile.maxGrowth ?? 0}`);
  }
  // The one number `w2-04`'s freshness ledger is made of. It follows the maturity part rather than
  // replacing it, because "ripe, and for how long" is two facts and the bonus grades the second.
  if (overripe > 0) parts.push(`ripe ${overripe}t`);
  if (bot) parts.push(bot.name);
  if (machine) parts.push(`${machine.kind}:${machine.state}`);
  // The badge on the tile is a bare number by necessity; this is where it gets its name. The rest
  // of `vars` stays `probe()`'s job, which is the leg §11.7 already has standing.
  if (machine) {
    const cycle = machine.cycle;
    const step = cycle && cycle.length > 2 ? cycle.indexOf(machine.state) : -1;
    if (step >= 0 && cycle) parts.push(`stage ${step}/${cycle.length - 1}`);
    const badged = badgeVarKey(machine);
    if (badged !== '') parts.push(`${badged} ${String(machine.vars[badged])}`);
    if (machine.vars[MANUAL_ONLY] === 1) parts.push('manual');
    for (const varKey in machine.vars) {
      if (varKey.startsWith(FED_BY)) parts.push(`fed by ${varKey.slice(FED_BY.length)}`);
    }
  }
  if (buffer) {
    parts.push(`buffer ${buffer.unread}/${buffer.total}`);
    if (buffer.sent > 0) parts.push(`sent ${buffer.sent}`);
  }
  for (const item of items) parts.push(`${item.kind} x${item.count}`);
  if (tile.mark) parts.push(`mark "${tile.mark}"`);
  // Only past the ramp's own floor, for the reason `trail.ts` gives for not drawing a single
  // visit: standing somewhere once is not information, and a `1` on every tile a bot crossed is.
  if (visits >= TRAIL_MIN_VISITS) parts.push(`${visits} visits`);

  return {
    at: { x, y },
    terrain: tile.terrain,
    walkable: props.walkable,
    growth,
    maxGrowth: hasCrop ? (tile.maxGrowth ?? null) : null,
    sproutsIn: sprouting,
    ripeFor: overripe,
    crop: hasCrop ? (tile.crop ?? null) : null,
    items,
    botId: bot ? bot.id : null,
    botName: bot ? bot.name : null,
    machine: machine ? { id: machine.id, kind: machine.kind, state: machine.state } : null,
    buffer,
    mark: tile.mark ?? null,
    visits,
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
