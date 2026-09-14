import type { Dir as DirType, Sim } from '../../../engine/index.ts';
import { Dir } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

export const solution: ReferenceSolution = {
  levelId: 'w2-01',
  run(sim: Sim, botId: number): void {
    const service = (): void => {
      const here = sim.scan(botId);
      if (here.crop === null) {
        sim.plant(botId);
        return;
      }
      if (here.growth >= here.maxGrowth) {
        sim.harvest(botId);
        sim.plant(botId);
      }
    };
    const sweep = (dir: DirType): void => {
      while (sim.canMove(botId, dir)) {
        sim.move(botId, dir);
        service();
      }
    };

    const across: DirType = sim.canMove(botId, Dir.East) ? Dir.East : Dir.West;
    const back: DirType = across === Dir.East ? Dir.West : Dir.East;
    const down: DirType = sim.canMove(botId, Dir.South) ? Dir.South : Dir.North;

    let dir: DirType = across;
    service();
    sweep(dir);
    while (sim.canMove(botId, down)) {
      sim.move(botId, down);
      service();
      dir = dir === across ? back : across;
      sweep(dir);
    }
  },
  source: [
    'function service(): void {',
    '  const here = scan();',
    '  if (here.crop === null) {',
    '    plant();',
    '    return;',
    '  }',
    '  if (here.growth >= here.maxGrowth) {',
    '    harvest();',
    '    plant();',
    '  }',
    '}',
    'function sweep(dir: Dir): void {',
    '  while (canMove(dir)) {',
    '    move(dir);',
    '    service();',
    '  }',
    '}',
    '',
    'const across: Dir = canMove(Dir.East) ? Dir.East : Dir.West;',
    'const back: Dir = across === Dir.East ? Dir.West : Dir.East;',
    'const down: Dir = canMove(Dir.South) ? Dir.South : Dir.North;',
    '',
    'let dir: Dir = across;',
    'service();',
    'sweep(dir);',
    'while (canMove(down)) {',
    '  move(down);',
    '  service();',
    '  dir = dir === across ? back : across;',
    '  sweep(dir);',
    '}',
  ].join('\n'),
};
