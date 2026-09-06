/**
 * World 8's bonus stars, from both sides: a run that earns one and a run that does not.
 *
 * `docs/FIX-BONUSES-7-8.md` is the specification. Three questions decide whether a star is worth
 * having, and all three are asserted here: does it ask something the required objectives do not,
 * is it refused to a correct program that did not have the idea, and — the one that caught
 * `w8-05`'s two budget stars — is it refused to a program that does nothing at all.
 */
import { describe, expect, test } from 'vitest';
import type { ObjectiveContext, Sim, Trace } from '../../../engine/index.ts';
import { evaluateObjectives } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel, runReference } from '../../harness.ts';
import { SOLUTIONS } from '../../__tests__/solutions.ts';
import type { LevelDef, ReferenceSolution } from '../../types.ts';
import { w8_01 } from '../w8-01.ts';
import { w8_02 } from '../w8-02.ts';
import { w8_04 } from '../w8-04.ts';
import { w8_05 } from '../w8-05.ts';

function starsOn(level: LevelDef, ctx: ObjectiveContext) {
  const scored = evaluateObjectives(level.bonus ?? [], ctx);
  return (id: string): boolean => must(scored.find((star) => star.id === id), id).met;
}

/** The reference has to earn a star on *every* seed now: a bonus is graded on the worst one. */
function referenceEarns(level: LevelDef, id: string): void {
  const solution = SOLUTIONS[level.id] as ReferenceSolution;
  for (const seed of level.seeds) {
    const result = runReference(level, seed, solution);
    const met = starsOn(level, {
      world: result.world,
      trace: result.trace,
      initialWorld: result.initialWorld,
      ops: result.ops,
    });
    expect(result.verdict.passed, `${level.id} seed ${String(seed)}`).toBe(true);
    expect(met(id), `${level.id} seed ${String(seed)}`).toBe(true);
  }
}

/**
 * The reference run with the one line it files about itself rewritten or dropped.
 *
 * Every correct program for these levels is a long logistics program, so the honest missability
 * test is not "a different program" — it is *this* program, holding every tick, every crate and
 * every station identical, with only the sentence it reports changed. That isolates the single
 * variable the star grades.
 */
function reportedAs(
  level: LevelDef,
  seed: number,
  keyword: string,
  rewrite: (line: string) => string | null,
) {
  const solution = SOLUTIONS[level.id] as ReferenceSolution;
  const result = runReference(level, seed, solution);
  const events = result.trace.events.flatMap((event) => {
    if (event.kind !== 'print' || !event.text.startsWith(`${keyword} `)) return [event];
    const line = rewrite(event.text);
    return line === null ? [] : [{ ...event, text: line }];
  });
  const trace: Trace = { ...result.trace, events };
  return {
    passed: result.verdict.passed,
    met: starsOn(level, {
      world: result.world,
      trace,
      initialWorld: result.initialWorld,
      ops: result.ops,
    }),
  };
}

/** A program that does nothing but say so. Nothing it fails to do may be worth a star. */
const idle = (sim: Sim, botId: number): void => {
  sim.print(botId, 'nothing');
};

// ---------------------------------------------------------------------------
// w8-01 — name the row the shift opened heaviest on
// ---------------------------------------------------------------------------

describe('w8-01 name-the-row', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w8_01, 'name-the-row');
  });

  test('the same run without its audit note is refused on every seed', () => {
    for (const seed of w8_01.seeds) {
      const run = reportedAs(w8_01, seed, 'row', () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('name-the-row'), `seed ${String(seed)}`).toBe(false);
    }
  });

  /**
   * The count is the easy half and the row is the hard one. A run that knows how much the
   * heaviest row held and guesses which row it was is still refused.
   */
  test('the right count under the wrong row is refused', () => {
    const earned = w8_01.seeds.filter(
      (seed) =>
        reportedAs(w8_01, seed, 'row', (line) => `row 0 ${line.split(' ')[2] ?? ''}`).met(
          'name-the-row',
        ),
    );
    expect(earned.length).toBeLessThan(w8_01.seeds.length);
  });

  /** And no single answer is right on every layout, which is what a star is graded on now. */
  test('one memorised line does not carry the campaign', () => {
    for (const guess of ['row 2 4', 'row 9 3', 'row 0 1']) {
      const all = w8_01.seeds.every(
        (seed) => reportedAs(w8_01, seed, 'row', () => guess).met('name-the-row'),
      );
      expect(all, guess).toBe(false);
    }
  });

  test('a program that does nothing is refused it on every seed', () => {
    for (const seed of w8_01.seeds) {
      const result = runLevel(w8_01, seed, idle);
      const met = starsOn(w8_01, {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      });
      expect(met('name-the-row'), `seed ${String(seed)}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// w8-04 — prove the plan was read
// ---------------------------------------------------------------------------

describe('w8-04 read-the-plan', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w8_04, 'read-the-plan');
  });

  /**
   * The star this replaced paid for *not* using the plan: the short way to the locker is a
   * subsequence of the plan's own tiles, so it strayed less than the reference did and took
   * `no-resurvey` more comfortably than the intended solution. Nothing in the workings carries
   * the cipher, so a route that never received a packet cannot file this line at all.
   */
  test('the same run without its reading is refused on every seed', () => {
    for (const seed of w8_04.seeds) {
      const run = reportedAs(w8_04, seed, 'plan', () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('read-the-plan'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a guessed shift is refused, and no one shift is right on every layout', () => {
    for (const guess of [0, 13, 41, 77, 94]) {
      const all = w8_04.seeds.every(
        (seed) =>
          reportedAs(w8_04, seed, 'plan', (line) => `plan ${String(guess)} ${line.split(' ')[2] ?? ''}`).met(
            'read-the-plan',
          ),
      );
      expect(all, String(guess)).toBe(false);
    }
  });

  test('the right shift under a wrong leg count is refused on every seed', () => {
    for (const seed of w8_04.seeds) {
      const run = reportedAs(w8_04, seed, 'plan', (line) => {
        const parts = line.split(' ');
        return `plan ${parts[1] ?? ''} ${String(Number(parts[2]) + 1)}`;
      });
      expect(run.met('read-the-plan'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('a program that does nothing is refused it on every seed', () => {
    for (const seed of w8_04.seeds) {
      const result = runLevel(w8_04, seed, idle);
      const met = starsOn(w8_04, {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      });
      expect(met('read-the-plan'), `seed ${String(seed)}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// w8-05 — name the substation the schedule left standing
// ---------------------------------------------------------------------------

describe('w8-05 name-the-hold', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w8_05, 'name-the-hold');
  });

  test('the same run without its hand-over note is refused on every seed', () => {
    for (const seed of w8_05.seeds) {
      const run = reportedAs(w8_05, seed, 'held', () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('name-the-hold'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the right figure under the wrong station is refused on every seed', () => {
    for (const seed of w8_05.seeds) {
      const run = reportedAs(w8_05, seed, 'held', (line) => `held sub-0 ${line.split(' ')[2] ?? ''}`);
      expect(run.met('name-the-hold'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the right station under a wrong figure is refused on every seed', () => {
    for (const seed of w8_05.seeds) {
      const run = reportedAs(w8_05, seed, 'held', (line) => {
        const parts = line.split(' ');
        return `held ${parts[1] ?? ''} ${String(Number(parts[2]) - 1)}`;
      });
      expect(run.met('name-the-hold'), `seed ${String(seed)}`).toBe(false);
    }
  });

  /**
   * The star this replaced. `under-budget` and `no-blocked-moves` both measured the absence of
   * something, so a program that never moved satisfied both of the finale's cheapest stars; the
   * one that took their place asks for a fact only a run that worked the site can produce.
   */
  test('a program that does nothing is refused it on every seed', () => {
    for (const seed of w8_05.seeds) {
      const result = runLevel(w8_05, seed, idle);
      const met = starsOn(w8_05, {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      });
      expect(met('name-the-hold'), `seed ${String(seed)}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// w8-05 — the join the coupling created
// ---------------------------------------------------------------------------

/**
 * The second star, opened deliberately after `docs/FIX-FINALE-INTEGRATE.md` §1 coupled the airlock
 * to the grid.
 *
 * `name-the-hold` reads the use log and nothing else, which makes it a report on the one thread of
 * this level that already integrated. `mind-the-gate` reads the join the coupling put there: the
 * ticks the door stood powered and shut, which is the grid's clock priced against the errand's.
 *
 * The property that makes it worth a star rather than a chore is that it is unreachable without
 * the integration. There is no interval to report on a shift where the gate never moved, and on
 * this site the gate does not move until the substation it draws from is on — so a program that
 * did the errand and skipped the grid has nothing to say, and neither does one that did nothing.
 */
describe('w8-05 mind-the-gate', () => {
  test('the reference solution earns it on every seed', () => {
    referenceEarns(w8_05, 'mind-the-gate');
  });

  test('the same run without its gate note is refused on every seed', () => {
    for (const seed of w8_05.seeds) {
      const run = reportedAs(w8_05, seed, 'gate', () => null);
      expect(run.passed, `seed ${String(seed)}`).toBe(true);
      expect(run.met('mind-the-gate'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the right figure under the wrong substation is refused on every seed', () => {
    for (const seed of w8_05.seeds) {
      const run = reportedAs(
        w8_05,
        seed,
        'gate',
        (line) => `gate sub-0 ${line.split(' ')[2] ?? ''}`,
      );
      expect(run.met('mind-the-gate'), `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the right substation under a wrong figure is refused on every seed', () => {
    for (const seed of w8_05.seeds) {
      const run = reportedAs(w8_05, seed, 'gate', (line) => {
        const parts = line.split(' ');
        return `gate ${parts[1] ?? ''} ${String(Number(parts[2]) + 1)}`;
      });
      expect(run.met('mind-the-gate'), `seed ${String(seed)}`).toBe(false);
    }
  });

  /* The station count is on the desk and the shift length is on the rail, so a note assembled out
     of numbers the level hands over for free has to be refused too. It is: the interval is a fact
     about two ticks that only the run that lived them knows. */
  test('the two stars do not answer the same question', () => {
    for (const seed of w8_05.seeds) {
      const run = reportedAs(w8_05, seed, 'gate', (line) => line);
      expect(run.met('mind-the-gate'), `seed ${String(seed)}`).toBe(true);
      expect(run.met('name-the-hold'), `seed ${String(seed)}`).toBe(true);
    }
    const swapped = reportedAs(w8_05, w8_05.seeds[0] as number, 'gate', () => null);
    expect(swapped.met('name-the-hold')).toBe(true);
    expect(swapped.met('mind-the-gate')).toBe(false);
  });

  test('a program that does nothing is refused it on every seed', () => {
    for (const seed of w8_05.seeds) {
      const result = runLevel(w8_05, seed, idle);
      const met = starsOn(w8_05, {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      });
      expect(met('mind-the-gate'), `seed ${String(seed)}`).toBe(false);
    }
  });

  /** A guessed line is refused, so the star cannot be had by printing a plausible sentence. */
  test('a program that only files the note is refused it on every seed', () => {
    for (const seed of w8_05.seeds) {
      const result = runLevel(w8_05, seed, (sim, botId) => {
        sim.print(botId, 'gate sub-0 0');
      });
      const met = starsOn(w8_05, {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      });
      expect(met('mind-the-gate'), `seed ${String(seed)}`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// The two stars World 8 kept, pinned against the seed-wide grading rule
// ---------------------------------------------------------------------------

describe('the star World 8 kept is earned on every seed, not on seed one', () => {
  test('w8-02 ship-while-you-look', { timeout: 60_000 }, () => {
    referenceEarns(w8_02, 'ship-while-you-look');
  });

  /** Shipping before the survey is done cannot be faked by not shipping. */
  test('w8-02 ship-while-you-look is refused a program that does nothing', () => {
    for (const seed of w8_02.seeds) {
      const result = runLevel(w8_02, seed, idle);
      const met = starsOn(w8_02, {
        world: result.world,
        trace: result.trace,
        initialWorld: result.initialWorld,
        ops: result.ops,
      });
      expect(met('ship-while-you-look'), `seed ${String(seed)}`).toBe(false);
    }
  });
});
