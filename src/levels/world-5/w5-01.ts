import type { Divergence, Machine, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  MachineKind,
  Objectives,
  Rng,
  Terrain,
  addBot,
  addMachine,
  createWorld,
  dirName,
  machineById,
  setTerrain,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { at, firstNotIn } from './objectives.ts';

const WIDTH = 22;
const HEIGHT = 5;
/** The one walkable row. Everything else is wall, so the corridor is a line. */
const ROW = 2;
const WEST_END = 1;
const EAST_END = WIDTH - 2;

export interface MainsLayout {
  reactorAt: Vec;
  /** x of sub-1 … sub-n, already in distance order from the reactor. */
  stations: number[];
}

/**
 * The end the reactor sits on is decided by seed parity rather than by the Rng, so the three
 * seeds can never all agree on a direction — which is the whole anti-hardcode axis here.
 */
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

/**
 * Replays every `use` against the machine cycle to find which substations latched *legally*.
 *
 * `use` cycles a node off -> on whether or not its feeder is live, so the world alone cannot tell
 * a correct energisation from a futile one. Only the trace can, and only in order.
 */
interface LatchLog {
  good: Set<string>;
  bad: Set<string>;
  /** The first station switched on while the machine feeding it was still off. */
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

/**
 * The first station the run switched on before the machine feeding it had come up.
 *
 * The chain is the level's whole content and it is readable for nothing — every station reports
 * the index of what feeds it — so naming the pair and the tick gives back the run's own decision,
 * not the answer. A run that simply never latched a station is told that instead.
 */
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

/** The tick and tile at which the run turned round, against the way it had been going. */
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

/**
 * Par: the reference walks the line once and uses every substation, so its cost is fixed by the
 * layout — 37 ticks on the longest seed (18 moves plus nine 2-tick uses). There is no shorter
 * route, so par is that number rather than that number minus a shave.
 */
export const w5_01: LevelDef = {
  id: 'w5-01',
  world: 5,
  index: 1,
  title: 'Mains',
  hardware: ['probe'],
  brief: [
    '**MEMO KD-2488**',
    '**FROM:** Dep. Coordinator M. Vance',
    '**RE:** Feeder line 7, energisation',
    '',
    'Feeder line 7 was laid by two crews working inward from opposite ends. Neither crew',
    'recorded which end it started from. The reactor is at one of them.',
    '',
    'Bring every substation on the line to `on`.',
  ].join('\n'),
  facts: [
    {
      label: 'The line',
      value:
        'The bot starts on the reactor. The substations run away from it in one straight line.',
    },
    {
      label: '`use()`',
      value: 'Switches the substation under the bot from `off` to `on`. Costs 2 ticks.',
    },
    {
      label: 'Latching',
      value:
        '`use()` flips a substation on either way. It only **counts** if the machine feeding it was already `on`.',
    },
    {
      label: '`probe(id)`',
      value:
        'Reads any machine anywhere, for free. Substations are `sub-1` upward; past the last one it returns `null`.',
    },
    {
      label: 'What a station reports',
      value:
        '`index` — its place in the chain, the reactor being 0. `feed` — the index of the machine that feeds it.',
    },
  ],
  seeds: [1, 2, 3],
  par: { ticks: 37 },
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
  ],
  docs: ['probe', 'use', 'move'],
};
