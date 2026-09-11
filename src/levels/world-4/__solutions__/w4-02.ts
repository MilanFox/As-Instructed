import type { Dir, Sim, Vec } from '../../../engine/index.ts';
import { ALL_DIRS, Terrain, opposite } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

export const solution: ReferenceSolution = {
  levelId: 'w4-02',
  run(sim: Sim, botId: number): void {
    const back: Dir[] = [];
    let from: Vec | null = null;
    while (sim.scan(botId).terrain !== Terrain.Pad) {
      const here = sim.pos(botId);
      if (sim.readMark(botId) === null) {
        const crumb = from ?? here;
        sim.mark(botId, `${String(crumb.x)},${String(crumb.y)}`);
      }
      const onward = ALL_DIRS.find((dir) => {
        const view = sim.look(botId, dir, 1)[0];
        return view?.walkable === true && view.mark === null;
      });
      from = here;
      if (onward !== undefined) {
        sim.move(botId, onward);
        back.push(opposite(onward));
        continue;
      }
      const retreat = back.pop();
      if (retreat === undefined) return;
      sim.move(botId, retreat);
    }
  },
  source: [
    'const back = [];',
    'const dirs = [Dir.North, Dir.East, Dir.South, Dir.West];',
    'let from = null;',
    'while (scan().terrain !== Terrain.Pad) {',
    '  const here = pos();',
    '  if (readMark() === null) {',
    '    const crumb = from ?? here;',
    '    mark(crumb.x + "," + crumb.y);',
    '  }',
    '  const onward = dirs.find((d) => {',
    '    const view = look(d, 1)[0];',
    '    return view.walkable && view.mark === null;',
    '  });',
    '  from = here;',
    '  if (onward !== undefined) {',
    '    move(onward);',
    '    back.push((onward + 2) % 4);',
    '  } else {',
    '    const retreat = back.pop();',
    '    if (retreat === undefined) break;',
    '    move(retreat);',
    '  }',
    '}',
  ].join('\n'),
};
