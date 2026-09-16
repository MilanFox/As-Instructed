import type { Divergence, Machine, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  MachineKind,
  NOTHING,
  Objectives,
  Rng,
  Terrain,
  addBot,
  addMachine,
  clipValue,
  createWorld,
  setTerrain,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';

const WIDTH = 26;
const HEIGHT = 20;
const DEPOT_AT = vec(1, 1);

export interface YardPlan {
  capacities: number[];
  draws: number[];
}

const REDUCED_SLACK: Readonly<Record<number, number>> = Object.freeze({
  1: 1.15,
  2: 1.12,
  4: 1.08,
  5: 1.08,
});

const CONSTRUCTED: Readonly<Record<number, YardPlan>> = Object.freeze({
  3: {
    capacities: [14, 10, 10, 10, 10, 10, 10],
    draws: [4, 4, 4, 4, 4, 4, 6, 6, 6, 6, 6, 6],
  },
});

const workingSet = (capacities: number[]): number[] => {
  const largest = capacities.reduce((best, capacity) => Math.max(best, capacity), 0);
  const at = capacities.indexOf(largest);
  return capacities.filter((_, index) => index !== at);
};

const packs = (capacities: number[], order: number[]): boolean => {
  const room = [...capacities];
  for (const draw of order) {
    const at = room.findIndex((left) => left >= draw);
    if (at < 0) return false;
    room[at] = (room[at] as number) - draw;
  }
  return true;
};

const orderDecides = ({ capacities, draws }: YardPlan): boolean => {
  const bins = workingSet(capacities);
  const heaviestFirst = [...draws].sort((a, b) => b - a);
  const anyColumnOrder = [
    bins,
    [...bins].sort((a, b) => a - b),
    [...bins].sort((a, b) => b - a),
  ].every((order) => packs(order, heaviestFirst));
  return !packs(bins, draws) && anyColumnOrder;
};

function drawPlan(rng: Rng, slack: number): YardPlan {
  const consumers = rng.int(12, 18);
  const draws: number[] = [];
  for (let i = 0; i < consumers; i++) draws.push(rng.int(3, 9));
  const load = draws.reduce((sum, draw) => sum + draw, 0);

  const feeders = rng.int(5, 7);
  const working = feeders - 1;
  const reduced = Math.ceil(load * slack);

  const capacities: number[] = [];
  let left = reduced;
  for (let i = 0; i < working - 1; i++) {
    const share = Math.round(left / (working - i));
    const capacity = Math.max(10, share + rng.int(-3, 3));
    capacities.push(capacity);
    left -= capacity;
  }
  capacities.push(Math.max(10, left));

  const largest = capacities.reduce((best, capacity) => Math.max(best, capacity), 0);
  return { capacities: rng.shuffle([...capacities, largest + rng.int(2, 6)]), draws };
}

export function yardPlan(seed: number): YardPlan {
  const constructed = CONSTRUCTED[seed];
  if (constructed)
    return { capacities: [...constructed.capacities], draws: [...constructed.draws] };

  const rng = new Rng(seed * 3121 + 449);
  for (;;) {
    const plan = drawPlan(rng, REDUCED_SLACK[seed] ?? 1.08);
    if (orderDecides(plan)) return plan;
  }
}

const feeders = (world: World): Machine[] =>
  world.machines.filter((machine) => machine.id.startsWith('feeder-'));

const consumers = (world: World): Machine[] =>
  world.machines.filter((machine) => machine.id.startsWith('consumer-'));

const feedersOf = (world: World, consumerId: string): Machine[] =>
  feeders(world).filter((feeder) => feeder.vars[`link:${consumerId}`] === 1);

const loadOn = (world: World, feeder: Machine): number =>
  consumers(world).reduce(
    (sum, consumer) =>
      feeder.vars[`link:${consumer.id}`] === 1 ? sum + (consumer.vars.draw ?? 0) : sum,
    0,
  );

const assignedCount = (world: World): number =>
  consumers(world).filter((consumer) => feedersOf(world, consumer.id).length === 1).length;

const withinCapacityCount = (world: World): number =>
  feeders(world).filter((feeder) => loadOn(world, feeder) <= (feeder.vars.capacity ?? 0)).length;

function largestFeeder(world: World): Machine | undefined {
  let best: Machine | undefined;
  for (const feeder of feeders(world)) {
    if (!best || (feeder.vars.capacity ?? 0) > (best.vars.capacity ?? 0)) best = feeder;
  }
  return best;
}

const cabledTo = (world: World, feeder: Machine): string[] =>
  consumers(world)
    .filter((consumer) => feeder.vars[`link:${consumer.id}`] === 1)
    .map((consumer) => consumer.id);

const misassigned = (ctx: ObjectiveContext): Divergence | undefined => {
  for (const consumer of consumers(ctx.world)) {
    const on = feedersOf(ctx.world, consumer.id);
    if (on.length === 1) continue;
    return {
      where: consumer.id,
      expected: 'exactly 1 feeder',
      received: on.length === 0 ? NOTHING : clipValue(on.map((feeder) => feeder.id).join(', ')),
    };
  }
  return undefined;
};

const overCapacity = (ctx: ObjectiveContext): Divergence | undefined => {
  for (const feeder of feeders(ctx.world)) {
    const load = loadOn(ctx.world, feeder);
    if (load <= (feeder.vars.capacity ?? 0)) continue;
    return {
      where: feeder.id,
      expected: `at most ${String(feeder.vars.capacity ?? 0)}`,
      received: `${String(load)}, from ${String(cabledTo(ctx.world, feeder).length)} consumers`,
    };
  }
  return undefined;
};

const largestLoaded = (ctx: ObjectiveContext): Divergence | undefined => {
  const largest = largestFeeder(ctx.world);
  if (largest === undefined) return undefined;
  return {
    where: `${largest.id}, the largest at ${String(largest.vars.capacity ?? 0)}`,
    expected: 'no consumers on it',
    received: `${String(cabledTo(ctx.world, largest).length)}, drawing ${String(
      loadOn(ctx.world, largest),
    )}`,
  };
};

function feederAt(index: number): Vec {
  return vec(2, 2 + index * 2);
}

function consumerAt(rng: Rng, taken: Set<string>): Vec {
  for (;;) {
    const at = vec(rng.int(7, WIDTH - 2), rng.int(1, HEIGHT - 2));
    const key = `${at.x},${at.y}`;
    if (taken.has(key)) continue;
    taken.add(key);
    return at;
  }
}

export const w5_04: LevelDef = {
  id: 'w5-04',
  world: 5,
  index: 4,
  title: 'Load Balance',
  hardware: [],
  brief: [
    '**MEMO KD-2517**',
    '**FROM:** Dep. Coordinator M. Vance\\',
    '**RE:** Yard 4 distribution',
    '',
    'The ceilings are defined in Appendix C. The index entry for Appendix C is a reference',
    "to Appendix C. I have requested a copy of that. Yard 4's largest feeder is reserved",
    'for a project that has not arrived and may never.',
    '',
    'Put every consumer on a feeder. Take no feeder over its ceiling.',
  ].join('\n'),
  board: {
    fixed: [
      'yard 4 is 26 by 20 of open floor',
      'the feeders stand in one column at the west wall; the consumers are scattered across the yard',
      'RIG-01 works from the depot corner — `link` takes both ends by id, so nothing has to be driven to',
      'the ceilings added together always leave the yard headroom',
      'exactly one feeder is strictly the largest',
      'without that feeder the rest can still hold the whole load, though never in the order the consumers are reported in',
    ],
    redrawn: [
      'six to eight feeders',
      "each feeder's ceiling",
      'twelve to eighteen consumers',
      'what each one draws, three to nine',
      'which feeder in the column is the largest',
      'where the consumers stand',
    ],
  },
  facts: [
    {
      label: 'What reports what',
      value:
        'Feeders are `feeder-1` upward and report `vars.capacity`. Consumers are `consumer-1` upward and report `vars.draw`. `probe(id)` is free and returns `null` past the last one.',
    },
    { label: '`link(feederId, consumerId)`', value: 'Puts that consumer on that feeder. 2 ticks.' },
    {
      label: 'Cable is permanent',
      value:
        '**It cannot be removed once laid.** A consumer cabled to two feeders draws on both, and every consumer must end on exactly one.',
    },
    {
      label: 'Over its ceiling',
      value: 'A feeder whose cabled consumers add up to more `draw` than its `capacity`.',
    },
    {
      label: 'Room is not a fit',
      value:
        'The ceilings added together leave the yard headroom, and consumers can still end up with nowhere left to take them. Whether they do depends on the order you cable them in.',
    },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: 36 },
  build(seed: number): World {
    const { capacities, draws } = yardPlan(seed);
    const rng = new Rng(seed * 8677 + 23);
    const world = createWorld({
      w: WIDTH,
      h: HEIGHT,
      seed,
      fill: Terrain.Floor,
      vars: {
        capacity: capacities.reduce((sum, value) => sum + value, 0),
        load: draws.reduce((sum, value) => sum + value, 0),
      },
    });

    const taken = new Set<string>([`${DEPOT_AT.x},${DEPOT_AT.y}`]);
    capacities.forEach((capacity, index) => {
      const at = feederAt(index);
      taken.add(`${at.x},${at.y}`);
      setTerrain(world, at, Terrain.Cable);
      addMachine(world, {
        id: `feeder-${index + 1}`,
        kind: MachineKind.Node,
        at,
        state: 'on',
        inventory: [],
        vars: { capacity },
      });
    });

    draws.forEach((draw, index) => {
      const at = consumerAt(rng, taken);
      setTerrain(world, at, Terrain.Cable);
      addMachine(world, {
        id: `consumer-${index + 1}`,
        kind: MachineKind.Node,
        at,
        state: 'idle',
        inventory: [],
        vars: { draw },
      });
    });

    addBot(world, { at: DEPOT_AT, facing: Dir.East, name: 'RIG-01' });
    return world;
  },
  objectives: [
    Objectives.custom(
      'assigned',
      'Leave every consumer on exactly one feeder',
      (ctx) => assignedCount(ctx.world) === consumers(ctx.world).length,
      {
        progress: (ctx) => [assignedCount(ctx.world), consumers(ctx.world).length],
        divergence: misassigned,
      },
    ),
    Objectives.custom(
      'within-capacity',
      'Keep every feeder at or under its capacity',
      (ctx) => withinCapacityCount(ctx.world) === feeders(ctx.world).length,
      {
        progress: (ctx) => [withinCapacityCount(ctx.world), feeders(ctx.world).length],
        divergence: overCapacity,
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'largest-idle',
      'Leave the highest-capacity feeder cold',
      (ctx) => {
        const largest = largestFeeder(ctx.world);
        return largest !== undefined && loadOn(ctx.world, largest) === 0;
      },
      { divergence: largestLoaded },
    ),
  ],
  starter: [
    '// A cable cannot be undone.',
    '',
    'const feeders = [];',
    'for (let i = 1; ; i++) {',
    '  const feeder = probe(`feeder-${i}`);',
    '  if (feeder === null) break;',
    '  feeders.push(feeder);',
    '}',
    '',
  ].join('\n'),
  hints: [
    'Reading every capacity and every draw is free. Work the whole assignment out on paper before you lay a single cable, because a cable is permanent.',
    'A feeder with four units of headroom left is no use to a consumer that draws six. The awkward consumers are the big ones, and they get more awkward the later you get to them.',
    'The star wants the highest-capacity feeder cold, so work the yard out as though it were not there at all. Every unit you spill onto it is the star gone, and the cable does not come back.',
  ],
  docs: ['probe', 'link'],
};
