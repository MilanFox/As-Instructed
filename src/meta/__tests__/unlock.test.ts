import { beforeEach, describe, expect, test } from 'vitest';
import { campaignOrder } from '../../levels/index.ts';
import { emptyLibrary } from '../save.ts';
import { useLibrary } from '../store.ts';
import type { MetaHost } from '../store.ts';
import {
  LIBRARY_FIRST_WORLD,
  LIBRARY_REQUIREMENTS,
  LIBRARY_UNLOCK_LEVEL,
  isDeliveryNoteOwed,
  isLibraryUnlocked,
  nextRequirementAfter,
  requirementLevelCount,
} from '../unlock.ts';

/**
 * The unlock moved from the close of World 3 to the close of World 2, so two things need holding
 * down: where it fires in the play order, and that no save written under the old timing either
 * loses its Repository or is made to sit through a delivery note it already read.
 */

const ORDER = campaignOrder().map((level) => level.id);

function completedThrough(levelId: string): { levelId: string; world: number }[] {
  const order = campaignOrder();
  const stop = order.findIndex((level) => level.id === levelId);
  return order.slice(0, stop + 1).map((level) => ({ levelId: level.id, world: level.world }));
}

function host(completed: { levelId: string; world: number }[]): MetaHost {
  return {
    runner: { run: () => Promise.reject(new Error('not used')) },
    targets: () => [],
    facts: () => [],
    completed: () => completed,
    applyMedals: () => undefined,
    setLevelCode: () => undefined,
    openLevel: () => undefined,
  };
}

describe('where the unlock fires in the campaign', () => {
  test('it is the last work order of World 2', () => {
    const order = campaignOrder();
    const unlock = order.find((level) => level.id === LIBRARY_UNLOCK_LEVEL);
    expect(unlock, LIBRARY_UNLOCK_LEVEL).toBeDefined();
    expect(unlock?.world).toBe(2);

    const world2 = order.filter((level) => level.world === 2);
    expect(world2[world2.length - 1]?.id).toBe(LIBRARY_UNLOCK_LEVEL);
  });

  test('the whole on-ramp before it stays a one-file game', () => {
    const before = ORDER.slice(0, ORDER.indexOf(LIBRARY_UNLOCK_LEVEL));
    for (const levelId of before) {
      expect(isLibraryUnlocked(completedThrough(levelId)), levelId).toBe(false);
    }
    expect(before.length).toBeGreaterThan(0);
  });

  test('it is unlocked from that work order on, and never re-locks', () => {
    const from = ORDER.indexOf(LIBRARY_UNLOCK_LEVEL);
    for (const levelId of ORDER.slice(from)) {
      expect(isLibraryUnlocked(completedThrough(levelId)), levelId).toBe(true);
    }
  });

  test('it arrives before the first work order that names a subroutine', () => {
    const first = Object.keys(LIBRARY_REQUIREMENTS)
      .map((levelId) => ORDER.indexOf(levelId))
      .sort((a, b) => a - b)[0];
    expect(first).toBeGreaterThan(ORDER.indexOf(LIBRARY_UNLOCK_LEVEL));
  });

  test('every work order that names a subroutine is in LIBRARY_FIRST_WORLD or later', () => {
    for (const levelId of Object.keys(LIBRARY_REQUIREMENTS)) {
      const level = campaignOrder().find((each) => each.id === levelId);
      expect(level?.world, levelId).toBeGreaterThanOrEqual(LIBRARY_FIRST_WORLD);
    }
  });
});

describe('the reason the delivery note gives for itself', () => {
  test('it names the next work order that will ask, from wherever the player stands', () => {
    const next = nextRequirementAfter(ORDER, 'w3-01');
    expect(next?.levelId).toBe('w4-05');
    expect(next?.requirements.map((each) => each.name)).toContain('pathTo');
  });

  test('a work order that names one answers with itself', () => {
    expect(nextRequirementAfter(ORDER, 'w4-05')?.levelId).toBe('w4-05');
  });

  test('past the last one it answers with nothing rather than wrapping', () => {
    expect(nextRequirementAfter(['w8-05', 'zz-99'], 'zz-99')).toBeNull();
  });

  test('an unknown or absent level falls back to the first requirement in the campaign', () => {
    expect(nextRequirementAfter(ORDER, null)?.levelId).toBe('w4-05');
    expect(nextRequirementAfter(ORDER, 'nope')?.levelId).toBe('w4-05');
  });

  test('the count it states is the number of work orders that name something', () => {
    expect(requirementLevelCount()).toBe(Object.keys(LIBRARY_REQUIREMENTS).length);
  });
});

describe('saves written under the old World 3 unlock', () => {
  beforeEach(() => {
    useLibrary.getState().hydrate(null);
  });

  test('a save that passed the old unlock level keeps its Repository', () => {
    expect(isLibraryUnlocked(completedThrough('w3-04'))).toBe(true);
  });

  test('a save already flagged unlocked is never re-locked by refreshUnlock', () => {
    useLibrary.getState().attach(host([]));
    useLibrary.setState({ save: { ...emptyLibrary(), unlocked: true, briefed: true } });
    useLibrary.getState().refreshUnlock();
    expect(useLibrary.getState().save.unlocked).toBe(true);
  });

  test('a save that read the memo does not sit through the delivery note again', () => {
    useLibrary.getState().attach(host(completedThrough('w4-01')));
    useLibrary.setState({ save: { ...emptyLibrary(), unlocked: true, briefed: true } });
    useLibrary.getState().refreshUnlock();
    const save = useLibrary.getState().save;
    expect(isDeliveryNoteOwed(save)).toBe(false);
  });

  test('a save that never opened the panel is still owed the delivery note', () => {
    useLibrary.getState().attach(host(completedThrough('w4-01')));
    useLibrary.setState({ save: { ...emptyLibrary(), unlocked: true, briefed: false } });
    useLibrary.getState().refreshUnlock();
    const save = useLibrary.getState().save;
    expect(isDeliveryNoteOwed(save)).toBe(true);
  });

  test('a save left mid-World-3 is provisioned rather than left locked', () => {
    useLibrary.getState().attach(host(completedThrough('w3-01')));
    useLibrary.setState({ save: emptyLibrary() });
    useLibrary.getState().refreshUnlock();
    expect(useLibrary.getState().save.unlocked).toBe(true);
  });

  test('a save still inside the on-ramp is left locked', () => {
    useLibrary.getState().attach(host(completedThrough('w2-04')));
    useLibrary.setState({ save: emptyLibrary() });
    useLibrary.getState().refreshUnlock();
    expect(useLibrary.getState().save.unlocked).toBe(false);
  });
});

describe('publishing is not offered before the delivery note', () => {
  beforeEach(() => {
    useLibrary.getState().hydrate(null);
    useLibrary.getState().attach(host(completedThrough('w3-01')));
  });

  const code = 'export function sweep(): void {}\n';

  test('an unlocked but unbriefed save gets no publish offer', () => {
    useLibrary.setState({ save: { ...emptyLibrary(), unlocked: true, briefed: false } });
    useLibrary.getState().offerPublish('w3-01', code, []);
    expect(useLibrary.getState().offer).toBeNull();
  });

  test('once briefed, the offer fires as before', () => {
    useLibrary.setState({ save: { ...emptyLibrary(), unlocked: true, briefed: true } });
    useLibrary.getState().offerPublish('w3-01', code, []);
    expect(useLibrary.getState().offer?.levelId).toBe('w3-01');
  });
});
