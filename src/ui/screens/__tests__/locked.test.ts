import { describe, expect, it } from 'vitest';
import { emptyProgress, emptySave } from '../../../game/save.ts';
import type { SaveFile } from '../../../game/save.ts';
import { campaignOrder } from '../../../levels/index.ts';
import { blockedHeading, blockedLines } from '../LockedLevel.tsx';

const order = campaignOrder();
const FIRST = order[0]?.id ?? '';
const SECOND = order[1]?.id ?? '';
const WORLD_TWO = order.find((level) => level.world === 2)?.id ?? '';

function closing(...ids: string[]): SaveFile {
  const save = emptySave();
  for (const id of ids) save.levels[id] = { ...emptyProgress(), completed: true };
  return save;
}

describe('a work order the save has not opened', () => {
  it('says so, and names the close that opens it', () => {
    const lines = blockedLines(emptySave(), { levelId: SECOND, reason: 'locked' });
    expect(lines[0]).toBe(`Level ${SECOND} is on hold.`);
    expect(lines[1]).toBe(`Finish ${FIRST} to open it.`);
  });

  it('names the other way in, where a world stands between the player and it', () => {
    const lines = blockedLines(emptySave(), { levelId: WORLD_TWO, reason: 'locked' });
    const outstanding = order.filter((level) => level.world === 1).length;
    expect(lines.at(-1)).toBe(`Or finish all ${String(outstanding)} open levels in Site 1.`);
  });

  it('counts down as the world it waits on is closed', () => {
    const held = order.filter((level) => level.world === 3).at(-1)?.id ?? '';
    const worldTwo = order.filter((level) => level.world === 2).map((level) => level.id);
    const save = closing(...worldTwo.slice(0, -1));
    const lines = blockedLines(save, { levelId: held, reason: 'locked' });
    expect(lines.at(-1)).toBe('Or finish the last open level in Site 2.');
  });

  it('offers no second route out of the first world', () => {
    const lines = blockedLines(emptySave(), { levelId: SECOND, reason: 'locked' });
    expect(lines).toHaveLength(2);
  });

  it('is headed as held, not as missing', () => {
    expect(blockedHeading({ levelId: SECOND, reason: 'locked' })).toBe(
      `LEVEL ${SECOND.toUpperCase()} — ON HOLD`,
    );
  });
});

describe('a work order the campaign never issued', () => {
  it('reads as absent rather than as held', () => {
    const blocked = { levelId: 'w9-99', reason: 'unknown' } as const;
    expect(blockedHeading(blocked)).toBe('NO LEVEL W9-99');
    expect(blockedLines(emptySave(), blocked)[0]).toBe('There is no level w9-99.');
    expect(blockedLines(emptySave(), blocked).join(' ')).not.toContain('opens');
  });
});

describe('the explanation never outlives the rule it states', () => {
  it('drops to the bare line once the save has opened the order', () => {
    const lines = blockedLines(closing(FIRST), { levelId: SECOND, reason: 'locked' });
    expect(lines).toEqual([`Level ${SECOND} is on hold.`]);
  });
});
