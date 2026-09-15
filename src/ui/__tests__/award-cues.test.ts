import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { ACHIEVEMENTS } from '../../game/achievements.ts';
import { emptySave } from '../../game/save.ts';
import { useGame } from '../../game/store.ts';
import { mountCues } from '../cues.ts';

const ids = ACHIEVEMENTS.map((achievement) => achievement.id);

let sounded: { index: number; after: number }[] = [];
let pulses = 0;
let detach: (() => void) | null = null;

function listen(): void {
  detach = mountCues({
    achievement: (index, after) => {
      sounded.push({ index, after });
    },
    pulse: () => {
      pulses++;
    },
  });
}

beforeEach(() => {
  sounded = [];
  pulses = 0;
  useGame.setState({ save: emptySave(), freshAchievements: [], showResults: false, tick: 0 });
  listen();
});

afterEach(() => {
  detach?.();
  detach = null;
  useGame.setState({ save: emptySave(), freshAchievements: [] });
});

describe('the cues an earned achievement fires', () => {
  test('an award sounds once and pulses the board once', () => {
    const id = ids[0] as string;
    useGame.getState().award(id);

    expect(useGame.getState().freshAchievements).toEqual([id]);
    expect(sounded).toEqual([{ index: 0, after: 0 }]);
    expect(pulses).toBe(1);
  });

  test('a run that awards nothing is silent', () => {
    useGame.setState({ tick: 12 });
    useGame.setState({ showResults: true });
    useGame.setState({ freshAchievements: [] });

    expect(sounded).toEqual([]);
    expect(pulses).toBe(0);
  });

  test('an award already held fires nothing the second time', () => {
    const id = ids[0] as string;
    useGame.getState().award(id);
    sounded = [];
    pulses = 0;

    useGame.getState().award(id);

    expect(sounded).toEqual([]);
    expect(pulses).toBe(0);
  });

  test('several landing together climb the ladder on separate beats', () => {
    useGame.setState({ freshAchievements: ids.slice(0, 3) });

    expect(sounded.map((cue) => cue.index)).toEqual([0, 1, 2]);
    expect(sounded.map((cue) => cue.after)).toEqual([0, 0.12, 0.24]);
    expect(new Set(sounded.map((cue) => cue.after)).size).toBe(sounded.length);
    expect(pulses).toBe(1);
  });

  test('a haul of them collapses to one ladder rather than a burst', () => {
    useGame.setState({ freshAchievements: ids.slice(0, 9) });

    expect(sounded.length).toBe(5);
    expect(sounded.map((cue) => cue.index)).toEqual([0, 1, 2, 3, 4]);
    expect(pulses).toBe(1);
  });

  test('one more arriving after the others sounds only itself', () => {
    const first = ids.slice(0, 2);
    useGame.setState({ freshAchievements: first });
    sounded = [];
    pulses = 0;

    useGame.setState({ freshAchievements: [...first, ids[2] as string] });

    expect(sounded).toEqual([{ index: 0, after: 0 }]);
    expect(pulses).toBe(1);
  });

  test('detaching stops the cues', () => {
    detach?.();
    detach = null;

    useGame.setState({ freshAchievements: ids.slice(0, 2) });

    expect(sounded).toEqual([]);
    expect(pulses).toBe(0);
  });
});
