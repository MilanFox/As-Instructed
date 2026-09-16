import { describe, expect, test } from 'vitest';
import { Dir, evaluateObjectives, medalFor } from '../../engine/index.ts';
import { SILVER_FACTOR } from '../../game/score.ts';
import { apiUnlockedAt } from '../../runtime/api-spec.ts';
import { LIBRARY_FIRST_WORLD, requirementsFor } from '../../meta/unlock.ts';
import { LEVELS, campaignOrder, getLevel, hardwareUnlockedBy, levelsByWorld } from '../index.ts';
import { runLevel, runReference } from '../harness.ts';
import { SOLUTIONS, STARS } from './solutions.ts';
import type { ReferenceSolution } from '../types.ts';
import {
  corridorPoll,
  fieldSweep,
  flatReader,
  frontierScavenger,
  literalPlanFollower,
  lockerCanvasser,
  rawRelay,
  roundRobinDispatch,
  serpentineHarvest,
} from './naive.ts';

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

const EXPECTED_INDICES: Readonly<Record<number, number[]>> = {
  1: [1, 2, 3],
  2: [1, 2, 3],
  3: [1, 2, 3],
  4: [1, 2, 3, 4],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5],
  7: [1, 2, 3, 4, 5],
  8: [1, 2, 3, 4, 5],
};

const EXPECTED_IDS = Object.entries(EXPECTED_INDICES).flatMap(([world, indices]) =>
  indices.map((index) => `w${world}-${String(index).padStart(2, '0')}`),
);

describe('registry', () => {
  test('every issued level is present, unique and in campaign order', () => {
    expect(LEVELS.length).toBe(EXPECTED_IDS.length);
    expect(new Set(LEVELS.map((level) => level.id)).size).toBe(EXPECTED_IDS.length);
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

  test('levelsByWorld covers all eight worlds, in index order', () => {
    const sections = levelsByWorld();
    expect(sections.map((section) => section.world.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const section of sections) {
      expect(
        section.levels.map((level) => level.index),
        `world ${String(section.world.id)}`,
      ).toEqual(EXPECTED_INDICES[section.world.id]);
    }
    expect(sections.flatMap((section) => section.levels).length).toBe(EXPECTED_IDS.length);
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
      if (level.world >= 2) expect(level.seeds.length, level.id).toBeGreaterThanOrEqual(3);
    }
  });

  test('briefs stay short enough that a second-language reader finishes them', () => {
    const words = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;
    let total = 0;
    for (const level of LEVELS) {
      const count = words(level.brief);
      total += count;
      expect(count, level.id).toBeLessThanOrEqual(125);
    }
    expect(total / LEVELS.length).toBeLessThanOrEqual(72);
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

      test('replaying the trace reproduces the final world', () => {
        const seed = level.seeds[0] as number;
        const result = runOnce(level, seed);
        expect(result.trace.initialWorld).toEqual(result.initialWorld);
        expect(result.trace.endTick).toBe(result.ticks);
      });
    });
  }
});

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

  test('w6-05: a flat reader fails the seed that runs first and clears only the depth-1 one', () => {
    const level = getLevel('w6-05') as NonNullable<ReturnType<typeof getLevel>>;
    const outcomes = level.seeds.map((seed) => survives('w6-05', seed, flatReader));
    expect(outcomes[0]).toBe(false);
    expect(outcomes.filter((passed) => passed)).toEqual([true]);
  });

  test(
    'w7-04: dealing the board out in advance misses par on the skewed seed',
    { timeout: 30_000 },
    () => {
      const level = getLevel('w7-04') as NonNullable<ReturnType<typeof getLevel>>;
      const worst = Math.max(
        ...level.seeds.map((seed) => runReference(level, seed, roundRobinDispatch).ticks),
      );
      expect(worst).toBeGreaterThan(level.par.ticks);
    },
  );

  test('w8-01: the World 2 sweep is correct and now misses the readings budget too', () => {
    const level = getLevel('w8-01') as NonNullable<ReturnType<typeof getLevel>>;
    for (const seed of level.seeds) {
      const result = runReference(level, seed, fieldSweep);
      const unmet = result.verdict.objectives.filter((objective) => !objective.met);
      expect(
        result.verdict.objectives.find((objective) => objective.id === 'ripe-to-silo')?.met,
        `seed ${String(seed)}`,
      ).toBe(true);
      expect(
        unmet.map((objective) => objective.id),
        `seed ${String(seed)}`,
      ).toEqual(['shift-budget', 'within-16-scan']);
    }
  });

  test('w8-04: following the filed plan literally fails first and clears only the zero-drift seed', () => {
    const level = getLevel('w8-04') as NonNullable<ReturnType<typeof getLevel>>;
    const outcomes = level.seeds.map((seed) => survives('w8-04', seed, literalPlanFollower));
    expect(outcomes[0]).toBe(false);
    expect(outcomes.filter((passed) => passed)).toEqual([true]);
  });
});

describe('par calibration', () => {
  function scored(levelId: string, solution: ReferenceSolution) {
    const level = getLevel(levelId) as NonNullable<ReturnType<typeof getLevel>>;
    const runs = level.seeds.map((seed) => runReference(level, seed, solution));
    const passed = runs.every((run) => run.verdict.passed);
    const worst = Math.max(...runs.map((run) => run.ticks));
    return { passed, worst, medal: medalFor(passed, worst, level.par.ticks) };
  }

  function reference(levelId: string) {
    return scored(levelId, SOLUTIONS[levelId] as ReferenceSolution);
  }

  test('w1-02: par is at the floor, because the answer with no idea in it is tick-optimal', () => {
    const polled = scored('w1-02', corridorPoll);
    expect(polled.passed).toBe(true);
    expect(polled.worst).toBe(reference('w1-02').worst);
    expect(polled.medal).toBe('gold');
  });

  test('w2-03: serpentining all six rows runs out of shift on most seeds', () => {
    const level = getLevel('w2-03') as NonNullable<ReturnType<typeof getLevel>>;
    const closed = level.seeds.filter((seed) => survives('w2-03', seed, serpentineHarvest));
    expect(closed.length).toBeLessThanOrEqual(2);
    expect(closed.length).toBeGreaterThan(0);

    const lanes = reference('w2-03');
    expect(lanes.passed).toBe(true);
    expect(lanes.medal).toBe('gold');
    expect(level.budget?.maxTicks).toBeGreaterThanOrEqual(lanes.worst + 7);
  });

  test('w8-04: ignoring the filed plan is correct, and is not gold either way', () => {
    const plan = reference('w8-04');
    for (const refusal of [frontierScavenger, lockerCanvasser]) {
      const off = scored('w8-04', refusal);
      expect(off.passed, refusal.levelId).toBe(true);
      expect(off.medal).toBe('bronze');
      expect(plan.worst).toBeLessThan(off.worst);
    }
    expect(plan.medal).toBe('gold');
  });

  const SILVER_NEEDS_THE_WIDENING = ['w5-02', 'w6-01'];

  test('two pars are small enough that the raw 1.25 band holds no integer', () => {
    const degenerate = LEVELS.filter(
      (level) => Math.floor(level.par.ticks * SILVER_FACTOR) <= level.par.ticks,
    );
    expect(degenerate.map((level) => level.id).sort()).toEqual(SILVER_NEEDS_THE_WIDENING);
  });

  test('every rung of the ladder is reachable on every level', () => {
    for (const level of LEVELS) {
      const par = level.par.ticks;
      const awarded = new Set<string>();
      for (let ticks = 0; ticks <= par * 2 + 4; ticks++) awarded.add(medalFor(true, ticks, par));
      expect([...awarded].sort(), level.id).toEqual(['bronze', 'gold', 'silver']);
    }
  });

  const CLOCK_CANNOT_VARY = ['w1-01', 'w5-02', 'w6-01', 'w6-03', 'w6-05'];

  test('the levels whose reference costs the same on every seed are the ones on record', () => {
    const fixed = LEVELS.filter((level) => {
      const solution = SOLUTIONS[level.id] as ReferenceSolution;
      const ticks = level.seeds.map((seed) => runReference(level, seed, solution).ticks);
      return new Set(ticks).size === 1;
    });
    expect(fixed.map((level) => level.id).sort()).toEqual(CLOCK_CANNOT_VARY);
  });
});

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

  test(
    'every bonus on the site is taken on every seed by one program, as site-starred grades it',
    { timeout: 120_000 },
    () => {
      const unreachable: string[] = [];
      for (const level of withBonus) {
        const solution = STARS[level.id] ?? SOLUTIONS[level.id];
        if (!solution) {
          unreachable.push(`${level.id}: no fixture`);
          continue;
        }
        for (const seed of level.seeds) {
          const result = runReference(level, seed, solution);
          if (!result.verdict.passed) {
            unreachable.push(`${level.id}/${String(seed)}: the run does not pass`);
            continue;
          }
          const scored = evaluateObjectives(level.bonus ?? [], {
            world: result.world,
            initialWorld: result.initialWorld,
            trace: result.trace,
          });
          for (const objective of scored) {
            if (!objective.met) unreachable.push(`${level.id}/${String(seed)}/${objective.id}`);
          }
        }
      }
      expect(unreachable).toEqual([]);
    },
  );

  test('a star fixture exists only where the reference does not take the star', () => {
    const redundant = Object.keys(STARS).filter((id) => {
      const level = getLevel(id) as NonNullable<ReturnType<typeof getLevel>>;
      const solution = SOLUTIONS[id] as ReferenceSolution;
      return level.seeds.every((seed) => {
        const result = runReference(level, seed, solution);
        return evaluateObjectives(level.bonus ?? [], {
          world: result.world,
          initialWorld: result.initialWorld,
          trace: result.trace,
        }).every((objective) => objective.met);
      });
    });
    expect(redundant).toEqual([]);
  });
});

describe('library requirements', () => {
  const namesLib = LEVELS.filter((level) => requirementsFor(level.id).length > 0);

  test('enough of the campaign leans on the Repository for the arithmetic to mean anything', () => {
    expect(namesLib.length).toBeGreaterThanOrEqual(5);
  });

  test('no work order asks for the Repository before it exists', () => {
    for (const level of namesLib) {
      expect(level.world, level.id).toBeGreaterThanOrEqual(LIBRARY_FIRST_WORLD);
    }
  });

  test('every listed routine carries a signature and a line saying what it does', () => {
    for (const level of namesLib) {
      for (const routine of requirementsFor(level.id)) {
        const where = `${level.id}/${routine.name}`;
        expect(routine.signature, where).toContain(routine.name);
        expect(routine.assumes.trim().length, where).toBeGreaterThan(0);
      }
    }
  });

  test('the requisition card is the only place the routines are spelled out', () => {
    const prose = (text: string): string => text.replace(/\s+/g, ' ');
    for (const level of LEVELS) {
      expect(prose(level.brief), level.id).not.toContain("from 'lib'");
    }
  });
});
