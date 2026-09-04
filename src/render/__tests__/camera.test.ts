import { describe, expect, it } from 'vitest';

import { Camera, MAX_FIT_CSS_TILE_PX, ZOOM_LADDER, ladderIndex, snapTilePx } from '../camera.ts';
import { TILE_PX } from '../tiles.ts';

function camera(width: number, height: number, dpr: number, cols: number, rows: number): Camera {
  const cam = new Camera();
  cam.setViewport(width, height, dpr);
  cam.setBounds({ cols, rows });
  return cam;
}

describe('zoom ladder', () => {
  it('is ascending and every rung is a whole number of device pixels', () => {
    for (let i = 1; i < ZOOM_LADDER.length; i++) {
      expect(ZOOM_LADDER[i] as number).toBeGreaterThan(ZOOM_LADDER[i - 1] as number);
    }
    for (const rung of ZOOM_LADDER) expect(Number.isInteger(rung)).toBe(true);
  });

  it('snaps down to the nearest rung and clamps below the smallest', () => {
    expect(snapTilePx(48)).toBe(48);
    expect(snapTilePx(47)).toBe(44);
    expect(snapTilePx(43)).toBe(40);
    expect(snapTilePx(1000)).toBe(ZOOM_LADDER[ZOOM_LADDER.length - 1]);
    expect(snapTilePx(0)).toBe(ZOOM_LADDER[0]);
    expect(snapTilePx(-5)).toBe(ZOOM_LADDER[0]);
  });

  it('keeps every rung above the atlas native size an exact integer upscale', () => {
    for (const rung of ZOOM_LADDER) {
      if (rung > TILE_PX) expect(rung % TILE_PX).toBe(0);
    }
  });

  it('round-trips through ladderIndex', () => {
    for (const rung of ZOOM_LADDER) {
      expect(ZOOM_LADDER[ladderIndex(rung)]).toBe(rung);
    }
  });
});

describe('fit', () => {
  const sizes: [number, number][] = [
    [5, 5],
    [7, 5],
    [12, 9],
    [20, 20],
    [30, 30],
    [40, 40],
  ];

  it('keeps every grid size fully on screen without the player touching anything', () => {
    for (const dpr of [1, 2, 2.5]) {
      for (const [cols, rows] of sizes) {
        const cam = camera(960, 640, dpr, cols, rows);
        cam.fit(true);
        expect(cols * cam.tilePx).toBeLessThanOrEqual(960 + 0.001);
        expect(rows * cam.tilePx).toBeLessThanOrEqual(640 + 0.001);
      }
    }
  });

  it('does not blow a tiny grid up to fill a large display', () => {
    const cam = camera(1920, 1080, 2, 5, 5);
    cam.fit(true);
    expect(cam.tilePx).toBeLessThanOrEqual(MAX_FIT_CSS_TILE_PX);
  });

  it('uses a usable share of the viewport on a 40x40 grid', () => {
    const cam = camera(960, 640, 2, 40, 40);
    cam.fit(true);
    expect((40 * cam.tilePx) / 640).toBeGreaterThan(0.7);
  });

  it('centres the grid', () => {
    const cam = camera(960, 640, 2, 12, 9);
    cam.fit(true);
    expect(cam.x).toBeCloseTo(6);
    expect(cam.y).toBeCloseTo(4.5);
  });

  it('lands on a whole number of device pixels per tile', () => {
    const cam = camera(913, 577, 2, 17, 11);
    cam.fit(true);
    expect(Number.isInteger(cam.deviceTilePx)).toBe(true);
    expect(Number.isInteger(cam.deviceTilePx * (TILE_PX / TILE_PX))).toBe(true);
  });
});

describe('clamping', () => {
  it('centres an axis whose content is smaller than the viewport', () => {
    const cam = camera(960, 200, 1, 8, 3);
    cam.setZoom(48);
    cam.panBy(5000, 5000);
    cam.settle();
    expect(cam.x).toBeCloseTo(4);
    expect(cam.y).toBeCloseTo(1.5);
  });

  it('never lets the grid edge come inside the viewport when zoomed in', () => {
    const cam = camera(480, 320, 1, 40, 40);
    cam.setZoom(48);
    cam.panBy(-100000, -100000);
    cam.settle();
    expect(cam.originX()).toBeLessThanOrEqual(0.001);
    expect(cam.originY()).toBeLessThanOrEqual(0.001);
    cam.panBy(100000, 100000);
    cam.settle();
    expect(cam.originX() + 40 * cam.tilePx).toBeGreaterThanOrEqual(480 - 0.001);
    expect(cam.originY() + 40 * cam.tilePx).toBeGreaterThanOrEqual(320 - 0.001);
  });
});

describe('projection', () => {
  it('round-trips world -> screen -> world', () => {
    const cam = camera(800, 600, 2, 20, 15);
    cam.fit(true);
    const out = { x: 0, y: 0 };
    cam.worldToScreen(7.25, 3.5, out);
    const back = cam.screenToWorld(out.x, out.y);
    expect(back.x).toBeCloseTo(7.25);
    expect(back.y).toBeCloseTo(3.5);
  });

  it('returns null for a point outside the grid', () => {
    const cam = camera(800, 600, 1, 6, 4);
    cam.fit(true);
    expect(cam.tileAtScreen(-500, -500)).toBeNull();
    expect(cam.tileAtScreen(4000, 4000)).toBeNull();
    expect(cam.tileAtScreen(400, 300)).not.toBeNull();
  });

  it('pins the anchor point while zooming', () => {
    const cam = camera(800, 600, 1, 30, 30);
    cam.setZoom(24);
    cam.settle();
    const before = cam.screenToWorld(200, 150);
    cam.zoomBy(2, 200, 150);
    cam.settle();
    const after = cam.screenToWorld(200, 150);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.y).toBeCloseTo(before.y, 5);
  });

  it('clips the visible range to the grid', () => {
    const cam = camera(200, 200, 1, 40, 40);
    cam.setZoom(48);
    cam.setCenter(0, 0, true);
    const range = cam.visibleRange({ x0: 0, y0: 0, x1: 0, y1: 0 }, 1);
    expect(range.x0).toBe(0);
    expect(range.y0).toBe(0);
    expect(range.x1).toBeLessThan(40);
    cam.setCenter(40, 40, true);
    const far = cam.visibleRange({ x0: 0, y0: 0, x1: 0, y1: 0 }, 1);
    expect(far.x1).toBe(39);
    expect(far.y1).toBe(39);
  });
});

describe('follow and easing', () => {
  it('eases toward a followed target and releases on pan', () => {
    const cam = camera(400, 400, 1, 40, 40);
    cam.setZoom(16);
    cam.setCenter(15, 15, true);
    const target = { x: 25, y: 25 };
    cam.follow(target);
    expect(cam.following).toBe(true);
    for (let i = 0; i < 200; i++) cam.update(1 / 60);
    expect(cam.x).toBeCloseTo(25.5, 1);
    expect(cam.y).toBeCloseTo(25.5, 1);
    cam.panBy(1, 1);
    expect(cam.following).toBe(false);
  });

  it('does not ease the zoom, so the terrain cache is never on a fractional scale', () => {
    const cam = camera(400, 400, 1, 20, 20);
    cam.setZoom(16);
    cam.update(1 / 60);
    expect(cam.deviceTilePx).toBe(16);
    cam.setZoom(48);
    cam.update(1 / 60);
    expect(cam.deviceTilePx).toBe(48);
  });
});
