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
const REACTOR_AT = vec(12, 9);
const PREREQ_PREFIX = 'prereq:';
const REACTOR = -1;

const REACH_X = 10.5;
const REACH_Y = 7.6;
const JITTER = 0.3;
const CLEARANCE = 2;
const RELAX_PASSES = 60;
const LAYOUT_TRIES = 200;
const NUMBERING_TRIES = 64;

export type GraphShape = 'mixed' | 'chain' | 'wide' | 'split';

const SHAPES: Readonly<Record<number, GraphShape>> = Object.freeze({
  1: 'mixed',
  2: 'chain',
  3: 'wide',
  4: 'split',
});

export function shapeFor(seed: number): GraphShape {
  return SHAPES[seed] ?? 'mixed';
}

export interface StationPlan {
  id: string;
  at: Vec;
  prereqs: string[];
  wave: number;
}

export interface GridPlan {
  shape: GraphShape;
  stations: StationPlan[];
}

interface Draft {
  prereqs: number[];
  wave: number;
  group: number;
}

interface Branch {
  sizes: readonly number[];
  rooted: boolean;
  parents: readonly [number, number];
  joinChance: number;
  strands?: boolean;
}

const BRANCHES: Readonly<Record<GraphShape, readonly Branch[]>> = Object.freeze({
  mixed: [{ sizes: [3, 3, 2, 2], rooted: true, parents: [1, 2], joinChance: 0.5 }],
  chain: [{ sizes: [3, 3, 3, 3], rooted: true, parents: [1, 1], joinChance: 0.25, strands: true }],
  wide: [{ sizes: [3, 11], rooted: true, parents: [1, 2], joinChance: 0.3 }],
  split: [
    { sizes: [2, 3, 3], rooted: true, parents: [1, 2], joinChance: 0.4 },
    { sizes: [1, 3, 2, 2], rooted: false, parents: [1, 2], joinChance: 0.4 },
  ],
});

function pickDistinct<T>(rng: Rng, pool: readonly T[], n: number): T[] {
  return rng.shuffle(pool).slice(0, Math.min(n, pool.length));
}

function grow(rng: Rng, shape: GraphShape): Draft[] {
  const drafts: Draft[] = [];
  BRANCHES[shape].forEach((branch, group) => {
    const byWave: number[][] = [];
    branch.sizes.forEach((size, depth) => {
      const wave = depth + 1;
      const previous = byWave[depth - 1] ?? [];
      const shallower = [...(branch.rooted ? [REACTOR] : []), ...byWave.slice(0, -1).flat()];
      const members: number[] = [];
      for (let j = 0; j < size; j++) {
        let prereqs: number[];
        if (wave === 1) prereqs = branch.rooted ? [REACTOR] : [];
        else {
          const [least, most] = branch.parents;
          prereqs = branch.strands
            ? [previous[j % previous.length] as number]
            : pickDistinct(
                rng,
                previous,
                j === 0 && shape === 'wide' ? previous.length : rng.int(least, most),
              );
          if (shallower.length > 0 && rng.chance(branch.joinChance))
            prereqs.push(rng.pick(shallower));
        }
        members.push(drafts.length);
        drafts.push({ prereqs, wave, group });
      }
      byWave.push(members);
    });
  });
  return drafts;
}

function rings(drafts: readonly Draft[]): number[] {
  const ring: number[] = drafts.map(() => 0);
  drafts.forEach((draft, index) => {
    const inner = draft.prereqs.map((id) => (id === REACTOR ? 0 : (ring[id] ?? 0)));
    ring[index] = 1 + (inner.length === 0 ? 0 : Math.min(...inner));
  });
  return ring;
}

const turn = (angle: number): number => {
  const full = Math.PI * 2;
  return ((angle % full) + full) % full;
};

function spread(targets: readonly number[], gap: number): number[] {
  const order = targets.map((angle, index) => ({ angle: turn(angle), index }));
  order.sort((a, b) => a.angle - b.angle);
  for (let pass = 0; pass < RELAX_PASSES && order.length > 1; pass++) {
    for (let i = 0; i < order.length; i++) {
      const here = order[i] as { angle: number };
      const next = order[(i + 1) % order.length] as { angle: number };
      const apart = turn(next.angle - here.angle);
      if (apart >= gap) continue;
      const push = (gap - apart) / 2;
      here.angle -= push;
      next.angle += push;
    }
  }
  const angles: number[] = targets.map(() => 0);
  for (const { angle, index } of order) angles[index] = angle;
  return angles;
}

function layout(rng: Rng, drafts: readonly Draft[]): Vec[] | null {
  const ring = rings(drafts);
  const deepest = Math.max(...ring);
  const reach = (level: number): number => (level + 1) / (deepest + 1);
  const angle: number[] = drafts.map(() => 0);
  const spots: Vec[] = drafts.map(() => REACTOR_AT);
  const offset = rng.next() * Math.PI * 2;

  for (let level = 1; level <= deepest; level++) {
    const onRing = drafts.map((_, index) => index).filter((index) => ring[index] === level);
    const members = level === 1 ? rng.shuffle(onRing) : onRing;
    const targets = members.map((index, slot) => {
      const inner = (drafts[index] as Draft).prereqs.filter(
        (id) => id !== REACTOR && ring[id] === level - 1,
      );
      if (inner.length === 0)
        return offset + ((slot + rng.next() * 0.5) * Math.PI * 2) / members.length;
      const x = inner.reduce((sum, id) => sum + Math.cos(angle[id] ?? 0), 0);
      const y = inner.reduce((sum, id) => sum + Math.sin(angle[id] ?? 0), 0);
      return Math.atan2(y, x) + (rng.next() - 0.5) * 0.4;
    });
    const arc = Math.PI * reach(level) * (REACH_X + REACH_Y);
    const gap = Math.min((Math.PI * 2) / members.length, (Math.PI * 2 * CLEARANCE * 1.4) / arc);
    spread(targets, gap).forEach((theta, slot) => {
      const index = members[slot] as number;
      angle[index] = theta;
      const r = reach(level) + ((rng.next() * 2 - 1) * JITTER) / (deepest + 1);
      spots[index] = vec(
        Math.round(REACTOR_AT.x + Math.cos(theta) * REACH_X * r),
        Math.round(REACTOR_AT.y + Math.sin(theta) * REACH_Y * r),
      );
    });
  }

  const placed = [REACTOR_AT, ...spots];
  for (let i = 0; i < placed.length; i++) {
    const here = placed[i] as Vec;
    if (here.x < 1 || here.y < 1 || here.x > WIDTH - 2 || here.y > HEIGHT - 2) return null;
    for (let j = i + 1; j < placed.length; j++) {
      const there = placed[j] as Vec;
      if (Math.max(Math.abs(here.x - there.x), Math.abs(here.y - there.y)) < CLEARANCE) return null;
    }
  }
  return spots;
}

function numbered(rng: Rng, drafts: readonly Draft[], spots: readonly Vec[]): StationPlan[] {
  const first = drafts.findIndex(
    (draft) => draft.prereqs.length === 1 && draft.prereqs[0] === REACTOR,
  );
  const rest = rng.shuffle(drafts.map((_, index) => index).filter((index) => index !== first));
  const order = [first, ...rest];
  const idOf = (index: number): string =>
    index === REACTOR ? 'reactor' : `sub-${String(order.indexOf(index) + 1)}`;
  return order.map((index) => {
    const draft = drafts[index] as Draft;
    return {
      id: idOf(index),
      at: spots[index] as Vec,
      prereqs: draft.prereqs.map(idOf),
      wave: draft.wave,
    };
  });
}

const stationNumber = (id: string): number => Number(id.slice('sub-'.length));

export function stationWaves(
  stations: readonly { id: string; prereqs: readonly string[] }[],
): Map<string, number> {
  const wave = new Map<string, number>([['reactor', 0]]);
  const left = stations.slice();
  while (left.length > 0) {
    const ready = left.filter((station) => station.prereqs.every((id) => wave.has(id)));
    if (ready.length === 0) break;
    for (const station of ready) {
      wave.set(station.id, 1 + Math.max(0, ...station.prereqs.map((id) => wave.get(id) ?? 0)));
      left.splice(left.indexOf(station), 1);
    }
  }
  return wave;
}

export function shortestDepths(stations: readonly StationPlan[]): Map<string, number> {
  const depth = new Map<string, number>([['reactor', 0]]);
  const left = stations.slice();
  while (left.length > 0) {
    const ready = left.filter((station) => station.prereqs.every((id) => depth.has(id)));
    if (ready.length === 0) break;
    for (const station of ready) {
      const reached = station.prereqs.map((id) => depth.get(id) ?? 0);
      depth.set(station.id, 1 + (reached.length === 0 ? 0 : Math.min(...reached)));
      left.splice(left.indexOf(station), 1);
    }
  }
  return depth;
}

type Choose = (ready: readonly StationPlan[], at: Vec) => StationPlan;

function oneAtATime(stations: readonly StationPlan[], choose: Choose): string[] {
  const done = new Set<string>(['reactor']);
  const left = stations.slice();
  const order: string[] = [];
  let at = REACTOR_AT;
  while (left.length > 0) {
    const ready = left.filter((station) => station.prereqs.every((id) => done.has(id)));
    if (ready.length === 0) break;
    const chosen = choose(ready, at);
    order.push(chosen.id);
    done.add(chosen.id);
    at = chosen.at;
    left.splice(left.indexOf(chosen), 1);
  }
  return order;
}

const lowestId: Choose = (ready) =>
  ready.reduce((best, station) =>
    stationNumber(station.id) < stationNumber(best.id) ? station : best,
  );

const nearest =
  (preferHigher: boolean): Choose =>
  (ready, at) =>
    ready.reduce((best, station) => {
      const gap = manhattan(at, station.at) - manhattan(at, best.at);
      if (gap !== 0) return gap < 0 ? station : best;
      return stationNumber(station.id) > stationNumber(best.id) === preferHigher ? station : best;
    });

export const lowestIdOrder = (stations: readonly StationPlan[]): string[] =>
  oneAtATime(stations, lowestId);

export const nearestReadyOrder = (
  stations: readonly StationPlan[],
  preferHigher = false,
): string[] => oneAtATime(stations, nearest(preferHigher));

export type Measure = 'euclidean' | 'manhattan' | 'x';

const MEASURES: readonly Measure[] = ['euclidean', 'manhattan', 'x'];

const measured = (measure: Measure, at: Vec): number => {
  const dx = at.x - REACTOR_AT.x;
  const dy = at.y - REACTOR_AT.y;
  if (measure === 'x') return at.x;
  return measure === 'euclidean' ? Math.hypot(dx, dy) : Math.abs(dx) + Math.abs(dy);
};

export function sortedOrder(
  stations: readonly StationPlan[],
  measure: Measure,
  preferHigher = false,
): string[] {
  const tie = preferHigher ? -1 : 1;
  return stations
    .slice()
    .sort(
      (a, b) =>
        measured(measure, a.at) - measured(measure, b.at) ||
        tie * (stationNumber(a.id) - stationNumber(b.id)),
    )
    .map((station) => station.id);
}

export function keepsWaves(order: readonly string[], waves: ReadonlyMap<string, number>): boolean {
  for (let i = 1; i < order.length; i++) {
    if ((waves.get(order[i - 1] as string) ?? 0) > (waves.get(order[i] as string) ?? 0))
      return false;
  }
  return true;
}

const ascendingIsLegal = (stations: readonly StationPlan[]): boolean =>
  stations.every((station) =>
    station.prereqs.every(
      (id) => id === 'reactor' || stationNumber(id) < stationNumber(station.id),
    ),
  );

const hasJoin = (stations: readonly StationPlan[]): boolean => {
  const shortest = shortestDepths(stations);
  return stations.some((station) => (shortest.get(station.id) ?? 0) < station.wave);
};

function forcesWaves(stations: readonly StationPlan[]): boolean {
  const waves = stationWaves(stations);
  if (ascendingIsLegal(stations)) return false;
  if (keepsWaves(lowestIdOrder(stations), waves)) return false;
  if (keepsWaves(nearestReadyOrder(stations, false), waves)) return false;
  if (keepsWaves(nearestReadyOrder(stations, true), waves)) return false;
  for (const measure of MEASURES) {
    for (const preferHigher of [false, true]) {
      if (keepsWaves(sortedOrder(stations, measure, preferHigher), waves)) return false;
    }
  }
  return hasJoin(stations);
}

export function gridPlan(seed: number): GridPlan {
  const rng = new Rng(seed * 6151 + 907);
  const shape = shapeFor(seed);
  let stations: StationPlan[] = [];
  for (let attempt = 0; attempt < LAYOUT_TRIES; attempt++) {
    const drafts = grow(rng, shape);
    const spots = layout(rng, drafts);
    if (spots === null) continue;
    for (let tries = 0; tries < NUMBERING_TRIES; tries++) {
      stations = numbered(rng, drafts, spots);
      if (forcesWaves(stations)) return { shape, stations };
    }
  }
  return { shape, stations };
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

const missingCable = (ctx: ObjectiveContext): Divergence | undefined => {
  for (const station of substations(ctx.world)) {
    for (const prereq of prereqsOf(station)) {
      if (machineById(ctx.world, prereq)?.vars[`link:${station.id}`] === 1) continue;
      return { where: `${prereq} → ${station.id}`, expected: 'a cable', received: NOTHING };
    }
  }
  return undefined;
};

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

function waveBreach(ctx: ObjectiveContext): { id: string; t: number; behind: Machine } | undefined {
  const stations = substations(ctx.initialWorld);
  const waves = stationWaves(
    stations.map((machine) => ({ id: machine.id, prereqs: prereqsOf(machine) })),
  );
  const waveOf = (id: string): number => waves.get(id) ?? 0;
  const shallowFirst = stations
    .slice()
    .sort((a, b) => waveOf(a.id) - waveOf(b.id) || stationNumber(a.id) - stationNumber(b.id));
  const up = new Set<string>(['reactor']);
  for (const { id, t } of energisations(ctx)) {
    const machine = machineById(ctx.initialWorld, id);
    if (!machine || !machine.id.startsWith('sub-')) continue;
    const behind = shallowFirst.find(
      (station) => waveOf(station.id) < waveOf(id) && !up.has(station.id),
    );
    if (behind !== undefined) return { id, t, behind };
    if (prereqsOf(machine).every((prereq) => up.has(prereq))) up.add(id);
  }
  return undefined;
}

function upInWaves(ctx: ObjectiveContext): Set<string> {
  const up = new Set<string>(['reactor']);
  for (const { id } of energisations(ctx)) {
    const machine = machineById(ctx.initialWorld, id);
    if (!machine || !machine.id.startsWith('sub-')) continue;
    if (prereqsOf(machine).every((prereq) => up.has(prereq))) up.add(id);
  }
  return up;
}

const outOfWave = (ctx: ObjectiveContext): Divergence | undefined => {
  const waves = stationWaves(
    substations(ctx.initialWorld).map((machine) => ({
      id: machine.id,
      prereqs: prereqsOf(machine),
    })),
  );
  const breach = waveBreach(ctx);
  if (breach !== undefined) {
    return {
      where: `tick ${String(breach.t)} · ${breach.id}, wave ${String(waves.get(breach.id) ?? 0)}`,
      expected: `wave ${String(waves.get(breach.behind.id) ?? 0)} all up`,
      received: `${breach.behind.id} still off`,
    };
  }
  const up = upInWaves(ctx);
  const missed = substations(ctx.world).find((machine) => !up.has(machine.id));
  if (missed === undefined) return undefined;
  return {
    where: `${missed.id} · ${at(missed.at)}`,
    expected: `up in wave ${String(waves.get(missed.id) ?? 0)}`,
    received: 'never brought up',
  };
};

export const w5_03: LevelDef = {
  id: 'w5-03',
  world: 5,
  index: 3,
  title: 'Order of Operations',
  hardware: ['link'],
  brief: [
    '**MEMO KD-2506**',
    '**FROM:** Dep. Coordinator M. Vance\\',
    '**RE:** Energisation order',
    '',
    'A substation brought up early is not dangerous, merely futile, and futility is',
    'reportable under the site metrics framework, which I am measured on. The crew rota',
    'also goes out by wave, and a crew called before its wave bills standing time.',
    '',
    'Cable the district, then bring every substation up.',
  ].join('\n'),
  board: {
    fixed: [
      'the district is 24 by 18 of open floor',
      'the reactor stands at the centre, (12, 9), already on, and RIG-01 starts on it',
      '`sub-1` waits on the reactor alone',
      'the upstream lists never close a circle',
      'each station stands on a rough ring around the reactor — the fewer cables on its shortest way in, the closer the ring; a station that lists nothing stands on the first',
      'every listed prerequisite is drawn on the board as a cable from the start',
      'ascending station number is never a legal order to bring the district up in',
    ],
    redrawn: [
      'ten to sixteen stations',
      'the shape of the upstream lists — three strands side by side on one shift, one wide flat layer on another, two halves that never touch on another',
      'how many waves deep the district runs, and how many stations each wave holds',
      'which station number sits where in that shape',
      'where on its ring each station stands, and how far off the ring line',
      'whether any station lists no upstream at all',
    ],
  },
  facts: [
    {
      label: '`probe(id)`',
      value:
        'Free. Substations are `sub-1` upward; past the last one it returns `null`. Nothing rewires itself while you work.',
    },
    {
      label: 'Upstream',
      value:
        'Each station lists what it waits on as `vars` keys of the form `prereq:<id>`. That may be the reactor or another station. Some list none. The numbering says nothing about the order — `sub-2` can wait on `sub-12`.',
    },
    {
      label: 'The cable',
      value:
        'For **every** listed prerequisite, run `link(prereqId, stationId)`. 2 ticks each. The board draws every listed cable from the start, dim; it turns solid once laid, and lights once both ends are up.',
    },
    {
      label: 'Bringing one up',
      value:
        '`power(stationId, "on")`, 2 ticks. The switch always throws — nothing refuses a call made too early, and the station reads `on` afterwards either way. What is graded is the tick you called it at, not the state you read back. A futile call costs the same as a useful one and does no lasting harm: call the station again once its upstream is up and that second call counts. On the board a station switched on too early stays dark inside a red ring.',
    },
    {
      label: 'Waves',
      value:
        'Wave 1 is every station that is ready at the start: it lists only the reactor, or nothing at all. Every other station is one wave past the **deepest** thing it lists, so a station listing the reactor and a wave 2 station is wave 3, not wave 1. The ring a station stands on is not its wave. One wave at a time means no `power` call on a station while any station of an earlier wave is not yet up. The order inside a wave is free.',
    },
    {
      label: 'The Repository',
      value:
        'Keep whatever turns those lists into waves — later briefs call it `waves`, and expect the groups back, wave 1 first.',
    },
  ],
  seeds: [1, 2, 3, 4],
  par: { ticks: 80 },
  build(seed: number): World {
    const { stations } = gridPlan(seed);
    const edges = stations.reduce((sum, station) => sum + station.prereqs.length, 0);
    const world = createWorld({
      w: WIDTH,
      h: HEIGHT,
      seed,
      fill: Terrain.Floor,
      vars: { stations: stations.length, edges },
    });

    setTerrain(world, REACTOR_AT, Terrain.Cable);
    addMachine(world, {
      id: 'reactor',
      kind: MachineKind.Node,
      at: REACTOR_AT,
      state: 'on',
      inventory: [],
      vars: {},
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
      'one-wave-at-a-time',
      'Bring the district up one wave at a time',
      (ctx) => {
        if (waveBreach(ctx) !== undefined) return false;
        const up = upInWaves(ctx);
        return substations(ctx.world).every((machine) => up.has(machine.id));
      },
      { divergence: outOfWave },
    ),
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
    'A station is ready when every machine it lists is already on. At the start only the reactor is on, so gather every station that is ready right now, not just the first one you find.',
    'Bring up everything you gathered before you look again. Then gather whatever is ready now. Each gathering is one wave.',
    'A station that lists something shallow and something deep waits for the deep one. How close it stands to the reactor says nothing about which wave it is in.',
  ],
  docs: ['probe', 'link', 'power'],
};
