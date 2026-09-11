import type { Dir, Sim } from '../../../engine/index.ts';
import { ALL_DIRS, Terrain, opposite } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

const RANGE = 8;

export const solution: ReferenceSolution = {
  levelId: 'w4-01',
  run(sim: Sim, botId: number): void {
    let back: Dir | null = null;
    while (sim.scan(botId).terrain !== Terrain.Pad) {
      let heading: Dir | null = null;
      let stretch = 0;
      for (const dir of ALL_DIRS) {
        if (dir === back) continue;
        let open = 0;
        for (const view of sim.look(botId, dir, RANGE)) {
          if (!view.walkable) break;
          open++;
          if (view.terrain === Terrain.Pad) break;
        }
        if (open > 0) {
          heading = dir;
          stretch = open;
          break;
        }
      }
      if (heading === null) return;
      for (let i = 0; i < stretch; i++) sim.move(botId, heading);
      back = opposite(heading);
    }
  },
  source: [
    'let back = -1;',
    'while (scan().terrain !== Terrain.Pad) {',
    '  const dirs = [Dir.North, Dir.East, Dir.South, Dir.West];',
    '  let heading = -1;',
    '  let stretch = 0;',
    '  for (const d of dirs) {',
    '    if (d === back) continue;',
    '    let open = 0;',
    '    for (const view of look(d, 8)) {',
    '      if (!view.walkable) break;',
    '      open++;',
    '      if (view.terrain === Terrain.Pad) break;',
    '    }',
    '    if (open > 0) { heading = d; stretch = open; break; }',
    '  }',
    '  if (heading < 0) break;',
    '  for (let i = 0; i < stretch; i++) move(heading);',
    '  back = (heading + 2) % 4;',
    '}',
  ].join('\n'),
};
