/**
 * `typescriptRegistered`, from the inside.
 *
 * `src/ui/__tests__/monaco-registration.test.ts` pins the guarantee where it is stated —
 * `RuntimeRunner.ready()` hands Monaco to nobody until the TypeScript language service will answer
 * — and stubs this function to do it. The polling loop, the warm-up model and the give-up were
 * uncovered, and it was a module-resolution problem rather than a design one: `monaco-editor`
 * declares `module` and no `main`, so nothing in this repo could so much as name it under node.
 * `vitest.config.ts` now sets `ssr.resolve.mainFields`, which is what opens this file up.
 *
 * The fake below rejects `getTypeScriptWorker()` with the **bare string** `'TypeScript not
 * registered!'`, exactly as Monaco does — the value with no `message` on it that reached the
 * console as an `Uncaught (in promise)` carrying nothing at all. A fake that rejected with an
 * `Error` would be testing a bug this code has never had.
 *
 * Every test drives the module fresh: the registration promise is memoized for the life of the
 * module, which is the behaviour `one model however many callers` exists to check, so anything
 * short of `resetModules` would test the first test's promise four more times.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type * as MonacoSetup from '../monaco-setup.ts';

const monaco = vi.hoisted(() => {
  interface Model {
    uri: string;
    language: string;
    text: string;
    dispose(): void;
  }

  const state = {
    /** Rejections before the language service starts answering. */
    rejections: 0,
    asks: 0,
    models: new Map<string, Model>(),
    created: [] as Model[],
    /** Ordered, because the order is the whole claim: model, then ask, then dispose. */
    log: [] as string[],
  };

  const api = {
    Uri: {
      parse: (path: string) => ({ path, toString: () => path }),
    },
    editor: {
      getModel: (uri: { toString: () => string }): Model | null =>
        state.models.get(uri.toString()) ?? null,
      /* Monaco throws outright on a second model at one URI, so this does too. */
      createModel: (text: string, language: string, uri: { toString: () => string }): Model => {
        const key = uri.toString();
        if (state.models.has(key)) throw new Error(`ModelService: Cannot add model ${key}`);
        const model: Model = {
          uri: key,
          language,
          text,
          dispose: (): void => {
            state.models.delete(key);
            state.log.push('dispose');
          },
        };
        state.models.set(key, model);
        state.created.push(model);
        state.log.push(`create ${language}`);
        return model;
      },
    },
    languages: {
      typescript: {
        getTypeScriptWorker: async (): Promise<unknown> => {
          state.asks += 1;
          state.log.push('ask');
          if (state.asks <= state.rejections) throw 'TypeScript not registered!';
          return {};
        },
      },
    },
  };

  return { state, api };
});

vi.mock('monaco-editor', () => monaco.api);
vi.mock('@monaco-editor/react', () => ({ loader: { config: (): void => {} } }));
vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({ default: class {} }));
vi.mock('monaco-editor/esm/vs/language/typescript/ts.worker?worker', () => ({ default: class {} }));

/** How long the loop is allowed to sit there, taken from the module rather than restated. */
const BUDGET_MS = 100 * 20;

async function load(): Promise<typeof MonacoSetup> {
  vi.resetModules();
  return import('../monaco-setup.ts');
}

beforeEach(() => {
  vi.useFakeTimers();
  monaco.state.rejections = 0;
  monaco.state.asks = 0;
  monaco.state.models.clear();
  monaco.state.created.length = 0;
  monaco.state.log.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('waiting for the language service', () => {
  test('does not finish while the service is still rejecting', async () => {
    monaco.state.rejections = 3;
    const { typescriptRegistered } = await load();

    let settled = false;
    const waiting = typescriptRegistered().then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(20);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(20);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(BUDGET_MS);
    await waiting;
    expect(settled).toBe(true);
    expect(monaco.state.asks).toBe(4);
  });

  test('the bare-string rejection never escapes as a rejection of its own', async () => {
    monaco.state.rejections = 2;
    const { typescriptRegistered } = await load();

    const waiting = typescriptRegistered();
    await vi.advanceTimersByTimeAsync(BUDGET_MS);

    await expect(waiting).resolves.toBeUndefined();
  });

  /*
   * Nothing sets the TypeScript mode up until something asks for the language, so a loop that
   * polled without ever creating a `typescript` model would sit out its whole budget and then give
   * up — the same silent failure with a longer fuse.
   */
  test('a typescript model is asked for before the first ask, and disposed after the last', async () => {
    monaco.state.rejections = 1;
    const { typescriptRegistered } = await load();

    const waiting = typescriptRegistered();
    await vi.advanceTimersByTimeAsync(BUDGET_MS);
    await waiting;

    expect(monaco.state.created.map((model) => model.language)).toEqual(['typescript']);
    expect(monaco.state.log[0]).toBe('create typescript');
    expect(monaco.state.log.at(-1)).toBe('dispose');
    expect(monaco.state.log.filter((entry) => entry === 'ask').length).toBe(2);
  });

  /*
   * Three subsystems call `ready()` and StrictMode mounts twice, so the second race against the
   * first is the case the whole fix exists for. One wait, one model, one disposal.
   */
  test('one model however many callers wait', async () => {
    monaco.state.rejections = 1;
    const { typescriptRegistered } = await load();

    const first = typescriptRegistered();
    expect(typescriptRegistered()).toBe(first);
    const all = Promise.all([first, typescriptRegistered(), typescriptRegistered()]);
    await vi.advanceTimersByTimeAsync(BUDGET_MS);
    await all;

    expect(monaco.state.created.length).toBe(1);
    expect(monaco.state.log.filter((entry) => entry === 'dispose').length).toBe(1);
    expect(monaco.state.asks).toBe(2);
  });

  /*
   * The give-up. A wait that never ended would hang every caller of `ready()` — the editor, the
   * transpile and the Repository — so the budget expires, says so once, and lets everyone through
   * to fail in a way that names itself.
   */
  test('gives up rather than hanging, and cleans up after itself', async () => {
    monaco.state.rejections = Number.POSITIVE_INFINITY;
    const complaints = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { typescriptRegistered } = await load();

    const waiting = typescriptRegistered();
    await vi.advanceTimersByTimeAsync(BUDGET_MS + 20);

    await expect(waiting).resolves.toBeUndefined();
    expect(monaco.state.asks).toBe(100);
    expect(monaco.state.models.size).toBe(0);
    expect(complaints).toHaveBeenCalledTimes(1);
    complaints.mockRestore();
  });
});
