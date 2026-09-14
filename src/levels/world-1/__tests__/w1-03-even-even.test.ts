import { describe, expect, test } from 'vitest';
import type { Dir as DirType, ObjectiveContext, Sim } from '../../../engine/index.ts';
import { Dir, evaluateObjectives } from '../../../engine/index.ts';
import { runLevel, runReference } from '../../harness.ts';
import { blockedMoves, movesIssued, walkableTiles } from '../shared.ts';
import { bayLayout, w1_03 } from '../w1-03.ts';
import { solution as reference } from '../__solutions__/w1-03.ts';

interface Shape {
  seed: number;
  columns: number;
  rows: number;
  width: number;
  height: number;
  divider: number;
}

function shape(seed: number): Shape {
  const { width, height, divider } = bayLayout(seed);
  return { seed, columns: divider - 1, rows: height, width, height, divider };
}

const isEvenEven = (it: Shape): boolean => it.columns % 2 === 0 && it.rows % 2 === 0;

const SEEDS = Array.from({ length: 400 }, (_value, index) => index + 1);

/** The first eight even/even bays, plus the only six-column ones inside that range. */
const SAMPLE = [9, 10, 13, 14, 19, 20, 24, 25, 42, 73];

const flipEastWest = (dir: DirType): DirType => (dir === Dir.East ? Dir.West : Dir.East);
const flipNorthSouth = (dir: DirType): DirType => (dir === Dir.North ? Dir.South : Dir.North);

interface Scored {
  passed: boolean;
  star: boolean;
  moves: number;
  floor: number;
  blocked: number;
}

function measure(result: ReturnType<typeof runLevel>): Scored {
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  const stars = evaluateObjectives(w1_03.bonus ?? [], ctx);
  return {
    passed: result.verdict.passed,
    star: stars.find((star) => star.id === 'one-move-per-tile')?.met === true,
    moves: movesIssued(ctx),
    floor: walkableTiles(result.initialWorld).length,
    blocked: blockedMoves(ctx),
  };
}

const scores = new Map<number, Scored>();

/** The reference drive, measured once per seed — several tests below read all 400. */
function scoreReference(seed: number): Scored {
  const cached = scores.get(seed);
  if (cached !== undefined) return cached;
  const fresh = measure(runReference(w1_03, seed, reference));
  scores.set(seed, fresh);
  return fresh;
}

/**
 * Exhaustive walk search over a columns x rows block, from corner (1,1) to corner
 * (columns, rows), covering every tile in at most `budget` moves. The only pruning is
 * reachability and chequerboard parity: once the walk has no spare move left it must be
 * a simple path, so every uncovered tile and the far corner have to sit in one component
 * of uncovered tiles, and the colours still to cover have to alternate onto that corner.
 */
function coveringWalkExists(columns: number, rows: number, budget: number): boolean {
  const total = columns * rows;
  const visits = new Int32Array(total);
  const index = (x: number, y: number): number => (y - 1) * columns + (x - 1);
  const around = (here: number): number[] => {
    const x = (here % columns) + 1;
    const y = Math.floor(here / columns) + 1;
    const out: number[] = [];
    if (x + 1 <= columns) out.push(index(x + 1, y));
    if (y + 1 <= rows) out.push(index(x, y + 1));
    if (x - 1 >= 1) out.push(index(x - 1, y));
    if (y - 1 >= 1) out.push(index(x, y - 1));
    return out;
  };

  const target = index(columns, rows);
  const colourOf = (cell: number): number => ((cell % columns) + Math.floor(cell / columns)) % 2;

  // A simple path changes colour with every move, so the tiles left to cover have to
  // split into the two colours in step, and the last of them has to be the far corner.
  const parityAllows = (here: number, covered: number): boolean => {
    const remaining = total - covered;
    if (colourOf(target) !== (colourOf(here) + remaining) % 2) return false;
    let opposite = 0;
    for (let cell = 0; cell < total; cell++) {
      if (visits[cell] === 0 && colourOf(cell) !== colourOf(here)) opposite++;
    }
    return opposite === Math.ceil(remaining / 2);
  };

  const stillOnePiece = (here: number, covered: number): boolean => {
    const seen = new Uint8Array(total);
    const stack: number[] = [];
    for (const next of around(here)) {
      if (visits[next] !== 0 || seen[next] === 1) continue;
      seen[next] = 1;
      stack.push(next);
    }
    let found = 0;
    while (stack.length > 0) {
      const at = stack.pop() as number;
      found++;
      for (const next of around(at)) {
        if (visits[next] !== 0 || seen[next] === 1) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
    if (found !== total - covered) return false;
    if (visits[target] === 0 && seen[target] !== 1) return false;
    // A simple path enters and leaves every tile it is not stopping on, so an uncovered
    // tile with fewer than two ways in or out is already a dead end.
    for (let cell = 0; cell < total; cell++) {
      if (visits[cell] !== 0) continue;
      let ways = 0;
      for (const next of around(cell)) {
        if (visits[next] === 0 || next === here) ways++;
      }
      if (ways < (cell === target ? 1 : 2)) return false;
    }
    return true;
  };

  // Warnsdorff's rule: try the tile with the fewest ways out first. It is only an
  // ordering, so the search stays exhaustive; it just meets an answer sooner.
  const nextFewestExits = (here: number, spare: number): number[] => {
    const out = around(here).filter((next) => visits[next] === 0 || spare > 0);
    const exits = (cell: number): number => around(cell).filter((n) => visits[n] === 0).length;
    return out.sort((a, b) => exits(a) - exits(b));
  };

  let covered = 1;
  visits[index(1, 1)] = 1;

  const walk = (here: number, spent: number): boolean => {
    if (covered === total && here === target) return true;
    const spare = budget - spent - (total - covered);
    if (spare < 0) return false;
    if (spare === 0 && covered < total) {
      if (!parityAllows(here, covered)) return false;
      if (!stillOnePiece(here, covered)) return false;
    }
    if (spent === budget) return false;
    for (const next of nextFewestExits(here, spare)) {
      const before = visits[next] ?? 0;
      if (before === 0) covered++;
      visits[next] = before + 1;
      if (walk(next, spent + 1)) return true;
      visits[next] = before;
      if (before === 0) covered--;
    }
    return false;
  };

  return walk(index(1, 1), 0);
}

const hamiltonianExists = (columns: number, rows: number): boolean =>
  coveringWalkExists(columns, rows, columns * rows - 1);

describe('w1-03 bays whose west half is even both ways', () => {
  const shapes = SEEDS.map(shape);
  const evenEven = shapes.filter(isEvenEven);

  test('the generator rolls them, and seed 14 is the one the level grades', () => {
    expect(evenEven.length).toBeGreaterThan(0);
    expect(evenEven.length).toBe(109);
    expect(evenEven.slice(0, 8)).toEqual([
      { seed: 9, columns: 2, rows: 8, width: 6, height: 8, divider: 3 },
      { seed: 10, columns: 4, rows: 8, width: 8, height: 8, divider: 5 },
      { seed: 13, columns: 2, rows: 6, width: 8, height: 6, divider: 3 },
      { seed: 14, columns: 4, rows: 6, width: 8, height: 6, divider: 5 },
      { seed: 19, columns: 2, rows: 6, width: 6, height: 6, divider: 3 },
      { seed: 20, columns: 4, rows: 6, width: 9, height: 6, divider: 5 },
      { seed: 24, columns: 2, rows: 8, width: 7, height: 8, divider: 3 },
      { seed: 25, columns: 4, rows: 8, width: 8, height: 8, divider: 5 },
    ]);
    expect(shape(42)).toEqual({ seed: 42, columns: 6, rows: 6, width: 9, height: 6, divider: 7 });
    expect(shape(73)).toEqual({ seed: 73, columns: 6, rows: 8, width: 9, height: 8, divider: 7 });
    expect(w1_03.seeds.map(shape).filter(isEvenEven)).toEqual([
      { seed: 14, columns: 4, rows: 6, width: 8, height: 6, divider: 5 },
    ]);
  });

  test('every even/even column count and row count the generator can roll turns up', () => {
    const rolled = new Set(evenEven.map((it) => `${String(it.columns)}x${String(it.rows)}`));
    expect([...rolled].sort()).toEqual(['2x6', '2x8', '4x6', '4x8', '6x6', '6x8']);
  });

  test('the reference earns the star on them, at every width the half comes in', () => {
    const scored = SAMPLE.map((seed) => {
      const run = scoreReference(seed);
      const it = shape(seed);
      return {
        seed,
        half: `${String(it.columns)}x${String(it.rows)}`,
        star: run.star,
        over: run.moves - run.floor,
      };
    });
    expect(scored).toEqual([
      { seed: 9, half: '2x8', star: true, over: 0 },
      { seed: 10, half: '4x8', star: true, over: 0 },
      { seed: 13, half: '2x6', star: true, over: 0 },
      { seed: 14, half: '4x6', star: true, over: 0 },
      { seed: 19, half: '2x6', star: true, over: 0 },
      { seed: 20, half: '4x6', star: true, over: 0 },
      { seed: 24, half: '2x8', star: true, over: 0 },
      { seed: 25, half: '4x8', star: true, over: 0 },
      { seed: 42, half: '6x6', star: true, over: 0 },
      { seed: 73, half: '6x8', star: true, over: 0 },
    ]);
  });
});

describe('an even/even west half admits no Hamiltonian path to the doorway', () => {
  test('exhaustive search finds none, at every even/even size the generator rolls', () => {
    for (const columns of [2, 4, 6]) {
      for (const rows of [6, 8]) {
        expect(hamiltonianExists(columns, rows), `${String(columns)}x${String(rows)}`).toBe(false);
      }
    }
  }, 60000);

  test('one spare move is enough, at every even/even size the generator rolls', () => {
    for (const columns of [2, 4, 6]) {
      for (const rows of [6, 8]) {
        const size = `${String(columns)}x${String(rows)}`;
        expect(coveringWalkExists(columns, rows, columns * rows), size).toBe(true);
      }
    }
  }, 60000);

  test('every other parity does have one, so the claim is about even/even alone', () => {
    for (const columns of [2, 3, 4, 5, 6, 7]) {
      for (const rows of [5, 6, 7, 8]) {
        if (columns % 2 === 0 && rows % 2 === 0) continue;
        expect(hamiltonianExists(columns, rows), `${String(columns)}x${String(rows)}`).toBe(true);
      }
    }
  }, 60000);
});

const rowSnake = (sim: Sim, botId: number): void => {
  const sweep = (dir: DirType): void => {
    while (sim.canMove(botId, dir)) sim.move(botId, dir);
  };
  sweep(Dir.East);
  let heading: DirType = Dir.East;
  while (sim.canMove(botId, Dir.South)) {
    sim.move(botId, Dir.South);
    heading = flipEastWest(heading);
    sweep(heading);
  }
};

const columnSnake = (sim: Sim, botId: number): void => {
  const sweep = (dir: DirType): void => {
    while (sim.canMove(botId, dir)) sim.move(botId, dir);
  };
  sweep(Dir.South);
  let heading: DirType = Dir.South;
  while (sim.canMove(botId, Dir.East)) {
    sim.move(botId, Dir.East);
    heading = flipNorthSouth(heading);
    sweep(heading);
  }
};

/** True when the bot stands beside the doorway the moment the west half is fully inspected. */
function endsBesideTheDoorway(seed: number, drive: (sim: Sim, botId: number) => void): boolean {
  const it = shape(seed);
  const west = new Set<string>();
  for (let x = 1; x <= it.divider - 1; x++) {
    for (let y = 1; y <= it.height; y++) west.add(`${String(x)},${String(y)}`);
  }
  const trace = runLevel(w1_03, seed, drive).trace;
  let at = { x: 1, y: 1 };
  west.delete('1,1');
  for (const event of trace.events) {
    if (west.size === 0) break;
    if (event.kind !== 'move' || !event.ok) continue;
    at = event.to;
    west.delete(`${String(at.x)},${String(at.y)}`);
  }
  return west.size === 0 && at.x === it.divider - 1 && at.y === it.height;
}

describe('what hint 6 tells the player about the two snakes', () => {
  test('the row-by-row snake is left beside the doorway only when the rows are odd', () => {
    for (const seed of SEEDS) {
      expect(endsBesideTheDoorway(seed, rowSnake), `seed ${String(seed)}`) //
        .toBe(shape(seed).rows % 2 === 1);
    }
  });

  test('the column-by-column snake is left beside the doorway when the columns are odd', () => {
    for (const seed of SEEDS) {
      expect(endsBesideTheDoorway(seed, columnSnake), `seed ${String(seed)}`) //
        .toBe(shape(seed).columns % 2 === 1);
    }
  });
});

describe('the reference earns the star on every bay the generator rolls', () => {
  test('on the even/even bays, exactly on budget', () => {
    const budgeted = SAMPLE.map((seed) => {
      const run = scoreReference(seed);
      const it = shape(seed);
      return {
        seed,
        half: `${String(it.columns)}x${String(it.rows)}`,
        passed: run.passed,
        star: run.star,
        moves: run.moves,
        floor: run.floor,
      };
    });
    expect(budgeted).toEqual([
      { seed: 9, half: '2x8', passed: true, star: true, moves: 41, floor: 41 },
      { seed: 10, half: '4x8', passed: true, star: true, moves: 57, floor: 57 },
      { seed: 13, half: '2x6', passed: true, star: true, moves: 43, floor: 43 },
      { seed: 14, half: '4x6', passed: true, star: true, moves: 43, floor: 43 },
      { seed: 19, half: '2x6', passed: true, star: true, moves: 31, floor: 31 },
      { seed: 20, half: '4x6', passed: true, star: true, moves: 49, floor: 49 },
      { seed: 24, half: '2x8', passed: true, star: true, moves: 49, floor: 49 },
      { seed: 25, half: '4x8', passed: true, star: true, moves: 57, floor: 57 },
      { seed: 42, half: '6x6', passed: true, star: true, moves: 49, floor: 49 },
      { seed: 73, half: '6x8', passed: true, star: true, moves: 65, floor: 65 },
    ]);
  });

  test('on the six graded seeds, one of which is the even/even shape', () => {
    const graded = w1_03.seeds.map((seed) => {
      const run = scoreReference(seed);
      return { seed, passed: run.passed, star: run.star, moves: run.moves, floor: run.floor };
    });
    expect(graded).toEqual([
      { seed: 21, passed: true, star: true, moves: 42, floor: 43 },
      { seed: 1, passed: true, star: true, moves: 40, floor: 41 },
      { seed: 2, passed: true, star: true, moves: 48, floor: 49 },
      { seed: 6, passed: true, star: true, moves: 35, floor: 36 },
      { seed: 8, passed: true, star: true, moves: 35, floor: 36 },
      { seed: 14, passed: true, star: true, moves: 43, floor: 43 },
    ]);
  });

  test('on every bay the generator rolls, and never over budget', () => {
    const spare = new Set<number>();
    for (const seed of SEEDS) {
      const run = scoreReference(seed);
      expect({ seed, passed: run.passed, star: run.star }) //
        .toEqual({ seed, passed: true, star: true });
      spare.add(run.floor - run.moves);
    }
    expect([...spare].sort()).toEqual([0, 1]);
  });

  test('it never drives into a wall, so every move it files is a tile it entered', () => {
    for (const seed of SEEDS) expect(scoreReference(seed).blocked, `seed ${String(seed)}`).toBe(0);
  });

  test('it spends the spare move only where a Hamiltonian route does not exist', () => {
    for (const seed of SEEDS) {
      const it = shape(seed);
      const run = scoreReference(seed);
      expect({ seed, spare: run.floor - run.moves }) //
        .toEqual({ seed, spare: isEvenEven(it) ? 0 : 1 });
    }
  });
});
