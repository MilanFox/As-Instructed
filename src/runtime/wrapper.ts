export const WRAPPER_PREAMBLE_LINES = 2;

export const PLAYER_FRAME_NAME = '__player__';

export const DEFAULT_WRAPPER_OFFSET = 2;

export const SHADOWED_GLOBALS: readonly string[] = [
  'self',
  'globalThis',
  'window',
  'document',
  'parent',
  'top',
  'frames',
  'location',
  'navigator',
  'postMessage',
  'onmessage',
  'onerror',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'close',
  'importScripts',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'Worker',
  'SharedWorker',
  'WorkerGlobalScope',
  'DedicatedWorkerGlobalScope',
  'BroadcastChannel',
  'MessageChannel',
  'MessagePort',
  'indexedDB',
  'caches',
  'localStorage',
  'sessionStorage',
  'crypto',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'setImmediate',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'queueMicrotask',
  'Atomics',
  'SharedArrayBuffer',
  'process',
  'require',
  'module',
  'exports',
  'Function',
];

export function wrapProgram(emittedJs: string): string {
  return `'use strict';\nreturn (function ${PLAYER_FRAME_NAME}() {\n${emittedJs}\n})();`;
}

export function measureWrapperOffset(parseLine: (stack: string) => number | undefined): number {
  try {
    const probe = new Function(`throw new Error('as-instructed:probe');`) as () => void;
    probe();
  } catch (error) {
    const stack = error instanceof Error ? error.stack : undefined;
    const line = stack === undefined ? undefined : parseLine(stack);
    if (line !== undefined && line >= 1) return line - 1;
  }
  return DEFAULT_WRAPPER_OFFSET;
}

export function toPlayerLine(reportedLine: number, wrapperOffset: number): number {
  return reportedLine - wrapperOffset - WRAPPER_PREAMBLE_LINES;
}

export interface ProgramScope {
  api: Readonly<Record<string, unknown>>;
  values: Readonly<Record<string, unknown>>;
}

export function createProgram(emittedJs: string, scope: ProgramScope): () => void {
  const names: string[] = [];
  const args: unknown[] = [];
  const seen = new Set<string>();

  const bind = (name: string, value: unknown): void => {
    if (seen.has(name)) return;
    seen.add(name);
    names.push(name);
    args.push(value);
  };

  for (const [name, value] of Object.entries(scope.api)) bind(name, value);
  for (const [name, value] of Object.entries(scope.values)) bind(name, value);
  for (const name of SHADOWED_GLOBALS) bind(name, undefined);

  const compiled = new Function(...names, wrapProgram(emittedJs)) as (
    ...values: unknown[]
  ) => unknown;

  return () => {
    compiled(...args);
  };
}
