import { describe, expect, test } from 'vitest';
import type { ObjectiveContext, Sim, Vec } from '../../../engine/index.ts';
import { Dir, evaluateObjectives, senseTotals } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel } from '../../harness.ts';
import { solution } from '../__solutions__/w7-04.ts';
import { w7_04 } from '../w7-04.ts';

type Order = 'dearest' | 'cheapest' | 'board';

interface Hand {
  id: number;
  at: Vec;
  clock: number;
}

const key = (at: Vec): string => `${String(at.x)},${String(at.y)}`;
const STEPS: [Dir, number, number][] = [
  [Dir.North, 0, -1],
  [Dir.East, 1, 0],
  [Dir.South, 0, 1],
  [Dir.West, -1, 0],
];
const SHIFT: Record<Dir, [number, number]> = {
  [Dir.North]: [0, -1],
  [Dir.East]: [1, 0],
  [Dir.South]: [0, 1],
  [Dir.West]: [-1, 0],
};

// the reference walker, so a probe differs from the reference only in dispatch order and padding
function dispatch(sim: Sim, order: Order, pad: number): void {
  const board = sim.probe(0, 'board');
  if (!board) return;
  const jobs: { id: string; at: Vec; cost: number }[] = [];
  for (let i = 0; i < (board.vars['jobs'] ?? 0); i++) {
    const job = sim.probe(0, `job-${String(i)}`);
    if (job) jobs.push({ id: job.id, at: job.at, cost: job.vars['cost'] ?? 0 });
  }
  if (order === 'dearest') jobs.sort((a, b) => b.cost - a.cost);
  if (order === 'cheapest') jobs.sort((a, b) => a.cost - b.cost);

  const fleet: Hand[] = sim.botIds().map((id) => ({ id, at: sim.pos(id), clock: 0 }));
  const gap = (a: Vec, b: Vec): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const standing = new Map<number, Vec>(fleet.map((hand) => [hand.id, hand.at]));

  const route = (from: Vec, to: Vec, taken: ReadonlySet<string>): Dir[] => {
    const via = new Map<string, { at: Vec; dir: Dir }>();
    const seen = new Set<string>([key(from)]);
    const queue: Vec[] = [from];
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head] as Vec;
      if (at.x === to.x && at.y === to.y) break;
      for (const [dir, dx, dy] of STEPS) {
        const next = { x: at.x + dx, y: at.y + dy };
        if (next.x < 1 || next.y < 1 || next.x > 26 || next.y > 18) continue;
        if (seen.has(key(next))) continue;
        if (taken.has(key(next)) && !(next.x === to.x && next.y === to.y)) continue;
        seen.add(key(next));
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

  const walk = (hand: Hand, to: Vec): void => {
    for (let attempt = 0; attempt < 400; attempt++) {
      const from = standing.get(hand.id) as Vec;
      if (from.x === to.x && from.y === to.y) return;
      const taken = new Set<string>();
      for (const other of fleet) {
        if (other.id !== hand.id) taken.add(key(standing.get(other.id) as Vec));
      }
      let moved = 0;
      for (const dir of route(from, to, taken)) {
        if (!sim.canMove(hand.id, dir)) break;
        sim.move(hand.id, dir);
        const was = standing.get(hand.id) as Vec;
        const [dx, dy] = SHIFT[dir];
        standing.set(hand.id, { x: was.x + dx, y: was.y + dy });
        hand.clock++;
        moved++;
      }
      if (moved === 0) {
        sim.wait(hand.id, 1);
        hand.clock++;
      }
    }
  };

  let decider = '';
  let decidedAt = -1;
  for (const job of jobs) {
    let hand = fleet[0] as Hand;
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of fleet) {
      const start = candidate.clock + gap(candidate.at, job.at);
      if (start < best) {
        best = start;
        hand = candidate;
      }
    }
    if (pad > 0) {
      sim.wait(hand.id, pad);
      hand.clock += pad;
    }
    walk(hand, job.at);
    for (let i = 0; i < job.cost; i++) {
      sim.use(hand.id);
      hand.clock++;
    }
    hand.at = job.at;
    const closed = sim.clock(hand.id);
    if (closed > decidedAt) {
      decidedAt = closed;
      decider = job.id;
    }
  }
  sim.print(0, `last ${decider} ${String(decidedAt)}`);
}

function scored(seed: number, drive: (sim: Sim, bot: number) => void) {
  const result = runLevel(w7_04, seed, drive);
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  const stars = evaluateObjectives(w7_04.bonus ?? [], ctx);
  return {
    ctx,
    passed: result.verdict.passed,
    ticks: result.trace.endTick,
    senses: senseTotals(result.trace),
    met: (id: string) =>
      must(
        stars.find((star) => star.id === id),
        id,
      ).met,
  };
}

const firstWaveCosts = (ctx: ObjectiveContext): number[] => {
  const cost = new Map<string, number>(
    ctx.initialWorld.machines
      .filter((machine) => machine.id.startsWith('job-'))
      .map((machine) => [machine.id, machine.vars['cost'] ?? 0]),
  );
  const begun = new Map<string, number>();
  for (const event of ctx.trace.events) {
    if (event.kind !== 'use' || !event.ok) continue;
    const id = event.machineId;
    if (id === null || !id.startsWith('job-')) continue;
    if (!begun.has(id)) begun.set(id, event.t);
  }
  return [...begun]
    .map(([id, at]) => ({ cost: cost.get(id) ?? 0, at }))
    .sort((a, b) => a.at - b.at || b.cost - a.cost)
    .slice(0, ctx.initialWorld.bots.length)
    .map((job) => job.cost)
    .sort((a, b) => b - a);
};

const dearestCosts = (ctx: ObjectiveContext): number[] =>
  ctx.initialWorld.machines
    .filter((machine) => machine.id.startsWith('job-'))
    .map((machine) => machine.vars['cost'] ?? 0)
    .sort((a, b) => b - a)
    .slice(0, ctx.initialWorld.bots.length);

function rewritten(seed: number, rewrite: (line: string) => string[]) {
  const result = runLevel(w7_04, seed, (sim, bot) => {
    solution.run(sim, bot);
  });
  const events = result.trace.events.flatMap((event) => {
    if (event.kind !== 'print' || !event.text.startsWith('last ')) return [event];
    return rewrite(event.text).map((text) => ({ ...event, text }));
  });
  const ctx: ObjectiveContext = {
    world: result.world,
    initialWorld: result.initialWorld,
    trace: { ...result.trace, events },
    ops: result.ops,
  };
  const stars = evaluateObjectives(w7_04.bonus ?? [], ctx);
  return {
    ctx,
    passed: result.verdict.passed,
    met: must(
      stars.find((star) => star.id === 'name-the-decider'),
      'name-the-decider',
    ).met,
  };
}

const objectiveIn = (id: string) =>
  must(
    [...w7_04.objectives, ...(w7_04.bonus ?? [])].find((each) => each.id === id),
    id,
  );

describe('w7-04 the reference clears the board and earns both stars', () => {
  test('every seed, with the first wave recorded', () => {
    for (const seed of w7_04.seeds) {
      const run = scored(seed, (sim, bot) => {
        solution.run(sim, bot);
      });
      const label = `seed ${String(seed)}`;
      expect(run.passed, label).toBe(true);
      expect(run.met('name-the-decider'), label).toBe(true);
      expect(run.met('long-jobs-first'), label).toBe(true);
      expect(firstWaveCosts(run.ctx), label).toEqual(dearestCosts(run.ctx));
    }
  });

  test('seed 1 is representative: the honest run passes it like the rest', () => {
    const run = scored(1, (sim, bot) => {
      solution.run(sim, bot);
    });

    expect(run.passed).toBe(true);
    expect(run.met('long-jobs-first')).toBe(true);
    expect(run.ticks).toBeLessThanOrEqual(must(w7_04.par, 'par').ticks);
  });
});

describe('w7-04 long-jobs-first is missed by a fleet that ignores cost', () => {
  test('dealing the board in id order clears it and misses the star, every seed', () => {
    for (const seed of w7_04.seeds) {
      const run = scored(seed, (sim) => {
        dispatch(sim, 'board', 0);
      });
      const label = `seed ${String(seed)}`;
      expect(run.passed, label).toBe(true);
      expect(run.met('long-jobs-first'), label).toBe(false);
    }
  });

  test('the shortest jobs first clears it and misses the star, every seed', () => {
    for (const seed of w7_04.seeds) {
      const run = scored(seed, (sim) => {
        dispatch(sim, 'cheapest', 0);
      });
      const label = `seed ${String(seed)}`;
      expect(run.passed, label).toBe(true);
      expect(run.met('long-jobs-first'), label).toBe(false);
    }
  });

  test('a run that ignores the order still earns the other star, so the two are not twins', () => {
    for (const seed of w7_04.seeds) {
      const run = scored(seed, (sim) => {
        dispatch(sim, 'cheapest', 0);
      });
      expect(run.met('name-the-decider'), `seed ${String(seed)}`).toBe(true);
    }
  });
});

describe('w7-04 long-jobs-first is not par in disguise', () => {
  test('dearest first but deliberately slow still earns it well past par', () => {
    const par = must(w7_04.par, 'par').ticks;
    for (const seed of w7_04.seeds) {
      const run = scored(seed, (sim) => {
        dispatch(sim, 'dearest', 12);
      });
      const label = `seed ${String(seed)}`;
      expect(run.passed, label).toBe(true);
      expect(run.met('long-jobs-first'), label).toBe(true);
      expect(run.ticks, label).toBeGreaterThan(par);
    }
  });

  test('a lighter padding earns it too, so the star does not track the clock', () => {
    for (const seed of w7_04.seeds) {
      const slow = scored(seed, (sim) => {
        dispatch(sim, 'dearest', 4);
      });
      const fast = scored(seed, (sim) => {
        dispatch(sim, 'cheapest', 0);
      });
      const label = `seed ${String(seed)}`;
      expect(slow.met('long-jobs-first'), label).toBe(true);
      expect(fast.met('long-jobs-first'), label).toBe(false);
      expect(slow.ticks, label).toBeGreaterThan(fast.ticks);
    }
  });
});

describe('w7-04 carries no sense budget', () => {
  test('no bonus counts calls', () => {
    for (const star of w7_04.bonus ?? []) {
      expect(star.meter?.kind).not.toBe('sense');
      expect(star.id).not.toMatch(/pos|scan|probe|look/);
    }
  });

  test('scan().at is a free synonym for pos(), so a call count could not have graded anything', () => {
    for (const seed of w7_04.seeds) {
      const run = scored(seed, (sim, bot) => {
        const viaScan = new Proxy(sim, {
          get(target, prop: string | symbol) {
            if (prop === 'pos') return (id: number) => target.scan(id).at;
            const value = Reflect.get(target, prop) as unknown;
            return typeof value === 'function'
              ? (value as (...args: never[]) => unknown).bind(target)
              : value;
          },
        }) as Sim;
        solution.run(viaScan, bot);
      });
      const label = `seed ${String(seed)}`;
      expect(run.passed, label).toBe(true);
      expect(run.met('name-the-decider'), label).toBe(true);
      expect(run.met('long-jobs-first'), label).toBe(true);
      expect(run.senses['pos'] ?? 0, label).toBe(0);
      expect(run.senses['scan'] ?? 0, label).toBeGreaterThan(0);
    }
  });
});

describe('w7-04 divergences name a place and a value', () => {
  const short = (text: string): boolean => text.length <= 44;

  test('long-jobs-first names the cheap job it was given and what it should have cost', () => {
    for (const seed of w7_04.seeds) {
      const run = scored(seed, (sim) => {
        dispatch(sim, 'cheapest', 0);
      });
      const shown = must(objectiveIn('long-jobs-first').divergence?.(run.ctx), 'a divergence');
      const label = `seed ${String(seed)}`;
      expect(shown.where, label).toMatch(/^job-\d+$/);
      expect(shown.expected, label).toMatch(/^a job costing \d+ or more$/);
      expect(shown.received, label).toMatch(/^cost \d+, begun at tick \d+$/);
      expect([shown.where, shown.expected, shown.received].every(short), label).toBe(true);
    }
  });

  test('a fleet that begins nothing is told how many jobs the first wave wanted', () => {
    for (const seed of w7_04.seeds) {
      const run = scored(seed, () => undefined);
      const shown = must(objectiveIn('long-jobs-first').divergence?.(run.ctx), 'a divergence');
      const label = `seed ${String(seed)}`;
      expect(run.met('long-jobs-first'), label).toBe(false);
      expect(shown.where, label).toBe('the first wave');
      expect(shown.expected, label).toMatch(/^\d+ jobs begun$/);
      expect(shown.received, label).toBe('0 begun all shift');
      expect([shown.where, shown.expected, shown.received].every(short), label).toBe(true);
    }
  });

  test('board-clear can fail, and says which job and how far in', () => {
    for (const seed of w7_04.seeds) {
      const run = scored(seed, () => undefined);
      const objective = objectiveIn('board-clear');
      const shown = must(objective.divergence?.(run.ctx), 'a divergence');
      const label = `seed ${String(seed)}`;
      expect(objective.evaluate(run.ctx), label).toBe(false);
      expect(run.passed, label).toBe(false);
      expect(shown.where, label).toMatch(/^job-\d+$/);
      expect(shown.expected, label).toBe('done');
      expect(shown.received, label).toMatch(/^\d+ of \d+ uses$/);
      expect([shown.where, shown.expected, shown.received].every(short), label).toBe(true);
    }
  });

  test('every name-the-decider branch names a place, and nothing runs long', () => {
    const branches: ((line: string) => string[])[] = [
      () => [],
      (line) => [line, line],
      () => ['last job-0'],
      () => ['last job-0 1'],
      () => ['last nobody 3'],
      (line) => [`last ${line.split(' ')[1] ?? ''} ${String(Number(line.split(' ')[2]) - 1)}`],
    ];
    for (const seed of w7_04.seeds) {
      for (const [index, rewrite] of branches.entries()) {
        const run = rewritten(seed, rewrite);
        const shown = must(objectiveIn('name-the-decider').divergence?.(run.ctx), 'a divergence');
        const label = `seed ${String(seed)} branch ${String(index)}`;
        expect(run.met, label).toBe(false);
        expect(shown.where.length, label).toBeGreaterThan(0);
        expect([shown.where, shown.expected, shown.received].every(short), label).toBe(true);
      }
    }
  });
});

describe('w7-04 name-the-decider still refuses a wrong line', () => {
  test('no line, a wrong job and a wrong tick are all refused on every seed', () => {
    for (const seed of w7_04.seeds) {
      const label = `seed ${String(seed)}`;
      const missing = rewritten(seed, () => []);
      const wrongJob = rewritten(seed, (line) => [`last job-0 ${line.split(' ')[2] ?? ''}`]);
      const wrongTick = rewritten(seed, (line) => {
        const parts = line.split(' ');
        return [`last ${parts[1] ?? ''} ${String(Number(parts[2]) - 1)}`];
      });

      expect(missing.passed, label).toBe(true);
      expect(missing.met, label).toBe(false);
      expect(wrongJob.met, label).toBe(false);
      expect(wrongTick.met, label).toBe(false);
    }
  });
});

describe('w7-04 the tick budget is a runaway guard, not a grader', () => {
  test('the reference and a deliberately slow run are both far inside it', () => {
    const cap = must(w7_04.budget?.maxTicks, 'maxTicks');
    for (const seed of w7_04.seeds) {
      const reference = scored(seed, (sim, bot) => {
        solution.run(sim, bot);
      });
      const slow = scored(seed, (sim) => {
        dispatch(sim, 'dearest', 12);
      });
      const label = `seed ${String(seed)}`;
      expect(reference.ticks * 4, label).toBeLessThan(cap);
      expect(slow.ticks * 4, label).toBeLessThan(cap);
      expect(slow.passed, label).toBe(true);
    }
  });
});
