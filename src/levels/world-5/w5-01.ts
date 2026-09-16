import type {
  Divergence,
  Machine,
  MoveEvent,
  ObjectiveContext,
  PrintEvent,
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
  dirName,
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
  return { reactorAt: vec(reactorX, ROW), stations };
}

const isSubstation = (machine: Machine): boolean => machine.id.startsWith('sub-');

const feederOf = (machine: Machine): string => {
  const feed = machine.vars.feed ?? 0;
  return feed === 0 ? 'reactor' : `sub-${feed}`;
};

const substations = (world: World): Machine[] => world.machines.filter(isSubstation);

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
    const feeder = feederOf(machine);
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
    expected: `switched on after ${feederOf(missed)}`,
    received: 'never switched on',
  };
};

const doubledBack = (ctx: ObjectiveContext): Divergence | undefined => {
  let started: Dir | undefined;
  for (const event of ctx.trace.events) {
    if (event.kind !== 'move' || !event.ok) continue;
    if (started === undefined) {
      started = event.dir;
      continue;
    }
    if (event.dir === started) continue;
    return {
      where: `tick ${String(event.t)} · ${at(event.to)}`,
      expected: `${dirName(started).toLowerCase()}, the way the run started`,
      received: dirName(event.dir).toLowerCase(),
    };
  }
  return undefined;
};

const orderedCount = (ctx: ObjectiveContext): number => {
  const { good, bad } = latchAudit(ctx);
  return substations(ctx.world).filter((m) => good.has(m.id) && !bad.has(m.id)).length;
};

const keyOf = (tile: Vec): string => `${String(tile.x)},${String(tile.y)}`;

const tilesIn = (prints: readonly PrintEvent[]): Vec[] =>
  prints.flatMap((line) =>
    (line.text.match(/\d+,\d+/g) ?? []).map((pair) => {
      const [x = '0', y = '0'] = pair.split(',');
      return vec(Number(x), Number(y));
    }),
  );

interface DeclaredRoute {
  declared: Vec[];
  walked: Vec[];
  matched: number;
  droveFirst: boolean;
}

function declaredRoute(ctx: ObjectiveContext): DeclaredRoute {
  const steps = ctx.trace.events.filter(
    (event): event is MoveEvent => event.kind === 'move' && event.ok,
  );
  const first = steps[0];
  const declared = tilesIn(printsUpTo(ctx.trace, first?.t ?? Number.POSITIVE_INFINITY));
  const start = ctx.initialWorld.bots[0]?.at;
  const head = declared[0];
  if (start !== undefined && head !== undefined && keyOf(head) === keyOf(start)) declared.shift();

  const walked = steps.map((step) => step.to);
  let matched = 0;
  while (matched < declared.length && matched < walked.length) {
    if (keyOf(declared[matched] as Vec) !== keyOf(walked[matched] as Vec)) break;
    matched++;
  }
  const droveFirst =
    first !== undefined && declared.length === 0 && tilesIn(printsUpTo(ctx.trace)).length > 0;
  return { declared, walked, matched, droveFirst };
}

const walkedWhatItSaid = (ctx: ObjectiveContext): boolean => {
  const { declared, walked, matched } = declaredRoute(ctx);
  return declared.length > 0 && matched === declared.length && matched === walked.length;
};

const routeProgress = (ctx: ObjectiveContext): [number, number] => {
  const { declared, walked, matched } = declaredRoute(ctx);
  return [matched, Math.max(declared.length, walked.length)];
};

const leftTheRoute = (ctx: ObjectiveContext): Divergence | undefined => {
  const { declared, walked, matched, droveFirst } = declaredRoute(ctx);
  if (declared.length === 0) {
    return {
      where: 'the route',
      expected: 'tiles printed before the first step',
      received: droveFirst ? 'the bot stepped off first' : NOTHING,
    };
  }
  if (matched === declared.length && matched === walked.length) return undefined;
  const said = declared[matched];
  const took = walked[matched];
  return {
    where: `step ${String(matched + 1)}`,
    expected: said === undefined ? 'the route to end here' : at(said),
    received: took === undefined ? 'the run stopped here' : at(took),
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
    'Feeder line 7 was laid by two crews working inward from opposite ends. Neither crew',
    'recorded which end it started from. The reactor is at one of them.',
    '',
    'Bring every substation on the line to `on`.',
  ].join('\n'),
  board: {
    fixed: [
      'feeder line 7 is one row of cable, twenty tiles long, walled on every side',
      'the reactor sits on one end of it, already on, and RIG-01 starts on the reactor',
      'every substation starts off, and `sub-1` is the one the reactor feeds',
      'each station after that is fed by the one before it',
    ],
    redrawn: [
      'which end of the line the reactor sits on',
      'six to nine substations',
      'the gaps between them',
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
      label: 'Latching',
      value:
        '`use()` flips a substation on either way. It only **counts** if the machine feeding it was already `on`, and a station latched early stays uncounted for the rest of the shift — there is no repairing it later.',
    },
    {
      label: '`probe(id)`',
      value:
        'Reads any machine anywhere, for free. Substations are `sub-1` upward; past the last one it returns `null`.',
    },
    {
      label: 'What a station reports',
      value:
        '`index` — its place in the chain, the reactor being 0. `feed` — the index of the machine that feeds it. `at` — the tile it stands on.',
    },
    {
      label: 'The route',
      value:
        'For the star: before the first step, print the tiles the bot is going to stand on, in the order it will reach them, each as `x,y`. One line holds the lot. Every `x,y` printed before that first step is read as part of the route and the rest of the text is ignored; the reactor tile the bot starts on may be named or left out. The star is earned if the run then steps onto exactly those tiles, in that order.',
    },
  ],
  seeds: [1, 2, 3],
  par: { ticks: 32 },
  build(seed: number): World {
    const { reactorAt, stations } = mainsLayout(seed);
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
        id: `sub-${i + 1}`,
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
  ],
  bonus: [
    Objectives.custom(
      'one-pass',
      'Make one pass. Never double back.',
      (ctx) => {
        const directions = new Set<Dir>();
        for (const event of ctx.trace.events) {
          if (event.kind === 'move' && event.ok) directions.add(event.dir);
        }
        return directions.size <= 1;
      },
      { divergence: doubledBack },
    ),
    Objectives.custom('route-declared', 'Print the route before walking it', walkedWhatItSaid, {
      progress: routeProgress,
      divergence: leftTheRoute,
    }),
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
    'Every substation reports the index of the machine that feeds it. Start at the reactor and follow that chain outward; the order comes out of the chain, not out of the map.',
    'A probe already hands back the tile every machine stands on, and the bot starts on the reactor. One step along the line changes the bot column by one, so its place on the line after any number of steps is arithmetic, not a question for the world.',
  ],
  docs: ['probe', 'use', 'move'],
};
