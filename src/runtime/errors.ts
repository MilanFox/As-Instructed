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

export interface StackFrame {
  name: string;
  source: string;
  line?: number;
  column?: number;
}

export interface PlayerLocation {
  line: number;
  column?: number;
}

export interface ErrorContext {
  wrapperOffset: number;
  lineMap?: readonly number[];
  unlocked?: readonly string[];
  locate?: (stack: string | undefined) => ModuleLocationLike | undefined;
  describeStack?: (stack: string | undefined) => string | undefined;
}

export interface ModuleLocationLike {
  file: 'program' | 'lib';
  line: number;
  column?: number;
}

const V8_FRAME = /^\s*at\s+(?:(.+?)\s+\((.*)\)|(.*))$/;
const SPIDERMONKEY_FRAME = /^([^@]*)@(.*)$/;
const LOCATION_TAIL = /^(.*?)(?::(\d+))(?::(\d+))?$/;

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

export function topFrameLine(stack: string): number | undefined {
  return parseStackFrames(stack)[0]?.line;
}

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

  const remapped = lineMap !== undefined && lineMap.length > 0;
  return frame.column === undefined || remapped ? { line } : { line, column: frame.column };
}

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

const NOT_A_FUNCTION = [
  /^(?:(\w+) is not a function|(\w+)\.(\w+) is not a function)$/,
  /^undefined is not a function \(near '\.\.\.(\w+)\.\.\.'\)$/,
];
const NOT_DEFINED = /^(?:Can't find variable: (\w+)|(\w+) is not defined)$/;
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
  return `\`${name}()\` is not available yet. You get it in level ${spec.unlockedBy}.`;
}

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
      `\`${identifier}\` does not exist. Check the spelling, and declare it before you use it.`
    );
  }

  for (const pattern of NOT_A_FUNCTION) {
    const match = pattern.exec(text);
    if (!match) continue;
    const identifier = match[3] ?? match[1] ?? match[4] ?? '';
    const locked = lockedApiAdvice(identifier, context.unlocked);
    if (locked) return locked;
    return (
      `\`${identifier}\` is not a function. You called it with \`()\`, but it held something else, ` +
      'often `undefined`.'
    );
  }

  for (const { pattern, kind, property } of NULLISH_MEMBER) {
    const match = pattern.exec(text);
    if (!match) continue;
    const nullish = match[kind] === 'null' ? 'null' : 'undefined';
    const accessed = property === undefined ? undefined : lastSegment(match[property]);
    const what = accessed ? `\`.${accessed}\`` : 'a property';
    return (
      `You read ${what} from a value that is ${nullish}. Often this is an array index past the end, ` +
      'a lookup that found nothing, or a variable with no value.'
    );
  }

  if (/Maximum call stack size exceeded|call stack size exceeded|too much recursion/i.test(text)) {
    return 'A function called itself too many times. Add a condition that stops it.';
  }

  if (/Assignment to constant variable|Attempted to assign to readonly property/i.test(text)) {
    return 'You changed a `const` variable. Use `let` for a value that changes.';
  }

  if (name === 'SyntaxError' && /\b(import|export)\b/.test(text)) {
    return 'You cannot use `import` or `export` here. All bot commands are already available: just call them.';
  }

  if (/out of memory|Array buffer allocation failed|Invalid (?:array|string) length/i.test(text)) {
    return 'Your program ran out of memory. Usually an array or string grows inside a loop that never ends.';
  }

  return text.length > 0 ? text : `${name} (no message)`;
}

interface TimedOutBoard {
  index: number;
  total: number;
  seed: number | undefined;
}

function timedOutName(board: TimedOutBoard | undefined): string {
  if (board === undefined || board.seed === undefined) return 'Your program';
  return `Board ${String(board.seed)}`;
}

export function timeoutFailure(timeoutMs: number, board?: TimedOutBoard): RuntimeFailure {
  return {
    kind: 'timeout',
    code: 'timeout',
    message: `${timedOutName(board)} ran past ${String(timeoutMs / 1000)} s. A loop may never end.`,
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
    message: `Your program threw something that is not an Error: ${label(error)}.`,
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
