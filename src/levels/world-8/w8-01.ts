import type { ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  ItemKind,
  MachineKind,
  Objectives,
  Terrain,
  addBot,
  addMachine,
  countItemsAt,
  createWorld,
  machineById,
  setTerrain,
  tileAt,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { localRng } from './shared.ts';

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

const ripeAtStart = (world: World): number => {
  let total = 0;
  for (const tile of world.tiles) {
    if (tile.crop === undefined || tile.maxGrowth === undefined) continue;
    if ((tile.growth ?? 0) >= tile.maxGrowth) total++;
  }
  return total;
};

const delivered = (ctx: ObjectiveContext): number =>
  countItemsAt(ctx.world, siloTile(ctx.initialWorld), ItemKind.Crop);

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
    'also costed. **Two budgets apply and both are hard. Missing either one is a fail.**',
    '',
    '---',
    '',
    'Harvest every crop that is ripe when the shift starts and leave all of it on the silo tile.',
    'Crops that are still green do not count.',
    '',
    `The field is ${String(FIELD_W)} tiles by ${String(FIELD_H)} of open regolith. Nothing on it`,
    'blocks a sensor sweep. `probe("silo")` reports where the silo is, from anywhere, for',
    'nothing. The bot starts on it.',
    '',
    `- **The shift is ${String(SHIFT_TICKS)} ticks.** Par — where the medal is — is`,
    `  ${String(PAR_TICKS)}, and the shift ends at ${String(SHIFT_TICKS)} whatever you have`,
    '  delivered by then.',
    `- **The survey rig is rated for ${String(SURVEY_BUDGET)} beams a shift.** Every \`look()\``,
    '  is one beam, however far it reaches and however many tiles come back. `scan()` reads the',
    '  tile under the bot and the four beside it, and reads nothing further, so it is not a way',
    '  round the rating — it is a way of paying in ticks instead.',
    '',
    'Neither budget is negotiable and neither is the other one. A route that looks at everything',
    'twice comes in fast and over-rated; a route that never looks walks the field.',
    '',
    '**The Repository.** This work order assumes `lib.ts` holds a `pathTo(x, y)` that walks the',
    "bot to a tile it has already seen. `import { pathTo } from 'lib';` If it is not in there,",
    'write it in this file.',
  ].join('\n'),
  seeds: [1, 2, 3, 4],
  par: { ticks: PAR_TICKS, chars: 772 },
  build,
  objectives: [
    Objectives.custom(
      'ripe-to-silo',
      'Deliver every crop that was ripe at the start to the silo',
      (ctx) => delivered(ctx) >= ripeAtStart(ctx.initialWorld),
      (ctx) => {
        const total = ripeAtStart(ctx.initialWorld);
        return [Math.min(delivered(ctx), total), total];
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
      (ctx) => [Math.min(ctx.trace.endTick, TIGHT_TICKS), TIGHT_TICKS],
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
    'Sensing still costs no ticks; it is only rationed. Walking and harvesting cost ticks. Find out what is on the field before you decide where to walk.',
    'The bot does not have to stand on a tile to know what is growing there. One pass along the edge of the field can report every row.',
    'The bot carries a fixed number of crops. Which ones travel together is a decision you can make before you set off, not while you are out there.',
    'A green crop is two ticks and nothing to show for it. Check maturity, not just presence.',
    'A beam you spend twice on the same row bought you nothing the first time. Whatever the field told you, hold on to it — nothing out there changes except what you harvest.',
  ],
  docs: ['look', 'harvest', 'probe'],
};
