import { Dir, type Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Reflect the start position to find the pad, then close each axis in turn. The bay is open, so
 * axis order does not matter and the route is always exactly the Manhattan distance.
 */
export const solution: ReferenceSolution = {
  levelId: 'w1-04',
  run(sim: Sim, botId: number): void {
    const start = sim.pos(botId);
    const pad = { x: 10 - start.x, y: 10 - start.y };
    while (sim.pos(botId).x < pad.x) sim.move(botId, Dir.East);
    while (sim.pos(botId).x > pad.x) sim.move(botId, Dir.West);
    while (sim.pos(botId).y < pad.y) sim.move(botId, Dir.South);
    while (sim.pos(botId).y > pad.y) sim.move(botId, Dir.North);
  },
  source: [
    'const start = pos();',
    'const pad = { x: 10 - start.x, y: 10 - start.y };',
    'while (pos().x < pad.x) move(Dir.East);',
    'while (pos().x > pad.x) move(Dir.West);',
    'while (pos().y < pad.y) move(Dir.South);',
    'while (pos().y > pad.y) move(Dir.North);',
  ].join('\n'),
};
