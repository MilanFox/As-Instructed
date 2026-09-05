import type { ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  Objectives,
  Terrain,
  addBot,
  addGroundItems,
  countItemsAt,
  createWorld,
  setTile,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { frame, key, tilePicker, warm } from './yard.ts';

const PAR_TICKS = 365;
const SLOT_BUDGET = 18;

const RACK_ROWS = [2, 3, 6, 7];
const AISLE_ROWS = [1, 4, 5, 8];

const bayOf = (world: World): Vec => {
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      if (world.tiles[y * world.w + x]?.terrain === Terrain.Pad) return vec(x, y);
    }
  }
  return vec(0, 0);
};

const slotLedger = (world: World): Map<string, number[]> => {
  const ledger = new Map<string, number[]>();
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const mark = world.tiles[y * world.w + x]?.mark;
      const index = mark === undefined ? Number.NaN : Number(mark);
      if (Number.isInteger(index) && countItemsAt(world, vec(x, y), 'crate') > 0) {
        ledger.set(key(vec(x, y)), [index]);
      }
    }
  }
  return ledger;
};

const arrivalCount = (world: World): number => slotLedger(world).size;

/**
 * Replays the trace to recover which crate was set down on the bay, and when. A crate's identity
 * is the arrival number stencilled on the slot it started in; the ledger follows it through any
 * amount of staging, so a solution that parks crates in the aisle is still judged on the order
 * they finally reach the bay.
 */
const shipped = (ctx: ObjectiveContext): number[] => {
  const bay = bayOf(ctx.initialWorld);
  const ledger = slotLedger(ctx.initialWorld);
  const order: number[] = [];
  let held: number | undefined;
  for (const event of ctx.trace.events) {
    if (event.kind === 'pickup' && event.ok) {
      held = ledger.get(key(event.at))?.pop();
    } else if (event.kind === 'drop' && event.ok) {
      if (held === undefined) continue;
      if (event.at.x === bay.x && event.at.y === bay.y) {
        order.push(held);
      } else {
        const slot = ledger.get(key(event.at)) ?? [];
        slot.push(held);
        ledger.set(key(event.at), slot);
      }
      held = undefined;
    }
  }
  return order;
};

const inOrder = (ctx: ObjectiveContext): number => {
  const order = shipped(ctx);
  let i = 0;
  while (i < order.length && order[i] === i + 1) i++;
  return i;
};

const vacantSlots = (world: World): Set<string> => {
  const vacant = new Set<string>();
  for (const y of RACK_ROWS) {
    for (let x = 1; x < world.w - 1; x++) {
      const at = vec(x, y);
      if (countItemsAt(world, at, 'crate') === 0) vacant.add(key(at));
    }
  }
  return vacant;
};

/**
 * Steps taken into rack slots that were empty when the shift opened. Every rack row runs alongside
 * an aisle, so the stencils can all be read from an aisle tile and a slot only has to be entered
 * to lift the crate standing in it — which is a different reading of the yard from the sweep that
 * finds the same crates by walking the racks themselves.
 */
const slotsTrodden = (ctx: ObjectiveContext): number => {
  const vacant = vacantSlots(ctx.initialWorld);
  return ctx.trace.events.filter(
    (event) => event.kind === 'move' && event.ok && vacant.has(key(event.to)),
  ).length;
};

/**
 * Arrival order is stencilled on the slots rather than delivered by a live conveyor: the engine
 * has no scheduled spawning, so the schedule is baked into the world instead of running during
 * it. Seed 1 numbers the crates in sweep order, seed 3 numbers them against it, and seed 4 is
 * the one-crate yard.
 */
export const w3_04: LevelDef = {
  id: 'w3-04',
  world: 3,
  index: 4,
  title: 'First In, First Out',
  hardware: ['use'],
  brief: [
    '```',
    'MEMO KD-2318',
    'FROM: Dep. Coordinator M. Vance',
    'RE:   Depot audit',
    '',
    'The audit of Depot 0 has been deprioritised. It was requested by',
    'Contractor #4470, then withdrawn by Contractor #4470 eleven days',
    'later, with no note.',
    '',
    'I have kept the ticket. I am not sure why.',
    '```',
    '',
    'Move every crate onto the outbound bay pad, lowest arrival number first.',
  ].join('\n'),
  facts: [
    {
      label: 'Arrival number',
      value: 'Stencilled on the slot, not on the crate. Counts up from 1 with no gaps.',
    },
    {
      label: '`scan(dir).mark`',
      value: 'Reads the stencil back as a string, or `null` on an unpainted tile.',
    },
    {
      label: 'The layout',
      value: 'The order the crates are numbered is not the order they are laid out.',
    },
    { label: 'The clamp', value: 'One crate at a time.' },
    {
      label: 'Empty rack slots',
      value:
        'Not a walkway. Every step into one is logged. Aisles are free, and so are slots that started the shift full.',
    },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: PAR_TICKS },
  build(seed: number): World {
    const world = createWorld({ w: 18, h: 10, seed, fill: Terrain.Floor });
    frame(world);
    const rng = world.rng;
    warm(rng);

    const racks: Vec[] = [];
    const aisles: Vec[] = [];
    for (let x = 1; x <= 16; x++) {
      for (const y of RACK_ROWS) racks.push(vec(x, y));
      for (const y of AISLE_ROWS) aisles.push(vec(x, y));
    }

    const openTile = tilePicker(rng, aisles);
    setTile(world, openTile(), { terrain: Terrain.Pad });
    addBot(world, { at: openTile(), facing: Dir.East, name: 'RIG-04', capacity: 1 });

    const count = seed === 4 ? 1 : rng.int(8, 16);
    const slots = rng.shuffle(racks).slice(0, count);
    const rowMajor = slots.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const arrivals = seed === 1 ? rowMajor : seed === 3 ? rowMajor.reverse() : rng.shuffle(slots);

    arrivals.forEach((at, i) => {
      setTile(world, at, { terrain: Terrain.Floor, mark: String(i + 1) });
      addGroundItems(world, at, 'crate', 1);
    });
    return world;
  },
  objectives: [
    Objectives.custom(
      'bay-cleared',
      'Move every crate onto the outbound bay',
      (ctx) =>
        countItemsAt(ctx.world, bayOf(ctx.initialWorld), 'crate') >= arrivalCount(ctx.initialWorld),
      (ctx) => [
        Math.min(
          countItemsAt(ctx.world, bayOf(ctx.initialWorld), 'crate'),
          arrivalCount(ctx.initialWorld),
        ),
        arrivalCount(ctx.initialWorld),
      ],
    ),
    Objectives.custom(
      'bay-in-order',
      'Set the crates down in ascending arrival order',
      (ctx) => inOrder(ctx) === arrivalCount(ctx.initialWorld),
      (ctx) => [inOrder(ctx), arrivalCount(ctx.initialWorld)],
    ),
  ],
  bonus: [
    Objectives.custom(
      'aisle-discipline',
      `Tread no more than ${String(SLOT_BUDGET)} slots that started the shift empty`,
      (ctx) => slotsTrodden(ctx) <= SLOT_BUDGET,
      (ctx) => [slotsTrodden(ctx), SLOT_BUDGET],
    ),
  ],
  budget: { maxTicks: 5000 },
  starter: [
    '// The arrival number is stencilled on the slot, not on the crate.',
    '// Read it with scan, and remember it.',
    '',
    'while (canMove(Dir.West)) move(Dir.West);',
    'while (canMove(Dir.North)) move(Dir.North);',
    '',
  ].join('\n'),
  hints: [
    'Every occupied slot has a number painted on it. The number is not a distance.',
    'The nearest crate and the next crate are hardly ever the same crate.',
    'A bot in an aisle can read the rack row above it and the rack row below it without leaving the aisle.',
    'Nothing stops you learning the whole yard before you lift anything.',
    'Read the yard into a list first: each number, and the tile it was painted on. Then work the list from 1 upward.',
  ],
  docs: ['scan', 'pickup', 'drop'],
};
