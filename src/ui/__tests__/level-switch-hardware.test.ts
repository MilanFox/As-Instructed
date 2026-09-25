import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { MonacoApi, RunResponse, WorkerRequestMessage } from '../../runtime/index.ts';
import { serveRunRequest } from '../../runtime/serve.ts';
import { createFakeMonaco } from '../../runtime/__tests__/fake-monaco.ts';
import { solution as w1_01 } from '../../levels/world-1/__solutions__/w1-01.ts';
import { campaignOrder } from '../../levels/index.ts';
import type { RunSubmission, RunnerPort } from '../../game/ports.ts';
import { emptyProgress, emptySave, exportSave } from '../../game/save.ts';
import { useGame } from '../../game/store.ts';
import { RuntimeRunner } from '../adapters.ts';

const FIRMWARE_PATH = 'file:///as-instructed/firmware.d.ts';

const setup = vi.hoisted(() => ({
  monaco: null as unknown,
  firmware: [] as string[],
}));

vi.mock('../monaco-setup.ts', () => ({
  THEME: 'as-instructed-dark',
  get monaco() {
    return setup.monaco;
  },
  setupMonaco: () => setup.monaco,
  typescriptRegistered: () => Promise.resolve(),
}));

interface Lib {
  content: string;
  filePath?: string;
}

// Monaco 0.52 stores setExtraLibs and hands it to the TypeScript worker on a later task,
// without telling anyone when; a compile issued before then checks the old declarations.
function monacoThatAppliesLibsLate(): MonacoApi {
  const fake = createFakeMonaco();
  const monaco = fake.monaco;
  const loose = monaco as unknown as Record<string, unknown>;
  const defaults = monaco.languages.typescript.typescriptDefaults as unknown as {
    setExtraLibs(libs: readonly Lib[]): void;
  };
  const apply = defaults.setExtraLibs.bind(defaults);
  defaults.setExtraLibs = (libs) => {
    const firmware = libs.find((lib) => lib.filePath === FIRMWARE_PATH);
    if (firmware) setup.firmware.push(firmware.content);
    setTimeout(() => apply(libs), 0);
  };

  const models = new Map<string, { uri: { toString(): string }; getValue(): string }>();
  const modelAt = (uri: string, text: string) => {
    let current = text;
    fake.model(uri, current);
    const model = {
      uri: { toString: () => uri },
      getValue: () => current,
      setValue: (next: string) => {
        current = next;
        fake.model(uri, next);
      },
      dispose: () => models.delete(uri),
    };
    models.set(uri, model);
    return model;
  };
  loose['Uri'] = { parse: (path: string) => ({ path, toString: () => path }) };
  loose['editor'] = {
    getModel: (uri: { toString(): string }) => models.get(uri.toString()) ?? null,
    createModel: (text: string, _language: string, uri: { toString(): string }) =>
      modelAt(uri.toString(), text),
    getModels: () => [...models.values()],
  };
  return monaco;
}

class InProcessWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  postMessage(message: unknown): void {
    const { requestId, request } = message as WorkerRequestMessage;
    const response = serveRunRequest(request);
    queueMicrotask(() => {
      this.onmessage?.({ data: { type: 'result', requestId, response } } as MessageEvent);
    });
  }

  terminate(): void {
    this.onmessage = null;
  }
}

class RecordingRunner implements RunnerPort {
  readonly inner = new RuntimeRunner();
  readonly responses: Promise<RunResponse>[] = [];

  prepare(levelId: string): void {
    this.inner.prepare(levelId);
  }

  run(submission: RunSubmission): Promise<RunResponse> {
    const response = this.inner.run(submission);
    this.responses.push(response);
    return response;
  }

  cancel(): void {
    this.inner.cancel();
  }

  dispose(): void {
    this.inner.dispose();
  }
}

const globals = globalThis as { Worker?: unknown };
let runner: RecordingRunner;

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function dispatch(code: string): Promise<RunResponse> {
  useGame.getState().setCode(code);
  useGame.getState().run();
  const response = runner.responses[runner.responses.length - 1] as Promise<RunResponse>;
  const settled = await response;
  await tick();
  return settled;
}

function failures(response: RunResponse): string[] {
  if (!response.ok) return [response.error.message];
  return response.results.flatMap((result) => (result.failure ? [result.failure.message] : []));
}

beforeEach(async () => {
  setup.firmware.length = 0;
  setup.monaco = monacoThatAppliesLibsLate();
  globals.Worker = InProcessWorker;
  useGame.setState({ save: emptySave(), runState: 'idle', surveySeed: null });
  runner = new RecordingRunner();
  useGame.getState().attachRunner(runner);
  useGame.getState().openLevel('w1-01');
  await runner.inner.ready();
  await tick();
});

afterEach(() => {
  delete globals.Worker;
});

describe('a level switch never needs a reload for its commands', () => {
  test('first-time unlock: close w1-01, advance, and canMove() works straight away', async () => {
    const closed = await dispatch(w1_01.source);
    expect(failures(closed)).toEqual([]);
    expect(useGame.getState().save.levels['w1-01']?.completed).toBe(true);

    useGame.getState().advanceToNextLevel();
    expect(useGame.getState().currentLevelId).toBe('w1-02');
    expect(failures(await dispatch('if (canMove(Dir.East)) move(Dir.East);'))).toEqual([]);
  });

  test('replaying an older level refuses the newer command, and moving forward restores it', async () => {
    const program = 'if (canMove(Dir.East)) move(Dir.East);';
    await dispatch(w1_01.source);
    useGame.getState().openLevel('w1-02');
    expect(failures(await dispatch(program))).toEqual([]);

    useGame.getState().openLevel('w1-01');
    const refused = failures(await dispatch(program));
    expect(refused.length).toBeGreaterThan(0);
    for (const message of refused) {
      expect(message).toBe('`canMove()` is not available yet. You get it in level w1-02.');
    }

    useGame.getState().openLevel('w1-02');
    expect(failures(await dispatch(program))).toEqual([]);
  });

  test('importing a save opens later levels whose commands work without a reload', async () => {
    const save = emptySave();
    for (const level of campaignOrder()) {
      if (level.id === 'w2-01') break;
      save.levels[level.id] = { ...emptyProgress(), completed: true };
    }
    useGame.getState().importSaveFile(exportSave(save));
    useGame.getState().openLevel('w2-01');
    expect(useGame.getState().currentLevelId).toBe('w2-01');
    expect(failures(await dispatch('const here = scan();\nprint(String(here.walkable));'))).toEqual(
      [],
    );
  });

  test('the editor is handed one set of declarations, whichever level is open', async () => {
    for (const level of campaignOrder()) {
      runner.prepare(level.id);
      await runner.inner.ready();
    }
    expect(setup.firmware.length).toBeGreaterThan(0);
    expect(new Set(setup.firmware).size).toBe(1);
  });
});
