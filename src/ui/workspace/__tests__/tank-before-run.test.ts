import { describe, expect, test, vi } from 'vitest';
import type * as ReactModule from 'react';
import { reactDriver as driver } from '../../__tests__/react-driver.ts';

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactModule>();
  return { ...actual, ...driver.hooks };
});

vi.mock('zustand', async () => {
  const { createStore } = await import('zustand/vanilla');
  const vanilla = createStore as unknown as (initialiser: unknown) => {
    subscribe: (notify: () => void) => () => void;
    getState: () => unknown;
  };
  const bind = (initialiser: unknown): unknown => {
    const api = vanilla(initialiser);
    const useBoundStore = (selector: (state: unknown) => unknown = (state) => state): unknown =>
      driver.hooks.useSyncExternalStore(api.subscribe, () => selector(api.getState()));
    return Object.assign(useBoundStore, api);
  };
  return {
    create: (initialiser?: unknown) => (initialiser ? bind(initialiser) : bind),
    createStore,
  };
});

const { useWorkspace } = await import('../useWorkspace.ts');
const { useGame } = await import('../../../game/store.ts');
const { emptyProgress, emptySave } = await import('../../../game/save.ts');
const { campaignOrder } = await import('../../../levels/index.ts');
const { usesFuel } = await import('../../../engine/index.ts');

type WorkspaceData = ReturnType<typeof useWorkspace>;
type LevelDef = ReturnType<typeof campaignOrder>[number];

function everythingOpen(): ReturnType<typeof emptySave> {
  const save = emptySave();
  for (const level of campaignOrder()) {
    save.levels[level.id] = { ...emptyProgress(), completed: true, seedsUnlocked: true };
  }
  return save;
}

function useWorkspaceNow(): WorkspaceData {
  driver.reset();
  return useWorkspace();
}

function tankOf(level: LevelDef, seed: number): number {
  const bot = level.build(seed).bots.find((candidate) => Number.isFinite(candidate.fuelMax));
  return bot?.fuelMax ?? 0;
}

const FUELLED = campaignOrder().filter((level) => usesFuel(level.build(level.seeds[0] ?? 1)));

const REDRAWN = FUELLED.find((level) => {
  const tanks = level.seeds.map((seed) => tankOf(level, seed));
  return new Set(tanks).size > 1;
});

describe('the tank reads before the first run', () => {
  test('there are levels with a tank to read, and one redraws it per seed', () => {
    expect(['fuelled', FUELLED.length > 0]).toEqual(['fuelled', true]);
    expect(['redrawn', REDRAWN !== undefined]).toEqual(['redrawn', true]);
  });

  for (const level of FUELLED) {
    test(`${level.id} opens on a full tank, with nothing run yet`, () => {
      useGame.setState({ save: everythingOpen() });
      useGame.getState().openLevel(level.id);
      const workspace = useWorkspaceNow();
      const tank = tankOf(level, level.seeds[0] ?? 1);

      expect([level.id, workspace.trace]).toEqual([level.id, null]);
      expect([level.id, workspace.fuel]).toEqual([level.id, { fuel: tank, max: tank }]);
    });
  }

  test('a level without a tank shows no reading at all', () => {
    const dry = campaignOrder().find((level) => !FUELLED.includes(level)) as LevelDef;
    useGame.setState({ save: everythingOpen() });
    useGame.getState().openLevel(dry.id);

    expect([dry.id, useWorkspaceNow().fuel]).toEqual([dry.id, null]);
  });
});

describe('the tank follows the order that is open, not the one before it', () => {
  test('arriving from a level with no tank still reads the new one', () => {
    const dry = campaignOrder().find((level) => !FUELLED.includes(level)) as LevelDef;
    const wet = FUELLED[0] as LevelDef;
    useGame.setState({ save: everythingOpen() });

    useGame.getState().openLevel(dry.id);
    expect(['on the dry order', useWorkspaceNow().fuel]).toEqual(['on the dry order', null]);

    useGame.getState().openLevel(wet.id);
    const tank = tankOf(wet, wet.seeds[0] ?? 1);

    expect([wet.id, useWorkspaceNow().fuel]).toEqual([wet.id, { fuel: tank, max: tank }]);
  });
});

describe('the tank reads off the seed the board was built from', () => {
  const level = REDRAWN as LevelDef;

  for (const seed of level.seeds) {
    test(`${level.id} seed ${String(seed)} reads its own tank`, () => {
      useGame.setState({ save: everythingOpen() });
      useGame.getState().openLevel(level.id);
      useGame.getState().showSeed(seed);
      const tank = tankOf(level, seed);

      expect([seed, useWorkspaceNow().fuel]).toEqual([seed, { fuel: tank, max: tank }]);
    });
  }

  test('the seeds do not all hold the same tank, so the reading had to follow one', () => {
    const tanks = level.seeds.map((seed) => tankOf(level, seed));

    expect(['distinct tanks', new Set(tanks).size > 1]).toEqual(['distinct tanks', true]);
  });
});
