import type { Machine, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  MachineKind,
  Objectives,
  Rng,
  Terrain,
  addBot,
  addMachine,
  createWorld,
  setTerrain,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';

const WIDTH = 26;
const HEIGHT = 20;
const DEPOT_AT = vec(1, 1);

export interface YardPlan {
  /** feeder-1 … feeder-m, in world order. Exactly one is strictly the largest. */
  capacities: number[];
  /** consumer-1 … consumer-k, in world order. */
  draws: number[];
}

/**
 * Slack per seed, measured against the feeders that must actually carry the load — that is, every
 * feeder except the largest one.
 *
 * The bonus asks for the largest feeder to end cold, which is only possible when the remaining
 * feeders can hold the whole load. That forces the reduced set to be the tight problem and the
 * full set to look roomy. Seed 1 is the teaching instance and seed 3 is built by hand below.
 */
const REDUCED_SLACK: Readonly<Record<number, number>> = Object.freeze({
  1: 1.25,
  2: 1.12,
  4: 1.08,
  5: 1.08,
});

/**
 * Seed 3 is constructed, not drawn. Six feeders of 10 and twelve consumers offered as
 * 4,4,4,4,4,4,6,6,6,6,6,6: taking them in that order wedges pairs of fours into bins that then
 * cannot hold a six. Taking the sixes first fits all twelve exactly. The seventh feeder is the
 * one the bonus asks you to leave alone.
 */
const CONSTRUCTED: Readonly<Record<number, YardPlan>> = Object.freeze({
  3: {
    capacities: [10, 10, 10, 10, 10, 10, 14],
    draws: [4, 4, 4, 4, 4, 4, 6, 6, 6, 6, 6, 6],
  },
});

export function yardPlan(seed: number): YardPlan {
  const constructed = CONSTRUCTED[seed];
  if (constructed)
    return { capacities: [...constructed.capacities], draws: [...constructed.draws] };

  const rng = new Rng(seed * 3121 + 449);
  const consumers = rng.int(12, 20);
  const draws: number[] = [];
  for (let i = 0; i < consumers; i++) draws.push(rng.int(3, 9));
  const load = draws.reduce((sum, draw) => sum + draw, 0);

  const feeders = rng.int(5, 8);
  const working = feeders - 1;
  const reduced = Math.ceil(load * (REDUCED_SLACK[seed] ?? 1.08));

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

/** Feeders sit down the West wall; consumers are scattered across the yard. */
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

/**
 * Par: the reference lays exactly one cable per consumer, so its clock is 2 × consumers — 40 ticks
 * on the twenty-consumer seed. There is no cheaper assignment, so par is that figure exactly.
 */
export const w5_04: LevelDef = {
  id: 'w5-04',
  world: 5,
  index: 4,
  title: 'Load Balance',
  hardware: [],
  brief: [
    '**MEMO KD-2517**',
    '**FROM:** Dep. Coordinator M. Vance',
    '**RE:** Yard 4 distribution',
    '',
    'Every feeder in Yard 4 has a ceiling. The ceilings are defined in Appendix C. The index',
    'entry for Appendix C is a reference to Appendix C. I have requested a copy of that.',
    '',
    'Put every consumer on a feeder. Take no feeder over its ceiling.',
  ].join('\n'),
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
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: 40, chars: 620 },
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
      (ctx) => [assignedCount(ctx.world), consumers(ctx.world).length],
    ),
    Objectives.custom(
      'within-capacity',
      'Keep every feeder at or under its capacity',
      (ctx) => withinCapacityCount(ctx.world) === feeders(ctx.world).length,
      (ctx) => [withinCapacityCount(ctx.world), feeders(ctx.world).length],
    ),
  ],
  bonus: [
    Objectives.custom('largest-idle', 'Leave the highest-capacity feeder cold', (ctx) => {
      const largest = largestFeeder(ctx.world);
      return largest !== undefined && loadOn(ctx.world, largest) === 0;
    }),
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
    'The same set of consumers packs or does not pack depending only on the order you consider them in. Try the hardest ones while the most feeders are still empty.',
  ],
  docs: ['probe', 'link'],
};
