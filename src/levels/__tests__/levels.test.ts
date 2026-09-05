import { describe, expect, test } from 'vitest';
import { Dir, evaluateObjectives, medalFor, scoreChars } from '../../engine/index.ts';
import { apiUnlockedAt } from '../../runtime/api-spec.ts';
import { LIBRARY_FIRST_WORLD, requirementsFor } from '../../meta/unlock.ts';
import { LEVELS, campaignOrder, getLevel, hardwareUnlockedBy, levelsByWorld } from '../index.ts';
import { runLevel, runReference } from '../harness.ts';
import type { ReferenceSolution } from '../types.ts';
import {
  fieldSweep,
  flatReader,
  literalPlanFollower,
  rawRelay,
  roundRobinDispatch,
} from './naive.ts';

import { solution as w1_01 } from '../world-1/__solutions__/w1-01.ts';
import { solution as w1_02 } from '../world-1/__solutions__/w1-02.ts';
import { solution as w1_03 } from '../world-1/__solutions__/w1-03.ts';
import { solution as w1_04 } from '../world-1/__solutions__/w1-04.ts';
import { solution as w1_05 } from '../world-1/__solutions__/w1-05.ts';
import { solution as w2_01 } from '../world-2/__solutions__/w2-01.ts';
import { solution as w2_02 } from '../world-2/__solutions__/w2-02.ts';
import { solution as w2_03 } from '../world-2/__solutions__/w2-03.ts';
import { solution as w2_04 } from '../world-2/__solutions__/w2-04.ts';
import { solution as w2_05 } from '../world-2/__solutions__/w2-05.ts';
import { solution as w3_01 } from '../world-3/__solutions__/w3-01.ts';
import { solution as w3_02 } from '../world-3/__solutions__/w3-02.ts';
import { solution as w3_03 } from '../world-3/__solutions__/w3-03.ts';
import { solution as w3_04 } from '../world-3/__solutions__/w3-04.ts';
import { solution as w3_05 } from '../world-3/__solutions__/w3-05.ts';
import { solution as w4_01 } from '../world-4/__solutions__/w4-01.ts';
import { solution as w4_02 } from '../world-4/__solutions__/w4-02.ts';
import { solution as w4_03 } from '../world-4/__solutions__/w4-03.ts';
import { solution as w4_04 } from '../world-4/__solutions__/w4-04.ts';
import { solution as w4_05 } from '../world-4/__solutions__/w4-05.ts';
import { solution as w5_01 } from '../world-5/__solutions__/w5-01.ts';
import { solution as w5_02 } from '../world-5/__solutions__/w5-02.ts';
import { solution as w5_03 } from '../world-5/__solutions__/w5-03.ts';
import { solution as w5_04 } from '../world-5/__solutions__/w5-04.ts';
import { solution as w5_05 } from '../world-5/__solutions__/w5-05.ts';
import { solution as w6_01 } from '../world-6/__solutions__/w6-01.ts';
import { solution as w6_02 } from '../world-6/__solutions__/w6-02.ts';
import { solution as w6_03 } from '../world-6/__solutions__/w6-03.ts';
import { solution as w6_04 } from '../world-6/__solutions__/w6-04.ts';
import { solution as w6_05 } from '../world-6/__solutions__/w6-05.ts';
import { solution as w7_01 } from '../world-7/__solutions__/w7-01.ts';
import { solution as w7_02 } from '../world-7/__solutions__/w7-02.ts';
import { solution as w7_03 } from '../world-7/__solutions__/w7-03.ts';
import { solution as w7_04 } from '../world-7/__solutions__/w7-04.ts';
import { solution as w7_05 } from '../world-7/__solutions__/w7-05.ts';
import { solution as w8_01 } from '../world-8/__solutions__/w8-01.ts';
import { solution as w8_02 } from '../world-8/__solutions__/w8-02.ts';
import { solution as w8_03 } from '../world-8/__solutions__/w8-03.ts';
import { solution as w8_04 } from '../world-8/__solutions__/w8-04.ts';
import { solution as w8_05 } from '../world-8/__solutions__/w8-05.ts';

/**
 * Every level ships a reference solution (DESIGN.md §5). Registered here; the suite below proves
 * solvability on every seed and that par is actually achievable.
 */
const SOLUTIONS: Record<string, ReferenceSolution> = {
  'w1-01': w1_01,
  'w1-02': w1_02,
  'w1-03': w1_03,
  'w1-04': w1_04,
  'w1-05': w1_05,
  'w2-01': w2_01,
  'w2-02': w2_02,
  'w2-03': w2_03,
  'w2-04': w2_04,
  'w2-05': w2_05,
  'w3-01': w3_01,
  'w3-02': w3_02,
  'w3-03': w3_03,
  'w3-04': w3_04,
  'w3-05': w3_05,
  'w4-01': w4_01,
  'w4-02': w4_02,
  'w4-03': w4_03,
  'w4-04': w4_04,
  'w4-05': w4_05,
  'w5-01': w5_01,
  'w5-02': w5_02,
  'w5-03': w5_03,
  'w5-04': w5_04,
  'w5-05': w5_05,
  'w6-01': w6_01,
  'w6-02': w6_02,
  'w6-03': w6_03,
  'w6-04': w6_04,
  'w6-05': w6_05,
  'w7-01': w7_01,
  'w7-02': w7_02,
  'w7-03': w7_03,
  'w7-04': w7_04,
  'w7-05': w7_05,
  'w8-01': w8_01,
  'w8-02': w8_02,
  'w8-03': w8_03,
  'w8-04': w8_04,
  'w8-05': w8_05,
};

/**
 * Reference runs are deterministic, and the finale's is not cheap, so each (level, seed) pair is
 * driven once and the result shared by every assertion that needs it.
 */
const RUNS = new Map<string, ReturnType<typeof runReference>>();

function runOnce(level: (typeof LEVELS)[number], seed: number) {
  const id = `${level.id}/${String(seed)}`;
  const cached = RUNS.get(id);
  if (cached) return cached;
  const solution = SOLUTIONS[level.id] as ReferenceSolution;
  const result = runReference(level, seed, solution);
  RUNS.set(id, result);
  return result;
}

const EXPECTED_IDS = Array.from({ length: 40 }, (_, i) => {
  const world = Math.floor(i / 5) + 1;
  const index = (i % 5) + 1;
  return `w${String(world)}-${String(index).padStart(2, '0')}`;
});

describe('registry', () => {
  test('all forty levels are present, unique and in campaign order', () => {
    expect(LEVELS.length).toBe(40);
    expect(new Set(LEVELS.map((level) => level.id)).size).toBe(40);
    expect(campaignOrder().map((level) => level.id)).toEqual(EXPECTED_IDS);
  });

  test('level ids match their world and index', () => {
    for (const level of LEVELS) {
      expect(level.id).toBe(`w${String(level.world)}-${String(level.index).padStart(2, '0')}`);
    }
  });

  test('getLevel finds every registered level and nothing else', () => {
    for (const id of EXPECTED_IDS) expect(getLevel(id)?.id).toBe(id);
    expect(getLevel('w9-99')).toBeUndefined();
  });

  test('levelsByWorld covers all eight worlds, five each, in index order', () => {
    const sections = levelsByWorld();
    expect(sections.map((section) => section.world.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const section of sections) {
      expect(section.levels.map((level) => level.index)).toEqual([1, 2, 3, 4, 5]);
    }
    expect(sections.flatMap((section) => section.levels).length).toBe(40);
  });

  test('every level unlocks exactly what the API spec says it does', () => {
    for (const level of LEVELS) {
      expect(level.hardware.slice().sort(), level.id).toEqual(apiUnlockedAt(level.id).sort());
    }
  });

  test('hardware unlocks accumulate in campaign order', () => {
    const order = campaignOrder();
    let previous: string[] = [];
    for (const level of order) {
      const unlocked = hardwareUnlockedBy(level.id);
      expect(unlocked.slice(0, previous.length), level.id).toEqual(previous);
      previous = unlocked;
    }
    expect(previous.length).toBeGreaterThan(0);
  });

  test('every level has seeds, objectives, hints, a brief and a par', () => {
    for (const level of LEVELS) {
      expect(level.seeds.length, level.id).toBeGreaterThan(0);
      expect(level.objectives.length, level.id).toBeGreaterThan(0);
      expect(level.hints.length, level.id).toBeGreaterThan(0);
      expect(level.brief.trim().length, level.id).toBeGreaterThan(0);
      expect(level.starter.trim().length, level.id).toBeGreaterThan(0);
      expect(level.par.ticks, level.id).toBeGreaterThan(0);
      expect(level.par.chars, level.id).toBeGreaterThan(0);
      if (level.world >= 2) expect(level.seeds.length, level.id).toBeGreaterThanOrEqual(3);
    }
  });

  test('no hint is written in code', () => {
    for (const level of LEVELS) {
      for (const hint of level.hints) {
        expect(hint, level.id).not.toMatch(/=>|\bfunction\b|\bconst \w+ =|\breturn\b|\(\);/);
      }
    }
  });

  test('build is deterministic for a given seed', { timeout: 30_000 }, () => {
    for (const level of LEVELS) {
      for (const seed of level.seeds) {
        expect(level.build(seed), `${level.id}/${String(seed)}`).toEqual(level.build(seed));
      }
    }
  });
});

describe('reference solutions', () => {
  test('every registered level has one', () => {
    for (const level of LEVELS) expect(SOLUTIONS[level.id], level.id).toBeDefined();
  });

  for (const level of LEVELS) {
    const solution = SOLUTIONS[level.id];
    if (!solution) continue;

    describe(`${level.id} — ${level.title}`, () => {
      for (const seed of level.seeds) {
        test(`passes on seed ${String(seed)} within par`, { timeout: 30_000 }, () => {
          const result = runOnce(level, seed);
          expect(result.verdict.failure?.message).toBeUndefined();
          expect(
            result.verdict.objectives.filter((objective) => !objective.met).map((o) => o.id),
          ).toEqual([]);
          expect(result.verdict.passed).toBe(true);
          expect(result.ticks).toBeLessThanOrEqual(level.par.ticks);
          expect(medalFor(true, result.ticks, level.par.ticks)).toBe('gold');
        });
      }

      test('the player-facing source is within the char par', () => {
        expect(scoreChars(solution.source)).toBeLessThanOrEqual(level.par.chars);
      });

      test('replaying the trace reproduces the final world', () => {
        const seed = level.seeds[0] as number;
        const result = runOnce(level, seed);
        expect(result.trace.initialWorld).toEqual(result.initialWorld);
        expect(result.trace.endTick).toBe(result.ticks);
      });
    });
  }
});

/**
 * CURRICULUM.md §14: every level names the randomization that kills a memorized answer. These
 * are the cases where the claim is checkable — a solution written for one seed, run on the rest.
 *
 * A wrong answer is allowed to fail loudly: walking into a pit throws rather than returning a
 * verdict, and that counts as failing the seed.
 */
function survives(levelId: string, seed: number, naive: ReferenceSolution): boolean {
  const level = getLevel(levelId);
  if (!level) return false;
  try {
    return runReference(level, seed, naive).verdict.passed;
  } catch {
    return false;
  }
}
describe('randomization defeats hardcoding', () => {
  test('w1-01: the starter alone does not pass', () => {
    const level = getLevel('w1-01') as NonNullable<ReturnType<typeof getLevel>>;
    const result = runLevel(level, level.seeds[0] as number, (sim, botId) => {
      sim.move(botId, Dir.East);
    });
    expect(result.verdict.passed).toBe(false);
  });

  test('w6-04: relaying the band untouched fails on every seed', () => {
    const level = getLevel('w6-04') as NonNullable<ReturnType<typeof getLevel>>;
    for (const seed of level.seeds) {
      expect(survives('w6-04', seed, rawRelay), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('w6-05: a flat reader clears the depth-1 seed and fails a nested one', () => {
    const level = getLevel('w6-05') as NonNullable<ReturnType<typeof getLevel>>;
    const outcomes = level.seeds.map((seed) => survives('w6-05', seed, flatReader));
    expect(outcomes[0]).toBe(true);
    expect(outcomes.slice(1).some((passed) => !passed)).toBe(true);
  });

  test('w7-04: dealing the board out in advance misses par on the skewed seed', { timeout: 30_000 }, () => {
    const level = getLevel('w7-04') as NonNullable<ReturnType<typeof getLevel>>;
    const worst = Math.max(
      ...level.seeds.map((seed) => runReference(level, seed, roundRobinDispatch).ticks),
    );
    expect(worst).toBeGreaterThan(level.par.ticks);
  });

  test('w8-01: the World 2 sweep is correct and still misses the shift budget', () => {
    const level = getLevel('w8-01') as NonNullable<ReturnType<typeof getLevel>>;
    for (const seed of level.seeds) {
      const result = runReference(level, seed, fieldSweep);
      const unmet = result.verdict.objectives.filter((objective) => !objective.met);
      expect(
        result.verdict.objectives.find((objective) => objective.id === 'ripe-to-silo')?.met,
        `seed ${String(seed)}`,
      ).toBe(true);
      expect(unmet.map((objective) => objective.id), `seed ${String(seed)}`).toEqual([
        'shift-budget',
      ]);
    }
  });

  test('w8-04: following the filed plan literally fails on a drifted seed', () => {
    const level = getLevel('w8-04') as NonNullable<ReturnType<typeof getLevel>>;
    const outcomes = level.seeds.map((seed) => survives('w8-04', seed, literalPlanFollower));
    expect(outcomes[0]).toBe(true);
    expect(outcomes.slice(1).some((passed) => !passed)).toBe(true);
  });
});

/**
 * A bonus exists to absorb ambition (CURRICULUM.md §2 rule 8), so a reference solution is not
 * expected to earn every one — `w7-05`'s idle budget in particular is deliberately past it. What
 * is not allowed is a bonus that no run can even be scored against, or a whole campaign of them
 * that nothing can reach.
 */
describe('bonus objectives', () => {
  const withBonus = LEVELS.filter((level) => (level.bonus ?? []).length > 0);

  test('at least half the campaign has one', () => {
    expect(withBonus.length).toBeGreaterThanOrEqual(20);
  });

  const earned = new Set<string>();

  for (const level of withBonus) {
    const solution = SOLUTIONS[level.id];
    if (!solution) continue;
    test(`${level.id} scores its bonus cleanly on every seed`, { timeout: 30_000 }, () => {
      for (const seed of level.seeds) {
        const result = runOnce(level, seed);
        const scored = evaluateObjectives(level.bonus ?? [], {
          world: result.world,
          initialWorld: result.initialWorld,
          trace: result.trace,
        });
        expect(scored.length, level.id).toBe((level.bonus ?? []).length);
        for (const objective of scored) {
          expect(typeof objective.met, `${level.id}/${objective.id}`).toBe('boolean');
          if (objective.met) earned.add(level.id);
        }
      }
    });
  }

  test('most of them are within reach of an honest solution', () => {
    expect(earned.size).toBeGreaterThanOrEqual(Math.ceil(withBonus.length * 0.6));
  });
});

/**
 * The Repository is never a gate (src/meta/unlock.ts). A brief may say a routine is expected to
 * be in `lib.ts`, and must say in the same breath that writing it in the work order is fine.
 */
describe('library requirements', () => {
  /** Briefs are authored as wrapped lines, so read them as prose rather than as source. */
  const prose = (text: string): string => text.replace(/\s+/g, ' ');
  const namesLib = LEVELS.filter((level) => prose(level.brief).includes("from 'lib'"));

  test('enough of the campaign leans on the Repository for the arithmetic to mean anything', () => {
    expect(namesLib.length).toBeGreaterThanOrEqual(5);
  });

  test('no brief asks for the Repository before it exists', () => {
    for (const level of namesLib) {
      expect(level.world, level.id).toBeGreaterThanOrEqual(LIBRARY_FIRST_WORLD);
    }
  });

  test('a brief that names a routine also says it can be written in the work order', () => {
    for (const level of namesLib) {
      expect(prose(level.brief), level.id).toMatch(/write it in this file/);
    }
  });

  test('the briefs and the requirement table name the same routines', () => {
    for (const level of LEVELS) {
      const declared = requirementsFor(level.id).map((requirement) => requirement.name).sort();
      const mentioned = declared.filter((name) =>
        prose(level.brief).includes(`import { ${name} } from 'lib'`),
      );
      expect(mentioned, level.id).toEqual(declared);
      if (declared.length > 0) expect(namesLib, level.id).toContain(level);
    }
    for (const level of namesLib) {
      expect(requirementsFor(level.id).length, level.id).toBeGreaterThan(0);
    }
  });
});
