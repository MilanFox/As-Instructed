import { describe, expect, test, vi } from 'vitest';
import type { ActEvent, World } from '../../engine/index.ts';
import { FED_BY, Terrain, machineById, tileAt } from '../../engine/index.ts';
import { FakeRunner } from '../../game/ports.ts';
import { emptyProgress, emptySave } from '../../game/save.ts';
import { objectivesOnEverySeed } from '../../game/score.ts';
import { useGame } from '../../game/store.ts';
import { unlockedApiNames } from '../../runtime/ambient.ts';
import { aggregate } from '../../runtime/aggregate.ts';
import { runSeed } from '../../runtime/run-level.ts';
import type { LevelDef, ReferenceSolution } from '../types.ts';
import { campaignOrder, getLevel } from '../index.ts';
import { runReference } from '../harness.ts';
import { SOLUTIONS } from './solutions.ts';
import { formErrandOnly } from './naive.ts';

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
    const opened = emptySave();
    for (const level of campaignOrder()) {
      if (level.world === 7) opened.levels[level.id] = { ...emptyProgress(), completed: true };
    }
    useGame.setState({ save: opened });
    useGame.getState().attachRunner(new FakeRunner({ latencyMs: 0 }));
    useGame.getState().openLevel('w8-05');
    useGame.getState().setCode(IDLE);
    useGame.getState().run();
    await vi.waitFor(() => expect(useGame.getState().runState).toBe('idle'));

    const progress = useGame.getState().save.levels['w8-05'];
    expect(progress?.completed).toBe(false);
    expect(progress?.objectives?.length ?? 0).toBeGreaterThan(0);
    expect(progress?.objectives).not.toContain('quota');
    useGame.setState({ save: emptySave() });
  });

  test('the three seeds kept are the three the level is authored against', () => {
    expect(levelOrThrow('w8-05').seeds).toEqual([1, 4, 7]);
  });
});

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
    expect(form?.divergence?.received).toMatch(/^sub-\d+ is off; turns did nothing$/);
  });

  test('the door says which substation, and it is not one with nothing behind it', () => {
    const level = levelOrThrow('w8-05');
    for (const seed of level.seeds) {
      const world = level.build(seed);
      const airlock = machineById(world, 'airlock');
      const fed = Object.keys(airlock?.vars ?? {}).filter((name) => name.startsWith(FED_BY));
      expect(fed.length, `seed ${String(seed)}`).toBe(1);

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
