import type { Dir as DirType, Sim } from '../../../engine/index.ts';
import { Dir, ItemKind } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Two lanes rather than six rows. `scan(Dir.North)` and `scan(Dir.South)` read the rows either
 * side for nothing, so a bot driving the second row has already surveyed the first three; three
 * rows further South covers the rest. The wheels only leave the lane for a tile the sensor has
 * already called ripe crop, and that detour is two ticks there and back.
 *
 * The field is wider than the shift is long, so what this buys is not tidiness — it is the four
 * rows of driving that never happen.
 */
export const solution: ReferenceSolution = {
  levelId: 'w2-05',
  run(sim: Sim, botId: number): void {
    let full = false;

    const take = (): void => {
      const here = sim.scan(botId);
      if (here.crop !== ItemKind.Crop || here.growth < here.maxGrowth) return;
      if (sim.harvest(botId) === null) full = true;
    };
    const worthLeaving = (dir: DirType): boolean => {
      if (!sim.canMove(botId, dir)) return false;
      const view = sim.scan(botId, dir);
      return view.crop === ItemKind.Crop && view.growth >= (view.maxGrowth ?? 0);
    };
    const lane = (along: DirType): void => {
      for (;;) {
        take();
        if (full) return;
        for (const side of [Dir.North, Dir.South]) {
          if (!worthLeaving(side)) continue;
          sim.move(botId, side);
          take();
          sim.move(botId, side === Dir.North ? Dir.South : Dir.North);
          if (full) return;
        }
        if (!sim.canMove(botId, along)) return;
        sim.move(botId, along);
      }
    };

    // Drop onto the middle of the first three rows, run it, then drop onto the middle of the rest.
    if (sim.canMove(botId, Dir.South)) sim.move(botId, Dir.South);
    lane(Dir.East);
    for (let i = 0; i < 3 && !full && sim.canMove(botId, Dir.South); i++) {
      sim.move(botId, Dir.South);
    }
    if (!full) lane(Dir.West);
  },
  source: [
    'let full = false;',
    '',
    'function take(): void {',
    '  const here = scan();',
    '  if (here.crop !== "crop" || here.growth < here.maxGrowth) return;',
    '  if (harvest() === null) full = true;',
    '}',
    'function worthLeaving(dir: Dir): boolean {',
    '  if (!canMove(dir)) return false;',
    '  const view = scan(dir);',
    '  return view.crop === "crop" && view.growth >= view.maxGrowth;',
    '}',
    'function lane(along: Dir): void {',
    '  for (;;) {',
    '    take();',
    '    if (full) return;',
    '    for (const side of [Dir.North, Dir.South]) {',
    '      if (!worthLeaving(side)) continue;',
    '      move(side);',
    '      take();',
    '      move(side === Dir.North ? Dir.South : Dir.North);',
    '      if (full) return;',
    '    }',
    '    if (!canMove(along)) return;',
    '    move(along);',
    '  }',
    '}',
    '',
    'if (canMove(Dir.South)) move(Dir.South);',
    'lane(Dir.East);',
    'for (let i = 0; i < 3 && !full && canMove(Dir.South); i++) move(Dir.South);',
    'if (!full) lane(Dir.West);',
  ].join('\n'),
};
