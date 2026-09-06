import { describe, expect, test, vi } from 'vitest';
import type { ActEvent } from '../../engine/index.ts';
import { Terrain, machineById, tileAt } from '../../engine/index.ts';
import { FakeRunner } from '../../game/ports.ts';
import { emptySave } from '../../game/save.ts';
import { objectivesOnEverySeed } from '../../game/score.ts';
import { useGame } from '../../game/store.ts';
import { unlockedApiNames } from '../../runtime/ambient.ts';
import { aggregate } from '../../runtime/aggregate.ts';
import { runSeed } from '../../runtime/run-level.ts';
import type { LevelDef } from '../types.ts';
import { getLevel } from '../index.ts';

/**
 * The two defects docs/FIX-FINALE.md was opened for, pinned as tests.
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
