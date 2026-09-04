import { describe, expect, test } from 'vitest';
import type { Sim, Vec } from '../../../engine/index.ts';
import { Dir, ItemKind, scoreChars } from '../../../engine/index.ts';
import { runLevel, runReference } from '../../harness.ts';
import { w8_01 } from '../w8-01.ts';
import { solution as w8_01Solution } from '../__solutions__/w8-01.ts';

function naiveSweep(sim: Sim, botId: number): void {
  const silo = sim.pos(botId);
  const cap = sim.capacity(botId);
  const go = (to: Vec): void => {
    while (sim.pos(botId).x !== to.x) {
      sim.move(botId, sim.pos(botId).x < to.x ? Dir.East : Dir.West);
    }
    while (sim.pos(botId).y !== to.y) {
      sim.move(botId, sim.pos(botId).y < to.y ? Dir.South : Dir.North);
    }
  };
  const rows: number[] = [];
  for (let i = 0; i < 10; i++) rows.push(silo.y === 0 ? i : 9 - i);
  const order: Vec[] = [];
  rows.forEach((y, i) => {
    const cols: number[] = [];
    for (let j = 0; j < 14; j++) cols.push(j);
    const leftFirst = silo.x === 0 ? i % 2 === 0 : i % 2 === 1;
    if (!leftFirst) cols.reverse();
    for (const x of cols) order.push({ x, y });
  });
  let held = 0;
  for (const at of order) {
    go(at);
    const here = sim.scan(botId);
    if (here.crop === null || here.growth < here.maxGrowth) continue;
    sim.harvest(botId);
    held++;
    if (held === cap) {
      go(silo);
      sim.drop(botId, ItemKind.Crop, held);
      held = 0;
      go(at);
    }
  }
  if (held > 0) {
    go(silo);
    sim.drop(botId, ItemKind.Crop, held);
  }
}

describe('w8-01 tuning', () => {
  test('reference and naive numbers', () => {
    console.log('w8-01 chars', scoreChars(w8_01Solution.source), 'par.chars', w8_01.par.chars);
    for (const seed of w8_01.seeds) {
      const ref = runReference(w8_01, seed, w8_01Solution);
      const naive = runLevel(w8_01, seed, naiveSweep, { source: '' });
      const bonus = w8_01.bonus?.[0];
      const met = bonus?.evaluate({
        world: ref.world,
        trace: ref.trace,
        initialWorld: ref.initialWorld,
      });
      console.log(
        `w8-01 seed ${seed}: ref ${ref.ticks} naive ${naive.ticks} par ${w8_01.par.ticks}` +
          ` refPass ${String(ref.verdict.passed)} naivePass ${String(naive.verdict.passed)}` +
          ` bonus ${String(met)} objs ${JSON.stringify(ref.verdict.objectives)}`,
      );
      expect(ref.verdict.failure).toBeUndefined();
      expect(ref.verdict.passed).toBe(true);
      expect(naive.verdict.passed).toBe(true);
    }
  });
});
