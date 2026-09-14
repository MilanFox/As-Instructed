import { describe, expect, test } from 'vitest';
import type { Objective, Sim, Vec } from '../../../engine/index.ts';
import { DIVERGENCE_VALUE_CHARS, Dir, manhattan } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel } from '../../harness.ts';
import type { LevelDef } from '../../types.ts';
import { WORLD_1_LEVELS } from '../index.ts';
import { PAD, w1_01 } from '../w1-01.ts';
import { w1_02 } from '../w1-02.ts';
import { w1_03 } from '../w1-03.ts';
import { at, padPosition, walkableTiles } from '../shared.ts';

function diverge(
  level: LevelDef,
  seed: number,
  id: string,
  drive: (sim: Sim, bot: number) => void,
) {
  const result = runLevel(level, seed, drive);
  const pool: Objective[] = [...level.objectives, ...(level.bonus ?? [])];
  const objective = must(
    pool.find((each) => each.id === id),
    id,
  );
  const ctx = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  return { met: objective.evaluate(ctx), divergence: objective.divergence?.(ctx), result };
}

const padOf = (level: LevelDef, seed: number): Vec => must(padPosition(level.build(seed)), 'a pad');

describe('w1-01 and w1-02 name the pad and where the bot actually stopped', () => {
  test('a route that stops at the pillar is told both coordinates', () => {
    const { met, divergence } = diverge(w1_01, 1, 'reach-pad', (sim, botId) => {
      for (let step = 0; step < 10; step++) sim.move(botId, Dir.East);
    });

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'end of run',
      expected: at(PAD),
      received: at({ x: 2, y: 2 }),
    });
  });

  test('w1-02 names the pad this seed drew, and the seeds disagree', () => {
    const named = w1_02.seeds.map((seed) => {
      const { met, divergence } = diverge(w1_02, seed, 'reach-pad', (sim, botId) => {
        for (let step = 0; step < 5; step++) sim.move(botId, Dir.East);
      });
      expect(met).toBe(false);
      const shown = must(divergence, 'a divergence');
      expect(shown).toEqual({
        where: 'end of run',
        expected: at(padOf(w1_02, seed)),
        received: at({ x: 6, y: 1 }),
      });
      return shown.expected;
    });

    expect(new Set(named).size).toBeGreaterThan(1);
  });
});

describe('w1-02 says which half of the ration ran out', () => {
  test('asking before every tile is told how many readings it spent', () => {
    const { met, divergence } = diverge(w1_02, 1, 'within-7-canMove', (sim, botId) => {
      while (sim.canMove(botId, Dir.East)) sim.move(botId, Dir.East);
    });

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'canMove()',
      expected: 'at most 7 readings',
      received: '19 readings',
    });
  });

  test('driving blind past the pad is told the ticks it wasted, not the readings it saved', () => {
    const overshoot = 29;
    const { met, divergence } = diverge(w1_02, 1, 'within-7-canMove', (sim, botId) => {
      for (let step = 0; step < overshoot; step++) sim.move(botId, Dir.East);
    });

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: 'ticks beyond the shortest route',
      expected: 'at most 5',
      received: String(overshoot - manhattan({ x: 1, y: 1 }, padOf(w1_02, 1))),
    });
  });
});

describe('w1-03 names a tile rather than a shortfall', () => {
  test('inspect-all names the first floor tile the run never entered', () => {
    const { met, divergence } = diverge(w1_03, 21, 'inspect-all', () => undefined);

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: at({ x: 2, y: 1 }),
      expected: 'entered at least once',
      received: 'never entered',
    });
  });

  test('one-move-per-tile names the tick and tile the allowance ran out on', () => {
    const filed = 200;
    const allowed = walkableTiles(w1_03.build(21)).length;
    const { met, divergence } = diverge(w1_03, 21, 'one-move-per-tile', (sim, botId) => {
      for (let step = 0; step < filed; step++) {
        sim.move(botId, step % 2 === 0 ? Dir.East : Dir.West);
      }
    });

    expect(met).toBe(false);
    expect(divergence).toEqual({
      where: `tick ${String(allowed)} · ${at({ x: (allowed + 1) % 2 === 1 ? 1 : 2, y: 1 })}`,
      expected: `${String(allowed)} moves, one per floor tile`,
      received: `move ${String(allowed + 1)} of ${String(filed)}`,
    });
  });
});

describe('no objective in World 1 answers a miss with silence', () => {
  for (const level of WORLD_1_LEVELS) {
    for (const seed of level.seeds) {
      test(`${level.id} names a point on seed ${String(seed)}`, () => {
        const result = runLevel(level, seed, () => undefined);
        const ctx = {
          world: result.world,
          trace: result.trace,
          initialWorld: result.initialWorld,
          ops: result.ops,
        };
        const pool: Objective[] = [...level.objectives, ...(level.bonus ?? [])];
        for (const objective of pool) {
          if (objective.evaluate(ctx) || objective.binary === true) continue;
          const shown = must(objective.divergence?.(ctx), `${level.id}/${objective.id}`);
          for (const value of [shown.where, shown.expected, shown.received]) {
            expect(value, `${level.id}/${objective.id}`).not.toBe('');
            expect(value.length, `${level.id}/${objective.id}: ${value}`) //
              .toBeLessThanOrEqual(DIVERGENCE_VALUE_CHARS);
          }
        }
      });
    }
  }
});
