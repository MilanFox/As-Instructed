import type { Dir as DirType, Sim } from '../../../engine/index.ts';
import { Dir } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * One serpentine down the west half, through the doorway at the south end of the partition, and
 * one serpentine back up the east half. Neither pass knows the bay's dimensions; both stop when
 * canMove() says the row or the column has run out.
 */
export const solution: ReferenceSolution = {
  levelId: 'w1-05',
  run(sim: Sim, botId: number): void {
    const sweep = (dir: DirType): void => {
      while (sim.canMove(botId, dir)) sim.move(botId, dir);
    };
    const flip = (dir: DirType): DirType => (dir === Dir.East ? Dir.West : Dir.East);

    let dir: DirType = Dir.East;
    sweep(dir);
    while (sim.canMove(botId, Dir.South)) {
      sim.move(botId, Dir.South);
      dir = flip(dir);
      sweep(dir);
    }

    sweep(Dir.East);

    dir = Dir.West;
    while (sim.canMove(botId, Dir.North)) {
      sim.move(botId, Dir.North);
      sweep(dir);
      dir = flip(dir);
    }
  },
  source: [
    'function sweep(dir: Dir): void {',
    '  while (canMove(dir)) move(dir);',
    '}',
    'function flip(dir: Dir): Dir {',
    '  return dir === Dir.East ? Dir.West : Dir.East;',
    '}',
    '',
    'let dir: Dir = Dir.East;',
    'sweep(dir);',
    'while (canMove(Dir.South)) {',
    '  move(Dir.South);',
    '  dir = flip(dir);',
    '  sweep(dir);',
    '}',
    '',
    'sweep(Dir.East);',
    '',
    'dir = Dir.West;',
    'while (canMove(Dir.North)) {',
    '  move(Dir.North);',
    '  sweep(dir);',
    '  dir = flip(dir);',
    '}',
  ].join('\n'),
};
