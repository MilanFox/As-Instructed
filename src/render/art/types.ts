/**
 * What an art direction is allowed to change.
 *
 * The renderer used to read colour from one frozen record in `theme.ts`. That was enough to
 * restyle the board and not enough to *draw* it: the terrain came off a fixed atlas, the bot was
 * a rounded rect, and every direction built on those two ended up as the same picture in a
 * different palette. So a direction owns the mark-making as well as the colour — it may take over
 * the cached terrain layer, both bot forms, the backdrop behind the board and a screen-space pass
 * after everything.
 *
 * Every hook is optional. A direction that supplies none is a palette swap; `standard` is exactly
 * that, which is how the pre-existing look survives as one entry in the registry rather than as a
 * special case in the renderer.
 *
 * The frame budget is unchanged and non-negotiable: nothing a hook does may allocate per frame.
 * `paintTerrain` is the exception and only because it runs inside the cached layer, which rebuilds
 * on a size or revision change and not on a tick.
 */
import type { World } from '../../engine/index.ts';
import type { BotPose } from '../timeline.ts';
import type { Biome, TileSet } from '../tiles.ts';

export type ArtId = 'standard' | 'survey' | 'signal' | 'deepsite';

export interface Palette {
  bgVoid: string;
  bgPanel: string;
  bgRaised: string;
  ink: string;
  inkDim: string;
  accent: string;
  accent2: string;
  danger: string;
  ok: string;
  gold: string;
  silver: string;
  bronze: string;
}

export interface BotColors {
  hullDark: string;
  hull: string;
  hullLight: string;
  rim: string;
  glass: string;
  tread: string;
  shadow: string;
}

export interface FxColors {
  dust: string;
  spark: string;
  chip: string;
  pulse: string;
  power: string;
  bad: string;
  good: string;
}

export interface OverlayColors {
  grid: string;
  gridMajor: string;
  goal: string;
  hover: string;
  vignette: string;
  outOfBounds: string;
}

/**
 * Line weights and cutoffs, all in *screen* pixels and multiplied by `dpr` at the call site.
 *
 * These were magic numbers spread across `overlays.ts`. They are here because grid weight is the
 * single biggest legibility lever in the renderer — `AUDIT-UI.md` F6 is entirely about the grid
 * being a 1-device-pixel hairline at 18% alpha, which on a 2x display is half a CSS pixel.
 */
export interface Metrics {
  /** Minor grid line, screen px. */
  gridWidth: number;
  /** Every fifth line. */
  gridMajorWidth: number;
  /** Below this tile size the grid is hidden entirely. Screen px. */
  gridMinTilePx: number;
  /** Board outline. */
  outlineWidth: number;
  /** Below this screen tile size bots draw as the far-zoom form. */
  botDetailTilePx: number;
}

/**
 * The visited-tile ramp, as a property of the direction rather than of one background colour.
 *
 * FIX-TRAIL §7 fixed a real bug — the first ramp ran `inkDim` to `danger`, and `inkDim` is within
 * a few points of the World 4 cave floor, so the cold end drew nothing at all. The fix was to make
 * the cold end a *darkening*, and the regression test pinned the literal `rgba(10, 14, 20` that a
 * darkening happened to produce.
 *
 * That literal is the lesson written down one direction too narrowly. On a paper board a
 * darkening is still right; on a near-black phosphor board a darkening is invisible for exactly
 * the reason `inkDim` was. The invariant that actually holds in every case is the one the §7
 * write-up argues for in prose — *luminance first, hue second* — so it is expressed here as a
 * contrast requirement against the floor the direction paints, and the test checks that instead.
 */
export interface TrailRamp {
  /** Colour at `TRAIL_MIN_VISITS`. Must contrast with `referenceFloor` — either way. */
  cold: string;
  /** Colour at `TRAIL_HOT_VISITS` and beyond. */
  hot: string;
  minAlpha: number;
  maxAlpha: number;
}

export interface TerrainPaint {
  ctx: CanvasRenderingContext2D;
  world: World;
  /** Cache resolution, device px per tile. Not the on-screen tile size. */
  tilePx: number;
  biome: Biome;
  tiles: TileSet;
  width: number;
  height: number;
}

/**
 * The three live layers a direction may take over, one interface each.
 *
 * Terrain is cached and machines, crops and items are not — maturity is derived from the tick
 * (ENGINE.md §6.4) and a machine's state changes without a rebuild — so these cannot ride the
 * `paintTerrain` hook and need a contract of their own. Until they had one, a direction that
 * rewrote the ground still had 48 px atlas sprites standing on it, which is the half-committed
 * board `docs/FIX-SPRITES.md` was opened against.
 *
 * Each is passed as one object the renderer owns and rewrites in place per call. A painter reads
 * it and returns; retaining it captures the next machine's values. That is the same
 * nothing-allocates rule the rest of the draw path runs under, expressed as a single object
 * rather than as eight positional arguments that would each have to be threaded through.
 */
export interface MachinePaint {
  ctx: CanvasRenderingContext2D;
  /** Tile coordinates. Multiply by `tilePx` for the cell's top-left corner. */
  x: number;
  y: number;
  /** On-screen tile size, device px. Every "is there room for this" test is in screen px. */
  tilePx: number;
  /** `MachineKind`. Ten of them, and a player links, powers and transmits to a named one. */
  kind: string;
  /** 'idle' | 'on' | 'off' | 'open' | 'closed' | 'busy', stable per kind. */
  state: string;
  /** `on`, `open` or `busy`. The one bit of machine state every kind shares. */
  powered: boolean;
  /** `Dir`, or -1 where the level did not author one. */
  facing: number;
  time: number;
  dpr: number;
  /**
   * Honour `prefers-reduced-motion`. Every tell has to survive it.
   *
   * A machine that says "running" only by pulsing says nothing at all to a player who has asked
   * the system for stillness, and `powered` is the one state every kind carries. So the flag is
   * on all three bags rather than on the bot alone: the ripe pip, the busy lamp and the item bob
   * are each a motion a direction might reach for, and each needs a still form.
   */
  reduced: boolean;
}

/**
 * One crop tile.
 *
 * `stage` is bucketed by the renderer against `PLANT_STAGES` rather than by the direction: the
 * six-step ladder is the thing DESIGN.md §11 A5 requires to be visually distinct, and a direction
 * that re-derived it could quietly ship five steps. `ripe` is the bit w2-02 is played on and is
 * handed over separately, because `stage === stages - 1` is true for authored-grown tiles whose
 * `max` is zero as well, and both of those really are ready to harvest.
 */
export interface CropPaint {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  tilePx: number;
  growth: number;
  max: number;
  /** Bucket index, 0..`stages - 1`. */
  stage: number;
  stages: number;
  /** Harvestable now. The distinction w2-02 cannot be solved without. */
  ripe: boolean;
  time: number;
  dpr: number;
  reduced: boolean;
}

export interface ItemPaint {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  tilePx: number;
  /** `ItemKind`. */
  kind: string;
  /** Stack size. Above one the painter owns the count badge as well. */
  count: number;
  time: number;
  dpr: number;
  reduced: boolean;
}

/**
 * Everything a bot painter is told about one bot on one frame.
 *
 * Declared here rather than in `sprites.ts` and re-exported from there: a direction has to name
 * this type to implement `drawBot`, and the registry only stays acyclic while a direction takes
 * nothing but types from the modules above it. The pose itself comes from `timeline.ts`, which is
 * a pure module and imports neither.
 */
export interface BotDrawOptions {
  accent: string;
  /** Seconds since the renderer started. Drives the idle bob and the light flicker. */
  time: number;
  /** Highlight the bot the UI considers selected. */
  active: boolean;
  /** Items in the bot's inventory; drives the little cargo pip. */
  carrying: number;
  /** 0..1, drawn as a gauge ring only when the level uses fuel. */
  fuel: number;
  showFuel: boolean;
  /** Draw the bot id when there is room for it. */
  showLabel: boolean;
  /**
   * 0..1 by playback speed. Adds the speed lines that make a 200-tick solution at 8x read as
   * *fast* rather than as *jerky*. Zero at ordinary speeds and under reduced motion.
   */
  rush: number;
  /** Honour `prefers-reduced-motion`: no smear, no sway, no shimmy. Every tell stays. */
  reduced: boolean;
  /** Device pixel ratio. Every "is there room for this" threshold is in *screen* pixels. */
  dpr: number;
}

export interface BackdropPaint {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  time: number;
}

export interface PostPaint extends BackdropPaint {
  /** True while the board is a still, pre-run survey rather than a replay. */
  preview: boolean;
  reducedMotion: boolean;
  /**
   * The world transform, so a screen-space pass can say where a tile is.
   *
   * `AUDIT-UI` F6 is "no axis labels, no ruler, no coordinate readout", and a direction that
   * answers it inside the cached terrain layer answers it only above the zoom where the numbers
   * still have a body — which is not the zoom the big boards are played at. These are the same
   * snapped device-pixel values the renderer sets on the context, so a mark placed with them
   * lands on the tile it names.
   */
  originX: number;
  originY: number;
  /** On-screen tile size, device px. Zero when the frame drew no board at all. */
  tilePx: number;
  /** Extent of the board the origin refers to, in tiles. Zero alongside `tilePx`. */
  cols: number;
  rows: number;
}

export interface ArtDirection {
  readonly id: ArtId;
  readonly label: string;
  readonly palette: Palette;
  readonly bot: BotColors;
  readonly fxColors: FxColors;
  readonly overlay: OverlayColors;
  readonly metrics: Metrics;
  /** Per-bot identity hues, indexed by `botId % length`. */
  readonly botAccents: readonly string[];
  readonly trail: TrailRamp;
  /**
   * The floor colour this direction actually paints, as the trail has to survive it.
   *
   * Not used for drawing. It is the value the trail ramp is calibrated against and the one the
   * regression test measures, so a direction that changes its floor and forgets its trail fails
   * the suite rather than shipping an invisible overlay.
   */
  readonly referenceFloor: string;
  /**
   * Takes over the cached terrain layer completely. When absent the atlas pipeline runs, which is
   * what `standard` does. A direction that implements this never touches the tile atlas.
   */
  paintTerrain?: (paint: TerrainPaint) => void;
  /**
   * Takes over both bot forms, the switch between them, and the bot's light.
   *
   * Both forms, because the near/far split is a claim about what survives at 24 device pixels and
   * every direction answers it differently — Survey keeps one silhouette and drops its interior,
   * Signal changes what the far form *says*. A direction that implemented only the detailed bot
   * would hand the zoom the game is actually played at back to the default chassis.
   *
   * The light too, because `drawHeadlight` is a `lighter`-composited radial gradient and that is
   * a statement about the medium: on paper there is no light to composite, and on a phosphor tube
   * the bloom in `post` already does it. A direction that draws its own bot draws its own lamp.
   *
   * Called once per bot per frame, in world space, with the same contract as the rest of
   * `sprites.ts`: nothing may allocate.
   */
  drawBot?: (
    ctx: CanvasRenderingContext2D,
    pose: BotPose,
    tilePx: number,
    options: BotDrawOptions,
  ) => void;
  /**
   * Takes over one machine, both zoom forms, its state tell and its lamp.
   *
   * When absent the atlas pipeline runs: `machineTileName` picks a frame and `sprites.ts` draws
   * the plate, the shadow and the `lighter`-composited glow. A direction that implements this
   * gets no atlas frame at all, so it owns machine *identity* — ten kinds that a level's link,
   * power and transmit verbs address by name, and any two of them that converge turn the level
   * into guesswork.
   */
  drawMachine?: (paint: MachinePaint) => void;
  /**
   * Takes over one crop tile, sprite and maturity readout both.
   *
   * The default path is the six-frame `PLANT_STAGES` ladder plus `drawPlantGauge`'s bar and ripe
   * ring. A direction that implements this replaces both, and inherits the constraint the ladder
   * exists for: w2-02 is unsolvable if ripe and unripe cannot be told apart at the tile size the
   * field is actually played at.
   */
  drawCrop?: (paint: CropPaint) => void;
  /**
   * Takes over one ground stack, count badge included.
   *
   * The default path is `drawGroundStack` — a soft shadow, an atlas frame, a bob and a numbered
   * pip. Eleven kinds, several of which differ only by hue on the atlas, which is a distinction
   * that does not survive a monochrome direction.
   */
  drawItem?: (paint: ItemPaint) => void;
  /** Fills behind the board before the world transform is applied. Screen space. */
  backdrop?: (paint: BackdropPaint) => void;
  /** Runs after everything, in screen space, still inside the canvas. */
  post?: (paint: PostPaint) => void;
}
