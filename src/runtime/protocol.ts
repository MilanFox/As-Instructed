import type { CostOverrides } from '../engine/index.ts';
import type { Trace, Verdict } from '../engine/index.ts';

/**
 * The message contract between the main thread and the simulation worker.
 *
 * Types only. The worker itself lives in `src/runtime/worker.ts` and is owned by the RUNTIME
 * agent; nothing here may import a browser API.
 */

/** Main thread -> worker. */
export interface RunRequest {
  /** The player's TypeScript source, exactly as typed. */
  code: string;
  levelId: string;
  /** Every seed must pass. `seeds.length > 1` means the level demands a general solution. */
  seeds: number[];
  costOverrides?: CostOverrides;
  /** Overrides the level's own budget. Mostly for tests. */
  maxTicks?: number;
  maxOps?: number;
}

/** One simulated run of the player's program against one seed. */
export interface PerSeedResult {
  seed: number;
  passed: boolean;
  ticks: number;
  ops: number;
  objectives: { id: string; label: string; met: boolean; progress?: [number, number] }[];
  failure?: RuntimeFailure;
}

export interface RuntimeFailure {
  kind: 'compile' | 'runtime' | 'halt' | 'oplimit' | 'timeout';
  /** Player-facing. Already mapped to the user's coordinates; safe to render verbatim. */
  message: string;
  /** 1-based, in the player's source (wrapper offset already subtracted). */
  line?: number;
  /** 1-based. */
  column?: number;
  stack?: string;
}

export type RunResponse =
  | {
      ok: true;
      results: PerSeedResult[];
      /** Aggregate verdict across all seeds. */
      verdict: Verdict;
      /** Trace of the FIRST seed only — the one the renderer plays back. */
      trace: Trace;
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
