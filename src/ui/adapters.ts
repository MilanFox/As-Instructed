/**
 * The real subsystems, wrapped to fit `src/game/ports.ts`.
 *
 * This is the only file in the shell that knows `Runner`, `Renderer` or Monaco exist. Everything
 * upstream of it talks to the ports, which is what let the UI be built before either landed.
 */
import type { RunResponse } from '../runtime/index.ts';
import { PLAYER_FILE_PATH, Runner, compilePlayerCode, configurePlayerLanguage } from '../runtime/index.ts';
import { Renderer } from '../render/index.ts';
import type { Trace } from '../engine/index.ts';
import type { RendererPort, RunSubmission, RunnerPort } from '../game/ports.ts';
import { monaco, setupMonaco } from './monaco-setup.ts';

/**
 * Compile on the main thread, simulate in the worker.
 *
 * Monaco's TypeScript worker only exists here, so the transpile has to happen before the request
 * crosses into the sim worker (DESIGN.md §3). A compile error never reaches the worker at all.
 */
export class RuntimeRunner implements RunnerPort {
  private readonly runner = new Runner();

  prepare(levelId: string): void {
    setupMonaco();
    configurePlayerLanguage(monaco, { levelId });
  }

  async run(submission: RunSubmission): Promise<RunResponse> {
    setupMonaco();
    const model = this.model(submission.code);
    const compiled = await compilePlayerCode(monaco, model);
    if (!compiled.ok) return { ok: false, error: compiled.error };

    return this.runner.run({
      code: submission.code,
      js: compiled.js,
      lineMap: compiled.lineMap,
      levelId: submission.levelId,
      seeds: submission.seeds,
    });
  }

  cancel(): void {
    this.runner.cancel();
  }

  dispose(): void {
    this.runner.dispose();
  }

  /** The editor owns this model in practice; the fallback keeps Run working headlessly. */
  private model(code: string): monaco.editor.ITextModel {
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

  dispose(): void {
    this.listeners.clear();
    this.renderer.dispose();
  }

  private emit(tick: number, playing: boolean): void {
    for (const listener of this.listeners) listener(tick, playing);
  }
}
