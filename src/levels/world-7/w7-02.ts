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
  setTile,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { at, packPos } from './shared.ts';

const WIDTH = 24;
const HEIGHT = 16;
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

function harvestsPerBot(ctx: ObjectiveContext): Map<number, number> {
  const tally = new Map<number, number>();
  for (const event of ctx.trace.events) {
    if (event.kind !== 'harvest' || !event.ok) continue;
    tally.set(event.botId, (tally.get(event.botId) ?? 0) + event.count);
  }
  return tally;
}

function fairShare(ctx: ObjectiveContext): number {
  const requisition = Math.max(1, machineById(ctx.initialWorld, 'depot')?.vars['requisition'] ?? 1);
  const raised = Math.max(requisition, ctx.world.bots.length);
  return Math.ceil(ripeCrops(ctx.initialWorld) / raised);
}

function heaviestShare(ctx: ObjectiveContext): number {
  return Math.max(0, ...harvestsPerBot(ctx).values());
}

function overShare(ctx: ObjectiveContext): Divergence | undefined {
  const cap = fairShare(ctx);
  let worst = -1;
  let took = 0;
  for (const [botId, crops] of harvestsPerBot(ctx)) {
    if (crops > took) {
      worst = botId;
      took = crops;
    }
  }
  if (worst < 0 || took <= cap) return undefined;
  return {
    where: `bot #${String(worst)}`,
    expected: `${String(cap)} crops or fewer`,
    received: `${String(took)} crops`,
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
  board: {
    fixed: [
      'the field is 22 by 14 inside its wall, open floor except where a crop stands on soil',
      'one bot on the north apron at the start; the rest of the fleet is whatever it raises',
      'the depot publishes the requisition and every crop position before anything moves',
      'every crop is ripe when the shift opens, and none of it ripens during it',
      'every bot holds 99 crops, so nothing has to be hauled anywhere',
    ],
    redrawn: [
      'the requisition — one to eight bots, counting the one already on the apron',
      'how many crops the field carries',
      'where the patch sits and what shape it is',
      'whether an equal-area cut is also an equal-work cut',
    ],
  },
  facts: [
    { label: 'Your score', value: 'The clock stops when the **last** bot stops.' },
    {
      label: 'The depot',
      value: '`probe("depot")` is free, and reaches it from anywhere on site.',
    },
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
      value: `Puts a new bot on the next tile in \`dir\` and gives back its id. Costs ${String(SPAWN_COST)} ticks on this order, charged to the parent. A bot can spawn a bot. The fleet does not queue: a tile another bot is standing on refuses the spawn, giving back \`-1\` and charging the ${String(SPAWN_COST)} ticks anyway.`,
    },
    {
      label: 'A new bot',
      value: `Starts with its own clock at the parent's clock plus ${String(SPAWN_COST)}.`,
    },
    { label: 'Carrying', value: 'Every bot holds up to 99 crops. No hauling on this order.' },
    {
      label: 'Fair share',
      value:
        '`Math.ceil(vars.crops / n)` crops per bot, where `n` is however many bots you raised — never counted below `vars.requisition`.',
    },
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
      'even-share',
      'Split the crop evenly across the requisitioned fleet',
      (ctx) => heaviestShare(ctx) <= fairShare(ctx),
      { divergence: overShare },
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
