import { describe, expect, test } from 'vitest';
import type { Sim } from '../../../engine/index.ts';
import { runLevel } from '../../harness.ts';
import type { LevelDef } from '../../types.ts';
import { playerApi } from '../__solutions__/_api.ts';
import { queued } from '../signal.ts';
import { w6_01 } from '../w6-01.ts';
import { w6_02 } from '../w6-02.ts';
import { w6_03 } from '../w6-03.ts';
import { w6_04 } from '../w6-04.ts';
import { w6_05 } from '../w6-05.ts';

const LEVELS: LevelDef[] = [w6_01, w6_02, w6_03, w6_04, w6_05];

function countThenDrain(level: LevelDef, seed: number): { counted: number[]; drained: number } {
  const counted: number[] = [];
  let drained = 0;

  runLevel(level, seed, (sim: Sim, botId: number) => {
    const { buffered, receive } = playerApi(sim, botId, level.id);
    counted.push(buffered(), buffered(), buffered());
    for (let packet = receive(); packet !== null; packet = receive()) drained++;
    counted.push(buffered());
  });

  return { counted, drained };
}

describe('the band can be counted before it is read', () => {
  for (const level of LEVELS) {
    const seed = level.seeds[0] as number;

    test(`${level.id} reports the depth of the band without consuming any of it`, () => {
      const waiting = queued(level.build(seed)).length;
      const { counted, drained } = countThenDrain(level, seed);

      expect(counted.slice(0, 3), 'three reads, one answer').toEqual([waiting, waiting, waiting]);
      expect(drained, 'the count predicted the drain').toBe(waiting);
      expect(counted[3], 'a drained band reads 0').toBe(0);
    });

    test(`${level.id} decides "the buffer is empty" without spending a packet`, () => {
      let sawEmpty = false;
      let taken = 0;

      runLevel(level, seed, (sim: Sim, botId: number) => {
        const { buffered, receive } = playerApi(sim, botId, level.id);
        while (buffered() > 0) {
          receive();
          taken++;
        }
        sawEmpty = buffered() === 0;
      });

      expect(sawEmpty).toBe(true);
      expect(taken, 'the loop took exactly the packets that were there').toBe(
        queued(level.build(seed)).length,
      );
    });
  }
});

test('w6-01 seed 3 reads as empty before anything is received', () => {
  let firstAnswer = -1;

  runLevel(w6_01, 3, (sim: Sim, botId: number) => {
    const { buffered } = playerApi(sim, botId, 'w6-01');
    firstAnswer = buffered();
  });

  expect(queued(w6_01.build(3))).toEqual([]);
  expect(firstAnswer).toBe(0);
});
