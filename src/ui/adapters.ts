/**
 * The real subsystems, wrapped to fit `src/game/ports.ts`.
 *
 * This is the only file in the shell that knows `Runner`, `Renderer` or Monaco exist. Everything
 * upstream of it talks to the ports, which is what let the UI be built before either landed.
 *
 * Monaco is reached through a dynamic `import()`. It is by a wide margin the largest thing in the
 * build, the game opens on the site map, and nothing on that screen can type — so the editor is
 * fetched alongside the first paint instead of before it.
 */
import type { MonacoApi, RunRequest, RunResponse, RuntimeFailure } from '../runtime/index.ts';
import {
  PLAYER_FILE_PATH,
  Runner,
  compilePlayerCode,
  configurePlayerLanguage,
  importsLibrary,
} from '../runtime/index.ts';
import { Renderer } from '../render/index.ts';
import type { Trace, Vec } from '../engine/index.ts';
import { LIBRARY_FAILURE, prepareLibrary, useLibrary } from '../meta/index.ts';
import type { CelebrationKind, RendererPort, RunSubmission, RunnerPort } from '../game/ports.ts';

type LibraryRequest = NonNullable<RunRequest['library']>;

/**
 * Compile on the main thread, simulate in the worker.
 *
 * Monaco's TypeScript worker only exists here, so the transpile has to happen before the request
 * crosses into the sim worker (DESIGN.md §3). A compile error never reaches the worker at all.
 */
export class RuntimeRunner implements RunnerPort {
  private readonly runner = new Runner();
  private loading: Promise<MonacoApi> | null = null;
  private levelId: string | null = null;
  private configuredFor: string | null = null;

  /** The unwrapped runner, for the metagame's regression suite (docs/LIBRARY.md §6). */
  get simulation(): Runner {
    return this.runner;
  }

  prepare(levelId: string): void {
    this.levelId = levelId;
    void this.ready();
  }

  /** Monaco, loaded and configured for the current work order. */
  async ready(): Promise<MonacoApi> {
    this.loading ??= import('./monaco-setup.ts').then((module) => module.setupMonaco());
    const monaco = await this.loading;
    if (this.levelId && this.configuredFor !== this.levelId) {
      configurePlayerLanguage(monaco, { levelId: this.levelId });
      this.configuredFor = this.levelId;
    }
    return monaco;
  }

  async run(submission: RunSubmission): Promise<RunResponse> {
    const monaco = await this.ready();

    const library = await this.library(monaco, submission.code);
    if (library.error) return { ok: false, error: library.error };

    const model = this.model(monaco, submission.code);
    const compiled = await compilePlayerCode(monaco, model);
    if (!compiled.ok) return { ok: false, error: compiled.error };

    return this.runner.run({
      code: submission.code,
      js: compiled.js,
      lineMap: compiled.lineMap,
      levelId: submission.levelId,
      seeds: submission.seeds,
      ...(library.request ? { library: library.request } : {}),
    });
  }

  cancel(): void {
    this.runner.cancel();
  }

  dispose(): void {
    this.runner.dispose();
  }

  /**
   * The Repository, compiled and ready to link (docs/LIBRARY.md §6, step 2).
   *
   * Before the unlock there is no `lib.ts` to build, so this costs nothing at all for the first
   * three worlds. Afterwards it runs on every Run — that is also what installs `declare module
   * 'lib'`, so the player's own `import` type-checks in the editor.
   */
  private async library(
    monaco: MonacoApi,
    code: string,
  ): Promise<{ request?: LibraryRequest; error?: RuntimeFailure }> {
    const state = useLibrary.getState();
    if (!state.save.unlocked) return {};

    const prepared = await prepareLibrary(monaco, state.source);
    if (prepared.request) return { request: prepared.request };
    if (!importsLibrary(code)) return {};
    return {
      error: {
        kind: 'compile',
        file: 'lib',
        message: LIBRARY_FAILURE.notCompiled,
        line: prepared.problems[0]?.line ?? 1,
        column: 1,
      },
    };
  }

  /** The editor owns this model in practice; the fallback keeps Run working headlessly. */
  private model(monaco: MonacoApi, code: string): ReturnType<MonacoApi['editor']['createModel']> {
    const uri = monaco.Uri.parse(PLAYER_FILE_PATH);
    const existing = monaco.editor.getModel(uri);
    if (existing) {
      if (existing.getValue() !== code) existing.setValue(code);
      return existing;
    }
    return monaco.editor.createModel(code, 'typescript', uri);
  }
}

/** The Canvas2D trace player. It owns the frame loop and reports its position back. */
export class CanvasRenderer implements RendererPort {
  private renderer = new Renderer({ onFrame: (info) => this.emit(info.tick, info.playing) });
  private readonly listeners = new Set<(tick: number, playing: boolean) => void>();

  mount(canvas: HTMLCanvasElement): Promise<void> {
    return this.renderer.mount(canvas);
  }

  setTrace(trace: Trace | null): void {
    this.renderer.setTrace(trace);
  }

  setWorld(world: number): void {
    this.renderer.setWorld(world);
  }

  seek(tick: number): void {
    this.renderer.seek(tick);
  }

  play(ticksPerSecond: number): void {
    this.renderer.play(ticksPerSecond);
  }

  pause(): void {
    this.renderer.pause();
  }

  onTick(listener: (tick: number, playing: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setHighlights(cells: readonly Vec[], met = false): void {
    this.renderer.setHighlights(cells, met);
  }

  celebrate(kind: CelebrationKind): void {
    this.renderer.celebrate(kind);
  }

  pulse(kind: 'objective' | 'commend' = 'objective'): void {
    this.renderer.pulse(kind);
  }

  setCelebrationsEnabled(enabled: boolean): void {
    this.renderer.setCelebrationsEnabled(enabled);
  }

  skipCelebration(): void {
    this.renderer.skipCelebration();
  }

  dispose(): void {
    this.listeners.clear();
    this.renderer.dispose();
  }

  private emit(tick: number, playing: boolean): void {
    for (const listener of this.listeners) listener(tick, playing);
  }
}
