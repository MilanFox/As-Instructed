import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const setup = vi.hoisted(() => {
  const events: string[] = [];
  let release: (() => void) | null = null;
  let registration = Promise.resolve();

  const monaco = {
    editor: {
      getModel: () => null,
      createModel: () => ({ dispose: () => undefined }),
      getModels: () => [],
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
          setExtraLibs: () => events.push('declarations installed'),
        },
      },
    },
  };

  return {
    events,
    monaco,
    coldStart(): void {
      events.length = 0;
      registration = new Promise<void>((resolve) => {
        release = () => {
          events.push('service up');
          resolve();
        };
      });
    },
    warmStart(): void {
      events.length = 0;
      release = null;
      registration = Promise.resolve();
    },
    serviceArrives(): void {
      release?.();
    },
    module: {
      THEME: 'bootstrap-dark',
      monaco,
      setupMonaco: () => {
        events.push('editor configured');
        return monaco;
      },
      typescriptRegistered: () => {
        events.push('waiting on the language service');
        return registration;
      },
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

async function freshRunner(): Promise<{ ready(): Promise<unknown>; prepare(id: string): void }> {
  vi.resetModules();
  const { RuntimeRunner } = await import('../adapters.ts');
  return new RuntimeRunner();
}

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const globals = globalThis as { Worker?: unknown };

beforeEach(() => {
  globals.Worker = IdleWorker;
  setup.warmStart();
});

afterEach(() => {
  delete globals.Worker;
});

describe('nothing is handed Monaco before the language service will answer', () => {
  test('ready() stays pending for as long as the service is still installing', async () => {
    setup.coldStart();
    const runner = await freshRunner();

    let ready = false;
    const waiting = runner.ready().then(() => {
      setup.events.push('ready');
      ready = true;
    });

    await tick();
    await tick();
    expect(ready).toBe(false);

    setup.serviceArrives();
    await waiting;

    expect(setup.events).toEqual([
      'editor configured',
      'waiting on the language service',
      'service up',
      'ready',
    ]);
  });

  test('the editor is wired first and waited on second, not the other way round', async () => {
    setup.coldStart();
    const runner = await freshRunner();
    void runner.ready();

    await tick();

    expect(setup.events).toEqual(['editor configured', 'waiting on the language service']);
  });

  test('a warm load still goes through the wait rather than around it', async () => {
    const runner = await freshRunner();

    await runner.ready();

    expect(setup.events).toContain('waiting on the language service');
  });
});

describe('the declarations are installed after the service exists, never before', () => {
  test('a level prepared on a cold load publishes nothing until the service is up', async () => {
    setup.coldStart();
    const runner = await freshRunner();
    runner.prepare('w1-01');

    await tick();
    await tick();
    expect(setup.events).not.toContain('declarations installed');

    setup.serviceArrives();
    await runner.ready();

    expect(setup.events.indexOf('declarations installed')).toBeGreaterThan(
      setup.events.indexOf('service up'),
    );
  });
});

describe('one wait, however many callers', () => {
  test('concurrent callers share the single registration', async () => {
    setup.coldStart();
    const runner = await freshRunner();

    const all = Promise.all([runner.ready(), runner.ready(), runner.ready()]);
    await tick();
    setup.serviceArrives();
    await all;

    expect(
      setup.events.filter((event) => event === 'waiting on the language service'),
    ).toHaveLength(1);
    expect(setup.events.filter((event) => event === 'editor configured')).toHaveLength(1);
  });

  test('and a later caller does not restart it', async () => {
    const runner = await freshRunner();
    await runner.ready();
    await runner.ready();

    expect(
      setup.events.filter((event) => event === 'waiting on the language service'),
    ).toHaveLength(1);
  });
});
