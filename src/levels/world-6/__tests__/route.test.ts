import { describe, expect, test } from 'vitest';
import type { Sim } from '../../../engine/index.ts';
import { Dir, Terrain, evaluateObjectives } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel } from '../../harness.ts';
import type { LevelDef } from '../../types.ts';
import { playerApi } from '../__solutions__/_api.ts';
import { KEYSPACE, additive, charCodes, decipher, queued, weighted } from '../signal.ts';
import { w6_03 } from '../w6-03.ts';
import { w6_04 } from '../w6-04.ts';
import { telemetryFor, w6_05 } from '../w6-05.ts';

const HEADINGS: readonly Dir[] = [Dir.North, Dir.East, Dir.South, Dir.West];

const reverse = (dir: Dir): Dir => must(HEADINGS[(dir + 2) % 4], 'a heading');

function explorer(level: LevelDef) {
  return (sim: Sim, botId: number): void => {
    const { scan, move, pos } = playerApi(sim, botId, level.id);
    const visited = new Set<string>();
    const here = (): string => `${String(pos().x)},${String(pos().y)}`;
    const search = (): boolean => {
      visited.add(here());
      if (scan().terrain === Terrain.Pad) return true;
      for (const dir of HEADINGS) {
        const ahead = scan(dir);
        if (!ahead.walkable || ahead.lethal) continue;
        const from = pos();
        move(dir);
        if (visited.has(here())) {
          move(reverse(dir));
          continue;
        }
        if (search()) return true;
        if (pos().x !== from.x || pos().y !== from.y) move(reverse(dir));
      }
      return false;
    };
    search();
  };
}

describe('the route has to come off the band, not off the board', () => {
  for (const level of [w6_03, w6_05]) {
    test(`${level.id}: a pad-seeking search that never reads a packet reaches the pad and fails the drive`, () => {
      for (const seed of level.seeds) {
        const result = runLevel(level, seed, explorer(level));
        const reports = evaluateObjectives(level.objectives, {
          world: result.world,
          initialWorld: result.initialWorld,
          trace: result.trace,
          ops: result.ops,
        });
        const met = (id: string): boolean =>
          must(
            reports.find((report) => report.id === id),
            id,
          ).met;
        expect(met('reach-pad'), `seed ${String(seed)}`).toBe(true);
        expect(met('drive-the-route'), `seed ${String(seed)}`).toBe(false);
        expect(result.verdict.passed, `seed ${String(seed)}`).toBe(false);
      }
    });
  }
});

function verifies(text: string, salt: number): boolean {
  const star = text.lastIndexOf('*');
  if (star < 0) return false;
  const claimed = text
    .slice(star + 1)
    .split(',')
    .map(Number);
  const codes = charCodes(text.slice(0, star));
  return additive(codes, salt) === claimed[0] && weighted(codes, salt) === claimed[1];
}

describe('w6-05 sorts every block by its checks alone', () => {
  test('an intact block verifies under exactly one shift, a corrupt one under none, on every seed', () => {
    for (const seed of w6_05.seeds) {
      const plan = telemetryFor(seed);
      let shifted = 0;
      for (const packet of plan.packets) {
        const keys: number[] = [];
        for (let key = 0; key < KEYSPACE; key++) {
          if (verifies(decipher(packet.text, key), plan.salt)) keys.push(key);
        }
        if (packet.corrupt) {
          expect(keys, `seed ${String(seed)}`).toEqual([]);
          continue;
        }
        expect(keys.length, `seed ${String(seed)}`).toBe(1);
        expect(decipher(packet.text, must(keys[0], 'a key')), `seed ${String(seed)}`).toBe(
          packet.plain,
        );
        if (keys[0] !== 0) shifted++;
      }
      expect(shifted, `seed ${String(seed)}`).toBe(1);
      expect(plan.packets.filter((packet) => packet.corrupt).length, `seed ${String(seed)}`).toBe(
        3,
      );
    }
  });
});

describe('w6-04 has one straggler reading in its stated alphabet', () => {
  test('exactly one shift turns the straggler into lowercase letters, digits, spaces and commas', () => {
    for (const seed of w6_04.seeds) {
      const band = queued(w6_04.build(seed));
      const straggler = must(band[band.length - 1], 'the straggler');
      const readable: number[] = [];
      for (let key = 0; key < KEYSPACE; key++) {
        if (/^[a-z0-9 ,]+$/.test(decipher(straggler, key))) readable.push(key);
      }
      expect(readable.length, `seed ${String(seed)}`).toBe(1);
    }
  });
});
