/// <reference lib="webworker" />
import { FailureCode } from '../engine/index.ts';
import type { RunResponse, WorkerInbound, WorkerOutbound } from './protocol.ts';
import { apiBootFailure, serveRunRequest } from './serve.ts';

/**
 * The simulation worker. Receives a `RunRequest`, hands it to `serve.ts`, and posts back a
 * `RunResponse`.
 *
 * The player's program is synchronous and runs to completion here, off the main thread
 * (DESIGN.md §3, §10.7). Everything interesting lives in `serve.ts`, `run-level.ts` and
 * `aggregate.ts` so it stays testable in Node; this file is message plumbing and nothing else.
 *
 * `postMessage` is captured before any player code can exist, and shadowed away inside the
 * player's scope (`wrapper.ts`), so the protocol cannot be corrupted from a program.
 */

const scope = self as unknown as DedicatedWorkerGlobalScope;
const reply = (message: WorkerOutbound): void => {
  scope.postMessage(message);
};

const boot = apiBootFailure();
if (boot !== undefined) console.error(boot);

scope.onmessage = (event: MessageEvent<WorkerInbound>): void => {
  const message = event.data;
  if (!message || message.type !== 'run') return;

  let response: RunResponse;
  try {
    response = serveRunRequest(message.request);
  } catch (error) {
    response = {
      ok: false,
      error: {
        kind: 'runtime',
        code: FailureCode.Crash,
        message:
          'The simulator failed while running your program. This is a bug in the game, not in ' +
          `your code: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }

  reply({ type: 'result', requestId: message.requestId, response });
};
