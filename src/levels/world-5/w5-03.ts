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
  createWorld,
  machineById,
  manhattan,
  setTerrain,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { at, firstNotIn } from './objectives.ts';

const WIDTH = 24;
const HEIGHT = 18;
const REACTOR_AT = vec(2, 9);
const PREREQ_PREFIX = 'prereq:';

/**
 * The reactor, then each station once, then the `null` that ends the walk: 18 reads on the
 * widest seed. The star is for holding what came back rather than asking the grid again, and it
 * stays a star — the retry-until-stable loop CURRICULUM.md §7 deliberately lets through is
 * already priced in ticks, and failing it on reads as well would be scoring it twice.
 */
const READ_BUDGET = 20;

export type GraphShape = 'mixed' | 'chain' | 'wide' | 'split';

/**
 * One shape per seed rather than a draw, because CURRICULUM.md §7 names the four cases the seed
 * list has to contain: a deep chain, a wide shallow graph, a station with three prerequisites,
 * and a graph in two disconnected pieces.
 */
const SHAPES: Readonly<Record<number, GraphShape>> = Object.freeze({
  1: 'mixed',
  2: 'chain',
  3: 'wide',
  4: 'split',
});

export function shapeFor(seed: number): GraphShape {
  return SHAPES[seed] ?? 'mixed';
}

const STATION_COUNT: Readonly<Record<GraphShape, number>> = Object.freeze({
  mixed: 10,
  chain: 12,
  wide: 14,
  split: 16,
});

export interface StationPlan {
  id: string;
  at: Vec;
  prereqs: string[];
}

export interface GridPlan {
  shape: GraphShape;
  stations: StationPlan[];
  /** Manhattan length of the nearest-available walk over this DAG. Feeds the bonus threshold. */
  travelBudget: number;
}

function pickDistinct(rng: Rng, pool: readonly string[], n: number): string[] {
  return rng.shuffle(pool).slice(0, Math.min(n, pool.length));
}

function dependencies(rng: Rng, shape: GraphShape, count: number): string[][] {
  const prereqs: string[][] = [];
  const half = Math.floor(count / 2);

  for (let k = 0; k < count; k++) {
    const earlier = Array.from({ length: k }, (_, i) => `sub-${i + 1}`);
    switch (shape) {
      case 'chain':
        prereqs.push([k === 0 ? 'reactor' : `sub-${k}`]);
        break;
      case 'wide':
        if (k < 3) prereqs.push(['reactor']);
        else if (k === 3) prereqs.push(['sub-1', 'sub-2', 'sub-3']);
        else prereqs.push(pickDistinct(rng, ['sub-1', 'sub-2', 'sub-3'], rng.int(1, 2)));
        break;
      case 'split':
        if (k === 0) prereqs.push(['reactor']);
        else if (k < half) prereqs.push(pickDistinct(rng, ['reactor', ...earlier], rng.int(1, 2)));
        else if (k === half) prereqs.push([]);
        else {
          const island = earlier.slice(half);
          prereqs.push(pickDistinct(rng, island, rng.int(1, 2)));
        }
        break;
      case 'mixed':
        prereqs.push(
          k === 0 ? ['reactor'] : pickDistinct(rng, ['reactor', ...earlier], rng.int(1, 2)),
        );
        break;
    }
  }
  return prereqs;
}

/**
 * Hands the ids out in an order the dependencies do not follow.
 *
 * `dependencies` can only point a station at one built before it, so left alone every seed would
 * accept `sub-1, sub-2, … sub-n` as an energisation order and the district would grade counting
 * rather than sorting. The deal is redealt until ascending id order breaks somewhere. The first
 * slot keeps its id, so `sub-1` is always the station wired straight to the reactor and the first
 * thing a run probes shows the `prereq:` form without any hunting.
 */
function relabel(rng: Rng, prereqs: readonly string[][]): string[][] {
  const count = prereqs.length;
  const dealt = (slot: readonly number[]): string[][] => {
    const out: string[][] = Array.from({ length: count }, () => []);
    for (let k = 0; k < count; k++) {
      out[slot[k] ?? k] = (prereqs[k] ?? []).map((id) =>
        id === 'reactor'
          ? id
          : `sub-${String((slot[Number(id.slice('sub-'.length)) - 1] ?? 0) + 1)}`,
      );
    }
    return out;
  };
  const ascendingWorks = (lists: readonly string[][]): boolean =>
    lists.every((list, index) =>
      list.every((id) => id === 'reactor' || Number(id.slice('sub-'.length)) - 1 < index),
    );

  for (let attempt = 0; attempt < 64; attempt++) {
    const out = dealt([0, ...rng.shuffle(Array.from({ length: count - 1 }, (_, i) => i + 1))]);
    if (!ascendingWorks(out)) return out;
  }
  return prereqs.map((list) => list.slice());
}

/**
 * The nearest-available walk: from wherever the crew is standing, go to the closest station whose
 * prerequisites are already done. Ties go to the lower id, in both this and the reference, so the
 * two produce the same number.
 */
export function nearestAvailableWalk(from: Vec, stations: readonly StationPlan[]): number {
  const done = new Set<string>(['reactor']);
  const remaining = stations.slice();
  let at = from;
  let total = 0;

  while (remaining.length > 0) {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const station = remaining[i] as StationPlan;
      if (!station.prereqs.every((id) => done.has(id))) continue;
      const distance = manhattan(at, station.at);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    if (bestIndex < 0) break;
    const chosen = remaining[bestIndex] as StationPlan;
    total += bestDistance;
    at = chosen.at;
    done.add(chosen.id);
    remaining.splice(bestIndex, 1);
  }
  return total;
}

export function gridPlan(seed: number): GridPlan {
  const rng = new Rng(seed * 6151 + 907);
  const shape = shapeFor(seed);
  const count = STATION_COUNT[shape];
  const prereqs = relabel(rng, dependencies(rng, shape, count));

  const taken = new Set<string>([`${REACTOR_AT.x},${REACTOR_AT.y}`]);
  const stations: StationPlan[] = [];
  while (stations.length < count) {
    const at = vec(rng.int(5, WIDTH - 2), rng.int(1, HEIGHT - 2));
    const key = `${at.x},${at.y}`;
    if (taken.has(key)) continue;
    taken.add(key);
    stations.push({
      id: `sub-${stations.length + 1}`,
      at,
      prereqs: prereqs[stations.length] ?? [],
    });
  }

  return { shape, stations, travelBudget: nearestAvailableWalk(REACTOR_AT, stations) };
}

const prereqsOf = (machine: Machine): string[] =>
  Object.keys(machine.vars)
    .filter((key) => key.startsWith(PREREQ_PREFIX))
    .map((key) => key.slice(PREREQ_PREFIX.length));

const substations = (world: World): Machine[] =>
  world.machines.filter((machine) => machine.id.startsWith('sub-'));

function cabledCount(world: World): [number, number] {
  let laid = 0;
  let total = 0;
  for (const station of substations(world)) {
    for (const prereq of prereqsOf(station)) {
      total++;
      if (machineById(world, prereq)?.vars[`link:${station.id}`] === 1) laid++;
    }
  }
  return [laid, total];
}

const byPosition = (world: World): Map<string, string> =>
  new Map(world.machines.map((machine) => [`${machine.at.x},${machine.at.y}`, machine.id]));

/** Successful energisations, in trace order. `power` events name a position, not an id. */
function energisations(ctx: ObjectiveContext): { id: string; t: number }[] {
  const ids = byPosition(ctx.initialWorld);
  const order: { id: string; t: number }[] = [];
  for (const event of ctx.trace.events) {
    if (event.kind !== 'act' || event.name !== 'power' || !event.ok) continue;
    if (event.detail !== 'on' || event.at === undefined) continue;
    const id = ids.get(`${event.at.x},${event.at.y}`);
    if (id !== undefined) order.push({ id, t: event.t });
  }
  return order;
}

/**
 * A station counts as energised in order only if every prerequisite was *already* validly on.
 * A futile call is not punished beyond the two ticks it cost, so the retry-until-stable loop
 * still finishes — it just finishes a long way past par.
 */
function orderedCount(ctx: ObjectiveContext): number {
  const live = new Set<string>(['reactor']);
  const valid = new Set<string>();
  for (const { id } of energisations(ctx)) {
    const machine = machineById(ctx.world, id);
    if (!machine || !machine.id.startsWith('sub-')) continue;
    if (!prereqsOf(machine).every((prereq) => live.has(prereq))) continue;
    live.add(id);
    valid.add(id);
  }
  return valid.size;
}

function travelled(ctx: ObjectiveContext): number {
  let from = machineById(ctx.initialWorld, 'reactor')?.at ?? REACTOR_AT;
  let total = 0;
  for (const { id } of energisations(ctx)) {
    const machine = machineById(ctx.initialWorld, id);
    if (!machine) continue;
    total += manhattan(from, machine.at);
    from = machine.at;
  }
  return total;
}

/** The first prerequisite on the district's own list that no cable was ever run for. */
const missingCable = (ctx: ObjectiveContext): Divergence | undefined => {
  for (const station of substations(ctx.world)) {
    for (const prereq of prereqsOf(station)) {
      if (machineById(ctx.world, prereq)?.vars[`link:${station.id}`] === 1) continue;
      return { where: `${prereq} → ${station.id}`, expected: 'a cable', received: NOTHING };
    }
  }
  return undefined;
};

/**
 * The first station the run brought up while something it waits on was still off.
 *
 * The station's own list of what it waits on is a free read, so naming the one that was not ready
 * hands back the run's own ordering decision rather than the order the district wants.
 *
 * An early call the run later made good is not the fault and is not reported: the objective
 * forgives it, so the retry-until-stable loop CURRICULUM.md §7 lets through is never handed a
 * divergence pointing at its own first pass. Only a station left stranded by one is named.
 */
const poweredEarly = (ctx: ObjectiveContext): Divergence | undefined => {
  const live = new Set<string>(['reactor']);
  const valid = new Set<string>();
  const early: { id: string; t: number; waiting: string }[] = [];
  for (const { id, t } of energisations(ctx)) {
    const machine = machineById(ctx.world, id);
    if (!machine || !machine.id.startsWith('sub-')) continue;
    const waiting = prereqsOf(machine).find((prereq) => !live.has(prereq));
    if (waiting !== undefined) {
      early.push({ id, t, waiting });
      continue;
    }
    live.add(id);
    valid.add(id);
  }
  const stranded = early.find((call) => !valid.has(call.id));
  if (stranded !== undefined) {
    return {
      where: `tick ${String(stranded.t)} · ${stranded.id}`,
      expected: `${stranded.waiting} already on`,
      received: `${stranded.waiting} was still off`,
    };
  }
  const missed = substations(ctx.world).find((machine) => !valid.has(machine.id));
  if (missed === undefined) return undefined;
  const waits = prereqsOf(missed)[0];
  return {
    where: `${missed.id} · ${at(missed.at)}`,
    expected: waits === undefined ? 'brought up' : `brought up after ${waits}`,
    received: 'never brought up',
  };
};

/**
 * The leg of the crew walk on which the allowance ran out.
 *
 * The allowance itself is reported by the reactor, so the number is not news; which pair of
 * stations the walk was crossing when it ran out is. It names no better order, only the point the
 * run's own order stopped fitting.
 */
const walkOverran = (ctx: ObjectiveContext): Divergence => {
  const budget = ctx.world.vars.travelBudget ?? 0;
  let from = machineById(ctx.initialWorld, 'reactor')?.at ?? REACTOR_AT;
  let fromId = 'reactor';
  let total = 0;
  for (const { id } of energisations(ctx)) {
    const machine = machineById(ctx.initialWorld, id);
    if (!machine) continue;
    total += manhattan(from, machine.at);
    from = machine.at;
    if (total > budget) {
      return {
        where: `${fromId} → ${id}`,
        expected: `${String(budget)} steps in all`,
        received: `${String(total)} steps by this leg`,
      };
    }
    fromId = id;
  }
  return {
    where: 'the crew walk',
    expected: `${String(budget)} steps`,
    received: `${String(total)} steps`,
  };
};

/**
 * Par: the reference lays every cable once and energises every station once, so its clock is
 * 2 × (edges + stations) — 76 ticks on the widest seed. Nothing can be skipped, so par is that
 * figure rather than a shave off it.
 */
export const w5_03: LevelDef = {
  id: 'w5-03',
  world: 5,
  index: 3,
  title: 'Order of Operations',
  hardware: ['link'],
  brief: [
    '**MEMO KD-2506**',
    '**FROM:** Dep. Coordinator M. Vance',
    '**RE:** Energisation order',
    '',
    'Substations must be energised in dependency order. Energising a station before its',
    'upstream is not dangerous. It is merely futile, and futility is reportable under the',
    'site metrics framework, which I am measured on.',
    '',
    'Cable the district, then bring every substation up.',
  ].join('\n'),
  /**
   * DESIGN.md §11.10.
   *
   * Two of these lines are guarantees the generator spends real work on, and neither is visible
   * from one board. `relabel` redeals the ids until ascending order stops being a legal
   * energisation order, so "walk the list" is refused on every seed rather than on some of them;
   * and the dependencies only ever point backwards through the deal, so the lists cannot close a
   * circle. A player who does not know the second one writes cycle detection for a graph that will
   * never contain a cycle, and a player who does not know the first has no way to tell whether
   * seed 1 accepted their loop because it was right or because the ids happened to be kind.
   *
   * The shape of the graph is on the redrawn side because it is the anti-hardcode axis
   * (CURRICULUM.md §2.2), and it is a shape rather than a number: one shift is a single deep chain,
   * one is three stations wide and flat, one arrives in two halves that never touch. The count of
   * reads the star allows is on the objective label already, so it is not repeated here.
   */
  board: {
    fixed: [
      'the district is 24 by 18 of open floor — the crew walk between two stations is the difference in `x` plus the difference in `y`',
      'the reactor stands at (2, 9), already on, and RIG-01 starts on it',
      '`sub-1` is the station the reactor feeds',
      'the upstream lists never close a circle',
      'ascending station number is never a legal order to bring the district up in',
    ],
    redrawn: [
      'ten to sixteen stations',
      'where each one stands',
      'the shape of the upstream lists — one deep chain on one shift, one wide flat layer on another, two halves that never touch on another',
      'which station number sits where in that shape',
      'whether any station lists no upstream at all',
      'the crew-walk allowance',
    ],
  },
  facts: [
    {
      label: '`probe(id)`',
      value:
        'Free, and only counted. Substations are `sub-1` upward; past the last one it returns `null`. Nothing rewires itself while you work.',
    },
    {
      label: 'Upstream',
      value:
        'Each station lists what it waits on as `vars` keys of the form `prereq:<id>`. That may be the reactor or another station. Some list none. The numbering says nothing about the order — `sub-2` can wait on `sub-12`.',
    },
    {
      label: 'The cable',
      value: 'For **every** listed prerequisite, run `link(prereqId, stationId)`. 2 ticks each.',
    },
    {
      label: 'Bringing one up',
      value:
        '`power(stationId, "on")`, 2 ticks. The switch always throws — nothing refuses a call made too early, and the station reads `on` afterwards either way. What is graded is the tick you called it at, not the state you read back. A futile call costs the same as a useful one and does no lasting harm: call the station again once its upstream is up and that second call counts.',
    },
    {
      label: 'The crew walk',
      value:
        "The crew starts at the reactor and walks between stations in the order you energise them, and every `power` call is a visit — a futile one and a second call on the same station each add their leg. The reactor reports the allowance in `vars.travelBudget`. It is one good walk's length, not a margin over one.",
    },
    {
      label: 'The Repository',
      value:
        'Nothing here needs it. But keep whatever turns that list into a workable order — later briefs call it `waves`, and expect the groups back.',
    },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: 76 },
  build(seed: number): World {
    const { stations, travelBudget } = gridPlan(seed);
    const edges = stations.reduce((sum, station) => sum + station.prereqs.length, 0);
    const world = createWorld({
      w: WIDTH,
      h: HEIGHT,
      seed,
      fill: Terrain.Floor,
      vars: { travelBudget, stations: stations.length, edges },
    });

    setTerrain(world, REACTOR_AT, Terrain.Cable);
    addMachine(world, {
      id: 'reactor',
      kind: MachineKind.Node,
      at: REACTOR_AT,
      state: 'on',
      inventory: [],
      vars: { travelBudget },
    });

    for (const station of stations) {
      setTerrain(world, station.at, Terrain.Cable);
      const vars: Record<string, number> = {};
      for (const prereq of station.prereqs) vars[`${PREREQ_PREFIX}${prereq}`] = 1;
      addMachine(world, {
        id: station.id,
        kind: MachineKind.Node,
        at: station.at,
        state: 'off',
        inventory: [],
        vars,
      });
    }

    addBot(world, { at: REACTOR_AT, facing: Dir.East, name: 'RIG-01' });
    return world;
  },
  objectives: [
    Objectives.custom(
      'cabled',
      'Run a cable for every prerequisite',
      (ctx) => {
        const [laid, total] = cabledCount(ctx.world);
        return laid === total;
      },
      { progress: (ctx) => cabledCount(ctx.world), divergence: missingCable },
    ),
    Objectives.custom(
      'energised',
      'Leave every substation on',
      (ctx) => {
        const stations = substations(ctx.world);
        return stations.every((machine) => machine.state === 'on');
      },
      {
        progress: (ctx) => [
          substations(ctx.world).filter((machine) => machine.state === 'on').length,
          substations(ctx.world).length,
        ],
        divergence: (ctx) => firstNotIn(substations(ctx.world), 'on'),
      },
    ),
    Objectives.custom(
      'in-order',
      'Energise each station only after its upstream is on',
      (ctx) => orderedCount(ctx) === substations(ctx.world).length,
      {
        progress: (ctx) => [orderedCount(ctx), substations(ctx.world).length],
        divergence: poweredEarly,
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'tight-order',
      'Keep the crew walk inside the reported allowance, in steps',
      (ctx) => travelled(ctx) <= (ctx.world.vars.travelBudget ?? 0),
      {
        /* Unclamped: a walk of 61 against an allowance of 48 has to read as 61, not as 48. */
        progress: (ctx) => [travelled(ctx), ctx.world.vars.travelBudget ?? 0],
        divergence: walkOverran,
      },
    ),
    Objectives.withinSenses('probe', READ_BUDGET, {
      label: `Bring the district up on ${String(READ_BUDGET)} reads or fewer`,
    }),
  ],
  starter: [
    '// NOTE(4470): the cable does not care what order you lay it in. the power does',
    '// NOTE(4470): some stations list no upstream at all. that is not a fault',
    '',
    "const reactor = probe('reactor');",
    '',
  ].join('\n'),
  hints: [
    'Reading the whole district costs nothing. Read all of it before you spend a single tick, and you will know what depends on what.',
    'A station is ready when every machine it lists is already on. At the start, only the reactor is on, so ask which stations are ready right now.',
    'Bringing one station up can make several others ready. Work out what became ready, not what comes next in the list.',
    'Several stations are usually ready at the same moment. Which of them you take next changes nothing about the order being legal, and everything about how far the crew walks.',
  ],
  docs: ['probe', 'link', 'power'],
};
