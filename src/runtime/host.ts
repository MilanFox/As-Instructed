import { reviveTrace } from '../engine/index.ts';
import { cancelledFailure, timeoutFailure } from './errors.ts';
import type { RunRequest, RunResponse, WorkerOutbound, WorkerRequestMessage } from './protocol.ts';
import { WORKER_TIMEOUT_MS } from './protocol.ts';

/**
 * Main-thread ownership of the simulation worker.
 *
 * The watchdog here is the *only* defence against `while (true) {}` with no API call in it: the
 * engine's tick and op budgets never get a chance to fire because the program never calls the
 * engine (DESIGN.md §3). A hung program must always be recoverable (§10.6), so the recovery path
 * is: terminate, replace the worker immediately, resolve the caller with a `timeout` failure.
 *
 * Replacing the worker eagerly rather than lazily is what keeps the next Run warm — worker
 * start-up is the one avoidable latency between pressing Run and seeing a result.
 */

/** The slice of `Worker` this class uses. Narrow on purpose, so tests can supply a fake. */
export interface WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export interface RunnerOptions {
  /** Watchdog budget. A per-run `RunRequest.timeoutMs` overrides it. */
  timeoutMs?: number;
  /** Injected for tests. Defaults to the real `sim.worker.ts`. */
  createWorker?: () => WorkerLike;
  /** Spin the worker up on construction so the first Run has no start-up cost. Default true. */
  warm?: boolean;
}

interface Pending {
  requestId: number;
  settle: (response: RunResponse) => void;
  timer: ReturnType<typeof setTimeout>;
  timeoutMs: number;
}

function defaultWorkerFactory(): WorkerLike {
  return new Worker(new URL('./sim.worker.ts', import.meta.url), {
    type: 'module',
    name: 'bootstrap-sim',
  });
}

export class Runner {
  private readonly createWorker: () => WorkerLike;
  private readonly defaultTimeoutMs: number;
  private worker: WorkerLike | null = null;
  private pending: Pending | null = null;
  private nextRequestId = 1;
  private disposed = false;

  constructor(options: RunnerOptions = {}) {
    this.createWorker = options.createWorker ?? defaultWorkerFactory;
    this.defaultTimeoutMs = options.timeoutMs ?? WORKER_TIMEOUT_MS;
    if (options.warm !== false) this.warm();
  }

  /** True while a run is in flight. */
  get busy(): boolean {
    return this.pending !== null;
  }

  /** Starts the worker if it is not already running. Safe to call repeatedly. */
  warm(): void {
    if (this.disposed || this.worker) return;
    const worker = this.createWorker();
    worker.onmessage = (event: MessageEvent): void => {
      this.onMessage(event.data as WorkerOutbound);
    };
    worker.onerror = (event: ErrorEvent): void => {
      this.onWorkerError(event);
    };
    this.worker = worker;
  }

  /**
   * Runs one request. A second `run` while one is in flight supersedes the first: the earlier
   * caller resolves as cancelled, which is what pressing Run twice should mean.
   */
  run(request: RunRequest): Promise<RunResponse> {
    if (this.disposed) throw new Error('Runner has been disposed.');
    if (this.pending) this.cancel();
    this.warm();

    const worker = this.worker;
    if (!worker) {
      return Promise.resolve({
        ok: false as const,
        error: {
          kind: 'runtime' as const,
          message: 'The simulator could not be started. Reload the page to try again.',
        },
      });
    }

    const requestId = this.nextRequestId++;
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;

    return new Promise<RunResponse>((resolve) => {
      const timer = setTimeout(() => {
        this.abort(requestId, { ok: false, error: timeoutFailure(timeoutMs) });
      }, timeoutMs);

      this.pending = { requestId, settle: resolve, timer, timeoutMs };

      const message: WorkerRequestMessage = { type: 'run', requestId, request };
      try {
        worker.postMessage(message);
      } catch (error) {
        this.abort(requestId, {
          ok: false,
          error: {
            kind: 'runtime',
            message:
              'The simulator refused the request. This is a bug in the game: ' +
              `${error instanceof Error ? error.message : String(error)}`,
          },
        });
      }
    });
  }

  /** Stops the current run. The pending promise resolves with a `cancelled` failure. */
  cancel(): void {
    const pending = this.pending;
    if (!pending) return;
    this.abort(pending.requestId, { ok: false, error: cancelledFailure() });
  }

  /** Tears the worker down for good. The Runner cannot be reused afterwards. */
  dispose(): void {
    this.cancel();
    this.disposed = true;
    this.worker?.terminate();
    this.worker = null;
  }

  private onMessage(message: WorkerOutbound): void {
    const pending = this.pending;
    if (!pending || !message || message.type !== 'result') return;
    if (message.requestId !== pending.requestId) return;

    clearTimeout(pending.timer);
    this.pending = null;

    const response = message.response;
    if (response.ok) reviveTrace(response.trace);
    pending.settle(response);
  }

  /**
   * An uncaught error inside the worker leaves it in an unknown state, so it is replaced rather
   * than reused. The player still gets a message instead of a run that never returns.
   */
  private onWorkerError(event: ErrorEvent): void {
    const pending = this.pending;
    const message =
      typeof event?.message === 'string' && event.message.length > 0
        ? event.message
        : 'unknown error';
    if (!pending) {
      this.replaceWorker();
      return;
    }
    this.abort(pending.requestId, {
      ok: false,
      error: {
        kind: 'runtime',
        message: `The simulator stopped unexpectedly: ${message}. Your code was not the cause.`,
      },
    });
  }

  /**
   * The recovery path. The worker may be mid-infinite-loop and will never answer again, so it is
   * killed outright and a fresh one takes its place before the caller is told anything.
   */
  private abort(requestId: number, response: RunResponse): void {
    const pending = this.pending;
    if (!pending || pending.requestId !== requestId) return;

    clearTimeout(pending.timer);
    this.pending = null;
    this.replaceWorker();
    pending.settle(response);
  }

  private replaceWorker(): void {
    const worker = this.worker;
    this.worker = null;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      try {
        worker.terminate();
      } catch {
        // A worker that is already gone is exactly the state we wanted.
      }
    }
    if (!this.disposed) this.warm();
  }
}
