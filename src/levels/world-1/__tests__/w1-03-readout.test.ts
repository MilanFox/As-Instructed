import { describe, expect, test } from 'vitest';
import type { MoveEvent, ObjectiveContext, Objective, Sim } from '../../../engine/index.ts';
import { evaluateObjectives } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { budgetFor } from '../../../game/budgets.ts';
import { runLevel, runReference } from '../../harness.ts';
import { movesIssued, visitedTiles, walkableTiles } from '../shared.ts';
import { w1_03 } from '../w1-03.ts';
import { solution as reference } from '../__solutions__/w1-03.ts';

const DEFS: Objective[] = [...w1_03.objectives, ...(w1_03.bonus ?? [])];

function read(result: ReturnType<typeof runLevel>) {
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  const reports = evaluateObjectives(DEFS, ctx);
  const row = (id: string) => {
    const objective = must(
      DEFS.find((each) => each.id === id),
      id,
    );
    const report = must(
      reports.find((each) => each.id === id),
      id,
    );
    const budget = budgetFor(
      {
        id: report.id,
        label: report.label,
        met: report.met,
        progress: report.progress,
        meter: report.meter,
        unit: report.unit,
      },
      { trace: result.trace, tick: result.trace.endTick, stats: result.verdict.stats },
    );
    return { objective, report, budget };
  };
  return { ctx, row, floor: walkableTiles(result.initialWorld).length };
}

/** The reference drive with its last `dropped` moves never issued. */
function shortOf(seed: number, dropped: number) {
  const full = runReference(w1_03, seed, reference);
  const dirs = full.trace.events
    .filter((event): event is MoveEvent => event.kind === 'move')
    .map((event) => event.dir);
  const wanted = dirs.slice(0, dirs.length - dropped);
  return runLevel(w1_03, seed, (sim: Sim, botId: number) => {
    for (const dir of wanted) sim.move(botId, dir);
  });
}

describe('w1-03 grades the same number it shows', () => {
  test('the tiles meter counts every floor tile, start tile included', () => {
    for (const seed of w1_03.seeds) {
      const run = runReference(w1_03, seed, reference);
      const { ctx, row, floor } = read(run);
      const { report } = row('inspect-all');
      const progress = must(report.progress, 'progress');

      expect({ seed, done: progress[0], total: progress[1] }) //
        .toEqual({ seed, done: floor, total: floor });
      expect(visitedTiles(ctx).size).toBe(floor);
    }
  });

  test('the denominator it shows is the threshold it grades, on every seed', () => {
    for (const seed of w1_03.seeds) {
      for (const dropped of [0, 1, 2]) {
        const { row } = read(shortOf(seed, dropped));
        const { report } = row('inspect-all');
        const [done, total] = must(report.progress, 'progress');

        expect({ seed, dropped, met: report.met }) //
          .toEqual({ seed, dropped, met: done === total });
        expect({ seed, dropped, short: total - done }).toEqual({ seed, dropped, short: dropped });
      }
    }
  });

  test('a run that stops short names a tile it never entered', () => {
    for (const seed of w1_03.seeds) {
      const { row } = read(shortOf(seed, 1));
      const { report } = row('inspect-all');

      expect(report.met).toBe(false);
      expect(must(report.divergence, 'divergence')).toMatchObject({
        expected: 'entered at least once',
        received: 'never entered',
      });
    }
  });

  test('the tiles meter is never read as a budget, so it never shows slack', () => {
    for (const seed of w1_03.seeds) {
      for (const dropped of [0, 1, 2]) {
        const { row } = read(shortOf(seed, dropped));
        const { report, budget } = row('inspect-all');

        expect({ seed, dropped, budget }).toEqual({ seed, dropped, budget: null });
        expect({ seed, dropped, unit: report.unit }).toEqual({ seed, dropped, unit: 'tiles' });
      }
    }
  });
});

describe('w1-03 says what the star counts, so a met star showing slack reads as one', () => {
  test('the move budget declares its meter rather than leaving it to the label', () => {
    const star = must(
      DEFS.find((each) => each.id === 'one-move-per-tile'),
      'one-move-per-tile',
    );
    expect(star.meter).toEqual({ kind: 'events', event: 'move' });
    expect(star.unit).toBe('moves');
  });

  test('it reads out moves against the floor count, on every seed and every run', () => {
    for (const seed of w1_03.seeds) {
      for (const dropped of [0, 1, 2]) {
        const run = shortOf(seed, dropped);
        const { ctx, row, floor } = read(run);
        const { budget } = row('one-move-per-tile');
        const shown = must(budget, 'a budget');

        expect({ seed, dropped, used: shown.used, limit: shown.limit, unit: shown.unit }) //
          .toEqual({ seed, dropped, used: movesIssued(ctx), limit: floor, unit: 'moves' });
      }
    }
  });

  test('an overrun is read out in moves too, not left to the progress bar', () => {
    for (const seed of w1_03.seeds) {
      const floor = walkableTiles(w1_03.build(seed)).length;
      const run = runLevel(w1_03, seed, (sim: Sim, botId: number) => {
        reference.run(sim, botId);
        for (let step = 0; step < 3; step++) sim.move(botId, 0);
      });
      const { row } = read(run);
      const { report, budget } = row('one-move-per-tile');
      const shown = must(budget, 'a budget');

      expect({ seed, met: report.met, limit: shown.limit, unit: shown.unit }) //
        .toEqual({ seed, met: false, limit: floor, unit: 'moves' });
      expect(shown.over).toBeGreaterThan(0);
    }
  });
});
