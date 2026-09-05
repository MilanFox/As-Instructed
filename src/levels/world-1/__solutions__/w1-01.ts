import { Dir, type Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Round the pillar through the gap above it, then one counted loop per leg. 78 moves, which is
 * the whole route and the whole level.
 */
export const solution: ReferenceSolution = {
  levelId: 'w1-01',
  run(sim: Sim, botId: number): void {
    sim.move(botId, Dir.East);
    sim.move(botId, Dir.North);
    sim.move(botId, Dir.East);
    sim.move(botId, Dir.East);
    sim.move(botId, Dir.South);
    for (let i = 0; i < 19; i++) sim.move(botId, Dir.East);
    for (let i = 0; i < 5; i++) sim.move(botId, Dir.South);
    for (let i = 0; i < 22; i++) sim.move(botId, Dir.West);
    for (let i = 0; i < 5; i++) sim.move(botId, Dir.South);
    for (let i = 0; i < 22; i++) sim.move(botId, Dir.East);
  },
  source: [
    'move(Dir.East);',
    'move(Dir.North);',
    'move(Dir.East);',
    'move(Dir.East);',
    'move(Dir.South);',
    '',
    'for (let i = 0; i < 19; i++) move(Dir.East);',
    'for (let i = 0; i < 5; i++) move(Dir.South);',
    'for (let i = 0; i < 22; i++) move(Dir.West);',
    'for (let i = 0; i < 5; i++) move(Dir.South);',
    'for (let i = 0; i < 22; i++) move(Dir.East);',
  ].join('\n'),
};
