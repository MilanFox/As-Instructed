import type { Medal } from '../engine/index.ts';
import type { LibraryUsage } from '../runtime/index.ts';

export interface LibraryRevision {
  id: string;
  source: string;
  at: number;
  reason: 'seed' | 'publish' | 'edit' | 'revert';
  fromLevel?: string;
  added?: string[];
}

export interface PublishedFunction {
  name: string;
  fromLevel: string;
  at: number;
}

export interface LevelProfile {
  levelId: string;
  key: string;
  passed: boolean;
  ticks: number;
  medal: Medal;
  parTicks: number;
  usage: LibraryUsage;
  imports: string[];
  at: number;
}

export type RegressionState =
  'pending' | 'running' | 'nominal' | 'improved' | 'degraded' | 'broken' | 'skipped';

export interface RegressionEntry {
  levelId: string;
  state: RegressionState;
  beforeTicks?: number;
  afterTicks?: number;
  beforeMedal?: Medal;
  afterMedal?: Medal;
  note?: string;
  failure?: { message: string; file?: 'program' | 'lib'; line?: number };
  seeds?: number[];
  cached?: boolean;
}

export interface RegressionRun {
  revisionId: string;
  startedAt: number;
  finishedAt?: number;
  entries: RegressionEntry[];
  cancelled?: boolean;
}

export interface CachedRun {
  key: string;
  levelId: string;
  passed: boolean;
  ticks: number;
  medal: Medal;
  usage: LibraryUsage;
  at: number;
  failure?: { message: string; file?: 'program' | 'lib'; line?: number };
}

export interface Discrepancy {
  id: string;
  levelId: string;
  seed: number;
  raisedAt: number;
  seen?: boolean;
  closed?: boolean;
  resolved?: boolean;
}

export interface LibrarySave {
  version: number;
  unlocked: boolean;
  briefed: boolean;
  source: string;
  revisions: LibraryRevision[];
  lastKnownGood?: string;
  published: PublishedFunction[];
  profiles: Record<string, LevelProfile>;
  cache: Record<string, CachedRun>;
  discrepancies: Discrepancy[];
  publishDeclined: string[];
  publishMuted: boolean;
  discrepanciesMuted: boolean;
  updatedAt: number;
}

export interface LevelFacts {
  id: string;
  title: string;
  world: number;
  parTicks: number;
  seeds: number[];
  graded?: boolean;
}

export interface ProgressFacts {
  levelId: string;
  completed: boolean;
  medal: Medal;
  bestTicks?: number;
  code?: string;
}
