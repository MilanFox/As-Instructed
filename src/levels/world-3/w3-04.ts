import type { Divergence, MoveEvent, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  NOTHING,
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
import { at, crates, ordinal } from './objectives.ts';
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

/** Every crate the shift opened with, as an arrival number and the slot it was stencilled on. */
const arrivalsOf = (world: World): { index: number; at: Vec }[] => {
  const out: { index: number; at: Vec }[] = [];
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const mark = world.tiles[y * world.w + x]?.mark;
      const index = mark === undefined ? Number.NaN : Number(mark);
      if (Number.isInteger(index) && countItemsAt(world, vec(x, y), 'crate') > 0) {
        out.push({ index, at: vec(x, y) });
      }
    }
  }
  return out.sort((a, b) => a.index - b.index);
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

/**
 * Whether arrival 1 is standing in the first slot a sweep of the racks would reach.
 *
 * A round that ships crates in the order it walks past them is the wrong general rule this level
 * exists to refuse, and a shift whose schedule happens to agree with its layout lets that rule
 * through — on seed 1 it would let it through first, which teaches it. So the numbering is redrawn
 * until the sweep and the schedule part company at the very first crate, where the divergence says
 * so plainly. A one-crate yard has nothing to disagree about and is left alone.
 */
const sweptFirst = (order: readonly Vec[], rowMajor: readonly Vec[]): boolean => {
  const first = order[0];
  const swept = rowMajor[0];
  return (
    order.length > 1 && first !== undefined && swept !== undefined && key(first) === key(swept)
  );
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
 * The lowest-numbered crate the run never set down on the bay, named by the slot it started in.
 *
 * A round that ships fifteen of sixteen is looking at a full-looking yard and a bay it has walked
 * to fifteen times; the one slot it never visited is the whole of what it is missing.
 */
const strandedCrate = (ctx: ObjectiveContext): Divergence => {
  const delivered = new Set(shipped(ctx));
  const missing = arrivalsOf(ctx.initialWorld).find((crate) => !delivered.has(crate.index));
  if (missing === undefined) {
    const bay = bayOf(ctx.initialWorld);
    return {
      where: `the bay at ${at(bay)}`,
      expected: crates(arrivalCount(ctx.initialWorld)),
      received: crates(countItemsAt(ctx.world, bay, 'crate')),
    };
  }
  return {
    where: `arrival ${String(missing.index)}, from ${at(missing.at)}`,
    expected: 'on the outbound bay',
    received: 'still in the yard',
  };
};

/** The place in the bay stack where the order first came apart, and what went down there. */
const outOfOrder = (ctx: ObjectiveContext): Divergence | undefined => {
  const order = shipped(ctx);
  const matched = inOrder(ctx);
  if (matched >= arrivalCount(ctx.initialWorld)) return undefined;
  const got = order[matched];
  return {
    where: `${ordinal(matched + 1)} crate onto the bay`,
    expected: `arrival ${String(matched + 1)}`,
    received: got === undefined ? NOTHING : `arrival ${String(got)}`,
  };
};

/** The step that spent the slot allowance, and how far past it the round went in the end. */
const overTrodden = (ctx: ObjectiveContext): Divergence => {
  const vacant = vacantSlots(ctx.initialWorld);
  const steps = ctx.trace.events.filter(
    (event): event is MoveEvent => event.kind === 'move' && event.ok && vacant.has(key(event.to)),
  );
  const breaking = steps[SLOT_BUDGET];
  if (breaking === undefined) {
    return {
      where: 'empty slots trodden',
      expected: `at most ${String(SLOT_BUDGET)}`,
      received: String(steps.length),
    };
  }
  return {
    where: `tick ${String(breaking.t)} · ${at(breaking.to)}`,
    expected: `${String(SLOT_BUDGET)} empty slots at most`,
    received: `the ${ordinal(SLOT_BUDGET + 1)}, of ${String(steps.length)} in the run`,
  };
};

/**
 * Arrival order is stencilled on the slots rather than delivered by a live conveyor: the engine
 * has no scheduled spawning, so the schedule is baked into the world instead of running during
 * it. Seed 3 numbers the crates against the way they are laid out, seed 4 is the one-crate yard,
 * and the rest draw a numbering at random under `sweptFirst`.
 */
export const w3_04: LevelDef = {
  id: 'w3-04',
  world: 3,
  index: 4,
  title: 'First In, First Out',
  hardware: [],
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
  /**
   * DESIGN.md §11.10.
   *
   * The rack and aisle rows are already in the facts, and they are repeated here for the one thing
   * the facts cannot say: that they are the same four rows on every shift. Read as a description of
   * this board they are a survey result; read as a fixed frame they are four constants, and a run
   * that knows it can step from aisle to aisle reading both rack rows beside it is the run hint 3
   * describes. The player cannot tell those two readings apart from one board.
   *
   * The slot allowance is on the fixed side for the same reason in reverse. It does not scale with
   * the crate count, so a sixteen-crate shift has proportionally less of it than a small one, and
   * a player who assumes the number grows with the yard spends it without noticing. The figure
   * itself stays where it already is, on the objective label.
   *
   * The sweep line is `sweptFirst` said to the player. The generator redraws the numbering until
   * the first crate a rack sweep reaches is not arrival 1, precisely so that "ship them in the
   * order I walk past them" fails on the first crate rather than the ninth — but a player who has
   * only seen one board cannot know that disagreement is guaranteed rather than this shift's luck,
   * and the one-crate shift is the honest exception to it.
   */
  board: {
    fixed: [
      'the yard is 16 wide and 8 deep inside its wall',
      'the rack rows are `y` 2, 3, 6 and 7 on every shift, and the aisles `y` 1, 4, 5 and 8',
      'one outbound bay, always standing in an aisle',
      'on any shift holding more than one crate, arrival 1 is not the first crate a sweep of the racks would reach',
      'the empty-slot allowance is the same figure however many crates arrive',
      'RIG-04 starts in an aisle, one crate to the clamp',
    ],
    redrawn: [
      'how many crates the shift holds — as many as sixteen, as few as one',
      'which rack slots they stand in',
      'which arrival number is stencilled on which slot',
      'where the outbound bay stands, and where RIG-04 starts',
    ],
  },
  facts: [
    {
      label: 'Arrival number',
      value:
        'Stencilled on the slot, not on the crate. Counts up from 1 with no gaps. When the shift opens, every slot holding a crate is stencilled and no other tile in the yard is.',
    },
    {
      label: '`scan(dir).mark`',
      value: 'Reads the stencil back as a string, or `null` on an unpainted tile.',
    },
    {
      label: 'The layout',
      value: 'The order the crates are numbered is not the order they are laid out.',
    },
    {
      label: 'Racks and aisles',
      value:
        'The rack rows are `y` 2, 3, 6 and 7, and every crate stands in one of them. The other four floor rows — `y` 1, 4, 5 and 8 — are aisle, so every rack row has an aisle running beside it. The outbound bay is the one pad tile in the yard, and it stands in an aisle.',
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
    let arrivals = seed === 3 ? rowMajor.slice().reverse() : rng.shuffle(slots);
    while (sweptFirst(arrivals, rowMajor)) arrivals = rng.shuffle(slots);

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
      {
        progress: (ctx) => [
          Math.min(
            countItemsAt(ctx.world, bayOf(ctx.initialWorld), 'crate'),
            arrivalCount(ctx.initialWorld),
          ),
          arrivalCount(ctx.initialWorld),
        ],
        divergence: strandedCrate,
      },
    ),
    Objectives.custom(
      'bay-in-order',
      'Set the crates down in ascending arrival order',
      (ctx) => inOrder(ctx) === arrivalCount(ctx.initialWorld),
      {
        progress: (ctx) => [inOrder(ctx), arrivalCount(ctx.initialWorld)],
        divergence: outOfOrder,
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'aisle-discipline',
      `Tread no more than ${String(SLOT_BUDGET)} slots that started the shift empty`,
      (ctx) => slotsTrodden(ctx) <= SLOT_BUDGET,
      {
        progress: (ctx) => [slotsTrodden(ctx), SLOT_BUDGET],
        divergence: overTrodden,
      },
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
    'The nearest crate and the next crate are hardly ever the same crate.',
    'A bot in an aisle can read the rack row above it and the rack row below it without leaving the aisle.',
    'Nothing stops you learning the whole yard before you lift anything.',
    'Read the yard into a list first: each number, and the tile it was painted on. Then work the list from 1 upward.',
  ],
  docs: ['scan', 'pickup', 'drop'],
};
