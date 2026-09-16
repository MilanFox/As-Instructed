import { describe, expect, test } from 'vitest';
import type { Dir, ObjectiveContext, Sim, Vec } from '../../../engine/index.ts';
import { ALL_DIRS, evaluateObjectives, manhattan, step } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel } from '../../harness.ts';
import { solution } from '../__solutions__/w7-05.ts';
import { idleTicks } from '../shared.ts';
import { w7_05, workerIds } from '../w7-05.ts';

const key = (at: Vec): string => `${String(at.x)},${String(at.y)}`;

interface Order {
  id: string;
  at: Vec;
}

interface Habits {
  dedup: boolean;
  pipelined: boolean;
  range: number;
}

// the reference relay, with the two habits a lazy program drops: dedup, and pipelining
function relay(sim: Sim, habits: Habits): void {
  const muster = sim.probe(0, 'muster');
  if (!muster) return;
  const total = muster.vars['sites'] ?? 0;
  const width = 36;
  const ids = sim.botIds();
  const hands = ids.slice(muster.vars['scouts'] ?? 1);
  const boss = ids[0] as number;

  const open = new Map<string, Vec>();
  const seen = new Set<string>();
  const found = new Map<string, Vec>();
  const claimed = new Set<string>();
  const lit = new Set<string>();
  const orders = new Map<number, Order>();
  const given = new Map<number, number>();
  const read = new Map<number, number>();

  const observe = (id: number): void => {
    const here = sim.pos(id);
    seen.add(key(here));
    open.set(key(here), here);
    for (const dir of ALL_DIRS) {
      for (const view of sim.look(id, dir, habits.range)) {
        if (!view.inBounds) break;
        seen.add(key(view.at));
        if (view.walkable) open.set(key(view.at), view.at);
        if (view.machineId !== null && view.machineId.startsWith('site-')) {
          found.set(view.machineId, view.at);
        }
      }
    }
    const near = sim.probe(id);
    if (near && near.id.startsWith('site-')) found.set(near.id, near.at);
  };

  const route = (from: Vec, to: Vec, taken: ReadonlySet<string>): Dir[] => {
    const via = new Map<string, { at: Vec; dir: Dir }>();
    const visited = new Set<string>([key(from)]);
    const queue: Vec[] = [from];
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head] as Vec;
      if (at.x === to.x && at.y === to.y) break;
      for (const dir of ALL_DIRS) {
        const next = step(at, dir);
        const id = key(next);
        if (visited.has(id) || !open.has(id)) continue;
        if (taken.has(id) && !(next.x === to.x && next.y === to.y)) continue;
        visited.add(id);
        via.set(id, { at, dir });
        queue.push(next);
      }
    }
    const path: Dir[] = [];
    let at = to;
    while (!(at.x === from.x && at.y === from.y)) {
      const back = via.get(key(at));
      if (!back) return [];
      path.push(back.dir);
      at = back.at;
    }
    return path.reverse();
  };

  const nothing = new Set<string>();
  const stepAside = (id: number): void => {
    for (const dir of ALL_DIRS) {
      if (!sim.canMove(id, dir)) continue;
      sim.move(id, dir);
      observe(id);
      return;
    }
    sim.wait(id, 1);
  };
  const advance = (id: number, to: Vec): void => {
    const from = sim.pos(id);
    if (from.x === to.x && from.y === to.y) return;
    const taken = new Set<string>();
    for (const other of ids) {
      if (other !== id) taken.add(key(sim.pos(other)));
    }
    let path = route(from, to, taken);
    if (path.length === 0) path = route(from, to, nothing);
    let moved = 0;
    for (const dir of path) {
      if (moved >= 3) break;
      if (!sim.canMove(id, dir)) break;
      sim.move(id, dir);
      observe(id);
      moved++;
    }
    if (moved === 0) stepAside(id);
  };
  const frontier = (from: Vec, reserved: ReadonlySet<string>): Vec | null => {
    let best: Vec | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const [id, at] of open) {
      if (reserved.has(id)) continue;
      if (!ALL_DIRS.some((dir) => !seen.has(key(step(at, dir))))) continue;
      const score = manhattan(from, at);
      if (score < bestScore) {
        bestScore = score;
        best = at;
      }
    }
    return best;
  };

  for (const id of ids) observe(id);

  for (let round = 0; round < 3000 && lit.size < total; round++) {
    if (habits.pipelined || found.size >= total) {
      for (const [id, at] of found) {
        if (habits.dedup ? claimed.has(id) : lit.has(id)) continue;
        let pick = -1;
        let nearest = Number.POSITIVE_INFINITY;
        for (const hand of hands) {
          if (orders.has(hand)) continue;
          const distance = manhattan(sim.pos(hand), at);
          if (distance < nearest) {
            nearest = distance;
            pick = hand;
          }
        }
        if (pick < 0) break;
        claimed.add(id);
        orders.set(pick, { id, at });
        sim.send(boss, pick, at.y * width + at.x);
        given.set(pick, (given.get(pick) ?? 0) + 1);
      }
    }
    for (const hand of hands) {
      while (sim.recv(hand) !== null) read.set(hand, (read.get(hand) ?? 0) + 1);
    }

    const reserved = new Set<string>();
    let acted = false;
    for (const id of ids) {
      const order = orders.get(id);
      if (order) {
        const at = sim.pos(id);
        if (at.x === order.at.x && at.y === order.at.y) {
          if ((read.get(id) ?? 0) < (given.get(id) ?? 0)) {
            sim.wait(id, 1);
            acted = true;
            continue;
          }
          const here = sim.probe(id);
          // a second bot on the same site must not switch it back off
          if (here && here.state === 'on') {
            lit.add(order.id);
            orders.delete(id);
          } else {
            sim.use(id);
            observe(id);
            orders.delete(id);
            lit.add(order.id);
          }
        } else {
          advance(id, order.at);
        }
        acted = true;
        continue;
      }
      if (found.size >= total) continue;
      const target = frontier(sim.pos(id), reserved);
      if (!target) continue;
      reserved.add(key(target));
      advance(id, target);
      acted = true;
    }
    if (!acted) break;
  }
}

// the same run, walking three tiles for every one it needs
function wiggling(sim: Sim): Sim {
  return new Proxy(sim, {
    get(target, prop: string | symbol) {
      if (prop === 'move') {
        return (id: number, dir: Dir) => {
          for (const aside of ALL_DIRS) {
            if (aside === dir) continue;
            if (!target.canMove(id, aside)) continue;
            target.move(id, aside);
            target.move(id, ALL_DIRS[(ALL_DIRS.indexOf(aside) + 2) % 4] as Dir);
            break;
          }
          return target.move(id, dir);
        };
      }
      const value = Reflect.get(target, prop) as unknown;
      return typeof value === 'function'
        ? (value as (...args: never[]) => unknown).bind(target)
        : value;
    },
  }) as Sim;
}

// one scout does the lot, after a worker posts it a dummy at tick 0
function loneScout(sim: Sim, dummies: number): void {
  const ids = sim.botIds();
  const boss = ids[0] as number;
  const mate = ids[1] as number;
  for (let i = 0; i < dummies; i++) sim.send(mate, boss, i);
  while (sim.recv(boss) !== null) continue;

  const open = new Map<string, Vec>();
  const seen = new Set<string>();
  const found = new Map<string, Vec>();
  const done = new Set<string>();
  const observe = (): void => {
    const here = sim.pos(boss);
    seen.add(key(here));
    open.set(key(here), here);
    for (const dir of ALL_DIRS) {
      for (const view of sim.look(boss, dir, 12)) {
        if (!view.inBounds) break;
        seen.add(key(view.at));
        if (view.walkable) open.set(key(view.at), view.at);
        if (view.machineId !== null && view.machineId.startsWith('site-')) {
          found.set(view.machineId, view.at);
        }
      }
    }
    const near = sim.probe(boss);
    if (near && near.id.startsWith('site-')) found.set(near.id, near.at);
  };
  const route = (from: Vec, to: Vec): Dir[] => {
    const via = new Map<string, { at: Vec; dir: Dir }>();
    const visited = new Set<string>([key(from)]);
    const queue: Vec[] = [from];
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head] as Vec;
      if (at.x === to.x && at.y === to.y) break;
      for (const dir of ALL_DIRS) {
        const next = step(at, dir);
        if (visited.has(key(next)) || !open.has(key(next))) continue;
        visited.add(key(next));
        via.set(key(next), { at, dir });
        queue.push(next);
      }
    }
    const path: Dir[] = [];
    let at = to;
    while (!(at.x === from.x && at.y === from.y)) {
      const back = via.get(key(at));
      if (!back) return [];
      path.push(back.dir);
      at = back.at;
    }
    return path.reverse();
  };
  const goto = (to: Vec): boolean => {
    for (let guard = 0; guard < 400; guard++) {
      const from = sim.pos(boss);
      if (from.x === to.x && from.y === to.y) return true;
      const path = route(from, to);
      if (path.length === 0) return false;
      let moved = 0;
      for (const dir of path) {
        if (!sim.canMove(boss, dir)) break;
        sim.move(boss, dir);
        observe();
        moved++;
        if (moved >= 3) break;
      }
      if (moved === 0) sim.wait(boss, 1);
    }
    return false;
  };
  const total = sim.probe(boss, 'muster')?.vars['sites'] ?? 0;
  observe();
  for (let round = 0; round < 3000 && done.size < total; round++) {
    let target: Vec | null = null;
    for (const [id, at] of found) {
      if (done.has(id)) continue;
      target = at;
      break;
    }
    if (target === null) {
      let best: Vec | null = null;
      let score = Number.POSITIVE_INFINITY;
      const here = sim.pos(boss);
      for (const [, at] of open) {
        if (!ALL_DIRS.some((dir) => !seen.has(key(step(at, dir))))) continue;
        if (manhattan(here, at) < score) {
          score = manhattan(here, at);
          best = at;
        }
      }
      if (best === null) break;
      if (!goto(best)) break;
      continue;
    }
    if (!goto(target)) break;
    sim.use(boss);
    for (const [id, at] of found) if (key(at) === key(sim.pos(boss))) done.add(id);
  }
}

function scored(seed: number, drive: (sim: Sim, bot: number) => void) {
  const result = runLevel(w7_05, seed, drive);
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  const stars = evaluateObjectives(w7_05.bonus ?? [], ctx);
  const sends = result.trace.events.filter((event) => event.kind === 'send');
  const bodies = new Set(sends.map((event) => (event.kind === 'send' ? String(event.body) : '')));
  return {
    ctx,
    passed: result.verdict.passed,
    ticks: result.trace.endTick,
    sends: sends.length,
    bodies: bodies.size,
    idle: idleTicks(result.trace.events, new Set(workerIds(result.initialWorld))),
    required: (id: string) =>
      must(
        w7_05.objectives.find((each) => each.id === id),
        id,
      ).evaluate(ctx),
    met: (id: string) =>
      must(
        stars.find((star) => star.id === id),
        id,
      ).met,
  };
}

const siteCount = (seed: number): number =>
  w7_05.build(seed).machines.filter((machine) => machine.id.startsWith('site-')).length;

const objectiveIn = (id: string) =>
  must(
    [...w7_05.objectives, ...(w7_05.bonus ?? [])].find((each) => each.id === id),
    id,
  );

const HONEST: Habits = { dedup: true, pipelined: true, range: 12 };

describe('w7-05 the reference brings every site up under orders and earns the star', () => {
  test('every seed, with the order count recorded', () => {
    for (const seed of w7_05.seeds) {
      const run = scored(seed, (sim, bot) => {
        solution.run(sim, bot);
      });
      const label = `seed ${String(seed)}`;
      expect(run.passed, label).toBe(true);
      expect(run.required('sites-up'), label).toBe(true);
      expect(run.required('told-where-to-go'), label).toBe(true);
      expect(run.met('one-order-per-site'), label).toBe(true);
      expect(run.sends, label).toBe(siteCount(seed));
      expect(run.bodies, label).toBe(siteCount(seed));
    }
  });

  test('seed 1 is representative: the honest run passes it inside par', () => {
    const run = scored(1, (sim, bot) => {
      solution.run(sim, bot);
    });

    expect(run.passed).toBe(true);
    expect(run.met('one-order-per-site')).toBe(true);
    expect(run.ticks).toBeLessThanOrEqual(must(w7_05.par, 'par').ticks);
  });

  test('the generator places every site it says it does', () => {
    for (const seed of w7_05.seeds) {
      const world = w7_05.build(seed);
      const placed = world.machines.filter((machine) => machine.id.startsWith('site-')).length;
      const muster = must(
        world.machines.find((machine) => machine.id === 'muster'),
        'muster',
      );
      const label = `seed ${String(seed)}`;
      expect(placed, label).toBe(muster.vars['sites']);
      expect(placed, label).toBeGreaterThanOrEqual(6);
      expect(world.bots.length, label).toBe(
        (world.vars['scouts'] ?? 0) + (world.vars['workers'] ?? 0),
      );
    }
  });
});

describe('w7-05 one-order-per-site is missed by a relay that forgets what it has dealt', () => {
  test('re-dealing every sighting brings the sites up and misses the star, every seed', () => {
    for (const seed of w7_05.seeds) {
      const run = scored(seed, (sim) => {
        relay(sim, { ...HONEST, dedup: false });
      });
      const label = `seed ${String(seed)}`;
      expect(run.passed, label).toBe(true);
      expect(run.required('sites-up'), label).toBe(true);
      expect(run.required('told-where-to-go'), label).toBe(true);
      expect(run.met('one-order-per-site'), label).toBe(false);
      expect(run.sends, label).toBeGreaterThan(run.bodies);
    }
  });

  test('a program that does nothing earns no star', () => {
    for (const seed of w7_05.seeds) {
      const run = scored(seed, () => undefined);
      expect(run.met('one-order-per-site'), `seed ${String(seed)}`).toBe(false);
    }
  });
});

describe('w7-05 one-order-per-site is not about speed', () => {
  test('a run that walks three tiles for every one still earns it, every seed', () => {
    for (const seed of w7_05.seeds) {
      const reference = scored(seed, (sim, bot) => {
        solution.run(sim, bot);
      });
      const slow = scored(seed, (sim, bot) => {
        solution.run(wiggling(sim), bot);
      });
      const label = `seed ${String(seed)}`;
      expect(slow.passed, label).toBe(true);
      expect(slow.met('one-order-per-site'), label).toBe(true);
      expect(slow.ticks, label).toBeGreaterThan(reference.ticks);
    }
  });

  test('a fleet that surveys first and a fleet that cannot see far both still earn it', () => {
    for (const seed of w7_05.seeds) {
      const surveyFirst = scored(seed, (sim) => {
        relay(sim, { ...HONEST, pipelined: false });
      });
      const shortSighted = scored(seed, (sim) => {
        relay(sim, { ...HONEST, range: 3 });
      });
      const label = `seed ${String(seed)}`;
      expect(surveyFirst.passed, label).toBe(true);
      expect(surveyFirst.met('one-order-per-site'), label).toBe(true);
      expect(shortSighted.passed, label).toBe(true);
      expect(shortSighted.met('one-order-per-site'), label).toBe(true);
    }
  });
});

describe('w7-05 told-where-to-go wants an order for every site, not one for the shift', () => {
  test('a scout that reads one dummy and then works alone is refused, every seed', () => {
    for (const seed of w7_05.seeds) {
      const run = scored(seed, (sim) => {
        loneScout(sim, 1);
      });
      const label = `seed ${String(seed)}`;
      expect(run.required('told-where-to-go'), label).toBe(false);
      expect(run.passed, label).toBe(false);
    }
  });

  test('the objective can fail on an untouched board, and says which site is cold', () => {
    for (const seed of w7_05.seeds) {
      const run = scored(seed, () => undefined);
      const label = `seed ${String(seed)}`;
      expect(run.required('sites-up'), label).toBe(false);
      expect(run.required('told-where-to-go'), label).toBe(false);
      const shown = must(objectiveIn('sites-up').divergence?.(run.ctx), 'a divergence');
      expect(shown.where, label).toMatch(/^site-\d+$/);
      expect(shown.expected, label).toBe('on');
      expect(shown.received, label).toBe('cold, never reached');
    }
  });
});

describe('w7-05 divergences name a place and a value', () => {
  const short = (text: string): boolean => text.length <= 44;

  test('the star names the bot that was handed an order another bot already had', () => {
    for (const seed of w7_05.seeds) {
      const run = scored(seed, (sim) => {
        relay(sim, { ...HONEST, dedup: false });
      });
      const shown = must(objectiveIn('one-order-per-site').divergence?.(run.ctx), 'a divergence');
      const label = `seed ${String(seed)}`;
      expect(shown.where, label).toMatch(/^bot #\d+ · tick \d+$/);
      expect(shown.expected, label).toBe('an order no other bot had');
      expect(shown.received, label).toMatch(/^the order bot #\d+ already had$/);
      expect([shown.where, shown.expected, shown.received].every(short), label).toBe(true);
    }
  });

  test('a fleet that sends nothing is told how many orders the board wanted', () => {
    for (const seed of w7_05.seeds) {
      const run = scored(seed, () => undefined);
      const shown = must(objectiveIn('one-order-per-site').divergence?.(run.ctx), 'a divergence');
      const label = `seed ${String(seed)}`;
      expect(shown.where, label).toBe('the orders');
      expect(shown.expected, label).toBe(`${String(siteCount(seed))} sent, one for each site`);
      expect(shown.received, label).toBe('0 sent all shift');
      expect([shown.where, shown.expected, shown.received].every(short), label).toBe(true);
    }
  });

  test('told-where-to-go names the bot, the tick and which order was missing', () => {
    for (const seed of w7_05.seeds) {
      const run = scored(seed, (sim) => {
        loneScout(sim, 1);
      });
      const shown = must(objectiveIn('told-where-to-go').divergence?.(run.ctx), 'a divergence');
      const label = `seed ${String(seed)}`;
      expect(shown.where, label).toMatch(/^bot #\d+ · tick \d+$/);
      expect(shown.expected, label).toBe('an order read before this');
      expect(shown.received, label).toMatch(/^(no order all shift|only \d+ orders all shift)$/);
      expect([shown.where, shown.expected, shown.received].every(short), label).toBe(true);
    }
  });

  test('two orders alike are named by bot and tick even on a bare trace', () => {
    const initialWorld = w7_05.build(1);
    const events = [
      { t: 3, botId: 0, dt: 0, kind: 'send' as const, to: 2, body: 412, ok: true },
      { t: 5, botId: 0, dt: 0, kind: 'send' as const, to: 4, body: 412, ok: true },
    ];
    const ctx: ObjectiveContext = {
      world: initialWorld,
      initialWorld,
      trace: { initialWorld, events: [...events], keyframes: [], endTick: 6 },
    };
    const objective = objectiveIn('one-order-per-site');

    expect(objective.evaluate(ctx)).toBe(false);
    expect(objective.divergence?.(ctx)).toEqual({
      where: 'bot #4 · tick 5',
      expected: 'an order no other bot had',
      received: 'the order bot #2 already had',
    });
  });

  test('every divergence on this level stays inside the copy rule', () => {
    const run = scored(1, (sim) => {
      relay(sim, { ...HONEST, dedup: false, pipelined: false });
    });
    for (const objective of [...w7_05.objectives, ...(w7_05.bonus ?? [])]) {
      const shown = objective.divergence?.(run.ctx);
      if (shown === undefined) continue;
      expect([shown.where, shown.expected, shown.received].every(short), objective.id).toBe(true);
    }
  });
});

describe('w7-05 carries no sense budget and no idle budget', () => {
  test('no bonus counts calls', () => {
    for (const star of w7_05.bonus ?? []) {
      expect(star.meter?.kind).not.toBe('sense');
    }
  });

  test('a fleet that never calls a worker files no idle ticks at all', () => {
    for (const seed of w7_05.seeds) {
      const parked = scored(seed, (sim) => {
        loneScout(sim, 1);
      });
      const reference = scored(seed, (sim, bot) => {
        solution.run(sim, bot);
      });
      const workers = workerIds(w7_05.build(seed)).length;
      const label = `seed ${String(seed)}`;
      // the workers stood at the muster the whole shift and the old measure read zero
      expect(parked.idle, label).toBe(0);
      expect(parked.ticks, label).toBeGreaterThan(0);
      expect(reference.idle, label).toBeLessThan(reference.ticks * workers * 0.1);
    }
  });
});
