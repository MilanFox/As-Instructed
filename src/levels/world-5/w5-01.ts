import type {
  Divergence,
  Machine,
  MoveEvent,
  ObjectiveContext,
  PrintEvent,
  UseEvent,
  Vec,
  World,
} from '../../engine/index.ts';
import {
  Dir,
  MANUAL_ONLY,
  MachineKind,
  NOTHING,
  Objectives,
  Rng,
  Terrain,
  addBot,
  addMachine,
  createWorld,
  machineById,
  printsUpTo,
  setTerrain,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { at, firstNotIn } from './objectives.ts';

const WIDTH = 22;
const HEIGHT = 5;
const ROW = 2;
const WEST_END = 1;
const EAST_END = WIDTH - 2;

export interface MainsLayout {
  reactorAt: Vec;
  stations: number[];
  names: number[];
}

export function mainsLayout(seed: number): MainsLayout {
  const rng = new Rng(seed * 7919 + 101);
  const count = rng.int(6, 9);
  const reactorEast = seed % 2 === 0;
  const stepSign = reactorEast ? -1 : 1;
  const reactorX = reactorEast ? EAST_END : WEST_END;
  const stations: number[] = [];
  let x = reactorX + stepSign * rng.int(2, 3);
  for (let k = 0; k < count; k++) {
    stations.push(x);
    x += stepSign * rng.int(1, 2);
  }
  const names = rng.shuffle(Array.from({ length: count }, (_, k) => k + 1));
  return { reactorAt: vec(reactorX, ROW), stations, names };
}

const isSubstation = (machine: Machine): boolean => machine.id.startsWith('sub-');

const substations = (world: World): Machine[] => world.machines.filter(isSubstation);

const byIndex = (world: World, index: number): Machine | undefined =>
  world.machines.find((machine) => machine.vars.index === index);

const feederOf = (world: World, machine: Machine): string =>
  byIndex(world, machine.vars.feed ?? 0)?.id ?? 'reactor';

const energisedCount = (world: World): number =>
  substations(world).filter((machine) => machine.state === 'on').length;

interface LatchLog {
  good: Set<string>;
  bad: Set<string>;
  early?: { id: string; feeder: string; t: number };
}

function latchAudit(ctx: ObjectiveContext): LatchLog {
  const state = new Map<string, string>();
  for (const machine of ctx.initialWorld.machines) state.set(machine.id, machine.state);
  const good = new Set<string>();
  const bad = new Set<string>();
  let early: LatchLog['early'];

  for (const event of ctx.trace.events) {
    if (event.kind !== 'use' || !event.ok || event.machineId === null) continue;
    const machine = machineById(ctx.world, event.machineId);
    if (!machine || !machine.cycle || machine.cycle.length === 0) continue;
    const before = state.get(machine.id) ?? machine.state;
    const next = machine.cycle[(machine.cycle.indexOf(before) + 1) % machine.cycle.length];
    if (next === undefined) continue;
    state.set(machine.id, next);
    if (before !== 'off' || next !== 'on') continue;
    const feeder = feederOf(ctx.world, machine);
    const feederLive = feeder === 'reactor' || state.get(feeder) === 'on';
    if (feederLive) good.add(machine.id);
    else {
      bad.add(machine.id);
      early ??= { id: machine.id, feeder, t: event.t };
    }
  }

  return early === undefined ? { good, bad } : { good, bad, early };
}

const latchedEarly = (ctx: ObjectiveContext): Divergence | undefined => {
  const { good, bad, early } = latchAudit(ctx);
  if (early !== undefined) {
    return {
      where: `tick ${String(early.t)} · ${early.id}`,
      expected: `${early.feeder} already on`,
      received: `${early.feeder} was still off`,
    };
  }
  const missed = substations(ctx.world).find(
    (machine) => !good.has(machine.id) || bad.has(machine.id),
  );
  if (missed === undefined) return undefined;
  return {
    where: `${missed.id} · ${at(missed.at)}`,
    expected: `switched on after ${feederOf(ctx.world, missed)}`,
    received: 'never switched on',
  };
};

const orderedCount = (ctx: ObjectiveContext): number => {
  const { good, bad } = latchAudit(ctx);
  return substations(ctx.world).filter((m) => good.has(m.id) && !bad.has(m.id)).length;
};

const throwsTaken = (ctx: ObjectiveContext): number =>
  ctx.trace.events.filter((event) => event.kind === 'use').length;

const throwsAllowed = (ctx: ObjectiveContext): number => substations(ctx.world).length;

const idsIn = (prints: readonly PrintEvent[]): string[] =>
  prints.flatMap((line) => line.text.match(/sub-\d+/g) ?? []);

interface DeclaredOrder {
  declared: string[];
  latched: string[];
  matched: number;
  droveFirst: boolean;
}

function declaredOrder(ctx: ObjectiveContext): DeclaredOrder {
  const steps = ctx.trace.events.filter(
    (event): event is MoveEvent => event.kind === 'move' && event.ok,
  );
  const first = steps[0];
  const declared = idsIn(printsUpTo(ctx.trace, first?.t ?? Number.POSITIVE_INFINITY));

  const latched = ctx.trace.events
    .filter((event): event is UseEvent => event.kind === 'use' && event.ok)
    .map((event) => event.machineId)
    .filter((id): id is string => id !== null && id.startsWith('sub-'));

  let matched = 0;
  while (matched < declared.length && matched < latched.length) {
    if (declared[matched] !== latched[matched]) break;
    matched++;
  }
  const droveFirst =
    first !== undefined && declared.length === 0 && idsIn(printsUpTo(ctx.trace)).length > 0;
  return { declared, latched, matched, droveFirst };
}

const latchedWhatItSaid = (ctx: ObjectiveContext): boolean => {
  const { declared, latched, matched } = declaredOrder(ctx);
  return declared.length > 0 && matched === declared.length && matched === latched.length;
};

const orderProgress = (ctx: ObjectiveContext): [number, number] => {
  const { declared, latched, matched } = declaredOrder(ctx);
  return [matched, Math.max(declared.length, latched.length)];
};

const leftTheOrder = (ctx: ObjectiveContext): Divergence | undefined => {
  const { declared, latched, matched, droveFirst } = declaredOrder(ctx);
  if (declared.length === 0) {
    return {
      where: 'the order',
      expected: 'ids printed before the first move',
      received: droveFirst ? 'the bot moved first' : NOTHING,
    };
  }
  if (matched === declared.length && matched === latched.length) return undefined;
  const said = declared[matched];
  const took = latched[matched];
  return {
    where: `switch ${String(matched + 1)}`,
    expected: said ?? 'the list to end here',
    received: took ?? 'the run stopped here',
  };
};

export const w5_01: LevelDef = {
  id: 'w5-01',
  world: 5,
  index: 1,
  title: 'Mains',
  hardware: ['probe', 'use'],
  brief: [
    'Two crews built this line from opposite ends and numbered it with confidence. The planners want your switching order before you start, for their wall. — M. Vance',
    '',
    '**The reactor feeds a line of substations. Each one needs the one before it on. Switch them all on, one `use()` each.**',
  ].join('\n'),
  board: {
    redrawn: [
      'which end the reactor is at',
      'six to nine substations, and the gaps between them',
      'which id is on which substation',
    ],
  },
  facts: [
    {
      label: 'Substations',
      value:
        'Ids are `sub-1`, `sub-2`, …; `probe` returns `null` after the last. Probing is free. The id number is not its place on the line: `vars.index` is (the reactor is 0). All start off.',
    },
    {
      label: 'Feeder',
      value:
        "A substation's feeder is the one before it on the line; `vars.feed` is the feeder's index. The reactor is at one end, already on; RIG-01 starts on it. A substation counts only if its feeder was on when you switched it. A switch too early never counts, even if you switch it again later.",
    },
    {
      label: '`use()`',
      value:
        'Switches the substation under the bot, not one beside it, off to on or on to off, for 2 ticks. Substations have no `fed:` key, so it works even if the feeder is off. Every call counts, even on plain cable.',
    },
    {
      label: 'Switching order',
      value:
        "For the star, print the ids in switching order before the bot's first step, like `sub-4 sub-1 sub-6`. Every `sub-n` printed before that step counts. The run must then switch exactly those, in that order.",
    },
  ],
  seeds: [1, 2, 3],
  par: { ticks: 32 },
  build(seed: number): World {
    const { reactorAt, stations, names } = mainsLayout(seed);
    const world = createWorld({ w: WIDTH, h: HEIGHT, seed, fill: Terrain.Wall });
    for (let x = WEST_END; x <= EAST_END; x++) setTerrain(world, vec(x, ROW), Terrain.Cable);

    addMachine(world, {
      id: 'reactor',
      kind: MachineKind.Node,
      at: reactorAt,
      state: 'on',
      inventory: [],
      vars: { index: 0 },
    });
    stations.forEach((x, i) => {
      addMachine(world, {
        id: `sub-${String(names[i] ?? i + 1)}`,
        kind: MachineKind.Node,
        at: vec(x, ROW),
        state: 'off',
        inventory: [],
        vars: { index: i + 1, feed: i, [MANUAL_ONLY]: 1 },
        cycle: ['off', 'on'],
      });
    });

    const first = stations[0] ?? reactorAt.x;
    addBot(world, {
      at: reactorAt,
      facing: first > reactorAt.x ? Dir.East : Dir.West,
      name: 'RIG-01',
    });
    return world;
  },
  objectives: [
    Objectives.custom(
      'energised',
      'Leave every substation on',
      (ctx) => energisedCount(ctx.world) === substations(ctx.world).length,
      {
        progress: (ctx) => [energisedCount(ctx.world), substations(ctx.world).length],
        divergence: (ctx) => firstNotIn(substations(ctx.world), 'on'),
      },
    ),
    Objectives.custom(
      'in-order',
      'Switch each substation on only after its feeder is on',
      (ctx) => orderedCount(ctx) === substations(ctx.world).length,
      {
        progress: (ctx) => [orderedCount(ctx), substations(ctx.world).length],
        divergence: latchedEarly,
      },
    ),
    Objectives.custom(
      'one-throw-each',
      'Call `use()` once per substation and nowhere else',
      (ctx) => throwsTaken(ctx) <= throwsAllowed(ctx),
      {
        meter: { kind: 'events', event: 'use' },
        unit: 'throws',
        progress: (ctx) => [Math.min(throwsTaken(ctx), throwsAllowed(ctx)), throwsAllowed(ctx)],
        divergence: (ctx) => ({
          where: 'throws this shift',
          expected: `${String(throwsAllowed(ctx))} at most`,
          received: `${String(throwsTaken(ctx))} taken`,
        }),
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'order-declared',
      'Print the switching order before the first move',
      latchedWhatItSaid,
      {
        progress: orderProgress,
        divergence: leftTheOrder,
      },
    ),
  ],
  starter: [
    '// probe(id) reads any machine. use() switches the one under the bot.',
    '',
    "const reactor = probe('reactor');",
    '',
  ].join('\n'),
  hints: [
    'The reactor is not always at the same end. Probe it to find out.',
    'Probe sub-1, sub-2, and so on until you get null. Now you have every substation.',
    'Each substation names its feeder. Start at the reactor and follow the chain outward.',
    'You can work out the whole order before the bot moves. Print it, then walk it.',
  ],
  docs: ['probe', 'use', 'move'],
};
