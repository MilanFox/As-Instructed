import { Dir, type Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Walk East keeping the best reading and where it came from, and stop the moment a reading is at
 * the top of the scale — nothing in the row can beat it, so there is nothing left to compare and
 * no reason to walk back. The argmax is still carried in case the row somehow ends without one,
 * which is the same program with the early exit removed.
 */
export const solution: ReferenceSolution = {
  levelId: 'w2-01',
  run(sim: Sim, botId: number): void {
    let bestGrowth = -1;
    let bestX = sim.pos(botId).x;
    for (;;) {
      const here = sim.scan(botId);
      if (here.crop !== null && here.growth > bestGrowth) {
        bestGrowth = here.growth;
        bestX = sim.pos(botId).x;
      }
      if (here.crop !== null && here.growth >= here.maxGrowth) break;
      if (!sim.canMove(botId, Dir.East)) break;
      sim.move(botId, Dir.East);
    }
    while (sim.pos(botId).x > bestX) sim.move(botId, Dir.West);
  },
  source: [
    'let bestGrowth = -1;',
    'let bestX = pos().x;',
    '',
    'for (;;) {',
    '  const here = scan();',
    '  if (here.crop !== null && here.growth > bestGrowth) {',
    '    bestGrowth = here.growth;',
    '    bestX = pos().x;',
    '  }',
    '  if (here.crop !== null && here.growth >= here.maxGrowth) break;',
    '  if (!canMove(Dir.East)) break;',
    '  move(Dir.East);',
    '}',
    '',
    'while (pos().x > bestX) move(Dir.West);',
  ].join('\n'),
};
