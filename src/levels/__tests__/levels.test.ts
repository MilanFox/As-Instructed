import { describe, expect, test } from 'vitest';
import { Dir, medalFor, scoreChars } from '../../engine/index.ts';
import { LEVELS, campaignOrder, getLevel, hardwareUnlockedBy, levelsByWorld } from '../index.ts';
import { runReference } from '../harness.ts';
import type { ReferenceSolution } from '../types.ts';
import { solution as w1_01Solution } from '../world-1/__solutions__/w1-01.ts';

/**
 * Every level ships a reference solution (DESIGN.md §5). Register it here; the suite below then
 * proves solvability on every seed and that par is actually achievable.
 */
const SOLUTIONS: Record<string, ReferenceSolution> = {
  'w1-01': w1_01Solution,
};

describe('registry', () => {
  test('level ids are unique', () => {
    const ids = LEVELS.map((level) => level.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('level ids match their world and index', () => {
    for (const level of LEVELS) {
      expect(level.id).toBe(`w${level.world}-${String(level.index).padStart(2, '0')}`);
    }
  });

  test('getLevel finds every registered level and nothing else', () => {
    for (const level of LEVELS) expect(getLevel(level.id)).toBe(level);
    expect(getLevel('w9-99')).toBeUndefined();
  });

  test('levelsByWorld covers all eight worlds and loses no level', () => {
    const sections = levelsByWorld();
    expect(sections.map((s) => s.world.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(sections.flatMap((s) => s.levels).length).toBe(LEVELS.length);
  });

  test('campaignOrder is sorted by world then index', () => {
    const order = campaignOrder();
    for (let i = 1; i < order.length; i++) {
      const previous = order[i - 1]!;
      const current = order[i]!;
      expect(previous.world < current.world || previous.index < current.index).toBe(true);
    }
  });

  test('hardware unlocks accumulate in campaign order', () => {
    const first = campaignOrder()[0];
    expect(first).toBeDefined();
    expect(hardwareUnlockedBy(first!.id)).toEqual(first!.hardware);
  });

  test('every level has at least one seed, one objective and a hint', () => {
    for (const level of LEVELS) {
      expect(level.seeds.length).toBeGreaterThan(0);
      expect(level.objectives.length).toBeGreaterThan(0);
      expect(level.hints.length).toBeGreaterThan(0);
      expect(level.brief.trim().length).toBeGreaterThan(0);
      expect(level.par.ticks).toBeGreaterThan(0);
      if (level.world >= 2) expect(level.seeds.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('build is deterministic for a given seed', () => {
    for (const level of LEVELS) {
      for (const seed of level.seeds) {
        expect(level.build(seed)).toEqual(level.build(seed));
      }
    }
  });
});

describe('reference solutions', () => {
  test('every registered level has one', () => {
    for (const level of LEVELS) expect(SOLUTIONS[level.id]).toBeDefined();
  });

  for (const level of LEVELS) {
    const solution = SOLUTIONS[level.id];
    if (!solution) continue;

    describe(`${level.id} — ${level.title}`, () => {
      for (const seed of level.seeds) {
        test(`passes on seed ${seed} within par`, () => {
          const result = runReference(level, seed, solution);
          expect(result.verdict.failure).toBeUndefined();
          expect(result.verdict.passed).toBe(true);
          expect(result.ticks).toBeLessThanOrEqual(level.par.ticks);
          expect(medalFor(true, result.ticks, level.par.ticks)).toBe('gold');
        });
      }

      test('the player-facing source is within the char par', () => {
        expect(scoreChars(solution.source)).toBeLessThanOrEqual(level.par.chars);
      });

      test('replaying the trace reproduces the final world', () => {
        const seed = level.seeds[0]!;
        const result = runReference(level, seed, solution);
        expect(result.trace.initialWorld).toEqual(result.initialWorld);
        expect(result.trace.endTick).toBe(result.ticks);
      });
    });
  }
});

describe('w1-01', () => {
  test('the starter code alone does not pass', () => {
    const level = getLevel('w1-01')!;
    const result = runReference(level, level.seeds[0]!, {
      levelId: 'w1-01',
      source: level.starter,
      run: (sim, botId) => {
        sim.move(botId, Dir.East);
      },
    });
    expect(result.verdict.passed).toBe(false);
  });

  test('the pillar actually blocks the direct route', () => {
    const level = getLevel('w1-01')!;
    const result = runReference(level, level.seeds[0]!, {
      levelId: 'w1-01',
      source: '',
      run: (sim, botId) => {
        for (let i = 0; i < 4; i++) sim.move(botId, Dir.East);
      },
    });
    expect(result.verdict.passed).toBe(false);
    expect(result.trace.events.some((e) => e.kind === 'move' && !e.ok)).toBe(true);
  });
});
