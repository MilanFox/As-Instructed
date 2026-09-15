import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const setup = vi.hoisted(() => {
  const writes: string[] = [];
  let release: (() => void) | null = null;
  let registration = Promise.resolve();
  interface FakeModel {
    value: string;
    uri: { toString(): string };
    getValue(): string;
    setValue(next: string): void;
    dispose(): void;
  }
  let model: FakeModel | null = null;

  const monaco = {
    Uri: { parse: (path: string) => ({ path, toString: () => path }) },
    editor: {
      getModel: () => model,
      createModel: (value: string, _language: string, uri: { toString(): string }) => {
        writes.push(`created ${value}`);
        model = {
          value,
          uri,
          getValue() {
            return this.value;
          },
          setValue(next: string) {
            writes.push(`set ${next}`);
            this.value = next;
          },
          dispose() {
            model = null;
          },
        };
        return model;
      },
      getModels: () => (model ? [model] : []),
    },
    languages: {
      typescript: {
        ScriptTarget: { ESNext: 99 },
        ModuleKind: { ESNext: 99 },
        ModuleResolutionKind: { NodeJs: 2 },
        typescriptDefaults: {
          getCompilerOptions: () => ({}),
          setCompilerOptions: () => undefined,
          setDiagnosticsOptions: () => undefined,
          setEagerModelSync: () => undefined,
          setExtraLibs: () => undefined,
        },
        getTypeScriptWorker: () => Promise.reject(new Error('no language service in this test')),
      },
    },
  };

  return {
    writes,
    coldStart(): void {
      writes.length = 0;
      model = null;
      registration = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    serviceArrives(): void {
      release?.();
    },
    module: {
      THEME: 'as-instructed-dark',
      monaco,
      setupMonaco: () => monaco,
      typescriptRegistered: () => registration,
    },
  };
});

vi.mock('../monaco-setup.ts', () => setup.module);

class IdleWorker {
  onmessage: unknown = null;
  onerror: unknown = null;
  postMessage(): void {}
  terminate(): void {}
}

const globals = globalThis as { Worker?: unknown };

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function freshRunner(): Promise<{
  prepare(id: string): void;
  run(submission: {
    code: string;
    levelId: string;
    seeds: number[];
  }): Promise<{ ok: true } | { ok: false; error: { kind: string } }>;
}> {
  vi.resetModules();
  const { RuntimeRunner } = await import('../adapters.ts');
  return new RuntimeRunner();
}

beforeEach(() => {
  globals.Worker = IdleWorker;
  setup.coldStart();
});

afterEach(() => {
  delete globals.Worker;
});

describe('the editor document belongs to the level that is open', () => {
  test('a run the player has navigated away from never reaches the shared model', async () => {
    const runner = await freshRunner();
    runner.prepare('w1-01');
    const abandoned = runner.run({ code: 'the previous order', levelId: 'w1-01', seeds: [1] });

    runner.prepare('w1-02');
    setup.serviceArrives();

    const response = await abandoned.then(
      (settled) => settled,
      () => ({ ok: false, error: { kind: 'threw' } }) as const,
    );

    expect(setup.writes).toEqual([]);
    expect(response.ok).toBe(false);
    if (!response.ok) expect(response.error.kind).toBe('cancelled');
  });

  test('a run for the level that is still open does reach it', async () => {
    const runner = await freshRunner();
    runner.prepare('w1-01');
    const submitted = runner.run({ code: 'the current order', levelId: 'w1-01', seeds: [1] });

    setup.serviceArrives();
    await submitted.catch(() => undefined);
    await tick();

    expect(setup.writes).toEqual(['created the current order']);
  });
});
