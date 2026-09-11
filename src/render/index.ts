export { Renderer, DEFAULT_SPEED, restingPose } from './renderer.ts';
export type {
  CelebrationKind,
  CelebrationOptions,
  FrameInfo,
  RendererOptions,
} from './renderer.ts';

export {
  Camera,
  ZOOM_LADDER,
  MAX_FIT_CSS_TILE_PX,
  MAX_FOCUS_PX,
  MAX_KICK_PX,
  snapTilePx,
  ladderIndex,
} from './camera.ts';
export type { CameraOptions, CameraBounds, ViewRange } from './camera.ts';

export {
  TileSet,
  TILE_PX,
  TILE_VOCABULARY,
  CODE_TILE_NAMES,
  PLANT_STAGES,
  biomeArt,
  biomeForWorld,
  itemTileName,
  machineTileName,
  missingFrames,
  parseAtlas,
  plantStageIndex,
  plantStageName,
  terrainArt,
} from './tiles.ts';
export type {
  AtlasFrame,
  AtlasJson,
  Biome,
  BiomeArt,
  TerrainArt,
  TileSetOptions,
} from './tiles.ts';

export { ParticleSystem, FX_LAYER_OVER, FX_LAYER_UNDER } from './fx.ts';
export type { FxName, FxOptions } from './fx.ts';

export {
  BADGE_VARS,
  BRACKET_CLOSED_PX,
  BRACKET_TIGHTEN_PX,
  badgeVarKey,
  bandCursor,
  bandLines,
  bracketCloseness,
  describeTile,
  drawBuffer,
  drawCrank,
  drawTether,
  drawVarBadge,
  drawBrackets,
  drawCelebration,
  drawGoals,
  drawGrid,
  drawHover,
  drawPlantGauge,
  drawSpoiling,
  drawSprouting,
  drawStageRing,
  drawVignette,
  padCells,
  ripeFor,
} from './overlays.ts';
export type { TileReadout } from './overlays.ts';

export {
  botDetailTilePx,
  drawBot,
  drawGroundStack,
  drawHeadlight,
  drawMachine,
  drawTreads,
  facingAngle,
} from './sprites.ts';
export type { BotDrawOptions } from './sprites.ts';

export {
  BotTimeline,
  TraceTimeline,
  ANTICIPATION,
  BUMP_DISTANCE,
  SETTLE_TICKS,
  TREAD_FADE_TICKS,
  anticipationAt,
  blockedFlash,
  bumpCurve,
  createPose,
  moveStretch,
  recoilAt,
  revisionAt,
  settleCurve,
} from './timeline.ts';
export type { BotPose, BotSegment, TickIndex } from './timeline.ts';

export { TerrainLayer, cacheTilePxFor, keysEqual } from './terrain.ts';
export type { TerrainKey } from './terrain.ts';

export { VisitTrail, TRAIL_MIN_VISITS, TRAIL_MAX_VISITS, trailFill } from './trail.ts';

export { BOT_ACCENTS, botAccent, palette, alpha, mix, shade } from './theme.ts';
export type { ArtId } from './theme.ts';
