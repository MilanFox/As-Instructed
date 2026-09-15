import { describe, expect, test } from 'vitest';
import { evaluateObjectives } from '../../engine/index.ts';
import { budgetFor, declaredUnit, meterFor } from '../budgets.ts';
import type { ObjectiveReading } from '../budgets.ts';
import { campaignOrder } from '../../levels/index.ts';
import { runReference } from '../../levels/harness.ts';
import { SOLUTIONS } from '../../levels/__tests__/solutions.ts';

const MINTED = /^within-(\d+)-([A-Za-z]+)$/;

interface Inferred {
  level: string;
  objective: string;
  kind: string;
  unit: string | null;
}

const INFERRED_FROM_LABEL: readonly Inferred[] = [];

function inferredFromLabel(): Inferred[] {
  const found: Inferred[] = [];
  for (const level of campaignOrder()) {
    for (const objective of [...level.objectives, ...(level.bonus ?? [])]) {
      if (objective.meter || MINTED.test(objective.id)) continue;
      const guessed = meterFor(
        { id: objective.id, label: objective.label, met: false },
        { trace: null },
      );
      if (!guessed) continue;
      found.push({
        level: level.id,
        objective: objective.id,
        kind: guessed.kind,
        unit: declaredUnit(objective.label),
      });
    }
  }
  return found;
}

describe('budgets that are still read out of their own English', () => {
  test('are exactly the set on record, inferring exactly what is on record', () => {
    expect(inferredFromLabel()).toEqual([...INFERRED_FROM_LABEL]);
  });

  test('every other campaign budget says what it counts, or counts nothing', () => {
    const guessing = new Set(INFERRED_FROM_LABEL.map((row) => `${row.level}/${row.objective}`));
    for (const level of campaignOrder()) {
      for (const objective of [...level.objectives, ...(level.bonus ?? [])]) {
        if (guessing.has(`${level.id}/${objective.id}`)) continue;
        const readsItsLabel =
          !objective.meter &&
          !MINTED.test(objective.id) &&
          meterFor({ id: objective.id, label: objective.label, met: false }, { trace: null }) !==
            null;
        expect([level.id, objective.id, readsItsLabel]).toEqual([level.id, objective.id, false]);
      }
    }
  });
});

const UNDECLARED_SLACK: readonly string[] = [
  'w2-02/crop-spoilage',
  'w2-03/tile-footprint',
  'w5-05/budget',
];

/**
 * An objective the reference meets while its meter still reads short of its total is a
 * budget: the slack is the point. Unless it declares what it counts, the readout is a
 * bare fraction beside a tick, and `meterFor` has to guess the number from the label.
 */
function metWithSlack(): string[] {
  const found = new Set<string>();
  for (const level of campaignOrder()) {
    const solution = SOLUTIONS[level.id];
    if (!solution) continue;
    const defs = [...level.objectives, ...(level.bonus ?? [])];
    for (const seed of level.seeds) {
      const run = runReference(level, seed, solution);
      const reports = evaluateObjectives(defs, {
        world: run.world,
        trace: run.trace,
        initialWorld: run.initialWorld,
        ops: run.ops,
      });
      for (const objective of defs) {
        if (objective.meter || MINTED.test(objective.id)) continue;
        const report = reports.find((each) => each.id === objective.id);
        if (!report?.met || !report.progress) continue;
        const [done, total] = report.progress;
        if (done < total) found.add(`${level.id}/${objective.id}`);
      }
    }
  }
  return [...found].sort();
}

describe('budgets whose slack is visible but whose meter is not declared', () => {
  test('are exactly the set on record', () => {
    expect(metWithSlack()).toEqual([...UNDECLARED_SLACK].sort());
  });
});

describe('a declared meter', () => {
  const contradicting: ObjectiveReading = {
    id: 'survey-budget',
    label: 'Finish within 16 ticks',
    met: true,
    progress: [9, 16],
    meter: { kind: 'spend', resource: 'beam' },
  };

  test('is used instead of the label, not alongside it', () => {
    expect(meterFor(contradicting, { trace: null })).toEqual({
      kind: 'spend',
      resource: 'beam',
    });
  });

  test('makes an objective a budget even when nothing about its shape says so', () => {
    const plain: ObjectiveReading = {
      id: 'shift',
      label: 'Close the work order',
      met: false,
      progress: [4, 12],
      meter: { kind: 'ticks' },
    };
    expect(budgetFor(plain, { trace: null })).not.toBeNull();
    expect(budgetFor({ ...plain, meter: undefined }, { trace: null })).toBeNull();
  });

  test('carries a declared unit through to the readout, over the label', () => {
    const budget = budgetFor({ ...contradicting, unit: 'beams' }, { trace: null });
    expect(budget?.unit).toBe('beams');
    expect(budgetFor(contradicting, { trace: null })?.unit).toBe('ticks');
  });
});
