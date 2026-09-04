import { Dir, type Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Walk the row once reading every tile, keep the best reading and where it came from, then drive
 * back to it. The sensor is free, so the only cost is the walk out and the walk back.
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
    '  if (!canMove(Dir.East)) break;',
    '  move(Dir.East);',
    '}',
    '',
    'while (pos().x > bestX) move(Dir.West);',
  ].join('\n'),
};
