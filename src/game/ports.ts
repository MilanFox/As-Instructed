/**
 * Adapter seam between the UI and the two subsystems it does not own.
 *
 * The shell is built and tested against these interfaces only. `src/runtime` and `src/render` ship
 * their own classes (`Runner`, `Renderer`); `src/ui/adapters.ts` wraps them to fit, and the fakes
 * below stand in wherever a browser is not available — tests, and any point at which either
 * subsystem is missing.
 */
import type { Trace, Verdict } from '../engine/index.ts';
import { FailureCode, Sim, buildVerdict, cloneWorld, isSimError } from '../engine/index.ts';
import type { RunResponse } from '../runtime/protocol.ts';
import { getLevel } from '../levels/index.ts';
import { countChars } from './score.ts';

/** What the shell knows at Run time. Transpiling to JS is the adapter's job, not the shell's. */
export interface RunSubmission {
  /** The player's TypeScript, exactly as typed. */
  code: string;
  levelId: string;
  seeds: number[];
}

/**
 * Compiles and runs player source, and answers with a trace and a verdict.
 *
 * Contract the UI relies on:
 *  - `run` resolves with a `RunResponse` for success and failure alike; it rejects only when the
 *    host itself broke.
 *  - `cancel` is always safe, is idempotent, and may be called when nothing is running. The shell
 *    never waits for it: after cancelling it drops the in-flight request by token, so a wedged
 *    worker cannot soft-lock anything (DESIGN.md §10.6).
 *  - `prepare` is called on every level change and installs exactly the hardware unlocked at that
 *    level into the editor's language service.
 */
export interface RunnerPort {
  prepare(levelId: string): void;
  run(submission: RunSubmission): Promise<RunResponse>;
  cancel(): void;
  dispose(): void;
}

/**
 * Draws a trace into a canvas and owns the playback clock.
 *
 * The renderer runs the frame loop, because it is the thing that has to interpolate; the shell
 * mirrors the position through `onTick` and pushes the player's intent back down through
 * `seek`/`play`/`pause`. Speeds are in engine ticks per wall-clock second.
 */
export interface RendererPort {
  mount(canvas: HTMLCanvasElement): void | Promise<void>;
  setTrace(trace: Trace | null): void;
  /** Selects the world's biome and palette. */
  setWorld(world: number): void;
  seek(tick: number): void;
  play(ticksPerSecond: number): void;
  pause(): void;
  /** Subscribes to playback position. Returns an unsubscribe. */
  onTick(listener: (tick: number, playing: boolean) => void): () => void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const HANG_MARKER = '@hang';

export interface FakeRunnerOptions {
  /** Simulated worker latency, in ms. */
  latencyMs?: number;
  /** Never settle any run, whatever the source says. Proves the shell survives a wedged worker. */
  neverReturns?: boolean;
}

/**
 * Stand-in for `src/runtime`. It binds a small subset of the player API straight onto a `Sim` and
 * evaluates the source with `new Function`, which is enough to exercise the whole shell: real
 * worlds, real traces, real verdicts.
 *
 * It is emphatically not the runtime. There is no worker, no TypeScript transpile and no
 * watchdog, so it runs on the calling thread. Source containing `@hang` returns a promise that
 * never settles, which is how the cancel path is tested.
 */
export class FakeRunner implements RunnerPort {
  private cancelled = false;
  private readonly latencyMs: number;
  private readonly neverReturns: boolean;

  constructor(options: FakeRunnerOptions = {}) {
    this.latencyMs = options.latencyMs ?? 220;
    this.neverReturns = options.neverReturns ?? false;
  }

  prepare(): void {}

  run(submission: RunSubmission): Promise<RunResponse> {
    this.cancelled = false;
    if (this.neverReturns || submission.code.includes(HANG_MARKER)) {
      return new Promise<RunResponse>(() => {});
    }
    return new Promise((resolve) => {
      setTimeout(() => {
        if (this.cancelled) return;
        resolve(this.execute(submission));
      }, this.latencyMs);
    });
  }

  cancel(): void {
    this.cancelled = true;
  }

  dispose(): void {
    this.cancelled = true;
  }

  private execute(submission: RunSubmission): RunResponse {
    const level = getLevel(submission.levelId);
    if (!level) {
      return { ok: false, error: { kind: 'runtime', message: 'No such work order.' } };
    }

    const seed = submission.seeds[0] ?? level.seeds[0] ?? 1;
    const world = level.build(seed);
    const initialWorld = cloneWorld(world);
    const sim = new Sim(world, level.costs ? { costs: level.costs } : {});
    const botId = world.bots[0]?.id ?? 0;

    let failure: Verdict['failure'];
    try {
      evaluatePlayerSource(submission.code, sim, botId);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof SyntaxError) {
        return { ok: false, error: { kind: 'compile', message, line: 1, column: 1 } };
      }
      failure = { code: isSimError(error) ? error.code : FailureCode.Crash, message };
    }

    const trace = sim.finish();
    const verdict: Verdict = buildVerdict({
      objectives: level.objectives,
      world: sim.world,
      trace,
      initialWorld,
      ops: sim.ops,
      chars: countChars(submission.code),
      seeds: submission.seeds.length,
      spend: sim.spendTotals(),
      ...(failure ? { failure } : {}),
    });

    return {
      ok: true,
      trace,
      traceSeed: seed,
      verdict,
      results: submission.seeds.map((each) => ({
        seed: each,
        passed: verdict.passed,
        ticks: verdict.stats.ticks,
        ops: verdict.stats.ops,
        objectives: verdict.objectives,
      })),
      ...(verdict.passed ? {} : { failedSeed: seed }),
    };
  }
}

/** Binds the API names onto a `Sim` and evaluates the source. Development only. */
function evaluatePlayerSource(code: string, sim: Sim, botId: number): void {
  const api: Record<string, unknown> = {
    Dir: { North: 0, East: 1, South: 2, West: 3 },
    move: (dir: 0 | 1 | 2 | 3) => sim.move(botId, dir),
    pos: () => sim.pos(botId),
    canMove: (dir: 0 | 1 | 2 | 3) => sim.canMove(botId, dir),
    wait: (n?: number) => sim.wait(botId, n ?? 1),
    print: (text: unknown) => sim.print(botId, String(text)),
    scan: (dir?: 0 | 1 | 2 | 3) => sim.scan(botId, dir),
  };
  const names = Object.keys(api);
  const body = `"use strict";\n${code}\n`;
  const fn = new Function(...names, body) as (...args: unknown[]) => void;
  fn(...names.map((name) => api[name]));
}

/**
 * Stand-in for `src/render`. Draws the trace's world as flat tiles plus the bots at the current
 * tick — enough to lay the viewport out honestly, and no more.
 */
export class FakeRenderer implements RendererPort {
  private canvas: HTMLCanvasElement | null = null;
  private trace: Trace | null = null;
  private tick = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly listeners = new Set<(tick: number, playing: boolean) => void>();

  mount(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.draw();
  }

  setTrace(trace: Trace | null): void {
    this.trace = trace;
    this.tick = 0;
    this.draw();
  }

  setWorld(): void {}

  seek(tick: number): void {
    this.tick = tick;
    this.draw();
  }

  play(ticksPerSecond: number): void {
    this.pause();
    const end = this.trace?.endTick ?? 0;
    this.timer = setInterval(() => {
      this.tick = Math.min(end, this.tick + ticksPerSecond / 20);
      this.draw();
      const playing = this.tick < end;
      if (!playing) this.pause();
      for (const listener of this.listeners) listener(this.tick, playing);
    }, 50);
  }

  pause(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  onTick(listener: (tick: number, playing: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.pause();
    this.listeners.clear();
    this.canvas = null;
    this.trace = null;
  }

  private draw(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);

    const trace = this.trace;
    if (!trace) return;

    const world = trace.initialWorld;
    const tileSize = Math.max(
      12,
      Math.min(48, Math.floor(Math.min(width / world.w, height / world.h))),
    );
    const originX = Math.round((width - world.w * tileSize) / 2);
    const originY = Math.round((height - world.h * tileSize) / 2);

    for (let y = 0; y < world.h; y++) {
      for (let x = 0; x < world.w; x++) {
        const tile = world.tiles[y * world.w + x];
        ctx.fillStyle = FAKE_TILE_COLORS[tile?.terrain ?? 'void'] ?? '#141b24';
        ctx.fillRect(originX + x * tileSize, originY + y * tileSize, tileSize - 1, tileSize - 1);
      }
    }

    const positions = new Map<number, { x: number; y: number }>();
    for (const bot of world.bots) positions.set(bot.id, { x: bot.at.x, y: bot.at.y });
    for (const event of trace.events) {
      if (event.t > this.tick) break;
      if (event.kind === 'move' && event.ok) positions.set(event.botId, event.to);
    }

    for (const [, at] of positions) {
      ctx.fillStyle = '#35e0c8';
      const pad = Math.round(tileSize * 0.2);
      ctx.fillRect(
        originX + at.x * tileSize + pad,
        originY + at.y * tileSize + pad,
        tileSize - pad * 2,
        tileSize - pad * 2,
      );
    }
  }
}

const FAKE_TILE_COLORS: Record<string, string> = {
  void: '#0a0e14',
  floor: '#1b2430',
  wall: '#2f4157',
  pad: '#2a4a46',
  regolith: '#232b33',
  soil: '#23301f',
  rock: '#333c46',
  ore: '#3b3524',
  rubble: '#2a3038',
  ice: '#26363f',
  pit: '#0d1117',
  cable: '#1f2c3a',
  depot: '#33301f',
  conveyor: '#242f3c',
};
