import type { CostOverrides, FailureCode, Vec } from '../engine/index.ts';
import type { ObjectiveReport, Trace, Verdict } from '../engine/index.ts';

/**
 * The message contract between the main thread and the simulation worker.
 *
 * Types only. The worker itself lives in `src/runtime/sim.worker.ts` and is owned by the RUNTIME
 * agent; nothing here may import a browser API.
 */

/** Main thread -> worker. */
export interface RunRequest {
  /** The player's TypeScript source, exactly as typed. Carried for diagnostics, never executed. */
  code: string;
  /**
   * The emitted JavaScript. Monaco's TypeScript worker only exists on the main thread, so the
   * host transpiles and the worker executes. See `compile.ts`.
   */
  js: string;
  /**
   * `lineMap[emittedLine - 1]` is the player's 1-based source line. Produced by `compile.ts` from
   * the emit's source map; without it, every line the emitter erased (an `interface`, a `type`)
   * shifts every error message below it.
   */
  lineMap?: number[];
  levelId: string;
  /** Every seed must pass. `seeds.length > 1` means the level demands a general solution. */
  seeds: number[];
  costOverrides?: CostOverrides;
  /** Overrides the level's own budget. Mostly for tests. */
  maxTicks?: number;
  maxOps?: number;
  /**
   * The player's shared library, already emitted. Absent when they have none, which is every run
   * before the end of World 3. See `modules.ts`; the worker links it in front of `js`.
   */
  library?: LibraryRequest;
  /**
   * Main-thread watchdog budget for this run. Read by the host, never by the worker — a worker
   * that has hung cannot time itself out. Defaults to `WORKER_TIMEOUT_MS`.
   */
  timeoutMs?: number;
}

/** The compiled shared library, as the worker needs it. */
export interface LibraryRequest {
  /** Emitted JavaScript for `lib.ts`, `export` keywords and all. */
  js: string;
  /** `lineMap[emittedLine - 1]` is the 1-based line in `lib.ts`. Same contract as `RunRequest`. */
  lineMap?: number[];
  /** Identifies this exact library build for the regression cache. Opaque to the worker. */
  hash?: string;
}

/**
 * Ticks charged inside library calls during one seed.
 *
 * `ticks` counts only *outermost* library calls, so a library function that calls another cannot
 * report more ticks than the level spent. `calls` is per export and counts nesting, which is what
 * the Refactor screen needs to say "this costs 18 ticks a call".
 */
export interface LibraryUsage {
  ticks: number;
  calls: Record<string, { calls: number; ticks: number }>;
}

/** One simulated run of the player's program against one seed. */
export interface PerSeedResult {
  seed: number;
  passed: boolean;
  ticks: number;
  ops: number;
  objectives: ObjectiveReport[];
  failure?: RuntimeFailure;
  /** Present whenever a library was linked, even if the program never called it. */
  libraryUsage?: LibraryUsage;
}

export interface RuntimeFailure {
  /**
   * How the run ended, at the granularity the UI treats differently. `'cancelled'` means the
   * player pressed Stop; nothing went wrong and it should not be reported as a failure.
   */
  kind: 'compile' | 'runtime' | 'halt' | 'oplimit' | 'timeout' | 'cancelled';
  /** Player-facing. Already mapped to the user's coordinates; safe to render as it stands. */
  message: string;
  /** The engine's own classification, for iconography and `Verdict.failure`. */
  code?: FailureCode;
  /**
   * Which of the player's two files `line` refers to. Absent means `program`, which keeps every
   * pre-library failure exactly as it was.
   */
  file?: 'program' | 'lib';
  /** 1-based, in the file named by `file` (wrapper offset already subtracted). */
  line?: number;
  /** 1-based. */
  column?: number;
  /** Where in the world it happened, when the engine knows. */
  at?: Vec;
  /** Player frames only, already remapped. Never a raw browser stack. */
  stack?: string;
}

export type RunResponse =
  | {
      ok: true;
      results: PerSeedResult[];
      /** Aggregate verdict across all seeds. Worst case wins: it is the honest score. */
      verdict: Verdict;
      /**
       * The trace the renderer plays back: the first *failing* seed when there is one, otherwise
       * the first seed. Handing back seed 1's trace after seed 3 failed would show the player a
       * run that worked, which is the whole reason `traceSeed` exists.
       */
      trace: Trace;
      /** Which seed `trace` was produced from. */
      traceSeed: number;
      /** The first seed that failed, when any did. */
      failedSeed?: number;
      /**
       * Library attribution from the seed that set the score. Absent when no library was linked.
       */
      libraryUsage?: LibraryUsage;
    }
  | { ok: false; error: RuntimeFailure };

/** Envelope so the worker can multiplex and the main thread can drop stale replies. */
export interface WorkerRequestMessage {
  type: 'run';
  requestId: number;
  request: RunRequest;
}

export interface WorkerResponseMessage {
  type: 'result';
  requestId: number;
  response: RunResponse;
}

export type WorkerInbound = WorkerRequestMessage;
export type WorkerOutbound = WorkerResponseMessage;

/** Main-thread watchdog. See DESIGN.md §3. */
export const WORKER_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Player API specification
// ---------------------------------------------------------------------------

export interface ApiParamSpec {
  name: string;
  /** TypeScript type as a source string, e.g. `'Dir'` or `'number | undefined'`. */
  type: string;
  optional?: boolean;
  /** Literal TS source for the default, e.g. `'1'`. */
  defaultValue?: string;
  doc: string;
}

export const ApiCategory = {
  Movement: 'movement',
  Sensing: 'sensing',
  Inventory: 'inventory',
  Terraforming: 'terraforming',
  Machines: 'machines',
  Navigation: 'navigation',
  Signal: 'signal',
  Swarm: 'swarm',
  Output: 'output',
} as const;
export type ApiCategory = (typeof ApiCategory)[keyof typeof ApiCategory];

/**
 * Machine-readable description of one player-callable function.
 *
 * Three consumers depend on this being exact:
 *  - RUNTIME binds the real implementations and checks it has one per entry.
 *  - UI renders the docs panel from `doc` / `example`.
 *  - Monaco generates the ambient `.d.ts` from `name`, `params` and `returns`.
 */
export interface ApiFunctionSpec {
  name: string;
  params: ApiParamSpec[];
  /** TypeScript return type as a source string. */
  returns: string;
  /** One paragraph, clean and factual. Jokes belong in mission briefs, never here. DESIGN.md §1. */
  doc: string;
  /** Runnable snippet, 1-6 lines, no comments beyond a short trailing one. */
  example: string;
  /** Ticks charged per call. 0 means sensing. `'n'` means the cost depends on an argument. */
  cost: number | string;
  /** `LevelDef.id` of the level that installs this hardware. */
  unlockedBy: string;
  world: number;
  category: ApiCategory;
  /** Ambient values (types/enums) the signature references, so Monaco emits them too. */
  requiresTypes?: string[];
}

/** Ambient type declarations injected alongside the functions. */
export interface ApiTypeSpec {
  name: string;
  /** Full TypeScript declaration source. */
  declaration: string;
  doc: string;
}

export interface PlayerApiSpec {
  version: number;
  types: ApiTypeSpec[];
  functions: ApiFunctionSpec[];
}
