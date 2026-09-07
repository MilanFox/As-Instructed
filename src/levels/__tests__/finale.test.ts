import { describe, expect, test, vi } from 'vitest';
import type { ActEvent, World } from '../../engine/index.ts';
import { FED_BY, Terrain, machineById, tileAt } from '../../engine/index.ts';
import { FakeRunner } from '../../game/ports.ts';
import { emptySave } from '../../game/save.ts';
import { objectivesOnEverySeed } from '../../game/score.ts';
import { useGame } from '../../game/store.ts';
import { unlockedApiNames } from '../../runtime/ambient.ts';
import { aggregate } from '../../runtime/aggregate.ts';
import { runSeed } from '../../runtime/run-level.ts';
import type { LevelDef, ReferenceSolution } from '../types.ts';
import { getLevel } from '../index.ts';
import { runReference } from '../harness.ts';
import { SOLUTIONS } from './solutions.ts';
import { formErrandOnly } from './naive.ts';

/**
 * The two defects the finale used to have, pinned as tests.
 *
 * The first is the bypass an AoC playtester found: `power(id, state)` reached any machine
 * anywhere on the map, so eight calls and sixteen ticks satisfied both grid objectives of the
 * finale without a bot leaving the muster bay. The second is the reason they gave up: five
 * objectives across seven seeds collapsed into one bit, so a partially correct program was
 * indistinguishable from a blank one.
 */

function run(level: LevelDef, seed: number, js: string) {
  return runSeed({
    level,
    seed,
    js,
    source: js,
    unlockedHardware: unlockedApiNames(level.id),
  });
}

function levelOrThrow(id: string): LevelDef {
  const level = getLevel(id);
  if (!level) throw new Error(`no such level: ${id}`);
  return level;
}

/** The playtester's run 3, verbatim in shape: read the graph, sort it, switch it on from the bay. */
const GRID_BYPASS = `
const count = probe('desk').vars.stations;
const stations = [];
for (let i = 0; i < count; i++) {
  const view = probe('sub-' + i);
  const deps = [];
  for (let n = 0; n < view.vars.deps; n++) deps.push(view.vars['dep' + n]);
  stations.push({ index: i, deps: deps });
}
const done = new Set();
let guard = 0;
while (done.size < stations.length && guard++ < 100) {
  for (const station of stations) {
    if (done.has(station.index)) continue;
    if (!station.deps.every((d) => done.has(d))) continue;
    print('power sub-' + station.index + ' -> ' + power('sub-' + station.index, 'on'));
    done.add(station.index);
  }
}
`;

const AIRLOCK_BYPASS = `print('airlock -> ' + power('airlock', 'open'));`;

function powerCalls(events: readonly { kind: string }[]): ActEvent[] {
  return events.filter(
    (event): event is ActEvent => event.kind === 'act' && (event as ActEvent).name === 'power',
  );
}

describe('the finale no longer answers to power() from across the map', () => {
  test('the eight-call grid bypass leaves every substation off', () => {
    const level = levelOrThrow('w8-05');
    for (const seed of level.seeds) {
      const outcome = run(level, seed, GRID_BYPASS);
      const calls = powerCalls(outcome.trace.events);

      expect(calls.length, `seed ${String(seed)}`).toBeGreaterThan(0);
      expect(
        calls.every((call) => !call.ok),
        `seed ${String(seed)}: power reached a manual machine`,
      ).toBe(true);

      const grid = outcome.verdict.objectives.find((entry) => entry.id === 'grid-online');
      expect(grid?.met, `seed ${String(seed)}`).toBe(false);
      expect(grid?.progress?.[0], `seed ${String(seed)}`).toBe(0);
      expect(outcome.verdict.passed, `seed ${String(seed)}`).toBe(false);
    }
  });

  test('the grid bypass is told where it went wrong rather than just failing', () => {
    const level = levelOrThrow('w8-05');
    const outcome = run(level, level.seeds[0] as number, GRID_BYPASS);
    const grid = outcome.verdict.objectives.find((entry) => entry.id === 'grid-online');
    expect(grid?.divergence?.where).toMatch(/^sub-\d+ at \(\d+, \d+\)$/);
    expect(grid?.divergence?.received).toContain('never used');
  });

  test('the airlock cannot be opened from the bay either', () => {
    const level = levelOrThrow('w8-05');
    const outcome = run(level, level.seeds[0] as number, AIRLOCK_BYPASS);

    expect(powerCalls(outcome.trace.events).every((call) => !call.ok)).toBe(true);

    const airlock = machineById(outcome.trace.initialWorld, 'airlock');
    if (!airlock?.links) throw new Error('the airlock has no gate tiles');
    for (const at of airlock.links) {
      expect(tileAt(outcome.trace.initialWorld, at)?.terrain).toBe(Terrain.Wall);
    }
  });

  test('World 5 still operates its grid from the desk', () => {
    // The reason `power` was not changed wholesale: w5-02 is a binary search over 200 relays and
    // the bot never moves. Marking machines rather than the command is what keeps it working.
    const level = levelOrThrow('w5-02');
    const outcome = run(level, level.seeds[0] as number, `power('relay-0', 'patched');`);
    expect(powerCalls(outcome.trace.events).some((call) => call.ok)).toBe(true);
  });
});

describe('a partly-correct program is credited per objective, per seed', () => {
  const IDLE = `print('reporting for duty');`;

  test('an idle run banks the objectives it did hold on every seed', () => {
    const level = levelOrThrow('w8-05');
    const runs = level.seeds.map((seed) => run(level, seed, IDLE));
    const response = aggregate(runs);
    if (!response.ok) throw new Error('the run did not come back');

    expect(response.verdict.passed).toBe(false);

    /* The verdict carries the level's bonus rows too, and a bonus is not banked work:
       `objectivesOnEverySeed` is asked about the required list only. */
    const required = new Set(level.objectives.map((objective) => objective.id));
    const met = response.verdict.objectives
      .filter((entry) => entry.met && required.has(entry.id))
      .map((entry) => entry.id);
    const missed = response.verdict.objectives
      .filter((entry) => !entry.met && required.has(entry.id))
      .map((entry) => entry.id);
    expect(met.length, 'a partial run must not report a bare zero').toBeGreaterThan(0);
    expect(missed).toContain('grid-online');
    expect(missed).toContain('quota');

    const banked = objectivesOnEverySeed(
      response.results,
      level.objectives.map((objective) => objective.id),
    );
    expect(banked).toEqual(met);
  });

  test('each objective is reported from the seed that missed it, not from seed one', () => {
    const level = levelOrThrow('w8-05');
    const runs = level.seeds.map((seed) => run(level, seed, IDLE));

    /* Seed 1 has the smallest grid, so reporting every objective from it would understate the
       work outstanding on the others. The aggregate has to take the worst column per row. */
    const response = aggregate(runs);
    if (!response.ok) throw new Error('the run did not come back');
    const grid = response.verdict.objectives.find((entry) => entry.id === 'grid-online');
    const widest = Math.max(
      ...runs.map(
        (each) =>
          each.verdict.objectives.find((entry) => entry.id === 'grid-online')?.progress?.[1] ?? 0,
      ),
    );
    expect(grid?.progress?.[1]).toBeLessThanOrEqual(widest);
    expect(grid?.met).toBe(false);
  });

  test('the credit survives the run that earned it', async () => {
    useGame.setState({ save: emptySave() });
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    useGame.getState().openLevel('w8-05');
    useGame.getState().setCode(IDLE);
    useGame.getState().run();
    await vi.waitFor(() => expect(useGame.getState().runState).toBe('idle'));

    const progress = useGame.getState().save.levels['w8-05'];
    expect(progress?.completed).toBe(false);
    /* The point of the whole exercise: a failed run still leaves a record of what was closed,
       so four of five is a state the game can show rather than a state it forgets. */
    expect(progress?.objectives?.length ?? 0).toBeGreaterThan(0);
    expect(progress?.objectives).not.toContain('quota');
    useGame.setState({ save: emptySave() });
  });

  test('the three seeds kept are the three the level is authored against', () => {
    // A branching grid at the smallest scale, a pure chain, and the fuel squeeze. Anything else
    // in the old list of seven moved a number without moving a decision.
    expect(levelOrThrow('w8-05').seeds).toEqual([1, 4, 7]);
  });
});

// ---------------------------------------------------------------------------
// The third specific: the form leg used to depend on nothing
// ---------------------------------------------------------------------------

/**
 * The same level with the one line of the coupling removed from its door.
 *
 * A test that only ran the errand against the shipped level could say that it fails, and would not
 * be able to say *why* — a fixture that walks into a wall looks identical to a fixture that cannot
 * walk. Building the level twice, differing in nothing but the `fed:` key `build` writes onto the
 * airlock, is what makes the difference attributable to the coupling rather than to the program.
 */
function withoutTheCoupling(level: LevelDef): LevelDef {
  return {
    ...level,
    build(seed: number): World {
      const world = level.build(seed);
      const airlock = machineById(world, 'airlock');
      for (const name of Object.keys(airlock?.vars ?? {})) {
        if (name.startsWith(FED_BY) && airlock) delete airlock.vars[name];
      }
      return world;
    },
  };
}

function metOn(level: LevelDef, seed: number, solution: ReferenceSolution): Set<string> {
  const result = runReference(level, seed, solution);
  return new Set(result.verdict.objectives.filter((entry) => entry.met).map((entry) => entry.id));
}

/**
 * The one specific that survived the finale rewrite: the finale
 * *accumulates rather than integrates*, and concretely, *"the form leg depends on nothing else"*.
 *
 * It was true, and it was cheap: `formErrandOnly` lifts KD-0001-T, pays the nine-stage toll and
 * files it in **92 to 146 ticks** without ever looking at a substation, which is a fifth of the
 * reference's shift for a fifth of the objectives. The airlock draws from the grid now, so the
 * same program on the same seeds ends holding the chip in front of a door it has no power to move.
 */
describe('the form leg cannot be run without the grid', () => {
  const errand = 'file-form';

  test('deleting the grid from a program used to leave the form leg standing', () => {
    const level = withoutTheCoupling(levelOrThrow('w8-05'));
    for (const seed of level.seeds) {
      expect(metOn(level, seed, formErrandOnly), `seed ${String(seed)}`).toContain(errand);
    }
  });

  test('with the coupling it files nothing, on every seed', () => {
    const level = levelOrThrow('w8-05');
    for (const seed of level.seeds) {
      const result = runReference(level, seed, formErrandOnly);
      const form = result.verdict.objectives.find((entry) => entry.id === errand);
      expect(form?.met, `seed ${String(seed)}`).toBe(false);
      expect(machineById(result.world, 'airlock')?.state, `seed ${String(seed)}`).not.toBe('open');
      // The chip is in a hold rather than lost: the program did the errand and the door refused.
      expect(
        result.world.bots.some((bot) =>
          bot.inventory.some((stack) => stack.kind === 'chip' && stack.count > 0),
        ),
        `seed ${String(seed)}`,
      ).toBe(true);
    }
  });

  test('the failure names the door and the dark substation, not the chip', () => {
    const level = levelOrThrow('w8-05');
    const result = runReference(level, level.seeds[0] as number, formErrandOnly);
    const form = result.verdict.objectives.find((entry) => entry.id === errand);
    expect(form?.divergence?.where).toMatch(/^airlock at \(\d+, \d+\)$/);
    expect(form?.divergence?.received).toMatch(/^sub-\d+ is off; the gate took the ticks$/);
  });

  test('the door says which substation, and it is not one with nothing behind it', () => {
    const level = levelOrThrow('w8-05');
    for (const seed of level.seeds) {
      const world = level.build(seed);
      const airlock = machineById(world, 'airlock');
      const fed = Object.keys(airlock?.vars ?? {}).filter((name) => name.startsWith(FED_BY));
      expect(fed.length, `seed ${String(seed)}`).toBe(1);

      /* A feeder with no feeders of its own would be a form leg that depends on one switch
         instead of on the shift, which is the defect rather than the repair. */
      const feeder = machineById(world, (fed[0] as string).slice(FED_BY.length));
      expect(feeder, `seed ${String(seed)}`).toBeDefined();
      expect(feeder?.vars['deps'] ?? 0, `seed ${String(seed)}`).toBeGreaterThan(0);
    }
  });

  test('the reference still closes every seed, and leaves the door open behind it', () => {
    const level = levelOrThrow('w8-05');
    const solution = SOLUTIONS['w8-05'] as ReferenceSolution;
    for (const seed of level.seeds) {
      const result = runReference(level, seed, solution);
      expect(result.verdict.passed, `seed ${String(seed)}`).toBe(true);
      expect(result.ticks, `seed ${String(seed)}`).toBeLessThanOrEqual(level.par.ticks);
      expect(machineById(result.world, 'airlock')?.state, `seed ${String(seed)}`).toBe('open');
    }
  });
});
