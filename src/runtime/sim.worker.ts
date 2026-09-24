/// <reference lib="webworker" />
import { FailureCode } from '../engine/index.ts';
import type { RunResponse, WorkerInbound, WorkerOutbound } from './protocol.ts';
import { apiBootFailure, serveRunRequest } from './serve.ts';

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
          'The game crashed while running your program. This is a bug in the game, not in ' +
          `your code: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }

  reply({ type: 'result', requestId: message.requestId, response });
};
