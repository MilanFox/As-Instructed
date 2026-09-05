/**
 * Bots, machines and items, drawn in code.
 *
 * DESIGN.md §2 and §8: units and FX are Canvas2D paths, not sprites, and they must animate —
 * interpolated movement, a squash on stop, a bobbing antenna, a directional headlight cone,
 * tread marks, a sparkle when acting. That list is the difference between a demo and a product,
 * so all of it is here rather than approximated.
 *
 * Everything draws in *world space*: the caller has already applied `translate(originX, originY)`
 * and passes `tilePx`, so a bot at tile (3, 4) draws around `(3.5 * tilePx, 4.5 * tilePx)`.
 *
 * Gradients are cached per zoom level. A `createRadialGradient` per bot per frame is the single
 * easiest way to put allocation back into the RAF loop, and gradient coordinates resolve against
 * the transform in force at *fill* time, so a locally-defined gradient is safe to reuse.
 */

import type { Dir } from '../engine/index.ts';
import type { BotPose, BotSegment, BotTimeline } from './timeline.ts';
import { TREAD_FADE_TICKS } from './timeline.ts';
import { alpha, bot as botTheme, palette } from './theme.ts';
import type { TileSet } from './tiles.ts';
import { TILE_PX } from './tiles.ts';

/** Reference geometry is authored against the 48 px tile and scaled from there. */
const REF = TILE_PX;

const FACING_ANGLE = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];

export function facingAngle(dir: Dir): number {
  return FACING_ANGLE[dir] ?? 0;
}

/**
 * `String(n)` inside a draw path allocates once per label per frame. Bot ids and stack counts are
 * both small integers, so they come out of a table instead.
 */
const SMALL_NUMBERS: readonly string[] = Array.from({ length: 128 }, (_, i) => String(i));

function numberLabel(value: number): string {
  const n = value | 0;
  return (n >= 0 && n < SMALL_NUMBERS.length ? SMALL_NUMBERS[n] : String(n)) as string;
}

class GradientCache {
  private tilePx = -1;
  private cone: CanvasGradient | null = null;
  private shadow: CanvasGradient | null = null;
  private readonly glows = new Map<string, CanvasGradient>();

  invalidate(tilePx: number): void {
    if (tilePx === this.tilePx) return;
    this.tilePx = tilePx;
    this.cone = null;
    this.shadow = null;
    this.glows.clear();
  }

  coneFor(ctx: CanvasRenderingContext2D, radius: number): CanvasGradient {
    if (!this.cone) {
      const g = ctx.createRadialGradient(0, 0, radius * 0.12, 0, 0, radius);
      g.addColorStop(0, 'rgba(255, 246, 214, 0.30)');
      g.addColorStop(0.45, 'rgba(255, 236, 180, 0.13)');
      g.addColorStop(1, 'rgba(255, 230, 160, 0)');
      this.cone = g;
    }
    return this.cone;
  }

  shadowFor(ctx: CanvasRenderingContext2D, radius: number): CanvasGradient {
    if (!this.shadow) {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      g.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
      g.addColorStop(0.6, 'rgba(0, 0, 0, 0.22)');
      g.addColorStop(1, 'rgba(0, 0, 0, 0)');
      this.shadow = g;
    }
    return this.shadow;
  }

  glowFor(ctx: CanvasRenderingContext2D, color: string, radius: number): CanvasGradient {
    let g = this.glows.get(color);
    if (!g) {
      g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      g.addColorStop(0, alpha(color, 0.42));
      g.addColorStop(0.55, alpha(color, 0.14));
      g.addColorStop(1, alpha(color, 0));
      this.glows.set(color, g);
    }
    return g;
  }
}

const gradients = new GradientCache();

export interface BotDrawOptions {
  accent: string;
  /** Seconds since the renderer started. Drives the idle bob and the light flicker. */
  time: number;
  /** Highlight the bot the UI considers selected. */
  active: boolean;
  /** Items in the bot's inventory; drives the little cargo pip. */
  carrying: number;
  /** 0..1, drawn as a gauge ring only when the level uses fuel. */
  fuel: number;
  showFuel: boolean;
  /** Draw the bot id when there is room for it. */
  showLabel: boolean;
  /**
   * 0..1 by playback speed. Adds the speed lines that make a 200-tick solution at 8x read as
   * *fast* rather than as *jerky*. Zero at ordinary speeds and under reduced motion.
   */
  rush: number;
  /** Honour `prefers-reduced-motion`: no smear, no sway, no shimmy. Every tell stays. */
  reduced: boolean;
  /** Device pixel ratio. Every "is there room for this" threshold below is in *screen* pixels. */
  dpr: number;
}

/**
 * The smear behind a bot in transit, plus the speed lines at high playback rates.
 *
 * Drawn in the bot's local frame (+X is the way it faces) and stretched backwards, so it costs
 * one rounded rect and three line segments and reads as momentum rather than as a ghost.
 */
function drawSmear(
  ctx: CanvasRenderingContext2D,
  tilePx: number,
  accent: string,
  glide: number,
  rush: number,
): void {
  const back = (0.3 + rush * 0.85) * glide * tilePx;
  if (back < 1) return;
  ctx.fillStyle = alpha(accent, 0.09 * glide);
  roundRect(ctx, -back - tilePx * 0.3, -tilePx * 0.24, back + tilePx * 0.34, tilePx * 0.48, tilePx * 0.2);
  ctx.fill();
  if (rush <= 0.02) return;
  ctx.strokeStyle = alpha(accent, 0.2 * rush * glide);
  ctx.lineWidth = Math.max(1, tilePx * 0.035);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = -1; i <= 1; i++) {
    const y = i * tilePx * 0.2;
    const length = back * (1.35 - Math.abs(i) * 0.3);
    ctx.moveTo(-tilePx * 0.3 - length, y);
    ctx.lineTo(-tilePx * 0.34, y);
  }
  ctx.stroke();
}

/**
 * Tread marks, drawn in code.
 *
 * ASSETS.md §4.6 warns that `overlay.tracks*` is near-invisible on `floor.metal`, which is
 * exactly World 1's floor, so the marks are painted rather than blitted: two dark strokes per
 * traversed cell, fading over `TREAD_FADE_TICKS`. Walks the segment list backwards from the
 * current tick and allocates nothing.
 */
export function drawTreads(
  ctx: CanvasRenderingContext2D,
  timeline: BotTimeline,
  t: number,
  tilePx: number,
  accent: string,
): void {
  const segments = timeline.segments;
  let i = timeline.indexAt(t);
  if (i < 0) return;
  const s = tilePx / REF;
  const halfGauge = 8.5 * s;
  const length = 14 * s;

  ctx.save();
  ctx.lineCap = 'butt';
  const dash = Math.max(1.5, 4 * s);
  ctx.setLineDash([dash, dash * 0.5]);
  ctx.lineWidth = Math.max(1, 3.4 * s);
  for (; i >= 0; i--) {
    const seg = segments[i] as BotSegment;
    if (seg.kind !== 'move' || !seg.ok) continue;
    const age = t - seg.t1;
    if (age > TREAD_FADE_TICKS) break;
    const fade = Math.max(0, 1 - Math.max(0, age) / TREAD_FADE_TICKS);
    if (fade <= 0.02) continue;
    const cx = (seg.fromX + 0.5 + (seg.toX - seg.fromX) * 0.5) * tilePx;
    const cy = (seg.fromY + 0.5 + (seg.toY - seg.fromY) * 0.5) * tilePx;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(facingAngle(seg.facing));
    ctx.strokeStyle = alpha(botTheme.tread, 0.34 * fade);
    ctx.beginPath();
    ctx.moveTo(-length, -halfGauge);
    ctx.lineTo(length, -halfGauge);
    ctx.moveTo(-length, halfGauge);
    ctx.lineTo(length, halfGauge);
    ctx.stroke();
    if (fade > 0.75) {
      ctx.strokeStyle = alpha(accent, 0.07 * fade);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

/** The headlight cone. Drawn under the bots so overlapping bots do not wash each other out. */
export function drawHeadlight(
  ctx: CanvasRenderingContext2D,
  pose: BotPose,
  tilePx: number,
  dpr = 1,
): void {
  if (!pose.alive || tilePx < BOT_DETAIL_TILE_PX * dpr) return;
  const s = tilePx / REF;
  const cx = (pose.x + 0.5) * tilePx;
  const cy = (pose.y + 0.5) * tilePx;
  const radius = 46 * s;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(facingAngle(pose.facing));
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = gradients.coneFor(ctx, radius);
  ctx.beginPath();
  ctx.moveTo(12 * s, 0);
  ctx.arc(0, 0, radius, -0.46, 0.46);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * One bot. Local geometry faces +X and is rotated into place, so "squash along the direction of
 * travel" is just a non-uniform scale on the local X axis.
 */
/**
 * Below this many *screen* pixels per tile the detailed chassis collapses into mush — 1.8 px
 * strokes become 0.6 px and the whole bot reads as a grey smudge. World 7 spends most of its time
 * here, so there is a dedicated low-zoom form instead.
 *
 * Screen, not device: on a retina display a 22-device-pixel tile is 11 px of actual screen, and
 * comparing against the device number keeps the detailed chassis switched on for the entire range
 * where it is unreadable — which is most of where the game is played.
 */
export const BOT_DETAIL_TILE_PX = 22;

/**
 * The far-zoom bot: a solid accent chip with a dark rim and a nose that points the way it faces.
 * Loses every detail and keeps the two things that matter at this size — *where* and *which one*.
 */
function drawBotChip(
  ctx: CanvasRenderingContext2D,
  pose: BotPose,
  tilePx: number,
  options: BotDrawOptions,
): void {
  const cx = (pose.x + 0.5) * tilePx;
  const cy = (pose.y + 0.5) * tilePx;
  const r = tilePx * 0.34;
  const dead = !pose.alive;
  const glide = pose.travel > 0 && pose.travel < 1 ? Math.sin(Math.PI * pose.travel) : 0;
  const shimmy = options.reduced ? 0 : Math.sin(pose.recoil * 30) * pose.recoil * 0.09;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.5, r, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.rotate(facingAngle(pose.facing) + shimmy);
  if (glide > 0.02 && !dead && !options.reduced) {
    drawSmear(ctx, tilePx, options.accent, glide, options.rush);
  }
  const stretch = 1 + pose.stretch;
  ctx.scale(stretch, 1 / stretch);

  ctx.fillStyle = dead ? '#39434f' : botTheme.hullDark;
  roundRect(ctx, -r, -r * 0.86, r * 2, r * 1.72, r * 0.35);
  ctx.fill();
  ctx.fillStyle = dead ? '#4a5563' : options.accent;
  roundRect(ctx, -r * 0.72, -r * 0.6, r * 1.44, r * 1.2, r * 0.28);
  ctx.fill();

  if (!dead) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(r * 0.98, 0);
    ctx.lineTo(r * 0.35, -r * 0.5);
    ctx.lineTo(r * 0.35, r * 0.5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  if (pose.blocked > 0.02) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = alpha(palette.danger, pose.blocked);
    ctx.lineWidth = Math.max(1.5, tilePx * 0.09);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (pose.idle > 0 && pose.alive) {
    ctx.save();
    ctx.fillStyle = alpha(options.accent, 0.35 + 0.4 * Math.abs(Math.sin(options.time * 2)));
    ctx.beginPath();
    ctx.arc(cx, cy - r * 1.7, Math.max(1, tilePx * 0.07), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export function drawBot(
  ctx: CanvasRenderingContext2D,
  pose: BotPose,
  tilePx: number,
  options: BotDrawOptions,
): void {
  gradients.invalidate(tilePx);
  if (tilePx < BOT_DETAIL_TILE_PX * options.dpr) {
    drawBotChip(ctx, pose, tilePx, options);
    return;
  }
  const s = tilePx / REF;
  const cx = (pose.x + 0.5) * tilePx;
  const cy = (pose.y + 0.5) * tilePx;
  const accent = options.accent;
  const dead = !pose.alive;
  const reduced = options.reduced;

  /** Peaks in the middle of a move and is zero at rest. Everything about momentum reads off it. */
  const glide = pose.travel > 0 && pose.travel < 1 ? Math.sin(Math.PI * pose.travel) : 0;
  /**
   * Cargo is heavy and the suspension is not good. Four items is as bad as it gets, because a
   * sorting-yard bot carrying twenty of something should still be legible.
   */
  const load = Math.min(1, options.carrying / 4);
  const wobble = reduced ? 0 : Math.sin(options.time * 6.5 + pose.id * 2.1) * load * (0.35 + glide);
  /** The bot shaking off a wall it just drove into. Comic, and gone in under a tick. */
  const shimmy = reduced ? 0 : Math.sin(pose.recoil * 30) * pose.recoil * 0.09;

  ctx.save();
  ctx.translate(cx, cy);

  // Ground shadow, drawn before the rotation so it stays axis-aligned.
  ctx.save();
  ctx.translate(0, 5 * s);
  ctx.scale(1, 0.42);
  ctx.fillStyle = gradients.shadowFor(ctx, 20 * s);
  ctx.beginPath();
  ctx.arc(0, 0, 20 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (!dead && options.active) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = gradients.glowFor(ctx, accent, 30 * s);
    ctx.beginPath();
    ctx.arc(0, 0, 30 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.rotate(facingAngle(pose.facing) + shimmy + wobble * 0.05);
  if (dead) ctx.rotate(0.35);

  if (glide > 0.02 && !dead && !reduced) drawSmear(ctx, tilePx, accent, glide, options.rush);

  const stretch = 1 + pose.stretch;
  ctx.scale(stretch, 1 / stretch);
  ctx.scale(s, s);

  const hull = dead ? '#242b34' : botTheme.hull;
  const hullLight = dead ? '#2e3742' : botTheme.hullLight;

  // Treads. Deliberately darker than anything the tile art can produce, so the silhouette holds
  // on `floor.metal` (which ASSETS.md §8 warns is `#4a4a4a` with zero variance) and on ice alike.
  ctx.fillStyle = dead ? '#1a2029' : botTheme.tread;
  roundRect(ctx, -18, -17, 36, 7, 2.5);
  ctx.fill();
  roundRect(ctx, -18, 10, 36, 7, 2.5);
  ctx.fill();
  ctx.fillStyle = dead ? '#333c47' : '#42566c';
  const phase = (pose.travel * 6 + options.time * 3) % 1;
  for (let i = -2; i <= 2; i++) {
    const x = i * 7 + phase * 7 - 3.5;
    ctx.fillRect(x, -16, 2.4, 5);
    ctx.fillRect(x, 11, 2.4, 5);
  }

  // Chassis. The bright rim is what actually separates the bot from the floor at low zoom.
  ctx.fillStyle = hull;
  roundRect(ctx, -16, -13, 33, 26, 5);
  ctx.fill();
  ctx.strokeStyle = dead ? '#404b58' : botTheme.rim;
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Top plate.
  ctx.fillStyle = hullLight;
  roundRect(ctx, -11, -9, 21, 18, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Accent trim: a forward chevron plus two shoulder lamps. Kept small and shaped rather than a
  // slab of colour — the accent is an identifier (DESIGN.md §11 A5), not the paint job.
  ctx.globalAlpha = dead ? 0.3 : 1;
  ctx.fillStyle = dead ? '#4a5765' : accent;
  ctx.beginPath();
  ctx.moveTo(-1, -7.5);
  ctx.lineTo(6, 0);
  ctx.lineTo(-1, 7.5);
  ctx.lineTo(-4.5, 7.5);
  ctx.lineTo(2.5, 0);
  ctx.lineTo(-4.5, -7.5);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = dead ? 0.2 : 0.8;
  ctx.fillRect(-14, -11.5, 5, 2.5);
  ctx.fillRect(-14, 9, 5, 2.5);
  ctx.globalAlpha = 1;

  // Sensor dome.
  ctx.fillStyle = '#1c242e';
  ctx.beginPath();
  ctx.arc(12, 0, 5.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = dead ? '#3d4753' : botTheme.rim;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = botTheme.glass;
  ctx.beginPath();
  ctx.arc(12, 0, 4, 0, Math.PI * 2);
  ctx.fill();
  if (!dead) {
    const pulse = 0.55 + 0.45 * Math.sin(options.time * 4 + pose.id);
    ctx.fillStyle = alpha(accent, 0.55 + 0.45 * pulse);
    ctx.beginPath();
    ctx.arc(12, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.beginPath();
    ctx.arc(10.7, -1.3, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Antenna: a short mast off the back that bobs, whipping harder while the bot is moving.
  if (!dead) {
    // The mast lags whatever the chassis is doing: it hangs forward through the wind-up, whips
    // back on the launch, and rattles for a moment after a bump.
    const bob =
      Math.sin(options.time * 3.4 + pose.id * 1.7) * 2.2 +
      pose.travel * -3.4 +
      pose.anticipate * 3.4 +
      (reduced ? 0 : Math.sin(pose.recoil * 44) * pose.recoil * 5) -
      wobble * 1.6;
    ctx.strokeStyle = botTheme.rim;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-11, -4);
    ctx.quadraticCurveTo(-16, -10, -17 + bob * 0.4, -16 + bob);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(-17 + bob * 0.4, -16 + bob, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cargo pip. It is not bolted down, and a loaded bot in transit says so.
  if (options.carrying > 0 && !dead) {
    ctx.save();
    ctx.translate(0, wobble * 2.6);
    ctx.rotate(wobble * 0.09);
    ctx.fillStyle = palette.bgVoid;
    roundRect(ctx, -6, -6, 12, 12, 2);
    ctx.fill();
    ctx.strokeStyle = alpha(palette.accent2, 0.9);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = palette.accent2;
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }

  // Action tell: the manipulator arm extends toward the target cell while acting.
  if (pose.action > 0 && !dead) {
    const reach = Math.sin(Math.PI * pose.action) * 9;
    ctx.strokeStyle = alpha(accent, 0.85);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(13 + reach, 0);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(13 + reach, 0, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Blocked tell, drawn unrotated so it reads the same whichever way the bot faces.
  if (pose.blocked > 0.02 || pose.recoil > 0.04) {
    // The id badge lives directly above the chassis in multi-bot levels, so the bang has to clear
    // it or the two stack into an unreadable smudge exactly when legibility matters most.
    drawBlockedTell(ctx, pose, tilePx, cx, cy, reduced, options.showLabel ? 15 : 0);
  }

  // Idle tell. `sync` emits one event per bot that actually idled, so a bot parked at a barrier
  // has a real span to animate over and reads as waiting rather than as a dropped frame.
  if (pose.idle > 0 && pose.alive) {
    drawIdleTell(ctx, cx, cy, tilePx, options.time, accent);
  }

  // Failed non-move action (a `send` to a dead bot, an empty `harvest`). Same language as a
  // blocked move, one notch quieter.
  if (pose.failed && pose.blocked <= 0.02 && pose.alive) {
    drawFailTell(ctx, cx, cy, tilePx, Math.sin(Math.PI * Math.max(pose.action, 0.001)));
  }

  if (options.showFuel && pose.alive) {
    drawFuelRing(ctx, cx, cy, tilePx, options.fuel);
  }

  if (options.showLabel && tilePx >= 28 * options.dpr) {
    ctx.save();
    ctx.font = `600 ${Math.round(tilePx * 0.21)}px 'JetBrains Mono', ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = numberLabel(pose.id);
    const ly = cy - tilePx * 0.42;
    ctx.fillStyle = alpha(palette.bgVoid, 0.75);
    const w = ctx.measureText(label).width + tilePx * 0.14;
    roundRect(ctx, cx - w / 2, ly - tilePx * 0.11, w, tilePx * 0.22, tilePx * 0.06);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.fillText(label, cx, ly + tilePx * 0.005);
    ctx.restore();
  }
}

/**
 * DESIGN.md §11 A5: "a blocked move must look obviously different from a successful one".
 * A recoil alone is too subtle at low zoom, so it is backed by a red rim, an impact chevron on
 * the face the bot hit, and a hard `!` above the chassis.
 */
function drawBlockedTell(
  ctx: CanvasRenderingContext2D,
  pose: BotPose,
  tilePx: number,
  cx: number,
  cy: number,
  reduced: boolean,
  lift: number,
): void {
  const s = tilePx / REF;
  const k = pose.blocked;
  ctx.save();
  ctx.translate(cx, cy);

  if (k > 0.02) {
    ctx.save();
    ctx.rotate(facingAngle(pose.facing));
    ctx.strokeStyle = alpha(palette.danger, 0.95 * k);
    ctx.lineWidth = Math.max(1.5, 3 * s);
    ctx.lineCap = 'round';
    for (let i = 0; i < 2; i++) {
      const r = (20 + i * 6) * s;
      ctx.beginPath();
      ctx.arc(0, 0, r, -0.7, 0.7);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = alpha(palette.danger, 0.75 * k);
    ctx.lineWidth = Math.max(1.5, 2.5 * s);
    ctx.beginPath();
    ctx.arc(0, 0, 19 * s, 0, Math.PI * 2);
    ctx.stroke();
  }

  // The bang outlasts the impact by a beat and hops while the bot collects itself. A wall is
  // funnier than an error dialog, and this is the part that makes it one.
  const bang = Math.max(k, pose.recoil * 0.85);
  const hop = reduced ? 0 : Math.abs(Math.sin(pose.recoil * 9)) * pose.recoil * 4 * s;
  const by = (-30 - lift) * s - bang * 3 * s - hop;
  ctx.fillStyle = alpha(palette.danger, bang);
  roundRect(ctx, -2 * s, by, 4 * s, 10 * s, 1.5 * s);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, by + 14 * s, 2.2 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Three ticking dots over a waiting bot, on a slow cycle so a whole row of them is not a strobe. */
function drawIdleTell(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  tilePx: number,
  time: number,
  accent: string,
): void {
  const s = tilePx / REF;
  const r = 1.9 * s;
  const gap = 6 * s;
  const y = cy - 26 * s;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const phase = (time * 1.6 - i * 0.22) % 1;
    const lit = phase > 0 && phase < 0.5 ? 1 : 0.22;
    ctx.fillStyle = alpha(accent, 0.35 + lit * 0.6);
    ctx.beginPath();
    ctx.arc(cx + (i - 1) * gap, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFailTell(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  tilePx: number,
  strength: number,
): void {
  const s = tilePx / REF;
  const r = 6 * s;
  const y = cy - 26 * s;
  ctx.save();
  ctx.strokeStyle = alpha(palette.danger, 0.9 * Math.max(0, Math.min(1, strength)));
  ctx.lineWidth = Math.max(1.5, 2.4 * s);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r, y - r);
  ctx.lineTo(cx + r, y + r);
  ctx.moveTo(cx + r, y - r);
  ctx.lineTo(cx - r, y + r);
  ctx.stroke();
  ctx.restore();
}

function drawFuelRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  tilePx: number,
  fuel: number,
): void {
  const r = tilePx * 0.44;
  const level = Math.max(0, Math.min(1, fuel));
  const span = Math.PI * 1.1;
  const from = Math.PI / 2 - span / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineWidth = Math.max(1.5, tilePx * 0.045);
  ctx.lineCap = 'round';
  ctx.strokeStyle = alpha(palette.bgVoid, 0.55);
  ctx.beginPath();
  ctx.arc(0, 0, r, from, from + span);
  ctx.stroke();
  ctx.strokeStyle = level > 0.3 ? alpha(palette.ok, 0.9) : palette.danger;
  ctx.beginPath();
  ctx.arc(0, 0, r, from, from + span * level);
  ctx.stroke();
  ctx.restore();
}

/** A ground item stack: the sprite plus a count badge once there is more than one. */
export function drawGroundStack(
  ctx: CanvasRenderingContext2D,
  tiles: TileSet,
  name: string,
  x: number,
  y: number,
  count: number,
  tilePx: number,
  time: number,
  dpr = 1,
): void {
  const px = x * tilePx;
  const py = y * tilePx;
  const bob = Math.sin(time * 2 + (x * 3 + y * 5)) * tilePx * 0.02;

  ctx.save();
  ctx.translate(0, bob);
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = botTheme.shadow;
  ctx.beginPath();
  ctx.ellipse(px + tilePx / 2, py + tilePx * 0.74, tilePx * 0.24, tilePx * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  tiles.draw(ctx, name, px, py, tilePx);
  ctx.restore();

  if (count > 1 && tilePx >= 24 * dpr) {
    const r = tilePx * 0.17;
    const bx = px + tilePx * 0.76;
    const by = py + tilePx * 0.76;
    ctx.save();
    ctx.fillStyle = palette.bgVoid;
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = alpha(palette.accent2, 0.85);
    ctx.lineWidth = dpr;
    ctx.stroke();
    ctx.fillStyle = palette.accent2;
    ctx.font = `600 ${Math.round(tilePx * 0.24)}px 'JetBrains Mono', ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(numberLabel(Math.min(99, count)), bx, by + tilePx * 0.01);
    ctx.restore();
  }
}

/**
 * The far-zoom machine, mirroring `drawBotChip`.
 *
 * At this size the sprite is a smudge of the same value as the floor, the soft ground shadow only
 * muddies it further, and the powered glow is a blob wider than the tile. So: a dark plate to lift
 * the machine off the ground plane, the sprite on top of it, and — if it is running — one hard
 * amber pip with a floor in screen pixels. Landmark, state, no bloom.
 */
function drawMachineChip(
  ctx: CanvasRenderingContext2D,
  tiles: TileSet,
  name: string,
  px: number,
  py: number,
  tilePx: number,
  powered: boolean,
  time: number,
  dpr: number,
): void {
  const inset = tilePx * 0.08;
  ctx.save();
  ctx.fillStyle = alpha(palette.bgVoid, 0.5);
  roundRect(ctx, px + inset, py + inset, tilePx - inset * 2, tilePx - inset * 2, tilePx * 0.18);
  ctx.fill();
  ctx.strokeStyle = alpha(palette.inkDim, 0.45);
  ctx.lineWidth = Math.max(dpr, tilePx * 0.03);
  ctx.stroke();
  tiles.draw(ctx, name, px, py, tilePx);
  if (powered) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.6 + px + py);
    ctx.fillStyle = alpha(palette.accent2, 0.55 + pulse * 0.45);
    ctx.beginPath();
    ctx.arc(px + tilePx * 0.78, py + tilePx * 0.22, Math.max(1.5 * dpr, tilePx * 0.1), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * A machine. ASSETS.md §8: the Kenney structure sprites are 3/4 view, so they anchor
 * bottom-centre and are allowed to overhang the cell upward.
 */
export function drawMachine(
  ctx: CanvasRenderingContext2D,
  tiles: TileSet,
  name: string,
  x: number,
  y: number,
  tilePx: number,
  powered: boolean,
  time: number,
  dpr = 1,
): void {
  const px = x * tilePx;
  const py = y * tilePx;
  if (tilePx < BOT_DETAIL_TILE_PX * dpr) {
    drawMachineChip(ctx, tiles, name, px, py, tilePx, powered, time, dpr);
    return;
  }
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.fillStyle = botTheme.shadow;
  ctx.beginPath();
  ctx.ellipse(px + tilePx / 2, py + tilePx * 0.8, tilePx * 0.32, tilePx * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  tiles.draw(ctx, name, px, py - tilePx * 0.12, tilePx);
  if (powered) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.6 + x + y);
    ctx.globalCompositeOperation = 'lighter';
    ctx.save();
    ctx.translate(px + tilePx / 2, py + tilePx * 0.4);
    gradients.invalidate(tilePx);
    ctx.fillStyle = gradients.glowFor(ctx, palette.accent2, tilePx * 0.55);
    ctx.globalAlpha = 0.35 + pulse * 0.35;
    ctx.beginPath();
    ctx.arc(0, 0, tilePx * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

/** Rounded rect that does not depend on `CanvasRenderingContext2D.roundRect` support. */
export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
