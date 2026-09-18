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
      expected: 'ids printed before the first step',
      received: droveFirst ? 'the bot stepped off first' : NOTHING,
    };
  }
  if (matched === declared.length && matched === latched.length) return undefined;
  const said = declared[matched];
  const took = latched[matched];
  return {
    where: `latch ${String(matched + 1)}`,
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
    '**MEMO KD-2488**',
    '**FROM:** Dep. Coordinator M. Vance\\',
    '**RE:** Feeder line 7, energisation',
    '',
    'Feeder line 7 was laid by two crews working inward from opposite ends. Neither recorded',
    'which end it started from, and both stencilled cabinet numbers as they went, so the',
    'numbers are labels and nothing more. Scheduling want the switching order in advance;',
    'filed afterwards it is a report, not a plan.',
    '',
    'Bring every substation on the line to `on`. One throw each — Safety counts the handles.',
  ].join('\n'),
  board: {
    fixed: [
      'feeder line 7 is one row of cable, twenty tiles long, walled on every side',
      'the reactor sits on one end of it, already on, and RIG-01 starts on the reactor',
      'every substation starts off, and the chain runs outward from the reactor',
      'the number in a substation id is a stencilled label, not its place on the line',
    ],
    redrawn: [
      'which end of the line the reactor sits on',
      'six to nine substations',
      'the gaps between them',
      'which id got stencilled on which substation',
    ],
  },
  facts: [
    {
      label: 'The line',
      value:
        'One row of cable (a terrain), walkable, walled on every side. The bot starts on the reactor. The substations run away from it in one straight line.',
    },
    {
      label: '`use()`',
      value:
        'Steps the substation under the bot one place along its cycle, `off` → `on` → `off`. Costs 2 ticks, so a second call takes the same station back off again.',
    },
    {
      label: 'Latch handles',
      value:
        'The shift carries one throw per substation and no more. Every `use()` call counts against it, including the ones that hit bare cable.',
    },
    {
      label: 'Latching',
      value:
        '`use()` flips a substation on either way. It only **counts** if the machine feeding it was already `on`, and a station latched early stays uncounted for the rest of the shift — there is no repairing it later.',
    },
    {
      label: '`probe(id)`',
      value:
        'Reads any machine anywhere, for free. The ids run `sub-1` upward; past the last one it returns `null`. Which id sits where on the line is not fixed.',
    },
    {
      label: 'What a station reports',
      value:
        '`index` — its place in the chain, the reactor being 0, and not the number in its id. `feed` — the index of the machine that feeds it. `at` — the tile it stands on.',
    },
    {
      label: 'The order',
      value:
        'For the star: before the first step, print the substation ids in the order the bot is going to latch them — a four-station line would file `sub-4 sub-1 sub-6 sub-2`. One line holds the lot. Every `sub-n` printed before that first step is read as part of the order and the rest of the text is ignored; the reactor is not named. The star is earned if the run then latches exactly those stations, in that order, and latches no other.',
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
        vars: { index: i + 1, feed: i },
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
      'Latch each substation only after its feeder is live',
      (ctx) => orderedCount(ctx) === substations(ctx.world).length,
      {
        progress: (ctx) => [orderedCount(ctx), substations(ctx.world).length],
        divergence: latchedEarly,
      },
    ),
    Objectives.custom(
      'one-throw-each',
      'Call `use()` once per substation and no more',
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
      'Print the latch order before walking it',
      latchedWhatItSaid,
      {
        progress: orderProgress,
        divergence: leftTheOrder,
      },
    ),
  ],
  starter: [
    '// probe(id) reads any machine in the world. use() switches the one under the bot.',
    '',
    "const reactor = probe('reactor');",
    '',
  ].join('\n'),
  hints: [
    'The reactor is not at the same end every shift. Where it is, is in the world, and reading the world costs nothing.',
    'probe() answers about any machine by id, not only the one under the bot. Ask about a station that might not be there and it tells you so.',
    'Every substation reports the index of the machine that feeds it. Start at the reactor and follow that chain outward; the order comes out of the chain, not out of the stencilled number.',
    'Nothing about the order needs the bot to move. probe() answers while RIG-01 is still standing on the reactor, so the whole list can be filed before the first step.',
  ],
  docs: ['probe', 'use', 'move'],
};
