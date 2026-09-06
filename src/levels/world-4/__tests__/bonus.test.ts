/**
 * World 4's bonus stars, from both sides: a run that earns one and a run that does not.
 *
 * `docs/FIX-BONUSES-3-5.md` is the specification. Each star is pinned by a pair — the shipped
 * reference earns it on every declared seed, and a *correct, gold-taking* program that did not
 * have the second idea is refused. `w4-02` gets a third assertion, because the star it replaced
 * was earned by a program that never touched the level's own hardware.
 */
import { describe, expect, test } from 'vitest';
import type { Dir, ObjectiveContext, Sim } from '../../../engine/index.ts';
import { ALL_DIRS, Terrain, evaluateObjectives, opposite } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { LevelDef, ReferenceSolution } from '../../types.ts';
import { w4_01 } from '../w4-01.ts';
import { w4_02 } from '../w4-02.ts';
import { w4_05 } from '../w4-05.ts';

/*
 * The correct programs a player writes *without* the idea each star is asking for. Every driver
 * here reaches the goal and takes gold; what none of them does is the second thing.
 */

/**
 * `w4-02` as it shipped before `breadcrumb-trail`: the same DFS, marking a bare `"v"`.
 *
 * This is the run the old `mark-budget` was calibrated against, and it is a correct, gold-taking
 * answer. What its trail cannot do is lead anybody home: a tile that says only "somebody was here"
 * is a visited flag written on the floor, and `docs/FIX-BONUSES.md` records that an ordinary `Set`
 * does the same job for nothing.
 */
function markedVisited(sim: Sim, botId: number): void {
  const back: Dir[] = [];
  while (sim.scan(botId).terrain !== Terrain.Pad) {
    if (sim.readMark(botId) === null) sim.mark(botId, 'v');
    const onward = ALL_DIRS.find((dir) => {
      const view = sim.look(botId, dir, 1)[0];
      return view?.walkable === true && view.mark === null;
    });
    if (onward !== undefined) {
      sim.move(botId, onward);
      back.push(opposite(onward));
      continue;
    }
    const home = back.pop();
    if (home === undefined) return;
    sim.move(botId, home);
  }
}

/**
 * `w4-02` with no marks at all: the visited set held in program memory.
 *
 * `PLAYTEST-VETERAN.md` §122 — *"gold 236/391 + star, 1st run… I placed zero marks"*. Under the
 * old budget this took the star for leaving the issued hardware in the crate.
 */
function rememberedVisited(sim: Sim, botId: number): void {
  const seen = new Set<string>();
  const back: Dir[] = [];
  const key = (): string => {
    const at = sim.pos(botId);
    return `${String(at.x)},${String(at.y)}`;
  };
  while (sim.scan(botId).terrain !== Terrain.Pad) {
    seen.add(key());
    const onward = ALL_DIRS.find((dir) => {
      const view = sim.look(botId, dir, 1)[0];
      return view?.walkable === true && !seen.has(`${String(view.at.x)},${String(view.at.y)}`);
    });
    if (onward !== undefined) {
      sim.move(botId, onward);
      back.push(opposite(onward));
      continue;
    }
    const home = back.pop();
    if (home === undefined) return;
    sim.move(botId, home);
  }
}

/**
 * `w4-01` as it shipped: one ray, one tile ahead, before every single step.
 *
 * Correct, and tick-for-tick identical to the reference — the tunnel is forced, so it takes gold
 * on every seed. It is also the run that spends 85, 108 and 101 rays doing it.
 */
function feltAhead(sim: Sim, botId: number): void {
  let back: Dir | null = null;
  while (sim.scan(botId).terrain !== Terrain.Pad) {
    const next = ALL_DIRS.find(
      (dir) => dir !== back && sim.look(botId, dir, 1)[0]?.walkable === true,
    );
    if (next === undefined) return;
    sim.move(botId, next);
    back = opposite(next);
  }
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
    met: (id: string) => must(stars.find((star) => star.id === id), id).met,
  };
}

/** The shipped reference: passes, stays inside par, and earns the star on every declared seed. */
function referenceEarns(level: LevelDef, id: string): void {
  const solution = SOLUTIONS[level.id] as ReferenceSolution;
  for (const seed of level.seeds) {
    const result = runReference(level, seed, solution);
    const stars = evaluateObjectives(level.bonus ?? [], {
      world: result.world,
      initialWorld: result.initialWorld,
      trace: result.trace,
      ops: result.ops,
    });
    expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
    expect(result.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(level.par.ticks);
    expect(must(stars.find((star) => star.id === id), id).met, `seed ${String(seed)}`).toBe(true);
  }
}

/** A program that plays no level at all. Every star here has to refuse it on its own predicate. */
const idle = (sim: Sim, botId: number): void => {
  sim.print(botId, '.');
};

// ---------------------------------------------------------------------------
// w4-01 — read the ray as a ray
// ---------------------------------------------------------------------------

describe('w4-01 within-60-look', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w4_01, 'within-60-look');
  });

  /**
   * The old reference, and the point of the whole rework: this tunnel is forced, so a one-tile
   * feeler walk is *tick for tick identical* to the reference and takes the same gold. Ticks
   * cannot separate the two programs. Rays can, and do, on every seed.
   */
  test('feeling one tile ahead takes the same gold and is refused the star', () => {
    for (const seed of w4_01.seeds) {
      const lazy = scored(w4_01, seed, feltAhead);
      const solution = SOLUTIONS[w4_01.id] as ReferenceSolution;
      const good = runReference(w4_01, seed, solution);

      expect(lazy.passed, `seed ${String(seed)}`).toBe(true);
      expect(lazy.ticks, `seed ${String(seed)}`).toBe(good.ticks);
      expect(lazy.met('within-60-look'), `seed ${String(seed)}`).toBe(false);
    }
  });

  /** Nought rays is inside any allowance, so the star also asks the bot to have arrived. */
  test('an idle program is refused on every seed', () => {
    for (const seed of w4_01.seeds) {
      const run = scored(w4_01, seed, idle);
      expect(run.passed, `seed ${String(seed)}`).toBe(false);
      expect(run.met('within-60-look'), `seed ${String(seed)}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// w4-02 — the half of the mechanic a Set cannot stand in for
// ---------------------------------------------------------------------------

describe('w4-02 breadcrumb-trail', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w4_02, 'breadcrumb-trail');
  });

  /**
   * `PLAYTEST-VETERAN.md` §122 — *"gold 236/391 + star, 1st run… I placed zero marks."* The old
   * budget paid a star for leaving the issued hardware in the crate. This is that run, and the
   * new star refuses it on every seed while the level still passes and still takes gold.
   */
  test('a run that places no marks at all reaches the vein and is refused', () => {
    for (const seed of w4_02.seeds) {
      const run = scored(w4_02, seed, rememberedVisited);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w4_02.par.ticks);
      expect(run.met('breadcrumb-trail'), `seed ${String(seed)}`).toBe(false);
    }
  });

  /**
   * And using the hardware is not enough either. A bare `"v"` is a visited flag written on the
   * floor: it turns the cave's loops back into a tree exactly as well as the reference does, and
   * it still tells a bot standing at the vein nothing about which way is out.
   */
  test('marking every tile "somebody was here" is correct and is refused', () => {
    for (const seed of w4_02.seeds) {
      const run = scored(w4_02, seed, markedVisited);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('breadcrumb-trail'), `seed ${String(seed)}`).toBe(false);
    }
  });

  /* And it is handed its own crumb back, never the tile it should have named. */
  test('the bare visited flag is quoted back to the run that wrote it', () => {
    const result = runLevel(w4_02, 1, markedVisited);
    const star = must(
      evaluateObjectives(w4_02.bonus ?? [], {
        world: result.world,
        initialWorld: result.initialWorld,
        trace: result.trace,
        ops: result.ops,
      })[0],
      'the star',
    );
    const shown = must(star.divergence, 'a divergence');
    expect(shown.where).toMatch(/^\(\d+, \d+\)$/);
    expect(shown.expected).toBe('the tile the bot arrived from');
    expect(shown.received).toBe('v');
  });

  test('an idle program is refused on every seed', () => {
    for (const seed of w4_02.seeds) {
      const run = scored(w4_02, seed, idle);
      expect(run.passed, `seed ${String(seed)}`).toBe(false);
      expect(run.met('breadcrumb-trail'), `seed ${String(seed)}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// w4-05 — price the trip home before you drive it
// ---------------------------------------------------------------------------

/**
 * The shipped reference run with its own filed price rewritten or dropped.
 *
 * Every correct program for this shaft explores, cuts and comes back, so the honest missability
 * test is not "a different route" — it is *this* route, tick for tick and vein for vein, with only
 * the line it files about the trip home changed. That isolates the one variable the star grades.
 */
function filedAs(seed: number, rewrite: (line: string) => string | null) {
  const solution = SOLUTIONS[w4_05.id] as ReferenceSolution;
  const result = runReference(w4_05, seed, solution);
  const events = result.trace.events.flatMap((event) => {
    if (event.kind !== 'print' || !event.text.startsWith('home ')) return [event];
    const line = rewrite(event.text);
    return line === null ? [] : [{ ...event, text: line }];
  });
  const stars = evaluateObjectives(w4_05.bonus ?? [], {
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

describe('w4-05 filed-return', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w4_05, 'filed-return');
  });

  test('the same run without its filed price brings the ore home and is refused', () => {
    for (const seed of w4_05.seeds) {
      const run = filedAs(seed, () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(w4_05.par.ticks);
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });

  /** Being one move out is still not knowing the way home, on every seed. */
  test('a price that is off by one is refused on every seed', () => {
    for (const seed of w4_05.seeds) {
      const run = filedAs(seed, (line) => `home ${String(Number(line.split(' ')[1]) - 1)}`);
      expect(run.met, `seed ${String(seed)}`).toBe(false);
    }
  });

  /**
   * The order is the whole point. Same run, same figure, same tick count — the line moved to the
   * end of the trace, so it describes a trip already made instead of reserving one. Refused, and
   * told which of the two it did.
   */
  test('reporting the trip after driving it is not filing it', () => {
    const solution = SOLUTIONS[w4_05.id] as ReferenceSolution;
    for (const seed of w4_05.seeds) {
      const result = runReference(w4_05, seed, solution);
      const filed = result.trace.events.filter(
        (event) => event.kind === 'print' && event.text.startsWith('home '),
      );
      const events = [
        ...result.trace.events.filter(
          (event) => !(event.kind === 'print' && event.text.startsWith('home ')),
        ),
        ...filed,
      ];
      const ctx: ObjectiveContext = {
        world: result.world,
        initialWorld: result.initialWorld,
        trace: { ...result.trace, events },
        ops: result.ops,
      };
      const star = must(evaluateObjectives(w4_05.bonus ?? [], ctx)[0], 'the star');

      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
      expect(star.met, `seed ${String(seed)}`).toBe(false);
      expect(star.divergence?.received, `seed ${String(seed)}`).toBe('the bot drove off first');
    }
  });

  test('an idle program is refused on every seed', () => {
    for (const seed of w4_05.seeds) {
      const run = scored(w4_05, seed, idle);
      expect(run.passed, `seed ${String(seed)}`).toBe(false);
      expect(run.met('filed-return'), `seed ${String(seed)}`).toBe(false);
      const result = runLevel(w4_05, seed, idle);
      const star = must(
        evaluateObjectives(w4_05.bonus ?? [], {
          world: result.world,
          initialWorld: result.initialWorld,
          trace: result.trace,
          ops: result.ops,
        })[0],
        'the star',
      );
      expect(star.divergence?.received, `seed ${String(seed)}`).toBe('the quota was never made');
    }
  });
});
