import type { Dir, Sim } from '../../../engine/index.ts';
import { ALL_DIRS, Terrain, opposite } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Follow the tunnel. The corridor is one tile wide with no branches, so from any tile exactly one
 * opening is not the one we arrived through; take it, and remember the way back so the next
 * iteration can rule it out. Optimal by construction: the route is forced.
 */
export const solution: ReferenceSolution = {
  levelId: 'w4-01',
  run(sim: Sim, botId: number): void {
    let back: Dir | null = null;
    while (sim.scan(botId).terrain !== Terrain.Pad) {
      const next = ALL_DIRS.find((dir) => {
        if (dir === back) return false;
        return sim.look(botId, dir, 1)[0]?.walkable === true;
      });
      if (next === undefined) return;
      sim.move(botId, next);
      back = opposite(next);
    }
  },
  source: [
    'let back = -1;',
    'while (scan().terrain !== Terrain.Pad) {',
    '  const dirs = [Dir.North, Dir.East, Dir.South, Dir.West];',
    '  const next = dirs.find((d) => d !== back && look(d, 1)[0].walkable);',
    '  if (next === undefined) break;',
    '  move(next);',
    '  back = (next + 2) % 4;',
    '}',
  ].join('\n'),
};
