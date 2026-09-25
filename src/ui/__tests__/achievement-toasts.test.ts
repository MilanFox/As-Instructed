import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { ACHIEVEMENTS } from '../../game/achievements.ts';
import { emptySave } from '../../game/save.ts';
import { useGame } from '../../game/store.ts';
import { achievementToasts, dismissToast, mountToasts } from '../toasts.ts';

const [first, second] = ACHIEVEMENTS as [
  (typeof ACHIEVEMENTS)[number],
  (typeof ACHIEVEMENTS)[number],
];

let detach: (() => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  useGame.setState({ save: emptySave(), freshAchievements: [] });
  detach = mountToasts();
});

afterEach(() => {
  detach?.();
  detach = null;
  vi.useRealTimers();
  useGame.setState({ save: emptySave(), freshAchievements: [] });
});

describe('the toast an earned achievement raises', () => {
  test('an award raises one toast carrying its title', () => {
    useGame.getState().award(first.id);

    expect(achievementToasts().map((toast) => toast.title)).toEqual([first.title]);
  });

  test('a run that grades several stacks one toast each', () => {
    useGame.setState({ freshAchievements: [first.id, second.id] });

    expect(achievementToasts().map((toast) => toast.id)).toEqual([first.id, second.id]);
  });

  test('an id already shown does not toast again', () => {
    useGame.setState({ freshAchievements: [first.id] });
    dismissToast(first.id);

    useGame.setState({ freshAchievements: [first.id, second.id] });
    useGame.setState({ freshAchievements: [] });
    useGame.setState({ freshAchievements: [first.id] });

    expect(achievementToasts().map((toast) => toast.id)).toEqual([second.id]);
  });

  test('a hidden achievement is marked hidden on its toast', () => {
    const secret = ACHIEVEMENTS.find((achievement) => achievement.hidden === true);
    useGame.setState({ freshAchievements: [first.id, secret?.id ?? ''] });

    expect(achievementToasts().map((toast) => toast.hidden)).toEqual([first.hidden === true, true]);
  });

  test('a toast leaves on its own after a few seconds', () => {
    useGame.getState().award(first.id);
    vi.advanceTimersByTime(4000);

    expect(achievementToasts()).toEqual([]);
  });

  test('a click dismisses it early', () => {
    useGame.getState().award(first.id);
    dismissToast(first.id);

    expect(achievementToasts()).toEqual([]);
  });
});
