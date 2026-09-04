import { test } from 'vitest';
import type { ItemKind, Sim, Vec } from '../../../engine/index.ts';
import { Dir, evaluateObjectives } from '../../../engine/index.ts';
import { runLevel, runReference } from '../../harness.ts';
import { WORLD_3_LEVELS, w3_03, w3_04, w3_05 } from '../index.ts';
import { goTo, key, nearestIndex, surveyYard } from '../__solutions__/driver.ts';
import { solution as s1 } from '../__solutions__/w3-01.ts';
import { solution as s2 } from '../__solutions__/w3-02.ts';
import { solution as s3 } from '../__solutions__/w3-03.ts';
import { solution as s4 } from '../__solutions__/w3-04.ts';
import { solution as s5 } from '../__solutions__/w3-05.ts';

const ALL = [s1, s2, s3, s4, s5];

function survey(sim: Sim, botId: number) {
  const crates: { at: Vec; kind: ItemKind }[] = [];
  const depots = new Map<string, Vec>();
  const pads: Vec[] = [];
  const seen = new Set<string>();
  surveyYard(sim, botId, (tile) => {
    if (!tile.inBounds || seen.has(key(tile.at))) return;
    seen.add(key(tile.at));
    if (tile.terrain === 'pad') pads.push(tile.at);
    if (tile.mark) depots.set(tile.mark, tile.at);
    for (const stack of tile.items) {
      for (let i = 0; i < stack.count; i++) crates.push({ at: tile.at, kind: stack.kind });
    }
  });
  return { crates, depots, pads };
}

test('margins', () => {
  for (const level of WORLD_3_LEVELS) {
    const sol = ALL.find((s) => s.levelId === level.id)!;
    const rows = level.seeds.map((seed) => {
      const r = runReference(level, seed, sol);
      const bonus = evaluateObjectives(level.bonus ?? [], r).every((o) => o.met);
      return `${seed}:${r.ticks}${bonus ? '*' : ''}`;
    });
    console.log(level.id, 'par', level.par.ticks, rows.join(' '));
  }

  const naive05 = (sim: Sim, botId: number): void => {
    const f = survey(sim, botId);
    for (const c of f.crates) {
      const d = f.depots.get(c.kind);
      if (!d) continue;
      goTo(sim, botId, c.at);
      sim.pickup(botId, c.kind, 1);
      goTo(sim, botId, d);
      sim.drop(botId, c.kind, 1);
    }
  };
  console.log('w3-05 one-at-a-time', w3_05.seeds.map((s) => runLevel(w3_05, s, naive05).ticks).join(','), 'par', w3_05.par.ticks);

  const greedy04 = (sim: Sim, botId: number): void => {
    const f = survey(sim, botId);
    const bay = f.pads[0]!;
    const left = f.crates.map((c) => c.at);
    while (left.length > 0) {
      const i = nearestIndex(sim.pos(botId), left);
      const at = left.splice(i, 1)[0]!;
      goTo(sim, botId, at);
      sim.pickup(botId, 'crate', 1);
      goTo(sim, botId, bay);
      sim.drop(botId, 'crate', 1);
    }
  };
  console.log('w3-04 greedy order-met', w3_04.seeds.map((s) => {
    const v = runLevel(w3_04, s, greedy04).verdict;
    return `${s}:${v.objectives.find((o) => o.id === 'bay-in-order')?.met}`;
  }).join(' '));

  const sweep03 = (sim: Sim, botId: number): void => {
    while (sim.canMove(botId, Dir.West)) sim.move(botId, Dir.West);
    while (sim.canMove(botId, Dir.North)) sim.move(botId, Dir.North);
    let along: Dir = Dir.East;
    for (;;) {
      while (sim.canMove(botId, along)) sim.move(botId, along);
      if (!sim.canMove(botId, Dir.South)) break;
      sim.move(botId, Dir.South);
      along = along === Dir.East ? Dir.West : Dir.East;
    }
  };
  console.log('w3-03 full sweep', w3_03.seeds.map((s) => runLevel(w3_03, s, sweep03).ticks).join(','), 'par', w3_03.par.ticks);
});
