import { Dir, type Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Drive East for as long as East exists. The pad is the last tile, so the wall past it is what
 * stops the loop, and sensing that wall is free.
 */
export const solution: ReferenceSolution = {
  levelId: 'w1-03',
  run(sim: Sim, botId: number): void {
    while (sim.canMove(botId, Dir.East)) sim.move(botId, Dir.East);
  },
  source: ['while (canMove(Dir.East)) {', '  move(Dir.East);', '}'].join('\n'),
};
