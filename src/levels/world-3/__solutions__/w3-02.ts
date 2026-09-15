import type { ItemKind, Sim, Vec } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { goTo, key, nearestIndex, surveyYard } from './driver.ts';

export const solution: ReferenceSolution = {
  levelId: 'w3-02',
  run(sim: Sim, botId: number): void {
    const depots = new Map<string, Vec>();
    const crates: { at: Vec; kind: ItemKind }[] = [];
    const seen = new Set<string>();

    surveyYard(sim, botId, (tile) => {
      if (!tile.inBounds || seen.has(key(tile.at))) return;
      seen.add(key(tile.at));
      if (tile.mark) depots.set(tile.mark, tile.at);
      for (const stack of tile.items) {
        for (let i = 0; i < stack.count; i++) crates.push({ at: tile.at, kind: stack.kind });
      }
    });

    for (const crate of crates) {
      const depot = depots.get(crate.kind);
      if (!depot) continue;
      goTo(sim, botId, crate.at);
      sim.pickup(botId, crate.kind, 1);
      goTo(sim, botId, depot);
      sim.drop(botId, crate.kind, 1);
    }
  },
  source: [
    'const depots = new Map<string, Vec>();',
    'const crates: { at: Vec; kind: ItemKind }[] = [];',
    'const seen = new Set<string>();',
    '',
    'function note(tile: TileView): void {',
    '  const k = `${tile.at.x},${tile.at.y}`;',
    '  if (!tile.inBounds || seen.has(k)) return;',
    '  seen.add(k);',
    '  if (tile.mark) depots.set(tile.mark, tile.at);',
    '  for (const stack of tile.items) {',
    '    for (let i = 0; i < stack.count; i++) crates.push({ at: tile.at, kind: stack.kind });',
    '  }',
    '}',
    '',
    'function read(): void {',
    '  note(scan());',
    '  note(scan(Dir.North));',
    '  note(scan(Dir.South));',
    '}',
    '',
    'function goTo(target: Vec): void {',
    '  while (pos().x !== target.x) move(pos().x < target.x ? Dir.East : Dir.West);',
    '  while (pos().y !== target.y) move(pos().y < target.y ? Dir.South : Dir.North);',
    '}',
    '',
    'while (canMove(Dir.West)) move(Dir.West);',
    'while (canMove(Dir.North)) move(Dir.North);',
    'let along = Dir.East;',
    'for (;;) {',
    '  read();',
    '  while (canMove(along)) {',
    '    move(along);',
    '    read();',
    '  }',
    '  if (!canMove(Dir.South)) break;',
    '  move(Dir.South);',
    '  if (!canMove(Dir.South)) break;',
    '  move(Dir.South);',
    '  if (canMove(Dir.South)) move(Dir.South);',
    '  along = along === Dir.East ? Dir.West : Dir.East;',
    '}',
    '',
    'for (const crate of crates) {',
    '  const depot = depots.get(crate.kind);',
    '  if (!depot) continue;',
    '  goTo(crate.at);',
    '  pickup(crate.kind);',
    '  goTo(depot);',
    '  drop(crate.kind);',
    '}',
  ].join('\n'),
};

export const starSolution: ReferenceSolution = {
  levelId: 'w3-02',
  run(sim: Sim, botId: number): void {
    const depots = new Map<string, Vec>();
    const crates: { at: Vec; kind: ItemKind }[] = [];
    const seen = new Set<string>();

    surveyYard(sim, botId, (tile) => {
      if (!tile.inBounds || seen.has(key(tile.at))) return;
      seen.add(key(tile.at));
      if (tile.mark) depots.set(tile.mark, tile.at);
      for (const stack of tile.items) {
        for (let i = 0; i < stack.count; i++) crates.push({ at: tile.at, kind: stack.kind });
      }
    });

    const classes = [...new Set(crates.map((crate) => crate.kind))];
    while (classes.length > 0) {
      const here = sim.pos(botId);
      const next = nearestIndex(
        here,
        classes.map((kind) => depots.get(kind) ?? here),
      );
      const kind = classes.splice(next < 0 ? 0 : next, 1)[0];
      const depot = kind === undefined ? undefined : depots.get(kind);
      if (kind === undefined || !depot) continue;
      const mine = crates.filter((crate) => crate.kind === kind).map((crate) => crate.at);
      while (mine.length > 0) {
        const at = mine.splice(nearestIndex(sim.pos(botId), mine), 1)[0];
        if (!at) break;
        goTo(sim, botId, at);
        sim.pickup(botId, kind, 1);
        goTo(sim, botId, depot);
        sim.drop(botId, kind, 1);
      }
    }
  },
  source: [
    'const depots = new Map<string, Vec>();',
    'const crates: { at: Vec; kind: ItemKind }[] = [];',
    'const seen = new Set<string>();',
    '',
    'function note(tile: TileView): void {',
    '  const k = `${tile.at.x},${tile.at.y}`;',
    '  if (!tile.inBounds || seen.has(k)) return;',
    '  seen.add(k);',
    '  if (tile.mark) depots.set(tile.mark, tile.at);',
    '  for (const stack of tile.items) {',
    '    for (let i = 0; i < stack.count; i++) crates.push({ at: tile.at, kind: stack.kind });',
    '  }',
    '}',
    '',
    'function read(): void {',
    '  note(scan());',
    '  note(scan(Dir.North));',
    '  note(scan(Dir.South));',
    '}',
    '',
    'function goTo(target: Vec): void {',
    '  while (pos().x !== target.x) move(pos().x < target.x ? Dir.East : Dir.West);',
    '  while (pos().y !== target.y) move(pos().y < target.y ? Dir.South : Dir.North);',
    '}',
    '',
    'function span(a: Vec, b: Vec): number {',
    '  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);',
    '}',
    '',
    'function nearest(from: Vec, stops: Vec[]): number {',
    '  let best = 0;',
    '  for (let i = 1; i < stops.length; i++) {',
    '    if (span(from, stops[i]) < span(from, stops[best])) best = i;',
    '  }',
    '  return best;',
    '}',
    '',
    'while (canMove(Dir.West)) move(Dir.West);',
    'while (canMove(Dir.North)) move(Dir.North);',
    'let along = Dir.East;',
    'for (;;) {',
    '  read();',
    '  while (canMove(along)) {',
    '    move(along);',
    '    read();',
    '  }',
    '  if (!canMove(Dir.South)) break;',
    '  move(Dir.South);',
    '  if (!canMove(Dir.South)) break;',
    '  move(Dir.South);',
    '  if (canMove(Dir.South)) move(Dir.South);',
    '  along = along === Dir.East ? Dir.West : Dir.East;',
    '}',
    '',
    '// The sheet wants a depot finished before the next one opens, so the run is ordered by',
    '// class first and by distance only inside a class.',
    'const classes = [...new Set(crates.map((crate) => crate.kind))];',
    'while (classes.length > 0) {',
    '  const depotsLeft = classes.map((kind) => depots.get(kind));',
    '  const kind = classes.splice(nearest(pos(), depotsLeft), 1)[0];',
    '  const depot = depots.get(kind);',
    '  const mine = crates.filter((crate) => crate.kind === kind).map((crate) => crate.at);',
    '  while (mine.length > 0) {',
    '    const at = mine.splice(nearest(pos(), mine), 1)[0];',
    '    goTo(at);',
    '    pickup(kind);',
    '    goTo(depot);',
    '    drop(kind);',
    '  }',
    '}',
  ].join('\n'),
};
