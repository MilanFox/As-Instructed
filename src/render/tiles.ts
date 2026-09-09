/**
 * Tile vocabulary and the runtime atlas.
 *
 * `public/assets/tiles/` ships a curated 48 px atlas (`bootstrap_tiles_48.png` + `.json`) drawn
 * from several Kenney source packs, plus a list of names it deliberately does not cover — flat
 * geometric or animated things that Canvas2D draws better than a bitmap would. This module
 * resolves *both* kinds behind one lookup, so the rest of the renderer only ever asks for a
 * semantic name.
 *
 * Every source pack ships at a 64 px grid and is upscaled into the atlas, except the `tanks` pack:
 * it is Kenney's *retina* (2x) sheet, with sprites ranging 56-139 px, and is deliberately
 * downscaled instead. That inconsistency is intentional — leave it alone.
 *
 * Two decisions worth knowing about:
 *
 * 1. **Everything is re-packed into one runtime atlas canvas with a 2 px extrusion border.**
 *    The shipped atlas is tightly packed. `drawImage` with a source rect samples across rect
 *    edges once the destination is not 1:1, which produces hairline seams between floor tiles at
 *    any zoom other than 100%. Extruding each frame's border pixels makes the bleed sample the
 *    frame's own edge instead, and the seams disappear. Code-drawn tiles are baked into the same
 *    canvas so there is exactly one texture source at draw time.
 *
 * 2. **Name resolution is pure and testable.** `TILE_VOCABULARY`, `CODE_TILE_NAMES`,
 *    `parseAtlas` and `terrainArt` never touch a canvas, so a typo'd semantic name fails in
 *    Vitest under Node rather than as a silently missing tile at runtime.
 */

import { Terrain } from '../engine/index.ts';
import type { Tile } from '../engine/index.ts';
import { palette } from './theme.ts';

/** DESIGN.md §8. Non-negotiable. */
export const TILE_PX = 48;

/** Extrusion border, in atlas pixels, around every frame. See the note above. */
export const ATLAS_PAD = 2;

const CELL = TILE_PX + ATLAS_PAD * 2;

export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasJson {
  image: string;
  tileSize: number;
  frames: Record<string, AtlasFrame>;
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/**
 * Names the renderer draws itself: flat geometric things Canvas2D draws better than a bitmap
 * would. The one extra beyond that base set is `feature.fuel_depot`, which DESIGN.md §4.4 needs
 * and no Kenney pack has as a top-down tile.
 */
export const CODE_TILE_NAMES: readonly string[] = [
  'floor.grating',
  'floor.tilled',
  'floor.tilled.cross',
  'floor.circuit',
  'floor.circuit.b',
  'floor.hazard',
  'feature.solar_panel',
  'feature.fuel_depot',
  'item.battery',
];

/**
 * The full set of names any renderer code path may ask for, atlas-backed or code-drawn. The test
 * suite asserts every entry resolves; that is the whole point of keeping the list explicit rather
 * than deriving it from the atlas JSON.
 */
export const TILE_VOCABULARY: readonly string[] = [
  // floors
  'floor.metal',
  'floor.metal.dot',
  'floor.metal.bolt',
  'floor.metal.dash',
  'floor.metal.line_v',
  'floor.metal.line_h',
  'floor.metal.corner',
  'floor.metal.w_line_v',
  'floor.metal.w_dash',
  'floor.metal.w_bolt',
  'floor.grating',
  'floor.plate',
  'floor.plate.b',
  'floor.plate.c',
  'floor.plate.diamond',
  'floor.concrete',
  'floor.concrete.b',
  'floor.gravel',
  'floor.regolith',
  'floor.regolith.b',
  'floor.regolith.rocky',
  'floor.dirt',
  'floor.tilled',
  'floor.tilled.cross',
  'floor.rock',
  'floor.ice',
  'floor.ice.b',
  'floor.snow',
  'floor.sand',
  'floor.clay',
  'floor.circuit',
  'floor.circuit.b',
  'floor.hazard',
  'floor.water',
  'floor.grass',
  // walls and blockers
  'wall.metal',
  'wall.metal.b',
  'wall.metal.c',
  'wall.panel',
  'wall.rock',
  'wall.rock.b',
  'wall.brick',
  'wall.brick.b',
  'wall.brick.orange',
  'wall.wood',
  'blocker.crate_metal',
  'blocker.crate_wood',
  'blocker.container',
  'blocker.container.b',
  'blocker.barrel',
  'blocker.barrel.black',
  'blocker.barrel.green',
  'blocker.barrel.red',
  'blocker.pipe',
  'blocker.fence',
  'blocker.fence.red',
  'blocker.barricade',
  'blocker.barricade_wood',
  'blocker.sandbag',
  'blocker.sandbag.brown',
  // features
  'feature.landing_pad',
  'feature.landing_pad.w',
  'feature.door',
  'feature.hatch',
  'feature.terminal',
  'feature.terminal.offline',
  'feature.power_node',
  'feature.power_node.b',
  'feature.node_blank',
  'feature.cable',
  'feature.cable.bend',
  'feature.antenna',
  'feature.dish',
  'feature.silo',
  'feature.silo.b',
  'feature.tanks',
  'feature.hangar',
  'feature.dome',
  'feature.factory',
  'feature.refinery',
  'feature.drill',
  'feature.solar_panel',
  'feature.fuel_depot',
  'feature.pit',
  'feature.oil',
  'feature.coolant',
  'feature.coolant.b',
  'feature.lava',
  // ore, rock, plants
  'ore.stage1',
  'ore.stage2',
  'ore.stage3',
  'ore.rich',
  'ore.rich.b',
  'rock.small',
  'rock.medium',
  'rock.large',
  'rock.crystal',
  'rock.crystal.b',
  'rock.boulder',
  'plant.stage0',
  'plant.stage1',
  'plant.stage2',
  'plant.stage3',
  'plant.stage4',
  'plant.mature',
  'plant.alt.small',
  'plant.alt.large',
  'plant.bush',
  'plant.bush.dead',
  'plant.tree',
  'plant.tree.dead',
  // items
  'item.crate.brown',
  'item.crate.red',
  'item.crate.blue',
  'item.crate.green',
  'item.crate.grey',
  'item.crate.brown.dark',
  'item.crate.red.dark',
  'item.crate.blue.dark',
  'item.crate.green.dark',
  'item.crate.grey.dark',
  'item.core.brown',
  'item.core.red',
  'item.core.blue',
  'item.core.green',
  'item.core.grey',
  'item.ore.red',
  'item.ore.grey',
  'item.shard',
  'item.shard.b',
  'item.debris',
  'item.coin',
  'item.seed',
  'item.battery',
  // overlays
  'overlay.goal',
  'overlay.goal.brown',
  'overlay.goal.red',
  'overlay.goal.blue',
  'overlay.goal.green',
  'overlay.goal.grey',
  'overlay.tracks',
  'overlay.tracks.small',
  'overlay.tracks.large',
];

/**
 * `PLANT_STAGES[i]` is the sprite for maturity bucket `i` of `PLANT_STAGES.length`. DESIGN.md
 * §8 requires the stages to be *visually* distinct — w2-02 is unsolvable if a player cannot
 * read maturity at a glance — so this is a six-step ladder, not a tint ramp.
 */
export const PLANT_STAGES: readonly string[] = [
  'plant.stage0',
  'plant.stage1',
  'plant.stage2',
  'plant.stage3',
  'plant.stage4',
  'plant.mature',
];

/** Maturity 0..max mapped onto `PLANT_STAGES`. `max <= 0` means "authored fully grown". */
export function plantStageIndex(growth: number, max: number): number {
  const last = PLANT_STAGES.length - 1;
  if (max <= 0) return last;
  const ratio = Math.max(0, Math.min(1, growth / max));
  if (ratio >= 1) return last;
  return Math.min(last - 1, Math.floor(ratio * last));
}

export function plantStageName(growth: number, max: number): string {
  return PLANT_STAGES[plantStageIndex(growth, max)] as string;
}

// ---------------------------------------------------------------------------
// Biomes
// ---------------------------------------------------------------------------

export type Biome =
  | 'hangar'
  | 'regolith'
  | 'yard'
  | 'cave'
  | 'grid'
  | 'signal'
  | 'swarm'
  | 'finale';

export interface BiomeArt {
  /** Full-bleed floor variants, chosen deterministically per cell. */
  floors: readonly string[];
  /** Rare marking tiles sprinkled over `floors`, e.g. the hangar's painted bay lines. */
  accents: readonly string[];
  /** How often an accent replaces the base floor, 0..1. */
  accentRate: number;
  wall: readonly string[];
  pad: string;
  regolith: readonly string[];
  soil: readonly string[];
  rockFloor: string;
  /** Multiply the whole terrain layer by this, for the cave's "turn the lights off" look. */
  dim: number;
}

const BIOMES: Readonly<Record<Biome, BiomeArt>> = {
  hangar: {
    floors: ['floor.metal', 'floor.metal', 'floor.metal', 'floor.metal.dot'],
    accents: [
      'floor.metal.line_v',
      'floor.metal.line_h',
      'floor.metal.corner',
      'floor.metal.dash',
      'floor.metal.bolt',
    ],
    accentRate: 0.14,
    wall: ['wall.metal', 'wall.metal', 'wall.metal.b', 'wall.metal.c'],
    pad: 'feature.landing_pad',
    regolith: ['floor.gravel', 'floor.concrete.b'],
    soil: ['floor.tilled', 'floor.tilled.cross'],
    rockFloor: 'floor.rock',
    dim: 1,
  },
  regolith: {
    floors: ['floor.regolith', 'floor.regolith.b', 'floor.regolith', 'floor.regolith.rocky'],
    accents: ['floor.clay', 'floor.sand'],
    accentRate: 0.06,
    wall: ['wall.rock', 'wall.rock.b'],
    pad: 'overlay.goal',
    regolith: ['floor.regolith', 'floor.regolith.b'],
    soil: ['floor.tilled', 'floor.tilled.cross'],
    rockFloor: 'floor.rock',
    dim: 1,
  },
  yard: {
    floors: ['floor.concrete', 'floor.concrete.b', 'floor.plate', 'floor.plate.b'],
    accents: ['floor.plate.c', 'floor.hazard'],
    accentRate: 0.08,
    wall: ['wall.panel', 'wall.metal.b'],
    pad: 'feature.landing_pad.w',
    regolith: ['floor.gravel'],
    soil: ['floor.tilled'],
    rockFloor: 'floor.rock',
    dim: 0.74,
  },
  cave: {
    floors: ['floor.rock', 'floor.gravel', 'floor.rock', 'floor.rock'],
    accents: ['floor.gravel'],
    accentRate: 0.2,
    wall: ['wall.rock', 'wall.rock.b'],
    pad: 'overlay.goal',
    regolith: ['floor.gravel'],
    soil: ['floor.dirt'],
    rockFloor: 'floor.rock',
    dim: 0.7,
  },
  grid: {
    floors: ['floor.plate', 'floor.plate.b', 'floor.plate.c', 'floor.plate.diamond'],
    accents: ['floor.circuit', 'floor.circuit.b', 'floor.grating'],
    accentRate: 0.22,
    wall: ['wall.metal', 'wall.panel'],
    pad: 'feature.landing_pad.w',
    regolith: ['floor.gravel'],
    soil: ['floor.tilled'],
    rockFloor: 'floor.rock',
    dim: 1,
  },
  signal: {
    floors: ['floor.snow', 'floor.ice.b', 'floor.snow', 'floor.ice'],
    accents: ['floor.ice'],
    accentRate: 0.1,
    wall: ['wall.rock.b', 'wall.rock'],
    pad: 'overlay.goal',
    regolith: ['floor.gravel'],
    soil: ['floor.dirt'],
    rockFloor: 'floor.rock',
    dim: 0.72,
  },
  swarm: {
    floors: ['floor.concrete.b', 'floor.concrete', 'floor.concrete.b', 'floor.plate'],
    accents: ['floor.hazard', 'floor.metal.w_dash', 'floor.metal.w_line_v'],
    accentRate: 0.07,
    wall: ['wall.panel', 'wall.metal.c'],
    pad: 'feature.landing_pad',
    regolith: ['floor.gravel'],
    soil: ['floor.tilled'],
    rockFloor: 'floor.rock',
    dim: 0.55,
  },
  finale: {
    floors: ['floor.plate.diamond', 'floor.metal', 'floor.plate.diamond', 'floor.plate'],
    accents: ['floor.grating', 'floor.metal.bolt', 'floor.hazard'],
    accentRate: 0.12,
    wall: ['wall.metal', 'wall.panel', 'wall.metal.b'],
    pad: 'feature.landing_pad',
    regolith: ['floor.regolith'],
    soil: ['floor.tilled', 'floor.tilled.cross'],
    rockFloor: 'floor.rock',
    dim: 1,
  },
};

const WORLD_BIOMES: readonly Biome[] = [
  'hangar',
  'regolith',
  'yard',
  'cave',
  'grid',
  'signal',
  'swarm',
  'finale',
];

export function biomeForWorld(world: number): Biome {
  return WORLD_BIOMES[Math.max(0, Math.min(WORLD_BIOMES.length - 1, world - 1))] as Biome;
}

export function biomeArt(biome: Biome): BiomeArt {
  return BIOMES[biome];
}

/** Stable per-cell noise. Deterministic across reloads so a level always looks the same. */
export function cellHash(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2147483647) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function pick(list: readonly string[], r: number): string {
  return list[Math.min(list.length - 1, Math.floor(r * list.length))] as string;
}

/**
 * How one tile is drawn. `base` is a full-bleed floor and always exists; `prop` is a
 * transparent-background sprite composited on top.
 */
export interface TerrainArt {
  base: string;
  prop: string | null;
  /** Terrain the player cannot walk into. Drives the wall drop-shadow pass. */
  solid: boolean;
}

const EMPTY_ART: TerrainArt = { base: 'floor.metal', prop: null, solid: true };

/**
 * Semantic terrain -> art. Pure: no canvas, no atlas, so the mapping is unit-testable and every
 * `Terrain` member is provably covered.
 */
export function terrainArt(terrain: Terrain, tile: Tile, biome: Biome, x: number, y: number): TerrainArt {
  const art = BIOMES[biome] ?? BIOMES.hangar;
  const r = cellHash(x, y);
  const groundFloor = art.floors[0] as string;
  const baseFloor = cellHash(x, y, 7) < art.accentRate ? pick(art.accents, r) : pick(art.floors, r);

  switch (terrain) {
    case Terrain.Void:
      return { base: 'floor.metal', prop: null, solid: true };
    // Conveyor rides with plain floor. `Terrain.Conveyor` promises `facing` in tile meta, the sim
    // implements nothing, no level places one, and `TileView` has no `meta` for the facing to
    // arrive through — so the four-phase scroll this used to animate said "something is moving
    // here" about a mechanic that does not exist. DESIGN.md §11.2: explain it or cut it.
    case Terrain.Floor:
    case Terrain.Conveyor:
      return { base: baseFloor, prop: null, solid: false };
    case Terrain.Wall:
      return { base: pick(art.wall, r), prop: null, solid: true };
    case Terrain.Pad:
      return { base: baseFloor, prop: art.pad, solid: false };
    case Terrain.Regolith:
      return { base: pick(art.regolith, r), prop: null, solid: false };
    case Terrain.Soil:
      return { base: pick(art.soil, r), prop: null, solid: false };
    // Rock, ore and rubble sit on the biome's *canonical* floor rather than a stone plate or a
    // random variant. Swapping the floor punches a visible hole in the ground plane, and letting
    // the variant roll makes every obstacle a differently-coloured square. The prop, the solid
    // tint and the drop shadow are what say "you cannot walk here".
    case Terrain.Rock:
      return { base: groundFloor, prop: pick(['rock.large', 'rock.boulder'], r), solid: true };
    case Terrain.Ore:
      return {
        base: groundFloor,
        prop: pick(['ore.stage3', 'ore.rich', 'ore.rich.b'], r),
        solid: true,
      };
    case Terrain.Rubble:
      return { base: groundFloor, prop: pick(['rock.medium', 'rock.small'], r), solid: true };
    case Terrain.Ice:
      return { base: pick(['floor.ice', 'floor.ice.b'], r), prop: null, solid: false };
    case Terrain.Pit:
      return { base: baseFloor, prop: 'feature.pit', solid: false };
    case Terrain.Cable:
      return {
        base: baseFloor,
        prop: tile.meta?.['bend'] ? 'feature.cable.bend' : 'feature.cable',
        solid: false,
      };
    case Terrain.Depot:
      return { base: baseFloor, prop: 'feature.fuel_depot', solid: false };
    default:
      return EMPTY_ART;
  }
}

/** Machine kind -> sprite. Machines are landmarks, so they anchor bottom-centre. */
export function machineTileName(kind: string, state: string): string {
  switch (kind) {
    case 'door':
      return state === 'open' ? 'feature.hatch' : 'feature.door';
    case 'lever':
      return state === 'on' ? 'feature.terminal' : 'feature.terminal.offline';
    case 'furnace':
      return 'feature.refinery';
    case 'press':
      return 'feature.factory';
    case 'sink':
      return 'feature.silo';
    case 'source':
      return 'feature.silo.b';
    case 'node':
      return state === 'off' ? 'feature.node_blank' : 'feature.power_node';
    case 'antenna':
      return 'feature.antenna';
    case 'charger':
      return 'feature.tanks';
    case 'router':
      return 'feature.dish';
    default:
      return 'feature.terminal';
  }
}

/** Item kind -> sprite. */
export function itemTileName(kind: string): string {
  switch (kind) {
    case 'regolith':
      return 'item.debris';
    case 'stone':
      return 'item.ore.grey';
    case 'ore':
      return 'item.ore.red';
    case 'ice':
      return 'item.shard';
    case 'scrap':
      return 'item.shard.b';
    case 'seed':
      return 'item.seed';
    case 'crop':
      return 'plant.alt.small';
    case 'crate':
      return 'item.crate.brown';
    case 'part':
      return 'item.crate.grey';
    case 'cell':
      return 'item.battery';
    case 'chip':
      return 'item.core.blue';
    default:
      return 'item.coin';
  }
}

// ---------------------------------------------------------------------------
// Atlas parsing (pure)
// ---------------------------------------------------------------------------

export function parseAtlas(source: unknown): Map<string, AtlasFrame> {
  const frames = new Map<string, AtlasFrame>();
  if (typeof source !== 'object' || source === null) return frames;
  const raw = (source as { frames?: unknown }).frames;
  if (typeof raw !== 'object' || raw === null) return frames;
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;
    const f = value as Partial<AtlasFrame>;
    if (
      typeof f.x !== 'number' ||
      typeof f.y !== 'number' ||
      typeof f.w !== 'number' ||
      typeof f.h !== 'number'
    ) {
      continue;
    }
    frames.set(name, { x: f.x, y: f.y, w: f.w, h: f.h });
  }
  return frames;
}

/** Vocabulary entries that neither the atlas nor the code-tile list can satisfy. */
export function missingFrames(
  vocabulary: readonly string[],
  atlas: ReadonlyMap<string, AtlasFrame>,
  codeNames: readonly string[] = CODE_TILE_NAMES,
): string[] {
  const code = new Set(codeNames);
  return vocabulary.filter((name) => !atlas.has(name) && !code.has(name));
}

// ---------------------------------------------------------------------------
// Code-drawn tiles
// ---------------------------------------------------------------------------

type CodeTilePainter = (ctx: CanvasRenderingContext2D) => void;

function fill(ctx: CanvasRenderingContext2D, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
}

function grating(ctx: CanvasRenderingContext2D): void {
  fill(ctx, '#4a4a4a');
  for (let y = 0; y < TILE_PX; y += 8) {
    ctx.fillStyle = '#2e2e2e';
    ctx.fillRect(2, y + 1, TILE_PX - 4, 6);
    ctx.fillStyle = '#5e5e5e';
    ctx.fillRect(2, y, TILE_PX - 4, 1);
  }
  ctx.fillStyle = '#606060';
  ctx.fillRect(0, 0, 2, TILE_PX);
  ctx.fillRect(TILE_PX - 2, 0, 2, TILE_PX);
}

function tilled(rotate: boolean): CodeTilePainter {
  return (ctx) => {
    fill(ctx, '#7c4a2c');
    ctx.save();
    if (rotate) {
      ctx.translate(TILE_PX, 0);
      ctx.rotate(Math.PI / 2);
    }
    // Broken ridges, not floorboards. Straight full-width lines at even spacing read as decking
    // the moment the tile repeats across a plot, so each furrow is a run of short offset dashes
    // at an uneven pitch, and the clod speckle carries most of the texture.
    const pitch = [0, 11, 21, 32, 41];
    for (let i = 0; i < pitch.length; i++) {
      const y = 4 + (pitch[i] as number);
      for (let x = -6 + ((i * 13) % 9); x < TILE_PX; x += 13) {
        const w = 9 + ((i * 5 + x) % 4);
        ctx.fillStyle = 'rgba(46, 25, 12, 0.20)';
        ctx.fillRect(x, y + ((x + i) % 2), w, 2);
        ctx.fillStyle = 'rgba(206, 146, 98, 0.10)';
        ctx.fillRect(x, y + 2 + ((x + i) % 2), w, 1);
      }
    }
    ctx.restore();
    for (let i = 0; i < 150; i++) {
      const hx = (i * 17) % TILE_PX;
      const hy = (i * 29 + ((i * 7) % 5)) % TILE_PX;
      const size = 1 + (i % 3 === 0 ? 1 : 0);
      ctx.fillStyle = i % 3 === 0 ? 'rgba(255, 214, 170, 0.07)' : 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(hx, hy, size, size);
    }
  };
}

function circuit(variant: number): CodeTilePainter {
  return (ctx) => {
    fill(ctx, palette.bgPanel);
    ctx.fillStyle = 'rgba(53, 224, 200, 0.10)';
    ctx.fillRect(0, 0, TILE_PX, TILE_PX);
    ctx.fillStyle = palette.accent;
    ctx.globalAlpha = 0.55;
    const lanes = variant === 0 ? [12, 36] : [24];
    for (const lane of lanes) {
      ctx.fillRect(lane - 1, 0, 2, TILE_PX);
      ctx.fillRect(0, lane - 1, TILE_PX, 2);
    }
    ctx.globalAlpha = 0.9;
    for (const lane of lanes) {
      for (const other of lanes) ctx.fillRect(lane - 2, other - 2, 4, 4);
    }
    ctx.globalAlpha = 0.35;
    ctx.fillRect(variant === 0 ? 4 : 30, variant === 0 ? 30 : 6, 3, 3);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, TILE_PX - 1, TILE_PX, 1);
    ctx.fillRect(TILE_PX - 1, 0, 1, TILE_PX);
  };
}

function hazard(ctx: CanvasRenderingContext2D): void {
  fill(ctx, '#2a2a2a');
  ctx.fillStyle = palette.accent2;
  // 45 degree stripes, 8 px on / 8 px off. At 48 px the pattern closes exactly, so the tile
  // repeats seamlessly against itself in both axes.
  for (let i = -TILE_PX; i < TILE_PX * 2; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 8, 0);
    ctx.lineTo(i + 8 - TILE_PX, TILE_PX);
    ctx.lineTo(i - TILE_PX, TILE_PX);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.fillRect(0, 0, TILE_PX, 2);
  ctx.fillRect(0, TILE_PX - 2, TILE_PX, 2);
}


function solarPanel(ctx: CanvasRenderingContext2D): void {
  fill(ctx, '#2b3644');
  ctx.fillStyle = '#55677c';
  ctx.fillRect(3, 3, TILE_PX - 6, TILE_PX - 6);
  ctx.fillStyle = '#0d1b2c';
  ctx.fillRect(5, 5, TILE_PX - 10, TILE_PX - 10);
  const cell = (TILE_PX - 10) / 3;
  for (let cy = 0; cy < 3; cy++) {
    for (let cx = 0; cx < 3; cx++) {
      ctx.fillStyle = '#1b3a5a';
      ctx.fillRect(5 + cx * cell + 1, 5 + cy * cell + 1, cell - 2, cell - 2);
      ctx.fillStyle = 'rgba(53, 224, 200, 0.16)';
      ctx.fillRect(5 + cx * cell + 1, 5 + cy * cell + 1, cell - 2, 2);
    }
  }
  ctx.strokeStyle = 'rgba(53, 224, 200, 0.5)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(5 + i * cell, 5);
    ctx.lineTo(5 + i * cell, TILE_PX - 5);
    ctx.moveTo(5, 5 + i * cell);
    ctx.lineTo(TILE_PX - 5, 5 + i * cell);
    ctx.stroke();
  }
}

function fuelDepot(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, TILE_PX, TILE_PX);
  ctx.strokeStyle = palette.accent2;
  ctx.lineWidth = 3;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.arc(TILE_PX / 2, TILE_PX / 2, 17, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255, 176, 32, 0.14)';
  ctx.beginPath();
  ctx.arc(TILE_PX / 2, TILE_PX / 2, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.accent2;
  ctx.beginPath();
  ctx.moveTo(24, 13);
  ctx.bezierCurveTo(34, 25, 33, 31, 24, 34);
  ctx.bezierCurveTo(15, 31, 14, 25, 24, 13);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = palette.bgVoid;
  ctx.beginPath();
  ctx.arc(24, 28, 3, 0, Math.PI * 2);
  ctx.fill();
}

function battery(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, TILE_PX, TILE_PX);
  ctx.fillStyle = '#55677c';
  ctx.fillRect(21, 6, 6, 4);
  ctx.fillStyle = palette.bgRaised;
  ctx.beginPath();
  ctx.roundRect(14, 9, 20, 30, 4);
  ctx.fill();
  ctx.strokeStyle = '#55677c';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = palette.ok;
  ctx.fillRect(17, 27, 14, 6);
  ctx.fillStyle = 'rgba(126, 224, 106, 0.35)';
  ctx.fillRect(17, 19, 14, 6);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
  ctx.fillRect(17, 12, 5, 25);
}

const CODE_PAINTERS: Readonly<Record<string, CodeTilePainter>> = {
  'floor.grating': grating,
  'floor.tilled': tilled(false),
  'floor.tilled.cross': tilled(true),
  'floor.circuit': circuit(0),
  'floor.circuit.b': circuit(1),
  'floor.hazard': hazard,
  'feature.solar_panel': solarPanel,
  'feature.fuel_depot': fuelDepot,
  'item.battery': battery,
};

// ---------------------------------------------------------------------------
// Runtime atlas
// ---------------------------------------------------------------------------

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('tiles: 2d context unavailable');
  return ctx;
}

/**
 * Copies one 48x48 frame into the runtime atlas and extrudes its border by `ATLAS_PAD`, so that
 * bilinear sampling at non-1:1 zoom can never pull in a neighbouring frame's pixels.
 */
function blitExtruded(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
): void {
  const s = TILE_PX;
  const p = ATLAS_PAD;
  ctx.drawImage(source, sx, sy, s, s, dx, dy, s, s);
  ctx.drawImage(source, sx, sy, s, 1, dx, dy - p, s, p);
  ctx.drawImage(source, sx, sy + s - 1, s, 1, dx, dy + s, s, p);
  ctx.drawImage(source, sx, sy, 1, s, dx - p, dy, p, s);
  ctx.drawImage(source, sx + s - 1, sy, 1, s, dx + s, dy, p, s);
  ctx.drawImage(source, sx, sy, 1, 1, dx - p, dy - p, p, p);
  ctx.drawImage(source, sx + s - 1, sy, 1, 1, dx + s, dy - p, p, p);
  ctx.drawImage(source, sx, sy + s - 1, 1, 1, dx - p, dy + s, p, p);
  ctx.drawImage(source, sx + s - 1, sy + s - 1, 1, 1, dx + s, dy + s, p, p);
}

export interface TileSetOptions {
  /** Directory holding `bootstrap_tiles_48.json` and its PNG. */
  baseUrl?: string;
}

/**
 * One texture source for the whole renderer. Resolve a semantic name to a frame with `frame()`,
 * or draw straight to a context with `draw()`.
 */
export class TileSet {
  readonly canvas: HTMLCanvasElement;
  private readonly frames = new Map<string, AtlasFrame>();
  /** Names present in the shipped atlas JSON but absent from `TILE_VOCABULARY`. Diagnostics only. */
  readonly extraNames: readonly string[];

  private constructor(canvas: HTMLCanvasElement, frames: Map<string, AtlasFrame>, extra: string[]) {
    this.canvas = canvas;
    this.frames = frames;
    this.extraNames = extra;
  }

  static async load(options: TileSetOptions = {}): Promise<TileSet> {
    const base = options.baseUrl ?? '/assets/tiles/';
    const response = await fetch(`${base}bootstrap_tiles_48.json`);
    if (!response.ok) throw new Error(`tiles: cannot load atlas json (${response.status})`);
    const json = (await response.json()) as AtlasJson;
    const sourceFrames = parseAtlas(json);
    const image = await loadImage(`${base}${json.image}`);

    const names = [...sourceFrames.keys(), ...CODE_TILE_NAMES];
    const columns = 16;
    const rows = Math.ceil(names.length / columns);
    const canvas = createCanvas(columns * CELL, rows * CELL);
    const ctx = context2d(canvas);
    ctx.imageSmoothingEnabled = false;

    const scratch = createCanvas(TILE_PX, TILE_PX);
    const scratchCtx = context2d(scratch);

    const frames = new Map<string, AtlasFrame>();
    let i = 0;
    for (const [name, frame] of sourceFrames) {
      const dx = (i % columns) * CELL + ATLAS_PAD;
      const dy = Math.floor(i / columns) * CELL + ATLAS_PAD;
      blitExtruded(ctx, image, frame.x, frame.y, dx, dy);
      frames.set(name, { x: dx, y: dy, w: TILE_PX, h: TILE_PX });
      i++;
    }
    for (const name of CODE_TILE_NAMES) {
      const painter = CODE_PAINTERS[name];
      if (!painter) continue;
      scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
      scratchCtx.clearRect(0, 0, TILE_PX, TILE_PX);
      scratchCtx.save();
      painter(scratchCtx);
      scratchCtx.restore();
      const dx = (i % columns) * CELL + ATLAS_PAD;
      const dy = Math.floor(i / columns) * CELL + ATLAS_PAD;
      blitExtruded(ctx, scratch, 0, 0, dx, dy);
      frames.set(name, { x: dx, y: dy, w: TILE_PX, h: TILE_PX });
      i++;
    }

    const vocabulary = new Set(TILE_VOCABULARY);
    const extra = [...frames.keys()].filter((name) => !vocabulary.has(name));
    return new TileSet(canvas, frames, extra);
  }

  has(name: string): boolean {
    return this.frames.has(name);
  }

  frame(name: string): AtlasFrame | undefined {
    return this.frames.get(name);
  }

  /** Every resolvable name. Used by the dev harness's contact sheet. */
  names(): string[] {
    return [...this.frames.keys()];
  }

  /**
   * Draws one tile. Silently no-ops on an unknown name — a missing tile must never take the RAF
   * loop down mid-frame; the Vitest vocabulary check is where a typo is meant to fail.
   */
  draw(ctx: CanvasRenderingContext2D, name: string, dx: number, dy: number, size: number): void {
    const f = this.frames.get(name);
    if (!f) return;
    ctx.drawImage(this.canvas, f.x, f.y, f.w, f.h, dx, dy, size, size);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`tiles: cannot load ${url}`));
    image.src = url;
  });
}
