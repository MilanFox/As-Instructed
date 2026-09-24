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
import { frame, interior, key, tilePicker, warm } from './yard.ts';

const PAR_TICKS = 380;

const RACK_ROWS = [2, 3, 6, 7];
const AISLE_COLS = [1, 6, 11, 16];

const isRack = (at: Vec): boolean => RACK_ROWS.includes(at.y) && !AISLE_COLS.includes(at.x);

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

const sweptFirst = (order: readonly Vec[], rowMajor: readonly Vec[]): boolean => {
  const first = order[0];
  const swept = rowMajor[0];
  return (
    order.length > 1 && first !== undefined && swept !== undefined && key(first) === key(swept)
  );
};

const vacantSlots = (world: World): Set<string> => {
  const vacant = new Set<string>();
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) {
      const at = vec(x, y);
      if (world.tiles[y * world.w + x]?.terrain !== Terrain.Rack) continue;
      if (countItemsAt(world, at, 'crate') === 0) vacant.add(key(at));
    }
  }
  return vacant;
};

const slotsTrodden = (ctx: ObjectiveContext): number => {
  const vacant = vacantSlots(ctx.initialWorld);
  return ctx.trace.events.filter(
    (event) => event.kind === 'move' && event.ok && vacant.has(key(event.to)),
  ).length;
};

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
    expected: 'on the bay',
    received: 'still in the yard',
  };
};

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

const overTrodden = (ctx: ObjectiveContext): Divergence | undefined => {
  const vacant = vacantSlots(ctx.initialWorld);
  const steps = ctx.trace.events.filter(
    (event): event is MoveEvent => event.kind === 'move' && event.ok && vacant.has(key(event.to)),
  );
  const breaking = steps[0];
  if (breaking === undefined) return undefined;
  return {
    where: `tick ${String(breaking.t)} · ${at(breaking.to)}`,
    expected: 'an aisle tile',
    received: `an empty slot, 1 of ${String(steps.length)}`,
  };
};

export const w3_03: LevelDef = {
  id: 'w3-03',
  world: 3,
  index: 3,
  title: 'First In, First Out',
  hardware: [],
  brief: [
    'Empty rack slots bend under a bot, and so did the last bot. Please keep off them. — M. Vance',
    '',
    "**Each crate's slot has a painted arrival number. Carry the crates to the loading bay one at a time: 1 first, then 2, and so on.**",
  ].join('\n'),
  board: {
    redrawn: [
      'how many crates: one to sixteen',
      'which rack slots hold them',
      'which arrival number is on which slot',
      'where the bay is and where the bot starts',
    ],
  },
  facts: [
    {
      label: 'Arrival number',
      value:
        'A number painted on the slot, not the crate; `scan(dir).mark` reads it as a string. Counts up from 1, no gaps. Every slot with a crate starts painted, and no other tile.',
    },
    {
      label: 'Rack slot',
      value:
        'Racks fill rows `y` 2, 3, 6 and 7. Aisles are rows 1, 4, 5 and 8, and columns 1, 6, 11 and 16. `scan(dir).terrain` reads `rack`, `floor` or `pad`. Every crate is in a slot. Any tile can be walked on. Slots that started with a crate are safe to step on.',
    },
    {
      label: 'Loading bay',
      value: 'The only pad, always in an aisle. The bot carries one crate at a time.',
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
    for (const tile of interior(world)) (isRack(tile) ? racks : aisles).push(tile);

    for (const slot of racks) setTile(world, slot, { terrain: Terrain.Rack });

    const openTile = tilePicker(rng, aisles);
    setTile(world, openTile(), { terrain: Terrain.Pad });
    addBot(world, { at: openTile(), facing: Dir.East, name: 'RIG-04', capacity: 1 });

    const count = seed === 4 ? 1 : rng.int(8, 16);
    const slots = rng.shuffle(racks).slice(0, count);
    const rowMajor = slots.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    let arrivals = seed === 3 ? rowMajor.slice().reverse() : rng.shuffle(slots);
    while (sweptFirst(arrivals, rowMajor)) arrivals = rng.shuffle(slots);

    arrivals.forEach((at, i) => {
      setTile(world, at, { terrain: Terrain.Rack, mark: String(i + 1) });
      addGroundItems(world, at, 'crate', 1);
    });
    return world;
  },
  objectives: [
    Objectives.custom(
      'bay-cleared',
      'Move every crate onto the loading bay',
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
      'Deliver the crates in number order, 1 first',
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
      'Never step on a rack slot that had no crate at the start',
      (ctx) => slotsTrodden(ctx) === 0,
      {
        progress: (ctx) => [slotsTrodden(ctx), 0],
        divergence: overTrodden,
      },
    ),
  ],
  budget: { maxTicks: 5000 },
  starter: [
    '// The arrival number is on the slot, not the crate. Read it with scan.',
    '',
    'while (canMove(Dir.West)) move(Dir.West);',
    'while (canMove(Dir.North)) move(Dir.North);',
    '',
  ].join('\n'),
  hints: [
    'The nearest crate is rarely the next crate.',
    'From an aisle, you can scan the rack row above and the rack row below.',
    'You can read the whole yard before you pick anything up.',
    'As strings, "10" comes before "2".',
  ],
  docs: ['scan', 'pickup', 'drop'],
};
