/**
 * The trace player.
 *
 * The renderer never talks to the simulation (DESIGN.md §3). It is handed a finished `Trace` and
 * draws whatever tick it is told to, at a *fractional* tick so movement interpolates between the
 * integer ticks the engine actually produced.
 *
 * Before the first run there is no trace, and a black rectangle is not a level (AUDIT-UI.md F3).
 * `setPreview` takes the level's starting `World` and draws it still — same terrain, same
 * features, bots at rest — so the board is readable before anything has been executed. A trace
 * outranks a preview: `setTrace` takes the picture over and clearing it hands the picture back.
 *
 * Frame budget discipline:
 *
 * - Static terrain lives in an offscreen canvas and is rebuilt only when the current tick crosses
 *   a `tileChange` (see `terrain.ts`).
 * - Bot poses come from precompiled per-bot timelines (`timeline.ts`), so a frame is a binary
 *   search plus arithmetic — never a replay.
 * - The world snapshot behind items, machines and crops is recomputed via `replayTo` only when the
 *   world *revision* changes, which is a binary search over a precomputed tick array.
 * - Nothing in `frame()` allocates: poses, draw order and the particle pool are all preallocated.
 *
 * Consequence: scrubbing backwards costs exactly what scrubbing forwards costs.
 */

import {
  maturity,
  applyEvent,
  replayTo,
  reviveTrace,
  eventIndexAt,
  usesFuel,
  Terrain,
} from '../engine/index.ts';
import type { Bot, GroundStack, Machine, Trace, TraceEvent, Vec, World } from '../engine/index.ts';
import { Camera } from './camera.ts';
import type { ViewRange } from './camera.ts';
import { ParticleSystem, FX_LAYER_OVER, FX_LAYER_UNDER } from './fx.ts';
import type { FxName, FxOptions } from './fx.ts';
import {
  drawCelebration,
  drawGoals,
  drawGrid,
  drawHover,
  drawMark,
  drawOutOfBounds,
  drawPlantGauge,
  drawVignette,
  describeTile,
} from './overlays.ts';
import type { TileReadout } from './overlays.ts';
import {
  botDetailTilePx,
  drawBot,
  drawGroundStack,
  drawHeadlight,
  drawMachine,
  drawTreads,
} from './sprites.ts';
import type { BotDrawOptions } from './sprites.ts';
import { TerrainLayer } from './terrain.ts';
import { applyArtDirection, artDirection, botAccent, palette } from './theme.ts';
import type { ArtId } from './theme.ts';
import type { CropPaint, ItemPaint, MachinePaint, PostPaint } from './art/types.ts';
import {
  CONVEYOR_PHASES,
  TileSet,
  biomeForWorld,
  itemTileName,
  machineTileName,
  PLANT_STAGES,
  plantStageIndex,
  plantStageName,
  terrainArt,
} from './tiles.ts';
import type { Biome } from './tiles.ts';
import { TraceTimeline, createPose, dirVectorX, dirVectorY } from './timeline.ts';
import { VisitTrail } from './trail.ts';
import type { BotPose } from './timeline.ts';

/** Playback speed is expressed in engine ticks per wall-clock second. */
export const DEFAULT_SPEED = 4;

/**
 * What the end of a run felt like. `pass` and `fail` are the verdict on its own; the three medals
 * are the verdict plus a medal, and each is visually the same gesture at a different size — the
 * same escalation the audio stingers make (docs/AUDIO.md §8).
 */
export type CelebrationKind = 'gold' | 'silver' | 'bronze' | 'pass' | 'fail';

export interface CelebrationOptions {
  /** Where the flourish is centred, in tile coordinates. Defaults to the last acting bot. */
  at?: Vec;
  /**
   * Seconds to hold the screen wash for. The default is matched to the medal stinger; passing
   * anything much longer will start to feel like a cutscene, which this is not.
   */
  seconds?: number;
}

interface CelebrationState {
  kind: CelebrationKind;
  color: string;
  peak: number;
  elapsed: number;
  duration: number;
}

/**
 * Delay, in seconds, between `celebrate()` and the medal figure starting.
 *
 * `Conductor.outcome` plays the verdict immediately and the medal stinger 140ms later. The rings
 * are scheduled against the same number so the first ring lands on the first note, and the rest
 * step with it. Getting this wrong is the difference between "synchronised" and "nearly".
 *
 * It is duplicated from `MEDAL_BEAT` in `src/audio/conductor.ts` rather than imported: the
 * renderer does not depend on the audio system, and this is the one number the two must agree on.
 */
const MEDAL_BEAT = 0.14;

/**
 * The playback lean.
 *
 * `setHighlights` is called with the cells the objective in progress still has to reach, and it
 * is called again every time the run reaches one of them. So the camera is told where the work is
 * going several times a second during a busy stretch, and each telling refreshes a short focus —
 * which adds up to a view that sits slightly towards whatever the run is currently doing and
 * drifts back to centre when it stops doing anything.
 *
 * `LEAN_SECONDS` is the tail: long enough that consecutive refreshes overlap into one continuous
 * lean rather than a series of twitches, short enough that a run which stalls lets go on its own.
 * `LEAN_PULL` is deliberately below the celebration's 0.55 — a medal landing is an event and may
 * take the camera, an objective in progress is only the subject and may lean towards it. On a
 * grid that fits the viewport, which is most of them, `MAX_FOCUS_PX` caps the whole gesture at
 * fourteen pixels of drift.
 */
const LEAN_SECONDS = 2.4;
const LEAN_PULL = 0.32;

/**
 * `peak` is the opacity of the screen wash at the very edge of the viewport, measured rather than
 * guessed: at 0.3 a gold corner reads RGB 79 against a void of RGB 6, which is a glow, and glow is
 * exactly what DESIGN.md §8 forbids. At 0.2 it is unmistakably gold and still furniture.
 */
const CELEBRATION_TIERS: Readonly<
  Record<CelebrationKind, { color: string; peak: number; strength: number }>
> = {
  gold: { color: palette.gold, peak: 0.2, strength: 4 },
  silver: { color: palette.silver, peak: 0.13, strength: 3 },
  bronze: { color: palette.bronze, peak: 0.1, strength: 2 },
  pass: { color: palette.ok, peak: 0.09, strength: 0 },
  fail: { color: palette.danger, peak: 0.09, strength: 0 },
};

export interface FrameInfo {
  tick: number;
  endTick: number;
  playing: boolean;
  /** Milliseconds spent inside `frame()`, smoothed. */
  frameMs: number;
  fps: number;
  particles: number;
  terrainRebuilds: number;
}

export interface RendererOptions {
  /** World number, 1..8. Selects the biome palette (ASSETS.md §5). */
  world?: number;
  /** Attach pointer handlers for drag-pan, wheel-zoom and hover. Default true. */
  interactive?: boolean;
  /** Base URL for the tile atlas. */
  assetBase?: string;
  /** Art direction to select at construction. Defaults to whichever one is already current. */
  theme?: ArtId;
  onFrame?: (info: FrameInfo) => void;
  onComplete?: () => void;
  onHover?: (readout: TileReadout | null) => void;
  /** Mirrors `settings.celebrations`. Default true; false makes the whole arc a no-op. */
  celebrations?: boolean;
  /**
   * Forces the reduced-motion behaviour on or off. Omit to follow
   * `prefers-reduced-motion: reduce`, which is what it should normally do.
   */
  reducedMotion?: boolean;
}

const EMPTY_RANGE: ViewRange = { x0: 0, y0: 0, x1: 0, y1: 0 };

export class Renderer {
  readonly camera = new Camera();
  readonly particles = new ParticleSystem();

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private tiles: TileSet | null = null;
  private terrain = new TerrainLayer();

  private trace: Trace | null = null;
  private timeline: TraceTimeline | null = null;
  private trail: VisitTrail | null = null;

  /** Starting world for the still, pre-run board. Outranked by a trace while one is loaded. */
  private previewWorld: World | null = null;
  private previewUsesFuel = false;
  /** Resting poses, one per preview bot. Grown, never rebuilt — `frame()` must not allocate. */
  private readonly previewPoses: BotPose[] = [];
  private readonly previewOrder: number[] = [];

  private currentTick = 0;
  private playing = false;
  private speed = DEFAULT_SPEED;
  private biome: Biome = 'hangar';
  private worldNumber = 1;

  private snapshot: World | null = null;
  /** Integer tick `snapshot` is valid for. `-1` means "nothing yet". */
  private snapshotTick = -1;
  /** Index of the first trace event not yet applied to `snapshot`. */
  private workingIndex = 0;
  private snapshotUsesFuel = false;
  /**
   * World the three cell indices below describe.
   *
   * The replay path re-indexes whenever `refreshSnapshot` touches the snapshot. A preview has no
   * events to touch it, so the identity of the world it was built from is the whole cache key —
   * and it is also what stops a cleared trace leaving its stale cells behind the preview.
   */
  private indexedWorld: World | null = null;
  private readonly cropCells: number[] = [];
  private readonly markCells: number[] = [];
  private readonly conveyorCells: number[] = [];

  /**
   * One reused options bag for every `particles.emit`.
   *
   * A fresh object literal per emitted event is a small, *steady* allocation — a busy World 7
   * trace crosses hundreds of events a second — and steady small allocations are what turn into a
   * periodic multi-frame GC pause halfway through a replay. `emit` reads this synchronously and
   * never retains it, so one bag is enough. Every field is written on every call.
   */
  private readonly fx: Required<FxOptions> = {
    dx: 0,
    dy: 0,
    accent: palette.accent,
    seed: 0,
    strength: 1,
    delay: 0,
  };

  /**
   * The bag handed to an art direction's `backdrop` and `post` hooks.
   *
   * Rebuilt only when the context changes, for the same reason `this.fx` is reused: a direction
   * that paints a scanline pass would otherwise cost one object per frame for a whole replay.
   */
  private paint: PostPaint | null = null;

  /**
   * The bags handed to a direction's `drawMachine`, `drawCrop` and `drawItem`.
   *
   * One each, rewritten in place per call. A 25-tile field at 60 fps is 1500 object literals a
   * second if these are built inline, which is the allocation shape `this.fx` and `this.paint`
   * were already hoisted for. `ctx` is assigned on every call because the preview and the replay
   * hand in different contexts.
   */
  private readonly machinePaint: MachinePaint = {
    ctx: null as unknown as CanvasRenderingContext2D,
    x: 0,
    y: 0,
    tilePx: 0,
    kind: '',
    state: '',
    powered: false,
    facing: -1,
    time: 0,
    dpr: 1,
    reduced: false,
  };
  private readonly cropPaint: CropPaint = {
    ctx: null as unknown as CanvasRenderingContext2D,
    x: 0,
    y: 0,
    tilePx: 0,
    growth: 0,
    max: 0,
    stage: 0,
    stages: PLANT_STAGES.length,
    ripe: false,
    time: 0,
    dpr: 1,
    reduced: false,
  };
  private readonly itemPaint: ItemPaint = {
    ctx: null as unknown as CanvasRenderingContext2D,
    x: 0,
    y: 0,
    tilePx: 0,
    kind: '',
    count: 0,
    time: 0,
    dpr: 1,
    reduced: false,
  };

  private readonly poses = new Map<number, BotPose>();
  private readonly drawOrder: number[] = [];
  private readonly range: ViewRange = { ...EMPTY_RANGE };
  /** Hoisted out of `drawBots`: an inline comparator would be a new closure every frame. */
  private readonly byScreenDepth = (a: number, b: number): number => {
    const pa = this.poses.get(a) as BotPose;
    const pb = this.poses.get(b) as BotPose;
    return pa.y - pb.y || a - b;
  };
  /** The same, over `previewPoses` indices. A preview has no timeline and so no pose map. */
  private readonly byPreviewDepth = (a: number, b: number): number => {
    const pa = this.previewPoses[a] as BotPose;
    const pb = this.previewPoses[b] as BotPose;
    return pa.y - pb.y || a - b;
  };
  private readonly botOptions: BotDrawOptions = {
    accent: palette.accent,
    time: 0,
    active: false,
    carrying: 0,
    fuel: 1,
    showFuel: false,
    showLabel: false,
    rush: 0,
    reduced: false,
    dpr: 1,
  };

  private highlights: readonly Vec[] = [];
  private highlightsMet = false;
  /**
   * True once the player has panned or zoomed by hand.
   *
   * The lean is the camera taking an interest, and a camera that takes an interest in something
   * the player has just deliberately looked away from is a camera fighting them. So the first
   * manual pan or zoom hands the view over for the rest of this replay; `fit` and the next
   * `setTrace` give it back, and neither is far away.
   */
  private cameraHeld = false;
  /** A lean is in flight, as opposed to a celebration's focus. Only leans yield to the transport. */
  private leaning = false;
  private hoverCell: Vec | null = null;
  private activeBot: number | null = null;

  private readonly frameInfo: FrameInfo = {
    tick: 0,
    endTick: 0,
    playing: false,
    frameMs: 0,
    fps: 0,
    particles: 0,
    terrainRebuilds: 0,
  };

  private rafId = 0;
  private lastFrameTime = 0;
  private elapsed = 0;
  private frameMs = 0;
  private fps = 0;
  private emitCursor = 0;
  private disposed = false;

  /** Index of the `objective` event that completes the run. `-1` when the trace has none. */
  private finalObjective = -1;
  /** 0..1, decaying. The breath the picture takes when the run reaches its last tick. */
  private completion = 0;
  private celebration: CelebrationState | null = null;
  /** Mirrors `settings.celebrations`. False makes `celebrate` and `pulse` no-ops outright. */
  private celebrationsEnabled = true;
  /** Varies the staged pulses so fifteen commendations are not fifteen identical rings. */
  private pulseSeed = 0;
  private reducedOverride: boolean | null = null;
  private reducedMatch = false;
  private motionQuery: MediaQueryList | null = null;
  /**
   * Wall clock of the last camera kick. Twenty bots deadlocking against each other in World 7
   * would otherwise ask for twenty kicks on one frame, which is a shake, which is banned.
   */
  private lastKick = -1;

  private resizeObserver: ResizeObserver | null = null;
  private dprQuery: MediaQueryList | null = null;
  private dragging = false;
  private dragX = 0;
  private dragY = 0;
  private readonly options: RendererOptions;

  constructor(options: RendererOptions = {}) {
    this.options = options;
    this.worldNumber = options.world ?? 1;
    this.biome = biomeForWorld(this.worldNumber);
    this.reducedOverride = options.reducedMotion ?? null;
    this.celebrationsEnabled = options.celebrations !== false;
    if (options.theme) this.setArt(options.theme);
    this.watchMotion();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  async mount(canvas: HTMLCanvasElement): Promise<void> {
    if (this.disposed) throw new Error('Renderer: mount after dispose');
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) throw new Error('Renderer: 2d context unavailable');
    this.ctx = ctx;

    if (!this.tiles) {
      const opts = this.options.assetBase ? { baseUrl: this.options.assetBase } : {};
      this.tiles = await TileSet.load(opts);
    }

    this.observeSize();
    this.watchDpr();
    if (this.options.interactive !== false) this.attachPointer();

    this.resize();
    this.camera.fit(true);
    // A screenshot harness needs a handle on the live instance to switch directions and step
    // frames. `import.meta.env.DEV` is a compile-time constant, so this block is gone from a
    // production bundle rather than merely unreachable in it.
    if (import.meta.env.DEV) {
      (window as unknown as { __renderer?: Renderer }).__renderer = this;
    }
    this.startLoop();
  }

  dispose(): void {
    this.disposed = true;
    this.stopLoop();
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.motionQuery) {
      this.motionQuery.removeEventListener('change', this.onMotionChange);
      this.motionQuery = null;
    }
    if (this.dprQuery) {
      this.dprQuery.removeEventListener('change', this.onDprChange);
      this.dprQuery = null;
    }
    this.detachPointer();
    this.terrain.invalidate();
    this.particles.clear();
    this.trace = null;
    this.timeline = null;
    this.snapshot = null;
    this.previewWorld = null;
    this.indexedWorld = null;
    this.paint = null;
    this.canvas = null;
    this.ctx = null;
  }

  // -------------------------------------------------------------------------
  // Trace and transport
  // -------------------------------------------------------------------------

  setTrace(trace: Trace | null): void {
    this.trace = trace ? reviveTrace(trace) : null;
    this.timeline = trace ? new TraceTimeline(trace) : null;
    this.trail = this.timeline ? new VisitTrail(this.timeline) : null;
    this.snapshot = null;
    this.snapshotTick = -1;
    this.workingIndex = 0;
    this.currentTick = 0;
    this.emitCursor = 0;
    this.playing = false;
    this.particles.clear();
    this.terrain.invalidate();
    this.poses.clear();
    this.drawOrder.length = 0;
    this.skipCelebration();
    this.leaning = false;
    this.cameraHeld = false;
    this.completion = 0;
    this.finalObjective = lastObjectiveIndex(this.trace);

    if (trace && this.timeline) {
      for (const id of this.timeline.botOrder) this.poses.set(id, createPose(id));
      this.camera.setBounds({ cols: trace.initialWorld.w, rows: trace.initialWorld.h });
      this.camera.fit(true);
      this.snapshotUsesFuel = usesFuel(trace.initialWorld);
      this.refreshSnapshot(0);
    } else {
      // Clearing the trace hands the picture back to whatever preview was set behind it.
      this.enterPreview();
    }
  }

  /**
   * The level's starting world, drawn still until a trace arrives.
   *
   * This is the board a player sees while writing the program that will run on it: real terrain,
   * real machines and crops, bots parked where the level puts them, goal brackets on the cells
   * the objective is about. Nothing moves except the idle tells, because nothing has happened yet
   * — and under `prefers-reduced-motion` not even those.
   *
   * Setting a preview while a trace is loaded is legal and silent: the trace keeps the picture,
   * and the preview appears the moment `setTrace(null)` clears it.
   */
  setPreview(world: World | null): void {
    if (world === this.previewWorld) return;
    this.previewWorld = world;
    if (!world) return;
    this.ensurePreviewPoses(world.bots.length);
    if (!this.trace) this.enterPreview();
  }

  /** Frames the preview and rebuilds everything the replay path would have owned. */
  private enterPreview(): void {
    const world = this.previewWorld;
    if (!world) return;
    this.previewUsesFuel = usesFuel(world);
    this.ensurePreviewPoses(world.bots.length);
    this.indexSnapshot(world);
    this.terrain.invalidate();
    this.camera.setBounds({ cols: world.w, rows: world.h });
    this.camera.fit(true);
    this.cameraHeld = false;
    this.leaning = false;
  }

  /** Grows the pose pool. Never shrinks it: a level reload should not cost a fresh allocation. */
  private ensurePreviewPoses(count: number): void {
    while (this.previewPoses.length < count) this.previewPoses.push(createPose());
  }

  get tick(): number {
    return this.currentTick;
  }

  get endTick(): number {
    return this.trace?.endTick ?? 0;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get playbackSpeed(): number {
    return this.speed;
  }

  /** Jumps to a fractional tick. Backwards seeks reset the fx pool so replays stay honest. */
  seek(tick: number): void {
    const end = this.endTick;
    const next = Math.max(0, Math.min(end, tick));
    // Any deliberate move of the playhead outranks a celebration. Scrub-safety is the same rule
    // for pixels as for sound: nothing left ringing, nothing left on screen.
    if (next !== this.currentTick) {
      this.skipCelebration();
      this.releaseLean();
      this.completion = 0;
    }
    if (next < this.currentTick) {
      this.particles.clear();
      this.emitCursor = this.trace ? eventIndexAt(this.trace, next) : 0;
      // `eventIndexAt` returns the first event at or after `next`; events exactly at `next` have
      // already been shown, so step past them.
      if (this.trace) {
        while (
          this.emitCursor < this.trace.events.length &&
          (this.trace.events[this.emitCursor] as TraceEvent).t <= next
        ) {
          this.emitCursor++;
        }
      }
    }
    this.currentTick = next;
  }

  step(delta: number): void {
    this.seek(this.currentTick + delta);
  }

  play(speed?: number): void {
    if (speed !== undefined) this.speed = speed;
    this.skipCelebration();
    if (this.currentTick >= this.endTick) this.seek(0);
    this.playing = true;
    this.lean();
  }

  pause(): void {
    this.playing = false;
    // A camera still drifting after the player has stopped the run reads as lag, not as intent.
    this.releaseLean();
  }

  setSpeed(ticksPerSecond: number): void {
    this.speed = Math.max(0.1, ticksPerSecond);
  }

  // -------------------------------------------------------------------------
  // Presentation controls
  // -------------------------------------------------------------------------

  setWorld(world: number): void {
    this.worldNumber = world;
    this.biome = biomeForWorld(world);
    this.terrain.invalidate();
  }

  setBiome(biome: Biome): void {
    this.biome = biome;
    this.terrain.invalidate();
  }

  /**
   * Switches art direction, chrome included.
   *
   * `applyArtDirection` deliberately does not touch the terrain cache — the cache belongs to the
   * renderer, and this is the renderer telling it that the thing it keyed on has changed.
   */
  setArt(id: ArtId): void {
    applyArtDirection(id);
    this.terrain.invalidate();
  }

  /**
   * Cells the current objective is about. Drawn as pulsing brackets under the bots, and — while
   * the run is playing — leaned towards. See `LEAN_SECONDS`.
   */
  setHighlights(cells: readonly Vec[], met = false): void {
    this.highlights = cells;
    this.highlightsMet = met;
    this.lean();
  }

  /**
   * Points the camera a little way towards the work in progress.
   *
   * Every condition here is a reason the camera is already somebody else's: the player's hands,
   * a follow target, a celebration, a stopped playhead, or reduced motion — under which this is
   * the whole feature, and it is simply off.
   */
  private lean(): void {
    const at = this.highlights[0];
    if (!at) return;
    if (!this.playing || this.cameraHeld || this.reducedMotion) return;
    if (this.camera.following || this.celebration) return;
    this.camera.focus(at.x, at.y, LEAN_SECONDS, LEAN_PULL);
    this.leaning = true;
  }

  /** Drops a lean, leaving a celebration's focus alone. */
  private releaseLean(): void {
    if (!this.leaning) return;
    this.leaning = false;
    this.camera.releaseFocus();
  }

  setActiveBot(botId: number | null): void {
    this.activeBot = botId;
  }

  /** Follow-active-bot. Pass `null` to release the camera. */
  setFollow(botId: number | null): void {
    if (botId === null) {
      this.camera.follow(null);
      return;
    }
    const pose = this.poses.get(botId);
    if (pose) this.camera.follow(pose);
  }

  fit(): void {
    this.cameraHeld = false;
    this.leaning = false;
    this.camera.fit(true);
  }

  /** Tile under a CSS-pixel point, with everything on it as of the current tick. */
  readoutAt(cssX: number, cssY: number): TileReadout | null {
    const cell = this.camera.tileAtScreen(cssX, cssY);
    const world = this.world;
    if (!cell || !world) return null;
    return describeTile(world, cell.x, cell.y, Math.floor(this.currentTick));
  }

  setHover(cell: Vec | null): void {
    this.hoverCell = cell;
  }

  /**
   * The world as of the current tick, or the preview's starting world when no trace is loaded.
   * The UI may read it; it must not mutate it.
   */
  get world(): World | null {
    return this.snapshot ?? this.previewWorld;
  }

  // -------------------------------------------------------------------------
  // Celebrations
  // -------------------------------------------------------------------------

  /**
   * Plays the end-of-run flourish for a verdict.
   *
   * Call it at the same moment as `GameAudio.outcome({ passed, medal })` and the two line up:
   * the wash rises with the verdict tone, and one ring lands on each note of the medal figure.
   * There is no callback and nothing to await — it is decoration, it never blocks anything, and
   * a second call replaces the first rather than queueing behind it.
   *
   * ```ts
   * audio.outcome({ passed: verdict.passed, medal });
   * renderer.celebrate(medal === 'none' ? 'pass' : medal);
   * ```
   *
   * Under `prefers-reduced-motion` this still runs: the colour still arrives and the rings still
   * mark the beats, but the camera does not move and the burst does not fly.
   */
  celebrate(kind: CelebrationKind, options: CelebrationOptions = {}): void {
    const tier = CELEBRATION_TIERS[kind];
    if (!tier || !this.celebrationsEnabled) return;
    const reduced = this.reducedMotion;
    this.celebration = {
      kind,
      color: tier.color,
      peak: tier.peak,
      elapsed: 0,
      duration: options.seconds ?? (tier.strength > 0 ? 1.5 : 1),
    };

    // The finale outranks the lean; from here the focus belongs to the celebration arc.
    this.leaning = false;
    const at = options.at ?? this.celebrationCell();
    if (tier.strength > 0) {
      this.burst(
        'medal',
        at.x + 0.5,
        at.y + 0.5,
        tier.color,
        kind.length * 7919,
        0,
        0,
        tier.strength,
        MEDAL_BEAT,
      );
      // Silver and gold hand the moment to the machines that earned it: one small ring per bot,
      // rippling outward from the objective in the order they happen to be standing in. Cheap,
      // and it stops a good result being one ring in one corner of an otherwise still picture.
      if (tier.strength >= 3) {
        const order = this.drawOrder;
        const limit = Math.min(order.length, 6);
        for (let i = 0; i < limit; i++) {
          const pose = this.poses.get(order[i] as number);
          if (!pose?.present) continue;
          this.burst(
            'flourish',
            pose.x + 0.5,
            pose.y + 0.5,
            tier.color,
            i * 131 + 7,
            0,
            0,
            reduced ? 0.35 : 0.6,
            MEDAL_BEAT + 0.12 + i * 0.07,
          );
        }
      }
    } else {
      this.burst('objective', at.x + 0.5, at.y + 0.5, tier.color, 5, 0, 0, 1, 0);
    }
    if (!reduced) {
      this.camera.focus(at.x, at.y, 1.8, tier.strength > 0 ? 0.55 : 0.3);
      if (kind === 'gold') this.camera.kick(0, -1, 0.7);
    }
  }

  /**
   * One small beat on the objective, for a results screen that reveals itself in stages.
   *
   * `celebrate` is the medal landing — one call, one arc. A panel that ticks objectives off one at
   * a time, or lands commendations one by one, wants a beat per item instead, and this is it: a
   * single ring on the pad, no camera movement, no screen wash. Call it as each row arrives.
   *
   * ```ts
   * objectives.forEach((o, i) => { audio.cue('objective', i); renderer.pulse(); });
   * audio.medal(medal); renderer.celebrate(medal);
   * commendations.forEach((_, i) => { audio.commend(i); renderer.pulse('commend'); });
   * ```
   */
  pulse(kind: 'objective' | 'commend' = 'objective', at?: Vec): void {
    if (!this.celebrationsEnabled) return;
    const cell = at ?? this.celebrationCell();
    const color = kind === 'commend' ? palette.accent2 : palette.ok;
    this.burst(
      'objective',
      cell.x + 0.5,
      cell.y + 0.5,
      color,
      this.pulseSeed++,
      0,
      0,
      this.reducedMotion ? 0.5 : 1,
      0,
    );
  }

  /**
   * Master switch for everything on this page, mirroring `settings.celebrations`.
   *
   * Off means off: `celebrate` and `pulse` become no-ops rather than quieter, and anything already
   * in flight is cut. A player who has turned the reward sequence off has said something about
   * every run from now on, not about the volume of this one.
   */
  setCelebrationsEnabled(enabled: boolean): void {
    this.celebrationsEnabled = enabled;
    if (!enabled) this.skipCelebration();
  }

  get celebrationsAllowed(): boolean {
    return this.celebrationsEnabled;
  }

  /** Cuts a celebration dead. Called by every transport control, and safe to call at any time. */
  skipCelebration(): void {
    if (this.celebration) {
      this.celebration = null;
      this.camera.releaseFocus();
    }
  }

  get celebrating(): boolean {
    return this.celebration !== null;
  }

  /** Pass `null` to go back to following the media query. */
  setReducedMotion(value: boolean | null): void {
    this.reducedOverride = value;
  }

  get reducedMotion(): boolean {
    return this.reducedOverride ?? this.reducedMatch;
  }

  private onMotionChange = (): void => {
    this.reducedMatch = this.motionQuery?.matches ?? false;
  };

  private watchMotion(): void {
    if (typeof matchMedia === 'undefined') return;
    this.motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMatch = this.motionQuery.matches;
    this.motionQuery.addEventListener('change', this.onMotionChange);
  }

  /** Where a flourish belongs when the caller does not say: the objective, else the active bot. */
  private celebrationCell(): Vec {
    const highlight = this.highlights[this.highlights.length - 1];
    if (highlight) return highlight;
    const active = this.activeBot === null ? undefined : this.poses.get(this.activeBot);
    const pose = active ?? this.poses.get(this.drawOrder[0] ?? -1);
    if (pose) return { x: Math.round(pose.x), y: Math.round(pose.y) };
    const world = this.snapshot;
    return { x: world ? world.w / 2 - 0.5 : 0, y: world ? world.h / 2 - 0.5 : 0 };
  }

  // -------------------------------------------------------------------------
  // Loop
  // -------------------------------------------------------------------------

  private startLoop(): void {
    if (this.rafId) return;
    this.lastFrameTime = performance.now();
    const tick = (now: number): void => {
      this.rafId = requestAnimationFrame(tick);
      const dt = Math.min(0.1, Math.max(0, (now - this.lastFrameTime) / 1000));
      this.lastFrameTime = now;
      const started = performance.now();
      this.renderFrame(dt);
      const cost = performance.now() - started;
      this.frameMs += (cost - this.frameMs) * 0.1;
      this.fps += (1 / Math.max(dt, 1e-4) - this.fps) * 0.1;
      if (this.options.onFrame) {
        // Reused, not rebuilt: a fresh object every frame is the kind of small steady allocation
        // that turns into a periodic GC pause during a long replay.
        const info = this.frameInfo;
        info.tick = this.currentTick;
        info.endTick = this.endTick;
        info.playing = this.playing;
        info.frameMs = this.frameMs;
        info.fps = this.fps;
        info.particles = this.particles.live;
        info.terrainRebuilds = this.terrain.rebuilds;
        this.options.onFrame(info);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /**
   * Advances by `dt` seconds and draws one frame, synchronously.
   *
   * The RAF loop is the normal caller. It is public because a caller sometimes needs a frame
   * *now* and cannot wait for rAF — a thumbnail after a seek, or a frame-cost measurement in a
   * background tab, where Chrome throttles rAF to a few hertz and makes profiling meaningless.
   */
  renderFrame(dt = 0): void {
    this.advance(dt);
    this.frame();
  }

  private stopLoop(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private advance(dt: number): void {
    this.elapsed += dt;
    if (this.playing) {
      const next = this.currentTick + this.speed * dt;
      if (next >= this.endTick) {
        this.currentTick = this.endTick;
        this.playing = false;
        this.emitPending();
        // The run landing is its own small beat, before whatever the UI decides to say about it.
        // Everything settles for a second: the goal brackets brighten and the frame breathes in.
        this.completion = 1;
        this.options.onComplete?.();
      } else {
        this.currentTick = next;
      }
    }
    this.emitPending();
    if (this.completion > 0) {
      this.completion = Math.max(0, this.completion - dt / 0.9);
    }
    if (this.celebration) {
      this.celebration.elapsed += dt;
      if (this.celebration.elapsed >= this.celebration.duration) this.celebration = null;
    }
    this.particles.timeScale = Math.max(0.6, Math.min(3, this.speed / DEFAULT_SPEED));
    this.particles.update(dt);
    this.camera.update(dt);
  }

  /**
   * How hard playback is being pushed, 0..1. Below 8 ticks per second a bot moving one tile in
   * 125ms needs no help reading as motion; above it, the eye starts seeing teleports instead of
   * travel, and the smear and speed lines put the travel back.
   */
  private get rush(): number {
    if (this.reducedMotion) return 0;
    return Math.max(0, Math.min(1, (this.speed - 8) / 24));
  }

  /** Rate-limited so a room full of blocked bots produces one nudge, not a shake. */
  private nudge(dx: number, dy: number, strength: number): void {
    if (this.reducedMotion) return;
    if (this.elapsed - this.lastKick < 0.28) return;
    this.lastKick = this.elapsed;
    this.camera.kick(dx, dy, strength);
  }

  /** Fires fx for every trace event the playhead has passed since the last frame. */
  private emitPending(): void {
    const trace = this.trace;
    if (!trace) return;
    const events = trace.events;
    while (this.emitCursor < events.length) {
      const event = events[this.emitCursor] as TraceEvent;
      if (event.t > this.currentTick) break;
      this.emitFor(event, this.emitCursor);
      this.emitCursor++;
    }
  }

  /** Fills the reused options bag and fires one burst. Never allocates. */
  private burst(
    name: FxName,
    x: number,
    y: number,
    accent: string,
    seed: number,
    dx = 0,
    dy = 0,
    strength = 1,
    delay = 0,
  ): void {
    const fx = this.fx;
    fx.accent = accent;
    fx.seed = seed;
    fx.dx = dx;
    fx.dy = dy;
    fx.strength = strength;
    fx.delay = delay;
    this.particles.emit(name, x, y, fx);
  }

  private emitFor(event: TraceEvent, index: number): void {
    const accent =
      'botId' in event && typeof event.botId === 'number' ? botAccent(event.botId) : palette.accent;
    const damp = this.reducedMotion;
    switch (event.kind) {
      case 'fx':
        this.burst(
          event.fx as FxName,
          event.at.x + 0.5,
          event.at.y + 0.5,
          accent,
          event.t * 31 + event.at.x * 7 + event.at.y,
        );
        break;
      case 'move': {
        const from = event.from;
        const dx = event.to.x - from.x;
        const dy = event.to.y - from.y;
        if (event.ok) {
          this.burst(
            'move',
            from.x + 0.5 + dx * 0.5,
            from.y + 0.5 + dy * 0.5,
            accent,
            event.t * 17 + event.botId,
            dx,
            dy,
          );
          // The arrival puff, held back until the bot is actually there. In particle time, which
          // scales with playback speed, one engine tick is one `DEFAULT_SPEED`-th of a second.
          const dwell =
            ('dt' in event && typeof event.dt === 'number' ? event.dt : 1) / DEFAULT_SPEED;
          this.burst(
            'land',
            event.to.x + 0.5,
            event.to.y + 0.5,
            accent,
            event.t * 19 + event.botId,
            0,
            0,
            damp ? 0.5 : 1,
            dwell,
          );
        } else {
          // DESIGN.md §11 A5. The bump is drawn by the bot itself; this is the impact burst.
          const dirX = dirDeltaX(event.dir);
          const dirY = dirDeltaY(event.dir);
          this.burst(
            'blocked',
            from.x + 0.5,
            from.y + 0.5,
            accent,
            event.t * 23 + event.botId,
            dirX,
            dirY,
          );
          // A wall pushing back on the camera, once. It is the joke landing, not an alarm.
          this.nudge(dirX, dirY, 0.5);
        }
        break;
      }
      case 'send': {
        // A failed transmission gets the same "this did not work" language as a blocked move.
        const pose = this.poses.get(event.botId);
        if (!pose) break;
        this.burst(
          event.ok ? 'send' : 'sendFail',
          pose.x + 0.5,
          pose.y + 0.5,
          accent,
          event.t * 29 + event.botId,
        );
        break;
      }
      case 'objective':
        if (event.state === 'met') {
          // The last objective of a run is the one the whole thing was for, so it gets the bigger
          // gesture and the camera leans towards it. Every other one stays a quiet acknowledgement.
          const finale = index === this.finalObjective;
          const cells = this.highlights;
          const limit = Math.min(cells.length, 12);
          for (let i = 0; i < limit; i++) {
            const cell = cells[i] as Vec;
            this.burst(
              finale ? 'flourish' : 'objective',
              cell.x + 0.5,
              cell.y + 0.5,
              palette.ok,
              event.t * 13 + i,
              0,
              0,
              damp ? 0.45 : 1,
              finale ? i * 0.04 : 0,
            );
          }
          if (finale) {
            const focus = cells[0];
            if (focus && !damp) this.camera.focus(focus.x, focus.y, 1.5, 0.35);
            this.nudge(0, -1, 0.45);
          }
        }
        break;
      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // World snapshot
  // -------------------------------------------------------------------------

  /**
   * Keeps `this.snapshot` at `floor(tick)`.
   *
   * Playing forward applies the events the playhead just passed *in place*: no clone, so a long
   * run produces no garbage and the frame times stay flat instead of being punctuated by GC.
   * Seeking backwards falls back to `replayTo`, which starts from the nearest keyframe — that is
   * what keeps a backwards scrub as cheap as a forwards one (ENGINE.md §4).
   *
   * The snapshot is only ever read for items, machines, crops, marks and fuel. Bot *positions*
   * come from the timelines, because `replayTo` only knows integer ticks.
   */
  private refreshSnapshot(tick: number): void {
    const trace = this.trace;
    if (!trace) return;
    const t = Math.floor(tick);
    if (this.snapshot && t === this.snapshotTick) return;
    const events = trace.events;

    if (!this.snapshot || t < this.snapshotTick) {
      this.snapshot = replayTo(trace, t);
      this.workingIndex = eventIndexAt(trace, t);
      while (
        this.workingIndex < events.length &&
        (events[this.workingIndex] as TraceEvent).t <= t
      ) {
        this.workingIndex++;
      }
      this.snapshotTick = t;
      this.indexSnapshot(this.snapshot);
      return;
    }

    let touched = false;
    while (this.workingIndex < events.length && (events[this.workingIndex] as TraceEvent).t <= t) {
      applyEvent(this.snapshot, events[this.workingIndex] as TraceEvent);
      this.workingIndex++;
      touched = true;
    }
    this.snapshotTick = t;
    if (touched) this.indexSnapshot(this.snapshot);
  }

  /**
   * Caches the cells that need per-frame attention, so `frame()` never scans the whole grid.
   * Indexes straight off `world.tiles` rather than through `tileAt`, which would allocate a
   * position object per cell.
   */
  private indexSnapshot(world: World): void {
    this.indexedWorld = world;
    this.cropCells.length = 0;
    this.markCells.length = 0;
    this.conveyorCells.length = 0;
    const tiles = world.tiles;
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (!tile) continue;
      if (tile.maxGrowth !== undefined && tile.maxGrowth > 0) this.cropCells.push(i);
      if (tile.mark) this.markCells.push(i);
      if (tile.terrain === Terrain.Conveyor) this.conveyorCells.push(i);
    }
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  private frame(): void {
    const ctx = this.ctx;
    const canvas = this.canvas;
    const tiles = this.tiles;
    if (!ctx || !canvas || !tiles) return;

    const dpr = this.camera.dpr;
    const deviceW = canvas.width;
    const deviceH = canvas.height;

    const art = artDirection();
    const paint = this.artPaint(ctx, deviceW, deviceH, dpr);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (art.backdrop) {
      art.backdrop(paint);
    } else {
      ctx.fillStyle = palette.bgVoid;
      ctx.fillRect(0, 0, deviceW, deviceH);
    }

    const timeline = this.trace ? this.timeline : null;
    let world: World | null = null;
    let tick = 0;
    if (timeline) {
      tick = this.currentTick;
      this.refreshSnapshot(tick);
      world = this.snapshot;
    } else if (this.previewWorld) {
      world = this.previewWorld;
      if (this.indexedWorld !== world) this.indexSnapshot(world);
    }
    paint.preview = world !== null && timeline === null;

    // The post pass is the direction's treatment of the *canvas*, not of the board, so an empty
    // canvas still gets it — a CRT that switches itself off between levels is not a CRT.
    if (!world) {
      art.post?.(paint);
      return;
    }

    const tilePx = this.camera.deviceTilePx;
    // Snapping the world origin to whole device pixels is what keeps the cached terrain layer
    // crisp; bot positions stay fractional inside this transform, so motion is still smooth.
    const originX = Math.round(this.camera.originX() * dpr);
    const originY = Math.round(this.camera.originY() * dpr);
    ctx.setTransform(1, 0, 0, 1, originX, originY);
    paint.originX = originX;
    paint.originY = originY;
    paint.tilePx = tilePx;
    paint.cols = world.w;
    paint.rows = world.h;
    this.camera.visibleRange(this.range, 1);

    // --- terrain -----------------------------------------------------------
    this.terrain.sync(
      world,
      tiles,
      this.biome,
      timeline ? timeline.terrainRevision(tick) : 0,
      tilePx,
    );
    const cache = this.terrain.canvas;
    const cacheTile = this.terrain.cacheTilePx;
    ctx.imageSmoothingEnabled = tilePx < cacheTile;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cache, 0, 0, cache.width, cache.height, 0, 0, world.w * tilePx, world.h * tilePx);

    // The visited-tile trail sits between the floor and the grid: the grid lines stay legible on
    // top of it, and every feature, mark, item and bot below draws over it (DESIGN.md §11 A5).
    if (this.trail) {
      this.trail.sync(tick);
      this.trail.draw(ctx, tilePx, this.range);
    }

    drawGrid(ctx, tilePx, this.range, 5, dpr);
    drawOutOfBounds(ctx, world.w, world.h, tilePx, dpr);
    drawGoals(ctx, this.highlights, tilePx, this.elapsed, this.highlightsMet, this.completion, dpr);

    // --- features ----------------------------------------------------------
    ctx.imageSmoothingEnabled = tilePx < cacheTile;
    this.drawConveyors(ctx, world, tilePx);
    this.drawCrops(ctx, world, tilePx, tick);
    this.drawMachines(ctx, world, tilePx);
    this.drawMarks(ctx, world, tilePx);

    // --- items -------------------------------------------------------------
    this.drawItems(ctx, world, tilePx);

    // --- fx under ----------------------------------------------------------
    this.particles.draw(ctx, FX_LAYER_UNDER, tilePx);

    // --- bots --------------------------------------------------------------
    if (timeline) this.drawBots(ctx, timeline, world, tilePx, tick);
    else this.drawRestingBots(ctx, world, tilePx);

    // --- fx over -----------------------------------------------------------
    this.particles.draw(ctx, FX_LAYER_OVER, tilePx);

    // --- top overlays ------------------------------------------------------
    if (this.hoverCell) drawHover(ctx, this.hoverCell, tilePx, dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawVignette(ctx, deviceW, deviceH);

    const show = this.celebration;
    if (show) {
      // In, hold, out. The rise is short enough to feel like a response and long enough that it
      // is a fade rather than a flash — nothing here is ever one frame of bright.
      const u = show.elapsed / show.duration;
      const envelope = u < 0.12 ? u / 0.12 : Math.max(0, 1 - (u - 0.12) / 0.88);
      drawCelebration(ctx, deviceW, deviceH, show.color, envelope * show.peak);
    }

    art.post?.(paint);
  }

  /** Refreshes the reused hook bag. Rebuilt only when the context behind it changes. */
  private artPaint(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dpr: number,
  ): PostPaint {
    let paint = this.paint;
    if (!paint || paint.ctx !== ctx) {
      paint = {
        ctx,
        width,
        height,
        dpr,
        time: 0,
        preview: false,
        reducedMotion: false,
        originX: 0,
        originY: 0,
        tilePx: 0,
        cols: 0,
        rows: 0,
      };
      this.paint = paint;
    }
    paint.width = width;
    paint.height = height;
    paint.dpr = dpr;
    paint.time = this.elapsed;
    paint.reducedMotion = this.reducedMotion;
    // Cleared rather than left alone: the bag outlives the frame, and a `post` handed last frame's
    // transform on a frame that drew no board would place its marks on a board that is not there.
    paint.tilePx = 0;
    paint.cols = 0;
    paint.rows = 0;
    return paint;
  }

  private inRange(x: number, y: number): boolean {
    return (
      x >= this.range.x0 - 1 &&
      x <= this.range.x1 + 1 &&
      y >= this.range.y0 - 1 &&
      y <= this.range.y1 + 1
    );
  }

  private drawConveyors(ctx: CanvasRenderingContext2D, world: World, tilePx: number): void {
    const tiles = this.tiles;
    if (!tiles || this.conveyorCells.length === 0) return;
    // A direction that paints its own terrain painted its own conveyors with it (art/types.ts),
    // and this pass would drop a 48px atlas frame on top of them.
    if (artDirection().paintTerrain) return;
    const phase = Math.floor(this.elapsed * 8) % CONVEYOR_PHASES.length;
    const name = CONVEYOR_PHASES[phase] as string;
    for (let c = 0; c < this.conveyorCells.length; c++) {
      const index = this.conveyorCells[c] as number;
      const x = index % world.w;
      const y = (index / world.w) | 0;
      if (!this.inRange(x, y)) continue;
      tiles.draw(ctx, name, x * tilePx, y * tilePx, tilePx);
    }
  }

  /**
   * Crops. Maturity is *derived* from the tick (ENGINE.md §6.4), so it changes on frames where no
   * event fired — which is exactly why crops cannot live in the cached terrain layer.
   */
  private drawCrops(
    ctx: CanvasRenderingContext2D,
    world: World,
    tilePx: number,
    tick: number,
  ): void {
    if (this.cropCells.length === 0) return;
    const tiles = this.tiles;
    const painter = artDirection().drawCrop;
    if (!tiles && !painter) return;
    const t = Math.floor(tick);
    const paint = this.cropPaint;
    paint.ctx = ctx;
    paint.tilePx = tilePx;
    paint.time = this.elapsed;
    paint.dpr = this.camera.dpr;
    paint.reduced = this.reducedMotion;
    for (let c = 0; c < this.cropCells.length; c++) {
      const index = this.cropCells[c] as number;
      const x = index % world.w;
      const y = (index / world.w) | 0;
      if (!this.inRange(x, y)) continue;
      const tile = world.tiles[index];
      if (!tile) continue;
      const max = tile.maxGrowth ?? 0;
      const growth = maturity(tile, t);
      if (painter) {
        paint.x = x;
        paint.y = y;
        paint.growth = growth;
        paint.max = max;
        paint.stage = plantStageIndex(growth, max);
        paint.ripe = growth >= max;
        painter(paint);
        continue;
      }
      (tiles as TileSet).draw(ctx, plantStageName(growth, max), x * tilePx, y * tilePx, tilePx);
      drawPlantGauge(ctx, x, y, tilePx, growth, max, this.elapsed, this.camera.dpr);
    }
  }

  private drawMachines(ctx: CanvasRenderingContext2D, world: World, tilePx: number): void {
    const tiles = this.tiles;
    const painter = artDirection().drawMachine;
    if (!tiles && !painter) return;
    const paint = this.machinePaint;
    paint.ctx = ctx;
    paint.tilePx = tilePx;
    paint.time = this.elapsed;
    paint.dpr = this.camera.dpr;
    paint.reduced = this.reducedMotion;
    for (let m = 0; m < world.machines.length; m++) {
      const machine = world.machines[m] as Machine;
      if (!this.inRange(machine.at.x, machine.at.y)) continue;
      const powered =
        machine.state === 'on' || machine.state === 'open' || machine.state === 'busy';
      if (painter) {
        paint.x = machine.at.x;
        paint.y = machine.at.y;
        paint.kind = machine.kind;
        paint.state = machine.state;
        paint.powered = powered;
        paint.facing = machine.facing ?? -1;
        painter(paint);
        continue;
      }
      drawMachine(
        ctx,
        tiles as TileSet,
        machineTileName(machine.kind, machine.state),
        machine.at.x,
        machine.at.y,
        tilePx,
        powered,
        this.elapsed,
        this.camera.dpr,
      );
    }
  }

  private drawItems(ctx: CanvasRenderingContext2D, world: World, tilePx: number): void {
    if (world.items.length === 0) return;
    const tiles = this.tiles;
    const painter = artDirection().drawItem;
    if (!tiles && !painter) return;
    const paint = this.itemPaint;
    paint.ctx = ctx;
    paint.tilePx = tilePx;
    paint.time = this.elapsed;
    paint.dpr = this.camera.dpr;
    paint.reduced = this.reducedMotion;
    for (let i = 0; i < world.items.length; i++) {
      const stack = world.items[i] as GroundStack;
      if (stack.count <= 0) continue;
      if (!this.inRange(stack.at.x, stack.at.y)) continue;
      if (painter) {
        paint.x = stack.at.x;
        paint.y = stack.at.y;
        paint.kind = stack.kind;
        paint.count = stack.count;
        painter(paint);
        continue;
      }
      drawGroundStack(
        ctx,
        tiles as TileSet,
        itemTileName(stack.kind),
        stack.at.x,
        stack.at.y,
        stack.count,
        tilePx,
        this.elapsed,
        this.camera.dpr,
      );
    }
  }

  private drawMarks(ctx: CanvasRenderingContext2D, world: World, tilePx: number): void {
    for (let c = 0; c < this.markCells.length; c++) {
      const index = this.markCells[c] as number;
      const x = index % world.w;
      const y = (index / world.w) | 0;
      if (!this.inRange(x, y)) continue;
      const tile = world.tiles[index];
      if (!tile?.mark) continue;
      drawMark(ctx, tile.mark, x, y, tilePx, this.camera.dpr);
    }
  }

  /**
   * All bots, each on its own virtual clock (DESIGN.md §11 A5). Poses are read from precompiled
   * timelines, so two bots whose clocks differ are legitimately at different points in their
   * animations on the same frame.
   */
  private drawBots(
    ctx: CanvasRenderingContext2D,
    timeline: TraceTimeline,
    world: World,
    tilePx: number,
    tick: number,
  ): void {
    const order = this.drawOrder;
    order.length = 0;
    const ids = timeline.botOrder;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i] as number;
      const bot = timeline.timelineFor(id);
      const pose = this.poses.get(id);
      if (!bot || !pose) continue;
      bot.poseAt(tick, pose);
      if (!pose.present) continue;
      if (!this.inRange(Math.round(pose.x), Math.round(pose.y))) continue;
      order.push(id);
    }
    // Painter's order: further up the screen draws first, so overlapping bots stack correctly.
    order.sort(this.byScreenDepth);

    const dpr = this.camera.dpr;
    if (tilePx >= botDetailTilePx() * dpr) {
      for (let i = 0; i < order.length; i++) {
        const id = order[i] as number;
        const bot = timeline.timelineFor(id);
        if (bot) drawTreads(ctx, bot, tick, tilePx, botAccent(id));
      }
      for (let i = 0; i < order.length; i++) {
        drawHeadlight(ctx, this.poses.get(order[i] as number) as BotPose, tilePx, dpr);
      }
    }
    const opts = this.botOptions;
    opts.rush = this.rush;
    opts.reduced = this.reducedMotion;
    opts.dpr = dpr;
    for (let i = 0; i < order.length; i++) {
      const id = order[i] as number;
      const pose = this.poses.get(id) as BotPose;
      const record = botRecord(world, id);
      opts.accent = botAccent(id);
      opts.time = this.elapsed;
      opts.active = this.activeBot === id;
      opts.carrying = record ? countItems(record.inventory) : 0;
      const hasFuel = Boolean(record) && Number.isFinite(record?.fuelMax ?? Infinity);
      opts.fuel = hasFuel && record ? record.fuel / record.fuelMax : 1;
      // A level opts into fuel per *bot* (ENGINE.md §3a), so a ring on every bot in a mixed level
      // would be a lie. Only gauge the ones that can run dry.
      opts.showFuel = this.snapshotUsesFuel && hasFuel;
      opts.showLabel = timeline.botOrder.length > 1;
      drawBot(ctx, pose, tilePx, opts);
    }
  }

  /**
   * The same bots, standing still, for the pre-run board.
   *
   * No timeline exists yet, so there are no treads to lay down and no clocks to disagree about.
   * Everything else is the replay path: same sprite, same accents, same painter's order, so the
   * moment the run starts nothing about the picture jumps.
   */
  private drawRestingBots(ctx: CanvasRenderingContext2D, world: World, tilePx: number): void {
    const bots = world.bots;
    this.ensurePreviewPoses(bots.length);
    const reduced = this.reducedMotion;
    const order = this.previewOrder;
    order.length = 0;
    for (let i = 0; i < bots.length; i++) {
      const pose = restingPose(
        bots[i] as Bot,
        this.elapsed,
        reduced,
        this.previewPoses[i] as BotPose,
      );
      if (!this.inRange(pose.x, pose.y)) continue;
      order.push(i);
    }
    order.sort(this.byPreviewDepth);

    const dpr = this.camera.dpr;
    if (tilePx >= botDetailTilePx() * dpr) {
      for (let i = 0; i < order.length; i++) {
        drawHeadlight(ctx, this.previewPoses[order[i] as number] as BotPose, tilePx, dpr);
      }
    }
    const opts = this.botOptions;
    opts.rush = 0;
    opts.reduced = reduced;
    opts.dpr = dpr;
    opts.time = this.elapsed;
    opts.showLabel = bots.length > 1;
    for (let i = 0; i < order.length; i++) {
      const index = order[i] as number;
      const record = bots[index] as Bot;
      const pose = this.previewPoses[index] as BotPose;
      opts.accent = botAccent(record.id);
      opts.active = this.activeBot === record.id;
      opts.carrying = countItems(record.inventory);
      const hasFuel = Number.isFinite(record.fuelMax);
      opts.fuel = hasFuel ? record.fuel / record.fuelMax : 1;
      opts.showFuel = this.previewUsesFuel && hasFuel;
      drawBot(ctx, pose, tilePx, opts);
    }
  }

  // -------------------------------------------------------------------------
  // Sizing and input
  // -------------------------------------------------------------------------

  private observeSize(): void {
    const canvas = this.canvas;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
  }

  private onDprChange = (): void => {
    this.watchDpr();
    this.resize();
  };

  private watchDpr(): void {
    if (typeof matchMedia === 'undefined') return;
    this.dprQuery?.removeEventListener('change', this.onDprChange);
    this.dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    this.dprQuery.addEventListener('change', this.onDprChange);
  }

  /**
   * Resizes the backing store to device pixels. Drawing happens in device space, so a DPR change
   * only has to move the camera's ladder — nothing downstream needs to know.
   */
  resize(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(rect.width || canvas.clientWidth || 1));
    const cssH = Math.max(1, Math.round(rect.height || canvas.clientHeight || 1));
    const deviceW = Math.max(1, Math.round(cssW * dpr));
    const deviceH = Math.max(1, Math.round(cssH * dpr));
    const changed =
      canvas.width !== deviceW || canvas.height !== deviceH || this.camera.dpr !== dpr;
    if (canvas.width !== deviceW) canvas.width = deviceW;
    if (canvas.height !== deviceH) canvas.height = deviceH;
    this.camera.setViewport(cssW, cssH, dpr);
    if (changed) this.camera.fit(false);
  }

  private onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 && event.button !== 1) return;
    this.dragging = true;
    this.dragX = event.clientX;
    this.dragY = event.clientY;
    this.canvas?.setPointerCapture(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent): void => {
    const canvas = this.canvas;
    if (!canvas) return;
    if (this.dragging) {
      this.camera.panBy(event.clientX - this.dragX, event.clientY - this.dragY);
      this.dragX = event.clientX;
      this.dragY = event.clientY;
      this.cameraHeld = true;
      this.leaning = false;
    }
    const rect = canvas.getBoundingClientRect();
    const cell = this.camera.tileAtScreen(event.clientX - rect.left, event.clientY - rect.top);
    const changed = cell?.x !== this.hoverCell?.x || cell?.y !== this.hoverCell?.y;
    this.hoverCell = cell;
    if (changed && this.options.onHover) {
      const world = this.world;
      this.options.onHover(
        cell && world ? describeTile(world, cell.x, cell.y, Math.floor(this.currentTick)) : null,
      );
    }
  };

  private onPointerUp = (event: PointerEvent): void => {
    this.dragging = false;
    this.canvas?.releasePointerCapture?.(event.pointerId);
  };

  private onPointerLeave = (): void => {
    this.dragging = false;
    this.hoverCell = null;
    this.options.onHover?.(null);
  };

  private onWheel = (event: WheelEvent): void => {
    const canvas = this.canvas;
    if (!canvas) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    this.cameraHeld = true;
    this.leaning = false;
    this.camera.zoomBy(
      event.deltaY < 0 ? 1 : -1,
      event.clientX - rect.left,
      event.clientY - rect.top,
    );
  };

  private attachPointer(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private detachPointer(): void {
    const canvas = this.canvas;
    if (!canvas) return;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    canvas.removeEventListener('wheel', this.onWheel);
  }
}

/** Slowest of the idle oscillations, so a row of parked bots breathes rather than flickers. */
const REST_IDLE_HZ = 0.55;
/**
 * Floor of the resting `idle` value.
 *
 * `idle` is a gate, not an amplitude — `sprites.ts` only asks whether it is above zero — so this
 * has to stay positive through the whole cycle or the waiting tell would strobe on and off once
 * a second, which is precisely the thing it exists to avoid.
 */
const REST_IDLE_FLOOR = 0.4;

/**
 * A bot standing on the board with nothing to do yet.
 *
 * Pure, and written into a caller-owned pose, because the preview runs inside `frame()` and
 * `frame()` does not allocate. The only animated field is `idle`: a resting bot is *waiting for
 * a program*, and a board of frozen machines reads as a broken canvas rather than as a level
 * ready to run. Under `prefers-reduced-motion` the oscillation flattens to its floor, which keeps
 * the tell present and stops it moving.
 */
export function restingPose(
  bot: Bot,
  elapsed: number,
  reducedMotion: boolean,
  out: BotPose = createPose(bot.id),
): BotPose {
  out.id = bot.id;
  out.present = true;
  out.alive = bot.alive;
  out.x = bot.at.x;
  out.y = bot.at.y;
  out.facing = bot.facing;
  out.travel = 0;
  out.stretch = 0;
  out.settle = 0;
  out.blocked = 0;
  out.anticipate = 0;
  out.recoil = 0;
  out.action = 0;
  out.actionKind = '';
  out.idle = reducedMotion
    ? REST_IDLE_FLOOR
    : REST_IDLE_FLOOR +
      (1 - REST_IDLE_FLOOR) * (0.5 + 0.5 * Math.sin(elapsed * REST_IDLE_HZ * Math.PI * 2 + bot.id));
  out.failed = false;
  out.dx = dirVectorX(bot.facing);
  out.dy = dirVectorY(bot.facing);
  out.atX = bot.at.x;
  out.atY = bot.at.y;
  out.clock = 0;
  return out;
}

function countItems(inventory: readonly { count: number }[]): number {
  let total = 0;
  for (let i = 0; i < inventory.length; i++) total += (inventory[i] as { count: number }).count;
  return total;
}

function botRecord(world: World, id: number): Bot | undefined {
  for (let i = 0; i < world.bots.length; i++) {
    const bot = world.bots[i] as Bot;
    if (bot.id === id) return bot;
  }
  return undefined;
}

/**
 * Index of the `objective` event that finishes the run, or `-1`.
 *
 * "The last objective met" is deliberately positional rather than semantic: the renderer has no
 * business knowing which objective mattered, only that this was the one after which nothing else
 * was achieved, which is precisely the one worth a flourish.
 */
function lastObjectiveIndex(trace: Trace | null): number {
  if (!trace) return -1;
  const events = trace.events;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i] as TraceEvent;
    if (event.kind === 'objective' && event.state === 'met') return i;
  }
  return -1;
}

function dirDeltaX(dir: number): number {
  return dir === 1 ? 1 : dir === 3 ? -1 : 0;
}

function dirDeltaY(dir: number): number {
  return dir === 2 ? 1 : dir === 0 ? -1 : 0;
}

export { terrainArt };
export type { TileReadout };
