/**
 * Which budgets are still read out of their own English, and what happens when one declares.
 *
 * `budgets.ts` used to work out what a number counted by parsing the objective's label:
 * `/\btick(s)?\b/`, then `/\b(op|ops|operation|operations)\b/`, then every sense and resource name
 * the run produced matched word by word, then a trailing `…, in ticks`. A label is prose written
 * for the player. Reword one and the budget silently stopped being a budget — no error, nothing
 * red, a number that quietly stopped scoring — and every objective label in the campaign was
 * rewritten inside one week.
 *
 * An objective can now declare `meter`, and a declared objective is never guessed at. This file
 * holds both halves of that:
 *
 *  - **The declaration wins**, even against a label that says the opposite. That is the whole
 *    point; an objective that has said what it counts must not be re-read out of its prose.
 *  - **The set that has not declared is pinned exactly, and it is now empty.** Every campaign
 *    objective that counts anything says what it counts. Ship one that does not and this fails,
 *    which is the notice nobody got last time.
 *
 * The inference *outcome* is what is asserted, not the label text. A reword that leaves the
 * meaning alone should not fail a test; a reword that moves the number off its meter must.
 *
 * **The fallback parse is not dead and must not be deleted.** It is what makes a *new* objective
 * that forgot to declare read out approximately right instead of silently not scoring, and it is
 * what the assertions below drive directly. What it is no longer allowed to be is load-bearing for
 * anything the campaign ships.
 */
import { describe, expect, test } from 'vitest';
import { budgetFor, declaredUnit, meterFor } from '../budgets.ts';
import type { ObjectiveReading } from '../budgets.ts';
import { campaignOrder } from '../../levels/index.ts';

/** The shape `budgets.ts` mints ids in. An objective with one of these never needs its label. */
const MINTED = /^within-(\d+)-([A-Za-z]+)$/;

interface Inferred {
  level: string;
  objective: string;
  /** What the words alone say this counts. */
  kind: string;
  /** What a trailing `…, in <unit>` gives, or null where the label has no such tail. */
  unit: string | null;
}

/**
 * Every campaign objective whose meter comes from nowhere but its label. There are none.
 *
 * It was six, then two. Four went with the bonus rework — the list getting shorter for the best
 * possible reason, because the objectives stopped existing. The last two,
 * `w8-03 within-shift` and `w8-05 deadline`, were both `Objectives.custom` and were **blocked on
 * the engine**: `CustomReport` was `{ progress?, divergence }` and had no path for a meter to reach
 * the objective at all. It now carries `meter` and `unit` and `custom()` forwards them
 * (DESIGN.md §5), so both declare and both dropped the
 * `…, in ticks` tail they were only carrying to feed the parser.
 *
 * An empty list is the strongest form this guard has ever been in, and it is the form to keep it
 * in: the next objective that counts something and does not say what fails here on the day it is
 * written.
 */
const INFERRED_FROM_LABEL: readonly Inferred[] = [];

function inferredFromLabel(): Inferred[] {
  const found: Inferred[] = [];
  for (const level of campaignOrder()) {
    for (const objective of [...level.objectives, ...(level.bonus ?? [])]) {
      if (objective.meter || MINTED.test(objective.id)) continue;
      /* An empty source leaves only the label to go on: no trace to name the run's own meters,
         no progress history to corroborate one against. That isolates the words. */
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
    /* `budgetFor` otherwise needs an objective that is met while incomplete, or unmet while full,
       or minted, or trailing `…, in <unit>`. A declaration is the level saying it outright. */
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
    /* Without the declaration, `unitFor` reads "16 ticks" off the label and says ticks. */
    expect(budgetFor(contradicting, { trace: null })?.unit).toBe('ticks');
  });
});
