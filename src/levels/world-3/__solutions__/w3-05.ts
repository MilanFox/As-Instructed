import type { ItemKind, Sim, Vec } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import { goTo, key, nearestIndex, nearestNeighbourTour, surveyYard, twoOpt } from './driver.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx.
 *
 * The intended heuristic, and nothing better: survey once, fill the rack with nearest-neighbour
 * picks, then run the distinct depots of that load as a nearest-neighbour tour with one 2-opt
 * pass over it. Par is derived from exactly this, per CURRICULUM.md §2 rule 4.
 *
 * The rack capacity is not readable from the API, so the first round finds it the only way a
 * player can: by loading until a pickup comes back empty, which costs one tick and one detour.
 */
export const solution: ReferenceSolution = {
  levelId: 'w3-05',
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

    let rack = 0;
    while (crates.length > 0) {
      const load: ItemKind[] = [];
      while (crates.length > 0 && (rack === 0 || load.length < rack)) {
        const next = nearestIndex(
          sim.pos(botId),
          crates.map((crate) => crate.at),
        );
        const crate = crates[next];
        if (!crate) break;
        goTo(sim, botId, crate.at);
        if (sim.pickup(botId, crate.kind, 1) === 0) {
          rack = load.length;
          break;
        }
        crates.splice(next, 1);
        load.push(crate.kind);
      }
      if (load.length === 0) break;

      const stops: Vec[] = [];
      for (const kind of load) {
        const depot = depots.get(kind);
        if (depot && !stops.some((stop) => stop.x === depot.x && stop.y === depot.y)) {
          stops.push(depot);
        }
      }
      for (const stop of twoOpt(sim.pos(botId), nearestNeighbourTour(sim.pos(botId), stops))) {
        goTo(sim, botId, stop);
        for (const kind of new Set(load)) {
          const depot = depots.get(kind);
          if (depot && depot.x === stop.x && depot.y === stop.y) {
            sim.drop(botId, kind, sim.inventory(botId, kind));
          }
        }
      }
    }
  },
  source: [
    'const depots = new Map<string, Vec>();',
    'const crates: { at: Vec; kind: ItemKind }[] = [];',
    'const seen = new Set<string>();',
    '',
    'const far = (a: Vec, b: Vec) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);',
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
    'function cost(from: Vec, stops: Vec[]): number {',
    '  let total = 0;',
    '  let at = from;',
    '  for (const stop of stops) {',
    '    total += far(at, stop);',
    '    at = stop;',
    '  }',
    '  return total;',
    '}',
    '',
    'function order(from: Vec, stops: Vec[]): Vec[] {',
    '  const left = stops.slice();',
    '  let tour: Vec[] = [];',
    '  let at = from;',
    '  while (left.length > 0) {',
    '    let best = 0;',
    '    for (let i = 1; i < left.length; i++) if (far(at, left[i]) < far(at, left[best])) best = i;',
    '    at = left[best];',
    '    tour.push(at);',
    '    left.splice(best, 1);',
    '  }',
    '  for (let i = 0; i < tour.length - 1; i++) {',
    '    for (let j = i + 1; j < tour.length; j++) {',
    '      const swapped = tour',
    '        .slice(0, i)',
    '        .concat(tour.slice(i, j + 1).reverse(), tour.slice(j + 1));',
    '      if (cost(from, swapped) < cost(from, tour)) tour = swapped;',
    '    }',
    '  }',
    '  return tour;',
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
    'let rack = 0;',
    'while (crates.length > 0) {',
    '  const load: ItemKind[] = [];',
    '  while (crates.length > 0 && (rack === 0 || load.length < rack)) {',
    '    let best = 0;',
    '    for (let i = 1; i < crates.length; i++) {',
    '      if (far(pos(), crates[i].at) < far(pos(), crates[best].at)) best = i;',
    '    }',
    '    const crate = crates[best];',
    '    goTo(crate.at);',
    '    if (pickup(crate.kind) === 0) {',
    '      rack = load.length;',
    '      break;',
    '    }',
    '    crates.splice(best, 1);',
    '    load.push(crate.kind);',
    '  }',
    '  if (load.length === 0) break;',
    '',
    '  const stops: Vec[] = [];',
    '  for (const kind of load) {',
    '    const depot = depots.get(kind);',
    '    if (depot && !stops.some((s) => s.x === depot.x && s.y === depot.y)) stops.push(depot);',
    '  }',
    '  for (const stop of order(pos(), stops)) {',
    '    goTo(stop);',
    '    for (const kind of new Set(load)) {',
    '      const depot = depots.get(kind);',
    '      if (depot && depot.x === stop.x && depot.y === stop.y) drop(kind, inventory(kind));',
    '    }',
    '  }',
    '}',
  ].join('\n'),
};
