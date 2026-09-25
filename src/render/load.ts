import { cabledTo, machineById, treeSegments } from '../engine/index.ts';
import type { World } from '../engine/index.ts';
import { alpha, palette } from './theme.ts';
import { roundRect } from './sprites.ts';

const DRAW = 'draw';
const RESERVE = 'reserve';

export function drawLoadTree(
  ctx: CanvasRenderingContext2D,
  world: World,
  tilePx: number,
  dpr = 1,
): void {
  const segments = treeSegments(world);
  if (segments.length === 0) return;
  const centre = (v: number): number => (v + 0.5) * tilePx;

  ctx.save();
  ctx.lineCap = 'round';
  const cables = cabledTo(world);
  ctx.strokeStyle = alpha(palette.ink, 0.7);
  ctx.lineWidth = Math.max(1, tilePx * 0.04, dpr);
  ctx.beginPath();
  for (const consumer of world.machines) {
    if (typeof consumer.vars[DRAW] !== 'number') continue;
    for (const id of cables.get(consumer.id) ?? []) {
      const end = machineById(world, id);
      if (!end) continue;
      ctx.moveTo(centre(consumer.at.x), centre(consumer.at.y));
      ctx.lineTo(centre(end.at.x), centre(end.at.y));
    }
  }
  ctx.stroke();

  for (const tap of world.machines) {
    if (typeof tap.vars[RESERVE] !== 'number') continue;
    const inset = tilePx * 0.06;
    const size = tilePx - inset * 2;
    roundRect(ctx, tap.at.x * tilePx + inset, tap.at.y * tilePx + inset, size, size, tilePx * 0.1);
    ctx.fillStyle = alpha(palette.gold, 0.14);
    ctx.fill();
    ctx.strokeStyle = alpha(palette.gold, 0.4);
    ctx.lineWidth = Math.max(1, dpr);
    ctx.stroke();
  }

  for (const segment of segments) {
    const child = machineById(world, segment.id);
    const parent = machineById(world, segment.parent);
    if (!child || !parent) continue;
    const over = segment.load > segment.ceiling;
    const ax = centre(parent.at.x);
    const ay = centre(parent.at.y);
    const bx = centre(child.at.x);
    const by = centre(child.at.y);

    ctx.strokeStyle = alpha(over ? palette.danger : palette.inkDim, over ? 0.9 : 0.35);
    ctx.lineWidth = Math.max(2, tilePx * (over ? 0.2 : 0.14));
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();

    const fill = segment.ceiling > 0 ? Math.min(1, segment.load / segment.ceiling) : 1;
    if (!over && fill > 0) {
      ctx.strokeStyle = fill >= 1 ? palette.accent2 : palette.accent;
      ctx.lineWidth = Math.max(1, tilePx * 0.08);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + (bx - ax) * fill, ay + (by - ay) * fill);
      ctx.stroke();
    }

    if (tilePx < 18 * dpr) continue;
    const label = `${String(segment.load)}/${String(segment.ceiling)}`;
    ctx.font = `600 ${String(Math.round(tilePx * 0.22))}px 'JetBrains Mono', ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(label).width + tilePx * 0.16;
    const h = tilePx * 0.3;
    const cx = (ax + bx) / 2;
    const cy = (ay + by) / 2;
    ctx.fillStyle = over ? palette.danger : alpha(palette.bgVoid, 0.88);
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, tilePx * 0.06);
    ctx.fill();
    ctx.strokeStyle = over ? palette.danger : alpha(palette.inkDim, 0.85);
    ctx.lineWidth = Math.max(1, dpr);
    ctx.stroke();
    ctx.fillStyle = over ? palette.bgVoid : palette.ink;
    ctx.fillText(label, cx, cy);
  }
  ctx.restore();
}
