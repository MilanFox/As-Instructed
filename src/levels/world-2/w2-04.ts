import type { Vec, World } from '../../engine/index.ts';
import { Dir, ItemKind, Terrain, addBot, createWorld, setTile, vec } from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { croppedAtStart, everyTilePlanted, harvestedEvery, withinSpoilage } from './shared.ts';

const PLOT_W = 3;
const PLOT_H = 2;
const MAX_GROWTH = 8;

/**
 * Ripening times climb a ladder so that one pass can never finish the plot, and the last tile is
 * far enough out that driving laps around it arrives later than standing on it does.
 *
 * `plantedAt` is the tick the crop reaches maturity minus its `maxGrowth`, and it is allowed to be
 * negative: maturity clamps at zero, so a tile with `plantedAt: -8` is simply ripe on arrival.
 */
const RIPEN_LADDER: readonly number[] = [0, 9, 18, 28, 38];

/**
 * Ticks of standing ripe crop the depot will absorb across the whole plot.
 *
 * Measured: a run that reads the plot and stands on each tile as it comes ready owes 4–15 over the
 * four seeds; the resume-sweep that passes the level owes 14–30 and 24 on the seed the report
 * shows. Set above the first and under the second.
 */
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

export const w2_04: LevelDef = {
  id: 'w2-04',
  world: 2,
  index: 4,
  title: 'Capacity',
  hardware: ['inventory'],
  brief: [
    '**FROM:** Dep. Coordinator M. Vance',
    '**RE:** Hopper allocation, north plot',
    '',
    'The hopper leaves the depot full of seed. It does not open at the other end; Legal have',
    'confirmed this is a feature and have declined to say of what.',
    '',
    'The north plot is six tiles. **Every crop in it must be harvested once, and every tile',
    'must be left planted.**',
    '',
    'The hopper starts the shift full. A hopper with no room in it takes nothing and the arm',
    'swings anyway. `inventory()` reports what the bot is carrying right now, and it is the',
    'only instrument that reports the hopper at all.',
    '',
    'The crops ripen at different times. Growth climbs by one every tick, driving or not, so',
    'a tile reading 5 of 8 is ready in three ticks.',
    '',
    'The depot docks the sheet for spoilage: one against the shift for every tick a crop stands',
    'ripe in the ground with nobody on it. Growth stops at `maxGrowth`. The docking does not.',
  ].join('\n'),
  seeds: [1, 2, 3, 4],
  par: { ticks: 52, chars: 1050 },
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
    'The hopper starts full. That first reading says something about the hopper that no later reading will.',
    'A swing at a full hopper costs the same two ticks as a swing that works. The bot can know which it is about to do.',
    'One pass cannot finish the plot. Something has to be remembered between passes, and an ordinary variable remembers it.',
    'Growth climbs by one per tick, so a tile states exactly how long it needs. The clock runs whether the bot drives or stands still.',
  ],
  docs: ['inventory', 'harvest', 'plant', 'wait'],
};
