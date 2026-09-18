import { Terrain } from '../../engine/index.ts';
import type { Tile } from '../../engine/index.ts';
import { alpha, mix, shade } from './color.ts';
import { drawRepair, drawRuns, isRepaired, machineRuns } from '../conduit.ts';
import type { RunStyle } from '../conduit.ts';
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

export const FLOOR = '#4c5661';

type Ctx = CanvasRenderingContext2D;

const PALETTE = {
  bgVoid: '#070a0c',
  bgPanel: '#0f1418',
  bgRaised: '#1a2228',
  ink: '#e2ebef',
  inkDim: '#93a7b2',
  accent: '#3fd6c0',
  accent2: '#ffab3d',
  danger: '#ff6152',
  ok: '#84dd6e',
  gold: '#ffd166',
  silver: '#c6d0dc',
  bronze: '#cd8b52',
} as const;

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

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

function hash(x: number, y: number, salt: number): number {
  let h = Math.imul(x + 0x1f1f, 374761393) ^ Math.imul(y + 0x9e37, 668265263);
  h = Math.imul(h ^ Math.imul(salt + 1, 2246822519), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

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

const FLOOR_SPREAD = 0.09;
const SOLID_SPREAD = 0.24;

const SOLID_RISE = 0.2;

const RISE_SCALE: Readonly<Record<string, number>> = {
  [Terrain.Wall]: 1,
  [Terrain.Void]: 1,
  [Terrain.Rock]: 0.85,
  [Terrain.Ore]: 0.85,
  [Terrain.Rubble]: 0.42,
};

const SHADOW_REACH = 0.28;
const CONTACT_DEPTH = 0.09;

const SHADOW_INK = '#04090f';
const UMBRA = alpha(SHADOW_INK, 0.32);
const CONTACT = alpha(SHADOW_INK, 0.3);
const OCCLUDE_S = alpha(SHADOW_INK, 0.28);
const OCCLUDE_E = alpha(SHADOW_INK, 0.2);

const FACE_UPPER = 0.62;
const FACE_FOOT = 0.34;

function risePx(T: number, scale: number): number {
  return Math.max(1, Math.round(T * SOLID_RISE * scale));
}

type FloorKind = 'plate' | 'grain' | 'stone' | 'ice';

interface Site {
  floor: string;
  floorKind: FloorKind;
  wall: string;
  wallKind: 'panel' | 'stone';
  grit: string;
  dust: number;
}

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
  rack: 13,
  faceWall: 14,
  faceRock: 15,
  faceOre: 16,
  faceRubble: 17,
  faceVoid: 18,
  litN: 19,
  litW: 20,
  darkE: 21,
  castN: 22,
  castW: 23,
  castNW: 24,
  aoS: 25,
  aoE: 26,
} as const;
const SHEET_ROWS = 27;
const SHEET_COLS = 4;

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
    const bx = Math.round(T * 0.2);
    const bw = Math.round(T * 0.6);
    const by = Math.round(T * 0.42);
    const bh = Math.round(T * 0.22);
    c.fillStyle = shade(r.deep, 0.8);
    c.fillRect(bx, by, bw, bh);
    hazard(c, bx, by, bw, bh, g, alpha(PALETTE.accent2, 0.5), Math.max(1, Math.round(T * 0.09)));
  }
}

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

const PIT_SPILL: readonly string[] = ['#0d151c', '#17242e', '#243743'];

function paintPit(c: Ctx, T: number, D: number, col: number): void {
  const g = Math.max(1, Math.round(T / 12));
  c.fillStyle = '#05090d';
  c.fillRect(0, 0, T, T);

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
  const cw = Math.max(1, Math.round(T * 0.055));
  const half = Math.round(T * 0.5);
  const reach = Math.round(T * 0.16);
  for (let i = 0; i < 2; i++) {
    const x = Math.round(T * (0.26 + i * 0.36));
    stepLine(c, x - reach, half - reach, x, half, cw, alpha(PALETTE.silver, 0.72));
    stepLine(c, x - reach, half + reach, x, half, cw, alpha(PALETTE.silver, 0.72));
  }
}

function paintRack(c: Ctx, T: number, col: number, deck: Ramp, metal: Ramp, site: Site): void {
  const g = Math.max(1, Math.round(T / 12));
  const beam = Math.max(2, Math.round(T * 0.17));
  const post = Math.max(2, Math.round(T * 0.12));
  const e = Math.max(1, Math.round(T * 0.045));

  c.fillStyle = deck.dark;
  c.fillRect(0, 0, T, T);
  dither(c, 0, 0, T, T, g, deck.deep, 0.3, 1);
  dither(c, 0, 0, T, T, g, alpha(site.grit, 0.4), site.dust * 0.16, 3);

  const slat = Math.max(1, Math.round(T * 0.06));
  for (let i = 1; i < 3; i++) {
    const y = Math.round((i * T) / 3) - (slat >> 1);
    c.fillStyle = deck.deep;
    c.fillRect(0, y, T, slat);
    c.fillStyle = alpha(PALETTE.silver, 0.08);
    c.fillRect(0, y - e, T, e);
  }

  if ((col & 1) === 0) {
    c.fillStyle = metal.mid;
    c.fillRect(0, 0, T, beam);
    c.fillStyle = metal.lit;
    c.fillRect(0, 0, T, e);
    c.fillStyle = metal.deep;
    c.fillRect(0, beam - e, T, e);
    c.fillStyle = UMBRA;
    c.fillRect(0, beam, T, Math.max(1, Math.round(T * CONTACT_DEPTH)));
  }
  if ((col & 2) === 0) {
    c.fillStyle = metal.mid;
    c.fillRect(0, T - beam, T, beam);
    c.fillStyle = metal.lit;
    c.fillRect(0, T - beam, T, e);
    c.fillStyle = metal.deep;
    c.fillRect(0, T - e, T, e);
  }

  c.fillStyle = metal.dark;
  c.fillRect(0, 0, post, T);
  c.fillStyle = metal.lit;
  c.fillRect(0, 0, e, T);
  c.fillStyle = metal.deep;
  c.fillRect(post - e, 0, e, T);
  c.fillStyle = UMBRA;
  c.fillRect(post, 0, e, T);
}

function paintEdge(c: Ctx, T: number, row: number): void {
  const g = Math.max(1, Math.round(T / 12));
  const lit = '#dbe8f0';
  const reach = Math.max(1, Math.round(T * SHADOW_REACH));
  const near = Math.max(1, Math.round(T * CONTACT_DEPTH));
  switch (row) {
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
  const ice = ramp(mix(site.floor, '#8fb6c8', 0.28), FLOOR_SPREAD);
  const deck = ramp(mix(site.floor, site.wall, 0.62), FLOOR_SPREAD);
  const stone = ramp(shade(site.wall, 1.35), SOLID_SPREAD);
  const wall = ramp(site.wall, SOLID_SPREAD);
  const outside = ramp(shade(site.wall, 0.5), SOLID_SPREAD);
  const metal = ramp(mix(site.wall, PALETTE.silver, 0.26), SOLID_SPREAD);
  const chip = Math.max(1, Math.round(risePx(T, 1) * 0.34));
  const ribs = T >= 24 ? 3 : 2;

  for (let col = 0; col < SHEET_COLS; col++) {
    for (let row = 0; row < SHEET_ROWS; row++) {
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
        case ROW.rack:
          paintRack(c, T, col, deck, metal, site);
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

const SOLIDS = new Set<string>([
  Terrain.Wall,
  Terrain.Rock,
  Terrain.Ore,
  Terrain.Rubble,
  Terrain.Void,
]);

const CABLE_CORE = shade(PALETTE.bronze, 0.82);

const RUN_STYLE: RunStyle = {
  rail: shade(FLOOR, 0.34),
  deck: mix(FLOOR, PALETTE.bgPanel, 0.42),
  core: PALETTE.accent,
  dead: PALETTE.bgVoid,
  railWidth: 0.96,
  deckWidth: 0.76,
  coreWidth: 0.2,
};

const REPAIR_CLAMP = PALETTE.ok;

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
  const runs = machineRuns(world);
  const stride = w + 2;
  const solid = new Uint8Array(stride * (h + 2)).fill(1);
  const cable = new Uint8Array(stride * (h + 2));
  const pit = new Uint8Array(stride * (h + 2));
  const rack = new Uint8Array(stride * (h + 2));
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
      if (tile.terrain === Terrain.Rack) rack[i] = 1;
    }
  }

  const blit = (row: number, col: number, dx: number, dy: number): void => {
    ctx.drawImage(sheetCanvas, col * T, row * T, T, T, dx, dy, T, T);
  };
  const band = (row: number, col: number, dx: number, dy: number, hgt: number): void => {
    ctx.drawImage(sheetCanvas, col * T, row * T, T, hgt, dx, dy, T, hgt);
  };

  const floorRamp = ramp(site.floor, FLOOR_SPREAD);

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
          blit(ROW.pit, (pit[i - stride] === 1 ? 0 : 1) | (pit[i + stride] === 1 ? 0 : 2), ox, oy);
          continue;
        case Terrain.Cable:
          blit(ROW.floor, v, ox, oy);
          if (runs.length === 0) {
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
          }
          break;
        case Terrain.Rack:
          blit(
            ROW.rack,
            (rack[i - stride] as number) | ((rack[i + stride] as number) << 1),
            ox,
            oy,
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

      if (solid[i - stride] === 1) blit(ROW.castN, 0, ox, oy);
      if (solid[i - 1] === 1) blit(ROW.castW, 0, ox, oy);
      if (solid[i - stride - 1] === 1) blit(ROW.castNW, 0, ox, oy);
      if (solid[i + stride] === 1) blit(ROW.aoS, 0, ox, oy);
      if (solid[i + 1] === 1) blit(ROW.aoE, 0, ox, oy);
    }
  }

  drawRuns(ctx, runs, T, RUN_STYLE);

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

const BOT_STEP_X = [0, 1, 0, -1] as const;
const BOT_STEP_Y = [-1, 0, 1, 0] as const;

const BOT_HULL = ramp('#3f4f61', SOLID_SPREAD);
const BOT_DEAD = ramp('#252c33', SOLID_SPREAD);
const BOT_TREAD = ramp('#141b21', 0.42);
const BOT_PACK = ramp('#232b34', SOLID_SPREAD);
const BOT_LAMP = '#ffe6b8';

const SHADE = alpha('#000000', 0.34);

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

const BOT_SHOULDER = 0.22;
const BOT_SHOULDER_SIDE = 0.17;
const BOT_STAND = 0.33;
const BOT_BOOT = 0.1;
const BOT_TORSO = 0.34;
const BOT_TORSO_SIDE = 0.36;
const BOT_COWL_W = 0.3;
const BOT_COWL_H = 0.19;
const BOT_LEAN = 0.12;
const BOT_BEVEL = 0.07;

const COWL_W_SCALE = [0.85, 1.05, 1.2, 1.05] as const;
const COWL_H_SCALE = [0.85, 1, 1.2, 1] as const;
const COWL_SIT = [-0.55, 0.2, 0.6, 0.2] as const;

const BOT_ACCENTS = new Map<string, Ramp>();

function accentRamp(color: string): Ramp {
  let r = BOT_ACCENTS.get(color);
  if (!r) {
    r = ramp(color, 0.26);
    BOT_ACCENTS.set(color, r);
  }
  return r;
}

const NUMERALS: readonly string[] = Array.from({ length: 64 }, (_, i) => String(i));

function numeral(value: number): string {
  const n = value | 0;
  return (n >= 0 && n < NUMERALS.length ? NUMERALS[n] : String(n)) as string;
}

let fontPx = -1;
let fontFace = '';

function fontAt(px: number): string {
  if (px !== fontPx) {
    fontPx = px;
    fontFace = `600 ${px}px 'JetBrains Mono', ui-monospace, monospace`;
  }
  return fontFace;
}

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

  const along = 1 + pose.stretch;
  const wScale = horiz ? along : 1 / along;
  const hScale = horiz ? 1 / along : along;

  const hw = Math.max(2, Math.round(T * (horiz ? BOT_SHOULDER_SIDE : BOT_SHOULDER) * wScale));
  const bootH = Math.max(1, Math.round(T * BOT_BOOT * hScale));
  const torsoH = Math.max(2, Math.round(T * (horiz ? BOT_TORSO_SIDE : BOT_TORSO) * hScale));
  const crouch = Math.round((pose.anticipate * 0.05 + pose.settle * 0.04) * T);
  const toe = fy > 0 ? e : 0;
  const footY = cy + Math.max(2, Math.round(T * BOT_STAND));
  const sole = footY + toe;
  const torsoY = footY - bootH - torsoH + crouch;
  const torsoW = hw * 2;
  const x0 = cx - hw;
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

  castBlock(c, x0, torsoY, torsoW, sole - torsoY, T, detail);
  c.fillStyle = SHADE;
  c.fillRect(x0, sole - e, torsoW, e);

  if (!dead) {
    const pulse = reduced ? 1 : (Math.sin(options.time * 7 + pose.id * 2.3) + 1.5) | 0;
    const poolY = horiz ? sole - e : fy > 0 ? sole : topY;
    const poolFront = horiz ? hw : fy > 0 ? 0 : lean;
    lampPool(c, cx, poolY, poolFront, tileSpan(T, horiz ? 0.17 : 0.13), fx, fy, T, pulse);
  }

  if (cowlB < torsoY) {
    volume(c, cowlX, cowlB - e, cowlW, torsoY - cowlB + e, pack, e, detail);
  }

  const behind = cowlB <= torsoY;
  if (behind) volume(c, cowlX, cowlY, cowlW, cowlH, hull, e, detail);

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

function drawBotFailed(c: Ctx, cx: number, top: number, t: number, strength: number): void {
  const r = Math.max(2, Math.round(t * 0.13));
  const w = Math.max(2, Math.round(t * 0.05));
  const y = top - Math.round(t * 0.26);
  const red = alpha(PALETTE.danger, 0.9 * Math.max(0, Math.min(1, strength)));
  stepLine(c, cx - r, y - r, cx + r, y + r, w, red);
  stepLine(c, cx + r, y - r, cx - r, y + r, w, red);
}

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

function tileAt(T: number, f: number): number {
  return Math.round(T * f);
}

function tileSpan(T: number, f: number): number {
  return Math.max(1, Math.round(T * f));
}

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

const MACHINE_GLOW = '#ffe2b0';
const MACHINE_CORE = '#fff8ec';
const MACHINE_RECESS = ramp('#20272d', 0.42);

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

function emissive(c: Ctx, x: number, y: number, w: number, h: number): void {
  if (w <= 0 || h <= 0) return;
  c.fillStyle = MACHINE_GLOW;
  c.fillRect(x, y, w, h);
  c.fillStyle = MACHINE_CORE;
  c.fillRect(x, y, Math.max(1, w >> 1), Math.max(1, h >> 1));
}

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

const MACHINE_BODY: readonly Ramp[] = [
  ramp('#7b858f', SOLID_SPREAD),
  ramp('#5c6670', SOLID_SPREAD),
  ramp('#6b5f53', SOLID_SPREAD),
  ramp('#4e5760', SOLID_SPREAD),
  ramp('#424a52', SOLID_SPREAD),
  ramp('#727d87', SOLID_SPREAD),
  ramp('#566372', SOLID_SPREAD),
  ramp('#6e767e', SOLID_SPREAD),
  ramp('#5a6a6b', SOLID_SPREAD),
  ramp('#646f7c', SOLID_SPREAD),
];

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
  const swell = paint.reduced ? 1 : Math.sin(paint.time * 3.1 + paint.x + paint.y);
  const pulse = swell > 0.5 ? 2 : swell > -0.5 ? 1 : 0;

  switch (idx) {
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

    case 1: {
      const bw = tileSpan(T, 0.42);
      const bh = tileSpan(T, 0.26);
      const bx = cx - (bw >> 1);
      const by = oy + tileAt(T, 0.6);
      castBlock(c, bx, by, bw, bh, T, detail);
      if (on) spillPool(c, cx, by + bh, bw >> 1, T, pulse);
      volume(c, bx, by, bw, bh, body, e, detail);
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

    case 3: {
      const w = tileSpan(T, 0.72);
      const h = tileSpan(T, 0.66);
      const x0 = cx - (w >> 1);
      const y0 = oy + tileAt(T, 0.22);
      const col = tileSpan(T, 0.18);
      const anvil = tileSpan(T, 0.16);
      const crown = tileSpan(T, 0.13);
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

    case 7: {
      const bw = tileSpan(T, 0.46);
      const bh = tileSpan(T, 0.18);
      const bx = cx - (bw >> 1);
      const by = oy + tileAt(T, 0.72);
      const mw = tileSpan(T, 0.12);
      const mtop = oy + tileAt(T, 0.06);
      const yagi = mtop + tileSpan(T, 0.12);
      castBlock(c, bx, mtop, bw, by + bh - mtop, T, detail);
      if (on) spillPool(c, cx, by + bh, bw >> 1, T, pulse);
      if (detail) {
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

    default: {
      const hub = tileSpan(T, 0.44);
      const x0 = cx - (hub >> 1);
      const y0 = cy - (hub >> 1);
      const st = tileSpan(T, 0.12);
      const reach = tileSpan(T, 0.14);
      castBlock(c, x0 - reach, y0 - reach, hub + reach * 2, hub + reach * 2, T, detail);
      if (on) spillPool(c, cx, y0 + hub, hub >> 1, T, pulse);
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

  if (isRepaired(paint.state)) drawRepair(c, paint.x, paint.y, T, REPAIR_CLAMP);
}

const CROP_DETAIL_TILE_PX = 14;

const CROP_FAR_W: readonly number[] = [0.44, 0.16, 0.28, 0.4, 0.52, 0.62];
const CROP_FAR_H: readonly number[] = [0.05, 0.08, 0.13, 0.18, 0.24, 0.28];
const CROP_CROWN_W: readonly number[] = [0, 0.08, 0.16, 0.24, 0.34, 0.42];
const CROP_CROWN_H: readonly number[] = [0, 0.1, 0.14, 0.18, 0.24, 0.3];

const CROP_ROWS: readonly number[] = [1, 1, 1, 2, 2, 2];
const CROP_PER_ROW: readonly number[] = [3, 3, 3, 2, 2, 2];
const CROP_TIERS: readonly number[] = [0, 1, 2, 2, 3, 3];
const CROP_STEM_H: readonly number[] = [0, 0.17, 0.24, 0.3, 0.36, 0.38];
const CROP_LEAF_W: readonly number[] = [0, 0.07, 0.09, 0.11, 0.13, 0.135];
const CROP_LEAF_H: readonly number[] = [0, 0.05, 0.06, 0.065, 0.075, 0.08];

const CROP_SOWN = ramp('#3f352a', 0.32);
const CROP_LEAF = ramp('#5f7247', 0.3);
const CROP_RIPE = ramp('#c2ab5e', 0.3);
const CROP_MARK = '#f4e7c2';
const CROP_SEED = shade('#3f352a', 1.9);

function cropRowY(oy: number, T: number, rows: number, j: number): number {
  return oy + (rows === 1 ? tileAt(T, 0.74) : tileAt(T, 0.52) + j * tileAt(T, 0.26));
}

function cropClumpX(ox: number, T: number, per: number, i: number, cw: number): number {
  return ox + Math.round(((i + 0.5) / per) * T) - (cw >> 1);
}

function cropTierY(stemH: number, tiers: number, t: number): number {
  return Math.round(stemH * (tiers === 1 ? 0.62 : 0.28 + (0.62 * t) / (tiers - 1)));
}

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

const SCRUB_INK = '#55707d';

const SCRUB_ARMS: readonly (readonly [number, number, number])[] = [
  [-1, -0.62, 1],
  [1, -0.78, 0.9],
  [-1, 0.24, 0.72],
  [1, 0.2, 0.66],
  [-0.5, -0.86, 0.55],
];

const SCRUB_ARM_COUNT: readonly number[] = [2, 3, 3, 4, 4, 5];
const SCRUB_REACH: readonly number[] = [0.13, 0.19, 0.25, 0.31, 0.36, 0.42];

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
  const nx = ox + tileAt(T, 0.46);
  const ny = oy + tileAt(T, 0.74);

  c.fillStyle = SCRUB_INK;
  c.fillRect(nx - w, ny - (w >> 1), w * 2, w);
  for (let a = 0; a < arms; a++) {
    const arm = SCRUB_ARMS[a] as readonly [number, number, number];
    scrubArm(c, nx, ny, arm[0], arm[1], reach * arm[2], w);
  }
}

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
    c.fillStyle = far.lit;
    if (kw > 0) c.fillRect(kx, y0 - kh, kw, e);
    c.fillRect(x0, y0, Math.max(1, e >> 1), h);
    c.fillStyle = far.deep;
    c.fillRect(x0, base - e, w, e);
    if (ripe) cropBrackets(c, ox, oy, T);
    return;
  }

  if (stage === 0) {
    const fw = tileSpan(T, 0.7);
    const fh = Math.max(1, Math.round(T * 0.045));
    const fx = ox + tileAt(T, 0.15);
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

  c.fillStyle = CAST_CORE;
  for (let j = 0; j < rows; j++) {
    const baseY = cropRowY(oy, T, rows, j);
    for (let i = 0; i < per; i++) {
      c.fillRect(cropClumpX(ox, T, per, i, spread) + off, baseY - lh, spread, lh);
    }
  }
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

const ITEM_DETAIL_TILE_PX = 16;
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
  ramp('#6e6152', 0.28),
  ramp('#77808a', 0.28),
  ramp('#8a6a44', 0.28),
  ramp('#a8c6d4', 0.28),
  ramp('#5a6068', 0.28),
  ramp('#8a7a4a', 0.28),
  ramp('#7f8f52', 0.28),
  ramp('#9a7b4e', 0.28),
  ramp('#8d949c', 0.28),
  ramp('#4f6a6f', 0.28),
  ramp('#3f4a54', 0.28),
];

const ORE_PIP = shade(PALETTE.bronze, 0.7);
const ICE_FRACTURE = alpha('#dff0f7', 0.5);
const ITEM_BORE = '#151b21';
const CELL_TERMINAL = '#dfe9ef';
const CHIP_LEG = '#c6d0dc';

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

    case 1: {
      const w1 = tileSpan(T, 0.3);
      const h1 = tileSpan(T, 0.26);
      const w2 = tileSpan(T, 0.18);
      const h2 = tileSpan(T, 0.16);
      volume(c, cx - w1, ground - h1 + bob, w1, h1, body, detail ? e : half, detail);
      c.fillStyle = body.deep;
      c.fillRect(cx - (w1 >> 2) - half, ground - h1 + bob, w1 >> 2, Math.max(1, h1 >> 2));
      volume(c, cx + half, ground - h2 + bob, w2, h2, body, half, false);
      break;
    }

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
      if (detail) {
        c.fillStyle = ICE_FRACTURE;
        c.fillRect(cx - half, ground - band * 4 + bob, half, band * 3);
      }
      break;
    }

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
      c.fillStyle = MACHINE_RECESS.deep;
      c.fillRect(x0 + notch * 2, y0 + half * 2, w - notch * 3, h - half * 4);
      c.fillStyle = CHIP_LEG;
      c.fillRect(x0 + half, y0 + half, notch, notch);
      break;
    }
  }

  if (paint.count > 1 && T >= ITEM_BADGE_TILE_PX * paint.dpr) {
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
  label: 'Standard',

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
