import type { Vec, World } from '../../engine/index.ts';
import { Dir, ItemKind, Terrain, addBot, createWorld, setTile, vec } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { hopperFullOf, withinFootprint } from './shared.ts';

const WIDTH = 12;
const HEIGHT = 6;
const MAX_GROWTH = 8;
/**
 * The shift. Long enough for a disciplined pass, far too short for the whole field.
 *
 * It was 84, and at 84 the level did not ask its own question. The serpentine that reads only the
 * tile under the wheels costs 58–68 across the five seeds, so it came home inside the shift on
 * every one of them and the choosing decided nothing but the medal. Measured, not guessed:
 * the two-lane route costs 47/52/52/55/48, so the whole usable
 * window is 56 to 67, and 62 is the tightest number in it that still leaves a tick above par for a
 * run to land on. The serpentine now misses on three seeds of five and cannot close the level;
 * the lane route comes home with 7 ticks in hand on its worst seed and 15 on its best.
 *
 * 44 of the 62 go on wheels once a full hopper is paid for, against a 72-tile field. Not visiting
 * everything is now arithmetic rather than advice.
 */
const SHIFT = 62;
/**
 * Distinct tiles a shift may enter.
 *
 * `scan(Dir.North)` and `scan(Dir.South)` mean a bot walking one row reads three, so two lanes
 * survey the whole field from a quarter of it. Measured: that route fills the hopper on 22–28
 * tiles across the five seeds, while the serpentine that also passes the level enters 41–49. Set
 * above the first and well under the second.
 */
const FOOTPRINT = 32;

/**
 * Gold is the sensor reach, and the reach is on the facts table.
 *
 * One route passes. The two lanes, reading the rows either side and stepping off for a ripe crop,
 * cost 47–55; the serpentine that reads only the tile under the wheels costs 58–68 and no longer
 * comes home inside the shift on three of the five seeds. Par golds the lane route with five ticks
 * spare on its worst seed.
 *
 * Not a trim of the old 74. That number was the serpentine's own cost plus a margin, so it paid
 * gold for ignoring the one instrument this level exists to teach.
 */
const PAR_TICKS = 60;

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
    '**Come back with the hopper full of crop.**',
  ].join('\n'),
  facts: [
    {
      label: 'The field',
      value: `**${String(WIDTH)} by ${String(HEIGHT)}** — ${String(WIDTH * HEIGHT)} tiles against a **${String(SHIFT)}-tick** shift, and a full hopper is 16 of those ticks before the wheels turn.`,
    },
    {
      label: 'The hopper',
      value:
        'Holds a different amount every shift and nothing on the bot reports its size. `inventory()` counts what is in it, for free, as often as you like.',
    },
    {
      label: '`harvest()`',
      value:
        'Hands back nothing on a crop that is not ripe yet, and nothing when the hopper is full. The two look the same.',
    },
    {
      label: '`scan().crop`',
      value:
        '`"crop"` counts towards the quota. `"ice"` does not, and the slot it takes stays spent.',
    },
    {
      label: 'Sensor reach',
      value:
        '`scan(Dir.North)` and `scan(Dir.South)` read the rows either side. Three rows from one; the wheels cover one.',
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
    'Two things grow here and only one counts. The sensor tells them apart for free. The arm does not.',
    'harvest gives back nothing on a crop that is not ripe yet. That is not the hopper being full.',
    'The hopper does not open. A slot spent on the wrong thing is spent for the rest of the shift.',
    'The shift is shorter than the field. Once the hopper is full, every further tile is a tick spent on nothing.',
    'A tile three ticks from ripe may be worth three ticks. A tile thirty ticks from ripe is somebody else’s shift.',
    'The sensor reads the row above and the row below. A bot driving the second row has already surveyed the first three, and two more rows of driving cover the rest of the field.',
    'Read the lane, and only step off it for something the sensor has already said is worth the two ticks.',
  ],
  docs: ['scan', 'harvest', 'inventory'],
};
