import { describe, expect, test } from 'vitest';
import { HaltError, LivelockError, OpLimitError, OutOfFuelError } from '../../engine/index.ts';
import {
  findPlayerFrame,
  locatePlayerFrame,
  offsetToPosition,
  parseStackFrames,
  playerStack,
  rewriteMessage,
  timeoutFailure,
  toRuntimeFailure,
} from '../errors.ts';

/**
 * The highest-value tests in the runtime.
 *
 * Every stack string below is a real one, copied from a browser or from Node. If line mapping
 * regresses, every runtime error in the game points at the wrong line and nobody notices for
 * weeks, because the message still looks plausible.
 *
 * The wrapper contributes `new Function`'s own offset (2) plus two preamble lines, so a frame
 * reported at `<anonymous>:N` is the player's line `N - 4`.
 */

const V8_NODE_EVAL = [
  'Error: boom',
  '    at __player__ (eval at <anonymous> ([eval]:2:11), <anonymous>:7:9)',
  '    at eval (eval at <anonymous> ([eval]:2:11), <anonymous>:9:3)',
  '    at [eval]:10:7',
].join('\n');

const V8_BROWSER = [
  "TypeError: Cannot read properties of undefined (reading 'x')",
  '    at __player__ (<anonymous>:8:22)',
  '    at http://localhost:5173/src/runtime/wrapper.ts:151:5',
  '    at runSeed (http://localhost:5173/src/runtime/run-level.ts:62:5)',
].join('\n');

const V8_BROWSER_NESTED = [
  'TypeError: undefined is not a function',
  '    at walk (<anonymous>:12:5)',
  '    at walk (<anonymous>:14:7)',
  '    at __player__ (<anonymous>:20:1)',
  '    at http://localhost:5173/src/runtime/wrapper.ts:151:5',
].join('\n');

const V8_ENGINE_THREW = [
  'HaltError: Shift over.',
  '    at Sim.advance (http://localhost:5173/src/engine/sim.ts:951:38)',
  '    at Sim.move (http://localhost:5173/src/engine/sim.ts:310:10)',
  '    at Object.move (http://localhost:5173/src/runtime/api-bindings.ts:160:11)',
  '    at __player__ (<anonymous>:6:3)',
  '    at http://localhost:5173/src/runtime/wrapper.ts:151:5',
].join('\n');

const FIREFOX = [
  '__player__@http://localhost:5173/src/runtime/wrapper.ts line 149 > Function:9:11',
  '@http://localhost:5173/src/runtime/wrapper.ts line 149 > Function:11:3',
  'createProgram@http://localhost:5173/src/runtime/wrapper.ts:151:5',
].join('\n');

const SAFARI = [
  '__player__@[native code]:7:19',
  'runSeed@http://localhost:5173/src/runtime/run-level.ts:62:14',
  'global code@http://localhost:5173/src/runtime/sim.worker.ts:88:20',
].join('\n');

describe('parseStackFrames', () => {
  test('unwraps V8 eval-in-eval locations to the code that actually threw', () => {
    const frames = parseStackFrames(V8_NODE_EVAL);
    expect(frames[0]).toEqual({ name: '__player__', source: '<anonymous>', line: 7, column: 9 });
    expect(frames[1]).toEqual({ name: 'eval', source: '<anonymous>', line: 9, column: 3 });
    expect(frames[2]).toEqual({ name: '', source: '[eval]', line: 10, column: 7 });
  });

  test('reads plain V8 browser frames', () => {
    const frames = parseStackFrames(V8_BROWSER);
    expect(frames[0]).toEqual({ name: '__player__', source: '<anonymous>', line: 8, column: 22 });
    expect(frames[2]?.name).toBe('runSeed');
    expect(frames[2]?.line).toBe(62);
  });

  test('reads SpiderMonkey frames, including the Function-constructor source', () => {
    const frames = parseStackFrames(FIREFOX);
    expect(frames[0]?.name).toBe('__player__');
    expect(frames[0]?.line).toBe(9);
    expect(frames[0]?.source).toBe(
      'http://localhost:5173/src/runtime/wrapper.ts line 149 > Function',
    );
    expect(frames[1]?.name).toBe('');
    expect(frames[1]?.source).toBe(frames[0]?.source);
  });

  test('reads JavaScriptCore frames', () => {
    const frames = parseStackFrames(SAFARI);
    expect(frames[0]?.name).toBe('__player__');
    expect(frames[0]?.line).toBe(7);
    expect(frames[2]?.name).toBe('global code');
  });

  test('survives an empty or nonsense stack', () => {
    expect(parseStackFrames('')).toEqual([]);
    expect(parseStackFrames('Error: nope')).toEqual([]);
  });
});

describe('findPlayerFrame', () => {
  test('prefers the deepest frame inside the player program', () => {
    const frame = findPlayerFrame(parseStackFrames(V8_BROWSER_NESTED));
    expect(frame?.name).toBe('walk');
    expect(frame?.line).toBe(12);
  });

  test('skips engine frames and lands on the line that called the API', () => {
    const frame = findPlayerFrame(parseStackFrames(V8_ENGINE_THREW));
    expect(frame?.name).toBe('__player__');
    expect(frame?.line).toBe(6);
  });

  test('returns nothing when no player frame is present', () => {
    expect(
      findPlayerFrame(parseStackFrames(V8_ENGINE_THREW.split('\n').slice(0, 3).join('\n'))),
    ).toBeUndefined();
  });
});

describe('locatePlayerFrame', () => {
  const cases: { name: string; stack: string; line: number; column?: number }[] = [
    { name: 'V8 under Node', stack: V8_NODE_EVAL, line: 3, column: 9 },
    { name: 'V8 in a browser', stack: V8_BROWSER, line: 4, column: 22 },
    { name: 'V8, nested player function', stack: V8_BROWSER_NESTED, line: 8, column: 5 },
    { name: 'V8, engine threw', stack: V8_ENGINE_THREW, line: 2, column: 3 },
    { name: 'Firefox', stack: FIREFOX, line: 5, column: 11 },
    { name: 'Safari', stack: SAFARI, line: 3, column: 19 },
  ];

  for (const { name, stack, line, column } of cases) {
    test(`${name} maps to the player's own line`, () => {
      expect(locatePlayerFrame(stack, 2)).toEqual({ line, column });
    });
  }

  test('a frame above the player program is discarded rather than reported as line 0', () => {
    const stack = 'Error: x\n    at __player__ (<anonymous>:3:1)';
    expect(locatePlayerFrame(stack, 2)).toBeUndefined();
  });

  test('a line map moves the answer to the pre-transpilation line', () => {
    /* Emitted line 2 came from source line 5: an interface was erased above it. */
    expect(locatePlayerFrame(V8_ENGINE_THREW, 2, [1, 5, 6])).toEqual({ line: 5 });
  });

  test('no stack, no guess', () => {
    expect(locatePlayerFrame(undefined, 2)).toBeUndefined();
  });
});

describe('playerStack', () => {
  test('keeps only the player frames and renumbers them', () => {
    expect(playerStack(V8_BROWSER_NESTED, 2)).toBe(
      ['walk — line 8:5', 'walk — line 10:7', 'line 16:1'].join('\n'),
    );
  });

  test('is undefined when the player never appears', () => {
    expect(playerStack('    at Sim.move (sim.ts:310:10)', 2)).toBeUndefined();
  });
});

describe('rewriteMessage', () => {
  const unlocked = ['move', 'pos'];

  test('names the level that installs a locked function', () => {
    const message = rewriteMessage('ReferenceError', 'scan is not defined', {
      wrapperOffset: 2,
      unlocked,
    });
    expect(message).toContain('`scan()` is not installed');
    expect(message).toContain('w2-02');
  });

  test("handles Safari's wording for the same mistake", () => {
    const message = rewriteMessage('ReferenceError', "Can't find variable: harvest", {
      wrapperOffset: 2,
      unlocked,
    });
    expect(message).toContain('w2-02');
  });

  test('a genuine typo is not blamed on hardware', () => {
    const message = rewriteMessage('ReferenceError', 'postion is not defined', {
      wrapperOffset: 2,
      unlocked,
    });
    expect(message).toContain('`postion`');
    expect(message).toContain('spelling');
  });

  test('calling a locked API through a value reports the lock, not the value', () => {
    const message = rewriteMessage('TypeError', 'plant is not a function', {
      wrapperOffset: 2,
      unlocked,
    });
    expect(message).toContain('w2-02');
  });

  test('reading a property of undefined explains array indexes', () => {
    const v8 = rewriteMessage('TypeError', "Cannot read properties of undefined (reading 'x')", {
      wrapperOffset: 2,
    });
    expect(v8).toContain('`.x`');
    expect(v8).toContain('undefined');
    expect(v8).toContain('array index past the end');

    const safari = rewriteMessage('TypeError', "undefined is not an object (evaluating 'here.x')", {
      wrapperOffset: 2,
    });
    expect(safari).toContain('`.x`');
    expect(safari).toContain('is undefined');
  });

  test('null is reported as null, not as undefined', () => {
    const message = rewriteMessage('TypeError', "Cannot read properties of null (reading 'kind')", {
      wrapperOffset: 2,
    });
    expect(message).toContain('`.kind`');
    expect(message).toContain('is null');
    expect(message).not.toContain('is undefined');
  });

  test("Firefox's wording for the same mistake lands in the same place", () => {
    const message = rewriteMessage('TypeError', 'can\'t access property "x", here is undefined', {
      wrapperOffset: 2,
    });
    expect(message).toContain('`.x`');
    expect(message).toContain('is undefined');
  });

  test('runaway recursion is named', () => {
    expect(rewriteMessage('RangeError', 'Maximum call stack size exceeded')).toContain(
      'called itself',
    );
    expect(rewriteMessage('InternalError', 'too much recursion')).toContain('called itself');
  });

  test('const reassignment gets the one-line fix', () => {
    expect(rewriteMessage('TypeError', 'Assignment to constant variable.')).toContain('`let`');
  });

  test('import and export are explained rather than left as a SyntaxError', () => {
    expect(rewriteMessage('SyntaxError', "Unexpected token 'export'")).toContain('already');
  });

  test('an unrecognised message is passed through untouched', () => {
    expect(rewriteMessage('Error', 'the regolith is on fire')).toBe('the regolith is on fire');
  });
});

describe('toRuntimeFailure', () => {
  const context = { wrapperOffset: 2, unlocked: ['move', 'pos'] };

  test('HaltError becomes a halt, message intact', () => {
    const failure = toRuntimeFailure(new HaltError(20000, 0), context);
    expect(failure.kind).toBe('halt');
    expect(failure.code).toBe('halt');
    expect(failure.message).toContain('20000-tick');
  });

  test('OpLimitError becomes an oplimit', () => {
    const failure = toRuntimeFailure(new OpLimitError(2_000_000), context);
    expect(failure.kind).toBe('oplimit');
    expect(failure.code).toBe('oplimit');
  });

  test('OutOfFuelError keeps its own code under the runtime kind', () => {
    const failure = toRuntimeFailure(new OutOfFuelError(0, 'RIG-01', 'move', 1, 0), context);
    expect(failure.kind).toBe('runtime');
    expect(failure.code).toBe('out-of-fuel');
    expect(failure.message).toContain('refuel()');
  });

  test('LivelockError keeps its own code', () => {
    const failure = toRuntimeFailure(new LivelockError([0, 1], 8), context);
    expect(failure.code).toBe('blocked-livelock');
    expect(failure.message).toContain('Livelock');
  });

  test('a player error is rewritten and located', () => {
    const error = new ReferenceError('scan is not defined');
    error.stack = V8_BROWSER.replace(
      "TypeError: Cannot read properties of undefined (reading 'x')",
      'ReferenceError: scan is not defined',
    );
    const failure = toRuntimeFailure(error, context);
    expect(failure.kind).toBe('runtime');
    expect(failure.code).toBe('crash');
    expect(failure.line).toBe(4);
    expect(failure.message).toContain('w2-02');
  });

  test('a thrown non-Error does not escape as a raw value', () => {
    const failure = toRuntimeFailure({ oops: true }, context);
    expect(failure.kind).toBe('runtime');
    expect(failure.message).toContain('not an Error');
  });

  test('no browser stack ever reaches the player', () => {
    const error = new Error('boom');
    error.stack = V8_ENGINE_THREW;
    const failure = toRuntimeFailure(error, context);
    expect(failure.stack).toBe('line 2:3');
    expect(failure.stack).not.toContain('src/engine');
  });
});

describe('timeoutFailure', () => {
  test('says the program did not halt, and how long it was given', () => {
    const failure = timeoutFailure(5000);
    expect(failure.kind).toBe('timeout');
    expect(failure.message).toContain('did not halt');
    expect(failure.message).toContain('5000 ms');
  });
});

describe('offsetToPosition', () => {
  const source = 'const a = 1;\nconst b = 2;\n\nmove(Dir.East);\n';

  test('maps offsets to 1-based line and column', () => {
    expect(offsetToPosition(source, 0)).toEqual({ line: 1, column: 1 });
    expect(offsetToPosition(source, 13)).toEqual({ line: 2, column: 1 });
    expect(offsetToPosition(source, 19)).toEqual({ line: 2, column: 7 });
    expect(offsetToPosition(source, source.indexOf('move'))).toEqual({ line: 4, column: 1 });
  });

  test('clamps out-of-range offsets', () => {
    expect(offsetToPosition(source, -5)).toEqual({ line: 1, column: 1 });
    expect(offsetToPosition(source, 9999).line).toBe(5);
  });
});
