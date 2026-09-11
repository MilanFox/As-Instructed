import { Dir, type Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

export const solution: ReferenceSolution = {
  levelId: 'w1-03',
  run(sim: Sim, botId: number): void {
    while (sim.canMove(botId, Dir.East)) sim.move(botId, Dir.East);
  },
  source: ['while (canMove(Dir.East)) {', '  move(Dir.East);', '}'].join('\n'),
};
