import { describe, expect, test } from 'vitest';
import type { Dir as DirType, Objective, Sim } from '../../../engine/index.ts';
import { Dir, evaluateObjectives, medalFor, scoreChars, senseTotals } from '../../../engine/index.ts';
import type { LevelRunResult } from '../../harness.ts';
import { runLevel, runReference } from '../../harness.ts';
import type { LevelDef, ReferenceSolution } from '../../types.ts';
import { WORLD_1_LEVELS } from '../index.ts';
import { solution as w1_01Solution } from '../__solutions__/w1-01.ts';
import { solution as w1_03Solution } from '../__solutions__/w1-03.ts';
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
  'w1-03': w1_03Solution,
  'w1-05': w1_05Solution,
};

/**
 * The levels whose bonus any correct run already earns, and is meant to.
 *
 * `w1-03` and `w1-05` are deliberately not here: their stars ask for something the obvious answer
 * does not do, and both directions of that claim are proved in `bonus stars are missable` below.
 */
const UNCHANGED_BONUS = new Set(['w1-02', 'w1-04']);

const starEarned = (level: LevelDef, result: LevelRunResult): boolean =>
  evaluateObjectives((level.bonus ?? []) as Objective[], {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
  }).every((entry) => entry.met);

const byId = (id: string): LevelDef => {
  const level = WORLD_1_LEVELS.find((candidate) => candidate.id === id);
  if (!level) throw new Error(`no such level: ${id}`);
  return level;
};

describe('world 1 shape', () => {
  test('three levels, in order, correctly identified', () => {
    expect(WORLD_1_LEVELS.map((level) => level.id)).toEqual(['w1-01', 'w1-03', 'w1-05']);
    let previous = 0;
    for (const level of WORLD_1_LEVELS) {
      expect(level.world).toBe(1);
      expect(level.index).toBeGreaterThan(previous);
      expect(level.id).toBe(`w1-0${String(level.index)}`);
      previous = level.index;
    }
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
      if (level.id === 'w1-01') continue;
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

        if (UNCHANGED_BONUS.has(level.id)) {
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

  test('w1-01 needs every leg, not just the first', () => {
    const level = byId('w1-01');
    const result = runLevel(level, level.seeds[0] as number, (sim, botId) => {
      sim.move(botId, Dir.East);
      sim.move(botId, Dir.North);
      sim.move(botId, Dir.East);
      sim.move(botId, Dir.East);
      sim.move(botId, Dir.South);
      for (let i = 0; i < 19; i++) sim.move(botId, Dir.East);
    });
    expect(result.verdict.passed).toBe(false);
  });
});

describe('hardcoded answers are rejected', () => {
  /**
   * The one w1-01 answer that skips the counting. Nothing distinguishes five counted loops from
   * seventy-eight typed-out moves in a trace, so the booking is what the level actually gates on.
   */
  test('w1-01: firing moves at the wall until they stop working overruns the booking', () => {
    const level = byId('w1-01');
    const result = runLevel(level, level.seeds[0] as number, (sim, botId) => {
      sim.move(botId, Dir.East);
      sim.move(botId, Dir.North);
      sim.move(botId, Dir.East);
      sim.move(botId, Dir.East);
      sim.move(botId, Dir.South);
      for (const dir of [Dir.East, Dir.South, Dir.West, Dir.South, Dir.East]) {
        for (let i = 0; i < 30; i++) sim.move(botId, dir);
      }
    });
    expect(result.verdict.objectives.find((o) => o.id === 'reach-pad')?.met).toBe(true);
    expect(result.verdict.objectives.find((o) => o.id === 'bay-booking')?.met).toBe(false);
    expect(result.verdict.passed).toBe(false);
  });

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

/**
 * Both directions of every star this world asks for.
 *
 * A bonus nobody can fail is decoration, so each of these levels gets two drivers: one that earns
 * the star on every declared seed, and one that solves the level the obvious way and does not. The
 * obvious way is the shipped reference solution wherever that is what a player would write.
 */
describe('bonus stars are missable', () => {
  const stride =
    (tiles: number) =>
    (sim: Sim, botId: number): void => {
      while (sim.canMove(botId, Dir.East)) {
        for (let step = 0; step < tiles; step++) sim.move(botId, Dir.East);
      }
    };

  const blindRun =
    (steps: number) =>
    (sim: Sim, botId: number): void => {
      for (let step = 0; step < steps; step++) sim.move(botId, Dir.East);
    };

  const bumpAlong = (sim: Sim, botId: number): void => {
    let moved = true;
    while (moved) moved = sim.move(botId, Dir.East);
  };

  test('w1-03: striding earns the star on every seed, at either stride the brief allows', () => {
    const level = byId('w1-03');
    for (const tiles of [5, 6]) {
      for (const seed of level.seeds) {
        const result = runLevel(level, seed, stride(tiles));
        expect({ seed, tiles, passed: result.verdict.passed, star: starEarned(level, result) }) //
          .toEqual({ seed, tiles, passed: true, star: true });
      }
    }
  });

  test('w1-03: asking before every tile passes the level and misses the star', () => {
    const level = byId('w1-03');
    const solution = SOLUTIONS['w1-03'] as ReferenceSolution;
    for (const seed of level.seeds) {
      const result = runReference(level, seed, solution);
      expect({ seed, passed: result.verdict.passed, star: starEarned(level, result) }) //
        .toEqual({ seed, passed: true, star: false });
      expect(senseTotals(result.trace)['canMove']).toBeGreaterThan(7);
    }
  });

  test('w1-03: spending no readings at all does not buy the star either', () => {
    const level = byId('w1-03');
    for (const seed of level.seeds) {
      const result = runLevel(level, seed, blindRun(25));
      expect(result.verdict.passed).toBe(true);
      expect(senseTotals(result.trace)['canMove']).toBeUndefined();
    }
    const reported = runLevel(level, level.seeds[0] as number, blindRun(25));
    expect(starEarned(level, reported)).toBe(false);
    const shortest = runLevel(level, level.seeds[2] as number, blindRun(25));
    expect(starEarned(level, shortest)).toBe(false);
  });

  test('w1-03: reading the wall by driving into it is the other way through', () => {
    const level = byId('w1-03');
    for (const seed of level.seeds) {
      const result = runLevel(level, seed, bumpAlong);
      expect({ seed, passed: result.verdict.passed, star: starEarned(level, result) }) //
        .toEqual({ seed, passed: true, star: true });
    }
  });

  const flipEW = (dir: DirType): DirType => (dir === Dir.East ? Dir.West : Dir.East);
  const flipNS = (dir: DirType): DirType => (dir === Dir.North ? Dir.South : Dir.North);

  const sweep = (sim: Sim, botId: number, dir: DirType): number => {
    let steps = 0;
    while (sim.canMove(botId, dir)) {
      sim.move(botId, dir);
      steps++;
    }
    return steps;
  };

  const eastHalf = (sim: Sim, botId: number): void => {
    sweep(sim, botId, Dir.East);
    let dir: DirType = Dir.West;
    while (sim.canMove(botId, Dir.North)) {
      sim.move(botId, Dir.North);
      sweep(sim, botId, dir);
      dir = flipEW(dir);
    }
  };

  /**
   * The sweep that never inspects a tile twice, whatever shape the bay turns out to be.
   *
   * Row one is swept first because it costs nothing either way, and it reports how many columns the
   * west half has. An even count means the row serpentine already ends at the doorway corner. An
   * odd count means it would end at the far wall, so the rest of the half is combed by columns
   * instead — back along row two, down and up to the second-to-last column, then East and down.
   */
  const combedSweep = (sim: Sim, botId: number): void => {
    const columns = sweep(sim, botId, Dir.East) + 1;
    if (columns % 2 === 1) {
      sim.move(botId, Dir.South);
      sweep(sim, botId, Dir.West);
      sim.move(botId, Dir.South);
      let dir: DirType = Dir.South;
      sweep(sim, botId, dir);
      for (let column = 2; column <= columns - 1; column++) {
        sim.move(botId, Dir.East);
        dir = flipNS(dir);
        if (dir === Dir.North) {
          while (sim.pos(botId).y > 3) sim.move(botId, Dir.North);
        } else {
          sweep(sim, botId, dir);
        }
      }
      sim.move(botId, Dir.East);
      sweep(sim, botId, Dir.South);
    } else {
      let dir: DirType = Dir.East;
      while (sim.canMove(botId, Dir.South)) {
        sim.move(botId, Dir.South);
        dir = flipEW(dir);
        sweep(sim, botId, dir);
      }
    }
    eastHalf(sim, botId);
  };

  test('w1-05: a sweep that matches the bay earns the star on every seed', () => {
    const level = byId('w1-05');
    for (const seed of level.seeds) {
      const result = runLevel(level, seed, combedSweep);
      expect({ seed, passed: result.verdict.passed, star: starEarned(level, result) }) //
        .toEqual({ seed, passed: true, star: true });
    }
  });

  test('w1-05: the row serpentine passes and misses the star on the bay the game reports', () => {
    const level = byId('w1-05');
    const solution = SOLUTIONS['w1-05'] as ReferenceSolution;
    const reported = runReference(level, level.seeds[0] as number, solution);
    expect(reported.verdict.passed).toBe(true);
    expect(medalFor(true, reported.ticks, level.par.ticks)).toBe('gold');
    expect(starEarned(level, reported)).toBe(false);
  });

  test('w1-05: the row serpentine only fits the bays with an odd number of rows', () => {
    const level = byId('w1-05');
    const solution = SOLUTIONS['w1-05'] as ReferenceSolution;
    const earned = level.seeds.filter((seed) =>
      starEarned(level, runReference(level, seed, solution)),
    );
    expect(earned).toEqual([1, 6, 8]);
  });
});
