import { reviveTrace } from '../engine/index.ts';
import { cancelledFailure, timeoutFailure } from './errors.ts';
import type { RunRequest, RunResponse, WorkerOutbound, WorkerRequestMessage } from './protocol.ts';
import { WORKER_TIMEOUT_MS } from './protocol.ts';

export interface WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export interface RunnerOptions {
  timeoutMs?: number;
  createWorker?: () => WorkerLike;
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

  get busy(): boolean {
    return this.pending !== null;
  }

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

  cancel(): void {
    const pending = this.pending;
    if (!pending) return;
    this.abort(pending.requestId, { ok: false, error: cancelledFailure() });
  }

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
