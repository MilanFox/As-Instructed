import type { Sim, TileView, Vec } from '../../../engine/index.ts';
import { Dir } from '../../../engine/index.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx.
 *
 * Movement and survey routines shared by the World 3 reference solutions. Everything here goes
 * through the same public `Sim` surface a player's program gets: no reference solution reads
 * `sim.world`, so the tick counts these produce are honest par candidates.
 */

export const key = (at: Vec): string => `${at.x},${at.y}`;

/** Runs along x, then along y. Every World 3 yard has an open interior, so this always arrives. */
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

/**
 * Walks every third row of the yard, reading the row above and the row below at every step.
 * Sensing is free, so three rows of survey cost one row of walking.
 */
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

/** Index of the entry in `options` closest to `from`, or -1 when there is nothing to choose. */
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

/** Length of an open tour that starts at `from` and visits `stops` in order. */
export function tourCost(from: Vec, stops: readonly Vec[]): number {
  let total = 0;
  let at = from;
  for (const stop of stops) {
    total += distance(at, stop);
    at = stop;
  }
  return total;
}

/** Nearest-neighbour ordering of `stops`, starting from `from`. */
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

/** One improving pass of 2-opt over an open tour. Cheap, and enough for a four-stop drop round. */
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
