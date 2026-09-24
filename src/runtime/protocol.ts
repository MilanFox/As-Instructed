import type { CostOverrides, FailureCode, Vec } from '../engine/index.ts';
import type { ObjectiveReport, Trace, Verdict } from '../engine/index.ts';

export interface RunRequest {
  code: string;
  js: string;
  lineMap?: number[];
  levelId: string;
  seeds: number[];
  costOverrides?: CostOverrides;
  maxTicks?: number;
  maxOps?: number;
  library?: LibraryRequest;
  timeoutMs?: number;
  debug?: boolean;
}

export interface LibraryRequest {
  js: string;
  lineMap?: number[];
  hash?: string;
}

export interface LibraryUsage {
  ticks: number;
  calls: Record<string, { calls: number; ticks: number }>;
}

export interface TraceShape {
  moves: number;
  printed: boolean;
  markedUnread: boolean;
  sensed: number;
}

export function traceShape(trace: Trace): TraceShape {
  const shape: TraceShape = { moves: 0, printed: false, markedUnread: false, sensed: 0 };
  let marked = false;
  let readBack = false;

  for (const event of trace.events) {
    switch (event.kind) {
      case 'move': {
        if (event.ok) shape.moves += 1;
        break;
      }
      case 'mark': {
        if (event.text !== null) marked = true;
        break;
      }
      case 'sense': {
        if (event.name === 'readMark') readBack = true;
        shape.sensed += event.count;
        break;
      }
      case 'print': {
        shape.printed = true;
        break;
      }
      default:
        break;
    }
  }

  shape.markedUnread = marked && !readBack;
  return shape;
}

export interface PerSeedResult {
  seed: number;
  passed: boolean;
  ticks: number;
  ops: number;
  objectives: ObjectiveReport[];
  shape: TraceShape;
  bonus?: ObjectiveReport[];
  failure?: RuntimeFailure;
  libraryUsage?: LibraryUsage;
}

export interface RuntimeFailure {
  kind: 'compile' | 'runtime' | 'halt' | 'oplimit' | 'timeout' | 'cancelled';
  message: string;
  code?: FailureCode;
  file?: 'program' | 'lib';
  line?: number;
  column?: number;
  at?: Vec;
  stack?: string;
}

export type RunResponse =
  | {
      ok: true;
      results: PerSeedResult[];
      verdict: Verdict;
      trace: Trace;
      traceSeed: number;
      failedSeed?: number;
      libraryUsage?: LibraryUsage;
    }
  | { ok: false; error: RuntimeFailure };

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

export interface RunProgress {
  boardsDone: number;
  boards: number;
}

export interface WorkerProgressMessage extends RunProgress {
  type: 'progress';
  requestId: number;
}

export type WorkerInbound = WorkerRequestMessage;
export type WorkerOutbound = WorkerResponseMessage | WorkerProgressMessage;

export const WORKER_TIMEOUT_MS = 5000;

export interface ApiParamSpec {
  name: string;
  type: string;
  optional?: boolean;
  rest?: boolean;
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

export interface ApiFunctionSpec {
  name: string;
  params: ApiParamSpec[];
  returns: string;
  doc: string;
  crewDoc?: string;
  example: string;
  cost: number | string;
  unlockedBy: string;
  world: number;
  category: ApiCategory;
  requiresTypes?: string[];
}

export interface ApiTypeSpec {
  name: string;
  declaration: string;
  doc: string;
}

export interface PlayerApiSpec {
  version: number;
  types: ApiTypeSpec[];
  functions: ApiFunctionSpec[];
}
