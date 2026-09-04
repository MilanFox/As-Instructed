import type { Dir as DirType, Sim } from '../../../engine/index.ts';
import { Dir } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * The World 1 serpentine with one decision bolted onto each tile. The scan is what keeps the arm
 * from swinging at bare soil and at the second sowing, both of which cost two ticks and return
 * nothing.
 */
export const solution: ReferenceSolution = {
  levelId: 'w2-02',
  run(sim: Sim, botId: number): void {
    const service = (): void => {
      const here = sim.scan(botId);
      if (here.crop !== null && here.growth >= here.maxGrowth) sim.harvest(botId);
    };
    const sweep = (dir: DirType): void => {
      while (sim.canMove(botId, dir)) {
        sim.move(botId, dir);
        service();
      }
    };

    let dir: DirType = Dir.East;
    service();
    sweep(dir);
    while (sim.canMove(botId, Dir.South)) {
      sim.move(botId, Dir.South);
      service();
      dir = dir === Dir.East ? Dir.West : Dir.East;
      sweep(dir);
    }
  },
  source: [
    'function service(): void {',
    '  const here = scan();',
    '  if (here.crop !== null && here.growth >= here.maxGrowth) harvest();',
    '}',
    'function sweep(dir: Dir): void {',
    '  while (canMove(dir)) {',
    '    move(dir);',
    '    service();',
    '  }',
    '}',
    '',
    'let dir: Dir = Dir.East;',
    'service();',
    'sweep(dir);',
    'while (canMove(Dir.South)) {',
    '  move(Dir.South);',
    '  service();',
    '  dir = dir === Dir.East ? Dir.West : Dir.East;',
    '  sweep(dir);',
    '}',
  ].join('\n'),
};
