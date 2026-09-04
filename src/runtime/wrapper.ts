/**
 * Wrapping the player's emitted JavaScript into something callable, and knowing exactly how many
 * lines that wrapping added.
 *
 * Every runtime error message in the game is only as good as the number computed here, so the
 * offset is *measured* rather than assumed: `new Function(body)` builds
 * `function anonymous(args\n) {\n<body>\n}` per the spec, which puts body line 1 on line 3, but a
 * probe costs nothing and cannot drift.
 *
 * No DOM, no Monaco — `new Function` exists in Node too, so this whole module is testable.
 */

/**
 * Lines this module prepends inside the function body, before the player's first line.
 *
 *   1: 'use strict';
 *   2: return (function __player__() {
 */
export const WRAPPER_PREAMBLE_LINES = 2;

/**
 * The player's program runs inside a *named* function so its frames are identifiable in a stack
 * trace on every engine. Guessing "the frame called `anonymous`" works on V8 and nowhere else.
 */
export const PLAYER_FRAME_NAME = '__player__';

/** Fallback if the probe cannot be measured. `function anonymous(a\n) {\n` — body starts on 3. */
export const DEFAULT_WRAPPER_OFFSET = 2;

/**
 * Globals shadowed away inside the player's scope.
 *
 * This is not a security boundary — it is the same tab, and `(()=>{}).constructor` reaches
 * everything regardless. It is here so a player cannot *accidentally* break the game: a stray
 * `postMessage` would corrupt the worker protocol, a `fetch` would make a run non-deterministic,
 * and a `setTimeout` would silently never fire because the program has already finished.
 * `print()` is the only channel out.
 *
 * `eval` and `arguments` are deliberately absent: they are illegal as parameter names in strict
 * mode and would turn the whole wrapper into a SyntaxError.
 */
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

/** Wraps emitted JS so the player's line 1 lands on body line `WRAPPER_PREAMBLE_LINES + 1`. */
export function wrapProgram(emittedJs: string): string {
  return `'use strict';\nreturn (function ${PLAYER_FRAME_NAME}() {\n${emittedJs}\n})();`;
}

/**
 * How many lines `new Function` itself puts above the body. Measured once and cached.
 *
 * `parseLine` is injected so this module does not depend on the stack parser and the stack parser
 * does not depend on this one.
 */
export function measureWrapperOffset(parseLine: (stack: string) => number | undefined): number {
  try {
    const probe = new Function(`throw new Error('bootstrap:probe');`) as () => void;
    probe();
  } catch (error) {
    const stack = error instanceof Error ? error.stack : undefined;
    const line = stack === undefined ? undefined : parseLine(stack);
    if (line !== undefined && line >= 1) return line - 1;
  }
  return DEFAULT_WRAPPER_OFFSET;
}

/** Maps a line reported by the JS engine back to the line the player is looking at. */
export function toPlayerLine(reportedLine: number, wrapperOffset: number): number {
  return reportedLine - wrapperOffset - WRAPPER_PREAMBLE_LINES;
}

export interface ProgramScope {
  /** Player-callable functions, by name. */
  api: Readonly<Record<string, unknown>>;
  /** Ambient runtime values the player's code names directly, e.g. `Dir`. */
  values: Readonly<Record<string, unknown>>;
}

/**
 * Builds the callable program. Throws a `SyntaxError` if the emitted JS does not parse, which
 * should be impossible once the compiler has spoken but is cheap to survive.
 */
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
