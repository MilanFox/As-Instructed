import { describe, expect, test } from 'vitest';
import { Dir, medalFor, scoreChars } from '../../../engine/index.ts';
import { runLevel, runReference } from '../../harness.ts';
import type { LevelDef, ReferenceSolution } from '../../types.ts';
import { WORLD_1_LEVELS } from '../index.ts';
import { solution as w1_01Solution } from '../__solutions__/w1-01.ts';
import { solution as w1_02Solution } from '../__solutions__/w1-02.ts';
import { solution as w1_03Solution } from '../__solutions__/w1-03.ts';
import { solution as w1_04Solution } from '../__solutions__/w1-04.ts';
import { solution as w1_05Solution } from '../__solutions__/w1-05.ts';
import { unlockedApiNames } from '../../../runtime/ambient.ts';
import { compileErrors } from './ambient-check.ts';

/**
 * Boot Sector: solvability, par, and the anti-hardcode claims.
 *
 * Every level is proved solvable on every seed within par, and every level whose CURRICULUM.md
 * block claims that randomization defeats a memorized answer is also proved to *reject* that
 * memorized answer. A generalization rule nobody tests is a comment.
 */

const SOLUTIONS: Record<string, ReferenceSolution> = {
  'w1-01': w1_01Solution,
  'w1-02': w1_02Solution,
  'w1-03': w1_03Solution,
  'w1-04': w1_04Solution,
  'w1-05': w1_05Solution,
};

const byId = (id: string): LevelDef => {
  const level = WORLD_1_LEVELS.find((candidate) => candidate.id === id);
  if (!level) throw new Error(`no such level: ${id}`);
  return level;
};

describe('world 1 shape', () => {
  test('five levels, in order, correctly identified', () => {
    expect(WORLD_1_LEVELS.map((level) => level.id)).toEqual([
      'w1-01',
      'w1-02',
      'w1-03',
      'w1-04',
      'w1-05',
    ]);
    WORLD_1_LEVELS.forEach((level, i) => {
      expect(level.world).toBe(1);
      expect(level.index).toBe(i + 1);
      expect(level.id).toBe(`w1-0${String(i + 1)}`);
    });
  });

  test('every level carries a brief, hints, seeds and a par', () => {
    for (const level of WORLD_1_LEVELS) {
      expect(level.title.length).toBeGreaterThan(0);
      expect(level.brief.trim().length).toBeGreaterThan(0);
      expect(level.hints.length).toBeGreaterThanOrEqual(3);
      expect(level.objectives.length).toBeGreaterThan(0);
      expect(level.seeds.length).toBeGreaterThan(0);
      expect(level.par.ticks).toBeGreaterThan(0);
      expect(level.par.chars).toBeGreaterThan(0);
    }
  });

  test('no hint contains a line of code', () => {
    for (const level of WORLD_1_LEVELS) {
      for (const hint of level.hints) {
        expect(hint).not.toMatch(/;\s*$/);
        expect(hint).not.toMatch(/\bfor \(|while \(|=>/);
      }
    }
  });

  test('the levels that generalize declare more than one seed', () => {
    for (const level of WORLD_1_LEVELS) {
      if (level.id === 'w1-01' || level.id === 'w1-02') continue;
      expect(level.seeds.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('declared hardware matches the firmware the runtime actually unlocks', () => {
    const installed: string[] = [];
    for (const level of WORLD_1_LEVELS) {
      installed.push(...level.hardware);
      expect(unlockedApiNames(level.id)).toEqual(installed);
    }
  });

  test('build is pure and deterministic for a given seed', () => {
    for (const level of WORLD_1_LEVELS) {
      for (const seed of level.seeds) {
        expect(level.build(seed)).toEqual(level.build(seed));
      }
    }
  });

  test('seeds actually produce different worlds where the level says they do', () => {
    for (const level of WORLD_1_LEVELS) {
      if (level.seeds.length < 2) continue;
      const shapes = level.seeds.map((seed) => JSON.stringify(level.build(seed).tiles));
      expect(new Set(shapes).size).toBe(level.seeds.length);
    }
  });
});

describe('reference solutions', () => {
  for (const level of WORLD_1_LEVELS) {
    const solution = SOLUTIONS[level.id] as ReferenceSolution;

    describe(`${level.id} — ${level.title}`, () => {
      for (const seed of level.seeds) {
        test(`passes seed ${seed} inside par`, () => {
          const result = runReference(level, seed, solution);
          expect(result.verdict.failure).toBeUndefined();
          expect(result.verdict.passed).toBe(true);
          expect(result.ticks).toBeLessThanOrEqual(level.par.ticks);
          expect(medalFor(true, result.ticks, level.par.ticks)).toBe('gold');
        });

        test(`earns every bonus on seed ${seed}`, () => {
          const result = runReference(level, seed, solution);
          for (const bonus of level.bonus ?? []) {
            expect({
              id: bonus.id,
              met: bonus.evaluate({
                world: result.world,
                trace: result.trace,
                initialWorld: result.initialWorld,
              }),
            }).toEqual({ id: bonus.id, met: true });
          }
        });
      }

      test('the player-facing source fits the char par', () => {
        expect(scoreChars(solution.source)).toBeLessThanOrEqual(level.par.chars);
      });

      test('the starter compiles against this level firmware', () => {
        expect(compileErrors(level.id, level.starter)).toEqual([]);
      });

      test('the solution source compiles against this level firmware', () => {
        expect(compileErrors(level.id, solution.source)).toEqual([]);
      });
    });
  }
});

describe('starters do not solve their own level', () => {
  test('w1-01 needs more than the line it ships with', () => {
    const level = byId('w1-01');
    const result = runLevel(level, level.seeds[0] as number, (sim, botId) => {
      sim.move(botId, Dir.East);
    });
    expect(result.verdict.passed).toBe(false);
  });

  test('w1-02 needs all three legs, not just the first', () => {
    const level = byId('w1-02');
    const result = runLevel(level, level.seeds[0] as number, (sim, botId) => {
      for (let i = 0; i < 12; i++) sim.move(botId, Dir.East);
    });
    expect(result.verdict.passed).toBe(false);
  });
});

describe('hardcoded answers are rejected', () => {
  test('w1-03: a counted loop tuned to the first seed fails a later one', () => {
    const level = byId('w1-03');
    const outcomes = level.seeds.map(
      (seed) =>
        runLevel(level, seed, (sim, botId) => {
          for (let i = 0; i < 18; i++) sim.move(botId, Dir.East);
        }).verdict.passed,
    );
    expect(outcomes[0]).toBe(true);
    expect(outcomes.some((passed) => !passed)).toBe(true);
  });

  test('w1-04: a fixed direction sequence cannot cover both endpoints', () => {
    const level = byId('w1-04');
    const outcomes = level.seeds.map(
      (seed) =>
        runLevel(level, seed, (sim, botId) => {
          for (let i = 0; i < 9; i++) sim.move(botId, Dir.East);
          for (let i = 0; i < 9; i++) sim.move(botId, Dir.South);
        }).verdict.passed,
    );
    expect(outcomes.some((passed) => !passed)).toBe(true);
  });

  test('w1-04: handling only positive deltas strands the bot on some seeds', () => {
    const level = byId('w1-04');
    const outcomes = level.seeds.map(
      (seed) =>
        runLevel(level, seed, (sim, botId) => {
          const start = sim.pos(botId);
          const pad = { x: 10 - start.x, y: 10 - start.y };
          while (sim.pos(botId).x < pad.x) sim.move(botId, Dir.East);
          while (sim.pos(botId).y < pad.y) sim.move(botId, Dir.South);
        }).verdict.passed,
    );
    expect(outcomes.some((passed) => !passed)).toBe(true);
  });

  test('w1-05: a sweep sized for one bay leaves tiles uninspected in another', () => {
    const level = byId('w1-05');
    const outcomes = level.seeds.map(
      (seed) =>
        runLevel(level, seed, (sim, botId) => {
          let dir: Dir = Dir.East;
          for (let row = 0; row < 5; row++) {
            for (let i = 0; i < 8; i++) sim.move(botId, dir);
            sim.move(botId, Dir.South);
            dir = dir === Dir.East ? Dir.West : Dir.East;
          }
        }).verdict.passed,
    );
    expect(outcomes.every((passed) => !passed)).toBe(true);
  });

  test('w1-05: ignoring the partition leaves the east half untouched', () => {
    const level = byId('w1-05');
    const result = runLevel(level, level.seeds[0] as number, (sim, botId) => {
      let dir: Dir = Dir.East;
      while (sim.canMove(botId, Dir.South)) {
        while (sim.canMove(botId, dir)) sim.move(botId, dir);
        sim.move(botId, Dir.South);
        dir = dir === Dir.East ? Dir.West : Dir.East;
      }
      while (sim.canMove(botId, dir)) sim.move(botId, dir);
    });
    expect(result.verdict.passed).toBe(false);
    const progress = result.verdict.objectives[0]?.progress;
    expect(progress).toBeDefined();
    expect((progress as [number, number])[0]).toBeLessThan((progress as [number, number])[1]);
  });
});
