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
  2: { fleet: 2, patches: [{ x: 5, y: 4, w: 2, h: 5 }] },
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
    'Finance sets your fleet size, and Finance changes its mind every day. No bot should do more than its share. — M. Vance',
    '',
    '**Harvest every crop. Start with one bot; spawn more. The depot gives the fleet size.**',
  ].join('\n'),
  board: {
    redrawn: [
      'the fleet size, two to eight bots',
      'the crop count',
      'where the crop patch is, and its shape',
      'whether equal areas also hold equal crops',
    ],
  },
  facts: [
    { label: 'Score', value: 'The tick when the **last** bot stops.' },
    {
      label: 'Depot (field data)',
      value:
        '`probe("depot")` is free, from anywhere. `vars.requisition` is the fleet size, including the first bot. `vars.crops` is the crop count. `vars.c0` … `vars.c{n-1}` are the positions, packed as `y * 24 + x`.',
    },
    {
      label: 'Fleet size (any bot count passes)',
      value:
        'You may spawn fewer or more bots than the fleet size. Fair share is counted as if you have at least the fleet size.',
    },
    {
      label: 'Spawn',
      value: `Returns the new bot's id, for \`bot(id)\`. Costs the parent ${String(SPAWN_COST)} ticks, even when it fails. The new bot's clock starts at the parent's clock plus ${String(SPAWN_COST)}. Any bot can spawn.`,
    },
    {
      label: 'Crops',
      value:
        'All are ripe at the start; none grow later. A bot carries 99, so it never needs to unload.',
    },
    {
      label: 'Fair share',
      value:
        '`Math.ceil(vars.crops / n)` crops. `n` is your bot count, or `vars.requisition` if that is larger.',
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
    Objectives.custom('field-cleared', 'Harvest every crop', (ctx) => ripeCrops(ctx.world) === 0, {
      progress: (ctx) => {
        const total = ripeCrops(ctx.initialWorld);
        return [total - ripeCrops(ctx.world), total];
      },
      divergence: standingCrop,
    }),
  ],
  bonus: [
    Objectives.custom(
      'even-share',
      'No bot harvests more than a fair share',
      (ctx) => heaviestShare(ctx) <= fairShare(ctx),
      { divergence: overShare },
    ),
  ],
  starter: [
    "// import { pathTo } from 'lib';",
    '',
    'const depot = probe("depot");',
    'const fleet = depot.vars.requisition;',
    'const total = depot.vars.crops;',
    '// Positions are packed: x = p % 24, y = Math.floor(p / 24).',
    '',
  ].join('\n'),
  hints: [
    'The fleet size changes from board to board. Read it, then split the field into that many parts.',
    'The shift ends when the last bot stops. What did it do that the others did not?',
    'You know all crop positions at the start. Count the crops per part before you choose the parts.',
    'On one of the boards you are graded on, equal areas hold equal crops. On the others they do not.',
  ],
  docs: ['spawn', 'probe', 'harvest'],
};
