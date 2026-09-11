import type { Sim, Vec } from '../../../engine/index.ts';
import { Dir } from '../../../engine/index.ts';

export type Clocks = Record<number, number>;

export function spend(clocks: Clocks, id: number, dt: number): void {
  clocks[id] = (clocks[id] ?? 0) + dt;
}

export function at(sim: Sim, id: number, target: Vec): boolean {
  const pos = sim.pos(id);
  return pos.x === target.x && pos.y === target.y;
}

export function holdUntil(sim: Sim, clocks: Clocks, id: number, t: number): void {
  const now = clocks[id] ?? 0;
  if (t <= now) return;
  sim.wait(id, t - now);
  spend(clocks, id, t - now);
}

export function stepToward(sim: Sim, clocks: Clocks, id: number, target: Vec): void {
  const pos = sim.pos(id);
  const options: Dir[] = [];
  if (target.y > pos.y) options.push(Dir.South);
  else if (target.y < pos.y) options.push(Dir.North);
  if (target.x > pos.x) options.push(Dir.East);
  else if (target.x < pos.x) options.push(Dir.West);
  for (const dir of options) {
    if (!sim.canMove(id, dir)) continue;
    sim.move(id, dir);
    spend(clocks, id, 1);
    return;
  }
  sim.wait(id, 1);
  spend(clocks, id, 1);
}

export function walkTo(sim: Sim, clocks: Clocks, id: number, target: Vec, guard = 600): void {
  for (let i = 0; i < guard && !at(sim, id, target); i++) stepToward(sim, clocks, id, target);
}

export function runDir(sim: Sim, clocks: Clocks, id: number, dir: Dir, n: number): void {
  let done = 0;
  for (let i = 0; i < n + 400 && done < n; i++) {
    if (sim.canMove(id, dir)) {
      sim.move(id, dir);
      done++;
    } else {
      sim.wait(id, 1);
    }
    spend(clocks, id, 1);
  }
}
