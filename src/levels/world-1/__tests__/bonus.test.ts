import { describe, expect, test } from 'vitest';
import type { Dir as DirType, ObjectiveContext, Sim } from '../../../engine/index.ts';
import { Dir, evaluateObjectives, medalFor, senseTotals } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import type { LevelDef } from '../../types.ts';
import { movesIssued, walkableTiles, wastedTicks } from '../shared.ts';
import { w1_02 } from '../w1-02.ts';
import { w1_03 } from '../w1-03.ts';
import { solution as w1_02Solution } from '../__solutions__/w1-02.ts';
import { solution as w1_03Solution } from '../__solutions__/w1-03.ts';

function scored(level: LevelDef, seed: number, drive: (sim: Sim, botId: number) => void) {
  const result = runLevel(level, seed, drive);
  return measured(level, result);
}

function measured(level: LevelDef, result: ReturnType<typeof runLevel>) {
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  const stars = evaluateObjectives(level.bonus ?? [], ctx);
  return {
    passed: result.verdict.passed,
    ticks: result.ticks,
    readings: senseTotals(result.trace)['canMove'] ?? 0,
    waste: wastedTicks(ctx),
    moves: movesIssued(ctx),
    floor: walkableTiles(result.initialWorld).length,
    met: (id: string) =>
      must(
        stars.find((star) => star.id === id),
        id,
      ).met,
  };
}

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

interface Survey {
  readings: number;
  waste: number;
  ticks: number;
  medal: string;
}

const STRIDES = [4, 5, 6];

const STRIDED: Readonly<Record<number, Readonly<Record<number, Survey>>>> = {
  4: {
    1: { readings: 6, waste: 2, ticks: 20, medal: 'gold' },
    4: { readings: 7, waste: 1, ticks: 24, medal: 'gold' },
    7: { readings: 3, waste: 1, ticks: 8, medal: 'gold' },
  },
  5: {
    1: { readings: 5, waste: 2, ticks: 20, medal: 'gold' },
    4: { readings: 6, waste: 2, ticks: 25, medal: 'silver' },
    7: { readings: 3, waste: 3, ticks: 10, medal: 'gold' },
  },
  6: {
    1: { readings: 4, waste: 0, ticks: 18, medal: 'gold' },
    4: { readings: 5, waste: 1, ticks: 24, medal: 'gold' },
    7: { readings: 3, waste: 5, ticks: 12, medal: 'gold' },
  },
};

describe('w1-02 within-7-canMove', () => {
  test('striding earns it on every seed, at every stride the budgets allow', () => {
    for (const tiles of STRIDES) {
      for (const seed of w1_02.seeds) {
        const run = scored(w1_02, seed, stride(tiles));
        const budget = must(STRIDED[tiles]?.[seed], `stride ${String(tiles)} seed ${String(seed)}`);
        expect({
          tiles,
          seed,
          passed: run.passed,
          star: run.met('within-7-canMove'),
          readings: run.readings,
          waste: run.waste,
          ticks: run.ticks,
          medal: medalFor(true, run.ticks, w1_02.par.ticks),
        }).toEqual({ tiles, seed, passed: true, star: true, ...budget });
        expect(run.readings, `stride ${String(tiles)} seed ${String(seed)}`).toBeLessThanOrEqual(7);
        expect(run.waste, `stride ${String(tiles)} seed ${String(seed)}`).toBeLessThanOrEqual(5);
      }
    }
  });

  test('reading the wall by driving into it is the other way through', () => {
    for (const seed of w1_02.seeds) {
      const run = scored(w1_02, seed, bumpAlong);
      expect({
        seed,
        passed: run.passed,
        star: run.met('within-7-canMove'),
        readings: run.readings,
        waste: run.waste,
        medal: medalFor(true, run.ticks, w1_02.par.ticks),
      }).toEqual({ seed, passed: true, star: true, readings: 0, waste: 1, medal: 'gold' });
    }
  });

  test('a stride inside both budgets takes gold at every length the generator rolls', () => {
    const lengths = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const run = scored(w1_02, seed, stride(6));
      expect({
        seed,
        passed: run.passed,
        star: run.met('within-7-canMove'),
        medal: medalFor(true, run.ticks, w1_02.par.ticks),
      }).toEqual({ seed, passed: true, star: true, medal: 'gold' });
      lengths.add(run.floor);
    }
    expect([Math.min(...lengths), Math.max(...lengths)]).toEqual([8, 25]);
    expect(Math.max(...lengths) - 1).toBeLessThanOrEqual(w1_02.par.ticks);
  });

  test('the reference solution asks before every tile and is refused on every seed', () => {
    for (const seed of w1_02.seeds) {
      const run = measured(w1_02, runReference(w1_02, seed, w1_02Solution));
      expect({ seed, passed: run.passed, star: run.met('within-7-canMove'), waste: run.waste }) //
        .toEqual({ seed, passed: true, star: false, waste: 0 });
      expect(run.readings, `seed ${String(seed)}`).toBeGreaterThan(7);
      expect(medalFor(true, run.ticks, w1_02.par.ticks), `seed ${String(seed)}`).toBe('gold');
    }
  });

  test('a blind run long enough for any corridor only fits the seed it happens to fit', () => {
    const budget = [
      { seed: 1, waste: 6, star: false },
      { seed: 4, waste: 1, star: true },
      { seed: 7, waste: 17, star: false },
    ];
    expect(w1_02.seeds).toEqual(budget.map((entry) => entry.seed));
    for (const { seed, waste, star } of budget) {
      const run = scored(w1_02, seed, blindRun(24));
      expect({
        seed,
        passed: run.passed,
        readings: run.readings,
        waste: run.waste,
        star: run.met('within-7-canMove'),
      }).toEqual({ seed, passed: true, readings: 0, waste, star });
    }
  });
});

const flipEW = (dir: DirType): DirType => (dir === Dir.East ? Dir.West : Dir.East);

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

const rowSerpentine = (sim: Sim, botId: number): void => {
  sweep(sim, botId, Dir.East);
  let dir: DirType = Dir.East;
  while (sim.canMove(botId, Dir.South)) {
    sim.move(botId, Dir.South);
    dir = flipEW(dir);
    sweep(sim, botId, dir);
  }
  eastHalf(sim, botId);
};

const rowSerpentineThatBumps = (sim: Sim, botId: number): void => {
  rowSerpentine(sim, botId);
  sim.move(botId, Dir.North);
};

const SNAKED: Readonly<Record<number, { moves: number; floor: number }>> = {
  11: { moves: 35, floor: 36 },
  5: { moves: 40, floor: 41 },
  7: { moves: 25, floor: 26 },
  15: { moves: 30, floor: 31 },
  30: { moves: 45, floor: 46 },
  88: { moves: 45, floor: 46 },
};

describe('w1-03 one-move-per-tile', () => {
  test('the reference snakes both halves and earns it on every seed', () => {
    for (const seed of w1_03.seeds) {
      const run = measured(w1_03, runReference(w1_03, seed, w1_03Solution));
      const budget = must(SNAKED[seed], `seed ${String(seed)}`);
      expect({
        seed,
        passed: run.passed,
        star: run.met('one-move-per-tile'),
        moves: run.moves,
        floor: run.floor,
      }).toEqual({ seed, passed: true, star: true, ...budget });
      expect(run.moves, `seed ${String(seed)}`).toBeLessThanOrEqual(run.floor - 1);
      expect(run.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w1_03.par.ticks);
    }
  });

  test('the row serpentine takes gold and the star on every bay, the rows being odd', () => {
    for (const seed of w1_03.seeds) {
      const run = scored(w1_03, seed, rowSerpentine);
      expect({
        seed,
        passed: run.passed,
        star: run.met('one-move-per-tile'),
        medal: medalFor(run.passed, run.ticks, w1_03.par.ticks),
      }).toEqual({ seed, passed: true, star: true, medal: 'gold' });
    }
  });

  test('one move refused by a wall spends the allowance, so the same route is refused', () => {
    for (const seed of w1_03.seeds) {
      const run = scored(w1_03, seed, rowSerpentineThatBumps);
      expect({
        seed,
        passed: run.passed,
        star: run.met('one-move-per-tile'),
        moves: run.moves,
        floor: run.floor,
      }).toEqual({ seed, passed: true, star: false, moves: run.floor, floor: run.floor });
    }
  });
});
