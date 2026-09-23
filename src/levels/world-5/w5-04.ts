import type { Divergence, Machine, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  CEILING,
  Dir,
  FED_BY,
  MachineKind,
  NOTHING,
  Objectives,
  Rng,
  Terrain,
  addBot,
  addMachine,
  cabledTo,
  clipValue,
  createWorld,
  manhattan,
  setTerrain,
  treeSegments,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { at } from './objectives.ts';

const WIDTH = 26;
const HEIGHT = 20;
const COLUMN_X = [1, 6, 11, 16];
const TAP_X = 16;
const CONSUMER_X: readonly [number, number] = [19, 24];

const BLOCK = 8;
const RESERVE = 8;
const SPLITS: readonly (readonly number[])[] = [
  [8],
  [8],
  [4, 4],
  [4, 2, 2],
  [2, 4, 2],
  [2, 2, 2, 2],
];

export interface YardNode {
  id: string;
  parent: string;
  depth: number;
  at: Vec;
  ceiling: number;
  tap: boolean;
}

export interface YardPlan {
  reactorAt: Vec;
  nodes: YardNode[];
  reserveTap: string;
  draws: number[];
  consumersAt: Vec[];
  planted: string[];
}

interface Sketch {
  id: string;
  parent: string;
  depth: number;
  tap: boolean;
  blocks: number;
  slack: number;
  children: Sketch[];
}

function sketchTree(rng: Rng): Sketch[] {
  const all: Sketch[] = [];
  let junctions = 0;
  let taps = 0;
  const node = (parent: string, depth: number, tap: boolean): Sketch => {
    const id = tap ? `tap-${String(++taps)}` : `junction-${String(++junctions)}`;
    const made: Sketch = { id, parent, depth, tap, blocks: 0, slack: 0, children: [] };
    all.push(made);
    return made;
  };
  const trunks = rng.int(2, 3);
  for (let i = 0; i < trunks; i++) {
    const trunk = node('reactor', 1, false);
    const branches = rng.int(2, 3);
    for (let b = 0; b < branches; b++) {
      if (rng.next() < 0.45) {
        const branch = node(trunk.id, 2, false);
        trunk.children.push(branch);
        const leaves = rng.int(2, 3);
        for (let l = 0; l < leaves; l++) branch.children.push(node(branch.id, 3, true));
      } else {
        trunk.children.push(node(trunk.id, 2, true));
      }
    }
  }
  return all;
}

const blocksUnder = (node: Sketch): number =>
  node.tap ? node.blocks : node.children.reduce((sum, child) => sum + blocksUnder(child), 0);

const ceilingOf = (node: Sketch): number => BLOCK * blocksUnder(node) + node.slack;

function oversubscribe(rng: Rng, all: Sketch[]): void {
  const junctions = all.filter((node) => !node.tap).sort((a, b) => b.depth - a.depth);
  for (let pass = 0; pass < 8; pass++) {
    let settled = true;
    for (const junction of junctions) {
      const below = junction.children.reduce((sum, child) => sum + ceilingOf(child), 0);
      if (below > ceilingOf(junction)) continue;
      settled = false;
      const taps = junction.children.filter((child) => child.tap);
      const pool = taps.length > 0 ? taps : junction.children;
      const pick = pool[rng.int(0, pool.length - 1)] as Sketch;
      pick.slack += BLOCK;
    }
    if (settled) return;
  }
}

interface Room {
  parent: Map<string, string>;
  room: Map<string, number>;
  taps: string[];
}

function roomOf(plan: YardPlan): Room {
  const parent = new Map<string, string>();
  const room = new Map<string, number>();
  for (const node of plan.nodes) {
    parent.set(node.id, node.parent);
    room.set(node.id, node.ceiling);
  }
  return { parent, room, taps: plan.nodes.filter((node) => node.tap).map((node) => node.id) };
}

function routeRoom(state: Room, tap: string): number {
  let least = Number.POSITIVE_INFINITY;
  for (let id: string | undefined = tap; id !== undefined && state.room.has(id);) {
    least = Math.min(least, state.room.get(id) as number);
    id = state.parent.get(id);
  }
  return least;
}

function take(state: Room, tap: string, draw: number): void {
  for (let id: string | undefined = tap; id !== undefined && state.room.has(id);) {
    state.room.set(id, (state.room.get(id) as number) - draw);
    id = state.parent.get(id);
  }
}

type Pick = 'first' | 'tightest' | 'roomiest';

function heaviestFirst(plan: YardPlan): number[] {
  return plan.draws
    .map((_, index) => index)
    .sort((a, b) => (plan.draws[b] as number) - (plan.draws[a] as number));
}

function fitByRoute(plan: YardPlan, pick: Pick, reserve: boolean): Room | null {
  const state = roomOf(plan);
  if (reserve) take(state, plan.reserveTap, RESERVE);
  for (const index of heaviestFirst(plan)) {
    const draw = plan.draws[index] as number;
    const open = state.taps.filter((tap) => routeRoom(state, tap) >= draw);
    if (open.length === 0) return null;
    const rank = (tap: string): number =>
      pick === 'first' ? 0 : pick === 'tightest' ? routeRoom(state, tap) : -routeRoom(state, tap);
    const best = open.reduce((a, b) => (rank(b) < rank(a) ? b : a));
    take(state, best, draw);
  }
  return state;
}

function overloads(plan: YardPlan, placed: readonly string[]): boolean {
  const state = roomOf(plan);
  placed.forEach((tap, index) => take(state, tap, plan.draws[index] as number));
  return [...state.room.values()].some((left) => left < 0);
}

function ownRoomOnly(plan: YardPlan): boolean {
  const own = new Map(plan.nodes.filter((node) => node.tap).map((node) => [node.id, node.ceiling]));
  const placed: string[] = new Array<string>(plan.draws.length).fill('');
  for (const index of heaviestFirst(plan)) {
    const draw = plan.draws[index] as number;
    let best = '';
    for (const [tap, left] of own)
      if (left >= draw && (best === '' || left > (own.get(best) ?? 0))) best = tap;
    if (best === '') return false;
    own.set(best, (own.get(best) as number) - draw);
    placed[index] = best;
  }
  return !overloads(plan, placed);
}

function reportOrder(plan: YardPlan): boolean {
  const state = roomOf(plan);
  take(state, plan.reserveTap, RESERVE);
  for (const draw of plan.draws) {
    const open = state.taps.filter((candidate) => routeRoom(state, candidate) >= draw);
    if (open.length === 0) return false;
    const tap = open.reduce((a, b) => (routeRoom(state, b) > routeRoom(state, a) ? b : a));
    take(state, tap, draw);
  }
  return true;
}

function nearestTap(plan: YardPlan): boolean {
  const taps = plan.nodes.filter((node) => node.tap);
  const placed = plan.consumersAt.map(
    (spot) =>
      taps.reduce((best, tap) => (manhattan(tap.at, spot) < manhattan(best.at, spot) ? tap : best))
        .id,
  );
  return !overloads(plan, placed);
}

function keepsReserve(plan: YardPlan, state: Room): boolean {
  for (let id: string | undefined = plan.reserveTap; id !== undefined && state.room.has(id);) {
    if ((state.room.get(id) as number) < RESERVE) return false;
    id = state.parent.get(id);
  }
  return true;
}

function decides(plan: YardPlan): boolean {
  const picks: Pick[] = ['first', 'tightest', 'roomiest'];
  for (const pick of picks) {
    const honest = fitByRoute(plan, pick, true);
    if (honest === null) return false;
    const careless = fitByRoute(plan, pick, false);
    if (careless === null || keepsReserve(plan, careless)) return false;
  }
  return !ownRoomOnly(plan) && !reportOrder(plan) && !nearestTap(plan);
}

function drawPlan(rng: Rng): YardPlan | null {
  const all = sketchTree(rng);
  const taps = all.filter((node) => node.tap);
  const deep = taps.filter((node) => node.depth === 3);
  if (taps.length < 6 || taps.length > 9 || deep.length === 0) return null;

  const blocks = rng.int(6, 8);
  for (let b = 0; b < blocks; b++) {
    const open = taps.filter((tap) => tap.blocks < 2);
    (open[rng.int(0, open.length - 1)] as Sketch).blocks += 1;
  }
  const reserve = deep[rng.int(0, deep.length - 1)] as Sketch;
  reserve.blocks += 1;
  if (all.some((node) => !node.tap && blocksUnder(node) === 0)) return null;

  for (const node of all) {
    if (node.tap) node.slack = node.blocks === 0 ? BLOCK * rng.int(1, 2) : BLOCK * rng.int(0, 2);
    else if (node.depth === 2) node.slack = rng.next() < 0.5 ? 0 : BLOCK;
  }
  oversubscribe(rng, all);

  const draws: number[] = [];
  const planted: string[] = [];
  for (const tap of taps) {
    const real = tap.blocks - (tap === reserve ? 1 : 0);
    for (let b = 0; b < real; b++) {
      for (const draw of SPLITS[rng.int(0, SPLITS.length - 1)] as number[]) {
        draws.push(draw);
        planted.push(tap.id);
      }
    }
  }
  if (draws.length < 12 || draws.length > 16) return null;
  if (![2, 4, 8].every((size) => draws.includes(size))) return null;

  const order = rng.shuffle(draws.map((_, index) => index));
  const rows = (HEIGHT - 1 - (2 * taps.length - 1)) >> 1;
  const tapY = new Map(taps.map((tap, index) => [tap.id, 1 + rows + index * 2]));
  const yOf = (node: Sketch): number => {
    if (node.tap) return tapY.get(node.id) as number;
    const ys = node.children.map(yOf);
    return Math.round(ys.reduce((sum, y) => sum + y, 0) / ys.length);
  };
  const trunks = all.filter((node) => node.depth === 1);
  const reactorY = Math.round(trunks.map(yOf).reduce((sum, y) => sum + y, 0) / trunks.length);

  const taken = new Set<string>();
  const consumersAt: Vec[] = [];
  while (consumersAt.length < draws.length) {
    const spot = vec(rng.int(CONSUMER_X[0], CONSUMER_X[1]), rng.int(1, HEIGHT - 2));
    const key = `${String(spot.x)},${String(spot.y)}`;
    if (taken.has(key)) continue;
    taken.add(key);
    consumersAt.push(spot);
  }

  return {
    reactorAt: vec(COLUMN_X[0] as number, reactorY),
    nodes: all.map((node) => ({
      id: node.id,
      parent: node.parent,
      depth: node.depth,
      at: vec(node.tap ? TAP_X : (COLUMN_X[node.depth] as number), yOf(node)),
      ceiling: ceilingOf(node),
      tap: node.tap,
    })),
    reserveTap: reserve.id,
    draws: order.map((index) => draws[index] as number),
    consumersAt,
    planted: order.map((index) => planted[index] as string),
  };
}

export function yardPlan(seed: number): YardPlan {
  const rng = new Rng(seed * 3121 + 449);
  for (;;) {
    const plan = drawPlan(rng);
    if (plan !== null && decides(plan)) return plan;
  }
}

const consumers = (world: World): Machine[] =>
  world.machines.filter((machine) => machine.id.startsWith('consumer-'));

const onOneTap = (ends: readonly string[] | undefined): boolean =>
  ends !== undefined && ends.length === 1 && (ends[0] as string).startsWith('tap-');

const placedCount = (world: World): number => {
  const cables = cabledTo(world);
  return consumers(world).filter((consumer) => onOneTap(cables.get(consumer.id))).length;
};

const misplaced = (ctx: ObjectiveContext): Divergence | undefined => {
  const cables = cabledTo(ctx.world);
  for (const consumer of consumers(ctx.world)) {
    const ends = cables.get(consumer.id);
    if (onOneTap(ends)) continue;
    return {
      where: `${consumer.id} · ${at(consumer.at)}`,
      expected: 'exactly 1 tap',
      received: ends === undefined ? NOTHING : clipValue(ends.join(', ')),
    };
  }
  return undefined;
};

const withinCount = (world: World): number =>
  treeSegments(world).filter((segment) => segment.load <= segment.ceiling).length;

function consumersUnder(world: World, id: string): number {
  const parent = new Map(treeSegments(world).map((segment) => [segment.id, segment.parent]));
  const cables = cabledTo(world);
  let count = 0;
  for (const consumer of consumers(world)) {
    for (const end of cables.get(consumer.id) ?? []) {
      for (let node: string | undefined = end; node !== undefined; node = parent.get(node)) {
        if (node !== id) continue;
        count++;
        break;
      }
    }
  }
  return count;
}

const overCeiling = (ctx: ObjectiveContext): Divergence | undefined => {
  const over = treeSegments(ctx.world).find((segment) => segment.load > segment.ceiling);
  if (over === undefined) return undefined;
  return {
    where: `${over.parent} → ${over.id}`,
    expected: `at most ${String(over.ceiling)}`,
    received: `${String(over.load)}, from ${String(consumersUnder(ctx.world, over.id))} consumers`,
  };
};

function reserveRoute(world: World): { reserve: number; route: ReturnType<typeof treeSegments> } {
  const segments = treeSegments(world);
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  const tap = world.machines.find((machine) => typeof machine.vars.reserve === 'number');
  const route: ReturnType<typeof treeSegments> = [];
  for (let node = tap ? byId.get(tap.id) : undefined; node; node = byId.get(node.parent)) {
    route.unshift(node);
  }
  return { reserve: tap?.vars.reserve ?? 0, route };
}

const reserveKept = (ctx: ObjectiveContext): boolean => {
  const { reserve, route } = reserveRoute(ctx.world);
  return route.length > 0 && route.every((segment) => segment.ceiling - segment.load >= reserve);
};

const reserveSpent = (ctx: ObjectiveContext): Divergence | undefined => {
  const { reserve, route } = reserveRoute(ctx.world);
  const short = route.find((segment) => segment.ceiling - segment.load < reserve);
  if (short === undefined) return undefined;
  return {
    where: `${short.parent} → ${short.id}`,
    expected: `${String(reserve)} spare`,
    received: `${String(short.load)} of ${String(short.ceiling)} carried`,
  };
};

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
    'Yard 4 was cabled by a contractor who rated every segment, wrote the ratings on the',
    'segments, and left. Medical has been promised a tap for a unit arriving next week,',
    'and would like it to switch on.',
    '',
    'Put every consumer on a tap. Take no segment over its ceiling.',
  ].join('\n'),
  board: {
    fixed: [
      'yard 4 is 26 by 20 of open floor',
      'the reactor stands at the west wall, and its tree of junctions is already laid and live; it ends in a column of taps',
      'the consumers stand east of the taps',
      'RIG-01 works from the reactor — `link` takes both ends by id, so nothing has to be driven to',
      'every draw is 2, 4 or 8, and every ceiling is a multiple of 8',
      'every junction is rated for less than the segments below it add up to',
      'the reserve is 8, on a tap three segments from the reactor',
      'there is always a way to place every consumer and still leave the reserve its room',
    ],
    redrawn: [
      'the shape of the tree: two or three junctions off the reactor, each splitting two or three ways, some once more',
      'six to nine taps',
      'every ceiling',
      'twelve to sixteen consumers, and which one draws what',
      'which tap carries the reserve',
      'where the consumers stand',
    ],
  },
  facts: [
    {
      label: 'What reports what',
      value:
        '`reactor`, then `junction-1`, `tap-1` and `consumer-1` upward; `probe(id)` is free and returns `null` past the last. Every junction and tap names the one machine above it with a `fed:<id>` key in `vars` and reports `vars.ceiling`, the rating of the segment between the two. Consumers report `vars.draw`.',
    },
    {
      label: '`link(tapId, consumerId)`',
      value:
        'Puts that consumer on that tap. 2 ticks. A consumer takes cable at a tap, never at a junction or the reactor. The tree itself is laid and live already; `power` is not needed.',
    },
    {
      label: 'Load',
      value:
        "A consumer's draw is carried by its tap's segment and by every segment above it, up to the reactor. A segment is over its ceiling when what it carries is more than its `ceiling`.",
    },
    {
      label: 'Cable is permanent',
      value:
        '**It cannot be removed once laid.** A consumer cabled to two taps draws through both, and every consumer must end on exactly one tap and nothing else.',
    },
    {
      label: 'Room is not a fit',
      value:
        'Every segment can still have room left and a consumer find no tap with room all the way up to the reactor. Where the room ends up depends on the order you cable in, as well as where.',
    },
    {
      label: 'The reserve',
      value:
        "One tap reports `vars.reserve`, 8: Medical's unit. For the star, leave at least that much spare on every segment between that tap and the reactor once you are done.",
    },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: 30 },
  build(seed: number): World {
    const plan = yardPlan(seed);
    const world = createWorld({
      w: WIDTH,
      h: HEIGHT,
      seed,
      fill: Terrain.Floor,
      vars: {
        load: plan.draws.reduce((sum, draw) => sum + draw, 0),
        taps: plan.nodes.filter((node) => node.tap).length,
      },
    });

    setTerrain(world, plan.reactorAt, Terrain.Cable);
    addMachine(world, {
      id: 'reactor',
      kind: MachineKind.Node,
      at: plan.reactorAt,
      state: 'on',
      inventory: [],
      vars: {},
    });

    for (const node of plan.nodes) {
      setTerrain(world, node.at, Terrain.Cable);
      addMachine(world, {
        id: node.id,
        kind: MachineKind.Node,
        at: node.at,
        state: 'on',
        inventory: [],
        vars: {
          [CEILING]: node.ceiling,
          [`${FED_BY}${node.parent}`]: 1,
          ...(node.id === plan.reserveTap ? { reserve: RESERVE } : {}),
        },
      });
    }

    plan.draws.forEach((draw, index) => {
      const spot = plan.consumersAt[index] as Vec;
      setTerrain(world, spot, Terrain.Cable);
      addMachine(world, {
        id: `consumer-${String(index + 1)}`,
        kind: MachineKind.Node,
        at: spot,
        state: 'idle',
        inventory: [],
        vars: { draw },
      });
    });

    addBot(world, { at: plan.reactorAt, facing: Dir.East, name: 'RIG-01' });
    return world;
  },
  objectives: [
    Objectives.custom(
      'on-a-tap',
      'Leave every consumer on exactly one tap',
      (ctx) => placedCount(ctx.world) === consumers(ctx.world).length,
      {
        progress: (ctx) => [placedCount(ctx.world), consumers(ctx.world).length],
        divergence: misplaced,
      },
    ),
    Objectives.custom(
      'within-ceiling',
      'Keep every segment at or under its ceiling',
      (ctx) => withinCount(ctx.world) === treeSegments(ctx.world).length,
      {
        progress: (ctx) => [withinCount(ctx.world), treeSegments(ctx.world).length],
        divergence: overCeiling,
      },
    ),
  ],
  bonus: [
    Objectives.custom(
      'reserve-kept',
      "Leave 8 spare on every segment above the reserve's tap",
      reserveKept,
      { divergence: reserveSpent },
    ),
  ],
  starter: [
    '// NOTE(4470): a cable cannot be undone.',
    '// NOTE(4470): the taps are rated. so is everything above them.',
    '',
    'const taps = [];',
    'for (let i = 1; ; i++) {',
    '  const tap = probe(`tap-${i}`);',
    '  if (tap === null) break;',
    '  taps.push(tap);',
    '}',
    '',
  ].join('\n'),
  hints: [
    'Every ceiling, every draw and every `fed:` key is free to read. Work out where each consumer goes before you lay a single cable, because a cable is permanent.',
    'Room at a tap is not room at the reactor. What a tap can still take is the least spare on any segment between it and the reactor, and every consumer you place lowers every one of those.',
    'Small draws placed early break the room up into pieces an 8 no longer fits. Place the heavy ones while the room is still whole.',
    "For the star, count Medical's 8 as already sitting on its tap before you place anything else.",
  ],
  docs: ['probe', 'link'],
};
