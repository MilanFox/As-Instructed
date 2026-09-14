import type { Dir as DirType, Sim } from '../../../engine/index.ts';
import { Dir } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

export const solution: ReferenceSolution = {
  levelId: 'w1-03',
  run(sim: Sim, botId: number): void {
    const sweep = (dir: DirType): number => {
      let steps = 0;
      while (sim.canMove(botId, dir)) {
        sim.move(botId, dir);
        steps++;
      }
      return steps;
    };
    const march = (dir: DirType, steps: number): void => {
      for (let step = 0; step < steps; step++) sim.move(botId, dir);
    };
    const flipEastWest = (dir: DirType): DirType => (dir === Dir.East ? Dir.West : Dir.East);
    const flipNorthSouth = (dir: DirType): DirType => (dir === Dir.North ? Dir.South : Dir.North);

    const combWestHalf = (columns: number): void => {
      sim.move(botId, Dir.South);
      sweep(Dir.West);
      sim.move(botId, Dir.South);
      const depth = sweep(Dir.South);
      let heading: DirType = Dir.North;
      for (let column = 2; column <= columns; column++) {
        sim.move(botId, Dir.East);
        march(heading, depth);
        heading = flipNorthSouth(heading);
      }
    };

    const snakeWestHalf = (): void => {
      let heading: DirType = Dir.East;
      while (sim.canMove(botId, Dir.South)) {
        sim.move(botId, Dir.South);
        heading = flipEastWest(heading);
        sweep(heading);
      }
    };

    const snakeEastHalf = (): void => {
      sweep(Dir.East);
      let heading: DirType = Dir.West;
      while (sim.canMove(botId, Dir.North)) {
        sim.move(botId, Dir.North);
        sweep(heading);
        heading = flipEastWest(heading);
      }
    };

    const columns = sweep(Dir.East) + 1;
    if (columns % 2 === 1) combWestHalf(columns);
    else snakeWestHalf();
    snakeEastHalf();
  },
  source: [
    'function sweep(dir: Dir): number {',
    '  let steps = 0;',
    '  while (canMove(dir)) {',
    '    move(dir);',
    '    steps++;',
    '  }',
    '  return steps;',
    '}',
    'function march(dir: Dir, steps: number): void {',
    '  for (let step = 0; step < steps; step++) move(dir);',
    '}',
    'function flipEastWest(dir: Dir): Dir {',
    '  return dir === Dir.East ? Dir.West : Dir.East;',
    '}',
    'function flipNorthSouth(dir: Dir): Dir {',
    '  return dir === Dir.North ? Dir.South : Dir.North;',
    '}',
    '',
    'function combWestHalf(columns: number): void {',
    '  move(Dir.South);',
    '  sweep(Dir.West);',
    '  move(Dir.South);',
    '  const depth = sweep(Dir.South);',
    '  let heading: Dir = Dir.North;',
    '  for (let column = 2; column <= columns; column++) {',
    '    move(Dir.East);',
    '    march(heading, depth);',
    '    heading = flipNorthSouth(heading);',
    '  }',
    '}',
    '',
    'function snakeWestHalf(): void {',
    '  let heading: Dir = Dir.East;',
    '  while (canMove(Dir.South)) {',
    '    move(Dir.South);',
    '    heading = flipEastWest(heading);',
    '    sweep(heading);',
    '  }',
    '}',
    '',
    'function snakeEastHalf(): void {',
    '  sweep(Dir.East);',
    '  let heading: Dir = Dir.West;',
    '  while (canMove(Dir.North)) {',
    '    move(Dir.North);',
    '    sweep(heading);',
    '    heading = flipEastWest(heading);',
    '  }',
    '}',
    '',
    'const columns = sweep(Dir.East) + 1;',
    'if (columns % 2 === 1) combWestHalf(columns);',
    'else snakeWestHalf();',
    'snakeEastHalf();',
  ].join('\n'),
};
