import type { Sim, TileView, Vec } from '../../../engine/index.ts';
import { Dir } from '../../../engine/index.ts';

export const key = (at: Vec): string => `${at.x},${at.y}`;

export function goTo(sim: Sim, botId: number, target: Vec): void {
  let at = sim.pos(botId);
  while (at.x !== target.x) {
    sim.move(botId, at.x < target.x ? Dir.East : Dir.West);
    at = sim.pos(botId);
  }
  while (at.y !== target.y) {
    sim.move(botId, at.y < target.y ? Dir.South : Dir.North);
    at = sim.pos(botId);
  }
}

export function surveyYard(sim: Sim, botId: number, note: (tile: TileView) => void): void {
  const read = (): void => {
    note(sim.scan(botId));
    note(sim.scan(botId, Dir.North));
    note(sim.scan(botId, Dir.South));
  };
  while (sim.canMove(botId, Dir.West)) sim.move(botId, Dir.West);
  while (sim.canMove(botId, Dir.North)) sim.move(botId, Dir.North);
  let along: Dir = Dir.East;
  for (;;) {
    read();
    while (sim.canMove(botId, along)) {
      sim.move(botId, along);
      read();
    }
    if (!sim.canMove(botId, Dir.South)) break;
    sim.move(botId, Dir.South);
    if (!sim.canMove(botId, Dir.South)) break;
    sim.move(botId, Dir.South);
    if (sim.canMove(botId, Dir.South)) sim.move(botId, Dir.South);
    along = along === Dir.East ? Dir.West : Dir.East;
  }
}

export const distance = (a: Vec, b: Vec): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

export function nearestIndex(from: Vec, options: readonly Vec[]): number {
  let best = -1;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    if (!option) continue;
    const cost = distance(from, option);
    if (cost < bestCost) {
      bestCost = cost;
      best = i;
    }
  }
  return best;
}

export function tourCost(from: Vec, stops: readonly Vec[]): number {
  let total = 0;
  let at = from;
  for (const stop of stops) {
    total += distance(at, stop);
    at = stop;
  }
  return total;
}

export function nearestNeighbourTour(from: Vec, stops: readonly Vec[]): Vec[] {
  const remaining = stops.slice();
  const tour: Vec[] = [];
  let at = from;
  while (remaining.length > 0) {
    const i = nearestIndex(at, remaining);
    const next = remaining.splice(i, 1)[0];
    if (!next) break;
    tour.push(next);
    at = next;
  }
  return tour;
}

export function twoOpt(from: Vec, tour: readonly Vec[]): Vec[] {
  let best = tour.slice();
  let bestCost = tourCost(from, best);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = best
          .slice(0, i)
          .concat(best.slice(i, j + 1).reverse(), best.slice(j + 1));
        const cost = tourCost(from, candidate);
        if (cost < bestCost) {
          best = candidate;
          bestCost = cost;
          improved = true;
        }
      }
    }
  }
  return best;
}
