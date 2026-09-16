import type { Dir, Sim } from '../../../engine/index.ts';
import { ALL_DIRS, Terrain, opposite } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

export const solution: ReferenceSolution = {
  levelId: 'w4-01',
  run(sim: Sim, botId: number): void {
    let back: Dir | null = null;
    let heading: Dir | null = null;
    for (;;) {
      const order = ALL_DIRS.filter((dir) => dir !== back && dir !== heading);
      let chosen: Dir | null = null;
      let stretch = 0;
      let arrived = false;
      for (const dir of order) {
        let open = 0;
        let pad = false;
        for (const view of sim.look(botId, dir)) {
          if (!view.walkable) break;
          open++;
          if (view.terrain === Terrain.Pad) {
            pad = true;
            break;
          }
        }
        if (open > 0) {
          chosen = dir;
          stretch = open;
          arrived = pad;
          break;
        }
      }
      if (chosen === null) return;
      for (let i = 0; i < stretch; i++) sim.move(botId, chosen);
      if (arrived) return;
      heading = chosen;
      back = opposite(chosen);
    }
  },
  source: [
    'let back = -1;',
    'let heading = -1;',
    'for (;;) {',
    '  const order = [Dir.North, Dir.East, Dir.South, Dir.West].filter(',
    '    (d) => d !== back && d !== heading,',
    '  );',
    '  let chosen = -1;',
    '  let stretch = 0;',
    '  let arrived = false;',
    '  for (const d of order) {',
    '    let open = 0;',
    '    let pad = false;',
    '    for (const view of look(d)) {',
    '      if (!view.walkable) break;',
    '      open++;',
    '      if (view.terrain === Terrain.Pad) { pad = true; break; }',
    '    }',
    '    if (open > 0) {',
    '      chosen = d;',
    '      stretch = open;',
    '      arrived = pad;',
    '      break;',
    '    }',
    '  }',
    '  if (chosen < 0) break;',
    '  for (let i = 0; i < stretch; i++) move(chosen);',
    '  if (arrived) break;',
    '  heading = chosen;',
    '  back = (chosen + 2) % 4;',
    '}',
  ].join('\n'),
};
