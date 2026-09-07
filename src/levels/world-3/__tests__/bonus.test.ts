/**
 * World 3's bonus stars, from both sides: a run that earns one and a run that does not.
 *
 * `docs/FIX-BONUSES-3-5.md` is the specification. A bonus every passing run collects is confetti,
 * so each star reworked there is pinned by a pair — the shipped reference earns it on every
 * declared seed, and a *correct* program that did not have the second idea passes the level and
 * is refused.
 */
import { describe, expect, test } from 'vitest';
import type { ObjectiveContext, Sim, TileView, Vec } from '../../../engine/index.ts';
import { Dir, evaluateObjectives, vec } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { LevelDef, ReferenceSolution } from '../../types.ts';
import { w3_01 } from '../w3-01.ts';
import { w3_04 } from '../w3-04.ts';
import { key } from '../yard.ts';

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
    met: (id: string) => must(stars.find((star) => star.id === id), id).met,
    spent: (id: string) => must(stars.find((star) => star.id === id), id).progress?.[0],
  };
}

/**
 * The shipped reference run with its own report line rewritten or dropped.
 *
 * Every correct program for this shed surveys and then carries, so the honest missability test is
 * not "a different route" — it is *this* route, tick for tick, with only the sentence it files
 * about the shift changed. That isolates the one variable the star grades.
 */
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

  /** Filing the report is free — `print` costs no tick — so the star can never tax the medal. */
  test('the same run without its report line loads every pad and is refused', () => {
    for (const seed of w3_01.seeds) {
      const run = reportedAs(w3_01, seed, () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w3_01.par.ticks);
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });

  /**
   * Seed 1 fills both sidings, so every trip is flat and the answer is the crate count. That is
   * the honest answer for that shift and it is also the memorable one, which is why the other two
   * seeds have to refuse it: 4 of 5 on seed 2, and 1 of 3 on seed 3.
   */
  test('a memorised figure is right on the full siding and nowhere else', () => {
    const guess = (sim: Sim, botId: number): void => {
      sim.print(botId, 'straight 6');
    };
    expect(scored(w3_01, 1, guess).met('straight-runs')).toBe(true);
    expect(scored(w3_01, 2, guess).met('straight-runs')).toBe(false);
    expect(scored(w3_01, 3, guess).met('straight-runs')).toBe(false);
  });

  /** A do-nothing program files nothing, so the star is refused before the level even is. */
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

/**
 * A round that keeps out of the empty rack slots.
 *
 * Two readings of the yard do the work, and both are available to a player. The racks are rows 2,
 * 3, 6 and 7 on every seed and no crate is ever laid out anywhere else, so the aisles are 1, 4, 5
 * and 8 — and walking all four of them reads every rack row from the side. And a slot's charge is
 * settled when the shift opens, so the survey's *first* sighting of a tile is the one that counts:
 * a slot this round has since emptied is still free to cross, which is most of the route home.
 */
function aisleDisciplined(sim: Sim, botId: number): void {
  const DETOUR = 10;
  const racks = new Set([2, 3, 6, 7]);
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
    if (!racks.has(at.y)) return 1;
    const slot = opened.get(key(at));
    return slot?.items.some((stack) => stack.kind === 'crate') === true ? 1 : DETOUR;
  };

  /** First step of a cheapest route to `target`, an empty slot priced at `DETOUR` paces. */
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

/**
 * `aisle-discipline` was reported as a star nobody can earn, on the grounds that an empty rack
 * slot and an open aisle tile are identical in a `TileView`. The first half is true and the
 * conclusion does not follow: the rack rows are the same four rows on every seed and every crate
 * ever laid out stands in one, so which rows they are is a fact about the yard the player can read
 * off it. The floor was measured against the allowance of 18 rather than argued — a round with the
 * whole yard in hand pays 0, 0, 15 and 1 on the four seeds, so seed 3 is the seed that grades this
 * star and it grades it with three slots to spare.
 *
 * What the star costs is ticks: the survey has to walk four aisles instead of every third row, and
 * the carries have to thread the slots the shift opened full. `aisleDisciplined` runs 513 / 221 /
 * 393 / 92 against a par of 365, so on the two fifteen-crate seeds this star and the gold medal
 * cannot both be had. That is a real finding about the calibration and it is not a claim that the
 * star is unearnable.
 */
describe('w3-04 aisle-discipline', () => {
  test('a round that stays in the aisles earns it on every seed', () => {
    const trodden = [4, 3, 15, 8];
    w3_04.seeds.forEach((seed, i) => {
      const run = scored(w3_04, seed, aisleDisciplined);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.spent('aisle-discipline'), `seed ${String(seed)}`).toBe(trodden[i]);
      expect(run.met('aisle-discipline'), `seed ${String(seed)}`).toBe(true);
    });
  });

  /**
   * The shipped reference walks every third row, so its survey runs the length of rack row 7 and
   * its carries cross the racks wherever the shortest line falls. It takes gold on all four seeds
   * and is refused the star on all four, which is the pair this file exists to hold.
   */
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
