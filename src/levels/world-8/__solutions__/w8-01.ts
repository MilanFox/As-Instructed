import type { Sim, Vec } from '../../../engine/index.ts';
import { Dir, ItemKind } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

export const solution: ReferenceSolution = {
  levelId: 'w8-01',
  run(sim: Sim, botId: number): void {
    const silo = sim.probe(botId, 'silo')?.at ?? sim.pos(botId);
    const across = sim.pos(botId).x === 0 ? Dir.East : Dir.West;
    const along = sim.pos(botId).y === 0 ? Dir.South : Dir.North;
    const ripe: Vec[] = [];
    do {
      for (const v of sim.look(botId, across, 14)) {
        if (v.crop !== null && v.growth >= v.maxGrowth) ripe.push(v.at);
      }
    } while (sim.canMove(botId, along) && sim.move(botId, along));

    const perRow = new Map<number, number>();
    for (const at of ripe) perRow.set(at.y, (perRow.get(at.y) ?? 0) + 1);
    let bestRow = 0;
    let bestCount = -1;
    for (const [y, held] of perRow) {
      if (held <= bestCount) continue;
      bestCount = held;
      bestRow = y;
    }
    sim.print(botId, `row ${String(bestRow)} ${String(bestCount)}`);

    const gap = (a: Vec, b: Vec): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const go = (to: Vec): void => {
      while (sim.pos(botId).x !== to.x) {
        sim.move(botId, sim.pos(botId).x < to.x ? Dir.East : Dir.West);
      }
      while (sim.pos(botId).y !== to.y) {
        sim.move(botId, sim.pos(botId).y < to.y ? Dir.South : Dir.North);
      }
    };

    let held = 0;
    let arms = -1;
    while (ripe.length > 0) {
      const here = sim.pos(botId);
      ripe.sort((a, b) => gap(a, here) - gap(b, here));
      go(ripe[0] as Vec);
      if (sim.harvest(botId) === null) arms = held;
      else {
        ripe.shift();
        held++;
      }
      if (held === arms || ripe.length === 0) {
        go(silo);
        sim.drop(botId, ItemKind.Crop, held);
        held = 0;
      }
    }
  },
  source: [
    'const silo = probe("silo").at;',
    'const across = pos().x === 0 ? Dir.East : Dir.West;',
    'const along = pos().y === 0 ? Dir.South : Dir.North;',
    'const ripe = [];',
    'do {',
    '  for (const v of look(across, 14)) if (v.crop && v.growth >= v.maxGrowth) ripe.push(v.at);',
    '} while (canMove(along) && move(along));',
    'const perRow = new Map();',
    'for (const t of ripe) perRow.set(t.y, (perRow.get(t.y) || 0) + 1);',
    'let bestRow = 0, bestCount = -1;',
    'for (const [y, held] of perRow) if (held > bestCount) { bestCount = held; bestRow = y; }',
    'print(`row ${bestRow} ${bestCount}`);',
    'const gap = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);',
    'const go = (t) => {',
    '  while (pos().x !== t.x) move(pos().x < t.x ? Dir.East : Dir.West);',
    '  while (pos().y !== t.y) move(pos().y < t.y ? Dir.South : Dir.North);',
    '};',
    'let arms = -1;',
    'for (let n = 0; ripe.length; ) {',
    '  const p = pos();',
    '  ripe.sort((a, b) => gap(a, p) - gap(b, p));',
    '  go(ripe[0]);',
    '  if (harvest()) { ripe.shift(); n++; } else arms = n;',
    '  if (n === arms || !ripe.length) { go(silo); drop("crop", n); n = 0; }',
    '}',
  ].join('\n'),
};
