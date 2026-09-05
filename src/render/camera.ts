/**
 * Fit-to-grid camera with smooth pan, zoom and follow.
 *
 * Pure maths — no canvas, no DOM — so every branch here is unit-testable, which matters because
 * "the grid is slightly off-screen" is the kind of bug that only shows up on one grid size.
 *
 * The zoom ladder is expressed in *device* pixels per tile, not as a float scale factor. Snapping
 * there is what keeps the game crisp: at dpr 2 a 96 px device tile is exactly 2:1 against the
 * 48 px atlas, and every other rung is an integer tile size, so the cached terrain layer is never
 * resampled onto fractional pixel boundaries.
 */

import { TILE_PX } from './tiles.ts';

/**
 * Device pixels per tile. Every rung is a whole number, so tile edges always land on pixel edges.
 *
 * Above the atlas's native 48 px every rung is an exact *multiple* of 48. Below it, any value is
 * fine: the terrain cache is built at that size by a smooth downscale and then blitted 1:1. Above
 * it the blit is a nearest-neighbour upscale, and a non-integer ratio there gives uneven pixel
 * sizes — which is precisely the "looks like a prototype" failure mode.
 */
export const ZOOM_LADDER: readonly number[] = [
  6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 96, 144, 192,
];

/** Fit never zooms past this many CSS pixels per tile; a 5x5 grid filling a 27" display is worse. */
export const MAX_FIT_CSS_TILE_PX = 96;

export function snapTilePx(raw: number): number {
  const ladder = ZOOM_LADDER;
  let best = ladder[0] as number;
  for (const rung of ladder) {
    if (rung <= raw) best = rung;
    else break;
  }
  return best;
}

export function ladderIndex(devicePx: number): number {
  const ladder = ZOOM_LADDER;
  let best = 0;
  for (let i = 0; i < ladder.length; i++) {
    if ((ladder[i] as number) <= devicePx) best = i;
  }
  return best;
}

export interface CameraBounds {
  cols: number;
  rows: number;
}

export interface ViewRange {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface CameraOptions {
  /** Fraction of the viewport left as breathing room when fitting. */
  fitPadding?: number;
  /** Exponential smoothing rate, per second. Higher snaps faster. */
  smoothing?: number;
}

/**
 * Ceiling on a camera kick, in CSS pixels.
 *
 * DESIGN.md §8 rules out screen-shake that makes text hard to read, and the player is reading
 * code four inches away from this. Three pixels, decaying in about a fifth of a second, registers
 * as a thump and is gone before the eye can call it a shake.
 */
export const MAX_KICK_PX = 3;

/**
 * How far a focus may pull the view off centre, in CSS pixels.
 *
 * Most levels fit the viewport outright, and `clampCentre` pins a fitted axis to the middle — so
 * without an explicit allowance a "lean towards the finish" is silently a no-op on exactly the
 * levels a player spends most of their time on. This is that allowance, and it is deliberately
 * smaller than the fit padding, so leaning never crops the grid.
 */
export const MAX_FOCUS_PX = 44;

export class Camera {
  /** Viewport in CSS pixels. */
  viewWidth = 1;
  viewHeight = 1;
  dpr = 1;

  cols = 1;
  rows = 1;

  /** Centre of the view, in tile units. */
  x = 0.5;
  y = 0.5;
  /** Device pixels per tile. Always a `ZOOM_LADDER` rung. */
  deviceTilePx: number = ZOOM_LADDER[13] as number;

  private targetX = 0.5;
  private targetY = 0.5;
  private targetDeviceTilePx: number = ZOOM_LADDER[13] as number;

  private followTarget: { x: number; y: number } | null = null;
  private readonly fitPadding: number;
  private readonly smoothing: number;

  /** Live kick offset in CSS pixels, decaying towards zero. Added to the origin, never eased. */
  private kickX = 0;
  private kickY = 0;
  /** Temporary point of interest and the seconds left on it. See `focus`. */
  private focusX = 0;
  private focusY = 0;
  private focusLeft = 0;
  private focusPull = 0;
  /** How far off centre the clamp is currently willing to go, in tiles. Eases in and back out. */
  private focusSlack = 0;

  constructor(options: CameraOptions = {}) {
    this.fitPadding = options.fitPadding ?? 0.06;
    this.smoothing = options.smoothing ?? 14;
  }

  /** CSS pixels per tile. Fractional when dpr is fractional; that is correct and stays crisp. */
  get tilePx(): number {
    return this.deviceTilePx / this.dpr;
  }

  /** Multiplier from atlas pixels to CSS pixels. */
  get scale(): number {
    return this.tilePx / TILE_PX;
  }

  setViewport(width: number, height: number, dpr: number): void {
    this.viewWidth = Math.max(1, width);
    this.viewHeight = Math.max(1, height);
    this.dpr = Math.max(0.5, dpr);
  }

  setBounds(bounds: CameraBounds): void {
    this.cols = Math.max(1, bounds.cols);
    this.rows = Math.max(1, bounds.rows);
  }

  /** Frames the whole grid. `immediate` skips the easing, which is what you want on level load. */
  fit(immediate = true): void {
    this.releaseFocus();
    const padded = 1 - this.fitPadding * 2;
    const rawX = (this.viewWidth * padded * this.dpr) / this.cols;
    const rawY = (this.viewHeight * padded * this.dpr) / this.rows;
    const cap = MAX_FIT_CSS_TILE_PX * this.dpr;
    let snapped = snapTilePx(Math.min(cap, Math.max(rawX < rawY ? rawX : rawY, 1)));

    // Snapping always rounds *down*, which on a coarse ladder can throw away a whole rung: a
    // 30x30 grid lands on 18 px/tile in a viewport that holds 20. Step back up while the grid
    // still fits the unpadded viewport.
    const maxW = this.viewWidth * this.dpr;
    const maxH = this.viewHeight * this.dpr;
    for (let i = ladderIndex(snapped) + 1; i < ZOOM_LADDER.length; i++) {
      const rung = ZOOM_LADDER[i] as number;
      if (rung > cap) break;
      if (rung * this.cols > maxW || rung * this.rows > maxH) break;
      snapped = rung;
    }
    this.targetDeviceTilePx = snapped;
    this.targetX = this.cols / 2;
    this.targetY = this.rows / 2;
    this.clampTarget();
    if (immediate) {
      this.deviceTilePx = this.targetDeviceTilePx;
      this.x = this.targetX;
      this.y = this.targetY;
    }
  }

  /**
   * Steps `steps` rungs up or down the zoom ladder, keeping the world point under
   * (`anchorX`, `anchorY`) — CSS pixels from the canvas top-left — pinned in place.
   */
  zoomBy(steps: number, anchorX?: number, anchorY?: number): void {
    const ladder = ZOOM_LADDER;
    const next = Math.max(
      0,
      Math.min(ladder.length - 1, ladderIndex(this.targetDeviceTilePx) + Math.round(steps)),
    );
    this.setZoom(ladder[next] as number, anchorX, anchorY);
  }

  setZoom(deviceTilePx: number, anchorX?: number, anchorY?: number): void {
    const before =
      anchorX !== undefined && anchorY !== undefined
        ? this.screenToWorld(anchorX, anchorY)
        : null;
    this.targetDeviceTilePx = snapTilePx(deviceTilePx);
    if (before) {
      // Solve for the centre that puts `before` back under the anchor at the new scale.
      const tile = this.targetDeviceTilePx / this.dpr;
      this.targetX = before.x - (anchorX! - this.viewWidth / 2) / tile;
      this.targetY = before.y - (anchorY! - this.viewHeight / 2) / tile;
    }
    this.followTarget = null;
    this.releaseFocus();
    this.clampTarget();
  }

  /** Pans by a CSS-pixel delta (drag semantics: content follows the pointer). */
  panBy(dx: number, dy: number): void {
    this.targetX -= dx / this.tilePx;
    this.targetY -= dy / this.tilePx;
    this.followTarget = null;
    this.releaseFocus();
    this.clampTarget();
  }

  setCenter(x: number, y: number, immediate = false): void {
    this.targetX = x;
    this.targetY = y;
    this.clampTarget();
    if (immediate) {
      this.x = this.targetX;
      this.y = this.targetY;
    }
  }

  /** Follow-active-bot. Pass `null` to release. The target is re-read every `update`. */
  follow(target: { x: number; y: number } | null): void {
    this.followTarget = target;
  }

  get following(): boolean {
    return this.followTarget !== null;
  }

  /**
   * A one-off nudge in a direction, in CSS pixels. Not a shake: there is no oscillation and no
   * second impulse, so it reads as the camera being shoved and recovering.
   */
  kick(dx: number, dy: number, strength = 1): void {
    const length = Math.hypot(dx, dy) || 1;
    const amount = Math.min(MAX_KICK_PX, MAX_KICK_PX * Math.max(0, strength));
    this.kickX = (dx / length) * amount;
    this.kickY = (dy / length) * amount;
  }

  /**
   * Leans the view towards a cell for a moment and then lets go — the camera taking an interest
   * without taking control. `pull` is how far it commits, 0..1; the default barely moves on a
   * grid that already fits, which is exactly right, because most of them do.
   */
  focus(x: number, y: number, seconds = 1.6, pull = 0.5): void {
    this.focusX = x;
    this.focusY = y;
    this.focusLeft = Math.max(0, seconds);
    this.focusPull = Math.max(0, Math.min(1, pull));
  }

  /** Drops a focus and any kick in flight. A celebration must never outlive being skipped. */
  releaseFocus(): void {
    this.focusLeft = 0;
    this.focusSlack = 0;
    this.kickX = 0;
    this.kickY = 0;
  }

  get focusing(): boolean {
    return this.focusLeft > 0;
  }

  update(dt: number): void {
    if (this.followTarget) {
      this.targetX = this.followTarget.x + 0.5;
      this.targetY = this.followTarget.y + 0.5;
      this.clampTarget();
    } else if (this.focusLeft > 0) {
      this.focusLeft -= dt;
      // Fades in over the first fifth and back out over the last third, so the drift has no
      // start and no stop — only the middle, where it is already moving.
      const ease = Math.min(1, this.focusLeft * 3) * this.focusPull;
      this.focusSlack = (MAX_FOCUS_PX / this.tilePx) * ease;
      this.targetX += (this.focusX + 0.5 - this.targetX) * Math.min(1, ease * dt * 2.2);
      this.targetY += (this.focusY + 0.5 - this.targetY) * Math.min(1, ease * dt * 2.2);
      this.clampTarget();
    } else if (this.focusSlack > 0) {
      // Letting go is the same clamp closing: the view is dragged back to centre by the shrinking
      // allowance rather than by a separate animation, so it cannot fight the player panning.
      this.focusSlack = Math.max(0, this.focusSlack - dt * 3);
      this.clampTarget();
    }
    const decay = Math.exp(-16 * Math.max(0, dt));
    this.kickX *= decay;
    this.kickY *= decay;
    // Snapped to zero well below the point an eye could see it, so a kick genuinely ends rather
    // than leaving the world origin a twentieth of a pixel off for the rest of the session.
    if (Math.abs(this.kickX) < 0.05) this.kickX = 0;
    if (Math.abs(this.kickY) < 0.05) this.kickY = 0;
    // Zoom is discrete, so it snaps; only the pan eases. Easing the scale as well would put the
    // cached terrain layer on a fractional scale for the whole transition and blur it.
    this.deviceTilePx = this.targetDeviceTilePx;
    const k = 1 - Math.exp(-this.smoothing * Math.max(0, dt));
    this.x += (this.targetX - this.x) * k;
    this.y += (this.targetY - this.y) * k;
    if (Math.abs(this.targetX - this.x) < 1e-4) this.x = this.targetX;
    if (Math.abs(this.targetY - this.y) < 1e-4) this.y = this.targetY;
    this.clampCurrent();
  }

  /** Drops any in-flight easing. Use after a seek, where a lerping camera reads as lag. */
  settle(): void {
    this.releaseFocus();
    this.deviceTilePx = this.targetDeviceTilePx;
    this.x = this.targetX;
    this.y = this.targetY;
  }

  /** CSS pixel position of the world origin (tile 0,0 top-left corner), kick included. */
  originX(): number {
    return this.viewWidth / 2 - this.x * this.tilePx + this.kickX;
  }

  originY(): number {
    return this.viewHeight / 2 - this.y * this.tilePx + this.kickY;
  }

  worldToScreen(tileX: number, tileY: number, out: { x: number; y: number }): void {
    out.x = this.originX() + tileX * this.tilePx;
    out.y = this.originY() + tileY * this.tilePx;
  }

  screenToWorld(cssX: number, cssY: number): { x: number; y: number } {
    const tile = this.tilePx;
    return {
      x: (cssX - this.viewWidth / 2) / tile + this.x,
      y: (cssY - this.viewHeight / 2) / tile + this.y,
    };
  }

  /** Tile under a CSS-pixel point, or `null` outside the grid. */
  tileAtScreen(cssX: number, cssY: number): { x: number; y: number } | null {
    const world = this.screenToWorld(cssX, cssY);
    const x = Math.floor(world.x);
    const y = Math.floor(world.y);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return null;
    return { x, y };
  }

  /** Inclusive tile range covering the viewport, clipped to the grid. Reuses `out`. */
  visibleRange(out: ViewRange, margin = 1): ViewRange {
    const tile = this.tilePx;
    const left = (0 - this.originX()) / tile;
    const top = (0 - this.originY()) / tile;
    out.x0 = Math.max(0, Math.floor(left) - margin);
    out.y0 = Math.max(0, Math.floor(top) - margin);
    out.x1 = Math.min(this.cols - 1, Math.ceil(left + this.viewWidth / tile) + margin);
    out.y1 = Math.min(this.rows - 1, Math.ceil(top + this.viewHeight / tile) + margin);
    return out;
  }

  private clampTarget(): void {
    // Clamps against the *target* zoom, not the current one. Using the live zoom here means a
    // zoom-out clamps the new centre against the old, tighter bounds and drifts the view.
    const c = this.clampCentre(this.targetX, this.targetY, this.targetDeviceTilePx / this.dpr);
    this.targetX = c.x;
    this.targetY = c.y;
  }

  private clampCurrent(): void {
    const c = this.clampCentre(this.x, this.y, this.tilePx);
    this.x = c.x;
    this.y = c.y;
  }

  /**
   * Keeps the grid inside the viewport. An axis whose content is smaller than the viewport is
   * centred outright rather than clamped, which is the difference between "small level sits
   * neatly in the middle" and "small level jammed into a corner".
   */
  private clampCentre(x: number, y: number, tilePx: number): { x: number; y: number } {
    const tile = tilePx;
    const halfW = this.viewWidth / 2 / tile;
    const halfH = this.viewHeight / 2 / tile;
    // A focus buys a little slack on both branches: room to drift off centre on an axis that
    // fits, and room to overshoot the edge on one that does not. It is bounded by `MAX_FOCUS_PX`,
    // which is small enough that nothing ever leaves the frame.
    const slack = this.focusSlack;
    const cx =
      this.cols <= halfW * 2
        ? clampAround(x, this.cols / 2, slack)
        : Math.min(Math.max(x, halfW - slack), this.cols - halfW + slack);
    const cy =
      this.rows <= halfH * 2
        ? clampAround(y, this.rows / 2, slack)
        : Math.min(Math.max(y, halfH - slack), this.rows - halfH + slack);
    return { x: cx, y: cy };
  }
}

function clampAround(value: number, centre: number, slack: number): number {
  return Math.min(Math.max(value, centre - slack), centre + slack);
}
