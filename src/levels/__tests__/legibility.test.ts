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
