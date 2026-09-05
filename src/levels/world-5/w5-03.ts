import type { Machine, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  MachineKind,
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
  const prereqs = dependencies(rng, shape, count);

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
function energisations(ctx: ObjectiveContext): string[] {
  const ids = byPosition(ctx.initialWorld);
  const order: string[] = [];
  for (const event of ctx.trace.events) {
    if (event.kind !== 'act' || event.name !== 'power' || !event.ok) continue;
    if (event.detail !== 'on' || event.at === undefined) continue;
    const id = ids.get(`${event.at.x},${event.at.y}`);
    if (id !== undefined) order.push(id);
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
  for (const id of energisations(ctx)) {
    const machine = machineById(ctx.world, id);
    if (!machine || !machine.id.startsWith('sub-')) continue;
    if (!prereqsOf(machine).every((prereq) => live.has(prereq))) continue;
    live.add(id);
    valid.add(id);
  }
  return valid.size;
}

function travelled(ctx: ObjectiveContext): number {
  let at = machineById(ctx.initialWorld, 'reactor')?.at ?? REACTOR_AT;
  let total = 0;
  for (const id of energisations(ctx)) {
    const machine = machineById(ctx.initialWorld, id);
    if (!machine) continue;
    total += manhattan(at, machine.at);
    at = machine.at;
  }
  return total;
}

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
    '',
    '- Substations are `sub-1` upward. `probe(id)` is free and returns `null` past the last one.',
    '- Each station lists its upstream machines as `vars` keys of the form `prereq:<id>`. An',
    '  upstream may be the reactor or another station. Some list none.',
    '- For **every** listed prerequisite, run `link(prereqId, stationId)`. That is the cable.',
    '- Then run `power(stationId, "on")`. A station only latches once all its prerequisites are',
    '  `on`; one that lists none may come up at any time.',
    '- `link` and `power` cost 2 ticks each, and a futile `power` costs the same as a useful one.',
    '',
    'For the bonus: the crew walks between stations in the order you energise them. The reactor',
    'reports the allowance in `vars.travelBudget` — the sum of the grid distances between',
    'consecutive stations, starting at the reactor.',
    '',
    'For the second bonus: bring the district up on at most 20 reads. A `probe` still costs no',
    'ticks. It is only counted, and the district does not rewire itself while you work — a',
    'station you read twice told you the same thing twice.',
    '',
    '**The Repository.** Nothing here needs it. But whatever turns that prerequisite list into a',
    'workable order is worth keeping; three later briefs ask the same question. Later briefs call',
    'it `waves`. What it should hand back is the groups: everything that can start now, then',
    'everything after those.',
  ].join('\n'),
  seeds: [1, 2, 3, 4],
  par: { ticks: 76, chars: 1250 },
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
      (ctx) => cabledCount(ctx.world),
    ),
    Objectives.custom(
      'energised',
      'Leave every substation on',
      (ctx) => {
        const stations = substations(ctx.world);
        return stations.every((machine) => machine.state === 'on');
      },
      (ctx) => [
        substations(ctx.world).filter((machine) => machine.state === 'on').length,
        substations(ctx.world).length,
      ],
    ),
    Objectives.custom(
      'in-order',
      'Energise each station only after its upstream is on',
      (ctx) => orderedCount(ctx) === substations(ctx.world).length,
      (ctx) => [orderedCount(ctx), substations(ctx.world).length],
    ),
  ],
  bonus: [
    Objectives.custom(
      'tight-order',
      'Keep the crew walk inside the reported allowance',
      (ctx) => travelled(ctx) <= (ctx.world.vars.travelBudget ?? 0),
      (ctx) => {
        const budget = ctx.world.vars.travelBudget ?? 0;
        return [Math.min(travelled(ctx), budget), budget];
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
  ],
  docs: ['probe', 'link', 'power'],
};
