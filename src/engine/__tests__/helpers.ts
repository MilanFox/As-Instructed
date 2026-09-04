/**
 * Shared builders for the engine test-suite.
 *
 * Excluded from collection by `vitest.config.ts` (`**\/__tests__/**\/helpers.ts`), so this file
 * must never declare a `describe` or a `test`.
 */
import type {
  ItemStack,
  Machine,
  MachineKind,
  ObjectiveContext,
  SimOptions,
  Tile,
  Vec,
  World,
} from '../index.ts';
import {
  Dir,
  Sim,
  Terrain,
  addBot,
  addMachine,
  cloneWorld,
  createWorld,
  paintAscii,
  vec,
} from '../index.ts';

/** Narrows away the `| undefined` that `noUncheckedIndexedAccess` adds to every array read. */
export function must<T>(value: T | undefined | null, what = 'value'): NonNullable<T> {
  if (value === undefined || value === null) throw new Error(`expected ${what} to be present`);
  return value as NonNullable<T>;
}

/** One character per terrain, chosen so a map reads as a picture. */
export const ASCII_LEGEND: Record<string, Terrain | (() => Tile)> = {
  '.': Terrain.Floor,
  '#': Terrain.Wall,
  ' ': Terrain.Void,
  P: Terrain.Pad,
  R: Terrain.Rock,
  O: Terrain.Ore,
  U: Terrain.Rubble,
  G: Terrain.Regolith,
  S: Terrain.Soil,
  I: Terrain.Ice,
  X: Terrain.Pit,
  C: Terrain.Cable,
  V: Terrain.Conveyor,
};

export interface WorldOptions {
  seed?: number;
  capacity?: number;
  fill?: Terrain;
  inventory?: ItemStack[];
  /** Opts every bot into the fuel mechanic. Omit for the `Infinity` default. DESIGN.md §11 A1. */
  fuel?: number;
}

/**
 * A floor-filled world with `botCount` bots laid out left-to-right along the top row(s).
 * Bot ids are 0..botCount-1, matching their reading order.
 */
export function openWorld(w: number, h: number, botCount = 1, options: WorldOptions = {}): World {
  const world = createWorld({ w, h, seed: options.seed ?? 1, fill: options.fill ?? Terrain.Floor });
  for (let i = 0; i < botCount; i++) {
    addBot(world, {
      at: vec(i % w, Math.floor(i / w)),
      facing: Dir.East,
      capacity: options.capacity ?? 8,
      inventory: options.inventory?.map((s) => ({ kind: s.kind, count: s.count })) ?? [],
      ...(options.fuel === undefined ? {} : { fuel: options.fuel }),
    });
  }
  return world;
}

export interface AsciiOptions extends WorldOptions {
  legend?: Record<string, Terrain | (() => Tile)>;
  /** Bots are added in the order given, so bot #0 is `bots[0]`. */
  bots?: readonly Vec[];
}

/** Builds a world straight out of an ASCII picture. Rows must all be the same length. */
export function asciiWorld(rows: readonly string[], options: AsciiOptions = {}): World {
  const h = rows.length;
  const w = must(rows[0], 'first ascii row').length;
  const world = createWorld({ w, h, seed: options.seed ?? 1, fill: options.fill ?? Terrain.Floor });
  paintAscii(world, rows, options.legend ?? ASCII_LEGEND);
  for (const at of options.bots ?? []) {
    addBot(world, {
      at,
      facing: Dir.East,
      capacity: options.capacity ?? 8,
      inventory: options.inventory?.map((s) => ({ kind: s.kind, count: s.count })) ?? [],
      ...(options.fuel === undefined ? {} : { fuel: options.fuel }),
    });
  }
  return world;
}

export interface MachineSpec {
  id: string;
  kind: MachineKind;
  at: Vec;
  state?: string;
  cycle?: string[];
  links?: Vec[];
  vars?: Record<string, number>;
  inventory?: ItemStack[];
  facing?: Dir;
}

export function placeMachine(world: World, spec: MachineSpec): Machine {
  const machine: Machine = {
    id: spec.id,
    kind: spec.kind,
    at: vec(spec.at.x, spec.at.y),
    state: spec.state ?? 'idle',
    inventory: spec.inventory ?? [],
    vars: spec.vars ?? {},
  };
  if (spec.cycle) machine.cycle = spec.cycle.slice();
  if (spec.links) machine.links = spec.links.map((l) => vec(l.x, l.y));
  if (spec.facing !== undefined) machine.facing = spec.facing;
  return addMachine(world, machine);
}

export interface Rig {
  world: World;
  sim: Sim;
  initialWorld: World;
}

/** A world plus the Sim driving it, with the pre-run snapshot objectives need. */
export function rig(world: World, options: SimOptions = {}): Rig {
  const initialWorld = cloneWorld(world);
  return { world, sim: new Sim(world, options), initialWorld };
}

/** Runs `drive` against a fresh Sim and hands back everything an objective may look at. */
export function contextFor(world: World, drive?: (sim: Sim) => void): ObjectiveContext {
  const initialWorld = cloneWorld(world);
  const sim = new Sim(world);
  drive?.(sim);
  return { world: sim.world, trace: sim.finish(), initialWorld };
}

/** A live bot handle, for reading `clock`/`at` without spending an op on the Sim. */
export function bot(world: World, id = 0) {
  return must(
    world.bots.find((b) => b.id === id),
    `bot #${id}`,
  );
}
