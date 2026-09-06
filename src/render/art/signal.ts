/**
 * SIGNAL — one phosphor, taken to the wall.
 *
 * The bet: commit to the bit absolutely. TIS-100 wins its look by refusing to concede anywhere,
 * and this game's writing is already in that territory — a company whose client dissolved in
 * 2198 and whose contract nobody can legally end. The screen is Kessler & Daughters equipment,
 * the feed is forty light minutes stale, and the tube has been on since before the contractor
 * was born.
 *
 * Everything is one amber phosphor at varying intensity. There is no second hue and no fill that
 * is not made of light. Terrain is drawn as raster: hatched scanlines, dotted floors, solid
 * blocks for walls, with the whole board built from horizontal lines because that is what the
 * device can physically draw.
 *
 * The trail is the direction's best trick and it is free: on a phosphor tube a visited cell is
 * one that has not finished decaying, so the heat overlay stops being an overlay and becomes the
 * thing the display would actually do.
 *
 * The cost is real and stated in the report: monochrome deletes colour as a channel. Bot
 * identity, medals and pass/fail all have to be carried by shape, intensity and glyph instead.
 */
import { Terrain, tileAt } from '../../engine/index.ts';
import type { Tile, World } from '../../engine/index.ts';
import { alpha } from './color.ts';
import type {
  ArtDirection,
  BackdropPaint,
  BotDrawOptions,
  PostPaint,
  TerrainPaint,
} from './types.ts';
import type { BotPose } from '../timeline.ts';

/** The tube's black. Warm, because a phosphor screen at rest is never neutral. */
export const TUBE = '#080603';
/** Floor at rest — the dimmest lit state, not an unlit one. */
export const FLOOR = '#2a1d09';

const INK = '#ffbe57';
const HOT = '#ffdca4';
const WARM = '#ff9a1f';
const BURN = '#ff5a1f';

export const signal: ArtDirection = {
  id: 'signal',
  label: 'Signal',

  /*
   * `danger` is the one place the monochrome bends, and it bends inside the family: a red-shifted
   * phosphor rather than a second colour. A tube that has been driven too hard in one spot really
   * does burn redder, so the alarm state stays diegetic and stays legible for the colour-blind,
   * which a pure intensity ramp would not.
   */
  palette: {
    bgVoid: TUBE,
    bgPanel: '#0e0a04',
    bgRaised: '#191006',
    ink: INK,
    /* 7.9:1 on `bgRaised`. Monochrome buys contrast back; it does not get to skip it. */
    inkDim: '#c2872f',
    accent: HOT,
    accent2: WARM,
    danger: BURN,
    ok: '#d8a63c',
    gold: '#ffd68a',
    silver: '#c09a55',
    bronze: '#8f6a2c',
  },

  bot: {
    hullDark: '#160e04',
    hull: '#5c3f12',
    hullLight: '#8f6520',
    rim: INK,
    glass: '#0b0702',
    tread: '#2a1d09',
    shadow: 'rgba(0, 0, 0, 0.6)',
  },

  fxColors: {
    dust: '#8f6520',
    spark: HOT,
    chip: '#c2872f',
    pulse: HOT,
    power: WARM,
    bad: BURN,
    good: '#d8a63c',
  },

  /*
   * The graticule is etched on the glass in front of the phosphor, so it is a constant faint
   * presence rather than something the beam draws — brighter than the shipped grid, and it never
   * disappears at small tile sizes, because on this device it is not part of the image.
   */
  overlay: {
    grid: 'rgba(255, 154, 31, 0.20)',
    gridMajor: 'rgba(255, 190, 87, 0.46)',
    goal: WARM,
    hover: HOT,
    vignette: '#000000',
    outOfBounds: '#050301',
  },

  metrics: {
    gridWidth: 1,
    gridMajorWidth: 1.5,
    gridMinTilePx: 6,
    outlineWidth: 2,
    botDetailTilePx: 20,
  },

  /*
   * Bot identity cannot be hue here, so these are one hue at twelve intensities — which is a
   * warmth cue and not a name. The name is carried by `drawBot` instead: a printed number in the
   * far form and a four-bit punch strip on the hull in the near one, because an intensity is not
   * something twenty bots on a World 7 board can be told apart by.
   */
  botAccents: [
    '#ffe7c2',
    '#ffbe57',
    '#ff9a1f',
    '#d8a63c',
    '#c2872f',
    '#ffdca4',
    '#a8701f',
    '#ffcf7a',
    '#8f6520',
    '#ffab3d',
    '#6f4a14',
    '#e8b264',
  ],

  /*
   * The one direction where the cold end must *brighten*. A darkening against a #2a1d09 floor is
   * the exact failure FIX-TRAIL §7 describes, with the sign flipped — which is why the invariant
   * is expressed as contrast against `referenceFloor` rather than as a fixed literal.
   */
  trail: { cold: '#6b4a12', hot: BURN, minAlpha: 0.3, maxAlpha: 0.62 },
  referenceFloor: FLOOR,

  paintTerrain,
  drawBot,
  backdrop,
  post,
};

// ---------------------------------------------------------------------------
// Raster
// ---------------------------------------------------------------------------

/**
 * Scanline pitch, in cache device pixels, constrained to divide the tile exactly.
 *
 * The pitch has to be an integer or the raster shimmers, and it has to *divide the tile* or the
 * phase resets at every cell boundary and the board turns into a moiré field instead of one
 * continuous raster. Eight lines per tile is the target because that is the coarsest raster in
 * which a tile still reads as a surface rather than as three stripes; `w8-05` lands on a 24 px
 * cache tile, where the divisor that gets closest is 3.
 */
function rasterPitch(tilePx: number): number {
  let best = 3;
  let bestErr = Infinity;
  for (let p = 2; p <= 8; p++) {
    if (tilePx % p !== 0) continue;
    const err = Math.abs(tilePx / p - 8);
    if (err < bestErr) {
      bestErr = err;
      best = p;
    }
  }
  return best;
}

const STAMP_FLOOR = 0;
const STAMP_REGOLITH = 1;
const STAMP_SOIL = 3;
const STAMP_ROCK = 4;
const STAMP_ORE = 6;
const STAMP_RUBBLE = 7;
const STAMP_ICE = 9;
const STAMP_WALL = 10;
const STAMP_PAD = 12;
const STAMP_DEPOT = 13;
const STAMP_CABLE = 14;
const STAMP_CONVEYOR = 15;
const STAMP_PIT = 19;
const STAMP_COUNT = 20;

/**
 * The stamp sheet: every terrain drawn once at cache resolution, then blitted per cell.
 *
 * Drawing the raster cell by cell is the obvious implementation and it is a thousand times too
 * slow — `w8-05` is 1920 cells and a dotted floor is sixty-four fills, which is a hundred and
 * twenty thousand `fillRect` calls on a layer that rebuilds on every zoom step. One sheet costs
 * the same work for twenty tiles and turns the board pass into one `drawImage` per cell, which is
 * exactly what the atlas pipeline this replaces was already doing.
 *
 * Held at module scope and rebuilt only when the cache resolution moves, for the same reason the
 * terrain layer itself is cached.
 */
let sheet: HTMLCanvasElement | null = null;
let sheetTilePx = 0;

function ensureSheet(tilePx: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (sheet && sheetTilePx === tilePx) return sheet;
  const canvas = sheet ?? document.createElement('canvas');
  canvas.width = tilePx * STAMP_COUNT;
  canvas.height = tilePx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  paintSheet(ctx, tilePx);
  sheet = canvas;
  sheetTilePx = tilePx;
  return canvas;
}

/** Deterministic per-stamp noise. Same shape as `cellHash`, kept local so a stamp is pure. */
function noise(i: number, j: number): number {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function paintSheet(ctx: CanvasRenderingContext2D, t: number): void {
  const p = rasterPitch(t);
  /*
   * Below ten device pixels a tile is fewer than three raster lines and the vocabulary collapses
   * into noise, so it degrades to flat intensity. That is not a compromise on the look — a real
   * tube underscanned this far has no line structure left either.
   */
  const flat = t < 10;
  const at = (index: number): number => index * t;

  const box = (index: number, x: number, y: number, w: number, h: number, style: string): void => {
    ctx.fillStyle = style;
    ctx.fillRect(at(index) + x, y, w, h);
  };
  const fill = (index: number, style: string): void => box(index, 0, 0, t, t, style);

  /** One raster line at row `y`, `lw` device px tall, clipped to the stamp. */
  const line = (
    index: number,
    x: number,
    y: number,
    w: number,
    lw: number,
    style: string,
  ): void => {
    const x0 = Math.max(0, x);
    const x1 = Math.min(t, x + w);
    if (x1 <= x0) return;
    box(index, x0, y, x1 - x0, lw, style);
  };

  const dots = (index: number, style: string, size: number): void => {
    for (let y = 0; y < t; y += p) {
      const offset = (y / p) % 2 === 0 ? 0 : p >> 1;
      for (let x = offset; x < t; x += p) box(index, x, y, size, size, style);
    }
  };

  /**
   * A triangle rasterised into horizontal runs. Every conveyor arrow on the board is this, which
   * is the whole argument of the direction stated in one primitive: a pointer the device could
   * actually draw, made of the only mark it has.
   */
  const arrow = (
    index: number,
    dir: number,
    cx: number,
    cy: number,
    s: number,
    style: string,
  ): void => {
    for (let y = cy - s; y <= cy + s; y += 1) {
      const d = Math.abs(y - cy);
      if (dir === 0) {
        const w = ((cy + s - y) / (2 * s)) * s;
        line(index, cx - w, y, w * 2, 1, style);
      } else if (dir === 2) {
        const w = ((y - (cy - s)) / (2 * s)) * s;
        line(index, cx - w, y, w * 2, 1, style);
      } else if (dir === 1) {
        line(index, cx - s * 0.6, y, s * 1.6 - d, 1, style);
      } else {
        line(index, cx - s + d, y, s * 1.6 - d, 1, style);
      }
    }
  };

  // floor — a dotted field. The dimmest lit state on the board and the one every other terrain is
  // read against. Alternate rows are offset so it reads as a surface, not as columns fighting the
  // graticule.
  if (flat) fill(STAMP_FLOOR, alpha(INK, 0.1));
  else dots(STAMP_FLOOR, alpha(INK, 0.2), Math.max(1, p >> 2));

  // regolith — the same field, loose: a second jittered dot per cell, brighter and grainier.
  if (flat) fill(STAMP_REGOLITH, alpha(INK, 0.16));
  else {
    dots(STAMP_REGOLITH, alpha(INK, 0.22), Math.max(1, p >> 2));
    const grit = alpha(INK, 0.34);
    for (let y = 0, j = 0; y < t; y += p, j++) {
      for (let x = 0, i = 0; x < t; x += p, i++) {
        if (noise(i, j) < 0.45) box(STAMP_REGOLITH, x + (p >> 1), y + 1, 1, 1, grit);
      }
    }
  }

  // soil — tilled: broken dashes in a brick offset, so furrows read at a glance and never look
  // like the dotted floor they sit beside.
  if (flat) fill(STAMP_SOIL, alpha(INK, 0.2));
  else {
    const dash = alpha(INK, 0.26);
    for (let y = 0, j = 0; y < t; y += p, j++) {
      const offset = (j % 2) * p * 1.5;
      for (let x = -offset; x < t; x += p * 3) line(STAMP_SOIL, x, y, p * 2, 1, dash);
    }
  }

  // rock — a mass: continuous raster over a faint base, with a break or two per line so it reads
  // as natural stone rather than as the manufactured wall it must never be confused with.
  if (flat) fill(STAMP_ROCK, alpha(INK, 0.26));
  else {
    fill(STAMP_ROCK, alpha(INK, 0.06));
    const stone = alpha(INK, 0.3);
    for (let y = 0, j = 0; y < t; y += p, j++) {
      const gap = Math.floor(noise(j, 3) * (t - p));
      line(STAMP_ROCK, 0, y, gap, 1, stone);
      line(STAMP_ROCK, gap + Math.max(2, p >> 1), y, t, 1, stone);
    }
  }

  // ore — rock, plus the glint. The brightest solid on the board, because a vein is the thing the
  // player is looking for and the only reason to drive at a wall on purpose.
  if (flat) fill(STAMP_ORE, alpha(INK, 0.42));
  else {
    fill(STAMP_ORE, alpha(INK, 0.08));
    const stone = alpha(INK, 0.28);
    const vein = alpha(HOT, 0.9);
    for (let y = 0, j = 0; y < t; y += p, j++) {
      line(STAMP_ORE, 0, y, t, 1, stone);
      if (j % 2 === 0) {
        const x = t * 0.22 + noise(j, 11) * t * 0.4;
        line(STAMP_ORE, x, y, p * 1.5, 1, vein);
      }
    }
  }

  // rubble — the raster itself is broken. Short runs, wide gaps, whole lines missing: the read is
  // "this block has failed", which is exactly what cheap-to-mine collapsed rock is.
  if (flat) fill(STAMP_RUBBLE, alpha(INK, 0.18));
  else {
    const chip = alpha(INK, 0.32);
    for (let y = 0, j = 0; y < t; y += p, j++) {
      if (j % 3 === 2) continue;
      for (let x = 0, i = 0; x < t; x += p, i++) {
        const r = noise(i, j + 20);
        if (r < 0.45) continue;
        line(STAMP_RUBBLE, x, y, p * (0.6 + r), 1, chip);
      }
    }
  }

  // ice — the only unbroken raster on the board, plus a specular band. Smooth where everything
  // else is textured, which is the whole point of a surface a bot slides across.
  if (flat) fill(STAMP_ICE, alpha(INK, 0.2));
  else {
    fill(STAMP_ICE, alpha(INK, 0.04));
    const sheen = alpha(INK, 0.18);
    for (let y = 0; y < t; y += p) line(STAMP_ICE, 0, y, t, 1, sheen);
    const glare = alpha(HOT, 0.5);
    line(STAMP_ICE, 0, p, t, 1, glare);
    line(STAMP_ICE, 0, p * 2, t, 1, glare);
  }

  // wall — full-coverage raster over a lit base. Held at 0.46 rather than at the top of the ramp
  // so the brightest marks on the board stay the pad, the depot and the bot; structure is a
  // *texture* here, not a light source.
  if (flat) fill(STAMP_WALL, alpha(INK, 0.34));
  else {
    fill(STAMP_WALL, alpha(INK, 0.14));
    const brick = alpha(INK, 0.46);
    for (let y = 0; y < t; y += p) line(STAMP_WALL, 0, y, t, 1, brick);
  }

  // pad — a lit target: dense bright raster with the centre knocked back out, so it reads as a
  // marked square from across the board and never as a solid the bot cannot enter.
  if (flat) fill(STAMP_PAD, alpha(WARM, 0.5));
  else {
    const ring = alpha(WARM, 0.62);
    const core = alpha(WARM, 0.14);
    const inset = Math.round(t * 0.28);
    for (let y = 0; y < t; y += p) {
      const inner = y > inset && y < t - inset;
      if (inner) {
        line(STAMP_PAD, 0, y, inset, 1, ring);
        line(STAMP_PAD, inset, y, t - inset * 2, 1, core);
        line(STAMP_PAD, t - inset, y, inset, 1, ring);
      } else {
        line(STAMP_PAD, 0, y, t, 1, ring);
      }
    }
    const tick = alpha(HOT, 0.95);
    const w = Math.max(2, Math.round(t * 0.2));
    const lw = Math.max(1, Math.round(t / 16));
    line(STAMP_PAD, 0, 0, w, lw, tick);
    line(STAMP_PAD, t - w, 0, w, lw, tick);
    line(STAMP_PAD, 0, t - lw, w, lw, tick);
    line(STAMP_PAD, t - w, t - lw, w, lw, tick);
  }

  // depot — a gauge in a box. `refuel()` only works while standing on one, so it has to be
  // findable *and* distinguishable from the pad; a bracket with three bars inside is neither a
  // solid block nor a lit square.
  if (flat) fill(STAMP_DEPOT, alpha(INK, 0.3));
  else {
    dots(STAMP_DEPOT, alpha(INK, 0.16), 1);
    const inset = Math.round(t * 0.18);
    const lw = Math.max(1, Math.round(t / 16));
    const frame = alpha(INK, 0.7);
    line(STAMP_DEPOT, inset, inset, t - inset * 2, lw, frame);
    line(STAMP_DEPOT, inset, t - inset - lw, t - inset * 2, lw, frame);
    box(STAMP_DEPOT, inset, inset, lw, t - inset * 2, frame);
    box(STAMP_DEPOT, t - inset - lw, inset, lw, t - inset * 2, frame);
    const bar = alpha(HOT, 0.85);
    const span = t - inset * 2 - lw * 4;
    for (let k = 0; k < 3; k++) {
      const y = inset + lw * 2 + Math.round((k * (t - inset * 2 - lw * 4)) / 3);
      line(STAMP_DEPOT, inset + lw * 2, y, span * (1 - k * 0.22), Math.max(1, lw), bar);
    }
  }

  // cable — a busbar. Drawn full width so adjacent cells fuse into one run; the vertical joins
  // are added in the board pass, where the neighbours are known.
  if (flat) fill(STAMP_CABLE, alpha(WARM, 0.3));
  else {
    dots(STAMP_CABLE, alpha(INK, 0.12), 1);
    const lw = Math.max(1, Math.round(t / 12));
    const cy = Math.round(t / 2 - lw / 2);
    line(STAMP_CABLE, 0, cy, t, lw, alpha(WARM, 0.62));
    line(STAMP_CABLE, 0, cy - p, t, 1, alpha(WARM, 0.2));
    line(STAMP_CABLE, 0, cy + p + lw, t, 1, alpha(WARM, 0.2));
  }

  // conveyor — one stamp per facing, so the direction of travel is baked and the board pass never
  // has to branch. Two stacked arrows read as motion where one reads as a marker.
  for (let dir = 0; dir < 4; dir++) {
    const index = STAMP_CONVEYOR + dir;
    if (flat) {
      fill(index, alpha(INK, 0.22));
      continue;
    }
    dots(index, alpha(INK, 0.12), 1);
    const s = t * 0.16;
    const style = alpha(HOT, 0.6);
    const along = dir === 1 || dir === 3;
    const spread = t * 0.2;
    arrow(index, dir, t / 2 - (along ? spread : 0), t / 2 - (along ? 0 : spread), s, style);
    arrow(index, dir, t / 2 + (along ? spread : 0), t / 2 + (along ? 0 : spread), s, style);
  }

  // pit — the beam fails here. An opaque hole with the raster collapsing into it and burning at
  // the rim, plus one torn line. It is the only black tile and the only red one, because it is the
  // only terrain that kills a bot for driving onto it.
  fill(STAMP_PIT, TUBE);
  if (!flat) {
    const cx = t / 2;
    const cy = t / 2;
    const r = t * 0.42;
    const edge = alpha(BURN, 0.34);
    const rim = alpha(BURN, 0.85);
    for (let y = 0; y < t; y += p) {
      const d = (y + 0.5 - cy) / r;
      const half = Math.abs(d) < 1 ? r * Math.sqrt(1 - d * d) : 0;
      const tear = y === Math.round(cy / p) * p ? t * 0.12 : 0;
      line(STAMP_PIT, tear, y, cx - half - tear, 1, edge);
      line(STAMP_PIT, cx + half + tear, y, t, 1, edge);
      if (half > 0 && half < r * 0.62) {
        line(STAMP_PIT, cx - half, y, half * 2, 1, rim);
      }
    }
  }
}

function isSolid(tile: Tile | undefined): boolean {
  if (!tile) return true;
  const k = tile.terrain;
  return (
    k === Terrain.Wall ||
    k === Terrain.Rock ||
    k === Terrain.Ore ||
    k === Terrain.Rubble ||
    k === Terrain.Void
  );
}

function stampFor(tile: Tile): number {
  switch (tile.terrain) {
    case Terrain.Floor:
      return STAMP_FLOOR;
    case Terrain.Wall:
      return STAMP_WALL;
    case Terrain.Pad:
      return STAMP_PAD;
    case Terrain.Regolith:
      return STAMP_REGOLITH;
    case Terrain.Soil:
      return STAMP_SOIL;
    case Terrain.Rock:
      return STAMP_ROCK;
    case Terrain.Ore:
      return STAMP_ORE;
    case Terrain.Rubble:
      return STAMP_RUBBLE;
    case Terrain.Ice:
      return STAMP_ICE;
    case Terrain.Pit:
      return STAMP_PIT;
    case Terrain.Cable:
      return STAMP_CABLE;
    case Terrain.Depot:
      return STAMP_DEPOT;
    case Terrain.Conveyor: {
      const facing = tile.meta?.['facing'];
      return STAMP_CONVEYOR + (typeof facing === 'number' ? facing & 3 : 1);
    }
    default:
      return -1;
  }
}

/**
 * The board, drawn as raster.
 *
 * Void is the absence of a stamp rather than a dark stamp: a cell the beam never reached is the
 * one thing a tube renders for free, and leaving it transparent lets the backdrop's dead raster
 * show through, which is a truer "outside the contract area" than any fill would be.
 */
function paintTerrain(paint: TerrainPaint): void {
  const { ctx, world, tilePx, width, height } = paint;
  const source = ensureSheet(tilePx);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;

  if (source) {
    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const tile = tileAt(world, { x, y });
        if (!tile) continue;
        const stamp = stampFor(tile);
        if (stamp < 0) continue;
        ctx.drawImage(
          source,
          stamp * tilePx,
          0,
          tilePx,
          tilePx,
          x * tilePx,
          y * tilePx,
          tilePx,
          tilePx,
        );
      }
    }
  }

  paintStructure(ctx, world, tilePx);
  ctx.restore();
}

/**
 * The second pass: everything that needs a neighbour or a tile field.
 *
 * A lit line along the top of every solid edge is beam overshoot at a brightness transition, and
 * it is doing the job the standard direction's drop shadow does — without it a raster board is a
 * flat texture map and the player cannot see where the structure is. It is the single highest-
 * value mark in the whole terrain pass and it costs one `fillRect` per exposed wall face.
 */
function paintStructure(ctx: CanvasRenderingContext2D, world: World, t: number): void {
  const lw = Math.max(1, Math.round(t / 14));
  const crown = alpha(HOT, 0.62);
  const footer = alpha(INK, 0.14);
  const join = alpha(WARM, 0.62);
  const seed = alpha(HOT, 0.9);

  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const tile = tileAt(world, { x, y });
      if (!tile) continue;
      const px = x * t;
      const py = y * t;

      if (isSolid(tile) && tile.terrain !== Terrain.Void) {
        if (!isSolid(tileAt(world, { x, y: y - 1 }))) {
          ctx.fillStyle = crown;
          ctx.fillRect(px, py, t, lw);
        }
        if (!isSolid(tileAt(world, { x, y: y + 1 }))) {
          ctx.fillStyle = footer;
          ctx.fillRect(px, py + t - lw, t, lw);
        }
        continue;
      }

      if (tile.terrain === Terrain.Cable) {
        const cw = Math.max(1, Math.round(t / 12));
        const cx = Math.round(px + t / 2 - cw / 2);
        ctx.fillStyle = join;
        if (tileAt(world, { x, y: y - 1 })?.terrain === Terrain.Cable) {
          ctx.fillRect(cx, py, cw, Math.round(t / 2));
        }
        if (tileAt(world, { x, y: y + 1 })?.terrain === Terrain.Cable) {
          ctx.fillRect(cx, py + Math.round(t / 2), cw, Math.round(t / 2));
        }
        continue;
      }

      /*
       * Growth as a stack of bars rather than a sprite that swells. Countable is the requirement —
       * the player is checking whether a crop is ready, which is a number, not a mood.
       */
      const growth = tile.growth ?? 0;
      if (tile.terrain === Terrain.Soil && growth > 0) {
        const max = Math.max(1, tile.maxGrowth ?? growth);
        const steps = Math.min(4, Math.max(1, Math.round((growth / max) * 4)));
        const bh = Math.max(1, Math.round(t / 12));
        ctx.fillStyle = seed;
        for (let k = 0; k < steps; k++) {
          const bw = Math.round(t * (0.5 - k * 0.09));
          ctx.fillRect(px + Math.round((t - bw) / 2), py + t - (k + 1) * bh * 2, bw, bh);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Screen passes
// ---------------------------------------------------------------------------

/**
 * Everything the two screen-space hooks allocate, allocated once.
 *
 * `backdrop` and `post` run at 60 Hz through a whole replay scrub, so a pattern, a gradient or an
 * offscreen canvas built inside either of them is a per-frame allocation with a GC pause attached.
 * They are keyed on the only things that can invalidate them — the canvas size and the device
 * pixel ratio — and rebuilt on a resize, which is not a frame.
 */
let deadRaster: CanvasPattern | null = null;
let deadRasterDpr = 0;
let scanlines: CanvasPattern | null = null;
let scanlineDpr = 0;
let glass: CanvasGradient | null = null;
let sweep: CanvasGradient | null = null;
let screenKey = '';
let bloom: HTMLCanvasElement | null = null;
let bloomCtx: CanvasRenderingContext2D | null = null;
let bloomKey = '';

/** Scanline period in device px. Two CSS pixels: integer at every ratio, and it never beats. */
function scanPeriod(dpr: number): number {
  return Math.max(2, Math.round(2 * dpr));
}

function stripePattern(
  ctx: CanvasRenderingContext2D,
  period: number,
  lit: number,
  style: string,
): CanvasPattern | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = period;
  const cc = c.getContext('2d');
  if (!cc) return null;
  cc.fillStyle = style;
  cc.fillRect(0, 0, 1, lit);
  return ctx.createPattern(c, 'repeat');
}

function ensureScreen(paint: BackdropPaint): void {
  const { ctx, width, height, dpr } = paint;
  if (deadRasterDpr !== dpr || !deadRaster) {
    deadRaster = stripePattern(
      ctx,
      scanPeriod(dpr),
      Math.max(1, Math.round(dpr)),
      alpha(INK, 0.035),
    );
    deadRasterDpr = dpr;
  }
  if (scanlineDpr !== dpr || !scanlines) {
    scanlines = stripePattern(
      ctx,
      scanPeriod(dpr),
      Math.max(1, Math.round(dpr)),
      'rgba(0, 0, 0, 0.3)',
    );
    scanlineDpr = dpr;
  }
  const key = `${width}x${height}`;
  if (key === screenKey && glass && sweep) return;
  screenKey = key;
  const cx = width / 2;
  const cy = height / 2;
  const g = ctx.createRadialGradient(cx, cy * 0.9, 0, cx, cy, Math.hypot(cx, cy));
  g.addColorStop(0, '#120c04');
  g.addColorStop(0.55, '#0b0804');
  g.addColorStop(1, TUBE);
  glass = g;
  /*
   * Built in local coordinates and translated at fill time — gradient space resolves against the
   * transform in force when it is used, which is what lets one cached object be the retrace bar
   * wherever it happens to be on the screen this frame.
   */
  const band = Math.max(24, height * 0.16);
  const s = ctx.createLinearGradient(0, 0, 0, band);
  s.addColorStop(0, alpha(INK, 0));
  s.addColorStop(0.82, alpha(INK, 0.05));
  s.addColorStop(0.97, alpha(HOT, 0.16));
  s.addColorStop(1, alpha(INK, 0));
  sweep = s;
}

/** The dark glass of the tube at rest, with its raster showing even where there is no signal. */
function backdrop(paint: BackdropPaint): void {
  const { ctx, width, height } = paint;
  ensureScreen(paint);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = glass ?? TUBE;
  ctx.fillRect(0, 0, width, height);
  if (deadRaster) {
    ctx.fillStyle = deadRaster;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
}

/**
 * Bloom, as one downsample and one additive upsample.
 *
 * The blur is applied *during* the downscale rather than after it, so the whole effect is two
 * `drawImage` calls and one filtered blit at a sixteenth of the pixels; `blur(2px)` at quarter
 * resolution is `blur(8px)` at full, which is a wider halo than a full-res filter would be worth
 * paying for. There is deliberately no bright-pass: on a board whose background is #080603 the
 * dark areas contribute almost nothing to an additive composite, so thresholding would cost a
 * second pass to remove light that is not there.
 */
function drawBloom(paint: PostPaint): void {
  const { ctx, width, height } = paint;
  if (typeof document === 'undefined') return;
  const w = Math.max(1, width >> 2);
  const h = Math.max(1, height >> 2);
  const key = `${w}x${h}`;
  if (!bloom || bloomKey !== key) {
    bloom = bloom ?? document.createElement('canvas');
    bloom.width = w;
    bloom.height = h;
    bloomCtx = bloom.getContext('2d');
    bloomKey = key;
  }
  const bc = bloomCtx;
  if (!bc) return;
  if (typeof bc.filter !== 'string') return;
  bc.setTransform(1, 0, 0, 1, 0, 0);
  bc.globalCompositeOperation = 'copy';
  bc.filter = 'blur(2px)';
  bc.drawImage(ctx.canvas, 0, 0, width, height, 0, 0, w, h);
  bc.filter = 'none';
  bc.globalCompositeOperation = 'source-over';

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.42;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(bloom, 0, 0, w, h, 0, 0, width, height);
  ctx.restore();
}

/** Wall-clock seconds the reveal takes. Long enough to read as a scan, short enough to sit through. */
const REVEAL = 1.6;
const LAG_LINE = 'K&D RELAY 4471  ·  SIGNAL ACQUIRED  ·  LAG 40:00:00';
const HOLD_LINE = 'FRAME HELD — NO CARRIER FROM SITE';

let revealStart = -1;
let wasPreview = false;

/**
 * The screen, after everything.
 *
 * Order matters and is not arbitrary: bloom first, because it has to blur the *image* and not the
 * raster laid over it; then the scanlines, which are the display and therefore sit above every
 * mark; then the beam artefacts, which happen in the glass in front of both.
 */
function post(paint: PostPaint): void {
  const { ctx, width, height, time, preview, reducedMotion } = paint;
  ensureScreen(paint);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  drawBloom(paint);

  if (scanlines) {
    ctx.fillStyle = scanlines;
    ctx.fillRect(0, 0, width, height);
  }

  /*
   * The retrace. A tube that has been on for two hundred years does not hold its vertical lock,
   * and the bar drifting down the frame is the cheapest possible way to say the picture is being
   * redrawn rather than displayed. It is additive and it is under six per cent, so it never takes
   * a tile away from the player — and it is the first thing `prefers-reduced-motion` deletes.
   */
  if (!reducedMotion && sweep) {
    const band = Math.max(24, height * 0.16);
    const y = ((time * 0.13) % 1) * (height + band) - band;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(0, y);
    ctx.fillStyle = sweep;
    ctx.fillRect(0, 0, width, band);
    ctx.restore();
  }

  if (preview) {
    if (!wasPreview) revealStart = time;
    drawPreview(paint, reducedMotion ? 1 : (time - revealStart) / REVEAL);
  } else {
    revealStart = -1;
  }
  wasPreview = preview;

  ctx.restore();
}

/**
 * The pre-run still, as the device would present one.
 *
 * A tube handed a frame that is forty minutes old paints it once and then holds it, so the board
 * arrives under a beam that sweeps down it — and the sweep runs *once* on entry rather than on a
 * loop, because a wipe that keeps occluding the board is an obstruction dressed as an idea and
 * the player is trying to read this picture. After it lands, all that is left is the readout.
 */
function drawPreview(paint: PostPaint, progress: number): void {
  const { ctx, width, height, dpr, time, reducedMotion } = paint;

  if (progress < 1) {
    const edge = progress * height;
    ctx.fillStyle = alpha(TUBE, 0.97);
    ctx.fillRect(0, edge, width, height - edge);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = alpha(HOT, 0.5);
    ctx.fillRect(0, edge - Math.max(1, dpr), width, Math.max(2, dpr * 2));
    ctx.fillStyle = alpha(INK, 0.08);
    ctx.fillRect(0, edge - height * 0.12, width, height * 0.12);
    ctx.restore();
  }

  const pad = Math.round(10 * dpr);
  const size = Math.round(11 * dpr);
  ctx.font = `500 ${size}px 'JetBrains Mono', ui-monospace, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const base = height - pad;
  ctx.fillStyle = alpha(INK, 0.62);
  ctx.fillText(LAG_LINE, pad, base - size * 1.5);
  ctx.fillStyle = alpha(INK, 0.38);
  ctx.fillText(HOLD_LINE, pad, base);

  // A cursor that is not blinking is a screen that has stopped, which is the one thing this
  // machine is not allowed to look like.
  if (!reducedMotion && Math.floor(time * 1.6) % 2 === 0) {
    const w = ctx.measureText(HOLD_LINE).width;
    ctx.fillStyle = alpha(HOT, 0.8);
    ctx.fillRect(pad + w + size * 0.4, base - size * 0.75, size * 0.55, size * 0.85);
  }
}

// ---------------------------------------------------------------------------
// The unit
// ---------------------------------------------------------------------------

/** The 48-unit frame bot geometry is authored in. A local copy: `tiles.ts` imports `theme.ts`. */
const BOT_FRAME = 48;
/** Facing angles, indexed by `Dir`. */
const BOT_ANGLE = [-Math.PI / 2, 0, Math.PI / 2, Math.PI] as const;

/**
 * `String(n)` inside a draw path allocates once per label per frame, and on this direction the
 * label is drawn on *every* bot at every zoom rather than only when there is room, so the table
 * matters more here than it does in `sprites.ts`.
 */
const NUMERALS: readonly string[] = Array.from({ length: 64 }, (_, i) => String(i));

function numeral(value: number): string {
  const n = value | 0;
  return (n >= 0 && n < NUMERALS.length ? NUMERALS[n] : String(n)) as string;
}

let fontPx = -1;
let fontFace = '';

/**
 * One slot, because the near and far forms are mutually exclusive on a frame — only the size
 * changes, and only on a zoom step.
 */
function fontAt(px: number): string {
  if (px !== fontPx) {
    fontPx = px;
    fontFace = `600 ${px}px 'JetBrains Mono', ui-monospace, monospace`;
  }
  return fontFace;
}

/**
 * The far-zoom unit: a dark cell with a lit rim and its number printed in it.
 *
 * This is the direction paying its own bill. `botAccents` is one hue at twelve intensities, and
 * an intensity is not a name — at the zoom World 7 is played at, twelve bots that differ only in
 * how bright they are is twelve bots the player cannot tell apart. So the far form stops trying
 * to be a coloured blip and becomes a *numbered* one, which is the identity channel a monochrome
 * device actually has. The rim keeps the intensity as a second, weaker cue.
 */
function drawBotChip(
  ctx: CanvasRenderingContext2D,
  pose: BotPose,
  tilePx: number,
  options: BotDrawOptions,
): void {
  const cx = (pose.x + 0.5) * tilePx;
  const cy = (pose.y + 0.5) * tilePx;
  const r = tilePx * 0.4;
  const dead = !pose.alive;
  const shimmy = options.reduced ? 0 : Math.sin(pose.recoil * 30) * pose.recoil * 0.09;
  const stretch = 1 + pose.stretch;
  const rim = dead ? alpha(INK, 0.28) : options.accent;

  ctx.save();
  ctx.translate(cx, cy);

  ctx.save();
  ctx.rotate((BOT_ANGLE[pose.facing] ?? 0) + shimmy);
  ctx.scale(stretch, 1 / stretch);
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(-r, -r * 0.86);
  ctx.lineTo(r * 0.55, -r * 0.86);
  ctx.lineTo(r, 0);
  ctx.lineTo(r * 0.55, r * 0.86);
  ctx.lineTo(-r, r * 0.86);
  ctx.closePath();
  ctx.fillStyle = signal.palette.bgVoid;
  ctx.fill();
  ctx.lineWidth = Math.max(1, tilePx * 0.07);
  ctx.strokeStyle = rim;
  ctx.stroke();

  /* The rim is brightest on the leading edges, which is the facing cue the number cannot carry. */
  if (!dead) {
    ctx.lineWidth = Math.max(1.5, tilePx * 0.1);
    ctx.strokeStyle = HOT;
    ctx.beginPath();
    ctx.moveTo(r * 0.55, -r * 0.86);
    ctx.lineTo(r, 0);
    ctx.lineTo(r * 0.55, r * 0.86);
    ctx.stroke();
  }
  ctx.restore();

  /* Printed after the rotation is dropped: a number that turns with the bot is not a number. */
  ctx.font = fontAt(Math.round(tilePx * 0.46));
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = dead ? alpha(INK, 0.3) : INK;
  ctx.fillText(numeral(pose.id), 0, tilePx * 0.02);
  ctx.restore();

  if (options.active && !dead) drawBotBrackets(ctx, cx, cy, r * 1.5, Math.max(1, tilePx * 0.06));
  if (pose.blocked > 0.02 || pose.recoil > 0.04) {
    drawBotBlocked(ctx, pose, cx, cy, tilePx / BOT_FRAME, options.reduced, 0);
  }
  if (pose.idle > 0 && pose.alive) {
    drawBotIdle(ctx, cx, cy, tilePx / BOT_FRAME, options.time, options.accent, options.reduced);
  }
  if (options.showFuel && pose.alive) drawBotFuel(ctx, cx, cy, tilePx / BOT_FRAME, options.fuel);
}

/**
 * The near-zoom unit.
 *
 * The chassis is the shipped geometry rebuilt out of what the device can draw — flat blocks and
 * ruled edges, no fillets, no bevel, no cast shadow, because a tube has no light source to cast
 * one and nothing to bevel against. Lift comes from a dark hull inside a lit rim, and the halo
 * comes free from the bloom in `post`.
 */
function drawBotDetail(
  ctx: CanvasRenderingContext2D,
  pose: BotPose,
  tilePx: number,
  options: BotDrawOptions,
): void {
  const s = tilePx / BOT_FRAME;
  const cx = (pose.x + 0.5) * tilePx;
  const cy = (pose.y + 0.5) * tilePx;
  const skin = signal.bot;
  const accent = options.accent;
  const dead = !pose.alive;
  const reduced = options.reduced;
  const load = Math.min(1, options.carrying / 4);
  const glide = pose.travel > 0 && pose.travel < 1 ? Math.sin(Math.PI * pose.travel) : 0;
  const wobble = reduced ? 0 : Math.sin(options.time * 6.5 + pose.id * 2.1) * load * (0.35 + glide);
  const shimmy = reduced ? 0 : Math.sin(pose.recoil * 30) * pose.recoil * 0.09;
  const stretch = 1 + pose.stretch;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((BOT_ANGLE[pose.facing] ?? 0) + shimmy + wobble * 0.05 + (dead ? 0.35 : 0));
  ctx.scale(stretch * s, s / stretch);
  ctx.lineJoin = 'miter';

  ctx.fillStyle = dead ? alpha(INK, 0.1) : skin.tread;
  ctx.fillRect(-18, -17, 36, 7);
  ctx.fillRect(-18, 10, 36, 7);
  ctx.fillStyle = dead ? alpha(INK, 0.16) : alpha(INK, 0.5);
  const phase = (pose.travel * 6 + (reduced ? 0 : options.time * 3)) % 1;
  for (let i = -2; i <= 2; i++) {
    const x = i * 7 + phase * 7 - 3.5;
    ctx.fillRect(x, -16, 2.4, 5);
    ctx.fillRect(x, 11, 2.4, 5);
  }

  ctx.fillStyle = skin.hullDark;
  ctx.fillRect(-16, -13, 33, 26);
  ctx.strokeStyle = dead ? alpha(INK, 0.3) : skin.rim;
  ctx.lineWidth = 1.8;
  ctx.strokeRect(-16, -13, 33, 26);

  ctx.fillStyle = dead ? '#150d03' : '#241703';
  ctx.fillRect(-11, -9, 21, 18);

  /*
   * The punch strip: `id` in binary, four cells, on the top plate.
   *
   * Sixteen bots readable straight off the hull without a label and without a hue. This is the
   * whole answer to what a monochrome direction does about identity — the accent stays as a
   * warmth cue, but the thing you actually count is holes in a card.
   */
  ctx.globalAlpha = dead ? 0.25 : 1;
  ctx.fillStyle = accent;
  for (let bit = 0; bit < 4; bit++) {
    ctx.globalAlpha = (dead ? 0.25 : 1) * (((pose.id >> bit) & 1) === 1 ? 0.95 : 0.16);
    ctx.fillRect(-9.5, -7.5 + bit * 4, 5, 2.6);
  }
  ctx.globalAlpha = 1;

  /* Shifted forward off the punch strip: the two marks must not read as one block. */
  ctx.globalAlpha = dead ? 0.3 : 1;
  ctx.fillStyle = dead ? alpha(INK, 0.4) : accent;
  ctx.beginPath();
  ctx.moveTo(2, -7.5);
  ctx.lineTo(9, 0);
  ctx.lineTo(2, 7.5);
  ctx.lineTo(-1.5, 7.5);
  ctx.lineTo(5.5, 0);
  ctx.lineTo(-1.5, -7.5);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = skin.glass;
  ctx.fillRect(11, -4.5, 6, 9);
  ctx.strokeStyle = dead ? alpha(INK, 0.3) : skin.rim;
  ctx.lineWidth = 1.4;
  ctx.strokeRect(11, -4.5, 6, 9);
  if (!dead) {
    const pulse = 0.55 + 0.45 * Math.sin(options.time * 4 + pose.id);
    ctx.fillStyle = alpha(HOT, reduced ? 0.85 : 0.55 + 0.45 * pulse);
    ctx.fillRect(12.4, -2, 3.2, 4);
  }

  if (!dead) {
    // The mast lags whatever the chassis is doing: it hangs forward through the wind-up, whips
    // back on the launch, and rattles for a moment after a bump.
    const bob =
      (reduced ? 0 : Math.sin(options.time * 3.4 + pose.id * 1.7) * 2.2) +
      pose.travel * -3.4 +
      pose.anticipate * 3.4 +
      (reduced ? 0 : Math.sin(pose.recoil * 44) * pose.recoil * 5) -
      wobble * 1.6;
    ctx.strokeStyle = skin.rim;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-11, -4);
    ctx.lineTo(-17 + bob * 0.4, -16 + bob);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillRect(-18.4 + bob * 0.4, -17.4 + bob, 2.8, 2.8);
  }

  if (options.carrying > 0 && !dead) {
    ctx.save();
    ctx.translate(0, wobble * 2.6);
    ctx.fillStyle = signal.palette.bgVoid;
    ctx.fillRect(-6, -6, 12, 12);
    ctx.strokeStyle = WARM;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-6, -6, 12, 12);
    ctx.fillStyle = WARM;
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
  }

  if (pose.action > 0 && !dead) {
    const reach = Math.sin(Math.PI * pose.action) * 9;
    ctx.fillStyle = accent;
    ctx.fillRect(17, -1.2, reach + 2, 2.4);
    ctx.fillRect(17 + reach, -3, 3.4, 6);
  }

  ctx.restore();

  if (options.active && !dead) drawBotBrackets(ctx, cx, cy, 24 * s, Math.max(1, 2.4 * s));

  if (pose.blocked > 0.02 || pose.recoil > 0.04) {
    drawBotBlocked(ctx, pose, cx, cy, s, reduced, options.showLabel ? 15 : 0);
  }
  if (pose.idle > 0 && pose.alive) {
    drawBotIdle(ctx, cx, cy, s, options.time, accent, reduced);
  }
  if (pose.failed && pose.blocked <= 0.02 && pose.alive) {
    drawBotFailed(ctx, cx, cy, s, Math.sin(Math.PI * Math.max(pose.action, 0.001)));
  }
  if (options.showFuel && pose.alive) drawBotFuel(ctx, cx, cy, s, options.fuel);

  /*
   * 28 device px is 14 CSS px on a retina panel, which switched the id off across most of the
   * range World 7 is actually played at — on the one direction that has no other way to say which
   * bot this is. It comes on as soon as a glyph has a body.
   */
  if (options.showLabel && tilePx >= 20 * options.dpr) {
    const px = Math.max(9, Math.round(tilePx * 0.24));
    const label = numeral(pose.id);
    ctx.font = fontAt(px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(label).width + px * 0.8;
    const h = px * 1.3;
    const lx = cx - w / 2;
    const ly = cy - 26 * s - h / 2;
    ctx.fillStyle = signal.palette.bgVoid;
    ctx.fillRect(lx, ly, w, h);
    ctx.strokeStyle = alpha(accent, 0.9);
    ctx.lineWidth = Math.max(1, s);
    ctx.strokeRect(lx, ly, w, h);
    ctx.fillStyle = INK;
    ctx.fillText(label, cx, ly + h / 2);
  }
}

function drawBot(
  ctx: CanvasRenderingContext2D,
  pose: BotPose,
  tilePx: number,
  options: BotDrawOptions,
): void {
  ctx.save();
  ctx.lineCap = 'butt';
  if (tilePx < signal.metrics.botDetailTilePx * options.dpr) {
    drawBotChip(ctx, pose, tilePx, options);
  } else {
    drawBotDetail(ctx, pose, tilePx, options);
  }
  ctx.restore();
}

/** Selection, as the device would mark it: four corner brackets, not a bloom. */
function drawBotBrackets(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  width: number,
): void {
  const arm = r * 0.42;
  ctx.strokeStyle = HOT;
  ctx.lineWidth = width;
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

/**
 * DESIGN.md §11 A5: a blocked move must look obviously different from a successful one.
 *
 * `danger` is the one place the monochrome bends, so the bump is the only time the phosphor goes
 * red — which makes it the single most distinct event on the board and keeps it legible for the
 * colour-blind, where an intensity change would not be.
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
    ctx.save();
    ctx.rotate(BOT_ANGLE[pose.facing] ?? 0);
    ctx.strokeStyle = alpha(BURN, 0.95 * k);
    ctx.lineWidth = Math.max(1.5, 3 * s);
    ctx.beginPath();
    for (let i = 0; i < 2; i++) {
      const r = (21 + i * 6) * s;
      ctx.moveTo(r * 0.72, -r * 0.72);
      ctx.lineTo(r, 0);
      ctx.lineTo(r * 0.72, r * 0.72);
    }
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = alpha(BURN, 0.75 * k);
    ctx.lineWidth = Math.max(1.5, 2.5 * s);
    ctx.strokeRect(-20 * s, -20 * s, 40 * s, 40 * s);
  }

  // The bang outlasts the impact by a beat and hops while the bot collects itself. A wall is
  // funnier than an error dialog, and this is the part that makes it one.
  const bang = Math.max(k, pose.recoil * 0.85);
  const hop = reduced ? 0 : Math.abs(Math.sin(pose.recoil * 9)) * pose.recoil * 4 * s;
  const by = (-32 - lift) * s - bang * 3 * s - hop;
  ctx.fillStyle = alpha(BURN, bang);
  ctx.fillRect(-2 * s, by, 4 * s, 10 * s);
  ctx.fillRect(-2 * s, by + 13 * s, 4 * s, 4 * s);
  ctx.restore();
}

/** Three ticking cells over a waiting bot, on a slow cycle so a whole row of them is not a strobe. */
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
  const y = cy - 28 * s;
  for (let i = 0; i < 3; i++) {
    const phase = (time * 1.6 - i * 0.22) % 1;
    const lit = reduced || (phase > 0 && phase < 0.5) ? 1 : 0.25;
    ctx.fillStyle = alpha(accent, 0.35 + lit * 0.6);
    ctx.fillRect(cx + (i - 1) * gap - w / 2, y - w / 2, w, w);
  }
}

/** A failed non-move action. Same red as the bump, one notch quieter. */
function drawBotFailed(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  strength: number,
): void {
  const r = 6 * s;
  const y = cy - 28 * s;
  ctx.strokeStyle = alpha(BURN, 0.9 * Math.max(0, Math.min(1, strength)));
  ctx.lineWidth = Math.max(1.5, 2.4 * s);
  ctx.beginPath();
  ctx.moveTo(cx - r, y - r);
  ctx.lineTo(cx + r, y + r);
  ctx.moveTo(cx + r, y - r);
  ctx.lineTo(cx - r, y + r);
  ctx.stroke();
}

/** Fuel as eight lit cells rather than an arc: this device counts, it does not sweep. */
function drawBotFuel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  fuel: number,
): void {
  const level = Math.max(0, Math.min(1, fuel));
  const cells = 8;
  const w = Math.max(1.5, 3 * s);
  const step = 4.2 * s;
  const x = cx - (cells * step - (step - w)) / 2;
  const y = cy + 21 * s;
  const lit = Math.round(level * cells);
  for (let i = 0; i < cells; i++) {
    ctx.fillStyle = i < lit ? (level > 0.3 ? INK : BURN) : alpha(INK, 0.14);
    ctx.fillRect(x + i * step, y, w, Math.max(2, 5 * s));
  }
}
