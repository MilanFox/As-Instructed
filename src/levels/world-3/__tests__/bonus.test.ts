import { describe, expect, test } from 'vitest';
import type { ObjectiveContext, Sim, TileView, Vec, World } from '../../../engine/index.ts';
import { Dir, countItemsAt, evaluateObjectives, vec } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { LevelDef, ReferenceSolution } from '../../types.ts';
import { w3_01 } from '../w3-01.ts';
import { w3_04 } from '../w3-04.ts';
import { key } from '../yard.ts';

function countCrates(world: World): number {
  let total = 0;
  for (let y = 0; y < world.h; y++) {
    for (let x = 0; x < world.w; x++) total += countItemsAt(world, vec(x, y), 'crate');
  }
  return total;
}

function scored(level: LevelDef, seed: number, drive: (sim: Sim, bot: number) => void) {
  const result = runLevel(level, seed, drive);
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  const stars = evaluateObjectives(level.bonus ?? [], ctx);
  return {
    passed: result.verdict.passed,
    ticks: result.trace.endTick,
    met: (id: string) =>
      must(
        stars.find((star) => star.id === id),
        id,
      ).met,
    spent: (id: string) =>
      must(
        stars.find((star) => star.id === id),
        id,
      ).progress?.[0],
  };
}

function reportedAs(level: LevelDef, seed: number, rewrite: (line: string) => string | null) {
  const solution = SOLUTIONS[level.id] as ReferenceSolution;
  const result = runReference(level, seed, solution);
  const events = result.trace.events.flatMap((event) => {
    if (event.kind !== 'print' || !event.text.startsWith('straight ')) return [event];
    const line = rewrite(event.text);
    return line === null ? [] : [{ ...event, text: line }];
  });
  const stars = evaluateObjectives(level.bonus ?? [], {
    world: result.world,
    initialWorld: result.initialWorld,
    trace: { ...result.trace, events },
    ops: result.ops,
  });
  return {
    passed: result.verdict.passed,
    ticks: result.trace.endTick,
    met: must(stars[0], 'the star').met,
  };
}

describe('w3-01 straight-runs', () => {
  test('the reference solution earns it on every seed, still inside par', () => {
    const solution = SOLUTIONS[w3_01.id] as ReferenceSolution;
    for (const seed of w3_01.seeds) {
      const result = runReference(w3_01, seed, solution);
      const stars = evaluateObjectives(w3_01.bonus ?? [], {
        world: result.world,
        initialWorld: result.initialWorld,
        trace: result.trace,
        ops: result.ops,
      });
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
      expect(result.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w3_01.par.ticks);
      expect(must(stars[0], 'the star').met, `seed ${String(seed)}`).toBe(true);
    }
  });

  test('the same run without its report line loads every pad and is refused', () => {
    for (const seed of w3_01.seeds) {
      const run = reportedAs(w3_01, seed, () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w3_01.par.ticks);
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('no memorised figure is right on any seed', () => {
    for (const seed of w3_01.seeds) {
      for (let figure = 0; figure <= 6; figure++) {
        const guess = (sim: Sim, botId: number): void => {
          sim.print(botId, `straight ${String(figure)}`);
        };
        const met = scored(w3_01, seed, guess).met('straight-runs');
        const answers = w3_01.seeds.filter((other) =>
          scored(w3_01, other, guess).met('straight-runs'),
        );
        if (met) {
          expect(
            answers,
            `figure ${String(figure)} answers more than seed ${String(seed)}`,
          ).toEqual([seed]);
        }
      }
    }
  });

  test('the crate count is never the answer', () => {
    for (const seed of w3_01.seeds) {
      const crates = countCrates(w3_01.build(seed));
      const guess = (sim: Sim, botId: number): void => {
        sim.print(botId, `straight ${String(crates)}`);
      };
      expect(scored(w3_01, seed, guess).met('straight-runs'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('an idle program is refused on every seed', () => {
    for (const seed of w3_01.seeds) {
      const run = scored(w3_01, seed, (sim, botId) => {
        sim.print(botId, 'nothing to report');
      });
      expect(run.passed, `seed ${String(seed)}`).toBe(false);
      expect(run.met('straight-runs'), `seed ${String(seed)}`).toBe(false);
    }
  });
});

function aisleDisciplined(sim: Sim, botId: number): void {
  const DETOUR = 10;
  const racks = new Set([2, 3, 6, 7]);
  const aisleCols = new Set([1, 6, 11, 16]);
  const opened = new Map<string, TileView>();
  const walls = new Set<string>();

  const see = (tile: TileView): void => {
    if (tile.inBounds && !opened.has(key(tile.at))) opened.set(key(tile.at), tile);
  };
  const read = (): void => {
    see(sim.scan(botId));
    for (const dir of [Dir.North, Dir.South, Dir.East, Dir.West]) see(sim.scan(botId, dir));
  };
  const charge = (at: Vec): number => {
    const slot = opened.get(key(at));
    if (slot === undefined) return racks.has(at.y) && !aisleCols.has(at.x) ? DETOUR : 1;
    if (slot.terrain !== 'rack') return 1;
    return slot.items.some((stack) => stack.kind === 'crate') ? 1 : DETOUR;
  };

  const towards = (target: Vec): Dir | null => {
    const from = sim.pos(botId);
    const spent = new Map<string, number>([[key(from), 0]]);
    const opening = new Map<string, Dir>();
    const queue: Vec[][] = [[from]];
    for (let d = 0; d < queue.length; d++) {
      for (const at of queue[d] ?? []) {
        if (spent.get(key(at)) !== d) continue;
        if (at.x === target.x && at.y === target.y) return opening.get(key(at)) ?? null;
        const steps: [Dir, Vec][] = [
          [Dir.North, vec(at.x, at.y - 1)],
          [Dir.South, vec(at.x, at.y + 1)],
          [Dir.East, vec(at.x + 1, at.y)],
          [Dir.West, vec(at.x - 1, at.y)],
        ];
        for (const [dir, next] of steps) {
          if (walls.has(key(next)) || opened.get(key(next))?.walkable === false) continue;
          if (Math.abs(next.x - from.x) > 20 || Math.abs(next.y - from.y) > 20) continue;
          const cost = d + charge(next);
          if (cost >= (spent.get(key(next)) ?? Number.POSITIVE_INFINITY)) continue;
          spent.set(key(next), cost);
          opening.set(key(next), opening.get(key(at)) ?? dir);
          while (queue.length <= cost) queue.push([]);
          (queue[cost] as Vec[]).push(next);
        }
      }
    }
    return null;
  };

  const goTo = (target: Vec): void => {
    read();
    for (let guard = 0; guard < 4000; guard++) {
      const at = sim.pos(botId);
      if (at.x === target.x && at.y === target.y) return;
      const dir = towards(target);
      if (dir === null) return;
      if (!sim.canMove(botId, dir)) {
        walls.add(key(sim.scan(botId, dir).at));
        continue;
      }
      sim.move(botId, dir);
      read();
    }
  };

  let eastward = true;
  for (const aisle of [1, 4, 5, 8]) {
    goTo(vec(eastward ? 1 : 16, aisle));
    goTo(vec(eastward ? 16 : 1, aisle));
    eastward = !eastward;
  }

  const bay = [...opened.values()].find((tile) => tile.terrain === 'pad');
  if (!bay) return;
  const slots = [...opened.values()]
    .filter(
      (tile) =>
        tile.items.some((stack) => stack.kind === 'crate') &&
        Number.isInteger(Number(tile.mark ?? Number.NaN)),
    )
    .sort((a, b) => Number(a.mark) - Number(b.mark));

  for (const slot of slots) {
    goTo(slot.at);
    sim.pickup(botId, 'crate', 1);
    goTo(bay.at);
    sim.drop(botId, 'crate', 1);
  }
}

describe('w3-04 aisle-discipline', () => {
  test('a round that stays in the aisles earns it on every seed', () => {
    const trodden = [0, 0, 0, 0];
    w3_04.seeds.forEach((seed, i) => {
      const run = scored(w3_04, seed, aisleDisciplined);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.spent('aisle-discipline'), `seed ${String(seed)}`).toBe(trodden[i]);
      expect(run.met('aisle-discipline'), `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w3_04.par.ticks);
    });
  });

  test('the reference sweeps the racks, takes gold and is refused on every seed', () => {
    const solution = SOLUTIONS[w3_04.id] as ReferenceSolution;
    for (const seed of w3_04.seeds) {
      const result = runReference(w3_04, seed, solution);
      const stars = evaluateObjectives(w3_04.bonus ?? [], {
        world: result.world,
        initialWorld: result.initialWorld,
        trace: result.trace,
        ops: result.ops,
      });
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
      expect(result.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w3_04.par.ticks);
      expect(must(stars[0], 'the star').met, `seed ${String(seed)}`).toBe(false);
    }
  });
});
