import { describe, expect, test } from 'vitest';
import type { ObjectiveContext, Sim } from '../../../engine/index.ts';
import { Dir, evaluateObjectives } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { ReferenceSolution } from '../../types.ts';
import { mainsLayout, w5_01 } from '../w5-01.ts';
import { w5_05 } from '../w5-05.ts';

const STAR = 'name-the-weak-link';

function scored(seed: number, drive: (sim: Sim, bot: number) => void) {
  const result = runLevel(w5_05, seed, drive);
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  return {
    passed: result.verdict.passed,
    ticks: result.trace.endTick,
    met: must(evaluateObjectives(w5_05.bonus ?? [], ctx)[0], STAR).met,
  };
}

function reportedAs(seed: number, rewrite: (line: string) => string | null) {
  const solution = SOLUTIONS[w5_05.id] as ReferenceSolution;
  const result = runReference(w5_05, seed, solution);
  const events = result.trace.events.flatMap((event) => {
    if (event.kind !== 'print' || !event.text.startsWith('weak ')) return [event];
    const line = rewrite(event.text);
    return line === null ? [] : [{ ...event, text: line }];
  });
  const stars = evaluateObjectives(w5_05.bonus ?? [], {
    world: result.world,
    initialWorld: result.initialWorld,
    trace: { ...result.trace, events },
    ops: result.ops,
  });
  return {
    passed: result.verdict.passed,
    ticks: result.trace.endTick,
    met: must(stars[0], STAR).met,
  };
}

describe('w5-05 name-the-weak-link', () => {
  test('the reference solution earns it on every seed, still inside par', () => {
    const solution = SOLUTIONS[w5_05.id] as ReferenceSolution;
    for (const seed of w5_05.seeds) {
      const result = runReference(w5_05, seed, solution);
      const stars = evaluateObjectives(w5_05.bonus ?? [], {
        world: result.world,
        initialWorld: result.initialWorld,
        trace: result.trace,
        ops: result.ops,
      });
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
      expect(result.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w5_05.par.ticks);
      expect(must(stars[0], STAR).met, `seed ${String(seed)}`).toBe(true);
    }
  });

  test('the same tree without its outage line lights the district and is refused', () => {
    for (const seed of w5_05.seeds) {
      const run = reportedAs(seed, () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w5_05.par.ticks);
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the right station under a wrong figure is refused on every seed', () => {
    for (const seed of w5_05.seeds) {
      const run = reportedAs(seed, (line) => {
        const parts = line.split(' ');
        return `weak ${parts[1] ?? ''} ${String(Number(parts[2]) - 1)}`;
      });
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the right figure under the wrong station is refused on every seed', () => {
    for (const seed of w5_05.seeds) {
      const run = reportedAs(seed, (line) => `weak sub-99 ${line.split(' ')[2] ?? ''}`);
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a do-nothing program is refused on every seed', () => {
    for (const seed of w5_05.seeds) {
      const run = scored(seed, (sim, botId) => {
        sim.print(botId, '.');
      });
      expect(run.passed, `seed ${String(seed)}`).toBe(false);
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });
});

const ORDER_STAR = 'order-declared';

function orderStar(seed: number, rewrite?: (text: string) => string | null) {
  const solution = SOLUTIONS[w5_01.id] as ReferenceSolution;
  const result = runReference(w5_01, seed, solution);
  const events = result.trace.events.flatMap((event) => {
    if (rewrite === undefined || event.kind !== 'print') return [event];
    const line = rewrite(event.text);
    return line === null ? [] : [{ ...event, text: line }];
  });
  const stars = evaluateObjectives(w5_01.bonus ?? [], {
    world: result.world,
    initialWorld: result.initialWorld,
    trace: { ...result.trace, events },
    ops: result.ops,
  });
  return {
    passed: result.verdict.passed,
    ticks: result.trace.endTick,
    star: must(
      stars.find((each) => each.id === ORDER_STAR),
      ORDER_STAR,
    ),
  };
}

describe('w5-01 order-declared', () => {
  test('the reference solution earns it on every seed, still inside par', () => {
    for (const seed of w5_01.seeds) {
      const run = orderStar(seed);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w5_01.par.ticks);
      expect(run.star.met, `seed ${String(seed)}`).toBe(true);
    }
  });

  test('the same run without its order line brings the line up and is refused', () => {
    for (const seed of w5_01.seeds) {
      const run = orderStar(seed, () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.star.met, `seed ${String(seed)}`).toBe(false);
      expect(run.star.divergence?.where, `seed ${String(seed)}`).toBe('the order');
    }
  });

  test('an order one station short of the walk is refused, and the latch is named', () => {
    for (const seed of w5_01.seeds) {
      const stations = mainsLayout(seed).names.length;
      const run = orderStar(seed, (text) => text.split(' ').slice(0, -1).join(' '));
      expect(run.star.met, `seed ${String(seed)}`).toBe(false);
      expect(run.star.divergence?.where, `seed ${String(seed)}`).toBe(`switch ${String(stations)}`);
      expect(run.star.divergence?.expected, `seed ${String(seed)}`).toBe('the list to end here');
    }
  });

  test('the stencilled numbering is refused: sub-1 upward is not the chain', () => {
    for (const seed of w5_01.seeds) {
      const count = mainsLayout(seed).names.length;
      const byLabel = Array.from({ length: count }, (_, k) => `sub-${String(k + 1)}`).join(' ');
      const run = orderStar(seed, () => byLabel);
      expect(run.star.met, `seed ${String(seed)}`).toBe(false);
      expect(run.star.divergence?.where, `seed ${String(seed)}`).toMatch(/^switch \d+$/);
    }
  });

  test('a run that names the order only after it has driven is refused', () => {
    for (const seed of w5_01.seeds) {
      const { reactorAt, stations, names } = mainsLayout(seed);
      const stride = (stations[0] ?? 0) > reactorAt.x ? 1 : -1;
      const result = runLevel(w5_01, seed, (sim, botId) => {
        sim.move(botId, stride > 0 ? Dir.East : Dir.West);
        sim.print(botId, `sub-${String(names[0] ?? 1)}`);
      });
      const stars = evaluateObjectives(w5_01.bonus ?? [], {
        world: result.world,
        initialWorld: result.initialWorld,
        trace: result.trace,
        ops: result.ops,
      });
      const star = must(
        stars.find((each) => each.id === ORDER_STAR),
        ORDER_STAR,
      );
      expect(star.met, `seed ${String(seed)}`).toBe(false);
      expect(star.divergence?.received, `seed ${String(seed)}`).toBe('the bot moved first');
    }
  });

  test('an idle program is refused on every seed', () => {
    for (const seed of w5_01.seeds) {
      const result = runLevel(w5_01, seed, (sim, botId) => {
        sim.print(botId, '.');
      });
      const stars = evaluateObjectives(w5_01.bonus ?? [], {
        world: result.world,
        initialWorld: result.initialWorld,
        trace: result.trace,
        ops: result.ops,
      });
      const star = must(
        stars.find((each) => each.id === ORDER_STAR),
        ORDER_STAR,
      );
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(false);
      expect(star.met, `seed ${String(seed)}`).toBe(false);
    }
  });
});
