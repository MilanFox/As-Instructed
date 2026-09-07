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
  CropPaint,
  ItemPaint,
  MachinePaint,
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

/**
 * The camera, expressed as one number: how far a solid's top face is pushed north of its own cell.
 *
 * The board is seen from above and slightly to the south, so a block standing on a cell projects
 * its top face *up* the screen and shows the vertical face it stands on inside the bottom of that
 * cell. This is the only place the projection is stated; every raised thing on the board is a
 * multiple of it, and the tile north of a wall is what pays for it.
 *
 * 0.2 is where the argument between depth and legibility settles. Below about 0.15 the face is
 * one or two pixels at the small rungs and the block goes back to being a darker square; above a
 * quarter the walkable tile north of a wall run loses enough of itself that a player has to think
 * about whether they could stand there, and that is a puzzle cost, not an atmosphere cost.
 */
const SOLID_RISE = 0.2;

/**
 * Height by kind, because height is information.
 *
 * A wall is built and a boulder is dropped, so the wall stands a little prouder; rubble is a pile
 * you could see over and reads as one at less than half the rise. This is the cheapest way to say
 * "these three obstacles are not the same obstacle" without spending another hue.
 */
const RISE_SCALE: Readonly<Record<string, number>> = {
  [Terrain.Wall]: 1,
  [Terrain.Void]: 1,
  [Terrain.Rock]: 0.85,
  [Terrain.Ore]: 0.85,
  [Terrain.Rubble]: 0.42,
};

/**
 * How far the key light throws a solid's shadow across the floor, south *and* east in equal
 * measure because the lamp is due north-west.
 *
 * Paired with `SOLID_RISE` this pins the lamp's elevation at about 34 degrees and it never moves
 * again — the shadow of a wall is the same length in world 1 and world 8, which is what turns the
 * shading into something a player reads rather than something they look at.
 */
const SHADOW_REACH = 0.28;
/** Where a solid meets the plate. Ambient light does not reach into a corner. */
const CONTACT_DEPTH = 0.09;

/**
 * The one shadow colour, cool because the only warm source on the site is the key light itself
 * and a shadow is by definition the absence of it.
 *
 * The umbra has to clear the floor's own texture or nobody reads it as a shadow: `FLOOR_SPREAD`
 * swings a plate by about a seventh either side of its mid, so anything under a fifth is
 * indistinguishable from the grain and was, in the first draft. A third clears it by more than
 * two to one. Going further is where it starts to cost: the trail's cold end is a *darkening* and
 * survives a multiplicative shadow almost untouched, but the grid, the ripe-crop mark and the pad
 * stencil are additive lifts, and a corridor — which is shadow on both sides — stops reading as
 * the same material as an open floor.
 */
const SHADOW_INK = '#04090f';
const UMBRA = alpha(SHADOW_INK, 0.32);
const CONTACT = alpha(SHADOW_INK, 0.3);
const OCCLUDE_S = alpha(SHADOW_INK, 0.28);
const OCCLUDE_E = alpha(SHADOW_INK, 0.2);

/**
 * How far below a material's own darkest tone its south face sits.
 *
 * These two are the whole legibility of the extrusion and they are multipliers rather than
 * colours on purpose: a face has to be darker than the *darkest* thing on the top it belongs to,
 * in every biome, or the block goes back to being a flat square with a smudge on it. `paintRock`
 * paints facets all the way down to `deep`, so anchoring the face at `deep` and dividing is the
 * only version of this that survives a cave wall as well as a hangar panel.
 */
const FACE_UPPER = 0.62;
const FACE_FOOT = 0.34;

/** Rise in device pixels. Never zero, or a solid at the far rung loses its face entirely. */
function risePx(T: number, scale: number): number {
  return Math.max(1, Math.round(T * SOLID_RISE * scale));
}

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
  /*
   * The south faces. Every solid material is authored twice — once as the top the light lands on
   * and once as the wall it stands on — and the face rows carry the same four variants as their
   * tops so a chipped boulder and its own face agree about where the rock broke.
   */
  faceWall: 13,
  faceRock: 14,
  faceOre: 15,
  faceRubble: 16,
  faceVoid: 17,
  litN: 18,
  litW: 19,
  darkE: 20,
  castN: 21,
  castW: 22,
  castNW: 23,
  aoS: 24,
  aoE: 25,
} as const;
const SHEET_ROWS = 26;
const SHEET_COLS = 4;

/** Which top and which face a solid is drawn from, and how tall it stands. */
const SOLID_ROW: Readonly<Record<string, number>> = {
  [Terrain.Wall]: ROW.wall,
  [Terrain.Void]: ROW.outside,
  [Terrain.Rock]: ROW.stone,
  [Terrain.Ore]: ROW.ore,
  [Terrain.Rubble]: ROW.rubble,
};
const FACE_ROW: Readonly<Record<string, number>> = {
  [Terrain.Wall]: ROW.faceWall,
  [Terrain.Void]: ROW.faceVoid,
  [Terrain.Rock]: ROW.faceRock,
  [Terrain.Ore]: ROW.faceOre,
  [Terrain.Rubble]: ROW.faceRubble,
};

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

/**
 * The vertical face a raised solid stands on — the plane you could put a hand flat against, and
 * the whole reason a wall run reads as a run rather than as a row of darker squares.
 *
 * It is two flat bands, not a gradient. The upper band is what the bounce off the plate still
 * reaches; the lower band is the ground's own contact shadow thrown back up the wall, and the hard
 * break between them is the mark the eye reads as "this surface is vertical". Faces are never lit:
 * they point south, the lamp is north-west, and a face that ever caught a highlight would put a
 * second light on the site.
 *
 * `chip` wobbles the arris by up to that many pixels, on a six-column rhythm, so a cut rock face
 * is not a ruled line. `ribs`, for built wall, scores the face into panels lit on their west cheek
 * — the one place a face is allowed a lighter value, and only because a rib is a corner, not a
 * plane.
 */
function paintFace(
  c: Ctx,
  T: number,
  H: number,
  col: number,
  r: Ramp,
  chip: number,
  ribs: number,
): void {
  const foot = Math.max(1, Math.round(H * 0.36));
  c.fillStyle = shade(r.deep, FACE_UPPER);
  c.fillRect(0, 0, T, H);
  c.fillStyle = shade(r.deep, FACE_FOOT);
  c.fillRect(0, H - foot, T, foot);

  if (ribs > 0) {
    const step = Math.max(3, Math.round(T / ribs));
    const w = Math.max(1, Math.round(T * 0.035));
    for (let x = step >> 1; x < T; x += step) {
      c.fillStyle = shade(r.deep, FACE_FOOT);
      c.fillRect(x, 0, w, H);
      c.fillStyle = shade(r.deep, FACE_UPPER * 1.5);
      c.fillRect(Math.max(0, x - w), 0, w, H - foot);
    }
  }
  if (chip > 0) {
    const seg = Math.max(2, Math.round(T / 6));
    for (let x = 0; x < T; x += seg) {
      const d = Math.round(hash(col, x, 131) * chip);
      if (d <= 0) continue;
      c.fillStyle = r.deep;
      c.fillRect(x, 0, Math.min(seg, T - x), Math.min(d, H - foot));
    }
  }
}

/** Three hard steps of what reaches the bottom of a hole, darkest first. */
const PIT_SPILL: readonly string[] = ['#0d151c', '#17242e', '#243743'];

/**
 * A hole, drawn as the exact inversion of a block.
 *
 * A block is bright along its north and west arris and carries its dark face to the south. A pit
 * is the same statement read backwards: black along the north and west, and the only light in it
 * pooled on the south-east. That is not a stylistic mirror, it is what the fixed lamp does — the
 * beam comes over the north-west lip, so the inner wall directly beneath that lip gets nothing at
 * all and the far-lower inside of the hole gets everything.
 *
 * The near lip is the shout. A pit is the one terrain that kills a bot for driving onto it, so the
 * chamfer along the *south* edge is deliberately the brightest value anywhere in the terrain layer.
 * Putting it opposite the block's lit arris is what makes the two impossible to confuse at 24px.
 *
 * `col` carries which inner surfaces exist: bit 0 for the north wall, bit 1 for the near lip. A
 * pit that continues into its neighbour has neither, so a pond of them reads as one hole.
 */
function paintPit(c: Ctx, T: number, D: number, col: number): void {
  const g = Math.max(1, Math.round(T / 12));
  c.fillStyle = '#05090d';
  c.fillRect(0, 0, T, T);

  /*
   * The beam, as three stepped bands running north-east to south-west.
   *
   * The shadow the near-west lip throws across the bottom of a hole is a straight line square to
   * the light, which on a north-west lamp is a diagonal — so the lit part of the hole is its
   * south-east triangle and the steps run parallel to that edge. Drawn as a staircase of bars for
   * the same reason `stepLine` exists, and hard-edged rather than dithered because a dithered
   * version of this reads as texture on a black tile instead of as light arriving in it.
   */
  const step = Math.max(1, Math.round(T / 8));
  for (let k = 0; k < 3; k++) {
    c.fillStyle = (PIT_SPILL[k] ?? '#101820') as string;
    const cut = (0.6 + k * 0.42) * T;
    for (let y = 0; y < T; y += step) {
      const x = Math.max(0, Math.round(cut - y));
      if (x < T) c.fillRect(x, y, T - x, Math.min(step, T - y));
    }
  }

  if ((col & 1) === 1) {
    c.fillStyle = '#000000';
    c.fillRect(0, 0, T, D);
  }
  if ((col & 2) === 2) {
    const b = Math.max(1, Math.round(D * 0.62));
    dither(c, 0, T - b * 2, T, b, Math.max(1, g >> 1), '#5f707d', 0.5, 3);
    c.fillStyle = '#b6c7d3';
    c.fillRect(0, T - b, T, b);
  }
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

/**
 * The light, as five transparent overlays that compose over any material.
 *
 * Two of them belong to a solid's *top* face and are blitted with it, a tile-height above the
 * cell: the lit north arris, which is the block's silhouette against the plate behind it, and the
 * dark east chamfer. There is no south equivalent any more — the south of a solid is a real face
 * with its own row, and a bevel pretending to be one was the flatness this direction was accused
 * of.
 *
 * The other three are the cast shadow, and they are a genuine projection rather than a band on an
 * edge. A block of height `SOLID_RISE` under a lamp at `SHADOW_REACH` throws its footprint
 * south-east by exactly that reach; intersecting that rectangle with the neighbouring cell leaves
 * three disjoint pieces — a top band inset from the west, a left band inset from the north, and
 * the corner between them. Disjoint matters: they never overlap, so a floor tile in an inside
 * corner is one shadow value rather than three stacked ones, which is what "there is one lamp"
 * has to mean when you look at it.
 */
function paintEdge(c: Ctx, T: number, row: number): void {
  const g = Math.max(1, Math.round(T / 12));
  const lit = '#dbe8f0';
  const reach = Math.max(1, Math.round(T * SHADOW_REACH));
  const near = Math.max(1, Math.round(T * CONTACT_DEPTH));
  switch (row) {
    /*
     * An arris is a line, not a band.
     *
     * The first pass at this was a wide half-coverage checker and at 40px it read as chrome
     * trim — a dazzle strip laid along the top of every wall rather than the edge of a solid
     * catching the lamp. What an edge actually needs is one hard bright rule and one row of
     * dither to stop it, at half the dither cell so the falloff reads as falloff rather than as
     * a pattern in its own right.
     */
    case ROW.litN: {
      const d = Math.max(1, Math.round(T * 0.07));
      c.fillStyle = alpha(lit, 0.46);
      c.fillRect(0, 0, T, d);
      dither(c, 0, d, T, d, Math.max(1, g >> 1), alpha(lit, 0.46), 0.5, 0);
      break;
    }
    case ROW.litW: {
      const d = Math.max(1, Math.round(T * 0.055));
      c.fillStyle = alpha(lit, 0.3);
      c.fillRect(0, 0, d, T);
      dither(c, d, 0, d, T, Math.max(1, g >> 1), alpha(lit, 0.3), 0.5, 2);
      break;
    }
    case ROW.darkE: {
      const d = Math.max(1, Math.round(T * 0.07));
      c.fillStyle = alpha('#000000', 0.32);
      c.fillRect(T - d, 0, d, T);
      dither(c, T - d * 2, 0, d, T, Math.max(1, g >> 1), alpha('#000000', 0.32), 0.5, 3);
      break;
    }
    case ROW.castN: {
      c.fillStyle = UMBRA;
      c.fillRect(reach, 0, T - reach, reach);
      c.fillStyle = CONTACT;
      c.fillRect(0, 0, T, near);
      break;
    }
    case ROW.castW: {
      c.fillStyle = UMBRA;
      c.fillRect(0, reach, reach, T - reach);
      c.fillStyle = CONTACT;
      c.fillRect(0, 0, near, T);
      break;
    }
    case ROW.castNW: {
      c.fillStyle = UMBRA;
      c.fillRect(0, 0, reach, reach);
      break;
    }
    /*
     * Occlusion where no shadow can fall. A solid to the south or the east is standing between
     * the plate and nothing — the lamp is behind the camera's shoulder on the other diagonal — so
     * all these two carry is the corner darkening every join has.
     *
     * `aoS` is drawn a rise *above* the cell's south edge, because that edge is under the block
     * in front of it. Landing a dark strip immediately above the block's lit north arris is what
     * makes the silhouette snap, and it is the only mark in the set whose position is derived
     * from the projection rather than from the tile.
     */
    case ROW.aoS: {
      const up = risePx(T, 1);
      c.fillStyle = OCCLUDE_S;
      c.fillRect(0, T - up - near, T, up + near);
      break;
    }
    case ROW.aoE: {
      c.fillStyle = OCCLUDE_E;
      c.fillRect(T - near, 0, near, T);
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
  /* A cut face wobbles by a third of its own height and a built one does not wobble at all. */
  const chip = Math.max(1, Math.round(risePx(T, 1) * 0.34));
  const ribs = T >= 24 ? 3 : 2;

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
          paintPit(c, T, risePx(T, 1), col);
          break;
        case ROW.faceWall:
          paintFace(
            c,
            T,
            risePx(T, 1),
            col,
            wall,
            site.wallKind === 'panel' ? 0 : chip,
            site.wallKind === 'panel' ? ribs : 0,
          );
          break;
        case ROW.faceRock:
          paintFace(c, T, risePx(T, RISE_SCALE[Terrain.Rock] ?? 1), col, stone, chip, 0);
          break;
        case ROW.faceOre:
          paintFace(c, T, risePx(T, RISE_SCALE[Terrain.Ore] ?? 1), col, stone, chip, 0);
          // The vein does not stop at the top of the block. Two pips on the face are what say the
          // deposit runs into the rock rather than sitting on it.
          c.fillStyle = shade(PALETTE.bronze, 0.7);
          for (let i = 0; i < 2; i++) {
            const s = Math.max(1, Math.round(T * 0.08));
            c.fillRect(
              Math.round((0.2 + hash(col, i, 137) * 0.55) * T),
              Math.max(0, risePx(T, RISE_SCALE[Terrain.Ore] ?? 1) - s * 2),
              s,
              s,
            );
          }
          break;
        case ROW.faceRubble:
          paintFace(c, T, risePx(T, RISE_SCALE[Terrain.Rubble] ?? 1), col, stone, chip, 0);
          break;
        case ROW.faceVoid:
          paintFace(c, T, risePx(T, 1), col, outside, chip, 0);
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
  /* Standing height in device pixels, so the second pass never has to look a terrain up twice. */
  const rise = new Uint8Array(stride * (h + 2)).fill(risePx(T, 1));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tile = world.tiles[y * w + x];
      const i = (y + 1) * stride + (x + 1);
      if (!tile) continue;
      const isSolid = SOLIDS.has(tile.terrain);
      solid[i] = isSolid ? 1 : 0;
      rise[i] = isSolid ? risePx(T, RISE_SCALE[tile.terrain] ?? 1) : 0;
      if (tile.terrain === Terrain.Cable || tile.terrain === Terrain.Depot) cable[i] = 1;
      if (tile.terrain === Terrain.Pit) pit[i] = 1;
    }
  }

  const blit = (row: number, col: number, dx: number, dy: number): void => {
    ctx.drawImage(sheetCanvas, col * T, row * T, T, T, dx, dy, T, T);
  };
  /** The top `hgt` pixels of a stamp. How a face, which is shorter than a tile, gets on the board. */
  const band = (row: number, col: number, dx: number, dy: number, hgt: number): void => {
    ctx.drawImage(sheetCanvas, col * T, row * T, T, hgt, dx, dy, T, hgt);
  };

  const floorRamp = ramp(site.floor, FLOOR_SPREAD);

  /*
   * Pass one: the ground plane, and everything the light does to it.
   *
   * Every mark here stays inside its own cell, so the order within the pass does not matter — and
   * every mark here is *under* whatever stands on the board, which is the whole readability
   * argument. A cast shadow lands on the plate and on nothing else: crops, machines, items and
   * bots are all painted live after the cache, so no shadow can ever reach a ripe head of grain,
   * a depot housing or a bot's accent. Shading the ground is free of consequence in a way that
   * shading an object is not.
   */
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y + 1) * stride + (x + 1);
      if (solid[i] === 1) continue;
      const tile = world.tiles[y * w + x];
      if (!tile) continue;
      const ox = x * T;
      const oy = y * T;
      const v = (hash(x, y, 1) * 4) | 0;
      switch (tile.terrain) {
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
        /*
         * A hole shows the two inner surfaces the camera can see and no others, so it is keyed on
         * whether it continues into its neighbours: a pond of pits is one hole with one north wall
         * and one near lip, not a grid of them.
         */
        case Terrain.Pit:
          blit(ROW.pit, (pit[i - stride] === 1 ? 0 : 1) | (pit[i + stride] === 1 ? 0 : 2), ox, oy);
          continue;
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

      /*
       * The three shadow pieces are disjoint by construction, so each one is asked for on its own
       * caster and nothing is ever darkened twice. A pit is skipped: a hole is already the darkest
       * thing on the board and a shadow drawn into it is a shadow nobody can see.
       */
      if (solid[i - stride] === 1) blit(ROW.castN, 0, ox, oy);
      if (solid[i - 1] === 1) blit(ROW.castW, 0, ox, oy);
      if (solid[i - stride - 1] === 1) blit(ROW.castNW, 0, ox, oy);
      if (solid[i + stride] === 1) blit(ROW.aoS, 0, ox, oy);
      if (solid[i + 1] === 1) blit(ROW.aoE, 0, ox, oy);
    }
  }

  /*
   * Pass two: the volumes, north to south.
   *
   * A solid's top face is blitted a rise *above* its own cell and its south face fills the bottom
   * of that cell, so a block covers part of the plate behind it — which is what occlusion is, and
   * is the one thing the flat version of this direction could never say. Row order is the whole
   * correctness argument: southern geometry is painted after northern geometry, so a wall in front
   * of a wall covers it exactly, and a run of them closes into one continuous mass with no seam.
   *
   * The face is skipped whenever the solid to the south stands at least as tall, because that
   * neighbour's own top face lands precisely on top of it. Where the neighbour is shorter — rubble
   * banked against a wall — the sliver of face above it survives, which is correct and free.
   */
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y + 1) * stride + (x + 1);
      if (solid[i] === 0) continue;
      const tile = world.tiles[y * w + x];
      const terrain = tile ? tile.terrain : Terrain.Void;
      const ox = x * T;
      const oy = y * T;
      const up = rise[i] as number;
      const top = oy - up;
      const v = tile ? (hash(x, y, 1) * 4) | 0 : (x ^ y) & 3;
      blit(SOLID_ROW[terrain] ?? ROW.outside, v, ox, top);
      if (solid[i - stride] === 0) blit(ROW.litN, 0, ox, top);
      if (solid[i - 1] === 0) blit(ROW.litW, 0, ox, top);
      if (solid[i + 1] === 0) blit(ROW.darkE, 0, ox, top);
      if ((rise[i + stride] as number) < up) {
        band(FACE_ROW[terrain] ?? ROW.faceVoid, v, ox, oy + T - up, up);
      }
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
/**
 * The pack, and everything the machine wears rather than is: one long step below any hull tone.
 *
 * It has to sit under `BOT_HULL.deep` in every accent, because the back of a bot and the front of
 * a bot are told apart by which of the two is the darker block — a distinction that has to hold
 * with the hue thrown away.
 */
const BOT_PACK = ramp('#232b34', SOLID_SPREAD);
/** The lamp. Warm, because the site is lit by working light and not by daylight. */
const BOT_LAMP = '#ffe6b8';

/**
 * The contact shadow: the hard bar directly under the soles, where no ambient light gets in.
 *
 * The *cast* goes through `castBlock` with everything else that stands on the plate. This is the
 * other half of the same lamp, and `docs/DESIGN.md` §8 holds it at 0.34 against terrain's `UMBRA` at
 * 0.32 on purpose — two shadow densities on one screen read as two lamps.
 */
const SHADE = alpha('#000000', 0.34);

/**
 * The pool the visor throws on the plate: three hard bands widening away from the face.
 *
 * Nine fixed strings, indexed by band and by a three-step quantised flicker, for the reason
 * `SPILL` gives — a strength multiplied into `alpha()` per frame is a colour string the canvas has
 * never seen before, once per bot per frame, and parsing is not free.
 *
 * Hard bands rather than `dither`: every `cell` in this file is a tile fraction, so a dithered
 * mark costs the same block count at 16 px as at 48. That is fine inside the cached terrain sheet
 * and a trap on a layer that redraws twenty bots a frame.
 */
const BOT_POOL: readonly string[] = [
  alpha(BOT_LAMP, 0.22),
  alpha(BOT_LAMP, 0.25),
  alpha(BOT_LAMP, 0.28),
  alpha(BOT_LAMP, 0.12),
  alpha(BOT_LAMP, 0.14),
  alpha(BOT_LAMP, 0.16),
  alpha(BOT_LAMP, 0.05),
  alpha(BOT_LAMP, 0.07),
  alpha(BOT_LAMP, 0.09),
];

/**
 * THE CONTRACTOR.
 *
 * Not a token with an arrow on it. A small, stooped, dutiful thing that stands on two boots and
 * carries a pack it was issued and never asked about: soles on the plate, a squat torso, a cowled
 * head on a short neck, and one lamp behind a visor where a face would be. The writing is a dry
 * corporate horror about a subcontractor who has never seen the planet it is standing on, and the
 * posture is written to agree with it — the head is always *down and forward*, leaning into the
 * next instruction, and the pack is always on. It is never upright. It is never at ease.
 *
 * The one deliberate cruelty in the pose: **the head only comes up when the bot is walking away
 * from you.** Turn it to face the camera and it drops its chin into its shoulders and shows you a
 * lamp instead of a face. That is not a rendering trick — it is the perspective being honest about
 * a figure that leans in the direction it travels — but it is the reading the character wants.
 *
 * Everything is axis-aligned rects under the one north-west lamp of `docs/DESIGN.md` §8: base on
 * the cell's south edge, top pushing north, lit north and west, deep south, shadow south-east.
 * `volume()` and `castBlock()` do all of it, so the bot is lit by the same lamp as the walls.
 */

/**
 * Half the shoulder span, front-on and edge-on.
 *
 * Two numbers rather than one because turning ninety degrees swaps a figure's width for its depth,
 * and under a top-down camera that is mostly a change of *screen width*. So the four facings split
 * into two silhouette families before a single detail is drawn: N/S is the broad one, E/W the
 * narrow one. The pair also has to survive rounding at the floor rung — 0.22 and 0.17 are eight
 * and six device pixels at 16, which is the smallest gap that is still a gap.
 */
const BOT_SHOULDER = 0.22;
const BOT_SHOULDER_SIDE = 0.17;
/** Where the soles meet the plate: the south edge of the bot's own footprint. */
const BOT_STAND = 0.33;
const BOT_BOOT = 0.1;
const BOT_TORSO = 0.34;
/** Edge-on the torso is a shade taller on screen, for the same reason it is narrower. */
const BOT_TORSO_SIDE = 0.36;
/**
 * The head is deliberately oversized against the body — as wide as the shoulders, or wider.
 *
 * That is the caricature every readable small-scale character is built on, and it is also the
 * practical answer at 16 px: a head in proportion to the body is three pixels there and carries
 * no facing at all, while this one is five or six and can hold a visor.
 */
const BOT_COWL_W = 0.3;
const BOT_COWL_H = 0.19;
/**
 * How far the head is thrown ahead of the shoulders, in tile fractions.
 *
 * This is the whole facing tell and it is sized against the smallest rung: at 16 device px it is
 * two pixels on a body eight wide, which is enough for the cowl to break the torso's silhouette
 * on the leading side and leave a visible neck on the trailing one. Below 0.1 it rounds to one
 * pixel at 16 and the head goes back to being centred.
 */
const BOT_LEAN = 0.12;
/** The arris width for a lit top edge. */
const BOT_BEVEL = 0.07;

/**
 * The head, per facing, indexed by `Dir`: north, east, south, west.
 *
 * Not stylisation — a rigid head at a fixed height, seen under a top-down camera, really is
 * smaller and higher on screen when it leans away and larger and lower when it leans towards you.
 * Encoding it as three tables keeps the four facings four different *shapes* rather than four
 * positions of one shape, which is what has to survive the greyscale check in `marks.test.ts`.
 *
 * `COWL_SIT` is where the cowl's foot sits relative to the shoulder line, in cowl heights.
 * Negative lifts it clear and exposes the neck; positive sinks it into the collar.
 */
const COWL_W_SCALE = [0.85, 1.05, 1.2, 1.05] as const;
const COWL_H_SCALE = [0.85, 1, 1.2, 1] as const;
const COWL_SIT = [-0.55, 0.2, 0.6, 0.2] as const;

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
 * The lamp pool, as three hard bands widening away from the visor.
 *
 * Drawn on the floor rather than as a cone over it, because a `lighter` gradient is a different
 * medium from everything else here — and because a pool that lands *on* the plate is the thing
 * that says the machine is standing in a place with a floor. It is also the cheapest facing cue
 * on the board: three `fillRect`s that live entirely outside the body, so they survive at 16 px
 * where a mark inside a ten-pixel silhouette would not.
 *
 * `front` is the gap between (`cx`, `cy`) and the near band, along the facing axis, and `span` is
 * that band's half-extent across it. The caller keeps the whole thing at ground level — a pool
 * that spans the machine's *height* is a wall of light standing on its edge, which is what the
 * first pass drew.
 */
function lampPool(
  c: Ctx,
  cx: number,
  cy: number,
  front: number,
  span: number,
  fx: number,
  fy: number,
  T: number,
  pulse: number,
): void {
  const depth = Math.max(1, Math.round(T * 0.09));
  for (let k = 0; k < 3; k++) {
    const spread = span + k * depth;
    c.fillStyle = BOT_POOL[k * 3 + pulse] as string;
    if (fx !== 0) {
      const x = fx > 0 ? cx + front + k * depth : cx - front - (k + 1) * depth;
      c.fillRect(x, cy - spread, depth, spread * 2);
    } else {
      const y = fy > 0 ? cy + front + k * depth : cy - front - (k + 1) * depth;
      c.fillRect(cx - spread, y, spread * 2, depth);
    }
  }
}

/**
 * One contractor, standing on a cell.
 *
 * Built bottom-up in the order the camera stacks it: contact, cast, pool, then the parts that are
 * furthest north first, so a head that leans away goes *behind* the shoulders and a head that
 * leans towards you goes over the chest. That single ordering is what makes north and south two
 * different pictures rather than one picture with a light on it.
 *
 * The far form below `botDetailTilePx` drops the west shoulder and the east flank of every block,
 * the arms and the stride — one device pixel each at that size, where they stop being faces and
 * start eating the silhouette. It keeps every part that has an outline: boots, torso, pack or
 * chest, neck, cowl, visor, pool.
 */
function drawBot(c: Ctx, pose: BotPose, tilePx: number, options: BotDrawOptions): void {
  const T = tilePx;
  const cx = Math.round((pose.x + 0.5) * T);
  const cy = Math.round((pose.y + 0.5) * T);
  const dead = !pose.alive;
  const reduced = options.reduced;
  const detail = T >= deepsite.metrics.botDetailTilePx * options.dpr;
  const accent = accentRamp(dead ? BOT_DEAD.lit : options.accent);
  const hull = dead ? BOT_DEAD : BOT_HULL;
  const pack = dead ? BOT_DEAD : BOT_PACK;

  const f = pose.facing & 3;
  const fx = BOT_STEP_X[f] as number;
  const fy = BOT_STEP_Y[f] as number;
  const horiz = fx !== 0;

  const e = tileSpan(T, BOT_BEVEL);
  const lean = tileSpan(T, BOT_LEAN);

  /* Squash and stretch along the travel axis. Both are exactly one at rest. */
  const along = 1 + pose.stretch;
  const wScale = horiz ? along : 1 / along;
  const hScale = horiz ? 1 / along : along;

  const hw = Math.max(2, Math.round(T * (horiz ? BOT_SHOULDER_SIDE : BOT_SHOULDER) * wScale));
  const bootH = Math.max(1, Math.round(T * BOT_BOOT * hScale));
  const torsoH = Math.max(2, Math.round(T * (horiz ? BOT_TORSO_SIDE : BOT_TORSO) * hScale));
  /* A wind-up is a machine gathering itself and a landing is it absorbing one: the knees give. */
  const crouch = Math.round((pose.anticipate * 0.05 + pose.settle * 0.04) * T);
  /* Toes are nearer the camera than heels, so a bot walking at you stands a little longer. */
  const toe = fy > 0 ? e : 0;
  const footY = cy + Math.max(2, Math.round(T * BOT_STAND));
  const sole = footY + toe;
  const torsoY = footY - bootH - torsoH + crouch;
  const torsoW = hw * 2;
  const x0 = cx - hw;
  /*
   * The limbs, and the one measurement that decides whether this is a figure or a crate.
   *
   * A rectangle standing on a cell is a crate no matter what is painted on it. What is read as a
   * *body* — before any detail resolves, at 16 device px, out of the corner of an eye — is a
   * silhouette that steps out at the shoulders, runs straight down, and splits into two feet. So
   * the limbs are drawn *outside* the torso rather than inset into it: that keeps the torso one
   * block wide enough to carry the livery, and puts the step in the outline where it does work.
   */
  const limbW = Math.max(1, Math.round(T * 0.05));
  const packW = Math.max(1, Math.round(T * 0.075));
  const limbY = torsoY + Math.max(1, Math.round(torsoH * 0.28));
  const limbH = Math.max(1, footY - limbY - (bootH >> 1));
  const stubH = Math.max(1, Math.round(torsoH * 0.34));

  const sit = dead ? 0.45 : (COWL_SIT[f] as number);
  const cowlW = Math.max(2, Math.round(T * BOT_COWL_W * (COWL_W_SCALE[f] as number) * wScale));
  const cowlH = Math.max(2, Math.round(T * BOT_COWL_H * (COWL_H_SCALE[f] as number) * hScale));
  const cowlB = torsoY + Math.round(cowlH * sit);
  const cowlY = cowlB - cowlH;
  const cowlX = cx - (cowlW >> 1) + fx * lean;
  const topY = Math.min(cowlY, torsoY);
  const inW = Math.max(1, torsoW - e * 2);

  c.save();

  /* Cast first, then contact: the projection is the lift, the bar under the soles is the weight. */
  castBlock(c, x0, torsoY, torsoW, sole - torsoY, T, detail);
  c.fillStyle = SHADE;
  c.fillRect(x0, sole - e, torsoW, e);

  if (!dead) {
    const pulse = reduced ? 1 : (Math.sin(options.time * 7 + pose.id * 2.3) + 1.5) | 0;
    /* The pool lands on the plate, so it starts at the sole going south and edge-on, and clears
     * the head going north — north of a bot is the one direction where its own body is in the way
     * of the floor it is lighting. */
    const poolY = horiz ? sole - e : fy > 0 ? sole : topY;
    const poolFront = horiz ? hw : fy > 0 ? 0 : lean;
    lampPool(c, cx, poolY, poolFront, tileSpan(T, horiz ? 0.17 : 0.13), fx, fy, T, pulse);
  }

  /* The collar: the top of the pack, standing proud behind the head. Visible only once the head
   * has lifted clear of it — which is to say, only when the bot has turned its back on you. Drawn
   * in pack tones rather than hull, so the head stays a lighter block sitting on a darker one
   * instead of the two fusing into one stalk. */
  if (cowlB < torsoY) {
    volume(c, cowlX, cowlB - e, cowlW, torsoY - cowlB + e, pack, e, detail);
  }

  /* Head behind the shoulders when it leans north, over the chest when it leans south. */
  const behind = cowlB <= torsoY;
  if (behind) volume(c, cowlX, cowlY, cowlW, cowlH, hull, e, detail);

  /*
   * The limbs, before the torso, so the torso's own shading closes over where they join.
   *
   * Front-on and from behind there are two arms and the lamp does the telling — the west one takes
   * the light, the east one does not. Edge-on there is one arm on the leading side and the pack on
   * the trailing side, which is wider and darker, so east and west are two different outlines and
   * not one outline in two positions.
   */
  const armH = detail ? limbH : stubH;
  if (horiz) {
    c.fillStyle = fx > 0 ? hull.dark : hull.lit;
    c.fillRect(fx > 0 ? x0 + torsoW : x0 - limbW, limbY, limbW, armH);
    volume(c, fx > 0 ? x0 - packW : x0 + torsoW, torsoY + e, packW, torsoH - e, pack, e, detail);
  } else {
    c.fillStyle = hull.lit;
    c.fillRect(x0 - limbW, limbY, limbW, armH);
    c.fillStyle = hull.dark;
    c.fillRect(x0 + torsoW, limbY, limbW, armH);
  }

  volume(c, x0, torsoY, torsoW, torsoH, hull, e, detail);

  /*
   * What is on the torso is the second half of the facing tell, and it is a value, not a hue.
   * Back: the pack, darker than any hull tone, with one strap of livery. Front: the hi-vis plate,
   * which is the brightest large block on the machine. Edge-on: one band of each, and which side
   * they land on is the answer to east-or-west.
   */
  const inY = torsoY + e;
  const inH = Math.max(1, torsoH - e * 2);
  if (fy < 0) {
    volume(c, x0 + e, inY, inW, inH, pack, e, detail);
    c.fillStyle = accent.mid;
    c.fillRect(x0 + e, torsoY + torsoH - e * 3, inW, e);
  } else if (fy > 0) {
    const chestY = Math.max(inY, cowlB);
    const chestH = torsoY + torsoH - e - chestY;
    if (chestH > 0) volume(c, x0 + e, chestY, inW, chestH, accent, e, detail);
  } else {
    const band = Math.max(1, Math.round(inW * 0.45));
    c.fillStyle = accent.mid;
    c.fillRect(fx > 0 ? x0 + torsoW - e - band : x0 + e, inY, band, inH);
    c.fillStyle = pack.mid;
    c.fillRect(fx > 0 ? x0 + e : x0 + torsoW - e - band, inY, band, inH);
  }

  /*
   * Boots. Two of them, apart, with the leading one longer — a toe is what stops a pair of blocks
   * reading as a plinth. The stride is the motion agent's dial: zero at rest, so the guard test
   * cannot pass on it.
   */
  const bootW = Math.max(1, Math.round(torsoW * 0.38));
  const stride = detail ? Math.round(Math.sin(pose.travel * Math.PI * 2) * lean * 0.5) : 0;
  const bootY = footY - bootH;
  c.fillStyle = dead ? BOT_DEAD.deep : BOT_TREAD.mid;
  if (horiz) {
    const front = fx > 0 ? x0 + torsoW - bootW : x0 - lean;
    const rear = fx > 0 ? x0 : x0 + torsoW - bootW;
    c.fillRect(front + stride, bootY, bootW + lean, bootH);
    c.fillRect(rear - stride, bootY, bootW, bootH);
  } else {
    c.fillRect(x0, bootY + stride, bootW, sole - bootY - stride);
    c.fillRect(x0 + torsoW - bootW, bootY - stride, bootW, sole - bootY + stride);
  }

  if (!behind) volume(c, cowlX, cowlY, cowlW, cowlH, hull, e, detail);

  /*
   * The visor. One lamp where a face would be, and the only near-white on the machine.
   *
   * Facing you it is a wide bar across the whole cowl; edge-on it is a slot on the leading side;
   * facing away there is nothing lit on the bot at all, and that absence is the tell. It is the
   * single biggest luminance event in the sprite, so it does the work at 16 px that no two-pixel
   * bevel can.
   */
  if (!dead) {
    if (fy > 0) {
      const vw = Math.max(2, cowlW - e * 2);
      const vh = Math.max(1, Math.round(cowlH * 0.42));
      c.fillStyle = BOT_LAMP;
      c.fillRect(cowlX + ((cowlW - vw) >> 1), cowlB - e - vh, vw, vh);
    } else if (horiz) {
      const vw = Math.max(1, Math.round(cowlW * 0.3));
      const vh = Math.max(2, cowlH - e);
      c.fillStyle = BOT_LAMP;
      c.fillRect(fx > 0 ? cowlX + cowlW - vw : cowlX, cowlY + e, vw, vh - e);
    }
  }

  if (options.carrying > 0 && !dead) {
    /* Held out ahead of it, not stowed. A bot with its hands full leans further forward. */
    const load = Math.min(1, options.carrying / 4);
    const bob = reduced
      ? 0
      : Math.round(Math.sin(options.time * 6.5 + pose.id * 2.1) * load * T * 0.03);
    const crate = accentRamp(PALETTE.accent2);
    const cs = Math.max(3, Math.round(T * 0.2));
    const kx = cx - (cs >> 1) + fx * (hw - e);
    const ky = torsoY + Math.round(torsoH * 0.25) + fy * Math.round(cs * 0.8) + bob;
    volume(c, kx, ky, cs, cs, crate, e, detail);
  }

  if (pose.action > 0 && !dead) {
    /* It reaches. The arm comes out of the shoulder on the facing side and puts a fist on the cell
     * the action names, which is the one moment the posture straightens. */
    const reach = Math.round(Math.sin(Math.PI * pose.action) * T * 0.26);
    const armW = Math.max(1, Math.round(T * 0.07));
    const armY = torsoY + Math.round(torsoH * 0.3);
    c.fillStyle = accent.lit;
    if (horiz) {
      const ax = fx > 0 ? x0 + torsoW : x0 - reach;
      c.fillRect(ax, armY, reach, armW);
      c.fillRect(fx > 0 ? ax + reach - armW : ax, armY - armW, armW, armW * 3);
    } else {
      const ay = fy > 0 ? sole - (bootH >> 1) : topY - reach;
      c.fillRect(cx - (armW >> 1), ay, armW, reach);
      c.fillRect(cx - armW, fy > 0 ? ay + reach - armW : ay, armW * 3, armW);
    }
  }

  /* Powered down: one flat wash over the whole figure. Flat rather than dithered because a dead
   * bot is the one thing on the board that should read as having stopped having texture. */
  if (dead) {
    c.fillStyle = SHADE;
    if (topY < torsoY) c.fillRect(cowlX, topY, cowlW, torsoY - topY);
    c.fillRect(x0 - limbW, torsoY, torsoW + limbW * 2, sole - torsoY);
  }

  if (options.active && !dead) {
    const bx = x0 - e * 2;
    const by = topY - e * 2;
    const bw = torsoW + e * 4;
    const bh = sole - topY + e * 4;
    const arm = Math.max(2, Math.round(Math.min(bw, bh) * 0.38));
    c.fillStyle = accent.lit;
    for (let i = 0; i < 4; i++) {
      const ax = i & 1 ? bx + bw - arm : bx;
      const ay = i & 2 ? by + bh - e : by;
      c.fillRect(ax, ay, arm, e);
      c.fillRect(i & 1 ? bx + bw - e : bx, i & 2 ? by + bh - arm : by, e, arm);
    }
  }

  if (pose.blocked > 0.02 || pose.recoil > 0.04) {
    drawBotBlocked(c, pose, cx, (topY + sole) >> 1, hw, (sole - topY) >> 1, fx, fy, T, reduced);
  }
  if (pose.idle > 0 && pose.alive) {
    drawBotIdle(c, cx, topY, T, options.time, options.accent, reduced);
  }
  if (pose.failed && pose.blocked <= 0.02 && pose.alive) {
    drawBotFailed(c, cx, topY, T, Math.sin(Math.PI * Math.max(pose.action, 0.001)));
  }
  if (options.showFuel && pose.alive) drawBotFuel(c, cx, sole, T, options.fuel);

  if (options.showLabel && T >= 20 * options.dpr) {
    const px = Math.max(9, Math.round(T * 0.24));
    const label = numeral(pose.id);
    c.font = fontAt(px);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const w = Math.round(c.measureText(label).width + px * 0.8);
    const h = Math.round(px * 1.3);
    const lx = cx - Math.round(w / 2);
    const ly = topY - Math.round(T * 0.24) - h;
    c.fillStyle = PALETTE.bgVoid;
    c.fillRect(lx, ly, w, h);
    c.fillStyle = accent.lit;
    c.fillRect(lx, ly, w, e);
    c.fillStyle = PALETTE.ink;
    c.fillText(label, cx, ly + h / 2);
  }

  c.restore();
}

/**
 * DESIGN.md §8: a blocked move must look obviously different from a successful one.
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
  /* Two device pixels is the floor, not a rounding: `stepLine` walks one `fillRect` per `w` of
   * span, so a one-pixel weight at 48 px is a hundred draw calls for a mark nobody can see. */
  const w = Math.max(2, Math.round(t * 0.055));
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
  const w = Math.max(2, Math.round(t * 0.05));
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

// ---------------------------------------------------------------------------
// Equipment, crops and cargo
// ---------------------------------------------------------------------------

/** Tile fraction to device pixels, for a position. */
function tileAt(T: number, f: number): number {
  return Math.round(T * f);
}

/** Tile fraction to device pixels, for an extent that must not round out of existence. */
function tileSpan(T: number, f: number): number {
  return Math.max(1, Math.round(T * f));
}

/**
 * A solid seen from above under the one key light: lit north and west shoulders, a dark east
 * flank, a deep south face.
 *
 * Every prop on the board is built out of this rather than out of an outline, because the shading
 * is what says the object is standing on the plate rather than printed on it.
 *
 * `faces` is the near/far split for props, and it is a cost decision as much as a legibility one.
 * The west shoulder and the east flank are one device pixel wide below the detail rung — at that
 * size they stop reading as faces and start eating the body — and they are also two `fillStyle`
 * changes each, on a layer that draws fifty of these a frame.
 */
function volume(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: Ramp,
  e: number,
  faces: boolean,
): void {
  if (w <= 0 || h <= 0) return;
  c.fillStyle = r.mid;
  c.fillRect(x, y, w, h);
  c.fillStyle = r.lit;
  c.fillRect(x, y, w, e);
  if (faces) {
    c.fillRect(x, y, e, h);
    c.fillStyle = r.dark;
    c.fillRect(x + w - e, y, e, h);
  }
  c.fillStyle = r.deep;
  c.fillRect(x, y + h - e, w, e);
}

/*
 * Cast shadow as two hard steps rather than as a dither, which is the argument `paintEdge` already
 * makes for the shadow a wall throws.
 *
 * It is also the whole reason the far forms were not far forms. `dither` walks
 * `ceil(w / cell) x ceil(h / cell)` blocks and every `cell` in this file is a fraction of the tile,
 * so a dithered shadow costs the same number of blocks at 16 px as it does at 48 — the one mark on
 * the board that got no cheaper as the board got smaller. Two `fillRect`s cost two `fillRect`s at
 * every zoom, and a shadow is not a mark anyone reads detail into.
 */
const CAST_CORE = alpha('#000000', 0.24);
const CAST_EDGE = alpha('#000000', 0.13);

function castBlock(
  c: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  T: number,
  detail: boolean,
): void {
  const off = Math.max(1, Math.round(T * 0.07));
  c.fillStyle = CAST_CORE;
  c.fillRect(x + off, y + off, w, h);
  if (!detail) return;
  c.fillStyle = CAST_EDGE;
  c.fillRect(x + off, y + off + h, w, off);
  c.fillRect(x + off + w, y + off, off, h + off);
}

/** Warm working light, the same lamp the bot carries. */
const MACHINE_GLOW = '#ffe2b0';
const MACHINE_CORE = '#fff8ec';
/** Recesses, mouths, rams and dead lamps — one value darker than any housing. */
const MACHINE_RECESS = ramp('#20272d', 0.42);

/**
 * Three bands of spill, one `fillRect` each, indexed by band and by a *quantised* pulse.
 *
 * Quantised because a strength that varies continuously with `time` means a `fillStyle` string the
 * canvas has never seen before on every machine on every frame, and colour parsing is not free.
 * Nine fixed strings is a set the browser caches and the eye still reads as breathing.
 */
const SPILL: readonly string[] = [
  alpha(MACHINE_GLOW, 0.23),
  alpha(MACHINE_GLOW, 0.28),
  alpha(MACHINE_GLOW, 0.33),
  alpha(MACHINE_GLOW, 0.14),
  alpha(MACHINE_GLOW, 0.17),
  alpha(MACHINE_GLOW, 0.2),
  alpha(MACHINE_GLOW, 0.08),
  alpha(MACHINE_GLOW, 0.1),
  alpha(MACHINE_GLOW, 0.12),
];

/**
 * The powered tell, as light on the floor rather than as a pulse.
 *
 * `powered` is the one bit of state every kind carries, and a machine that says "running" only by
 * breathing says nothing at all to a player who has asked the system for stillness. So the still
 * form is the whole form: a hard-edged emissive window on the south face and three hard steps of
 * spill in front of it. Under `reduced` the steps hold at full; they never stop being drawn.
 */
function spillPool(
  c: Ctx,
  cx: number,
  south: number,
  halfW: number,
  T: number,
  pulse: number,
): void {
  const depth = Math.max(1, Math.round(T * 0.09));
  for (let k = 0; k < 3; k++) {
    const spread = halfW + k * depth;
    c.fillStyle = SPILL[k * 3 + pulse] as string;
    c.fillRect(cx - spread, south + k * depth, spread * 2, depth);
  }
}

/** A lit window: warm body, near-white on the north-west quarter the lamp is behind. */
function emissive(c: Ctx, x: number, y: number, w: number, h: number): void {
  if (w <= 0 || h <= 0) return;
  c.fillStyle = MACHINE_GLOW;
  c.fillRect(x, y, w, h);
  c.fillStyle = MACHINE_CORE;
  c.fillRect(x, y, Math.max(1, w >> 1), Math.max(1, h >> 1));
}

/**
 * Below this *screen* tile size a machine drops its skin and keeps its shape.
 *
 * The bevel is 7% of a tile and the vent stencil is thinner again, so under 20 CSS px both are one
 * device pixel and stop being a lit face — they become an outline that fills the footprint in and
 * costs exactly the silhouette they were meant to describe. Footprint and fixture are drawn at
 * every size; the panel work is what is allowed to go.
 */
const MACHINE_DETAIL_TILE_PX = 20;

const MACHINE_INDEX: Readonly<Record<string, number>> = {
  door: 0,
  lever: 1,
  furnace: 2,
  press: 3,
  sink: 4,
  source: 5,
  node: 6,
  antenna: 7,
  charger: 8,
  router: 9,
};

/**
 * One body tone per kind, spread across value rather than around the wheel.
 *
 * A player who cannot separate teal from amber still has to tell a sink from a source, so these
 * ten land on ten different luminances first and are a plausible material second. The tone is the
 * last cue and not the first: it separates two machines the eye has already separated by shape.
 */
const MACHINE_BODY: readonly Ramp[] = [
  /* door */ ramp('#7b858f', SOLID_SPREAD),
  /* lever */ ramp('#5c6670', SOLID_SPREAD),
  /* furnace */ ramp('#6b5f53', SOLID_SPREAD),
  /* press */ ramp('#4e5760', SOLID_SPREAD),
  /* sink */ ramp('#424a52', SOLID_SPREAD),
  /* source */ ramp('#727d87', SOLID_SPREAD),
  /* node */ ramp('#566372', SOLID_SPREAD),
  /* antenna */ ramp('#6e767e', SOLID_SPREAD),
  /* charger */ ramp('#5a6a6b', SOLID_SPREAD),
  /* router */ ramp('#646f7c', SOLID_SPREAD),
];

/**
 * Ten machines, ten footprints.
 *
 * The atlas answered "which machine is this" with ten three-quarter illustrations and a hue each,
 * and both halves of that answer fail on this board: the board is top-down, and hue is not a
 * channel a direction is allowed to spend. So identity is carried by *footprint* first — a
 * bulkhead slab, a pedestal, a stove, a gantry, a hopper, a vessel, a pylon, a mast, a cradle, a
 * junction — because a shape survives being reduced to eleven device pixels and a stencilled panel
 * does not. No two of them are the same box, and that is the property the guard measures.
 *
 * On top of that footprint, and only on top of it, each one draws *what it does*. A furnace has
 * fire behind a grate. A press has a mass hanging off a crown and a billet under it that goes
 * flat. A sink has bars over a throat. A vessel has a wheel and a dial. A dock has a lead running
 * off it. Those marks are two to six rectangles each and they live behind `detail`, because they
 * are the part that stops being visible before the silhouette does — the silhouette is what the
 * far zoom is owed and the fixture is what the near zoom is owed, and confusing the two is how a
 * board ends up costing the same at every size.
 */
function paintMachine(paint: MachinePaint): void {
  const c = paint.ctx;
  const T = paint.tilePx;
  const ox = paint.x * T;
  const oy = paint.y * T;
  const cx = ox + tileAt(T, 0.5);
  const cy = oy + tileAt(T, 0.5);
  const idx = MACHINE_INDEX[paint.kind] ?? 0;
  const body = MACHINE_BODY[idx] as Ramp;
  const detail = T >= MACHINE_DETAIL_TILE_PX * paint.dpr;
  const e = Math.max(1, Math.round(T * 0.07));
  const half = Math.max(1, e >> 1);
  const on = paint.powered;
  /* Phased by *where* the machine stands rather than by what it is: neighbours must not breathe in
   * unison, and a tell that varied by kind would be identity smuggled into an animation. */
  const swell = paint.reduced ? 1 : Math.sin(paint.time * 3.1 + paint.x + paint.y);
  const pulse = swell > 0.5 ? 2 : swell > -0.5 ? 1 : 0;

  switch (idx) {
    /*
     * A blast door: two leaves running in a frame, striped on the edges that meet.
     *
     * The only kind whose footprint spans the whole tile, and the only one that opens: closed and
     * open are two silhouettes rather than two colours of one silhouette, so the state survives
     * being reduced to black. The jambs are what make the leaves *leaves* — a slab with nothing at
     * its ends is a wall segment, and the board is full of wall segments.
     */
    case 0: {
      const horiz = paint.facing !== 1 && paint.facing !== 3;
      const th = tileSpan(T, 0.34);
      const leaf = on ? tileSpan(T, 0.2) : tileSpan(T, 0.5);
      const bx = horiz ? ox : cx - (th >> 1);
      const by = horiz ? cy - (th >> 1) : oy;
      const bw = horiz ? T : th;
      const bh = horiz ? th : T;
      castBlock(c, bx, by, bw, bh, T, detail);
      if (on) {
        const gx = horiz ? bx + leaf : bx;
        const gy = horiz ? by : by + leaf;
        const gw = horiz ? bw - leaf * 2 : bw;
        const gh = horiz ? bh : bh - leaf * 2;
        /* An opening is two lit rails with a wash between them, not a filled rectangle. A solid
         * bright slab in the gap reads as a *third* leaf and the door looks shut again. */
        c.fillStyle = SPILL[pulse + 3] as string;
        c.fillRect(gx, gy, gw, gh);
        c.fillStyle = MACHINE_CORE;
        if (horiz) {
          c.fillRect(gx, gy, gw, half);
          c.fillRect(gx, gy + gh - half, gw, half);
        } else {
          c.fillRect(gx, gy, half, gh);
          c.fillRect(gx + gw - half, gy, half, gh);
        }
      }
      volume(c, bx, by, horiz ? leaf : bw, horiz ? bh : leaf, body, e, detail);
      if (horiz) volume(c, bx + bw - leaf, by, leaf, bh, body, e, detail);
      else volume(c, bx, by + bh - leaf, bw, leaf, body, e, detail);
      if (detail) {
        c.fillStyle = MACHINE_RECESS.deep;
        if (horiz) {
          c.fillRect(bx, by, half, bh);
          c.fillRect(bx + bw - half, by, half, bh);
        } else {
          c.fillRect(bx, by, bw, half);
          c.fillRect(bx, by + bh - half, bw, half);
        }
        c.fillStyle = body.deep;
        if (horiz) {
          c.fillRect(bx + leaf - half, by + e, half, bh - e * 2);
          c.fillRect(bx + bw - leaf, by + e, half, bh - e * 2);
        } else {
          c.fillRect(bx + e, by + leaf - half, bw - e * 2, half);
          c.fillRect(bx + e, by + bh - leaf, bw - e * 2, half);
        }
        /* Caution blocks along the closing edges. Three squares with air between them, which is
         * what a striped edge reduces to once a stripe is two pixels wide. */
        const dash = Math.max(1, Math.round(T * 0.05));
        c.fillStyle = MACHINE_RECESS.lit;
        for (let i = 0; i < 3; i++) {
          if (horiz) {
            c.fillRect(bx + leaf - half - dash, by + e + i * dash * 2, dash, dash);
            c.fillRect(bx + bw - leaf + half, by + e + i * dash * 2, dash, dash);
          } else {
            c.fillRect(bx + e + i * dash * 2, by + leaf - half - dash, dash, dash);
            c.fillRect(bx + e + i * dash * 2, by + bh - leaf + half, dash, dash);
          }
        }
      }
      break;
    }

    /*
     * A floor-mounted throw switch: a pedestal, a quadrant plate slotted at both ends of the
     * travel, and an arm with a grip on it.
     *
     * The smallest footprint on the board, because a lever is the one machine a bot works by hand
     * rather than over a cable. The quadrant is what turns a stick into a control — an arm on its
     * own is a mast, and the board already has one of those.
     */
    case 1: {
      const bw = tileSpan(T, 0.42);
      const bh = tileSpan(T, 0.26);
      const bx = cx - (bw >> 1);
      const by = oy + tileAt(T, 0.6);
      castBlock(c, bx, by, bw, bh, T, detail);
      if (on) spillPool(c, cx, by + bh, bw >> 1, T, pulse);
      volume(c, bx, by, bw, bh, body, e, detail);
      /* The pivot housing and the two detents the arm parks in. A stick on a box is a mast; a
       * stick standing out of a slotted collar is something a hand throws. */
      const pw = tileSpan(T, 0.2);
      const ph = tileSpan(T, 0.1);
      const px = cx - (pw >> 1);
      const py = by - ph;
      if (detail) {
        volume(c, px, py, pw, ph, MACHINE_RECESS, half, false);
        const notch = tileSpan(T, 0.08);
        c.fillStyle = MACHINE_RECESS.deep;
        c.fillRect(px - notch - half, py + ph - half, notch, half);
        c.fillRect(px + pw + half, py + ph - half, notch, half);
      } else {
        c.fillStyle = MACHINE_RECESS.mid;
        c.fillRect(px, py, pw, ph);
      }
      const armW = Math.max(2, Math.round(T * 0.07));
      const tipX = on ? cx + tileAt(T, 0.26) : cx - tileAt(T, 0.26);
      const tipY = py - (on ? tileAt(T, 0.32) : tileAt(T, 0.12));
      stepLine(c, cx - (armW >> 1), py, tipX - (armW >> 1), tipY, armW, body.lit);
      const knob = tileSpan(T, 0.16);
      const kx = tipX - (knob >> 1);
      const ky = tipY - (knob >> 1);
      c.fillStyle = on ? MACHINE_GLOW : MACHINE_RECESS.lit;
      c.fillRect(kx, ky, knob, knob);
      c.fillStyle = MACHINE_RECESS.deep;
      c.fillRect(kx, ky + knob - half, knob, half);
      if (on) {
        c.fillStyle = MACHINE_CORE;
        c.fillRect(kx, ky, Math.max(1, knob >> 1), Math.max(1, knob >> 1));
      }
      if (detail) {
        c.fillStyle = MACHINE_RECESS.deep;
        c.fillRect(bx + e, by + bh - e * 2, bw - e * 2, half);
        c.fillRect(bx + half, by + half, half, half);
        c.fillRect(bx + bw - half * 2, by + half, half, half);
      }
      break;
    }

    /*
     * A furnace with a fire in it: a firebox behind a grate, a hearth lip the light spills over,
     * hotplates on the slab, and a capped flue breaking the tile's north edge.
     *
     * The grate is the whole argument. An open glowing rectangle in a housing is a *window*, and
     * three of the ten kinds could carry one; bars across the glow is a grate, and only a thing
     * that burns has one. The flue's collar does the same job for the chimney — a pipe without one
     * is a post at the zoom where the pipe is three pixels wide.
     */
    case 2: {
      const w = tileSpan(T, 0.74);
      const h = tileSpan(T, 0.66);
      const x0 = cx - (w >> 1);
      const y0 = oy + tileAt(T, 0.28);
      const kw = tileSpan(T, 0.17);
      const kh = tileSpan(T, 0.28);
      const kx = x0 + w - kw - e;
      castBlock(c, x0, y0 - kh, w, h + kh, T, detail);
      if (on) spillPool(c, cx, y0 + h, w >> 1, T, pulse);
      volume(c, kx, y0 - kh, kw, kh, body, half, false);
      if (detail) {
        c.fillStyle = MACHINE_RECESS.dark;
        c.fillRect(kx - half, y0 - kh, kw + half * 2, half * 2);
      }
      c.fillStyle = on ? MACHINE_GLOW : MACHINE_RECESS.deep;
      c.fillRect(kx, y0 - kh + half, kw, half);
      volume(c, x0, y0, w, h, body, e, detail);
      const hw = tileSpan(T, 0.46);
      const hh = tileSpan(T, 0.26);
      const hx = x0 + e * 2;
      const hy = y0 + h - hh - e;
      if (detail) {
        c.fillStyle = MACHINE_RECESS.deep;
        c.fillRect(hx - half, hy - half, hw + half * 2, hh + half);
      }
      if (on) {
        emissive(c, hx, hy, hw, hh);
      } else {
        c.fillStyle = MACHINE_RECESS.mid;
        c.fillRect(hx, hy, hw, hh);
      }
      if (detail) {
        c.fillStyle = MACHINE_RECESS.dark;
        for (let i = 1; i < 4; i++) {
          c.fillRect(hx + Math.round((i * hw) / 4) - (half >> 1), hy, half, hh);
        }
      }
      c.fillStyle = on ? MACHINE_CORE : MACHINE_RECESS.lit;
      c.fillRect(hx, hy + hh - half, hw, half);
      if (detail) {
        const ring = tileSpan(T, 0.15);
        c.fillStyle = body.dark;
        c.fillRect(x0 + e, y0 + e, ring, ring);
        c.fillRect(x0 + e * 2 + ring, y0 + e, ring, ring);
        c.fillStyle = body.deep;
        c.fillRect(x0 + e, y0 + e + ring - half, ring, half);
        c.fillRect(x0 + e * 2 + ring, y0 + e + ring - half, ring, half);
      }
      break;
    }

    /*
     * A press: two guide columns under a crown, a ram hanging off it, an anvil under that, and a
     * billet on the anvil that is flat when the ram is down.
     *
     * The crown is what separates this from the door — a gate is two posts and a lintel, a press
     * is two posts, a lintel and a mass *hanging* between them. Busy drops the ram, flattens the
     * billet and throws two chips, so the state is a change of shape and not a change of light.
     */
    case 3: {
      const w = tileSpan(T, 0.72);
      const h = tileSpan(T, 0.66);
      const x0 = cx - (w >> 1);
      const y0 = oy + tileAt(T, 0.22);
      const col = tileSpan(T, 0.18);
      const anvil = tileSpan(T, 0.16);
      const crown = tileSpan(T, 0.13);
      /* Three shadows rather than one. A press is mostly *hole*, and a single block over the
       * footprint fills the throat with grey and turns the gantry straight back into a box —
       * which is the failure the crown was added to fix, undone by the shadow underneath it. */
      castBlock(c, x0 - half, y0, w + half * 2, crown, T, detail);
      c.fillStyle = CAST_CORE;
      c.fillRect(x0 + e, y0 + crown + e, col, h - crown - anvil);
      c.fillRect(x0 + w - col + e, y0 + crown + e, col, h - crown - anvil);
      c.fillRect(x0 + e, y0 + h - anvil + e, w, anvil);
      if (on) spillPool(c, cx, y0 + h, w >> 1, T, pulse);
      volume(c, x0, y0, col, h, body, e, detail);
      volume(c, x0 + w - col, y0, col, h, body, e, detail);
      volume(c, x0, y0 + h - anvil, w, anvil, body, e, false);
      if (detail) {
        const rung = Math.max(1, Math.round(T * 0.03));
        c.fillStyle = body.deep;
        for (let i = 0; i < 2; i++) {
          const ry = y0 + crown + Math.round(((i + 1) * (h - crown - anvil)) / 3);
          c.fillRect(x0 + half, ry, col - half, rung);
          c.fillRect(x0 + w - col, ry, col - half, rung);
        }
      }
      const ramH = tileSpan(T, 0.2);
      const ramY = on ? y0 + h - anvil - ramH : y0 + crown;
      /* The ram is the machine's own metal and rides *outside* the rails, with a hard dark edge
       * under it. Drawn in the recess tone it disappeared into the gap between the columns, which
       * left a window frame — the exact failure this whole pass exists to fix. */
      volume(c, x0 + col - half, ramY, w - col * 2 + half * 2, ramH, body, e, false);
      c.fillStyle = MACHINE_RECESS.deep;
      c.fillRect(x0 + col - half, ramY + ramH, w - col * 2 + half * 2, half);
      volume(c, x0 - half, y0, w + half * 2, crown, body, e, detail);
      const bl = on ? tileSpan(T, 0.3) : tileSpan(T, 0.15);
      const bt = on ? half : tileSpan(T, 0.09);
      c.fillStyle = on ? MACHINE_CORE : MACHINE_RECESS.lit;
      c.fillRect(cx - (bl >> 1), y0 + h - anvil - bt, bl, bt);
      if (on) {
        const chip = Math.max(1, Math.round(T * 0.04));
        c.fillStyle = MACHINE_GLOW;
        c.fillRect(cx - (bl >> 1) - chip * 2, y0 + h - anvil - bt - chip, chip, chip);
        c.fillRect(cx + (bl >> 1) + chip, y0 + h - anvil - bt - chip * 2, chip, chip);
      }
      break;
    }

    /*
     * A hopper with a grating over its throat, and the one thing on the board that is a hole
     * rather than a mass: the funnel steps are lit on their *south-east* inner walls, which is
     * where the fixed lamp actually reaches into a recess. Nothing else in the direction is lit
     * that way, so it cannot be misread.
     *
     * The bars are the reading. A dark square in a housing is a panel; a dark square with bars
     * over it is somewhere material goes, and when the sink is running the glow comes up *through*
     * them.
     */
    case 4: {
      const w = tileSpan(T, 0.8);
      const x0 = cx - (w >> 1);
      const y0 = cy - (w >> 1);
      castBlock(c, x0, y0, w, w, T, detail);
      if (on) spillPool(c, cx, y0 + w, w >> 1, T, pulse);
      volume(c, x0, y0, w, w, body, e, detail);
      const rings = Math.max(1, Math.round(w * 0.13));
      const steps = detail ? 3 : 2;
      for (let i = 1; i <= steps; i++) {
        const k = i * rings;
        const iw = w - k * 2;
        if (iw <= 2) break;
        c.fillStyle = i === 1 ? MACHINE_RECESS.dark : i === 2 ? MACHINE_RECESS.deep : '#05080b';
        c.fillRect(x0 + k, y0 + k, iw, iw);
      }
      c.fillStyle = MACHINE_RECESS.mid;
      for (let i = 1; i <= steps; i++) {
        const k = i * rings;
        const iw = w - k * 2;
        if (iw <= 2) break;
        c.fillRect(x0 + k, y0 + w - k - half, iw, half);
        c.fillRect(x0 + w - k - half, y0 + k, half, iw);
      }
      if (on) {
        const mouth = Math.max(2, w - rings * 6);
        const m = (w - mouth) >> 1;
        emissive(c, x0 + m, y0 + m, mouth, mouth);
      }
      if (detail) {
        const throat = w - rings * 2;
        c.fillStyle = MACHINE_RECESS.lit;
        for (let i = 1; i < 4; i++) {
          const by2 = y0 + rings + Math.round((i * throat) / 4) - (half >> 1);
          c.fillRect(x0 + rings, by2, throat, half);
        }
        c.fillStyle = MACHINE_RECESS.deep;
        c.fillRect(x0 + half, y0 + half, half, half);
        c.fillRect(x0 + w - half * 2, y0 + half, half, half);
        c.fillRect(x0 + half, y0 + w - half * 2, half, half);
        c.fillRect(x0 + w - half * 2, y0 + w - half * 2, half, half);
      }
      break;
    }

    /*
     * A pressure vessel you draw from: stepped rims, a hand wheel on the shoulder, a dial on the
     * belly and a spout out of the foot.
     *
     * The rims make the silhouette a barrel rather than a rectangle, which is what keeps it clear
     * of the press at the far zoom. The wheel and the dial are what make it a *supply* — a barrel
     * with neither is cargo, and cargo is already an item on this board.
     */
    case 5: {
      const w = tileSpan(T, 0.58);
      const h = tileSpan(T, 0.6);
      const x0 = cx - (w >> 1);
      const y0 = oy + tileAt(T, 0.18);
      const rim = tileSpan(T, 0.09);
      const inset = Math.max(1, w >> 3);
      const sw = tileSpan(T, 0.16);
      const sh = tileSpan(T, 0.14);
      const sx = cx - (sw >> 1);
      const sy = y0 + h;
      castBlock(c, x0, y0, w, h + sh, T, detail);
      if (on) spillPool(c, cx, sy + sh, sw, T, pulse);
      volume(c, x0 + inset, y0, w - inset * 2, rim, body, half, false);
      volume(c, x0, y0 + rim, w, h - rim * 2, body, e, detail);
      volume(c, x0 + inset, y0 + h - rim, w - inset * 2, rim, body, half, false);
      if (detail) {
        const vw = tileSpan(T, 0.26);
        const vy = y0 + rim + half;
        c.fillStyle = MACHINE_RECESS.lit;
        c.fillRect(cx - (vw >> 1), vy, vw, half);
        c.fillRect(cx - (half >> 1) - 1, vy - (vw >> 2), Math.max(1, half), vw >> 1);
        c.fillStyle = MACHINE_RECESS.deep;
        c.fillRect(cx - half, vy, half * 2, half);
        c.fillStyle = body.deep;
        c.fillRect(x0, y0 + tileAt(T, 0.3), w, half);
        const gs = tileSpan(T, 0.15);
        const gx = x0 + w - gs - half;
        const gy = y0 + h - rim - gs - half;
        c.fillStyle = PALETTE.silver;
        c.fillRect(gx, gy, gs, gs);
        c.fillStyle = MACHINE_RECESS.deep;
        c.fillRect(gx + (gs >> 1), gy + half, Math.max(1, half >> 1), gs >> 1);
      }
      volume(c, sx, sy, sw, sh, body, half, false);
      if (on) emissive(c, sx, sy + sh - e, sw, e);
      break;
    }

    /*
     * A pylon: a rhombus footprint, the only plan on the board that is not square to the plate,
     * carrying a stack of insulator discs with cable leaving it east and west.
     *
     * A grid node is what `power()` addresses and it has to be findable in a row of housings. The
     * discs alternate light and dark rather than tapering smoothly, because a live terminal is
     * rims with air between them and a taper is a cone.
     */
    case 6: {
      const r = tileSpan(T, 0.38);
      const rows = 5;
      const band = Math.max(1, Math.round((r * 2) / rows));
      const top = cy - ((rows * band) >> 1);
      castBlock(c, cx - r, top, r * 2, rows * band, T, detail);
      if (on) spillPool(c, cx, top + rows * band, r >> 1, T, pulse);
      if (detail) {
        const stub = tileSpan(T, 0.11);
        c.fillStyle = CABLE_CORE;
        c.fillRect(cx - r - stub, top + band * 2, stub, Math.max(1, half));
        c.fillRect(cx + r, top + band * 2, stub, Math.max(1, half));
      }
      for (let j = 0; j < rows; j++) {
        const hw = Math.max(1, Math.round(r * (1 - Math.abs(j - 2) / 2.4)));
        c.fillStyle = j < 2 ? body.lit : j === 2 ? body.mid : j === 3 ? body.dark : body.deep;
        c.fillRect(cx - hw, top + j * band, hw * 2, band);
      }
      const coil = tileSpan(T, 0.05);
      const wind = tileSpan(T, 0.3);
      const rise = tileSpan(T, 0.08);
      for (let i = 0; i < 3; i++) {
        const dw = Math.max(1, wind - i * coil * 2);
        c.fillStyle = on
          ? i === 0
            ? MACHINE_GLOW
            : MACHINE_CORE
          : i === 1
            ? MACHINE_RECESS.deep
            : MACHINE_RECESS.lit;
        c.fillRect(cx - (dw >> 1), top + band - i * rise, dw, coil);
      }
      break;
    }

    /*
     * A lattice mast on a flanged foot: nearly the whole tile tall and a tenth of it wide, a
     * silhouette no housing can produce, with the yagi bars widening downward so the shape is
     * still an aerial upside down and stay legs stepping out to the base.
     */
    case 7: {
      const bw = tileSpan(T, 0.46);
      const bh = tileSpan(T, 0.18);
      const bx = cx - (bw >> 1);
      const by = oy + tileAt(T, 0.72);
      const mw = tileSpan(T, 0.12);
      const mtop = oy + tileAt(T, 0.06);
      const yagi = mtop + tileSpan(T, 0.12);
      /* One shadow over mast and base together: two overlapping casts is two more `fillRect`s for
       * a mark whose whole job is to say the thing is standing on something. */
      castBlock(c, bx, mtop, bw, by + bh - mtop, T, detail);
      if (on) spillPool(c, cx, by + bh, bw >> 1, T, pulse);
      if (detail) {
        /* Stay legs, stepped rather than stroked. A `stepLine` at this width walks one rectangle
         * per pixel of run for a mark that is three dots long. */
        const legW = Math.max(1, Math.round(T * 0.045));
        c.fillStyle = body.dark;
        for (let i = 0; i < 3; i++) {
          const ly = by - Math.round(((i + 1) * (by - yagi)) / 4);
          const lx = legW * (i + 1);
          c.fillRect(cx - lx - legW, ly, legW, legW);
          c.fillRect(cx + lx, ly, legW, legW);
        }
      }
      volume(c, bx, by, bw, bh, body, e, detail);
      if (detail) {
        c.fillStyle = MACHINE_RECESS.deep;
        c.fillRect(bx - half, by + bh - half, bw + half * 2, half);
      }
      volume(c, cx - (mw >> 1), mtop, mw, by - mtop, body, half, false);
      const bar = tileSpan(T, 0.05);
      const rung = tileSpan(T, 0.11);
      c.fillStyle = body.lit;
      for (let i = 0; i < 3; i++) {
        const aw = tileSpan(T, 0.2 + i * 0.1);
        c.fillRect(cx - (aw >> 1), yagi + i * rung, aw, bar);
      }
      const bp = tileSpan(T, 0.12);
      if (on) {
        emissive(c, cx - (bp >> 1), mtop, bp, bp);
      } else {
        c.fillStyle = MACHINE_RECESS.mid;
        c.fillRect(cx - (bp >> 1), mtop, bp, bp);
      }
      break;
    }

    /*
     * A charging dock: a wide low cradle with two prongs, a contact strip in the bay between them
     * and a lead running off the south-east corner.
     *
     * The one machine that reads as floor furniture rather than as a standing volume, which is
     * right — a bot backs into it. The lead is the mark that says the furniture is plugged in, and
     * powered strikes a stepped arc across the prongs that nothing else on the board makes.
     */
    case 8: {
      const w = tileSpan(T, 0.84);
      const h = tileSpan(T, 0.28);
      const x0 = cx - (w >> 1);
      const y0 = oy + tileAt(T, 0.6);
      const pw = tileSpan(T, 0.12);
      const ph = tileSpan(T, 0.34);
      const px0 = x0 + tileSpan(T, 0.1);
      const px1 = x0 + w - tileSpan(T, 0.1) - pw;
      const tip = y0 - ph;
      castBlock(c, x0, tip, w, h + ph, T, detail);
      if (on) spillPool(c, cx, y0 + h, w >> 1, T, pulse);
      if (detail) {
        const lead = Math.max(1, Math.round(T * 0.05));
        c.fillStyle = CABLE_CORE;
        c.fillRect(x0 + w - lead * 2, y0 + h, lead, tileSpan(T, 0.09));
        c.fillRect(x0 + w - lead * 2, y0 + h + tileSpan(T, 0.09) - lead, tileSpan(T, 0.16), lead);
      }
      volume(c, px0, tip, pw, ph, body, half, false);
      volume(c, px1, tip, pw, ph, body, half, false);
      volume(c, x0, y0, w, h, body, e, detail);
      c.fillStyle = on ? MACHINE_GLOW : MACHINE_RECESS.deep;
      c.fillRect(px0 + pw, y0 - half, px1 - px0 - pw, half * 2);
      if (on) {
        /* Wide enough that `stepLine` walks five blocks and not seventeen — a stepped diagonal
         * costs one `fillRect` per `w` of span, so a hairline arc is the most expensive mark on
         * the board and the one nobody can see. */
        const aw = Math.max(2, tileSpan(T, 0.09));
        const peak = tip - tileSpan(T, 0.12);
        stepLine(c, px0 + (pw >> 1), tip, cx, peak, aw, MACHINE_CORE);
        stepLine(c, cx, peak, px1 + (pw >> 1), tip, aw, MACHINE_GLOW);
      } else {
        c.fillStyle = MACHINE_RECESS.mid;
        c.fillRect(px0, tip, pw, half);
        c.fillRect(px1, tip, pw, half);
      }
      break;
    }

    /*
     * A junction box: a hub with four ports reaching for all four tile edges, each ending in a
     * collar, so the footprint is a cross and the cross has connectors on it.
     *
     * `transmit` is a four-way verb and this is the one machine whose plan says so. Bare stubs
     * make a plus sign, which is a symbol; a collar on the end of each makes it a fitting, which
     * is an object.
     */
    default: {
      const hub = tileSpan(T, 0.44);
      const x0 = cx - (hub >> 1);
      const y0 = cy - (hub >> 1);
      const st = tileSpan(T, 0.12);
      const reach = tileSpan(T, 0.14);
      castBlock(c, x0 - reach, y0 - reach, hub + reach * 2, hub + reach * 2, T, detail);
      if (on) spillPool(c, cx, y0 + hub, hub >> 1, T, pulse);
      /* The four ports are drawn as one flat pass. They are three pixels wide at the zoom this
       * machine is actually read at, and a bevel on a three-pixel stub is the stub. */
      const sx = cx - (st >> 1);
      const sy = cy - (st >> 1);
      c.fillStyle = body.mid;
      c.fillRect(sx, y0 - reach, st, reach + e);
      c.fillRect(sx, y0 + hub - e, st, reach + e);
      c.fillRect(x0 - reach, sy, reach + e, st);
      c.fillRect(x0 + hub - e, sy, reach + e, st);
      if (detail) {
        const collar = Math.max(1, Math.round(T * 0.05));
        c.fillStyle = body.dark;
        c.fillRect(sx - collar, y0 - reach, st + collar * 2, collar);
        c.fillRect(sx - collar, y0 + hub + reach - collar, st + collar * 2, collar);
        c.fillRect(x0 - reach, sy - collar, collar, st + collar * 2);
        c.fillRect(x0 + hub + reach - collar, sy - collar, collar, st + collar * 2);
      }
      c.fillStyle = body.lit;
      c.fillRect(sx, y0 - reach, st, half);
      c.fillRect(x0 - reach, sy, reach + e, half);
      c.fillRect(x0 + hub - e, sy, reach + e, half);
      volume(c, x0, y0, hub, hub, body, e, detail);
      const r1 = Math.max(1, hub - e * 2);
      const r2 = hub - e * 4;
      c.fillStyle = MACHINE_RECESS.deep;
      c.fillRect(x0 + e, y0 + e, r1, r1);
      c.fillStyle = body.lit;
      c.fillRect(x0 + e, y0 + e, r1, half);
      if (r2 > 2) {
        c.fillStyle = on ? MACHINE_GLOW : MACHINE_RECESS.mid;
        c.fillRect(x0 + e * 2, y0 + e * 2, r2, r2);
      }
      if (detail) {
        c.fillStyle = body.deep;
        c.fillRect(x0 + half, y0 + half, half, half);
        c.fillRect(x0 + hub - half * 2, y0 + half, half, half);
        c.fillRect(x0 + half, y0 + hub - half * 2, half, half);
        c.fillRect(x0 + hub - half * 2, y0 + hub - half * 2, half, half);
      }
      if (on) {
        const p = tileSpan(T, 0.08);
        c.fillStyle = MACHINE_CORE;
        c.fillRect(cx - (p >> 1), y0 - reach, p, p);
        c.fillRect(cx - (p >> 1), y0 + hub + reach - p, p, p);
        c.fillRect(x0 - reach, cy - (p >> 1), p, p);
        c.fillRect(x0 + hub + reach - p, cy - (p >> 1), p, p);
      }
      break;
    }
  }
}

/**
 * Below this *screen* tile size a crop stops being a plant and becomes its own profile.
 *
 * 14 CSS px is where a stem stops existing: at the smallest rung a campaign board fits to, 16
 * device px on a 2x panel, a stem is one device pixel and a leaf is two, and six of them are a
 * texture rather than six plants. So the far form draws what a bush *looks like from a distance* —
 * a wide skirt with a narrower crown standing on it — and steps both blocks once per maturity.
 * Same argument this file already makes for terrain at 24 px, made again where the consequence of
 * getting it wrong is that `w2-02` cannot be solved.
 */
const CROP_DETAIL_TILE_PX = 14;

/**
 * The far profile: skirt at the soil, crown above it. Six authored rungs rather than a formula,
 * so no two of them round together at 16 px — where the whole ladder lives inside eleven pixels.
 */
const CROP_FAR_W: readonly number[] = [0.44, 0.16, 0.28, 0.4, 0.52, 0.62];
const CROP_FAR_H: readonly number[] = [0.05, 0.08, 0.13, 0.18, 0.24, 0.28];
const CROP_CROWN_W: readonly number[] = [0, 0.08, 0.16, 0.24, 0.34, 0.42];
const CROP_CROWN_H: readonly number[] = [0, 0.1, 0.14, 0.18, 0.24, 0.3];

/**
 * The near ladder, as a plant rather than as a size curve.
 *
 * Maturity is *count* first — how many plants, how many tiers of leaf on each — and size second,
 * because a count survives a downsample where a 12% width step does not. Plants get fewer and
 * bigger as they mature, which is both what a thinned field looks like and what keeps the mark
 * count flat across the ladder.
 */
const CROP_ROWS: readonly number[] = [1, 1, 1, 2, 2, 2];
const CROP_PER_ROW: readonly number[] = [3, 3, 3, 2, 2, 2];
const CROP_TIERS: readonly number[] = [0, 1, 2, 2, 3, 3];
const CROP_STEM_H: readonly number[] = [0, 0.17, 0.24, 0.3, 0.36, 0.38];
const CROP_LEAF_W: readonly number[] = [0, 0.07, 0.09, 0.11, 0.13, 0.135];
const CROP_LEAF_H: readonly number[] = [0, 0.05, 0.06, 0.065, 0.075, 0.08];

const CROP_SOWN = ramp('#3f352a', 0.32);
const CROP_LEAF = ramp('#5f7247', 0.3);
/** Ripe is the brightest value standing on soil, well clear of both the leaf and the furrow. */
const CROP_RIPE = ramp('#c2ab5e', 0.3);
/** Held off `accent2` on purpose: that colour is the goal marker and a ripe field is not a route. */
const CROP_MARK = '#f4e7c2';
/** Sown seed lying in the furrow — one step lighter than the ridge it sits between. */
const CROP_SEED = shade('#3f352a', 1.9);

/**
 * The harvest brackets, and the whole answer to "can a player see which tiles are ready".
 *
 * Four right angles clamped to the tile corners. It is the silhouette the landing pad uses and it
 * is here for the same reason: reduced to black it is still four right angles pointing inward, it
 * costs eight `fillRect`s, and at 16 device px each arm is five pixels long and two thick — which
 * is a mark, where a two-pixel fruit pip is a speck.
 */
function cropRowY(oy: number, T: number, rows: number, j: number): number {
  return oy + (rows === 1 ? tileAt(T, 0.74) : tileAt(T, 0.52) + j * tileAt(T, 0.26));
}

function cropClumpX(ox: number, T: number, per: number, i: number, cw: number): number {
  return ox + Math.round(((i + 0.5) / per) * T) - (cw >> 1);
}

/**
 * How far up the stem tier `t` of `tiers` sits, in device pixels off the ground.
 *
 * A single-tier plant puts its one leaf pair near the top — a seedling is two cotyledons on a
 * stalk, not a stalk with something at its ankle. Everything above one tier spans 0.28..0.9 of
 * the stem, which leaves the head clear of the topmost leaves at every rung.
 */
function cropTierY(stemH: number, tiers: number, t: number): number {
  return Math.round(stemH * (tiers === 1 ? 0.62 : 0.28 + (0.62 * t) / (tiers - 1)));
}

/** Leaves taper toward the top of the stem. A plant that does not is a fir-tree stencil. */
function cropLeafW(lw: number, tiers: number, t: number): number {
  return tiers < 2 ? lw : Math.max(1, lw - Math.round((lw * 0.3 * t) / (tiers - 1)));
}

function cropBrackets(c: Ctx, ox: number, oy: number, T: number): void {
  const w = Math.max(1, Math.round(T * 0.09));
  const arm = Math.max(2, Math.round(T * 0.3));
  c.fillStyle = CROP_MARK;
  c.fillRect(ox, oy, arm, w);
  c.fillRect(ox, oy, w, arm);
  c.fillRect(ox + T - arm, oy, arm, w);
  c.fillRect(ox + T - w, oy, w, arm);
  c.fillRect(ox, oy + T - w, arm, w);
  c.fillRect(ox, oy + T - arm, w, arm);
  c.fillRect(ox + T - arm, oy + T - w, arm, w);
  c.fillRect(ox + T - w, oy + T - arm, w, arm);
}

/**
 * Ice-scrub: the other thing that grows on this soil, and the whole of `w2-05`.
 *
 * Not a smaller crop and not a paler one. A crop is *cultivated* — it stands in a mound somebody
 * turned, its stems are vertical, its plants sit at an even pitch down a row, and when it is ready
 * it wears the harvest brackets. Scrub is volunteer growth. It sprawls, it has no stem, it is not
 * on the row, it turns no ground, and it never wears the brackets however ripe the tile says it
 * is — a bracket means "worth the two ticks" and this never is.
 *
 * The tell is the one `docs/DESIGN.md` §8 already spends on the three obstacle classes: **height,
 * and the light that comes with it.** A crop is a volume — lit west shoulder, dark east flank, a
 * shadow cast south-east. Scrub lies flat on the plate, so it has no shoulder, no flank and
 * nothing to cast: one value, no faces, no shadow. A field of it reads as scribble on the floor
 * standing next to things that stand up, which is a silhouette claim rather than a colour one and
 * survives both the greyscale pass and 16 device pixels.
 *
 * Its own colour is held at the leaf's luminance on purpose. Reduced to grey the two are the same
 * value, so nothing in this mark can be passing on hue while looking like form.
 */
const SCRUB_INK = '#55707d';

/**
 * The splay, as unit steps from the node. Five arms, no two the same length, and not one of them
 * the vertical the crop's stems all are.
 */
const SCRUB_ARMS: readonly (readonly [number, number, number])[] = [
  [-1, -0.62, 1],
  [1, -0.78, 0.9],
  [-1, 0.24, 0.72],
  [1, 0.2, 0.66],
  [-0.5, -0.86, 0.55],
];

/**
 * Weeds spread. Maturity is arms and reach, never height and never a head.
 *
 * The reach fractions are authored rather than stepped evenly, for the same reason `CROP_FAR_W`
 * is: they have to round to six *different* integers at 16 device px, where the whole ladder lives
 * inside six pixels and an even 0.05 step would collapse three pairs of rungs into one mark.
 */
const SCRUB_ARM_COUNT: readonly number[] = [2, 3, 3, 4, 4, 5];
const SCRUB_REACH: readonly number[] = [0.13, 0.19, 0.25, 0.31, 0.36, 0.42];

/**
 * One arm, stepped along its own direction.
 *
 * `w` never drops below two device pixels, which is the bound on a stepped
 * line: the step count is `reach / w`, so it falls with the tile instead of holding at a hairline.
 */
function scrubArm(
  c: Ctx,
  nx: number,
  ny: number,
  dx: number,
  dy: number,
  reach: number,
  w: number,
): void {
  const steps = Math.max(1, Math.round(reach / w));
  const half = w >> 1;
  for (let s = 1; s <= steps; s++) {
    const t = (s * reach) / steps;
    c.fillRect(nx + Math.round(dx * t) - half, ny + Math.round(dy * t) - half, w, w);
  }
}

function paintScrub(paint: CropPaint): void {
  const c = paint.ctx;
  const T = paint.tilePx;
  const ox = paint.x * T;
  const oy = paint.y * T;
  const stage = Math.max(0, Math.min(5, paint.stage));
  const arms = SCRUB_ARM_COUNT[stage] ?? 5;
  const reach = tileSpan(T, SCRUB_REACH[stage] ?? 0.34);
  const w = Math.max(2, Math.round(T * 0.055));
  /* Off the centre of the tile and low in it. A crop is planted where the row says; this came up
   * where it landed. */
  const nx = ox + tileAt(T, 0.46);
  const ny = oy + tileAt(T, 0.74);

  c.fillStyle = SCRUB_INK;
  c.fillRect(nx - w, ny - (w >> 1), w * 2, w);
  for (let a = 0; a < arms; a++) {
    const arm = SCRUB_ARMS[a] as readonly [number, number, number];
    scrubArm(c, nx, ny, arm[0], arm[1], reach * arm[2], w);
  }
}

/**
 * One crop tile, sprite and maturity readout in the same mark.
 *
 * The default path draws a frame from the ladder and then a separate bar underneath it. This
 * direction has no room for a chart on a tile it has already textured, so the plant *is* the
 * gauge: turned furrows with seed in them, three seedlings, three leafed shoots, four young
 * plants, four bushes, and four bushes carrying heads. The six rungs differ in plant count, in
 * leaf-tier count and in stem height at once, because any one of those on its own is a step a
 * downsample can swallow.
 *
 * A plant is drawn as a plant — a mound, a stem, and leaf pairs stepping up it, west leaves lit
 * and east leaves turned away and hanging lower. That is the whole difference between this and a
 * green rectangle, and it is four rectangles per plant.
 */
function paintCrop(paint: CropPaint): void {
  if (paint.kind === 'ice') {
    paintScrub(paint);
    return;
  }
  const c = paint.ctx;
  const T = paint.tilePx;
  const ox = paint.x * T;
  const oy = paint.y * T;
  const cx = ox + tileAt(T, 0.5);
  const stage = Math.max(0, Math.min(5, paint.stage));
  const ripe = paint.ripe || stage >= 5;
  const leaf = ripe ? CROP_RIPE : CROP_LEAF;
  const e = Math.max(1, Math.round(T * 0.055));

  if (T < CROP_DETAIL_TILE_PX * paint.dpr) {
    const w = tileSpan(T, CROP_FAR_W[stage] ?? 0.64);
    const h = tileSpan(T, CROP_FAR_H[stage] ?? 0.24);
    const kw = Math.round(T * (CROP_CROWN_W[stage] ?? 0.32));
    const kh = Math.round(T * (CROP_CROWN_H[stage] ?? 0.3));
    const base = oy + tileAt(T, 0.76);
    const x0 = cx - (w >> 1);
    const y0 = base - h;
    const kx = cx - (kw >> 1);
    const far = stage === 0 ? CROP_SOWN : leaf;
    c.fillStyle = CAST_CORE;
    c.fillRect(x0 + e, y0 + e, w, h);
    c.fillStyle = far.mid;
    c.fillRect(x0, y0, w, h);
    if (kw > 0) c.fillRect(kx, y0 - kh, kw, kh);
    /* North on the crown, west on the skirt: the two arrises the lamp actually reaches, and never
     * one drawn across the other — a lit rule over the crown's foot reads as a stripe rather than
     * as a shoulder. */
    c.fillStyle = far.lit;
    if (kw > 0) c.fillRect(kx, y0 - kh, kw, e);
    c.fillRect(x0, y0, Math.max(1, e >> 1), h);
    c.fillStyle = far.deep;
    c.fillRect(x0, base - e, w, e);
    if (ripe) cropBrackets(c, ox, oy, T);
    return;
  }

  /*
   * Sown ground is not a small plant, it is *no* plant: three raised furrows with a lit north
   * ridge and seed lying between them. The first rung of the ladder has to say "worked, and empty"
   * or a player reads it as a crop too young to bother with rather than as a tile to sow.
   */
  if (stage === 0) {
    const fw = tileSpan(T, 0.7);
    const fh = Math.max(1, Math.round(T * 0.045));
    const fx = ox + tileAt(T, 0.15);
    /* Alternate ridges run short. Three rules of equal length is a printed grid; three that do
     * not agree at the ends is ground somebody turned over. */
    c.fillStyle = CROP_SOWN.mid;
    for (let j = 0; j < 3; j++) {
      const short = (j & 1) * fh;
      c.fillRect(fx + short * 2, oy + tileAt(T, 0.34 + j * 0.18), fw - short * 3, fh * 2);
    }
    c.fillStyle = CROP_SOWN.lit;
    for (let j = 0; j < 3; j++) {
      const short = (j & 1) * fh;
      c.fillRect(fx + short * 2, oy + tileAt(T, 0.34 + j * 0.18), fw - short * 3, fh);
    }
    const pip = Math.max(1, Math.round(T * 0.055));
    c.fillStyle = CROP_SEED;
    for (let i = 0; i < 3; i++) {
      c.fillRect(ox + tileAt(T, 0.27 + i * 0.2), oy + tileAt(T, 0.52 - (i & 1) * 0.18), pip, pip);
    }
    return;
  }

  const rows = CROP_ROWS[stage] ?? 2;
  const per = CROP_PER_ROW[stage] ?? 2;
  const tiers = CROP_TIERS[stage] ?? 3;
  const stemH = tileSpan(T, CROP_STEM_H[stage] ?? 0.36);
  const lw = tileSpan(T, CROP_LEAF_W[stage] ?? 0.115);
  const lh = tileSpan(T, CROP_LEAF_H[stage] ?? 0.06);
  const sw = Math.max(1, Math.round(T * 0.035));
  const hs = sw >> 1;
  const spread = sw + lw * 2;
  const off = Math.max(1, Math.round(T * 0.05));
  const droop = Math.max(1, lh >> 1);

  /*
   * Drawn as passes over the whole tile rather than plant by plant.
   *
   * A field is twenty-five of these on every frame, and a plant is a stem, a mound and up to six
   * leaves — seven `fillStyle` changes per plant if the loop is the other way round, which made
   * the state changes two thirds of the cost of the mark. One colour per *part* draws the same
   * picture with five.
   */
  c.fillStyle = CAST_CORE;
  for (let j = 0; j < rows; j++) {
    const baseY = cropRowY(oy, T, rows, j);
    for (let i = 0; i < per; i++) {
      c.fillRect(cropClumpX(ox, T, per, i, spread) + off, baseY - lh, spread, lh);
    }
  }
  /* Each plant stands in its own turned mound. It is one rectangle and it is what stops a field
   * reading as green marks printed on the floor. */
  c.fillStyle = CROP_SOWN.mid;
  for (let j = 0; j < rows; j++) {
    const baseY = cropRowY(oy, T, rows, j);
    for (let i = 0; i < per; i++) {
      c.fillRect(cropClumpX(ox, T, per, i, spread), baseY - lh, spread, lh);
    }
  }
  c.fillStyle = leaf.mid;
  for (let j = 0; j < rows; j++) {
    const baseY = cropRowY(oy, T, rows, j);
    for (let i = 0; i < per; i++) {
      c.fillRect(cropClumpX(ox, T, per, i, spread) + lw, baseY - stemH, sw, stemH);
    }
  }
  /* West leaves take the lamp, east leaves are turned away from it and hang a little lower. That
   * asymmetry is the difference between a plant and a fir-tree stencil, and it costs nothing: the
   * two sides were always two passes. */
  c.fillStyle = leaf.lit;
  for (let j = 0; j < rows; j++) {
    const baseY = cropRowY(oy, T, rows, j);
    for (let i = 0; i < per; i++) {
      const stem = cropClumpX(ox, T, per, i, spread) + lw;
      for (let t = 0; t < tiers; t++) {
        const tw = cropLeafW(lw, tiers, t);
        c.fillRect(stem - tw, baseY - cropTierY(stemH, tiers, t) - lh, tw, lh);
      }
    }
  }
  c.fillStyle = leaf.dark;
  for (let j = 0; j < rows; j++) {
    const baseY = cropRowY(oy, T, rows, j);
    for (let i = 0; i < per; i++) {
      const stem = cropClumpX(ox, T, per, i, spread) + lw;
      for (let t = 0; t < tiers; t++) {
        const tw = cropLeafW(lw, tiers, t);
        c.fillRect(stem + sw, baseY - cropTierY(stemH, tiers, t) - lh + droop, tw, lh);
      }
    }
  }
  if (ripe) {
    /* A head on every stem, in the brightest value on the board that is not a lamp. Two marks say
     * ripe and they fail differently: the heads are the picture, the brackets are the guarantee. */
    const head = tileSpan(T, 0.13);
    const hh = tileSpan(T, 0.1);
    c.fillStyle = CROP_MARK;
    for (let j = 0; j < rows; j++) {
      const baseY = cropRowY(oy, T, rows, j);
      for (let i = 0; i < per; i++) {
        const stem = cropClumpX(ox, T, per, i, spread) + lw + hs;
        c.fillRect(stem - (head >> 1), baseY - stemH - hh, head, hh);
      }
    }
    cropBrackets(c, ox, oy, T);
  }
}

/**
 * Below this *screen* tile size an item drops its bevel and keeps its outline.
 *
 * A prop is roughly a third of a tile, so at 16 CSS px a 6%-of-tile lit face is one device pixel
 * on a body five across — the bevel stops describing a volume and starts eating it. What is kept
 * is the outline and the one mark that names the kind, because that is the part identity is in.
 */
const ITEM_DETAIL_TILE_PX = 16;
/** The rung the bot's own label appears at, so the two never disagree about having room. */
const ITEM_BADGE_TILE_PX = 20;

const ITEM_INDEX: Readonly<Record<string, number>> = {
  regolith: 0,
  stone: 1,
  ore: 2,
  ice: 3,
  scrap: 4,
  seed: 5,
  crop: 6,
  crate: 7,
  part: 8,
  cell: 9,
  chip: 10,
};

const ITEM_BODY: readonly Ramp[] = [
  /* regolith */ ramp('#6e6152', 0.28),
  /* stone */ ramp('#77808a', 0.28),
  /* ore */ ramp('#8a6a44', 0.28),
  /* ice */ ramp('#a8c6d4', 0.28),
  /* scrap */ ramp('#5a6068', 0.28),
  /* seed */ ramp('#8a7a4a', 0.28),
  /* crop */ ramp('#7f8f52', 0.28),
  /* crate */ ramp('#9a7b4e', 0.28),
  /* part */ ramp('#8d949c', 0.28),
  /* cell */ ramp('#4f6a6f', 0.28),
  /* chip */ ramp('#3f4a54', 0.28),
];

const ORE_PIP = shade(PALETTE.bronze, 0.7);
const ICE_FRACTURE = alpha('#dff0f7', 0.5);
const ITEM_BORE = '#151b21';
const CELL_TERMINAL = '#dfe9ef';
const CHIP_LEG = '#c6d0dc';

/**
 * One ground stack, shadow and count badge included.
 *
 * The default path floats an atlas frame over a soft blob, and several of its eleven kinds differ
 * only in hue — not a difference this board is allowed to make. So each kind is a prop with its
 * own silhouette standing on the plate under the same lamp as everything else: a heap, a pair of
 * chunks, a chunk with a vein in it, a shard, a tangle, a scatter, a sheaf, a crate, a toothed
 * bracket, a cell and a wafer. The cast shadow is identical for all eleven on purpose — it is what
 * puts them on the ground, not what tells them apart.
 */
function paintItem(paint: ItemPaint): void {
  const c = paint.ctx;
  const T = paint.tilePx;
  const ox = paint.x * T;
  const oy = paint.y * T;
  const cx = ox + tileAt(T, 0.5);
  const idx = ITEM_INDEX[paint.kind] ?? 0;
  const body = ITEM_BODY[idx] as Ramp;
  const detail = T >= ITEM_DETAIL_TILE_PX * paint.dpr;
  const e = Math.max(1, Math.round(T * 0.06));
  const half = Math.max(1, e >> 1);
  /* Phased by tile, not by kind, for the same reason the machine lamp is. */
  const bob = paint.reduced
    ? 0
    : Math.round(Math.sin(paint.time * 2.2 + paint.x + paint.y) * T * 0.02);
  const ground = oy + tileAt(T, 0.74);

  c.fillStyle = CAST_CORE;
  c.fillRect(
    cx - tileSpan(T, 0.24),
    ground - tileSpan(T, 0.06),
    tileSpan(T, 0.48),
    tileSpan(T, 0.12),
  );

  switch (idx) {
    /*
     * A heap. Loose material has no edges, so it is the one prop built out of stacked bands rather
     * than out of faces.
     */
    case 0: {
      const band = Math.max(1, Math.round(T * 0.08));
      c.fillStyle = body.mid;
      for (let i = 0; i < 3; i++) {
        const w = tileSpan(T, 0.34 - i * 0.1);
        c.fillRect(cx - (w >> 1), ground - (i + 1) * band + bob, w, band);
      }
      c.fillStyle = body.lit;
      for (let i = 0; i < 3; i++) {
        const w = tileSpan(T, 0.34 - i * 0.1);
        c.fillRect(cx - (w >> 1), ground - (i + 1) * band + bob, w, half);
      }
      if (detail) {
        const w = tileSpan(T, 0.34);
        c.fillStyle = body.deep;
        c.fillRect(cx - (w >> 1), ground - band + bob, w, half);
      }
      break;
    }

    /*
     * Two chunks, one big and one small: quarried stone comes off in pieces, and the pair is what
     * separates it from the single mass of an ore lump at the far zoom.
     */
    case 1: {
      const w1 = tileSpan(T, 0.3);
      const h1 = tileSpan(T, 0.26);
      const w2 = tileSpan(T, 0.18);
      const h2 = tileSpan(T, 0.16);
      volume(c, cx - w1, ground - h1 + bob, w1, h1, body, detail ? e : half, detail);
      /* A corner knocked off the big one. Quarried stone has no square edges, and the notch is
       * what stops the pair reading as two crates. */
      c.fillStyle = body.deep;
      c.fillRect(cx - (w1 >> 2) - half, ground - h1 + bob, w1 >> 2, Math.max(1, h1 >> 2));
      volume(c, cx + half, ground - h2 + bob, w2, h2, body, half, false);
      break;
    }

    /*
     * One lump with a vein across it — the diagonal chain the terrain draws in a deposit, so a
     * lump on the floor is legibly the thing that came out of the rock.
     */
    case 2: {
      const w = tileSpan(T, 0.36);
      const h = tileSpan(T, 0.3);
      const x0 = cx - (w >> 1);
      const y0 = ground - h + bob;
      volume(c, x0, y0, w, h, body, detail ? e : half, detail);
      const p = Math.max(1, Math.round(T * 0.08));
      const spark = Math.max(1, p >> 1);
      c.fillStyle = ORE_PIP;
      for (let i = 0; i < 3; i++) {
        c.fillRect(
          x0 + half + Math.round((i * (w - half * 2 - p)) / 2),
          y0 + h - half - p - Math.round((i * (h - half * 2 - p)) / 2),
          p,
          p,
        );
      }
      c.fillStyle = PALETTE.gold;
      for (let i = 0; i < 3; i++) {
        c.fillRect(
          x0 + half + Math.round((i * (w - half * 2 - p)) / 2),
          y0 + h - half - p - Math.round((i * (h - half * 2 - p)) / 2),
          spark,
          spark,
        );
      }
      break;
    }

    /*
     * A shard: four bands narrowing upward to a point. The only prop with a taper, which is what
     * carries it once the internal fracture is too small to draw.
     */
    case 3: {
      const band = Math.max(1, Math.round(T * 0.1));
      c.fillStyle = body.mid;
      for (let i = 0; i < 2; i++) {
        const w = tileSpan(T, 0.3 - i * 0.07);
        c.fillRect(cx - (w >> 1), ground - (i + 1) * band + bob, w, band);
      }
      c.fillStyle = body.lit;
      for (let i = 2; i < 4; i++) {
        const w = tileSpan(T, 0.3 - i * 0.07);
        c.fillRect(cx - (w >> 1), ground - (i + 1) * band + bob, w, band);
      }
      c.fillStyle = body.deep;
      for (let i = 0; i < 4; i++) {
        const w = tileSpan(T, 0.3 - i * 0.07);
        c.fillRect(cx + (w >> 1) - half, ground - (i + 1) * band + bob, half, band);
      }
      /* A straight `fillRect` rather than a `stepLine`: the fracture is vertical, so a stepped
       * walk would put down one rectangle per pixel of it to draw a rectangle. */
      if (detail) {
        c.fillStyle = ICE_FRACTURE;
        c.fillRect(cx - half, ground - band * 4 + bob, half, band * 3);
      }
      break;
    }

    /*
     * A tangle. Scrap is the one kind with no volume at all: crossed bars and a bent plate, which
     * desaturates to a scribble and reads as junk rather than as a made thing.
     */
    case 4: {
      const w = Math.max(2, tileSpan(T, 0.09));
      const r = tileSpan(T, 0.2);
      const yc = ground - tileSpan(T, 0.1) + bob;
      stepLine(c, cx - r, yc + (r >> 1), cx + r, yc - (r >> 1), w, body.mid);
      stepLine(c, cx - r, yc - (r >> 1), cx + r, yc + (r >> 1), w, body.lit);
      c.fillStyle = body.deep;
      c.fillRect(cx - r, yc + (r >> 1), r + (r >> 1), half);
      c.fillStyle = body.dark;
      c.fillRect(cx - (r >> 1), yc - r, r, e);
      break;
    }

    /*
     * A scatter, low to the ground and never taller than one pip. Seed is deliberately the least
     * substantial mark of the eleven — a handful of grains, not a stack.
     */
    case 5: {
      const p = Math.max(1, Math.round(T * 0.08));
      const y = ground - p + bob;
      const gap = p + Math.max(1, p >> 1);
      const lit = Math.max(1, p >> 1);
      c.fillStyle = body.mid;
      for (let i = 0; i < 5; i++) {
        c.fillRect(
          cx + ((i % 3) - 1) * gap - (p >> 1) + (i >= 3 ? p >> 1 : 0),
          i < 3 ? y : y - p - 1,
          p,
          p,
        );
      }
      c.fillStyle = body.lit;
      for (let i = 0; i < 5; i++) {
        c.fillRect(
          cx + ((i % 3) - 1) * gap - (p >> 1) + (i >= 3 ? p >> 1 : 0),
          i < 3 ? y : y - p - 1,
          lit,
          lit,
        );
      }
      break;
    }

    /*
     * A sheaf: four stalks and a tie. Tall and striped where the seed is low and scattered, which
     * is the distinction a player has to make while a field is being harvested.
     */
    case 6: {
      const h = tileSpan(T, 0.34);
      const sw = Math.max(1, Math.round(T * 0.05));
      const gap = Math.max(2, Math.round(T * 0.08));
      const y0 = ground - h + bob;
      const lean = Math.max(1, half);
      c.fillStyle = body.mid;
      for (let i = 0; i < 4; i += 2) c.fillRect(cx - gap - (gap >> 1) + i * gap, y0, sw, h);
      c.fillStyle = body.lit;
      for (let i = 1; i < 4; i += 2) c.fillRect(cx - gap - (gap >> 1) + i * gap, y0, sw, h);
      /* The same head the ripe crop carries, four of them tied together. A harvested sheaf that
       * does not repeat the field's own mark is a second thing to learn. */
      const head = sw * 2;
      const hh = Math.max(1, Math.round(T * 0.07));
      c.fillStyle = CROP_MARK;
      for (let i = 0; i < 4; i++) {
        c.fillRect(cx - gap - (gap >> 1) + i * gap - (i < 2 ? lean : -lean), y0 - hh, head, hh);
      }
      c.fillStyle = body.deep;
      c.fillRect(cx - gap * 2, y0 + Math.round(h * 0.55), gap * 4, e);
      break;
    }

    /*
     * A crate: the one square prop, braced. Everything else is either irregular or has something
     * sticking out of it, which leaves the plain box free to mean cargo.
     */
    case 7: {
      const w = tileSpan(T, 0.42);
      const x0 = cx - (w >> 1);
      const y0 = ground - w + bob;
      volume(c, x0, y0, w, w, body, detail ? e : half, detail);
      if (detail) {
        const bw = Math.max(2, tileSpan(T, 0.09));
        stepLine(c, x0 + e, y0 + e, x0 + w - e, y0 + w - e, bw, body.deep);
        stepLine(c, x0 + w - e, y0 + e, x0 + e, y0 + w - e, bw, body.deep);
      } else {
        c.fillStyle = body.deep;
        c.fillRect(x0 + half, y0 + (w >> 1), w - half * 2, half);
      }
      break;
    }

    /*
     * A toothed bracket with a bore. Four stubs on the cardinals give it a cross outline no other
     * item has, and the dark bore in the middle survives to the floor rung.
     */
    case 8: {
      const w = tileSpan(T, 0.34);
      const x0 = cx - (w >> 1);
      const y0 = ground - w + bob;
      const tw = Math.max(1, Math.round(T * 0.08));
      const tl = Math.max(1, Math.round(T * 0.07));
      c.fillStyle = body.mid;
      c.fillRect(x0 - tl, y0 + ((w - tw) >> 1), w + tl * 2, tw);
      c.fillRect(x0 + ((w - tw) >> 1), y0 - tl, tw, w + tl * 2);
      volume(c, x0, y0, w, w, body, detail ? e : half, detail);
      c.fillStyle = ITEM_BORE;
      c.fillRect(x0 + ((w - tw) >> 1), y0 + ((w - tw) >> 1), tw, tw);
      break;
    }

    /*
     * A cell: narrow, tall and banded, with a bright terminal breaking its top edge. The only prop
     * taller than it is wide, which is the whole of its identity at 16 px.
     */
    case 9: {
      const w = tileSpan(T, 0.22);
      const h = tileSpan(T, 0.42);
      const x0 = cx - (w >> 1);
      const y0 = ground - h + bob;
      const cap = Math.max(1, Math.round(T * 0.07));
      volume(c, x0, y0, w, h, body, half, detail);
      c.fillStyle = CELL_TERMINAL;
      c.fillRect(cx - (cap >> 1), y0 - cap, cap, cap);
      c.fillStyle = body.deep;
      c.fillRect(x0, y0 + Math.round(h * 0.4), w, half);
      c.fillRect(x0, y0 + Math.round(h * 0.62), w, half);
      break;
    }

    /*
     * A wafer with legs. Wide, flat and fringed on two sides — the inverse of the cell, and the
     * only item whose outline extends sideways past its own body.
     */
    default: {
      const w = tileSpan(T, 0.4);
      const h = tileSpan(T, 0.24);
      const x0 = cx - (w >> 1);
      const y0 = ground - h + bob;
      const leg = Math.max(1, Math.round(T * 0.05));
      const notch = Math.max(1, Math.round(T * 0.06));
      const pitch = Math.max(2, Math.round(h / 3));
      c.fillStyle = CHIP_LEG;
      for (let i = 0; i < 3; i++) {
        const y = y0 + half + i * pitch;
        c.fillRect(x0 - leg, y, leg, half);
        c.fillRect(x0 + w, y, leg, half);
      }
      volume(c, x0, y0, w, h, body, half, detail);
      /* A die in the middle of the package and an orientation notch in the corner: the two marks
       * that make a flat rectangle a part rather than a tile. */
      c.fillStyle = MACHINE_RECESS.deep;
      c.fillRect(x0 + notch * 2, y0 + half * 2, w - notch * 3, h - half * 4);
      c.fillStyle = CHIP_LEG;
      c.fillRect(x0 + half, y0 + half, notch, notch);
      break;
    }
  }

  if (paint.count > 1 && T >= ITEM_BADGE_TILE_PX * paint.dpr) {
    /* Sized exactly as the bot's own label, which keeps `fontAt` on one cached string per zoom
     * step instead of thrashing between two. */
    const px = Math.max(9, Math.round(T * 0.24));
    const bw = Math.round(px * 1.5);
    const bh = Math.round(px * 1.2);
    const bx = ox + T - bw - e;
    const by = oy + T - bh - e;
    c.save();
    c.font = fontAt(px);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = PALETTE.bgVoid;
    c.fillRect(bx, by, bw, bh);
    c.fillStyle = PALETTE.silver;
    c.fillRect(bx, by, bw, half);
    c.fillStyle = PALETTE.ink;
    c.fillText(numeral(paint.count), bx + bw / 2, by + bh / 2);
    c.restore();
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
  drawMachine: paintMachine,
  drawCrop: paintCrop,
  drawItem: paintItem,
  backdrop,
  post,
};
