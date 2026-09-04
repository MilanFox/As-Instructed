/**
 * Public surface of the metagame — the Shared Subroutines Repository.
 *
 * The host imports from here and nothing deeper. See `docs/LIBRARY.md` for what is built, what is
 * specified but not yet built, and where each component is meant to mount.
 */

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
  UNLOCK_MEMO,
  UNLOCK_NOTE,
} from './copy.ts';

export { LIBRARY_REQUIREMENTS, LIBRARY_UNLOCK_LEVEL, isLibraryUnlocked, requirementsFor } from './unlock.ts';
