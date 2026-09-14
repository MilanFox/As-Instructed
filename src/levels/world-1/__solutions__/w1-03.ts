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

    const combColumns = (columns: number, rows: number, first: DirType): void => {
      let vertical = first;
      for (let column = 1; column <= columns; column++) {
        march(vertical, rows - 1);
        if (column === columns) break;
        sim.move(botId, Dir.East);
        vertical = flipNorthSouth(vertical);
      }
    };

    const combRows = (columns: number, rows: number, first: DirType): void => {
      let heading = first;
      for (let row = 1; row <= rows; row++) {
        march(heading, columns - 1);
        if (row === rows) break;
        sim.move(botId, Dir.South);
        heading = flipEastWest(heading);
      }
    };

    const combFromNorthWest = (columns: number, rows: number): void => {
      if (rows % 2 === 1) {
        combRows(columns, rows, Dir.East);
        return;
      }
      if (columns % 2 === 1) {
        combColumns(columns, rows, Dir.South);
        return;
      }
      combColumns(columns, 2, Dir.South);
      sim.move(botId, Dir.South);
      if (rows === 2) return;
      sim.move(botId, Dir.South);
      combRows(columns, rows - 2, Dir.West);
    };

    const combFromSouthWest = (columns: number, rows: number): void => {
      if (columns % 2 === 0) {
        combColumns(columns, rows, Dir.North);
        return;
      }
      march(Dir.North, rows - 1);
      sim.move(botId, Dir.East);
      combFromNorthWest(columns - 1, rows);
    };

    const snakeNarrowHalf = (): void => {
      let heading: DirType = Dir.East;
      while (sim.canMove(botId, Dir.South)) {
        sim.move(botId, Dir.South);
        heading = flipEastWest(heading);
        sweep(heading);
      }
      if (heading === Dir.West) sweep(Dir.East);
    };

    const combWestHalf = (columns: number): void => {
      sim.move(botId, Dir.South);
      sweep(Dir.West);
      sim.move(botId, Dir.South);
      const rows = sweep(Dir.South) + 3;
      sim.move(botId, Dir.East);
      combFromSouthWest(columns - 1, rows - 2);
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
    if (columns === 2) snakeNarrowHalf();
    else combWestHalf(columns);
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
    'function combColumns(columns: number, rows: number, first: Dir): void {',
    '  let vertical = first;',
    '  for (let column = 1; column <= columns; column++) {',
    '    march(vertical, rows - 1);',
    '    if (column === columns) break;',
    '    move(Dir.East);',
    '    vertical = flipNorthSouth(vertical);',
    '  }',
    '}',
    '',
    'function combRows(columns: number, rows: number, first: Dir): void {',
    '  let heading = first;',
    '  for (let row = 1; row <= rows; row++) {',
    '    march(heading, columns - 1);',
    '    if (row === rows) break;',
    '    move(Dir.South);',
    '    heading = flipEastWest(heading);',
    '  }',
    '}',
    '',
    'function combFromNorthWest(columns: number, rows: number): void {',
    '  if (rows % 2 === 1) {',
    '    combRows(columns, rows, Dir.East);',
    '    return;',
    '  }',
    '  if (columns % 2 === 1) {',
    '    combColumns(columns, rows, Dir.South);',
    '    return;',
    '  }',
    '  combColumns(columns, 2, Dir.South);',
    '  move(Dir.South);',
    '  if (rows === 2) return;',
    '  move(Dir.South);',
    '  combRows(columns, rows - 2, Dir.West);',
    '}',
    '',
    'function combFromSouthWest(columns: number, rows: number): void {',
    '  if (columns % 2 === 0) {',
    '    combColumns(columns, rows, Dir.North);',
    '    return;',
    '  }',
    '  march(Dir.North, rows - 1);',
    '  move(Dir.East);',
    '  combFromNorthWest(columns - 1, rows);',
    '}',
    '',
    'function snakeNarrowHalf(): void {',
    '  let heading: Dir = Dir.East;',
    '  while (canMove(Dir.South)) {',
    '    move(Dir.South);',
    '    heading = flipEastWest(heading);',
    '    sweep(heading);',
    '  }',
    '  if (heading === Dir.West) sweep(Dir.East);',
    '}',
    '',
    'function combWestHalf(columns: number): void {',
    '  move(Dir.South);',
    '  sweep(Dir.West);',
    '  move(Dir.South);',
    '  const rows = sweep(Dir.South) + 3;',
    '  move(Dir.East);',
    '  combFromSouthWest(columns - 1, rows - 2);',
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
    'if (columns === 2) snakeNarrowHalf();',
    'else combWestHalf(columns);',
    'snakeEastHalf();',
  ].join('\n'),
};
