/**
 * The race that made a player's own `import` red.
 *
 * Monaco installs its TypeScript language service lazily, behind `onLanguage('typescript')`. Until
 * that dynamic import lands, `getTypeScriptWorker()` rejects — with the bare string
 * `TypeScript not registered!`, which carries no message and reached the console as an
 * `Uncaught (in promise)` with nothing in it. The noise was the small half. The large half is that
 * `installTypes` asked for the worker in the same tick as mount, before any editor existed, lost
 * the race on a cold module cache, and the `declare module 'lib'` it exists to publish was
 * **silently never installed** — so a player who imported their own published routine stared at a
 * red squiggle until the next Run.
 *
 * What is asserted here is the ordering guarantee, not the absence of a console message. A test
 * that watched `console.error` would go green the moment someone wrapped the same race in a
 * `catch`, and the declaration would still not be installed.
 *
 * The guarantee has one statement and one place it holds: **`RuntimeRunner.ready()` does not hand
 * Monaco to anybody until the TypeScript language service will answer.** Every path into Monaco in
 * this app is downstream of `ready()` — `installTypes`, the transpile, the library compile, the
 * regression suite — so pinning it there pins all of them. `typescriptRegistered` is stubbed the
 * way a slow cold load behaves: pending, then resolved when the test says the service arrived.
 *
 * *Not covered, and it is a resolution problem rather than a design one:* the polling and warm-up
 * model inside `typescriptRegistered` itself. `monaco-editor`'s package.json declares `module` and
 * no `main`, so vite cannot resolve it under node and no test file can even mock it. The exact
 * config change that would open it up exists but is not applied here.
 */
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
    /** A cold load: nothing resolves until `serviceArrives()` is called. */
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

/**
 * `RuntimeRunner` warms the simulation worker on construction, and node has no `Worker`. Nothing
 * below runs a program, so this only has to exist.
 */
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

/**
 * The bug, stated as an ordering.
 *
 * `configurePlayerLanguage` is what pushes the work order's ambient declarations into the language
 * service, and on the Repository's path the same call installs `declare module 'lib'`. Landing it
 * before the service exists is landing it in nothing — which is exactly what a player saw as a red
 * `import` that cleared itself on the next Run.
 */
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

/**
 * StrictMode mounts twice and the workspace, the Repository and the regression suite all call
 * `ready()`. One registration, waited on by everyone, is what stops the double mount from starting
 * a second race against the first.
 */
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
