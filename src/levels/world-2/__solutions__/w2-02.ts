import type { Sim, TileView, Vec } from '../../../engine/index.ts';
import { Dir } from '../../../engine/index.ts';
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

const PLOT_TILES = 6;
const key = (at: Vec): string => `${at.x},${at.y}`;

export const starSolution: ReferenceSolution = {
  levelId: 'w2-02',
  run(sim: Sim, botId: number): void {
    const ripensIn = new Map<string, number>();
    const cropAt = new Map<string, Vec>();
    const bare = new Map<string, Vec>();
    const mine = new Set<string>();
    let opened = false;

    const read = (view: TileView): void => {
      if (!view.inBounds || !view.walkable) return;
      const at = key(view.at);
      if (ripensIn.has(at) || bare.has(at) || mine.has(at)) return;
      if (view.crop === null) {
        bare.set(at, view.at);
        return;
      }
      ripensIn.set(at, view.sproutsIn + (view.maxGrowth - view.growth));
      cropAt.set(at, view.at);
    };
    const look = (): void => {
      read(sim.scan(botId));
      for (const dir of [Dir.North, Dir.East, Dir.South, Dir.West]) read(sim.scan(botId, dir));
    };
    const walk = (to: Vec): void => {
      for (let guard = 0; guard < 12; guard++) {
        const at = sim.pos(botId);
        if (at.x === to.x && at.y === to.y) return;
        if (at.x < to.x) sim.move(botId, Dir.East);
        else if (at.x > to.x) sim.move(botId, Dir.West);
        else if (at.y < to.y) sim.move(botId, Dir.South);
        else sim.move(botId, Dir.North);
        look();
      }
    };
    const open = (at: string): void => {
      opened = true;
      bare.delete(at);
      mine.add(at);
    };

    look();
    for (let guard = 0; guard < 8 && ripensIn.size + bare.size + mine.size < PLOT_TILES; guard++) {
      const here = key(sim.pos(botId));
      if (!opened && bare.has(here) && sim.plant(botId)) open(here);
      if (sim.canMove(botId, Dir.East)) sim.move(botId, Dir.East);
      else if (sim.canMove(botId, Dir.South)) sim.move(botId, Dir.South);
      else if (sim.canMove(botId, Dir.West)) sim.move(botId, Dir.West);
      else break;
      look();
    }
    if (!opened) {
      const here = sim.pos(botId);
      const span = (at: Vec): number => Math.abs(at.x - here.x) + Math.abs(at.y - here.y);
      const opener = [...bare.values()].sort((a, b) => span(a) - span(b))[0];
      if (opener) {
        walk(opener);
        if (sim.plant(botId)) open(key(opener));
      }
    }

    for (const [at] of [...ripensIn].sort((a, b) => a[1] - b[1])) {
      const tile = cropAt.get(at);
      if (!tile) continue;
      walk(tile);
      for (let guard = 0; guard < 80; guard++) {
        const here = sim.scan(botId);
        if (here.growth >= here.maxGrowth) break;
        sim.wait(botId, 1);
      }
      sim.harvest(botId);
      sim.plant(botId);
    }
    for (const at of [...bare.values()]) {
      walk(at);
      sim.plant(botId);
    }
  },
  source: [
    'const ripensIn = new Map();',
    'const cropAt = new Map();',
    'const bare = new Map();',
    'const mine = new Set();',
    'let opened = false;',
    'const k = (at) => `${at.x},${at.y}`;',
    '',
    'function read(view) {',
    '  if (!view.inBounds || !view.walkable) return;',
    '  const at = k(view.at);',
    '  if (ripensIn.has(at) || bare.has(at) || mine.has(at)) return;',
    '  if (view.crop === null) {',
    '    bare.set(at, view.at);',
    '    return;',
    '  }',
    '  ripensIn.set(at, view.sproutsIn + (view.maxGrowth - view.growth));',
    '  cropAt.set(at, view.at);',
    '}',
    '',
    'function look() {',
    '  read(scan());',
    '  for (const dir of [Dir.North, Dir.East, Dir.South, Dir.West]) read(scan(dir));',
    '}',
    '',
    'function walk(to) {',
    '  while (pos().x !== to.x || pos().y !== to.y) {',
    '    const at = pos();',
    '    if (at.x < to.x) move(Dir.East);',
    '    else if (at.x > to.x) move(Dir.West);',
    '    else if (at.y < to.y) move(Dir.South);',
    '    else move(Dir.North);',
    '    look();',
    '  }',
    '}',
    '',
    'function open(at) {',
    '  opened = true;',
    '  bare.delete(at);',
    '  mine.add(at);',
    '}',
    '',
    '// Walk the plot once before lifting anything: sproutsIn plus the growth still owed is how',
    '// long each tile has left, and that ordering is the whole of the spoilage sheet.',
    'look();',
    'while (ripensIn.size + bare.size + mine.size < 6) {',
    '  const here = k(pos());',
    '  if (!opened && bare.has(here) && plant()) open(here);',
    '  if (canMove(Dir.East)) move(Dir.East);',
    '  else if (canMove(Dir.South)) move(Dir.South);',
    '  else if (canMove(Dir.West)) move(Dir.West);',
    '  else break;',
    '  look();',
    '}',
    '',
    '// The hopper is full, so a bare tile has to take a seed before anything can be harvested.',
    'if (!opened) {',
    '  const here = pos();',
    '  const span = (at) => Math.abs(at.x - here.x) + Math.abs(at.y - here.y);',
    '  const opener = [...bare.values()].sort((a, b) => span(a) - span(b))[0];',
    '  if (opener) {',
    '    walk(opener);',
    '    if (plant()) open(k(opener));',
    '  }',
    '}',
    '',
    'for (const [at] of [...ripensIn].sort((a, b) => a[1] - b[1])) {',
    '  walk(cropAt.get(at));',
    '  while (scan().growth < scan().maxGrowth) wait(1);',
    '  harvest();',
    '  plant();',
    '}',
    'for (const at of [...bare.values()]) {',
    '  walk(at);',
    '  plant();',
    '}',
  ].join('\n'),
};
