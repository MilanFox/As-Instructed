import type { Divergence, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  ItemKind,
  MachineKind,
  Objectives,
  Terrain,
  addBot,
  addMachine,
  createWorld,
  machineById,
  manhattan,
  setTile,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { at, packPos } from './shared.ts';

const WIDTH = 24;
const HEIGHT = 16;
/** Bot 0 stands here; the rest of the fleet is raised East of it along the apron. */
const ORIGIN = vec(2, 1);
const DEPOT = vec(1, 1);
export const SPAWN_COST = 2;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Layout {
  fleet: number;
  patches: Rect[];
}

/**
 * Seed 2 is the one-bot requisition. Seed 3 is the honestly uniform field, where an equal-area
 * split happens to be an equal-work split. Seeds 1 and 4 put the whole crop inside a single
 * column band, which is what makes area a bad proxy for work.
 */
const LAYOUTS: Record<number, Layout> = {
  1: { fleet: 4, patches: [{ x: 3, y: 3, w: 4, h: 8 }] },
  2: { fleet: 1, patches: [{ x: 5, y: 4, w: 2, h: 5 }] },
  3: { fleet: 6, patches: [{ x: 1, y: 6, w: 22, h: 2 }] },
  4: { fleet: 8, patches: [{ x: 9, y: 3, w: 8, h: 10 }] },
};

function layoutFor(seed: number): Layout {
  return LAYOUTS[seed] ?? (LAYOUTS[1] as Layout);
}

function cropPositions(layout: Layout): Vec[] {
  const out: Vec[] = [];
  for (const patch of layout.patches) {
    for (let x = patch.x; x < patch.x + patch.w; x++) {
      for (let y = patch.y; y < patch.y + patch.h; y++) out.push(vec(x, y));
    }
  }
  return out.sort((a, b) => a.x - b.x || a.y - b.y);
}

function ripeCrops(world: World): number {
  return world.tiles.filter((tile) => tile.crop !== undefined).length;
}

/**
 * A floor for the makespan: somebody has to walk to the nearest crop at all, and the harvest
 * cost plus one pass along the crop tour is shared between the whole requisitioned fleet.
 * It ignores the cost of raising the fleet and of every bot's own approach, so it is a floor
 * and not a target.
 */
export function lowerBound(ctx: ObjectiveContext): number {
  const world = ctx.initialWorld;
  const fleet = Math.max(1, machineById(world, 'depot')?.vars['requisition'] ?? 1);
  const crops: Vec[] = [];
  for (let i = 0; i < world.tiles.length; i++) {
    if (world.tiles[i]?.crop !== undefined) crops.push(vec(i % world.w, Math.floor(i / world.w)));
  }
  if (crops.length === 0) return 0;
  crops.sort((a, b) => a.x - b.x || a.y - b.y);
  let tour = 0;
  for (let i = 1; i < crops.length; i++) tour += manhattan(crops[i - 1] as Vec, crops[i] as Vec);
  const approach = Math.min(...crops.map((crop) => manhattan(ORIGIN, crop)));
  return approach + Math.ceil((2 * crops.length + tour) / fleet);
}

/**
 * The first crop the run left standing, and how many are behind it.
 *
 * The tile is not a secret to keep: the depot publishes every crop position as `vars.c0` upward
 * before anything moves, so the coordinate is the player's own input read back at them.
 */
function standingCrop(ctx: ObjectiveContext): Divergence | undefined {
  for (let i = 0; i < ctx.world.tiles.length; i++) {
    if (ctx.world.tiles[i]?.crop === undefined) continue;
    return {
      where: at(vec(i % ctx.world.w, Math.floor(i / ctx.world.w))),
      expected: 'harvested',
      received: `still standing, ${String(ripeCrops(ctx.world))} left`,
    };
  }
  return undefined;
}

/** The allowance the label promises, against the clock the last bot actually stopped on. */
function overFloor(ctx: ObjectiveContext): Divergence {
  return {
    where: 'the whole run',
    expected: `${String(Math.ceil(lowerBound(ctx) * 1.1))} ticks`,
    received: `${String(ctx.trace.endTick)} ticks`,
  };
}

export const w7_02: LevelDef = {
  id: 'w7-02',
  world: 7,
  index: 2,
  title: 'Divide the Field',
  hardware: ['spawn'],
  costs: { spawn: SPAWN_COST },
  brief: [
    '**MEMO KD-2711**',
    '**FROM:** Dep. Coordinator M. Vance',
    '**RE:**   Fleet requisition, north apron',
    '',
    'The requisition has been approved at the level Finance considered appropriate this week.',
    'It will be a different level on Monday. Please do not write the number down.',
    '',
    'Harvest every crop in the field.',
  ].join('\n'),
  facts: [
    { label: 'Your score', value: 'The clock stops when the **last** bot stops.' },
    { label: 'The depot', value: '`probe("depot")` is free from anywhere on the apron.' },
    {
      label: 'Fleet size',
      value: '`vars.requisition` — how many bots you may have, counting the one already here.',
    },
    {
      label: 'The crops',
      value:
        '`vars.crops` is how many. `vars.c0` … `vars.c{n-1}` are where, packed as `y * 24 + x`.',
    },
    {
      label: '`spawn(dir)`',
      value: `Puts a new bot on the next tile in \`dir\` and gives back its id. Costs ${String(SPAWN_COST)} ticks, charged to the parent. A bot can spawn a bot.`,
    },
    {
      label: 'A new bot',
      value: `Starts with its own clock at the parent's clock plus ${String(SPAWN_COST)}.`,
    },
    { label: 'Carrying', value: 'Every bot holds up to 99 crops. No hauling on this order.' },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: 55 },
  build(seed: number): World {
    const layout = layoutFor(seed);
    const world = createWorld({ w: WIDTH, h: HEIGHT, seed, fill: Terrain.Wall });
    for (let x = 1; x < WIDTH - 1; x++) {
      for (let y = 1; y < HEIGHT - 1; y++) setTile(world, vec(x, y), { terrain: Terrain.Floor });
    }
    const crops = cropPositions(layout);
    for (const at of crops) {
      setTile(world, at, {
        terrain: Terrain.Soil,
        crop: ItemKind.Crop,
        growth: 4,
        maxGrowth: 4,
      });
    }
    const vars: Record<string, number> = {
      requisition: layout.fleet,
      crops: crops.length,
    };
    crops.forEach((at, i) => {
      vars[`c${i}`] = packPos(world, at.x, at.y);
    });
    addMachine(world, {
      id: 'depot',
      kind: MachineKind.Sink,
      at: DEPOT,
      state: 'idle',
      inventory: [],
      vars,
    });
    addBot(world, { at: ORIGIN, facing: Dir.East, name: 'FIELD-01', capacity: 99 });
    return world;
  },
  objectives: [
    Objectives.custom(
      'field-cleared',
      'Harvest every crop in the field',
      (ctx) => ripeCrops(ctx.world) === 0,
      {
        progress: (ctx) => {
          const total = ripeCrops(ctx.initialWorld);
          return [total - ripeCrops(ctx.world), total];
        },
        divergence: standingCrop,
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'within-ten-percent',
      'Finish within 10% of the shared-work floor for this field',
      (ctx) => ctx.trace.endTick <= Math.ceil(lowerBound(ctx) * 1.1),
      { divergence: overFloor },
    ),
  ],
  starter: [
    "// import { pathTo } from 'lib';",
    '// NOTE(4470): a routine that drives "the bot" stops being useful here',
    '',
    'const depot = probe("depot");',
    'const fleet = depot.vars.requisition;',
    'const total = depot.vars.crops;',
    '// Positions come back packed: x = p % 24, y = Math.floor(p / 24).',
    '',
  ].join('\n'),
  hints: [
    'You cannot know the fleet size while you are writing the program. So the number of pieces you cut the field into cannot be written down either. Read it, then cut.',
    'The shift ends when the last bot stops. Ask what that bot was holding that the others were not.',
    'You are given the crop positions before anything moves. That means you can count them per piece before you commit to the pieces. Count what you are actually paying for.',
    'On one of these fields, equal area and equal work are the same split. On the others they are not. The difference is where the crops are, not how big the field is.',
  ],
  docs: ['spawn', 'probe', 'harvest'],
};
