import type { Dir as DirType, Sim } from '../../../engine/index.ts';
import { Dir } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

export const solution: ReferenceSolution = {
  levelId: 'w1-03',
  run(sim: Sim, botId: number): void {
    const sweep = (dir: DirType): void => {
      while (sim.canMove(botId, dir)) sim.move(botId, dir);
    };
    const flipEastWest = (dir: DirType): DirType => (dir === Dir.East ? Dir.West : Dir.East);

    // Five rows is odd, so a row-by-row snake always ends at the wall it did not start against.
    const snake = (climb: DirType): void => {
      let heading: DirType = Dir.East;
      sweep(heading);
      while (sim.canMove(botId, climb)) {
        sim.move(botId, climb);
        heading = flipEastWest(heading);
        sweep(heading);
      }
    };

    snake(Dir.South);
    snake(Dir.North);
  },
  source: [
    'function sweep(dir: Dir): void {',
    '  while (canMove(dir)) move(dir);',
    '}',
    'function flipEastWest(dir: Dir): Dir {',
    '  return dir === Dir.East ? Dir.West : Dir.East;',
    '}',
    '',
    '// Five rows is odd, so a row-by-row snake always ends at the wall it did not start against.',
    'function snake(climb: Dir): void {',
    '  let heading = Dir.East;',
    '  sweep(heading);',
    '  while (canMove(climb)) {',
    '    move(climb);',
    '    heading = flipEastWest(heading);',
    '    sweep(heading);',
    '  }',
    '}',
    '',
    '// South through the west half, out at the doorway, then North back up the east half.',
    'snake(Dir.South);',
    'snake(Dir.North);',
  ].join('\n'),
};
