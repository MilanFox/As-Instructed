import { TILE_PX } from './tiles.ts';

export const ZOOM_LADDER: readonly number[] = [
  6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 96, 144, 192,
];

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
  fitPadding?: number;
  smoothing?: number;
}

export const MAX_KICK_PX = 3;

export const MAX_FOCUS_PX = 44;

export class Camera {
  viewWidth = 1;
  viewHeight = 1;
  dpr = 1;

  cols = 1;
  rows = 1;

  x = 0.5;
  y = 0.5;
  deviceTilePx: number = ZOOM_LADDER[13] as number;

  private targetX = 0.5;
  private targetY = 0.5;
  private targetDeviceTilePx: number = ZOOM_LADDER[13] as number;

  private followTarget: { x: number; y: number } | null = null;
  private readonly fitPadding: number;
  private readonly smoothing: number;

  private kickX = 0;
  private kickY = 0;
  private focusX = 0;
  private focusY = 0;
  private focusLeft = 0;
  private focusPull = 0;
  private focusSlack = 0;

  constructor(options: CameraOptions = {}) {
    this.fitPadding = options.fitPadding ?? 0.06;
    this.smoothing = options.smoothing ?? 14;
  }

  get tilePx(): number {
    return this.deviceTilePx / this.dpr;
  }

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

  fit(immediate = true): void {
    this.releaseFocus();
    const padded = 1 - this.fitPadding * 2;
    const rawX = (this.viewWidth * padded * this.dpr) / this.cols;
    const rawY = (this.viewHeight * padded * this.dpr) / this.rows;
    const cap = MAX_FIT_CSS_TILE_PX * this.dpr;
    let snapped = snapTilePx(Math.min(cap, Math.max(rawX < rawY ? rawX : rawY, 1)));

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
      anchorX !== undefined && anchorY !== undefined ? this.screenToWorld(anchorX, anchorY) : null;
    this.targetDeviceTilePx = snapTilePx(deviceTilePx);
    if (before) {
      const tile = this.targetDeviceTilePx / this.dpr;
      this.targetX = before.x - (anchorX! - this.viewWidth / 2) / tile;
      this.targetY = before.y - (anchorY! - this.viewHeight / 2) / tile;
    }
    this.followTarget = null;
    this.releaseFocus();
    this.clampTarget();
  }

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

  follow(target: { x: number; y: number } | null): void {
    this.followTarget = target;
  }

  get following(): boolean {
    return this.followTarget !== null;
  }

  kick(dx: number, dy: number, strength = 1): void {
    const length = Math.hypot(dx, dy) || 1;
    const amount = Math.min(MAX_KICK_PX, MAX_KICK_PX * Math.max(0, strength));
    this.kickX = (dx / length) * amount;
    this.kickY = (dy / length) * amount;
  }

  focus(x: number, y: number, seconds = 1.6, pull = 0.5): void {
    this.focusX = x;
    this.focusY = y;
    this.focusLeft = Math.max(0, seconds);
    this.focusPull = Math.max(0, Math.min(1, pull));
  }

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
      const ease = Math.min(1, this.focusLeft * 3) * this.focusPull;
      this.focusSlack = (MAX_FOCUS_PX / this.tilePx) * ease;
      this.targetX += (this.focusX + 0.5 - this.targetX) * Math.min(1, ease * dt * 2.2);
      this.targetY += (this.focusY + 0.5 - this.targetY) * Math.min(1, ease * dt * 2.2);
      this.clampTarget();
    } else if (this.focusSlack > 0) {
      this.focusSlack = Math.max(0, this.focusSlack - dt * 3);
      this.clampTarget();
    }
    const decay = Math.exp(-16 * Math.max(0, dt));
    this.kickX *= decay;
    this.kickY *= decay;
    if (Math.abs(this.kickX) < 0.05) this.kickX = 0;
    if (Math.abs(this.kickY) < 0.05) this.kickY = 0;
    this.deviceTilePx = this.targetDeviceTilePx;
    const k = 1 - Math.exp(-this.smoothing * Math.max(0, dt));
    this.x += (this.targetX - this.x) * k;
    this.y += (this.targetY - this.y) * k;
    if (Math.abs(this.targetX - this.x) < 1e-4) this.x = this.targetX;
    if (Math.abs(this.targetY - this.y) < 1e-4) this.y = this.targetY;
    this.clampCurrent();
  }

  settle(): void {
    this.releaseFocus();
    this.deviceTilePx = this.targetDeviceTilePx;
    this.x = this.targetX;
    this.y = this.targetY;
  }

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

  tileAtScreen(cssX: number, cssY: number): { x: number; y: number } | null {
    const world = this.screenToWorld(cssX, cssY);
    const x = Math.floor(world.x);
    const y = Math.floor(world.y);
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return null;
    return { x, y };
  }

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
    const c = this.clampCentre(this.targetX, this.targetY, this.targetDeviceTilePx / this.dpr);
    this.targetX = c.x;
    this.targetY = c.y;
  }

  private clampCurrent(): void {
    const c = this.clampCentre(this.x, this.y, this.tilePx);
    this.x = c.x;
    this.y = c.y;
  }

  private clampCentre(x: number, y: number, tilePx: number): { x: number; y: number } {
    const tile = tilePx;
    const halfW = this.viewWidth / 2 / tile;
    const halfH = this.viewHeight / 2 / tile;
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
