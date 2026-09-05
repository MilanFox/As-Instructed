/**
 * Every objective in the campaign can say *where* a run went wrong.
 *
 * `docs/AUDIT-INCENTIVES.md` finding 1: 71 of the 82 objective calls were `Objectives.custom`
 * with no divergence, so 31 of 34 work orders could only ever report the string `not met`. The
 * core loop is run → fail → read → revise, and with nothing to read it degrades to guessing.
 * `src/levels/__tests__/divergence.test.ts` is the same idea applied to four specific levels; this
 * file is the one that makes the silence impossible to reintroduce anywhere.
 *
 * The rule is one line: **an objective either reports a divergence or declares itself binary.**
 * A progress tuple is not a third option — `0 of 5 — 5 short` is the exact readout the beginner
 * playtest lost fifty-five minutes to (`docs/PLAYTEST-BEGINNER.md` §3).
 */
import { describe, expect, test } from 'vitest';
import type { Objective, ObjectiveContext } from '../../engine/index.ts';
import { DIVERGENCE_VALUE_CHARS, evaluateObjectives } from '../../engine/index.ts';
import { LEVELS } from '../index.ts';
import { runLevel } from '../harness.ts';
import type { LevelDef } from '../types.ts';

function objectivesOf(level: LevelDef): Objective[] {
  return [...level.objectives, ...(level.bonus ?? [])];
}

function nameOf(level: LevelDef, objective: Objective): string {
  return `${level.id}/${objective.id}`;
}

/**
 * Objectives that still report a bare bit, listed so that the ones left are countable.
 *
 * The assertion below is a **subset** check, not an equality one: an id may leave this list the
 * moment its level is converted, and nothing new may ever join it. `docs/FIX-DIVERGENCE.md`
 * records which worlds are done. When the list empties, delete it and the positional overload of
 * `Objectives.custom` with it.
 */
const AWAITING_A_DIFF: readonly string[] = [
  'w3-01/pads-loaded',
  'w3-01/clean-run',
  'w3-02/crates-sorted',
  'w3-02/one-depot-at-a-time',
  'w3-04/bay-cleared',
  'w3-04/bay-in-order',
  'w3-04/aisle-discipline',
  'w5-01/energised',
  'w5-01/in-order',
  'w5-01/one-pass',
  'w5-02/patched',
  'w5-03/cabled',
  'w5-03/energised',
  'w5-03/in-order',
  'w5-03/tight-order',
  'w5-04/assigned',
  'w5-04/within-capacity',
  'w5-04/largest-idle',
  'w5-05/connected',
  'w5-05/budget',
  'w5-05/energised',
  'w5-05/tight',
  'w6-01/log-the-band',
  'w6-02/relay-clean',
  'w6-02/name-the-fault',
  'w6-03/shorter-encoding',
  'w6-04/relay-plain',
  'w6-04/straggler',
  'w6-05/reach-pad',
  'w6-05/repair-blocks',
  'w7-01/both-parked',
  'w7-01/both-heard',
  'w7-01/no-slack',
  'w7-02/field-cleared',
  'w7-02/within-ten-percent',
  'w7-03/crates-in-silo',
  'w7-03/no-bumps',
  'w7-04/board-clear',
  'w7-04/within-bound',
  'w7-05/sites-up',
  'w7-05/told-where-to-go',
  'w7-05/workers-busy',
];

/**
 * `Objectives.checkbox` is the deliberate way to say an objective has nothing to diverge on, and
 * it is only worth having if it stays rare enough that a reviewer can read the whole list. The cap
 * is the guard against it becoming the new default; the list itself is printed on failure.
 */
const MAX_BINARY = 12;

describe('every objective can name where the run went wrong', () => {
  test('an objective either reports a divergence or declares itself binary', () => {
    const silent: string[] = [];
    for (const level of LEVELS) {
      for (const objective of objectivesOf(level)) {
        if (objective.binary === true) continue;
        if (typeof objective.divergence === 'function') continue;
        silent.push(nameOf(level, objective));
      }
    }
    expect(silent.filter((id) => !AWAITING_A_DIFF.includes(id))).toEqual([]);
  });

  test('no objective is both binary and divergent', () => {
    const both: string[] = [];
    for (const level of LEVELS) {
      for (const objective of objectivesOf(level)) {
        if (objective.binary === true && objective.divergence !== undefined) {
          both.push(nameOf(level, objective));
        }
      }
    }
    expect(both).toEqual([]);
  });

  test('a binary objective carries no progress tuple either', () => {
    const counted: string[] = [];
    for (const level of LEVELS) {
      for (const objective of objectivesOf(level)) {
        if (objective.binary === true && objective.progress !== undefined) {
          counted.push(nameOf(level, objective));
        }
      }
    }
    expect(counted).toEqual([]);
  });

  test('checkbox stays rare enough to read in one sitting', () => {
    const binary = LEVELS.flatMap((level) =>
      objectivesOf(level)
        .filter((objective) => objective.binary === true)
        .map((objective) => nameOf(level, objective)),
    );
    expect(binary.length, binary.join(', ')).toBeLessThanOrEqual(MAX_BINARY);
  });
});

/**
 * The static check above proves a `divergence` function exists. This one proves it *fires*: the
 * empty program is the run every player makes at least once, and it is the run the audit's `not
 * met` was measured on. Every objective it misses must come back with a filled-in point.
 */
describe('an empty program is told where it fell short', () => {
  for (const level of LEVELS) {
    const seed = level.seeds[0] as number;

    test(`${level.id} names a point for every objective the empty program misses`, () => {
      const result = runLevel(level, seed, () => undefined);
      const ctx: ObjectiveContext = {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      };
      const reports = evaluateObjectives(objectivesOf(level), ctx);

      const mute: string[] = [];
      for (const [index, report] of reports.entries()) {
        const objective = objectivesOf(level)[index] as Objective;
        if (report.met || objective.binary === true) continue;
        if (AWAITING_A_DIFF.includes(nameOf(level, objective))) continue;
        if (report.divergence === undefined) {
          mute.push(nameOf(level, objective));
          continue;
        }
        const { where, expected, received } = report.divergence;
        for (const [field, value] of Object.entries({ where, expected, received })) {
          expect(value, `${nameOf(level, objective)} ${field}`).not.toBe('');
          expect(
            value.length,
            `${nameOf(level, objective)} ${field}: ${value}`,
          ).toBeLessThanOrEqual(DIVERGENCE_VALUE_CHARS);
        }
      }
      expect(mute).toEqual([]);
    });
  }
});
