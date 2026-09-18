import {
  FED_BY,
  MANUAL_ONLY,
  Terrain,
  maturity,
  sproutsIn,
  terrainProps,
  tileAt,
} from '../engine/index.ts';
import type { ItemKind, Machine, Tile, Vec, World } from '../engine/index.ts';
import { alpha, artDirection, luminance, metrics, overlay, palette } from './theme.ts';
import type { ViewRange } from './camera.ts';
import { roundRect } from './sprites.ts';
import { TRAIL_MIN_VISITS } from './trail.ts';

const MIN_STROKE_PX = 1.5;

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

export const BRACKET_TIGHTEN_PX = 30;
export const BRACKET_CLOSED_PX = 15;

export function bracketCloseness(tilePx: number, dpr = 1): number {
  const css = tilePx / dpr;
  if (css >= BRACKET_TIGHTEN_PX) return 0;
  if (css <= BRACKET_CLOSED_PX) return 1;
  return (BRACKET_TIGHTEN_PX - css) / (BRACKET_TIGHTEN_PX - BRACKET_CLOSED_PX);
}

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
  const i = tilePx * (inset - inset * 0.45 * close);
  const reach = tilePx * 0.5 - i;
  const len = tilePx * 0.26 + (reach - tilePx * 0.26) * close;
  ctx.save();
  ctx.strokeStyle = alpha(color, strength);
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

export function drawGoals(
  ctx: CanvasRenderingContext2D,
  cells: readonly Vec[],
  tilePx: number,
  time: number,
  met: boolean,
  completion = 0,
  dpr = 1,
): void {
  if (cells.length === 0) return;
  const pulse = 0.55 + 0.45 * Math.sin((time * (Math.PI * 2)) / 0.8);
  const color = met ? palette.ok : overlay.goal;
  const lift = completion * completion;
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

export function drawHover(ctx: CanvasRenderingContext2D, cell: Vec, tilePx: number, dpr = 1): void {
  ctx.save();
  ctx.fillStyle = alpha(overlay.hover, 0.07);
  ctx.fillRect(cell.x * tilePx, cell.y * tilePx, tilePx, tilePx);
  ctx.restore();
  drawBrackets(ctx, cell.x, cell.y, tilePx, overlay.hover, 0.85, 0.06, dpr);
}

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

const SPOIL_LAP_TICKS = 12;

const SPOIL_MAX_LAPS = 2;

export function ripeFor(tile: Tile, t: number): number {
  const plantedAt = tile.meta?.['plantedAt'];
  const max = tile.maxGrowth ?? 0;
  if (typeof plantedAt !== 'number' || max <= 0) return 0;
  return Math.max(0, Math.floor(t) - (plantedAt + max));
}

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
  ctx.strokeStyle = alpha(palette.bgVoid, 0.85);
  for (let lap = 1; lap <= laps; lap++) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * (1 - lap * 0.3), 0, Math.PI * 2);
    ctx.stroke();
  }
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

export function bandCursor(tile: Tile): number {
  const next = tile.meta?.['rxNext'];
  return typeof next === 'number' ? next : 0;
}

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
  'bound',
  'sent',
];

export function badgeVarKey(machine: Machine): string {
  for (let i = 0; i < BADGE_VARS.length; i++) {
    const key = BADGE_VARS[i] as string;
    if (typeof machine.vars[key] === 'number') return key;
  }
  return '';
}

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

const TETHER_SOLID: number[] = [];
const TETHER_DASH: number[] = [0, 0];

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

export interface TileReadout {
  at: Vec;
  terrain: Terrain;
  walkable: boolean;
  growth: number | null;
  maxGrowth: number | null;
  sproutsIn: number;
  ripeFor: number;
  crop: ItemKind | null;
  items: { kind: ItemKind; count: number }[];
  botId: number | null;
  botName: string | null;
  machine: { id: string; kind: string; state: string } | null;
  buffer: { unread: number; total: number; sent: number } | null;
  mark: string | null;
  visits: number;
  label: string;
}

function machineAtCell(world: World, x: number, y: number): Machine | undefined {
  return world.machines.find((m) => m.at.x === x && m.at.y === y);
}

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
    parts.push(
      sprouting > 0 ? `crop sprouts in ${sprouting}t` : `crop ${growth}/${tile.maxGrowth ?? 0}`,
    );
  }
  if (overripe > 0) parts.push(`ripe ${overripe}t`);
  if (bot) parts.push(bot.name);
  if (machine) parts.push(machine.id, `${machine.kind}:${machine.state}`);
  if (machine) {
    const cycle = machine.cycle;
    const step = cycle && cycle.length > 2 ? cycle.indexOf(machine.state) : -1;
    if (step >= 0 && cycle) parts.push(`stage ${step}/${cycle.length - 1}`);
    const badged = badgeVarKey(machine);
    if (badged !== '') parts.push(`${badged} ${String(machine.vars[badged])}`);
    if (machine.vars[MANUAL_ONLY] === 1) parts.push('manual');
    for (const varKey in machine.vars) {
      if (varKey.startsWith(FED_BY)) parts.push(`fed by ${varKey.slice(FED_BY.length)}`);
      else if (varKey !== badged && varKey !== MANUAL_ONLY) {
        parts.push(`${varKey} ${String(machine.vars[varKey])}`);
      }
    }
  }
  if (buffer) {
    parts.push(`buffer ${buffer.unread}/${buffer.total}`);
    if (buffer.sent > 0) parts.push(`sent ${buffer.sent}`);
  }
  for (const item of items) parts.push(`${item.kind} x${item.count}`);
  if (tile.mark) parts.push(`mark "${tile.mark}"`);
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
