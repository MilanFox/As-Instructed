/**
 * What World 8's objectives say when they are missed.
 *
 * Every test here drives a program that is wrong in one nameable way and asserts the point that
 * comes back. The finale's work orders are singled out because
 * they are the longest runs in the campaign: a shift that takes a thousand ticks to answer
 * `not met` is the most expensive guess a player can be asked to make.
 *
 * The two runs that already had programs written for them — `fieldSweep` and
 * `literalPlanFollower` in `src/levels/__tests__/naive.ts` — are reused rather than reinvented,
 * because a naive program is exactly the run whose failure has to be legible.
 */
import { describe, expect, test } from 'vitest';
import type { Objective, ObjectiveContext, Sim, Vec } from '../../../engine/index.ts';
import {
  DIVERGENCE_VALUE_CHARS,
  Dir,
  ItemKind,
  NOTHING,
  SILVER_FACTOR,
  Terrain,
  cloneWorld,
  isPassable,
  machineById,
  step,
  tileAt,
} from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { fieldSweep, literalPlanFollower } from '../../__tests__/naive.ts';
import { runLevel } from '../../harness.ts';
import type { LevelDef } from '../../types.ts';
import { key, pathOn, point } from '../shared.ts';
import { w8_01 } from '../w8-01.ts';
import { w8_02 } from '../w8-02.ts';
import { w8_03 } from '../w8-03.ts';
import { surveyFor, w8_04 } from '../w8-04.ts';
import { w8_05 } from '../w8-05.ts';

function objectiveIn(level: LevelDef, id: string): Objective {
  return must(
    [...level.objectives, ...(level.bonus ?? [])].find((each) => each.id === id),
    id,
  );
}

/** Drives one program through one seed and asks one objective what it made of it. */
function report(
  level: LevelDef,
  seed: number,
  id: string,
  drive: (sim: Sim, botId: number) => void,
) {
  const result = runLevel(level, seed, drive);
  const objective = objectiveIn(level, id);
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  return { met: objective.evaluate(ctx), divergence: objective.divergence?.(ctx), result };
}

const idle = (): void => undefined;

/** Walks a bot to `to` over the real terrain. Tests may read `sim.world`; solutions may not. */
function walkTo(sim: Sim, botId: number, to: Vec): void {
  const route = pathOn(sim.world, (at) => isPassable(sim.world, at), sim.pos(botId), to);
  if (route === null) return;
  for (const dir of route) sim.move(botId, dir);
}

// ---------------------------------------------------------------------------
// w8-01 — the two budgets
// ---------------------------------------------------------------------------

describe('w8-01 separates a crop left in the ground from a crop left in the arms', () => {
  const seed = 1;

  const firstRipe = (): Vec => {
    const world = w8_01.build(seed);
    const index = world.tiles.findIndex(
      (tile) => tile.crop !== undefined && (tile.growth ?? 0) >= (tile.maxGrowth ?? 1),
    );
    return { x: index % world.w, y: Math.floor(index / world.w) };
  };

  test('a shift that harvested nothing is given a tile that was ripe when it started', () => {
    const { met, divergence } = report(w8_01, seed, 'ripe-to-silo', idle);

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: point(firstRipe()),
      expected: 'harvested and taken to the silo',
      received: 'still standing; it was ripe at the start',
    });
  });

  /**
   * The other half of the same objective, built rather than driven: a field cleared of every ripe
   * crop with the load still aboard is a hundred and sixty ticks of sweeping to reproduce, and the
   * only thing under test is which of the two sentences the objective picks.
   */
  test('a shift that harvested everything and delivered none of it is counted at the silo', () => {
    const initialWorld = w8_01.build(seed);
    const world = cloneWorld(initialWorld);
    let ripe = 0;
    for (const tile of world.tiles) {
      if (tile.crop === undefined || (tile.growth ?? 0) < (tile.maxGrowth ?? 1)) continue;
      ripe++;
      delete tile.crop;
    }
    const bot = must(world.bots[0], 'the bot');
    bot.inventory = [{ kind: ItemKind.Crop, count: 3 }];

    const objective = objectiveIn(w8_01, 'ripe-to-silo');
    const ctx: ObjectiveContext = {
      world,
      initialWorld,
      trace: { initialWorld, events: [], keyframes: [], endTick: 0 },
    };

    expect(objective.evaluate(ctx)).toBe(false);
    expect(objective.divergence?.(ctx)).toEqual({
      where: `the silo at ${point(must(machineById(initialWorld, 'silo'), 'the silo').at)}`,
      expected: `${String(ripe)} crops`,
      received: '0 crops, 3 still in the arms',
    });
  });

  test('the World 2 sweep is told its audit note is missing, and not which row', () => {
    const { met, divergence } = report(w8_01, seed, 'name-the-row', (sim, botId) => {
      fieldSweep.run(sim, botId);
    });

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'the audit note',
      expected: 'a line naming the row that carried the most',
      received: NOTHING,
    });
  });

  test('a note naming the wrong row is priced against that row, not against the right one', () => {
    const { met, divergence } = report(w8_01, seed, 'name-the-row', (sim, botId) => {
      sim.print(botId, 'row 6 3');
      fieldSweep.run(sim, botId);
    });

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toBe('row 6');
    expect(`${shown.expected} ${shown.received}`).toMatch(/\d/);
    expect(`${shown.expected} ${shown.received}`).not.toMatch(/row \d/);
  });
});

// ---------------------------------------------------------------------------
// w8-02 — the depot
// ---------------------------------------------------------------------------

describe('w8-02 names the class that came up short, and the bay that took the wrong crate', () => {
  const seed = 1;

  test('a shift that carried nothing is told which class is short and by how much', () => {
    const { met, divergence } = report(w8_02, seed, 'depot-sorted', idle);

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toMatch(/^depot-[a-z]+$/);
    expect(shown.expected).toMatch(/^\d+ [a-z]+ on the bay$/);
    expect(shown.received).toMatch(/^no [a-z]+ there$/);
  });

  test('a crate dropped on somebody else’s bay is reported at that bay', () => {
    const world = w8_02.build(seed);
    const bays = world.machines.filter((machine) => machine.id.startsWith('depot-'));
    const bay = must(bays[0], 'a bay');
    const wanted = bay.id.slice('depot-'.length);
    const crate = must(
      world.items.find((stack) => stack.kind !== wanted),
      'a crate of another class',
    );

    const { met, divergence } = report(w8_02, seed, 'depot-sorted', (sim, botId) => {
      walkTo(sim, botId, crate.at);
      sim.pickup(botId, crate.kind, 1);
      walkTo(sim, botId, bay.at);
      sim.drop(botId, crate.kind, 1);
    });

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: point(bay.at),
      expected: `this bay takes ${wanted}`,
      received: `1 ${crate.kind} lying on it`,
    });
  });

  test('a shift that never saw the whole floor is told that, and not a tick', () => {
    const { met, divergence } = report(w8_02, seed, 'ship-while-you-look', idle);

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'the last crate or bay',
      expected: 'in view at some point in the shift',
      received: 'never came into view',
    });
  });

  /** Surveying first and carrying afterwards is the shape the bonus exists to price. */
  test('a survey run that shipped nothing on the way is priced at the last sighting', () => {
    const world = w8_02.build(seed);
    const stops = [...world.items.map((stack) => stack.at), ...world.machines.map((m) => m.at)];

    const { met, divergence } = report(w8_02, seed, 'ship-while-you-look', (sim, botId) => {
      for (const at of stops) walkTo(sim, botId, at);
    });

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toMatch(/^tick \d+, the last sighting$/);
    expect(shown.expected).toMatch(/^\d+ crates already on their bays$/);
    expect(shown.received).toBe('0 were');
  });
});

// ---------------------------------------------------------------------------
// w8-03 — the shift clock
// ---------------------------------------------------------------------------

describe('w8-03 pins an overrun on the bot that was still going', () => {
  const seed = 1;
  /** Long enough to miss both deadlines on every layout the seed table produces. */
  const LOITER = 600;

  test('within-shift names the last bot to stop and both ticks', () => {
    const { met, divergence } = report(w8_03, seed, 'within-shift', (sim, botId) => {
      sim.wait(botId, LOITER);
    });

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toMatch(/^RIG-8\d+, the last to stop$/);
    expect(shown.expected).toMatch(/^tick \d+$/);
    expect(shown.received).toBe(`tick ${String(LOITER)}`);
  });
});

/**
 * `within-shift` and the medal ladder read the same clock, and this
 * level is the only one in the campaign where one of them varies by seed and the other does not.
 * When they disagree the grade is a lie in one direction or the other: par used to be 128 while
 * seed 3's shift ended at 98, so the ladder promised gold up to 128 in a band the verdict had
 * already refused at 99 — and the bronze rung, which lives entirely above the silver cut, did not
 * exist at all on two of the five layouts.
 *
 * Asserted per seed rather than as one number, because the failure it caught was per seed.
 */
describe('w8-03 grades and fails on one axis, so the ladder sits under the shift', () => {
  const silverCut = Math.max(w8_03.par.ticks + 1, Math.floor(w8_03.par.ticks * SILVER_FACTOR));

  test('every rung is inside the shift on every seed', () => {
    for (const seed of w8_03.seeds) {
      const world = w8_03.build(seed);
      const shift = must(
        objectiveIn(w8_03, 'within-shift').progress?.({
          world,
          initialWorld: world,
          trace: { initialWorld: world, events: [], keyframes: [], endTick: 0 },
        }),
        'a progress pair',
      )[1];
      /* Gold and silver have to be awardable, and bronze has to have somewhere to live. */
      expect([seed, silverCut < shift]).toEqual([seed, true]);
    }
  });
});

// ---------------------------------------------------------------------------
// w8-04 — the filed plan
// ---------------------------------------------------------------------------

describe('w8-04 says whether the run reached the locker, and never says where it is', () => {
  /**
   * Two ways to end a shift without the form, and they are completely different bugs. Seed 5's
   * drift throws the literal follower off before it ever gets there. The second run walks the
   * whole way and never reaches for what it is standing on.
   */
  const arrivedEmptyHanded = (sim: Sim, botId: number): void => {
    walkTo(sim, botId, surveyFor(5).locker);
  };

  test('a run that never arrived and a run that arrived are told apart', () => {
    const never = report(w8_04, 5, 'form-recovered', (sim, botId) => {
      literalPlanFollower.run(sim, botId);
    });
    const stood = report(w8_04, 5, 'form-recovered', arrivedEmptyHanded);

    expect(never.met).toBe(false);
    expect(never.divergence).toEqual({
      where: 'KD-0001-T at the end of the run',
      expected: 'in the bot',
      received: 'still in the locker; nobody reached it',
    });
    expect(stood.met).toBe(false);
    expect(stood.divergence?.received).toBe('still in the locker; the bot stood on it');
  });

  test('no coordinate of the locker appears in either report', () => {
    const drives = [
      (sim: Sim, botId: number): void => {
        literalPlanFollower.run(sim, botId);
      },
      arrivedEmptyHanded,
    ];
    for (const drive of drives) {
      const shown = must(report(w8_04, 5, 'form-recovered', drive).divergence, 'a divergence');
      expect(`${shown.where} ${shown.expected} ${shown.received}`).not.toMatch(/\(\d/);
    }
  });

  /**
   * Nothing on this level kills a bot, so the death is built rather than caused. What is under
   * test is that the objective reads the `die` event's own tick, tile and reason instead of
   * reporting the bit it already knows.
   */
  test('bot-intact reads the tick, the tile and the reason off the die event', () => {
    const initialWorld = w8_04.build(1);
    const world = cloneWorld(initialWorld);
    const bot = must(world.bots[0], 'the bot');
    bot.alive = false;
    const at = { x: 9, y: 4 };
    const objective = objectiveIn(w8_04, 'bot-intact');
    const ctx: ObjectiveContext = {
      world,
      initialWorld,
      trace: {
        initialWorld,
        events: [
          { kind: 'die', t: 88, dt: 0, botId: bot.id, at, reason: 'out of fuel' },
        ],
        keyframes: [],
        endTick: 88,
      },
    };

    expect(objective.evaluate(ctx)).toBe(false);
    expect(objective.divergence?.(ctx)).toEqual({
      where: `tick 88 · ${point(at)}`,
      expected: 'the bot still running',
      received: 'out of fuel',
    });
  });
});

/**
 * The bonus holds a plan the player is meant to reconstruct, so the only tile it may name is one
 * the run put a bot on. These assertions are the guard on that: the point reported is a footprint,
 * and no leg of the filed route and no fallen stretch appears anywhere in the three fields.
 */
describe('w8-04 charges the re-survey to the run’s own footprints', () => {
  const seed = 1;

  /** Every tile the filed plan describes, recomputed the way the level computes it. */
  function planned(): Set<string> {
    const survey = surveyFor(seed);
    const tiles = new Set<string>();
    for (const leg of survey.legs) {
      let at = leg.from;
      tiles.add(key(at));
      for (let i = 0; i < leg.length; i++) {
        at = step(at, leg.dir);
        tiles.add(key(at));
      }
    }
    return tiles;
  }

  /** Walks the bot onto `count` tiles the plan says nothing about, nearest first. */
  function wander(count: number) {
    const world = w8_04.build(seed);
    const onPlan = planned();
    const strays: Vec[] = [];
    for (let y = 0; y < world.h && strays.length < count; y++) {
      for (let x = 0; x < world.w && strays.length < count; x++) {
        const at = { x, y };
        if (onPlan.has(key(at)) || tileAt(world, at)?.terrain !== Terrain.Floor) continue;
        strays.push(at);
      }
    }
    return (sim: Sim, botId: number): void => {
      for (const at of strays) walkTo(sim, botId, at);
    };
  }

  test('a run that walked the workings and filed nothing is told only that', () => {
    const { met, divergence } = report(w8_04, seed, 'read-the-plan', wander(12));

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'the reading',
      expected: 'a line reading `plan <cipher> <legs>`',
      received: NOTHING,
    });
  });

  /**
   * The two figures are the whole bonus, so neither may come back in the report. A wrong shift is
   * priced as the shift that was claimed, and a wrong leg count says only that it was wrong.
   */
  test('a wrong reading is told it is wrong and never told the right one', () => {
    const survey = surveyFor(seed);
    const wrongShift = report(w8_04, seed, 'read-the-plan', (sim, botId) => {
      sim.print(botId, `plan ${String((survey.cipherKey + 7) % 95)} ${String(survey.legs.length)}`);
    });
    expect(wrongShift.met).toBe(false);
    const cipher = must(wrongShift.divergence, 'a divergence');
    expect(cipher.where).toBe('the cipher');
    expect(`${cipher.expected} ${cipher.received}`).not.toContain(String(survey.cipherKey));

    const wrongLegs = report(w8_04, seed, 'read-the-plan', (sim, botId) => {
      sim.print(botId, `plan ${String(survey.cipherKey)} ${String(survey.legs.length + 2)}`);
    });
    expect(wrongLegs.met).toBe(false);
    const legs = must(wrongLegs.divergence, 'a divergence');
    expect(legs.where).toBe('the plan');
    expect(`${legs.expected} ${legs.received}`).not.toContain(String(survey.legs.length));
    expect(`${legs.expected} ${legs.received}`).not.toMatch(/[NESW]/);
  });
});

// ---------------------------------------------------------------------------
// w8-05 — the finale
// ---------------------------------------------------------------------------

describe('w8-05 reports the finale without driving the finale', () => {
  const seed = 1;

  test('quota names the class depot that is short and where its crates are', () => {
    const { met, divergence } = report(w8_05, seed, 'quota', idle);

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toMatch(/^depot-[a-z]+ at \(\d+, \d+\)$/);
    expect(shown.expected).toMatch(/^\d+ [a-z]+ on the tile$/);
    expect(shown.received).toMatch(/^no [a-z]+ there$/);
  });

  test('the deadline names the bot that was still going, and the tick it stopped on', () => {
    const shift = must(
      report(w8_05, seed, 'deadline', (sim: Sim, botId: number) => {
        sim.wait(botId, 3200);
      }).divergence,
      'a divergence',
    );

    expect(shift.where).toMatch(/^KD-\d+, the last to stop$/);
    expect(shift.received).toBe('tick 3200');
    expect(shift.expected).toMatch(/^tick \d+$/);
  });

  /**
   * The star that replaced two vacuous ones. A run that walked to the airlock and stopped has
   * energised nothing, so there is no hold to name and the report says exactly that — and, when
   * a station *is* named wrongly, prices it against itself rather than handing over the answer.
   */
  test('name-the-hold says the note is missing, and never which station it wanted', () => {
    const airlock = must(machineById(w8_05.build(seed), 'airlock'), 'the airlock');
    const { met, divergence } = report(w8_05, seed, 'name-the-hold', (sim, botId) => {
      walkTo(sim, botId, airlock.at);
      sim.move(botId, Dir.East);
    });

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'the hand-over note',
      expected: 'a line naming the substation that stood',
      received: NOTHING,
    });
  });

  test('a note naming a station nothing started is told that, in the run’s own terms', () => {
    const { met, divergence } = report(w8_05, seed, 'name-the-hold', (sim, botId) => {
      sim.print(botId, 'held sub-3 40');
    });

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toBe('sub-3');
    expect(shown.expected).toBe('a station this run started after its feeders');
    expect(shown.received).toBe('this run never started it');
  });

  test('a note naming no station at all is told that instead', () => {
    const { met, divergence } = report(w8_05, seed, 'name-the-hold', (sim, botId) => {
      sim.print(botId, 'held sub-99 40');
    });

    expect(met).toBe(false);
    const shown = must(divergence, 'a divergence');
    expect(shown.where).toBe('sub-99');
    expect(shown.received).toBe('nothing on the site answers to that');
  });
});

/**
 * The campaign-wide guard in `src/levels/__tests__/legibility.test.ts` drives the empty program
 * through each level's *first* seed. World 8 randomises more per seed than any other world — the
 * silo's corner, the class-to-bay mapping, how much of the filed plan has come down — so the same
 * check runs here across every seed each level ships.
 */
describe('the empty program is told where it fell short on every World 8 seed', () => {
  for (const level of [w8_01, w8_02, w8_03, w8_04, w8_05]) {
    test(`${level.id} names a point on all ${String(level.seeds.length)} seeds`, () => {
      for (const seed of level.seeds) {
        const result = runLevel(level, seed, idle);
        const ctx: ObjectiveContext = {
          world: result.world,
          trace: result.trace,
          initialWorld: result.initialWorld,
          ops: result.ops,
        };
        for (const objective of [...level.objectives, ...(level.bonus ?? [])]) {
          if (objective.evaluate(ctx)) continue;
          const named = `${level.id}/${objective.id} seed ${String(seed)}`;
          const shown = must(objective.divergence?.(ctx), named);
          for (const value of [shown.where, shown.expected, shown.received]) {
            expect(value, named).not.toBe('');
            expect(value.length, `${named}: ${value}`).toBeLessThanOrEqual(DIVERGENCE_VALUE_CHARS);
          }
        }
      }
    });
  }
});
