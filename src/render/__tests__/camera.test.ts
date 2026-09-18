import { describe, expect, it } from 'vitest';

import {
  Camera,
  MAX_FIT_CSS_TILE_PX,
  MAX_KICK_PX,
  ZOOM_LADDER,
  ladderIndex,
  snapTilePx,
} from '../camera.ts';
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

// The sliver of board the clamp holds inside the frame, in CSS pixels. Mirrors
// MIN_BOARD_ON_SCREEN_PX in camera.ts, which stays private to it.
const SLIVER_PX = 96;

// Wide-and-short is the shape that provoked this (w5-02 is 43x7); tall-and-narrow is the
// same complaint turned on its side, and neither must be fixed at the other's expense.
const SHAPES: readonly (readonly [number, number])[] = [
  [43, 7],
  [7, 43],
  [40, 40],
  [8, 3],
];

const SHOVES: readonly (readonly [number, number])[] = [
  [9000, 0],
  [-9000, 0],
  [0, 9000],
  [0, -9000],
  [9000, 9000],
  [-9000, -9000],
];

function onScreen(
  cam: Camera,
  cols: number,
  rows: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const tile = cam.tilePx;
  return {
    x: Math.max(0, Math.min(width, cam.originX() + cols * tile) - Math.max(0, cam.originX())),
    y: Math.max(0, Math.min(height, cam.originY() + rows * tile) - Math.max(0, cam.originY())),
  };
}

describe('clamping', () => {
  it('always leaves a sliver of the board on screen, however hard the player shoves', () => {
    for (const [cols, rows] of SHAPES) {
      for (const zoom of [12, 24, 48, 96]) {
        const cam = camera(960, 540, 1, cols, rows);
        cam.setZoom(zoom);
        for (const [dx, dy] of SHOVES) {
          cam.panBy(dx, dy);
          cam.settle();
          const seen = onScreen(cam, cols, rows, 960, 540);
          const label = `${String(cols)}x${String(rows)} @${String(zoom)} ${String(dx)},${String(dy)}`;
          expect([label, seen.x > 1, seen.y > 1]).toEqual([label, true, true]);
        }
      }
    }
  });

  it('holds back exactly the sliver, not a frame of board', () => {
    const cam = camera(960, 540, 1, 43, 7);
    cam.setZoom(48);
    for (const [dx, dy] of SHOVES.slice(0, 4)) {
      cam.panBy(dx, dy);
      cam.settle();
      const seen = onScreen(cam, 43, 7, 960, 540);
      const moved = dx !== 0 ? seen.x : seen.y;
      expect(moved).toBeCloseTo(SLIVER_PX, 3);
    }
  });

  it('lets the board be shoved right past the frame edge', () => {
    const cam = camera(960, 540, 1, 43, 7);
    cam.setZoom(48);
    cam.panBy(9000, 0);
    cam.settle();
    expect(cam.originX()).toBeGreaterThan(960 - SLIVER_PX - 0.001);
    cam.panBy(-9000, 0);
    cam.settle();
    expect(cam.originX() + 43 * cam.tilePx).toBeLessThan(SLIVER_PX + 0.001);
  });
});

// The floor under the sliver rule: if any tile can be put in the middle of the frame, no
// tile can be stuck under an overlay, whatever shape the board is and however far in we are.
describe('every tile reaches the middle of the frame', () => {
  it('puts any corner or edge tile dead centre, on any board shape at any zoom', () => {
    for (const [cols, rows] of SHAPES) {
      for (const zoom of ZOOM_LADDER) {
        const cam = camera(960, 540, 1, cols, rows);
        cam.setZoom(zoom);
        for (const tx of [0, cols >> 1, cols - 1]) {
          for (const ty of [0, rows >> 1, rows - 1]) {
            cam.setCenter(tx + 0.5, ty + 0.5, true);
            cam.settle();
            const out = { x: 0, y: 0 };
            cam.worldToScreen(tx + 0.5, ty + 0.5, out);
            const label = `${String(cols)}x${String(rows)} @${String(zoom)} tile ${String(tx)},${String(ty)}`;
            expect([label, out.x, out.y]).toEqual([label, 480, 270]);
          }
        }
      }
    }
  });

  it('gets there by dragging, not only by being told to', () => {
    const cam = camera(960, 540, 1, 43, 7);
    cam.setZoom(48);
    const out = { x: 0, y: 0 };
    cam.panBy(9000, 9000);
    cam.settle();
    cam.worldToScreen(0.5, 0.5, out);
    expect(out.x).toBeGreaterThan(480);
    expect(out.y).toBeGreaterThan(270);
    cam.panBy(-9000, -9000);
    cam.settle();
    cam.worldToScreen(42.5, 6.5, out);
    expect(out.x).toBeLessThan(480);
    expect(out.y).toBeLessThan(270);
  });
});

describe('a panel over the canvas', () => {
  it('fits and centres the grid in what is left of the canvas', () => {
    const cam = camera(1280, 640, 1, 12, 9);
    cam.setInset({ left: 640 });
    cam.fit(true);
    expect(cam.originX()).toBeGreaterThanOrEqual(640 - 0.001);
    expect(cam.originX() + 12 * cam.tilePx).toBeLessThanOrEqual(1280 + 0.001);
    expect(cam.originX() - 640).toBeCloseTo(1280 - (cam.originX() + 12 * cam.tilePx), 5);
  });

  it('lets the grid be pushed out from under the panel', () => {
    const cam = camera(1280, 640, 1, 12, 9);
    cam.setInset({ left: 640 });
    cam.fit(true);
    cam.panBy(5000, 0);
    cam.settle();
    expect(cam.originX()).toBeGreaterThanOrEqual(640 - 0.001);
  });

  it('ignores an inset that would leave no room to look at', () => {
    const cam = camera(700, 640, 1, 12, 9);
    cam.setInset({ left: 700 });
    cam.fit(true);
    expect(cam.originX()).toBeCloseTo(350 - (12 * cam.tilePx) / 2, 5);
  });

  it('keeps a screen point on the same tile it reads back', () => {
    const cam = camera(1280, 640, 1, 20, 20);
    cam.setInset({ left: 500 });
    cam.setZoom(32);
    cam.settle();
    const out = { x: 0, y: 0 };
    cam.worldToScreen(9.5, 8.25, out);
    const back = cam.screenToWorld(out.x, out.y);
    expect(back.x).toBeCloseTo(9.5);
    expect(back.y).toBeCloseTo(8.25);
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
    cam.setCenter(15, 15, true);
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

describe('the camera performing', () => {
  it('nudges within the readability budget and recovers on its own', () => {
    const cam = camera(800, 600, 1, 20, 20);
    cam.fit(true);
    const rest = cam.originY();
    cam.kick(0, -1, 1);
    const kicked = cam.originY();
    expect(rest - kicked).toBeGreaterThan(0);
    expect(rest - kicked).toBeLessThanOrEqual(MAX_KICK_PX + 1e-9);

    let previous = rest - cam.originY();
    for (let i = 0; i < 20; i++) {
      cam.update(1 / 60);
      const now = rest - cam.originY();
      expect(now).toBeLessThanOrEqual(previous + 1e-9);
      previous = now;
    }
    expect(cam.originY()).toBeCloseTo(rest, 6);
  });

  it('clamps an over-enthusiastic caller rather than shaking the screen', () => {
    const cam = camera(800, 600, 1, 20, 20);
    cam.fit(true);
    const rest = cam.originX();
    cam.kick(1, 0, 40);
    expect(Math.abs(cam.originX() - rest)).toBeLessThanOrEqual(MAX_KICK_PX + 1e-9);
  });

  it('leans towards a focus and lets go of it again', () => {
    const cam = camera(400, 400, 1, 40, 40);
    cam.fit(true);
    const startX = cam.x;
    cam.focus(38, 38, 1.5, 1);
    expect(cam.focusing).toBe(true);
    for (let i = 0; i < 60; i++) cam.update(1 / 60);
    expect(cam.x).toBeGreaterThan(startX);
    for (let i = 0; i < 120; i++) cam.update(1 / 60);
    expect(cam.focusing).toBe(false);
  });

  it('drops a focus the moment the player touches the camera', () => {
    const cam = camera(400, 400, 1, 40, 40);
    cam.fit(true);
    cam.focus(38, 38, 5, 1);
    cam.panBy(10, 10);
    expect(cam.focusing).toBe(false);
  });
});
