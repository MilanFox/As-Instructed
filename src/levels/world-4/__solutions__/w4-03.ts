import type { Dir, Sim } from '../../../engine/index.ts';
import { Dir as D, Terrain } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Constant memory: one direction, and nothing else. At every tile the bot tries the direction to
 * its left first, then straight on, then right, then back. On a grid whose walls all connect to
 * the outside wall that walk is forced to pass every opening, including the exit, so no record of
 * where it has been is needed. The starting direction does not matter — the first tile has only
 * one opening, and the invariant establishes itself on the first step.
 */
export const solution: ReferenceSolution = {
  levelId: 'w4-03',
  run(sim: Sim, botId: number): void {
    let facing: Dir = D.North;
    while (sim.scan(botId).terrain !== Terrain.Pad) {
      const order: Dir[] = [
        ((facing + 3) % 4) as Dir,
        facing,
        ((facing + 1) % 4) as Dir,
        ((facing + 2) % 4) as Dir,
      ];
      const next = order.find((dir) => sim.look(botId, dir, 1)[0]?.walkable === true);
      if (next === undefined) return;
      facing = next;
      sim.move(botId, next);
    }
  },
  source: [
    'let facing = Dir.North;',
    'while (scan().terrain !== Terrain.Pad) {',
    '  const order = [(facing + 3) % 4, facing, (facing + 1) % 4, (facing + 2) % 4];',
    '  const next = order.find((d) => look(d, 1)[0].walkable);',
    '  if (next === undefined) break;',
    '  facing = next;',
    '  move(next);',
    '}',
  ].join('\n'),
};
