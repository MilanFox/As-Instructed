import { describe, expect, test } from 'vitest';
import type { Trace, TraceEvent } from '../../engine/index.ts';
import type { ObjectiveReading } from '../budgets.ts';
import { budgetFor, budgetReadout, failureCauses, meterFor, overBudgetLine } from '../budgets.ts';

function traceOf(events: TraceEvent[], endTick: number): Trace {
  return {
    seed: 1,
    endTick,
    events,
    keyframes: [],
    initialWorld: { w: 1, h: 1, tiles: [], bots: [], machines: [], items: [], vars: {}, tick: 0 },
  } as unknown as Trace;
}

const sense = (t: number, name: string, count = 1): TraceEvent =>
  ({ t, kind: 'sense', name, count }) as unknown as TraceEvent;

const spend = (t: number, resource: string, amount: number): TraceEvent =>
  ({ t, kind: 'spend', resource, amount }) as unknown as TraceEvent;

const mark = (t: number): TraceEvent =>
  ({ t, kind: 'mark', at: { x: 0, y: 0 }, text: 'x' }) as unknown as TraceEvent;

describe('budgets recover the number the clamp throws away', () => {
  test('a tick booking overrun reports the real makespan and the unit', () => {
    const objective: ObjectiveReading = {
      id: 'bay-booking',
      label: 'Clear the bay within 60 ticks',
      met: false,
      progress: [60, 60],
    };
    const budget = budgetFor(objective, { trace: traceOf([], 80) });
    expect(budget).not.toBeNull();
    expect(budget?.used).toBe(80);
    expect(budget?.over).toBe(20);
    expect(budgetReadout(budget!)).toBe('80 / 60 ticks');
    expect(overBudgetLine(budget!)).toBe('over by 20 ticks');
  });

  test('a sense budget takes its unit from the level, not from the command name', () => {
    const objective: ObjectiveReading = {
      id: 'within-16-look',
      label: 'Survey the field on at most 16 beams',
      met: false,
      progress: [16, 16],
    };
    const events = Array.from({ length: 21 }, (_, i) => sense(i, 'look'));
    const budget = budgetFor(objective, { trace: traceOf(events, 40) });
    expect(budgetReadout(budget!)).toBe('21 / 16 beams');
    expect(budget?.over).toBe(5);
  });

  test('the engine\'s own wording falls back to the command name rather than "times"', () => {
    const objective: ObjectiveReading = {
      id: 'within-10-probe',
      label: 'Use probe at most 10 times',
      met: false,
      progress: [10, 10],
    };
    const events = Array.from({ length: 13 }, (_, i) => sense(i, 'probe'));
    const budget = budgetFor(objective, { trace: traceOf(events, 30) });
    expect(budgetReadout(budget!)).toBe('13 / 10 probe calls');
  });

  test('a resource budget is found from the resource named in its own label', () => {
    const objective: ObjectiveReading = {
      id: 'budget',
      label: 'Stay inside the cable drum',
      met: false,
      progress: [72, 72],
    };
    const trace = traceOf([spend(1, 'cable', 90), spend(2, 'cable', 43)], 40);
    const budget = budgetFor(objective, { trace });
    expect(budget?.meter).toEqual({ kind: 'spend', resource: 'cable' });
    expect(budgetReadout(budget!)).toBe('133 / 72 cable');
  });

  test('spend is read at the playhead, so the rail counts up while the run plays', () => {
    const objective: ObjectiveReading = {
      id: 'within-16-look',
      label: 'Survey the field on at most 16 beams',
      met: true,
      progress: [4, 16],
    };
    const events = Array.from({ length: 21 }, (_, i) => sense(i * 2, 'look'));
    const budget = budgetFor(objective, { trace: traceOf(events, 40), tick: 8 });
    expect(budget?.used).toBe(5);
    expect(budget?.over).toBe(0);
  });

  test('an objective the player is working towards is not a budget', () => {
    const objective: ObjectiveReading = {
      id: 'ripe-to-silo',
      label: 'Deliver every crop that was ripe at the start to the silo',
      met: false,
      progress: [3, 12],
    };
    expect(budgetFor(objective, { trace: traceOf([], 40) })).toBeNull();
  });

  test('a full-but-unmet objective with nothing behind it stays a tick-box', () => {
    const objective: ObjectiveReading = {
      id: 'printed-sequence',
      label: 'Report 3 lines, in order',
      met: false,
      progress: [3, 3],
    };
    expect(budgetFor(objective, { trace: traceOf([], 40) })).toBeNull();
  });
});

describe('meters a level never named', () => {
  const deadline: ObjectiveReading = {
    id: 'deadline',
    label: 'Finish inside the shift',
    met: false,
    progress: [160, 160],
  };

  test('are left unattributed when the only evidence is the clamped figure', () => {
    expect(meterFor(deadline, { trace: traceOf([], 400) })).toBeNull();
  });

  test('are identified from the progress history, before the clamp bit', () => {
    const history = [
      { t: 40, done: 40 },
      { t: 90, done: 90 },
    ];
    expect(meterFor(deadline, { trace: traceOf([], 400), history })).toEqual({ kind: 'ticks' });
  });

  test('are not guessed at when a different total explains the history', () => {
    const stray: ObjectiveReading = {
      id: 'no-resurvey',
      label: 'Walk almost nothing the plan already described',
      met: false,
      progress: [4, 4],
    };
    const history = [
      { t: 40, done: 2 },
      { t: 90, done: 3 },
    ];
    expect(meterFor(stray, { trace: traceOf([], 400), history })).toBeNull();
  });

  test('come from a trace event kind when the label names one', () => {
    const objective: ObjectiveReading = {
      id: 'mark-budget',
      label: 'Reach the vein having placed fewer than 180 marks',
      met: false,
      progress: [180, 180],
    };
    const events = Array.from({ length: 212 }, (_, i) => mark(i));
    const budget = budgetFor(objective, { trace: traceOf(events, 400) });
    expect(budget?.meter).toEqual({ kind: 'events', event: 'mark' });
    expect(budgetReadout(budget!)).toBe('212 / 180 marks');
  });
});

describe('failureCauses ranks what went wrong', () => {
  test('worst first, with the number that says how badly', () => {
    const trace = traceOf(
      Array.from({ length: 21 }, (_, i) => sense(i, 'look')),
      40,
    );
    const causes = failureCauses(
      [
        {
          id: 'ripe-to-silo',
          label: 'Deliver the ripe crops',
          met: false,
          progress: [9, 12],
        },
        {
          id: 'within-16-look',
          label: 'Survey the field on at most 16 beams',
          met: false,
          progress: [16, 16],
        },
        { id: 'shift-budget', label: 'Close the shift within 215 ticks', met: true },
      ],
      { trace },
    );
    expect(causes.map((cause) => cause.id)).toEqual(['within-16-look', 'ripe-to-silo']);
    expect(causes[0]?.detail).toBe('over by 5 beams');
    expect(causes[1]?.detail).toBe('9 of 12 — 3 short');
  });

  test('a binary objective still says something', () => {
    const causes = failureCauses(
      [{ id: 'reach-pad', label: 'Park the bot on the landing pad', met: false }],
      { trace: traceOf([], 80) },
    );
    expect(causes[0]?.detail).toBe('not met');
  });

  test('a divergence rides along with the cause, so the report can show the diff', () => {
    const divergence = { where: 'line 3', expected: 'stone 5', received: 'ice 1' };
    const causes = failureCauses(
      [
        {
          id: 'manifest-printed',
          label: 'Report one line per class present',
          met: false,
          progress: [0, 5],
          divergence,
        },
        { id: 'manifest-filed', label: 'Leave the terminal reading filed', met: false },
      ],
      { trace: traceOf([], 80) },
    );
    expect(causes[0]?.divergence).toEqual(divergence);
    expect(causes[1]?.divergence).toBeNull();
  });

  test('a met objective is not a cause, diff or no diff', () => {
    const causes = failureCauses(
      [
        {
          id: 'manifest-printed',
          label: 'Report one line per class present',
          met: true,
          divergence: { where: 'line 3', expected: 'a', received: 'b' },
        },
      ],
      { trace: traceOf([], 80) },
    );
    expect(causes).toEqual([]);
  });
});
