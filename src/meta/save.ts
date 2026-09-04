import { Medal } from '../engine/index.ts';
import { LIBRARY_EMPTY_STARTER } from './copy.ts';
import { hashText } from './hash.ts';
import type {
  CachedRun,
  Discrepancy,
  LevelProfile,
  LibraryRevision,
  LibrarySave,
  PublishedFunction,
} from './types.ts';

/**
 * Persistence for the Shared Subroutines Repository.
 *
 * A separate `localStorage` key from `bootstrap.save`, on purpose. The campaign save is owned by
 * the UI agent and versioned on its own clock; nesting the library inside it would make every
 * library change a coordinated migration across two owners, and the first time those two clocks
 * disagreed somebody's `lib.ts` would be the thing that got dropped. Two keys, two version
 * numbers, one rule:
 *
 * **No read path may discard source.** `migrate` rescues the current `lib.ts` and every revision
 * it can recognise before it gives up on anything else. A save from a *newer* build keeps its
 * code too — a downgrade costs cached numbers, never writing.
 *
 * `toFragment` / `fromFragment` exist so the integrator can also carry the library inside the
 * campaign's JSON export without this module having to know that the campaign save exists.
 */

export const LIBRARY_SAVE_KEY = 'bootstrap.library';
export const LIBRARY_SAVE_VERSION = 1;

/** Revisions are the only way back from a bad edit, so the cap is generous and drops the oldest. */
export const MAX_REVISIONS = 40;
/** Cached verdicts are pure derived data; the cap can be tight. */
export const MAX_CACHE_ENTRIES = 400;

export function emptyLibrary(): LibrarySave {
  return {
    version: LIBRARY_SAVE_VERSION,
    unlocked: false,
    briefed: false,
    source: LIBRARY_EMPTY_STARTER,
    revisions: [],
    published: [],
    profiles: {},
    cache: {},
    discrepancies: [],
    publishDeclined: [],
    publishMuted: false,
    discrepanciesMuted: false,
    updatedAt: Date.now(),
  };
}

export function revisionOf(
  source: string,
  reason: LibraryRevision['reason'],
  extra: { fromLevel?: string; added?: string[] } = {},
): LibraryRevision {
  const revision: LibraryRevision = { id: hashText(source), source, at: Date.now(), reason };
  if (extra.fromLevel !== undefined) revision.fromLevel = extra.fromLevel;
  if (extra.added !== undefined) revision.added = extra.added;
  return revision;
}

/** Appends a revision, unless the source is byte-identical to the newest one. */
export function recordRevision(save: LibrarySave, revision: LibraryRevision): LibrarySave {
  const newest = save.revisions[save.revisions.length - 1];
  if (newest && newest.id === revision.id) return save;
  const revisions = [...save.revisions, revision];
  return {
    ...save,
    source: revision.source,
    revisions: revisions.slice(Math.max(0, revisions.length - MAX_REVISIONS)),
    updatedAt: Date.now(),
  };
}

/** The revision the player would be restored to. Undefined when nothing has been verified yet. */
export function lastKnownGoodRevision(save: LibrarySave): LibraryRevision | undefined {
  if (save.lastKnownGood === undefined) return undefined;
  return save.revisions.find((revision) => revision.id === save.lastKnownGood);
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/**
 * One entry per version step, keyed by the version being migrated *from*.
 *
 * Version 0 is anything unversioned — including, deliberately, a bare string, because the very
 * first thing a hand-edited export or a truncated write is likely to leave behind is the source
 * on its own.
 */
const MIGRATIONS: Record<number, Migration> = {};

export function migrateLibrary(raw: unknown): LibrarySave {
  if (typeof raw === 'string') return { ...emptyLibrary(), source: raw, unlocked: raw.length > 0 };
  if (!isRecord(raw)) return emptyLibrary();

  let working: Record<string, unknown> = raw;
  let version = isCount(working['version']) ? working['version'] : 0;
  while (version < LIBRARY_SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) break;
    working = step(working);
    version = isCount(working['version']) ? working['version'] : version + 1;
  }

  const base = emptyLibrary();
  const revisions = rescueRevisions(working['revisions']);
  const source =
    typeof working['source'] === 'string'
      ? working['source']
      : (revisions[revisions.length - 1]?.source ?? base.source);

  const save: LibrarySave = {
    version: LIBRARY_SAVE_VERSION,
    unlocked: working['unlocked'] === true,
    briefed: working['briefed'] === true,
    source,
    revisions,
    published: rescuePublished(working['published']),
    profiles: rescueProfiles(working['profiles']),
    cache: rescueCache(working['cache']),
    discrepancies: rescueDiscrepancies(working['discrepancies']),
    publishDeclined: stringsOf(working['publishDeclined']),
    publishMuted: working['publishMuted'] === true,
    discrepanciesMuted: working['discrepanciesMuted'] === true,
    updatedAt: isCount(working['updatedAt']) ? working['updatedAt'] : Date.now(),
  };
  const lastKnownGood = working['lastKnownGood'];
  if (typeof lastKnownGood === 'string') save.lastKnownGood = lastKnownGood;

  /* A library with code in it is unlocked whatever the flag says. The flag is a UI gate; the code
     is the player's. Never hide their writing behind a boolean that a bad write could clear. */
  if (!save.unlocked && (save.revisions.length > 0 || save.published.length > 0)) {
    save.unlocked = true;
  }
  return save;
}

function rescueRevisions(raw: unknown): LibraryRevision[] {
  if (!Array.isArray(raw)) return [];
  const revisions: LibraryRevision[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      revisions.push(revisionOf(entry, 'edit'));
      continue;
    }
    if (!isRecord(entry) || typeof entry['source'] !== 'string') continue;
    const source = entry['source'];
    const revision: LibraryRevision = {
      id: typeof entry['id'] === 'string' ? entry['id'] : hashText(source),
      source,
      at: isCount(entry['at']) ? entry['at'] : 0,
      reason: isReason(entry['reason']) ? entry['reason'] : 'edit',
    };
    if (typeof entry['fromLevel'] === 'string') revision.fromLevel = entry['fromLevel'];
    const added = stringsOf(entry['added']);
    if (added.length > 0) revision.added = added;
    revisions.push(revision);
  }
  return revisions.slice(Math.max(0, revisions.length - MAX_REVISIONS));
}

function rescuePublished(raw: unknown): PublishedFunction[] {
  if (!Array.isArray(raw)) return [];
  const published: PublishedFunction[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry['name'] !== 'string') continue;
    published.push({
      name: entry['name'],
      fromLevel: typeof entry['fromLevel'] === 'string' ? entry['fromLevel'] : '',
      at: isCount(entry['at']) ? entry['at'] : 0,
    });
  }
  return published;
}

function rescueProfiles(raw: unknown): Record<string, LevelProfile> {
  const profiles: Record<string, LevelProfile> = {};
  if (!isRecord(raw)) return profiles;
  for (const [levelId, entry] of Object.entries(raw)) {
    if (!isRecord(entry)) continue;
    profiles[levelId] = {
      levelId,
      key: typeof entry['key'] === 'string' ? entry['key'] : '',
      passed: entry['passed'] === true,
      ticks: isCount(entry['ticks']) ? entry['ticks'] : 0,
      medal: isMedal(entry['medal']) ? entry['medal'] : Medal.None,
      parTicks: isCount(entry['parTicks']) ? entry['parTicks'] : 0,
      usage: rescueUsage(entry['usage']),
      imports: stringsOf(entry['imports']),
      at: isCount(entry['at']) ? entry['at'] : 0,
    };
  }
  return profiles;
}

function rescueUsage(raw: unknown): LevelProfile['usage'] {
  const usage: LevelProfile['usage'] = { ticks: 0, calls: {} };
  if (!isRecord(raw)) return usage;
  if (isCount(raw['ticks'])) usage.ticks = raw['ticks'];
  if (isRecord(raw['calls'])) {
    for (const [name, entry] of Object.entries(raw['calls'])) {
      if (!isRecord(entry)) continue;
      usage.calls[name] = {
        calls: isCount(entry['calls']) ? entry['calls'] : 0,
        ticks: isCount(entry['ticks']) ? entry['ticks'] : 0,
      };
    }
  }
  return usage;
}

function rescueCache(raw: unknown): Record<string, CachedRun> {
  const cache: Record<string, CachedRun> = {};
  if (!isRecord(raw)) return cache;
  const entries = Object.entries(raw).slice(-MAX_CACHE_ENTRIES);
  for (const [key, entry] of entries) {
    if (!isRecord(entry) || typeof entry['levelId'] !== 'string') continue;
    cache[key] = {
      key,
      levelId: entry['levelId'],
      passed: entry['passed'] === true,
      ticks: isCount(entry['ticks']) ? entry['ticks'] : 0,
      medal: isMedal(entry['medal']) ? entry['medal'] : Medal.None,
      usage: rescueUsage(entry['usage']),
      at: isCount(entry['at']) ? entry['at'] : 0,
    };
  }
  return cache;
}

function rescueDiscrepancies(raw: unknown): Discrepancy[] {
  if (!Array.isArray(raw)) return [];
  const found: Discrepancy[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry['levelId'] !== 'string') continue;
    const discrepancy: Discrepancy = {
      id: typeof entry['id'] === 'string' ? entry['id'] : `${entry['levelId']}-${found.length}`,
      levelId: entry['levelId'],
      seed: isCount(entry['seed']) ? entry['seed'] : 0,
      raisedAt: isCount(entry['raisedAt']) ? entry['raisedAt'] : 0,
    };
    if (entry['seen'] === true) discrepancy.seen = true;
    if (entry['closed'] === true) discrepancy.closed = true;
    if (entry['resolved'] === true) discrepancy.resolved = true;
    found.push(discrepancy);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export interface LibraryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): LibraryStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function parseLibrary(text: string): LibrarySave {
  try {
    return migrateLibrary(JSON.parse(text) as unknown);
  } catch {
    /* Not JSON. The likeliest reason is that it is the source itself, so keep it. */
    return migrateLibrary(text);
  }
}

export function loadLibrary(storage: LibraryStorage | null = defaultStorage()): LibrarySave {
  if (!storage) return emptyLibrary();
  let text: string | null = null;
  try {
    text = storage.getItem(LIBRARY_SAVE_KEY);
  } catch {
    return emptyLibrary();
  }
  return text ? parseLibrary(text) : emptyLibrary();
}

export function writeLibrary(
  save: LibrarySave,
  storage: LibraryStorage | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(LIBRARY_SAVE_KEY, JSON.stringify({ ...save, updatedAt: Date.now() }));
  } catch {
    /* A full quota must never interrupt play. The in-memory copy is still correct. */
  }
}

/** The library as a value the campaign's JSON export can carry alongside its own fields. */
export function toFragment(save: LibrarySave): LibrarySave {
  return { ...save, version: LIBRARY_SAVE_VERSION };
}

/**
 * Merges an imported library into the current one. Incoming source wins, because import is an
 * explicit act — but every revision from both sides is kept, so nothing the player wrote is lost
 * by importing a save that happened to be older.
 */
export function mergeLibrary(current: LibrarySave, incoming: unknown): LibrarySave {
  const next = migrateLibrary(incoming);
  const byId = new Map<string, LibraryRevision>();
  for (const revision of [...current.revisions, ...next.revisions]) byId.set(revision.id, revision);
  const revisions = [...byId.values()].sort((a, b) => a.at - b.at).slice(-MAX_REVISIONS);

  return {
    ...next,
    revisions,
    published: dedupePublished([...current.published, ...next.published]),
    publishDeclined: [...new Set([...current.publishDeclined, ...next.publishDeclined])],
    unlocked: current.unlocked || next.unlocked,
    briefed: current.briefed || next.briefed,
    version: LIBRARY_SAVE_VERSION,
    updatedAt: Date.now(),
  };
}

function dedupePublished(entries: readonly PublishedFunction[]): PublishedFunction[] {
  const byName = new Map<string, PublishedFunction>();
  for (const entry of entries) {
    const existing = byName.get(entry.name);
    if (!existing || entry.at > existing.at) byName.set(entry.name, entry);
  }
  return [...byName.values()];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isMedal(value: unknown): value is Medal {
  return value === 'gold' || value === 'silver' || value === 'bronze' || value === 'none';
}

function isReason(value: unknown): value is LibraryRevision['reason'] {
  return value === 'seed' || value === 'publish' || value === 'edit' || value === 'revert';
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
