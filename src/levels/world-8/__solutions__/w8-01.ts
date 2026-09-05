import type { Sim, Vec } from '../../../engine/index.ts';
import { Dir, ItemKind } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * One free pass down the silo's own column, casting a ray across each row, gives every ripe tile
 * without walking the field. After that it is capacity-sized batches, nearest tile first, back to
 * the silo when the arms are full. Not optimal routing — deliberately, since the level is priced
 * against a full sweep and against the length of this program, not against the best tour.
 */
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
    while (ripe.length > 0) {
      const here = sim.pos(botId);
      ripe.sort((a, b) => gap(a, here) - gap(b, here));
      go(ripe.shift() as Vec);
      sim.harvest(botId);
      held++;
      if (held === sim.capacity(botId) || ripe.length === 0) {
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
    'const gap = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);',
    'const go = (t) => {',
    '  while (pos().x !== t.x) move(pos().x < t.x ? Dir.East : Dir.West);',
    '  while (pos().y !== t.y) move(pos().y < t.y ? Dir.South : Dir.North);',
    '};',
    'let cap = -1;',
    'for (let n = 0; ripe.length; ) {',
    '  const p = pos();',
    '  ripe.sort((a, b) => gap(a, p) - gap(b, p));',
    '  go(ripe[0]);',
    '  if (harvest()) { ripe.shift(); n++; } else cap = n;',
    '  if (n === cap || !ripe.length) { go(silo); drop("crop", n); n = 0; }',
    '}',
  ].join('\n'),
};
