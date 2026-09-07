import { Dir, type Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * The hopper starts full, so the very first `inventory()` reading is the capacity and nothing
 * else will ever report it. The first lap plants the bare tile — which is the only way to open a
 * slot — and takes whatever is already ripe. Later laps stand on the next unfinished tile and
 * wait it out: the clock runs at the same rate whether the bot drives or not, and driving arrives
 * late.
 *
 * `done` and `seen` are ordinary JavaScript Sets. They survive the whole run (DESIGN.md §5),
 * which is what makes "resume where you left off" possible at all.
 */
export const solution: ReferenceSolution = {
  levelId: 'w2-04',
  run(sim: Sim, botId: number): void {
    const capacity = sim.inventory(botId);
    const done = new Set<string>();
    const seen = new Set<string>();

    const service = (waitForIt: boolean): void => {
      const at = sim.pos(botId);
      const key = `${at.x},${at.y}`;
      seen.add(key);
      if (done.has(key)) return;

      const here = sim.scan(botId);
      if (here.crop === null) {
        if (sim.plant(botId)) done.add(key);
        return;
      }
      if (here.growth < here.maxGrowth) {
        if (!waitForIt) return;
        // A tile that has not been sown yet reads 0 of 8 and stays there, so the gap is a
        // lower bound on the wait, never the whole of it. Look again after every wait.
        for (let guard = 0; guard < 40; guard++) {
          const now = sim.scan(botId);
          if (now.growth >= now.maxGrowth) break;
          sim.wait(botId, Math.max(1, now.maxGrowth - now.growth));
        }
      }
      if (sim.inventory(botId) >= capacity) return;
      if (sim.harvest(botId) === null) return;
      sim.plant(botId);
      done.add(key);
    };

    const lap = (waitForIt: boolean): void => {
      service(waitForIt);
      while (sim.canMove(botId, Dir.East)) {
        sim.move(botId, Dir.East);
        service(waitForIt);
      }
      if (sim.canMove(botId, Dir.South)) {
        sim.move(botId, Dir.South);
        service(waitForIt);
      }
      while (sim.canMove(botId, Dir.West)) {
        sim.move(botId, Dir.West);
        service(waitForIt);
      }
      if (sim.canMove(botId, Dir.North)) sim.move(botId, Dir.North);
    };

    // Standing still is only ever the last resort: another tile may be ready now, and the
    // clock that ripens this one runs while the bot is over there.
    lap(false);
    for (let guard = 0; done.size < seen.size && guard < 40; guard++) {
      const before = done.size;
      lap(false);
      if (done.size === before) lap(true);
    }
  },
  source: [
    'const capacity = inventory();',
    'const done = new Set();',
    'const seen = new Set();',
    '',
    'function service(waitForIt) {',
    '  const at = pos();',
    '  const key = `${at.x},${at.y}`;',
    '  seen.add(key);',
    '  if (done.has(key)) return;',
    '',
    '  const here = scan();',
    '  if (here.crop === null) {',
    '    if (plant()) done.add(key);',
    '    return;',
    '  }',
    '  if (here.growth < here.maxGrowth) {',
    '    if (!waitForIt) return;',
    '    let now = here;',
    '    while (now.growth < now.maxGrowth) {',
    '      wait(Math.max(1, now.maxGrowth - now.growth));',
    '      now = scan();',
    '    }',
    '  }',
    '  if (inventory() >= capacity) return;',
    '  if (harvest() === null) return;',
    '  plant();',
    '  done.add(key);',
    '}',
    '',
    'function lap(waitForIt) {',
    '  service(waitForIt);',
    '  while (canMove(Dir.East)) {',
    '    move(Dir.East);',
    '    service(waitForIt);',
    '  }',
    '  if (canMove(Dir.South)) {',
    '    move(Dir.South);',
    '    service(waitForIt);',
    '  }',
    '  while (canMove(Dir.West)) {',
    '    move(Dir.West);',
    '    service(waitForIt);',
    '  }',
    '  if (canMove(Dir.North)) move(Dir.North);',
    '}',
    '',
    'lap(false);',
    'for (let guard = 0; done.size < seen.size && guard < 40; guard++) {',
    '  const before = done.size;',
    '  lap(false);',
    '  if (done.size === before) lap(true);',
    '}',
  ].join('\n'),
};
