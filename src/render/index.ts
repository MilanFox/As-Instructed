/**
 * Public surface of the Canvas2D trace player.
 *
 * The UI imports from `src/render` and nothing deeper. The renderer never touches the Sim: hand it
 * a `Trace` and a tick and it draws that tick (DESIGN.md §3).
 *
 * Minimal integration:
 *
 * ```ts
 * const renderer = new Renderer({ world: level.world, onHover: setReadout });
 * await renderer.mount(canvasElement);
 * renderer.setTrace(trace);
 * renderer.setHighlights(padCells(trace.initialWorld));
 * renderer.play(4);          // 4 engine ticks per second
 * renderer.seek(3.5);        // fractional ticks are legal and interpolate
 * renderer.dispose();
 * ```
 */

export { Renderer, DEFAULT_SPEED } from './renderer.ts';
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
  CONVEYOR_PHASES,
  PLANT_STAGES,
  ORE_STAGES,
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
export type { AtlasFrame, AtlasJson, Biome, BiomeArt, TerrainArt, TileSetOptions } from './tiles.ts';

export { ParticleSystem, FX_LAYER_OVER, FX_LAYER_UNDER } from './fx.ts';
export type { FxName, FxOptions } from './fx.ts';

export {
  BRACKET_CLOSED_PX,
  BRACKET_TIGHTEN_PX,
  bracketCloseness,
  describeTile,
  drawBrackets,
  drawCelebration,
  drawGoals,
  drawGrid,
  drawHover,
  drawPlantGauge,
  drawVignette,
  padCells,
} from './overlays.ts';
export type { TileReadout } from './overlays.ts';

export {
  BOT_DETAIL_TILE_PX,
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

export { BOT_ACCENTS, botAccent, palette, alpha, shade } from './theme.ts';
