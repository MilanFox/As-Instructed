/**
 * Every objective in the campaign can say *where* a run went wrong.
 *
 * 71 of the 82 objective calls were `Objectives.custom`
 * with no divergence, so 31 of 33 work orders could only ever report the string `not met`. The
 * core loop is run → fail → read → revise, and with nothing to read it degrades to guessing.
 * `src/levels/__tests__/divergence.test.ts` is the same idea applied to four specific levels; this
 * file is the one that makes the silence impossible to reintroduce anywhere.
 *
 * The rule is one line: **an objective either reports a divergence or declares itself binary.**
 * A progress tuple is not a third option — `0 of 5 — 5 short` is the exact readout that cost a
 * beginner playtester fifty-five minutes: four plausible answers and an empty program all
 * produced it.
 *
 * The type system now asks the same question at every call site: `Objectives.custom` takes a
 * `CustomReport` whose `divergence` is required. This file is what catches the two things a type
 * cannot — a `divergence` that exists and returns `undefined` on the commonest failure there is,
 * and a `checkbox` reached for because it was easier than thinking.
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
 * Every objective the campaign ships that declares itself binary rather than reporting a diff.
 *
 * It is empty, and that is the finding rather than an accident: all 98 objectives across the 34
 * work orders turned out to hold a tick, a tile, a count or a pair of values they had already
 * computed and were throwing away. `Objectives.checkbox` stays because the rule needs a legal way
 * to say "there is genuinely nothing here", and because a rule with no exit is one people route
 * around. Adding one means adding a line here, which is the point.
 */
const BINARY_BY_DESIGN: readonly string[] = [];

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
    expect(silent).toEqual([]);
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

  test('the binary objectives are exactly the ones on record', () => {
    const binary = LEVELS.flatMap((level) =>
      objectivesOf(level)
        .filter((objective) => objective.binary === true)
        .map((objective) => nameOf(level, objective)),
    );
    expect(binary.sort()).toEqual([...BINARY_BY_DESIGN].sort());
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
