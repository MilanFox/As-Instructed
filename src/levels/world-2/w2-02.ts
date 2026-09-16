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
    '**FROM:** Dep. Coordinator M. Vance\\',
    '**RE:** Hopper allocation, north plot',
    '',
    'The hopper leaves the depot full of seed. It does not open at the other end; Legal have',
    'confirmed this is a feature and have declined to say of what.',
    '',
    'The buyer grades on arrival and docks the load for every tick a ripe crop stood waiting.',
    '',
    'Clear the north plot and leave it planted.',
  ].join('\n'),
  board: {
    fixed: [
      'the plot is 3 across and 2 deep — six tiles of soil, walled on every side',
      'every tile is soil, so a bare tile is empty rather than blocked',
      'one or two tiles come up bare — never none',
      'the hopper leaves the depot full, whatever full is this shift',
      'the crops come ready spread across the shift, never all at once',
      'FIELD-02 starts in the north-west corner, facing East',
    ],
    redrawn: [
      'how much the hopper holds, six to ten',
      'which tiles came up bare, and whether it is one or two',
      'how long each crop has left before it is ready',
      'which crops have not started their clock, and what `sproutsIn` reports for them',
    ],
  },
  facts: [
    { label: 'The plot', value: 'Six tiles. Three across, two deep.' },
    {
      label: 'The two checks',
      value:
        'Every tile that started with a crop must be harvested at some point. Every tile in the ' +
        'plot must be planted at the end of the shift. A tile that started bare has nothing to ' +
        'harvest, and still has to be planted.',
    },
    {
      label: 'The bare patch',
      value:
        'One or two tiles came up empty this shift. Maintenance blames the night crew, the night ' +
        'crew blames the schedule, the schedule blames Legal.',
    },
    {
      label: 'The hopper',
      value: 'Starts the shift full. A full hopper takes nothing and the arm swings anyway.',
    },
    {
      label: '`inventory()`',
      value: 'What the bot is carrying right now. The only reading of the hopper there is.',
    },
    {
      label: 'Ripening',
      value:
        'Growth climbs by one every tick, driving or not. A tile at 5 of 8 is ready in three ticks.',
    },
    {
      label: '`sproutsIn`',
      value:
        'Growth stuck at 0 is not always a bare tile — some crops on this shift have not started ' +
        'their clock. `scan()` reports `sproutsIn`, the ticks left before growth moves at all.',
    },
    {
      label: 'Spoilage',
      value:
        'One against the sheet for every tick between a crop coming ready and the swing that takes ' +
        'it. Standing on the tile does not stop the count; only the harvest does. Only the crops ' +
        'that were in the ground at the start of the shift are counted.',
    },
    { label: 'At `maxGrowth`', value: 'Growth stops. The docking does not.' },
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
    harvestedEvery(croppedAtStart, 'Harvest every crop in the plot', 'harvested-crops'),
    everyTilePlanted(),
  ],
  bonus: [
    withinSpoilage(
      SPOILAGE_ALLOWANCE,
      `Come back with no more than ${String(SPOILAGE_ALLOWANCE)} spoilage on the sheet`,
    ),
  ],
  starter: [
    '// NOTE(4470): the hopper comes out full. that is the schedule, not a fault',
    '// NOTE(4470): you cannot pick anything up until you have put something down',
    '',
    '// inventory() counts everything the bot is carrying, seed included.',
    'print(`carrying ${inventory()}`);',
    '',
  ].join('\n'),
  hints: [
    'The hopper starts full, so the first inventory reading is also its size.',
    'A swing at a full hopper costs the same two ticks as one that works.',
    'The plot always has one or two bare tiles. Plant those first — that is the only room the',
    'hopper has to empty into before anything can be harvested.',
    'One pass cannot finish the plot. The crops do not all come ready at the same time.',
    'Growth climbs by one per tick, so a tile says exactly how long it needs. The clock runs whether the bot drives or stands still.',
    'A tile reading 0 growth is not always freshly planted. Some crops on this ladder have not started yet, and sproutsIn says how many ticks until they do.',
    'Waiting on a tile until it comes ready and harvesting it then costs no spoilage. Once a crop is ready the count runs whether the bot stands on it or not, so driving a lap first arrives late and pays for it.',
  ],
  docs: ['inventory', 'harvest', 'plant', 'wait'],
};
