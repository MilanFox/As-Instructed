import type { Dir, Sim } from '../../../engine/index.ts';
import { ALL_DIRS, Terrain, opposite } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * Follow the tunnel. The corridor is one tile wide with no branches, so from any tile exactly one
 * opening is not the one we arrived through; take it, and remember the way back so the next
 * iteration can rule it out. Optimal by construction: the route is forced.
 *
 * The ray is read as a ray. `look(dir, RANGE)` reports the whole straight stretch of corridor in
 * one call, so the bot drives all of it before looking again and only pays for a ray where the
 * tunnel bends. Same route, same ticks — 48, 52, 50 — on a third of the rays.
 */

/** A ray cannot outrun the widest tunnel this level builds, and stops at the first wall anyway. */
const RANGE = 8;

export const solution: ReferenceSolution = {
  levelId: 'w4-01',
  run(sim: Sim, botId: number): void {
    let back: Dir | null = null;
    while (sim.scan(botId).terrain !== Terrain.Pad) {
      let heading: Dir | null = null;
      let stretch = 0;
      for (const dir of ALL_DIRS) {
        if (dir === back) continue;
        let open = 0;
        for (const view of sim.look(botId, dir, RANGE)) {
          if (!view.walkable) break;
          open++;
          if (view.terrain === Terrain.Pad) break;
        }
        if (open > 0) {
          heading = dir;
          stretch = open;
          break;
        }
      }
      if (heading === null) return;
      for (let i = 0; i < stretch; i++) sim.move(botId, heading);
      back = opposite(heading);
    }
  },
  source: [
    'let back = -1;',
    'while (scan().terrain !== Terrain.Pad) {',
    '  const dirs = [Dir.North, Dir.East, Dir.South, Dir.West];',
    '  let heading = -1;',
    '  let stretch = 0;',
    '  for (const d of dirs) {',
    '    if (d === back) continue;',
    '    let open = 0;',
    '    for (const view of look(d, 8)) {',
    '      if (!view.walkable) break;',
    '      open++;',
    '      if (view.terrain === Terrain.Pad) break;',
    '    }',
    '    if (open > 0) { heading = d; stretch = open; break; }',
    '  }',
    '  if (heading < 0) break;',
    '  for (let i = 0; i < stretch; i++) move(heading);',
    '  back = (heading + 2) % 4;',
    '}',
  ].join('\n'),
};
