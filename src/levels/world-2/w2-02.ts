import type { Vec, World } from '../../engine/index.ts';
import { Dir, ItemKind, Terrain, addBot, createWorld, setTile, vec } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { croppedAtStart, everyTilePlanted, harvestedEvery, withinSpoilage } from './shared.ts';

const PLOT_W = 3;
const PLOT_H = 2;
const MAX_GROWTH = 8;

const RIPEN_LADDER: readonly number[] = [0, 9, 18, 28, 38];

const SPOILAGE_ALLOWANCE = 18;

function plotTiles(): Vec[] {
  const tiles: Vec[] = [];
  for (let y = 1; y <= PLOT_H; y++) {
    for (let x = 1; x <= PLOT_W; x++) tiles.push(vec(x, y));
  }
  return tiles;
}

function sowPlot(world: World): void {
  const order = world.rng.shuffle(plotTiles());
  const bare = world.rng.int(1, 2);
  const cropped = order.slice(bare);

  for (const at of order.slice(0, bare)) setTile(world, at, { terrain: Terrain.Soil });

  cropped.forEach((at, i) => {
    const base = RIPEN_LADDER[i] ?? 38;
    const ripeAt = Math.max(0, base + world.rng.int(-2, 2));
    setTile(world, at, {
      terrain: Terrain.Soil,
      crop: ItemKind.Crop,
      maxGrowth: MAX_GROWTH,
      meta: { plantedAt: ripeAt - MAX_GROWTH },
    });
  });
}

export const w2_02: LevelDef = {
  id: 'w2-02',
  world: 2,
  index: 2,
  title: 'Capacity',
  hardware: ['inventory'],
  brief: [
    'The hopper leaves full of seed and nobody will fix it. Ripe crops lose value every tick they wait, and nobody will fix that either. — M. Vance',
    '',
    '**The hopper starts full of seed. Harvest every crop the plot starts with and leave every tile planted. A ripe crop spoils for every tick it waits.**',
  ].join('\n'),
  board: {
    redrawn: [
      'the hopper size, 6 to 10',
      'which tiles are bare, and how many',
      'how long each crop needs to be ready',
      'which crops have not started growing, and their `sproutsIn`',
    ],
  },
  facts: [
    {
      label: 'Plot',
      value: '3 by 2. One or two tiles start bare: nothing to harvest, but they need planting.',
    },
    {
      label: 'Hopper',
      value:
        'What the bot carries. Starts full of seed. `plant()` uses 1 seed. `harvest()` adds 1 crop. A full hopper takes no crop, and `harvest()` still costs 2 ticks. `inventory()` counts the seed too.',
    },
    {
      label: 'Growth',
      value:
        '+1 every tick, moving or not. A crop at growth 5 of 8 is ready in 3 ticks. A crop at growth 0 may not have started: `sproutsIn` is the ticks until it starts.',
    },
    {
      label: 'Spoilage',
      value:
        '1 for every tick a ripe crop waits to be harvested. Only crops there at the start count.',
    },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: 52 },
  build(seed: number): World {
    const world = createWorld({ w: PLOT_W + 2, h: PLOT_H + 2, seed, fill: Terrain.Wall });
    sowPlot(world);
    const capacity = world.rng.int(6, 10);
    addBot(world, {
      at: vec(1, 1),
      facing: Dir.East,
      capacity,
      inventory: [{ kind: ItemKind.Seed, count: capacity }],
      name: 'FIELD-02',
    });
    return world;
  },
  objectives: [
    harvestedEvery(croppedAtStart, 'Harvest every crop the plot starts with', 'harvested-crops'),
    everyTilePlanted(),
  ],
  bonus: [withinSpoilage(SPOILAGE_ALLOWANCE, `At most ${String(SPOILAGE_ALLOWANCE)} spoilage`)],
  starter: [
    '// NOTE(4470): hopper comes out full. put something down before you pick anything up.',
    '',
    'print(`carrying ${inventory()}`);',
    '',
  ].join('\n'),
  hints: [
    'A harvest needs one free place in the hopper.',
    'Plant the bare tiles first. That makes room for a harvest.',
    'The crops come ready at different times, some of them late in the run.',
    'A crop with growth 0 is not bare. sproutsIn says when it starts.',
    'A crop harvested on the tick it comes ready adds no spoilage.',
  ],
  docs: ['inventory', 'harvest', 'plant', 'wait'],
};
