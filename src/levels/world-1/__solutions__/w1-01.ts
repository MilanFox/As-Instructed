import { Dir, type Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Six moves: hop one row North to clear the pillar, run East, drop back South onto the pad.
 */
export const solution: ReferenceSolution = {
  levelId: 'w1-01',
  run(sim: Sim, botId: number): void {
    sim.move(botId, Dir.North);
    sim.move(botId, Dir.East);
    sim.move(botId, Dir.East);
    sim.move(botId, Dir.East);
    sim.move(botId, Dir.East);
    sim.move(botId, Dir.South);
  },
  source: [
    'move(Dir.North);',
    'for (let i = 0; i < 4; i++) move(Dir.East);',
    'move(Dir.South);',
  ].join('\n'),
};
