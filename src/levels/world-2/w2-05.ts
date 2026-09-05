import type { Vec, World } from '../../engine/index.ts';
import { Dir, ItemKind, Terrain, addBot, createWorld, setTile, vec } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { hopperFullOf, withinFootprint } from './shared.ts';

const WIDTH = 12;
const HEIGHT = 6;
const MAX_GROWTH = 8;
/** The shift. Long enough for a disciplined pass, far too short for the whole field. */
const SHIFT = 84;
/**
 * Distinct tiles a shift may enter.
 *
 * `scan(Dir.North)` and `scan(Dir.South)` mean a bot walking one row reads three, so two lanes
 * survey the whole field from a quarter of it. Measured: that route fills the hopper on 22–27
 * tiles and inside 51 ticks across the five seeds, while the serpentine that passes the level
 * enters 41–49. Set above the first and well under the second.
 */
const FOOTPRINT = 32;

/** Row-major serpentine, which is the order a bot with no long-range sensor will meet the field. */
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

/**
 * Ripe crop is spread one per equal slice of the sweep, so however the seed shuffles the field a
 * disciplined pass always meets enough of it to fill the hopper. Everything else — where the ice
 * sits, which crops are still coming on, how big the hopper is — is drawn per seed.
 */
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

export const w2_05: LevelDef = {
  id: 'w2-05',
  world: 2,
  index: 5,
  title: 'Harvest Quota',
  hardware: [],
  brief: [
    '**FROM:** Field Eng. D. Halloran',
    '',
    'two things grow in the west field. one of them is the crop. the other is ice-scrub,',
    'which likes the same soil and is worth nothing to anybody.',
    '',
    '**Come back with the hopper full of crop.** The hopper holds a different amount every',
    'shift. You will know it is full when `harvest()` stops handing anything back.',
    '',
    '`scan().crop` names what is growing on a tile: `"crop"` counts towards the quota,',
    '`"ice"` does not, and a slot spent on ice stays spent for the rest of the shift.',
    '',
    `The shift ends after **${String(SHIFT)} ticks**. The field is far longer than that.`,
  ].join('\n'),
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: 74, chars: 700 },
  budget: { maxTicks: SHIFT },
  build(seed: number): World {
    const world = createWorld({ w: WIDTH + 2, h: HEIGHT + 2, seed, fill: Terrain.Wall });
    const capacity = world.rng.int(7, 9);
    sowField(world, capacity);
    addBot(world, { at: vec(1, 1), facing: Dir.East, capacity, name: 'FIELD-02' });
    return world;
  },
  objectives: [hopperFullOf(ItemKind.Crop, 'Fill the hopper with crop')],
  bonus: [
    withinFootprint(
      FOOTPRINT,
      `Fill the hopper having set foot on at most ${String(FOOTPRINT)} tiles`,
    ),
  ],
  starter: [
    '// scan().crop names what is growing here: "crop", "ice", or null on bare soil.',
    '// harvest() hands back what it took, or null when it took nothing.',
    '',
    'const here = scan();',
    'print(`${here.crop} ${here.growth}/${here.maxGrowth}`);',
    '',
  ].join('\n'),
  hints: [
    'Two things grow in this field and only one of them counts. The sensor separates them for free; the arm does not.',
    'The hopper does not open. A slot spent on the wrong thing is spent for the rest of the shift.',
    'The shift is shorter than the field. Once the hopper is full, every further tile is a tick spent on nothing.',
    'A tile three ticks from ripe may be worth three ticks. A tile thirty ticks from ripe is somebody else’s shift.',
  ],
  docs: ['scan', 'harvest', 'inventory'],
};
