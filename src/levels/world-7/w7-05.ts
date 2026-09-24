import type { Divergence, Machine, ObjectiveContext, Vec, World } from '../../engine/index.ts';
import {
  Dir,
  MANUAL_ONLY,
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
import { localSeed } from './shared.ts';

const WIDTH = 36;
const HEIGHT = 28;
const MUSTER_X = 2;
const SITE_PREFIX = 'site-';
const ID_ALPHABET = 'bcdfghjklmnpqrstvwxyz';
const ID_LENGTH = 6;
const SPAWN_COST = 2;

export interface Detail {
  scouts: number;
  workers: number;
  sites: number;
  blobs: number;
}

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

function drawSiteId(rng: Rng, taken: ReadonlySet<string>): string {
  let id = '';
  do {
    let token = '';
    for (let i = 0; i < ID_LENGTH; i++) {
      token += ID_ALPHABET.charAt(rng.int(0, ID_ALPHABET.length - 1));
    }
    id = `${SITE_PREFIX}${token}`;
  } while (taken.has(id));
  return id;
}

function walkable(world: World, at: Vec): boolean {
  return tileAt(world, at)?.terrain === Terrain.Floor;
}

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

export function workerIds(world: World): number[] {
  const scouts = world.vars.scouts ?? 1;
  return world.bots.map((bot) => bot.id).filter((id) => id >= scouts);
}

interface Orders {
  ordered: number;
  switched: number;
  jumped?: { botId: number; t: number; nth: number; told: number | undefined };
}

function readOrders(ctx: ObjectiveContext): Orders {
  const briefed = new Map<number, number[]>();
  const switched = new Map<number, number>();
  const sites = new Set(siteMachines(ctx.initialWorld).map((machine) => key(machine.at)));
  const out: Orders = { ordered: 0, switched: 0 };
  for (const event of ctx.trace.events) {
    if (event.kind === 'recv' && event.from !== null && event.from !== event.botId) {
      const read = briefed.get(event.botId) ?? [];
      read.push(event.t);
      briefed.set(event.botId, read);
      continue;
    }
    if (event.kind !== 'use' || !event.ok || !sites.has(key(event.at))) continue;
    out.switched++;
    const nth = (switched.get(event.botId) ?? 0) + 1;
    switched.set(event.botId, nth);
    const told = briefed.get(event.botId)?.[nth - 1];
    if (told !== undefined && told <= event.t) {
      out.ordered++;
      continue;
    }
    if (out.jumped === undefined) out.jumped = { botId: event.botId, t: event.t, nth, told };
  }
  return out;
}

function underOrders(ctx: ObjectiveContext): [number, number] {
  const orders = readOrders(ctx);
  return [orders.ordered, Math.max(orders.switched, siteMachines(ctx.initialWorld).length)];
}

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

function coldSite(ctx: ObjectiveContext): Divergence | undefined {
  const sites = siteMachines(ctx.initialWorld);
  if (sites.length === 0) {
    return { where: 'the north tunnels', expected: 'a relay site', received: 'none on the map' };
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

function firstUnordered(ctx: ObjectiveContext): Divergence {
  const orders = readOrders(ctx);
  const jumped = orders.jumped;
  if (jumped !== undefined) {
    return {
      where: `bot #${String(jumped.botId)} · tick ${String(jumped.t)}`,
      expected: 'an order read before this',
      received:
        jumped.told === undefined
          ? jumped.nth === 1
            ? 'no order in the run'
            : `only ${String(jumped.nth - 1)} orders in the run`
          : jumped.nth === 1
            ? `first order at tick ${String(jumped.told)}`
            : `order ${String(jumped.nth)} at tick ${String(jumped.told)}`,
    };
  }
  const total = Math.max(orders.switched, siteMachines(ctx.initialWorld).length);
  return {
    where: 'the relay sites',
    expected: `all ${String(total)} switched on under orders`,
    received: `${String(orders.ordered)} of ${String(total)}`,
  };
}

interface Dispatch {
  sent: number;
  repeat?: { botId: number; t: number; had: number };
}

function dispatched(ctx: ObjectiveContext): Dispatch {
  const holder = new Map<string, number>();
  const out: Dispatch = { sent: 0 };
  for (const event of ctx.trace.events) {
    if (event.kind !== 'send' || !event.ok || event.to === event.botId) continue;
    out.sent++;
    const body = String(event.body);
    const had = holder.get(body);
    if (had !== undefined && had !== event.to && out.repeat === undefined) {
      out.repeat = { botId: event.to, t: event.t, had };
    }
    holder.set(body, event.to);
  }
  return out;
}

function oneEach(ctx: ObjectiveContext): boolean {
  const total = siteMachines(ctx.initialWorld).length;
  const orders = dispatched(ctx);
  return total > 0 && orders.sent >= total && orders.repeat === undefined;
}

function repeatedOrder(ctx: ObjectiveContext): Divergence {
  const orders = dispatched(ctx);
  if (orders.repeat !== undefined) {
    return {
      where: `bot #${String(orders.repeat.botId)} · tick ${String(orders.repeat.t)}`,
      expected: 'an order no other bot had',
      received: `the order bot #${String(orders.repeat.had)} already had`,
    };
  }
  const total = siteMachines(ctx.initialWorld).length;
  return {
    where: 'the orders',
    expected: `${String(total)} sent, one for each site`,
    received: `${String(orders.sent)} sent in the run`,
  };
}

function requisitioned(world: World): number {
  return machineById(world, 'muster')?.vars.workers ?? 0;
}

function raisedCount(ctx: ObjectiveContext): number {
  return ctx.world.bots.length - ctx.initialWorld.bots.length;
}

function overRaised(ctx: ObjectiveContext): Divergence | undefined {
  const allowed = requisitioned(ctx.initialWorld);
  const raised = raisedCount(ctx);
  if (raised <= allowed) return undefined;
  return {
    where: `bot #${String(ctx.initialWorld.bots.length + allowed)}`,
    expected: `${String(allowed)} workers or fewer`,
    received: `${String(raised)} spawned`,
  };
}

function progress(ctx: ObjectiveContext): [number, number] {
  return [litCount(ctx.world), siteMachines(ctx.initialWorld).length];
}

export const w7_05: LevelDef = {
  id: 'w7-05',
  world: 7,
  index: 5,
  title: 'Chain of Command',
  hardware: [],
  brief: [
    'Last time two bots got the same order, and that crew is still lost. One order per site, please. — M. Vance',
    '',
    '**Find the hidden relay sites in the tunnels and switch each one on. A bot needs an order, a message from another bot, before each site.**',
  ].join('\n'),
  board: {
    redrawn: [
      'the site count, six to nine',
      'where the sites are',
      'each site id: `site-` plus six letters',
      'the scout count, one or two',
      'the worker limit, four to eight',
      'where the rock is, and so what `look` can see',
    ],
  },
  facts: [
    { label: 'Score', value: 'The tick when the **last** bot stops.' },
    {
      label: 'Relay site',
      value:
        'Sites start `cold` (off). Stand on one and `use()` once to switch it `on`. A second `use()` turns it `cold` again. `power()` does not work here. Every site can be reached from the muster.',
    },
    {
      label: 'Site ids',
      value:
        'Stand on or in front of a site and call `probe()` with **no argument**. Or use `look`: it reports every machine id it passes.',
    },
    {
      label: 'Muster (start area)',
      value:
        "Only the scouts start here, on the west wall. `probe('muster')` gives `vars.sites`, `vars.scouts` and `vars.workers` (your spawn limit).",
    },
    {
      label: 'Workers',
      value: `\`spawn(dir)\` makes one. It costs the parent ${String(SPAWN_COST)} ticks, even when it fails. The worker's clock starts at the parent's clock plus ${String(SPAWN_COST)}.`,
    },
    {
      label: 'Orders',
      value:
        "Before a bot switches on its **n**th site, it must have read its **n**th message from another bot, with `recv()`. Any text counts. A message carries the sender's clock. A bot whose clock is behind sees no message yet.",
    },
    {
      label: 'Same order',
      value:
        'Never send the same message text to two different bots. Repeats to the same bot are fine. Send at least one order per site.',
    },
  ],
  seeds: [1, 2, 3, 4, 5],
  par: { ticks: 100 },
  budget: { maxTicks: 6000 },
  costs: { spawn: SPAWN_COST },
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
    const taken = new Set<string>();
    placed.forEach((at, index) => {
      const id = drawSiteId(rng, taken);
      taken.add(id);
      addMachine(world, {
        id,
        kind: MachineKind.Node,
        at,
        state: 'cold',
        inventory: [],
        vars: { index, [MANUAL_ONLY]: 1 },
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

    for (let i = 0; i < detail.scouts; i++) {
      addBot(world, { at: vec(MUSTER_X, 2 + i), facing: Dir.East, name: `SCOUT-${String(i + 1)}` });
    }
    return world;
  },
  objectives: [
    Objectives.custom(
      'sites-up',
      'Switch on every relay site',
      (ctx) => {
        const total = siteMachines(ctx.initialWorld).length;
        return total > 0 && litCount(ctx.world) === total;
      },
      { progress, divergence: coldSite },
    ),
    Objectives.custom(
      'told-where-to-go',
      'Read a new order from another bot before each site',
      (ctx) => {
        const [ordered, total] = underOrders(ctx);
        return total > 0 && ordered === total;
      },
      { progress: underOrders, divergence: firstUnordered },
    ),
    Objectives.custom(
      'inside-requisition',
      'Spawn no more than `vars.workers` workers',
      (ctx) => raisedCount(ctx) <= requisitioned(ctx.initialWorld),
      { divergence: overRaised },
    ),
  ],
  bonus: [
    Objectives.custom(
      'one-order-per-site',
      'Never send one order text to two bots; at least one order per site',
      oneEach,
      { divergence: repeatedOrder },
    ),
  ],
  starter: [
    "// import { survey, pathTo, deal } from 'lib';",
    '// Only the bot that finds a site knows it. It must tell the others.',
    '',
    'const muster = probe("muster");',
    'const scouts = bots();',
    'print(`${scouts.length} scouts, ${muster.vars.workers} workers to spawn, ${muster.vars.sites} sites`);',
    '',
  ].join('\n'),
  hints: [
    'What a bot finds stays with that bot. You must send it to the others.',
    'Scouts do not need to finish first. Report each site as soon as it is found.',
    "A message carries the sender's clock. A bot that is behind cannot read it yet. When you sync matters more than when you send.",
    'Two scouts may find the same site. The code that collects reports must handle that.',
    'A worker starts next to the bot that spawned it, not only at the muster.',
  ],
  docs: ['bots', 'spawn', 'sync', 'send', 'recv', 'probe', 'look', 'use'],
};
