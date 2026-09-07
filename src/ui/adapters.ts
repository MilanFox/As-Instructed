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
import type { ArtId, TileReadout } from '../render/index.ts';
import type { Trace, Vec, World } from '../engine/index.ts';
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

  /** The unwrapped runner, for the metagame's regression suite. */
  get simulation(): Runner {
    return this.runner;
  }

  prepare(levelId: string): void {
    this.levelId = levelId;
    void this.ready();
  }

  /**
   * Monaco, loaded and configured for the current work order.
   *
   * "Loaded" includes its TypeScript language service, which Monaco installs lazily and which
   * every caller here needs: the transpile, the library compile and the metagame all reach for it
   * the moment this resolves. `typescriptRegistered` is what makes that true rather than likely.
   */
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
   * The Repository, compiled and ready to link.
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

/**
 * Where the camera has put the grid, in CSS pixels from the canvas's top-left.
 *
 * Read by the monitor's graticule so the ruler in the bezel margin lines up with the tiles the
 * camera actually drew. It is a plain record rather than the `Camera` itself: the margin needs
 * four numbers per frame, not the ability to move the view.
 */
export interface BoardView {
  originX: number;
  originY: number;
  /** CSS pixels per tile. Fractional when dpr is. */
  tilePx: number;
  cols: number;
  rows: number;
}

/** The Canvas2D trace player. It owns the frame loop and reports its position back. */
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

  /**
   * The level's board before anything has run. A trace outranks it; `null` clears it.
   *
   * Deliberately not on `RendererPort`. The port is shared with `FakeRenderer`, which exists so
   * the store can be tested without a canvas, and a preview is a purely visual concern that the
   * fake would only ever no-op. The one caller narrows structurally instead, which keeps the
   * headless path from growing a method that means nothing to it.
   */
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

  /*
   * Everything from here down is off `RendererPort`, for the reason `setPreview` gives above: the
   * port is shared with `FakeRenderer`, which exists so the store can be tested without a canvas,
   * and every one of these is a purely visual concern the fake would only ever no-op. The site
   * monitor narrows structurally at its own call site instead, which keeps the headless path from
   * growing five methods that mean nothing to it.
   *
   * They are here because the renderer has shipped all of them since before the desk;
   * `Monitor.tsx` is what finally consumes them, through the hover readout below.
   */

  /**
   * The tile under the pointer, with everything on it. Subscribes; returns an unsubscribe.
   *
   * `onHover` is a `RendererOptions` field rather than a setter, so it has to be supplied when the
   * `Renderer` is constructed — which is why this is a listener set and not a passthrough.
   */
  onHover(listener: (readout: TileReadout | null) => void): () => void {
    this.hoverListeners.add(listener);
    return () => this.hoverListeners.delete(listener);
  }

  /**
   * The same readout for a point the pointer is not currently moving over.
   *
   * `onHover` fires on a change of *cell*, so a readout goes stale the moment the playhead moves
   * under a still pointer — crop maturity is read at the current tick. This is how the monitor
   * refreshes it without asking the player to jiggle the mouse.
   */
  readoutAt(cssX: number, cssY: number): TileReadout | null {
    return this.renderer.readoutAt(cssX, cssY);
  }

  setHover(cell: Vec | null): void {
    this.renderer.setHover(cell);
  }

  /** Releases the camera's hold and lean and refits the grid. */
  fit(): void {
    this.renderer.fit();
  }

  /**
   * One rung up or down `ZOOM_LADDER`, keeping the centre.
   *
   * The ladder lives on the camera and is not reimplemented here: a second copy of it is exactly
   * the duplication `src/__tests__/confessed-invariants.test.ts` exists to catch.
   */
  zoomBy(steps: number): void {
    this.renderer.camera.zoomBy(steps);
  }

  /** Device pixels per tile as the camera has it. A `ZOOM_LADDER` rung. */
  deviceTilePx(): number {
    return this.renderer.camera.deviceTilePx;
  }

  /**
   * Follow a bot, or `null` to let go.
   *
   * Only meaningful once the board is drawn larger than the picture that holds it, which the site
   * feed does deliberately on the campaign's biggest grids so that they open legible rather than
   * complete. A replay the player cannot follow off the edge of the screen would be a worse answer
   * than the small board it replaced.
   */
  setFollow(botId: number | null): void {
    this.renderer.setFollow(botId);
  }

  /** The Canvas2D half of the art direction; `chooseArt` in `src/ui/art.ts` is the CSS half. */
  setArt(id: ArtId): void {
    this.renderer.setArt(id);
  }

  /**
   * Where the grid is on the canvas right now, written into `out`.
   *
   * Written into a caller-supplied record rather than returned fresh because the graticule reads
   * it once a frame, and a fresh object per frame is the steady small allocation the draw-cost rule
   * and the renderer's own `frameInfo` both refuse to make.
   */
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
