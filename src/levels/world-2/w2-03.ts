import type { Vec, World } from '../../engine/index.ts';
import { Dir, ItemKind, Terrain, addBot, createWorld, setTile, vec } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { hopperFullOf, withinFootprint } from './shared.ts';

const WIDTH = 12;
const HEIGHT = 6;
const MAX_GROWTH = 8;
const SHIFT = 62;
const FOOTPRINT = 32;

const PAR_TICKS = 60;

function sweepOrder(): Vec[] {
  const order: Vec[] = [];
  for (let y = 1; y <= HEIGHT; y++) {
    for (let i = 0; i < WIDTH; i++) {
      const x = y % 2 === 1 ? 1 + i : WIDTH - i;
      order.push(vec(x, y));
    }
  }
  return order;
}

function sowField(world: World, capacity: number): void {
  const order = sweepOrder();
  for (const at of order) setTile(world, at, { terrain: Terrain.Soil });

  const taken = new Set<number>();
  const ripeCount = capacity + 4;
  const slice = order.length / ripeCount;

  for (let i = 0; i < ripeCount; i++) {
    const from = Math.floor(i * slice);
    const to = Math.min(order.length - 1, Math.floor((i + 1) * slice) - 1);
    const index = world.rng.int(from, Math.max(from, to));
    taken.add(index);
    setTile(world, order[index] as Vec, {
      terrain: Terrain.Soil,
      crop: ItemKind.Crop,
      growth: MAX_GROWTH,
      maxGrowth: MAX_GROWTH,
    });
  }

  for (let i = 0; i < 5; i++) {
    const index = world.rng.int(0, order.length - 1);
    if (taken.has(index)) continue;
    taken.add(index);
    const ripeAt = world.rng.int(12, 45);
    setTile(world, order[index] as Vec, {
      terrain: Terrain.Soil,
      crop: ItemKind.Crop,
      maxGrowth: MAX_GROWTH,
      meta: { plantedAt: ripeAt - MAX_GROWTH },
    });
  }

  for (let i = 0; i < 16; i++) {
    const index = world.rng.int(0, order.length - 1);
    if (taken.has(index)) continue;
    taken.add(index);
    setTile(world, order[index] as Vec, {
      terrain: Terrain.Soil,
      crop: ItemKind.Ice,
      growth: world.rng.chance(0.6) ? MAX_GROWTH : world.rng.int(1, 7),
      maxGrowth: MAX_GROWTH,
    });
  }
}

export const w2_03: LevelDef = {
  id: 'w2-03',
  world: 2,
  index: 3,
  title: 'Harvest Quota',
  hardware: [],
  brief: [
    'Ice-scrub grows in the same soil and is worth nothing. Every tile you drive on must be repaired, by me, on my weekend. — D. Halloran',
    '',
    `**Fill the bot's hopper with crop within ${String(SHIFT)} ticks. Ice-scrub does not count, and it takes space.**`,
  ].join('\n'),
  board: {
    redrawn: [
      'the hopper size',
      'where the ripe crop stands',
      'how much ice-scrub there is, and where',
      'which crops are still growing, and how long they need',
    ],
  },
  facts: [
    {
      label: 'Field',
      value: `${String(WIDTH)} by ${String(HEIGHT)}, ${String(WIDTH * HEIGHT)} tiles. The shift is **${String(SHIFT)} ticks**.`,
    },
    {
      label: 'Hopper',
      value:
        'What the bot carries. Starts empty. Its size changes every shift, and no command tells you the size. `inventory()` counts what is in it. The field always has more ripe crop than it holds.',
    },
    {
      label: 'Ice-scrub',
      value:
        'Only `scan().crop === "crop"` counts. Ice-scrub reads `"ice"`. `harvest()` takes ice-scrub too. It stays in the hopper for good, so a hopper with ice-scrub can never fill with crop. `harvest()` returns null on an unripe crop and when the hopper is full. Crops grow 1 per tick.',
    },
    {
      label: 'Scan reach',
      value:
        '`scan(dir)` reads the one tile next to the bot in `dir`. So `scan(Dir.North)` and `scan(Dir.South)` read one tile of the rows above and below. Free.',
    },
    {
      label: 'Tiles visited',
      value: 'Every tile the bot stood on, the start included. Each tile counts once.',
    },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: PAR_TICKS },
  budget: { maxTicks: SHIFT },
  build(seed: number): World {
    const world = createWorld({ w: WIDTH + 2, h: HEIGHT + 2, seed, fill: Terrain.Wall });
    const capacity = world.rng.int(7, 9);
    sowField(world, capacity);
    addBot(world, { at: vec(1, 1), facing: Dir.East, capacity, name: 'FIELD-02' });
    return world;
  },
  objectives: [hopperFullOf(ItemKind.Crop, 'Fill the hopper with crop')],
  bonus: [withinFootprint(FOOTPRINT, `At most ${String(FOOTPRINT)} tiles visited`)],
  starter: [
    '// scan().crop is "crop", "ice", or null on bare soil.',
    '// harvest() gives back what it took, or null.',
    '',
    'const here = scan();',
    'print(`${here.crop} ${here.growth}/${here.maxGrowth}`);',
    '',
  ].join('\n'),
  hints: [
    'Only crop counts. scan() tells crop from ice for free. harvest() does not.',
    'The shift is shorter than the field. Stop once the hopper is full.',
    'A crop 3 ticks from ripe may be worth the wait. One 30 ticks away is not.',
    'From row 2, scan() can read rows 1 to 3. From row 5, rows 4 to 6.',
    'Drive your row. Step off it only for a ripe crop you have already seen.',
  ],
  docs: ['scan', 'harvest', 'inventory'],
};
