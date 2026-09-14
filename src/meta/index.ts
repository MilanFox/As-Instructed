export type {
  CachedRun,
  Discrepancy,
  LevelFacts,
  LevelProfile,
  LibraryRevision,
  LibrarySave,
  ProgressFacts,
  PublishedFunction,
  RegressionEntry,
  RegressionRun,
  RegressionState,
} from './types.ts';

export { hashParts, hashText, runKey } from './hash.ts';

export type { LibraryStorage } from './save.ts';
export {
  LIBRARY_SAVE_KEY,
  LIBRARY_SAVE_VERSION,
  MAX_CACHE_ENTRIES,
  MAX_REVISIONS,
  emptyLibrary,
  lastKnownGoodRevision,
  loadLibrary,
  mergeLibrary,
  migrateLibrary,
  parseLibrary,
  recordRevision,
  revisionOf,
  toFragment,
  writeLibrary,
} from './save.ts';

export {
  DISCREPANCY,
  LIBRARY_EMPTY_STARTER,
  LIBRARY_FAILURE,
  LIBRARY_PANEL_HINT,
  MEDAL_WORDS,
  NO_EXPORTS_WARNING,
  PUBLISH,
  REFACTOR,
  REGRESSION,
  REPOSITORY_NAME,
  STRUCTURE,
  UNLOCK_MEMO,
  UNLOCK_NOTE,
} from './copy.ts';

export type { LibraryRequirement } from './unlock.ts';
export {
  LIBRARY_FIRST_WORLD,
  LIBRARY_REQUIREMENTS,
  LIBRARY_UNLOCK_LEVEL,
  isDeliveryNoteOwed,
  isLibraryUnlocked,
  nextRequirementAfter,
  requirementLevelCount,
  requirementsFor,
} from './unlock.ts';

export type { Declaration, PublishPlan, PublishRefusal, PublishSelection } from './publish.ts';
export {
  closureOf,
  isValidName,
  libraryExportNames,
  libraryRefusals,
  planPublication,
  publishableDeclarations,
  renameIdentifier,
  withLibraryImport,
} from './publish.ts';

export type { CallerFact, FunctionReport, MedalUpgrade, Projection } from './profile.ts';
export {
  bestProjection,
  buildReports,
  medalThresholds,
  projectSavings,
  projectedTicks,
  upgradeSummary,
} from './profile.ts';

export type { LibraryFunction, LibraryStructure, StructureRow } from './structure.ts';
export { buildStructure } from './structure.ts';

export type {
  CompletedWorkOrder,
  LevelInHand,
  LibraryReaders,
  MetaRunOutcome,
  MetaRunRequest,
  MetaRunner,
  RegressionSummary,
  RegressionTarget,
  SuiteOptions,
  SuiteResult,
} from './regression.ts';
export {
  applySuite,
  cachedRun,
  keyFor,
  needsAttention,
  runSuite,
  summarise,
  summaryLine,
  withCachedRun,
} from './regression.ts';

export type { DiscrepancyCandidate, ProbeResult } from './discrepancy.ts';
export {
  COMPLETIONS_PER_DISCREPANCY,
  MIN_CLOSED_BEFORE_FIRST,
  offScheduleSeeds,
  openDiscrepancies,
  patchDiscrepancy,
  pickCandidate,
  probe,
  shouldProbe,
  unsettledDiscrepancies,
  withDiscrepancy,
} from './discrepancy.ts';

export { auditSeedsOf, bindAuditSeeds } from './campaign.ts';

export type { RunnerLike } from './adapters.ts';
export { createMetaRunner, libraryHashOf, prepareLibrary, toOutcome } from './adapters.ts';

export type { MetaHost, MetaPanel, MetaState, PublishOffer } from './store.ts';
export { suiteSummary, useLibrary } from './store.ts';
