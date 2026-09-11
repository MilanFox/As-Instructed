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
    rejections: 0,
    asks: 0,
    models: new Map<string, Model>(),
    created: [] as Model[],
    log: [] as string[],
  };

  const api = {
    Uri: {
      parse: (path: string) => ({ path, toString: () => path }),
    },
    editor: {
      getModel: (uri: { toString: () => string }): Model | null =>
        state.models.get(uri.toString()) ?? null,
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
