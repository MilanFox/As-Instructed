import type { Divergence, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  ItemKind,
  MachineKind,
  Objectives,
  Terrain,
  addBot,
  addMachine,
  clipValue,
  countItemsAt,
  createWorld,
  inventoryCount,
  machineById,
  setTerrain,
  tileAt,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { localRng, point } from './shared.ts';

const FIELD_W = 14;
const FIELD_H = 10;
const RIPENESS = 4;

/** The silo moves corner to corner between shifts, so the sweep has to start from `probe`. */
const CORNERS: readonly Vec[] = [
  vec(0, 0),
  vec(FIELD_W - 1, 0),
  vec(0, FIELD_H - 1),
  vec(FIELD_W - 1, FIELD_H - 1),
];

const CAPACITIES: readonly number[] = [4, 4, 3, 5];
const RIPE_COUNTS: readonly number[] = [12, 13, 11, 11];

/** Crops never sit in the silo's own column, so one ray per row reports the whole row. */
const PLANTABLE_X = { min: 1, max: FIELD_W - 2 };

const shift = (seed: number): { corner: Vec; capacity: number; ripe: number; far: boolean } => {
  const slot = (seed - 1) % 4;
  return {
    corner: CORNERS[slot] ?? vec(0, 0),
    capacity: CAPACITIES[slot] ?? 4,
    ripe: RIPE_COUNTS[slot] ?? 10,
    far: slot === 3,
  };
};

function fieldTiles(): Vec[] {
  const out: Vec[] = [];
  for (let y = 0; y < FIELD_H; y++) {
    for (let x = PLANTABLE_X.min; x <= PLANTABLE_X.max; x++) out.push(vec(x, y));
  }
  return out;
}

function build(seed: number): World {
  const world = createWorld({ w: FIELD_W, h: FIELD_H, seed, fill: Terrain.Soil });
  const rng = localRng(seed);
  const plan = shift(seed);

  setTerrain(world, plan.corner, Terrain.Pad);
  addMachine(world, {
    id: 'silo',
    kind: MachineKind.Sink,
    at: plan.corner,
    state: 'open',
    inventory: [],
    vars: { x: plan.corner.x, y: plan.corner.y },
  });

  const far = (at: Vec): number =>
    Math.abs(at.x - plan.corner.x) + Math.abs(at.y - plan.corner.y);
  const pool = rng.shuffle(fieldTiles());
  const ordered = plan.far ? pool.slice().sort((a, b) => far(b) - far(a)).slice(0, 24) : pool;
  const chosen = plan.far ? rng.shuffle(ordered) : ordered;

  const green = rng.int(3, 6);
  chosen.slice(0, plan.ripe + green).forEach((at, index) => {
    const tile = tileAt(world, at);
    if (!tile) return;
    tile.crop = ItemKind.Crop;
    tile.maxGrowth = RIPENESS;
    tile.growth = index < plan.ripe ? RIPENESS : rng.int(1, RIPENESS - 1);
  });

  addBot(world, {
    at: plan.corner,
    facing: Dir.East,
    name: 'RIG-81',
    capacity: plan.capacity,
  });
  return world;
}

const siloTile = (world: World): Vec => machineById(world, 'silo')?.at ?? vec(0, 0);

/** Every tile carrying a crop at full growth, in row-major order. */
const ripeTiles = (world: World): Vec[] => {
  const out: Vec[] = [];
  world.tiles.forEach((tile, index) => {
    if (tile.crop === undefined || tile.maxGrowth === undefined) return;
    if ((tile.growth ?? 0) >= tile.maxGrowth) {
      out.push(vec(index % world.w, Math.floor(index / world.w)));
    }
  });
  return out;
};

const ripeAtStart = (world: World): number => ripeTiles(world).length;

const delivered = (ctx: ObjectiveContext): number =>
  countItemsAt(ctx.world, siloTile(ctx.initialWorld), ItemKind.Crop);

const carried = (ctx: ObjectiveContext): number => {
  const bot = ctx.world.bots[0];
  return bot === undefined ? 0 : inventoryCount(bot, ItemKind.Crop);
};

/** Crops that reached the silo tile on or before `tick`, read off the drop log. */
const deliveredBy = (ctx: ObjectiveContext, tick: number): number => {
  const silo = siloTile(ctx.initialWorld);
  let total = 0;
  for (const event of ctx.trace.events) {
    if (event.kind !== 'drop' || !event.ok || event.item !== ItemKind.Crop) continue;
    if (event.at.x !== silo.x || event.at.y !== silo.y) continue;
    if (event.t + event.dt > tick) continue;
    total += event.count;
  }
  return total;
};

/** The first crop that was ripe when the shift opened and is still in the ground at the end. */
const stillStanding = (ctx: ObjectiveContext): Vec | undefined =>
  ripeTiles(ctx.initialWorld).find((at) => {
    const tile = tileAt(ctx.world, at);
    return tile?.crop !== undefined && (tile.growth ?? 0) >= (tile.maxGrowth ?? 1);
  });

/**
 * Where the load fell short.
 *
 * A crop left in the ground and a crop left in the arms are different mistakes — one is a route
 * that missed a tile, the other is a last trip nobody made — and the count they share cannot tell
 * them apart. The tile is named first because it is the one the shift clock cannot explain.
 */
function harvestMiss(ctx: ObjectiveContext): Divergence {
  const standing = stillStanding(ctx);
  if (standing !== undefined) {
    return {
      where: point(standing),
      expected: 'harvested and taken to the silo',
      received: 'still standing; it was ripe at the start',
    };
  }
  const held = carried(ctx);
  const landed = String(delivered(ctx));
  return {
    where: `the silo at ${point(siloTile(ctx.initialWorld))}`,
    expected: `${String(ripeAtStart(ctx.initialWorld))} crops`,
    received: held > 0 ? `${landed} crops, ${String(held)} still in the arms` : `${landed} crops`,
  };
}

/**
 * Ticks and readings are both gates. These four numbers are the whole level.
 *
 * `SHIFT_TICKS` is the hard one and `PAR_TICKS` is where gold sits, so the medal band underneath
 * it — silver to 206, bronze to 215 — survives having a failing condition on the same axis. The
 * shift is set just under the honest World 2 answer: sweeping every row of the field and
 * harvesting what is underfoot costs 220 ticks on the kindest seed.
 */
const PAR_TICKS = 165;
const SHIFT_TICKS = 215;
const TIGHT_TICKS = Math.floor(PAR_TICKS * 0.83);
const SURVEY_BUDGET = 16;
const TIGHT_SURVEY = FIELD_H;

/**
 * A World 2 job on a World 2 field, priced by Finance rather than by Field Engineering.
 *
 * The two budgets pull against each other, which is the whole level. The field is open, so one
 * ray per row reports that row and the bot never has to walk to find out what is growing — but
 * the survey rig is rated for sixteen beams a shift, so the answer has to be *remembered* rather
 * than re-read. Refusing to look at all is legal and walks the field, which is what the tick
 * budget is priced against.
 */
export const w8_01: LevelDef = {
  id: 'w8-01',
  world: 8,
  index: 1,
  title: 'Efficiency Audit',
  hardware: [],
  brief: [
    '**FROM:** Dep. Coordinator M. Vance',
    '',
    'The field is ripe and the work order is one you have run a dozen times. Finance have',
    'since attached a second budget to it. Time was already costed. Sensor readings are now',
    'costed too. Both budgets are hard, and missing either one is a fail.',
    '',
    'Harvest every crop that was ripe when the shift started. Leave all of it on the silo tile.',
  ].join('\n'),
  facts: [
    {
      label: 'The field',
      value: `${String(FIELD_W)} by ${String(FIELD_H)} of open regolith. Nothing on it blocks a beam.`,
    },
    {
      label: 'The silo',
      value: '`probe("silo")` reports it from anywhere, for nothing. The bot starts on it.',
    },
    { label: 'One beam', value: 'Every `look()` is one beam, however far it reaches.' },
    {
      label: '`scan()`',
      value: 'Reads the tile under the bot and the four beside it. Costs ticks, not beams.',
    },
    { label: 'Ripe', value: 'A crop still green at the start does not count and does not travel.' },
    {
      label: 'The bot',
      value: 'Carries a fixed number of crops. The number changes between shifts.',
    },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: PAR_TICKS },
  build,
  objectives: [
    Objectives.custom(
      'ripe-to-silo',
      'Deliver every crop that was ripe at the start to the silo',
      (ctx) => delivered(ctx) >= ripeAtStart(ctx.initialWorld),
      {
        progress: (ctx) => {
          const total = ripeAtStart(ctx.initialWorld);
          return [Math.min(delivered(ctx), total), total];
        },
        divergence: harvestMiss,
      },
    ),
    Objectives.withinTicks(SHIFT_TICKS, {
      id: 'shift-budget',
      label: `Close the shift within ${String(SHIFT_TICKS)} ticks`,
    }),
    /* Id left as `withinSenses` mints it — `within-<n>-<command>` is the shape
       `game/achievements.ts` recognises an information budget by. */
    Objectives.withinSenses('look', SURVEY_BUDGET, {
      label: `Survey the field on at most ${String(SURVEY_BUDGET)} beams`,
    }),
  ],
  bonus: [
    Objectives.custom(
      'audit-tight',
      `Close the shift in ${String(TIGHT_TICKS)} ticks or fewer`,
      (ctx) => ctx.trace.endTick <= TIGHT_TICKS,
      {
        progress: (ctx) => [Math.min(ctx.trace.endTick, TIGHT_TICKS), TIGHT_TICKS],
        /* The target tick is a place in the run, not just a number, so the report stands at it
           and says what the field looked like from there. A load that was all in by then and a
           load that was half in are the same overrun and two different fixes. */
        divergence: (ctx) => ({
          where: `tick ${String(TIGHT_TICKS)}`,
          expected: 'every ripe crop already in the silo',
          received: clipValue(
            `${String(deliveredBy(ctx, TIGHT_TICKS))} of ${String(
              ripeAtStart(ctx.initialWorld),
            )} in; the run ended at ${String(ctx.trace.endTick)}`,
          ),
        }),
      },
    ),
    Objectives.withinSenses('look', TIGHT_SURVEY, {
      label: `Survey the field on ${String(TIGHT_SURVEY)} beams — one a row`,
    }),
  ],
  starter: [
    "// import { pathTo } from 'lib';",
    '// The field is 14 by 10. probe("silo") reports the drop point.',
    '// 215 ticks and 16 beams. Both are hard.',
    '',
    'const silo = probe("silo").at;',
    'print(silo.x + "," + silo.y);',
    '',
  ].join('\n'),
  hints: [
    'Looking costs no ticks. It is only rationed. Find out what is on the field before you decide where to walk.',
    'The bot does not have to stand on a tile to know what grows there. One pass along the edge can report every row.',
    'A green crop is two ticks and nothing to show for it. Check how ripe a crop is, not just that it is there.',
    'The bot carries a fixed number of crops. Decide which ones travel together before you set off.',
    'Nothing on the field changes except what you harvest. Keep what a beam told you, and never spend a second beam on the same row.',
  ],
  docs: ['look', 'harvest', 'probe'],
};
