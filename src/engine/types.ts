import type { Rng } from './rng.ts';

export interface Vec {
  x: number;
  y: number;
}

export const Dir = {
  North: 0,
  East: 1,
  South: 2,
  West: 3,
} as const;
export type Dir = (typeof Dir)[keyof typeof Dir];

export const ALL_DIRS: readonly Dir[] = [Dir.North, Dir.East, Dir.South, Dir.West];

export const Terrain = {
  Void: 'void',
  Floor: 'floor',
  Wall: 'wall',
  Pad: 'pad',
  Regolith: 'regolith',
  Soil: 'soil',
  Rock: 'rock',
  Ore: 'ore',
  Rubble: 'rubble',
  Ice: 'ice',
  Pit: 'pit',
  Cable: 'cable',
  Depot: 'depot',
  Conveyor: 'conveyor',
} as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

export interface TerrainProps {
  walkable: boolean;
  opaque: boolean;
  mineable: boolean;
  minesTo: Terrain;
  yields: ItemKind | null;
  plantable: boolean;
  lethal: boolean;
}

export const ItemKind = {
  Regolith: 'regolith',
  Stone: 'stone',
  Ore: 'ore',
  Ice: 'ice',
  Scrap: 'scrap',
  Seed: 'seed',
  Crop: 'crop',
  Crate: 'crate',
  Part: 'part',
  Cell: 'cell',
  Chip: 'chip',
} as const;
export type ItemKind = (typeof ItemKind)[keyof typeof ItemKind];

export interface Tile {
  terrain: Terrain;
  growth?: number;
  maxGrowth?: number;
  crop?: ItemKind;
  occupant?: number;
  mark?: string;
  meta?: Record<string, number | string | boolean>;
}

export interface ItemStack {
  kind: ItemKind;
  count: number;
}

export interface GroundStack extends ItemStack {
  at: Vec;
}

export const MachineKind = {
  Door: 'door',
  Lever: 'lever',
  Furnace: 'furnace',
  Press: 'press',
  Sink: 'sink',
  Source: 'source',
  Node: 'node',
  Antenna: 'antenna',
  Charger: 'charger',
  Router: 'router',
} as const;
export type MachineKind = (typeof MachineKind)[keyof typeof MachineKind];

export const MANUAL_ONLY = 'manual';

export const FED_BY = 'fed:';

export interface Machine {
  id: string;
  kind: MachineKind;
  at: Vec;
  state: string;
  inventory: ItemStack[];
  vars: Record<string, number>;
  facing?: Dir;
  cycle?: string[];
  links?: Vec[];
}

export interface Message {
  from: number;
  body: string | number;
  t: number;
}

export interface Bot {
  id: number;
  name: string;
  at: Vec;
  facing: Dir;
  clock: number;
  alive: boolean;
  inventory: ItemStack[];
  capacity: number;
  fuel: number;
  fuelMax: number;
  vars: Record<string, number>;
  inbox: Message[];
}

export function usesFuel(world: World): boolean {
  return world.bots.some((bot) => Number.isFinite(bot.fuelMax));
}

export interface World {
  readonly w: number;
  readonly h: number;
  tiles: Tile[];
  bots: Bot[];
  items: GroundStack[];
  machines: Machine[];
  tick: number;
  rng: Rng;
  vars: Record<string, number>;
}
