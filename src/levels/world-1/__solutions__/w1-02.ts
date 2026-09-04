import { Dir, type Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Three counted loops, one per leg. 27 moves, which is the whole route and the whole level.
 */
export const solution: ReferenceSolution = {
  levelId: 'w1-02',
  run(sim: Sim, botId: number): void {
    for (let i = 0; i < 12; i++) sim.move(botId, Dir.East);
    for (let i = 0; i < 6; i++) sim.move(botId, Dir.South);
    for (let i = 0; i < 9; i++) sim.move(botId, Dir.East);
  },
  source: [
    'for (let i = 0; i < 12; i++) move(Dir.East);',
    'for (let i = 0; i < 6; i++) move(Dir.South);',
    'for (let i = 0; i < 9; i++) move(Dir.East);',
  ].join('\n'),
};
