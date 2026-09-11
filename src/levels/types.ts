import type { CostOverrides, Objective, Sim, World } from '../engine/index.ts';

export interface LevelFact {
  label: string;
  value: string;
}

export interface LevelDef {
  id: string;
  world: number;
  index: number;
  title: string;
  brief: string;
  facts?: LevelFact[];
  board?: { fixed: string[]; redrawn: string[] };
  hardware: string[];
  build(seed: number): World;
  objectives: Objective[];
  seeds: number[];
  par: { ticks: number };
  graded?: boolean;
  starter: string;
  hints: string[];
  docs?: string[];
  bonus?: Objective[];
  costs?: CostOverrides;
  budget?: { maxTicks?: number; maxOps?: number };
}

export interface ReferenceSolution {
  levelId: string;
  run(sim: Sim, botId: number): void;
  source: string;
}

export interface WorldMeta {
  id: number;
  name: string;
  subtitle: string;
  blurb: string;
  accent: string;
}
