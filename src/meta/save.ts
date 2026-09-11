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

export const LIBRARY_SAVE_KEY = 'bootstrap.library';
export const LIBRARY_SAVE_VERSION = 1;

export const MAX_REVISIONS = 40;
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

export function lastKnownGoodRevision(save: LibrarySave): LibraryRevision | undefined {
  if (save.lastKnownGood === undefined) return undefined;
  return save.revisions.find((revision) => revision.id === save.lastKnownGood);
}

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

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

export function toFragment(save: LibrarySave): LibrarySave {
  return { ...save, version: LIBRARY_SAVE_VERSION };
}

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
