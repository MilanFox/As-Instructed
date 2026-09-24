import { FailureCode } from '../engine/index.ts';
import { getLevel } from '../levels/index.ts';
import { aggregate } from './aggregate.ts';
import { unlockedApiNames } from './ambient.ts';
import { assertApiComplete } from './api-bindings.ts';
import type { RunProgress, RunRequest, RunResponse } from './protocol.ts';
import { runSeed, wrapperOffset } from './run-level.ts';
import type { SeedRun } from './run-level.ts';

let bootFailure: string | undefined;
try {
  assertApiComplete();
  wrapperOffset();
} catch (error) {
  bootFailure = error instanceof Error ? error.message : String(error);
}

export function apiBootFailure(): string | undefined {
  return bootFailure;
}

function fatal(message: string): RunResponse {
  return { ok: false, error: { kind: 'runtime', code: FailureCode.Crash, message } };
}

export function serveRunRequest(
  request: RunRequest,
  onProgress?: (progress: RunProgress) => void,
): RunResponse {
  if (bootFailure !== undefined) return fatal(bootFailure);

  const level = getLevel(request.levelId);
  if (!level) {
    return fatal(
      `There is no level "${request.levelId}" in this version of the game. Your save may be from another version.`,
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
        ...(request.debug === true ? { debug: true } : {}),
      }),
    );
    onProgress?.({ boardsDone: runs.length, boards: seeds.length });
  }

  return aggregate(runs);
}
