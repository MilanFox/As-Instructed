import type { Medal } from '../engine/index.ts';
import type { LibraryUsage } from '../runtime/index.ts';

/**
 * The Shared Subroutines Repository, as data.
 *
 * Everything the metagame knows lives in one object with one version number. The rule inherited
 * from `src/game/save.ts` applies here with more force, because there is only one copy of the
 * library and it is the player's own writing: **no read path may ever discard source.** A shape
 * that cannot be understood is rescued string by string, never dropped.
 */

/** One saved state of `lib.ts`. Revisions are what makes a revert possible at all. */
export interface LibraryRevision {
  /** Content hash of `source`. Stable, and doubles as the revision's identity. */
  id: string;
  source: string;
  /** Epoch ms. */
  at: number;
  /**
   * Why this revision exists. `publish` and `revert` are worth naming in the history; `edit` is
   * everything else.
   */
  reason: 'seed' | 'publish' | 'edit' | 'revert';
  /** Set on a `publish` revision: the work order the code came from. */
  fromLevel?: string;
  /** Names the revision published, for the history line. */
  added?: string[];
}

/** A function the player put into the repository, and where it came from. */
export interface PublishedFunction {
  name: string;
  /** `LevelDef.id` of the work order the code was lifted from. */
  fromLevel: string;
  at: number;
}

/**
 * What one completed work order cost, and how much of that was the library's doing.
 *
 * Written only by a run that actually happened. Nothing in the Refactor screen is allowed to come
 * from anywhere else: an estimate that is really a guess is worse than no number.
 */
export interface LevelProfile {
  levelId: string;
  /** The cache key the numbers were measured under. */
  key: string;
  passed: boolean;
  ticks: number;
  medal: Medal;
  /** `LevelDef.par.ticks` at the time of measurement. */
  parTicks: number;
  /** Ticks charged inside library calls, and the per-export breakdown. */
  usage: LibraryUsage;
  /** Library names this level's source imports. Static; survives even when no run has happened. */
  imports: string[];
  at: number;
}

/** How one re-run of a completed work order turned out. */
export type RegressionState =
  'pending' | 'running' | 'nominal' | 'improved' | 'degraded' | 'broken' | 'skipped';

export interface RegressionEntry {
  levelId: string;
  state: RegressionState;
  /** Ticks before the library changed. */
  beforeTicks?: number;
  afterTicks?: number;
  beforeMedal?: Medal;
  afterMedal?: Medal;
  /** Player-facing, already in voice. */
  note?: string;
  /** Failure detail when `broken`. */
  failure?: { message: string; file?: 'program' | 'lib'; line?: number };
  /** Seeds that were re-run. */
  seeds?: number[];
  /** True when the answer came from the cache rather than a fresh run. */
  cached?: boolean;
}

export interface RegressionRun {
  /** Library revision the suite is checking. */
  revisionId: string;
  startedAt: number;
  finishedAt?: number;
  entries: RegressionEntry[];
  /** Set when the player stopped it, or navigated away and it was abandoned. */
  cancelled?: boolean;
}

/** A cached verdict for one (level, level source, library) triple. */
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

/**
 * A closed work order that stopped working.
 *
 * The site has no word for this and no process for it, so it borrows the one it has: a discrepancy
 * is raised, and raising it is the extent of anybody's remit.
 */
export interface Discrepancy {
  id: string;
  levelId: string;
  /** The seed it was re-run against — deliberately outside the level's own `seeds`. */
  seed: number;
  raisedAt: number;
  /** Player has read it. It stays in the list; the badge goes away. */
  seen?: boolean;
  /** Player closed it, with or without fixing anything. */
  closed?: boolean;
  /** Set once the level passes on this seed again. */
  resolved?: boolean;
}

export interface LibrarySave {
  version: number;
  /** False until the end of World 3. See `unlock.ts`. */
  unlocked: boolean;
  /** The player has seen the unlock memo. */
  briefed: boolean;
  /** Current contents of `lib.ts`. Sacred. */
  source: string;
  /** Newest last. Capped; the oldest are dropped, never the newest. */
  revisions: LibraryRevision[];
  /** Revision id of the last library that passed its regression suite. The revert target. */
  lastKnownGood?: string;
  published: PublishedFunction[];
  profiles: Record<string, LevelProfile>;
  cache: Record<string, CachedRun>;
  discrepancies: Discrepancy[];
  /** Work orders the player has told us never to offer publishing on again. */
  publishDeclined: string[];
  /** The player switched the whole publish prompt off. Reversible from the Library panel. */
  publishMuted: boolean;
  /** The player switched discrepancies off. Reversible. */
  discrepanciesMuted: boolean;
  updatedAt: number;
}

/** What the metagame needs to know about a work order. Supplied by the host; never imported. */
export interface LevelFacts {
  id: string;
  title: string;
  world: number;
  parTicks: number;
  seeds: number[];
  /**
   * Whether this work order carries a medal. Defaults to `true`. DESIGN.md §7.
   *
   * `false` makes `parTicks` a price rather than a budget, so the Refactor screen must not offer
   * "save two ticks and this goes silver to gold" against it — there is no silver and no gold, and
   * the saving is not available to any correct program anyway.
   */
  graded?: boolean;
}

/** What the metagame needs to know about the player's progress. Supplied by the host. */
export interface ProgressFacts {
  levelId: string;
  completed: boolean;
  medal: Medal;
  bestTicks?: number;
  /** The source the player last had in the editor for this work order. */
  code?: string;
}
