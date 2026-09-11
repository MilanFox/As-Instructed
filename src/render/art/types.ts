import type { World } from '../../engine/index.ts';
import type { BotPose } from '../timeline.ts';
import type { Biome, TileSet } from '../tiles.ts';

export type ArtId = 'standard' | 'signal' | 'deepsite';

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

export interface Metrics {
  gridWidth: number;
  gridMajorWidth: number;
  gridMinTilePx: number;
  outlineWidth: number;
  botDetailTilePx: number;
}

export interface TrailRamp {
  cold: string;
  hot: string;
  minAlpha: number;
  maxAlpha: number;
}

export interface TerrainPaint {
  ctx: CanvasRenderingContext2D;
  world: World;
  tilePx: number;
  biome: Biome;
  tiles: TileSet;
  width: number;
  height: number;
}

export interface MachinePaint {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  tilePx: number;
  kind: string;
  state: string;
  powered: boolean;
  facing: number;
  time: number;
  dpr: number;
  reduced: boolean;
}

export interface CropPaint {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  tilePx: number;
  kind: string;
  growth: number;
  max: number;
  stage: number;
  stages: number;
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
  kind: string;
  count: number;
  time: number;
  dpr: number;
  reduced: boolean;
}

export interface BotDrawOptions {
  accent: string;
  time: number;
  active: boolean;
  carrying: number;
  fuel: number;
  showFuel: boolean;
  showLabel: boolean;
  rush: number;
  reduced: boolean;
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
  preview: boolean;
  reducedMotion: boolean;
  originX: number;
  originY: number;
  tilePx: number;
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
  readonly botAccents: readonly string[];
  readonly trail: TrailRamp;
  readonly referenceFloor: string;
  paintTerrain?: (paint: TerrainPaint) => void;
  drawBot?: (
    ctx: CanvasRenderingContext2D,
    pose: BotPose,
    tilePx: number,
    options: BotDrawOptions,
  ) => void;
  drawMachine?: (paint: MachinePaint) => void;
  drawCrop?: (paint: CropPaint) => void;
  drawItem?: (paint: ItemPaint) => void;
  backdrop?: (paint: BackdropPaint) => void;
  post?: (paint: PostPaint) => void;
}
