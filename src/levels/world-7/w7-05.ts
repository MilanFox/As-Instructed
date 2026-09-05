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
  machineById,
  manhattan,
  setTerrain,
  tileAt,
  vec,
} from '../../engine/index.ts';
import type { LevelDef } from '../types.ts';
import { idleTicks, localSeed } from './shared.ts';

const WIDTH = 36;
const HEIGHT = 28;
const MUSTER_X = 2;
const SITE_PREFIX = 'site-';

export interface Detail {
  scouts: number;
  workers: number;
  sites: number;
  blobs: number;
}

/**
 * Seed 1 is the teaching instance: one scout, four workers, a field with little in it. Seeds 3
 * and 4 field two scouts, so anything that assumes a single producer on the channel breaks
 * there. Seed 5 is the same site count as seed 4 against half the fleet.
 */
const DETAILS: Readonly<Record<number, Detail>> = Object.freeze({
  1: { scouts: 1, workers: 4, sites: 6, blobs: 12 },
  2: { scouts: 1, workers: 6, sites: 7, blobs: 18 },
  3: { scouts: 2, workers: 5, sites: 8, blobs: 22 },
  4: { scouts: 2, workers: 8, sites: 9, blobs: 26 },
  5: { scouts: 1, workers: 4, sites: 9, blobs: 20 },
});

function detailFor(seed: number): Detail {
  return DETAILS[seed] ?? { scouts: 1, workers: 5, sites: 7, blobs: 18 };
}

const key = (at: Vec): string => `${String(at.x)},${String(at.y)}`;

function walkable(world: World, at: Vec): boolean {
  return tileAt(world, at)?.terrain === Terrain.Floor;
}

/** Floor tiles reachable from `from`, as a set of keys. Used to seal pockets and to place sites. */
function reachable(world: World, from: Vec): Map<string, number> {
  const cost = new Map<string, number>([[key(from), 0]]);
  const queue: Vec[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as Vec;
    const here = cost.get(key(at)) ?? 0;
    for (const next of [
      vec(at.x + 1, at.y),
      vec(at.x - 1, at.y),
      vec(at.x, at.y + 1),
      vec(at.x, at.y - 1),
    ]) {
      if (!walkable(world, next) || cost.has(key(next))) continue;
      cost.set(key(next), here + 1);
      queue.push(next);
    }
  }
  return cost;
}

const siteMachines = (world: World): Machine[] =>
  world.machines.filter((machine) => machine.id.startsWith(SITE_PREFIX));

const litCount = (world: World): number =>
  siteMachines(world).filter((machine) => machine.state === 'on').length;

/** Ids the brief calls workers: everything after the scouts, in ascending order. */
export function workerIds(world: World): number[] {
  const scouts = world.vars.scouts ?? 1;
  return world.bots.map((bot) => bot.id).filter((id) => id >= scouts);
}

interface Orders {
  ordered: number;
  switched: number;
  /** The first site switched on by a bot with no order it had read by its own clock. */
  jumped?: { botId: number; t: number; told: number | undefined };
}

/**
 * Every site that came up, came up under orders.
 *
 * Counted off the trace rather than the final world, because the final world cannot tell the
 * difference between a fleet that was dispatched and a fleet that all went looking. A bot may
 * switch a site on only if, by its own clock, it had already read a message somebody else sent
 * it — which is the whole content of the level.
 */
function readOrders(ctx: ObjectiveContext): Orders {
  const briefed = new Map<number, number>();
  const sites = new Set(siteMachines(ctx.initialWorld).map((machine) => key(machine.at)));
  const out: Orders = { ordered: 0, switched: 0 };
  for (const event of ctx.trace.events) {
    if (event.kind === 'recv' && event.from !== null && event.from !== event.botId) {
      if (!briefed.has(event.botId)) briefed.set(event.botId, event.t);
      continue;
    }
    if (event.kind !== 'use' || !event.ok || !sites.has(key(event.at))) continue;
    out.switched++;
    const told = briefed.get(event.botId);
    if (told !== undefined && told <= event.t) {
      out.ordered++;
      continue;
    }
    if (out.jumped === undefined) out.jumped = { botId: event.botId, t: event.t, told };
  }
  return out;
}

function underOrders(ctx: ObjectiveContext): [number, number] {
  const orders = readOrders(ctx);
  return [orders.ordered, Math.max(orders.switched, siteMachines(ctx.initialWorld).length)];
}

/**
 * How near the fleet ever got to one site: never came, stood on it and left it alone, or switched
 * it on and switched it straight back off again.
 */
function reach(ctx: ObjectiveContext, siteId: string, at: Vec): string {
  let stood = false;
  for (const event of ctx.trace.events) {
    if (event.kind === 'use' && event.ok && event.machineId === siteId) {
      return 'switched on and off again';
    }
    if (event.kind === 'move' && event.ok && event.to.x === at.x && event.to.y === at.y) {
      stood = true;
    }
  }
  return stood ? 'reached but not switched on' : 'never reached';
}

/**
 * The first site still cold, and how close the fleet ever got to it.
 *
 * The tile is deliberately absent. The sites are on no plan and `probe()` with no argument is the
 * only thing on this level that finds one, so a coordinate would not be a diff — it would be the
 * search. What the report gives instead is the one thing the program could not observe: whether
 * anybody ever stood there.
 */
function coldSite(ctx: ObjectiveContext): Divergence | undefined {
  const sites = siteMachines(ctx.initialWorld);
  if (sites.length === 0) {
    return { where: 'the north workings', expected: 'a relay site', received: 'none on the plan' };
  }
  for (const site of sites) {
    if (machineById(ctx.world, site.id)?.state === 'on') continue;
    return {
      where: site.id,
      expected: 'on',
      received: `cold, ${reach(ctx, site.id, site.at)}`,
    };
  }
  return undefined;
}

/**
 * The first site switched on by a bot that had not read an order yet, with both ticks.
 *
 * A run that simply never reached every site has no such moment, so it gets the count instead:
 * the question of who was told what does not arise until the sites are up.
 */
function firstUnordered(ctx: ObjectiveContext): Divergence {
  const orders = readOrders(ctx);
  const jumped = orders.jumped;
  if (jumped !== undefined) {
    return {
      where: `bot #${String(jumped.botId)} · tick ${String(jumped.t)}`,
      expected: 'an order read before this',
      received:
        jumped.told === undefined
          ? 'no order all shift'
          : `first order at tick ${String(jumped.told)}`,
    };
  }
  const total = Math.max(orders.switched, siteMachines(ctx.initialWorld).length);
  return {
    where: 'the relay sites',
    expected: `all ${String(total)} switched on under orders`,
    received: `${String(orders.ordered)} of ${String(total)}`,
  };
}

/**
 * How long the workers stood about, and which one stood about longest.
 *
 * Waiting is the cost this bonus is named for and it is invisible from inside the program: a bot
 * blocked on `sync` looks the same as a bot walking. The fleet total is what the objective grades,
 * and the worst single bot is where a fix would start.
 */
function idleWorkers(ctx: ObjectiveContext): Divergence {
  const ids = workerIds(ctx.initialWorld);
  const span = ctx.trace.endTick * ids.length;
  if (span === 0) {
    return {
      where: 'the workers',
      expected: 'a shift with work in it',
      received: `the run ended at tick ${String(ctx.trace.endTick)}`,
    };
  }
  const idle = idleTicks(ctx.trace.events, new Set(ids));
  let worst = ids[0] as number;
  let worstIdle = -1;
  for (const id of ids) {
    const own = idleTicks(ctx.trace.events, new Set([id]));
    if (own <= worstIdle) continue;
    worstIdle = own;
    worst = id;
  }
  return {
    where: `bot #${String(worst)} waited longest`,
    expected: `under ${String(Math.ceil(span * 0.1))} idle ticks in all`,
    received: `${String(idle)} in all, ${String(worstIdle)} on this bot`,
  };
}

function progress(ctx: ObjectiveContext): [number, number] {
  return [litCount(ctx.world), siteMachines(ctx.initialWorld).length];
}

/**
 * Par: measured from the reference, which keeps every bot looking at something until an order
 * arrives and routes over the shared picture the fleet has built. That lands between 67 and 100
 * ticks across the five seeds, and par is the worst of them because every seed has to clear it.
 * A fleet that finishes exploring before it starts working takes roughly twice as long.
 */
export const w7_05: LevelDef = {
  id: 'w7-05',
  world: 7,
  index: 5,
  title: 'Chain of Command',
  hardware: [],
  brief: [
    '**MEMO KD-2731**',
    '**FROM:** Dep. Coordinator M. Vance',
    '**RE:** Conclusion of previous engagement',
    '',
    'The relay sites in the north workings are not on any plan. They were put in by somebody who',
    'did not file, and they are still running. Field Engineering have declined to assist and',
    'have not given a reason. Dot does give reasons.',
    '',
    'Bring every relay site up. No bot may bring up a site it was not sent to.',
  ].join('\n'),
  facts: [
    { label: 'Your score', value: 'The clock stops when the **last** bot stops.' },
    {
      label: 'A site is up',
      value: 'When its state is `on`. Stand on it and `use()` once. Twice puts it back to `cold`.',
    },
    {
      label: 'Finding one',
      value:
        'The sites are not listed. `probe()` with **no argument** reports the machine under or ahead of the bot, and that is the only way to find one.',
    },
    {
      label: 'The muster',
      value: "`probe('muster')` publishes `vars.sites`, `vars.scouts` and `vars.workers`.",
    },
    {
      label: 'Scouts',
      value:
        'The first `scouts` bot ids. The rest are workers. They are identical machines; the difference is what you do with them.',
    },
    {
      label: 'Sent to',
      value:
        "Before a bot uses a site it must already have read a message another bot sent it. `send` stamps the sender's clock, and a bot running behind sees an empty inbox.",
    },
    {
      label: 'Seeing',
      value:
        '`look(dir, range)` is free and stops at the first thing it cannot see through. A bot only knows what it has seen.',
    },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: 100 },
  budget: { maxTicks: 6000 },
  build(seed: number): World {
    const detail = detailFor(seed);
    const rng = new Rng(localSeed(seed) + 733);
    const world = createWorld({
      w: WIDTH,
      h: HEIGHT,
      seed,
      fill: Terrain.Floor,
      vars: { seed, scouts: detail.scouts, workers: detail.workers },
    });

    for (let y = 0; y < HEIGHT; y++) {
      setTerrain(world, vec(0, y), Terrain.Wall);
      setTerrain(world, vec(WIDTH - 1, y), Terrain.Wall);
    }
    for (let x = 0; x < WIDTH; x++) {
      setTerrain(world, vec(x, 0), Terrain.Wall);
      setTerrain(world, vec(x, HEIGHT - 1), Terrain.Wall);
    }

    // Blobs of standing rock in an otherwise open field. They are what makes a `look` ray stop,
    // and so what makes standing somewhere worth anything.
    for (let i = 0; i < detail.blobs; i++) {
      const w = rng.int(2, 5);
      const h = rng.int(2, 4);
      const x0 = rng.int(6, WIDTH - 2 - w);
      const y0 = rng.int(2, HEIGHT - 2 - h);
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) setTerrain(world, vec(x, y), Terrain.Rock);
      }
    }

    const muster = vec(MUSTER_X, 2);
    for (let y = 2; y < 2 + detail.scouts + detail.workers; y++) {
      setTerrain(world, vec(MUSTER_X, y), Terrain.Floor);
      setTerrain(world, vec(MUSTER_X + 1, y), Terrain.Floor);
    }

    const open = reachable(world, muster);
    for (let y = 1; y < HEIGHT - 1; y++) {
      for (let x = 1; x < WIDTH - 1; x++) {
        const at = vec(x, y);
        if (walkable(world, at) && !open.has(key(at))) setTerrain(world, at, Terrain.Rock);
      }
    }

    const candidates = [...reachable(world, muster).entries()]
      .filter(([, distance]) => distance >= 14)
      .map(([id]) => {
        const [x, y] = id.split(',').map(Number);
        return vec(x as number, y as number);
      });
    const pool = rng.shuffle(candidates);
    const placed: Vec[] = [];
    for (const at of pool) {
      if (placed.length >= detail.sites) break;
      if (placed.some((other) => manhattan(other, at) < 7)) continue;
      placed.push(at);
    }
    placed.forEach((at, index) => {
      addMachine(world, {
        id: `${SITE_PREFIX}${String(index)}`,
        kind: MachineKind.Node,
        at,
        state: 'cold',
        inventory: [],
        vars: { index },
        cycle: ['cold', 'on'],
      });
    });

    addMachine(world, {
      id: 'muster',
      kind: MachineKind.Lever,
      at: vec(MUSTER_X + 1, 1),
      state: 'idle',
      inventory: [],
      vars: { sites: placed.length, scouts: detail.scouts, workers: detail.workers },
    });

    for (let i = 0; i < detail.scouts + detail.workers; i++) {
      const scout = i < detail.scouts;
      addBot(world, {
        at: vec(MUSTER_X, 2 + i),
        facing: Dir.East,
        name: scout ? `SCOUT-${String(i + 1)}` : `HAND-${String(i - detail.scouts + 1)}`,
      });
    }
    return world;
  },
  objectives: [
    Objectives.custom(
      'sites-up',
      'Bring every relay site up',
      (ctx) => {
        const total = siteMachines(ctx.initialWorld).length;
        return total > 0 && litCount(ctx.world) === total;
      },
      { progress, divergence: coldSite },
    ),
    Objectives.custom(
      'told-where-to-go',
      'Bring up no site that nobody sent a bot to',
      (ctx) => {
        const [ordered, total] = underOrders(ctx);
        return total > 0 && ordered === total;
      },
      { progress: underOrders, divergence: firstUnordered },
    ),
  ],
  bonus: [
    Objectives.custom(
      'workers-busy',
      'Keep the workers waiting for under a tenth of the shift',
      (ctx) => {
        const ids = new Set(workerIds(ctx.initialWorld));
        const span = ctx.trace.endTick * ids.size;
        return span > 0 && idleTicks(ctx.trace.events, ids) < span * 0.1;
      },
      { divergence: idleWorkers },
    ),
  ],
  starter: [
    "// import { survey, pathTo, deal } from 'lib';",
    '// NOTE(4470): the sites are not on the plan. that was the point of them',
    '// NOTE(4470): whoever finds one has to say so. nothing else finds it for them',
    '',
    'const muster = probe("muster");',
    'const scouts = bots().slice(0, muster.vars.scouts);',
    'const hands = bots().slice(muster.vars.scouts);',
    'print(`${scouts.length} scouts, ${hands.length} hands, ${muster.vars.sites} sites`);',
    '',
  ].join('\n'),
  hints: [
    'A bot that has walked somewhere knows something. Nothing about that knowledge reaches another bot on its own.',
    'The scouts do not need to finish before the workers start. The first thing a scout finds is worth telling somebody about immediately.',
    'A message is stamped with the sender\'s clock, and a bot that is behind in time has not been handed it yet. The order in which you sync matters more than the order in which you send.',
    'Two scouts is not one scout twice. Whatever collects the findings has to survive two of them reporting the same thing.',
    'A worker with nothing to do is the expensive part of this level, not a worker walking a long way.',
  ],
  docs: ['bots', 'sync', 'send', 'recv', 'probe', 'look', 'use'],
};
