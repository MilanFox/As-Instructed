import { describe, expect, test } from 'vitest';
import { budgetFor, declaredUnit, meterFor } from '../budgets.ts';
import type { ObjectiveReading } from '../budgets.ts';
import { campaignOrder } from '../../levels/index.ts';

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
