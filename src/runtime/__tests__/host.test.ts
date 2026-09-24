import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Trace, Verdict } from '../../engine/index.ts';
import { Runner } from '../host.ts';
import type { WorkerLike } from '../host.ts';
import type { RunRequest, RunResponse, WorkerRequestMessage } from '../protocol.ts';
import { traceShape } from '../protocol.ts';

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  readonly received: WorkerRequestMessage[] = [];
  terminated = false;
  responsive = true;

  static readonly created: FakeWorker[] = [];

  constructor() {
    FakeWorker.created.push(this);
  }

  postMessage(message: unknown): void {
    const request = message as WorkerRequestMessage;
    this.received.push(request);
    if (!this.responsive) return;
    queueMicrotask(() => {
      this.reply(request.requestId, okResponse(request.request.seeds[0] ?? 1));
    });
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(requestId: number, response: RunResponse): void {
    this.onmessage?.({ data: { type: 'result', requestId, response } } as MessageEvent);
  }

  fail(message: string): void {
    this.onerror?.({ message } as ErrorEvent);
  }
}

function okResponse(seed: number): RunResponse {
  const trace = {
    initialWorld: { bots: [], machines: [], items: [], tiles: [], vars: {}, rng: { state: 1 } },
    events: [],
    keyframes: [],
    endTick: 6,
  } as unknown as Trace;
  const verdict = {
    passed: true,
    objectives: [],
    stats: { ticks: 6, ops: 6, seeds: 1, spend: {}, senses: {} },
  } as Verdict;
  return {
    ok: true,
    results: [{ seed, passed: true, ticks: 6, ops: 6, objectives: [], shape: traceShape(trace) }],
    verdict,
    trace,
    traceSeed: seed,
  };
}

const REQUEST: RunRequest = {
  code: 'move(Dir.East);',
  js: 'move(Dir.East);',
  levelId: 'w1-01',
  seeds: [1],
};

function makeRunner(timeoutMs = 100): Runner {
  return new Runner({ timeoutMs, createWorker: () => new FakeWorker() });
}

function latest(): FakeWorker {
  return FakeWorker.created[FakeWorker.created.length - 1] as FakeWorker;
}

beforeEach(() => {
  FakeWorker.created.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the happy path', () => {
  test('a worker is warm before the first run, so pressing Run costs no start-up', () => {
    const runner = makeRunner();
    expect(FakeWorker.created.length).toBe(1);
    expect(runner.busy).toBe(false);
    runner.dispose();
  });

  test('resolves with the worker response and reuses the same worker', async () => {
    const runner = makeRunner();
    const first = await runner.run(REQUEST);
    const second = await runner.run(REQUEST);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(FakeWorker.created.length).toBe(1);
    expect(latest().received.map((message) => message.requestId)).toEqual([1, 2]);
    expect(runner.busy).toBe(false);
    runner.dispose();
  });

  test('progress from the worker reaches the caller of this request only', async () => {
    const runner = makeRunner();
    const worker = latest();
    worker.responsive = false;
    const seen: number[] = [];

    const pending = runner.run({ ...REQUEST, seeds: [1, 2] }, (progress) => {
      seen.push(progress.boardsDone);
    });
    const requestId = worker.received[0]?.requestId ?? 0;
    const progress = (id: number, boardsDone: number): void => {
      worker.onmessage?.({
        data: { type: 'progress', requestId: id, boardsDone, boards: 2 },
      } as MessageEvent);
    };
    progress(999, 1);
    progress(requestId, 1);
    expect(runner.busy).toBe(true);
    worker.reply(requestId, okResponse(1));
    progress(requestId, 2);

    expect((await pending).ok).toBe(true);
    expect(seen).toEqual([1]);
    runner.dispose();
  });

  test('a stale reply from a superseded request is ignored', async () => {
    const runner = makeRunner();
    const worker = latest();
    worker.responsive = false;

    const pending = runner.run(REQUEST);
    worker.reply(999, okResponse(1));
    await vi.advanceTimersByTimeAsync(200);

    const response = await pending;
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.kind).toBe('timeout');
    runner.dispose();
  });
});

describe('the watchdog', () => {
  test('a program that never halts is killed and reported, not left hanging', async () => {
    const runner = makeRunner(100);
    const hung = latest();
    hung.responsive = false;

    const pending = runner.run(REQUEST);
    await vi.advanceTimersByTimeAsync(99);
    expect(hung.terminated).toBe(false);

    await vi.advanceTimersByTimeAsync(2);
    const response = await pending;

    expect(hung.terminated).toBe(true);
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.kind).toBe('timeout');
    expect(response.error.message).toBe('Board 1 ran past 0.1 s. A loop may never end.');
    runner.dispose();
  });

  test('a fresh worker is standing by immediately after a kill', async () => {
    const runner = makeRunner(100);
    latest().responsive = false;

    const pending = runner.run(REQUEST);
    await vi.advanceTimersByTimeAsync(150);
    await pending;

    expect(FakeWorker.created.length).toBe(2);
    expect(latest().terminated).toBe(false);

    const recovered = await runner.run(REQUEST);
    expect(recovered.ok).toBe(true);
    runner.dispose();
  });

  test('the UI never soft-locks: three hangs in a row all recover', async () => {
    const runner = makeRunner(50);
    for (let attempt = 0; attempt < 3; attempt++) {
      latest().responsive = false;
      const pending = runner.run(REQUEST);
      await vi.advanceTimersByTimeAsync(60);
      const response = await pending;
      expect(response.ok, `attempt ${attempt}`).toBe(false);
      expect(runner.busy).toBe(false);
    }
    const finally_ = await runner.run(REQUEST);
    expect(finally_.ok).toBe(true);
    runner.dispose();
  });

  test('the limit is per board: three boards of 3 s each pass under a 5 s limit', async () => {
    const runner = makeRunner(5000);
    const worker = latest();
    worker.responsive = false;
    const pending = runner.run({ ...REQUEST, seeds: [1, 4, 7] });
    const requestId = worker.received[0]?.requestId ?? 0;
    for (let board = 1; board <= 3; board++) {
      await vi.advanceTimersByTimeAsync(3000);
      worker.onmessage?.({
        data: { type: 'progress', requestId, boardsDone: board, boards: 3 },
      } as MessageEvent);
    }
    worker.reply(requestId, okResponse(1));

    const response = await pending;
    expect(response.ok).toBe(true);
    expect(worker.terminated).toBe(false);
    runner.dispose();
  });

  test('a board that never ends is stopped at its own limit, and named', async () => {
    const runner = makeRunner(5000);
    const worker = latest();
    worker.responsive = false;
    const pending = runner.run({ ...REQUEST, seeds: [1, 4, 7] });
    const requestId = worker.received[0]?.requestId ?? 0;
    await vi.advanceTimersByTimeAsync(2000);
    worker.onmessage?.({
      data: { type: 'progress', requestId, boardsDone: 1, boards: 3 },
    } as MessageEvent);
    await vi.advanceTimersByTimeAsync(4999);
    expect(worker.terminated).toBe(false);
    await vi.advanceTimersByTimeAsync(2);

    const response = await pending;
    expect(worker.terminated).toBe(true);
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.message).toBe('Board 4 ran past 5 s. A loop may never end.');
    runner.dispose();
  });

  test('a busy loop on the first board fails there', async () => {
    const runner = makeRunner(5000);
    latest().responsive = false;
    const pending = runner.run({ ...REQUEST, seeds: [1, 4, 7] });
    await vi.advanceTimersByTimeAsync(5001);

    const response = await pending;
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.message).toBe('Board 1 ran past 5 s. A loop may never end.');
    runner.dispose();
  });

  test('a per-request timeout overrides the runner default', async () => {
    const runner = makeRunner(10_000);
    latest().responsive = false;

    const pending = runner.run({ ...REQUEST, timeoutMs: 30 });
    await vi.advanceTimersByTimeAsync(40);
    const response = await pending;

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.message).toContain('0.03 s');
    runner.dispose();
  });
});

describe('cancellation', () => {
  test('cancel resolves the pending run and kills the worker', async () => {
    const runner = makeRunner();
    const worker = latest();
    worker.responsive = false;

    const pending = runner.run(REQUEST);
    runner.cancel();
    const response = await pending;

    expect(worker.terminated).toBe(true);
    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.kind).toBe('cancelled');
    expect(runner.busy).toBe(false);
    runner.dispose();
  });

  test('cancelling with nothing in flight does nothing', () => {
    const runner = makeRunner();
    runner.cancel();
    expect(latest().terminated).toBe(false);
    runner.dispose();
  });

  test('a second run supersedes the first, which resolves as cancelled', async () => {
    const runner = makeRunner();
    latest().responsive = false;

    const first = runner.run(REQUEST);
    const second = runner.run(REQUEST);

    const firstResponse = await first;
    expect(firstResponse.ok).toBe(false);
    if (!firstResponse.ok) expect(firstResponse.error.kind).toBe('cancelled');

    await vi.advanceTimersByTimeAsync(1);
    expect((await second).ok).toBe(true);
    runner.dispose();
  });
});

describe('a worker that dies on its own', () => {
  test('is reported to the player and replaced', async () => {
    const runner = makeRunner();
    const worker = latest();
    worker.responsive = false;

    const pending = runner.run(REQUEST);
    worker.fail('out of memory');
    const response = await pending;

    expect(response.ok).toBe(false);
    if (response.ok) return;
    expect(response.error.kind).toBe('runtime');
    expect(response.error.message).toContain('out of memory');
    expect(response.error.message).toContain('not the cause');
    expect(FakeWorker.created.length).toBe(2);
    runner.dispose();
  });

  test('an error with no run in flight still replaces the worker', () => {
    const runner = makeRunner();
    latest().fail('boom');
    expect(FakeWorker.created.length).toBe(2);
    runner.dispose();
  });
});

describe('dispose', () => {
  test('terminates the worker and does not spawn another', () => {
    const runner = makeRunner();
    runner.dispose();
    expect(FakeWorker.created.length).toBe(1);
    expect(latest().terminated).toBe(true);
  });

  test('running after dispose is a programming error, not a silent no-op', () => {
    const runner = makeRunner();
    runner.dispose();
    expect(() => runner.run(REQUEST)).toThrow('disposed');
  });

  test('dispose is idempotent', () => {
    const runner = makeRunner();
    runner.dispose();
    expect(() => runner.dispose()).not.toThrow();
  });
});
