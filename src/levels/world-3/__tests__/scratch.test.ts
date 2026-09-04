import { test } from 'vitest';
import { scoreChars } from '../../../engine/index.ts';
import { runReference } from '../../harness.ts';
import { WORLD_3_LEVELS } from '../index.ts';
import { solution as s1 } from '../__solutions__/w3-01.ts';
import { solution as s2 } from '../__solutions__/w3-02.ts';
import { solution as s3 } from '../__solutions__/w3-03.ts';
import { solution as s4 } from '../__solutions__/w3-04.ts';
import { solution as s5 } from '../__solutions__/w3-05.ts';

const ALL = [s1, s2, s3, s4, s5];

test('measure', () => {
  for (const level of WORLD_3_LEVELS) {
    const solution = ALL.find((s) => s.levelId === level.id)!;
    const ticks: number[] = [];
    const passed: boolean[] = [];
    for (const seed of level.seeds) {
      const r = runReference(level, seed, solution);
      ticks.push(r.ticks);
      passed.push(r.verdict.passed);
      if (!r.verdict.passed) console.log(level.id, seed, JSON.stringify(r.verdict.objectives));
    }
    console.log(
      level.id, 'ticks', ticks.join(','), 'worst', Math.max(...ticks),
      'pass', passed.join(','), 'chars', scoreChars(solution.source),
    );
  }
});
