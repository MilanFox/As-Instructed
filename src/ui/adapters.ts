import type { MonacoApi, RunRequest, RunResponse, RuntimeFailure } from '../runtime/index.ts';
import {
  PLAYER_FILE_PATH,
  Runner,
  cancelledFailure,
  compilePlayerCode,
  configurePlayerLanguage,
  importsLibrary,
} from '../runtime/index.ts';
import { Renderer } from '../render/index.ts';
import type { ArtId, CameraInset, TileReadout } from '../render/index.ts';
import type { Trace, Vec, World } from '../engine/index.ts';
import { LIBRARY_FAILURE, prepareLibrary, useLibrary } from '../meta/index.ts';
import type { CelebrationKind, RendererPort, RunSubmission, RunnerPort } from '../game/ports.ts';

type LibraryRequest = NonNullable<RunRequest['library']>;

export class RuntimeRunner implements RunnerPort {
  private readonly runner = new Runner();
  private loading: Promise<MonacoApi> | null = null;
  private levelId: string | null = null;
  private configuredFor: string | null = null;

  get simulation(): Runner {
    return this.runner;
  }

  prepare(levelId: string): void {
    this.levelId = levelId;
    void this.ready();
  }

  async ready(): Promise<MonacoApi> {
    this.loading ??= import('./monaco-setup.ts').then(async (module) => {
      const monaco = module.setupMonaco();
      await module.typescriptRegistered();
      return monaco;
    });
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

    // this.model writes into the editor's own document, so a submission the player has
    // already navigated away from would stamp the previous level's source into it.
    if (this.levelId !== submission.levelId) return { ok: false, error: cancelledFailure() };

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

export interface BoardView {
  originX: number;
  originY: number;
  tilePx: number;
  cols: number;
  rows: number;
}

export class CanvasRenderer implements RendererPort {
  private renderer = new Renderer({
    onFrame: (info) => this.emit(info.tick, info.playing),
    onHover: (readout) => this.emitHover(readout),
  });
  private readonly listeners = new Set<(tick: number, playing: boolean) => void>();
  private readonly hoverListeners = new Set<(readout: TileReadout | null) => void>();

  mount(canvas: HTMLCanvasElement): Promise<void> {
    return this.renderer.mount(canvas);
  }

  setTrace(trace: Trace | null): void {
    this.renderer.setTrace(trace);
  }

  setPreview(world: World | null): void {
    this.renderer.setPreview(world);
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

  onHover(listener: (readout: TileReadout | null) => void): () => void {
    this.hoverListeners.add(listener);
    return () => this.hoverListeners.delete(listener);
  }

  readoutAt(cssX: number, cssY: number): TileReadout | null {
    return this.renderer.readoutAt(cssX, cssY);
  }

  setHover(cell: Vec | null): void {
    this.renderer.setHover(cell);
  }

  fit(): void {
    this.renderer.fit();
  }

  setViewInset(inset: CameraInset): void {
    this.renderer.setViewInset(inset);
  }

  zoomBy(steps: number): void {
    this.renderer.camera.zoomBy(steps);
  }

  deviceTilePx(): number {
    return this.renderer.camera.deviceTilePx;
  }

  setFollow(botId: number | null): void {
    this.renderer.setFollow(botId);
  }

  setArt(id: ArtId): void {
    this.renderer.setArt(id);
  }

  readView(out: BoardView): BoardView {
    const camera = this.renderer.camera;
    out.originX = camera.originX();
    out.originY = camera.originY();
    out.tilePx = camera.tilePx;
    out.cols = camera.cols;
    out.rows = camera.rows;
    return out;
  }

  dispose(): void {
    this.listeners.clear();
    this.hoverListeners.clear();
    this.renderer.dispose();
  }

  private emit(tick: number, playing: boolean): void {
    for (const listener of this.listeners) listener(tick, playing);
  }

  private emitHover(readout: TileReadout | null): void {
    for (const listener of this.hoverListeners) listener(readout);
  }
}
