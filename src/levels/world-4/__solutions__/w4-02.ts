import type { Dir, Sim } from '../../../engine/index.ts';
import { ALL_DIRS, Terrain, opposite } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Depth-first walk with the visited set stored in the world. Every tile gets one breadcrumb the
 * first time the bot stands on it; a neighbour whose mark is already set is not worth entering,
 * which is what turns the cave's loops back into a tree. The stack holds the direction home from
 * each tile, so a finished branch is unwound rather than searched again.
 */
export const solution: ReferenceSolution = {
  levelId: 'w4-02',
  run(sim: Sim, botId: number): void {
    const back: Dir[] = [];
    while (sim.scan(botId).terrain !== Terrain.Pad) {
      if (sim.readMark(botId) === null) sim.mark(botId, 'v');
      const onward = ALL_DIRS.find((dir) => {
        const view = sim.look(botId, dir, 1)[0];
        return view?.walkable === true && view.mark === null;
      });
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
    'while (scan().terrain !== Terrain.Pad) {',
    '  if (readMark() === null) mark("v");',
    '  const onward = dirs.find((d) => {',
    '    const view = look(d, 1)[0];',
    '    return view.walkable && view.mark === null;',
    '  });',
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
