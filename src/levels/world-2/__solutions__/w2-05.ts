import type { Dir as DirType, Sim } from '../../../engine/index.ts';
import { Dir, ItemKind } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * A single filtered sweep, greedy on what is already ripe, that stops the moment the hopper
 * refuses a crop. Nothing here plans a route: the shift is too short to cross the field, so the
 * whole game is spending ticks only on tiles that pay.
 */
export const solution: ReferenceSolution = {
  levelId: 'w2-05',
  run(sim: Sim, botId: number): void {
    let full = false;

    const service = (): void => {
      if (full) return;
      const here = sim.scan(botId);
      if (here.crop !== ItemKind.Crop || here.growth < here.maxGrowth) return;
      if (sim.harvest(botId) === null) full = true;
    };
    const sweep = (dir: DirType): void => {
      while (!full && sim.canMove(botId, dir)) {
        sim.move(botId, dir);
        service();
      }
    };

    let dir: DirType = Dir.East;
    service();
    sweep(dir);
    while (!full && sim.canMove(botId, Dir.South)) {
      sim.move(botId, Dir.South);
      service();
      dir = dir === Dir.East ? Dir.West : Dir.East;
      sweep(dir);
    }
  },
  source: [
    'let full = false;',
    '',
    'function service(): void {',
    '  if (full) return;',
    '  const here = scan();',
    '  if (here.crop !== "crop" || here.growth < here.maxGrowth) return;',
    '  if (harvest() === null) full = true;',
    '}',
    'function sweep(dir: Dir): void {',
    '  while (!full && canMove(dir)) {',
    '    move(dir);',
    '    service();',
    '  }',
    '}',
    '',
    'let dir: Dir = Dir.East;',
    'service();',
    'sweep(dir);',
    'while (!full && canMove(Dir.South)) {',
    '  move(Dir.South);',
    '  service();',
    '  dir = dir === Dir.East ? Dir.West : Dir.East;',
    '  sweep(dir);',
    '}',
  ].join('\n'),
};
