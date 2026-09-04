/// <reference lib="webworker" />
import { FailureCode } from '../engine/index.ts';
import { getLevel } from '../levels/index.ts';
import { aggregate } from './aggregate.ts';
import { unlockedApiNames } from './ambient.ts';
import { assertApiComplete } from './api-bindings.ts';
import type { RunRequest, RunResponse, WorkerInbound, WorkerOutbound } from './protocol.ts';
import { runSeed, wrapperOffset } from './run-level.ts';
import type { SeedRun } from './run-level.ts';

/**
 * The simulation worker. Receives a `RunRequest`, runs the player's emitted JavaScript once per
 * seed, and posts back a `RunResponse`.
 *
 * The player's program is synchronous and runs to completion here, off the main thread
 * (DESIGN.md §3, §10.7). Everything interesting lives in `run-level.ts` and `aggregate.ts` so it
 * stays testable in Node; this file is message plumbing.
 *
 * `postMessage` is captured before any player code can exist, and shadowed away inside the
 * player's scope (`wrapper.ts`), so the protocol cannot be corrupted from a program.
 */

const scope = self as unknown as DedicatedWorkerGlobalScope;
const reply = (message: WorkerOutbound): void => {
  scope.postMessage(message);
};

/**
 * A spec entry with no implementation is a build-time mistake, so it is reported the moment the
 * worker boots rather than when some player finally reaches that level. Every run then fails with
 * the same message instead of `undefined is not a function`.
 */
let bootFailure: string | undefined;
try {
  assertApiComplete();
  wrapperOffset();
} catch (error) {
  bootFailure = error instanceof Error ? error.message : String(error);
  console.error(bootFailure);
}

function fatal(message: string): RunResponse {
  return { ok: false, error: { kind: 'runtime', code: FailureCode.Crash, message } };
}

function handle(request: RunRequest): RunResponse {
  if (bootFailure !== undefined) return fatal(bootFailure);

  const level = getLevel(request.levelId);
  if (!level) {
    return fatal(
      `There is no level "${request.levelId}" in this build. The campaign registry and the save ` +
        'file have got out of step.',
    );
  }

  const seeds = request.seeds.length > 0 ? request.seeds : level.seeds;
  const unlockedHardware = unlockedApiNames(request.levelId);
  const runs: SeedRun[] = [];

  for (const seed of seeds) {
    runs.push(
      runSeed({
        level,
        seed,
        js: request.js,
        source: request.code,
        unlockedHardware,
        ...(request.library !== undefined ? { library: request.library } : {}),
        ...(request.lineMap !== undefined ? { lineMap: request.lineMap } : {}),
        ...(request.costOverrides !== undefined ? { costOverrides: request.costOverrides } : {}),
        ...(request.maxTicks !== undefined ? { maxTicks: request.maxTicks } : {}),
        ...(request.maxOps !== undefined ? { maxOps: request.maxOps } : {}),
      }),
    );
  }

  return aggregate(runs);
}

scope.onmessage = (event: MessageEvent<WorkerInbound>): void => {
  const message = event.data;
  if (!message || message.type !== 'run') return;

  let response: RunResponse;
  try {
    response = handle(message.request);
  } catch (error) {
    response = fatal(
      'The simulator failed while running your program. This is a bug in the game, not in your ' +
        `code: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  reply({ type: 'result', requestId: message.requestId, response });
};
