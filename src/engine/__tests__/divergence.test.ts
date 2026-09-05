import { describe, expect, test } from 'vitest';
import type { ObjectiveContext } from '../index.ts';
import {
  DIVERGENCE_VALUE_CHARS,
  Dir,
  MachineKind,
  NOTHING,
  Objectives,
  buildVerdict,
  clipValue,
  evaluateObjectives,
  vec,
} from '../index.ts';
import { contextFor, openWorld, placeMachine } from './helpers.ts';

function afterPrinting(lines: readonly string[]): ObjectiveContext {
  return contextFor(openWorld(4, 3, 1), (sim) => {
    for (const line of lines) sim.print(0, line);
  });
}

const MANIFEST = ['part 5', 'cell 4', 'stone 5', 'ice 1'];

describe('printedSequence names the first line that differs', () => {
  test('a wrong line reports its number, what was wanted and what arrived', () => {
    const objective = Objectives.printedSequence(MANIFEST);
    const ctx = afterPrinting(['part 5', 'cell 4', 'stone 3', 'ice 1']);

    expect(objective.evaluate(ctx)).toBe(false);
    expect(objective.divergence?.(ctx)).toEqual({
      where: 'line 3',
      expected: 'stone 5',
      received: 'stone 3',
    });
  });

  test('printing nothing is no longer the same report as printing plausible lines', () => {
    const objective = Objectives.printedSequence(MANIFEST);
    const silent = objective.divergence?.(afterPrinting([]));
    const plausible = objective.divergence?.(afterPrinting(['part 5', 'cell 4', 'stone 3']));

    expect(silent).toEqual({ where: 'line 1', expected: 'part 5', received: NOTHING });
    expect(plausible?.where).toBe('line 3');
    expect(plausible).not.toEqual(silent);
  });

  test('an extra line is reported as a line that should not be there', () => {
    const objective = Objectives.printedSequence(MANIFEST);
    const ctx = afterPrinting([...MANIFEST, 'scrap 2']);

    expect(objective.evaluate(ctx)).toBe(false);
    expect(objective.divergence?.(ctx)).toEqual({
      where: 'line 5',
      expected: NOTHING,
      received: 'scrap 2',
    });
  });

  test('a run that printed exactly the manifest has nothing to diff', () => {
    const objective = Objectives.printedSequence(MANIFEST);
    const ctx = afterPrinting(MANIFEST);

    expect(objective.evaluate(ctx)).toBe(true);
    expect(objective.divergence?.(ctx)).toBeUndefined();
  });

  test('long values are cut rather than wrapped', () => {
    const long = 'x'.repeat(DIVERGENCE_VALUE_CHARS * 2);
    const objective = Objectives.printedSequence([long]);
    const divergence = objective.divergence?.(afterPrinting([`${long}!`]));

    expect(divergence?.expected).toBe(clipValue(long));
    expect(divergence?.expected).toHaveLength(DIVERGENCE_VALUE_CHARS);
    expect(divergence?.expected.endsWith('…')).toBe(true);
    expect(divergence?.received).toHaveLength(DIVERGENCE_VALUE_CHARS);
  });
});

describe('botAt reports the tile the bot actually finished on', () => {
  test('a bot parked one tile short says so', () => {
    const objective = Objectives.botAt(vec(3, 0));
    const ctx = contextFor(openWorld(5, 3, 1), (sim) => {
      sim.move(0, Dir.East);
      sim.move(0, Dir.East);
    });

    expect(objective.evaluate(ctx)).toBe(false);
    expect(objective.divergence?.(ctx)).toEqual({
      where: 'end of run',
      expected: '(3, 0)',
      received: '(2, 0)',
    });
  });
});

describe('machineState reports the state the machine was left in', () => {
  test('an untouched terminal reports its own id and both states', () => {
    const world = openWorld(4, 3, 1);
    placeMachine(world, {
      id: 'terminal',
      kind: MachineKind.Lever,
      at: vec(3, 2),
      state: 'idle',
      cycle: ['idle', 'filed'],
    });
    const objective = Objectives.machineState('terminal', 'filed');
    const ctx = contextFor(world);

    expect(objective.divergence?.(ctx)).toEqual({
      where: 'terminal',
      expected: 'filed',
      received: 'idle',
    });
  });
});

describe('the verdict carries the divergence, and only where there is one', () => {
  test('a met objective is never asked for one', () => {
    let asked = 0;
    const objective = Objectives.custom(
      'always',
      'Always true',
      () => true,
      undefined,
      () => {
        asked++;
        return { where: 'nowhere', expected: 'a', received: 'b' };
      },
    );
    const [report] = evaluateObjectives([objective], afterPrinting([]));

    expect(asked).toBe(0);
    expect(report?.divergence).toBeUndefined();
  });

  test('an objective that reports nothing stays exactly as it was', () => {
    const ctx = afterPrinting([]);
    const [report] = evaluateObjectives(
      [Objectives.custom('silent', 'Says nothing', () => false)],
      ctx,
    );

    expect(report).toEqual({ id: 'silent', label: 'Says nothing', met: false });
  });

  test('buildVerdict passes it through to the report', () => {
    const ctx = afterPrinting(['part 5', 'cell 9']);
    const verdict = buildVerdict({
      ...ctx,
      objectives: [Objectives.printedSequence(MANIFEST)],
      ops: 0,
      chars: 0,
      seeds: 1,
    });

    expect(verdict.objectives[0]?.divergence).toEqual({
      where: 'line 2',
      expected: 'cell 4',
      received: 'cell 9',
    });
  });
});
