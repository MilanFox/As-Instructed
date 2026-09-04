import type { FailureCode } from '../engine/index.ts';
import {
  HaltError,
  LivelockError,
  OpLimitError,
  OutOfFuelError,
  isSimError,
} from '../engine/index.ts';
import type { RuntimeFailure } from './protocol.ts';
import { apiFunction } from './api-spec.ts';
import { toSourceLine } from './sourcemap.ts';
import { PLAYER_FRAME_NAME, toPlayerLine } from './wrapper.ts';

/**
 * Turning whatever the browser threw into something a beginner can act on.
 *
 * This is the file players feel. Two jobs:
 *
 *  1. **Coordinates.** The emitted JS runs inside a `new Function` wrapper, so every line the
 *     engine reports is offset. Subtract the offset and the player sees their own line numbers.
 *  2. **Wording.** `undefined is not a function` tells a beginner nothing. Each rewrite below
 *     names the actual mistake and what to do about it. Factual, never jokey — the jokes live in
 *     mission briefs (DESIGN.md §8).
 *
 * Pure: no DOM, no Monaco, no `Sim`. The stack strings in the tests are real ones.
 */

export interface StackFrame {
  /** Function name, or `''` for a top-level / anonymous frame. */
  name: string;
  /** Whatever the engine called the source: a URL, `<anonymous>`, `Function`, … */
  source: string;
  line?: number;
  column?: number;
}

export interface PlayerLocation {
  line: number;
  column?: number;
}

export interface ErrorContext {
  /** Lines `new Function` added above the body. See `measureWrapperOffset`. */
  wrapperOffset: number;
  /**
   * Emitted-line to source-line map. Required whenever the player's TypeScript contains anything
   * the emitter erases, which is most programs past World 2. See `sourcemap.ts`.
   */
  lineMap?: readonly number[];
  /** API names the player has unlocked at this level. */
  unlocked?: readonly string[];
  /**
   * Overrides frame resolution when a shared library is linked in.
   *
   * With two files in play, "the player's line" is not enough — the failure has to say *which*
   * file, and each file has its own line map. `modules.ts` knows how to tell them apart from the
   * `//# sourceURL` on each frame; it is injected rather than imported so `errors.ts` stays the
   * leaf it has always been.
   */
  locate?: (stack: string | undefined) => ModuleLocationLike | undefined;
  /** Same, for the trimmed stack shown in the failure panel. */
  describeStack?: (stack: string | undefined) => string | undefined;
}

export interface ModuleLocationLike {
  file: 'program' | 'lib';
  line: number;
  column?: number;
}

const V8_FRAME = /^\s*at\s+(?:(.+?)\s+\((.*)\)|(.*))$/;
/** `name@source`, or a bare `source` on Safari's top-level frames. */
const SPIDERMONKEY_FRAME = /^([^@]*)@(.*)$/;
/** A trailing `:line:column` or `:line` on a source location. */
const LOCATION_TAIL = /^(.*?)(?::(\d+))(?::(\d+))?$/;

/**
 * Splits `http://host/file.js:12:5` into its parts.
 *
 * V8 wraps `new Function` frames as `eval at <anonymous> (file:1:1), <anonymous>:5:7`; only the
 * part after the last `, ` describes the code that actually threw, so anything before it is
 * dropped. Firefox's `x.js line 3 > Function:5:7` needs no such surgery — the tail regex handles
 * it and the whole prefix survives as the source, which is what the same-source test wants.
 */
function splitLocation(raw: string): { source: string; line?: number; column?: number } {
  let text = raw.trim();
  const evalAt = text.lastIndexOf(', ');
  if (text.startsWith('eval at ') && evalAt !== -1) text = text.slice(evalAt + 2);

  const match = LOCATION_TAIL.exec(text);
  if (!match) return { source: text };

  const location: { source: string; line?: number; column?: number } = { source: match[1] ?? '' };
  const line = Number(match[2]);
  if (Number.isFinite(line)) location.line = line;
  const column = match[3] === undefined ? Number.NaN : Number(match[3]);
  if (Number.isFinite(column)) location.column = column;
  return location;
}

/** Parses a V8, SpiderMonkey or JavaScriptCore stack into frames, topmost first. */
export function parseStackFrames(stack: string): StackFrame[] {
  const frames: StackFrame[] = [];

  for (const raw of stack.split('\n')) {
    const line = raw.trim();
    if (line === '' || !/\d/.test(line)) continue;

    const v8 = V8_FRAME.exec(line);
    if (v8) {
      const name = (v8[1] ?? '').trim();
      const location = splitLocation(v8[2] ?? v8[3] ?? '');
      frames.push({ name, ...location });
      continue;
    }

    const other = SPIDERMONKEY_FRAME.exec(line);
    if (other) {
      const name = (other[1] ?? '').trim();
      const location = splitLocation(other[2] ?? '');
      frames.push({ name, ...location });
    }
  }

  return frames;
}

/** The first frame's line number, used to measure the `new Function` offset. */
export function topFrameLine(stack: string): number | undefined {
  return parseStackFrames(stack)[0]?.line;
}

/**
 * The topmost frame that belongs to the player.
 *
 * The `__player__` frame anchors the search: everything above it that shares its source is also
 * the player's code (their own helper functions), and everything above it that does *not* is ours
 * — the engine, the API bindings. When the engine throws, the topmost matching frame is the line
 * where the player called the API, which is exactly what should be highlighted.
 */
export function findPlayerFrame(frames: readonly StackFrame[]): StackFrame | undefined {
  const anchor = frames.findIndex((frame) => frame.name.includes(PLAYER_FRAME_NAME));
  if (anchor === -1) return undefined;

  const anchorFrame = frames[anchor] as StackFrame;
  for (let i = 0; i <= anchor; i++) {
    const frame = frames[i] as StackFrame;
    if (frame.source === anchorFrame.source && frame.line !== undefined) return frame;
  }
  return anchorFrame;
}

/** Where in the player's own source the error happened, in the coordinates they see. */
export function locatePlayerFrame(
  stack: string | undefined,
  wrapperOffset: number,
  lineMap?: readonly number[],
): PlayerLocation | undefined {
  if (!stack) return undefined;
  const frame = findPlayerFrame(parseStackFrames(stack));
  if (!frame || frame.line === undefined) return undefined;

  const emitted = toPlayerLine(frame.line, wrapperOffset);
  if (emitted < 1) return undefined;
  const line = toSourceLine(emitted, lineMap);

  /* The emitted column means nothing once lines have been rewritten, so it is dropped. */
  const remapped = lineMap !== undefined && lineMap.length > 0;
  return frame.column === undefined || remapped ? { line } : { line, column: frame.column };
}

/** Only the frames inside the player's program, for the "stack" section of the failure panel. */
export function playerStack(
  stack: string | undefined,
  wrapperOffset: number,
  lineMap?: readonly number[],
): string | undefined {
  if (!stack) return undefined;
  const frames = parseStackFrames(stack);
  const anchor = frames.findIndex((frame) => frame.name.includes(PLAYER_FRAME_NAME));
  if (anchor === -1) return undefined;

  const source = (frames[anchor] as StackFrame).source;
  const lines: string[] = [];
  for (let i = 0; i <= anchor; i++) {
    const frame = frames[i] as StackFrame;
    if (frame.source !== source || frame.line === undefined) continue;
    const emitted = toPlayerLine(frame.line, wrapperOffset);
    if (emitted < 1) continue;
    const line = toSourceLine(emitted, lineMap);
    const remapped = lineMap !== undefined && lineMap.length > 0;
    const where =
      frame.column === undefined || remapped ? `line ${line}` : `line ${line}:${frame.column}`;
    lines.push(
      frame.name === PLAYER_FRAME_NAME || frame.name === '' ? where : `${frame.name} — ${where}`,
    );
  }
  return lines.length > 0 ? lines.join('\n') : undefined;
}

// ---------------------------------------------------------------------------
// Message rewriting
// ---------------------------------------------------------------------------

/** `x is not a function`, `undefined is not a function`, `x is not defined`, … */
const NOT_A_FUNCTION = [
  /^(?:(\w+) is not a function|(\w+)\.(\w+) is not a function)$/,
  /^undefined is not a function \(near '\.\.\.(\w+)\.\.\.'\)$/,
];
const NOT_DEFINED = /^(?:Can't find variable: (\w+)|(\w+) is not defined)$/;
/** Every engine words this differently, and it is the single most common beginner error. */
const NULLISH_MEMBER: { pattern: RegExp; kind: 1 | 2; property?: 1 | 2 }[] = [
  {
    pattern: /^Cannot read properties of (undefined|null)(?: \(reading '([^']+)'\))?$/,
    kind: 1,
    property: 2,
  },
  { pattern: /^Cannot read property '([^']+)' of (undefined|null)$/, kind: 2, property: 1 },
  { pattern: /^(undefined|null) is not an object \(evaluating '([^']+)'\)$/, kind: 1, property: 2 },
  { pattern: /^can't access property "([^"]+)", .+ is (undefined|null)$/, kind: 2, property: 1 },
];

/** Safari reports the whole expression it was evaluating; only the property being read matters. */
function lastSegment(expression: string | undefined): string | undefined {
  if (!expression) return undefined;
  const segments = expression.split('.');
  const last = segments[segments.length - 1];
  return last !== undefined && /^\w+$/.test(last) ? last : undefined;
}

function lockedApiAdvice(
  name: string,
  unlocked: readonly string[] | undefined,
): string | undefined {
  const spec = apiFunction(name);
  if (!spec) return undefined;
  if (unlocked && unlocked.includes(name)) return undefined;
  return (
    `\`${name}()\` is not installed on this bot yet. That hardware arrives in level ` +
    `${spec.unlockedBy}; until then the bot has no way to perform it.`
  );
}

/**
 * Rewrites a raw JS error message into something actionable.
 *
 * Returns the original message when nothing better is known — a wrong-but-confident rewrite is
 * worse than a terse accurate one.
 */
export function rewriteMessage(
  name: string,
  message: string,
  context: ErrorContext = { wrapperOffset: 0 },
): string {
  const text = message.trim();

  const missing = NOT_DEFINED.exec(text);
  if (missing) {
    const identifier = missing[1] ?? missing[2] ?? '';
    return (
      lockedApiAdvice(identifier, context.unlocked) ??
      `There is nothing called \`${identifier}\` in your program. Check the spelling, and check ` +
        'that it is declared before the line that uses it.'
    );
  }

  for (const pattern of NOT_A_FUNCTION) {
    const match = pattern.exec(text);
    if (!match) continue;
    const identifier = match[3] ?? match[1] ?? match[4] ?? '';
    const locked = lockedApiAdvice(identifier, context.unlocked);
    if (locked) return locked;
    return (
      `\`${identifier}\` is not a function. You called it with \`()\`, but at that moment it held ` +
      'something else — often `undefined`, because the value was never assigned.'
    );
  }

  for (const { pattern, kind, property } of NULLISH_MEMBER) {
    const match = pattern.exec(text);
    if (!match) continue;
    const nullish = match[kind] === 'null' ? 'null' : 'undefined';
    const accessed = property === undefined ? undefined : lastSegment(match[property]);
    const what = accessed ? `\`.${accessed}\`` : 'a property';
    return (
      `You read ${what} from a value that is ${nullish}. The usual causes are an array index past ` +
      'the end of the array, a lookup that found nothing, or a variable that was never given a value.'
    );
  }

  if (/Maximum call stack size exceeded|call stack size exceeded|too much recursion/i.test(text)) {
    return (
      'Your program called itself until it ran out of room. A function is calling itself with no ' +
      'condition that ever stops it.'
    );
  }

  if (/Assignment to constant variable|Attempted to assign to readonly property/i.test(text)) {
    return (
      'You assigned to a variable declared with `const`. Declare it with `let` if it needs to ' +
      'change.'
    );
  }

  if (name === 'SyntaxError' && /\b(import|export)\b/.test(text)) {
    return (
      'Your program cannot use `import` or `export`. Every function the bot offers is already ' +
      'available as a global — just call it.'
    );
  }

  if (/out of memory|Array buffer allocation failed|Invalid (?:array|string) length/i.test(text)) {
    return (
      'Your program ran out of memory. Something is growing without limit — usually an array or ' +
      'string that is appended to inside a loop that never ends.'
    );
  }

  return text.length > 0 ? text : `${name} (no message)`;
}

// ---------------------------------------------------------------------------
// Failure construction
// ---------------------------------------------------------------------------

const TIMEOUT_MESSAGE =
  'Your program did not halt. It was still running after the time limit and had to be shut down. ' +
  'The usual cause is a loop whose condition never becomes false — check that every `while` has ' +
  'something inside it that eventually stops it.';

export function timeoutFailure(timeoutMs: number): RuntimeFailure {
  return {
    kind: 'timeout',
    code: 'timeout',
    message: `${TIMEOUT_MESSAGE} (Limit: ${timeoutMs} ms.)`,
  };
}

export function cancelledFailure(): RuntimeFailure {
  return {
    kind: 'cancelled',
    code: 'timeout',
    message: 'Run cancelled.',
  };
}

export function compileFailure(
  message: string,
  location?: { line?: number; column?: number },
): RuntimeFailure {
  const failure: RuntimeFailure = { kind: 'compile', code: 'compile', message };
  if (location?.line !== undefined) failure.line = location.line;
  if (location?.column !== undefined) failure.column = location.column;
  return failure;
}

function describe(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    const described: { name: string; message: string; stack?: string } = {
      name: error.name,
      message: error.message,
    };
    if (typeof error.stack === 'string') described.stack = error.stack;
    return described;
  }
  if (typeof error === 'string') return { name: 'Error', message: error };
  return {
    name: 'Error',
    message: `Your program threw a value that is not an Error: ${label(error)}.`,
  };
}

function label(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return '[object]';
    }
  }
  return String(value);
}

/**
 * The single conversion point from "something was thrown" to a player-facing `RuntimeFailure`.
 *
 * Engine budget errors carry their own player-facing text and are passed through verbatim; only
 * the `kind` changes so the UI can pick the right treatment. Nothing else is allowed to escape as
 * a raw stack trace.
 */
export function toRuntimeFailure(error: unknown, context: ErrorContext): RuntimeFailure {
  const { name, message, stack } = describe(error);
  const located = context.locate?.(stack);
  const location = located ?? locatePlayerFrame(stack, context.wrapperOffset, context.lineMap);

  const failure: RuntimeFailure = {
    kind: 'runtime',
    code: 'crash',
    message,
  };

  if (error instanceof HaltError) {
    failure.kind = 'halt';
    failure.code = 'halt';
  } else if (error instanceof OpLimitError) {
    failure.kind = 'oplimit';
    failure.code = 'oplimit';
  } else if (error instanceof OutOfFuelError) {
    failure.code = 'out-of-fuel';
  } else if (error instanceof LivelockError) {
    failure.code = 'blocked-livelock';
  } else if (isSimError(error)) {
    failure.code = error.code;
  } else {
    failure.message = rewriteMessage(name, message, context);
  }

  if (isSimError(error) && error.at) failure.at = error.at;
  if (location) {
    failure.line = location.line;
    if (location.column !== undefined) failure.column = location.column;
  }
  if (located && located.file !== 'program') failure.file = located.file;
  const trimmed =
    context.describeStack?.(stack) ?? playerStack(stack, context.wrapperOffset, context.lineMap);
  if (trimmed) failure.stack = trimmed;

  return failure;
}

/** The `Verdict.failure` shape, derived from the failure the player is shown. */
export function toVerdictFailure(failure: RuntimeFailure): {
  code: FailureCode;
  message: string;
  at?: { x: number; y: number };
  line?: number;
} {
  const verdictFailure: {
    code: FailureCode;
    message: string;
    at?: { x: number; y: number };
    line?: number;
  } = {
    code: failure.code ?? 'crash',
    message: failure.message,
  };
  if (failure.at) verdictFailure.at = failure.at;
  if (failure.line !== undefined) verdictFailure.line = failure.line;
  return verdictFailure;
}

/** 1-based line/column for a character offset, for mapping compiler diagnostics. */
export function offsetToPosition(source: string, offset: number): { line: number; column: number } {
  const clamped = Math.max(0, Math.min(offset, source.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < clamped; i++) {
    if (source.charCodeAt(i) === 10) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: clamped - lineStart + 1 };
}
