import { describe, expect, test } from 'vitest';
import type { Dir as DirType, ObjectiveContext, Sim } from '../../../engine/index.ts';
import { Dir, evaluateObjectives } from '../../../engine/index.ts';
import { runLevel, runReference } from '../../harness.ts';
import { blockedMoves, movesIssued, walkableTiles } from '../shared.ts';
import { BAY_DEPTH, bayLayout, w1_03 } from '../w1-03.ts';
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

/** Every west-half column count the divider can put on the board, at any width. */
const COLUMN_COUNTS = [2, 3, 4, 5, 6, 7];

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

describe('the bay is five rows deep, so no west half is ever even both ways', () => {
  const shapes = SEEDS.map(shape);

  test('the depth never moves, and the width and the partition are what the generator rolls', () => {
    expect(BAY_DEPTH).toBe(5);
    expect(BAY_DEPTH % 2).toBe(1);
    expect(new Set(shapes.map((it) => it.rows))).toEqual(new Set([BAY_DEPTH]));
    expect([...new Set(shapes.map((it) => it.width))].sort((a, b) => a - b)) //
      .toEqual([6, 7, 8, 9, 10]);
    expect([...new Set(shapes.map((it) => it.divider))].sort((a, b) => a - b)) //
      .toEqual([3, 4, 5, 6, 7, 8]);
  });

  test('every column count the partition can leave in the west half turns up', () => {
    expect([...new Set(shapes.map((it) => it.columns))].sort((a, b) => a - b)) //
      .toEqual(COLUMN_COUNTS);
    expect(shapes.filter(isEvenEven)).toEqual([]);
  });

  test('the six graded seeds cover every partition column and every width', () => {
    const graded = w1_03.seeds.map(shape);
    expect(graded.map((it) => it.divider).sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(graded.map((it) => it.columns).sort((a, b) => a - b)).toEqual(COLUMN_COUNTS);
    expect([...new Set(graded.map((it) => it.width))].sort((a, b) => a - b)) //
      .toEqual([6, 7, 8, 9, 10]);
    expect(graded.filter((it) => it.columns % 2 === 0)).toHaveLength(3);
    expect(graded.filter((it) => it.columns % 2 === 1)).toHaveLength(3);
  });

  test('the first graded seed is a middling bay, not the narrowest half the rules allow', () => {
    const first = shape(w1_03.seeds[0] as number);
    expect(first).toEqual({ seed: 11, columns: 4, rows: 5, width: 8, height: 5, divider: 5 });
  });
});

describe('a clean route exists in every west half the generator can roll', () => {
  test('exhaustive search finds a Hamiltonian path at every column count', () => {
    for (const columns of COLUMN_COUNTS) {
      expect(hamiltonianExists(columns, BAY_DEPTH), `${String(columns)}x${String(BAY_DEPTH)}`) //
        .toBe(true);
    }
  }, 60000);

  test('an even depth is what would take it away, at half those column counts', () => {
    for (const columns of COLUMN_COUNTS) {
      const evenDepth = BAY_DEPTH + 1;
      const size = `${String(columns)}x${String(evenDepth)}`;
      expect(hamiltonianExists(columns, evenDepth), size).toBe(columns % 2 === 1);
      expect(coveringWalkExists(columns, evenDepth, columns * evenDepth), size).toBe(true);
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

describe('what the hints tell the player about the two snakes', () => {
  test('the row-by-row snake is left beside the doorway on every bay, the rows being odd', () => {
    for (const seed of SEEDS) {
      expect(endsBesideTheDoorway(seed, rowSnake), `seed ${String(seed)}`).toBe(true);
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
  test('on the six graded seeds, one move short of the floor count on each', () => {
    const graded = w1_03.seeds.map((seed) => {
      const run = scoreReference(seed);
      return { seed, passed: run.passed, star: run.star, moves: run.moves, floor: run.floor };
    });
    expect(graded).toEqual([
      { seed: 11, passed: true, star: true, moves: 35, floor: 36 },
      { seed: 5, passed: true, star: true, moves: 40, floor: 41 },
      { seed: 7, passed: true, star: true, moves: 25, floor: 26 },
      { seed: 15, passed: true, star: true, moves: 30, floor: 31 },
      { seed: 30, passed: true, star: true, moves: 45, floor: 46 },
      { seed: 88, passed: true, star: true, moves: 45, floor: 46 },
    ]);
  });

  test('on every bay the generator rolls, and never with a move to spare', () => {
    const spare = new Set<number>();
    const floors = new Set<number>();
    for (const seed of SEEDS) {
      const run = scoreReference(seed);
      expect({ seed, passed: run.passed, star: run.star }) //
        .toEqual({ seed, passed: true, star: true });
      spare.add(run.floor - 1 - run.moves);
      floors.add(run.floor);
    }
    expect([...spare]).toEqual([0]);
    expect([...floors].sort((a, b) => a - b)).toEqual([26, 31, 36, 41, 46]);
  });

  test('it never drives into a wall, so every move it files is a tile it entered', () => {
    for (const seed of SEEDS) expect(scoreReference(seed).blocked, `seed ${String(seed)}`).toBe(0);
  });

  test('the allowance it grades is one move under the floor count, on every seed', () => {
    for (const seed of SEEDS) {
      const run = scoreReference(seed);
      expect({ seed, moves: run.moves }).toEqual({ seed, moves: run.floor - 1 });
    }
  });
});
