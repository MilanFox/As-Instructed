import { alpha, palette } from './theme.ts';

const MIN_STROKE_PX = 1.5;

export function drawInspected(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  tilePx: number,
  dpr = 1,
): void {
  const width = Math.max(MIN_STROKE_PX * 1.5 * dpr, tilePx * 0.06);
  const px = x * tilePx + width / 2;
  const py = y * tilePx + width / 2;
  const side = tilePx - width;
  ctx.save();
  ctx.lineJoin = 'miter';
  ctx.lineWidth = width + 2 * dpr;
  ctx.strokeStyle = alpha('#000000', 0.55);
  ctx.strokeRect(px, py, side, side);
  ctx.lineWidth = width;
  ctx.strokeStyle = palette.accent;
  ctx.strokeRect(px, py, side, side);
  ctx.fillStyle = alpha(palette.accent, 0.1);
  ctx.fillRect(px, py, side, side);
  ctx.restore();
}
