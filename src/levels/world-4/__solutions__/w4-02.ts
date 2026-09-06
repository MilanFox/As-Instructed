import type { Dir, Sim, Vec } from '../../../engine/index.ts';
import { ALL_DIRS, Terrain, opposite } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Depth-first walk with the visited set stored in the world. Every tile gets one breadcrumb the
 * first time the bot stands on it; a neighbour whose mark is already set is not worth entering,
 * which is what turns the cave's loops back into a tree. The stack holds the direction home from
 * each tile, so a finished branch is unwound rather than searched again.
 *
 * The breadcrumb is the tile the bot arrived from rather than a bare "seen", which costs nothing
 * — the same one mark per tile — and leaves the cave carrying a route home for whoever finds it.
 * That is the star, and it is the one thing a visited `Set` cannot be swapped in for.
 */
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
