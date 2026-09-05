/**
 * Public surface of the deterministic simulation core.
 *
 * Every other domain (`src/levels`, `src/runtime`, `src/render`, `src/ui`, `src/game`) imports
 * from `src/engine` and nothing deeper. Nothing in here touches a browser API — the whole module
 * runs unchanged in Node under Vitest.
 *
 * See docs/ENGINE.md for the integration guide.
 */

export type {
  Vec,
  Tile,
  Bot,
  World,
  Machine,
  Message,
  ItemStack,
  GroundStack,
  TerrainProps,
} from './types.ts';
export { Dir, Terrain, ItemKind, MachineKind, MANUAL_ONLY, ALL_DIRS, usesFuel } from './types.ts';

export type { RngState } from './rng.ts';
export { Rng } from './rng.ts';

export type { CostTable, CostOverrides } from './costs.ts';
export { DEFAULT_COSTS, resolveCosts } from './costs.ts';

export type { CreateWorldOptions, CreateBotOptions } from './world.ts';
export {
  TERRAIN_PROPS,
  addBot,
  addGroundItems,
  addMachine,
  addToInventory,
  botAt,
  botById,
  cloneBot,
  cloneMachine,
  cloneTile,
  cloneWorld,
  countItemsAt,
  createWorld,
  dirBetween,
  dirDelta,
  dirName,
  enqueueMessage,
  eq,
  inBounds,
  indexOf,
  inventoryCount,
  isPassable,
  itemsAt,
  livingBots,
  machineAt,
  machineById,
  makespan,
  manhattan,
  neighbors,
  opposite,
  paintAscii,
  rebuildOccupancy,
  reviveWorld,
  removeFromInventory,
  removeGroundItems,
  setTerrain,
  setTile,
  step,
  terrainProps,
  tileAt,
  vec,
} from './world.ts';

export type {
  Trace,
  TraceEvent,
  TraceEventKind,
  Keyframe,
  MoveEvent,
  TurnEvent,
  WaitEvent,
  SyncEvent,
  GatherEvent,
  HarvestEvent,
  MineEvent,
  PlantEvent,
  TransferEvent,
  PickupEvent,
  DropEvent,
  ActEvent,
  UseEvent,
  MarkEvent,
  SpawnEvent,
  DieEvent,
  SendEvent,
  RecvEvent,
  PrintEvent,
  TileChangeEvent,
  MachineChangeEvent,
  ObjectiveEvent,
  FxEvent,
} from './trace.ts';
export type { RefuelEvent, SenseEvent, SpendEvent } from './trace.ts';
export {
  FUEL_BURNING,
  KEYFRAME_INTERVAL,
  MAX_SENSE_EVENTS,
  TraceBuilder,
  applyEvent,
  eventIndexAt,
  printsUpTo,
  replayTo,
  reviveTrace,
  senseTotals,
} from './trace.ts';

export type { SimOptions, TileView, MachineView } from './sim.ts';
export {
  DEFAULT_GROW_TIME,
  DEFAULT_LIVELOCK_ROUNDS,
  DEFAULT_MAX_OPS,
  DEFAULT_MAX_TICKS,
  Sim,
  describeBlock,
  maturity,
} from './sim.ts';

export type {
  Comparison,
  CustomReport,
  Divergence,
  Objective,
  ObjectiveContext,
  ObjectiveOptions,
  ObjectiveReport,
} from './objectives.ts';
export {
  DIVERGENCE_VALUE_CHARS,
  NOTHING,
  clipValue,
  compare,
  evaluateObjectives,
  hasTerrain,
} from './objectives.ts';
/**
 * Objective builders live behind a namespace on purpose: `Objectives.botAt(pad)` is the objective,
 * `botAt(world, pos)` is the world query, and having both flat would be a trap.
 */
export * as Objectives from './objectives.ts';

export type { Verdict, VerdictInput } from './verdict.ts';
export {
  BONUS_STAR_WEIGHT,
  MEDAL_WEIGHT,
  Medal,
  SILVER_FACTOR,
  buildVerdict,
  medalFor,
} from './verdict.ts';

export {
  FailureCode,
  HaltError,
  IllegalActionError,
  LivelockError,
  OpLimitError,
  OutOfFuelError,
  SimError,
  isSimError,
} from './errors.ts';
