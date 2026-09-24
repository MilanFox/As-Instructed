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
  manhattan,
  setTerrain,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { at, cableLegs } from './objectives.ts';

const WIDTH = 30;
const HEIGHT = 24;
const REACTOR_AT = vec(14, 11);
const LINK_PREFIX = 'link:';

export type PointSet = 'uniform' | 'clustered' | 'mixed';

const POINT_SETS: Readonly<Record<number, { kind: PointSet; count: number }>> = Object.freeze({
  1: { kind: 'uniform', count: 10 },
  2: { kind: 'clustered', count: 12 },
  3: { kind: 'uniform', count: 14 },
  4: { kind: 'clustered', count: 11 },
  5: { kind: 'mixed', count: 13 },
});

export interface BlackoutPlan {
  kind: PointSet;
  stations: Vec[];
  mstWeight: number;
  cableBudget: number;
}

function scatter(rng: Rng, kind: PointSet, count: number): Vec[] {
  const taken = new Set<string>([`${REACTOR_AT.x},${REACTOR_AT.y}`]);
  const stations: Vec[] = [];
  const clusters: Vec[] = [];
  const clusterCount = kind === 'clustered' ? 3 : 2;
  for (let i = 0; i < clusterCount; i++) {
    clusters.push(vec(rng.int(4, WIDTH - 5), rng.int(3, HEIGHT - 4)));
  }

  while (stations.length < count) {
    const clustered = kind === 'clustered' || (kind === 'mixed' && stations.length % 2 === 0);
    let at: Vec;
    if (clustered) {
      const centre = clusters[stations.length % clusters.length] as Vec;
      at = vec(
        Math.min(WIDTH - 2, Math.max(1, centre.x + rng.int(-5, 5))),
        Math.min(HEIGHT - 2, Math.max(1, centre.y + rng.int(-4, 4))),
      );
    } else {
      at = vec(rng.int(1, WIDTH - 2), rng.int(1, HEIGHT - 2));
    }
    const key = `${at.x},${at.y}`;
    if (taken.has(key)) continue;
    taken.add(key);
    stations.push(at);
  }
  return stations;
}

export function mstWeight(nodes: readonly Vec[]): number {
  if (nodes.length < 2) return 0;
  const inTree = new Array<boolean>(nodes.length).fill(false);
  const best = new Array<number>(nodes.length).fill(Number.POSITIVE_INFINITY);
  best[0] = 0;
  let total = 0;

  for (let step = 0; step < nodes.length; step++) {
    let pick = -1;
    for (let i = 0; i < nodes.length; i++) {
      if (inTree[i]) continue;
      if (pick < 0 || (best[i] as number) < (best[pick] as number)) pick = i;
    }
    inTree[pick] = true;
    total += best[pick] as number;
    for (let i = 0; i < nodes.length; i++) {
      if (inTree[i]) continue;
      const distance = manhattan(nodes[pick] as Vec, nodes[i] as Vec);
      if (distance < (best[i] as number)) best[i] = distance;
    }
  }
  return total;
}

export function blackoutPlan(seed: number): BlackoutPlan {
  const rng = new Rng(seed * 2749 + 61);
  const { kind, count } = POINT_SETS[seed] ?? { kind: 'uniform' as PointSet, count: 12 };
  const stations = scatter(rng, kind, count);
  const weight = mstWeight([REACTOR_AT, ...stations]);
  return { kind, stations, mstWeight: weight, cableBudget: Math.ceil(weight * 1.08) };
}

const substations = (world: World): Machine[] =>
  world.machines.filter((machine) => machine.id.startsWith('sub-'));

function neighbourhood(machines: readonly Machine[]): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  const edge = (a: string, b: string): void => {
    const set = graph.get(a) ?? new Set<string>();
    set.add(b);
    graph.set(a, set);
  };
  for (const machine of machines) {
    for (const key of Object.keys(machine.vars)) {
      if (!key.startsWith(LINK_PREFIX) || machine.vars[key] !== 1) continue;
      const other = key.slice(LINK_PREFIX.length);
      edge(machine.id, other);
      edge(other, machine.id);
    }
  }
  return graph;
}

function reachable(world: World): Set<string> {
  const graph = neighbourhood(world.machines);
  const seen = new Set<string>(['reactor']);
  const queue: string[] = ['reactor'];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    for (const next of graph.get(id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

function connectedCount(world: World): number {
  const seen = reachable(world);
  return substations(world).filter((machine) => seen.has(machine.id)).length;
}

const unreached = (ctx: ObjectiveContext): Divergence | undefined => {
  const seen = reachable(ctx.world);
  const stray = substations(ctx.world).find((machine) => !seen.has(machine.id));
  if (stray === undefined) return undefined;
  const joined = [...(neighbourhood(ctx.world.machines).get(stray.id) ?? [])];
  return {
    where: `${stray.id} · ${at(stray.at)}`,
    expected: 'a cable back to the reactor',
    received: joined.length === 0 ? NOTHING : clipValue(`cabled to ${joined.join(', ')}`),
  };
};

function darkWithout(world: World, id: string): number {
  const graph = neighbourhood(world.machines);
  const seen = new Set<string>(['reactor', id]);
  const queue: string[] = ['reactor'];
  while (queue.length > 0) {
    const at = queue.shift() as string;
    for (const next of graph.get(at) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return substations(world).filter((machine) => machine.id === id || !seen.has(machine.id)).length;
}

function weakestLinks(world: World): { ids: Set<string>; load: number } {
  const load = new Map<string, number>();
  for (const machine of substations(world)) load.set(machine.id, darkWithout(world, machine.id));
  const worst = Math.max(0, ...load.values());
  const ids = new Set<string>();
  for (const [id, n] of load) if (n === worst) ids.add(id);
  return { ids, load: worst };
}

function readClaim(line: string): { id: string; load: number } | null {
  const parts = line.split(' ');
  if (parts.length !== 3) return null;
  const load = Number(parts[2]);
  if (!Number.isInteger(load)) return null;
  return { id: parts[1] as string, load };
}

const outageReport = (ctx: ObjectiveContext): string[] =>
  ctx.trace.events
    .filter((event) => event.kind === 'print')
    .map((event) => (event.kind === 'print' ? event.text : ''))
    .filter((line) => line.startsWith('weak '));

const misread = (ctx: ObjectiveContext): Divergence | undefined => {
  const lines = outageReport(ctx);
  const said = lines[0];
  if (said === undefined) {
    return {
      where: 'the weak line',
      expected: 'a line: weak <id> <n>',
      received: NOTHING,
    };
  }
  if (lines.length > 1) {
    return {
      where: 'the weak line',
      expected: 'one weak line',
      received: `${String(lines.length)} of them`,
    };
  }
  const claim = readClaim(said);
  if (claim === null) {
    return {
      where: 'the weak line',
      expected: 'a line reading `weak <id> <n>`',
      received: clipValue(said),
    };
  }
  const named = substations(ctx.world).find((machine) => machine.id === claim.id);
  if (named === undefined) {
    return {
      where: 'the weak line',
      expected: 'a substation in the district',
      received: clipValue(claim.id),
    };
  }
  const { ids } = weakestLinks(ctx.world);
  if (ids.has(claim.id)) {
    return {
      where: `${claim.id} · ${at(named.at)}`,
      expected: 'how many it cuts off',
      received: String(claim.load),
    };
  }
  return {
    where: `${claim.id} · ${at(named.at)}`,
    expected: 'the substation that cuts off the most',
    received: `it cuts off ${String(darkWithout(ctx.world, claim.id))}`,
  };
};

export function cableSpent(ctx: ObjectiveContext): number {
  let total = 0;
  for (const event of ctx.trace.events) {
    if (event.kind === 'spend' && event.resource === 'cable') total += event.amount;
  }
  return total;
}

interface LiveOrder {
  valid: Set<string>;
  early: { id: string; t: number }[];
}

function liveOrder(ctx: ObjectiveContext): LiveOrder {
  const ids = new Map(
    ctx.initialWorld.machines.map((machine) => [`${machine.at.x},${machine.at.y}`, machine.id]),
  );
  const graph = new Map<string, Set<string>>();
  const join = (a: string, b: string): void => {
    const set = graph.get(a) ?? new Set<string>();
    set.add(b);
    graph.set(a, set);
  };
  const live = new Set<string>(['reactor']);
  const valid = new Set<string>();
  const early: LiveOrder['early'] = [];

  for (const event of ctx.trace.events) {
    if (event.kind === 'machineChange') {
      for (const key of Object.keys(event.after.vars)) {
        if (!key.startsWith(LINK_PREFIX) || event.after.vars[key] !== 1) continue;
        if (event.before.vars[key] === 1) continue;
        const other = key.slice(LINK_PREFIX.length);
        join(event.id, other);
        join(other, event.id);
      }
      continue;
    }
    if (event.kind !== 'act' || event.name !== 'power' || !event.ok) continue;
    if (event.detail !== 'on' || event.at === undefined) continue;
    const id = ids.get(`${event.at.x},${event.at.y}`);
    if (id === undefined || !id.startsWith('sub-')) continue;
    const touchesLive = [...(graph.get(id) ?? [])].some((other) => live.has(other));
    if (!touchesLive) {
      early.push({ id, t: event.t });
      continue;
    }
    live.add(id);
    valid.add(id);
  }
  return { valid, early };
}

const liveOrderCount = (ctx: ObjectiveContext): number => liveOrder(ctx).valid.size;

const notLive = (ctx: ObjectiveContext): Divergence | undefined => {
  const { valid, early } = liveOrder(ctx);
  const stranded = early.find((call) => !valid.has(call.id));
  if (stranded !== undefined) {
    return {
      where: `tick ${String(stranded.t)} · ${stranded.id}`,
      expected: 'a cable to a substation already on',
      received: 'no cable to a substation that was on',
    };
  }
  const missed = substations(ctx.world).find(
    (machine) => !valid.has(machine.id) || machine.state !== 'on',
  );
  if (missed === undefined) return undefined;
  return { where: `${missed.id} · ${at(missed.at)}`, expected: 'on', received: missed.state };
};

const overDrum = (ctx: ObjectiveContext): Divergence => {
  const budget = ctx.world.vars.cableBudget ?? 0;
  let spent = 0;
  for (const leg of cableLegs(ctx)) {
    spent += leg.amount;
    if (spent <= budget) continue;
    if (leg.from === '' || leg.to === '') break;
    return {
      where: `${leg.from} → ${leg.to}`,
      expected: `${String(budget)} of cable in all`,
      received: `${String(spent)} spent by this one`,
    };
  }
  return {
    where: 'cable spent',
    expected: `at most ${String(budget)}`,
    received: String(cableSpent(ctx)),
  };
};

export const w5_05: LevelDef = {
  id: 'w5-05',
  world: 5,
  index: 5,
  title: 'Blackout',
  hardware: [],
  brief: [
    'We have one drum of cable. Insurance asks which substation would cut off the most if it failed, so they know what to worry about. — M. Vance',
    '',
    '**Join every substation to the reactor with cable, directly or through other substations. Then switch them all on.**',
  ].join('\n'),
  board: {
    redrawn: [
      '10 to 14 substations',
      'where they stand: spread out on some boards, in three groups on others',
    ],
  },
  facts: [
    {
      label: 'Substations',
      value:
        'Ids are `sub-1`, `sub-2`, …; `probe` returns `null` after the last. Probing is free. All start off.',
    },
    { label: 'Reactor', value: 'In the middle, already on.' },
    {
      label: 'Cable',
      value:
        '`link(a, b)` lays one between two machines, from anywhere, for 2 ticks. It uses cable equal to the difference in `x` plus the difference in `y`. It works both ways. Nothing blocks a cable.',
    },
    {
      label: 'Drum',
      value:
        "The reactor's `vars.cableBudget`: always the shortest network that joins everything, plus 8%, rounded up. Laying the same cable twice uses it twice.",
    },
    {
      label: 'Connected',
      value:
        '`power(id, "on")` costs 2 ticks and always works. It counts only if a cable already joins the substation to the reactor, or to a substation that already counts as on. An early call still reads `on` but does not count; call again later.',
    },
    {
      label: 'Weak point',
      value:
        'For the star, print exactly one line `weak <id> <n>`: the substation that, if removed, cuts off the most substations from the reactor, and how many, counting itself. If several tie, any of them is right. It is checked against the network you built. Other lines are not read.',
    },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: 56 },
  build(seed: number): World {
    const { stations, mstWeight: weight, cableBudget } = blackoutPlan(seed);
    const world = createWorld({
      w: WIDTH,
      h: HEIGHT,
      seed,
      fill: Terrain.Floor,
      vars: { mstWeight: weight, cableBudget },
    });

    setTerrain(world, REACTOR_AT, Terrain.Cable);
    addMachine(world, {
      id: 'reactor',
      kind: MachineKind.Node,
      at: REACTOR_AT,
      state: 'on',
      inventory: [],
      vars: { cableBudget },
    });

    stations.forEach((at, index) => {
      setTerrain(world, at, Terrain.Cable);
      addMachine(world, {
        id: `sub-${index + 1}`,
        kind: MachineKind.Node,
        at,
        state: 'off',
        inventory: [],
        vars: {},
      });
    });

    addBot(world, { at: REACTOR_AT, facing: Dir.East, name: 'RIG-01' });
    return world;
  },
  objectives: [
    Objectives.custom(
      'connected',
      'Join every substation to the reactor',
      (ctx) => connectedCount(ctx.world) === substations(ctx.world).length,
      {
        progress: (ctx) => [connectedCount(ctx.world), substations(ctx.world).length],
        divergence: unreached,
      },
    ),
    Objectives.custom(
      'budget',
      'Use no more cable than the drum holds',
      (ctx) => cableSpent(ctx) <= (ctx.world.vars.cableBudget ?? 0),
      {
        progress: (ctx) => {
          const budget = ctx.world.vars.cableBudget ?? 0;
          return [Math.min(cableSpent(ctx), budget), budget];
        },
        divergence: overDrum,
      },
    ),
    Objectives.custom(
      'energised',
      'Switch every substation on after it is connected',
      (ctx) => {
        const stations = substations(ctx.world);
        return (
          liveOrderCount(ctx) === stations.length &&
          stations.every((machine) => machine.state === 'on')
        );
      },
      {
        progress: (ctx) => [liveOrderCount(ctx), substations(ctx.world).length],
        divergence: notLive,
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'name-the-weak-link',
      'Print the weak point of your network',
      (ctx) => {
        const lines = outageReport(ctx);
        const claim = lines.length === 1 ? readClaim(lines[0] as string) : null;
        if (claim === null) return false;
        const { ids, load } = weakestLinks(ctx.world);
        return ids.has(claim.id) && claim.load === load;
      },
      { divergence: misread },
    ),
  ],
  starter: [
    "// import { waves } from 'lib';",
    '// NOTE(4470): the drum runs out before the district does. it always has',
    '// NOTE(4470): a cable between two substations already joined is wasted',
    '',
    "const reactor = probe('reactor');",
    '',
  ].join('\n'),
  hints: [
    'Probe every position first. Planning costs no ticks.',
    'Each cable should join something new to the network.',
    'Grow the network from the reactor. Each time, add the cheapest cable that reaches a substation not yet joined. It may start anywhere on the network.',
    'Switch substations on in the order you joined them.',
    'Remember which substation you joined each new one to. The one with the most substations joined through it is the weak point.',
  ],
  docs: ['probe', 'link', 'power'],
};
