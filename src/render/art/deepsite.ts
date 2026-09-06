/**
 * DEEP SITE — the board is a lit place, seen from above.
 *
 * The bet: stop drawing a diagram of the site and draw the site. This is the Factorio and Opus
 * Magnum argument — those screenshots stop a scroller because the simulation looks like somewhere
 * that exists, with material and a light in it, not because the UI around it is tidy.
 *
 * One key light from the north-west, fixed for the whole game so the shading is a language rather
 * than an effect: every solid gets a lit top edge, a dark south face and a cast shadow, and every
 * floor gets dithered ambient occlusion where it meets one. Rock is drawn as rock — chipped
 * silhouette, facet shading, a warm oxide in the cracks. Equipment is drawn as equipment, with a
 * housing, a vent and a stencilled panel, so a depot is recognisable from across a 48x40 board.
 *
 * Mark-making language: chunky dithered pixel work on a fixed 4-step ramp per material, hard
 * edges, no anti-aliased gradients. The dither is what keeps it readable when the tile drops to
 * 24px on `w8-05` — a two-tone checker survives downsampling where a smooth gradient turns to mud.
 *
 * The cost, stated plainly: this is the direction most able to bury the grid and the trail under
 * its own texture, and it is the one that needs the most discipline about value range. The floor
 * is deliberately held in a narrow mid band so both stay on top of it.
 */
import { Terrain } from '../../engine/index.ts';
import type { Tile } from '../../engine/index.ts';
import { alpha, mix, shade } from './color.ts';
import type {
  ArtDirection,
  BackdropPaint,
  BotDrawOptions,
  PostPaint,
  TerrainPaint,
} from './types.ts';
import type { BotPose } from '../timeline.ts';
import type { Biome } from '../tiles.ts';

/** Lit floor plate. Everything else is keyed off this value. */
export const FLOOR = '#4c5661';

type Ctx = CanvasRenderingContext2D;

const PALETTE = {
  bgVoid: '#070a0c',
  bgPanel: '#0f1418',
  bgRaised: '#1a2228',
  ink: '#e2ebef',
  /* 5.1:1 on `bgRaised`, 6.9:1 on `bgPanel`. */
  inkDim: '#93a7b2',
  accent: '#3fd6c0',
  accent2: '#ffab3d',
  danger: '#ff6152',
  ok: '#84dd6e',
  gold: '#ffd166',
  silver: '#c6d0dc',
  bronze: '#cd8b52',
} as const;

// ---------------------------------------------------------------------------
// Mark-making primitives
// ---------------------------------------------------------------------------

/**
 * Ordered 4x4 Bayer thresholds, the whole texture system in sixteen numbers.
 *
 * Every value transition in this direction is a two-tone dither against this matrix rather than a
 * gradient. That is not nostalgia: the terrain cache is downsampled to as little as 24 device px
 * per tile on `w8-05`, and a checker at that scale resolves into an honest mid-tone while a smooth
 * ramp resolves into mud with a seam at every tile edge.
 */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/** Fills `w x h` with `color` at `coverage`, in blocks of `cell`. `phase` shifts the matrix. */
function dither(
  c: Ctx,
  x0: number,
  y0: number,
  w: number,
  h: number,
  cell: number,
  color: string,
  coverage: number,
  phase: number,
): void {
  if (w <= 0 || h <= 0) return;
  const level = Math.round(coverage * 16);
  if (level <= 0) return;
  c.fillStyle = color;
  if (level >= 16) {
    c.fillRect(x0, y0, w, h);
    return;
  }
  const cols = Math.ceil(w / cell);
  const rows = Math.ceil(h / cell);
  const px = phase & 3;
  const py = (phase * 3) & 3;
  for (let j = 0; j < rows; j++) {
    const row = ((j + py) & 3) * 4;
    const y = y0 + j * cell;
    const ch = Math.min(cell, y0 + h - y);
    for (let i = 0; i < cols; i++) {
      if ((BAYER[row + ((i + px) & 3)] as number) >= level) continue;
      const x = x0 + i * cell;
      c.fillRect(x, y, Math.min(cell, x0 + w - x), ch);
    }
  }
}

/**
 * A stepped line, drawn as a run of square blocks.
 *
 * `lineTo` would antialias, and one soft diagonal in a field of hard dither is the single mark
 * that gives away that the pixel work is a filter rather than a decision.
 */
function stepLine(
  c: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  color: string,
): void {
  c.fillStyle = color;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const span = Math.max(Math.abs(dx), Math.abs(dy));
  const steps = Math.max(1, Math.ceil(span / w));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    c.fillRect(Math.round(x0 + dx * t), Math.round(y0 + dy * t), w, w);
  }
}

/** Stencilled hazard stripes, stepped rather than rotated for the same reason as `stepLine`. */
function hazard(
  c: Ctx,
  x0: number,
  y0: number,
  w: number,
  h: number,
  cell: number,
  color: string,
  period: number,
): void {
  c.fillStyle = color;
  const rows = Math.ceil(h / cell);
  for (let j = 0; j < rows; j++) {
    const y = y0 + j * cell;
    const ch = Math.min(cell, y0 + h - y);
    const shift = (j * cell) % (period * 2);
    for (let x = shift - period * 2; x < w; x += period * 2) {
      const sx = Math.max(x0, x0 + x);
      const ex = Math.min(x0 + w, x0 + x + period);
      if (ex > sx) c.fillRect(sx, y, ex - sx, ch);
    }
  }
}

/**
 * Deterministic per-cell hash.
 *
 * Deterministic is not a preference here: the terrain cache is rebuilt on every zoom step and
 * every `tileChange`, and a field of regolith that reshuffles itself when the player scrolls is
 * worse than a field that tiles.
 */
function hash(x: number, y: number, salt: number): number {
  let h = Math.imul(x + 0x1f1f, 374761393) ^ Math.imul(y + 0x9e37, 668265263);
  h = Math.imul(h ^ Math.imul(salt + 1, 2246822519), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

interface Ramp {
  deep: string;
  dark: string;
  mid: string;
  lit: string;
}

function ramp(base: string, spread: number): Ramp {
  return {
    deep: shade(base, 1 - spread * 2),
    dark: shade(base, 1 - spread),
    mid: base,
    lit: shade(base, 1 + spread * 0.85),
  };
}

/**
 * How wide a *floor* is allowed to swing.
 *
 * This number is the price of admission for the whole direction. The grid draws at 14% alpha and
 * the trail's cold end at 20%, and both are whole-tile-scale marks; if the floor's own texture
 * swings as far as they do, they stop being marks and become more texture. 0.09 keeps a floor
 * inside roughly ±0.012 of relative luminance around its mid, which is a third of what the grid
 * moves it and a third of what the trail's first step moves it.
 */
const FLOOR_SPREAD = 0.09;
/** Solids are not competing with the trail — nothing walkable is ever drawn as one. */
const SOLID_SPREAD = 0.24;

type FloorKind = 'plate' | 'grain' | 'stone' | 'ice';

interface Site {
  /** Held near `FLOOR`'s luminance in every biome. Biomes differ by hue and material, not value. */
  floor: string;
  floorKind: FloorKind;
  wall: string;
  wallKind: 'panel' | 'stone';
  /** Warm oxide, the colour that sits in cracks and settles on plate. */
  grit: string;
  /** How much of it has settled here, 0..1. */
  dust: number;
}

/*
 * Eight zones, one light. The shipped biome table dims whole worlds by up to 0.45 to sell a cave,
 * which is exactly the move this direction cannot make: a floor dimmed to 55% is a floor the
 * trail's cold end no longer separates from. So the darkness moves into the *walls* and the void,
 * where nothing has to stay legible on top of it, and the floors stay inside one narrow band.
 */
const SITES: Readonly<Record<Biome, Site>> = {
  hangar: {
    floor: '#525a62',
    floorKind: 'plate',
    wall: '#2e363d',
    wallKind: 'panel',
    grit: '#7a6248',
    dust: 0.55,
  },
  regolith: {
    floor: '#5a5348',
    floorKind: 'grain',
    wall: '#3b342c',
    wallKind: 'stone',
    grit: '#8a6f4e',
    dust: 0.7,
  },
  yard: {
    floor: '#565c5e',
    floorKind: 'plate',
    wall: '#31383a',
    wallKind: 'panel',
    grit: '#7d6a52',
    dust: 0.45,
  },
  cave: {
    floor: '#4a5560',
    floorKind: 'stone',
    wall: '#1c252d',
    wallKind: 'stone',
    grit: '#7c5a3f',
    dust: 0.35,
  },
  grid: {
    floor: '#4c5866',
    floorKind: 'plate',
    wall: '#28313d',
    wallKind: 'panel',
    grit: '#6f6552',
    dust: 0.3,
  },
  signal: {
    floor: '#4e5862',
    floorKind: 'ice',
    wall: '#293239',
    wallKind: 'stone',
    grit: '#6d7d8a',
    dust: 0.25,
  },
  swarm: {
    floor: '#545a5c',
    floorKind: 'plate',
    wall: '#2b3132',
    wallKind: 'panel',
    grit: '#7a6a55',
    dust: 0.5,
  },
  finale: {
    floor: '#4f5a66',
    floorKind: 'plate',
    wall: '#2b3743',
    wallKind: 'panel',
    grit: '#8a6a44',
    dust: 0.35,
  },
};

// ---------------------------------------------------------------------------
// The stamp sheet
// ---------------------------------------------------------------------------

/**
 * Every material is pre-rendered once into a sheet and then blitted per tile.
 *
 * A 48x40 board is 1920 tiles and the dither is a few hundred `fillRect`s per tile face, so
 * painting each tile directly would be six figures of draw calls per rebuild. Painting 13
 * materials times four variants once and blitting is two orders of magnitude cheaper, and it is
 * also what forces the variants to be a *fixed small set* rather than per-tile noise.
 */
const ROW = {
  floor: 0,
  loose: 1,
  soil: 2,
  ice: 3,
  stone: 4,
  ore: 5,
  rubble: 6,
  wall: 7,
  outside: 8,
  pit: 9,
  pad: 10,
  depot: 11,
  conveyor: 12,
  litN: 13,
  litW: 14,
  darkS: 15,
  darkE: 16,
  castN: 17,
  castW: 18,
  castNW: 19,
  aoS: 20,
  aoE: 21,
} as const;
const SHEET_ROWS = 22;
const SHEET_COLS = 4;

let sheetKey = '';
let sheet: HTMLCanvasElement | null = null;

function paintPlate(c: Ctx, T: number, col: number, r: Ramp, site: Site): void {
  const g = Math.max(1, Math.round(T / 12));
  c.fillStyle = r.mid;
  c.fillRect(0, 0, T, T);
  dither(c, 0, 0, T, T, g, r.dark, 0.26, col);
  dither(c, 0, 0, T, T, g, r.lit, 0.14, col + 1);

  /*
   * Plate seams land on the tile boundary on a three-tile module, so they read *with* the grid
   * rather than against it — a scored joint every third line makes the board easier to count, not
   * harder, and a rhythm of three never lines up with the five-tile major grid.
   */
  const w = Math.max(1, Math.round(T * 0.045));
  const lip = Math.max(1, w >> 1);
  if ((col & 1) === 1) {
    c.fillStyle = r.deep;
    c.fillRect(0, 0, w, T);
    c.fillStyle = r.lit;
    c.fillRect(w, 0, lip, T);
  }
  if ((col & 2) === 2) {
    c.fillStyle = r.deep;
    c.fillRect(0, 0, T, w);
    c.fillStyle = r.lit;
    c.fillRect(0, w, T, lip);
  }
  if (col === 3) {
    const rr = Math.max(1, Math.round(T * 0.08));
    const at = w * 2;
    c.fillStyle = r.deep;
    c.fillRect(at, at, rr, rr);
    c.fillStyle = r.lit;
    c.fillRect(at, at, Math.max(1, rr >> 1), Math.max(1, rr >> 1));
  }
  if (site.dust > 0) dither(c, 0, 0, T, T, g, alpha(site.grit, 0.45), site.dust * 0.16, col + 2);
}

function paintGrain(c: Ctx, T: number, col: number, r: Ramp, site: Site, dustScale: number): void {
  const f = Math.max(1, Math.round(T / 16));
  c.fillStyle = r.mid;
  c.fillRect(0, 0, T, T);
  dither(c, 0, 0, T, T, f, r.dark, 0.38, col);
  dither(c, 0, 0, T, T, f, r.lit, 0.2, col + 2);
  dither(c, 0, 0, T, T, f * 2, r.deep, 0.1, col + 1);

  // A pebble is a dark body with a lit north-west shoulder: the key light at its smallest
  // readable size, and the thing that stops granular ground reading as television snow.
  const p = Math.max(1, Math.round(T * 0.09));
  for (let i = 0; i < 4; i++) {
    const x = Math.round(hash(col, i, 11) * (T - p));
    const y = Math.round(hash(col, i, 23) * (T - p));
    c.fillStyle = r.deep;
    c.fillRect(x, y, p, p);
    c.fillStyle = r.lit;
    c.fillRect(x, y, Math.max(1, p >> 1), Math.max(1, p >> 1));
  }
  if (site.dust > 0) {
    dither(c, 0, 0, T, T, f, alpha(site.grit, 0.4), site.dust * dustScale, col + 3);
  }
}

function paintSoil(c: Ctx, T: number, col: number, r: Ramp, site: Site): void {
  paintGrain(c, T, col, r, site, 0.14);
  // Furrows. Tilled ground is the one floor with a manufactured rhythm in it, and four hard
  // horizontal lines say "planted here" before any crop has grown.
  const step = Math.max(2, Math.round(T / 4));
  const w = Math.max(1, Math.round(T * 0.045));
  for (let y = step >> 1; y < T; y += step) {
    c.fillStyle = r.deep;
    c.fillRect(0, y, T, w);
    c.fillStyle = r.lit;
    c.fillRect(0, y + w, T, Math.max(1, w >> 1));
  }
}

function paintStone(c: Ctx, T: number, col: number, r: Ramp, site: Site, crack: number): void {
  const g = Math.max(1, Math.round(T / 12));
  c.fillStyle = r.mid;
  c.fillRect(0, 0, T, T);
  const tones = [r.dark, r.lit, r.deep];
  for (let i = 0; i < 3; i++) {
    const x = Math.round(hash(col, i, 3) * T * 0.66);
    const y = Math.round(hash(col, i, 7) * T * 0.66);
    const w = Math.max(2, Math.round((0.24 + hash(col, i, 13) * 0.38) * T));
    const h = Math.max(2, Math.round((0.24 + hash(col, i, 17) * 0.38) * T));
    dither(c, x, y, Math.min(w, T - x), Math.min(h, T - y), g, tones[i] as string, 0.72, col + i);
  }
  dither(c, 0, 0, T, T, g, r.dark, 0.16, col + 1);
  if ((col & 1) === 1) {
    const w = Math.max(1, Math.round(T * 0.05));
    const x = Math.round(hash(col, 0, 29) * (T - w));
    stepLine(c, x, 0, x + Math.round(T * 0.2), Math.round(T * 0.62), w, alpha(site.grit, crack));
    stepLine(c, x, 0, x + Math.round(T * 0.2), Math.round(T * 0.62), Math.max(1, w >> 1), r.deep);
  }
}

function paintIce(c: Ctx, T: number, col: number, r: Ramp): void {
  const g = Math.max(1, Math.round(T / 10));
  c.fillStyle = r.mid;
  c.fillRect(0, 0, T, T);
  dither(c, 0, 0, T, T, g, r.lit, 0.24, col);
  dither(c, 0, 0, T, T, g * 2, r.dark, 0.2, col + 2);
  /*
   * Long straight internal fractures. With colour removed this is the only thing separating ice
   * from every other granular surface, so they run the full tile and join across tiles by luck.
   * The bright one is held to a quarter alpha on purpose — a near-white hairline on a *floor* is
   * the one mark in this direction that could be mistaken for a grid line.
   */
  const w = Math.max(1, Math.round(T * 0.045));
  for (let i = 0; i < 2; i++) {
    const a = Math.round(hash(col, i, 41) * T);
    const b = Math.round(hash(col, i, 43) * T);
    stepLine(c, 0, a, T, b, w, i === 0 ? alpha('#dff0f7', 0.24) : alpha(r.deep, 0.7));
  }
}

function paintRock(c: Ctx, T: number, col: number, r: Ramp, site: Site, oxide: number): void {
  const g = Math.max(1, Math.round(T / 12));
  c.fillStyle = r.dark;
  c.fillRect(0, 0, T, T);
  // Four angular facets, lit toward the north-west and deep toward the south-east. A mass with
  // planes on it reads as rock; the same tile with one flat tone reads as a coloured square.
  const facets = [
    { x: 0, y: 0, w: 0.6, h: 0.54, tone: r.lit },
    { x: 0.48, y: 0, w: 0.52, h: 0.46, tone: r.mid },
    { x: 0, y: 0.46, w: 0.56, h: 0.54, tone: r.dark },
    { x: 0.42, y: 0.42, w: 0.58, h: 0.58, tone: r.deep },
  ] as const;
  for (let i = 0; i < 4; i++) {
    const f = facets[i] as (typeof facets)[number];
    const x = Math.max(0, Math.round((f.x + (hash(col, i, 53) - 0.5) * 0.16) * T));
    const y = Math.max(0, Math.round((f.y + (hash(col, i, 59) - 0.5) * 0.16) * T));
    const w = Math.min(Math.round(f.w * T), T - x);
    const h = Math.min(Math.round(f.h * T), T - y);
    dither(c, x, y, w, h, g, f.tone, 0.82, col + i);
  }
  const cw = Math.max(1, Math.round(T * 0.055));
  stepLine(
    c,
    0,
    Math.round(T * (0.4 + hash(col, 0, 61) * 0.18)),
    T,
    Math.round(T * (0.48 + hash(col, 1, 67) * 0.2)),
    cw,
    r.deep,
  );
  stepLine(
    c,
    Math.round(T * (0.42 + hash(col, 2, 71) * 0.2)),
    0,
    Math.round(T * (0.5 + hash(col, 3, 73) * 0.2)),
    T,
    cw,
    r.deep,
  );
  if (oxide > 0) dither(c, 0, 0, T, T, g, alpha(site.grit, 0.5), oxide, col + 2);
}

function paintOre(c: Ctx, T: number, col: number, r: Ramp, site: Site): void {
  paintRock(c, T, col, r, site, 0.12);
  // A vein, not a sprinkle. Ore has to be findable across the board and the diagonal chain is
  // what makes a cluster of specks read as one deposit rather than as noise on the rock.
  const s = Math.max(1, Math.round(T * 0.12));
  const body = shade(PALETTE.bronze, 0.62);
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const x = Math.round(T * 0.16 + t * T * 0.6 + (hash(col, i, 79) - 0.5) * T * 0.16);
    const y = Math.round(T * 0.72 - t * T * 0.56 + (hash(col, i, 83) - 0.5) * T * 0.16);
    c.fillStyle = body;
    c.fillRect(x, y, s, s);
    c.fillStyle = PALETTE.bronze;
    c.fillRect(x, y, Math.max(1, s - Math.max(1, s >> 2)), Math.max(1, s - Math.max(1, s >> 2)));
    c.fillStyle = PALETTE.gold;
    c.fillRect(x, y, Math.max(1, s >> 2), Math.max(1, s >> 2));
  }
}

function paintRubble(c: Ctx, T: number, col: number, r: Ramp): void {
  const g = Math.max(1, Math.round(T / 12));
  c.fillStyle = shade(r.deep, 0.75);
  c.fillRect(0, 0, T, T);
  dither(c, 0, 0, T, T, g, r.deep, 0.4, col);
  // Five loose chunks, each lit on its own north-west and dark on its own south-east, with the
  // near-black base showing between them. That gap is the entire difference from `rock` at 24px.
  const e = Math.max(1, Math.round(T * 0.05));
  for (let i = 0; i < 5; i++) {
    const w = Math.max(2, Math.round((0.2 + hash(col, i, 89) * 0.24) * T));
    const h = Math.max(2, Math.round((0.18 + hash(col, i, 97) * 0.24) * T));
    const x = Math.round(hash(col, i, 101) * (T - w));
    const y = Math.round(hash(col, i, 103) * (T - h));
    c.fillStyle = i % 2 === 0 ? r.mid : r.dark;
    c.fillRect(x, y, w, h);
    c.fillStyle = r.lit;
    c.fillRect(x, y, w, e);
    c.fillRect(x, y, e, h);
    c.fillStyle = shade(r.deep, 0.6);
    c.fillRect(x, y + h - e, w, e);
    c.fillRect(x + w - e, y, e, h);
  }
}

function paintPanel(c: Ctx, T: number, col: number, r: Ramp): void {
  const g = Math.max(1, Math.round(T / 12));
  c.fillStyle = r.mid;
  c.fillRect(0, 0, T, T);
  dither(c, 0, 0, T, T, g, r.dark, 0.3, col);
  const w = Math.max(1, Math.round(T * 0.05));
  for (const fy of [0.34, 0.68]) {
    const y = Math.round(fy * T);
    c.fillStyle = r.deep;
    c.fillRect(0, y, T, w);
    c.fillStyle = r.lit;
    c.fillRect(0, y + w, T, Math.max(1, w >> 1));
  }
  const rr = Math.max(1, Math.round(T * 0.08));
  const inset = Math.max(1, Math.round(T * 0.1));
  const spots = [
    [inset, inset],
    [T - inset - rr, inset],
    [inset, T - inset - rr],
    [T - inset - rr, T - inset - rr],
  ] as const;
  for (const spot of spots) {
    c.fillStyle = r.deep;
    c.fillRect(spot[0], spot[1], rr, rr);
    c.fillStyle = r.lit;
    c.fillRect(spot[0], spot[1], Math.max(1, rr >> 1), Math.max(1, rr >> 1));
  }
  if (col === 3) {
    // One panel in four carries a sprayed hazard block, half worn off. Repetition without it is
    // what makes a long wall read as wallpaper.
    const bx = Math.round(T * 0.2);
    const bw = Math.round(T * 0.6);
    const by = Math.round(T * 0.42);
    const bh = Math.round(T * 0.22);
    c.fillStyle = shade(r.deep, 0.8);
    c.fillRect(bx, by, bw, bh);
    hazard(c, bx, by, bw, bh, g, alpha(PALETTE.accent2, 0.5), Math.max(1, Math.round(T * 0.09)));
  }
}

function paintPit(c: Ctx, T: number, col: number): void {
  c.fillStyle = '#04070a';
  c.fillRect(0, 0, T, T);
  const g = Math.max(1, Math.round(T / 12));
  dither(c, 0, 0, T, T, g, '#0b1116', 0.3, col);
  if (col === 0) return;
  /*
   * The far rim, and the only cue that separates "hole" from "dark patch" at 24px. A pit is the
   * one terrain that kills a bot for driving onto it, so this is deliberately the brightest value
   * anywhere in the terrain layer and is allowed to shout.
   */
  const d = Math.max(1, Math.round(T * 0.14));
  c.fillStyle = '#cbd9e3';
  c.fillRect(0, 0, T, d);
  dither(c, 0, d, T, d, Math.max(1, g >> 1), '#7d8d9a', 0.5, 1);
  c.fillStyle = '#000000';
  c.fillRect(0, T - Math.max(1, d >> 1), T, Math.max(1, d >> 1));
}

function paintPad(c: Ctx, T: number, r: Ramp): void {
  const g = Math.max(1, Math.round(T / 12));
  c.fillStyle = shade(r.mid, 0.58);
  c.fillRect(0, 0, T, T);
  dither(c, 0, 0, T, T, g, r.deep, 0.4, 1);
  hazard(c, 0, 0, T, T, g, alpha(PALETTE.accent2, 0.5), Math.max(1, Math.round(T * 0.13)));
  // Corner brackets. Desaturated to black this is still four right angles pointing inward, which
  // is the silhouette test the whole direction is built on.
  const b = Math.max(1, Math.round(T * 0.09));
  const arm = Math.max(2, Math.round(T * 0.3));
  c.fillStyle = PALETTE.accent2;
  c.fillRect(0, 0, arm, b);
  c.fillRect(0, 0, b, arm);
  c.fillRect(T - arm, 0, arm, b);
  c.fillRect(T - b, 0, b, arm);
  c.fillRect(0, T - b, arm, b);
  c.fillRect(0, T - arm, b, arm);
  c.fillRect(T - arm, T - b, arm, b);
  c.fillRect(T - b, T - arm, b, arm);
}

function paintDepot(c: Ctx, T: number, floor: Ramp, metal: Ramp, site: Site): void {
  const g = Math.max(1, Math.round(T / 12));
  c.fillStyle = floor.dark;
  c.fillRect(0, 0, T, T);
  dither(c, 0, 0, T, T, g, floor.deep, 0.34, 2);
  dither(c, 0, 0, T, T, g, alpha(site.grit, 0.4), site.dust * 0.2, 3);

  const m = Math.max(1, Math.round(T * 0.09));
  const w = T - m * 2;
  const e = Math.max(1, Math.round(T * 0.07));
  c.fillStyle = metal.mid;
  c.fillRect(m, m, w, w);
  // Notch out the north-east shoulder, so the housing is not a square and survives being reduced
  // to a black shape.
  const notch = Math.max(1, Math.round(w * 0.3));
  c.fillStyle = floor.dark;
  c.fillRect(m + w - notch, m, notch, Math.max(1, Math.round(notch * 0.6)));

  c.fillStyle = metal.lit;
  c.fillRect(m, m, w - notch, e);
  c.fillRect(m, m, e, w);
  c.fillRect(m + w - notch, m + Math.round(notch * 0.6), notch, e);
  c.fillStyle = metal.deep;
  c.fillRect(m, m + w - e, w, e);
  c.fillRect(m + w - e, m + Math.round(notch * 0.6), e, w - Math.round(notch * 0.6));

  const slot = Math.max(1, Math.round(T * 0.07));
  c.fillStyle = shade(metal.deep, 0.6);
  for (let i = 0; i < 3; i++) {
    c.fillRect(m + e * 2, m + e * 2 + i * slot * 2, Math.max(1, Math.round(w * 0.3)), slot);
  }
  c.fillStyle = alpha(PALETTE.silver, 0.8);
  c.fillRect(
    m + Math.round(w * 0.5),
    m + Math.round(w * 0.5),
    Math.max(1, Math.round(w * 0.34)),
    Math.max(1, Math.round(w * 0.14)),
  );
  // Idle pilot light. It is the reason a stopped board still looks like it is waiting for you.
  const p = Math.max(1, Math.round(T * 0.1));
  c.fillStyle = PALETTE.ok;
  c.fillRect(m + Math.round(w * 0.52), m + Math.round(w * 0.24), p, p);
  c.fillStyle = '#ffffff';
  c.fillRect(
    m + Math.round(w * 0.52),
    m + Math.round(w * 0.24),
    Math.max(1, p >> 1),
    Math.max(1, p >> 1),
  );
}

/** Painted facing East. The other three facings are exact 90-degree copies. */
function paintConveyor(c: Ctx, T: number, floor: Ramp, metal: Ramp): void {
  const g = Math.max(1, Math.round(T / 12));
  c.fillStyle = floor.dark;
  c.fillRect(0, 0, T, T);
  const rail = Math.max(1, Math.round(T * 0.14));
  c.fillStyle = shade(metal.deep, 0.8);
  c.fillRect(0, rail, T, T - rail * 2);
  dither(c, 0, rail, T, T - rail * 2, g, metal.dark, 0.34, 0);
  c.fillStyle = metal.mid;
  c.fillRect(0, 0, T, rail);
  c.fillRect(0, T - rail, T, rail);
  const e = Math.max(1, Math.round(T * 0.05));
  c.fillStyle = metal.lit;
  c.fillRect(0, 0, T, e);
  c.fillRect(0, rail, T, e);
  c.fillStyle = metal.deep;
  c.fillRect(0, T - rail - e, T, e);
  c.fillRect(0, T - e, T, e);
  // Three chevrons. Direction has to survive to the far zoom or a conveyor is just a dark stripe.
  const cw = Math.max(1, Math.round(T * 0.055));
  const half = Math.round(T * 0.5);
  const reach = Math.round(T * 0.16);
  for (let i = 0; i < 2; i++) {
    const x = Math.round(T * (0.26 + i * 0.36));
    stepLine(c, x - reach, half - reach, x, half, cw, alpha(PALETTE.silver, 0.72));
    stepLine(c, x - reach, half + reach, x, half, cw, alpha(PALETTE.silver, 0.72));
  }
}

/** Lit and shadowed edge bands, all transparent overlays so they compose over any material. */
function paintEdge(c: Ctx, T: number, row: number): void {
  const g = Math.max(1, Math.round(T / 12));
  const lit = '#dbe8f0';
  const dark = '#000000';
  switch (row) {
    case ROW.litN: {
      const d = Math.max(1, Math.round(T * 0.14));
      c.fillStyle = alpha(lit, 0.4);
      c.fillRect(0, 0, T, Math.max(1, d >> 1));
      dither(c, 0, Math.max(1, d >> 1), T, d, g, alpha(lit, 0.4), 0.5, 0);
      break;
    }
    case ROW.litW: {
      const d = Math.max(1, Math.round(T * 0.12));
      c.fillStyle = alpha(lit, 0.3);
      c.fillRect(0, 0, Math.max(1, d >> 1), T);
      dither(c, Math.max(1, d >> 1), 0, d, T, g, alpha(lit, 0.3), 0.5, 2);
      break;
    }
    case ROW.darkS: {
      const d = Math.max(1, Math.round(T * 0.2));
      dither(c, 0, T - d, T, d, g, alpha(dark, 0.38), 0.5, 1);
      c.fillStyle = alpha(dark, 0.38);
      c.fillRect(0, T - Math.max(1, d >> 1), T, Math.max(1, d >> 1));
      break;
    }
    case ROW.darkE: {
      const d = Math.max(1, Math.round(T * 0.16));
      dither(c, T - d, 0, d, T, g, alpha(dark, 0.3), 0.5, 3);
      c.fillStyle = alpha(dark, 0.3);
      c.fillRect(T - Math.max(1, d >> 1), 0, Math.max(1, d >> 1), T);
      break;
    }
    /*
     * The cast shadow is two hard steps, not a ramp. Its depth is held to under a third of a tile
     * on purpose: the trail is a whole-tile darkening and has to still change the tile it lands on
     * even when that tile is up against a wall.
     */
    case ROW.castN: {
      const d = Math.max(1, Math.round(T * 0.3));
      const near = Math.max(1, Math.round(d * 0.42));
      c.fillStyle = alpha(dark, 0.3);
      c.fillRect(0, 0, T, near);
      dither(c, 0, near, T, d - near, g, alpha(dark, 0.3), 0.5, 0);
      break;
    }
    case ROW.castW: {
      const d = Math.max(1, Math.round(T * 0.26));
      const near = Math.max(1, Math.round(d * 0.42));
      c.fillStyle = alpha(dark, 0.26);
      c.fillRect(0, 0, near, T);
      dither(c, near, 0, d - near, T, g, alpha(dark, 0.26), 0.5, 2);
      break;
    }
    case ROW.castNW: {
      const d = Math.max(1, Math.round(T * 0.3));
      dither(c, 0, 0, d, d, g, alpha(dark, 0.26), 0.62, 1);
      break;
    }
    case ROW.aoS: {
      const d = Math.max(1, Math.round(T * 0.12));
      dither(c, 0, T - d, T, d, g, alpha(dark, 0.24), 0.6, 3);
      break;
    }
    case ROW.aoE: {
      const d = Math.max(1, Math.round(T * 0.1));
      dither(c, T - d, 0, d, T, g, alpha(dark, 0.2), 0.6, 1);
      break;
    }
    default:
      break;
  }
}

function buildSheet(T: number, biome: Biome): HTMLCanvasElement | null {
  const key = `${T}|${biome}`;
  if (sheet && sheetKey === key) return sheet;
  const site = SITES[biome];
  const canvas =
    sheet ?? (typeof document === 'undefined' ? null : document.createElement('canvas'));
  if (!canvas) return null;
  canvas.width = T * SHEET_COLS;
  canvas.height = T * SHEET_ROWS;
  const c = canvas.getContext('2d');
  if (!c) return null;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.imageSmoothingEnabled = false;

  const floor = ramp(site.floor, FLOOR_SPREAD);
  const loose = ramp(mix(site.floor, site.grit, 0.32), FLOOR_SPREAD);
  const soil = ramp(mix(site.floor, '#4a3524', 0.3), FLOOR_SPREAD);
  /* Held short of the pad's value on purpose: `pad` is the brightest thing on the board and has
   * to stay that way in a biome whose floor is already ice. */
  const ice = ramp(mix(site.floor, '#8fb6c8', 0.28), FLOOR_SPREAD);
  const stone = ramp(shade(site.wall, 1.35), SOLID_SPREAD);
  const wall = ramp(site.wall, SOLID_SPREAD);
  const outside = ramp(shade(site.wall, 0.5), SOLID_SPREAD);
  const metal = ramp(mix(site.wall, PALETTE.silver, 0.26), SOLID_SPREAD);

  for (let col = 0; col < SHEET_COLS; col++) {
    for (let row = 0; row < SHEET_ROWS; row++) {
      // Overlays are neighbour-driven, not varied, so only column zero is ever sampled.
      if (row >= ROW.litN && col > 0) continue;
      c.save();
      c.beginPath();
      c.rect(col * T, row * T, T, T);
      c.clip();
      c.translate(col * T, row * T);
      switch (row) {
        case ROW.floor:
          if (site.floorKind === 'plate') paintPlate(c, T, col, floor, site);
          else if (site.floorKind === 'grain') paintGrain(c, T, col, floor, site, 0.22);
          else if (site.floorKind === 'ice') paintIce(c, T, col, floor);
          else paintStone(c, T, col, floor, site, 0.4);
          break;
        case ROW.loose:
          paintGrain(c, T, col, loose, site, 0.3);
          break;
        case ROW.soil:
          paintSoil(c, T, col, soil, site);
          break;
        case ROW.ice:
          paintIce(c, T, col, ice);
          break;
        case ROW.stone:
          paintRock(c, T, col, stone, site, 0.14);
          break;
        case ROW.ore:
          paintOre(c, T, col, stone, site);
          break;
        case ROW.rubble:
          paintRubble(c, T, col, stone);
          break;
        case ROW.wall:
          if (site.wallKind === 'panel') paintPanel(c, T, col, wall);
          else paintRock(c, T, col, wall, site, 0.1);
          break;
        case ROW.outside:
          paintRock(c, T, col, outside, site, 0);
          break;
        case ROW.pit:
          paintPit(c, T, col);
          break;
        case ROW.pad:
          if (col === 0) paintPad(c, T, floor);
          break;
        case ROW.depot:
          if (col === 0) paintDepot(c, T, floor, metal, site);
          break;
        case ROW.conveyor:
          break;
        default:
          paintEdge(c, T, row);
          break;
      }
      c.restore();
    }
  }

  // The conveyor is authored once facing East and copied at exact right angles, which is lossless
  // and saves three hand-tuned variants that would inevitably disagree about where the light is.
  const scratch = typeof document === 'undefined' ? null : document.createElement('canvas');
  if (scratch) {
    scratch.width = T;
    scratch.height = T;
    const sc = scratch.getContext('2d');
    if (sc) {
      sc.imageSmoothingEnabled = false;
      paintConveyor(sc, T, floor, metal);
      for (let f = 0; f < 4; f++) {
        c.save();
        c.translate((f + 0.5) * T, (ROW.conveyor + 0.5) * T);
        c.rotate(((f - 1) * Math.PI) / 2);
        c.drawImage(scratch, -T / 2, -T / 2);
        c.restore();
      }
    }
  }

  sheet = canvas;
  sheetKey = key;
  return canvas;
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

const SOLIDS = new Set<string>([
  Terrain.Wall,
  Terrain.Rock,
  Terrain.Ore,
  Terrain.Rubble,
  Terrain.Void,
]);

/* Warm and dull on purpose: `accent2` is the goal marker, and a power run threading the board in
 * the goal colour reads as a route the player is meant to follow. */
const CABLE_CORE = shade(PALETTE.bronze, 0.82);

function facingOf(tile: Tile): number {
  const raw = tile.meta?.['facing'] ?? tile.meta?.['dir'];
  if (typeof raw === 'number') return ((raw % 4) + 4) % 4;
  if (typeof raw === 'string') {
    const i = ['north', 'east', 'south', 'west'].indexOf(raw.toLowerCase());
    if (i >= 0) return i;
  }
  return 1;
}

function drawCableRun(ctx: Ctx, ox: number, oy: number, T: number, r: Ramp, mask: number): void {
  const channel = Math.max(2, Math.round(T * 0.3));
  const core = Math.max(1, Math.round(T * 0.11));
  const half = Math.round((T - channel) / 2);
  const mid = Math.round((T - core) / 2);
  const arms = mask === 0 ? 0b1010 : mask;
  ctx.fillStyle = r.deep;
  ctx.fillRect(ox + half, oy + half, channel, channel);
  if (arms & 1) ctx.fillRect(ox + half, oy, channel, half);
  if (arms & 2) ctx.fillRect(ox + half + channel, oy + half, T - half - channel, channel);
  if (arms & 4) ctx.fillRect(ox + half, oy + half + channel, channel, T - half - channel);
  if (arms & 8) ctx.fillRect(ox, oy + half, half, channel);
  ctx.fillStyle = CABLE_CORE;
  ctx.fillRect(ox + mid, oy + mid, core, core);
  if (arms & 1) ctx.fillRect(ox + mid, oy, core, mid);
  if (arms & 2) ctx.fillRect(ox + mid + core, oy + mid, T - mid - core, core);
  if (arms & 4) ctx.fillRect(ox + mid, oy + mid + core, core, T - mid - core);
  if (arms & 8) ctx.fillRect(ox, oy + mid, mid, core);
  const e = Math.max(1, Math.round(T * 0.045));
  ctx.fillStyle = r.lit;
  ctx.fillRect(ox + half, oy + half, channel, e);
}

function paintTerrain(paint: TerrainPaint): void {
  const { ctx, world, tilePx, biome, width, height } = paint;
  const T = tilePx;
  const site = SITES[biome];
  const sheetCanvas = buildSheet(T, biome);
  ctx.imageSmoothingEnabled = false;

  if (!sheetCanvas) {
    ctx.fillStyle = site.floor;
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const w = world.w;
  const h = world.h;
  const stride = w + 2;
  /* Out of bounds counts as solid, matching `terrain.ts`, so the board edge grows an edge rather
   * than a shadow cast by nothing. */
  const solid = new Uint8Array(stride * (h + 2)).fill(1);
  const cable = new Uint8Array(stride * (h + 2));
  const pit = new Uint8Array(stride * (h + 2));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tile = world.tiles[y * w + x];
      const i = (y + 1) * stride + (x + 1);
      if (!tile) continue;
      solid[i] = SOLIDS.has(tile.terrain) ? 1 : 0;
      if (tile.terrain === Terrain.Cable || tile.terrain === Terrain.Depot) cable[i] = 1;
      if (tile.terrain === Terrain.Pit) pit[i] = 1;
    }
  }

  const blit = (row: number, col: number, dx: number, dy: number): void => {
    ctx.drawImage(sheetCanvas, col * T, row * T, T, T, dx, dy, T, T);
  };

  const floorRamp = ramp(site.floor, FLOOR_SPREAD);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tile = world.tiles[y * w + x];
      const ox = x * T;
      const oy = y * T;
      if (!tile) {
        blit(ROW.outside, (x ^ y) & 3, ox, oy);
        continue;
      }
      const i = (y + 1) * stride + (x + 1);
      const v = (hash(x, y, 1) * 4) | 0;
      switch (tile.terrain) {
        case Terrain.Void:
          blit(ROW.outside, v, ox, oy);
          break;
        case Terrain.Wall:
          blit(ROW.wall, v, ox, oy);
          break;
        case Terrain.Rock:
          blit(ROW.stone, v, ox, oy);
          break;
        case Terrain.Ore:
          blit(ROW.ore, v, ox, oy);
          break;
        case Terrain.Rubble:
          blit(ROW.rubble, v, ox, oy);
          break;
        case Terrain.Ice:
          blit(ROW.ice, v, ox, oy);
          break;
        case Terrain.Regolith:
          blit(ROW.loose, v, ox, oy);
          break;
        /*
         * Tilled ground and nothing else. Maturity is derived from the tick rather than from a
         * `tileChange`, so a crop baked into the cache would be stale on most frames and would
         * double up under the renderer's live crop pass. The furrows belong here; the plant does
         * not.
         */
        case Terrain.Soil:
          blit(ROW.soil, v, ox, oy);
          break;
        case Terrain.Pad:
          blit(ROW.pad, 0, ox, oy);
          break;
        case Terrain.Depot:
          blit(ROW.depot, 0, ox, oy);
          break;
        case Terrain.Conveyor:
          blit(ROW.conveyor, facingOf(tile), ox, oy);
          break;
        case Terrain.Pit:
          blit(ROW.pit, pit[i - stride] === 1 ? 0 : 1, ox, oy);
          break;
        case Terrain.Cable:
          blit(ROW.floor, v, ox, oy);
          drawCableRun(
            ctx,
            ox,
            oy,
            T,
            floorRamp,
            (cable[i - stride] as number) |
              ((cable[i + 1] as number) << 1) |
              ((cable[i + stride] as number) << 2) |
              ((cable[i - 1] as number) << 3),
          );
          break;
        default:
          blit(
            ROW.floor,
            site.floorKind === 'plate' ? (x % 3 === 0 ? 1 : 0) | (y % 3 === 0 ? 2 : 0) : v,
            ox,
            oy,
          );
          break;
      }
    }
  }

  /*
   * The edge pass, and the reason this is not a tilemap. Every solid grows a lit north and west
   * shoulder and a dark south and east face; every floor takes the shadow those cast down and to
   * the right. Because the light never moves, this shading becomes something the player reads
   * rather than something they look at.
   */
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y + 1) * stride + (x + 1);
      const ox = x * T;
      const oy = y * T;
      const n = solid[i - stride] as number;
      const s = solid[i + stride] as number;
      const e = solid[i + 1] as number;
      const wsolid = solid[i - 1] as number;
      if (solid[i] === 1) {
        if (n === 0) blit(ROW.litN, 0, ox, oy);
        if (wsolid === 0) blit(ROW.litW, 0, ox, oy);
        if (s === 0) blit(ROW.darkS, 0, ox, oy);
        if (e === 0) blit(ROW.darkE, 0, ox, oy);
        continue;
      }
      if (n === 1) blit(ROW.castN, 0, ox, oy);
      if (wsolid === 1) blit(ROW.castW, 0, ox, oy);
      if (n === 0 && wsolid === 0 && solid[i - stride - 1] === 1) blit(ROW.castNW, 0, ox, oy);
      if (s === 1) blit(ROW.aoS, 0, ox, oy);
      if (e === 1) blit(ROW.aoE, 0, ox, oy);
    }
  }
}

// ---------------------------------------------------------------------------
// Screen-space passes
// ---------------------------------------------------------------------------

/**
 * Both screen-space passes are ordered-dithered images built at one device pixel per dither block
 * and blitted back up with smoothing off.
 *
 * Writing them as `ImageData` rather than as a few tens of thousands of `fillRect`s is what makes
 * them affordable: a full-screen dither is 50k blocks, which is milliseconds as typed-array
 * arithmetic and a frame and a half as canvas calls. Both are rebuilt on a size change only, and
 * both cost exactly one `drawImage` per frame after that.
 */
const BLOCK = 5;

let backCanvas: HTMLCanvasElement | null = null;
let backKey = '';
let vignetteCanvas: HTMLCanvasElement | null = null;
let vignetteKey = '';

const ROCK = ['#080b0e', '#0c1114', '#11171b', '#171e23'] as const;
const ROCK_RGB = ROCK.map((hex) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
});
const OXIDE = [58, 40, 26] as const;

function buildBackdrop(width: number, height: number): HTMLCanvasElement | null {
  const key = `${width}x${height}`;
  if (backCanvas && backKey === key) return backCanvas;
  const canvas =
    backCanvas ?? (typeof document === 'undefined' ? null : document.createElement('canvas'));
  if (!canvas) return null;
  const cols = Math.max(1, Math.ceil(width / BLOCK));
  const rows = Math.max(1, Math.ceil(height / BLOCK));
  canvas.width = cols;
  canvas.height = rows;
  const c = canvas.getContext('2d');
  if (!c) return null;
  const img = c.createImageData(cols, rows);
  const data = img.data;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      // Coarse facets under a fine grain, plus a north-west lift, so the rock the port is cut
      // into is lit by the same lamp the board is.
      const facet = hash(i >> 3, j >> 3, 5);
      const grain = hash(i, j, 9);
      const lift = 1 - (i / cols + j / rows) * 0.5;
      const v = 0.16 + facet * 0.46 + lift * 0.5 + (grain - 0.5) * 0.3;
      const scaled = Math.max(0, Math.min(3.999, v * 4));
      const step = Math.floor(scaled);
      const on = (BAYER[(j & 3) * 4 + (i & 3)] as number) / 16 < scaled - step ? 1 : 0;
      const tone = ROCK_RGB[Math.min(3, step + on)] as readonly [number, number, number];
      const o = (j * cols + i) * 4;
      const ore = hash(i, j, 31) > 0.988 ? 1 : 0;
      data[o] = tone[0] + ore * OXIDE[0];
      data[o + 1] = tone[1] + ore * OXIDE[1];
      data[o + 2] = tone[2] + ore * OXIDE[2];
      data[o + 3] = 255;
    }
  }
  c.putImageData(img, 0, 0);
  backCanvas = canvas;
  backKey = key;
  return canvas;
}

/** Six hard steps with dithered joins. A smooth vignette would be the one soft mark on screen. */
function buildVignette(width: number, height: number): HTMLCanvasElement | null {
  const key = `${width}x${height}`;
  if (vignetteCanvas && vignetteKey === key) return vignetteCanvas;
  const canvas =
    vignetteCanvas ?? (typeof document === 'undefined' ? null : document.createElement('canvas'));
  if (!canvas) return null;
  const cols = Math.max(1, Math.ceil(width / BLOCK));
  const rows = Math.max(1, Math.ceil(height / BLOCK));
  canvas.width = cols;
  canvas.height = rows;
  const c = canvas.getContext('2d');
  if (!c) return null;
  const img = c.createImageData(cols, rows);
  const data = img.data;
  const STEP = 0.11;
  for (let j = 0; j < rows; j++) {
    const ny = ((j + 0.5) / rows) * 2 - 1;
    for (let i = 0; i < cols; i++) {
      const nx = ((i + 0.5) / cols) * 2 - 1;
      const d = Math.sqrt(nx * nx * 0.82 + ny * ny) / 1.16;
      const t = Math.max(0, (d - 0.44) / 0.56);
      const scaled = Math.min(4.999, (t * t * 0.55) / STEP);
      const step = Math.floor(scaled);
      const on = (BAYER[(j & 3) * 4 + (i & 3)] as number) / 16 < scaled - step ? 1 : 0;
      const o = (j * cols + i) * 4;
      data[o + 3] = Math.round(Math.min(5, step + on) * STEP * 255);
    }
  }
  c.putImageData(img, 0, 0);
  vignetteCanvas = canvas;
  vignetteKey = key;
  return canvas;
}

/**
 * Dust, as a fixed pool with no per-frame state.
 *
 * Position is derived from `time` rather than integrated, so the pass allocates nothing, never
 * drifts out of sync after a scrub, and freezes exactly where it stands when the player asks for
 * reduced motion instead of vanishing.
 */
const MOTES = 96;
const MOTE_SEED = new Float32Array(MOTES * 4);
for (let i = 0; i < MOTES; i++) {
  MOTE_SEED[i * 4] = hash(i, 0, 101);
  MOTE_SEED[i * 4 + 1] = hash(i, 1, 103);
  MOTE_SEED[i * 4 + 2] = 0.3 + hash(i, 2, 107) * 0.9;
  MOTE_SEED[i * 4 + 3] = hash(i, 3, 109);
}

function backdrop(paint: BackdropPaint): void {
  const { ctx, width, height } = paint;
  const back = buildBackdrop(width, height);
  if (!back) {
    ctx.fillStyle = PALETTE.bgVoid;
    ctx.fillRect(0, 0, width, height);
    return;
  }
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(back, 0, 0, back.width, back.height, 0, 0, width, height);
  ctx.imageSmoothingEnabled = smooth;
}

function post(paint: PostPaint): void {
  const { ctx, width, height, dpr, time, preview, reducedMotion } = paint;
  const vig = buildVignette(width, height);
  const smooth = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  if (vig) ctx.drawImage(vig, 0, 0, vig.width, vig.height, 0, 0, width, height);

  /*
   * A still board is the screenshot, so it gets the treatment: more dust, drifting down rather
   * than across, and a warm breath on the lamp. The point is that an unplayed level looks
   * inhabited and stopped rather than merely undrawn.
   */
  const t = reducedMotion ? 0 : time;
  const count = preview ? MOTES : MOTES >> 1;
  const fall = preview ? 0.012 : 0.004;
  const drift = preview ? 0.008 : 0.03;
  const size = Math.max(1, Math.round(dpr));
  for (let bucket = 0; bucket < 3; bucket++) {
    ctx.fillStyle = alpha(PALETTE.silver, 0.06 + bucket * 0.05);
    for (let i = bucket; i < count; i += 3) {
      const speed = MOTE_SEED[i * 4 + 2] as number;
      const sway = reducedMotion
        ? 0
        : Math.sin(t * 0.7 + (MOTE_SEED[i * 4 + 3] as number) * 9) * 0.01;
      let fx = ((MOTE_SEED[i * 4] as number) + t * drift * speed + sway) % 1;
      let fy = ((MOTE_SEED[i * 4 + 1] as number) + t * fall * speed) % 1;
      if (fx < 0) fx += 1;
      if (fy < 0) fy += 1;
      ctx.fillRect(Math.round(fx * width), Math.round(fy * height), size, size);
    }
  }

  if (preview && !reducedMotion) {
    ctx.fillStyle = alpha(PALETTE.accent2, 0.014 + 0.01 * Math.sin(time * 0.55));
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingEnabled = smooth;
}

// ---------------------------------------------------------------------------
// The machine
// ---------------------------------------------------------------------------

/**
 * The bot is drawn axis-aligned and never rotated.
 *
 * This is the one decision the rest of it hangs off. A rotated canvas antialiases every edge, and
 * one soft diagonal in a field of hard dither is exactly the mark that gives away that the pixel
 * work is a filter rather than a decision — the same argument `stepLine` makes. It also means the
 * key light can stay where it is: on this site the lamp is north-west for the terrain, the walls
 * and the rock the port is cut into, and a machine whose lit face swung round as it turned would
 * be the only object on the board lit from somewhere else.
 *
 * So facing is carried by *what the machine does* rather than by which way its body points — the
 * lit cab on the leading face and the lamp pooling on the floor ahead of it. Desaturated to black
 * that still reads as a tracked machine pointing somewhere, which the silhouette of a square
 * would not.
 */
const BOT_STEP_X = [0, 1, 0, -1] as const;
const BOT_STEP_Y = [-1, 0, 1, 0] as const;

/** Cool grey-blue, one step off `bot.hull`, so the machine is the coolest thing on a warm site. */
const BOT_HULL = ramp('#3f4f61', SOLID_SPREAD);
const BOT_DEAD = ramp('#252c33', SOLID_SPREAD);
const BOT_TREAD = ramp('#141b21', 0.42);
/** The lamp. Warm, because the site is lit by working light and not by daylight. */
const BOT_LAMP = '#ffe6b8';
/** The one shadow value on the board, matching what `paintEdge` casts off a wall. */
const SHADE = alpha('#000000', 0.34);
/** The pool the lamp puts on the plate. Translucent, or the light erases the floor it lands on. */
const BOT_LAMP_POOL = alpha(BOT_LAMP, 0.55);

/**
 * One ramp per accent, built on first sight of it.
 *
 * `ramp()` allocates four strings and there are twelve accents, so it is a lookup rather than a
 * call inside the draw path. Keyed by colour, so it survives a direction change without going
 * stale for the same reason `alpha()`'s tables do.
 */
const BOT_ACCENTS = new Map<string, Ramp>();

function accentRamp(color: string): Ramp {
  let r = BOT_ACCENTS.get(color);
  if (!r) {
    r = ramp(color, 0.26);
    BOT_ACCENTS.set(color, r);
  }
  return r;
}

/** `String(n)` inside a draw path allocates once per label per frame. See `sprites.ts`. */
const NUMERALS: readonly string[] = Array.from({ length: 64 }, (_, i) => String(i));

function numeral(value: number): string {
  const n = value | 0;
  return (n >= 0 && n < NUMERALS.length ? NUMERALS[n] : String(n)) as string;
}

let fontPx = -1;
let fontFace = '';

/** Rebuilt on a zoom step, never on a frame. */
function fontAt(px: number): string {
  if (px !== fontPx) {
    fontPx = px;
    fontFace = `600 ${px}px 'JetBrains Mono', ui-monospace, monospace`;
  }
  return fontFace;
}

/**
 * The lamp pool, as three dithered bands widening away from the front face.
 *
 * Drawn on the floor rather than as a cone over it, because a `lighter` gradient is a different
 * medium from everything else here — and because a pool that lands *on* the plate is the thing
 * that says the machine is standing in a place with a floor.
 */
function lampPool(
  c: Ctx,
  cx: number,
  cy: number,
  hx: number,
  hy: number,
  fx: number,
  fy: number,
  cell: number,
  strength: number,
): void {
  const horiz = fx !== 0;
  const depth = Math.max(2, Math.round((horiz ? hx : hy) * 0.5));
  for (let k = 0; k < 3; k++) {
    const spread = Math.round((0.5 + k * 0.34) * (horiz ? hy : hx));
    if (spread <= 0) continue;
    const near = k * depth;
    if (horiz) {
      const x = fx > 0 ? cx + hx + near : cx - hx - near - depth;
      dither(
        c,
        x,
        cy - spread,
        depth,
        spread * 2,
        cell,
        BOT_LAMP_POOL,
        (0.5 - k * 0.16) * strength,
        k,
      );
    } else {
      const y = fy > 0 ? cy + hy + near : cy - hy - near - depth;
      dither(
        c,
        cx - spread,
        y,
        spread * 2,
        depth,
        cell,
        BOT_LAMP_POOL,
        (0.5 - k * 0.16) * strength,
        k,
      );
    }
  }
}

/**
 * One machine, with weight.
 *
 * The far form below `botDetailTilePx` keeps the three things that survive downsampling — the
 * cast shadow that lifts it off the plate, the accent body that says which one it is, and the lit
 * leading face plus one band of lamp that says which way it is pointed — and drops the treads,
 * the bevels and the cab, which at eighteen pixels are two pixels each and turn into noise.
 */
function drawBot(c: Ctx, pose: BotPose, tilePx: number, options: BotDrawOptions): void {
  const t = tilePx;
  const cx = Math.round((pose.x + 0.5) * t);
  const cy = Math.round((pose.y + 0.5) * t);
  const dead = !pose.alive;
  const reduced = options.reduced;
  const detail = t >= deepsite.metrics.botDetailTilePx * options.dpr;
  const accent = accentRamp(dead ? BOT_DEAD.lit : options.accent);
  const hull = dead ? BOT_DEAD : BOT_HULL;

  const fx = BOT_STEP_X[pose.facing] ?? 1;
  const fy = BOT_STEP_Y[pose.facing] ?? 0;
  const horiz = fx !== 0;

  const cell = Math.max(1, Math.round(t / 11));
  const edge = Math.max(1, Math.round(t * 0.05));
  const base = Math.max(2, Math.round(t * 0.33));
  const stretch = 1 + pose.stretch;
  const along = Math.max(2, Math.round(base * stretch));
  const across = Math.max(2, Math.round(base / stretch));
  const hx = horiz ? along : across;
  const hy = horiz ? across : along;
  const x0 = cx - hx;
  const y0 = cy - hy;
  const bw = hx * 2;
  const bh = hy * 2;

  c.save();

  /*
   * The cast shadow is a hard dithered block to the south-east, which is where the one key light
   * puts it. It is the whole of the machine's lift: a soft radial under it would be the only
   * blurred mark on the board. Held at the same weight `paintEdge` gives a wall's cast, so a bot
   * standing next to one does not out-shadow it.
   */
  const drop = Math.max(1, Math.round(t * 0.07));
  dither(c, x0 + drop, y0 + drop, bw, bh, cell, SHADE, 0.62, pose.id);

  if (!dead) {
    const flicker = reduced ? 1 : 0.9 + 0.1 * Math.sin(options.time * 9 + pose.id * 2.3);
    lampPool(c, cx, cy, hx, hy, fx, fy, Math.max(1, cell + 1), detail ? flicker : flicker * 0.8);
  }

  if (!detail) {
    c.fillStyle = hull.deep;
    c.fillRect(x0, y0, bw, bh);
    c.fillStyle = accent.mid;
    c.fillRect(x0 + edge, y0 + edge, bw - edge * 2, bh - edge * 2);
    /* The lit leading face. At this size it is the only thing saying which way the machine faces. */
    const lead = Math.max(2, Math.round((horiz ? hx : hy) * 0.5));
    c.fillStyle = accent.lit;
    if (horiz) c.fillRect(fx > 0 ? x0 + bw - lead : x0, y0 + edge, lead, bh - edge * 2);
    else c.fillRect(x0 + edge, fy > 0 ? y0 + bh - lead : y0, bw - edge * 2, lead);
  } else {
    const tread = Math.max(2, Math.round((horiz ? hy : hx) * 0.42));
    c.fillStyle = BOT_TREAD.mid;
    if (horiz) {
      c.fillRect(x0, y0, bw, tread);
      c.fillRect(x0, y0 + bh - tread, bw, tread);
    } else {
      c.fillRect(x0, y0, tread, bh);
      c.fillRect(x0 + bw - tread, y0, tread, bh);
    }

    /* Lugs, counted rather than smeared, so a rolling track is a thing you can watch turn over. */
    const phase = (pose.travel * 6 + (reduced ? 0 : options.time * 3)) % 1;
    const lug = Math.max(1, Math.round((horiz ? hx : hy) * 0.22));
    const span = horiz ? bw : bh;
    c.fillStyle = dead ? BOT_TREAD.dark : BOT_TREAD.lit;
    for (let i = 0; i < 4; i++) {
      const at = Math.round((((i + phase) % 4) / 4) * (span - lug));
      if (horiz) {
        c.fillRect(x0 + at, y0, lug, edge);
        c.fillRect(x0 + at, y0 + bh - edge, lug, edge);
      } else {
        c.fillRect(x0, y0 + at, edge, lug);
        c.fillRect(x0 + bw - edge, y0 + at, edge, lug);
      }
    }

    const inset = Math.max(1, Math.round((horiz ? hx : hy) * 0.16));
    const hxr = horiz ? x0 + inset : x0 + tread;
    const hyr = horiz ? y0 + tread : y0 + inset;
    const hwr = horiz ? bw - inset * 2 : bw - tread * 2;
    const hhr = horiz ? bh - tread * 2 : bh - inset * 2;

    c.fillStyle = hull.mid;
    c.fillRect(hxr, hyr, hwr, hhr);
    dither(c, hxr, hyr, hwr, hhr, cell, hull.dark, 0.2, pose.id + 1);

    /* The fixed lamp, on a body: lit on the two faces it can see, dark on the two it cannot. */
    c.fillStyle = hull.lit;
    c.fillRect(hxr, hyr, hwr, edge);
    c.fillRect(hxr, hyr, edge, hhr);
    c.fillStyle = hull.deep;
    c.fillRect(hxr, hyr + hhr - edge, hwr, edge);
    c.fillStyle = hull.dark;
    c.fillRect(hxr + hwr - edge, hyr, edge, hhr);

    /* The cab: the accent block on the leading face, which is the identity and the facing at once. */
    const cab = Math.max(2, Math.round((horiz ? hwr : hhr) * 0.34));
    const cabX = horiz ? (fx > 0 ? hxr + hwr - cab : hxr) : hxr + edge;
    const cabY = horiz ? hyr + edge : fy > 0 ? hyr + hhr - cab : hyr;
    const cabW = horiz ? cab : hwr - edge * 2;
    const cabH = horiz ? hhr - edge * 2 : cab;
    c.fillStyle = accent.mid;
    c.fillRect(cabX, cabY, cabW, cabH);
    c.fillStyle = accent.lit;
    c.fillRect(cabX, cabY, cabW, edge);
    c.fillStyle = accent.deep;
    c.fillRect(cabX, cabY + cabH - edge, cabW, edge);

    /* The lamp housing, a bright pip on the front face of the cab. */
    if (!dead) {
      const pip = Math.max(1, Math.round(t * 0.07));
      const px = horiz ? (fx > 0 ? cabX + cabW - pip : cabX) : cx - Math.round(pip / 2);
      const py = horiz ? cy - Math.round(pip / 2) : fy > 0 ? cabY + cabH - pip : cabY;
      c.fillStyle = BOT_LAMP;
      c.fillRect(px, py, pip, pip);
    }

    if (options.carrying > 0 && !dead) {
      const load = Math.min(1, options.carrying / 4);
      const bob = reduced
        ? 0
        : Math.round(Math.sin(options.time * 6.5 + pose.id * 2.1) * load * t * 0.03);
      const crate = accentRamp(PALETTE.accent2);
      const cs = Math.max(3, Math.round(t * 0.2));
      const kx = cx - Math.round(cs / 2);
      const ky = cy - Math.round(cs / 2) + bob;
      c.fillStyle = crate.dark;
      c.fillRect(kx, ky, cs, cs);
      c.fillStyle = crate.lit;
      c.fillRect(kx, ky, cs, edge);
      c.fillRect(kx, ky, edge, cs);
      c.fillStyle = crate.deep;
      c.fillRect(kx, ky + cs - edge, cs, edge);
    }

    if (pose.action > 0 && !dead) {
      const reach = Math.round(Math.sin(Math.PI * pose.action) * t * 0.24);
      const arm = Math.max(1, Math.round(t * 0.06));
      if (horiz) {
        const ax = fx > 0 ? cx + hx : cx - hx - reach;
        c.fillStyle = accent.lit;
        c.fillRect(ax, cy - Math.round(arm / 2), reach, arm);
        c.fillRect(fx > 0 ? ax + reach - arm : ax, cy - arm, arm, arm * 2);
      } else {
        const ay = fy > 0 ? cy + hy : cy - hy - reach;
        c.fillStyle = accent.lit;
        c.fillRect(cx - Math.round(arm / 2), ay, arm, reach);
        c.fillRect(cx - arm, fy > 0 ? ay + reach - arm : ay, arm * 2, arm);
      }
    }
  }

  if (dead) dither(c, x0, y0, bw, bh, cell, alpha('#000000', 0.5), 0.5, pose.id + 5);

  if (options.active && !dead) {
    const r = Math.round(Math.max(hx, hy) * 1.5);
    const arm = Math.max(2, Math.round(r * 0.5));
    c.fillStyle = accent.lit;
    for (let i = 0; i < 4; i++) {
      const sx = i & 1 ? 1 : -1;
      const sy = i & 2 ? 1 : -1;
      const ax = sx > 0 ? cx + r - arm : cx - r;
      const ay = sy > 0 ? cy + r - arm : cy - r;
      c.fillRect(ax, sy > 0 ? cy + r - edge : cy - r, arm, edge);
      c.fillRect(sx > 0 ? cx + r - edge : cx - r, ay, edge, arm);
    }
  }

  if (pose.blocked > 0.02 || pose.recoil > 0.04) {
    drawBotBlocked(c, pose, cx, cy, hx, hy, fx, fy, t, reduced);
  }
  if (pose.idle > 0 && pose.alive) {
    drawBotIdle(c, cx, cy - hy, t, options.time, options.accent, reduced);
  }
  if (pose.failed && pose.blocked <= 0.02 && pose.alive) {
    drawBotFailed(c, cx, cy - hy, t, Math.sin(Math.PI * Math.max(pose.action, 0.001)));
  }
  if (options.showFuel && pose.alive) drawBotFuel(c, cx, cy + hy, t, options.fuel);

  if (options.showLabel && t >= 20 * options.dpr) {
    const px = Math.max(9, Math.round(t * 0.24));
    const label = numeral(pose.id);
    c.font = fontAt(px);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const w = Math.round(c.measureText(label).width + px * 0.8);
    const h = Math.round(px * 1.3);
    const lx = cx - Math.round(w / 2);
    const ly = cy - hy - Math.round(t * 0.24) - h;
    c.fillStyle = PALETTE.bgVoid;
    c.fillRect(lx, ly, w, h);
    c.fillStyle = accent.lit;
    c.fillRect(lx, ly, w, edge);
    c.fillStyle = PALETTE.ink;
    c.fillText(label, cx, ly + h / 2);
  }

  c.restore();
}

/**
 * DESIGN.md §11 A5: a blocked move must look obviously different from a successful one.
 *
 * The machine has hit something, so the tell is drawn where it hit — a stepped double chevron
 * crumpled against the face that took the impact, plus a hard frame round the footprint. Both are
 * `stepLine` and `fillRect`, because a soft red bloom would be the one antialiased mark on the
 * board and would read as an effect rather than as damage.
 */
function drawBotBlocked(
  c: Ctx,
  pose: BotPose,
  cx: number,
  cy: number,
  hx: number,
  hy: number,
  fx: number,
  fy: number,
  t: number,
  reduced: boolean,
): void {
  const k = pose.blocked;
  const w = Math.max(1, Math.round(t * 0.055));
  if (k > 0.02) {
    const red = alpha(PALETTE.danger, 0.95 * k);
    const gap = Math.round(t * 0.12);
    const arm = Math.round(t * 0.2);
    for (let i = 0; i < 2; i++) {
      const at = gap + i * Math.round(t * 0.12);
      if (fx !== 0) {
        const x = cx + fx * (hx + at);
        stepLine(c, x - fx * arm * 0.6, cy - arm, x, cy, w, red);
        stepLine(c, x, cy, x - fx * arm * 0.6, cy + arm, w, red);
      } else {
        const y = cy + fy * (hy + at);
        stepLine(c, cx - arm, y - fy * arm * 0.6, cx, y, w, red);
        stepLine(c, cx, y, cx + arm, y - fy * arm * 0.6, w, red);
      }
    }
    const fw = hx + Math.round(t * 0.1);
    const fh = hy + Math.round(t * 0.1);
    c.fillStyle = alpha(PALETTE.danger, 0.7 * k);
    c.fillRect(cx - fw, cy - fh, fw * 2, w);
    c.fillRect(cx - fw, cy + fh - w, fw * 2, w);
    c.fillRect(cx - fw, cy - fh, w, fh * 2);
    c.fillRect(cx + fw - w, cy - fh, w, fh * 2);
  }

  // The bang outlasts the impact by a beat and hops while the machine collects itself. A wall is
  // funnier than an error dialog, and this is the part that makes it one.
  const bang = Math.max(k, pose.recoil * 0.85);
  const hop = reduced
    ? 0
    : Math.round(Math.abs(Math.sin(pose.recoil * 9)) * pose.recoil * t * 0.09);
  const bx = cx - Math.round(w / 2);
  const by = cy - hy - Math.round(t * 0.62) - hop;
  c.fillStyle = alpha(PALETTE.danger, bang);
  c.fillRect(bx, by, w * 2, Math.round(t * 0.2));
  c.fillRect(bx, by + Math.round(t * 0.26), w * 2, w * 2);
}

/** Three ticking blocks over a waiting machine, slow enough that a whole row is not a strobe. */
function drawBotIdle(
  c: Ctx,
  cx: number,
  top: number,
  t: number,
  time: number,
  accent: string,
  reduced: boolean,
): void {
  const w = Math.max(2, Math.round(t * 0.09));
  const gap = Math.round(t * 0.15);
  const y = top - Math.round(t * 0.26);
  for (let i = 0; i < 3; i++) {
    const phase = (time * 1.6 - i * 0.22) % 1;
    const lit = reduced || (phase > 0 && phase < 0.5) ? 1 : 0.25;
    c.fillStyle = alpha(accent, 0.35 + lit * 0.6);
    c.fillRect(cx + (i - 1) * gap - Math.round(w / 2), y, w, w);
  }
}

/** A failed non-move action: same red as the bump, one notch quieter, stepped like everything else. */
function drawBotFailed(c: Ctx, cx: number, top: number, t: number, strength: number): void {
  const r = Math.max(2, Math.round(t * 0.13));
  const w = Math.max(1, Math.round(t * 0.05));
  const y = top - Math.round(t * 0.26);
  const red = alpha(PALETTE.danger, 0.9 * Math.max(0, Math.min(1, strength)));
  stepLine(c, cx - r, y - r, cx + r, y + r, w, red);
  stepLine(c, cx + r, y - r, cx - r, y + r, w, red);
}

/** Fuel as six lit cells. A hard segmented gauge is what this equipment would actually carry. */
function drawBotFuel(c: Ctx, cx: number, bottom: number, t: number, fuel: number): void {
  const level = Math.max(0, Math.min(1, fuel));
  const cells = 6;
  const w = Math.max(2, Math.round(t * 0.07));
  const step = w + Math.max(1, Math.round(t * 0.03));
  const h = Math.max(2, Math.round(t * 0.1));
  const x = cx - Math.round((cells * step - (step - w)) / 2);
  const y = bottom + Math.round(t * 0.14);
  const lit = Math.round(level * cells);
  for (let i = 0; i < cells; i++) {
    c.fillStyle =
      i < lit ? (level > 0.3 ? PALETTE.ok : PALETTE.danger) : alpha(PALETTE.bgVoid, 0.7);
    c.fillRect(x + i * step, y, w, h);
  }
}

export const deepsite: ArtDirection = {
  id: 'deepsite',
  label: 'Deep Site',

  /*
   * Chrome is the same rock the site is cut from, one long step darker, so the panel edges read
   * as the frame of a viewing port rather than as a separate product. Cyan survives from the
   * shipped palette because it is the one part of the current identity worth keeping: it is the
   * only cool light on a warm site, which makes the bot findable.
   */
  palette: PALETTE,

  bot: {
    hullDark: '#161d24',
    hull: '#39485a',
    hullLight: '#5d7185',
    rim: '#9fb4c6',
    glass: '#0b1015',
    tread: '#10161c',
    shadow: 'rgba(0, 0, 0, 0.5)',
  },

  fxColors: {
    dust: '#9a8873',
    spark: '#ffd166',
    chip: '#c6d0dc',
    pulse: '#3fd6c0',
    power: '#ffab3d',
    bad: '#ff6152',
    good: '#84dd6e',
  },

  /*
   * The grid has to fight a textured floor here rather than a flat one, so it is drawn as a light
   * *scribe line* — a cool near-white at low alpha, which reads as a scored joint in the plate
   * instead of as an overlay, and stays visible over both the lit and shadowed halves of a tile.
   */
  overlay: {
    grid: 'rgba(214, 231, 240, 0.14)',
    gridMajor: 'rgba(214, 231, 240, 0.34)',
    goal: '#ffab3d',
    hover: '#3fd6c0',
    vignette: '#000000',
    outOfBounds: '#04070a',
  },

  metrics: {
    gridWidth: 1,
    gridMajorWidth: 1.5,
    gridMinTilePx: 8,
    outlineWidth: 2,
    botDetailTilePx: 18,
  },

  botAccents: [
    '#3fd6c0',
    '#ffab3d',
    '#84dd6e',
    '#ff6152',
    '#5aa9ff',
    '#ff85d2',
    '#ffd166',
    '#a98ae0',
    '#5ce1e6',
    '#f2825b',
    '#a3e635',
    '#e879f9',
  ],

  /* Mid-value lit floor, so a darkening works and is the honest choice. */
  trail: { cold: '#0d1216', hot: '#ff6152', minAlpha: 0.2, maxAlpha: 0.44 },
  referenceFloor: FLOOR,

  paintTerrain,
  drawBot,
  backdrop,
  post,
};
