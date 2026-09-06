/**
 * SURVEY — the board is a drafting sheet, and the sheet is the brightest thing on screen.
 *
 * The bet: Kessler & Daughters never sent anyone to the planet. Contractor #4471 is forty light
 * minutes away and has never seen the site — what they are looking at is not a window, it is
 * Survey's plot of it, drawn up by a department that draws everything up. So the board is paper.
 *
 * That single inversion does most of the work. A pale sheet inside dark chrome is the one thing
 * on a store page that does not look like every other dark-mode programming game, it makes the
 * bot the darkest mark on the lightest field rather than a cyan blip on grey, and it turns
 * AUDIT-UI F6 from a problem into a non-issue: ink on paper is the highest-contrast grid this
 * game can have. The dry institutional voice finally has a surface that matches it.
 *
 * Mark-making language: one ink, three line weights, hatching for material. No gradients, no
 * glow, no bevels. Everything that is not paper is either a line, a hatch or a solid.
 */
import { Terrain } from '../../engine/index.ts';
import type { Tile, World } from '../../engine/index.ts';
import { alpha, luminance, mix, shade } from './color.ts';
import type {
  ArtDirection,
  BackdropPaint,
  BotDrawOptions,
  CropPaint,
  ItemPaint,
  MachinePaint,
  PostPaint,
  TerrainPaint,
} from './types.ts';
import type { BotPose } from '../timeline.ts';
import type { Biome } from '../tiles.ts';

/** The sheet. Warm bone rather than white — white paper on a dark screen glares. */
export const PAPER = '#d8d2c2';
/** Every line on the sheet. One ink, used at different weights and alphas. */
export const INK = '#171a1c';

/** Blue pencil. Reserved for what is live — which on the terrain means the power run and nothing else. */
const PENCIL = '#3d8fb8';
/** Orange oxide. Reserved for what the order is asking of you. */
const OXIDE = '#c8631e';
/** Red. Reserved for trouble, and on the terrain there is exactly one kind: the pit kills you. */
const RED = '#b3251d';
/** The drafting table. A `void` cell is a hole in the sheet, so it shows this through. */
const TABLE = '#131511';

/**
 * Below this the hatch pitch and the pen weight collide and rock, ore and rubble all turn into
 * the same grey mud, so each material collapses to the flat value its hatch was averaging.
 * `sprites.ts` makes the same trade at `BOT_DETAIL_TILE_PX`. Device px per tile.
 */
const HATCH_MIN_TILE_PX = 14;
/** Below this the margin ruler is more noise than aid. */
const RULER_MIN_TILE_PX = 11;
/**
 * Coordinate numbers need real type, and the cache is at device resolution, so a number set at
 * a third of a 24 px tile is four CSS pixels tall on a retina panel. Below this only the ticks
 * survive; the every-fifth major rule still carries the counting.
 */
const LABEL_MIN_TILE_PX = 34;

/**
 * Stable per-cell noise. A copy of `tiles.ts`'s `cellHash` rather than an import of it, because
 * `tiles.ts` imports `theme.ts` and `theme.ts` imports this file — the registry only stays
 * acyclic while a direction takes nothing but types from the modules above it.
 */
function noise(a: number, b: number, salt: number): number {
  let h = (a * 374761393 + b * 668265263 + salt * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * How the print shop stained the stock for each world.
 *
 * The biome is not allowed to become colour on this direction — it gets to move the paper a few
 * points and that is all, which is enough to tell two worlds apart on a screenshot and not enough
 * to reopen the "every level is a different palette" problem.
 */
const STAIN: Readonly<Record<Biome, string>> = {
  hangar: '#8a8f92',
  regolith: '#b06a2c',
  yard: '#7d7a6a',
  cave: '#3b4a52',
  grid: '#3d8fb8',
  signal: '#6f93a8',
  swarm: '#8a6d1f',
  finale: '#9c5f30',
};

const NO_CELLS: readonly number[] = [];

/** Facing vectors, indexed by `Dir`. North is y-1 because y grows South. */
const STEP_X = [0, 1, 0, -1] as const;
const STEP_Y = [-1, 0, 1, 0] as const;

function isSolid(kind: Terrain | undefined): boolean {
  return (
    kind === undefined ||
    kind === Terrain.Wall ||
    kind === Terrain.Rock ||
    kind === Terrain.Ore ||
    kind === Terrain.Rubble ||
    kind === Terrain.Void
  );
}

/** A mark that lands on one of these is drawn in paper rather than in ink, or it lands on nothing. */
function isHeavy(kind: Terrain | undefined): boolean {
  return (
    kind === undefined ||
    kind === Terrain.Wall ||
    kind === Terrain.Void ||
    kind === Terrain.Rock ||
    kind === Terrain.Ore
  );
}

/**
 * One family of 45° rules across a cell, appended to the open path.
 *
 * The phase is taken from the cell's absolute position rather than reset per cell, so a hatched
 * rock mass reads as one hatched body with a boundary drawn round it — which is what a geological
 * plan looks like — instead of as a checkerboard of little independently-hatched squares.
 */
function hatchCell(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  t: number,
  pitch: number,
  down: boolean,
): void {
  if (down) {
    const phase = (((-(x0 - y0) % pitch) + pitch) % pitch) - t;
    for (let c = phase; c < t; c += pitch) {
      const ax = c > 0 ? c : 0;
      const ay = c > 0 ? 0 : -c;
      const bx = c > 0 ? t : t + c;
      const by = c > 0 ? t - c : t;
      ctx.moveTo(x0 + ax, y0 + ay);
      ctx.lineTo(x0 + bx, y0 + by);
    }
    return;
  }
  const phase = ((-(x0 + y0) % pitch) + pitch) % pitch;
  for (let c = phase; c < t * 2; c += pitch) {
    const ax = c <= t ? 0 : c - t;
    const ay = c <= t ? c : t;
    const bx = c <= t ? c : t;
    const by = c <= t ? 0 : c - t;
    ctx.moveTo(x0 + ax, y0 + ay);
    ctx.lineTo(x0 + bx, y0 + by);
  }
}

/** One flat value across a list of cells, as a single path and a single fill. */
function washCells(
  ctx: CanvasRenderingContext2D,
  list: readonly number[],
  cols: number,
  t: number,
  style: string,
): void {
  if (list.length === 0) return;
  ctx.fillStyle = style;
  ctx.beginPath();
  for (const i of list) {
    ctx.rect((i % cols) * t, ((i / cols) | 0) * t, t, t);
  }
  ctx.fill();
}

/**
 * SURVEY's terrain layer: the whole board drawn from code onto a sheet of paper.
 *
 * Organised as one pass per material rather than one pass per cell. A pass is a single `beginPath`
 * accumulating every segment of one kind and a single `stroke`, which turns 1920 tile draws into
 * about twenty draw calls — the cache rebuild on the worst board in the game costs less than the
 * atlas path it replaces, despite drawing considerably more.
 */
function paintTerrain(paint: TerrainPaint): void {
  const { ctx, world, tilePx, biome, width, height } = paint;
  const cols = world.w;
  const rows = world.h;
  const tiles = world.tiles;
  const t = tilePx;

  const stained = mix(PAPER, STAIN[biome], 0.07);
  /* A stain may tint the stock. It may not darken it past the point the ink still has its range. */
  const stock = luminance(stained) < luminance(PAPER) * 0.88 ? PAPER : stained;

  const detail = t >= HATCH_MIN_TILE_PX;
  const pitch = Math.max(3, Math.round(t / 5));
  const fine = Math.max(1, t / 30);
  const heavy = Math.max(1.5, t / 15);

  ctx.save();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.fillStyle = stock;
  ctx.fillRect(0, 0, width, height);

  const bucket = new Map<Terrain, number[]>();
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    if (!tile) continue;
    const list = bucket.get(tile.terrain);
    if (list) list.push(i);
    else bucket.set(tile.terrain, [i]);
  }
  const cells = (kind: Terrain): readonly number[] => bucket.get(kind) ?? NO_CELLS;

  const voids = cells(Terrain.Void);
  const walls = cells(Terrain.Wall);
  const rocks = cells(Terrain.Rock);
  const ores = cells(Terrain.Ore);
  const rubble = cells(Terrain.Rubble);

  // ---------------------------------------------------------------- solids
  /*
   * The body value goes down before the hatch does, so the hatch lands on a mass rather than on
   * bare paper. The three mineable solids sit at three separate values in the order they resist
   * you — rock heaviest, rubble lightest — which means "can I get through this" is legible from
   * value alone, before any of the texture is resolved.
   */
  washCells(ctx, voids, cols, t, TABLE);
  washCells(ctx, walls, cols, t, alpha(INK, 0.94));
  washCells(ctx, rocks, cols, t, alpha(INK, detail ? 0.34 : 0.56));
  washCells(ctx, ores, cols, t, alpha(INK, detail ? 0.26 : 0.46));
  washCells(ctx, rubble, cols, t, alpha(INK, detail ? 0.14 : 0.32));

  if (detail) {
    ctx.lineWidth = fine;
    ctx.strokeStyle = alpha(INK, 0.6);
    ctx.beginPath();
    for (const i of rocks) {
      const x0 = (i % cols) * t;
      const y0 = ((i / cols) | 0) * t;
      hatchCell(ctx, x0, y0, t, pitch, true);
      hatchCell(ctx, x0, y0, t, pitch, false);
    }
    ctx.stroke();

    /* Ore is the same stone with half the cross-hatch, so it reads a shade lighter than rock. */
    ctx.beginPath();
    for (const i of ores) {
      hatchCell(ctx, (i % cols) * t, ((i / cols) | 0) * t, t, pitch, true);
    }
    ctx.stroke();

    /* Rubble is the same rock after it fell over: the rule breaks up and stops lining through. */
    ctx.strokeStyle = alpha(INK, 0.68);
    ctx.beginPath();
    for (const i of rubble) {
      const x0 = (i % cols) * t;
      const y0 = ((i / cols) | 0) * t;
      for (let k = 0; k < 6; k++) {
        const u = 0.1 + noise(i, k, 41) * 0.75;
        const v = 0.1 + noise(i, k, 53) * 0.75;
        const angle = noise(i, k, 67) * Math.PI;
        const len = t * (0.14 + noise(i, k, 71) * 0.16);
        const dx = Math.cos(angle) * len * 0.5;
        const dy = Math.sin(angle) * len * 0.5;
        ctx.moveTo(x0 + u * t - dx, y0 + v * t - dy);
        ctx.lineTo(x0 + u * t + dx, y0 + v * t + dy);
      }
    }
    ctx.stroke();

    /* A wall is drawn structure, not geology, so it gets a ruled inset instead of a hatch. */
    if (t >= 18) {
      const inset = Math.round(t * 0.16);
      ctx.lineWidth = Math.max(1, t / 48);
      ctx.strokeStyle = alpha(PAPER, 0.2);
      ctx.beginPath();
      for (const i of walls) {
        ctx.rect(
          (i % cols) * t + inset + 0.5,
          ((i / cols) | 0) * t + inset + 0.5,
          t - inset * 2 - 1,
          t - inset * 2 - 1,
        );
      }
      ctx.stroke();
    }
  }

  /* Ore's identifying mark: one filled lozenge, with the hatch cleared out from under it. */
  if (ores.length > 0) {
    const r = t * 0.22;
    ctx.fillStyle = stock;
    ctx.beginPath();
    for (const i of ores) {
      const cx = ((i % cols) + 0.5) * t;
      const cy = (((i / cols) | 0) + 0.5) * t;
      const g = r * 1.34;
      ctx.moveTo(cx, cy - g);
      ctx.lineTo(cx + g * 0.72, cy);
      ctx.lineTo(cx, cy + g);
      ctx.lineTo(cx - g * 0.72, cy);
      ctx.closePath();
    }
    ctx.fill();
    ctx.fillStyle = alpha(INK, 0.95);
    ctx.beginPath();
    for (const i of ores) {
      const cx = ((i % cols) + 0.5) * t;
      const cy = (((i / cols) | 0) + 0.5) * t;
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx + r * 0.72, cy);
      ctx.lineTo(cx, cy + r);
      ctx.lineTo(cx - r * 0.72, cy);
      ctx.closePath();
    }
    ctx.fill();
  }

  /*
   * The boundary of every solid mass, drawn only where it meets somewhere you can stand. This is
   * the mark doing the load-bearing legibility work: whatever the hatch is doing inside, the line
   * between "here" and "not here" is a heavy ruled edge at every zoom.
   */
  ctx.lineWidth = heavy;
  ctx.strokeStyle = alpha(INK, 0.9);
  ctx.beginPath();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!isSolid(tiles[y * cols + x]?.terrain)) continue;
      const x0 = x * t;
      const y0 = y * t;
      if (y > 0 && !isSolid(tiles[(y - 1) * cols + x]?.terrain)) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + t, y0);
      }
      if (y < rows - 1 && !isSolid(tiles[(y + 1) * cols + x]?.terrain)) {
        ctx.moveTo(x0, y0 + t);
        ctx.lineTo(x0 + t, y0 + t);
      }
      if (x > 0 && !isSolid(tiles[y * cols + x - 1]?.terrain)) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0, y0 + t);
      }
      if (x < cols - 1 && !isSolid(tiles[y * cols + x + 1]?.terrain)) {
        ctx.moveTo(x0 + t, y0);
        ctx.lineTo(x0 + t, y0 + t);
      }
    }
  }
  ctx.stroke();

  // ------------------------------------------------------------- walkables
  const regolith = cells(Terrain.Regolith);
  if (regolith.length > 0) {
    if (detail) {
      const dot = Math.max(1, Math.round(t / 14));
      ctx.fillStyle = alpha(INK, 0.6);
      ctx.beginPath();
      for (const i of regolith) {
        const x0 = (i % cols) * t;
        const y0 = ((i / cols) | 0) * t;
        for (let k = 0; k < 11; k++) {
          ctx.rect(x0 + noise(i, k, 13) * (t - dot), y0 + noise(i, k, 23) * (t - dot), dot, dot);
        }
      }
      ctx.fill();
    } else {
      washCells(ctx, regolith, cols, t, alpha(INK, 0.09));
    }
  }

  const soil = cells(Terrain.Soil);
  if (soil.length > 0) {
    if (detail) {
      const inset = t * 0.12;
      ctx.lineWidth = fine;
      ctx.strokeStyle = alpha(INK, 0.32);
      ctx.beginPath();
      for (const i of soil) {
        const x0 = (i % cols) * t;
        const y0 = ((i / cols) | 0) * t;
        for (let c = ((y0 % pitch) + pitch) % pitch; c < t; c += pitch) {
          ctx.moveTo(x0 + inset, y0 + c);
          ctx.lineTo(x0 + t - inset, y0 + c);
        }
      }
      ctx.stroke();
    } else {
      washCells(ctx, soil, cols, t, alpha(INK, 0.11));
    }

    /*
     * Growth as a plotted quantity rather than as a sprite: taller and denser strokes as the crop
     * comes on, which is the same information `drawPlantGauge` shows live and is what makes a
     * still board of a half-grown field readable without running it.
     */
    ctx.lineWidth = Math.max(1, t / 24);
    ctx.strokeStyle = alpha(INK, 0.78);
    ctx.beginPath();
    for (const i of soil) {
      const tile = tiles[i];
      const max = tile?.maxGrowth ?? 0;
      if (!tile || max <= 0) continue;
      const g = Math.max(0, Math.min(1, (tile.growth ?? 0) / max));
      if (g <= 0) continue;
      const stems = 1 + Math.round(g * 2);
      const cx = ((i % cols) + 0.5) * t;
      const base = (((i / cols) | 0) + 0.74) * t;
      const tall = t * (0.16 + 0.34 * g);
      for (let k = 0; k < stems; k++) {
        const sx = cx + (k - (stems - 1) / 2) * t * 0.17;
        ctx.moveTo(sx, base);
        ctx.lineTo(sx, base - tall);
      }
    }
    ctx.stroke();
  }

  const ice = cells(Terrain.Ice);
  if (ice.length > 0) {
    if (detail) {
      /* Ruled vertical, so it cannot be confused with soil's horizontal furrows at any size. */
      const icePitch = Math.max(3, Math.round(t / 6));
      ctx.lineWidth = fine;
      ctx.strokeStyle = alpha(INK, 0.28);
      ctx.beginPath();
      for (const i of ice) {
        const x0 = (i % cols) * t;
        const y0 = ((i / cols) | 0) * t;
        for (let c = ((x0 % icePitch) + icePitch) % icePitch; c < t; c += icePitch) {
          ctx.moveTo(x0 + c, y0);
          ctx.lineTo(x0 + c, y0 + t);
        }
      }
      ctx.stroke();
      ctx.strokeStyle = alpha(INK, 0.5);
      ctx.beginPath();
      for (const i of ice) {
        if (noise(i, 0, 83) < 0.55) continue;
        const x0 = (i % cols) * t;
        const y0 = ((i / cols) | 0) * t;
        const v = 0.2 + noise(i, 1, 89) * 0.6;
        ctx.moveTo(x0 + t * 0.1, y0 + v * t);
        ctx.lineTo(x0 + t * 0.9, y0 + (v + 0.14) * t);
      }
      ctx.stroke();
    } else {
      washCells(ctx, ice, cols, t, alpha(INK, 0.1));
    }
  }

  /* Power runs in blue pencil, and it is drawn as a schematic: it knows what it connects to. */
  const cable = cells(Terrain.Cable);
  if (cable.length > 0) {
    ctx.lineWidth = Math.max(1, t / 20);
    ctx.strokeStyle = alpha(PENCIL, 0.95);
    ctx.beginPath();
    for (const i of cable) {
      const x = i % cols;
      const y = (i / cols) | 0;
      const cx = (x + 0.5) * t;
      const cy = (y + 0.5) * t;
      let linked = false;
      for (let d = 0; d < 4; d++) {
        const nx = x + (STEP_X[d] as number);
        const ny = y + (STEP_Y[d] as number);
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const kind = tiles[ny * cols + nx]?.terrain;
        if (kind !== Terrain.Cable && kind !== Terrain.Depot) continue;
        linked = true;
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + (STEP_X[d] as number) * t * 0.5, cy + (STEP_Y[d] as number) * t * 0.5);
      }
      if (!linked) {
        ctx.moveTo(cx - t * 0.3, cy);
        ctx.lineTo(cx + t * 0.3, cy);
      }
    }
    ctx.stroke();
    const node = Math.max(2, Math.round(t * 0.16));
    ctx.fillStyle = PENCIL;
    ctx.beginPath();
    for (const i of cable) {
      ctx.rect(
        ((i % cols) + 0.5) * t - node / 2,
        (((i / cols) | 0) + 0.5) * t - node / 2,
        node,
        node,
      );
    }
    ctx.fill();
  }

  /* The depot is a survey benchmark: circle, inscribed cross, filled centre. */
  const depot = cells(Terrain.Depot);
  if (depot.length > 0) {
    const r = t * 0.3;
    ctx.lineWidth = heavy;
    ctx.strokeStyle = alpha(INK, 0.88);
    ctx.beginPath();
    for (const i of depot) {
      const cx = ((i % cols) + 0.5) * t;
      const cy = (((i / cols) | 0) + 0.5) * t;
      ctx.moveTo(cx + r, cy);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
    }
    ctx.stroke();
    ctx.fillStyle = alpha(INK, 0.9);
    ctx.beginPath();
    for (const i of depot) {
      const cx = ((i % cols) + 0.5) * t;
      const cy = (((i / cols) | 0) + 0.5) * t;
      ctx.moveTo(cx + r * 0.34, cy);
      ctx.arc(cx, cy, r * 0.34, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  /* A conveyor is a ruled run with the direction of travel called out on it. */
  const conveyor = cells(Terrain.Conveyor);
  if (conveyor.length > 0) {
    ctx.lineWidth = fine;
    ctx.strokeStyle = alpha(INK, 0.4);
    ctx.beginPath();
    for (const i of conveyor) {
      const dir = facingOf(tiles[i]);
      const fx = STEP_X[dir] as number;
      const fy = STEP_Y[dir] as number;
      const rx = -fy;
      const ry = fx;
      const cx = ((i % cols) + 0.5) * t;
      const cy = (((i / cols) | 0) + 0.5) * t;
      for (const side of [-1, 1]) {
        const ox = rx * side * t * 0.26;
        const oy = ry * side * t * 0.26;
        ctx.moveTo(cx + ox - fx * t * 0.5, cy + oy - fy * t * 0.5);
        ctx.lineTo(cx + ox + fx * t * 0.5, cy + oy + fy * t * 0.5);
      }
    }
    ctx.stroke();
    ctx.lineWidth = Math.max(1, t / 20);
    ctx.strokeStyle = alpha(INK, 0.72);
    ctx.beginPath();
    for (const i of conveyor) {
      const dir = facingOf(tiles[i]);
      const fx = STEP_X[dir] as number;
      const fy = STEP_Y[dir] as number;
      const rx = -fy;
      const ry = fx;
      const cx = ((i % cols) + 0.5) * t;
      const cy = (((i / cols) | 0) + 0.5) * t;
      for (const at of [-0.18, 0.18]) {
        const tipX = cx + fx * (at + 0.15) * t;
        const tipY = cy + fy * (at + 0.15) * t;
        const backX = cx + fx * (at - 0.05) * t;
        const backY = cy + fy * (at - 0.05) * t;
        ctx.moveTo(backX + rx * t * 0.16, backY + ry * t * 0.16);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(backX - rx * t * 0.16, backY - ry * t * 0.16);
      }
    }
    ctx.stroke();
  }

  /* The pad is the only orange on the sheet, because it is the only thing the order asks for. */
  const pad = cells(Terrain.Pad);
  if (pad.length > 0) {
    ctx.lineWidth = Math.max(1, t / 20);
    ctx.strokeStyle = alpha(OXIDE, 0.95);
    ctx.beginPath();
    for (const i of pad) {
      const x0 = (i % cols) * t;
      const y0 = ((i / cols) | 0) * t;
      for (const k of [0.13, 0.24]) {
        ctx.rect(x0 + t * k, y0 + t * k, t * (1 - k * 2), t * (1 - k * 2));
      }
      ctx.moveTo(x0 + t * 0.38, y0 + t * 0.5);
      ctx.lineTo(x0 + t * 0.62, y0 + t * 0.5);
      ctx.moveTo(x0 + t * 0.5, y0 + t * 0.38);
      ctx.lineTo(x0 + t * 0.5, y0 + t * 0.62);
    }
    ctx.stroke();
  }

  /*
   * The pit gets the sheet's only red, and it gets a filled body, because it is the one terrain
   * that ends a run. AUDIT-UI called the shipped pit the worst legibility failure in the set —
   * a thin dark ring on a dark floor — and the fix here is that it is dark on a *pale* floor with
   * a red ring and four hazard ticks round it, which survives all the way down to a 12 px tile.
   */
  const pit = cells(Terrain.Pit);
  if (pit.length > 0) {
    const r = t * 0.3;
    ctx.fillStyle = alpha(INK, 0.88);
    ctx.beginPath();
    for (const i of pit) {
      const cx = ((i % cols) + 0.5) * t;
      const cy = (((i / cols) | 0) + 0.5) * t;
      ctx.moveTo(cx + r, cy);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.lineWidth = heavy;
    ctx.strokeStyle = RED;
    ctx.beginPath();
    for (const i of pit) {
      const cx = ((i % cols) + 0.5) * t;
      const cy = (((i / cols) | 0) + 0.5) * t;
      ctx.moveTo(cx + r * 1.28, cy);
      ctx.arc(cx, cy, r * 1.28, 0, Math.PI * 2);
      for (let k = 0; k < 4; k++) {
        const a = Math.PI * (0.25 + k * 0.5);
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        ctx.moveTo(cx + dx * r * 1.5, cy + dy * r * 1.5);
        ctx.lineTo(cx + dx * t * 0.5, cy + dy * t * 0.5);
      }
    }
    ctx.stroke();
  }

  drawMargin(ctx, world, t, stock);
  ctx.restore();
}

function facingOf(tile: Tile | undefined): number {
  const raw = tile?.meta?.['facing'];
  return typeof raw === 'number' && raw >= 0 && raw <= 3 ? raw : 1;
}

/**
 * Drafting furniture: ruler ticks down two edges, coordinate numbers every fifth cell, and a
 * registration cross at each corner of the plot.
 *
 * This is the detail that makes the board look authored, and it is also the fix for a real defect
 * — AUDIT-UI found no axis labels, no ruler and no coordinate readout anywhere, on a game whose
 * whole activity is reasoning about grid positions. Committing to the bit happens to close it.
 */
function drawMargin(ctx: CanvasRenderingContext2D, world: World, t: number, stock: string): void {
  if (t < RULER_MIN_TILE_PX) return;
  const cols = world.w;
  const rows = world.h;
  const tiles = world.tiles;
  const dark = alpha(stock, 0.72);
  const light = alpha(INK, 0.66);

  /* A tick over a solid is drawn in paper, or the margin disappears wherever the border is wall. */
  const inkFor = (x: number, y: number): string =>
    isHeavy(tiles[y * cols + x]?.terrain) ? dark : light;

  /*
   * Two passes rather than one tick per stroke: there are only ever two inks, so a border of
   * ninety cells costs two path builds instead of ninety context-state changes.
   */
  const arm = t * 0.62;
  for (const ink of [light, dark]) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1, t / 22);
    ctx.beginPath();
    for (let x = 0; x < cols; x++) {
      if (inkFor(x, 0) !== ink) continue;
      ctx.moveTo(x * t + 0.5, 0);
      ctx.lineTo(x * t + 0.5, t * (x % 5 === 0 ? 0.32 : 0.15));
    }
    for (let y = 0; y < rows; y++) {
      if (inkFor(0, y) !== ink) continue;
      ctx.moveTo(0, y * t + 0.5);
      ctx.lineTo(t * (y % 5 === 0 ? 0.32 : 0.15), y * t + 0.5);
    }
    ctx.stroke();

    ctx.lineWidth = Math.max(1.5, t / 14);
    ctx.beginPath();
    for (const [cx, cy] of [
      [0, 0],
      [cols, 0],
      [0, rows],
      [cols, rows],
    ] as const) {
      if (inkFor(Math.min(cols - 1, cx), Math.min(rows - 1, cy)) !== ink) continue;
      const sx = cx === 0 ? 1 : -1;
      const sy = cy === 0 ? 1 : -1;
      ctx.moveTo(cx * t, cy * t + sy * arm);
      ctx.lineTo(cx * t, cy * t);
      ctx.lineTo(cx * t + sx * arm, cy * t);
    }
    ctx.stroke();
  }

  if (t < LABEL_MIN_TILE_PX) return;
  ctx.font = `500 ${Math.max(9, Math.round(t * 0.32))}px 'JetBrains Mono', ui-monospace, monospace`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  for (let x = 5; x < cols; x += 5) {
    ctx.fillStyle = inkFor(x, 0);
    ctx.fillText(String(x), x * t + t * 0.14, t * 0.36);
  }
  for (let y = 5; y < rows; y += 5) {
    ctx.fillStyle = inkFor(0, y);
    ctx.fillText(String(y), t * 0.36, y * t + t * 0.14);
  }
}

// ---------------------------------------------------------------------------
// Screen space
// ---------------------------------------------------------------------------

/**
 * The drafting table, as one repeating tile.
 *
 * Built once and cached against the context it was made for. `backdrop` runs every frame, so the
 * only thing it is allowed to do is set two fill styles and clear two rects; the speckle that
 * stops the table reading as a flat swatch has to be baked, not computed.
 */
let grainPattern: CanvasPattern | null = null;
let grainOwner: CanvasRenderingContext2D | null = null;

function tableGrain(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (grainPattern && grainOwner === ctx) return grainPattern;
  const sheet = document.createElement('canvas');
  sheet.width = 128;
  sheet.height = 128;
  const g = sheet.getContext('2d');
  if (!g) return null;
  const lift = shade(TABLE, 2.1);
  const sink = shade(TABLE, 0.4);
  for (let i = 0; i < 1600; i++) {
    const u = noise(i, 3, 7);
    const v = noise(i, 5, 13);
    const k = noise(i, 7, 19);
    g.fillStyle = k > 0.6 ? alpha(lift, 0.12) : alpha(sink, 0.22);
    g.fillRect(Math.floor(u * 128), Math.floor(v * 128), k > 0.94 ? 2 : 1, 1);
  }
  grainOwner = ctx;
  grainPattern = ctx.createPattern(sheet, 'repeat');
  return grainPattern;
}

function backdrop({ ctx, width, height }: BackdropPaint): void {
  ctx.fillStyle = TABLE;
  ctx.fillRect(0, 0, width, height);
  const grain = tableGrain(ctx);
  if (!grain) return;
  ctx.fillStyle = grain;
  ctx.fillRect(0, 0, width, height);
}

/*
 * Pre-spaced rather than tracked with `ctx.letterSpacing`, which is a recent addition and is the
 * kind of thing that silently does nothing on the one browser you did not check.
 */
const STAMP_TITLE = 'S U R V E Y   O F   R E C O R D';
const STAMP_REF =
  'K & D  T E R R A F O R M I N G   ·   S H E E T  4 4 7 1   ·   T R I P L I C A T E';

let stampDpr = 0;
let titleFont = '';
let refFont = '';

/**
 * Sheet furniture, in screen space: the coordinate readout, the frame the plot is held in and,
 * on a still board, the stamp that says what a still board is.
 *
 * Deliberately motionless. Everything else in this file argues that the screen is a printed sheet,
 * and a printed sheet does not breathe — which also means `reducedMotion` has nothing to switch
 * off here, rather than having something that merely slows down.
 */
/** The rhythm the major grid rule already counts in, so the two agree. */
const READOUT_STEP = 5;
/** Below this the numbers touch and the ruler stops being countable. Device px per tile. */
const READOUT_MIN_TILE_PX = 7;

let readoutDpr = 0;
let readoutFont = '';

/**
 * The coordinate readout, in screen space.
 *
 * `drawMargin` numbers the plot *inside* the cached terrain layer, which means the numbers stop
 * existing below a 34 px cache tile — which is `w8-05`, the board with the most positions to
 * reason about and the one that needs them most. AUDIT-UI F6 asks for a coordinate readout that
 * is actually there, so this one is placed from the world transform and drawn in device pixels,
 * and therefore survives every zoom.
 *
 * Quiet on purpose: it is a margin annotation, not a HUD. Ink where it lands on the sheet, paper
 * where it lands on the table, and nothing behind it either way.
 */
function drawReadout(paint: PostPaint): void {
  const { ctx, width, height, dpr, originX, originY, tilePx, cols, rows } = paint;
  if (tilePx < READOUT_MIN_TILE_PX) return;
  if (dpr !== readoutDpr) {
    readoutDpr = dpr;
    readoutFont = `500 ${Math.round(9 * dpr)}px 'JetBrains Mono', ui-monospace, monospace`;
  }
  const size = Math.round(9 * dpr);
  const gap = Math.round(5 * dpr);

  /*
   * The ruler rides just outside the plot and pins to the canvas edge once the plot has grown
   * past it. A margin that has scrolled off the screen is not a margin — and pinned means it is
   * over the sheet, which is the only case where it has to be ink rather than paper.
   */
  const colPinned = originY - gap < size + gap;
  const rowPinned = originX - gap < size * 2;
  const colY = colPinned ? size + gap : originY - gap;
  const rowX = rowPinned ? gap : originX - gap;

  ctx.font = readoutFont;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillStyle = colPinned ? alpha(INK, 0.5) : alpha(PAPER, 0.32);
  for (let x = 0; x < cols; x += READOUT_STEP) {
    const sx = originX + (x + 0.5) * tilePx;
    if (sx < size || sx > width - size) continue;
    ctx.fillText(numeral(x), sx, colY);
  }
  ctx.textAlign = rowPinned ? 'left' : 'right';
  ctx.fillStyle = rowPinned ? alpha(INK, 0.5) : alpha(PAPER, 0.32);
  for (let y = 0; y < rows; y += READOUT_STEP) {
    const sy = originY + (y + 0.5) * tilePx + size * 0.36;
    if (sy < size || sy > height) continue;
    ctx.fillText(numeral(y), rowX, sy);
  }
}

function post(paint: PostPaint): void {
  const { ctx, width, height, dpr, preview } = paint;
  drawReadout(paint);
  if (dpr !== stampDpr) {
    stampDpr = dpr;
    titleFont = `600 ${Math.round(11 * dpr)}px 'JetBrains Mono', ui-monospace, monospace`;
    refFont = `400 ${Math.round(8 * dpr)}px 'JetBrains Mono', ui-monospace, monospace`;
  }
  const inset = Math.round(9 * dpr) + 0.5;
  const arm = Math.round(7 * dpr);
  const right = width - inset;
  const bottom = height - inset;

  ctx.lineWidth = Math.max(1, dpr);
  ctx.strokeStyle = alpha(PAPER, 0.09);
  ctx.strokeRect(inset, inset, right - inset, bottom - inset);

  ctx.strokeStyle = alpha(PAPER, 0.34);
  ctx.beginPath();
  for (const [cx, cy] of [
    [inset, inset],
    [right, inset],
    [inset, bottom],
    [right, bottom],
  ] as const) {
    ctx.moveTo(cx - arm, cy);
    ctx.lineTo(cx + arm, cy);
    ctx.moveTo(cx, cy - arm);
    ctx.lineTo(cx, cy + arm);
  }
  ctx.stroke();

  if (!preview) return;
  const pad = Math.round(16 * dpr);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = titleFont;
  ctx.fillStyle = alpha(PAPER, 0.4);
  ctx.fillText(STAMP_TITLE, right - pad, bottom - pad - Math.round(12 * dpr));
  ctx.font = refFont;
  ctx.fillStyle = alpha(PAPER, 0.22);
  ctx.fillText(STAMP_REF, right - pad, bottom - pad);
}

// ---------------------------------------------------------------------------
// The instrument
// ---------------------------------------------------------------------------

/**
 * The 48-unit frame bot geometry is authored in. A local copy of `tiles.ts`'s `TILE_PX` rather
 * than an import of it, for the same reason `noise()` above is a copy of `cellHash`.
 */
const BOT_FRAME = 48;
/** Facing angles, indexed by `Dir`. North is up. */
const BOT_ANGLE = [-Math.PI / 2, 0, Math.PI / 2, Math.PI] as const;
/**
 * How far the second impression lands out of register, in frame units.
 *
 * This is the entirety of the bot's lift off the sheet. A drop shadow is a light effect and this
 * direction has no light in it; a two-colour press out of register is what actually produces a
 * doubled edge on paper, and it costs one extra fill.
 */
const REGISTER = 2.4;

/**
 * `String(n)` inside a draw path allocates once per label per frame. `sprites.ts` keeps the same
 * table for the same reason, and a direction cannot borrow it without importing `theme.ts` back
 * into the registry. Sized past the largest board, so the ruler comes out of it too.
 */
const NUMERALS: readonly string[] = Array.from({ length: 64 }, (_, i) => String(i));

function numeral(value: number): string {
  const n = value | 0;
  return (n >= 0 && n < NUMERALS.length ? NUMERALS[n] : String(n)) as string;
}

let labelPx = -1;
let labelFont = '';

/** Rebuilt on a zoom step, never on a frame. */
function labelFontAt(px: number): string {
  if (px !== labelPx) {
    labelPx = px;
    labelFont = `600 ${px}px 'JetBrains Mono', ui-monospace, monospace`;
  }
  return labelFont;
}

/** The silhouette: a square-nosed plate. A technical pen has no fillets, so neither does the bot. */
function plate(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(-18, -17);
  ctx.lineTo(11, -17);
  ctx.lineTo(19, 0);
  ctx.lineTo(11, 17);
  ctx.lineTo(-18, 17);
  ctx.closePath();
}

/**
 * The bot, as the sheet would carry it: one solid ink plate, plotted.
 *
 * It does not change shape at `botDetailTilePx` — it drops its interior and keeps the outline,
 * the accent bar and the paper window. Solid ink on a pale sheet is already the most findable
 * mark on the board at twelve pixels, and swapping to a chip would spend what the paper bought
 * on a problem the paper does not have. What the far form loses is the *working*: the
 * construction lines and the counted rungs, which say how rather than where.
 */
function drawBot(
  ctx: CanvasRenderingContext2D,
  pose: BotPose,
  tilePx: number,
  options: BotDrawOptions,
): void {
  const s = tilePx / BOT_FRAME;
  const cx = (pose.x + 0.5) * tilePx;
  const cy = (pose.y + 0.5) * tilePx;
  const dead = !pose.alive;
  const reduced = options.reduced;
  const detail = tilePx >= survey.metrics.botDetailTilePx * options.dpr;
  const accent = options.accent;
  const load = Math.min(1, options.carrying / 4);
  const shimmy = reduced ? 0 : Math.sin(pose.recoil * 30) * pose.recoil * 0.09;
  const wobble = reduced ? 0 : Math.sin(options.time * 6.5 + pose.id * 2.1) * load * 0.35;
  const angle = (BOT_ANGLE[pose.facing] ?? 0) + shimmy + wobble * 0.05 + (dead ? 0.35 : 0);
  const stretch = 1 + pose.stretch;

  ctx.save();
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';

  /*
   * The under-impression is offset in *sheet* space rather than in the bot's, because a press
   * that is out of register is out of register the same way everywhere on the sheet. Offsetting
   * it in the bot's frame would swing the lift round as the bot turned.
   */
  ctx.save();
  ctx.translate(cx + REGISTER * s, cy + REGISTER * s);
  ctx.rotate(angle);
  ctx.scale(stretch * s, s / stretch);
  ctx.fillStyle = alpha(INK, 0.2);
  plate(ctx);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.scale(stretch * s, s / stretch);

  ctx.fillStyle = dead ? alpha(INK, 0.34) : INK;
  plate(ctx);
  ctx.fill();

  if (detail) {
    /* The construction lines are left in. A drawing that has been worked on shows the working. */
    ctx.strokeStyle = alpha(PAPER, 0.42);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-18, -8.5);
    ctx.lineTo(14, -8.5);
    ctx.moveTo(-18, 8.5);
    ctx.lineTo(14, 8.5);
    ctx.moveTo(2, -17);
    ctx.lineTo(2, 17);
    ctx.stroke();

    /* Treads are counted rungs, not a texture: the drive is a quantity you can read off the plot. */
    const phase = (pose.travel * 6 + (reduced ? 0 : options.time * 3)) % 1;
    ctx.fillStyle = alpha(PAPER, 0.66);
    for (let i = 0; i < 5; i++) {
      const x = -17.5 + (((i + phase) % 5) / 5) * 34;
      ctx.fillRect(x, -16, 2.4, 4.4);
      ctx.fillRect(x, 11.6, 2.4, 4.4);
    }
  }

  /* The accent is a bar in a fixed place. A printed sheet has nothing to glow with. */
  ctx.fillStyle = dead ? alpha(INK, 0.45) : accent;
  ctx.fillRect(-16, -8, 5, 16);

  /*
   * The sensor window, kept in the far form as well. The nose wedge is four device pixels wide on
   * `w8-05`, and a paper square at the front of a solid ink body is what actually makes the plate
   * point somewhere at that size.
   */
  ctx.fillStyle = dead ? alpha(PAPER, 0.4) : PAPER;
  ctx.fillRect(7, -5, 10, 10);
  if (!dead) {
    ctx.fillStyle = accent;
    ctx.fillRect(10.4, -1.6, 3.2, 3.2);
  }

  if (options.carrying > 0 && !dead) {
    ctx.save();
    ctx.translate(0, wobble * 2.6);
    ctx.fillStyle = PAPER;
    ctx.fillRect(-6.5, -6.5, 13, 13);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.strokeRect(-6.5, -6.5, 13, 13);
    ctx.fillStyle = OXIDE;
    ctx.fillRect(-3.5, -3.5, 7, 7);
    ctx.restore();
  }

  /* The manipulator, ruled out towards the cell the action names. */
  if (pose.action > 0 && !dead) {
    const reach = Math.sin(Math.PI * pose.action) * 9;
    ctx.fillStyle = accent;
    ctx.fillRect(19, -1.2, reach + 2, 2.4);
    ctx.fillRect(19 + reach, -3.4, 3.4, 6.8);
  }

  ctx.restore();

  /* Selection is a drafting bracket set round the mark. */
  if (options.active && !dead) {
    const r = 25 * s;
    const arm = 9 * s;
    ctx.strokeStyle = alpha(INK, 0.7);
    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const sx = i & 1 ? 1 : -1;
      const sy = i & 2 ? 1 : -1;
      ctx.moveTo(cx + sx * r, cy + sy * (r - arm));
      ctx.lineTo(cx + sx * r, cy + sy * r);
      ctx.lineTo(cx + sx * (r - arm), cy + sy * r);
    }
    ctx.stroke();
  }

  if (pose.blocked > 0.02 || pose.recoil > 0.04) {
    drawBotBlocked(ctx, pose, cx, cy, s, reduced, options.showLabel ? 14 : 0);
  }

  if (pose.idle > 0 && pose.alive) {
    drawBotIdle(ctx, cx, cy, s, options.time, accent, reduced);
  }

  if (pose.failed && pose.blocked <= 0.02 && pose.alive) {
    drawBotFailed(ctx, cx, cy, s, Math.sin(Math.PI * Math.max(pose.action, 0.001)));
  }

  if (options.showFuel && pose.alive) {
    drawBotFuel(ctx, cx, cy, s, options.fuel);
  }

  if (options.showLabel && tilePx >= 20 * options.dpr) {
    const px = Math.max(9, Math.round(tilePx * 0.24));
    const label = numeral(pose.id);
    ctx.font = labelFontAt(px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(label).width + px * 0.8;
    const h = px * 1.3;
    const lx = cx - w / 2;
    const ly = cy - 25 * s - h / 2;
    ctx.fillStyle = PAPER;
    ctx.fillRect(lx, ly, w, h);
    ctx.strokeStyle = alpha(INK, 0.85);
    ctx.lineWidth = Math.max(1, s);
    ctx.strokeRect(lx, ly, w, h);
    ctx.fillStyle = INK;
    ctx.fillText(label, cx, ly + h / 2);
  }

  ctx.restore();
}

/**
 * DESIGN.md §11 A5: a blocked move must look nothing like a successful one.
 *
 * On this sheet the mark for "this did not go through" is a hard square bracket struck round the
 * plate and a chevron ruled against the face it hit — a correction, not a flash. An arc would be
 * the only unruled curve on the board and would read as a glow at the size it matters.
 */
function drawBotBlocked(
  ctx: CanvasRenderingContext2D,
  pose: BotPose,
  cx: number,
  cy: number,
  s: number,
  reduced: boolean,
  lift: number,
): void {
  const k = pose.blocked;
  ctx.save();
  ctx.translate(cx, cy);
  if (k > 0.02) {
    ctx.strokeStyle = alpha(RED, 0.95 * k);
    ctx.lineWidth = Math.max(1.5, 3 * s);
    ctx.strokeRect(-22 * s, -22 * s, 44 * s, 44 * s);
    ctx.save();
    ctx.rotate(BOT_ANGLE[pose.facing] ?? 0);
    ctx.lineWidth = Math.max(1.5, 4 * s);
    ctx.beginPath();
    ctx.moveTo(24 * s, -13 * s);
    ctx.lineTo(31 * s, 0);
    ctx.lineTo(24 * s, 13 * s);
    ctx.stroke();
    ctx.restore();
  }

  // The bang outlasts the impact by a beat and hops while the bot collects itself. A wall is
  // funnier than an error dialog, and this is the part that makes it one.
  const bang = Math.max(k, pose.recoil * 0.85);
  const hop = reduced ? 0 : Math.abs(Math.sin(pose.recoil * 9)) * pose.recoil * 4 * s;
  const by = (-34 - lift) * s - bang * 3 * s - hop;
  ctx.fillStyle = alpha(RED, bang);
  ctx.fillRect(-2 * s, by, 4 * s, 10 * s);
  ctx.fillRect(-2 * s, by + 13 * s, 4 * s, 4 * s);
  ctx.restore();
}

/** Three ticking squares over a waiting bot, on a slow cycle so a whole row is not a strobe. */
function drawBotIdle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  time: number,
  accent: string,
  reduced: boolean,
): void {
  const w = Math.max(1.5, 4 * s);
  const gap = 7 * s;
  const y = cy - 30 * s;
  for (let i = 0; i < 3; i++) {
    const phase = (time * 1.6 - i * 0.22) % 1;
    const lit = reduced || (phase > 0 && phase < 0.5) ? 1 : 0.25;
    ctx.fillStyle = alpha(accent, 0.35 + lit * 0.6);
    ctx.fillRect(cx + (i - 1) * gap - w / 2, y - w / 2, w, w);
  }
}

/** A failed non-move action: the same red, one notch quieter, struck through in two ruled lines. */
function drawBotFailed(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  strength: number,
): void {
  const r = 6 * s;
  const y = cy - 30 * s;
  ctx.strokeStyle = alpha(RED, 0.9 * Math.max(0, Math.min(1, strength)));
  ctx.lineWidth = Math.max(1.5, 2.4 * s);
  ctx.beginPath();
  ctx.moveTo(cx - r, y - r);
  ctx.lineTo(cx + r, y + r);
  ctx.moveTo(cx + r, y - r);
  ctx.lineTo(cx - r, y + r);
  ctx.stroke();
}

/** Fuel as a plotted bar rather than a ring: a quantity on a sheet is read off a scale. */
function drawBotFuel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  fuel: number,
): void {
  const level = Math.max(0, Math.min(1, fuel));
  const w = 32 * s;
  const h = Math.max(2, 5 * s);
  const x = cx - w / 2;
  const y = cy + 22 * s;
  ctx.fillStyle = alpha(PAPER, 0.8);
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = level > 0.3 ? alpha(INK, 0.88) : RED;
  ctx.fillRect(x, y, w * level, h);
  ctx.strokeStyle = alpha(INK, 0.9);
  ctx.lineWidth = Math.max(1, s);
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

// ---------------------------------------------------------------------------
// The legend: machines, crops and items, drawn as plan symbols
// ---------------------------------------------------------------------------

/**
 * A drafting department that draws everything up has a symbol legend, so the board has one too.
 *
 * A legend is not a set of little pictures. It is a set of *keyed outlines*: every entry is a
 * different silhouette first, and only then carries an internal diacritic saying which member of
 * the family it is. That ordering is the whole point. The outline is the part that survives to
 * `w8-05`, and `link`, `power` and `transmit` each address one machine by name — two kinds that
 * converge to the same blob do not cost prettiness, they turn the level into guesswork.
 *
 * Every symbol is authored in a unit frame of -1..1 on both axes and held as a flat table of
 * numbers, scaled about the cell centre at the call site. Flat tables because a symbol built from
 * object literals would allocate once per machine per frame, and there is no draw path in this
 * renderer allowed to do that.
 */

/**
 * Half-extent of a machine's symbol box, as a fraction of the tile.
 *
 * Two thirds of the cell, which leaves the outer sixth for the live rule and the facing tick and
 * still keeps a hatched neighbour's boundary line visible round the outside. Any larger and the
 * symbol starts to read as terrain.
 */
const MACHINE_BOX = 0.33;

/**
 * Below this the diacritic is dropped and the keyed outline carries the kind on its own.
 *
 * A diacritic occupies roughly half the symbol box, which is a third of a tile; at 22 device px
 * that is seven device pixels for a two-stroke mark, and under it the mark stops being a mark and
 * becomes a smudge laid over the outline that was already doing the work. The same trade
 * `HATCH_MIN_TILE_PX` makes for material, one layer up. It is affordable precisely because the
 * outlines were designed to differ from each other and not to be labels for what is inside them.
 */
const MACHINE_DETAIL_TILE_PX = 22;

/**
 * Below this the drill row loses its stems and the plot becomes a plotted quantity instead.
 *
 * Three stems span 0.68 of a tile, so their pitch is about `0.23 * tilePx`; under five device px
 * of pitch the three merge into one bar and the maturity ladder — the thing w2-02 is *played* on
 * — stops existing. 24 is the first rung that clears that with the heads still sitting on top.
 * Below it the crop is not the same mark shrunk, it is a different mark: a bar against a track,
 * and for ripe a solid block. Shrinking the near form is what would lose the level.
 */
const CROP_DETAIL_TILE_PX = 24;

/**
 * Below this the tag frame is dropped and the glyph takes the whole cell.
 *
 * The frame costs about a third of the tag in margin and rule. At 26 device px the glyph inside a
 * framed tag is under nine device pixels across — smaller than the frame around it — at which
 * point the frame is spending the pixels the identity needed.
 */
const ITEM_DETAIL_TILE_PX = 26;

/** Below this a stack count is set as a corner rule rather than as a numeral nobody can read. */
const COUNT_MIN_TILE_PX = 22;

/**
 * The ten silhouettes, closed, in the unit frame.
 *
 * Chosen so that no two share a bounding shape even before the diacritics arrive: a portrait leaf,
 * a plinth with a raised arm, a peaked kiln, a two-platen press, a triangle down, a triangle up, a
 * diamond, a mast on splayed legs, a cell with a terminal tab, and a hexagon. The two triangles
 * are the one deliberate near-pair, and they are near because they are opposites — a sink takes in
 * and a source gives out, and a reader who confuses them has still learnt the axis.
 */
const SYMBOL: Readonly<Record<string, readonly number[]>> = {
  door: [-0.52, -1, 0.52, -1, 0.52, 1, -0.52, 1],
  lever: [-0.95, 1, 0.95, 1, 0.95, 0.5, 0.72, 0.5, 0.98, -0.85, 0.62, -1, 0.3, 0.5, -0.95, 0.5],
  furnace: [-1, 1, 1, 1, 1, -0.2, 0, -1, -1, -0.2],
  press: [
    -1, -1, 1, -1, 1, -0.48, 0.3, -0.48, 0.3, 0.48, 1, 0.48, 1, 1, -1, 1, -1, 0.48, -0.3, 0.48,
    -0.3, -0.48, -1, -0.48,
  ],
  sink: [-1, -0.85, 1, -0.85, 0, 1],
  source: [-1, 0.85, 1, 0.85, 0, -1],
  node: [0, -1, 1, 0, 0, 1, -1, 0],
  antenna: [
    -0.14, -0.55, 0.14, -0.55, 0.14, 0.35, 0.95, 1, 0.5, 1, 0, 0.62, -0.5, 1, -0.95, 1, -0.14, 0.35,
  ],
  charger: [
    -0.7, -0.72, -0.26, -0.72, -0.26, -1, 0.26, -1, 0.26, -0.72, 0.7, -0.72, 0.7, 1, -0.7, 1,
  ],
  router: [-0.5, -1, 0.5, -1, 1, 0, 0.5, 1, -0.5, 1, -1, 0],
};

/** A kind the level authored but the legend has not been drawn for yet. Square, and obviously so. */
const SYMBOL_UNKEYED: readonly number[] = [-0.85, -0.85, 0.85, -0.85, 0.85, 0.85, -0.85, 0.85];

/**
 * The second-level mark inside each outline, as open rules: `x0, y0, x1, y1` per segment.
 *
 * These say what the machine *does*, in the same shorthand a plan uses — a grate for a firebox,
 * two facing chevrons for a ram, radiating waves for a mast, a switch matrix for a router. They
 * are the part that goes away first, which is why none of them is load-bearing for identity.
 */
const MARK: Readonly<Record<string, readonly number[]>> = {
  door: [-0.52, -0.4, 0.52, -0.4, -0.52, 0.4, 0.52, 0.4],
  lever: [-0.6, 0.75, 0.6, 0.75],
  furnace: [-0.7, 0.3, 0.7, 0.3, -0.35, 0.3, -0.35, 0.82, 0, 0.3, 0, 0.82, 0.35, 0.3, 0.35, 0.82],
  press: [-0.18, -0.28, 0, -0.06, 0, -0.06, 0.18, -0.28, -0.18, 0.28, 0, 0.06, 0, 0.06, 0.18, 0.28],
  sink: [-0.62, -0.5, 0.62, -0.5, -0.4, -0.32, 0, 0.42, 0, -0.32, 0, 0.42, 0.4, -0.32, 0, 0.42],
  source: [0, -0.4, -0.45, 0.5, 0, -0.4, 0, 0.52, 0, -0.4, 0.45, 0.5],
  node: [-0.52, 0, 0.52, 0, 0, -0.52, 0, 0.52],
  antenna: [
    -0.34, -1, -0.6, -0.72, -0.6, -0.72, -0.34, -0.44, 0.34, -1, 0.6, -0.72, 0.6, -0.72, 0.34,
    -0.44,
  ],
  charger: [0.2, -0.45, -0.18, 0.14, -0.18, 0.14, 0.18, 0.14, 0.18, 0.14, -0.16, 0.74],
  router: [
    -0.6, -0.28, 0.6, -0.28, -0.6, 0.28, 0.6, 0.28, -0.28, -0.6, -0.28, 0.6, 0.28, -0.6, 0.28, 0.6,
  ],
};

/**
 * The kinds whose diacritic sits *outside* the inked body.
 *
 * A mast's waves radiate off the mast — that is what makes it a mast and not a post — so they land
 * on paper in either state. Knocking them out in paper the way the inside marks are knocked out
 * would erase the antenna's one distinguishing mark at the moment it came on.
 */
const MARK_OUTSIDE: Readonly<Record<string, boolean>> = { antenna: true };

/** A single filled centre for the kinds whose diacritic needs a fixed point: `x, y, half`. */
const PIP: Readonly<Record<string, readonly number[]>> = {
  lever: [0.29, 0.5, 0.14],
  node: [0, 0, 0.17],
  source: [0, 0.3, 0.15],
};

/**
 * The kinds whose facing the level actually authors something through.
 *
 * A door has a side you walk in from, a press and a sink and a source have a throat, a router has
 * an outbound face. A furnace does not, and drawing a tick on one would be a claim the level does
 * not make.
 */
const FACED: Readonly<Record<string, boolean>> = {
  door: true,
  press: true,
  sink: true,
  source: true,
  router: true,
};

/** One closed outline from a flat unit-frame table, scaled about a point. */
function symbolPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  pts: readonly number[],
): void {
  ctx.beginPath();
  ctx.moveTo(cx + (pts[0] as number) * r, cy + (pts[1] as number) * r);
  for (let i = 2; i < pts.length; i += 2) {
    ctx.lineTo(cx + (pts[i] as number) * r, cy + (pts[i + 1] as number) * r);
  }
  ctx.closePath();
}

/** A family of open rules from a flat unit-frame table. Left open; the caller strokes it. */
function rulePath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  seg: readonly number[],
): void {
  ctx.beginPath();
  for (let i = 0; i + 3 < seg.length; i += 4) {
    ctx.moveTo(cx + (seg[i] as number) * r, cy + (seg[i + 1] as number) * r);
    ctx.lineTo(cx + (seg[i + 2] as number) * r, cy + (seg[i + 3] as number) * r);
  }
}

/**
 * One machine, as its entry in the legend.
 *
 * Two things carry `powered`, and neither of them is hue or motion. **Ink is matter**: a machine
 * that is running is inked solid and one that is not is left as paper inside a keyed outline, so
 * the state is a value inversion of the largest area on the symbol and survives to the smallest
 * rung the campaign asks for. The door inverts that, because for a door the body being drawn is
 * the leaf and not the housing — a shut door is a piece of wall and an open one is a gap, and
 * inking an open door solid would say the opposite of what it means. Alongside it, and identical
 * on all ten, a heavy blue-pencil rule is struck under the symbol: the run is live, in the one
 * colour this direction reserves for live. It reads as *present or absent* rather than as a hue,
 * which is what makes it survive a monochrome reading of the board.
 */
function drawMachine(paint: MachinePaint): void {
  const ctx = paint.ctx;
  const t = paint.tilePx;
  const kind = paint.kind;
  const powered = paint.powered;
  const cx = (paint.x + 0.5) * t;
  const cy = (paint.y + 0.5) * t;
  const r = t * MACHINE_BOX;
  const pts = SYMBOL[kind] ?? SYMBOL_UNKEYED;
  const weight = Math.max(1, t * 0.055);
  const solid = kind === 'door' ? !powered : powered;

  ctx.save();
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';

  /*
   * The same out-of-register second impression the bot gets, and for the same reason: a printed
   * sheet has no light on it, so the only way a symbol lifts off the hatching is a doubled edge.
   */
  const off = (REGISTER * t) / BOT_FRAME;
  symbolPath(ctx, cx + off, cy + off, r, pts);
  ctx.fillStyle = alpha(INK, 0.18);
  ctx.fill();

  symbolPath(ctx, cx, cy, r, pts);
  ctx.fillStyle = solid ? INK : PAPER;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = weight;
  ctx.stroke();

  if (t >= MACHINE_DETAIL_TILE_PX) {
    const marks = MARK[kind];
    if (marks) {
      ctx.strokeStyle =
        solid && MARK_OUTSIDE[kind] !== true ? alpha(PAPER, 0.88) : alpha(INK, 0.82);
      ctx.lineWidth = Math.max(1, weight * 0.6);
      rulePath(ctx, cx, cy, r, marks);
      ctx.stroke();
    }
    const pip = PIP[kind];
    if (pip) {
      const half = (pip[2] as number) * r;
      ctx.fillStyle = solid ? PAPER : INK;
      ctx.fillRect(
        cx + (pip[0] as number) * r - half,
        cy + (pip[1] as number) * r - half,
        half * 2,
        half * 2,
      );
    }
    if (paint.facing >= 0 && FACED[kind] === true) {
      const fx = STEP_X[paint.facing] ?? 0;
      const fy = STEP_Y[paint.facing] ?? 0;
      ctx.strokeStyle = alpha(INK, 0.85);
      ctx.lineWidth = Math.max(1, weight * 0.8);
      ctx.beginPath();
      ctx.moveTo(cx + fx * r * 1.05, cy + fy * r * 1.05);
      ctx.lineTo(cx + fx * r * 1.3, cy + fy * r * 1.3);
      ctx.stroke();
    }
  }

  if (powered) {
    const y = cy + r * 1.4;
    ctx.strokeStyle = PENCIL;
    ctx.lineWidth = Math.max(1.5, t * 0.07);
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.8, y);
    ctx.lineTo(cx + r * 0.8, y);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Stem height by maturity bucket, as a fraction of the tile. Bucket 0 has not broken ground yet,
 * so it is the drill row's own sown ticks and nothing above them.
 */
const CROP_STEM: readonly number[] = [0, 0.1, 0.17, 0.24, 0.3, 0.33];

/**
 * One crop tile: a plot symbol standing on a drill row, and its own maturity readout.
 *
 * The readout is the drawing. Stems rise, then put out leaves, then set heads — five rungs of
 * shape before any of them is inked in — and the sixth is the one the level is played on, so the
 * sixth is not a taller version of the fifth. Ripe is *signed off*: the heads go solid ink, the
 * drill row is re-ruled at three times the weight, an oxide rule is struck over the top of the
 * plot in the colour this direction reserves for what the order is asking of you, and the corner
 * of the cell carries a checked-off bracket. Four channels, only one of which is a colour.
 */
function drawCrop(paint: CropPaint): void {
  const ctx = paint.ctx;
  const t = paint.tilePx;
  const stage = paint.stage;
  const ripe = paint.ripe;
  const x0 = paint.x * t;
  const y0 = paint.y * t;
  const inset = t * 0.16;
  const left = x0 + inset;
  const right = x0 + t - inset;
  const row = y0 + t * 0.74;
  const hair = Math.max(1, t * 0.045);

  ctx.save();
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';

  if (t < CROP_DETAIL_TILE_PX) {
    drawCropFar(ctx, t, left, right, y0, row, stage, paint.stages, ripe, hair);
    ctx.restore();
    return;
  }

  ctx.strokeStyle = ripe ? INK : alpha(INK, 0.6);
  ctx.lineWidth = ripe ? Math.max(1.5, t * 0.055) : hair;
  ctx.beginPath();
  ctx.moveTo(left, row);
  ctx.lineTo(right, row);
  ctx.stroke();

  const pitch = (right - left) / 3;
  const height = (CROP_STEM[stage] ?? 0) * t;

  if (height <= 0) {
    /* Sown and nothing up yet: the row is struck three times where the drill went in. */
    ctx.strokeStyle = alpha(INK, 0.8);
    ctx.lineWidth = hair;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const sx = left + pitch * (i + 0.5);
      ctx.moveTo(sx, row - t * 0.05);
      ctx.lineTo(sx, row + t * 0.05);
    }
    ctx.stroke();
  } else {
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, t * 0.045);
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const sx = left + pitch * (i + 0.5);
      ctx.moveTo(sx, row);
      ctx.lineTo(sx, row - height * (i === 1 ? 1 : 0.82));
    }
    ctx.stroke();

    if (stage >= 2) {
      ctx.lineWidth = Math.max(1, t * 0.032);
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        if (stage < 3 && i !== 1) continue;
        const sx = left + pitch * (i + 0.5);
        const ly = row - height * (i === 1 ? 1 : 0.82) * 0.55;
        ctx.moveTo(sx, ly);
        ctx.lineTo(sx - t * 0.07, ly - t * 0.05);
        ctx.moveTo(sx, ly);
        ctx.lineTo(sx + t * 0.07, ly - t * 0.05);
      }
      ctx.stroke();
    }

    if (stage >= 4) {
      const head = t * (ripe ? 0.11 : 0.08);
      for (let i = 0; i < 3; i++) {
        const sx = left + pitch * (i + 0.5);
        const hy = row - height * (i === 1 ? 1 : 0.82) - head * 0.5;
        if (ripe) {
          ctx.fillStyle = INK;
          ctx.fillRect(sx - head * 0.5, hy - head * 0.5, head, head);
        } else {
          ctx.fillStyle = PAPER;
          ctx.fillRect(sx - head * 0.5, hy - head * 0.5, head, head);
          ctx.strokeStyle = INK;
          ctx.lineWidth = hair;
          ctx.strokeRect(sx - head * 0.5, hy - head * 0.5, head, head);
        }
      }
    }
  }

  if (ripe) {
    const capY = y0 + t * 0.2;
    ctx.strokeStyle = OXIDE;
    ctx.lineWidth = Math.max(1.5, t * 0.055);
    ctx.beginPath();
    ctx.moveTo(left, capY);
    ctx.lineTo(right, capY);
    ctx.stroke();

    /* The corner a signed-off sheet carries: a bracket, struck through. */
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(1, t * 0.04);
    ctx.beginPath();
    ctx.moveTo(right - t * 0.16, y0 + t * 0.05);
    ctx.lineTo(right, y0 + t * 0.05);
    ctx.lineTo(right, y0 + t * 0.17);
    ctx.moveTo(right - t * 0.14, y0 + t * 0.15);
    ctx.lineTo(right + t * 0.02, y0 + t * 0.02);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * The far form, which is a different mark rather than the near one shrunk.
 *
 * At eight CSS pixels a stem is one pixel and a head is one pixel and the whole ladder is a single
 * grey smudge, so maturity is plotted instead of grown: a bar against its track, which is how a
 * drafting sheet states a quantity anyway. Ripe abandons the scale entirely and becomes a solid
 * block with the sign-off corner bitten out of it — one filled area against five outlined ones is
 * the largest difference available at this size, and it is the one w2-02 is decided by.
 */
function drawCropFar(
  ctx: CanvasRenderingContext2D,
  t: number,
  left: number,
  right: number,
  y0: number,
  row: number,
  stage: number,
  stages: number,
  ripe: boolean,
  hair: number,
): void {
  const capY = y0 + t * 0.26;
  if (ripe) {
    ctx.fillStyle = INK;
    ctx.fillRect(left, capY, right - left, row - capY);
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.moveTo(right, capY);
    ctx.lineTo(right, capY + t * 0.17);
    ctx.lineTo(right - t * 0.17, capY);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OXIDE;
    ctx.lineWidth = Math.max(1.5, t * 0.07);
    ctx.beginPath();
    ctx.moveTo(left, row + t * 0.07);
    ctx.lineTo(right, row + t * 0.07);
    ctx.stroke();
    return;
  }
  const barH = Math.max(2, t * 0.18);
  const barY = row - barH;
  ctx.strokeStyle = alpha(INK, 0.5);
  ctx.lineWidth = hair;
  ctx.strokeRect(left + hair * 0.5, barY + hair * 0.5, right - left - hair, barH - hair);
  ctx.fillStyle = alpha(INK, 0.85);
  ctx.fillRect(left, barY, ((right - left) * (stage + 1)) / stages, barH);
}

/** Half-extent of an item's tag, as a fraction of the tile. */
const ITEM_BOX = 0.44;

/**
 * The tag every item hangs on: a rectangle with the top-left corner keyed off.
 *
 * The key is not decoration. It is what tells a reader that the mark inside is an *entry in a
 * legend* rather than a thing standing on the ground, which is the distinction between an item
 * lying in a cell and the machine symbol next to it.
 */
const ITEM_TAG: readonly number[] = [-0.4, -0.5, 0.62, -0.5, 0.62, 0.5, -0.62, 0.5, -0.62, -0.28];

/** Loose grains, as `x, y, half` triples in the glyph's own unit frame. */
const GRAINS: readonly number[] = [
  -0.62, 0.4, 0.3, 0.05, -0.15, 0.4, 0.62, 0.5, 0.26, -0.2, 0.78, 0.22,
];
const STONE_GLYPH: readonly number[] = [
  -0.9, 0.6, -0.55, -0.55, 0.45, -0.85, 0.95, 0.15, 0.55, 0.85,
];
const ORE_GLYPH: readonly number[] = [0, -0.95, 0.85, 0, 0, 0.95, -0.85, 0];
const ICE_RULES: readonly number[] = [
  -0.95, 0, 0.95, 0, -0.48, -0.82, 0.48, 0.82, -0.48, 0.82, 0.48, -0.82,
];
const SCRAP_RULES: readonly number[] = [
  -0.9, -0.62, 0.55, -0.62, 0.55, -0.62, -0.55, 0.62, -0.55, 0.62, 0.9, 0.62,
];
const CRATE_RULES: readonly number[] = [-0.85, -0.72, 0.85, 0.72, 0.85, -0.72, -0.85, 0.72];
const PART_RULES: readonly number[] = [
  -0.62, -0.85, -0.62, 0.85, 0.62, -0.85, 0.62, 0.85, -0.62, 0, 0.62, 0,
];
const CHIP_LEGS: readonly number[] = [
  -0.62, -0.38, -1, -0.38, -0.62, 0, -1, 0, -0.62, 0.38, -1, 0.38, 0.62, -0.38, 1, -0.38, 0.62, 0,
  1, 0, 0.62, 0.38, 1, 0.38,
];

/**
 * The eleven glyphs, keyed by what the thing *is* rather than by what colour the atlas gave it.
 *
 * Four of the eleven differ only by hue on the shared atlas, which is a distinction that does not
 * exist on a sheet printed in one ink. So they are separated by construction instead: loose grains
 * against a solid block against a lozenge with its centre cleared — the same shorthand the terrain
 * layer already uses for regolith, rock and ore, so a player who has read the ground has already
 * been taught this alphabet.
 */
function drawItemGlyph(
  ctx: CanvasRenderingContext2D,
  kind: string,
  cx: number,
  cy: number,
  g: number,
  weight: number,
): void {
  ctx.lineWidth = weight;
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  switch (kind) {
    case 'regolith':
      for (let i = 0; i + 2 < GRAINS.length; i += 3) {
        const half = (GRAINS[i + 2] as number) * g;
        ctx.fillRect(
          cx + (GRAINS[i] as number) * g - half,
          cy + (GRAINS[i + 1] as number) * g - half,
          half * 2,
          half * 2,
        );
      }
      return;
    case 'stone':
      symbolPath(ctx, cx, cy, g, STONE_GLYPH);
      ctx.fill();
      return;
    case 'ore':
      symbolPath(ctx, cx, cy, g, ORE_GLYPH);
      ctx.fill();
      ctx.fillStyle = PAPER;
      ctx.fillRect(cx - g * 0.26, cy - g * 0.26, g * 0.52, g * 0.52);
      return;
    case 'ice':
      rulePath(ctx, cx, cy, g, ICE_RULES);
      ctx.stroke();
      return;
    case 'scrap':
      rulePath(ctx, cx, cy, g, SCRAP_RULES);
      ctx.stroke();
      return;
    case 'seed':
      ctx.fillRect(cx - g * 0.3, cy - g * 0.72, g * 0.6, g * 0.6);
      ctx.beginPath();
      ctx.moveTo(cx, cy + g * 0.02);
      ctx.lineTo(cx, cy + g * 0.9);
      ctx.stroke();
      return;
    case 'crop':
      ctx.beginPath();
      ctx.moveTo(cx, cy - g * 0.2);
      ctx.lineTo(cx, cy + g * 0.9);
      ctx.moveTo(cx, cy + g * 0.35);
      ctx.lineTo(cx - g * 0.55, cy + g * 0.05);
      ctx.moveTo(cx, cy + g * 0.35);
      ctx.lineTo(cx + g * 0.55, cy + g * 0.05);
      ctx.stroke();
      ctx.fillStyle = OXIDE;
      ctx.fillRect(cx - g * 0.36, cy - g * 0.92, g * 0.72, g * 0.72);
      return;
    case 'crate':
      ctx.strokeRect(cx - g * 0.85, cy - g * 0.72, g * 1.7, g * 1.44);
      rulePath(ctx, cx, cy, g, CRATE_RULES);
      ctx.stroke();
      return;
    case 'part':
      rulePath(ctx, cx, cy, g, PART_RULES);
      ctx.stroke();
      return;
    case 'cell':
      ctx.fillRect(cx - g * 0.24, cy - g * 0.98, g * 0.48, g * 0.26);
      ctx.strokeRect(cx - g * 0.52, cy - g * 0.72, g * 1.04, g * 1.6);
      ctx.fillStyle = PENCIL;
      ctx.fillRect(cx - g * 0.32, cy - g * 0.06, g * 0.64, g * 0.78);
      return;
    case 'chip':
      ctx.fillRect(cx - g * 0.6, cy - g * 0.6, g * 1.2, g * 1.2);
      rulePath(ctx, cx, cy, g, CHIP_LEGS);
      ctx.stroke();
      return;
    default:
      /* An item kind the legend has not been drawn for: an empty tag, struck, so it is obvious. */
      ctx.strokeRect(cx - g * 0.7, cy - g * 0.7, g * 1.4, g * 1.4);
      ctx.beginPath();
      ctx.moveTo(cx - g * 0.7, cy + g * 0.7);
      ctx.lineTo(cx + g * 0.7, cy - g * 0.7);
      ctx.stroke();
      return;
  }
}

/**
 * One ground stack, as a keyed tag lying on the sheet.
 *
 * It owns the whole mark, which on the default path is a soft radial shadow, a bob and a numbered
 * pip. There is no shadow here because there is no light here — the lift is the out-of-register
 * second impression the bot and the machines already use — and the count is set in type where
 * there is room for type and as a corner rule where there is not, rather than as a numeral that
 * degrades into two grey pixels and says nothing at all.
 */
function drawItem(paint: ItemPaint): void {
  const ctx = paint.ctx;
  const t = paint.tilePx;
  const x0 = paint.x * t;
  const y0 = paint.y * t;
  const cx = x0 + t * 0.5;
  /* Phased per cell rather than globally, so a row of stacks is a scatter and not a wave. */
  const bob = paint.reduced
    ? 0
    : Math.sin(paint.time * 2.2 + paint.x * 1.7 + paint.y * 2.9) * t * 0.018;
  const cy = y0 + t * 0.5 + bob;
  const detail = t >= ITEM_DETAIL_TILE_PX;
  const r = t * ITEM_BOX;
  const weight = Math.max(1, t * 0.04);

  ctx.save();
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';

  if (detail) {
    const off = (REGISTER * t) / BOT_FRAME;
    symbolPath(ctx, cx + off, cy + off, r, ITEM_TAG);
    ctx.fillStyle = alpha(INK, 0.16);
    ctx.fill();
    symbolPath(ctx, cx, cy, r, ITEM_TAG);
    ctx.fillStyle = PAPER;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = weight;
    ctx.stroke();
    /* The punch the tag would hang by. It is also what keeps the tag from reading as a crate. */
    ctx.fillStyle = alpha(INK, 0.7);
    ctx.fillRect(cx - r * 0.5, cy - r * 0.36, r * 0.12, r * 0.12);
  }

  drawItemGlyph(ctx, paint.kind, cx, cy, detail ? t * 0.15 : t * 0.24, weight);

  if (paint.count > 1) {
    if (t >= COUNT_MIN_TILE_PX) {
      const px = Math.max(8, Math.round(t * 0.26));
      const label = numeral(paint.count);
      ctx.font = labelFontAt(px);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const w = ctx.measureText(label).width + px * 0.55;
      const h = px * 1.15;
      const bx = x0 + t - w * 0.85;
      const by = y0 + t - h * 0.95;
      ctx.fillStyle = PAPER;
      ctx.fillRect(bx, by, w, h);
      ctx.strokeStyle = INK;
      ctx.lineWidth = weight;
      ctx.strokeRect(bx, by, w, h);
      ctx.fillStyle = INK;
      ctx.fillText(label, bx + w * 0.5, by + h * 0.5);
    } else {
      /* More than one, said as a stack of rules in the corner: countable to three, then just many. */
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1, t * 0.06);
      ctx.beginPath();
      const n = Math.min(3, paint.count - 1);
      for (let i = 0; i < n; i++) {
        const y = y0 + t * 0.9 - i * t * 0.13;
        ctx.moveTo(x0 + t * 0.62, y);
        ctx.lineTo(x0 + t * 0.92, y);
      }
      ctx.stroke();
    }
  }

  ctx.restore();
}

export const survey: ArtDirection = {
  id: 'survey',
  label: 'Survey',

  /*
   * Chrome is the drafting table the sheet lies on: a warm dark neutral, deliberately not the
   * cool navy, so paper and chrome share a hue family and read as one artefact rather than as a
   * canvas pasted into a dashboard (AUDIT-UI's "the canvas does not join them").
   */
  palette: {
    bgVoid: TABLE,
    bgPanel: '#1b1e19',
    bgRaised: '#272b24',
    ink: '#ece7d8',
    /*
     * 5.4:1 on `bgRaised`, 7.1:1 on `bgPanel`, 8.0:1 on `bgVoid`. The audit found the shipped
     * `--ink-dim` failing AA on all three surfaces across 111 uses; no direction out of this
     * spike repeats that.
     */
    inkDim: '#a3a08c',
    /* Blue pencil for what is live, orange oxide for what you are being asked to do. */
    accent: PENCIL,
    accent2: OXIDE,
    danger: RED,
    ok: '#4f7d33',
    gold: '#b98b1e',
    silver: '#8a8f92',
    bronze: '#9c5f30',
  },

  /* The bot is an instrument plotted on the sheet: ink body, paper highlight, one accent. */
  bot: {
    hullDark: '#171a1c',
    hull: '#2c3134',
    hullLight: '#4a5054',
    rim: '#d8d2c2',
    glass: '#0f1113',
    tread: '#171a1c',
    shadow: 'rgba(23, 26, 28, 0.28)',
  },

  fxColors: {
    dust: '#8d8674',
    spark: OXIDE,
    chip: '#5b5f52',
    pulse: PENCIL,
    power: OXIDE,
    bad: RED,
    good: '#4f7d33',
  },

  /*
   * A real drafting grid: the minor rule is a full CSS pixel rather than the shipped half-pixel
   * hairline, and the major every-fifth rule is heavier again, so the board can be *counted*.
   */
  overlay: {
    grid: alpha(INK, 0.16),
    gridMajor: alpha(INK, 0.42),
    goal: OXIDE,
    hover: PENCIL,
    vignette: TABLE,
    outOfBounds: TABLE,
  },

  metrics: {
    gridWidth: 1,
    gridMajorWidth: 1.5,
    gridMinTilePx: 7,
    outlineWidth: 2,
    botDetailTilePx: 20,
  },

  botAccents: [
    '#b3251d',
    '#3d8fb8',
    '#c8631e',
    '#4f7d33',
    '#6b4c9a',
    '#a8195f',
    '#1f6f6a',
    '#8a6d1f',
    '#2f5fa8',
    '#a33d1f',
    '#3f7a4a',
    '#7a2f6b',
  ],

  /* On paper the cold end is still a darkening — a pencil scuff before it becomes a red mark. */
  trail: { cold: '#4a4436', hot: RED, minAlpha: 0.22, maxAlpha: 0.46 },
  referenceFloor: PAPER,

  paintTerrain,
  drawBot,
  drawMachine,
  drawCrop,
  drawItem,
  backdrop,
  post,
};
