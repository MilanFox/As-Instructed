import { Dir, type Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

export const solution: ReferenceSolution = {
  levelId: 'w1-02',
  run(sim: Sim, botId: number): void {
    while (sim.canMove(botId, Dir.East)) sim.move(botId, Dir.East);
  },
  source: ['while (canMove(Dir.East)) {', '  move(Dir.East);', '}'].join('\n'),
};

const GUARANTEED = 7;
const STRIDE = 6;

export const starSolution: ReferenceSolution = {
  levelId: 'w1-02',
  run(sim: Sim, botId: number): void {
    for (let i = 0; i < GUARANTEED; i++) sim.move(botId, Dir.East);
    while (sim.canMove(botId, Dir.East)) {
      for (let i = 0; i < STRIDE; i++) sim.move(botId, Dir.East);
    }
  },
  source: [
    '// The corridor is never shorter than eight tiles, so the first seven moves need no reading.',
    'for (let i = 0; i < 7; i++) {',
    '  move(Dir.East);',
    '}',
    '',
    '// One reading buys six tiles. Overrunning the pad bumps the wall, and five bumps is the',
    '// worst the ration allows, so six is the longest stride that always stays inside it.',
    'while (canMove(Dir.East)) {',
    '  for (let i = 0; i < 6; i++) {',
    '    move(Dir.East);',
    '  }',
    '}',
  ].join('\n'),
};
