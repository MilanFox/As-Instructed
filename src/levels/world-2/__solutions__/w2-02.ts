import { Dir, type Sim } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';

export const solution: ReferenceSolution = {
  levelId: 'w2-02',
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
