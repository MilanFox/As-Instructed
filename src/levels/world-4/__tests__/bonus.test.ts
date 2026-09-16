import { describe, expect, test } from 'vitest';
import type { Dir, ObjectiveContext, Sim, Vec } from '../../../engine/index.ts';
import {
  ALL_DIRS,
  Terrain,
  evaluateObjectives,
  opposite,
  senseTotals,
  step,
} from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { LevelDef, ReferenceSolution } from '../../types.ts';
import { w4_01 } from '../w4-01.ts';
import { w4_02 } from '../w4-02.ts';
import { w4_04 } from '../w4-04.ts';

function markedVisited(sim: Sim, botId: number): void {
  const back: Dir[] = [];
  while (sim.scan(botId).terrain !== Terrain.Pad) {
    if (sim.readMark(botId) === null) sim.mark(botId, 'v');
    const onward = ALL_DIRS.find((dir) => {
      const view = sim.look(botId, dir, 1)[0];
      return view?.walkable === true && view.mark === null;
    });
    if (onward !== undefined) {
      sim.move(botId, onward);
      back.push(opposite(onward));
      continue;
    }
    const home = back.pop();
    if (home === undefined) return;
    sim.move(botId, home);
  }
}

function rememberedVisited(sim: Sim, botId: number): void {
  const seen = new Set<string>();
  const back: Dir[] = [];
  const key = (): string => {
    const at = sim.pos(botId);
    return `${String(at.x)},${String(at.y)}`;
  };
  while (sim.scan(botId).terrain !== Terrain.Pad) {
    seen.add(key());
    const onward = ALL_DIRS.find((dir) => {
      const view = sim.look(botId, dir, 1)[0];
      return view?.walkable === true && !seen.has(`${String(view.at.x)},${String(view.at.y)}`);
    });
    if (onward !== undefined) {
      sim.move(botId, onward);
      back.push(opposite(onward));
      continue;
    }
    const home = back.pop();
    if (home === undefined) return;
    sim.move(botId, home);
  }
}

function keyAt(at: Vec): string {
  return `${String(at.x)},${String(at.y)}`;
}

function walkKnown(sim: Sim, botId: number, to: Vec, walkable: Map<string, boolean>): void {
  const from = sim.pos(botId);
  if (keyAt(from) === keyAt(to)) return;
  const previous = new Map<string, { at: Vec; dir: Dir }>();
  const seen = new Set<string>([keyAt(from)]);
  const queue: Vec[] = [from];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as Vec;
    if (keyAt(at) === keyAt(to)) break;
    for (const dir of ALL_DIRS) {
      const next = step(at, dir);
      if (seen.has(keyAt(next)) || walkable.get(keyAt(next)) !== true) continue;
      seen.add(keyAt(next));
      previous.set(keyAt(next), { at, dir });
      queue.push(next);
    }
  }
  const route: Dir[] = [];
  let cursor = keyAt(to);
  while (cursor !== keyAt(from)) {
    const back = previous.get(cursor);
    if (back === undefined) return;
    route.push(back.dir);
    cursor = keyAt(back.at);
  }
  for (const dir of route.reverse()) sim.move(botId, dir);
}

function floodFilled(sim: Sim, botId: number): void {
  const walkable = new Map<string, boolean>();
  const start = sim.pos(botId);
  walkable.set(keyAt(start), true);
  const queued = new Set<string>([keyAt(start)]);
  const queue: Vec[] = [start];
  while (queue.length > 0) {
    const next = queue.pop() as Vec;
    walkKnown(sim, botId, next, walkable);
    if (sim.scan(botId).terrain === Terrain.Pad) return;
    walkable.set(keyAt(sim.pos(botId)), true);
    for (const dir of ALL_DIRS) {
      const view = sim.scan(botId, dir);
      walkable.set(keyAt(view.at), view.walkable);
      if (view.walkable && !queued.has(keyAt(view.at))) {
        queued.add(keyAt(view.at));
        queue.push(view.at);
      }
    }
  }
}

function movedBlind(sim: Sim, botId: number): void {
  let back: Dir | null = null;
  for (;;) {
    let moved = false;
    for (const dir of ALL_DIRS) {
      if (dir === back || !sim.move(botId, dir)) continue;
      back = opposite(dir);
      moved = true;
      break;
    }
    if (!moved) return;
  }
}

function scannedAhead(sim: Sim, botId: number): void {
  let back: Dir | null = null;
  while (sim.scan(botId).terrain !== Terrain.Pad) {
    const next = ALL_DIRS.find((dir) => dir !== back && sim.scan(botId, dir).walkable);
    if (next === undefined) return;
    sim.move(botId, next);
    back = opposite(next);
  }
}

function feltAhead(sim: Sim, botId: number): void {
  let back: Dir | null = null;
  while (sim.scan(botId).terrain !== Terrain.Pad) {
    const next = ALL_DIRS.find(
      (dir) => dir !== back && sim.look(botId, dir, 1)[0]?.walkable === true,
    );
    if (next === undefined) return;
    sim.move(botId, next);
    back = opposite(next);
  }
}

function scored(level: LevelDef, seed: number, drive: (sim: Sim, bot: number) => void) {
  const result = runLevel(level, seed, drive);
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  const stars = evaluateObjectives([...level.objectives, ...(level.bonus ?? [])], ctx);
  return {
    passed: result.verdict.passed,
    ticks: result.trace.endTick,
    met: (id: string) =>
      must(
        stars.find((star) => star.id === id),
        id,
      ).met,
  };
}

function referenceEarns(level: LevelDef, id: string): void {
  const solution = SOLUTIONS[level.id] as ReferenceSolution;
  for (const seed of level.seeds) {
    const result = runReference(level, seed, solution);
    const stars = evaluateObjectives(level.bonus ?? [], {
      world: result.world,
      initialWorld: result.initialWorld,
      trace: result.trace,
      ops: result.ops,
    });
    expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
    expect(result.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(level.par.ticks);
    expect(
      must(
        stars.find((star) => star.id === id),
        id,
      ).met,
      `seed ${String(seed)}`,
    ).toBe(true);
  }
}

const idle = (sim: Sim, botId: number): void => {
  sim.print(botId, '.');
};

describe('w4-01 reading and step allowances', () => {
  test('the reference solution earns the star on every seed', () => {
    referenceEarns(w4_01, 'tight-reading-bound');
  });

  test('feeling one tile ahead reaches the pad and overruns the reading allowance', () => {
    for (const seed of w4_01.seeds) {
      const lazy = scored(w4_01, seed, feltAhead);
      const solution = SOLUTIONS[w4_01.id] as ReferenceSolution;
      const good = runReference(w4_01, seed, solution);

      expect(lazy.ticks, `seed ${String(seed)}`).toBe(good.ticks);
      expect(lazy.met('reach-tunnel-end'), `seed ${String(seed)}`).toBe(true);
      expect(lazy.met('tight-reading-bound'), `seed ${String(seed)}`).toBe(false);
      if (seed !== 46) expect(lazy.passed, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('stepping tile by tile on scan alone fails the reading allowance', () => {
    for (const seed of w4_01.seeds) {
      const lazy = scored(w4_01, seed, scannedAhead);

      expect(lazy.met('reach-tunnel-end'), `seed ${String(seed)}`).toBe(true);
      expect(lazy.met('reading-allowance'), `seed ${String(seed)}`).toBe(false);
      expect(lazy.passed, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('finding the tunnel by bumping into it fails the step allowance', () => {
    for (const seed of w4_01.seeds) {
      const blind = scored(w4_01, seed, movedBlind);

      expect(blind.met('reach-tunnel-end'), `seed ${String(seed)}`).toBe(true);
      expect(blind.met('reading-allowance'), `seed ${String(seed)}`).toBe(true);
      expect(blind.met('no-wasted-steps'), `seed ${String(seed)}`).toBe(false);
      expect(blind.passed, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('flood-filling the tunnel a tile at a time fails the reading allowance', () => {
    for (const seed of w4_01.seeds) {
      const mapped = scored(w4_01, seed, floodFilled);
      const solution = SOLUTIONS[w4_01.id] as ReferenceSolution;
      const good = runReference(w4_01, seed, solution);

      expect(mapped.met('reach-tunnel-end'), `seed ${String(seed)}`).toBe(true);
      expect(mapped.ticks, `seed ${String(seed)}`).toBe(good.ticks);
      expect(mapped.met('no-wasted-steps'), `seed ${String(seed)}`).toBe(true);
      expect(mapped.met('reading-allowance'), `seed ${String(seed)}`).toBe(false);
      expect(mapped.passed, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('an idle program is refused on every seed', () => {
    for (const seed of w4_01.seeds) {
      const run = scored(w4_01, seed, idle);
      expect(run.passed, `seed ${String(seed)}`).toBe(false);
      expect(run.met('tight-reading-bound'), `seed ${String(seed)}`).toBe(false);
    }
  });
});

describe('w4-02 breadcrumb-trail', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w4_02, 'breadcrumb-trail');
  });

  test('a run that places no marks at all reaches the vein and is refused', () => {
    for (const seed of w4_02.seeds) {
      const run = scored(w4_02, seed, rememberedVisited);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w4_02.par.ticks);
      expect(run.met('breadcrumb-trail'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('marking every tile "somebody was here" is correct and is refused', () => {
    for (const seed of w4_02.seeds) {
      const run = scored(w4_02, seed, markedVisited);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('breadcrumb-trail'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the bare visited flag is quoted back to the run that wrote it', () => {
    const result = runLevel(w4_02, 1, markedVisited);
    const star = must(
      evaluateObjectives(w4_02.bonus ?? [], {
        world: result.world,
        initialWorld: result.initialWorld,
        trace: result.trace,
        ops: result.ops,
      })[0],
      'the star',
    );
    const shown = must(star.divergence, 'a divergence');
    expect(shown.where).toMatch(/^\(\d+, \d+\)$/);
    expect(shown.expected).toBe('the tile the bot arrived from');
    expect(shown.received).toBe('v');
  });

  test('an idle program is refused on every seed', () => {
    for (const seed of w4_02.seeds) {
      const run = scored(w4_02, seed, idle);
      expect(run.passed, `seed ${String(seed)}`).toBe(false);
      expect(run.met('breadcrumb-trail'), `seed ${String(seed)}`).toBe(false);
    }
  });
});

function filedAs(seed: number, rewrite: (line: string) => string | null) {
  const solution = SOLUTIONS[w4_04.id] as ReferenceSolution;
  const result = runReference(w4_04, seed, solution);
  const events = result.trace.events.flatMap((event) => {
    if (event.kind !== 'print' || !event.text.startsWith('home ')) return [event];
    const line = rewrite(event.text);
    return line === null ? [] : [{ ...event, text: line }];
  });
  const stars = evaluateObjectives(w4_04.bonus ?? [], {
    world: result.world,
    initialWorld: result.initialWorld,
    trace: { ...result.trace, events },
    ops: result.ops,
  });
  return {
    passed: result.verdict.passed,
    ticks: result.trace.endTick,
    met: must(stars[0], 'the star').met,
  };
}

describe('w4-04 filed-return', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w4_04, 'filed-return');
  });

  test('the same run without its filed price brings the ore home and is refused', () => {
    for (const seed of w4_04.seeds) {
      const run = filedAs(seed, () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w4_04.par.ticks);
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a price that is off by one is refused on every seed', () => {
    for (const seed of w4_04.seeds) {
      const run = filedAs(seed, (line) => `home ${String(Number(line.split(' ')[1]) - 1)}`);
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('reporting the trip after driving it is not filing it', () => {
    const solution = SOLUTIONS[w4_04.id] as ReferenceSolution;
    for (const seed of w4_04.seeds) {
      const result = runReference(w4_04, seed, solution);
      const filed = result.trace.events.filter(
        (event) => event.kind === 'print' && event.text.startsWith('home '),
      );
      const events = [
        ...result.trace.events.filter(
          (event) => !(event.kind === 'print' && event.text.startsWith('home ')),
        ),
        ...filed,
      ];
      const ctx: ObjectiveContext = {
        world: result.world,
        initialWorld: result.initialWorld,
        trace: { ...result.trace, events },
        ops: result.ops,
      };
      const star = must(evaluateObjectives(w4_04.bonus ?? [], ctx)[0], 'the star');

      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
      expect(star.met, `seed ${String(seed)}`).toBe(false);
      expect(star.divergence?.received, `seed ${String(seed)}`).toBe('the bot drove off first');
    }
  });

  test('an idle program is refused on every seed', () => {
    for (const seed of w4_04.seeds) {
      const run = scored(w4_04, seed, idle);
      expect(run.passed, `seed ${String(seed)}`).toBe(false);
      expect(run.met('filed-return'), `seed ${String(seed)}`).toBe(false);
      const result = runLevel(w4_04, seed, idle);
      const star = must(
        evaluateObjectives(w4_04.bonus ?? [], {
          world: result.world,
          initialWorld: result.initialWorld,
          trace: result.trace,
          ops: result.ops,
        })[0],
        'the star',
      );
      expect(star.divergence?.received, `seed ${String(seed)}`).toBe('the quota was never made');
    }
  });
});

function asking(seed: number, extra: number) {
  const solution = SOLUTIONS[w4_04.id] as ReferenceSolution;
  const result = runReference(w4_04, seed, solution);
  const asked = Array.from({ length: extra }, (_, i) => ({
    t: i,
    botId: 0,
    dt: 0,
    kind: 'sense' as const,
    name: 'inventory',
    ok: true,
    count: 1,
  }));
  const stars = evaluateObjectives(w4_04.bonus ?? [], {
    world: result.world,
    initialWorld: result.initialWorld,
    trace: { ...result.trace, events: [...asked, ...result.trace.events] },
    ops: result.ops,
  });
  return {
    passed: result.verdict.passed,
    met: must(
      stars.find((star) => star.id === 'within-3-inventory'),
      'the star',
    ).met,
  };
}

describe('w4-04 within-3-inventory', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w4_04, 'within-3-inventory');
  });

  test('the reference never asks the hold at all', () => {
    const solution = SOLUTIONS[w4_04.id] as ReferenceSolution;
    for (const seed of w4_04.seeds) {
      const result = runReference(w4_04, seed, solution);
      expect(senseTotals(result.trace)['inventory'] ?? 0, `seed ${String(seed)}`).toBe(0);
    }
  });

  test('the same run brings the ore home and is refused on a fourth reading', () => {
    for (const seed of w4_04.seeds) {
      expect(asking(seed, 3).met, `seed ${String(seed)}`).toBe(true);
      const run = asking(seed, 4);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('readings taken after the quota is cut still count', () => {
    const solution = SOLUTIONS[w4_04.id] as ReferenceSolution;
    const seed = w4_04.seeds[0] as number;
    const result = runReference(w4_04, seed, solution);
    const late = Array.from({ length: 4 }, () => ({
      t: result.trace.endTick,
      botId: 0,
      dt: 0,
      kind: 'sense' as const,
      name: 'inventory',
      ok: true,
      count: 1,
    }));
    const star = must(
      evaluateObjectives(w4_04.bonus ?? [], {
        world: result.world,
        initialWorld: result.initialWorld,
        trace: { ...result.trace, events: [...result.trace.events, ...late] },
        ops: result.ops,
      }).find((one) => one.id === 'within-3-inventory'),
      'the star',
    );
    expect(star.met).toBe(false);
    expect(star.divergence?.received).toBe('4 calls');
  });
});
